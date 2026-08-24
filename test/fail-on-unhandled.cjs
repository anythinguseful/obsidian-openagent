/**
 * Fail-loud trap for unhandled promise rejections and uncaught exceptions.
 *
 * Preloaded into every test process via `NODE_OPTIONS=--require` (see the
 * `test` script in package.json), so all lanes are covered without editing
 * forty test files.
 *
 * WHY THIS EXISTS, given Node already exits non-zero on an unhandled rejection:
 *
 *  1. DIAGNOSIS. Node's default is a bare stack trace, and inside a chained
 *     `a && b && c` run it is easy to misread which lane died. This prints an
 *     unmistakable banner naming the failure as a rejection, plus the reason.
 *
 *  2. PORTABILITY. `--unhandled-rejections=warn`, an older Node, or any host
 *     that installs its own handler all downgrade the crash to a warning, and
 *     the suite would then go green while leaking a rejection. The trap makes
 *     the failure mode explicit and version-independent rather than relying on
 *     a runtime default that is configurable.
 *
 *  3. PARITY WITH PRODUCTION. Obsidian runs the plugin in an Electron
 *     renderer. A renderer does not stop on an unhandled rejection the way a
 *     Node CLI process does, so a floating rejection that a test would survive
 *     can be invisible to a user. Failing hard here is the strictest reading.
 *
 * Companion static gate: `scripts/check-floating-promises.mjs` catches the
 * shapes before they run; this catches whatever slips through at runtime.
 */
"use strict";

function die(kind, err) {
	const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
	console.error(`\n✗ ${kind} — failing the test lane.\n    ${detail}\n`);
	process.exit(1);
}

process.on("unhandledRejection", (reason) => die("unhandled promise rejection", reason));
process.on("uncaughtException", (err) => die("uncaught exception", err));
