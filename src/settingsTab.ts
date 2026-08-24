/**
 * Settings UI — hermes-desktop settings overlay: a horizontally navigable
 * section strip with one section rendered at a time. Empty placeholder
 * sections stay hidden until they have real controls.
 *
 *   General · Providers · Model · Workspace · Safety · Chat · Commands ·
 *   Profiles · Capabilities · Memory & Context · Notifications · Automations · Advanced
 */

import {
	App,
	ButtonComponent,
	DropdownComponent,
	FuzzySuggestModal,
	Modal,
	Notice,
	Platform,
	PluginSettingTab,
	Setting,
	ToggleComponent,
	TFile,
	TFolder,
	TextComponent,
	setIcon,
} from "obsidian";
import type OpenAgentPlugin from "./main";
import { ConfirmProfileDeleteModal, ProfileExportModal } from "./settings/modals/profile";
import { HubSkillPreviewModal } from "./settings/modals/hub";
import { BlueprintCatalogModal } from "./settings/modals/blueprint-catalog";
import { GuardFindingsModal } from "./settings/modals/guard-findings";
import { ExportFileSuggestModal, JsonImportModal, SkillSuggestModal } from "./settings/modals/json-import";
import { createSliderInput } from "./ui/settings-controls";
import type { SectionContext } from "./settings/sections/context";
import { stackedTextArea } from "./settings/sections/helpers";
import { general as generalSection } from "./settings/sections/general";
import { memory as memorySection } from "./settings/sections/memory";
import { mcp as mcpSection } from "./settings/sections/mcp";
import { workspace as workspaceSection } from "./settings/sections/workspace";
import { command as commandSection } from "./settings/sections/command";
import { terminalSettings as terminalSection } from "./settings/sections/terminal";
import { safety as safetySection } from "./settings/sections/safety";
import { appearance as appearanceSection } from "./settings/sections/appearance";
import { advanced as advancedSection } from "./settings/sections/advanced";
import { notifications as notificationsSection } from "./settings/sections/notifications";
import { markdownTextareaKeydown } from "./ui/markdown-keys";
import { copyText } from "./ui/clipboard";
import { buildSettingsIndex, filterSettingsIndex, type SettingsSearchEntry } from "./settingsSearch";
import { getPath, isModified, markModified, setPath } from "./settingsModified";
import {
	CRON_PRESETS,
	cronExprForDaily,
	cronExprForInterval,
	cronExprForMonthly,
	cronExprForWeekly,
	cronRunsFolder,
	describeCronExpr,
	formatRelative,
	isCronCompleted,
	newCronTask,
	nextCronRun,
	presetForExpr,
	scheduleFromExpr,
	scanCronPrompt,
	validateCronExpr,
	WEEKDAY_LABELS,
} from "./agent/cron";
import { sanitizeScriptName } from "./agent/cronScripts";
import { MCP_CATALOG, type McpCatalogEntry } from "./agent/mcp/catalog";
import { CRON_BLUEPRINTS, WEEKDAY_PRESET_LABELS, fillBlueprint, type AutomationBlueprint } from "./agent/cronBlueprints";
import {
	DEFAULT_HUB_TAPS,
	HubSkill,
	HubTap,
	allHubTaps,
	filterSkills,
	installPolicy,
	mergeHubResults,
	pruneHubCache,
	parseTap,
	skillIdentifier,
} from "./agent/hub";
import { BUILD_STAMP } from "./buildInfo";
import { GuardReport } from "./agent/skillsGuard";
import type { AuxSlotKey } from "./agent/contextManager";
import { listModels } from "./agent/providers";
import { getActiveProfile, resolveConnection, skillsFolderFor } from "./agent/profiles";
import { providerUsable } from "./agent/resilience";
import {
	normalizeMoaConfig,
	validateMoaPayload,
	updateMoaSlot,
	withActiveOption,
	moaConfigComplete,
	type MoaConfig,
	type MoaPreset,
	type MoaSlot,
} from "./agent/moa";
import {
	activateProviderCatalog,
	applyFetchedModels,
	catalogOf,
	rememberModelInCatalog,
	withCurrentModel,
} from "./agent/modelCatalog";
import {
	AgentProfile,
	CronTask,
	OpenAgentSettings,
	PERSONALITY_OVERLAYS,
	isOverlayKey,
	PROFILE_COLORS,
	PromptSnippet,
	ProviderConfig,
	ReasoningEffort,
	ProfileExportSkill,
	buildProfileExport,
	DEFAULT_SETTINGS,
	sanitizeCustomHeaders,
} from "./settings";
import { Skill, SkillsStore } from "./agent/skills";
import {
	canonicalVaultPath,
} from "./agent/workspacePolicy";

type SectionKey =
	| "general"
	| "providers"
	| "model"
	| "workspace"
	| "safety"
	| "agent"
	| "appearance"
	| "command"
	| "profiles"
	| "capabilities"
	| "memory"
	| "notifications"
	| "automations"
	| "advanced"
	| "about";

const SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
	{ key: "general", label: "General", icon: "settings" },
	{ key: "providers", label: "Providers", icon: "key" },
	{ key: "model", label: "Model", icon: "cpu" },
	/* Appearance returns in v0.1.150 with self-owned chat-surface controls
	   (Obsidian's theme stays untouched). */
	{ key: "workspace", label: "Workspace", icon: "monitor" },
	{ key: "safety", label: "Safety", icon: "lock" },
	{ key: "agent", label: "Chat", icon: "message-circle" }, // Hermes Desktop parity: official 'Chat' section (owner 2026-07-30)
	{ key: "appearance", label: "Appearance", icon: "palette" }, // v0.1.150: how OUR chat surfaces render (tool cards, reasoning, sessions, intro, reactions) — never Obsidian's theme
	{ key: "command", label: "Commands", icon: "terminal-square" }, // Copilot parity (owner 2026-08-04): preset prompts + editor actions, model stays global
	{ key: "profiles", label: "Profiles", icon: "users" },
	{ key: "capabilities", label: "Capabilities", icon: "puzzle" },
	{ key: "memory", label: "Memory & Context", icon: "brain" }, // official label (constants.ts SECTIONS), context settings grouped here
	{ key: "notifications", label: "Notifications", icon: "bell" },
	{ key: "automations", label: "Automations", icon: "clock" },
	{ key: "advanced", label: "Advanced", icon: "terminal" },
	{ key: "about", label: "About", icon: "info" }, // v0.1.190: identity, license, attribution, diagnostics
];

const SECTION_DESC: Record<SectionKey, string> = {
	general: "Chat interface behaviour, plus backup, restore, and reset.",
	providers: "Set up provider connections here. Choose the provider + model used by chat in the Model tab.",
	model: "Global default model and generation parameters.",
	workspace: "Where the agent works by default — the vault folder behind its file operations.",
	safety: "Approval and guardrails — what the agent may do without asking you first.",
	agent: "Chat behaviour: personality and session storage.",
	appearance: "How the chat surface renders — tool cards, reasoning, the sessions list, the intro screen, and reaction buttons. Obsidian's own theme is never touched.",
	command: "Preset prompts and editor right-click actions — pick where each command shows up. The model always follows the global one.",
	profiles:
		"Named identities: persona + optional provider/model pin — each with its own memory, skills and chats.",
	capabilities: "What the agent can do: built-in toolsets, learned skills, and external MCP servers.",
	memory: "Persistent memory (MEMORY.md + USER.md) and the context injected into every chat.",
	notifications: "Optional native desktop banners and an independent app-generated completion cue.",
	automations: "Scheduled tasks in natural language — output archived and appended to a note.",
	advanced: "Rarely-needed controls — iteration cap, output limits, checkpoints, debug logging.",
	about: "Version, license, attribution, and copyable diagnostics.",
};

export class OpenAgentSettingTab extends PluginSettingTab {
	private section: SectionKey = "general";
	private testResultEl: HTMLElement | null = null;
	/* settings search (v0.1.94, additive) — lazy harvest index + mode state */
	private searchIndex: SettingsSearchEntry[] | null = null;
	private searchQuery = "";
	private searchResults: SettingsSearchEntry[] = [];
	private searchHarvesting = false;
	/** automations form: null = add mode, otherwise the task being edited */
	private editingCronId: string | null = null;
	/** task ids whose run-history block is expanded */
	private cronHistoryOpen = new Set<string>();

	constructor(app: App, private plugin: OpenAgentPlugin) {
		super(app, plugin);
	}

	/** Deep-link entry (e.g. "Manage profiles…" from the chat pill). */
	showSection(key: string): void {
		if ((SECTIONS as { key: string }[]).some((s) => s.key === key)) {
			this.section = key as SectionKey;
		}
		this.display();
	}

	display(): void {
		const { containerEl } = this;
		/* v0.1.111 (owner: toggle MoA "di-force scroll ke atas"): rekam posisi
		   scroller SEBELUM empty() — rebuild penuh meng-collapse tinggi konten
		   sesaat sehingga browser meng-clamp scrollTop ke 0 tanpa memulihkan. */
		const scroller = this.nearestScroller();
		const scrollY = scroller ? scroller.scrollTop : 0;
		containerEl.empty();
		containerEl.addClass("oa-settings");

		/* main header: plugin name + description */
		const header = containerEl.createDiv({ cls: "oa-settings-header" });
		const nameRow = header.createDiv({ cls: "oa-settings-header-name" });
		nameRow.createSpan({ text: this.plugin.manifest.name });
		nameRow.createSpan({
			cls: "oa-settings-header-version",
			text: `v${this.plugin.manifest.version} · ${BUILD_STAMP}`,
			// owner directive S3-6 (2026-07-23): UI strings are English-only (style contract)
			attr: { title: `Build ${BUILD_STAMP} — proves which build is running after file swaps` },
		});
		/* v0.1.190 (owner): the header keeps only the short tagline — the full
		   description now lives in the About tab. */
		const fullDesc = this.plugin.manifest.description ?? "";
		const shortDesc = fullDesc.includes(". ") ? fullDesc.slice(0, fullDesc.indexOf(". ") + 1) : fullDesc;
		header.createDiv({
			cls: "oa-settings-header-desc",
			text: shortDesc,
		});

		/* settings search (v0.1.94, additive) — one row above the tab strip */
		this.buildSearchUI(containerEl);

		/* Lobe UI–style line tabs: clean text tabs + sliding ink bar,
		   with left/right scroll buttons (two navigation modes) */
		const strip = containerEl.createDiv({ cls: "oa-settings-tabstrip" });

		const leftBtn = strip.createEl("button", { cls: "oa-tab-nav", attr: { "aria-label": "Scroll tabs left" } });
		setIcon(leftBtn, "chevron-left");

		const nav = strip.createDiv({ cls: "oa-settings-tabs" });
		nav.setAttribute("role", "tablist");
		/* owner directive S3-4 (2026-07-23): full keyboard tabs — ArrowLeft/Right
		   cycle, Home/End jump; roving tabindex keeps only the active tab in the
		   tab order and activation follows focus (sections render synchronously) */
		const tabEls: HTMLElement[] = [];
		for (const s of SECTIONS) {
			const item = nav.createEl("button", {
				cls: `oa-settings-tab${s.key === this.section ? " is-active" : ""}`,
			});
			item.setAttribute("role", "tab");
			item.setAttribute("aria-selected", s.key === this.section ? "true" : "false");
			item.tabIndex = s.key === this.section ? 0 : -1;
			item.dataset.key = s.key;
			const icon = item.createSpan({ cls: "nav-icon" });
			setIcon(icon, s.icon);
			item.createSpan({ text: s.label });
			tabEls.push(item);
			item.addEventListener("click", () => activateTab(s.key, false));
		}

		const activateTab = (key: SectionKey, focusTab: boolean): void => {
			const target = tabEls.find((el) => el.dataset.key === key);
			if (!target) return;
			if (focusTab) target.focus();
			if (this.section === key) return;
			this.section = key;
			for (const el of tabEls) {
				const on = el.dataset.key === key;
				el.toggleClass("is-active", on);
				el.setAttribute("aria-selected", on ? "true" : "false");
				el.tabIndex = on ? 0 : -1;
			}
			positionInk(true);
			this.renderSection(content);
		};

		/* the sliding indicator (Lobe UI "rounded" line variant) */
		const ink = nav.createDiv({ cls: "oa-tab-ink" });
		ink.addClass("no-anim");

		const rightBtn = strip.createEl("button", { cls: "oa-tab-nav", attr: { "aria-label": "Scroll tabs right" } });
		setIcon(rightBtn, "chevron-right");

		const positionInk = (animate: boolean) => {
			const active = nav.querySelector(".is-active") as HTMLElement | null;
			if (!active) return;
			if (!animate) ink.addClass("no-anim");
			else ink.removeClass("no-anim");
			const inset = Math.min(16, active.offsetWidth * 0.2);
			ink.style.width = `${active.offsetWidth - inset * 2}px`;
			ink.style.transform = `translateX(${active.offsetLeft + inset}px)`;
		};

		const updateNavButtons = () => {
			const atStart = nav.scrollLeft <= 1;
			const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1;
			leftBtn.toggleClass("is-disabled", atStart);
			rightBtn.toggleClass("is-disabled", atEnd);
		};

		/* click = one nudge · press & hold = continuous scroll (two modes) */
		const bindHoldScroll = (btn: HTMLElement, dir: -1 | 1) => {
			let startTimer: number | null = null;
			let holdTimer: number | null = null;
			let didHold = false;

			const stop = () => {
				if (startTimer !== null) {
					window.clearTimeout(startTimer);
					startTimer = null;
				}
				if (holdTimer !== null) {
					window.clearInterval(holdTimer);
					holdTimer = null;
				}
			};

			btn.addEventListener("pointerdown", (e) => {
				btn.setPointerCapture(e.pointerId);
				didHold = false;
				stop();
				startTimer = window.setTimeout(() => {
					didHold = true;
					holdTimer = window.setInterval(() => {
						nav.scrollBy({ left: dir * 14, behavior: "auto" });
					}, 16);
				}, 220);
			});
			btn.addEventListener("pointerup", stop);
			btn.addEventListener("pointercancel", stop);
			btn.addEventListener("lostpointercapture", stop);
			btn.addEventListener("click", () => {
				if (didHold) {
					didHold = false;
					return; // hold already scrolled — swallow the trailing click
				}
				nav.scrollBy({ left: dir * 220, behavior: "smooth" });
			});
		};
		bindHoldScroll(leftBtn, -1);
		bindHoldScroll(rightBtn, 1);
		nav.addEventListener("scroll", updateNavButtons);

		/* keyboard navigation between tabs (S3-4): Left/Right cycle with wrap,
		   Home/End jump to the edges; the focused tab activates immediately */
		nav.addEventListener("keydown", (e) => {
			const idx = SECTIONS.findIndex((s) => s.key === this.section);
			let next = -1;
			if (e.key === "ArrowRight") next = (idx + 1) % SECTIONS.length;
			else if (e.key === "ArrowLeft") next = (idx - 1 + SECTIONS.length) % SECTIONS.length;
			else if (e.key === "Home") next = 0;
			else if (e.key === "End") next = SECTIONS.length - 1;
			if (next < 0) return;
			e.preventDefault();
			activateTab(SECTIONS[next].key, true);
		});

		/* content pane */
		const content = containerEl.createDiv({ cls: "oa-settings-content" });
		this.renderSection(content);

		/* v0.1.111: posisi scroll yang direkam sebelum empty() dikembalikan di
		   sini — setelah seluruh section ter-render sehingga tinggi konten
		   tersedia kembali. Saksi: F29scroll di settings lane. */
		if (scroller && scrollY > 0) scroller.scrollTop = scrollY;

		/* initial ink placement + button state, after layout settles */
		window.setTimeout(() => {
			const activeTab = nav.querySelector(".is-active") as HTMLElement | null;
			if (activeTab) {
				nav.scrollLeft = activeTab.offsetLeft - nav.clientWidth / 2 + activeTab.clientWidth / 2;
			}
			updateNavButtons();
			positionInk(false);
			window.setTimeout(() => ink.removeClass("no-anim"), 60);
		}, 0);
	}


	/** Ancestor scrollable terdekat si tab — dipakai display() untuk menjaga
	    posisi scroll melintasi re-render penuh (v0.1.111 owner bug: toggle
	    MoA "di-force ke atas"). Di Obsidian asli ancestor ini pane tab yang
	    overflow-y:auto (shim menempel .vertical-tab-content ke containerEl);
	    bila tak ketemu (harness: dokumen yang scroll) jatuh ke
	    scrollingElement. Dibungkus try/catch supaya lingkungan headless
	    tanpa layout (smoke) aman. */
	private nearestScroller(): HTMLElement | null {
		try {
			let el: HTMLElement | null = this.containerEl;
			while (el) {
				const ov = getComputedStyle(el).overflowY;
				if ((ov === "auto" || ov === "scroll") && el.scrollHeight > el.clientHeight) return el;
				el = el.parentElement;
			}
			const se = document.scrollingElement;
			return se instanceof HTMLElement ? se : null;
		} catch {
			return null;
		}
	}

	/* ---------- settings search (v0.1.94, additive) ---------- */

