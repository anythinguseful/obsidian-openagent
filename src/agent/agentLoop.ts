/**
 * The agent loop — Hermes' core: chat → tool calls → execute → repeat
 * until the model stops asking for tools (or we hit the iteration cap).
 *
 * Supports interrupt-and-redirect (AbortSignal), streaming tokens,
 * operation-aware approval with a per-tool/class allowlist, and usage accounting.
 */

import { ChatMessage, TokenUsage } from "../types";
import { OpenAgentSettings } from "../settings";
import {
	AgentTool,
	ClarifyHandler,
	PreparedToolCall,
	ToolApprovalKind,
	ToolContext,
	resolveToolApprovalKind,
	toolSchemas,
} from "./tools";
import { unpackNativeVisionResult } from "./vision";
import {
	chatCompletion,
	CompletionResult,
	ProviderHttpError,
	ProviderStreamProtocolError,
	ProviderTimeoutError,
} from "./providers";
import type { HarnessRequestPrep } from "./harness";
import { getActiveProvider, ProviderConfig } from "../settings";
import { backoffMs, FallbackTarget, maxAttempts, resolveFallbacks, sleep } from "./resilience";
import { escapeUntrustedSteerMarkers, formatSteerMarker } from "./steer";
import { InjectInbox } from "./injectInbox";
import { redactSecretsInText } from "./redact";
import { countContentImages, messageContentPreview, sessionEvent, type SessionEvent } from "./sessionEvents";
import { runPostExecute, runPreExecute, toolErrorMessage } from "./toolWaterfall";

export type ApprovalDecision = "allow-once" | "allow-always" | "deny";

export interface ApprovalRequest {
	toolName: string;
	args: Record<string, any>;
	/** Operation-aware label for the approval UI. */
	kind: ToolApprovalKind;
	/** Compatibility shorthand used by older UI/tests. */
	dangerous: boolean;
	/** False means this approval can only resolve allow-once or deny. */
	allowAlways: boolean;
	/** Frozen, human-readable security values produced before the prompt. */
	details?: Record<string, unknown>;
}

/** Emitted once per run when the primary model fails over to a fallback. */
export interface FailoverInfo {
	from: string;
	to: string;
	reason: string;
}

export type AttemptReason =
	| "initial"
	| "retry"
	| "failover"
	| "buffered-fallback"
	| "http"
	| "timeout"
	| "protocol"
	| "transport";

/** Metadata only — never contains prompt, token, reasoning or tool payload. */
export interface AgentAttemptInfo {
	iteration: number;
	attempt: number;
	providerId: string;
	model: string;
	reason: AttemptReason;
}

/* Re-export the test hook so the bundled suite can scale sleeps to zero. */
export { setBackoffScale } from "./resilience";

export interface AgentLoopEvents {
	onToken?: (text: string) => void;
	onReasoning?: (text: string) => void;
	onToolStart?: (toolCallId: string, toolName: string, args: string) => void;
	onToolResult?: (toolCallId: string, toolName: string, status: "done" | "error" | "denied", result: string) => void;
	onUsage?: (usage: TokenUsage) => void;
	/** Fired at most once per run when a fallback model takes over. */
	onFailover?: (info: FailoverInfo) => void;
	/** Live preview: tool-call deltas are streaming in, execution hasn't
	    started yet (args snapshot so far — may be incomplete JSON). */
	onToolCallPending?: (id: string, name: string, argsJson: string) => void;
	/** Fired at the top of every loop iteration, right before the model
	    request — marks the token-free "prompt processing" window. */
	onIterationStart?: (iteration: number) => void;
	/** Attempt-atomic stream lifecycle. UIs checkpoint on start, restore on
	    discard, and release the checkpoint only on commit. */
	onAttemptStart?: (info: AgentAttemptInfo) => void;
	onAttemptDiscard?: (info: AgentAttemptInfo) => void;
	onAttemptCommit?: (info: AgentAttemptInfo) => void;
	/** Fired when a pending /steer is drained into a tool result: the chat
	    mirrors the marker into the matching transcript card + saved wire so
	    the UI never disagrees with what the model saw. */
	onSteerApplied?: (toolCallId: string | undefined, marker: string) => void;
	/** Live session log (same objects as AgentRunResult.events). */
	onSessionEvent?: (event: SessionEvent) => void;
	/** Resolve with the user's decision. Must always resolve. */
	requestApproval?: (req: ApprovalRequest) => Promise<ApprovalDecision>;
	/** Hermes clarify-tool callback (v0.1.80): interactive contexts supply
	    it; headless runs leave it unset and the tool replies "not available
	    in this execution context" (Hermes callback=None parity). Resolve
	    with the user's answer (string, or string[] when multiSelect). */
	requestClarify?: ClarifyHandler;
	/** v0.1.135 delegation: live batch progress (done, total) */
	onDelegateProgress?: (done: number, total: number) => void;
	signal?: AbortSignal;
}

