/**
 * Unit tests for the MoA runtime (src/agent/moaLoop.ts) — Hermes
 * agent/moa_loop.py MoAClient semantics, verified raw 2026-08-01 @ e444d16:
 * advisory view shaping, tool-result fold budget, guidance blocks (verbatim),
 * END-attach clone semantics, the cadence machine (user_turn / per_iteration
 * / every_n), disabled-preset and unknown-aggregator guards.
 */

const { execSync } = require("child_process");
const path = require("path");
const Module = require("module");

const out = path.join(__dirname, "dist", "moaLoop.cjs");
execSync(
	`npx esbuild src/agent/moaLoop.ts --bundle --platform=node --format=cjs --external:obsidian --outfile=${out}`,
	{ cwd: path.join(__dirname, ".."), stdio: "inherit" }
);

/* offline stub (same pattern as tools.test.cjs): the engine chain pulls in
   providers.ts → obsidian.requestUrl — never called in these pure checks */
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "obsidian") return "obsidian-mock";
	return originalResolve.call(this, request, ...args);
};
require.cache["obsidian-mock"] = {
	id: "obsidian-mock",
	filename: "obsidian-mock",
	loaded: true,
	exports: { requestUrl: async () => { throw new Error("offline"); }, Notice: class {}, normalizePath: (p) => p },
};

const m = require(out);

