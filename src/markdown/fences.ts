/**
 * Structural Markdown fence walker shared by rendering, Mermaid
 * canonicalisation, write previews and clipping. It deliberately performs
 * no Markdown rendering; offsets always refer to the original byte string.
 */

export interface MarkdownFence {
	start: number;
	end: number;
	openerEnd: number;
	bodyStart: number;
	bodyEnd: number;
	closerStart: number | null;
	closerEnd: number | null;
	delimiter: "`" | "~";
	delimiterLength: number;
	indent: string;
	info: string;
	language: string;
	closed: boolean;
	/** A same-or-longer opener appeared before the closer (retry merge/reopen). */
	malformed: boolean;
}

interface LineSpan {
	start: number;
	contentEnd: number;
	end: number;
	content: string;
}

function linesOf(text: string): LineSpan[] {
	const out: LineSpan[] = [];
	let start = 0;
	while (start < text.length) {
		let contentEnd = start;
		while (contentEnd < text.length && text[contentEnd] !== "\n" && text[contentEnd] !== "\r") contentEnd++;
		let end = contentEnd;
		if (text[end] === "\r" && text[end + 1] === "\n") end += 2;
		else if (text[end] === "\r" || text[end] === "\n") end += 1;
		out.push({ start, contentEnd, end, content: text.slice(start, contentEnd) });
		start = end;
	}
	return out;
}

interface Opener {
	indent: string;
	run: string;
	info: string;
	language: string;
}

function parseOpener(line: string): Opener | null {
	const match = line.match(/^([ \t]*)(`{3,}|~{3,})(.*)$/);
	if (!match) return null;
	const [, indent, run, tail] = match;
	/* CommonMark: a backtick info string cannot itself contain a backtick. */
	if (run[0] === "`" && tail.includes("`")) return null;
	const info = tail.trim();
	const language = info.split(/[ \t]+/, 1)[0]?.toLowerCase() ?? "";
	return { indent, run, info, language };
}

function isCloser(line: string, char: string, minimum: number): boolean {
	const match = line.match(/^([ \t]*)(`{3,}|~{3,})[ \t]*$/);
	return Boolean(match && match[2][0] === char && match[2].length >= minimum);
}

/** Walk top-level fenced blocks without normalising delimiters or line endings. */
export function walkMarkdownFences(text: string): MarkdownFence[] {
	const lines = linesOf(text);
	const out: MarkdownFence[] = [];
	for (let i = 0; i < lines.length; i++) {
		const opener = parseOpener(lines[i].content);
		if (!opener) continue;
		const char = opener.run[0] as "`" | "~";
		const minimum = opener.run.length;
		let closeIndex = -1;
		let malformed = false;
		for (let j = i + 1; j < lines.length; j++) {
			if (isCloser(lines[j].content, char, minimum)) {
				closeIndex = j;
				break;
			}
			const nested = parseOpener(lines[j].content);
			if (nested && nested.run[0] === char && nested.run.length >= minimum) {
				/* A shorter run is ordinary code content. A same/longer run carrying
				   info is a premature reopen or a merged close+open retry boundary. */
				if (nested.info.length > 0) malformed = true;
			}
		}
		const closed = closeIndex >= 0;
		const closer = closed ? lines[closeIndex] : null;
		out.push({
			start: lines[i].start,
			end: closer ? closer.end : text.length,
			openerEnd: lines[i].end,
			bodyStart: lines[i].end,
			bodyEnd: closer ? closer.start : text.length,
			closerStart: closer ? closer.start : null,
			closerEnd: closer ? closer.end : null,
			delimiter: char,
			delimiterLength: minimum,
			indent: opener.indent,
			info: opener.info,
			language: opener.language,
			closed,
			malformed,
		});
		/* A valid top-level fence owns every apparent fence line in its body. */
		if (closed) i = closeIndex;
		else break;
	}
	return out;
}

export function preferredLineEnding(text: string): "\r\n" | "\n" | "\r" {
	const match = text.match(/\r\n|\n|\r/);
	return (match?.[0] as "\r\n" | "\n" | "\r" | undefined) ?? "\n";
}

/** Replace only the language token in an opener, preserving whitespace/info. */
export function replaceFenceLanguage(opener: string, language: string): string {
	return opener.replace(
		/^([ \t]*)(`{3,}|~{3,})([ \t]*)([^ \t\r\n]*)/,
		(_all, indent: string, run: string, gap: string) => `${indent}${run}${gap}${language}`
	);
}

/**
 * Clip Markdown without ever slicing through a fenced block. If the limit
 * lands inside a fence, the whole fence is omitted from the clipped view.
 */
export function clipMarkdownFenceSafe(text: string, maxChars: number, marker = "…"): string {
	if (maxChars < 0 || text.length <= maxChars) return text;
	if (maxChars === 0) return "";
	/* The marker is part of—not additional to—the caller's hard cap. */
	const suffix = marker.slice(0, maxChars);
	let cut = maxChars - suffix.length;
	for (const fence of walkMarkdownFences(text)) {
		if (cut > fence.start && cut < fence.end) {
			cut = fence.start;
			break;
		}
	}
	return text.slice(0, cut).trimEnd() + suffix;
}
