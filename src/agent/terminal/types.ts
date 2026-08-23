import type { PreparedToolCall } from "../tools";
import type { OpenAgentSettings } from "../../settings";
import type { WorkspacePolicy } from "../workspacePolicy";

export interface TerminalExecutionIdentity {
	kind: "interactive-chat";
	sessionId: string;
	runId: string;
}

export interface TerminalPrepareContext {
	settings: OpenAgentSettings;
	workspacePolicy: WorkspacePolicy;
	execution: TerminalExecutionIdentity;
	signal?: AbortSignal;
}

export interface TerminalCommandInput {
	command: unknown;
	cwd?: unknown;
	timeout_seconds?: unknown;
	background?: unknown;
}

export type ProcessAction = "list" | "poll" | "log" | "wait" | "kill";

export interface ProcessInput {
	action: unknown;
	process_id?: unknown;
	offset?: unknown;
	limit?: unknown;
	timeout_seconds?: unknown;
}

export interface TerminalHealth {
	ok: boolean;
	backend: "docker" | "local";
	message: string;
}

/** Narrow bridge injected only by the desktop plugin lifecycle. */
export interface TerminalApi {
	prepareTerminal(input: TerminalCommandInput, ctx: TerminalPrepareContext): Promise<PreparedToolCall>;
	prepareProcess(input: ProcessInput, ctx: TerminalPrepareContext): Promise<PreparedToolCall>;
	health(settings: OpenAgentSettings): Promise<TerminalHealth>;
	/** Shell dialect hint injected into the terminal tool schema (v0.1.173). */
	describeShell(settings: OpenAgentSettings): string;
	/** Stop owned work when any security-relevant setting changes. */
	reconcile(settings: OpenAgentSettings): Promise<void>;
	stopSession(sessionId: string): Promise<number>;
	stopAll(): Promise<number>;
	dispose(): Promise<void>;
}
