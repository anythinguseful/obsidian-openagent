/**
 * Per-provider model catalog unit tests (Hermes Desktop parity, v0.1.14):
 *   catalogs live ON each provider · test-fetch writes only the viewed
 *   provider · active-model heal only against a non-empty catalog ·
 *   activation keeps a valid (provider, model) pair · legacy global-list
 *   migration never overwrites data
 */

const { execSync } = require("child_process");
const path = require("path");

const out = path.join(__dirname, "dist", "modelCatalog.cjs");
execSync(
	`npx esbuild src/agent/modelCatalog.ts --bundle --platform=node --format=cjs --outfile=${out}`,
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

const prov = (id, models = []) => ({
	id,
	name: id,
	baseUrl: "http://x/v1",
	apiKey: "",
	enabled: true,
	customHeaders: {},
	models,
});
const mk = (providers, activeProviderId, model = "") => ({ providers, activeProviderId, model });

// ── dedupeModels / catalogOf ────────────────────────────────────────────
check(JSON.stringify(C.dedupeModels([" a ", "a", "b", "", 7, null])) === JSON.stringify(["a", "b"]), "dedupe: trimmed, dupes collapsed, junk dropped");
check(JSON.stringify(C.dedupeModels("nope")) === "[]", "dedupe: non-array → []");
check(JSON.stringify(C.catalogOf(prov("p", ["m1", "m1"]))) === JSON.stringify(["m1"]), "catalogOf: reads+dedupes provider list");
check(JSON.stringify(C.catalogOf(null)) === "[]", "catalogOf: null provider → []");
check(JSON.stringify(C.catalogOf({ id: "x" })) === "[]", "catalogOf: legacy provider without models → []");

// ── withCurrentModel (official withActive) ──────────────────────────────
check(JSON.stringify(C.withCurrentModel(["m1"], "")) === JSON.stringify(["m1"]), "withCurrent: empty current → catalog only");
check(JSON.stringify(C.withCurrentModel(["m1"], "m1")) === JSON.stringify(["m1"]), "withCurrent: current in catalog → unchanged");
check(JSON.stringify(C.withCurrentModel(["m1"], "custom")) === JSON.stringify(["custom", "m1"]), "withCurrent: off-catalog pick stays selectable, first");

// ── healModelAgainstCatalog (official manualPickRemoved rule) ────────────
check(C.healModelAgainstCatalog([], "keep-me") === "keep-me", "heal: EMPTY catalog never clobbers current pick");
check(C.healModelAgainstCatalog(["m1", "m2"], "m2") === "m2", "heal: pick present → kept");
check(C.healModelAgainstCatalog(["m1", "m2"], "stale") === "m1", "heal: stale pick → adopts catalog[0]");
check(C.healModelAgainstCatalog(["m1"], "") === "m1", "heal: empty pick → prefill catalog[0]");

// ── applyFetchedModels (Test & fetch) ────────────────────────────────────
{
	const s = mk([prov("a"), prov("b", ["b1"])], "a", "a-old");
	check(C.applyFetchedModels(s, "b", ["b1", "b2"]) === true, "applyFetched: returns true for known provider");
	check(JSON.stringify(s.providers[1].models) === JSON.stringify(["b1", "b2"]), "applyFetched: writes ONLY the viewed provider's catalog");
	check(s.model === "a-old", "applyFetched: testing a NON-active provider never touches the active model");
}
{
	const s = mk([prov("a", ["a1"]), prov("b")], "a", "a-stale");
	C.applyFetchedModels(s, "a", ["x1", "x2"]);
	check(JSON.stringify(s.providers[0].models) === JSON.stringify(["x1", "x2"]), "applyFetched: active provider catalog refreshed");
	check(s.model === "x1", "applyFetched: stale active model healed against the fresh catalog");
	check(s.providers[1].models.length === 0, "applyFetched: other providers' catalogs untouched");
}
{
	const s = mk([prov("a")], "a", "keep");
	check(C.applyFetchedModels(s, "ghost", ["m"]) === false, "applyFetched: unknown provider → false, no crash");
	check(s.model === "keep", "applyFetched: unknown provider leaves model alone");
}

// ── activateProviderCatalog (Model-tab Apply) ────────────────────────────
{
	const s = mk([prov("a", ["a1"]), prov("b", ["b1", "b2"])], "a", "a1");
	check(C.activateProviderCatalog(s, "b") === true, "activate: known provider → true");
	check(s.activeProviderId === "b", "activate: active provider switched");
	check(s.model === "b1", "activate: model healed to the new provider's catalog[0]");
}
{
	const s = mk([prov("a"), prov("b")], "a", "custom-id");
	C.activateProviderCatalog(s, "b");
	check(s.activeProviderId === "b" && s.model === "custom-id", "activate: empty catalog → pick untouched (fetch fills in later)");
}
{
	const s = mk([prov("a"), prov("b", ["b1"])], "a", "a1");
	check(C.activateProviderCatalog(s, "ghost") === false, "activate: unknown provider → false");
	check(s.activeProviderId === "a" && s.model === "a1", "activate: unknown provider changes nothing");
}

// ── rememberModelInCatalog (/model command, custom id field) ─────────────
{
	const p = prov("a", ["m1"]);
	C.rememberModelInCatalog(p, " m2 ");
	C.rememberModelInCatalog(p, "m2");
	check(JSON.stringify(p.models) === JSON.stringify(["m1", "m2"]), "remember: appended once, trimmed, no dupes");
	C.rememberModelInCatalog(null, "x");
	check(true, "remember: null provider is a safe no-op");
}

// ── migrateLegacyFavoriteModels (pre-v0.1.14 global flat list) ───────────
{
	const s = mk([prov("a"), prov("b", ["b1"])], "a", "");
	check(C.migrateLegacyFavoriteModels(s, ["m1", "m1", "m2"]) === true, "migrate: legacy list folded in → true");
	check(JSON.stringify(s.providers[0].models) === JSON.stringify(["m1", "m2"]), "migrate: lands on the ACTIVE provider, deduped");
	check(JSON.stringify(s.providers[1].models) === JSON.stringify(["b1"]), "migrate: other providers untouched");
}
{
	const s = mk([prov("a", ["existing"])], "a", "");
	C.migrateLegacyFavoriteModels(s, ["legacy"]);
	check(JSON.stringify(s.providers[0].models) === JSON.stringify(["existing"]), "migrate: never overwrites a non-empty catalog");
}
{
	const s = mk([prov("a")], "ghost", "");
	check(C.migrateLegacyFavoriteModels(s, ["m1"]) === false, "migrate: unknown active provider → false, nothing written");
	check(C.migrateLegacyFavoriteModels(mk([prov("a")], "a", ""), []) === false, "migrate: empty legacy list → false");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
