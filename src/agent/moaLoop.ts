/**
 * Mixture-of-Agents runtime — Hermes `agent/moa_loop.py` MoAClient (facade)
 * parity port (verified raw 2026-08-01 @ e444d16).
 *
 * The persistent flow, one prepareIteration() per agent-loop iteration:
 *   1. If the preset is disabled → the aggregator acts ALONE (no fan-out,
 *      no guidance) — "use the aggregator directly".
 *   2. Cadence: user_turn (default) runs the advisors ONCE per user turn and
 *      reuses the advice on later tool iterations (signature = advisory view
 *      up to the last REAL user message); per_iteration re-runs whenever the
 *      advisory view changes; every_n:<N> runs on iteration 1 and every Nth
 *      tool iteration, reusing the cache in between. An interrupted fan-out
 *      is never cached (a partial snapshot would replay all turn).
 *   3. Advisors see an ADVISORY COPY of the conversation (system dropped,
 *      tool calls/results flattened to text, results head+tail truncated at
 *      4000 chars, view forced to end on a user message) under the official
 *      "reference advisor" system prompt. Failures never throw — each becomes
 *      a labelled `[failed: …]` note; interrupt → `[skipped: interrupted by
 *      user]`.
 *   4. NO synthesis call: the aggregator IS the acting model — the joined
 *      reference blocks ride into its call under the official
 *      "[Mixture of Agents reference context]" guidance header, attached at
 *      the END of the outgoing messages (KV-cache-friendly). All-fail: loud
 *      policy → the official "acting alone" notice block; silent → nothing.
 *
 * Events (display only, exactly one turn's worth per fan-out, never on a
 * cache hit): progress per completion → reference blocks → phase
 * "aggregator". The chat layer renders them in the reasoning disclosure with
 * the desktop replace/accumulate semantics.
 *
 * Intentionally not ported (recorded in docs): per-advisor usage/cost
 * accounting, trace persistence, moa.privacy_filter redaction, Anthropic
 * cache_control decoration, the one-shot synthesis variant
 * (aggregate_moa_context — gateway/encoded-marker path; our /moa one-shot is
 * the CLI flow = this facade for one turn).
 */

import type { OpenAgentSettings, ProviderConfig } from "../settings";
import type { ChatMessage } from "../types";
import type { MoaPreset, MoaSlot } from "./moa";
import { backoffMs, maxAttempts, sleep } from "./resilience";
import { chatCompletion } from "./providers";

/* ── constants (agent/moa_loop.py) ─────────────────────────────────────── */

export const MOA_REFERENCE_TOOL_RESULT_BUDGET = 4000;
export const MOA_MAX_REFERENCE_WORKERS = 8;
export const MOA_INTERRUPTED_NOTE = "[skipped: interrupted by user]";

export const MOA_ADVISORY_INSTRUCTION =
	"[The conversation above is the current state of the task. Give your " +
	"most intelligent judgement: what is going on, what should happen next, " +
	"what risks or mistakes you see, and how the acting agent should " +
	"proceed.]";

export const MOA_REFERENCE_SYSTEM_PROMPT =
	"You are a reference advisor in a Mixture of Agents (MoA) process. You are " +
	"NOT the acting agent and you do NOT execute anything: you cannot call " +
	"tools, run commands, browse, or access files, repositories, or URLs, and " +
	"you should not try to or apologize for being unable to. A separate " +
	"aggregator/orchestrator model holds those capabilities and will take the " +
	"actual actions.\n\n" +
	"CRITICAL: You must NEVER claim or imply that you have executed a command, " +
	"downloaded a file, accessed a URL, or performed any action. You can only " +
	"analyze and advise based on the conversation context. Examples of what to " +
	"avoid:\n" +
	'- Bad: "I ran curl and got 404."\n' +
	'- Bad: "I downloaded the file successfully."\n' +
	'- Bad: "I checked the repository and found..."\n' +
	'- Good: "Based on the error pattern, a curl request to that URL would likely return 404."\n' +
	'- Good: "The conversation suggests downloading this file may help."\n' +
	'- Good: "From the context, checking the repository would reveal..."\n\n' +
	"The conversation below is the current state of a task handled by that " +
	"acting agent. Your job is to give your most intelligent analysis of that " +
	"state: understand the goal, reason about the problem, and advise on what " +
	"to do next. Surface the best approach, concrete next steps and tool-use " +
	"strategy, likely pitfalls and risks, and anything the acting agent may " +
	"have missed or gotten wrong. Assume any referenced files, URLs, or " +
	"systems exist and reason about them from the context given rather than " +
	"asking for access.\n\n" +
	"Respond with your advice directly — no preamble, no disclaimers about " +
	"tools or access. Your response is private guidance handed to the " +
	"aggregator, not an answer shown to the user. NEVER claim to have executed " +
	"anything.";

