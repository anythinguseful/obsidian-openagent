/**
 * Safety section renderer.
 *
 * Moved verbatim out of `OpenAgentSettingTab` (src/settingsTab.ts L613-681) in
 * Phase 5 of the section-renderer extraction. Control order, copy and every
 * settings path are unchanged; only `this.` became `ctx.`, verified by
 * byte-exact roundtrip rather than by re-reading.
 *
 * This is the tab that owns approval mode -- the single control standing
 * between the agent and an unreviewed write. The segmented rail is rendered by
 * the shared `createSegmented` helper so this section cannot drift into its own
 * bespoke widget.
 */

import { Setting } from "obsidian";
import { createSegmented } from "../../ui/settings-controls";
import { markModified } from "../../settingsModified";
import type { ApprovalMode } from "../../settings";
import type { SectionContext } from "./context";

export function safety(ctx: SectionContext, containerEl: HTMLElement): void {
	const s = ctx.plugin.settings;
	/* v0.1.181: group labels — Approvals up top, Guardrails below. */
	ctx.subheading(containerEl, "Approvals", "When the agent must ask before acting.");
	/* dipindah verbatim dari agent() (v0.1.126) — Hermes safety ⊇
	   approvals.mode ≡ Approval mode kita (segmented lobe.antd v0.1.108) */
	const stApprovalMode = new Setting(containerEl)
		.setName("Approval mode")
		.setDesc("Manual: approve everything · Cautious: risky actions ask · YOLO: never ask.");
	stApprovalMode.controlEl.appendChild(
		createSegmented({
			ariaLabel: "Approval mode",
			options: [
				{ value: "manual", label: "Manual", title: "Approve every tool call" },
				{ value: "cautious", label: "Cautious", title: "Persistent, destructive, and scheduling actions ask" },
				{ value: "yolo", label: "YOLO", title: "Never ask (Hermes --yolo)" },
			],
			value: s.approvalMode,
			onPick: (v) => {
				s.approvalMode = v as ApprovalMode;
				ctx.plugin.saveSettingsSafe();
			},
		}).el
	);
	markModified(stApprovalMode, ctx.plugin.settings, "approvalMode");

	/* v0.1.147 (Hermes approvals.timeout): auto-deny a missed approval. */
	const stApprovalTimeout = new Setting(containerEl)
		.setName("Approval timeout")
		.setDesc("Auto-deny an unanswered approval prompt after this many seconds. 0 = wait forever.")
		.addText((t) => {
			t.inputEl.type = "number";
			t.inputEl.min = "0";
			t.inputEl.max = "600";
			t.inputEl.step = "10";
			t.setValue(String(s.approvalTimeoutSec)).onChange(async (v) => {
				const n = Math.floor(Number(v));
				if (!Number.isFinite(n)) return;
				s.approvalTimeoutSec = Math.min(600, Math.max(0, n));
				ctx.plugin.saveSettingsSafe();
			});
		});
	markModified(stApprovalTimeout, ctx.plugin.settings, "approvalTimeoutSec");
	ctx.resetButton(stApprovalTimeout, "approvalTimeoutSec");

	ctx.subheading(containerEl, "Guardrails", "Extra protections for the content the agent sees and the files it changes.");

	const stRedact = new Setting(containerEl)
		.setName("Redact secrets")
		.setDesc("Mask detected API keys, tokens, and private keys in web pages and tool results before the model sees them. On by default.")
		.addToggle((t) =>
			t.setValue(s.redactSecrets).onChange(async (v) => {
				s.redactSecrets = v;
				ctx.plugin.saveSettingsSafe();
			})
		);
	markModified(stRedact, ctx.plugin.settings, "redactSecrets");

	const stCheckpoints = new Setting(containerEl)
		.setName("Checkpoints")
		.setDesc("Keep a rollback copy of every note the agent changes. On by default.")
		.addToggle((t) =>
			t.setValue(s.checkpointsEnabled).onChange(async (v) => {
				s.checkpointsEnabled = v;
				ctx.plugin.saveSettingsSafe();
			})
		);
	markModified(stCheckpoints, ctx.plugin.settings, "checkpointsEnabled");
}
