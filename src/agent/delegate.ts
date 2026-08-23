/**
 * Delegation — bounded port of Hermes tools/delegate_tool.py (studied
 * byte-level 2026-08-09, gap-doc 🟡 #4; plan: docs/plans/hermes-delegation-plan).
 *
 * What made it through the budget (their semantics, verbatim where it counts):
 *   - single goal OR batch tasks[]; isolated child contexts; only the final
 *     summary returns to the parent
 *   - child system prompt: focused-subagent wording + tight-summary contract
 *   - explicit child capability ALLOWLIST: read/research/session-scratch only;
 *     no vault writes, memory/profile writes, skill lifecycle, scheduling,
 *     clarification UI, or nested delegation
 *   - concurrency default 3 per batch; one consolidated, index-sorted result
 *   - model-supplied max_iterations ignored (config authoritative)
 *   - summaries capped so they can't flood the parent's context
 *
 * Documented deviations (details in the plan doc):
 *   - SYNCHRONOUS within the parent turn (their depth>0 path is also sync);
 *     the background re-entry machine of the desktop app doesn't exist here.
 *     MoA proved parallel provider calls inside one turn work.
 *   - role:"orchestrator" and output_schema are REJECTED honestly in v1 —
 *     a half depth system and a half schema validator are worse than none.
 *   - no spawn-pause RPC (no equivalent surface in a plugin); the parent's
 *     abort signal reaches every child loop.
 */

import type { AgentTool } from "./tools";

/** Child capabilities are allowlisted rather than relying on each new tool
 * remembering a blocked flag. `web_extract` is intentionally excluded: its
 * truncation cache can write a note even though extraction appears read-only. */
export const DELEGATE_ALLOWED_TOOLS: readonly string[] = [
	"read_note",
	"list_files",
	"search_vault",
	"get_active_note",
	"search_memory",
	"list_skills",
	"view_skill",
	"vision_analyze",
	"todo",
];

/** Kept as an auditable inventory: these current built-ins must never reach a
 * child. The allowlist above remains authoritative when future tools appear. */
export const DELEGATE_BLOCKED_TOOLS: readonly string[] = [
	"write_note",
	"edit_note",
	"delete_note",
	"rename_move_note",
	"web_extract",
	"web_search",
	"session_search",
	"save_memory",
	"update_user_profile",
	"create_skill",
	"manage_skill",
	"cronjob",
	"terminal",
	"process",
	"delegate_task",
	"clarify",
];

/** Scheduled/headless agents may research and delegate, but the scheduler is
 * the sole writer of their final output. No direct persistent-state tools. */
export const HEADLESS_ALLOWED_TOOLS: readonly string[] = [...DELEGATE_ALLOWED_TOOLS, "delegate_task"];

/** their default max_concurrent_children (config default 3) */
export const DELEGATE_MAX_CONCURRENT = 3;
/** tighter than their 24000: chat context here is smaller; per-task cap */
export const DELEGATE_MAX_SUMMARY_CHARS = 8000;
const TRUNC = "\n… [summary truncated]";

export interface DelegateTaskSpec {
	goal: string;
	context?: string;
}

export interface DelegateResultEntry {
	task_index: number;
	status: "completed" | "error";
	summary: string;
	error?: string;
	duration_seconds: number;
}

