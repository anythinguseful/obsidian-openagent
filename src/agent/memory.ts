/**
 * Persistent memory — Hermes' agent-curated memory model.
 *
 *  · MEMORY.md — long-term agent-curated insights
 *  · USER.md   — dialectic model of who the user is
 *
 * Both live as plain markdown inside the vault so the user can read, edit and
 * link them like any other note. One entry per markdown bullet, so the files
 * stay human-readable in Obsidian.
 *
 * v0.1.148 parity with Hermes `tools/memory_tool.py`:
 *  · bounded budgets (memory/profile char limits, enforced at write time)
 *  · add / replace / remove (replace & remove match a short unique substring)
 *  · an overflow add is refused with the current inventory so the agent can
 *    consolidate instead of silently growing the file
 *  · entries are scanned for injection/exfil shapes before they enter the
 *    system prompt (blocked entries render as [BLOCKED: reason] — the raw file
 *    on disk is left untouched so the user can see and edit it)
 *  · a drift guard refuses replace/remove when the file holds lines that
 *    wouldn't round-trip (manual edits), instead of silently dropping them.
 *
 * Divergence, stated honestly: Hermes stores entries §-delimited and allows
 * multiline entries; Open Agent keeps one markdown bullet per entry so the
 * vault file is directly editable.
 */

import { App, TFile } from "obsidian";
import { canonicalVaultPath, pathContains } from "./workspacePolicy";
import { firstThreatMessage } from "./threatPatterns";

const noop = (): void => {};

export const MEMORY_DEFAULT_CHAR_LIMIT = 4000;
export const USER_DEFAULT_CHAR_LIMIT = 2500;

/* ------------------------------------------------------------------ */
/* pure entry helpers (node-testable, no Obsidian)                     */
/* ------------------------------------------------------------------ */

/** True for an entry bullet (`- …`); false for headings, blanks, prose. */
export function isEntryLine(line: string): boolean {
	const t = line.trim();
	return t.startsWith("- ") && !t.startsWith("#");
}

/** Split a memory/user file into its entry lines (right-trimmed). */
export function parseMemoryEntries(text: string): string[] {
	return (text ?? "")
		.split("\n")
		.map((l) => l.trimEnd())
		.filter(isEntryLine);
}

/** Lines that would be silently dropped by a rewrite — the drift tripwire. */
export function driftLines(text: string): string[] {
	return (text ?? "")
		.split("\n")
		.map((l) => l.trimEnd())
		.filter((l) => l.trim() !== "" && !l.trim().startsWith("#") && !isEntryLine(l));
}

/** Render a memory entry as a dated, categorized bullet (the on-disk shape). */
export function formatMemoryEntry(entry: string, category: string, stamp: string): string {
	return `- **${stamp}** _(${category})_ ${entry.trim()}`;
}

/** Render a user-profile entry bullet (the on-disk shape). */
export function formatUserEntry(entry: string): string {
	return `- ${entry.trim()}`;
}

/** Total chars of the entry list, counting one newline per entry. */
export function memoryUsage(entries: string[]): number {
	return entries.reduce((n, l) => n + l.length + 1, 0);
}

/** Keep whole entries that fit within `limit`, most-recent first. */
export function selectWithinLimit(entries: string[], limit: number): string[] {
	if (limit <= 0) return [];
	const kept: string[] = [];
	let used = 0;
	for (let i = entries.length - 1; i >= 0; i--) {
		const cost = entries[i].length + 1;
		if (used + cost > limit) break;
		kept.unshift(entries[i]);
		used += cost;
	}
	return kept;
}

/** Scan entries for injection/exfil shapes; blocked entries render as a
 * placeholder while the raw file stays untouched. */
export function scanMemoryEntries(entries: string[]): string[] {
	return entries.map((line) => {
		const reason = firstThreatMessage(line);
		return reason ? `- [BLOCKED: ${reason}]` : line;
	});
}

export interface MatchResult {
	index?: number;
	error?: string;
}

/** Locate the single entry containing `needle` (substring, case-sensitive). */
export function uniqueMatchIndex(entries: string[], needle: string): MatchResult {
	const hit = entries.map((l, i) => ({ l, i })).filter(({ l }) => l.includes(needle));
	if (hit.length === 0) return { error: `no memory entry matches "${needle}".` };
	if (hit.length > 1)
		return { error: `"${needle}" matches ${hit.length} entries — use a more specific phrase.` };
	return { index: hit[0].i };
}

