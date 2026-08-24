/**
 * General settings section.
 *
 * Extracted from `OpenAgentSettingTab.general` (Phase 3 of
 * docs/plans/settings-section-renderers-2026-08-24.md). Chat behaviour rows
 * first, then the two named groups introduced in v0.1.50: "Backup & Restore"
 * for the safe moves, "Danger Zone" for the escape hatches behind a hazard
 * tint. The heading order is load-bearing and pinned by smoke.
 *
 * Both destructive actions go through `ctx.display()` rather than re-rendering
 * locally, so scroll position and the active section survive the reset.
 */

import { Notice, Setting } from "obsidian";

import { buildSettingsExport } from "../../settings";
import { markModified } from "../../settingsModified";
import { ConfirmResetModal, ExportFileSuggestModal, JsonImportModal } from "../modals/json-import";
import type { SectionContext } from "./context";
import { copyText, exportStamp } from "./helpers";

export function general(ctx: SectionContext, containerEl: HTMLElement): void {
	const s = ctx.plugin.settings;

	const stEnterToSend = new Setting(containerEl)
		.setName("Enter sends message")
		.setDesc(
			"Default (off): Shift+Enter sends, Enter inserts a newline. On: Enter sends, Shift+Enter inserts a newline. Ctrl/Cmd+Enter always sends."
		)
		.addToggle((t) =>
			t.setValue(s.enterToSend).onChange(async (v) => {
				s.enterToSend = v;
				await ctx.plugin.saveSettings();
				ctx.plugin.refreshViews();
			})
		);
	markModified(stEnterToSend, ctx.plugin.settings, "enterToSend");

	const stShowTimestamps = new Setting(containerEl).setName("Show message timestamps").addToggle((t) =>
		t.setValue(s.showTimestamps).onChange(async (v) => {
			s.showTimestamps = v;
			await ctx.plugin.saveSettings();
			ctx.plugin.refreshViews();
		})
	);
	markModified(stShowTimestamps, ctx.plugin.settings, "showTimestamps");

	const stChatLeafLocation = new Setting(containerEl)
		.setName("Chat panel location")
		.setDesc("Where the chat panel opens. Changing this moves an open panel there right away.")
		.addDropdown((d) =>
			d
				.addOption("left", "Left sidebar")
				.addOption("main", "Main workspace (tab)")
				.addOption("right", "Right sidebar")
				.setValue(s.chatLeafLocation)
				.onChange(async (v) => {
					s.chatLeafLocation = v === "left" || v === "main" ? v : "right";
					await ctx.plugin.saveSettings();
					/* v0.1.163: relocate an already-open chat immediately —
					   no ribbon click needed. */
					await ctx.plugin.moveChatViewToConfiguredLocation();
				})
		);
	markModified(stChatLeafLocation, ctx.plugin.settings, "chatLeafLocation");

	/* ---------- backup & restore + danger zone (docs/plans/data-portability-plan.md) ----------
	   v0.1.50 (owner directive 2026-08-02): the former combined data block
	   splits into two named groups — the safe moves first, the escape
	   hatches separated under a hazard-tinted heading. */
	ctx.subheading(
		containerEl,
		"Backup & Restore",
		"Back up or move your whole configuration — export a snapshot, import one back (validated and migrated)."
	);

	/* ephemeral by design — never persisted, so a keys-included export can't
	   surprise you weeks later (back to redacted every time this tab opens) */
	let includeKeys = false;
	const resultEl = containerEl.createDiv({ cls: "oa-data-result" });

	new Setting(containerEl)
		.setName("Include API keys in exports")
		.setDesc(
			"Off: keys and auth headers are stripped — safe to share. On: full private backup. Resets to Off each time you open this tab."
		)
		.addToggle((t) =>
			t.setValue(false).onChange((v) => {
				includeKeys = v;
			})
		);

	new Setting(containerEl)
		.setName("Export settings")
		.setDesc("JSON snapshot of all settings — providers, profiles, snippets, automations. Cache excluded.")
		.addButton((b) =>
			b.setButtonText("Save to vault").onClick(async () => {
				const doc = buildSettingsExport(ctx.plugin.settings, includeKeys, ctx.plugin.manifest.version);
				const path = await ctx.plugin.writeExportFile(
					`openagent-settings-${exportStamp()}.json`,
					JSON.stringify(doc, null, 2)
				);
				resultEl.setText(`Saved → ${path}${includeKeys ? "" : " (keys redacted)"}`);
				new Notice(`Open Agent: settings exported → ${path}`);
			})
		)
		.addButton((b) =>
			b.setButtonText("Copy").onClick(async () => {
				const doc = buildSettingsExport(ctx.plugin.settings, includeKeys, ctx.plugin.manifest.version);
				await copyText(JSON.stringify(doc, null, 2));
				resultEl.setText(includeKeys ? "Settings JSON copied (keys included)." : "Settings JSON copied (keys redacted).");
			})
		);

	new Setting(containerEl)
		.setName("Import settings")
		.setDesc("Replace all settings with a validated export — nothing is written on failure.")
		.addButton((b) =>
			b.setButtonText("Paste JSON…").onClick(() => {
				new JsonImportModal(ctx.app, {
					title: "Import settings",
					placeholder: '{"openagentExport": "settings", …}',
					confirmLabel: "Import settings",
					onSubmit: async (text) => {
						const res = await ctx.plugin.importSettingsFromText(text);
						if (!res.ok) return res.error ?? "Import failed.";
						ctx.display();
						return null;
					},
				}).open();
			})
		)
		.addButton((b) =>
			b.setButtonText("From vault file…").onClick(() => {
				new ExportFileSuggestModal(ctx.app, async (file) => {
					const res = await ctx.plugin.importSettingsFromText(await ctx.app.vault.read(file));
					if (!res.ok) new Notice(`Open Agent import failed: ${res.error}`);
					else ctx.display();
				}).open();
			})
		);

	ctx.subheading(
		containerEl,
		"Danger Zone",
		"Escape hatches when things go wrong — destructive paths, each behind a confirmation dialog."
	).addClass("oa-danger-zone");

	new Setting(containerEl)
		.setName("Reset settings")
		.setDesc("All settings back to defaults — providers & keys, profiles, snippets, automations. Agent data (memory, skills, sessions) stays.")
		.addButton((b) =>
			b
				.setWarning()
				.setButtonText("Reset settings")
				.onClick(() => {
					new ConfirmResetModal(
						ctx.app,
						{
							title: "Reset settings?",
							lines: [
								"Providers & API keys — cleared",
								"Profiles (names, souls, pins) — back to a single Default",
								"Model, snippets, automations, all toggles — defaults",
								"Keeps: memory / skills / sessions folders on disk",
								"Tip: export your settings first (above).",
							],
							confirmLabel: "Reset settings",
						},
						async () => {
							await ctx.plugin.resetSettingsToDefaults();
							ctx.display();
						}
					).open();
				})
		);

	new Setting(containerEl)
		.setName("Reset everything")
		.setDesc("Also moves ALL agent-data folders to the SYSTEM TRASH (recoverable via the OS — nothing is permanently deleted).")
		.addButton((b) =>
			b
				.setWarning()
				.setButtonText("Reset everything")
				.onClick(() => {
					new ConfirmResetModal(
						ctx.app,
						{
							title: "Reset everything?",
							lines: [
								"These folders are moved to the system trash:",
								...ctx.plugin.agentDataFolders().map((f) => `· ${f}`),
								"Restore from the OS trash anytime; settings are reset to defaults as well.",
							],
							requireText: "RESET",
							confirmLabel: "Reset everything",
						},
						async () => {
							const moved = await ctx.plugin.resetEverything();
							new Notice(
								moved.length
									? `Open Agent: reset complete — ${moved.length} folder${moved.length === 1 ? "" : "s"} moved to trash.`
									: "Open Agent: reset complete — settings back to defaults."
							);
							ctx.display();
						}
					).open();
				})
		);
}
