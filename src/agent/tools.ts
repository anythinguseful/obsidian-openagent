/**
 * Tool registry — Hermes-style toolsets.
 *
 * Every tool declares a JSON Schema (sent to the model) and its toolset.
 * Mutating/scheduling tools also declare an operation-aware approval kind;
 * `cautious` gates those operations while `manual` gates every tool call.
 */

import { renderTodoResult, TodoStore } from "./todo";
import { packNativeVisionResult, resolveVisionImage, VISION_MAX_IMAGE_BYTES } from "./vision";
import { formatConsolidatedResult, normalizeDelegateArgs, type DelegateApi } from "./delegate";
import { App, Notice, TFile, TFolder, normalizePath, requestUrl, type RequestUrlParam } from "obsidian";
import { requestModelSelectedResource } from "./modelNetwork";
import { planEdit, planWrite } from "./writePreview";
import { CronTask, OpenAgentSettings, getActiveProvider } from "../settings";
import { findCronTask, formatRelative, isCronCompleted, scanCronPrompt, validateCronExpr } from "./cron";
import { sanitizeScriptName } from "./cronScripts";
import { chatCompletion } from "./providers";
import { MEMORY_ROUTING_GUIDANCE } from "./memory";
import { resolveAuxTask } from "./contextManager";
import {
	WEB_EXTRACT_MAX_URLS,
	boundedStoredCopy,
	buildWebExtractSummaryPrompt,
	clampCharLimit,
	hostSlug,
	truncateWithFooter,
	urlDigest,
} from "./webExtract";
import {
	WorkspacePolicy,
	pathContains,
	workspacePolicyFor,
} from "./workspacePolicy";
import { TERMINAL_TOOLS } from "./terminal/tools";
import type { TerminalApi, TerminalExecutionIdentity } from "./terminal/types";
import {
	WEB_SEARCH_DEFAULT_RESULTS,
	WEB_SEARCH_MAX_RESULTS,
	backendNeedsKey,
	formatSearchResults,
	runWebSearch,
	type WebSearchTransport,
} from "./webSearch";

/** "alpha, beta" → ["alpha","beta"]; empty/absent → undefined */
function parseSkillList(value: unknown): string[] | undefined {
	if (typeof value !== "string") return undefined;
	const list = value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return list.length ? list : undefined;
}

