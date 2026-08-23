/**
 * Context manager — conversation compression + auxiliary-model task resolution
 * (Hermes Desktop parity, owner 2026-07-31; breakdown: docs/studies/model-settings-parity-2026-07-30.md).
 *
 * Honesty contract:
 *   - compression rewrites ONLY what the provider sees (the wire); the stored
 *     conversation history stays whole
 *   - the rolling summary is cached per session and extended incrementally —
 *     long chats are not re-summarized from scratch every run
 *   - token counts are the documented chars/4 heuristic; the threshold knob
 *     absorbs the uncertainty (fail direction: compress slightly early)
 *   - summarization failure NEVER blocks the run (Notice + uncompressed)
 *
 * obsidian-free: unit-tested by test/contextManager.test.cjs.
 */

import type { ChatMessage } from "../types";
import type { ProviderConfig } from "../settings";

/* ── token estimation (heuristic) ── */

/** Approximate tokens of a message list (chars/4 over role + content). */
export function estimateTokens(messages: Pick<ChatMessage, "role" | "content">[]): number {
	let chars = 0;
	for (const m of messages) chars += (m.role?.length ?? 0) + (typeof m.content === "string" ? m.content.length : 0);
	return Math.ceil(chars / 4);
}

/* v0.1.174: Hermes parity — CONTEXT_PROBE_TIERS[0] is the default fallback
   when no detection method succeeds (256K covers GPT-5.x and current large-
   context models). The old 32K guess rang false "over budget" alarms. */
export const DEFAULT_CONTEXT_WINDOW = 256000;

/** Window precedence: explicit setting > provider-advertised metadata > default. */
export function resolveContextWindow(modelContextLength: number, advertised: number | null | undefined): number {
	if (modelContextLength > 0) return modelContextLength;
	if (advertised && advertised > 0) return advertised;
	return DEFAULT_CONTEXT_WINDOW;
}

/** Trigger: estimated wire size reached the threshold share of the window. */
export function shouldCompress(tokens: number, window: number, threshold: number): boolean {
	return window > 0 && tokens >= window * threshold;
}

/* ── compression cache (rolling summary) ── */

/** Wire note: the summary rides as a system message right after the main prompt. */
export const COMPRESSION_NOTE_PREFIX = "[Earlier conversation, compacted into a summary — not a live message]";

export interface CompressionCache {
	/** rolling summary of the first `upto` conversation messages */
	summary: string;
	/** count of LEADING conversation messages folded into `summary` (system excluded) */
	upto: number;
	/** "providerId/model" that produced the summary */
	model: string;
	at: number;
}

/** Stale-cache guard: histories cut by /retry, /new or deletion invalidate silently. */
export function validCompressionCache(historyLength: number, cache: CompressionCache | null | undefined): CompressionCache | null {
	if (!cache || !cache.summary.trim() || cache.upto <= 0) return null;
	return historyLength >= cache.upto ? cache : null;
}

/** Apply a valid cache: summary note + the uncompressed tail. */
export function applyCompressionCache(history: ChatMessage[], cache: CompressionCache | null | undefined): ChatMessage[] {
	const cur = validCompressionCache(history.length, cache);
	if (!cur) return history;
	return [{ role: "system", content: `${COMPRESSION_NOTE_PREFIX}\n${cur.summary}` }, ...history.slice(cur.upto)];
}

/**
 * Start index of the PROTECTED tail: keep the last N messages, snapped DOWN to
 * a user-message start so an assistant↔tool exchange never splits (the region
 * before the boundary always ends on a complete exchange). 0 = nothing safe
 * to compress.
 */
export function pickProtectedStart(messages: ChatMessage[], protectLastN: number): number {
	const n = Math.max(0, protectLastN | 0);
	if (messages.length === 0) return 0;
	let start = Math.max(0, messages.length - n);
	while (start > 0 && messages[start].role !== "user") start--;
	return start;
}

/** v0.1.175 (Hermes target_ratio): the start index that leaves a verbatim
 *  recent tail of AT LEAST `keepTokens` estimated tokens, snapped DOWN to a
 *  user-message start (same exchange-boundary rule as pickProtectedStart).
 *  Returns 0 (keep everything) when the whole history fits the budget. */
export function pickTokenTailStart(messages: ChatMessage[], keepTokens: number): number {
	const budget = Math.max(0, Math.floor(keepTokens));
	if (messages.length === 0 || budget <= 0) return messages.length;
	let acc = 0;
	let start = messages.length;
	for (let i = messages.length - 1; i >= 0; i--) {
		acc += estimateTokens([messages[i]]);
		start = i;
		if (acc >= budget) break;
	}
	if (start === 0) return 0;
	while (start > 0 && messages[start].role !== "user") start--;
	return start;
}

/** Summarizer instruction — rolling when a prior summary exists. */
export function buildSummaryPrompt(region: ChatMessage[], priorSummary: string | null | undefined): string {
	const convo = region.map((m) => `${m.role.toUpperCase()}: ${typeof m.content === "string" ? m.content : ""}`).join("\n\n");
	const merge = priorSummary?.trim()
		? `Existing summary of earlier messages:\n${priorSummary.trim()}\n\nFold the conversation below into that summary — rewrite it as ONE coherent, up-to-date summary.`
		: "Summarize the conversation below.";
	return [
		merge,
		"Keep: the user's goals, decisions made, facts learned, tool outcomes that matter, open tasks. Drop: chit-chat, filler, dead ends.",
		"Compact neutral prose, max ~250 words. Output ONLY the summary, no preamble.",
		"",
		convo,
	].join("\n");
}

/* ── auxiliary-model slots (Hermes: vision, compression, title_generation, …) ── */

export interface AuxModelRef {
	providerId: string;
	model: string;
}

export type AuxSlotKey = "compression" | "titleGeneration" | "goalJudge" | "webExtract" | "vision";
export type AuxModelsState = Partial<Record<AuxSlotKey, AuxModelRef | null>>;

export const AUX_SLOT_KEYS: readonly AuxSlotKey[] = ["compression", "titleGeneration", "goalJudge", "webExtract", "vision"];

/**
 * Load-sanitize: a pin survives only when its provider still exists with a
 * base URL and the model id is non-empty — anything else returns to
 * "auto (use main)" (official stale-pin hygiene, one-slot-at-a-time form).
 */
export function sanitizeAuxModels(raw: unknown, providers: ProviderConfig[]): AuxModelsState {
	const out: AuxModelsState = {};
	const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	for (const key of AUX_SLOT_KEYS) {
		const ref = src[key];
		if (!ref || typeof ref !== "object") {
			out[key] = null;
			continue;
		}
		const providerId = String((ref as { providerId?: unknown }).providerId ?? "");
		const model = String((ref as { model?: unknown }).model ?? "").trim();
		const provider = providers.find((p) => p.id === providerId);
		out[key] = provider && provider.baseUrl.trim() && model ? { providerId, model } : null;
	}
	return out;
}

/** The (provider, model) pair a task runs on: the pin when valid, else main. */
export function resolveAuxTask(
	settings: { providers: ProviderConfig[]; auxModels?: AuxModelsState },
	key: AuxSlotKey,
	main: { providerId: string; model: string }
): { providerId: string; model: string } {
	const ref = settings.auxModels?.[key];
	if (ref && settings.providers.some((p) => p.id === ref.providerId && p.baseUrl.trim())) {
		return { providerId: ref.providerId, model: ref.model };
	}
	return main;
}
