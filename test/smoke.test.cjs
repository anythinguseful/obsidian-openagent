/**
 * Smoke test: load the built bundle with a mocked `obsidian` module and
 * instantiate the plugin with a mock app to verify wiring works end to end
 * (minus the real Obsidian runtime).
 *
 * The mock, bundle load, and plugin instance live in ./smoke/harness.cjs so
 * guard groups can be split out per domain without duplicating the setup.
 */

const { ROOT, read, path, fs, plugin, OpenAgentPlugin, mod } = require("./smoke/harness.cjs");
const stylesGuards = require("./smoke/styles.cjs");
const settingsGuards = require("./smoke/settings.cjs");
const chatGuards = require("./smoke/chat.cjs");
const agentGuards = require("./smoke/agent.cjs");
const quickaskGuards = require("./smoke/quickask.cjs");
const previewGuards = require("./smoke/preview.cjs");

(async () => {
	await plugin.onload();
	console.log("✓ onload() completes");

	// settings merged with defaults
	const s = plugin.settings;
	const checks = [
		[s.activeProviderId === "openrouter", "default provider id"],
		[s.providers.length === 7, "7 provider presets merged"],
		[s.approvalMode === "cautious", "default approval mode = cautious"],
		[s.toolsets.vault === true, "vault toolset on"],
		[s.toolsets.terminal === false, "terminal toolset default off"],
		[plugin.terminalService === undefined, "mobile-like onload does not create the desktop Terminal service"],
		[!plugin.runner.getTools(s).some((t) => t.name === "terminal" || t.name === "process"), "mobile-like registry exposes no terminal/process schemas"],
		...(() => {
			const source = read("src/main.ts");
			const service = read("src/agent/terminal/service.ts");
			const runner = read("src/agent/runner.ts");
			const chat = read("src/ui/ChatApp.tsx");
			const settingsSource = read("src/settings.ts");
			const settingsTab = read("src/settingsTab.ts");
			const bundle = read("main.js");
			const manifest = JSON.parse(read("manifest.json"));
			return [
				[manifest.isDesktopOnly === false, "manifest remains mobile-capable"],
				[
					source.includes("if (Platform?.isDesktopApp === true)") &&
						source.includes('await import("./agent/terminal/service")') &&
						!source.includes('from "./agent/terminal/service"'),
					"desktop Terminal service is loaded only behind the explicit platform gate",
				],
				[
					service.includes("const req = (globalThis as unknown as") &&
						!service.includes('from "node:') &&
						!bundle.includes('require("child_process")') &&
						!bundle.includes('require("node:'),
					"mobile bundle has no eager Node built-in acquisition for Terminal",
				],
				[
					runner.includes("options.interactiveTerminal === true") &&
						chat.includes("runner.getToolsWithMcp(runSettings, { interactiveTerminal: true })") &&
						chat.includes("new AgentLoop(runSettings, interactiveTools, runCtx, moaEngine)") &&
						runner.includes("headlessTools(this.getTools(settings))") &&
						runner.includes("childTools(this.getTools(settings))"),
					"terminal schemas require explicit owned-chat opt-in; generic/headless/delegated loops fail closed",
				],
				[
					settingsSource.includes("restorePersistedTerminalConsent") &&
						settingsSource.includes("payload.terminal.consentVersion = 0") &&
						settingsSource.includes("delete (payload.terminal as Partial<TerminalSettings>).consentReceipt") &&
						source.includes("this.readTerminalConsentLedger()") &&
						source.includes("async grantTerminalConsent()") &&
						settingsTab.includes("await this.plugin.grantTerminalConsent()"),
					"terminal first-use consent requires a non-portable per-vault receipt minted by the checked modal",
				],
			];
		})(),
		[s.maxIterations === 12, "iteration cap default"],
		[s.memoryFolder === "openagent/openagent-memory", "memory folder default"],
		[s.skillsFolder === "openagent/openagent-skills", "skills folder default"],
		[s.mcpEnabled === false, "mcp master toggle default off"],
		[
			!Array.isArray(s.mcpServers) && typeof s.mcpServers === "object" && s.mcpServers !== null && Object.keys(s.mcpServers).length === 0,
			"mcp servers default empty map",
		],
		[Array.isArray(s.fallbackProviders) && s.fallbackProviders.length === 0, "fallback providers default empty"],
		// mcp.json schema helpers
		...(() => {
			const src = read("src/settings.ts");
			return [
				[src.includes("export function parseMcpServersDoc"), "settings.ts exports parseMcpServersDoc"],
				[src.includes("export function migrateMcpServers"), "settings.ts exports migrateMcpServers"],
				[src.includes("kvToLines") && src.includes("linesToKv"), "settings.ts exports kv line helpers"],
			];
		})(),
		// resilience (retry + turn-scoped failover) wiring
		...(() => {
			const al = read("src/agent/agentLoop.ts");
			const rs = read("src/agent/resilience.ts");
			const pv = read("src/agent/providers.ts");
			return [
				[al.includes("onFailover") && al.includes("requestWithResilience"), "agentLoop: failover wired"],
				[rs.includes("resolveFallbacks") && rs.includes("RETRYABLE_STATUSES"), "resilience module present"],
				[pv.includes("class ProviderHttpError"), "providers: typed HTTP error"],
				[pv.includes("class ProviderTimeoutError"), "providers: typed timeout error"],
				[!pv.includes("openagent-timeout"), "providers: no fake dispatchEvent timeout"],
			];
		})(),
		// model + providers tab UI wiring
		...(() => {
			const st = read("src/settingsTab.ts");
			return [
				[st.includes("Fallback models") && st.includes("fallbackProviders"), "model tab: fallback editor"],
				[st.includes("oa-provider-group-label") && st.includes("providerUsable"), "providers tab: readiness grouping (Configured / Needs setup)"],
				[
					(() => {
						const iUrl = st.indexOf("base URL");
						const iDisc = st.indexOf("Custom headers —");
						return iUrl !== -1 && iDisc !== -1 && iUrl < iDisc;
					})(),
					"providers tab: base URL always visible (above headers disclosure)",
				],
			];
		})(),
		// profiles (Hermes identities) wiring
		...(() => {
			const src = read("src/settings.ts");
			const pf = read("src/agent/profiles.ts");
			const ss = read("src/agent/sessions.ts");
			const sp = read("src/agent/systemPrompt.ts");
			const mn = read("src/main.ts");
			const ca = read("src/ui/ChatApp.tsx");
			const st = read("src/settingsTab.ts");
			const pp = read("src/ui/components/profile-picker.tsx");
			return [
				[src.includes("migrateProfiles") && src.includes("DEFAULT_PROFILE_ID"), "settings: profiles model + migration"],
				[
					pf.includes("class ProfileStore") && pf.includes("resolveConnection") && pf.includes("memoryFolderFor"),
					"profiles: store + effective resolution + folder mapping",
				],
				[ss.includes("setSubdir"), "sessions: per-profile subdir"],
				[
					sp.includes("resolveIdentity(s)") && sp.includes("personalityOverlay") && sp.includes("MUST adopt this voice"),
					"system prompt: SOUL identity + last-slot overlay",
				],
			[
					mn.includes("applyProfile") &&
						mn.includes("effectiveSettings") &&
						mn.includes("normalizeLoadedSettings"), // load+import shared pipeline does the profile migration
					"main: profile runtime wiring",
			],
				[ca.includes("ProfilePicker") && ca.includes("applyProfile") && ca.includes("prevProfileRef"), "chat: topbar profile pill + switch handling"],
				[ca.includes("overlayExplicitRef") && ca.includes("globalOverlayDefault"), "chat: overlay follows the global personality until /personality overrides"],
				[
					st.includes('"profiles"') &&
						st.includes("new ConfirmProfileDeleteModal") &&
						read("src/settings/modals/profile.ts").includes("class ConfirmProfileDeleteModal") &&
						st.includes("oa-model-route") &&
						st.includes("Manage profile pin"),
					"settings tab: profiles section + effective-route pin management",
				],
				[pp.includes("oa-profile-pill"), "profile picker component present"],
			];
		})(),
		...(() => {
			const st = read("src/settingsTab.ts");
			return [
				[st.includes('key: "vault"') && st.includes('key: "automations"'), "capabilities: toolset switches present"],
				[!st.includes("oa-tool-groups"), "capabilities: no per-tool rows (Hermes semantics, owner 2026-07-23)"],
				[st.includes("setSkillEnabled("), "skills browser: per-skill enable toggle"],
				[st.includes("parseMcpServersDoc("), "mcp: mcp.json import wired"],
			];
		})(),
		...(() => {
			const sk = read("src/agent/skills.ts");
			return [
				[sk.includes("enabled: meta.enabled !== false"), "skills: enabled flag parsed from frontmatter"],
				[sk.includes(".filter((s) => s.enabled)"), "skills catalog skips disabled"],
			];
		})(),
		// browse hub (skills registry) wiring
		...(() => {
			const hub = read("src/agent/hub.ts");
			const guard = read("src/agent/skillsGuard.ts");
			const st = read("src/settingsTab.ts");
			const mn = read("src/main.ts");
			const cfg = read("src/settings.ts");
			return [
				[
					hub.includes("DEFAULT_HUB_TAPS") && hub.includes("extractSkills") && hub.includes("hub-lock.json"),
					"hub: default taps + tree extraction + lock file",
				],
				[guard.includes("scanSkillFiles") && guard.includes("installPolicy"), "skills guard present"],
				[
					st.includes("Browse Hub") && st.includes("hubInstallFlow") && st.includes("GuardFindingsModal"),
					"capabilities tab: browse hub UI + guard modals",
				],
				[mn.includes("new HubClient") && cfg.includes("hubTaps"), "main: hub client + settings fields"],
			];
		})(),
		// automations (cron v2) wiring
		...(() => {
			const cron = read("src/agent/cron.ts");
			const tools = read("src/agent/tools.ts");
			const runner = read("src/agent/runner.ts");
			const st = read("src/settingsTab.ts");
			const mn = read("src/main.ts");
			const cfg = read("src/settings.ts");
			return [
				[
					cron.includes("nextCronRun") && cron.includes("migrateCronTasks") && cron.includes("CRON_PRESETS"),
					"cron: parser + next-run + migration + presets",
				],
				[cfg.includes("CronSchedule") && cfg.includes("automations: boolean"), "settings: CronTask v2 model + automations toolset"],
				[
					mn.includes("announceMissedCronRuns") && mn.includes("runningTasks") && mn.includes("writeCronOutput") && mn.includes("cronjobApi"),
					"main: missed-run notice + overlap guard + archive output + tool backend",
				],
				[
					runner.includes("headlessTools(this.getTools(settings))") && runner.includes("cronApi"),
					"runner: headless runs use the fail-closed capability allowlist",
				],
				[tools.includes('name: "cronjob"') && tools.includes("CronjobApi"), "tools: cronjob tool registered"],
				[
						st.includes("cronForm") && st.includes("oa-cron-dot") && st.includes("validateCronExpr(") && st.includes("cronHistory"),
					"settings tab: cron list + form with live validation + history",
				],
			];
		})(),
		// automations Tahap D: SILENT · skills · repeat · chain · notify
		...(() => {
			const cron = read("src/agent/cron.ts");
			const tools = read("src/agent/tools.ts");
			const st = read("src/settingsTab.ts");
			const mn = read("src/main.ts");
			const cfg = read("src/settings.ts");
			const css = read("styles.css");
			return [
				[
					cron.includes("isSilentOutput") && cron.includes("buildTaskPrompt") && cron.includes("isCronCompleted") && cron.includes("CRON_CHAIN_MAX_CHARS"),
					"cron D: silent marker + prompt composer + completion + chain cap",
				],
				[
					cfg.includes("skills?: string[]") && cfg.includes("maxRuns?: number | null") && cfg.includes("chainContext?: boolean") && cfg.includes("lastOutput?: string"),
					"settings D: CronTask fields (skills/maxRuns/chain/notify/lastOutput)",
				],
				[
					mn.includes("cronSkillDocs") && mn.includes("isSilentOutput(output)") && mn.includes("✅ ok · silent") && mn.includes("completed its"),
					"main D: skill docs + silent delivery skip + auto-complete notice",
				],
				[
					mn.includes("const prevRunAt = task.lastRun") && mn.includes("buildTaskPrompt(safeTask, skillDocs, prevRunAt)"),
					"main D: chain header shows previous run time (not now)",
				],
				[
					tools.includes("parseSkillList") && tools.includes("parseMaxRuns") && tools.includes("[SILENT]"),
					"tools D: cronjob create/update args + silent tip",
				],
				[
					st.includes("renderSkillRows") && st.includes("Add skill") && st.includes("Chain run context") && st.includes("Max runs") && st.includes("isCronCompleted"),
					"settings tab D: focus-skill picker + add/remove + max runs + chain/notify + completed status",
				],
				[
					css.includes(".oa-cron-skill-row") && css.includes(".oa-cron-dot.is-completed"),
					"styles D: focus-skill row + completed dot",
				],
			];
		})(),
		// markdown rendering (docs/plans/markdown-rendering-plan.md)
		...(() => {
			const seg = read("src/ui/markdown-segments.ts");
			const md = read("src/ui/components/markdown.tsx");
			const cb = read("src/ui/components/code-block.tsx");
			const ca = read("src/ui/ChatApp.tsx");
			const css = read("styles.css");
			const rp = read("test/real-preview/build.mjs");
			const bp = read("test/build-preview.mjs");
			return [
				[seg.includes("splitMarkdownSegments") && seg.includes("walkMarkdownFences") && seg.includes("closed: fence.closed"), "md: shared structural fence segmenter (closed vs dangling)"],
				[md.includes("MarkdownDoc") && md.includes("splitMarkdownSegments") && md.includes("openLinkText") && md.includes("window.open"), "md: MarkdownDoc + link click delegation"],
				[cb.includes("oa-code-copy") && cb.includes("navigator.clipboard"), "md: CodeBlock copy button"],
				[
					ca.includes("oa-stream-text") && ca.includes("<MarkdownDoc") && ca.includes("streamingBlock ?"),
					"md: hybrid gate — plain while streaming, markdown on finish",
				],
				[
					css.includes(".oa-markdown h3") && css.includes(".oa-stream-text") && css.includes(".oa-code-header"),
					"md: compact heading scale + stream pre-wrap + code header styles",
				],
				[
					rp.includes('"md"') && bp.includes("preview-chat-markdown.html"),
					"md: real-preview scenario + preview page registered",
				],
			];
		})(),
		// a11y audit wave (docs/audits/ui-audit.md, web-design-guidelines)
		...(() => {
			const css = read("styles.css");
			const st = read("src/settingsTab.ts");
			const ca = read("src/ui/ChatApp.tsx");
			const pi = read("src/ui/components/prompt-input.tsx");
			return [
				[
					css.includes("prefers-reduced-motion") && css.includes("overscroll-behavior: contain"),
					"a11y: reduced-motion block + overscroll containment",
				],
				[
					css.includes("oa-calm-pulse") && css.includes("oa-calm-ripple"),
					"a11y: reduced-motion keeps calm opacity-only status indicators",
				],
				[
					css.includes(".oa-app button:focus-visible") && css.includes("outline: 2px solid"),
					"a11y: keyboard focus-visible ring fallback",
				],
				[
					st.includes('role", "checkbox"') && st.includes('cls: "oa-hub-chip-x", text: "×"') && st.includes("aria-expanded"),
					"a11y: skill toggle/checkbox + hub chip button + keyboard expanders",
				],
				[st.includes('createEl("button", { cls: "oa-cron-history-link"'), "a11y: cron history links are buttons"],
				[
					ca.includes('aria-label="Conversations"') && pi.includes('aria-label="Message Open Agent"'),
					"a11y: icon buttons + composer labeled",
				],
			];
		})(),
	];
	let failed = 0;
	for (const [ok, label] of checks) {
		if (ok) console.log(`✓ ${label}`);
		else {
			console.error(`✗ ${label}`);
			failed++;
		}
	}

	// v0.1.162 behavioural (owner: "tidak berubah sama sekali"): opening the
	// chat must MOVE an existing leaf to the configured location, not just
	// reveal it in place. Same-region → reveal only.
	{
		const events = [];
		const leftSplit = {};
		const rightSplit = {};
		let detached = false;
		let openedOn = null;
		const existingLeaf = {
			getRoot: () => rightSplit,
			getViewState: () => ({ type: "openagent-chat", state: {}, active: true }),
			detach: () => {
				detached = true;
			},
			/* v0.1.163: relocation captures the live session id first */
			view: { getCurrentSessionId: () => "sess-42" },
		};
		const ws = plugin.app.workspace;
		const savedLeaves = ws.getLeavesOfType;
		const savedReveal = ws.revealLeaf;
		ws.leftSplit = leftSplit;
		ws.rightSplit = rightSplit;
		ws.getLeavesOfType = () => [existingLeaf];
		ws.getLeftLeaf = () => ({
			setViewState: async () => {
				openedOn = "left";
			},
		});
		ws.getLeaf = () => ({
			setViewState: async () => {
				openedOn = "main";
			},
		});
		ws.getRightLeaf = () => ({
			setViewState: async () => {
				openedOn = "right";
			},
		});
		ws.revealLeaf = (leaf) => events.push(leaf === existingLeaf ? "existing" : "target");

		plugin.settings.chatLeafLocation = "left";
		await plugin.activateView();
		const moved = detached && openedOn === "left" && events.length === 1 && events[0] === "target";
		/* the conversation survives the move: captured id is handed back */
		const captured = plugin.consumePendingChatSessionId();

		detached = false;
		openedOn = null;
		events.length = 0;
		plugin.settings.chatLeafLocation = "right";
		await plugin.activateView();
		const stays = !detached && openedOn === null && events.length === 1 && events[0] === "existing";

		ws.getLeavesOfType = savedLeaves;
		ws.revealLeaf = savedReveal;
		delete ws.leftSplit;
		delete ws.rightSplit;

		if (moved && stays && captured === "sess-42") {
			console.log("✓ v0.1.162 behavioural: existing chat MOVES to the configured location; same-region reveals in place; session id captured for restore");
		} else {
			console.error(`✗ v0.1.162 behavioural relocation failed (moved=${moved}, stays=${stays}, captured=${captured}, events=${events.join(",")}, openedOn=${openedOn})`);
			failed++;
		}
	}

	// tool registry
	const tools = plugin.runner.getTools();
	const names = tools.map((t) => t.name);
	for (const expected of ["read_note", "write_note", "search_vault", "web_extract", "save_memory", "create_skill", "clarify"]) {
		if (names.includes(expected)) console.log(`✓ tool registered: ${expected}`);
		else {
			console.error(`✗ missing tool: ${expected}`);
			failed++;
		}
	}

	// system prompt assembly (no vault files, empty memory/skills)
	const prompt = await plugin.runner.assembleSystemPrompt(true, false);
	if (prompt.includes("Open Agent") && prompt.includes("SmokeVault") && prompt.includes("Available tools")) {
		console.log("✓ system prompt assembles (identity + env + tools)");
	} else {
		console.error("✗ system prompt missing expected sections");
		failed++;
	}

	// agent loop guard: no provider URL configured → clear error
	try {
		const { AgentLoop } = await import("../src/agent/agentLoop.ts").catch(() => ({}));
	} catch {
		/* TS import unavailable in node – skip */
	}

	// source guard: persistence must read the live turns ref (streamed parts),
	// never the stale assistant turn object captured before the run —
	// regression guard for "loaded sessions lose reasoning/steps".

	// real-preview harness guard: the honest-preview pipeline (real ChatApp DOM
	// injection into preview/ pages) must stay wired — this is what keeps
	// "preview vs real" from drifting apart again.

	/* release-witness guard (run 32653162333): the settings harness writes a
	   TRACKED witness; its rewrite policy must go through the pure planner so
	   a release run (OA_RELEASE_WITNESS=readonly, passed by release.mjs) can
	   never dirty the tracked tree the fail-closed clean assertion protects.
	   release.mjs must also re-assert tree cleanliness right after the preview
	   steps, so drift fails at the exact step that caused it. */

	// providers guard: buffered completion must single-shot emit onReasoning/
	// onToken — regression guard for "empty assistant bubbles when streaming is
	// off or the stream dies before the first token".

	// providers guard: real timeouts on every network path — regression guard
	// for the dead `dispatchEvent("openagent-timeout")` no-op (nothing ever
	// listened to that event, so streaming requests could hang forever; cron
	// runs pass no signal at all, so a stalled provider froze the automation).

	// data portability guard (docs/plans/data-portability-plan.md): normalize pipeline
	// is the single source of truth, exports are versioned+redacted, reset is
	// trash-based (recoverable) and confirmed.

	// long-text + compound fields: textareas use stackedTextArea, compound
	// controls (Model tab dropdown+input, fallback rows) use stackedControl —
	// all inside their setting-item; control-column textareas are banned

	// composer buttons: send = attach size (26×26), arrow-up icon, accent fill
	// whose icon flips black/white by accent luminance (text-on-accent fallback)

	// attach feature guard: [+] menu + snippets + @ refs + vision path stay wired

	// build-stamp guard: the settings header + load log must keep showing the
	// baked build time (stale-plugin detection after every file swap)

	// finish-reason surfacing + cache-friendly Date: the loop threads
	// finishReason into the run result, the chat marks "length" cut-offs,
	// and the system-prompt Date is hour-rounded (KV-cache friendly)

	// live tool preview: streamed tool-call deltas must surface as "pending"
	// step items, inter-iteration prompt processing must be indicated, and
	// dangling previews must be stripped before persisting

	// hermes-parity batch: deterministic tool-call ids (cache), /learn slash,
	// per-session composer drafts, full-text session search in the panel

	// prompt-kit semantics: streamed thinking text must use the Reasoning
	// component (auto-close on stream end). 2026-08-04 (v0.1.74): the
	// ChainOfThought timeline port was RETIRED as dead surface (never
	// imported) — the guard flips from separation to purge permanence.
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const reaPath = path.join(__dirname, "..", "src", "ui", "components", "reasoning.tsx");
		const rea = fs.existsSync(reaPath) ? fs.readFileSync(reaPath, "utf8") : "";
		const cotPath = path.join(__dirname, "..", "src", "ui", "components", "chain-of-thought.tsx");
		const stepsPath = path.join(__dirname, "..", "src", "ui", "components", "steps.tsx");
		const suggPath = path.join(__dirname, "..", "src", "ui", "components", "prompt-suggestion.tsx");
		const chat = read("../src/ui/ChatApp.tsx");
		const css = read("../styles.css");
		const ok =
			rea.includes("isStreaming") &&
			rea.includes("oa-reasoning-trigger") &&
			rea.includes("export function ReasoningContent") &&
			chat.includes('from "./components/reasoning"') &&
			css.includes(".oa-reasoning-trigger") &&
			!fs.existsSync(cotPath) && !fs.existsSync(stepsPath) && !fs.existsSync(suggPath) &&
			!chat.includes('from "./components/chain-of-thought"') &&
			!chat.includes('from "./components/steps"') &&
			!css.includes(".oa-cot-") &&
			!css.includes(".oa-prompt-suggestion");
		if (ok) {
			console.log("✓ prompt-kit: Reasoning covers thinking · dead timeline/suggestion ports stay purged");
		} else {
			console.error("✗ reasoning intact or dead-surface purge regressed");
			failed++;
		}
	}

	// tool calls: faithful prompt-kit Tool card per invocation (AI SDK v5
	// states: input-streaming → input-available → output-available/error);
	// the chat must not regress to rendering tool calls via Steps

	// remaining prompt-kit components aligned to the official surface:
	// PromptInput isLoading/maxHeight · FileUpload accept · CodeBlock
	// compound parts (CodeBlockGroup/CodeBlockCode) · Message live exports
	// · TextShimmer faithful defaults (as/duration 4/
	// spread 20) · Loader full 12 variants + sizes
	// (2026-08-02 v0.1.39: MessageAvatar retired with all turn avatars —
	// official Hermes renders none; dead component + CSS removed)

	// tooltip hygiene: Obsidian renders its own .tooltip from aria-label, so a
	// native `title` attribute on the SAME element shows TWO tooltips. The
	// hazard is co-occurrence — a bare `title=` (no aria-label) is legal
	// (v0.1.32 model-menu rows tooltip `id · fastId` this way, Hermes
	// Desktop parity). Guard flags elements carrying BOTH attributes.
	{
		const fs = require("fs");
		const files = ["../src/ui/ChatApp.tsx"].concat(
			fs
				.readdirSync(path.join(__dirname, "../src/ui/components"))
				.filter((f) => f.endsWith(".tsx"))
				.map((f) => `../src/ui/components/${f}`)
		);
		const offenders = files.filter((p) =>
			(fs.readFileSync(path.join(__dirname, p), "utf8").match(/<[^>]*>/g) ?? []).some(
				(tag) => tag.includes("title=") && tag.includes("aria-label=")
			)
		);
		if (offenders.length === 0) {
			console.log("✓ tooltip hygiene: no element carries title= together with aria-label= (no double tips)");
		} else {
			console.error(`✗ title= + aria-label= on one element (double tooltip): ${offenders.join(", ")}`);
			failed++;
		}
	}

	// copilot parity batch (study: logancyang/obsidian-copilot@master, source-
	// verified via jsDelivr): markdown safety/math/image preprocess wired into
	// the renderer, message actions (insert / edit+resend / regenerate), and
	// the tool-output display cap

	// regenerate honesty: runAgent must build withUser from turnsRef (flushed
	// synchronously by setTurnsSynced), never from the stale `turns` state
	// closure — /retry + edit-resend truncate turns first, and the closure
	// still holds the pre-truncation list → the whole conversation duplicates
	// (proven E2E: click Regenerate in the convo scenario asserted 2 user
	// bubbles before this fix, 1 after)

	// quote parity with Obsidian (owner directive 2026-07-21): the chat
	// blockquote rule must NOT re-declare border / text color / background —
	// those come from Obsidian's own ".markdown-rendered blockquote" rule
	// (markdown.tsx adds the `markdown-rendered` class), so the bar is the
	// theme accent (--blockquote-border-color → --interactive-accent).
	// Regression guarded: a gray `border-left: var(--background-modifier-border)`
	// override had painted over the official accent bar.

	// disk-attach usability (owner report 2026-07-21): the 256 KB cap +
	// text-only policy silently rejected every real-world disk file the owner
	// picked — dialog worked, but nothing ever attached. Guards: text cap is
	// 1 MB · disk images ride the vision path · rejection notices carry the
	// measured size · the E2E covers image chip + both rejection branches.















	// ---- v0.1.17 — context compression & title generation (Hermes Desktop
	// aux task slots parity). Engine is obsidian-free (contextManager.ts) and
	// runs PRE-LOOP in ChatApp; agentLoop must stay clean of it.

	// v0.1.147 (LM Studio latency): title generation off by default (one less
	// request per new session), the system-prompt tool list stays compact
	// (descriptions live in the function schemas, not duplicated in the
	// prompt), and the wire size is measurable under debugMode.

	// v0.1.147b (Hermes cron parity): monitor change-detection skips unchanged
	// runs, and scheduled prompts are security-scanned (invisible-unicode strip
	// + secret/exfil/injection findings) at create/update AND at runtime.

	// v0.1.147c (Hermes script/no_agent parity): scripts run from the protected
	// config dir, desktop-only, lazy Node, execFile with timeout/bounded output,
	// no_agent delivers verbatim without the LLM, and script+monitor are
	// mutually exclusive.


	// v0.1.147e (Hermes Safety parity): approval timeout, secret redaction on
	// model-visible tool output, and pre-edit checkpoints.

	// v0.1.147f (Hermes web_search parity): pluggable backend with a free
	// DuckDuckGo default, parsers pure + transport injected, and the tool
	// registered in the web toolset + blocked in delegated children.

	// v0.1.147g (Hermes session_search parity): cross-session recall tool over
	// the existing SessionStore.search, gated by the memory toolset, injected
	// via a SessionSearchApi on the runner, blocked in delegated children.

	// v0.1.147h (MCP runtime): pure JSON-RPC client + lazy stdio transport +
	// McpRuntime (consent-gated, config-cached) + first-use consent mirroring
	// terminal, injected only on the owned interactive path.

	// v0.1.147i (MCP phases 4–5): Streamable HTTP transport (POST + session-id
	// echo + SSE/JSON parsing, injected requestUrl) + curated catalog with a
	// pinned git install (n8n) and an install flow (clone/bootstrap/checkout).

	// MCP catalog fixture observability: names only, never credential values.

	// MCP catalog security contract: secret fields stay password-only, install
	// failures recover the button, and success refreshes the owning Settings UI.


	// v0.1.148 (memory parity): add/replace/remove with substring matching,
	// char budgets enforced at write time, injection scan before injection,
	// drift guard, and shared threat patterns (single source of truth).

	// v0.1.149 → v0.1.172 (owner: "di pengaturan profile, merujuk Hermes
	// Desktop, personality tidak ada"): SOUL is the ONLY identity a profile
	// carries — the personality overlay became a GLOBAL Chat setting (Hermes
	// display.personality parity), never a per-profile field. The SOUL editor
	// stays in the profile form; no personality dropdown may remain there.

	// v0.1.173 (owner report 2026-08-21 — "FINDSTR: Cannot open Physical",
	// "pwd is not recognized", "system cannot find the path specified"): the
	// Windows local shell must use Node's shell:true shape (ONE verbatim
	// quote-wrapped arg under /d /s /c), refusal errors must name the setting
	// to change, and the terminal tool schema must disclose the shell dialect
	// so the model stops firing POSIX commands at cmd.exe.

	// v0.1.150 (Appearance): the tab returns with five self-owned chat-surface
	// controls (tool cards / reasoning / session density / intro / reactions);
	// it never touches Obsidian's own theme (no theme/zoom/translucency).

	// v0.1.151 (Advanced parity): Max tool iterations moved Chat → Advanced
	// (Hermes agent.max_turns), plus tool output limit (tool_output.max_bytes)
	// and checkpoint snapshots kept (checkpoints.max_snapshots) with pruning.



	// v0.1.154 (A4 SortableList): command rows gain native-HTML5 drag reorder
	// via a grip handle; the up/down arrows remain the keyboard/mobile path
	// (v0.1.77 "minus the dnd dependency" decision extended, no new dep).


	// v0.1.157 (A7 Skeleton): shimmer placeholder rows replace the plain
	// "Loading…" text in the hub results and the cron focus-skills loader.

	// v0.1.158 (A1 EditableText): panel-local rename UI is isolated from
	// durable SessionStore access. Enter/blur commit, Escape cancels, and an
	// active-session rename still updates the ChatApp title mirror.

	// v0.1.159 (A3 TokenTag): the statusbar token pill gains a context-window
	// bar — percentage only when the window is KNOWN (explicit setting or
	// provider-advertised), red on overload, plain ↑in ↓out otherwise.

	// v0.1.174 (owner report: "↑580.6k ↓16.8k · 1772% of the 32768 context
	// window — over budget" + "context length 131072 dari LM Studio tidak
	// kebaca"): (a) % + overload compare the LAST request's input (already
	// pinned in v0.1.159 above); (b) LM Studio's context length is read from
	// its NATIVE /api/v1/models (loaded_instances[].config.context_length) —
	// the OpenAI-compat /models omits it; (c) unknown-window fallback is 256K
	// (Hermes CONTEXT_PROBE_TIERS[0]), not the stale 32K guess.


	// v0.1.176 (owner: memory & context engine ala Hindsight, tanpa Docker/MCP
	// — Fase 1): a plugin-native structured-memory engine. Pure fusion recall
	// (BM25 + entity + temporal + trust), one-call typed retain (add/update/
	// delete), facts.jsonl in the memory folder, injection-scanned recall
	// block, statusbar indicator, 3 settings rows. No server, no embeddings.

	// v0.1.177 (Fase 2): reflect — facts consolidate into observations (with
	// evidence + proof counts, refined not duplicated) and answer standing
	// mental-model questions; the settled knowledge rides into the prompt as
	// a free file read. Background, cadence-gated, silent on failure.

	// v0.1.178 (Fase 3): semantic recall — optional /v1/embeddings model
	// (embedTexts), cosine re-rank fused over the lexical score, observations
	// join the recall block. Embedding is optional; recall degrades to pure
	// fusion without it. No server — the provider's own embeddings endpoint.


	// v0.1.180 (owner: "perbaiki capabilitas composer textarea yang belum sesuai
	// Hermes Desktop"): ↑/↓ input-history browse (draft snapshot restore) +
	// the composer's OWN undo/redo stack (chip re-renders bypass Chromium) +
	// Escape halts the running turn.


	// v0.1.182 (P3): provider+model pairs sit side-by-side (oa-control-row)
	// instead of stacked — Global default model, Fallback, MoA Reference and
	// Aggregator. Text inputs/areas (Environment, Headers, Custom system
	// prompt) deliberately stay full-width stacked.




	// v0.1.186 (owner: "compress when above / preserve recent tail tak muncul"
	// — they ARE percentages): the slider's number box must carry a PLAIN
	// number, never the "%"-suffixed display text (a "%" written into
	// <input type=number> is rejected by the browser and empties the box).
	// The "%" is a visible unit suffix; v0.1.189 moved it INSIDE the box.



	// v0.1.189 (owner: "tampilan persentase lebih menyatu / seamless"): the
	// number box and its "%" suffix now share one .oa-slideinput-numwrap, and
	// the unit renders INSIDE the field (absolute right, pointer-events none)
	// instead of floating a gap away. has-unit reserves the input's padding.




	// v0.1.160 (A5 BackBottom): the scroll button gains an unread dot — new
	// content that lands while the user is scrolled up marks "new below", and
	// the dot clears on returning to the bottom (lobe-ui BackBottom affordance,
	// honest dot not a fake count).

	// v0.1.162 (owner: "tidak berubah sama sekali"): the chat panel opens where
	// the user wants — a NEW leaf goes left / main (tab) / right per the
	// setting, AND an existing chat is MOVED there when it sits elsewhere.
	// v0.1.163: flipping the setting relocates immediately AND the live
	// session id is captured/restored so the conversation survives the move.


	// v0.1.165 (owner: slash "/" overlay differs from Hermes Desktop): the
	// slash drawer becomes a narrow left-docked card with icon + name + desc
	// rows (reference vocabulary per kind), group headers without hairlines,
	// and keyboard highlight (Arrow/Enter/Tab) + hover highlight.


	// v0.1.168 amended (owner: panel = "sama seperti oa-slash-menu"): the
	// sessions panel is a slash-menu-style popover — NO backdrop, anchored
	// ABOVE the composer via the shared .oa-overlay, capped scrolling list.
	// v0.1.169 (owner: "conversation, yang untuk buka tutup drawer itu loh" +
	//   "rotate-ccw-clock, bukan rotate-ccw"): the topbar conversations toggle
	//   sits in the right cluster directly after New chat. Glyph = "history" —
	//   the pre-rename lucide name Obsidian bundles for the ccw-arrow+clock
	//   glyph (latest lucide renamed history → rotate-ccw-clock).

	// ---- v0.1.18 — obsidian API compat (lesson 24): minAppVersion 1.5.0
	// honesty. FileManager#trashFile arrived after 1.5.7 (typing float made it
	// compile silently) — trashing goes through the feature-detected shim and
	// the direct call must never reappear outside it.


	// ---- v0.1.20 — slash quick batch (Hermes Desktop composer parity,
	// study: docs/studies/hermes-slash-parity-2026-07-31.md): /title, /version,
	// /queue (+/q), /resume (+/sessions /switch) + the official alias map.


	// ---- v0.1.22 — skills in the slash palette (Hermes "Skills" group +
	// cli verbs, raw: use-slash-completions.ts groupOrder + hermes_cli
	// commands.py "Args: name (list|read)"): group headers, verb staging,
	// read/use arms one message even when the skill is disabled.

	// ---- v0.1.23 — /branch (+/fork): chat fork with parent lineage
	// (Hermes session.branch + branchTitle(siblings+1), raw study:
	// docs/studies/hermes-slash-parity-2026-07-31.md status append 4).

	// ---- v0.1.24 — slash chips, full composer rework (Hermes slash-refs.ts +
	// directive-text.tsx parity): contenteditable with atomic pills, hydration
	// for inert text, /skill-name dispatch, transcript pills.

	// ---- v0.1.25 — /goal Ralph loop (hermes_cli/goals.py parity): standing
	// goal + judge-after-every-turn, continuation prompts, 20-turn budget,
	// parse/transport backstops, goalJudge aux slot, statusbar chip, and the
	// sendQueued slash re-dispatch (queued /goal is a command, not prose).

	// ---- v0.1.26 — /steer mid-turn injection (run_agent.py steer() +
	// prompt_builder.py marker parity): byte-exact marker, drain into the
	// LAST tool result, busy inline dispatch (never queued), leftover
	// next-turn delivery, interrupt drops, system-prompt trust channel, and
	// the transcript rending steers as attributed user notes.

	// ---- v0.1.27 — aux pin = provider AND model (bugfix): all three aux
	// call sites must override the request model with the resolved pair.model,
	// and the goal harness pins goalJudge to a different model so the wire
	// proves it.

	// ---- v0.1.28 — web_extract full parity (tools/web_tools.py): urls list,
	// char budget with 75/25 head+tail window + [TRUNCATED] footer, vault
	// store + read_note paging, opt-in summarize riding the webExtract aux
	// slot (provider+model), settings row.


	// ---- v0.1.30 — MoA runtime (agent/moa_loop.py MoAClient parity): virtual
	// provider in the picker, advisor fan-out + guidance attach per cadence,
	// disclosure events, AgentLoop facade hook.

	// ---- lesson 31 structural guard: no raw control characters (U+0000–U+001F
	// minus \t \n \r) inside ANY src .ts/.tsx — one invisible \x01 in a string
	// literal once bypassed every string-anchors check and produced a wrong
	// signature separator at runtime.
	{
		const walk = (dir) =>
			fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
				e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") || e.name.endsWith(".tsx") ? [path.join(dir, e.name)] : []
			);
		const offenders = walk(path.join(__dirname, "..", "src")).filter((f) => /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(fs.readFileSync(f, "utf8")));
		if (offenders.length === 0) {
			console.log("✓ lesson-31: no raw control characters in src/ (escape-text only)");
		} else {
			console.error(`✗ lesson-31 raw control characters in: ${offenders.join(", ")}`);
			failed++;
		}
	}


	// ---- v0.1.32 — composer model menu full parity with Hermes Desktop
	// (shell.modelMenu dropdown + model-visibility-dialog): pretty display
	// names + Fast tags, family collapsing (base + -fast merge, date-pins
	// dropped when a rolling alias exists), ALL providers grouped
	// (alphabetical groups, stable catalog order, current model included),
	// search across every model ("Search models"), keyboard nav
	// (arrows/Enter on kbRows, data-kb-active + scrollIntoView), MoA bottom
	// section ("MoA presets", rows "MoA: {preset}"), footer Refresh Models
	// (menu STAYS OPEN, icon spins) + Edit Models… → visibility dialog
	// (tri-state master checkbox, per-family switch, hide-all sentinel
	// `slug::`, 50/provider curated default, re-enable keeps ONLY that
	// model for that provider, "Add provider…" routes to settings).

	// ---- v0.1.33 — owner report (2026-08-01): Refresh Models jumped to
	// settings (gate used p.enabled, which is false for EVERY preset → zero
	// targets → openSettings). Fix: gate on the plugin's canonical
	// providerUsable, never navigate from Refresh (official never does).

	// ---- v0.1.34 — owner directive: the dialog switch must BE the app's
	// own .checkbox-container (hidden native input inside) so theme toggle
	// styling carries over — the hand-drawn .oa-vis-switch CSS is retired —
	// and the menu footer's Refresh/Edit rows stack vertically like the
	// official dropdown menu items.
	// 2026-08-04 (v0.1.70 consolidation): the stacked-footer declarations
	// moved into the base footer rules (folded winner-last) — assert them
	// INSIDE those blocks now, not in the slice after the layer header.

	// ---- v0.1.35 — empty state = official Hermes Desktop Intro mirror
	// (components/chat/intro.tsx): OPEN AGENT wordmark + ONE rotating copy
	// line seeded per fresh session; neutral pool + personality templates
	// (vault-adapted). The sparkles hero, provider line, warning chip and
	// slash/@ hint are retired per the owner's super-minimal pick.

	// ---- v0.1.36 — oa-intro-copy full fidelity (owner report: our copy
	// differed from desktop). The pool is now the official intro-copy.jsonl
	// VERBATIM (75 records, 15 personalities × 5), selection reads the jsonl
	// pool FIRST (our overlapping personalities: helpful/concise/technical/
	// creative/teacher/kawaii/catgirl/pirate/shakespeare/surfer) and only
	// then falls back to the official templates; random mount seed + draft
	// seed replicates the official rotation.

	// 2026-08-02 v0.1.39 chat-block polish (owner pick "full plan"): avatars
	// retired from every turn (official Hermes renders none — dead
	// MessageAvatar component + CSS removed in the same sweep), chat table
	// becomes a rounded card (row lines only, muted header band — the bare
	// <table> element itself is the scroll container), hr renders as quiet
	// spacing, and text rhythm is tightened (--p-spacing 0.55rem)

	// 2026-08-02 v0.1.40: reasoning trigger shows ONE finished label (Hermes
	// Desktop thread/message-parts.tsx verbatim states — Thought / Thought
	// briefly / Thought for Ns whole-second), never title+meta together — the
	// old pair printed "Thought Thought for Ns" (owner report "Thought nya
	// double ngak enak dilihat")

	// 2026-08-02 v0.1.41: diagram fences (mermaid) route through Obsidian's own
	// renderer (rendered diagram via its postprocessor, never a code card —
	// Hermes routes ```mermaid/```svg to dedicated renderers, other languages
	// to the code block); containment CSS caps the svg; seed covers the case

	// 2026-08-02 v0.1.42 tapback reactions → SUPERSEDED 2026-08-02 v0.1.48
	// (owner: "revisi feedback, feedback pakai component prompt kit, tanpa
	// emoji"): the emoji quick-row was retired outright. What survives and
	// is asserted here: one feedback per turn persisted to the session,
	// re-tap retracts, and the double-tap gesture — now tapping "up"

	// 2026-08-02 v0.1.43 mini syntax highlighting (chat-UI backlog kapal ③):
	// deliberate no-Shiki deviation kept — a tiny regex tokenizer
	// (src/ui/highlight.ts) paints .oa-tok-* spans inside CodeBlockCode;
	// colors read Obsidian's official --code-* vars (styles.css fallbacks);
	// sim supplies github-dark-dimmed values (= official Hermes SHIKI_THEME
	// dark) in reference-obsidian-app.css; harness: md scenario asserts the
	// json fence tokenizes + round-trips while the mermaid route stays intact

	// 2026-08-02 v0.1.44 selection actions bar (chat-UI backlog kapal ④):
	// drag-select text inside a message bubble → floating Quote/Copy bar;
	// Quote pastes Obsidian `> ` blockquote lines at the composer caret;
	// the bar never pops mid-drag, only when both selection endpoints live
	// in the same .oa-msg-content; Copy has an execCommand fallback;
	// official Hermes has no such toolbar — modeled, not ported

	// 2026-08-02 v0.1.45 selection opt-in (owner: "selection gak bisa di chat
	// ui"): Obsidian body{user-select:none} + opt-in only for reading view
	// (.markdown-preview-view) left chat bubbles undraggable — the v0.1.44
	// harness selected programmatically and never exercised the real gesture.
	// Fix = scoped opt-in on .oa-msg-content; regression = a true mouse-drag
	// lane in build.mjs (drag textarizes AND pops the bar).

	// 2026-08-02 v0.1.46 selection bar → icon-only floating toolbar (owner):
	// labels left the buttons and live in tooltips via aria-label (Obsidian
	// native tooltip, no title=); Copy beat = Copy→Check swap (.is-done);
	// buttons are 26px square shells per the dated CSS block

	// 2026-08-02 v0.1.47 selbar geometry (owner: "kecil sekali oa-selbar
	// 34,6 x 19,6"): single-class `.oa-selbar-btn` (0,1,0) lost to the
	// `.oa-app button{width:auto}` reset (0,1,1) — same trap class as the
	// v0.1.38 send hover. Scoped up (0,2,1), shells 26 → 28px, and the
	// driver now MEASURES the shell (btnW/btnH) so geometry drift fails
	// red instead of passing visual-by-eye.

	// 2026-08-02 v0.1.48 row-pair adaptation → SUPERSEDED 2026-08-02 v0.1.49:
	// owner reviewed the deviation and picked the OFFICIAL banner shape.
	// What survives from both eras and is asserted here: session-persisted
	// rating ("up"|"down"), re-tap retracts, the dblclick gesture

	// 2026-08-02 v0.1.49 feedback banner, faithful prompt-kit feedback-bar
	// (owner's three questions: why different from prompt-kit [my deviation,
	// corrected], why on user bubble [tapback-era leak, removed], why bigger
	// than oa-msg-action [my 28px language, irrelevant now — official 32px
	// shells]): inline-flex border card, "Was this helpful?" title, 32px
	// ghost thumbs / 16px icons, Close behind a divider; pick=persists and
	// hides; dismiss=persists; assistant answers only; harness drives
	// pick→hide→dblclick-retract→close-dismiss

	// 2026-08-02 v0.1.49 icon integrity: every icon name the feedback banner
	// (and its lanes) render must resolve to shim ICONS entries that contain at
	// least one <path — the sim shim used to render unknown names as silent
	// empty svgs; this declaration-level guard keeps the map honest.
	// 2026-08-02 v0.1.51 composer action radius: ONE family. 2026-08-03
	// (v0.1.69 consolidation): the shared dated-end group is folded into the
	// base rules — attach toggle keeps 999px in its own single rule, and the
	// prompt-action base block declares 999px LAST (winner by intra-rule
	// order). Both asserted at declaration level; the empty lane still
	// measures the computed style.
	// 2026-08-02 v0.1.52 radius certification: every var(--radius-*, Npx)
	// fallback must equal the OFFICIAL Obsidian reference value (s=4, m=8,
	// l=12 — test/reference-obsidian-app.css). Found by matchAll scanning,
	// per-match whitelist (not identifier-substring negative asserts).
	// Message actions certified quiet rounded-square, radius-s family
	// (Hermes thread actions = rounded-md @main; the host var owns the
	// exact value, per the style contract).
	{
		const fs = require("fs");
		const path = require("path");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const ok = { s: "4", m: "8", l: "12" };
		const found = [...css.matchAll(/var\(--radius-([sml]), (\d+)px\)/g)];
		const bad = found.filter((m) => ok[m[1]] !== m[2]);
		if (
			bad.length === 0 &&
			found.length >= 20 &&
			/\.oa-app \.oa-msg-action \{[\s\S]{0,400}?border-radius: var\(--radius-s/.test(css) &&
			css.includes(".oa-app .oa-attach-toggle { border-radius: 999px; }") &&
			/\.oa-app \.oa-prompt-action \{[\s\S]{0,700}?border-radius: 999px;/.test(css)
		) {
			console.log("✓ radius certification: all fallbacks official (s4/m8/l12) · msg-action family kept · composer circles intact");
		} else {
			console.error("✗ radius certification drifted", bad.map((m) => m[0]).join(","));
			failed++;
		}
	}
	// 2026-08-02 v0.1.53 settings pixel lane: the General tab audit probe
	// (F18) must exist in build-settings.mjs with element-order assertions,
	// the aggregate red-probe gate must fail loudly, and release.mjs must
	// wire the settings audit as a real step (graduated, no longer manual).
	// 2026-08-23: the step now carries the readonly-witness env (run
	// 32653162333) — the marker follows the call prefix, not the closing
	// paren, so the env argument does not break the pin.
	// 2026-08-02 v0.1.54 feedback → learning signal (own invention; Hermes
	// reactions are display-only): down-rated previous reply → next turn's
	// system prompt carries one reflection section (save path follows
	// memoryEnabled). Declaration anchors: prompt section, runner pass-
	// through, ChatApp prev-assistant predicate, wire recorder full system
	// content, reax wire lane, unit tests.
	// 2026-08-02 v0.1.55 gate-hole fixes (caught live: a red reax lane rode
	// inside a "passed" release): the sim must assemble the REAL system
	// prompt (buildSystemPrompt imported, canned placeholder retired), and
	// build-preview must abort when the lane fails (no stale-frame degrade).
	// 2026-08-02 v0.1.56 changed-files card (Hermes changed-files-card
	// parity; derivation pure from persisted tool parts; honest meta = last
	// landed verb ×N, no invented diff numbers). Anchors: derive module,
	// card, ChatApp mount, sim honesty (created files exist + leaf mock),
	// fcard lane in build.mjs, unit suite wired into npm test, sim modify honesty.
	// system-message port (2026-08-02, v0.1.57): prompt-kit banner parity —
	// local notices stop posing as assistant turns (persisted role "system"
	// + explicit severity); they never reach the wire (history is messagesRef)
	// and never show feedback chrome. CTA persists as data, re-attached at
	// render. Anchors: type union, component, icons, ChatApp wiring, export
	// label, sim lane + projection, build.mjs lane, CSS.
	// approval preview diff + operation-aware safety classification:
	// persistent writes, destructive actions, and scheduling mutations are
	// gated in cautious mode; the gate shows a word-level diff from the SAME
	// planner the tools run; Accept writes through the tool, Deny rides the wire.
	// styles hygiene (2026-08-02, v0.1.59, audit-driven): the changed-files
	// count chip finally has a rule; radius/color drifts normalized to the
	// certified fallbacks; four retired classes deleted with their rules.
	// Negative asserts use exact literals — names of the retired selectors
	// stay out of every comment (lesson 46).
	// duplicate-selector guard (2026-08-02, v0.1.60) — the consolidation
	// attempt's honest outcome: 6 top-level selector families still carry
	// layered override blocks; EVERY earlier block keeps at least one
	// property its later siblings never redeclare, so none are deletable
	// garbage (full-cascade shadow analysis, lesson 51: the greedy analyzer
	// lied and a lane caught it). The debt is frozen, not expanded: the dup
	// set must equal this whitelist exactly — consolidating one is welcome
	// (update the list), adding a new one fails the build.
	// 2026-08-03 (v0.1.61): .oa-hub-chip-x consolidated into one merged
	// block (visual-verified) — 16 frozen families remain.
	// 2026-08-03 (v0.1.62): .oa-app .oa-reasoning-content consolidated
	// likewise — 15 frozen families remain.
	// 2026-08-03 (v0.1.63): .oa-app .oa-tool-chevron consolidated
	// likewise — 14 frozen families remain.
	// 2026-08-03 (v0.1.66): .oa-app .oa-reasoning + .oa-app .oa-cot-step-body
	// consolidated — 12 frozen families remain.
	// 2026-08-03 (v0.1.67): .oa-app .oa-prompt-actions + .oa-app .oa-msg-content
	// consolidated — 10 frozen families remain.
	// 2026-08-03 (v0.1.68): .oa-selbar-btn + .oa-cron-history consolidated
	// — 8 frozen families remain.
	// 2026-08-03 (v0.1.69): .oa-app .oa-prompt-action (group
	// dissolved) + .oa-hub-chip-count (folded) — 6 frozen families remain.
	// 2026-08-04 (v0.1.70): model-menu cluster (menu, item, footer,
	// footer button, footer button + button) folded winner-last — 1
	// frozen family remains (.oa-app shell).
	// 2026-08-04 (v0.1.71): .oa-app shell consolidated — the isolation
	// variable layer folded into the base shell rule (zero overlap);
	// 0 frozen families remain, the ARC IS COMPLETE.
	// prompt-actions + msg-content merged guards (2026-08-03, v0.1.67) —
	// both were zero-overlap layered pairs; each must stay ONE col-0 rule
	// carrying the full property set (visual-verified via ?s=convo computed
	// diff + stable shots byte-identical).
	// selbar-btn + cron-history merged guards (2026-08-03, v0.1.68) — selbar
	// keeps BOTH paddings in winning order (3px 8px above 0); cron keeps one
	// rule with the shared tabular-nums comma group left intact beside it.
	// prompt-action + hub-chip-count merged guards (2026-08-03, v0.1.69) —
	// prompt-action: ONE rule, radius declared twice with 999px LAST
	// (winner by intra-rule order, send stays a disc); attach toggle keeps
	// 999px in its own single rule. chip-count: ONE rule carrying
	// tabular-nums folded out of the numeric group (now cron pair only).
	// ---- v0.1.72 prompt-kit audit fixes (2026-08-04) — B1: the chat
	// container must observe RESIZE (not only mutations) so silent growth
	// keeps the pinned view at the bottom (+ official role="log"); B2: the
	// contenteditable composer must hold both its chip-sync AND its Enter
	// handling while an IME composition is active. Live lanes: build.mjs
	// convo (resize pin) + empty (composing Enter suppressed).
	// ---- v0.1.73 prompt-kit audit polish (2026-08-04) — B3: frame click
	// focuses the composer (button clicks untouched); B4: ScrollButton kept
	// mounted with is-hidden fade + pointer-events gating; B5: shimmer band
	// faithful to official (50% ± spread, never halved); B6: ComposerHandle
	// caret API honest (setCaret, no false-range setSelectionRange).
	// Live lanes: build.mjs empty (frame click) + convo (scroll-button fade).
	/* v0.1.75 — candidate ③ editor context menu: thin Obsidian glue
	   (editorMenu.ts) → ChatView sink → ChatApp api. Guards: bridge files
	   wired, chip label honest (full path + L-range, hyphen — Copilot
	   vocabulary), one-shot arm single-sourced (ONE skillContextRef write),
	   menu feature-detects the untyped submenu runtime API with a flat
	   fallback, three polite Notice guards present, settings toggle gates
	   live, and the sim lane drives the sink directly. */
	/* v0.1.76 — context-menu settings depth (owner: "tambah settingannya
	   (dan custom)"): A) granular per-action switches gated at menu-open
	   time; B) SKILL.md `contextMenu: false` hides a skill from the
	   Run-skill picker (Copilot showInContextMenu parity); C) snippets
	   flagged via the new row button join the menu as custom actions —
	   composer gets snippet text + quoted selection (no {} substitution). */
	/* v0.1.77 — Commands settings tab (owner: mirror Copilot's command
	   settings experience, model stays global; slash in composer vs menu
	   in editor are DIFFERENT surfaces). Guards: section registered, the
	   four editor-menu switches moved here, the custom-command table has
	   Copilot's columns (order arrows · In Menu · Slash · actions), new
	   commands start visible on both surfaces, snippets flagged `slash`
	   stage via the composer's Snippets group, agent tab keeps only a
	   relocation pointer. */
	/* v0.1.78 — Copilot prompt tokens (owner ask: form tips for {} /
	   {[[]]} / {activeNote} / {#tags}; tips without behavior would be
	   dishonest UI, so the placeholders resolve for real): pure extractor
	   module, runAgent send-time resolution riding the at-refs attach
	   pipeline, editor bridge {} inline substitution, modal tips block,
	   lane coverage on all five behaviors. */
	/* v0.1.79 — picker toggle (owner: "ada yang kelupaan, toggle on/off
	   tampil di prompt snippet seperti In Menu/Slash"): the composer [+]
	   "Prompt snippets…" picker is the ONE opt-out surface — `picker:false`
	   hides while absence stays visible (skills'-flag pattern, old vaults
	   never lose rows); the Commands table gains its third toggle; sanitize
	   never drops an explicit hide; stale "Settings → Agent" pointers die. */
	/* v0.1.80 — Hermes clarify tool (owner pick: clarifying questions
	   dulu; source-diporkan dari tools/clarify_tool.py @ aec3318, notes
	   docs/studies/hermes-clarify-tool.md): schema+envelope parity, platform
	   callback = requestClarify event (approval-class pause), kartu 3
	   mode + Other + Skip, toolset "clarify" default ON. */
	/* v0.1.81 — Quick Ask (Copilot overlay parity): floating CM6 panel
	   above the selection; ports: anchors (line-start trap), persistent
	   highlight factory, mapPos ReplaceGuard (7 reasons), ViewPlugin,
	   controller. Tools OFF + first-turn <selected_text> + system prompt
	   verbatim; Copy/Insert/Replace; source-mode gate; settings toggle. */
	/* v0.1.82 — Quick Ask panel rebuilt on the prompt-kit component ports
	   (owner ask 2026-08-05: "kalau prompt-kit bisa diterapkan akan lebih
	   mantap"): same visual family as the chat — ChatContainer stick-to-
	   bottom + ScrollButton, Message/MessageActions/CopyAction hover
	   actions, Markdown for final answers (pre-wrap while streaming),
	   Loader typing, PromptInputAction send/stop, suggestion chips that
	   only FILL the input. app/component threaded overlay→controller→main
	   for MarkdownRenderer. */
	/* v0.1.83 — quick-ask composer dirapikan = cermin composer chat utama
	   (owner: "oa-quickask-composer kurang rapi … send button match dengan
	   main chat ui"): kolom input→actions-row (bukan float kanan), send =
	   ArrowUp 16 primary dengan adaptive icon + hover brightness(0.92) +
	   disabled disc netral inert, Stop = square variant danger. */
	/* v0.1.84 — quick-ask icon sizing fix (owner: "close button tidak square,
	   iconnya tidak ditengah, send button icon juga tidak ditengah"): akar
	   masalah = kontrak <Icon> (span punya ukuran, svg setIcon ngisi 100%)
	   dulu di-scope ke .oa-app padahal panel quick ask + settings hidup di
	   luarnya → span inline mengabaikan width/height dan glyph 24×24 asli
	   membesar + nangkring di baseline. Guard: rule .oa-icon harus UNSCOPED,
	   close button square 24×24 padding 0. Geometri nyata (offsetWidth, svg
	   bounding box) dikunci di lane qask real-preview. */
	/* v0.1.85 — Quick Ask suggestion chips customizable via prompt snippets
	   (owner: "suggestion, di quickask apakah bisa di custom juga seperti
	   prompt snippet?"): flag opt-in keempat `quickAsk` pada PromptSnippet
	   (shape persis ctxMenu/slash), toggle keempat di baris Settings →
	   Commands, chips panel = snippet flagged (judul = chip, klik = stage text
	   ke input), built-in jadi fallback saat tak ada yang flagged. Getter
	   live di deps controller → toggle langsung kebaca di open berikutnya. */
	/* v0.1.86 — chip row Quick Ask jadi baris scroll horizontal (owner:
	   "buat jadi baris scroll aja"): berapapun snippet yang di-flag tidak
	   membuat panel membesar — nowrap + overflow-x auto, chip flex:none,
	   scrollbar tipis transparan. Geometri overflow dikunci di lane qask. */
	/* v0.1.87 — Quick Ask contract audit (kontrak ~/skills yang baru dipoles):
	   semua state & surface diperiksa. Temuan+fix: textarea aria-label;
	   actions reveal tak lagi hover-only (focus-within + coarse-pointer
	   media); error turn gagal jadi baris inline role=alert + pertanyaan
	   kembali ke input; overscroll contain (panel & chip row); layer
	   prefers-reduced-motion GLOBAL pertama; region quickask diverifikasi
	   0 hex literal (light/dark aman by-construction). Geometri kasar-
	   pointer & fase gagal/retry dikunci di lane qask (build.mjs emulasi
	   pointer:coarse). */
	/* v0.1.88 → DIAMENDEMEN v0.1.91 — Quick Ask drag saja. Kontrak asli
	   memuat resize (grip pojok + keyboard); owner 2026-08-06: "tidak
	   lazim, di copilot grip itu untuk MOVE" → resize DIHAPUS (v0.1.91),
	   guard ini menyisakan kontrak drag yang masih berlaku: head handle
	   (filter ×), detach re-anchor, userPos writeback clamp hasil drag. */
	/* v0.1.89 — model picker in-panel Quick Ask (owner: "seperti di main
	   chat ui; keterangan model pindah bawah composer"): komponen
	   ModelPicker ASLI (moa tidak dioper, runTurn bare chatCompletion),
	   pick/refresh/writeback via deps live (main.ts mirror selectModel +
	   refreshModels verbatim), header bersih dari label, caption footer
	   statusbar-mini, CSS mirror winner .oa-app→.oa-quickask (57 selector),
	   panel overflow visible supaya dropdown bisa keluar tepi atas. Lane
	   menguji DOM nyata komponen di dua provider. */
	/* v0.1.90 — {activeNote} di Quick Ask (owner ask): parser murni baru
	   extractActiveNoteToken di promptTokens.ts (satu rumah regex token);
	   resolve = [Attached file: <path>] parity main chat, konten LIVE dari
	   editorView.state.doc (suntingan belum-simpan ikut — bukan baca disk);
	   bubble menyimpan teks mentah, wire distrip; path tak dikenal → Notice
	   bernama; token lain ({},{[[]]},{#}) sengaja tetap literal di Quick
	   Ask. Lane: mixed-case + live-doc (X edit) + strip + bubble mentah. */
	/* v0.1.91 → v0.1.100 — sejarah jujur: v0.1.91 menghapus resize atas
	   umpan balik owner ("ada tombol resize gitu kek ngak lazim") — yang
	   ditolak = WUJUD TOMBOLNYA, bukan konsepnya. 2026-08-06 owner: "fungsi
	   resizenya hilang ya? …mau tetap ada tapi yang kamu buat tadi itu jadi
	   kayak tombol. coba cari referensi dulu". Referensi (macOS Daring
	   Fireball: zona hit DI DALAM frame; kegagalan Tahoe; VS Code/Cursor:
	   target 1px = sengsara) → bentuk baru: SEAM POJOK 16px tak terlihat.
	   Guard ABSENCE untuk wujud yang ditolak (grip tombol, grip glyph
	   move, sized-absence v0.1.91 — ketiganya TIDAK pernah balik: move
	   glyph dihapus owner pick grip-none; tombol-grip digantikan seam) */
	/* v0.1.92 — retry/failover Quick Ask (sisa terakhir paket): helper
	   attemptWithResilience di resilience.ts (dipinjam dari prinsip Hermes
	   bagian atas file); main.ts membuat targets [primary, fallbackValid#1]
	   — turn-scoped maks SATU swap; model fallback ikut via override;
	   panel me-reset stream parsial lewat onRetry; abort memutus sebelum
	   attempt. Lane: kelas error jaringan retry 2×, 401 tanpa retry →
	   swap, abort sebelum attempt 0 panggilan, end-to-end stream reset. */
	/* v0.1.93 — audit UI settings ronde-1 (mudah, by-fix bukan reskin —
	   constraint 5 kontrak openagent-ui): (1) scope-leak reduced-motion
	   mirror .oa-quickask .oa-spin (blok lama tak menjangkau quickask) →
	   perlakuan status baku fade-not-rotate; (2) blok problems MoA
	   pemblokir save → role=alert di-createDiv. Icon-only settings sudah
	   ber-title via setTooltip (kontrak OR) → BUKAN pelanggaran. Probe
	   F17 "first:preset" ternyata struktur ul/li di DOM nyata → hantu
	   harness, bukan bug (dicatat teliti). */
	/* v0.1.94 — settings: search bar + titik "berubah dari default"
	   (penambahan murni, constraint 5 aman — section-rail tak disentuh).
	   Indeks search di-panen dari builder section ASLI ke host detached
	   (teks tak mungkin drift dari UI); klik hasil keluar mode search →
	   lompat tab + flash baris; guard searchHarvesting menahan fan-out
	   jaringan (hub taps/deskripsi/loadSkills) dari render panen; snapshot
	   + restore field El agar panen tak mencuri ref pane hidup. Blok CSS
	   di EKOR styles.css — token tema saja; tanpa hex/transition:all/
	   border-radius literal (hygiene pelajaran 65). */
	/* v0.1.95 — settings card refinement (owner directive: "perbaiki UI,
	   kartu dirapikan" — constraint 5 dicabut owner 2026-08-06). Look kartu
	   itu milik CORE Obsidian (.setting-item di app.css); refinement =
	   token scoped + nilai yang DIEDIT DI TEMPAT pada rule lama (satu
	   definisi per selector — guard anti-debt layered-selector & chip-x
	   tetap hijau), satu-satunya selector BARU yang di-append di ekor:
	   .oa-settings .setting-item. Dievaluasi pixel-by-pixel via lane. */
	/* v0.1.96 — perbaikan chrome oa-settings-search (laporan owner): "kotak
	   di kanan" & bingkai ganda itu CAT ASLI UA stylesheet — input:is([type])
	   & button native appearance duduk di (0,1,1) dan mengalahkan class
	   tunggal (terbukti: enumerasi document.styleSheets menemukan NOL rule —
	   pencurinya UA). Fix: appearance:none + prefix parent (0,2,0), state
	   focus (0,3,0), clear visibility:hidden (22×30 ghost!) → display:none/
	   flex swap, placeholder token, fokus × outline. */
	/* v0.1.97 — hover-netral oa-settings-search-input (owner: efek hover
	   merusak estetika). F26 mengukur: :hover mengisi background field
	   dengan abu host/UA + menggeser border-color. Fix bukan "specificity
	   war" tapi PIN keadaan hover/active ke cat netral yang sama —
	   affordance interaktif tetap kursor teks; tak ada yang bergerak. */
	/* v0.1.98 — hover-netral composer Quick Ask (owner: "kasus sama juga
	   terjadi di composer quick ask"). Pelukis = block @media (hover:hover)
	   core untuk form field (textarea:hover → bg rgb(42,42,42) — kembaran
	   settings v0.1.97). Sim qask mem-flip touch emulation di TENGAH skenario
	   utk cek coarse → media hover:none → buta; probe DIPINDAH sebelum blok
	   coarse (halaman masih desktop) dan kini merah→hijau terukur. Fix =
	   parity mirror reset field global .oa-app → .oa-quickask (checkbox
	   dikecualikan demi vis-dialog), bump specificity composer. BENTUK
	   :is( DIKOREKSI v0.1.99 (pelajaran 79): inflasi specificity :is()
	   menggasak metrik composer — guard ini kini mengunci bentuk split
	   selector polos berkekuatan rendah. */
	/* v0.1.99 — specificity trap (owner: "malah timbul masalah baru, coba
	   lihat di composer utama saja"). Akar (terukur, bukan ditebak): :is()
	   mengambil specificity argumen TERTINGGI — :is(input:not():not(), …)
	   meloncatkan reset global quickask ke (0,3,1), menang atas composer
	   (0,2,0): padding 10/12/4 → 0 · min-height 26 → 0 · shorthand
	   font: inherit menggasak line-height 1.5 → normal. Lane qask hijau
	   PALSU karena hover-diff tetap {} saat padding runtuh (diff-of-nothing
	   bukan bukti sehat). Guard: bentuk :is( dilarang kembali di scope
	   quickask; reset = selector polos kekuatan rendah; font longhand
	   (family saja); lane mengukur NILAI RESOLVED composer — diff saja
	   tak pernah cukup (pelajaran 79). */
	/* v0.1.100 — seam measured-pack: lane wajib menyimpan kunci hasil
	   terukur (resolved values — pelajaran 79), bukan sekadar string */
	/* v0.1.101 — quote bar mati senyap (owner: "fitur quote di chat ui
	   menghilang"; gejala: seleksi bisa, bar tak pernah muncul). Flip-flop
	   selDrag hanya punya jalan turun pointerup; pointer dibatalkan
	   browser/OS (touch takeover, gesture OS, drag initiation) → up tak
	   pernah datang → selDrag=true selamanya → tiap recompute pulang awal
	   → bar mati sampai remount. Harness selalu memasangkan event → hijau
	   palsu bertahun-tahun; di pengadilan, lane 3 red witness mereproduksi
	   gejala owner PERSIS. Tambal tiga lapis (pointercancel resmi ·
	   WINDOW-capture backstop · mousemove buttons=0 fakta fisik). Guard:
	   ketiganya wajib ada; lane witness wajib ada. */
	// 2026-08-07 v0.1.102 quote bar — contain:strict merelokasi fixed (owner
	// diagnostik babak 2: barTerender:true, rect l:1345 di LUAR viewport,
	// offsetParent=DIV.workspace-leaf): core Obsidian memasang contain:strict
	// di .workspace-leaf → elemen fixed di dalam pane ter-re-anchor ke leaf,
	// left/top yang diukur dari ruang viewport dicat di ruang pane — di mesin
	// owner sampai keluar layar ("masih sama", bar dirender tapi tak tampak).
	// Fix: createPortal ke document.body (body = origin viewport; preseden
	// quick-ask & menu core); selektor re-root .oa-selbar .oa-selbar-btn
	// (0,2,0) + netralisasi eksplisit (payung reset .oa-app tak menaungi
	// elemen portal). Pengadilan: fake-leaf contain:strict + offset 240/40
	// (sel scenario) — terbukti red (dx=241, l:526 > vw:470, GEJALA OWNER)
	// lalu hijau. Guard: portal+body wajib ada; tak boleh ada lagi
	// .oa-app .oa-selbar; chrome mirror + lane witness wajib ada.
	// 2026-08-07 v0.1.103 dblclick word-selection (owner: "select text dengan
	// metode klik tidak ke select … seperti ke cancel"): handler tapback di
	// root .oa-msg memanggil removeAllRanges() 0ms setelah browser memilih
	// kata — seleksi mati seketika (dan reaksi diam-diam ter-toggle). Branch
	// detail!==2 sudah melindungi seleksi triple-klik; dobel-klik bolong di
	// kelas yang sama. Fix: .oa-msg-content masuk TAPBACK_EXCLUDE — teks =
	// wilayah seleksi (quote bar ikut nongol dari seleksi kata), chrome
	// bubble = wilayah tapback (lane reax menjaga retract). Lane 5 dblclick
	// CDP sungguhan membuktikan red ({"text":"","bar":false}) → hijau.
	// 2026-08-07 v0.1.104 prompt-kit fidelity (owner: (1) "perbaiki posisi
	// oa-thinkingbar-stop, posisi di pojok kanan mentok (sama seperti
	// komponen asli dari prompt-kit)"; (2) "perbaiki oa-tool-state-icon yang
	// kelihatan cacat (itu sebenarnya animasi loading atau dot)"). Upstream
	// diverifikasi raw: thinking-bar = flex w-full justify-between + stop
	// dotted-underline tanpa chevron; tool states = Loader2 spin biru /
	// Settings oranye / circle-check hijau / circle-x merah semua 16px.
	// Bypass loader kustom kita terukur border over-ride 1.5px → used 1px
	// (probe) = ring rapuh "cacat"; glyph arc svg menggantikannya (anti-
	// aliased di semua zoom), body lucide di-inline verbatim — nol
	// ketergantungan rename antar versi Obsidian (check-circle era dkk).
	// Lane fixture statis toolstate menjaga semuanya terukur.
	// 2026-08-07 v0.1.105 diff ala LobeHub unified + spinner tak lagi
	// membeku di reduce-motion (owner: (1) "diff kita masih kelihatan polos
	// — coba lihat punya lobe hub, unified diff"; (2) "loading nya tidak
	// ada animasi sama sekali / tidak bergerak"). Look diverifikasi via
	// ui.lobehub.com/components/code-diff (docs + pixel capture): baris =
	// tint transparan lembut (bukan blok pekat), gutter nomor ganda old/new
	// (kolom lawan kosong di baris murni tambah/hapus), segmen kata berubah
	// = tint pekat tanpa coretan; counts minus-merah duluan lalu plus-hijau.
	// Akar "polos": skin lama memakai blok background pekat penuh (success
	// modifier solid) yang tampak seperti slab datar. Akar "tidak bergerak":
	// EMPAT blok reduce-motion punya jalur calm untuk SEMUA indikator status
	// KECUALI glyph spinner v0.1.104 → durasi dibunuh generik jadi diam
	// total; witness RED {name:oa-spin,dur:1e-05s}. Computed animationName
	// saja = green palsu — witness sah = dua sampel transform live 350ms
	// yang BERBEDA (lane toolstate) + halaman reduce-motion kedua membukti
	// denyut calm. Pelajaran 85. DIAMENDIR v0.1.106 (owner koreksi dgn screenshot
	// resmi): pin alpha 14/13/32% → 20/20/40%, gutter ganda → SATU kolom
	// (pin core oldLine/newLine → lineNo), spinner calm → tetap berputar.
	// 2026-08-07 v0.1.106 koreksi gutter dari SCREENSHOT RESMI (owner:
	// "oa-preview-gutter kamu salah (lihat screenshoot yang saya kasi dari
	// website resminya)"; "is-streaming bukan animasi loading malah pulse").
	// Kebenaran pixel (probing canvas dari lampiran owner): gutter SATU kolom
	// — removed = nomor lama tinta rose (177,37,82), added = nomor baru
	// tinta olive (103,129,36), context = abu terang — plus pita tepi kiri
	// SOLID 4px (rose 80,25,43 / olive) HANYA di baris berubah (rows context
	// 6-8 di screenshot resmi bersih → TANPA hose). Angka tint 0.2/segmen 0.4
	// dikunci dua sumber resmi: app.css bawaan Obsidian yang dilampirkan
	// owner (mod-left/mod-right 0.2 · diff-changed 0.4). Spinner: loading =
	// motion esensial (rotasi = identitas komponen) → TETAP oa-spin 1s
	// linear bahkan di reduce-motion; denyut hanya untuk dekor. Pelajaran 86.
	// 2026-08-07 v0.1.107 mermaid salvage (owner menjatuhkan tembok konsol:
	// "Lexical error on line 2. Unrecognized text ... subgraph Agent Loop ✨
	// A[🚀 Task/"). PERTAMA diduga newline diratakan pipeline — reproduksi
	// mermaid.parse membuktikan pesan itu byte-identik untuk sumber BARIS-
	// NORMAL dengan judul subgraph ber-emoji tanpa kutip; excerpt jison
	// memang menyesatkan bentuk. Akar = lexer mersion menolak judul bare
	// non-identifier; label node ber-emoji aman. Salvage sempit idempoten:
	// kutip judul subgraph bare yang bukan quoted / bukan id[title] / bukan
	// identifier polos (identifier bisa dirujuk edge!). Unit 10 kasus hijau
	// + lane md menegaskan sumber yang TIBA di renderer sudah terkutip.
	// Pelajaran 87.
	// v0.1.115: semua search UI chat lewat satu komponen SearchField (strip/pill, clear 2-tahap Escape)

	// v0.1.116: rasa editor markdown di semua input multi-baris — satu mesin + dua adapter
	// v0.1.117 (owner serious bug): simbol pasangan bocor ke composer — execCommand("insertText") DICABUT dari jalur textarea
	// v0.1.119 (owner ×2): ikon hapus panel terdorong judul panjang + cacat padding menu profil —
	// akar = serapan gabungan 2848 (list jadi flex ROW+wrap); un-merge + segel baris + ritme strip
	// v0.1.120 (owner: "oa-model-menu-list sepertinya sama" — BENAR): un-merge DILENGKAPI —
	// serapan blok hub/cron menelan ENAM selector, slash-menu & model-menu-list ikut keluar
	// v0.1.121 (owner ×2): badge op hijau-di-atas-hijau (bg==fg rgb(68,207,110) di red-proof!)
	// + kartu changed-files menyimpan path mentah — workspaceFolder tak teresolve → notice palsu
	// v0.1.122 (owner pick "tint lembut di rest" + samakan quick ask + anti-kapsul):
	// stop/[+] rest bertinta (bukan telanjang), hover pekat; aspect-ratio 1/1 kunci bujur sangkar
	// v0.1.123 (owner: hover [+] kok memakai warna button stop + mermaid crash "got 'PS'"):
	// --background-modifier-active-hover di app.css asli = hsla(aksen, 0.1) (tint AKSEN,
	// terukur rgba(138,92,245,0.1) di harness; aksen kemerahan ⇒ persis tint Stop) — hover/is-open
	// [+] pindah ke tangga netral color-mix 12% text-normal; sanitizeMermaidSrc mengkutip label
	// flowchart berkurung/kutip mentah (+ interior stadium/cylinder/subroutine/hexagon/diamond/pipa)
	// byte-terbukti parse di mermaid@11.16.1, tanpa menyentuh bentuk bersih/kelas/sequence.
	// v0.1.124 (owner console STARTUP: 'PS' crash dari NOTE di vault, stack
	// loadLayout → loadFile → setViewData → spans → toDOM → mermaid.render bukan
	// dari render chat): /save menulis transkrip VERBATIM ke openagent/exports/chat-*.md
	// dan mermaid bawaan Obsidian meledak lagi pada label berkurung mentah — export kini
	// melewati sanitizeMermaidFences (sanitize per-fence mermaid, luar fence byte-identical).
	// v0.1.125 (owner: mermaid gagal di DUA permukaan — chat SUDAH padam vi0.1.123,
	// editor Live Preview/Reading gagal karena note ditulis agent berlabel kurung mentah):
	// write_note mensanitasi fence mermaid saat menulis (ensureMd ⇒ target selalu markdown;
	// byte-identical di luar fence). Sisipan penemuan matrix: `ID:::class[label]` class-sebelum
	// TIDAK PERNAH valid jison — direorder ke class-sesudah (parse di semua bentuk, 11.16.1).
	// v0.1.127 (owner ×3: "ctrl enter tidak berfungsi" + preferensi bawaan):
	// chord kirim — bawaan Shift+Enter=kirim/Enter=baris baru · toggle ON
	// membalik · Ctrl/Cmd+Enter SELALU kirim di dua mode
	// v0.1.128 (audit 2026-08-09, peluru-perak terukur): production build di-MINIFY
	{
		const cfg = read("esbuild.config.mjs");
		const size = read("main.js").length;
		const ok =
			cfg.includes("minify: prod ? true : false") &&
			!cfg.includes("es.drop") && !cfg.includes("\tdrop:") && // jalur debugMode menjaga console.* nya — opsi pelempar-log tak boleh masuk
			size > 100000 &&
			size < 1200000 && // v0.1.145 Workspace enforcement adds policy/provenance guards; keep the minified bundle below 1.2 MB
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.128: production minify aktif · main.js terjepit < 2,3 MB (dry-run 1,93 MB dari 5,40 MB) · console debugMode tidak di-drop");
		} else {
			console.error(`✗ v0.1.128 minify regressed (main.js ${size} B)`);
			failed++;
		}
	}
	// v0.1.129 (audit docs/audits/audit-2026-08-09.md p3): dead exports dibersihkan —
	// 9 ikon tak direferensikan (BrainIcon sengaja park), konstanta goals yatim
	// v0.1.130 (audit batch 3): pdf.worker EKSTERNAL — vendor file + blob Worker

	// v0.1.131 (audit batch 4, penutup): styles.css di-minify KHUSUS ZIP
	// (repo tetap readable — rencana awal minify repo dibatalkan karena
	// puluhan pin smoke menjangkar layout sumber); audit CSS ditutup: 43
	// kandidat mati semua TERBUKTI false-positive/comment-only (3 terakhir
	// — oa-selbar-rooted/oa-app-only/oa-app-scoped — hanya frasa di
	// komentar, nol aturan, nol referensi kode).
	{
		const rel = read("scripts/release.mjs");
		const css = read("styles.css");
		const ok =
			rel.includes("CSS_SENTINELS") &&
			rel.includes('loader: "css"') &&
			rel.includes("minify: true") &&
			rel.includes("minifyCssForZip(join(root, f)") &&
			rel.includes("(zip-minified, sentinel-verified)") &&
			css.includes("QUICK ASK FIELD RESET") && // komentar sumber bertahan = repo styles.css TIDAK ikut terminify
			css.includes(".oa-selbar .oa-selbar-btn {") && // aturan selbar asli tetap di selector nyata (v0.1.102)
			css.includes("\n") && // layout multi-baris utuh
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.131: styles.css zip-only minify + sentinel verify · repo tetap readable · audit CSS 43/43 tuntas false-positive");
		} else {
			console.error("✗ v0.1.131 zip-only css minify regressed");
			failed++;
		}
	}

	// v0.1.132 (menuntaskan 🟡 §gap-doc): skills ⅔ → 3/3 — Hermes skill_view +
	// skill_manage parity (studi raw: features/skills.md + tools-reference).

	// v0.1.133 (menuntaskan 🟡 §gap-doc #2): todo tool — 1:1 port Hermes
	// tools/todo_tool.py (studi byte-level): single tool, omit=read, merge
	// flag, caps 4000/256, dedupe last-wins, injection HANYA item aktif.

	// v0.1.134 (menuntaskan 🟡 §gap-doc #3): vision_analyze — bounded port
	// Hermes tools/vision_tools.py: native pixels ride tool result (envelope
	// bypass clipper), legacy = aux vision + template prompt mereka.

	// v0.1.135 (PENUTUP 🟡 §gap-doc #4): delegate_task — port berbatas Hermes
	// tools/delegate_tool.py; rencana docs/plans/hermes-delegation-plan-2026-08-09.


	// v0.1.144 — one structural fence policy and one canonical assistant-output
	// boundary cover both exact `; %` / `; %%` salvage and every persisted sink.

	failed += stylesGuards();
	failed += settingsGuards();
	failed += chatGuards();
	failed += agentGuards();
	failed += quickaskGuards();
	failed += previewGuards();

	plugin.onunload();	if (failed > 0) {
		console.error(`\n${failed} smoke check(s) failed`);
		process.exit(1);
	}
	console.log("\nAll smoke checks passed.");
})().catch((e) => {
	console.error("FAIL:", e);
	process.exit(1);
});

