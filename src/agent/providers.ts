/**
 * Provider transport layer — OpenAI-compatible chat completions.
 *
 * Any provider with a `/chat/completions` endpoint works (Nous Portal,
 * OpenRouter, OpenAI, LM Studio, Ollama, custom gateways), matching
 * Hermes' "use any model you want" philosophy.
 *
 * Streaming uses `fetch` + SSE parsing; if the runtime blocks it, we
 * transparently fall back to a non-streaming `requestUrl` call.
 */

import { requestUrl } from "obsidian";
import { ChatMessage, TokenUsage, ToolCall } from "../types";
import { OpenAgentSettings, ProviderConfig } from "../settings";

export type StreamResetReason = "buffered-fallback";

export interface StreamCallbacks {
	onToken?: (text: string) => void;
	onReasoning?: (text: string) => void;
	/** Discard every callback emitted by this stream before accepting the
	    buffered replacement. The caller owns the actual UI checkpoint. */
	onReset?: (reason: StreamResetReason) => void;
	/** Fires as tool-call deltas stream in (name/args snapshot so far), so UIs
	    can show a live "preparing tool call" preview instead of dead air
	    between the end of reasoning and tool execution. */
	onToolCall?: (id: string, name: string, argsJson: string) => void;
	signal?: AbortSignal;
}

export interface StreamAttemptDiagnostics {
	dataEvents: number;
	malformedEvents: number;
	sawDone: boolean;
	sawFinishReason: boolean;
	/** Compatibility policy: accepted, but observable in debug diagnostics. */
	eofWithoutCompletion: boolean;
}

export interface StreamFallbackDiagnostics extends StreamAttemptDiagnostics {
	errorName: string;
	emittedCallbacks: boolean;
}

export interface StreamDiagnostics extends StreamAttemptDiagnostics {
	transport: "stream" | "buffered";
	/** Present when a successful buffered result replaced an anomalous stream. */
	fallbackFrom?: StreamFallbackDiagnostics;
}

export interface CompletionResult {
	content: string;
	reasoning: string;
	toolCalls: ToolCall[];
	usage: TokenUsage | null;
	finishReason: string;
	diagnostics: StreamDiagnostics;
}

/** HTTP error with the status preserved — drives retry/failover decisions. */
export class ProviderHttpError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
		this.name = "ProviderHttpError";
	}
}

/**
 * Request exceeded requestTimeoutMs (or a hard cap on metadata calls).
 * Distinct from HTTP errors so the resilience layer retries conservatively
 * instead of mistaking a hang for a definitive server answer.
 */
export class ProviderTimeoutError extends Error {
	constructor(public readonly timeoutMs: number) {
		super(
			`Request timed out after ${Math.round(timeoutMs / 1000)}s — the provider is slow or unreachable (see requestTimeoutMs in settings).`
		);
		this.name = "ProviderTimeoutError";
	}
}

/** Invalid SSE JSON makes a streamed answer incomplete; never commit holes. */
export class ProviderStreamProtocolError extends Error {
	constructor(
		public readonly malformedEvents: number,
		public readonly streamDiagnostics?: StreamAttemptDiagnostics
	) {
		super(`Provider stream contained ${malformedEvents} malformed SSE data event${malformedEvents === 1 ? "" : "s"}.`);
		this.name = "ProviderStreamProtocolError";
	}
}

/** A body/read/parser transport failure carrying metadata only, never data payloads. */
export class ProviderStreamTransportError extends Error {
	constructor(
		err: unknown,
		public readonly streamDiagnostics: StreamAttemptDiagnostics
	) {
		super(err instanceof Error ? err.message : String(err));
		this.name = "ProviderStreamTransportError";
	}
}

/**
 * Raw transport errors coming up Electron's net stack are cryptic
 * ("Error: net::ERR_CONNECTION_REFUSED") and don't even say WHICH
 * provider/host failed — so after a failover chain the user sees the
 * last leg's error with no idea which provider it belonged to.
 * Map them to actionable messages that name the provider and base URL
 * (chat error, Notice, failover reason all inherit this).
 */
