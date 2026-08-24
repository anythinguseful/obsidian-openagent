/** Provider stream protocol and fallback regression checks (v0.1.144). */
const { execSync } = require("child_process");
const path = require("path");
const Module = require("module");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "provider-stream.cjs");
execSync(`npx esbuild test/provider-stream-entry.ts --bundle --platform=node --format=cjs --external:obsidian --outfile=${out}`, {
	cwd: root,
	stdio: "inherit",
});

let bufferedJson = {
	choices: [{ message: { content: "buffered replacement" }, finish_reason: "stop" }],
	usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
};
const obsidianMock = {
	requestUrl: async () => ({ status: 200, text: "", json: bufferedJson }),
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "obsidian") return "obsidian-provider-stream-mock";
	return originalResolve.call(this, request, ...args);
};
require.cache["obsidian-provider-stream-mock"] = {
	id: "obsidian-provider-stream-mock",
	filename: "obsidian-provider-stream-mock",
	loaded: true,
	exports: obsidianMock,
};

global.window = { setTimeout, clearTimeout };
const { chatCompletion, createAttemptResetGate } = require(out);
const provider = {
	id: "custom",
	name: "Fixture",
	baseUrl: "https://provider.test/v1",
	apiKey: "secret-key-never-log",
	enabled: true,
	customHeaders: {},
};
const settings = {
	model: "fixture-model",
	streaming: true,
	maxTokens: 0,
	temperature: -1,
	reasoningEffort: "none",
	requestTimeoutMs: 5000,
	debugMode: false,
};
const history = [{ role: "user", content: "hello" }];
const encoder = new TextEncoder();
const event = (value) => `data: ${typeof value === "string" ? value : JSON.stringify(value)}\n\n`;
const delta = (content, finish_reason = null) => ({ choices: [{ delta: content === null ? {} : { content }, finish_reason }] });

function responseFromChunks(chunks, failAfter = false) {
	let index = 0;
	return {
		ok: true,
		status: 200,
		body: new ReadableStream({
			pull(controller) {
				if (index < chunks.length) controller.enqueue(chunks[index++]);
				else if (failAfter) controller.error(new Error("wire read reset"));
				else controller.close();
			},
		}),
		text: async () => "",
	};
}

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

