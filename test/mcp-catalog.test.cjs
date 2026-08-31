/**
 * Tests for the MCP catalog (catalog.ts) — pure data + translation logic.
 * Pins the curated entries and the supply-chain-critical SHA refs, and locks
 * the manifest→config translation (${INSTALL_DIR} substitution, safe-by-default
 * tool selection).
 */

const { execSync } = require("child_process");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "mcp-catalog.cjs");
execSync(`npx esbuild src/agent/mcp/catalog.ts --bundle --platform=node --format=cjs --outfile=${out}`, { cwd: root, stdio: "inherit" });

const {
	MCP_CATALOG,
	catalogEntryFor,
	isShaRef,
	expandInstallDir,
	buildServerConfig,
	applyDefaultToolSelection,
	INSTALL_DIR_VAR,
} = require(out);

const tests = [];
function t(name, fn) {
	tests.push({ name, fn });
}

t("catalog ships exactly the installable-now entries", () => {
	assert.deepStrictEqual(
		MCP_CATALOG.map((e) => e.name).sort(),
		["n8n"],
	);
	// names are unique
	const names = MCP_CATALOG.map((e) => e.name);
	assert.strictEqual(new Set(names).size, names.length);
});

t("catalogEntryFor finds by name", () => {
	assert.strictEqual(catalogEntryFor("n8n").name, "n8n");
	assert.strictEqual(catalogEntryFor("notion"), undefined);
});

t("n8n install pins a full 40-char commit SHA", () => {
	const n8n = catalogEntryFor("n8n");
	assert.ok(n8n.install, "n8n must ship an install block");
	assert.strictEqual(n8n.install.ref, "7a9ae00795593aa1fdb4e61ecd640e8bfd0c3841");
	assert.strictEqual(n8n.install.type, "git");
	assert.strictEqual(n8n.install.url, "https://github.com/CyberSamuraiX/hermes-n8n-mcp.git");
});

t("n8n default tool selection is the read-mostly surface (8 tools)", () => {
	const n8n = catalogEntryFor("n8n");
	assert.ok(Array.isArray(n8n.tools.default_enabled));
	assert.strictEqual(n8n.tools.default_enabled.length, 8);
	// mutating tools must not sneak into the default
	assert.ok(!n8n.tools.default_enabled.includes("activate_workflow"));
	assert.ok(!n8n.tools.default_enabled.includes("deactivate_workflow"));
	assert.ok(!n8n.tools.default_enabled.includes("container_logs"));
});

t("n8n auth is api_key with N8N_BASE_URL + N8N_API_KEY", () => {
	const n8n = catalogEntryFor("n8n");
	assert.strictEqual(n8n.auth.type, "api_key");
	const names = n8n.auth.env.map((e) => e.name);
	assert.ok(names.includes("N8N_BASE_URL"));
	assert.ok(names.includes("N8N_API_KEY"));
	const key = n8n.auth.env.find((e) => e.name === "N8N_API_KEY");
	assert.strictEqual(key.secret, true);
	assert.strictEqual(key.required, true);
});

t("unreal-engine was removed from the catalog (owner decision 2026-08-30) and stays absent", () => {
	assert.strictEqual(catalogEntryFor("unreal-engine"), undefined);
	assert.ok(!MCP_CATALOG.some((e) => e.name === "unreal-engine"));
});

t("every entry is structurally valid", () => {
	for (const e of MCP_CATALOG) {
		assert.ok(e.name && e.name.trim(), "name required");
		assert.ok(e.description, "description required");
		assert.ok(["stdio", "http"].includes(e.transport.type), `${e.name}: transport.type`);
		if (e.transport.type === "stdio") assert.ok(e.transport.command, `${e.name}: stdio needs command`);
		if (e.transport.type === "http") assert.ok(e.transport.url, `${e.name}: http needs url`);
		assert.ok(["api_key", "oauth", "none"].includes(e.auth.type), `${e.name}: auth.type`);
		if (e.install) assert.strictEqual(e.install.type, "git");
	}
});

