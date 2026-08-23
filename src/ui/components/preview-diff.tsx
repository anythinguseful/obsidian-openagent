/**
 * Preview diff card (v0.1.58, Copilot ApplyView parity — verified raw).
 * Their preview lives in a separate workspace leaf with per-hunk
 * accept/reject; OUR documented divergences (same honesty rule as the
 * changed-files card):
 *  - inline inside the existing approval overlay — chat-native, and the
 *    actual write still happens through the TOOL itself on Allow (single
 *    write path; the preview computes, it never persists).
 *  - file-level Accept/Deny (no per-hunk granularity), plus an mtime stale
 *    guard their ApplyView does not have.
 * Chrome: oa- classes + Obsidian CSS vars, mono rows, +/− counts in the head.
 */

import { ReactElement } from "react";
import { buildPreviewRows } from "./preview-diff-core";
import { FileTextIcon } from "../icons";

export function PreviewDiff({
	path,
	mode,
	original,
	proposed,
	stale,
}: {
	path: string;
	mode: "create" | "overwrite" | "append" | "edit";
	original: string | null;
	proposed: string;
	stale?: boolean;
}): ReactElement {
	const { rows, hiddenChanged, addedCount, removedCount } = buildPreviewRows(original ?? "", proposed);
	return (
		<div className="oa-preview">
			<div className="oa-preview-head">
				<FileTextIcon size={13} />
				<code className="oa-preview-path">{path}</code>
				<span className={`oa-preview-op oa-preview-op-${mode}`}>{mode}</span>
				<span className="oa-preview-counts" aria-label={`${addedCount} lines added, ${removedCount} removed`}>
					{/* LobeHub order: −removed (red) before +added (green) */}
					<span className="oa-preview-count-del">−{removedCount}</span>
					<span className="oa-preview-count-add">+{addedCount}</span>
				</span>
			</div>
			{stale ? (
				<div className="oa-preview-stale" role="alert">
					This note changed on disk since the preview was built — Recheck re-reads it before you accept.
				</div>
			) : null}
			<div className="oa-preview-rows" aria-label="Proposed changes">
			{rows.map((r, i) => (
				<div key={i} className={`oa-preview-row oa-preview-${r.type}`}>
					{/* SATU kolom gutter (v0.1.106 — pixel-verified dari screenshot
					    resmi CodeDiff LobeHub yang dikirim owner; dual old/new
					    v0.1.105 ternyata bukan look resminya): removed = nomor
					    lama, added/context = nomor baru. */}
					<span className="oa-preview-gutter" aria-hidden="true">{r.lineNo ?? ""}</span>
					<span className="oa-preview-line">
						{r.words
							? r.words.map((w, j) => (
								<span key={j} className={w.added ? "oa-preview-w-add" : w.removed ? "oa-preview-w-del" : undefined}>
									{w.value}
								</span>
							))
						: r.text || " "}
					</span>
				</div>
			))}
			{hiddenChanged > 0 ? (
				<div className="oa-preview-row oa-preview-context">
					<span className="oa-preview-gutter" aria-hidden="true" />
					<span className="oa-preview-line oa-preview-more">
						… {hiddenChanged} more changed line{hiddenChanged === 1 ? "" : "s"} — applied in full on Allow
					</span>
				</div>
			) : null}
			</div>
		</div>
	);
}
