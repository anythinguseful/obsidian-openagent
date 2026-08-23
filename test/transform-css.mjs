/**
 * One-shot rewrite of styles.css (2026-07 isolation hardening):
 *  1. Replace the losing :where() reset with the 3-layer isolation reset
 *     (variable neutralization + flat element reset at winning specificity).
 *  2. Prefix EVERY chat-area rule with `.oa-app` so its specificity
 *     (>= 0,2,0) always outranks Obsidian app.css (<= 0,1,1) ties.
 *  3. Strengthen custom settings-tab buttons (.oa-provider-row etc.)
 *     with element+class selectors. Settings native controls untouched.
 *
 * Idempotent guard: refuses to run twice (checks for an old-reset marker).
 */
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../styles.css", import.meta.url);
let css = readFileSync(path, "utf8");

if (!css.includes(":where(button)")) {
	console.error("abort: old :where() reset not found — already transformed?");
	process.exit(1);
}

// ---------- 1. swap the reset block ----------
const RESET = `/* ==================================================================
   OBSIDIAN ISOLATION LAYER — three lines of defence, do not remove.

   app.css styles bare elements globally. The worst offenders:
     button:not(.clickable-icon)  background + 4-layer 3D shadow (0,1,1)
     @media hover button:hover    background + shadow hover      (0,1,1)
     button:focus-visible         3px focus ring                 (0,1,1)
     button { ... }               height 30px, padding, nowrap   (0,0,1)
     textarea, input[type=...]    background + border + radius   (0,0,1-0,1,1)

   Defence:
   (1) .oa-app overrides Obsidian's chrome *variables* — even where an
       app.css declaration wins on specificity, its VALUE is a no-op.
   (2) The flat element reset below ties/beats app.css specificity and
       always wins by load order (plugin styles.css loads after app.css).
   (3) EVERY chat component rule is prefixed .oa-app (specificity at
       least 0,2,0) so it always outranks both app.css and this reset.

   The settings tab (.oa-settings) is deliberately NOT reset: native
   Setting-API controls (toggles, dropdowns, text fields) must keep
   their Obsidian look. Only our custom settings buttons carry their
   own strengthened selectors (see the settings section below).
   ================================================================== */

/* (1) neutralize Obsidian's raised-chrome variables inside the chat app */
.oa-app {
\t--interactive-normal: transparent;
\t--interactive-hover: transparent;
\t--input-shadow: none;
\t--input-shadow-hover: none;
\t--input-height: auto;
\t--input-border-width-focus: 0;
\t--background-modifier-border-focus: transparent;
\t--background-modifier-form-field: transparent;
\t--background-modifier-form-field-hover: transparent;
}

/* (2) flat element reset for the chat surface */

.oa-app button {
\t-webkit-appearance: none;
\tappearance: none;
\tmargin: 0;
\tpadding: 0;
\tborder: 0;
\tborder-radius: 0;
\tbackground: none;
\tbackground-color: transparent;
\tbox-shadow: none;
\toutline: none;
\theight: auto;
\tmin-height: 0;
\tmin-width: 0;
\twidth: auto;
\tfont: inherit;
\tletter-spacing: inherit;
\tcolor: inherit;
\twhite-space: normal;
\tcursor: pointer;
}
.oa-app button:hover,
.oa-app button:active,
.oa-app button:focus,
.oa-app button:focus-visible {
\tbackground-color: transparent;
\tbox-shadow: none;
\toutline: none;
}
.oa-app button:disabled {
\tcursor: default;
}

.oa-app :is(input, textarea, select) {
\t-webkit-appearance: none;
\tappearance: none;
\tmargin: 0;
\tpadding: 0;
\tborder: 0;
\tborder-radius: 0;
\tbackground: none;
\tbackground-color: transparent;
\tbox-shadow: none;
\toutline: none;
\theight: auto;
\tmin-height: 0;
\tmin-width: 0;
\tfont: inherit;
\tletter-spacing: inherit;
\tcolor: inherit;
}
.oa-app :is(input, textarea, select):hover,
.oa-app :is(input, textarea, select):active,
.oa-app :is(input, textarea, select):focus,
.oa-app :is(input, textarea, select):focus-visible {
\tbackground-color: transparent;
\tbox-shadow: none;
\toutline: none;
}
.oa-app :is(input, textarea)::placeholder {
\tcolor: var(--text-faint);
\topacity: 1;
}

`;