let failures = 0;
function check(name, cond) {
	if (cond) console.log(`ok — ${name}`);
	else {
		console.error(`FAIL — ${name}`);
		failures += 1;
	}
}
function eq(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
/* ---- 1. tool-result fold: head+tail with counted omission ---- */
{
	check("short result untouched", m.truncateMoaToolResult("abc") === "abc");
	const long = "x".repeat(5000);
	const t = m.truncateMoaToolResult(long);
	check(
		"4000 budget: 2000 head + counted marker + 2000 tail",
		t.startsWith("x".repeat(2000)) && t.endsWith("x".repeat(2000)) && t.includes("\n[... 1000 chars omitted ...]\n") && t.length === 4030
	);
}

/* ---- 2. tool_calls rendering ---- */
{
	const r = m.renderMoaToolCalls([
		{ function: { name: "read_note", arguments: '{"path":"a.md"}' } },
		{ function: { name: "ping", arguments: "" } },
		{ function: { name: "edit", arguments: { a: 1 } } },
	]);
	check(
		"string args verbatim, no-args bare, object args JSON",
		r === '[called tool: read_note({"path":"a.md"})]\n[called tool: ping]\n[called tool: edit({"a":1})]'
	);
	check("empty calls → empty line", m.renderMoaToolCalls(undefined) === "" && m.renderMoaToolCalls([]) === "");
}

/* ---- 3. advisory view shaping (_reference_messages) ---- */
{
	const view = m.referenceView([
		{ role: "system", content: "SYS-BOILERPLATE" },
		{ role: "user", content: "kerjakan alpha" },
		{ role: "assistant", content: "sebentar", tool_calls: [{ function: { name: "search_vault", arguments: '{"query":"alpha"}' } }] },
		{ role: "tool", tool_call_id: "c1", name: "search_vault", content: "HASIL-1" },
	]);
	check("system dropped", !view.some((x) => x.content.includes("SYS-BOILERPLATE")));
	check("tool result folds into the preceding assistant turn", view.some((x) => x.role === "assistant" && x.content.includes("sebentar\n[called tool: search_vault({\"query\":\"alpha\"})]\n[tool result: HASIL-1]")));
	check("view ends on the synthetic advisory request", view[view.length - 1].role === "user" && view[view.length - 1].content === m.MOA_ADVISORY_INSTRUCTION);

	const trailingUser = m.referenceView([{ role: "user", content: "halo" }]);
	check("already trailing user → no synthetic request", trailingUser.length === 1 && trailingUser[0].content === "halo");

	const dropped = m.referenceView([{ role: "user", content: "" }, { role: "user", content: "isi" }]);
	check("empty user turn dropped, alternation kept", dropped.length === 1 && dropped[0].content === "isi");

	const imageOnly = m.referenceView([{ role: "user", content: [{ type: "image_url", image_url: { url: "data:…" } }] }]);
	check("non-text user content → official placeholder", imageOnly.length === 1 && imageOnly[0].content === "[user sent non-text content (e.g. an image attachment)]");

	const leadTool = m.referenceView([{ role: "assistant", content: "" }, { role: "tool", content: "R" }]);
	/* …then the trailing-assistant rule appends the advisory request — the
	   same end-on-user guarantee as official */
	check(
		"empty assistant dropped; orphan tool gets its own assistant line (+ advisory tail)",
		leadTool.length === 2 && leadTool[0].role === "assistant" && leadTool[0].content === "[tool result: R]" && leadTool[1].role === "user" && leadTool[1].content === m.MOA_ADVISORY_INSTRUCTION
	);

	const fallback = m.referenceView([{ role: "user", content: "" }, { role: "user", content: "kembali" }, { role: "user", content: "" }]);
	check("all-dropped fallback returns the latest real user turn", fallback.length === 1 && fallback[0].content === "kembali");

	check("no bogus tool-role messages ever", !m.referenceView([{ role: "tool", content: "x" }, { role: "user", content: "y" }]).some((x) => x.role === "tool"));
}

/* ---- 4. labels, failure sentinels, degraded notice ---- */
{
	check("slot label without effort", m.moaSlotLabel({ provider: "lmstudio", model: "qwen", enabled: true }) === "lmstudio:qwen");
	check("slot label with effort", m.moaSlotLabel({ provider: "a", model: "b", enabled: true, reasoning_effort: "high" }) === "a:b[reasoning=high]");
	check("failed sentinel", m.isFailedMoaReference("  [failed: boom]") && m.isFailedMoaReference("[skipped: interrupted by user]"));
	check("real advice is not a failure", !m.isFailedMoaReference("[catatan] ini saran"));
	check("loud notice names every failed label", m.degradedMoaNotice(["a:1", "b:2"], "loud") === "[Reference models unavailable: a:1, b:2]");
	check("silent suppresses; empty suppresses", m.degradedMoaNotice(["a:1"], "silent") === "" && m.degradedMoaNotice([], "loud") === "");
}

/* ---- 5. guidance blocks (persistent facade, verbatim official) ---- */
{
	const agg = { provider: "openrouter", model: "anthropic/claude-opus-4.8", enabled: true };
	const ok1 = { label: "lmstudio:gemma", text: "saran satu" };
	const g = m.buildMoaGuidance("crew", agg, [ok1], "");
	const expected =
		"[Mixture of Agents reference context]\n" +
		"Preset: crew\n" +
		"Aggregator/acting model: openrouter:anthropic/claude-opus-4.8\n" +
		"References: lmstudio:gemma\n\n" +
		"Use the reference responses below as private context. You are the aggregator and acting model: answer the user directly or call tools as needed.\n\n" +
		"Reference 1 — lmstudio:gemma:\nsaran satu";
	check("guidance block verbatim", g === expected);
	const g2 = m.buildMoaGuidance("crew", agg, [ok1], "[Reference models unavailable: x:y]");
	check("degraded notice tail after joined refs", g2.endsWith("saran satu\n\n[Reference models unavailable: x:y]"));
	const g3 = m.buildMoaGuidance("crew", agg, [{ label: "a:1", text: "A" }, { label: "b:2", text: "B" }], "");
	check("joined refs re-number over successful only", g3.includes("Reference 1 — a:1:\nA\n\nReference 2 — b:2:\nB"));
	const allFail = m.buildMoaAllFailedGuidance("crew", agg, "[Reference models unavailable: a:1]");
	const expectedFail =
		"[Mixture of Agents reference context]\n" +
		"Preset: crew\n" +
		"Aggregator/acting model: openrouter:anthropic/claude-opus-4.8\n\n" +
		"All reference models failed this turn — no advisory guidance is available. Act on your own judgment.\n\n" +
		"[Reference models unavailable: a:1]";
	check("all-fail block verbatim", allFail === expectedFail);
}

/* ---- 6. END-attach, clone, alternation-safe ---- */
{
	const trailingString = m.attachMoaGuidance([{ role: "user", content: "tugas" }], "G");
	check("trailing user string → merged", trailingString.length === 1 && trailingString[0].content === "tugas\n\nG");
	const trailingParts = m.attachMoaGuidance([{ role: "user", content: [{ type: "text", text: "t" }] }], "G");
	check("trailing parts list → text part appended", trailingParts[0].content.length === 2 && trailingParts[0].content[1].text === "\n\nG");
	const trailingTool = m.attachMoaGuidance([{ role: "assistant", content: "a" }, { role: "tool", content: "r" }], "G");
	check("tool tail → separate user message", trailingTool.length === 3 && trailingTool[2].role === "user" && trailingTool[2].content === "G");
	const src = [{ role: "user", content: "asli" }];
	m.attachMoaGuidance(src, "G");
	check("input never mutated (official peels; we clone)", src[0].content === "asli");
}

/* ---- 7. the cadence machine ---- */
{
	const U = (t) => ({ role: "user", content: t });
	const A = (t) => ({ role: "assistant", content: t });
	/* user_turn: view grows mid-turn (trailing synthetic instruction) but the
	   turn PREFIX signature stays stable */
	const d1 = m.moaCadenceDecision("user_turn", [U("tugas")], { turnSig: null, stateSig: null, iterationCount: 0 });
	const d2 = m.moaCadenceDecision("user_turn", [U("tugas"), A("…"), U(m.MOA_ADVISORY_INSTRUCTION)], d1);
	check("user_turn prefix stops at the last REAL user message", eq(d1.turnPrefix, [U("tugas")]) && d2.turnSig === d1.turnSig);
	/* per_iteration: turnPrefix IS the full view */
	const dp = m.moaCadenceDecision("per_iteration", [U("tugas"), A("a")], { turnSig: null, stateSig: null, iterationCount: 0 });
	check("per_iteration sigs the full view", dp.turnPrefix.length === 2 && dp.onCadence === true);
	/* every_n:3 across tool iterations */
	let st = { turnSig: null, stateSig: null, iterationCount: 0 };
	const seq = [];
	st = m.moaCadenceDecision("every_n:3", [U("t")], st);
	seq.push([st.iterationCount, st.onCadence]);
	st = m.moaCadenceDecision("every_n:3", [U("t"), A("1")], st);
	seq.push([st.iterationCount, st.onCadence]);
	st = m.moaCadenceDecision("every_n:3", [U("t"), A("1"), A("2")], st);
	seq.push([st.iterationCount, st.onCadence]);
	const sameState = m.moaCadenceDecision("every_n:3", [U("t"), A("1"), A("2")], m.moaCadenceDecision("every_n:3", [U("t"), A("1"), A("2")], st).stateSig ? st : st); // repeat, identical view
	check(
		"every_n:3 iteration 1 on, 2–3 off",
		eq(seq, [
			[1, true],
			[2, false],
			[3, false],
		])
	);
	const st4 = m.moaCadenceDecision("every_n:3", [U("t"), A("1"), A("2")], st);
	check("identical state repeat does not eat a cadence slot", st4.iterationCount === 3 && st4.onCadence === false);
	const st5 = m.moaCadenceDecision("every_n:3", [U("t"), A("1"), A("2"), A("3")], st4);
	check("every_n:3 iteration 4 on-cadence again", st5.iterationCount === 4 && st5.onCadence === true);
	const st6 = m.moaCadenceDecision("every_n:3", [U("tugas-baru")], st5);
	check("new user turn resets the counter (iteration 1 on-cadence)", st6.iterationCount === 1 && st6.onCadence === true);
	const st7 = m.moaCadenceDecision("every_n:1", [U("t")], { turnSig: null, stateSig: null, iterationCount: 0 });
	check("every_n:1 collapses to per_iteration semantics", st7.onCadence === true);
}

/* ---- 8. engine guards that need no network ---- */
{
	const settings = {
		providers: [{ id: "lmstudio", name: "LM Studio", baseUrl: "http://x/v1", apiKey: "", enabled: true, customHeaders: {}, models: [] }],
		model: "gemma",
	};
	const preset = (over) => ({
		enabled: true,
		reference_models: [],
		aggregator: { provider: "lmstudio", model: "hermes", enabled: true },
		reference_temperature: null,
		aggregator_temperature: null,
		reference_timeout: null,
		degraded_reference_policy: "loud",
		max_tokens: 4096,
		reference_max_tokens: null,
		fanout: "user_turn",
		...over,
	});
	const wire = [{ role: "user", content: "halo" }];

	/* unknown aggregator provider → the clear, actionable error */
	const bad = new m.MoaTurnEngine({ presetName: "crew", preset: preset({ aggregator: { provider: "ghost", model: "x", enabled: true } }), settings });
	let msg = "";
	try {
		await bad.prepareIteration(wire);
	} catch (e) {
		msg = String(e.message ?? e);
	}
	check("unknown aggregator provider fails with actionable text", msg.includes('MoA aggregator provider "ghost" isn\'t configured') && msg.includes("Mixture of Agents"));

	/* disabled preset → aggregator acts alone, wire untouched, zero fan-out */
	const off = new m.MoaTurnEngine({
		presetName: "crew",
		preset: preset({ enabled: false, reference_models: [{ provider: "lmstudio", model: "qwen", enabled: true }] }),
		settings,
		emit: () => {
			throw new Error("disabled preset must not emit");
		},
	});
	const prep = await off.prepareIteration(wire);
	check("disabled preset: aggregator alone, no guidance, acting conn is the slot", prep.wire === wire && prep.model === "hermes" && prep.provider.id === "lmstudio");

	/* preset with zero enabled references → same alone path */
	const none = new m.MoaTurnEngine({ presetName: "crew", preset: preset({}), settings });
	const prep2 = await none.prepareIteration(wire);
	check("no enabled references: aggregator alone", prep2.wire === wire && prep2.model === "hermes");
}

	console.log(failures === 0 ? "\nALL MOA RUNTIME CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
	process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