export function friendlyTransportError(err: unknown, provider: ProviderConfig): Error {
	const raw = err instanceof Error ? err.message : String(err);
	const at = `${provider.name} at ${provider.baseUrl.replace(/\/+$/, "")}`;
	const startHint =
		provider.id === "ollama"
			? " Start Ollama first (e.g. `ollama serve`) and pull a model."
			: provider.id === "lmstudio"
				? " Start the local server in LM Studio (Developer → Start Server)."
				: "";
	let msg: string | null = null;
	if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/i.test(raw)) {
		msg = `Cannot reach ${at} — connection refused. Is the server running?${startHint}`;
	} else if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|ERR_ADDRESS_UNREACHABLE/i.test(raw)) {
		msg = `Cannot resolve host for ${at} — check the base URL.`;
	} else if (/ERR_TIMED_OUT|ETIMEDOUT/i.test(raw)) {
		msg = `Connection to ${at} timed out — the server or network is not responding.`;
	} else if (/ERR_CERT|ERR_SSL|SSL/i.test(raw)) {
		msg = `TLS/certificate problem reaching ${at}.`;
	}
	if (!msg) return err instanceof Error ? err : new Error(raw);
	const out = new Error(`${msg} (${raw.slice(0, 80)})`);
	out.name = "ProviderTransportError";
	return out;
}

/** Model-catalogue calls shouldn't wait minutes — settings UIs need fast feedback. */
const MODELS_TIMEOUT_MS = 30_000;

/** v0.1.152 (latency): embedding recall runs on the BLOCKING path — the chat
 *  request is not sent until it settles. A stalled embedding server therefore
 *  buys 30s of dead air before the user sees anything, so semantic recall gets
 *  its own tight budget: past it we give up and fall back to keyword recall,
 *  which is a ranking downgrade, not a lost feature. */
const EMBED_TIMEOUT_MS = 5_000;

/* Small FNV-1a hash (hex) — enough entropy for tool-call id suffixes. */
function fnv1a(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

/**
 * Providers that omit tool-call ids would otherwise get Date.now() ids —
 * unstable across replays of the same conversation, which quietly busts
 * prefix caches (the history bytes change) and makes histories harder to
 * diff. Deriving from message count + call index + tool name keeps ids
 * unique per iteration while staying deterministic for identical runs.
 */
export function deterministicToolCallId(msgCount: number, idx: number, name: string): string {
	return `call_${msgCount}_${idx}_${fnv1a(name)}`;
}

/**
 * requestUrl has no timeout/abort support — race it against a timer so a
 * hung TCP connection unblocks the caller. The underlying request still
 * completes in the background; its late result is simply discarded.
 */
function requestUrlWithTimeout(
	params: Parameters<typeof requestUrl>[0],
	timeoutMs: number,
	provider?: ProviderConfig
) {
	return new Promise<Awaited<ReturnType<typeof requestUrl>>>((resolve, reject) => {
		const timer = window.setTimeout(() => reject(new ProviderTimeoutError(timeoutMs)), timeoutMs);
		requestUrl(params).then(
			(resp) => {
				window.clearTimeout(timer);
				resolve(resp);
			},
			(err: unknown) => {
				window.clearTimeout(timer);
				/* requestUrl goes through Electron's net stack — its errors are
				   definitive (no CORS ambiguity like fetch), so they're safe
				   to normalize into actionable messages */
				reject(
					provider
						? friendlyTransportError(err, provider)
						: err instanceof Error
							? err
							: new Error(String(err))
				);
			}
		);
	});
}

function headers(provider: ProviderConfig, streaming: boolean): Record<string, string> {
	const h: Record<string, string> = {
		"Content-Type": "application/json",
		...provider.customHeaders,
	};
	if (provider.apiKey) h["Authorization"] = `Bearer ${provider.apiKey}`;
	if (provider.id === "openrouter") {
		h["HTTP-Referer"] = "https://obsidian.md";
		h["X-Title"] = "Open Agent for Obsidian";
	}
	if (streaming) h["Accept"] = "text/event-stream";
	return h;
}

function buildBody(
	provider: ProviderConfig,
	settings: OpenAgentSettings,
	messages: ChatMessage[],
	tools: unknown[] | null,
	stream: boolean
): string {
	const body: Record<string, unknown> = {
		model: settings.model,
		messages,
		stream,
	};
	if (tools && tools.length > 0) {
		body.tools = tools;
		body.tool_choice = "auto";
	}
	if (settings.maxTokens > 0) body.max_tokens = settings.maxTokens;
	if (settings.temperature >= 0) body.temperature = settings.temperature;

	// Reasoning effort ladder (Hermes): send in the dialects providers understand.
	if (settings.reasoningEffort && settings.reasoningEffort !== "none") {
		const effort = settings.reasoningEffort;
		if (provider.id === "openrouter") {
			body.reasoning = { effort };
		} else if (provider.id === "openai" || provider.id === "custom" || provider.id === "nous-portal") {
			body.reasoning_effort = effort;
		}
	}
	// OpenAI-only; llama.cpp / LM Studio / Ollama reject or mishandle it.
	if (stream && (provider.id === "openai" || provider.id === "openrouter" || provider.id === "nous-portal")) {
		body.stream_options = { include_usage: true };
	}
	return JSON.stringify(body);
}

/** OpenAI-compat content may be a string OR an array of parts
 *  (`[{type:"text", text:"…"}]`). Treating only strings as tokens leaves
 *  Gemini/Claude-via-gateway replies invisible in the chat. */
export function textFromMessageContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	let out = "";
	for (const part of content) {
		if (typeof part === "string") out += part;
		else if (part && typeof part === "object") {
			const rec = part as Record<string, unknown>;
			if (typeof rec.text === "string") out += rec.text;
			else if (rec.type === "text" && typeof rec.content === "string") out += rec.content;
		}
	}
	return out;
}

