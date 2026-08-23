/**
 * Cron schedule engine — Hermes-style automations for Open Agent.
 *
 * A dependency-free 5-field cron mini-parser (minute hour day-of-month month
 * day-of-week) plus the schedule presets mirrored from Hermes Desktop's
 * SCHEDULE_OPTIONS, next-run computation, legacy task migration and small
 * display helpers. Pure functions only — no obsidian imports — so the whole
 * module is unit-testable with plain node.
 */

import type { CronSchedule, CronTask } from "../settings";
import { canonicalizeAssistantOutput } from "../markdown/canonical-output";
import { clipMarkdownFenceSafe } from "../markdown/fences";
import { createTwoFilesPatch } from "diff";
import { sanitizeScriptName } from "./cronScripts";
import { EXFIL_PATTERNS as CRON_EXFIL_PATTERNS, INJECTION_PATTERNS as CRON_INJECTION_PATTERNS, SECRET_VAR_RE as CRON_SECRET_VAR_RE } from "./threatPatterns";

/* ------------------------------------------------------------------ */
/* presets (Hermes Desktop SCHEDULE_OPTIONS)                          */
/* ------------------------------------------------------------------ */

export interface CronPreset {
	key: string;
	label: string;
	expr: string;
}

export const CRON_PRESETS: CronPreset[] = [
	{ key: "every-15-min", label: "Every 15 minutes", expr: "*/15 * * * *" },
	{ key: "hourly", label: "Hourly", expr: "0 * * * *" },
	{ key: "daily", label: "Daily at 09:00", expr: "0 9 * * *" },
	{ key: "weekdays", label: "Weekdays at 09:00", expr: "0 9 * * 1-5" },
	{ key: "weekly", label: "Weekly on Monday at 09:00", expr: "0 9 * * 1" },
	{ key: "monthly", label: "Monthly on the 1st at 09:00", expr: "0 9 1 * *" },
];

export const CRON_TARGET_OUTPUT_MAX_CHARS = 4000;
export const CRON_TARGET_TRUNCATION_MARKER = "\n\n…(truncated — see archive)";

/**
 * Single pure persistence boundary for cron output. The archive receives
 * canonicalOutput unchanged, chained context receives chainOutput, and the
 * compact target note receives targetOutput. Both clipped forms include the
 * marker inside their hard cap and never retain a partial fenced block.
 */
export function prepareCronOutput(output: string): {
	canonicalOutput: string;
	chainOutput: string | undefined;
	targetOutput: string;
} {
	const canonicalOutput = canonicalizeAssistantOutput(output);
	const trimmed = canonicalOutput.trim();
	return {
		canonicalOutput,
		chainOutput: clipMarkdownFenceSafe(trimmed, CRON_CHAIN_MAX_CHARS) || undefined,
		targetOutput: clipMarkdownFenceSafe(trimmed, CRON_TARGET_OUTPUT_MAX_CHARS, CRON_TARGET_TRUNCATION_MARKER),
	};
}

export function presetForExpr(expr: string): CronPreset | null {
	const norm = expr.trim().replace(/\s+/g, " ");
	return CRON_PRESETS.find((p) => p.expr === norm) ?? null;
}

/* ------------------------------------------------------------------ */
/* mini cron parser                                                    */
/* ------------------------------------------------------------------ */

interface FieldSpec {
	min: number;
	max: number;
	label: string;
}

const FIELD_SPECS: FieldSpec[] = [
	{ min: 0, max: 59, label: "minute" },
	{ min: 0, max: 23, label: "hour" },
	{ min: 1, max: 31, label: "day-of-month" },
	{ min: 1, max: 12, label: "month" },
	{ min: 0, max: 6, label: "day-of-week" },
];