/* ── pure helpers ──────────────────────────────────────────────────────── */

/** Flatten structured content to its visible text (image parts skipped) —
    the advisory view never carries parts. */
function flattenText(content: ChatMessage["content"]): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((p) => p.type === "text")
			.map((p) => (p as { type: "text"; text: string }).text)
			.join("\n");
	}
	return "";
}

/** Head+tail preview of a tool result for the advisory view (official:
    first/last halves of the budget with a counted omission marker). */
export function truncateMoaToolResult(text: string, budget = MOA_REFERENCE_TOOL_RESULT_BUDGET): string {
	if (!text || text.length <= budget) return text;
	const half = Math.floor(budget / 2);
	const omitted = text.length - 2 * half;
	return `${text.slice(0, half)}\n[... ${omitted} chars omitted ...]\n${text.slice(-half)}`;
}

/** `[called tool: name(args)]` lines — string args verbatim, object args
    JSON (official _render_tool_calls). */
export function renderMoaToolCalls(toolCalls: ChatMessage["tool_calls"]): string {
	const lines: string[] = [];
	for (const tc of toolCalls ?? []) {
		const name = tc?.function?.name ?? "tool";
		const args = tc?.function?.arguments;
		const argsText = typeof args === "string" ? args : args != null ? JSON.stringify(args) : "";
		lines.push(argsText ? `[called tool: ${name}(${argsText})]` : `[called tool: ${name}]`);
	}
	return lines.join("\n");
}

export interface AdvisoryMessage {
	role: "user" | "assistant";
	content: string;
}

/** The advisory view of the conversation (official _reference_messages):
    system dropped; assistant tool_calls rendered inline; tool results folded
    into the preceding assistant turn (head+tail truncated); zero tool-role
    messages, zero tool_calls arrays — strict providers never 400; the view
    MUST end on a user turn, so a trailing assistant state earns the
    synthetic advisory instruction. */
export function referenceView(messages: ChatMessage[]): AdvisoryMessage[] {
	const rendered: AdvisoryMessage[] = [];
	let lastUser: string | null = null;
	for (const msg of messages) {
		const text = flattenText(msg.content);
		if (msg.role === "system") continue;
		if (msg.role === "user") {
			let t = text;
			if (!t.trim() && Array.isArray(msg.content) && msg.content.length > 0) {
				t = "[user sent non-text content (e.g. an image attachment)]";
			}
			if (!t.trim()) continue; // empty user turn carries nothing advisory
			lastUser = t;
			rendered.push({ role: "user", content: t });
		} else if (msg.role === "assistant") {
			const parts: string[] = [];
			if (text.trim()) parts.push(text.trim());
			const calls = renderMoaToolCalls(msg.tool_calls);
			if (calls) parts.push(calls);
			if (parts.length > 0) rendered.push({ role: "assistant", content: parts.join("\n") });
		} else if (msg.role === "tool") {
			const block = `[tool result: ${truncateMoaToolResult(text)}]`;
			const last = rendered[rendered.length - 1];
			if (last && last.role === "assistant") last.content += "\n" + block;
			else rendered.push({ role: "assistant", content: block });
		}
	}
	const last = rendered[rendered.length - 1];
	if (last && last.role === "assistant") {
		rendered.push({ role: "user", content: MOA_ADVISORY_INSTRUCTION });
	}
	if (rendered.length === 0) {
		/* official fallback: latest user turn, then any earlier user turn
		   with text, else the (empty) view as-is */
		if (lastUser !== null) return [{ role: "user", content: lastUser }];
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === "user") {
				const t = flattenText(messages[i].content);
				if (t.trim()) return [{ role: "user", content: t }];
			}
		}
	}
	return rendered;
}

export function moaSlotLabel(slot: MoaSlot): string {
	const label = `${(slot.provider ?? "").trim()}:${(slot.model ?? "").trim()}`;
	const effort = (slot.reasoning_effort ?? "").trim();
	return effort ? `${label}[reasoning=${effort}]` : label;
}

export function isFailedMoaReference(text: string): boolean {
	const s = (text ?? "").trimStart().toLowerCase();
	return s.startsWith("[failed:") || s.startsWith("[skipped:");
}

export function degradedMoaNotice(failedLabels: string[], policy: string): string {
	if (failedLabels.length === 0 || String(policy).trim().toLowerCase() === "silent") return "";
	return `[Reference models unavailable: ${failedLabels.join(", ")}]`;
}

