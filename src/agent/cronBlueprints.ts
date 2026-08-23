/**
 * Automation blueprints — curated, ready-made cron automations with typed
 * slots (mirrors Hermes `cron/blueprint_catalog.py`, verified byte-level
 * 2026-08-20 @ aeabff6).
 *
 * A blueprint bundles three things:
 *   · a fixed cron template ("{minute} {hour} * * {dow}") — users never type
 *     raw cron; only the human-friendly parts are filled in,
 *   · a pre-written prompt with {placeholders},
 *   · typed slots (time / enum / text / weekdays) the settings UI renders as
 *     a small form.
 *
 * Parity is curated, not wholesale. Hermes ships 16 blueprints; several
 * depend on integrations this plugin does not have (mail, schedules and
 * forecasts from other services). Those are omitted on purpose — a blueprint
 * whose prompt references phantom tools would lie to the agent. Everything
 * here runs on vault search + web_search + note writes only.
 */

import { validateCronExpr } from "./cron";

export type BlueprintSlotType = "time" | "enum" | "text" | "weekdays";

export interface BlueprintSlot {
	name: string;
	type: BlueprintSlotType;
	label: string;
	default?: string;
	/** Allowed values for `enum` slots (also rendered as dropdown choices). */
	options?: string[];
	help?: string;
}

export interface AutomationBlueprint {
	key: string;
	title: string;
	description: string;
	category: "daily" | "weekly" | "general";
	/** 5-field cron with {slot} placeholders — time → minute/hour,
	 * weekdays/day → dow, interval_min → a step like "/15". */
	scheduleTemplate: string;
	/** Seed prompt; may reference {slot}s. */
	promptTemplate: string;
	slots: BlueprintSlot[];
	tags?: string[];
}

/** Named weekday recurrences → cron day-of-week field (mirrors Hermes). */
export const WEEKDAY_PRESETS: Record<string, string> = {
	everyday: "*",
	weekdays: "1-5",
	weekends: "0,6",
};

/** UI labels for the weekday presets. */
export const WEEKDAY_PRESET_LABELS: Record<string, string> = {
	everyday: "Every day",
	weekdays: "Weekdays",
	weekends: "Weekends",
};

/** Single weekday names → cron day-of-week field. */
export const DAY_TO_DOW: Record<string, string> = {
	monday: "1",
	tuesday: "2",
	wednesday: "3",
	thursday: "4",
	friday: "5",
	saturday: "6",
	sunday: "0",
};

/** Raised when supplied slot values fail validation. */
export class BlueprintFillError extends Error {}

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

function timeToFields(raw: string): { hour: string; minute: string } {
	const m = TIME_RE.exec(raw.trim());
	if (!m) throw new BlueprintFillError(`invalid time "${raw}" — use HH:MM (24h).`);
	const hh = Number(m[1]);
	const mm = Number(m[2]);
	if (hh > 23 || mm > 59) throw new BlueprintFillError(`invalid time "${raw}" — hours 0–23, minutes 0–59.`);
	return { hour: String(hh), minute: String(mm) };
}

/** Replace `{slot}` placeholders; throws on any unfilled reference (a dev
 * error in a template, never a user error). */
function formatTemplate(template: string, map: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
		if (!(key in map)) throw new BlueprintFillError(`template references an unfilled slot "{${key}}".`);
		return map[key];
	});
}

/** Fill the schedule template from resolved slot values (mirrors Hermes
 * `_resolve_schedule`): time → minute/hour, weekdays/day → dow, interval. */
