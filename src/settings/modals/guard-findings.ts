/** Skills Guard findings confirmation modal. */
import { App, Modal } from "obsidian";
import type { GuardReport } from "../../agent/skillsGuard";

export class GuardFindingsModal extends Modal {
	constructor(
		app: App,
		private skillName: string,
		private report: GuardReport,
		private policy: "ask" | "block",
		private onConfirm: () => Promise<void>
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: `Skills Guard — “${this.skillName}”` });
		const verdict = contentEl.createDiv({
			cls: `oa-hub-scan-verdict ${this.policy === "block" ? "is-danger" : "is-warn"}`,
			text:
				this.policy === "block"
					? "Dangerous patterns found — this skill is blocked by default."
					: "Caution: patterns worth a look were found.",
		});
		verdict.title = "Heuristic scan (like Hermes' skills_guard) — findings are hints, not proof.";
		const list = contentEl.createDiv({ cls: "oa-hub-scan-list" });
		for (const f of this.report.findings.slice(0, 12)) {
			list.createDiv({
				cls: "oa-hub-scan-finding",
				text: `[${f.severity}] ${f.file}${f.line !== null ? `:${f.line}` : ""} — ${f.description}`,
			});
		}

		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());

		if (this.policy === "ask") {
			const ok = row.createEl("button", { text: "Install anyway", cls: "mod-cta" });
			ok.addEventListener("click", () => {
				this.close();
				void this.onConfirm();
			});
		} else {
			const consent = contentEl.createEl("label", { cls: "oa-guard-consent" });
			const box = consent.createEl("input", { attr: { type: "checkbox" } });
			consent.createSpan({ text: " I reviewed the findings and accept the risk" });
			const ok = row.createEl("button", { text: "Install (unsafe)", cls: "mod-warning" });
			ok.disabled = true;
			box.addEventListener("change", () => {
				ok.disabled = !box.checked;
			});
			ok.addEventListener("click", () => {
				this.close();
				void this.onConfirm();
			});
		}
	}
}
