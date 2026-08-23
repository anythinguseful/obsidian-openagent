/**
 * Smoke guards whose only source input is styles.css.
 *
 * Moved verbatim from test/smoke.test.cjs (Phase 2 of the smoke/harness
 * split). Guard conditions and messages are unchanged; only the enclosing
 * function and one level of indentation differ.
 */

const { read } = require("./harness.cjs");

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
		const am = css.slice(css.indexOf(".oa-app .oa-attach-menu {"), css.indexOf("\n.oa-app .oa-attach-menu-head"));
		const mm = css.slice(css.indexOf(".oa-app .oa-model-menu {"), css.indexOf("\n.oa-app .oa-model-menu-list"));
		const picker = css.slice(css.indexOf(".oa-app .oa-model-picker {"), css.indexOf("\n.oa-app .oa-model-pill"));
		const anchor = css.slice(css.indexOf(".oa-app .oa-attach-anchor {"), css.indexOf("\n.oa-app .oa-attach-toggle"));
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
		const picker = css.slice(css.indexOf(".oa-app .oa-model-picker {"), css.indexOf(".oa-app .oa-model-menu"));
		const qa = css.slice(css.indexOf(".oa-quickask .oa-model-picker {"), css.indexOf(".oa-quickask .oa-model-menu"));
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

	return failed;
};
