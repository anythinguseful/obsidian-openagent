/**
 * Settings-harness entry — mounts the REAL OpenAgentSettingTab (src/settingsTab.ts)
 * inside the real-preview shell with a canned, fully populated plugin. Same
 * honesty contract as chat-entry.tsx: the DOM is identical-by-build to what
 * Obsidian renders; only vault/network edges are faked.
 *
 * Section selected via <meta name="oa-sec" content="…"> injected into the
 * shell (setContent cannot carry query strings).
 *
 * Audit scaffolding — 2026-07-22. Test-only: production main.js never
 * bundles this.
 */

import { App } from "obsidian";
import { OpenAgentSettingTab } from "../../src/settingsTab";
import { DEFAULT_SETTINGS, makeDefaultProfile, OpenAgentSettings } from "../../src/settings";
import { newCronTask } from "../../src/agent/cron";
import type OpenAgentPlugin from "../../src/main";

const MODEL = "gemma-4-e4b-uncensored-hauway-qat-4b";

/* ----------------------- canned, populated settings ----------------------- */

function makeSettings(): OpenAgentSettings {
	const daily = newCronTask({
		name: "Daily vault digest",
		prompt: "Summarize notes modified today and append a digest.",
		expr: "0 9 * * *",
		targetNote: "openagent/Reports.md",
		skills: ["vault-digest"],
		maxRuns: null,
		chainContext: true,
		notify: true,
	});
	Object.assign(daily, {
		runCount: 12,
		lastRun: Date.now() - 26 * 3600 * 1000,
		lastStatus: "ok",
		nextRun: Date.now() + 8 * 3600 * 1000,
	});
	const weekly = newCronTask({
		name: "Monday review",
		prompt: "Draft the weekly review from last week's digests.",
		expr: "0 8 * * 1",
		targetNote: "openagent/Reviews.md",
		skills: [],
		maxRuns: 4,
		chainContext: false,
		notify: false,
	});
	Object.assign(weekly, {
		enabled: false,
		runCount: 2,
		lastRun: Date.now() - 9 * 86400 * 1000,
		lastStatus: "error",
		lastError: "fetch failed: connect ECONNREFUSED 127.0.0.1:1234",
	});

	const research = {
		...makeDefaultProfile("concise"),
		id: "research",
		name: "Research",
		soul: "# Research\nYou are a meticulous research assistant: cite note titles, prefer tables, never speculate.",
		personality: "concise",
		providerId: "openrouter",
		model: "meta-llama/llama-3.3-70b-instruct",
		color: "purple",
	};

	return {
		...DEFAULT_SETTINGS,
		/* Providers-IA witness: LM Studio is the global default/editor fallback,
		   Research routes chat through OpenRouter, Ollama is configured but idle,
		   and OpenAI still needs setup. The four states must stay distinguishable. */
		providers: [
			{
				id: "lmstudio",
				name: "LM Studio (local)",
				baseUrl: "http://localhost:1234/v1",
				apiKey: "",
				enabled: true,
				customHeaders: {},
				models: [MODEL, "qwen3-30b-a3b-instruct-2507"],
			},
			{
				id: "openrouter",
				name: "OpenRouter",
				baseUrl: "https://openrouter.ai/api/v1",
				apiKey: "sk-or-v1-4f8c2e9d7a1b4655c0d3f2a1b9e8d7c6",
				enabled: true,
				customHeaders: {},
				models: ["meta-llama/llama-3.3-70b-instruct"],
			},
			{
				id: "ollama",
				name: "Ollama (local)",
				baseUrl: "http://localhost:11434/v1",
				apiKey: "",
				enabled: true,
				customHeaders: {},
				models: [],
			},
			{
				id: "openai",
				name: "OpenAI",
				baseUrl: "https://api.openai.com/v1",
				apiKey: "",
				enabled: true,
				customHeaders: {},
				models: [],
			},
		],
		activeProviderId: "lmstudio",
		model: MODEL,
      /* v0.1.94 search/dot audit subject: one value away from
         DEFAULT_SETTINGS so the modified-dot probe has something to find
         — every other row stays pristine. v0.1.127: subjeknya DIPINDAH ke
         showTimestamps (default = false) karena enterToSend kini default
         false — row Enter-send JADI pengukur merges-from-DEFAULTS yang
         benar-benar pristine (probe dot = F19/F20). 2026-08-30: barisnya
         pindah ke tab Appearance; probe dot F20 kini membuka halaman
         appearance. */
      showTimestamps: true,
		fallbackProviders: [
			{ providerId: "lmstudio", model: "qwen3-30b-a3b-instruct-2507" },
			{ providerId: "openrouter", model: "meta-llama/llama-3.3-70b-instruct" },
		],
		profiles: [{ ...makeDefaultProfile("none"), id: "default", name: "Default" }, research as OpenAgentSettings["profiles"][number]],
		activeProfileId: "research",
		promptSnippets: [
			{ id: "snip-1", title: "Summarize active note", text: "Summarize my active note and save the summary" },
			{ id: "snip-2", title: "Weekly review starter", text: "Draft my weekly review from notes changed this week" },
		],
		mcpServers: {
			filesystem: {
				command: "npx",
				args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/docs"],
				enabled: true,
			},
			"remote-hub": {
				transport: "http",
				url: "https://mcp.example.com/sse",
				headers: { Authorization: "Bearer redacted" },
				enabled: false,
			},
		},
		cronTasks: [daily, weekly],
		debugMode: true,
		customSystemPrompt: "Always answer in Indonesian; cite note titles when you reference them.",
		hubTaps: ["mycorp/team-skills"],
	};
}

