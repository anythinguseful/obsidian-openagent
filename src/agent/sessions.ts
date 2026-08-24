/**
 * Session store — Hermes-style searchable conversation history.
 *
 * Sessions are stored as JSON files under the plugin's data folder
 * (not in the visible vault by default) with a lightweight inverted
 * index for full-text cross-session recall.
 */

import type { SessionGoal } from "./goals";
import type { TodoItem } from "./todo";
import { App } from "obsidian";
import { ChatMessage, ConversationTurn } from "../types";
import type { CompressionCache } from "./contextManager";
import { canonicalVaultPath, pathContains } from "./workspacePolicy";

const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

function safeSessionId(value: unknown): string {
	if (typeof value !== "string" || !SESSION_ID_RE.test(value)) {
		throw new Error("Invalid session id.");
	}
	return value;
}

export interface SessionMeta {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	model: string;
	turnCount: number;
	/** branch lineage (Hermes /branch): id of the parent session this chat forked from */
	parent?: string;
}

export interface Session extends SessionMeta {
	turns: ConversationTurn[];
	/** raw wire history, so loaded sessions can be continued */
	messages?: ChatMessage[];
	/** /personality session overlay active during this conversation (Hermes: session-level) */
	personality?: string;
	/** context compression cache (v0.1.17): rolling wire summary; additive, optional */
	compression?: CompressionCache;
	/** standing goal (v0.1.25, hermes_cli/goals.py): the Ralph loop state rides
	   the session file so /resume picks it back up */
	goal?: SessionGoal;
	/** task list (v0.1.133, Hermes tools/todo_tool.py port): the scratch-pad
	   plan rides the session file like goal/compression — /resume and /branch
	   pick it back up (Hermes keeps it in-memory per agent process + rebuilds
	   via gateway replay; an Obsidian plugin restarts too often for that) */
	todos?: TodoItem[];
}

/** A session file is disk data: a truncated write, a hand edit, or a file from
 * another schema version can leave valid JSON whose required fields are gone.
 * parsing and casting straight to the Session type asserts a shape nothing ever
 * checked, so the gap
 * surfaced only as a crash at the first touch — `search()` did
 * `for (const turn of session.turns)` ("turns is not iterable"), then
 * `turn.parts.map` ("cannot read properties of undefined"), and `list()` fed an
 * undefined `title` into `.toLowerCase()`. One corrupt file took out search and
 * the chat-load path for every session. Normalize on read instead of trusting
 * the cast; unknown/extra fields ride through untouched. */
export function sanitizeSession(value: unknown): Session | null {
	if (!value || typeof value !== "object") return null;
	const o = value as Record<string, unknown>;
	if (typeof o.id !== "string") return null;
	const turns = Array.isArray(o.turns)
		? o.turns
			.filter((t): t is ConversationTurn => !!t && typeof t === "object")
			.map((t) => ({ ...t, parts: Array.isArray(t.parts) ? t.parts : [] }))
		: [];
	return {
		...(o as unknown as Session),
		id: o.id,
		title: typeof o.title === "string" ? o.title : "",
		createdAt: typeof o.createdAt === "number" ? o.createdAt : 0,
		updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : 0,
		model: typeof o.model === "string" ? o.model : "",
		turnCount: typeof o.turnCount === "number" ? o.turnCount : turns.length,
		turns,
	};
}

export class SessionStore {
	private app: App;
	private baseDir: string;
	private dir: string;
	private maxSessions: number;

	constructor(app: App, pluginId: string, maxSessions = 100) {
		this.app = app;
		this.baseDir = canonicalVaultPath(`${app.vault.configDir}/plugins/${pluginId}/sessions`, {
			label: "Plugin session storage root",
		});
		this.dir = this.baseDir;
		this.maxSessions = maxSessions;
	}

	setMaxSessions(n: number) {
		this.maxSessions = n;
	}

	/** Immutable view used by an in-flight run so live profile/Workspace
	 *  rebinding cannot redirect a later save into another session partition. */
	snapshot(): SessionStore {
		const scoped = Object.create(SessionStore.prototype) as SessionStore;
		scoped.app = this.app;
		scoped.baseDir = this.baseDir;
		scoped.dir = this.dir;
		scoped.maxSessions = this.maxSessions;
		return scoped;
	}

	/** Stable plugin-private partition identity for queue provenance and races. */
	partitionKey(): string {
		return this.dir === this.baseDir ? "" : this.dir.slice(this.baseDir.length + 1);
	}

	/** Plugin-private root shown by Reset Everything and removed explicitly. */
	storagePath(): string {
		return this.baseDir;
	}

	async clearAll(): Promise<boolean> {
		try {
			await this.app.vault.adapter.rmdir(this.baseDir, true);
			return true;
		} catch {
			return false;
		}
	}

