/** Generic JSON import modal. */
import { App, FuzzySuggestModal, Modal, TFile, TFolder } from "obsidian";
import type { Skill } from "../../agent/skills";

export interface JsonImportOptions {
	title: string;
	placeholder: string;
	confirmLabel: string;
	/** returns null on success (modal closes) or an error string shown near the field */
	onSubmit: (text: string) => Promise<string | null>;
}

export class JsonImportModal extends Modal {
	constructor(app: App, private opts: JsonImportOptions) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: this.opts.title });
		const area = contentEl.createEl("textarea", {
			cls: "oa-json-import-text",
			attr: { rows: "10", placeholder: this.opts.placeholder, "aria-label": this.opts.title },
		});
		const errEl = contentEl.createDiv({ cls: "oa-field-error" });
		errEl.style.display = "none";
		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const go = row.createEl("button", { text: this.opts.confirmLabel, cls: "mod-cta" });
		go.addEventListener("click", async () => {
			errEl.style.display = "none";
			const text = area.value.trim();
			if (!text) {
				errEl.setText("Paste the export JSON first.");
				errEl.style.display = "";
				return;
			}
			const error = await this.opts.onSubmit(text);
			if (error) {
				errEl.setText(error);
				errEl.style.display = "";
				return;
			}
			this.close();
		});
		area.focus();
	}
}


export class ExportFileSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(app: App, private onPick: (file: TFile) => void) {
		super(app);
		this.setPlaceholder("Pick an export file (openagent/exports/*.json)");
	}

	getItems(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((f) => f.extension === "json" && f.path.startsWith("openagent/exports/"))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onPick(item);
	}
}


export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(app: App, private onPick: (folder: TFolder) => void) {
		super(app);
		this.setPlaceholder("Pick a vault folder to exclude…");
		this.setInstructions([{ command: "↵", purpose: "exclude" }]);
	}

	getItems(): TFolder[] {
		const cfg = this.app.vault.configDir;
		return this.app.vault
			.getAllFolders()
			.filter((f) => f.path !== cfg && !f.path.startsWith(cfg + "/"))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	getItemText(item: TFolder): string {
		return item.path;
	}

	onChooseItem(item: TFolder): void {
		this.onPick(item);
	}
}


export class SkillSuggestModal extends FuzzySuggestModal<Skill> {
	constructor(app: App, private skills: Skill[], private onPick: (skill: Skill) => void) {
		super(app);
		this.setPlaceholder("Pick a focus skill…");
		this.setInstructions([{ command: "↵", purpose: "add" }]);
	}

	getItems(): Skill[] {
		return this.skills.filter((s) => s.enabled).sort((a, b) => a.name.localeCompare(b.name));
	}

	getItemText(item: Skill): string {
		return item.name;
	}

	onChooseItem(item: Skill): void {
		this.onPick(item);
	}
}


export interface ConfirmResetOptions {
	title: string;
	lines: string[];
	requireText?: string;
	confirmLabel: string;
}

export class ConfirmResetModal extends Modal {
	constructor(app: App, private opts: ConfirmResetOptions, private onConfirm: () => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: this.opts.title });
		for (const line of this.opts.lines) {
			contentEl.createDiv({ cls: "oa-reset-line", text: line });
		}
		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const go = row.createEl("button", { text: this.opts.confirmLabel, cls: "mod-warning" }) as HTMLButtonElement;
		if (this.opts.requireText) {
			const wrap = contentEl.createDiv({ cls: "oa-reset-confirm" });
			wrap.createEl("label", { text: `Type ${this.opts.requireText} to confirm` });
			const input = wrap.createEl("input", {
				attr: { type: "text", autocomplete: "off", "aria-label": `Type ${this.opts.requireText} to confirm` },
			});
			go.disabled = true;
			input.addEventListener("input", () => {
				go.disabled = input.value !== this.opts.requireText;
			});
			window.setTimeout(() => input.focus(), 10);
		}
		go.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
		// move the action row after the typed-confirm field for a natural reading order
		contentEl.appendChild(row);
	}
}
