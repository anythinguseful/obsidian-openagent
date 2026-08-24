/**
 * MCP stdio transport — spawns the configured command and speaks newline-
 * delimited JSON-RPC over stdin/stdout.
 *
 * Desktop-only by construction: `child_process` is acquired LAZILY via
 * `globalThis.require` (the same pattern as terminal/cron-scripts), so this
 * module loads on mobile but never spawns anything. stdin is closed after the
 * handshake is unnecessary — actually MCP stdio keeps stdin open; we simply
 * never write anything but JSON lines.
 */

import type { McpTransport } from "./client";

export function stdioTransportFor(
	command: string,
	args: string[],
	env: Record<string, string>,
): McpTransport | null {
	const req = (globalThis as unknown as { require?: (id: string) => any }).require;
	if (typeof req !== "function") return null;
	let childProcess: { spawn: (cmd: string, args: string[], opts: Record<string, unknown>) => ChildLike };
	try {
		childProcess = req("child_process") as typeof childProcess;
	} catch {
		return null;
	}
	return new StdioTransport(childProcess, command, args, env);
}

interface ChildLike {
	stdin: { write: (d: string) => void; end: () => void };
	stdout: { on: (ev: string, cb: (d: Buffer | string) => void) => void };
	stderr: { on: (ev: string, cb: (d: Buffer | string) => void) => void };
	on: (ev: string, cb: (arg: never) => void) => void;
	kill: (sig?: string) => void;
}

/**
 * Hard ceiling on unparsed stdout held in memory (v0.1.152). A well-behaved
 * MCP server emits newline-delimited JSON, so the buffer only ever holds one
 * partial line; a server that streams without newlines would otherwise grow it
 * without bound for as long as the plugin stays loaded. terminal/service.ts
 * caps its child output the same way.
 */
export const MCP_STDIO_MAX_BUFFER = 8 * 1024 * 1024;

class StdioTransport implements McpTransport {
	private child: ChildLike | null = null;
	private buffer = "";
	private lineCb: ((line: string) => void) | null = null;
	private errorCb: ((err: Error) => void) | null = null;

	constructor(
		private cp: { spawn: (cmd: string, args: string[], opts: Record<string, unknown>) => ChildLike },
		private command: string,
		private args: string[],
		private env: Record<string, string>,
	) {}

	start(): void {
		let child: ChildLike;
		try {
			child = this.cp.spawn(this.command, this.args, {
				env: this.env,
				stdio: ["pipe", "pipe", "pipe"],
			});
		} catch (err) {
			/* Some runtimes throw synchronously (EACCES on a non-executable
			   path). Report it on the same channel as the async failure so
			   callers have exactly one thing to handle. */
			this.fail(err);
			return;
		}
		this.child = child;
		/* MUST come before any other wiring: spawn reports an unusable command
		   through an ASYNCHRONOUS "error" event. With no listener, EventEmitter
		   promotes it to an uncaught exception that takes down the whole
		   Obsidian process — a try/catch at the caller cannot see it, because
		   the throw lands long after start() returned. */
		child.on("error", (err: never) => {
			this.child = null;
			this.fail(err);
		});
		child.stdout.on("data", (chunk: Buffer | string) => this.feed(String(chunk)));
		child.stderr.on("data", () => {
			/* stderr is diagnostics, never protocol — deliberately ignored */
		});
		child.on("exit", () => {
			this.child = null;
		});
	}

	send(json: string): void {
		try {
			this.child?.stdin.write(json + "\n");
		} catch (err) {
			/* EPIPE: the server died between our liveness check and the write. */
			this.fail(err);
		}
	}

	onLine(cb: (line: string) => void): void {
		this.lineCb = cb;
	}

	onError(cb: (err: Error) => void): void {
		this.errorCb = cb;
	}

	/** Test seam: how much unparsed stdout is currently held. */
	bufferLength(): number {
		return this.buffer.length;
	}

	private fail(err: unknown): void {
		this.errorCb?.(err instanceof Error ? err : new Error(String(err)));
	}

	close(): void {
		try {
			this.child?.stdin.end();
		} catch {
			/* already closed */
		}
		this.child?.kill();
		this.child = null;
	}

	private feed(text: string): void {
		this.buffer += text;
		let idx: number;
		while ((idx = this.buffer.indexOf("\n")) >= 0) {
			const line = this.buffer.slice(0, idx);
			this.buffer = this.buffer.slice(idx + 1);
			if (line.trim()) this.lineCb?.(line);
		}
		/* No newline in sight and the buffer is past the ceiling: this is not
		   framed JSON-RPC. Drop what we hold — keeping a prefix of a line we
		   can never complete only leaks memory. */
		if (this.buffer.length > MCP_STDIO_MAX_BUFFER) this.buffer = "";
	}
}
