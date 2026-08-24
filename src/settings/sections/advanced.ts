/**
 * Advanced section renderer.
 *
 * Moved verbatim out of `OpenAgentSettingTab` (src/settingsTab.ts L3380-3483)
 * in Phase 5 of the section-renderer extraction. Control order, copy and every
 * settings path are unchanged; only `this.` became `ctx.`, verified by
 * byte-exact roundtrip rather than by re-reading.
 *
 * The iteration cap (= Hermes `agent.max_turns`) lives here rather than in Chat
 * (v0.1.151), alongside the tool-output limit and checkpoint pruning: the knobs
 * that bound how much work and how much text a single turn may produce.
 */

import { Setting } from "obsidian";
import { createSliderInput } from "../../ui/settings-controls";
import { markModified } from "../../settingsModified";
import { stackedTextArea } from "./helpers";
import type { SectionContext } from "./context";

export function advanced(ctx: SectionContext, containerEl: HTMLElement): void {
	const s = ctx.plugin.settings;

	/* v0.1.181: group labels — Limits, then System prompt. */
	ctx.subheading(containerEl, "Limits", "Caps that keep runs bounded and reversible.");
	/* v0.1.151: "Max tool iterations" moved from Chat (Hermes agent.max_turns
	   lives in Advanced) — block verbatim, same slider + markModified. */
	const stMaxIterations = new Setting(containerEl)
		.setName("Max tool iterations")
		.setDesc("Safety cap on tool-call rounds per user message.");
	stMaxIterations.controlEl.appendChild(
		createSliderInput({
			ariaLabel: "Max tool iterations",
			min: 1,
			max: 40,
			step: 1,
			value: s.maxIterations,
			commit: (v) => {
				s.maxIterations = v;
				void ctx.plugin.saveSettings();
			},
		}).el
	);
	markModified(stMaxIterations, ctx.plugin.settings, "maxIterations");
	ctx.resetButton(stMaxIterations, "maxIterations");

	const stToolOutputLimit = new Setting(containerEl)
		.setName("Tool output limit")
		.setDesc("Characters rendered inside a tool-call card before it is sliced for display (the full result stays in history).")
		.addText((t) => {
			t.inputEl.type = "number";
			t.inputEl.min = "1000";
			t.inputEl.max = "50000";
			t.inputEl.step = "1000";
			t.setValue(String(s.toolOutputMaxChars)).onChange(async (v) => {
				const n = Math.floor(Number(v));
				if (!Number.isFinite(n)) return;
				s.toolOutputMaxChars = Math.min(50_000, Math.max(1_000, n));
				await ctx.plugin.saveSettings();
				ctx.plugin.refreshViews();
			});
		});
	markModified(stToolOutputLimit, ctx.plugin.settings, "toolOutputMaxChars");
	ctx.resetButton(stToolOutputLimit, "toolOutputMaxChars");

	const stCheckpointMax = new Setting(containerEl)
		.setName("Checkpoint snapshots kept")
		.setDesc("Rollback snapshots in openagent/checkpoints/ are pruned to the newest N per note. Off disables pruning, not snapshots.")
		.addText((t) => {
			t.inputEl.type = "number";
			t.inputEl.min = "5";
			t.inputEl.max = "200";
			t.inputEl.step = "5";
			t.setValue(String(s.checkpointMaxSnapshots)).onChange(async (v) => {
				const n = Math.floor(Number(v));
				if (!Number.isFinite(n)) return;
				s.checkpointMaxSnapshots = Math.min(200, Math.max(5, n));
				ctx.plugin.saveSettingsSafe();
			});
		});
	markModified(stCheckpointMax, ctx.plugin.settings, "checkpointMaxSnapshots");
	ctx.resetButton(stCheckpointMax, "checkpointMaxSnapshots");

	ctx.subheading(containerEl, "System prompt", "Operator-level instructions appended to every conversation.");
	const spSetting = new Setting(containerEl)
		.setName("Custom system prompt")
		.setDesc("Extra instructions appended to every conversation's system prompt.");
	stackedTextArea(
		spSetting,
		{
			rows: 6,
			value: s.customSystemPrompt,
			placeholder: "e.g. Always answer in Indonesian; cite note titles when you reference them.",
			ariaLabel: "Custom system prompt",
		},
		async (v) => {
			s.customSystemPrompt = v;
			ctx.plugin.saveSettingsSafe();
		}
	);

	const stRequestTimeout = new Setting(containerEl)
		.setName("Request timeout (ms)")
		.setDesc("Applied to every provider request, chat and model-listing alike.")
		.addText((t) =>
			t.setValue(String(s.requestTimeoutMs)).onChange(async (v) => {
				s.requestTimeoutMs = Math.max(5000, parseInt(v) || 120000);
				ctx.plugin.saveSettingsSafe();
			})
		);
	markModified(stRequestTimeout, ctx.plugin.settings, "requestTimeoutMs");
	ctx.resetButton(stRequestTimeout, "requestTimeoutMs");

	const stDebugMode = new Setting(containerEl)
		.setName("Debug mode")
		.setDesc("Log requests and responses to the developer console.")
		.addToggle((t) =>
			t.setValue(s.debugMode).onChange(async (v) => {
				s.debugMode = v;
				ctx.plugin.saveSettingsSafe();
			})
		);
	markModified(stDebugMode, ctx.plugin.settings, "debugMode");
}
