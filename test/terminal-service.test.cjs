/** Terminal & Processes v1 — deterministic desktop-runtime security tests. */
const { execSync } = require("child_process");
const { EventEmitter } = require("events");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "terminal-service.cjs");
execSync(
	`npx esbuild src/agent/terminal/service.ts --bundle --platform=node --format=cjs --external:obsidian --outfile=${out}`,
	{ cwd: root, stdio: "inherit" }
);
const { DesktopTerminalService } = require(out);
const workspaceOut = path.join(__dirname, "dist", "terminal-workspace.cjs");
execSync(
	`npx esbuild src/agent/workspacePolicy.ts --bundle --platform=node --format=cjs --outfile=${workspaceOut}`,
	{ cwd: root, stdio: "inherit" }
);
const { WorkspacePolicy } = require(workspaceOut);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else { console.error(`✗ ${label}`); failed++; }
};
async function rejects(label, fn, part = "") {
	try { await fn(); check(false, label); }
	catch (e) { check(!part || String(e.message).includes(part), `${label}${part ? ` (“${e.message}”)` : ""}`); }
}

const IMAGE_ID = `sha256:${"a".repeat(64)}`;
const IMAGE_ID_2 = `sha256:${"b".repeat(64)}`;

class FakeChild extends EventEmitter {
	constructor() {
		super();
		this.stdout = new EventEmitter();
		this.stderr = new EventEmitter();
		this.stdin = { end: () => { this.stdinClosed = true; } };
		this.stdinClosed = false;
		this.closed = false;
	}
	kill(signal = "SIGTERM") {
		if (!this.closed) {
			this.closed = true;
			queueMicrotask(() => this.emit("close", null, signal));
		}
		return true;
	}
	finish(code = 0, signal = null) {
		if (this.closed) return;
		this.closed = true;
		this.emit("close", code, signal);
	}
}

class FakeRuntime {
	constructor() {
		this.platform = "linux";
		this.sep = path.sep;
		this.resolve = path.resolve;
		this.join = path.join;
		this.relative = path.relative;
		this.uid = 1000;
		this.gid = 1000;
		this.env = { PATH: "/usr/bin", HOME: "/home/test", SHELL: "/bin/sh", SECRET_TOKEN: "must-not-reach-local" };
		this.calls = [];
		this.nextId = 1;
		this.holdDockerRuns = false;
		this.imageId = IMAGE_ID;
		this.lastRun = null;
	}
	randomId = () => `id-${this.nextId++}`;
	realpath = async (p) => {
		const clean = path.resolve(p);
		if (clean === path.resolve("/vault/link")) return path.resolve("/outside");
		return clean;
	};
	stat = async (p) => ({
		isDirectory: () => !String(p).endsWith("blocked.txt"),
		isFile: () => String(p).endsWith("blocked.txt"),
	});
	spawn = (command, args, options) => {
		const child = new FakeChild();
		this.calls.push({ command, args: [...args], options, child });
		if (command === "docker" && args[0] === "image") {
			queueMicrotask(() => {
				child.stdout.emit("data", `${this.imageId}\n`);
				child.finish(0);
			});
		} else if (command === "docker" && args[0] === "run") {
			this.lastRun = child;
			queueMicrotask(() => {
				child.stdout.emit("data", "hello from container\n");
				if (!this.holdDockerRuns) child.finish(0);
			});
		} else if (command === "docker" && args[0] === "rm") {
			queueMicrotask(() => child.finish(0));
		} else if (command === "docker" && args[0] === "version") {
			queueMicrotask(() => { child.stdout.emit("data", "27.1.0\n"); child.finish(0); });
		} else {
			queueMicrotask(() => { child.stdout.emit("data", "local ok\n"); child.finish(0); });
		}
		return child;
	};
}

