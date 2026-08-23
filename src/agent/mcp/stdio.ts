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
	on: (ev: string, cb: (code: number | null) => void) => void;
	kill: (sig?: string) => void;
}

class StdioTransport implements McpTransport {
	private child: ChildLike | null = null;
	private buffer = "";
	private lineCb: ((line: string) => void) | null = null;

	constructor(
		private cp: { spawn: (cmd: string, args: string[], opts: Record<string, unknown>) => ChildLike },
		private command: string,
		private args: string[],
		private env: Record<string, string>,
	) {}

	start(): void {
		const child = this.cp.spawn(this.command, this.args, {
			env: this.env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.child = child;
		child.stdout.on("data", (chunk: Buffer | string) => this.feed(String(chunk)));
		child.stderr.on("data", () => {
			/* stderr is diagnostics, never protocol — deliberately ignored */
		});
		child.on("exit", () => {
			this.child = null;
		});
	}

	send(json: string): void {
		this.child?.stdin.write(json + "\n");
	}

	onLine(cb: (line: string) => void): void {
		this.lineCb = cb;
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
	}
}