function describeHttpError(status: number, body: string): string {
	const slice = body.slice(0, 400);
	try {
		const parsed = JSON.parse(body) as { error?: { message?: string; type?: string; n_prompt_tokens?: number; n_ctx?: number } };
		const e = parsed?.error;
		if (e && (e.type === "exceed_context_size_error" || /exceeds the available context/i.test(e.message ?? ""))) {
			const used = e.n_prompt_tokens;
			const ctx = e.n_ctx;
			const span = used && ctx ? ` (${used} tokens into a ${ctx}-token window)` : "";
			return `Prompt is larger than the model's context window${span}. Shorten the system prompt / tools, raise LM Studio context length, or turn on context compression.`;
		}
		if (typeof e?.message === "string" && e.message.trim()) return `HTTP ${status}: ${e.message}`;
	} catch {
		/* raw body */
	}
	return `HTTP ${status}: ${slice}`;
}

function normalizeUsage(u: any): TokenUsage | null {
	if (!u) return null;
	return {
		promptTokens: u.prompt_tokens ?? 0,
		completionTokens: u.completion_tokens ?? 0,
		totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
	};
}

/** Fetch the provider's model catalogue (GET /models). */
export async function listModels(provider: ProviderConfig): Promise<string[]> {
	const url = provider.baseUrl.replace(/\/+$/, "") + "/models";
	const resp = await requestUrlWithTimeout(
		{
			url,
			method: "GET",
			headers: headers(provider, false),
			throw: true,
		},
		MODELS_TIMEOUT_MS,
		provider
	);
	const data = resp.json;
	if (!data || !Array.isArray(data.data)) return [];
	return data.data
		.map((m: any) => m?.id)
		.filter((x: any) => typeof x === "string")
		.sort();
}

/* ------------------------- vision capability ------------------------- */

export interface ModelInfo {
	id: string;
	/** true when the provider advertises image input (OpenRouter modality) */
	vision?: boolean;
	/** advertised context window in tokens (OpenRouter context_length, …) */
	contextLength?: number;
}

const visionCache = new Map<string, boolean>();

/** hard-set the cache — used when a 400 tells us the model rejected images */
export function cacheVisionSupport(providerId: string, model: string, supported: boolean): void {
	visionCache.set(`${providerId}|${model}`, supported);
}

/** name-based fallback when /models carries no modality metadata (LM Studio, …) */
export function visionHeuristic(modelId: string): boolean {
	return /(gpt-4o|gpt-4\.1|gpt-5|o4-|gemini|claude-3|claude-4|claude-sonnet|llava|pixtral|minicpm-v|moondream|glm-4v|-vision\b|[-_]vl\b|qwen\d*(\.\d+)?-vl|gemma-[34]|e4b)/i.test(
		modelId
	);
}

