const esbuild = require("esbuild");
const fs = require("fs");
const Module = require("module");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(os.tmpdir(), "openagent-mcp-migration.cjs");
esbuild.buildSync({ entryPoints: [path.join(root, "src/main.ts")], bundle: true, platform: "node", format: "cjs", external: ["obsidian"], outfile: out });

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) { if (request === "obsidian") return "obsidian-mock-migration"; return originalResolve.call(this, request, ...args); };
require.cache["obsidian-mock-migration"] = { id: "obsidian-mock-migration", filename: "obsidian-mock-migration", loaded: true, exports: {
	Plugin: class {}, Platform: { isDesktopApp: false }, Notice: class {}, Component: class {}, Modal: class {}, PluginSettingTab: class {}, ItemView: class {}, Setting: class {}, FuzzySuggestModal: class {}, TFile: class {}, TFolder: class {}, normalizePath: (x) => x, requestUrl: async () => { throw new Error("mock"); }, setIcon: () => {},
} };
const { default: OpenAgentPlugin } = require(out);
const settingsOut = path.join(os.tmpdir(), "openagent-settings-export.cjs");
esbuild.buildSync({ entryPoints: [path.join(root, "src/settings.ts")], bundle: true, platform: "node", format: "cjs", external: ["obsidian"], outfile: settingsOut });
const { buildSettingsExport } = require(settingsOut);
let failed = 0;
const ok = (v, label) => { if (v) console.log(`✓ ${label}`); else { console.error(`✗ ${label}`); failed++; } };

(async () => {
	const files = new Map();
	const legacy = { mcpServers: { n8n: { enabled: true, env: { N8N_BASE_URL: "http://n8n", N8N_API_KEY: "legacy-secret" } } } };
	let saves = 0;
	const fake = Object.create(OpenAgentPlugin.prototype);
	fake.manifest = { id: "openagent" };
	fake.app = { vault: { adapter: {
		exists: async (p) => files.has(p), read: async (p) => files.get(p), write: async (p, d) => files.set(p, d),
	} } };
	fake.loadData = async () => legacy;
	fake.saveData = async (v) => { saves++; fake.saved = v; };
	fake.readTerminalConsentLedger = () => "";
	fake.readMcpConsentLedger = () => "";
	await fake.loadSettings();
	const cfg = fake.settings.mcpServers.n8n;
	const secrets = JSON.parse(files.get('.obsidian/plugins/openagent/mcp-secrets.json'));
	ok(secrets.n8n.N8N_API_KEY === "legacy-secret", "loadSettings migrates legacy API key into secret store");
	ok(cfg.env.N8N_BASE_URL === "http://n8n" && !Object.hasOwn(cfg.env, "N8N_API_KEY"), "loadSettings removes secret but keeps base URL");
	ok(saves === 1, "first legacy migration persists cleaned settings once");
	const exported = JSON.stringify(buildSettingsExport(fake.settings, true, "0.1.150"));
	ok(!exported.includes("N8N_API_KEY") && !exported.includes("legacy-secret"), "full settings export excludes migrated MCP secret");
	await fake.loadSettings();
	ok(saves === 1, "second load is idempotent");
	try { fs.unlinkSync(out); } catch {}
	try { fs.unlinkSync(settingsOut); } catch {}
	if (failed) process.exit(1);
	console.log("All MCP secret migration checks passed.");
})();
