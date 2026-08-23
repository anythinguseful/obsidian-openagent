/**
 * Quick Ask — ReplaceGuard (Copilot `src/editor/replaceGuard.ts`,
 * MapPos variant ported with adaptations).
 *
 * Unifies the "capture → map → validate → replace" flow so the panel's
 * Replace action can never stomp on a document that moved under it:
 * every validation re-checks the SAME leaf, SAME CM view, SAME file,
 * range still in bounds, and — the heart of it — the text at the mapped
 * range still byte-identical to what was selected when the panel
 * opened. Any drift → an honest reason + disabled button.
 */

import type { ChangeDesc } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { WorkspaceLeaf } from "obsidian";

export type ReplaceInvalidReason =
	| "no_range"
	| "range_out_of_bounds"
	| "content_changed"
	| "file_changed"
	| "editor_changed"
	| "leaf_changed"
	| "target_unavailable";

export interface ReplaceStatus {
	ok: boolean;
	reason: ReplaceInvalidReason | null;
	range: { from: number; to: number } | null;
	/** user-facing message */
	message?: string;
}

export interface ReplaceGuard {
	getRange(): { from: number; to: number } | null;
	validate(): ReplaceStatus;
	/** mapPos strategy: feed document changes in (from the ViewPlugin) */
	onDocChanged?(changes: ChangeDesc): void;
	replace(replacement: string): ReplaceStatus;
}

/** Copilot vocabulary, verbatim. */
export function getErrorMessage(reason: ReplaceInvalidReason | null): string {
	switch (reason) {
		case "no_range":
			return "No selection range available.";
		case "range_out_of_bounds":
			return "Selection range is out of bounds.";
		case "content_changed":
			return "Selection content has changed. Please reselect and try again.";
		case "file_changed":
			return "File has changed. Please reselect in the original file.";
		case "editor_changed":
			return "Editor has changed. Please reselect and try again.";
		case "leaf_changed":
			return "Editor pane has changed. Please reselect and try again.";
		case "target_unavailable":
			return "Editor is no longer available.";
		default:
			return "Cannot replace. Please reselect and try again.";
	}
}

/** Shared "replace + select inserted content" dispatch (CRLF-honest:
    CM6 normalizes \r\n → \n, so measure with the converted Text). */
function dispatchReplace(editorView: EditorView, range: { from: number; to: number }, replacement: string): void {
	const insertText = editorView.state.toText(replacement);
	editorView.dispatch({
		changes: { from: range.from, to: range.to, insert: insertText },
		selection: { anchor: range.from, head: range.from + insertText.length },
	});
	editorView.focus();
}

export interface MapPosReplaceGuardParams {
	editorView: EditorView;
	leafSnapshot: WorkspaceLeaf;
	filePathSnapshot: string | null;
	/** selected text at open time (from doc.sliceString — CRLF-safe) */
	selectedTextSnapshot: string;
	initialRange: { from: number; to: number };
	/** lightweight; called on every validate */
	getLeafState: () => {
		leaf: WorkspaceLeaf | null;
		editorView: EditorView | null;
		filePath: string | null;
	};
}

export function createMapPosReplaceGuard(params: MapPosReplaceGuardParams): ReplaceGuard {
	const { editorView, leafSnapshot, filePathSnapshot, selectedTextSnapshot, initialRange, getLeafState } =
		params;

	let range = { ...initialRange };

	/* validation cache: leaf state is compared per call, doc edits flip a
	   dirty flag — the panel re-renders the Replace button on docChanged,
	   so validate() runs often and must stay cheap */
	type LeafStateSnapshot = ReturnType<MapPosReplaceGuardParams["getLeafState"]>;
	let isValidationDirty = true;
	let lastLeafStateSnapshot: LeafStateSnapshot | null = null;
	let lastValidationResult: ReplaceStatus | null = null;

	const onDocChanged = (changes: ChangeDesc): void => {
		const mappedFrom = changes.mapPos(range.from, 1);
		const mappedTo = changes.mapPos(range.to, -1);
		range = { from: Math.min(mappedFrom, mappedTo), to: Math.max(mappedFrom, mappedTo) };
		isValidationDirty = true;
	};

	const getRange = (): { from: number; to: number } | null => ({ ...range });

	const validate = (): ReplaceStatus => {
		const state = getLeafState();
		const leafStateChanged =
			!lastLeafStateSnapshot ||
			state.leaf !== lastLeafStateSnapshot.leaf ||
			state.editorView !== lastLeafStateSnapshot.editorView ||
			state.filePath !== lastLeafStateSnapshot.filePath ||
			!editorView.dom.isConnected;

		if (!isValidationDirty && !leafStateChanged && lastValidationResult) {
			return lastValidationResult;
		}
		isValidationDirty = false;
		lastLeafStateSnapshot = state;

		const invalid = (
			reason: ReplaceInvalidReason,
			nextRange: { from: number; to: number } | null
		): ReplaceStatus => ({ ok: false, reason, range: nextRange, message: getErrorMessage(reason) });

		if (!state.leaf || state.leaf !== leafSnapshot) {
			lastValidationResult = invalid("leaf_changed", null);
			return lastValidationResult;
		}
		if (!state.editorView || state.editorView !== editorView) {
			lastValidationResult = invalid("editor_changed", null);
			return lastValidationResult;
		}
		if (state.filePath !== filePathSnapshot) {
			lastValidationResult = invalid("file_changed", null);
			return lastValidationResult;
		}
		if (!editorView.dom.isConnected) {
			lastValidationResult = invalid("target_unavailable", null);
			return lastValidationResult;
		}

		const doc = editorView.state.doc;
		if (range.from < 0 || range.to > doc.length || range.from >= range.to) {
			lastValidationResult = invalid("range_out_of_bounds", null);
			return lastValidationResult;
		}
		const currentText = doc.sliceString(range.from, range.to);
		if (currentText !== selectedTextSnapshot) {
			lastValidationResult = invalid("content_changed", { ...range });
			return lastValidationResult;
		}

		lastValidationResult = { ok: true, reason: null, range: { ...range } };
		return lastValidationResult;
	};

	const replace = (replacement: string): ReplaceStatus => {
		const status = validate();
		if (!status.ok || !status.range) return status;
		try {
			dispatchReplace(editorView, status.range, replacement);
			return { ok: true, reason: null, range: status.range };
		} catch {
			return {
				ok: false,
				reason: "target_unavailable",
				range: null,
				message: getErrorMessage("target_unavailable"),
			};
		}
	};

	return { getRange, validate, onDocChanged, replace };
}
