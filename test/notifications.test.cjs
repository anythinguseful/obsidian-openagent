/** Native notification dispatcher regression coverage (v0.1.142). */
const path = require("path");
const { execFileSync } = require("child_process");

const out = path.join(__dirname, "dist", "notifications.cjs");
execFileSync("npx", ["esbuild", path.join(__dirname, "..", "src", "notifications.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${out}`], { stdio: "inherit" });
const { NativeNotificationService } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else { console.error(`✗ ${label}`); failed++; }
};

const defaults = () => ({
	nativeEnabled: false,
	nativeKinds: {
		turnDone: true,
		turnError: true,
		approvalRequired: true,
		inputRequired: true,
		backgroundDone: true,
		backgroundError: true,
	},
	completionSoundEnabled: false,
	completionSoundVariant: 1,
});

const created = [];
let requested = 0;
class MockNotification {
	static permission = "granted";
	static async requestPermission() { requested++; MockNotification.permission = "granted"; return "granted"; }
	constructor(title, options) {
		this.title = title;
		this.options = options;
		this.listeners = {};
		this.closed = false;
		this.onclick = this.onclose = this.onerror = null;
		created.push(this);
	}
	addEventListener(type, fn) { this.listeners[type] = fn; }
	close() { this.closed = true; this.listeners.close?.(); }
	fire(type) { this.listeners[type]?.(); }
}

let prefs = defaults();
let desktop = true;
let away = true;
let chatVisible = false;
let now = 10_000;
let activated = 0;
const service = new NativeNotificationService(
	() => prefs,
	{
		isDesktop: () => desktop,
		isAway: () => away,
		isChatVisible: () => chatVisible,
		activateChat: () => { activated++; },
		getConstructor: () => MockNotification,
		now: () => now,
	}
);

check(service.dispatch({ kind: "turnDone", contextId: "session-secret" }) === "master-disabled" && created.length === 0,
	"master defaults off and emits nothing");
prefs.nativeEnabled = true;
away = false;
check(service.dispatch({ kind: "turnDone", contextId: "a" }) === "not-away", "completion is away-only");
check(service.dispatch({ kind: "turnError", contextId: "a" }) === "not-away", "interactive error is away-only");
check(service.dispatch({ kind: "backgroundDone", contextId: "cron" }) === "not-away", "background completion is away-only");
check(service.dispatch({ kind: "backgroundError", contextId: "cron" }) === "not-away", "background error is away-only");
chatVisible = true;
check(service.dispatch({ kind: "approvalRequired", contextId: "a" }) === "chat-visible", "approval suppresses while foreground chat is visible");
chatVisible = false;
check(service.dispatch({ kind: "approvalRequired", contextId: "a" }, { silent: true }) === "shown", "approval may alert while foreground chat pane is not visible");
check(created[0].options.silent === true, "dispatcher passes explicit silent flag for no-double-sound path");
check(created[0].title === "Open Agent needs approval" && created[0].options.body === "Review the pending action in Obsidian.",
	"native title/body are fixed privacy-safe copy");
check(!JSON.stringify(created[0]).includes("session-secret") && !JSON.stringify(created[0]).includes("cron"),
	"context ids and task/session content do not enter notification payload");
created[0].fire("click");
setImmediate(() => {});
check(created[0].closed && activated === 1, "click closes banner and focuses/opens chat callback");

away = true;
now += 500;
check(service.dispatch({ kind: "inputRequired", contextId: "a" }) === "shown", "throttle is scoped per kind/context rather than suppressing a distinct attention event");
check(service.dispatch({ kind: "inputRequired", contextId: "a" }) === "throttled", "one-second throttle blocks the same kind/context duplicate");
now += 1000;
check(service.dispatch({ kind: "inputRequired", contextId: "a" }) === "shown", "throttle allows the same kind/context at the one-second boundary");
prefs.nativeKinds.turnError = false;
now += 1000;
check(service.dispatch({ kind: "turnError", contextId: "a" }) === "kind-disabled", "per-kind off gate is honored");

MockNotification.permission = "default";
now += 1000;
check(service.dispatch({ kind: "turnDone", contextId: "a" }) === "permission-not-granted" && requested === 0,
	"background dispatch never requests permission");
prefs.nativeEnabled = false;
const beforeTest = created.length;
service.testFromUserGesture().then((result) => {
	check(result === "sent" && requested === 1 && created.length === beforeTest + 1,
		"user-gesture test requests permission and bypasses disabled master/gates");
	check(created.at(-1).options.tag === "openagent:test", "test notification uses a stable dedicated tag");

	MockNotification.permission = "denied";
	return service.testFromUserGesture();
}).then((result) => {
	check(result === "denied", "denied permission returns an honest test result");
	desktop = false;
	check(service.status().reason === "mobile" && service.status().permission === "unavailable", "mobile platform reports unsupported before API use");
	service.dispose();
	check(created.every((n) => n.closed), "dispose closes tracked native handles");

	if (failed) {
		console.error(`\n${failed} notification check(s) failed.`);
		process.exit(1);
	}
	console.log("\nAll native notification checks passed.");
}).catch((error) => {
	console.error(error);
	process.exit(1);
});
