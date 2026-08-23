/**
 * Quick Ask — selection anchors (Copilot `src/utils/selectionAnchors.ts`
 * + `src/utils/quickAskAnchorMapping.ts`, ported with adaptations).
 *
 * Dual-anchor maths for placing the floating panel relative to the
 * selection, and for keeping those anchors glued to the right text as
 * the document changes under the panel.
 *
 * Line-start trap (from Copilot, verbatim rationale): when a selection
 * includes a trailing newline, `selection.to` lands on the NEXT line's
 * start — `coordsAtPos(to)` would then anchor the panel one line too
 * low. Backing up one character fixes it. The same trap applies to
 * `focusPos` when it equals `selection.to` (reverse selections).
 */

export interface SelectionAnchors {
	/** normalized selection.to — visual bottom of the selection */
	bottomPos: number;
	/** selection.from — visual top of the selection */
	topPos: number;
	/** selection.head — the user's focus end (horizontal anchor) */
	focusPos: number;
}

export function computeSelectionAnchors(
	selection: { from: number; to: number; head: number; empty: boolean },
	doc: { lineAt(pos: number): { from: number } }
): SelectionAnchors {
	const topPos = selection.from;
	let bottomPos = selection.to;
	let focusPos = selection.head;

	if (!selection.empty && bottomPos > 0 && doc.lineAt(bottomPos).from === bottomPos) {
		bottomPos = bottomPos - 1;
	}
	if (!selection.empty && focusPos > 0 && focusPos === selection.to) {
		if (doc.lineAt(focusPos).from === focusPos) focusPos = focusPos - 1;
	}

	return { bottomPos, topPos, focusPos };
}

export interface QuickAskAnchorPositions {
	bottomAnchorPos: number | null;
	topAnchorPos: number | null;
	focusAnchorPos: number | null;
}

interface ChangeMapper {
	mapPos(pos: number, assoc?: number): number;
}

/**
 * Map anchors across document changes (Copilot semantics):
 * - topAnchorPos (selection.from) uses assoc=1 — insertions before it push it right.
 * - bottomAnchorPos (selection.to) uses assoc=-1 — insertions after it don't move it.
 * - focusAnchorPos follows whichever edge holds the user's head.
 * - Cursor selections (all equal) map once so anchors never diverge.
 */
export function mapQuickAskAnchorPositions(
	anchors: QuickAskAnchorPositions,
	changes: ChangeMapper
): QuickAskAnchorPositions {
	const { bottomAnchorPos, topAnchorPos, focusAnchorPos } = anchors;

	if (bottomAnchorPos !== null && bottomAnchorPos === topAnchorPos) {
		const mapped = changes.mapPos(bottomAnchorPos, 1);
		return { bottomAnchorPos: mapped, topAnchorPos: mapped, focusAnchorPos: mapped };
	}

	const focusAssoc = focusAnchorPos === topAnchorPos ? 1 : -1;
	return {
		bottomAnchorPos: bottomAnchorPos !== null ? changes.mapPos(bottomAnchorPos, -1) : null,
		topAnchorPos: topAnchorPos !== null ? changes.mapPos(topAnchorPos, 1) : null,
		focusAnchorPos: focusAnchorPos !== null ? changes.mapPos(focusAnchorPos, focusAssoc) : null,
	};
}
