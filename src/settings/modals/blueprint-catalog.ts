/** Automation blueprint catalog modal. */
import { App, Modal, Notice } from "obsidian";
import type OpenAgentPlugin from "../../main";
import { CRON_BLUEPRINTS, WEEKDAY_PRESET_LABELS, fillBlueprint, type AutomationBlueprint } from "../../agent/cronBlueprints";
import { describeCronExpr, formatRelative, newCronTask, nextCronRun } from "../../agent/cron";

export class BlueprintCatalogModal extends Modal {
	private inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();

	constructor(app: App, private plugin: OpenAgentPlugin, private onCreated: () => void) {
		super(app);
	}

	onOpen(): void {
		this.renderList();
	}

	private renderList(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: "Automation templates" });
		contentEl.createEl("p", {
			text: "Ready-made automations — the schedule and prompt are already written, you only fill a few blanks.",
		});
		const list = contentEl.createDiv({ cls: "oa-hub-results" });
		for (const bp of CRON_BLUEPRINTS) {
			const row = list.createDiv({ cls: "oa-hub-row" });
			const main = row.createDiv({ cls: "oa-hub-row-main" });
			const head = main.createDiv({ cls: "oa-hub-row-head" });
			head.createDiv({ cls: "oa-hub-row-name", text: bp.title });
			head.createDiv({ cls: "oa-bp-badge", text: bp.category });
			main.createDiv({ cls: "oa-hub-row-desc", text: bp.description });
			const actions = row.createDiv({ cls: "oa-hub-row-actions" });
			const use = actions.createEl("button", { text: "Use" });
			use.addEventListener("click", () => this.renderForm(bp));
		}
		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const close = row.createEl("button", { text: "Close" });
		close.addEventListener("click", () => this.close());
	}

	private renderForm(bp: AutomationBlueprint): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oa-confirm-modal");
		this.inputs.clear();
		contentEl.createEl("h3", { text: `New “${bp.title}”` });
		contentEl.createEl("p", { text: bp.description });

		let target = "openagent/Reports.md";
		const form = contentEl.createDiv({ cls: "oa-bp-form" });
		for (const slot of bp.slots) {
			const field = form.createDiv({ cls: "oa-bp-field" });
			const label = field.createEl("label", { cls: "oa-bp-label" });
			if (slot.type === "enum") {
				const select = label.createEl("select");
				for (const opt of slot.options ?? []) select.createEl("option", { text: opt, value: opt });
				select.value = slot.default ?? slot.options?.[0] ?? "";
				this.inputs.set(slot.name, select);
			} else if (slot.type === "weekdays") {
				const select = label.createEl("select");
				for (const key of slot.options ?? Object.keys(WEEKDAY_PRESET_LABELS)) {
					select.createEl("option", { text: WEEKDAY_PRESET_LABELS[key] ?? key, value: key });
				}
				select.value = slot.default ?? "everyday";
				this.inputs.set(slot.name, select);
			} else if (slot.type === "time") {
				const input = label.createEl("input", { attr: { type: "time" } });
				input.value = slot.default ?? "08:00";
				this.inputs.set(slot.name, input);
			} else {
				const input = label.createEl("input", { attr: { type: "text", placeholder: slot.default ?? slot.label } });
				input.value = slot.default ?? "";
				this.inputs.set(slot.name, input);
			}
			label.appendText(slot.label);
			if (slot.help) {
				field.createDiv({ cls: "oa-bp-help", text: slot.help });
			}
		}

		/* delivery = target note (the plugin's single delivery surface) */
		const targetField = form.createDiv({ cls: "oa-bp-field" });
		const targetLabel = targetField.createEl("label", { cls: "oa-bp-label" });
		const targetInput = targetLabel.createEl("input", { attr: { type: "text", placeholder: "openagent/Reports.md" } });
		targetInput.value = target;
		targetLabel.appendText("Target note");

		const preview = form.createDiv({ cls: "oa-bp-preview", text: "" });
		const refreshPreview = (): void => {
			try {
				const { expr } = fillBlueprint(bp, this.collect());
				const human = describeCronExpr(expr);
				const next = nextCronRun(expr, Date.now());
				preview.textContent = `Means: ${human ?? expr}.${next ? ` Next run ${formatRelative(next)}.` : ""}`;
			} catch {
				preview.textContent = "";
			}
		};
		const onChange = (): void => refreshPreview();
		for (const el of this.inputs.values()) el.addEventListener("change", onChange);
		for (const el of this.inputs.values()) el.addEventListener("input", onChange);
		targetInput.addEventListener("input", onChange);
		refreshPreview();

		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const back = row.createEl("button", { text: "Back" });
		back.addEventListener("click", () => this.renderList());
		const create = row.createEl("button", { text: "Create automation", cls: "mod-cta" });
		create.addEventListener("click", () => {
			create.disabled = true;
			try {
				const result = fillBlueprint(bp, this.collect());
				const task = newCronTask({
					name: result.name,
					prompt: result.prompt,
					expr: result.expr,
					targetNote: targetInput.value.trim() || "openagent/Reports.md",
				});
				this.plugin.settings.cronTasks.push(task);
				void this.plugin.saveSettings().then(() => {
					new Notice(`Open Agent: automation “${task.name}” added — next run ${formatRelative(task.nextRun)}.`);
					this.close();
					this.onCreated();
				});
			} catch (err) {
				create.disabled = false;
				new Notice(`Open Agent: ${err instanceof Error ? err.message : String(err)}`);
			}
		});
	}

	/** Collect current form values, trimming text/time inputs (selects pass through). */
	private collect(): Record<string, string> {
		const values: Record<string, string> = {};
		for (const [name, el] of this.inputs) {
			const v = "value" in el ? (el as HTMLInputElement).value : "";
			values[name] = el instanceof HTMLSelectElement ? v : v.trim();
		}
		return values;
	}
}
