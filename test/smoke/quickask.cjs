/**
 * Smoke guards whose subject is the Quick Ask panel.
 *
 * Moved from test/smoke.test.cjs in Phase 9 of the smoke/harness split.
 * Guard conditions and messages are unchanged; only the enclosing function,
 * one level of indentation, and the path anchor differ.
 *
 * Anchor note, because this cluster is where it bites hardest: in the
 * monolith __dirname IS test/, so a path starting with ".." meant the repo
 * root while a bare path meant test/. Several of these guards mix both forms
 * within three consecutive lines -- read("../styles.css") next to
 * read("real-preview/build.mjs"), where the latter is test/real-preview.
 * Every path was re-anchored individually against the harness read(), which
 * is repo-root based, and each one was checked to resolve.
 */

const { read } = require("./harness.cjs");

// Returns the number of failed guards so the orchestrator can fold it into
// its own counter. Guards keep using the bare `failed++` they were written
// with, so the moved code stays byte-identical apart from indentation.
module.exports = function quickaskGuards() {
	let failed = 0;

	{
		const anchors = read("src/quickask/anchors.ts");
		const hl = read("src/quickask/highlight.ts");
		const rg = read("src/quickask/replaceGuard.ts");
		const ext = read("src/quickask/extension.ts");
		const ctrl = read("src/quickask/controller.ts");
		const ovl = read("src/quickask/overlay.ts");
		const pnl = read("src/quickask/panel.tsx");
		const main8 = read("src/main.ts");
		const em8 = read("src/editorMenu.ts");
		const st8 = read("src/settings.ts");
		const tab8 = read("src/settingsTab.ts");
		const css8 = read("styles.css");
		const entry8 = read("test/real-preview/chat-entry.tsx");
		const build8 = read("test/real-preview/build.mjs");
		const ok =
			anchors.includes("computeSelectionAnchors") &&
			anchors.includes("mapQuickAskAnchorPositions") &&
			anchors.includes("doc.lineAt(bottomPos).from === bottomPos") &&
			hl.includes("createPersistentHighlight(className: string)") &&
			hl.includes("StateEffect.appendConfig.of(extension)") &&
			rg.includes("createMapPosReplaceGuard") &&
			rg.includes('"content_changed"') &&
			rg.includes('"leaf_changed"') &&
			rg.includes("Selection content has changed. Please reselect and try again.") &&
			ext.includes("quickAskWidgetEffect = StateEffect.define") &&
			ext.includes("guard.onDocChanged(update.changes)") &&
			ext.includes("schedulePanelRerender") &&
			ctrl.includes('createPersistentHighlight("oa-quickask-highlight")') &&
			ctrl.includes("view.state.doc.sliceString(selection.from, selection.to)") &&
			ctrl.includes("class QuickAskController") &&
			ctrl.includes("isOpen(): boolean") &&
			ovl.includes("createRoot(container)") &&
			ovl.includes("placementSide") &&
			ovl.includes("view.coordsAtPos(pos)") &&
			pnl.includes("QUICK_COMMAND_SYSTEM_PROMPT") &&
			pnl.includes("<selected_text>") &&
			pnl.includes("Replace selection") &&
			pnl.includes("Insert at cursor") &&
			pnl.includes('"Open Agent: Replaced"') &&
			pnl.includes("You are an AI assistant designed to execute user instructions") &&
			main8.includes("quickAskFromEditor(): void") &&
			main8.includes("Quick Ask is not available in source mode.") &&
			main8.includes("could not access the CodeMirror editor.") &&
			main8.includes("registerEditorExtension(this.quickAsk.createExtension())") &&
			main8.includes('id: "openagent-quick-ask"') &&
			main8.includes("chatCompletion(t.provider, { ...s, activeProviderId: t.provider.id") && /* bentuk panggilan diubah v0.1.92 (retry/failover); sisa kontrak v0.1.81 tak berubah */
			em8.includes("Quick Ask (floating panel)") &&
			st8.includes("editorContextMenuQuickAsk: boolean;") &&
			st8.includes("editorContextMenuQuickAsk: true,") &&
			tab8.includes("Context menu: Quick Ask (floating panel)") &&
			css8.includes(".oa-quickask-panel") &&
			entry8.includes('s === "qask"') &&
			entry8.includes("__oaQaskCheck") &&
			build8.includes("__oaQaskCheck") &&
			build8.includes('"qask"');
		if (ok) {
			console.log("✓ v0.1.81: Quick Ask — CM6 overlay panel · anchors+highlight+ReplaceGuard ports · Copy/Insert/Replace · source-mode gate · toggle");
		} else {
			console.error("✗ v0.1.81 Quick Ask wiring drifted");
			failed++;
		}
	}
	{
		const pnl9 = read("src/quickask/panel.tsx");
		const ovl9 = read("src/quickask/overlay.ts");
		const ctl9 = read("src/quickask/controller.ts");
		const main9 = read("src/main.ts");
		const css9 = read("styles.css");
		const entry9 = read("test/real-preview/chat-entry.tsx");
		const ok =
			pnl9.includes("ChatContainer") &&
			pnl9.includes("CopyAction") &&
			pnl9.includes("MessageActions") &&
			pnl9.includes('<Markdown app={options.app} component={options.component}>') &&
			pnl9.includes('<Loader variant="typing" size="sm"') &&
			pnl9.includes("PromptInputAction") &&
			pnl9.includes("oa-quickask-sug") &&
			pnl9.includes("SUGGESTIONS_WITH_SELECTION") &&
			pnl9.includes('aria-label="Replace selection"') &&
			ovl9.includes("component: Component;") &&
			ctl9.includes("component: Component;") &&
			ctl9.includes("app: App;") &&
			main9.includes("component: this,") &&
			css9.includes(".oa-quickask .oa-msg-action {") &&
			css9.includes(".oa-quickask .oa-prompt-action.oa-prompt-action-primary") &&
			css9.includes(".oa-quickask .oa-loader-typing span {") &&
			css9.includes(".oa-quickask-body .oa-chat-scroll") &&
			entry9.includes("Component as ShimComponent") &&
			entry9.includes('".oa-quickask .oa-msg-assistant"') &&
			entry9.includes('aria-label="Replace selection"');
		if (ok) {
			console.log("✓ v0.1.82: Quick Ask × prompt-kit — ChatContainer · Message/CopyAction · Markdown finals · typing Loader · composer actions · suggestion chips");
		} else {
			console.error("✗ v0.1.82 quick-ask prompt-kit wiring drifted");
			failed++;
		}
	}
	{
		const pnl10 = read("src/quickask/panel.tsx");
		const css10 = read("styles.css");
		const ok =
			pnl10.includes("ArrowUpIcon size={16}") &&
			pnl10.includes('variant="danger"') &&
			!pnl10.includes("SendIcon") &&
			css10.includes(".oa-quickask-composer-actions {") &&
			css10.includes("justify-content: flex-end;") &&
			css10.includes(".oa-quickask .oa-prompt-action.oa-prompt-action-primary:hover:not(:disabled)") &&
			css10.includes(".oa-quickask .oa-prompt-action.oa-prompt-action-primary:disabled") &&
			css10.includes("oklch(from var(--interactive-accent)") &&
			css10.includes(".oa-quickask .oa-prompt-action-danger {") &&
			css10.includes("rgba(var(--color-red-rgb, 248 81 73), 0.12)");
		if (ok) {
			console.log("✓ v0.1.83: quick-ask composer = main-chat mirror — actions row, arrow-up adaptive send, danger stop, inert disabled disc");
		} else {
			console.error("✗ v0.1.83 composer mirror drifted");
			failed++;
		}
	}
	{
		const css11 = read("styles.css");
		const sd11 = read("src/ui/Icon.tsx");
		const closeBlk = (css11.match(/\.oa-quickask-close \{[\s\S]*?\n}/) || [""])[0];
		const pnl11 = read("src/quickask/panel.tsx");
		const ok =
			css11.includes("\n.oa-icon {") &&
			css11.includes("\n.oa-icon > svg {") &&
			!css11.includes(".oa-app .oa-icon {") &&
			!css11.includes(".oa-app .oa-icon > svg {") &&
			/* v0.1.100 (owner: "samakan dengan oa-icon-btn") — chrome close
			   pindah ke .oa-icon-btn (28×28); blok close tinggal layout */
			!closeBlk.includes("width: 24px;") &&
			closeBlk.includes("margin-left: auto;") &&
			pnl11.includes('className="oa-quickask-close oa-icon-btn"') &&
			sd11.includes("setIcon(ref.current, name)") &&
			sd11.includes("style={{ width: size, height: size }}");
		if (ok) {
			console.log("✓ v0.1.84/100: .oa-icon kontrak unscoped · quick-ask close = chrome oa-icon-btn");
		} else {
			console.error("✗ v0.1.84 icon-sizing contract drifted");
			failed++;
		}
	}
	{
		const st12 = read("src/settings.ts");
		const tab12 = read("src/settingsTab.ts");
		const ctl12 = read("src/quickask/controller.ts");
		const ovl12 = read("src/quickask/overlay.ts");
		const pnl12 = read("src/quickask/panel.tsx");
		const main12 = read("src/main.ts");
		const ok =
			st12.includes("quickAsk?: boolean;") &&
			st12.includes("...(r.quickAsk === true ? { quickAsk: true } : {}),") &&
			read("src/settings/modals/snippet.ts").includes('mkSurface("Quick Ask"') &&
			read("src/settings/modals/snippet.ts").includes("if (this.quickAsk) out.quickAsk = true") &&
			ctl12.includes("getSuggestions: () => QuickAskSuggestion[];") &&
			ctl12.includes("suggestions: this.deps.getSuggestions(),") &&
			ovl12.includes("suggestions: QuickAskSuggestion[];") &&
			pnl12.includes("options.suggestions.length > 0") &&
			pnl12.includes("SUGGESTIONS_WITH_SELECTION") && /* fallback stays */
			pnl12.includes("{sug.label}") &&
			pnl12.includes("setInput(sug.text);") &&
			main12.includes("getSuggestions: () =>") &&
			main12.includes(".filter((sn) => sn.quickAsk === true)") &&
			main12.includes("{ label: sn.title, text: sn.text }");
		if (ok) {
			console.log("✓ v0.1.85: Quick Ask chips = snippet flagged quickAsk (toggle ke-4 · getter live · built-in fallback)");
		} else {
			console.error("✗ v0.1.85 quick-ask custom chips wiring drifted");
			failed++;
		}
	}
	{
		const css14 = read("styles.css");
		const pnl14 = read("src/quickask/panel.tsx");
		const bld14 = read("test/real-preview/build.mjs");
		const r0 = css14.indexOf(".oa-quickask-panel");
		const r1 = css14.indexOf("REDUCED MOTION");
		const region = r0 >= 0 && r1 > r0 ? css14.slice(r0, r1) : "";
		const ok =
			pnl14.includes("role=\"alert\"") &&
			pnl14.includes("setInput(text);") &&
			pnl14.includes("setFailure(null);") &&
			pnl14.includes('aria-label={hasSelection ? "Ask about the selection"') &&
			pnl14.includes("oa-quickask-error") &&
			css14.includes(".oa-quickask .oa-msg:focus-within .oa-msg-actions") &&
			css14.includes("@media (hover: none), (pointer: coarse)") &&
			css14.includes("@media (prefers-reduced-motion: reduce)") &&
			css14.includes("overscroll-behavior: contain;") &&
			css14.includes("overscroll-behavior-x: contain;") &&
			region.length > 0 &&
			!/#[0-9a-fA-F]{3,6}\b/.test(region) &&
			bld14.includes("setTouchEmulationEnabled") &&
			bld14.includes("coarseActionsVisible");
		if (ok) {
			console.log("✓ v0.1.87: quick-ask contract audit — aria textarea · reveal focus/touch · error inline+retry · overscroll · reduced-motion layer · 0 hex");
		} else {
			console.error("✗ v0.1.87 quick-ask audit follow-ups drifted");
			failed++;
		}
	}
	{
		const ovl15 = read("src/quickask/overlay.ts");
		const pnl15 = read("src/quickask/panel.tsx");
		const css15 = read("styles.css");
		const ent15 = read("test/real-preview/chat-entry.tsx");
		const bld15 = read("test/real-preview/build.mjs");
		const ok =
			ovl15.includes("beginDrag(ev: PointerEvent)") &&
			ovl15.includes("this.userPos = { left: dLeft, top: dTop };") &&
			pnl15.includes("beginDrag(e.nativeEvent)") &&
			css15.includes("cursor: grab;") &&
			ent15.includes("detachedOnScroll") &&
			ent15.includes("dragMoved") &&
			bld15.includes("dragOk");
		if (ok) {
			console.log("✓ v0.1.88→91: quick-ask drag head saja (resize dihapus; detach session-only · writeback clamp · × filtered)");
		} else {
			console.error("✗ v0.1.88/91 quick-ask drag drifted");
			failed++;
		}
	}
	{
		const ctl16 = read("src/quickask/controller.ts");
		const pnl16 = read("src/quickask/panel.tsx");
		const css16 = read("styles.css");
		const mn16 = read("src/main.ts");
		const ent16 = read("test/real-preview/chat-entry.tsx");
		const bld16 = read("test/real-preview/build.mjs");
		const ok =
			ctl16.includes("getModelMenu: () => QuickAskMenuState") &&
			ctl16.includes("onSelectModel: (provider: string, model: string)") &&
			pnl16.includes('import { ModelPicker } from "../ui/components/model-picker";') &&
			pnl16.includes("oa-quickask-foot") &&
			!pnl16.includes("oa-quickask-model") &&
			css16.includes(".oa-quickask .oa-model-pill {") &&
			css16.includes(".oa-quickask .oa-model-menu {") &&
			css16.includes(".oa-quickask-foot {") &&
			css16.includes(".oa-quickask .oa-modal-overlay {") &&
			mn16.includes("onSelectModel: async (provider, m) =>") &&
			mn16.includes("refreshQuickAskModels") &&
			ent16.includes("pickSwitches") &&
			ent16.includes("visToggleWrites") &&
			bld16.includes("pickerOk");
		if (ok) {
			console.log("✓ v0.1.89: model picker in-panel (main-chat parity) · caption footer live · header bersih · CSS mirror 57 selector · overflow visible");
		} else {
			console.error("✗ v0.1.89 quick-ask model picker drifted");
			failed++;
		}
	}
	{
		const pt17 = read("src/agent/promptTokens.ts");
		const ovl17 = read("src/quickask/overlay.ts");
		const ctl17 = read("src/quickask/controller.ts");
		const pnl17 = read("src/quickask/panel.tsx");
		const ent17 = read("test/real-preview/chat-entry.tsx");
		const bld17 = read("test/real-preview/build.mjs");
		const ok =
			pt17.includes("export function extractActiveNoteToken") &&
			ovl17.includes("activeNotePath: string | null") &&
			ctl17.includes("activeNotePath: filePath") &&
			pnl17.includes("extractActiveNoteToken") &&
			pnl17.includes("[Attached file:") &&
			pnl17.includes("options.editorView.state.doc.toString()") &&
			ent17.includes("activenoteLive") &&
			bld17.includes("activeNoteOk");
		if (ok) {
			console.log("✓ v0.1.90: {activeNote} → [Attached file:] live-doc · strip · bubble mentah · Notice bernama");
		} else {
			console.error("✗ v0.1.90 quick-ask {activeNote} drifted");
			failed++;
		}
	}
	{
		const ovl18 = read("src/quickask/overlay.ts");
		const pnl18 = read("src/quickask/panel.tsx");
		const css18 = read("styles.css");
		const ico18 = read("src/ui/icons.tsx");
		const ent18 = read("test/real-preview/chat-entry.tsx");
		const bld18 = read("test/real-preview/build.mjs");
		const ok =
			!pnl18.includes("oa-quickask-grip") &&
			!css18.includes(".oa-quickask-grip") &&
			!pnl18.includes("oa-quickask-move") &&
			!pnl18.includes("GripVerticalIcon") &&
			!css18.includes(".oa-quickask-move") &&
			!ico18.includes("grip-vertical") &&
			ovl18.includes("beginResize") &&
			ovl18.includes("MIN_PANEL_H") &&
			ovl18.includes("oa-quickask-sized") &&
			pnl18.includes("oa-quickask-seam") &&
			css18.includes(".oa-quickask .oa-quickask-seam {") &&
			css18.includes("nwse-resize") &&
			css18.includes(".oa-quickask-sized .oa-quickask-body {") &&
			ent18.includes("seamKeys") &&
			ent18.includes("gripGlyphGone") &&
			bld18.includes("seamOk");
		if (ok) {
			console.log("✓ v0.1.91/100: resize balik sebagai SEAM (bukan tombol) · grip glyph hilang · absence guard wujud lama");
		} else {
			console.error("✗ v0.1.91/100 quick-ask gesture contract drifted");
			failed++;
		}
	}
	{
		const res19 = read("src/agent/resilience.ts");
		const mn19 = read("src/main.ts");
		const ovl19 = read("src/quickask/overlay.ts");
		const pnl19 = read("src/quickask/panel.tsx");
		const ent19 = read("test/real-preview/chat-entry.tsx");
		const bld19 = read("test/real-preview/build.mjs");
		const ok =
			res19.includes("export async function attemptWithResilience") &&
			res19.includes("attempt < maxAttempts(err)") &&
			mn19.includes("resolveFallbacks(s)[0]") &&
			mn19.includes("attemptWithResilience(") &&
			ovl19.includes("onRetry: (() => void) | undefined") &&
			pnl19.includes('() => setStreamText("")') &&
			ent19.includes("streamResetOnRetry") &&
			ent19.includes("resilienceFailover") &&
			bld19.includes("resilienceOk");
		if (ok) {
			console.log("✓ v0.1.92: retry/failover (resilience.ts) di Quick Ask · maks 1 swap · stream reset · abort-aware");
		} else {
			console.error("✗ v0.1.92 quick-ask retry/failover drifted");
			failed++;
		}
	}
	{
		const prep = read("src/ui/markdown-preprocess.ts");
		const canonical = read("src/markdown/canonical-output.ts");
		const fences = read("src/markdown/fences.ts");
		const markdownTest = read("test/markdown.test.cjs");
		const toolsTest = read("test/tools.test.cjs");
		const chat = read("src/ui/ChatApp.tsx");
		const quickAsk = read("src/quickask/panel.tsx");
		const main = read("src/main.ts");
		const cron = read("src/agent/cron.ts");
		const previewEntry = read("test/real-preview/chat-entry.tsx");
		const previewDriver = read("test/real-preview/build.mjs");
		const ok =
			prep.includes("MERMAID_TRAILING_PERCENT") &&
			prep.includes("isTopLevelMermaidPosition") &&
			prep.includes("salvageMermaidFlowchartLine") &&
			prep.includes("`${statement}${carriage}\\n${indent}%%${commentText}${carriage}`") &&
			canonical.includes("canonicalizeAssistantOutput") &&
			canonical.includes("sanitizeMermaidFences") &&
			fences.includes("walkMarkdownFences") &&
			fences.includes("clipMarkdownFenceSafe") &&
			markdownTest.includes("diagram owner exact memindah 3 komentar inline") &&
			markdownTest.includes("persen mirip komentar di quote/label/caption byte-identical") &&
			markdownTest.includes("exact inline ; %% dipindah utuh ke own-line") &&
			markdownTest.includes("comment/directive/blank preamble tetap memungkinkan salvage") &&
			toolsTest.includes("write_note v0.1.143 create") &&
			toolsTest.includes("write_note v0.1.143 overwrite") &&
			toolsTest.includes("write_note v0.1.143 append") &&
			chat.includes("canonicalizeAssistantOutput") &&
			quickAsk.includes("canonicalizeAssistantOutput") &&
			main.includes("canonicalizeAssistantOutput") &&
			cron.includes("canonicalizeAssistantOutput") &&
			previewEntry.includes("mermaidExactDoublePreamble") &&
			previewEntry.includes("mermaidCanonical") &&
			previewDriver.includes("h.mermaidExactDoublePreamble") &&
			previewDriver.includes("r.mermaidCanonical") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.144: structural fences · exact Mermaid comments/preamble · canonical chat, Quick Ask, write, and cron boundaries wired");
		} else {
			console.error("✗ v0.1.144 Mermaid canonical/fence coverage regressed");
			failed++;
		}
	}

	return failed;
};
