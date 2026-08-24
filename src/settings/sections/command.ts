/**
 * Custom commands section renderer.
 *
 * Moved verbatim out of `OpenAgentSettingTab` (src/settingsTab.ts L1887-1991
 * plus the private helper at L1993-2142) in Phase 4 of the section-renderer
 * extraction. Control order, copy and every settings path are unchanged; only
 * `this.` became `ctx.`, verified by byte-exact roundtrip.
 *
 * `renderCommandRows` travels with the renderer for the same reason as the
 * workspace pair: one caller, inside the moving set. It is the larger half (150
 * lines vs 105) because it redraws the whole list in place after every edit --
 * eight call sites, each following a mutation. That redraw-in-place shape is
 * deliberately preserved; replacing it with a targeted DOM update would be a
 * behavior change, and this phase changes no behavior.
 */

import { Notice, Setting, setIcon } from "obsidian";
import { DEFAULT_PROMPT_SNIPPETS, newSnippetId } from "../../settings";
import { SnippetEditModal } from "../modals/snippet";
import { markModified } from "../../settingsModified";
import type { SectionContext } from "./context";

export function command(ctx: SectionContext, containerEl: HTMLElement): void {
	const s = ctx.plugin.settings;

	ctx.subheading(
		containerEl,
		"Editor context menu",
		"Right-clicking an editor selection offers these actions (read at menu-open time — flipping applies immediately). A skill hides from the Run-skill picker via contextMenu: false in its SKILL.md frontmatter."
	);

	const stEditorContextMenu = new Setting(containerEl)
		.setName("Enable editor context menu")
		.setDesc("Master switch — off removes the Open Agent entry from the editor right-click menu entirely.")
		.addToggle((t) =>
			t.setValue(s.editorContextMenu).onChange(async (v) => {
				s.editorContextMenu = v;
				ctx.plugin.saveSettingsSafe();
			})
		);
	markModified(stEditorContextMenu, ctx.plugin.settings, "editorContextMenu");
	const stEditorContextMenuAdd = new Setting(containerEl).setName("Context menu: Add selection to chat").addToggle((t) =>
		t.setValue(s.editorContextMenuAdd).onChange(async (v) => {
			s.editorContextMenuAdd = v;
			ctx.plugin.saveSettingsSafe();
		})
	);
	markModified(stEditorContextMenuAdd, ctx.plugin.settings, "editorContextMenuAdd");
	const stEditorContextMenuAsk = new Setting(containerEl).setName("Context menu: Ask about selection").addToggle((t) =>
		t.setValue(s.editorContextMenuAsk).onChange(async (v) => {
			s.editorContextMenuAsk = v;
			ctx.plugin.saveSettingsSafe();
		})
	);
	markModified(stEditorContextMenuAsk, ctx.plugin.settings, "editorContextMenuAsk");
	const stEditorContextMenuSkill = new Setting(containerEl).setName("Context menu: Run skill on selection").addToggle((t) =>
		t.setValue(s.editorContextMenuSkill).onChange(async (v) => {
			s.editorContextMenuSkill = v;
			ctx.plugin.saveSettingsSafe();
		})
	);
	markModified(stEditorContextMenuSkill, ctx.plugin.settings, "editorContextMenuSkill");
	const stEditorContextMenuQuickAsk = new Setting(containerEl)
		.setName("Context menu: Quick Ask (floating panel)")
		.setDesc(
			"Floating chat panel anchored to the selection (also a command). Works on a bare cursor too — Replace only appears with a selection."
		)
		.addToggle((t) =>
			t.setValue(s.editorContextMenuQuickAsk).onChange(async (v) => {
				s.editorContextMenuQuickAsk = v;
				ctx.plugin.saveSettingsSafe();
			})
		);
	markModified(stEditorContextMenuQuickAsk, ctx.plugin.settings, "editorContextMenuQuickAsk");

	ctx.subheading(
		containerEl,
		"Custom commands",
		"Preset prompts you can fire three ways: right-click a selection in the editor (the prompt + the quoted selection land in the composer), type / in the composer (the full prompt stages into the input), or pick it from the composer “+” menu. In Menu = editor right-click · Slash = / in the composer · Snippets = the “+” picker (on by default — commands lived there before menus did)."
	);

	const head = new Setting(containerEl)
		.setName("Prompt commands")
		.setDesc("New commands start visible on all three surfaces (Copilot parity); untick a column to hide one.");
	let restoreArmed = false;
	head.addButton((b) =>
		b.setButtonText("Restore defaults").onClick(async () => {
			/* armed two-click (danger-zone convention): a stray tap must
			   never append seed commands */
			if (!restoreArmed) {
				restoreArmed = true;
				b.setButtonText("Click again to restore");
				window.setTimeout(() => {
					restoreArmed = false;
					b.setButtonText("Restore defaults");
				}, 2500);
				return;
			}
			const existing = new Set(s.promptSnippets.map((x) => x.text));
			let added = 0;
			for (const seed of DEFAULT_PROMPT_SNIPPETS) {
				if (existing.has(seed.text)) continue;
				s.promptSnippets.push({ ...seed, id: newSnippetId() });
				added++;
			}
			new Notice(added > 0 ? `Open Agent: restored ${added} default command(s).` : "Open Agent: defaults are all present already.");
			ctx.plugin.saveSettingsSafe();
			renderCommandRows(ctx, list);
		})
	);
	head.addButton((b) =>
		b
			.setButtonText("Add command")
			.setCta()
			.onClick(() => {
				new SnippetEditModal(ctx.app, null, async (snip) => {
					/* the modal owns the surface flags now (v0.1.155) */
					s.promptSnippets.push(snip);
					await ctx.plugin.saveSettings();
					renderCommandRows(ctx, list);
				}).open();
			})
	);

	const list = containerEl.createDiv({ cls: "oa-snippet-list" });
	renderCommandRows(ctx, list);
}