export interface AgentRunResult {
	messages: ChatMessage[]; // new messages produced during the run (assistant + tool)
	iterations: number;
	aborted: boolean;
	/** finish_reason of the LAST completion — "length" means the provider cut
	    the reply short (max_tokens / context cap); the chat surfaces this. */
	finishReason: string | null;
	/** run_agent.py parity: a /steer that never found a tool result to ride
	    (the model settled first) comes back here for next-turn delivery.
	    A hard interrupt supersedes it — then this is null. */
	pendingSteer: string | null;
	/** Append-only log for this run (turn/step/tool). Chat concatenates onto the session. */
	events: SessionEvent[];
}

export class AgentLoop {
	private allowlist = new Set<string>();
	/* Inject inbox (Phase 3). /steer is one consumer. JS is single-threaded;
	   the UI thread both stashes and drains. */
	private inbox = new InjectInbox();

	constructor(
		private settings: OpenAgentSettings,
		private tools: AgentTool[],
		private ctx: ToolContext,
		/** Request-prep plugin (MoA implements HarnessRequestPrep). Null = bare loop. */
		private moa: HarnessRequestPrep | null = null
	) {}

	resetAllowlist() {
		this.allowlist.clear();
	}

	/** DeepSeek inject: admit text onto the next step. */
	inject(text: string): boolean {
		return this.inbox.push(text);
	}

	/** run_agent.py steer(): inject a user message into the next tool result
	    WITHOUT interrupting. One InjectInbox consumer. */
	steer(text: string): boolean {
		return this.inject(text);
	}

	private approvalKey(toolName: string, kind: ToolApprovalKind): string {
		return `${toolName}:${kind}`;
	}

	private needsApproval(tool: AgentTool, kind: ToolApprovalKind, forceApproval = false): boolean {
		if (forceApproval) return true;
		if (this.settings.approvalMode === "yolo") return false;
		if (this.allowlist.has(this.approvalKey(tool.name, kind))) return false;
		if (this.settings.approvalMode === "manual") return true;
		return kind !== "standard";
	}

