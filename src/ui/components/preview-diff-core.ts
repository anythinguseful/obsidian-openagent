/**
 * Preview diff row builder (v0.1.58) — PURE, unit-testable. Recipe ported
 * from Copilot's ApplyView/composerUtils (verified raw 2026-08-02): a
 * line-level pass for the row list, then word-level highlighting inside
 * removed+added pairs. We use the same `diff` package (jsdiff) they do.
 */

import { diffLines, diffWordsWithSpace } from "diff";

export type WordPart = { value: string; added?: boolean; removed?: boolean };
export type PreviewRow = {
	type: "added" | "removed" | "context";
	text: string;
	/** inline word highlight (changed pairs only) */
	words?: WordPart[];
	/** 2026-08-07 (v0.1.106, pixel-verified dari SCREENSHOT RESMI CodeDiff
	    LobeHub yang dikirim owner — bacaan docs v0.1.105 yang menebak gutter
	    GANDA ternyata salah): SATU kolom nomor saja. Baris removed memakai
	    nomor file LAMA, baris added/context memakai nomor file BARU;
	    pewarnaan tinta gutter (rose/olive) ada di CSS. */
	lineNo?: number;
};

/** Changed-row cap keeps huge rewrites scrollable; the marker row states the
    remainder is still applied in full on Accept (honest footer, no loss). */
export const PREVIEW_ROW_CAP = 120;

export function buildPreviewRows(
	original: string,
	proposed: string,
	cap: number = PREVIEW_ROW_CAP
): { rows: PreviewRow[]; hiddenChanged: number; addedCount: number; removedCount: number } {
	const parts = diffLines(original, proposed);
	const stripTailNewline = (s: string) => s.replace(/\n$/, "");
	const rows: PreviewRow[] = [];
	let addedCount = 0;
	let removedCount = 0;

	let oldNo = 1;
	let newNo = 1;
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		const lines = stripTailNewline(p.value).split("\n");
		if (!p.added && !p.removed) {
			for (const t of lines) { rows.push({ type: "context", text: t, lineNo: newNo }); oldNo++; newNo++; }
			continue;
		}
		if (p.removed) {
			removedCount += lines.length;
			const next = parts[i + 1];
			if (next?.added) {
				/* Copilot's recipe: a removed block immediately followed by its
				   added counterpart gets word-level pairing, line by line */
				const addedLines = stripTailNewline(next.value).split("\n");
				addedCount += addedLines.length;
				const pairCount = Math.max(lines.length, addedLines.length);
				for (let k = 0; k < pairCount; k++) {
					const r = lines[k];
					const a = addedLines[k];
					if (r !== undefined && a !== undefined) {
						const words = diffWordsWithSpace(r, a);
						rows.push({ type: "removed", text: r, words: words.filter((w) => !w.added), lineNo: oldNo++ });
						rows.push({ type: "added", text: a, words: words.filter((w) => !w.removed), lineNo: newNo++ });
					} else if (r !== undefined) {
						rows.push({ type: "removed", text: r, lineNo: oldNo++ });
					} else {
						rows.push({ type: "added", text: a, lineNo: newNo++ });
					}
				}
				i++; // the added block was consumed by the pair
				continue;
			}
			for (const t of lines) rows.push({ type: "removed", text: t, lineNo: oldNo++ });
			continue;
		}
		addedCount += lines.length;
		for (const t of lines) rows.push({ type: "added", text: t, lineNo: newNo++ });
	}

	let hiddenChanged = 0;
	let changedShown = 0;
	const capped: PreviewRow[] = [];
	for (const r of rows) {
		if (r.type === "context") {
			capped.push(r);
			continue;
		}
		if (changedShown >= cap) {
			hiddenChanged++;
			continue;
		}
		changedShown++;
		capped.push(r);
	}
	return { rows: capped, hiddenChanged, addedCount, removedCount };
}
