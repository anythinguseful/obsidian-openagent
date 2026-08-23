/** First-use consent modals for high-risk capabilities. */
import { App, Modal, Notice } from "obsidian";

export class TerminalConsentModal extends Modal {
	constructor(app: App, private onAccept: () => Promise<void>) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: "Enable Terminal & Processes?" });
		contentEl.createEl("p", {
			text: "Commands can change files in the mounted Workspace. Read every frozen command preview before choosing Allow once.",
		});
		const list = contentEl.createEl("ul");
		list.createEl("li", { text: "Docker commands use a disposable container, closed stdin, no network, resource limits, and masked .obsidian/excluded paths." });
		list.createEl("li", { text: "Docker is defense in depth, not a guarantee against a compromised Docker daemon or unsafe image." });
		list.createEl("li", { text: "Local expert mode is not sandboxed, is foreground-only, and is separately gated." });
		list.createEl("li", { text: "Terminal/process tools are unavailable to delegation, cron/headless, Quick Ask, mobile, and other unattended paths." });
		list.createEl("li", { text: "Background processes are owned by one chat and are stopped when that session/view closes, security settings change, or the plugin unloads." });
		const consent = contentEl.createEl("label", { cls: "oa-guard-consent" });
		const box = consent.createEl("input", { attr: { type: "checkbox" } });
		consent.createSpan({ text: " I understand commands may modify or delete Workspace files" });
		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const enable = row.createEl("button", { text: "Accept and enable", cls: "mod-warning" });
		enable.disabled = true;
		box.addEventListener("change", () => { enable.disabled = !box.checked; });
		enable.addEventListener("click", () => {
			enable.disabled = true;
			void this.onAccept().then(() => this.close()).catch((err) => {
				enable.disabled = false;
				new Notice(`Open Agent: could not enable terminal — ${err instanceof Error ? err.message : String(err)}`);
			});
		});
	}
}

export class McpConsentModal extends Modal {
	constructor(app: App, private onAccept: () => Promise<void>) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: "Enable MCP?" });
		contentEl.createEl("p", {
			text: "MCP runs each enabled server's command on this device and gives the agent whatever tools that server exposes.",
		});
		const list = contentEl.createEl("ul");
		list.createEl("li", { text: "Only servers you enabled are started — stdio servers run their command on this device, HTTP servers connect to their URL." });
		list.createEl("li", { text: "Servers get a minimal environment plus only the variables you configure for them, a 30-second timeout per call, and a bounded output." });
		list.createEl("li", { text: "Server commands are not sandboxed — they run with the same privileges as Obsidian. Only add servers you trust." });
		list.createEl("li", { text: "MCP tools are unavailable to delegation, cron/headless, Quick Ask, and mobile." });
		const consent = contentEl.createEl("label", { cls: "oa-guard-consent" });
		const box = consent.createEl("input", { attr: { type: "checkbox" } });
		consent.createSpan({ text: " I understand servers run commands on this device" });
		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const enable = row.createEl("button", { text: "Accept and enable", cls: "mod-warning" });
		enable.disabled = true;
		box.addEventListener("change", () => {
			enable.disabled = !box.checked;
		});
		enable.addEventListener("click", () => {
			enable.disabled = true;
			void this.onAccept()
				.then(() => this.close())
				.catch((err) => {
					enable.disabled = false;
					new Notice(`Open Agent: could not enable MCP — ${err instanceof Error ? err.message : String(err)}`);
				});
		});
	}
}
