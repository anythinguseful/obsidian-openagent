/**
 * Open Agent settings model.
 *
 * The section layout mirrors Hermes Desktop (apps/desktop):
 * General · Providers · Model · Chat · Profiles · Capabilities ·
 * Memory & Context · Sessions · Automations · Advanced
 */

/* Pure data module — no obsidian imports. agent/cron is likewise import-free
   (and only type-imports back), so this file bundles standalone for tests. */
import { migrateCronTasks } from "./agent/cron";
import {
	sanitizePromptQueue,
	sanitizePromptQueueScopes,
	type PromptQueueScopeState,
	type PromptQueueState,
} from "./agent/promptQueue";
import { dedupeModels, migrateLegacyFavoriteModels } from "./agent/modelCatalog";
import { sanitizeAuxModels, type AuxModelsState } from "./agent/contextManager";
import { normalizeMoaConfig, type MoaConfig } from "./agent/moa";
import {
	canonicalVaultPath,
	normalizeWorkspaceMode,
	sanitizeWorkspaceExclusions,
	type WorkspaceMode,
} from "./agent/workspacePolicy";

export type ReasoningEffort =
	| "none"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh"
	| "max"
	| "ultra";

/** Hermes: `--yolo` bypasses all approval prompts; `manual` asks for everything. */
export type ApprovalMode = "manual" | "cautious" | "yolo";

export interface ProviderConfig {
	id: string;
	name: string;
	/** OpenAI-compatible base URL, e.g. https://openrouter.ai/api/v1 */
	baseUrl: string;
	apiKey: string;
	enabled: boolean;
	/** extra headers to send with every request */
	customHeaders: Record<string, string>;
	/** THIS provider's model catalog (Hermes Desktop: per-endpoint `models`).
	   Filled by "Test connection" for this provider only — never shared. */
	models: string[];
}

export interface ToolsetConfig {
	vault: boolean;
	web: boolean;
	memory: boolean;
	skills: boolean;
	automations: boolean;
	clarify: boolean;
	todo: boolean;
	vision: boolean;
	delegation: boolean;
	/** Desktop-only terminal + owned background-process lifecycle. Off by default. */
	terminal: boolean;
}

export interface McpConsent {
	/** Versioned acknowledgement shown before MCP can be enabled. */
	consentVersion: number;
	/** Per-vault random receipt (never exported) — mirrors terminal consent. */
	consentReceipt: string;
}

export type TerminalBackend = "docker" | "local";

/** v0.1.146 Terminal & Processes v1. Secrets and arbitrary Docker flags are
 * deliberately absent: the agent cannot choose image, network, mounts, env,
 * or daemon options. */
export interface TerminalSettings {
	backend: TerminalBackend;
	dockerImage: string;
	/** Versioned acknowledgement shown before the toolset can be enabled. */
	consentVersion: number;
	/**
	 * Per-vault random receipt paired with a separate local-only ledger entry.
	 * It is never exported. A data.json/import edit cannot create first-use
	 * consent merely by setting consentVersion/toolsets.terminal.
	 */
	consentReceipt: string;
	/** Local has no containment; this second opt-in is intentionally separate. */
	localExpertEnabled: boolean;
}

export type WebSearchBackend = "ddgs" | "brave" | "tavily" | "searxng";

export interface WebSearchSettings {
	/** ddgs = DuckDuckGo HTML (no key, free) · brave = Brave free tier (key) ·
	 * tavily = Tavily (key) · searxng = self-hosted SearXNG instance (URL). */
	backend: WebSearchBackend;
	braveKey: string;
	tavilyKey: string;
	searxngUrl: string;
}

/* ── Prompt snippets ─────────────────────────────────────────
   Reusable prompt starters inserted from the composer [+] menu
   ("Prompt snippets…"). Seeded from the original home-screen
   suggestions; managed in Settings → Commands.
   An empty array is a valid user choice (never re-seeded). */

export interface PromptSnippet {
	id: string;
	title: string;
	text: string;
	/** v0.1.76 (Copilot showInContextMenu parity, opt-in): also offer this
	   snippet as a custom action in the editor right-click menu — the
	   snippet text + the quoted selection land in the composer */
	ctxMenu?: boolean;
	/** v0.1.77 (Copilot showInSlashMenu parity, opt-in): offer this
	   snippet as a /command in the composer slash menu — picking it
	   stages the full prompt text into the composer */
	slash?: boolean;
	/** v0.1.79 — composer [+] → "Prompt snippets…" picker. OPT-OUT (like
	   the skills' contextMenu flag): the picker listed EVERY snippet
	   before the flag existed, so absence = visible and only
	   `picker: false` hides. Inverse of the opt-in flags above, kept
	   deliberately so old vaults never lose picker rows silently */
	picker?: boolean;
	/** v0.1.85 — Quick Ask suggestion chips. OPT-IN (same shape as
	   ctxMenu/slash): flagged snippets replace the panel's built-in
	   suggestions; unflag everything and the built-ins come back.
	   Chip label = title, click stages `text` into the input (editable
	   before send — same staging rule as every other snippet surface) */
	quickAsk?: boolean;
}

export const DEFAULT_PROMPT_SNIPPETS: PromptSnippet[] = [
	{ id: "snip-default-1", title: "Summarize active note", text: "Summarize my active note and save the summary" },
	{ id: "snip-default-2", title: "Find meeting notes", text: "Search the vault for meeting notes and list them" },
	{ id: "snip-default-3", title: "What do you remember?", text: "What do you remember about me?" },
	{ id: "snip-default-4", title: "Plan my week", text: "Help me plan my week — create a note" },
];

let snippetSeq = 0;
export function newSnippetId(): string {
	return `snip-${Date.now().toString(36)}-${(snippetSeq++).toString(36)}`;
}

/** Drop malformed entries from persisted snippets; non-array → seed. */
export function sanitizeSnippets(value: unknown): PromptSnippet[] {
	if (!Array.isArray(value)) return DEFAULT_PROMPT_SNIPPETS.map((s) => ({ ...s }));
	const out: PromptSnippet[] = [];
	for (const raw of value) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
		const r = raw as Record<string, unknown>;
		const text = typeof r.text === "string" && r.text.trim() ? r.text : null;
		if (!text) continue;
		const title = typeof r.title === "string" && r.title.trim() ? r.title.trim() : text.trim().slice(0, 42);
		out.push({
			id: typeof r.id === "string" && r.id ? r.id : newSnippetId(),
			title,
			text,
			/* explicit true only — persisted blobs from before v0.1.76 stay
			   hidden from the editor menu until the user opts the row in */
			...(r.ctxMenu === true ? { ctxMenu: true } : {}),
			...(r.slash === true ? { slash: true } : {}),
			/* picker is the INVERSE (opt-out, v0.1.79): it persists only
			   when false — never let sanitize drop an explicit hide */
			...(r.picker === false ? { picker: false } : {}),
			...(r.quickAsk === true ? { quickAsk: true } : {}),
		});
	}
	return out;
}

/**
 * MCP server entry — follows the standard `mcp.json` shape (Hermes, Claude
 * Desktop, …): the server name is the map key, `command` → stdio, `url` →
 * HTTP. Configuration only; the runtime client comes later.
 */
// ── Skills hub (Browse Hub) ──

export type HubTrust = "trusted" | "community";

export interface HubTap {
	id: string;
	label: string;
	/** owner/repo[/subdir] */
	repo: string;
	trust: HubTrust;
}

export interface HubSkillMeta {
	name: string;
	dir: string;
	skillMd: string;
	description?: string;
}

/** 6h catalog cache of one tap (shape consumed by agent/hub.ts). */
export interface TapCacheEntry {
	branch: string;
	fetchedAt: number;
	skills: HubSkillMeta[];
	files: Record<string, { path: string; sha: string }[]>;
	truncated?: boolean;
}

export interface McpServerConfig {
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	headers?: Record<string, string>;
	transport?: "stdio" | "http";
	enabled: boolean;
	tools?: { include?: string[]; exclude?: string[] };
}

/**
 * Durable agent identity — injected verbatim into slot #1 of the system
 * prompt when the active profile has no SOUL text of its own
 * (mirrors Hermes' built-in fallback identity).
 */
export const DEFAULT_IDENTITY =
	"You are Open Agent, a careful, capable AI agent living inside the user's Obsidian vault. You think step by step, use your tools deliberately, and never invent file contents.";

