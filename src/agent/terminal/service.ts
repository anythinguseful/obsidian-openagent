import type { App } from "obsidian";
import type { OpenAgentSettings } from "../../settings";
import { canonicalVaultPath, pathContains, WorkspacePolicy } from "../workspacePolicy";
import type { PreparedToolCall } from "../tools";
import type {
	ProcessAction,
	ProcessInput,
	TerminalApi,
	TerminalCommandInput,
	TerminalHealth,
	TerminalPrepareContext,
} from "./types";

const MAX_COMMAND_CHARS = 16_384;
const MAX_FOREGROUND_SECONDS = 120;
const MAX_BACKGROUND_SECONDS = 900;
const MAX_CAPTURE_CHARS = 200_000;
const MAX_PROCESS_LOG_CHARS = 1_000_000;
const MAX_PROCESS_RETURN_CHARS = 20_000;
const MAX_SESSION_PROCESSES = 3;
const MAX_GLOBAL_PROCESSES = 8;
const MAX_SESSION_FOREGROUND = 1;
const MAX_GLOBAL_FOREGROUND = 4;
const MAX_RETAINED_PROCESSES = 64;
const DOCKER_CONTROL_TIMEOUT_MS = 5_000;
const FINISHED_RETENTION_MS = 10 * 60_000;
const IMAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._/:@+-]{0,255}$/;

interface SpawnedChild {
	stdout?: { on(event: "data", cb: (chunk: unknown) => void): void };
	stderr?: { on(event: "data", cb: (chunk: unknown) => void): void };
	stdin?: { end(): void };
	on(event: "error", cb: (err: Error) => void): void;
	on(event: "close", cb: (code: number | null, signal: string | null) => void): void;
	kill(signal?: string): boolean;
}

export interface TerminalRuntime {
	platform: string;
	spawn(command: string, args: string[], options: Record<string, unknown>): SpawnedChild;
	realpath(path: string): Promise<string>;
	stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }>;
	resolve(...parts: string[]): string;
	join(...parts: string[]): string;
	relative(from: string, to: string): string;
	sep: string;
	randomId(): string;
	uid?: number;
	gid?: number;
	env?: Record<string, string | undefined>;
}

interface PhysicalScope {
	vaultRoot: string;
	scopeRoot: string;
	scopeLogical: string;
	cwd: string;
	cwdRelative: string;
	masks: { relative: string; kind: "directory" | "file" }[];
}

interface ProcessRecord {
	id: string;
	ownerSessionId: string;
	ownerRunId: string;
	containerName: string;
	command: string;
	cwdRelative: string;
	image: string;
	startedAt: number;
	finishedAt?: number;
	status: "running" | "completed" | "failed" | "killed" | "timed-out";
	exitCode: number | null;
	exitSignal: string | null;
	output: string;
	baseOffset: number;
	child: SpawnedChild;
	timeoutHandle?: ReturnType<typeof setTimeout>;
	retentionHandle?: ReturnType<typeof setTimeout>;
	done: Promise<void>;
	resolveDone: () => void;
}

interface ServiceOptions {
	getSettings: () => OpenAgentSettings;
	getRuntime?: () => TerminalRuntime;
	now?: () => number;
}

function controlFreeString(value: unknown, label: string, max: number): string {
	if (typeof value !== "string") throw new Error(`${label} must be a string.`);
	const text = value.trim();
	if (!text) throw new Error(`${label} cannot be empty.`);
	if (text.length > max) throw new Error(`${label} exceeds ${max} characters.`);
	if (/[\u0000]/.test(text)) throw new Error(`${label} contains a NUL character.`);
	return text;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
	if (value === undefined || value === null || value === "") return fallback;
	const n = Number(value);
	if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) {
		throw new Error(`${label} must be an integer from ${min} to ${max}.`);
	}
	return n;
}

function pathInside(runtime: TerminalRuntime, root: string, candidate: string): boolean {
	const rel = runtime.relative(root, candidate);
	return rel === "" || (
		!rel.startsWith(`..${runtime.sep}`) &&
		rel !== ".." &&
		!rel.startsWith("/") &&
		!rel.startsWith("\\") &&
		!/^[A-Za-z]:/.test(rel)
	);
}

function outputText(chunk: unknown): string {
	if (typeof chunk === "string") return chunk;
	const maybe = chunk as { toString?: (encoding?: string) => string };
	return maybe?.toString?.("utf8") ?? String(chunk);
}

