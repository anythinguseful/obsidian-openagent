/** Shared message / agent types (OpenAI-compatible wire shape). */

export interface ToolCallFunction {
	name: string;
	arguments: string; // JSON string (OpenAI wire format)
}

export interface ToolCall {
	id: string;
	type: "function";
	function: ToolCallFunction;
}

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
	role: Role;
	/** plain text for almost everything; content parts for vision user messages */
	content: string | ContentPart[] | null;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
	name?: string;
}

/** OpenAI-compatible multimodal content part (vision user messages). */
export type ContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

export interface TokenUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

/** One part of a rendered conversation turn, in display order. */
export type TurnPart =
	| { kind: "text"; text: string }
	| { kind: "reasoning"; text: string; durationMs?: number }
	| {
			kind: "tool";
			toolCallId: string;
			toolName: string;
			args: string;
			/** pending = tool-call is still streaming in (args may be partial);
			    stripped before persisting if it never reached execution. */
			status: "pending" | "running" | "done" | "error" | "denied";
			result?: string;
	  }
	| {
			kind: "clarify";
			clarifyId: string;
			question: string;
			choices: string[] | null;
			multiSelect: boolean;
			status: "pending" | "answered" | "skipped" | "interrupted";
			answer?: string | string[];
	  }
	/** Quiet one-line system marker (e.g. model failover notice). */
	| { kind: "marker"; text: string };

export interface ConversationTurn {
	id: string;
	role: "user" | "assistant" | "system";
	parts: TurnPart[];
	timestamp: number;
	model?: string;
	usage?: TokenUsage;
	/** display-only metadata: files/notes/images sent WITH this user message.
	    The content itself was inlined into the prompt at send time; these chips
	    exist so history shows exactly what context the model received
	    (owner ask 2026-07-22). */
	attachments?: { name: string; size: number; kind?: "text" | "image"; path?: string }[];
	/** Hermes tapback parity (v0.1.42): the user's emoji reaction on this turn.
	    Hermes carries a MessageReaction list ({author:'user'|'agent', emoji}[]);
	    we collapse to the single user tapback (one per user, re-tap retracts).
	    Absent/undefined = none. */
	/* v0.1.48 icon-era feedback — "up" | "down"; v0.1.42 emoji values may
	   persist in old sessions and are folded at render (feedbackOf) */
	reaction?: string;
	/* v0.1.49 prompt-kit banner: Close dismisses the "Was this helpful?"
	   bar permanently for this turn (choice persists like the rating) */
	feedbackDismissed?: boolean;
	/* v0.1.57 prompt-kit SystemMessage port: local notices (slash outputs,
	   compaction notes, steer/goal/queue meta) are system turns, not fake
	   assistant replies — they never reach the wire (history is messagesRef)
	   and render as quiet banners, severity riding explicitly. */
	notice?: "action" | "warning" | "error";
	/* the CTA persists as DATA so it survives session reload; the click
	   handler (open the saved note) is re-attached at render */
	noticeCta?: { label: string; openPath: string };
}
