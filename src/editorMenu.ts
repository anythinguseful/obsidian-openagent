/**
 * Editor context menu — candidate ③ from the Copilot study notes
 * (docs/studies/copilot-study-notes.md §③/§③+, v0.1.75; settings depth v0.1.76).
 *
 * Thin Obsidian glue ONLY: builds the menu, assembles an honest
 * SelectionPayload (path + 1-based line range), reveals the chat, and
 * dispatches to ChatView's bridge methods. All the meat lives in
 * ChatApp's registered api so the sim harness can drive it directly.
 *
 * v0.1.76 additions (owner directive "tambah settingannya (dan custom)"):
 *  · Granular per-action switches (Add / Ask / Run skill), each read at
 *    menu-open time like the master toggle.
 *  · Per-skill `contextMenu: false` (SKILL.md frontmatter) hides a skill
 *    from the Run-skill picker — Copilot's showInContextMenu parity.
 *  · Custom actions from prompt snippets flagged `ctxMenu: true` in
 *    Settings → Commands: the snippet text + the quoted
 *    selection prefill the composer (our honest stand-in for Copilot's
 *    `{}` placeholder — NO substitution machinery).
 *
 * v0.1.81: "Quick Ask (floating panel)" item — Copilot's Quick Ask
 * parity (src/quickask/). Unlike the other actions it does NOT need a
 * selection (cursor chat is allowed upstream), so it never disables;
 * its own guards (source mode / no editor / no CM6) Notice instead.
 *
 * Long-standing deliberate divergence: chips append to `pendingFiles`
 * (multi-slot) instead of Copilot's mutually-exclusive selection context.
 */

import {
	Editor,
	FuzzySuggestModal,
	MarkdownFileInfo,
	MarkdownView,
	Menu,
	MenuItem,
	Notice,
} from "obsidian";
import type { Skill } from "./agent/skills";
import type OpenAgentPlugin from "./main";
import { SelectionPayload } from "./ui/chatApi";
import { CHAT_VIEW_TYPE, ChatView } from "./ui/ChatView";

type EditorMenuInfo = MarkdownView | MarkdownFileInfo;

/** runtime-only Obsidian API (absent from obsidian.d.ts through 1.13.x;
    Copilot uses the same shape) — feature-detected, never assumed */
type MenuItemWithSubmenu = MenuItem & { setSubmenu?: () => Menu; submenu?: Menu };

export function registerEditorContextMenu(plugin: OpenAgentPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, info: EditorMenuInfo) => {
			/* the toggle is read at menu-open time — flipping it in Settings
			   takes effect immediately, no reload (owner-facing honesty) */
			if (!plugin.settings.editorContextMenu) return;
			populateEditorMenu(plugin, menu, editor, info);
		})
	);
}