/** Parse one cron field into a set of matching integers. Throws on bad input. */
function parseField(raw: string, spec: FieldSpec): Set<number> {
	const out = new Set<number>();
	const addRange = (lo: number, hi: number, step: number): void => {
		if (step < 1) throw new Error(`Invalid step "*/${step}" in the ${spec.label} field.`);
		if (lo < spec.min || hi > spec.max)
			throw new Error(
				`Value ${lo > hi ? lo : hi} is out of range for the ${spec.label} field (${spec.min}–${spec.max}).`
			);
		if (lo > hi) throw new Error(`Range "${lo}-${hi}" in the ${spec.label} field starts after it ends.`);
		for (let v = lo; v <= hi; v += step) out.add(v);
	};

	for (const token of raw.split(",")) {
		const part = token.trim();
		if (!part) throw new Error(`Empty entry in the ${spec.label} field.`);
		const [base, stepRaw] = part.split("/");
		const step = stepRaw !== undefined ? parseInt(stepRaw, 10) : 1;
		if (stepRaw !== undefined && (!/^\d+$/.test(stepRaw.trim()) || Number.isNaN(step)))
			throw new Error(`Invalid step "/${stepRaw}" in the ${spec.label} field.`);

		if (base === "*" || base === "") {
			if (base === "" && stepRaw !== undefined)
				throw new Error(`Invalid step "/${stepRaw}" in the ${spec.label} field.`);
			addRange(spec.min, spec.max, step);
			continue;
		}
		const rangeMatch = base.match(/^(\d+)-(\d+)$/);
		if (rangeMatch) {
			addRange(parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10), step);
			continue;
		}
		const single = parseInt(base, 10);
		if (!/^\d+$/.test(base) || Number.isNaN(single))
			throw new Error(`"${base}" is not a valid ${spec.label} value.`);
		// `a/n` means "every n starting at a" — treat like a-max/n (POSIX extension)
		if (stepRaw !== undefined) addRange(single, spec.max, step);
		else addRange(single, single, 1);
	}
	return out;
}

export interface CronFields {
	minutes: Set<number>;
	hours: Set<number>;
	dom: Set<number>;
	months: Set<number>;
	dow: Set<number>;
	/** true when a field was exactly `*` (needed for the Vixie dom/dow OR rule) */
	domStar: boolean;
	dowStar: boolean;
}

/** Parse and validate a full 5-field expression. Throws Error with a friendly message. */
export function parseCronExpr(expr: string): CronFields {
	const parts = expr.trim().split(/\s+/).filter(Boolean);
	if (parts.length !== 5)
		throw new Error(
			`Expected 5 fields (minute hour day month weekday) but found ${parts.length}. Example: "0 9 * * 1-5".`
		);
	const [minutes, hours, dom, months, dow] = parts.map((p, i) => parseField(p, FIELD_SPECS[i]));
	return {
		minutes,
		hours,
		dom,
		months,
		dow,
		domStar: parts[2].trim() === "*",
		dowStar: parts[4].trim() === "*",
	};
}