/**
 * Personality overlays (Hermes `/personality`): SESSION-level prompt
 * layers that restyle the conversation on top of the durable SOUL —
 * they never overwrite the persisted identity (the overlay is a
 * session-scoped voice, exactly like Hermes' ephemeral system prompt).
 *
 * The 14 Hermes built-ins are VERBATIM from hermes_cli/personality.py
 * BUILTIN_PERSONALITIES (verified 2026-08-22, commit 261a4ef @main) —
 * the single owner Hermes Desktop mirrors via
 * apps/desktop/src/lib/personalities.ts. Kaomoji/emoji here are
 * MODEL-FACING prompt content, not UI chrome, so the "no emoji" UI
 * contract is unaffected. researcher/engineer/writer/librarian are our
 * vault-flavored extras (no Hermes counterpart).
 */
export const PERSONALITY_OVERLAYS: Record<string, string> = {
	helpful: "You are a helpful, friendly AI assistant.",
	concise: "You are a concise assistant. Keep responses brief and to the point.",
	technical: "You are a technical expert. Provide detailed, accurate technical information.",
	creative: "You are a creative assistant. Think outside the box and offer innovative solutions.",
	teacher: "You are a patient teacher. Explain concepts clearly with examples.",
	researcher: "Research mode — investigate widely across the vault, cross-reference notes, and synthesize structured summaries with cited file paths.",
	engineer: "Engineering mode — terse and precise: minimal reversible edits, verify every write by reading back, small tool calls over speculative ones.",
	writer: "Writing mode — draft and restructure prose in the user's voice, keep markdown clean, weave linked notes together naturally.",
	librarian: "Librarian mode — obsess over vault organization: consistent naming, frontmatter, tags, MOCs, folder hygiene; propose tidy structures first.",
	kawaii: "You are a kawaii assistant! Use cute expressions like (◕‿◕), ★, ♪, and ~! Add sparkles and be super enthusiastic about everything! Every response should feel warm and adorable desu~! ヽ(>∀<☆)ノ",
	catgirl: "You are Neko-chan, an anime catgirl AI assistant, nya~! Add 'nya' and cat-like expressions to your speech. Use kaomoji like (=^･ω･^=) and ฅ^•ﻌ•^ฅ. Be playful and curious like a cat, nya~!",
	pirate: "Arrr! Ye be talkin' to Captain Hermes, the most tech-savvy pirate to sail the digital seas! Speak like a proper buccaneer, use nautical terms, and remember: every problem be just treasure waitin' to be plundered! Yo ho ho!",
	shakespeare: "Hark! Thou speakest with an assistant most versed in the bardic arts. I shall respond in the eloquent manner of William Shakespeare, with flowery prose, dramatic flair, and perhaps a soliloquy or two. What light through yonder terminal breaks?",
	surfer: "Duuude! You're chatting with the chillest AI on the web, bro! Everything's gonna be totally rad. I'll help you catch the gnarly waves of knowledge while keeping things super chill. Cowabunga!",
	noir: "The rain hammered against the terminal like regrets on a guilty conscience. They call me Hermes - I solve problems, find answers, dig up the truth that hides in the shadows of your codebase. In this city of silicon and secrets, everyone's got something to hide. What's your story, pal?",
	uwu: "hewwo! i'm your fwiendwy assistant uwu~ i wiww twy my best to hewp you! *nuzzles your code* OwO what's this? wet me take a wook! i pwomise to be vewy hewpful >w<",
	philosopher: "Greetings, seeker of wisdom. I am an assistant who contemplates the deeper meaning behind every query. Let us examine not just the 'how' but the 'why' of your questions. Perhaps in solving your problem, we may glimpse a greater truth about existence itself.",
	hype: "YOOO LET'S GOOOO!!! I am SO PUMPED to help you today! Every question is AMAZING and we're gonna CRUSH IT together! This is gonna be LEGENDARY! ARE YOU READY?! LET'S DO THIS!",
};

/** Overlay key guard: "none" means no overlay (identity only). */
export function isOverlayKey(key: string): boolean {
	return key in PERSONALITY_OVERLAYS;
}

/** "KEY=VALUE" lines ↔ Record. */
export function kvToLines(kv: Record<string, string> | undefined): string {
	return Object.entries(kv ?? {})
		.map(([k, v]) => `${k}=${v}`)
		.join("\n");
}
export function linesToKv(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const i = line.indexOf("=");
		if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
	}
	return out;
}

/**
 * Mentally-tolerant mcp.json parser: accepts `{"mcpServers": {...}}`,
 * `{"mcp_servers": {...}}`, or a bare name→entry map. Throws Errors with
 * user-presentable messages.
 */
export function parseMcpServersDoc(raw: string): Record<string, McpServerConfig> {
	let doc: unknown;
	try {
		doc = JSON.parse(raw);
	} catch {
		throw new Error("invalid JSON");
	}
	if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
		throw new Error("document must be a JSON object");
	}
	let map = doc as Record<string, unknown>;
	if ("mcpServers" in map) map = map.mcpServers as Record<string, unknown>;
	else if ("mcp_servers" in map) map = map.mcp_servers as Record<string, unknown>;
	if (!map || typeof map !== "object" || Array.isArray(map)) {
		throw new Error('document must contain a "mcpServers" object');
	}
	const out: Record<string, McpServerConfig> = {};
	for (const [name, entry] of Object.entries(map)) {
		const srv = normalizeMcpEntry(entry);
		if (!srv) throw new Error(`server "${name}" is not a valid config object`);
		out[name] = srv;
	}
	if (Object.keys(out).length === 0) throw new Error("no servers found in document");
	return out;
}

/** Normalize one mcp.json server entry; null when not an object. */
function normalizeMcpEntry(entry: unknown): McpServerConfig | null {
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
	const e = entry as Record<string, unknown>;
	const srv: McpServerConfig = { enabled: e.enabled !== false };
	if (typeof e.command === "string") srv.command = e.command;
	if (Array.isArray(e.args)) srv.args = e.args.map((a) => String(a));
	else if (typeof e.args === "string") srv.args = e.args.split(/\s+/).filter(Boolean);
	if (typeof e.url === "string") srv.url = e.url;
	const transport = e.transport ?? e.type;
	if (transport === "stdio" || transport === "http") srv.transport = transport;
	if (e.env && typeof e.env === "object" && !Array.isArray(e.env)) {
		srv.env = {};
		for (const [k, v] of Object.entries(e.env as Record<string, unknown>)) srv.env[k] = String(v);
	}
	if (e.headers && typeof e.headers === "object" && !Array.isArray(e.headers)) {
		srv.headers = {};
		for (const [k, v] of Object.entries(e.headers as Record<string, unknown>)) srv.headers[k] = String(v);
	}
	if (e.tools && typeof e.tools === "object" && !Array.isArray(e.tools)) {
		const t = e.tools as Record<string, unknown>;
		srv.tools = {};
		if (Array.isArray(t.include)) srv.tools.include = t.include.map((x) => String(x));
		if (Array.isArray(t.exclude)) srv.tools.exclude = t.exclude.map((x) => String(x));
	}
	return srv;
}

/**
 * Migrate legacy MCP configs (array of `{id, name, command, args: string,
 * env: string}`) into the mcp.json map form. Map inputs are normalized;
 * anything else becomes `{}`.
 */
export function migrateMcpServers(value: unknown): Record<string, McpServerConfig> {
	if (Array.isArray(value)) {
		const out: Record<string, McpServerConfig> = {};
		for (const legacy of value) {
			if (!legacy || typeof legacy !== "object") continue;
			const l = legacy as Record<string, unknown>;
			const base =
				typeof l.name === "string" && l.name.trim()
					? l.name.trim()
					: typeof l.id === "string"
						? l.id
						: "server";
			const srv: McpServerConfig = { enabled: l.enabled !== false };
			if (typeof l.command === "string" && l.command.trim()) srv.command = l.command.trim();
			if (typeof l.args === "string") srv.args = l.args.split(/\s+/).filter(Boolean);
			if (typeof l.env === "string" && l.env.trim()) srv.env = linesToKv(l.env);
			let name = base;
			let n = 2;
			while (name in out) name = `${base}-${n++}`;
			out[name] = srv;
		}
		return out;
	}
	if (value && typeof value === "object") {
		const out: Record<string, McpServerConfig> = {};
		for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
			const srv = normalizeMcpEntry(entry);
			if (srv) out[name] = srv;
		}
		return out;
	}
	return {};
}

