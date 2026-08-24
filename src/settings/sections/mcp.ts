/**
 * MCP servers section renderer.
 *
 * Moved verbatim out of `OpenAgentSettingTab` (src/settingsTab.ts L3233-3403)
 * in Phase 3 of the section-renderer extraction. Control order, copy, every
 * setting path, and the consent flow are unchanged; only `this.` became
 * `ctx.`. Verified by a byte-exact roundtrip, not by re-reading.
 *
 * Admission test (the rule in ./context.ts): this renderer touches NO class
 * state. It reaches for exactly four things -- `ctx.plugin` (15x), `ctx.display`
 * (5x), `ctx.app` (2x) and `ctx.emptyState` (1x) -- all of them part of the
 * SectionContext contract. An earlier note guessed it depended on the hub
 * cache (`hubEnsureLoaded`); that was wrong. It sits next to the hub methods
 * in the file, but references none of them.
 *
 * Like `terminalSettings`, this is not a whole tab: `capabilities()` still
 * owns the "MCP servers" subheading above it and renders this inline.
 *
 * Two load-bearing details, deliberately preserved:
 *   1. Consent. The enable toggle refuses to set `mcpEnabled = true` while
 *      `mcpConsent.consentVersion !== 1`; it reverts the toggle and opens
 *      McpConsentModal, whose callback alone mints the receipt via
 *      `grantMcpConsent()`. A receipt is never minted by an import or a
 *      hand-edited settings file.
 *   2. Statement order. `area` (the import textarea) is referenced inside the
 *      Import button's onClick BEFORE it is declared just below. That is safe
 *      only because the closure runs on click, long after the declaration has
 *      executed -- so the two statements must keep their relative order.
 */

import { Notice, Setting } from "obsidian";
import { McpConsentModal } from "../modals/consent";
import { McpCatalogModal } from "../modals/mcp-catalog";
import { kvToLines, linesToKv, parseMcpServersDoc } from "../../settings";
import { markModified } from "../../settingsModified";
import { stackedTextArea } from "./helpers";
import type { SectionContext } from "./context";

