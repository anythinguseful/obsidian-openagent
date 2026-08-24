/**
 * Smoke guards whose subject is the agent layer: provider transport,
 * the tool registry, terminal service wiring and the skills tools.
 *
 * Moved verbatim from test/smoke.test.cjs (Phase 6 of the smoke/harness
 * split). Guard conditions and messages are unchanged; only the enclosing
 * function and one level of indentation differ.
 *
 * Two providers.ts guards used to read through a block-local fs/path pair
 * anchored on __dirname; they were rewritten to the harness read() on the
 * move, as check-docs guards 2 and 3 require. Every path here is
 * repo-relative, so "test/tools.test.cjs" keeps its test/ prefix.
 *
 * The v0.1.18 trashFile shim guard walks src/ with fs.readdirSync to prove
 * no direct fileManager.trashFile call escaped the shim, so this module also
 * imports ROOT, fs and path. Its block-local read() helper was deleted in
 * favour of the harness one (check-docs guard 3), and the walk root moved
 * from __dirname/../src to path.join(ROOT, "src").
 */

const { ROOT, read, fs, path } = require("./harness.cjs");

// Returns the number of failed guards so the orchestrator can fold it into
// its own counter, matching the other domain modules.
module.exports = function agentGuards() {
	let failed = 0;

	{
		const src = read("src/agent/providers.ts");
		if (
			src.includes("let emitted = false") &&
			src.includes('cb.onReset?.("buffered-fallback")') &&
			src.includes("bufferedCompletion(provider, settings, messages, tools, tracked, fallbackFrom)") &&
			src.includes("if (cb && reasoning) cb.onReasoning?.(reasoning)") &&
			src.includes("if (cb && content) cb.onToken?.(content)")
		) {
			console.log("✓ buffered completion resets partial attempt then emits complete token/reasoning once");
		} else {
			console.error("✗ providers.ts buffered-emission wiring drifted");
			failed++;
		}
	}
	{
		const src = read("src/agent/providers.ts");
		const raced = src.split("requestUrlWithTimeout(").length - 1;
		if (
			src.includes("const ctl = new AbortController()") &&
			src.includes("signal: ctl.signal") &&
			src.includes("armTimer();") && // idle timer re-arms per streamed chunk
			src.includes("err instanceof ProviderTimeoutError) throw err") &&
			raced >= 4 && // helper def + listModels + listModelInfos + bufferedCompletion
			src.includes("function friendlyTransportError(") &&
			src.includes("ProviderTransportError") &&
			src.includes("connection refused") &&
			src.includes("friendlyTransportError(err, provider)") &&
			src.includes("ollama serve")
		) {
			console.log("✓ provider network: timeouts wired + transport errors named per provider");
		} else {
			console.error("✗ providers.ts network wiring drifted");
			failed++;
		}
	}
	{
		const tools = read("src/agent/tools.ts");
		const runner = read("src/agent/runner.ts");
		const main = read("src/main.ts");
		const sess = read("src/agent/sessions.ts");
		const del = read("src/agent/delegate.ts");
		const ok =
			tools.includes('name: "session_search"') &&
			tools.includes('toolset: "memory"') &&
			tools.includes("interface SessionSearchApi") &&
			tools.includes("sessions?: SessionSearchApi") &&
			runner.includes("sessionsApi?: SessionSearchApi") &&
			runner.includes("sessions: this.sessionsApi") &&
			main.includes("this.runner.sessionsApi") &&
			sess.includes("meta.title.toLowerCase().includes(q)") &&
			del.includes('"session_search"');
		if (ok) {
			console.log("✓ v0.1.147g: session_search — cross-session recall (title+content), memory-gated, runner-injected, delegate-blocked");
		} else {
			console.error("✗ v0.1.147g session_search parity drifted");
			failed++;
		}
	}
	{
		const svc = read("src/agent/terminal/service.ts");
		const typ = read("src/agent/terminal/types.ts");
		const run = read("src/agent/runner.ts");
		const ok =
			svc.includes('args: ["/d", "/s", "/c", `"${command}"`]') &&
			svc.includes("windowsVerbatimArguments: true") &&
			svc.includes("Settings → Capabilities") &&
			svc.includes("Settings → Safety") &&
			svc.includes("describeShell(settings: OpenAgentSettings): string") &&
			typ.includes("describeShell(settings: OpenAgentSettings): string;") &&
			run.includes("enrichTerminalShell") &&
			run.includes("Shell: ${hint}");
		if (ok) {
			console.log("✓ v0.1.173: Windows local shell — verbatim cmd /d /s /c quoting, actionable refusals, shell-dialect disclosure");
		} else {
			console.error("✗ v0.1.173 terminal Windows shell handling drifted");
			failed++;
		}
	}
	{
		const prov = read("src/agent/providers.ts");
		const cm = read("src/agent/contextManager.ts");
		const ok =
			prov.includes("fetchLmStudioContextLength") &&
			prov.includes("/api/v1/models") &&
			prov.includes("loaded_instances") &&
			prov.includes("modelIdMatches") &&
			prov.includes("lmStudioServerRoot") &&
			cm.includes("DEFAULT_CONTEXT_WINDOW = 256000");
		if (ok) {
			console.log("✓ v0.1.174: LM Studio native context-length probe + 256K fallback (Hermes parity)");
		} else {
			console.error("✗ v0.1.174 LM Studio context-length probe drifted");
			failed++;
		}
	}
	{
		const sk = read("src/agent/skills.ts");
		const tools = read("src/agent/tools.ts");
		const tp = read("test/tools.test.cjs");
		const ok =
			tools.includes('name: "view_skill"') &&
			tools.includes('name: "manage_skill"') &&
			tools.includes('enum: ["update", "patch", "delete", "write_file", "remove_file"]') &&
			tools.includes("\tviewSkill,\n\tmanageSkill,") && // urutan registrasi ALL_TOOLS
			sk.includes("async resolveSkill(") &&
			sk.includes("async patchSkill(") &&
			sk.includes("async deleteSkillTree(") &&
			sk.includes("canonicalVaultPath(rel") && sk.includes("pathContains(dir, abs)") && // shared canonical traversal guard
			sk.includes("getAllLoadedFiles()") && // supporting files non-md ikut terlihat
			tp.includes("manage_skill delete trashes the WHOLE skill folder") &&
			tp.includes("view_skill file= refuses .. traversal") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.132: skills ⅔→3/3 — view_skill + manage_skill (patch/update/delete/write_file/remove_file) · traversal-guarded · store asli diuji end-to-end");
		} else {
			console.error("✗ v0.1.132 Hermes skills parity regressed");
			failed++;
		}
	}

	{
		const walk = (d) =>
			fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
				e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []
			);
		const shim = read("src/agent/vaultCompat.ts");
		const direct = walk(path.join(ROOT, "src"))
			.filter((f) => !f.endsWith("vaultCompat.ts"))
			.some((f) => fs.readFileSync(f, "utf8").includes("fileManager.trashFile"));
		const ok =
			shim.includes('typeof trashFile === "function"') &&
			shim.includes("app.vault.trash(file, true)") &&
			read("src/main.ts").includes("trashRespectingPrefs(this.app, af)") &&
			read("src/agent/skills.ts").includes("trashRespectingPrefs(this.app, f)") &&
			!direct;
		if (ok) {
			console.log("✓ v0.1.18: trashFile compat shim (feature-detected; no direct calls outside the shim)");
		} else {
			console.error("✗ v0.1.18 API compat drifted (direct trashFile call reappeared or shim lost)");
			failed++;
		}
	}
	{
		/* v0.1.152: session files are disk data — a truncated write, a hand edit or an
		   older schema can leave valid JSON with required fields missing. The old
		   `JSON.parse(raw) as Session` asserted a shape nothing verified, so one
		   corrupt file crashed search() ("turns is not iterable", then
		   turn.parts.map on undefined) and list() (undefined title .toLowerCase()),
		   taking out cross-session recall and the chat-load path. Both read sites
		   must normalize; the blind cast must not come back. */
		const sess = read("src/agent/sessions.ts");
		const casts = (sess.match(/JSON\.parse\([^)]*\)\s+as\s+Session/g) || []).length;
		const ok =
			sess.includes("export function sanitizeSession(value: unknown): Session | null") &&
			sess.includes("if (typeof o.id !== \"string\") return null;") &&
			sess.includes("parts: Array.isArray(t.parts) ? t.parts : []") &&
			sess.includes("turns," ) &&
			sess.includes('title: typeof o.title === "string" ? o.title : ""') &&
			sess.includes("const s = sanitizeSession(JSON.parse(raw));") &&
			sess.includes("if (!s || s.id !== fileId) continue;") &&
			sess.includes("return sanitizeSession(JSON.parse(raw));") &&
			casts === 0;
		if (ok) {
			console.log("\u2713 v0.1.152: session files sanitized on read (list + load) \u2014 corrupt/partial JSON cannot crash search or chat load");
		} else {
			console.error("\u2717 v0.1.152 session sanitize drifted (blind `as Session` cast back, or a read site bypassed sanitizeSession)");
			failed++;
		}
	}
	{
		/* v0.1.152: JSON.parse succeeding does not mean an object came back. A
		   provider emitting `data: null` threw a raw TypeError out of the SSE read
		   loop (reading .usage off null), bypassing ProviderStreamProtocolError;
		   a model emitting `null` as tool arguments threw on the first property
		   read. Both must degrade, not crash. */
		const prov = read("src/agent/providers.ts");
		const loop = read("src/agent/agentLoop.ts");
		const mcp = read("src/agent/mcp/client.ts");
		const ok =
			prov.includes('if (!json || typeof json !== "object" || Array.isArray(json)) {') &&
			prov.includes("malformedEvents++") &&
			loop.includes("const parsed = argsJson ? JSON.parse(argsJson) : {};") &&
			loop.includes('if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed;') &&
			!loop.includes("args = argsJson ? JSON.parse(argsJson) : {};") &&
			mcp.includes('if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;') &&
			!mcp.includes("msg = JSON.parse(trimmed) as JsonRpcResponse;");
		if (ok) {
			console.log("\u2713 v0.1.152: non-object JSON degrades \u2014 `data: null` counts as a malformed SSE frame, null tool args fall back to {}, null JSON-RPC frames are dropped");
		} else {
			console.error("\u2717 v0.1.152 non-object JSON guard drifted (SSE frame, tool args or JSON-RPC frame accepts a non-object again)");
			failed++;
		}
	}
	return failed;
};
