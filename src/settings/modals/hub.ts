/** Hub skill preview modal. */
import { App, Modal } from "obsidian";
import type { HubSkill } from "../../agent/hub";
import type { GuardReport } from "../../agent/skillsGuard";

export class HubSkillPreviewModal extends Modal {
	constructor(
		app: App,
		private skill: HubSkill,
		private data: { skillMd: string; files: string[] },
		private actions: { onScan: () => Promise<GuardReport>; onInstall: () => void }
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("oa-hub-preview");
		const head = contentEl.createDiv({ cls: "oa-hub-preview-head" });
		head.createEl("h3", { text: this.skill.name });
		const meta = head.createDiv({ cls: "oa-hub-preview-meta" });
		meta.createSpan({ cls: `oa-hub-trust oa-trust-${this.skill.trust}`, text: this.skill.trust });
		meta.createSpan({ cls: "oa-hub-preview-src", text: this.skill.repo });
		if (this.skill.dir) meta.createSpan({ cls: "oa-hub-preview-src", text: this.skill.dir });

		if (this.skill.description) {
			contentEl.createDiv({ cls: "oa-hub-preview-desc", text: this.skill.description });
		}

		const scanArea = contentEl.createDiv({ cls: "oa-hub-preview-scan" });
		const scanBtn = scanArea.createEl("button", { cls: "oa-mini-btn", text: "Run security scan" });
		scanBtn.addEventListener("click", () => {
			scanBtn.setText("Scanning…");
			scanBtn.disabled = true;
			void this.actions
				.onScan()
				.then((report) => {
					scanArea.empty();
					const cls = report.verdict === "safe" ? "is-safe" : report.verdict === "caution" ? "is-warn" : "is-danger";
					scanArea.createDiv({
						cls: `oa-hub-scan-verdict ${cls}`,
						text: `Skills Guard: ${report.verdict}${report.findings.length ? ` — ${report.findings.length} finding(s)` : ""}`,
					});
					for (const f of report.findings.slice(0, 12)) {
						scanArea.createDiv({
							cls: "oa-hub-scan-finding",
							text: `[${f.severity}] ${f.file}${f.line !== null ? `:${f.line}` : ""} — ${f.description}`,
						});
					}
				})
				.catch(() => {
					scanBtn.setText("Run security scan");
					scanBtn.disabled = false;
				});
		});

		if (this.data.files.length > 0) {
			const shown = this.data.files.slice(0, 12).join(" · ");
			const more = this.data.files.length > 12 ? ` (+${this.data.files.length - 12} more)` : "";
			contentEl.createDiv({ cls: "oa-hub-preview-files", text: `Files: ${shown}${more}` });
		}

		contentEl.createEl("pre", {
			cls: "oa-hub-preview-code",
			text: this.data.skillMd.slice(0, 30000),
		});

		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const close = row.createEl("button", { text: "Close" });
		close.addEventListener("click", () => this.close());
		const install = row.createEl("button", {
			text: this.skill.installedName ? "Installed" : "Install",
			cls: "mod-cta",
		});
		if (this.skill.installedName) install.disabled = true;
		install.addEventListener("click", () => {
			this.close();
			this.actions.onInstall();
		});
	}
}