/** Join successful advisor outputs the official way (indices re-number over
    successful outputs only). */
export function joinMoaReferences(outputs: ReferenceOutput[]): string {
	return outputs.map((o, i) => `Reference ${i + 1} — ${o.label}:\n${o.text}`).join("\n\n");
}

/** The persistent-mode guidance header (agent/moa_loop.py create(), verbatim). */
export function buildMoaGuidance(presetName: string, aggregator: MoaSlot, successful: ReferenceOutput[], notice: string): string {
	const joined = joinMoaReferences(successful);
	const body = notice ? (joined ? `${joined}\n\n${notice}` : notice) : joined;
	return (
		"[Mixture of Agents reference context]\n" +
		`Preset: ${presetName}\n` +
		`Aggregator/acting model: ${moaSlotLabel(aggregator)}\n` +
		`References: ${successful.map((o) => o.label).join(", ")}\n\n` +
		"Use the reference responses below as private context. You are the aggregator and acting model: " +
		"answer the user directly or call tools as needed.\n\n" +
		body
	);
}

/** All advisors failed/skipped — loud policy only (silent → no guidance). */
export function buildMoaAllFailedGuidance(presetName: string, aggregator: MoaSlot, notice: string): string {
	return (
		"[Mixture of Agents reference context]\n" +
		`Preset: ${presetName}\n` +
		`Aggregator/acting model: ${moaSlotLabel(aggregator)}\n\n` +
		"All reference models failed this turn — no advisory guidance is available. Act on your own judgment.\n\n" +
		notice
	);
}

/** Attach the per-iteration guidance at the END of the outgoing wire
    (official _attach_reference_guidance): merged into a trailing user
    message (string or content-part list — never two consecutive user turns),
    else appended as its own user message. Input is CLONED — the persisted
    transcript never carries the reference block (official peels it). */
export function attachMoaGuidance(messages: ChatMessage[], guidance: string): ChatMessage[] {
	const out: ChatMessage[] = messages.map((m) => ({ ...m }));
	const last = out[out.length - 1];
	if (last && last.role === "user") {
		if (typeof last.content === "string") {
			last.content = last.content + "\n\n" + guidance;
			return out;
		}
		if (Array.isArray(last.content)) {
			last.content = [...last.content, { type: "text" as const, text: "\n\n" + guidance }];
			return out;
		}
	}
	out.push({ role: "user", content: guidance });
	return out;
}

/** Stable signature for the advisory view (official: sha256 over
    NUL-joined "role:content"). We use a two-seed FNV-1a hex — a cache
    signature, not a security surface; sync keeps the hot path simple. */
export function moaViewSignature(messages: { role: string; content: string }[]): string {
	const joined = messages.map((m) => `${m.role}:${m.content}`).join("\u0000");
	const fnv = (seed: number, s: string): string => {
		let h = seed >>> 0;
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i);
			h = Math.imul(h, 0x01000193) >>> 0;
		}
		return h.toString(16).padStart(8, "0");
	};
	return fnv(0x811c9dc5, joined) + fnv(0x01000193, joined) + fnv(0xdeadbeef, joined) + fnv(0xabcdef01, joined);
}

/** Cadence pre-computation (agent/moa_loop.py fanout block): which view to
    hash for the turn signature, whether this iteration is on-cadence. Pure
    so the unit suite can pin the machine. */
export function moaCadenceDecision(
	fanout: string,
	view: AdvisoryMessage[],
	state: { turnSig: string | null; stateSig: string | null; iterationCount: number }
): { turnPrefix: AdvisoryMessage[]; turnSig: string; stateSig: string; iterationCount: number; onCadence: boolean } {
	let mode = (fanout || "user_turn").trim().toLowerCase();
	let everyN = 0;
	if (mode.startsWith("every_n:")) {
		everyN = parseInt(mode.slice(8), 10);
		if (!Number.isFinite(everyN) || everyN < 2) {
			mode = "per_iteration"; // every_n:1 semantics (official collapse)
			everyN = 0;
		}
	}
	/* Turn prefix = view up to the last REAL user message (the synthetic
	   advisory instruction appended on tool iterations must not inflate it —
	   that would change the signature every iteration, defeating user_turn). */
	let turnPrefix = view;
	if (mode === "user_turn" || everyN >= 2) {
		for (let i = view.length - 1; i >= 0; i--) {
			if (view[i].role === "user" && view[i].content !== MOA_ADVISORY_INSTRUCTION) {
				turnPrefix = view.slice(0, i + 1);
				break;
			}
		}
	}
	const turnSig = moaViewSignature(turnPrefix);
	const stateSig = moaViewSignature(view);
	let count = state.iterationCount;
	if (everyN >= 2) {
		if (turnSig !== state.turnSig) count = 0;
		/* advance only when the advisory STATE actually advanced — a redundant
		   call with an identical view (e.g. a retry) must not eat a slot */
		if (stateSig !== state.stateSig || turnSig !== state.turnSig) count += 1;
		return { turnPrefix, turnSig, stateSig, iterationCount: count, onCadence: (count - 1) % everyN === 0 };
	}
	return { turnPrefix, turnSig, stateSig, iterationCount: count, onCadence: true };
}

