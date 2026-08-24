/**
 * Smoke guards whose subject is Settings.
 *
 * Selection is by subject, not by file read: a settings-lane guard may also
 * assert on styles.css or the real-preview witness, and splitting it by file
 * would tear one assertion in half. Blocks that depend on a shared top-level
 * variable of the orchestrator stay there.
 *
 * Moved verbatim from test/smoke.test.cjs (Phases 3 and 3b of the
 * smoke/harness split, completed in Phase 8). Guard conditions and messages
 * are unchanged; only the enclosing function, one level of indentation, and
 * the repo-root path anchor differ.
 *
 * Phase 8 added the remaining 40 settings-subject blocks, which is why this
 * module imports ROOT, fs and path on top of read(). Three guards do not just
 * read a file, they probe the filesystem: one asserts src/buildInfo.ts EXISTS,
 * and two use the defensive "exists ? read : empty string" idiom for
 * settingsSearch.ts / settingsModified.ts. All three paths currently resolve,
 * so check-docs guard 1 validates them; the ternaries are kept as written
 * rather than simplified, because collapsing them would change what the guard
 * tolerates.
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
		// 2026-08-24: the Memory & Context renderer moved to
		// src/settings/sections/memory.ts, so the subject is read from there.
		// The negative moves WITH it — left on settingsTab.ts it would be
		// trivially true and would stop protecting anything.
		const mem = read("src/settings/sections/memory.ts");
		const ok =
			mem.includes('setName("Embedding model")') &&
			mem.includes("withCurrentModel(catalogOf(activeProvider), s.memoryEngineEmbedModel)") &&
			mem.includes('"off (keyword recall only)"') &&
			mem.includes('aria-label", "Embedding model"') &&
			!mem.includes('setName("Embedding model").addText');
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
			read("src/settings/sections/memory.ts").includes("Pick a model to enable semantic recall"); // moved 2026-08-24
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
		const mem183 = read("src/settings/sections/memory.ts");
		const ok =
			tab.includes('auxModelRow(containerEl, "titleGeneration", "Title model"') &&
			tab.includes('.setName("Title generation")') &&
			/* the compression TOGGLE is the third distinct label in this family
			   (aux slot "Compression" vs toggle). It moved to the Memory module
			   and was renamed to Hermes' "Auto-Compression" (sentence-cased) on
			   2026-08-24, which also kills the last name clash with the aux row. */
			mem183.includes('.setName("Auto-compression")') &&
			!tab.includes('.setName("Enable compression")');
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

	// ---- v0.1.193 — satu pemilik untuk knob konteks & kompresi (owner
	// 2026-08-24: "kenapa ada 2 setingan yang sama? ... pindahkan saja ke
	// Memory & Context"). Sejak v0.1.17 tab Model punya blok "Context &
	// compression" sendiri, lalu v0.1.175 menambah blok Compression di modul
	// Memory tanpa menghapus yang lama: tiga baris menulis KEY YANG SAMA dari
	// dua tempat, jadi mengubah satu tidak memperbarui tampilan satunya
	// (Lesson 172, kini ditutup). Guard ini mengunci hasil dedupe:
	//   * kelima row hidup HANYA di src/settings/sections/memory.ts,
	//   * settingsTab.ts hanya menyimpan SLOT MODEL kompresi (auxModelRow),
	//   * nama row = Hermes FIELD_LABELS di-sentence-case (pedoman Obsidian:
	//     "only the first word ... should be capitalized"), jadi tidak ada
	//     Title Case yang menyelinap balik saat seseorang menyalin upstream.
	{
		const mem = read("src/settings/sections/memory.ts");
		const tab = read("src/settingsTab.ts");
		const names = [
			"Context window",
			"Auto-compression",
			"Compression threshold",
			"Compression target",
			"Protected recent messages",
		];
		/* aria-label harus ikut berubah bersama setName: real-preview menanyakan
		   kontrolnya lewat [aria-label], bukan lewat teks baris. */
		const arias = [
			"Context window",
			"Compression threshold",
			"Compression target",
			"Protected recent messages",
		];
		const ok =
			names.every((n) => mem.includes(`.setName("${n}")`)) &&
			names.every((n) => !tab.includes(`.setName("${n}")`)) &&
			arias.every((a) => mem.includes(`"${a}"`)) &&
			/* Title Case dari upstream tidak boleh bocor ke UI */
			!mem.includes("Auto-Compression") &&
			!mem.includes("Compression Threshold") &&
			!mem.includes("Protected Recent Messages") &&
			/* satu-satunya sisa kompresi di tab Model = pemilih model */
			tab.includes('auxModelRow(containerEl, "compression"') &&
			/* dan tidak ada lagi yang menulis key-nya dari settingsTab */
			!tab.includes("s.modelContextLength =") &&
			!tab.includes("s.compressionThreshold =") &&
			!tab.includes("s.compressionProtectLastN =") &&
			!tab.includes("s.compressionEnabled =") &&
			/* Context window jadi baris PERTAMA grup Compression (keputusan
			   owner; Hermes menaruhnya di section Model) — subheading harus
			   muncul sebelum row-nya. */
			mem.indexOf('"Compression",') < mem.indexOf('.setName("Context window")') &&
			mem.indexOf('.setName("Context window")') < mem.indexOf('.setName("Auto-compression")');
		if (ok) {
			console.log("✓ v0.1.193: context/compression knobs have one owner (Memory & Context), aux model slot stays, sentence-case labels");
		} else {
			console.error("✗ v0.1.193 context/compression dedupe drifted (duplicate row, stray writer, or Title Case label)");
			failed++;
		}
	}

	// ---- v0.1.194 — renderer yang diekstrak harus TETAP TERPASANG
	// (Phase 3, 2026-08-24). Red-proof R5 menemukan lubang nyata: menghapus
	// baris pemanggil `terminalSection(...)` membuat seluruh section Terminal
	// & Processes tidak pernah dirender, dan NOL guard protes — typecheck pun
	// hijau karena fungsi modul memang masih dipakai importnya. Lubang ini
	// SUDAH ADA sebelum ekstraksi (call site `this.terminalSettings(...)`
	// juga tak pernah dipin), tapi ekstraksi menaikkan risikonya: pemanggil
	// dan definisi kini di file berbeda, jadi orang bisa merapikan satu file
	// tanpa melihat satunya.
	//
	// Guard ini mengunci RANTAI LENGKAP tiap modul: import → pemanggilan
	// dengan sectionContext() → subheading pengantarnya (untuk terminal,
	// yang dirender inline oleh capabilities(), bukan sebagai tab sendiri).
	// Bukan sekadar "fungsinya ada".
	{
		const tab = read("src/settingsTab.ts");
		const wired = [
			{
				what: "memory",
				imp: 'import { memory as memorySection } from "./settings/sections/memory";',
				call: "memorySection(this.sectionContext(), host);",
			},
			{
				what: "terminal",
				imp: 'import { terminalSettings as terminalSection } from "./settings/sections/terminal";',
				call: "terminalSection(this.sectionContext(), containerEl);",
			},
		];
		const ok =
			wired.every((w) => tab.includes(w.imp) && tab.includes(w.call)) &&
			/* method privat lamanya benar-benar hilang, bukan disisakan mati */
			!tab.includes("private terminalSettings(") &&
			!tab.includes("private memory(") &&
			/* Terminal tetap hidup di dalam Capabilities, di bawah subheading-nya */
			tab.indexOf('this.subheading(containerEl, "Terminal & Processes"') <
				tab.indexOf("terminalSection(this.sectionContext(), containerEl);") &&
			/* dan modulnya memang mengekspor fungsi yang diimpor itu */
			read("src/settings/sections/terminal.ts").includes("export function terminalSettings(ctx: SectionContext, containerEl: HTMLElement): void") &&
			read("src/settings/sections/memory.ts").includes("export function memory(ctx: SectionContext, containerEl: HTMLElement): void");
		if (ok) {
			console.log("✓ v0.1.194: extracted section renderers stay wired (import + sectionContext call + subheading order)");
		} else {
			console.error("✗ v0.1.194 an extracted section renderer lost its call site (section would render empty)");
			failed++;
		}
	}

	// ---- v0.1.19 — base-URL description is per-provider (owner 2026-07-31:
	// "kan itu deskripsi untuk settingan LM studio, kenapa ada yang lain
	// juga?"). The LM Studio row must never again carry Ollama/OpenRouter.
	{
		const tab3 = read("src/settingsTab.ts");
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
		const stab = read("src/settingsTab.ts");
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
		const stab = read("src/settingsTab.ts");
		const css = read("styles.css");
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
		const hub = read("src/agent/hub.ts");
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
		const mn = read("src/main.ts");
		const stab = read("src/settingsTab.ts");
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
		const stab5 = read("src/settingsTab.ts");
		// 2026-08-24: Memory & Context is no longer a slice of the class — it is
		// its own module, so the section boundary is the file boundary.
		const memSection = read("src/settings/sections/memory.ts");
		const genSection = stab5.slice(stab5.indexOf("private general("), stab5.indexOf("private providers("));
		const agentSection = stab5.slice(stab5.indexOf("private agent("), stab5.indexOf("private profiles("));
		const workspaceSection = stab5.slice(stab5.indexOf("private workspace("), stab5.indexOf("private safety("));
		const safetySection = stab5.slice(stab5.indexOf("private safety("), stab5.indexOf("private general("));
		if (
			/* the renderer left the class but the tab still owns wiring it up */
			!stab5.includes("private memory(") &&
			stab5.includes("memorySection(this.sectionContext(), host)") &&
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
		const mem = read("src/settings/sections/memory.ts"); // renderer pindah 2026-08-24
		const tab175 = read("src/settingsTab.ts");
		const cm = read("src/agent/contextManager.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			setts.includes("compressionTargetRatio") &&
			/* NB: settingsTab.ts MASIH memuat "Compression" milik auxModelRow di
			   tab Model (slot model kompresi — sengaja tinggal). Subjek guard ini
			   adalah blok Memory & Context, jadi pin positif harus ke modulnya;
			   pin negatif memastikan duplikat lama tidak hidup lagi. */
			/* 2026-08-24: labels re-pointed at Hermes FIELD_LABELS (verified in
			   apps/desktop/src/app/settings/constants.ts), sentence-cased for
			   Obsidian. "Context window" joined this group as its first row and
			   the duplicate Model-tab block was deleted. */
			mem.includes('"Auto-compression"') &&
			mem.includes('"Compression threshold"') &&
			mem.includes('"Compression target"') &&
			mem.includes('"Protected recent messages"') &&
			mem.includes('.setName("Context window")') &&
			!tab175.includes('.setName("Context window")') &&
			!tab175.includes('.setName("Compression threshold")') &&
			!tab175.includes('.setName("Protected tail messages")') &&
			mem.includes("markModified(stCompressionEnabled") &&
			mem.includes("markModified(stCompressionTargetRatio") &&
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
		const mem187 = read("src/settings/sections/memory.ts"); // Memory renderer pindah 2026-08-24
		const tab = read("src/settingsTab.ts");
		const ok =
			sm.includes("export function setPath(") &&
			tab.includes("private resetButton(setting: Setting, path: string)") &&
			tab.includes('setIcon("rotate-ccw")') &&
			tab.includes('setTooltip("Reset to default")') &&
			tab.includes("this.resetButton(stMaxTokens, \"maxTokens\")") &&
			/* 2026-08-24: Context window pindah ke Memory & Context (baris pertama
			   grup Compression) — pemilik reset-nya ikut pindah ke modul. */
			mem187.includes("ctx.resetButton(stContextWindow, \"modelContextLength\")") &&
			!tab.includes("this.resetButton(stContextWindow") &&
			tab.includes("this.resetButton(stRequestTimeout, \"requestTimeoutMs\")") &&
			tab.includes("this.resetButton(stTemperature, \"temperature\")") &&
			mem187.includes("ctx.resetButton(stMemoryCharLimit, \"memoryCharLimit\")") &&
			mem187.includes("ctx.resetButton(stCompressionThreshold, \"compressionThreshold\")") &&
			/* toggles/enums/objects/lists never get a reset button */
			!mem187.includes("ctx.resetButton(stCompressionEnabled") && // subjek pindah
			!tab.includes("this.resetButton(stApprovalMode") &&
			!mem187.includes("ctx.resetButton(stMemoryEnabled") && // subjek pindah
			/* v0.1.188: exclusions are a picked LIST — no ↺ (per-row trash instead) */
			!tab.includes("this.resetButton(stExclusions") &&
			/* 2026-08-24: hitung CALL SITE nyata di kedua pemilik. Argumen pertama
			   selalu variabel `st…`, jadi pola ini melewatkan baris delegasi di
			   sectionContext() — kalau tidak jumlahnya 23 dan guard hijau karena
			   sebab yang salah. 2026-08-24: blok Context & compression duplikat di
			   tab Model dihapus (−3: stContextWindow/Threshold/ProtectLastN) dan
			   stContextWindow lahir kembali di modul (+1). 10 di settingsTab +
			   10 di modul memory. */
			((tab + mem187).match(/resetButton\(st/g) || []).length === 20;
		if (ok) {
			console.log("✓ v0.1.187: ↺ reset-to-default on numeric/text fields (20 sites, toggles/enums/objects/lists excluded)");
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
		const moa = read("src/agent/moa.ts");
		const set12 = read("src/settings.ts");
		const st12 = read("src/settingsTab.ts");
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
		const st = read("src/settingsTab.ts");
		const css = read("styles.css");
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
		const css20 = read("styles.css");
		const tab20 = read("src/settingsTab.ts");
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
		const mem126 = read("src/settings/sections/memory.ts"); // Memory renderer pindah 2026-08-24
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
			mem126.includes('ariaLabel: "Memory nudge interval"') && // pindah 2026-08-24
			mem126.includes("0 disables") &&
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
	{
		const bundle = read("main.js");
		const st = read("src/settingsTab.ts");
		const ss = read("src/settings.ts");
		const mn = read("src/main.ts");
		const vc = read("src/agent/vaultCompat.ts");
		if (
			bundle.includes("openagent/exports") &&
			/* v0.1.128 amended: identifier tidak lagi dipin di bundle — minify
			   merename mereka; literal kunci `openagentExport` (property key,
			   selamat dari minify) bertahan di bundle. Pin identifier teknis
			   kini dibaca dari src (src tak pernah diminify). */
			ss.includes("normalizeLoadedSettings") &&
			mn.includes("normalizeLoadedSettings") &&
			ss.includes("openagentExport") &&
			!mn.includes("Object.assign({}, DEFAULT_SETTINGS") && // merge logic must live in settings.ts only
			ss.includes("EXPORT_SCHEMA_VERSION") &&
			ss.includes("SENSITIVE_HEADER_RE") &&
			st.includes("Backup & Restore") &&
			st.includes("Danger Zone") &&
			st.includes("Reset everything") &&
			vc.includes("trashFile") // recoverable reset, never vault.delete
		) {
			console.log("✓ data portability: normalize pipeline + versioned export + trash-based reset");
		} else {
			console.error("✗ data portability wiring drifted");
			failed++;
		}
	}
	{
		const st = read("src/settingsTab.ts");
		const helpers = read("src/settings/sections/helpers.ts");
		const css = read("styles.css");
		if (
			st.includes('"Custom system prompt"') &&
			/* Phase 2 amended: stackedTextArea moved to the shared helpers module
			   because both moved (mcp, advanced) and retained (cronForm) renderers
			   call it; stackedControl stays in the tab (only retained callers). */
			helpers.includes("export function stackedTextArea(") &&
			!st.includes("function stackedTextArea(") &&
			/* Phase 2 finding: the CSS pins below only prove the rule exists. Pin the
			   TS side too, or the helper could stop tagging the row and stay green. */
			helpers.includes('addClass("oa-has-stacked")') &&
			st.includes("function stackedControl(") &&
			/* v0.1.182 amended: row variant added for provider+model pairs */
			st.includes("stackedControl(pickSetting, { row: true })") &&
			/* negative pin spans both files now that the helper moved */
			!(st + helpers).includes("addTextArea(") &&
			css.includes(".oa-settings .setting-item.oa-has-stacked textarea") &&
			css.includes(".oa-stacked-control select.dropdown") &&
			!css.includes(".oa-snippet-modal-text") // retired control-column hack
		) {
			console.log("✓ stacked fields: long-text + compound controls inside setting-items (helpers enforced)");
		} else {
			console.error("✗ stacked-field layout drifted (addTextArea or control-column stacking crept back?)");
			failed++;
		}
	}
	{
		const cfg = read("esbuild.config.mjs");
		const main = read("main.js");
		const tab = read("src/settingsTab.ts");
		if (
			cfg.includes("__OA_BUILD_STAMP__") &&
			fs.existsSync(path.join(ROOT, "src", "buildInfo.ts")) &&
			main.includes("console.info") &&
			/20\d\d-\d\d-\d\d \d\d:\d\dZ/.test(main) &&
			tab.includes("BUILD_STAMP")
		) {
			console.log("✓ build stamp baked into bundle + shown in settings header");
		} else {
			console.error("✗ build-stamp wiring drifted");
			failed++;
		}
	}
	{
		// settings-audit S2 guard (2026-07-23): provider disclosure heads must
		// be real <button>s with aria-expanded (keyboard + SR), and profile
		// icon buttons must carry aria-label — not title-only.
		const stab = read("src/settingsTab.ts");
		const css = read("styles.css");
		if (
			stab.includes('cls: `oa-provider-group-label oa-disclosure') &&
			stab.includes('aria-expanded": open ? "true" : "false"') &&
			stab.includes('aria-expanded": this.providersAdvancedOpen') &&
			stab.includes('"aria-label": `Edit profile') &&
			stab.includes('"aria-label": `Clone profile') &&
			stab.includes('"aria-label": `Delete profile') &&
			css.includes(".oa-settings button.oa-provider-group-label {")
		) {
			console.log("✓ settings S2: disclosures are keyboard buttons · profile icon buttons have accessible names");
		} else {
			console.error("✗ settings S2 regressed: disclosure buttons or profile aria-labels lost");
			failed++;
		}
	}
	{
		// settings-audit S3 guard (2026-07-23): five polish fixes —
		// S3-4 the tab strip is keyboard-driven (arrow keys + roving tabindex),
		// S3-5 the test-result line sits below its row and hides while empty,
		// S3-6 the build-stamp tooltip is English (UI-strings contract),
		// S3-7 the mcp.json import label precedes its textarea,
		// S3-8 the clone action lives on its own row (uncramped name field).
		const stab = read("src/settingsTab.ts");
		const css = read("styles.css");
		if (
			stab.includes('nav.addEventListener("keydown"') &&
			stab.includes('"ArrowRight"') &&
			stab.includes("el.tabIndex = on ? 0 : -1") &&
			stab.includes("proves which build is running after file swaps") &&
			!stab.includes("dipakai untuk memastikan") &&
			stab.indexOf('.setName("Test connection")') > -1 &&
			stab.indexOf('.setName("Test connection")') < stab.indexOf('cls: "oa-test-result"') &&
			stab.indexOf('.setName("Import mcp.json")') > -1 &&
			stab.indexOf('.setName("Import mcp.json")') < stab.indexOf('cls: "oa-mcp-import-text"') &&
			stab.includes('setButtonText("Clone active profile")') &&
			css.includes(".oa-settings .oa-test-result:empty")
		) {
			console.log("✓ settings S3: arrow-key tabs · result below row & hidden when empty · English tooltip · import label above field · clone on own row");
		} else {
			console.error("✗ settings S3 regressed: one of the five polish fixes was lost");
			failed++;
		}
	}
	{
		// settings tools UI (owner directive 2026-07-23): Hermes semantics —
		// the five toolset switches are the ONLY tool controls. The per-tool
		// layer (disabledTools schema field, per-tool toggle rows, per-tool
		// CSS) was removed; a legacy key in old data.json is purged on load.
		const stab = read("src/settingsTab.ts");
		const tools = read("src/agent/tools.ts");
		const setts = read("src/settings.ts");
		const css = read("styles.css");
		if (
			!stab.includes("oa-tool-group") &&
			!stab.includes("ALL_TOOLS") &&
			!tools.includes("settings.disabledTools") &&
			!setts.includes("disabledTools: string[]") &&
			!setts.includes("s.disabledTools =") &&
			!css.includes(".oa-settings .oa-tool-group") &&
			stab.includes("One switch per toolset.") && // copy refreshed 2026-07-25 (owner decisions C9/K1)
			setts.includes("delete (s as unknown as Record<string, unknown>).disabledTools")
		) {
			console.log("✓ settings tools: Hermes semantics — toolset switches only, per-tool layer removed & legacy key purged");
		} else {
			console.error("✗ settings tools drifted: per-tool layer crept back in (rows, schema, resolver or CSS)");
			failed++;
		}
	}
	{
		// settings copy band (owner-approved 2026-07-25, C1–C16 + K1 "trim
		// decorative Hermes references"): guards the refreshed descriptions
		// against drift; lesson 20 — flip these strings when copy changes again
		const stabC = read("src/settingsTab.ts");
		const ok =
			stabC.includes("Thinking budget — sent to providers that support it, ignored elsewhere.") &&
			stabC.includes("Named identities: persona + optional provider/model pin") &&
			stabC.includes("Resets to Off each time you open this tab.") &&
			stabC.includes("Applied to every provider request, chat and model-listing alike.") &&
			/* v0.1.181 amended: New profile desc shortened (layout P2) */
			stabC.includes("Blank = fresh persona. Clone = copies the active profile's persona and pins.") &&
			stabC.includes("Bundled source: kepano's Obsidian skills. Search, preview + security-scan, then one-click install") &&
			!stabC.includes("Hermes-style identities") &&
			!stabC.includes("effort ladder") &&
			!stabC.includes("profiles/souls") &&
			!stabC.includes("persist knowledge") &&
			!stabC.includes("agentskills.io SKILL.md files") &&
			!stabC.includes("Config only for now") &&
			!stabC.includes("turn in progress switches") &&
			stabC.includes("(Hermes --yolo)"); // kept on purpose (K1) — explains the "yolo" mode name
		if (ok) {
			console.log("✓ settings copy: owner-approved C1–C16 band present, decorative Hermes refs trimmed (--yolo kept)");
		} else {
			console.error("✗ settings copy: C1–C16 band drifted (new string missing or trimmed Hermes ref back)");
			failed++;
		}
	}
	{
		// Providers IA: this tab configures connections only. Inspecting a row
		// must never activate it; the provider + model pair is chosen atomically
		// in Model (or overridden by a profile pin).
		const stab3 = read("src/settingsTab.ts");
		const css3 = read("styles.css");
		const providerMethod = stab3.slice(stab3.indexOf("\tprivate providers("), stab3.indexOf("\tprivate setTestResult("));
		if (
			providerMethod.includes("providerEditingId") &&
			providerMethod.includes('"Provider connections"') &&
			providerMethod.includes('"Provider used by chat"') &&
			providerMethod.includes('"Choose provider & model"') &&
			providerMethod.includes('"aria-pressed"') &&
			providerMethod.includes("is-viewed") &&
			!providerMethod.includes('setButtonText("Set active")') &&
			!providerMethod.includes("activateProviderCatalog(") &&
			!providerMethod.includes("s.activeProviderId =") &&
			css3.includes(".oa-provider-list button.oa-provider-row.is-viewed")
		) {
			console.log("✓ providers: connection setup is explicit; row selection only opens the editor; chat routing stays in Model/Profiles");
		} else {
			console.error("✗ providers: configuration vs chat-routing separation drifted");
			failed++;
		}
	}
	{
		// per-provider model catalogs (owner goal/report 2026-07-30, Hermes
		// Desktop parity): the pre-v0.1.14 GLOBAL flat favoriteModels list let
		// "Test & fetch" on a NON-active provider overwrite the active
		// provider's catalog AND silently reset the chat model — the lesson-22
		// trap class one level down. Catalogs now live ON each provider
		// (ProviderConfig.models); test-fetch writes only the viewed provider;
		// activation heals the (provider, model) pair; fallback rows list
		// THEIR provider's catalog; the legacy list migrates onto the active
		// provider exactly once (never overwriting data).
		const setts4 = read("src/settings.ts");
		const stab4 = read("src/settingsTab.ts");
		const app4 = read("src/ui/ChatApp.tsx");
		const mc = read("src/agent/modelCatalog.ts");
		if (
			setts4.includes("models: string[];") && // ProviderConfig catalog field
			setts4.includes("migrateLegacyFavoriteModels") &&
			mc.includes("healModelAgainstCatalog") && // empty catalog never clobbers
			stab4.includes("applyFetchedModels(s, viewed.id, models)") && // discovery writes the VIEWED provider only
			stab4.includes("activateProviderCatalog(s, prov)") && // Model-tab Apply keeps a valid provider/model pair
			stab4.includes("const rowCatalog = catalogOf(") && // fallback rows: own provider's catalog
			stab4.includes('entry.model = "";') && // provider change resets the row's model (official)
			app4.includes("catalogOf(getActiveProvider(settings))") && // chat picker: active provider's catalog
			!stab4.includes("favoriteModels") && // the global drawer is gone from the settings UI
			!app4.includes("favoriteModels") // …and from the chat UI (settings.ts keeps only the migration path)
		) {
			console.log("✓ model catalogs: per-provider, test heals only the active provider, fallbacks per-row, legacy migrated");
		} else {
			console.error("✗ model catalogs drifted (global flat list back, test clobbers non-viewed state, or rows lost per-provider options)");
			failed++;
		}
	}
	{
		// Notifications v0.1.142 integration: positive source witnesses connect
		// chat terminal/attention events and cron outcomes to the hardened
		// dispatchers; Stop remains non-error and native sound is silenced only
		// after an app completion cue really plays.
		const notifications = read("src/notifications.ts");
		const sounds = read("src/completionSound.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const main = read("src/main.ts");
		const settings = read("src/settings.ts");
		const ok =
			settings.includes("DEFAULT_NOTIFICATION_SETTINGS") &&
			settings.includes("nativeEnabled: false") &&
			settings.includes("completionSoundEnabled: false") &&
			notifications.includes("this.lastShownByKindContext.get(throttleKey)") &&
			notifications.includes("now - lastShownAt < 1000") &&
			notifications.includes("Ctor.permission === \"default\" ? await Ctor.requestPermission()") &&
			notifications.includes("} else if (!this.env.isAway()) {") &&
			notifications.includes('return "not-away"') &&
			notifications.includes("if (!this.env.isAway() && this.env.isChatVisible()) return \"chat-visible\"") &&
			notifications.includes('tag: `openagent:${event.kind}`') && // context only participates in internal throttle, never OS payload/tag
			sounds.includes("COMPLETION_SOUND_VARIANTS") &&
			sounds.includes("name: \"Two-note comfort\"") &&
			sounds.includes("async playCompletion(contextId: string)") &&
			chat.includes('{ kind: "approvalRequired", contextId: runSessionId }') &&
			chat.includes('{ kind: "inputRequired", contextId: runSessionId }') &&
			chat.includes('{ kind: "turnDone", contextId: runSessionId }') &&
			chat.includes('{ kind: "turnError", contextId: runSessionId }') &&
			chat.includes("const goalContinued = await continueGoalRef.current({") &&
			chat.includes("if (!goalContinued && !abort.signal.aborted)") &&
			chat.includes("if (!abort.signal.aborted) {") &&
			main.includes('{ kind: "backgroundDone", contextId: task.id }') &&
			main.includes('{ kind: "backgroundError", contextId: task.id }') &&
			main.includes("if (!silent && task.notify)") &&
			main.includes('silent: result === "played"') &&
			main.includes("Platform.isDesktopApp") &&
			main.includes("window.focus()") &&
			main.includes("await this.activateView()");
		if (ok) {
			console.log("✓ Notifications integration: privacy-safe desktop gates, terminal chat lifecycle, cron policy, 14-cue audio, and no-double-sound are wired");
		} else {
			console.error("✗ Notifications v0.1.142 integration drifted");
			failed++;
		}
	}
	{
		// Package A: effective profile/chat route is visibly distinct from the
		// editable global default. A profile pin changes the CTA contract from
		// Apply to Save global default and links to Profiles; drafts still never
		// write until the explicit action.
		const stab6 = read("src/settingsTab.ts");
		if (
			stab6.includes("modelPickProviderId") &&
			stab6.includes("modelPickModel") &&
			stab6.includes('this.modelPickModel = "";') && // provider change clears the model draft
			stab6.includes("const conn = resolveConnection(s);") &&
			stab6.includes('text: profileOverridesRoute ? "Profile override" : "Global default"') &&
			stab6.includes('text: "Manage profile pin"') &&
			stab6.includes('this.section = "profiles";') &&
			stab6.includes('.setName("Global default model")') &&
			stab6.includes('.setButtonText(profileOverridesRoute ? "Save global default" : "Apply")') &&
			stab6.includes('.setName("Custom global model id")') &&
			stab6.includes("The active profile pin continues to control this chat.") &&
			stab6.includes("activateProviderCatalog(s, prov);") &&
			stab6.includes("this.modelPickModel ?? s.model") && // action reads the LIVE draft, not a render-time snapshot
			stab6.includes("s.model = model;") &&
			stab6.includes("setDisabled(!pickProvider || !pickModel.trim())") &&
			stab6.includes("applyPick.setDisabled(!v.trim())") && // live enable on draft pick (no full re-render)
			!stab6.includes("modelDd.setValue(s.model).onChange(") // old per-keystroke auto-apply is gone
		) {
			console.log("✓ Model routing: effective profile route and editable global default are distinct; CTA contract is pin-aware");
		} else {
			console.error("✗ main-model pick drifted (auto-apply returned, or draft/apply wiring lost)");
			failed++;
		}
	}
	{
		// queue prompt (owner 2026-07-26, Hermes Desktop parity): the busy-block
		// Notice is replaced by enqueue; Stop parks; drain is edge-independent;
		// attachments ride the filesOverride, never composer's pendingFiles
		const pq = read("src/agent/promptQueue.ts");
		const app = read("src/ui/ChatApp.tsx");
		const setts2 = read("src/settings.ts");
		const mn2 = read("src/main.ts");
		const css2 = read("styles.css");
		const pin = read("src/ui/components/prompt-input.tsx");
		const ok =
				pq.includes("shouldAutoDrain") &&
				pq.includes("serializeForPersist") &&
				pq.includes("export const queueTransactions = new SerializedQueueTransactions()") &&
				pq.includes("export function prepareQueueMutation") &&
				pq.includes("export async function afterSuccessfulQueueCommit") &&
				pq.includes("export function queueMutationTargetIsCurrent") &&
				pq.includes("export function prunePromptQueue") &&
				app.includes("haltAgent") &&
				app.includes("queueDrainingRef") &&
				app.includes("persistencePending: queueTransactions.pending") &&
				app.includes("void afterSuccessfulQueueCommit(") &&
			app.includes("enqueueEntry(sessionId") &&
			app.includes("oa-queue-row") &&
			app.includes("allowEmptySubmit={queue.length > 0}") &&
			app.includes("runAgent(entry.text, entry.attachments, entry.displayText)") && // v0.1.25: displayText rides; slash entries re-dispatch to runSlash
			!app.includes("press ■ or /stop to interrupt") && // the busy-block Notice is gone
			setts2.includes("sanitizePromptQueue") &&
			setts2.includes("promptQueue: {}") &&
			mn2.includes("prunePromptQueue") &&
			css2.includes(".oa-app .oa-queue-row") &&
			pin.includes("allowEmptySubmit");
		if (ok) {
			console.log("✓ queue prompt: enqueue-on-busy, park-on-stop, edge-independent drain, filesOverride, panel + guards");
		} else {
			console.error("✗ queue prompt: parity wiring drifted (store/ChatApp/schema/main/CSS/input)");
			failed++;
		}
	}
	{
		const cm = read("src/agent/contextManager.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const sess = read("src/agent/sessions.ts");
		const loop = read("src/agent/agentLoop.ts");
		const prov = read("src/agent/providers.ts");
		const ok =
			setts.includes("modelContextLength") && setts.includes("compressionEnabled") &&
			setts.includes("compressionThreshold") && setts.includes("compressionProtectLastN") &&
			setts.includes("compressionTargetRatio") &&
			setts.includes("titleGenerationEnabled") && setts.includes("auxModels") &&
			setts.includes("sanitizeAuxModels") &&
			cm.includes("COMPRESSION_NOTE_PREFIX") && cm.includes("pickProtectedStart") &&
			cm.includes("resolveAuxTask") && cm.includes("applyCompressionCache") &&
			cm.includes("validCompressionCache") &&
			chat.includes("maybeCompressConversation") && chat.includes("maybeGenerateTitle") &&
			chat.includes("applyCompressionCache(messagesRef.current, compressionRef.current)") &&
			chat.includes("sessionTitleRef") && chat.includes("compressionRef") &&
			sess.includes("compression?: CompressionCache") &&
			prov.includes("fetchAdvertisedContextLength") && prov.includes("contextLength") &&
			tab.includes("auxModelRow") && tab.includes("Set to main") &&
			/* 2026-08-24: subheading "Context & compression" DIHAPUS dari tab Model
			   (duplikat); knob-nya hidup di modul Memory & Context, slot model
			   kompresi tetap di "Auxiliary models". */
			!tab.includes("Context & compression") && tab.includes("Auxiliary models") &&
			/\bctx\.subheading\(\s*containerEl,\s*"Compression"/.test(
				read("src/settings/sections/memory.ts")
			) &&
			!loop.includes("contextManager");
		if (ok) {
			console.log("✓ v0.1.17: compression engine + aux slots + title generation wired (engine pre-loop, loop stays clean)");
		} else {
			console.error("✗ v0.1.17 compression/title wiring drifted (knobs, engine, chat hooks, aux UI, or loop import)");
			failed++;
		}
	}
	{
		const setts = read("src/settings.ts");
		const sys = read("src/agent/systemPrompt.ts");
		const loop = read("src/agent/agentLoop.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			setts.includes("titleGenerationEnabled: false,") &&
			!sys.includes("): ${t.description}") &&
			sys.includes("- ${t.name} (${t.toolset}") &&
			loop.includes("wireTokens") &&
			tab.includes("Title generation") &&
			tab.includes("titleGenerationEnabled");
		if (ok) {
			console.log("✓ v0.1.147: title generation off by default · compact tool list (no duplicated descriptions) · wire-size log under debugMode");
		} else {
			console.error("✗ v0.1.147 local-model latency tuning drifted");
			failed++;
		}
	}
	{
		const cronSrc = read("src/agent/cron.ts");
		const mainSrc = read("src/main.ts");
		const toolsSrc = read("src/agent/tools.ts");
		const setts = read("src/settings.ts");
		const ok =
			cronSrc.includes("export function scanCronPrompt") &&
			cronSrc.includes("export function buildMonitorBlock") &&
			cronSrc.includes("export function cronHash") &&
			cronSrc.includes("stripInvisibleUnicode") &&
			mainSrc.includes("fetchCronMonitor") &&
			mainSrc.includes("writeCronNoChange") &&
			mainSrc.includes("monitorLastHash === hash") &&
			mainSrc.includes("scanCronPrompt(scopedTask.prompt)") &&
			toolsSrc.includes("monitor_url") &&
			setts.includes("monitorUrl?: string") &&
			setts.includes("monitorLastContent?: string");
		if (ok) {
			console.log("✓ v0.1.147b: cron monitor change-detection (skip unchanged) + prompt security scan (strip invisible · findings) wired end-to-end");
		} else {
			console.error("✗ v0.1.147b cron monitor/security parity drifted");
			failed++;
		}
	}
	{
		const scriptSrc = read("src/agent/cronScripts.ts");
		const mainSrc = read("src/main.ts");
		const setts = read("src/settings.ts");
		const ok =
			scriptSrc.includes("export function sanitizeScriptName") &&
			scriptSrc.includes("defaultCronScriptExecutor") &&
			scriptSrc.includes('req("child_process")') &&
			scriptSrc.includes("CRON_SCRIPT_TIMEOUT_MS") &&
			scriptSrc.includes("minimalEnv") &&
			mainSrc.includes("executeCronScript") &&
			mainSrc.includes("buildScriptContextBlock") &&
			mainSrc.includes("task.noAgent") &&
			mainSrc.includes("Scripts run only on the desktop app") &&
			setts.includes("script?: string;") &&
			setts.includes("noAgent?: boolean;");
		if (ok) {
			console.log("✓ v0.1.147c: cron script/no_agent watchdog — protected folder, lazy Node execFile, desktop-only, no_agent verbatim, script+monitor exclusive");
		} else {
			console.error("✗ v0.1.147c cron script/no_agent parity drifted");
			failed++;
		}
	}
	{
		const setts = read("src/settings.ts");
		const loop = read("src/agent/agentLoop.ts");
		const tools = read("src/agent/tools.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const tab = read("src/settingsTab.ts");
		const red = read("src/agent/redact.ts");
		const ok =
			setts.includes("approvalTimeoutSec: number;") &&
			setts.includes("redactSecrets: boolean;") &&
			setts.includes("checkpointsEnabled: boolean;") &&
			loop.includes("redactSecretsInText(safeResult)") &&
			tools.includes("checkpointBeforeWrite(ctx, path)") &&
			chat.includes("approvalTimeoutSec") &&
			chat.includes("timed out after") &&
			tab.includes("Approval timeout") &&
			tab.includes("Redact secrets") &&
			tab.includes("Checkpoints") &&
			red.includes("redactSecretsInText");
		if (ok) {
			console.log("✓ v0.1.147e: safety parity — approval timeout (auto-deny), secret redaction on tool output, pre-edit checkpoints");
		} else {
			console.error("✗ v0.1.147e safety parity drifted");
			failed++;
		}
	}
	{
		const ws = read("src/agent/webSearch.ts");
		const tools = read("src/agent/tools.ts");
		const setts = read("src/settings.ts");
		const del = read("src/agent/delegate.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			ws.includes("export function parseDdgHtml") &&
			ws.includes("export function resolveSearchBackend") &&
			ws.includes("export async function runWebSearch") &&
			ws.includes("decodeDdgRedirect") &&
			tools.includes('name: "web_search"') &&
			tools.includes("toolset: \"web\"") &&
			tools.includes("backendNeedsKey") &&
			setts.includes("interface WebSearchSettings") &&
			setts.includes("backend: \"ddgs\"") &&
			del.includes('"web_search"') &&
			tab.includes("webSearchSettings") &&
			tab.includes("DuckDuckGo (free)");
		if (ok) {
			console.log("✓ v0.1.147f: web_search parity — ddgs default + brave/tavily/searxng, pure parsers, registered in web toolset + delegate-blocked");
		} else {
			console.error("✗ v0.1.147f web_search parity drifted");
			failed++;
		}
	}
	{
		const client = read("src/agent/mcp/client.ts");
		const stdio = read("src/agent/mcp/stdio.ts");
		const rt = read("src/agent/mcp/runtime.ts");
		const runner = read("src/agent/runner.ts");
		const main = read("src/main.ts");
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const consent = read("src/settings/modals/consent.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			client.includes("class McpClient") &&
			client.includes("tools/list") &&
			client.includes("tools/call") &&
			stdio.includes('req("child_process")') &&
			stdio.includes("class StdioTransport") &&
			rt.includes("class McpRuntime") &&
			rt.includes("mcp__${name}__${toolName}") &&
			rt.includes("consentVersion < 1") &&
			runner.includes("getToolsWithMcp") &&
			runner.includes("mcpApi?: McpApi") &&
			main.includes("new McpRuntime") &&
			main.includes("grantMcpConsent") &&
			main.includes("restorePersistedMcpConsent") &&
			setts.includes("interface McpConsent") &&
			setts.includes("restorePersistedMcpConsent") &&
			tab.includes("new McpConsentModal") && consent.includes("class McpConsentModal") &&
			chat.includes("getToolsWithMcp");
		if (ok) {
			console.log("✓ v0.1.147h: MCP runtime — pure client + lazy stdio + consent-gated runtime + first-use consent, interactive-path-only injection");
		} else {
			console.error("✗ v0.1.147h MCP runtime drifted");
			failed++;
		}
	}
	{
		const http = read("src/agent/mcp/http.ts");
		const rt = read("src/agent/mcp/runtime.ts");
		const cat = read("src/agent/mcp/catalog.ts");
		const inst = read("src/agent/mcp/install.ts");
		const catalogModal = read("src/settings/modals/mcp-catalog.ts");
		const main = read("src/main.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			http.includes("class HttpTransport") &&
			http.includes("MCP_HTTP_ACCEPT") &&
			http.includes("parseSse") &&
			http.includes("mergeHttpHeaders") &&
			http.includes("isHttpUrl") &&
			http.includes("mcp-session-id") &&
			rt.includes("cfg.transport === \"http\"") &&
			rt.includes("new HttpTransport") &&
			rt.includes("requestUrl") &&
			cat.includes("MCP_CATALOG") &&
			cat.includes("7a9ae00795593aa1fdb4e61ecd640e8bfd0c3841") &&
			cat.includes("buildServerConfig") &&
			cat.includes("applyDefaultToolSelection") &&
			cat.includes("catalogEntryFor") &&
			inst.includes("runMcpGitInstall") &&
			inst.includes("defaultMcpExec") &&
			inst.includes("resolveMcpInstallDir") &&
			inst.includes("GIT_TERMINAL_PROMPT") &&
			inst.includes("MCP_INSTALL_FOLDER") &&
			main.includes("installMcpCatalogEntry") &&
			tab.includes("new McpCatalogModal") && catalogModal.includes("class McpCatalogModal") &&
			tab.includes("Install from catalog");
		if (ok) {
			console.log("✓ v0.1.147i: MCP HTTP transport + curated catalog install (pinned git + bootstrap)");
		} else {
			console.error("✗ v0.1.147i MCP HTTP transport / catalog drifted");
			failed++;
		}
	}
	{
		const tab = read("src/settingsTab.ts");
		const catalogModal = read("src/settings/modals/mcp-catalog.ts");
		const ok = catalogModal.includes('form.dataset.envNames = entry.auth.env.map((spec) => spec.name).join(",")');
		if (ok) console.log("✓ MCP catalog exposes rendered env names without values for fixture diagnosis");
		else { console.error("✗ MCP catalog env-name observability drifted"); failed++; }
	}
	{
		const tab = read("src/settingsTab.ts");
		const catalogModal = read("src/settings/modals/mcp-catalog.ts");
		const ok =
			catalogModal.includes('attr: { type: spec.secret ? "password" : "text", placeholder: spec.prompt }') &&
			catalogModal.includes('if (spec.secret) input.autocomplete = "off"') &&
			catalogModal.includes("installMcpCatalogEntry(entry.name, envValues)") &&
			catalogModal.includes("install.disabled = false") &&
			catalogModal.includes("this.onInstalled()") &&
			catalogModal.includes('text: installed ? "Reinstall" : "Install"');
		if (ok) console.log("✓ MCP catalog security contract: secret field, recoverable failure, refresh-on-success, reinstall state");
		else { console.error("✗ MCP catalog security contract drifted"); failed++; }
	}
	{
		const mem = read("src/agent/memory.ts");
		const threat = read("src/agent/threatPatterns.ts");
		const tools = read("src/agent/tools.ts");
		const setts = read("src/settings.ts");
		const mem148 = read("src/settings/sections/memory.ts"); // renderer pindah 2026-08-24
		const cron = read("src/agent/cron.ts");
		const ok =
			mem.includes("applyMemoryAdd") &&
			mem.includes("applyMemoryReplace") &&
			mem.includes("applyMemoryRemove") &&
			mem.includes("scanMemoryEntries") &&
			mem.includes("driftLines") &&
			mem.includes("selectWithinLimit") &&
			mem.includes("memoryCharLimit") &&
			mem.includes("userCharLimit") &&
			mem.includes("firstThreatMessage") &&
			threat.includes("export function firstThreatMessage") &&
			cron.includes('from "./threatPatterns"') &&
			tools.includes('action: { type: "string", description: "add (default), replace, or remove." }') &&
			tools.includes('"replace"') &&
			tools.includes('"remove"') &&
			setts.includes("memoryCharLimit: 4000") &&
			setts.includes("userCharLimit: 2500") &&
			mem148.includes('setName("Memory Budget")') &&
			mem148.includes('setName("Profile Budget")');
		if (ok) {
			console.log("✓ v0.1.148: memory parity — replace/remove + budgets + injection scan + drift guard, shared threat patterns");
		} else {
			console.error("✗ v0.1.148 memory parity drifted");
			failed++;
		}
	}
	{
		const prof = read("src/agent/profiles.ts");
		const tab = read("src/settingsTab.ts");
		const ok =
			prof.includes("resolveIdentity(s: OpenAgentSettings)") &&
			prof.includes("soul ? soul : DEFAULT_IDENTITY") &&
			prof.includes("export function overlayText") &&
			prof.includes("isOverlayKey(key) ? PERSONALITY_OVERLAYS[key] : null") &&
			prof.includes("isOverlayKey(s.personality) ? s.personality : null") && // global, not profile
			!prof.includes("p.personality") &&
			tab.includes('"none (identity only)"') &&
			tab.includes("update(p.id, { soul: soulTa.value })") &&
			!tab.includes("update(p.id, { personality: v })");
		if (ok) {
			console.log("✓ v0.1.149: SOUL / personality split — global personality (display.personality), profiles carry none (v0.1.172)");
		} else {
			console.error("✗ v0.1.149 SOUL/personality split drifted");
			failed++;
		}
	}
	{
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const reason = read("src/ui/components/reasoning.tsx");
		const css = read("styles.css");
		/* Every tab in the SECTIONS registry must have a matching case in
		   renderSectionBody — a key without a case renders an EMPTY tab (the
		   Lesson 107 trap the Appearance tab hit on its first landing). */
		const switchSlice = tab.slice(tab.indexOf("private renderSectionBody"), tab.indexOf("/* ───────────────────────── sections"));
		const sectionKeys = [...(tab.slice(tab.indexOf("const SECTIONS"), tab.indexOf("const SECTION_DESC")).matchAll(/key: "([a-z]+)"/g))].map((m) => m[1]);
		const everyKeyHasCase = sectionKeys.length > 0 && sectionKeys.every((k) => switchSlice.includes(`case "${k}":`));
		const ok =
			setts.includes('toolViewMode: "collapsed"') &&
			setts.includes('reasoningCollapsedByDefault: false') &&
			setts.includes('sessionListDensity: "comfortable"') &&
			setts.includes("showIntroScreen: true") &&
			setts.includes("showReactions: true") &&
			setts.includes('inRaw.toolViewMode === "expanded"') &&
			tab.includes('key: "appearance", label: "Appearance"') &&
			tab.includes('private appearance(') &&
			tab.includes('case "appearance":\n\t\t\tthis.appearance(host);') &&
			everyKeyHasCase &&
			tab.includes('setName("Tool calls")') &&
			tab.includes('setName("Reasoning")') &&
			tab.includes('setName("Session list density")') &&
			tab.includes('setName("Intro screen")') &&
			tab.includes('setName("Reaction buttons")') &&
			chat.includes('settings.toolViewMode === "hidden"') &&
			chat.includes('defaultOpen={settings.toolViewMode === "expanded"}') &&
			chat.includes("defaultOpen={!settings.reasoningCollapsedByDefault}") &&
			chat.includes('settings.sessionListDensity === "compact"') &&
			chat.includes("settings.showIntroScreen ? <Intro") &&
			chat.includes("settings.showReactions && showFeedbackBar(turn)") &&
			reason.includes("isStreaming && defaultOpen") &&
			css.includes('.oa-panel.is-compact .oa-panel-row') &&
			!tab.includes("zoomPercent") &&
			!tab.includes("translucency");
		if (ok) {
			console.log("✓ v0.1.150: Appearance tab — five self-owned chat-surface controls, Obsidian's theme untouched");
		} else {
			console.error("✗ v0.1.150 Appearance tab drifted");
			failed++;
		}
	}
	{
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const tools = read("src/agent/tools.ts");
		const toolC = read("src/ui/components/tool.tsx");
		const chat = read("src/ui/ChatApp.tsx");
		const adv = tab.slice(tab.indexOf("private advanced(containerEl"), tab.indexOf("private notifications(containerEl"));
		const agentSec = tab.slice(tab.indexOf("private agent(containerEl"), tab.indexOf("private appearance(containerEl"));
		const ok =
			setts.includes("checkpointMaxSnapshots: 30") &&
			setts.includes("toolOutputMaxChars: 5000") &&
			setts.includes("Math.min(200, Math.max(5, Math.floor") &&
			setts.includes("Math.min(50_000, Math.max(1_000, Math.floor") &&
			adv.includes('setName("Max tool iterations")') &&
			adv.includes('setName("Tool output limit")') &&
			adv.includes('setName("Checkpoint snapshots kept")') &&
			!agentSec.includes("Max tool iterations") &&
			tools.includes("ctx.settings.checkpointMaxSnapshots") &&
			tools.includes("ctx.app.vault.delete(files[i])") &&
			toolC.includes("maxDisplayChars = MAX_DISPLAY_CHARS") &&
			toolC.includes("split.tool.length > cap") &&
			chat.includes("maxDisplayChars={settings.toolOutputMaxChars}");
		if (ok) {
			console.log("✓ v0.1.151: Advanced parity — max iterations moved in, tool output limit + checkpoint pruning added");
		} else {
			console.error("✗ v0.1.151 Advanced parity drifted");
			failed++;
		}
	}
	{
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const cmd = tab.slice(tab.indexOf("private renderCommandRows"), tab.indexOf("private automations"));
		const ok =
			cmd.includes("grip.draggable = true") &&
			cmd.includes('setIcon(grip, "grip-vertical")') &&
			cmd.includes('row.addClass("is-dragging")') &&
			cmd.includes('e.dataTransfer.effectAllowed = "move"') &&
			cmd.includes("row.addEventListener(\"dragover\"") &&
			cmd.includes("row.addEventListener(\"drop\"") &&
			cmd.includes('"is-drop-before"') &&
			cmd.includes('"is-drop-after"') &&
			cmd.includes("s.promptSnippets.splice(target, 0, moved)") &&
			cmd.includes("mkArrow(\"up\", idx - 1)") && // arrows kept as a11y path
			css.includes(".oa-cmd-grip {") &&
			css.includes("cursor: grab") &&
			css.includes(".oa-snippet-row.is-dragging") &&
			css.includes(".oa-snippet-row.is-drop-before") &&
			css.includes(".oa-snippet-row.is-drop-after") &&
			css.includes("box-shadow: 0 -2px 0 0 var(--interactive-accent)");
		if (ok) {
			console.log("✓ v0.1.154: command drag-reorder — native DnD grip + drop indicators, arrows kept for keyboard/mobile");
		} else {
			console.error("✗ v0.1.154 command drag-reorder drifted");
			failed++;
		}
	}
	{
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const ok =
			tab.includes("private skeletonRows(") &&
			tab.includes('cls: "oa-skeleton"') &&
			tab.includes('cls: "oa-skeleton-row"') &&
			tab.includes('cls: "oa-skeleton-line is-main"') &&
			tab.includes('cls: "oa-skeleton-line is-sub"') &&
			tab.includes("this.skeletonRows(this.hubResultsEl, 3)") &&
			tab.includes("this.skeletonRows(skillsHolder, 2)") &&
			!tab.includes("Loading hub catalogs") &&
			!tab.includes("Loading skills") &&
			css.includes(".oa-settings .oa-skeleton {") &&
			css.includes(".oa-skeleton-line {") &&
			css.includes(".oa-skeleton-line.is-main") &&
			css.includes(".oa-skeleton-line.is-sub") &&
			css.includes("@keyframes oa-skeleton-pulse") &&
			css.includes("prefers-reduced-motion: reduce") &&
			css.includes("animation: none;");
		if (ok) {
			console.log("✓ v0.1.157: skeleton loading rows — hub + cron skills loaders shimmer, reduced-motion safe");
		} else {
			console.error("✗ v0.1.157 skeleton loading rows drifted");
			failed++;
		}
	}
	{
		const eng = read("src/agent/memoryEngine.ts");
		const run = read("src/agent/runner.ts");
		const sp = read("src/agent/systemPrompt.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const setts = read("src/settings.ts");
		const mem176 = read("src/settings/sections/memory.ts"); // renderer pindah 2026-08-24
		const main = read("src/main.ts");
		const ok =
			eng.includes("export function rankFacts") &&
			eng.includes("export function bm25") &&
			eng.includes("export function entityOverlap") &&
			eng.includes("export function temporalWeight") &&
			eng.includes("export function applyRetainOps") &&
			eng.includes("export function parseRetainOps") &&
			eng.includes("export function buildRecallBlock") &&
			eng.includes("export class EngineMemoryStore") &&
			eng.includes("facts.jsonl") &&
			eng.includes("trust") &&
			run.includes("engineForPolicy") &&
			run.includes("EngineMemoryStore") &&
			run.includes("recalledMemory: string | null = null") &&
			sp.includes("recalledMemory?: string | null") &&
			sp.includes("p.recalledMemory") &&
			chat.includes("maybeRetainMemory") &&
			chat.includes("buildRecallBlock(facts, obs)") && // v0.1.178: observations joined
			chat.includes("isTrivialPrompt(q)") &&
			chat.includes("memoryEngineRecallMax") &&
			chat.includes("oa-memory-tag") &&
			chat.includes("<BrainIcon size={11} />") &&
			setts.includes("memoryEngineEnabled") &&
			setts.includes("memoryEngineRetainEveryN") &&
			setts.includes("memoryEngineRecallMax") &&
			mem176.includes('"Structured memory"') &&
			mem176.includes('"Retain every N turns"') &&
			mem176.includes('"Recall budget"') &&
			mem176.includes("markModified(stMemoryEngineEnabled") &&
			main.includes("new EngineMemoryStore(this.app, this.settings.memoryFolder)") &&
			main.includes("this.engineMemory.setFolder(memoryFolder)");
		if (ok) {
			console.log("✓ v0.1.176: structured-memory engine — pure fusion recall + typed retain + facts.jsonl + recall block + settings (plugin-native, no server)");
		} else {
			console.error("✗ v0.1.176 structured-memory engine drifted");
			failed++;
		}
	}
	{
		const prov = read("src/agent/providers.ts");
		const eng = read("src/agent/memoryEngine.ts");
		const chat = read("src/ui/ChatApp.tsx");
		const setts = read("src/settings.ts");
		const mem178 = read("src/settings/sections/memory.ts"); // renderer pindah 2026-08-24
		const ok =
			prov.includes("export async function embedTexts") &&
			prov.includes("/embeddings") &&
			eng.includes("export function cosineSimilarity") &&
			eng.includes("export async function fuseScores") &&
			eng.includes("export function rankObservations") &&
			eng.includes("async searchObservations") &&
			eng.includes("Consolidated observations:") &&
			chat.includes("embedTexts(provider, embedModel, texts)") &&
			chat.includes("engine.searchObservations(q, 4, embed)") &&
			chat.includes("setRecalledCount(facts.length + obs.length)") &&
			setts.includes("memoryEngineEmbedModel") &&
			mem178.includes('"Embedding model"') &&
			mem178.includes("markModified(stMemoryEngineEmbedModel");
		if (ok) {
			console.log("✓ v0.1.178: semantic recall — embedTexts + cosine fusion + observations in recall (optional, no server)");
		} else {
			console.error("✗ v0.1.178 semantic recall drifted");
			failed++;
		}
	}
	{
		const st = read("src/settingsTab.ts");
		const css = read("styles.css");
		const ok =
			st.includes('if (opts?.row) el.addClass("oa-control-row")') &&
			st.includes("stackedControl(pickSetting, { row: true })") &&
			st.includes("stackedControl(row, { row: true })") &&
			st.includes("stackedControl(agg, { row: true })") &&
			css.includes(".oa-stacked-control.oa-control-row") &&
			css.includes("flex-direction: row;") &&
			!st.includes("stackedControl(row);") && // fallback rows converted
			!st.includes("stackedControl(agg)"); // aggregator converted
		if (ok) {
			console.log("✓ v0.1.182: Model tab provider+model pairs side-by-side (Fallback · Global default · MoA Reference · Aggregator)");
		} else {
			console.error("✗ v0.1.182 stacked-control row variant drifted");
			failed++;
		}
	}
	{
		const sc = read("src/ui/settings-controls.ts");
		const tab = read("src/settingsTab.ts");
		const css = read("styles.css");
		const ok =
			sc.includes("if (from !== num) num.value = String(v);") &&
			!sc.includes("num.value = fmt(v)") &&
			sc.includes('unit.className = "oa-slideinput-unit"') &&
			read("src/settings/sections/memory.ts").includes("unit: \"%\"") && // slider % pindah 2026-08-24
			css.includes(".oa-slideinput .oa-slideinput-numwrap {");
		if (ok) {
			console.log("✓ v0.1.186: % sliders — plain number in the box + visible \"%\" unit suffix (no more empty boxes)");
		} else {
			console.error("✗ v0.1.186 slider unit/format split drifted");
			failed++;
		}
	}
	{
		const setts = read("src/settings.ts");
		const tab = read("src/settingsTab.ts");
		const main = read("src/main.ts");
		const chatView = read("src/ui/ChatView.tsx");
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			setts.includes('chatLeafLocation: "left" | "main" | "right"') &&
			setts.includes('chatLeafLocation: "right"') &&
			setts.includes('inRaw.chatLeafLocation === "left" || inRaw.chatLeafLocation === "main"') &&
			tab.includes('setName("Chat panel location")') &&
			tab.includes('addOption("left", "Left sidebar")') &&
			tab.includes('addOption("main", "Main workspace (tab)")') &&
			tab.includes('addOption("right", "Right sidebar")') &&
			tab.includes('markModified(stChatLeafLocation') &&
			tab.includes('moves an open panel there right away') &&
			tab.includes('this.plugin.moveChatViewToConfiguredLocation()') &&
			main.includes('async moveChatViewToConfiguredLocation') &&
			main.includes('const loc = this.settings.chatLeafLocation') &&
			main.includes('workspace.getLeftLeaf(false)') &&
			main.includes('workspace.getLeaf(false)') &&
			main.includes('workspace.getRightLeaf(false)') &&
			main.includes('const root = leaf.getRoot()') &&
			main.includes('root === workspace.leftSplit') &&
			main.includes('root === workspace.rightSplit') &&
			main.includes('const state = leaf.getViewState()') &&
			main.includes('leaf.detach()') &&
			main.includes('target.setViewState(state)') &&
			main.includes('this.pendingChatSessionId') &&
			main.includes('consumePendingChatSessionId()') &&
			main.includes('getCurrentSessionId') &&
			chatView.includes('initialSessionId={this.plugin.consumePendingChatSessionId()}') &&
			chatView.includes('onSessionIdChange={(id) => (this.currentSessionId = id)}') &&
			chat.includes('initialSessionId?: string | null') &&
			chat.includes('onSessionIdChange?: (id: string) => void') &&
			chat.includes('loadConversation(props.initialSessionId)');
		if (ok) {
			console.log("✓ v0.1.162: chat panel location — open MOVES an existing chat per setting; v0.1.163: immediate relocate + session survives the move");
		} else {
			console.error("✗ v0.1.162 chat panel location drifted");
			failed++;
		}
	}
	{
		const app8 = read("src/ui/ChatApp.tsx");
		const goals8 = read("src/agent/goals.ts");
		const cm8 = read("src/agent/contextManager.ts");
		const ses8 = read("src/agent/sessions.ts");
		const st8 = read("src/settingsTab.ts");
		const ok =
			app8.includes('case "/goal"') &&
			app8.includes("maybeContinueGoal") &&
			app8.includes("continuationPrompt(g.text)") &&
			app8.includes("oa-goal-chip") &&
			app8.includes("setGoalSynced(newGoal(arg))") &&
			app8.includes('entry.text.startsWith("/")') &&
			app8.includes("runAgent(entry.text, entry.attachments, entry.displayText)") &&
			goals8.includes("GOAL_MAX_TURNS = 20") &&
			goals8.includes("GOAL_MAX_PARSE_FAILURES = 3") &&
			goals8.includes("GOAL_MAX_TRANSPORT_FAILURES = 5") &&
			goals8.includes("parseGoalVerdict") &&
			goals8.includes("[Continuing toward your standing goal]") &&
			cm8.includes('"goalJudge"') &&
			ses8.includes("goal?: SessionGoal") &&
			st8.includes('"goalJudge"');
		if (ok) {
			console.log("✓ v0.1.25: /goal Ralph loop (judge, continuation, budget, aux slot, drain re-dispatch)");
		} else {
			console.error("✗ v0.1.25 goal drifted (loop, budget guards, aux slot, or chip lost)");
			failed++;
		}
	}
	{
		const we11 = read("src/agent/webExtract.ts");
		const tools11 = read("src/agent/tools.ts");
		const cm11 = read("src/agent/contextManager.ts");
		const st11 = read("src/settingsTab.ts");
		const app11 = read("src/ui/ChatApp.tsx");
		const ok =
			we11.includes("WEB_EXTRACT_CHAR_LIMIT = 15000") &&
			we11.includes("WEB_EXTRACT_STORE_MAX_CHARS = 2_000_000") &&
			we11.includes("truncateWithFooter") &&
			we11.includes("read_note path=") &&
			we11.includes("[TRUNCATED]") &&
			tools11.includes('name: "web_extract"') &&
			!tools11.includes('name: "web_fetch"') &&
			tools11.includes("summarizeWebPage") &&
			tools11.includes('resolveAuxTask(ctx.settings, "webExtract"') &&
			tools11.includes("model: pair.model") &&
			tools11.includes("storeFullPage") &&
			tools11.includes("offset") &&
			cm11.includes('"webExtract"') &&
			st11.includes('"webExtract"') &&
			st11.includes("Web extract") &&
			app11.includes('p.toolName !== "web_extract"');
		if (ok) {
			console.log("✓ v0.1.28: web_extract parity (window+footer, vault store, read_note paging, aux slot+row)");
		} else {
			console.error("✗ v0.1.28 web_extract drifted (window/store/paging/slot lost)");
			failed++;
		}
	}
	{
		const mm = read("src/agent/modelMenu.ts");
		const pick15 = read("src/ui/components/model-picker.tsx");
		const dlg = read("src/ui/components/model-visibility-dialog.tsx");
		const set15 = read("src/settings.ts");
		const app15 = read("src/ui/ChatApp.tsx");
		const css15 = read("styles.css");
		const ok =
			mm.includes("export function collapseModelFamilies") &&
			mm.includes("export function toggleModelVisibility") &&
			mm.includes("export function groupMenuModels") &&
			mm.includes("export function moaPresetMatches") &&
			mm.includes("DEFAULT_VISIBLE_PER_PROVIDER = 50") &&
			mm.includes("export function modelDisplayParts") &&
			pick15.includes("ModelVisibilityDialog") &&
			pick15.includes('"Search models"') &&
			pick15.includes("No models found") &&
			pick15.includes("MoA presets") &&
			pick15.includes("Refresh Models") &&
			pick15.includes("Edit Models…") &&
			pick15.includes("data-kb-active") &&
			dlg.includes("Add provider…") &&
			dlg.includes("No authenticated providers.") &&
			set15.includes("visibleModels: string[] | null") &&
			set15.includes("collapsedMenuProviders: string[]") &&
			app15.includes("providerSlug={conn.providerId}") &&
			dlg.includes("checkbox-container") && // v0.1.34: switch IS the app toggle
			css15.includes(".oa-app .oa-modal-overlay");
		if (ok) {
			console.log("✓ v0.1.32: model menu parity (groups, families, search, kbd, refresh stays open, visibility dialog)");
		} else {
			console.error("✗ v0.1.32 model menu parity drifted (lib, picker labels, dialog, settings fields, or CSS lost)");
			failed++;
		}
	}
	{
		const css21 = read("styles.css");
		const tab21 = read("src/settingsTab.ts");
		const search21Path = path.join(ROOT, "src", "settingsSearch.ts");
		const mod21Path = path.join(ROOT, "src", "settingsModified.ts");
		const search21 = fs.existsSync(search21Path) ? fs.readFileSync(search21Path, "utf8") : "";
		const mod21 = fs.existsSync(mod21Path) ? fs.readFileSync(mod21Path, "utf8") : "";
		const tailMark = "SETTINGS SEARCH + MODIFIED DOT (v0.1.94, additive)";
		const tail21 = css21.includes(tailMark) ? css21.slice(css21.indexOf(tailMark)) : "";
		const harvestGuards = (tab21.match(/this\.searchHarvesting\) return;/g) || []).length;
		/* v0.1.159 amended: hex is sanctioned INSIDE a var() fallback (the
		   contract's own rule). Strip every var(...) before the bare-hex
		   check so a fallback never trips the hardcoded-color guard. */
		const bareHex21 = /#[0-9a-fA-F]{3,8}/.test(tail21.replace(/var\([^()]*\)/g, ""));
		const ok =
			tab21.includes('cls: "oa-settings-search"') &&
			tab21.includes('"aria-label": "Search settings"') &&
			tab21.includes('"aria-label": "Clear search"') &&
			tab21.includes("oa-settings-search-results") &&
			tab21.includes("jumpToSearchResult") &&
			tab21.includes("oa-settings-flash") &&
			tab21.includes("private renderSectionBody(") &&
			harvestGuards === 2 && // hubLazyDescriptions + hubEnsureLoaded
			tab21.includes("if (!this.searchHarvesting) void this.plugin.skillsStore") &&
			search21.includes("export function buildSettingsIndex") &&
			search21.includes("export function filterSettingsIndex") &&
			mod21.includes("export function markModified") &&
			mod21.includes("DEFAULT_SETTINGS") &&
			((tab21 + read("src/settings/sections/memory.ts") + read("src/settings/sections/terminal.ts")).match(/markModified\(/g) || []).length === 63 && // 42 di settingsTab + 17 di modul memory + 4 di modul terminal (2026-08-24 Phase 3: terminalSettings pindah modul, −4 di tab / +4 di modul — TOTALNYA tetap 63, itu buktinya ekstraksi tidak menghapus satu dot pun)
			tail21.includes(".oa-mod-dot") &&
			tail21.includes(".oa-settings-search-result") &&
			tail21.includes(".oa-settings-flash") &&
			tail21.includes(".oa-settings-search") &&
			!/transition:\s*all/.test(tail21) &&
			!/border-radius:\s*4px;/.test(tail21) &&
			!bareHex21;
		if (ok) {
			console.log("✓ v0.1.94: settings search (harvest/jump/flash/guards) · modified dots ×63 · CSS block hygiene");
		} else {
			console.error("✗ v0.1.94 settings search/dot guards drifted");
			failed++;
		}
	}
	{
		const td = read("src/agent/todo.ts");
		const tools = read("src/agent/tools.ts");
		const ses = read("src/agent/sessions.ts");
		const appc = read("src/ui/ChatApp.tsx");
		const rn = read("src/agent/runner.ts");
		const st2 = read("src/settings.ts");
		const tb = read("src/settingsTab.ts");
		const tp = read("test/tools.test.cjs");
		const ok =
			tools.includes('name: "todo"') &&
			tools.includes('toolset: "todo"') &&
			tools.includes("merge=true: update existing items by id") &&
			td.includes("MAX_TODO_CONTENT_CHARS = 4000") &&
			td.includes("MAX_TODO_ITEMS = 256") &&
			td.includes("[Your active task list was preserved across context compression]") &&
			td.includes("formatForInjection") &&
			ses.includes("todos?: TodoItem[]") &&
			appc.includes("todoApiRef") &&
			appc.includes("formatTodoInjection(") &&
			appc.includes("todoRef.current = s.todos") &&
			rn.includes("ephemeralTodoApi()") &&
			st2.includes("clarify: true,") && st2.includes("todo: true,") &&
			tb.includes('key: "todo"') &&
			tp.includes("todo dedupe: last occurrence wins") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.133: todo tool (port Hermes 1:1) — ride session file · injeksi lintas kompresi hanya item aktif · ephemeral di headless/quick-ask · 18 cek unit hijau");
		} else {
			console.error("✗ v0.1.133 Hermes todo port regressed");
			failed++;
		}
	}
	{
		const v = read("src/agent/vision.ts");
		const tools = read("src/agent/tools.ts");
		const lp = read("src/agent/agentLoop.ts");
		const rn = read("src/agent/runner.ts");
		const st2 = read("src/settings.ts");
		const cm = read("src/agent/contextManager.ts");
		const tp = read("test/tools.test.cjs");
		const al = read("test/agent-loop.test.cjs");
		const ok =
			tools.includes('name: "vision_analyze"') &&
			tools.includes('toolset: "vision"') &&
			v.includes("packNativeVisionResult") &&
			v.includes("unpackNativeVisionResult") &&
			v.includes("detectImageMime") &&
			v.includes("VISION_MAX_IMAGE_BYTES = 5 * 1024 * 1024") &&
			lp.includes("unpackNativeVisionResult(result)") &&
			rn.includes("nativeAvailable") &&
			rn.includes("Security boundary: the image") &&
			rn.includes("Fully describe relevant visible evidence") &&
			st2.includes("todo: true,") && st2.includes("vision: true,") &&
			cm.includes('"webExtract" | "vision"') &&
			tp.includes("vision source: vault path") &&
			al.includes("vision: provider request carries pixels inside the tool message") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.134: vision_analyze — native pixels ride tool result (bypass 20k clipper) · legacy aux+template mereka · magic-byte detect · witness wire-level hijau");
		} else {
			console.error("✗ v0.1.134 Hermes vision port regressed");
			failed++;
		}
	}
	{
		const dg = read("src/agent/delegate.ts");
		const tools = read("src/agent/tools.ts");
		const rn = read("src/agent/runner.ts");
		const lp = read("src/agent/agentLoop.ts");
		const st2 = read("src/settings.ts");
		const appc = read("src/ui/ChatApp.tsx");
		const tp = read("test/tools.test.cjs");
		const al = read("test/agent-loop.test.cjs");
		const plan = read("docs/plans/hermes-delegation-plan-2026-08-09.md");
		const ok =
			tools.includes('name: "delegate_task"') &&
			tools.includes('toolset: "delegation"') &&
			dg.includes("DELEGATE_ALLOWED_TOOLS") &&
			dg.includes("HEADLESS_ALLOWED_TOOLS") &&
			dg.includes("headlessTools") &&
			dg.includes("DELEGATE_MAX_CONCURRENT = 3") &&
			dg.includes("childSystemPrompt") &&
			dg.includes("focused subagent") &&
			rn.includes("childTools(this.getTools(settings))") &&
			rn.includes("headlessTools(this.getTools(settings))") &&
			rn.includes("runPooled(DELEGATE_MAX_CONCURRENT, workers)") &&
			lp.includes("onDelegateProgress") &&
			st2.includes("vision: true,") && st2.includes("delegation: true,") &&
			appc.includes("onDelegateProgress: (done, total)") &&
			tp.includes("runPooled(3, workers)") &&
			al.includes("delegation: consolidated batch result lands on the wire") &&
			plan.includes("DELEGATE_BLOCKED_TOOLS") &&
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.135+: delegate_task — child/headless fail-closed allowlists · pool 3 · consolidated index-sorted · orchestrator/output_schema ditolak jujur · gap 🟡 TUNTAS SEMUA");
		} else {
			console.error("✗ v0.1.135 Hermes delegation port regressed");
			failed++;
		}
	}
	return failed;
};