/* Cron automations — Hermes-style scheduled agent runs (see src/agent/cron.ts).
   v2 replaces intervalMinutes with a real schedule (preset or 5-field cron
   expression) plus an execution ledger (lastStatus, runCount, nextRun). */

export type CronRunStatus = "ok" | "error" | null;

export interface CronSchedule {
	kind: "preset" | "cron";
	/** 5-field cron expression (minute hour day month weekday) */
	expr: string;
	/** human label — preset label, or the raw expr for custom schedules */
	display: string;
}

export interface CronTask {
	id: string;
	name: string;
	prompt: string;
	schedule: CronSchedule;
	targetNote: string;
	/** false = paused */
	enabled: boolean;
	/** epoch ms of the next due run (computed from expr) */
	nextRun: number;
	lastRun: number;
	lastStatus: CronRunStatus;
	lastError?: string;
	runCount: number;
	createdAt: number;
	/* ── Tahap D (all optional — absent = legacy behaviour) ── */
	/** skill names this run should focus on (prompt-side injection) */
	skills?: string[];
	/** stop after N runs; null/absent = unlimited */
	maxRuns?: number | null;
	/** previous run output rides along in the next run's prompt */
	chainContext?: boolean;
	/** Notice on scheduled success (errors always Notice; manual runs always Notice) */
	notify?: boolean;
	/** previous run's trimmed output (≤2000 chars), the chaining payload */
	lastOutput?: string;
	/** Workspace exposure fingerprint that produced lastOutput. */
	lastWorkspaceScope?: string;
	/** v0.1.147 monitor: http(s) URL watched each tick — byte-hash compared;
	 * unchanged → the agent run is skipped entirely. */
	monitorUrl?: string;
	/** hash of the last monitored content that produced an agent run. */
	monitorLastHash?: string;
	/** previous monitored content (bounded) — diffed against the new one. */
	monitorLastContent?: string;
	/** v0.1.147 script/no_agent watchdog: file name under the protected
	 * `.obsidian/plugins/<id>/scripts/` folder, run each tick. */
	script?: string;
	/** when true the script's stdout IS the deliverable — no LLM call. */
	noAgent?: boolean;
}

/* ── Agent profiles (Hermes-style identities) ──────────────────────
   A profile = persona + optional provider/model pin + isolated
   memory/skills/sessions folders. The reserved "default" profile
   anchors the pre-profiles folders, so single-profile users see
   zero change after the migration. */

export type ProfileColor = "gray" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple";
export const PROFILE_COLORS: ProfileColor[] = ["gray", "red", "orange", "yellow", "green", "cyan", "blue", "purple"];
export const DEFAULT_PROFILE_ID = "default";

export interface AgentProfile {
	/** slug; "default" is reserved and folder-anchored — ids are immutable */
	id: string;
	name: string;
	color: ProfileColor;
	/**
	 * Durable identity (Hermes SOUL.md) — injected verbatim into slot #1
	 * of the system prompt. Empty → DEFAULT_IDENTITY fallback.
	 */
	soul: string;
	/** null = follow the global active provider */
	providerId: string | null;
	/** null = follow the global model */
	model: string | null;
	createdAt: number;
}

/** URL-ish slug from a display name, unique within `taken`. */
export function slugifyProfileId(name: string, taken: Set<string>): string {
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "profile";
	let id = base;
	let n = 2;
	while (taken.has(id)) id = `${base}-${n++}`;
	return id;
}

/** Map a legacy identity-preset key to an overlay key (or "none"). */
function legacyOverlayKey(key: unknown): string {
	if (typeof key !== "string") return "none";
	if (key === "default") return "none"; // the old "default" preset is now the default identity
	return isOverlayKey(key) ? key : "none";
}

export function makeDefaultProfile(): AgentProfile {
	return {
		id: DEFAULT_PROFILE_ID,
		name: "Default",
		color: "blue",
		soul: "",
		providerId: null,
		model: null,
		createdAt: Date.now(),
	};
}

function normalizeProfile(value: unknown, taken: Set<string>): AgentProfile | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const r = value as Record<string, unknown>;
	const name = typeof r.name === "string" && r.name.trim() ? r.name.trim() : null;
	if (!name) return null;
	const storedId = typeof r.id === "string" ? r.id.trim() : "";
	/* Profile ids become path segments for managed memory/skills and private
	   sessions. Preserve normal legacy ids, but never retain separators,
	   dot-only names, controls, or other Adapter-significant shapes. */
	let id = /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(storedId) && storedId !== "." && storedId !== ".."
		? storedId
		: slugifyProfileId(name, taken);
	if (taken.has(id)) id = slugifyProfileId(name, taken);
	taken.add(id);
	/* v1 → v2: the old model had identity-or-custom — `personality: "custom"`
	   plus `customPersona` becomes `soul`. Preset keys are NOT kept (v0.1.172):
	   Hermes profiles carry no personality — display.personality is a GLOBAL
	   Chat setting, never a per-profile field. */
	const migratedSoul =
		r.personality === "custom" && typeof r.customPersona === "string" ? r.customPersona : "";
	return {
		id,
		name,
		color: PROFILE_COLORS.includes(r.color as ProfileColor) ? (r.color as ProfileColor) : "blue",
		soul: typeof r.soul === "string" ? r.soul : migratedSoul,
		providerId: typeof r.providerId === "string" && r.providerId ? r.providerId : null,
		model: typeof r.model === "string" && r.model ? r.model : null,
		createdAt: typeof r.createdAt === "number" && r.createdAt > 0 ? r.createdAt : Date.now(),
	};
}

/**
 * Normalize persisted profiles (drop junk, heal dupes). When there are none
 * — fresh installs and pre-profiles vaults — seed a blank "Default".
 * Personality is NOT part of a profile (v0.1.172, Hermes parity): it is the
 * GLOBAL `personality` setting resolved in profiles.ts.
 */
export function migrateProfiles(value: unknown): AgentProfile[] {
	const taken = new Set<string>();
	const out: AgentProfile[] = [];
	if (Array.isArray(value)) {
		for (const raw of value) {
			const p = normalizeProfile(raw, taken);
			if (p) out.push(p);
		}
	}
	if (out.length === 0) out.push(makeDefaultProfile());
	return out;
}

/** activeProfileId must always point at an existing profile. */
export function normalizeActiveProfileId(value: unknown, profiles: AgentProfile[]): string {
	if (typeof value === "string" && profiles.some((p) => p.id === value)) return value;
	return profiles[0]?.id ?? DEFAULT_PROFILE_ID;
}

/** Native OS notification channels. Each channel is independently optional,
 *  while the master switch remains opt-in. */
export type NativeNotificationKind =
	| "turnDone"
	| "turnError"
	| "approvalRequired"
	| "inputRequired"
	| "backgroundDone"
	| "backgroundError";

export interface OpenAgentNotificationSettings {
	/** Native OS banners. Opt-in: Obsidian Notice behaviour is unchanged. */
	nativeEnabled: boolean;
	nativeKinds: Record<NativeNotificationKind, boolean>;
	/** App-generated Web Audio cue, independent from native banners. */
	completionSoundEnabled: boolean;
	/** 1-based id into the 14 synthesized completion cues. */
	completionSoundVariant: number;
}

export const COMPLETION_SOUND_VARIANT_COUNT = 14;
export const DEFAULT_COMPLETION_SOUND_VARIANT = 1;

export const DEFAULT_NOTIFICATION_SETTINGS: OpenAgentNotificationSettings = {
	nativeEnabled: false,
	nativeKinds: {
		turnDone: true,
		turnError: true,
		approvalRequired: true,
		inputRequired: true,
		backgroundDone: true,
		backgroundError: true,
	},
	completionSoundEnabled: false,
	completionSoundVariant: DEFAULT_COMPLETION_SOUND_VARIANT,
};

/** Deep, fail-closed normalization for opt-in masters and fail-open defaults
 *  for individual channels, so newly added kinds become available without
 *  silently enabling native notifications or sound. */