	private async executeTool(callId: string, name: string, argsJson: string, events: AgentLoopEvents): Promise<ChatMessage> {
		const tool = this.tools.find((t) => t.name === name);
		let args: Record<string, any> = {};
		try {
			/* A model can emit `null`, a number or a bare string as tool arguments:
			   valid JSON, not an argument object. `null` in particular parsed
			   cleanly and then threw on the first property read downstream. */
			const parsed = argsJson ? JSON.parse(argsJson) : {};
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed;
		} catch {
			/* tolerate malformed args */
		}

		if (!tool) {
			events.onToolResult?.(callId, name, "error", `Unknown tool: ${name}`);
			return toolErrorMessage(callId, name, `Error: unknown tool "${name}".`);
		}

		const interactive = {
			clarify: events.requestClarify,
			delegateProgress: events.onDelegateProgress,
			signal: events.signal,
		};
		let prepared: PreparedToolCall | undefined;
		try {
			prepared = await tool.prepare?.(args, this.ctx, interactive);
		} catch (err) {
			const msg = escapeUntrustedSteerMarkers(err instanceof Error ? err.message : String(err));
			events.onToolResult?.(callId, name, "error", msg);
			return toolErrorMessage(callId, name, `Error: ${msg}`);
		}

		const kind = prepared?.approvalKind ?? resolveToolApprovalKind(tool, args);
		const allowAlways = prepared?.allowAlways ?? tool.allowAlways ?? true;

		const halted = await runPreExecute([
			async () => {
				if (!this.needsApproval(tool, kind, prepared?.forceApproval === true)) return { halt: false };
				const decision = (await events.requestApproval?.({
					toolName: name,
					args,
					kind,
					dangerous: !!tool.dangerous || kind === "destructive",
					allowAlways,
					details: prepared?.approvalDetails,
				})) ?? "deny";
				if (decision === "deny" || (decision === "allow-always" && !allowAlways)) {
					events.onToolResult?.(callId, name, "denied", "Denied by user.");
					return {
						halt: true,
						message: toolErrorMessage(callId, name, "The user denied this action. Do not retry it; ask how to proceed."),
					};
				}
				if (decision === "allow-always") this.allowlist.add(this.approvalKey(name, kind));
				return { halt: false };
			},
			async () => {
				if (!events.signal?.aborted) return { halt: false };
				events.onToolResult?.(callId, name, "denied", "Aborted.");
				return { halt: true, message: toolErrorMessage(callId, name, "Aborted by user.") };
			},
		]);
		if (halted) return halted;

		try {
			if (prepared?.revalidate) {
				const staleReason = await prepared.revalidate();
				if (staleReason) throw new Error(`Approval expired: ${staleReason}. Run the request again.`);
			}
			const result = prepared
				? await prepared.execute()
				: await tool.execute(args, this.ctx, interactive);
			/* v0.1.134 native vision fast path (Hermes vision_tools.py): pixels
			   ride the tool result as multimodal parts — MUST bypass the 20k
			   text clipper that would destroy them */
			const native = unpackNativeVisionResult(result);
			if (native) {
				const safeText = escapeUntrustedSteerMarkers(native.text);
				const safeParts = native.parts.map((part) =>
					part.type === "text" ? { ...part, text: escapeUntrustedSteerMarkers(part.text) } : part
				);
				events.onToolResult?.(callId, name, "done", safeText);
				return { role: "tool", tool_call_id: callId, name, content: safeParts };
			}
			const clipped = await runPostExecute(result, [
				(text) => escapeUntrustedSteerMarkers(text),
				(text) => {
					if (!this.settings.redactSecrets) return text;
					const redacted = redactSecretsInText(text);
					return redacted.redactions > 0 ? redacted.text : text;
				},
				(text) => (text.length > 20000 ? text.slice(0, 20000) + "\n…(truncated)" : text),
			]);
			events.onToolResult?.(callId, name, "done", clipped);
			return { role: "tool", tool_call_id: callId, name, content: clipped };
		} catch (err) {
			const msg = escapeUntrustedSteerMarkers(err instanceof Error ? err.message : String(err));
			events.onToolResult?.(callId, name, "error", msg);
			return toolErrorMessage(callId, name, `Error: ${msg}`);
		}
	}