/** pull vision capability out of one /models entry (OpenRouter: architecture.modality "text+image->text") */
export function parseModelInfo(entry: unknown): ModelInfo | null {
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
	const e = entry as Record<string, unknown>;
	const id = typeof e.id === "string" ? e.id : null;
	if (!id) return null;
	/* context window metadata when advertised (OpenRouter context_length;
	   some servers: context_window / max_context_length) */
	const ctx = e.context_length ?? e.context_window ?? e.max_context_length;
	const contextLength = typeof ctx === "number" && Number.isFinite(ctx) && ctx > 0 ? Math.floor(ctx) : undefined;
	const arch = e.architecture as Record<string, unknown> | undefined;
	const modality = typeof arch?.modality === "string" ? arch.modality : null;
	if (modality) return { id, vision: modality.split("->")[0].includes("image"), ...(contextLength ? { contextLength } : {}) };
	return contextLength ? { id, contextLength } : { id };
}

/** model catalogue with capability metadata when the provider offers it */
export async function listModelInfos(provider: ProviderConfig): Promise<ModelInfo[]> {
	const url = provider.baseUrl.replace(/\/+$/, "") + "/models";
	const resp = await requestUrlWithTimeout(
		{
			url,
			method: "GET",
			headers: headers(provider, false),
			throw: true,
		},
		MODELS_TIMEOUT_MS,
		provider
	);
	const data = resp.json;
	if (!data || !Array.isArray(data.data)) return [];
	return data.data
		.map(parseModelInfo)
		.filter((x: ModelInfo | null): x is ModelInfo => x !== null)
		.sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id));
}

/**
 * Can this provider+model accept image inputs? Provider metadata first
 * (OpenRouter modality), name heuristic otherwise. Cached per provider+model;
 * a 400 rejection flips the cache via cacheVisionSupport.
 */
export async function modelSupportsVision(provider: ProviderConfig, model: string): Promise<boolean> {
	const key = `${provider.id}|${model}`;
	const cached = visionCache.get(key);
	if (cached !== undefined) return cached;
	let supported: boolean;
	try {
		const infos = await listModelInfos(provider);
		const meta = infos.find((i) => i.id === model);
		supported = meta?.vision ?? visionHeuristic(model);
	} catch {
		supported = visionHeuristic(model); // catalogue unreachable — guess by name
	}
	visionCache.set(key, supported);
	return supported;
}

const contextLengthCache = new Map<string, number | null>();

/** LM Studio server root for native /api/v1 endpoints (Hermes
 *  model_metadata._lmstudio_server_root parity): the configured base URL has
 *  its /v1 (or /api/v1, /api) suffix stripped so the native API is reachable. */
function lmStudioServerRoot(baseUrl: string): string {
	const root = baseUrl.trim().replace(/\/+$/, "");
	for (const suffix of ["/api/v1", "/api", "/v1"]) {
		if (root.endsWith(suffix)) return root.slice(0, -suffix.length).replace(/\/+$/, "");
	}
	return root;
}

/** Hermes _model_id_matches parity: exact, or "publisher/slug" matches the
 *  configured bare "slug" (LM Studio stores models as publisher/slug). */
function modelIdMatches(candidateId: string, lookupModel: string): boolean {
	if (candidateId === lookupModel) return true;
	const slash = candidateId.lastIndexOf("/");
	return slash >= 0 && candidateId.slice(slash + 1) === lookupModel;
}

/** LM Studio native probe (Hermes _query_local_context_length_uncached parity):
 *  the OpenAI-compat /v1/models carries NO context window, but the native
 *  /api/v1/models reports loaded_instances[].config.context_length — the
 *  RUNTIME value the user actually set. Slug-fuzzy id matching. */
