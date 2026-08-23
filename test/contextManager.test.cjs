/**
 * Context-manager unit tests (v0.1.17): estimator · window precedence ·
 * trigger · protected-boundary never splits tool exchanges · cache
 * apply/staleness · rolling summary prompt · aux-slot sanitize/resolve
 */

const { execSync } = require("child_process");
const path = require("path");

const out = path.join(__dirname, "dist", "contextManager.cjs");
execSync(
	`npx esbuild src/agent/contextManager.ts --bundle --platform=node --format=cjs --outfile=${out}`,
	{ cwd: path.join(__dirname, ".."), stdio: "inherit" }
);

const C = require(out);

let passed = 0;
let failed = 0;
function check(ok, label) {
	if (ok) {
		passed++;
		console.log(`✓ ${label}`);
	} else {
		failed++;
		console.error(`✗ ${label}`);
	}
}

const m = (role, content, extra = {}) => ({ role, content, ...extra });
const prov = (id, baseUrl = "http://x/v1") => ({ id, name: id, baseUrl, apiKey: "", enabled: true, customHeaders: {}, models: [] });

// typical history: u1 a1 u2 a2(tool_calls) t1 t2 u3 a3 u4 a4
const hist = [
	m("user", "u1"),
	m("assistant", "a1"),
	m("user", "u2"),
	m("assistant", "", { tool_calls: [{ id: "c1" }] }),
	m("tool", "r1", { tool_call_id: "c1" }),
	m("tool", "r2", { tool_call_id: "c2" }),
	m("user", "u3"),
	m("assistant", "a3"),
	m("user", "u4"),
	m("assistant", "a4"),
];

// ── estimator ────────────────────────────────────────────────────────
check(C.estimateTokens([m("user", "")]) === Math.ceil(4 / 4), "estimate: role chars counted even on empty content");
check(C.estimateTokens([m("user", "abcd"), m("assistant", "abcdefgh")]) === Math.ceil((4 + 4 + 9 + 8) / 4), "estimate: chars/4 over role+content");
check(C.estimateTokens([]) === 0, "estimate: empty → 0");

// ── window precedence ────────────────────────────────────────────────
check(C.resolveContextWindow(64000, 128000) === 64000, "window: explicit setting wins");
check(C.resolveContextWindow(0, 128000) === 128000, "window: advertised when setting is 0/auto");
check(C.resolveContextWindow(0, null) === 256000 && C.resolveContextWindow(0, 0) === 256000, "window: 256000 fallback without any metadata (Hermes parity)");

// ── trigger ──────────────────────────────────────────────────────────
check(C.shouldCompress(80, 100, 0.8) === true && C.shouldCompress(79, 100, 0.8) === false, "trigger: fires at threshold, holds below");
check(C.shouldCompress(100, 0, 0.8) === false, "trigger: broken window (0) never fires");

// ── protected boundary (tool exchanges never split) ──────────────────
{
	const s4 = C.pickProtectedStart(hist, 4);
	check(s4 === 6 && hist[s4].role === "user", "boundary protect 4 → starts at u3 (index 6)");
	const s3 = C.pickProtectedStart(hist, 3);
	check(s3 === 6, "boundary protect 3 → snaps down to u3, never inside the a4 tail");
	const s2 = C.pickProtectedStart(hist, 2);
	check(s2 === 8 && hist.slice(0, s2).every((x, i) => i < 8), "boundary protect 2 → u4 start; region ends on a3 (complete exchange)");
	const s1 = C.pickProtectedStart(hist, 1);
	check(s1 === 8, "boundary protect 1 → snaps to u4, keeps a4 + u4 side intact");
	check(C.pickProtectedStart(hist, 20) === 0, "boundary: protect ≥ length → 0 (nothing compressible)");
	check(C.pickProtectedStart([m("user", "only")], 4) === 0, "boundary: single message → 0");
	check(C.pickProtectedStart([], 4) === 0, "boundary: empty → 0");
}

