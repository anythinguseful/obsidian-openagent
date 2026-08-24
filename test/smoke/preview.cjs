/**
 * Smoke guards whose subject is the real-preview harness.
 *
 * Moved from test/smoke.test.cjs in Phase 10 of the smoke/harness split.
 * Guard conditions and messages are unchanged; only the enclosing function,
 * one level of indentation, and the path anchor differ.
 *
 * This is the cluster with the heaviest anchor mixing: 24 of the 55 blocks
 * referenced BOTH the repo root ("../styles.css") and test/ ("real-preview/
 * build.mjs") in the same block, because __dirname was test/ in the monolith.
 * Every path was re-anchored against the harness read(), which is repo-root
 * based, and each one verified to resolve -- see Lesson 185.
 *
 * Two deliberate exceptions to "every path must exist":
 *   - read("src/ui/attach/pdf-worker.d.ts") sits inside a try/catch and the
 *     guard asserts `dtsGone`, i.e. it requires that file to be ABSENT. It is
 *     safe here because it is a read() call, not a literal ROOT path, so
 *     check-docs guard 1 does not demand it resolve.
 *   - the local t() probe keeps fs.existsSync, re-anchored to
 *     path.join(ROOT, "test", p), since it tests for presence of the
 *     preview harness files themselves.
 */

const { ROOT, read, region, regionFrom, fs, path } = require("./harness.cjs");