async function fetchLmStudioContextLength(provider: ProviderConfig, model: string): Promise<number | null> {
	const root = lmStudioServerRoot(provider.baseUrl);
	if (!root) return null;
	const resp = await requestUrlWithTimeout(
		{ url: `${root}/api/v1/models`, method: "GET", headers: headers(provider, false), throw: true },
		MODELS_TIMEOUT_MS,
		provider
	);
	const data = resp.json;
	if (!data || typeof data !== "object" || Array.isArray(data)) return null;
	const rec = data as Record<string, unknown>;
	const list = Array.isArray(rec.data) ? rec.data : Array.isArray(rec.models) ? rec.models : null;
	if (!list) return null;
	for (const raw of list) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
		const m = raw as Record<string, unknown>;
		const id = typeof m.id === "string" ? m.id : "";
		const keyId = typeof m.key === "string" ? m.key : "";
		if (!modelIdMatches(id, model) && !modelIdMatches(keyId, model)) continue;
		/* runtime value first: the loaded instance's config.context_length */
		const insts = m.loaded_instances;
		if (Array.isArray(insts)) {
			for (const inst of insts) {
				const cfg = inst && typeof inst === "object" ? (inst as Record<string, unknown>).config : null;
				const ctx = cfg && typeof cfg === "object" ? (cfg as Record<string, unknown>).context_length : null;
				if (typeof ctx === "number" && Number.isFinite(ctx) && ctx > 0) return Math.floor(ctx);
			}
		}
		const maxCtx = m.max_context_length;
		if (typeof maxCtx === "number" && Number.isFinite(maxCtx) && maxCtx > 0) return Math.floor(maxCtx);
		return null;
	}
	return null;
}

/**
 * Provider-advertised context window for one model (context compression's
 * "auto" source, v0.1.17). null when the provider doesn't advertise it or the
 * catalog is unreachable — never throws. Cached per provider+model.
 */
export async function fetchAdvertisedContextLength(provider: ProviderConfig, model: string): Promise<number | null> {
	const key = `${provider.id}|${model}`;
	if (contextLengthCache.has(key)) return contextLengthCache.get(key) ?? null;
	let len: number | null = null;
	try {
		const infos = await listModelInfos(provider);
		len = infos.find((i) => i.id === model)?.contextLength ?? null;
	} catch {
		len = null; // catalogue unreachable — try the native probe, else default
	}
	/* v0.1.174 (owner: "context length 131072 dari LM Studio tidak kebaca"):
	   LM Studio's OpenAI-compat /models omits the context window — the native
	   /api/v1/models carries it (loaded_instances[].config.context_length). */
	if (len === null) {
		try {
			len = await fetchLmStudioContextLength(provider, model);
		} catch {
			len = null;
		}
	}
	contextLengthCache.set(key, len);
	return len;
}

/** v0.1.178 (Fase 3): OpenAI-compat `/v1/embeddings` — semantic recall.
 *  Returns one vector per input (null for a missing entry), or null on any
 *  transport/parse failure. Never throws — semantic recall is a boost, not a
 *  requirement. */
export async function embedTexts(
	provider: ProviderConfig,
	model: string,
	texts: string[]
): Promise<(number[] | null)[] | null> {
	if (!provider?.baseUrl.trim() || !model.trim() || texts.length === 0) return null;
	try {
		const url = provider.baseUrl.replace(/\/+$/, "") + "/embeddings";
		const resp = await requestUrlWithTimeout(
			{
				url,
				method: "POST",
				headers: headers(provider, false),
				body: JSON.stringify({ model, input: texts }),
				throw: true,
			},
			EMBED_TIMEOUT_MS,
			provider
		);
		const data = resp.json as { data?: unknown } | null;
		const list = data && typeof data === "object" ? data.data : null;
		if (!Array.isArray(list)) return null;
		return list.map((e) => {
			const emb = e && typeof e === "object" ? (e as { embedding?: unknown }).embedding : null;
			return Array.isArray(emb) && emb.length > 0 && emb.every((x) => typeof x === "number")
				? (emb as number[])
				: null;
		});
	} catch {
		return null;
	}
}

/**
 * Run a chat completion. Tries streaming first (when enabled); falls back
 * to a buffered requestUrl round-trip on any streaming failure. The
 * buffered path also emits onReasoning/onToken (single-shot). If a generic
 * stream failure occurs after callbacks, onReset first rolls the caller
 * back to its checkpoint, then the complete buffered answer is emitted once.
 */