export interface DelegateApi {
	/**
	 * Run one batch of isolated child loops and join them. The runner owns
	 * the child-construction details (explicit child capability allowlist,
	 * fresh context per child, no approval handler → auto-deny, ephemeral
	 * todo per child, parent abort signal shared).
	 */
	runBatch(tasks: DelegateTaskSpec[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<DelegateResultEntry[]>;
}

/** their _build_child_system_prompt (leaf role), wording preserved where the
   semantic weight lives: focused, self-contained task; summary is a PRODUCT
   returned to the parent — lead with outcomes, don't replay process. */
export function childSystemPrompt(goal: string, context?: string): string {
	const parts = [
		"You are a focused subagent working on a specific delegated task.",
		"",
		`YOUR TASK:\n${goal}`,
	];
	if (context && context.trim()) parts.push(`\nCONTEXT:\n${context}`);
	parts.push(
		"\nComplete this task using the tools available to you. " +
			"When finished, provide a clear, concise summary of:\n" +
			"- What you did\n" +
			"- What you found or accomplished\n" +
			"- Any files you created or modified\n" +
			"- Any issues encountered\n\n" +
			"Keep your final summary tight: lead with outcomes, prefer bullet points over paragraphs, " +
			"and don't replay your whole process. Your response is returned to the parent agent as a summary, " +
			"and overlong summaries crowd out the parent's context window."
	);
	return parts.join("\n");
}

export function capSummary(text: string): string {
	const t = text.trim();
	if (t.length <= DELEGATE_MAX_SUMMARY_CHARS) return t;
	return t.slice(0, DELEGATE_MAX_SUMMARY_CHARS - TRUNC.length).trimEnd() + TRUNC;
}

/** Consolidated batch result (their JSON shape, per-task entries sorted by
   task_index; ✓/✗ class via status). */
export function formatConsolidatedResult(entries: DelegateResultEntry[]): string {
	const sorted = [...entries].sort((a, b) => a.task_index - b.task_index);
	return JSON.stringify({
		results: sorted.map((e) => ({
			task_index: e.task_index,
			status: e.status,
			summary: e.summary,
			...(e.error ? { error: e.error } : {}),
			duration_seconds: e.duration_seconds,
		})),
		summary: {
			total: sorted.length,
			completed: sorted.filter((e) => e.status === "completed").length,
			failed: sorted.filter((e) => e.status === "error").length,
		},
	});
}

/** Concurrency pool — max DELEGATE_MAX_CONCURRENT children in flight at once. */
export async function runPooled<T>(size: number, workers: (() => Promise<T>)[]): Promise<T[]> {
	const out: T[] = new Array(workers.length);
	let next = 0;
	async function lane() {
		while (next < workers.length) {
			const i = next++;
			out[i] = await workers[i]();
		}
	}
	await Promise.all(Array.from({ length: Math.min(size, workers.length) }, lane));
	return out;
}

/** Tool selection is fail-closed: newly registered tools do not reach an
 * unattended context until their exact name is reviewed and allowlisted. */
function toolsAllowedBy(tools: AgentTool[], names: readonly string[]): AgentTool[] {
	const allowed = new Set(names);
	return tools.filter((tool) => allowed.has(tool.name));
}

export function childTools(tools: AgentTool[]): AgentTool[] {
	return toolsAllowedBy(tools, DELEGATE_ALLOWED_TOOLS);
}

export function headlessTools(tools: AgentTool[]): AgentTool[] {
	return toolsAllowedBy(tools, HEADLESS_ALLOWED_TOOLS);
}

/** Normalise the model's arguments (single vs batch) into a task list with
   the same honest errors they raise for empty input. */
export function normalizeDelegateArgs(args: Record<string, unknown>): { tasks: { goal: string; context?: string }[] } | { error: string } {
	const tasks = args.tasks;
	if (Array.isArray(tasks) && tasks.length > 0) {
		const out: { goal: string; context?: string }[] = [];
		for (const [i, t] of tasks.entries()) {
			if (typeof t !== "object" || t === null) return { error: `tasks[${i}] must be an object with at least a goal.` };
			const rec = t as Record<string, unknown>;
			const goal = String(rec.goal ?? "").trim();
			if (!goal) return { error: `tasks[${i}] is missing a goal.` };
			const context = typeof rec.context === "string" ? rec.context : undefined;
			out.push({ goal, ...(context ? { context } : {}) });
		}
		return { tasks: out };
	}
	const goal = String(args.goal ?? "").trim();
	if (!goal)
		return {
			error:
				"Provide 'goal' for a single delegation, or 'tasks' (array of {goal, context?}) for a parallel batch.",
		};
	const context = typeof args.context === "string" ? args.context : undefined;
	return { tasks: [{ goal, ...(context ? { context } : {}) }] };
}