export function normalizeNotificationSettings(value: unknown): OpenAgentNotificationSettings {
	const r = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
	const kinds =
		r.nativeKinds && typeof r.nativeKinds === "object" && !Array.isArray(r.nativeKinds)
			? (r.nativeKinds as Record<string, unknown>)
			: {};
	const rawVariant = Math.floor(Number(r.completionSoundVariant));
	return {
		nativeEnabled: r.nativeEnabled === true,
		nativeKinds: {
			turnDone: kinds.turnDone !== false,
			turnError: kinds.turnError !== false,
			approvalRequired: kinds.approvalRequired !== false,
			inputRequired: kinds.inputRequired !== false,
			backgroundDone: kinds.backgroundDone !== false,
			backgroundError: kinds.backgroundError !== false,
		},
		completionSoundEnabled: r.completionSoundEnabled === true,
		completionSoundVariant:
			Number.isFinite(rawVariant) && rawVariant >= 1 && rawVariant <= COMPLETION_SOUND_VARIANT_COUNT
				? rawVariant
				: DEFAULT_COMPLETION_SOUND_VARIANT,
	};
}

export interface OpenAgentSettings {
	// ── General ──────────────────────────────────────────────
	locale: string;
	enterToSend: boolean;
	showTimestamps: boolean;
	ribbonIcon: boolean;
	/** Where a NEW chat leaf is opened: left sidebar, main workspace (tab),
	 * or right sidebar. An already-open chat is revealed in place regardless. */
	chatLeafLocation: "left" | "main" | "right";
	/** editor right-click menu: Add/Ask/Run-skill on the selection (v0.1.75) */
	editorContextMenu: boolean;
	/* v0.1.76 granular switches — which of the three built-in actions the
	   menu offers (the master toggle above still gates everything) */
	editorContextMenuAdd: boolean;
	editorContextMenuAsk: boolean;
	editorContextMenuSkill: boolean;
	editorContextMenuQuickAsk: boolean;

	// ── Providers ────────────────────────────────────────────
	providers: ProviderConfig[];
	activeProviderId: string;

	// ── Model ────────────────────────────────────────────────
	model: string;
	/**
	 * Ordered fallback chain (Hermes `fallback_providers`): tried in order
	 * when the primary model fails — 429/5xx after retries, 401/403/404
	 * immediately. Turn-scoped: the next message starts on the primary again.
	 */
	fallbackProviders: { providerId: string; model: string }[];
	reasoningEffort: ReasoningEffort;
	temperature: number;
	maxTokens: number;
	streaming: boolean;
	/* ── Context & compression (Hermes Desktop parity, v0.1.17) ── */
	/** context window override in tokens; 0 = auto (provider-advertised, else 256000) */
	modelContextLength: number;
	compressionEnabled: boolean;
	/** trigger when estimated wire tokens ≥ threshold × window (0.1–0.99) */
	compressionThreshold: number;
	/** trailing messages kept verbatim through compression (boundary snaps to a user message) */
	compressionProtectLastN: number;
	/** v0.1.175 (Hermes target_ratio): fraction of the trigger kept as the
	 *  verbatim recent tail (token-based). Complements protectLastN, which is
	 *  the minimum-MESSAGE floor. */
	compressionTargetRatio: number;
	/** auxiliary-model pins per task; absent/invalid = "auto (use main)" */
	auxModels: AuxModelsState;
	/** Mixture-of-Agents named presets (Hermes `moa` config, v0.1.29).
	   null = never saved → the virtual provider stays hidden everywhere
	   (Hermes explicit-only rule: the shipped default preset alone must not
	   make MoA appear; only a user-saved enabled preset does). */
	moa: MoaConfig | null;
	/** composer model-menu visibility (Hermes Desktop model-visibility store,
	    v0.1.32): explicit visible "provider::model" keys (+ "provider::"
	    hide-all sentinels), or null = never customized → curated defaults. */
	visibleModels: string[] | null;
	/** collapsed provider groups in the composer model menu (slugs). */
	collapsedMenuProviders: string[];
	/** one cheap call names a brand-new session after the first reply */
	titleGenerationEnabled: boolean;

	// ── Agent / Workspace ────────────────────────────────────
	/** Whole vault, legacy-compatible preferred routing, or fail-closed strict boundary. */
	workspaceMode: WorkspaceMode;
	workspaceFolder: string;
	/** Logical vault folders hidden from all agent-controlled/model-visible content. */
	workspaceExcludedFolders: string[];
	/** Maximum characters returned by one direct file read (paging required above it). */
	fileReadMaxChars: number;
	approvalMode: ApprovalMode;
	/** v0.1.147: approval prompts auto-deny after this many seconds. 0 = wait forever. */
	approvalTimeoutSec: number;
	/** v0.1.147: mask detected secrets in model-visible tool output (Hermes security.redact_secrets). */
	redactSecrets: boolean;
	/** v0.1.147: snapshot a file's previous content before the agent modifies/trashes it. */
	checkpointsEnabled: boolean;
	/** v0.1.151: prune rollback snapshots to the newest N per note (Hermes checkpoints.max_snapshots). */
	checkpointMaxSnapshots: number;
	/** v0.1.151: chars rendered inside a tool-call card before display slicing (Hermes tool_output.max_bytes parity, display-side). */
	toolOutputMaxChars: number;
	maxIterations: number;
	/**
	 * Global default /personality overlay (= Hermes display.personality, a
	 * global Chat setting — NOT per-profile). "none" = identity only; a
	 * session /personality overrides this per chat.
	 */
	personality: string;
	includeActiveNote: boolean;
	contextFile: string;
	/** reusable prompt starters — composer [+] menu → "Prompt snippets…" */
	promptSnippets: PromptSnippet[];

	// ── Profiles ─────────────────────────────────────────────
	profiles: AgentProfile[];
	activeProfileId: string;

	// ── Tools & Toolsets ─────────────────────────────────────
	// owner directive 2026-07-23: Hermes semantics — toolset switches only;
	// the per-tool layer (disabledTools) was removed and legacy keys purged
	toolsets: ToolsetConfig;
	/** Desktop-only execution backend. The terminal toolset remains the master switch. */
	terminal: TerminalSettings;
	/** Web search provider + keys (the `web_search` tool). */
	webSearch: WebSearchSettings;
	/** MCP first-use consent (runtime spawns external processes). */
	mcpConsent: McpConsent;

	// ── Skills ───────────────────────────────────────────────
	skillsEnabled: boolean;
	skillsFolder: string;
	autoCreateSkills: boolean;

	// ── MCP (Model Context Protocol) — config only ─────────────
	mcpEnabled: boolean;
	mcpServers: Record<string, McpServerConfig>;

	// ── Skills hub (Browse Hub) ──────────────────────────────
	/** extra GitHub taps ("owner/repo[/subdir]") added by the user */
	hubTaps: string[];
	/** 6h per-tap catalog cache (git trees), keyed by tap repo */
	hubCache: Record<string, TapCacheEntry>;
	/** queued prompts ("queue prompt", Hermes Desktop parity), keyed by session id */
	promptQueue: PromptQueueState;
	/** plugin-private queue provenance: session id → SessionStore partition */
	promptQueueScopes: PromptQueueScopeState;

	// ── Memory ───────────────────────────────────────────────
	memoryEnabled: boolean;
	memoryFolder: string;
	userProfileEnabled: boolean;
	memoryNudgeInterval: number;
	/** Char budget for MEMORY.md entries (enforced at write time). */
	memoryCharLimit: number;
	/** Char budget for USER.md entries (enforced at write time). */
	userCharLimit: number;
	/** v0.1.176 structured-memory engine (Hindsight-style, plugin-native). */
	memoryEngineEnabled: boolean;
	/** how often the engine distills the conversation into facts (1 = every turn) */
	memoryEngineRetainEveryN: number;
	/** max facts recalled + injected per message */
	memoryEngineRecallMax: number;
	/** v0.1.178 optional embedding model name (semantic recall); "" = off */
	memoryEngineEmbedModel: string;

	// ── Sessions ─────────────────────────────────────────────
	saveSessions: boolean;
	sessionsFolder: string;
	maxSessions: number;

	// ── Appearance ───────────────────────────────────────────
	/** How tool-call cards render in chat: expanded / collapsed / hidden. */
	toolViewMode: "expanded" | "collapsed" | "hidden";
	/** Start reasoning blocks collapsed (open while streaming otherwise). */
	reasoningCollapsedByDefault: boolean;
	/** Sessions panel row density. */
	sessionListDensity: "comfortable" | "compact";
	/** Show the intro (empty chat) screen. */
	showIntroScreen: boolean;
	/** Show the helpful/not-helpful reaction buttons. */
	showReactions: boolean;

