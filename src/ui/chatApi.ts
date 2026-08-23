/**
 * Editor → chat bridge (candidate ③ from the Copilot study notes,
 * shipped in v0.1.75).
 *
 * The Obsidian-side glue — the editor context menu, selection payload
 * assembly, chat reveal — lives in src/editorMenu.ts + main.ts. The meat
 * lives inside ChatApp, which registers an implementation on this sink.
 * That split keeps everything below the menu line sim-testable: the
 * real-preview harness passes its own sink and drives the api directly.
 *
 * The sink ALSO stashes calls made while React is still mounting (cold
 * reveal: right-click → activateView → React mounts a tick later) and
 * ChatApp drains them right after registering — the explicit
 * editor→ChatView channel the study notes demanded (no sneaky global
 * event bus).
 */

export interface SelectionPayload {
	/** vault path of the source note ("" when truly unknown) */
	path: string;
	/** note basename for chip labels */
	basename: string;
	/** 1-based inclusive line range of the selection */
	fromLine: number;
	toLine: number;
	/** the selected text itself */
	text: string;
	/** Workspace policy that authorized this editor read. Older harness payloads
	    may omit it, but Strict mode rejects missing provenance. */
	workspaceScope?: string;
}

export interface ChatApi {
	/** Attach the selection as an honest chip (path + line range in the label). */
	attachSelection: (p: SelectionPayload) => void;
	/** Prefill the composer with a "> quoted" block, caret below it (Ask flow). */
	quoteSelectionForAsk: (p: SelectionPayload) => void;
	/** Attach the chip AND arm a skill one-shot by exact skill name. */
	runSkillOnSelection: (skillName: string, p: SelectionPayload) => void;
	/** Custom snippet action (v0.1.76): the snippet text + the quoted
	    selection prefill the composer (text first, quote below), caret at
	    the end so Enter sends immediately. */
	runSnippetOnSelection: (lead: string, p: SelectionPayload) => void;
}

export interface ChatApiSink {
	current: ChatApi | null;
	/** calls made before React finished mounting; drained on register */
	pending: Array<(api: ChatApi) => void>;
}

export function newChatApiSink(): ChatApiSink {
	return { current: null, pending: [] };
}

/** Dispatch through the sink — immediate when the api is live, stashed otherwise. */
export function dispatchToChatApi(sink: ChatApiSink, fn: (api: ChatApi) => void): void {
	if (sink.current) fn(sink.current);
	else sink.pending.push(fn);
}
