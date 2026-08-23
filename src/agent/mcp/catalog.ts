/**
 * MCP catalog — a small curated set of servers the user can install in one
 * step, mirroring Hermes' `optional-mcps/<name>/manifest.yaml` catalog
 * (verified byte-level 2026-08-20 @ aeabff6).
 *
 * Parity scope, stated honestly:
 *   · Entries ship here as data (no per-entry YAML files — this is a plugin,
 *     not a repo with a review pipeline).
 *   · Only entries the plugin can actually run end-to-end are included:
 *     n8n (stdio + git clone + api-key env) and unreal-engine (http + none).
 *   · The remote OAuth entries in Hermes' catalog (airtable, asana, notion,
 *     linear, stripe, …) are deliberately absent: the plugin has no OAuth
 *     2.1 browser-flow runtime, so those servers would be installed but
 *     unusable — fail-closed means we do not offer them.
 *
 * Install translation mirrors `hermes_cli/mcp_catalog.py`:
 *   · `${INSTALL_DIR}` in `transport.command`/`args` is substituted with the
 *     local clone directory at install time.
 *   · git installs pin a full commit SHA and are never auto-updated; the user
 *     re-runs the install to refresh (wipes + re-clones for determinism).
 *   · `tools.default_enabled` becomes `tools.include` on the written config.
 */

import type { McpServerConfig } from "../../settings";

export interface McpCatalogEnvVar {
	name: string;
	prompt: string;
	required: boolean;
	secret: boolean;
	default?: string;
}

export interface McpCatalogInstall {
	type: "git";
	url: string;
	/** Full commit SHA (never a floating branch/tag). */
	ref: string;
	bootstrap: string[];
}

export interface McpCatalogTransport {
	type: "stdio" | "http";
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
}

export interface McpCatalogEntry {
	name: string;
	description: string;
	source: string;
	transport: McpCatalogTransport;
	install?: McpCatalogInstall;
	auth: { type: "api_key" | "oauth" | "none"; env: McpCatalogEnvVar[] };
	tools: { default_enabled?: string[] };
	post_install?: string;
}

export const INSTALL_DIR_VAR = "${INSTALL_DIR}";

/** Full-commit-SHA shape (7–40 lowercase hex) — `git clone --branch` cannot
 * take a SHA, so installs checkout after a full clone instead. */
export function isShaRef(ref: string): boolean {
	return /^[0-9a-f]{7,40}$/.test((ref ?? "").trim());
}

/** Substitute `${INSTALL_DIR}` in a manifest value; unchanged otherwise. */
export function expandInstallDir(value: string, installDir: string): string {
	return (value ?? "").split(INSTALL_DIR_VAR).join(installDir);
}

/** Translate a catalog manifest into the persisted `McpServerConfig` shape.
 * `installDir` is required only for entries whose transport references
 * `${INSTALL_DIR}`. */
export function buildServerConfig(entry: McpCatalogEntry, installDir?: string): McpServerConfig {
	const t = entry.transport;
	if (t.type === "stdio") {
		const cfg: McpServerConfig = { enabled: true, transport: "stdio" };
		if (t.command) cfg.command = expandInstallDir(t.command, installDir ?? "");
		if (t.args?.length) cfg.args = t.args.map((a) => expandInstallDir(a, installDir ?? ""));
		if (t.env) cfg.env = { ...t.env };
		return cfg;
	}
	const cfg: McpServerConfig = { enabled: true, transport: "http" };
	if (t.url) cfg.url = t.url;
	return cfg;
}

/** Write the catalog's safe-by-default tool selection into the config. */
export function applyDefaultToolSelection(cfg: McpServerConfig, defaultEnabled?: string[]): void {
	if (defaultEnabled && defaultEnabled.length > 0) {
		cfg.tools = { ...(cfg.tools ?? {}), include: [...defaultEnabled] };
	}
}

/* ------------------------------------------------------------------ */
/* catalog data                                                        */
/* ------------------------------------------------------------------ */

export const MCP_CATALOG: McpCatalogEntry[] = [
	{
		name: "n8n",
		description: "Manage and inspect n8n workflows (stdio bridge, no public port).",
		source: "https://github.com/CyberSamuraiX/hermes-n8n-mcp",
		transport: {
			type: "stdio",
			command: `${INSTALL_DIR_VAR}/.venv/bin/python`,
			args: [`${INSTALL_DIR_VAR}/server.py`],
		},
		install: {
			type: "git",
			url: "https://github.com/CyberSamuraiX/hermes-n8n-mcp.git",
			// Pinned per catalog dependency policy: full commit SHA. This SHA
			// is "feat: add local n8n MCP bridge for Hermes" (2026-05-23).
			ref: "7a9ae00795593aa1fdb4e61ecd640e8bfd0c3841",
			bootstrap: ["python3 -m venv .venv", ".venv/bin/pip install -r requirements.txt"],
		},
		auth: {
			type: "api_key",
			env: [
				{ name: "N8N_BASE_URL", prompt: "n8n instance URL", default: "http://127.0.0.1:5678", required: true, secret: false },
				{ name: "N8N_API_KEY", prompt: "n8n API key (generate under Settings → API)", required: true, secret: true },
			],
		},
		tools: {
			default_enabled: [
				"health",
				"list_workflows",
				"get_workflow",
				"find_workflows",
				"list_executions",
				"get_execution",
				"recent_failures",
				"export_workflow",
			],
		},
		post_install:
			"The n8n bridge expects a running n8n instance at the URL you provided. Generate an API key in n8n under Settings → API. Workflow activate/deactivate calls are real mutations against your live n8n — treat them carefully.",
	},
	{
		name: "unreal-engine",
		description: "Drive the Unreal Engine 5.8 editor over its local MCP server.",
		source: "https://dev.epicgames.com/documentation/unreal-engine/unreal-mcp-in-unreal-editor",
		transport: { type: "http", url: "http://127.0.0.1:8000/mcp" },
		auth: { type: "none", env: [] },
		tools: {},
		post_install:
			"This connects to Epic's official Unreal MCP plugin, which runs INSIDE the Unreal Editor. Enable it (Edit → Plugins → search “Unreal MCP”), restart the editor, then turn on “Auto Start Server” under Editor Preferences → General → Model Context Protocol. It binds to http://127.0.0.1:8000/mcp by default; if you change the port or path, update the URL here. Epic ships this as experimental — the server runs tool calls serially on the game thread.",
	},
];

export function catalogEntryFor(name: string): McpCatalogEntry | undefined {
	const n = (name ?? "").trim();
	return MCP_CATALOG.find((e) => e.name === n);
}