	/**
	 * One chat request wrapped in the resilience policy: retry with backoff
	 * per connection, then (at most once per run) fail over to the first
	 * configured fallback {provider, model} — turn-scoped, like Hermes.
	 */
	private async requestWithResilience(
		conn: { provider: ProviderConfig; model: string },
		fallbacks: FallbackTarget[],
		failoverFlag: { used: boolean },
		messages: ChatMessage[],
		schemas: unknown[] | null,
		events: AgentLoopEvents,
		iteration: number
	): Promise<CompletionResult> {
		let retryAttempt = 0;
		let sequence = 0;
		let nextStartReason: AttemptReason = "initial";
		const failureReason = (err: unknown): AttemptReason => {
			if (err instanceof ProviderHttpError) return "http";
			if (err instanceof ProviderTimeoutError) return "timeout";
			if (err instanceof ProviderStreamProtocolError) return "protocol";
			return "transport";
		};
		for (;;) {
			let current: AgentAttemptInfo = {
				iteration,
				attempt: ++sequence,
				providerId: conn.provider.id,
				model: conn.model,
				reason: nextStartReason,
			};
			events.onAttemptStart?.(current);
			try {
				const result = await chatCompletion(
					conn.provider,
					{ ...this.settings, model: conn.model },
					messages,
					schemas,
					{
						onToken: events.onToken,
						onReasoning: events.onReasoning,
						onToolCall: events.onToolCallPending,
						onReset: () => {
							events.onAttemptDiscard?.({ ...current, reason: "buffered-fallback" });
							current = {
								iteration,
								attempt: ++sequence,
								providerId: conn.provider.id,
								model: conn.model,
								reason: "buffered-fallback",
							};
							events.onAttemptStart?.(current);
						},
						signal: events.signal,
					}
				);
				events.onAttemptCommit?.(current);
				return result;
			} catch (err) {
				events.onAttemptDiscard?.({ ...current, reason: failureReason(err) });
				if (events.signal?.aborted) throw err;
				retryAttempt++;
				if (retryAttempt < maxAttempts(err)) {
					nextStartReason = "retry";
					await sleep(backoffMs(retryAttempt));
					continue;
				}
				// Attempts exhausted on this connection — one turn-scoped failover.
				if (!failoverFlag.used && fallbacks.length > 0) {
					failoverFlag.used = true;
					const next = fallbacks.shift()!;
					const from = `${conn.provider.name} · ${conn.model}`;
					conn.provider = next.provider;
					conn.model = next.model;
					events.onFailover?.({
						from,
						to: `${next.provider.name} · ${next.model}`,
						reason: err instanceof Error ? err.message : String(err),
					});
					retryAttempt = 0; // fresh retry budget on the new connection
					nextStartReason = "failover";
					continue;
				}
				throw err;
			}
		}
	}