function resolveSchedule(bp: AutomationBlueprint, values: Record<string, string>): string {
	const sched = bp.scheduleTemplate;
	const repl: Record<string, string> = {};

	if (/\{minute\}|\{hour\}/.test(sched)) {
		const timeSlot = bp.slots.find((s) => s.type === "time");
		const raw = values[timeSlot?.name ?? ""] ?? "";
		if (!raw) throw new BlueprintFillError("a time is required.");
		Object.assign(repl, timeToFields(raw));
	}

	if (/\{dow\}/.test(sched)) {
		const weekdaysSlot = bp.slots.find((s) => s.type === "weekdays");
		const daySlot = bp.slots.find((s) => s.type === "enum" && s.name === "day");
		if (weekdaysSlot && values[weekdaysSlot.name]) {
			const preset = values[weekdaysSlot.name];
			if (!(preset in WEEKDAY_PRESETS)) throw new BlueprintFillError(`unknown recurrence "${preset}".`);
			repl.dow = WEEKDAY_PRESETS[preset];
		} else if (daySlot && values[daySlot.name]) {
			const day = values[daySlot.name];
			if (!(day in DAY_TO_DOW)) throw new BlueprintFillError(`unknown day "${day}".`);
			repl.dow = DAY_TO_DOW[day];
		} else {
			repl.dow = "*";
		}
	}

	if (/\{interval_min\}/.test(sched)) {
		const raw = values["interval_min"] ?? "";
		if (!/^\d+$/.test(raw) || Number(raw) <= 0)
			throw new BlueprintFillError(`invalid interval "${raw}" — minutes as a positive integer.`);
		repl.interval_min = raw;
	}

	for (const [k, v] of Object.entries(values)) {
		if (!(k in repl) && sched.includes(`{${k}}`)) repl[k] = v;
	}

	return formatTemplate(sched, repl);
}

export interface BlueprintFillResult {
	/** task name (the blueprint title) */
	name: string;
	/** filled prompt */
	prompt: string;
	/** filled, validated 5-field cron expression */
	expr: string;
}

/**
 * Validate `values` against the blueprint and return ready-to-create task
 * inputs. Throws `BlueprintFillError` on any problem — unknown slot, bad
 * enum, bad time — so a form can show a readable field error.
 */
export function fillBlueprint(bp: AutomationBlueprint, values: Record<string, string>): BlueprintFillResult {
	const known = new Set(bp.slots.map((s) => s.name));
	for (const k of Object.keys(values)) {
		if (k && !known.has(k)) throw new BlueprintFillError(`unknown slot "${k}".`);
	}
	const resolved: Record<string, string> = {};
	for (const s of bp.slots) {
		const raw = (values[s.name]?.trim() || s.default || "").trim();
		if (!raw) throw new BlueprintFillError(`missing required value: ${s.name} (${s.label}).`);
		if (s.type === "enum" && s.options && !s.options.includes(raw)) {
			throw new BlueprintFillError(`"${raw}" is not a choice for ${s.label}.`);
		}
		if (s.type === "weekdays" && !(raw in WEEKDAY_PRESETS)) {
			throw new BlueprintFillError(`"${raw}" is not a valid recurrence.`);
		}
		resolved[s.name] = raw;
	}

	const expr = resolveSchedule(bp, resolved).trim();
	const v = validateCronExpr(expr);
	if (!v.ok) throw new BlueprintFillError(`blueprint "${bp.key}" produced an invalid schedule: ${v.error}`);
	const prompt = formatTemplate(bp.promptTemplate, resolved);
	return { name: bp.title, prompt, expr };
}

/* ------------------------------------------------------------------ */
/* slot factories (concise, mirrors Hermes `_TIME` / `_DELIVER`)       */
/* ------------------------------------------------------------------ */

function timeSlot(defaultTime: string, label = "What time?"): BlueprintSlot {
	return { name: "time", type: "time", label, default: defaultTime, help: "24h local time, e.g. 08:00" };
}

function recurrenceSlot(defaultPreset: keyof typeof WEEKDAY_PRESETS = "everyday"): BlueprintSlot {
	return {
		name: "recurrence",
		type: "weekdays",
		label: "Repeat on",
		default: defaultPreset,
		options: Object.keys(WEEKDAY_PRESETS),
	};
}

/* ------------------------------------------------------------------ */
/* curated catalog — vault + web_search only, no phantom integrations  */
/* ------------------------------------------------------------------ */

