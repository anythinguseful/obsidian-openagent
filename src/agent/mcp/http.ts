/**
 * MCP Streamable HTTP transport — JSON-RPC 2.0 over a single POST endpoint.
 *
 * The MCP "Streamable HTTP" transport (spec 2025-03-26) is request/response:
 * the client sends one JSON-RPC message per POST and the server answers with
 * either `application/json` (a single message — or a batch array) or
 * `text/event-stream` (an SSE stream whose `data:` events each carry one
 * JSON-RPC message). Session continuity rides in the `Mcp-Session-Id` header
 * when the server issues one.
 *
 * Like stdio.ts, this module is transport-only and speaks the exact
 * `McpTransport` interface the `McpClient` already understands: each `send()`
 * becomes one POST, and the parsed response lines are fed back through
 * `onLine` just like stdio stdout lines. No Obsidian imports — the POST
 * primitive is injected (the plugin passes a `requestUrl` wrapper), so the
 * whole flow is unit-testable under plain node.
 *
 * POSTs are serialized on an internal chain so the session-id handshake stays
 * ordered and no response can interleave with a later request.
 */

import { MCP_DEFAULT_TIMEOUT_MS, type McpTransport } from "./client";

export const MCP_HTTP_ACCEPT = "application/json, text/event-stream";

export interface McpHttpResponse {
	status: number;
	/** Header names may be any case; read with {@link headerValue}. */
	headers: Record<string, string>;
	text: string;
}

/** Injected POST primitive — the plugin wraps Obsidian's `requestUrl`. */
export type McpHttpPost = (url: string, headers: Record<string, string>, body: string) => Promise<McpHttpResponse>;

/** Case-insensitive header lookup. */
export function headerValue(headers: Record<string, string>, name: string): string | null {
	for (const [k, v] of Object.entries(headers ?? {})) {
		if (k.toLowerCase() === name.toLowerCase()) return v;
	}
	return null;
}

/**
 * Merge `extra` over `base` case-insensitively (an `extra` key wins over any
 * base key with the same name regardless of casing — user headers must
 * override the client's defaults, e.g. `authorization` vs `Authorization`).
 */
export function mergeHttpHeaders(base: Record<string, string>, extra: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = { ...base };
	for (const [k, v] of Object.entries(extra ?? {})) {
		if (typeof v !== "string" || v === "") continue;
		for (const existing of Object.keys(out)) {
			if (existing.toLowerCase() === k.toLowerCase()) delete out[existing];
		}
		out[k] = v;
	}
	return out;
}

/** True for a bare http(s) URL — never for other schemes. */
export function isHttpUrl(url: string): boolean {
	return /^https?:\/\//i.test((url ?? "").trim());
}

/**
 * Parse an MCP Streamable-HTTP response body into JSON-RPC message lines.
 * Returns [] for an empty/notification-only body (e.g. `202 Accepted`).
 * Throws on a malformed non-empty body.
 */
export function parseMcpHttpBody(text: string, contentType: string | null): string[] {
	const ct = ((contentType ?? "").split(";")[0] ?? "").trim().toLowerCase();
	const body = text ?? "";
	if (ct === "text/event-stream") return parseSse(body);
	if (!body.trim()) return [];
	const parsed: unknown = JSON.parse(body);
	if (Array.isArray(parsed)) return parsed.map((m) => JSON.stringify(m));
	return [body.trim()];
}

/** Extract SSE `data:` payloads (one JSON-RPC message per event). */
export function parseSse(text: string): string[] {
	const out: string[] = [];
	for (const event of (text ?? "").split(/\r?\n\r?\n/)) {
		const data: string[] = [];
		for (const line of event.split(/\r?\n/)) {
			if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
		}
		if (data.length) out.push(data.join("\n"));
	}
	return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`MCP HTTP request timed out after ${ms}ms.`)), ms);
		p.then(
			(v) => {
				clearTimeout(timer);
				resolve(v);
			},
			(e) => {
				clearTimeout(timer);
				reject(e);
			},
		);
	});
}

function bodySnippet(text: string, max = 200): string {
	const t = (text ?? "").trim().slice(0, max);
	return t.length < (text ?? "").trim().length ? t + "…" : t;
}

export class HttpTransport implements McpTransport {
	private lineCb: ((line: string) => void) | null = null;
	private sessionId: string | null = null;
	private closed = false;
	private chain: Promise<void> = Promise.resolve();

	constructor(
		private url: string,
		private post: McpHttpPost,
		private userHeaders: Record<string, string> = {},
		private timeoutMs: number = MCP_DEFAULT_TIMEOUT_MS,
	) {}

	start(): void {
		/* Nothing to boot — `onLine` is registered by the client before `start()`. */
	}

	send(json: string): void {
		/* The chain only serializes POSTs — it must never carry a failure
		   forward. Without the `.catch` a single rejection (e.g. an `onLine`
		   consumer that throws) poisons `this.chain` permanently and every
		   later send() silently stops POSTing. Same idiom as PromptQueue. */
		this.chain = this.chain.catch(() => {}).then(() => this.roundTrip(json));
	}

	onLine(cb: (line: string) => void): void {
		this.lineCb = cb;
	}

	close(): void {
		this.closed = true;
		this.sessionId = null;
	}

	/* ------------------------------------------------------------------ */

	private async roundTrip(json: string): Promise<void> {
		if (this.closed) return;
		let reqId: number | string | null | undefined;
		try {
			reqId = (JSON.parse(json) as { id?: number | string | null }).id;
		} catch {
			return; // not a request we can ever answer — drop
		}
		const isNotification = reqId === undefined || reqId === null;

		let resp: McpHttpResponse;
		try {
			resp = await withTimeout(this.post(this.url, this.buildHeaders(), json), this.timeoutMs);
		} catch (err) {
			if (this.closed) return;
			this.fail(reqId, isNotification, err instanceof Error ? err.message : String(err));
			return;
		}
		if (this.closed) return;

		const sid = headerValue(resp.headers, "mcp-session-id");
		if (sid) this.sessionId = sid;

		if (resp.status < 200 || resp.status >= 300) {
			this.fail(reqId, isNotification, `HTTP ${resp.status}${resp.text ? `: ${bodySnippet(resp.text)}` : ""}`);
			return;
		}

		let lines: string[];
		try {
			lines = parseMcpHttpBody(resp.text, headerValue(resp.headers, "content-type"));
		} catch (err) {
			this.fail(reqId, isNotification, `unreadable response body: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}

		if (lines.length === 0 && !isNotification) {
			this.fail(reqId, false, "empty response body");
			return;
		}
		for (const line of lines) {
			if (this.closed) return;
			this.lineCb?.(line);
		}
	}

	private buildHeaders(): Record<string, string> {
		const base: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: MCP_HTTP_ACCEPT,
		};
		if (this.sessionId) base["Mcp-Session-Id"] = this.sessionId;
		return mergeHttpHeaders(base, this.userHeaders);
	}

	/** Feed a synthetic JSON-RPC error so the caller's pending request rejects
	 * immediately instead of hanging until the client's own timeout. */
	private fail(id: number | string | null | undefined, isNotification: boolean, message: string): void {
		if (isNotification) return; // nobody is waiting — nothing to feed
		this.lineCb?.(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } }));
	}
}