export function validateCronExpr(expr: string): { ok: boolean; error?: string } {
	try {
		parseCronExpr(expr);
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/** Does the given local-time date match the expression? (Vixie dom/dow OR rule.) */
export function cronMatches(parsed: CronFields, d: Date): boolean {
	if (!parsed.minutes.has(d.getMinutes())) return false;
	if (!parsed.hours.has(d.getHours())) return false;
	if (!parsed.months.has(d.getMonth() + 1)) return false;
	const domHit = parsed.dom.has(d.getDate());
	const dowHit = parsed.dow.has(d.getDay());
	if (parsed.domStar && parsed.dowStar) return true;
	if (parsed.domStar) return dowHit;
	if (parsed.dowStar) return domHit;
	return domHit || dowHit;
}

/**
 * Next run after `fromMs` — minute-by-minute scan, capped at 366 days ahead.
 * Returns epoch ms at a minute boundary, or null when nothing matches.
 */
export function nextCronRun(expr: string, fromMs: number): number | null {
	const parsed = parseCronExpr(expr); // throws on invalid
	const d = new Date(fromMs);
	d.setSeconds(0, 0);
	d.setMinutes(d.getMinutes() + 1);
	const cap = 366 * 24 * 60;
	for (let i = 0; i < cap; i++) {
		if (cronMatches(parsed, d)) return d.getTime();
		d.setMinutes(d.getMinutes() + 1);
	}
	return null;
}

/* ------------------------------------------------------------------ */
/* schedules & display                                                 */
/* ------------------------------------------------------------------ */

export function scheduleFromExpr(expr: string): CronSchedule {
	const norm = expr.trim().replace(/\s+/g, " ");
	const preset = presetForExpr(norm);
	return preset
		? { kind: "preset", expr: preset.expr, display: preset.label }
		: { kind: "cron", expr: norm, display: norm };
}

/* ------------------------------------------------------------------ */
/* v0.1.147 — human schedule builder + friendly description            */
/* ------------------------------------------------------------------ */

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTH_LABELS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function clamp(n: number, lo: number, hi: number): number {
	if (!Number.isFinite(n)) return lo;
	return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** Build a cron expression from guided schedule inputs (pure). */
export function cronExprForInterval(n: number, unit: "minutes" | "hours"): string {
	const nn = clamp(n, 1, 59);
	return unit === "hours" ? `0 */${nn} * * *` : `*/${nn} * * * *`;
}

export function cronExprForDaily(hh: number, mm: number): string {
	return `${pad2(clamp(mm, 0, 59))} ${pad2(clamp(hh, 0, 23))} * * *`;
}

export function cronExprForWeekly(dow: number, hh: number, mm: number): string {
	return `${pad2(clamp(mm, 0, 59))} ${pad2(clamp(hh, 0,23))} * * ${clamp(dow, 0, 6)}`;
}

export function cronExprForMonthly(day: number, hh: number, mm: number): string {
	return `${pad2(clamp(mm, 0, 59))} ${pad2(clamp(hh, 0,23))} ${clamp(day, 1, 28)} * *`;
}

/**
 * Human description of a 5-field cron expression, or null when the pattern is
 * not one we can name confidently. Used everywhere a raw cron would otherwise
 * be shown to the user (schedule list + form), so `0 9 * * *` reads as
 * "Every day at 09:00" instead of looking like a password.
 */
export function describeCronExpr(expr: string): string | null {
	const norm = (expr ?? "").trim().replace(/\s+/g, " ");
	const parts = norm.split(" ");
	if (parts.length !== 5) return null;
	const [min, hour, dom, month, dow] = parts;

	const any = (v: string): boolean => v === "*";
	const everyMinute = min === "*" && hour === "*" && dom === "*" && month === "*" && dow === "*";
	if (everyMinute) return "Every minute";

	const everyN = min.match(/^\*\/(\d+)$/);
	if (everyN && hour === "*" && dom === "*" && month === "*" && dow === "*") {
		const n = Number(everyN[1]);
		return n === 1 ? "Every minute" : `Every ${n} minutes`;
	}
	const everyNhours = hour.match(/^\*\/(\d+)$/);
	if (everyNhours && min === "0" && dom === "*" && month === "*" && dow === "*") {
		const n = Number(everyNhours[1]);
		return n === 1 ? "Hourly" : `Every ${n} hours`;
	}
	if (hour === "*" && min === "0" && dom === "*" && month === "*" && dow === "*") return "Hourly";

	const hh = hour.match(/^\d+$/) ? Number(hour) : null;
	const mm = min.match(/^\d+$/) ? Number(min) : null;
	const time = hh !== null && hh <= 23 && mm !== null && mm <= 59 ? `${pad2(hh)}:${pad2(mm)}` : null;

	if (time && dom === "*" && month === "*" && dow === "*") return `Every day at ${time}`;

	if (time && dom === "*" && month === "*" && dow === "1-5") return `Weekdays (Mon–Fri) at ${time}`;
	if (time && dom === "*" && month === "*" && /^\d$/.test(dow)) {
		return `Every ${WEEKDAY_LABELS[Number(dow)]} at ${time}`;
	}
	if (time && dom === "*" && month === "*" && dow === "1,2,3,4,5") return `Weekdays (Mon–Fri) at ${time}`;

	if (time && /^\d+$/.test(dom) && month === "*" && dow === "*") {
		const d = Number(dom);
		if (d >= 1 && d <= 28) return `On day ${d} of each month at ${time}`;
	}

	if (time && dom === "*" && /^\d+$/.test(month) && dow === "*") {
		const m = Number(month);
		if (m >= 1 && m <= 12) return `Every day in ${MONTH_LABELS[m]} at ${time}`;
	}

	return null;
}

/** "in 5m" / "3h ago" / "now" — compact relative timestamps for the UI. */
export function formatRelative(ms: number, now = Date.now()): string {
	if (!ms) return "never";
	const diff = ms - now;
	const abs = Math.abs(diff);
	const suffix = diff >= 0 ? "" : " ago";
	const prefix = diff >= 0 ? "in " : "";
	if (abs < 45_000) return diff >= 0 ? "now" : "just now";
	const m = Math.round(abs / 60_000);
	if (m < 60) return `${prefix}${m}m${suffix}`;
	const h = Math.round(m / 60);
	if (h < 48) return `${prefix}${h}h${suffix}`;
	const d = Math.round(h / 24);
	return `${prefix}${d}d${suffix}`;
}

/* ------------------------------------------------------------------ */
/* task factory, lookup & migration                                    */
/* ------------------------------------------------------------------ */

let cronSeq = 0;

export function newCronTask(input: {
	name: string;
	prompt: string;
	expr: string;
	targetNote: string;
	skills?: string[];
	maxRuns?: number | null;
	chainContext?: boolean;
	notify?: boolean;
	monitorUrl?: string;
	script?: string;
	noAgent?: boolean;
}): CronTask {
	const schedule = scheduleFromExpr(input.expr);
	const monitorUrl = (input.monitorUrl ?? "").trim();
	const script = sanitizeScriptName(input.script);
	if (script && monitorUrl) {
		throw new Error("A script and a monitor URL are mutually exclusive — pick one.");
	}
	return {
		id: `cron-${Date.now()}-${(cronSeq = (cronSeq + 1) % 1000)}`,
		name: input.name.trim() || "Untitled task",
		/* v0.1.147: security strip always — invisible glyphs never enter an
		   unattended scheduled prompt. */
		prompt: scanCronPrompt(input.prompt.trim()).clean,
		schedule,
		targetNote: input.targetNote.trim() || "openagent/Reports.md",
		enabled: true,
		nextRun: nextCronRun(schedule.expr, Date.now()) ?? 0,
		lastRun: 0,
		lastStatus: null,
		runCount: 0,
		createdAt: Date.now(),
		skills: input.skills?.length ? [...input.skills] : undefined,
		maxRuns: typeof input.maxRuns === "number" && input.maxRuns > 0 ? Math.floor(input.maxRuns) : null,
		chainContext: input.chainContext || undefined,
		notify: input.notify || undefined,
		monitorUrl: /^https?:\/\//i.test(monitorUrl) ? monitorUrl : undefined,
		script: script ?? undefined,
		noAgent: script ? input.noAgent === true || undefined : undefined,
	};
}

/* ------------------------------------------------------------------ */
/* Tahap D — SILENT marker · skills/chaining prompt build · repeat    */
/* ------------------------------------------------------------------ */

/** Hermes: output starting with [SILENT] is archived but not delivered. */
export function isSilentOutput(output: string): boolean {
	return output.trimStart().startsWith("[SILENT]");
}

/** cap when a previous run's output rides along in the next prompt */
export const CRON_CHAIN_MAX_CHARS = 2000;

/* ------------------------------------------------------------------ */
/* v0.1.147 — monitor (change-detection) + prompt security scan       */
/* ------------------------------------------------------------------ */

export const CRON_MONITOR_URL_MAX_BYTES = 256 * 1024;
export const CRON_MONITOR_URL_TIMEOUT_MS = 30_000;
export const CRON_MONITOR_CONTENT_MAX = 4000;
export const CRON_MONITOR_DIFF_MAX = 6000;
/** How much of the previous monitored content is persisted for diffing. */
export const CRON_MONITOR_CONTENT_STORE_MAX = 20_000;

/** FNV-1a 32 (mirrors workspacePolicy.ts) — stable byte hash for monitor. */
export function cronHash(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, "0");
}

/** Strip zero-width, bidi-override, and C0 control characters (except the
 * legitimate \n and \t). Returns the cleaned text and how many were removed —
 * these glyphs can smuggle instructions past a reviewer's eyes. */
export function stripInvisibleUnicode(text: string): { clean: string; removed: number } {
	let removed = 0;
	let clean = "";
	for (const ch of text) {
		const code = ch.codePointAt(0) ?? 0;
		const invisible =
			(ch === "\u200b" || ch === "\u200c" || ch === "\u200d" || ch === "\ufeff" || ch === "\u2060") || // zero-width
			(ch >= "\u202a" && ch <= "\u202e") || // bidi overrides
			(ch >= "\u2066" && ch <= "\u2069") || // directional isolates
			(code < 0x20 && ch !== "\n" && ch !== "\t"); // C0 controls
		if (invisible) removed++;
		else clean += ch;
	}
	return { clean, removed };
}

export interface CronPromptScan {
	clean: string;
	findings: string[];
	/** true when an invisible-glyph strip changed the bytes (tripwire). */
	stripped: boolean;
}

/**
 * Security scan for scheduled unattended prompts. Always strips invisible
 * unicode; reports (but does not silently drop) high-confidence secret/
 * exfil/injection shapes. Pure — applied at create/update AND as a runtime
 * defense-in-depth strip in the runner.
 */
export function scanCronPrompt(prompt: string): CronPromptScan {
	const { clean, removed } = stripInvisibleUnicode(prompt);
	const findings: string[] = [];
	if (removed > 0) findings.push(`stripped ${removed} invisible character(s)`);
	if (CRON_SECRET_VAR_RE.test(clean)) findings.push("references a secret-like variable/pattern");
	for (const re of CRON_EXFIL_PATTERNS) {
		if (re.test(clean)) {
			findings.push("contains a shell/credential-exfiltration pattern");
			break;
		}
	}
	for (const re of CRON_INJECTION_PATTERNS) {
		if (re.test(clean)) {
			findings.push("contains a prompt-injection instruction");
			break;
		}
	}
	return { clean, findings, stripped: removed > 0 };
}

/**
 * The block prepended to a monitored run's prompt. `prev === null` marks the
 * first run (baseline); otherwise a bounded unified diff plus the new content.
 */
export function buildMonitorBlock(prev: string | null, next: string): string {
	if (prev === null) {
		return "[Monitor baseline — first run after enabling monitor. The watched content below is the new baseline.]";
	}
	const patch = createTwoFilesPatch("previous", "current", prev, next, "", "", { context: 2 });
	const clippedPatch = clipMarkdownFenceSafe(patch, CRON_MONITOR_DIFF_MAX);
	const clippedNext = clipMarkdownFenceSafe(next, CRON_MONITOR_CONTENT_MAX);
	return [
		"[Monitor change detected — the watched content changed since the last run. Unified diff (previous → current):]",
		"```diff",
		clippedPatch,
		"```",
		"[Current content:]",
		"```text",
		clippedNext,
		"```",
	].join("\n");
}

/** task completed its repeat budget? */
export function isCronCompleted(task: CronTask): boolean {
	return typeof task.maxRuns === "number" && task.maxRuns > 0 && task.runCount >= task.maxRuns;
}

/**
 * The effective prompt for one run: optional chaining prefix, optional
 * focus-skills block. Pure — the runner feeds the pieces, we compose.
 */
export function buildTaskPrompt(
	task: CronTask,
	skillDocs: { name: string; whenToUse: string; instructions: string }[] = [],
	prevRunAt = 0
): string {
	let prompt = task.prompt;
	if (skillDocs.length > 0) {
		const docs = skillDocs
			.map((s) => `### ${s.name}\nWhen to use: ${s.whenToUse}\n\n${s.instructions}`)
			.join("\n\n");
		prompt = `[Task focus skills: ${skillDocs.map((s) => s.name).join(", ")}]\n${docs}\n\n${prompt}`;
	}
	if (task.chainContext && task.lastOutput) {
		const when = prevRunAt > 0 ? new Date(prevRunAt).toLocaleString() : "earlier";
		const prev = clipMarkdownFenceSafe(task.lastOutput, CRON_CHAIN_MAX_CHARS);
		prompt = `[Previous run output (${when})]\n"""\n${prev}\n"""\n\n${prompt}`;
	}
	return prompt;
}

/** Find a task by exact id, else by case-insensitive name (ambiguity is an error). */
export function findCronTask(
	tasks: CronTask[],
	idOrName: string
): { task?: CronTask; error?: string } {
	const needle = (idOrName || "").trim();
	if (!needle) return { error: "Provide a task id or name." };
	const byId = tasks.find((t) => t.id === needle);
	if (byId) return { task: byId };
	const lower = needle.toLowerCase();
	const byName = tasks.filter((t) => t.name.toLowerCase() === lower);
	if (byName.length === 1) return { task: byName[0] };
	if (byName.length > 1)
		return {
			error: `More than one automation is named “${needle}” — use the id instead: ${byName
				.map((t) => t.id)
				.join(", ")}.`,
		};
	return { error: `No automation found for “${needle}”. Use cronjob list to see ids.` };
}

/** Safe slug for the archive folder / file name. */
export function cronSafeSlug(name: string): string {
	const s = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40);
	return s || "task";
}

export const CRON_RUNS_ROOT = "openagent/cron/runs";

/** Vault folder holding this task's per-run archives. */
export function cronRunsFolder(taskName: string): string {
	return `${CRON_RUNS_ROOT}/${cronSafeSlug(taskName)}`;
}

/** `20260719-0945` archive stamp (local time). */
export function archiveStamp(ms: number): string {
	const d = new Date(ms);
	const p = (n: number): string => String(n).padStart(2, "0");
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Normalize persisted data into v2 CronTasks.
 * Handles: absent/empty, legacy v1 ({intervalMinutes, lastRun}) and current v2.
 */
export function migrateCronTasks(raw: unknown): CronTask[] {
	if (!Array.isArray(raw)) return [];
	const out: CronTask[] = [];
	const now = Date.now();
	for (const entry of raw as Record<string, unknown>[]) {
		if (!entry || typeof entry !== "object") continue;
		// ── legacy v1: interval-based ──
		if (typeof entry.intervalMinutes === "number" && !entry.schedule) {
			const n = Math.max(1, Math.round(entry.intervalMinutes));
			let expr: string;
			if (n < 60) expr = `*/${n} * * * *`;
			else if (n % 60 === 0 && n / 60 <= 23) expr = `0 */${n / 60} * * *`;
			else if (n % 1440 === 0) expr = "0 9 * * *";
			else expr = `0 */${Math.min(23, Math.max(1, Math.round(n / 60)))} * * *`;
			const lastRun = typeof entry.lastRun === "number" ? entry.lastRun : 0;
			out.push({
				id: typeof entry.id === "string" ? entry.id : `cron-${now}-${out.length}`,
				name: typeof entry.name === "string" ? entry.name : "Untitled task",
				prompt: typeof entry.prompt === "string" ? entry.prompt : "",
				schedule: { kind: "cron", expr, display: `every ${n} min` },
				targetNote:
					typeof entry.targetNote === "string" ? entry.targetNote : "openagent/Reports.md",
				enabled: entry.enabled !== false,
				nextRun: lastRun > 0 ? lastRun + n * 60_000 : nextCronRun(expr, now) ?? 0,
				lastRun,
				lastStatus: null,
				runCount: 0,
				createdAt: lastRun || now,
			});
			continue;
		}
		// ── v2 ──
		const schedule = entry.schedule as CronSchedule | undefined;
		if (!schedule || typeof schedule.expr !== "string") continue;
		if (!validateCronExpr(schedule.expr).ok) continue;
		out.push({
			id: typeof entry.id === "string" ? entry.id : `cron-${now}-${out.length}`,
			name: typeof entry.name === "string" ? entry.name : "Untitled task",
			prompt: typeof entry.prompt === "string" ? entry.prompt : "",
			schedule: {
				kind: schedule.kind === "preset" ? "preset" : "cron",
				expr: schedule.expr,
				display: typeof schedule.display === "string" ? schedule.display : schedule.expr,
			},
			targetNote:
				typeof entry.targetNote === "string" ? entry.targetNote : "openagent/Reports.md",
			enabled: entry.enabled !== false,
			nextRun:
				typeof entry.nextRun === "number" && entry.nextRun > 0
					? entry.nextRun
					: nextCronRun(schedule.expr, now) ?? 0,
			lastRun: typeof entry.lastRun === "number" ? entry.lastRun : 0,
			lastStatus: entry.lastStatus === "ok" || entry.lastStatus === "error" ? entry.lastStatus : null,
			lastError: typeof entry.lastError === "string" ? entry.lastError : undefined,
			runCount: typeof entry.runCount === "number" ? entry.runCount : 0,
			createdAt: typeof entry.createdAt === "number" ? entry.createdAt : now,
			/* Tahap D passthrough */
			skills: Array.isArray(entry.skills) ? entry.skills.filter((x): x is string => typeof x === "string" && !!x.trim()) : undefined,
			maxRuns:
				typeof entry.maxRuns === "number" && entry.maxRuns > 0 ? Math.floor(entry.maxRuns) : null,
			chainContext: entry.chainContext === true || undefined,
			notify: entry.notify === true || undefined,
			lastOutput:
				typeof entry.lastOutput === "string"
					? clipMarkdownFenceSafe(entry.lastOutput, CRON_CHAIN_MAX_CHARS)
					: undefined,
			lastWorkspaceScope:
				typeof entry.lastWorkspaceScope === "string" && entry.lastWorkspaceScope.length <= 128
					? entry.lastWorkspaceScope
					: undefined,
			/* v0.1.147 passthrough */
			monitorUrl:
				typeof entry.monitorUrl === "string" && /^https?:\/\//i.test(entry.monitorUrl.trim())
					? entry.monitorUrl.trim()
					: undefined,
			monitorLastHash:
				typeof entry.monitorLastHash === "string" && /^[0-9a-f]{8}$/.test(entry.monitorLastHash)
					? entry.monitorLastHash
					: undefined,
			monitorLastContent:
				typeof entry.monitorLastContent === "string"
					? entry.monitorLastContent.slice(0, CRON_MONITOR_CONTENT_STORE_MAX)
					: undefined,
			/* v0.1.147 script/no_agent passthrough */
			script:
				typeof entry.script === "string" && sanitizeScriptName(entry.script) ? sanitizeScriptName(entry.script) ?? undefined : undefined,
			noAgent: entry.noAgent === true || undefined,
		});
	}
	return out;
}
