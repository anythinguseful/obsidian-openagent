/**
 * Structural fenced-code splitter for MarkdownDoc.
 *
 * Rendering and persistence now share the same walker, so malformed,
 * unclosed, tilde and 4+ character fences cannot be interpreted differently
 * by separate regexes.
 */

import { walkMarkdownFences } from "../markdown/fences";

export type MarkdownSegment =
	| { kind: "md"; content: string }
	| {
			kind: "code";
			lang?: string;
			content: string;
			closed: boolean;
			malformed: boolean;
			delimiter: "`" | "~";
			delimiterLength: number;
	  };

function stripBodyClosingEol(body: string): string {
	if (body.endsWith("\r\n")) return body.slice(0, -2);
	if (body.endsWith("\n") || body.endsWith("\r")) return body.slice(0, -1);
	return body;
}

export function splitMarkdownSegments(text: string): MarkdownSegment[] {
	const out: MarkdownSegment[] = [];
	let cursor = 0;
	for (const fence of walkMarkdownFences(text)) {
		if (fence.start > cursor) out.push({ kind: "md", content: text.slice(cursor, fence.start) });
		const body = stripBodyClosingEol(text.slice(fence.bodyStart, fence.bodyEnd));
		/* Keep the historical dangling-bare-fence behaviour: it contributes no
		   empty code card at EOF. */
		if (fence.closed || fence.info.length > 0 || body.length > 0) {
			out.push({
				kind: "code",
				...(fence.language ? { lang: fence.language } : {}),
				content: body,
				closed: fence.closed,
				malformed: fence.malformed,
				delimiter: fence.delimiter,
				delimiterLength: fence.delimiterLength,
			});
		}
		cursor = fence.end;
	}
	if (cursor < text.length) out.push({ kind: "md", content: text.slice(cursor) });
	if (out.length === 0 && text.length > 0) out.push({ kind: "md", content: text });
	return out;
}