function settings(overrides = {}) {
	const base = {
		toolsets: { terminal: true },
		terminal: {
			backend: "docker",
			dockerImage: "example/runtime:1",
			consentVersion: 1,
			consentReceipt: "a".repeat(64),
			localExpertEnabled: false,
		},
		approvalMode: "cautious",
		workspaceMode: "whole-vault",
		workspaceFolder: "",
		workspaceExcludedFolders: ["Private", "blocked.txt"],
		fileReadMaxChars: 20000,
	};
	return {
		...base,
		...overrides,
		toolsets: { ...base.toolsets, ...(overrides.toolsets || {}) },
		terminal: { ...base.terminal, ...(overrides.terminal || {}) },
	};
}

const app = {
	vault: {
		configDir: ".obsidian",
		adapter: { getBasePath: () => "/vault" },
	},
};

function context(s, policyOverrides = {}, identity = { kind: "interactive-chat", sessionId: "chat-a", runId: "run-1" }) {
	return {
		settings: s,
		workspacePolicy: new WorkspacePolicy({ ...s, ...policyOverrides }, ".obsidian"),
		execution: identity,
	};
}

(async () => {
	let live = settings();
	const runtime = new FakeRuntime();
	const service = new DesktopTerminalService(app, { getSettings: () => live, getRuntime: () => runtime, now: () => 1000 });

	const prepared = await service.prepareTerminal(
		{ command: "printf hello", cwd: "Project", timeout_seconds: 7, background: false },
		context(live)
	);
	check(prepared.forceApproval === true && prepared.allowAlways === false, "every terminal start forces exact allow-once approval");
	check(prepared.approvalDetails.command === "printf hello" && prepared.approvalDetails.resolved_image === IMAGE_ID, "approval freezes command and resolved image identity");
	check(prepared.approvalDetails.network === "none" && prepared.approvalDetails.stdin === "closed", "approval exposes network-off and closed-stdin invariants");
	check(prepared.approvalDetails.masked_paths.includes(".obsidian") && prepared.approvalDetails.masked_paths.includes("Private"), "approval exposes protected and excluded masks");
	check(await prepared.revalidate() === null, "prepared approval revalidates when physical scope/image/settings are unchanged");
	runtime.imageId = IMAGE_ID_2;
	check(String(await prepared.revalidate()).includes("image identity changed"), "configured Docker tag drift expires the prepared approval");
	runtime.imageId = IMAGE_ID;
	const result = await prepared.execute();
	check(result.includes("exit 0") && result.includes("hello from container"), "foreground Docker output and exit state are bounded result data");
	const dockerRun = runtime.calls.find((c) => c.command === "docker" && c.args[0] === "run");
	const joined = dockerRun.args.join(" ");
	check(joined.includes("--network none") && joined.includes("--read-only") && joined.includes("--cap-drop ALL"), "Docker command enforces network/rootfs/capability hardening");
	check(joined.includes("bind-recursive=disabled"), "Docker Workspace bind refuses unrelated nested host submounts");
	check(joined.includes("--pids-limit 128") && joined.includes("--memory 512m") && joined.includes("--cpus 1"), "Docker command enforces process/memory/CPU capacity limits");
	check(joined.includes("--pull never") && joined.includes(IMAGE_ID) && !joined.includes("example/runtime:1 /bin/sh"), "execution uses frozen local image ID and never pulls");
	check(dockerRun.child.stdinClosed === true && dockerRun.options.stdio[0] === "ignore", "spawn closes stdin and allocates no PTY");
	check(joined.includes("type=tmpfs,dst=/workspace/.obsidian") && joined.includes("type=bind,src=/dev/null,dst=/workspace/blocked.txt,readonly"), "Docker mount masks config directories and excluded files");

	const stale = await service.prepareTerminal({ command: "echo stale" }, context(live));
	live = settings({ workspaceExcludedFolders: ["Private", "NewSecret"] });
	check((await stale.revalidate()).includes("changed"), "settings/Workspace change expires an already prepared approval");
	live = settings();
	await service.reconcile(live);

	await rejects(
		"physical cwd symlink escape is refused",
		() => service.prepareTerminal({ command: "pwd", cwd: "link" }, context(live)),
		"outside the physical Workspace"
	);
	const linkedRoot = settings({ workspaceMode: "strict-folder", workspaceFolder: "link" });
	live = linkedRoot;
	await rejects(
		"physical Workspace root symlink escape is refused",
		() => service.prepareTerminal({ command: "pwd" }, context(linkedRoot)),
		"outside the physical vault"
	);
	live = settings();
	await rejects("NUL command is refused", () => service.prepareTerminal({ command: "echo\0bad" }, context(live)), "NUL");
	await rejects("unbounded foreground timeout is refused", () => service.prepareTerminal({ command: "x", timeout_seconds: 121 }, context(live)), "1 to 120");

	const strictLocal = settings({ terminal: { backend: "local", localExpertEnabled: true }, workspaceMode: "strict-folder", workspaceFolder: "Project" });
	live = strictLocal;
	await rejects("Local backend is refused in Strict Workspace mode", () => service.prepareTerminal({ command: "pwd" }, context(strictLocal)), "Strict Workspace");
	const yoloLocal = settings({ terminal: { backend: "local", localExpertEnabled: true }, approvalMode: "yolo" });
	live = yoloLocal;
	await rejects("Local backend is refused in YOLO", () => service.prepareTerminal({ command: "pwd" }, context(yoloLocal)), "YOLO");
	const local = settings({ terminal: { backend: "local", localExpertEnabled: true } });
	live = local;
	await rejects("Local backend is foreground-only", () => service.prepareTerminal({ command: "pwd", background: true }, context(local)), "foreground-only");
	const localPrepared = await service.prepareTerminal({ command: "env" }, context(local));
	check(localPrepared.forceApproval === true, "Local expert command still forces approval");
	await localPrepared.execute();
	const localCall = runtime.calls.find((c) => c.command === "/bin/sh");
	check(localCall && !Object.prototype.hasOwnProperty.call(localCall.options.env, "SECRET_TOKEN"), "Local execution receives a minimal environment without ambient secret variables");

	/* v0.1.173 (owner report 2026-08-21 — "FINDSTR: Cannot open Physical"):
	   Windows local commands must ride Node's shell:true shape — ONE
	   quote-wrapped argument under /d /s /c, passed VERBATIM — so cmd's own
	   /S rule owns embedded quotes instead of Node re-quoting (which doubled
	   and mangled them into broken findstr/&&/pipe tokens). */
	{
		const win = settings({ terminal: { backend: "local", localExpertEnabled: true } });
		live = win;
		runtime.platform = "win32";
		runtime.env = { ComSpec: "C:\\Windows\\System32\\cmd.exe", PATH: "C:\\Windows\\System32" };
		const winPrepared = await service.prepareTerminal(
			{ command: 'systeminfo | findstr /C:"OS Name" /C:"Total Physical Memory"' },
			context(win)
		);
		await winPrepared.execute();
		const winCall = runtime.calls.find((c) => String(c.command).toLowerCase().includes("cmd.exe"));
		check(
			winCall &&
				winCall.args[0] === "/d" &&
				winCall.args[1] === "/s" &&
				winCall.args[2] === "/c" &&
				winCall.args[3] === '"systeminfo | findstr /C:"OS Name" /C:"Total Physical Memory""' &&
				winCall.options.windowsVerbatimArguments === true,
			"Windows local command = cmd /d /s /c with ONE verbatim quote-wrapped arg (Node shell:true parity)"
		);
		check(
			service.describeShell(win).includes("cmd.exe") && service.describeShell(win).includes("not bash"),
			"shell hint names the Windows cmd.exe dialect for the model"
		);
		runtime.platform = "linux";
		runtime.env = { PATH: "/usr/bin", HOME: "/home/test", SHELL: "/bin/sh", SECRET_TOKEN: "must-not-reach-local" };
		live = settings();
	}
	check(
		service.describeShell(settings({ terminal: { backend: "docker" } })).includes("Docker container") &&
			service.describeShell(settings({ terminal: { backend: "docker" } })).includes("/bin/sh"),
		"shell hint: Docker backend → POSIX /bin/sh"
	);
	check(
		service.describeShell(settings({ terminal: { backend: "local", localExpertEnabled: true } })).includes("POSIX /bin/sh"),
		"shell hint: POSIX local backend → /bin/sh"
	);
	await rejects(
		"Local backend without the expert opt-in is refused with actionable guidance",
		() => service.prepareTerminal({ command: "pwd" }, context(settings({ terminal: { backend: "local", localExpertEnabled: false } }))),
		"Settings → Capabilities"
	);

	live = settings();
	await service.reconcile(live);
	const bgRuntime = runtime;
	bgRuntime.holdDockerRuns = true;
	const foreground = await service.prepareTerminal({ command: "foreground-one", timeout_seconds: 60 }, context(live));
	const foregroundResult = foreground.execute();
	const secondForeground = await service.prepareTerminal({ command: "foreground-two", timeout_seconds: 60 }, context(live));
	await rejects("one chat cannot start concurrent foreground commands", () => secondForeground.execute(), "already owns");
	const stoppedForeground = await service.stopSession("chat-a");
	check(stoppedForeground === 1 && (await foregroundResult).includes("SIGKILL"), "session cleanup owns and stops an active foreground command");
	const bg = await service.prepareTerminal({ command: "long-task", background: true, timeout_seconds: 60 }, context(live));
	const started = JSON.parse(await bg.execute());
	check(/^proc_/.test(started.process_id) && started.status === "running", "Docker background start returns an opaque owned process id");
	const listed = await service.prepareProcess({ action: "list" }, context(live));
	check(listed.allowAlways === false && JSON.parse(await listed.execute()).length === 1, "process list is session-scoped and cannot grant allow-always");
	const polled = await service.prepareProcess({ action: "poll", process_id: started.process_id, offset: 0, limit: 1000 }, context(live));
	check(JSON.parse(await polled.execute()).output.includes("hello from container"), "process poll returns bounded captured output with offsets");
	await rejects(
		"another chat cannot address an owned process",
		() => service.prepareProcess({ action: "poll", process_id: started.process_id }, context(live, {}, { kind: "interactive-chat", sessionId: "chat-b", runId: "run-2" })),
		"not found"
	);
	const kill = await service.prepareProcess({ action: "kill", process_id: started.process_id }, context(live));
	check(kill.forceApproval === true && kill.allowAlways === false, "process kill requires allow-once approval");
	await kill.execute();
	check((JSON.parse(await (await service.prepareProcess({ action: "list" }, context(live))).execute()))[0].status === "killed", "kill transitions the owned process lifecycle");

	const capacityIds = [];
	for (let i = 0; i < 3; i++) {
		const call = await service.prepareTerminal(
			{ command: `sleep ${i + 1}`, background: true, timeout_seconds: 300 },
			context(live, {}, { kind: "interactive-chat", sessionId: "chat-cap", runId: `run-cap-${i}` })
		);
		capacityIds.push(JSON.parse(await call.execute()).process_id);
	}
	let capacityRefused = "";
	try {
		const fourth = await service.prepareTerminal(
			{ command: "sleep 4", background: true, timeout_seconds: 300 },
			context(live, {}, { kind: "interactive-chat", sessionId: "chat-cap", runId: "run-cap-4" })
		);
		await fourth.execute();
	} catch (err) {
		capacityRefused = err instanceof Error ? err.message : String(err);
	}
	check(capacityIds.length === 3 && capacityRefused.includes("already owns 3"), "per-chat process capacity fails closed at three running processes");
	live = settings({ terminal: { dockerImage: "example/runtime:2" } });
	await service.reconcile(live);
	const afterReconcile = JSON.parse(await (await service.prepareProcess(
		{ action: "list" },
		context(live, {}, { kind: "interactive-chat", sessionId: "chat-cap", runId: "run-cap-list" })
	)).execute());
	check(afterReconcile.every((p) => p.status !== "running"), "security-relevant settings reconciliation stops all running processes");

	const health = await service.health(live);
	check(health.ok && health.backend === "docker", "Docker health check is bounded and explicit");
	await service.dispose();
	check((await service.stopAll()) === 0, "dispose is idempotent and leaves no owned process running");

	if (failed) {
		console.error(`\n${failed} terminal-service check(s) failed`);
		process.exit(1);
	}
	console.log("\nAll terminal-service checks passed.");
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
