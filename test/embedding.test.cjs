/** embedTexts regression tests (v0.1.178, Fase 3).
 *
 * The OpenAI-compatible /v1/embeddings bridge used for semantic recall.
 * Verifies: POST shape (model + input array), one vector per input, null on
 * missing entries, null on transport/parse failure — it must never throw,
 * because semantic recall is an optional boost, not a requirement.
 */
const { execSync } = require("child_process");
const path = require("path");
const Module = require("module");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "embedding.cjs");
execSync(
	`npx esbuild src/agent/providers.ts --bundle --platform=node --format=cjs --external:obsidian --outfile=${out}`,
	{ cwd: root, stdio: "inherit" }
);

const requests = [];
const state = { respond: null };
const obsidianMock = {
	requestUrl: async (req) => {
		requests.push(req);
		if (state.respond === null) throw new Error("sim: unhandled");
		return state.respond(req);
	},
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "obsidian") return "obsidian-embedding-mock";
	return originalResolve.call(this, request, ...args);
};
require.cache["obsidian-embedding-mock"] = {
	id: "obsidian-embedding-mock",
	filename: "obsidian-embedding-mock",
	loaded: true,
	exports: obsidianMock,
};

global.window = { setTimeout, clearTimeout };
const { embedTexts } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

const provider = {
	id: "lmstudio",
	name: "LM Studio (local)",
	baseUrl: "http://localhost:1234/v1",
	apiKey: "",
	enabled: true,
	customHeaders: {},
	models: [],
};

(async () => {
	/* 1 — happy path: one vector per input, POST body shape correct */
	{
		requests.length = 0;
		state.respond = (req) => {
			const body = JSON.parse(req.body);
			return {
				status: 200,
				headers: {},
				arrayBuffer: new ArrayBuffer(0),
				text: "",
				json: { data: body.input.map((_, i) => ({ embedding: [i + 1, 2, 3] })) },
			};
		};
		const vecs = await embedTexts(provider, "embedding-gemma-300m", ["a", "b"]);
		check(Array.isArray(vecs) && vecs.length === 2 && vecs[0][0] === 1, "embedTexts: returns one vector per input");
		const req = requests[0];
		check(req.url.endsWith("/embeddings") && req.method === "POST", "embedTexts: POST to /v1/embeddings");
		const body = JSON.parse(req.body);
		check(body.model === "embedding-gemma-300m" && Array.isArray(body.input) && body.input.length === 2, "embedTexts: body carries model + input array");
	}

	/* 2 — missing entry → null vector in place */
	{
		requests.length = 0;
		state.respond = () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0), text: "", json: { data: [{ embedding: [1] }, { nope: true }] } });
		const vecs = await embedTexts(provider, "m", ["a", "b"]);
		check(vecs && vecs[0] !== null && vecs[1] === null, "embedTexts: missing entry → null (others kept)");
	}

	/* 3 — non-numeric / empty embedding → null */
	{
		state.respond = () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0), text: "", json: { data: [{ embedding: ["x"] }, { embedding: [] }] } });
		const vecs = await embedTexts(provider, "m", ["a", "b"]);
		check(vecs && vecs[0] === null && vecs[1] === null, "embedTexts: bad embedding shapes → null");
	}

	/* 4 — transport error / bad json → null, never throws */
	{
		state.respond = () => {
			throw new Error("boom");
		};
		check((await embedTexts(provider, "m", ["a"])) === null, "embedTexts: transport error → null");

		state.respond = () => ({ status: 200, headers: {}, arrayBuffer: new ArrayBuffer(0), text: "", json: { unexpected: true } });
		check((await embedTexts(provider, "m", ["a"])) === null, "embedTexts: non-data json → null");
	}

	/* 5 — degenerate inputs → null without a call */
	{
		requests.length = 0;
		check((await embedTexts(provider, "  ", ["a"])) === null, "embedTexts: blank model → null");
		check((await embedTexts(provider, "m", [])) === null, "embedTexts: empty texts → null");
		check(requests.length === 0, "embedTexts: degenerate inputs make no request");
	}

	if (failed) {
		console.error(`\n${failed} embedding check(s) failed`);
		process.exit(1);
	}
	console.log("\nAll embedding checks passed.");
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
