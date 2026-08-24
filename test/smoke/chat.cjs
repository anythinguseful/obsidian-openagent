/**
 * Smoke guards whose only source input is src/ui/ChatApp.tsx.
 *
 * Moved verbatim from test/smoke.test.cjs (Phase 3, extended in Phase 7).
 * Guard conditions and messages are unchanged; only the enclosing function,
 * one level of indentation, and the repo-root anchor for blocks that shadow
 * read() with a __dirname-relative helper differ.
 *
 * Phase 7 added the remaining 31 chat-subject blocks. They are no longer
 * ChatApp.tsx-only: the cluster also pulls in src/ui/components/*, the
 * composer helpers and the agent modules those guards cross-check, so the
 * headline above describes the cluster, not a single input file.
 *
 * One chat block stayed in the monolith on purpose: the v0.1.x guard that
 * asserts reasoning.tsx has no chain-of-thought/steps/prompt-suggestion
 * siblings uses fs.existsSync to prove those files are ABSENT. It cannot be
 * rewritten as read(), and moving it would hand check-docs guard 1 a literal
 * ROOT path that must never resolve.
 */

const { read, region } = require("./harness.cjs");

// Returns the number of failed guards so the orchestrator can fold it into
// its own counter. Guards keep using the bare `failed++` they were written
// with, so the moved code stays byte-identical apart from indentation.
module.exports = function chatGuards() {
	let failed = 0;

	// v0.1.184 (owner: "tidak ada blok yang menjelaskan sedang compression"):
	// compaction now pushes a visible START banner (system turn) before the
	// summarize call, so the brief ThinkingBar flash is backed by a durable
	// in-transcript block; the END banner ("Context compacted") still follows.
	{
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			chat.includes("pushLocalNoticeTurn(\"Compacting context — folding earlier messages into a rolling summary.\")") &&
			chat.includes("setLiveStatus(\"Compacting context…\")") &&
			chat.includes("pushLocalNoticeTurn(\n\t\t\t\t`Context compacted — ${upto}");
		if (ok) {
			console.log("✓ v0.1.184: compaction — visible start banner + end banner in the transcript");
		} else {
			console.error("✗ v0.1.184 compaction start-banner drifted");
			failed++;
		}
	}

	// v0.1.167 (owner: "arrow key select tidak ikut"): keyboard nav keeps the
	// highlighted row in view via LOCAL scroll (block: nearest), never
	// scrollIntoView (which would also move the transcript).
	{
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			chat.includes("const slashMenuRef = useRef<HTMLDivElement>(null)") &&
			chat.includes('ref={slashMenuRef}') &&
			chat.includes("const active = list.querySelector<HTMLElement>(\".oa-slash-item.is-active\")") &&
			chat.includes("const topDelta = activeRect.top - listRect.top") &&
			chat.includes("const bottomDelta = activeRect.bottom - listRect.bottom") &&
			chat.includes("list.scrollTop += Math.abs(topDelta) < Math.abs(bottomDelta) ? topDelta : bottomDelta") &&
			chat.includes("list.scrollTop = 0") &&
			chat.includes("}, [slashIndex, slashMenu.rows])") &&
			!chat.includes("scrollIntoView");
		if (ok) {
			console.log("✓ v0.1.167: slash keyboard nav scrolls the highlighted row into view (local, block: nearest)");
		} else {
			console.error("✗ v0.1.167 slash keyboard scroll-follow drifted");
			failed++;
		}
	}

	// ---- v0.1.21 — slash medium batch (Hermes Desktop parity): /status,
	// /save, /profile, /approvals + the arg-stage popover (argumentMode).
	{
		const app4 = read("src/ui/ChatApp.tsx");
		const ok =
			app4.includes('case "/status"') && app4.includes('case "/save"') &&
			app4.includes('case "/profile"') && app4.includes('case "/approvals"') &&
			app4.includes("slashMenu") && app4.includes('kind: "opt"') &&
			app4.includes('"active provider catalog"') &&
			app4.includes("openagent/exports") && app4.includes("props.app.vault.create(") &&
			app4.includes("props.applyProfile(hit.id)") &&
			app4.includes("getActiveProfile(settings)") &&
			/* v0.1.168 amended: Platform left the import again — panel is one shell. */
			app4.includes('import { App, Component, MarkdownView, Notice, TFile, normalizePath } from "obsidian"');
		if (ok) {
			console.log("✓ v0.1.21: slash medium batch (/status /save /profile /approvals + arg-stage popover)");
		} else {
			console.error("✗ v0.1.21 slash medium batch drifted (cases, arg-stage, vault save, or applyProfile lost)");
			failed++;
		}
	}

	// ---- v0.1.31 — /moa one-shot sugar (cli.py ~10024: stash, ride the
	// default preset for one turn, restore) + bare /model <preset> implicit
	// pivot (model_switch.py PATH B exact_moa_preset_name, enabled-only,
	// #55187; the "moa:" prefix is never a bare name).
	{
		const app14 = read("src/ui/ChatApp.tsx");
		const ok =
			app14.includes('"/moa"') &&
			app14.includes("moaUsage()") &&
			app14.includes("const moaSettings = JSON.parse(JSON.stringify(settings))") &&
			app14.includes("{ settingsOverride: moaSettings }") &&
			app14.includes("MoA one-shot queued with preset ${preset}; your selected model remains unchanged.") &&
			app14.includes("exactMoaPresetName(settings.moa, arg)") &&
			app14.includes("left the MoA virtual provider");
		if (ok) {
			console.log("✓ v0.1.31+: /moa one-shot uses an immutable per-run override + bare /model pivot (enabled-only)");
		} else {
			console.error("✗ v0.1.31 /moa one-shot or bare /model pivot drifted");
			failed++;
		}
	}

	{
		const chatSrc = read("src/ui/ChatApp.tsx");
		if (
			chatSrc.includes("persistSession(turnsRef.current)") &&
			(chatSrc.match(/[^.A-Za-z]setTurns\(/g) ?? []).length === 1 &&
			chatSrc.includes("disclosureId")
		) {
			console.log("✓ persistence reads live turns ref; disclosures persisted");
		} else {
			console.error("✗ persistence/disclosure wiring drifted in ChatApp.tsx");
			failed++;
		}
	}
	{
		const css = read("styles.css");
		const chat = read("src/ui/ChatApp.tsx");
		const actionBlock = css.match(/\.oa-app \.oa-prompt-action \{[^}]+\}/)?.[0] ?? "";
		const primaryBlock = css.match(/\.oa-app \.oa-prompt-action\.oa-prompt-action-primary \{[^}]+\}/)?.[0] ?? "";
		const primaryHover = css.match(/\.oa-app \.oa-prompt-action\.oa-prompt-action-primary:hover:not\(:disabled\) \{[^}]+\}/)?.[0] ?? "";
		const primaryDisabled = css.match(/\.oa-app \.oa-prompt-action\.oa-prompt-action-primary:disabled \{[^}]+\}/)?.[0] ?? "";
		if (
			actionBlock.includes("width: 26px") &&
			actionBlock.includes("height: 26px") &&
			css.includes(".oa-app .oa-attach-toggle") &&
			chat.includes("<ArrowUpIcon size={16} />") &&
			primaryBlock.includes("var(--interactive-accent)") &&
			primaryBlock.includes("var(--text-on-accent)") &&
			css.includes("oklch(from var(--interactive-accent)") &&
			// 2026-08-02 owner report: hover must KEEP the accent (subtle dim),
			// never re-hue to --interactive-accent-hover (it washed the fill
			// out so the rest-tuned icon vanished)
			primaryHover.includes("background: var(--interactive-accent);") &&
			primaryHover.includes("filter: brightness(") &&
			// match the DECLARATION only — comments may freely name the old var
			!/background:\s*var\(--interactive-accent-hover\)/.test(primaryHover) &&
			// 2026-08-02 v0.1.38 owner report "masih sama saat textarea kosong":
			// the generic `.oa-app button:hover` reset (0,2,1) beat the old
			// single-class base (0,2,0) and punched the DISABLED Send
			// transparent — the select chain is double-class (0,3,x) now, and
			// the disabled face is the official Hermes neutral: fg/30 disc,
			// knocked-out icon, opacity 1, hover inert
			primaryDisabled.includes("opacity: 1") &&
			primaryDisabled.includes("pointer-events: none") &&
			css.includes("color-mix(in srgb, var(--text-normal) 30%")
		) {
			console.log("✓ composer: send 26×26, arrow-up, accent hover dim, disabled = official neutral (fg/30, inert hover)");
		} else {
			console.error("✗ composer send-button spec drifted");
			failed++;
		}
	}
	{
		const loop = read("src/agent/agentLoop.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const sp = read("src/agent/systemPrompt.ts");
		const ok =
			loop.includes("finishReason") &&
			chat.includes("finish_reason: length") &&
			sp.includes("setMinutes(0, 0, 0)");
		if (ok) {
			console.log("✓ finish_reason surfaced to chat + system-prompt Date hour-rounded (prompt cache)");
		} else {
			console.error("✗ finish_reason / cache-friendly-Date wiring drifted");
			failed++;
		}
	}
	{
		const prov = read("src/agent/providers.ts");
		const loop = read("src/agent/agentLoop.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const css = read("styles.css");
		const ok =
			prov.includes("cb.onToolCall?.(existing.id") &&
			loop.includes("onToolCallPending") &&
			loop.includes("events.onIterationStart?.(iterations)") &&
			chat.includes('status: "pending" as const') &&
			chat.includes('setLiveStatus("Waiting for the model…")') &&
			chat.includes("stripPendingTools") &&
			/* v0.1.74: steps.tsx + its pending-icon CSS retired (dead surface);
		   the pending witness lives on in the asserted ChatApp/tool literals */
			css.includes(".oa-tool-badge-processing");
		if (ok) {
			console.log("✓ live tool preview: streamed tool calls surface as pending steps + iteration wait shown");
		} else {
			console.error("✗ live tool preview wiring drifted");
			failed++;
		}
	}
	{
		const prov = read("src/agent/providers.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const panel = read("src/ui/components/session-panel.tsx");
		const css = read("styles.css");
		const main = read("main.js");
		const ok =
			prov.includes("export function deterministicToolCallId(") &&
			prov.includes("deterministicToolCallId(messages.length, idx") &&
			prov.includes("deterministicToolCallId(messages.length, i") &&
			!prov.includes("call_${idx}_${Date.now()}") &&
			chat.includes('name: "/learn"') &&
			chat.includes('case "/learn"') &&
			chat.includes("create_skill") &&
			chat.includes("composerDrafts") &&
			chat.includes("panelHits") &&
			chat.includes("scopedSessions.search(") &&
			chat.includes("<SessionPanel") &&
			panel.includes("oa-panel-row-excerpt") &&
			css.includes(".oa-panel-row-excerpt") &&
			/* v0.1.128 amended: pin identifier `deterministicToolCallId` di
			   bundle dilepas — minify merename; prov sudah meminnya 3× dari
			   src. Yang bertahan di bundle hanyalah literal "/learn". */
			main.includes("/learn");
		if (ok) {
			console.log("✓ hermes parity: deterministic tool ids · /learn · composer drafts · full-text session search");
		} else {
			console.error("✗ hermes-parity batch wiring drifted");
			failed++;
		}
	}
	{
		const tool = read("src/ui/components/tool.tsx");
		const chat = read("src/ui/ChatApp.tsx");
		const css = read("styles.css");
		const ok =
			tool.includes('"input-streaming"') &&
			tool.includes('"input-available"') &&
			tool.includes('"output-available"') &&
			tool.includes('"output-error"') &&
			tool.includes("Processing") &&
			tool.includes("Call ID: ") &&
			tool.includes("export function Tool(") &&
			chat.includes('from "./components/tool"') &&
			!chat.includes('from "./components/steps"') &&
			chat.includes("oa-tools-list") &&
			chat.includes("toToolPart(") &&
			css.includes(".oa-tools-list") &&
			css.includes(".oa-tool-badge-processing");
		if (ok) {
			console.log("✓ tool calls: faithful prompt-kit Tool cards (v5 states, per-invocation)");
		} else {
			console.error("✗ tool-card fidelity drifted (Steps crept back into tool rendering?)");
			failed++;
		}
	}
	{
		const pi = read("src/ui/components/prompt-input.tsx");
		const fu = read("src/ui/components/file-upload.tsx");
		const cb = read("src/ui/components/code-block.tsx");
		const msg = read("src/ui/components/message.tsx");
		const ts = read("src/ui/components/text-shimmer.tsx");
		const loader = read("src/ui/components/loader.tsx");
		const css = read("styles.css");
		const variants = [
			"circular", "classic", "pulse", "pulse-dot", "dots", "typing",
			"wave", "bars", "terminal", "text-blink", "text-shimmer", "loading-dots",
		];
		const ok =
			pi.includes("isLoading?: boolean") &&
			pi.includes("maxHeight?: number | string") &&
			pi.includes("aria-busy") &&
			pi.includes("is-loading") &&
			fu.includes("export function acceptOk(") &&
			fu.includes("accept={accept}") &&
			fu.includes("type not accepted") &&
			cb.includes("export function CodeBlockGroup(") &&
			cb.includes("export function CodeBlockCode(") &&
			cb.includes("data-language") &&
			/* v0.1.74: MessageContent export retired (dead surface — callers use
			   MarkdownDoc directly); live exports pinned instead */
			msg.includes("export function Message({") &&
			msg.includes("export function MessageActions(") &&
			ts.includes("duration = 4") &&
			ts.includes("spread = 20") &&
			ts.includes('as?: "span" | "p" | "div"') &&
			ts.includes("--shimmer-spread") &&
			variants.every((v) => loader.includes(`"${v}"`) || loader.includes(`case "${v}"`)) &&
			loader.includes("oa-loader-${size}") &&
			css.includes(".oa-loader-pulse-dot-core") &&
			css.includes(".oa-loader-bars span") &&
			css.includes(".oa-loader-terminal-block") &&
			css.includes(".oa-loader-text-blink") &&
			css.includes(".oa-loader-loading-dot") &&
			css.includes(".oa-loader-classic") &&
			css.includes(".oa-loader-dots span") &&
			css.includes(".oa-loader-lg") &&
			css.includes("var(--shimmer-spread, 20%)");
		if (ok) {
			console.log(
				"✓ prompt-kit palette aligned: PromptInput isLoading/maxHeight · FileUpload accept · CodeBlock parts · Message markdown · TextShimmer defaults · Loader 12 variants+sizes"
			);
		} else {
			console.error("✗ prompt-kit palette alignment drifted");
			failed++;
		}
	}
	{
		const mpp = read("src/ui/markdown-preprocess.ts");
		const md = read("src/ui/components/markdown.tsx");
		const tool = read("src/ui/components/tool.tsx");
		const chat = read("src/ui/ChatApp.tsx");
		const icons = read("src/ui/icons.tsx");
		const css = read("styles.css");
		const ok =
			mpp.includes("export function preprocessAIResponse(") &&
			mpp.includes("export function resolveVaultImages(") &&
			mpp.includes("dataviewjs") &&
			md.includes("preprocessAIResponse(") &&
			md.includes("resolveVaultImages(") &&
			tool.includes("MAX_DISPLAY_CHARS") &&
			tool.includes("preserved in history") &&
			chat.includes("insertIntoNote") &&
			chat.includes("editAndResend") &&
			chat.includes("oa-msg-editbox") &&
			chat.includes("Insert at cursor") &&
			chat.includes("Regenerate") &&
			icons.includes('"text-cursor-input"') &&
			icons.includes('"pencil"') &&
			css.includes(".oa-msg-editbox") &&
			css.includes(".oa-tool-cap-note") &&
			css.includes(".oa-msg-user .oa-msg-actions");
		if (ok) {
			console.log(
				"✓ copilot parity: markdown preprocess (safety/LaTeX/vault images) · insert / edit+resend / regenerate · tool display cap"
			);
		} else {
			console.error("✗ copilot-parity wiring drifted");
			failed++;
		}
	}
	{
		const ses = read("src/agent/sessions.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const panel = read("src/ui/components/session-panel.tsx");
		const css = read("styles.css");
		const ok =
			ses.includes("async rename(id: string, title: string)") &&
			ses.includes("s.title = title;") &&
			ses.includes("await this.save(s);") &&
			chat.includes('import { SessionPanel } from "./components/session-panel"') &&
			chat.includes("const renameSession = useCallback") &&
			chat.includes("scopedSessions.rename(id, next)") &&
			chat.includes("sessionTitleRef.current = next") &&
			chat.includes("onRename={renameSession}") &&
			panel.includes("const [renamingId, setRenamingId]") &&
			panel.includes("const commitRename = useCallback") &&
			panel.includes('aria-label="Rename chat"') &&
			panel.includes('className="oa-panel-row-rename-input"') &&
			panel.includes('if (event.key === "Enter") void commitRename()') &&
			panel.includes('else if (event.key === "Escape")') &&
			!/^import .*SessionStore/m.test(panel) &&
			!/^import .*AgentLoop/m.test(panel) &&
			css.includes(".oa-panel-row-rename-input {") &&
			css.includes(".oa-panel-row-rename-input:focus") &&
			css.includes(".oa-panel-row-rename:hover");
		if (ok) {
			console.log("✓ v0.1.158: inline session rename — isolated panel UI, durable ChatApp store callback, Enter/Escape");
		} else {
			console.error("✗ v0.1.158 inline session rename drifted");
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		const css = read("styles.css");
		const ok =
			chat.includes("const [contextWindow, setContextWindow]") &&
			chat.includes("fetchAdvertisedContextLength(provider, model)") &&
			chat.includes("resolveContextWindow(settings.modelContextLength, advertised)") &&
			chat.includes('className={`oa-statusbar-item oa-token-tag${over ? " is-over" : ""}`}') &&
			chat.includes('className="oa-token-tag-text"') &&
			chat.includes('className="oa-token-bar"') &&
			chat.includes('className="oa-token-bar-fill"') &&
			chat.includes("Math.min(100, pct as number)") &&
			/* v0.1.174: % + overload compare the LAST request's input, not the
			   cumulative session total (owner: "1772% … over budget" false alarm) */
			chat.includes("const lastIn = usage ? usage.promptTokens : null") &&
			chat.includes("over = windowKnown && lastIn !== null && lastIn > (contextWindow as number)") &&
			css.includes(".oa-app .oa-statusbar .oa-token-tag {") &&
			css.includes(".oa-app .oa-token-bar {") &&
			css.includes(".oa-app .oa-token-bar-fill {") &&
			css.includes(".oa-token-tag.is-over .oa-token-bar-fill") &&
			css.includes("var(--color-red, #e93147)");
		if (ok) {
			console.log("✓ v0.1.159: token pill — context-window bar + % (last-request based), red on overload, no guess when window unknown");
		} else {
			console.error("✗ v0.1.159 token pill drifted");
			failed++;
		}
	}
	{
		const eng = read("src/agent/memoryEngine.ts");
		const run = read("src/agent/runner.ts");
		const sp = read("src/agent/systemPrompt.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			eng.includes("export function consolidationDue") &&
			eng.includes("export function buildReflectPrompt") &&
			eng.includes("export function parseReflectOps") &&
			eng.includes("export function applyReflectOps") &&
			eng.includes("export function buildMentalModelBlock") &&
			eng.includes("MENTAL_MODEL_QUESTIONS") &&
			eng.includes("async reflect(") &&
			eng.includes("async mentalModelsBlock(") &&
			eng.includes("observations.jsonl") &&
			eng.includes("models.jsonl") &&
			eng.includes("meta.json") &&
			run.includes("stores.engine.mentalModelsBlock()") &&
			sp.includes("mentalModelBlock?: string | null") &&
			sp.includes("p.mentalModelBlock") &&
			chat.includes("await engine.reflect(");
		if (ok) {
			console.log("✓ v0.1.177: reflect — observations + mental models, evidence+proofs, cadence-gated, read-cheap settled knowledge");
		} else {
			console.error("✗ v0.1.177 reflect/mental-models drifted");
			failed++;
		}
	}
	{
		const undo = read("src/ui/composer/undo.ts");
		const hist = read("src/ui/composer/history.ts");
		const pi = read("src/ui/components/prompt-input.tsx");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			undo.includes("export function createComposerUndoHistory") &&
			undo.includes("isUndoShortcut") &&
			undo.includes("isRedoShortcut") &&
			undo.includes("COALESCE_WINDOW_MS = 600") &&
			hist.includes("export function deriveUserHistory") &&
			hist.includes("export class ComposerHistoryBrowse") &&
			hist.includes("browseBackward") &&
			hist.includes("browseForward") &&
			pi.includes("createComposerUndoHistory") &&
			pi.includes("onBeforeInput") &&
			pi.includes("isUndoShortcut(e)") &&
			pi.includes("isRedoShortcut(e)") &&
			pi.includes("resetUndo: () => undoRef.current.reset()") &&
			chat.includes("historyBrowseRef") &&
			chat.includes("deriveUserHistory(turns, turnTextOf)") &&
			chat.includes("stepQueueEdit(-1)") &&
			chat.includes("browseBackward(input, history)") &&
			chat.includes("browseForward(history)") &&
			chat.includes('if (e.key === "Escape" && running)') &&
			chat.includes("historyBrowseRef.current.reset()");
		if (ok) {
			console.log("✓ v0.1.180: composer textarea parity — ↑/↓ history browse + own undo/redo + Escape halt");
		} else {
			console.error("✗ v0.1.180 composer input-history/undo drifted");
			failed++;
		}
	}
	{
		const sc = read("src/ui/settings-controls.ts");
		const css = read("styles.css");
		const ok =
			sc.includes('numwrap.className = "oa-slideinput-numwrap"') &&
			sc.includes('numwrap.classList.add("has-unit")') &&
			sc.includes("numwrap.appendChild(unit)") &&
			sc.includes("el.appendChild(numwrap)") &&
			css.includes(".oa-slideinput .oa-slideinput-numwrap {") &&
			css.includes("numwrap.has-unit input") &&
			css.includes("pointer-events: none;");
		if (ok) {
			console.log("✓ v0.1.189: % unit renders inside the number field (seamless numwrap suffix)");
		} else {
			console.error("✗ v0.1.189 seamless %-unit structure drifted");
			failed++;
		}
	}
	{
		const sb = read("src/ui/components/scroll-button.tsx");
		const cc = read("src/ui/components/chat-container.tsx");
		const css = read("styles.css");
		const ok =
			sb.includes("badge = false") &&
			sb.includes('className="oa-scroll-button-dot"') &&
			sb.includes('aria-label={badge ? "Scroll to bottom — new messages" : "Scroll to bottom"}') &&
			cc.includes("const [newBelow, setNewBelow] = useState(false)") &&
			cc.includes("const onContentGrow = useCallback") &&
			cc.includes("else setNewBelow(true)") &&
			cc.includes("if (near) setNewBelow(false)") &&
			cc.includes("badge={newBelow}") &&
			cc.includes("setNewBelow(false);") &&
			cc.includes("scrollToBottom(true);") &&
			css.includes(".oa-app .oa-scroll-button-dot {") &&
			css.includes("box-shadow: 0 0 0 2px var(--background-primary)");
		if (ok) {
			console.log("✓ v0.1.160: scroll button unread dot — new-below marks while scrolled up, clears at bottom");
		} else {
			console.error("✗ v0.1.160 scroll button unread dot drifted");
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		const icons = read("src/ui/icons.tsx");
		const css = read("styles.css");
		const ok =
			icons.includes('TerminalIcon = make("terminal")') &&
			chat.includes("const [slashIndex, setSlashIndex] = useState(0)") &&
			chat.includes("const acceptSlashRow = useCallback") &&
			chat.includes('type SlashRowKind = "command" | "skill" | "snippet"') &&
			chat.includes('rowKind: "command" as SlashRowKind') &&
			chat.includes('rowKind: "skill" as SlashRowKind') &&
			chat.includes('rowKind: "snippet" as SlashRowKind') &&
			chat.includes('className="oa-overlay oa-slash-overlay"') &&
			chat.includes('className={`oa-slash-item-icon oa-slash-kind-${r.rowKind}`}') &&
			chat.includes('className="oa-slash-item-name"') &&
			chat.includes('className="oa-slash-item-desc"') &&
			chat.includes("onMouseEnter={() => setSlashIndex(i)}") &&
			chat.includes("aria-selected={i === slashIndex}") &&
			chat.includes("if (slashMenu.rows.length > 0) {") &&
			chat.includes("setSlashIndex((i) => (i + 1) % slashMenu.rows.length)") &&
			chat.includes("acceptSlashRow(row as { name?: string; value?: string; fill?: string })") &&
			css.includes(".oa-app .oa-slash-overlay .oa-slash-menu {") &&
			css.includes("width: 100%;") &&
			css.includes("max-width: 820px; /* keep in lockstep with .oa-prompt-input max-width */") &&
			css.includes("margin: 0 auto;") &&
			css.includes(".oa-app .oa-slash-item-icon {") &&
			css.includes(".oa-app .oa-slash-kind-command { color: var(--interactive-accent); }") &&
			css.includes(".oa-app .oa-slash-kind-skill { color: var(--color-orange, #ec7500); }") &&
			css.includes(".oa-app .oa-slash-kind-snippet { color: var(--color-cyan, #00bfbc); }") &&
			css.includes(".oa-app .oa-slash-item-name {") &&
			css.includes("flex: 0 0 auto;") &&
			css.includes(".oa-app .oa-slash-item span.oa-slash-item-name") &&
			css.includes(".oa-app .oa-slash-item-desc {") &&
			/* v0.1.166: every item shows — no slice caps on any slash group */
			!chat.includes(".slice(0, 6)") &&
			!chat.includes(".slice(0, 4)") &&
			chat.includes("SLASH_COMMANDS.filter((c) => c.name.startsWith(input))\n\t\t\t.map((c) =>") &&
			/* group headers: Hermes spacing, hairline separator retired —
			   check the block itself, not a file-wide scan */
			!region(css, ".oa-app .oa-slash-hdr {", "\n}\n", { label: "slash-hdr" }).includes("border-top:");
		if (ok) {
			console.log("✓ v0.1.166: slash overlay — composer-width drawer, all items listed, name fully visible, keyboard highlight");
		} else {
			console.error("✗ v0.1.166 slash overlay parity drifted");
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		const panel = read("src/ui/components/session-panel.tsx");
		const css = read("styles.css");
		const ok =
			chat.includes("<SessionPanel") &&
			!chat.includes("oa-panel-backdrop") &&
			panel.includes('className="oa-overlay oa-panel-overlay"') &&
			panel.includes("ref={panelRef}") &&
			chat.includes("panelToggleRef") &&
			css.includes(".oa-app .oa-panel {") &&
			css.includes("max-width: 820px") &&
			css.includes("background: var(--background-primary)") &&
			css.includes("border-radius: var(--radius-l, 12px)") &&
			css.includes("overflow: hidden;") &&
			css.includes(".oa-app .oa-panel-list {") &&
			css.includes("flex: 1 1 auto") &&
			css.includes("max-height: min(22rem, calc(100vh - 10rem))") &&
			!css.includes(".oa-panel-backdrop") &&
			!css.includes("oa-panel-up");
		if (ok) {
			console.log("✓ v0.1.168: sessions panel — slash-menu-style popover (no backdrop, above composer, scrolling list)");
		} else {
			console.error("✗ v0.1.168 panel popover drifted");
			failed++;
		}
	}
	{
		const app3 = read("src/ui/ChatApp.tsx");
		const bi = read("src/buildInfo.ts");
		const escfg = read("esbuild.config.mjs");
		const ok =
			app3.includes("SLASH_ALIASES") &&
			app3.includes('case "/title"') && app3.includes('case "/version"') &&
			app3.includes('case "/queue"') && app3.includes('case "/resume"') &&
			app3.includes("cmdToken.toLowerCase()") &&
			app3.includes("/^\\/(queue|q)(?:\\s+(.*))?$/is") && // busy: arg queued, never the token
			app3.includes("setPanelFilter(arg)") && app3.includes("setPanelOpen(true)") &&
			bi.includes("PLUGIN_VERSION") && escfg.includes("__OA_VERSION__");
		if (ok) {
			console.log("✓ v0.1.20: slash quick batch (/title /version /queue /resume + alias map, busy-strip guarded)");
		} else {
			console.error("✗ v0.1.20 slash batch drifted (cases, alias map, busy-strip, or version define lost)");
			failed++;
		}
	}
	{
		const app5 = read("src/ui/ChatApp.tsx");
		const css5 = read("styles.css");
		const ok =
			app5.includes("skillContextRef") &&
			app5.includes('[Skill: ${skill.name}]') &&
			app5.includes("/skills read|use <name>") &&
			app5.includes('aliases: ["/skill", "/search", "/use"]') &&
			app5.includes("slashSkills") &&
			app5.includes('group: "Skills"') &&
			app5.includes("oa-slash-hdr") &&
			app5.includes("fill: `/skills use ${s.name} `") &&
			/* v0.1.78: the fallback text is now promptText (token-cleaned) —
			   displayText STILL wins when set, the precedence this guard
			   protects; the new v0.1.78 block pins the replacement line */
			app5.includes("displayText ?? promptText") &&
			app5.includes("skillPrefix + notePrefix + composePrompt(false)") &&
			css5.includes(".oa-slash-hdr");
		if (ok) {
			console.log("✓ v0.1.22: skills → slash palette (group headers, verb staging, one-shot skill context, disabled-read wins)");
		} else {
			console.error("✗ v0.1.22 skills-palette drifted (context ref, groups, aliases, or one-shot injection lost)");
			failed++;
		}
	}
	{
		const app6 = read("src/ui/ChatApp.tsx");
		const ses6 = read("src/agent/sessions.ts");
		const ok =
			app6.includes('case "/branch"') &&
			app6.includes('aliases: ["/fork"]') &&
			app6.includes("branchConversation") &&
			app6.includes("sessionParentRef") &&
			app6.includes("parent === parentId") &&
			app6.includes("— Branch ${siblings + 1}") &&
			app6.includes('parent: parentId') &&
			ses6.includes("parent?: string");
		if (ok) {
			console.log("✓ v0.1.23: /branch chat fork (lineage title, parent link, byte-stable parent, aliases)");
		} else {
			console.error("✗ v0.1.23 branch drifted (case, lineage, parent ref, or session type lost)");
			failed++;
		}
	}
	{
		const app7 = read("src/ui/ChatApp.tsx");
		const pi7 = read("src/ui/components/prompt-input.tsx");
		const ch7 = read("src/ui/composer/chips.ts");
		const css7 = read("styles.css");
		const ok =
			ch7.includes("SLASH_COMMAND_RE") &&
			ch7.includes("slashChipMatches") &&
			ch7.includes("trailingCommitted") &&
			ch7.includes("boundaryBefore") &&
			pi7.includes("contentEditable") &&
			pi7.includes("oa-chip") &&
			pi7.includes("serializeComposer") &&
			app7.includes("chipResolver") &&
			app7.includes("ChipText") &&
			app7.includes("skillSlug") &&
			app7.includes('runAgent(arg, undefined, raw)') &&
			app7.includes('args: "[focus]"') &&
			app7.includes('args: "<name>"') &&
			css7.includes(".oa-chip");
		if (ok) {
			console.log("✓ v0.1.24: slash chips (contenteditable, atomic pills, hydration, skill dispatch, transcript pills)");
		} else {
			console.error("✗ v0.1.24 chips drifted (scan rules, editor, resolver, or transcript pills lost)");
			failed++;
		}
	}
	{
		const steer9 = read("src/agent/steer.ts");
		const loop9 = read("src/agent/agentLoop.ts");
		const app9 = read("src/ui/ChatApp.tsx");
		const tool9 = read("src/ui/components/tool.tsx");
		const sys9 = read("src/agent/systemPrompt.ts");
		const css9 = read("styles.css");
		const ok =
			steer9.includes('[OUT-OF-BAND USER MESSAGE — a direct message from the user, delivered mid-turn; not tool output]') &&
			steer9.includes("[/OUT-OF-BAND USER MESSAGE]") &&
			steer9.includes("formatSteerMarker") &&
			steer9.includes("splitSteerMarkers") &&
			steer9.includes("STEER_CHANNEL_NOTE") &&
			loop9.includes("steer(text: string): boolean") &&
			loop9.includes("drainSteer") &&
			loop9.includes("formatSteerMarker(steerText)") &&
			loop9.includes("pendingSteer: aborted") &&
			loop9.includes("onSteerApplied") &&
			app9.includes('case "/steer"') &&
			app9.includes("loopRef.current = loop") &&
			app9.includes("applySteerMarker") &&
			app9.includes("/^\\/steer(?:\\s|$)/i") &&
			app9.includes("result.pendingSteer") &&
			app9.includes("Delivering leftover /steer as next turn") &&
			app9.includes("Steer queued") &&
			tool9.includes("splitSteerMarkers") &&
			tool9.includes("oa-steer-note") &&
			sys9.includes("STEER_CHANNEL_NOTE") &&
			css9.includes(".oa-steer-note");
		if (ok) {
			console.log("✓ v0.1.26: /steer mid-turn injection (marker, drain, busy dispatch, leftover, trust channel)");
		} else {
			console.error("✗ v0.1.26 steer drifted (marker, drain, dispatch, leftover, or render lost)");
			failed++;
		}
	}
	{
		const loop = read("src/agent/moaLoop.ts");
		const agent = read("src/agent/agentLoop.ts");
		const app13 = read("src/ui/ChatApp.tsx");
		const pick = read("src/ui/components/model-picker.tsx");
		const ok =
			loop.includes("MOA_REFERENCE_SYSTEM_PROMPT") &&
			loop.includes("MOA_REFERENCE_TOOL_RESULT_BUDGET = 4000") &&
			loop.includes("[Mixture of Agents reference context]") &&
			loop.includes("Use the reference responses below as private context. You are the aggregator and acting model") &&
			loop.includes("[Reference models unavailable: ") &&
			loop.includes("[skipped: interrupted by user]") &&
			loop.includes("moaCadenceDecision") &&
			loop.includes("attachMoaGuidance") &&
			agent.includes("MoaTurnEngine") &&
			agent.includes("prepareIteration(callWire)") &&
			app13.includes("MoaTurnEngine") &&
			app13.includes("moaEmit") &&
			app13.includes("◇ MoA aggregating…") &&
			app13.includes("setActiveMoaPreset") &&
			/* v0.1.32: the virtual-provider surface moved to the official
			   shell.modelMenu names — "MoA presets" section + search alias,
			   picker names wired from ChatApp */
			pick.includes("MoA presets") &&
			pick.includes("moaPresetMatches") &&
			app13.includes("moaPickerNames");
		if (ok) {
			console.log("✓ v0.1.30: MoA runtime parity (advisor view + guidance + cadence) + picker virtual provider + facade hook");
		} else {
			console.error("✗ v0.1.30 MoA runtime drifted (engine/hook/picker lost)");
			failed++;
		}
	}
	{
		const intro19 = read("src/ui/components/intro.tsx");
		const jsonlCount = (intro19.match(/"personality":"/g) ?? []).length;
		const ok =
			jsonlCount === 75 &&
			intro19.includes("INTRO_COPY_BY_PERSONALITY") &&
			intro19.includes("const personalities:") === false && // no homemade pool
			intro19.includes('INTRO_COPY_BY_PERSONALITY[personalityKey] || fallbackCopyForPersonality(personalityKey)') &&
			intro19.includes("Math.floor(Math.random() * 100000)") &&
			intro19.includes("neutralCopy()") &&
			intro19.includes('"personality":"noir"') && // verbatim spot checks
			intro19.includes('"personality":"hype"') &&
			intro19.includes('"headline":"Hermes Agent is ready."') &&
			intro19.includes("introBodyPool");
		if (ok) {
			console.log("✓ v0.1.36: intro copy = official jsonl verbatim (75/15), jsonl-pool-first selection, mount+draft rotation");
		} else {
			console.error("✗ v0.1.36 intro-copy fidelity drifted (pool replaced or selection rule lost)");
			failed++;
		}
	}
	{
		const css = read("styles.css");
		const msg = read("src/ui/components/message.tsx");
		const tableBase = css.match(/\.oa-app \.oa-markdown table \{[^}]+\}/)?.[0] ?? "";
		const tableRows = css.match(/\.oa-app \.oa-markdown table th,\s*\.oa-app \.oa-markdown table td \{[^}]+\}/)?.[0] ?? "";
		const hrBlock = css.match(/\.oa-app \.oa-markdown hr \{[^}]+\}/)?.[0] ?? "";
		if (
			!msg.includes("oa-msg-avatar") &&
			// DECLARATION-level check only (lesson 36): the retirement note in
			// the file header legitimately names the component — comments may
			// freely name it; code may not declare or render it
			!/export function MessageAvatar|<MessageAvatar/.test(msg) &&
			!css.includes(".oa-msg-avatar") &&
			tableBase.includes("border-collapse: separate") &&
			tableBase.includes("border-radius") &&
			tableRows.includes("border-bottom: 1px solid") &&
			!tableRows.includes("border: 1px solid") &&
			css.includes("table tbody tr:last-child > td") &&
			css.includes("table thead th") &&
			hrBlock.includes("height: 0") &&
			!hrBlock.includes("border-top") &&
			css.includes("--p-spacing: 0.55rem")
		) {
			console.log("✓ chat blocks polished: no turn avatars, table card (row lines + muted header), quiet hr, tight rhythm");
		} else {
			console.error("✗ chat-block polish spec drifted");
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		if (
			chat.includes('"Thought"') &&
			chat.includes('"Thought briefly"') &&
			chat.includes("`Thought for ${") &&
			chat.includes('.padStart(2, "0")') &&
			// the double-label anti-pattern: a meta side-note that itself names
			// the word ("meta={…Thought") — DECLARATION-level match (lesson 36)
			!/ReasoningTrigger\s+meta=\{[^\n]*Thought/.test(chat)
		) {
			console.log("✓ reasoning trigger: single finished label (Thought / briefly / for Ns), no title+meta double");
		} else {
			console.error("✗ reasoning trigger label spec drifted");
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		const types = read("src/types.ts");
		if (
			chat.includes('const TAPBACK_FEEDBACK: FeedbackValue = "up";') &&
			chat.includes("TAPBACK_EXCLUDE") &&
			chat.includes("ev.detail !== 2") &&
			/const toggleFeedback = useCallback/.test(chat) &&
			chat.includes("feedbackOf") &&
			types.includes("reaction?: string") &&
			!/const QUICK_REACTIONS = /.test(chat) &&
			!/function ReactionControl\(/.test(chat) &&
			!/const \[reactOpenFor/.test(chat)
		) {
			console.log("✓ tapback→feedback: emoji row retired, dblclick survives (taps up), session persistence kept");
		} else {
			console.error("✗ feedback-supersede spec drifted");
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		const types = read("src/types.ts");
		if (
			chat.includes('const TAPBACK_FEEDBACK: FeedbackValue = "up";') &&
			chat.includes("ev.detail !== 2") &&
			/const toggleFeedback = useCallback/.test(chat) &&
			/const dismissFeedback = useCallback/.test(chat) &&
			chat.includes("showFeedbackBar") &&
			types.includes("reaction?: string") &&
			types.includes("feedbackDismissed?: boolean") &&
			!/function MessageFeedback\(/.test(chat)
		) {
			console.log("✓ feedback eras: pair superseded by banner, rating+dismissal persist, dblclick kept");
		} else {
			console.error("✗ feedback-supersede spec drifted");
			failed++;
		}
	}
	{
		const chat = read("src/ui/components/chat-container.tsx");
		const pin = read("src/ui/components/prompt-input.tsx");
		const ok =
			chat.includes("new ResizeObserver(") &&
			chat.includes('role="log"') &&
			pin.includes("isComposing") &&
			pin.includes("onCompositionEnd");
		if (ok) {
			console.log("✓ v0.1.72: resize-observer stick-to-bottom + IME composition guards wired");
		} else {
			console.error("✗ v0.1.72 prompt-kit audit fixes drifted (RO/role or IME guard lost)");
			failed++;
		}
	}
	{
		const pin = read("src/ui/components/prompt-input.tsx");
		const sb = read("src/ui/components/scroll-button.tsx");
		const css = read("styles.css");
		const app = read("src/ui/ChatApp.tsx");
		const ok =
			pin.includes('closest("button")') &&
			sb.includes("is-hidden") &&
			css.includes(".oa-app .oa-scroll-button.is-hidden {") &&
			css.includes("transition: opacity 150ms ease, transform 150ms ease;") &&
			css.includes("calc(50% - var(--shimmer-spread, 20%))") &&
			css.includes("calc(50% + var(--shimmer-spread, 20%))") &&
			!css.includes("(var(--shimmer-spread, 20%) / 2)") &&
			pin.includes("setCaret(") && !pin.includes("setSelectionRange") &&
			app.includes("setCaret(") && !app.includes("setSelectionRange");
		if (ok) {
			console.log("✓ v0.1.73: frame-focus + mounted scroll-button + faithful shimmer + honest caret API");
		} else {
			console.error("✗ v0.1.73 prompt-kit audit polish drifted");
			failed++;
		}
	}
	{
		const pre125 = read("src/ui/markdown-preprocess.ts");
		const tools125 = read("src/agent/tools.ts");
		const mtest125 = read("test/markdown.test.cjs");
		const ttest125 = read("test/tools.test.cjs");
		const ok =
			/:::/.test(pre125) &&
			pre125.includes("${id}[${inner.trim()}]:::${cls}") &&
			tools125.includes("const planned = planWrite(args, path, original)") &&
			tools125.includes('import { planEdit, planWrite } from "./writePreview";') &&
			mtest125.includes("class-sebelum + kurung → class-sesudah + terkutip") &&
			ttest125.includes("write_note sanitize fence mermaid saat create") &&
			ttest125.includes("raw 'PS' crash shape tidak lolos ke vault") &&
			read("manifest.json").includes('"version": "0.1.153"');
		if (ok) {
			console.log("✓ v0.1.125: write_note mensanitasi fence mermaid (note agent tampil di editor) · class-::: direorder · saksi unit tools+markdown menjaga");
		} else {
			console.error("✗ v0.1.125 write_note mermaid sanitize / ::: reorder regressed");
			failed++;
		}
	}
	{
		const ic = read("src/ui/icons.tsx");
		const goals = read("src/agent/goals.ts");
		/* v0.1.165 amended: TerminalIcon is live again (slash-popover command
		   rows, Hermes codicon 'terminal' parity) — removed from the dead set.
		   v0.1.169 amended: SidebarIcon (panel-left) retired with the topbar
		   toggle glyph swap; RotateCcwIcon (make("history")) is live there. */
		const gone = ["BotIcon", "UserIcon", "WrenchIcon", "HistoryIcon", "ClockIcon", "PaletteIcon", "PaperclipIcon", "AtSignIcon", "SidebarIcon"];
		const ok =
			gone.every((name) => !ic.includes("export const " + name)) &&
			ic.includes("export const TerminalIcon = make(\"terminal\")") && // live: slash rows
			ic.includes('export const BrainIcon = make("brain")') && // v0.1.176: live again (structured-memory indicator)
			ic.includes('export const RotateCcwIcon = make("history")') && // live: topbar toggle (pre-rename name Obsidian bundles)
			ic.length < 4500 && // file 63 baris ~3k-an; regresi tambahan ikon mati terdeteksi
			!goals.includes("GOAL_JUDGE_SNIPPET_CHARS") &&
			goals.includes("GOAL_MAX_TURNS") && // saudara hidup tak ikut terhapus
			read("manifest.json").includes('"version": "0.1.153"');
		if (ok) {
			console.log("✓ v0.1.129: ikon mati + konstanta goals yatim dibersihkan · BrainIcon park · RotateCcw live (SidebarIcon pensiun) · sibling hidup utuh");
		} else {
			console.error("✗ v0.1.129 dead-export cleanup regressed");
			failed++;
		}
	}
	return failed;
};