function settingsIdentity(settings: OpenAgentSettings, policy: WorkspacePolicy): string {
	return JSON.stringify({
		enabled: settings.toolsets.terminal === true,
		approvalMode: settings.approvalMode,
		terminal: settings.terminal,
		/* Never rely on the compact UI/session fingerprint alone for an
		   execution boundary: compare every Workspace security field exactly. */
		workspace: {
			mode: policy.mode,
			root: policy.root,
			exclusions: [...policy.exclusions],
			configDir: policy.configDir,
			fileReadMaxChars: policy.fileReadMaxChars,
			valid: policy.valid,
			error: policy.error,
		},
	});
}

/**
 * Desktop-only Terminal & Processes v1 service. This file intentionally has
 * no Node built-in import and does not acquire Electron/Node at module load.
 */
export class DesktopTerminalService implements TerminalApi {
	private readonly records = new Map<string, ProcessRecord>();
	private readonly activeForeground = new Set<{
		child: SpawnedChild;
		ownerSessionId: string;
		containerName?: string;
	}>();
	private disposed = false;
	private securityKey: string;

	constructor(private app: App, private options: ServiceOptions) {
		const initial = options.getSettings();
		this.securityKey = settingsIdentity(initial, new WorkspacePolicy(initial, app.vault.configDir));
	}

	private runtime(): TerminalRuntime {
		if (this.disposed) throw new Error("Terminal service is disposed.");
		return (this.options.getRuntime ?? defaultDesktopRuntime)();
	}

	private livePolicy(): WorkspacePolicy {
		return new WorkspacePolicy(this.options.getSettings(), this.app.vault.configDir);
	}

	private assertInteractive(ctx: TerminalPrepareContext): void {
		if (ctx.execution.kind !== "interactive-chat" || !ctx.execution.sessionId || !ctx.execution.runId) {
			throw new Error("Terminal execution requires an owned interactive chat session and run.");
		}
		if (this.disposed) throw new Error("Terminal service is unavailable.");
	}

	private assertSettings(ctx: TerminalPrepareContext, background: boolean): void {
		const settings = ctx.settings;
		if (
			!settings.toolsets.terminal ||
			settings.terminal.consentVersion !== 1 ||
			!/^[a-f0-9]{64}$/.test(settings.terminal.consentReceipt)
		) {
			throw new Error("Terminal & Processes are disabled or consent has not been accepted.");
		}
		if (settings.terminal.backend === "local") {
			if (!settings.terminal.localExpertEnabled) {
				throw new Error("Local execution requires the separate expert opt-in — enable Local expert mode in Settings → Capabilities → Terminal & Processes.");
			}
			if (settings.approvalMode === "yolo") {
				throw new Error("Local execution is refused in YOLO approval mode — set Approval mode to Manual or Cautious in Settings → Safety.");
			}
			if (ctx.workspacePolicy.mode === "strict-folder") {
				throw new Error("Local execution is refused in Strict Workspace mode; use Docker for a physical boundary.");
			}
			if (background) throw new Error("Local backend is foreground-only.");
		}
	}

	private async basePath(): Promise<string> {
		const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
		const base = adapter.getBasePath?.();
		if (!base) throw new Error("The desktop vault adapter did not provide a physical base path.");
		return base;
	}