/** 0/null/garbage → null (unlimited); positive → floor */
function parseMaxRuns(value: unknown): number | null {
	const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function resolveCronTarget(ctx: ToolContext, value: unknown, persisted = false): string {
	const raw = ensureMd(String(value ?? "").trim() || "openagent/Reports.md");
	const policy = policyOf(ctx);
	/* Existing task metadata is never silently re-routed after a Workspace
	   change. Only explicit create/update input gets mode-aware relative-path
	   routing; persisted targets must already be visible exactly as stored. */
	return persisted
		? policy.assertVisiblePath(raw, "Automation target note")
		: policy.resolvePath(raw, { label: "Automation target note" });
}

const noop = (): void => {};

export interface ToolContext {
	app: App;
	settings: OpenAgentSettings;
	/** Immutable snapshot shared by parent, child, and headless execution.
	 * Optional only for isolated legacy/test contexts; AgentRunner always injects it. */
	workspacePolicy?: WorkspacePolicy;
	memory: import("./memory").MemoryStore;
	skills: import("./skills").SkillsStore;
	/** automations CRUD — injected by the plugin (absent in tests) */
	cron?: CronjobApi;
	/** session task list (v0.1.133) — chat binds it to the session file,
	   one-shot loops get an ephemeral store (absent in tests) */
	todo?: import("./todo").TodoApi;
	/** vision bridge (v0.1.134) — runner supplies it: native-capability of the
	   ACTIVE main model (attach-flow cache) + aux-model describer */
	vision?: VisionApi;
	/** delegation engine (v0.1.135) — runner supplies it; children are built
	   there (tools minus blocked, fresh context, auto-deny, shared abort) */
	delegation?: DelegateApi;
	/** Desktop-only execution service. Its module has no eager Node imports. */
	terminal?: TerminalApi;
	/** Required by terminal/process to prove interactive session ownership. */
	execution?: TerminalExecutionIdentity;
	/** Cross-session recall (v0.1.147) — injected by the plugin; absent in
	   headless/cron contexts where session history is not the working set. */
	sessions?: SessionSearchApi;
	/** MCP runtime (v0.1.147) — supplies mcp__<server>__<tool> discovery; the
	   execute closures call back into it. Absent = no MCP tools (fail-closed). */
	mcp?: McpApi;
}

/** Cross-session search backend used by the session_search tool. */
export interface SessionSearchApi {
	search(query: string, limit?: number): Promise<{ meta: import("./sessions").SessionMeta; excerpt: string }[]>;
}

/** MCP backend — the plugin's McpRuntime implements this. */
export interface McpApi {
	listTools(): Promise<AgentTool[]>;
}

/** Vision bridge used by the vision_analyze tool — implemented by the runner. */
export interface VisionApi {
	/** true when the ACTIVE main model reads pixels natively — same source as
	   the chat attach flow (modality metadata / name heuristic, cached) */
	nativeAvailable(): Promise<boolean>;
	/** auxiliary vision model describes the image (text-only main models) —
	   Hermes' fallback prompt template lives in the caller */
	describe(dataUrl: string, question: string, sourceLabel?: string, signal?: AbortSignal): Promise<string>;
}

/** Automations backend used by the cronjob tool — implemented by the plugin. */
export interface CronjobApi {
	list(): CronTask[];
	createTask(input: {
		name: string;
		prompt: string;
		expr: string;
		targetNote: string;
		skills?: string[];
		maxRuns?: number | null;
		chainContext?: boolean;
		notify?: boolean;
		monitorUrl?: string;
		script?: string;
		noAgent?: boolean;
	}): CronTask;
	updateTask(
		idOrName: string,
		patch: Partial<{
			name: string;
			prompt: string;
			expr: string;
			targetNote: string;
			skills: string[];
			maxRuns: number | null;
			chainContext: boolean;
			notify: boolean;
			monitorUrl: string;
			script: string;
			noAgent: boolean;
		}>
	): CronTask;
	setEnabled(idOrName: string, enabled: boolean): CronTask;
	removeTask(idOrName: string): CronTask;
	/** fire a run in the background (no await), pinned to the invoking run */
	runNow(idOrName: string, workspacePolicy: WorkspacePolicy, settings: OpenAgentSettings): void;
	persist(): Promise<void>;
}

/** Interactive channel a run MAY offer — the chat supplies it; headless
    contexts (cron, runner.runHeadless) leave `clarify` undefined and the
    tool reports Hermes' "not available in this execution context" error. */
export interface ClarifyRequest {
	question: string;
	choices: string[] | null;
	multiSelect: boolean;
}
export type ClarifyAnswer = string | string[];
export type ClarifyHandler = (req: ClarifyRequest) => Promise<ClarifyAnswer>;
export interface ToolInteractive {
	clarify?: ClarifyHandler;
	/** v0.1.135: live progress for delegation batches (done, total); the chat
	   maps it to the status line, headless runs leave it unset */
	delegateProgress?: (done: number, total: number) => void;
	/** parent abort signal — children share it (their kill-switch spirit) */
	signal?: AbortSignal;
}

export type ToolApprovalKind = "standard" | "persistent-write" | "destructive" | "scheduling";

/** A prepared call freezes every security-relevant value before approval.
 * execute() must revalidate live identity and run exactly this snapshot. */
export interface PreparedToolCall {
	approvalKind?: ToolApprovalKind;
	/** Bypass no global mode: even YOLO must ask for this exact call. */
	forceApproval?: boolean;
	allowAlways?: boolean;
	approvalDetails?: Record<string, unknown>;
	/** Null means current; a string explains why the preview expired. */
	revalidate?: () => Promise<string | null>;
	execute(): Promise<string>;
}

export interface AgentTool {
	name: string;
	description: string;
	toolset: "vault" | "web" | "memory" | "skills" | "automations" | "clarify" | "todo" | "vision" | "delegation" | "terminal" | "mcp";
	/** Legacy static marker retained for compatibility with existing tools and
	 * preview fixtures. New operation-aware tools should use approvalKind. */
	dangerous?: boolean;
	/** Approval classification may depend on arguments (`cronjob list` is
	 * read-only, while create/update/run/remove are scheduling effects). */
	approvalKind?: ToolApprovalKind | ((args: Record<string, any>) => ToolApprovalKind);
	/** False hides and defensively rejects session-wide approval for this tool. */
	allowAlways?: boolean;
	/** Optional pre-approval resolver for physical paths/backend/image identity. */
	prepare?(args: Record<string, any>, ctx: ToolContext, interactive?: ToolInteractive): Promise<PreparedToolCall>;
	parameters: Record<string, unknown>;
	execute(args: Record<string, any>, ctx: ToolContext, interactive?: ToolInteractive): Promise<string>;
}

/** Resolve one call's approval class. `dangerous` remains a fail-safe fallback
 * so older/custom tools keep their cautious-mode behavior. */
export function resolveToolApprovalKind(tool: AgentTool, args: Record<string, any>): ToolApprovalKind {
	if (typeof tool.approvalKind === "function") return tool.approvalKind(args);
	if (tool.approvalKind) return tool.approvalKind;
	return tool.dangerous ? "destructive" : "standard";
}

export function needsCautiousApproval(tool: AgentTool, args: Record<string, any>): boolean {
	return resolveToolApprovalKind(tool, args) !== "standard";
}

/** Used only for the system-prompt catalog, where call arguments do not yet
 * exist. A function means at least one operation is approval-gated. */
export function mayNeedCautiousApproval(tool: AgentTool): boolean {
	if (typeof tool.approvalKind === "function") return true;
	if (tool.approvalKind) return tool.approvalKind !== "standard";
	return !!tool.dangerous;
}

/* ------------------------------------------------------------------ */
/* helpers                                                              */
/* ------------------------------------------------------------------ */

function policyOf(ctx: ToolContext): WorkspacePolicy {
	/* The fallback only keeps isolated third-party/test contexts compatible;
	   AgentRunner always injects one immutable run snapshot. A context without
	   Vault access can exercise Whole/Preferred pure routing, but Strict still
	   fails closed because its root cannot be proven to exist. */
	const vault = ctx.app?.vault;
	const policy = ctx.workspacePolicy ?? workspacePolicyFor(ctx.settings, vault?.configDir ?? ".obsidian");
	const strictRootExists =
		policy.mode !== "strict-folder" || (!!vault && vault.getAbstractFileByPath(policy.root) instanceof TFolder);
	policy.assertReady(strictRootExists);
	return policy;
}

function vaultPath(ctx: ToolContext, p: string): string {
	return policyOf(ctx).resolvePath(p, { label: "Vault path" });
}

/** ONE resolver for execution and approval preview. */
export function resolveWritePath(
	settings: OpenAgentSettings,
	raw: unknown,
	policy = workspacePolicyFor(settings)
): string {
	return policy.resolvePath(ensureMd(String(raw ?? "")), { label: "Note path" });
}

function ensureMd(p: string): string {
	const value = p.trim();
	return value.toLowerCase().endsWith(".md") ? value : value + ".md";
}

function readCeiling(ctx: ToolContext): number {
	return policyOf(ctx).fileReadMaxChars;
}

function assertReadWithinCeiling(ctx: ToolContext, content: string, path: string, paging: string): void {
	const max = readCeiling(ctx);
	if (content.length > max) {
		throw new Error(
			`File read refused: ${path} would return ${content.length.toLocaleString("en-US")} characters, above the configured ${max.toLocaleString("en-US")}-character ceiling. ${paging}`
		);
	}
}

async function fileExists(ctx: ToolContext, path: string): Promise<boolean> {
	return (await ctx.app.vault.getAbstractFileByPath(path)) instanceof TFile;
}

/**
 * v0.1.147 checkpoints (Hermes checkpoints.enabled): before the agent
 * modifies or trashes an existing note, snapshot its previous content under
 * `openagent/checkpoints/`. Best-effort — a snapshot failure never blocks the
 * write (the approval preview is already the primary guard). Checkpoint files
 * are plain notes the user can diff against or copy back.
 */
async function checkpointBeforeWrite(ctx: ToolContext, path: string): Promise<void> {
	if (!ctx.settings.checkpointsEnabled) return;
	try {
		const f = ctx.app.vault.getAbstractFileByPath(path);
		if (!(f instanceof TFile)) return; // only snapshot existing files
		const content = await ctx.app.vault.read(f);
		const d = new Date();
		const p = (n: number): string => String(n).padStart(2, "0");
		const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
		const safe = path.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
		const rel = `openagent/checkpoints/${stamp} ${safe}.md`;
		const abs = vaultPath(ctx, rel);
		const folder = abs.slice(0, abs.lastIndexOf("/"));
		try {
			await ctx.app.vault.createFolder(folder);
		} catch {
			/* folder exists */
		}
		await ctx.app.vault.create(abs, content);
		/* v0.1.151: prune to the newest N snapshots per note (Hermes
		   checkpoints.max_snapshots). The stamp prefix is sortable, so the
		   newest entries are simply the last N after a lexical sort. */
		const max = ctx.settings.checkpointMaxSnapshots;
		if (Number.isFinite(max) && max > 0) {
			try {
				const dir = ctx.app.vault.getAbstractFileByPath("openagent/checkpoints");
				const files = (dir instanceof TFolder ? dir.children.filter((c): c is TFile => c instanceof TFile) : [])
					.filter((f) => f.name.endsWith(` ${safe}.md`))
					.sort((a, b) => a.name.localeCompare(b.name));
				const excess = files.length - Math.floor(max);
				for (let i = 0; i < excess; i++) {
					await ctx.app.vault.delete(files[i]);
				}
			} catch {
				/* best-effort prune */
			}
		}
	} catch {
		/* best-effort */
	}
}

async function readFile(ctx: ToolContext, path: string): Promise<string> {
	const f = ctx.app.vault.getAbstractFileByPath(path);
	if (!(f instanceof TFile)) throw new Error(`File not found: ${path}`);
	return ctx.app.vault.read(f);
}

function ok(text: string): string {
	return text;
}

/* ------------------------------------------------------------------ */
/* vault toolset                                                        */
/* ------------------------------------------------------------------ */

const readNote: AgentTool = {
	name: "read_note",
	toolset: "vault",
	description:
		"Read the markdown content of a note in the vault (whole by default). For large files — e.g. pages saved by web_extract — page through with offset/limit (1-based lines).",
	parameters: {
		type: "object",
		properties: {
			path: { type: "string", description: "Vault-relative path to the note, e.g. 'Projects/plan.md'" },
			offset: { type: "integer", description: "First line to return (1-based, default 1) — use with limit to page big files.", minimum: 1 },
			limit: { type: "integer", description: "Max lines to return (default: whole file).", minimum: 1 },
		},
		required: ["path"],
	},
	execute: async (args, ctx) => {
		const path = vaultPath(ctx, ensureMd(String(args.path)));
		const full = await readFile(ctx, path);
		const offset = typeof args.offset === "number" && Number.isFinite(args.offset) ? Math.floor(args.offset) : 1;
		const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.floor(args.limit) : null;
		if (offset <= 1 && !limit) {
			assertReadWithinCeiling(ctx, full, path, "Retry with read_note offset=1 and a small line limit, then continue page by page.");
			return full;
		}
		/* 1-based line paging (read_file offset/limit semantics — web_extract's
		   truncation footer points here) */
		const lines = full.split("\n");
		const start = Math.max(1, offset);
		if (start > lines.length) {
			throw new Error(`offset ${start} is past the end — the file has ${lines.length.toLocaleString("en-US")} line(s).`);
		}
		const end = limit ? Math.min(lines.length, start - 1 + limit) : lines.length;
		const page = lines.slice(start - 1, end).join("\n");
		assertReadWithinCeiling(
			ctx,
			page,
			path,
			`Retry at offset=${start} with a smaller line limit; the file has ${lines.length.toLocaleString("en-US")} line(s).`
		);
		if (end < lines.length) {
			return `${page}\n\n[... ${(lines.length - end).toLocaleString("en-US")} more line(s) — continue with read_note offset=${end + 1} ...]`;
		}
		return page;
	},
};

const writeNote: AgentTool = {
	name: "write_note",
	toolset: "vault",
	/* The preview diff is its approval (was silently landing under cautious
	   before v0.1.58). Keep dangerous for old fixtures; the kind drives UI. */
	dangerous: true,
	approvalKind: "persistent-write",
	description:
		"Create a new note, overwrite an existing one, or append to it. Parent folders are created automatically.",
	parameters: {
		type: "object",
		properties: {
			path: { type: "string", description: "Vault-relative note path" },
			content: { type: "string", description: "Markdown content to write" },
			mode: { type: "string", enum: ["create", "overwrite", "append"], description: "create fails if the note exists; overwrite replaces; append adds to the end" },
		},
		required: ["path", "content", "mode"],
	},
	execute: async (args, ctx) => {
		const path = vaultPath(ctx, ensureMd(String(args.path)));
		const mode = String(args.mode);
		/* The same pure planner builds approval.preview.proposed and the bytes
		   persisted here. Canonical Mermaid normalization therefore cannot
		   drift between Allow and write execution. */
		const existing = ctx.app.vault.getAbstractFileByPath(path);
		const original = existing instanceof TFile ? await ctx.app.vault.read(existing) : null;
		const planned = planWrite(args, path, original);
		if (planned.ok === false) throw new Error(planned.error);
		const folder = path.split("/").slice(0, -1).join("/");
		if (folder && !(ctx.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
			await ctx.app.vault.createFolder(folder).catch(noop);
		}
		if (existing instanceof TFile) {
			await checkpointBeforeWrite(ctx, path);
			await ctx.app.vault.modify(existing, planned.preview.proposed);
		} else {
			await ctx.app.vault.create(path, planned.preview.proposed);
		}
		return ok(`Wrote ${planned.preview.proposed.length} characters to ${path} (mode=${mode}).`);
	},
};

const editNote: AgentTool = {
	name: "edit_note",
	toolset: "vault",
	dangerous: true, // legacy fallback; approvalKind is authoritative
	approvalKind: "persistent-write",
	description: "Replace an exact text fragment inside a note. Fails if the fragment is not found.",
	parameters: {
		type: "object",
		properties: {
			path: { type: "string" },
			old_text: { type: "string", description: "Exact text to find" },
			new_text: { type: "string", description: "Replacement text" },
		},
		required: ["path", "old_text", "new_text"],
	},
	execute: async (args, ctx) => {
		const path = vaultPath(ctx, ensureMd(String(args.path)));
		const content = await readFile(ctx, path);
		/* v0.1.58: the planner is the single source for the fragment math —
		   the approval preview runs the very same function */
		const planned = planEdit(args, path, content);
		if (planned.ok === false) throw new Error(planned.error);
		const f = ctx.app.vault.getAbstractFileByPath(path) as TFile;
		await checkpointBeforeWrite(ctx, path);
		await ctx.app.vault.modify(f, planned.preview.proposed);
		return ok(`Edited ${path}: replaced a ${String(args.old_text).length}-char fragment.`);
	},
};

const deleteNote: AgentTool = {
	name: "delete_note",
	toolset: "vault",
	dangerous: true,
	approvalKind: "destructive",
	description: "Permanently move a note (or any vault file) to the system trash.",
	parameters: {
		type: "object",
		properties: { path: { type: "string" } },
		required: ["path"],
	},
	execute: async (args, ctx) => {
		const path = vaultPath(ctx, String(args.path));
		const f = ctx.app.vault.getAbstractFileByPath(path);
		if (!f) throw new Error(`Not found: ${path}`);
		await checkpointBeforeWrite(ctx, path);
		await ctx.app.vault.trash(f, true);
		return ok(`Trashed ${path}.`);
	},
};

const renameNote: AgentTool = {
	name: "rename_move_note",
	toolset: "vault",
	dangerous: true,
	approvalKind: "destructive",
	description: "Rename or move a note to a new path (Obsidian updates wiki links automatically).",
	parameters: {
		type: "object",
		properties: {
			path: { type: "string" },
			new_path: { type: "string" },
		},
		required: ["path", "new_path"],
	},
	execute: async (args, ctx) => {
		const path = vaultPath(ctx, ensureMd(String(args.path)));
		const newPath = vaultPath(ctx, ensureMd(String(args.new_path)));
		const f = ctx.app.vault.getAbstractFileByPath(path);
		if (!(f instanceof TFile)) throw new Error(`Not found: ${path}`);
		const folder = newPath.split("/").slice(0, -1).join("/");
		if (folder && !(ctx.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
			await ctx.app.vault.createFolder(folder).catch(noop);
		}
		await checkpointBeforeWrite(ctx, path);
		await ctx.app.fileManager.renameFile(f, newPath);
		return ok(`Moved ${path} → ${newPath}.`);
	},
};

const listFiles: AgentTool = {
	name: "list_files",
	toolset: "vault",
	description: "List notes and folders, optionally filtered by folder and glob-ish keyword.",
	parameters: {
		type: "object",
		properties: {
			folder: { type: "string", description: "Folder to list (empty = vault root)" },
			limit: { type: "number", description: "Max entries (default 100)" },
		},
	},
	execute: async (args, ctx) => {
		const policy = policyOf(ctx);
		const folder = policy.resolveBrowseFolder(String(args.folder ?? ""), "List folder");
		const limit = Math.min(Number(args.limit) || 100, 500);
		const paths = ctx.app.vault
			.getMarkdownFiles()
			.filter((f) => policy.allowsPath(f.path))
			.filter((f) => !folder || pathContains(folder, f.path))
			.map((f) => f.path)
			.sort()
			.slice(0, limit);
		return ok(paths.length ? paths.join("\n") : "(no files found)");
	},
};

const searchVault: AgentTool = {
	name: "search_vault",
	toolset: "vault",
	description: "Full-text search across all markdown notes. Returns matching paths with a short excerpt.",
	parameters: {
		type: "object",
		properties: {
			query: { type: "string", description: "Text to search for (case-insensitive)" },
			limit: { type: "number", description: "Max results (default 10)" },
		},
		required: ["query"],
	},
	execute: async (args, ctx) => {
		const policy = policyOf(ctx);
		const q = String(args.query).toLowerCase();
		const limit = Math.min(Number(args.limit) || 10, 40);
		const out: string[] = [];
		for (const f of ctx.app.vault.getMarkdownFiles()) {
			/* Filter paths before metadata or content reads: out-of-scope note
			   contents must never become model-visible in Strict mode. */
			if (!policy.allowsPath(f.path)) continue;
			if (out.length >= limit) break;
			const cache = ctx.app.metadataCache.getFileCache(f);
			const nameHit = f.path.toLowerCase().includes(q);
			const tagHit = (cache?.tags ?? []).some((t) => t.tag.toLowerCase().includes(q));
			let excerpt = "";
			let contentHit = false;
			if (!nameHit) {
				const text = (await ctx.app.vault.cachedRead(f)).toLowerCase();
				const idx = text.indexOf(q);
				if (idx >= 0) {
					contentHit = true;
					excerpt = text.slice(Math.max(0, idx - 60), idx + 140).replace(/\n/g, " ").trim();
				}
			}
			if (nameHit || contentHit || tagHit) {
				out.push(`${f.path}${excerpt ? `\n  …${excerpt}…` : ""}`);
			}
		}
		return ok(out.length ? out.join("\n") : `No matches for "${args.query}".`);
	},
};

const getActiveNote: AgentTool = {
	name: "get_active_note",
	toolset: "vault",
	description: "Get the path and content of the note the user is currently viewing/editing.",
	parameters: { type: "object", properties: {} },
	execute: async (_args, ctx) => {
		const f = ctx.app.workspace.getActiveFile();
		if (!f) return ok("(no active note)");
		policyOf(ctx).assertVisiblePath(f.path, "Active note");
		const content = await ctx.app.vault.read(f);
		assertReadWithinCeiling(ctx, content, f.path, "Use read_note with offset/limit to page this note.");
		return ok(`Path: ${f.path}\n---\n${content}`);
	},
};

/* ------------------------------------------------------------------ */
/* web toolset                                                          */
/* ------------------------------------------------------------------ */

/** Best-effort full-text store into the vault (openagent/web-cache/…): the
    path the MODEL passes to read_note is workspace-relative, the vault write
    resolves it the same way read_note does. Null on any failure. */
async function storeFullPage(ctx: ToolContext, url: string, content: string): Promise<string | null> {
	try {
		const rel = `openagent/web-cache/${hostSlug(url)}-${await urlDigest(url)}.md`;
		const abs = vaultPath(ctx, rel);
		const stored = boundedStoredCopy(content);
		const existing = ctx.app.vault.getAbstractFileByPath(abs);
		if (existing instanceof TFile) {
			await ctx.app.vault.modify(existing, stored);
		} else {
			try {
				await ctx.app.vault.createFolder(abs.slice(0, abs.lastIndexOf("/")));
			} catch {
				/* folder exists already */
			}
			await ctx.app.vault.create(abs, stored);
		}
		return rel;
	} catch {
		return null;
	}
}

/** Our opt-in summarize call (owner decision B, 2026-08-01): the Web extract
    aux slot picks the (provider, model) — BOTH halves ride, else main. */
async function summarizeWebPage(ctx: ToolContext, url: string, content: string, signal?: AbortSignal): Promise<string> {
	const active = getActiveProvider(ctx.settings);
	if (!active?.baseUrl.trim() || !ctx.settings.model) throw new Error("no provider configured");
	const pair = resolveAuxTask(ctx.settings, "webExtract", { providerId: active.id, model: ctx.settings.model });
	const provider = ctx.settings.providers.find((p) => p.id === pair.providerId);
	if (!provider?.baseUrl.trim()) throw new Error("no provider for web summarization");
	const res = await chatCompletion(
		provider,
		{ ...ctx.settings, model: pair.model },
		[{ role: "user", content: buildWebExtractSummaryPrompt(url, content) }],
		null,
		{ signal }
	);
	if (signal?.aborted) throw new Error("web summarization aborted");
	const summary = (res.content ?? "").trim();
	if (!summary) throw new Error("the summarizer returned an empty summary");
	return summary;
}

/* Hermes web_extract parity (tools/web_tools.py, verified raw 2026-08-01):
   deterministic windowing by default — the LLM only enters via summarize. */
const WEB_EXTRACT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function wrapUntrustedWebContent(url: string, content: string): string {
	return `## ${url}\n\n[BEGIN UNTRUSTED WEB CONTENT — source: ${url}]\n${content}\n[END UNTRUSTED WEB CONTENT]`;
}

const webExtract: AgentTool = {
	name: "web_extract",
	toolset: "web",
	description:
		"Extract content from public-web page URLs. Model-selected URLs are restricted to default-port HTTP(S), " +
		"non-local hosts, textual responses, a 2 MiB post-buffer cap, and a soft deadline. Returns clean page text " +
		"without LLM summarization by default. Larger pages return a head+tail window with the full text's saved note " +
		"path. Pass summarize: true to use the Web extract aux model; the verbatim text stays saved for read_note.",
	parameters: {
		type: "object",
		properties: {
			urls: {
				type: "array",
				items: { type: "string" },
				description: "List of URLs to extract content from (max 5 URLs per call)",
				maxItems: WEB_EXTRACT_MAX_URLS,
			},
			char_limit: {
				type: "integer",
				description:
					"Optional per-page character budget sent back (default 15000). Pages larger than this are head+tail truncated with the full text stored to disk. Raise it when you need more of a long page inline.",
				minimum: 2000,
			},
			summarize: {
				type: "boolean",
				description:
					"Optional (default false): condense each page with the Web extract aux model into a sourced markdown summary instead of the raw window.",
			},
		},
		required: ["urls"],
	},
	execute: async (args, ctx, runtime) => {
		const list = Array.isArray(args.urls)
			? args.urls.map((u) => String(u ?? "").trim()).filter(Boolean).slice(0, WEB_EXTRACT_MAX_URLS)
			: typeof args.url === "string" && args.url.trim()
				? [args.url.trim()] // legacy single-url spelling, tolerated
				: [];
		if (!list.length) throw new Error("web_extract: pass urls (an array of up to 5 page URLs).");
		const limit = clampCharLimit(args.char_limit);
		const out: string[] = [];
		for (const requestedUrl of list) {
			const response = await requestModelSelectedResource(requestedUrl, {
				kind: "text",
				maxBytes: WEB_EXTRACT_MAX_RESPONSE_BYTES,
				signal: runtime?.signal,
			});
			const url = response.url;
			const doc = new DOMParser().parseFromString(response.text, "text/html");
			doc.querySelectorAll("script,style,noscript,iframe").forEach((el) => el.remove());
			const content = (doc.body?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
			if (!content) {
				out.push(wrapUntrustedWebContent(url, "(empty page)"));
				continue;
			}
			/* upstream stores the full text only when the window actually
			   truncates (or when a summary replaces the page — the verbatim
			   copy is then the honesty hop) */
			const needsStore = content.length > limit || args.summarize === true;
			const storedPath = needsStore ? await storeFullPage(ctx, url, content) : null;
			if (args.summarize === true) {
				try {
					const summary = await summarizeWebPage(ctx, url, content, runtime?.signal);
					out.push(
						wrapUntrustedWebContent(
							url,
							summary +
								(storedPath ? `\n\n(Summarized — full text saved to: ${storedPath}; read_note it for the verbatim page.)` : "")
						)
					);
					continue;
				} catch {
					/* fail-open: the raw window below still answers */
				}
			}
			out.push(wrapUntrustedWebContent(url, truncateWithFooter(content, storedPath, limit).text));
		}
		return ok(out.join("\n\n"));
	},
};

/** web_search (Hermes tools/web_tools.py parity, verified raw 2026-08-18):
 * one query across a pluggable backend; returns title/url/description
 * metadata only — the model reads a page with web_extract afterwards. */
const webSearch: AgentTool = {
	name: "web_search",
	toolset: "web",
	description:
		"Search the web and return ranked result metadata (title, URL, description). Supports the `site:example.com` operator and other engines' natural query syntax. " +
		"Backends: DuckDuckGo (default, no key), Brave free tier (key), Tavily (key), or a self-hosted SearXNG URL — configured in Settings → Capabilities → Web search. " +
		"To read a result's full page, pass its URL to web_extract.",
	parameters: {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "Search query (natural language or operators like site:example.com).",
			},
			max_results: {
				type: "integer",
				description: `Optional number of results to return (default ${WEB_SEARCH_DEFAULT_RESULTS}, max ${WEB_SEARCH_MAX_RESULTS}).`,
				minimum: 1,
				maximum: WEB_SEARCH_MAX_RESULTS,
			},
		},
		required: ["query"],
		additionalProperties: false,
	},
	execute: async (args, ctx) => {
		const query = String(args.query ?? "").trim();
		if (!query) throw new Error("web_search: pass a query.");
		const rawLimit = Number(args.max_results);
		const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : WEB_SEARCH_DEFAULT_RESULTS;
		const settings = ctx.settings.webSearch;
		const { backend, missing } = backendNeedsKey(settings);
		const transport: WebSearchTransport = (url, headers, body) => {
			const opts: RequestUrlParam = {
				url,
				method: body ? "POST" : "GET",
				throw: false,
			};
			if (headers) opts.headers = headers;
			if (body) opts.body = body;
			return requestUrl(opts).then((res) => ({ status: res.status, text: res.text ?? "" }));
		};
		const results = await runWebSearch(query, limit, settings, transport);
		const note = missing ? `\n\n(Note: “${settings.backend}” is selected but its ${missing} is empty — fell back to ${backend}.)` : "";
		return ok(formatSearchResults(results, query, backend) + note);
	},
};

/* ------------------------------------------------------------------ */
/* memory toolset (Hermes: agent-curated persistent memory)             */
/* ------------------------------------------------------------------ */

const saveMemory: AgentTool = {
	name: "save_memory",
	toolset: "memory",
	approvalKind: "persistent-write",
	description:
		"Add, replace or remove an entry in long-term memory (MEMORY.md). Memory is injected into every future turn, so keep entries compact and high-signal. " +
		"Use replace/remove with a short unique substring (`old_text`) to correct a mistake or drop a stale fact. " +
		"If an add is refused as full, free room with remove/replace in the same effort, then add again.\n\n" +
		MEMORY_ROUTING_GUIDANCE,
	parameters: {
		type: "object",
		properties: {
			action: { type: "string", description: "add (default), replace, or remove." },
			entry: { type: "string", description: "The memory statement (for add/replace)." },
			old_text: { type: "string", description: "A short unique substring identifying the entry to replace or remove." },
			category: { type: "string", description: "e.g. preference, project, fact, decision" },
		},
		required: ["entry"],
	},
	execute: async (args, ctx) => {
		const action = String(args.action ?? "add").toLowerCase();
		if (action === "remove") {
			if (!String(args.old_text ?? "").trim()) throw new Error("save_memory remove needs old_text identifying the entry.");
			await ctx.memory.remove(String(args.old_text));
			return ok("Removed from long-term memory.");
		}
		if (action === "replace") {
			if (!String(args.old_text ?? "").trim()) throw new Error("save_memory replace needs old_text identifying the entry.");
			await ctx.memory.replace(String(args.old_text), String(args.entry), String(args.category ?? "general"));
			return ok("Updated long-term memory.");
		}
		await ctx.memory.add(String(args.entry), String(args.category ?? "general"));
		return ok("Saved to long-term memory.");
	},
};

const updateUserProfile: AgentTool = {
	name: "update_user_profile",
	toolset: "memory",
	approvalKind: "persistent-write",
	description:
		"Add, replace or remove a durable fact about the user (role, goals, preferences) in USER.md. " +
		"Use replace/remove with a short unique substring (`old_text`) to correct a mistake or drop a stale fact.\n\n" +
		MEMORY_ROUTING_GUIDANCE,
	parameters: {
		type: "object",
		properties: {
			action: { type: "string", description: "add (default), replace, or remove." },
			entry: { type: "string", description: "The fact about the user (for add/replace)." },
			old_text: { type: "string", description: "A short unique substring identifying the entry to replace or remove." },
		},
		required: ["entry"],
	},
	execute: async (args, ctx) => {
		const action = String(args.action ?? "add").toLowerCase();
		if (action === "remove") {
			if (!String(args.old_text ?? "").trim()) throw new Error("update_user_profile remove needs old_text identifying the entry.");
			await ctx.memory.removeUser(String(args.old_text));
			return ok("Removed from the user profile.");
		}
		if (action === "replace") {
			if (!String(args.old_text ?? "").trim()) throw new Error("update_user_profile replace needs old_text identifying the entry.");
			await ctx.memory.replaceUser(String(args.old_text), String(args.entry));
			return ok("User profile updated.");
		}
		await ctx.memory.addUser(String(args.entry));
		return ok("User profile updated.");
	},
};

const searchMemory: AgentTool = {
	name: "search_memory",
	toolset: "memory",
	description: "Search long-term memory and the user profile for a keyword.",
	parameters: {
		type: "object",
		properties: { query: { type: "string" } },
		required: ["query"],
	},
	execute: async (args, ctx) => {
		const hits = await ctx.memory.search(String(args.query));
		return ok(hits.length ? hits.join("\n") : "(no memory entries match)");
	},
};

/** session_search (Hermes session_search FTS5 parity — episodic memory):
 * search past conversation sessions by title or content, recency-ranked. */
const sessionSearch: AgentTool = {
	name: "session_search",
	toolset: "memory",
	description:
		"Search your past conversation sessions by title or message content (cross-session recall). Returns the most recent matching sessions with a short excerpt, oldest of the matches last. Useful when the user says “we discussed X before” and the answer may live in an earlier chat.",
	parameters: {
		type: "object",
		properties: {
			query: { type: "string", description: "Keyword or phrase to find in session titles and messages." },
			limit: { type: "number", description: "Optional maximum number of sessions to return (default 5)." },
		},
		required: ["query"],
		additionalProperties: false,
	},
	execute: async (args, ctx) => {
		if (!ctx.sessions) throw new Error("Session search is unavailable in this context.");
		const query = String(args.query ?? "").trim();
		if (!query) throw new Error("session_search: pass a query.");
		const rawLimit = Number(args.limit);
		const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 5;
		const hits = await ctx.sessions.search(query, limit);
		if (hits.length === 0) return ok(`No past sessions match “${query}”.`);
		return ok(
			hits
				.map((h) => {
					const when = new Date(h.meta.updatedAt).toLocaleString();
					return `- “${h.meta.title}” (${h.meta.id}) — ${h.meta.turnCount} turns · updated ${when}\n    ${h.excerpt}`;
				})
				.join("\n\n")
		);
	},
};

/* ------------------------------------------------------------------ */
/* skills toolset (Hermes: closed learning loop)                        */
/* ------------------------------------------------------------------ */

const createSkill: AgentTool = {
	name: "create_skill",
	toolset: "skills",
	approvalKind: "persistent-write",
	description:
		"Create a reusable skill (agentskills.io SKILL.md) capturing a procedure learned during this session. Use after completing a non-trivial multi-step task so future sessions can repeat it.",
	parameters: {
		type: "object",
		properties: {
			name: { type: "string", description: "kebab-case skill name" },
			description: { type: "string", description: "One-line summary of what the skill does" },
			when_to_use: { type: "string", description: "Trigger conditions for this skill" },
			instructions: { type: "string", description: "Step-by-step markdown procedure" },
		},
		required: ["name", "description", "instructions"],
	},
	execute: async (args, ctx) => {
		const path = await ctx.skills.createSkill(
			String(args.name),
			String(args.description),
			String(args.when_to_use ?? ""),
			String(args.instructions)
		);
		new Notice(`Open Agent: new skill created — ${args.name}`);
		return ok(`Skill saved to ${path}. It will be available in future sessions.`);
	},
};

const listSkills: AgentTool = {
	name: "list_skills",
	toolset: "skills",
	description: "List all installed skills with their descriptions.",
	parameters: { type: "object", properties: {} },
	execute: async (_args, ctx) => {
		const skills = await ctx.skills.loadSkills();
		if (skills.length === 0) return ok("(no skills installed yet)");
		return ok(skills.map((s) => `- ${s.name}${s.enabled ? "" : " (disabled)"}: ${s.description}`).join("\n"));
	},
};

/* v0.1.132 (docs/studies/hermes-tools-gap §3): skill_view / skill_manage parity —
   the skills toolset was ⅔ (create + list); view + full lifecycle close it. */

const viewSkill: AgentTool = {
	name: "view_skill",
	toolset: "skills",
	description:
		"Load a skill's full SKILL.md content (plus a list of its supporting files) — the compact catalog in the system prompt may be trimmed, call this when you need the complete procedure. Pass file to read one supporting file (references/templates/scripts) instead.",
	parameters: {
		type: "object",
		properties: {
			name: { type: "string", description: "Skill name (exact, or case-insensitive) — list_skills shows the installed names" },
			file: {
				type: "string",
				description: "Optional supporting file path RELATIVE to the skill folder (e.g. references/setup.md)",
			},
		},
		required: ["name"],
	},
	execute: async (args, ctx) => {
		const r = await ctx.skills.resolveSkill(String(args.name ?? ""));
		if (!r.skill) throw new Error(r.error);
		const file = typeof args.file === "string" ? args.file : "";
		if (file.trim()) {
			const content = await ctx.skills.readSkillFile(r.skill, file);
			return ok(`# ${r.skill.name} — ${normalizePath(file.trim())}\n\n${content}`);
		}
		const raw = await ctx.skills.readSkillRaw(r.skill);
		const extra = ctx.skills.listSkillFiles(r.skill);
		const listing = extra.length ? `\n\nSupporting files (read with view_skill file=…): ${extra.join(", ")}` : "";
		return ok(`${raw}${listing}`);
	},
};

const manageSkill: AgentTool = {
	name: "manage_skill",
	toolset: "skills",
	approvalKind: (args) => {
		const action = String(args.action ?? "").toLowerCase();
		return action === "delete" || action === "remove_file" ? "destructive" : "persistent-write";
	},
	description:
		"Modify an existing skill (Hermes skill_manage parity). Actions: patch (targeted old_string→new_string in SKILL.md — PREFERRED for small fixes), update (full SKILL.md replacement for structural rewrites), delete (the whole skill, moved to trash), write_file (add/update a supporting file), remove_file (trash a supporting file). New skills go through create_skill.",
	parameters: {
		type: "object",
		properties: {
			action: {
				type: "string",
				enum: ["update", "patch", "delete", "write_file", "remove_file"],
				description: "What to do.",
			},
			name: { type: "string", description: "Target skill name (exact, or case-insensitive)." },
			content: { type: "string", description: "Full new SKILL.md — required for update." },
			old_string: { type: "string", description: "Exact text to replace — required for patch; must match exactly once." },
			new_string: { type: "string", description: "Replacement text for patch (may be empty to delete the matched text)." },
			file: { type: "string", description: "Supporting file path RELATIVE to the skill folder — write_file/remove_file." },
			file_content: { type: "string", description: "Content for write_file (defaults to empty)." },
		},
		required: ["action", "name"],
	},
	execute: async (args, ctx) => {
		const action = String(args.action ?? "").toLowerCase();
		const ACTIONS = ["update", "patch", "delete", "write_file", "remove_file"];
		if (!ACTIONS.includes(action)) throw new Error(`Unknown action "${action}" — use ${ACTIONS.join(", ")}.`);
		const name = String(args.name ?? "").trim();
		if (!name) throw new Error(`Action "${action}" needs the skill name (list_skills shows the installed names).`);

		if (action === "patch") {
			const oldStr = String(args.old_string ?? "");
			const newStr = String(args.new_string ?? "");
			if (!oldStr) throw new Error("patch needs old_string — the exact text to replace.");
			await ctx.skills.patchSkill(name, oldStr, newStr);
			new Notice(`Open Agent: skill patched — ${name}`);
			return ok(`Patched "${name}".`);
		}
		if (action === "update") {
			const content = String(args.content ?? "");
			if (!content.trim()) throw new Error("update needs content — the full new SKILL.md (frontmatter + body).");
			const path = await ctx.skills.updateSkillRaw(name, content);
			new Notice(`Open Agent: skill updated — ${name}`);
			return ok(`Updated "${name}" — full SKILL.md replaced at ${path}.`);
		}
		if (action === "delete") {
			await ctx.skills.deleteSkillTree(name);
			new Notice(`Open Agent: skill deleted — ${name}`);
			return ok(`Deleted skill "${name}" (moved to trash per Obsidian settings).`);
		}

		// write_file / remove_file — supporting files inside the skill folder
		const rel = String(args.file ?? "");
		if (!rel.trim()) throw new Error(`Action "${action}" needs file (a path relative to the skill folder).`);
		if (action === "write_file") {
			const p = await ctx.skills.writeSkillFile(name, rel, String(args.file_content ?? ""));
			new Notice(`Open Agent: skill file written — ${name}`);
			return ok(`Wrote ${p}.`);
		}
		await ctx.skills.removeSkillFile(name, rel);
		new Notice(`Open Agent: skill file removed — ${name}`);
		return ok(`Removed ${rel} from skill "${name}".`);
	},
};

/* automations toolset (Hermes: one cronjob tool, full lifecycle)       */
/* ------------------------------------------------------------------ */

const cronjob: AgentTool = {
	name: "cronjob",
	toolset: "automations",
	approvalKind: (args) => (String(args.action ?? "").toLowerCase() === "list" ? "standard" : "scheduling"),
	description:
		"Manage scheduled automations (cron tasks that run the agent on a schedule and append the result to a note). Actions: create, list, update, pause, resume, run, remove. " +
		"A run whose output starts with [SILENT] is archived but NOT appended to the note — useful for monitor-style prompts that should only report when something is wrong.",
	parameters: {
		type: "object",
		properties: {
			action: {
				type: "string",
				enum: ["create", "list", "update", "pause", "resume", "run", "remove"],
				description: "What to do.",
			},
			id_or_name: {
				type: "string",
				description: "Task id or exact name — required for update, pause, resume, run, remove.",
			},
			name: { type: "string", description: "Task name (create, or rename on update)." },
			prompt: { type: "string", description: "What the agent should do each run — required for create." },
			schedule: {
				type: "string",
				description:
					'5-field cron expression (minute hour day month weekday). Examples: "0 9 * * *" (daily 09:00), "*/15 * * * *" (every 15 min), "0 9 * * 1-5" (weekdays 09:00). Defaults to daily 09:00.',
			},
			target_note: {
				type: "string",
				description: 'Vault note that run summaries are appended to. Default "openagent/Reports.md".',
			},
			skills: {
				type: "string",
				description:
					"Comma-separated skill names to focus this task on each run (their docs are injected into the run prompt).",
			},
			max_runs: {
				type: "number",
				description: "Stop and disable after this many runs (0 = unlimited — default).",
			},
			chain: {
				type: "boolean",
				description: "Include the previous run's output in the next run's prompt (context chaining).",
			},
			notify: {
				type: "boolean",
				description: "Show an Obsidian notice when a scheduled run succeeds (errors always notice).",
			},
			monitor_url: {
				type: "string",
				description:
					"Optional http(s) URL watched each tick. When its content is byte-identical to the previous tick the agent run is skipped entirely; when it changes, a diff block is injected into the prompt. This replaces the [SILENT] convention for change-detection.",
			},
			script: {
				type: "string",
				description:
					"Optional script file name run each tick from the protected openagent scripts folder (.sh/.js/.py). Its stdout is injected into the prompt as context. Only scripts the user placed there can run — you cannot create them.",
			},
			no_agent: {
				type: "boolean",
				description:
					"With script: run the script only and deliver its stdout verbatim to the target note — no AI call at all (watchdog).",
			},
		},
		required: ["action"],
	},
	execute: async (args, ctx) => {
		if (!ctx.cron) return "Automations are unavailable in this context.";
		const api = ctx.cron;
		const action = String(args.action ?? "").toLowerCase();
		const ACTIONS = ["create", "list", "update", "pause", "resume", "run", "remove"];
		if (!ACTIONS.includes(action))
			throw new Error(`Unknown action "${action}" — use ${ACTIONS.join(", ")}.`);

		if (action === "list") {
			const tasks = api.list().flatMap((task) => {
				try {
					return [{ task, target: resolveCronTarget(ctx, task.targetNote, true) }];
				} catch {
					return [];
				}
			});
			if (tasks.length === 0) return ok("No automations scheduled in this workspace.");
			return ok(
				tasks
					.map(({ task: t, target }) => {
						const completed = isCronCompleted(t) && !t.enabled;
						const bits = [
							completed ? "completed" : `${t.enabled ? "on" : "paused"}`,
							t.schedule.display,
							`→ ${target}`,
							t.maxRuns ? `${t.runCount}/${t.maxRuns} runs` : `${t.runCount} run${t.runCount === 1 ? "" : "s"}`,
						];
						if (t.skills?.length) bits.push(`skills: ${t.skills.join(",")}`);
						if (t.chainContext) bits.push("chain");
						if (t.notify) bits.push("notify");
						if (t.monitorUrl) bits.push(`monitor: ${t.monitorUrl}`);
						if (t.script) bits.push(`script: ${t.script}${t.noAgent ? " (no agent)" : ""}`);
						if (t.lastStatus) bits.push(`last: ${t.lastStatus}`);
						if (t.enabled && t.nextRun > 0) bits.push(`next ${formatRelative(t.nextRun)}`);
						return `- "${t.name}" (${t.id}) · ${bits.join(" · ")}`;
					})
					.join("\n")
			);
		}

		if (action === "create") {
			const rawPrompt = String(args.prompt ?? "").trim();
			if (!rawPrompt) throw new Error("Please provide a prompt describing what the automation should do each run.");
			const scan = scanCronPrompt(rawPrompt);
			const expr = String(args.schedule ?? "").trim() || "0 9 * * *";
			const v = validateCronExpr(expr);
			if (!v.ok) throw new Error(`Invalid schedule: ${v.error}`);
			const task = api.createTask({
				name: String(args.name ?? "").trim() || "Untitled task",
				prompt: scan.clean,
				expr,
				targetNote: resolveCronTarget(ctx, args.target_note),
				skills: parseSkillList(args.skills),
				maxRuns: parseMaxRuns(args.max_runs),
				chainContext: args.chain === true || undefined,
				notify: args.notify === true || undefined,
				monitorUrl: typeof args.monitor_url === "string" ? args.monitor_url : undefined,
				script: typeof args.script === "string" ? sanitizeScriptName(args.script) ?? undefined : undefined,
				noAgent: args.no_agent === true || undefined,
			});
			await api.persist();
			const extras = [
				task.skills?.length ? `skills: ${task.skills.join(", ")}` : "",
				task.maxRuns ? `stops after ${task.maxRuns} runs` : "",
				task.chainContext ? "chains run context" : "",
				task.notify ? "notifies on runs" : "",
				task.monitorUrl ? `monitors ${task.monitorUrl}` : "",
			]
				.filter(Boolean)
				.join("; ");
			const warn = scan.findings.length ? `\n\nSecurity scan: ${scan.findings.join("; ")}.` : "";
			return ok(
				`Created automation "${task.name}" (${task.id}) — ${task.schedule.display}, next run ${formatRelative(task.nextRun)}. Output goes to ${task.targetNote}.${extras ? ` ${extras}.` : ""}${warn} Tips: a monitor_url skips the agent entirely while the watched content is unchanged; starting a run's output with [SILENT] skips the note delivery.`
			);
		}

		// everything below targets an existing task
		const idOrName = String(args.id_or_name ?? "").trim();
		if (!idOrName) throw new Error(`Action "${action}" needs id_or_name. Use the cronjob list to see ids.`);
		const visibleTasks = api.list().filter((candidate) => {
			try {
				resolveCronTarget(ctx, candidate.targetNote, true);
				return true;
			} catch {
				return false;
			}
		});
		const found = findCronTask(visibleTasks, idOrName);
		if (!found.task) throw new Error(found.error ?? "Automation not found in this workspace.");
		const task = found.task;

		if (action === "update") {
			const patch: Parameters<CronjobApi["updateTask"]>[1] = {};
			if (typeof args.name === "string" && args.name.trim()) patch.name = args.name.trim();
			if (typeof args.prompt === "string" && args.prompt.trim()) patch.prompt = scanCronPrompt(args.prompt.trim()).clean;
			if (typeof args.target_note === "string" && args.target_note.trim())
				patch.targetNote = resolveCronTarget(ctx, args.target_note);
			if (typeof args.schedule === "string" && args.schedule.trim()) {
				const v = validateCronExpr(args.schedule.trim());
				if (!v.ok) throw new Error(`Invalid schedule: ${v.error}`);
				patch.expr = args.schedule.trim();
			}
			if (typeof args.skills === "string") patch.skills = parseSkillList(args.skills) ?? [];
			if (args.max_runs !== undefined) patch.maxRuns = parseMaxRuns(args.max_runs);
			if (args.chain !== undefined) patch.chainContext = args.chain === true;
			if (args.notify !== undefined) patch.notify = args.notify === true;
			if (typeof args.monitor_url === "string") patch.monitorUrl = args.monitor_url.trim();
			if (typeof args.script === "string") patch.script = sanitizeScriptName(args.script) ?? "";
			if (args.no_agent !== undefined) patch.noAgent = args.no_agent === true;
			if (Object.keys(patch).length === 0)
				throw new Error(
					"Nothing to update — pass name, prompt, schedule, target_note, skills, max_runs, chain, notify, monitor_url, script and/or no_agent."
				);
			const updated = api.updateTask(task.id, patch);
			await api.persist();
			return ok(
				`Updated "${updated.name}" (${updated.id}) — ${updated.schedule.display}, next run ${formatRelative(updated.nextRun)}.`
			);
		}
		if (action === "pause" || action === "resume") {
			const updated = api.setEnabled(task.id, action === "resume");
			await api.persist();
			return ok(
				action === "resume"
					? `"${updated.name}" resumed — next run ${formatRelative(updated.nextRun)}.`
					: `"${updated.name}" paused.`
			);
		}
		if (action === "run") {
			api.runNow(task.id, policyOf(ctx), ctx.settings);
			return ok(`Triggered "${task.name}" — it runs in the background and appends to ${task.targetNote}.`);
		}
		// action === "remove"
		const removed = api.removeTask(task.id);
		await api.persist();
		return ok(`Removed automation "${removed.name}".`);
	},
};

/* delegation toolset (v0.1.135 — bounded port of Hermes tools/delegate_tool.py */
/* plan: docs/plans/hermes-delegation-plan-2026-08-09. Sync-in-turn (their depth>0  */
/* path); orchestrator nesting + output_schema rejected honestly in v1)      */
/* ------------------------------------------------------------------ */

const delegateTaskTool: AgentTool = {
	name: "delegate_task",
	toolset: "delegation",
	description:
		"Spawn one or more subagents in isolated contexts. Provide 'goal' for a single task or 'tasks' for a parallel batch ([{goal, context?}]). Each subagent gets its own fresh conversation and the same tool access minus scheduling/clarify/memory-writes (it knows NOTHING of your conversation), and only its final summary returns to you. Use for 2+ independent subtasks that can run in parallel, or a reasoning-heavy digression that would flood your context. Do NOT delegate single-step mechanical work or re-delegate your entire goal to one worker — that is pass-through with no value added.",
	parameters: {
		type: "object",
		properties: {
			goal: { type: "string", description: "What the one subagent should accomplish — specific and self-contained." },
			context: { type: "string", description: "Background the subagent needs: paths, constraints, structure." },
			tasks: {
				type: "array",
				description: "Parallel batch — one entry per subagent.",
				items: {
					type: "object",
					properties: {
						goal: { type: "string", description: "Task goal" },
						context: { type: "string", description: "Task-specific context" },
					},
					required: ["goal"],
				},
			},
		},
		required: [],
	},
	execute: async (args, ctx, interactive) => {
		if (!ctx.delegation) return "Subagent delegation is unavailable in this execution context.";
		/* their v1+ knobs, rejected honestly rather than half-honored */
		if (args.role !== undefined && args.role !== "leaf")
			throw new Error('role "orchestrator" is not enabled in this version — nested delegation is rejected honestly (their depth config has no equivalent yet).');
		if (args.output_schema !== undefined)
			throw new Error("output_schema is not supported yet — ask the subagent for a tight prose summary instead.");
		const norm = normalizeDelegateArgs(args);
		if ("error" in norm) throw new Error(norm.error);
		const entries = await ctx.delegation.runBatch(norm.tasks, interactive?.delegateProgress, interactive?.signal);
		return ok(formatConsolidatedResult(entries));
	},
};

/* vision toolset (v0.1.134 — bounded port of Hermes tools/vision_tools.py,  */
/* studied byte-level: native pixels ride the tool result when the main     */
/* model accepts them; otherwise the aux vision model describes. Region-    */
/* crop / SVG rasterize / format-conversion / downscale are OUT (no Pillow  */
/* in Obsidian) — unsupported types are rejected honestly instead)          */
/* ------------------------------------------------------------------ */

const visionAnalyze: AgentTool = {
	name: "vision_analyze",
	toolset: "vision",
	description:
		"Load an image into the conversation so you can see it. Accepts a vault-relative file path, an http/https URL, or a data: URL. When your active model has native vision, the image is attached to your context directly and you read the pixels yourself on the next turn — call this any time the user references an image. For non-vision models, falls back to the configured auxiliary vision model that returns a text description.",
	parameters: {
		type: "object",
		properties: {
			image_url: { type: "string", description: "Vault-relative path, http/https URL, or data: URL of the image (PNG/JPEG/GIF/WebP/BMP, max 5 MB)" },
			question: { type: "string", description: "Your specific question or request about the image." },
		},
		required: ["image_url", "question"],
	},
	execute: async (args, ctx, runtime) => {
		if (!ctx.vision) return "Vision is unavailable in this execution context.";
		const srcRef = String(args.image_url ?? "");
		const question = String(args.question ?? "").trim();
		if (!srcRef.trim()) throw new Error("vision_analyze needs image_url (vault path, http/https URL, or data: URL).");
		if (!question) throw new Error("vision_analyze needs a question — what should be read from the image.");
		/* Preferred keeps legacy vault-wide vision paths; Strict checks the
		   already-vault-relative source without silently rerouting it. */
		const source = /^(?:https?:|data:)/i.test(srcRef.trim())
			? srcRef
			: policyOf(ctx).assertVisiblePath(srcRef, "Vision vault image");
		const img = await resolveVisionImage(source, ctx.app, VISION_MAX_IMAGE_BYTES, { signal: runtime?.signal });
		if (await ctx.vision.nativeAvailable()) return packNativeVisionResult(img.dataUrl, question, img.sourceLabel);
		/* their legacy path: aux LLM describes, we return its text as
		   {success, analysis} JSON (same payload shape as vision_analyze_tool) */
		const analysis = await ctx.vision.describe(img.dataUrl, question, img.sourceLabel, runtime?.signal);
		return JSON.stringify({ success: true, analysis });
	},
};

/* todo toolset (v0.1.133 — 1:1 port of Hermes tools/todo_tool.py, studied    */
/* byte-level; their design: single tool, omit todos to read, every call     */
/* returns the full list; guidance lives entirely in this description)      */
/* ------------------------------------------------------------------ */

const todoTool: AgentTool = {
	name: "todo",
	toolset: "todo",
	description:
		"Manage your task list for the current session. Use for complex tasks with 3+ steps or when the user provides multiple tasks. Call with no parameters to read the current list.\n\n" +
		"Writing:\n" +
		"- Provide 'todos' array to create/update items\n" +
		"- merge=false (default): replace the entire list with a fresh plan\n" +
		"- merge=true: update existing items by id, add any new ones\n\n" +
		"Each item: {id: string, content: string, status: pending|in_progress|completed|cancelled}\n" +
		"List order is priority. Only ONE item in_progress at a time.\n" +
		"Mark items completed immediately when done. If something fails, cancel it and add a revised item.\n\n" +
		"Always returns the full current list.",
	parameters: {
		type: "object",
		properties: {
			todos: {
				type: "array",
				description: "Task items to write. Omit to read the current list.",
				items: {
					type: "object",
					properties: {
						id: { type: "string", description: "Unique item identifier" },
						content: { type: "string", description: "Task description" },
						status: {
							type: "string",
							enum: ["pending", "in_progress", "completed", "cancelled"],
							description: "Current status",
						},
					},
					required: ["id", "content", "status"],
				},
			},
			merge: {
				type: "boolean",
				description: "true: update existing items by id, add new ones. false (default): replace the entire list.",
			},
		},
		required: [],
	},
	execute: async (args, ctx) => {
		if (!ctx.todo) return "Todo list is unavailable in this execution context.";
		let todos: unknown = args.todos;
		if (todos === undefined || todos === null) return ok(renderTodoResult(ctx.todo.read()));
		/* their guard: LLMs sometimes send todos as a JSON string instead of
		   a list — parse it, or fail honestly */
		if (typeof todos === "string") {
			try {
				todos = JSON.parse(todos);
			} catch {
				throw new Error("todos must be a list of objects, got an unparseable string");
			}
		}
		if (!Array.isArray(todos)) throw new Error(`todos must be a list, got ${typeof todos}`);
		const store = new TodoStore(ctx.todo.read());
		const items = store.write(todos, args.merge === true);
		ctx.todo.write(items);
		return ok(renderTodoResult(items));
	},
};

/* ------------------------------------------------------------------ */
/* registry                                                             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* clarify toolset (Hermes tools/clarify_tool.py parity, studied raw     */
/* 2026-08-05 @ aec3318 — notes: docs/studies/hermes-clarify-tool.md)            */
/* ------------------------------------------------------------------ */

/** Hermes MAX_CHOICES — the UI always appends a 5th "Other" option. */
export const CLARIFY_MAX_CHOICES = 4;

/**
 * Hermes _flatten_choice: LLMs sometimes emit dict-shaped choices instead
 * of bare strings; unwrap the canonical user-facing keys in this exact
 * precedence and DROP dicts with none of them (a garbage label is worse
 * than no choice at all). Arrays flatten by join.
 */
export function flattenClarifyChoice(c: unknown): string {
	if (c == null) return "";
	if (typeof c === "string") return c.trim();
	if (Array.isArray(c)) {
		return c.map((x) => flattenClarifyChoice(x)).filter(Boolean).join(" ").trim();
	}
	if (typeof c === "object") {
		const d = c as Record<string, unknown>;
		for (const key of ["label", "description", "text", "title"]) {
			const v = d[key];
			if (typeof v === "string" && v.trim()) return v.trim();
		}
		return "";
	}
	return String(c).trim();
}

const clarifyTool: AgentTool = {
	name: "clarify",
	toolset: "clarify",
	description:
		"Ask the user a question when you need clarification, feedback, or a decision before proceeding. " +
		"Three modes: (1) single-select multiple choice — provide up to 4 choices; the user picks one or types their own via a 5th 'Other' option. " +
		"(2) multi-select — set multi_select=true; the user can select several options; user_response becomes a list. " +
		"(3) open-ended — omit choices entirely; the user types a free-form response. " +
		"CRITICAL: when offering options, put each option ONLY in the `choices` array — NEVER enumerate the options inside the `question` text: options written into the question render as dead prose the user can't pick. " +
		"Use when the task is ambiguous, when a decision has meaningful trade-offs the user should weigh in on, or for post-task feedback. " +
		"Do NOT use for yes/no confirmation of dangerous actions (the approval flow handles that). Prefer making a reasonable default choice yourself when the decision is low-stakes.",
	parameters: {
		type: "object",
		properties: {
			question: {
				type: "string",
				description:
					"The question itself, and ONLY the question (e.g. 'Which deployment target?'). Do NOT embed the answer options here — pass them as separate elements in `choices`.",
			},
			choices: {
				type: "array",
				items: { type: "string" },
				maxItems: CLARIFY_MAX_CHOICES,
				description:
					"REQUIRED whenever you present selectable options: each distinct option is its own array element (up to 4). The UI renders these as pickable rows and auto-appends an 'Other (type your answer)' option. Omit entirely ONLY for a genuinely open-ended free-text question.",
			},
			multi_select: {
				type: "boolean",
				description:
					"When true, the user can select MULTIPLE options (checkboxes); user_response becomes a list of selected choices. Default false = single selection. No effect when choices is omitted.",
			},
		},
		required: ["question"],
	},
	execute: async (args, _ctx, interactive) => {
		const question = typeof args.question === "string" ? args.question.trim() : "";
		if (!question) return "Error: Question text is required.";
		let choices: string[] | null = null;
		if (args.choices != null) {
			if (!Array.isArray(args.choices)) return "Error: choices must be a list of strings.";
			choices = args.choices.map((c: unknown) => flattenClarifyChoice(c)).filter(Boolean);
			if (choices.length > CLARIFY_MAX_CHOICES) choices = choices.slice(0, CLARIFY_MAX_CHOICES);
			if (choices.length === 0) choices = null; // empty list → open-ended
		}
		/* Hermes: callback=None → tool_error — cron/headless runs get exactly
		   this, and the agent proceeds on its own judgement */
		if (!interactive?.clarify) return "Error: Clarify tool is not available in this execution context.";
		const multiSelect = args.multi_select === true && choices !== null;
		try {
			const raw = await interactive.clarify({ question, choices, multiSelect });
			const userResponse = multiSelect
				? (Array.isArray(raw) ? raw : [raw]).map((x) => String(x).trim()).filter(Boolean)
				: String(raw).trim();
			/* Hermes result envelope: {question, choices_offered, user_response} */
			return JSON.stringify({ question, choices_offered: choices, user_response: userResponse });
		} catch (err) {
			return `Error: Failed to get user input: ${err instanceof Error ? err.message : String(err)}`;
		}
	},
};

export const ALL_TOOLS: AgentTool[] = [
	readNote,
	writeNote,
	editNote,
	deleteNote,
	renameNote,
	listFiles,
	searchVault,
	getActiveNote,
	webExtract,
	webSearch,
	saveMemory,
	updateUserProfile,
	searchMemory,
	sessionSearch,
	createSkill,
	listSkills,
	viewSkill,
	manageSkill,
	cronjob,
	clarifyTool,
	todoTool,
	visionAnalyze,
	delegateTaskTool,
	...TERMINAL_TOOLS,
];

/** Resolve the tools enabled by the current settings. Desktop runtime
 * availability is a separate fail-closed gate: enabling a persisted switch
 * on mobile never exposes schemas or evaluates Node execution code. */
export function resolveEnabledTools(
	settings: OpenAgentSettings,
	options: { terminalAvailable?: boolean } = {}
): AgentTool[] {
	return ALL_TOOLS.filter((t) => {
		/* MCP tools are injected dynamically (never in ALL_TOOLS) and gated by
		   the mcpEnabled master switch at the injection point — keep the
		   toolset lookup honest if one ever lands here. */
		if (t.toolset === "mcp") return settings.mcpEnabled === true;
		if (!settings.toolsets[t.toolset]) return false;
		if (t.toolset === "memory" && !settings.memoryEnabled) return false;
		if (t.toolset === "skills" && !settings.skillsEnabled) return false;
		if (t.toolset === "terminal" && options.terminalAvailable !== true) return false;
		return true;
	});
}

/** OpenAI wire format for the enabled tools. */
export function toolSchemas(tools: AgentTool[]): unknown[] {
	return tools.map((t) => ({
		type: "function",
		function: { name: t.name, description: t.description, parameters: t.parameters },
	}));
}