/* ── reference outputs + events ────────────────────────────────────────── */

export interface ReferenceOutput {
	label: string;
	text: string;
}

export type MoaDisplayEvent =
	| { type: "progress"; done: number; total: number; label: string }
	| { type: "reference"; index: number; count: number; label: string; text: string }
	| { type: "phase"; phase: "aggregator"; aggregator: string; refs_done: number; refs_total: number };

/* ── the engine ────────────────────────────────────────────────────────── */

export interface MoaTurnEngineOptions {
	presetName: string;
	preset: MoaPreset;
	settings: OpenAgentSettings;
	signal?: AbortSignal;
	emit?: (e: MoaDisplayEvent) => void;
}

export interface MoaPreparedIteration {
	wire: ChatMessage[];
	provider: ProviderConfig;
	model: string;
}

export class MoaTurnEngine {
	private cacheKey: string | null = null;
	private cacheOutputs: ReferenceOutput[] | null = null;
	private cadence = { turnSig: null as string | null, stateSig: null as string | null, iterationCount: 0 };

	constructor(private opts: MoaTurnEngineOptions) {}

	/** Resolve the aggregator slot to its ProviderConfig; a clear error when
	    the preset points at a provider this vault doesn't have. */
	private aggregatorProvider(): ProviderConfig {
		const slot = this.opts.preset.aggregator;
		const found = this.opts.settings.providers.find((p) => p.id === slot.provider);
		if (!found) {
			throw new Error(
				`MoA aggregator provider "${slot.provider}" isn't configured in this vault. ` +
					"Open Settings → Open Agent → Model → Mixture of Agents and pick a configured provider for the Aggregator slot."
			);
		}
		return found;
	}

	/**
	 * One agent-loop iteration through the facade: advisor fan-out per the
	 * cadence (or the cache), guidance attached to a CLONE at the end, acting
	 * connection = the aggregator slot.
	 */
	async prepareIteration(wire: ChatMessage[]): Promise<MoaPreparedIteration> {
		const { preset, presetName } = this.opts;
		const provider = this.aggregatorProvider();
		const model = preset.aggregator.model;

		/* Disabled preset → "use the aggregator directly" (official). */
		const refs = preset.enabled !== false ? preset.reference_models.filter((s) => s.enabled !== false) : [];
		if (refs.length === 0) return { wire, provider, model };

		const view = referenceView(wire);
		const mode = (preset.fanout || "user_turn").trim().toLowerCase();
		/* Official sig semantics: user_turn → hash the TURN PREFIX (stable
		   within a turn → iteration 2+ is a cache HIT). per_iteration AND
		   every_n → hash the FULL view: it grows every tool iteration, so an
		   on-cadence every_n iteration is a natural MISS (advisors re-run)
		   while the off-cadence ones reuse by force below. */
		let sigView = view;
		let onCadence = true;
		if (mode === "user_turn") {
			sigView = this.cadenceStep(view).turnPrefix;
		} else if (mode.startsWith("every_n")) {
			const d = this.cadenceStep(view);
			sigView = view;
			onCadence = d.onCadence;
		}
		const sig = moaViewSignature(sigView);
		const key = `${presetName}\u001d${sig}\u001d${refs.map(moaSlotLabel).join("\u001e")}`;

		let outputs: ReferenceOutput[];
		if (this.cacheOutputs && (this.cacheKey === key || !onCadence)) {
			/* cache HIT (or off-cadence every_n): reuse, no events, no re-run */
			outputs = this.cacheOutputs;
		} else {
			outputs = await this.runReferences(refs, view);
			if (outputs.some((o) => o.text === MOA_INTERRUPTED_NOTE)) {
				/* partial snapshot — never cached; the next iteration re-runs */
				this.cacheKey = null;
				this.cacheOutputs = null;
			} else {
				this.cacheKey = key;
				this.cacheOutputs = outputs;
			}
		}

		const successful = outputs.filter((o) => !isFailedMoaReference(o.text));
		const failedLabels = outputs.filter((o) => isFailedMoaReference(o.text)).map((o) => o.label);
		const notice = degradedMoaNotice(failedLabels, preset.degraded_reference_policy);

		let guidance: string | null = null;
		if (outputs.length > 0 && successful.length === 0) {
			if (notice) guidance = buildMoaAllFailedGuidance(presetName, preset.aggregator, notice);
		} else {
			const joined = successful.length > 0 || notice ? buildMoaGuidance(presetName, preset.aggregator, successful, notice) : "";
			if (joined) guidance = joined;
		}
		return { wire: guidance ? attachMoaGuidance(wire, guidance) : wire, provider, model };
	}

