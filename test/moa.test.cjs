/**
 * Unit tests for the MoA config layer (src/agent/moa.ts) — Hermes
 * hermes_cli/moa_config.py semantics, verified raw 2026-08-01 @ e444d16:
 * tolerant read / loud write, fanout + slot coercions, recursion guard,
 * exact-name implicit match honoring the enabled opt-out (#55187),
 * desktop editor helpers (updateMoaSlot / moaConfigComplete).
 */

const { execSync } = require("child_process");
const path = require("path");

const out = path.join(__dirname, "dist", "moa.cjs");
execSync(`npx esbuild src/agent/moa.ts --bundle --platform=node --format=cjs --outfile=${out}`, {
	cwd: path.join(__dirname, ".."),
	stdio: "inherit",
});
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

/* ---- 1. defaults: official starting point, byte-semantics ---- */
{
	const c = m.normalizeMoaConfig(undefined);
	check("default preset name", c.default_preset === "default" && Object.keys(c.presets).join(",") === "default");
	const p = c.presets.default;
	check(
		"official reference seeds (+enabled)",
		eq(p.reference_models, [
			{ provider: "openai-codex", model: "gpt-5.5", enabled: true },
			{ provider: "openrouter", model: "deepseek/deepseek-v4-pro", enabled: true },
		])
	);
	check("official aggregator seed", eq(p.aggregator, { provider: "openrouter", model: "anthropic/claude-opus-4.8", enabled: true }));
	check(
		"preset scalar defaults (nulls = omitted, loud, 4096, user_turn)",
		p.reference_temperature === null &&
			p.aggregator_temperature === null &&
			p.reference_timeout === null &&
			p.degraded_reference_policy === "loud" &&
			p.max_tokens === 4096 &&
			p.reference_max_tokens === null &&
			p.fanout === "user_turn" &&
			p.enabled === true
	);
	check("flattened view mirrors default preset", c.enabled === true && c.max_tokens === 4096 && eq(c.aggregator, p.aggregator));
	check("active_preset empty by default", c.active_preset === "");
}

/* ---- 2. legacy flat shape becomes the default preset ---- */
{
	const c = m.normalizeMoaConfig({
		reference_models: [{ provider: "a", model: "b" }],
		aggregator: { provider: "c", model: "d" },
		fanout: "per_iteration",
	});
	const p = c.presets.default;
	check("flat refs preserved", eq(p.reference_models, [{ provider: "a", model: "b", enabled: true }]));
	check("flat aggregator preserved", eq(p.aggregator, { provider: "c", model: "d", enabled: true }));
	check("flat fanout preserved", p.fanout === "per_iteration" && c.fanout === "per_iteration");
}

/* ---- 3. tolerant read: junk degrades to defaults, never crashes ---- */
{
	const c = m.normalizeMoaConfig({
		presets: {
			"  ": { reference_models: [{ provider: "x", model: "y" }] }, // blank name dropped
			broken: "not-a-preset",
			moarec: {
				reference_models: [{ provider: "MoA", model: "z" }], // recursion → refs → defaults
				aggregator: { provider: "moa", model: "z" }, // recursion → default aggregator
			},
		},
	});
	check("blank preset name dropped", !("  " in c.presets) && !("" in c.presets));
	check("non-object preset → official default preset", c.presets.broken.reference_models[0].model === "gpt-5.5");
	check("recursive reference provider dropped → defaults", c.presets.moarec.reference_models.length === 2 && c.presets.moarec.reference_models[1].model === "deepseek/deepseek-v4-pro");
	check("recursive aggregator dropped → default", c.presets.moarec.aggregator.model === "anthropic/claude-opus-4.8");
	const s = m.normalizeMoaConfig({ presets: { str: { reference_models: '[{"provider":"p","model":"q"}]', aggregator: { provider: "a", model: "b" } } } });
	check("JSON-string reference_models parsed on READ", eq(s.presets.str.reference_models, [{ provider: "p", model: "q", enabled: true }]));
	const single = m.normalizeMoaConfig({ presets: { one: { reference_models: { provider: "p", model: "q" }, aggregator: { provider: "a", model: "b" } } } });
	check("single-mapping refs wrapped", single.presets.one.reference_models.length === 1 && single.presets.one.reference_models[0].provider === "p");
}

