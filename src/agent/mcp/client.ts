/**
 * MCP (Model Context Protocol) client — JSON-RPC 2.0 over a transport.
 *
 * Pure and transport-agnostic: the transport is injected, so the whole
 * handshake/discovery/call flow is unit-testable with an in-memory fake. The
 * plugin supplies a stdio transport (lazy child_process, desktop-only) in
 * stdio.ts.
 *
 * Protocol subset implemented (per the MCP spec):
 *   · initialize → notifications/initialized (handshake)
 *   · tools/list (cached)
 *   · tools/call (text content extracted, bounded)
 *
 * Security invariants live at the caller (timeout per call, output cap,
 * minimal env, consent gate) — this client only speaks the protocol.
 */

export interface McpTransport {
	start(): void;
	send(json: string): void;
	onLine(cb: (line: string) => void): void;
	/**
	 * Transport-level failure channel (v0.1.152). Optional so HTTP-style
	 * transports, whose failures already surface as rejected sends, need not
	 * implement it. The stdio transport MUST: `spawn()` reports an unusable
	 * command through an asynchronous "error" event, which is invisible to a
	 * try/catch around start() and would otherwise crash the process.
	 */
	onError?(cb: (err: Error) => void): void;
	close(): void;
}

export interface McpToolSchema {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

interface JsonRpcResponse {
	jsonrpc?: string;
	id?: number | string;
	result?: unknown;
	error?: { code?: number; message?: string };
}

export const MCP_TOOL_NAME_MAX = 200;
export const MCP_DEFAULT_TIMEOUT_MS = 30_000;
export const MCP_MAX_OUTPUT_CHARS = 100_000;

export class McpClient {
	private nextId = 1;
	private started = false;
	private pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
	private toolCache: McpToolSchema[] | null = null;
	/** Set once the transport reports a fatal error; makes later calls fail fast. */
	private deadReason: Error | null = null;

	constructor(
		private transport: McpTransport,
		private timeoutMs = MCP_DEFAULT_TIMEOUT_MS,
		private maxOutputChars = MCP_MAX_OUTPUT_CHARS,
	) {}

	start(): void {
		if (this.started) return;
		this.started = true;
		this.transport.onLine((line) => this.handleLine(line));
		/* A dead transport can never answer, so fail every in-flight request
		   NOW instead of making each one wait out its own timeout. */
		this.transport.onError?.((err) => this.failAll(err));
		this.transport.start();
	}

	/** Rejects every in-flight request with `err` and clears their timers. */
	private failAll(err: Error): void {
		this.deadReason = err;
		for (const [, p] of this.pending) {
			clearTimeout(p.timer);
			p.reject(err);
		}
		this.pending.clear();
	}

	/** initialize handshake (blocking until the server answers). */
	async initialize(): Promise<void> {
		await this.request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "openagent", version: "0.1.158" },
		});
		this.notify("notifications/initialized", {});
	}

	async listTools(): Promise<McpToolSchema[]> {
		if (this.toolCache) return this.toolCache;
		const result = (await this.request("tools/list", {})) as { tools?: McpToolSchema[] };
		this.toolCache = Array.isArray(result?.tools) ? result.tools : [];
		return this.toolCache;
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<string> {
		const result = (await this.request("tools/call", { name, arguments: args ?? {} })) as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
		const content = Array.isArray(result?.content) ? result.content : [];
		let text = "";
		for (const part of content) {
			if (part && typeof part.text === "string") text += part.text;
		}
		if (result?.isError === true) throw new Error(`MCP tool "${name}" reported an error.`);
		if (text.length > this.maxOutputChars) text = text.slice(0, this.maxOutputChars) + "\n…(truncated)";
		return text;
	}

	close(): void {
		this.failAll(new Error("MCP connection closed."));
		this.transport.close();
	}

	/* ------------------------------------------------------------------ */

	private request(method: string, params: unknown): Promise<unknown> {
		/* The transport already died — don't make the caller wait out a full
		   timeout for an answer that can never arrive. */
		if (this.deadReason) return Promise.reject(this.deadReason);
		const id = this.nextId++;
		this.send({ jsonrpc: "2.0", id, method, params });
		return new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`MCP request "${method}" timed out after ${this.timeoutMs}ms.`));
			}, this.timeoutMs);
			this.pending.set(id, { resolve, reject, timer });
		});
	}

	private notify(method: string, params: unknown): void {
		this.send({ jsonrpc: "2.0", method, params });
	}

	private send(message: unknown): void {
		this.transport.send(JSON.stringify(message));
	}

	private handleLine(line: string): void {
		const trimmed = line.trim();
		if (!trimmed) return;
		let msg: JsonRpcResponse;
		try {
			const parsed: unknown = JSON.parse(trimmed);
			/* `null` / `7` / `"hi"` / `[]` are valid JSON but not JSON-RPC frames,
			   so the catch above never fires for them. Reading .id off null threw
			   from inside a stdout "data" handler — asynchronous, so no caller
			   try/catch can see it and the whole process goes down. */
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
			msg = parsed as JsonRpcResponse;
		} catch {
			return; // ignore non-JSON noise on stdout
		}
		if (msg.id === undefined || msg.id === null) return; // notification — ignore
		const entry = this.pending.get(msg.id);
		if (!entry) return;
		this.pending.delete(msg.id);
		clearTimeout(entry.timer);
		if (msg.error) {
			entry.reject(new Error(msg.error.message ?? `MCP error ${msg.error.code ?? ""}`.trim()));
		} else {
			entry.resolve(msg.result);
		}
	}
}
