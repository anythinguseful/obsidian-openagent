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

	return failed;
};