/* ---- 4. fanout coercion (canonical string; mapping form; degenerate N) ---- */
{
	const f = m.normalizeMoaPreset;
	check("fanout canonicals kept", f({ fanout: "per_iteration" }).fanout === "per_iteration" && f({ fanout: "user_turn" }).fanout === "user_turn" && f({ fanout: "every_n:3" }).fanout === "every_n:3");
	check("every_n mapping form", f({ fanout: { mode: "every_n", n: 4 } }).fanout === "every_n:4");
	check("every_n:1 collapses to per_iteration (both forms)", f({ fanout: { mode: "every_n", n: 1 } }).fanout === "per_iteration" && f({ fanout: "every_n:1" }).fanout === "per_iteration");
	check("junk/degenerate fanout → user_turn", f({ fanout: "banana" }).fanout === "user_turn" && f({ fanout: "every_n:0" }).fanout === "user_turn" && f({ fanout: "every_n:" }).fanout === "user_turn" && f({ fanout: 42 }).fanout === "user_turn");
	check("non-every_n mapping mode passes through string path", f({ fanout: { mode: "user_turn" } }).fanout === "user_turn");
}

/* ---- 5. slot coercions ---- */
{
	const c = m.normalizeMoaPreset({
		reference_models: [
			{ provider: "a", model: "b", reasoning_effort: false, max_tokens: "600", enabled: "off" },
			{ provider: "a", model: "c", reasoning_effort: "ultra", max_tokens: 0 },
			{ provider: "a", model: "d", reasoning_effort: "bogus", max_tokens: -5 },
			{ provider: "a", model: "e", reasoning_effort: "disabled" },
		],
		aggregator: { provider: "x", model: "y" },
	});
	const [s1, s2, s3, s4] = c.reference_models;
	check("effort false → none; max_tokens string→int; enabled off", s1.reasoning_effort === "none" && s1.max_tokens === 600 && s1.enabled === false);
	check("effort level kept; max_tokens 0 → unset", s2.reasoning_effort === "ultra" && s2.max_tokens === undefined);
	check("bogus effort dropped; negative cap dropped", s3.reasoning_effort === undefined && s3.max_tokens === undefined);
	check("disabled alias → none", s4.reasoning_effort === "none");
	const n = m.normalizeMoaPreset({ max_tokens: "8192.7", reference_max_tokens: "600", reference_timeout: "45.5", aggregator: { provider: "p", model: "q" } });
	check("preset numeric coercions (trunc, positive cap, float timeout)", n.max_tokens === 8192 && n.reference_max_tokens === 600 && n.reference_timeout === 45.5);
	const n2 = m.normalizeMoaPreset({ reference_timeout: 0, aggregator: { provider: "p", model: "q" } });
	const n3 = m.normalizeMoaPreset({ reference_timeout: true, aggregator: { provider: "p", model: "q" } });
	check("non-positive/boolean timeout → inherit (null)", n2.reference_timeout === null && n3.reference_timeout === null);
	const t = m.normalizeMoaPreset({ aggregator_temperature: "0.7", reference_temperature: "abc", aggregator: { provider: "p", model: "q" } });
	check("temperature float-or-null", t.aggregator_temperature === 0.7 && t.reference_temperature === null);
	check("unknown degraded policy fails loud", m.normalizeMoaPreset({ degraded_reference_policy: "weird" }).degraded_reference_policy === "loud");
	check("SILENT normalizes", m.normalizeMoaPreset({ degraded_reference_policy: " SILENT " }).degraded_reference_policy === "silent");
}

/* ---- 6. loud write boundary (official #64156 semantics incl. messages) ---- */
{
	check("non-object → one problem", eq(m.validateMoaPayload(42), ["MoA config must be an object"]));
	const probs = m.validateMoaPayload({
		presets: {
			default: {
				reference_models: [{ provider: "lmstudio", model: "" }, {}, { provider: "moa", model: "x" }, { provider: "ok", model: "ok" }],
				aggregator: { provider: "lmstudio" },
			},
		},
	});
	check("half-filled ref message", probs.includes("preset 'default' reference 1: model is required (provider 'lmstudio' has no model selected)"));
	check("empty ref message", probs.includes("preset 'default' reference 2: provider and model are required"));
	check("recursive ref message", probs.includes("preset 'default' reference 3: the Mixture of Agents provider cannot be used inside a preset (recursive MoA)"));
	check("aggregator problem message", probs.includes("preset 'default' aggregator: model is required (provider 'lmstudio' has no model selected)"));
	check("one complete ref → no 'needs at least one' problem", !probs.some((p) => p.includes("needs at least one")));
	const probs2 = m.validateMoaPayload({ presets: { empty: { reference_models: [], aggregator: { provider: "a", model: "b" } } } });
	check("explicit empty refs is a write error", eq(probs2, ["preset 'empty': needs at least one complete reference model"]));
	const probs3 = m.validateMoaPayload({ presets: { str: { reference_models: '[{"provider":"p","model":"q"}]', aggregator: { provider: "a", model: "b" } } } });
	check("validate does NOT parse JSON-string refs (read/write asymmetry)", probs3.includes("preset 'str': needs at least one complete reference model"));
	const flat = m.validateMoaPayload({ reference_models: [{ provider: "a", model: "b" }], aggregator: { provider: "c", model: "d" } });
	check("flat legacy payload valid", eq(flat, []));
	const emptyPresets = m.validateMoaPayload({ presets: {}, reference_models: [{ provider: "a", model: "b" }], aggregator: { provider: "c", model: "d" } });
	check("empty presets dict falls back to the flat path", eq(emptyPresets, []));
	const nonObjPreset = m.validateMoaPayload({ presets: { x: 7 } });
	check("non-object preset named in problems", eq(nonObjPreset, ["preset 'x': must be an object"]));
}