const start = css.indexOf("/* ---------- neutralize Obsidian's element defaults");
const end = css.indexOf("/* ---------- shared buttons");
if (start === -1 || end === -1 || end < start) {
	console.error("abort: reset block markers not found");
	process.exit(1);
}
css = css.slice(0, start) + RESET + css.slice(end);

// ---------- split chat vs settings areas ----------
const SETTINGS_MARKER = "/* ---------- settings: headers, ghost tabs, scroll buttons ---------- */";
const splitAt = css.indexOf(SETTINGS_MARKER);
if (splitAt === -1) {
	console.error("abort: settings marker not found");
	process.exit(1);
}
let chat = css.slice(0, splitAt);
let settings = css.slice(splitAt);

// ---------- 2. prefix chat-area selectors with .oa-app ----------
const SKIP = new Set([".oa-view", ".oa-app"]);
let prefixed = 0;
chat = chat
	.split("\n")
	.map((line) => {
		const brace = line.indexOf("{");
		if (brace === -1) return line;
		const selText = line.slice(0, brace);
		const rest = line.slice(brace);
		if (!selText.trim().startsWith(".")) return line; // keyframes, comments, @rules
		const sels = selText.split(",");
		const indent = selText.match(/^\s*/)[0];
		const mapped = sels.map((s) => {
			const t = s.trim();
			if (!t.startsWith(".oa-") || t.startsWith(".oa-app ") || t === ".oa-app" || SKIP.has(t)) return s;
			prefixed++;
			return s.replace(t, ".oa-app " + t);
		});
		return indent + mapped.join(", ") + rest;
	})
	.join("\n");

// ---------- 3. strengthen custom settings buttons ----------
settings = settings.replaceAll("\n.oa-provider-row {", "\n.oa-provider-list button.oa-provider-row {");
settings = settings.replaceAll("\n.oa-provider-row:hover {", "\n.oa-provider-list button.oa-provider-row:hover {");
settings = settings.replaceAll("\n.oa-provider-row.is-active {", "\n.oa-provider-list button.oa-provider-row.is-active {");
// tabs: cancel Obsidian's forced 30px button height
settings = settings.replace(
	/(\.oa-settings-tabs button\.oa-settings-tab \{[^}]*?padding: 9px 10px;)/,
	"$1\n\theight: auto;\n\tmin-height: 34px;"
);
// svg-icon default (18px) from app.css must not bloat settings icons
settings = settings.replace(
	".oa-settings-tab .nav-icon {\n\tdisplay: inline-flex;\n\tflex: 0 0 auto;\n}",
	`.oa-settings-tab .nav-icon {
\tdisplay: inline-flex;
\tflex: 0 0 auto;
}
.oa-settings-tab .nav-icon svg,
.oa-settings-tabs button.oa-settings-tab svg {
\twidth: 13px;
\theight: 13px;
}`
);

css = chat + settings;
writeFileSync(path, css);

// ---------- diagnostics ----------
const chatLines = chat.split("\n");
const bad = chatLines.filter((l) => /^\s*\.oa-(?!app\b|view\b)/.test(l) && l.includes("{"));
console.log(`prefixed ${prefixed} selectors`);
if (bad.length) {
	console.log("WARNING unprefixed chat selectors remain:");
	for (const l of bad.slice(0, 10)) console.log("  " + l.trim());
} else {
	console.log("OK: every .oa-* chat selector is .oa-app-namespaced");
}
console.log(`styles.css now ${css.split("\n").length} lines`);
