const { execSync } = require("child_process");
const path = require("path");
const Module = require("module");

const outEv = path.join(__dirname, "dist", "sessionEvents.cjs");
const outSess = path.join(__dirname, "dist", "sessions-events.cjs");
execSync(
	`npx esbuild src/agent/sessionEvents.ts --bundle --platform=node --format=cjs --outfile=${outEv} && npx esbuild src/agent/sessions.ts --bundle --platform=node --format=cjs --external:obsidian --outfile=${outSess}`,
	{ cwd: path.join(__dirname, ".."), stdio: "inherit" }
);

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "obsidian") return "obsidian-mock";
	return originalResolve.call(this, request, ...args);
};
require.cache["obsidian-mock"] = {
	id: "obsidian-mock",
	filename: "obsidian-mock",
	loaded: true,
	exports: { normalizePath: (p) => p, TFile: class {}, TFolder: class {} },
};

const { sanitizeSessionEvents, clipSessionEventText, SESSION_EVENT_TEXT_MAX, trajectoryRows, eventsToWire, filterTrajectoryRows, resumeMessages, truncateSessionEvents, countContentImages, sessionEvent } = require(outEv);
const { sanitizeSession } = require(outSess);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

check(sanitizeSessionEvents(undefined).length === 0, "missing events → empty");
check(sanitizeSessionEvents("nope").length === 0, "non-array events → empty");
check(
	sanitizeSessionEvents([{ type: "mystery", at: 1 }]).length === 0,
	"unknown type dropped"
);
check(
	sanitizeSessionEvents([{ type: "user/message" }]).length === 0,
	"missing at dropped"
);

const ok = sanitizeSessionEvents([
	{ type: "user/message", at: 10, source: "user", text: "hi" },
	{ type: "tool/call", at: 11, name: "echo_tool", callId: "c1" },
]);
check(ok.length === 2 && ok[0].text === "hi" && ok[1].name === "echo_tool", "known events kept");

const pictured = sessionEvent({
	type: "user/message",
	text: "see [image]",
	images: 2,
});
check(pictured.images === 2, "sessionEvent keeps image count, not pixels");
check(
	sanitizeSessionEvents([{ type: "user/message", at: 1, images: 2 }])[0].images === 2,
	"sanitize keeps images count"
);
check(countContentImages([{ type: "image_url", image_url: { url: "data:x" } }, { type: "text", text: "a" }]) === 1, "countContentImages");
check(
	trajectoryRows([{ type: "user/message", at: 1, text: "hi", images: 1 }]).some((r) => r.label === "You · 1 image"),
	"trajectory: image placeholder on label"
);

const long = "x".repeat(SESSION_EVENT_TEXT_MAX + 50);
const clipped = clipSessionEventText(long);
check(clipped && clipped.includes("truncated") && clipped.length < long.length, "text clipped");

const old = sanitizeSession({
	id: "s1",
	title: "old",
	createdAt: 1,
	updatedAt: 2,
	model: "m",
	turnCount: 0,
	turns: [],
});
check(old.events === undefined, "pre-events session file still loads without events");

const withEv = sanitizeSession({
	id: "s2",
	title: "n",
	createdAt: 1,
	updatedAt: 2,
	model: "m",
	turnCount: 0,
	turns: [],
	events: [{ type: "turn/start", at: 5, source: "system" }, { type: "nope", at: 6 }],
});
check(withEv.events?.length === 1 && withEv.events[0].type === "turn/start", "sanitizeSession keeps valid events only");

const snap = sanitizeSession({
	id: "s3",
	title: "dual",
	createdAt: 1,
	updatedAt: 2,
	model: "m",
	turnCount: 1,
	turns: [],
	messages: [
		{ role: "system", content: "sys" },
		{ role: "user", content: "full-wire-payload" },
		{ role: "user", content: [{ type: "text", text: "cap" }, { type: "image_url", image_url: { url: "data:x" } }] },
	],
	events: [
		{ type: "user/message", at: 1, text: "clipped-user" },
		{ type: "nope", at: 2 },
	],
});
check(snap.messages?.length === 3 && snap.events?.length === 1, "persist snapshot keeps messages[] and sanitized events[]");
const fromSnap = resumeMessages(snap);
check(fromSnap[1].content === "full-wire-payload", "persist snapshot: lossless text wire not replaced by shorter log");
check(Array.isArray(fromSnap[2].content), "persist snapshot: multimodal message survives sanitize+resume");

