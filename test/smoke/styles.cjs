/**
 * Smoke guards whose only source input is styles.css.
 *
 * Moved verbatim from test/smoke.test.cjs (Phases 2, 4 and 5 of the smoke/
 * harness split). Guard conditions and messages are unchanged; only the
 * enclosing function and one level of indentation differ.
 *
 * Phase 4 added the CSS-only rule-order family: hub chip ×, the chip-x /
 * reasoning-content / tool-chevron / reasoning merged blocks, the model-menu
 * cluster, the .oa-app shell, and the two search-chrome paint guards. Those
 * blocks used to read styles.css through a block-local fs/path pair anchored
 * on __dirname; on the move they were rewritten to the harness read(), which
 * is what check-docs guards 2 and 3 require.
 *
 * Phase 5 added the six remaining CSS-only guards, found with a TypeScript
 * parser after the regex survey had missed them: selector-duplication
 * hygiene, the chip/radius certification, three more merged-block families
 * (prompt-actions/msg-content, selbar-btn/cron-history, prompt-action/
 * hub-chip-count) and the v0.1.95 settings-card audit. One of them read
 * "../styles.css" — correct from test/, wrong one directory deeper — so the
 * path was re-anchored on the move (Lesson 181). The v0.1.94 radius guard
 * stays in the monolith: it is the single block that still uses the runtime
 * `s` (plugin.settings).
 */

const { read, region, regionFrom } = require("./harness.cjs");

