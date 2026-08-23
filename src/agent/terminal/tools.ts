import type { AgentTool, PreparedToolCall, ToolContext, ToolInteractive } from "../tools";
import type { ProcessInput, TerminalCommandInput, TerminalPrepareContext } from "./types";

function prepareContext(ctx: ToolContext, interactive?: ToolInteractive): TerminalPrepareContext {
	if (!ctx.terminal || !ctx.execution || ctx.execution.kind !== "interactive-chat") {
		throw new Error("Terminal & Processes are available only in an owned interactive desktop chat run.");
	}
	return {
		settings: ctx.settings,
		workspacePolicy: ctx.workspacePolicy,
		execution: ctx.execution,
		signal: interactive?.signal,
	};
}

const unavailable = async (): Promise<string> => {
	throw new Error("Terminal preparation was bypassed; execution refused.");
};

const terminalTool: AgentTool = {
	name: "terminal",
	description:
		"Run one non-interactive command in the configured desktop backend. Docker is disposable, network-off, and workspace-scoped. Background is Docker-only. Every start requires exact allow-once approval.",
	toolset: "terminal",
	dangerous: true,
	approvalKind: "destructive",
	allowAlways: false,
	parameters: {
		type: "object",
		properties: {
			command: { type: "string", description: "Exact shell command to run." },
			cwd: { type: "string", description: "Optional directory relative to the mounted Workspace." },
			timeout_seconds: { type: "number", description: "Bounded runtime timeout." },
			background: { type: "boolean", description: "Start an owned Docker background process." },
		},
		required: ["command"],
		additionalProperties: false,
	},
	async prepare(args, ctx, interactive): Promise<PreparedToolCall> {
		if (!ctx.terminal) throw new Error("Terminal runtime is not available on this platform.");
		return ctx.terminal.prepareTerminal(args as TerminalCommandInput, prepareContext(ctx, interactive));
	},
	execute: unavailable,
};

const processTool: AgentTool = {
	name: "process",
	description:
		"Inspect or stop Docker background processes owned by this chat session. Actions: list, poll, log, wait, kill. It cannot access another chat's processes.",
	toolset: "terminal",
	approvalKind: (args) => args.action === "kill" ? "destructive" : "standard",
	allowAlways: false,
	parameters: {
		type: "object",
		properties: {
			action: { type: "string", enum: ["list", "poll", "log", "wait", "kill"] },
			process_id: { type: "string" },
			offset: { type: "number", description: "Absolute output offset for log/poll." },
			limit: { type: "number", description: "Maximum returned output characters." },
			timeout_seconds: { type: "number", description: "Maximum wait duration." },
		},
		required: ["action"],
		additionalProperties: false,
	},
	async prepare(args, ctx, interactive): Promise<PreparedToolCall> {
		if (!ctx.terminal) throw new Error("Process runtime is not available on this platform.");
		return ctx.terminal.prepareProcess(args as ProcessInput, prepareContext(ctx, interactive));
	},
	execute: unavailable,
};

export const TERMINAL_TOOLS: AgentTool[] = [terminalTool, processTool];
