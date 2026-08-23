const esbuild = require("esbuild");
const fs = require("fs");
const os = require("os");
const path = require("path");

const out = path.join(os.tmpdir(), "openagent-mcp-secrets.cjs");
esbuild.buildSync({ entryPoints: [path.join(__dirname, "../src/agent/mcp/secrets.ts")], bundle: true, platform: "node", format: "cjs", outfile: out });
const { McpSecretStore, migrateLegacyMcpSecrets, splitCatalogEnv, stripCatalogSecrets } = require(out);

const n8n = {
	name: "n8n",
	auth: { type: "api_key", env: [
		{ name: "N8N_BASE_URL", secret: false },
		{ name: "N8N_API_KEY", secret: true },
	] },
};

let failed = 0;
function ok(condition, label) {
	if (condition) console.log(`✓ ${label}`);
	else { console.error(`✗ ${label}`); failed++; }
}

const split = splitCatalogEnv(n8n, { N8N_BASE_URL: "http://n8n", N8N_API_KEY: "secret", EXTRA: "x" });
ok(split.secret.N8N_API_KEY === "secret" && !split.secret.N8N_BASE_URL, "split sends n8n API key to secret side");
ok(split.config.N8N_BASE_URL === "http://n8n" && split.config.EXTRA === "x", "split keeps non-secret values in config side");

const imported = stripCatalogSecrets({ n8n: { enabled: true, env: { N8N_BASE_URL: "http://n8n", N8N_API_KEY: "import-secret" } } }, (name) => name === "n8n" ? n8n : undefined);
ok(imported.n8n.env.N8N_BASE_URL === "http://n8n" && !Object.hasOwn(imported.n8n.env, "N8N_API_KEY"), "settings import strips catalog secret but retains non-secret config");

const first = migrateLegacyMcpSecrets(n8n, { enabled: true, env: { N8N_BASE_URL: "http://n8n", N8N_API_KEY: "secret" } }, {});
ok(first.store.n8n.N8N_API_KEY === "secret", "legacy API key migrates to secret store");
ok(first.config.env.N8N_BASE_URL === "http://n8n" && !Object.hasOwn(first.config.env, "N8N_API_KEY"), "legacy config retains base URL and removes API key");
ok(first.moved.join(",") === "N8N_API_KEY", "first migration reports one moved secret");

const second = migrateLegacyMcpSecrets(n8n, first.config, first.store);
ok(second.moved.length === 0 && second.store.n8n.N8N_API_KEY === "secret", "migration is idempotent");

const onlySecret = migrateLegacyMcpSecrets(n8n, { enabled: true, env: { N8N_API_KEY: "secret" } }, {});
ok(!Object.hasOwn(onlySecret.config, "env"), "secret-only legacy config removes env block entirely");

(async () => {
	const files = new Map();
	const adapter = {
		exists: async (path) => files.has(path),
		read: async (path) => files.get(path),
		write: async (path, data) => files.set(path, data),
		remove: async (path) => files.delete(path),
	};
	const store = new McpSecretStore(adapter, "openagent");
	await store.save({ n8n: { N8N_API_KEY: "secret" } });
	const loaded = await store.load();
	ok(store.path === ".obsidian/plugins/openagent/mcp-secrets.json", "secret store uses plugin-private path");
	ok(loaded.n8n.N8N_API_KEY === "secret", "secret store round-trips local values");
	await store.clear();
	ok(Object.keys(await store.load()).length === 0, "secret store clear removes plugin-private file");
	try { fs.unlinkSync(out); } catch {}
	if (failed) process.exit(1);
	console.log("All MCP secret-store checks passed.");
})();

// async block owns final status