	// ── Automations (cron) ───────────────────────────────────
	cronTasks: CronTask[];

	// ── Notifications (per vault) ────────────────────────────
	notifications: OpenAgentNotificationSettings;

	// ── Advanced ─────────────────────────────────────────────
	customSystemPrompt: string;
	debugMode: boolean;
	requestTimeoutMs: number;
}

export const PROVIDER_PRESETS: ProviderConfig[] = [
	{
		id: "nous-portal",
		name: "Nous Portal",
		baseUrl: "https://inference.nousresearch.com/v1",
		apiKey: "",
		enabled: false,
		customHeaders: {},
		models: [],
	},
	{
		id: "openrouter",
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		apiKey: "",
		enabled: false,
		customHeaders: {},
		models: [],
	},
	{
		id: "openai",
		name: "OpenAI",
		baseUrl: "https://api.openai.com/v1",
		apiKey: "",
		enabled: false,
		customHeaders: {},
		models: [],
	},
	{
		id: "anthropic",
		name: "Anthropic (OpenAI-compatible)",
		baseUrl: "https://api.anthropic.com/v1",
		apiKey: "",
		enabled: false,
		customHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
		models: [],
	},
	{
		id: "lmstudio",
		name: "LM Studio (local)",
		baseUrl: "http://localhost:1234/v1",
		apiKey: "lm-studio",
		enabled: false,
		customHeaders: {},
		models: [],
	},
	{
		id: "ollama",
		name: "Ollama (local)",
		baseUrl: "http://localhost:11434/v1",
		apiKey: "ollama",
		enabled: false,
		customHeaders: {},
		models: [],
	},
	{
		id: "custom",
		name: "Custom endpoint",
		baseUrl: "",
		apiKey: "",
		enabled: false,
		customHeaders: {},
		models: [],
	},
];

export const DEFAULT_SETTINGS: OpenAgentSettings = {
	locale: "en",
	/* v0.1.127 (owner): bawaan dibalik — kirim = Shift+Enter, Enter = baris
	   baru; toggle ON mengembalikan Enter-kirim. Ctrl/Cmd+Enter selalu kirim.
	   Nilai yang sudah TERSIMPAN di vault lama tetap dihormati — yang berubah
	   hanya bawaannya. */
	enterToSend: false,
	showTimestamps: false,
	ribbonIcon: true,
	/* v0.1.161: the chat has always opened in the right sidebar — keep that
	   as the default so existing vaults don't move. */
	chatLeafLocation: "right",
	editorContextMenu: true,
	editorContextMenuAdd: true,
	editorContextMenuAsk: true,
	editorContextMenuSkill: true,
	editorContextMenuQuickAsk: true,

	providers: PROVIDER_PRESETS.map((p) => ({ ...p, customHeaders: { ...p.customHeaders } })),
	activeProviderId: "openrouter",

	model: "",
	fallbackProviders: [],
	reasoningEffort: "medium",
	temperature: 0.7,
	maxTokens: 4096,
	streaming: true,

	modelContextLength: 0,
	compressionEnabled: true,
	/* Hermes parity (config_defaults compression.*): threshold 0.50 and
	   protect_last_n 20. Verified 2026-08-24 against the upstream docs table.
	   Saved vaults keep whatever they already persisted — only fresh installs
	   and an explicit ↺ reset land on these. */
	compressionThreshold: 0.5,
	compressionProtectLastN: 20,
	compressionTargetRatio: 0.2,
	auxModels: {},
	moa: null,
	visibleModels: null,
	collapsedMenuProviders: [],
	/* v0.1.147 (LM Studio latency): off by default — auto-titling costs one
	   extra model request right after the first reply, which reads as a slow
	   "processing prompt" on local models. Enable when titles matter more
	   than turn latency (aux slot may also point it at a fast model). */
	titleGenerationEnabled: false,

	workspaceMode: "whole-vault",
	workspaceFolder: "",
	workspaceExcludedFolders: [],
	fileReadMaxChars: 20_000,
	approvalMode: "cautious",
	approvalTimeoutSec: 0,
	redactSecrets: true,
	checkpointsEnabled: true,
	checkpointMaxSnapshots: 30,
	toolOutputMaxChars: 5000,
	maxIterations: 12,
	personality: "none",
	includeActiveNote: true,
	contextFile: "AGENTS.md",
	promptSnippets: DEFAULT_PROMPT_SNIPPETS.map((s) => ({ ...s })),

	profiles: [makeDefaultProfile()],
	activeProfileId: DEFAULT_PROFILE_ID,

	toolsets: {
		vault: true,
		web: true,
		memory: true,
		skills: true,
		automations: true,
		clarify: true,
		todo: true,
		vision: true,
		delegation: true,
		terminal: false,
	},
	terminal: {
		backend: "docker",
		dockerImage: "nikolaik/python-nodejs:python3.13-nodejs24-slim",
		consentVersion: 0,
		consentReceipt: "",
		localExpertEnabled: false,
	},

	webSearch: {
		backend: "ddgs",
		braveKey: "",
		tavilyKey: "",
		searxngUrl: "",
	},

	mcpConsent: {
		consentVersion: 0,
		consentReceipt: "",
	},

	skillsEnabled: true,
	skillsFolder: "openagent/openagent-skills",
	autoCreateSkills: true,

	mcpEnabled: false,
	mcpServers: {},

	hubTaps: [],
	hubCache: {},
	promptQueue: {},
	promptQueueScopes: {}, 

	memoryEnabled: true,
	memoryFolder: "openagent/openagent-memory",
	userProfileEnabled: true,
	memoryNudgeInterval: 8,
	memoryCharLimit: 4000,
	userCharLimit: 2500,
	memoryEngineEnabled: true,
	memoryEngineRetainEveryN: 1,
	memoryEngineRecallMax: 8,
	memoryEngineEmbedModel: "",

	saveSessions: true,
	sessionsFolder: "openagent/openagent-sessions",
	maxSessions: 100,

	toolViewMode: "collapsed",
	reasoningCollapsedByDefault: false,
	sessionListDensity: "comfortable",
	showIntroScreen: true,
	showReactions: true,

	cronTasks: [],

	notifications: {
		...DEFAULT_NOTIFICATION_SETTINGS,
		nativeKinds: { ...DEFAULT_NOTIFICATION_SETTINGS.nativeKinds },
	},

	customSystemPrompt: "",
	debugMode: false,
	requestTimeoutMs: 120000,
};

export function getActiveProvider(settings: OpenAgentSettings): ProviderConfig | null {
	return (
		settings.providers.find((p) => p.id === settings.activeProviderId) ??
		settings.providers.find((p) => p.enabled) ??
		null
	);
}

/* ── Load normalization (single source of truth) ─────────────────
   App startup AND settings import both funnel raw JSON through this
   one pipeline, so exports and older data.json versions always get
   the same migrations. Extracted from main.ts loadSettings — keep
   behaviour identical; the settings test-suite guards it. */

/** First-wins dedupe (aged/hand-edited data.json can carry repeat entries). */
function dedupeBy<T>(arr: T[], key: (x: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const x of arr ?? []) {
		const k = key(x);
		if (!k || seen.has(k)) continue;
		seen.add(k);
		out.push(x);
	}
	return out;
}

