/** Profile deletion confirmation modal. */
import { App, Modal, Notice, Setting } from "obsidian";
import { buildProfileExport, type AgentProfile, type ProfileExportSkill } from "../../settings";
import type OpenAgentPlugin from "../../main";
import { Skill, SkillsStore } from "../../agent/skills";
import { skillsFolderFor } from "../../agent/profiles";

export class ConfirmProfileDeleteModal extends Modal {
	constructor(app: App, private profile: AgentProfile, private onDone: (trashFolders: boolean) => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: `Delete profile “${this.profile.name}”?` });
		contentEl.createEl("p", {
			text: "Its memory, skills and chat sessions live in profile-specific folders. Delete those folders too, or keep them on disk?",
		});
		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const keep = row.createEl("button", { text: "Delete, keep folders", cls: "oa-btn" });
		keep.addEventListener("click", () => {
			this.close();
			this.onDone(false);
		});
		const trash = row.createEl("button", { text: "Delete everything", cls: "mod-warning" });
		trash.addEventListener("click", () => {
			this.close();
			this.onDone(true);
		});
	}
}


function exportStamp(): string {
	return new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "-");
}

async function copyText(text: string): Promise<void> {
	try { await navigator.clipboard.writeText(text); }
	catch {
		const ta = document.createElement("textarea");
		ta.value = text;
		document.body.appendChild(ta);
		ta.select();
		document.execCommand("copy");
		ta.remove();
	}
}

export class ProfileExportModal extends Modal {
	constructor(app: App, private plugin: OpenAgentPlugin, private profile: AgentProfile) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: `Export “${this.profile.name}”` });
		contentEl.createEl("p", {
			text: "Soul bundle: soul, personality overlay, provider/model pins, color. Contains no API keys.",
		});
		let includeSkills = true;
		new Setting(contentEl).setName("Include skills").addToggle((t) =>
			t.setValue(true).onChange((v) => {
				includeSkills = v;
			})
		);
		const build = async (): Promise<string> => {
			let skills: ProfileExportSkill[] | undefined;
			if (includeSkills) {
				const store = new SkillsStore(this.app, skillsFolderFor(this.profile, this.plugin.settings));
				const all = await store.loadSkills().catch((): Skill[] => []);
				skills = all
					.filter((sk) => sk.enabled)
					.map((sk) => ({ name: sk.name, whenToUse: sk.whenToUse, instructions: sk.instructions }));
			}
			return JSON.stringify(buildProfileExport(this.profile, skills), null, 2);
		};
		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const copy = row.createEl("button", { text: "Copy", cls: "oa-btn" });
		copy.addEventListener("click", async () => {
			await copyText(await build());
			new Notice("Open Agent: profile bundle copied.");
			this.close();
		});
		const save = row.createEl("button", { text: "Save to vault", cls: "mod-cta" });
		save.addEventListener("click", async () => {
			const path = await this.plugin.writeExportFile(
				`openagent-profile-${this.profile.id}-${exportStamp()}.json`,
				await build()
			);
			new Notice(`Open Agent: profile exported → ${path}`);
			this.close();
		});
	}
}