/* ------------------------------- canned hub ------------------------------- */

const HUB_CATALOG: Record<string, { name: string; dir: string; description?: string }[]> = {
	/* bundled default tap — mirrors kepano/obsidian-skills @ main (verified
	   2026-07-23; names/dirs/descriptions condensed from the real SKILL.md
	   frontmatter) */
	"kepano/obsidian-skills/skills": [
		{ name: "defuddle", dir: "skills/defuddle", description: "Extract clean markdown content from web pages using Defuddle CLI." },
		{ name: "json-canvas", dir: "skills/json-canvas", description: "Create and edit JSON Canvas files (.canvas) with nodes, edges, and groups." },
		{ name: "obsidian-bases", dir: "skills/obsidian-bases", description: "Create and edit Obsidian Bases (.base files) with views, filters, and formulas." },
		{ name: "obsidian-cli", dir: "skills/obsidian-cli", description: "Interact with Obsidian vaults using the Obsidian CLI." },
		{ name: "obsidian-markdown", dir: "skills/obsidian-markdown", description: "Create and edit Obsidian Flavored Markdown — wikilinks, embeds, callouts, properties." },
	],
	/* community tap (custom, added via "Add GitHub tap") — its chip carries the
	   remove (×) control; needed to regression-check the app button reset */
	"mycorp/team-skills": [{ name: "release-checklist", dir: "skills/release-checklist", description: "Ship-prep checklist." }],
	/* target repo for the F10 probe: typed into the hub search box and added
	   via Enter — also proves a just-added tap loads immediately */
	"newowner/new-skills": [{ name: "team-onboarding", dir: "skills/team-onboarding", description: "Onboard a new teammate." }],
};

const SKILLS = [
	{
		name: "vault-digest",
		description: "Compose periodic vault digests into a note.",
		whenToUse: "weekly or daily digest requests",
		instructions: "1. Collect notes modified in the window.\n2. Group by folder.\n3. Append to the target note.",
		path: "openagent/openagent-skills/vault-digest/SKILL.md",
		enabled: true,
	},
	{
		name: "hermes-review",
		description: "Structured code review with severity tags.",
		whenToUse: "reviewing a diff",
		instructions: "Severity-tagged findings, then a summary.",
		path: "openagent/openagent-skills/hermes-review/SKILL.md",
		enabled: false,
	},
];

/* ------------------------------- fake plugin ------------------------------ */