const rows = trajectoryRows([
	{ type: "turn/start", at: 1 },
	{ type: "user/message", at: 2, text: "hello there" },
	{ type: "step/start", at: 3, step: 1 },
	{ type: "assistant/message", at: 4, text: "hi" },
	{ type: "tool/call", at: 5, name: "echo_tool", text: '{"x":1}' },
	{ type: "tool/result", at: 6, name: "echo_tool", status: "done", text: "ok" },
	{ type: "step/end", at: 7, step: 1 },
	{ type: "turn/end", at: 8 },
]);
check(rows[0].kind === "heading" && rows[0].label === "Turn 1", "trajectory: turn heading");
check(rows.some((r) => r.label === "You" && r.detail === "hello there" && r.body === "hello there"), "trajectory: user row");
check(rows.some((r) => r.label === "echo_tool · done"), "trajectory: tool result row");
check(!rows.some((r) => r.type === "turn/end" || r.type === "step/end"), "trajectory: skip end wrappers");

const wireLog = [
	{ type: "turn/start", at: 1, source: "system" },
	{ type: "user/message", at: 2, text: "hi" },
	{ type: "step/start", at: 3, step: 1 },
	{ type: "assistant/message", at: 4, text: "calling" },
	{ type: "tool/call", at: 5, name: "echo_tool", callId: "c1", text: "{\"x\":1}" },
	{ type: "tool/result", at: 6, name: "echo_tool", callId: "c1", status: "done", text: "ok" },
	{ type: "inject", at: 7, callId: "c1", text: "\n<<steer>>go\n<</steer>>" },
	{ type: "step/end", at: 8, step: 1 },
	{ type: "assistant/message", at: 9, text: "done" },
	{ type: "turn/end", at: 10 },
];
const wire = eventsToWire(wireLog);
check(wire.length === 4, "eventsToWire drops wrappers (4 conversation messages)");
check(wire[0].role === "user" && wire[0].content === "hi", "eventsToWire: user");
check(wire[1].role === "assistant" && wire[1].tool_calls?.[0]?.id === "c1", "eventsToWire: assistant + tool_calls");
check(wire[1].content === "calling", "eventsToWire: assistant text kept");
check(wire[2].role === "tool" && String(wire[2].content).includes("ok") && String(wire[2].content).includes("steer"), "eventsToWire: inject lands on matching tool result");
check(wire[3].role === "assistant" && wire[3].content === "done", "eventsToWire: final assistant");

const onlyUser = filterTrajectoryRows(rows, "user");
check(onlyUser.some((r) => r.label === "You") && !onlyUser.some((r) => r.type === "tool/call"), "filter: user hides tools");
check(filterTrajectoryRows(rows, "tool").some((r) => r.type === "tool/call"), "filter: tool keeps calls");

const stored = [
	{ role: "system", content: "sys" },
	{ role: "user", content: "old-user" },
	{ role: "assistant", content: "old-asst" },
];
const resumed = resumeMessages({ messages: stored, events: wireLog });
check(resumed[0].role === "system" && resumed[0].content === "sys", "resume: keep system from messages");
check(resumed[1].role === "user" && resumed[1].content === "hi", "resume: conversation from events");
check(resumeMessages({ messages: stored, events: [] })[1].content === "old-user", "resume: no events → messages");
check(
	resumeMessages({
		messages: stored.concat([{ role: "tool", content: "t", tool_call_id: "x" }]),
		events: [{ type: "user/message", at: 1, text: "only-user" }],
	})[1].content === "old-user",
	"resume: incomplete log does not replace a longer wire"
);
check(
	resumeMessages({
		messages: [{ role: "user", content: "full-wire" }],
		events: [{ type: "user/message", at: 1, text: "clipped" }],
	})[0].content === "full-wire",
	"resume: equal-length messages keep the lossless wire"
);
check(
	resumeMessages({
		messages: [{ role: "user", content: [{ type: "text", text: "pic" }, { type: "image_url", image_url: { url: "data:x" } }] }],
		events: [{ type: "user/message", at: 1, text: "pic" }],
	})[0].content[0].type === "text",
	"resume: multimodal wire wins over text-only events"
);

const truncated = truncateSessionEvents(wireLog, 1);
check(eventsToWire(truncated).length === 1 && eventsToWire(truncated)[0].role === "user", "truncate to last remaining user");
check(!truncated.some((e) => e.type === "assistant/message"), "truncate drops the undone assistant");
check(truncateSessionEvents(wireLog, 0).length === 0, "truncate empty wire clears log");
check(
	eventsToWire(truncateSessionEvents(wireLog, 3)).length === 3,
	"truncate keeps user + assistant + tool result"
);

if (failed) {
	console.error(`\n${failed} session-event check(s) failed`);
	process.exit(1);
}
console.log("\nAll session-event checks passed.");