export function mcp(ctx: SectionContext, containerEl: HTMLElement): void {
	const s = ctx.plugin.settings;

	const stMcpEnabled = new Setting(containerEl)
		.setName("Enable MCP")
		.setDesc("Runs configured MCP servers on this device — first-use consent explains the risk. stdio is desktop-only; HTTP connects over a URL.")
		.addToggle((t) =>
			t.setValue(s.mcpEnabled).onChange(async (v) => {
				if (!v) {
					s.mcpEnabled = false;
					await ctx.plugin.saveSettings();
					return;
				}
				if (s.mcpConsent.consentVersion !== 1) {
					t.setValue(false);
					new McpConsentModal(ctx.app, async () => {
						await ctx.plugin.grantMcpConsent();
						ctx.display();
					}).open();
					return;
				}
				s.mcpEnabled = true;
				await ctx.plugin.saveSettings();
			})
		);
	markModified(stMcpEnabled, ctx.plugin.settings, "mcpEnabled");

	const list = containerEl.createDiv({ cls: "oa-mcp-list" });
	const entries = Object.entries(s.mcpServers).sort(([a], [b]) => a.localeCompare(b));
	if (entries.length === 0) {
		ctx.emptyState(list, {
			title: "No MCP servers configured",
			description: "Add one below, install one from the catalog, or import an mcp.json document.",
		});
	}
	for (const [name, srv] of entries) {
		const isHttp = (srv.transport ?? (srv.url ? "http" : "stdio")) === "http";
		const summary = isHttp
			? srv.url || "No URL set"
			: [srv.command, ...(srv.args ?? [])].filter(Boolean).join(" ") || "No command set";
		const card = list.createDiv({ cls: "oa-mcp-server" });
		new Setting(card)
			.setName(name)
			.setDesc(`${isHttp ? "http" : "stdio"} · ${summary}${srv.enabled ? "" : " · disabled"}`)
			.addToggle((t) =>
				t.setValue(srv.enabled).onChange(async (v) => {
					srv.enabled = v;
					await ctx.plugin.saveSettings();
				})
			)
			.addExtraButton((b) =>
				b
					.setIcon("trash-2")
					.setTooltip("Remove server")
					.onClick(async () => {
						delete s.mcpServers[name];
						await ctx.plugin.saveSettings();
						ctx.display();
					})
			);
		if (isHttp) {
			new Setting(card)
				.setName("URL")
				.setDesc("HTTP endpoint of this MCP server.")
				.addText((t) =>
					t.setValue(srv.url ?? "").onChange(async (v) => {
						srv.url = v.trim();
						await ctx.plugin.saveSettings();
					})
				);
			const headersSetting = new Setting(card)
				.setName("Headers")
				.setDesc("KEY=VALUE pairs, one per line — e.g. Authorization=Bearer …");
			stackedTextArea(
				headersSetting,
				{ rows: 4, value: kvToLines(srv.headers), placeholder: "Authorization=Bearer …", ariaLabel: "Headers" },
				async (v) => {
					srv.headers = linesToKv(v);
					await ctx.plugin.saveSettings();
				}
			);
		} else {
			new Setting(card)
				.setName("Command")
				.setDesc("Executable spawned over stdio, e.g. npx")
				.addText((t) =>
					t.setValue(srv.command ?? "").onChange(async (v) => {
						srv.command = v.trim();
						await ctx.plugin.saveSettings();
					})
				);
			new Setting(card)
				.setName("Arguments")
				.setDesc("Space-separated arguments passed to the command.")
				.addText((t) =>
					t.setValue((srv.args ?? []).join(" ")).onChange(async (v) => {
						srv.args = v.split(/\s+/).filter(Boolean);
						await ctx.plugin.saveSettings();
					})
				);
			const envSetting = new Setting(card).setName("Environment").setDesc("KEY=VALUE pairs, one per line.");
			stackedTextArea(
				envSetting,
				{ rows: 4, value: kvToLines(srv.env), placeholder: "DEBUG=true", ariaLabel: "Environment variables" },
				async (v) => {
					srv.env = linesToKv(v);
					await ctx.plugin.saveSettings();
				}
			);
		}
	}

	new Setting(containerEl).addButton((b) =>
		b
			.setButtonText("Add MCP server")
			.setCta()
			.onClick(async () => {
				let name = "new-server";
				let n = 1;
				while (name in s.mcpServers) name = `new-server-${++n}`;
				s.mcpServers[name] = {
					command: "npx",
					args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
					enabled: true,
				};
				await ctx.plugin.saveSettings();
				ctx.display();
			})
	);

	const importEl = containerEl.createDiv({ cls: "oa-mcp-import" });
	/* owner directive S3-7 (2026-07-23): label row first, paste area below it
	   (was reversed — the field sat above its own label) */
	new Setting(importEl)
		.setName("Import mcp.json")
		.setDesc("Paste a standard mcp.json document below. Servers are merged by name.")
		.addButton((b) =>
			b.setButtonText("Import").onClick(async () => {
				try {
					const parsed = parseMcpServersDoc(area.value);
					Object.assign(s.mcpServers, parsed);
					await ctx.plugin.saveSettings();
					new Notice(`Open Agent: imported ${Object.keys(parsed).length} MCP server(s).`);
					ctx.display();
				} catch (err) {
					new Notice(`Open Agent: import failed — ${err instanceof Error ? err.message : String(err)}`);
				}
			})
		);
	const area = importEl.createEl("textarea", {
		cls: "oa-mcp-import-text",
		attr: {
			rows: "6",
			placeholder:
				'{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]\n    }\n  }\n}',
		},
	});

	new Setting(containerEl).addButton((b) =>
		b
			.setButtonText("Install from catalog")
			.onClick(() => new McpCatalogModal(ctx.app, ctx.plugin, () => ctx.display()).open())
	);

	containerEl.createDiv({
		cls: "oa-mcp-note",
		text: "Servers connect lazily on the next chat run. The catalog offers curated, pinned servers — git-installed ones clone and run third-party code on this device without a sandbox.",
	});
}