function populateEditorMenu(
	plugin: OpenAgentPlugin,
	menu: Menu,
	editor: Editor,
	info: EditorMenuInfo
): void {
	const st = plugin.settings;
	const selected = editor.getSelection() ?? "";
	const hasSelection = selected.trim().length > 0;
	/* custom actions: snippets explicitly flagged for the editor menu
	   (Settings → Commands) */
	const custom = (st.promptSnippets ?? []).filter((sn) => sn.ctxMenu === true);

	/* nothing to offer → don't even render the host item (a menu that only
	   says "Open Agent" with an empty submenu would be a lie) */
	if (!st.editorContextMenuAdd && !st.editorContextMenuAsk && !st.editorContextMenuSkill && !st.editorContextMenuQuickAsk && custom.length === 0) return;

	const addItems = (target: Menu, prefix: string): void => {
		if (st.editorContextMenuAdd) {
			target.addItem((i) =>
				i
					.setTitle(`${prefix}Add selection to chat`)
					.setDisabled(!hasSelection)
					.onClick(() => {
						const p = selectionPayload(plugin, editor, info, selected);
						if (p) forwardToChat(plugin, (v) => v.attachSelectionFromEditor(p));
					})
			);
		}
		if (st.editorContextMenuAsk) {
			target.addItem((i) =>
				i
					.setTitle(`${prefix}Ask about selection…`)
					.setDisabled(!hasSelection)
					.onClick(() => {
						const p = selectionPayload(plugin, editor, info, selected);
						if (p) forwardToChat(plugin, (v) => v.quoteSelectionFromEditor(p));
					})
			);
		}
		if (st.editorContextMenuQuickAsk) {
			/* no .setDisabled(!hasSelection) — Copilot allows opening Quick Ask
			   on a bare cursor (general floating chat); Replace simply won't
			   be offered without a selection */
			target.addItem((i) =>
				i
					.setTitle(`${prefix}Quick Ask (floating panel)`)
					.onClick(() => plugin.quickAskFromEditor())
			);
		}
		if (st.editorContextMenuSkill) {
			target.addItem((i) =>
				i
					.setTitle(`${prefix}Run skill on selection…`)
					.setDisabled(!hasSelection)
					.onClick(() => {
						const p = selectionPayload(plugin, editor, info, selected);
						if (!p) return;
						let policy;
						try {
							policy = plugin.runner.snapshotWorkspacePolicy();
							policy.assertVisiblePath(p.path, "Editor selection");
						} catch (error) {
							new Notice(`Open Agent: ${error instanceof Error ? error.message : String(error)}`);
							return;
						}
						void plugin.runner.skillsForPolicy(policy)
							.loadSkills()
							.then((skills) => {
								try {
									if (plugin.runner.snapshotWorkspacePolicy().scopeKey !== policy.scopeKey) return;
								} catch {
									return;
								}
								const visible = skills.filter((sk) => sk.ctxMenu !== false);
								if (visible.length === 0) {
									new Notice(
										"Open Agent: no skills available for the context menu — install one, or remove contextMenu: false from a SKILL.md."
									);
									return;
								}
								new EditorSkillSuggest(plugin, visible, p).open();
							})
							.catch(() => new Notice("Open Agent: could not load the skills list."));
					})
			);
		}
		if (custom.length > 0) {
			target.addSeparator();
			for (const snip of custom) {
				target.addItem((i) =>
					i
						.setTitle(`${prefix}${snip.title}`)
						.setDisabled(!hasSelection)
						.onClick(() => {
							const p = selectionPayload(plugin, editor, info, selected);
							if (p) forwardToChat(plugin, (v) => v.runSnippetOnSelectionFromEditor(snip.text, p));
						})
				);
			}
		}
	};

	/* one host item: becomes the "Open Agent" submenu when the runtime
	   supports submenus, otherwise a disabled header above flat items
	   (prefix keeps the flat variants attributable) */
	menu.addItem((item) => {
		const probe = item as MenuItemWithSubmenu;
		if (typeof probe.setSubmenu === "function") {
			probe.setSubmenu();
			const sub = probe.submenu;
			if (sub) {
				item.setTitle("Open Agent").setIcon("bot");
				addItems(sub, "");
				return;
			}
		}
		item.setTitle("Open Agent").setIcon("bot").setDisabled(true);
		addItems(menu, "Open Agent: ");
	});
}

/** Guards mirror Copilot's handler (same order, same politeness); the
    payload is honest about provenance: vault path + 1-based line range. */
function selectionPayload(
	plugin: OpenAgentPlugin,
	editor: Editor,
	info: EditorMenuInfo,
	selected: string
): SelectionPayload | null {
	if (!selected.trim()) {
		new Notice("Open Agent: no text selected.");
		return null;
	}
	const range = editor.listSelections()[0];
	if (!range) {
		new Notice("Open Agent: could not determine the selection range.");
		return null;
	}
	const file = info.file ?? plugin.app.workspace.getActiveFile();
	if (!file) {
		new Notice("Open Agent: no active file.");
		return null;
	}
	let workspaceScope: string;
	try {
		const policy = plugin.runner.snapshotWorkspacePolicy();
		policy.assertVisiblePath(file.path, "Editor selection");
		workspaceScope = policy.scopeKey;
	} catch (error) {
		new Notice(`Open Agent: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
	const a = range.anchor.line;
	const h = range.head.line;
	return {
		path: file.path,
		basename: file.basename,
		fromLine: Math.min(a, h) + 1,
		toLine: Math.max(a, h) + 1,
		text: selected,
		workspaceScope,
	};
}

/** Reveal the chat (creating the leaf on cold start), THEN dispatch —
    ChatView's sink stashes the call if React hasn't finished mounting. */
function forwardToChat(plugin: OpenAgentPlugin, fn: (view: ChatView) => void): void {
	void plugin.activateView().then(() => {
		const leaf = plugin.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
		if (leaf) fn(leaf.view as ChatView);
	});
}

class EditorSkillSuggest extends FuzzySuggestModal<Skill> {
	constructor(
		private plugin: OpenAgentPlugin,
		private skills: Skill[],
		private payload: SelectionPayload
	) {
		super(plugin.app);
		this.setPlaceholder("Run a skill on the selection…");
	}

	getItems(): Skill[] {
		return this.skills;
	}

	getItemText(s: Skill): string {
		return s.name;
	}

	onChooseItem(s: Skill): void {
		forwardToChat(this.plugin, (v) => v.runSkillOnSelectionFromEditor(s.name, this.payload));
	}
}
