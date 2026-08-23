/**
 * Smoke guards whose only source inputs are src/settingsTab.ts and
 * src/settings.ts.
 *
 * Moved verbatim from test/smoke.test.cjs (Phase 3 of the smoke/harness
 * split). Guard conditions and messages are unchanged; only the enclosing
 * function, one level of indentation, and the repo-root anchor for blocks
 * that shadow read() with a __dirname-relative helper differ.
 */

const { ROOT, read, fs, path } = require("./harness.cjs");

// Returns the number of failed guards so the orchestrator can fold it into
// its own counter. Guards keep using the bare `failed++` they were written
// with, so the moved code stays byte-identical apart from indentation.
module.exports = function settingsGuards() {
	let failed = 0;

	// v0.1.179 (owner: "bisa gak ganti jadi picker seperti setting model"):
	// the embedding model is a DROPDOWN seeded from the active provider's
	// catalog, not a hand-typed text field — consistent with the Model tab.
	{
		const tab = read("src/settingsTab.ts");
		const ok =
			tab.includes('setName("Embedding model")') &&
			tab.includes("withCurrentModel(catalogOf(activeProvider), s.memoryEngineEmbedModel)") &&
			tab.includes('"off (keyword recall only)"') &&
			tab.includes('aria-label", "Embedding model"') &&
			!tab.includes('setName("Embedding model").addText');
		if (ok) {
			console.log("✓ v0.1.179: embedding model — catalog dropdown with off option (no manual typing)");
		} else {
			console.error("✗ v0.1.179 embedding model picker drifted");
			failed++;
		}
	}

	// v0.1.181 (owner: "layout UI yang baik di setting"): consistent group
	// labels on the tabs that had none + trimmed the descriptions that grew
	// rows to 94–125px. Evidence: real-DOM probe (all desc-driven rows back
	// to the 79px standard; appearance dropped to 63px).
	{
		const tab = read("src/settingsTab.ts");
		const ok =
			tab.includes('this.subheading(containerEl, "Approvals"') &&
			tab.includes('this.subheading(containerEl, "Scope"') &&
			tab.includes('this.subheading(containerEl, "Chat surface"') &&
			tab.includes('this.subheading(containerEl, "Limits"') &&
			tab.includes('this.subheading(containerEl, "System prompt"') &&
			tab.includes('this.subheading(containerEl, "Scheduled tasks"') &&
			tab.includes("Whole vault: everything visible. Preferred: route to a folder. Strict: hard boundary.") &&
			tab.includes("Pick a model to enable semantic recall");
		if (ok) {
			console.log("✓ v0.1.181: settings layout — group labels on every tab + trimmed descriptions (real-DOM: rows back to 79px)");
		} else {
			console.error("✗ v0.1.181 settings layout group-labels/descriptions drifted");
			failed++;
		}
	}

	// v0.1.183 (owner: "label duplikat Title generation"): the title flow has
	// TWO distinct rows — the enable toggle "Title generation" + the aux-model
	// slot renamed "Title model" (was a confusing duplicate of the toggle).
	{
		const tab = read("src/settingsTab.ts");
		const ok =
			tab.includes('auxModelRow(containerEl, "titleGeneration", "Title model"') &&
			tab.includes('.setName("Title generation")') &&
			tab.includes('.setName("Enable compression")');
		if (ok) {
			console.log("✓ v0.1.183: duplicate label fixed — \"Title generation\" (toggle) vs \"Title model\" (aux slot)");
		} else {
			console.error("✗ v0.1.183 title label split drifted");
			failed++;
		}
	}

	// v0.1.190 (owner: "hidupkan kembali tab about"): an informational About
	// tab — identity (version/build/requirements), full description, MIT
	// license, attribution list (reference-sources.md), and a Copy diagnostics
	// button whose blob never carries secrets. The settings header keeps only
	// the short tagline; the full description moved into About.
	{
		const tab = read("src/settingsTab.ts");
		const ok =
			tab.includes('key: "about", label: "About"') &&
			tab.includes("private about(") &&
			tab.includes('case "about":') &&
			tab.includes('text: shortDesc') &&
			tab.includes('setButtonText("Copy diagnostics")') &&
			tab.includes("MIT License") &&
			tab.includes('"Hermes Agent"') &&
			tab.includes("p.enabled && p.apiKey") &&
			!tab.includes("apiKey: p.apiKey") &&
			!tab.includes("apiKey }");
		if (ok) {
			console.log("✓ v0.1.190: About tab — identity/license/attribution + Copy diagnostics (no secrets); header keeps the short tagline");
		} else {
			console.error("✗ v0.1.190 About tab drifted");
			failed++;
		}
	}

	// v0.1.191 (owner: deskripsi "singkat, padat, jelas, mudah dipahami, dan
	// menerangkan kegunaan utama"): every setDesc literal must stay ≤140 chars
	// (excluding ${...} template holes) and must never leak upstream-internal
	// tokens into the UI. Extracts only setDesc string literals, so code
	// comments carrying those tokens can never trip this guard.
	{
		const tab = read("src/settingsTab.ts");
		const strs = [];
		const re = /\.setDesc\(\s*("(?:[^"\\]|\\.)*"|`[^`]*`)/g;
		let mm;
		while ((mm = re.exec(tab)) !== null) strs.push(mm[1].replace(/^["`]|["`]$/g, ""));
		const strip = (t) => t.replace(/\$\{[^}]*\}/g, "");
		const long = strs.filter((t) => strip(t).length > 140).slice(0, 5);
		const BANNED = ["target_ratio", "protect_last_n", "provider-advertised", "operator-level", "transport details", "the wire"];
		const leaks = [];
		for (const t of strs) for (const b of BANNED) if (t.includes(b)) leaks.push(`${b} → ${t.slice(0, 40)}`);
		const ok = long.length === 0 && leaks.length === 0;
		if (ok) {
			console.log("✓ v0.1.191: settings descriptions — ≤140 chars and no upstream-internal tokens (use-first copy)");
		} else {
			console.error("✗ v0.1.191 settings copy drifted", JSON.stringify({ long, leaks }));
			failed++;
		}
	}

	// v0.1.192 (owner: "personality preset promptnya bisa disamakan lagi
	// dengan hermes desktop?"): the 14 Hermes built-in overlay prompts are
	// VERBATIM from hermes_cli/personality.py BUILTIN_PERSONALITIES (commit
	// 261a4ef, verified 2026-08-22). Spot-pin signatures so a hand-edit back
	// to our old "mode descriptor" copy cannot slip through; the 4 vault
	// extras stay. Reads only the PERSONALITY_OVERLAYS literal, so code
	// comments mentioning these names can never trip it.
	{
		const tab = read("src/settings.ts");
		const overlays = tab.slice(tab.indexOf("export const PERSONALITY_OVERLAYS"), tab.indexOf("export function isOverlayKey"));
		const ok =
			overlays.includes("You are a helpful, friendly AI assistant.") &&
			overlays.includes("You are Neko-chan, an anime catgirl AI assistant, nya~!") &&
			overlays.includes("Captain Hermes, the most tech-savvy pirate") &&
			overlays.includes("hewwo! i'm your fwiendwy assistant uwu~") &&
			overlays.includes("They call me Hermes - I solve problems") &&
			overlays.includes("Greetings, seeker of wisdom.") &&
			overlays.includes("LET'S GOOOO!!!") &&
			overlays.includes("(◕‿◕)") &&
			/* the 4 vault-flavored extras remain */
			overlays.includes('researcher: "Research mode —') &&
			overlays.includes('engineer: "Engineering mode —') &&
			overlays.includes('writer: "Writing mode —') &&
			overlays.includes('librarian: "Librarian mode —') &&
			/* our old mode-descriptor copy is gone */
			!overlays.includes("Friendly, general-purpose assistant mode") &&
			!overlays.includes("Maximum cuteness with uwu-speak") &&
			!overlays.includes("Totally chill, laid-back surfer energy") &&
			!overlays.includes("Patient educator mode");
		if (ok) {
			console.log("✓ v0.1.192: personality prompts — 14 Hermes built-ins verbatim (personality.py @261a4ef) + 4 vault extras, old mode copy retired");
		} else {
			console.error("✗ v0.1.192 personality prompt parity drifted");
			failed++;
		}
	}

	// ---- v0.1.19 — base-URL description is per-provider (owner 2026-07-31:
	// "kan itu deskripsi untuk settingan LM studio, kenapa ada yang lain
	// juga?"). The LM Studio row must never again carry Ollama/OpenRouter.
	{
		const read = (p) => fs.readFileSync(path.join(ROOT, p.replace(/^\.\.\//, "")), "utf8");
		const tab3 = read("../src/settingsTab.ts");
		const ok =
			tab3.includes("baseUrlDesc(viewed.id)") &&
			tab3.includes('case "lmstudio"') && tab3.includes('case "ollama"') &&
			tab3.includes('case "openrouter"') && tab3.includes('case "openai"') &&
			tab3.includes("http://localhost:1234/v1") && tab3.includes("http://localhost:11434/v1") &&
			!tab3.includes("http://localhost:1234/v1 (LM Studio), http://localhost:11434/v1 (Ollama)");
		if (ok) {
			console.log("✓ v0.1.19: base-URL description per viewed provider (no cross-provider list)");
		} else {
			console.error("✗ v0.1.19 base-URL desc drifted (cross-provider examples back, or map lost)");
			failed++;
		}
	}

	{
		// settings-audit S1 guard (2026-07-23): the custom-model-id field must
		// commit on Enter/blur only — per-keystroke commits re-rendered the
		// whole tab (focus lost after char 1) and polluted favoriteModels with
		// half-typed ids ("g", "gp", …).
		const fs = require("fs");
		const stab = fs.readFileSync(path.join(ROOT,"test", "../src/settingsTab.ts"), "utf8");
		if (
			stab.includes("commitCustomModel") &&
			stab.includes('customModel.inputEl.addEventListener("keydown"') &&
			!stab.includes('TextComponent(modelCtl).setPlaceholder("custom model id").onChange(')
		) {
			console.log("✓ settings S1: custom model id commits on Enter/blur (no per-keystroke re-render)");
		} else {
			console.error("✗ settings S1 regressed: custom-model field re-renders per keystroke");
			failed++;
		}
	}
	{
		// hub search box doubles as the add-tap input (owner 2026-07-23,
		// Hermes desktop parity): repo-shaped text shows an add hint, Enter
		// adds the tap, and the just-added tap is loaded immediately — the
		// hubLoaded reset is load-bearing (hubEnsureLoaded(false) early-
		// returns after the first pass). The standalone "Add GitHub tap" row
		// must stay gone.
		const fs = require("fs");
		const stab = fs.readFileSync(path.join(ROOT,"test", "../src/settingsTab.ts"), "utf8");
		const css = fs.readFileSync(path.join(ROOT,"test", "../styles.css"), "utf8");
		if (
			stab.includes("hubTapCandidate") &&
			stab.includes('cls: "oa-hub-tap-hint-btn"') &&
			stab.includes("this.hubLoaded = false;") &&
			stab.includes("Search skills, or paste a repo") &&
			!stab.includes('.setName("Add GitHub tap")') &&
			css.includes(".oa-settings .oa-hub-tap-hint")
		) {
			console.log("✓ hub search: one box — search + add-tap hint (Enter adds & loads instantly), standalone row removed");
		} else {
			console.error("✗ hub search merged-input regressed: hint flow, instant-load or row removal lost");
			failed++;
		}
	}
	{
		// hub default tap (owner directive 2026-07-23): the bundled source is
		// kepano/obsidian-skills (skills/ subtree) ONLY — the five Hermes
		// taps were removed. Stays single-tap; customs come via the search box.
		const fs = require("fs");
		const hub = fs.readFileSync(path.join(ROOT,"test", "../src/agent/hub.ts"), "utf8");
		if (
			hub.includes('repo: "kepano/obsidian-skills/skills"') &&
			!hub.includes('repo: "openai/skills"') &&
			!hub.includes('repo: "vercel-labs/agent-skills"') &&
			(hub.match(/trust: "trusted"/g) ?? []).length === 1
		) {
			console.log("✓ hub default tap: kepano/obsidian-skills (skills/) only — Hermes taps removed");
		} else {
			console.error("✗ hub default tap drifted: kepano tap missing or Hermes taps crept back in");
			failed++;
		}

		// owner directive 2026-07-25: dead tap catalogs must be pruned (load × remove)
		const mn = fs.readFileSync(path.join(ROOT,"test", "../src/main.ts"), "utf8");
		const stab = fs.readFileSync(path.join(ROOT,"test", "../src/settingsTab.ts"), "utf8");
		if (
			hub.includes("export function pruneHubCache") &&
			hub.includes("export function allHubTaps") &&
			mn.includes("pruneHubCache(this.settings.hubCache") &&
			stab.includes("pruneHubCache(this.plugin.settings.hubCache")
		) {
			console.log("✓ hub cache: stale tap catalogs pruned on load and on tap removal");
		} else {
			console.error("✗ hub cache: pruneHubCache/allHubTaps missing or call sites dropped");
			failed++;
		}
	}
	{
		// settings info-architecture (owner directive 2026-07-30, Hermes Desktop
		// parity — official constants.ts SECTIONS literally has id 'chat' label
		// 'Chat' and id 'memory' label 'Memory & Context'): tab 'Agent' renamed
		// to 'Chat', tab 'Memory' to 'Memory & Context', and the context knobs
		// (Context file + Attach active note by default) live under the latter.
		// Notifications v0.1.142: Workspace/Safety remain actionable,
		// Notifications returns with real controls in the shared tab/search
		// registry, while still-empty Appearance/About remain hidden.
		const stab5 = fs.readFileSync(path.join(ROOT,"test", "../src/settingsTab.ts"), "utf8");
		const memSection = stab5.slice(stab5.indexOf("private memory("), stab5.indexOf("private automations("));
		const genSection = stab5.slice(stab5.indexOf("private general("), stab5.indexOf("private providers("));
		const agentSection = stab5.slice(stab5.indexOf("private agent("), stab5.indexOf("private profiles("));
		const workspaceSection = stab5.slice(stab5.indexOf("private workspace("), stab5.indexOf("private safety("));
		const safetySection = stab5.slice(stab5.indexOf("private safety("), stab5.indexOf("private general("));
		if (
			stab5.includes('key: "agent", label: "Chat"') &&
			stab5.includes('label: "Memory & Context"') &&
			!stab5.includes('label: "Agent",') &&
			!stab5.includes('label: "Memory",') &&
			memSection.includes("Context file") &&
			memSection.includes("Attach active note by default") &&
			!genSection.includes("Attach active note by default") &&
			!agentSection.includes("Context file") &&
			!stab5.includes('label: "Sessions",') && // 2026-08-03 (v0.1.64): Sessions tab merged into Chat
			agentSection.includes("Save sessions") &&
			agentSection.includes("Max sessions kept") &&
			// v0.1.126 amended: session rows masih LEAD Chat tapi approval sudah
			// pindah — pembandingnya kini baris non-sesi pertama di tab itu.
			// v0.1.151: "Max tool iterations" ikut pindah ke Advanced → anchor
			// non-sesi pertama di Chat kini "Personality" (v0.1.172: global).
			agentSection.indexOf("Save sessions") < agentSection.indexOf("Personality") &&
			!agentSection.includes("Max tool iterations") && // pindah ke private advanced()
			!agentSection.includes("Approval mode") && // pindah ke private safety()
			!agentSection.includes("Workspace folder") && // pindah ke private workspace()
			safetySection.includes("Approval mode") &&
			safetySection.includes("createSegmented") && // rail antd ikut pindah utuh
			workspaceSection.includes("Workspace folder") &&
			stab5.includes('key: "appearance", label: "Appearance"') &&
			stab5.includes('key: "notifications", label: "Notifications"') &&
			/* v0.1.190: About returns as an informational tab (was hidden-empty) */
			stab5.includes('key: "about", label: "About"') &&
			stab5.includes("private appearance(") &&
			stab5.includes("private notifications(") &&
			stab5.includes("Enable native notifications") &&
			stab5.includes("Completion sound preset") &&
			stab5.includes("private about(")
		) {
			console.log("✓ settings IA: Workspace/Safety remain; Appearance + actionable Notifications + informational About are present in tabs/search");
		} else {
			console.error("✗ settings IA drifted (tab labels reverted or context rows left Memory & Context)");
			failed++;
		}
	}
	// v0.1.147d (schedule UX): the custom schedule is a guided builder (daily /
	// interval / weekly / monthly) plus an advanced raw fallback, and every raw
	// cron is described in words via describeCronExpr — no password-looking
	// "0 9 * * *" shown to the user without a human explanation.
	{
		const cronSrc = read("src/agent/cron.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			cronSrc.includes("export function describeCronExpr") &&
			cronSrc.includes("export function cronExprForInterval") &&
			cronSrc.includes("export function cronExprForWeekly") &&
			tab.includes('d.addOption("daily", "Every day")') &&
			tab.includes('d.addOption("raw", "Advanced (raw cron)') &&
			tab.includes("Means:") &&
			tab.includes("describeCronExpr(task.schedule.expr)");
		if (ok) {
			console.log("✓ v0.1.147d: human schedule builder + described cron (no password-looking expression)");
		} else {
			console.error("✗ v0.1.147d schedule builder/description drifted");
			failed++;
		}
	}
	// v0.1.147j (blueprint catalog): curated, ready-made cron automations with
	// typed slots (time/enum/text/weekdays) + fillBlueprint validation. Honest
	// catalog: no phantom integrations (Gmail/Calendar/weather/inbox).
	{
		const bp = read("src/agent/cronBlueprints.ts");
		const tab = read("src/settingsTab.ts");
		const modal = read("src/settings/modals/blueprint-catalog.ts");
		const low = bp.toLowerCase();
		const ok =
			bp.includes("CRON_BLUEPRINTS") &&
			bp.includes("export function fillBlueprint") &&
			bp.includes("class BlueprintFillError") &&
			bp.includes("WEEKDAY_PRESETS") &&
			bp.includes("DAY_TO_DOW") &&
			bp.includes("resolveSchedule") &&
			bp.includes("formatTemplate") &&
			tab.includes("new BlueprintCatalogModal") && modal.includes("class BlueprintCatalogModal") &&
			tab.includes("Browse templates") &&
			!low.includes("gmail") &&
			!low.includes("calendar") &&
			!low.includes("weather") &&
			!low.includes("inbox") &&
			!low.includes("google-workspace");
		if (ok) {
			console.log("✓ v0.1.147j: blueprint catalog — typed slots + fill validation, no phantom integrations");
		} else {
			console.error("✗ v0.1.147j blueprint catalog drifted");
			failed++;
		}
	}
	// v0.1.152 (settings tidy-up, lobe-ui Empty parity): one empty-state shape
	// (title + description + optional action) replaces the scattered ad-hoc
	// classes; the old per-surface classes are retired.
	{
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const ok =
			tab.includes("private emptyState(") &&
			tab.includes('cls: "oa-empty"') &&
			tab.includes('cls: "oa-empty-title"') &&
			tab.includes('cls: "oa-empty-desc"') &&
			tab.includes('cls: "oa-empty-action"') &&
			tab.includes("this.emptyState(containerEl, {") &&
			css.includes(".oa-settings .oa-empty {") &&
			css.includes(".oa-settings .oa-empty-title {") &&
			css.includes(".oa-settings .oa-empty-desc {") &&
			css.includes(".oa-settings .oa-empty-action {") &&
			!css.includes(".oa-skill-empty") &&
			!css.includes(".oa-snippet-empty") &&
			!css.includes(".oa-cron-empty") &&
			!css.includes(".oa-cron-skill-empty") &&
			!css.includes(".oa-cron-history-empty") &&
			!css.includes(".oa-workspace-exclusions-empty");
		if (ok) {
			console.log("✓ v0.1.152: settings empty states unified — lobe-ui Empty shape, old ad-hoc classes retired");
		} else {
			console.error("✗ v0.1.152 settings empty-state unification drifted");
			failed++;
		}
	}
	// v0.1.156 (owner): the snippet tips sit at the TOP of the modal as a
	// quiet card with a lightbulb icon (Lucide via setIcon, no emoji).
	{
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const modal = read("src/settings/modals/snippet.ts");
		const ok =
			modal.includes('setIcon(icon, "lightbulb")') &&
			modal.includes('cls: "oa-snippet-tips-icon"') &&
			modal.includes('cls: "oa-snippet-tips-title"') &&
			modal.indexOf('cls: "oa-snippet-tips"') < modal.indexOf('setName("Title")') &&
			css.includes(".oa-snippet-tips-icon {") &&
			css.includes(".oa-snippet-tips-icon svg {") &&
			css.includes(".oa-snippet-tips {") &&
			css.includes("border: 1px solid var(--background-modifier-border);");
		if (ok) {
			console.log("✓ v0.1.156: snippet tips at the top of the modal — lightbulb card, no emoji");
		} else {
			console.error("✗ v0.1.156 snippet tips card drifted");
			failed++;
		}
	}
	// v0.1.175 (owner: "apa yang perlu ditambah di Memory & Context merujuk
	// Hermes Desktop?"): the desktop tab exposes a Compression block — enabled,
	// threshold, target_ratio, protect_last_n. Ours exposed none of them; the
	// rows now live in the Memory & Context tab and target_ratio is wired into
	// the token-sized verbatim tail.
	{
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const cm = read("src/agent/contextManager.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			setts.includes("compressionTargetRatio") &&
			tab.includes('"Compression"') &&
			tab.includes('"Compress when above"') &&
			tab.includes('"Preserve recent tail"') &&
			tab.includes('"Keep last N messages"') &&
			tab.includes("markModified(stCompressionEnabled") &&
			tab.includes("markModified(stCompressionTargetRatio") &&
			cm.includes("export function pickTokenTailStart") &&
			chat.includes("pickTokenTailStart(base, keepTokens)") &&
			chat.includes("Math.min(startByMessages, startByTokens)");
		if (ok) {
			console.log("✓ v0.1.175: Memory & Context — Compression block (enabled · threshold · target_ratio · protect_last_n) with token-sized tail");
		} else {
			console.error("✗ v0.1.175 compression settings block drifted");
			failed++;
		}
	}
	// v0.1.187 (owner: "reset khusus yang ketik manual, terlebih angka"): a ↺
	// reset button appears only on modified numeric/text fields (NOT toggles,
	// enums, objects, secrets). Restores DEFAULT_SETTINGS via setPath + deep
	// clone; the three numeric fields that had no modified-dot also gained
	// markModified (maxTokens / modelContextLength / requestTimeoutMs).
	{
		const sm = read("src/settingsModified.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			sm.includes("export function setPath(") &&
			tab.includes("private resetButton(setting: Setting, path: string)") &&
			tab.includes('setIcon("rotate-ccw")') &&
			tab.includes('setTooltip("Reset to default")') &&
			tab.includes("this.resetButton(stMaxTokens, \"maxTokens\")") &&
			tab.includes("this.resetButton(stContextWindow, \"modelContextLength\")") &&
			tab.includes("this.resetButton(stRequestTimeout, \"requestTimeoutMs\")") &&
			tab.includes("this.resetButton(stTemperature, \"temperature\")") &&
			tab.includes("this.resetButton(stMemoryCharLimit, \"memoryCharLimit\")") &&
			tab.includes("this.resetButton(stCompressionThreshold, \"compressionThreshold\")") &&
			/* toggles/enums/objects/lists never get a reset button */
			!tab.includes("this.resetButton(stCompressionEnabled") &&
			!tab.includes("this.resetButton(stApprovalMode") &&
			!tab.includes("this.resetButton(stMemoryEnabled") &&
			/* v0.1.188: exclusions are a picked LIST — no ↺ (per-row trash instead) */
			!tab.includes("this.resetButton(stExclusions") &&
			(tab.match(/this\.resetButton\(/g) || []).length === 22;
		if (ok) {
			console.log("✓ v0.1.187: ↺ reset-to-default on numeric/text fields (22 sites, toggles/enums/objects/lists excluded)");
		} else {
			console.error("✗ v0.1.187 reset-button wiring drifted");
			failed++;
		}
	}
	// v0.1.188 (owner: "excluded folder tidak perlu ada reset button"): the
	// Workspace exclusions control keeps its modified-dot but loses the ↺ —
	// it is a picked LIST (each row has its own trash button), so a single
	// reset would blank the whole list at once. markModified stays.
	{
		const tab = read("src/settingsTab.ts");
		const ok =
			tab.includes('markModified(stExclusions, this.plugin.settings, "workspaceExcludedFolders");') &&
			!tab.includes("this.resetButton(stExclusions");
		if (ok) {
			console.log("✓ v0.1.188: exclusions keep the modified-dot but no ↺ reset (list, per-row trash)");
		} else {
			console.error("✗ v0.1.188 exclusions reset-button removal drifted");
			failed++;
		}
	}
	// ---- v0.1.29 — MoA config layer + settings section (hermes_cli/moa_config.
	// py + desktop model-settings.tsx parity): tolerant read / loud write,
	// official seeds, recursion guard, settings draft editor, null-until-saved.
	{
		const read = (p) => fs.readFileSync(path.join(ROOT,"test", p), "utf8");
		const moa = read("../src/agent/moa.ts");
		const set12 = read("../src/settings.ts");
		const st12 = read("../src/settingsTab.ts");
		const ok =
			moa.includes('provider: "openai-codex", model: "gpt-5.5"') &&
			moa.includes('provider: "openrouter", model: "deepseek/deepseek-v4-pro"') &&
			moa.includes('model: "anthropic/claude-opus-4.8"') &&
			moa.includes("validateMoaPayload") &&
			moa.includes("normalizeMoaConfig") &&
			moa.includes("recursive MoA") &&
			moa.includes("exactMoaPresetName") &&
			moa.includes("coerceMoaFanout") &&
			moa.includes("moaConfigComplete") &&
			set12.includes("moa: MoaConfig | null") &&
			set12.includes("normalizeMoaConfig(rawMoa)") &&
			st12.includes('"Mixture of Agents"') &&
			st12.includes("Add reference model") &&
			st12.includes("Set default") &&
			st12.includes("moaSave") &&
			st12.includes("validateMoaPayload({ presets: draft.presets })") &&
			st12.includes("Waiting for a complete preset");
		if (ok) {
			console.log("✓ v0.1.29: MoA config parity (tolerant/loud, seeds) + settings section (draft editor, persist gate)");
		} else {
			console.error("✗ v0.1.29 MoA layer drifted (config/section/persist gate lost)");
			failed++;
		}
	}
	// 2026-08-02 v0.1.50: General tab groups (owner directive) — Backup &
	// Restore holds keys-toggle/export/import; Danger Zone holds both resets;
	// headings must keep this exact order (declaration-level positions).
	{
		const fs = require("fs");
		const path = require("path");
		const st = fs.readFileSync(path.join(ROOT, "src", "settingsTab.ts"), "utf8");
		const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
		const p = (n) => st.indexOf(n);
		const order =
			p('"Backup & Restore"') >= 0 &&
			p('"Backup & Restore"') < p('setName("Include API keys in exports")') &&
			p('setName("Include API keys in exports")') < p('setName("Export settings")') &&
			p('setName("Export settings")') < p('setName("Import settings")') &&
			p('setName("Import settings")') < p('"Danger Zone"') &&
			p('"Danger Zone"') < p('setName("Reset settings")') &&
			p('setName("Reset settings")') < p('setName("Reset everything")');
		if (
			order &&
			!st.includes('"Data & danger zone"') &&
			/\.oa-settings \.oa-subsection\.oa-danger-zone \.oa-subsection-title/.test(css)
		) {
			console.log("✓ general groups: Backup & Restore + Danger Zone — order + hazard tint");
		} else {
			console.error("✗ general groups drifted (order, retirement of combined heading, or tint)");
			failed++;
		}
	}
	{
		const css20 = fs.readFileSync(path.join(ROOT,"test", "../styles.css"), "utf8");
		const tab20 = fs.readFileSync(path.join(ROOT,"test", "../src/settingsTab.ts"), "utf8");
		const ok =
			css20.includes(".oa-quickask .oa-spin {") &&
			css20.includes("animation: oa-calm-fade 1.2s ease-in-out infinite !important;") &&
			tab20.includes('cls: "oa-moa-problems", attr: { role: "alert" }');
		if (ok) {
			console.log("✓ v0.1.93: settings round-1 — spin reduced-motion (scope leak) · MoA problems role=alert");
		} else {
			console.error("✗ v0.1.93 settings audit round-1 drifted");
			failed++;
		}
	}
	{
		// v0.1.109 MoA controls row (owner: "perbaiki mixture of agents
		// setting-item mod-toggle, dropdown samakan (full width), sebelum
		// toggle tambahkan text Enabled, button add preset sesudah input"):
		// pick melebar flex:1, label "Enabled" tampak sebelum toggle, tombol
		// Add pindah SESUDAH input nama. Urutan kode diguard via indexOf
		// (input dulu baru tombol Add); saksi F28moa di settings lane.
		const st109 = read("src/settingsTab.ts");
		const css109 = read("styles.css");
		const bld109 = read("test/real-preview/build-settings.mjs");
		const ok =
			st109.includes('addClass("oa-moa-ctl")') &&
			st109.includes('addClass("oa-moa-ctl-pick")') &&
			st109.includes('oa-moa-ctl-label", text: "Enabled"') &&
			st109.indexOf("const nameText = new TextComponent(newPair)") > -1 &&
			st109.indexOf("const nameText = new TextComponent(newPair)") <
				st109.indexOf('setButtonText("Add preset")') &&
			css109.includes(".oa-settings .oa-moa-ctl-pick {") &&
			css109.includes(".oa-settings .oa-moa-ctl-label {") &&
			bld109.includes("probes.F28moa");
		if (ok) {
			console.log("\u2713 v0.1.109: MoA controls row \u2014 pick full-width \u00b7 label Enabled kelihatan \u00b7 Add preset sesudah input \u00b7 F28moa saksi");
		} else {
			console.error("\u2717 v0.1.109 MoA controls row regressed");
			failed++;
		}
	}
	{
		// v0.1.110 slider parity (owner: "panjang slidernya ada yang gak
		// sama, ada yang pendek ada yang panjang, seharusnya sama"): jebakan
		// klasik flex:1 — rail mewarisi lebar control yang tergantung panjang
		// nama/desc tiap baris. Geometri dikunci fixed: pair 240px (rail =
		// 240 - 64 - gap 16 = 160px di KEDUA baris). F27slide kini ikut
		// meng-assert lebar rail temperature == rail maxTokens (±1px).
		const css110 = read("styles.css");
		const bld110 = read("test/real-preview/build-settings.mjs");
		const ok =
			css110.includes(".oa-settings .oa-slideinput {") &&
			css110.includes("flex: 0 0 240px;\n\twidth: 240px;\n\tmax-width: 100%;") &&
			bld110.includes("sameRail") &&
			bld110.includes("tRailW");
		if (ok) {
			console.log("\u2713 v0.1.110: slider parity \u2014 pair fixed 240px, rail 160px identik di semua baris \u00b7 sameRail diverifikasi F27slide");
		} else {
			console.error("\u2717 v0.1.110 slider parity regressed");
			failed++;
		}
	}
	{
		// v0.1.111 owner bug report (screenshot + "toggle enable di-force ke
		// atas"): (a) input+Add preset dibungkus .oa-moa-ctl-new — satu item
		// flex, wrap tak pernah memisahkannya (F28moa meng-assert SEBARIS);
		// (b) display() merekam scroller sebelum empty() dan memulihkan
		// scrollTop sehabis render — rebuild row terdetas dalam probe tapi
		// y bertahan (F29scroll). nearestScroller walk overflowY auto/scroll
		// jatuh ke scrollingElement; try/catch demi headless.
		const st111 = read("src/settingsTab.ts");
		const css111 = read("styles.css");
		const bld111 = read("test/real-preview/build-settings.mjs");
		const ok =
			st111.includes('createDiv({ cls: "oa-moa-ctl-new" })') &&
			st111.includes("new ButtonComponent(newPair)") &&
			st111.includes("private nearestScroller()") &&
			st111.includes("scroller && scrollY > 0") &&
			css111.includes(".oa-settings .oa-moa-ctl-new {") &&
			bld111.includes("probes.F29scroll") &&
			bld111.includes("sameLine") &&
			bld111.includes("detached");
		if (ok) {
			console.log("\u2713 v0.1.111: MoA pair glue \u2014 Add nempel sebaris sesudah input \u00b7 display() jaga scroll (F29scroll: rebuild terdetas, y bertahan)");
		} else {
			console.error("\u2717 v0.1.111 MoA pair/scroll regressed");
			failed++;
		}
	}
	{
		// v0.1.112 (owner di pane asli: "masalah yang satunya masih ... bagian
		// kirinya seperti ada spasi gitu yang dorong"): rata-KANAN per baris
		// meninggalkan jurang kosong di kiri pada baris komposit tanpa kolom
		// info. Kini .oa-moa-ctl control rata KIRI (flex-start) mengikuti tepi
		// dropdown full-width di atasnya, dan input preset dipadatkan 9rem
		// supaya Enabled·Set default·Delete·[input+Add] muat satu baris di
		// lebar wajar; sempit → pasangan wrap utuh, tetap rata kiri. F28moa
		// meng-assert justify flex-start, nol jurang kiri, dan input ringkas.
		const css112 = read("styles.css");
		const bld112 = read("test/real-preview/build-settings.mjs");
		const ok =
			css112.includes("row-gap: var(--size-4-2);") /* komen rule direvisi v0.1.113 */ &&
			css112.includes("justify-content: space-between;") /* direvisi v0.1.113: dua tepi mentok */ &&
			css112.includes(".oa-settings .oa-moa-ctl-new input {") &&
			css112.includes("width: 9rem;") &&
			bld112.includes("noLeftVoid") &&
			bld112.includes("inputTight") &&
			bld112.includes("justifyBetween"); /* field di-rename v0.1.113 */
		if (ok) {
			console.log("\u2713 v0.1.112: MoA controls rata kiri \u2014 jurang kosong kiri hilang, input 9rem, sebaris di lebar wajar (F28moa saksi)");
		} else {
			console.error("\u2717 v0.1.112 MoA left-align regressed");
			failed++;
		}
	}
	{
		// v0.1.113 (owner screenshot DevTools: "purple space sebelah kiri
		// (dropdown tidak full width)" + "tidak mentok ke kanan"): dua
		// temuan terukur dari app.css resmi — (a) Obsidian SELALU membuat
		// .setting-item-info walau tanpa nama dan CSS native memberi
		// first-child margin-inline-end 16px; info kosong kini
		// disembunyikan (.oa-moa-ctl) agar dropdown mentok tepi konten
		// baris; (b) flex-start hanya memindahkan void ke kanan — kontrol
		// kini space-between: Enabled mentok kiri, Add preset mentok kanan.
		// F28moa menyuntik aturan native margin (refCss lebih tua) lalu
		// membuktikan pickFlushLeft + addFlushRight.
		const css113 = read("styles.css");
		const bld113 = read("test/real-preview/build-settings.mjs");
		const ok =
			css113.includes(".oa-settings .oa-moa-ctl .setting-item-info {") &&
			css113.includes("justify-content: space-between;") &&
			bld113.includes("justifyBetween") &&
			bld113.includes("pickFlushLeft") &&
			bld113.includes("addFlushRight") &&
			bld113.includes("margin-inline-end: var(--size-4-4)");
		if (ok) {
			console.log("\u2713 v0.1.113: MoA dua tepi mentok \u2014 info kosong disembunyikan, space-between, flush kiri+kanan diukur F28moa");
		} else {
			console.error("\u2717 v0.1.113 MoA flush regressed");
			failed++;
		}
	}
	{
		// v0.1.114 (owner: "samakan component search biar selaras" → ternyata
		// search SKILL, bukan bilah atas): hub + installed skills search kini
		// dibangun helper searchField() sebagai KOMPONEN yang sama dengan
		// bilah Search settings (shell oa-settings-search + ikon + clear +
		// has-query + Escape). Kelas input lama (.oa-hub-search /
		// .oa-skills-search) TETAP di input agar probe F tak pindah; SOSOK
		// dibandingkan lewat computed style + tinggi terhadap komponen
		// induk di F31skills. Kebetulan: addTap kini memanggil searchSync().
		const st114 = read("src/settingsTab.ts");
		const css114 = read("styles.css");
		const bld114 = read("test/real-preview/build-settings.mjs");
		const ok =
			st114.includes("private searchField(") &&
			st114.includes("oa-settings-search ${cls}-wrap") &&
			st114.includes("searchSync()") &&
			css114.includes(".oa-settings .oa-skills-search-wrap {") &&
			css114.includes(".oa-settings .oa-hub-controls {") &&
			css114.includes(".oa-settings .oa-hub-search-wrap {") &&
			bld114.includes("probes.F31skills") &&
			bld114.includes("sameLook") &&
			bld114.includes("sameHeight");
		if (ok) {
			console.log("\u2713 v0.1.114: search skills satu komponen dengan Search settings \u2014 shell+ikon+clear+Escape \u00b7 kelas input utuh \u00b7 F31skills saksi rupa");
		} else {
			console.error("\u2717 v0.1.114 skill search component regressed");
			failed++;
		}
	}
	// v0.1.118 (owner): garis halus tabstrip disembunyikan + gap search↔strip tunggal
	{
		const css118 = read("styles.css");
		const probes118 = read("test/real-preview/build-settings.mjs");
		const ok =
			css118.includes("garis halus bawah disembunyikan") &&
			probes118.includes('r.hairline === "0px"') &&
			probes118.includes("r.gap >= 6 && r.gap <= 11");
		if (ok) {
			console.log("\u2713 v0.1.118: tabstrip tanpa garis halus \u00b7 gap search\u2194strip satu sumber (hairline 0px, gap 6-11 dijaga F30search)");
		} else {
			console.error("\u2717 v0.1.118 tabstrip hairline/gap regressed");
			failed++;
		}
	}
	// Notifications v0.1.142: the actionable Notifications destination is in
	// the only section registry and F33 proves its tab, search results, and
	// native/sound rows. Empty Appearance/About remain absent.
	{
		const stab126 = read("src/settingsTab.ts");
		const bs126 = read("test/real-preview/build-settings.mjs");
		const strip126 = stab126.slice(stab126.indexOf("const SECTIONS"), stab126.indexOf("const SECTION_DESC"));
		const idx126 = (needle) => strip126.indexOf(needle);
		const ok =
			idx126('key: "workspace"') > idx126('key: "model"') &&
			idx126('key: "workspace"') < idx126('key: "safety"') &&
			idx126('key: "safety"') < idx126('key: "agent"') &&
			idx126('key: "notifications"') > idx126('key: "memory"') &&
			idx126('key: "notifications"') < idx126('key: "automations"') &&
			idx126('key: "appearance"') > idx126('key: "agent"') &&
			idx126('key: "appearance"') < idx126('key: "command"') &&
			strip126.includes('key: "notifications", label: "Notifications"') &&
			/* v0.1.190: About returns — last tab, with its renderer method */
			strip126.includes('key: "about", label: "About"') &&
			idx126('key: "about"') > idx126('key: "advanced"') &&
			stab126.includes("private workspace(") &&
			stab126.includes("private safety(") &&
			stab126.includes("private appearance(") &&
			stab126.includes("private notifications(") &&
			stab126.includes("private about(") &&
			bs126.includes('"memory", "notifications", "automations"') &&
			bs126.includes("probes.F33") &&
			bs126.includes('pluginCss, "safety"), "safety"') && // F27seg ikut rumah baru
			bs126.includes("notificationsInTabs") &&
			bs126.includes("notificationsInSearch") &&
			bs126.includes("probes.F35sliders") &&
			stab126.includes('ariaLabel: "Max sessions kept"') &&
			stab126.includes('ariaLabel: "Max tool iterations"') &&
			stab126.includes('ariaLabel: "Memory nudge interval"') &&
			stab126.includes("0 disables") &&
			bs126.includes("approvalMovedToSafety") &&
			bs126.includes("workspaceMovedOut") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ Notifications IA: native/sound tab is in tabs/search; Appearance present after Chat; About last tab with renderer; Workspace/Safety and audited sliders remain");
		} else {
			console.error("✗ v0.1.126 tab restructure regressed");
			failed++;
		}
	}
	// v0.1.141 — Settings search is a separate input from shared SearchField.
	// Its inner input must defeat late theme hover/active/focus declarations,
	// suppress transition/animation, and leave visible focus on the shell.
	{
		const css = read("styles.css");
		const preview = read("test/real-preview/build-settings.mjs");
		const typedStateBlock =
			css.includes('.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"],\n' +
				'.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:hover,\n' +
				'.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:active,\n' +
				'.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:focus,\n' +
				'.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:focus-visible {') &&
			css.includes("\tbackground: transparent !important;") &&
			css.includes("\tborder: 0 !important;") &&
			css.includes("\tbox-shadow: none !important;") &&
			css.includes("\toutline: none !important;") &&
			css.includes("\ttransition: none !important;") &&
			css.includes("\tanimation: none !important;") &&
			!css.includes(".oa-settings-search .oa-settings-search-input:hover,");
		const adversarialCoverage =
			preview.includes('body.theme-dark input.oa-settings-search-input[type="search"]:hover') &&
			preview.includes("hoverImmediateDiff") && preview.includes("hoverInFlightDiff") && preview.includes("hoverSettledDiff") &&
			preview.includes("activeImmediateDiff") && preview.includes("activeInFlightDiff") && preview.includes("activeSettledInputDiff") &&
			preview.includes("exitImmediateDiff") && preview.includes("exitInFlightDiff") && preview.includes("exitSettledDiff") &&
			preview.includes('shot("settings-search-hover-entry.png")') &&
			preview.includes('shot("settings-search-hover-in-flight.png")') &&
			preview.includes('shot("settings-search-hover-settled.png")') &&
			preview.includes('shot("settings-search-exit-entry.png")') &&
			preview.includes('shot("settings-search-exit-in-flight.png")') &&
			preview.includes('shot("settings-search-exit-settled.png")') &&
			preview.includes("transitionProperty: cs.transitionProperty") &&
			preview.includes("animationName: cs.animationName");
		if (typedStateBlock && adversarialCoverage) {
			console.log("✓ v0.1.141: Settings search inner input hover hard-pinned against late theme paint/motion");
		} else {
			console.error("✗ v0.1.141 Settings search hover hardening regressed");
			failed++;
		}
	}
	return failed;
};
