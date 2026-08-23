/**
 * Slash chips — Hermes Desktop `slash-refs.ts` parity (byte-for-byte regex).
 *
 * The composer and the sent transcript must agree on what renders as a pill:
 *  - COMMAND chips: commands with NO argument stage, only as the FIRST token
 *    (an invocation), committed by a trailing space. Arg-taking commands
 *    (`/goal ship it`) stay text — the tail may be prose.
 *  - SKILL chips: skill names anywhere in the message — later tokens are
 *    references dropped into prose; built-ins mean nothing mid-sentence.
 *  - `/usr/local` is a path, not a `/usr` command (negative lookahead).
 *
 * Chippability is owned by the caller (which commands/skills exist), this
 * module only knows the RULES — same split as desktop-slash-commands.ts
 * feeding `chippableKind` in slash-refs.ts.
 */

/* A command token starts a word and doesn't continue into a path. */
export const SLASH_COMMAND_RE = /(?<=^|\s)\/([a-zA-Z][\w-]*)(?![\w-]*\/)/g;

export type SlashChipKind = "command" | "skill";

export interface SlashChipMatch {
	/** the token with its leading slash, e.g. `/clean` */
	command: string;
	start: number;
	end: number;
	kind: SlashChipKind;
}

export interface ChipScanOptions {
	/** false when inserted mid-word — `foo/clean` is not a command */
	boundaryBefore?: boolean;
	/** true for inert text (paste, restored draft): a trailing token counts committed */
	trailingCommitted?: boolean;
	/** no-arg desktop-surfaced commands only (desktop `chippableKind`) */
	isCommandChippable: (name: string) => boolean;
	/** skill names are chippable in ANY position */
	isSkill: (name: string) => boolean;
}

/** Every `/token` in `text` that should render as a pill, in source order. */
export function slashChipMatches(text: string, options: ChipScanOptions): SlashChipMatch[] {
	const { boundaryBefore = true, trailingCommitted = false } = options;
	if (!text.includes("/")) return [];

	const matches: SlashChipMatch[] = [];
	for (const match of text.matchAll(SLASH_COMMAND_RE)) {
		const start = match.index ?? 0;
		const command = match[0]; // includes the leading slash
		const name = command.slice(1).toLowerCase();
		const end = start + command.length;
		const after = text[end];

		/* a committed pill carries its trailing space — a half-typed token at the
		   end stays editable unless the text is inert (paste/restore) */
		if (after === undefined ? !trailingCommitted : !/\s/.test(after)) continue;

		const invocation = start === 0;
		if (invocation && !boundaryBefore) continue;

		const kind: SlashChipKind | null = options.isCommandChippable(name)
			? "command"
			: options.isSkill(name)
				? "skill"
				: null;

		/* only the FIRST token can be a command invocation; later tokens chip
		   as skills alone (desktop hydration/typing agreement) */
		if (kind && (invocation || kind === "skill")) matches.push({ command, start, end, kind });
	}
	return matches;
}

/* ---------------- DOM helpers for the contenteditable composer ---------------- */

/**
 * Serialize the composer: text nodes as-is, chip spans as their label (the
 * label IS the serialized `/name`, so offsets match 1:1), <br> and block
 * boundaries as newlines.
 */
export function serializeComposer(root: HTMLElement): string {
	let out = "";
	const walk = (node: Node, isRoot = false): void => {
		for (let i = 0; i < node.childNodes.length; i++) {
			const child = node.childNodes[i];
			if (child.nodeType === Node.TEXT_NODE) {
				out += child.textContent ?? "";
			} else if (child instanceof HTMLElement) {
				if (child.tagName === "BR") {
					out += "\n";
					continue;
				}
				const blocky = !isRoot && (child.tagName === "DIV" || child.tagName === "P");
				if (blocky && out && !out.endsWith("\n")) out += "\n";
				walk(child);
				if (blocky && !out.endsWith("\n")) out += "\n";
			}
		}
	};
	walk(root, true);
	return out;
}

/** caret/anchor as a plain-text offset (chips count as their label length) */
export function caretOffsetOf(root: HTMLElement): number | null {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return null;
	for (let i = 0; i < sel.rangeCount; i++) {
		const r = sel.getRangeAt(i);
		if (root.contains(r.startContainer)) return offsetOfPoint(root, r.startContainer, r.startOffset);
	}
	return null;
}

function offsetOfPoint(root: HTMLElement, container: Node, off: number): number {
	let total = 0;
	let found = false;
	const walk = (node: Node): void => {
		if (found) return;
		if (node === container) {
			total += node.nodeType === Node.TEXT_NODE ? off : countText(node, off);
			found = true;
			return;
		}
		if (node.nodeType === Node.TEXT_NODE) {
			total += (node.textContent ?? "").length;
			return;
		}
		if (node instanceof HTMLElement && node.tagName === "BR") {
			total += 1;
			return;
		}
		for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
	};
	walk(root);
	return total;
}

function countText(node: Node, childLimit?: number): number {
	let n = 0;
	const walk = (x: Node): void => {
		if (x.nodeType === Node.TEXT_NODE) {
			n += (x.textContent ?? "").length;
		} else if (x instanceof HTMLElement && x.tagName === "BR") {
			n += 1;
		} else {
			const max = x === node && childLimit !== undefined ? childLimit : x.childNodes.length;
			for (let i = 0; i < max; i++) walk(x.childNodes[i]);
		}
	};
	walk(node);
	return n;
}

/** place the caret at a plain-text offset (maps chips back to DOM positions) */
export function setCaretOffset(root: HTMLElement, target: number): void {
	const sel = window.getSelection();
	if (!sel) return;
	let total = 0;
	let placed: { node: Node; off: number } | null = null;
	const walk = (node: Node): boolean => {
		if (placed) return true;
		if (node.nodeType === Node.TEXT_NODE) {
			const len = (node.textContent ?? "").length;
			if (total + len >= target) {
				placed = { node, off: Math.max(0, target - total) };
				return true;
			}
			total += len;
			return false;
		}
		if (node instanceof HTMLElement && node.tagName === "BR") {
			total += 1;
			return false;
		}
		for (let i = 0; i < node.childNodes.length; i++) {
			if (walk(node.childNodes[i])) return true;
		}
		return false;
	};
	walk(root);
	const range = document.createRange();
	if (placed) {
		const p = placed as { node: Node; off: number };
		range.setStart(p.node, p.off);
	} else {
		range.selectNodeContents(root);
		range.collapse(false);
	}
	range.collapse(true);
	sel.removeAllRanges();
	sel.addRange(range);
}