export function normalizeLoadedSettings(raw: any): OpenAgentSettings {
	const inRaw = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
	const s: OpenAgentSettings = Object.assign({}, DEFAULT_SETTINGS, inRaw);
	/* Managed roots reach Vault/Adapter sinks outside the model-visible
	   Workspace policy. Invalid imported values are replaced, never normalized
	   through traversal or forwarded to a later write/delete operation. */
	for (const [key, fallback] of [
		["skillsFolder", DEFAULT_SETTINGS.skillsFolder],
		["memoryFolder", DEFAULT_SETTINGS.memoryFolder],
		["sessionsFolder", DEFAULT_SETTINGS.sessionsFolder],
	] as const) {
		try {
			s[key] = canonicalVaultPath(inRaw[key] ?? fallback, { label: key });
		} catch {
			s[key] = fallback;
		}
	}
	// normalize legacy mcpServers (array form) into the mcp.json map
	s.mcpServers = migrateMcpServers(s.mcpServers);
	// toolsets: deep-merge so new toolsets receive their explicit safe default.
	s.toolsets = { ...DEFAULT_SETTINGS.toolsets, ...(inRaw.toolsets ?? {}) };
	for (const key of Object.keys(DEFAULT_SETTINGS.toolsets) as (keyof ToolsetConfig)[]) {
		s.toolsets[key] = s.toolsets[key] === true;
	}
	/* Terminal v1: the generic load/import normalizer always fails closed for
	   consent. App startup may restore a legitimate persisted acknowledgement
	   only through restorePersistedTerminalConsent(), which requires the exact
	   random receipt from a separate per-vault local ledger. Thus an import or
	   a hand edit that merely flips consentVersion/toolsets cannot create first
	   use consent. Execution values remain bounded even while disabled. */
	{
		const rawTerminal = inRaw.terminal && typeof inRaw.terminal === "object" && !Array.isArray(inRaw.terminal)
			? inRaw.terminal
			: {};
		const imageRaw = typeof rawTerminal.dockerImage === "string" ? rawTerminal.dockerImage.trim() : DEFAULT_SETTINGS.terminal.dockerImage;
		const image = imageRaw && imageRaw.length <= 256 && !/[\u0000-\u001f\u007f]/.test(imageRaw)
			? imageRaw
			: DEFAULT_SETTINGS.terminal.dockerImage;
		s.terminal = {
			backend: rawTerminal.backend === "local" ? "local" : "docker",
			dockerImage: image,
			consentVersion: 0,
			consentReceipt: "",
			localExpertEnabled: rawTerminal.localExpertEnabled === true,
		};
		s.toolsets.terminal = false;
	}
	/* MCP v1 (2026-08-19): same fail-closed consent shape as Terminal — the
	   runtime spawns external processes. An import or hand edit cannot mint
	   consent; only the checked first-use modal (via the plugin's ledger) can. */
	{
		const rawMcp = inRaw.mcpConsent && typeof inRaw.mcpConsent === "object" && !Array.isArray(inRaw.mcpConsent)
			? inRaw.mcpConsent
			: {};
		s.mcpConsent = {
			consentVersion: 0,
			consentReceipt: "",
		};
		/* master switch stays opt-in (default false); consent gates the runtime */
		s.mcpEnabled = inRaw.mcpEnabled === true;
	}
	// cron tasks: migrate legacy interval-based tasks to scheduled v2
	s.cronTasks = dedupeBy(migrateCronTasks(inRaw.cronTasks), (t) => t.id);
	// notifications: nested settings need an explicit deep normalization;
	// both masters remain opt-in for existing vaults and malformed data.
	s.notifications = normalizeNotificationSettings(inRaw.notifications);
	// prompt snippets: seed when absent, sanitize entries, respect user's []
	s.promptSnippets = dedupeBy(sanitizeSnippets(inRaw.promptSnippets), (x) => x.id);
	// global personality: Hermes display.personality parity — a single global
	// overlay default ("none" = identity only), never a per-profile field
	s.personality = legacyOverlayKey(inRaw.personality);
	// profiles: seed a blank "Default" when absent (personality is global)
	s.profiles = migrateProfiles(inRaw.profiles);
	s.activeProfileId = normalizeActiveProfileId(inRaw.activeProfileId, s.profiles);

	/* Workspace v0.1.145: a legacy empty root migrates to Whole; a legacy
	   non-empty root migrates to Preferred. Strict is explicit opt-in only. */
	s.workspaceMode = normalizeWorkspaceMode(inRaw.workspaceMode, inRaw.workspaceFolder);
	s.workspaceFolder = typeof inRaw.workspaceFolder === "string"
		? inRaw.workspaceFolder.trim().normalize("NFC")
		: "";
	s.workspaceExcludedFolders = sanitizeWorkspaceExclusions(inRaw.workspaceExcludedFolders);
	{
		const rawLimit = Number(inRaw.fileReadMaxChars);
		const limit = Number.isFinite(rawLimit) ? Math.floor(rawLimit) : DEFAULT_SETTINGS.fileReadMaxChars;
		s.fileReadMaxChars = Math.min(20_000, Math.max(1_000, limit));
	}
	/* v0.1.148 memory budgets: clamped to a sane band; malformed values
	   (null/undefined/empty/non-numeric) fall back to the defaults. */
	{
		const toNum = (raw: unknown): number =>
			raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
		const memNum = toNum(inRaw.memoryCharLimit);
		s.memoryCharLimit = Number.isFinite(memNum)
			? Math.min(20_000, Math.max(500, Math.floor(memNum)))
			: DEFAULT_SETTINGS.memoryCharLimit;
		const userNum = toNum(inRaw.userCharLimit);
		s.userCharLimit = Number.isFinite(userNum)
			? Math.min(20_000, Math.max(500, Math.floor(userNum)))
			: DEFAULT_SETTINGS.userCharLimit;
	}
	/* v0.1.176 structured-memory engine: default-ON toggle, clamped counts. */
	s.memoryEngineEnabled = s.memoryEngineEnabled !== false;
	{
		const ren = Number(inRaw.memoryEngineRetainEveryN);
		s.memoryEngineRetainEveryN = Number.isFinite(ren)
			? Math.min(10, Math.max(1, Math.floor(ren)))
			: DEFAULT_SETTINGS.memoryEngineRetainEveryN;
		const rmax = Number(inRaw.memoryEngineRecallMax);
		s.memoryEngineRecallMax = Number.isFinite(rmax)
			? Math.min(20, Math.max(3, Math.floor(rmax)))
			: DEFAULT_SETTINGS.memoryEngineRecallMax;
		s.memoryEngineEmbedModel =
			typeof inRaw.memoryEngineEmbedModel === "string" ? inRaw.memoryEngineEmbedModel.trim().slice(0, 200) : "";
	}
	/* v0.1.150 appearance: enum-ish fields fail to their defaults on bad
	   input; default-ON toggles use `!== false` (absent → current behaviour),
	   default-OFF toggles use `=== true` (absent → off). */
	{
		s.toolViewMode =
			inRaw.toolViewMode === "expanded" || inRaw.toolViewMode === "hidden" ? inRaw.toolViewMode : "collapsed";
		s.reasoningCollapsedByDefault = inRaw.reasoningCollapsedByDefault === true;
		s.sessionListDensity = inRaw.sessionListDensity === "compact" ? "compact" : "comfortable";
		s.showIntroScreen = inRaw.showIntroScreen !== false;
		s.showReactions = inRaw.showReactions !== false;
	}
	/* v0.1.161: chat leaf location enum — invalid falls back to the
	   right-sidebar default (the chat's historical home). */
	{
		s.chatLeafLocation =
			inRaw.chatLeafLocation === "left" || inRaw.chatLeafLocation === "main" || inRaw.chatLeafLocation === "right"
				? inRaw.chatLeafLocation
				: "right";
	}
	/* v0.1.147 safety: approval timeout 0–600s; redact/checkpoints are booleans
	   that fail to their (safe) defaults when malformed. */
	{
		const rawTimeout = Number(inRaw.approvalTimeoutSec);
		const t = Number.isFinite(rawTimeout) ? Math.floor(rawTimeout) : 0;
		s.approvalTimeoutSec = Math.min(600, Math.max(0, t));
		s.redactSecrets = inRaw.redactSecrets !== false;
		s.checkpointsEnabled = inRaw.checkpointsEnabled !== false;
	}
	/* v0.1.151 advanced: bounded integers, malformed → defaults. */
	{
		const num = (raw: unknown): number =>
			raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
		const rawCp = num(inRaw.checkpointMaxSnapshots);
		s.checkpointMaxSnapshots = Number.isFinite(rawCp)
			? Math.min(200, Math.max(5, Math.floor(rawCp)))
			: DEFAULT_SETTINGS.checkpointMaxSnapshots;
		const rawOut = num(inRaw.toolOutputMaxChars);
		s.toolOutputMaxChars = Number.isFinite(rawOut)
			? Math.min(50_000, Math.max(1_000, Math.floor(rawOut)))
			: DEFAULT_SETTINGS.toolOutputMaxChars;
	}
	/* Web search: sanitize backend + keys (bounded, control-char-free), keep
	   only valid enum values so a hand-edited data.json can't inject junk. */
	{
		const rawWs = inRaw.webSearch && typeof inRaw.webSearch === "object" && !Array.isArray(inRaw.webSearch) ? inRaw.webSearch : {};
		const cleanKey = (v: unknown): string => {
			const str = typeof v === "string" ? v.trim() : "";
			return str.length <= 512 && !/[\u0000-\u001f\u007f]/.test(str) ? str : "";
		};
		const backend = rawWs.backend === "brave" || rawWs.backend === "tavily" || rawWs.backend === "searxng" ? rawWs.backend : "ddgs";
		let searxngUrl = cleanKey(rawWs.searxngUrl);
		if (searxngUrl && !/^https?:\/\//i.test(searxngUrl)) searxngUrl = "";
		s.webSearch = {
			backend,
			braveKey: cleanKey(rawWs.braveKey),
			tavilyKey: cleanKey(rawWs.tavilyKey),
			searxngUrl,
		};
	}

	// owner directive 2026-07-23: purge the legacy per-tool layer — old
	// data.json files may still carry "disabledTools"; drop it on load so
	// nothing stays disabled by an invisible switch (Hermes: toolsets only)
	delete (s as unknown as Record<string, unknown>).disabledTools;
	s.fallbackProviders = dedupeBy(
		(Array.isArray(s.fallbackProviders) ? s.fallbackProviders : []).filter(
			(f): f is { providerId: string; model: string } =>
				!!f && typeof f === "object" && typeof (f as any).providerId === "string"
		),
		(f) => `${f.providerId}\u001f${f.model}`
	);
	s.hubTaps = dedupeBy(
		(Array.isArray(s.hubTaps) ? s.hubTaps : []).filter((t): t is string => typeof t === "string" && !!t.trim()),
		(t) => t.trim()
	);
	// queued prompts: shape/sanity gate on load (queue prompt, owner 2026-07-26)
	s.promptQueue = sanitizePromptQueue(s.promptQueue);
	s.promptQueueScopes = sanitizePromptQueueScopes(s.promptQueueScopes);
	for (const sid of Object.keys(s.promptQueueScopes)) {
		if (!s.promptQueue[sid]) delete s.promptQueueScopes[sid];
	}
	// composer model menu (v0.1.32): visible-model keys are strings or null;
	// collapsed providers are slug strings
	s.visibleModels = Array.isArray(inRaw.visibleModels)
		? (inRaw.visibleModels as unknown[]).filter((x): x is string => typeof x === "string")
		: null;
	s.collapsedMenuProviders = Array.isArray(inRaw.collapsedMenuProviders)
		? (inRaw.collapsedMenuProviders as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim())
		: [];

	// merge providers with presets by id so future presets appear automatically
	const loaded = Array.isArray(inRaw.providers) ? inRaw.providers : [];
	s.providers = PROVIDER_PRESETS.map((preset) => {
		const found = loaded.find((p: any) => p?.id === preset.id);
		return found
			? { ...preset, ...found, customHeaders: { ...preset.customHeaders, ...(sanitizeCustomHeaders(found.customHeaders) ?? {}) } }
			: { ...preset, customHeaders: { ...preset.customHeaders } };
	});
	// per-provider model catalogs (Hermes Desktop parity, v0.1.14): sanitize
	// each provider's own list, then fold the pre-v0.1.14 GLOBAL flat catalog
	// (favoriteModels) onto the ACTIVE provider's empty catalog — one shared
	// drawer let a test on provider B silently break provider A (owner report)
	for (const p of s.providers) p.models = dedupeModels(p.models);
	migrateLegacyFavoriteModels(s, inRaw.favoriteModels);
	delete (s as unknown as Record<string, unknown>).favoriteModels;

	/* context & compression (v0.1.17): clamps + stale aux pins return to auto */
	s.modelContextLength = Math.max(0, Math.floor(Number(s.modelContextLength) || 0));
	s.compressionEnabled = s.compressionEnabled !== false;
	/* fallbacks read DEFAULT_SETTINGS rather than repeating the literal, so a
	   default change (e.g. the 2026-08-24 Hermes alignment 0.8→0.5, 4→20)
	   cannot leave the reject path pointing at the retired value. */
	{
		const t = Number(s.compressionThreshold);
		s.compressionThreshold =
			Number.isFinite(t) && t >= 0.1 && t <= 0.99 ? t : DEFAULT_SETTINGS.compressionThreshold;
	}
	{
		const n = Math.floor(Number(s.compressionProtectLastN));
		s.compressionProtectLastN =
			Number.isFinite(n) && n >= 0 && n <= 24 ? n : DEFAULT_SETTINGS.compressionProtectLastN;
	}
	{
		const r = Number(s.compressionTargetRatio);
		s.compressionTargetRatio =
			Number.isFinite(r) && r >= 0.05 && r <= 0.5 ? r : DEFAULT_SETTINGS.compressionTargetRatio;
	}
	s.titleGenerationEnabled = s.titleGenerationEnabled !== false;
	s.auxModels = sanitizeAuxModels(inRaw.auxModels, s.providers);
	/* MoA (v0.1.29): tolerate hand-edited data.json — a present but junk
	   config normalizes to the default preset; absent/null stays null so
	   the virtual provider only appears once the user has SAVED a preset
	   (Hermes explicit-only rule vs the shipped DEFAULT_CONFIG). Hand-edited
	   null/false/scalar → null (never silently "user enabled MoA"). */
	{
		const rawMoa = inRaw.moa;
		s.moa =
			rawMoa && typeof rawMoa === "object" && !Array.isArray(rawMoa) && Object.keys(rawMoa).length > 0
				? normalizeMoaConfig(rawMoa)
				: null;
	}
	return s;
}

const TERMINAL_CONSENT_RECEIPT_RE = /^[a-f0-9]{64}$/;

/**
 * Restore a consent acknowledged through this vault's first-use modal.
 *
 * normalizeLoadedSettings() deliberately rejects consent by itself. Startup
 * may call this only with the separate local-ledger receipt. The receipt must
 * exactly match the bounded private value persisted in data.json, so flipping
 * imported/hand-edited booleans is insufficient. The caller owns the ledger;
 * this pure helper never reads browser or platform state.
 */
export function restorePersistedTerminalConsent(
	s: OpenAgentSettings,
	raw: unknown,
	ledgerReceipt: unknown
): OpenAgentSettings {
	const root = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, any> : {};
	const terminal = root.terminal && typeof root.terminal === "object" && !Array.isArray(root.terminal)
		? root.terminal as Record<string, any>
		: {};
	const receipt = typeof ledgerReceipt === "string" ? ledgerReceipt : "";
	if (
		TERMINAL_CONSENT_RECEIPT_RE.test(receipt) &&
		terminal.consentReceipt === receipt &&
		Number(terminal.consentVersion) === 1
	) {
		s.terminal.consentVersion = 1;
		s.terminal.consentReceipt = receipt;
		s.toolsets.terminal = root.toolsets?.terminal === true;
	}
	return s;
}

const MCP_CONSENT_RECEIPT_RE = /^[a-f0-9]{64}$/;

/** Restore MCP first-use consent only when data.json and the per-vault local
 * ledger carry the exact same random receipt (mirrors terminal consent). */
export function restorePersistedMcpConsent(
	s: OpenAgentSettings,
	raw: unknown,
	ledgerReceipt: unknown,
): OpenAgentSettings {
	const root = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, any>) : {};
	const consent = root.mcpConsent && typeof root.mcpConsent === "object" && !Array.isArray(root.mcpConsent)
		? (root.mcpConsent as Record<string, any>)
		: {};
	const receipt = typeof ledgerReceipt === "string" ? ledgerReceipt : "";
	if (
		MCP_CONSENT_RECEIPT_RE.test(receipt) &&
		consent.consentReceipt === receipt &&
		Number(consent.consentVersion) === 1
	) {
		s.mcpConsent.consentVersion = 1;
		s.mcpConsent.consentReceipt = receipt;
	}
	return s;
}