/* ---- 7. name/default/active handling ---- */
{
	const c = m.normalizeMoaConfig({
		presets: { a: { reference_models: [{ provider: "p", model: "q" }], aggregator: { provider: "r", model: "s" } } },
		default_preset: "ghost",
		active_preset: "ghost",
	});
	check("unknown default falls back to first preset; bad active clears", c.default_preset === "a" && c.active_preset === "");
	check("listMoaPresets", eq(m.listMoaPresets(c), ["a"]));
	const known = m.setActiveMoaPreset(c, "a");
	check("setActive known", known.active_preset === "a");
	let threw = false;
	try {
		m.setActiveMoaPreset(c, "ghost");
	} catch {
		threw = true;
	}
	check("setActive unknown throws", threw);
	check("setActive null clears", m.setActiveMoaPreset(c, null).active_preset === "");
	check("resolveMoaPreset default", m.resolveMoaPreset(c).aggregator.model === "s");
	check("resolveMoaPreset by name", m.resolveMoaPreset(c, "a").aggregator.provider === "r");
	let notFound = "";
	try {
		m.resolveMoaPreset(c, "ghost");
	} catch (e) {
		notFound = String(e.message ?? e);
	}
	check("resolveMoaPreset unknown lists available + CLI hint", notFound.includes("MoA preset 'ghost' was not found") && notFound.includes("Available presets: a") && notFound.includes("hermes moa list"));
}

/* ---- 8. exact-name implicit match honors the enabled opt-out (#55187) ---- */
{
	const cfg = {
		presets: {
			team: { enabled: true, reference_models: [{ provider: "p", model: "q" }], aggregator: { provider: "r", model: "s" } },
			off: { enabled: false, reference_models: [{ provider: "p", model: "q" }], aggregator: { provider: "r", model: "s" } },
		},
		default_preset: "team",
	};
	check("exact enabled match", m.exactMoaPresetName(cfg, "team") === "team");
	check("disabled preset never implicit-matches", m.exactMoaPresetName(cfg, "off") === null);
	check("unknown / blank / prefixed never match", m.exactMoaPresetName(cfg, "ghost") === null && m.exactMoaPresetName(cfg, "  ") === null && m.exactMoaPresetName(cfg, "moa:team") === null);
}

/* ---- 9. desktop editor helpers (model-settings.tsx) ---- */
{
	const slot = { provider: "lmstudio", model: "gemma", enabled: true };
	const changed = m.updateMoaSlot(slot, { provider: "openrouter" });
	check("provider change clears the model", changed.provider === "openrouter" && changed.model === "");
	const same = m.updateMoaSlot(slot, { provider: "lmstudio" });
	check("same-provider patch keeps the model", same.model === "gemma");
	check("model patch keeps provider", m.updateMoaSlot(slot, { model: "qwen" }).provider === "lmstudio");
	check("withActiveOption adds current value only when missing", eq(m.withActiveOption(["a"], "b"), ["b", "a"]) && eq(m.withActiveOption(["a"], "a"), ["a"]));
	check("moaSlotComplete", m.moaSlotComplete({ provider: "p", model: "m", enabled: true }) && !m.moaSlotComplete({ provider: "p", model: "", enabled: true }));
	const complete = m.normalizeMoaConfig({
		presets: { d: { reference_models: [{ provider: "p", model: "q" }], aggregator: { provider: "r", model: "s" } } },
	});
	check("moaConfigComplete true on complete draft", m.moaConfigComplete(complete));
	complete.presets.d.aggregator = { provider: "r", model: "", enabled: true };
	check("moaConfigComplete false on half-filled", !m.moaConfigComplete(complete));
	complete.presets.d.aggregator = { provider: "r", model: "s", enabled: true };
	complete.presets.d.reference_models = [];
	check("moaConfigComplete false on zero refs", !m.moaConfigComplete(complete));
}

/* ---- 10. usage line (official cli text) ---- */
check(
	"usage line parity",
	m.moaUsage() ===
		"Usage: /moa <prompt>  (runs one prompt through the default MoA preset, then restores your model; pick a preset from the model picker to switch for the session)"
);

console.log(failures === 0 ? "\nALL MOA CONFIG CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