(async () => {
	/* A multibyte code point may straddle chunks, and the final SSE line need
	   not have a trailing newline. A finish reason is a valid completion
	   signal even without [DONE]. */
	{
		const bytes = encoder.encode(event(delta("Halo 🌏")) + `data: ${JSON.stringify(delta(null, "stop"))}`);
		const emojiStart = Buffer.from(bytes).indexOf(Buffer.from("🌏"));
		global.fetch = async () => responseFromChunks([
			bytes.slice(0, emojiStart + 1),
			bytes.slice(emojiStart + 1, emojiStart + 3),
			bytes.slice(emojiStart + 3),
		]);
		const seen = [];
		const result = await chatCompletion(provider, settings, history, null, { onToken: (t) => seen.push(t) });
		check(result.content === "Halo 🌏" && seen.join("") === "Halo 🌏", "SSE split UTF-8 is decoded without replacement characters");
		check(result.finishReason === "stop" && result.diagnostics.sawFinishReason, "final SSE line without newline is processed");
		check(!result.diagnostics.sawDone && !result.diagnostics.eofWithoutCompletion, "finish_reason completes a stream without [DONE]");
	}

	/* [DONE] is terminal: anything after it in the same transport chunk is
	   ignored deterministically. */
	{
		const wire = event(delta("first")) + event("[DONE]") + event(delta("must-ignore"));
		global.fetch = async () => responseFromChunks([encoder.encode(wire)]);
		const result = await chatCompletion(provider, settings, history, null, {});
		check(result.content === "first", "[DONE] ignores trailing data deterministically");
		check(result.diagnostics.sawDone && result.diagnostics.dataEvents === 2, "[DONE] terminal diagnostics are deterministic");
	}

	/* R34: malformed JSON before any token deterministically selects the
	   buffered compatibility path without requesting a UI rollback. */
	{
		bufferedJson = { choices: [{ message: { content: "clean replacement" }, finish_reason: "stop" }] };
		global.fetch = async () => responseFromChunks([encoder.encode("data: {malformed-first\n\n")]);
		const tokens = [];
		let resets = 0;
		const result = await chatCompletion(provider, settings, history, null, {
			onToken: (t) => tokens.push(t),
			onReset: () => resets++,
		});
		check(tokens.join("") === "clean replacement" && resets === 0, "R34 malformed SSE before tokens falls back once without a needless reset");
		check(result.diagnostics.fallbackFrom?.malformedEvents === 1 && !result.diagnostics.fallbackFrom?.emittedCallbacks, "R34 pre-token protocol anomaly is explicit and deterministic");
	}

	/* R35: one malformed data event after a partial callback invalidates the
	   whole stream. Reset precedes the complete buffered replacement. Debug
	   logs contain metadata only—not headers, wire payloads or content. */
	{
		bufferedJson = {
			choices: [{ message: { content: "replacement-sensitive" }, finish_reason: "stop" }],
			usage: null,
		};
		const localSettings = { ...settings, debugMode: true };
		const wire = event(delta("partial-sensitive-do-not-log")) + "data: {SECRET-IN-WIRE\n\n";
		global.fetch = async () => responseFromChunks([encoder.encode(wire)]);
		const visible = [];
		const order = [];
		const warnings = [];
		const oldWarn = console.warn;
		console.warn = (...args) => warnings.push(args);
		let result;
		try {
			result = await chatCompletion(provider, localSettings, history, null, {
				onToken: (t) => {
					visible.push(t);
					order.push(`token:${t}`);
				},
				onReset: () => {
					visible.length = 0;
					order.push("reset");
				},
			});
		} finally {
			console.warn = oldWarn;
		}
		check(visible.join("") === "replacement-sensitive", "malformed SSE rolls partial output back before buffered replacement");
		check(order[1] === "reset" && order[2] === "token:replacement-sensitive", "reset callback precedes replacement callback");
		check(result.diagnostics.fallbackFrom?.malformedEvents === 1, "malformed SSE anomaly remains observable on buffered result");
		const logShape = JSON.stringify(warnings);
		check(
			!logShape.includes("SECRET-IN-WIRE") && !logShape.includes("partial-sensitive") && !logShape.includes("replacement-sensitive") && !logShape.includes(provider.apiKey),
			"stream diagnostics log metadata only"
		);
	}

	/* A read failure is wrapped consistently and carries counters into the
	   successful buffered result. */
	{
		bufferedJson = { choices: [{ message: { content: "transport replacement" }, finish_reason: "stop" }] };
		global.fetch = async () => responseFromChunks([encoder.encode(event(delta("discard me")))], true);
		let resets = 0;
		const result = await chatCompletion(provider, settings, history, null, { onReset: () => resets++ });
		check(resets === 1 && result.content === "transport replacement", "read failure resets one emitted stream attempt");
		check(result.diagnostics.fallbackFrom?.errorName === "ProviderStreamTransportError", "read failure uses generic ProviderStreamTransportError identity");
		check(result.diagnostics.fallbackFrom?.dataEvents === 1 && result.diagnostics.fallbackFrom?.emittedCallbacks, "transport fallback preserves metadata counters");
	}

	/* EOF with neither [DONE] nor finish_reason remains accepted for provider
	   compatibility but is explicitly observable. */
	{
		global.fetch = async () => responseFromChunks([encoder.encode(event(delta("legacy eof")))]);
		const result = await chatCompletion(provider, settings, history, null, {});
		check(result.content === "legacy eof", "EOF-only provider output remains compatible");
		check(result.diagnostics.eofWithoutCompletion && !result.diagnostics.sawDone, "EOF-only completion anomaly is observable");
	}

	/* v0.1.152: every exit path must tear the wire down. The finally block used
	   to clear the idle timer and drop the abort listener but never abort the
	   controller or cancel the reader, so a stream that ended in a throw left
	   the HTTP connection open and the body locked — one leaked socket per
	   failed reply, accumulating for the life of the session. */
	{
		let observed = null;
		global.fetch = async (_url, init) => {
			observed = init.signal;
			let index = 0;
			const chunks = [encoder.encode(event(delta("partial")) + "data: {malformed\n\n")];
			return {
				ok: true,
				status: 200,
				body: new ReadableStream({
					pull(controller) {
						if (index < chunks.length) controller.enqueue(chunks[index++]);
						else controller.close();
					},
				}),
				text: async () => "",
			};
		};
		bufferedJson = { choices: [{ message: { content: "after protocol error" }, finish_reason: "stop" }] };
		await chatCompletion(provider, settings, history, null, {});
		check(observed !== null && observed.aborted, "protocol error aborts the request controller");
	}

	/* [DONE] breaks out of the read loop with bytes still queued, so unlike the
	   protocol-error path the body is NOT closed and really is holding a lock.
	   Cancelling a closed stream is a spec no-op, so this is the only shape
	   that can prove the reader is actually released. */
	{
		let cancelled = false;
		global.fetch = async () => ({
			ok: true,
			status: 200,
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(encoder.encode(event(delta("first")) + event("[DONE]")));
					/* deliberately never closed: more data is still "coming" */
				},
				cancel() { cancelled = true; },
			}),
			text: async () => "",
		});
		const result = await chatCompletion(provider, settings, history, null, {});
		check(result.content === "first", "[DONE] with an open body still returns its content");
		check(cancelled, "an undrained body is cancelled instead of left locked");
	}

	/* The happy path must ALSO release the wire: a completed stream that is
	   never aborted keeps the socket pinned until the server times out. */
	{
		let observed = null;
		global.fetch = async (_url, init) => {
			observed = init.signal;
			return responseFromChunks([encoder.encode(event(delta("done")) + event("[DONE]"))]);
		};
		const result = await chatCompletion(provider, settings, history, null, {});
		check(result.content === "done", "successful stream still returns its content");
		check(observed !== null && observed.aborted, "completed stream releases the connection");
	}

	/* Quick Ask can hear both chatCompletion's buffered-fallback reset and
	   attemptWithResilience's next-hop reset for one failed attempt. */
	{
		let resets = 0;
		const gate = createAttemptResetGate(() => resets++);
		gate.beginAttempt();
		gate.resetOnce(); // transport discarded stream
		gate.resetOnce(); // outer retry observed the same failed attempt
		check(resets === 1, "R29 Quick Ask coalesces duplicate reset signals within one discarded attempt");
		gate.beginAttempt();
		gate.resetOnce();
		check(resets === 2, "R29 Quick Ask grants exactly one reset to the next discarded attempt");
	}

	Module._resolveFilename = originalResolve;
	if (failed) {
		console.error(`\n${failed} provider-stream check(s) failed.`);
		process.exit(1);
	}
	console.log("\nAll provider-stream checks passed.");
})().catch((err) => {
	Module._resolveFilename = originalResolve;
	console.error(err);
	process.exit(1);
});
