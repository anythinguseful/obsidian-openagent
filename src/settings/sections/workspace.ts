/**
 * Workspace section renderer.
 *
 * Moved verbatim out of `OpenAgentSettingTab` (src/settingsTab.ts L615-739 plus
 * the private helper at L742-753) in Phase 4 of the section-renderer
 * extraction. Control order, copy and every settings path are unchanged; only
 * `this.` became `ctx.`, verified by byte-exact roundtrip rather than by
 * re-reading.
 *
 * `addWorkspaceExclusion` travels with the renderer because it has exactly one
 * caller and that caller is in the moving set -- the pairing rule the plan set
 * for this phase. It stays module-private: nothing outside this file may add an
 * exclusion without going through the folder picker, which is what applies
 * `canonicalVaultPath` and rejects a path that escapes the vault.
 */

import { Notice, Setting, TFolder, setIcon } from "obsidian";
import { FolderSuggestModal } from "../modals/json-import";
import { canonicalVaultPath, sanitizeWorkspaceExclusions, type WorkspaceMode } from "../../agent/workspacePolicy";
import { markModified } from "../../settingsModified";
import type { SectionContext } from "./context";

export function workspace(ctx: SectionContext, containerEl: HTMLElement): void {
	const s = ctx.plugin.settings;

	/* v0.1.181: group label for the four scope rows. */
	ctx.subheading(containerEl, "Scope", "How much of the vault the agent can see and touch.");
	const stWorkspaceMode = new Setting(containerEl)
		.setName("Workspace mode")
		.setDesc("Whole vault: everything visible. Preferred: route to a folder. Strict: hard boundary.")
		.addDropdown((d) =>
			d
				.addOption("whole-vault", "Whole vault")
				.addOption("preferred-folder", "Preferred folder")
				.addOption("strict-folder", "Strict folder boundary")
				.setValue(s.workspaceMode)
				.onChange(async (v) => {
					s.workspaceMode = v as WorkspaceMode;
					await ctx.plugin.saveSettings();
					ctx.plugin.refreshViews();
					ctx.display();
				})
		);
	markModified(stWorkspaceMode, ctx.plugin.settings, "workspaceMode");

	const status = containerEl.createDiv({ cls: "oa-workspace-policy-status" });
	const updateStatus = (): void => {
		try {
			const policy = ctx.plugin.runner.snapshotWorkspacePolicy();
			status.setText(`Ready · ${policy.description()}`);
			status.removeClass("is-error");
			status.addClass("is-ready");
		} catch (e) {
			status.setText(`Not ready · ${e instanceof Error ? e.message : String(e)}`);
			status.removeClass("is-ready");
			status.addClass("is-error");
		}
	};

	const stWorkspaceFolder = new Setting(containerEl)
		.setName("Workspace folder")
		.setDesc(
			s.workspaceMode === "whole-vault"
				? "Inactive in Whole vault mode — kept so switching back needs no retyping."
				: s.workspaceMode === "strict-folder"
					? "Existing vault-relative folder required; Strict never falls back."
					: "Vault-relative base for path routing (not a boundary)."
		)
		.addText((t) => {
			t.setPlaceholder("Projects/My project").setValue(s.workspaceFolder);
			/* Commit on blur/change, not every keystroke: Strict workspace edits
			   also switch managed memory/skills/session partitions. */
			t.inputEl.addEventListener("change", () => {
				s.workspaceFolder = t.getValue().trim().normalize("NFC");
				void ctx.plugin.saveSettings().then(() => {
					ctx.plugin.refreshViews();
					updateStatus();
				});
			});
		});
	markModified(stWorkspaceFolder, ctx.plugin.settings, "workspaceFolder");
	ctx.resetButton(stWorkspaceFolder, "workspaceFolder");

	const stExclusions = new Setting(containerEl)
		.setName("Excluded folders")
		.setDesc("Vault folders the agent can never read, list, or write. Chosen with a picker — exclusions apply in all Workspace modes.");
	stExclusions.addButton((b) =>
		b
			.setButtonText("Add folder")
			.setCta()
			.onClick(() => {
				new FolderSuggestModal(ctx.app, (folder) => {
					void addWorkspaceExclusion(ctx, folder);
				}).open();
			})
	);
	/* v0.1.188: no ↺ here — exclusions are a picked LIST with a per-row
	   trash button, not a typed scalar; "reset to default" would be a
	   single destructive action that blanks the whole list at once. */
	markModified(stExclusions, ctx.plugin.settings, "workspaceExcludedFolders");

	if (s.workspaceExcludedFolders.length === 0) {
		ctx.emptyState(stExclusions.controlEl, { title: "Nothing excluded." });
	}
	for (const path of s.workspaceExcludedFolders) {
		const row = new Setting(containerEl).setName(path);
		row.settingEl.addClass("oa-workspace-exclusion-row");
		row.nameEl.addClass("oa-workspace-exclusion-path");
		row.addExtraButton((b) =>
			b
				.setIcon("trash-2")
				.setTooltip(`Remove ${path}`)
				.onClick(async () => {
					s.workspaceExcludedFolders = s.workspaceExcludedFolders.filter((p) => p !== path);
					await ctx.plugin.saveSettings();
					ctx.plugin.refreshViews();
					ctx.display();
				})
		);
	}

	const stReadLimit = new Setting(containerEl)
		.setName("File-read limit")
		.setDesc("Maximum characters returned from one vault file request (1,000–20,000). Large notes must be read in line-based pages.")
		.addText((t) => {
			t.inputEl.type = "number";
			t.inputEl.min = "1000";
			t.inputEl.max = "20000";
			t.inputEl.step = "1000";
			t.setValue(String(s.fileReadMaxChars)).onChange(async (v) => {
				const n = Math.floor(Number(v));
				if (!Number.isFinite(n)) return;
				s.fileReadMaxChars = Math.min(20_000, Math.max(1_000, n));
				await ctx.plugin.saveSettings();
				ctx.plugin.refreshViews();
				updateStatus();
			});
		});
	markModified(stReadLimit, ctx.plugin.settings, "fileReadMaxChars");
	ctx.resetButton(stReadLimit, "fileReadMaxChars");

	containerEl.createDiv({
		cls: "oa-workspace-boundary-warning",
		text: "Strict is logical Obsidian path containment, not a physical filesystem sandbox. A symlink or junction located under the Strict root is treated as in scope and may point outside the vault on desktop platforms.",
	});
	updateStatus();
}

async function addWorkspaceExclusion(ctx: SectionContext, folder: TFolder): Promise<void> {
	const s = ctx.plugin.settings;
	const path = canonicalVaultPath(folder.path, { label: "Workspace exclusion" });
	if (s.workspaceExcludedFolders.includes(path)) {
		new Notice("Open Agent: that folder is already excluded.");
		return;
	}
	s.workspaceExcludedFolders = sanitizeWorkspaceExclusions([...s.workspaceExcludedFolders, path]);
	await ctx.plugin.saveSettings();
	ctx.plugin.refreshViews();
	ctx.display();
}
