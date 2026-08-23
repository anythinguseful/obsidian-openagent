/**
 * Copilot custom-command prompt tokens (owner ask 2026-08-05, v0.1.78).
 * The four placeholders Copilot documents under a command's Prompt field:
 *
 *   {}               → the selected text (substituted inline)
 *   {[[Note Title]]} → a vault note (resolved to an [Attached file] block)
 *   {activeNote}     → the active note (same resolution)
 *   {#tag1, #tag2}   → ALL notes with ANY of those property tags (OR)
 *
 * This module is the PURE half: parse / normalize / title lookup — no
 * Obsidian APIs, so it stays unit-checkable. Reading files + frontmatter
 * lives in runAgent (ChatApp), where vault access exists and resolved
 * notes ride the exact same [Attached file] pipeline as @[[refs]].
 */

export interface PromptTokens {
	/** prompt text with note/tag tokens stripped and `{}` substituted */
	text: string;
	/** `{activeNote}` appeared (case-insensitive) */
	activeNote: boolean;
	/** unique titles from `{[[…]]}` tokens, first-seen order */
	titles: string[];
	/** unique lowercase, `#`-stripped tags from `{#…}` tokens */
	tags: string[];
}

/**
 * Extract every prompt token from raw text.
 *
 * `{}` is substituted with `selection` (an empty/absent selection → the
 * token simply disappears — it must never reach the model as a literal
 * "{}"). Note tokens are STRIPPED from the text; the caller resolves the
 * structured fields into attachments and Notices the unresolvable ones
 * (a stripped miss + a named Notice beats a silent literal, Copilot's
 * own behavior, which silently drops them).
 */
export function extractPromptTokens(raw: string, selection: string | null): PromptTokens {
	let text = raw;
	if (text.includes("{}")) text = text.split("{}").join(selection ?? "");

	let activeNote = false;
	text = text.replace(/\{activeNote\}/gi, () => {
		activeNote = true;
		return "";
	});

	const titles: string[] = [];
	text = text.replace(/\{\[\[([^\]\n]+)\]\]\}/g, (_m, inner: string) => {
		const t = inner.trim();
		if (t && !titles.includes(t)) titles.push(t);
		return "";
	});

	const tags: string[] = [];
	text = text.replace(/\{#([^}\n]+)\}/g, (_m, list: string) => {
		for (const piece of list.split(",")) {
			const tag = piece.trim().replace(/^#+/, "").toLowerCase();
			if (tag && !tags.includes(tag)) tags.push(tag);
		}
		return "";
	});

	/* a removed token can orphan its line — drop trailing space-before-\n
	   and collapse 3+ newlines so the model's text stays tidy */
	text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
	return { text, activeNote, titles, tags };
}

/**
 * `{activeNote}`-only extraction for hosts that resolve JUST that token
 * (v0.1.90 Quick Ask — the other three tokens stay literal there; one
 * home for the token regex family, same tidy-up as extractPromptTokens).
 */
export function extractActiveNoteToken(raw: string): { text: string; activeNote: boolean } {
	let activeNote = false;
	let text = raw.replace(/\{activeNote\}/gi, () => {
		activeNote = true;
		return "";
	});
	text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
	return { text, activeNote };
}

/**
 * Property (frontmatter) tags normalized for matching: array, comma list
 * or space list all flatten to unique lowercase `#`-stripped tags. Tip
 * text says "in their property" — inline body `#tags` deliberately do
 * NOT match (Copilot's documented scope).
 */
export function normalizePropertyTags(raw: unknown): string[] {
	const pieces: string[] = [];
	if (Array.isArray(raw)) {
		for (const x of raw) pieces.push(...String(x).split(/[,\s]+/));
	} else if (typeof raw === "string") {
		pieces.push(...raw.split(/[,\s]+/));
	}
	const out: string[] = [];
	for (const p of pieces) {
		const t = p.trim().replace(/^#+/, "").toLowerCase();
		if (t && !out.includes(t)) out.push(t);
	}
	return out;
}

/** OR semantics: the note matches when ANY wanted tag is in its property. */
export function noteMatchesWantedTags(frontmatterTags: unknown, wanted: string[]): boolean {
	const got = normalizePropertyTags(frontmatterTags);
	return wanted.some((w) => got.includes(w));
}

/**
 * `{[[Title]]}` → vault path. Exact path first (with or without `.md`,
 * folder-qualified titles included), then a case-insensitive basename
 * match — Copilot resolves wikilink-style titles the same forgiving way.
 */
export function resolveTitleToPath(title: string, mdPaths: string[]): string | null {
	const want = title.toLowerCase();
	for (const p of mdPaths) {
		const lp = p.toLowerCase();
		if (lp === want || lp === `${want}.md`) return p;
	}
	for (const p of mdPaths) {
		const base = (p.split("/").pop() ?? p).replace(/\.md$/i, "").toLowerCase();
		if (base === want) return p;
	}
	return null;
}
