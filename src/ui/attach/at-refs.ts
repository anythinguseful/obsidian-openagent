/**
 * Attach menu · `@` inline references.
 *
 * Pure helpers — no obsidian imports, fully unit-testable.
 * Token format: `@[[path/Note.md]]` (Obsidian-native: renders as a wikilink
 * in the chat bubble for free, safe for names with spaces).
 *
 *   findAtQuery   — is the caret inside an unfinished `@…` token? (drives the popup)
 *   extractAtRefs — pull `@[[path]]` / `@[[path|alias]]` tokens out of a prompt
 *   resolveAtRefs — map token paths to real vault paths (exact → unique basename → suffix)
 *   spliceToken   — replace the unfinished token with a completed `@[[path]]`
 */

export interface AtQuery {
	/** index of the '@' in the text */
	start: number;
	/** whatever the user typed after '@' up to the caret */
	query: string;
}

/**
 * Caret sits right after an unfinished `@token` (no whitespace in between,
 * '@' itself is at a word boundary). Already-completed `@[[…]]` tokens and
 * plain "@" with a space after it return null.
 */
export function findAtQuery(text: string, caret: number): AtQuery | null {
	// token boundary: whitespace or an opener that commonly precedes a mention
	// (NOT '[' — "@[[partial" must stay one token while typing the wikilink)
	let i = caret - 1;
	while (i >= 0 && !/[\s({"'`]/.test(text[i])) i--;
	const token = text.slice(i + 1, caret);
	// token must be "@query" or "@[[partial", never a finished "@[[…]]"
	if (!token.startsWith("@")) return null;
	if (token.includes("]]")) return null;
	const query = token.slice(1).replace(/^\[\[/, "");
	return { start: i + 1, query };
}

export interface AtRef {
	/** the vault path inside the brackets */
	path: string;
	alias?: string;
}

const AT_REF_RE = /@\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;

/** all `@[[path]]` / `@[[path|alias]]` tokens in a prompt */
export function extractAtRefs(text: string): AtRef[] {
	const out: AtRef[] = [];
	AT_REF_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = AT_REF_RE.exec(text))) {
		const path = m[1].trim();
		if (!path) continue;
		out.push({ path, alias: m[2]?.trim() || undefined });
	}
	return out;
}

export type AtResolution = { ref: AtRef; resolved: string | null };

/**
 * Resolve token paths against vault paths:
 *   1. exact path (case-sensitive)          → hit
 *   2. unique basename (case-insensitive)   → hit
 *   3. unique path suffix ("folder/note")   → hit
 * otherwise null (caller Notices the user and leaves the token literal).
 */
export function resolveAtRefs(refs: AtRef[], vaultPaths: string[]): AtResolution[] {
	const byPath = new Map(vaultPaths.map((p) => [p, p]));
	const byBase = new Map<string, string[]>();
	for (const p of vaultPaths) {
		const base = p.split("/").pop()!.toLowerCase();
		const list = byBase.get(base) ?? [];
		list.push(p);
		byBase.set(base, list);
	}
	return refs.map((ref) => {
		const exact = byPath.get(ref.path);
		if (exact) return { ref, resolved: exact };
		const lower = ref.path.toLowerCase();
		const baseList = byBase.get(lower.split("/").pop()!);
		if (baseList?.length === 1 && !ref.path.includes("/")) return { ref, resolved: baseList[0] };
		// suffix: "folder/note.md" matches "a/b/folder/note.md", not "x/folder/note-copy.md"
		if (ref.path.includes("/")) {
			const hits = vaultPaths.filter((p) => p.toLowerCase().endsWith("/" + lower));
			if (hits.length === 1) return { ref, resolved: hits[0] };
			if (baseList?.length === 1) return { ref, resolved: baseList[0] };
		}
		return { ref, resolved: null };
	});
}

/**
 * Replace the unfinished token (start..caret) with `@[[path]] `.
 * Returns the new text and the caret position after the inserted token.
 */
export function spliceToken(text: string, start: number, caret: number, path: string): { text: string; caret: number } {
	const token = `@[[${path}]] `;
	const next = text.slice(0, start) + token + text.slice(caret);
	return { text: next, caret: start + token.length };
}