// Returns the number of failed guards so the orchestrator can fold it into
// its own counter. Guards keep using the bare `failed++` they were written
// with, so the moved code stays byte-identical apart from indentation.
module.exports = function stylesGuards() {
	let failed = 0;

	// v0.1.153 (A8 ColorSwatches): profile colors must render reliably — two-
	// class selectors beat Obsidian's button pseudo-states, every var() carries
	// a canonical fallback hex, and no standalone .oa-color-* rule remains.
	{
		const css = read("styles.css");
		const colors = ["gray", "red", "orange", "yellow", "green", "cyan", "blue", "purple"];
		const fallbacks = {
			red: "#e93147",
			orange: "#ec7500",
			yellow: "#e0ac00",
			green: "#08b94e",
			cyan: "#00bfbc",
			blue: "#086ddd",
			purple: "#7852ee",
		};
		const ok =
			colors.every((c) =>
				css.includes(`.oa-swatch.oa-color-${c}, .oa-profile-dot.oa-color-${c}`)
			) &&
			Object.entries(fallbacks).every(([c, hex]) =>
				css.includes(`var(--color-${c}, ${hex})`)
			) &&
			css.includes(".oa-swatch.oa-color-gray, .oa-profile-dot.oa-color-gray { background: var(--text-muted); }") &&
			css.includes(".oa-settings .oa-swatch:hover:not(.is-active)") &&
			css.includes(".oa-settings .oa-swatch:focus-visible") &&
			!/\n\.oa-color-(red|orange|yellow|green|cyan|blue|purple)\s*\{/.test(css);
		if (ok) {
			console.log("✓ v0.1.153: profile colors — two-class selectors + canonical fallbacks + hover/focus states");
		} else {
			console.error("✗ v0.1.153 profile color swatches drifted");
			failed++;
		}
	}

	// v0.1.185 (owner: "ubah oa-attach-menu dan oa-model menu diatas composer
	// juga, biar rapi di desktop & phone"): both menus are full-width above
	// the composer — the slash-menu/panel geometry (left/right 12px + max-
	// width 820px, centered), anchored to .oa-composer-zone via static
	// anchors. No more 250/270/300px popover pinned to the buttons.
	{
		const css = read("styles.css");
		// 2026-08-24 (Lesson 195): these were raw indexOf slices. `anchor` was
		// broken — its end marker's FIRST occurrence (offset 23333) precedes
		// the .oa-attach-anchor block (88893), so slice() returned "" and
		// `!anchor.includes("position: relative;")` was vacuously true. region()
		// searches the end marker only AFTER the start, and throws if absent.
		const am = region(css, ".oa-app .oa-attach-menu {", "\n.oa-app .oa-attach-menu-head", { label: "attach-menu" });
		const mm = region(css, ".oa-app .oa-model-menu {", "\n.oa-app .oa-model-menu-list", { label: "model-menu" });
		const picker = region(css, ".oa-app .oa-model-picker {", "\n.oa-app .oa-model-pill", { label: "model-picker" });
		const anchor = region(css, ".oa-app .oa-attach-anchor {", "\n.oa-app .oa-attach-toggle", { label: "attach-anchor" });
		const ok =
			am.includes("width: min(820px, calc(100% - 24px));") &&
			am.includes("margin: 0 auto 6px;") &&
			am.includes("max-height: min(24rem, calc(100vh - 12rem));") &&
			mm.includes("width: min(820px, calc(100% - 24px));") &&
			mm.includes("margin: 0 auto 6px;") &&
			!picker.includes("position: relative;") &&
			!anchor.includes("position: relative;");
		if (ok) {
			console.log("✓ v0.1.185: attach + model menus — full-width above the composer (slash-menu geometry), no popover pin");
		} else {
			console.error("✗ v0.1.185 attach/model menu full-width drifted");
			failed++;
		}
	}

	// v0.1.164 (owner: model pill "ngunci" panjang → composer collapse): the
	// flex CHAIN must shrink — the picker is the shrinkable flex item in the
	// nowrap actions row, the pill fills it, the label ellipsizes. Quick Ask
	// mirrors the same shape.
	{
		const css = read("styles.css");
		const picker = region(css, ".oa-app .oa-model-picker {", ".oa-app .oa-model-menu", { label: "model-picker" });
		const qa = region(css, ".oa-quickask .oa-model-picker {", ".oa-quickask .oa-model-menu", { label: "quickask-picker" });
		const ok =
			picker.includes("min-width: 0;") &&
			picker.includes("flex: 0 1 210px;") &&
			picker.includes("max-width: 210px;") &&
			picker.includes(".oa-model-pill {\n\tdisplay: flex;") &&
			picker.includes("width: 100%;") &&
			css.includes(".oa-app .oa-model-pill-label {\n\t/* v0.1.164") &&
			css.includes("flex: 1 1 auto;\n\tmin-width: 0;") &&
			qa.includes("min-width: 0; flex: 0 1 210px; max-width: 210px;") &&
			css.includes(".oa-quickask .oa-model-pill-label { flex: 1 1 auto; min-width: 0;");
		if (ok) {
			console.log("✓ v0.1.164: model pill flex chain — shrinkable picker + filling pill + ellipsizing label (chat & Quick Ask)");
		} else {
			console.error("✗ v0.1.164 model pill flex chain drifted");
			failed++;
		}
	}

	// v0.1.140 — UI regression patch: every shared SearchField input is
	// explicitly neutral at hover/active while focus remains on its shell;
	// textarea neutralization is scoped to Settings and cannot leak into the
	// snippet confirmation modal or Quick Ask composer.
	{
		const css = read("styles.css");
		const sharedSearchNeutral =
			css.includes(".oa-app .oa-searchbox-input:hover,\n.oa-app .oa-searchbox-input:active,\n.oa-quickask .oa-searchbox-input:hover,\n.oa-quickask .oa-searchbox-input:active {") &&
			css.includes(".oa-app .oa-searchbox-input:focus,\n.oa-app .oa-searchbox-input:focus-visible,\n.oa-quickask .oa-searchbox-input:focus,\n.oa-quickask .oa-searchbox-input:focus-visible {") &&
			css.includes(".oa-app .oa-searchbox--pill:focus-within,\n.oa-quickask .oa-searchbox--pill:focus-within {") &&
			css.includes(".oa-app .oa-searchbox--strip:focus-within,\n.oa-quickask .oa-searchbox--strip:focus-within {");
		const settingsTextareasNeutral =
			css.includes(".oa-settings .oa-mcp-import-text:hover,\n.oa-settings .oa-mcp-import-text:active,\n.oa-settings .oa-mcp-import-text:focus,\n.oa-settings .oa-mcp-import-text:focus-visible {") &&
			css.includes(".oa-settings .oa-profile-soul:hover,\n.oa-settings .oa-profile-soul:active,\n.oa-settings .oa-profile-soul:focus,\n.oa-settings .oa-profile-soul:focus-visible {") &&
			css.includes(".oa-settings .setting-item.oa-has-stacked textarea:hover,\n.oa-settings .setting-item.oa-has-stacked textarea:active,\n.oa-settings .setting-item.oa-has-stacked textarea:focus,\n.oa-settings .setting-item.oa-has-stacked textarea:focus-visible {") &&
			css.includes(".oa-confirm-modal .setting-item.oa-has-stacked textarea:focus {\n\toutline: none;\n\tborder-color: var(--interactive-accent);\n}") &&
			!css.includes(".oa-confirm-modal .setting-item.oa-has-stacked textarea:active") &&
			!css.includes(".oa-settings .setting-item.oa-has-stacked textarea:focus {\n\toutline: none;\n\tborder-color: var(--interactive-accent)") &&
			!css.includes(".oa-settings .oa-mcp-import-text:focus {\n\tborder-color: var(--interactive-accent)");
		if (sharedSearchNeutral && settingsTextareasNeutral) {
			console.log("✓ v0.1.140: shared search hover/active netral + shell focus · Settings textarea netral dan scope-safe");
		} else {
			console.error("✗ v0.1.140 search/Settings textarea UI contract regressed");
			failed++;
		}
	}

	{
		// hub chip × (owner 2026-07-23): the real app styles every bare button
		// with input-height and — via button:not(.clickable-icon), which beats
		// our single-class rule — a background + shadow, inflating community
		// tap chips into gray pills. The chip-scoped override must exist.
		const css = read("styles.css");
		if (css.includes(".oa-settings .oa-hub-chip .oa-hub-chip-x")) {
			console.log("✓ hub chip ×: app button-reset overridden — community tap chips stay chip-sized");
		} else {
			console.error("✗ hub chip ×: app button-reset override missing (community chips inflate)");
			failed++;
		}
	}
	// chip-x merged-order guard (2026-08-03, v0.1.61) — the single
	// .oa-hub-chip-x rule must keep font-weight:600 ABOVE `font: inherit`
	// so the shorthand still wins (computed weight 400, proven identical to
	// the layered era by real-render computed-style diff). If a future edit
	// moves it below the shorthand, the × button silently turns bold.
	{
		const st = read("styles.css");
		const sel = ".oa-hub-chip-x {";
		const start = st.indexOf("\n" + sel);
		const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
		const block = end < 0 ? "" : st.slice(start, end);
		const w = block.indexOf("\tfont-weight: 600;");
		const f = block.indexOf("\tfont: inherit;");
		const singles = st.split("\n").filter((l) => l === sel).length;
		if (start >= 0 && end >= 0 && w >= 0 && f >= 0 && w < f && singles === 1) {
			console.log("✓ chip-x merged block: single layered-free rule, font-weight above font shorthand");
		} else {
			console.error("✗ chip-x merged block drifted (order or count)");
			failed++;
		}
	}
	// reasoning-content merged-structure guard (2026-08-03, v0.1.62) —
	// the consolidated .oa-app .oa-reasoning-content rule must stay a SINGLE
	// col-0 rule carrying both former blocks' properties with the shared
	// margin-top deduplicated (visual-verified byte-identical, incl. the
	// stable moa.png disclosure shot). A re-layered second rule or a dropped
	// property fails here before any pixel can drift.
	{
		const st = read("styles.css");
		const sel = ".oa-app .oa-reasoning-content {";
		const start = st.indexOf("\n" + sel);
		const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
		const block = end < 0 ? "" : st.slice(start, end);
		const singles = st.split("\n").filter((l) => l === sel).length;
		const mt = block.split("\n").filter((l) => l === "\tmargin-top: 5px;").length;
		if (singles === 1 && start >= 0 && end >= 0 && mt === 1
			&& block.includes("\tmax-height: 240px;") && block.includes("\tpadding-left: 2px;")
			&& block.includes("\tfont-style: italic;") && block.includes("\tline-height: 1.55;")) {
			console.log("✓ reasoning-content merged block: single rule, deduped margin-top, all props present");
		} else {
			console.error("✗ reasoning-content merged block drifted (count or props)");
			failed++;
		}
	}
	// tool-chevron merged-structure guard (2026-08-03, v0.1.63) — single
	// col-0 rule carrying display/color/flex/transition with the living
	// .is-open rotate variant right beside it (visual-verified: 3 chevrons
	// closed + 1 open rotate matrix byte-identical, fcard.png identical).
	{
		const st = read("styles.css");
		const sel = ".oa-app .oa-tool-chevron {";
		const open = ".oa-app .oa-tool-chevron.is-open {";
		const start = st.indexOf("\n" + sel);
		const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
		const block = end < 0 ? "" : st.slice(start, end);
		const singles = st.split("\n").filter((l) => l === sel).length;
		const opens = st.split("\n").filter((l) => l === open).length;
		if (singles === 1 && opens === 1 && start >= 0 && end >= 0
			&& block.includes("\tdisplay: inline-flex;") && block.includes("\tcolor: var(--text-faint);")
			&& block.includes("\tflex: 0 0 auto;") && block.includes("\ttransition: transform 150ms ease;")) {
			console.log("✓ tool-chevron merged block: single rule, 4 props, is-open variant intact");
		} else {
			console.error("✗ tool-chevron merged block drifted (count or props)");
			failed++;
		}
	}
	// reasoning-merged guard (2026-08-03, v0.1.66; rewritten 2026-08-04 v0.1.74):
	// single rule, border-left+padding-left, font-size deduped. The
	// cot-step-body twin guard went with the ChainOfThought purge (v0.1.74)
	// — its CSS is gone on purpose, and Guard B now keeps the purge lasting.
	{
		const st = read("styles.css");
		const blockOf = (sel) => {
			const start = st.indexOf("\n" + sel);
			const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
			return { start, end, block: end < 0 ? "" : st.slice(start, end),
				singles: st.split("\n").filter((l) => l === sel).length };
		};
		const r = blockOf(".oa-app .oa-reasoning {");
		const rOk = r.singles === 1 && r.end > 0
			&& r.block.includes("\tborder-left: 2px solid var(--background-modifier-border);")
			&& r.block.includes("\tpadding-left: 10px;")
			&& r.block.split("\n").filter((l) => l === "\tfont-size: var(--font-ui-smaller);").length === 1;
		if (rOk) {
			console.log("✓ reasoning merged block: single rule, prop order counters shorthand (cot twin retired v0.1.74)");
		} else {
			console.error("✗ reasoning merged block drifted");
			failed++;
		}
	}
	// model-menu cluster merged guards (2026-08-04, v0.1.70) — all five
	// frozen families folded winner-last into their base rules: menu width
	// 300px after 270px; item flex/interface/ui-small after block/monospace/
	// ui-smaller; footer gains the column trio after border-top; footer
	// button flex-start/auto after center/32px; sibling border-left none
	// after the hairline. Computed styles proven identical by the
	// dbg-menumerge probe diff (menu scenario, real pill click).
	{
		const st = read("styles.css");
		const blockOf = (sel) => {
			const start = st.indexOf("\n" + sel);
			const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
			return { end, block: end < 0 ? "" : st.slice(start, end),
				singles: st.split("\n").filter((l) => l === sel).length };
		};
		const mm = blockOf(".oa-app .oa-model-menu {");
		const mi = blockOf(".oa-app .oa-model-menu-item {");
		const mf = blockOf(".oa-app .oa-model-menu-footer {");
		const mb = blockOf(".oa-app .oa-model-menu-footer button {");
		const ms = blockOf(".oa-app .oa-model-menu-footer button + button {");
		const ok = mm.singles === 1 && mm.end > 0
			/* v0.1.185 amended: full-width above composer (slash-menu parity) —
			   the old 270/300px right-anchored popover is gone */
			&& mm.block.indexOf("\twidth: min(820px, calc(100% - 24px));") >= 0
			&& mm.block.indexOf("\tleft: 12px;") >= 0
			&& mm.block.indexOf("\tright: 12px;") >= 0
			&& mi.singles === 1 && mi.end > 0
			&& mi.block.indexOf("\tdisplay: block;") >= 0
			&& mi.block.indexOf("\tdisplay: flex;") > mi.block.indexOf("\tdisplay: block;")
			&& mi.block.indexOf("\tfont-size: var(--font-ui-smaller);") >= 0
			&& mi.block.indexOf("\tfont-size: var(--font-ui-small);") > mi.block.indexOf("\tfont-size: var(--font-ui-smaller);")
			&& mf.singles === 1 && mf.end > 0
			&& mf.block.indexOf("\tdisplay: flex;") >= 0
			&& mf.block.indexOf("\tflex-direction: column;") > mf.block.indexOf("\tdisplay: flex;")
			&& mb.singles === 1 && mb.end > 0
			&& mb.block.indexOf("\tjustify-content: center;") >= 0
			&& mb.block.indexOf("\tjustify-content: flex-start;") > mb.block.indexOf("\tjustify-content: center;")
			&& mb.block.indexOf("\theight: 32px;") >= 0
			&& mb.block.indexOf("\theight: auto;") > mb.block.indexOf("\theight: 32px;")
			&& ms.singles === 1 && ms.end > 0
			&& ms.block.indexOf("\tborder-left: 1px solid var(--background-modifier-border);") >= 0
			&& ms.block.indexOf("\tborder-left: none;") > ms.block.indexOf("\tborder-left: 1px solid var(--background-modifier-border);");
		if (ok) {
			console.log("✓ model-menu cluster folded: width/display/footer/button/sibling winners stay last");
		} else {
			console.error("✗ model-menu folded block drifted");
			failed++;
		}
	}
	// .oa-app shell merged guard (2026-08-04, v0.1.71) — the LAST frozen
	// family: ONE col-0 rule carries the base shell (6 props, original
	// order) with the nine isolation neutralizations folded in after the
	// font-size line. The defence-(1) banner comment stays by the reset;
	// its rule now lives at the top of the sheet.
	{
		const st = read("styles.css");
		const start = st.indexOf("\n.oa-app {");
		const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
		const block = end < 0 ? "" : st.slice(start, end);
		const singles = st.split("\n").filter((l) => l === ".oa-app {").length;
		const props = ["\tposition: relative;", "\tdisplay: flex;", "\tflex-direction: column;",
			"\theight: 100%;", "\tcolor: var(--text-normal);", "\tfont-size: var(--font-ui-medium);"];
		const vars = ["--interactive-normal: transparent;", "--interactive-hover: transparent;",
			"--input-shadow: none;", "--input-shadow-hover: none;", "--input-height: auto;",
			"--input-border-width-focus: 0;", "--background-modifier-border-focus: transparent;",
			"--background-modifier-form-field: transparent;", "--background-modifier-form-field-hover: transparent;"];
		let i = -1, orderOk = true;
		for (const pr of props) { const k = block.indexOf(pr); if (k <= i) orderOk = false; i = k; }
		const fsz = block.indexOf("\tfont-size: var(--font-ui-medium);");
		const allVars = vars.every((v) => block.indexOf(v) > fsz);
		if (singles === 1 && end > 0 && orderOk && i >= 0 && allVars) {
			console.log("✓ .oa-app shell merged: single rule, 6 base props + 9 isolation vars folded in order");
		} else {
			console.error("✗ .oa-app merged block drifted");
			failed++;
		}
	}
	{
		const css23 = read("styles.css");
		const ok =
			css23.includes(".oa-settings-search .oa-settings-search-input {\n\tflex: 1 1 auto;\n\tmin-width: 0;\n\tpadding: 2px 0;\n}") &&
			css23.includes('.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"],') &&
			css23.includes("\t-webkit-appearance: none !important;\n\tappearance: none !important;\n\tbackground: transparent !important;\n\tborder: 0 !important;\n\tbox-shadow: none !important;\n\toutline: none !important;") &&
			css23.includes('.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:focus-visible') &&
			css23.includes(".oa-settings-search .oa-settings-search-input::placeholder {\n\tcolor: var(--text-faint);\n}") &&
			css23.includes(".oa-settings-search .oa-settings-search-clear {\n\tdisplay: none; /* zero layout when empty") &&
			css23.includes(".oa-settings-search.has-query .oa-settings-search-clear {\n\tdisplay: flex;\n}") &&
			css23.includes(".oa-settings-search .oa-settings-search-clear:focus-visible {") &&
			!css23.includes(".oa-settings-search-clear {\n\tvisibility: hidden;") &&
			!css23.includes(".oa-settings-search.has-query .oa-settings-search-clear {\n\tvisibility: visible;");
		if (ok) {
			console.log("✓ v0.1.96: search chrome — UA paint dimatikan (appearance:none + prefix), ghost box hilang, fokus × bercincin");
		} else {
			console.error("✗ v0.1.96 search chrome fix drifted");
			failed++;
		}
	}
	{
		const css24 = read("styles.css");
		const ok =
			css24.includes('.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:hover,\n' +
				'.oa-settings .oa-settings-search input.oa-settings-search-input[type="search"]:active,') &&
			css24.includes("\tbackground: transparent !important;\n\tborder: 0 !important;\n\tbox-shadow: none !important;\n\toutline: none !important;") &&
			css24.includes("\tfilter: none !important;\n\ttransform: none !important;\n\ttext-shadow: none !important;\n\ttransition: none !important;\n\tanimation: none !important;") &&
			css24.includes("later/stronger\n   theme hover rule could still restore fill, border, motion, or shadow") &&
			!css24.includes(".oa-settings-search .oa-settings-search-input:hover,");
		if (ok) {
			console.log("✓ v0.1.97: search input hover pinned neutral — tidak ada yang bergerak saat hover");
		} else {
			console.error("✗ v0.1.97 search-input hover pin drifted");
			failed++;
		}
	}
	{
		const st = read("styles.css");
		const ok =
			st.includes(".oa-app .oa-changed-count {") &&
			!st.includes("border-radius: 4px;") &&
			!st.includes("border-radius: var(--radius-s);") &&
			st.includes("#08b94e") &&
			!st.includes("#f87171") &&
			!st.includes(".oa-tool-icon {") &&
			!st.includes("oa-reasoning-header") &&
			!st.includes("oa-reasoning-label") &&
			!st.includes("oa-model-menu-hint");
		if (ok) {
			console.log("✓ styles hygiene: chip rule + radius/color fallbacks certified + 4 retired selector rules purged");
		} else {
			console.error("✗ styles hygiene drifted");
			failed++;
		}
	}
	{
		const st = read("styles.css");
		const seen = new Map();
		const dups = new Set();
		for (const line of st.split("\n")) {
			/* column-0 only: overrides nested in @media/keyframes are
			   intentional conditional layering, not debt */
			if (!line.startsWith(".") || !line.trimEnd().endsWith("{")) continue;
			const sel = line.trim().slice(0, -1).trim();
			seen.set(sel, (seen.get(sel) ?? 0) + 1);
			if (seen.get(sel) > 1) dups.add(sel);
		}
		const FROZEN = [
			/* 2026-08-04 (v0.1.71): the last family (.oa-app shell) is
			   consolidated — 17/17 done, the list is empty. This guard
			   now exists purely to reject NEW layered debt. */
		];
		const cur = [...dups].sort().join("|");
		const want = [...FROZEN].sort().join("|");
		if (cur === want) {
			console.log(`✓ duplicate-selector guard: ${dups.size} frozen layered families, no new debt`);
		} else {
			console.error(`✗ layered selector debt changed. Now: ${cur || "(none)"} · Frozen: ${want}`);
			failed++;
		}
	}
	{
		const st = read("styles.css");
		const blockOf = (sel) => {
			const start = st.indexOf("\n" + sel);
			const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
			return { end, block: end < 0 ? "" : st.slice(start, end),
				singles: st.split("\n").filter((l) => l === sel).length };
		};
		const pa = blockOf(".oa-app .oa-prompt-actions {");
		const mc = blockOf(".oa-app .oa-msg-content {");
		const paOk = pa.singles === 1 && pa.end > 0
			&& pa.block.includes("\tdisplay: flex;") && pa.block.includes("\tgap: 5px;")
			&& pa.block.includes("\tpadding: 4px 8px 7px;") && pa.block.includes("\twidth: 100%;")
			&& pa.block.includes("\tflex-wrap: nowrap;");
		const mcOk = mc.singles === 1 && mc.end > 0
			&& mc.block.includes("\tflex-direction: column;") && mc.block.includes("\toverflow-wrap: break-word;")
			&& mc.block.includes("\tuser-select: text;") && mc.block.includes("\t-webkit-user-select: text;");
		if (paOk && mcOk) {
			console.log("✓ prompt-actions + msg-content merged blocks: single rules, full props present");
		} else {
			console.error("✗ prompt-actions/msg-content merged block drifted");
			failed++;
		}
	}
	{
		const st = read("styles.css");
		const blockOf = (sel) => {
			const start = st.indexOf("\n" + sel);
			const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
			return { end, block: end < 0 ? "" : st.slice(start, end),
				singles: st.split("\n").filter((l) => l === sel).length };
		};
		const sb = blockOf(".oa-selbar-btn {");
		const p1 = sb.block.indexOf("\tpadding: 3px 8px;");
		const p2 = sb.block.indexOf("\tpadding: 0;");
		const sbOk = sb.singles === 1 && sb.end > 0 && p1 >= 0 && p2 >= 0 && p1 < p2
			&& sb.block.includes("\twidth: 26px;") && sb.block.includes("\tborder-radius: var(--radius-s, 4px);")
			&& sb.block.includes("\tjustify-content: center;");
		const ch = blockOf(".oa-cron-history {");
		const chOk = ch.singles === 1 && ch.end > 0
			&& ch.block.includes("\tdisplay: flex;") && ch.block.includes("\toverscroll-behavior: contain;")
			&& ch.block.includes("\tfont-size: var(--font-ui-smaller);")
			&& st.includes(".oa-cron-history,\n.oa-cron-note {");
		if (sbOk && chOk) {
			console.log("✓ selbar-btn + cron-history merged blocks: padding order preserved, group intact");
		} else {
			console.error("✗ selbar-btn/cron-history merged block drifted");
			failed++;
		}
	}
	{
		const st = read("styles.css");
		const blockOf = (sel) => {
			const start = st.indexOf("\n" + sel);
			const end = start < 0 ? -1 : st.indexOf("\n}\n", start);
			return { end, block: end < 0 ? "" : st.slice(start, end),
				singles: st.split("\n").filter((l) => l === sel).length };
		};
		const pa = blockOf(".oa-app .oa-prompt-action {");
		const r1 = pa.block.indexOf("\tborder-radius: var(--radius-m, 8px);");
		const r2 = pa.block.indexOf("\tborder-radius: 999px;");
		const hcc = blockOf(".oa-hub-chip-count {");
		if (pa.singles === 1 && r1 >= 0 && r2 > r1 && pa.end > 0
			&& st.includes(".oa-app .oa-attach-toggle { border-radius: 999px; }")
			&& hcc.singles === 1 && hcc.block.includes("\tfont-variant-numeric: tabular-nums;")
			&& hcc.block.includes("\tcolor: var(--text-faint);")) {
			console.log("✓ prompt-action + hub-chip-count merged: disc radius winner-last, numeric folded");
		} else {
			console.error("✗ prompt-action/hub-chip-count merged block drifted");
			failed++;
		}
	}
	{
		const css22 = read("styles.css");
		const mark22 = "SETTINGS CARD RHYTHM (v0.1.95";
		const tail22 = regionFrom(css22, mark22, { label: "v0.1.95 css tail" });
		/* v0.1.159 amended: hex inside var() fallback is the sanctioned form —
		   strip var(...) before the bare-hex check (same as v0.1.94). */
		const bareHex22 = /#[0-9a-fA-F]{3,8}/.test(tail22.replace(/var\([^()]*\)/g, ""));
		const ok =
			css22.includes(".oa-settings {\n\t--setting-items-radius: var(--radius-m, 8px);") &&
			css22.includes(".oa-settings .oa-subsection {\n\tmargin-top: 28px;") &&
			css22.includes("margin: 2px 0 8px;") &&
			css22.includes(".oa-settings .oa-mcp-server {\n\tborder: 1px solid var(--background-modifier-border);\n\tborder-radius: var(--radius-m, 8px);\n\tpadding: 0;\n\tmargin: 8px 12px;\n\tbackground: var(--background-primary);\n\toverflow: hidden;\n}") &&
			css22.includes("\tborder-radius: var(--radius-s, 4px);\n}\n.oa-hub-chip-x:hover") &&
			css22.includes("line-height: 1.5;\n\tpadding: 8px 10px;\n\tborder-radius: var(--radius-m, 8px);") &&
			css22.includes("\tfont-size: var(--font-ui-smaller);\n\tpadding: 8px 10px;\n\tborder-radius: var(--radius-m, 8px);\n\tborder: 1px solid var(--background-modifier-border);\n\tbackground: var(--background-primary);\n\tcolor: var(--text-normal);\n\tresize: vertical;\n}") &&
			css22.includes("\ttext-align: left;\n\tpadding: 8px 12px;\n\tborder: 1px solid var(--background-modifier-border);\n\tborder-radius: var(--radius-m, 8px);\n\tbackground: var(--background-primary);") &&
			tail22.includes(".oa-settings .setting-item {\n\tpadding: var(--size-4-3, 12px) var(--size-4-4, 16px);\n\tmargin-bottom: 6px;\n}") &&
			!/transition:\s*all/.test(tail22) &&
			!/border-radius:\s*4px;/.test(tail22) &&
			!bareHex22;
		if (ok) {
			console.log("✓ v0.1.95: settings card refinement — nilai in-place, satu selector baru di ekor, hygiene bersih");
		} else {
			console.error("✗ v0.1.95 settings card refinement drifted");
			failed++;
		}
	}
	return failed;
};
