/** LM Studio context-length probe regression tests (v0.1.174).
 *
 * The OpenAI-compatible /v1/models of LM Studio carries NO context window,
 * so the pill used to fall back to the 32K default while the user had set
 * 131072. The fix probes LM Studio's NATIVE /api/v1/models
 * (loaded_instances[].config.context_length — the runtime value), with
 * publisher/slug fuzzy id matching. Mirrors Hermes
 * agent/model_metadata.py (_query_local_context_length_uncached +
 * _model_id_matches + _lmstudio_server_root).
 */
const { execSync } = require("child_process");
const path = require("path");
const Module = require("module");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "lmstudio-context.cjs");
execSync(
	`npx esbuild src/agent/providers.ts --bundle --platform=node --format=cjs --external:obsidian --outfile=${out}`,
	{ cwd: root, stdio: "inherit" }
);

/* Routing transport double: OpenAI-compat /v1/models vs native /api/v1/models.
 * Mutable per-test state — the bundled module holds ONE reference to the mock
 * module's exports, so we mutate in place rather than swap the object. */
const requests = [];
const state = { compat: [], native: [] };
const obsidianMock = {
	requestUrl: async (req) => {
		requests.push(req.url);
		if (String(req.url).endsWith("/api/v1/models")) {
			return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0), text: "", json: { data: state.native } };
		}
		if (String(req.url).endsWith("/v1/models")) {
			return { status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0), text: "", json: { data: state.compat } };
		}
		return { status: 404, headers: {}, arrayBuffer: new ArrayBuffer(0), text: "", json: {} };
	},
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "obsidian") return "obsidian-lmstudio-context-mock";
	return originalResolve.call(this, request, ...args);
};
require.cache["obsidian-lmstudio-context-mock"] = {
	id: "obsidian-lmstudio-context-mock",
	filename: "obsidian-lmstudio-context-mock",
	loaded: true,
	exports: obsidianMock,
};

global.window = { setTimeout, clearTimeout };
const { fetchAdvertisedContextLength } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

const provider = (baseUrl) => ({
	id: "lmstudio",
	name: "LM Studio (local)",
	baseUrl,
	apiKey: "",
	enabled: true,
	customHeaders: {},
	models: [],
});

(async () => {
	/* 1 — native probe: compat list has no context, native carries the runtime
	   value under a publisher/slug id that must fuzzy-match the bare slug. */
	{
		requests.length = 0;
		state.compat = [{ id: "gemma-4-e4b" }];
		state.native = [{ id: "google/gemma-4-e4b", loaded_instances: [{ config: { context_length: 131072 } }] }];
		const len = await fetchAdvertisedContextLength(provider("http://localhost:1234/v1"), "gemma-4-e4b");
		check(len === 131072, `LM Studio native probe returns the loaded runtime context (131072, got ${len})`);
		check(
			requests.some((u) => String(u).endsWith("/api/v1/models")),
			"native /api/v1/models was probed when compat /models carried no context"
		);
	}

	/* 2 — compat already advertises context → native probe must NOT fire. */
	{
		requests.length = 0;
		state.compat = [{ id: "some-cloud-model", context_length: 32768 }];
		state.native = [];
		const len = await fetchAdvertisedContextLength(provider("https://openrouter.test/v1"), "some-cloud-model");
		check(len === 32768, "compat /models context_length wins");
		check(
			!requests.some((u) => String(u).endsWith("/api/v1/models")),
			"no native probe when the compat list already advertises the window"
		);
	}

	/* 3 — native top-level max_context_length fallback (no loaded_instances). */
	{
		requests.length = 0;
		state.compat = [{ id: "qwen3-30b" }];
		state.native = [{ id: "qwen3-30b", max_context_length: 65536 }];
		const len = await fetchAdvertisedContextLength(provider("http://localhost:1234/v1"), "qwen3-30b");
		check(len === 65536, "native max_context_length fallback (65536)");
	}

	/* 4 — no matching model anywhere → null (caller falls back to 256K). */
	{
		requests.length = 0;
		state.compat = [{ id: "other-model" }];
		state.native = [{ id: "unrelated/slug", loaded_instances: [{ config: { context_length: 8192 } }] }];
		const len = await fetchAdvertisedContextLength(provider("http://localhost:1234/v1"), "missing-model");
		check(len === null, "no matching model → null (256K default fallback)");
	}

	if (failed) {
		console.error(`\n${failed} lmstudio-context check(s) failed`);
		process.exit(1);
	}
	console.log("\nAll lmstudio-context checks passed.");
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