export async function chatCompletion(
	provider: ProviderConfig,
	settings: OpenAgentSettings,
	messages: ChatMessage[],
	tools: unknown[] | null,
	cb: StreamCallbacks = {}
): Promise<CompletionResult> {
	let emitted = false;
	const tracked: StreamCallbacks = {
		onToken: (t) => {
			emitted = true;
			cb.onToken?.(t);
		},
		onReasoning: (t) => {
			emitted = true;
			cb.onReasoning?.(t);
		},
		onReset: cb.onReset,
		onToolCall: (id, name, args) => {
			emitted = true;
			cb.onToolCall?.(id, name, args);
		},
		signal: cb.signal,
	};
	if (settings.streaming) {
		try {
			const streamed = await streamingCompletion(provider, settings, messages, tools, tracked);
			const empty =
				!streamed.content.trim() &&
				!streamed.reasoning.trim() &&
				streamed.toolCalls.length === 0;
			if (empty) {
				throw new ProviderStreamTransportError(
					new Error("stream completed with no content"),
					streamed.diagnostics
				);
			}
			return streamed;
		} catch (err) {
			if (cb.signal?.aborted) throw err;
			// An HTTP status travels with the error — a buffered retry would hit
			// the same status, so surface it directly for the resilience layer.
			if (err instanceof ProviderHttpError) throw err;
			// A timeout aborts the stream — falling into the buffered path would
			// just hang again. Surface it; resilience decides on a fresh retry.
			if (err instanceof ProviderTimeoutError) throw err;
			const attemptDiagnostics =
				err instanceof ProviderStreamProtocolError || err instanceof ProviderStreamTransportError
					? err.streamDiagnostics
					: undefined;
			const fallbackFrom: StreamFallbackDiagnostics = {
				errorName: err instanceof Error ? err.name : "unknown",
				emittedCallbacks: emitted,
				dataEvents: attemptDiagnostics?.dataEvents ?? 0,
				malformedEvents: attemptDiagnostics?.malformedEvents ?? 0,
				sawDone: attemptDiagnostics?.sawDone ?? false,
				sawFinishReason: attemptDiagnostics?.sawFinishReason ?? false,
				eofWithoutCompletion: attemptDiagnostics?.eofWithoutCompletion ?? true,
			};
			if (settings.debugMode) {
				console.warn("[Open Agent] stream fallback", { providerId: provider.id, ...fallbackFrom });
			}
			if (emitted) cb.onReset?.("buffered-fallback");
			return bufferedCompletion(provider, settings, messages, tools, tracked, fallbackFrom);
		}
	}
	return bufferedCompletion(provider, settings, messages, tools, tracked);
}

async function bufferedCompletion(
	provider: ProviderConfig,
	settings: OpenAgentSettings,
	messages: ChatMessage[],
	tools: unknown[] | null,
	cb: StreamCallbacks | null = null,
	fallbackFrom?: StreamFallbackDiagnostics
): Promise<CompletionResult> {
	const url = provider.baseUrl.replace(/\/+$/, "") + "/chat/completions";
	const resp = await requestUrlWithTimeout(
		{
			url,
			method: "POST",
			headers: headers(provider, false),
			body: buildBody(provider, settings, messages, tools, false),
			throw: false,
		},
		settings.requestTimeoutMs || 120000,
		provider
	);
	if (resp.status >= 400) {
		throw new ProviderHttpError(resp.status, describeHttpError(resp.status, resp.text ?? ""));
	}
	const data = resp.json;
	const choice = data?.choices?.[0];
	const msg = choice?.message ?? {};
	const reasoning =
		(typeof msg.reasoning_content === "string" ? msg.reasoning_content : "") ||
		(typeof msg.reasoning === "string" ? msg.reasoning : "") ||
		textFromMessageContent(msg.reasoning_content ?? msg.reasoning);
	let content = textFromMessageContent(msg.content);
	// Gemma 4 / llama.cpp: all tokens in reasoning_content, content empty.
	if (!content.trim() && reasoning.trim()) content = reasoning;
	// Single-shot emission so event-driven UIs (chat) show the full reply
	// even when streaming was off or the stream failed before any token.
	if (cb && reasoning) cb.onReasoning?.(reasoning);
	if (cb && content) cb.onToken?.(content);
	return {
		content,
		reasoning,
		toolCalls: ((msg.tool_calls ?? []) as ToolCall[]).map((tc, i) => ({
		...tc,
		id: tc.id ?? deterministicToolCallId(messages.length, i, tc.function?.name ?? ""),
	})),
		usage: normalizeUsage(data.usage),
		finishReason: choice?.finish_reason ?? "stop",
		diagnostics: {
			transport: "buffered",
			dataEvents: 1,
			malformedEvents: 0,
			sawDone: false,
			sawFinishReason: typeof choice?.finish_reason === "string",
			eofWithoutCompletion: false,
			...(fallbackFrom ? { fallbackFrom } : {}),
		},
	};
}