	private buildSearchUI(containerEl: HTMLElement): void {
		const wrap = containerEl.createDiv({ cls: "oa-settings-search" });
		wrap.setAttribute("role", "search");
		const icon = wrap.createSpan({ cls: "oa-settings-search-icon", attr: { "aria-hidden": "true" } });
		setIcon(icon, "search");
		const input = wrap.createEl("input", {
			cls: "oa-settings-search-input",
			attr: { type: "search", placeholder: "Search settings…", "aria-label": "Search settings" },
		});
		input.value = this.searchQuery;
		const clearBtn = wrap.createEl("button", {
			cls: "oa-settings-search-clear",
			attr: { type: "button", "aria-label": "Clear search" },
		});
		setIcon(clearBtn, "x");
		containerEl.createDiv({ cls: "oa-settings-search-status", attr: { "aria-live": "polite" } });
		containerEl.createDiv({ cls: "oa-settings-search-results" });

		input.addEventListener("focus", () => this.ensureSearchIndex());
		input.addEventListener("input", () => {
			this.searchQuery = input.value;
			this.refreshSearchUI();
		});
		input.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				this.searchQuery = "";
				input.value = "";
				this.refreshSearchUI();
			} else if (e.key === "Enter" && this.searchResults.length) {
				e.preventDefault();
				this.jumpToSearchResult(this.searchResults[0]);
			}
		});
		clearBtn.addEventListener("click", () => {
			this.searchQuery = "";
			input.value = "";
			this.refreshSearchUI();
			input.focus();
		});
	}

	/* Harvest every section into a detached host with the SAME builders the
	   real pane uses — the searchable text can never drift from the UI. */
	private ensureSearchIndex(): void {
		if (this.searchIndex) return;
		/* Section builders reassign element fields at build time (test result
		   box, hub lists). A harvest render must never steal those refs from
		   the live pane — snapshot & restore around it. */
		const saved = {
			testResultEl: this.testResultEl,
			hubChipsEl: this.hubChipsEl,
			hubResultsEl: this.hubResultsEl,
			hubCountEl: this.hubCountEl,
		};
		this.searchHarvesting = true;
		try {
			this.searchIndex = buildSettingsIndex(
				SECTIONS.map(({ key, label }) => ({ key, label })),
				(key, host) => this.renderSectionBody(key as SectionKey, host)
			);
		} finally {
			this.searchHarvesting = false;
			this.testResultEl = saved.testResultEl;
			this.hubChipsEl = saved.hubChipsEl;
			this.hubResultsEl = saved.hubResultsEl;
			this.hubCountEl = saved.hubCountEl;
		}
	}

	private refreshSearchUI(): void {
		const container = this.containerEl;
		const q = this.searchQuery.trim();
		const wrap = container.querySelector<HTMLElement>(".oa-settings-search");
		const status = container.querySelector<HTMLElement>(".oa-settings-search-status");
		const results = container.querySelector<HTMLElement>(".oa-settings-search-results");
		const strip = container.querySelector<HTMLElement>(".oa-settings-tabstrip");
		const content = container.querySelector<HTMLElement>(".oa-settings-content");
		if (!wrap || !status || !results) return;
		const active = q.length > 0;
		wrap.toggleClass("has-query", active);
		if (strip) strip.style.display = active ? "none" : "";
		if (content) content.style.display = active ? "none" : "";
		results.empty();
		if (!active) {
			status.setText("");
			return;
		}
		this.ensureSearchIndex();
		const found = filterSettingsIndex(this.searchIndex ?? [], q);
		this.searchResults = found;
		status.setText(
			found.length
				? `${found.length} ${found.length === 1 ? "setting matches" : "settings match"}`
				: `No settings match "${q}" — try different words.`
		);
		for (const sec of SECTIONS) {
			const rows = found.filter((f) => f.section === sec.key);
			if (!rows.length) continue;
			results.createDiv({ cls: "oa-settings-search-group", text: sec.label });
			for (const entry of rows) {
				const btn = results.createEl("button", {
					cls: "oa-settings-search-result",
					attr: { type: "button" },
				});
				btn.createSpan({ cls: "oa-settings-search-result-name", text: entry.name });
				btn.createSpan({
					cls: "oa-settings-search-result-meta",
					text: entry.group ? `${entry.sectionLabel} · ${entry.group}` : entry.sectionLabel,
				});
				btn.addEventListener("click", () => this.jumpToSearchResult(entry));
			}
		}
	}

	private jumpToSearchResult(entry: SettingsSearchEntry): void {
		this.searchQuery = ""; // leave search mode — the jump target is the destination
		this.section = entry.section as SectionKey;
		this.display();
		const items = Array.from(
			this.containerEl.querySelectorAll<HTMLElement>(".oa-settings-content .setting-item")
		);
		const wanted = items.filter(
			(el) => (el.querySelector(".setting-item-name")?.textContent ?? "").trim() === entry.name
		);
		const target = wanted[entry.ordinal];
		if (!target) {
			new Notice(
				`Open Agent: "${entry.name}" lives in the ${entry.sectionLabel} tab — it may be inside a collapsed group.`
			);
			return;
		}
		target.scrollIntoView({ block: "center" });
		target.addClass("oa-settings-flash");
		window.setTimeout(() => target.removeClass("oa-settings-flash"), 1600);
		const focusable = target.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]");
		focusable?.focus();
	}

	private renderSection(content: HTMLElement): void {
		content.empty();
		const title = content.createDiv({ cls: "oa-section-title" });
		title.createEl("h2", { text: SECTIONS.find((x) => x.key === this.section)?.label ?? "" });
		title.createDiv({ cls: "oa-section-desc", text: SECTION_DESC[this.section] });

		this.renderSectionBody(this.section, content);
	}

	/** Settings search (v0.1.94): section body without the title — also used by
	   the search harvest render (detached host, guarded by searchHarvesting). */
	private renderSectionBody(section: SectionKey, host: HTMLElement): void {
		switch (section) {
			case "general":
				generalSection(this.sectionContext(), host);
				break;
			case "providers":
				this.providers(host);
				break;
			case "model":
				this.model(host);
				break;
		case "agent":
			this.agent(host);
			break;
		case "appearance":
			appearanceSection(this.sectionContext(), host);
			break;
		case "command":
			commandSection(this.sectionContext(), host);
			break;
			case "profiles":
				this.profiles(host);
				break;
			case "capabilities":
				this.capabilities(host);
				break;
			case "memory":
				memorySection(this.sectionContext(), host);
				break;
			case "notifications":
				notificationsSection(this.sectionContext(), host);
				break;
			case "automations":
				this.automations(host);
				break;
			case "advanced":
				advancedSection(this.sectionContext(), host);
				break;
			case "workspace":
				workspaceSection(this.sectionContext(), host);
				break;
			case "safety":
				safetySection(this.sectionContext(), host);
				break;
			case "about":
				this.about(host);
				break;
		}
	}

	/* ───────────────────────── sections ───────────────────────── */

	/* Workspace and Safety retain their dedicated, actionable destinations.
	   Appearance/About remain absent while empty; Notifications now has its
	   own actionable native-banner and completion-cue controls. */

	/** Add a picked folder to Workspace exclusions (validated + deduped). */
	private otherProvidersOpen = false;
	/* Which provider is being VIEWED/edited (UI-only state; null → the global
	   default provider). Row clicks only move this — never chat routing
	   (owner-reported trap 2026-07-30). */
	private providerEditingId: string | null = null;
	private providersAdvancedOpen = false;
	/* main-model pick draft (Hermes Desktop parity 2026-07-30): provider+model
	   are one assignment applied via the explicit Apply button — null = the
	   current live value; provider changes clear the model draft */
	private modelPickProviderId: string | null = null;
	private modelPickModel: string | null = null;
	/* auxiliary-model slot editor (Hermes Desktop parity 2026-07-31): which row
	   is open + its draft — "Change" reveals inline provider/model selects */
	private auxEditingKey: AuxSlotKey | null = null;
	private auxDraftProviderId: string | null = null;
	private auxDraftModel: string | null = null;
	/* MoA preset editor (Hermes Desktop model-settings.tsx parity 2026-08-01):
	   edits mutate a working DRAFT; only a fully complete config persists —
	   a half-filled slot never reaches data.json (official: HTTP 422, #64156). */
	private moaDraft: MoaConfig | null = null;
	private moaSelected = "";
	private moaNewName = "";
	private moaProblems: string[] = [];

	private providers(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		/* The provider used by chat is status/context here, never an implicit
		   selection control. The provider + model pair is chosen in Model;
		   profile pins are managed in Profiles. Keeping that action in one
		   place removes the old "am I configuring or activating?" ambiguity. */
		const conn = resolveConnection(s);
		const activeProfile = getActiveProfile(s);
		const routedProvider = s.providers.find((p) => p.id === conn.providerId);
		const globalProvider = s.providers.find((p) => p.id === s.activeProviderId);
		const profileOverridesRoute = conn.pinned.provider || conn.pinned.model;
		const overriddenPart = conn.pinned.provider && conn.pinned.model ? "provider and model" : conn.pinned.provider ? "provider" : "model";
		const route = containerEl.createDiv({ cls: "oa-provider-route" });
		const routeIcon = route.createSpan({ cls: "oa-provider-route-icon", attr: { "aria-hidden": "true" } });
		setIcon(routeIcon, "server");
		const routeMain = route.createDiv({ cls: "oa-provider-route-main" });
		routeMain.createDiv({ cls: "oa-provider-route-label", text: "Provider used by chat" });
		const routeValue = routeMain.createDiv({ cls: "oa-provider-route-value" });
		routeValue.createSpan({ text: routedProvider?.name ?? conn.providerId });
		if (conn.model) routeValue.createSpan({ cls: "oa-provider-route-model", text: `· ${conn.model}` });
		routeValue.createSpan({
			cls: `oa-provider-route-badge${profileOverridesRoute ? " is-pinned" : ""}`,
			text: profileOverridesRoute ? "Profile override" : "Global default",
		});
		routeMain.createDiv({
			cls: "oa-provider-route-desc",
			text: profileOverridesRoute
				? `Profile “${activeProfile.name}” overrides the global ${overriddenPart}. Global default: ${globalProvider?.name ?? s.activeProviderId}${s.model ? ` · ${s.model}` : ""}.`
				: "Choose the provider + model pair in the Model tab. Connection settings below do not switch chat.",
		});
		const routeBtn = route.createEl("button", {
			cls: "oa-mini-btn",
			text: profileOverridesRoute ? "Manage profile pin" : "Choose provider & model",
			attr: { type: "button" },
		});
		routeBtn.addEventListener("click", () => {
			this.section = profileOverridesRoute ? "profiles" : "model";
			this.display();
		});

		this.subheading(
			containerEl,
			"Provider connections",
			"Set up endpoints, API keys, optional headers, and connection tests. Choose a row to configure it — this never changes the provider used by chat."
		);

		/* Provider rows are an editor picker, not an active-provider picker.
		   "Configured" means enough connection details are saved; only the
		   explicit test below can prove the endpoint is reachable. */
		const viewedId = s.providers.some((p) => p.id === this.providerEditingId)
			? (this.providerEditingId as string)
			: s.activeProviderId;
		const isConfigured = (p: ProviderConfig) => providerUsable(p);
		const configured = s.providers.filter(isConfigured);
		const needsSetup = s.providers.filter((p) => !isConfigured(p));

		const renderRow = (list: HTMLElement, p: ProviderConfig) => {
			const selected = p.id === viewedId;
			const configuredNow = isConfigured(p);
			const inUse = p.id === conn.providerId;
			const row = list.createEl("button", {
				cls: `oa-provider-row${selected ? " is-viewed" : ""}`,
				attr: {
					type: "button",
					"aria-pressed": selected ? "true" : "false",
					"aria-label": `Configure ${p.name} — ${configuredNow ? "configured" : "needs setup"}${inUse ? ", used by chat" : ""}`,
				},
			});
			const dot = row.createSpan({ cls: `oa-provider-dot${configuredNow ? " is-set" : ""}` });
			dot.setAttribute("aria-hidden", "true");
			row.createSpan({ cls: "oa-provider-name", text: p.name });
			row.createSpan({ cls: "oa-provider-url", text: p.baseUrl || "endpoint not set" });
			const statuses = row.createSpan({ cls: "oa-provider-statuses", attr: { "aria-hidden": "true" } });
			statuses.createSpan({
				cls: `oa-provider-status${configuredNow ? " is-ready" : " is-needed"}`,
				text: configuredNow ? "Configured" : "Set up",
			});
			if (inUse) statuses.createSpan({ cls: "oa-provider-status is-in-use", text: "In use" });
			row.addEventListener("click", () => {
				this.providerEditingId = p.id;
				this.display();
			});
		};

		if (configured.length > 0) {
			containerEl.createDiv({ cls: "oa-provider-group-label", text: `Configured (${configured.length})` });
			const list = containerEl.createDiv({ cls: "oa-provider-list" });
			for (const p of configured) renderRow(list, p);
		}
		if (needsSetup.length > 0) {
			const collapsible = configured.length > 0;
			const open = !collapsible || this.otherProvidersOpen;
			/* Owner directive 2026-07-23 (settings-audit S2): disclosures are real
			   <button>s — Enter/Space toggle + visible focus (was a bare
			   clickable div, keyboard-invisible). */
			const head: HTMLElement = collapsible
				? containerEl.createEl("button", {
						cls: `oa-provider-group-label oa-disclosure${open ? " is-open" : ""}`,
						attr: { type: "button", "aria-expanded": open ? "true" : "false" },
					})
				: containerEl.createDiv({ cls: "oa-provider-group-label is-open" });
			const chev = head.createSpan({ cls: "oa-disclosure-chevron" });
			setIcon(chev, "chevron-right");
			head.createSpan({ text: collapsible ? `Needs setup (${needsSetup.length})` : "Needs setup" });
			if (collapsible) {
				head.addEventListener("click", () => {
					this.otherProvidersOpen = !this.otherProvidersOpen;
					this.display();
				});
			}
			if (open) {
				const list = containerEl.createDiv({ cls: "oa-provider-list" });
				for (const p of needsSetup) renderRow(list, p);
			}
		}

		const viewed = s.providers.find((p) => p.id === viewedId);
		if (!viewed) return;
		this.subheading(
			containerEl,
			`Configure ${viewed.name}`,
			isConfigured(viewed)
				? "Connection details are saved. Edit them or test the endpoint below; neither action switches chat."
				: "Enter the endpoint and credentials, then test the connection. This does not switch chat."
		);

		/* base URL is a primary field — local servers often run on custom
		   ports, so it must never hide behind a disclosure. */
		new Setting(containerEl)
			.setName(`${viewed.name} base URL`)
			.setDesc(baseUrlDesc(viewed.id))
			.addText((t) =>
				t
					.setPlaceholder("http://localhost:PORT/v1")
					.setValue(viewed.baseUrl)
					.onChange(async (v) => {
						viewed.baseUrl = v.trim();
						this.plugin.saveSettingsSafe();
					})
			);

		let keyInput: HTMLInputElement | null = null;
		new Setting(containerEl)
			.setName("API key")
			.setDesc(`For ${viewed.name}. Stored locally in this vault's plugin data — local servers accept any value.`)
			.addText((t) => {
				keyInput = t.inputEl;
				t.inputEl.type = "password";
				t.setPlaceholder("sk-…")
					.setValue(viewed.apiKey)
					.onChange(async (v) => {
						viewed.apiKey = v.trim();
						this.plugin.saveSettingsSafe();
					});
			})
			.addExtraButton((b) => {
				b.setIcon("eye").setTooltip("Show key").onClick(() => {
					if (!keyInput) return;
					const showing = keyInput.type === "text";
					keyInput.type = showing ? "password" : "text";
					b.setIcon(showing ? "eye" : "eye-off");
					b.setTooltip(showing ? "Show key" : "Hide key");
				});
			})
			.addExtraButton((b) =>
				b
					.setIcon("trash-2")
					.setTooltip("Clear key")
					.onClick(async () => {
						viewed.apiKey = "";
						this.plugin.saveSettingsSafe();
						this.display();
					})
			);

		/* rare overrides (custom headers) behind a disclosure */
		/* keyboard-reachable disclosure (settings-audit S2 — see group head above) */
		const advHead = containerEl.createEl("button", {
			cls: `oa-provider-group-label oa-disclosure${this.providersAdvancedOpen ? " is-open" : ""}`,
			attr: { type: "button", "aria-expanded": this.providersAdvancedOpen ? "true" : "false" },
		});
		const advChev = advHead.createSpan({ cls: "oa-disclosure-chevron" });
		setIcon(advChev, "chevron-right");
		advHead.createSpan({ text: `Custom headers — ${viewed.name}` });
		advHead.addEventListener("click", () => {
			this.providersAdvancedOpen = !this.providersAdvancedOpen;
			this.display();
		});
		if (this.providersAdvancedOpen) {
			new Setting(containerEl)
				.setName("Custom headers")
				.setDesc("Optional JSON object of extra request headers.")
				.addText((t) =>
					t
						.setPlaceholder('{"X-Custom": "value"}')
						.setValue(Object.keys(viewed.customHeaders).length ? JSON.stringify(viewed.customHeaders) : "")
						.onChange(async (v) => {
							try {
								if (!v.trim()) {
									viewed.customHeaders = {};
								} else {
									/* a header map is an object of strings — `null`, a number,
									   a string or an array are valid JSON but not headers */
									const parsed = sanitizeCustomHeaders(JSON.parse(v));
									if (!parsed) return; // keep typing; don't store a non-map
									viewed.customHeaders = parsed;
								}
								await this.plugin.saveSettings();
							} catch {
								/* keep typing */
							}
						})
				);
		}

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc(`Tests ${viewed.name} using the URL + key above, then saves its model catalog. It does not activate this provider.`)
			.addButton((b) =>
				b
					.setButtonText("Test connection")
					.setCta()
					.onClick(async () => {
						if (!viewed.baseUrl) {
							this.setTestResult("Set a base URL first.", false);
							return;
						}
						b.setButtonText("Testing…").setDisabled(true);
						this.setTestResult("Connecting…", null);
						try {
							const models = await listModels(viewed);
							if (models.length === 0) {
								this.setTestResult("Connected, but the provider returned no models.", false);
							} else {
								/* Per-provider catalog (Hermes Desktop): discovery writes ONLY the
								   viewed provider's own list. The global-default model heals solely
								   when this is its provider; testing another connection must never
								   steal the chat's model (owner report 2026-07-30). */
								applyFetchedModels(s, viewed.id, models);
								await this.plugin.saveSettings();
								this.setTestResult(`✓ ${models.length} models available on ${viewed.name}.`, true);
								this.plugin.refreshViews();
							}
						} catch (e) {
							this.setTestResult(`✗ ${e instanceof Error ? e.message : String(e)}`, false);
						} finally {
							b.setButtonText("Test connection").setDisabled(false);
						}
					})
			);

		/* owner directive S3-5 (2026-07-23): the result line sits BELOW the row
		   it reports on (was above); hidden while empty (.oa-test-result:empty
		   in styles.css) so it leaves no stray margin gap */
		this.testResultEl = containerEl.createDiv({ cls: "oa-test-result" });
	}

	private setTestResult(text: string, ok: boolean | null): void {
		if (!this.testResultEl) return;
		this.testResultEl.setText(text);
		this.testResultEl.removeClass("is-ok");
		this.testResultEl.removeClass("is-err");
		if (ok === true) this.testResultEl.addClass("is-ok");
		if (ok === false) this.testResultEl.addClass("is-err");
	}

	private model(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		/* Make the effective route and the editable GLOBAL default visibly
		   distinct. A profile pin wins at run time; changing the controls below
		   must never promise that the current chat will switch when it cannot. */
		const conn = resolveConnection(s);
		const activeProfile = getActiveProfile(s);
		const effectiveProvider = s.providers.find((p) => p.id === conn.providerId);
		const globalProvider = s.providers.find((p) => p.id === s.activeProviderId);
		const profileOverridesRoute = conn.pinned.provider || conn.pinned.model;
		const overriddenPart = conn.pinned.provider && conn.pinned.model ? "provider and model" : conn.pinned.provider ? "provider" : "model";
		const route = containerEl.createDiv({ cls: "oa-provider-route oa-model-route" });
		const routeIcon = route.createSpan({ cls: "oa-provider-route-icon", attr: { "aria-hidden": "true" } });
		setIcon(routeIcon, "cpu");
		const routeMain = route.createDiv({ cls: "oa-provider-route-main" });
		routeMain.createDiv({ cls: "oa-provider-route-label", text: "Provider + model used by chat" });
		const routeValue = routeMain.createDiv({ cls: "oa-provider-route-value" });
		routeValue.createSpan({ text: effectiveProvider?.name ?? conn.providerId });
		if (conn.model) routeValue.createSpan({ cls: "oa-provider-route-model", text: `· ${conn.model}` });
		routeValue.createSpan({
			cls: `oa-provider-route-badge${profileOverridesRoute ? " is-pinned" : ""}`,
			text: profileOverridesRoute ? "Profile override" : "Global default",
		});
		routeMain.createDiv({
			cls: "oa-provider-route-desc",
			text: profileOverridesRoute
				? `Profile “${activeProfile.name}” overrides the global ${overriddenPart}. Controls below edit the global default: ${globalProvider?.name ?? s.activeProviderId}${s.model ? ` · ${s.model}` : ""}. Profile pins continue to control this chat.`
				: "This chat follows the global default. Apply below switches the provider + model pair together.",
		});
		if (profileOverridesRoute) {
			const routeBtn = route.createEl("button", {
				cls: "oa-mini-btn",
				text: "Manage profile pin",
				attr: { type: "button" },
			});
			routeBtn.addEventListener("click", () => {
				this.section = "profiles";
				this.display();
			});
		}

		/* main-model pick (Hermes Desktop parity, owner 2026-07-30): provider
		   and model are ONE global assignment, saved explicitly — drafts never
		   write state. Provider change clears the model draft (official slot
		   semantics: a pair must stay valid). Provider setup/test stays in the
		   Providers tab (approved divergence). */
		const pickProvider = s.providers.some((p) => p.id === this.modelPickProviderId)
			? (this.modelPickProviderId as string)
			: s.activeProviderId;
		const pickModel = this.modelPickModel ?? s.model;
		const pickSetting = new Setting(containerEl)
			.setName("Global default model")
			.setDesc(
				profileOverridesRoute
					? "Edit the global default provider + model pair. Saving it does not remove the active profile pin. Providers are set up in the Providers tab."
					: "Choose the global default provider + model pair. Apply switches both for profiles without a route pin. Providers are set up in the Providers tab."
			);
		const pickCtl = stackedControl(pickSetting, { row: true });

		const usablePickProviders = s.providers.filter((p) => providerUsable(p));
		const provDd = new DropdownComponent(pickCtl);
		if (usablePickProviders.length === 0) provDd.addOption("", "(configure a provider first)");
		for (const p of usablePickProviders) provDd.addOption(p.id, p.name);
		if (pickProvider && !usablePickProviders.some((p) => p.id === pickProvider)) provDd.addOption(pickProvider, pickProvider);
		provDd.selectEl.setAttribute("aria-label", "Provider");
		provDd.setValue(pickProvider).onChange((v) => {
			this.modelPickProviderId = v;
			this.modelPickModel = ""; // official slot semantics: provider change clears the model draft
			this.display(); // model options follow the draft provider
		});

		const pickCatalog = catalogOf(s.providers.find((p) => p.id === pickProvider));
		const pickOptions = withCurrentModel(pickCatalog, pickModel);
		const modelDd = new DropdownComponent(pickCtl);
		if (pickOptions.length === 0) modelDd.addOption("", "(fetch models first — Providers tab)");
		for (const m of pickOptions) modelDd.addOption(m, m);
		modelDd.selectEl.setAttribute("aria-label", "Model");
		modelDd.setValue(pickModel);

		const applyPick = new ButtonComponent(pickCtl);
		applyPick
			.setButtonText(profileOverridesRoute ? "Save global default" : "Apply")
			.setCta()
			.setDisabled(!pickProvider || !pickModel.trim())
			.onClick(async () => {
				/* read the LIVE draft fields — the render-time consts above are a
				   STALE SNAPSHOT after dropdown edits (closure hazard, caught by
				   probe F14 2026-07-31: Apply wrote the render-time model —
				   the exact cross-provider mismatch this feature exists to kill) */
				const prov = s.providers.some((p) => p.id === this.modelPickProviderId)
					? (this.modelPickProviderId as string)
					: s.activeProviderId;
				const model = (this.modelPickModel ?? s.model).trim();
				if (!prov || !model) return;
				activateProviderCatalog(s, prov); // switches active; its heal adjusts only stale picks…
				s.model = model; // …the explicit choice is authoritative (custom/off-catalog ids allowed)
				this.modelPickProviderId = null;
				this.modelPickModel = null;
				this.plugin.saveSettingsSafe();
				this.plugin.refreshViews();
				this.display();
			});

		/* model draft changes enable Apply IN PLACE — no full display() re-render
		   on every selection (probe F14: render-time disabled state alone
		   leaves the button stuck after a provider clear) */
		modelDd.onChange((v) => {
			this.modelPickModel = v;
			applyPick.setDisabled(!v.trim());
		});

		/* Owner directive 2026-07-22 (settings-audit S1): commit the custom id
		   ONLY on Enter or blur — per-keystroke commits called display() and
		   re-rendered the whole tab after the very first character (focus
		   jumped out mid-typing), while every half-typed string ("g", "gp",
		   …) was persisted into the model catalog. */
		const customSetting = new Setting(containerEl)
			.setName("Custom global model id")
			.setDesc(
				profileOverridesRoute
					? "Type any model id accepted by the global default provider — saves immediately. The active profile pin continues to control this chat."
					: "Type any model id accepted by the global default provider — saves immediately."
			);
		const customCtl = stackedControl(customSetting);
		const customModel = new TextComponent(customCtl).setPlaceholder("custom model id");
		customModel.inputEl.setAttribute("aria-label", "Custom global model id");
		const commitCustomModel = async (): Promise<void> => {
			const val = customModel.getValue().trim();
			if (!val || val === s.model) return;
			s.model = val;
			rememberModelInCatalog(s.providers.find((p) => p.id === s.activeProviderId), val);
			await this.plugin.saveSettings();
			this.plugin.refreshViews();
			this.display(); // one deliberate re-render so the dropdown reflects the committed id
		};
		customModel.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void commitCustomModel();
			}
		});
		customModel.inputEl.addEventListener("change", () => void commitCustomModel());

		const stReasoningEffort = new Setting(containerEl)
			.setName("Reasoning effort")
			.setDesc("Thinking budget — sent to providers that support it, ignored elsewhere.")
			.addDropdown((d) => {
				const efforts: ReasoningEffort[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
				for (const e of efforts) d.addOption(e, e);
				d.setValue(s.reasoningEffort).onChange(async (v) => {
					s.reasoningEffort = v as ReasoningEffort;
					this.plugin.saveSettingsSafe();
				});
			});
		markModified(stReasoningEffort, this.plugin.settings, "reasoningEffort");

		/* v0.1.108 port lobe SliderWithInput (SOURCE-verified): slider +
		   kotak angka sinkron dua arah — upgrade dari slider bawaan polos */
		const stTemperature = new Setting(containerEl)
			.setName("Temperature")
			.setDesc("0 = deterministic, 1 = creative, -1 = don't send.");
		stTemperature.controlEl.appendChild(
			createSliderInput({
				ariaLabel: "Temperature",
				min: -1,
				max: 2,
				step: 0.05,
				value: s.temperature,
				commit: (v) => {
					s.temperature = v;
					this.plugin.saveSettingsSafe();
				},
			}).el
		);
		markModified(stTemperature, this.plugin.settings, "temperature");
		this.resetButton(stTemperature, "temperature");

		/* v0.1.108 port lobe SliderWithInput: slider untuk geser kasar
		   (0..16384 step 256), kotak angka unlimitedInput untuk presisi tinggi
		   (parity prop lobe — ketikan bebas melebihi batas slider) */
		const stMaxTokens = new Setting(containerEl).setName("Max output tokens").setDesc("Maximum tokens per reply — 0 lets the provider decide. The slider sweeps coarse values; type any number for exact control.");
		stMaxTokens.controlEl.appendChild(
			createSliderInput({
				ariaLabel: "Max output tokens",
				min: 0,
				max: 16384,
				step: 256,
				unlimitedInput: true,
				value: s.maxTokens,
				commit: (v) => {
					s.maxTokens = Math.round(v);
					this.plugin.saveSettingsSafe();
				},
			}).el
		);
		markModified(stMaxTokens, this.plugin.settings, "maxTokens");
		this.resetButton(stMaxTokens, "maxTokens");

		const stStreaming = new Setting(containerEl)
			.setName("Streaming")
			.setDesc("Stream tokens as they arrive; falls back to buffered replies automatically.")
			.addToggle((t) =>
				t.setValue(s.streaming).onChange(async (v) => {
					s.streaming = v;
					this.plugin.saveSettingsSafe();
				})
			);
		markModified(stStreaming, this.plugin.settings, "streaming");

		/* ── Auxiliary models (Hermes Desktop: small side-tasks on a different
		   model; "auto (use main)" when un-pinned) ── */
		this.subheading(
			containerEl,
			"Auxiliary models",
			"Side-tasks may run on a different (cheaper or more capable) model. auto = they use your main model."
		);
		const stTitleGen = new Setting(containerEl)
			.setName("Title generation")
			.setDesc("Name new sessions automatically after the first reply. Off by default — it costs one extra request per new session.")
			.addToggle((t) =>
				t.setValue(s.titleGenerationEnabled).onChange(async (v) => {
					s.titleGenerationEnabled = v;
					this.plugin.saveSettingsSafe();
				})
			);
		markModified(stTitleGen, this.plugin.settings, "titleGenerationEnabled");
		this.auxModelRow(containerEl, "titleGeneration", "Title model", "names brand-new sessions after the first reply — point it at a fast model to keep local turns snappy");
		this.auxModelRow(containerEl, "compression", "Compression", "summarizes old messages into the rolling brief");
		this.auxModelRow(containerEl, "goalJudge", "Goal judge", "decides after each turn whether a /goal is satisfied (Ralph loop)");
		this.auxModelRow(containerEl, "webExtract", "Web extract", "condenses fetched pages when summarize is used (web page summarization)");
		this.auxModelRow(containerEl, "vision", "Vision", "describes images for text-only main models (the vision_analyze fallback path)");

		this.subheading(
			containerEl,
			"Fallback models",
			"Tried in order when the primary model fails — 429/5xx after retries, auth errors immediately. Only the current turn switches; new messages use the primary again."
		);
		const usable = s.providers.filter((p) => providerUsable(p));
		s.fallbackProviders.forEach((entry, idx) => {
			const row = new Setting(containerEl).setName(`Fallback ${idx + 1}`);
			row.addExtraButton((b) =>
				b
					.setIcon("trash-2")
					.setTooltip("Remove fallback")
					.onClick(async () => {
						s.fallbackProviders.splice(idx, 1);
						this.plugin.saveSettingsSafe();
						this.display();
					})
			);
			/* provider + model side-by-side below the row title */
			const rowCtl = stackedControl(row, { row: true });
			const provDd = new DropdownComponent(rowCtl);
			if (usable.length === 0) provDd.addOption("", "(no configured provider)");
			for (const p of usable) provDd.addOption(p.id, p.name);
			provDd.selectEl.setAttribute("aria-label", `Fallback ${idx + 1} provider`);
			provDd
				.setValue(usable.some((p) => p.id === entry.providerId) ? entry.providerId : usable[0]?.id ?? "")
				.onChange(async (v) => {
					entry.providerId = v;
					entry.model = ""; // Hermes Desktop: changing a row's provider resets its model
					this.plugin.saveSettingsSafe();
					this.display(); // model options follow the chosen provider
				});
			/* per-provider catalog (Hermes Desktop fallback field): each row's
			   model dropdown lists THAT row's provider's models — not a shared
			   list; empty catalog keeps the free-text id input */
			const rowCatalog = catalogOf(s.providers.find((p) => p.id === entry.providerId));
			if (rowCatalog.length > 0) {
				const known = new Set(withCurrentModel(rowCatalog, entry.model));
				const fbModelDd = new DropdownComponent(rowCtl);
				for (const m of known) fbModelDd.addOption(m, m);
				fbModelDd.selectEl.setAttribute("aria-label", `Fallback ${idx + 1} model`);
				fbModelDd.setValue(entry.model).onChange(async (v) => {
					entry.model = v;
					this.plugin.saveSettingsSafe();
				});
			} else {
				const fbModelText = new TextComponent(rowCtl)
					.setPlaceholder("model id, e.g. anthropic/claude-sonnet-4")
					.setValue(entry.model)
					.onChange(async (v) => {
						entry.model = v.trim();
						this.plugin.saveSettingsSafe();
					});
				fbModelText.inputEl.setAttribute("aria-label", `Fallback ${idx + 1} model id`);
			}
		});
		if (s.fallbackProviders.length === 0) {
			this.emptyState(containerEl, {
				title: "No fallbacks",
				description: "If the primary model fails, the turn fails. Add one for resilience.",
			});
		}
		new Setting(containerEl).addButton((b) =>
			b.setButtonText("Add fallback").onClick(async () => {
				s.fallbackProviders.push({ providerId: usable[0]?.id ?? "", model: "" });
				this.plugin.saveSettingsSafe();
				this.display();
			})
		);

		this.moaSection(containerEl);
	}

	/* ── Mixture of Agents (Hermes Desktop "Mixture of Agents" section,
	   model-settings.tsx parity 2026-08-01) ────────────────────────────
	   Desktop semantics, adapted to this tab's edit→save→display flow:
	   - every edit mutates this.moaDraft (initialized from saved settings,
	     or the official default preset as the editor seed);
	   - QUIET saves (slot toggles, dropdown picks) persist only when the
	     whole draft validates — while half-filled a muted "waiting" hint
	     shows, mirroring the desktop autosave that simply waits;
	   - EXPLICIT actions (Set default / Delete / Add preset) fail LOUD:
	     the validation problems list appears under the section and nothing
	     persists (official write boundary: HTTP 422, #64156). */
	private moaSection(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		if (!this.moaDraft) this.moaDraft = normalizeMoaConfig(s.moa ?? {});
		const draft = this.moaDraft;
		const names = Object.keys(draft.presets);
		const selected = names.includes(this.moaSelected) ? this.moaSelected : draft.default_preset;
		const preset = draft.presets[selected] ?? draft.presets[draft.default_preset] ?? Object.values(draft.presets)[0];
		if (!preset) return;

		this.subheading(
			containerEl,
			"Mixture of Agents",
			"Configure named presets that appear as models under the Mixture of Agents provider. The aggregator is the acting model."
		);

		/* controls row: preset pick + Enabled + Set default + Delete + new/Add
		   (v0.1.109 owner ask: dropdown full-width, teks "Enabled" kelihatan
		   sebelum toggle, Add preset SESUDAH input nama) */
		const ctl = new Setting(containerEl);
		ctl.settingEl.addClass("oa-moa-ctl");
		ctl.addDropdown((dd) => {
			for (const n of names) dd.addOption(n, n);
			dd.selectEl.setAttribute("aria-label", "MoA preset");
			dd.selectEl.addClass("oa-moa-ctl-pick");
			dd.setValue(selected).onChange((v) => {
				this.moaSelected = v;
				this.moaProblems = [];
				this.display();
			});
		});
		ctl.controlEl.createSpan({ cls: "oa-moa-ctl-label", text: "Enabled" });
		ctl.addToggle((t) => {
			t.setTooltip("Enabled")
				.setValue(preset.enabled !== false)
				.onChange((v) => {
					this.moaUpdatePreset(selected, (p) => ({ ...p, enabled: v }), "quiet");
				});
			t.toggleEl.setAttribute("aria-label", "Preset enabled");
		});
		ctl.addButton((b) =>
			b.setButtonText("Set default").onClick(() => {
				draft.default_preset = selected;
				this.moaSave("explicit");
			})
		);
		ctl.addButton((b) => {
			/* Disable inline: addButton runs its callback synchronously, so the
			   button is configured in one place instead of via an outer handle
			   that control-flow analysis cannot narrow. */
			b.setDisabled(names.length <= 1);
			b.setButtonText("Delete").onClick(() => {
				if (names.length <= 1) return;
				delete draft.presets[selected];
				const fallback = Object.keys(draft.presets)[0];
				if (draft.default_preset === selected) draft.default_preset = fallback;
				if (draft.active_preset === selected) draft.active_preset = "";
				this.moaSelected = fallback;
				this.moaSave("explicit");
			});
		});
		/* v0.1.111 owner: input nama + tombol Add preset dibungkus satu sub-baris
		   (.oa-moa-ctl-new) supaya saat kontrol wrap mereka pindah sebagai satu
		   paket — tombol tak pernah yatim di baris sendiri, dan di lebar wajar
		   mereka "sesudah input" SATU GARIS seperti yang diminta. */
		const newPair = ctl.controlEl.createDiv({ cls: "oa-moa-ctl-new" });
		const nameText = new TextComponent(newPair).setPlaceholder("new preset").setValue(this.moaNewName);
		nameText.inputEl.setAttribute("aria-label", "New MoA preset name");
		let addBtn: ButtonComponent | null = null;
		nameText.onChange((v) => {
			this.moaNewName = v;
			addBtn?.setDisabled(!v.trim() || !!draft.presets[v.trim()]);
		});
		const addComp = new ButtonComponent(newPair);
		addBtn = addComp;
		addComp.setButtonText("Add preset").onClick(() => {
			const name = this.moaNewName.trim();
			if (!name || draft.presets[name]) return;
			draft.presets[name] = JSON.parse(JSON.stringify(preset)) as MoaPreset;
			this.moaSelected = name;
			this.moaNewName = "";
			this.moaSave("explicit");
		});
		addBtn?.setDisabled(!this.moaNewName.trim() || !!draft.presets[this.moaNewName.trim()]);

		const defLine = containerEl.createDiv({ cls: "oa-moa-default-line" });
		defLine.createSpan({ text: "Default: " });
		defLine.createSpan({ cls: "oa-mono", text: draft.default_preset });

		/* reference slots */
		const usableMoA = s.providers.filter((p) => providerUsable(p)).map((p) => p.id);
		preset.reference_models.forEach((slot, idx) => {
			const row = new Setting(containerEl).setName(`Reference ${idx + 1}`);
			const desc = row.descEl.createSpan({ cls: "oa-mono", text: `${slot.provider} · ${slot.model}` });
			if (slot.enabled === false) row.settingEl.addClass("oa-moa-slot-disabled");
			row.addToggle((t) => {
				t.setValue(slot.enabled !== false).onChange((v) => {
					this.moaUpdatePreset(selected, (p) => ({
						...p,
						reference_models: p.reference_models.map((x, i) => (i === idx ? { ...x, enabled: v } : x)),
					}), "quiet");
				});
				t.toggleEl.setAttribute("aria-label", `${slot.enabled !== false ? "Disable" : "Enable"} reference ${idx + 1}`);
			});
			const below = stackedControl(row, { row: true });
			this.moaSlotPickers(below, usableMoA, slot, (patch) => {
				this.moaUpdatePreset(selected, (p) => ({
					...p,
					reference_models: p.reference_models.map((x, i) => (i === idx ? updateMoaSlot(x, patch) : x)),
				}), "quiet");
				if (patch.provider || patch.model !== undefined) {
					desc.textContent = `${patch.provider ?? slot.provider} · ${patch.model ?? (patch.provider ? "" : slot.model)}`;
				}
			});
			row.addExtraButton((b) =>
				b
					.setIcon("trash-2")
					.setTooltip("Remove reference")
					.setDisabled(preset.reference_models.length <= 1)
					.onClick(() => {
						if (preset.reference_models.length <= 1) return;
						this.moaUpdatePreset(selected, (p) => ({
							...p,
							reference_models: p.reference_models.filter((_, i) => i !== idx),
						}), "quiet");
					})
			);
		});
		new Setting(containerEl).addButton((b) =>
			b.setButtonText("Add reference model").onClick(() => {
				/* desktop prefill: the new reference starts as the aggregator slot */
				this.moaUpdatePreset(selected, (p) => ({
					...p,
					reference_models: [...p.reference_models, { ...p.aggregator, enabled: true }],
				}), "quiet");
			})
		);

		/* aggregator slot */
		const agg = new Setting(containerEl).setName("Aggregator");
		const aggDesc = agg.descEl.createSpan({ cls: "oa-mono", text: `${preset.aggregator.provider} · ${preset.aggregator.model}` });
		this.moaSlotPickers(stackedControl(agg, { row: true }), usableMoA, preset.aggregator, (patch) => {
			this.moaUpdatePreset(selected, (p) => ({ ...p, aggregator: updateMoaSlot(p.aggregator, patch) }), "quiet");
			if (patch.provider || patch.model !== undefined) {
				aggDesc.textContent = `${patch.provider ?? preset.aggregator.provider} · ${patch.model ?? (patch.provider ? "" : preset.aggregator.model)}`;
			}
		});

		/* write-boundary feedback: explicit problems (red), or the quiet
		   waiting-hint while the draft is half complete (muted) */
		if (this.moaProblems.length > 0) {
			/* v0.1.93 (contract copy: error dekat aksi + ter-announce) —
			   role=alert: pemblokir save diumumkan ke AT saat muncul */
			const box = containerEl.createDiv({ cls: "oa-moa-problems", attr: { role: "alert" } });
			box.createDiv({ text: "Not saved — fix the MoA preset first:" });
			const ul = box.createEl("ul");
			for (const p of this.moaProblems) ul.createEl("li", { text: p });
		} else if (validateMoaPayload({ presets: draft.presets }).length > 0) {
			containerEl.createDiv({
				cls: "oa-moa-hint",
				text: "Waiting for a complete preset — every reference and the aggregator need a provider and a model before this saves (Hermes rejects half-filled presets).",
			});
		}
	}

	/** provider + model pickers for one MoA slot (reference or aggregator):
	    provider options = usable providers + withActive(current); model follows
	    the slot's provider catalog, free-text when the catalog is empty
	    (fallback-row precedent). Provider change clears the model (official). */
	private moaSlotPickers(el: HTMLElement, usable: string[], slot: MoaSlot, apply: (patch: Partial<MoaSlot>) => void): void {
		const s = this.plugin.settings;
		const provDd = new DropdownComponent(el);
		if (usable.length === 0) provDd.addOption("", "(no configured provider)");
		for (const id of withActiveOption(usable, slot.provider)) {
			provDd.addOption(id, s.providers.find((p) => p.id === id)?.name ?? id);
		}
		provDd.selectEl.setAttribute("aria-label", "MoA slot provider");
		provDd.setValue(slot.provider).onChange((v) => apply({ provider: v }));

		const catalog = catalogOf(s.providers.find((p) => p.id === slot.provider));
		if (catalog.length > 0) {
			const modelDd = new DropdownComponent(el);
			for (const m of withCurrentModel(catalog, slot.model)) modelDd.addOption(m, m);
			modelDd.selectEl.setAttribute("aria-label", "MoA slot model");
			modelDd.setValue(slot.model).onChange((v) => apply({ model: v }));
		} else {
			const modelText = new TextComponent(el).setPlaceholder("model id, e.g. anthropic/claude-sonnet-4").setValue(slot.model);
			modelText.inputEl.setAttribute("aria-label", "MoA slot model id");
			modelText.onChange((v) => apply({ model: v.trim() }));
		}
	}

	private moaUpdatePreset(name: string, mutate: (p: MoaPreset) => MoaPreset, mode: "quiet" | "explicit"): void {
		const draft = this.moaDraft;
		if (!draft?.presets[name]) return;
		draft.presets[name] = mutate(draft.presets[name]);
		this.moaSave(mode);
	}

	/** Persist gate: only a fully valid draft reaches disk. Quiet edits leave
	    moaProblems untouched (the waiting-hint covers them); explicit actions
	    surface the problem list loudly. */
	private moaSave(mode: "quiet" | "explicit"): void {
		const draft = this.moaDraft;
		if (!draft) return;
		const problems = validateMoaPayload({ presets: draft.presets });
		if (problems.length === 0 && moaConfigComplete(draft)) {
			this.moaProblems = [];
			this.plugin.settings.moa = normalizeMoaConfig(draft);
			this.plugin.saveSettingsSafe();
		} else if (mode === "explicit") {
			this.moaProblems = problems.length > 0 ? problems : ["Every reference and the aggregator need a provider and a model."];
		}
		this.display();
	}

	/** One auxiliary-model slot row (Hermes Desktop parity): status line +
	    Set to main / Change (inline provider+model selects with Apply).
	    Draft rules mirror the main-model pick — provider change clears the
	    model draft; Apply reads LIVE drafts; enabled in place. */
	private auxModelRow(containerEl: HTMLElement, key: AuxSlotKey, name: string, does: string): void {
		const s = this.plugin.settings;
		const ref = s.auxModels[key] ?? null;
		const pinned = ref ? s.providers.find((p) => p.id === ref.providerId) ?? null : null;
		const status = ref && pinned ? `${pinned.name} · ${ref.model}` : "auto (use main)";
		const editing = this.auxEditingKey === key;

		const setting = new Setting(containerEl).setName(name).setDesc(`${does} — ${status}`);
		setting
			.addButton((b) =>
				b
					.setButtonText("Set to main")
					.setDisabled(!ref)
					.onClick(async () => {
						s.auxModels[key] = null;
						this.auxEditingKey = null;
						this.plugin.saveSettingsSafe();
						this.plugin.refreshViews();
						this.display();
					})
			)
			.addButton((b) =>
				b.setButtonText(editing ? "Cancel" : "Change").onClick(() => {
					if (editing) {
						this.auxEditingKey = null;
					} else {
						this.auxEditingKey = key;
						this.auxDraftProviderId = ref?.providerId ?? null;
						this.auxDraftModel = ref?.model ?? null;
					}
					this.display();
				})
			);
		if (!editing) return;

		const draftProvider = s.providers.some((p) => p.id === this.auxDraftProviderId)
			? (this.auxDraftProviderId as string)
			: s.activeProviderId;
		const draftModel = this.auxDraftModel ?? (ref?.model ?? "");
		const ctl = stackedControl(setting);

		const usable = s.providers.filter((p) => providerUsable(p));
		const provDd = new DropdownComponent(ctl);
		for (const p of usable) provDd.addOption(p.id, p.name);
		if (draftProvider && !usable.some((p) => p.id === draftProvider)) provDd.addOption(draftProvider, draftProvider);
		provDd.selectEl.setAttribute("aria-label", `${name} provider`);
		provDd.setValue(draftProvider).onChange((v) => {
			this.auxDraftProviderId = v;
			this.auxDraftModel = ""; // provider change clears the model draft (official slot semantics)
			this.display();
		});

		const catalog = catalogOf(s.providers.find((p) => p.id === draftProvider));
		const options = withCurrentModel(catalog, draftModel);
		const modelDd = new DropdownComponent(ctl);
		if (options.length === 0) modelDd.addOption("", "(fetch models first — Providers tab)");
		for (const m of options) modelDd.addOption(m, m);
		modelDd.selectEl.setAttribute("aria-label", `${name} model`);
		modelDd.setValue(draftModel);

		const applyAux = new ButtonComponent(ctl);
		applyAux
			.setButtonText("Apply")
			.setCta()
			.setDisabled(!draftProvider || !draftModel.trim())
			.onClick(async () => {
				const prov = s.providers.some((p) => p.id === this.auxDraftProviderId)
					? (this.auxDraftProviderId as string)
					: draftProvider;
				const model = (this.auxDraftModel ?? draftModel).trim();
				if (!prov || !model) return;
				s.auxModels[key] = { providerId: prov, model };
				this.auxEditingKey = null;
				this.auxDraftProviderId = null;
				this.auxDraftModel = null;
				this.plugin.saveSettingsSafe();
				this.plugin.refreshViews();
				this.display();
			});
		modelDd.onChange((v) => {
			this.auxDraftModel = v;
			applyAux.setDisabled(!v.trim());
		});
	}

	private agent(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		/* session storage knobs lead this tab — above the approval row (owner
		   agreement 2026-08-03: the placement IS the deal) */
		const stSaveSessions = new Setting(containerEl).setName("Save sessions").addToggle((t) =>
			t.setValue(s.saveSessions).onChange(async (v) => {
				s.saveSessions = v;
				this.plugin.saveSettingsSafe();
			})
		);
		markModified(stSaveSessions, this.plugin.settings, "saveSessions");

		const stMaxSessions = new Setting(containerEl)
			.setName("Max sessions kept")
			.setDesc("Oldest sessions beyond this cap are pruned automatically.");
		stMaxSessions.controlEl.appendChild(
			createSliderInput({
				ariaLabel: "Max sessions kept",
				min: 10,
				max: 500,
				step: 10,
				value: s.maxSessions,
				commit: (v) => {
					s.maxSessions = v;
					this.plugin.sessionStore.setMaxSessions(v);
					this.plugin.saveSettingsSafe();
				},
			}).el
		);
		markModified(stMaxSessions, this.plugin.settings, "maxSessions");
		this.resetButton(stMaxSessions, "maxSessions");

		/* v0.1.126: row persetujuan pindah ke tab Safety (Hermes parity) —
		   block verbatim-nya kini hidup di src/settings/sections/safety.ts */
		/* v0.1.151: the iteration cap row (= Hermes agent.max_turns) moved to
		   the Advanced tab (Hermes parity) — its verbatim block now lives in
		   src/settings/sections/advanced.ts */

		/* v0.1.126: baris folder kerja pindah ke tab Workspace (Hermes parity)
		   — block verbatim-nya kini hidup di src/settings/sections/workspace.ts */

		/* global personality (= Hermes display.personality, a GLOBAL Chat
		   setting — NOT per-profile). The session /personality overrides it
		   per chat; the durable identity (SOUL) lives in the Profiles tab. */
		new Setting(containerEl)
			.setName("Personality")
			.setDesc(
				"Default voice for new chats — /personality overrides it for the current chat only. The durable identity (SOUL) lives in the Profiles tab."
			)
			.addDropdown((d) => {
				d.addOption("none", "none (identity only)");
				for (const key of Object.keys(PERSONALITY_OVERLAYS)) d.addOption(key, key);
				d.setValue(isOverlayKey(s.personality) ? s.personality : "none").onChange(async (v) => {
					s.personality = v;
					this.plugin.saveSettingsSafe();
					this.plugin.refreshViews();
				});
			});

		/* v0.1.77: prompt snippets graduated into full commands — they live
		   in the Commands tab now (surface flags, order, add/duplicate) */
		this.emptyState(containerEl, {
			title: "Prompt snippets live in the Commands tab now",
			description: "Open a command there to set where it shows — editor menu / composer slash / [+] picker / Quick Ask chips.",
		});
	}

	/* ---------------- appearance (v0.1.150, Hermes Desktop parity) ----------
	   Curated from Hermes' hand-built appearance-settings.tsx. Only the
	   controls we own as a chat surface (tool cards, reasoning, sessions
	   list, intro, reactions) are ported. Hermes' host-shell chrome (theme,
	   window scale, glass, backdrop) stays out of scope — here that chrome
	   belongs to Obsidian's own theme, which our CSS follows via var(--*)
	   and never overrides. */

	/* ---------------- commands (v0.1.77, Copilot CommandSettings parity) ----
	   Owner 2026-08-04: mirror Copilot's Commands-settings EXPERIENCE —
	   per-command surface checkboxes (editor menu vs composer slash), row
	   ordering, edit/duplicate/delete — minus per-command model (ours stays
	   global) and minus {variable} templating (studied, consciously not
	   adopted: selections ride as explicit quotes/attachments instead). */

	/* ---------------- profiles ---------------- */

	private editingProfileId: string | null = null;

	private profiles(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		const store = this.plugin.profileStore;

		const list = containerEl.createDiv({ cls: "oa-profile-list" });
		for (const p of s.profiles) {
			const row = list.createDiv({ cls: `oa-profile-item${p.id === s.activeProfileId ? " is-active" : ""}` });
			row.createSpan({ cls: `oa-profile-dot oa-color-${p.color}` });

			const main = row.createDiv({ cls: "oa-profile-item-main" });
			const nameLine = main.createDiv({ cls: "oa-profile-item-name" });
			nameLine.createSpan({ text: p.name });
			if (p.id === s.activeProfileId) nameLine.createSpan({ cls: "oa-profile-badge", text: "active" });
			const sub: string[] = [p.soul.trim() ? "custom SOUL" : "default identity"];
			sub.push(
				p.providerId ? s.providers.find((x) => x.id === p.providerId)?.name ?? p.providerId : "follows global"
			);
			if (p.model) sub.push(p.model);
			main.createDiv({ cls: "oa-profile-item-sub", text: sub.join(" · ") });

			const actions = row.createDiv({ cls: "oa-profile-item-actions" });
			if (p.id !== s.activeProfileId) {
				const use = actions.createEl("button", { cls: "oa-mini-btn", text: "Set active" });
				use.addEventListener("click", async () => {
					await this.plugin.applyProfile(p.id);
					this.display();
				});
			}
			/* settings-audit S2: titles stay as tooltips; aria-labels announce the
			   action verb + which profile (was title-only — silent for some SRs) */
			const edit = actions.createEl("button", {
				cls: "oa-icon-btn",
				attr: { title: "Edit profile", "aria-label": `Edit profile “${p.name}”` },
			});
			setIcon(edit, "pencil");
			edit.addEventListener("click", () => {
				this.editingProfileId = this.editingProfileId === p.id ? null : p.id;
				this.display();
			});
			const clone = actions.createEl("button", {
				cls: "oa-icon-btn",
				attr: { title: "Clone (persona + pins, data starts empty)", "aria-label": `Clone profile “${p.name}”` },
			});
			setIcon(clone, "copy");
			clone.addEventListener("click", async () => {
				const created = await store.duplicate(p.id);
				if (created) new Notice(`Open Agent: cloned “${p.name}” → “${created.name}”.`);
				this.display();
			});
			const exp = actions.createEl("button", {
				cls: "oa-icon-btn",
				attr: { title: "Export profile (soul bundle)", "aria-label": "Export profile (soul bundle)" },
			});
			setIcon(exp, "download");
			exp.addEventListener("click", () => {
				new ProfileExportModal(this.app, this.plugin, p).open();
			});
			const del = actions.createEl("button", {
				cls: "oa-icon-btn oa-danger",
				attr: { title: "Delete profile", "aria-label": `Delete profile “${p.name}”` },
			});
			setIcon(del, "trash-2");
			del.addEventListener("click", () => {
				new ConfirmProfileDeleteModal(this.app, p, async (trashFolders) => {
					const res = await store.remove(p.id, { trashFolders });
					if (!res.ok) {
						new Notice(`Open Agent: ${res.reason}`);
					} else {
						if (this.editingProfileId === p.id) this.editingProfileId = null;
						// rebind folders in case the active profile was removed
						await this.plugin.applyProfile(this.plugin.settings.activeProfileId);
						new Notice(
							`Open Agent: profile “${p.name}” deleted${trashFolders ? " (folders removed)" : " — folders kept on disk"}.`
						);
					}
					this.display();
				}).open();
			});

			if (this.editingProfileId === p.id) this.profileForm(list, p);
		}

		/* create: blank, or clone the active profile's config */
		let nameInput = "";
		new Setting(containerEl)
			.setName("New profile")
			.setDesc("Blank = fresh persona. Clone = copies the active profile's persona and pins.")
			.addText((t) =>
				t.setPlaceholder("Profile name (e.g. Research)").onChange((v) => {
					nameInput = v;
				})
			)
			.addButton((b) =>
				b.setButtonText("Create blank").onClick(async () => {
					await store.create(nameInput || "Profile");
					this.plugin.saveSettingsSafe();
					this.display();
				})
			);

		/* owner directive S3-8 (2026-07-23): clone moved to its own row below
		   (was a third control squeezed next to the name field) — same bare
		   button-row pattern as "Add MCP server" */
		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("Clone active profile")
				.setCta()
				.onClick(async () => {
					const created = await store.create(nameInput, { cloneFromId: s.activeProfileId });
					new Notice(`Open Agent: cloned into “${created.name}”.`);
					this.display();
				})
		);

		/* soul bundle import — always creates a NEW profile (never overwrites) */
		new Setting(containerEl)
			.setName("Import profile")
			.setDesc("Create a profile from a soul bundle (soul + overlay + pins + color). Skills included in the bundle are installed too.")
			.addButton((b) =>
				b.setButtonText("Paste JSON…").onClick(() => {
					new JsonImportModal(this.app, {
						title: "Import profile (soul bundle)",
						placeholder: '{"openagentExport": "profile", …}',
						confirmLabel: "Import profile",
						onSubmit: async (text) => {
							const res = await this.plugin.importProfileFromText(text);
							if (!res.ok) return res.error ?? "Import failed.";
							new Notice(
								`Open Agent: imported profile “${res.name}”${res.skills ? ` (+${res.skills} skill${res.skills === 1 ? "" : "s"})` : ""}.`
							);
							this.display();
							return null;
						},
					}).open();
				})
			)
			.addButton((b) =>
				b.setButtonText("From vault file…").onClick(() => {
					new ExportFileSuggestModal(this.app, async (file) => {
						const res = await this.plugin.importProfileFromText(await this.app.vault.read(file));
						if (!res.ok) new Notice(`Open Agent import failed: ${res.error}`);
						else {
							new Notice(`Open Agent: imported profile “${res.name}”.`);
							this.display();
						}
					}).open();
				})
			);

		containerEl.createDiv({
			cls: "oa-profile-note",
			text: "Cron automations always run on the Default profile. API keys stay global — profiles isolate agent data (memory, skills, chats), not secrets or vault-tool access.",
		});
	}

	/** Inline edit form under a profile row. */
	private profileForm(containerEl: HTMLElement, p: AgentProfile): void {
		const s = this.plugin.settings;
		const store = this.plugin.profileStore;
		const form = containerEl.createDiv({ cls: "oa-profile-form" });

		new Setting(form)
			.setName("Name")
			.addText((t) =>
				t.setValue(p.name).onChange(async (v) => {
					await store.update(p.id, { name: v });
				})
			);

		new Setting(form).setName("Color").setDesc("Dot color in the chat profile pill.");
		const swatches = form.createDiv({ cls: "oa-swatches" });
		for (const c of PROFILE_COLORS) {
			const b = swatches.createEl("button", {
				cls: `oa-swatch oa-color-${c}${p.color === c ? " is-active" : ""}`,
				attr: { title: c, "aria-label": `Color ${c}` },
			});
			b.addEventListener("click", async () => {
				await store.update(p.id, { color: c });
				this.display();
			});
		}

		/* SOUL — the durable identity (Hermes SOUL.md), injected verbatim
		   into slot #1 of the system prompt */
		const soulHead = form.createDiv({ cls: "oa-setting-item-info oa-profile-soul-head" });
		soulHead.createDiv({ cls: "setting-item-name", text: "Soul (identity)" });
		soulHead.createDiv({
			cls: "setting-item-description",
			text: "Durable identity, injected verbatim at the top of the system prompt. Empty = built-in default identity. Tone & style durables go here — project rules belong in the context file.",
		});
		const soulTa = form.createEl("textarea", {
			cls: "oa-profile-soul",
			attr: { placeholder: "# Personality\nYou are … (who this agent is, how it speaks, what it cares about)" },
		});
		soulTa.value = p.soul;
		soulTa.rows = 6;
		soulTa.addEventListener("change", async () => {
			await store.update(p.id, { soul: soulTa.value });
			this.plugin.refreshViews();
		});

		new Setting(form)
			.setName("Provider pin")
			.setDesc("Force a provider for this profile, or follow the global active provider.")
			.addDropdown((d) => {
				d.addOption("", "Follow global");
				for (const prov of s.providers) d.addOption(prov.id, prov.name);
				d.setValue(p.providerId ?? "").onChange(async (v) => {
					await store.update(p.id, { providerId: v || null });
					this.plugin.refreshViews();
					this.display();
				});
			});

		new Setting(form)
			.setName("Model pin")
			.setDesc("Force a model for this profile, or follow the global model.")
			.addText((t) =>
				t
					.setPlaceholder("Follow global")
					.setValue(p.model ?? "")
					.onChange(async (v) => {
						await store.update(p.id, { model: v.trim() || null });
						this.plugin.refreshViews();
					})
			);

		const done = form.createEl("button", { cls: "oa-mini-btn", text: "Done" });
		done.addEventListener("click", () => {
			this.editingProfileId = null;
			this.display();
		});
	}

	private capabilities(containerEl: HTMLElement): void {
		this.subheading(containerEl, "Tools", "One switch per toolset.");
		this.toolsets(containerEl);
		this.subheading(containerEl, "Terminal & Processes", "Desktop-only command execution with explicit consent and per-start approval.");
		terminalSection(this.sectionContext(), containerEl);
		this.subheading(containerEl, "Web search", "Where the AI searches the web. DuckDuckGo is free and needs no setup; the other options need an API key or your own server.");
		this.webSearchSettings(containerEl);
		this.subheading(containerEl, "Skills", "SKILL.md files the agent reads and authors — the learning loop.");
		this.skills(containerEl);
		this.skillsBrowser(containerEl);
		this.subheading(containerEl, "MCP servers", "External tool servers over the Model Context Protocol — stdio (a command) or HTTP (a URL).");
		mcpSection(this.sectionContext(), containerEl);
		this.subheading(
			containerEl,
			"Browse Hub",
			"Bundled source: kepano's Obsidian skills. Search, preview + security-scan, then one-click install into the active profile."
		);
		this.hub(containerEl);
	}

	/* ---------------- browse hub (Hermes Desktop "Browse Hub") ---------------- */

	private hubLoaded = false;
	private hubTapsState: {
		tap: HubTap;
		state: "idle" | "loading" | "ok" | "error";
		error?: string;
		rateLimited?: boolean;
		count?: number;
	}[] = [];
	private hubEntries: Record<string, import("./settings").TapCacheEntry> = {};
	private hubQuery = "";
	private hubResults: HubSkill[] = [];
	private hubSearched = false;
	private hubInstalled: Record<string, string> = {}; // identifier → slug
	private hubInstalledSlugs = new Set<string>();
	private hubBusy: Record<string, boolean> = {}; // identifier or "__all__"
	private hubChipsEl: HTMLElement | null = null;
	private hubResultsEl: HTMLElement | null = null;
	private hubCountEl: HTMLElement | null = null;
	private hubSearchTimer: number | null = null;

	private hubAllTaps(): HubTap[] {
		return allHubTaps(this.plugin.settings.hubTaps);
	}

	/** Initial/refresh load: each tap resolves on its own (Hermes progressive search). */
	private hubEnsureLoaded(force = false): void {
		if (this.searchHarvesting) return; // v0.1.94: tap loads are network — never from a search harvest
		const taps = this.hubAllTaps();
		if (this.hubLoaded && !force) return;
		this.hubLoaded = true;
		for (const t of this.hubTapsState) {
			if (!taps.some((x) => x.repo === t.tap.repo)) this.hubTapsState.splice(this.hubTapsState.indexOf(t), 1);
		}
		for (const tap of taps) {
			let st = this.hubTapsState.find((x) => x.tap.repo === tap.repo);
			if (!st) {
				st = { tap, state: "idle" };
				this.hubTapsState.push(st);
			}
			if (st.state === "loading") continue;
			if (!force && st.state === "ok" && this.hubEntries[tap.repo]) continue;
			st.state = "loading";
			st.error = undefined;
			void (async () => {
				try {
					const entry = await this.plugin.hubClient.loadTap(tap, force);
					this.hubEntries[tap.repo] = entry;
					st.state = "ok";
					st.count = entry.skills.length;
					st.rateLimited = false;
				} catch (e: any) {
					st.state = "error";
					st.error = e instanceof Error ? e.message : String(e);
					st.rateLimited = e?.rateLimited === true;
				}
				this.renderHubChips();
				this.hubSearch(); // recompute as each source lands
			})();
		}
		this.renderHubChips();
	}

	private async refreshHubInstalled(): Promise<void> {
		const lock = await this.plugin.hubClient.readLock();
		this.hubInstalled = Object.fromEntries(Object.entries(lock).map(([k, v]) => [k, v.slug]));
		this.hubInstalledSlugs = new Set(Object.values(lock).map((v) => v.slug.toLowerCase()));
	}

	private hubSearch(): void {
		const q = this.hubQuery.trim();
		const lists: HubSkill[][] = [];
		for (const st of this.hubTapsState) {
			const entry = this.hubEntries[st.tap.repo];
			if (!entry) continue;
			const metas = q ? filterSkills(entry.skills, q).slice(0, 30) : entry.skills.slice(0, 6);
			lists.push(
				metas.map((m) => ({
					...m,
					identifier: skillIdentifier(st.tap.repo, m.dir),
					tap: st.tap,
					repo: st.tap.repo,
					trust: st.tap.trust,
					installedName: this.hubInstalled[skillIdentifier(st.tap.repo, m.dir)] ?? null,
				}))
			);
		}
		this.hubResults = mergeHubResults(lists).slice(0, 60);
		this.hubSearched = true;
		this.renderHubResults();
		this.hubLazyDescriptions();
	}

	/** Fill descriptions of visible rows (raw.githubusercontent has no API quota). */
	private hubLazyDescriptions(): void {
		if (this.searchHarvesting) return; // v0.1.94: no network fan-out from a search harvest
		const pending = this.hubResults.filter((s) => s.description === undefined).slice(0, 12);
		for (const skill of pending) {
			const entry = this.hubEntries[skill.repo];
			if (!entry) continue;
			void this.plugin.hubClient.fetchDescription(skill.tap, entry, skill).then(() => {
				const el = this.hubResultsEl?.querySelector(`[data-hub-id="${CSS.escape(skill.identifier)}"] .oa-hub-row-desc`);
				if (el && skill.description) el.textContent = skill.description;
			});
		}
	}

	private hub(containerEl: HTMLElement): void {
		const root = containerEl.createDiv({ cls: "oa-hub" });

		/* connected taps (chips with per-source status) */
		this.hubChipsEl = root.createDiv({ cls: "oa-hub-chips" });
		this.renderHubChips();

		/* controls: ONE search box (Hermes desktop parity) + update all.
		   Typing a query searches; typing owner/repo[/subdir] or a github.com
		   URL offers to add it as a community tap — the separate "Add GitHub
		   tap" row is gone (owner directive 2026-07-23). */
		const controls = root.createDiv({ cls: "oa-hub-controls" });
		const { input: search, sync: searchSync } = this.searchField(controls, "oa-hub-search", {
			placeholder: "Search skills, or paste a repo to add a tap — e.g. pdf, or myorg/my-skills",
			"aria-label": "Search hub skills or add a GitHub tap",
		});
		search.value = this.hubQuery;
		const updateBtn = controls.createEl("button", { cls: "oa-mini-btn", text: "Update all" });
		updateBtn.addEventListener("click", () => void this.hubUpdateAll(updateBtn));

		const tapHint = root.createDiv({ cls: "oa-hub-tap-hint" });

		/* repo-shaped text that isn't a known tap yet (default taps excluded) */
		const hubTapCandidate = (): HubTap | null => {
			const tap = parseTap(this.hubQuery.trim());
			if (!tap) return null;
			return this.hubAllTaps().some((t) => t.repo === tap.repo) ? null : tap;
		};

		const renderTapHint = (): void => {
			tapHint.empty();
			const tap = hubTapCandidate();
			if (!tap) return; // empty hint collapses via :empty (styles.css)
			const btn = tapHint.createEl("button", { cls: "oa-hub-tap-hint-btn" });
			btn.createSpan({ text: `Add tap “${tap.repo}”` });
			btn.createSpan({ cls: "oa-hub-tap-hint-key", text: "Enter ↵" });
			btn.addEventListener("click", () => void addTap(tap));
		};

		const addTap = async (tap: HubTap): Promise<void> => {
			if (!this.plugin.settings.hubTaps.includes(tap.repo)) {
				this.plugin.settings.hubTaps = [...this.plugin.settings.hubTaps, tap.repo];
				await this.plugin.saveSettings();
			}
			/* load the tap NOW: hubEnsureLoaded(false) early-returns after the
			   first pass (hubLoaded stays set), which is why the old Add-tap
			   row silently did nothing until a plugin reload */
			this.hubLoaded = false;
			this.hubEnsureLoaded(false);
			this.renderHubChips();
			new Notice(`Open Agent: tap “${tap.label}” added.`);
			/* the repo string is not a search term — clear the box so the
			   featured list (with the new tap's skills streaming in) shows */
			search.value = "";
			searchSync();
			this.hubQuery = "";
			renderTapHint();
			this.hubSearch();
		};

		search.addEventListener("input", () => {
			this.hubQuery = search.value;
			renderTapHint();
			if (this.hubSearchTimer) window.clearTimeout(this.hubSearchTimer);
			this.hubSearchTimer = window.setTimeout(() => this.hubSearch(), 350); // hermes: 350ms debounce
		});
		search.addEventListener("keydown", (e) => {
			if (e.key !== "Enter") return;
			const tap = hubTapCandidate();
			if (!tap) return; // plain query — search already runs live
			e.preventDefault();
			void addTap(tap);
		});
		renderTapHint();

		this.hubCountEl = root.createDiv({ cls: "oa-hub-count" });
		this.hubResultsEl = root.createDiv({ cls: "oa-hub-results" });
		this.renderHubResults();

		/* install from URL (add-tap moved into the search box above) */
		let urlInput = "";
		new Setting(root)
			.setName("Install from URL")
			.setDesc("Direct https:// link to a SKILL.md — scanned by the Skills Guard before install.")
			.addText((t) =>
				t.setPlaceholder("https://example.com/path/SKILL.md").onChange((v) => {
					urlInput = v;
				})
			)
			.addButton((b) =>
				b.setButtonText("Fetch & install").onClick(async () => {
					if (!urlInput.trim()) return;
					b.setButtonText("Fetching…").setDisabled(true);
					try {
						const fetched = await this.plugin.hubClient.fetchUrlSkill(urlInput);
						const report = (await import("./agent/skillsGuard")).scanSkillFiles([{ path: "SKILL.md", text: fetched.text }]);
						const policy = installPolicy(report);
						const doInstall = async () => {
							const { slug } = await this.plugin.hubClient.installUrl(urlInput, fetched.name);
							await this.refreshHubInstalled();
							new Notice(`Open Agent: “${fetched.name}” installed → skills/${slug}.`);
							this.hubSearch();
							this.display();
						};
						if (policy === "allow") await doInstall();
						else this.openGuardModal(fetched.name, report, policy, doInstall);
					} catch (e) {
						new Notice(`Open Agent: ${e instanceof Error ? e.message : String(e)}`);
					} finally {
						b.setButtonText("Fetch & install").setDisabled(false);
					}
				})
			);

		/* kick (once) */
		void this.refreshHubInstalled().then(() => this.hubSearch());
		this.hubEnsureLoaded(false);
		window.setTimeout(() => this.hubSearch(), 0);
	}

	private renderHubChips(): void {
		if (!this.hubChipsEl) return;
		this.hubChipsEl.empty();
		const label = this.hubChipsEl.createSpan({ cls: "oa-hub-chips-label", text: "Hubs:" });
		label.title = "Built-in tap: kepano's official Obsidian skills (skills/ subtree); paste a repo into the search box to add your own.";
		for (const st of this.hubTapsState) {
			const chip = this.hubChipsEl.createSpan({
				cls: `oa-hub-chip oa-trust-${st.tap.trust}${st.state === "error" ? " is-degraded" : ""}`,
			});
			if (st.state === "loading") chip.addClass("is-loading");
			chip.createSpan({ text: st.tap.label });
			if (st.state === "loading") chip.createSpan({ cls: "oa-hub-chip-spin", text: "…" });
			else if (st.state === "ok" && st.count !== undefined) chip.createSpan({ cls: "oa-hub-chip-count", text: String(st.count) });
			if (st.error) chip.title = st.error;
			else chip.title = `${st.tap.trust} · ${st.tap.repo}`;
			/* custom taps are removable */
			if (st.tap.trust === "community") {
				const x = chip.createEl("button", { cls: "oa-hub-chip-x", text: "×" });
				x.title = "Remove tap";
				x.setAttribute("aria-label", `Remove tap ${st.tap.repo}`);
			x.addEventListener("click", async (e) => {
				e.stopPropagation();
				this.plugin.settings.hubTaps = this.plugin.settings.hubTaps.filter((t) => parseTap(t)?.repo !== st.tap.repo);
				// drop its catalog cache too (owner directive 2026-07-25)
				pruneHubCache(this.plugin.settings.hubCache, this.hubAllTaps());
				await this.plugin.saveSettings();
					this.hubTapsState = this.hubTapsState.filter((s) => s !== st);
					delete this.hubEntries[st.tap.repo];
					this.renderHubChips();
					this.hubSearch();
				});
			}
		}
	}

	private renderHubResults(): void {
		if (!this.hubResultsEl) return;
		this.hubResultsEl.empty();
		if (this.hubCountEl) {
			const anyLoading = this.hubTapsState.some((s) => s.state === "loading");
			const installedCount = Object.keys(this.hubInstalled).length;
			this.hubCountEl.setText(
				!this.hubSearched
					? ""
					: this.hubQuery.trim()
						? `${this.hubResults.length} result${this.hubResults.length === 1 ? "" : "s"}${anyLoading ? " — searching…" : ""}`
						: `Featured · ${installedCount} installed`
			);
		}
		if (this.hubResults.length === 0) {
			const anyLoading = this.hubTapsState.some((s) => s.state === "loading");
			if (anyLoading) {
				/* v0.1.157 (A7 Skeleton): shimmer rows while catalogs load. */
				this.skeletonRows(this.hubResultsEl, 3);
				return;
			}
			this.emptyState(this.hubResultsEl, {
				title: this.hubQuery.trim() ? "No matches" : "No skills found",
				description: this.hubQuery.trim()
					? "No hub skills match your search."
					: "Check the hub chips above.",
			});
			return;
		}
		for (const skill of this.hubResults) {
			const installed = this.hubInstalled[skill.identifier] !== undefined;
			const busy = this.hubBusy[skill.identifier] === true;
			const row = this.hubResultsEl.createDiv({ cls: "oa-hub-row" });
			row.setAttribute("data-hub-id", skill.identifier);
			const main = row.createDiv({ cls: "oa-hub-row-main" });
			const head = main.createDiv({ cls: "oa-hub-row-head" });
			head.createSpan({ cls: "oa-hub-row-name", text: skill.name });
			head.createSpan({ cls: `oa-hub-trust oa-trust-${skill.trust}`, text: skill.trust });
			if (installed) head.createSpan({ cls: "oa-hub-installed-badge", text: "installed" });
			head.createSpan({ cls: "oa-hub-row-src", text: skill.tap.label });
			main.createDiv({ cls: "oa-hub-row-desc", text: skill.description ?? "" });

			const actions = row.createDiv({ cls: "oa-hub-row-actions" });
			const preview = actions.createEl("button", { cls: "oa-mini-btn", text: "Preview" });
			preview.addEventListener("click", () => void this.hubPreview(skill));
			const btn = actions.createEl("button", {
				cls: `oa-mini-btn${installed ? "" : " oa-mini-cta"}`,
				text: busy ? "…" : installed ? "Uninstall" : "Install",
			});
			btn.disabled = busy;
			btn.addEventListener("click", () => {
				if (installed) void this.hubUninstall(skill);
				else void this.hubInstallFlow(skill);
			});
		}
	}

	/** Preview dialog (SKILL.md + files + on-demand security scan). */
	private async hubPreview(skill: HubSkill): Promise<void> {
		const entry = this.hubEntries[skill.repo];
		if (!entry) return;
		try {
			const data = await this.plugin.hubClient.preview(skill.tap, entry, skill);
			new HubSkillPreviewModal(this.app, skill, data, {
				onScan: () => this.plugin.hubClient.scan(skill.tap, entry, skill),
				onInstall: () => void this.hubInstallFlow(skill),
			}).open();
		} catch (e) {
			new Notice(`Open Agent: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	/** Scan → policy (allow/ask/block) → install. Hermes installs are user-driven. */
	private async hubInstallFlow(skill: HubSkill): Promise<void> {
		const entry = this.hubEntries[skill.repo];
		if (!entry || this.hubBusy[skill.identifier]) return;
		this.hubBusy[skill.identifier] = true;
		this.renderHubResults();
		try {
			const report = await this.plugin.hubClient.scan(skill.tap, entry, skill);
			const policy = installPolicy(report);
			const doInstall = async () => {
				const res = await this.plugin.hubClient.install(skill.tap, entry, skill);
				await this.refreshHubInstalled();
				new Notice(
					`Open Agent: “${skill.name}” installed → skills/${res.slug} (${res.fileCount} files${res.skippedLarge ? `, ${res.skippedLarge} large files skipped` : ""}).`
				);
				this.display();
			};
			if (policy === "allow") await doInstall();
			else this.openGuardModal(skill.name, report, policy, doInstall);
		} catch (e) {
			new Notice(`Open Agent: install failed — ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			this.hubBusy[skill.identifier] = false;
			this.renderHubResults();
		}
	}

	private async hubUninstall(skill: HubSkill): Promise<void> {
		if (this.hubBusy[skill.identifier]) return;
		this.hubBusy[skill.identifier] = true;
		this.renderHubResults();
		try {
			const slug = await this.plugin.hubClient.uninstall(skill.identifier);
			await this.refreshHubInstalled();
			if (slug) new Notice(`Open Agent: “${skill.name}” uninstalled (skills/${slug} removed).`);
			this.display();
		} finally {
			this.hubBusy[skill.identifier] = false;
			this.renderHubResults();
		}
	}

	private async hubUpdateAll(btn: HTMLButtonElement): Promise<void> {
		if (this.hubBusy.__all__) return;
		this.hubBusy.__all__ = true;
		btn.setText("Checking…");
		btn.disabled = true;
		try {
			const stale = await this.plugin.hubClient.checkUpdates(this.hubAllTaps());
			if (stale.length === 0) {
				new Notice("Open Agent: all hub skills are up to date.");
				return;
			}
			let updated = 0;
			btn.setText(`Updating 0/${stale.length}…`);
			for (const { identifier, entry } of stale) {
				const tap = this.hubAllTaps().find((t) => t.repo === entry.repo) ?? parseTap(entry.repo);
				if (tap) {
					const res = await this.plugin.hubClient.update(identifier, tap);
					if (res) updated++;
				}
				btn.setText(`Updating ${updated}/${stale.length}…`);
			}
			await this.refreshHubInstalled();
			new Notice(`Open Agent: ${updated} skill${updated === 1 ? "" : "s"} updated from the hub.`);
			this.display();
		} catch (e) {
			new Notice(`Open Agent: update failed — ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			this.hubBusy.__all__ = false;
			btn.setText("Update all");
			btn.disabled = false;
		}
	}

	/** Skills Guard findings dialog: caution asks, dangerous blocks until consent. */
	private openGuardModal(name: string, report: GuardReport, policy: "ask" | "block", onConfirm: () => Promise<void>): void {
		new GuardFindingsModal(this.app, name, report, policy, async () => {
			await onConfirm();
		}).open();
	}

	/** The explicit form of what `this` used to give the section renderers.
	 * Rebuilt per call: it holds no state, only bound access to the tab. */
	private sectionContext(): SectionContext {
		return {
			app: this.app,
			plugin: this.plugin,
			subheading: (el, text, desc) => this.subheading(el, text, desc),
			resetButton: (setting, path) => this.resetButton(setting, path),
			emptyState: (el, opts) => this.emptyState(el, opts),
			display: () => this.display(),
		};
	}

	private subheading(containerEl: HTMLElement, text: string, desc: string): HTMLElement {
		const el = containerEl.createDiv({ cls: "oa-subsection" });
		el.createEl("h3", { cls: "oa-subsection-title", text });
		el.createDiv({ cls: "oa-subsection-desc", text: desc });
		return el; // callers may addClass (v0.1.50: oa-danger-zone on the General tab)
	}

	/* v0.1.187 (owner: "reset khusus yang ketik manual, terlebih angka"):
	   a ↺ reset button appears ONLY when the live value differs from the
	   default. Click restores DEFAULT_SETTINGS[path] (deep-cloned), saves,
	   announces, and re-renders so the button + the modified-dot disappear.
	   Toggles/enums/objects/secrets deliberately never call this. */
	private resetButton(setting: Setting, path: string): void {
		const s = this.plugin.settings;
		if (!isModified(s, path)) return;
		setting.addExtraButton((b) =>
			b
				.setIcon("rotate-ccw")
				.setTooltip("Reset to default")
				.onClick(async () => {
					setPath(s as unknown as Record<string, unknown>, path, JSON.parse(JSON.stringify(getPath(DEFAULT_SETTINGS, path))));
					this.plugin.saveSettingsSafe();
					this.plugin.refreshViews();
					new Notice(`Open Agent: “${setting.nameEl.textContent?.trim() ?? path}” reset to default.`);
					this.display();
				})
		);
	}

	/** v0.1.152: one empty-state shape for every settings surface (lobe-ui
	 * Empty parity — title + description + optional action; no emoji, per the
	 * openagent-ui contract). Compact inline lists pass title-only. */
	private emptyState(
		containerEl: HTMLElement,
		opts: { title: string; description?: string; action?: HTMLElement },
	): HTMLElement {
		const el = containerEl.createDiv({ cls: "oa-empty" });
		el.createDiv({ cls: "oa-empty-title", text: opts.title });
		if (opts.description) el.createDiv({ cls: "oa-empty-desc", text: opts.description });
		if (opts.action) el.createDiv({ cls: "oa-empty-action" }).appendChild(opts.action);
		return el;
	}

	/** v0.1.157 (A7 Skeleton): shimmering placeholder rows while a list loads
	 * (hub results, cron focus skills). Behavioral port of lobe-ui Skeleton
	 * paragraph rows — our own markup, Obsidian vars, reduced-motion safe. */
	private skeletonRows(containerEl: HTMLElement, count = 3): void {
		const wrap = containerEl.createDiv({ cls: "oa-skeleton" });
		for (let i = 0; i < count; i++) {
			const row = wrap.createDiv({ cls: "oa-skeleton-row" });
			row.createDiv({ cls: "oa-skeleton-line is-main" });
			row.createDiv({ cls: "oa-skeleton-line is-sub" });
		}
	}

	/* v0.1.190 (owner: "hidupkan kembali tab about"): informational tab —
	   identity, license, attribution (reference-sources.md), and a local-data
	   statement + Copy diagnostics. No settings, no markModified. Every row is
	   a real Setting so the search harvest indexes the tab (F33 aboutInSearch). */
	private about(containerEl: HTMLElement): void {
		const m = this.plugin.manifest;

		this.subheading(containerEl, "Identity", "What is running, and what it needs.");
		new Setting(containerEl)
			.setName("Version")
			.setDesc(`Open Agent v${m.version} — build ${BUILD_STAMP}.`);
		new Setting(containerEl)
			.setName("Requirements")
			.setDesc(`Obsidian ${m.minAppVersion} or newer. Runs on desktop and mobile.`);

		this.subheading(containerEl, "About", "What this plugin is.");
		new Setting(containerEl).setName("Description").setDesc(m.description ?? "");

		this.subheading(containerEl, "License", "Free to use, modify, and share.");
		new Setting(containerEl)
			.setName("MIT License")
			.setDesc("© 2026 Open Agent contributors. See the LICENSE file shipped with this plugin.");

		this.subheading(containerEl, "Built on", "The upstream projects that shaped this plugin.");
		const builtOn: [string, string][] = [
			["Hermes Agent", "agent loop and tools"],
			["Hermes Desktop", "settings layout"],
			["prompt-kit", "chat UI components"],
			["lobe-ui", "data-entry controls"],
			["shadcn-ui", "design tokens and accessibility patterns"],
			["Lucide", "icons"],
			["obsidian-copilot", "markdown preprocessing"],
		];
		for (const [name, role] of builtOn) {
			new Setting(containerEl).setName(name).setDesc(role);
		}

		this.subheading(containerEl, "Data & diagnostics", "Everything stays local — nothing is sent anywhere by this plugin.");
		new Setting(containerEl)
			.setName("Copy diagnostics")
			.setDesc("Copies version, build, platform, and toolset/provider counts — no secrets. Useful for bug reports.")
			.addButton((b) =>
				b
					.setButtonText("Copy diagnostics")
					.setCta()
					.onClick(() => void this.copyDiagnostics())
			);
	}

	/* Diagnostics blob for bug reports: version/build/platform + counts only.
	   Provider ids appear WITHOUT keys — never leak credentials. */
	private async copyDiagnostics(): Promise<void> {
		const s = this.plugin.settings;
		const m = this.plugin.manifest;
		const enabled = Object.values(s.toolsets).filter((v) => v === true).length;
		const total = Object.keys(s.toolsets).length;
		const withKeys = s.providers.filter((p) => p.enabled && p.apiKey).map((p) => p.id);
		const platform = Platform.isMobile ? "mobile" : Platform.isDesktop ? "desktop" : "unknown";
		const text = [
			`Open Agent v${m.version}`,
			`Build ${BUILD_STAMP}`,
			`Min Obsidian ${m.minAppVersion}`,
			`Platform ${platform}`,
			`Toolsets enabled ${enabled} of ${total}`,
			`Providers with keys ${withKeys.length ? withKeys.join(", ") : "none"}`,
			`User agent ${navigator.userAgent}`,
		].join("\n");
		/* copyText carries the execCommand fallback for hosts without the async
		   Clipboard API; it never throws, it reports. Do not announce a copy
		   that did not happen (sweep finding T1). */
		const ok = await copyText(text);
		new Notice(
			ok
				? "Open Agent: diagnostics copied to the clipboard."
				: "Open Agent: could not reach the clipboard — copy blocked by the host."
		);
	}

	private toolsets(containerEl: HTMLElement): void {
		const s = this.plugin.settings;
		const sets: { key: keyof typeof s.toolsets; label: string; desc: string }[] = [
			{ key: "vault", label: "Vault tools", desc: "read / write / edit / delete / rename notes, list files, search" },
			{ key: "web", label: "Web tools", desc: "fetch and read web pages" },
			{ key: "memory", label: "Memory tools", desc: "save / search long-term memory and user profile" },
			{ key: "skills", label: "Skill tools", desc: "list and create reusable skills" },
			{ key: "automations", label: "Automation tools", desc: "cronjob — let the agent create and manage scheduled automations" },
			{ key: "clarify", label: "Clarify tool", desc: "clarify — ask the user structured questions (choices / multi-select / free text) mid-run" },
			{ key: "todo", label: "Todo tool", desc: "todo — the agent keeps a session task list for complex multi-step work" },
			{ key: "vision", label: "Vision tool", desc: "vision_analyze — let the agent load and read images (vault file, URL, or data URL)" },
			{ key: "delegation", label: "Delegation tool", desc: "delegate_task — spawn isolated subagents; only their final summaries return" },
		];
		for (const set of sets) {
			const stToolsetsX = new Setting(containerEl).setName(set.label).setDesc(set.desc).addToggle((t) =>
				t.setValue(s.toolsets[set.key]).onChange(async (v) => {
					s.toolsets[set.key] = v;
					this.plugin.saveSettingsSafe();
				})
			);
			markModified(stToolsetsX, this.plugin.settings, `toolsets.${set.key}`);
		}
		/* owner directive 2026-07-23: Hermes semantics — the toolset switches
		   above are the ONLY tool controls; the per-tool rows (and the
		   disabledTools layer behind them) were removed. Keep it this way. */
	}

	private webSearchSettings(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		const backend = new Setting(containerEl)
			.setName("Search backend")
			.setDesc("DuckDuckGo (default) needs no key. Brave/Tavily need keys; SearXNG needs its own URL. Missing credentials fall back to DuckDuckGo.")
			.addDropdown((dd) =>
				dd
					.addOption("ddgs", "DuckDuckGo (free)")
					.addOption("brave", "Brave (free-tier key)")
					.addOption("tavily", "Tavily (key)")
					.addOption("searxng", "SearXNG (self-hosted)")
					.setValue(s.webSearch.backend)
					.onChange(async (v) => {
						s.webSearch.backend = v as "ddgs" | "brave" | "tavily" | "searxng";
						this.plugin.saveSettingsSafe();
						this.display();
					})
			);
		markModified(backend, this.plugin.settings, "webSearch.backend");

		const brave = new Setting(containerEl)
			.setName("Brave Search API key")
			.setDesc("Free tier at brave.com/search/api/. Stored in settings and redacted from exports.")
			.addText((t) => t.setPlaceholder("BSA…").setValue(s.webSearch.braveKey).onChange(async (v) => {
				s.webSearch.braveKey = v.trim();
				this.plugin.saveSettingsSafe();
			}));
		markModified(brave, this.plugin.settings, "webSearch.braveKey");

		const tavily = new Setting(containerEl)
			.setName("Tavily API key")
			.setDesc("tavily.com. Stored in settings and redacted from exports.")
			.addText((t) => t.setPlaceholder("tvly-…").setValue(s.webSearch.tavilyKey).onChange(async (v) => {
				s.webSearch.tavilyKey = v.trim();
				this.plugin.saveSettingsSafe();
			}));
		markModified(tavily, this.plugin.settings, "webSearch.tavilyKey");

		const searxng = new Setting(containerEl)
			.setName("SearXNG instance URL")
			.setDesc("e.g. http://localhost:8080. Must be http(s).")
			.addText((t) => t.setPlaceholder("http://localhost:8080").setValue(s.webSearch.searxngUrl).onChange(async (v) => {
				const raw = v.trim();
				s.webSearch.searxngUrl = /^https?:\/\//i.test(raw) ? raw : "";
				this.plugin.saveSettingsSafe();
			}));
		markModified(searxng, this.plugin.settings, "webSearch.searxngUrl");
	}

	private skills(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		const stSkillsEnabled = new Setting(containerEl).setName("Enable skills").addToggle((t) =>
			t.setValue(s.skillsEnabled).onChange(async (v) => {
				s.skillsEnabled = v;
				this.plugin.saveSettingsSafe();
			})
		);
		markModified(stSkillsEnabled, this.plugin.settings, "skillsEnabled");

		const stSkillsFolder = new Setting(containerEl)
			.setName("Skills folder")
			.setDesc("Vault folder holding skill folders (each with a SKILL.md).")
			.addText((t) =>
				t.setValue(s.skillsFolder).onChange(async (v) => {
					try {
						s.skillsFolder = canonicalVaultPath(v.trim() || "openagent/openagent-skills", { label: "Skills folder" });
						await this.plugin.saveSettings();
					} catch (e) {
						t.setValue(s.skillsFolder);
						new Notice(`Open Agent: ${e instanceof Error ? e.message : String(e)}`);
					}
				})
			);
		markModified(stSkillsFolder, this.plugin.settings, "skillsFolder");

		const stAutoCreateSkills = new Setting(containerEl)
			.setName("Auto-create skills")
			.setDesc("Let the agent capture reusable procedures as skills after complex tasks (its learning loop).")
			.addToggle((t) =>
				t.setValue(s.autoCreateSkills).onChange(async (v) => {
					s.autoCreateSkills = v;
					this.plugin.saveSettingsSafe();
				})
			);
		markModified(stAutoCreateSkills, this.plugin.settings, "autoCreateSkills");

	}

	/** Komponen search TUNGGAL untuk sub-area (v0.1.114 owner: "samakan
	    component search biar selaras" — search skills khususnya, yang dulunya
	    input telanjang): shell yang sama dengan bilah Search settings
	    (border+radius+ikon lup+tombol clear+has-query+Escape). Kelas
	    spesifik (cls) TETAP di input — probe lama (.oa-hub-search di
	    settings lane) tidak pindah. */
	private searchField(
		container: HTMLElement,
		cls: string,
		attr: { placeholder: string; "aria-label": string },
	): { input: HTMLInputElement; sync: () => void } {
		const wrap = container.createDiv({ cls: `oa-settings-search ${cls}-wrap` });
		wrap.setAttribute("role", "search");
		const icon = wrap.createSpan({ cls: "oa-settings-search-icon", attr: { "aria-hidden": "true" } });
		setIcon(icon, "search");
		const input = wrap.createEl("input", {
			cls: `oa-settings-search-input ${cls}`,
			attr: { type: "search", placeholder: attr.placeholder, "aria-label": attr["aria-label"] },
		});
		const clearBtn = wrap.createEl("button", {
			cls: "oa-settings-search-clear",
			attr: { type: "button", "aria-label": "Clear search" },
		});
		setIcon(clearBtn, "x");
		/* has-query ikut membaca assignment programatik (addTap mengosongkan
		   value langsung) — sync diekspor untuk itu */
		const sync = (): void => wrap.toggleClass("has-query", input.value.length > 0);
		input.addEventListener("input", sync);
		input.addEventListener("keydown", (e) => {
			if (e.key !== "Escape") return;
			e.stopPropagation();
			input.value = "";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		clearBtn.addEventListener("click", () => {
			input.value = "";
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.focus();
		});
		sync();
		return { input, sync };
	}

	/** Searchable library of learned skills — expand to read, trash to remove. */
	private skillsBrowser(containerEl: HTMLElement): void {
		const wrap = containerEl.createDiv({ cls: "oa-skills-browser" });
		const { input: search } = this.searchField(wrap, "oa-skills-search", {
			placeholder: "Search skills…",
			"aria-label": "Search installed skills",
		});
		const listEl = wrap.createDiv({ cls: "oa-skill-list" });
		let query = "";

		const renderList = async (): Promise<void> => {
			const skills = await this.plugin.skillsStore.loadSkills();
			const q = query.trim().toLowerCase();
			const shown = skills.filter(
				(sk) => !q || sk.name.toLowerCase().includes(q) || sk.description.toLowerCase().includes(q)
			);
			listEl.empty();
			if (shown.length === 0) {
				this.emptyState(listEl, {
					title: q ? "No matches" : "No skills installed",
					description: q
						? "No skills match your search."
						: "The agent writes them into the skills folder after complex tasks.",
				});
				return;
			}
			for (const sk of shown) {
				const row = listEl.createDiv({ cls: "oa-skill-row" });
				row.toggleClass("is-disabled", !sk.enabled);
				const head = row.createDiv({ cls: "oa-skill-head" });
				const toggle = head.createDiv({ cls: "checkbox-container" });
				toggle.toggleClass("is-enabled", sk.enabled);
				toggle.setAttribute("role", "checkbox");
				toggle.setAttribute("aria-checked", sk.enabled ? "true" : "false");
				toggle.setAttribute("aria-label", sk.enabled ? "Disable skill" : "Enable skill");
				toggle.tabIndex = 0;
				const flip = (): void => {
					void (async () => {
						await this.plugin.skillsStore.setSkillEnabled(sk.path, !sk.enabled);
						await renderList();
					})();
				};
				toggle.addEventListener("click", (e) => {
					e.stopPropagation();
					flip();
				});
				toggle.addEventListener("keydown", (e) => {
					if (e.key === " " || e.key === "Enter") {
						e.preventDefault();
						e.stopPropagation();
						flip();
					}
				});
				const chevron = head.createSpan({ cls: "oa-skill-chevron" });
				setIcon(chevron, "chevron-right");
				head.createSpan({ cls: "oa-skill-name", text: sk.name });
				/* provenance (Hermes): hub-installed skills carry a badge */
				const skillFolder = sk.path.split("/").slice(-2, -1)[0]?.toLowerCase();
				if (skillFolder && this.hubInstalledSlugs.has(skillFolder)) {
					head.createSpan({ cls: "oa-skill-hub-badge", text: "hub" });
				}
				if (sk.description) head.createSpan({ cls: "oa-skill-desc", text: sk.description });
				const del = head.createEl("button", {
					cls: "oa-skill-delete",
					text: "Delete",
					attr: { "aria-label": `Delete skill ${sk.name}` },
				});
				head.setAttribute("role", "button");
				head.tabIndex = 0;
				head.setAttribute("aria-expanded", "false");
				const toggleRow = (): void => {
					const open = row.classList.toggle("is-open");
					head.setAttribute("aria-expanded", open ? "true" : "false");
				};
				head.addEventListener("click", toggleRow);
				head.addEventListener("keydown", (e) => {
					if (e.key === " " || e.key === "Enter") {
						e.preventDefault();
						toggleRow();
					}
				});
				del.addEventListener("click", (e) => {
					e.stopPropagation();
					void (async () => {
						await this.plugin.skillsStore.deleteSkill(sk.path);
						new Notice(`Open Agent: skill “${sk.name}” deleted.`);
						await renderList();
					})();
				});
				row.createDiv({ cls: "oa-skill-body", text: sk.instructions || "(empty instructions)" });
			}
		};

		search.addEventListener("input", () => {
			query = search.value;
			void renderList();
		});
		void renderList();
	}

	/** MCP server registry — stdio runtime connects lazily on first run. */
	private automations(containerEl: HTMLElement): void {
		const s = this.plugin.settings;

		if (s.cronTasks.length === 0) {
			this.emptyState(containerEl, {
				title: "No automations yet",
				description: "Add one below, or ask the agent in chat (\u201cevery morning at 9, summarize new notes\u201d).",
			});
		}
		/* v0.1.181: group label — scheduled tasks above the builder. */
		this.subheading(containerEl, "Scheduled tasks", "Runs that fire on a schedule while Obsidian is open.");
		for (const task of s.cronTasks) this.cronRow(containerEl, task);

		new Setting(containerEl)
			.setName("Blueprint templates")
			.setDesc("Start from a ready-made automation — the schedule and prompt are pre-filled, you only fill a few blanks.")
			.addButton((b) =>
				b.setButtonText("Browse templates").onClick(() => new BlueprintCatalogModal(this.app, this.plugin, () => this.display()).open())
			);

		const editing =
			(this.editingCronId ? s.cronTasks.find((t) => t.id === this.editingCronId) : null) ?? null;
		this.cronForm(containerEl, editing);

		containerEl.createDiv({
			cls: "oa-cron-note",
			text: "Runs only fire while Obsidian is open — missed runs are offered when you return. The agent can also manage automations from chat via the cronjob tool (Capabilities \u2192 Automation tools). Full run logs live under openagent/cron/runs/. Cron automations always run on the Default profile.",
		});
	}

	/** One automation row: status dot, schedule/ledger meta, actions, run history. */
	private cronRow(containerEl: HTMLElement, task: CronTask): void {
		const s = this.plugin.settings;
		const running = this.plugin.isCronRunning(task.id);
		const completed = isCronCompleted(task) && !task.enabled;
		const status = running
			? "running"
			: completed
			? "completed"
			: !task.enabled
			? "paused"
			: task.lastStatus === "error"
			? "error"
			: task.lastRun > 0
			? "ok"
			: "idle";

		const setting = new Setting(containerEl);
		const nameFrag = document.createDocumentFragment();
		const dot = document.createElement("span");
		dot.className = `oa-cron-dot is-${status}`;
		const dotLabel = running
			? "running now"
			: completed
			? `completed after ${task.runCount} run${task.runCount === 1 ? "" : "s"}`
			: !task.enabled
			? "paused"
			: task.lastStatus === "error"
			? "last run failed"
			: task.lastRun > 0
			? "last run ok"
			: "scheduled, never run";
		dot.title = dotLabel;
		dot.setAttribute("role", "img");
		dot.setAttribute("aria-label", `Status: ${dotLabel}`);
		nameFrag.append(dot, document.createTextNode(` ${task.name}`));
		setting.setName(nameFrag);

		const descFrag = document.createDocumentFragment();
		const meta = document.createElement("div");
		const bits = [describeCronExpr(task.schedule.expr) ?? task.schedule.display, `\u2192 ${task.targetNote}`];
		if (completed) bits.push("completed");
		else if (task.enabled) bits.push(`next ${formatRelative(task.nextRun)}`);
		else bits.push("paused");
		bits.push(
			task.lastRun > 0 ? `last ${formatRelative(task.lastRun)}` : "never run",
			typeof task.maxRuns === "number" && task.maxRuns > 0
				? `${task.runCount}/${task.maxRuns} runs`
				: `${task.runCount} run${task.runCount === 1 ? "" : "s"}`
		);
		if (task.skills && task.skills.length > 0)
			bits.push(`skills ${task.skills.length}`);
		if (task.chainContext) bits.push("chain");
		if (task.notify) bits.push("notify");
		meta.textContent = bits.join(" \u00b7 ");
		descFrag.appendChild(meta);
		if (task.lastStatus === "error" && task.lastError) {
			const err = document.createElement("div");
			err.className = "oa-cron-last-error";
			err.textContent = task.lastError;
			descFrag.appendChild(err);
		}
		setting.setDesc(descFrag);

		setting
			.addToggle((t) =>
				t.setValue(task.enabled).onChange(async (v) => {
					task.enabled = v;
					if (v) task.nextRun = nextCronRun(task.schedule.expr, Date.now()) ?? 0;
					this.plugin.saveSettingsSafe();
					this.display();
				})
			)
			.addExtraButton((b) =>
				b
					.setIcon("play")
					.setTooltip("Run now")
					.onClick(() => void this.plugin.runCronTask(task.id, true))
			)
			.addExtraButton((b) =>
				b
					.setIcon("pencil")
					.setTooltip("Edit")
					.onClick(() => {
						this.editingCronId = task.id;
						this.display();
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("history")
					.setTooltip("Run history")
					.onClick(() => {
						if (this.cronHistoryOpen.has(task.id)) this.cronHistoryOpen.delete(task.id);
						else this.cronHistoryOpen.add(task.id);
						this.display();
					})
			)
			.addExtraButton((b) =>
				b
					.setIcon("trash-2")
					.setTooltip("Delete")
					.onClick(async () => {
						s.cronTasks = s.cronTasks.filter((t) => t.id !== task.id);
						if (this.editingCronId === task.id) this.editingCronId = null;
						this.cronHistoryOpen.delete(task.id);
						this.plugin.saveSettingsSafe();
						this.display();
					})
			);

		if (this.cronHistoryOpen.has(task.id)) this.cronHistory(containerEl, task);
	}

	/** Last 5 run archives with links. */
	private cronHistory(containerEl: HTMLElement, task: CronTask): void {
		const wrap = containerEl.createDiv({ cls: "oa-cron-history" });
		let archiveFolder: string;
		try {
			const policy = this.plugin.runner.snapshotWorkspacePolicy();
			const raw = cronRunsFolder(task.name);
			archiveFolder = policy.mode === "strict-folder"
				? policy.resolvePath(raw, { label: "Automation archive folder" })
				: policy.assertVisiblePath(raw, "Automation archive folder");
		} catch (e) {
			this.emptyState(wrap, {
				title: "History unavailable",
				description: e instanceof Error ? e.message : String(e),
			});
			return;
		}
		const folder = this.app.vault.getAbstractFileByPath(archiveFolder);
		const files =
			folder instanceof TFolder
				? folder.children
						.filter((c): c is TFile => c instanceof TFile && c.extension === "md")
						.sort((a, b) => b.name.localeCompare(a.name))
						.slice(0, 5)
				: [];
		if (files.length === 0) {
			this.emptyState(wrap, { title: "No run archives yet." });
			return;
		}
		for (const f of files) {
			const link = wrap.createEl("button", { cls: "oa-cron-history-link", text: f.basename });
			link.onclick = () => void this.app.workspace.getLeaf(false).openFile(f);
		}
	}

	/** Add/edit form with schedule presets + live-validated custom cron. */
	private cronForm(containerEl: HTMLElement, existing: CronTask | null): void {
		let name = existing?.name ?? "";
		let prompt = existing?.prompt ?? "";
		let target = existing?.targetNote ?? "openagent/Reports.md";
		const matchedPreset = existing ? presetForExpr(existing.schedule.expr) : null;
		let presetKey = existing ? matchedPreset?.key ?? "custom" : "daily";
		let customExpr = existing && !matchedPreset ? existing.schedule.expr : "";

		const wrap = containerEl.createDiv({ cls: "oa-card oa-cron-new" });
		wrap.createEl("h3", { text: existing ? "Edit automation" : "New automation" });

		new Setting(wrap)
			.setName("Name")
			.addText((t) => t.setValue(name).setPlaceholder("Daily vault digest").onChange((v) => (name = v)));
		const cronPromptSetting = new Setting(wrap).setName("Prompt");
		stackedTextArea(
			cronPromptSetting,
			{ rows: 4, value: prompt, placeholder: "Summarize notes modified today and append a digest.", ariaLabel: "Prompt" },
			(v) => {
				prompt = v;
			}
		);
		new Setting(wrap)
			.setName("Target note")
			.addText((t) =>
				t
					.setValue(target)
					.setPlaceholder("openagent/Reports.md")
					.onChange((v) => (target = v.trim() || "openagent/Reports.md"))
			);

		// schedule: preset dropdown + guided builder for custom (no raw cron
		// that looks like a password — human choices + a "Means: …" line)
		const exprHolder = wrap.createDiv();
		const renderExprRow = (): void => {
			exprHolder.empty();
			if (presetKey !== "custom") return;

			type SchedMode = "daily" | "interval" | "weekly" | "monthly" | "raw";
			let mode: SchedMode = customExpr.trim() ? "raw" : "daily";
			let intervalN = "15";
			let intervalUnit: "minutes" | "hours" = "minutes";
			let timeText = "09:00";
			let weeklyDow = 1; // Monday
			let monthlyDay = 1;
			let rawExpr = customExpr.trim();

			const parseTime = (v: string): { hh: number; mm: number } | null => {
				const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
				if (!m) return null;
				const hh = Number(m[1]);
				const mm = Number(m[2]);
				if (hh > 23 || mm > 59) return null;
				return { hh, mm };
			};

			const computeExpr = (): string => {
				const t = parseTime(timeText) ?? { hh: 9, mm: 0 };
				switch (mode) {
					case "interval":
						return cronExprForInterval(Number(intervalN) || 15, intervalUnit);
					case "weekly":
						return cronExprForWeekly(weeklyDow, t.hh, t.mm);
					case "monthly":
						return cronExprForMonthly(monthlyDay, t.hh, t.mm);
					case "daily":
						return cronExprForDaily(t.hh, t.mm);
					default:
						return rawExpr.trim();
				}
			};

			let descEl: HTMLElement;
			const paint = (): void => {
				customExpr = computeExpr();
				const expr = customExpr.trim();
				if (!expr) {
					descEl.textContent = "Pick a schedule \u2014 no custom expression yet.";
					descEl.classList.remove("oa-field-error");
					return;
				}
				const v = validateCronExpr(expr);
				if (!v.ok) {
					descEl.textContent = v.error;
					descEl.classList.add("oa-field-error");
					return;
				}
				const next = nextCronRun(expr, Date.now());
				const human = describeCronExpr(expr);
				descEl.textContent = `${human ? `Means: ${human}.` : "Custom schedule."}${next ? ` Next run ${formatRelative(next)}.` : ""}`;
				descEl.classList.remove("oa-field-error");
			};

			const fieldsHolder = document.createElement("div");
			fieldsHolder.className = "oa-cron-builder-fields";
			const renderFields = (): void => {
				fieldsHolder.empty();
				if (mode === "interval") {
					const row = new Setting(fieldsHolder).setName("Every");
					row.addText((t) =>
						t.setValue(intervalN).setPlaceholder("15").onChange((v) => {
							intervalN = v;
							paint();
						})
					);
					row.addDropdown((d) =>
						d
							.addOption("minutes", "minutes")
							.addOption("hours", "hours")
							.setValue(intervalUnit)
							.onChange((v) => {
								intervalUnit = v as "minutes" | "hours";
								paint();
							})
					);
				} else if (mode === "daily" || mode === "weekly" || mode === "monthly") {
					new Setting(fieldsHolder)
						.setName("Time")
						.setDesc("24-hour time, e.g. 09:00.")
						.addText((t) =>
							t.setValue(timeText).setPlaceholder("09:00").onChange((v) => {
								timeText = v;
								paint();
							})
						);
					if (mode === "weekly") {
						new Setting(fieldsHolder).setName("Day").addDropdown((d) => {
							WEEKDAY_LABELS.forEach((label, i) => d.addOption(String(i), label));
							d.setValue(String(weeklyDow)).onChange((v) => {
								weeklyDow = Number(v);
								paint();
							});
						});
					}
					if (mode === "monthly") {
						new Setting(fieldsHolder)
							.setName("Day of month")
							.setDesc("1\u201328.")
							.addText((t) =>
								t.setValue(String(monthlyDay)).setPlaceholder("1").onChange((v) => {
									monthlyDay = Math.min(28, Math.max(1, Math.floor(Number(v) || 1)));
									paint();
								})
							);
					}
				} else {
					new Setting(fieldsHolder)
						.setName("Cron expression")
						.setDesc("Advanced: minute hour day month weekday \u2014 e.g. 0 9 * * 1-5.")
						.addText((t) =>
							t.setValue(rawExpr).setPlaceholder("0 9 * * *").onChange((v) => {
								rawExpr = v;
								paint();
							})
						);
				}
			};

			const scheduleRow = new Setting(exprHolder).setName("Custom schedule");
			scheduleRow.addDropdown((d) => {
				d.addOption("daily", "Every day");
				d.addOption("interval", "Every N minutes / hours");
				d.addOption("weekly", "Weekly");
				d.addOption("monthly", "Monthly");
				d.addOption("raw", "Advanced (raw cron)\u2026");
				d.setValue(mode).onChange((v) => {
					mode = v as SchedMode;
					renderFields();
					paint();
				});
			});
			descEl = scheduleRow.descEl.createDiv();
			exprHolder.appendChild(fieldsHolder);
			renderFields();
			paint();
		};

		new Setting(wrap).setName("Schedule").addDropdown((d) => {
			for (const p of CRON_PRESETS) d.addOption(p.key, p.label);
			d.addOption("custom", "Custom schedule\u2026");
			d.setValue(presetKey).onChange((v) => {
				presetKey = v;
				renderExprRow();
			});
		});
		wrap.appendChild(exprHolder); // custom builder rows under the dropdown that controls it
		renderExprRow();

		/* ── Tahap D: skills · repeat count · chaining · notify ── */
		const skillsSel = new Set<string>(existing?.skills ?? []);
		let maxRuns = existing?.maxRuns ? String(existing.maxRuns) : "";
		let chain = existing?.chainContext === true;
		let notify = existing?.notify === true;

		/* Focus skills — picker + add/remove list (no "loads everything" chips). */
		const skillsHolder = wrap.createDiv();
		const renderSkillRows = (skills: Skill[]): void => {
			skillsHolder.empty();
			const nameOf = (n: string): Skill | undefined => skills.find((s) => s.name.toLowerCase() === n.toLowerCase());
			const add = new Setting(skillsHolder)
				.setName("Focus skills")
				.setDesc("Optional: skill docs injected into each run's prompt. Pick them one by one — only enabled skills can be chosen.");
			add.addButton((b) =>
				b
					.setButtonText("Add skill")
					.setCta()
					.onClick(() => {
						new SkillSuggestModal(this.app, skills, (skill) => {
							skillsSel.add(skill.name);
							renderSkillRows(skills);
						}).open();
					})
			);
			if (skillsSel.size === 0) {
				this.emptyState(skillsHolder, {
					title: "No focus skills",
					description: "The run uses your skills normally.",
				});
			}
			const ordered = [...skillsSel];
			for (const name of ordered) {
				const meta = nameOf(name);
				const row = new Setting(skillsHolder).setName(name);
				row.settingEl.addClass("oa-cron-skill-row");
				if (meta) row.setDesc(meta.whenToUse || meta.description || "skill");
				row.addExtraButton((b) =>
					b
						.setIcon("trash-2")
						.setTooltip(`Remove ${name}`)
						.onClick(() => {
							skillsSel.delete(name);
							renderSkillRows(skills);
						})
				);
			}
		};
		this.skeletonRows(skillsHolder, 2);
		if (!this.searchHarvesting) void this.plugin.skillsStore.loadSkills().then((skills) => renderSkillRows(skills));

		new Setting(wrap).setName("Max runs").setDesc("Stop and disable after this many runs. 0 or empty = unlimited.").addText((t) =>
			t.setPlaceholder("0 = unlimited").setValue(maxRuns).onChange((v) => (maxRuns = v.trim()))
		);

		new Setting(wrap)
			.setName("Chain run context")
			.setDesc("Include the previous run's output (≤2000 chars) in the next run's prompt.")
			.addToggle((t) => t.setValue(chain).onChange((v) => (chain = v)));

		new Setting(wrap)
			.setName("Notify on run")
			.setDesc("Show a notice when a scheduled run succeeds (errors always notify).")
			.addToggle((t) => t.setValue(notify).onChange((v) => (notify = v)));

		/* ── v0.1.147 monitor change-detection ── */
		let monitorUrl = existing?.monitorUrl ?? "";
		new Setting(wrap)
			.setName("Watch a page (monitor)")
			.setDesc("Optional URL checked each tick — unchanged content skips the run, a change injects its diff.")
			.addText((t) =>
				t.setPlaceholder("https://example.com/status.json").setValue(monitorUrl).onChange((v) => (monitorUrl = v.trim()))
			);

		/* ── v0.1.147 script/no_agent watchdog ── */
		let scriptName = existing?.script ?? "";
		let noAgent = existing?.noAgent === true;
		new Setting(wrap)
			.setName("Run a script (advanced)")
			.setDesc("Script run each tick from .obsidian/plugins/openagent/scripts/ (.sh/.js/.py) — output feeds the AI. Can't combine with a monitor URL.")
			.addText((t) =>
				t.setPlaceholder("check-status.sh").setValue(scriptName).onChange((v) => (scriptName = v.trim()))
			);
		new Setting(wrap)
			.setName("Script only (no AI)")
			.setDesc("Run the script alone and append its output to the note — the AI is not called (watchdog). Requires a script name.")
			.addToggle((t) => t.setValue(noAgent).onChange((v) => (noAgent = v)));

		const buttons = new Setting(wrap);
		buttons.addButton((b) =>
			b
				.setButtonText(existing ? "Save changes" : "Add automation")
				.setCta()
				.onClick(async () => {
					if (!prompt.trim()) {
						new Notice("Open Agent: give the automation a prompt.");
						return;
					}
					const expr =
						presetKey === "custom"
							? customExpr.trim()
							: CRON_PRESETS.find((p) => p.key === presetKey)?.expr ?? "0 9 * * *";
					const v = validateCronExpr(expr);
					if (!v.ok) {
						new Notice(`Open Agent: ${v.error}`);
						return;
					}
					const s = this.plugin.settings;
					const maxRunsNum = Math.floor(parseInt(maxRuns) || 0);
					const cleanScript = sanitizeScriptName(scriptName);
					const cleanMonitor = /^https?:\/\//i.test(monitorUrl) ? monitorUrl : "";
					if (cleanScript && cleanMonitor) {
						new Notice("Open Agent: pick either a script or a monitor URL, not both.");
						return;
					}
					if (noAgent && !cleanScript) {
						new Notice("Open Agent: “Script only” needs a script name.");
						return;
					}
					if (existing) {
						existing.name = name.trim() || existing.name;
						const scanned = scanCronPrompt(prompt.trim());
						existing.prompt = scanned.clean;
						if (scanned.findings.length) {
							new Notice(`Open Agent: security scan — ${scanned.findings.join("; ")}.`);
						}
						existing.targetNote = target.trim() || "openagent/Reports.md";
						existing.schedule = scheduleFromExpr(expr);
						existing.nextRun = nextCronRun(expr, Date.now()) ?? 0;
						existing.skills = skillsSel.size ? [...skillsSel] : undefined;
						existing.maxRuns = maxRunsNum > 0 ? maxRunsNum : null;
						existing.chainContext = chain || undefined;
						existing.notify = notify || undefined;
						/* monitor URL change resets the stored hash → fresh baseline */
						const nextMonitor = /^https?:\/\//i.test(monitorUrl) ? monitorUrl : "";
						if (nextMonitor !== (existing.monitorUrl ?? "")) {
							existing.monitorUrl = nextMonitor || undefined;
							existing.monitorLastHash = undefined;
							existing.monitorLastContent = undefined;
						}
						/* script/no_agent: name-only; setting a script clears monitor */
						if (cleanScript !== (existing.script ?? "")) {
							existing.script = cleanScript || undefined;
							existing.noAgent = cleanScript ? noAgent || undefined : undefined;
							if (cleanScript) {
								existing.monitorUrl = undefined;
								existing.monitorLastHash = undefined;
								existing.monitorLastContent = undefined;
							}
						} else if (noAgent !== (existing.noAgent === true)) {
							existing.noAgent = cleanScript ? noAgent || undefined : undefined;
						}
						this.editingCronId = null;
						new Notice(`Open Agent: \u201c${existing.name}\u201d saved.`);
					} else {
						const task = newCronTask({
							name,
							prompt,
							expr,
							targetNote: target,
							skills: [...skillsSel],
							maxRuns: maxRunsNum > 0 ? maxRunsNum : null,
							chainContext: chain,
							notify,
							monitorUrl: /^https?:\/\//i.test(monitorUrl) ? monitorUrl : undefined,
							script: cleanScript ?? undefined,
							noAgent,
						});
						s.cronTasks.push(task);
						new Notice(`Open Agent: automation \u201c${task.name}\u201d added \u2014 next run ${formatRelative(task.nextRun)}.`);
					}
					this.plugin.saveSettingsSafe();
					this.display();
				})
		);
		if (existing) {
			buttons.addButton((b) =>
				b.setButtonText("Cancel").onClick(() => {
					this.editingCronId = null;
					this.display();
				})
			);
		}
	}

}

/** Delete-profile confirmation with the Hermes keep/trash data choice (default: keep). */
/** Add/edit one prompt snippet (title + text). null snippet → create. */




/* ── data portability modals (docs/plans/data-portability-plan.md) ─────────────── */


/**
 * Generic full-width stacked control row inside a setting-item (info above,
 * controls below taking the whole row) — the compound-input counterpart of
 * stackedTextArea. Accept Obsidian components (DropdownComponent, …).
 */
/** Base-URL description — specific to the provider being viewed (owner
    2026-07-31: the LM Studio row must not carry Ollama/OpenRouter examples;
    the local-server wording mirrors providers.ts for consistency). */
function baseUrlDesc(providerId: string): string {
	switch (providerId) {
		case "lmstudio":
			return "LM Studio's local server address — default http://localhost:1234/v1. Start the server in LM Studio (Developer → Start Server).";
		case "ollama":
			return "Ollama's OpenAI-compatible endpoint — default http://localhost:11434/v1.";
		case "openrouter":
			return "OpenRouter's endpoint — https://openrouter.ai/api/v1.";
		case "openai":
			return "OpenAI's API endpoint — https://api.openai.com/v1.";
		default:
			return "OpenAI-compatible root URL of this provider, port included — e.g. https://api.example.com/v1";
	}
}

function stackedControl(setting: Setting, opts?: { row?: boolean }): HTMLElement {
	setting.settingEl.addClass("oa-has-stacked");
	const el = setting.settingEl.createDiv({ cls: "oa-stacked-control" });
	/* v0.1.182 (P3): provider+model pairs sit SIDE-BY-SIDE instead of stacked */
	if (opts?.row) el.addClass("oa-control-row");
	return el;
}

/** Generic paste-JSON import box (mirrors the mcp.json import pattern). */


/** Pick an export file written by "Save to vault" (openagent/exports/*.json). */


/** Folder picker for Workspace exclusions — lists real vault folders only
 * (the Obsidian config dir is never offered; it is already protected). */


/** Skill picker for cron "Focus skills" — enabled skills only, sorted by name. */


/** Destructive-action confirm; when requireText is set the button unlocks only on an exact match. */


/** Export one profile as a soul bundle: persona + pins, optional skills, never any secrets. */


/** Hub skill preview — SKILL.md, file listing, on-demand Skills Guard scan (Hermes preview dialog). */


/** Versioned first-use consent. Merely importing settings cannot satisfy it. */


/** First-use consent for the MCP runtime (mirrors TerminalConsentModal). */


/** Catalog installer — curated, pinned MCP servers (mirrors `hermes mcp install`). */


/** Blueprint templates — ready-made cron automations with typed slots
 * (mirrors `hermes mcp`-style catalog UX; the form is one field per slot). */


/** Skills Guard findings — caution asks once, dangerous demands explicit consent. */

