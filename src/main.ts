/**
 * Open Agent — a self-improving AI agent for Obsidian.
 *
 *  · Agent framework modeled after Nous Research's Hermes Agent
 *    (agent loop, toolsets, skills learning loop, persistent memory,
 *     searchable sessions, cron automations, approval modes).
 *  · Settings modeled after Hermes Desktop.
 *  · Chat UI built with prompt-kit components (ported to Obsidian).
 */

import { Notice, MarkdownView, Platform, Plugin, TFile, WorkspaceLeaf, normalizePath, requestUrl } from "obsidian";
import type { Workspace } from "obsidian";
import type { EditorView } from "@codemirror/view";
import {
	CRON_MONITOR_CONTENT_STORE_MAX,
	CRON_MONITOR_URL_MAX_BYTES,
	CRON_MONITOR_URL_TIMEOUT_MS,
	CRON_RUNS_ROOT,
	archiveStamp,
	buildMonitorBlock,
	buildTaskPrompt,
	cronHash,
	cronRunsFolder,
	findCronTask,
	formatRelative,
	isCronCompleted,
	isSilentOutput,
	newCronTask,
	nextCronRun,
	prepareCronOutput,
	scheduleFromExpr,
	scanCronPrompt,
} from "./agent/cron";
import {
	CRON_SCRIPT_MAX_OUTPUT,
	CRON_SCRIPT_TIMEOUT_MS,
	buildScriptContextBlock,
	defaultCronScriptExecutor,
	interpreterFor,
	resolveScriptPath,
	scriptKindFor,
	sanitizeScriptName,
} from "./agent/cronScripts";
import { allHubTaps, HubClient, pruneHubCache } from "./agent/hub";
import { prunePromptQueue } from "./agent/promptQueue";
import { MemoryStore } from "./agent/memory";
import { EngineMemoryStore } from "./agent/memoryEngine";
import {
	ProfileStore,
	getActiveProfile,
	memoryBaseFolderFor,
	memoryFolderFor,
	resolveConnection,
	sessionSubdirFor,
	skillsBaseFolderFor,
	skillsFolderFor,
} from "./agent/profiles";
import { AgentRunner } from "./agent/runner";
import type { TerminalApi } from "./agent/terminal/types";
import { canonicalVaultPath, pathContains, type WorkspacePolicy } from "./agent/workspacePolicy";
import { trashRespectingPrefs } from "./agent/vaultCompat";
import { SessionStore } from "./agent/sessions";
import { SkillsStore, skillStorageSlug } from "./agent/skills";
import { OpenAgentSettingTab } from "./settingsTab";
import { registerEditorContextMenu } from "./editorMenu";
import {
	AgentProfile,
	CronTask,
	OpenAgentSettings,
	getActiveProvider,
	normalizeLoadedSettings,
	restorePersistedTerminalConsent,
	restorePersistedMcpConsent,
	parseProfileExport,
	parseSettingsExport,
	slugifyProfileId,
	uniqueProfileName,
} from "./settings";
import { McpRuntime } from "./agent/mcp/runtime";
import { applyDefaultToolSelection, buildServerConfig, catalogEntryFor } from "./agent/mcp/catalog";
import { McpSecretStore, migrateLegacyMcpSecrets, splitCatalogEnv, stripCatalogSecrets } from "./agent/mcp/secrets";
import { defaultMcpExec, resolveMcpInstallDir, runMcpGitInstall } from "./agent/mcp/install";
import { CronjobApi } from "./agent/tools";
import { chatCompletion, listModels } from "./agent/providers";
import { activateProviderCatalog, applyFetchedModels, rememberModelInCatalog } from "./agent/modelCatalog";
import { attemptWithResilience, providerUsable, resolveFallbacks, type FallbackTarget } from "./agent/resilience";
import { setActiveMoaPreset } from "./agent/moa";
import { QuickAskController } from "./quickask/controller";
import { createAttemptResetGate } from "./quickask/attemptReset";
import type { ChatMessage } from "./types";
import { CHAT_VIEW_TYPE, ChatView } from "./ui/ChatView";
import { canonicalizeAssistantOutput } from "./markdown/canonical-output";
import { BUILD_STAMP } from "./buildInfo";
import {
	NativeNotificationService,
	type NativeNotificationStatus,
	type NativeNotificationTestResult,
	type OpenAgentNotificationEvent,
} from "./notifications";
import { CompletionSoundPlayer, type CompletionSoundResult } from "./completionSound";

const noop = (): void => {};

/* Focusing a leaf is cosmetic: a failure is never worth surfacing, but a bare
   call leaves the rejection unhandled (silent in an Electron renderer, fatal
   under Node's default in tests). `revealLeaf` is typed `Promise<void>` on
   current Obsidian yet returned plain `void` on older desktop builds — and the
   smoke harness models exactly that. Chaining `.catch` unconditionally would
   throw "revealLeaf(...).catch is not a function", so probe for a thenable. */
function revealQuietly(workspace: Workspace, leaf: WorkspaceLeaf): void {
	const result: unknown = workspace.revealLeaf(leaf);
	if (result && typeof (result as Promise<void>).catch === "function") {
		void (result as Promise<void>).catch(noop);
	}
}

export default class OpenAgentPlugin extends Plugin {
	settings: OpenAgentSettings;
	memoryStore: MemoryStore;
	engineMemory: EngineMemoryStore;
	skillsStore: SkillsStore;
	sessionStore: SessionStore;
	profileStore: ProfileStore;
	hubClient: HubClient;
	runner: AgentRunner;
	private terminalService?: TerminalApi;
	private mcpRuntime: McpRuntime | null = null;
	/** v0.1.163: session id captured before a leaf relocation, handed to the
	 * freshly-mounted ChatView once (restore the same conversation). */
	private pendingChatSessionId: string | null = null;
	quickAsk: QuickAskController;
	private settingTab: OpenAgentSettingTab;
	private nativeNotifications: NativeNotificationService;
	private completionSound: CompletionSoundPlayer;
	private cronTimer: number | null = null;
	private managedFoldersKey = "";
	/** ids of cron tasks currently executing — overlap guard */
	private runningTasks = new Set<string>();