async function streamingCompletion(
	provider: ProviderConfig,
	settings: OpenAgentSettings,
	messages: ChatMessage[],
	tools: unknown[] | null,
	cb: StreamCallbacks
): Promise<CompletionResult> {
	const url = provider.baseUrl.replace(/\/+$/, "") + "/chat/completions";
	const timeout = settings.requestTimeoutMs || 120000;
	/* Idle-timeout abort: the timer re-arms on every received chunk, so a
	   long-but-healthy stream (slow reasoning) is never cut off — only a
	   genuinely stalled connection trips it. The caller's stop signal is
	   chained into the same controller. */
	const ctl = new AbortController();
	const onCallerAbort = () => ctl.abort();
	if (cb.signal) {
		if (cb.signal.aborted) ctl.abort();
		else cb.signal.addEventListener("abort", onCallerAbort, { once: true });
	}
	let timedOut = false;
	let timer = 0;
	/* Held so the finally block can cancel an in-flight read; see the teardown
	   comment there. */
	let activeReader: { cancel: () => Promise<void> } | null = null;
	const armTimer = () => {
		if (timer) window.clearTimeout(timer);
		timer = window.setTimeout(() => {
			timedOut = true;
			ctl.abort();
		}, timeout);
	};
	armTimer();

	/* Kept outside the try so a thrown read/protocol failure can carry its
	   metadata into a successful buffered replacement. */
	let sawDone = false;
	let sawFinishReason = false;
	let dataEvents = 0;
	let malformedEvents = 0;
	const attemptDiagnostics = (): StreamAttemptDiagnostics => ({
		dataEvents,
		malformedEvents,
		sawDone,
		sawFinishReason,
		eofWithoutCompletion: !sawDone && !sawFinishReason,
	});

	try {
		const resp = await fetch(url, {
			method: "POST",
			headers: headers(provider, true),
			body: buildBody(provider, settings, messages, tools, true),
			signal: ctl.signal,
		});
		if (!resp.ok) {
			const errText = await resp.text().catch(() => "");
			throw new ProviderHttpError(resp.status, describeHttpError(resp.status, errText));
		}
		if (!resp.body) {
			throw new ProviderStreamTransportError(new Error("streaming response had no body"), attemptDiagnostics());
		}

		const reader = resp.body.getReader();
		activeReader = reader;
		const decoder = new TextDecoder();
		let buffer = "";
		let content = "";
		let reasoning = "";
		let usage: TokenUsage | null = null;
		let finishReason = "stop";
		const toolMap = new Map<number, ToolCall>();

		const handleLine = (line: string): boolean => {
			const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
			if (!normalized.startsWith("data:")) return false;
			const payload = normalized.slice(5).trim();
			dataEvents++;
			if (payload === "[DONE]") {
				sawDone = true;
				return true;
			}
			let json: any;
			try {
				json = JSON.parse(payload);
			} catch {
				malformedEvents++;
				return false;
			}
			/* `data: null` / `data: 7` parse fine but are not SSE frames. Reading
			   .usage off null threw a raw TypeError out of the read loop, bypassing
			   the ProviderStreamProtocolError path built for exactly this case. */
			if (!json || typeof json !== "object" || Array.isArray(json)) {
				malformedEvents++;
				return false;
			}
			if (json.usage) usage = normalizeUsage(json.usage);
			const choice = json.choices?.[0];
			if (!choice) return false;
			if (choice.finish_reason) {
				finishReason = choice.finish_reason;
				sawFinishReason = true;
			}
			if (json.error) {
				const errObj = json.error;
				const errMsg =
					typeof errObj === "string"
						? errObj
						: typeof errObj?.message === "string"
							? errObj.message
							: JSON.stringify(errObj).slice(0, 300);
				throw new ProviderHttpError(
					typeof errObj?.code === "number" ? errObj.code : 400,
					errMsg
				);
			}
			const delta = choice.delta ?? choice.message ?? {};
			const token =
				textFromMessageContent(delta.content) ||
				(typeof delta.text === "string" ? delta.text : "") ||
				(typeof choice.text === "string" ? choice.text : "");
			if (token.length > 0) {
				content += token;
				cb.onToken?.(token);
			}
			const rcRaw = delta.reasoning_content ?? delta.reasoning;
			const rc = typeof rcRaw === "string" ? rcRaw : textFromMessageContent(rcRaw);
			if (rc.length > 0) {
				reasoning += rc;
				cb.onReasoning?.(rc);
			}
			if (Array.isArray(delta.tool_calls)) {
				for (const tc of delta.tool_calls) {
					const idx = tc.index ?? 0;
					const existing = toolMap.get(idx) ?? {
						id: tc.id ?? deterministicToolCallId(messages.length, idx, tc.function?.name ?? ""),
						type: "function" as const,
						function: { name: "", arguments: "" },
					};
					if (tc.id) existing.id = tc.id;
					if (tc.function?.name) existing.function.name += tc.function.name;
					if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
					toolMap.set(idx, existing);
					if (existing.function.name) cb.onToolCall?.(existing.id, existing.function.name, existing.function.arguments);
				}
			}
			return false;
		};

		let done = false;
		while (!done) {
			const { done: readerDone, value } = await reader.read();
			if (readerDone) {
				/* Flush a possible split UTF-8 code point before processing the
				   final SSE line (which need not end in a newline). */
				buffer += decoder.decode();
				break;
			}
			armTimer(); // traffic received → the connection is alive, reset the idle budget
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (handleLine(line)) {
					done = true;
					break; // deterministic policy: [DONE] terminates; trailing data is ignored
				}
			}
		}
		if (!done && buffer.length > 0) {
			for (const line of buffer.split("\n")) {
				if (handleLine(line)) break;
			}
		}
		if (malformedEvents > 0) throw new ProviderStreamProtocolError(malformedEvents, attemptDiagnostics());
		/* Gemma 4 on LM Studio/llama.cpp often streams only reasoning_content
		   (content stays ""). Promote it so the chat bubble is not blank. */
		if (!content.trim() && reasoning.trim()) {
			content = reasoning;
			cb.onToken?.(reasoning);
		}
		const eofWithoutCompletion = !sawDone && !sawFinishReason;
		if (settings.debugMode && (!sawDone || eofWithoutCompletion)) {
			/* Metadata only: never log token/content payloads. EOF without an
			   explicit signal is accepted for provider compatibility. */
			console.warn("[Open Agent] stream completion diagnostics", {
				providerId: provider.id,
				dataEvents,
				malformedEvents,
				sawDone,
				sawFinishReason,
				eofWithoutCompletion,
			});
		}

		return {
			content,
			reasoning,
			toolCalls: [...toolMap.entries()].sort((a, b) => a[0] - b[0]).map(([, tc]) => tc),
			usage,
			finishReason,
			diagnostics: {
				transport: "stream",
				dataEvents,
				malformedEvents,
				sawDone,
				sawFinishReason,
				eofWithoutCompletion,
			},
		};
	} catch (err) {
		if (timedOut) throw new ProviderTimeoutError(timeout);
		if (err instanceof ProviderHttpError || err instanceof ProviderStreamProtocolError) throw err;
		throw new ProviderStreamTransportError(err, attemptDiagnostics());
	} finally {
		if (timer) window.clearTimeout(timer);
		cb.signal?.removeEventListener("abort", onCallerAbort);
		/* Tear the wire down on EVERY exit path (v0.1.152). Clearing the timer
		   and dropping the listener above frees our own bookkeeping but leaves
		   the HTTP connection open and the body locked: a stream that ends in a
		   throw (protocol error, caller abort) would otherwise leak one socket
		   per failed reply for the life of the session. Cancelling the reader
		   first unlocks the body; abort() then closes the connection. Both are
		   best-effort — a stream already closed or errored rejects here, and
		   that must never mask the real error being propagated. */
		try {
			void activeReader?.cancel().catch(() => {});
		} catch {
			/* reader already released */
		}
		ctl.abort();
	}
}
