/**
 * Unit tests for the composer model-menu parity layer
 * (src/agent/modelMenu.ts) — Hermes Desktop semantics, verified raw
 * 2026-08-01 from apps/desktop/src/lib/model-status-label.ts,
 * store/model-visibility.ts, lib/model-search-text.ts and
 * app/shell/model-menu-panel.tsx.
 */

const { execSync } = require("child_process");
const path = require("path");

const out = path.join(__dirname, "dist", "modelMenu.cjs");
execSync(`npx esbuild src/agent/modelMenu.ts --bundle --platform=node --format=cjs --outfile=${out}`, {
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

/* ---------- display names (model-status-label.ts) ---------- */

check("base id strips provider prefix", m.modelBaseId("openrouter/anthropic/claude-opus-4.8") === "claude-opus-4.8");
check("base id of bare id is itself", m.modelBaseId("gpt-5.5") === "gpt-5.5");
check(
	"claude prettifies + date-pin stripped",
	eq(m.modelDisplayParts("anthropic/claude-opus-4.8-20251101"), { name: "Opus 4.8", tag: "" })
);
check("fast variant becomes tag on the base name", eq(m.modelDisplayParts("claude-opus-4.8-fast"), { name: "Opus 4.8", tag: "Fast" }));
check("thinking/preview/latest tags", m.modelDisplayParts("kimi-k3-thinking").tag === "Thinking" && m.modelDisplayParts("grok-5-preview").tag === "Preview" && m.modelDisplayParts("gpt-x-latest").tag === "Latest");
check("gpt prefix kept as GPT-", m.modelDisplayParts("openai/gpt-5.5").name === "GPT-5.5");
check("gemini prefix spaced (remainder NOT title-cased, official .replace only)", m.modelDisplayParts("gemini-2.5-flash").name === "Gemini 2.5 flash");
check("generic title-case", m.modelDisplayParts("hermes-4-70b").name === "Hermes 4 70b");
check("empty model falls back to No model", m.modelDisplayParts("").name === "No model");
check("displayModelName drops the tag", m.displayModelName("claude-opus-4.8-fast") === "Opus 4.8");

/* ---------- model families ---------- */

check(
	"base + -fast collapse to one family (base position)",
	eq(m.collapseModelFamilies(["a-1", "a-1-fast", "b-2"]), [
		{ id: "a-1", fastId: "a-1-fast" },
		{ id: "b-2", fastId: null },
	])
);
check(
	"orphan -fast stands alone",
	eq(m.collapseModelFamilies(["solo-fast"]), [{ id: "solo-fast", fastId: null }])
);
check(
	"date-pinned snapshot superseded by rolling alias is dropped",
	eq(m.collapseModelFamilies(["claude-opus-4.8", "claude-opus-4.8-20251101"]), [{ id: "claude-opus-4.8", fastId: null }])
);
check(
	"unmatched date-pin kept",
	eq(m.collapseModelFamilies(["claude-opus-4.8-20251101"]), [{ id: "claude-opus-4.8-20251101", fastId: null }])
);

/* ---------- visibility store ---------- */

const providers = [
	{ slug: "lmstudio", name: "LM Studio", models: ["m1", "m2", "m3"] },
	{ slug: "openrouter", name: "OpenRouter", models: ["r1", "r2"] },
];

check("null store = curated default of every provider", eq(m.defaultVisibleKeys(providers), new Set(["lmstudio::m1", "lmstudio::m2", "lmstudio::m3", "openrouter::r1", "openrouter::r2"])));
check("featured shortlist defines defaults when present", eq(m.defaultVisibleKeys([{ slug: "p", name: "P", models: ["a", "b", "c"], featured: ["c"] }]), new Set(["p::c"])));
check("resolve adds curated models for an untouched provider only", eq([...m.resolveVisibleKeys(["lmstudio::m2"], providers)].sort(), ["lmstudio::m2", "openrouter::r1", "openrouter::r2"]));
check("resolve preserves a hide-all sentinel (no re-expansion)", eq([...m.resolveVisibleKeys(["lmstudio::"], providers)].filter((k) => k.startsWith("lmstudio::")), ["lmstudio::"]));
check("effective strips sentinels from the display set", !m.effectiveVisibleKeys(["lmstudio::"], providers).has("lmstudio::"));
check("empty store = nothing visible", m.effectiveVisibleKeys([], providers).size === 0);

check("toggle off a visible model removes it", !m.toggleModelVisibility(null, providers, "lmstudio", "m1").includes("lmstudio::m1") === false ? false : !m.toggleModelVisibility(null, providers, "lmstudio", "m1").includes("lmstudio::m1"));
check("hiding the LAST model records the sentinel", m.toggleModelVisibility(["lmstudio::m1"], providers, "lmstudio", "m1").includes("lmstudio::"));
check("re-enabling clears sentinel, keeps ONLY that model for THAT provider (untouched providers keep curated defaults)", eq(m.toggleModelVisibility(["lmstudio::"], providers, "lmstudio", "m2").sort(), ["lmstudio::m2", "openrouter::r1", "openrouter::r2"]));
check("master off stores sentinel and removes all rows", eq(m.setProviderVisibility(null, providers, "lmstudio", false).filter((k) => k.startsWith("lmstudio::")), ["lmstudio::"]));
check("master on enables every family and clears sentinel", (() => { const next = m.setProviderVisibility(["lmstudio::"], providers, "lmstudio", true); return !next.includes("lmstudio::") && ["lmstudio::m1", "lmstudio::m2", "lmstudio::m3"].every((k) => next.includes(k)); })());
check("master on with zero models leaves no sentinel", !m.setProviderVisibility(null, [{ slug: "z", name: "Z", models: [] }], "z", true).includes("z::"));

/* ---------- grouping (model-menu-panel groupModels) ---------- */

const groupsOf = (search) => m.groupMenuModels(providers, search, { provider: "lmstudio", model: "m1" }, m.effectiveVisibleKeys(null, providers));
check("groups alphabetical by provider NAME", eq(groupsOf("").map((g) => g.provider.slug), ["lmstudio", "openrouter"]));
check("current model always included when visible filter hides it", (() => {
	const vis = new Set(["openrouter::r1"]);
	const g = m.groupMenuModels(providers, "", { provider: "lmstudio", model: "m3" }, vis);
	return g.find((x) => x.provider.slug === "lmstudio")?.families.length === 1;
})());
check("search spans hidden models too", (() => {
	const vis = new Set(["openrouter::r1"]);
	const g = m.groupMenuModels(providers, "m2", { provider: "lmstudio", model: "m1" }, vis);
	return g.length === 1 && g[0].families.length === 1 && g[0].families[0].id === "m2";
})());
check("search matches provider name + slug", (() => {
	const byName = m.groupMenuModels(providers, "LM Studio", "", { provider: "", model: "" }, m.effectiveVisibleKeys(null, providers));
	const bySlug = m.groupMenuModels(providers, "openrouter", "", { provider: "", model: "" }, m.effectiveVisibleKeys(null, providers));
	return byName.length === 1 && bySlug.length === 1;
})());
check("search matches the display name", (() => {
	const g = m.groupMenuModels([{ slug: "or", name: "OpenRouter", models: ["anthropic/claude-opus-4.8"] }], "opus", "", { provider: "", model: "" }, m.effectiveVisibleKeys(null, [{ slug: "or", name: "OpenRouter", models: ["anthropic/claude-opus-4.8"] }]));
	return g.length === 1;
})());
check("search matches the fast sibling id", (() => {
	const prov = [{ slug: "or", name: "OpenRouter", models: ["opus", "opus-fast"] }];
	const g = m.groupMenuModels(prov, "opus-fast", "", { provider: "", model: "" }, m.effectiveVisibleKeys(null, prov));
	return g.length === 1 && g[0].families[0].id === "opus";
})());
check("active model NOT pinned while searching", (() => {
	const g = m.groupMenuModels(providers, "r1", { provider: "lmstudio", model: "m1" }, m.effectiveVisibleKeys(null, providers));
	return g.length === 1 && g[0].provider.slug === "openrouter";
})());
check("k3 alias keeps wire id but searches kimi", m.modelSearchText("k3").includes("kimi") && (() => {
	const prov = [{ slug: "k", name: "K", models: ["k3"] }];
	return m.groupMenuModels(prov, "kimi", "", { provider: "", model: "" }, m.effectiveVisibleKeys(null, prov)).length === 1;
})());
check("stable catalog order within a provider (never re-sorted)", (() => {
	const g = m.groupMenuModels([{ slug: "p", name: "P", models: ["z9", "a1", "m5"] }], "", { provider: "p", model: "" }, m.effectiveVisibleKeys(null, [{ slug: "p", name: "P", models: ["z9", "a1", "m5"] }]));
	return eq(g[0].families.map((f) => f.id), ["z9", "a1", "m5"]);
})());
check("provider with zero models contributes no group", m.groupMenuModels([...providers, { slug: "empty", name: "Empty", models: [] }], "", { provider: "", model: "" }, m.effectiveVisibleKeys(null, providers)).length === 2);

/* ---------- MoA preset search ---------- */

check("moa preset matches bare query + moa token", m.moaPresetMatches("crew", "cre") && m.moaPresetMatches("crew", "moa"));
check("moa preset does not match unrelated query", !m.moaPresetMatches("crew", "gpt"));

if (failures > 0) {
	console.error(`\n${failures} model-menu check(s) failed`);
	process.exit(1);
}
console.log(`\nAll model-menu checks passed.`);