/* ── Export / import (data portability — docs/plans/data-portability-plan.md) ── */

export const EXPORT_SCHEMA_VERSION = 1;

/** Header names that may carry credentials — redacted alongside apiKey. */
const SENSITIVE_HEADER_RE = /^(authorization|x-api-key|proxy-authorization|cookie)$/i;
/** `JSON.parse` accepts far more than an object: `null`, `123`, `"halo"` and
 * `[1,2]` are all valid JSON. The Custom headers field stored whatever came
 * back, so typing `null` crashed the next Settings render on
 * `Object.keys(null)`, and a bare string spread into per-character headers
 * (`{"0":"h","1":"a",…}`) that were then sent on every provider request. Only
 * a plain object of string values is a header map — anything else is rejected
 * here, at the boundary, so neither the UI nor the wire ever sees it. */
export function sanitizeCustomHeaders(value: unknown): Record<string, string> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (!k.trim() || typeof v !== "string") return null;
		out[k] = v;
	}
	return out;
}

/** Env-var names that are almost always credentials — blanked on export. */
const SENSITIVE_ENV_RE = /(api[_-]?key|secret|token|password|passwd|credential|bearer)/i;

/** Deep-copy settings with API keys and credential-looking headers stripped (safe to share). */
export function redactSettingsSecrets(s: OpenAgentSettings): OpenAgentSettings {
	const clone = JSON.parse(JSON.stringify(s)) as OpenAgentSettings;
	for (const p of clone.providers ?? []) {
		p.apiKey = "";
		if (p.customHeaders) {
			for (const k of Object.keys(p.customHeaders)) {
				if (SENSITIVE_HEADER_RE.test(k)) p.customHeaders[k] = "";
			}
		}
	}
	if (clone.webSearch) {
		clone.webSearch.braveKey = "";
		clone.webSearch.tavilyKey = "";
	}
	/* MCP servers carry env (e.g. N8N_API_KEY) and headers that can hold
	   credentials — blank anything secret-shaped on export, same as provider
	   keys. */
	for (const srv of Object.values(clone.mcpServers ?? {})) {
		/* Bind the maps once: the loop body writes back into them, and the reader
		   must see the same object the keys came from. */
		const env = srv.env;
		if (env) {
			for (const k of Object.keys(env)) {
				if (SENSITIVE_ENV_RE.test(k)) env[k] = "";
			}
		}
		const headers = srv.headers;
		if (headers) {
			for (const k of Object.keys(headers)) {
				if (SENSITIVE_HEADER_RE.test(k)) headers[k] = "";
			}
		}
	}
	return clone;
}

