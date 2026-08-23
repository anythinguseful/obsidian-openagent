/**
 * Composer undo/redo — own snapshot stack (Hermes Desktop parity).
 *
 * Ported from Hermes apps/desktop/src/app/chat/composer/undo-history.ts
 * (same coalesce window, same 200-entry limit, same reset/step semantics):
 * the rich composer re-renders its chips programmatically, which bypasses
 * Chromium's native undo stack — so undo/redo must be owned outright or a
 * paste gets skipped and the wrong edit is reverted. Snapshots are plain
 * text + a caret offset (the editor round-trips losslessly through them).
 */

export interface ComposerSnapshot {
	caret: number;
	text: string;
}

/** Consecutive typing inside this window collapses into one undo entry. */
const COALESCE_WINDOW_MS = 600;
const DEFAULT_LIMIT = 200;

export interface ComposerUndoHistory {
	reset: () => void;
	/** Bank the state that existed *before* an edit; `coalesce` merges typing
	 *  bursts into one step (the entry keeps the start-of-burst state). */
	record: (previous: ComposerSnapshot, options?: { coalesce?: boolean }) => void;
	/** Undo one step; `current` (live state) is banked for a subsequent redo. */
	undo: (current: ComposerSnapshot) => ComposerSnapshot | null;
	/** Redo one step; `current` is banked back for a subsequent undo. */
	redo: (current: ComposerSnapshot) => ComposerSnapshot | null;
}

export function createComposerUndoHistory(
	limit: number = DEFAULT_LIMIT,
	now: () => number = () => Date.now()
): ComposerUndoHistory {
	let past: ComposerSnapshot[] = [];
	let future: ComposerSnapshot[] = [];
	let lastRecordedAt = 0;
	let lastWasCoalescable = false;

	const record: ComposerUndoHistory["record"] = (previous, options) => {
		const coalesce = options?.coalesce ?? false;
		const at = now();
		const merges = coalesce && lastWasCoalescable && past.length > 0 && at - lastRecordedAt < COALESCE_WINDOW_MS;
		lastRecordedAt = at;
		lastWasCoalescable = coalesce;
		// A fresh edit invalidates anything the user had redone past.
		future = [];
		// Merging keeps the OLDER snapshot (start of the burst) — what undo
		// should step back to.
		if (merges) return;
		// A no-op edit would make undo look broken for one press.
		if (past[past.length - 1]?.text === previous.text) return;
		past.push(previous);
		if (past.length > limit) past = past.slice(past.length - limit);
	};

	const step = (from: ComposerSnapshot[], to: ComposerSnapshot[], current: ComposerSnapshot): ComposerSnapshot | null => {
		const next = from.pop();
		if (!next) return null;
		to.push(current);
		// Any traversal ends the typing burst, so the next keystroke opens a
		// new entry.
		lastWasCoalescable = false;
		return next;
	};

	return {
		record,
		redo: (current) => step(future, past, current),
		reset: () => {
			past = [];
			future = [];
			lastRecordedAt = 0;
			lastWasCoalescable = false;
		},
		undo: (current) => step(past, future, current),
	};
}

/** ⌘Z / Ctrl+Z, without Shift. */
export function isUndoShortcut(event: { altKey?: boolean; ctrlKey?: boolean; key?: string; metaKey?: boolean; shiftKey?: boolean }): boolean {
	return (event.metaKey || event.ctrlKey) === true && event.altKey !== true && event.shiftKey !== true && String(event.key).toLowerCase() === "z";
}

/** ⌘⇧Z everywhere, plus Ctrl+Y on Windows/Linux. */
export function isRedoShortcut(event: { altKey?: boolean; ctrlKey?: boolean; key?: string; metaKey?: boolean; shiftKey?: boolean }): boolean {
	if (event.altKey === true) return false;
	const key = String(event.key).toLowerCase();
	if ((event.metaKey || event.ctrlKey) === true && event.shiftKey === true && key === "z") return true;
	return event.ctrlKey === true && event.metaKey !== true && event.shiftKey !== true && key === "y";
}