export interface MemoryOpResult {
	ok: boolean;
	entries: string[];
	usage: number;
	error?: string;
}

/** Add an entry line under a char budget; refuses overflow with the usage. */
export function applyMemoryAdd(entries: string[], entryLine: string, limit: number): MemoryOpResult {
	if (!entryLine.trim()) return { ok: false, entries, usage: memoryUsage(entries), error: "the entry is empty." };
	const usage = memoryUsage(entries);
	const cost = entryLine.length + 1;
	if (usage + cost > limit) {
		return {
			ok: false,
			entries,
			usage,
			error: `memory is full (${usage}/${limit} characters). Free room with replace/remove first, then add again.`,
		};
	}
	return { ok: true, entries: [...entries, entryLine], usage: usage + cost };
}

/** Replace the unique entry matching `oldText`; refuses overflow. */
export function applyMemoryReplace(entries: string[], oldText: string, entryLine: string, limit: number): MemoryOpResult {
	const m = uniqueMatchIndex(entries, oldText);
	if (m.error) return { ok: false, entries, usage: memoryUsage(entries), error: m.error };
	const next = entries.slice();
	next[m.index as number] = entryLine;
	const usage = memoryUsage(next);
	if (usage > limit) {
		return {
			ok: false,
			entries,
			usage: memoryUsage(entries),
			error: `replacement would exceed the ${limit}-character budget (${usage}/${limit}). Shorten it first.`,
		};
	}
	return { ok: true, entries: next, usage };
}

/** Remove the unique entry matching `oldText`. */
export function applyMemoryRemove(entries: string[], oldText: string): MemoryOpResult {
	const m = uniqueMatchIndex(entries, oldText);
	if (m.error) return { ok: false, entries, usage: memoryUsage(entries), error: m.error };
	const next = entries.filter((_, i) => i !== m.index);
	return { ok: true, entries: next, usage: memoryUsage(next) };
}

/** Build the "current entries" inventory shown on failure, for consolidation. */
export function inventoryBlock(entries: string[], limit: number): string {
	if (entries.length === 0) return "(no entries)";
	return entries.map((l) => `  ${l}`).join("\n") + `\n(usage ${memoryUsage(entries)}/${limit} characters)`;
}

/* ------------------------------------------------------------------ */
/* store                                                               */
/* ------------------------------------------------------------------ */

export class MemoryStore {
	private app: App;
	private folder: string;
	private memoryCharLimit: number;
	private userCharLimit: number;

	constructor(app: App, folder: string, memoryCharLimit = MEMORY_DEFAULT_CHAR_LIMIT, userCharLimit = USER_DEFAULT_CHAR_LIMIT) {
		this.app = app;
		this.folder = canonicalVaultPath(folder, { label: "Managed memory folder" });
		this.memoryCharLimit = memoryCharLimit;
		this.userCharLimit = userCharLimit;
	}

	setFolder(folder: string): void {
		this.folder = canonicalVaultPath(folder, { label: "Managed memory folder" });
	}

	setLimits(memoryCharLimit: number, userCharLimit: number): void {
		this.memoryCharLimit = memoryCharLimit;
		this.userCharLimit = userCharLimit;
	}

	get memoryCharLimitValue(): number {
		return this.memoryCharLimit;
	}

	get userCharLimitValue(): number {
		return this.userCharLimit;
	}

	private containedPath(fileName: string): string {
		const path = canonicalVaultPath(`${this.folder}/${fileName}`, { label: "Managed memory file" });
		if (!pathContains(this.folder, path)) throw new Error("Managed memory path escaped its folder.");
		return path;
	}

	get currentFolder(): string {
		return this.folder;
	}

	get memoryPath(): string {
		return this.containedPath("MEMORY.md");
	}

	get userPath(): string {
		return this.containedPath("USER.md");
	}

