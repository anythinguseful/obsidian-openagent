/**
 * Write preview planner (v0.1.58, Copilot ApplyView parity — verified raw
 * 2026-08-02: their writeFile/editFile PROPOSE changes, the user reviews a
 * diff, then accepts/rejects). PURE string math shared by the approval
 * preview AND the tools themselves — one source of truth for "what would
 * this call produce", so the preview can never drift from the actual write.
 * No obsidian imports (unit-testable in plain node).
 */

import { canonicalizeAssistantOutput } from "../markdown/canonical-output";

export type WritePreview = {
	/** resolved vault path (workspaceFolder + .md already applied by the caller) */
	path: string;
	mode: "create" | "overwrite" | "append" | "edit";
	/** null = the note does not exist on disk right now (create / first overwrite / append-into-new) */
	original: string | null;
	/** the full intended content if the user accepts */
	proposed: string;
};

export type PlanResult = { ok: true; preview: WritePreview } | { ok: false; error: string };

/** write_note mirror — same branch order and fallbacks as the tool:
    unknown modes land in append, exactly like execute() does today. */
export function planWrite(
	args: { path?: unknown; content?: unknown; mode?: unknown },
	resolvedPath: string,
	original: string | null
): PlanResult {
	const mode = String(args.mode ?? "");
	const content = canonicalizeAssistantOutput(String(args.content ?? ""));
	if (mode === "create") {
		if (original !== null) {
			/* byte-identical with the tool's create-collision error */
			return { ok: false, error: `Note already exists: ${resolvedPath}. Use mode=overwrite or mode=append.` };
		}
		return { ok: true, preview: { path: resolvedPath, mode, original: null, proposed: content } };
	}
	if (mode === "overwrite") {
		return { ok: true, preview: { path: resolvedPath, mode, original, proposed: content } };
	}
	/* append (and every unknown mode, mirroring execute): existing notes gain
	   "\n" + content; a missing note is created with content as-is */
	return {
		ok: true,
		preview: { path: resolvedPath, mode: "append", original, proposed: original === null ? content : original + "\n" + content },
	};
}

const FRAGMENT_MISSING = Symbol("fragment-missing");

/** edit_note's exact operation, lifted pure so execute() AND the preview run
    the same replace — first occurrence only, no regex. */
export function applyEditToContent(content: string, oldText: string, newText: string): string | typeof FRAGMENT_MISSING {
	if (!content.includes(oldText)) return FRAGMENT_MISSING;
	return content.replace(oldText, newText);
}

export function planEdit(
	args: { path?: unknown; old_text?: unknown; new_text?: unknown },
	resolvedPath: string,
	original: string | null
): PlanResult {
	if (original === null) return { ok: false, error: `File not found: ${resolvedPath}` };
	const oldText = String(args.old_text ?? "");
	const applied = applyEditToContent(original, oldText, String(args.new_text ?? ""));
	if (applied === FRAGMENT_MISSING) {
		/* byte-identical with the tool's error so tests pin one string */
		return { ok: false, error: `Fragment not found in ${resolvedPath}.` };
	}
	return {
		ok: true,
		preview: {
			path: resolvedPath,
			mode: "edit",
			original,
			proposed: canonicalizeAssistantOutput(applied),
		},
	};
}
