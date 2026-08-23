/** Synthesized completion-sound regression coverage (v0.1.142). */
const path = require("path");
const { execFileSync } = require("child_process");

const out = path.join(__dirname, "dist", "completion-sound.cjs");
execFileSync("npx", ["esbuild", path.join(__dirname, "..", "src", "completionSound.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${out}`], { stdio: "inherit" });
const { CompletionSoundPlayer, COMPLETION_SOUND_VARIANTS, normalizeCompletionSoundVariant } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else { console.error(`✗ ${label}`); failed++; }
};

check(COMPLETION_SOUND_VARIANTS.length === 14, "library exposes exactly 14 synthesized presets");
check(COMPLETION_SOUND_VARIANTS[0].id === 1 && COMPLETION_SOUND_VARIANTS[0].name === "Two-note comfort",
	"approved default is Two-note comfort");
check(new Set(COMPLETION_SOUND_VARIANTS.map((v) => v.id)).size === 14, "all preset ids are unique");
check(normalizeCompletionSoundVariant(14) === 14 && normalizeCompletionSoundVariant(0) === 1 && normalizeCompletionSoundVariant("junk") === 1,
	"variant normalization accepts 1–14 and heals invalid values to default");

let constructed = 0;
let closed = 0;
let resumed = 0;
const scheduled = [];
const makeParam = () => ({
	setValueAtTime(value, at) { scheduled.push(["set", value, at]); },
	exponentialRampToValueAtTime(value, at) { scheduled.push(["ramp", value, at]); },
});
class FakeAudioContext {
	constructor() { constructed++; this.state = "running"; this.currentTime = 5; this.destination = {}; }
	createGain() { return { gain: makeParam(), connect() {} }; }
	createOscillator() {
		return {
			type: "sine",
			frequency: makeParam(),
			connect() {},
			start(at) { scheduled.push(["start", at]); },
			stop(at) { scheduled.push(["stop", at]); },
		};
	}
	async resume() { resumed++; this.state = "running"; }
	async close() { closed++; this.state = "closed"; }
}

let prefs = {
	nativeEnabled: false,
	nativeKinds: {},
	completionSoundEnabled: false,
	completionSoundVariant: 1,
};
let now = 1000;
const player = new CompletionSoundPlayer(() => prefs, { getConstructor: () => FakeAudioContext, now: () => now });
check(player.isSupported(), "AudioContext support uses feature detection");

(async () => {
	check(await player.playCompletion("session-a") === "disabled" && constructed === 0,
		"disabled completion channel creates no AudioContext");
	check(await player.preview(1) === "played" && constructed === 1,
		"Preview works while completion channel is off and creates context lazily");
	const startsAfterPreview = scheduled.filter((x) => x[0] === "start").length;
	check(startsAfterPreview === 2, "Two-note comfort schedules exactly two oscillators");

	prefs.completionSoundEnabled = true;
	check(await player.playCompletion("session-a") === "played", "terminal completion schedules the selected cue");
	check(await player.playCompletion("session-a") === "deduped", "same-context completion is deduped for one second");
	now += 1000;
	prefs.completionSoundVariant = 14;
	const beforeAurora = scheduled.filter((x) => x[0] === "start").length;
	check(await player.playCompletion("session-a") === "played", "completion can play again at the one-second boundary");
	check(scheduled.filter((x) => x[0] === "start").length - beforeAurora === 4,
		"Aurora cascade plan schedules four tones");

	const unsupported = new CompletionSoundPlayer(() => prefs, { getConstructor: () => null });
	check(!unsupported.isSupported() && await unsupported.preview(1) === "unsupported",
		"missing AudioContext degrades safely without throwing");

	player.dispose();
	await Promise.resolve();
	check(closed === 1, "dispose closes the lazily owned AudioContext");
	check(resumed === 0, "already-running AudioContext is not redundantly resumed");

	if (failed) {
		console.error(`\n${failed} completion-sound check(s) failed.`);
		process.exit(1);
	}
	console.log("\nAll completion-sound checks passed.");
})().catch((error) => {
	console.error(error);
	process.exit(1);
});
