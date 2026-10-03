/**
 * Tool waterfall (DeepSeek seam, Phase 2).
 *
 * AgentLoop.executeTool is the default driver: parse → prepare → preExecute
 * (approval) → execute → postExecute (steer-escape, redact, clip). Listeners
 * may halt before execute; they must not fork a second execute path.
 */

import { ChatMessage } from "../types";

export type ToolWaterfallHalt = { halt: true; message: ChatMessage };
export type ToolWaterfallProceed = { halt: false };

export async function runPreExecute(
	listeners: Array<() => Promise<ToolWaterfallHalt | ToolWaterfallProceed | void>>
): Promise<ChatMessage | null> {
	for (const listen of listeners) {
		const out = await listen();
		if (out && out.halt) return out.message;
	}
	return null;
}

export async function runPostExecute<T>(value: T, listeners: Array<(v: T) => T | Promise<T>>): Promise<T> {
	let cur = value;
	for (const listen of listeners) cur = await listen(cur);
	return cur;
}

export function toolErrorMessage(callId: string, name: string, content: string): ChatMessage {
	return { role: "tool", tool_call_id: callId, name, content };
}