	private async physicalScope(policy: WorkspacePolicy, cwdInput: unknown): Promise<PhysicalScope> {
		policy.assertReady();
		const rt = this.runtime();
		const vaultRoot = await rt.realpath(await this.basePath());
		const scopeLogical = policy.mode === "whole-vault" ? "" : policy.root;
		if (scopeLogical) policy.assertVisiblePath(scopeLogical, "Terminal Workspace");
		const scopeLexical = scopeLogical
			? rt.resolve(vaultRoot, ...scopeLogical.split("/"))
			: vaultRoot;
		const scopeRoot = await rt.realpath(scopeLexical);
		if (!pathInside(rt, vaultRoot, scopeRoot)) {
			throw new Error("Terminal Workspace resolves outside the physical vault (symlink/junction escape refused).");
		}

		let cwdLogical = scopeLogical;
		let cwdRelative = "";
		if (cwdInput !== undefined && cwdInput !== null && cwdInput !== "") {
			cwdRelative = canonicalVaultPath(cwdInput, { label: "Terminal cwd" });
			cwdLogical = scopeLogical ? `${scopeLogical}/${cwdRelative}` : cwdRelative;
			policy.assertVisiblePath(cwdLogical, "Terminal cwd");
		}
		const cwdLexical = cwdRelative ? rt.resolve(scopeRoot, ...cwdRelative.split("/")) : scopeRoot;
		const cwd = await rt.realpath(cwdLexical);
		if (!pathInside(rt, scopeRoot, cwd)) {
			throw new Error("Terminal cwd resolves outside the physical Workspace (symlink/junction escape refused).");
		}
		const cwdStat = await rt.stat(cwd);
		if (!cwdStat.isDirectory()) throw new Error("Terminal cwd is not a directory.");

		const allMaskRoots = [policy.configDir, ...policy.exclusions];
		/* One inaccessible parent masks its complete subtree. Removing nested
		   duplicates also avoids asking Docker to create a child mountpoint
		   inside an already-empty, mode-000 tmpfs mask. */
		const maskRoots = allMaskRoots.filter((logical, index) =>
			allMaskRoots.indexOf(logical) === index &&
			!allMaskRoots.some((parent) => parent !== logical && pathContains(parent, logical))
		);
		const masks: PhysicalScope["masks"] = [];
		const seen = new Set<string>();
		for (const logical of maskRoots) {
			if (scopeLogical && !pathContains(scopeLogical, logical)) {
				if (pathContains(logical, scopeLogical)) {
					throw new Error(`Terminal Workspace is covered by a protected/excluded path: ${logical}`);
				}
				continue;
			}
			const relative = scopeLogical ? logical.slice(scopeLogical.length).replace(/^\//, "") : logical;
			if (!relative || seen.has(relative)) continue;
			seen.add(relative);
			let kind: "directory" | "file" = "directory";
			try {
				const st = await rt.stat(rt.resolve(scopeRoot, ...relative.split("/")));
				kind = st.isFile() ? "file" : "directory";
			} catch {
				/* A missing exclusion is still masked as a directory so a command
				   cannot create and use it during this container. */
			}
			masks.push({ relative, kind });
		}
		return { vaultRoot, scopeRoot, scopeLogical, cwd, cwdRelative, masks };
	}

	private securitySnapshot(ctx: TerminalPrepareContext): string {
		return settingsIdentity(ctx.settings, ctx.workspacePolicy);
	}

	private async revalidate(ctx: TerminalPrepareContext, snapshot: string, scope: PhysicalScope): Promise<string | null> {
		if (this.disposed) return "terminal service was disposed";
		const live = this.options.getSettings();
		const livePolicy = this.livePolicy();
		if (settingsIdentity(live, livePolicy) !== snapshot) return "terminal, approval, or Workspace settings changed";
		try {
			const current = await this.physicalScope(ctx.workspacePolicy, scope.cwdRelative);
			if (current.scopeRoot !== scope.scopeRoot || current.cwd !== scope.cwd) return "physical Workspace or cwd changed";
			if (JSON.stringify(current.masks) !== JSON.stringify(scope.masks)) return "protected/excluded paths changed";
		} catch (err) {
			return err instanceof Error ? err.message : String(err);
		}
		return null;
	}

	private dockerArgs(
		ctx: TerminalPrepareContext,
		scope: PhysicalScope,
		command: string,
		containerName: string,
		resolvedImage: string
	): string[] {
		const rt = this.runtime();
		if (!/^sha256:[a-f0-9]{64}$/i.test(resolvedImage)) throw new Error("Resolved Docker image identity is invalid.");
		if (/[\r\n,]/.test(scope.scopeRoot) || scope.masks.some((m) => /[\r\n,]/.test(m.relative))) {
			throw new Error("Docker --mount cannot safely encode a Workspace or masked path containing a comma/newline.");
		}
		const args = [
			"run", "--rm", "--pull", "never", "--name", containerName,
			"--network", "none",
			"--init",
			"--read-only",
			"--cap-drop", "ALL",
			"--security-opt", "no-new-privileges",
			"--pids-limit", "128",
			"--memory", "512m",
			"--cpus", "1",
			/* Do not inherit unrelated host submounts nested below the Workspace. */
			"--mount", `type=bind,src=${scope.scopeRoot},dst=/workspace,bind-recursive=disabled`,
			"--tmpfs", "/tmp:rw,nosuid,nodev,size=67108864",
			"-e", "HOME=/tmp",
			"-e", "TMPDIR=/tmp",
			"-e", "NO_COLOR=1",
		];
		if (typeof rt.uid === "number" && typeof rt.gid === "number") {
			args.push("--user", `${rt.uid}:${rt.gid}`);
		}
		for (const mask of scope.masks) {
			const target = `/workspace/${mask.relative}`;
			if (mask.kind === "file") args.push("--mount", `type=bind,src=/dev/null,dst=${target},readonly`);
			else args.push("--mount", `type=tmpfs,dst=${target},tmpfs-size=65536,tmpfs-mode=0`);
		}
		const workdir = scope.cwdRelative ? `/workspace/${scope.cwdRelative}` : "/workspace";
		args.push("--workdir", workdir, resolvedImage, "/bin/sh", "-lc", command);
		return args;
	}

	private async inspectDockerImage(image: string): Promise<string> {
		if (!IMAGE_RE.test(image) || image.startsWith("-")) throw new Error("Docker image reference is invalid.");
		return new Promise<string>((resolve, reject) => {
			let output = "";
			let settled = false;
			let child: SpawnedChild;
			try { child = this.spawn("docker", ["image", "inspect", "--format", "{{.Id}}", image]); }
			catch (err) { reject(err); return; }
			child.stdout?.on("data", (c) => { output = (output + outputText(c)).slice(0, 1024); });
			child.stderr?.on("data", (c) => { output = (output + outputText(c)).slice(0, 4096); });
			const timer = setTimeout(() => {
				if (settled) return;
				settled = true;
				try { child.kill("SIGKILL"); } catch { /* best effort */ }
				reject(new Error("Docker image inspection timed out."));
			}, 5_000);
			child.on("error", (err) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				reject(err);
			});
			child.on("close", (code) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				const id = output.trim();
				if (code !== 0) reject(new Error(`Docker image is not available locally (automatic pulls are disabled): ${id || image}`));
				else if (!/^sha256:[a-f0-9]{64}$/i.test(id)) reject(new Error("Docker returned an invalid image identity."));
				else resolve(id.toLowerCase());
			});
		});
	}

	private localCommand(command: string): { executable: string; args: string[]; verbatim: boolean } {
		const rt = this.runtime();
		if (rt.platform === "win32") {
			/* Node shell:true parity (lib/child_process.js): cmd.exe takes the
			   WHOLE command as ONE quote-wrapped argument under /d /s /c, and
			   that argument is passed VERBATIM (windowsVerbatimArguments) so
			   cmd's own /S quote rules own the embedded quotes — not Node's
			   re-quoting, which doubled them and mangled pipes/quotes/&&
			   (owner report 2026-08-21: "FINDSTR: Cannot open Physical"). */
			return {
				executable: rt.env?.ComSpec || "cmd.exe",
				args: ["/d", "/s", "/c", `"${command}"`],
				verbatim: true,
			};
		}
		return { executable: rt.env?.SHELL || "/bin/sh", args: ["-lc", command], verbatim: false };
	}

	private appendProcess(record: ProcessRecord, stream: "stdout" | "stderr", chunk: unknown): void {
		record.output += `[${stream}] ${outputText(chunk)}`;
		if (record.output.length > MAX_PROCESS_LOG_CHARS) {
			const drop = record.output.length - MAX_PROCESS_LOG_CHARS;
			record.output = record.output.slice(drop);
			record.baseOffset += drop;
		}
	}

	private localEnvironment(): Record<string, string | undefined> {
		const source = this.runtime().env ?? {};
		const safe: Record<string, string | undefined> = {};
		for (const key of [
			"PATH", "Path", "HOME", "USERPROFILE", "TMP", "TEMP", "TMPDIR",
			"LANG", "LC_ALL", "SHELL", "ComSpec", "SystemRoot", "WINDIR", "PATHEXT",
		]) {
			if (source[key] !== undefined) safe[key] = source[key];
		}
		return safe;
	}

	private spawn(executable: string, args: string[], cwd?: string, env?: Record<string, string | undefined>, verbatim = false): SpawnedChild {
		const child = this.runtime().spawn(executable, args, {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
			...(verbatim ? { windowsVerbatimArguments: true } : {}),
			env: env ?? this.runtime().env,
		});
		try { child.stdin?.end(); } catch { /* stdin remains closed */ }
		return child;
	}

	private async removeContainer(name: string): Promise<void> {
		await new Promise<void>((resolve) => {
			let child: SpawnedChild;
			try {
				child = this.spawn("docker", ["rm", "-f", name]);
			} catch {
				resolve();
				return;
			}
			let settled = false;
			const finish = () => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve();
			};
			const timer = setTimeout(() => {
				try { child.kill("SIGKILL"); } catch { /* best effort */ }
				finish();
			}, DOCKER_CONTROL_TIMEOUT_MS);
			child.on("error", finish);
			child.on("close", finish);
		});
	}

	private foregroundCount(sessionId?: string): number {
		let count = 0;
		for (const active of this.activeForeground) {
			if (!sessionId || active.ownerSessionId === sessionId) count++;
		}
		return count;
	}

	private async runForeground(
		ctx: TerminalPrepareContext,
		scope: PhysicalScope,
		command: string,
		timeoutSeconds: number,
		containerName: string,
		resolvedImage?: string
	): Promise<string> {
		if (this.foregroundCount(ctx.execution.sessionId) >= MAX_SESSION_FOREGROUND) {
			throw new Error("This chat already owns a running foreground command.");
		}
		if (this.foregroundCount() >= MAX_GLOBAL_FOREGROUND) {
			throw new Error(`Open Agent already has ${MAX_GLOBAL_FOREGROUND} running foreground commands.`);
		}
		const docker = ctx.settings.terminal.backend === "docker";
		const spec: { executable: string; args: string[]; cwd?: string; env?: Record<string, string | undefined>; verbatim: boolean } = docker
			? { executable: "docker", args: this.dockerArgs(ctx, scope, command, containerName, resolvedImage ?? ""), cwd: undefined, env: undefined, verbatim: false }
			: { ...this.localCommand(command), cwd: scope.cwd, env: this.localEnvironment() };
		return new Promise<string>((resolve, reject) => {
			let child: SpawnedChild;
			try { child = this.spawn(spec.executable, spec.args, spec.cwd, spec.env, spec.verbatim === true); }
			catch (err) { reject(err); return; }
			const active = {
				child,
				ownerSessionId: ctx.execution.sessionId,
				...(docker ? { containerName } : {}),
			};
			this.activeForeground.add(active);
			let output = "";
			let clipped = false;
			let settled = false;
			let timedOut = false;
			const append = (stream: string, chunk: unknown) => {
				if (output.length >= MAX_CAPTURE_CHARS) { clipped = true; return; }
				const text = `[${stream}] ${outputText(chunk)}`;
				const room = MAX_CAPTURE_CHARS - output.length;
				output += text.slice(0, room);
				if (text.length > room) clipped = true;
			};
			child.stdout?.on("data", (c) => append("stdout", c));
			child.stderr?.on("data", (c) => append("stderr", c));
			const abort = () => {
				try { child.kill("SIGKILL"); } catch { /* best effort */ }
				if (docker) void this.removeContainer(containerName);
			};
			ctx.signal?.addEventListener("abort", abort, { once: true });
			const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutSeconds * 1000);
			child.on("error", (err) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				ctx.signal?.removeEventListener("abort", abort);
				this.activeForeground.delete(active);
				if (docker) void this.removeContainer(containerName);
				reject(err);
			});
			child.on("close", (code, signal) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				ctx.signal?.removeEventListener("abort", abort);
				this.activeForeground.delete(active);
				const status = timedOut ? `timed out after ${timeoutSeconds}s` : ctx.signal?.aborted ? "aborted" : `exit ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`;
				resolve(`Command ${status}.\n${output || "(no output)"}${clipped ? "\n…(output truncated)" : ""}`);
			});
		});
	}

	private runningCount(sessionId?: string): number {
		let count = 0;
		for (const record of this.records.values()) {
			if (record.status === "running" && (!sessionId || record.ownerSessionId === sessionId)) count++;
		}
		return count;
	}

	private pruneFinishedRecords(): void {
		if (this.records.size < MAX_RETAINED_PROCESSES) return;
		const finished = [...this.records.values()]
			.filter((record) => record.status !== "running")
			.sort((a, b) => (a.finishedAt ?? a.startedAt) - (b.finishedAt ?? b.startedAt));
		for (const record of finished) {
			if (this.records.size < MAX_RETAINED_PROCESSES) break;
			if (record.retentionHandle) clearTimeout(record.retentionHandle);
			this.records.delete(record.id);
		}
		if (this.records.size >= MAX_RETAINED_PROCESSES) {
			throw new Error(`Open Agent process registry reached its ${MAX_RETAINED_PROCESSES}-record capacity.`);
		}
	}

	private startBackground(
		ctx: TerminalPrepareContext,
		scope: PhysicalScope,
		command: string,
		timeoutSeconds: number,
		containerName: string,
		resolvedImage: string
	): string {
		if (this.runningCount(ctx.execution.sessionId) >= MAX_SESSION_PROCESSES) throw new Error(`This chat already owns ${MAX_SESSION_PROCESSES} running processes.`);
		if (this.runningCount() >= MAX_GLOBAL_PROCESSES) throw new Error(`Open Agent already has ${MAX_GLOBAL_PROCESSES} running processes.`);
		this.pruneFinishedRecords();
		let id = "";
		for (let attempt = 0; attempt < 4; attempt++) {
			const candidate = `proc_${this.runtime().randomId().replace(/[^A-Za-z0-9]/g, "").slice(0, 16)}`;
			if (candidate !== "proc_" && !this.records.has(candidate)) {
				id = candidate;
				break;
			}
		}
		if (!id) throw new Error("Could not allocate a unique process identity.");
		const child = this.spawn("docker", this.dockerArgs(ctx, scope, command, containerName, resolvedImage));
		let resolveDone!: () => void;
		const done = new Promise<void>((resolve) => { resolveDone = resolve; });
		const record: ProcessRecord = {
			id,
			ownerSessionId: ctx.execution.sessionId,
			ownerRunId: ctx.execution.runId,
			containerName,
			command,
			cwdRelative: scope.cwdRelative,
			image: `${ctx.settings.terminal.dockerImage} (${resolvedImage})`,
			startedAt: this.options.now?.() ?? Date.now(),
			status: "running",
			exitCode: null,
			exitSignal: null,
			output: "",
			baseOffset: 0,
			child,
			done,
			resolveDone,
		};
		this.records.set(id, record);
		child.stdout?.on("data", (c) => this.appendProcess(record, "stdout", c));
		child.stderr?.on("data", (c) => this.appendProcess(record, "stderr", c));
		child.on("error", (err) => {
			this.appendProcess(record, "stderr", err.message);
			void this.removeContainer(containerName);
			this.finishRecord(record, "failed", null, null);
		});
		child.on("close", (code, signal) => {
			const status = record.status === "running" ? (code === 0 ? "completed" : "failed") : record.status;
			this.finishRecord(record, status, code, signal);
		});
		record.timeoutHandle = setTimeout(() => {
			if (record.status !== "running") return;
			try { child.kill("SIGKILL"); } catch { /* best effort */ }
			void this.removeContainer(containerName);
			/* Finalize even if a broken runtime never emits close after kill. */
			this.finishRecord(record, "timed-out", null, "SIGKILL");
		}, timeoutSeconds * 1000);
		return JSON.stringify({ process_id: id, status: "running", timeout_seconds: timeoutSeconds, backend: "docker" });
	}

	private finishRecord(record: ProcessRecord, status: ProcessRecord["status"], code: number | null, signal: string | null): void {
		if (record.finishedAt !== undefined) return;
		if (record.timeoutHandle) clearTimeout(record.timeoutHandle);
		record.status = status;
		record.exitCode = code;
		record.exitSignal = signal;
		record.finishedAt = this.options.now?.() ?? Date.now();
		record.resolveDone();
		record.retentionHandle = setTimeout(() => this.records.delete(record.id), FINISHED_RETENTION_MS);
	}

	async prepareTerminal(input: TerminalCommandInput, ctx: TerminalPrepareContext): Promise<PreparedToolCall> {
		this.assertInteractive(ctx);
		const command = controlFreeString(input.command, "Terminal command", MAX_COMMAND_CHARS);
		const background = input.background === true;
		this.assertSettings(ctx, background);
		const timeoutSeconds = boundedInteger(
			input.timeout_seconds,
			background ? 300 : 30,
			1,
			background ? MAX_BACKGROUND_SECONDS : MAX_FOREGROUND_SECONDS,
			"timeout_seconds"
		);
		const scope = await this.physicalScope(ctx.workspacePolicy, input.cwd);
		const snapshot = this.securitySnapshot(ctx);
		const backend = ctx.settings.terminal.backend;
		const configuredImage = ctx.settings.terminal.dockerImage.trim();
		const resolvedImage = backend === "docker" ? await this.inspectDockerImage(configuredImage) : undefined;
		const containerName = `oa-${this.runtime().randomId().replace(/[^A-Za-z0-9]/g, "").slice(0, 20).toLowerCase()}`;
		return {
			approvalKind: "destructive",
			forceApproval: true,
			allowAlways: false,
			approvalDetails: {
				command,
				backend,
				configured_image: backend === "docker" ? configuredImage : "(host shell; no sandbox)",
				resolved_image: resolvedImage ?? "(not applicable)",
				workspace: scope.scopeRoot,
				cwd: scope.cwd,
				timeout_seconds: timeoutSeconds,
				background,
				network: backend === "docker" ? "none" : "host (local expert mode)",
				stdin: "closed",
				masked_paths: scope.masks.map((m) => m.relative),
			},
			revalidate: async () => {
				const stale = await this.revalidate(ctx, snapshot, scope);
				if (stale) return stale;
				if (backend === "docker") {
					try {
						if (await this.inspectDockerImage(configuredImage) !== resolvedImage) return "Docker image identity changed";
					} catch (err) {
						return err instanceof Error ? err.message : String(err);
					}
				}
				return null;
			},
			execute: async () => background
				? this.startBackground(ctx, scope, command, timeoutSeconds, containerName, resolvedImage ?? "")
				: this.runForeground(ctx, scope, command, timeoutSeconds, containerName, resolvedImage),
		};
	}

	private action(value: unknown): ProcessAction {
		if (value === "list" || value === "poll" || value === "log" || value === "wait" || value === "kill") return value;
		throw new Error("process action must be one of: list, poll, log, wait, kill.");
	}

	private ownedRecord(sessionId: string, id: unknown): ProcessRecord {
		const processId = controlFreeString(id, "process_id", 128);
		const record = this.records.get(processId);
		if (!record || record.ownerSessionId !== sessionId) throw new Error("Process was not found in this chat session.");
		return record;
	}

	private processSummary(record: ProcessRecord): Record<string, unknown> {
		return {
			process_id: record.id,
			status: record.status,
			command: record.command.slice(0, 500),
			cwd: record.cwdRelative || ".",
			image: record.image,
			started_at: record.startedAt,
			finished_at: record.finishedAt ?? null,
			exit_code: record.exitCode,
			exit_signal: record.exitSignal,
			output_start: record.baseOffset,
			output_end: record.baseOffset + record.output.length,
		};
	}

	private processLog(record: ProcessRecord, offset: number, limit: number): Record<string, unknown> {
		const start = Math.max(offset, record.baseOffset);
		const index = Math.min(record.output.length, Math.max(0, start - record.baseOffset));
		const output = record.output.slice(index, index + limit);
		return {
			...this.processSummary(record),
			requested_offset: offset,
			truncated_before_offset: offset < record.baseOffset,
			output,
			next_offset: start + output.length,
		};
	}

	private async killRecord(record: ProcessRecord): Promise<void> {
		if (record.status !== "running") return;
		record.status = "killed";
		try { record.child.kill("SIGKILL"); } catch { /* best effort */ }
		await this.removeContainer(record.containerName);
		this.finishRecord(record, "killed", record.exitCode, record.exitSignal);
	}

	async prepareProcess(input: ProcessInput, ctx: TerminalPrepareContext): Promise<PreparedToolCall> {
		this.assertInteractive(ctx);
		this.assertSettings(ctx, false);
		const action = this.action(input.action);
		if (ctx.settings.terminal.backend !== "docker") throw new Error("Process registry is available only with the Docker backend.");
		const record = action === "list" ? null : this.ownedRecord(ctx.execution.sessionId, input.process_id);
		const offset = boundedInteger(input.offset, record?.baseOffset ?? 0, 0, Number.MAX_SAFE_INTEGER, "offset");
		const limit = boundedInteger(input.limit, MAX_PROCESS_RETURN_CHARS, 1, MAX_PROCESS_RETURN_CHARS, "limit");
		const waitSeconds = boundedInteger(input.timeout_seconds, 10, 1, 30, "timeout_seconds");
		const snapshot = this.securitySnapshot(ctx);
		const details = action === "list"
			? { action, owner_session: ctx.execution.sessionId }
			: { action, process: this.processSummary(record!), offset, limit, ...(action === "wait" ? { timeout_seconds: waitSeconds } : {}) };
		return {
			approvalKind: action === "kill" ? "destructive" : "standard",
			forceApproval: action === "kill",
			allowAlways: false,
			approvalDetails: details,
			revalidate: async () => {
				if (settingsIdentity(this.options.getSettings(), this.livePolicy()) !== snapshot) return "terminal or Workspace settings changed";
				if (record && this.records.get(record.id) !== record) return "process identity expired";
				if (record && record.ownerSessionId !== ctx.execution.sessionId) return "process ownership changed";
				return null;
			},
			execute: async () => {
				if (action === "list") {
					return JSON.stringify([...this.records.values()]
						.filter((r) => r.ownerSessionId === ctx.execution.sessionId)
						.map((r) => this.processSummary(r)), null, 2);
				}
				if (action === "kill") {
					await this.killRecord(record!);
					return JSON.stringify(this.processSummary(record!), null, 2);
				}
				if (action === "wait" && record!.status === "running") {
					let waitHandle: ReturnType<typeof setTimeout> | undefined;
					try {
						await Promise.race([
							record!.done,
							new Promise<void>((resolve) => { waitHandle = setTimeout(resolve, waitSeconds * 1000); }),
						]);
					} finally {
						if (waitHandle) clearTimeout(waitHandle);
					}
				}
				return JSON.stringify(action === "poll" || action === "log" || action === "wait"
					? this.processLog(record!, offset, limit)
					: this.processSummary(record!), null, 2);
			},
		};
	}

	/** One-line shell dialect for the terminal tool schema, so the model never
	 *  fires POSIX commands (pwd/ls/free/sysctl) at a Windows cmd.exe host —
	 *  the owner's agent report (2026-08-21) hit exactly that confusion. */
	describeShell(settings: OpenAgentSettings): string {
		if (settings.terminal.backend === "docker") {
			return "Docker container (network-off) — POSIX /bin/sh";
		}
		const rt = this.runtime();
		if (rt.platform === "win32") {
			const comspec = rt.env?.ComSpec || "cmd.exe";
			return `Local host shell — Windows ${comspec} (CMD: dir, type, echo, &&, | — not bash)`;
		}
		return "Local host shell — POSIX /bin/sh";
	}

	async health(settings: OpenAgentSettings): Promise<TerminalHealth> {
		if (settings.terminal.backend === "local") {
			try {
				const rt = this.runtime();
				return { ok: true, backend: "local", message: `Host shell available (${rt.platform}); local mode is not sandboxed.` };
			} catch (err) {
				return { ok: false, backend: "local", message: err instanceof Error ? err.message : String(err) };
			}
		}
		return new Promise<TerminalHealth>((resolve) => {
			let output = "";
			let child: SpawnedChild;
			let settled = false;
			try { child = this.spawn("docker", ["version", "--format", "{{.Server.Version}}"]); }
			catch (err) {
				resolve({ ok: false, backend: "docker", message: err instanceof Error ? err.message : String(err) });
				return;
			}
			const append = (c: unknown) => { output = (output + outputText(c)).slice(0, 4_096); };
			child.stdout?.on("data", append);
			child.stderr?.on("data", append);
			const finish = (result: TerminalHealth) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(result);
			};
			const timer = setTimeout(() => {
				try { child.kill("SIGKILL"); } catch { /* best effort */ }
				finish({ ok: false, backend: "docker", message: "Docker health check timed out." });
			}, DOCKER_CONTROL_TIMEOUT_MS);
			child.on("error", (err) => finish({ ok: false, backend: "docker", message: err.message }));
			child.on("close", (code) => finish(code === 0
				? { ok: true, backend: "docker", message: `Docker Engine ${output.trim() || "available"}. Network will remain disabled for commands.` }
				: { ok: false, backend: "docker", message: output.trim() || `Docker exited ${code ?? "unknown"}.` }));
		});
	}

	async reconcile(settings: OpenAgentSettings): Promise<void> {
		const next = settingsIdentity(settings, new WorkspacePolicy(settings, this.app.vault.configDir));
		if (next === this.securityKey) return;
		await this.stopAll();
		this.securityKey = next;
	}

	async stopSession(sessionId: string): Promise<number> {
		const owned = [...this.records.values()].filter((r) => r.ownerSessionId === sessionId && r.status === "running");
		const foreground = [...this.activeForeground].filter((active) => active.ownerSessionId === sessionId);
		for (const active of foreground) {
			try { active.child.kill("SIGKILL"); } catch { /* best effort */ }
		}
		await Promise.all([
			...owned.map((r) => this.killRecord(r)),
			...foreground.flatMap((active) => active.containerName ? [this.removeContainer(active.containerName)] : []),
		]);
		return owned.length + foreground.length;
	}

	async stopAll(): Promise<number> {
		const running = [...this.records.values()].filter((r) => r.status === "running");
		const foreground = [...this.activeForeground];
		for (const active of foreground) {
			try { active.child.kill("SIGKILL"); } catch { /* best effort */ }
		}
		await Promise.all([
			...running.map((r) => this.killRecord(r)),
			...foreground.flatMap((active) => active.containerName ? [this.removeContainer(active.containerName)] : []),
		]);
		return running.length + foreground.length;
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		await this.stopAll();
		this.disposed = true;
		for (const record of this.records.values()) {
			if (record.timeoutHandle) clearTimeout(record.timeoutHandle);
			if (record.retentionHandle) clearTimeout(record.retentionHandle);
		}
		this.records.clear();
	}
}

