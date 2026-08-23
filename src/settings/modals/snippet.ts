/** Prompt snippet editor modal. */
import { App, Modal, Notice, Setting, setIcon } from "obsidian";
import { markdownTextareaKeydown } from "../../ui/markdown-keys";
import { newSnippetId, type PromptSnippet } from "../../settings";

function stackedTextArea(setting: Setting, opts: { rows: number; value: string; placeholder?: string; ariaLabel: string }, onChange: (value: string) => void): HTMLTextAreaElement {
	setting.settingEl.addClass("oa-has-stacked");
	const ta = setting.settingEl.createEl("textarea", { attr: { rows: String(opts.rows), "aria-label": opts.ariaLabel, ...(opts.placeholder ? { placeholder: opts.placeholder } : {}) } });
	ta.value = opts.value;
	ta.addEventListener("change", () => onChange(ta.value));
	ta.addEventListener("keydown", (event) => markdownTextareaKeydown(event, ta, { newlineOnShiftEnter: false }));
	return ta;
}

export class SnippetEditModal extends Modal {
	private title: string;
	private text: string;
	/* v0.1.155: the four surface flags moved into the modal — the inline row
	   toggles were squeezing the command title to 0px at moderate widths. */
	private ctxMenu: boolean;
	private slash: boolean;
	private quickAsk: boolean;
	private pickerShown: boolean;

	constructor(app: App, private snippet: PromptSnippet | null, private onSave: (s: PromptSnippet) => void) {
		super(app);
		this.title = snippet?.title ?? "";
		this.text = snippet?.text ?? "";
		this.ctxMenu = snippet ? snippet.ctxMenu === true : true;
		this.slash = snippet ? snippet.slash === true : true;
		this.quickAsk = snippet ? snippet.quickAsk === true : false;
		this.pickerShown = snippet ? snippet.picker !== false : true;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: this.snippet ? "Edit snippet" : "New snippet" });

		/* v0.1.156 (owner): the placeholder tips sit at the TOP of the modal,
		   rendered as a quiet card with a lightbulb icon — context before the
		   fields. Copilot prompt-placeholder tips (v0.1.78): every token listed
		   here is REAL — resolved at send time in runAgent and, for {}, at
		   editor-action time too. Never document a placeholder the plugin
		   doesn't implement. */
		const tips = contentEl.createDiv({ cls: "oa-snippet-tips" });
		const tipsHead = tips.createDiv({ cls: "oa-snippet-tips-head" });
		const icon = tipsHead.createSpan({ cls: "oa-snippet-tips-icon" });
		setIcon(icon, "lightbulb");
		tipsHead.createSpan({ cls: "oa-snippet-tips-title", text: "Tips — placeholders" });
		for (const line of [
			"{} represents the selected text.",
			"{[[Note Title]]} represents a note.",
			"{activeNote} represents the active note.",
			"{#tag1, #tag2} represents ALL notes with ANY of the specified tags in their property (an OR operation).",
		]) {
			tips.createDiv({ cls: "oa-snippet-tips-line", text: `· ${line}` });
		}

		new Setting(contentEl).setName("Title").addText((t) =>
			t.setPlaceholder("Summarize active note").setValue(this.title).onChange((v) => (this.title = v))
		);
		const snipPromptSetting = new Setting(contentEl).setName("Prompt text");
		stackedTextArea(
			snipPromptSetting,
			{ rows: 6, value: this.text, placeholder: "Summarize my active note and save the summary", ariaLabel: "Prompt text" },
			(v) => {
				this.text = v;
			}
		);

		/* Where this shows — the four surfaces, now owned by the modal. */
		contentEl.createDiv({ cls: "oa-snippet-surfaces-head", text: "Where this shows" });
		const mkSurface = (label: string, get: () => boolean, set: (v: boolean) => void): void => {
			new Setting(contentEl)
				.setName(label)
				.addToggle((tg) => tg.setValue(get()).onChange((v) => set(v)));
		};
		mkSurface("In Menu", () => this.ctxMenu, (v) => (this.ctxMenu = v));
		mkSurface("Slash", () => this.slash, (v) => (this.slash = v));
		mkSurface("Quick Ask", () => this.quickAsk, (v) => (this.quickAsk = v));
		mkSurface("Snippets (+ menu)", () => this.pickerShown, (v) => (this.pickerShown = v));

		new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText("Save")
					.setCta()
					.onClick(() => {
						const text = this.text.trim();
						if (!text) {
							new Notice("Open Agent: snippet text can't be empty.");
							return;
						}
						const title = this.title.trim() || text.slice(0, 42);
						/* flags: opt-in surfaces write only when on; the picker
						   is opt-out so an explicit hide persists picker:false */
						const out: PromptSnippet = { id: this.snippet?.id ?? newSnippetId(), title, text };
						if (this.ctxMenu) out.ctxMenu = true;
						if (this.slash) out.slash = true;
						if (this.quickAsk) out.quickAsk = true;
						if (!this.pickerShown) out.picker = false;
						this.onSave(out);
						this.close();
					})
			)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
