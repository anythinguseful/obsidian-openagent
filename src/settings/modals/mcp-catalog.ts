/** Security-sensitive MCP catalog installer modal. */
import { App, Modal, Notice } from "obsidian";
import type OpenAgentPlugin from "../../main";
import { MCP_CATALOG, type McpCatalogEntry } from "../../agent/mcp/catalog";

export class McpCatalogModal extends Modal {
	constructor(app: App, private plugin: OpenAgentPlugin, private onInstalled: () => void) {
		super(app);
	}

	onOpen(): void {
		this.renderList();
	}

	private renderList(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: "MCP catalog" });
		contentEl.createEl("p", {
			text: "Curated servers with pinned sources. Installing can clone and run third-party code on this device — only install servers you trust.",
		});
		const list = contentEl.createDiv({ cls: "oa-hub-results" });
		for (const entry of MCP_CATALOG) {
			const installed = entry.name in this.plugin.settings.mcpServers;
			const row = list.createDiv({ cls: "oa-hub-row" });
			const main = row.createDiv({ cls: "oa-hub-row-main" });
			main.createDiv({ cls: "oa-hub-row-name", text: entry.name });
			main.createDiv({ cls: "oa-hub-row-desc", text: entry.description });
			main.createDiv({
				cls: "oa-hub-row-src",
				text: `${entry.transport.type === "stdio" ? "stdio (command)" : "http (URL)"}${entry.install ? " · git install" : ""}${entry.auth.type === "api_key" ? " · needs API key" : entry.auth.type === "none" ? " · no auth" : ""}`,
			});
			const actions = row.createDiv({ cls: "oa-hub-row-actions" });
			if (installed) {
				actions.createDiv({ cls: "oa-hub-installed-badge", text: "installed" });
			}
			const btn = actions.createEl("button", { text: installed ? "Reinstall" : "Install" });
			btn.addEventListener("click", () => this.renderForm(entry));
		}
		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const close = row.createEl("button", { text: "Close" });
		close.addEventListener("click", () => this.close());
	}

	private renderForm(entry: McpCatalogEntry): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: `Install “${entry.name}”` });
		contentEl.createEl("p", { text: entry.description });
		if (entry.source) {
			contentEl.createEl("div", { cls: "oa-hub-row-src", text: `Source: ${entry.source}` });
		}

		const prior = this.plugin.settings.mcpServers[entry.name];
		const inputs = new Map<string, HTMLInputElement>();
		if (entry.auth.type === "api_key") {
			const form = contentEl.createDiv({ cls: "oa-mcp-catalog-form" });
			form.dataset.envNames = entry.auth.env.map((spec) => spec.name).join(",");
			for (const spec of entry.auth.env) {
				const field = form.createDiv({ cls: "oa-mcp-catalog-field" });
				const label = field.createEl("label", { cls: "oa-mcp-catalog-label" });
				const input = label.createEl("input", {
					attr: { type: spec.secret ? "password" : "text", placeholder: spec.prompt },
				});
				if (spec.secret) input.autocomplete = "off";
				const existing = prior?.env?.[spec.name];
				input.value = existing ?? spec.default ?? "";
				inputs.set(spec.name, input);
				label.appendText(spec.prompt + (spec.required ? "" : " (optional)"));
			}
		} else if (entry.auth.type === "none") {
			contentEl.createEl("p", {
				text: "No credentials needed.",
			});
		} else {
			contentEl.createEl("p", {
				text: "This server requires OAuth, which this plugin does not run.",
			});
		}

		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const back = row.createEl("button", { text: "Back" });
		back.addEventListener("click", () => this.renderList());
		const install = row.createEl("button", { text: "Install", cls: "mod-cta" });
		install.addEventListener("click", () => {
			install.disabled = true;
			const envValues: Record<string, string> = {};
			for (const [k, v] of inputs) envValues[k] = v.value;
			void this.plugin
				.installMcpCatalogEntry(entry.name, envValues)
				.then((res) => {
					if (!res.ok) {
						install.disabled = false;
						new Notice(`Open Agent: install failed — ${res.error ?? "unknown error"}`);
						return;
					}
					this.renderDone(entry, res.postInstall);
					this.onInstalled();
				})
				.catch((err) => {
					install.disabled = false;
					new Notice(`Open Agent: install failed — ${err instanceof Error ? err.message : String(err)}`);
				});
		});
	}

	private renderDone(entry: McpCatalogEntry, postInstall?: string): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("oa-confirm-modal");
		contentEl.createEl("h3", { text: `Installed “${entry.name}”` });
		contentEl.createEl("p", {
			text: "The server is enabled. Start a new chat (or open the current one) to load its tools.",
		});
		if (postInstall) {
			const note = contentEl.createDiv({ cls: "oa-mcp-catalog-note" });
			for (const line of postInstall.split("\n")) {
				note.createEl("p", { text: line });
			}
		}
		const row = contentEl.createDiv({ cls: "oa-modal-actions" });
		const close = row.createEl("button", { text: "Done" });
		close.addEventListener("click", () => this.close());
	}
}
