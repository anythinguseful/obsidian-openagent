/**
 * Terminal & Processes section renderer.
 *
 * Moved verbatim out of `OpenAgentSettingTab` (src/settingsTab.ts L3238-3339)
 * in Phase 3 of the section-renderer extraction. Control order, copy, every
 * setting path, and the consent flow are unchanged; only `this.` became
 * `ctx.`.
 *
 * Chosen to open Phase 3 because it is the smallest of the three targets
 * (102 lines) and touches no class state -- the same admission test Phase 1
 * applied to `memory`. It is not a whole tab: `capabilities()` still owns the
 * subheading above it and renders it inline among the other toolset blocks.
 *
 * The security shape is load-bearing and deliberately untouched: the mobile
 * guard returns before any control exists, and the enable toggle mints a
 * consent receipt only from a checked user gesture (`grantTerminalConsent`),
 * never from an import or a hand-edited settings file.
 */

import { Notice, Platform, Setting } from "obsidian";
import { TerminalConsentModal } from "../modals/consent";
import { markModified } from "../../settingsModified";
import type { SectionContext } from "./context";

export function terminalSettings(ctx: SectionContext, containerEl: HTMLElement): void {
	const s = ctx.plugin.settings;
	if (Platform?.isDesktopApp !== true) {
		new Setting(containerEl)
			.setName("Unavailable on mobile")
			.setDesc("The plugin remains mobile-capable, but terminal/process schemas and the Node runtime are not registered on mobile.");
		return;
	}

	const enabled = new Setting(containerEl)
		.setName("Enable Terminal & Processes")
		.setDesc("Off by default. Every command start shows a frozen command/backend/image/Workspace/cwd/timeout preview and only supports Allow once.")
		.addToggle((toggle) => toggle.setValue(s.toolsets.terminal).onChange(async (value) => {
			if (!value) {
				s.toolsets.terminal = false;
				await ctx.plugin.saveSettings();
				return;
			}
			if (s.terminal.consentVersion !== 1) {
				toggle.setValue(false);
				new TerminalConsentModal(ctx.app, async () => {
					/* Mint the per-vault receipt only from this checked user gesture;
					   imports and hand-edited settings cannot call this path. */
					await ctx.plugin.grantTerminalConsent();
					ctx.display();
				}).open();
				return;
			}
			s.toolsets.terminal = true;
			ctx.plugin.saveSettingsSafe();
		}));
	markModified(enabled, ctx.plugin.settings, "toolsets.terminal");

	const backend = new Setting(containerEl)
		.setName("Execution backend")
		.setDesc("Docker is recommended. Local is an unsandboxed expert path and never supports background processes.")
		.addDropdown((dropdown) => dropdown
			.addOption("docker", "Docker — disposable, network off")
			.addOption("local", "Local — expert, foreground only")
			.setValue(s.terminal.backend)
			.onChange(async (value) => {
				s.terminal.backend = value === "local" ? "local" : "docker";
				await ctx.plugin.saveSettings();
				ctx.display();
			}));
	markModified(backend, ctx.plugin.settings, "terminal.backend");

	if (s.terminal.backend === "docker") {
		const image = new Setting(containerEl)
			.setName("Docker image")
			.setDesc("Chosen by Settings, never by the agent. Commands run with no network, a read-only root, resource caps, closed stdin, and a masked Workspace.")
			.addText((text) => text
				.setPlaceholder("repository:tag or repository@digest")
				.setValue(s.terminal.dockerImage)
				.onChange(async (value) => {
					const next = value.trim();
					if (!next || next.length > 256 || /[\u0000-\u001f\u007f\s]/.test(next) || next.startsWith("-")) {
						new Notice("Open Agent: enter a valid Docker image reference without whitespace or control characters.");
						text.setValue(s.terminal.dockerImage);
						return;
					}
					s.terminal.dockerImage = next;
					ctx.plugin.saveSettingsSafe();
				}));
		markModified(image, ctx.plugin.settings, "terminal.dockerImage");
	} else {
		const expert = new Setting(containerEl)
			.setName("I understand Local is not sandboxed")
			.setDesc("Required separately. Local is refused in YOLO and Strict Workspace, is foreground-only, and can reach anything Obsidian can.")
			.addToggle((toggle) => toggle.setValue(s.terminal.localExpertEnabled).onChange(async (value) => {
				s.terminal.localExpertEnabled = value;
				ctx.plugin.saveSettingsSafe();
			}));
		markModified(expert, ctx.plugin.settings, "terminal.localExpertEnabled");
	}

	new Setting(containerEl)
		.setName("Backend health")
		.setDesc("Checks Docker Engine availability or reports the host-shell runtime. It does not run an agent command.")
		.addButton((button) => button.setButtonText("Check health").onClick(async () => {
			button.setDisabled(true).setButtonText("Checking…");
			try {
				const result = await ctx.plugin.runner.terminalHealth(ctx.plugin.settings);
				new Notice(`Open Agent: ${result.ok ? "ready" : "not ready"} — ${result.message}`, 8000);
			} finally {
				button.setDisabled(false).setButtonText("Check health");
			}
		}));

	new Setting(containerEl)
		.setName("Stop all owned processes")
		.setDesc("Stops every command this plugin started. Also runs on unload and security-setting changes.")
		.addButton((button) => button.setWarning().setButtonText("Stop all").onClick(async () => {
			button.setDisabled(true);
			try {
				const stopped = await ctx.plugin.runner.stopAllTerminal();
				new Notice(`Open Agent: stop requested for ${stopped} command${stopped === 1 ? "" : "s"}.`);
			} finally {
				button.setDisabled(false);
			}
		}));
}
