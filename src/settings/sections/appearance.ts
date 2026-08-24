/**
 * Appearance section renderer.
 *
 * Moved verbatim out of `OpenAgentSettingTab` (src/settingsTab.ts L1663-1736)
 * in Phase 5 of the section-renderer extraction. Control order, copy and every
 * settings path are unchanged; only `this.` became `ctx.`, verified by
 * byte-exact roundtrip rather than by re-reading.
 *
 * Every control here styles the plugin's own chat surface. Obsidian's theme is
 * never touched (v0.1.150) -- that boundary is the reason this section exists
 * separately from the user's appearance settings.
 */

import { Setting } from "obsidian";
import { markModified } from "../../settingsModified";
import type { OpenAgentSettings } from "../../settings";
import type { SectionContext } from "./context";

export function appearance(ctx: SectionContext, containerEl: HTMLElement): void {
	const s = ctx.plugin.settings;

	/* v0.1.181: group label for the chat-surface rows. */
	ctx.subheading(containerEl, "Chat surface", "How the chat panel looks and behaves.");
	const stToolView = new Setting(containerEl)
		.setName("Tool calls")
		.setDesc("How tool-call cards render in chat. Hidden still keeps source lists.")
		.addDropdown((d) =>
			d
				.addOption("collapsed", "Collapsed (headers only)")
				.addOption("expanded", "Expanded (open by default)")
				.addOption("hidden", "Hidden")
				.setValue(s.toolViewMode)
				.onChange(async (v) => {
					s.toolViewMode = v as OpenAgentSettings["toolViewMode"];
					ctx.plugin.saveSettingsSafe();
					ctx.plugin.refreshViews();
				})
		);
	markModified(stToolView, ctx.plugin.settings, "toolViewMode");

	const stReasoning = new Setting(containerEl)
		.setName("Reasoning")
		.setDesc("Collapse thinking blocks by default.")
		.addToggle((t) =>
			t.setValue(s.reasoningCollapsedByDefault).onChange(async (v) => {
				s.reasoningCollapsedByDefault = v;
				ctx.plugin.saveSettingsSafe();
				ctx.plugin.refreshViews();
			})
		);
	markModified(stReasoning, ctx.plugin.settings, "reasoningCollapsedByDefault");

	const stDensity = new Setting(containerEl)
		.setName("Session list density")
		.setDesc("Row spacing in the conversations panel.")
		.addDropdown((d) =>
			d
				.addOption("comfortable", "Comfortable")
				.addOption("compact", "Compact")
				.setValue(s.sessionListDensity)
				.onChange(async (v) => {
					s.sessionListDensity = v as OpenAgentSettings["sessionListDensity"];
					ctx.plugin.saveSettingsSafe();
					ctx.plugin.refreshViews();
				})
		);
	markModified(stDensity, ctx.plugin.settings, "sessionListDensity");

	const stIntro = new Setting(containerEl)
		.setName("Intro screen")
		.setDesc("Show the welcome wordmark when a chat is empty.")
		.addToggle((t) =>
			t.setValue(s.showIntroScreen).onChange(async (v) => {
				s.showIntroScreen = v;
				ctx.plugin.saveSettingsSafe();
				ctx.plugin.refreshViews();
			})
		);
	markModified(stIntro, ctx.plugin.settings, "showIntroScreen");

	const stReactions = new Setting(containerEl)
		.setName("Reaction buttons")
		.setDesc("Show the helpful / not-helpful buttons under assistant answers.")
		.addToggle((t) =>
			t.setValue(s.showReactions).onChange(async (v) => {
				s.showReactions = v;
				ctx.plugin.saveSettingsSafe();
				ctx.plugin.refreshViews();
			})
		);
	markModified(stReactions, ctx.plugin.settings, "showReactions");
}
