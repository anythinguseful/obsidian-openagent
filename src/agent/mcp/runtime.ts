/**
 * MCP runtime — owns the server lifecycles (stdio and HTTP) and exposes MCP
 * tools as AgentTool objects (mcp__<server>__<tool>) for the runner to inject.
 *
 * Lifecycle: servers connect lazily on the first tool listing after enable,
 * stay alive for the session, and are all closed on plugin unload. A server
 * that fails to spawn/connect or list tools is skipped (the agent simply
 * doesn't see it) — one broken server never breaks the whole agent.
 *
 * Gating: only when `mcpEnabled` AND first-use consent is present. Discovered
 * tools are cached; a config change (add/remove/edit server) invalidates the
 * cache for that server.
 */

import { requestUrl } from "obsidian";
import type { AgentTool, McpApi } from "../tools";
import { McpClient, type McpToolSchema } from "./client";
import { stdioTransportFor } from "./stdio";
import { HttpTransport, isHttpUrl, type McpHttpPost } from "./http";
import type { McpServerConfig, OpenAgentSettings } from "../../settings";

/** minimal env for spawned stdio servers — never ambient secrets */
function mcpEnv(serverEnv?: Record<string, string>): Record<string, string> {
	const env: Record<string, string> = {};
	const ambient = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	if (ambient) {
		for (const key of ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP"]) {
			if (typeof ambient[key] === "string") env[key] = ambient[key];
		}
	}
	for (const [k, v] of Object.entries(serverEnv ?? {})) env[k] = v;
	return env;
}

interface LiveServer {
	name: string;
	client: McpClient;
	tools: McpToolSchema[];
	configKey: string;
}

export class McpRuntime implements McpApi {
	private servers = new Map<string, LiveServer>();
	private closed = false;

	constructor(private getSettings: () => OpenAgentSettings, private resolveSecrets: (name: string) => Promise<Record<string, string>> = async () => ({})) {}

	/** Build the AgentTool list for all healthy, enabled servers. */
	async listTools(): Promise<AgentTool[]> {
		const settings = this.getSettings();
		if (!settings.mcpEnabled) return [];
		if (settings.mcpConsent.consentVersion < 1 || !settings.mcpConsent.consentReceipt) return [];
		const out: AgentTool[] = [];
		for (const [name, cfg] of Object.entries(settings.mcpServers ?? {})) {
			if (!cfg.enabled) continue;
			const secrets = await this.resolveSecrets(name);
			const live = await this.ensureServer(name, cfg, secrets);
			if (!live) continue;
			const include = cfg.tools?.include;
			const exclude = new Set(cfg.tools?.exclude ?? []);
			for (const tool of live.tools) {
				const toolName = tool.name;
				if (!toolName || toolName.length > 200) continue;
				if (include && !include.includes(toolName)) continue;
				if (exclude.has(toolName)) continue;
				const fullName = `mcp__${name}__${toolName}`;
				out.push(this.buildTool(name, tool, fullName));
			}
		}
		return out;
	}

	dispose(): void {
		this.closed = true;
		for (const [, s] of this.servers) s.client.close();
		this.servers.clear();
	}

	/* ------------------------------------------------------------------ */

	/** The same decision the settings UI makes: `transport: http`, or a URL
	 * with no command, means HTTP. Everything else is stdio. */
	private isHttp(cfg: McpServerConfig): boolean {
		return cfg.transport === "http" || (cfg.transport == null && !!cfg.url);
	}

	private configKey(name: string, cfg: McpServerConfig, secretNames: string[]): string {
		return JSON.stringify([name, cfg.transport, cfg.command, cfg.args, cfg.env, cfg.url, cfg.headers, secretNames.sort()]);
	}

	private async ensureServer(name: string, cfg: McpServerConfig, secrets: Record<string, string>): Promise<LiveServer | null> {
		const key = this.configKey(name, cfg, Object.keys(secrets));
		const existing = this.servers.get(name);
		if (existing && existing.configKey === key) return existing;
		if (existing) {
			existing.client.close();
			this.servers.delete(name);
		}

		const client = this.isHttp(cfg) ? await this.httpClient(name, cfg) : this.stdioClient(name, cfg, secrets);
		if (!client) return null;
		try {
			client.start();
			await client.initialize();
			const tools = await client.listTools();
			if (tools.length === 0) {
				client.close();
				return null;
			}
			const live: LiveServer = { name, client, tools, configKey: key };
			this.servers.set(name, live);
			return live;
		} catch (err) {
			client.close();
			console.warn(`[Open Agent] MCP server "${name}" failed to start: ${err instanceof Error ? err.message : String(err)}`);
			return null;
		}
	}

	private stdioClient(name: string, cfg: McpServerConfig, secrets: Record<string, string>): McpClient | null {
		if (!cfg.command || !cfg.command.trim()) return null;
		const transport = stdioTransportFor(cfg.command.trim(), cfg.args ?? [], mcpEnv({ ...(cfg.env ?? {}), ...secrets }));
		if (!transport) return null;
		return new McpClient(transport);
	}

	private async httpClient(name: string, cfg: McpServerConfig): Promise<McpClient | null> {
		const url = (cfg.url ?? "").trim();
		if (!url) return null;
		if (!isHttpUrl(url)) {
			console.warn(`[Open Agent] MCP server "${name}" has a non-http(s) URL and was skipped: ${url}`);
			return null;
		}
		const post: McpHttpPost = (u, headers, body) =>
			requestUrl({ url: u, method: "POST", headers, body, throw: false }).then((res) => ({
				status: res.status,
				headers: res.headers ?? {},
				text: res.text ?? "",
			}));
		return new McpClient(new HttpTransport(url, post, cfg.headers ?? {}));
	}

	private buildTool(server: string, tool: McpToolSchema, fullName: string): AgentTool {
		const description = tool.description?.trim() || `Tool "${tool.name}" from the ${server} MCP server.`;
		return {
			name: fullName,
			toolset: "mcp",
			description: `[MCP ${server}] ${description}`,
			parameters: normalizeSchema(tool.inputSchema),
			execute: async (args) => {
				const live = this.servers.get(server);
				if (!live || this.closed) throw new Error(`MCP server "${server}" is not connected.`);
				try {
					return await live.client.callTool(tool.name, (args ?? {}) as Record<string, unknown>);
				} catch (err) {
					throw new Error(`MCP tool ${tool.name} failed: ${err instanceof Error ? err.message : String(err)}`);
				}
			},
		};
	}
}

function normalizeSchema(inputSchema: Record<string, unknown> | undefined): Record<string, unknown> {
	if (inputSchema && typeof inputSchema === "object" && !Array.isArray(inputSchema)) {
		const obj = inputSchema as Record<string, unknown>;
		if (obj.type === "object" || obj.properties || obj.required) {
			return {
				type: obj.type ?? "object",
				...(obj.properties ? { properties: obj.properties } : {}),
				...(obj.required ? { required: obj.required } : {}),
				additionalProperties: false,
			};
		}
	}
	return { type: "object", properties: {}, additionalProperties: false };
}