	async onload(): Promise<void> {
		/* build identity line — obsidian caches require(), so "did the new
		   build actually load?" should be answerable from the console */
		console.info(`[Open Agent] build ${BUILD_STAMP}`);
		this.installRejectionNet();
		await this.loadSettings();

		/* Notifications v0.1.142: both channels are per-vault and opt-in.
		   Native permission is never requested here — only the Settings test
		   button may prompt from its user gesture. */
		this.nativeNotifications = new NativeNotificationService(
			() => this.settings.notifications,
			{
				isDesktop: () => Platform.isDesktopApp,
				isAway: () =>
					typeof document !== "undefined" &&
					(document.visibilityState !== "visible" || (typeof document.hasFocus === "function" && !document.hasFocus())),
				isChatVisible: () => this.isChatPaneVisible(),
				activateChat: async () => {
					try {
						window.focus();
					} catch {
						/* focus is best effort; reveal the leaf regardless */
					}
					await this.activateView();
				},
			}
		);
		this.completionSound = new CompletionSoundPlayer(() => this.settings.notifications);
		// owner directive 2026-07-25: purge hub tap caches left behind by taps
		// that no longer exist (removed via ×, or the pre-v0.1.9 bundled taps)
		if (pruneHubCache(this.settings.hubCache, allHubTaps(this.settings.hubTaps))) {
			await this.saveSettings();
		}

		this.memoryStore = new MemoryStore(this.app, this.settings.memoryFolder);
		this.engineMemory = new EngineMemoryStore(this.app, this.settings.memoryFolder);
		this.skillsStore = new SkillsStore(this.app, this.settings.skillsFolder);
		this.sessionStore = new SessionStore(this.app, this.manifest.id, this.settings.maxSessions);
		this.profileStore = new ProfileStore(this.app, this.manifest.id, () => this.settings, () => this.saveSettings());
		// runner reads profile-overlaid settings (provider/model pins)
		this.runner = new AgentRunner(this.app, () => this.effectiveSettings(), this.memoryStore, this.skillsStore, this.engineMemory);
		// cronjob tool backend (agent-driven automations lifecycle)
		this.runner.cronApi = this.cronjobApi();
		// cross-session recall (session_search tool)
		this.runner.sessionsApi = {
			search: (query, limit) => this.sessionStore.snapshot().search(query, limit),
		};
		// MCP runtime (spawns lazily on first tool listing; safe to attach always)
		this.mcpRuntime = new McpRuntime(() => this.effectiveSettings(), async (name) => (await new McpSecretStore(this.app.vault.adapter, this.manifest.id).load())[name] ?? {});
		this.runner.mcpApi = this.mcpRuntime;
		/* Terminal & Processes v1 stays mobile-capable: the service module is
		   acquired only after Obsidian confirms a desktop runtime. It has no
		   eager Node imports; built-ins are required lazily inside service calls. */
		if (Platform?.isDesktopApp === true) {
			const { DesktopTerminalService } = await import("./agent/terminal/service");
			this.terminalService = new DesktopTerminalService(this.app, {
				getSettings: () => this.effectiveSettings(),
			});
			this.runner.attachTerminal(this.terminalService);
		}
		/* Quick Ask (Copilot parity, v0.1.81): floating CM6 panel above the
		   selection. The ViewPlugin rides registerEditorExtension so every
		   markdown editor hosts it; command + context menu share the same
		   gated helper below. Deps are injected (canned in sim lanes). */
		this.quickAsk = new QuickAskController({
			runTurn: (messages, onToken, signal, onRetry, workspacePolicy) =>
				this.runQuickAskTurn(messages, onToken, signal, onRetry, workspacePolicy),
			snapshotWorkspacePolicy: () => this.runner.snapshotWorkspacePolicy(),
			app: this.app,
			component: this,
			/* v0.1.89 — model-picker in-panel (main chat parity): state LIVE,
			   pick menulis this.settings persis alur selectModel ChatApp
			   (activateProviderCatalog → model → remember → leave MoA → save);
			   runTurn membaca effectiveSettings() per kirim sehingga model baru
			   langsung dipakai tanpa plumbing tambahan (pin profil menang,
			   sama seperti chat) */
			getModelMenu: () => {
				const s = this.effectiveSettings();
				const p = s.providers.find((x) => x.id === s.activeProviderId);
				return {
					providerSlug: s.activeProviderId,
					providerName: p?.name ?? s.activeProviderId,
					model: s.model,
					providers: s.providers.map((pr) => ({ slug: pr.id, name: pr.name, models: pr.models ?? [] })),
					visibleModels: this.settings.visibleModels ?? null,
					collapsedSlugs: this.settings.collapsedMenuProviders ?? [],
				};
			},
			onSelectModel: async (provider, m) => {
				const settings = this.settings;
				if (provider !== getActiveProvider(settings)?.id) {
					activateProviderCatalog(settings, provider);
				}
				settings.model = m;
				rememberModelInCatalog(getActiveProvider(settings), m);
				/* a normal-model pick leaves the Mixture of Agents virtual provider */
				if (settings.moa?.active_preset) settings.moa = setActiveMoaPreset(settings.moa, "");
				await this.saveSettings();
			},
			onRefreshModels: () => this.refreshQuickAskModels(),
			onSetVisibleModels: (next) => {
				this.settings.visibleModels = next;
				this.saveSettingsSafe();
			},
			onToggleCollapsed: (slug) => {
				const st = this.settings;
				st.collapsedMenuProviders = st.collapsedMenuProviders.includes(slug)
					? st.collapsedMenuProviders.filter((x) => x !== slug)
					: [...st.collapsedMenuProviders, slug];
				this.saveSettingsSafe();
			},
			onOpenSettings: () => this.openSettings(),
			/* v0.1.85 — live getter: toggle a snippet's Quick Ask flag in
			   Settings → Commands and the NEXT panel shows it (no reload);
			   empty → the panel falls back to its built-in suggestions */
			getSuggestions: () =>
				this.settings.promptSnippets
					.filter((sn) => sn.quickAsk === true)
					.map((sn) => ({ label: sn.title, text: sn.text })),
		});
		this.registerEditorExtension(this.quickAsk.createExtension());
		// Browse Hub client (Hermes Desktop Browse Hub; GitHub taps over HTTPS)
		this.hubClient = new HubClient(
			this.app,
			async (url) => {
				const r = await requestUrl({ url, throw: false });
				return { status: r.status, text: r.text, buffer: r.arrayBuffer };
			},
			() => this.skillsStore.currentFolder,
			() => this.settings.hubCache,
			() => this.saveSettings()
		);
		// point memory/skills/sessions at the persisted active profile
		this.applyProfileFolders();

		// Queues are global settings state but sessions are partitioned by
		// profile/Workspace. Prune only entries proven to belong to the active
		// partition; unowned legacy queues and other partitions must survive.
		{
			const partition = this.sessionStore.partitionKey();
			const ids = new Set((await this.sessionStore.snapshot().list()).map((m) => m.id));
			let changed = prunePromptQueue(this.settings.promptQueue, (sid) => {
				const owner = this.settings.promptQueueScopes[sid];
				return owner !== partition || ids.has(sid);
			});
			for (const sid of Object.keys(this.settings.promptQueueScopes)) {
				if (!this.settings.promptQueue[sid]) {
					delete this.settings.promptQueueScopes[sid];
					changed = true;
				}
			}
			if (changed) await this.saveSettings();
		}

		this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));

		if (this.settings.ribbonIcon) {
			this.addRibbonIcon("bot", "Open Agent", () => this.activateView());
		}

		this.addCommand({
			id: "openagent-open",
			name: "Open Open Agent chat",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "openagent-focus-new",
			name: "Open Agent: new conversation",
			callback: async () => {
				await this.activateView();
			},
		});

		/* Quick Ask (Copilot `TRIGGER_QUICK_ASK` parity; recommended hotkey
		   Ctrl/Cmd+K). checkCallback mirrors Copilot's gate: hidden in
		   source mode, requires an active markdown editor. */
		this.addCommand({
			id: "openagent-quick-ask",
			name: "Open Agent: Quick Ask (floating panel)",
			checkCallback: (checking: boolean) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				const sourceMode =
					(activeView?.getState?.() as { source?: boolean } | undefined)?.source === true;
				if (checking) return !sourceMode && !!activeView?.editor;
				this.quickAskFromEditor();
				return true;
			},
		});

		this.addCommand({
			id: "openagent-next-profile",
			name: "Open Agent: switch to next profile",
			callback: async () => {
				const list = this.settings.profiles;
				if (list.length < 2) return;
				const i = list.findIndex((p) => p.id === this.settings.activeProfileId);
				await this.applyProfile(list[(i + 1) % list.length].id);
			},
		});

		/* editor right-click menu (candidate ③): add/ask/run-skill on the
		   current selection → chat; gated live by settings.editorContextMenu */
		registerEditorContextMenu(this);

		this.settingTab = new OpenAgentSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		// Hermes-style cron scheduler (checked every minute)
		this.cronTimer = window.setInterval(() => {
			void this.tickCron();
		}, 60_000);
		this.registerInterval(this.cronTimer);

		// plugin can't run while Obsidian is closed → offer to catch up
		this.announceMissedCronRuns();
	}

	/**
	 * Last-resort net for promise rejections that escaped their call site
	 * (v0.1.152).
	 *
	 * `saveSettingsSafe()` fixes the known category; this catches the ones we
	 * have not found yet, so a background failure surfaces as a notice instead
	 * of a console line nobody reads.
	 *
	 * Obsidian gives every plugin the same `window`, so this handler sees
	 * rejections from the app and from other plugins too. Claiming those would
	 * put our name on someone else's bug, so an event is only surfaced when the
	 * stack points back into this plugin. The event is never
	 * `preventDefault()`ed — the console record stays intact either way.
	 */
	private installRejectionNet(): void {
		const onRejection = (event: PromiseRejectionEvent): void => {
			const reason: unknown = event.reason;
			const stack = reason instanceof Error ? `${reason.stack ?? ""}` : "";
			/* esbuild stamps the bundle path into stack frames; the plugin id is
			   the stable part of it across vaults and platforms. */
			if (!stack.includes(this.manifest.id)) return;
			const detail = reason instanceof Error ? reason.message : String(reason);
			console.error("[Open Agent] unhandled promise rejection", reason);
			new Notice(`Open Agent: background task failed — ${detail}`, 8000);
		};
		/* A reporter must never be the thing that breaks startup: onload() aborts
		   on a throw and the whole plugin dies. Non-DOM hosts (the smoke harness,
		   any headless runner) have no window.addEventListener at all. */
		const target: unknown = typeof window === "undefined" ? undefined : window;
		if (
			!target ||
			typeof (target as Window).addEventListener !== "function" ||
			typeof (target as Window).removeEventListener !== "function"
		) {
			return;
		}
		const host = target as Window;
		try {
			host.addEventListener("unhandledrejection", onRejection);
		} catch {
			return;
		}
		this.register(() => {
			try {
				host.removeEventListener("unhandledrejection", onRejection);
			} catch {
				/* teardown is best-effort; a failure here must not block unload */
			}
		});
	}

	onunload(): void {
		if (this.cronTimer) window.clearInterval(this.cronTimer);
		this.nativeNotifications?.dispose();
		this.completionSound?.dispose();
		void this.terminalService?.dispose();
		this.runner?.attachTerminal(undefined);
		this.mcpRuntime?.dispose();
		this.mcpRuntime = null;
	}

	private isChatPaneVisible(): boolean {
		try {
			/* A settings/dialog modal visually covers the workspace even when the
			   chat leaf remains laid out behind it. */
			if (document.querySelector(".modal-container.mod-dim")) return false;
			return this.app.workspace
				.getLeavesOfType(CHAT_VIEW_TYPE)
				.some((leaf) => (leaf.view as ChatView).isActuallyVisible?.() === true);
		} catch {
			return false;
		}
	}

	/** Privacy-safe event bridge shared by the React chat and cron runner. */
	handleNotificationEvent(event: OpenAgentNotificationEvent): void {
		if (event.kind === "turnDone") {
			/* App cue is independent of native banners. Only silence the native
			   banner when the cue was genuinely scheduled, avoiding double audio. */
			void this.completionSound.playCompletion(event.contextId).then((result) => {
				this.nativeNotifications.dispatch(event, { silent: result === "played" });
			});
			return;
		}
		this.nativeNotifications.dispatch(event);
	}

	getNativeNotificationStatus(): NativeNotificationStatus {
		return this.nativeNotifications.status();
	}

	testNativeNotification(): Promise<NativeNotificationTestResult> {
		return this.nativeNotifications.testFromUserGesture();
	}

	isCompletionSoundSupported(): boolean {
		return this.completionSound.isSupported();
	}

	previewCompletionSound(variant: number): Promise<CompletionSoundResult> {
		return this.completionSound.preview(variant);
	}

	private targetLeafFor(loc: "left" | "main" | "right"): WorkspaceLeaf | null {
		const { workspace } = this.app;
		return loc === "left" ? workspace.getLeftLeaf(false) : loc === "main" ? workspace.getLeaf(false) : workspace.getRightLeaf(false);
	}

	private leafRegion(leaf: WorkspaceLeaf): "left" | "main" | "right" {
		const { workspace } = this.app;
		const root = leaf.getRoot();
		return root === workspace.leftSplit ? "left" : root === workspace.rightSplit ? "right" : "main";
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (leaves.length === 0) {
			const target = this.targetLeafFor(this.settings.chatLeafLocation);
			await target?.setViewState({ type: CHAT_VIEW_TYPE, active: true });
			if (target) revealQuietly(workspace, target);
			return;
		}
		await this.moveChatViewToConfiguredLocation();
	}

	/** v0.1.163: relocate an OPEN chat to the configured location, immediately.
	 * No-op when no chat is open or the leaf is already there. Used by both the
	 * ribbon/command opener and the settings change handler, so flipping the
	 * location needs no second click. The live session id is captured first so
	 * the recreated view restores the same conversation. */
	async moveChatViewToConfiguredLocation(): Promise<void> {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		if (leaves.length === 0) return;
		const leaf = leaves[0];
		const loc = this.settings.chatLeafLocation;
		const target = this.targetLeafFor(loc);
		if (!target || this.leafRegion(leaf) === loc) {
			revealQuietly(workspace, leaf);
			return;
		}
		/* capture the conversation before the old view unmounts */
		const chatView = (leaf as { view?: unknown }).view as { getCurrentSessionId?: () => string | null } | undefined;
		this.pendingChatSessionId = chatView?.getCurrentSessionId?.() ?? null;
		const state = leaf.getViewState();
		leaf.detach();
		await target.setViewState(state);
		revealQuietly(workspace, target);
	}

	/** v0.1.163: hand the pending session id to a freshly-mounted ChatView and
	 * clear it (one-shot). */
	consumePendingChatSessionId(): string | null {
		const id = this.pendingChatSessionId;
		this.pendingChatSessionId = null;
		return id;
	}

	openSettings(section?: string): void {
		const setting = (this.app as any).setting;
		setting?.open();
		setting?.openTabById(this.manifest.id);
		if (section) this.settingTab?.showSection(section);
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
			(leaf.view as ChatView).refresh?.();
		}
	}

	/* ---------------- settings persistence ---------------- */

	/** Consent ledger is separate from data.json/settings exports and scoped to
	 * this physical desktop vault. Moving/copying a vault intentionally causes
	 * a fresh first-use prompt rather than carrying terminal consent with it. */
	private mcpConsentLedgerKey(): string {
		let vaultIdentity = this.app.vault.getName();
		try {
			const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
			const basePath = adapter.getBasePath?.();
			if (typeof basePath === "string" && basePath) vaultIdentity = basePath;
		} catch {
			/* name fallback */
		}
		return `openagent:mcp-consent:v1:${this.manifest.id}:${vaultIdentity}`;
	}

	private readMcpConsentLedger(): string {
		try {
			return globalThis.localStorage?.getItem(this.mcpConsentLedgerKey()) ?? "";
		} catch {
			return "";
		}
	}

	private writeMcpConsentLedger(receipt: string | null): void {
		let storage: Storage;
		try {
			storage = globalThis.localStorage;
			if (!storage) throw new Error("local storage is unavailable");
			const key = this.mcpConsentLedgerKey();
			if (receipt === null) storage.removeItem(key);
			else {
				storage.setItem(key, receipt);
				if (storage.getItem(key) !== receipt) throw new Error("receipt verification failed");
			}
		} catch (err) {
			throw new Error(`Could not update the local MCP-consent ledger: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	/** Only the checked first-use modal calls this (mirrors terminal consent). */
	async grantMcpConsent(): Promise<void> {
		const previousLedger = this.readMcpConsentLedger();
		const previous = {
			version: this.settings.mcpConsent.consentVersion,
			receipt: this.settings.mcpConsent.consentReceipt,
			enabled: this.settings.mcpEnabled,
		};
		const receipt = this.newTerminalConsentReceipt(); // 32-byte random — shared generator
		this.writeMcpConsentLedger(receipt);
		this.settings.mcpConsent.consentVersion = 1;
		this.settings.mcpConsent.consentReceipt = receipt;
		this.settings.mcpEnabled = true;
		try {
			await this.saveSettings();
		} catch (err) {
			this.settings.mcpConsent.consentVersion = previous.version;
			this.settings.mcpConsent.consentReceipt = previous.receipt;
			this.settings.mcpEnabled = previous.enabled;
			try {
				this.writeMcpConsentLedger(previousLedger || null);
			} catch {
				/* fail closed */
			}
			throw err;
		}
	}

	/**
	 * Install a catalog entry end-to-end (mirrors `hermes mcp install <name>`):
	 * git clone + bootstrap when the entry ships as a repo, collect api-key env
	 * values, translate the manifest into an `mcpServers.<name>` block, apply
	 * the safe-by-default tool selection, and save.
	 */
	async installMcpCatalogEntry(
		name: string,
		envValues: Record<string, string>,
	): Promise<{ ok: boolean; error?: string; postInstall?: string }> {
		const entry = catalogEntryFor(name);
		if (!entry) return { ok: false, error: `Catalog entry “${name}” not found.` };
		if (entry.auth.type === "oauth") {
			return { ok: false, error: `“${entry.name}” uses OAuth, which this plugin does not run.` };
		}

		let installDir: string | undefined;
		if (entry.install) {
			const base = this.vaultBasePath();
			if (!base) return { ok: false, error: "Could not resolve the vault's physical path for the install." };
			const exec = defaultMcpExec();
			if (!exec) return { ok: false, error: "Catalog installs run only on the desktop app (Node runtime unavailable)." };
			installDir = resolveMcpInstallDir(base, this.manifest.id, entry.name);
			const result = await runMcpGitInstall(entry.install, installDir, exec);
			if (!result.ok) return { ok: false, error: result.error ?? "Install failed." };
		}

		const cfg = buildServerConfig(entry, installDir);
		const secretValues: Record<string, string> = {};
		if (entry.auth.type === "api_key") {
			const normalized: Record<string, string> = {};
			for (const spec of entry.auth.env) {
				const v = (envValues[spec.name] ?? "").trim();
				if (!v && spec.required) return { ok: false, error: `${spec.name} is required but was left empty.` };
				if (v) normalized[spec.name] = v;
				else if (spec.default !== undefined) normalized[spec.name] = spec.default;
			}
			const split = splitCatalogEnv(entry, normalized);
			Object.assign(secretValues, split.secret);
			if (Object.keys(split.config).length) cfg.env = { ...(cfg.env ?? {}), ...split.config };
		}

		/* Preserve a prior custom tool selection on reinstall; otherwise apply
		   the catalog's safe-by-default selection. */
		const prior = this.settings.mcpServers[entry.name];
		if (prior?.tools) cfg.tools = prior.tools;
		else applyDefaultToolSelection(cfg, entry.tools.default_enabled);

		if (Object.keys(secretValues).length) {
			const secrets = new McpSecretStore(this.app.vault.adapter, this.manifest.id);
			const stored = await secrets.load();
			await secrets.save({ ...stored, [entry.name]: { ...(stored[entry.name] ?? {}), ...secretValues } });
		}
		this.settings.mcpServers[entry.name] = cfg;
		await this.saveSettings();
		return { ok: true, postInstall: entry.post_install };
	}

	private terminalConsentLedgerKey(): string {
		let vaultIdentity = this.app.vault.getName();
		try {
			const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
			const basePath = adapter.getBasePath?.();
			if (typeof basePath === "string" && basePath) vaultIdentity = basePath;
		} catch {
			/* Name fallback is only relevant where a desktop base path is absent. */
		}
		return `openagent:terminal-consent:v1:${this.manifest.id}:${vaultIdentity}`;
	}

	private readTerminalConsentLedger(): string {
		try {
			return globalThis.localStorage?.getItem(this.terminalConsentLedgerKey()) ?? "";
		} catch {
			return "";
		}
	}

	private writeTerminalConsentLedger(receipt: string | null): void {
		let storage: Storage;
		try {
			storage = globalThis.localStorage;
			if (!storage) throw new Error("local storage is unavailable");
			const key = this.terminalConsentLedgerKey();
			if (receipt === null) storage.removeItem(key);
			else {
				storage.setItem(key, receipt);
				if (storage.getItem(key) !== receipt) throw new Error("receipt verification failed");
			}
		} catch (err) {
			throw new Error(`Could not update the local terminal-consent ledger: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private newTerminalConsentReceipt(): string {
		const cryptoApi = globalThis.crypto;
		if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
			throw new Error("Secure random generation is unavailable; terminal consent was not saved.");
		}
		const bytes = new Uint8Array(32);
		cryptoApi.getRandomValues(bytes);
		return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
	}

	/** Only the explicit checked first-use modal calls this capability mint. */
	async grantTerminalConsent(): Promise<void> {
		const previousLedger = this.readTerminalConsentLedger();
		const previous = {
			version: this.settings.terminal.consentVersion,
			receipt: this.settings.terminal.consentReceipt,
			enabled: this.settings.toolsets.terminal,
		};
		const receipt = this.newTerminalConsentReceipt();
		this.writeTerminalConsentLedger(receipt);
		this.settings.terminal.consentVersion = 1;
		this.settings.terminal.consentReceipt = receipt;
		this.settings.toolsets.terminal = true;
		try {
			await this.saveSettings();
		} catch (err) {
			this.settings.terminal.consentVersion = previous.version;
			this.settings.terminal.consentReceipt = previous.receipt;
			this.settings.toolsets.terminal = previous.enabled;
			try {
				this.writeTerminalConsentLedger(previousLedger || null);
			} catch {
				/* Either outcome fails closed because the data/ledger pair differs. */
			}
			throw err;
		}
	}

	async loadSettings(): Promise<void> {
		const raw = (await this.loadData()) ?? {};
		/* Imports and generic normalization always reject consent. Normal app
		   startup restores it only when data.json and this vault's local ledger
		   carry the exact same random receipt minted by the checked modal. */
		this.settings = restorePersistedTerminalConsent(
			normalizeLoadedSettings(raw),
			raw,
			this.readTerminalConsentLedger()
		);
		this.settings = restorePersistedMcpConsent(
			this.settings,
			raw,
			this.readMcpConsentLedger()
		);
		const secrets = new McpSecretStore(this.app.vault.adapter, this.manifest.id);
		let secretData = await secrets.load();
		let migrated = false;
		for (const [name, cfg] of Object.entries(this.settings.mcpServers)) {
			const entry = catalogEntryFor(name);
			if (!entry) continue;
			const next = migrateLegacyMcpSecrets(entry, cfg, secretData);
			if (!next.moved.length) continue;
			this.settings.mcpServers[name] = next.config;
			secretData = next.store;
			migrated = true;
		}
		if (migrated) {
			await secrets.save(secretData);
			await this.saveData(this.settings);
		}
		this.memoryStore?.setLimits(this.settings.memoryCharLimit, this.settings.userCharLimit);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		/* Workspace/profile roots are live settings. Rebind managed stores on
		   every save; guards cover early onload before stores are constructed. */
		if (this.memoryStore) this.memoryStore.setLimits(this.settings.memoryCharLimit, this.settings.userCharLimit);
		if (this.memoryStore && this.skillsStore && this.sessionStore) this.applyProfileFolders();
		/* A backend/consent/approval/Workspace change invalidates prepared
		   approvals and terminates work started under the old security identity. */
		if (this.runner) await this.runner.reconcileTerminal(this.effectiveSettings());
	}

	/**
	 * Fire-and-forget settings save for UI callbacks (v0.1.152).
	 *
	 * `saveSettings()` deliberately keeps throwing: ten call sites (MCP and
	 * terminal consent, chat message transactions) roll their in-memory state
	 * back when the write fails, and swallowing the error there would leave
	 * consent recorded as granted while nothing reached disk.
	 *
	 * The other ~129 call sites are Obsidian control callbacks — `onChange`,
	 * `onClick`, `onSubmit`. Those discard the promise they are handed, so a
	 * rejected write vanished silently: the toggle stayed flipped, no notice
	 * appeared, and the setting was gone on the next restart. Anything that
	 * only needs "save it, tell the user if that failed" belongs here.
	 */
	saveSettingsSafe(): void {
		void this.saveSettings().catch((err) => {
			const detail = err instanceof Error ? err.message : String(err);
			console.error("[Open Agent] failed to save settings", err);
			new Notice(`Open Agent: could not save settings — ${detail}`, 8000);
		});
	}

	/* ---------------- data portability & reset ----------------
	   (docs/plans/data-portability-plan.md) — UI lives at the bottom of
	   General; all logic is here/settings.ts so it stays testable. */

	/**
	 * Import a settings export: validate → same migration pipeline as app
	 * load → persist → rebind. Nothing is written unless validation passes.
	 */
	async importSettingsFromText(text: string): Promise<{ ok: boolean; error?: string }> {
		let candidate: OpenAgentSettings;
		try {
			candidate = normalizeLoadedSettings(parseSettingsExport(text));
			/* Settings import is configuration-only: catalog secret env values are
			   discarded rather than creating credentials in the private store. */
			candidate.mcpServers = stripCatalogSecrets(candidate.mcpServers, catalogEntryFor);
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
		/* Persist the validated candidate before publishing it to live stores.
		   A validation/save failure therefore leaves both the active settings
		   object and every profile/Workspace binding untouched. */
		try {
			await this.saveData(candidate);
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
		this.settings = candidate;
		/* Imports always revoke terminal enablement. Reconcile immediately so
		   commands owned by the replaced security settings cannot survive until
		   a later ordinary save. */
		await this.runner?.reconcileTerminal(this.effectiveSettings());
		this.applyProfileFolders();
		this.refreshViews();
		new Notice("Open Agent: settings imported.");
		return { ok: true };
	}

	/**
	 * Import a soul bundle — ALWAYS creates a new profile (never overwrites).
	 * Skills included in the bundle are installed into the new profile's folder.
	 */
	async importProfileFromText(
		text: string
	): Promise<{ ok: boolean; name?: string; skills?: number; error?: string }> {
		let payload: ReturnType<typeof parseProfileExport>;
		try {
			payload = parseProfileExport(text);
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}

		const current = this.settings;
		const currentSnapshot = JSON.stringify(current);
		const settingsStillCurrent = () => this.settings === current && JSON.stringify(current) === currentSnapshot;
		const name = uniqueProfileName(payload.name, current.profiles.map((p) => p.name));
		const taken = new Set(current.profiles.map((p) => p.id));
		let id = slugifyProfileId(name, taken);
		/* Kept folders from a previously deleted profile are not safe staging
		   space: choose a fresh id instead of overwriting or later rolling back
		   somebody's orphaned data. */
		try {
			while (
				await this.app.vault.adapter.exists(canonicalVaultPath(`openagent/profiles/${id}`, { label: "Imported profile root" })) ||
				await this.app.vault.adapter.exists(
					canonicalVaultPath(`${this.app.vault.configDir}/plugins/${this.manifest.id}/sessions/${id}`, {
						label: "Imported profile session root",
					})
				)
			) {
				taken.add(id);
				id = slugifyProfileId(name, taken);
			}
		} catch (e) {
			return { ok: false, error: e instanceof Error ? e.message : String(e) };
		}
		if (!settingsStillCurrent()) {
			return { ok: false, error: "Settings changed while the profile import was being prepared; no profile was imported. Please try again." };
		}
		const profile: AgentProfile = {
			id,
			name,
			color: payload.color,
			soul: payload.soul,
			providerId: payload.providerId,
			model: payload.model,
			createdAt: Date.now(),
		};
		const candidate = JSON.parse(JSON.stringify(current)) as OpenAgentSettings;
		candidate.profiles = [...candidate.profiles, profile];
		const profileRoot = canonicalVaultPath(`openagent/profiles/${id}`, { label: "Imported profile root" });
		let stagedRootCreated = false;
		const cleanupStagedProfile = async (): Promise<string | null> => {
			if (!stagedRootCreated) return null;
			try {
				if (await this.app.vault.adapter.exists(profileRoot)) await this.app.vault.adapter.rmdir(profileRoot, true);
				return null;
			} catch (e) {
				return e instanceof Error ? e.message : String(e);
			}
		};

		let skills = 0;
		try {
			if (payload.skills?.length) {
				/* Reject canonical collisions before the first Vault mutation. */
				const plannedSlugs = new Set<string>();
				for (const sk of payload.skills) {
					const slug = skillStorageSlug(sk.name);
					if (plannedSlugs.has(slug)) throw new Error(`Profile bundle contains duplicate skill slug: ${slug}`);
					plannedSlugs.add(slug);
				}
				/* Claim a root that was proven absent. Rollback is permitted only
				   after this exact create succeeds, never merely after an exists()
				   observation that could race retained/external data. */
				await this.app.vault.createFolder(profileRoot);
				stagedRootCreated = true;
				const store = new SkillsStore(this.app, skillsFolderFor(profile, candidate));
				const written = new Set<string>();
				for (const sk of payload.skills) {
					const path = await store.createSkill(sk.name, sk.whenToUse || sk.name, sk.whenToUse, sk.instructions);
					if (written.has(path)) throw new Error(`Profile bundle contains duplicate skill path: ${path}`);
					written.add(path);
					skills++;
				}
			}
			/* Publish the profile only after every bundled skill is staged. The
			   live settings object is still untouched if persistence rejects. */
			if (!settingsStillCurrent()) {
				throw new Error("Settings changed while bundled skills were being staged; the import was cancelled.");
			}
			await this.saveData(candidate);
		} catch (e) {
			const cleanupError = await cleanupStagedProfile();
			const reason = e instanceof Error ? e.message : String(e);
			return {
				ok: false,
				error: cleanupError ? `${reason} (staged profile cleanup also failed: ${cleanupError})` : reason,
			};
		}

		this.settings = candidate;
		this.applyProfileFolders();
		this.refreshViews();
		return { ok: true, name, skills };
	}

	/** Reset ONLY settings (agent-data folders untouched). */
	async resetSettingsToDefaults(): Promise<void> {
		/* A reset also revokes the non-portable first-use acknowledgement. */
		this.writeTerminalConsentLedger(null);
		this.settings = normalizeLoadedSettings({});
		await this.saveSettings();
		this.applyProfileFolders();
		this.refreshViews();
		new Notice("Open Agent: settings reset to defaults.");
	}

	/** All managed roots across Workspace partitions, plus legacy and
	 *  plugin-private session roots (shown by Reset Everything). */
	agentDataFolders(): string[] {
		const s = this.settings;
		const out = new Set<string>();
		for (const p of s.profiles) {
			try { out.add(memoryBaseFolderFor(p, s)); } catch { /* invalid imported root: never reinterpret */ }
			try { out.add(skillsBaseFolderFor(p, s)); } catch { /* invalid imported root: never reinterpret */ }
		}
		try {
			out.add(canonicalVaultPath(s.sessionsFolder, { label: "Legacy sessions folder" }));
		} catch {
			/* invalid legacy setting is not allowed to reach a delete sink */
		}
		out.add(normalizePath(CRON_RUNS_ROOT));
		out.add(this.sessionStore.storagePath());
		return [...out].sort();
	}

	/**
	 * Reset EVERYTHING: agent-data folders are moved to the SYSTEM TRASH
	 * (recoverable via the OS — never permanently deleted), then settings
	 * are reset to defaults. Returns the folders actually moved.
	 */
	async resetEverything(): Promise<string[]> {
		const folders = this.agentDataFolders(); // compute BEFORE resetting settings
		const privateSessions = this.sessionStore.storagePath();
		const moved: string[] = [];
		for (const f of folders) {
			if (f === privateSessions) continue;
			const af = this.app.vault.getAbstractFileByPath(f);
			if (!af) continue;
			try {
				await trashRespectingPrefs(this.app, af);
				moved.push(f);
			} catch (e) {
				console.warn(`[Open Agent] could not trash ${f}:`, e);
			}
		}
		if (await this.sessionStore.clearAll()) moved.push(privateSessions);
		try {
			const secrets = new McpSecretStore(this.app.vault.adapter, this.manifest.id);
			await secrets.clear();
		} catch (e) {
			console.warn(`[Open Agent] could not clear MCP secrets:`, e);
		}
		await this.resetSettingsToDefaults();
		return moved;
	}

	/** Write an administrative export under its fixed control-plane root. */
	async writeExportFile(fileName: string, text: string): Promise<string> {
		const folder = canonicalVaultPath("openagent/exports", { label: "Administrative export folder" });
		const leaf = canonicalVaultPath(fileName, { label: "Administrative export filename" });
		if (leaf.includes("/")) throw new Error("Administrative export filename must not contain folders.");
		const path = canonicalVaultPath(`${folder}/${leaf}`, { label: "Administrative export path" });
		if (!pathContains(folder, path)) throw new Error("Administrative export escaped its fixed folder.");
		await this.app.vault.createFolder(folder).catch(noop);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) await this.app.vault.modify(existing, text);
		else await this.app.vault.create(path, text);
		return path;
	}

	/* ---------------- profiles ---------------- */

	/** Settings overlaid with the active profile's provider/model pins (runner view). */
	effectiveSettings(): OpenAgentSettings {
		const s = this.settings;
		if (s.profiles.length === 0) return s;
		const conn = resolveConnection(s);
		if (conn.providerId === s.activeProviderId && conn.model === s.model) return s;
		return { ...s, activeProviderId: conn.providerId, model: conn.model };
	}

	/* ---------------- Quick Ask (v0.1.81, Copilot parity) ---------------- */

	/** Shared Quick Ask entry point — command AND editor context menu.
	    Guards mirror Copilot's handler (same order, same politeness). */
	quickAskFromEditor(): void {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		/* source mode = plain markdown textarea, no CM6 to anchor into
		   (Copilot: isSourceModeOn() → getState().source === true) */
		const sourceMode =
			(activeView?.getState?.() as { source?: boolean } | undefined)?.source === true;
		if (sourceMode) {
			new Notice("Open Agent: Quick Ask is not available in source mode.");
			return;
		}
		if (!activeView || !activeView.editor) {
			new Notice("Open Agent: no active editor found.");
			return;
		}
		/* runtime-only surface (absent from obsidian.d.ts): the CM6 EditorView
		   behind the Obsidian editor — feature-detected, never assumed */
		const cm = (activeView.editor as unknown as { cm?: EditorView }).cm;
		if (!cm) {
			new Notice("Open Agent: could not access the CodeMirror editor.");
			return;
		}
		this.quickAsk.show(activeView, cm);
	}

	/** Quick Ask turn: plain multi-turn chat on the ACTIVE connection
	    (profile-aware) — tools null, no retry/failover (Copilot parity;
	    deliberate divergence from the chat loop's resilience policy). */
	/** v0.1.89 — "Refresh Models" di picker Quick Ask: parity verbatim
	    dengan refreshModels ChatApp (fetch per provider TERHUBUNG, kegagalan
	    terisolasi dan dinamai dalam satu Notice ringkasan; menu tetap buka
	    selama jalan — komponen yang menjamin, bukan kita) */
	private async refreshQuickAskModels(): Promise<void> {
		const settings = this.settings;
		const targets = settings.providers.filter((p) => providerUsable(p));
		if (targets.length === 0) {
			new Notice("Open Agent: configure a provider first.");
			return;
		}
		const results = await Promise.all(
			targets.map(async (p) => {
				try {
					return { p, models: await listModels(p) };
				} catch (e) {
					return { p, error: e instanceof Error ? e.message : String(e) };
				}
			})
		);
		let loaded = 0;
		const errors: string[] = [];
		for (const r of results) {
			if ("error" in r) errors.push(`${r.p.name}: ${r.error}`);
			else if (r.models.length === 0) errors.push(`${r.p.name}: returned no models`);
			else {
				applyFetchedModels(settings, r.p.id, r.models);
				loaded++;
			}
		}
		if (loaded > 0) await this.saveSettings();
		if (loaded > 0 && errors.length === 0) {
			new Notice(`Open Agent: refreshed ${loaded} provider catalog(s).`);
		} else if (loaded > 0) {
			new Notice(`Open Agent: refreshed ${loaded} catalog(s) — failed: ${errors.join("; ")}`, 9000);
		} else {
			new Notice(`Open Agent: failed to fetch models — ${errors.join("; ") || "no provider configured"}`, 9000);
		}
	}

	private async runQuickAskTurn(
		messages: ChatMessage[],
		onToken: (text: string) => void,
		signal: AbortSignal,
		onRetry: (() => void) | undefined,
		_workspacePolicy: WorkspacePolicy
	): Promise<string> {
		const s = JSON.parse(JSON.stringify(this.effectiveSettings())) as OpenAgentSettings;
		const provider = s.providers.find((p) => p.id === s.activeProviderId);
		if (!provider) throw new Error("no active provider — pick one in Settings → Providers.");
		/* v0.1.92 (sisa terakhir paket Quick Ask): retry + failover MEMinjam
		   resilience.ts — percobaan per kelas error (maxAttempts), jeda
		   backoffMs; failover turn-scoped = MAKSIMAL SATU swap ke fallback
		   valid pertama (resolveFallbacks sudah memfilter yang tak usable);
		   turn berikutnya mulai dari primary lagi. onRetry mereset stream
		   parsial di panel. Model fallback ikut target via override s. */
		const fb = resolveFallbacks(s)[0];
		const targets: FallbackTarget[] = fb
			? [{ provider, model: s.model }, fb]
			: [{ provider, model: s.model }];
		/* chatCompletion can discard its stream before trying a buffered
		   replacement; if that buffered request then fails, the outer retry
		   helper observes the same discarded attempt. Coalesce those two
		   notifications so Quick Ask resets exactly once per failed attempt. */
		const resetGate = createAttemptResetGate(onRetry);
		return attemptWithResilience(
			targets.map((t) => () => {
				resetGate.beginAttempt();
				return chatCompletion(t.provider, { ...s, activeProviderId: t.provider.id, model: t.model }, messages, null, {
					onToken,
					onReset: onRetry ? resetGate.resetOnce : undefined,
					signal,
				}).then((res) => canonicalizeAssistantOutput(res.content));
			}),
			{ signal, onRetry: onRetry ? resetGate.resetOnce : undefined }
		);
	}

	/** Point memory/skills/sessions stores at the active profile's folders. */
	private applyProfileFolders(): void {
		const p = getActiveProfile(this.settings);
		if (!p) return;
		const memoryFolder = memoryFolderFor(p, this.settings);
		const skillsFolder = skillsFolderFor(p, this.settings);
		const sessionSubdir = sessionSubdirFor(p, this.settings);
		const key = JSON.stringify([memoryFolder, skillsFolder, sessionSubdir]);
		if (key === this.managedFoldersKey) return;
		this.memoryStore.setFolder(memoryFolder);
		this.engineMemory.setFolder(memoryFolder);
		this.skillsStore.setFolder(skillsFolder);
		this.sessionStore.setSubdir(sessionSubdir);
		this.managedFoldersKey = key;
	}

	/**
	 * Switch the active profile (Hermes `profile use`). Persists, rebinds
	 * the per-profile folders and refreshes views — the chat view sees the
	 * id change and starts a fresh conversation with its own session list.
	 */
	async applyProfile(id: string): Promise<void> {
		const p = this.settings.profiles.find((x) => x.id === id);
		if (!p) return;
		if (this.settings.activeProfileId !== id) {
			this.settings.activeProfileId = id;
			await this.saveSettings();
		}
		this.applyProfileFolders();
		this.refreshViews();
	}

	/* ---------------- cron (Hermes-style automations) ---------------- */

	private async tickCron(): Promise<void> {
		const now = Date.now();
		const runSettings = JSON.parse(JSON.stringify(this.effectiveSettings())) as OpenAgentSettings;
		let policy: WorkspacePolicy;
		try {
			policy = this.runner.snapshotWorkspacePolicy(runSettings);
		} catch {
			return; // invalid Strict policy is repaired in Settings; no background widening
		}
		for (const task of this.settings.cronTasks) {
			if (!task.enabled) continue;
			if (task.nextRun <= 0 || task.nextRun > now) continue;
			if (this.runningTasks.has(task.id)) continue; // overlap guard
			const storedTarget = task.targetNote.toLowerCase().endsWith(".md") ? task.targetNote : `${task.targetNote}.md`;
			if (!policy.allowsPath(storedTarget)) continue;
			await this.runCronTask(task.id, false, policy, runSettings);
		}
	}

	async runCronTask(
		taskId: string,
		manual: boolean,
		inheritedPolicy?: WorkspacePolicy,
		inheritedSettings?: OpenAgentSettings
	): Promise<void> {
		const task = this.settings.cronTasks.find((t) => t.id === taskId);
		if (!task) return;
		const runSettings = JSON.parse(JSON.stringify(inheritedSettings ?? this.effectiveSettings())) as OpenAgentSettings;
		let workspacePolicy: WorkspacePolicy;
		let targetPath: string;
		try {
			const settingsPolicy = this.runner.snapshotWorkspacePolicy(runSettings);
			workspacePolicy = inheritedPolicy ?? settingsPolicy;
			if (workspacePolicy.scopeKey !== settingsPolicy.scopeKey) {
				throw new Error("Automation settings do not match the inherited Workspace scope.");
			}
			const storedTarget = task.targetNote.toLowerCase().endsWith(".md") ? task.targetNote : `${task.targetNote}.md`;
			targetPath = workspacePolicy.assertVisiblePath(storedTarget, "Automation target note");
		} catch (e) {
			if (manual) new Notice(`Open Agent: automation is unavailable in this workspace (${e instanceof Error ? e.message : String(e)}).`);
			return;
		}
		if (this.runningTasks.has(task.id)) {
			if (manual) new Notice(`Open Agent: “${task.name}” is already running.`);
			return;
		}
		this.runningTasks.add(task.id);
		if (manual) new Notice(`Open Agent: running “${task.name}”…`);
		const started = Date.now();
		const prevRunAt = task.lastRun; // capture before lastRun becomes "now"
		task.lastRun = started;
		try {
			/* Chain context is model-visible. Never carry it across an exposure-policy
			   change, even when the persisted target remains visible in both scopes. */
			const scopedTask = task.lastWorkspaceScope === workspacePolicy.scopeKey
				? task
				: { ...task, lastOutput: undefined };

			/* v0.1.147 script/no_agent watchdog (Hermes script parity): run a
			   user-managed script from the protected config dir before the
			   agent. no_agent delivers its stdout verbatim (no LLM at all). */
			let scriptBlock: string | null = null;
			if (task.script) {
				const scriptResult = await this.executeCronScript(task.script);
				if (!scriptResult.ok) {
					const msg = scriptResult.error ?? "Script failed.";
					task.runCount += 1;
					task.lastStatus = "error";
					task.lastError = msg;
					await this.writeCronOutput(task, started, this.runDurationSec(started), false, msg, false, workspacePolicy, targetPath).catch(noop);
					new Notice(`Open Agent cron script failed (“${task.name}”): ${msg}`);
					this.handleNotificationEvent({ kind: "backgroundError", contextId: task.id });
					return; // finally advances nextRun + saves
				}
				if (task.noAgent) {
					task.runCount += 1;
					task.lastStatus = "ok";
					delete task.lastError;
					task.lastOutput = scriptResult.stdout.slice(0, 2000);
					task.lastWorkspaceScope = workspacePolicy.scopeKey;
					await this.writeCronOutput(task, started, this.runDurationSec(started), true, scriptResult.stdout, false, workspacePolicy, targetPath);
					if (manual) new Notice(`Open Agent: “${task.name}” script finished → ${task.targetNote}`);
					else if (task.notify) {
						new Notice(`Open Agent: “${task.name}” script finished → ${task.targetNote} (${this.runDurationSec(started)}s)`);
						this.handleNotificationEvent({ kind: "backgroundDone", contextId: task.id });
					}
					if (task.enabled && isCronCompleted(task)) {
						task.enabled = false;
						new Notice(`Open Agent: “${task.name}” completed its ${task.maxRuns} run${task.maxRuns === 1 ? "" : "s"} — automation disabled.`);
					}
					return; // finally advances nextRun + saves
				}
				scriptBlock = buildScriptContextBlock(scriptResult.stdout);
			}

			/* v0.1.147 monitor change-detection (Hermes monitor_url parity):
			   fetch the watched URL, hash it byte-exact. Unchanged → skip the
			   agent run entirely (a silent no-change tick); changed → inject a
			   bounded unified diff. Fetch failure fails OPEN (normal run). */
			let monitorBlock: string | null = null;
			if (task.monitorUrl) {
				const fetched = await this.fetchCronMonitor(task.monitorUrl);
				if (fetched !== null) {
					const hash = cronHash(fetched);
					if (task.monitorLastHash && task.monitorLastHash === hash) {
						task.lastStatus = "ok";
						delete task.lastError;
						await this.writeCronNoChange(task, started, workspacePolicy).catch(noop);
						return; // finally below advances nextRun + saves
					}
					monitorBlock = buildMonitorBlock(task.monitorLastHash ? (task.monitorLastContent ?? "") : null, fetched);
					task.monitorLastHash = hash;
					task.monitorLastContent = fetched.slice(0, CRON_MONITOR_CONTENT_STORE_MAX);
				}
			}

			const skillDocs = await this.cronSkillDocs(task, workspacePolicy);
			/* Runtime defense-in-depth: invisible glyphs can arrive via a hand-edited
			   data.json even though create/update already strip them. */
			const safeTask = { ...scopedTask, prompt: scanCronPrompt(scopedTask.prompt).clean };
			const runPrompt =
				(scriptBlock ? `${scriptBlock}\n\n` : "") +
				(monitorBlock ? `${monitorBlock}\n\n` : "") +
				buildTaskPrompt(safeTask, skillDocs, prevRunAt);
			const preparedOutput = prepareCronOutput(await this.runner.runHeadless(runPrompt, { workspacePolicy, settings: runSettings }));
			const output = preparedOutput.canonicalOutput;
			task.runCount += 1;
			task.lastStatus = "ok";
			delete task.lastError;
			/* [SILENT]: archived + chained, but never appended to the target note */
			const silent = isSilentOutput(output);
			task.lastOutput = preparedOutput.chainOutput;
			task.lastWorkspaceScope = workspacePolicy.scopeKey;
			await this.writeCronOutput(task, started, this.runDurationSec(started), true, output, silent, workspacePolicy, targetPath);
			if (manual) {
				new Notice(
					silent
						? `Open Agent: “${task.name}” finished silently — see archive.`
						: `Open Agent: “${task.name}” finished → ${task.targetNote}`
				);
			} else if (!silent && task.notify) {
				new Notice(
					`Open Agent: “${task.name}” finished → ${task.targetNote} (${this.runDurationSec(started)}s)`
				);
			}
			/* Native success follows the task's notify flag and suppresses
			   [SILENT] runs. Copy stays generic; task names/output never leave. */
			if (!silent && task.notify) {
				this.handleNotificationEvent({ kind: "backgroundDone", contextId: task.id });
			}
			/* repeat budget reached → auto-complete (disable, no next run) */
			if (task.enabled && isCronCompleted(task)) {
				task.enabled = false;
				new Notice(
					`Open Agent: “${task.name}” completed its ${task.maxRuns} run${task.maxRuns === 1 ? "" : "s"} — automation disabled.`
				);
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			task.runCount += 1;
			task.lastStatus = "error";
			task.lastError = msg;
			await this.writeCronOutput(task, started, this.runDurationSec(started), false, msg, false, workspacePolicy, targetPath).catch(noop);
			new Notice(`Open Agent cron failed (“${task.name}”): ${msg}`);
			/* Errors alert independently of CronTask.notify when the desktop,
			   permission, away, kind, and throttle gates allow it. */
			this.handleNotificationEvent({ kind: "backgroundError", contextId: task.id });
		} finally {
			// linear scheduling — failed runs still advance (no retry bursts)
			task.nextRun = task.enabled ? nextCronRun(task.schedule.expr, Date.now()) ?? 0 : 0;
			await this.saveSettings();
			this.runningTasks.delete(task.id);
		}
	}

	/** Tahap D: resolve a task's focus-skill names to injected docs. */
	private async cronSkillDocs(
		task: CronTask,
		workspacePolicy: WorkspacePolicy
	): Promise<{ name: string; whenToUse: string; instructions: string }[]> {
		if (!task.skills?.length) return [];
		const all = await this.runner.skillsForPolicy(workspacePolicy).loadSkills();
		const wanted = new Set(task.skills.map((s) => s.toLowerCase()));
		const docs = all.filter((s) => s.enabled && wanted.has(s.name.toLowerCase()));
		const found = new Set(docs.map((s) => s.name.toLowerCase()));
		const missing = task.skills.filter((s) => !found.has(s.toLowerCase()));
		if (missing.length) {
			new Notice(`Open Agent: skill(s) not found for “${task.name}”: ${missing.join(", ")}`);
		}
		return docs.map((s) => ({ name: s.name, whenToUse: s.whenToUse, instructions: s.instructions }));
	}

	private runDurationSec(started: number): number {
		return Math.max(1, Math.round((Date.now() - started) / 1000));
	}

	/** UI: is this task mid-run right now? */
	isCronRunning(taskId: string): boolean {
		return this.runningTasks.has(taskId);
	}

	/** Physical base path of this vault (desktop), or null when unavailable. */
	private vaultBasePath(): string | null {
		try {
			const adapter = this.app.vault.adapter as unknown as { getBasePath?: () => string };
			const base = adapter.getBasePath?.();
			return typeof base === "string" && base ? base : null;
		} catch {
			return null;
		}
	}

	/** v0.1.147: run a cron script (desktop-only, bounded, lazy Node). */
	private async executeCronScript(name: string): Promise<{ ok: boolean; stdout: string; error?: string }> {
		const executor = defaultCronScriptExecutor();
		if (!executor) {
			return { ok: false, stdout: "", error: "Scripts run only on the desktop app (Node runtime unavailable)." };
		}
		const kind = scriptKindFor(name);
		if (!kind) {
			return { ok: false, stdout: "", error: `Unsupported script type “${name}” — use .sh, .js, or .py.` };
		}
		const base = this.vaultBasePath();
		if (!base) {
			return { ok: false, stdout: "", error: "Could not resolve the vault's physical path for script execution." };
		}
		const file = resolveScriptPath(base, this.manifest.id, name);
		const result = await executor({
			file,
			interpreter: interpreterFor(kind),
			timeoutMs: CRON_SCRIPT_TIMEOUT_MS,
			maxOutput: CRON_SCRIPT_MAX_OUTPUT,
		});
		if (!result.ok) {
			const detail = result.timedOut
				? `Script timed out after ${CRON_SCRIPT_TIMEOUT_MS}ms.`
				: result.error || (result.stderr ? result.stderr.slice(0, 400) : `exited with code ${result.code ?? "unknown"}`);
			return { ok: false, stdout: result.stdout, error: detail };
		}
		return { ok: true, stdout: result.stdout };
	}

	/** v0.1.147: bounded GET for monitor change-detection. Null on any failure
	 * (timeout, non-2xx, oversize) — the caller fails open to a normal run. */
	private async fetchCronMonitor(url: string): Promise<string | null> {
		try {
			const response = await Promise.race([
				requestUrl({ url, method: "GET", throw: false }),
				new Promise<never>((_resolve, reject) =>
					setTimeout(() => reject(new Error("monitor timeout")), CRON_MONITOR_URL_TIMEOUT_MS)
				),
			]);
			if (!Number.isInteger(response.status) || response.status < 200 || response.status > 299) return null;
			const text = response.text ?? "";
			if (new TextEncoder().encode(text).byteLength > CRON_MONITOR_URL_MAX_BYTES) return null;
			return text;
		} catch {
			return null;
		}
	}

	/** v0.1.147: a silent no-change tick — archive a one-liner, never touch
	 * the target note, never invoke the model. */
	private async writeCronNoChange(
		task: CronTask,
		started: number,
		workspacePolicy: WorkspacePolicy
	): Promise<void> {
		const human = new Date(started).toLocaleString();
		const rawArchiveFolder = normalizePath(cronRunsFolder(task.name));
		const folder = workspacePolicy.mode === "strict-folder"
			? workspacePolicy.resolvePath(rawArchiveFolder, { label: "Automation archive folder" })
			: workspacePolicy.assertVisiblePath(rawArchiveFolder, "Automation archive folder");
		await this.app.vault.createFolder(folder).catch(noop);
		const fileSafe = task.name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60) || "run";
		const archivePath = workspacePolicy.assertVisiblePath(
			canonicalVaultPath(`${folder}/${archiveStamp(started)} ${fileSafe}.md`, { label: "Automation archive" }),
			"Automation archive"
		);
		await this.app.vault.create(
			archivePath,
			[
				`# ${task.name} — ${human}`,
				"",
				"- status: ✅ ok · no change (monitor)",
				`- schedule: ${task.schedule.display}`,
				"",
				"Monitored content was unchanged this tick — the agent run was skipped.",
				"",
			].join("\n")
		);
	}

	/** Archive the full run + append a compact summary to the target note. */
	private async writeCronOutput(
		task: CronTask,
		started: number,
		durationSec: number,
		okRun: boolean,
		output: string,
		silent: boolean,
		workspacePolicy: WorkspacePolicy,
		targetPath: string
	): Promise<void> {
		const human = new Date(started).toLocaleString();
		const status = okRun ? (silent ? "✅ ok · silent" : "✅ ok") : "❌ error";
		const preparedOutput = prepareCronOutput(output);
		const canonicalOutput = preparedOutput.canonicalOutput;

		// Per-run archive obeys the SAME snapshot; Strict routes it under the project.
		const rawArchiveFolder = normalizePath(cronRunsFolder(task.name));
		const folder = workspacePolicy.mode === "strict-folder"
			? workspacePolicy.resolvePath(rawArchiveFolder, { label: "Automation archive folder" })
			: workspacePolicy.assertVisiblePath(rawArchiveFolder, "Automation archive folder");
		await this.app.vault.createFolder(folder).catch(noop);
		const fileSafe = task.name.replace(/[\\/:*?"<>|]/g, "-").slice(0, 60) || "run";
		const archivePath = workspacePolicy.assertVisiblePath(
			canonicalVaultPath(`${folder}/${archiveStamp(started)} ${fileSafe}.md`, { label: "Automation archive" }),
			"Automation archive"
		);
		await this.app.vault.create(
			archivePath,
			[
				`# ${task.name} — ${human}`,
				"",
				`- status: ${status}`,
				`- schedule: ${task.schedule.display}`,
				`- duration: ${durationSec}s`,
				"",
				"## Prompt",
				"",
				task.prompt,
				"",
				"## Output",
				"",
				canonicalOutput,
				"", 
			].join("\n")
		);

		// [SILENT] runs archive (above) but never touch the target note
		if (silent) return;

		// compact append — target note stays lean, archive keeps the full text
		const shown = preparedOutput.targetOutput;
		const link = `[[${archivePath.replace(/\.md$/, "")}|archive]]`;
		const block = `\n\n## ${task.name} — ${human}\n${status} · ${durationSec}s · ${link}\n\n${shown}\n`;
		const dir = targetPath.split("/").slice(0, -1).join("/");
		if (dir) await this.app.vault.createFolder(dir).catch(noop);
		const existing = this.app.vault.getAbstractFileByPath(targetPath);
		if (existing instanceof TFile) {
			await this.app.vault.append(existing, block);
		} else {
			await this.app.vault.create(targetPath, `# Open Agent automations\n${block}`);
		}
	}

	/** On startup: offer to catch up on runs missed while Obsidian was closed. */
	private announceMissedCronRuns(): void {
		const now = Date.now();
		const missed = this.settings.cronTasks.filter((t) => t.enabled && t.nextRun > 0 && t.nextRun < now);
		if (missed.length === 0) return;

		let notice: Notice;
		const frag = document.createDocumentFragment();
		const root = document.createElement("div");
		root.addClass("oa-missed-notice");
		const text = document.createElement("span");
		text.textContent = `Open Agent: ${missed.length} automation${
			missed.length > 1 ? "s" : ""
		} missed while Obsidian was closed.`;
		const buttons = document.createElement("div");
		buttons.addClass("oa-missed-actions");
		const runBtn = document.createElement("button");
		runBtn.textContent = "Run all now";
		runBtn.addClass("mod-cta");
		runBtn.onclick = () => {
			notice.hide();
			void this.runMissedCronTasks(missed);
		};
		const skipBtn = document.createElement("button");
		skipBtn.textContent = "Skip";
		skipBtn.onclick = () => {
			void (async () => {
				for (const t of missed) t.nextRun = nextCronRun(t.schedule.expr, Date.now()) ?? 0;
				await this.saveSettings();
				notice.hide();
			})();
		};
		buttons.append(runBtn, skipBtn);
		root.append(text, buttons);
		frag.appendChild(root);
		notice = new Notice(frag, 0);
	}

	private async runMissedCronTasks(tasks: CronTask[]): Promise<void> {
		new Notice(`Open Agent: catching up on ${tasks.length} missed automation${tasks.length > 1 ? "s" : ""}…`);
		for (const task of tasks) {
			await this.runCronTask(task.id, false);
			await new Promise((r) => window.setTimeout(r, 2000));
		}
	}

	/** Agent-facing automations backend (cronjob tool). */
	private cronjobApi(): CronjobApi {
		const mustFind = (idOrName: string): CronTask => {
			const found = findCronTask(this.settings.cronTasks, idOrName);
			if (!found.task) throw new Error(found.error ?? "Automation not found.");
			return found.task;
		};
		return {
			list: () => this.settings.cronTasks,
			createTask: (input) => {
				const task = newCronTask(input);
				this.settings.cronTasks.push(task);
				return task;
			},
			updateTask: (idOrName, patch) => {
				const task = mustFind(idOrName);
				if (patch.name) task.name = patch.name;
				if (patch.prompt) task.prompt = patch.prompt;
				if (patch.targetNote) task.targetNote = patch.targetNote;
				if (patch.expr) {
					task.schedule = scheduleFromExpr(patch.expr);
					task.nextRun = nextCronRun(task.schedule.expr, Date.now()) ?? 0;
				}
				/* Tahap D fields — explicit undefined means "leave alone",
				   null/false means "clear" */
				if (patch.skills !== undefined) task.skills = patch.skills.length ? [...patch.skills] : undefined;
				if (patch.maxRuns !== undefined) task.maxRuns = patch.maxRuns && patch.maxRuns > 0 ? Math.floor(patch.maxRuns) : null;
				if (patch.chainContext !== undefined) task.chainContext = patch.chainContext || undefined;
				if (patch.notify !== undefined) task.notify = patch.notify || undefined;
				/* v0.1.147 monitor: changing/clearing the URL resets the stored
				   hash so the next tick re-establishes a fresh baseline. */
				if (patch.monitorUrl !== undefined) {
					task.monitorUrl = /^https?:\/\//i.test(patch.monitorUrl.trim()) ? patch.monitorUrl.trim() : undefined;
					task.monitorLastHash = undefined;
				}
				/* v0.1.147 script/no_agent watchdog: name-only, protected folder.
				   Setting a script clears a monitor (mutually exclusive). */
				if (patch.script !== undefined) {
					const scriptName = sanitizeScriptName(patch.script);
					task.script = scriptName ?? undefined;
					if (task.script) {
						task.monitorUrl = undefined;
						task.monitorLastHash = undefined;
						task.monitorLastContent = undefined;
					}
				}
				if (patch.noAgent !== undefined) task.noAgent = task.script ? patch.noAgent || undefined : undefined;
				return task;
			},
			setEnabled: (idOrName, enabled) => {
				const task = mustFind(idOrName);
				task.enabled = enabled;
				if (enabled) task.nextRun = nextCronRun(task.schedule.expr, Date.now()) ?? 0;
				return task;
			},
			removeTask: (idOrName) => {
				const task = mustFind(idOrName);
				this.settings.cronTasks = this.settings.cronTasks.filter((t) => t.id !== task.id);
				return task;
			},
			runNow: (idOrName, workspacePolicy, settings) => {
				const task = mustFind(idOrName);
				void this.runCronTask(task.id, true, workspacePolicy, settings);
			},
			persist: () => this.saveSettings(),
		};
	}
}