export interface SettingsExportDoc {
	openagentExport: "settings";
	version: number;
	exportedAt: string;
	pluginVersion: string;
	redacted: boolean;
	settings: Record<string, unknown>;
}

/** Snapshot of all settings (minus the hub cache — refetched on demand, never worth exporting). */
export function buildSettingsExport(
	s: OpenAgentSettings,
	includeKeys: boolean,
	pluginVersion: string
): SettingsExportDoc {
	const payload = includeKeys ? (JSON.parse(JSON.stringify(s)) as OpenAgentSettings) : redactSettingsSecrets(s);
	delete (payload as any).hubCache;
	// queued prompts are runtime choreography, not configuration (same class as hubCache)
	delete (payload as any).promptQueue;
	delete (payload as any).promptQueueScopes;
	/* Terminal consent is a local first-use acknowledgement, not portable
	   configuration. Never export its private receipt or an enabled switch. */
	if (payload.terminal) {
		payload.terminal.consentVersion = 0;
		delete (payload.terminal as Partial<TerminalSettings>).consentReceipt;
	}
	if (payload.toolsets) payload.toolsets.terminal = false;
	return {
		openagentExport: "settings",
		version: EXPORT_SCHEMA_VERSION,
		exportedAt: new Date().toISOString(),
		pluginVersion,
		redacted: !includeKeys,
		settings: payload as unknown as Record<string, unknown>,
	};
}

/** Shared doc validation: JSON shape + schema version (rejects newer files with a clear message). */
function parseExportDoc(text: string): Record<string, unknown> {
	let doc: unknown;
	try {
		doc = JSON.parse(text);
	} catch {
		throw new Error("Not valid JSON — paste the exact contents of the export file.");
	}
	if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
		throw new Error("Not an Open Agent export (expected a JSON object).");
	}
	const d = doc as Record<string, unknown>;
	if (d.openagentExport !== "settings" && d.openagentExport !== "profile") {
		throw new Error('Not an Open Agent export (expected "openagentExport": "settings" or "profile").');
	}
	if (typeof d.version !== "number" || d.version < 1) {
		throw new Error("Not an Open Agent export (missing schema version).");
	}
	if (d.version > EXPORT_SCHEMA_VERSION) {
		throw new Error("This export was written by a newer version of Open Agent — update the plugin, then retry.");
	}
	return d;
}

/** Validate a settings export; returns the raw settings payload for normalizeLoadedSettings. */
export function parseSettingsExport(text: string): Record<string, unknown> {
	const d = parseExportDoc(text);
	if (d.openagentExport === "profile") {
		throw new Error("That file is a profile bundle — import it from the Profiles tab instead.");
	}
	if (!d.settings || typeof d.settings !== "object" || Array.isArray(d.settings)) {
		throw new Error("Export is missing its settings payload.");
	}
	return d.settings as Record<string, unknown>;
}

export interface ProfileExportSkill {
	name: string;
	whenToUse: string;
	instructions: string;
}

export interface ProfileExportPayload {
	name: string;
	soul: string;
	providerId: string | null;
	model: string | null;
	color: ProfileColor;
	skills?: ProfileExportSkill[];
}

export interface ProfileExportDoc {
	openagentExport: "profile";
	version: number;
	exportedAt: string;
	profile: ProfileExportPayload;
}

/** Bundle a profile's persona (soul + pins + color). No secrets by construction (pins are ids, not keys). */
export function buildProfileExport(p: AgentProfile, skills?: ProfileExportSkill[]): ProfileExportDoc {
	const profile: ProfileExportPayload = {
		name: p.name,
		soul: p.soul,
		providerId: p.providerId ?? null,
		model: p.model ?? null,
		color: p.color,
	};
	const clean = (skills ?? [])
		.filter((sk) => sk && typeof sk.name === "string" && sk.name.trim())
		.map((sk) => ({
			name: sk.name.trim(),
			whenToUse: String(sk.whenToUse ?? ""),
			instructions: String(sk.instructions ?? ""),
		}));
	if (clean.length) profile.skills = clean;
	return {
		openagentExport: "profile",
		version: EXPORT_SCHEMA_VERSION,
		exportedAt: new Date().toISOString(),
		profile,
	};
}

/** Validate a soul bundle; returns a sanitized payload for creating a NEW profile. */
export function parseProfileExport(text: string): ProfileExportPayload {
	const d = parseExportDoc(text);
	if (d.openagentExport === "settings") {
		throw new Error("That file is a settings export — import it from the General tab instead.");
	}
	const p = d.profile as Record<string, unknown> | undefined;
	if (!p || typeof p !== "object" || Array.isArray(p)) {
		throw new Error("Bundle is missing its profile payload.");
	}
	const name = typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 60) : "";
	if (!name) throw new Error("Bundle has no profile name.");
	if (p.skills != null && !Array.isArray(p.skills)) {
		throw new Error("Bundle skills must be an array.");
	}
	const skills = (Array.isArray(p.skills) ? p.skills : []).map((sk: any, index: number) => {
		const name = typeof sk?.name === "string" ? sk.name.trim() : "";
		const instructions = typeof sk?.instructions === "string" ? sk.instructions : "";
		if (!name || !instructions.trim()) {
			throw new Error(`Bundle skill ${index + 1} must include a name and instructions.`);
		}
		return {
			name,
			whenToUse: typeof sk?.whenToUse === "string" ? sk.whenToUse : "",
			instructions,
		};
	});
	return {
		name,
		soul: typeof p.soul === "string" ? p.soul : "",
		providerId: typeof p.providerId === "string" && p.providerId ? p.providerId : null,
		model: typeof p.model === "string" && p.model ? p.model : null,
		color: (PROFILE_COLORS as string[]).includes(p.color as string) ? (p.color as ProfileColor) : "gray",
		...(skills.length ? { skills } : {}),
	};
}

/** First free "Name", "Name (2)", … within the given existing names. */
export function uniqueProfileName(name: string, existing: string[]): string {
	const taken = new Set(existing.map((n) => n.toLowerCase()));
	if (!taken.has(name.toLowerCase())) return name;
	let n = 2;
	while (taken.has(`${name} (${n})`.toLowerCase())) n++;
	return `${name} (${n})`;
}

