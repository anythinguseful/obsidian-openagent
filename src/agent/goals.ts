/**
 * Session goals — the Hermes "Ralph loop" (hermes_cli/goals.py parity).
 *
 * A goal is a free-form objective that stays active across turns. After each
 * turn a small judge call answers "is the goal satisfied by the last reply?"
 * — if not, a continuation prompt feeds back into the same session until the
 * goal is done, the turn budget is exhausted, or the user pauses/clears it.
 * A fresh user message just becomes a normal turn; the judge still runs
 * after it (the user's message may itself complete the goal).
 *
 * Invariants mirrored from the official module:
 * - no system-prompt mutation: the continuation is an ordinary user message;
 * - judge failures fail OPEN (continue) but consecutive parse/transport
 *   failures auto-pause the loop instead of burning the budget;
 * - the turn budget (20) is the absolute backstop.
 */

export const GOAL_MAX_TURNS = 20; // DEFAULT_MAX_TURNS in goals.py
export const GOAL_MAX_PARSE_FAILURES = 3;
export const GOAL_MAX_TRANSPORT_FAILURES = 5;
/* v0.1.129 audit: konstanta sisa-port goals.py ini tidak pernah direferensikan
   di mana pun (src maupun test) — dihapus; bukan di-private-kan agar surface
   goals tetap sekecil kebutuhan nyata. */

export type GoalStatus = "active" | "paused" | "done" | "cleared";

export interface SessionGoal {
	text: string;
	status: GoalStatus;
	turnsUsed: number;
	parseFailures: number;
	transportFailures: number;
	/** why the loop parked (budget, parse failures, wait verdict, user) */
	pausedReason?: string;
	updatedAt: number;
}

export function newGoal(text: string): SessionGoal {
	return { text, status: "active", turnsUsed: 0, parseFailures: 0, transportFailures: 0, updatedAt: Date.now() };
}

/** goals.py CONTINUATION_PROMPT_TEMPLATE (freeform, no contract/subgoals) */
export function continuationPrompt(goal: string): string {
	return (
		`[Continuing toward your standing goal]\n` +
		`Goal: ${goal}\n\n` +
		`Continue working toward this goal. Take the next concrete step. ` +
		`If you believe the goal is complete, state so explicitly and stop.`
	);
}

/** judge input: goal + the assistant's latest reply (capped, goals.py) */
export function buildGoalJudgePrompt(goal: string, lastReply: string): string {
	return (
		`You judge whether a recent reply satisfies the user's stated goal. Reply with ONE LINE of JSON only.\n\n` +
		`Goal: ${goal}\n\n` +
		`Assistant's last reply:\n${lastReply}\n\n` +
		`Pick DONE only when the reply explicitly confirms completion, delivers the final deliverable, ` +
		`or explains the goal is unachievable/blocked. ` +
		`If the reply clearly asks for user input before it can proceed, pick WAIT. Otherwise CONTINUE.\n\n` +
		`Verdict JSON: {"done": true|false, "wait": true|false, "reason": "short"}`
	);
}

export interface GoalVerdict {
	done: boolean;
	wait: boolean;
	reason: string;
}

/**
 * Lenient verdict parse — reasoning models may trail prose around the JSON;
 * an unparseable reply THROWS so the caller counts a parse failure (the
 * fail-open decision stays in one place).
 */
export function parseGoalVerdict(raw: string): GoalVerdict {
	const match = raw.match(/\{[\s\S]*\}/);
	if (!match) throw new Error("judge reply was not JSON");
	let parsed: { done?: unknown; wait?: unknown; reason?: unknown };
	try {
		parsed = JSON.parse(match[0]) as typeof parsed;
	} catch {
		throw new Error("judge reply was not JSON");
	}
	return {
		done: parsed.done === true,
		wait: parsed.wait === true,
		reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 160) : "",
	};
}
