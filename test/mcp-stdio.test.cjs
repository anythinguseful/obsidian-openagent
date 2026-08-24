/**
 * Unit tests for the MCP stdio transport (stdio.ts) — a fake child_process is
 * injected through `globalThis.require`, so nothing is ever spawned.
 *
 * Regression origin (v0.1.152): `spawn()` reports failure through an
 * ASYNCHRONOUS "error" event, not a synchronous throw. stdio.ts attached only
 * "data"/"exit" handlers, so an unspawnable command (typo'd MCP command, a
 * server that was uninstalled) hit EventEmitter's unhandled-'error' promotion
 * and took down the Obsidian process. runtime.ts's try/catch around
 * `client.start(); await client.initialize();` could not catch it — the throw
 * happens after the try block has already returned.
 *
 * Proven empirically before the fix:
 *     try{} selesai tanpa error sinkron
 *     LOLOS ke uncaughtException: ENOENT
 */

const { execSync } = require("child_process");
const path = require("path");
const assert = require("assert");
const { EventEmitter } = require("events");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "mcp-stdio.cjs");
execSync(`npx esbuild src/agent/mcp/stdio.ts --bundle --platform=node --format=cjs --outfile=${out}`, {
	cwd: root,
	stdio: "inherit",
});

const { stdioTransportFor } = require(out);

/** A child that behaves like a real ChildProcess for the paths stdio.ts uses. */
function fakeChild() {
	const child = new EventEmitter();
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.stdin = { written: [], write(d) { this.written.push(d); }, end() { this.ended = true; } };
	child.killed = false;
	child.kill = () => { child.killed = true; };
	return child;
}

/** Installs a fake `child_process` module on globalThis.require. */
function withFakeSpawn(spawnImpl, run) {
	const prev = globalThis.require;
	globalThis.require = (id) => {
		if (id === "child_process") return { spawn: spawnImpl };
		return prev ? prev(id) : undefined;
	};
	try {
		return run();
	} finally {
		globalThis.require = prev;
	}
}

const tests = [];
const t = (name, fn) => tests.push({ name, fn });

/* ---------------- the regression guard ---------------- */

t("spawn failure surfaces through onError instead of an unhandled 'error' event", async () => {
	const child = fakeChild();
	const transport = withFakeSpawn(() => child, () =>
		stdioTransportFor("openagent-nonexistent-cmd-xyz", [], {})
	);
	assert.ok(transport, "transport should be constructed");

	// The transport MUST expose an error channel for the client to observe.
	assert.strictEqual(typeof transport.onError, "function", "transport must expose onError()");

	let seen = null;
	transport.onError((err) => { seen = err; });
	transport.start();

	// A listener for "error" must be attached, otherwise EventEmitter throws.
	assert.ok(child.listenerCount("error") > 0, "stdio.ts must attach an 'error' listener to the child");

	const boom = Object.assign(new Error("spawn openagent-nonexistent-cmd-xyz ENOENT"), { code: "ENOENT" });
	// Before the fix this line THROWS (unhandled 'error' event) and fails the test.
	child.emit("error", boom);

	assert.ok(seen, "onError callback should have fired");
	assert.match(String(seen.message), /ENOENT/);
});

t("a failed spawn does not leave the transport claiming a live child", async () => {
	const child = fakeChild();
	const transport = withFakeSpawn(() => child, () => stdioTransportFor("nope", [], {}));
	transport.onError(() => {});
	transport.start();
	child.emit("error", new Error("ENOENT"));
	// send() after a dead child must be a no-op, never a throw
	assert.doesNotThrow(() => transport.send(JSON.stringify({ jsonrpc: "2.0", id: 1 })));
});

t("synchronous spawn throw is also reported through onError", async () => {
	const transport = withFakeSpawn(() => { throw new Error("EACCES"); }, () =>
		stdioTransportFor("denied", [], {})
	);
	let seen = null;
	transport.onError((err) => { seen = err; });
	assert.doesNotThrow(() => transport.start(), "start() must not throw synchronously");
	assert.ok(seen && /EACCES/.test(seen.message), "sync spawn throw should reach onError");
});

/* ---------------- unbounded buffer hardening ---------------- */

t("a newline-less flood is capped instead of growing without bound", async () => {
	const child = fakeChild();
	const transport = withFakeSpawn(() => child, () => stdioTransportFor("flood", [], {}));
	const lines = [];
	transport.onLine((l) => lines.push(l));
	transport.onError(() => {});
	transport.start();

	// 12 MB of stdout with not a single newline.
	for (let i = 0; i < 12; i++) child.stdout.emit("data", "x".repeat(1024 * 1024));

	assert.strictEqual(lines.length, 0, "no complete line was ever sent");
	const held = transport.bufferLength();
	assert.ok(held <= 8 * 1024 * 1024, `buffer must stay capped, held ${held} bytes`);
});

t("a normal line still round-trips after the cap logic", async () => {
	const child = fakeChild();
	const transport = withFakeSpawn(() => child, () => stdioTransportFor("ok", [], {}));
	const lines = [];
	transport.onLine((l) => lines.push(l));
	transport.onError(() => {});
	transport.start();
	child.stdout.emit("data", '{"jsonrpc":"2.0","id":1}\n{"jsonrpc":"2.0","id":2}\n');
	assert.deepStrictEqual(lines, ['{"jsonrpc":"2.0","id":1}', '{"jsonrpc":"2.0","id":2}']);
});

t("split UTF-8 chunks still assemble into one line", async () => {
	const child = fakeChild();
	const transport = withFakeSpawn(() => child, () => stdioTransportFor("ok", [], {}));
	const lines = [];
	transport.onLine((l) => lines.push(l));
	transport.onError(() => {});
	transport.start();
	child.stdout.emit("data", '{"a":');
	child.stdout.emit("data", '1}\n');
	assert.deepStrictEqual(lines, ['{"a":1}']);
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
