import type { McpCatalogEntry } from "./catalog";
import type { McpServerConfig } from "../../settings";

/** Plugin-private secret payload. Values never belong in OpenAgentSettings. */
export type McpSecretStoreData = Record<string, Record<string, string>>;

export interface McpSecretAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	remove?(path: string): Promise<void>;
}

/** Local per-vault secret persistence, deliberately separate from plugin settings. */
export class McpSecretStore {
	readonly path: string;

	constructor(adapter: McpSecretAdapter, pluginId: string) {
		this.adapter = adapter;
		this.path = `.obsidian/plugins/${pluginId}/mcp-secrets.json`;
	}

	private adapter: McpSecretAdapter;

	async load(): Promise<McpSecretStoreData> {
		if (!(await this.adapter.exists(this.path))) return {};
		try {
			const raw: unknown = JSON.parse(await this.adapter.read(this.path));
			if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
			const out: McpSecretStoreData = {};
			for (const [server, values] of Object.entries(raw as Record<string, unknown>)) {
				if (!values || typeof values !== "object" || Array.isArray(values)) continue;
				const safe: Record<string, string> = {};
				for (const [name, value] of Object.entries(values as Record<string, unknown>)) if (typeof value === "string" && value) safe[name] = value;
				if (Object.keys(safe).length) out[server] = safe;
			}
			return out;
		} catch {
			return {};
		}
	}

	async save(data: McpSecretStoreData): Promise<void> {
		await this.adapter.write(this.path, JSON.stringify(data));
	}

	async clear(): Promise<void> {
		if (this.adapter.remove && (await this.adapter.exists(this.path))) await this.adapter.remove(this.path);
	}
}

export function secretNames(entry: McpCatalogEntry): Set<string> {
	return new Set(entry.auth.env.filter((spec) => spec.secret).map((spec) => spec.name));
}

export function splitCatalogEnv(entry: McpCatalogEntry, values: Record<string, string>): { secret: Record<string, string>; config: Record<string, string> } {
	const names = secretNames(entry);
	const secret: Record<string, string> = {};
	const config: Record<string, string> = {};
	for (const [name, value] of Object.entries(values)) {
		if (names.has(name)) secret[name] = value;
		else config[name] = value;
	}
	return { secret, config };
}

/** Move only catalog-declared secrets out of a legacy config env block. */
export function stripCatalogSecrets(servers: Record<string, McpServerConfig>, lookup: (name: string) => McpCatalogEntry | undefined): Record<string, McpServerConfig> {
	const out: Record<string, McpServerConfig> = {};
	for (const [name, cfg] of Object.entries(servers)) {
		const entry = lookup(name);
		if (!entry) { out[name] = cfg; continue; }
		const env = { ...(cfg.env ?? {}) };
		for (const secret of secretNames(entry)) delete env[secret];
		const next = { ...cfg };
		if (Object.keys(env).length) next.env = env;
		else delete next.env;
		out[name] = next;
	}
	return out;
}

export function migrateLegacyMcpSecrets(entry: McpCatalogEntry, config: McpServerConfig, store: McpSecretStoreData): { config: McpServerConfig; store: McpSecretStoreData; moved: string[] } {
	const names = secretNames(entry);
	const env = { ...(config.env ?? {}) };
	const nextStore: McpSecretStoreData = { ...store, [entry.name]: { ...(store[entry.name] ?? {}) } };
	const moved: string[] = [];
	for (const name of names) {
		const value = env[name];
		if (value && !nextStore[entry.name][name]) {
			nextStore[entry.name][name] = value;
			moved.push(name);
		}
		delete env[name];
	}
	if (Object.keys(nextStore[entry.name]).length === 0) delete nextStore[entry.name];
	const nextConfig = { ...config };
	if (Object.keys(env).length) nextConfig.env = env;
	else delete nextConfig.env;
	return { config: nextConfig, store: nextStore, moved };
}
