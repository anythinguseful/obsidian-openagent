/**
 * Smoke test: load the built bundle with a mocked `obsidian` module and
 * instantiate the plugin with a mock app to verify wiring works end to end
 * (minus the real Obsidian runtime).
 */

const Module = require("module");
const path = require("path");
const fs = require("fs");
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

// Obsidian runtime always provides `window`; shim it for Node.
global.window = {
	setInterval,
	clearInterval,
	setTimeout,
	clearTimeout,
	moment: () => ({ format: () => "2026-07-16" }),
};

/* ---------- obsidian mock ---------- */

class MockBase {
	constructor() {}
	addClass() {}
	createDiv(o) {
		return new El();
	}
	createEl() {
		return new El();
	}
	empty() {}
	load() {}
	unload() {}
}
class El extends MockBase {
	set text(v) {}
	get style() {
		return {};
	}
	setAttribute() {}
	addEventListener() {}
	appendChild() {}
}

const obsidianMock = {
	/* Explicit mobile-like gate: the bundle/onload smoke must not acquire the
	   desktop Terminal runtime when Obsidian reports a non-desktop platform. */
	Platform: { isDesktopApp: false },
	Plugin: class extends MockBase {
		async loadData() {
			return null;
		}
		async saveData() {}
		addRibbonIcon() {}
		addCommand() {}
		/* v0.1.75: editor context menu registration goes through registerEvent */
		registerEvent() {}
		/* v0.1.81: Quick Ask CM6 ViewPlugin goes through registerEditorExtension */
		registerEditorExtension() {}
		addSettingTab() {}
		registerView() {}
		registerInterval() {}
	},
	PluginSettingTab: class extends MockBase {},
	ItemView: class extends MockBase {},
	Setting: class {
		setName() { return this; }
		setDesc() { return this; }
		addToggle() { return this; }
		addDropdown() { return this; }
		addText() { return this; }
		addTextArea() { return this; }
		addSlider() { return this; }
		addButton() { return this; }
		addExtraButton() { return this; }
	},
	Notice: class extends MockBase {},
	Component: class extends MockBase {},
	Modal: class extends MockBase {},
	FuzzySuggestModal: class extends MockBase {
		setPlaceholder() {}
	},
	TFile: class {},
	TFolder: class {},
	MarkdownRenderer: { render: async () => {} },
	normalizePath: (p) => p,
	parseYaml: () => ({}),
	setIcon: () => {},
	requestUrl: async () => {
		throw new Error("network disabled in smoke test");
	},
	moment: () => ({ format: () => "2026-07-16" }),
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "obsidian") return "obsidian-mock";
	return originalResolve.call(this, request, ...args);
};
require.cache["obsidian-mock"] = {
	id: "obsidian-mock",
	filename: "obsidian-mock",
	loaded: true,
	exports: obsidianMock,
};

/* ---------- load bundle ---------- */

const mainPath = path.join(__dirname, "..", "main.js");
const mod = require(mainPath);
const OpenAgentPlugin = mod.default ?? mod;

if (typeof OpenAgentPlugin !== "function") {
	console.error("FAIL: default export is not a plugin class");
	process.exit(1);
}
console.log("✓ bundle loads, default export is the plugin class");

/* ---------- instantiate with mock app ---------- */

