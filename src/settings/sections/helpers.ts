/**
 * Presentation helpers shared by settings renderers.
 *
 * Moved verbatim out of `src/settingsTab.ts` (module scope, L4548-4596) in
 * Phase 2 of the section-renderer extraction. They live here rather than in
 * one section module because BOTH moved and retained renderers call them:
 * `stackedTextArea` is used by `mcp` and `advanced` (moving) and by `cronForm`
 * (staying — it owns class state). Duplicating them would let the copies
 * drift; a shared module cannot.
 *
 * The other two module-level helpers in settingsTab.ts stay there on purpose:
 * `baseUrlDesc` is called only by `providers` and `stackedControl` only by
 * `model` / `moaSection` / `auxModelRow`, all retained. Verified with an AST
 * caller survey, not grep.
 *
 * These are pure DOM/format helpers holding no plugin state, so they take no
 * SectionContext.
 */

import type { Setting } from "obsidian";
import { markdownTextareaKeydown } from "../../ui/markdown-keys";

/** `2026-07-20-09-00` — export filename stamp (UTC, per-minute resolution). */
export function exportStamp(): string {
	return new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "-");
}

/**
 * Clipboard with a legacy fallback (older webviews).
 *
 * Re-exported from ../../ui/clipboard so settings keeps its existing import
 * surface while the fallback itself lives in one place (sweep finding T1).
 */
export { copyText } from "../../ui/clipboard";

/**
 * Long-text field stacked INSIDE its setting-item (info above, textarea
 * taking the full row width below — one coherent card). The single
 * sanctioned way to render multi-line text in settings; control-column
 * textareas (addTextArea) are banned (smoke guard enforces).
 */
export function stackedTextArea(
	setting: Setting,
	opts: { rows: number; value: string; placeholder?: string; ariaLabel: string },
	onChange: (v: string) => void | Promise<void>
): HTMLTextAreaElement {
	setting.settingEl.addClass("oa-has-stacked");
	const ta = setting.settingEl.createEl("textarea", {
		attr: {
			rows: String(opts.rows),
			"aria-label": opts.ariaLabel,
			...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
		},
	});
	ta.value = opts.value;
	ta.addEventListener("change", () => void onChange(ta.value));
	/* v0.1.116: rasa editor markdown di SEMUA stackedTextArea — Tab/Shift+Tab
	   indentasi multi-baris, Enter melanjutkan list/checkbox/nomor/quote
	   (item kosong = keluar), auto-tutup pasangan + bungkus seleksi,
	   skip-over, Backspace pasangan kosong (paket lengkap, pilihan owner). */
	ta.addEventListener("keydown", (e) => {
		markdownTextareaKeydown(e, ta, { newlineOnShiftEnter: false });
	});
	return ta;
}