// Returns the number of failed guards so the orchestrator can fold it into
// its own counter. Guards keep using the bare `failed++` they were written
// with, so the moved code stays byte-identical apart from indentation.
module.exports = function previewGuards() {
	let failed = 0;

	{
		const t = (p) => fs.existsSync(path.join(ROOT, "test", p));
		const harness =
			t("real-preview/obsidian-shim.ts") &&
			t("real-preview/chat-entry.tsx") &&
			t("real-preview/build.mjs") &&
			read("test/real-preview/chat-entry.tsx").includes("stopTerminalSession: async () => 0") &&
			/* v0.1.171: the runnerMock must stay contract-complete with the
			   real AgentRunner — getToolsWithMcp went missing and silently
			   errored every agent run in the sim (root cause of the parked
			   title/slash2/slash3/md "drift" cluster). It must delegate to
			   getTools() at call time (scenario lanes override getTools). */
			read("test/real-preview/chat-entry.tsx").includes("getToolsWithMcp: async function ()") &&
			read("test/real-preview/chat-entry.tsx").includes("return this.getTools();") &&
			/* v0.1.176: engineForPolicy joined the mock contract (structured memory) */
			read("test/real-preview/chat-entry.tsx").includes("engineForPolicy: () => (") &&
			/* v0.1.177: reflect + mentalModelsBlock joined the engine stub */
			read("test/real-preview/chat-entry.tsx").includes("reflect: async () => null") &&
			read("test/real-preview/chat-entry.tsx").includes("mentalModelsBlock: async () => null");
		const preview = read("test/preview-frames.source.html");
		const build = read("test/build-preview.mjs");
		const marked =
			preview.includes('data-real="convo"') &&
			preview.includes('data-real="panel"') &&
			(preview.match(/<!-- badge:[a-z]+ -->/g) ?? []).length >= 2 &&
			(preview.match(/<!-- \/view -->/g) ?? []).length >= 2;
		const injector =
			build.includes("data-real") &&
			build.includes("frames.json") &&
			build.includes("buildRealFrames") &&
			build.includes("contain: initial !important");
		/* the old name (test/preview.html) invited opening it directly — it is
		   source material with no plugin CSS, so it renders unstyled. Renamed
		   to *.source.html + guarded so the bait name never returns. */
		const renamed = !t("preview.html") && t("preview-frames.source.html");
		/* self-healing: browser cache wipes between sessions must not silently
		   drop previews back to static — build.mjs installs the headless shell
		   and retries once when the executable is missing */
		const rp = read("test/real-preview/build.mjs");
		const heal =
			rp.includes("launchBrowser") &&
			rp.includes('"install"') &&
			rp.includes("chromium-headless-shell") &&
			rp.includes("Executable doesn't exist");
		if (harness && marked && injector && renamed && heal) {
			console.log("✓ real-preview harness wired (shim + entry + injection + scroll fix + browser self-heal)");
		} else {
			console.error(
				`✗ real-preview harness drifted (harness:${harness} marked:${marked} injector:${injector} renamed:${renamed} heal:${heal})`
			);
			failed++;
		}
	}
	{
		const bs = read("test/real-preview/build-settings.mjs");
		const rel = read("scripts/release.mjs");
		const witnessPolicy =
			bs.includes("planSettingsWitnessUpdate") &&
			bs.includes('process.env.OA_RELEASE_WITNESS') &&
			bs.includes('"readonly"') &&
			bs.includes('out", "settings-audit-probes.json');
		const releaseWiring =
			rel.includes('OA_RELEASE_WITNESS: "readonly"') &&
			rel.includes("assertTrackedTreeClean(root)");
		if (witnessPolicy && releaseWiring) {
			console.log("✓ release witness policy wired (readonly release runs never dirty the tracked tree)");
		} else {
			console.error(`✗ release witness policy drifted (witnessPolicy:${witnessPolicy} releaseWiring:${releaseWiring})`);
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const shim = read("test/real-preview/obsidian-shim.ts");
		const chatOk =
			chat.includes("oa-attach-anchor") &&
			chat.includes("AttachMenu") &&
			chat.includes("handleComposerKeys") &&
			chat.includes("extractAtRefs") &&
			chat.includes("modelSupportsVision") &&
			!chat.includes("SUGGESTIONS"); // home suggestions moved to settings snippets
		/* v0.1.199 (Phase 4): the snippet editor moved with command() — the tab
		   still names the feature, the module owns the modal. */
		const cmdMod = read("src/settings/sections/command.ts");
		const tabOk = tab.includes("Prompt snippets") && cmdMod.includes("SnippetEditModal") && !tab.includes("SnippetEditModal");
		const cssOk = css.includes(".oa-attach-menu") && css.includes(".oa-kbd");
		const shimOk = ["file", "folder", "image", "message-square-text", "arrow-left", "at-sign"].every((n) =>
			shim.includes(`${n}:`) || shim.includes(`"${n}":`)
		);
		const browseOk =
			read("src/ui/attach/attach-menu.tsx").includes("useFileUploadBrowse") &&
			!chat.includes("const browseDisk = useFileUploadBrowse()"); // disk browse must live INSIDE <FileUpload>
		if (chatOk && tabOk && cssOk && shimOk && browseOk) {
			console.log("✓ attach feature wired ([+] menu · snippets · @ refs · vision · shim icons · browse)");
		} else {
			console.error(`✗ attach feature drifted (chat:${chatOk} tab:${tabOk} css:${cssOk} shim:${shimOk} browse:${browseOk})`);
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		const rp = read("test/real-preview/build.mjs");
		const ok =
			chat.includes("const withUser = [...turnsRef.current, userTurn];") &&
			!chat.includes("withUser = [...turns, userTurn]") &&
			rp.includes("regenerate duplicated or lost history") &&
			rp.includes("--with-deps");
		if (ok) {
			console.log("✓ regenerate honesty: withUser from turnsRef + E2E click guard + self-heal --with-deps");
		} else {
			console.error("✗ regenerate fix drifted (withUser back to stale state closure?)");
			failed++;
		}
	}
	{
		const css = read("styles.css");
		const ref = read("test/reference-obsidian-app.css");
		const md = read("src/ui/components/markdown.tsx");
		const rule = css.match(/\.oa-app \.oa-markdown blockquote \{[\s\S]*?\}/);
		const rp = read("test/real-preview/build.mjs");
		const bp = read("test/build-preview.mjs");
		const ext = read("test/extract-obsidian-sim.mjs");
		const sim = read("test/obsidian-sim.css");
		const ok =
			rule !== null &&
			!/border|color|background/.test(rule[0]) &&
			rule[0].includes("margin-block") &&
			md.includes('addClass("markdown-rendered")') &&
			ref.includes("--blockquote-border-color: var(--interactive-accent);") &&
			ref.includes("var(--blockquote-border-thickness) solid var(--blockquote-border-color)") &&
			// harness fidelity: theme class on <body> (as in the real app — vars
			// chain via body-scoped --accent-h), blockquote rule whitelisted in
			// the extractor and present in the regenerated subset
			rp.includes('<body class="theme-dark">') &&
			!rp.includes('<html class="theme-dark">') &&
			!bp.includes('<html class="theme-dark">') &&
			ext.includes("markdown-rendered\\s+blockquote") &&
			sim.includes(".markdown-rendered blockquote {") &&
			sim.includes("var(--blockquote-border-thickness) solid var(--blockquote-border-color)");
		if (ok) {
			console.log("✓ quote parity: chat blockquote inherits Obsidian accent bar (no gray override) · harness mirrors app (theme on body, sim blockquote rule)");
		} else {
			console.error("✗ quote parity / harness fidelity drifted (gray override back, theme class moved, or sim blockquote rule lost)");
			failed++;
		}
	}
	{
		const fu = read("src/ui/components/file-upload.tsx");
		const chat = read("src/ui/ChatApp.tsx");
		const rp = read("test/real-preview/build.mjs");
		const entry = read("test/attach-entry.ts");
		const pdf = read("src/ui/attach/pdf.ts");
		const manifest = read("manifest.json");
		const types = read("src/types.ts");
		const bpm = read("test/build-preview.mjs");
		const css = read("styles.css");
		const ok =
			fu.includes("export const MAX_TEXT_BYTES = 1024 * 1024") &&
			fu.includes("export function isImageLike(") &&
			fu.includes("IMAGE_ATTACH_MAX_BYTES") &&
			fu.includes("readAsDataUrl") &&
			fu.includes("over the 1 MB text-file limit") &&
			fu.includes("unsupported type — attach text/code files, images, or PDF") &&
			fu.includes("over the 5 MB image limit") &&
			fu.includes("isPdfLike(file.name, file.type)") &&
			chat.includes("text/PDF up to 1 MB") &&
			pdf.includes("extractPdfText") &&
			/* v0.1.130 amended: jalur worker inline lumat → worker eksternal via vendor
			   file + blob URL; konfigurasi sekarang lewat ensureSharedWorker (blok
			   v0.1.130 di bawah mem-pin jalur barunya secara ketat) */
			pdf.includes("ensureSharedWorker") &&
			pdf.includes("PDF_ATTACH_MAX_PAGES = 50") &&
			rp.includes("local text extraction") &&
			rp.includes("makeTinyPdf") &&
			entry.includes("isImageLike") &&
			entry.includes("isPdfLike") &&
			manifest.includes('"version": "0.1.151"') &&
			/* sent-message attachment block (owner ask 2026-07-22): metadata
			   persisted on the user turn, chips rendered in the bubble, E2E
			   proves the block survives Send */
			types.includes("attachments?: {") &&
			chat.includes("turn.attachments") &&
			chat.includes("sentAttachments") &&
			css.includes(".oa-app .oa-msg-attach {") &&
			rp.includes("attachsent") &&
			bpm.includes("attachsent");
		if (ok) {
			console.log("✓ disk attach: 1 MB text cap · images via vision · PDF local extraction · measured rejections · version bumped (user-verifiable build)");
		} else {
			console.error("✗ disk-attach wiring drifted (cap lowered, vision/pdf path lost, notices dumbed down, version not bumped)");
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		const ic = read("src/ui/icons.tsx");
		const shim = read("test/real-preview/obsidian-shim.ts");
		const ok =
			chat.indexOf('aria-label="New chat"') < chat.indexOf('aria-label="Conversations"') &&
			chat.includes("<RotateCcwIcon size={15} />") &&
			!chat.includes("<SidebarIcon") &&
			ic.includes('export const RotateCcwIcon = make("history")') &&
			!ic.includes("export const SidebarIcon") &&
			shim.includes("history:");
		if (ok) {
			console.log("✓ v0.1.169: conversations toggle — history glyph (Obsidian's pre-rename rotate-ccw-clock), after New chat");
		} else {
			console.error("✗ v0.1.169 conversations toggle drifted");
			failed++;
		}
	}
	{
		const app10 = read("src/ui/ChatApp.tsx");
		const chat10 = read("test/real-preview/chat-entry.tsx");
		const overrides = app10.split("{ ...effectiveSettings, model: pair.model }").length - 1;
		const ok =
			overrides === 3 &&
			chat10.includes("__oaRequestModels") &&
			chat10.includes('goalJudge: { providerId: "lmstudio", model: "qwen3-30b-a3b-instruct-2507" }') &&
			chat10.includes("judgeModelOk");
		if (ok) {
			console.log("✓ v0.1.27: aux pin rides provider+model (3 call sites, wire-proven pin)");
		} else {
			console.error("✗ v0.1.27 aux pin drifted (model override lost at a call site)");
			failed++;
		}
	}
	{
		const app16 = read("src/ui/ChatApp.tsx");
		const rp16 = read("test/real-preview/chat-entry.tsx");
		const refresh = region(app16, "const refreshModels = useCallback", "const selectModel = useCallback", { label: "refreshModels" });
		const ok =
			refresh.includes("providerUsable(p)") &&
			!refresh.includes("props.openSettings()") && // the settings jump is GONE
			refresh.includes("menu stays open") &&
			rp16.includes("__oaSettingsOpened") &&
			rp16.includes("refreshNoSettingsJump");
		if (ok) {
			console.log("✓ v0.1.33: refresh gated by providerUsable — zero-target vaults get a Notice, never a settings jump");
		} else {
			console.error("✗ v0.1.33 refresh fix drifted (gate or no-jump lost)");
			failed++;
		}
	}
	{
		const dlg17 = read("src/ui/components/model-visibility-dialog.tsx");
		const css17 = read("styles.css");
		const rp17 = read("test/real-preview/chat-entry.tsx");
		const ok =
			dlg17.includes('checkbox-container${on ? " is-enabled" : ""}') &&
			!dlg17.includes("oa-vis-switch") &&
			css17.includes("2026-08-01 v0.1.34: footer rows vertical") &&
			!css17.includes(".oa-vis-switch") &&
			(() => {
				/* folded structure (v0.1.70): assert the two declarations in
				   the BASE footer / footer-button rules they now live in */
				const blk = (sel) => {
					const i = css17.indexOf("\n" + sel);
					const j = i < 0 ? -1 : css17.indexOf("\n}\n", i);
					return j < 0 ? "" : css17.slice(i, j);
				};
				return blk(".oa-app .oa-model-menu-footer {").includes("flex-direction: column")
					&& blk(".oa-app .oa-model-menu-footer button {").includes("justify-content: flex-start");
			})() &&
			rp17.includes(".checkbox-container input");
		if (ok) {
			console.log("✓ v0.1.34: switch reuses the app .checkbox-container + footer rows stacked vertically");
		} else {
			console.error("✗ v0.1.34 app-toggle reuse or vertical footer drifted");
			failed++;
		}
	}
	{
		const intro = read("src/ui/components/intro.tsx");
		const app18 = read("src/ui/ChatApp.tsx");
		const css18 = read("styles.css");
		const rp18 = read("test/real-preview/chat-entry.tsx");
		const bm18 = read("test/real-preview/build.mjs");
		const ok =
			intro.includes('const WORDMARK = "OPEN AGENT"') &&
			/* v0.1.36: pool evolved to the verbatim official jsonl map;
			   templates stay per-personality fallback */
			intro.includes("INTRO_COPY_BY_PERSONALITY") &&
			intro.includes("fallbackCopyForPersonality") &&
			intro.includes("mode is on. What should we work on?") &&
			intro.includes("oa-intro-wordmark") &&
			app18.includes("<Intro personality=") &&
			app18.includes("introSeed") &&
			!app18.includes("How can I help?") &&
			!app18.includes("oa-empty-hint") &&
			!app18.includes("SparklesIcon") &&
			css18.includes("2026-08-01 v0.1.35: empty-state Intro parity") &&
			/* v0.1.152 amended: the retired CHAT-intro title must stay gone as
			   an UNscoped rule — the new settings empty state lives under
			   `.oa-settings .oa-empty-title` (asserted by v0.1.152) and is not
			   this retirement's target. */
			!/\n\.oa-empty-title\s*\{/.test(css18) &&
			rp18.includes("__oaEmptyCheck") &&
			bm18.includes("__oaEmptyCheck");
		if (ok) {
			console.log("✓ v0.1.35: empty state mirrors the official Intro (wordmark + rotating copy; hero retired)");
		} else {
			console.error("✗ v0.1.35 intro mirror drifted (component, wiring, or retirements lost)");
			failed++;
		}
	}
	{
		const mdx = read("src/ui/components/markdown.tsx");
		const css = read("styles.css");
		const entry = read("test/real-preview/chat-entry.tsx");
		if (
			mdx.includes('DIAGRAM_LANGS = new Set(["mermaid"])') &&
			mdx.includes("DIAGRAM_LANGS.has(seg.lang.trim().toLowerCase())") &&
			mdx.includes('const fence = seg.content.includes("```") ? "~~~" : "```"') &&
			css.includes(".oa-markdown .mermaid {") &&
			css.includes(".oa-markdown .mermaid svg") &&
			entry.includes("\\`\\`\\`mermaid")
		) {
			console.log("✓ diagram fences routed to Obsidian (mermaid), svg contained");
		} else {
			console.error("✗ diagram-fence routing spec drifted");
			failed++;
		}
	}
	{
		const hl = read("src/ui/highlight.ts");
		const cb = read("src/ui/components/code-block.tsx");
		const css = read("styles.css");
		const ref = read("test/reference-obsidian-app.css");
		const entry = read("test/real-preview/chat-entry.tsx");
		const buildm = read("test/real-preview/build.mjs");
		const hltest = read("test/highlight.test.cjs");
		const pkg = read("package.json");
		if (
			/export function highlightCode\(\n?/.test(hl) &&
			/export const HIGHLIGHT_BUDGET = 20_000/.test(hl) &&
			hl.includes('typescript: "js"') &&
			!hl.includes('mermaid: "md"') &&
			/import \{ highlightCode \} from "\.\.\/highlight"/.test(cb) &&
			cb.includes("oa-tok-") &&
			!/from "react-shiki"|from "shiki"/.test(cb) &&
			/\.oa-code-pre \.oa-tok-keyword\s*\{[^}]*--code-keyword/.test(css) &&
			css.includes("--code-number, var(--code-value") &&
			/--code-keyword: #f47067/.test(ref) &&
			ref.includes("SIM-ONLY (2026-08-02, v0.1.43)") &&
			entry.includes("__oaHlCheck") &&
			entry.includes("mermaidIntact") &&
			buildm.includes("__oaHlCheck") &&
			buildm.includes("[md] highlight:") &&
			hltest.includes("round-trip lossless") &&
			/node (?:--require \S+ )?test\/highlight\.test\.cjs/.test(pkg)
		) {
			console.log("✓ mini syntax highlighting: tokenizer + --code-* colors + no-Shiki contract, md harness check wired");
		} else {
			console.error("✗ mini-highlight spec drifted");
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		const icons = read("src/ui/icons.tsx");
		const css = read("styles.css");
		const entry = read("test/real-preview/chat-entry.tsx");
		const buildm = read("test/real-preview/build.mjs");
		if (
			/document\.addEventListener\("selectionchange"/.test(chat) &&
			chat.includes('closest(".oa-msg-content")') &&
			chat.includes('selDrag.current = true') &&
			/const quoteSelection = useCallback/.test(chat) &&
			chat.includes('`> ${l}`') &&
			/const copySelection = useCallback/.test(chat) &&
			chat.includes('document.execCommand("copy")') &&
			chat.includes('aria-label="Selection actions"') &&
			icons.includes('make("quote")') &&
			/\.oa-selbar \{[^}]*position: fixed/.test(css) &&
			css.includes(".oa-selbar-btn:hover") &&
			css.includes("@keyframes oa-selbar-in") &&
			entry.includes("__oaSelCheck") &&
			buildm.includes('"sel"') &&
			buildm.includes("__oaSelCheck")
		) {
			console.log("✓ selection actions bar: selectionchange wiring, same-bubble guard, quote/copy handlers, harness check wired");
		} else {
			console.error("✗ selection-actions spec drifted");
			failed++;
		}
	}
	{
		const css = read("styles.css");
		const buildm = read("test/real-preview/build.mjs");
		if (
			/\.oa-app \.oa-msg-content\s*\{[^}]*user-select: text;[^}]*-webkit-user-select: text;/.test(css) &&
			buildm.includes("sel drag lane failed") &&
			buildm.includes("page.mouse.down()")
		) {
			console.log("✓ selection opt-in: chat content user-select:text (scoped), real-drag harness lane as regression");
		} else {
			console.error("✗ selection-opt-in spec drifted");
			failed++;
		}
	}
	{
		const chat = read("src/ui/ChatApp.tsx");
		const css = read("styles.css");
		const entry = read("test/real-preview/chat-entry.tsx");
		const buildm = read("test/real-preview/build.mjs");
		if (
			chat.includes("<QuoteIcon size={14} />") &&
			chat.includes("is-done") &&
			chat.includes('{selCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}') &&
			!/size=\{12\} \/> \{selCopied/.test(chat) &&
			!/>\s*(Quote|Copy)\s*<\/button>/.test(chat) &&
			/\.oa-selbar \.oa-selbar-btn \{[^}]*width: 28px;[^}]*height: 28px;/.test(css) &&
			css.includes(".oa-selbar-btn.is-done { color: var(--text-success); }") &&
			entry.includes(".oa-selbar-btn.is-done") &&
			buildm.includes("copiedBeat")
		) {
			console.log("✓ selection bar: icon-only floating toolbar, tooltip-via-aria-label, Copy→Check beat, harness follows");
		} else {
			console.error("✗ icon-only selbar spec drifted");
			failed++;
		}
	}
	{
		const css = read("styles.css");
		const entry = read("test/real-preview/chat-entry.tsx");
		const buildm = read("test/real-preview/build.mjs");
		if (
			/\.oa-selbar \.oa-selbar-btn \{[^}]*width: 28px;[^}]*height: 28px;[^}]*flex-shrink: 0;/.test(css) &&
			entry.includes("btnW:") &&
			buildm.includes("h.btnW < 26") &&
			buildm.includes("shells 28px")
		) {
			console.log("✓ selbar geometry: scoped 28px shells + measured-size regression in the sel lane");
		} else {
			console.error("✗ selbar-geometry spec drifted");
			failed++;
		}
	}
	{
		const fb = read("src/ui/components/feedback.tsx");
		const chat = read("src/ui/ChatApp.tsx");
		const css = read("styles.css");
		const entry = read("test/real-preview/chat-entry.tsx");
		const buildm = read("test/real-preview/build.mjs");
		if (
			fb.includes("faithful shape") &&
			/export function FeedbackBar\(/.test(fb) &&
			fb.includes('aria-label="Helpful"') &&
			fb.includes('aria-label="Not helpful"') &&
			fb.includes('aria-label="Close"') &&
			fb.includes("oa-feedback-close-col") &&
			chat.includes('"Was this helpful?"') &&
			chat.includes("showFeedbackBar(turn)") &&
			chat.includes('role === "assistant" && !running && textParts.length > 0 && settings.showReactions && showFeedbackBar') &&
			/\.oa-app \.oa-feedback-bar \{[^}]*border-radius: 12px;/.test(css) &&
			/\.oa-app \.oa-feedback-btn \{[^}]*width: 32px;[^}]*height: 32px;/.test(css) &&
			css.includes(".oa-app .oa-feedback-close-col") &&
			entry.includes("userBubbleFree") &&
			buildm.includes("dismissedSaved")
		) {
			console.log("✓ feedback banner: faithful prompt-kit shape, assistant-only gate, pick/dismiss persistence, harness follows");
		} else {
			console.error("✗ feedback-banner spec drifted");
			failed++;
		}
	}
	{
		const shimSrc = fs.readFileSync(
			path.join(ROOT, "test", "real-preview", "obsidian-shim.ts"),
			"utf8",
		);
		const okIcons =
			/unknown lucide icon/.test(shimSrc) &&
			["thumbs-up", "thumbs-down", "quote"].every(
				(n) => new RegExp('["\']?' + n + '["\']?:[\\s\\S]{0,700}?<path').test(shimSrc),
			);
		if (!okIcons) {
				console.error("✗ shim icon map drifted (empty/missing glyph body)");
				failed++;
		} else {
				console.log("✓ feedback banner icons: shim map has real glyph bodies + loud unknown warning");
		}
	}
	{
		const css = read("styles.css");
		const bm = read("test/real-preview/build.mjs");
		if (
			css.includes(".oa-app .oa-attach-toggle { border-radius: 999px; }") &&
			/\.oa-app \.oa-prompt-action \{[\s\S]{0,700}?border-radius: 999px;/.test(css) &&
			bm.includes("composer radius check") &&
			/* v0.1.122 amended: probe berevolusi (objek multi-prop untuk
			   tint lembut + anti-kapsul) — anchor disesuaikan di tempat */
			bm.includes("cs.borderRadius")
		) {
			console.log("✓ composer action radius: one 999px family + measured in the empty lane");
		} else {
			console.error("✗ composer action radius drifted (css block or measured lane)");
			failed++;
		}
	}
	{
		const bs = read("test/real-preview/build-settings.mjs");
		const rel = read("scripts/release.mjs");
		if (
			bs.includes("probes.F18") &&
			bs.includes('"H:Backup & Restore"') &&
			bs.includes("getComputedStyle(normalTitle).color") &&
			bs.includes("fixed === false") &&
			rel.includes('step("settings preview", "node", ["test/real-preview/build-settings.mjs"]')
		) {
			console.log("✓ settings pixel lane: F18 general-groups probe + red gate + wired into release");
		} else {
			console.error("✗ settings pixel lane drifted (F18, gate, or release wiring)");
			failed++;
		}
	}
	{
		const sp = read("src/agent/systemPrompt.ts");
		const rn = read("src/agent/runner.ts");
		const ca = read("src/ui/ChatApp.tsx");
		const ce = read("test/real-preview/chat-entry.tsx");
		const bmj = read("test/real-preview/build.mjs");
		const ut = read("test/system-prompt.test.cjs");
		if (
			sp.includes("rated not helpful") &&
			rn.includes("feedbackDue: boolean = false") &&
			ca.includes("feedbackOf(prevAssistant.reaction)") &&
			ca.includes("sessionOverlay,") && ca.includes("feedbackDue,") &&
			ce.includes('m.role === "system" ? m.content') &&
			ce.includes("feedbackInNextSys") &&
			bmj.includes("savedAfterDown") &&
			ut.includes("reflection section present")
		) {
			console.log("✓ feedback→learning: prompt section + prev-assistant signal + wire lane + unit tests");
		} else {
			console.error("✗ feedback→learning wiring drifted");
			failed++;
		}
	}
	{
		const ce = read("test/real-preview/chat-entry.tsx");
		const bp = read("test/build-preview.mjs");
		if (
			ce.includes('import { buildSystemPrompt } from "../../src/agent/systemPrompt";') &&
			ce.includes("feedbackDue,\n\t\t})") &&
			!ce.includes('"(sim system prompt)"') &&
			bp.includes("no stale frames tolerated") &&
			bp.includes("refusing the static fallback")
		) {
			console.log("✓ gate holes closed: real sim assembly + lane failure aborts preview");
		} else {
			console.error("✗ gate-hole fixes drifted");
			failed++;
		}
	}
	{
		const cf = read("src/ui/components/changed-files.ts");
		const cc = read("src/ui/components/changed-files-card.tsx");
		const ca = read("src/ui/ChatApp.tsx");
		const ce = read("test/real-preview/chat-entry.tsx");
		const bm = read("test/real-preview/build.mjs");
		const pk = read("package.json");
		const ok =
			cf.includes("export function deriveChangedFiles") &&
			cf.includes('part.status !== "done"') &&
			cc.includes("file changed") &&
			/* v0.1.121 amended: call membawa workspaceFolder (path terresolve,
			   lihat guard v0.1.121) — anchor disesuaikan di tempat */
			ca.includes("deriveChangedFiles(turn.parts, settings.workspaceFolder)") &&
			ca.includes("openChangedFile") &&
			ce.includes("simCreated.get(p)") &&
			ce.includes("modify: async (f: TFile") &&
			ce.includes("__oaFcardCheck") &&
			ce.includes('t.name === "write_note"') &&
			ce.includes("call_fc1") &&
			bm.includes("fcard check") &&
			pk.includes("changedFiles.test.cjs");
		if (ok) {
			console.log("✓ changed-files card: pure derive + ChatApp mount + honest sim + fcard lane + unit suite");
		} else {
			console.error("✗ changed-files card wiring drifted");
			failed++;
		}
	}
	{
		const tp = read("src/types.ts");
		const sm = read("src/ui/components/system-message.tsx");
		const ic = read("src/ui/icons.tsx");
		const ca = read("src/ui/ChatApp.tsx");
		const ce = read("test/real-preview/chat-entry.tsx");
		const bm = read("test/real-preview/build.mjs");
		const sh = read("test/real-preview/obsidian-shim.ts");
		const st = read("styles.css");
		const ok =
			tp.includes('role: "user" | "assistant" | "system"') &&
			tp.includes("noticeCta?: { label: string; openPath: string }") &&
			sm.includes("oa-sysmsg") &&
			sm.includes("AlertCircleIcon") &&
			ic.includes('make("info")') &&
			ic.includes('make("circle-alert")') &&
			ca.includes("<SystemMessage") &&
			ca.includes('role: "system"') &&
			ca.includes('"**System**:"') &&
			ce.includes("__oaSysmsgCheck") &&
			ce.includes('"sysmsg"') &&
			ce.includes("turnRoles") &&
			bm.includes("sysmsg check") &&
			sh.includes('"circle-alert":') &&
			sh.includes("\tinfo:") &&
			st.includes(".oa-sysmsg-error");
		if (ok) {
			console.log("✓ system-message port: honest system role + banner variants + CTA data + sim lane + CSS");
		} else {
			console.error("✗ system-message port wiring drifted");
			failed++;
		}
	}
	{
		const wp = read("src/agent/writePreview.ts");
		const ts = read("src/agent/tools.ts");
		const dc = read("src/ui/components/preview-diff-core.ts");
		const dv = read("src/ui/components/preview-diff.tsx");
		const ca = read("src/ui/ChatApp.tsx");
		const ce = read("test/real-preview/chat-entry.tsx");
		const bm = read("test/real-preview/build.mjs");
		const pk = read("package.json");
		const st = read("styles.css");
		const ok =
			wp.includes("export function planWrite") &&
			wp.includes("export function planEdit") &&
			ts.includes("resolveWritePath") &&
			ts.includes("planEdit(args, path, content)") &&
			ts.includes('approvalKind: "persistent-write"') &&
			ts.includes('action === "delete" || action === "remove_file"') &&
			ts.includes('=== "list" ? "standard" : "scheduling"') &&
			dc.includes("diffWordsWithSpace") &&
			dc.includes("buildPreviewRows") &&
			dv.includes("oa-preview-op") &&
			ca.includes("buildApprovalPreview") &&
			ca.includes("approvalKindLabel") &&
			ca.includes("<PreviewDiff") &&
			ce.includes("__oaPreviewCheck") &&
			ce.includes('simSettings.approvalMode = "yolo"') &&
			bm.includes("preview check") &&
			pk.includes("\"diff\":") &&
			pk.includes("previewPlanner.test.cjs") &&
			st.includes(".oa-preview-added");
		if (ok) {
			console.log("✓ approvals: operation-aware kinds + shared write planner + diff card + stale guard + sim lane");
		} else {
			console.error("✗ approval preview wiring drifted");
			failed++;
		}
	}
	{
		const chatApi = read("src/ui/chatApi.ts");
		const glue = read("src/editorMenu.ts");
		const app2 = read("src/ui/ChatApp.tsx");
		const view = read("src/ui/ChatView.tsx");
		const mainTs = read("src/main.ts");
		const settings = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const entry = read("test/real-preview/chat-entry.tsx");
		const build = read("test/real-preview/build.mjs");
		const armWrites = app2.split("skillContextRef.current = `[Skill: ").length - 1;
		const ok =
			chatApi.includes("export interface ChatApiSink") &&
			chatApi.includes("pending: Array<(api: ChatApi) => void>") &&
			chatApi.includes("dispatchToChatApi") &&
			app2.includes("chatApiSink?: ChatApiSink;") &&
			app2.includes("sink.current = api;") &&
			app2.includes("sink.pending.length = 0;") &&
			app2.includes("L${p.fromLine}-${p.toLine}") &&
			app2.includes("apiAttachSelection = useCallback") &&
			app2.includes("apiQuoteSelectionForAsk = useCallback") &&
			app2.includes("apiRunSkillOnSelection = useCallback") &&
			armWrites === 1 &&
			view.includes("attachSelectionFromEditor") &&
			view.includes("quoteSelectionFromEditor") &&
			view.includes("runSkillOnSelectionFromEditor") &&
			view.includes("chatApiSink.pending.length = 0;") &&
			glue.includes('"editor-menu"') &&
			glue.includes("plugin.settings.editorContextMenu") &&
			glue.includes("setSubmenu") &&
			glue.includes('"Open Agent: "') &&
			glue.includes("setDisabled(!hasSelection)") &&
			glue.includes("Open Agent: no text selected.") &&
			glue.includes("Open Agent: could not determine the selection range.") &&
			glue.includes("Open Agent: no active file.") &&
			glue.includes("FuzzySuggestModal") &&
			glue.includes("Math.min(a, h) + 1") &&
			mainTs.includes("registerEditorContextMenu(this);") &&
			settings.includes("editorContextMenu: boolean") &&
			settings.includes("editorContextMenu: true") &&
			read("src/settings/sections/command.ts").includes('"Editor context menu"') && // moved 2026-08-24 (Phase 4)
			!tab.includes('"Editor context menu"') &&
			entry.includes("__oaChatApiSink") &&
			entry.includes('scenarioParam() === "empty"') &&
			build.includes("editor bridge lane");
		if (ok) {
			console.log("✓ v0.1.75: editor context menu — sink bridge + honest chip label + arm single-sourced + submenu feature-detect + live toggle");
		} else {
			console.error("✗ v0.1.75 editor context-menu wiring drifted");
			failed++;
		}
	}
	{
		const glue = read("src/editorMenu.ts");
		const app3 = read("src/ui/ChatApp.tsx");
		const view2 = read("src/ui/ChatView.tsx");
		const chatApi2 = read("src/ui/chatApi.ts");
		const settings3 = read("src/settings.ts");
		const skills3 = read("src/agent/skills.ts");
		const tab3 = read("src/settingsTab.ts");
		const build3 = read("test/real-preview/build.mjs");
		const cmd3 = read("src/settings/sections/command.ts");
		const ok =
			settings3.includes("editorContextMenuAdd: boolean") &&
			settings3.includes("editorContextMenuAsk: boolean") &&
			settings3.includes("editorContextMenuSkill: boolean") &&
			settings3.includes("editorContextMenuAdd: true") &&
			settings3.includes("ctxMenu?: boolean") &&
			settings3.includes("r.ctxMenu === true ? { ctxMenu: true }") &&
			glue.includes("st.editorContextMenuAdd") &&
			glue.includes("st.editorContextMenuAsk") &&
			glue.includes("st.editorContextMenuSkill") &&
			glue.includes("sn.ctxMenu === true") &&
			glue.includes("addSeparator()") &&
			glue.includes("sk.ctxMenu !== false") &&
			glue.includes("no skills available for the context menu") &&
			skills3.includes("ctxMenu: meta.contextMenu !== false") &&
			chatApi2.includes("runSnippetOnSelection: (lead: string, p: SelectionPayload) => void") &&
			app3.includes("apiRunSnippetOnSelection = useCallback") &&
			app3.includes("runSnippetOnSelection: apiRunSnippetOnSelection") &&
			view2.includes("runSnippetOnSelectionFromEditor") &&
			/* v0.1.199 (Phase 4): the three granular switches moved with command()
			   into its module; the tab must not grow a second copy. */
			cmd3.includes('"Context menu: Add selection to chat"') &&
			cmd3.includes('"Context menu: Ask about selection"') &&
			cmd3.includes('"Context menu: Run skill on selection"') &&
			!tab3.includes('"Context menu: Add selection to chat"') &&
			/* v0.1.77 relocation: the v0.1.76 row icon button graduated into
			   the real In Menu toggle (Commands tab); v0.1.155 moved those
			   toggles into the edit modal — the literal moves again, the
			   contract (flag written only when on) does not */
			read("src/settings/modals/snippet.ts").includes("const mkSurface =") &&
			build3.includes("Translate ke Inggris:") &&
			build3.includes("cr.snipOk");
		if (ok) {
			console.log("✓ v0.1.76: granular menu switches + per-skill contextMenu flag + snippet custom actions wired");
		} else {
			console.error("✗ v0.1.76 context-menu settings depth drifted");
			failed++;
		}
	}
	{
		const tab4 = read("src/settingsTab.ts");
		const settings4 = read("src/settings.ts");
		const app4 = read("src/ui/ChatApp.tsx");
		const entry4 = read("test/real-preview/chat-entry.tsx");
		const build4 = read("test/real-preview/build.mjs");
		const css4 = read("styles.css");
		/* v0.1.199 (Phase 4): command() + renderCommandRows moved to their own
		   module. The tab keeps the registry entry and the wiring; the module
		   owns the rows. Both halves are pinned so neither can quietly vanish. */
		const cmd4 = read("src/settings/sections/command.ts");
		const ok =
			tab4.includes('{ key: "command", label: "Commands", icon: "terminal-square" },') &&
			tab4.includes('command: "Preset prompts and editor right-click actions') &&
			!tab4.includes("private command(") &&
			tab4.includes("commandSection(this.sectionContext(), host)") &&
			cmd4.includes("export function command(") &&
			cmd4.includes("renderCommandRows") &&
			!tab4.includes("renderCommandRows") &&
			cmd4.includes('"Enable editor context menu"') &&
			cmd4.includes('"Context menu: Add selection to chat"') &&
			read("src/settings/modals/snippet.ts").includes("const mkSurface =") &&
			read("src/settings/modals/snippet.ts").includes('"Where this shows"') &&
			read("src/settings/modals/snippet.ts").includes('"In Menu"') &&
			cmd4.includes('"Restore defaults"') &&
			cmd4.includes('"Add command"') &&
			cmd4.includes("copy-plus") &&
			cmd4.includes("Shows in:") &&
			cmd4.includes("Not shown anywhere") &&
			tab4.includes("live in the Commands tab now") &&
			tab4.includes('agent: "Chat behaviour: personality and session storage."') && // v0.1.191 amended: "iteration cap" moved to Advanced; desc follows the rows
			!tab4.includes("renderSnippetRows") &&
			!cmd4.includes("renderSnippetRows") &&
			settings4.includes("slash?: boolean") &&
			settings4.includes("r.slash === true ? { slash: true }") &&
			app4.includes('group: "Snippets"') &&
			app4.includes("sn.slash === true") &&
			app4.includes("const snippetSlug = ") &&
			app4.includes("fill: sn.text") &&
			css4.includes(".oa-snippet-surfaces") &&
			!css4.includes(".oa-cmd-flags") &&
			css4.includes(".oa-cmd-order") &&
			entry4.includes("snip-lane-1") &&
			entry4.includes("snipGroupOk") &&
			build4.includes("snipGroupOk") &&
			build4.includes("Snippets group + fill");
		if (ok) {
			console.log("✓ v0.1.77: Commands settings tab — surfaces in the edit modal + order + actions; Snippets slash group stages full prompt");
		} else {
			console.error("✗ v0.1.77 Commands tab wiring drifted");
			failed++;
		}
	}
	{
		const pt = read("src/agent/promptTokens.ts");
		const app5 = read("src/ui/ChatApp.tsx");
		const tab5 = read("src/settingsTab.ts");
		const css5 = read("styles.css");
		const entry5 = read("test/real-preview/chat-entry.tsx");
		const build5 = read("test/real-preview/build.mjs");
		const count5 = (src, needle) => src.split(needle).length - 1;
		const ok =
			pt.includes("export function extractPromptTokens") &&
			pt.includes("export function noteMatchesWantedTags") &&
			pt.includes("export function resolveTitleToPath") &&
			pt.includes("/\\{activeNote\\}/gi") &&
			pt.includes("export function normalizePropertyTags") &&
			app5.includes('import { extractPromptTokens, noteMatchesWantedTags, resolveTitleToPath } from "../agent/promptTokens";') &&
			app5.includes("extractPromptTokens(rawPrompt, liveSelection") &&
			app5.includes("workspace.getActiveFile()") &&
			app5.includes("metadataCache.getFileCache(f)?.frontmatter") &&
			app5.includes("couldn't resolve prompt token") &&
			app5.includes("matched ${matched.length} notes — attached the first ${room} (cap 24)") &&
			app5.includes("const attachList = [...effFiles, ...tokenFiles, ...atFiles];") &&
			app5.includes("text: displayText ?? promptText") &&
			count5(app5, "extractAtRefs(promptText)") === 1 &&
			!app5.includes("extractAtRefs(rawPrompt)") &&
			app5.includes('lead.includes("{}")') &&
			count5(app5, "new Set([...effFiles, ...tokenFiles]") === 1 &&
			app5.includes("!alreadyNamed.has(active.path) && !attachNote") &&
			entry5.includes("skipExact") &&
			entry5.includes("Detach note") &&
			build5.includes("no-double-attach") &&
			read("src/settings/modals/snippet.ts").includes("oa-snippet-tips") &&
			read("src/settings/modals/snippet.ts").includes('"{[[Note Title]]} represents a note."') &&
			read("src/settings/modals/snippet.ts").includes("{#tag1, #tag2} represents ALL notes with ANY of the specified tags in their property") &&
			read("src/settings/modals/snippet.ts").includes('"{} represents the selected text."') &&
			css5.includes(".oa-snippet-tips-line") &&
			entry5.includes("simTokenSeed") &&
			entry5.includes('s === "token"') &&
			entry5.includes("__oaTokenCheck") &&
			entry5.includes("Ringkas:\\n{}") &&
			build5.includes('"slash3", "token"') &&
			build5.includes("__oaTokenCheck") &&
			build5.includes("OR-expand") &&
			build5.includes("composer pristine");
		if (ok) {
			console.log("✓ v0.1.78: prompt tokens {} {[[]]} {activeNote} {#tags} resolve for real · modal tips block · editor {} inline vs quote");
		} else {
			console.error("✗ v0.1.78 prompt-token wiring drifted");
			failed++;
		}
	}
	{
		const st6 = read("src/settings.ts");
		const tab6 = read("src/settingsTab.ts");
		const app6 = read("src/ui/ChatApp.tsx");
		const menu6 = read("src/ui/attach/attach-menu.tsx");
		const entry6 = read("test/real-preview/chat-entry.tsx");
		const build6 = read("test/real-preview/build.mjs");
		const count6 = (src, needle) => src.split(needle).length - 1;
		const ok =
			st6.includes("picker?: boolean") &&
			st6.includes("r.picker === false ? { picker: false }") &&
			read("src/settings/modals/snippet.ts").includes('mkSurface("Snippets (+ menu)"') &&
			read("src/settings/sections/command.ts").includes("snip.picker !== false") && // moved 2026-08-24 (Phase 4)
			!tab6.includes("snip.picker !== false") &&
			read("src/settings/modals/snippet.ts").includes("if (!this.pickerShown) out.picker = false") &&
			tab6.includes("[+] picker") &&
			app6.includes(".filter((sn) => sn.picker !== false)") &&
			menu6.includes("Snippets toggle in Settings → Commands") &&
			!menu6.includes("Settings → Agent") &&
			entry6.includes("__oaSnipsCheck") &&
			entry6.includes("Tersembunyi Mana") &&
			count6(entry6, "picker: false") === 1 &&
			build6.includes("__oaSnipsCheck") &&
			build6.includes('"2 saved"');
		if (ok) {
			console.log("✓ v0.1.79: Snippets toggle (opt-out) — picker filters picker:false · third Commands column · stale pointers swept");
		} else {
			console.error("✗ v0.1.79 picker-toggle wiring drifted");
			failed++;
		}
	}
	{
		const tools7 = read("src/agent/tools.ts");
		const loop7 = read("src/agent/agentLoop.ts");
		const st7 = read("src/settings.ts");
		const tab7 = read("src/settingsTab.ts");
		const app7 = read("src/ui/ChatApp.tsx");
		const css7 = read("styles.css");
		const entry7 = read("test/real-preview/chat-entry.tsx");
		const build7 = read("test/real-preview/build.mjs");
		const ok =
			tools7.includes('name: "clarify"') &&
			tools7.includes('toolset: "clarify",') &&
			tools7.includes("CLARIFY_MAX_CHOICES = 4") &&
			tools7.includes("export function flattenClarifyChoice") &&
			tools7.includes('["label", "description", "text", "title"]') &&
			tools7.includes("not available in this execution context") &&
			tools7.includes("choices_offered") &&
			tools7.includes("user_response") &&
			tools7.includes("clarifyTool,") &&
			loop7.includes("requestClarify?: ClarifyHandler") &&
			loop7.includes("clarify: events.requestClarify,") && // v0.1.135 amended: panggilan execute jadi multi-line (delegateProgress+signal ikut dilewatkan)
			st7.includes("clarify: boolean;") &&
			st7.includes("automations: true,") && st7.includes("clarify: true,") &&
			tab7.includes('key: "clarify"') &&
			app7.includes("requestClarify: (req) =>") &&
			app7.includes("clarifyRef.current = pendingClarify;") &&
			app7.includes("setClarify(pendingClarify);") &&
			app7.includes("setClarify(null);") &&
			app7.includes("function ClarifyCard") &&
			app7.includes("Other (type your answer)") &&
			app7.includes("The user skipped this question. Use your best judgement") &&
			app7.includes("oa-clarify-skip") &&
			css7.includes(".oa-clarify-choice") &&
			entry7.includes('s === "clfy"') &&
			entry7.includes('t.name === "clarify"') &&
			entry7.includes("startsWith('{\"question\"')") &&
			entry7.includes("clarifyCall(") &&
			entry7.includes("SIP-SELESAI") &&
			entry7.includes("__oaClfyCheck") &&
			build7.includes("__oaClfyCheck") &&
			build7.includes('"webe", "clfy"') &&
			build7.includes("skip=best-judgement");
		if (ok) {
			console.log("✓ v0.1.80: clarify tool — Hermes schema/envelope parity · requestClarify pause · 3-mode card + Other + Skip · toolset ON");
		} else {
			console.error("✗ v0.1.80 clarify wiring drifted");
			failed++;
		}
	}
	{
		const css13 = read("styles.css");
		const sugsBlk = (css13.match(/\.oa-quickask-sugs \{[\s\S]*?\n}/) || [""])[0];
		const sugBlk = (css13.match(/\.oa-quickask-sug \{[\s\S]*?\n}/) || [""])[0];
		const lane13 = read("test/real-preview/chat-entry.tsx");
		const ok =
			sugsBlk.includes("flex-wrap: nowrap;") &&
			sugsBlk.includes("overflow-x: auto;") &&
			sugBlk.includes("flex: none;") &&
			css13.includes(".oa-quickask-sugs::-webkit-scrollbar-thumb") &&
			lane13.includes("chipsScrollRow") &&
			lane13.includes("chipsOverflow") &&
			lane13.includes("chipsAllPresent");
		if (ok) {
			console.log("✓ v0.1.86: quick-ask chip row = horizontal scroll (nowrap · overflow-x auto · flex:none · thin scrollbar)");
		} else {
			console.error("✗ v0.1.86 chip scroll row drifted");
			failed++;
		}
	}
	{
		const css25 = read("styles.css");
		const lane25 = read("test/real-preview/build.mjs");
		const mark25 = "QUICK ASK FIELD RESET (v0.1.98";
		const ok =
			css25.includes(mark25) &&
			css25.includes('.oa-quickask input:not([type="checkbox"]):not([type="radio"]),\n.oa-quickask textarea,\n.oa-quickask select {') &&
			css25.includes('.oa-quickask input:not([type="checkbox"]):not([type="radio"]):hover,') &&
			css25.includes(".oa-quickask textarea:hover,\n.oa-quickask textarea:active,\n.oa-quickask textarea:focus,") &&
			css25.includes(".oa-quickask .oa-quickask-input {\n\twidth: 100%;") &&
			css25.includes(".oa-quickask .oa-quickask-input:focus {") &&
			!css25.includes("\n.oa-quickask-input {") &&
			!css25.includes("\n.oa-quickask-input:focus {") &&
			!css25.includes(".oa-quickask :is(") &&
			css25.includes('.oa-quickask input:not([type="checkbox"]):not([type="radio"])::placeholder,\n.oa-quickask textarea::placeholder {') &&
			lane25.includes("composer hover moved paint") &&
			lane25.indexOf("composer hover moved paint") < lane25.indexOf("coarse-pointer (touch)");
		if (ok) {
			console.log("✓ v0.1.98: hover-netral composer quickask — reset global parity, probe desktop-mode");
		} else {
			console.error("✗ v0.1.98 quickask composer hover fix drifted");
			failed++;
		}
	}
	{
		const css26 = read("styles.css");
		const lane26 = read("test/real-preview/build.mjs");
		const ok =
			!css26.includes(".oa-quickask :is(") &&
			css26.includes("font-family: inherit;\n\tletter-spacing: inherit;\n\tcolor: inherit;") &&
			!regionFrom(css26, "QUICK ASK FIELD RESET", { label: "quickask-reset" }).includes("font: inherit;") &&
			lane26.includes("composer metrics not its own") &&
			lane26.indexOf("composer metrics not its own") < lane26.indexOf("coarse-pointer (touch)");
		if (ok) {
			console.log("✓ v0.1.99: quickask reset = selector polos (no :is inflation), font longhand, composer metrics resolved-terukur di lane");
		} else {
			console.error("✗ v0.1.99 quickask specificity trap regressed");
			failed++;
		}
	}
	{
		const bld19 = read("test/real-preview/build.mjs");
		const ok =
			bld19.includes("r.seamClamped === true") &&
			bld19.includes("g.closeW === 28") &&
			bld19.includes("r.gripGlyphGone === true");
		if (ok) {
			console.log("✓ v0.1.100: lane kunci nilai terukur seam + close 28 + glyph gone");
		} else {
			console.error("✗ v0.1.100 seam measured-pack drifted");
			failed++;
		}
	}
	{
		const ca19 = read("src/ui/ChatApp.tsx");
		const bld19 = read("test/real-preview/build.mjs");
		const ok =
			ca19.includes('addEventListener("pointercancel", onPointerDone, true)') &&
			ca19.includes('addEventListener("mousemove", onMouseMove, true)') &&
			ca19.includes("e.buttons === 0") &&
			ca19.includes('window.addEventListener("pointerup", onPointerDone, true)') &&
			bld19.includes("GEJALA OWNER") &&
			bld19.includes("sel fallback witness failed");
		if (ok) {
			console.log("✓ v0.1.101: selDrag tiga jalan keluar (cancel/window/buttons) · lane witness cancel-survival");
		} else {
			console.error("✗ v0.1.101 quote-bar finger-trap regressed");
			failed++;
		}
	}
	{
		const chat20 = read("src/ui/ChatApp.tsx");
		const css20 = read("styles.css");
		const bld20 = read("test/real-preview/build.mjs");
		const ent20 = read("test/real-preview/chat-entry.tsx");
		const ok =
			chat20.includes("createPortal(") &&
			chat20.includes("document.body") &&
			css20.includes(".oa-selbar .oa-selbar-btn") &&
			!css20.includes(".oa-app .oa-selbar") &&
			bld20.includes(".oa-fake-leaf") &&
			bld20.includes("contain: strict") &&
			bld20.includes("sel chrome witness failed") &&
			ent20.includes("oa-fake-leaf");
		if (ok) {
			console.log("✓ v0.1.102: selbar portal ke body (contain:strict re-anchor) · selektor re-root · chrome-mirror witness lane");
		} else {
			console.error("✗ v0.1.102 selbar portal/chrome-mirror regressed");
			failed++;
		}
	}
	{
		const chat21 = read("src/ui/ChatApp.tsx");
		const bld21 = read("test/real-preview/build.mjs");
		const ok =
			chat21.includes(", .oa-msg-content';") &&
			chat21.includes("TAPBACK_EXCLUDE") &&
			bld21.includes("page.mouse.dblclick") &&
			bld21.includes("sel dblclick witness failed");
		if (ok) {
			console.log("✓ v0.1.103: teks = wilayah seleksi (dblclick kata hidup) · chrome = wilayah tapback · lane 5 witness");
		} else {
			console.error("✗ v0.1.103 dblclick text-exclusion regressed");
			failed++;
		}
	}
	{
		const tool22 = read("src/ui/components/tool.tsx");
		const think22 = read("src/ui/components/thinking-bar.tsx");
		const css22 = read("styles.css");
		const bld22 = read("test/real-preview/build.mjs");
		const ent22 = read("test/real-preview/chat-entry.tsx");
		const ok =
			/\.oa-app \.oa-thinking-bar \{[^}]*justify-content: space-between/.test(css22) &&
			css22.includes("border-bottom: 1px dotted var(--text-faint)") &&
			css22.includes(".oa-tool-state-icon.is-streaming") &&
			css22.includes(".oa-tool-glyph.is-spin") &&
			!css22.includes(".oa-app .oa-tool-state-icon .oa-loader-circular") &&
			tool22.includes("oa-tool-glyph") &&
			tool22.includes("M21 12a9 9 0 1 1-6.219-8.56") &&
			tool22.includes("SettingsIcon size={16}") &&
			!tool22.includes("CheckIcon size") &&
			!tool22.includes("XIcon size") &&
			!tool22.includes('Loader variant="circular"') &&
			!think22.includes("ChevronRightIcon") &&
			bld22.includes("toolstate") &&
			bld22.includes("stop-gap=") &&
			ent22.includes("ToolstateFixture");
		if (ok) {
			console.log("✓ v0.1.104: thinking stop right-flush dotted (official) · tool glyphs 16px svg inline lucide + spinner arc · fixture lane");
		} else {
			console.error("✗ v0.1.104 prompt-kit fidelity regressed");
			failed++;
		}
	}
	{
		const css23 = read("styles.css");
		const core23 = read("src/ui/components/preview-diff-core.ts");
		const tsx23 = read("src/ui/components/preview-diff.tsx");
		const ent23 = read("test/real-preview/chat-entry.tsx");
		const bld23 = read("test/real-preview/build.mjs");
		const ok =
			css23.includes(".oa-preview-gutter {") &&
			css23.includes("background: color-mix(in srgb, var(--color-green) 20%, transparent)") &&
			css23.includes("background: color-mix(in srgb, var(--color-red) 20%, transparent)") &&
			css23.includes(".oa-preview-w-add { background: color-mix(in srgb, var(--color-green) 40%, transparent)") &&
			css23.includes(".oa-preview-count-del { color: var(--color-red") &&
			css23.includes(".oa-preview-count-add { color: var(--color-green") &&
			!css23.includes(".oa-app .oa-preview-added { background: var(--background-modifier-success)") &&
			/\.oa-app \.oa-tool-state-icon \.oa-tool-glyph\.is-spin \{\s*animation: oa-spin 1s linear infinite !important/.test(css23) &&
			core23.includes("lineNo") &&
			tsx23.includes("oa-preview-gutter") &&
			tsx23.includes("oa-preview-count-del") &&
			tsx23.includes("oa-preview-count-add") &&
			ent23.includes("visual2") &&
			bld23.includes("preview diff visual contract failed") &&
			bld23.includes("reduce-motion witness failed");
		if (ok) {
			console.log("✓ v0.1.105 (diamendir 106): diff unified (tint resmi 0.2/0.4 + gutter SATU kolom) · spinner berputar bahkan di reduce-motion · witness transform live");
		} else {
			console.error("✗ v0.1.105/106 diff-visual / spin-parity regressed");
			failed++;
		}
	}
	{
		const css24 = read("styles.css");
		const core24 = read("src/ui/components/preview-diff-core.ts");
		const tsx24 = read("src/ui/components/preview-diff.tsx");
		const bld24 = read("test/real-preview/build.mjs");
		const ok =
			css24.includes("border-left: 4px solid transparent;") &&
			css24.includes("border-left-color: color-mix(in srgb, var(--color-green) 55%, var(--background-primary));") &&
			css24.includes("border-left-color: color-mix(in srgb, var(--color-red) 55%, var(--background-primary));") &&
			css24.includes(".oa-app .oa-preview-added .oa-preview-gutter { color: var(--color-green") &&
			css24.includes(".oa-app .oa-preview-removed .oa-preview-gutter { color: var(--color-red") &&
			!css24.includes("color-mix(in srgb, var(--color-green) 14%") &&
			core24.includes("lineNo?: number") &&
			!core24.includes("oldLine") &&
			tsx24.includes('{r.lineNo ?? ""}') &&
			!tsx24.includes("oldLine") &&
			bld24.includes("preview diff visual contract failed") &&
			bld24.includes("reduce-motion witness failed") &&
			bld24.includes("ctxGuts");
		if (ok) {
			console.log("✓ v0.1.106: gutter SATU kolom ala screenshot resmi (nomor rose/olive/abu) · pita tepi 4px anti-hose · tint 0.2/0.4 resmi · spin tetap rotasi");
		} else {
			console.error("✗ v0.1.106 gutter-koreksi / spin-parity regressed");
			failed++;
		}
	}
	{
		const mpp = read("src/ui/markdown-preprocess.ts");
		const mdx = read("src/ui/components/markdown.tsx");
		const mtt = read("test/markdown.test.cjs");
		const men = read("test/markdown-entry.ts");
		const ent25 = read("test/real-preview/chat-entry.tsx");
		const bld25 = read("test/real-preview/build.mjs");
		const ok =
			mpp.includes("export function sanitizeMermaidSrc") &&
			mpp.includes("MERMAID_SUBGRAPH_LINE") &&
			mdx.includes("sanitizeMermaidSrc(guardAssistantDiagramRemoteMedia(seg.content))") &&
			men.includes("sanitizeMermaidSrc") &&
			men.includes("guardAssistantDiagramRemoteMedia") &&
			mtt.includes('subgraph "Agent Loop ✨"') &&
			ent25.includes("mermaidSalvage") &&
			ent25.includes("subgraph Agent Loop ✨") &&
			bld25.includes("h.mermaidSalvage");
		if (ok) {
			console.log("✓ v0.1.107: mermaid salvage — judul subgraph bare ber-emoji terkutip sebelum lexer · id/[title]/quoted tak disentuh · lane md saksi");
		} else {
			console.error("✗ v0.1.107 mermaid salvage regressed");
			failed++;
		}
	}
	{
		// v0.1.108 lobe Data Entry port (owner: komponen lobe-ui data entry
		// dipakai di page settings — scope BOTH via kartu): Approval mode
		// menjadi rail segmented tiga opsi; temperature & max output tokens
		// menjadi slider + kotak angka sinkron dua arah. Port VANILA (nol
		// React) dari lobe-ui Segmented/SliderWithInput — kontrak behavior
		// curl-verified raw 2026-08-07 (docs/reference/reference-sources.md): thumb
		// meluncur + radiogroup roving tabindex; ketik bolak-balik sinkron
		// dengan slider; clamp di rail saat commit; unlimitedInput
		// membebaskan kotak tokens melebihi rail; NaN/null diabaikan.
		// Dropdown modes lama dan slider/text native dua baris itu lenyap.
		const sc108 = read("src/ui/settings-controls.ts");
		const st108 = read("src/settingsTab.ts");
		const css108 = read("styles.css");
		const bld108 = read("test/real-preview/build-settings.mjs");
		const ok =
			sc108.includes("export function createSegmented") &&
			sc108.includes("export function createSliderInput") &&
			sc108.includes("radiogroup") &&
			/* v0.1.199 (Phase 5): the approval rail moved with safety() and one
			   slider with advanced(); the tab still drives three sliders. Pin every
			   owner so a lost call site cannot hide behind a surviving one. */
			read("src/settings/sections/safety.ts").includes("createSegmented({") &&
			!st108.includes("createSegmented({") &&
			st108.includes("createSliderInput({") &&
			read("src/settings/sections/advanced.ts").includes("createSliderInput({") &&
			!st108.includes("for (const m of modes)") &&
			!st108.includes("setLimits(-1, 2, 0.05)") &&
			!st108.includes("String(s.maxTokens)") &&
			css108.includes(".oa-settings .oa-seg {") &&
			css108.includes(".oa-settings .oa-slideinput {") &&
			bld108.includes("probes.F27seg") &&
			bld108.includes("probes.F27slide");
		if (ok) {
			console.log("\u2713 v0.1.108: lobe Data Entry di settings \u2014 rail segmented approval \u00b7 slider+input sinkron temp/tokens \u00b7 unlimitedInput \u00b7 probe F27seg/F27slide saksi");
		} else {
			console.error("\u2717 v0.1.108 lobe Data Entry port regressed");
			failed++;
		}
	}
	{
		const sfSrc = read("src/ui/components/search-field.tsx");
		const chatApp115 = read("src/ui/ChatApp.tsx");
		const css115 = read("styles.css");
		const ent115 = read("test/real-preview/chat-entry.tsx");
		const bld115 = read("test/real-preview/build.mjs");
		const ok =
			sfSrc.includes("SATU komponen pencarian") // header rationale v0.1.115
			&&
			sfSrc.includes("oa-searchbox--") &&
			sfSrc.includes("Escape") &&
			chatApp115.includes("./components/search-field") &&
			css115.includes(".oa-app .oa-searchbox--pill,") &&
			css115.includes(".oa-app .oa-searchbox--strip,") &&
			css115.includes("-webkit-search-cancel-button") &&
			ent115.includes("sboxParts") &&
			ent115.includes("panelBoxParts") &&
			bld115.includes("SearchField pill") &&
			bld115.includes("r.escAfterFilled === true");
		if (ok) {
			console.log("\u2713 v0.1.115: satu SearchField untuk semua chat search \u2014 strip menu + pill panel \u00b7 \u2715 dua tahap Escape \u00b7 saksi menu2+slash");
		} else {
			console.error("\u2717 v0.1.115 SearchField unification regressed");
			failed++;
		}
	}
	{
		const mk = read("src/ui/markdown-keys.ts");
		const ok =
			mk.includes("computeMarkdownEdit") &&
			mk.includes("markdownTextareaKeydown") &&
			mk.includes("markdownComposerEdit") &&
			mk.includes("SAFE_DELETE_RE") &&
			mk.includes("\u00a0") && // toleransi nbsp contenteditable
			read("src/settingsTab.ts").includes("markdownTextareaKeydown") &&
			read("src/ui/ChatApp.tsx").includes("markdownTextareaKeydown") &&
			read("src/ui/components/prompt-input.tsx").includes("markdownComposerEdit") &&
			read("test/real-preview/build-settings.mjs").includes("F32mdkeys") &&
			read("test/real-preview/chat-entry.tsx").includes("mdPairDel") &&
			read("test/real-preview/build.mjs").includes("md keys");
		if (ok) {
			console.log("\u2713 v0.1.116: rasa editor markdown \u2014 Tab/Shift+Tab \u00b7 list lanjut (bullet/nomor/checkbox/quote, keluar di item kosong) \u00b7 auto-pair+skip+wrap \u00b7 F32mdkeys+slash saksi");
		} else {
			console.error("\u2717 v0.1.116 markdown-keys unification regressed");
			failed++;
		}
	}
	{
		const mk = read("src/ui/markdown-keys.ts");
		const probes117 = read("test/real-preview/build-settings.mjs");
		const ok =
			!mk.includes('document.execCommand("insertText"') &&
			mk.includes("DETERMINISTIS") &&
			!mk.includes("insertWithBreaks") && // adapter execCommand composer juga sudah pensiun (rerender kanonik)
			probes117.includes("noLeak") &&
			!probes117.includes("undoNative");
		if (ok) {
			console.log("\u2713 v0.1.117: execCommand dicabut dari jalur textarea \u2014 mutasi deterministik el.value \u00b7 probe noLeak menjaga");
		} else {
			console.error("\u2717 v0.1.117 execCommand leakage fix regressed");
			failed++;
		}
	}
	{
		const css119 = read("styles.css");
		const driver119 = read("test/real-preview/chat-entry.tsx");
		const gates119 = read("test/real-preview/build.mjs");
		const ok =
			css119.includes(".oa-hub-preview,\n.oa-cron-history {") &&
			!css119.includes(".oa-app .oa-panel-list,\n.oa-app .oa-profile-menu-list,") &&
			css119.includes("overscroll-behavior dipulihkan ke blok asli") &&
			css119.includes(".oa-app .oa-panel-row-text > *") &&
			css119.includes(".oa-app .oa-profile-menu > .oa-searchbox--strip") &&
			driver119.includes("listNoXOverflow") &&
			driver119.includes("profileStripPad") &&
			gates119.includes("listNoXOverflow !== true");
		if (ok) {
			console.log("✓ v0.1.119: un-merge list panel/profil dari blok 2848 · baris disegel overflow · strip profil 6/10 · ghost+listXwitness menjaga");
		} else {
			console.error("✗ v0.1.119 panel/profile un-merge regressed");
			failed++;
		}
	}
	{
		const css120 = read("styles.css");
		const driver120 = read("test/real-preview/chat-entry.tsx");
		const gates120 = read("test/real-preview/build.mjs");
		const ok =
			!css120.includes(".oa-app .oa-slash-menu,\n.oa-app .oa-model-menu-list,") &&
			css120.includes("overscroll dipulihkan ke blok asli") &&
			css120.includes("BENAR-BENAR pasangan aslinya") &&
			driver120.includes("modelListNoXOverflow") &&
			driver120.includes("slashHdrNoRule") && /* v0.1.165 renamed: hairline retired (Hermes parity) */
			gates120.includes("modelListPadPin === true") &&
			gates120.includes("menuRuleOk");
		if (ok) {
			console.log("✓ v0.1.120: un-merge lengkap — slash-menu & model-menu-list pulang · ghost grup + pin padding/hairline menjaga (menu2, slash3)");
		} else {
			console.error("✗ v0.1.120 slash/model-menu un-merge regressed");
			failed++;
		}
	}
	{
		const css121 = read("styles.css");
		const cf121 = read("src/ui/components/changed-files.ts");
		const ca121 = read("src/ui/ChatApp.tsx");
		const ut121 = read("test/changedFiles.test.cjs");
		const gates121 = read("test/real-preview/build.mjs");
		const ok =
			css121.includes("rgba(var(--color-green-rgb, 46 160 67), 0.14); color: var(--text-success)") &&
			!css121.includes("background: var(--background-modifier-success") &&
			cf121.includes("withWorkspace") &&
			ca121.includes("deriveChangedFiles(turn.parts, settings.workspaceFolder)") &&
			ut121.includes("Projects/Concepts/Materiality & Texture.md") &&
			gates121.includes("falseNotice !== false") &&
			gates121.includes("op badge readability");
		if (ok) {
			console.log("✓ v0.1.121: op badge tint lembut (teks terbaca) · changed-files resolve workspaceFolder · saksi fcard+preview menjaga");
		} else {
			console.error("✗ v0.1.121 op badge / changed-files path regressed");
			failed++;
		}
	}
	{
		const css122 = read("styles.css");
		const driver122 = read("test/real-preview/chat-entry.tsx");
		const gates122 = read("test/real-preview/build.mjs");
		const dangerOld = ".oa-quickask .oa-prompt-action-danger {\n\tbackground: transparent;";
		const ok =
			css122.includes(".oa-app .oa-prompt-action-danger {\n\tbackground: rgba(var(--color-red-rgb, 248 81 73), 0.12);") &&
			!css122.includes(".oa-app .oa-prompt-action-danger {\n\tbackground: transparent;") &&
			!css122.includes(dangerOld) &&
			css122.includes("aspect-ratio: 1 / 1;") &&
			driver122.includes("__oaWorkCheck") &&
			driver122.includes("sendAspect") &&
			gates122.includes("stop rest-face") &&
			gates122.includes("rest-face/capsule check");
		if (ok) {
			console.log("✓ v0.1.122: tint lembut rest (stop/[+], quick ask parity) · aspect-ratio anti-kapsul · saksi empty/working/qask menjaga");
		} else {
			console.error("✗ v0.1.122 rest-face/anti-kapsul regressed");
			failed++;
		}
	}
	{
		const css123 = read("styles.css");
		const pre123 = read("src/ui/markdown-preprocess.ts");
		const mtest123 = read("test/markdown.test.cjs");
		const gates123 = read("test/real-preview/build.mjs");
		const driver123 = read("test/real-preview/chat-entry.tsx");
		const hoverBlock = css123.match(/\.oa-app \.oa-attach-toggle:hover \{[^}]+\}/)?.[0] ?? "";
		const isOpenBlock = css123.match(/\.oa-app \.oa-attach-toggle\.is-open \{[^}]+\}/)?.[0] ?? "";
		const ok =
			hoverBlock.includes("color-mix(in srgb, var(--text-normal) 12%, var(--background-modifier-hover));") &&
			/* deklarasi saja — komentar boleh menyebut var lama (amended) */
			!/background:\s*var\(--background-modifier-active-hover/.test(hoverBlock) &&
			isOpenBlock.includes("color-mix(in srgb, var(--text-normal)") &&
			!/background:\s*var\(--background-modifier-active-hover/.test(isOpenBlock) &&
			pre123.includes("v0.1.123") &&
			pre123.includes("MERMAID_FLOWCHART_HEAD") &&
			mtest123.includes("kurung dalam label kotak → terkutip (kasus owner persis)") &&
			gates123.includes("attach hover netral") &&
			gates123.includes("mermaidParenSalvage") &&
			driver123.includes("mermaidParenSalvage") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.123: hover/is-open [+] tangga netral (tint aksen ala stop pergi) · label kurung mermaid terkutip sebelum lexer · saksi empty-hover+md menjaga");
		} else {
			console.error("✗ v0.1.123 attach-hover netral / mermaid paren salvage regressed");
			failed++;
		}
	}
	{
		const pre124 = read("src/ui/markdown-preprocess.ts");
		const chat124 = read("src/ui/ChatApp.tsx");
		const mtest124 = read("test/markdown.test.cjs");
		const gates124 = read("test/real-preview/build.mjs");
		const driver124 = read("test/real-preview/chat-entry.tsx");
		const canonical124 = read("src/markdown/canonical-output.ts");
		const ok =
			pre124.includes("export function sanitizeMermaidFences") &&
			pre124.includes("walkMarkdownFences") &&
			canonical124.includes("sanitizeMermaidFences") &&
			chat124.includes("canonicalizeAssistantOutput(") &&
			chat124.includes('import { canonicalizeAssistantOutput } from "../markdown/canonical-output"') &&
			mtest124.includes("fence mermaid terselamatkan, fence json & prosa byte-identical") &&
			gates124.includes("saveMermaidSalvage") &&
			driver124.includes("saveMermaidSalvage") &&
			driver124.includes("REPLY_SLASH2") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.124: /save mensanitasi fence mermaid sebelum masuk vault (crash 'PS' startup note render padam) · saksi slash2+unit menjaga");
		} else {
			console.error("✗ v0.1.124 save-export mermaid salvage regressed");
			failed++;
		}
	}
	{
		const pi = read("src/ui/components/prompt-input.tsx");
		const mk = read("src/ui/markdown-keys.ts");
		const st = read("src/settings.ts");
		/* 2026-08-24 (Phase 3): row "Enter sends message" pindah ke modul
		   general — yang dijaga di sini copy penjelas chord-nya, jadi
		   subjeknya ikut pindah file. */
		const tab = read("src/settings/sections/general.ts");
		const app = read("src/ui/ChatApp.tsx");
		const ent = read("test/real-preview/chat-entry.tsx");
		const bld = read("test/real-preview/build.mjs");
		const bs = read("test/real-preview/build-settings.mjs");
		const ut = read("test/markdown.test.cjs");
		const ok =
			pi.includes('sendKey: enterToSend ? "enter" : "shift-enter"') &&
			pi.includes("SELALU mengirim") &&
			pi.includes("e.ctrlKey || e.metaKey || (enterToSend && !e.shiftKey) || (!enterToSend && e.shiftKey)") &&
			pi.includes('document.execCommand("insertLineBreak")') && // satu-satunya jalur newline byte-benar (lane-proof)
			pi.includes("isNewlineChord") &&
			!pi.includes("const plain = !e.shiftKey") && // cabang tombol-mati pabrik lumat
			mk.includes('type SendChord = "enter" | "shift-enter"') &&
			mk.includes("sendKey?: SendChord") &&
			mk.includes('opts.sendKey === "shift-enter"') &&
			st.includes("enterToSend: false,") &&
			!st.includes("enterToSend: true,") && // bawaan dibalik per owner
			tab.includes("Shift+Enter sends, Enter inserts a newline") &&
			tab.includes("Ctrl/Cmd+Enter always sends") &&
			app.includes("(Shift+Enter to send)") &&
			!app.includes("(Ctrl+Enter to send)") &&
			app.includes("Shift+Enter queues this prompt") &&
			ent.includes('scenarioParam() === "keys"') && // fase-2 toggle ON di browser asli
			bld.includes("driveKeys") &&
			bld.includes("newlineSentNothing") &&
			bld.includes("ctrlEnterSent") &&
			bld.includes("?s=keys") &&
			bs.includes("probes.F34") &&
			ut.includes("computeMarkdownEdit: mkEdit") &&
			read("test/markdown-entry.ts").includes('from "../src/ui/markdown-keys"') &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.127: chord kirim — bawaan Shift+Enter · Enter=baris baru sampai wire · Ctrl/Cmd+Enter selalu kirim · saksi driveKeys dua mode + F34 + unit mkEdit");
		} else {
			console.error("✗ v0.1.127 send-chord regressed");
			failed++;
		}
	}
	{
		const pdf = read("src/ui/attach/pdf.ts");
		const rel = read("scripts/release.mjs");
		const bv = read("scripts/build-vendor.mjs");
		const bld = read("test/real-preview/build.mjs");
		const ent = read("test/real-preview/chat-entry.tsx");
		const app = read("src/ui/ChatApp.tsx");
		const fu = read("src/ui/components/file-upload.tsx");
		let dtsGone = false;
		try {
			read("src/ui/attach/pdf-worker.d.ts");
		} catch {
			dtsGone = true;
		}
		const ok =
			pdf.includes("URL.createObjectURL(blob)") &&
			pdf.includes("worker = new Worker(blobUrl)") &&
			pdf.includes("GlobalWorkerOptions.workerPort = worker") &&
			pdf.includes("PDF_ATTACH_TIMEOUT_MS = 30_000") &&
			pdf.includes("isEvalSupported: false") &&
			pdf.includes('import("pdfjs-dist/legacy/build/pdf.mjs")') &&
			!pdf.includes('import("pdfjs-dist/build/pdf.worker.js")') && // jalur inline lama LUMAT
			pdf.includes("src.app.vault.adapter.readBinary") &&
			dtsGone &&
			rel.includes('"vendor/pdf.worker.min.js"') &&
			bv.includes('export const VENDOR_REL = "vendor/pdf.worker.min.js"') &&
			bv.includes('legacy/build/pdf.worker.min.mjs') &&
			bv.includes("bundle: true") &&
			bld.includes("__oaPdfWorkerB64") &&
			bld.includes("buildVendorFile") &&
			ent.includes("__oaPdfWorkerB64") &&
			ent.includes('pluginDir: ".obsidian/plugins/openagent"') &&
			app.includes("pdfWorker={props.pluginDir") &&
			fu.includes("pdfWorker") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.130: pdf.worker eksternal (vendor file + blob Worker asli) · main.js menyusut ✓ · seller rilis/lane komplit");
		} else {
			console.error("✗ v0.1.130 pdf worker externalization regressed");
			failed++;
		}
	}

	return failed;
};