	private async ensureFile(path: string, heading: string): Promise<TFile> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		const dir = path.split("/").slice(0, -1).join("/");
		if (dir) await this.app.vault.createFolder(dir).catch(noop);
		return this.app.vault.create(path, `# ${heading}\n\n`);
	}

	private stamp(): string {
		return window.moment ? window.moment().format("YYYY-MM-DD") : new Date().toISOString().slice(0, 10);
	}

	/** Persist a full entry list atomically; refuses when the file has drifted
	 * (manual edits that would not round-trip through the entry parser). */
	private async writeEntries(path: string, heading: string, next: string[]): Promise<TFile> {
		const f = await this.ensureFile(path, heading);
		const current = await this.app.vault.read(f);
		const drift = driftLines(current);
		if (drift.length > 0) {
			throw new Error(
				`Refusing to rewrite ${path.split("/").pop()}: it has ${drift.length} line(s) not in the memory entry format ` +
					`(likely a manual edit or a pasted paragraph). Integrate them as "- " bullets first — nothing was changed.`
			);
		}
		await this.app.vault.modify(f, `# ${heading}\n\n${next.join("\n")}\n`);
		return f;
	}

	private async mutateMemory(
		path: string,
		heading: string,
		limit: number,
		op: (entries: string[]) => MemoryOpResult,
	): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(path);
		const entries = f instanceof TFile ? parseMemoryEntries(await this.app.vault.read(f)) : [];
		const result = op(entries);
		if (!result.ok) {
			throw new Error(`${result.error}\nCurrent entries:\n${inventoryBlock(result.entries, limit)}`);
		}
		await this.writeEntries(path, heading, result.entries);
	}

	/* ── MEMORY.md ── */
	add(entry: string, category = "general"): Promise<void> {
		return this.mutateMemory(this.memoryPath, "Memory", this.memoryCharLimit, (entries) =>
			applyMemoryAdd(entries, formatMemoryEntry(entry, category, this.stamp()), this.memoryCharLimit)
		);
	}

	replace(oldText: string, entry: string, category = "general"): Promise<void> {
		return this.mutateMemory(this.memoryPath, "Memory", this.memoryCharLimit, (entries) =>
			applyMemoryReplace(entries, oldText, formatMemoryEntry(entry, category, this.stamp()), this.memoryCharLimit)
		);
	}

	remove(oldText: string): Promise<void> {
		return this.mutateMemory(this.memoryPath, "Memory", this.memoryCharLimit, (entries) =>
			applyMemoryRemove(entries, oldText)
		);
	}

	/* ── USER.md ── */
	addUser(entry: string): Promise<void> {
		return this.mutateMemory(this.userPath, "User Profile", this.userCharLimit, (entries) =>
			applyMemoryAdd(entries, formatUserEntry(entry), this.userCharLimit)
		);
	}

	replaceUser(oldText: string, entry: string): Promise<void> {
		return this.mutateMemory(this.userPath, "User Profile", this.userCharLimit, (entries) =>
			applyMemoryReplace(entries, oldText, formatUserEntry(entry), this.userCharLimit)
		);
	}

	removeUser(oldText: string): Promise<void> {
		return this.mutateMemory(this.userPath, "User Profile", this.userCharLimit, (entries) =>
			applyMemoryRemove(entries, oldText)
		);
	}

	/* ── reads (injection-scanned, budget-bounded, most-recent first) ── */
	async readMemory(maxChars = this.memoryCharLimit): Promise<string> {
		const f = this.app.vault.getAbstractFileByPath(this.memoryPath);
		if (!(f instanceof TFile)) return "";
		const text = await this.app.vault.read(f);
		return scanMemoryEntries(selectWithinLimit(parseMemoryEntries(text), maxChars)).join("\n");
	}

	async readUserProfile(maxChars = this.userCharLimit): Promise<string> {
		const f = this.app.vault.getAbstractFileByPath(this.userPath);
		if (!(f instanceof TFile)) return "";
		const text = await this.app.vault.read(f);
		return scanMemoryEntries(selectWithinLimit(parseMemoryEntries(text), maxChars)).join("\n");
	}

	async search(query: string): Promise<string[]> {
		const q = query.toLowerCase();
		const hits: string[] = [];
		for (const path of [this.memoryPath, this.userPath]) {
			const f = this.app.vault.getAbstractFileByPath(path);
			if (!(f instanceof TFile)) continue;
			const text = await this.app.vault.read(f);
			for (const line of text.split("\n")) {
				if (line.toLowerCase().includes(q) && line.trim().startsWith("-")) {
					hits.push(`${path.split("/").pop()}: ${line.trim()}`);
				}
			}
		}
		return hits.slice(0, 25);
	}
}