/** Acquire Node lazily and only when a desktop service method is invoked. */
function defaultDesktopRuntime(): TerminalRuntime {
	const req = (globalThis as unknown as { require?: (id: string) => any }).require;
	if (typeof req !== "function") throw new Error("Desktop Node runtime is unavailable.");
	const childProcess = req("child_process") as { spawn: TerminalRuntime["spawn"] };
	const fs = req("fs") as { promises: { realpath(path: string): Promise<string>; stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }> } };
	const path = req("path") as Pick<TerminalRuntime, "resolve" | "join" | "relative" | "sep">;
	const crypto = req("crypto") as { randomUUID?: () => string; randomBytes: (size: number) => { toString(enc: string): string } };
	const proc = (globalThis as unknown as { process?: { platform?: string; getuid?: () => number; getgid?: () => number; env?: Record<string, string | undefined> } }).process;
	return {
		platform: proc?.platform || "unknown",
		spawn: childProcess.spawn.bind(childProcess),
		realpath: fs.promises.realpath.bind(fs.promises),
		stat: fs.promises.stat.bind(fs.promises),
		resolve: path.resolve.bind(path),
		join: path.join.bind(path),
		relative: path.relative.bind(path),
		sep: path.sep,
		randomId: () => crypto.randomUUID?.() ?? crypto.randomBytes(16).toString("hex"),
		uid: proc?.getuid?.(),
		gid: proc?.getgid?.(),
		env: proc?.env,
	};
}