function renderCommandRows(ctx: SectionContext, list: HTMLElement): void {
	const s = ctx.plugin.settings;
	list.empty();
	if (s.promptSnippets.length === 0) {
		ctx.emptyState(list, {
			title: "No commands yet",
			description: "“Add command” writes one — the composer “+” menu and / menu stay empty until then.",
		});
		return;
	}
	let draggingIdx: number | null = null;
	const clearDropTargets = (): void => {
		for (const el of Array.from(list.querySelectorAll<HTMLElement>(".oa-snippet-row"))) {
			el.removeClass("is-drop-before");
			el.removeClass("is-drop-after");
		}
	};

	s.promptSnippets.forEach((snip, idx) => {
		const row = list.createDiv({ cls: "oa-snippet-row" });

		/* v0.1.154: drag-reorder via native HTML5 DnD — no dependency,
		   same spirit as v0.1.77's "minus the dnd dependency" decision.
		   The grip is the drag handle; the arrows stay as the keyboard /
		   mobile / accessibility path. */
		const grip = row.createDiv({ cls: "oa-cmd-grip", attr: { "aria-hidden": "true" } });
		grip.draggable = true;
		setIcon(grip, "grip-vertical");
		grip.addEventListener("dragstart", (e) => {
			draggingIdx = idx;
			row.addClass("is-dragging");
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("text/plain", String(idx));
			}
		});
		grip.addEventListener("dragend", () => {
			draggingIdx = null;
			clearDropTargets();
			row.removeClass("is-dragging");
		});
		row.addEventListener("dragover", (e) => {
			if (draggingIdx === null || draggingIdx === idx) return;
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			clearDropTargets();
			const rect = row.getBoundingClientRect();
			row.addClass(e.clientY < rect.top + rect.height / 2 ? "is-drop-before" : "is-drop-after");
		});
		row.addEventListener("drop", async (e) => {
			e.preventDefault();
			if (draggingIdx === null || draggingIdx === idx) return;
			const rect = row.getBoundingClientRect();
			const target = e.clientY < rect.top + rect.height / 2 ? idx : idx + 1;
			const [moved] = s.promptSnippets.splice(draggingIdx, 1);
			s.promptSnippets.splice(target, 0, moved);
			draggingIdx = null;
			clearDropTargets();
			await ctx.plugin.saveSettings();
			renderCommandRows(ctx, list);
		});

		/* manual order = menu order (Copilot drag-sort parity, minus the
		   dnd dependency — arrows are the honest lightweight stand-in) */
		const order = row.createDiv({ cls: "oa-cmd-order" });
		const mkArrow = (dir: "up" | "down", target: number) => {
			const btn = order.createEl("button", {
				cls: "oa-icon-btn",
				attr: { "aria-label": `Move “${snip.title}” ${dir}`, title: `Move ${dir}` },
			});
			setIcon(btn, dir === "up" ? "chevron-up" : "chevron-down");
			if (target < 0 || target > s.promptSnippets.length - 1) btn.disabled = true;
			btn.onclick = async () => {
				const [moved] = s.promptSnippets.splice(idx, 1);
				s.promptSnippets.splice(target, 0, moved);
				await ctx.plugin.saveSettings();
				renderCommandRows(ctx, list);
			};
		};
		mkArrow("up", idx - 1);
		mkArrow("down", idx + 1);

		const main = row.createDiv({ cls: "oa-snippet-main" });
		main.createDiv({ cls: "oa-snippet-title", text: snip.title });
		main.createDiv({ cls: "oa-snippet-text", text: snip.text });
		/* v0.1.155: the surface toggles live in the edit modal now (the
		   inline column was squeezing the title to 0px); the row keeps a
		   compact read-only summary instead. */
		const surfaces: string[] = [];
		if (snip.ctxMenu === true) surfaces.push("menu");
		if (snip.slash === true) surfaces.push("slash");
		if (snip.picker !== false) surfaces.push("+");
		if (snip.quickAsk === true) surfaces.push("quick ask");
		main.createDiv({
			cls: "oa-snippet-surfaces",
			text: surfaces.length ? `Shows in: ${surfaces.join(" · ")}` : "Not shown anywhere",
		});

		const actions = row.createDiv({ cls: "oa-snippet-actions" });

		const edit = actions.createEl("button", {
			cls: "oa-icon-btn",
			attr: { "aria-label": `Edit command “${snip.title}”`, title: "Edit" },
		});
		setIcon(edit, "pencil");
		edit.onclick = () =>
			new SnippetEditModal(ctx.app, snip, async (updated) => {
				/* replace wholesale — a surface turned OFF is absent from
				   `updated`, so Object.assign can't delete the old flag */
				const i = s.promptSnippets.findIndex((x) => x.id === snip.id);
				if (i >= 0) s.promptSnippets[i] = updated;
				await ctx.plugin.saveSettings();
				renderCommandRows(ctx, list);
			}).open();

		const dupe = actions.createEl("button", {
			cls: "oa-icon-btn",
			attr: { "aria-label": `Duplicate command “${snip.title}”`, title: "Duplicate" },
		});
		setIcon(dupe, "copy-plus");
		dupe.onclick = async () => {
			s.promptSnippets.splice(idx + 1, 0, { ...snip, id: newSnippetId(), title: `${snip.title} copy` });
			await ctx.plugin.saveSettings();
			renderCommandRows(ctx, list);
		};

		const del = actions.createEl("button", {
			cls: "oa-icon-btn",
			attr: { "aria-label": `Delete command “${snip.title}”`, title: "Delete" },
		});
		setIcon(del, "trash-2");
		let armed = false;
		del.onclick = async () => {
			if (!armed) {
				armed = true;
				del.addClass("is-armed");
				del.setAttribute("title", "Click again to delete");
				window.setTimeout(() => {
					armed = false;
					del.removeClass("is-armed");
					del.setAttribute("title", "Delete");
				}, 2500);
				return;
			}
			s.promptSnippets = s.promptSnippets.filter((x) => x.id !== snip.id);
			await ctx.plugin.saveSettings();
			renderCommandRows(ctx, list);
		};
	});
}
