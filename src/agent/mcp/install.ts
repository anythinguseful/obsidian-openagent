/**
 * MCP catalog installer — git clone + pinned-SHA checkout + bootstrap, for
 * catalog entries that ship as source repos (mirrors Hermes'
 * `_do_git_install` in hermes_cli/mcp_catalog.py).
 *
 * Desktop-only by construction: Node's `child_process`/`fs` are acquired
 * LAZILY via `globalThis.require` (the same pattern as terminal/cron-scripts
 * and the stdio transport), so this module loads on mobile but can never run
 * an install there.
 *
 * Safety posture:
 *   · non-interactive git env (GIT_TERMINAL_PROMPT=0, GCM_INTERACTIVE=Never)
 *     so a private/bad remote fails fast instead of hanging on a prompt
 *     nobody can answer.
 *   · a hard timeout per process and a bounded output cap.
 *   · bootstrap commands are split on whitespace and run via execFile (no
 *     shell) — the catalog only ships simple POSIX commands. They still run
 *     UNSANDBOXED (see SECURITY.md): install = running the publisher's code
 *     on this device, which is why the catalog is curated and pinned.
 */

import { isShaRef, type McpCatalogInstall } from "./catalog";

export const MCP_INSTALL_FOLDER = "mcp-installs";
export const MCP_GIT_TIMEOUT_MS = 120_000;
export const MCP_BOOTSTRAP_TIMEOUT_MS = 600_000;
export const MCP_BOOTSTRAP_MAX_OUTPUT = 64 * 1024;

export interface McpExecResult {
	ok: boolean;
	code: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	error?: string;
}

/** Injected exec primitive (tests substitute a fake). */
export type McpExecFn = (file: string, args: string[], opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number; maxOutput: number }) => Promise<McpExecResult>;

/** Physical install dir for one catalog entry, under the protected config dir
 * (same location policy as cron scripts — wiped on plugin update; re-run the
 * install to refresh). */
export function resolveMcpInstallDir(basePath: string, pluginId: string, name: string): string {
	const req = (globalThis as unknown as { require?: (id: string) => any }).require;
	const join = typeof req === "function" ? (req("path") as { join: (...p: string[]) => string }).join : null;
	const sep = typeof req === "function" ? ((req("path") as { sep?: string }).sep ?? "/") : "/";
	const parts = [basePath, ".obsidian", "plugins", pluginId, MCP_INSTALL_FOLDER, name];
	return join ? join(...parts) : parts.join(sep);
}

/** Minimal ambient env + git's non-interactive guardrails. */
function gitEnv(): Record<string, string> {
	const ambient = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	const env: Record<string, string> = { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" };
	if (ambient) {
		for (const key of ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP"]) {
			if (typeof ambient[key] === "string") env[key] = ambient[key];
		}
	}
	return env;
}

/** Default exec — acquires Node lazily (desktop only), wraps execFile. */
export function defaultMcpExec(): McpExecFn | null {
	const req = (globalThis as unknown as { require?: (id: string) => any }).require;
	if (typeof req !== "function") return null;
	let childProcess: { execFile: (file: string, args: string[], opts: Record<string, unknown>, cb: (err: Error | null, stdout: string, stderr: string) => void) => { kill: (sig?: string) => void } };
	try {
		childProcess = req("child_process") as typeof childProcess;
	} catch {
		return null;
	}

	return (file, args, opts) =>
		new Promise<McpExecResult>((resolve) => {
			let settled = false;
			let stdout = "";
			let stderr = "";
			const finish = (result: McpExecResult): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(result);
			};
			let child: { kill: (sig?: string) => void };
			const timer = setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch {
					/* already gone */
				}
				finish({ ok: false, code: null, stdout, stderr, timedOut: true, error: `Timed out after ${opts.timeoutMs}ms.` });
			}, opts.timeoutMs);
			child = childProcess.execFile(
				file,
				args,
				/* maxBuffer must exceed the returned cap: execFile kills the child
				   when its combined output passes this, and bootstrap tools
				   (pip) can legitimately print more than the 64 KB we keep. */
				{ cwd: opts.cwd, env: opts.env, maxBuffer: 1024 * 1024 },
				(err, out, errOut) => {
					if (settled) return;
					const code = err && typeof (err as { code?: number }).code === "number" ? (err as { code?: number }).code as number : null;
					finish({
						ok: !err,
						code,
						stdout: String(out ?? "").slice(0, opts.maxOutput),
						stderr: String(errOut ?? "").slice(0, opts.maxOutput),
						timedOut: false,
						error: err ? err.message : undefined,
					});
				},
			);
		});
}

function removeDir(dir: string): void {
	const req = (globalThis as unknown as { require?: (id: string) => any }).require;
	try {
		if (typeof req === "function") {
			(req("fs") as { rmSync?: (p: string, o: { recursive: boolean; force: boolean }) => void }).rmSync?.(dir, { recursive: true, force: true });
		}
	} catch {
		/* best-effort wipe — the clone below fails loudly if the dir persists */
	}
}

function splitBootstrapCommand(cmd: string): string[] {
	return (cmd ?? "").trim().split(/\s+/).filter(Boolean);
}

export interface McpInstallResult {
	ok: boolean;
	installDir: string;
	error?: string;
}

/**
 * Clone `install.url` at the pinned ref into `installDir` and run bootstrap.
 * Mirrors Hermes: fresh checkout each install (wipe + re-clone for
 * determinism), SHA refs via full-clone-then-checkout (git cannot
 * `--branch` a SHA).
 */
export async function runMcpGitInstall(install: McpCatalogInstall, installDir: string, exec: McpExecFn): Promise<McpInstallResult> {
	const env = gitEnv();

	removeDir(installDir);

	const clone = async (args: string[]): Promise<McpExecResult> =>
		exec("git", args, { env, timeoutMs: MCP_GIT_TIMEOUT_MS, maxOutput: MCP_BOOTSTRAP_MAX_OUTPUT });

	let isSha = isShaRef(install.ref);

	if (!isSha) {
		const r = await clone(["clone", "--depth", "1", "--branch", install.ref, install.url, installDir]);
		if (!r.ok) {
			removeDir(installDir);
			isSha = true; // branch/tag form failed — fall through to full-clone-then-checkout
		}
	}

	if (isSha) {
		const r = await clone(["clone", install.url, installDir]);
		if (!r.ok) {
			return { ok: false, installDir, error: `git clone failed: ${r.error || r.stderr.slice(0, 200) || `exit ${r.code ?? "unknown"}`}` };
		}
		const c = await clone(["-C", installDir, "checkout", install.ref]);
		if (!c.ok) {
			return { ok: false, installDir, error: `git checkout ${install.ref} failed: ${c.error || c.stderr.slice(0, 200) || `exit ${c.code ?? "unknown"}`}` };
		}
	} else {
		// depth-1 branch clone succeeded above — nothing more to do
	}

	for (const cmd of install.bootstrap ?? []) {
		const argv = splitBootstrapCommand(cmd);
		if (argv.length === 0) continue;
		const r = await exec(argv[0], argv.slice(1), { cwd: installDir, env, timeoutMs: MCP_BOOTSTRAP_TIMEOUT_MS, maxOutput: MCP_BOOTSTRAP_MAX_OUTPUT });
		if (!r.ok) {
			return { ok: false, installDir, error: `bootstrap step failed: ${cmd} — ${r.error || r.stderr.slice(0, 200) || `exit ${r.code ?? "unknown"}`}` };
		}
	}

	return { ok: true, installDir };
}
