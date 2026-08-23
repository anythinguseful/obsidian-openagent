/**
 * Build preview/ — split UI previews, one file per topic:
 *   preview/index.html                     hub linking all pages
 *   preview/preview-chat-interface.html    REAL renders (fresh / conversation / working)
 *   preview/preview-chat-panel.html        REAL conversations panel
 *   preview/preview-chat-menu.html         REAL model picker menu
 *   preview/preview-chat-attach.html       REAL [+] attach menu
 *   preview/preview-chat-snippets.html     REAL prompt snippets submenu
 *   preview/preview-chat-atref.html        REAL @ reference popup
 *   preview/preview-setting-*.html         static settings frames from test/preview-frames.source.html
 *
 * Each page is fully self-contained: page chrome css + obsidian-sim.css
 * (invasive subset of real app.css) + sim-extras + styles.css (the plugin's
 * actual stylesheet). Chat frames marked data-real="<scenario>" in
 * test/preview-frames.source.html get their inner markup REPLACED with the
 * DOM captured by test/real-preview/ (the actual ChatApp). Without a capture
 * the static fallback stays and the frame keeps its ⚠ static badge.
 *
 * NOTE: test/preview-frames.source.html is SOURCE material only — it carries
 * no plugin CSS on purpose, so it renders unstyled when opened directly.
 * Viewable output lives exclusively under preview/.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "preview");

const pageCss = `
\t/* preview page chrome only — NOT part of the plugin */
\thtml,
\tbody {
\t\theight: auto !important;
\t\toverflow: auto !important; /* obsidian-sim locks body scroll like the real app; the preview page must scroll */
\t\tcontain: initial !important; /* sim ships contain:strict (like app.css) — zeroes body height & paint-clips everything below the fold */
\t}
\tbody {
\t\tmargin: 0;
\t}
\t/* fallback only for vars a stripped app.css subset might miss */
\tbody {
\t\t--font-monospace: ui-monospace, "JetBrains Mono", "Cascadia Code", monospace;
\t}
\t.frame {
\t\tdisplay: flex;
\t\tgap: 18px;
\t\tpadding: 18px;
\t\talign-items: flex-start;
\t\tflex-wrap: wrap;
\t}
\t.view {
\t\twidth: 380px;
\t\theight: 640px;
\t\tborder: 1px solid var(--background-modifier-border);
\t\tborder-radius: 12px;
\t\toverflow: hidden;
\t\tposition: relative;
\t\tbackground: var(--background-primary);
\t}
\t.view.wide {
\t\twidth: 560px;
\t}
\t.label {
\t\tcolor: var(--text-faint);
\t\tfont-size: 12px;
\t\tmargin-bottom: 6px;
\t\tfont-family: var(--font-monospace);
\t}
\t.label .real-badge {
\t\tcolor: var(--text-success, #4ade80);
\t}
\t.label .static-badge {
\t\tcolor: var(--text-warning, #facc15);
\t}
\t.oa-preview-nav {
\t\tpadding: 14px 18px 0;
\t\tcolor: var(--text-muted);
\t\tfont-size: 13px;
\t\tline-height: 1.5;
\t}
\t.oa-preview-nav a {
\t\tcolor: var(--text-accent);
\t\ttext-decoration: none;
\t}
\t.oa-preview-nav a:hover {
\t\ttext-decoration: underline;
\t}
\t.oa-preview-cards {
\t\tdisplay: flex;
\t\tflex-wrap: wrap;
\t\tgap: 14px;
\t\tpadding: 18px;
\t\tmax-width: 1200px;
\t}
\t.oa-preview-card {
\t\tdisplay: block;
\t\twidth: 320px;
\t\tborder: 1px solid var(--background-modifier-border);
\t\tborder-radius: 12px;
\t\tpadding: 14px 16px;
\t\tbackground: var(--background-secondary);
\t\tcolor: var(--text-normal);
\t\ttext-decoration: none;
\t\ttransition: border-color 120ms ease;
\t}
\t.oa-preview-card:hover {
\t\tborder-color: var(--background-modifier-border-hover);
\t}
\t.oa-preview-card h3 {
\t\tmargin: 0 0 6px;
\t\tfont-size: 14px;
\t\tcolor: var(--text-normal);
\t}
\t.oa-preview-card p {
\t\tmargin: 0;
\t\tfont-size: 12.5px;
\t\tcolor: var(--text-muted);
\t\tline-height: 1.5;
\t}
\t.oa-preview-card .real-badge {
\t\tcolor: var(--text-success, #4ade80);
\t\tfont-size: 12px;
\t}
\t.oa-preview-card .static-badge {
\t\tcolor: var(--text-warning, #facc15);
\t\tfont-size: 12px;
\t}
`;

/* ------------------------- real frames injection ------------------------- */

const frameTitles = {
	empty: "REAL · fresh chat (hero + composer)",
	convo: "REAL · conversation — buffered reply, streaming off",
	working: "REAL · working state (thinking + pulse)",
	panel: "REAL · conversations panel open",
	menu: "REAL · model picker menu open",
	menu2: "REAL · model menu parity — provider groups, families, MoA presets + the Edit Models visibility dialog",
	attach: "REAL · [+] attach menu open",
	snips: "REAL · prompt snippets submenu",
	atref: "REAL \u00b7 @ reference popup open",
	md: "REAL · markdown digest — headings · table · code + copy · quote · [[wikilinks]]",
	attachsent: "REAL · sent bubble keeps the attachment chip (history shows uploaded files)",
	queue: "REAL · queue prompt — two prompts queued mid-run (drain FIFO proven in the harness)",
	compress: "REAL · context compression — oldest turns folded into the rolling summary (wire-only; history stays whole)",
	title: "REAL · auto session title — named by the first reply, listed in the panel",
	slash: "REAL · slash quick batch — /title renamed the session, /q drained, /sessions opened + prefilled the panel",
	slash2: "REAL · slash arg-stage — approval options offered, yolo applied, transcript saved to vault, status aware",
	slash3: "REAL · skills in the slash palette — Commands/Skills groups, verb staging, disabled-skill read arms one message",
	branch: "REAL · /branch — chat forked with lineage title, parent wire byte-stable, child grows alone",
	chips: "REAL · slash chips — typed/pasted tokens render as atomic pills; the sent bubble agrees",
	goal: "REAL · /goal Ralph loop — judge continues the work, done marks the chip",
	steer: "REAL · /steer mid-turn — stashed note rides the tool result; idle settles as a plain next turn",
	webe: "REAL · web_extract — long page windowed head+tail, full text vaulted; summarize rides the aux pin",
	moa: "REAL · Mixture of Agents — advisors fan out once per user turn; the preset's aggregator acts with their joined guidance",
	moa2: "REAL · /moa one-shot + /model pivot — default preset rides one turn then restores; bare names pivot, disabled never",
};

/** run the real-preview capture; returns frames map or null */
function buildRealFrames() {
	const framesPath = join(here, "real-preview", "frames.json");
	const bundle = join(here, "real-preview", "out", "chat-sim.js");
	if (!existsSync(bundle)) {
		const esbuild = spawnSync(
			"npx",
			[
				"esbuild",
				"test/real-preview/chat-entry.tsx",
				"--bundle",
				"--format=iife",
				"--target=chrome110",
				"--jsx=automatic",
				"--alias:obsidian=./test/real-preview/obsidian-shim.ts",
				"--outfile=test/real-preview/out/chat-sim.js",
			],
			{ cwd: root, stdio: "inherit" }
		);
		if (esbuild.status !== 0) throw new Error("real-preview esbuild failed — refusing the static fallback");
	}
	const run = spawnSync("node", [join(here, "real-preview", "build.mjs")], { cwd: root, stdio: "inherit" });
	/* v0.1.55 gate-hole fix: a FAILED lane used to degrade to last run's
	   stale frames.json (or none) and the release shipped green on red lanes
	   — caught live when the v0.1.54 reax lane failed inside a "passed"
	   release. Now any failure aborts the whole preview step. */
	if (run.status !== 0) throw new Error("real-preview build.mjs failed — no stale frames tolerated (lane must stop the release)");
	if (!existsSync(framesPath)) throw new Error("real-preview frames.json missing after a green build — refusing to guess");
	try {
		return JSON.parse(readFileSync(framesPath, "utf8"));
	} catch {
		return null;
	}
}

const realFrames = buildRealFrames();

/* ------------------------- split the static master ----------------------- */

const preview = readFileSync(new URL("./preview-frames.source.html", import.meta.url), "utf8");
const bodyStart = preview.search(/<body[^>]*>/);
const bodyOpen = preview.slice(bodyStart).match(/<body[^>]*>/)[0];
const body = preview.slice(bodyStart + bodyOpen.length, preview.indexOf("</body>"));

/* split on the "============ frame N: title ============" comments;
   capture keeps the titles, chunks are the markup between comments */
const chunks = body.split(/\t<!-- ============ frame (\d+): ([^=]+?) ============ -->\n/);
/* chunks = [pre, "1", "conversation", block1, "2", "panel…", block2, …] */
const masterFrames = {};
for (let i = 1; i + 2 <= chunks.length; i += 3) {
	masterFrames[chunks[i]] = chunks[i + 2].trim();
}
/* last block carries the closing </div> + STYLES_CSS fetch script — drop it */
for (const k of Object.keys(masterFrames)) {
	const cut = masterFrames[k].indexOf("\n\n</div>\n<script>");
	if (cut >= 0) masterFrames[k] = masterFrames[k].slice(0, cut).trim();
}

/* ------------------------- page plan ------------------------------------- */

const frameDiv = (title, inner) =>
	`\t<div>\n\t\t<div class="label">${title}</div>\n\t\t<div class="view oa-view" style="height:640px">${inner}</div>\n\t</div>`;

const badge = (scenario) =>
	realFrames?.[scenario]
		? `<span class="real-badge">● real render</span>`
		: `<span class="static-badge">⚠ static fallback — run real-preview</span>`;

function patchStatic(markup) {
	/* inject captured real DOM into data-real frames */
	let out = markup.replace(
		/(<div class="view[^"]*"[^>]*data-real="([a-z]+)"[^>]*>)[\s\S]*?<\/div><!--\s*\/view\s*-->/g,
		(m, openTag, scenario) => {
			const dom = realFrames?.[scenario];
			if (!dom) return m;
			return `${openTag}${dom}</div><!-- /view -->`;
		}
	);
	out = out.replace(/<!-- badge:([a-z]+) -->/g, (m, s) => badge(s));
	return out;
}

const realDiv = (scenario, height = 640) =>
	realFrames?.[scenario]
		? `\t<div>\n\t\t<div class="label">${frameTitles[scenario]} <span class="real-badge">● real render</span></div>\n\t\t<div class="view oa-view" style="height:${height}px">${realFrames[scenario]}</div>\n\t</div>`
		: "";

/* one page per topic — `static` = master frame numbers, `real` = scenarios appended after */
const PAGES = [
	{
		file: "preview-chat-interface.html",
		title: "Chat — interface",
		desc: "Fresh chat (hero + composer), conversation with tool trace & sources, working/thinking state.",
		static: ["1"],
		real: ["empty", "working"],
	},
	{
		file: "preview-chat-panel.html",
		title: "Chat — sessions panel + model menu",
		desc: "Conversations panel with the model picker inline.",
		static: ["2"],
		real: [],
	},
	{
		file: "preview-chat-menu.html",
		title: "Chat — model picker menu",
		desc: "Model dropdown opened from the composer.",
		static: [],
		real: ["menu", "menu2"],
	},
	{
		file: "preview-chat-attach.html",
		title: "Chat — attach menu [+] + sent attachment block",
		desc: "Active note / files / images / folder / disk upload / snippets entry, with tip footer; the sent user bubble keeps its attachment chips.",
		static: [],
		real: ["attach", "attachsent"],
	},
	{
		file: "preview-chat-snippets.html",
		title: "Chat — prompt snippets",
		desc: "The snippets submenu of the [+] menu (list moved off the home page).",
		static: [],
		real: ["snips"],
	},
	{
		file: "preview-chat-atref.html",
		title: "Chat — @ file references",
		desc: "Inline @ autocomplete popup with vault file candidates + keyboard nav.",
		static: [],
		real: ["atref"],
	},
	{
		file: "preview-chat-markdown.html",
		title: "Chat — markdown rendering",
		desc: "Finished answer rendered as markdown: compact headings, table, quote, wikilinks + fenced code via prompt-kit CodeBlock. (Prose ≈ shim approximation; code path is 100% real.)",
		static: [],
		real: ["md"],
		frameHeight: 980,
		/* mirror the end-of-stream scroll state (scrollTop doesn't serialize) */
		tailScript: "document.querySelectorAll('.oa-chat-scroll').forEach(el => { el.scrollTop = el.scrollHeight; });",
	},
	{
		file: "preview-chat-queue.html",
		title: "Chat — queue prompt",
		desc: "Two prompts queued above the composer while the agent works (Hermes Desktop parity): per-row send / edit / delete, park-on-stop, auto-drain in FIFO order on settle.",
		static: [],
		real: ["queue"],
	},
	{
		file: "preview-chat-compress.html",
		title: "Chat — context compression",
		desc: "Long chat near the model's context window: the earliest messages fold into a rolling summary the provider sees (wire-only — the saved history stays whole), with a notice turn and the cache persisted on the session.",
		static: [],
		real: ["compress"],
		frameHeight: 780,
		/* mirror the end-of-stream scroll state (scrollTop doesn't serialize) */
		tailScript: "document.querySelectorAll('.oa-chat-scroll').forEach(el => { el.scrollTop = el.scrollHeight; });",
	},
	{
		file: "preview-chat-title.html",
		title: "Chat — automatic session title",
		desc: "A brand-new session names itself after its first reply (auxiliary title-generation call, Hermes Desktop parity); the conversations panel lists it on top.",
		static: [],
		real: ["title"],
	},
	{
		file: "preview-chat-slash.html",
		title: "Chat — slash commands",
		desc: "Hermes Desktop composer parity: /title /version /queue(+/q) /resume(+aliases) in frame 1; the arg-stage popover (options complete the argument), /approvals, /profile, /save→vault, /status in frame 2.",
		static: [],
		real: ["slash", "slash2", "slash3", "branch", "chips", "goal", "steer", "webe", "moa", "moa2"],
	},
	{
		file: "preview-setting-provider.html",
		title: "Settings — providers",
		desc: "Connection setup with separate configured/setup states, explicit editor selection, and read-only chat-routing context.",
		static: ["3"],
		real: [],
	},
	{
		file: "preview-setting-models.html",
		title: "Settings — model",
		desc: "Fallback chain editor.",
		static: ["5"],
		real: [],
	},
	{
		file: "preview-setting-capabilities.html",
		title: "Settings — capabilities",
		desc: "Per-tool toggles, per-skill enable, mcp.json import.",
		static: ["4"],
		real: [],
	},
	{
		file: "preview-setting-profiles.html",
		title: "Settings — profiles",
		desc: "SOUL identity + session overlay, swatches, keep/trash delete.",
		static: ["6"],
		real: [],
	},
	{
		file: "preview-setting-automations.html",
		title: "Settings — automations",
		desc: "Status dots incl. completed, presets + live cron validation, run history, missed-run notice, Tahap D (skills / max runs / chain / notify / [SILENT]).",
		static: ["7"],
		real: [],
	},
];

/* ------------------------- shared css bundle ----------------------------- */

const sim = readFileSync(new URL("./obsidian-sim.css", import.meta.url), "utf8");
const extrasCss = readFileSync(new URL("./sim-extras.css", import.meta.url), "utf8");
const plugin = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

const stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";
const head = (title) => `<!DOCTYPE html>
<!-- theme classes live on <body> in the real app (see real-preview/build.mjs
     comment) — not on <html> — or app.css var chains via --color-accent break -->
<html>
<head>
<meta charset="utf-8">
<title>OpenAgent preview — ${title}</title>
<style>${pageCss}</style>
<style>/* == subset of Obsidian app.css == */\n${sim}</style>
<style>/* == sim-only extras (not shipped) == */\n${extrasCss}</style>
<style>/* == styles.css (identical to the installed plugin) == */\n${plugin}</style>
</head>
<body class="theme-dark">`;

/* ------------------------- emit pages ------------------------------------ */

if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let injected = 0;
const written = [];

for (const page of PAGES) {
	let injectedHere = 0;
	const sections = [];
	for (const n of page.static) {
		const raw = masterFrames[n];
		if (!raw) continue;
		const before = realFrames ? (raw.match(/data-real=/g) || []).length : 0;
		const patched = patchStatic(raw);
		if (before > 0) {
			const kept = (patched.match(/data-real="([a-z]+)"/g) || []).filter((m) => realFrames?.[m.slice(11, -1)]).length;
			injectedHere += kept;
		}
		sections.push(patched);
	}
	for (const s of page.real) {
		const div = realDiv(s, page.frameHeight ?? 640);
		if (div) {
			injectedHere++;
			sections.push(div);
		}
	}
	injected += injectedHere;
	const hasReal = injectedHere > 0;
	const html = `${head(page.title)}
<div class="oa-preview-nav">
\t<a href="index.html">← all previews</a> · <strong>${page.title}</strong> · built ${stamp}
\t· ${hasReal ? `<span class="real-badge">● real render</span> of the actual ChatApp build (mocked LM Studio)` : `static markup`}
</div>
<div class="frame">
${sections.join("\n")}
</div>
${page.tailScript ? `<script>${page.tailScript}</script>` : ""}
</body>
</html>
`;
	writeFileSync(join(outDir, page.file), html);
	written.push({ ...page, hasReal });
	console.log(`  ${page.file} (${Math.round(html.length / 1024)}kb${hasReal ? ", REAL" : ""})`);
}

/* hub */
const cards = written
	.map(
		(p) => `\t<a class="oa-preview-card" href="${p.file}">
\t\t<h3>${p.title}</h3>
\t\t<p>${p.desc}</p>
\t\t<p style="margin-top:8px;">${p.hasReal ? `<span class="real-badge">● real render</span>` : `<span class="static-badge">● static markup</span>`} · ${p.file}</p>
\t</a>`
	)
	.join("\n");
const indexHtml = `${head("index")}
<div class="oa-preview-nav">
\t<strong>Open Agent — UI preview</strong> · built ${stamp}<br>
\tChat pages are <span class="real-badge">● real renders</span> of the actual plugin build (served by a mocked LM Studio);
\tsettings pages are static markup synced with the real labels. One file per topic — open in a browser to navigate freely.
</div>
<div class="oa-preview-cards">
${cards}
</div>
</body>
</html>
`;
writeFileSync(join(outDir, "index.html"), indexHtml);

/* the old monolith is gone — the split pages replace it */
const legacy = join(here, "preview-final.html");
if (existsSync(legacy)) rmSync(legacy);

console.log(
	`preview/ written: index.html + ${written.length} topic pages (${injected} REAL frame(s) injected)` +
		(realFrames ? "" : " — static fallback (real-preview unavailable)")
);