export const CRON_BLUEPRINTS: AutomationBlueprint[] = [
	{
		key: "daily-digest",
		title: "Daily vault digest",
		description: "A short digest of everything that changed in your vault today.",
		category: "daily",
		scheduleTemplate: "{minute} {hour} * * *",
		promptTemplate:
			"Search the vault for notes created or modified in the last 24 hours. Write a short digest of what changed — one bullet per note with its path. If nothing changed, respond with [SILENT].",
		slots: [timeSlot("09:00")],
		tags: ["daily", "digest"],
	},
	{
		key: "weekly-review",
		title: "Weekly review",
		description: "A weekly recap: what got done, what's still open.",
		category: "weekly",
		scheduleTemplate: "{minute} {hour} * * {dow}",
		promptTemplate:
			"Review the week: search the vault for notes modified in the last 7 days, list what got done and what looks unfinished, and append a short weekly review with file paths. If there is nothing to report, respond with [SILENT].",
		slots: [
			{ name: "day", type: "enum", label: "On which day?", default: "monday", options: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
			timeSlot("09:00"),
		],
		tags: ["weekly", "review"],
	},
	{
		key: "custom-reminder",
		title: "Custom reminder",
		description: "A one-line reminder on your own schedule.",
		category: "general",
		scheduleTemplate: "{minute} {hour} * * {dow}",
		promptTemplate: "Remind the user: {what}. Keep it to one short, friendly line.",
		slots: [
			{ name: "what", type: "text", label: "Remind me to…", default: "take a break and stretch" },
			timeSlot("09:00"),
			recurrenceSlot(),
		],
		tags: ["reminder"],
	},
	{
		key: "bill-renewal-watch",
		title: "Bills & renewals reminder",
		description: "A heads-up before a payment or subscription renews.",
		category: "general",
		scheduleTemplate: "{minute} {hour} * * {dow}",
		promptTemplate:
			"Remind the user about an upcoming payment or renewal: {what}. Phrase it as an actionable heads-up (for example, review or cancel before it renews), not just a notification. One short message.",
		slots: [
			{ name: "what", type: "text", label: "What's due?", default: "my streaming subscription renews soon" },
			timeSlot("10:00"),
			recurrenceSlot(),
		],
		tags: ["reminder", "finance"],
	},
	{
		key: "news-digest",
		title: "Topic news digest",
		description: "A short daily digest of news on a topic you pick.",
		category: "general",
		scheduleTemplate: "{minute} {hour} * * *",
		promptTemplate:
			"Use web_search to find the latest news about {topic} from the last day. Write a short digest — up to five items, each with a one-line summary and its source URL. If web_search returns nothing usable, respond with [SILENT].",
		slots: [
			{ name: "topic", type: "text", label: "Topic", default: "local-first software and AI" },
			timeSlot("08:00"),
		],
		tags: ["news", "web"],
	},
	{
		key: "habit-checkin",
		title: "Habit check-in",
		description: "A gentle daily question about a habit you're building.",
		category: "general",
		scheduleTemplate: "{minute} {hour} * * {dow}",
		promptTemplate: "Ask the user a short check-in about the habit: {habit}. One friendly question, nothing else.",
		slots: [
			{ name: "habit", type: "text", label: "Habit", default: "drinking enough water" },
			timeSlot("21:00"),
			recurrenceSlot(),
		],
		tags: ["habits"],
	},
	{
		key: "learn-daily",
		title: "Daily learning drip",
		description: "One small concept from your own notes, every day.",
		category: "daily",
		scheduleTemplate: "{minute} {hour} * * *",
		promptTemplate:
			"Pick one note from the vault related to {topic} and summarize a single key concept from it in two or three sentences, with the note path. If the vault has no notes on {topic}, say so in one line instead of inventing content.",
		slots: [
			{ name: "topic", type: "text", label: "Topic", default: "anything I've been studying" },
			timeSlot("08:00"),
		],
		tags: ["learning", "daily"],
	},
	{
		key: "gratitude-journal",
		title: "Gratitude & reflection prompt",
		description: "A daily nudge to note one thing that went well.",
		category: "general",
		scheduleTemplate: "{minute} {hour} * * *",
		promptTemplate:
			"Append one short reflection prompt to the target note: invite the user to note one thing that went well today and one thing they are grateful for.",
		slots: [timeSlot("21:00")],
		tags: ["journal"],
	},
	{
		key: "on-this-day",
		title: "On-this-day discovery",
		description: "Surfaces notes you wrote on this day in previous years.",
		category: "daily",
		scheduleTemplate: "{minute} {hour} * * *",
		promptTemplate:
			"Search the vault for notes created on this day in previous years. List the interesting finds with their paths. If there are none, respond with [SILENT].",
		slots: [timeSlot("09:00")],
		tags: ["memory", "daily"],
	},
];

export function blueprintForKey(key: string): AutomationBlueprint | undefined {
	return CRON_BLUEPRINTS.find((b) => b.key === key);
}