function makePlugin(settings: OpenAgentSettings): Record<string, unknown> {
	return {
		manifest: {
			name: "Open Agent",
			version: "0.1.158",
			minAppVersion: "1.5.0",
			description:
				"A self-improving AI agent for your vault. Agent framework modeled after Hermes Agent, settings after Hermes Desktop, and a chat UI built with prompt-kit components.",
		},
		settings,
		saveSettings: async (): Promise<void> => {
			const state = globalThis as typeof globalThis & { __oaSettingsSaveCalls?: number };
			state.__oaSettingsSaveCalls = (state.__oaSettingsSaveCalls ?? 0) + 1;
		},
		saveSettingsSafe: (): void => {
			const state = globalThis as typeof globalThis & { __oaSettingsSaveCalls?: number };
			state.__oaSettingsSaveCalls = (state.__oaSettingsSaveCalls ?? 0) + 1;
		},
		refreshViews: (): void => {},
		installMcpCatalogEntry: async (_name: string, _env: Record<string, string>): Promise<{ ok: boolean; postInstall?: string; error?: string }> => {
			const state = globalThis as typeof globalThis & { __oaMcpCatalogInstalls?: number; __oaMcpCatalogFail?: boolean };
			state.__oaMcpCatalogInstalls = (state.__oaMcpCatalogInstalls ?? 0) + 1;
			return state.__oaMcpCatalogFail ? { ok: false, error: "simulated install failure" } : { ok: true, postInstall: "Simulated install complete." };
		},
		applyProfile: async (_id: string): Promise<void> => {},
		runCronTask: async (_id: string, _manual?: boolean): Promise<void> => {},
		isCronRunning: (_id: string): boolean => false,
		getNativeNotificationStatus: () => ({ supported: true, reason: "ready", permission: "default" }),
		testNativeNotification: async (): Promise<"sent"> => {
			const state = globalThis as typeof globalThis & { __oaNotificationTestCalls?: number };
			state.__oaNotificationTestCalls = (state.__oaNotificationTestCalls ?? 0) + 1;
			return "sent";
		},
		isCompletionSoundSupported: (): boolean => true,
		previewCompletionSound: async (variant: number): Promise<"played"> => {
			const state = globalThis as typeof globalThis & { __oaSoundPreviewCalls?: number; __oaSoundPreviewVariant?: number };
			state.__oaSoundPreviewCalls = (state.__oaSoundPreviewCalls ?? 0) + 1;
			state.__oaSoundPreviewVariant = variant;
			return "played";
		},
		resetSettingsToDefaults: async (): Promise<void> => {},
		resetEverything: async (): Promise<string[]> => ["openagent/openagent-memory"],
		agentDataFolders: (): string[] => [
			"openagent/openagent-memory",
			"openagent/openagent-skills",
			"openagent/openagent-sessions",
			"openagent/cron",
		],
		writeExportFile: async (_name: string, _text: string): Promise<string> =>
			"openagent/exports/openagent-settings-2026-07-22-16-30.json",
		importSettingsFromText: async (_text: string): Promise<{ ok: boolean; error?: string }> => ({ ok: true }),
		importProfileFromText: async (
			_text: string
		): Promise<{ ok: boolean; name?: string; skills?: number; error?: string }> => ({ ok: true, name: "Research" }),
		profileStore: {
			update: async (): Promise<void> => {},
			create: async (name?: string): Promise<{ id: string; name: string }> => ({ id: "new-profile", name: name || "Profile" }),
			duplicate: async (): Promise<{ id: string; name: string }> => ({ id: "research-copy", name: "Research (copy)" }),
			remove: async (): Promise<{ ok: boolean; reason?: string }> => ({ ok: true }),
		},
		skillsStore: {
			loadSkills: async (): Promise<typeof SKILLS> => SKILLS,
			setFolder: (_f: string): void => {},
			setSkillEnabled: async (): Promise<void> => {},
			deleteSkill: async (): Promise<void> => {},
		},
		memoryStore: { setFolder: (_f: string): void => {} },
		sessionStore: { setMaxSessions: (_n: number): void => {} },
		hubClient: {
			loadTap: async (tap: { repo: string }): Promise<{ skills: { name: string; dir: string; description?: string }[]; fetchedAt: number }> => ({
				skills: HUB_CATALOG[tap.repo] ?? [],
				fetchedAt: Date.now(),
			}),
			readLock: async (): Promise<Record<string, unknown>> => ({}),
			fetchDescription: async (): Promise<void> => {},
			preview: async (): Promise<{ skillMd: string; files: string[] }> => ({ skillMd: "", files: [] }),
			scan: async (): Promise<{ verdict: string; findings: unknown[] }> => ({ verdict: "safe", findings: [] }),
			install: async (): Promise<{ slug: string; fileCount: number }> => ({ slug: "pdf-forms", fileCount: 3 }),
			uninstall: async (): Promise<string> => "pdf-forms",
			checkUpdates: async (): Promise<unknown[]> => [],
			update: async (): Promise<null> => null,
		},
	};
}

/* --------------------------------- mount ---------------------------------- */

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("settings-entry: #root missing");

const sec = document.querySelector('meta[name="oa-sec"]')?.getAttribute("content") || "general";
const settings = makeSettings();
const plugin = makePlugin(settings);
const app = new App();

const tab = new OpenAgentSettingTab(app, plugin as unknown as OpenAgentPlugin);
rootEl.appendChild(tab.containerEl);
tab.showSection(sec);
if (sec === "capabilities") {
	/* hub taps only resolve when the Browse Hub section lazily loads them —
	   force it so the audit frame shows settled chips, not skeletons */
	(tab as unknown as { hubEnsureLoaded?: (force: boolean) => void }).hubEnsureLoaded?.(true);
}

(window as unknown as { __oaSettings: OpenAgentSettings }).__oaSettings = settings;
(window as unknown as { __oaPlugin: unknown }).__oaPlugin = plugin;
/* v0.1.187: expose the live tab so probes can re-render after mutating a
   setting (the reset button + modified-dot only appear on the next display()). */
(window as unknown as { __oaTab: OpenAgentSettingTab }).__oaTab = tab;

window.setTimeout(() => {
	(window as unknown as { __oaReady: boolean }).__oaReady = true;
}, 350);
