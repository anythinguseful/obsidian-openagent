/**
 * Tests for the automation blueprint catalog (cronBlueprints.ts) — pure data
 * + fill logic. Pins the curated catalog, locks the honesty contract (no
 * phantom integrations in the prompts), and verifies the slot→schedule/prompt
 * filling end-to-end (time → minute/hour, weekdays/day → dow).
 */

const { execSync } = require("child_process");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "cron-blueprints.cjs");
execSync(`npx esbuild src/agent/cronBlueprints.ts --bundle --platform=node --format=cjs --outfile=${out}`, { cwd: root, stdio: "inherit" });

const { CRON_BLUEPRINTS, blueprintForKey, fillBlueprint, BlueprintFillError, WEEKDAY_PRESETS, DAY_TO_DOW } = require(out);
// validateCronExpr lives in cron.ts (bundled as a dependency of cronBlueprints).
const cronOut = path.join(__dirname, "dist", "cron.cjs");
execSync(`npx esbuild src/agent/cron.ts --bundle --platform=node --format=cjs --outfile=${cronOut}`, { cwd: root, stdio: "inherit" });
const { validateCronExpr, describeCronExpr } = require(cronOut);

const tests = [];
function t(name, fn) {
	tests.push({ name, fn });
}

t("catalog ships 9 curated blueprints, unique keys", () => {
	assert.strictEqual(CRON_BLUEPRINTS.length, 9);
	const keys = CRON_BLUEPRINTS.map((b) => b.key);
	assert.strictEqual(new Set(keys).size, keys.length);
});

t("blueprintForKey resolves", () => {
	assert.strictEqual(blueprintForKey("daily-digest").title, "Daily vault digest");
	assert.strictEqual(blueprintForKey("nope"), undefined);
});

t("honesty contract: prompts reference only vault/web tools, never phantom integrations", () => {
	const banned = ["gmail", "calendar", "weather", "inbox", "email", "slack", "telegram", "google-workspace"];
	for (const bp of CRON_BLUEPRINTS) {
		const p = (bp.promptTemplate + " " + bp.description).toLowerCase();
		for (const word of banned) {
			assert.ok(!p.includes(word), `${bp.key}: prompt mentions phantom integration "${word}"`);
		}
	}
	// every prompt names a real capability surface
	for (const bp of CRON_BLUEPRINTS) {
		const p = bp.promptTemplate.toLowerCase();
		const okCap =
			p.includes("search the vault") ||
			p.includes("from the vault") ||
			p.includes("web_search") ||
			p.includes("append") ||
			p.includes("target note") ||
			p.includes("respond") ||
			p.includes("remind the user") ||
			p.includes("ask the user");
		assert.ok(okCap, `${bp.key}: prompt does not reference a real capability`);
	}
});

t("every blueprint has structurally valid slots", () => {
	for (const bp of CRON_BLUEPRINTS) {
		for (const s of bp.slots) {
			assert.ok(["time", "enum", "text", "weekdays"].includes(s.type), `${bp.key}/${s.name}: bad type`);
			if (s.type === "enum" || s.type === "weekdays") {
				assert.ok(Array.isArray(s.options) && s.options.length > 0, `${bp.key}/${s.name}: options required`);
			}
		}
	}
});

t("every blueprint fills to a valid, human-describable schedule with defaults only", () => {
	for (const bp of CRON_BLUEPRINTS) {
		const { expr, prompt, name } = fillBlueprint(bp, {});
		assert.strictEqual(name, bp.title);
		const v = validateCronExpr(expr);
		assert.ok(v.ok, `${bp.key}: "${expr}" invalid — ${v.error}`);
		assert.ok(describeCronExpr(expr), `${bp.key}: no human label for "${expr}"`);
		assert.ok(prompt.length > 10, `${bp.key}: prompt too short`);
		assert.ok(!prompt.includes("{"), `${bp.key}: prompt left an unfilled placeholder`);
	}
});

t("time slot: 09:00 -> minute 0, hour 9", () => {
	const { expr } = fillBlueprint(blueprintForKey("daily-digest"), { time: "09:00" });
	assert.strictEqual(expr, "0 9 * * *");
});

t("time slot: leading zero handled (07:05)", () => {
	const { expr } = fillBlueprint(blueprintForKey("daily-digest"), { time: "07:05" });
	assert.strictEqual(expr, "5 7 * * *");
});

t("weekdays slot: recurrence maps to dow", () => {
	const bp = blueprintForKey("custom-reminder");
	assert.strictEqual(fillBlueprint(bp, { recurrence: "everyday" }).expr, "0 9 * * *");
	assert.strictEqual(fillBlueprint(bp, { recurrence: "weekdays" }).expr, "0 9 * * 1-5");
	assert.strictEqual(fillBlueprint(bp, { recurrence: "weekends" }).expr, "0 9 * * 0,6");
});

t("weekly-review: day enum maps to dow", () => {
	const bp = blueprintForKey("weekly-review");
	assert.strictEqual(fillBlueprint(bp, { day: "monday", time: "08:00" }).expr, "0 8 * * 1");
	assert.strictEqual(fillBlueprint(bp, { day: "sunday", time: "08:00" }).expr, "0 8 * * 0");
});

t("text slot: custom-reminder renders {what}", () => {
	const bp = blueprintForKey("custom-reminder");
	const { prompt } = fillBlueprint(bp, { what: "water the plants" });
	assert.ok(prompt.includes("water the plants"));
});

t("text slot: news-digest renders {topic}", () => {
	const bp = blueprintForKey("news-digest");
	const { prompt } = fillBlueprint(bp, { topic: "solar power" });
	assert.ok(prompt.includes("solar power"));
});

t("invalid time throws BlueprintFillError", () => {
	assert.throws(() => fillBlueprint(blueprintForKey("daily-digest"), { time: "25:00" }), BlueprintFillError);
	assert.throws(() => fillBlueprint(blueprintForKey("daily-digest"), { time: "9am" }), BlueprintFillError);
});

t("invalid enum throws BlueprintFillError", () => {
	assert.throws(() => fillBlueprint(blueprintForKey("weekly-review"), { day: "funday" }), BlueprintFillError);
});

t("unknown slot throws BlueprintFillError", () => {
	assert.throws(() => fillBlueprint(blueprintForKey("daily-digest"), { what: "x" }), BlueprintFillError);
});

t("missing required value throws (synthetic blueprint without a default)", () => {
	const bp = {
		key: "synthetic",
		title: "Synthetic",
		description: "",
		category: "general",
		scheduleTemplate: "{minute} {hour} * * *",
		promptTemplate: "hi {note}",
		slots: [{ name: "note", type: "text", label: "Note" }],
	};
	assert.throws(() => fillBlueprint(bp, {}), BlueprintFillError);
});

(async () => {
	let passed = 0;
	let failed = 0;
	for (const { name, fn } of tests) {
		try {
			await fn();
			passed++;
			console.log(`✓ ${name}`);
		} catch (err) {
			failed++;
			console.error(`✗ ${name}\n    ${err && err.message ? err.message : err}`);
		}
	}
	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
})();