	private cadenceStep(view: AdvisoryMessage[]): { turnPrefix: AdvisoryMessage[]; onCadence: boolean } {
		const d = moaCadenceDecision(this.opts.preset.fanout, view, this.cadence);
		this.cadence = { turnSig: d.turnSig, stateSig: d.stateSig, iterationCount: d.iterationCount };
		return { turnPrefix: d.turnPrefix, onCadence: d.onCadence };
	}

	/** Parallel advisor fan-out (pool of 8, official _MAX_REFERENCE_WORKERS);
	    per-completion progress event; failures are notes, never throws. */
	private async runReferences(refs: MoaSlot[], view: AdvisoryMessage[]): Promise<ReferenceOutput[]> {
		const { settings, signal, emit } = this.opts;
		const refMessages: { role: string; content: string }[] = [
			{ role: "system", content: MOA_REFERENCE_SYSTEM_PROMPT },
			...view.map((m) => ({ role: m.role as string, content: m.content })),
		];
		const results: ReferenceOutput[] = new Array(refs.length);
		let done = 0;
		const runOne = async (slot: MoaSlot, idx: number): Promise<void> => {
			const label = moaSlotLabel(slot);
			if (signal?.aborted) {
				results[idx] = { label, text: MOA_INTERRUPTED_NOTE };
			} else {
				results[idx] = { label, text: await this.callReference(slot, refMessages) };
			}
			done += 1;
			emit?.({ type: "progress", done, total: refs.length, label });
		};

		const queue = refs.map((slot, idx) => ({ slot, idx }));
		const workers = Math.min(MOA_MAX_REFERENCE_WORKERS, queue.length);
		const pump = async (): Promise<void> => {
			for (;;) {
				const next = queue.shift();
				if (!next) return;
				await runOne(next.slot, next.idx);
			}
		};
		await Promise.all(Array.from({ length: workers }, pump));

		/* reference blocks + phase — once per fan-out, ALL outputs incl.
		   failure notes (official emit block) */
		results.forEach((o, i) => emit?.({ type: "reference", index: i + 1, count: results.length, label: o.label, text: o.text }));
		if (results.length > 0) {
			const aggLabel = moaSlotLabel(this.opts.preset.aggregator);
			emit?.({ type: "phase", phase: "aggregator", aggregator: aggLabel, refs_done: results.length, refs_total: results.length });
		}
		return results;
	}

	/** One advisor call with the shared retry policy (transient retries 2,
	    Hermes aux default — same helper the main loop consults); no failover:
	    a pinned advisor never pivots providers. */
	private async callReference(slot: MoaSlot, refMessages: { role: string; content: string }[]): Promise<string> {
		const { settings, signal } = this.opts;
		const provider = settings.providers.find((p) => p.id === slot.provider);
		if (!provider) return `[failed: unknown provider '${slot.provider}' — configure it or edit this MoA preset]`;
		const callSettings: OpenAgentSettings = {
			...settings,
			model: slot.model,
			streaming: false,
			/* null temperature → omit (provider default), matching single-model
			   behavior; our convention: temperature < 0 = omit */
			temperature: this.opts.preset.reference_temperature ?? -1,
			/* per-slot cap wins over the preset cap; both unset → uncapped (0) */
			maxTokens: slot.max_tokens ?? this.opts.preset.reference_max_tokens ?? 0,
			...(this.opts.preset.reference_timeout
				? { requestTimeoutMs: this.opts.preset.reference_timeout * 1000 }
				: {}),
		};
		let attempt = 0;
		for (;;) {
			try {
				const res = await chatCompletion(provider, callSettings, refMessages as ChatMessage[], null, { signal });
				return res.content || "(empty response)";
			} catch (err) {
				if (signal?.aborted) return MOA_INTERRUPTED_NOTE;
				attempt++;
				if (attempt < maxAttempts(err)) {
					await sleep(backoffMs(attempt));
					continue;
				}
				return `[failed: ${err instanceof Error ? err.message : String(err)}]`;
			}
		}
	}
}