t("isShaRef: 7–40 lowercase hex only", () => {
	assert.ok(isShaRef("7a9ae00795593aa1fdb4e61ecd640e8bfd0c3841"));
	assert.ok(isShaRef("7a9ae00"));
	assert.ok(!isShaRef("main"));
	assert.ok(!isShaRef("v1.2.3"));
	assert.ok(!isShaRef("7A9AE00795593AA1FDB4E61ECD640E8BFD0C3841"));
	assert.ok(!isShaRef("12345")); // too short
	assert.ok(!isShaRef(""));
});

t("expandInstallDir: substitutes ${INSTALL_DIR}, leaves the rest", () => {
	assert.strictEqual(expandInstallDir(`${INSTALL_DIR_VAR}/.venv/bin/python`, "/installs/n8n"), "/installs/n8n/.venv/bin/python");
	assert.strictEqual(expandInstallDir("python3 -m venv .venv", "/installs/n8n"), "python3 -m venv .venv");
	assert.strictEqual(expandInstallDir("", "/installs/n8n"), "");
});

t("buildServerConfig: stdio substitutes INSTALL_DIR in command+args", () => {
	const n8n = catalogEntryFor("n8n");
	const cfg = buildServerConfig(n8n, "/vault/.obsidian/plugins/openagent/mcp-installs/n8n");
	assert.strictEqual(cfg.transport, "stdio");
	assert.strictEqual(cfg.enabled, true);
	assert.strictEqual(cfg.command, "/vault/.obsidian/plugins/openagent/mcp-installs/n8n/.venv/bin/python");
	assert.deepStrictEqual(cfg.args, ["/vault/.obsidian/plugins/openagent/mcp-installs/n8n/server.py"]);
});

t("buildServerConfig: http copies url, no command", () => {
	/* Synthetic http entry — the catalog itself no longer ships an http
	   entry (unreal-engine removed 2026-08-30), but the http branch must
	   stay covered for user-configured http servers. */
	const http = {
		name: "example-http",
		description: "synthetic http entry",
		source: "https://example.invalid",
		transport: { type: "http", url: "http://127.0.0.1:8000/mcp" },
		auth: { type: "none", env: [] },
		tools: {},
	};
	const cfg = buildServerConfig(http);
	assert.strictEqual(cfg.transport, "http");
	assert.strictEqual(cfg.url, "http://127.0.0.1:8000/mcp");
	assert.strictEqual(cfg.command, undefined);
});

t("applyDefaultToolSelection: writes tools.include, keeps existing tools block", () => {
	const cfg = { enabled: true, transport: "stdio", tools: { exclude: ["x"] } };
	applyDefaultToolSelection(cfg, ["a", "b"]);
	assert.deepStrictEqual(cfg.tools.include, ["a", "b"]);
	assert.deepStrictEqual(cfg.tools.exclude, ["x"]);
	// empty/undefined default → no-op
	const cfg2 = { enabled: true };
	applyDefaultToolSelection(cfg2, undefined);
	assert.strictEqual(cfg2.tools, undefined);
	applyDefaultToolSelection(cfg2, []);
	assert.strictEqual(cfg2.tools, undefined);
});

t("end-to-end: n8n install config carries safe-by-default include", () => {
	const n8n = catalogEntryFor("n8n");
	const cfg = buildServerConfig(n8n, "/i/n8n");
	applyDefaultToolSelection(cfg, n8n.tools.default_enabled);
	assert.strictEqual(cfg.tools.include.length, 8);
	assert.ok(cfg.command.includes("/i/n8n"));
});

(async () => {
	let passed = 0;
	let failed = 0;
	for (const { name, fn } of tests) {
		try {
			await fn();
			passed++;
			console.log(`✓ ${name}`);
		} catch (err) {
			failed++;
			console.error(`✗ ${name}\n    ${err && err.message ? err.message : err}`);
		}
	}
	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
})();