// ── token-sized tail (Hermes target_ratio parity, v0.1.175) ─────────
{
	const t = C.pickTokenTailStart;
	check(t([], 100) === 0, "token tail: empty → 0");
	check(t(hist, 0) === hist.length, "token tail: zero budget → keep everything (start = length)");
	/* walk back from the end: a4 (role "assistant", ~10 chars) + u4 (5) +
	   a3 (3) … each estimate = ceil((role+content)/4). A budget larger than
	   the whole history must snap to 0. */
	check(t(hist, C.estimateTokens(hist)) === 0, "token tail: budget ≥ whole history → 0 (nothing compressible)");
	/* a budget that only the LAST message satisfies: start lands at the last
	   index, then snaps DOWN to the nearest user boundary before it. */
	const lastOnly = C.estimateTokens([hist[hist.length - 1]]);
	const s = t(hist, lastOnly);
	check(hist[s].role === "user", "token tail: snaps to a user-message boundary");
	check(s < hist.length, "token tail: leaves a non-empty verbatim tail");
	/* single user message with a big budget → start 0 (keep it) */
	check(t([m("user", "only")], 999) === 0, "token tail: single message, big budget → 0");
}

// ── cache apply + staleness ──────────────────────────────────────────
{
	const cache = { summary: "S", upto: 3, model: "p/m", at: 1 };
	const applied = C.applyCompressionCache(hist, cache);
	check(applied.length === 1 + (hist.length - 3), "apply: note + tail only");
	check(applied[0].role === "system" && applied[0].content.includes(C.COMPRESSION_NOTE_PREFIX) && applied[0].content.includes("S"), "apply: note carries prefix + summary");
	check(applied[1].content === "a2" || applied[1].role === "assistant", "apply: tail resumes at upto");
	check(C.validCompressionCache(2, cache) === null, "stale: history cut below upto → cache dropped (/retry, /new)");
	check(C.applyCompressionCache(hist, { summary: "  ", upto: 3 }) === hist, "stale: blank summary → no-op");
	check(C.applyCompressionCache(hist, null) === hist, "no cache → identity");
}

// ── summary prompt (rolling) ─────────────────────────────────────────
{
	const fresh = C.buildSummaryPrompt([m("user", "hi"), m("assistant", "hello")], null);
	check(fresh.includes("Summarize the conversation") && fresh.includes("USER: hi") && fresh.includes("ASSISTANT: hello"), "prompt: fresh summarizes the region verbatim");
	const rolling = C.buildSummaryPrompt([m("user", "next")], "previous summary");
	check(rolling.includes("previous summary") && rolling.includes("Fold the conversation below") && rolling.includes("ONE coherent"), "prompt: rolling folds into the prior summary, rewritten as one");
}

// ── aux slots: sanitize + resolve ────────────────────────────────────
{
	const providers = [prov("a"), prov("b", "")];
	const s = C.sanitizeAuxModels(
		{ compression: { providerId: "a", model: " m1 " }, titleGeneration: { providerId: "b", model: "x" }, goalJudge: { providerId: "a", model: "g1" }, junk: { providerId: "a", model: "y" } },
		providers
	);
	check(JSON.stringify(s.compression) === JSON.stringify({ providerId: "a", model: "m1" }), "sanitize: valid pin kept, model trimmed");
	check(s.titleGeneration === null, "sanitize: provider without base URL → back to auto");
	check(!("junk" in s), "sanitize: unknown slot keys dropped");
	check(
		JSON.stringify(C.sanitizeAuxModels(null, providers)) ===
			JSON.stringify({ compression: null, titleGeneration: null, goalJudge: null, webExtract: null, vision: null }),
		"sanitize: junk raw → all-auto shape (v0.1.134 amended: vision is the FIFTH known slot — pin diperbarui saat slot ditambah)"
	);
	check(C.sanitizeAuxModels({ compression: { providerId: "a", model: " " } }, providers).compression === null, "sanitize: empty model → auto");
	const main = { providerId: "main", model: "mm" };
	const rs = C.resolveAuxTask({ providers: [prov("a")], auxModels: { compression: { providerId: "a", model: "c1" } } }, "compression", main);
	check(rs.providerId === "a" && rs.model === "c1", "resolve: valid pin wins over main");
	check(C.resolveAuxTask({ providers: [prov("a")], auxModels: {} }, "compression", main) === main, "resolve: no pin → main");
	check(C.resolveAuxTask({ providers: [prov("a")], auxModels: { compression: { providerId: "ghost", model: "x" } } }, "compression", main) === main, "resolve: stale pin (provider gone) → main");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