	/**
	 * Run the loop against `history` (system prompt + prior turns).
	 * Mutates nothing; returns the new messages to append.
	 */
	async run(history: ChatMessage[], events: AgentLoopEvents): Promise<AgentRunResult> {
		const provider = getActiveProvider(this.settings);
		if (!provider || !provider.baseUrl) {
			throw new Error("No active provider configured. Open Settings → Open Agent → Providers.");
		}
		if (!this.settings.model) {
			throw new Error("No model selected. Open Settings → Open Agent → Model.");
		}

		const produced: ChatMessage[] = [];
		const sessionLog: SessionEvent[] = [];
		const log = (partial: Omit<SessionEvent, "at"> & { at?: number }) => {
			const ev = sessionEvent(partial);
			sessionLog.push(ev);
			events.onSessionEvent?.(ev);
		};
		log({ type: "turn/start", source: "system" });
		const schemas = toolSchemas(this.tools);
		/* v0.1.147 diagnostic (debugMode only): the exact per-request wire size,
		   so "prompt processing is slow on LM Studio" is measurable instead of
		   guessed — messages (system + turns) via chars/4, plus the tool-schema
		   payload. Inlined chars/4 (the compression engine stays out of the
		   loop, per the v0.1.17 boundary contract). Toggle in Settings → Open
		   Agent → General → Debug mode. */
		if (this.settings.debugMode) {
			let wireChars = 0;
			for (const m of history) wireChars += (m.role?.length ?? 0) + (typeof m.content === "string" ? m.content.length : 0);
			const wireTokens = Math.ceil(wireChars / 4);
			const schemaChars = JSON.stringify(schemas).length;
			console.info(
				`[Open Agent] request ${history.length} messages · ~${wireTokens} wire tokens (chars/4) · ${schemas.length} tool schemas (~${Math.round(schemaChars / 4)} tokens)`
			);
		}
		// Turn-scoped connection: may swap to a fallback once per run.
		const conn = { provider, model: this.settings.model };
		const fallbacks = resolveFallbacks(this.settings);
		const failoverFlag = { used: false };
		let iterations = 0;
		let aborted = false;
		let finishReason: string | null = null;

		while (iterations < this.settings.maxIterations) {
			if (events.signal?.aborted) {
				aborted = true;
				break;
			}
			iterations++;
			events.onIterationStart?.(iterations);
			log({ type: "step/start", step: iterations, source: "assistant" });

			/* /steer drain (run_agent.py, both official points collapse into
			   this one: our loop owns the iteration boundary, so "end of tool
			   batch" and "before the next API call" are the same moment — the
			   top of this loop, before the request is built). The steer rides
			   the LAST tool-role message of the whole wire, byte-marker intact,
			   role alternation untouched. No tool message anywhere → put it
			   back; post-run the leftover becomes the next user turn. */
			const steerText = this.inbox.drain();
			if (steerText) {
				const wire = [...history, ...produced];
				let injected = false;
				for (let si = wire.length - 1; si >= 0; si--) {
					const sm = wire[si];
					if (sm.role === "tool" && typeof sm.content === "string") {
						const marker = formatSteerMarker(steerText);
						sm.content += marker;
						events.onSteerApplied?.(sm.tool_call_id, marker);
						log({
							type: "inject",
							step: iterations,
							source: "user",
							callId: sm.tool_call_id,
							text: marker,
						});
						injected = true;
						break;
					}
				}
				if (!injected) this.inbox.restore(steerText);
			}

			/* MoA facade (one prepareIteration per API call, official create()):
			   advisor fan-out rides the cadence, guidance attaches to a CLONE
			   (the persisted wire never carries it), and the acting connection
			   is the preset's aggregator slot — a FRESH conn object per call so
			   a failover swap can never corrupt the facade's base slot. */
			let callWire: ChatMessage[] = [...history, ...produced];
			let callConn = conn;
			if (this.moa) {
				const prep = await this.moa.prepareIteration(callWire);
				callWire = prep.wire;
				callConn = { provider: prep.provider, model: prep.model };
				if (events.signal?.aborted) {
					aborted = true;
					break;
				}
			}

			const result = await this.requestWithResilience(
				callConn,
				fallbacks,
				failoverFlag,
				callWire,
				schemas.length > 0 ? schemas : null,
				events,
				iterations
			);

			if (result.usage) events.onUsage?.(result.usage);
			finishReason = result.finishReason ?? null;

			const assistantMsg: ChatMessage = {
				role: "assistant",
				content: result.content || null,
				tool_calls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
			};
			produced.push(assistantMsg);
			log({
				type: "assistant/message",
				step: iterations,
				source: "assistant",
				text: messageContentPreview(result.content),
				images: countContentImages(result.content),
			});

			if (result.toolCalls.length === 0) {
				log({ type: "step/end", step: iterations, source: "assistant", status: "done" });
				break; // model is done
			}

			for (const call of result.toolCalls) {
				events.onToolStart?.(call.id, call.function.name, call.function.arguments);
				log({
					type: "tool/call",
					step: iterations,
					source: "tool",
					name: call.function.name,
					callId: call.id,
					text: call.function.arguments,
				});
				const toolMsg = await this.executeTool(call.id, call.function.name, call.function.arguments, events);
				produced.push(toolMsg);
				const status =
					typeof toolMsg.content === "string" && toolMsg.content.startsWith("The user denied")
						? "denied"
						: typeof toolMsg.content === "string" && toolMsg.content.startsWith("Error:")
							? "error"
							: "done";
				log({
					type: "tool/result",
					step: iterations,
					source: "tool",
					name: call.function.name,
					callId: call.id,
					status,
					text: messageContentPreview(toolMsg.content),
					images: countContentImages(toolMsg.content),
				});
				if (events.signal?.aborted) {
					aborted = true;
					break;
				}
			}
			if (aborted) {
				log({ type: "step/end", step: iterations, source: "assistant", status: "aborted" });
				break;
			}
			log({ type: "step/end", step: iterations, source: "assistant", status: "done" });
		}

		log({ type: "turn/end", source: "system", status: aborted ? "aborted" : "done" });

		return {
			messages: produced,
			iterations,
			aborted,
			finishReason,
			/* hard interrupt supersedes a pending steer (run_agent.py) — drop
			   it; otherwise hand the leftover back for next-turn delivery */
			pendingSteer: aborted ? (this.inbox.clear(), null) : this.inbox.drain(),
			events: sessionLog,
		};
	}
}
