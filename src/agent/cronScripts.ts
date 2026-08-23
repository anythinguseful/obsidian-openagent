/**
 * Cron script execution — the Hermes `script` / `no_agent` watchdog pattern.
 *
 * A scheduled automation may run a small user-managed script each tick:
 *   · script (with agent): the script's stdout is injected into the agent
 *     prompt as collected context (data-collection pattern);
 *   · no_agent: the script IS the job — its stdout is delivered verbatim to
 *     the target note, no LLM call at all (classic watchdog).
 *
 * Security boundary (mirrors the terminal service v0.1.146):
 *   · scripts live in the PROTECTED Obsidian config dir
 *     (`.obsidian/plugins/<id>/scripts/`), which the workspace policy already
 *     blocks from every agent tool — the model can never read, list, or plant
 *     a script; only the user places files there;
 *   · the Node runtime (`child_process`) is acquired LAZILY via
 *     `globalThis.require` — no eager Node import, mobile never loads it;
 *   · execution is `execFile` (no shell), stdin closed, a hard timeout, a
 *     bounded output, and a minimal environment (no ambient secrets);
 *   · the interpreter is chosen strictly by file extension (bash / node /
 *     python3); unsupported or missing → an explicit error, never a guess.
 *
 * Pure helpers are exported for unit tests; `runCronScript` takes an injected
 * executor so tests never spawn a real process.
 */

export const CRON_SCRIPT_FOLDER = "scripts";
export const CRON_SCRIPT_TIMEOUT_MS = 30_000;
export const CRON_SCRIPT_MAX_OUTPUT = 64 * 1024;
/** context block injected into the agent prompt (bounded) */
export const CRON_SCRIPT_CONTEXT_MAX = 4000;

export type CronScriptKind = "sh" | "js" | "py";

/** Strict single-file name: basename only, no traversal, no leading dot. */
const CRON_SCRIPT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function sanitizeScriptName(raw: unknown): string | null {
	const text = typeof raw === "string" ? raw.trim() : "";
	if (!text) return null;
	const base = text.split(/[\\/]/).pop() ?? "";
	if (!CRON_SCRIPT_NAME_RE.test(base) || base.startsWith(".")) return null;
	return base;
}

export function scriptKindFor(name: string): CronScriptKind | null {
	if (/\.(sh|bash)$/i.test(name)) return "sh";
	if (/\.js$/i.test(name)) return "js";
	if (/\.py$/i.test(name)) return "py";
	return null;
}

export function interpreterFor(kind: CronScriptKind): string {
	switch (kind) {
		case "sh":
			return "bash";
		case "js":
			return "node";
		case "py":
			return "python3";
	}
}

export interface CronScriptRun {
	ok: boolean;
	stdout: string;
	stderr: string;
	code: number | null;
	timedOut: boolean;
	error?: string;
}

export type CronScriptExecutor = (args: {
	file: string;
	interpreter: string;
	timeoutMs: number;
	maxOutput: number;
}) => Promise<CronScriptRun>;

/** Minimal environment passed to a cron script — never ambient secrets. */
function minimalEnv(runtimeEnv?: Record<string, string | undefined>): Record<string, string> {
	const env: Record<string, string> = {};
	if (runtimeEnv) {
		for (const key of ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP"]) {
			if (typeof runtimeEnv[key] === "string") env[key] = runtimeEnv[key];
		}
	}
	return env;
}

/** Default executor — acquires Node lazily (desktop only), wraps execFile. */
export function defaultCronScriptExecutor(): CronScriptExecutor | null {
	const req = (globalThis as unknown as { require?: (id: string) => any }).require;
	if (typeof req !== "function") return null;
	let childProcess: { execFile: (file: string, args: string[], opts: Record<string, unknown>, cb: (err: Error | null, stdout: string, stderr: string) => void) => { kill: (sig?: string) => void } };
	try {
		childProcess = req("child_process") as typeof childProcess;
	} catch {
		return null;
	}
	const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;

	return async ({ file, interpreter, timeoutMs, maxOutput }) => {
		return new Promise<CronScriptRun>((resolve) => {
			let settled = false;
			let stdout = "";
			let stderr = "";
			const finish = (result: CronScriptRun): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(result);
			};
			const timer = setTimeout(() => {
				try {
					child.kill("SIGKILL");
				} catch {
					/* already gone */
				}
				finish({ ok: false, stdout, stderr, code: null, timedOut: true, error: `Script timed out after ${timeoutMs}ms.` });
			}, timeoutMs);
			let child: { kill: (sig?: string) => void };
			try {
				child = childProcess.execFile(
					interpreter,
					[file],
					{ timeout: timeoutMs, maxBuffer: maxOutput, env: minimalEnv(proc?.env) },
					(err, out, errOut) => {
						stdout = String(out ?? "");
						stderr = String(errOut ?? "");
						if (err) {
							finish({ ok: false, stdout, stderr, code: (err as { code?: number }).code ?? null, timedOut: false, error: err.message });
						} else {
							finish({ ok: true, stdout, stderr, code: 0, timedOut: false });
						}
					}
				);
			} catch (e) {
				finish({ ok: false, stdout: "", stderr: "", code: null, timedOut: false, error: `Failed to start script: ${e instanceof Error ? e.message : String(e)}` });
			}
		});
	};
}

/** Resolve the physical script file under the protected config dir. */
export function resolveScriptPath(basePath: string, pluginId: string, name: string): string {
	const req = (globalThis as unknown as { require?: (id: string) => any }).require;
	const join = typeof req === "function" ? (req("path") as { join: (...p: string[]) => string }).join : null;
	const sep = typeof req === "function" ? ((req("path") as { sep?: string }).sep ?? "/") : "/";
	const parts = [basePath, ".obsidian", "plugins", pluginId, CRON_SCRIPT_FOLDER, name];
	return join ? join(...parts) : parts.join(sep);
}

/** The context block prepended to an agent prompt when a script ran. */
export function buildScriptContextBlock(stdout: string): string {
	const clipped = stdout.slice(0, CRON_SCRIPT_CONTEXT_MAX);
	return `[Script output (collected each tick)]\n"""\n${clipped}\n"""`;
}
