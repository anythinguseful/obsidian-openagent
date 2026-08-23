/**
 * Quick Ask — panel lifecycle controller (Copilot
 * `src/editor/quickAskController.ts`, ported with adaptations).
 *
 * Owns the single live panel (one at a time — opening a second closes
 * the first), the persistent selection highlight, and the ReplaceGuard
 * snapshot. The CM6 extension is created once and registered via
 * `registerEditorExtension` in onload; panels themselves are shown by
 * dispatching a StateEffect into the editor.
 *
 * Copilot dependencies on the full plugin object are replaced by
 * injected functions (runTurn / getModelMenu & friends) so lanes can
 * drive the whole surface with a canned model.
 */

import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { MarkdownView, type App, type Component } from "obsidian";
import { computeSelectionAnchors } from "./anchors";
import { quickAskOverlayPlugin, quickAskWidgetEffect } from "./extension";
import { createPersistentHighlight } from "./highlight";
import { createMapPosReplaceGuard } from "./replaceGuard";
import type { QuickAskMenuState, QuickAskRunTurn, QuickAskSuggestion } from "./overlay";
import type { WorkspacePolicy } from "../agent/workspacePolicy";

/** one isolated highlight system for the whole feature (factory
    guarantees no collisions with anything else in the editor) */
const selectionHighlight = createPersistentHighlight("oa-quickask-highlight");

export interface QuickAskControllerDeps {
	runTurn: QuickAskRunTurn;
	snapshotWorkspacePolicy: () => WorkspacePolicy;
	/* v0.1.89 — model-picker in-panel: state dibaca LIVE (per open + per
	   pick) dan callback mengubah settings aktif, sama seperti selectModel
	   di main chat */
	getModelMenu: () => QuickAskMenuState;
	onSelectModel: (provider: string, model: string) => void | Promise<void>;
	onRefreshModels: () => void | Promise<void>;
	onSetVisibleModels: (next: string[]) => void;
	onToggleCollapsed: (slug: string) => void;
	onOpenSettings: () => void;
	/** v0.1.85 — suggestion chips, resolved LIVE at every open (getter
	    closure like getModelMenu) so toggling a snippet's Quick Ask flag
	    in settings applies to the next panel without a reload */
	getSuggestions: () => QuickAskSuggestion[];
	/** Obsidian hosts for the panel's markdown rendering (v0.1.82):
	    app feeds MarkdownRenderer, component owns its event lifecycle
	    (the plugin itself is the natural host) */
	app: App;
	component: Component;
}

interface QuickAskWidgetState {
	view: EditorView;
	close: (restoreFocus?: boolean) => void;
}

export class QuickAskController {
	private widgetState: QuickAskWidgetState | null = null;

	constructor(private readonly deps: QuickAskControllerDeps) {}

	/** Close the current panel (no-op when none is open). */
	close(restoreFocus = true): void {
		const state = this.widgetState;
		if (!state) return;
		this.widgetState = null;
		try {
			/* widget close + highlight hide in ONE dispatch */
			state.view.dispatch({
				effects: [quickAskWidgetEffect.of(null), ...selectionHighlight.buildEffects(state.view, null)],
			});
			if (restoreFocus) state.view.focus();
		} catch {
			/* view may have been destroyed — state already cleared */
		}
	}

	show(markdownView: MarkdownView, view: EditorView): void {
		const selection = view.state.selection.main;
		const leaf = markdownView.leaf;
		const filePath = markdownView.file?.path ?? null;

		/* snapshot from doc.sliceString (NOT editor.getSelection) — CRLF-safe */
		const selectedTextSnapshot = view.state.doc.sliceString(selection.from, selection.to);
		const selectionFrom = selection.from;
		const selectionTo = selection.to;

		this.close(false);

		const replaceGuard = createMapPosReplaceGuard({
			editorView: view,
			leafSnapshot: leaf,
			filePathSnapshot: filePath,
			selectedTextSnapshot,
			initialRange: { from: selectionFrom, to: selectionTo },
			getLeafState: () => {
				const currentView = leaf.view;
				if (!(currentView instanceof MarkdownView)) {
					return { leaf: null, editorView: null, filePath: null };
				}
				return {
					leaf,
					editorView: (currentView.editor as unknown as { cm?: EditorView })?.cm ?? null,
					filePath: currentView.file?.path ?? null,
				};
			},
		});

		const close = (restoreFocus = true): void => {
			const isCurrent = !this.widgetState || this.widgetState.view === view;
			if (isCurrent) this.widgetState = null;
			try {
				view.dispatch({
					effects: [quickAskWidgetEffect.of(null), ...selectionHighlight.buildEffects(view, null)],
				});
				if (isCurrent && restoreFocus) view.focus();
			} catch {
				/* view may have been destroyed */
			}
		};

		try {
			const anchors = computeSelectionAnchors(selection, view.state.doc);
			view.dispatch({
				effects: [
					quickAskWidgetEffect.of(null),
					...selectionHighlight.buildEffects(view, null),
					quickAskWidgetEffect.of({
						bottomAnchorPos: anchors.bottomPos,
						topAnchorPos: anchors.topPos,
						focusAnchorPos: anchors.focusPos,
						options: {
							editorView: view,
							selectedText: selectedTextSnapshot,
							activeNotePath: filePath,
							replaceGuard,
							snapshotWorkspacePolicy: this.deps.snapshotWorkspacePolicy,
							modelMenu: {
								getState: this.deps.getModelMenu,
								onSelect: this.deps.onSelectModel,
								onRefresh: this.deps.onRefreshModels,
								onSetVisibleModels: this.deps.onSetVisibleModels,
								onToggleCollapsed: this.deps.onToggleCollapsed,
								onOpenSettings: this.deps.onOpenSettings,
							},
							runTurn: this.deps.runTurn,
							suggestions: this.deps.getSuggestions(),
							onClose: () => close(true),
							app: this.deps.app,
							component: this.deps.component,
						},
					}),
					...selectionHighlight.buildEffects(view, { from: selectionFrom, to: selectionTo }),
				],
			});
			this.widgetState = { view, close };
		} catch {
			this.widgetState = null;
		}
	}

	isOpen(): boolean {
		return this.widgetState !== null;
	}

	createExtension(): Extension {
		return [quickAskOverlayPlugin];
	}
}