const plugin = new OpenAgentPlugin();
plugin.app = {
	vault: {
		configDir: ".obsidian",
		getName: () => "SmokeVault",
		getAbstractFileByPath: () => null,
		getMarkdownFiles: () => [],
		adapter: {
			exists: async () => false,
			mkdir: async () => {},
			list: async () => ({ files: [], folders: [] }),
			read: async () => "{}",
			write: async () => {},
			remove: async () => {},
		},
	},
	workspace: {
		getLeavesOfType: () => [],
		getRightLeaf: () => null,
		/* v0.1.161: chat panel location — the other two leaf sources */
		getLeftLeaf: () => null,
		getLeaf: () => null,
		getActiveFile: () => null,
		/* v0.1.78 (lesson 60): runAgent reads workspace.activeEditor?.editor
		   for the {} token — pin the surface so a future remove fails loud */
		activeEditor: null,
		revealLeaf: () => {},
		/* v0.1.75: registerEditorContextMenu subscribes workspace.on("editor-menu") —
		   the mock returns a bare EventRef; registerEvent only stores it */
		on: () => ({}),
	},
	metadataCache: { getFileCache: () => null },
	setting: { open() {}, openTabById() {} },
};
plugin.manifest = { id: "openagent", version: "0.1.0", name: "Open Agent", author: "anonymous" };

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
	{
		const fs = require("fs");
		const chatSrc = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		if (
			chatSrc.includes("persistSession(turnsRef.current)") &&
			(chatSrc.match(/[^.A-Za-z]setTurns\(/g) ?? []).length === 1 &&
			chatSrc.includes("disclosureId")
		) {
			console.log("✓ persistence reads live turns ref; disclosures persisted");
		} else {
			console.error("✗ persistence/disclosure wiring drifted in ChatApp.tsx");
			failed++;
		}
	}

	// real-preview harness guard: the honest-preview pipeline (real ChatApp DOM
	// injection into preview/ pages) must stay wired — this is what keeps
	// "preview vs real" from drifting apart again.
	{
		const fs = require("fs");
		const t = (p) => fs.existsSync(path.join(__dirname, p));
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const harness =
			t("real-preview/obsidian-shim.ts") &&
			t("real-preview/chat-entry.tsx") &&
			t("real-preview/build.mjs") &&
			read("real-preview/chat-entry.tsx").includes("stopTerminalSession: async () => 0") &&
			/* v0.1.171: the runnerMock must stay contract-complete with the
			   real AgentRunner — getToolsWithMcp went missing and silently
			   errored every agent run in the sim (root cause of the parked
			   title/slash2/slash3/md "drift" cluster). It must delegate to
			   getTools() at call time (scenario lanes override getTools). */
			read("real-preview/chat-entry.tsx").includes("getToolsWithMcp: async function ()") &&
			read("real-preview/chat-entry.tsx").includes("return this.getTools();") &&
			/* v0.1.176: engineForPolicy joined the mock contract (structured memory) */
			read("real-preview/chat-entry.tsx").includes("engineForPolicy: () => (") &&
			/* v0.1.177: reflect + mentalModelsBlock joined the engine stub */
			read("real-preview/chat-entry.tsx").includes("reflect: async () => null") &&
			read("real-preview/chat-entry.tsx").includes("mentalModelsBlock: async () => null");
		const preview = read("preview-frames.source.html");
		const build = read("build-preview.mjs");
		const marked =
			preview.includes('data-real="convo"') &&
			preview.includes('data-real="panel"') &&
			(preview.match(/<!-- badge:[a-z]+ -->/g) ?? []).length >= 2 &&
			(preview.match(/<!-- \/view -->/g) ?? []).length >= 2;
		const injector =
			build.includes("data-real") &&
			build.includes("frames.json") &&
			build.includes("buildRealFrames") &&
			build.includes("contain: initial !important");
		/* the old name (test/preview.html) invited opening it directly — it is
		   source material with no plugin CSS, so it renders unstyled. Renamed
		   to *.source.html + guarded so the bait name never returns. */
		const renamed = !t("preview.html") && t("preview-frames.source.html");
		/* self-healing: browser cache wipes between sessions must not silently
		   drop previews back to static — build.mjs installs the headless shell
		   and retries once when the executable is missing */
		const rp = read("real-preview/build.mjs");
		const heal =
			rp.includes("launchBrowser") &&
			rp.includes('"install"') &&
			rp.includes("chromium-headless-shell") &&
			rp.includes("Executable doesn't exist");
		if (harness && marked && injector && renamed && heal) {
			console.log("✓ real-preview harness wired (shim + entry + injection + scroll fix + browser self-heal)");
		} else {
			console.error(
				`✗ real-preview harness drifted (harness:${harness} marked:${marked} injector:${injector} renamed:${renamed} heal:${heal})`
			);
			failed++;
		}
	}

	/* release-witness guard (run 32653162333): the settings harness writes a
	   TRACKED witness; its rewrite policy must go through the pure planner so
	   a release run (OA_RELEASE_WITNESS=readonly, passed by release.mjs) can
	   never dirty the tracked tree the fail-closed clean assertion protects.
	   release.mjs must also re-assert tree cleanliness right after the preview
	   steps, so drift fails at the exact step that caused it. */
	{
		const bs = read("test/real-preview/build-settings.mjs");
		const rel = read("scripts/release.mjs");
		const witnessPolicy =
			bs.includes("planSettingsWitnessUpdate") &&
			bs.includes('process.env.OA_RELEASE_WITNESS') &&
			bs.includes('"readonly"') &&
			bs.includes('out", "settings-audit-probes.json');
		const releaseWiring =
			rel.includes('OA_RELEASE_WITNESS: "readonly"') &&
			rel.includes("assertTrackedTreeClean(root)");
		if (witnessPolicy && releaseWiring) {
			console.log("✓ release witness policy wired (readonly release runs never dirty the tracked tree)");
		} else {
			console.error(`✗ release witness policy drifted (witnessPolicy:${witnessPolicy} releaseWiring:${releaseWiring})`);
			failed++;
		}
	}

	// providers guard: buffered completion must single-shot emit onReasoning/
	// onToken — regression guard for "empty assistant bubbles when streaming is
	// off or the stream dies before the first token".
	{
		const fs = require("fs");
		const src = fs.readFileSync(path.join(__dirname, "..", "src", "agent", "providers.ts"), "utf8");
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

	// providers guard: real timeouts on every network path — regression guard
	// for the dead `dispatchEvent("openagent-timeout")` no-op (nothing ever
	// listened to that event, so streaming requests could hang forever; cron
	// runs pass no signal at all, so a stalled provider froze the automation).
	{
		const fs = require("fs");
		const src = fs.readFileSync(path.join(__dirname, "..", "src", "agent", "providers.ts"), "utf8");
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

	// data portability guard (docs/plans/data-portability-plan.md): normalize pipeline
	// is the single source of truth, exports are versioned+redacted, reset is
	// trash-based (recoverable) and confirmed.
	{
		const fs = require("fs");
		const bundle = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
		const st = fs.readFileSync(path.join(__dirname, "..", "src", "settingsTab.ts"), "utf8");
		const ss = fs.readFileSync(path.join(__dirname, "..", "src", "settings.ts"), "utf8");
		const mn = fs.readFileSync(path.join(__dirname, "..", "src", "main.ts"), "utf8");
		const vc = fs.readFileSync(path.join(__dirname, "..", "src", "agent", "vaultCompat.ts"), "utf8");
		if (
			bundle.includes("openagent/exports") &&
			/* v0.1.128 amended: identifier tidak lagi dipin di bundle — minify
			   merename mereka; literal kunci `openagentExport` (property key,
			   selamat dari minify) bertahan di bundle. Pin identifier teknis
			   kini dibaca dari src (src tak pernah diminify). */
			ss.includes("normalizeLoadedSettings") &&
			mn.includes("normalizeLoadedSettings") &&
			ss.includes("openagentExport") &&
			!mn.includes("Object.assign({}, DEFAULT_SETTINGS") && // merge logic must live in settings.ts only
			ss.includes("EXPORT_SCHEMA_VERSION") &&
			ss.includes("SENSITIVE_HEADER_RE") &&
			st.includes("Backup & Restore") &&
			st.includes("Danger Zone") &&
			st.includes("Reset everything") &&
			vc.includes("trashFile") // recoverable reset, never vault.delete
		) {
			console.log("✓ data portability: normalize pipeline + versioned export + trash-based reset");
		} else {
			console.error("✗ data portability wiring drifted");
			failed++;
		}
	}

	// long-text + compound fields: textareas use stackedTextArea, compound
	// controls (Model tab dropdown+input, fallback rows) use stackedControl —
	// all inside their setting-item; control-column textareas are banned
	{
		const fs = require("fs");
		const st = fs.readFileSync(path.join(__dirname, "..", "src", "settingsTab.ts"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		if (
			st.includes('"Custom system prompt"') &&
			st.includes("function stackedTextArea(") &&
			st.includes("function stackedControl(") &&
			/* v0.1.182 amended: row variant added for provider+model pairs */
			st.includes("stackedControl(pickSetting, { row: true })") &&
			!st.includes("addTextArea(") &&
			css.includes(".oa-settings .setting-item.oa-has-stacked textarea") &&
			css.includes(".oa-stacked-control select.dropdown") &&
			!css.includes(".oa-snippet-modal-text") // retired control-column hack
		) {
			console.log("✓ stacked fields: long-text + compound controls inside setting-items (helpers enforced)");
		} else {
			console.error("✗ stacked-field layout drifted (addTextArea or control-column stacking crept back?)");
			failed++;
		}
	}

	// composer buttons: send = attach size (26×26), arrow-up icon, accent fill
	// whose icon flips black/white by accent luminance (text-on-accent fallback)
	{
		const fs = require("fs");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const chat = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		const actionBlock = css.match(/\.oa-app \.oa-prompt-action \{[^}]+\}/)?.[0] ?? "";
		const primaryBlock = css.match(/\.oa-app \.oa-prompt-action\.oa-prompt-action-primary \{[^}]+\}/)?.[0] ?? "";
		const primaryHover = css.match(/\.oa-app \.oa-prompt-action\.oa-prompt-action-primary:hover:not\(:disabled\) \{[^}]+\}/)?.[0] ?? "";
		const primaryDisabled = css.match(/\.oa-app \.oa-prompt-action\.oa-prompt-action-primary:disabled \{[^}]+\}/)?.[0] ?? "";
		if (
			actionBlock.includes("width: 26px") &&
			actionBlock.includes("height: 26px") &&
			css.includes(".oa-app .oa-attach-toggle") &&
			chat.includes("<ArrowUpIcon size={16} />") &&
			primaryBlock.includes("var(--interactive-accent)") &&
			primaryBlock.includes("var(--text-on-accent)") &&
			css.includes("oklch(from var(--interactive-accent)") &&
			// 2026-08-02 owner report: hover must KEEP the accent (subtle dim),
			// never re-hue to --interactive-accent-hover (it washed the fill
			// out so the rest-tuned icon vanished)
			primaryHover.includes("background: var(--interactive-accent);") &&
			primaryHover.includes("filter: brightness(") &&
			// match the DECLARATION only — comments may freely name the old var
			!/background:\s*var\(--interactive-accent-hover\)/.test(primaryHover) &&
			// 2026-08-02 v0.1.38 owner report "masih sama saat textarea kosong":
			// the generic `.oa-app button:hover` reset (0,2,1) beat the old
			// single-class base (0,2,0) and punched the DISABLED Send
			// transparent — the select chain is double-class (0,3,x) now, and
			// the disabled face is the official Hermes neutral: fg/30 disc,
			// knocked-out icon, opacity 1, hover inert
			primaryDisabled.includes("opacity: 1") &&
			primaryDisabled.includes("pointer-events: none") &&
			css.includes("color-mix(in srgb, var(--text-normal) 30%")
		) {
			console.log("✓ composer: send 26×26, arrow-up, accent hover dim, disabled = official neutral (fg/30, inert hover)");
		} else {
			console.error("✗ composer send-button spec drifted");
			failed++;
		}
	}

	// attach feature guard: [+] menu + snippets + @ refs + vision path stay wired
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const chat = read("../src/ui/ChatApp.tsx");
		const tab = read("../src/settingsTab.ts");
		const css = read("../styles.css");
		const shim = read("real-preview/obsidian-shim.ts");
		const chatOk =
			chat.includes("oa-attach-anchor") &&
			chat.includes("AttachMenu") &&
			chat.includes("handleComposerKeys") &&
			chat.includes("extractAtRefs") &&
			chat.includes("modelSupportsVision") &&
			!chat.includes("SUGGESTIONS"); // home suggestions moved to settings snippets
		const tabOk = tab.includes("Prompt snippets") && tab.includes("SnippetEditModal");
		const cssOk = css.includes(".oa-attach-menu") && css.includes(".oa-kbd");
		const shimOk = ["file", "folder", "image", "message-square-text", "arrow-left", "at-sign"].every((n) =>
			shim.includes(`${n}:`) || shim.includes(`"${n}":`)
		);
		const browseOk =
			read("../src/ui/attach/attach-menu.tsx").includes("useFileUploadBrowse") &&
			!chat.includes("const browseDisk = useFileUploadBrowse()"); // disk browse must live INSIDE <FileUpload>
		if (chatOk && tabOk && cssOk && shimOk && browseOk) {
			console.log("✓ attach feature wired ([+] menu · snippets · @ refs · vision · shim icons · browse)");
		} else {
			console.error(`✗ attach feature drifted (chat:${chatOk} tab:${tabOk} css:${cssOk} shim:${shimOk} browse:${browseOk})`);
			failed++;
		}
	}

	// build-stamp guard: the settings header + load log must keep showing the
	// baked build time (stale-plugin detection after every file swap)
	{
		const fs = require("fs");
		const cfg = fs.readFileSync(path.join(__dirname, "..", "esbuild.config.mjs"), "utf8");
		const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
		const tab = fs.readFileSync(path.join(__dirname, "..", "src", "settingsTab.ts"), "utf8");
		if (
			cfg.includes("__OA_BUILD_STAMP__") &&
			fs.existsSync(path.join(__dirname, "..", "src", "buildInfo.ts")) &&
			main.includes("console.info") &&
			/20\d\d-\d\d-\d\d \d\d:\d\dZ/.test(main) &&
			tab.includes("BUILD_STAMP")
		) {
			console.log("✓ build stamp baked into bundle + shown in settings header");
		} else {
			console.error("✗ build-stamp wiring drifted");
			failed++;
		}
	}

	// finish-reason surfacing + cache-friendly Date: the loop threads
	// finishReason into the run result, the chat marks "length" cut-offs,
	// and the system-prompt Date is hour-rounded (KV-cache friendly)
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const loop = read("../src/agent/agentLoop.ts");
		const chat = read("../src/ui/ChatApp.tsx");
		const sp = read("../src/agent/systemPrompt.ts");
		const ok =
			loop.includes("finishReason") &&
			chat.includes("finish_reason: length") &&
			sp.includes("setMinutes(0, 0, 0)");
		if (ok) {
			console.log("✓ finish_reason surfaced to chat + system-prompt Date hour-rounded (prompt cache)");
		} else {
			console.error("✗ finish_reason / cache-friendly-Date wiring drifted");
			failed++;
		}
	}

	// live tool preview: streamed tool-call deltas must surface as "pending"
	// step items, inter-iteration prompt processing must be indicated, and
	// dangling previews must be stripped before persisting
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const prov = read("../src/agent/providers.ts");
		const loop = read("../src/agent/agentLoop.ts");
		const chat = read("../src/ui/ChatApp.tsx");
		const css = read("../styles.css");
		const ok =
			prov.includes("cb.onToolCall?.(existing.id") &&
			loop.includes("onToolCallPending") &&
			loop.includes("events.onIterationStart?.(iterations)") &&
			chat.includes('status: "pending" as const') &&
			chat.includes('setLiveStatus("Waiting for the model…")') &&
			chat.includes("stripPendingTools") &&
			/* v0.1.74: steps.tsx + its pending-icon CSS retired (dead surface);
		   the pending witness lives on in the asserted ChatApp/tool literals */
			css.includes(".oa-tool-badge-processing");
		if (ok) {
			console.log("✓ live tool preview: streamed tool calls surface as pending steps + iteration wait shown");
		} else {
			console.error("✗ live tool preview wiring drifted");
			failed++;
		}
	}

	// hermes-parity batch: deterministic tool-call ids (cache), /learn slash,
	// per-session composer drafts, full-text session search in the panel
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const prov = read("../src/agent/providers.ts");
		const chat = read("../src/ui/ChatApp.tsx");
		const panel = read("../src/ui/components/session-panel.tsx");
		const css = read("../styles.css");
		const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
		const ok =
			prov.includes("export function deterministicToolCallId(") &&
			prov.includes("deterministicToolCallId(messages.length, idx") &&
			prov.includes("deterministicToolCallId(messages.length, i") &&
			!prov.includes("call_${idx}_${Date.now()}") &&
			chat.includes('name: "/learn"') &&
			chat.includes('case "/learn"') &&
			chat.includes("create_skill") &&
			chat.includes("composerDrafts") &&
			chat.includes("panelHits") &&
			chat.includes("scopedSessions.search(") &&
			chat.includes("<SessionPanel") &&
			panel.includes("oa-panel-row-excerpt") &&
			css.includes(".oa-panel-row-excerpt") &&
			/* v0.1.128 amended: pin identifier `deterministicToolCallId` di
			   bundle dilepas — minify merename; prov sudah meminnya 3× dari
			   src. Yang bertahan di bundle hanyalah literal "/learn". */
			main.includes("/learn");
		if (ok) {
			console.log("✓ hermes parity: deterministic tool ids · /learn · composer drafts · full-text session search");
		} else {
			console.error("✗ hermes-parity batch wiring drifted");
			failed++;
		}
	}

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
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const tool = read("../src/ui/components/tool.tsx");
		const chat = read("../src/ui/ChatApp.tsx");
		const css = read("../styles.css");
		const ok =
			tool.includes('"input-streaming"') &&
			tool.includes('"input-available"') &&
			tool.includes('"output-available"') &&
			tool.includes('"output-error"') &&
			tool.includes("Processing") &&
			tool.includes("Call ID: ") &&
			tool.includes("export function Tool(") &&
			chat.includes('from "./components/tool"') &&
			!chat.includes('from "./components/steps"') &&
			chat.includes("oa-tools-list") &&
			chat.includes("toToolPart(") &&
			css.includes(".oa-tools-list") &&
			css.includes(".oa-tool-badge-processing");
		if (ok) {
			console.log("✓ tool calls: faithful prompt-kit Tool cards (v5 states, per-invocation)");
		} else {
			console.error("✗ tool-card fidelity drifted (Steps crept back into tool rendering?)");
			failed++;
		}
	}

	// remaining prompt-kit components aligned to the official surface:
	// PromptInput isLoading/maxHeight · FileUpload accept · CodeBlock
	// compound parts (CodeBlockGroup/CodeBlockCode) · Message live exports
	// · TextShimmer faithful defaults (as/duration 4/
	// spread 20) · Loader full 12 variants + sizes
	// (2026-08-02 v0.1.39: MessageAvatar retired with all turn avatars —
	// official Hermes renders none; dead component + CSS removed)
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const pi = read("../src/ui/components/prompt-input.tsx");
		const fu = read("../src/ui/components/file-upload.tsx");
		const cb = read("../src/ui/components/code-block.tsx");
		const msg = read("../src/ui/components/message.tsx");
		const ts = read("../src/ui/components/text-shimmer.tsx");
		const loader = read("../src/ui/components/loader.tsx");
		const css = read("../styles.css");
		const variants = [
			"circular", "classic", "pulse", "pulse-dot", "dots", "typing",
			"wave", "bars", "terminal", "text-blink", "text-shimmer", "loading-dots",
		];
		const ok =
			pi.includes("isLoading?: boolean") &&
			pi.includes("maxHeight?: number | string") &&
			pi.includes("aria-busy") &&
			pi.includes("is-loading") &&
			fu.includes("export function acceptOk(") &&
			fu.includes("accept={accept}") &&
			fu.includes("type not accepted") &&
			cb.includes("export function CodeBlockGroup(") &&
			cb.includes("export function CodeBlockCode(") &&
			cb.includes("data-language") &&
			/* v0.1.74: MessageContent export retired (dead surface — callers use
			   MarkdownDoc directly); live exports pinned instead */
			msg.includes("export function Message({") &&
			msg.includes("export function MessageActions(") &&
			ts.includes("duration = 4") &&
			ts.includes("spread = 20") &&
			ts.includes('as?: "span" | "p" | "div"') &&
			ts.includes("--shimmer-spread") &&
			variants.every((v) => loader.includes(`"${v}"`) || loader.includes(`case "${v}"`)) &&
			loader.includes("oa-loader-${size}") &&
			css.includes(".oa-loader-pulse-dot-core") &&
			css.includes(".oa-loader-bars span") &&
			css.includes(".oa-loader-terminal-block") &&
			css.includes(".oa-loader-text-blink") &&
			css.includes(".oa-loader-loading-dot") &&
			css.includes(".oa-loader-classic") &&
			css.includes(".oa-loader-dots span") &&
			css.includes(".oa-loader-lg") &&
			css.includes("var(--shimmer-spread, 20%)");
		if (ok) {
			console.log(
				"✓ prompt-kit palette aligned: PromptInput isLoading/maxHeight · FileUpload accept · CodeBlock parts · Message markdown · TextShimmer defaults · Loader 12 variants+sizes"
			);
		} else {
			console.error("✗ prompt-kit palette alignment drifted");
			failed++;
		}
	}

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
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const mpp = read("../src/ui/markdown-preprocess.ts");
		const md = read("../src/ui/components/markdown.tsx");
		const tool = read("../src/ui/components/tool.tsx");
		const chat = read("../src/ui/ChatApp.tsx");
		const icons = read("../src/ui/icons.tsx");
		const css = read("../styles.css");
		const ok =
			mpp.includes("export function preprocessAIResponse(") &&
			mpp.includes("export function resolveVaultImages(") &&
			mpp.includes("dataviewjs") &&
			md.includes("preprocessAIResponse(") &&
			md.includes("resolveVaultImages(") &&
			tool.includes("MAX_DISPLAY_CHARS") &&
			tool.includes("preserved in history") &&
			chat.includes("insertIntoNote") &&
			chat.includes("editAndResend") &&
			chat.includes("oa-msg-editbox") &&
			chat.includes("Insert at cursor") &&
			chat.includes("Regenerate") &&
			icons.includes('"text-cursor-input"') &&
			icons.includes('"pencil"') &&
			css.includes(".oa-msg-editbox") &&
			css.includes(".oa-tool-cap-note") &&
			css.includes(".oa-msg-user .oa-msg-actions");
		if (ok) {
			console.log(
				"✓ copilot parity: markdown preprocess (safety/LaTeX/vault images) · insert / edit+resend / regenerate · tool display cap"
			);
		} else {
			console.error("✗ copilot-parity wiring drifted");
			failed++;
		}
	}

	// regenerate honesty: runAgent must build withUser from turnsRef (flushed
	// synchronously by setTurnsSynced), never from the stale `turns` state
	// closure — /retry + edit-resend truncate turns first, and the closure
	// still holds the pre-truncation list → the whole conversation duplicates
	// (proven E2E: click Regenerate in the convo scenario asserted 2 user
	// bubbles before this fix, 1 after)
	{
		const fs = require("fs");
		const chat = fs.readFileSync(path.join(__dirname, "../src/ui/ChatApp.tsx"), "utf8");
		const rp = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			chat.includes("const withUser = [...turnsRef.current, userTurn];") &&
			!chat.includes("withUser = [...turns, userTurn]") &&
			rp.includes("regenerate duplicated or lost history") &&
			rp.includes("--with-deps");
		if (ok) {
			console.log("✓ regenerate honesty: withUser from turnsRef + E2E click guard + self-heal --with-deps");
		} else {
			console.error("✗ regenerate fix drifted (withUser back to stale state closure?)");
			failed++;
		}
	}

	// quote parity with Obsidian (owner directive 2026-07-21): the chat
	// blockquote rule must NOT re-declare border / text color / background —
	// those come from Obsidian's own ".markdown-rendered blockquote" rule
	// (markdown.tsx adds the `markdown-rendered` class), so the bar is the
	// theme accent (--blockquote-border-color → --interactive-accent).
	// Regression guarded: a gray `border-left: var(--background-modifier-border)`
	// override had painted over the official accent bar.
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const css = read("../styles.css");
		const ref = read("reference-obsidian-app.css");
		const md = read("../src/ui/components/markdown.tsx");
		const rule = css.match(/\.oa-app \.oa-markdown blockquote \{[\s\S]*?\}/);
		const rp = read("real-preview/build.mjs");
		const bp = read("build-preview.mjs");
		const ext = read("extract-obsidian-sim.mjs");
		const sim = read("obsidian-sim.css");
		const ok =
			rule !== null &&
			!/border|color|background/.test(rule[0]) &&
			rule[0].includes("margin-block") &&
			md.includes('addClass("markdown-rendered")') &&
			ref.includes("--blockquote-border-color: var(--interactive-accent);") &&
			ref.includes("var(--blockquote-border-thickness) solid var(--blockquote-border-color)") &&
			// harness fidelity: theme class on <body> (as in the real app — vars
			// chain via body-scoped --accent-h), blockquote rule whitelisted in
			// the extractor and present in the regenerated subset
			rp.includes('<body class="theme-dark">') &&
			!rp.includes('<html class="theme-dark">') &&
			!bp.includes('<html class="theme-dark">') &&
			ext.includes("markdown-rendered\\s+blockquote") &&
			sim.includes(".markdown-rendered blockquote {") &&
			sim.includes("var(--blockquote-border-thickness) solid var(--blockquote-border-color)");
		if (ok) {
			console.log("✓ quote parity: chat blockquote inherits Obsidian accent bar (no gray override) · harness mirrors app (theme on body, sim blockquote rule)");
		} else {
			console.error("✗ quote parity / harness fidelity drifted (gray override back, theme class moved, or sim blockquote rule lost)");
			failed++;
		}
	}

	// disk-attach usability (owner report 2026-07-21): the 256 KB cap +
	// text-only policy silently rejected every real-world disk file the owner
	// picked — dialog worked, but nothing ever attached. Guards: text cap is
	// 1 MB · disk images ride the vision path · rejection notices carry the
	// measured size · the E2E covers image chip + both rejection branches.
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const fu = read("../src/ui/components/file-upload.tsx");
		const chat = read("../src/ui/ChatApp.tsx");
		const rp = read("real-preview/build.mjs");
		const entry = read("attach-entry.ts");
		const pdf = read("../src/ui/attach/pdf.ts");
		const manifest = read("../manifest.json");
		const types = read("../src/types.ts");
		const bpm = read("build-preview.mjs");
		const css = read("../styles.css");
		const ok =
			fu.includes("export const MAX_TEXT_BYTES = 1024 * 1024") &&
			fu.includes("export function isImageLike(") &&
			fu.includes("IMAGE_ATTACH_MAX_BYTES") &&
			fu.includes("readAsDataUrl") &&
			fu.includes("over the 1 MB text-file limit") &&
			fu.includes("unsupported type — attach text/code files, images, or PDF") &&
			fu.includes("over the 5 MB image limit") &&
			fu.includes("isPdfLike(file.name, file.type)") &&
			chat.includes("text/PDF up to 1 MB") &&
			pdf.includes("extractPdfText") &&
			/* v0.1.130 amended: jalur worker inline lumat → worker eksternal via vendor
			   file + blob URL; konfigurasi sekarang lewat ensureSharedWorker (blok
			   v0.1.130 di bawah mem-pin jalur barunya secara ketat) */
			pdf.includes("ensureSharedWorker") &&
			pdf.includes("PDF_ATTACH_MAX_PAGES = 50") &&
			rp.includes("local text extraction") &&
			rp.includes("makeTinyPdf") &&
			entry.includes("isImageLike") &&
			entry.includes("isPdfLike") &&
			manifest.includes('"version": "0.1.151"') &&
			/* sent-message attachment block (owner ask 2026-07-22): metadata
			   persisted on the user turn, chips rendered in the bubble, E2E
			   proves the block survives Send */
			types.includes("attachments?: {") &&
			chat.includes("turn.attachments") &&
			chat.includes("sentAttachments") &&
			css.includes(".oa-app .oa-msg-attach {") &&
			rp.includes("attachsent") &&
			bpm.includes("attachsent");
		if (ok) {
			console.log("✓ disk attach: 1 MB text cap · images via vision · PDF local extraction · measured rejections · version bumped (user-verifiable build)");
		} else {
			console.error("✗ disk-attach wiring drifted (cap lowered, vision/pdf path lost, notices dumbed down, version not bumped)");
			failed++;
		}
	}

	{
		// settings-audit S1 guard (2026-07-23): the custom-model-id field must
		// commit on Enter/blur only — per-keystroke commits re-rendered the
		// whole tab (focus lost after char 1) and polluted favoriteModels with
		// half-typed ids ("g", "gp", …).
		const fs = require("fs");
		const stab = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		if (
			stab.includes("commitCustomModel") &&
			stab.includes('customModel.inputEl.addEventListener("keydown"') &&
			!stab.includes('TextComponent(modelCtl).setPlaceholder("custom model id").onChange(')
		) {
			console.log("✓ settings S1: custom model id commits on Enter/blur (no per-keystroke re-render)");
		} else {
			console.error("✗ settings S1 regressed: custom-model field re-renders per keystroke");
			failed++;
		}
	}

	{
		// settings-audit S2 guard (2026-07-23): provider disclosure heads must
		// be real <button>s with aria-expanded (keyboard + SR), and profile
		// icon buttons must carry aria-label — not title-only.
		const fs = require("fs");
		const stab = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		if (
			stab.includes('cls: `oa-provider-group-label oa-disclosure') &&
			stab.includes('aria-expanded": open ? "true" : "false"') &&
			stab.includes('aria-expanded": this.providersAdvancedOpen') &&
			stab.includes('"aria-label": `Edit profile') &&
			stab.includes('"aria-label": `Clone profile') &&
			stab.includes('"aria-label": `Delete profile') &&
			css.includes(".oa-settings button.oa-provider-group-label {")
		) {
			console.log("✓ settings S2: disclosures are keyboard buttons · profile icon buttons have accessible names");
		} else {
			console.error("✗ settings S2 regressed: disclosure buttons or profile aria-labels lost");
			failed++;
		}
	}

	{
		// settings-audit S3 guard (2026-07-23): five polish fixes —
		// S3-4 the tab strip is keyboard-driven (arrow keys + roving tabindex),
		// S3-5 the test-result line sits below its row and hides while empty,
		// S3-6 the build-stamp tooltip is English (UI-strings contract),
		// S3-7 the mcp.json import label precedes its textarea,
		// S3-8 the clone action lives on its own row (uncramped name field).
		const fs = require("fs");
		const stab = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		if (
			stab.includes('nav.addEventListener("keydown"') &&
			stab.includes('"ArrowRight"') &&
			stab.includes("el.tabIndex = on ? 0 : -1") &&
			stab.includes("proves which build is running after file swaps") &&
			!stab.includes("dipakai untuk memastikan") &&
			stab.indexOf('.setName("Test connection")') > -1 &&
			stab.indexOf('.setName("Test connection")') < stab.indexOf('cls: "oa-test-result"') &&
			stab.indexOf('.setName("Import mcp.json")') > -1 &&
			stab.indexOf('.setName("Import mcp.json")') < stab.indexOf('cls: "oa-mcp-import-text"') &&
			stab.includes('setButtonText("Clone active profile")') &&
			css.includes(".oa-settings .oa-test-result:empty")
		) {
			console.log("✓ settings S3: arrow-key tabs · result below row & hidden when empty · English tooltip · import label above field · clone on own row");
		} else {
			console.error("✗ settings S3 regressed: one of the five polish fixes was lost");
			failed++;
		}
	}

	{
		// settings tools UI (owner directive 2026-07-23): Hermes semantics —
		// the five toolset switches are the ONLY tool controls. The per-tool
		// layer (disabledTools schema field, per-tool toggle rows, per-tool
		// CSS) was removed; a legacy key in old data.json is purged on load.
		const fs = require("fs");
		const stab = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const tools = fs.readFileSync(path.join(__dirname, "../src/agent/tools.ts"), "utf8");
		const setts = fs.readFileSync(path.join(__dirname, "../src/settings.ts"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		if (
			!stab.includes("oa-tool-group") &&
			!stab.includes("ALL_TOOLS") &&
			!tools.includes("settings.disabledTools") &&
			!setts.includes("disabledTools: string[]") &&
			!setts.includes("s.disabledTools =") &&
			!css.includes(".oa-settings .oa-tool-group") &&
			stab.includes("One switch per toolset.") && // copy refreshed 2026-07-25 (owner decisions C9/K1)
			setts.includes("delete (s as unknown as Record<string, unknown>).disabledTools")
		) {
			console.log("✓ settings tools: Hermes semantics — toolset switches only, per-tool layer removed & legacy key purged");
		} else {
			console.error("✗ settings tools drifted: per-tool layer crept back in (rows, schema, resolver or CSS)");
			failed++;
		}
	}

	{
		// settings copy band (owner-approved 2026-07-25, C1–C16 + K1 "trim
		// decorative Hermes references"): guards the refreshed descriptions
		// against drift; lesson 20 — flip these strings when copy changes again
		const stabC = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const ok =
			stabC.includes("Thinking budget — sent to providers that support it, ignored elsewhere.") &&
			stabC.includes("Named identities: persona + optional provider/model pin") &&
			stabC.includes("Resets to Off each time you open this tab.") &&
			stabC.includes("Applied to every provider request, chat and model-listing alike.") &&
			/* v0.1.181 amended: New profile desc shortened (layout P2) */
			stabC.includes("Blank = fresh persona. Clone = copies the active profile's persona and pins.") &&
			stabC.includes("Bundled source: kepano's Obsidian skills. Search, preview + security-scan, then one-click install") &&
			!stabC.includes("Hermes-style identities") &&
			!stabC.includes("effort ladder") &&
			!stabC.includes("profiles/souls") &&
			!stabC.includes("persist knowledge") &&
			!stabC.includes("agentskills.io SKILL.md files") &&
			!stabC.includes("Config only for now") &&
			!stabC.includes("turn in progress switches") &&
			stabC.includes("(Hermes --yolo)"); // kept on purpose (K1) — explains the "yolo" mode name
		if (ok) {
			console.log("✓ settings copy: owner-approved C1–C16 band present, decorative Hermes refs trimmed (--yolo kept)");
		} else {
			console.error("✗ settings copy: C1–C16 band drifted (new string missing or trimmed Hermes ref back)");
			failed++;
		}
	}

	{
		// hub chip × (owner 2026-07-23): the real app styles every bare button
		// with input-height and — via button:not(.clickable-icon), which beats
		// our single-class rule — a background + shadow, inflating community
		// tap chips into gray pills. The chip-scoped override must exist.
		const fs = require("fs");
		const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		if (css.includes(".oa-settings .oa-hub-chip .oa-hub-chip-x")) {
			console.log("✓ hub chip ×: app button-reset overridden — community tap chips stay chip-sized");
		} else {
			console.error("✗ hub chip ×: app button-reset override missing (community chips inflate)");
			failed++;
		}
	}

	{
		// hub search box doubles as the add-tap input (owner 2026-07-23,
		// Hermes desktop parity): repo-shaped text shows an add hint, Enter
		// adds the tap, and the just-added tap is loaded immediately — the
		// hubLoaded reset is load-bearing (hubEnsureLoaded(false) early-
		// returns after the first pass). The standalone "Add GitHub tap" row
		// must stay gone.
		const fs = require("fs");
		const stab = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		if (
			stab.includes("hubTapCandidate") &&
			stab.includes('cls: "oa-hub-tap-hint-btn"') &&
			stab.includes("this.hubLoaded = false;") &&
			stab.includes("Search skills, or paste a repo") &&
			!stab.includes('.setName("Add GitHub tap")') &&
			css.includes(".oa-settings .oa-hub-tap-hint")
		) {
			console.log("✓ hub search: one box — search + add-tap hint (Enter adds & loads instantly), standalone row removed");
		} else {
			console.error("✗ hub search merged-input regressed: hint flow, instant-load or row removal lost");
			failed++;
		}
	}

	{
		// hub default tap (owner directive 2026-07-23): the bundled source is
		// kepano/obsidian-skills (skills/ subtree) ONLY — the five Hermes
		// taps were removed. Stays single-tap; customs come via the search box.
		const fs = require("fs");
		const hub = fs.readFileSync(path.join(__dirname, "../src/agent/hub.ts"), "utf8");
		if (
			hub.includes('repo: "kepano/obsidian-skills/skills"') &&
			!hub.includes('repo: "openai/skills"') &&
			!hub.includes('repo: "vercel-labs/agent-skills"') &&
			(hub.match(/trust: "trusted"/g) ?? []).length === 1
		) {
			console.log("✓ hub default tap: kepano/obsidian-skills (skills/) only — Hermes taps removed");
		} else {
			console.error("✗ hub default tap drifted: kepano tap missing or Hermes taps crept back in");
			failed++;
		}

		// owner directive 2026-07-25: dead tap catalogs must be pruned (load × remove)
		const mn = fs.readFileSync(path.join(__dirname, "../src/main.ts"), "utf8");
		const stab = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		if (
			hub.includes("export function pruneHubCache") &&
			hub.includes("export function allHubTaps") &&
			mn.includes("pruneHubCache(this.settings.hubCache") &&
			stab.includes("pruneHubCache(this.plugin.settings.hubCache")
		) {
			console.log("✓ hub cache: stale tap catalogs pruned on load and on tap removal");
		} else {
			console.error("✗ hub cache: pruneHubCache/allHubTaps missing or call sites dropped");
			failed++;
		}
	}

	{
		// Providers IA: this tab configures connections only. Inspecting a row
		// must never activate it; the provider + model pair is chosen atomically
		// in Model (or overridden by a profile pin).
		const stab3 = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const css3 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const providerMethod = stab3.slice(stab3.indexOf("\tprivate providers("), stab3.indexOf("\tprivate setTestResult("));
		if (
			providerMethod.includes("providerEditingId") &&
			providerMethod.includes('"Provider connections"') &&
			providerMethod.includes('"Provider used by chat"') &&
			providerMethod.includes('"Choose provider & model"') &&
			providerMethod.includes('"aria-pressed"') &&
			providerMethod.includes("is-viewed") &&
			!providerMethod.includes('setButtonText("Set active")') &&
			!providerMethod.includes("activateProviderCatalog(") &&
			!providerMethod.includes("s.activeProviderId =") &&
			css3.includes(".oa-provider-list button.oa-provider-row.is-viewed")
		) {
			console.log("✓ providers: connection setup is explicit; row selection only opens the editor; chat routing stays in Model/Profiles");
		} else {
			console.error("✗ providers: configuration vs chat-routing separation drifted");
			failed++;
		}
	}

	{
		// per-provider model catalogs (owner goal/report 2026-07-30, Hermes
		// Desktop parity): the pre-v0.1.14 GLOBAL flat favoriteModels list let
		// "Test & fetch" on a NON-active provider overwrite the active
		// provider's catalog AND silently reset the chat model — the lesson-22
		// trap class one level down. Catalogs now live ON each provider
		// (ProviderConfig.models); test-fetch writes only the viewed provider;
		// activation heals the (provider, model) pair; fallback rows list
		// THEIR provider's catalog; the legacy list migrates onto the active
		// provider exactly once (never overwriting data).
		const setts4 = fs.readFileSync(path.join(__dirname, "../src/settings.ts"), "utf8");
		const stab4 = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const app4 = fs.readFileSync(path.join(__dirname, "../src/ui/ChatApp.tsx"), "utf8");
		const mc = fs.readFileSync(path.join(__dirname, "../src/agent/modelCatalog.ts"), "utf8");
		if (
			setts4.includes("models: string[];") && // ProviderConfig catalog field
			setts4.includes("migrateLegacyFavoriteModels") &&
			mc.includes("healModelAgainstCatalog") && // empty catalog never clobbers
			stab4.includes("applyFetchedModels(s, viewed.id, models)") && // discovery writes the VIEWED provider only
			stab4.includes("activateProviderCatalog(s, prov)") && // Model-tab Apply keeps a valid provider/model pair
			stab4.includes("const rowCatalog = catalogOf(") && // fallback rows: own provider's catalog
			stab4.includes('entry.model = "";') && // provider change resets the row's model (official)
			app4.includes("catalogOf(getActiveProvider(settings))") && // chat picker: active provider's catalog
			!stab4.includes("favoriteModels") && // the global drawer is gone from the settings UI
			!app4.includes("favoriteModels") // …and from the chat UI (settings.ts keeps only the migration path)
		) {
			console.log("✓ model catalogs: per-provider, test heals only the active provider, fallbacks per-row, legacy migrated");
		} else {
			console.error("✗ model catalogs drifted (global flat list back, test clobbers non-viewed state, or rows lost per-provider options)");
			failed++;
		}
	}

	{
		// settings info-architecture (owner directive 2026-07-30, Hermes Desktop
		// parity — official constants.ts SECTIONS literally has id 'chat' label
		// 'Chat' and id 'memory' label 'Memory & Context'): tab 'Agent' renamed
		// to 'Chat', tab 'Memory' to 'Memory & Context', and the context knobs
		// (Context file + Attach active note by default) live under the latter.
		// Notifications v0.1.142: Workspace/Safety remain actionable,
		// Notifications returns with real controls in the shared tab/search
		// registry, while still-empty Appearance/About remain hidden.
		const stab5 = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const memSection = stab5.slice(stab5.indexOf("private memory("), stab5.indexOf("private automations("));
		const genSection = stab5.slice(stab5.indexOf("private general("), stab5.indexOf("private providers("));
		const agentSection = stab5.slice(stab5.indexOf("private agent("), stab5.indexOf("private profiles("));
		const workspaceSection = stab5.slice(stab5.indexOf("private workspace("), stab5.indexOf("private safety("));
		const safetySection = stab5.slice(stab5.indexOf("private safety("), stab5.indexOf("private general("));
		if (
			stab5.includes('key: "agent", label: "Chat"') &&
			stab5.includes('label: "Memory & Context"') &&
			!stab5.includes('label: "Agent",') &&
			!stab5.includes('label: "Memory",') &&
			memSection.includes("Context file") &&
			memSection.includes("Attach active note by default") &&
			!genSection.includes("Attach active note by default") &&
			!agentSection.includes("Context file") &&
			!stab5.includes('label: "Sessions",') && // 2026-08-03 (v0.1.64): Sessions tab merged into Chat
			agentSection.includes("Save sessions") &&
			agentSection.includes("Max sessions kept") &&
			// v0.1.126 amended: session rows masih LEAD Chat tapi approval sudah
			// pindah — pembandingnya kini baris non-sesi pertama di tab itu.
			// v0.1.151: "Max tool iterations" ikut pindah ke Advanced → anchor
			// non-sesi pertama di Chat kini "Personality" (v0.1.172: global).
			agentSection.indexOf("Save sessions") < agentSection.indexOf("Personality") &&
			!agentSection.includes("Max tool iterations") && // pindah ke private advanced()
			!agentSection.includes("Approval mode") && // pindah ke private safety()
			!agentSection.includes("Workspace folder") && // pindah ke private workspace()
			safetySection.includes("Approval mode") &&
			safetySection.includes("createSegmented") && // rail antd ikut pindah utuh
			workspaceSection.includes("Workspace folder") &&
			stab5.includes('key: "appearance", label: "Appearance"') &&
			stab5.includes('key: "notifications", label: "Notifications"') &&
			/* v0.1.190: About returns as an informational tab (was hidden-empty) */
			stab5.includes('key: "about", label: "About"') &&
			stab5.includes("private appearance(") &&
			stab5.includes("private notifications(") &&
			stab5.includes("Enable native notifications") &&
			stab5.includes("Completion sound preset") &&
			stab5.includes("private about(")
		) {
			console.log("✓ settings IA: Workspace/Safety remain; Appearance + actionable Notifications + informational About are present in tabs/search");
		} else {
			console.error("✗ settings IA drifted (tab labels reverted or context rows left Memory & Context)");
			failed++;
		}
	}

	{
		// Notifications v0.1.142 integration: positive source witnesses connect
		// chat terminal/attention events and cron outcomes to the hardened
		// dispatchers; Stop remains non-error and native sound is silenced only
		// after an app completion cue really plays.
		const notifications = fs.readFileSync(path.join(__dirname, "../src/notifications.ts"), "utf8");
		const sounds = fs.readFileSync(path.join(__dirname, "../src/completionSound.ts"), "utf8");
		const chat = fs.readFileSync(path.join(__dirname, "../src/ui/ChatApp.tsx"), "utf8");
		const main = fs.readFileSync(path.join(__dirname, "../src/main.ts"), "utf8");
		const settings = fs.readFileSync(path.join(__dirname, "../src/settings.ts"), "utf8");
		const ok =
			settings.includes("DEFAULT_NOTIFICATION_SETTINGS") &&
			settings.includes("nativeEnabled: false") &&
			settings.includes("completionSoundEnabled: false") &&
			notifications.includes("this.lastShownByKindContext.get(throttleKey)") &&
			notifications.includes("now - lastShownAt < 1000") &&
			notifications.includes("Ctor.permission === \"default\" ? await Ctor.requestPermission()") &&
			notifications.includes("} else if (!this.env.isAway()) {") &&
			notifications.includes('return "not-away"') &&
			notifications.includes("if (!this.env.isAway() && this.env.isChatVisible()) return \"chat-visible\"") &&
			notifications.includes('tag: `openagent:${event.kind}`') && // context only participates in internal throttle, never OS payload/tag
			sounds.includes("COMPLETION_SOUND_VARIANTS") &&
			sounds.includes("name: \"Two-note comfort\"") &&
			sounds.includes("async playCompletion(contextId: string)") &&
			chat.includes('{ kind: "approvalRequired", contextId: runSessionId }') &&
			chat.includes('{ kind: "inputRequired", contextId: runSessionId }') &&
			chat.includes('{ kind: "turnDone", contextId: runSessionId }') &&
			chat.includes('{ kind: "turnError", contextId: runSessionId }') &&
			chat.includes("const goalContinued = await continueGoalRef.current({") &&
			chat.includes("if (!goalContinued && !abort.signal.aborted)") &&
			chat.includes("if (!abort.signal.aborted) {") &&
			main.includes('{ kind: "backgroundDone", contextId: task.id }') &&
			main.includes('{ kind: "backgroundError", contextId: task.id }') &&
			main.includes("if (!silent && task.notify)") &&
			main.includes('silent: result === "played"') &&
			main.includes("Platform.isDesktopApp") &&
			main.includes("window.focus()") &&
			main.includes("await this.activateView()");
		if (ok) {
			console.log("✓ Notifications integration: privacy-safe desktop gates, terminal chat lifecycle, cron policy, 14-cue audio, and no-double-sound are wired");
		} else {
			console.error("✗ Notifications v0.1.142 integration drifted");
			failed++;
		}
	}

	{
		// Package A: effective profile/chat route is visibly distinct from the
		// editable global default. A profile pin changes the CTA contract from
		// Apply to Save global default and links to Profiles; drafts still never
		// write until the explicit action.
		const stab6 = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		if (
			stab6.includes("modelPickProviderId") &&
			stab6.includes("modelPickModel") &&
			stab6.includes('this.modelPickModel = "";') && // provider change clears the model draft
			stab6.includes("const conn = resolveConnection(s);") &&
			stab6.includes('text: profileOverridesRoute ? "Profile override" : "Global default"') &&
			stab6.includes('text: "Manage profile pin"') &&
			stab6.includes('this.section = "profiles";') &&
			stab6.includes('.setName("Global default model")') &&
			stab6.includes('.setButtonText(profileOverridesRoute ? "Save global default" : "Apply")') &&
			stab6.includes('.setName("Custom global model id")') &&
			stab6.includes("The active profile pin continues to control this chat.") &&
			stab6.includes("activateProviderCatalog(s, prov);") &&
			stab6.includes("this.modelPickModel ?? s.model") && // action reads the LIVE draft, not a render-time snapshot
			stab6.includes("s.model = model;") &&
			stab6.includes("setDisabled(!pickProvider || !pickModel.trim())") &&
			stab6.includes("applyPick.setDisabled(!v.trim())") && // live enable on draft pick (no full re-render)
			!stab6.includes("modelDd.setValue(s.model).onChange(") // old per-keystroke auto-apply is gone
		) {
			console.log("✓ Model routing: effective profile route and editable global default are distinct; CTA contract is pin-aware");
		} else {
			console.error("✗ main-model pick drifted (auto-apply returned, or draft/apply wiring lost)");
			failed++;
		}
	}

	{
		// queue prompt (owner 2026-07-26, Hermes Desktop parity): the busy-block
		// Notice is replaced by enqueue; Stop parks; drain is edge-independent;
		// attachments ride the filesOverride, never composer's pendingFiles
		const pq = fs.readFileSync(path.join(__dirname, "../src/agent/promptQueue.ts"), "utf8");
		const app = fs.readFileSync(path.join(__dirname, "../src/ui/ChatApp.tsx"), "utf8");
		const setts2 = fs.readFileSync(path.join(__dirname, "../src/settings.ts"), "utf8");
		const mn2 = fs.readFileSync(path.join(__dirname, "../src/main.ts"), "utf8");
		const css2 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const pin = fs.readFileSync(path.join(__dirname, "../src/ui/components/prompt-input.tsx"), "utf8");
		const ok =
				pq.includes("shouldAutoDrain") &&
				pq.includes("serializeForPersist") &&
				pq.includes("export const queueTransactions = new SerializedQueueTransactions()") &&
				pq.includes("export function prepareQueueMutation") &&
				pq.includes("export async function afterSuccessfulQueueCommit") &&
				pq.includes("export function queueMutationTargetIsCurrent") &&
				pq.includes("export function prunePromptQueue") &&
				app.includes("haltAgent") &&
				app.includes("queueDrainingRef") &&
				app.includes("persistencePending: queueTransactions.pending") &&
				app.includes("void afterSuccessfulQueueCommit(") &&
			app.includes("enqueueEntry(sessionId") &&
			app.includes("oa-queue-row") &&
			app.includes("allowEmptySubmit={queue.length > 0}") &&
			app.includes("runAgent(entry.text, entry.attachments, entry.displayText)") && // v0.1.25: displayText rides; slash entries re-dispatch to runSlash
			!app.includes("press ■ or /stop to interrupt") && // the busy-block Notice is gone
			setts2.includes("sanitizePromptQueue") &&
			setts2.includes("promptQueue: {}") &&
			mn2.includes("prunePromptQueue") &&
			css2.includes(".oa-app .oa-queue-row") &&
			pin.includes("allowEmptySubmit");
		if (ok) {
			console.log("✓ queue prompt: enqueue-on-busy, park-on-stop, edge-independent drain, filesOverride, panel + guards");
		} else {
			console.error("✗ queue prompt: parity wiring drifted (store/ChatApp/schema/main/CSS/input)");
			failed++;
		}
	}

	// ---- v0.1.17 — context compression & title generation (Hermes Desktop
	// aux task slots parity). Engine is obsidian-free (contextManager.ts) and
	// runs PRE-LOOP in ChatApp; agentLoop must stay clean of it.
	{
		const fs = require("fs");
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const cm = read("../src/agent/contextManager.ts");
		const chat = read("../src/ui/ChatApp.tsx");
		const setts = read("../src/settings.ts");
		const tab = read("../src/settingsTab.ts");
		const sess = read("../src/agent/sessions.ts");
		const loop = read("../src/agent/agentLoop.ts");
		const prov = read("../src/agent/providers.ts");
		const ok =
			setts.includes("modelContextLength") && setts.includes("compressionEnabled") &&
			setts.includes("compressionThreshold") && setts.includes("compressionProtectLastN") &&
			setts.includes("compressionTargetRatio") &&
			setts.includes("titleGenerationEnabled") && setts.includes("auxModels") &&
			setts.includes("sanitizeAuxModels") &&
			cm.includes("COMPRESSION_NOTE_PREFIX") && cm.includes("pickProtectedStart") &&
			cm.includes("resolveAuxTask") && cm.includes("applyCompressionCache") &&
			cm.includes("validCompressionCache") &&
			chat.includes("maybeCompressConversation") && chat.includes("maybeGenerateTitle") &&
			chat.includes("applyCompressionCache(messagesRef.current, compressionRef.current)") &&
			chat.includes("sessionTitleRef") && chat.includes("compressionRef") &&
			sess.includes("compression?: CompressionCache") &&
			prov.includes("fetchAdvertisedContextLength") && prov.includes("contextLength") &&
			tab.includes("auxModelRow") && tab.includes("Set to main") &&
			tab.includes("Context & compression") && tab.includes("Auxiliary models") &&
			!loop.includes("contextManager");
		if (ok) {
			console.log("✓ v0.1.17: compression engine + aux slots + title generation wired (engine pre-loop, loop stays clean)");
		} else {
			console.error("✗ v0.1.17 compression/title wiring drifted (knobs, engine, chat hooks, aux UI, or loop import)");
			failed++;
		}
	}

	// v0.1.147 (LM Studio latency): title generation off by default (one less
	// request per new session), the system-prompt tool list stays compact
	// (descriptions live in the function schemas, not duplicated in the
	// prompt), and the wire size is measurable under debugMode.
	{
		const setts = read("src/settings.ts");
		const sys = read("src/agent/systemPrompt.ts");
		const loop = read("src/agent/agentLoop.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			setts.includes("titleGenerationEnabled: false,") &&
			!sys.includes("): ${t.description}") &&
			sys.includes("- ${t.name} (${t.toolset}") &&
			loop.includes("wireTokens") &&
			tab.includes("Title generation") &&
			tab.includes("titleGenerationEnabled");
		if (ok) {
			console.log("✓ v0.1.147: title generation off by default · compact tool list (no duplicated descriptions) · wire-size log under debugMode");
		} else {
			console.error("✗ v0.1.147 local-model latency tuning drifted");
			failed++;
		}
	}

	// v0.1.147b (Hermes cron parity): monitor change-detection skips unchanged
	// runs, and scheduled prompts are security-scanned (invisible-unicode strip
	// + secret/exfil/injection findings) at create/update AND at runtime.
	{
		const cronSrc = read("src/agent/cron.ts");
		const mainSrc = read("src/main.ts");
		const toolsSrc = read("src/agent/tools.ts");
		const setts = read("src/settings.ts");
		const ok =
			cronSrc.includes("export function scanCronPrompt") &&
			cronSrc.includes("export function buildMonitorBlock") &&
			cronSrc.includes("export function cronHash") &&
			cronSrc.includes("stripInvisibleUnicode") &&
			mainSrc.includes("fetchCronMonitor") &&
			mainSrc.includes("writeCronNoChange") &&
			mainSrc.includes("monitorLastHash === hash") &&
			mainSrc.includes("scanCronPrompt(scopedTask.prompt)") &&
			toolsSrc.includes("monitor_url") &&
			setts.includes("monitorUrl?: string") &&
			setts.includes("monitorLastContent?: string");
		if (ok) {
			console.log("✓ v0.1.147b: cron monitor change-detection (skip unchanged) + prompt security scan (strip invisible · findings) wired end-to-end");
		} else {
			console.error("✗ v0.1.147b cron monitor/security parity drifted");
			failed++;
		}
	}

	// v0.1.147c (Hermes script/no_agent parity): scripts run from the protected
	// config dir, desktop-only, lazy Node, execFile with timeout/bounded output,
	// no_agent delivers verbatim without the LLM, and script+monitor are
	// mutually exclusive.
	{
		const scriptSrc = read("src/agent/cronScripts.ts");
		const mainSrc = read("src/main.ts");
		const setts = read("src/settings.ts");
		const ok =
			scriptSrc.includes("export function sanitizeScriptName") &&
			scriptSrc.includes("defaultCronScriptExecutor") &&
			scriptSrc.includes('req("child_process")') &&
			scriptSrc.includes("CRON_SCRIPT_TIMEOUT_MS") &&
			scriptSrc.includes("minimalEnv") &&
			mainSrc.includes("executeCronScript") &&
			mainSrc.includes("buildScriptContextBlock") &&
			mainSrc.includes("task.noAgent") &&
			mainSrc.includes("Scripts run only on the desktop app") &&
			setts.includes("script?: string;") &&
			setts.includes("noAgent?: boolean;");
		if (ok) {
			console.log("✓ v0.1.147c: cron script/no_agent watchdog — protected folder, lazy Node execFile, desktop-only, no_agent verbatim, script+monitor exclusive");
		} else {
			console.error("✗ v0.1.147c cron script/no_agent parity drifted");
			failed++;
		}
	}

	// v0.1.147d (schedule UX): the custom schedule is a guided builder (daily /
	// interval / weekly / monthly) plus an advanced raw fallback, and every raw
	// cron is described in words via describeCronExpr — no password-looking
	// "0 9 * * *" shown to the user without a human explanation.
	{
		const cronSrc = read("src/agent/cron.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			cronSrc.includes("export function describeCronExpr") &&
			cronSrc.includes("export function cronExprForInterval") &&
			cronSrc.includes("export function cronExprForWeekly") &&
			tab.includes('d.addOption("daily", "Every day")') &&
			tab.includes('d.addOption("raw", "Advanced (raw cron)') &&
			tab.includes("Means:") &&
			tab.includes("describeCronExpr(task.schedule.expr)");
		if (ok) {
			console.log("✓ v0.1.147d: human schedule builder + described cron (no password-looking expression)");
		} else {
			console.error("✗ v0.1.147d schedule builder/description drifted");
			failed++;
		}
	}

	// v0.1.147e (Hermes Safety parity): approval timeout, secret redaction on
	// model-visible tool output, and pre-edit checkpoints.
	{
		const setts = read("src/settings.ts");
		const loop = read("src/agent/agentLoop.ts");
		const tools = read("src/agent/tools.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const tab = read("src/settingsTab.ts");
		const red = read("src/agent/redact.ts");
		const ok =
			setts.includes("approvalTimeoutSec: number;") &&
			setts.includes("redactSecrets: boolean;") &&
			setts.includes("checkpointsEnabled: boolean;") &&
			loop.includes("redactSecretsInText(safeResult)") &&
			tools.includes("checkpointBeforeWrite(ctx, path)") &&
			chat.includes("approvalTimeoutSec") &&
			chat.includes("timed out after") &&
			tab.includes("Approval timeout") &&
			tab.includes("Redact secrets") &&
			tab.includes("Checkpoints") &&
			red.includes("redactSecretsInText");
		if (ok) {
			console.log("✓ v0.1.147e: safety parity — approval timeout (auto-deny), secret redaction on tool output, pre-edit checkpoints");
		} else {
			console.error("✗ v0.1.147e safety parity drifted");
			failed++;
		}
	}

	// v0.1.147f (Hermes web_search parity): pluggable backend with a free
	// DuckDuckGo default, parsers pure + transport injected, and the tool
	// registered in the web toolset + blocked in delegated children.
	{
		const ws = read("src/agent/webSearch.ts");
		const tools = read("src/agent/tools.ts");
		const setts = read("src/settings.ts");
		const del = read("src/agent/delegate.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			ws.includes("export function parseDdgHtml") &&
			ws.includes("export function resolveSearchBackend") &&
			ws.includes("export async function runWebSearch") &&
			ws.includes("decodeDdgRedirect") &&
			tools.includes('name: "web_search"') &&
			tools.includes("toolset: \"web\"") &&
			tools.includes("backendNeedsKey") &&
			setts.includes("interface WebSearchSettings") &&
			setts.includes("backend: \"ddgs\"") &&
			del.includes('"web_search"') &&
			tab.includes("webSearchSettings") &&
			tab.includes("DuckDuckGo (free)");
		if (ok) {
			console.log("✓ v0.1.147f: web_search parity — ddgs default + brave/tavily/searxng, pure parsers, registered in web toolset + delegate-blocked");
		} else {
			console.error("✗ v0.1.147f web_search parity drifted");
			failed++;
		}
	}

	// v0.1.147g (Hermes session_search parity): cross-session recall tool over
	// the existing SessionStore.search, gated by the memory toolset, injected
	// via a SessionSearchApi on the runner, blocked in delegated children.
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

	// v0.1.147h (MCP runtime): pure JSON-RPC client + lazy stdio transport +
	// McpRuntime (consent-gated, config-cached) + first-use consent mirroring
	// terminal, injected only on the owned interactive path.
	{
		const client = read("src/agent/mcp/client.ts");
		const stdio = read("src/agent/mcp/stdio.ts");
		const rt = read("src/agent/mcp/runtime.ts");
		const runner = read("src/agent/runner.ts");
		const main = read("src/main.ts");
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const consent = read("src/settings/modals/consent.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			client.includes("class McpClient") &&
			client.includes("tools/list") &&
			client.includes("tools/call") &&
			stdio.includes('req("child_process")') &&
			stdio.includes("class StdioTransport") &&
			rt.includes("class McpRuntime") &&
			rt.includes("mcp__${name}__${toolName}") &&
			rt.includes("consentVersion < 1") &&
			runner.includes("getToolsWithMcp") &&
			runner.includes("mcpApi?: McpApi") &&
			main.includes("new McpRuntime") &&
			main.includes("grantMcpConsent") &&
			main.includes("restorePersistedMcpConsent") &&
			setts.includes("interface McpConsent") &&
			setts.includes("restorePersistedMcpConsent") &&
			tab.includes("new McpConsentModal") && consent.includes("class McpConsentModal") &&
			chat.includes("getToolsWithMcp");
		if (ok) {
			console.log("✓ v0.1.147h: MCP runtime — pure client + lazy stdio + consent-gated runtime + first-use consent, interactive-path-only injection");
		} else {
			console.error("✗ v0.1.147h MCP runtime drifted");
			failed++;
		}
	}

	// v0.1.147i (MCP phases 4–5): Streamable HTTP transport (POST + session-id
	// echo + SSE/JSON parsing, injected requestUrl) + curated catalog with a
	// pinned git install (n8n) and an install flow (clone/bootstrap/checkout).
	{
		const http = read("src/agent/mcp/http.ts");
		const rt = read("src/agent/mcp/runtime.ts");
		const cat = read("src/agent/mcp/catalog.ts");
		const inst = read("src/agent/mcp/install.ts");
		const catalogModal = read("src/settings/modals/mcp-catalog.ts");
		const main = read("src/main.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			http.includes("class HttpTransport") &&
			http.includes("MCP_HTTP_ACCEPT") &&
			http.includes("parseSse") &&
			http.includes("mergeHttpHeaders") &&
			http.includes("isHttpUrl") &&
			http.includes("mcp-session-id") &&
			rt.includes("cfg.transport === \"http\"") &&
			rt.includes("new HttpTransport") &&
			rt.includes("requestUrl") &&
			cat.includes("MCP_CATALOG") &&
			cat.includes("7a9ae00795593aa1fdb4e61ecd640e8bfd0c3841") &&
			cat.includes("buildServerConfig") &&
			cat.includes("applyDefaultToolSelection") &&
			cat.includes("catalogEntryFor") &&
			inst.includes("runMcpGitInstall") &&
			inst.includes("defaultMcpExec") &&
			inst.includes("resolveMcpInstallDir") &&
			inst.includes("GIT_TERMINAL_PROMPT") &&
			inst.includes("MCP_INSTALL_FOLDER") &&
			main.includes("installMcpCatalogEntry") &&
			tab.includes("new McpCatalogModal") && catalogModal.includes("class McpCatalogModal") &&
			tab.includes("Install from catalog");
		if (ok) {
			console.log("✓ v0.1.147i: MCP HTTP transport + curated catalog install (pinned git + bootstrap)");
		} else {
			console.error("✗ v0.1.147i MCP HTTP transport / catalog drifted");
			failed++;
		}
	}

	// MCP catalog fixture observability: names only, never credential values.
	{
		const tab = read("src/settingsTab.ts");
		const catalogModal = read("src/settings/modals/mcp-catalog.ts");
		const ok = catalogModal.includes('form.dataset.envNames = entry.auth.env.map((spec) => spec.name).join(",")');
		if (ok) console.log("✓ MCP catalog exposes rendered env names without values for fixture diagnosis");
		else { console.error("✗ MCP catalog env-name observability drifted"); failed++; }
	}

	// MCP catalog security contract: secret fields stay password-only, install
	// failures recover the button, and success refreshes the owning Settings UI.
	{
		const tab = read("src/settingsTab.ts");
		const catalogModal = read("src/settings/modals/mcp-catalog.ts");
		const ok =
			catalogModal.includes('attr: { type: spec.secret ? "password" : "text", placeholder: spec.prompt }') &&
			catalogModal.includes('if (spec.secret) input.autocomplete = "off"') &&
			catalogModal.includes("installMcpCatalogEntry(entry.name, envValues)") &&
			catalogModal.includes("install.disabled = false") &&
			catalogModal.includes("this.onInstalled()") &&
			catalogModal.includes('text: installed ? "Reinstall" : "Install"');
		if (ok) console.log("✓ MCP catalog security contract: secret field, recoverable failure, refresh-on-success, reinstall state");
		else { console.error("✗ MCP catalog security contract drifted"); failed++; }
	}

	// v0.1.147j (blueprint catalog): curated, ready-made cron automations with
	// typed slots (time/enum/text/weekdays) + fillBlueprint validation. Honest
	// catalog: no phantom integrations (Gmail/Calendar/weather/inbox).
	{
		const bp = read("src/agent/cronBlueprints.ts");
		const tab = read("src/settingsTab.ts");
		const modal = read("src/settings/modals/blueprint-catalog.ts");
		const low = bp.toLowerCase();
		const ok =
			bp.includes("CRON_BLUEPRINTS") &&
			bp.includes("export function fillBlueprint") &&
			bp.includes("class BlueprintFillError") &&
			bp.includes("WEEKDAY_PRESETS") &&
			bp.includes("DAY_TO_DOW") &&
			bp.includes("resolveSchedule") &&
			bp.includes("formatTemplate") &&
			tab.includes("new BlueprintCatalogModal") && modal.includes("class BlueprintCatalogModal") &&
			tab.includes("Browse templates") &&
			!low.includes("gmail") &&
			!low.includes("calendar") &&
			!low.includes("weather") &&
			!low.includes("inbox") &&
			!low.includes("google-workspace");
		if (ok) {
			console.log("✓ v0.1.147j: blueprint catalog — typed slots + fill validation, no phantom integrations");
		} else {
			console.error("✗ v0.1.147j blueprint catalog drifted");
			failed++;
		}
	}

	// v0.1.148 (memory parity): add/replace/remove with substring matching,
	// char budgets enforced at write time, injection scan before injection,
	// drift guard, and shared threat patterns (single source of truth).
	{
		const mem = read("src/agent/memory.ts");
		const threat = read("src/agent/threatPatterns.ts");
		const tools = read("src/agent/tools.ts");
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const cron = read("src/agent/cron.ts");
		const ok =
			mem.includes("applyMemoryAdd") &&
			mem.includes("applyMemoryReplace") &&
			mem.includes("applyMemoryRemove") &&
			mem.includes("scanMemoryEntries") &&
			mem.includes("driftLines") &&
			mem.includes("selectWithinLimit") &&
			mem.includes("memoryCharLimit") &&
			mem.includes("userCharLimit") &&
			mem.includes("firstThreatMessage") &&
			threat.includes("export function firstThreatMessage") &&
			cron.includes('from "./threatPatterns"') &&
			tools.includes('action: { type: "string", description: "add (default), replace, or remove." }') &&
			tools.includes('"replace"') &&
			tools.includes('"remove"') &&
			setts.includes("memoryCharLimit: 4000") &&
			setts.includes("userCharLimit: 2500") &&
			tab.includes('setName("Memory Budget")') &&
			tab.includes('setName("Profile Budget")');
		if (ok) {
			console.log("✓ v0.1.148: memory parity — replace/remove + budgets + injection scan + drift guard, shared threat patterns");
		} else {
			console.error("✗ v0.1.148 memory parity drifted");
			failed++;
		}
	}

	// v0.1.149 → v0.1.172 (owner: "di pengaturan profile, merujuk Hermes
	// Desktop, personality tidak ada"): SOUL is the ONLY identity a profile
	// carries — the personality overlay became a GLOBAL Chat setting (Hermes
	// display.personality parity), never a per-profile field. The SOUL editor
	// stays in the profile form; no personality dropdown may remain there.
	{
		const prof = read("src/agent/profiles.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			prof.includes("resolveIdentity(s: OpenAgentSettings)") &&
			prof.includes("soul ? soul : DEFAULT_IDENTITY") &&
			prof.includes("export function overlayText") &&
			prof.includes("isOverlayKey(key) ? PERSONALITY_OVERLAYS[key] : null") &&
			prof.includes("isOverlayKey(s.personality) ? s.personality : null") && // global, not profile
			!prof.includes("p.personality") &&
			tab.includes('"none (identity only)"') &&
			tab.includes("update(p.id, { soul: soulTa.value })") &&
			!tab.includes("update(p.id, { personality: v })");
		if (ok) {
			console.log("✓ v0.1.149: SOUL / personality split — global personality (display.personality), profiles carry none (v0.1.172)");
		} else {
			console.error("✗ v0.1.149 SOUL/personality split drifted");
			failed++;
		}
	}

	// v0.1.173 (owner report 2026-08-21 — "FINDSTR: Cannot open Physical",
	// "pwd is not recognized", "system cannot find the path specified"): the
	// Windows local shell must use Node's shell:true shape (ONE verbatim
	// quote-wrapped arg under /d /s /c), refusal errors must name the setting
	// to change, and the terminal tool schema must disclose the shell dialect
	// so the model stops firing POSIX commands at cmd.exe.
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

	// v0.1.150 (Appearance): the tab returns with five self-owned chat-surface
	// controls (tool cards / reasoning / session density / intro / reactions);
	// it never touches Obsidian's own theme (no theme/zoom/translucency).
	{
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const reason = read("src/ui/components/reasoning.tsx");
		const css = read("styles.css");
		/* Every tab in the SECTIONS registry must have a matching case in
		   renderSectionBody — a key without a case renders an EMPTY tab (the
		   Lesson 107 trap the Appearance tab hit on its first landing). */
		const switchSlice = tab.slice(tab.indexOf("private renderSectionBody"), tab.indexOf("/* ───────────────────────── sections"));
		const sectionKeys = [...(tab.slice(tab.indexOf("const SECTIONS"), tab.indexOf("const SECTION_DESC")).matchAll(/key: "([a-z]+)"/g))].map((m) => m[1]);
		const everyKeyHasCase = sectionKeys.length > 0 && sectionKeys.every((k) => switchSlice.includes(`case "${k}":`));
		const ok =
			setts.includes('toolViewMode: "collapsed"') &&
			setts.includes('reasoningCollapsedByDefault: false') &&
			setts.includes('sessionListDensity: "comfortable"') &&
			setts.includes("showIntroScreen: true") &&
			setts.includes("showReactions: true") &&
			setts.includes('inRaw.toolViewMode === "expanded"') &&
			tab.includes('key: "appearance", label: "Appearance"') &&
			tab.includes('private appearance(') &&
			tab.includes('case "appearance":\n\t\t\tthis.appearance(host);') &&
			everyKeyHasCase &&
			tab.includes('setName("Tool calls")') &&
			tab.includes('setName("Reasoning")') &&
			tab.includes('setName("Session list density")') &&
			tab.includes('setName("Intro screen")') &&
			tab.includes('setName("Reaction buttons")') &&
			chat.includes('settings.toolViewMode === "hidden"') &&
			chat.includes('defaultOpen={settings.toolViewMode === "expanded"}') &&
			chat.includes("defaultOpen={!settings.reasoningCollapsedByDefault}") &&
			chat.includes('settings.sessionListDensity === "compact"') &&
			chat.includes("settings.showIntroScreen ? <Intro") &&
			chat.includes("settings.showReactions && showFeedbackBar(turn)") &&
			reason.includes("isStreaming && defaultOpen") &&
			css.includes('.oa-panel.is-compact .oa-panel-row') &&
			!tab.includes("zoomPercent") &&
			!tab.includes("translucency");
		if (ok) {
			console.log("✓ v0.1.150: Appearance tab — five self-owned chat-surface controls, Obsidian's theme untouched");
		} else {
			console.error("✗ v0.1.150 Appearance tab drifted");
			failed++;
		}
	}

	// v0.1.151 (Advanced parity): Max tool iterations moved Chat → Advanced
	// (Hermes agent.max_turns), plus tool output limit (tool_output.max_bytes)
	// and checkpoint snapshots kept (checkpoints.max_snapshots) with pruning.
	{
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const tools = read("src/agent/tools.ts");
		const toolC = read("src/ui/components/tool.tsx");
		const chat = read("src/ui/ChatApp.tsx");
		const adv = tab.slice(tab.indexOf("private advanced(containerEl"), tab.indexOf("private notifications(containerEl"));
		const agentSec = tab.slice(tab.indexOf("private agent(containerEl"), tab.indexOf("private appearance(containerEl"));
		const ok =
			setts.includes("checkpointMaxSnapshots: 30") &&
			setts.includes("toolOutputMaxChars: 5000") &&
			setts.includes("Math.min(200, Math.max(5, Math.floor") &&
			setts.includes("Math.min(50_000, Math.max(1_000, Math.floor") &&
			adv.includes('setName("Max tool iterations")') &&
			adv.includes('setName("Tool output limit")') &&
			adv.includes('setName("Checkpoint snapshots kept")') &&
			!agentSec.includes("Max tool iterations") &&
			tools.includes("ctx.settings.checkpointMaxSnapshots") &&
			tools.includes("ctx.app.vault.delete(files[i])") &&
			toolC.includes("maxDisplayChars = MAX_DISPLAY_CHARS") &&
			toolC.includes("split.tool.length > cap") &&
			chat.includes("maxDisplayChars={settings.toolOutputMaxChars}");
		if (ok) {
			console.log("✓ v0.1.151: Advanced parity — max iterations moved in, tool output limit + checkpoint pruning added");
		} else {
			console.error("✗ v0.1.151 Advanced parity drifted");
			failed++;
		}
	}

	// v0.1.152 (settings tidy-up, lobe-ui Empty parity): one empty-state shape
	// (title + description + optional action) replaces the scattered ad-hoc
	// classes; the old per-surface classes are retired.
	{
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const ok =
			tab.includes("private emptyState(") &&
			tab.includes('cls: "oa-empty"') &&
			tab.includes('cls: "oa-empty-title"') &&
			tab.includes('cls: "oa-empty-desc"') &&
			tab.includes('cls: "oa-empty-action"') &&
			tab.includes("this.emptyState(containerEl, {") &&
			css.includes(".oa-settings .oa-empty {") &&
			css.includes(".oa-settings .oa-empty-title {") &&
			css.includes(".oa-settings .oa-empty-desc {") &&
			css.includes(".oa-settings .oa-empty-action {") &&
			!css.includes(".oa-skill-empty") &&
			!css.includes(".oa-snippet-empty") &&
			!css.includes(".oa-cron-empty") &&
			!css.includes(".oa-cron-skill-empty") &&
			!css.includes(".oa-cron-history-empty") &&
			!css.includes(".oa-workspace-exclusions-empty");
		if (ok) {
			console.log("✓ v0.1.152: settings empty states unified — lobe-ui Empty shape, old ad-hoc classes retired");
		} else {
			console.error("✗ v0.1.152 settings empty-state unification drifted");
			failed++;
		}
	}

	// v0.1.153 (A8 ColorSwatches): profile colors must render reliably — two-
	// class selectors beat Obsidian's button pseudo-states, every var() carries
	// a canonical fallback hex, and no standalone .oa-color-* rule remains.
	{
		const css = read("styles.css");
		const colors = ["gray", "red", "orange", "yellow", "green", "cyan", "blue", "purple"];
		const fallbacks = {
			red: "#e93147",
			orange: "#ec7500",
			yellow: "#e0ac00",
			green: "#08b94e",
			cyan: "#00bfbc",
			blue: "#086ddd",
			purple: "#7852ee",
		};
		const ok =
			colors.every((c) =>
				css.includes(`.oa-swatch.oa-color-${c}, .oa-profile-dot.oa-color-${c}`)
			) &&
			Object.entries(fallbacks).every(([c, hex]) =>
				css.includes(`var(--color-${c}, ${hex})`)
			) &&
			css.includes(".oa-swatch.oa-color-gray, .oa-profile-dot.oa-color-gray { background: var(--text-muted); }") &&
			css.includes(".oa-settings .oa-swatch:hover:not(.is-active)") &&
			css.includes(".oa-settings .oa-swatch:focus-visible") &&
			!/\n\.oa-color-(red|orange|yellow|green|cyan|blue|purple)\s*\{/.test(css);
		if (ok) {
			console.log("✓ v0.1.153: profile colors — two-class selectors + canonical fallbacks + hover/focus states");
		} else {
			console.error("✗ v0.1.153 profile color swatches drifted");
			failed++;
		}
	}

	// v0.1.154 (A4 SortableList): command rows gain native-HTML5 drag reorder
	// via a grip handle; the up/down arrows remain the keyboard/mobile path
	// (v0.1.77 "minus the dnd dependency" decision extended, no new dep).
	{
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const cmd = tab.slice(tab.indexOf("private renderCommandRows"), tab.indexOf("private automations"));
		const ok =
			cmd.includes("grip.draggable = true") &&
			cmd.includes('setIcon(grip, "grip-vertical")') &&
			cmd.includes('row.addClass("is-dragging")') &&
			cmd.includes('e.dataTransfer.effectAllowed = "move"') &&
			cmd.includes("row.addEventListener(\"dragover\"") &&
			cmd.includes("row.addEventListener(\"drop\"") &&
			cmd.includes('"is-drop-before"') &&
			cmd.includes('"is-drop-after"') &&
			cmd.includes("s.promptSnippets.splice(target, 0, moved)") &&
			cmd.includes("mkArrow(\"up\", idx - 1)") && // arrows kept as a11y path
			css.includes(".oa-cmd-grip {") &&
			css.includes("cursor: grab") &&
			css.includes(".oa-snippet-row.is-dragging") &&
			css.includes(".oa-snippet-row.is-drop-before") &&
			css.includes(".oa-snippet-row.is-drop-after") &&
			css.includes("box-shadow: 0 -2px 0 0 var(--interactive-accent)");
		if (ok) {
			console.log("✓ v0.1.154: command drag-reorder — native DnD grip + drop indicators, arrows kept for keyboard/mobile");
		} else {
			console.error("✗ v0.1.154 command drag-reorder drifted");
			failed++;
		}
	}

	// v0.1.156 (owner): the snippet tips sit at the TOP of the modal as a
	// quiet card with a lightbulb icon (Lucide via setIcon, no emoji).
	{
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const modal = read("src/settings/modals/snippet.ts");
		const ok =
			modal.includes('setIcon(icon, "lightbulb")') &&
			modal.includes('cls: "oa-snippet-tips-icon"') &&
			modal.includes('cls: "oa-snippet-tips-title"') &&
			modal.indexOf('cls: "oa-snippet-tips"') < modal.indexOf('setName("Title")') &&
			css.includes(".oa-snippet-tips-icon {") &&
			css.includes(".oa-snippet-tips-icon svg {") &&
			css.includes(".oa-snippet-tips {") &&
			css.includes("border: 1px solid var(--background-modifier-border);");
		if (ok) {
			console.log("✓ v0.1.156: snippet tips at the top of the modal — lightbulb card, no emoji");
		} else {
			console.error("✗ v0.1.156 snippet tips card drifted");
			failed++;
		}
	}

	// v0.1.157 (A7 Skeleton): shimmer placeholder rows replace the plain
	// "Loading…" text in the hub results and the cron focus-skills loader.
	{
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const ok =
			tab.includes("private skeletonRows(") &&
			tab.includes('cls: "oa-skeleton"') &&
			tab.includes('cls: "oa-skeleton-row"') &&
			tab.includes('cls: "oa-skeleton-line is-main"') &&
			tab.includes('cls: "oa-skeleton-line is-sub"') &&
			tab.includes("this.skeletonRows(this.hubResultsEl, 3)") &&
			tab.includes("this.skeletonRows(skillsHolder, 2)") &&
			!tab.includes("Loading hub catalogs") &&
			!tab.includes("Loading skills") &&
			css.includes(".oa-settings .oa-skeleton {") &&
			css.includes(".oa-skeleton-line {") &&
			css.includes(".oa-skeleton-line.is-main") &&
			css.includes(".oa-skeleton-line.is-sub") &&
			css.includes("@keyframes oa-skeleton-pulse") &&
			css.includes("prefers-reduced-motion: reduce") &&
			css.includes("animation: none;");
		if (ok) {
			console.log("✓ v0.1.157: skeleton loading rows — hub + cron skills loaders shimmer, reduced-motion safe");
		} else {
			console.error("✗ v0.1.157 skeleton loading rows drifted");
			failed++;
		}
	}

	// v0.1.158 (A1 EditableText): panel-local rename UI is isolated from
	// durable SessionStore access. Enter/blur commit, Escape cancels, and an
	// active-session rename still updates the ChatApp title mirror.
	{
		const ses = read("src/agent/sessions.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const panel = read("src/ui/components/session-panel.tsx");
		const css = read("styles.css");
		const ok =
			ses.includes("async rename(id: string, title: string)") &&
			ses.includes("s.title = title;") &&
			ses.includes("await this.save(s);") &&
			chat.includes('import { SessionPanel } from "./components/session-panel"') &&
			chat.includes("const renameSession = useCallback") &&
			chat.includes("scopedSessions.rename(id, next)") &&
			chat.includes("sessionTitleRef.current = next") &&
			chat.includes("onRename={renameSession}") &&
			panel.includes("const [renamingId, setRenamingId]") &&
			panel.includes("const commitRename = useCallback") &&
			panel.includes('aria-label="Rename chat"') &&
			panel.includes('className="oa-panel-row-rename-input"') &&
			panel.includes('if (event.key === "Enter") void commitRename()') &&
			panel.includes('else if (event.key === "Escape")') &&
			!/^import .*SessionStore/m.test(panel) &&
			!/^import .*AgentLoop/m.test(panel) &&
			css.includes(".oa-panel-row-rename-input {") &&
			css.includes(".oa-panel-row-rename-input:focus") &&
			css.includes(".oa-panel-row-rename:hover");
		if (ok) {
			console.log("✓ v0.1.158: inline session rename — isolated panel UI, durable ChatApp store callback, Enter/Escape");
		} else {
			console.error("✗ v0.1.158 inline session rename drifted");
			failed++;
		}
	}

	// v0.1.159 (A3 TokenTag): the statusbar token pill gains a context-window
	// bar — percentage only when the window is KNOWN (explicit setting or
	// provider-advertised), red on overload, plain ↑in ↓out otherwise.
	{
		const chat = read("src/ui/ChatApp.tsx");
		const css = read("styles.css");
		const ok =
			chat.includes("const [contextWindow, setContextWindow]") &&
			chat.includes("fetchAdvertisedContextLength(provider, model)") &&
			chat.includes("resolveContextWindow(settings.modelContextLength, advertised)") &&
			chat.includes('className={`oa-statusbar-item oa-token-tag${over ? " is-over" : ""}`}') &&
			chat.includes('className="oa-token-tag-text"') &&
			chat.includes('className="oa-token-bar"') &&
			chat.includes('className="oa-token-bar-fill"') &&
			chat.includes("Math.min(100, pct as number)") &&
			/* v0.1.174: % + overload compare the LAST request's input, not the
			   cumulative session total (owner: "1772% … over budget" false alarm) */
			chat.includes("const lastIn = usage ? usage.promptTokens : null") &&
			chat.includes("over = windowKnown && lastIn !== null && lastIn > (contextWindow as number)") &&
			css.includes(".oa-app .oa-statusbar .oa-token-tag {") &&
			css.includes(".oa-app .oa-token-bar {") &&
			css.includes(".oa-app .oa-token-bar-fill {") &&
			css.includes(".oa-token-tag.is-over .oa-token-bar-fill") &&
			css.includes("var(--color-red, #e93147)");
		if (ok) {
			console.log("✓ v0.1.159: token pill — context-window bar + % (last-request based), red on overload, no guess when window unknown");
		} else {
			console.error("✗ v0.1.159 token pill drifted");
			failed++;
		}
	}

	// v0.1.174 (owner report: "↑580.6k ↓16.8k · 1772% of the 32768 context
	// window — over budget" + "context length 131072 dari LM Studio tidak
	// kebaca"): (a) % + overload compare the LAST request's input (already
	// pinned in v0.1.159 above); (b) LM Studio's context length is read from
	// its NATIVE /api/v1/models (loaded_instances[].config.context_length) —
	// the OpenAI-compat /models omits it; (c) unknown-window fallback is 256K
	// (Hermes CONTEXT_PROBE_TIERS[0]), not the stale 32K guess.
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

	// v0.1.175 (owner: "apa yang perlu ditambah di Memory & Context merujuk
	// Hermes Desktop?"): the desktop tab exposes a Compression block — enabled,
	// threshold, target_ratio, protect_last_n. Ours exposed none of them; the
	// rows now live in the Memory & Context tab and target_ratio is wired into
	// the token-sized verbatim tail.
	{
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const cm = read("src/agent/contextManager.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			setts.includes("compressionTargetRatio") &&
			tab.includes('"Compression"') &&
			tab.includes('"Compress when above"') &&
			tab.includes('"Preserve recent tail"') &&
			tab.includes('"Keep last N messages"') &&
			tab.includes("markModified(stCompressionEnabled") &&
			tab.includes("markModified(stCompressionTargetRatio") &&
			cm.includes("export function pickTokenTailStart") &&
			chat.includes("pickTokenTailStart(base, keepTokens)") &&
			chat.includes("Math.min(startByMessages, startByTokens)");
		if (ok) {
			console.log("✓ v0.1.175: Memory & Context — Compression block (enabled · threshold · target_ratio · protect_last_n) with token-sized tail");
		} else {
			console.error("✗ v0.1.175 compression settings block drifted");
			failed++;
		}
	}

	// v0.1.176 (owner: memory & context engine ala Hindsight, tanpa Docker/MCP
	// — Fase 1): a plugin-native structured-memory engine. Pure fusion recall
	// (BM25 + entity + temporal + trust), one-call typed retain (add/update/
	// delete), facts.jsonl in the memory folder, injection-scanned recall
	// block, statusbar indicator, 3 settings rows. No server, no embeddings.
	{
		const eng = read("src/agent/memoryEngine.ts");
		const run = read("src/agent/runner.ts");
		const sp = read("src/agent/systemPrompt.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const main = read("src/main.ts");
		const ok =
			eng.includes("export function rankFacts") &&
			eng.includes("export function bm25") &&
			eng.includes("export function entityOverlap") &&
			eng.includes("export function temporalWeight") &&
			eng.includes("export function applyRetainOps") &&
			eng.includes("export function parseRetainOps") &&
			eng.includes("export function buildRecallBlock") &&
			eng.includes("export class EngineMemoryStore") &&
			eng.includes("facts.jsonl") &&
			eng.includes("trust") &&
			run.includes("engineForPolicy") &&
			run.includes("EngineMemoryStore") &&
			run.includes("recalledMemory: string | null = null") &&
			sp.includes("recalledMemory?: string | null") &&
			sp.includes("p.recalledMemory") &&
			chat.includes("maybeRetainMemory") &&
			chat.includes("buildRecallBlock(facts, obs)") && // v0.1.178: observations joined
			chat.includes("isTrivialPrompt(q)") &&
			chat.includes("memoryEngineRecallMax") &&
			chat.includes("oa-memory-tag") &&
			chat.includes("<BrainIcon size={11} />") &&
			setts.includes("memoryEngineEnabled") &&
			setts.includes("memoryEngineRetainEveryN") &&
			setts.includes("memoryEngineRecallMax") &&
			tab.includes('"Structured memory"') &&
			tab.includes('"Retain every N turns"') &&
			tab.includes('"Recall budget"') &&
			tab.includes("markModified(stMemoryEngineEnabled") &&
			main.includes("new EngineMemoryStore(this.app, this.settings.memoryFolder)") &&
			main.includes("this.engineMemory.setFolder(memoryFolder)");
		if (ok) {
			console.log("✓ v0.1.176: structured-memory engine — pure fusion recall + typed retain + facts.jsonl + recall block + settings (plugin-native, no server)");
		} else {
			console.error("✗ v0.1.176 structured-memory engine drifted");
			failed++;
		}
	}

	// v0.1.177 (Fase 2): reflect — facts consolidate into observations (with
	// evidence + proof counts, refined not duplicated) and answer standing
	// mental-model questions; the settled knowledge rides into the prompt as
	// a free file read. Background, cadence-gated, silent on failure.
	{
		const eng = read("src/agent/memoryEngine.ts");
		const run = read("src/agent/runner.ts");
		const sp = read("src/agent/systemPrompt.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			eng.includes("export function consolidationDue") &&
			eng.includes("export function buildReflectPrompt") &&
			eng.includes("export function parseReflectOps") &&
			eng.includes("export function applyReflectOps") &&
			eng.includes("export function buildMentalModelBlock") &&
			eng.includes("MENTAL_MODEL_QUESTIONS") &&
			eng.includes("async reflect(") &&
			eng.includes("async mentalModelsBlock(") &&
			eng.includes("observations.jsonl") &&
			eng.includes("models.jsonl") &&
			eng.includes("meta.json") &&
			run.includes("stores.engine.mentalModelsBlock()") &&
			sp.includes("mentalModelBlock?: string | null") &&
			sp.includes("p.mentalModelBlock") &&
			chat.includes("await engine.reflect(");
		if (ok) {
			console.log("✓ v0.1.177: reflect — observations + mental models, evidence+proofs, cadence-gated, read-cheap settled knowledge");
		} else {
			console.error("✗ v0.1.177 reflect/mental-models drifted");
			failed++;
		}
	}

	// v0.1.178 (Fase 3): semantic recall — optional /v1/embeddings model
	// (embedTexts), cosine re-rank fused over the lexical score, observations
	// join the recall block. Embedding is optional; recall degrades to pure
	// fusion without it. No server — the provider's own embeddings endpoint.
	{
		const prov = read("src/agent/providers.ts");
		const eng = read("src/agent/memoryEngine.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			prov.includes("export async function embedTexts") &&
			prov.includes("/embeddings") &&
			eng.includes("export function cosineSimilarity") &&
			eng.includes("export async function fuseScores") &&
			eng.includes("export function rankObservations") &&
			eng.includes("async searchObservations") &&
			eng.includes("Consolidated observations:") &&
			chat.includes("embedTexts(provider, embedModel, texts)") &&
			chat.includes("engine.searchObservations(q, 4, embed)") &&
			chat.includes("setRecalledCount(facts.length + obs.length)") &&
			setts.includes("memoryEngineEmbedModel") &&
			tab.includes('"Embedding model"') &&
			tab.includes("markModified(stMemoryEngineEmbedModel");
		if (ok) {
			console.log("✓ v0.1.178: semantic recall — embedTexts + cosine fusion + observations in recall (optional, no server)");
		} else {
			console.error("✗ v0.1.178 semantic recall drifted");
			failed++;
		}
	}

	// v0.1.179 (owner: "bisa gak ganti jadi picker seperti setting model"):
	// the embedding model is a DROPDOWN seeded from the active provider's
	// catalog, not a hand-typed text field — consistent with the Model tab.
	{
		const tab = read("src/settingsTab.ts");
		const ok =
			tab.includes('setName("Embedding model")') &&
			tab.includes("withCurrentModel(catalogOf(activeProvider), s.memoryEngineEmbedModel)") &&
			tab.includes('"off (keyword recall only)"') &&
			tab.includes('aria-label", "Embedding model"') &&
			!tab.includes('setName("Embedding model").addText');
		if (ok) {
			console.log("✓ v0.1.179: embedding model — catalog dropdown with off option (no manual typing)");
		} else {
			console.error("✗ v0.1.179 embedding model picker drifted");
			failed++;
		}
	}

	// v0.1.180 (owner: "perbaiki capabilitas composer textarea yang belum sesuai
	// Hermes Desktop"): ↑/↓ input-history browse (draft snapshot restore) +
	// the composer's OWN undo/redo stack (chip re-renders bypass Chromium) +
	// Escape halts the running turn.
	{
		const undo = read("src/ui/composer/undo.ts");
		const hist = read("src/ui/composer/history.ts");
		const pi = read("src/ui/components/prompt-input.tsx");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			undo.includes("export function createComposerUndoHistory") &&
			undo.includes("isUndoShortcut") &&
			undo.includes("isRedoShortcut") &&
			undo.includes("COALESCE_WINDOW_MS = 600") &&
			hist.includes("export function deriveUserHistory") &&
			hist.includes("export class ComposerHistoryBrowse") &&
			hist.includes("browseBackward") &&
			hist.includes("browseForward") &&
			pi.includes("createComposerUndoHistory") &&
			pi.includes("onBeforeInput") &&
			pi.includes("isUndoShortcut(e)") &&
			pi.includes("isRedoShortcut(e)") &&
			pi.includes("resetUndo: () => undoRef.current.reset()") &&
			chat.includes("historyBrowseRef") &&
			chat.includes("deriveUserHistory(turns, turnTextOf)") &&
			chat.includes("stepQueueEdit(-1)") &&
			chat.includes("browseBackward(input, history)") &&
			chat.includes("browseForward(history)") &&
			chat.includes('if (e.key === "Escape" && running)') &&
			chat.includes("historyBrowseRef.current.reset()");
		if (ok) {
			console.log("✓ v0.1.180: composer textarea parity — ↑/↓ history browse + own undo/redo + Escape halt");
		} else {
			console.error("✗ v0.1.180 composer input-history/undo drifted");
			failed++;
		}
	}

	// v0.1.181 (owner: "layout UI yang baik di setting"): consistent group
	// labels on the tabs that had none + trimmed the descriptions that grew
	// rows to 94–125px. Evidence: real-DOM probe (all desc-driven rows back
	// to the 79px standard; appearance dropped to 63px).
	{
		const tab = read("src/settingsTab.ts");
		const ok =
			tab.includes('this.subheading(containerEl, "Approvals"') &&
			tab.includes('this.subheading(containerEl, "Scope"') &&
			tab.includes('this.subheading(containerEl, "Chat surface"') &&
			tab.includes('this.subheading(containerEl, "Limits"') &&
			tab.includes('this.subheading(containerEl, "System prompt"') &&
			tab.includes('this.subheading(containerEl, "Scheduled tasks"') &&
			tab.includes("Whole vault: everything visible. Preferred: route to a folder. Strict: hard boundary.") &&
			tab.includes("Pick a model to enable semantic recall");
		if (ok) {
			console.log("✓ v0.1.181: settings layout — group labels on every tab + trimmed descriptions (real-DOM: rows back to 79px)");
		} else {
			console.error("✗ v0.1.181 settings layout group-labels/descriptions drifted");
			failed++;
		}
	}

	// v0.1.182 (P3): provider+model pairs sit side-by-side (oa-control-row)
	// instead of stacked — Global default model, Fallback, MoA Reference and
	// Aggregator. Text inputs/areas (Environment, Headers, Custom system
	// prompt) deliberately stay full-width stacked.
	{
		const st = read("src/settingsTab.ts");
		const css = read("styles.css");
		const ok =
			st.includes('if (opts?.row) el.addClass("oa-control-row")') &&
			st.includes("stackedControl(pickSetting, { row: true })") &&
			st.includes("stackedControl(row, { row: true })") &&
			st.includes("stackedControl(agg, { row: true })") &&
			css.includes(".oa-stacked-control.oa-control-row") &&
			css.includes("flex-direction: row;") &&
			!st.includes("stackedControl(row);") && // fallback rows converted
			!st.includes("stackedControl(agg)"); // aggregator converted
		if (ok) {
			console.log("✓ v0.1.182: Model tab provider+model pairs side-by-side (Fallback · Global default · MoA Reference · Aggregator)");
		} else {
			console.error("✗ v0.1.182 stacked-control row variant drifted");
			failed++;
		}
	}

	// v0.1.183 (owner: "label duplikat Title generation"): the title flow has
	// TWO distinct rows — the enable toggle "Title generation" + the aux-model
	// slot renamed "Title model" (was a confusing duplicate of the toggle).
	{
		const tab = read("src/settingsTab.ts");
		const ok =
			tab.includes('auxModelRow(containerEl, "titleGeneration", "Title model"') &&
			tab.includes('.setName("Title generation")') &&
			tab.includes('.setName("Enable compression")');
		if (ok) {
			console.log("✓ v0.1.183: duplicate label fixed — \"Title generation\" (toggle) vs \"Title model\" (aux slot)");
		} else {
			console.error("✗ v0.1.183 title label split drifted");
			failed++;
		}
	}

	// v0.1.184 (owner: "tidak ada blok yang menjelaskan sedang compression"):
	// compaction now pushes a visible START banner (system turn) before the
	// summarize call, so the brief ThinkingBar flash is backed by a durable
	// in-transcript block; the END banner ("Context compacted") still follows.
	{
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			chat.includes("pushLocalNoticeTurn(\"Compacting context — folding earlier messages into a rolling summary.\")") &&
			chat.includes("setLiveStatus(\"Compacting context…\")") &&
			chat.includes("pushLocalNoticeTurn(\n\t\t\t\t`Context compacted — ${upto}");
		if (ok) {
			console.log("✓ v0.1.184: compaction — visible start banner + end banner in the transcript");
		} else {
			console.error("✗ v0.1.184 compaction start-banner drifted");
			failed++;
		}
	}

	// v0.1.185 (owner: "ubah oa-attach-menu dan oa-model menu diatas composer
	// juga, biar rapi di desktop & phone"): both menus are full-width above
	// the composer — the slash-menu/panel geometry (left/right 12px + max-
	// width 820px, centered), anchored to .oa-composer-zone via static
	// anchors. No more 250/270/300px popover pinned to the buttons.
	{
		const css = read("styles.css");
		const am = css.slice(css.indexOf(".oa-app .oa-attach-menu {"), css.indexOf("\n.oa-app .oa-attach-menu-head"));
		const mm = css.slice(css.indexOf(".oa-app .oa-model-menu {"), css.indexOf("\n.oa-app .oa-model-menu-list"));
		const picker = css.slice(css.indexOf(".oa-app .oa-model-picker {"), css.indexOf("\n.oa-app .oa-model-pill"));
		const anchor = css.slice(css.indexOf(".oa-app .oa-attach-anchor {"), css.indexOf("\n.oa-app .oa-attach-toggle"));
		const ok =
			am.includes("width: min(820px, calc(100% - 24px));") &&
			am.includes("margin: 0 auto 6px;") &&
			am.includes("max-height: min(24rem, calc(100vh - 12rem));") &&
			mm.includes("width: min(820px, calc(100% - 24px));") &&
			mm.includes("margin: 0 auto 6px;") &&
			!picker.includes("position: relative;") &&
			!anchor.includes("position: relative;");
		if (ok) {
			console.log("✓ v0.1.185: attach + model menus — full-width above the composer (slash-menu geometry), no popover pin");
		} else {
			console.error("✗ v0.1.185 attach/model menu full-width drifted");
			failed++;
		}
	}

	// v0.1.186 (owner: "compress when above / preserve recent tail tak muncul"
	// — they ARE percentages): the slider's number box must carry a PLAIN
	// number, never the "%"-suffixed display text (a "%" written into
	// <input type=number> is rejected by the browser and empties the box).
	// The "%" is a visible unit suffix; v0.1.189 moved it INSIDE the box.
	{
		const sc = read("src/ui/settings-controls.ts");
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const ok =
			sc.includes("if (from !== num) num.value = String(v);") &&
			!sc.includes("num.value = fmt(v)") &&
			sc.includes('unit.className = "oa-slideinput-unit"') &&
			tab.includes("unit: \"%\"") &&
			css.includes(".oa-slideinput .oa-slideinput-numwrap {");
		if (ok) {
			console.log("✓ v0.1.186: % sliders — plain number in the box + visible \"%\" unit suffix (no more empty boxes)");
		} else {
			console.error("✗ v0.1.186 slider unit/format split drifted");
			failed++;
		}
	}

	// v0.1.187 (owner: "reset khusus yang ketik manual, terlebih angka"): a ↺
	// reset button appears only on modified numeric/text fields (NOT toggles,
	// enums, objects, secrets). Restores DEFAULT_SETTINGS via setPath + deep
	// clone; the three numeric fields that had no modified-dot also gained
	// markModified (maxTokens / modelContextLength / requestTimeoutMs).
	{
		const sm = read("src/settingsModified.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			sm.includes("export function setPath(") &&
			tab.includes("private resetButton(setting: Setting, path: string)") &&
			tab.includes('setIcon("rotate-ccw")') &&
			tab.includes('setTooltip("Reset to default")') &&
			tab.includes("this.resetButton(stMaxTokens, \"maxTokens\")") &&
			tab.includes("this.resetButton(stContextWindow, \"modelContextLength\")") &&
			tab.includes("this.resetButton(stRequestTimeout, \"requestTimeoutMs\")") &&
			tab.includes("this.resetButton(stTemperature, \"temperature\")") &&
			tab.includes("this.resetButton(stMemoryCharLimit, \"memoryCharLimit\")") &&
			tab.includes("this.resetButton(stCompressionThreshold, \"compressionThreshold\")") &&
			/* toggles/enums/objects/lists never get a reset button */
			!tab.includes("this.resetButton(stCompressionEnabled") &&
			!tab.includes("this.resetButton(stApprovalMode") &&
			!tab.includes("this.resetButton(stMemoryEnabled") &&
			/* v0.1.188: exclusions are a picked LIST — no ↺ (per-row trash instead) */
			!tab.includes("this.resetButton(stExclusions") &&
			(tab.match(/this\.resetButton\(/g) || []).length === 22;
		if (ok) {
			console.log("✓ v0.1.187: ↺ reset-to-default on numeric/text fields (22 sites, toggles/enums/objects/lists excluded)");
		} else {
			console.error("✗ v0.1.187 reset-button wiring drifted");
			failed++;
		}
	}

	// v0.1.188 (owner: "excluded folder tidak perlu ada reset button"): the
	// Workspace exclusions control keeps its modified-dot but loses the ↺ —
	// it is a picked LIST (each row has its own trash button), so a single
	// reset would blank the whole list at once. markModified stays.
	{
		const tab = read("src/settingsTab.ts");
		const ok =
			tab.includes('markModified(stExclusions, this.plugin.settings, "workspaceExcludedFolders");') &&
			!tab.includes("this.resetButton(stExclusions");
		if (ok) {
			console.log("✓ v0.1.188: exclusions keep the modified-dot but no ↺ reset (list, per-row trash)");
		} else {
			console.error("✗ v0.1.188 exclusions reset-button removal drifted");
			failed++;
		}
	}

	// v0.1.189 (owner: "tampilan persentase lebih menyatu / seamless"): the
	// number box and its "%" suffix now share one .oa-slideinput-numwrap, and
	// the unit renders INSIDE the field (absolute right, pointer-events none)
	// instead of floating a gap away. has-unit reserves the input's padding.
	{
		const sc = read("src/ui/settings-controls.ts");
		const css = read("styles.css");
		const ok =
			sc.includes('numwrap.className = "oa-slideinput-numwrap"') &&
			sc.includes('numwrap.classList.add("has-unit")') &&
			sc.includes("numwrap.appendChild(unit)") &&
			sc.includes("el.appendChild(numwrap)") &&
			css.includes(".oa-slideinput .oa-slideinput-numwrap {") &&
			css.includes("numwrap.has-unit input") &&
			css.includes("pointer-events: none;");
		if (ok) {
			console.log("✓ v0.1.189: % unit renders inside the number field (seamless numwrap suffix)");
		} else {
			console.error("✗ v0.1.189 seamless %-unit structure drifted");
			failed++;
		}
	}

	// v0.1.190 (owner: "hidupkan kembali tab about"): an informational About
	// tab — identity (version/build/requirements), full description, MIT
	// license, attribution list (reference-sources.md), and a Copy diagnostics
	// button whose blob never carries secrets. The settings header keeps only
	// the short tagline; the full description moved into About.
	{
		const tab = read("src/settingsTab.ts");
		const ok =
			tab.includes('key: "about", label: "About"') &&
			tab.includes("private about(") &&
			tab.includes('case "about":') &&
			tab.includes('text: shortDesc') &&
			tab.includes('setButtonText("Copy diagnostics")') &&
			tab.includes("MIT License") &&
			tab.includes('"Hermes Agent"') &&
			tab.includes("p.enabled && p.apiKey") &&
			!tab.includes("apiKey: p.apiKey") &&
			!tab.includes("apiKey }");
		if (ok) {
			console.log("✓ v0.1.190: About tab — identity/license/attribution + Copy diagnostics (no secrets); header keeps the short tagline");
		} else {
			console.error("✗ v0.1.190 About tab drifted");
			failed++;
		}
	}

	// v0.1.191 (owner: deskripsi "singkat, padat, jelas, mudah dipahami, dan
	// menerangkan kegunaan utama"): every setDesc literal must stay ≤140 chars
	// (excluding ${...} template holes) and must never leak upstream-internal
	// tokens into the UI. Extracts only setDesc string literals, so code
	// comments carrying those tokens can never trip this guard.
	{
		const tab = read("src/settingsTab.ts");
		const strs = [];
		const re = /\.setDesc\(\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/g;
		let mm;
		while ((mm = re.exec(tab)) !== null) strs.push(mm[1].replace(/^["`]|["`]$/g, ""));
		const strip = (t) => t.replace(/\$\{[^}]*\}/g, "");
		const long = strs.filter((t) => strip(t).length > 140).slice(0, 5);
		const BANNED = ["target_ratio", "protect_last_n", "provider-advertised", "operator-level", "transport details", "the wire"];
		const leaks = [];
		for (const t of strs) for (const b of BANNED) if (t.includes(b)) leaks.push(`${b} → ${t.slice(0, 40)}`);
		const ok = long.length === 0 && leaks.length === 0;
		if (ok) {
			console.log("✓ v0.1.191: settings descriptions — ≤140 chars and no upstream-internal tokens (use-first copy)");
		} else {
			console.error("✗ v0.1.191 settings copy drifted", JSON.stringify({ long, leaks }));
			failed++;
		}
	}

	// v0.1.192 (owner: "personality preset promptnya bisa disamakan lagi
	// dengan hermes desktop?"): the 14 Hermes built-in overlay prompts are
	// VERBATIM from hermes_cli/personality.py BUILTIN_PERSONALITIES (commit
	// 261a4ef, verified 2026-08-22). Spot-pin signatures so a hand-edit back
	// to our old "mode descriptor" copy cannot slip through; the 4 vault
	// extras stay. Reads only the PERSONALITY_OVERLAYS literal, so code
	// comments mentioning these names can never trip it.
	{
		const tab = read("src/settings.ts");
		const overlays = tab.slice(tab.indexOf("export const PERSONALITY_OVERLAYS"), tab.indexOf("export function isOverlayKey"));
		const ok =
			overlays.includes("You are a helpful, friendly AI assistant.") &&
			overlays.includes("You are Neko-chan, an anime catgirl AI assistant, nya~!") &&
			overlays.includes("Captain Hermes, the most tech-savvy pirate") &&
			overlays.includes("hewwo! i'm your fwiendwy assistant uwu~") &&
			overlays.includes("They call me Hermes - I solve problems") &&
			overlays.includes("Greetings, seeker of wisdom.") &&
			overlays.includes("LET'S GOOOO!!!") &&
			overlays.includes("(◕‿◕)") &&
			/* the 4 vault-flavored extras remain */
			overlays.includes('researcher: "Research mode —') &&
			overlays.includes('engineer: "Engineering mode —') &&
			overlays.includes('writer: "Writing mode —') &&
			overlays.includes('librarian: "Librarian mode —') &&
			/* our old mode-descriptor copy is gone */
			!overlays.includes("Friendly, general-purpose assistant mode") &&
			!overlays.includes("Maximum cuteness with uwu-speak") &&
			!overlays.includes("Totally chill, laid-back surfer energy") &&
			!overlays.includes("Patient educator mode");
		if (ok) {
			console.log("✓ v0.1.192: personality prompts — 14 Hermes built-ins verbatim (personality.py @261a4ef) + 4 vault extras, old mode copy retired");
		} else {
			console.error("✗ v0.1.192 personality prompt parity drifted");
			failed++;
		}
	}

	// v0.1.160 (A5 BackBottom): the scroll button gains an unread dot — new
	// content that lands while the user is scrolled up marks "new below", and
	// the dot clears on returning to the bottom (lobe-ui BackBottom affordance,
	// honest dot not a fake count).
	{
		const sb = read("src/ui/components/scroll-button.tsx");
		const cc = read("src/ui/components/chat-container.tsx");
		const css = read("styles.css");
		const ok =
			sb.includes("badge = false") &&
			sb.includes('className="oa-scroll-button-dot"') &&
			sb.includes('aria-label={badge ? "Scroll to bottom — new messages" : "Scroll to bottom"}') &&
			cc.includes("const [newBelow, setNewBelow] = useState(false)") &&
			cc.includes("const onContentGrow = useCallback") &&
			cc.includes("else setNewBelow(true)") &&
			cc.includes("if (near) setNewBelow(false)") &&
			cc.includes("badge={newBelow}") &&
			cc.includes("setNewBelow(false);") &&
			cc.includes("scrollToBottom(true);") &&
			css.includes(".oa-app .oa-scroll-button-dot {") &&
			css.includes("box-shadow: 0 0 0 2px var(--background-primary)");
		if (ok) {
			console.log("✓ v0.1.160: scroll button unread dot — new-below marks while scrolled up, clears at bottom");
		} else {
			console.error("✗ v0.1.160 scroll button unread dot drifted");
			failed++;
		}
	}

	// v0.1.162 (owner: "tidak berubah sama sekali"): the chat panel opens where
	// the user wants — a NEW leaf goes left / main (tab) / right per the
	// setting, AND an existing chat is MOVED there when it sits elsewhere.
	// v0.1.163: flipping the setting relocates immediately AND the live
	// session id is captured/restored so the conversation survives the move.
	{
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const main = read("src/main.ts");
		const chatView = read("src/ui/ChatView.tsx");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			setts.includes('chatLeafLocation: "left" | "main" | "right"') &&
			setts.includes('chatLeafLocation: "right"') &&
			setts.includes('inRaw.chatLeafLocation === "left" || inRaw.chatLeafLocation === "main"') &&
			tab.includes('setName("Chat panel location")') &&
			tab.includes('addOption("left", "Left sidebar")') &&
			tab.includes('addOption("main", "Main workspace (tab)")') &&
			tab.includes('addOption("right", "Right sidebar")') &&
			tab.includes('markModified(stChatLeafLocation') &&
			tab.includes('moves an open panel there right away') &&
			tab.includes('this.plugin.moveChatViewToConfiguredLocation()') &&
			main.includes('async moveChatViewToConfiguredLocation') &&
			main.includes('const loc = this.settings.chatLeafLocation') &&
			main.includes('workspace.getLeftLeaf(false)') &&
			main.includes('workspace.getLeaf(false)') &&
			main.includes('workspace.getRightLeaf(false)') &&
			main.includes('const root = leaf.getRoot()') &&
			main.includes('root === workspace.leftSplit') &&
			main.includes('root === workspace.rightSplit') &&
			main.includes('const state = leaf.getViewState()') &&
			main.includes('leaf.detach()') &&
			main.includes('target.setViewState(state)') &&
			main.includes('this.pendingChatSessionId') &&
			main.includes('consumePendingChatSessionId()') &&
			main.includes('getCurrentSessionId') &&
			chatView.includes('initialSessionId={this.plugin.consumePendingChatSessionId()}') &&
			chatView.includes('onSessionIdChange={(id) => (this.currentSessionId = id)}') &&
			chat.includes('initialSessionId?: string | null') &&
			chat.includes('onSessionIdChange?: (id: string) => void') &&
			chat.includes('loadConversation(props.initialSessionId)');
		if (ok) {
			console.log("✓ v0.1.162: chat panel location — open MOVES an existing chat per setting; v0.1.163: immediate relocate + session survives the move");
		} else {
			console.error("✗ v0.1.162 chat panel location drifted");
			failed++;
		}
	}

	// v0.1.164 (owner: model pill "ngunci" panjang → composer collapse): the
	// flex CHAIN must shrink — the picker is the shrinkable flex item in the
	// nowrap actions row, the pill fills it, the label ellipsizes. Quick Ask
	// mirrors the same shape.
	{
		const css = read("styles.css");
		const picker = css.slice(css.indexOf(".oa-app .oa-model-picker {"), css.indexOf(".oa-app .oa-model-menu"));
		const qa = css.slice(css.indexOf(".oa-quickask .oa-model-picker {"), css.indexOf(".oa-quickask .oa-model-menu"));
		const ok =
			picker.includes("min-width: 0;") &&
			picker.includes("flex: 0 1 210px;") &&
			picker.includes("max-width: 210px;") &&
			picker.includes(".oa-model-pill {\n\tdisplay: flex;") &&
			picker.includes("width: 100%;") &&
			css.includes(".oa-app .oa-model-pill-label {\n\t/* v0.1.164") &&
			css.includes("flex: 1 1 auto;\n\tmin-width: 0;") &&
			qa.includes("min-width: 0; flex: 0 1 210px; max-width: 210px;") &&
			css.includes(".oa-quickask .oa-model-pill-label { flex: 1 1 auto; min-width: 0;");
		if (ok) {
			console.log("✓ v0.1.164: model pill flex chain — shrinkable picker + filling pill + ellipsizing label (chat & Quick Ask)");
		} else {
			console.error("✗ v0.1.164 model pill flex chain drifted");
			failed++;
		}
	}

	// v0.1.165 (owner: slash "/" overlay differs from Hermes Desktop): the
	// slash drawer becomes a narrow left-docked card with icon + name + desc
	// rows (reference vocabulary per kind), group headers without hairlines,
	// and keyboard highlight (Arrow/Enter/Tab) + hover highlight.
	{
		const chat = read("src/ui/ChatApp.tsx");
		const icons = read("src/ui/icons.tsx");
		const css = read("styles.css");
		const ok =
			icons.includes('TerminalIcon = make("terminal")') &&
			chat.includes("const [slashIndex, setSlashIndex] = useState(0)") &&
			chat.includes("const acceptSlashRow = useCallback") &&
			chat.includes('type SlashRowKind = "command" | "skill" | "snippet"') &&
			chat.includes('rowKind: "command" as SlashRowKind') &&
			chat.includes('rowKind: "skill" as SlashRowKind') &&
			chat.includes('rowKind: "snippet" as SlashRowKind') &&
			chat.includes('className="oa-overlay oa-slash-overlay"') &&
			chat.includes('className={`oa-slash-item-icon oa-slash-kind-${r.rowKind}`}') &&
			chat.includes('className="oa-slash-item-name"') &&
			chat.includes('className="oa-slash-item-desc"') &&
			chat.includes("onMouseEnter={() => setSlashIndex(i)}") &&
			chat.includes("aria-selected={i === slashIndex}") &&
			chat.includes("if (slashMenu.rows.length > 0) {") &&
			chat.includes("setSlashIndex((i) => (i + 1) % slashMenu.rows.length)") &&
			chat.includes("acceptSlashRow(row as { name?: string; value?: string; fill?: string })") &&
			css.includes(".oa-app .oa-slash-overlay .oa-slash-menu {") &&
			css.includes("width: 100%;") &&
			css.includes("max-width: 820px; /* keep in lockstep with .oa-prompt-input max-width */") &&
			css.includes("margin: 0 auto;") &&
			css.includes(".oa-app .oa-slash-item-icon {") &&
			css.includes(".oa-app .oa-slash-kind-command { color: var(--interactive-accent); }") &&
			css.includes(".oa-app .oa-slash-kind-skill { color: var(--color-orange, #ec7500); }") &&
			css.includes(".oa-app .oa-slash-kind-snippet { color: var(--color-cyan, #00bfbc); }") &&
			css.includes(".oa-app .oa-slash-item-name {") &&
			css.includes("flex: 0 0 auto;") &&
			css.includes(".oa-app .oa-slash-item span.oa-slash-item-name") &&
			css.includes(".oa-app .oa-slash-item-desc {") &&
			/* v0.1.166: every item shows — no slice caps on any slash group */
			!chat.includes(".slice(0, 6)") &&
			!chat.includes(".slice(0, 4)") &&
			chat.includes("SLASH_COMMANDS.filter((c) => c.name.startsWith(input))\n\t\t\t.map((c) =>") &&
			/* group headers: Hermes spacing, hairline separator retired —
			   check the block itself, not a file-wide scan */
			!css.slice(css.indexOf(".oa-app .oa-slash-hdr {"), css.indexOf("\n}\n", css.indexOf(".oa-app .oa-slash-hdr {"))).includes("border-top:");
		if (ok) {
			console.log("✓ v0.1.166: slash overlay — composer-width drawer, all items listed, name fully visible, keyboard highlight");
		} else {
			console.error("✗ v0.1.166 slash overlay parity drifted");
			failed++;
		}
	}

	// v0.1.167 (owner: "arrow key select tidak ikut"): keyboard nav keeps the
	// highlighted row in view via LOCAL scroll (block: nearest), never
	// scrollIntoView (which would also move the transcript).
	{
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			chat.includes("const slashMenuRef = useRef<HTMLDivElement>(null)") &&
			chat.includes('ref={slashMenuRef}') &&
			chat.includes("const active = list.querySelector<HTMLElement>(\".oa-slash-item.is-active\")") &&
			chat.includes("const topDelta = activeRect.top - listRect.top") &&
			chat.includes("const bottomDelta = activeRect.bottom - listRect.bottom") &&
			chat.includes("list.scrollTop += Math.abs(topDelta) < Math.abs(bottomDelta) ? topDelta : bottomDelta") &&
			chat.includes("list.scrollTop = 0") &&
			chat.includes("}, [slashIndex, slashMenu.rows])") &&
			!chat.includes("scrollIntoView");
		if (ok) {
			console.log("✓ v0.1.167: slash keyboard nav scrolls the highlighted row into view (local, block: nearest)");
		} else {
			console.error("✗ v0.1.167 slash keyboard scroll-follow drifted");
			failed++;
		}
	}

	// v0.1.168 amended (owner: panel = "sama seperti oa-slash-menu"): the
	// sessions panel is a slash-menu-style popover — NO backdrop, anchored
	// ABOVE the composer via the shared .oa-overlay, capped scrolling list.
	{
		const chat = read("src/ui/ChatApp.tsx");
		const panel = read("src/ui/components/session-panel.tsx");
		const css = read("styles.css");
		const ok =
			chat.includes("<SessionPanel") &&
			!chat.includes("oa-panel-backdrop") &&
			panel.includes('className="oa-overlay oa-panel-overlay"') &&
			panel.includes("ref={panelRef}") &&
			chat.includes("panelToggleRef") &&
			css.includes(".oa-app .oa-panel {") &&
			css.includes("max-width: 820px") &&
			css.includes("background: var(--background-primary)") &&
			css.includes("border-radius: var(--radius-l, 12px)") &&
			css.includes("overflow: hidden;") &&
			css.includes(".oa-app .oa-panel-list {") &&
			css.includes("flex: 1 1 auto") &&
			css.includes("max-height: min(22rem, calc(100vh - 10rem))") &&
			!css.includes(".oa-panel-backdrop") &&
			!css.includes("oa-panel-up");
		if (ok) {
			console.log("✓ v0.1.168: sessions panel — slash-menu-style popover (no backdrop, above composer, scrolling list)");
		} else {
			console.error("✗ v0.1.168 panel popover drifted");
			failed++;
		}
	}
	// v0.1.169 (owner: "conversation, yang untuk buka tutup drawer itu loh" +
	//   "rotate-ccw-clock, bukan rotate-ccw"): the topbar conversations toggle
	//   sits in the right cluster directly after New chat. Glyph = "history" —
	//   the pre-rename lucide name Obsidian bundles for the ccw-arrow+clock
	//   glyph (latest lucide renamed history → rotate-ccw-clock).
	{
		const chat = read("src/ui/ChatApp.tsx");
		const ic = read("src/ui/icons.tsx");
		const shim = read("test/real-preview/obsidian-shim.ts");
		const ok =
			chat.indexOf('aria-label="New chat"') < chat.indexOf('aria-label="Conversations"') &&
			chat.includes("<RotateCcwIcon size={15} />") &&
			!chat.includes("<SidebarIcon") &&
			ic.includes('export const RotateCcwIcon = make("history")') &&
			!ic.includes("export const SidebarIcon") &&
			shim.includes("history:");
		if (ok) {
			console.log("✓ v0.1.169: conversations toggle — history glyph (Obsidian's pre-rename rotate-ccw-clock), after New chat");
		} else {
			console.error("✗ v0.1.169 conversations toggle drifted");
			failed++;
		}
	}

	// ---- v0.1.18 — obsidian API compat (lesson 24): minAppVersion 1.5.0
	// honesty. FileManager#trashFile arrived after 1.5.7 (typing float made it
	// compile silently) — trashing goes through the feature-detected shim and
	// the direct call must never reappear outside it.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const walk = (d) =>
			fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
				e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []
			);
		const shim = read("../src/agent/vaultCompat.ts");
		const direct = walk(path.join(__dirname, "../src"))
			.filter((f) => !f.endsWith("vaultCompat.ts"))
			.some((f) => fs.readFileSync(f, "utf8").includes("fileManager.trashFile"));
		const ok =
			shim.includes('typeof trashFile === "function"') &&
			shim.includes("app.vault.trash(file, true)") &&
			read("../src/main.ts").includes("trashRespectingPrefs(this.app, af)") &&
			read("../src/agent/skills.ts").includes("trashRespectingPrefs(this.app, f)") &&
			!direct;
		if (ok) {
			console.log("✓ v0.1.18: trashFile compat shim (feature-detected; no direct calls outside the shim)");
		} else {
			console.error("✗ v0.1.18 API compat drifted (direct trashFile call reappeared or shim lost)");
			failed++;
		}
	}

	// ---- v0.1.19 — base-URL description is per-provider (owner 2026-07-31:
	// "kan itu deskripsi untuk settingan LM studio, kenapa ada yang lain
	// juga?"). The LM Studio row must never again carry Ollama/OpenRouter.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const tab3 = read("../src/settingsTab.ts");
		const ok =
			tab3.includes("baseUrlDesc(viewed.id)") &&
			tab3.includes('case "lmstudio"') && tab3.includes('case "ollama"') &&
			tab3.includes('case "openrouter"') && tab3.includes('case "openai"') &&
			tab3.includes("http://localhost:1234/v1") && tab3.includes("http://localhost:11434/v1") &&
			!tab3.includes("http://localhost:1234/v1 (LM Studio), http://localhost:11434/v1 (Ollama)");
		if (ok) {
			console.log("✓ v0.1.19: base-URL description per viewed provider (no cross-provider list)");
		} else {
			console.error("✗ v0.1.19 base-URL desc drifted (cross-provider examples back, or map lost)");
			failed++;
		}
	}

	// ---- v0.1.20 — slash quick batch (Hermes Desktop composer parity,
	// study: docs/studies/hermes-slash-parity-2026-07-31.md): /title, /version,
	// /queue (+/q), /resume (+/sessions /switch) + the official alias map.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const app3 = read("../src/ui/ChatApp.tsx");
		const bi = read("../src/buildInfo.ts");
		const escfg = read("../esbuild.config.mjs");
		const ok =
			app3.includes("SLASH_ALIASES") &&
			app3.includes('case "/title"') && app3.includes('case "/version"') &&
			app3.includes('case "/queue"') && app3.includes('case "/resume"') &&
			app3.includes("cmdToken.toLowerCase()") &&
			app3.includes("/^\\/(queue|q)(?:\\s+(.*))?$/is") && // busy: arg queued, never the token
			app3.includes("setPanelFilter(arg)") && app3.includes("setPanelOpen(true)") &&
			bi.includes("PLUGIN_VERSION") && escfg.includes("__OA_VERSION__");
		if (ok) {
			console.log("✓ v0.1.20: slash quick batch (/title /version /queue /resume + alias map, busy-strip guarded)");
		} else {
			console.error("✗ v0.1.20 slash batch drifted (cases, alias map, busy-strip, or version define lost)");
			failed++;
		}
	}

	// ---- v0.1.21 — slash medium batch (Hermes Desktop parity): /status,
	// /save, /profile, /approvals + the arg-stage popover (argumentMode).
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const app4 = read("../src/ui/ChatApp.tsx");
		const ok =
			app4.includes('case "/status"') && app4.includes('case "/save"') &&
			app4.includes('case "/profile"') && app4.includes('case "/approvals"') &&
			app4.includes("slashMenu") && app4.includes('kind: "opt"') &&
			app4.includes('"active provider catalog"') &&
			app4.includes("openagent/exports") && app4.includes("props.app.vault.create(") &&
			app4.includes("props.applyProfile(hit.id)") &&
			app4.includes("getActiveProfile(settings)") &&
			/* v0.1.168 amended: Platform left the import again — panel is one shell. */
			app4.includes('import { App, Component, MarkdownView, Notice, TFile, normalizePath } from "obsidian"');
		if (ok) {
			console.log("✓ v0.1.21: slash medium batch (/status /save /profile /approvals + arg-stage popover)");
		} else {
			console.error("✗ v0.1.21 slash medium batch drifted (cases, arg-stage, vault save, or applyProfile lost)");
			failed++;
		}
	}

	// ---- v0.1.22 — skills in the slash palette (Hermes "Skills" group +
	// cli verbs, raw: use-slash-completions.ts groupOrder + hermes_cli
	// commands.py "Args: name (list|read)"): group headers, verb staging,
	// read/use arms one message even when the skill is disabled.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const app5 = read("../src/ui/ChatApp.tsx");
		const css5 = read("../styles.css");
		const ok =
			app5.includes("skillContextRef") &&
			app5.includes('[Skill: ${skill.name}]') &&
			app5.includes("/skills read|use <name>") &&
			app5.includes('aliases: ["/skill", "/search", "/use"]') &&
			app5.includes("slashSkills") &&
			app5.includes('group: "Skills"') &&
			app5.includes("oa-slash-hdr") &&
			app5.includes("fill: `/skills use ${s.name} `") &&
			/* v0.1.78: the fallback text is now promptText (token-cleaned) —
			   displayText STILL wins when set, the precedence this guard
			   protects; the new v0.1.78 block pins the replacement line */
			app5.includes("displayText ?? promptText") &&
			app5.includes("skillPrefix + notePrefix + composePrompt(false)") &&
			css5.includes(".oa-slash-hdr");
		if (ok) {
			console.log("✓ v0.1.22: skills → slash palette (group headers, verb staging, one-shot skill context, disabled-read wins)");
		} else {
			console.error("✗ v0.1.22 skills-palette drifted (context ref, groups, aliases, or one-shot injection lost)");
			failed++;
		}
	}

	// ---- v0.1.23 — /branch (+/fork): chat fork with parent lineage
	// (Hermes session.branch + branchTitle(siblings+1), raw study:
	// docs/studies/hermes-slash-parity-2026-07-31.md status append 4).
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const app6 = read("../src/ui/ChatApp.tsx");
		const ses6 = read("../src/agent/sessions.ts");
		const ok =
			app6.includes('case "/branch"') &&
			app6.includes('aliases: ["/fork"]') &&
			app6.includes("branchConversation") &&
			app6.includes("sessionParentRef") &&
			app6.includes("parent === parentId") &&
			app6.includes("— Branch ${siblings + 1}") &&
			app6.includes('parent: parentId') &&
			ses6.includes("parent?: string");
		if (ok) {
			console.log("✓ v0.1.23: /branch chat fork (lineage title, parent link, byte-stable parent, aliases)");
		} else {
			console.error("✗ v0.1.23 branch drifted (case, lineage, parent ref, or session type lost)");
			failed++;
		}
	}

	// ---- v0.1.24 — slash chips, full composer rework (Hermes slash-refs.ts +
	// directive-text.tsx parity): contenteditable with atomic pills, hydration
	// for inert text, /skill-name dispatch, transcript pills.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const app7 = read("../src/ui/ChatApp.tsx");
		const pi7 = read("../src/ui/components/prompt-input.tsx");
		const ch7 = read("../src/ui/composer/chips.ts");
		const css7 = read("../styles.css");
		const ok =
			ch7.includes("SLASH_COMMAND_RE") &&
			ch7.includes("slashChipMatches") &&
			ch7.includes("trailingCommitted") &&
			ch7.includes("boundaryBefore") &&
			pi7.includes("contentEditable") &&
			pi7.includes("oa-chip") &&
			pi7.includes("serializeComposer") &&
			app7.includes("chipResolver") &&
			app7.includes("ChipText") &&
			app7.includes("skillSlug") &&
			app7.includes('runAgent(arg, undefined, raw)') &&
			app7.includes('args: "[focus]"') &&
			app7.includes('args: "<name>"') &&
			css7.includes(".oa-chip");
		if (ok) {
			console.log("✓ v0.1.24: slash chips (contenteditable, atomic pills, hydration, skill dispatch, transcript pills)");
		} else {
			console.error("✗ v0.1.24 chips drifted (scan rules, editor, resolver, or transcript pills lost)");
			failed++;
		}
	}

	// ---- v0.1.25 — /goal Ralph loop (hermes_cli/goals.py parity): standing
	// goal + judge-after-every-turn, continuation prompts, 20-turn budget,
	// parse/transport backstops, goalJudge aux slot, statusbar chip, and the
	// sendQueued slash re-dispatch (queued /goal is a command, not prose).
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const app8 = read("../src/ui/ChatApp.tsx");
		const goals8 = read("../src/agent/goals.ts");
		const cm8 = read("../src/agent/contextManager.ts");
		const ses8 = read("../src/agent/sessions.ts");
		const st8 = read("../src/settingsTab.ts");
		const ok =
			app8.includes('case "/goal"') &&
			app8.includes("maybeContinueGoal") &&
			app8.includes("continuationPrompt(g.text)") &&
			app8.includes("oa-goal-chip") &&
			app8.includes("setGoalSynced(newGoal(arg))") &&
			app8.includes('entry.text.startsWith("/")') &&
			app8.includes("runAgent(entry.text, entry.attachments, entry.displayText)") &&
			goals8.includes("GOAL_MAX_TURNS = 20") &&
			goals8.includes("GOAL_MAX_PARSE_FAILURES = 3") &&
			goals8.includes("GOAL_MAX_TRANSPORT_FAILURES = 5") &&
			goals8.includes("parseGoalVerdict") &&
			goals8.includes("[Continuing toward your standing goal]") &&
			cm8.includes('"goalJudge"') &&
			ses8.includes("goal?: SessionGoal") &&
			st8.includes('"goalJudge"');
		if (ok) {
			console.log("✓ v0.1.25: /goal Ralph loop (judge, continuation, budget, aux slot, drain re-dispatch)");
		} else {
			console.error("✗ v0.1.25 goal drifted (loop, budget guards, aux slot, or chip lost)");
			failed++;
		}
	}

	// ---- v0.1.26 — /steer mid-turn injection (run_agent.py steer() +
	// prompt_builder.py marker parity): byte-exact marker, drain into the
	// LAST tool result, busy inline dispatch (never queued), leftover
	// next-turn delivery, interrupt drops, system-prompt trust channel, and
	// the transcript rending steers as attributed user notes.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const steer9 = read("../src/agent/steer.ts");
		const loop9 = read("../src/agent/agentLoop.ts");
		const app9 = read("../src/ui/ChatApp.tsx");
		const tool9 = read("../src/ui/components/tool.tsx");
		const sys9 = read("../src/agent/systemPrompt.ts");
		const css9 = read("../styles.css");
		const ok =
			steer9.includes('[OUT-OF-BAND USER MESSAGE — a direct message from the user, delivered mid-turn; not tool output]') &&
			steer9.includes("[/OUT-OF-BAND USER MESSAGE]") &&
			steer9.includes("formatSteerMarker") &&
			steer9.includes("splitSteerMarkers") &&
			steer9.includes("STEER_CHANNEL_NOTE") &&
			loop9.includes("steer(text: string): boolean") &&
			loop9.includes("drainSteer") &&
			loop9.includes("formatSteerMarker(steerText)") &&
			loop9.includes("pendingSteer: aborted") &&
			loop9.includes("onSteerApplied") &&
			app9.includes('case "/steer"') &&
			app9.includes("loopRef.current = loop") &&
			app9.includes("applySteerMarker") &&
			app9.includes("/^\\/steer(?:\\s|$)/i") &&
			app9.includes("result.pendingSteer") &&
			app9.includes("Delivering leftover /steer as next turn") &&
			app9.includes("Steer queued") &&
			tool9.includes("splitSteerMarkers") &&
			tool9.includes("oa-steer-note") &&
			sys9.includes("STEER_CHANNEL_NOTE") &&
			css9.includes(".oa-steer-note");
		if (ok) {
			console.log("✓ v0.1.26: /steer mid-turn injection (marker, drain, busy dispatch, leftover, trust channel)");
		} else {
			console.error("✗ v0.1.26 steer drifted (marker, drain, dispatch, leftover, or render lost)");
			failed++;
		}
	}

	// ---- v0.1.27 — aux pin = provider AND model (bugfix): all three aux
	// call sites must override the request model with the resolved pair.model,
	// and the goal harness pins goalJudge to a different model so the wire
	// proves it.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const app10 = read("../src/ui/ChatApp.tsx");
		const chat10 = read("real-preview/chat-entry.tsx");
		const overrides = app10.split("{ ...effectiveSettings, model: pair.model }").length - 1;
		const ok =
			overrides === 3 &&
			chat10.includes("__oaRequestModels") &&
			chat10.includes('goalJudge: { providerId: "lmstudio", model: "qwen3-30b-a3b-instruct-2507" }') &&
			chat10.includes("judgeModelOk");
		if (ok) {
			console.log("✓ v0.1.27: aux pin rides provider+model (3 call sites, wire-proven pin)");
		} else {
			console.error("✗ v0.1.27 aux pin drifted (model override lost at a call site)");
			failed++;
		}
	}

	// ---- v0.1.28 — web_extract full parity (tools/web_tools.py): urls list,
	// char budget with 75/25 head+tail window + [TRUNCATED] footer, vault
	// store + read_note paging, opt-in summarize riding the webExtract aux
	// slot (provider+model), settings row.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const we11 = read("../src/agent/webExtract.ts");
		const tools11 = read("../src/agent/tools.ts");
		const cm11 = read("../src/agent/contextManager.ts");
		const st11 = read("../src/settingsTab.ts");
		const app11 = read("../src/ui/ChatApp.tsx");
		const ok =
			we11.includes("WEB_EXTRACT_CHAR_LIMIT = 15000") &&
			we11.includes("WEB_EXTRACT_STORE_MAX_CHARS = 2_000_000") &&
			we11.includes("truncateWithFooter") &&
			we11.includes("read_note path=") &&
			we11.includes("[TRUNCATED]") &&
			tools11.includes('name: "web_extract"') &&
			!tools11.includes('name: "web_fetch"') &&
			tools11.includes("summarizeWebPage") &&
			tools11.includes('resolveAuxTask(ctx.settings, "webExtract"') &&
			tools11.includes("model: pair.model") &&
			tools11.includes("storeFullPage") &&
			tools11.includes("offset") &&
			cm11.includes('"webExtract"') &&
			st11.includes('"webExtract"') &&
			st11.includes("Web extract") &&
			app11.includes('p.toolName !== "web_extract"');
		if (ok) {
			console.log("✓ v0.1.28: web_extract parity (window+footer, vault store, read_note paging, aux slot+row)");
		} else {
			console.error("✗ v0.1.28 web_extract drifted (window/store/paging/slot lost)");
			failed++;
		}
	}

	// ---- v0.1.29 — MoA config layer + settings section (hermes_cli/moa_config.
	// py + desktop model-settings.tsx parity): tolerant read / loud write,
	// official seeds, recursion guard, settings draft editor, null-until-saved.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const moa = read("../src/agent/moa.ts");
		const set12 = read("../src/settings.ts");
		const st12 = read("../src/settingsTab.ts");
		const ok =
			moa.includes('provider: "openai-codex", model: "gpt-5.5"') &&
			moa.includes('provider: "openrouter", model: "deepseek/deepseek-v4-pro"') &&
			moa.includes('model: "anthropic/claude-opus-4.8"') &&
			moa.includes("validateMoaPayload") &&
			moa.includes("normalizeMoaConfig") &&
			moa.includes("recursive MoA") &&
			moa.includes("exactMoaPresetName") &&
			moa.includes("coerceMoaFanout") &&
			moa.includes("moaConfigComplete") &&
			set12.includes("moa: MoaConfig | null") &&
			set12.includes("normalizeMoaConfig(rawMoa)") &&
			st12.includes('"Mixture of Agents"') &&
			st12.includes("Add reference model") &&
			st12.includes("Set default") &&
			st12.includes("moaSave") &&
			st12.includes("validateMoaPayload({ presets: draft.presets })") &&
			st12.includes("Waiting for a complete preset");
		if (ok) {
			console.log("✓ v0.1.29: MoA config parity (tolerant/loud, seeds) + settings section (draft editor, persist gate)");
		} else {
			console.error("✗ v0.1.29 MoA layer drifted (config/section/persist gate lost)");
			failed++;
		}
	}

	// ---- v0.1.30 — MoA runtime (agent/moa_loop.py MoAClient parity): virtual
	// provider in the picker, advisor fan-out + guidance attach per cadence,
	// disclosure events, AgentLoop facade hook.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const loop = read("../src/agent/moaLoop.ts");
		const agent = read("../src/agent/agentLoop.ts");
		const app13 = read("../src/ui/ChatApp.tsx");
		const pick = read("../src/ui/components/model-picker.tsx");
		const ok =
			loop.includes("MOA_REFERENCE_SYSTEM_PROMPT") &&
			loop.includes("MOA_REFERENCE_TOOL_RESULT_BUDGET = 4000") &&
			loop.includes("[Mixture of Agents reference context]") &&
			loop.includes("Use the reference responses below as private context. You are the aggregator and acting model") &&
			loop.includes("[Reference models unavailable: ") &&
			loop.includes("[skipped: interrupted by user]") &&
			loop.includes("moaCadenceDecision") &&
			loop.includes("attachMoaGuidance") &&
			agent.includes("MoaTurnEngine") &&
			agent.includes("prepareIteration(callWire)") &&
			app13.includes("MoaTurnEngine") &&
			app13.includes("moaEmit") &&
			app13.includes("◇ MoA aggregating…") &&
			app13.includes("setActiveMoaPreset") &&
			/* v0.1.32: the virtual-provider surface moved to the official
			   shell.modelMenu names — "MoA presets" section + search alias,
			   picker names wired from ChatApp */
			pick.includes("MoA presets") &&
			pick.includes("moaPresetMatches") &&
			app13.includes("moaPickerNames");
		if (ok) {
			console.log("✓ v0.1.30: MoA runtime parity (advisor view + guidance + cadence) + picker virtual provider + facade hook");
		} else {
			console.error("✗ v0.1.30 MoA runtime drifted (engine/hook/picker lost)");
			failed++;
		}
	}

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

	// ---- v0.1.31 — /moa one-shot sugar (cli.py ~10024: stash, ride the
	// default preset for one turn, restore) + bare /model <preset> implicit
	// pivot (model_switch.py PATH B exact_moa_preset_name, enabled-only,
	// #55187; the "moa:" prefix is never a bare name).
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const app14 = read("../src/ui/ChatApp.tsx");
		const ok =
			app14.includes('"/moa"') &&
			app14.includes("moaUsage()") &&
			app14.includes("const moaSettings = JSON.parse(JSON.stringify(settings))") &&
			app14.includes("{ settingsOverride: moaSettings }") &&
			app14.includes("MoA one-shot queued with preset ${preset}; your selected model remains unchanged.") &&
			app14.includes("exactMoaPresetName(settings.moa, arg)") &&
			app14.includes("left the MoA virtual provider");
		if (ok) {
			console.log("✓ v0.1.31+: /moa one-shot uses an immutable per-run override + bare /model pivot (enabled-only)");
		} else {
			console.error("✗ v0.1.31 /moa one-shot or bare /model pivot drifted");
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
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const mm = read("../src/agent/modelMenu.ts");
		const pick15 = read("../src/ui/components/model-picker.tsx");
		const dlg = read("../src/ui/components/model-visibility-dialog.tsx");
		const set15 = read("../src/settings.ts");
		const app15 = read("../src/ui/ChatApp.tsx");
		const css15 = read("../styles.css");
		const ok =
			mm.includes("export function collapseModelFamilies") &&
			mm.includes("export function toggleModelVisibility") &&
			mm.includes("export function groupMenuModels") &&
			mm.includes("export function moaPresetMatches") &&
			mm.includes("DEFAULT_VISIBLE_PER_PROVIDER = 50") &&
			mm.includes("export function modelDisplayParts") &&
			pick15.includes("ModelVisibilityDialog") &&
			pick15.includes('"Search models"') &&
			pick15.includes("No models found") &&
			pick15.includes("MoA presets") &&
			pick15.includes("Refresh Models") &&
			pick15.includes("Edit Models…") &&
			pick15.includes("data-kb-active") &&
			dlg.includes("Add provider…") &&
			dlg.includes("No authenticated providers.") &&
			set15.includes("visibleModels: string[] | null") &&
			set15.includes("collapsedMenuProviders: string[]") &&
			app15.includes("providerSlug={conn.providerId}") &&
			dlg.includes("checkbox-container") && // v0.1.34: switch IS the app toggle
			css15.includes(".oa-app .oa-modal-overlay");
		if (ok) {
			console.log("✓ v0.1.32: model menu parity (groups, families, search, kbd, refresh stays open, visibility dialog)");
		} else {
			console.error("✗ v0.1.32 model menu parity drifted (lib, picker labels, dialog, settings fields, or CSS lost)");
			failed++;
		}
	}

	// ---- v0.1.33 — owner report (2026-08-01): Refresh Models jumped to
	// settings (gate used p.enabled, which is false for EVERY preset → zero
	// targets → openSettings). Fix: gate on the plugin's canonical
	// providerUsable, never navigate from Refresh (official never does).
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const app16 = read("../src/ui/ChatApp.tsx");
		const rp16 = read("real-preview/chat-entry.tsx");
		const refresh = app16.slice(app16.indexOf("const refreshModels = useCallback"), app16.indexOf("const selectModel = useCallback"));
		const ok =
			refresh.includes("providerUsable(p)") &&
			!refresh.includes("props.openSettings()") && // the settings jump is GONE
			refresh.includes("menu stays open") &&
			rp16.includes("__oaSettingsOpened") &&
			rp16.includes("refreshNoSettingsJump");
		if (ok) {
			console.log("✓ v0.1.33: refresh gated by providerUsable — zero-target vaults get a Notice, never a settings jump");
		} else {
			console.error("✗ v0.1.33 refresh fix drifted (gate or no-jump lost)");
			failed++;
		}
	}

	// ---- v0.1.34 — owner directive: the dialog switch must BE the app's
	// own .checkbox-container (hidden native input inside) so theme toggle
	// styling carries over — the hand-drawn .oa-vis-switch CSS is retired —
	// and the menu footer's Refresh/Edit rows stack vertically like the
	// official dropdown menu items.
	// 2026-08-04 (v0.1.70 consolidation): the stacked-footer declarations
	// moved into the base footer rules (folded winner-last) — assert them
	// INSIDE those blocks now, not in the slice after the layer header.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const dlg17 = read("../src/ui/components/model-visibility-dialog.tsx");
		const css17 = read("../styles.css");
		const rp17 = read("real-preview/chat-entry.tsx");
		const ok =
			dlg17.includes('checkbox-container${on ? " is-enabled" : ""}') &&
			!dlg17.includes("oa-vis-switch") &&
			css17.includes("2026-08-01 v0.1.34: footer rows vertical") &&
			!css17.includes(".oa-vis-switch") &&
			(() => {
				/* folded structure (v0.1.70): assert the two declarations in
				   the BASE footer / footer-button rules they now live in */
				const blk = (sel) => {
					const i = css17.indexOf("\n" + sel);
					const j = i < 0 ? -1 : css17.indexOf("\n}\n", i);
					return j < 0 ? "" : css17.slice(i, j);
				};
				return blk(".oa-app .oa-model-menu-footer {").includes("flex-direction: column")
					&& blk(".oa-app .oa-model-menu-footer button {").includes("justify-content: flex-start");
			})() &&
			rp17.includes(".checkbox-container input");
		if (ok) {
			console.log("✓ v0.1.34: switch reuses the app .checkbox-container + footer rows stacked vertically");
		} else {
			console.error("✗ v0.1.34 app-toggle reuse or vertical footer drifted");
			failed++;
		}
	}

	// ---- v0.1.35 — empty state = official Hermes Desktop Intro mirror
	// (components/chat/intro.tsx): OPEN AGENT wordmark + ONE rotating copy
	// line seeded per fresh session; neutral pool + personality templates
	// (vault-adapted). The sparkles hero, provider line, warning chip and
	// slash/@ hint are retired per the owner's super-minimal pick.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const intro = read("../src/ui/components/intro.tsx");
		const app18 = read("../src/ui/ChatApp.tsx");
		const css18 = read("../styles.css");
		const rp18 = read("real-preview/chat-entry.tsx");
		const bm18 = read("real-preview/build.mjs");
		const ok =
			intro.includes('const WORDMARK = "OPEN AGENT"') &&
			/* v0.1.36: pool evolved to the verbatim official jsonl map;
			   templates stay per-personality fallback */
			intro.includes("INTRO_COPY_BY_PERSONALITY") &&
			intro.includes("fallbackCopyForPersonality") &&
			intro.includes("mode is on. What should we work on?") &&
			intro.includes("oa-intro-wordmark") &&
			app18.includes("<Intro personality=") &&
			app18.includes("introSeed") &&
			!app18.includes("How can I help?") &&
			!app18.includes("oa-empty-hint") &&
			!app18.includes("SparklesIcon") &&
			css18.includes("2026-08-01 v0.1.35: empty-state Intro parity") &&
			/* v0.1.152 amended: the retired CHAT-intro title must stay gone as
			   an UNscoped rule — the new settings empty state lives under
			   `.oa-settings .oa-empty-title` (asserted by v0.1.152) and is not
			   this retirement's target. */
			!/\n\.oa-empty-title\s*\{/.test(css18) &&
			rp18.includes("__oaEmptyCheck") &&
			bm18.includes("__oaEmptyCheck");
		if (ok) {
			console.log("✓ v0.1.35: empty state mirrors the official Intro (wordmark + rotating copy; hero retired)");
		} else {
			console.error("✗ v0.1.35 intro mirror drifted (component, wiring, or retirements lost)");
			failed++;
		}
	}

	// ---- v0.1.36 — oa-intro-copy full fidelity (owner report: our copy
	// differed from desktop). The pool is now the official intro-copy.jsonl
	// VERBATIM (75 records, 15 personalities × 5), selection reads the jsonl
	// pool FIRST (our overlapping personalities: helpful/concise/technical/
	// creative/teacher/kawaii/catgirl/pirate/shakespeare/surfer) and only
	// then falls back to the official templates; random mount seed + draft
	// seed replicates the official rotation.
	{
		const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");
		const intro19 = read("../src/ui/components/intro.tsx");
		const jsonlCount = (intro19.match(/"personality":"/g) ?? []).length;
		const ok =
			jsonlCount === 75 &&
			intro19.includes("INTRO_COPY_BY_PERSONALITY") &&
			intro19.includes("const personalities:") === false && // no homemade pool
			intro19.includes('INTRO_COPY_BY_PERSONALITY[personalityKey] || fallbackCopyForPersonality(personalityKey)') &&
			intro19.includes("Math.floor(Math.random() * 100000)") &&
			intro19.includes("neutralCopy()") &&
			intro19.includes('"personality":"noir"') && // verbatim spot checks
			intro19.includes('"personality":"hype"') &&
			intro19.includes('"headline":"Hermes Agent is ready."') &&
			intro19.includes("introBodyPool");
		if (ok) {
			console.log("✓ v0.1.36: intro copy = official jsonl verbatim (75/15), jsonl-pool-first selection, mount+draft rotation");
		} else {
			console.error("✗ v0.1.36 intro-copy fidelity drifted (pool replaced or selection rule lost)");
			failed++;
		}
	}

	// 2026-08-02 v0.1.39 chat-block polish (owner pick "full plan"): avatars
	// retired from every turn (official Hermes renders none — dead
	// MessageAvatar component + CSS removed in the same sweep), chat table
	// becomes a rounded card (row lines only, muted header band — the bare
	// <table> element itself is the scroll container), hr renders as quiet
	// spacing, and text rhythm is tightened (--p-spacing 0.55rem)
	{
		const fs = require("fs");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const msg = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "components", "message.tsx"), "utf8");
		const tableBase = css.match(/\.oa-app \.oa-markdown table \{[^}]+\}/)?.[0] ?? "";
		const tableRows = css.match(/\.oa-app \.oa-markdown table th,\s*\.oa-app \.oa-markdown table td \{[^}]+\}/)?.[0] ?? "";
		const hrBlock = css.match(/\.oa-app \.oa-markdown hr \{[^}]+\}/)?.[0] ?? "";
		if (
			!msg.includes("oa-msg-avatar") &&
			// DECLARATION-level check only (lesson 36): the retirement note in
			// the file header legitimately names the component — comments may
			// freely name it; code may not declare or render it
			!/export function MessageAvatar|<MessageAvatar/.test(msg) &&
			!css.includes(".oa-msg-avatar") &&
			tableBase.includes("border-collapse: separate") &&
			tableBase.includes("border-radius") &&
			tableRows.includes("border-bottom: 1px solid") &&
			!tableRows.includes("border: 1px solid") &&
			css.includes("table tbody tr:last-child > td") &&
			css.includes("table thead th") &&
			hrBlock.includes("height: 0") &&
			!hrBlock.includes("border-top") &&
			css.includes("--p-spacing: 0.55rem")
		) {
			console.log("✓ chat blocks polished: no turn avatars, table card (row lines + muted header), quiet hr, tight rhythm");
		} else {
			console.error("✗ chat-block polish spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.40: reasoning trigger shows ONE finished label (Hermes
	// Desktop thread/message-parts.tsx verbatim states — Thought / Thought
	// briefly / Thought for Ns whole-second), never title+meta together — the
	// old pair printed "Thought Thought for Ns" (owner report "Thought nya
	// double ngak enak dilihat")
	{
		const fs = require("fs");
		const chat = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		if (
			chat.includes('"Thought"') &&
			chat.includes('"Thought briefly"') &&
			chat.includes("`Thought for ${") &&
			chat.includes('.padStart(2, "0")') &&
			// the double-label anti-pattern: a meta side-note that itself names
			// the word ("meta={…Thought") — DECLARATION-level match (lesson 36)
			!/ReasoningTrigger\s+meta=\{[^\n]*Thought/.test(chat)
		) {
			console.log("✓ reasoning trigger: single finished label (Thought / briefly / for Ns), no title+meta double");
		} else {
			console.error("✗ reasoning trigger label spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.41: diagram fences (mermaid) route through Obsidian's own
	// renderer (rendered diagram via its postprocessor, never a code card —
	// Hermes routes ```mermaid/```svg to dedicated renderers, other languages
	// to the code block); containment CSS caps the svg; seed covers the case
	{
		const fs = require("fs");
		const mdx = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "components", "markdown.tsx"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const entry = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		if (
			mdx.includes('DIAGRAM_LANGS = new Set(["mermaid"])') &&
			mdx.includes("DIAGRAM_LANGS.has(seg.lang.trim().toLowerCase())") &&
			mdx.includes('const fence = seg.content.includes("```") ? "~~~" : "```"') &&
			css.includes(".oa-markdown .mermaid {") &&
			css.includes(".oa-markdown .mermaid svg") &&
			entry.includes("\\`\\`\\`mermaid")
		) {
			console.log("✓ diagram fences routed to Obsidian (mermaid), svg contained");
		} else {
			console.error("✗ diagram-fence routing spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.42 tapback reactions → SUPERSEDED 2026-08-02 v0.1.48
	// (owner: "revisi feedback, feedback pakai component prompt kit, tanpa
	// emoji"): the emoji quick-row was retired outright. What survives and
	// is asserted here: one feedback per turn persisted to the session,
	// re-tap retracts, and the double-tap gesture — now tapping "up"
	{
		const fs = require("fs");
		const chat = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		const types = fs.readFileSync(path.join(__dirname, "..", "src", "types.ts"), "utf8");
		if (
			chat.includes('const TAPBACK_FEEDBACK: FeedbackValue = "up";') &&
			chat.includes("TAPBACK_EXCLUDE") &&
			chat.includes("ev.detail !== 2") &&
			/const toggleFeedback = useCallback/.test(chat) &&
			chat.includes("feedbackOf") &&
			types.includes("reaction?: string") &&
			!/const QUICK_REACTIONS = /.test(chat) &&
			!/function ReactionControl\(/.test(chat) &&
			!/const \[reactOpenFor/.test(chat)
		) {
			console.log("✓ tapback→feedback: emoji row retired, dblclick survives (taps up), session persistence kept");
		} else {
			console.error("✗ feedback-supersede spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.43 mini syntax highlighting (chat-UI backlog kapal ③):
	// deliberate no-Shiki deviation kept — a tiny regex tokenizer
	// (src/ui/highlight.ts) paints .oa-tok-* spans inside CodeBlockCode;
	// colors read Obsidian's official --code-* vars (styles.css fallbacks);
	// sim supplies github-dark-dimmed values (= official Hermes SHIKI_THEME
	// dark) in reference-obsidian-app.css; harness: md scenario asserts the
	// json fence tokenizes + round-trips while the mermaid route stays intact
	{
		const fs = require("fs");
		const hl = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "highlight.ts"), "utf8");
		const cb = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "components", "code-block.tsx"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const ref = fs.readFileSync(path.join(__dirname, "reference-obsidian-app.css"), "utf8");
		const entry = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		const buildm = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		const hltest = fs.readFileSync(path.join(__dirname, "highlight.test.cjs"), "utf8");
		const pkg = fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8");
		if (
			/export function highlightCode\(\n?/.test(hl) &&
			/export const HIGHLIGHT_BUDGET = 20_000/.test(hl) &&
			hl.includes('typescript: "js"') &&
			!hl.includes('mermaid: "md"') &&
			/import \{ highlightCode \} from "\.\.\/highlight"/.test(cb) &&
			cb.includes("oa-tok-") &&
			!/from "react-shiki"|from "shiki"/.test(cb) &&
			/\.oa-code-pre \.oa-tok-keyword\s*\{[^}]*--code-keyword/.test(css) &&
			css.includes("--code-number, var(--code-value") &&
			/--code-keyword: #f47067/.test(ref) &&
			ref.includes("SIM-ONLY (2026-08-02, v0.1.43)") &&
			entry.includes("__oaHlCheck") &&
			entry.includes("mermaidIntact") &&
			buildm.includes("__oaHlCheck") &&
			buildm.includes("[md] highlight:") &&
			hltest.includes("round-trip lossless") &&
			pkg.includes("node test/highlight.test.cjs")
		) {
			console.log("✓ mini syntax highlighting: tokenizer + --code-* colors + no-Shiki contract, md harness check wired");
		} else {
			console.error("✗ mini-highlight spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.44 selection actions bar (chat-UI backlog kapal ④):
	// drag-select text inside a message bubble → floating Quote/Copy bar;
	// Quote pastes Obsidian `> ` blockquote lines at the composer caret;
	// the bar never pops mid-drag, only when both selection endpoints live
	// in the same .oa-msg-content; Copy has an execCommand fallback;
	// official Hermes has no such toolbar — modeled, not ported
	{
		const fs = require("fs");
		const chat = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		const icons = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "icons.tsx"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const entry = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		const buildm = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		if (
			/document\.addEventListener\("selectionchange"/.test(chat) &&
			chat.includes('closest(".oa-msg-content")') &&
			chat.includes('selDrag.current = true') &&
			/const quoteSelection = useCallback/.test(chat) &&
			chat.includes('`> ${l}`') &&
			/const copySelection = useCallback/.test(chat) &&
			chat.includes('document.execCommand("copy")') &&
			chat.includes('aria-label="Selection actions"') &&
			icons.includes('make("quote")') &&
			/\.oa-selbar \{[^}]*position: fixed/.test(css) &&
			css.includes(".oa-selbar-btn:hover") &&
			css.includes("@keyframes oa-selbar-in") &&
			entry.includes("__oaSelCheck") &&
			buildm.includes('"sel"') &&
			buildm.includes("__oaSelCheck")
		) {
			console.log("✓ selection actions bar: selectionchange wiring, same-bubble guard, quote/copy handlers, harness check wired");
		} else {
			console.error("✗ selection-actions spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.45 selection opt-in (owner: "selection gak bisa di chat
	// ui"): Obsidian body{user-select:none} + opt-in only for reading view
	// (.markdown-preview-view) left chat bubbles undraggable — the v0.1.44
	// harness selected programmatically and never exercised the real gesture.
	// Fix = scoped opt-in on .oa-msg-content; regression = a true mouse-drag
	// lane in build.mjs (drag textarizes AND pops the bar).
	{
		const fs = require("fs");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const buildm = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		if (
			/\.oa-app \.oa-msg-content\s*\{[^}]*user-select: text;[^}]*-webkit-user-select: text;/.test(css) &&
			buildm.includes("sel drag lane failed") &&
			buildm.includes("page.mouse.down()")
		) {
			console.log("✓ selection opt-in: chat content user-select:text (scoped), real-drag harness lane as regression");
		} else {
			console.error("✗ selection-opt-in spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.46 selection bar → icon-only floating toolbar (owner):
	// labels left the buttons and live in tooltips via aria-label (Obsidian
	// native tooltip, no title=); Copy beat = Copy→Check swap (.is-done);
	// buttons are 26px square shells per the dated CSS block
	{
		const fs = require("fs");
		const chat = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const entry = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		const buildm = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		if (
			chat.includes("<QuoteIcon size={14} />") &&
			chat.includes("is-done") &&
			chat.includes('{selCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}') &&
			!/size=\{12\} \/> \{selCopied/.test(chat) &&
			!/>\s*(Quote|Copy)\s*<\/button>/.test(chat) &&
			/\.oa-selbar \.oa-selbar-btn \{[^}]*width: 28px;[^}]*height: 28px;/.test(css) &&
			css.includes(".oa-selbar-btn.is-done { color: var(--text-success); }") &&
			entry.includes(".oa-selbar-btn.is-done") &&
			buildm.includes("copiedBeat")
		) {
			console.log("✓ selection bar: icon-only floating toolbar, tooltip-via-aria-label, Copy→Check beat, harness follows");
		} else {
			console.error("✗ icon-only selbar spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.47 selbar geometry (owner: "kecil sekali oa-selbar
	// 34,6 x 19,6"): single-class `.oa-selbar-btn` (0,1,0) lost to the
	// `.oa-app button{width:auto}` reset (0,1,1) — same trap class as the
	// v0.1.38 send hover. Scoped up (0,2,1), shells 26 → 28px, and the
	// driver now MEASURES the shell (btnW/btnH) so geometry drift fails
	// red instead of passing visual-by-eye.
	{
		const fs = require("fs");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const entry = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		const buildm = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		if (
			/\.oa-selbar \.oa-selbar-btn \{[^}]*width: 28px;[^}]*height: 28px;[^}]*flex-shrink: 0;/.test(css) &&
			entry.includes("btnW:") &&
			buildm.includes("h.btnW < 26") &&
			buildm.includes("shells 28px")
		) {
			console.log("✓ selbar geometry: scoped 28px shells + measured-size regression in the sel lane");
		} else {
			console.error("✗ selbar-geometry spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.48 row-pair adaptation → SUPERSEDED 2026-08-02 v0.1.49:
	// owner reviewed the deviation and picked the OFFICIAL banner shape.
	// What survives from both eras and is asserted here: session-persisted
	// rating ("up"|"down"), re-tap retracts, the dblclick gesture
	{
		const fs = require("fs");
		const chat = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		const types = fs.readFileSync(path.join(__dirname, "..", "src", "types.ts"), "utf8");
		if (
			chat.includes('const TAPBACK_FEEDBACK: FeedbackValue = "up";') &&
			chat.includes("ev.detail !== 2") &&
			/const toggleFeedback = useCallback/.test(chat) &&
			/const dismissFeedback = useCallback/.test(chat) &&
			chat.includes("showFeedbackBar") &&
			types.includes("reaction?: string") &&
			types.includes("feedbackDismissed?: boolean") &&
			!/function MessageFeedback\(/.test(chat)
		) {
			console.log("✓ feedback eras: pair superseded by banner, rating+dismissal persist, dblclick kept");
		} else {
			console.error("✗ feedback-supersede spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.49 feedback banner, faithful prompt-kit feedback-bar
	// (owner's three questions: why different from prompt-kit [my deviation,
	// corrected], why on user bubble [tapback-era leak, removed], why bigger
	// than oa-msg-action [my 28px language, irrelevant now — official 32px
	// shells]): inline-flex border card, "Was this helpful?" title, 32px
	// ghost thumbs / 16px icons, Close behind a divider; pick=persists and
	// hides; dismiss=persists; assistant answers only; harness drives
	// pick→hide→dblclick-retract→close-dismiss
	{
		const fs = require("fs");
		const fb = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "components", "feedback.tsx"), "utf8");
		const chat = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const entry = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		const buildm = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		if (
			fb.includes("faithful shape") &&
			/export function FeedbackBar\(/.test(fb) &&
			fb.includes('aria-label="Helpful"') &&
			fb.includes('aria-label="Not helpful"') &&
			fb.includes('aria-label="Close"') &&
			fb.includes("oa-feedback-close-col") &&
			chat.includes('"Was this helpful?"') &&
			chat.includes("showFeedbackBar(turn)") &&
			chat.includes('role === "assistant" && !running && textParts.length > 0 && settings.showReactions && showFeedbackBar') &&
			/\.oa-app \.oa-feedback-bar \{[^}]*border-radius: 12px;/.test(css) &&
			/\.oa-app \.oa-feedback-btn \{[^}]*width: 32px;[^}]*height: 32px;/.test(css) &&
			css.includes(".oa-app .oa-feedback-close-col") &&
			entry.includes("userBubbleFree") &&
			buildm.includes("dismissedSaved")
		) {
			console.log("✓ feedback banner: faithful prompt-kit shape, assistant-only gate, pick/dismiss persistence, harness follows");
		} else {
			console.error("✗ feedback-banner spec drifted");
			failed++;
		}
	}

	// 2026-08-02 v0.1.49 icon integrity: every icon name the feedback banner
	// (and its lanes) render must resolve to shim ICONS entries that contain at
	// least one <path — the sim shim used to render unknown names as silent
	// empty svgs; this declaration-level guard keeps the map honest.
	{
		const fs = require("fs");
		const path = require("path");
		const shimSrc = fs.readFileSync(
			path.join(__dirname, "real-preview", "obsidian-shim.ts"),
			"utf8",
		);
		const okIcons =
			/unknown lucide icon/.test(shimSrc) &&
			["thumbs-up", "thumbs-down", "quote"].every(
				(n) => new RegExp('["\']?' + n + '["\']?:[\\s\\S]{0,700}?<path').test(shimSrc),
			);
		if (!okIcons) {
				console.error("✗ shim icon map drifted (empty/missing glyph body)");
				failed++;
		} else {
				console.log("✓ feedback banner icons: shim map has real glyph bodies + loud unknown warning");
		}
	}
	// 2026-08-02 v0.1.50: General tab groups (owner directive) — Backup &
	// Restore holds keys-toggle/export/import; Danger Zone holds both resets;
	// headings must keep this exact order (declaration-level positions).
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "src", "settingsTab.ts"), "utf8");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const p = (n) => st.indexOf(n);
		const order =
			p('"Backup & Restore"') >= 0 &&
			p('"Backup & Restore"') < p('setName("Include API keys in exports")') &&
			p('setName("Include API keys in exports")') < p('setName("Export settings")') &&
			p('setName("Export settings")') < p('setName("Import settings")') &&
			p('setName("Import settings")') < p('"Danger Zone"') &&
			p('"Danger Zone"') < p('setName("Reset settings")') &&
			p('setName("Reset settings")') < p('setName("Reset everything")');
		if (
			order &&
			!st.includes('"Data & danger zone"') &&
			/\.oa-settings \.oa-subsection\.oa-danger-zone \.oa-subsection-title/.test(css)
		) {
			console.log("✓ general groups: Backup & Restore + Danger Zone — order + hazard tint");
		} else {
			console.error("✗ general groups drifted (order, retirement of combined heading, or tint)");
			failed++;
		}
	}
	// 2026-08-02 v0.1.51 composer action radius: ONE family. 2026-08-03
	// (v0.1.69 consolidation): the shared dated-end group is folded into the
	// base rules — attach toggle keeps 999px in its own single rule, and the
	// prompt-action base block declares 999px LAST (winner by intra-rule
	// order). Both asserted at declaration level; the empty lane still
	// measures the computed style.
	{
		const fs = require("fs");
		const path = require("path");
		const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const bm = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		if (
			css.includes(".oa-app .oa-attach-toggle { border-radius: 999px; }") &&
			/\.oa-app \.oa-prompt-action \{[\s\S]{0,700}?border-radius: 999px;/.test(css) &&
			bm.includes("composer radius check") &&
			/* v0.1.122 amended: probe berevolusi (objek multi-prop untuk
			   tint lembut + anti-kapsul) — anchor disesuaikan di tempat */
			bm.includes("cs.borderRadius")
		) {
			console.log("✓ composer action radius: one 999px family + measured in the empty lane");
		} else {
			console.error("✗ composer action radius drifted (css block or measured lane)");
			failed++;
		}
	}
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
	{
		const fs = require("fs");
		const path = require("path");
		const bs = fs.readFileSync(path.join(__dirname, "real-preview", "build-settings.mjs"), "utf8");
		const rel = fs.readFileSync(path.join(__dirname, "..", "scripts", "release.mjs"), "utf8");
		if (
			bs.includes("probes.F18") &&
			bs.includes('"H:Backup & Restore"') &&
			bs.includes("getComputedStyle(normalTitle).color") &&
			bs.includes("fixed === false") &&
			rel.includes('step("settings preview", "node", ["test/real-preview/build-settings.mjs"]')
		) {
			console.log("✓ settings pixel lane: F18 general-groups probe + red gate + wired into release");
		} else {
			console.error("✗ settings pixel lane drifted (F18, gate, or release wiring)");
			failed++;
		}
	}
	// 2026-08-02 v0.1.54 feedback → learning signal (own invention; Hermes
	// reactions are display-only): down-rated previous reply → next turn's
	// system prompt carries one reflection section (save path follows
	// memoryEnabled). Declaration anchors: prompt section, runner pass-
	// through, ChatApp prev-assistant predicate, wire recorder full system
	// content, reax wire lane, unit tests.
	{
		const fs = require("fs");
		const path = require("path");
		const sp = fs.readFileSync(path.join(__dirname, "..", "src", "agent", "systemPrompt.ts"), "utf8");
		const rn = fs.readFileSync(path.join(__dirname, "..", "src", "agent", "runner.ts"), "utf8");
		const ca = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		const ce = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		const bmj = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		const ut = fs.readFileSync(path.join(__dirname, "system-prompt.test.cjs"), "utf8");
		if (
			sp.includes("rated not helpful") &&
			rn.includes("feedbackDue: boolean = false") &&
			ca.includes("feedbackOf(prevAssistant.reaction)") &&
			ca.includes("sessionOverlay,") && ca.includes("feedbackDue,") &&
			ce.includes('m.role === "system" ? m.content') &&
			ce.includes("feedbackInNextSys") &&
			bmj.includes("savedAfterDown") &&
			ut.includes("reflection section present")
		) {
			console.log("✓ feedback→learning: prompt section + prev-assistant signal + wire lane + unit tests");
		} else {
			console.error("✗ feedback→learning wiring drifted");
			failed++;
		}
	}
	// 2026-08-02 v0.1.55 gate-hole fixes (caught live: a red reax lane rode
	// inside a "passed" release): the sim must assemble the REAL system
	// prompt (buildSystemPrompt imported, canned placeholder retired), and
	// build-preview must abort when the lane fails (no stale-frame degrade).
	{
		const fs = require("fs");
		const path = require("path");
		const ce = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		const bp = fs.readFileSync(path.join(__dirname, "build-preview.mjs"), "utf8");
		if (
			ce.includes('import { buildSystemPrompt } from "../../src/agent/systemPrompt";') &&
			ce.includes("feedbackDue,\n\t\t})") &&
			!ce.includes('"(sim system prompt)"') &&
			bp.includes("no stale frames tolerated") &&
			bp.includes("refusing the static fallback")
		) {
			console.log("✓ gate holes closed: real sim assembly + lane failure aborts preview");
		} else {
			console.error("✗ gate-hole fixes drifted");
			failed++;
		}
	}
	// 2026-08-02 v0.1.56 changed-files card (Hermes changed-files-card
	// parity; derivation pure from persisted tool parts; honest meta = last
	// landed verb ×N, no invented diff numbers). Anchors: derive module,
	// card, ChatApp mount, sim honesty (created files exist + leaf mock),
	// fcard lane in build.mjs, unit suite wired into npm test, sim modify honesty.
	{
		const fs = require("fs");
		const path = require("path");
		const cf = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "components", "changed-files.ts"), "utf8");
		const cc = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "components", "changed-files-card.tsx"), "utf8");
		const ca = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		const ce = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		const bm = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		const pk = fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8");
		const ok =
			cf.includes("export function deriveChangedFiles") &&
			cf.includes('part.status !== "done"') &&
			cc.includes("file changed") &&
			/* v0.1.121 amended: call membawa workspaceFolder (path terresolve,
			   lihat guard v0.1.121) — anchor disesuaikan di tempat */
			ca.includes("deriveChangedFiles(turn.parts, settings.workspaceFolder)") &&
			ca.includes("openChangedFile") &&
			ce.includes("simCreated.get(p)") &&
			ce.includes("modify: async (f: TFile") &&
			ce.includes("__oaFcardCheck") &&
			ce.includes('t.name === "write_note"') &&
			ce.includes("call_fc1") &&
			bm.includes("fcard check") &&
			pk.includes("changedFiles.test.cjs");
		if (ok) {
			console.log("✓ changed-files card: pure derive + ChatApp mount + honest sim + fcard lane + unit suite");
		} else {
			console.error("✗ changed-files card wiring drifted");
			failed++;
		}
	}
	// system-message port (2026-08-02, v0.1.57): prompt-kit banner parity —
	// local notices stop posing as assistant turns (persisted role "system"
	// + explicit severity); they never reach the wire (history is messagesRef)
	// and never show feedback chrome. CTA persists as data, re-attached at
	// render. Anchors: type union, component, icons, ChatApp wiring, export
	// label, sim lane + projection, build.mjs lane, CSS.
	{
		const fs = require("fs");
		const path = require("path");
		const tp = fs.readFileSync(path.join(__dirname, "..", "src", "types.ts"), "utf8");
		const sm = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "components", "system-message.tsx"), "utf8");
		const ic = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "icons.tsx"), "utf8");
		const ca = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		const ce = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		const bm = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		const sh = fs.readFileSync(path.join(__dirname, "real-preview", "obsidian-shim.ts"), "utf8");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const ok =
			tp.includes('role: "user" | "assistant" | "system"') &&
			tp.includes("noticeCta?: { label: string; openPath: string }") &&
			sm.includes("oa-sysmsg") &&
			sm.includes("AlertCircleIcon") &&
			ic.includes('make("info")') &&
			ic.includes('make("circle-alert")') &&
			ca.includes("<SystemMessage") &&
			ca.includes('role: "system"') &&
			ca.includes('"**System**:"') &&
			ce.includes("__oaSysmsgCheck") &&
			ce.includes('"sysmsg"') &&
			ce.includes("turnRoles") &&
			bm.includes("sysmsg check") &&
			sh.includes('"circle-alert":') &&
			sh.includes("\tinfo:") &&
			st.includes(".oa-sysmsg-error");
		if (ok) {
			console.log("✓ system-message port: honest system role + banner variants + CTA data + sim lane + CSS");
		} else {
			console.error("✗ system-message port wiring drifted");
			failed++;
		}
	}
	// approval preview diff + operation-aware safety classification:
	// persistent writes, destructive actions, and scheduling mutations are
	// gated in cautious mode; the gate shows a word-level diff from the SAME
	// planner the tools run; Accept writes through the tool, Deny rides the wire.
	{
		const fs = require("fs");
		const path = require("path");
		const wp = fs.readFileSync(path.join(__dirname, "..", "src", "agent", "writePreview.ts"), "utf8");
		const ts = fs.readFileSync(path.join(__dirname, "..", "src", "agent", "tools.ts"), "utf8");
		const dc = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "components", "preview-diff-core.ts"), "utf8");
		const dv = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "components", "preview-diff.tsx"), "utf8");
		const ca = fs.readFileSync(path.join(__dirname, "..", "src", "ui", "ChatApp.tsx"), "utf8");
		const ce = fs.readFileSync(path.join(__dirname, "real-preview", "chat-entry.tsx"), "utf8");
		const bm = fs.readFileSync(path.join(__dirname, "real-preview", "build.mjs"), "utf8");
		const pk = fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const ok =
			wp.includes("export function planWrite") &&
			wp.includes("export function planEdit") &&
			ts.includes("resolveWritePath") &&
			ts.includes("planEdit(args, path, content)") &&
			ts.includes('approvalKind: "persistent-write"') &&
			ts.includes('action === "delete" || action === "remove_file"') &&
			ts.includes('=== "list" ? "standard" : "scheduling"') &&
			dc.includes("diffWordsWithSpace") &&
			dc.includes("buildPreviewRows") &&
			dv.includes("oa-preview-op") &&
			ca.includes("buildApprovalPreview") &&
			ca.includes("approvalKindLabel") &&
			ca.includes("<PreviewDiff") &&
			ce.includes("__oaPreviewCheck") &&
			ce.includes('simSettings.approvalMode = "yolo"') &&
			bm.includes("preview check") &&
			pk.includes("\"diff\":") &&
			pk.includes("previewPlanner.test.cjs") &&
			st.includes(".oa-preview-added");
		if (ok) {
			console.log("✓ approvals: operation-aware kinds + shared write planner + diff card + stale guard + sim lane");
		} else {
			console.error("✗ approval preview wiring drifted");
			failed++;
		}
	}
	// styles hygiene (2026-08-02, v0.1.59, audit-driven): the changed-files
	// count chip finally has a rule; radius/color drifts normalized to the
	// certified fallbacks; four retired classes deleted with their rules.
	// Negative asserts use exact literals — names of the retired selectors
	// stay out of every comment (lesson 46).
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const ok =
			st.includes(".oa-app .oa-changed-count {") &&
			!st.includes("border-radius: 4px;") &&
			!st.includes("border-radius: var(--radius-s);") &&
			st.includes("#08b94e") &&
			!st.includes("#f87171") &&
			!st.includes(".oa-tool-icon {") &&
			!st.includes("oa-reasoning-header") &&
			!st.includes("oa-reasoning-label") &&
			!st.includes("oa-model-menu-hint");
		if (ok) {
			console.log("✓ styles hygiene: chip rule + radius/color fallbacks certified + 4 retired selector rules purged");
		} else {
			console.error("✗ styles hygiene drifted");
			failed++;
		}
	}
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
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const seen = new Map();
		const dups = new Set();
		for (const line of st.split("\n")) {
			/* column-0 only: overrides nested in @media/keyframes are
			   intentional conditional layering, not debt */
			if (!line.startsWith(".") || !line.trimEnd().endsWith("{")) continue;
			const sel = line.trim().slice(0, -1).trim();
			seen.set(sel, (seen.get(sel) ?? 0) + 1);
			if (seen.get(sel) > 1) dups.add(sel);
		}
		const FROZEN = [
			/* 2026-08-04 (v0.1.71): the last family (.oa-app shell) is
			   consolidated — 17/17 done, the list is empty. This guard
			   now exists purely to reject NEW layered debt. */
		];
		const cur = [...dups].sort().join("|");
		const want = [...FROZEN].sort().join("|");
		if (cur === want) {
			console.log(`✓ duplicate-selector guard: ${dups.size} frozen layered families, no new debt`);
		} else {
			console.error(`✗ layered selector debt changed. Now: ${cur || "(none)"} · Frozen: ${want}`);
			failed++;
		}
	}
	// chip-x merged-order guard (2026-08-03, v0.1.61) — the single
	// .oa-hub-chip-x rule must keep font-weight:600 ABOVE `font: inherit`
	// so the shorthand still wins (computed weight 400, proven identical to
	// the layered era by real-render computed-style diff). If a future edit
	// moves it below the shorthand, the × button silently turns bold.
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const sel = ".oa-hub-chip-x {";
		const start = st.indexOf("\n" + sel);
		const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
		const block = end < 0 ? "" : st.slice(start, end);
		const w = block.indexOf("\tfont-weight: 600;");
		const f = block.indexOf("\tfont: inherit;");
		const singles = st.split("\n").filter((l) => l === sel).length;
		if (start >= 0 && end >= 0 && w >= 0 && f >= 0 && w < f && singles === 1) {
			console.log("✓ chip-x merged block: single layered-free rule, font-weight above font shorthand");
		} else {
			console.error("✗ chip-x merged block drifted (order or count)");
			failed++;
		}
	}
	// reasoning-content merged-structure guard (2026-08-03, v0.1.62) —
	// the consolidated .oa-app .oa-reasoning-content rule must stay a SINGLE
	// col-0 rule carrying both former blocks' properties with the shared
	// margin-top deduplicated (visual-verified byte-identical, incl. the
	// stable moa.png disclosure shot). A re-layered second rule or a dropped
	// property fails here before any pixel can drift.
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const sel = ".oa-app .oa-reasoning-content {";
		const start = st.indexOf("\n" + sel);
		const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
		const block = end < 0 ? "" : st.slice(start, end);
		const singles = st.split("\n").filter((l) => l === sel).length;
		const mt = block.split("\n").filter((l) => l === "\tmargin-top: 5px;").length;
		if (singles === 1 && start >= 0 && end >= 0 && mt === 1
			&& block.includes("\tmax-height: 240px;") && block.includes("\tpadding-left: 2px;")
			&& block.includes("\tfont-style: italic;") && block.includes("\tline-height: 1.55;")) {
			console.log("✓ reasoning-content merged block: single rule, deduped margin-top, all props present");
		} else {
			console.error("✗ reasoning-content merged block drifted (count or props)");
			failed++;
		}
	}
	// tool-chevron merged-structure guard (2026-08-03, v0.1.63) — single
	// col-0 rule carrying display/color/flex/transition with the living
	// .is-open rotate variant right beside it (visual-verified: 3 chevrons
	// closed + 1 open rotate matrix byte-identical, fcard.png identical).
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const sel = ".oa-app .oa-tool-chevron {";
		const open = ".oa-app .oa-tool-chevron.is-open {";
		const start = st.indexOf("\n" + sel);
		const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
		const block = end < 0 ? "" : st.slice(start, end);
		const singles = st.split("\n").filter((l) => l === sel).length;
		const opens = st.split("\n").filter((l) => l === open).length;
		if (singles === 1 && opens === 1 && start >= 0 && end >= 0
			&& block.includes("\tdisplay: inline-flex;") && block.includes("\tcolor: var(--text-faint);")
			&& block.includes("\tflex: 0 0 auto;") && block.includes("\ttransition: transform 150ms ease;")) {
			console.log("✓ tool-chevron merged block: single rule, 4 props, is-open variant intact");
		} else {
			console.error("✗ tool-chevron merged block drifted (count or props)");
			failed++;
		}
	}
	// reasoning-merged guard (2026-08-03, v0.1.66; rewritten 2026-08-04 v0.1.74):
	// single rule, border-left+padding-left, font-size deduped. The
	// cot-step-body twin guard went with the ChainOfThought purge (v0.1.74)
	// — its CSS is gone on purpose, and Guard B now keeps the purge lasting.
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const blockOf = (sel) => {
			const start = st.indexOf("\n" + sel);
			const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
			return { start, end, block: end < 0 ? "" : st.slice(start, end),
				singles: st.split("\n").filter((l) => l === sel).length };
		};
		const r = blockOf(".oa-app .oa-reasoning {");
		const rOk = r.singles === 1 && r.end > 0
			&& r.block.includes("\tborder-left: 2px solid var(--background-modifier-border);")
			&& r.block.includes("\tpadding-left: 10px;")
			&& r.block.split("\n").filter((l) => l === "\tfont-size: var(--font-ui-smaller);").length === 1;
		if (rOk) {
			console.log("✓ reasoning merged block: single rule, prop order counters shorthand (cot twin retired v0.1.74)");
		} else {
			console.error("✗ reasoning merged block drifted");
			failed++;
		}
	}
	// prompt-actions + msg-content merged guards (2026-08-03, v0.1.67) —
	// both were zero-overlap layered pairs; each must stay ONE col-0 rule
	// carrying the full property set (visual-verified via ?s=convo computed
	// diff + stable shots byte-identical).
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const blockOf = (sel) => {
			const start = st.indexOf("\n" + sel);
			const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
			return { end, block: end < 0 ? "" : st.slice(start, end),
				singles: st.split("\n").filter((l) => l === sel).length };
		};
		const pa = blockOf(".oa-app .oa-prompt-actions {");
		const mc = blockOf(".oa-app .oa-msg-content {");
		const paOk = pa.singles === 1 && pa.end > 0
			&& pa.block.includes("\tdisplay: flex;") && pa.block.includes("\tgap: 5px;")
			&& pa.block.includes("\tpadding: 4px 8px 7px;") && pa.block.includes("\twidth: 100%;")
			&& pa.block.includes("\tflex-wrap: nowrap;");
		const mcOk = mc.singles === 1 && mc.end > 0
			&& mc.block.includes("\tflex-direction: column;") && mc.block.includes("\toverflow-wrap: break-word;")
			&& mc.block.includes("\tuser-select: text;") && mc.block.includes("\t-webkit-user-select: text;");
		if (paOk && mcOk) {
			console.log("✓ prompt-actions + msg-content merged blocks: single rules, full props present");
		} else {
			console.error("✗ prompt-actions/msg-content merged block drifted");
			failed++;
		}
	}
	// selbar-btn + cron-history merged guards (2026-08-03, v0.1.68) — selbar
	// keeps BOTH paddings in winning order (3px 8px above 0); cron keeps one
	// rule with the shared tabular-nums comma group left intact beside it.
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const blockOf = (sel) => {
			const start = st.indexOf("\n" + sel);
			const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
			return { end, block: end < 0 ? "" : st.slice(start, end),
				singles: st.split("\n").filter((l) => l === sel).length };
		};
		const sb = blockOf(".oa-selbar-btn {");
		const p1 = sb.block.indexOf("\tpadding: 3px 8px;");
		const p2 = sb.block.indexOf("\tpadding: 0;");
		const sbOk = sb.singles === 1 && sb.end > 0 && p1 >= 0 && p2 >= 0 && p1 < p2
			&& sb.block.includes("\twidth: 26px;") && sb.block.includes("\tborder-radius: var(--radius-s, 4px);")
			&& sb.block.includes("\tjustify-content: center;");
		const ch = blockOf(".oa-cron-history {");
		const chOk = ch.singles === 1 && ch.end > 0
			&& ch.block.includes("\tdisplay: flex;") && ch.block.includes("\toverscroll-behavior: contain;")
			&& ch.block.includes("\tfont-size: var(--font-ui-smaller);")
			&& st.includes(".oa-cron-history,\n.oa-cron-note {");
		if (sbOk && chOk) {
			console.log("✓ selbar-btn + cron-history merged blocks: padding order preserved, group intact");
		} else {
			console.error("✗ selbar-btn/cron-history merged block drifted");
			failed++;
		}
	}
	// prompt-action + hub-chip-count merged guards (2026-08-03, v0.1.69) —
	// prompt-action: ONE rule, radius declared twice with 999px LAST
	// (winner by intra-rule order, send stays a disc); attach toggle keeps
	// 999px in its own single rule. chip-count: ONE rule carrying
	// tabular-nums folded out of the numeric group (now cron pair only).
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const blockOf = (sel) => {
			const start = st.indexOf("\n" + sel);
			const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
			return { end, block: end < 0 ? "" : st.slice(start, end),
				singles: st.split("\n").filter((l) => l === sel).length };
		};
		const pa = blockOf(".oa-app .oa-prompt-action {");
		const r1 = pa.block.indexOf("\tborder-radius: var(--radius-m, 8px);");
		const r2 = pa.block.indexOf("\tborder-radius: 999px;");
		const hcc = blockOf(".oa-hub-chip-count {");
		if (pa.singles === 1 && r1 >= 0 && r2 > r1 && pa.end > 0
			&& st.includes(".oa-app .oa-attach-toggle { border-radius: 999px; }")
			&& hcc.singles === 1 && hcc.block.includes("\tfont-variant-numeric: tabular-nums;")
			&& hcc.block.includes("\tcolor: var(--text-faint);")) {
			console.log("✓ prompt-action + hub-chip-count merged: disc radius winner-last, numeric folded");
		} else {
			console.error("✗ prompt-action/hub-chip-count merged block drifted");
			failed++;
		}
	}
	// model-menu cluster merged guards (2026-08-04, v0.1.70) — all five
	// frozen families folded winner-last into their base rules: menu width
	// 300px after 270px; item flex/interface/ui-small after block/monospace/
	// ui-smaller; footer gains the column trio after border-top; footer
	// button flex-start/auto after center/32px; sibling border-left none
	// after the hairline. Computed styles proven identical by the
	// dbg-menumerge probe diff (menu scenario, real pill click).
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const blockOf = (sel) => {
			const start = st.indexOf("\n" + sel);
			const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
			return { end, block: end < 0 ? "" : st.slice(start, end),
				singles: st.split("\n").filter((l) => l === sel).length };
		};
		const mm = blockOf(".oa-app .oa-model-menu {");
		const mi = blockOf(".oa-app .oa-model-menu-item {");
		const mf = blockOf(".oa-app .oa-model-menu-footer {");
		const mb = blockOf(".oa-app .oa-model-menu-footer button {");
		const ms = blockOf(".oa-app .oa-model-menu-footer button + button {");
		const ok = mm.singles === 1 && mm.end > 0
			/* v0.1.185 amended: full-width above composer (slash-menu parity) —
			   the old 270/300px right-anchored popover is gone */
			&& mm.block.indexOf("\twidth: min(820px, calc(100% - 24px));") >= 0
			&& mm.block.indexOf("\tleft: 12px;") >= 0
			&& mm.block.indexOf("\tright: 12px;") >= 0
			&& mi.singles === 1 && mi.end > 0
			&& mi.block.indexOf("\tdisplay: block;") >= 0
			&& mi.block.indexOf("\tdisplay: flex;") > mi.block.indexOf("\tdisplay: block;")
			&& mi.block.indexOf("\tfont-size: var(--font-ui-smaller);") >= 0
			&& mi.block.indexOf("\tfont-size: var(--font-ui-small);") > mi.block.indexOf("\tfont-size: var(--font-ui-smaller);")
			&& mf.singles === 1 && mf.end > 0
			&& mf.block.indexOf("\tdisplay: flex;") >= 0
			&& mf.block.indexOf("\tflex-direction: column;") > mf.block.indexOf("\tdisplay: flex;")
			&& mb.singles === 1 && mb.end > 0
			&& mb.block.indexOf("\tjustify-content: center;") >= 0
			&& mb.block.indexOf("\tjustify-content: flex-start;") > mb.block.indexOf("\tjustify-content: center;")
			&& mb.block.indexOf("\theight: 32px;") >= 0
			&& mb.block.indexOf("\theight: auto;") > mb.block.indexOf("\theight: 32px;")
			&& ms.singles === 1 && ms.end > 0
			&& ms.block.indexOf("\tborder-left: 1px solid var(--background-modifier-border);") >= 0
			&& ms.block.indexOf("\tborder-left: none;") > ms.block.indexOf("\tborder-left: 1px solid var(--background-modifier-border);");
		if (ok) {
			console.log("✓ model-menu cluster folded: width/display/footer/button/sibling winners stay last");
		} else {
			console.error("✗ model-menu folded block drifted");
			failed++;
		}
	}
	// .oa-app shell merged guard (2026-08-04, v0.1.71) — the LAST frozen
	// family: ONE col-0 rule carries the base shell (6 props, original
	// order) with the nine isolation neutralizations folded in after the
	// font-size line. The defence-(1) banner comment stays by the reset;
	// its rule now lives at the top of the sheet.
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
		const start = st.indexOf("\n.oa-app {");
		const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
		const block = end < 0 ? "" : st.slice(start, end);
		const singles = st.split("\n").filter((l) => l === ".oa-app {").length;
		const props = ["\tposition: relative;", "\tdisplay: flex;", "\tflex-direction: column;",
			"\theight: 100%;", "\tcolor: var(--text-normal);", "\tfont-size: var(--font-ui-medium);"];
		const vars = ["--interactive-normal: transparent;", "--interactive-hover: transparent;",
			"--input-shadow: none;", "--input-shadow-hover: none;", "--input-height: auto;",
			"--input-border-width-focus: 0;", "--background-modifier-border-focus: transparent;",
			"--background-modifier-form-field: transparent;", "--background-modifier-form-field-hover: transparent;"];
		let i = -1, orderOk = true;
		for (const pr of props) { const k = block.indexOf(pr); if (k <= i) orderOk = false; i = k; }
		const fsz = block.indexOf("\tfont-size: var(--font-ui-medium);");
		const allVars = vars.every((v) => block.indexOf(v) > fsz);
		if (singles === 1 && end > 0 && orderOk && i >= 0 && allVars) {
			console.log("✓ .oa-app shell merged: single rule, 6 base props + 9 isolation vars folded in order");
		} else {
			console.error("✗ .oa-app merged block drifted");
			failed++;
		}
	}
	// ---- v0.1.72 prompt-kit audit fixes (2026-08-04) — B1: the chat
	// container must observe RESIZE (not only mutations) so silent growth
	// keeps the pinned view at the bottom (+ official role="log"); B2: the
	// contenteditable composer must hold both its chip-sync AND its Enter
	// handling while an IME composition is active. Live lanes: build.mjs
	// convo (resize pin) + empty (composing Enter suppressed).
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const chat = read("../src/ui/components/chat-container.tsx");
		const pin = read("../src/ui/components/prompt-input.tsx");
		const ok =
			chat.includes("new ResizeObserver(") &&
			chat.includes('role="log"') &&
			pin.includes("isComposing") &&
			pin.includes("onCompositionEnd");
		if (ok) {
			console.log("✓ v0.1.72: resize-observer stick-to-bottom + IME composition guards wired");
		} else {
			console.error("✗ v0.1.72 prompt-kit audit fixes drifted (RO/role or IME guard lost)");
			failed++;
		}
	}
	// ---- v0.1.73 prompt-kit audit polish (2026-08-04) — B3: frame click
	// focuses the composer (button clicks untouched); B4: ScrollButton kept
	// mounted with is-hidden fade + pointer-events gating; B5: shimmer band
	// faithful to official (50% ± spread, never halved); B6: ComposerHandle
	// caret API honest (setCaret, no false-range setSelectionRange).
	// Live lanes: build.mjs empty (frame click) + convo (scroll-button fade).
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const pin = read("../src/ui/components/prompt-input.tsx");
		const sb = read("../src/ui/components/scroll-button.tsx");
		const css = read("../styles.css");
		const app = read("../src/ui/ChatApp.tsx");
		const ok =
			pin.includes('closest("button")') &&
			sb.includes("is-hidden") &&
			css.includes(".oa-app .oa-scroll-button.is-hidden {") &&
			css.includes("transition: opacity 150ms ease, transform 150ms ease;") &&
			css.includes("calc(50% - var(--shimmer-spread, 20%))") &&
			css.includes("calc(50% + var(--shimmer-spread, 20%))") &&
			!css.includes("(var(--shimmer-spread, 20%) / 2)") &&
			pin.includes("setCaret(") && !pin.includes("setSelectionRange") &&
			app.includes("setCaret(") && !app.includes("setSelectionRange");
		if (ok) {
			console.log("✓ v0.1.73: frame-focus + mounted scroll-button + faithful shimmer + honest caret API");
		} else {
			console.error("✗ v0.1.73 prompt-kit audit polish drifted");
			failed++;
		}
	}
	/* v0.1.75 — candidate ③ editor context menu: thin Obsidian glue
	   (editorMenu.ts) → ChatView sink → ChatApp api. Guards: bridge files
	   wired, chip label honest (full path + L-range, hyphen — Copilot
	   vocabulary), one-shot arm single-sourced (ONE skillContextRef write),
	   menu feature-detects the untyped submenu runtime API with a flat
	   fallback, three polite Notice guards present, settings toggle gates
	   live, and the sim lane drives the sink directly. */
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const chatApi = read("../src/ui/chatApi.ts");
		const glue = read("../src/editorMenu.ts");
		const app2 = read("../src/ui/ChatApp.tsx");
		const view = read("../src/ui/ChatView.tsx");
		const mainTs = read("../src/main.ts");
		const settings = read("../src/settings.ts");
		const tab = read("../src/settingsTab.ts");
		const entry = read("real-preview/chat-entry.tsx");
		const build = read("real-preview/build.mjs");
		const armWrites = app2.split("skillContextRef.current = `[Skill: ").length - 1;
		const ok =
			chatApi.includes("export interface ChatApiSink") &&
			chatApi.includes("pending: Array<(api: ChatApi) => void>") &&
			chatApi.includes("dispatchToChatApi") &&
			app2.includes("chatApiSink?: ChatApiSink;") &&
			app2.includes("sink.current = api;") &&
			app2.includes("sink.pending.length = 0;") &&
			app2.includes("L${p.fromLine}-${p.toLine}") &&
			app2.includes("apiAttachSelection = useCallback") &&
			app2.includes("apiQuoteSelectionForAsk = useCallback") &&
			app2.includes("apiRunSkillOnSelection = useCallback") &&
			armWrites === 1 &&
			view.includes("attachSelectionFromEditor") &&
			view.includes("quoteSelectionFromEditor") &&
			view.includes("runSkillOnSelectionFromEditor") &&
			view.includes("chatApiSink.pending.length = 0;") &&
			glue.includes('"editor-menu"') &&
			glue.includes("plugin.settings.editorContextMenu") &&
			glue.includes("setSubmenu") &&
			glue.includes('"Open Agent: "') &&
			glue.includes("setDisabled(!hasSelection)") &&
			glue.includes("Open Agent: no text selected.") &&
			glue.includes("Open Agent: could not determine the selection range.") &&
			glue.includes("Open Agent: no active file.") &&
			glue.includes("FuzzySuggestModal") &&
			glue.includes("Math.min(a, h) + 1") &&
			mainTs.includes("registerEditorContextMenu(this);") &&
			settings.includes("editorContextMenu: boolean") &&
			settings.includes("editorContextMenu: true") &&
			tab.includes('"Editor context menu"') &&
			entry.includes("__oaChatApiSink") &&
			entry.includes('scenarioParam() === "empty"') &&
			build.includes("editor bridge lane");
		if (ok) {
			console.log("✓ v0.1.75: editor context menu — sink bridge + honest chip label + arm single-sourced + submenu feature-detect + live toggle");
		} else {
			console.error("✗ v0.1.75 editor context-menu wiring drifted");
			failed++;
		}
	}
	/* v0.1.76 — context-menu settings depth (owner: "tambah settingannya
	   (dan custom)"): A) granular per-action switches gated at menu-open
	   time; B) SKILL.md `contextMenu: false` hides a skill from the
	   Run-skill picker (Copilot showInContextMenu parity); C) snippets
	   flagged via the new row button join the menu as custom actions —
	   composer gets snippet text + quoted selection (no {} substitution). */
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const glue = read("../src/editorMenu.ts");
		const app3 = read("../src/ui/ChatApp.tsx");
		const view2 = read("../src/ui/ChatView.tsx");
		const chatApi2 = read("../src/ui/chatApi.ts");
		const settings3 = read("../src/settings.ts");
		const skills3 = read("../src/agent/skills.ts");
		const tab3 = read("../src/settingsTab.ts");
		const build3 = read("real-preview/build.mjs");
		const ok =
			settings3.includes("editorContextMenuAdd: boolean") &&
			settings3.includes("editorContextMenuAsk: boolean") &&
			settings3.includes("editorContextMenuSkill: boolean") &&
			settings3.includes("editorContextMenuAdd: true") &&
			settings3.includes("ctxMenu?: boolean") &&
			settings3.includes("r.ctxMenu === true ? { ctxMenu: true }") &&
			glue.includes("st.editorContextMenuAdd") &&
			glue.includes("st.editorContextMenuAsk") &&
			glue.includes("st.editorContextMenuSkill") &&
			glue.includes("sn.ctxMenu === true") &&
			glue.includes("addSeparator()") &&
			glue.includes("sk.ctxMenu !== false") &&
			glue.includes("no skills available for the context menu") &&
			skills3.includes("ctxMenu: meta.contextMenu !== false") &&
			chatApi2.includes("runSnippetOnSelection: (lead: string, p: SelectionPayload) => void") &&
			app3.includes("apiRunSnippetOnSelection = useCallback") &&
			app3.includes("runSnippetOnSelection: apiRunSnippetOnSelection") &&
			view2.includes("runSnippetOnSelectionFromEditor") &&
			tab3.includes('"Context menu: Add selection to chat"') &&
			tab3.includes('"Context menu: Ask about selection"') &&
			tab3.includes('"Context menu: Run skill on selection"') &&
			/* v0.1.77 relocation: the v0.1.76 row icon button graduated into
			   the real In Menu toggle (Commands tab); v0.1.155 moved those
			   toggles into the edit modal — the literal moves again, the
			   contract (flag written only when on) does not */
			read("../src/settings/modals/snippet.ts").includes("const mkSurface =") &&
			build3.includes("Translate ke Inggris:") &&
			build3.includes("cr.snipOk");
		if (ok) {
			console.log("✓ v0.1.76: granular menu switches + per-skill contextMenu flag + snippet custom actions wired");
		} else {
			console.error("✗ v0.1.76 context-menu settings depth drifted");
			failed++;
		}
	}
	/* v0.1.77 — Commands settings tab (owner: mirror Copilot's command
	   settings experience, model stays global; slash in composer vs menu
	   in editor are DIFFERENT surfaces). Guards: section registered, the
	   four editor-menu switches moved here, the custom-command table has
	   Copilot's columns (order arrows · In Menu · Slash · actions), new
	   commands start visible on both surfaces, snippets flagged `slash`
	   stage via the composer's Snippets group, agent tab keeps only a
	   relocation pointer. */
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const tab4 = read("../src/settingsTab.ts");
		const settings4 = read("../src/settings.ts");
		const app4 = read("../src/ui/ChatApp.tsx");
		const entry4 = read("real-preview/chat-entry.tsx");
		const build4 = read("real-preview/build.mjs");
		const css4 = read("../styles.css");
		const ok =
			tab4.includes('{ key: "command", label: "Commands", icon: "terminal-square" },') &&
			tab4.includes('command: "Preset prompts and editor right-click actions') &&
			tab4.includes("private command(") &&
			tab4.includes("renderCommandRows") &&
			tab4.includes('"Enable editor context menu"') &&
			tab4.includes('"Context menu: Add selection to chat"') &&
			read("../src/settings/modals/snippet.ts").includes("const mkSurface =") &&
			read("../src/settings/modals/snippet.ts").includes('"Where this shows"') &&
			read("../src/settings/modals/snippet.ts").includes('"In Menu"') &&
			tab4.includes('"Restore defaults"') &&
			tab4.includes('"Add command"') &&
			tab4.includes("copy-plus") &&
			tab4.includes("Shows in:") &&
			tab4.includes("Not shown anywhere") &&
			tab4.includes("live in the Commands tab now") &&
			tab4.includes('agent: "Chat behaviour: personality and session storage."') && // v0.1.191 amended: "iteration cap" moved to Advanced; desc follows the rows
			!tab4.includes("renderSnippetRows") &&
			settings4.includes("slash?: boolean") &&
			settings4.includes("r.slash === true ? { slash: true }") &&
			app4.includes('group: "Snippets"') &&
			app4.includes("sn.slash === true") &&
			app4.includes("const snippetSlug = ") &&
			app4.includes("fill: sn.text") &&
			css4.includes(".oa-snippet-surfaces") &&
			!css4.includes(".oa-cmd-flags") &&
			css4.includes(".oa-cmd-order") &&
			entry4.includes("snip-lane-1") &&
			entry4.includes("snipGroupOk") &&
			build4.includes("snipGroupOk") &&
			build4.includes("Snippets group + fill");
		if (ok) {
			console.log("✓ v0.1.77: Commands settings tab — surfaces in the edit modal + order + actions; Snippets slash group stages full prompt");
		} else {
			console.error("✗ v0.1.77 Commands tab wiring drifted");
			failed++;
		}
	}
	/* v0.1.78 — Copilot prompt tokens (owner ask: form tips for {} /
	   {[[]]} / {activeNote} / {#tags}; tips without behavior would be
	   dishonest UI, so the placeholders resolve for real): pure extractor
	   module, runAgent send-time resolution riding the at-refs attach
	   pipeline, editor bridge {} inline substitution, modal tips block,
	   lane coverage on all five behaviors. */
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const pt = read("../src/agent/promptTokens.ts");
		const app5 = read("../src/ui/ChatApp.tsx");
		const tab5 = read("../src/settingsTab.ts");
		const css5 = read("../styles.css");
		const entry5 = read("real-preview/chat-entry.tsx");
		const build5 = read("real-preview/build.mjs");
		const count5 = (src, needle) => src.split(needle).length - 1;
		const ok =
			pt.includes("export function extractPromptTokens") &&
			pt.includes("export function noteMatchesWantedTags") &&
			pt.includes("export function resolveTitleToPath") &&
			pt.includes("/\\{activeNote\\}/gi") &&
			pt.includes("export function normalizePropertyTags") &&
			app5.includes('import { extractPromptTokens, noteMatchesWantedTags, resolveTitleToPath } from "../agent/promptTokens";') &&
			app5.includes("extractPromptTokens(rawPrompt, liveSelection") &&
			app5.includes("workspace.getActiveFile()") &&
			app5.includes("metadataCache.getFileCache(f)?.frontmatter") &&
			app5.includes("couldn't resolve prompt token") &&
			app5.includes("matched ${matched.length} notes — attached the first ${room} (cap 24)") &&
			app5.includes("const attachList = [...effFiles, ...tokenFiles, ...atFiles];") &&
			app5.includes("text: displayText ?? promptText") &&
			count5(app5, "extractAtRefs(promptText)") === 1 &&
			!app5.includes("extractAtRefs(rawPrompt)") &&
			app5.includes('lead.includes("{}")') &&
			count5(app5, "new Set([...effFiles, ...tokenFiles]") === 1 &&
			app5.includes("!alreadyNamed.has(active.path) && !attachNote") &&
			entry5.includes("skipExact") &&
			entry5.includes("Detach note") &&
			build5.includes("no-double-attach") &&
			read("../src/settings/modals/snippet.ts").includes("oa-snippet-tips") &&
			read("../src/settings/modals/snippet.ts").includes('"{[[Note Title]]} represents a note."') &&
			read("../src/settings/modals/snippet.ts").includes("{#tag1, #tag2} represents ALL notes with ANY of the specified tags in their property") &&
			read("../src/settings/modals/snippet.ts").includes('"{} represents the selected text."') &&
			css5.includes(".oa-snippet-tips-line") &&
			entry5.includes("simTokenSeed") &&
			entry5.includes('s === "token"') &&
			entry5.includes("__oaTokenCheck") &&
			entry5.includes("Ringkas:\\n{}") &&
			build5.includes('"slash3", "token"') &&
			build5.includes("__oaTokenCheck") &&
			build5.includes("OR-expand") &&
			build5.includes("composer pristine");
		if (ok) {
			console.log("✓ v0.1.78: prompt tokens {} {[[]]} {activeNote} {#tags} resolve for real · modal tips block · editor {} inline vs quote");
		} else {
			console.error("✗ v0.1.78 prompt-token wiring drifted");
			failed++;
		}
	}
	/* v0.1.79 — picker toggle (owner: "ada yang kelupaan, toggle on/off
	   tampil di prompt snippet seperti In Menu/Slash"): the composer [+]
	   "Prompt snippets…" picker is the ONE opt-out surface — `picker:false`
	   hides while absence stays visible (skills'-flag pattern, old vaults
	   never lose rows); the Commands table gains its third toggle; sanitize
	   never drops an explicit hide; stale "Settings → Agent" pointers die. */
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const st6 = read("../src/settings.ts");
		const tab6 = read("../src/settingsTab.ts");
		const app6 = read("../src/ui/ChatApp.tsx");
		const menu6 = read("../src/ui/attach/attach-menu.tsx");
		const entry6 = read("real-preview/chat-entry.tsx");
		const build6 = read("real-preview/build.mjs");
		const count6 = (src, needle) => src.split(needle).length - 1;
		const ok =
			st6.includes("picker?: boolean") &&
			st6.includes("r.picker === false ? { picker: false }") &&
			read("../src/settings/modals/snippet.ts").includes('mkSurface("Snippets (+ menu)"') &&
			tab6.includes("snip.picker !== false") &&
			read("../src/settings/modals/snippet.ts").includes("if (!this.pickerShown) out.picker = false") &&
			tab6.includes("[+] picker") &&
			app6.includes(".filter((sn) => sn.picker !== false)") &&
			menu6.includes("Snippets toggle in Settings → Commands") &&
			!menu6.includes("Settings → Agent") &&
			entry6.includes("__oaSnipsCheck") &&
			entry6.includes("Tersembunyi Mana") &&
			count6(entry6, "picker: false") === 1 &&
			build6.includes("__oaSnipsCheck") &&
			build6.includes('"2 saved"');
		if (ok) {
			console.log("✓ v0.1.79: Snippets toggle (opt-out) — picker filters picker:false · third Commands column · stale pointers swept");
		} else {
			console.error("✗ v0.1.79 picker-toggle wiring drifted");
			failed++;
		}
	}
	/* v0.1.80 — Hermes clarify tool (owner pick: clarifying questions
	   dulu; source-diporkan dari tools/clarify_tool.py @ aec3318, notes
	   docs/studies/hermes-clarify-tool.md): schema+envelope parity, platform
	   callback = requestClarify event (approval-class pause), kartu 3
	   mode + Other + Skip, toolset "clarify" default ON. */
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const tools7 = read("../src/agent/tools.ts");
		const loop7 = read("../src/agent/agentLoop.ts");
		const st7 = read("../src/settings.ts");
		const tab7 = read("../src/settingsTab.ts");
		const app7 = read("../src/ui/ChatApp.tsx");
		const css7 = read("../styles.css");
		const entry7 = read("real-preview/chat-entry.tsx");
		const build7 = read("real-preview/build.mjs");
		const ok =
			tools7.includes('name: "clarify"') &&
			tools7.includes('toolset: "clarify",') &&
			tools7.includes("CLARIFY_MAX_CHOICES = 4") &&
			tools7.includes("export function flattenClarifyChoice") &&
			tools7.includes('["label", "description", "text", "title"]') &&
			tools7.includes("not available in this execution context") &&
			tools7.includes("choices_offered") &&
			tools7.includes("user_response") &&
			tools7.includes("clarifyTool,") &&
			loop7.includes("requestClarify?: ClarifyHandler") &&
			loop7.includes("clarify: events.requestClarify,") && // v0.1.135 amended: panggilan execute jadi multi-line (delegateProgress+signal ikut dilewatkan)
			st7.includes("clarify: boolean;") &&
			st7.includes("automations: true,") && st7.includes("clarify: true,") &&
			tab7.includes('key: "clarify"') &&
			app7.includes("requestClarify: (req) =>") &&
			app7.includes("clarifyRef.current = pendingClarify;") &&
			app7.includes("setClarify(pendingClarify);") &&
			app7.includes("setClarify(null);") &&
			app7.includes("function ClarifyCard") &&
			app7.includes("Other (type your answer)") &&
			app7.includes("The user skipped this question. Use your best judgement") &&
			app7.includes("oa-clarify-skip") &&
			css7.includes(".oa-clarify-choice") &&
			entry7.includes('s === "clfy"') &&
			entry7.includes('t.name === "clarify"') &&
			entry7.includes("startsWith('{\"question\"')") &&
			entry7.includes("clarifyCall(") &&
			entry7.includes("SIP-SELESAI") &&
			entry7.includes("__oaClfyCheck") &&
			build7.includes("__oaClfyCheck") &&
			build7.includes('"webe", "clfy"') &&
			build7.includes("skip=best-judgement");
		if (ok) {
			console.log("✓ v0.1.80: clarify tool — Hermes schema/envelope parity · requestClarify pause · 3-mode card + Other + Skip · toolset ON");
		} else {
			console.error("✗ v0.1.80 clarify wiring drifted");
			failed++;
		}
	}
	/* v0.1.81 — Quick Ask (Copilot overlay parity): floating CM6 panel
	   above the selection; ports: anchors (line-start trap), persistent
	   highlight factory, mapPos ReplaceGuard (7 reasons), ViewPlugin,
	   controller. Tools OFF + first-turn <selected_text> + system prompt
	   verbatim; Copy/Insert/Replace; source-mode gate; settings toggle. */
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const anchors = read("../src/quickask/anchors.ts");
		const hl = read("../src/quickask/highlight.ts");
		const rg = read("../src/quickask/replaceGuard.ts");
		const ext = read("../src/quickask/extension.ts");
		const ctrl = read("../src/quickask/controller.ts");
		const ovl = read("../src/quickask/overlay.ts");
		const pnl = read("../src/quickask/panel.tsx");
		const main8 = read("../src/main.ts");
		const em8 = read("../src/editorMenu.ts");
		const st8 = read("../src/settings.ts");
		const tab8 = read("../src/settingsTab.ts");
		const css8 = read("../styles.css");
		const entry8 = read("real-preview/chat-entry.tsx");
		const build8 = read("real-preview/build.mjs");
		const ok =
			anchors.includes("computeSelectionAnchors") &&
			anchors.includes("mapQuickAskAnchorPositions") &&
			anchors.includes("doc.lineAt(bottomPos).from === bottomPos") &&
			hl.includes("createPersistentHighlight(className: string)") &&
			hl.includes("StateEffect.appendConfig.of(extension)") &&
			rg.includes("createMapPosReplaceGuard") &&
			rg.includes('"content_changed"') &&
			rg.includes('"leaf_changed"') &&
			rg.includes("Selection content has changed. Please reselect and try again.") &&
			ext.includes("quickAskWidgetEffect = StateEffect.define") &&
			ext.includes("guard.onDocChanged(update.changes)") &&
			ext.includes("schedulePanelRerender") &&
			ctrl.includes('createPersistentHighlight("oa-quickask-highlight")') &&
			ctrl.includes("view.state.doc.sliceString(selection.from, selection.to)") &&
			ctrl.includes("class QuickAskController") &&
			ctrl.includes("isOpen(): boolean") &&
			ovl.includes("createRoot(container)") &&
			ovl.includes("placementSide") &&
			ovl.includes("view.coordsAtPos(pos)") &&
			pnl.includes("QUICK_COMMAND_SYSTEM_PROMPT") &&
			pnl.includes("<selected_text>") &&
			pnl.includes("Replace selection") &&
			pnl.includes("Insert at cursor") &&
			pnl.includes('"Open Agent: Replaced"') &&
			pnl.includes("You are an AI assistant designed to execute user instructions") &&
			main8.includes("quickAskFromEditor(): void") &&
			main8.includes("Quick Ask is not available in source mode.") &&
			main8.includes("could not access the CodeMirror editor.") &&
			main8.includes("registerEditorExtension(this.quickAsk.createExtension())") &&
			main8.includes('id: "openagent-quick-ask"') &&
			main8.includes("chatCompletion(t.provider, { ...s, activeProviderId: t.provider.id") && /* bentuk panggilan diubah v0.1.92 (retry/failover); sisa kontrak v0.1.81 tak berubah */
			em8.includes("Quick Ask (floating panel)") &&
			st8.includes("editorContextMenuQuickAsk: boolean;") &&
			st8.includes("editorContextMenuQuickAsk: true,") &&
			tab8.includes("Context menu: Quick Ask (floating panel)") &&
			css8.includes(".oa-quickask-panel") &&
			entry8.includes('s === "qask"') &&
			entry8.includes("__oaQaskCheck") &&
			build8.includes("__oaQaskCheck") &&
			build8.includes('"qask"');
		if (ok) {
			console.log("✓ v0.1.81: Quick Ask — CM6 overlay panel · anchors+highlight+ReplaceGuard ports · Copy/Insert/Replace · source-mode gate · toggle");
		} else {
			console.error("✗ v0.1.81 Quick Ask wiring drifted");
			failed++;
		}
	}
	/* v0.1.82 — Quick Ask panel rebuilt on the prompt-kit component ports
	   (owner ask 2026-08-05: "kalau prompt-kit bisa diterapkan akan lebih
	   mantap"): same visual family as the chat — ChatContainer stick-to-
	   bottom + ScrollButton, Message/MessageActions/CopyAction hover
	   actions, Markdown for final answers (pre-wrap while streaming),
	   Loader typing, PromptInputAction send/stop, suggestion chips that
	   only FILL the input. app/component threaded overlay→controller→main
	   for MarkdownRenderer. */
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const pnl9 = read("../src/quickask/panel.tsx");
		const ovl9 = read("../src/quickask/overlay.ts");
		const ctl9 = read("../src/quickask/controller.ts");
		const main9 = read("../src/main.ts");
		const css9 = read("../styles.css");
		const entry9 = read("real-preview/chat-entry.tsx");
		const ok =
			pnl9.includes("ChatContainer") &&
			pnl9.includes("CopyAction") &&
			pnl9.includes("MessageActions") &&
			pnl9.includes('<Markdown app={options.app} component={options.component}>') &&
			pnl9.includes('<Loader variant="typing" size="sm"') &&
			pnl9.includes("PromptInputAction") &&
			pnl9.includes("oa-quickask-sug") &&
			pnl9.includes("SUGGESTIONS_WITH_SELECTION") &&
			pnl9.includes('aria-label="Replace selection"') &&
			ovl9.includes("component: Component;") &&
			ctl9.includes("component: Component;") &&
			ctl9.includes("app: App;") &&
			main9.includes("component: this,") &&
			css9.includes(".oa-quickask .oa-msg-action {") &&
			css9.includes(".oa-quickask .oa-prompt-action.oa-prompt-action-primary") &&
			css9.includes(".oa-quickask .oa-loader-typing span {") &&
			css9.includes(".oa-quickask-body .oa-chat-scroll") &&
			entry9.includes("Component as ShimComponent") &&
			entry9.includes('".oa-quickask .oa-msg-assistant"') &&
			entry9.includes('aria-label="Replace selection"');
		if (ok) {
			console.log("✓ v0.1.82: Quick Ask × prompt-kit — ChatContainer · Message/CopyAction · Markdown finals · typing Loader · composer actions · suggestion chips");
		} else {
			console.error("✗ v0.1.82 quick-ask prompt-kit wiring drifted");
			failed++;
		}
	}
	/* v0.1.83 — quick-ask composer dirapikan = cermin composer chat utama
	   (owner: "oa-quickask-composer kurang rapi … send button match dengan
	   main chat ui"): kolom input→actions-row (bukan float kanan), send =
	   ArrowUp 16 primary dengan adaptive icon + hover brightness(0.92) +
	   disabled disc netral inert, Stop = square variant danger. */
	{
		const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
		const pnl10 = read("../src/quickask/panel.tsx");
		const css10 = read("../styles.css");
		const ok =
			pnl10.includes("ArrowUpIcon size={16}") &&
			pnl10.includes('variant="danger"') &&
			!pnl10.includes("SendIcon") &&
			css10.includes(".oa-quickask-composer-actions {") &&
			css10.includes("justify-content: flex-end;") &&
			css10.includes(".oa-quickask .oa-prompt-action.oa-prompt-action-primary:hover:not(:disabled)") &&
			css10.includes(".oa-quickask .oa-prompt-action.oa-prompt-action-primary:disabled") &&
			css10.includes("oklch(from var(--interactive-accent)") &&
			css10.includes(".oa-quickask .oa-prompt-action-danger {") &&
			css10.includes("rgba(var(--color-red-rgb, 248 81 73), 0.12)");
		if (ok) {
			console.log("✓ v0.1.83: quick-ask composer = main-chat mirror — actions row, arrow-up adaptive send, danger stop, inert disabled disc");
		} else {
			console.error("✗ v0.1.83 composer mirror drifted");
			failed++;
		}
	}
	/* v0.1.84 — quick-ask icon sizing fix (owner: "close button tidak square,
	   iconnya tidak ditengah, send button icon juga tidak ditengah"): akar
	   masalah = kontrak <Icon> (span punya ukuran, svg setIcon ngisi 100%)
	   dulu di-scope ke .oa-app padahal panel quick ask + settings hidup di
	   luarnya → span inline mengabaikan width/height dan glyph 24×24 asli
	   membesar + nangkring di baseline. Guard: rule .oa-icon harus UNSCOPED,
	   close button square 24×24 padding 0. Geometri nyata (offsetWidth, svg
	   bounding box) dikunci di lane qask real-preview. */
	{
		const css11 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const sd11 = fs.readFileSync(path.join(__dirname, "../src/ui/Icon.tsx"), "utf8");
		const closeBlk = (css11.match(/\.oa-quickask-close \{[\s\S]*?\n}/) || [""])[0];
		const pnl11 = fs.readFileSync(path.join(__dirname, "../src/quickask/panel.tsx"), "utf8");
		const ok =
			css11.includes("\n.oa-icon {") &&
			css11.includes("\n.oa-icon > svg {") &&
			!css11.includes(".oa-app .oa-icon {") &&
			!css11.includes(".oa-app .oa-icon > svg {") &&
			/* v0.1.100 (owner: "samakan dengan oa-icon-btn") — chrome close
			   pindah ke .oa-icon-btn (28×28); blok close tinggal layout */
			!closeBlk.includes("width: 24px;") &&
			closeBlk.includes("margin-left: auto;") &&
			pnl11.includes('className="oa-quickask-close oa-icon-btn"') &&
			sd11.includes("setIcon(ref.current, name)") &&
			sd11.includes("style={{ width: size, height: size }}");
		if (ok) {
			console.log("✓ v0.1.84/100: .oa-icon kontrak unscoped · quick-ask close = chrome oa-icon-btn");
		} else {
			console.error("✗ v0.1.84 icon-sizing contract drifted");
			failed++;
		}
	}
	/* v0.1.85 — Quick Ask suggestion chips customizable via prompt snippets
	   (owner: "suggestion, di quickask apakah bisa di custom juga seperti
	   prompt snippet?"): flag opt-in keempat `quickAsk` pada PromptSnippet
	   (shape persis ctxMenu/slash), toggle keempat di baris Settings →
	   Commands, chips panel = snippet flagged (judul = chip, klik = stage text
	   ke input), built-in jadi fallback saat tak ada yang flagged. Getter
	   live di deps controller → toggle langsung kebaca di open berikutnya. */
	{
		const st12 = fs.readFileSync(path.join(__dirname, "../src/settings.ts"), "utf8");
		const tab12 = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const ctl12 = fs.readFileSync(path.join(__dirname, "../src/quickask/controller.ts"), "utf8");
		const ovl12 = fs.readFileSync(path.join(__dirname, "../src/quickask/overlay.ts"), "utf8");
		const pnl12 = fs.readFileSync(path.join(__dirname, "../src/quickask/panel.tsx"), "utf8");
		const main12 = fs.readFileSync(path.join(__dirname, "../src/main.ts"), "utf8");
		const ok =
			st12.includes("quickAsk?: boolean;") &&
			st12.includes("...(r.quickAsk === true ? { quickAsk: true } : {}),") &&
			fs.readFileSync(path.join(__dirname, "../src/settings/modals/snippet.ts"), "utf8").includes('mkSurface("Quick Ask"') &&
			fs.readFileSync(path.join(__dirname, "../src/settings/modals/snippet.ts"), "utf8").includes("if (this.quickAsk) out.quickAsk = true") &&
			ctl12.includes("getSuggestions: () => QuickAskSuggestion[];") &&
			ctl12.includes("suggestions: this.deps.getSuggestions(),") &&
			ovl12.includes("suggestions: QuickAskSuggestion[];") &&
			pnl12.includes("options.suggestions.length > 0") &&
			pnl12.includes("SUGGESTIONS_WITH_SELECTION") && /* fallback stays */
			pnl12.includes("{sug.label}") &&
			pnl12.includes("setInput(sug.text);") &&
			main12.includes("getSuggestions: () =>") &&
			main12.includes(".filter((sn) => sn.quickAsk === true)") &&
			main12.includes("{ label: sn.title, text: sn.text }");
		if (ok) {
			console.log("✓ v0.1.85: Quick Ask chips = snippet flagged quickAsk (toggle ke-4 · getter live · built-in fallback)");
		} else {
			console.error("✗ v0.1.85 quick-ask custom chips wiring drifted");
			failed++;
		}
	}
	/* v0.1.86 — chip row Quick Ask jadi baris scroll horizontal (owner:
	   "buat jadi baris scroll aja"): berapapun snippet yang di-flag tidak
	   membuat panel membesar — nowrap + overflow-x auto, chip flex:none,
	   scrollbar tipis transparan. Geometri overflow dikunci di lane qask. */
	{
		const css13 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const sugsBlk = (css13.match(/\.oa-quickask-sugs \{[\s\S]*?\n}/) || [""])[0];
		const sugBlk = (css13.match(/\.oa-quickask-sug \{[\s\S]*?\n}/) || [""])[0];
		const lane13 = fs.readFileSync(path.join(__dirname, "real-preview/chat-entry.tsx"), "utf8");
		const ok =
			sugsBlk.includes("flex-wrap: nowrap;") &&
			sugsBlk.includes("overflow-x: auto;") &&
			sugBlk.includes("flex: none;") &&
			css13.includes(".oa-quickask-sugs::-webkit-scrollbar-thumb") &&
			lane13.includes("chipsScrollRow") &&
			lane13.includes("chipsOverflow") &&
			lane13.includes("chipsAllPresent");
		if (ok) {
			console.log("✓ v0.1.86: quick-ask chip row = horizontal scroll (nowrap · overflow-x auto · flex:none · thin scrollbar)");
		} else {
			console.error("✗ v0.1.86 chip scroll row drifted");
			failed++;
		}
	}
	/* v0.1.87 — Quick Ask contract audit (kontrak ~/skills yang baru dipoles):
	   semua state & surface diperiksa. Temuan+fix: textarea aria-label;
	   actions reveal tak lagi hover-only (focus-within + coarse-pointer
	   media); error turn gagal jadi baris inline role=alert + pertanyaan
	   kembali ke input; overscroll contain (panel & chip row); layer
	   prefers-reduced-motion GLOBAL pertama; region quickask diverifikasi
	   0 hex literal (light/dark aman by-construction). Geometri kasar-
	   pointer & fase gagal/retry dikunci di lane qask (build.mjs emulasi
	   pointer:coarse). */
	{
		const css14 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const pnl14 = fs.readFileSync(path.join(__dirname, "../src/quickask/panel.tsx"), "utf8");
		const bld14 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const r0 = css14.indexOf(".oa-quickask-panel");
		const r1 = css14.indexOf("REDUCED MOTION");
		const region = r0 >= 0 && r1 > r0 ? css14.slice(r0, r1) : "";
		const ok =
			pnl14.includes("role=\"alert\"") &&
			pnl14.includes("setInput(text);") &&
			pnl14.includes("setFailure(null);") &&
			pnl14.includes('aria-label={hasSelection ? "Ask about the selection"') &&
			pnl14.includes("oa-quickask-error") &&
			css14.includes(".oa-quickask .oa-msg:focus-within .oa-msg-actions") &&
			css14.includes("@media (hover: none), (pointer: coarse)") &&
			css14.includes("@media (prefers-reduced-motion: reduce)") &&
			css14.includes("overscroll-behavior: contain;") &&
			css14.includes("overscroll-behavior-x: contain;") &&
			region.length > 0 &&
			!/#[0-9a-fA-F]{3,6}\b/.test(region) &&
			bld14.includes("setTouchEmulationEnabled") &&
			bld14.includes("coarseActionsVisible");
		if (ok) {
			console.log("✓ v0.1.87: quick-ask contract audit — aria textarea · reveal focus/touch · error inline+retry · overscroll · reduced-motion layer · 0 hex");
		} else {
			console.error("✗ v0.1.87 quick-ask audit follow-ups drifted");
			failed++;
		}
	}
	/* v0.1.88 → DIAMENDEMEN v0.1.91 — Quick Ask drag saja. Kontrak asli
	   memuat resize (grip pojok + keyboard); owner 2026-08-06: "tidak
	   lazim, di copilot grip itu untuk MOVE" → resize DIHAPUS (v0.1.91),
	   guard ini menyisakan kontrak drag yang masih berlaku: head handle
	   (filter ×), detach re-anchor, userPos writeback clamp hasil drag. */
	{
		const ovl15 = fs.readFileSync(path.join(__dirname, "../src/quickask/overlay.ts"), "utf8");
		const pnl15 = fs.readFileSync(path.join(__dirname, "../src/quickask/panel.tsx"), "utf8");
		const css15 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const ent15 = fs.readFileSync(path.join(__dirname, "real-preview/chat-entry.tsx"), "utf8");
		const bld15 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			ovl15.includes("beginDrag(ev: PointerEvent)") &&
			ovl15.includes("this.userPos = { left: dLeft, top: dTop };") &&
			pnl15.includes("beginDrag(e.nativeEvent)") &&
			css15.includes("cursor: grab;") &&
			ent15.includes("detachedOnScroll") &&
			ent15.includes("dragMoved") &&
			bld15.includes("dragOk");
		if (ok) {
			console.log("✓ v0.1.88→91: quick-ask drag head saja (resize dihapus; detach session-only · writeback clamp · × filtered)");
		} else {
			console.error("✗ v0.1.88/91 quick-ask drag drifted");
			failed++;
		}
	}
	/* v0.1.89 — model picker in-panel Quick Ask (owner: "seperti di main
	   chat ui; keterangan model pindah bawah composer"): komponen
	   ModelPicker ASLI (moa tidak dioper, runTurn bare chatCompletion),
	   pick/refresh/writeback via deps live (main.ts mirror selectModel +
	   refreshModels verbatim), header bersih dari label, caption footer
	   statusbar-mini, CSS mirror winner .oa-app→.oa-quickask (57 selector),
	   panel overflow visible supaya dropdown bisa keluar tepi atas. Lane
	   menguji DOM nyata komponen di dua provider. */
	{
		const ctl16 = fs.readFileSync(path.join(__dirname, "../src/quickask/controller.ts"), "utf8");
		const pnl16 = fs.readFileSync(path.join(__dirname, "../src/quickask/panel.tsx"), "utf8");
		const css16 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const mn16 = fs.readFileSync(path.join(__dirname, "../src/main.ts"), "utf8");
		const ent16 = fs.readFileSync(path.join(__dirname, "real-preview/chat-entry.tsx"), "utf8");
		const bld16 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			ctl16.includes("getModelMenu: () => QuickAskMenuState") &&
			ctl16.includes("onSelectModel: (provider: string, model: string)") &&
			pnl16.includes('import { ModelPicker } from "../ui/components/model-picker";') &&
			pnl16.includes("oa-quickask-foot") &&
			!pnl16.includes("oa-quickask-model") &&
			css16.includes(".oa-quickask .oa-model-pill {") &&
			css16.includes(".oa-quickask .oa-model-menu {") &&
			css16.includes(".oa-quickask-foot {") &&
			css16.includes(".oa-quickask .oa-modal-overlay {") &&
			mn16.includes("onSelectModel: async (provider, m) =>") &&
			mn16.includes("refreshQuickAskModels") &&
			ent16.includes("pickSwitches") &&
			ent16.includes("visToggleWrites") &&
			bld16.includes("pickerOk");
		if (ok) {
			console.log("✓ v0.1.89: model picker in-panel (main-chat parity) · caption footer live · header bersih · CSS mirror 57 selector · overflow visible");
		} else {
			console.error("✗ v0.1.89 quick-ask model picker drifted");
			failed++;
		}
	}
	/* v0.1.90 — {activeNote} di Quick Ask (owner ask): parser murni baru
	   extractActiveNoteToken di promptTokens.ts (satu rumah regex token);
	   resolve = [Attached file: <path>] parity main chat, konten LIVE dari
	   editorView.state.doc (suntingan belum-simpan ikut — bukan baca disk);
	   bubble menyimpan teks mentah, wire distrip; path tak dikenal → Notice
	   bernama; token lain ({},{[[]]},{#}) sengaja tetap literal di Quick
	   Ask. Lane: mixed-case + live-doc (X edit) + strip + bubble mentah. */
	{
		const pt17 = fs.readFileSync(path.join(__dirname, "../src/agent/promptTokens.ts"), "utf8");
		const ovl17 = fs.readFileSync(path.join(__dirname, "../src/quickask/overlay.ts"), "utf8");
		const ctl17 = fs.readFileSync(path.join(__dirname, "../src/quickask/controller.ts"), "utf8");
		const pnl17 = fs.readFileSync(path.join(__dirname, "../src/quickask/panel.tsx"), "utf8");
		const ent17 = fs.readFileSync(path.join(__dirname, "real-preview/chat-entry.tsx"), "utf8");
		const bld17 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			pt17.includes("export function extractActiveNoteToken") &&
			ovl17.includes("activeNotePath: string | null") &&
			ctl17.includes("activeNotePath: filePath") &&
			pnl17.includes("extractActiveNoteToken") &&
			pnl17.includes("[Attached file:") &&
			pnl17.includes("options.editorView.state.doc.toString()") &&
			ent17.includes("activenoteLive") &&
			bld17.includes("activeNoteOk");
		if (ok) {
			console.log("✓ v0.1.90: {activeNote} → [Attached file:] live-doc · strip · bubble mentah · Notice bernama");
		} else {
			console.error("✗ v0.1.90 quick-ask {activeNote} drifted");
			failed++;
		}
	}
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
	{
		const ovl18 = fs.readFileSync(path.join(__dirname, "../src/quickask/overlay.ts"), "utf8");
		const pnl18 = fs.readFileSync(path.join(__dirname, "../src/quickask/panel.tsx"), "utf8");
		const css18 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const ico18 = fs.readFileSync(path.join(__dirname, "../src/ui/icons.tsx"), "utf8");
		const ent18 = fs.readFileSync(path.join(__dirname, "real-preview/chat-entry.tsx"), "utf8");
		const bld18 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			!pnl18.includes("oa-quickask-grip") &&
			!css18.includes(".oa-quickask-grip") &&
			!pnl18.includes("oa-quickask-move") &&
			!pnl18.includes("GripVerticalIcon") &&
			!css18.includes(".oa-quickask-move") &&
			!ico18.includes("grip-vertical") &&
			ovl18.includes("beginResize") &&
			ovl18.includes("MIN_PANEL_H") &&
			ovl18.includes("oa-quickask-sized") &&
			pnl18.includes("oa-quickask-seam") &&
			css18.includes(".oa-quickask .oa-quickask-seam {") &&
			css18.includes("nwse-resize") &&
			css18.includes(".oa-quickask-sized .oa-quickask-body {") &&
			ent18.includes("seamKeys") &&
			ent18.includes("gripGlyphGone") &&
			bld18.includes("seamOk");
		if (ok) {
			console.log("✓ v0.1.91/100: resize balik sebagai SEAM (bukan tombol) · grip glyph hilang · absence guard wujud lama");
		} else {
			console.error("✗ v0.1.91/100 quick-ask gesture contract drifted");
			failed++;
		}
	}
	/* v0.1.92 — retry/failover Quick Ask (sisa terakhir paket): helper
	   attemptWithResilience di resilience.ts (dipinjam dari prinsip Hermes
	   bagian atas file); main.ts membuat targets [primary, fallbackValid#1]
	   — turn-scoped maks SATU swap; model fallback ikut via override;
	   panel me-reset stream parsial lewat onRetry; abort memutus sebelum
	   attempt. Lane: kelas error jaringan retry 2×, 401 tanpa retry →
	   swap, abort sebelum attempt 0 panggilan, end-to-end stream reset. */
	{
		const res19 = fs.readFileSync(path.join(__dirname, "../src/agent/resilience.ts"), "utf8");
		const mn19 = fs.readFileSync(path.join(__dirname, "../src/main.ts"), "utf8");
		const ovl19 = fs.readFileSync(path.join(__dirname, "../src/quickask/overlay.ts"), "utf8");
		const pnl19 = fs.readFileSync(path.join(__dirname, "../src/quickask/panel.tsx"), "utf8");
		const ent19 = fs.readFileSync(path.join(__dirname, "real-preview/chat-entry.tsx"), "utf8");
		const bld19 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			res19.includes("export async function attemptWithResilience") &&
			res19.includes("attempt < maxAttempts(err)") &&
			mn19.includes("resolveFallbacks(s)[0]") &&
			mn19.includes("attemptWithResilience(") &&
			ovl19.includes("onRetry: (() => void) | undefined") &&
			pnl19.includes('() => setStreamText("")') &&
			ent19.includes("streamResetOnRetry") &&
			ent19.includes("resilienceFailover") &&
			bld19.includes("resilienceOk");
		if (ok) {
			console.log("✓ v0.1.92: retry/failover (resilience.ts) di Quick Ask · maks 1 swap · stream reset · abort-aware");
		} else {
			console.error("✗ v0.1.92 quick-ask retry/failover drifted");
			failed++;
		}
	}
	/* v0.1.93 — audit UI settings ronde-1 (mudah, by-fix bukan reskin —
	   constraint 5 kontrak openagent-ui): (1) scope-leak reduced-motion
	   mirror .oa-quickask .oa-spin (blok lama tak menjangkau quickask) →
	   perlakuan status baku fade-not-rotate; (2) blok problems MoA
	   pemblokir save → role=alert di-createDiv. Icon-only settings sudah
	   ber-title via setTooltip (kontrak OR) → BUKAN pelanggaran. Probe
	   F17 "first:preset" ternyata struktur ul/li di DOM nyata → hantu
	   harness, bukan bug (dicatat teliti). */
	{
		const css20 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const tab20 = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const ok =
			css20.includes(".oa-quickask .oa-spin {") &&
			css20.includes("animation: oa-calm-fade 1.2s ease-in-out infinite !important;") &&
			tab20.includes('cls: "oa-moa-problems", attr: { role: "alert" }');
		if (ok) {
			console.log("✓ v0.1.93: settings round-1 — spin reduced-motion (scope leak) · MoA problems role=alert");
		} else {
			console.error("✗ v0.1.93 settings audit round-1 drifted");
			failed++;
		}
	}
	/* v0.1.94 — settings: search bar + titik "berubah dari default"
	   (penambahan murni, constraint 5 aman — section-rail tak disentuh).
	   Indeks search di-panen dari builder section ASLI ke host detached
	   (teks tak mungkin drift dari UI); klik hasil keluar mode search →
	   lompat tab + flash baris; guard searchHarvesting menahan fan-out
	   jaringan (hub taps/deskripsi/loadSkills) dari render panen; snapshot
	   + restore field El agar panen tak mencuri ref pane hidup. Blok CSS
	   di EKOR styles.css — token tema saja; tanpa hex/transition:all/
	   border-radius literal (hygiene pelajaran 65). */
	{
		const css21 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const tab21 = fs.readFileSync(path.join(__dirname, "../src/settingsTab.ts"), "utf8");
		const search21Path = path.join(__dirname, "../src/settingsSearch.ts");
		const mod21Path = path.join(__dirname, "../src/settingsModified.ts");
		const search21 = fs.existsSync(search21Path) ? fs.readFileSync(search21Path, "utf8") : "";
		const mod21 = fs.existsSync(mod21Path) ? fs.readFileSync(mod21Path, "utf8") : "";
		const tailMark = "SETTINGS SEARCH + MODIFIED DOT (v0.1.94, additive)";
		const tail21 = css21.includes(tailMark) ? css21.slice(css21.indexOf(tailMark)) : "";
		const harvestGuards = (tab21.match(/this\.searchHarvesting\) return;/g) || []).length;
		/* v0.1.159 amended: hex is sanctioned INSIDE a var() fallback (the
		   contract's own rule). Strip every var(...) before the bare-hex
		   check so a fallback never trips the hardcoded-color guard. */
		const bareHex21 = /#[0-9a-fA-F]{3,8}/.test(tail21.replace(/var\([^()]*\)/g, ""));
		const ok =
			tab21.includes('cls: "oa-settings-search"') &&
			tab21.includes('"aria-label": "Search settings"') &&
			tab21.includes('"aria-label": "Clear search"') &&
			tab21.includes("oa-settings-search-results") &&
			tab21.includes("jumpToSearchResult") &&
			tab21.includes("oa-settings-flash") &&
			tab21.includes("private renderSectionBody(") &&
			harvestGuards === 2 && // hubLazyDescriptions + hubEnsureLoaded
			tab21.includes("if (!this.searchHarvesting) void this.plugin.skillsStore") &&
			search21.includes("export function buildSettingsIndex") &&
			search21.includes("export function filterSettingsIndex") &&
			mod21.includes("export function markModified") &&
			mod21.includes("DEFAULT_SETTINGS") &&
			(tab21.match(/markModified\(/g) || []).length === 66 && // v0.1.175 +4 · v0.1.176 +3 · v0.1.178 +1 · v0.1.187 +3 (maxTokens/contextWindow/requestTimeout)
			tail21.includes(".oa-mod-dot") &&
			tail21.includes(".oa-settings-search-result") &&
			tail21.includes(".oa-settings-flash") &&
			tail21.includes(".oa-settings-search") &&
			!/transition:\s*all/.test(tail21) &&
			!/border-radius:\s*4px;/.test(tail21) &&
			!bareHex21;
		if (ok) {
			console.log("✓ v0.1.94: settings search (harvest/jump/flash/guards) · modified dots ×66 · CSS block hygiene");
		} else {
			console.error("✗ v0.1.94 settings search/dot guards drifted");
			failed++;
		}
	}
	/* v0.1.95 — settings card refinement (owner directive: "perbaiki UI,
	   kartu dirapikan" — constraint 5 dicabut owner 2026-08-06). Look kartu
	   itu milik CORE Obsidian (.setting-item di app.css); refinement =
	   token scoped + nilai yang DIEDIT DI TEMPAT pada rule lama (satu
	   definisi per selector — guard anti-debt layered-selector & chip-x
	   tetap hijau), satu-satunya selector BARU yang di-append di ekor:
	   .oa-settings .setting-item. Dievaluasi pixel-by-pixel via lane. */
	{
		const css22 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const mark22 = "SETTINGS CARD RHYTHM (v0.1.95";
		const tail22 = css22.includes(mark22) ? css22.slice(css22.indexOf(mark22)) : "";
		/* v0.1.159 amended: hex inside var() fallback is the sanctioned form —
		   strip var(...) before the bare-hex check (same as v0.1.94). */
		const bareHex22 = /#[0-9a-fA-F]{3,8}/.test(tail22.replace(/var\([^()]*\)/g, ""));
		const ok =
			css22.includes(".oa-settings {\n\t--setting-items-radius: var(--radius-m, 8px);") &&
			css22.includes(".oa-settings .oa-subsection {\n\tmargin-top: 28px;") &&
			css22.includes("margin: 2px 0 8px;") &&
			css22.includes(".oa-settings .oa-mcp-server {\n\tborder: 1px solid var(--background-modifier-border);\n\tborder-radius: var(--radius-m, 8px);\n\tpadding: 10px 12px;\n\tmargin-bottom: 6px;\n}") &&
			css22.includes("\tborder-radius: var(--radius-s, 4px);\n}\n.oa-hub-chip-x:hover") &&
			css22.includes("line-height: 1.5;\n\tpadding: 8px 10px;\n\tborder-radius: var(--radius-m, 8px);") &&
			css22.includes("\tfont-size: var(--font-ui-smaller);\n\tpadding: 8px 10px;\n\tborder-radius: var(--radius-m, 8px);\n\tborder: 1px solid var(--background-modifier-border);\n\tbackground: var(--background-primary);\n\tcolor: var(--text-normal);\n\tresize: vertical;\n}") &&
			css22.includes("\ttext-align: left;\n\tpadding: 8px 12px;\n\tborder: 1px solid var(--background-modifier-border);\n\tborder-radius: var(--radius-m, 8px);\n\tbackground: var(--background-primary);") &&
			tail22.includes(".oa-settings .setting-item {\n\tpadding: var(--size-4-3, 12px) var(--size-4-4, 16px);\n\tmargin-bottom: 6px;\n}") &&
			!/transition:\s*all/.test(tail22) &&
			!/border-radius:\s*4px;/.test(tail22) &&
			!bareHex22;
		if (ok) {
			console.log("✓ v0.1.95: settings card refinement — nilai in-place, satu selector baru di ekor, hygiene bersih");
		} else {
			console.error("✗ v0.1.95 settings card refinement drifted");
			failed++;
		}
	}
	/* v0.1.96 — perbaikan chrome oa-settings-search (laporan owner): "kotak
	   di kanan" & bingkai ganda itu CAT ASLI UA stylesheet — input:is([type])
	   & button native appearance duduk di (0,1,1) dan mengalahkan class
	   tunggal (terbukti: enumerasi document.styleSheets menemukan NOL rule —
	   pencurinya UA). Fix: appearance:none + prefix parent (0,2,0), state
	   focus (0,3,0), clear visibility:hidden (22×30 ghost!) → display:none/
	   flex swap, placeholder token, fokus × outline. */
	{
		const css23 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const ok =
			css23.includes(".oa-settings-search .oa-settings-search-input {\n\tflex: 1 1 auto;\n\tmin-width: 0;\n\tpadding: 2px 0;\n}") &&
			css23.includes('.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"],') &&
			css23.includes("\t-webkit-appearance: none !important;\n\tappearance: none !important;\n\tbackground: transparent !important;\n\tborder: 0 !important;\n\tbox-shadow: none !important;\n\toutline: none !important;") &&
			css23.includes('.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:focus-visible') &&
			css23.includes(".oa-settings-search .oa-settings-search-input::placeholder {\n\tcolor: var(--text-faint);\n}") &&
			css23.includes(".oa-settings-search .oa-settings-search-clear {\n\tdisplay: none; /* zero layout when empty") &&
			css23.includes(".oa-settings-search.has-query .oa-settings-search-clear {\n\tdisplay: flex;\n}") &&
			css23.includes(".oa-settings-search .oa-settings-search-clear:focus-visible {") &&
			!css23.includes(".oa-settings-search-clear {\n\tvisibility: hidden;") &&
			!css23.includes(".oa-settings-search.has-query .oa-settings-search-clear {\n\tvisibility: visible;");
		if (ok) {
			console.log("✓ v0.1.96: search chrome — UA paint dimatikan (appearance:none + prefix), ghost box hilang, fokus × bercincin");
		} else {
			console.error("✗ v0.1.96 search chrome fix drifted");
			failed++;
		}
	}
	/* v0.1.97 — hover-netral oa-settings-search-input (owner: efek hover
	   merusak estetika). F26 mengukur: :hover mengisi background field
	   dengan abu host/UA + menggeser border-color. Fix bukan "specificity
	   war" tapi PIN keadaan hover/active ke cat netral yang sama —
	   affordance interaktif tetap kursor teks; tak ada yang bergerak. */
	{
		const css24 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const ok =
			css24.includes('.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:hover,\n' +
				'.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:active,') &&
			css24.includes("\tbackground: transparent !important;\n\tborder: 0 !important;\n\tbox-shadow: none !important;\n\toutline: none !important;") &&
			css24.includes("\tfilter: none !important;\n\ttransform: none !important;\n\ttext-shadow: none !important;\n\ttransition: none !important;\n\tanimation: none !important;") &&
			css24.includes("later/stronger\n   theme hover rule could still restore fill, border, motion, or shadow") &&
			!css24.includes(".oa-settings-search .oa-settings-search-input:hover,");
		if (ok) {
			console.log("✓ v0.1.97: search input hover pinned neutral — tidak ada yang bergerak saat hover");
		} else {
			console.error("✗ v0.1.97 search-input hover pin drifted");
			failed++;
		}
	}
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
	{
		const css25 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const lane25 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const mark25 = "QUICK ASK FIELD RESET (v0.1.98";
		const ok =
			css25.includes(mark25) &&
			css25.includes('.oa-quickask input:not([type="checkbox"]):not([type="radio"]),\n.oa-quickask textarea,\n.oa-quickask select {') &&
			css25.includes('.oa-quickask input:not([type="checkbox"]):not([type="radio"]):hover,') &&
			css25.includes(".oa-quickask textarea:hover,\n.oa-quickask textarea:active,\n.oa-quickask textarea:focus,") &&
			css25.includes(".oa-quickask .oa-quickask-input {\n\twidth: 100%;") &&
			css25.includes(".oa-quickask .oa-quickask-input:focus {") &&
			!css25.includes("\n.oa-quickask-input {") &&
			!css25.includes("\n.oa-quickask-input:focus {") &&
			!css25.includes(".oa-quickask :is(") &&
			css25.includes('.oa-quickask input:not([type="checkbox"]):not([type="radio"])::placeholder,\n.oa-quickask textarea::placeholder {') &&
			lane25.includes("composer hover moved paint") &&
			lane25.indexOf("composer hover moved paint") < lane25.indexOf("coarse-pointer (touch)");
		if (ok) {
			console.log("✓ v0.1.98: hover-netral composer quickask — reset global parity, probe desktop-mode");
		} else {
			console.error("✗ v0.1.98 quickask composer hover fix drifted");
			failed++;
		}
	}
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
	{
		const css26 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const lane26 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			!css26.includes(".oa-quickask :is(") &&
			css26.includes("font-family: inherit;\n\tletter-spacing: inherit;\n\tcolor: inherit;") &&
			!css26.slice(css26.indexOf("QUICK ASK FIELD RESET")).includes("font: inherit;") &&
			lane26.includes("composer metrics not its own") &&
			lane26.indexOf("composer metrics not its own") < lane26.indexOf("coarse-pointer (touch)");
		if (ok) {
			console.log("✓ v0.1.99: quickask reset = selector polos (no :is inflation), font longhand, composer metrics resolved-terukur di lane");
		} else {
			console.error("✗ v0.1.99 quickask specificity trap regressed");
			failed++;
		}
	}
	/* v0.1.100 — seam measured-pack: lane wajib menyimpan kunci hasil
	   terukur (resolved values — pelajaran 79), bukan sekadar string */
	{
		const bld19 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			bld19.includes("r.seamClamped === true") &&
			bld19.includes("g.closeW === 28") &&
			bld19.includes("r.gripGlyphGone === true");
		if (ok) {
			console.log("✓ v0.1.100: lane kunci nilai terukur seam + close 28 + glyph gone");
		} else {
			console.error("✗ v0.1.100 seam measured-pack drifted");
			failed++;
		}
	}
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
	{
		const ca19 = fs.readFileSync(path.join(__dirname, "../src/ui/ChatApp.tsx"), "utf8");
		const bld19 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			ca19.includes('addEventListener("pointercancel", onPointerDone, true)') &&
			ca19.includes('addEventListener("mousemove", onMouseMove, true)') &&
			ca19.includes("e.buttons === 0") &&
			ca19.includes('window.addEventListener("pointerup", onPointerDone, true)') &&
			bld19.includes("GEJALA OWNER") &&
			bld19.includes("sel fallback witness failed");
		if (ok) {
			console.log("✓ v0.1.101: selDrag tiga jalan keluar (cancel/window/buttons) · lane witness cancel-survival");
		} else {
			console.error("✗ v0.1.101 quote-bar finger-trap regressed");
			failed++;
		}
	}
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
	{
		const fs = require("fs");
		const path = require("path");
		const chat20 = fs.readFileSync(path.join(__dirname, "../src/ui/ChatApp.tsx"), "utf8");
		const css20 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const bld20 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ent20 = fs.readFileSync(path.join(__dirname, "real-preview/chat-entry.tsx"), "utf8");
		const ok =
			chat20.includes("createPortal(") &&
			chat20.includes("document.body") &&
			css20.includes(".oa-selbar .oa-selbar-btn") &&
			!css20.includes(".oa-app .oa-selbar") &&
			bld20.includes(".oa-fake-leaf") &&
			bld20.includes("contain: strict") &&
			bld20.includes("sel chrome witness failed") &&
			ent20.includes("oa-fake-leaf");
		if (ok) {
			console.log("✓ v0.1.102: selbar portal ke body (contain:strict re-anchor) · selektor re-root · chrome-mirror witness lane");
		} else {
			console.error("✗ v0.1.102 selbar portal/chrome-mirror regressed");
			failed++;
		}
	}
	// 2026-08-07 v0.1.103 dblclick word-selection (owner: "select text dengan
	// metode klik tidak ke select … seperti ke cancel"): handler tapback di
	// root .oa-msg memanggil removeAllRanges() 0ms setelah browser memilih
	// kata — seleksi mati seketika (dan reaksi diam-diam ter-toggle). Branch
	// detail!==2 sudah melindungi seleksi triple-klik; dobel-klik bolong di
	// kelas yang sama. Fix: .oa-msg-content masuk TAPBACK_EXCLUDE — teks =
	// wilayah seleksi (quote bar ikut nongol dari seleksi kata), chrome
	// bubble = wilayah tapback (lane reax menjaga retract). Lane 5 dblclick
	// CDP sungguhan membuktikan red ({"text":"","bar":false}) → hijau.
	{
		const fs = require("fs");
		const path = require("path");
		const chat21 = fs.readFileSync(path.join(__dirname, "../src/ui/ChatApp.tsx"), "utf8");
		const bld21 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			chat21.includes(", .oa-msg-content';") &&
			chat21.includes("TAPBACK_EXCLUDE") &&
			bld21.includes("page.mouse.dblclick") &&
			bld21.includes("sel dblclick witness failed");
		if (ok) {
			console.log("✓ v0.1.103: teks = wilayah seleksi (dblclick kata hidup) · chrome = wilayah tapback · lane 5 witness");
		} else {
			console.error("✗ v0.1.103 dblclick text-exclusion regressed");
			failed++;
		}
	}
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
	{
		const fs = require("fs");
		const path = require("path");
		const tool22 = fs.readFileSync(path.join(__dirname, "../src/ui/components/tool.tsx"), "utf8");
		const think22 = fs.readFileSync(path.join(__dirname, "../src/ui/components/thinking-bar.tsx"), "utf8");
		const css22 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const bld22 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ent22 = fs.readFileSync(path.join(__dirname, "real-preview/chat-entry.tsx"), "utf8");
		const ok =
			/\.oa-app \.oa-thinking-bar \{[^}]*justify-content: space-between/.test(css22) &&
			css22.includes("border-bottom: 1px dotted var(--text-faint)") &&
			css22.includes(".oa-tool-state-icon.is-streaming") &&
			css22.includes(".oa-tool-glyph.is-spin") &&
			!css22.includes(".oa-app .oa-tool-state-icon .oa-loader-circular") &&
			tool22.includes("oa-tool-glyph") &&
			tool22.includes("M21 12a9 9 0 1 1-6.219-8.56") &&
			tool22.includes("SettingsIcon size={16}") &&
			!tool22.includes("CheckIcon size") &&
			!tool22.includes("XIcon size") &&
			!tool22.includes('Loader variant="circular"') &&
			!think22.includes("ChevronRightIcon") &&
			bld22.includes("toolstate") &&
			bld22.includes("stop-gap=") &&
			ent22.includes("ToolstateFixture");
		if (ok) {
			console.log("✓ v0.1.104: thinking stop right-flush dotted (official) · tool glyphs 16px svg inline lucide + spinner arc · fixture lane");
		} else {
			console.error("✗ v0.1.104 prompt-kit fidelity regressed");
			failed++;
		}
	}
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
	{
		const fs = require("fs");
		const path = require("path");
		const css23 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const core23 = fs.readFileSync(path.join(__dirname, "../src/ui/components/preview-diff-core.ts"), "utf8");
		const tsx23 = fs.readFileSync(path.join(__dirname, "../src/ui/components/preview-diff.tsx"), "utf8");
		const ent23 = fs.readFileSync(path.join(__dirname, "real-preview/chat-entry.tsx"), "utf8");
		const bld23 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			css23.includes(".oa-preview-gutter {") &&
			css23.includes("background: color-mix(in srgb, var(--color-green) 20%, transparent)") &&
			css23.includes("background: color-mix(in srgb, var(--color-red) 20%, transparent)") &&
			css23.includes(".oa-preview-w-add { background: color-mix(in srgb, var(--color-green) 40%, transparent)") &&
			css23.includes(".oa-preview-count-del { color: var(--color-red") &&
			css23.includes(".oa-preview-count-add { color: var(--color-green") &&
			!css23.includes(".oa-app .oa-preview-added { background: var(--background-modifier-success)") &&
			/\.oa-app \.oa-tool-state-icon \.oa-tool-glyph\.is-spin \{\s*animation: oa-spin 1s linear infinite !important/.test(css23) &&
			core23.includes("lineNo") &&
			tsx23.includes("oa-preview-gutter") &&
			tsx23.includes("oa-preview-count-del") &&
			tsx23.includes("oa-preview-count-add") &&
			ent23.includes("visual2") &&
			bld23.includes("preview diff visual contract failed") &&
			bld23.includes("reduce-motion witness failed");
		if (ok) {
			console.log("✓ v0.1.105 (diamendir 106): diff unified (tint resmi 0.2/0.4 + gutter SATU kolom) · spinner berputar bahkan di reduce-motion · witness transform live");
		} else {
			console.error("✗ v0.1.105/106 diff-visual / spin-parity regressed");
			failed++;
		}
	}
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
	{
		const fs = require("fs");
		const path = require("path");
		const css24 = fs.readFileSync(path.join(__dirname, "../styles.css"), "utf8");
		const core24 = fs.readFileSync(path.join(__dirname, "../src/ui/components/preview-diff-core.ts"), "utf8");
		const tsx24 = fs.readFileSync(path.join(__dirname, "../src/ui/components/preview-diff.tsx"), "utf8");
		const bld24 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			css24.includes("border-left: 4px solid transparent;") &&
			css24.includes("border-left-color: color-mix(in srgb, var(--color-green) 55%, var(--background-primary));") &&
			css24.includes("border-left-color: color-mix(in srgb, var(--color-red) 55%, var(--background-primary));") &&
			css24.includes(".oa-app .oa-preview-added .oa-preview-gutter { color: var(--color-green") &&
			css24.includes(".oa-app .oa-preview-removed .oa-preview-gutter { color: var(--color-red") &&
			!css24.includes("color-mix(in srgb, var(--color-green) 14%") &&
			core24.includes("lineNo?: number") &&
			!core24.includes("oldLine") &&
			tsx24.includes('{r.lineNo ?? ""}') &&
			!tsx24.includes("oldLine") &&
			bld24.includes("preview diff visual contract failed") &&
			bld24.includes("reduce-motion witness failed") &&
			bld24.includes("ctxGuts");
		if (ok) {
			console.log("✓ v0.1.106: gutter SATU kolom ala screenshot resmi (nomor rose/olive/abu) · pita tepi 4px anti-hose · tint 0.2/0.4 resmi · spin tetap rotasi");
		} else {
			console.error("✗ v0.1.106 gutter-koreksi / spin-parity regressed");
			failed++;
		}
	}
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
	{
		const fs = require("fs");
		const path = require("path");
		const mpp = fs.readFileSync(path.join(__dirname, "../src/ui/markdown-preprocess.ts"), "utf8");
		const mdx = fs.readFileSync(path.join(__dirname, "../src/ui/components/markdown.tsx"), "utf8");
		const mtt = fs.readFileSync(path.join(__dirname, "markdown.test.cjs"), "utf8");
		const men = fs.readFileSync(path.join(__dirname, "markdown-entry.ts"), "utf8");
		const ent25 = fs.readFileSync(path.join(__dirname, "real-preview/chat-entry.tsx"), "utf8");
		const bld25 = fs.readFileSync(path.join(__dirname, "real-preview/build.mjs"), "utf8");
		const ok =
			mpp.includes("export function sanitizeMermaidSrc") &&
			mpp.includes("MERMAID_SUBGRAPH_LINE") &&
			mdx.includes("sanitizeMermaidSrc(guardAssistantDiagramRemoteMedia(seg.content))") &&
			men.includes("sanitizeMermaidSrc") &&
			men.includes("guardAssistantDiagramRemoteMedia") &&
			mtt.includes('subgraph "Agent Loop ✨"') &&
			ent25.includes("mermaidSalvage") &&
			ent25.includes("subgraph Agent Loop ✨") &&
			bld25.includes("h.mermaidSalvage");
		if (ok) {
			console.log("✓ v0.1.107: mermaid salvage — judul subgraph bare ber-emoji terkutip sebelum lexer · id/[title]/quoted tak disentuh · lane md saksi");
		} else {
			console.error("✗ v0.1.107 mermaid salvage regressed");
			failed++;
		}
	}
	{
		// v0.1.108 lobe Data Entry port (owner: komponen lobe-ui data entry
		// dipakai di page settings — scope BOTH via kartu): Approval mode
		// menjadi rail segmented tiga opsi; temperature & max output tokens
		// menjadi slider + kotak angka sinkron dua arah. Port VANILA (nol
		// React) dari lobe-ui Segmented/SliderWithInput — kontrak behavior
		// curl-verified raw 2026-08-07 (docs/reference/reference-sources.md): thumb
		// meluncur + radiogroup roving tabindex; ketik bolak-balik sinkron
		// dengan slider; clamp di rail saat commit; unlimitedInput
		// membebaskan kotak tokens melebihi rail; NaN/null diabaikan.
		// Dropdown modes lama dan slider/text native dua baris itu lenyap.
		const sc108 = read("src/ui/settings-controls.ts");
		const st108 = read("src/settingsTab.ts");
		const css108 = read("styles.css");
		const bld108 = read("test/real-preview/build-settings.mjs");
		const ok =
			sc108.includes("export function createSegmented") &&
			sc108.includes("export function createSliderInput") &&
			sc108.includes("radiogroup") &&
			st108.includes("createSegmented({") &&
			st108.includes("createSliderInput({") &&
			!st108.includes("for (const m of modes)") &&
			!st108.includes("setLimits(-1, 2, 0.05)") &&
			!st108.includes("String(s.maxTokens)") &&
			css108.includes(".oa-settings .oa-seg {") &&
			css108.includes(".oa-settings .oa-slideinput {") &&
			bld108.includes("probes.F27seg") &&
			bld108.includes("probes.F27slide");
		if (ok) {
			console.log("\u2713 v0.1.108: lobe Data Entry di settings \u2014 rail segmented approval \u00b7 slider+input sinkron temp/tokens \u00b7 unlimitedInput \u00b7 probe F27seg/F27slide saksi");
		} else {
			console.error("\u2717 v0.1.108 lobe Data Entry port regressed");
			failed++;
		}
	}
	{
		// v0.1.109 MoA controls row (owner: "perbaiki mixture of agents
		// setting-item mod-toggle, dropdown samakan (full width), sebelum
		// toggle tambahkan text Enabled, button add preset sesudah input"):
		// pick melebar flex:1, label "Enabled" tampak sebelum toggle, tombol
		// Add pindah SESUDAH input nama. Urutan kode diguard via indexOf
		// (input dulu baru tombol Add); saksi F28moa di settings lane.
		const st109 = read("src/settingsTab.ts");
		const css109 = read("styles.css");
		const bld109 = read("test/real-preview/build-settings.mjs");
		const ok =
			st109.includes('addClass("oa-moa-ctl")') &&
			st109.includes('addClass("oa-moa-ctl-pick")') &&
			st109.includes('oa-moa-ctl-label", text: "Enabled"') &&
			st109.indexOf("const nameText = new TextComponent(newPair)") > -1 &&
			st109.indexOf("const nameText = new TextComponent(newPair)") <
				st109.indexOf('setButtonText("Add preset")') &&
			css109.includes(".oa-settings .oa-moa-ctl-pick {") &&
			css109.includes(".oa-settings .oa-moa-ctl-label {") &&
			bld109.includes("probes.F28moa");
		if (ok) {
			console.log("\u2713 v0.1.109: MoA controls row \u2014 pick full-width \u00b7 label Enabled kelihatan \u00b7 Add preset sesudah input \u00b7 F28moa saksi");
		} else {
			console.error("\u2717 v0.1.109 MoA controls row regressed");
			failed++;
		}
	}
	{
		// v0.1.110 slider parity (owner: "panjang slidernya ada yang gak
		// sama, ada yang pendek ada yang panjang, seharusnya sama"): jebakan
		// klasik flex:1 — rail mewarisi lebar control yang tergantung panjang
		// nama/desc tiap baris. Geometri dikunci fixed: pair 240px (rail =
		// 240 - 64 - gap 16 = 160px di KEDUA baris). F27slide kini ikut
		// meng-assert lebar rail temperature == rail maxTokens (±1px).
		const css110 = read("styles.css");
		const bld110 = read("test/real-preview/build-settings.mjs");
		const ok =
			css110.includes(".oa-settings .oa-slideinput {") &&
			css110.includes("flex: 0 0 240px;\n\twidth: 240px;\n\tmax-width: 100%;") &&
			bld110.includes("sameRail") &&
			bld110.includes("tRailW");
		if (ok) {
			console.log("\u2713 v0.1.110: slider parity \u2014 pair fixed 240px, rail 160px identik di semua baris \u00b7 sameRail diverifikasi F27slide");
		} else {
			console.error("\u2717 v0.1.110 slider parity regressed");
			failed++;
		}
	}
	{
		// v0.1.111 owner bug report (screenshot + "toggle enable di-force ke
		// atas"): (a) input+Add preset dibungkus .oa-moa-ctl-new — satu item
		// flex, wrap tak pernah memisahkannya (F28moa meng-assert SEBARIS);
		// (b) display() merekam scroller sebelum empty() dan memulihkan
		// scrollTop sehabis render — rebuild row terdetas dalam probe tapi
		// y bertahan (F29scroll). nearestScroller walk overflowY auto/scroll
		// jatuh ke scrollingElement; try/catch demi headless.
		const st111 = read("src/settingsTab.ts");
		const css111 = read("styles.css");
		const bld111 = read("test/real-preview/build-settings.mjs");
		const ok =
			st111.includes('createDiv({ cls: "oa-moa-ctl-new" })') &&
			st111.includes("new ButtonComponent(newPair)") &&
			st111.includes("private nearestScroller()") &&
			st111.includes("scroller && scrollY > 0") &&
			css111.includes(".oa-settings .oa-moa-ctl-new {") &&
			bld111.includes("probes.F29scroll") &&
			bld111.includes("sameLine") &&
			bld111.includes("detached");
		if (ok) {
			console.log("\u2713 v0.1.111: MoA pair glue \u2014 Add nempel sebaris sesudah input \u00b7 display() jaga scroll (F29scroll: rebuild terdetas, y bertahan)");
		} else {
			console.error("\u2717 v0.1.111 MoA pair/scroll regressed");
			failed++;
		}
	}
	{
		// v0.1.112 (owner di pane asli: "masalah yang satunya masih ... bagian
		// kirinya seperti ada spasi gitu yang dorong"): rata-KANAN per baris
		// meninggalkan jurang kosong di kiri pada baris komposit tanpa kolom
		// info. Kini .oa-moa-ctl control rata KIRI (flex-start) mengikuti tepi
		// dropdown full-width di atasnya, dan input preset dipadatkan 9rem
		// supaya Enabled·Set default·Delete·[input+Add] muat satu baris di
		// lebar wajar; sempit → pasangan wrap utuh, tetap rata kiri. F28moa
		// meng-assert justify flex-start, nol jurang kiri, dan input ringkas.
		const css112 = read("styles.css");
		const bld112 = read("test/real-preview/build-settings.mjs");
		const ok =
			css112.includes("row-gap: var(--size-4-2);") /* komen rule direvisi v0.1.113 */ &&
			css112.includes("justify-content: space-between;") /* direvisi v0.1.113: dua tepi mentok */ &&
			css112.includes(".oa-settings .oa-moa-ctl-new input {") &&
			css112.includes("width: 9rem;") &&
			bld112.includes("noLeftVoid") &&
			bld112.includes("inputTight") &&
			bld112.includes("justifyBetween"); /* field di-rename v0.1.113 */
		if (ok) {
			console.log("\u2713 v0.1.112: MoA controls rata kiri \u2014 jurang kosong kiri hilang, input 9rem, sebaris di lebar wajar (F28moa saksi)");
		} else {
			console.error("\u2717 v0.1.112 MoA left-align regressed");
			failed++;
		}
	}
	{
		// v0.1.113 (owner screenshot DevTools: "purple space sebelah kiri
		// (dropdown tidak full width)" + "tidak mentok ke kanan"): dua
		// temuan terukur dari app.css resmi — (a) Obsidian SELALU membuat
		// .setting-item-info walau tanpa nama dan CSS native memberi
		// first-child margin-inline-end 16px; info kosong kini
		// disembunyikan (.oa-moa-ctl) agar dropdown mentok tepi konten
		// baris; (b) flex-start hanya memindahkan void ke kanan — kontrol
		// kini space-between: Enabled mentok kiri, Add preset mentok kanan.
		// F28moa menyuntik aturan native margin (refCss lebih tua) lalu
		// membuktikan pickFlushLeft + addFlushRight.
		const css113 = read("styles.css");
		const bld113 = read("test/real-preview/build-settings.mjs");
		const ok =
			css113.includes(".oa-settings .oa-moa-ctl .setting-item-info {") &&
			css113.includes("justify-content: space-between;") &&
			bld113.includes("justifyBetween") &&
			bld113.includes("pickFlushLeft") &&
			bld113.includes("addFlushRight") &&
			bld113.includes("margin-inline-end: var(--size-4-4)");
		if (ok) {
			console.log("\u2713 v0.1.113: MoA dua tepi mentok \u2014 info kosong disembunyikan, space-between, flush kiri+kanan diukur F28moa");
		} else {
			console.error("\u2717 v0.1.113 MoA flush regressed");
			failed++;
		}
	}
	{
		// v0.1.114 (owner: "samakan component search biar selaras" → ternyata
		// search SKILL, bukan bilah atas): hub + installed skills search kini
		// dibangun helper searchField() sebagai KOMPONEN yang sama dengan
		// bilah Search settings (shell oa-settings-search + ikon + clear +
		// has-query + Escape). Kelas input lama (.oa-hub-search /
		// .oa-skills-search) TETAP di input agar probe F tak pindah; SOSOK
		// dibandingkan lewat computed style + tinggi terhadap komponen
		// induk di F31skills. Kebetulan: addTap kini memanggil searchSync().
		const st114 = read("src/settingsTab.ts");
		const css114 = read("styles.css");
		const bld114 = read("test/real-preview/build-settings.mjs");
		const ok =
			st114.includes("private searchField(") &&
			st114.includes("oa-settings-search ${cls}-wrap") &&
			st114.includes("searchSync()") &&
			css114.includes(".oa-settings .oa-skills-search-wrap {") &&
			css114.includes(".oa-settings .oa-hub-controls {") &&
			css114.includes(".oa-settings .oa-hub-search-wrap {") &&
			bld114.includes("probes.F31skills") &&
			bld114.includes("sameLook") &&
			bld114.includes("sameHeight");
		if (ok) {
			console.log("\u2713 v0.1.114: search skills satu komponen dengan Search settings \u2014 shell+ikon+clear+Escape \u00b7 kelas input utuh \u00b7 F31skills saksi rupa");
		} else {
			console.error("\u2717 v0.1.114 skill search component regressed");
			failed++;
		}
	}
	// v0.1.115: semua search UI chat lewat satu komponen SearchField (strip/pill, clear 2-tahap Escape)
	{
		const sfSrc = read("src/ui/components/search-field.tsx");
		const chatApp115 = read("src/ui/ChatApp.tsx");
		const css115 = read("styles.css");
		const ent115 = read("test/real-preview/chat-entry.tsx");
		const bld115 = read("test/real-preview/build.mjs");
		const ok =
			sfSrc.includes("SATU komponen pencarian") // header rationale v0.1.115
			&&
			sfSrc.includes("oa-searchbox--") &&
			sfSrc.includes("Escape") &&
			chatApp115.includes("./components/search-field") &&
			css115.includes(".oa-app .oa-searchbox--pill,") &&
			css115.includes(".oa-app .oa-searchbox--strip,") &&
			css115.includes("-webkit-search-cancel-button") &&
			ent115.includes("sboxParts") &&
			ent115.includes("panelBoxParts") &&
			bld115.includes("SearchField pill") &&
			bld115.includes("r.escAfterFilled === true");
		if (ok) {
			console.log("\u2713 v0.1.115: satu SearchField untuk semua chat search \u2014 strip menu + pill panel \u00b7 \u2715 dua tahap Escape \u00b7 saksi menu2+slash");
		} else {
			console.error("\u2717 v0.1.115 SearchField unification regressed");
			failed++;
		}
	}

	// v0.1.116: rasa editor markdown di semua input multi-baris — satu mesin + dua adapter
	{
		const mk = read("src/ui/markdown-keys.ts");
		const ok =
			mk.includes("computeMarkdownEdit") &&
			mk.includes("markdownTextareaKeydown") &&
			mk.includes("markdownComposerEdit") &&
			mk.includes("SAFE_DELETE_RE") &&
			mk.includes("\u00a0") && // toleransi nbsp contenteditable
			read("src/settingsTab.ts").includes("markdownTextareaKeydown") &&
			read("src/ui/ChatApp.tsx").includes("markdownTextareaKeydown") &&
			read("src/ui/components/prompt-input.tsx").includes("markdownComposerEdit") &&
			read("test/real-preview/build-settings.mjs").includes("F32mdkeys") &&
			read("test/real-preview/chat-entry.tsx").includes("mdPairDel") &&
			read("test/real-preview/build.mjs").includes("md keys");
		if (ok) {
			console.log("\u2713 v0.1.116: rasa editor markdown \u2014 Tab/Shift+Tab \u00b7 list lanjut (bullet/nomor/checkbox/quote, keluar di item kosong) \u00b7 auto-pair+skip+wrap \u00b7 F32mdkeys+slash saksi");
		} else {
			console.error("\u2717 v0.1.116 markdown-keys unification regressed");
			failed++;
		}
	}
	// v0.1.117 (owner serious bug): simbol pasangan bocor ke composer — execCommand("insertText") DICABUT dari jalur textarea
	{
		const mk = read("src/ui/markdown-keys.ts");
		const probes117 = read("test/real-preview/build-settings.mjs");
		const ok =
			!mk.includes('document.execCommand("insertText"') &&
			mk.includes("DETERMINISTIS") &&
			!mk.includes("insertWithBreaks") && // adapter execCommand composer juga sudah pensiun (rerender kanonik)
			probes117.includes("noLeak") &&
			!probes117.includes("undoNative");
		if (ok) {
			console.log("\u2713 v0.1.117: execCommand dicabut dari jalur textarea \u2014 mutasi deterministik el.value \u00b7 probe noLeak menjaga");
		} else {
			console.error("\u2717 v0.1.117 execCommand leakage fix regressed");
			failed++;
		}
	}
	// v0.1.118 (owner): garis halus tabstrip disembunyikan + gap search↔strip tunggal
	{
		const css118 = read("styles.css");
		const probes118 = read("test/real-preview/build-settings.mjs");
		const ok =
			css118.includes("garis halus bawah disembunyikan") &&
			probes118.includes('r.hairline === "0px"') &&
			probes118.includes("r.gap >= 6 && r.gap <= 11");
		if (ok) {
			console.log("\u2713 v0.1.118: tabstrip tanpa garis halus \u00b7 gap search\u2194strip satu sumber (hairline 0px, gap 6-11 dijaga F30search)");
		} else {
			console.error("\u2717 v0.1.118 tabstrip hairline/gap regressed");
			failed++;
		}
	}
	// v0.1.119 (owner ×2): ikon hapus panel terdorong judul panjang + cacat padding menu profil —
	// akar = serapan gabungan 2848 (list jadi flex ROW+wrap); un-merge + segel baris + ritme strip
	{
		const css119 = read("styles.css");
		const driver119 = read("test/real-preview/chat-entry.tsx");
		const gates119 = read("test/real-preview/build.mjs");
		const ok =
			css119.includes(".oa-hub-preview,\n.oa-cron-history {") &&
			!css119.includes(".oa-app .oa-panel-list,\n.oa-app .oa-profile-menu-list,") &&
			css119.includes("overscroll-behavior dipulihkan ke blok asli") &&
			css119.includes(".oa-app .oa-panel-row-text > *") &&
			css119.includes(".oa-app .oa-profile-menu > .oa-searchbox--strip") &&
			driver119.includes("listNoXOverflow") &&
			driver119.includes("profileStripPad") &&
			gates119.includes("listNoXOverflow !== true");
		if (ok) {
			console.log("✓ v0.1.119: un-merge list panel/profil dari blok 2848 · baris disegel overflow · strip profil 6/10 · ghost+listXwitness menjaga");
		} else {
			console.error("✗ v0.1.119 panel/profile un-merge regressed");
			failed++;
		}
	}
	// v0.1.120 (owner: "oa-model-menu-list sepertinya sama" — BENAR): un-merge DILENGKAPI —
	// serapan blok hub/cron menelan ENAM selector, slash-menu & model-menu-list ikut keluar
	{
		const css120 = read("styles.css");
		const driver120 = read("test/real-preview/chat-entry.tsx");
		const gates120 = read("test/real-preview/build.mjs");
		const ok =
			!css120.includes(".oa-app .oa-slash-menu,\n.oa-app .oa-model-menu-list,") &&
			css120.includes("overscroll dipulihkan ke blok asli") &&
			css120.includes("BENAR-BENAR pasangan aslinya") &&
			driver120.includes("modelListNoXOverflow") &&
			driver120.includes("slashHdrNoRule") && /* v0.1.165 renamed: hairline retired (Hermes parity) */
			gates120.includes("modelListPadPin === true") &&
			gates120.includes("menuRuleOk");
		if (ok) {
			console.log("✓ v0.1.120: un-merge lengkap — slash-menu & model-menu-list pulang · ghost grup + pin padding/hairline menjaga (menu2, slash3)");
		} else {
			console.error("✗ v0.1.120 slash/model-menu un-merge regressed");
			failed++;
		}
	}
	// v0.1.121 (owner ×2): badge op hijau-di-atas-hijau (bg==fg rgb(68,207,110) di red-proof!)
	// + kartu changed-files menyimpan path mentah — workspaceFolder tak teresolve → notice palsu
	{
		const css121 = read("styles.css");
		const cf121 = read("src/ui/components/changed-files.ts");
		const ca121 = read("src/ui/ChatApp.tsx");
		const ut121 = read("test/changedFiles.test.cjs");
		const gates121 = read("test/real-preview/build.mjs");
		const ok =
			css121.includes("rgba(var(--color-green-rgb, 46 160 67), 0.14); color: var(--text-success)") &&
			!css121.includes("background: var(--background-modifier-success") &&
			cf121.includes("withWorkspace") &&
			ca121.includes("deriveChangedFiles(turn.parts, settings.workspaceFolder)") &&
			ut121.includes("Projects/Concepts/Materiality & Texture.md") &&
			gates121.includes("falseNotice !== false") &&
			gates121.includes("op badge readability");
		if (ok) {
			console.log("✓ v0.1.121: op badge tint lembut (teks terbaca) · changed-files resolve workspaceFolder · saksi fcard+preview menjaga");
		} else {
			console.error("✗ v0.1.121 op badge / changed-files path regressed");
			failed++;
		}
	}
	// v0.1.122 (owner pick "tint lembut di rest" + samakan quick ask + anti-kapsul):
	// stop/[+] rest bertinta (bukan telanjang), hover pekat; aspect-ratio 1/1 kunci bujur sangkar
	{
		const css122 = read("styles.css");
		const driver122 = read("test/real-preview/chat-entry.tsx");
		const gates122 = read("test/real-preview/build.mjs");
		const dangerOld = ".oa-quickask .oa-prompt-action-danger {\n\tbackground: transparent;";
		const ok =
			css122.includes(".oa-app .oa-prompt-action-danger {\n\tbackground: rgba(var(--color-red-rgb, 248 81 73), 0.12);") &&
			!css122.includes(".oa-app .oa-prompt-action-danger {\n\tbackground: transparent;") &&
			!css122.includes(dangerOld) &&
			css122.includes("aspect-ratio: 1 / 1;") &&
			driver122.includes("__oaWorkCheck") &&
			driver122.includes("sendAspect") &&
			gates122.includes("stop rest-face") &&
			gates122.includes("rest-face/capsule check");
		if (ok) {
			console.log("✓ v0.1.122: tint lembut rest (stop/[+], quick ask parity) · aspect-ratio anti-kapsul · saksi empty/working/qask menjaga");
		} else {
			console.error("✗ v0.1.122 rest-face/anti-kapsul regressed");
			failed++;
		}
	}
	// v0.1.123 (owner: hover [+] kok memakai warna button stop + mermaid crash "got 'PS'"):
	// --background-modifier-active-hover di app.css asli = hsla(aksen, 0.1) (tint AKSEN,
	// terukur rgba(138,92,245,0.1) di harness; aksen kemerahan ⇒ persis tint Stop) — hover/is-open
	// [+] pindah ke tangga netral color-mix 12% text-normal; sanitizeMermaidSrc mengkutip label
	// flowchart berkurung/kutip mentah (+ interior stadium/cylinder/subroutine/hexagon/diamond/pipa)
	// byte-terbukti parse di mermaid@11.16.1, tanpa menyentuh bentuk bersih/kelas/sequence.
	{
		const css123 = read("styles.css");
		const pre123 = read("src/ui/markdown-preprocess.ts");
		const mtest123 = read("test/markdown.test.cjs");
		const gates123 = read("test/real-preview/build.mjs");
		const driver123 = read("test/real-preview/chat-entry.tsx");
		const hoverBlock = css123.match(/\.oa-app \.oa-attach-toggle:hover \{[^}]+\}/)?.[0] ?? "";
		const isOpenBlock = css123.match(/\.oa-app \.oa-attach-toggle\.is-open \{[^}]+\}/)?.[0] ?? "";
		const ok =
			hoverBlock.includes("color-mix(in srgb, var(--text-normal) 12%, var(--background-modifier-hover));") &&
			/* deklarasi saja — komentar boleh menyebut var lama (amended) */
			!/background:\s*var\(--background-modifier-active-hover/.test(hoverBlock) &&
			isOpenBlock.includes("color-mix(in srgb, var(--text-normal)") &&
			!/background:\s*var\(--background-modifier-active-hover/.test(isOpenBlock) &&
			pre123.includes("v0.1.123") &&
			pre123.includes("MERMAID_FLOWCHART_HEAD") &&
			mtest123.includes("kurung dalam label kotak → terkutip (kasus owner persis)") &&
			gates123.includes("attach hover netral") &&
			gates123.includes("mermaidParenSalvage") &&
			driver123.includes("mermaidParenSalvage") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.123: hover/is-open [+] tangga netral (tint aksen ala stop pergi) · label kurung mermaid terkutip sebelum lexer · saksi empty-hover+md menjaga");
		} else {
			console.error("✗ v0.1.123 attach-hover netral / mermaid paren salvage regressed");
			failed++;
		}
	}
	// v0.1.124 (owner console STARTUP: 'PS' crash dari NOTE di vault, stack
	// loadLayout → loadFile → setViewData → spans → toDOM → mermaid.render bukan
	// dari render chat): /save menulis transkrip VERBATIM ke openagent/exports/chat-*.md
	// dan mermaid bawaan Obsidian meledak lagi pada label berkurung mentah — export kini
	// melewati sanitizeMermaidFences (sanitize per-fence mermaid, luar fence byte-identical).
	{
		const pre124 = read("src/ui/markdown-preprocess.ts");
		const chat124 = read("src/ui/ChatApp.tsx");
		const mtest124 = read("test/markdown.test.cjs");
		const gates124 = read("test/real-preview/build.mjs");
		const driver124 = read("test/real-preview/chat-entry.tsx");
		const canonical124 = read("src/markdown/canonical-output.ts");
		const ok =
			pre124.includes("export function sanitizeMermaidFences") &&
			pre124.includes("walkMarkdownFences") &&
			canonical124.includes("sanitizeMermaidFences") &&
			chat124.includes("canonicalizeAssistantOutput(") &&
			chat124.includes('import { canonicalizeAssistantOutput } from "../markdown/canonical-output"') &&
			mtest124.includes("fence mermaid terselamatkan, fence json & prosa byte-identical") &&
			gates124.includes("saveMermaidSalvage") &&
			driver124.includes("saveMermaidSalvage") &&
			driver124.includes("REPLY_SLASH2") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.124: /save mensanitasi fence mermaid sebelum masuk vault (crash 'PS' startup note render padam) · saksi slash2+unit menjaga");
		} else {
			console.error("✗ v0.1.124 save-export mermaid salvage regressed");
			failed++;
		}
	}
	// v0.1.125 (owner: mermaid gagal di DUA permukaan — chat SUDAH padam vi0.1.123,
	// editor Live Preview/Reading gagal karena note ditulis agent berlabel kurung mentah):
	// write_note mensanitasi fence mermaid saat menulis (ensureMd ⇒ target selalu markdown;
	// byte-identical di luar fence). Sisipan penemuan matrix: `ID:::class[label]` class-sebelum
	// TIDAK PERNAH valid jison — direorder ke class-sesudah (parse di semua bentuk, 11.16.1).
	{
		const pre125 = read("src/ui/markdown-preprocess.ts");
		const tools125 = read("src/agent/tools.ts");
		const mtest125 = read("test/markdown.test.cjs");
		const ttest125 = read("test/tools.test.cjs");
		const ok =
			/:::/.test(pre125) &&
			pre125.includes("${id}[${inner.trim()}]:::${cls}") &&
			tools125.includes("const planned = planWrite(args, path, original)") &&
			tools125.includes('import { planEdit, planWrite } from "./writePreview";') &&
			mtest125.includes("class-sebelum + kurung → class-sesudah + terkutip") &&
			ttest125.includes("write_note sanitize fence mermaid saat create") &&
			ttest125.includes("raw 'PS' crash shape tidak lolos ke vault") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.125: write_note mensanitasi fence mermaid (note agent tampil di editor) · class-::: direorder · saksi unit tools+markdown menjaga");
		} else {
			console.error("✗ v0.1.125 write_note mermaid sanitize / ::: reorder regressed");
			failed++;
		}
	}
	// Notifications v0.1.142: the actionable Notifications destination is in
	// the only section registry and F33 proves its tab, search results, and
	// native/sound rows. Empty Appearance/About remain absent.
	{
		const stab126 = read("src/settingsTab.ts");
		const bs126 = read("test/real-preview/build-settings.mjs");
		const strip126 = stab126.slice(stab126.indexOf("const SECTIONS"), stab126.indexOf("const SECTION_DESC"));
		const idx126 = (needle) => strip126.indexOf(needle);
		const ok =
			idx126('key: "workspace"') > idx126('key: "model"') &&
			idx126('key: "workspace"') < idx126('key: "safety"') &&
			idx126('key: "safety"') < idx126('key: "agent"') &&
			idx126('key: "notifications"') > idx126('key: "memory"') &&
			idx126('key: "notifications"') < idx126('key: "automations"') &&
			idx126('key: "appearance"') > idx126('key: "agent"') &&
			idx126('key: "appearance"') < idx126('key: "command"') &&
			strip126.includes('key: "notifications", label: "Notifications"') &&
			/* v0.1.190: About returns — last tab, with its renderer method */
			strip126.includes('key: "about", label: "About"') &&
			idx126('key: "about"') > idx126('key: "advanced"') &&
			stab126.includes("private workspace(") &&
			stab126.includes("private safety(") &&
			stab126.includes("private appearance(") &&
			stab126.includes("private notifications(") &&
			stab126.includes("private about(") &&
			bs126.includes('"memory", "notifications", "automations"') &&
			bs126.includes("probes.F33") &&
			bs126.includes('pluginCss, "safety"), "safety"') && // F27seg ikut rumah baru
			bs126.includes("notificationsInTabs") &&
			bs126.includes("notificationsInSearch") &&
			bs126.includes("probes.F35sliders") &&
			stab126.includes('ariaLabel: "Max sessions kept"') &&
			stab126.includes('ariaLabel: "Max tool iterations"') &&
			stab126.includes('ariaLabel: "Memory nudge interval"') &&
			stab126.includes("0 disables") &&
			bs126.includes("approvalMovedToSafety") &&
			bs126.includes("workspaceMovedOut") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ Notifications IA: native/sound tab is in tabs/search; Appearance present after Chat; About last tab with renderer; Workspace/Safety and audited sliders remain");
		} else {
			console.error("✗ v0.1.126 tab restructure regressed");
			failed++;
		}
	}
	// v0.1.127 (owner ×3: "ctrl enter tidak berfungsi" + preferensi bawaan):
	// chord kirim — bawaan Shift+Enter=kirim/Enter=baris baru · toggle ON
	// membalik · Ctrl/Cmd+Enter SELALU kirim di dua mode
	{
		const pi = read("src/ui/components/prompt-input.tsx");
		const mk = read("src/ui/markdown-keys.ts");
		const st = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const app = read("src/ui/ChatApp.tsx");
		const ent = read("test/real-preview/chat-entry.tsx");
		const bld = read("test/real-preview/build.mjs");
		const bs = read("test/real-preview/build-settings.mjs");
		const ut = read("test/markdown.test.cjs");
		const ok =
			pi.includes('sendKey: enterToSend ? "enter" : "shift-enter"') &&
			pi.includes("SELALU mengirim") &&
			pi.includes("e.ctrlKey || e.metaKey || (enterToSend && !e.shiftKey) || (!enterToSend && e.shiftKey)") &&
			pi.includes('document.execCommand("insertLineBreak")') && // satu-satunya jalur newline byte-benar (lane-proof)
			pi.includes("isNewlineChord") &&
			!pi.includes("const plain = !e.shiftKey") && // cabang tombol-mati pabrik lumat
			mk.includes('type SendChord = "enter" | "shift-enter"') &&
			mk.includes("sendKey?: SendChord") &&
			mk.includes('opts.sendKey === "shift-enter"') &&
			st.includes("enterToSend: false,") &&
			!st.includes("enterToSend: true,") && // bawaan dibalik per owner
			tab.includes("Shift+Enter sends, Enter inserts a newline") &&
			tab.includes("Ctrl/Cmd+Enter always sends") &&
			app.includes("(Shift+Enter to send)") &&
			!app.includes("(Ctrl+Enter to send)") &&
			app.includes("Shift+Enter queues this prompt") &&
			ent.includes('scenarioParam() === "keys"') && // fase-2 toggle ON di browser asli
			bld.includes("driveKeys") &&
			bld.includes("newlineSentNothing") &&
			bld.includes("ctrlEnterSent") &&
			bld.includes("?s=keys") &&
			bs.includes("probes.F34") &&
			ut.includes("computeMarkdownEdit: mkEdit") &&
			read("test/markdown-entry.ts").includes('from "../src/ui/markdown-keys"') &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.127: chord kirim — bawaan Shift+Enter · Enter=baris baru sampai wire · Ctrl/Cmd+Enter selalu kirim · saksi driveKeys dua mode + F34 + unit mkEdit");
		} else {
			console.error("✗ v0.1.127 send-chord regressed");
			failed++;
		}
	}
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
	{
		const ic = read("src/ui/icons.tsx");
		const goals = read("src/agent/goals.ts");
		/* v0.1.165 amended: TerminalIcon is live again (slash-popover command
		   rows, Hermes codicon 'terminal' parity) — removed from the dead set.
		   v0.1.169 amended: SidebarIcon (panel-left) retired with the topbar
		   toggle glyph swap; RotateCcwIcon (make("history")) is live there. */
		const gone = ["BotIcon", "UserIcon", "WrenchIcon", "HistoryIcon", "ClockIcon", "PaletteIcon", "PaperclipIcon", "AtSignIcon", "SidebarIcon"];
		const ok =
			gone.every((name) => !ic.includes("export const " + name)) &&
			ic.includes("export const TerminalIcon = make(\"terminal\")") && // live: slash rows
			ic.includes('export const BrainIcon = make("brain")') && // v0.1.176: live again (structured-memory indicator)
			ic.includes('export const RotateCcwIcon = make("history")') && // live: topbar toggle (pre-rename name Obsidian bundles)
			ic.length < 4500 && // file 63 baris ~3k-an; regresi tambahan ikon mati terdeteksi
			!goals.includes("GOAL_JUDGE_SNIPPET_CHARS") &&
			goals.includes("GOAL_MAX_TURNS") && // saudara hidup tak ikut terhapus
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.129: ikon mati + konstanta goals yatim dibersihkan · BrainIcon park · RotateCcw live (SidebarIcon pensiun) · sibling hidup utuh");
		} else {
			console.error("✗ v0.1.129 dead-export cleanup regressed");
			failed++;
		}
	}
	// v0.1.130 (audit batch 3): pdf.worker EKSTERNAL — vendor file + blob Worker
	{
		const pdf = read("src/ui/attach/pdf.ts");
		const rel = read("scripts/release.mjs");
		const bv = read("scripts/build-vendor.mjs");
		const bld = read("test/real-preview/build.mjs");
		const ent = read("test/real-preview/chat-entry.tsx");
		const app = read("src/ui/ChatApp.tsx");
		const fu = read("src/ui/components/file-upload.tsx");
		let dtsGone = false;
		try {
			read("src/ui/attach/pdf-worker.d.ts");
		} catch {
			dtsGone = true;
		}
		const ok =
			pdf.includes("URL.createObjectURL(blob)") &&
			pdf.includes("worker = new Worker(blobUrl)") &&
			pdf.includes("GlobalWorkerOptions.workerPort = worker") &&
			pdf.includes("PDF_ATTACH_TIMEOUT_MS = 30_000") &&
			pdf.includes("isEvalSupported: false") &&
			pdf.includes('import("pdfjs-dist/legacy/build/pdf.mjs")') &&
			!pdf.includes('import("pdfjs-dist/build/pdf.worker.js")') && // jalur inline lama LUMAT
			pdf.includes("src.app.vault.adapter.readBinary") &&
			dtsGone &&
			rel.includes('"vendor/pdf.worker.min.js"') &&
			bv.includes('export const VENDOR_REL = "vendor/pdf.worker.min.js"') &&
			bv.includes('legacy/build/pdf.worker.min.mjs') &&
			bv.includes("bundle: true") &&
			bld.includes("__oaPdfWorkerB64") &&
			bld.includes("buildVendorFile") &&
			ent.includes("__oaPdfWorkerB64") &&
			ent.includes('pluginDir: ".obsidian/plugins/openagent"') &&
			app.includes("pdfWorker={props.pluginDir") &&
			fu.includes("pdfWorker") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.130: pdf.worker eksternal (vendor file + blob Worker asli) · main.js menyusut ✓ · seller rilis/lane komplit");
		} else {
			console.error("✗ v0.1.130 pdf worker externalization regressed");
			failed++;
		}
	}

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

	// v0.1.133 (menuntaskan 🟡 §gap-doc #2): todo tool — 1:1 port Hermes
	// tools/todo_tool.py (studi byte-level): single tool, omit=read, merge
	// flag, caps 4000/256, dedupe last-wins, injection HANYA item aktif.
	{
		const td = read("src/agent/todo.ts");
		const tools = read("src/agent/tools.ts");
		const ses = read("src/agent/sessions.ts");
		const appc = read("src/ui/ChatApp.tsx");
		const rn = read("src/agent/runner.ts");
		const st2 = read("src/settings.ts");
		const tb = read("src/settingsTab.ts");
		const tp = read("test/tools.test.cjs");
		const ok =
			tools.includes('name: "todo"') &&
			tools.includes('toolset: "todo"') &&
			tools.includes("merge=true: update existing items by id") &&
			td.includes("MAX_TODO_CONTENT_CHARS = 4000") &&
			td.includes("MAX_TODO_ITEMS = 256") &&
			td.includes("[Your active task list was preserved across context compression]") &&
			td.includes("formatForInjection") &&
			ses.includes("todos?: TodoItem[]") &&
			appc.includes("todoApiRef") &&
			appc.includes("formatTodoInjection(") &&
			appc.includes("todoRef.current = s.todos") &&
			rn.includes("ephemeralTodoApi()") &&
			st2.includes("clarify: true,") && st2.includes("todo: true,") &&
			tb.includes('key: "todo"') &&
			tp.includes("todo dedupe: last occurrence wins") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.133: todo tool (port Hermes 1:1) — ride session file · injeksi lintas kompresi hanya item aktif · ephemeral di headless/quick-ask · 18 cek unit hijau");
		} else {
			console.error("✗ v0.1.133 Hermes todo port regressed");
			failed++;
		}
	}

	// v0.1.134 (menuntaskan 🟡 §gap-doc #3): vision_analyze — bounded port
	// Hermes tools/vision_tools.py: native pixels ride tool result (envelope
	// bypass clipper), legacy = aux vision + template prompt mereka.
	{
		const v = read("src/agent/vision.ts");
		const tools = read("src/agent/tools.ts");
		const lp = read("src/agent/agentLoop.ts");
		const rn = read("src/agent/runner.ts");
		const st2 = read("src/settings.ts");
		const cm = read("src/agent/contextManager.ts");
		const tp = read("test/tools.test.cjs");
		const al = read("test/agent-loop.test.cjs");
		const ok =
			tools.includes('name: "vision_analyze"') &&
			tools.includes('toolset: "vision"') &&
			v.includes("packNativeVisionResult") &&
			v.includes("unpackNativeVisionResult") &&
			v.includes("detectImageMime") &&
			v.includes("VISION_MAX_IMAGE_BYTES = 5 * 1024 * 1024") &&
			lp.includes("unpackNativeVisionResult(result)") &&
			rn.includes("nativeAvailable") &&
			rn.includes("Security boundary: the image") &&
			rn.includes("Fully describe relevant visible evidence") &&
			st2.includes("todo: true,") && st2.includes("vision: true,") &&
			cm.includes('"webExtract" | "vision"') &&
			tp.includes("vision source: vault path") &&
			al.includes("vision: provider request carries pixels inside the tool message") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.134: vision_analyze — native pixels ride tool result (bypass 20k clipper) · legacy aux+template mereka · magic-byte detect · witness wire-level hijau");
		} else {
			console.error("✗ v0.1.134 Hermes vision port regressed");
			failed++;
		}
	}

	// v0.1.135 (PENUTUP 🟡 §gap-doc #4): delegate_task — port berbatas Hermes
	// tools/delegate_tool.py; rencana docs/plans/hermes-delegation-plan-2026-08-09.
	{
		const dg = read("src/agent/delegate.ts");
		const tools = read("src/agent/tools.ts");
		const rn = read("src/agent/runner.ts");
		const lp = read("src/agent/agentLoop.ts");
		const st2 = read("src/settings.ts");
		const appc = read("src/ui/ChatApp.tsx");
		const tp = read("test/tools.test.cjs");
		const al = read("test/agent-loop.test.cjs");
		const plan = read("docs/plans/hermes-delegation-plan-2026-08-09.md");
		const ok =
			tools.includes('name: "delegate_task"') &&
			tools.includes('toolset: "delegation"') &&
			dg.includes("DELEGATE_ALLOWED_TOOLS") &&
			dg.includes("HEADLESS_ALLOWED_TOOLS") &&
			dg.includes("headlessTools") &&
			dg.includes("DELEGATE_MAX_CONCURRENT = 3") &&
			dg.includes("childSystemPrompt") &&
			dg.includes("focused subagent") &&
			rn.includes("childTools(this.getTools(settings))") &&
			rn.includes("headlessTools(this.getTools(settings))") &&
			rn.includes("runPooled(DELEGATE_MAX_CONCURRENT, workers)") &&
			lp.includes("onDelegateProgress") &&
			st2.includes("vision: true,") && st2.includes("delegation: true,") &&
			appc.includes("onDelegateProgress: (done, total)") &&
			tp.includes("runPooled(3, workers)") &&
			al.includes("delegation: consolidated batch result lands on the wire") &&
			plan.includes("DELEGATE_BLOCKED_TOOLS") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.135+: delegate_task — child/headless fail-closed allowlists · pool 3 · consolidated index-sorted · orchestrator/output_schema ditolak jujur · gap 🟡 TUNTAS SEMUA");
		} else {
			console.error("✗ v0.1.135 Hermes delegation port regressed");
			failed++;
		}
	}
	// v0.1.140 — UI regression patch: every shared SearchField input is
	// explicitly neutral at hover/active while focus remains on its shell;
	// textarea neutralization is scoped to Settings and cannot leak into the
	// snippet confirmation modal or Quick Ask composer.
	{
		const css = read("styles.css");
		const sharedSearchNeutral =
			css.includes(".oa-app .oa-searchbox-input:hover,\n.oa-app .oa-searchbox-input:active,\n.oa-quickask .oa-searchbox-input:hover,\n.oa-quickask .oa-searchbox-input:active {") &&
			css.includes(".oa-app .oa-searchbox-input:focus,\n.oa-app .oa-searchbox-input:focus-visible,\n.oa-quickask .oa-searchbox-input:focus,\n.oa-quickask .oa-searchbox-input:focus-visible {") &&
			css.includes(".oa-app .oa-searchbox--pill:focus-within,\n.oa-quickask .oa-searchbox--pill:focus-within {") &&
			css.includes(".oa-app .oa-searchbox--strip:focus-within,\n.oa-quickask .oa-searchbox--strip:focus-within {");
		const settingsTextareasNeutral =
			css.includes(".oa-settings .oa-mcp-import-text:hover,\n.oa-settings .oa-mcp-import-text:active,\n.oa-settings .oa-mcp-import-text:focus,\n.oa-settings .oa-mcp-import-text:focus-visible {") &&
			css.includes(".oa-settings .oa-profile-soul:hover,\n.oa-settings .oa-profile-soul:active,\n.oa-settings .oa-profile-soul:focus,\n.oa-settings .oa-profile-soul:focus-visible {") &&
			css.includes(".oa-settings .setting-item.oa-has-stacked textarea:hover,\n.oa-settings .setting-item.oa-has-stacked textarea:active,\n.oa-settings .setting-item.oa-has-stacked textarea:focus,\n.oa-settings .setting-item.oa-has-stacked textarea:focus-visible {") &&
			css.includes(".oa-confirm-modal .setting-item.oa-has-stacked textarea:focus {\n\toutline: none;\n\tborder-color: var(--interactive-accent);\n}") &&
			!css.includes(".oa-confirm-modal .setting-item.oa-has-stacked textarea:active") &&
			!css.includes(".oa-settings .setting-item.oa-has-stacked textarea:focus {\n\toutline: none;\n\tborder-color: var(--interactive-accent)") &&
			!css.includes(".oa-settings .oa-mcp-import-text:focus {\n\tborder-color: var(--interactive-accent)");
		if (sharedSearchNeutral && settingsTextareasNeutral) {
			console.log("✓ v0.1.140: shared search hover/active netral + shell focus · Settings textarea netral dan scope-safe");
		} else {
			console.error("✗ v0.1.140 search/Settings textarea UI contract regressed");
			failed++;
		}
	}

	// v0.1.141 — Settings search is a separate input from shared SearchField.
	// Its inner input must defeat late theme hover/active/focus declarations,
	// suppress transition/animation, and leave visible focus on the shell.
	{
		const css = read("styles.css");
		const preview = read("test/real-preview/build-settings.mjs");
		const typedStateBlock =
			css.includes('.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"],\n' +
				'.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:hover,\n' +
				'.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:active,\n' +
				'.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:focus,\n' +
				'.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:focus-visible {') &&
			css.includes("\tbackground: transparent !important;") &&
			css.includes("\tborder: 0 !important;") &&
			css.includes("\tbox-shadow: none !important;") &&
			css.includes("\toutline: none !important;") &&
			css.includes("\ttransition: none !important;") &&
			css.includes("\tanimation: none !important;") &&
			!css.includes(".oa-settings-search .oa-settings-search-input:hover,");
		const adversarialCoverage =
			preview.includes('body.theme-dark input.oa-settings-search-input[type="search"]:hover') &&
			preview.includes("hoverImmediateDiff") && preview.includes("hoverInFlightDiff") && preview.includes("hoverSettledDiff") &&
			preview.includes("activeImmediateDiff") && preview.includes("activeInFlightDiff") && preview.includes("activeSettledInputDiff") &&
			preview.includes("exitImmediateDiff") && preview.includes("exitInFlightDiff") && preview.includes("exitSettledDiff") &&
			preview.includes('shot("settings-search-hover-entry.png")') &&
			preview.includes('shot("settings-search-hover-in-flight.png")') &&
			preview.includes('shot("settings-search-hover-settled.png")') &&
			preview.includes('shot("settings-search-exit-entry.png")') &&
			preview.includes('shot("settings-search-exit-in-flight.png")') &&
			preview.includes('shot("settings-search-exit-settled.png")') &&
			preview.includes("transitionProperty: cs.transitionProperty") &&
			preview.includes("animationName: cs.animationName");
		if (typedStateBlock && adversarialCoverage) {
			console.log("✓ v0.1.141: Settings search inner input hover hard-pinned against late theme paint/motion");
		} else {
			console.error("✗ v0.1.141 Settings search hover hardening regressed");
			failed++;
		}
	}

	// v0.1.144 — one structural fence policy and one canonical assistant-output
	// boundary cover both exact `; %` / `; %%` salvage and every persisted sink.
	{
		const prep = read("src/ui/markdown-preprocess.ts");
		const canonical = read("src/markdown/canonical-output.ts");
		const fences = read("src/markdown/fences.ts");
		const markdownTest = read("test/markdown.test.cjs");
		const toolsTest = read("test/tools.test.cjs");
		const chat = read("src/ui/ChatApp.tsx");
		const quickAsk = read("src/quickask/panel.tsx");
		const main = read("src/main.ts");
		const cron = read("src/agent/cron.ts");
		const previewEntry = read("test/real-preview/chat-entry.tsx");
		const previewDriver = read("test/real-preview/build.mjs");
		const ok =
			prep.includes("MERMAID_TRAILING_PERCENT") &&
			prep.includes("isTopLevelMermaidPosition") &&
			prep.includes("salvageMermaidFlowchartLine") &&
			prep.includes("`${statement}${carriage}\\n${indent}%%${commentText}${carriage}`") &&
			canonical.includes("canonicalizeAssistantOutput") &&
			canonical.includes("sanitizeMermaidFences") &&
			fences.includes("walkMarkdownFences") &&
			fences.includes("clipMarkdownFenceSafe") &&
			markdownTest.includes("diagram owner exact memindah 3 komentar inline") &&
			markdownTest.includes("persen mirip komentar di quote/label/caption byte-identical") &&
			markdownTest.includes("exact inline ; %% dipindah utuh ke own-line") &&
			markdownTest.includes("comment/directive/blank preamble tetap memungkinkan salvage") &&
			toolsTest.includes("write_note v0.1.143 create") &&
			toolsTest.includes("write_note v0.1.143 overwrite") &&
			toolsTest.includes("write_note v0.1.143 append") &&
			chat.includes("canonicalizeAssistantOutput") &&
			quickAsk.includes("canonicalizeAssistantOutput") &&
			main.includes("canonicalizeAssistantOutput") &&
			cron.includes("canonicalizeAssistantOutput") &&
			previewEntry.includes("mermaidExactDoublePreamble") &&
			previewEntry.includes("mermaidCanonical") &&
			previewDriver.includes("h.mermaidExactDoublePreamble") &&
			previewDriver.includes("r.mermaidCanonical") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.144: structural fences · exact Mermaid comments/preamble · canonical chat, Quick Ask, write, and cron boundaries wired");
		} else {
			console.error("✗ v0.1.144 Mermaid canonical/fence coverage regressed");
			failed++;
		}
	}

	plugin.onunload();	if (failed > 0) {
		console.error(`\n${failed} smoke check(s) failed`);
		process.exit(1);
	}
	console.log("\nAll smoke checks passed.");
})().catch((e) => {
	console.error("FAIL:", e);
	process.exit(1);
});