	/** Hermes profiles: sessions are isolated per profile ("" = legacy shared dir). */
	setSubdir(sub: string): void {
		if (!sub) {
			this.dir = this.baseDir;
			return;
		}
		const rel = canonicalVaultPath(sub, { label: "Session partition" });
		const next = canonicalVaultPath(`${this.baseDir}/${rel}`, { label: "Session partition path" });
		if (!pathContains(this.baseDir, next)) throw new Error("Session partition escaped plugin storage.");
		this.dir = next;
	}

	private path(id: string, dir = this.dir): string {
		if (!pathContains(this.baseDir, dir)) throw new Error("Session storage escaped plugin storage.");
		return canonicalVaultPath(`${dir}/${safeSessionId(id)}.json`, { label: "Session file" });
	}

	private async ensureDir(dir = this.dir): Promise<void> {
		if (!pathContains(this.baseDir, dir)) throw new Error("Session storage escaped plugin storage.");
		try {
			await this.app.vault.adapter.mkdir(dir);
		} catch {
			/* exists */
		}
	}

	async list(dir = this.dir): Promise<SessionMeta[]> {
		await this.ensureDir(dir);
		const listing = await this.app.vault.adapter.list(dir);
		const metas: SessionMeta[] = [];
		for (const file of listing.files) {
			if (!file.endsWith(".json") || !pathContains(dir, file)) continue;
			try {
				const fileId = safeSessionId(file.slice(file.lastIndexOf("/") + 1, -5));
				const raw = await this.app.vault.adapter.read(file);
				const s = sanitizeSession(JSON.parse(raw));
				if (!s || s.id !== fileId) continue; // never let file content redirect a later load/remove
				metas.push({
					id: fileId,
					title: s.title,
					createdAt: s.createdAt,
					updatedAt: s.updatedAt,
					model: s.model,
					turnCount: s.turnCount,
					...(s.parent ? { parent: s.parent } : {}),
				});
			} catch {
				/* corrupt entry — skip */
			}
		}
		return metas.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	async load(id: string, dir = this.dir): Promise<Session | null> {
		try {
			const raw = await this.app.vault.adapter.read(this.path(id, dir));
			return sanitizeSession(JSON.parse(raw));
		} catch {
			return null;
		}
	}

	async save(session: Session): Promise<void> {
		const dir = this.dir; // immutable operation snapshot across awaits
		const path = this.path(session.id, dir); // validate before any Adapter mutation
		await this.ensureDir(dir);
		await this.app.vault.adapter.write(path, JSON.stringify(session));
		await this.prune(dir);
	}

	async remove(id: string, dir = this.dir): Promise<void> {
		try {
			await this.app.vault.adapter.remove(this.path(id, dir));
		} catch {
			/* missing — fine */
		}
	}

	/** v0.1.158 (A1 EditableText): rename a session in place without loading
	 * it into chat. Recency is NOT bumped (renaming isn't activity) — the
	 * panel keeps its order; only the title changes on disk. Returns the
	 * updated session, or null when the id doesn't resolve. */
	async rename(id: string, title: string): Promise<Session | null> {
		const s = await this.load(id);
		if (!s) return null;
		s.title = title;
		await this.save(s);
		return s;
	}

	private async prune(dir = this.dir): Promise<void> {
		const metas = await this.list(dir);
		const overflow = metas.slice(this.maxSessions);
		for (const m of overflow) await this.remove(m.id, dir);
	}

	/** Hermes: search past conversations for cross-session recall. Matches the
	 * title first, then any turn's text/tool output; returns recency-ranked
	 * (list() sorts by updatedAt desc) metas with a bounded excerpt. */
	async search(query: string, limit = 8): Promise<{ meta: SessionMeta; excerpt: string }[]> {
		const dir = this.dir; // keep one workspace/profile partition for the search
		const q = query.trim().toLowerCase();
		const results: { meta: SessionMeta; excerpt: string }[] = [];
		if (!q) return results;
		for (const meta of await this.list(dir)) {
			if (results.length >= limit) break;
			/* title hit — no need to open the file for an excerpt */
			if (meta.title.toLowerCase().includes(q)) {
				results.push({ meta, excerpt: meta.title });
				continue;
			}
			const session = await this.load(meta.id, dir);
			if (!session) continue;
			for (const turn of session.turns) {
				const text = turn.parts
					.map((p) => (p.kind === "text" ? p.text : p.kind === "tool" ? p.result ?? "" : ""))
					.join(" ")
					.toLowerCase();
				const idx = text.indexOf(q);
				if (idx >= 0) {
					results.push({ meta, excerpt: text.slice(Math.max(0, idx - 50), idx + 120).trim() });
					break;
				}
			}
		}
		return results;
	}
}

export function newSessionId(): string {
	return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
