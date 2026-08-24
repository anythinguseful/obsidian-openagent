/**
 * Memory & Context section renderer.
 *
 * Moved verbatim out of `OpenAgentSettingTab` (src/settingsTab.ts L3745-4032)
 * in Phase 1 of the section-renderer extraction. Control order, copy, and
 * every setting path are unchanged; only `this.` became `ctx.`.
 *
 * This section was the pilot because it is the cleanest: it reads and writes
 * no class state at all, needs no file-local helper, and pulls just five
 * imports.
 */

import { Notice, Setting } from "obsidian";
import { catalogOf, withCurrentModel } from "../../agent/modelCatalog";
import { canonicalVaultPath } from "../../agent/workspacePolicy";
import { markModified } from "../../settingsModified";
import { createSliderInput } from "../../ui/settings-controls";
import type { SectionContext } from "./context";

export function memory(ctx: SectionContext, containerEl: HTMLElement): void {
	const s = ctx.plugin.settings;

	const stMemoryEnabled = new Setting(containerEl).setName("Enable long-term memory").addToggle((t) =>
		t.setValue(s.memoryEnabled).onChange(async (v) => {
			s.memoryEnabled = v;
			await ctx.plugin.saveSettings();
		})
	);
	markModified(stMemoryEnabled, ctx.plugin.settings, "memoryEnabled");

	const stMemoryFolder = new Setting(containerEl).setName("Memory folder").setDesc("Vault folder for MEMORY.md and USER.md.").addText((t) =>
		t.setValue(s.memoryFolder).onChange(async (v) => {
			try {
				s.memoryFolder = canonicalVaultPath(v.trim() || "openagent/openagent-memory", { label: "Memory folder" });
				await ctx.plugin.saveSettings();
			} catch (e) {
				t.setValue(s.memoryFolder);
				new Notice(`Open Agent: ${e instanceof Error ? e.message : String(e)}`);
			}
		})
	);
	markModified(stMemoryFolder, ctx.plugin.settings, "memoryFolder");

	const stUserProfileEnabled = new Setting(containerEl)
		.setName("User profile")
		.setDesc("Let the agent build a model of who you are (USER.md).")
		.addToggle((t) =>
			t.setValue(s.userProfileEnabled).onChange(async (v) => {
				s.userProfileEnabled = v;
				await ctx.plugin.saveSettings();
			})
		);
	markModified(stUserProfileEnabled, ctx.plugin.settings, "userProfileEnabled");

	const stMemoryCharLimit = new Setting(containerEl)
		.setName("Memory Budget")
		.setDesc("Size cap for MEMORY.md (500–20,000). When full, the agent must consolidate before adding more.")
		.addText((t) => {
			t.inputEl.type = "number";
			t.inputEl.min = "500";
			t.inputEl.max = "20000";
			t.inputEl.step = "500";
			t.setValue(String(s.memoryCharLimit)).onChange(async (v) => {
				const n = Math.floor(Number(v));
				if (!Number.isFinite(n)) return;
				s.memoryCharLimit = Math.min(20_000, Math.max(500, n));
				ctx.plugin.memoryStore.setLimits(s.memoryCharLimit, s.userCharLimit);
				await ctx.plugin.saveSettings();
			});
		});
	markModified(stMemoryCharLimit, ctx.plugin.settings, "memoryCharLimit");
	ctx.resetButton(stMemoryCharLimit, "memoryCharLimit");

	const stUserCharLimit = new Setting(containerEl)
		.setName("Profile Budget")
		.setDesc("Character budget for USER.md (500–20,000). Same consolidation behavior as the memory budget.")
		.addText((t) => {
			t.inputEl.type = "number";
			t.inputEl.min = "500";
			t.inputEl.max = "20000";
			t.inputEl.step = "500";
			t.setValue(String(s.userCharLimit)).onChange(async (v) => {
				const n = Math.floor(Number(v));
				if (!Number.isFinite(n)) return;
				s.userCharLimit = Math.min(20_000, Math.max(500, n));
				ctx.plugin.memoryStore.setLimits(s.memoryCharLimit, s.userCharLimit);
				await ctx.plugin.saveSettings();
			});
		});
	markModified(stUserCharLimit, ctx.plugin.settings, "userCharLimit");
	ctx.resetButton(stUserCharLimit, "userCharLimit");

	const stMemoryNudgeInterval = new Setting(containerEl)
		.setName("Memory nudge interval")
		.setDesc("Remind the agent to save what it learned — every N of your messages (0 disables).");
	stMemoryNudgeInterval.controlEl.appendChild(
		createSliderInput({
			ariaLabel: "Memory nudge interval",
			min: 0,
			max: 30,
			step: 1,
			value: s.memoryNudgeInterval,
			commit: (v) => {
				s.memoryNudgeInterval = v;
				void ctx.plugin.saveSettings();
			},
		}).el
	);
	markModified(stMemoryNudgeInterval, ctx.plugin.settings, "memoryNudgeInterval");
	ctx.resetButton(stMemoryNudgeInterval, "memoryNudgeInterval");

	/* Structured memory (v0.1.176, Hindsight-style engine — plugin-native,
	   no Docker/MCP/server): the agent distills conversations into typed
	   facts (world/experience) and recalls them per message via fusion
	   (BM25 + entity + temporal + trust). Facts live in
	   <memory folder>/.engine/facts.jsonl — MEMORY.md/USER.md stay the
	   human-readable core. */
	ctx.subheading(
		containerEl,
		"Structured memory",
		"Typed facts the agent extracts and recalls automatically, Hindsight-style."
	);

	const stMemoryEngineEnabled = new Setting(containerEl)
		.setName("Structured memory")
		.setDesc("Extract durable facts from conversations and recall them in later chats (stored under the memory folder).")
		.addToggle((t) =>
			t.setValue(s.memoryEngineEnabled).onChange(async (v) => {
				s.memoryEngineEnabled = v;
				await ctx.plugin.saveSettings();
			})
		);
	markModified(stMemoryEngineEnabled, ctx.plugin.settings, "memoryEngineEnabled");

	const stMemoryEngineRetainEveryN = new Setting(containerEl)
		.setName("Retain every N turns")
		.setDesc("How often the agent distills the conversation into facts (1 = every turn).");
	stMemoryEngineRetainEveryN.controlEl.appendChild(
		createSliderInput({
			ariaLabel: "Retain every N turns",
			min: 1,
			max: 10,
			step: 1,
			value: s.memoryEngineRetainEveryN,
			commit: (v) => {
				s.memoryEngineRetainEveryN = Math.min(10, Math.max(1, v));
				void ctx.plugin.saveSettings();
			},
		}).el
	);
	markModified(stMemoryEngineRetainEveryN, ctx.plugin.settings, "memoryEngineRetainEveryN");
	ctx.resetButton(stMemoryEngineRetainEveryN, "memoryEngineRetainEveryN");

	const stMemoryEngineRecallMax = new Setting(containerEl)
		.setName("Recall budget")
		.setDesc("Maximum facts recalled and injected per message.");
	stMemoryEngineRecallMax.controlEl.appendChild(
		createSliderInput({
			ariaLabel: "Recall budget",
			min: 3,
			max: 20,
			step: 1,
			value: s.memoryEngineRecallMax,
			commit: (v) => {
				s.memoryEngineRecallMax = Math.min(20, Math.max(3, v));
				void ctx.plugin.saveSettings();
			},
		}).el
	);
	markModified(stMemoryEngineRecallMax, ctx.plugin.settings, "memoryEngineRecallMax");
	ctx.resetButton(stMemoryEngineRecallMax, "memoryEngineRecallMax");

	const stMemoryEngineEmbedModel = new Setting(containerEl)
		.setName("Embedding model")
		.setDesc("Pick a model to enable semantic recall (finds memories whose wording differs) — off = keyword recall only.")
		.addDropdown((d) => {
			/* v0.1.179: a picker like the Model tab — the active provider's
			   catalog plus the current value (kept visible even off-catalog,
			   so a saved id is never silently dropped). */
			const activeProvider = s.providers.find((p) => p.id === s.activeProviderId);
			const catalog = withCurrentModel(catalogOf(activeProvider), s.memoryEngineEmbedModel);
			d.addOption("", "off (keyword recall only)");
			for (const m of catalog) {
				if (m) d.addOption(m, m);
			}
			d.selectEl.setAttribute("aria-label", "Embedding model");
			d.setValue(s.memoryEngineEmbedModel).onChange(async (v) => {
				s.memoryEngineEmbedModel = v;
				await ctx.plugin.saveSettings();
			});
		});
	markModified(stMemoryEngineEmbedModel, ctx.plugin.settings, "memoryEngineEmbedModel");

	/* Context (owner directive 2026-07-30, Hermes Desktop parity — official
	   groups context.* under "Memory & Context"): what gets injected into
	   every conversation. Rows moved here verbatim: "Context file" from
	   Chat (was Agent), "Attach active note by default" from General. */
	ctx.subheading(containerEl, "Context", "What gets injected into every conversation.");

	const stContextFile = new Setting(containerEl)
		.setName("Context file")
		.setDesc("Vault file injected into every conversation (like Hermes context files). Empty disables.")
		.addText((t) =>
			t
				.setPlaceholder("AGENTS.md")
				.setValue(s.contextFile)
				.onChange(async (v) => {
					s.contextFile = v.trim();
					await ctx.plugin.saveSettings();
				})
		);
	markModified(stContextFile, ctx.plugin.settings, "contextFile");
	ctx.resetButton(stContextFile, "contextFile");

	const stIncludeActiveNote = new Setting(containerEl)
		.setName("Attach active note by default")
		.setDesc("New chats start with the active-note context chip enabled.")
		.addToggle((t) =>
			t.setValue(s.includeActiveNote).onChange(async (v) => {
				s.includeActiveNote = v;
				await ctx.plugin.saveSettings();
			})
		);
	markModified(stIncludeActiveNote, ctx.plugin.settings, "includeActiveNote");

	/* Compression (v0.1.175, Hermes Desktop parity — official groups
	   compression.* under "Memory & Context"): the four knobs desktop
	   exposes. Three already lived in settings but had no UI; target_ratio
	   is new (token-sized verbatim tail, complementing the message floor).

	   2026-08-24: the Model tab carried a second, older copy of three of
	   these rows plus "Context window" (a duplicate dating to v0.1.17, noted
	   in Lesson 172). That block is gone; "Context window" moved here as the
	   first row because the threshold below is a percentage OF it — owner
	   decision, a deliberate deviation from Hermes, which keeps
	   model_context_length in its Model section.

	   Labels follow Hermes FIELD_LABELS (apps/desktop/src/app/settings/
	   constants.ts, verified 2026-08-24) but re-cased: Obsidian's plugin
	   guidelines mandate sentence case, Hermes uses Title Case. */
	ctx.subheading(
		containerEl,
		"Compression",
		"What happens when a long conversation nears the context limit."
	);

	const stContextWindow = new Setting(containerEl)
		.setName("Context window")
		.setDesc("Tokens the model can see at once. 0 = auto-detect (falls back to 256000).")
		.addText((t) => {
			t.setPlaceholder("0 = auto")
				.setValue(s.modelContextLength > 0 ? String(s.modelContextLength) : "")
				.onChange(async (v) => {
					s.modelContextLength = Math.max(0, Math.floor(Number(v.trim()) || 0));
					await ctx.plugin.saveSettings();
				});
			t.inputEl.setAttribute("aria-label", "Context window");
		});
	markModified(stContextWindow, ctx.plugin.settings, "modelContextLength");
	ctx.resetButton(stContextWindow, "modelContextLength");

	const stCompressionEnabled = new Setting(containerEl)
		.setName("Auto-compression")
		.setDesc("Summarize older context when conversations get large.")
		.addToggle((t) =>
			t.setValue(s.compressionEnabled).onChange(async (v) => {
				s.compressionEnabled = v;
				await ctx.plugin.saveSettings();
			})
		);
	markModified(stCompressionEnabled, ctx.plugin.settings, "compressionEnabled");

	const stCompressionThreshold = new Setting(containerEl)
		.setName("Compression threshold")
		.setDesc("Start compacting once the conversation fills this share of the context window.");
	stCompressionThreshold.controlEl.appendChild(
		createSliderInput({
			ariaLabel: "Compression threshold",
			min: 10,
			max: 99,
			step: 1,
			value: Math.round(s.compressionThreshold * 100),
			format: (v) => `${v}%`,
			unit: "%",
			commit: (v) => {
				s.compressionThreshold = Math.min(0.99, Math.max(0.1, v / 100));
				void ctx.plugin.saveSettings();
			},
		}).el
	);
	markModified(stCompressionThreshold, ctx.plugin.settings, "compressionThreshold");
	ctx.resetButton(stCompressionThreshold, "compressionThreshold");

	const stCompressionTargetRatio = new Setting(containerEl)
		.setName("Compression target")
		.setDesc("Keep this share of the most recent messages untouched when compressing.");
	stCompressionTargetRatio.controlEl.appendChild(
		createSliderInput({
			ariaLabel: "Compression target",
			min: 5,
			max: 50,
			step: 1,
			value: Math.round(s.compressionTargetRatio * 100),
			format: (v) => `${v}%`,
			unit: "%",
			commit: (v) => {
				s.compressionTargetRatio = Math.min(0.5, Math.max(0.05, v / 100));
				void ctx.plugin.saveSettings();
			},
		}).el
	);
	markModified(stCompressionTargetRatio, ctx.plugin.settings, "compressionTargetRatio");
	ctx.resetButton(stCompressionTargetRatio, "compressionTargetRatio");

	const stCompressionProtectLastN = new Setting(containerEl)
		.setName("Protected recent messages")
		.setDesc("Minimum recent messages never folded into the summary.");
	stCompressionProtectLastN.controlEl.appendChild(
		createSliderInput({
			ariaLabel: "Protected recent messages",
			min: 0,
			max: 24,
			step: 1,
			value: s.compressionProtectLastN,
			commit: (v) => {
				s.compressionProtectLastN = Math.min(24, Math.max(0, v));
				void ctx.plugin.saveSettings();
			},
		}).el
	);
	markModified(stCompressionProtectLastN, ctx.plugin.settings, "compressionProtectLastN");
	ctx.resetButton(stCompressionProtectLastN, "compressionProtectLastN");
}
