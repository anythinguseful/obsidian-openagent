/**
 * Real-preview builder — renders the REAL ChatApp (same src/ui tree that
 * ships in main.js) inside headless Chromium with a mocked vault/network,
 * captures the live DOM for several scenarios, and writes:
 *
 *   test/real-preview/frames.json   → { scenario: outerHTML }
 *   test/real-preview/shots/*.png   → visual record
 *
 * Consumed by test/build-preview.mjs, which injects these frames into
 * preview/ pages — so the chat frames are honest by construction:
 * if the app's markup changes, the preview changes with it.
 *
 * Run: node test/real-preview/build.mjs
 */

import { chromium } from "playwright";
import esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVendorFile, vendorExists, VENDOR_REL } from "../../scripts/build-vendor.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

/**
 * Self-healing launch: sandboxed CI/dev environments often wipe the
 * playwright browser cache (~/.cache/ms-playwright) while node_modules
 * survives — the old flow then silently degraded every preview to the
 * static fallback. Detect the missing executable, install the headless
 * shell, and retry once. Install failure re-throws the original error
 * (callers keep their static-fallback behaviour).
 */
async function launchBrowser() {
	try {
		return await chromium.launch();
	} catch (e) {
		/* wipe patterns: browser cache gone (Executable…) OR OS packages
		   gone (shared libraries — libnspr4 etc. also die with the env).
		   Both heal the same way; --with-deps reinstalls the OS libs. */
		if (!/Executable doesn't exist|error while loading shared libraries/i.test(String(e?.message ?? e))) throw e;
		console.warn("real-preview: chromium unusable — installing headless shell + system deps, one retry…");
		const r = spawnSync("npx", ["playwright", "install", "--with-deps", "chromium-headless-shell"], {
			cwd: root,
			stdio: "inherit",
		});
		if (r.status !== 0) throw e;
		return await chromium.launch();
	}
}
/* OA_ONLY=a,b menjalankan subset lane (verifikasi cepat satu fitur
   tanpa menunggu seluruh frame; release pipeline tetap jalan penuh
   tanpa env ini) */
const ALL_SCENARIOS = ["empty", "convo", "reax", "fcard", "sel", "working", "panel", "personality", "menu", "menu2", "menugeo", "attach", "snips", "atref", "md", "attachsent", "queue", "compress", "title", "slash", "slash2", "slash3", "token", "branch", "chips", "composer", "goal", "steer", "toolstate", "webe", "clfy", "qask", "moa", "moa2", "sysmsg", "preview"];
const SUBSET = (process.env.OA_ONLY ?? "").split(",").filter(Boolean);
const SCENARIOS = SUBSET.length ? ALL_SCENARIOS.filter((x) => SUBSET.includes(x)) : ALL_SCENARIOS;
const FRAME_HEIGHT = 680;

async function bundle() {
	const out = resolve(here, "out", "chat-sim.js");
	mkdirSync(dirname(out), { recursive: true });
	await esbuild.build({
		entryPoints: [resolve(here, "chat-entry.tsx")],
		bundle: true,
		format: "iife",
		platform: "browser",
		target: "chrome110",
		jsx: "automatic",
		outfile: out,
		alias: { obsidian: resolve(here, "obsidian-shim.ts") },
		external: ["canvas"], // pdf.js node-canvas branch; unreachable in-browser
		define: { "process.env.NODE_ENV": '"production"' },
		logLevel: "silent",
	});
	return out;
}

function shell(bundleText, refCss, pluginCss, extraScript = "") {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${refCss}</style>
<style>${pluginCss}</style>
<style>
	html, body { margin: 0; background: var(--background-primary, #1e1e1e); }
	#sim-frame { width: 430px; margin: 0; border: 1px solid var(--background-modifier-border, #333);
		border-radius: 10px; overflow: hidden; background: var(--background-primary, #1e1e1e);
		height: ${FRAME_HEIGHT + 2}px; }
	/* ChatApp's .oa-app is height:100% — every wrapper above it must chain
	   the height through (FileUpload renders wrapper divs) */
	#root { height: 100%; }
	#root > * { height: 100%; min-height: 0; }
	/* v0.1.102 sel-lane chrome mirror (owner diagnostic JSON babak 2): the real
	   view sits inside .workspace-leaf{contain:strict;overflow:hidden}, offset
	   from the viewport origin by sidebar+titlebar — fixed overlays measured
	   in viewport coords get RE-ANCHORED to that leaf and painted at
	   (+leaf.x, +leaf.y) — on the owner's machine off-screen entirely (bar
	   rect l:1345 vs viewport <1378; offsetParent=DIV.workspace-leaf). The
	   court mounted at the origin for five releases — green palsu. The fake
	   leaf carries the same properties (sel scenario only, see chat-entry)
	   so the 470px-dependent quick-ask clamps elsewhere stay untouched. */
	.oa-fake-leaf { width: calc(100% - 240px); height: calc(100% - 40px);
		margin-left: 240px; margin-top: 40px; contain: strict; overflow: hidden; }
</style>
</head>
<!-- theme classes live on <body> in the real app — app.css defines --accent-h
     etc. on the body rule block, so putting theme-dark on <html> silently
     breaks every var() chain that resolves via --color-accent (2026-07-21
     pixel proof: quote bar vanished in harness while working in the app) -->
<body class="theme-dark">
<div id="sim-frame"><div id="root"></div></div>
${extraScript}
<script>${bundleText.replace(/<\/script>/g, "<\\/script>")}</script>
</body>
</html>`;
}

/** smallest legal one-page PDF containing selectable text — the exact file
 *  class the owner kept trying to attach (2026-07-22). xref offsets computed
 *  properly so pdf.js parses it without recovery heuristics. */
function makeTinyPdf(text) {
	const objs = [];
	objs[1] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
	objs[2] = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
	objs[3] = "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n";
	const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
	objs[4] = `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
	objs[5] = "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";
	let out = "%PDF-1.4\n";
	const offsets = [];
	for (let i = 1; i <= 5; i++) {
		offsets[i] = out.length;
		out += objs[i];
	}
	const xrefPos = out.length;
	out += "xref\n0 6\n0000000000 65535 f \n";
	for (let i = 1; i <= 5; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
	out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
	return Buffer.from(out, "binary");
}

export async function buildRealFrames({ shots = true } = {}) {
	/* v0.1.130: lane attach memuat vendor pdf.worker sebagai blob Worker —
	   pastikan file vendor ada (regenerable) dan byte-nya bisa di-inject
	   ke halaman yang memang membutuhkannya */
	if (!vendorExists()) await buildVendorFile(false);
	const vendorAbs = resolve(root, VENDOR_REL);
	const pdfWorkerB64 = existsSync(vendorAbs) ? readFileSync(vendorAbs).toString("base64") : null;
	if (SCENARIOS.includes("attach") && !pdfWorkerB64) throw new Error("vendor pdf.worker missing — jalankan scripts/build-vendor.mjs");
	const bundleFile = await bundle();
	const bundleText = readFileSync(bundleFile, "utf8");
	const refCss = readFileSync(resolve(root, "test", "reference-obsidian-app.css"), "utf8");
	const pluginCss = readFileSync(resolve(root, "styles.css"), "utf8");
	mkdirSync(resolve(here, "shots"), { recursive: true });

	const browser = await launchBrowser();
	const frames = {};
	const errors = [];
	try {
		for (const s of SCENARIOS) {
			const page = await browser.newPage({ viewport: { width: 470, height: FRAME_HEIGHT + 40 }, colorScheme: "dark" });
			const logs = [];
			const browserRequests = [];
			page.on("console", (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
			page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
			/* Real browser request observer: unlike a string-only unit test this
			   catches an <img>, poster, CSS URL, etc. that actually escapes the
			   assistant Markdown guard and starts transport. */
			page.on("request", (request) => browserRequests.push(request.url()));
			// setContent can't take query strings — inject the scenario literally
			const html = shell(
				bundleText.replace("window.location.search", JSON.stringify(`?s=${s}`)),
				refCss,
				pluginCss,
				/* v0.1.130: hanya lane attach yang menerima byte vendor (±1 MB
				   b64 — lane lain dibiarkan ramping); chat-entry's adapter
				   readBinary menyajikannya sebagai vendor/pdf.worker.min.js */
				s === "attach" && pdfWorkerB64
					? `<script>window.__oaPdfWorkerB64 = ${JSON.stringify(pdfWorkerB64)}</script>`
					: ""
			);
			await page.setContent(html);
			await page.waitForFunction(() => window.__oaReady === true, null, { timeout: 20000 }).catch(() => {
				errors.push(`${s}: __oaReady timeout`);
			});
			if (s === "md") {
				/* Paket B regression: the model-authored remote image is rendered
				   through the real Markdown component and shim. There must be no
				   remote media element and, critically, no browser network request.
				   The blocked item remains an ordinary clickable link while an
				   explicitly local data image still renders. */
				const mediaState = await page.evaluate(() => ({
					remoteElements: [...document.querySelectorAll("img[src], video[poster], audio[src], source[src]")].filter((el) => {
						const value = el.getAttribute("src") ?? el.getAttribute("poster") ?? "";
						return /^(?:https?:)?\/\//i.test(value);
					}).length,
					blockedLink: [...document.querySelectorAll(".oa-msg-assistant a")].some((el) =>
						(el.textContent ?? "").includes("Remote image: preview from web blocked — click to open")
					),
					dataImage: !!document.querySelector('.oa-msg-assistant img[src^="data:image/gif;base64,"]'),
				}));
				const escapedRequests = browserRequests.filter((url) => url.includes("remote-media.invalid"));
				if (mediaState.remoteElements !== 0 || !mediaState.blockedLink || !mediaState.dataImage || escapedRequests.length !== 0) {
					throw new Error(
						`md remote-media guard failed: ${JSON.stringify({ ...mediaState, escapedRequests })}`
					);
				}
				console.log("  [md] remote assistant media: no element/request ✓ · click link preserved ✓ · data image preserved ✓");
			}
			if (s === "personality") {
				/* v0.1.171: /personality uwu must reach the NEXT run's system
				   prompt (wire-level, not a source grep). */
				const raw = await page.evaluate(() => window.__oaPersonalityCheck ?? null);
				const p = raw ? JSON.parse(raw) : null;
				if (!p || p.statusText !== "uwu" || p.noticeShown !== true || p.runErrored !== false || p.sysHasOverlay !== true) {
					throw new Error(`personality check failed: ${raw}`);
				}
				console.log("  [personality] /personality uwu → overlay rides the next system prompt (ACTIVE + MUST wrapper + text) ✓");
			}
			if (s === "panel") {
				/* v0.1.170 amended: the sessions panel is a slash-menu-style
				   popover — no backdrop, above the composer, scrolling list,
				   rotate-ccw-clock toggle. */
				const raw = await page.evaluate(() => window.__oaPanelCheck ?? null);
				const p = raw ? JSON.parse(raw) : null;
				if (
					!p ||
					p.backdropGone !== true ||
					p.aboveComposer !== true ||
					!(p.panelW > 200) ||
					!(p.listH > 0) ||
					!(p.listMaxH && p.listMaxH !== "none") ||
					!(p.rowCount >= 4) ||
					p.panelRadius === "0px" ||
					p.hasBorder !== true ||
					!p.glyph.includes("lucide-history")
				) {
					throw new Error(`panel check failed: ${JSON.stringify(p)}`);
				}
				const select = page.locator(".oa-panel-row-select").first();
				await select.focus();
				const focusActions = await page.evaluate(() => {
					const row = document.querySelector(".oa-panel-row");
					const rename = row?.querySelector(".oa-panel-row-rename");
					const del = row?.querySelector(".oa-panel-row-del");
					return {
						activeIsSelect: document.activeElement?.classList.contains("oa-panel-row-select") === true,
						rename: rename ? getComputedStyle(rename).display : null,
						delete: del ? getComputedStyle(del).display : null,
					};
				});
				await select.press("Enter");
				await page.waitForTimeout(80);
				const selectedId = await page.evaluate(() => window.__oaLoadedSession ?? null);
				if (!focusActions.activeIsSelect || focusActions.rename === "none" || focusActions.delete === "none" || selectedId !== "s-1") {
					throw new Error(`panel semantic-row check failed: ${JSON.stringify({ focusActions, selectedId })}`);
				}
				console.log("  [panel] sessions panel is a semantic popover: keyboard focus reveals actions and Enter selects a session ✓");
			}

			frames[s] = await page.$eval("#root", (el) => el.innerHTML);
			if (shots) await page.locator("#sim-frame").screenshot({ path: resolve(here, "shots", `${s}.png`) });
			const bad = logs.filter((l) => /error|warn|exception/i.test(l));
			if (bad.length) console.warn(`  [${s}] console:`, bad.slice(0, 6).join(" | "));
			/* Regenerate honesty check (regression guard, convo scenario):
	   clicking Regenerate must REPLACE the last answer, never duplicate
	   history. runAgent once built `withUser` from the turns STATE captured
	   in its closure; /retry truncates turns via setTurnsSynced and fires the
	   OLD runAgent 30ms later → closure still held the FULL pre-truncation
	   list → the whole conversation duplicated. Fix: withUser is built from
	   turnsRef.current (flushed synchronously by setTurnsSynced). */
	if (s === "working") {
		/* v0.1.122 (owner): wajah REST tombol Stop mid-run — tint lembut
		   terukur dari computed style, bukan lagi glyph "garis merah" di
		   atas transparan; bujur sangkar terkunci anti-kapsul */
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaWorkCheck, null, { timeout: 20000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("working check: __oaWorkCheck never set (mid-run driver never measured the stop button)");
		}
		const r = JSON.parse(raw);
		const bgSoft = /^rgba\([^)]*0\.1[12]\)$/.test(r.stopBg ?? "");
		const fgSolid = (r.stopFg ?? "") !== "" && !(r.stopFg ?? "").startsWith("rgba(0, 0, 0, 0") && r.stopFg !== r.stopBg;
		if (
			r.stopShown !== true ||
			!bgSoft ||
			!fgSolid ||
			r.stopAspect !== "1 / 1" ||
			r.stopSquare !== true ||
			r.stopRadius !== "999px"
		) {
			throw new Error(`working check failed (stop rest-face): ${raw}`);
		}
		console.log("  [working] Stop rest-face: tint merah lembut ~0.12 ✓ · ikon solid ✓ · aspect 1/1 + square + 999px anti-kapsul ✓");
	}
	if (s === "convo") {
		const btn = await page.$("[aria-label='Regenerate']");
		if (!btn) throw new Error("regenerate check: button missing on the last assistant turn");
		const before = await page.evaluate(() => ({
			users: document.querySelectorAll(".oa-msg-user").length,
			assistants: document.querySelectorAll(".oa-msg-assistant").length,
		}));
		await btn.click();
		await page.waitForTimeout(200); // let the click land + run start
		for (let i = 0; i < 40; i++) {
			await page.waitForTimeout(150);
			const busy = await page.$(".oa-thinking-bar");
			if (!busy) break;
		}
		await page.waitForTimeout(250);
		const after = await page.evaluate(() => ({
			users: document.querySelectorAll(".oa-msg-user").length,
			assistants: document.querySelectorAll(".oa-msg-assistant").length,
			replyHere: document.body.textContent?.includes("agent-loop-cheatsheet") ?? false,
		}));
		if (after.users !== before.users || after.assistants !== before.assistants || !after.replyHere) {
			throw new Error(
				`regenerate duplicated or lost history: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
			);
		}
		console.log("  [convo] regenerate check: history intact (replaced, not duplicated)");

		/* stick-to-bottom RESIZE honesty (v0.1.72, prompt-kit audit B1):
		   content growing WITHOUT a DOM mutation (a late-loading vault image
		   is the real case) must keep the pinned view at the bottom — the
		   official use-stick-to-bottom watches resize, and a mutation-only
		   observer let the pinned view hang mid-air (dbg-b1b2 repro stranded
		   it 150px above the grown bottom). */
		const pin = await page.evaluate(async () => {
			const el = document.querySelector(".oa-chat-scroll");
			const content = el.firstElementChild;
			el.scrollTop = el.scrollHeight;
			await new Promise((r) => setTimeout(r, 400));
			const probe = document.createElement("div");
			probe.style.cssText = "height:0px; transition:height 0.3s ease;";
			content.appendChild(probe);
			void probe.offsetHeight;
			probe.style.height = "150px";
			await new Promise((r) => setTimeout(r, 700)); // wait > transition (lesson 54)
			const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
			probe.remove();
			el.scrollTop = el.scrollHeight;
			return Math.round(gap);
		});
		if (pin >= 60) throw new Error(`stick-to-bottom resize lane failed: pinned view stranded ${pin}px above the grown bottom`);
		console.log("  [convo] stick-to-bottom keeps pinning through silent resizes ✓ (RO lane)");

		/* ScrollButton MOUNTED + fade (v0.1.73, audit B4): official keeps the
		   button mounted — opacity/translate transition with pointer-events
		   gating. Before: mount/unmount (popped, null at the bottom). */
		const sb = await page.evaluate(async () => {
			const sc = document.querySelector(".oa-chat-scroll");
			/* v0.1.160 amended: the lane's precondition is "scrollable" — the
			   canned convo is short in this env, so grow a filler first (the
			   lane asserted scrollability, not brevity). */
			let filler = null;
			if (sc.scrollHeight - sc.clientHeight < 80) {
				filler = document.createElement("div");
				filler.className = "oa-sb-filler";
				filler.style.height = "600px";
				document.querySelector(".oa-chat-content")?.appendChild(filler);
				await new Promise((r) => setTimeout(r, 250)); // observers settle to bottom
			}
			if (sc.scrollHeight - sc.clientHeight < 80) return { error: "convo not scrollable" };
			const read = () => {
				const b = document.querySelector(".oa-scroll-button");
				if (!b) return null;
				const c = getComputedStyle(b);
				return { opacity: c.opacity, pe: c.pointerEvents, hidden: b.classList.contains("is-hidden") };
			};
			sc.scrollTop = 0;
			sc.dispatchEvent(new Event("scroll"));
			await new Promise((r) => setTimeout(r, 400)); // > 150ms transition (lesson 54)
			const top = read();
			sc.scrollTop = sc.scrollHeight;
			sc.dispatchEvent(new Event("scroll"));
			await new Promise((r) => setTimeout(r, 400));
			const bottom = read();
			filler?.remove();
			return { top, bottom };
		});
		const sbOk = sb && !sb.error && sb.top && sb.top.opacity === "1" && sb.top.pe === "auto" && !sb.top.hidden
			&& sb.bottom && parseFloat(sb.bottom.opacity) < 0.1 && sb.bottom.pe === "none" && sb.bottom.hidden;
		if (!sbOk) throw new Error(`scroll-button lane failed: ${JSON.stringify(sb)}`);

		/* v0.1.160 (A5 BackBottom): unread dot — scroll up, then GROW the
		   content (mutation observer fires while away → dot appears), then
		   return to bottom (dot clears). */
		const dot = await page.evaluate(async () => {
			const sc = document.querySelector(".oa-chat-scroll");
			const readDot = () => !!document.querySelector(".oa-scroll-button-dot");
			/* grow a filler again (the fade lane removed its own) so the
			   container is scrollable for the away-from-bottom state */
			const filler = document.createElement("div");
			filler.className = "oa-sb-filler";
			filler.style.height = "600px";
			document.querySelector(".oa-chat-content")?.appendChild(filler);
			await new Promise((r) => setTimeout(r, 250));
			sc.scrollTop = 0;
			sc.dispatchEvent(new Event("scroll"));
			await new Promise((r) => setTimeout(r, 250));
			const before = readDot();
			const node = document.createElement("div");
			node.className = "oa-bot-grow-probe";
			node.textContent = "new";
			document.querySelector(".oa-chat-content")?.appendChild(node);
			await new Promise((r) => setTimeout(r, 250));
			const afterGrow = readDot();
			sc.scrollTop = sc.scrollHeight;
			sc.dispatchEvent(new Event("scroll"));
			await new Promise((r) => setTimeout(r, 250));
			const afterBottom = readDot();
			node.remove();
			filler.remove();
			return { before, afterGrow, afterBottom };
		});
		if (dot.before !== false || dot.afterGrow !== true || dot.afterBottom !== false) {
			throw new Error(`scroll-button unread-dot lane failed: ${JSON.stringify(dot)}`);
		}
		console.log("  [convo] scroll-button stays mounted, fades out with pointer-events off ✓ · unread dot grows/clears ✓");
	}
	/* Feedback-banner honesty check (v0.1.49, prompt-kit feedback-bar —
	   owner verified the official shape): the bar shows only while the
	   turn is unrated and un-dismissed, Helpful hides + persists "up",
	   the dblclick gesture retracts (banner returns), Close dismisses
	   permanently and that dismissal persists too; never on user bubbles. */
	if (s === "reax") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaReaxCheck, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("reax check: __oaReaxCheck never set (feedback driver never finished)");
		}
		const r = JSON.parse(raw);
		if (!r.barBefore || !r.iconsDrawn || r.barAfterPick || r.savedAfterPick !== "up" || r.savedAfterTap !== null || !r.barAfterTapback || r.barAfterClose || !r.dismissedSaved || !r.userBubbleFree || r.savedAfterDown !== "down" || !r.feedbackInNextSys || !r.feedbackAbsentBefore) {
			throw new Error(`reax check failed: ${raw} (want unrated bar → Helpful hides+persists up → dblclick retract+bar back → Close dismisses+persisted, no user-bubble bar, down → next system carries the reflection line)`);
		}
		console.log("  [reax] feedback banner: unrated bar ✓ · icons drawn ✓ · Helpful hides+persists ✓ · dblclick retracts→bar back ✓ · Close dismisses+persisted ✓ · none on user bubble ✓ · down-rating → next system carries reflection line ✓");
	}
	if (s === "fcard") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaFcardCheck, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("fcard check: __oaFcardCheck never set (changed-files driver never finished)");
		}
		const r = JSON.parse(raw);
		if (
			!r.cardShown ||
			r.header !== "2 files changed" ||
			(Array.isArray(r.rows) ? r.rows.join("|") : "") !== "Plan.md|Notes.md" ||
			(Array.isArray(r.metas) ? r.metas.join("|") : "") !== "appended ×2|created" ||
			!r.iconsDrawn ||
			!Array.isArray(r.writes) ||
			r.writes.filter((p) => p === "Projects/Plan.md").length !== 2 ||
			/* v0.1.121 (owner): workspaceFolder "Projects" — baris membawa path
			   TERRESOLVE; klik tiap baris membuka file nyata, tanpa notice
			   "no longer in the vault" palsu */
			!r.writes.includes("Projects/Daily/Notes.md") ||
			r.wsFolder !== "Projects" ||
			r.falseNotice !== false ||
			!Array.isArray(r.opens) ||
			!r.opens.includes("Projects/Plan.md") ||
			!r.opens.includes("Projects/Daily/Notes.md")
		) {
			throw new Error(`fcard check failed: ${raw}`);
		}
		console.log("  [fcard] changed-files card: dedupe first-touched ✓ · last-verb ×N meta ✓ · icons drawn ✓ · landed writes ✓ · row click opens the note ✓ · ws-prefixed paths open ✓");
	}
	/* System banner honesty (v0.1.57 prompt-kit port): three slash notices
	   must ride variant banners — icons, never assistant bubbles, no feedback
	   chrome — and persist as system turns in the saved session. */
	if (s === "sysmsg") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaSysmsgCheck, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("sysmsg check: __oaSysmsgCheck never set (system-message driver never finished)");
		}
		const r = JSON.parse(raw);
		if (!r.actionOk || !r.warnOk || !r.errOk || !r.icons || !r.honest || !r.noFeedback || !r.persisted) {
			throw new Error(`sysmsg check failed: ${raw}`);
		}
		console.log(`  [sysmsg] banner rows action/warning/error ✓ · icons ✓ · never assistant bubbles ✓ · no feedback chrome ✓ · persisted as system turns (${r.persistedKinds}) ✓`);
	}
	/* Approval preview honesty (v0.1.58 Copilot ApplyView parity): turn 1 the
	   write lands ONLY through the accepted diff card; turn 2 the denial
	   stops the write AND explains itself on the wire. */
	if (s === "preview") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaPreviewCheck, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("preview check: __oaPreviewCheck never set (approval-preview driver never finished)");
		}
		const r = JSON.parse(raw);
		if (!r.card1 || !r.accepted || !r.card2 || !r.denied) {
			throw new Error(`preview check failed: ${raw}`);
		}
		/* v0.1.121 (owner: "label hijau memang cuma warna atau ada text?") —
		   badge op "create" diukur dari computed style: teks ADA, latar tint
		   lembut rgba ~0.14 (bahasa baris diff, bukan hijau solid), warna
		   teks solid dan berbeda dari latar */
		if (
			r.opBadge?.text !== "create" ||
			!/^rgba\([^)]*0\.1[45]\)$/.test(r.opBadge?.bg ?? "") ||
			(r.opBadge?.fg ?? "") === "" ||
			(r.opBadge?.fg ?? "").startsWith("rgba(0, 0, 0, 0") ||
			r.opBadge?.fg === r.opBadge?.bg
		) {
			throw new Error(`preview check failed (op badge readability): ${raw}`);
		}
		console.log("  [preview] create card +3 −0 → Accept writes ✓ · edit card word-diff → Deny keeps the vault untouched ✓ · denial explains itself on the wire ✓ · op badge teks terbaca ✓");
		/* v0.1.106 diff visual contract — dikoreksi dari SCREENSHOT RESMI
		   CodeDiff LobeHub yang dikirim owner (v0.1.105 menebak gutter ganda
		   dari docs = salah; owner: "oa-preview-gutter kamu salah"): SATU
		   kolom gutter (removed=nomor lama tinta rose, added=nomor baru
		   tinta olive, context=abu), pita tepi kiri solid pada baris
		   berubah, tint baris ≈0.2 & segmen ≈0.4 (persis konvensi diff
		   resmi Obsidian app.css: mod-left/right 0.2 · diff-changed 0.4).
		   Alpha parser harus paham serializers chromium: rgba(…, α) DAN
		   color(srgb … / α) (hasil color-mix). */
		const v = r.visual2 ?? {};
		const alphaOf = (c) => {
			const a = /rgba\(([^)]*)\)/.exec(c ?? "");
			if (a) return parseFloat(a[1].split(",").pop());
			const bnc = /\/\s*([0-9.]+)(\)|\s)/.exec(c ?? "");
			if (bnc) return parseFloat(bnc[1]);
			return 1; /* rgb(…) solid atau tak dikenal → treat as opaque */
		};
		const chn = (c) => (String(c ?? "").match(/\d+(\.\d+)?/g) ?? []).map(Number);
		const vOk =
			v.gut === 4 &&
			alphaOf(v.bgA) > 0.15 && alphaOf(v.bgA) < 0.3 &&
			alphaOf(v.bgR) > 0.15 && alphaOf(v.bgR) < 0.3 &&
			chn(v.delColor)[0] > 160 && chn(v.delColor)[1] < 120 &&
			chn(v.addColor)[1] > 130 && chn(v.addColor)[0] < 120 &&
			alphaOf(v.wAddBg) >= 0.3 &&
			v.remGut === "2" && v.addGut === "2" && v.ctxGuts === "1,3" &&
			chn(v.remEdge)[0] > chn(v.remEdge)[1] && chn(v.remEdge)[0] > chn(v.remEdge)[2] &&
			chn(v.addEdge)[1] > chn(v.addEdge)[0] && chn(v.addEdge)[1] > chn(v.addEdge)[2] &&
			chn(v.remNumColor)[0] > 160 && chn(v.remNumColor)[1] < 120 &&
			chn(v.addNumColor)[1] > 130 && chn(v.addNumColor)[0] < 150;
		if (!vOk) throw new Error(`preview diff visual contract failed (GEJALA OWNER "gutter salah"): ${JSON.stringify(v)}`);
		console.log("  [preview] diff visual: gutter SATU kolom (rem=old rose · add=new olive · ctx abu) ✓ · tint resmi α≈0.2/segmen ≈0.4 ✓ · pita tepi berwarna ✓ · ± counts ✓");
	}
	/* Mini highlighter honesty check (v0.1.43): the digest's json fence must
	   arrive tokenized into property/string/keyword spans AND round-trip
	   byte-for-byte back to its fence source; the mermaid fence must still
	   ride the Markdown route (v0.1.41 must not regress — both touch code
	   segments). Token COLORS come from --code-* vars, supplied by the
	   sim-only github-dark-dimmed block in reference-obsidian-app.css. */
	if (s === "md") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaHlCheck, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("md highlight check: __oaHlCheck never set (md driver never finished)");
		}
		const h = JSON.parse(raw);
		const want = ["property", "string", "keyword"];
		if (!want.every((t) => h.spanTypes.includes(t)) || !h.roundtrip || !h.mermaidIntact || !h.mermaidSalvage || !h.mermaidParenSalvage || !h.mermaidInlinePercentSalvage || !h.mermaidExactDoublePreamble) {
			throw new Error(`md highlight check failed: ${raw} (want spanTypes ⊇ ${JSON.stringify(want)}, roundtrip + mermaid intact + emoji subgraph, kurung/pipa labels, and exact inline-percent/preamble comments salvaged)`);
		}
		console.log("  [md] highlight: json fence tokenized (property/string/keyword) ✓ · text round-trip ✓ · mermaid route intact ✓ · emoji-subgraph + label kurung/caption pipa ✓ · 3 komentar owner `; %` + exact `; %%` → baris `%%` sendiri ✓ · R39 leading preamble preserved ✓");
	}
	/* Selection actions honesty check (v0.1.44): highlighting message text
	   pops the floating Quote/Copy bar; Quote lands in the composer as
	   Obsidian `> ` blockquote lines; Copy flips to Copied (fallback path
	   allowed in headless); the bar retires by itself afterwards. */
	if (s === "sel") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaSelCheck, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("sel check: __oaSelCheck never set (selection driver never finished)");
		}
		const h = JSON.parse(raw);
		if (h.selected !== "Assemble" || !h.barShown || h.btnW < 26 || h.btnH < 26 || !h.composerText.includes("> Assemble") || !h.barAgain || !h.copiedBeat || !h.barGone) {
			throw new Error(`sel check failed: ${raw} (want bar on highlight, sized ≥26px shells, "> Assemble" in composer, Copy→Check beat, self-retiring bar)`);
		}
		console.log("  [sel] selection bar: pops on highlight ✓ · shells 28px ✓ · Quote→composer `> ` lines ✓ · Copy→Check beat ✓ · bar retires ✓");
		/* lane 2, REAL gesture (owner 2026-08-02 regression): the in-page driver
		   selects programmatically (addRange) and would NEVER notice if the
		   drag gesture itself were dead — Obsidian styles body{user-select:none}
		   and chat content must opt back in (v0.1.45). A true mouse drag over
		   message text must produce a nonzero selection AND pop the bar. */
		const anchor = await page.evaluate(() => {
			const el = document.querySelector(".oa-msg-assistant .oa-msg-content strong");
			el.scrollIntoView({ block: "center" });
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, w: r.width, h: r.height };
		});
		await page.waitForTimeout(200);
		await page.mouse.move(anchor.x + 1, anchor.y + anchor.h / 2);
		await page.mouse.down();
		for (let i = 1; i <= 8; i++) await page.mouse.move(anchor.x + 1 + (anchor.w * i) / 8, anchor.y + anchor.h / 2);
		await page.mouse.up();
		await page.waitForTimeout(400);
		const drag = await page.evaluate(() => ({
			text: window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0).toString() : "",
			bar: !!document.querySelector(".oa-selbar"),
		}));
		if (drag.text !== "Assemble" || !drag.bar) {
			throw new Error(`sel drag lane failed: ${JSON.stringify(drag)} — a real mouse drag must select the text and pop the bar`);
		}
		console.log("  [sel] real-drag lane: drag selects text ✓ · bar pops from the gesture ✓");
		/* lane 3 — cancel-survival witness (owner 2026-08-06: "fitur quote di
		   chat ui menghilang"; gejala owner: seleksi BISA, bar tak pernah
		   muncul). Flip-flop selDrag hanya punya jalan turun pointerup — kalau
		   browser/OS membatalkan pointer di tengah gestur, flag true selamanya
		   → recompute selalu pulang awal → bar mati senyap (persis gejala
		   owner). Witness jujur tergantung urutan: pensiunkan dulu bar lama
		   (real-drag lane meninggalkan bar NAMPANG; kalau tidak, querySelector
		   membaca sisa bar — salah-bukti), lalu gestur batal murni sintetik:
		   pointerdown tanpa up + seleksi programatik → bar absen pada KEDUA
		   versi (ini juga menjaga kontrak lama "bar tak pernah pop mid-drag"),
		   pointercancel → pada kode berlubang bar tetap absen = GEJALA OWNER
		   tereproduksi di pengadilan; pada kode tertambal bar muncul. Jalur
		   kedua: mousemove tombol=0 membebaskan saat up+cancel sama-sama
		   tertelan. */
		const selectProgrammatic = () => page.evaluate(() => {
			const strong = document.querySelector(".oa-msg-assistant .oa-msg-content strong");
			const r = document.createRange();
			r.selectNodeContents(strong?.firstChild ?? strong);
			const s = window.getSelection();
			s.removeAllRanges();
			s.addRange(r);
			document.dispatchEvent(new Event("selectionchange"));
		});
		const barShown = () => page.evaluate(() => !!document.querySelector(".oa-selbar"));
		// fase 0: pensiun bar lama (bersih dari lane 2)
		await page.evaluate(() => {
			window.getSelection()?.removeAllRanges();
			document.dispatchEvent(new Event("selectionchange"));
		});
		await page.waitForTimeout(160);
		const retired0 = await barShown();
		// fase 1: gestur STUCK — down sintetis, seleksi programatik, tanpa up
		await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })));
		await selectProgrammatic();
		await page.waitForTimeout(160);
		const stuckBar = await barShown();
		if (retired0 || stuckBar) {
			throw new Error(`sel witness hygiene failed: retired0=${retired0} stuckBar=${stuckBar} — bar harus pensiun lalu menekan mid-drag tetap absen`);
		}
		// fase 2: pointercancel membebaskan
		await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, cancelable: true })));
		await page.waitForTimeout(160);
		const barAfterCancel = await barShown();
		if (!barAfterCancel) {
			throw new Error("sel cancel witness failed (GEJALA OWNER): gestur dibatalkan → bar tak pernah muncul walau seleksi sah");
		}
		// fase 3: jalur kedua — up+cancel sama-sama tertelan; mousemove tombol=0
		await page.evaluate(() => {
			window.getSelection()?.removeAllRanges();
			document.dispatchEvent(new Event("selectionchange"));
			document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
		});
		await selectProgrammatic();
		await page.waitForTimeout(120);
		await page.evaluate(() => document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 0 })));
		await page.waitForTimeout(180);
		const barAfterFallback = await barShown();
		if (!barAfterFallback) {
			throw new Error("sel fallback witness failed: mousemove tombol=0 tidak membebaskan flip-flop seleksi");
		}
		console.log("  [sel] cancel-survival: bar pensiun & mid-drag absen ✓ · pointercancel membebaskan ✓ · mousemove tombol=0 jalur kedua ✓");
		/* lane 4 — workspace-chrome witness (owner 2026-08-07, JSON diagnostik
		   babak 2): di aplikasi asli bar DIRENDER (barTerender:true) tapi tak
		   pernah tampak. Penyebab terukur: .workspace-leaf{contain:strict;
		   overflow:hidden} (core Obsidian) merelokasi containing-block elemen
		   fixed ke pane, jadi left/top yang diukur dari ruang viewport dicat di
		   ruang pane — bergeser (+leaf.x,+leaf.y), milik owner sampai keluar
		   layar. Pengadilan kini memakai chrome serupa (.oa-fake-leaf digeser
		   240/40): bar yang dirender di dalam pane meleset 240px dari teksnya
		   dan terlempar keluar viewport 470px — GEJALA OWNER tereproduksi.
		   Bar jujur (v0.1.102 portal ke document.body, preseden quick-ask &
		   menu tooltip core) tetap tertambat ke seleksi berapa pun offset pane. */
		await selectProgrammatic();
		await page.waitForTimeout(220);
		const chrome = await page.evaluate(() => {
			const bar = document.querySelector(".oa-selbar");
			const sel2 = window.getSelection();
			if (!bar || !sel2 || !sel2.rangeCount) return { none: true };
			const b = bar.getBoundingClientRect();
			const r = sel2.getRangeAt(0).getBoundingClientRect();
			const below = bar.classList.contains("is-below");
			return {
				dx: Math.round(b.left + b.width / 2 - (r.left + r.width / 2)),
				gap: Math.round(below ? b.top - r.bottom : r.top - b.bottom),
				bar: { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), bot: Math.round(b.bottom) },
				vw: window.innerWidth,
				vh: window.innerHeight,
			};
		});
		if (chrome.none) throw new Error("sel chrome witness: bar/seleksi absen");
		const onScreen = chrome.bar.r > 0 && chrome.bar.l < chrome.vw && chrome.bar.bot > 0 && chrome.bar.t < chrome.vh;
		if (!onScreen || Math.abs(chrome.dx) > 32 || chrome.gap < -2 || chrome.gap > 48) {
			throw new Error(`sel chrome witness failed (GEJALA OWNER): ${JSON.stringify(chrome)} — bar terpisah dari seleksinya / terlempar keluar layar: pane mencuri koordinat fixed (contain:strict)`);
		}
		console.log("  [sel] workspace-chrome: pane contain:strict digeser 240/40, bar tetap tertambat ke seleksi ✓ (portal body — koordinat viewport jujur)");
		/* lane 5 — dblclick word-selection witness (owner 2026-08-07: "select text
		   dengan metode klik tidak ke select … seperti ke cancel"): dobel-klik kata
		   di teks memilih kata secara native, lalu handler tapback MENGHAPUSNYA
		   0ms kemudian (removeAllRanges — dan diam-diam me-toggle reaksi). Red
		   pre-fix: seleksi kosong + bar absen. Post-fix: kata utuh terseleksi +
		   bar muncul. Gestur tapback di chrome bubble tetap dijaga lane reax
		   (dispatch ke root bubble, bukan ke teks) — dua wilayah, dua witness. */
		const dblAnchor = await page.evaluate(() => {
			const el = document.querySelector(".oa-msg-assistant .oa-msg-content strong");
			el.scrollIntoView({ block: "center" });
			const r = el.getBoundingClientRect();
			return { x: r.x, y: r.y, h: r.height };
		});
		await page.waitForTimeout(160);
		await page.mouse.dblclick(dblAnchor.x + 4, dblAnchor.y + dblAnchor.h / 2);
		await page.waitForTimeout(300);
		const dbl = await page.evaluate(() => ({
			text: window.getSelection()?.toString() ?? "",
			bar: !!document.querySelector(".oa-selbar"),
		}));
		if (dbl.text !== "Assemble" || !dbl.bar) {
			throw new Error(`sel dblclick witness failed (GEJALA OWNER): ${JSON.stringify(dbl)} — dobel-klik kata harus menyeleksi kata + memunculkan bar, bukan membatalkannya`);
		}
		console.log("  [sel] dblclick: kata terseleksi utuh ✓ · bar muncul dari gestur klik ✓ · tapback tetap milik chrome (lane reax) ✓");
	}
	/* toolstate fixture lane (owner 2026-08-07): measured court for v0.1.104 —
	   (1) thinking-bar stop FLUSH RIGHT of the full-width bar (official:
	   justify-between), official skin: dotted underline, no pill 999px, no
	   chevron svg. (2) tool-state icons = official 16px colored svg glyphs:
	   streaming = arc svg SPINNING (oa-spin, blue — official Loader2),
	   ready orange gear, completed green circle-check, error red circle-x.
	   Pre-fix witnesses: stop glued beside the text (gap ≫12), pill radius
	   999px, spinner a fragile 10px border-ring DIV (no svg — 1.5px border
	   quantized to 1px used-value → "cacat" di layar nyata), icons 13px,
	   ready painted faint-gray. */
	if (s === "toolstate") {
		const ts = await page.evaluate(() => {
			const why = [];
			const bar = document.querySelector(".oa-thinking-bar");
			const stop = bar?.querySelector(".oa-thinking-bar-stop");
			if (!bar || !stop) return { why: ["thinking-bar/stop absent"] };
			const rect = (el) => el.getBoundingClientRect();
			const gap = Math.round(rect(bar).right - rect(stop).right);
			const sc = getComputedStyle(stop);
			if (gap > 12) why.push(`stop-gap=${gap}px (want ≤12, official right-flush)`);
			if (sc.borderBottomStyle !== "dotted") why.push(`stop-underline=${sc.borderBottomStyle}`);
			if (sc.borderRadius !== "0px") why.push(`stop-radius=${sc.borderRadius}`);
			if (stop.querySelector("svg")) why.push("stop still carries chevron");
			const listen = (c) => (c.match(/\d+/g) || []).map(Number);
			const iconOf = (i) => {
				const ic = [...document.querySelectorAll(".oa-tool .oa-tool-header")][i]?.querySelector(".oa-tool-state-icon");
				if (!ic) return null;
				const svg = ic.querySelector("svg");
				const r = ic.getBoundingClientRect();
				return { svg: !!svg, w: Math.round(r.width), color: getComputedStyle(ic).color, spin: svg ? getComputedStyle(svg).animationName : "NO-SVG", dur: svg ? getComputedStyle(svg).animationDuration : "" };
			};
			const [streaming, ready, done, error] = [0, 1, 2, 3].map(iconOf);
			const group = document.querySelector(".oa-tools-list");
			const rows = group ? [...group.querySelectorAll(":scope > .oa-tool")] : [];
			const gc = group ? getComputedStyle(group) : null;
			const separators = rows.slice(1).filter((row) => getComputedStyle(row).borderTopWidth !== "0px").length;
			const errorBody = rows[3]?.querySelector(".oa-tool-content");
			const grouped = {
				outerBorder: gc?.borderTopWidth ?? null,
				outerRadius: gc?.borderTopLeftRadius ?? null,
				rows: rows.length,
				separators,
				errorAttached: errorBody?.closest(".oa-tool") === rows[3],
			};
			const chk = (name, s, f) => { if (!(s && f(s))) why.push(`${name}=${JSON.stringify(s)}`); };
			chk("streaming", streaming, (s) => s.svg && s.w === 16 && s.spin === "oa-spin" && listen(s.color)[2] > 140);
			chk("ready", ready, (s) => s.svg && s.w === 16 && (([r, g]) => r > 150 && g > 60 && g < 190)(listen(s.color)));
			chk("done", done, (s) => s.svg && s.w === 16 && listen(s.color)[1] > 130);
			chk("error", error, (s) => s.svg && s.w === 16 && listen(s.color)[0] > 160);
			if (grouped.outerBorder === "0px" || grouped.outerRadius === "0px" || grouped.rows !== 4 || grouped.separators !== 3 || !grouped.errorAttached) {
				why.push(`grouped=${JSON.stringify(grouped)}`);
			}
			return { why, gap, streaming, ready, done, error, grouped };
		});
		if (ts.why.length) throw new Error(`toolstate lane failed (GEJALA OWNER): ${JSON.stringify(ts.why)}`);
		console.log("  [toolstate] thinking stop: right-flush + dotted, tanpa pill/chevron ✓ · state glyphs 16px: spinner arc oa-spin biru ✓ · ready oranye ✓ · done hijau ✓ · error merah ✓");
		/* motion witnesses (rantai owner 2026-08-07: "tidak ada animasi sama
		   sekali" → v0.1.105 calm-fade → "bukan animasi loading malah
		   pulse"): computed animationName ≠ BUKTI BERGERAK — sampel
		   transform hidup dua kali di halaman normal; DAN putusan owner:
		   loading = motion esensial → di halaman reduce-motion pun arc
		   WAJIB tetap oa-spin 1s linear DAN benar-benar berputar (sampel
		   transform berubah), bukan membeku (0.01ms) dan bukan denyut. */
		const spinSel = ".oa-tool-state-icon.is-streaming .oa-tool-glyph";
		const trOf = (pg) => pg.evaluate((selQ) => {
			const el = document.querySelector(selQ);
			return el ? getComputedStyle(el).transform : "MISSING";
		}, spinSel);
		const tr1 = await trOf(page);
		await page.waitForTimeout(350);
		const tr2 = await trOf(page);
		if (tr1 === "MISSING" || tr1 === tr2) {
			throw new Error(`toolstate motion witness failed (GEJALA OWNER): spinner arc diam di mode normal (t1=${tr1} t2=${tr2})`);
		}
		const p2 = await browser.newPage({ viewport: { width: 470, height: FRAME_HEIGHT + 40 }, colorScheme: "dark", reducedMotion: "reduce" });
		await p2.setContent(html);
		await p2.waitForFunction(() => window.__oaReady === true, null, { timeout: 20000 }).catch(() => null);
		const calm = await p2.evaluate((selQ) => {
			const el = document.querySelector(selQ);
			if (!el) return { missing: true };
			const cs = getComputedStyle(el);
			return { name: cs.animationName, dur: cs.animationDuration };
		}, spinSel);
		const pr1 = await trOf(p2);
		await p2.waitForTimeout(350);
		const pr2 = await trOf(p2);
		await p2.close();
		if (calm.missing || calm.name !== "oa-spin" || calm.dur === "0.01ms" || pr1 === "MISSING" || pr1 === pr2) {
			throw new Error(`toolstate reduce-motion witness failed (GEJALA OWNER): arc tak berputar di reduce-motion — ${JSON.stringify(calm)} t1=${pr1} t2=${pr2} (loading = motion esensial: WAJIB berputar, putusan owner)`);
		}
		console.log("  [toolstate] motion: arc benar-benar BERPUTAR ✓ · reduce-motion pun TETAP berputar (loading = motion esensial, putusan owner) ✓");
	}
	/* Queue prompt honesty check (owner 2026-07-26, Hermes Desktop parity):
	   two prompts enqueued mid-run must drain FIFO once the turn settles —
	   anything less strands or reorders user intent. The frame itself was
	   captured mid-queue (thinking bar + 2 rows visible). */
	if (s === "queue") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaQueueCheck, null, { timeout: 25000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("queue check: __oaQueueCheck never set (drain never finished)");
		}
		const r = JSON.parse(raw);
		const inOrder = r.order.every((i) => i >= 0) && r.order[0] < r.order[1] && r.order[1] < r.order[2];
		if (r.queuedRowsSeen !== 2 || r.users !== 3 || !inOrder) {
			throw new Error(`queue check failed: ${raw} (want 2 rows seen, 3 user turns, FIFO order)`);
		}
		console.log("  [queue] drain order: alpha→beta→gamma ✓ · 2 rows captured mid-run · queue emptied");
	}
	/* Compression honesty check (v0.1.17, Hermes Desktop aux parity): the
	   third long turn must cross the 900×0.80 threshold and fold ONLY the
	   first two messages [u1,a1] into the rolling summary — the wire gains
	   the compacted-note system message carrying RINGKASAN-OK, a "Context
	   compacted" notice turn tells the user, the cache persists on the
	   saved session (summary+upto=2), and the saved history keeps all 6
	   messages (wire-only rewrite; disk stays whole). */
	if (s === "compress") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaCompressCheck, null, { timeout: 25000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("compress check: __oaCompressCheck never set (third run never finished)");
		}
		const r = JSON.parse(raw);
		if (!r.hasNote || !r.noteHasSummary || r.summary !== "RINGKASAN-OK" || r.upto !== 2 || r.messagesKept !== 6 || !r.domNotice || !r.domStartNotice) {
			throw new Error(
				`compress check failed: ${raw} (want note+summary on the wire, cache RINGKASAN-OK/upto=2, 6 messages kept on disk, START + END system-banner notices)`
			);
		}
		console.log("  [compress] wire folded [u1,a1]→RINGKASAN-OK ✓ · start + end notices ride the system banner ✓ · disk history kept 6/6 ✓ · cache persisted (upto=2) ✓");
	}
	/* Title-generation honesty check (v0.1.17): after the FIRST reply of a
	   brand-new session, one aux call names it — the persisted session title
	   must be exactly the canned title and the conversations panel (real
	   click) must already list it. */
	if (s === "title") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaTitleCheck, null, { timeout: 25000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("title check: __oaTitleCheck never set (title call never settled)");
		}
		const r = JSON.parse(raw);
		if (r.title !== "Kucing Oren Kesayangan" || !r.panelHas) {
			throw new Error(`title check failed: ${raw} (want persisted title "Kucing Oren Kesayangan" + panel listing it)`);
		}

		/* v0.1.140: computed-style witness for the shared SearchField. The
		   panel stays open in this scenario, so Playwright can exercise real
		   :hover and :active states rather than dispatching synthetic events.
		   The input paint must not move; keyboard/mouse focus remains visible
		   on the component shell via :focus-within. */
		const searchInput = page.locator('.oa-panel-search input[aria-label="Search chats"]');
		const readSearchPaint = () => page.evaluate(() => {
			const input = document.querySelector('.oa-panel-search input[aria-label="Search chats"]');
			const shell = input?.closest(".oa-searchbox");
			if (!input || !shell) return null;
			const i = getComputedStyle(input);
			const s = getComputedStyle(shell);
			return {
				input: {
					backgroundColor: i.backgroundColor,
					borderTopColor: i.borderTopColor,
					borderTopStyle: i.borderTopStyle,
					borderTopWidth: i.borderTopWidth,
					boxShadow: i.boxShadow,
					outlineStyle: i.outlineStyle,
					outlineWidth: i.outlineWidth,
				},
				shell: { borderColor: s.borderTopColor, boxShadow: s.boxShadow },
				focused: document.activeElement === input,
			};
		});
		await page.evaluate(() => document.querySelector('.oa-panel-search input[aria-label="Search chats"]')?.blur());
		await page.mouse.move(0, 0);
		const searchRest = await readSearchPaint();
		await searchInput.hover();
		await page.waitForTimeout(220); // settle host/theme form-field transitions
		const searchHover = await readSearchPaint();
		await page.mouse.down();
		await page.waitForTimeout(220);
		const searchActive = await readSearchPaint();
		await page.mouse.up();
		await page.waitForTimeout(220);
		const searchFocus = await readSearchPaint();
		const samePaint = (a, b) => JSON.stringify(a?.input) === JSON.stringify(b?.input);
		const shellFocusVisible = !!searchRest && !!searchFocus &&
			(searchFocus.shell.boxShadow !== searchRest.shell.boxShadow ||
			 searchFocus.shell.borderColor !== searchRest.shell.borderColor) &&
			searchFocus.focused === true;
		if (!samePaint(searchRest, searchHover) || !samePaint(searchRest, searchActive) ||
			!samePaint(searchRest, searchFocus) || !shellFocusVisible) {
			throw new Error(`v0.1.140 search paint regression: ${JSON.stringify({ searchRest, searchHover, searchActive, searchFocus, shellFocusVisible })}`);
		}
		console.log("  [title] first reply → session auto-named \u201CKucing Oren Kesayangan\u201D · panel lists it ✓ · shared search rest=hover=active=focus + shell focus ✓");
	}
	/* Slash quick-batch honesty check (v0.1.20): /title renames on disk,
	   /version reports the build, /q drains immediately when idle, and the
	   /sessions alias opens the panel prefilled by its arg. */
	if (s === "slash") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaSlashCheck, null, { timeout: 25000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("slash check: __oaSlashCheck never set (a slash command never settled)");
		}
		const r = JSON.parse(raw);
		if (r.title !== "Kucing Terbang" || !r.versionShown || !r.drainWorked || !r.panelOpen || r.panelPrefill !== "kucing") {
			throw new Error(
				`slash check failed: ${raw} (want title "Kucing Terbang" on disk, build info shown, /q drained to a user bubble, panel open with prefill "kucing")`
			);
		}
		/* v0.1.115: panel search = komponen SearchField --pill utuh + ✕ bekerja */
		if (r.panelBoxParts !== true || r.panelClearShown !== true || r.panelClearWorks !== true) {
			throw new Error(`slash check failed (SearchField pill): ${raw}`);
		}
		/* v0.1.116: kunci markdown di composer kaya — adapter caret-only */
		if (r.compFound !== true || r.mdCont !== true || r.mdExit !== true || r.mdTab !== true ||
			r.mdPair !== true || r.mdSkip !== true || r.mdPairDel !== true) {
			throw new Error(`slash check failed (markdown keys composer): ${raw}`);
		}
		/* v0.1.119 (owner 2026-08-08): judul sesi panjang tak lagi mendorong
		   ikon hapus keluar panel (ghost-row witness + pin rule) dan strip
		   pencarian menu profil mengikuti ritme padding baris item */
		if (r.ghostGeometry !== true || r.ghostPins !== true || r.listNoXOverflow !== true ||
			r.profileStripPad !== true || r.profileMenuItems !== 8 || r.profileMenuClosed !== true) {
			throw new Error(`slash check failed (v0.1.119 panel/profile ui): ${raw}`);
		}

		/* v0.1.158 (A1 EditableText): inline rename — reopen the panel (later
		   checks may have dismissed it) and clear the filter so the saved
		   "Kucing Terbang" row is unambiguously listed. Pencil on hover →
		   input → Enter commits, Escape cancels. */
		await page.locator('.oa-topbar .oa-icon-btn[aria-label="Conversations"]').click();
		await page.waitForTimeout(150);
		const clearBtn = page.locator('.oa-panel-search .oa-searchbox-clear');
		if (await clearBtn.count()) await clearBtn.click();
		await page.waitForTimeout(120);
		const renamedTo = "Kucing Terbang V2";
		const row = page.locator('.oa-panel-row:has(.oa-panel-row-title:text-is("Kucing Terbang"))');
		await row.hover();
		await row.locator(".oa-panel-row-rename").click();
		const renameInput = page.locator(".oa-panel-row-rename-input");
		await renameInput.fill(renamedTo);
		await renameInput.press("Enter");
		await page.waitForTimeout(250);
		const committed = await page.evaluate(() => ({
			renamed: window.__oaRenamed ?? null,
			titles: [...document.querySelectorAll(".oa-panel-row-title")].map((e) => e.textContent ?? ""),
			inputGone: document.querySelectorAll(".oa-panel-row-rename-input").length === 0,
		}));
		if (!committed.renamed || committed.renamed.title !== renamedTo ||
			!committed.titles.includes(renamedTo) || !committed.inputGone) {
			throw new Error(`rename check failed: ${JSON.stringify(committed)}`);
		}
		/* Escape cancels without committing (draft discarded, no store write) */
		const row2 = page.locator('.oa-panel-row:has(.oa-panel-row-title:text-is("Kucing Terbang V2"))');
		await row2.hover();
		await row2.locator(".oa-panel-row-rename").click();
		await page.locator(".oa-panel-row-rename-input").fill("Harusnya Batal");
		await page.locator(".oa-panel-row-rename-input").press("Escape");
		await page.waitForTimeout(150);
		const cancelled = await page.evaluate(() => ({
			lastRenamed: window.__oaRenamed ?? null,
			titles: [...document.querySelectorAll(".oa-panel-row-title")].map((e) => e.textContent ?? ""),
			inputGone: document.querySelectorAll(".oa-panel-row-rename-input").length === 0,
		}));
		if (!cancelled.titles.includes(renamedTo) || cancelled.titles.includes("Harusnya Batal") || !cancelled.inputGone) {
			throw new Error(`rename cancel check failed: ${JSON.stringify(cancelled)}`);
		}

		/* Conversations delete is deliberate: Cancel must preserve the row;
		   only the host modal's destructive confirmation reaches SessionStore. */
		const deleteRow = page.locator('.oa-panel-row:has(.oa-panel-row-title:text-is("agent-loop design"))');
		await deleteRow.hover();
		await deleteRow.locator(".oa-panel-row-del").click();
		const modal = page.locator(".oa-confirm-modal");
		if (!(await modal.textContent())?.includes('Delete chat “agent-loop design”?')) {
			throw new Error("session-delete confirmation did not open with the selected chat title");
		}
		await modal.getByRole("button", { name: "Cancel" }).evaluate((el) => el.click());
		await page.waitForTimeout(80);
		const cancelledDelete = await page.evaluate(() => ({
			deleted: window.__oaDeletedSession ?? null,
			stillThere: [...document.querySelectorAll(".oa-panel-row-title")].some((x) => x.textContent === "agent-loop design"),
		}));
		if (cancelledDelete.deleted !== null || !cancelledDelete.stillThere) {
			throw new Error(`session-delete cancel failed: ${JSON.stringify(cancelledDelete)}`);
		}
		await deleteRow.hover();
		await deleteRow.locator(".oa-panel-row-del").click();
		await page.locator(".oa-confirm-modal").getByRole("button", { name: "Delete chat" }).evaluate((el) => el.click());
		await page.waitForTimeout(220);
		const confirmedDelete = await page.evaluate(() => ({
			deleted: window.__oaDeletedSession ?? null,
			stillThere: [...document.querySelectorAll(".oa-panel-row-title")].some((x) => x.textContent === "agent-loop design"),
		}));
		if (confirmedDelete.deleted !== "s-1" || confirmedDelete.stillThere) {
			throw new Error(`session-delete confirmation failed: ${JSON.stringify(confirmedDelete)}`);
		}

		console.log("  [slash] /title saved to disk ✓ · /version shows build ✓ · /q idle→drain ✓ · /sessions alias opens panel + prefill ✓ · SearchField pill ✓ · md keys ✓ · semantic row focus/select ✓ · inline rename commit/cancel ✓ · delete confirm/cancel ✓");
	}
	/* Slash medium-batch honesty check (v0.1.21): the arg-stage popover
	   offers the three approval modes, clicking one fills the composer and
	   Send applies it to the live settings; /profile goes through the real
	   applyProfile prop; /save writes a vault markdown file whose content
	   includes the actual user prompt; /status reflects the mode just set. */
	if (s === "slash2") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaSlash2Check, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("slash2 check: __oaSlash2Check never set (a slash command never settled)");
		}
		const r = JSON.parse(raw);
		const rows = r.optionRows ?? [];
		const optsOk = ["manual", "cautious", "yolo"].every((m) => rows.some((t) => (t ?? "").startsWith(m)));
		const saveOk =
			typeof r.savePath === "string" &&
			r.savePath.startsWith("openagent/exports/chat-") &&
			r.savePath.endsWith(".md") &&
			r.saveHasContent === true;
		if (!optsOk || !r.filled.startsWith("/approvals yolo") || r.modeNow !== "yolo" || r.profileApplied !== "research" || !saveOk || !r.statusShown || r.saveMermaidSalvage !== true) {
			throw new Error(`slash2 check failed: ${raw} (saveMermaidSalvage: vault note hasil /save harus membawa label terkutip + komentar inline-percent sebagai baris %% sendiri)`);
		}
		console.log("  [slash2] arg options render ✓ · click fills ✓ · /approvals applied live ✓ · /profile→applyProfile ✓ · /save→vault md ✓ (+ label mermaid terkutip v0.1.124 + komentar `; %` dipisah v0.1.143) ✓ · /status aware ✓");
	}
	if (s === "slash3") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaSlash3Check, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("slash3 check: __oaSlash3Check never set (the skills palette flow never settled)");
		}
		const r = JSON.parse(raw);
		const groups = r.headers ?? [];
		const orderOk = groups.indexOf("Commands") === 0 && groups.indexOf("Skills") > 0;
		const flowOk =
			r.skillRowSeen === true &&
			(r.filledAfterClick ?? "").startsWith("/skills use beta-skill") &&
			r.noticeSeen === true &&
			r.reqHadSkill === true &&
			r.reqCleanAfter === true;
		/* v0.1.77 Commands tab: flagged snippets render their own slash
		   group and clicking stages the full prompt into the composer */
		const snipOk =
			r.snipGroupOk === true &&
			r.snipRowSeen === true &&
			(r.snipFilled ?? "").startsWith("TOLONG RINGKAS SEKARANG");
		/* v0.1.120 un-merge lengkap: slash/@ menu pulang ke blok asli (padding
		   0, display block). v0.1.165 (Hermes parity): hairline grup retired —
		   header kini tanpa border-top sama sekali. */
		const menuRuleOk =
			r.slashPadPin === true &&
			r.slashDisplayPin === true &&
			r.slashHdrNoRule === true;
		if (!orderOk || !flowOk || !snipOk || !menuRuleOk) {
			throw new Error(`slash3 check failed: ${raw}`);
		}
		console.log("  [slash3] group headers (Commands→Skills) ✓ · skill row stages verb ✓ · read arms disabled skill ✓ · instructions ride one message ✓ · Snippets group + fill ✓ · slash-menu de-merged ✓");
	}
	if (s === "token") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaTokenCheck, null, { timeout: 40000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("token check: __oaTokenCheck never set (the prompt-token flow never settled)");
		}
		const r = JSON.parse(raw);
		/* attachNote ON: {activeNote} must NOT double-attach (the composer's
		   active-note chip owns that ride) and must NOT Notice a miss */
		const skipOk = r.skipExact === true && r.skipStray === false && r.skipNotice === false;
		/* after Detach: {#fruit} → BOTH property-tagged notes ride as
		   attach blocks, tag token stripped; vehicle note stays out (OR) */
		const tagOk =
			r.tagMsg.includes("[Attached file: Tokens/Apple.md]") &&
			r.tagMsg.includes("APPLE-BODY") &&
			r.tagMsg.includes("[Attached file: Tokens/Banana.md]") &&
			r.tagMsg.includes("BANANA-BODY") &&
			!r.tagMsg.includes("CAR-BODY") &&
			!r.tagMsg.includes("{#fruit}") &&
			r.tagMsg.endsWith("Jelaskan  secara singkat ya");
		/* {[[Car]]} + {activeNote} → both resolved + stripped */
		const mixOk =
			r.mixMsg.includes("[Attached file: Tokens/Car.md]") &&
			r.mixMsg.includes("[Attached file: Tokens/Apple.md]") &&
			!r.mixMsg.includes("{[[Car]]}") &&
			!r.mixMsg.includes("{activeNote}") &&
			r.mixMsg.includes("bedanya apa?");
		/* unresolvable {[[Hantu]]}: stripped from the model text AND named
		   in a Notice — never a silent no-op */
		const missOk =
			r.missExact === true &&
			r.missStray === false &&
			(r.notices ?? []).some((n) => n.includes("couldn't resolve prompt token") && n.includes("{[[Hantu]]}"));
		/* {} with no live selection (chat origin): token drops out, never
		   reaches the model as a literal "{}" */
		const braceOk = r.braceExact === true;
		/* editor bridge, DOM-representation-agnostic: {} → selection inline
		   in slot position (no quote anywhere); no-{} → legacy lead +
		   blockquote staging */
		const bridgeOk =
			r.braceInline.includes("Ringkas:") &&
			r.braceInline.includes("ISI-SELEKSI") &&
			r.braceInline.indexOf("Ringkas:") < r.braceInline.indexOf("ISI-SELEKSI") &&
			!r.braceInline.includes(">") &&
			!r.braceInline.includes("{}") &&
			r.braceQuote.includes("Ringkas:") &&
			r.braceQuote.includes("Kuliti pelan") &&
			r.braceQuote.includes("> ISI-KEDUA");
		/* the composer stays PRISTINE throughout: tokens resolve onto the
		   wire + chips only come from explicit attach gestures — a stray
		   "Apple" chip in the first shot was a real bug signal, never
		   something to crop around */
		const pristineOk =
			(r.chipsAfterSends ?? ["x"]).length === 0 && (r.chipsAfterBridge ?? ["x"]).length === 0;
		const editorScopeOk =
			r.mismatchRejected === true &&
			r.strictMissingScopeRejected === true &&
			r.editorScopeNoticeCount >= 2;
		if (!skipOk || !tagOk || !mixOk || !missOk || !braceOk || !bridgeOk || !pristineOk || !editorScopeOk) {
			throw new Error(`token check failed: ${raw}`);
		}
		console.log("  [token] {activeNote} no-double-attach ✓ · {#tags} OR-expand ✓ · {[[]]}+{activeNote} resolve ✓ · miss stripped + noticed ✓ · {} drops ✓ · editor {} inline vs quote ✓ · editor Workspace provenance ✓ · Strict missing provenance rejected ✓ · composer pristine ✓");
	}
	if (s === "snips") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaSnipsCheck, null, { timeout: 20000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("snips check: __oaSnipsCheck never set (the snippets submenu never opened)");
		}
		const r = JSON.parse(raw);
		const rows = r.rows ?? [];
		/* v0.1.79 picker toggle: the OPT-OUT row (picker:false) is absent,
		   both enabled rows listed, and the root row's "N saved" counts
		   only ENABLED snippets */
		const pickerOk =
			rows.includes("Kelihatan Selalu") &&
			rows.includes("Juga Kelihatan") &&
			!rows.includes("Tersembunyi Mana") &&
			r.rootSub === "2 saved";
		if (!pickerOk) {
			throw new Error(`snips check failed: ${raw}`);
		}
		console.log("  [snips] picker opt-out row absent ✓ · enabled rows listed ✓ · root sub counts enabled only ✓");
	}
	if (s === "clfy") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaClfyCheck, null, { timeout: 60000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("clfy check: __oaClfyCheck never set (the clarify flow never settled)");
		}
		const r = JSON.parse(raw);
		const envelopes = (r.answers ?? []).map((x) => {
			try { return JSON.parse(x); } catch { return null; }
		});
		const byQ = (frag) => envelopes.find((o) => o && typeof o.question === "string" && o.question.includes(frag));
		/* Hermes terminal verbs: every interaction resolves INTO the wire —
		   single pick, open-ended text, multi list + typed Other, and the
		   explicit Skip carrying the best-judgement sentence */
		const singleOk = byQ("Folder mana")?.user_response === "Projects" &&
			(byQ("Folder mana")?.choices_offered ?? []).join(",") === "Projects,Daily,Semua vault";
		const openOk = byQ("catatan khusus")?.user_response === "jangan hapus draft" && byQ("catatan khusus")?.choices_offered === null;
		const multiOk = (byQ("Kategori mana")?.user_response ?? []).join(",") === "meeting,ide,inbox juga" &&
			(byQ("Kategori mana")?.choices_offered ?? []).join(",") === "meeting,ide,bacaan";
		const skipOk = (byQ("Konfirmasi terakhir")?.user_response ?? "").includes("Use your best judgement");
		const summariesOk = (r.summaries ?? []).length === 4 &&
			(r.summaries ?? []).some((s) => s.includes("Folder mana") && s.includes("Answer: Projects")) &&
			(r.summaries ?? []).some((s) => s.includes("Konfirmasi terakhir") && s.includes("Skipped"));
		const cardsOk =
			r.got1 === true && r.got2 === true && r.got3 === true && r.got4 === true &&
			(r.cardQ ?? []).join("|").includes("Folder mana") &&
			(r.cardQ ?? []).join("|").includes("catatan khusus") &&
			(r.cardQ ?? []).join("|").includes("Kategori mana") &&
			(r.cardQ ?? []).join("|").includes("Konfirmasi terakhir") &&
			(r.s1Choices ?? []).length === 4 && // 3 agent choices + appended Other
			(r.s1Choices ?? []).some((c) => c.includes("Other (type your answer)")) &&
			r.typed2 === true && r.typed3 === true &&
			r.finishSeen === true;
		if (!singleOk || !openOk || !multiOk || !skipOk || !cardsOk || !summariesOk) {
			throw new Error(`clfy check failed: ${raw}`);
		}
		console.log("  [clfy] single pick rides the wire ✓ · open-ended ✓ · multi+Other list ✓ · skip=best-judgement ✓ · cards progress per question ✓");
	}
	if (s === "qask") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaQaskCheck, null, { timeout: 60000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("qask check: __oaQaskCheck never set (the quick-ask flow never settled)");
		}
		const r = JSON.parse(raw);
		/* wire shape: system prompt verbatim, selection rides the FIRST
		   user turn only (xml-wrapped), follow-up omits it but keeps the
		   full conversation */
		const wireOk =
			r.sysOk === true && r.selWrap === true && r.selWrapQuestion === true && r.followUpNoSel === true;
		/* Replace went through the guard into the doc; panel closed and the
		   persistent highlight left with it */
		const replaceOk =
			r.replacedDoc === true && r.closedAfterReplace === true && r.highlightShown === true && r.highlightCleared === true;
		/* stray inside-range edit → guard flips (Copilot reason verbatim);
		   pre-edit it MUST have been enabled (no cry-wolf guards) */
		const guardOk = r.preStrayEnabled === true && r.strayDisabled === true && (r.strayTitle ?? "").includes("Selection content has changed");
		const escOk = r.escClosed === true && r.shotPanelVisible === true;
		/* v0.1.84 — icon sizing: close square, glyph sesuai size <Icon>
		   (X=13, ArrowUp=16 bukan glyph 24 asli), tengah ≤1px drift.
		   v0.1.100 (owner: "samakan dengan oa-icon-btn"): 24×24 → 28×28
		   parity */
		const g = r.iconGeometry ?? {};
		const iconOk =
			g.closeW === 28 && g.closeH === 28 &&
			g.closeSvgW === 13 && g.sendSvgW === 16 &&
			(g.closeDrift ?? 9) <= 1 && (g.sendDrift ?? 9) <= 1 &&
			/* v0.1.122 (owner: samakan dengan quick ask) — kunci anti-kapsul
			   ikut terukur di panel: bujur sangkar + aspect-ratio 1/1 */
			g.sendSquare === true && g.sendAspect === "1 / 1" && g.closeAspect === "1 / 1";
		/* v0.1.85 — chips: fallback bawaan saat kosong; snippet flagged
		   menggantikan (getter live per open); klik men-stage text */
		const chipsOk =
			r.fallbackChips === true && r.customChips === true && r.chipStagesText === true;
		/* v0.1.86 — baris chip = satu baris scroll horizontal: nowrap+auto,
		   8 chip overflow scrollWidth, semua chip tetap ada di DOM */
		const scrollOk =
			r.chipsScrollRow === true && r.chipsOverflow === true && r.chipsAllPresent === true;
		/* v0.1.87 — kontrak audit: error inline + input kembali + bubble
		   tergulung + retry jalan + error bersih; overscroll contain;
		   textarea aria-label */
		const errOk =
			r.errShown === true && r.errInputBack === true && r.errBubbleRolledBack === true &&
			r.retryAssistant === true && r.errClearedAfterRetry === true;
		const containOk = r.sugsContainedX === true && r.chatScrollContained === true;
		const a11yOk = r.inputAriaLabel === true;
		/* v0.1.91/100 — drag head saja: delta vertikal tepat, detach saat
		   scroll, clamp kanan viewport, drag dari × noop; v0.1.100: grip
		   glyph DIHAPUS (grip-none), resize balik sebagai seam tak terlihat */
		const dragOk =
			r.headCursor === true && r.gripGlyphGone === true &&
			r.dragMoved === true && r.detachedOnScroll === true && r.dragClamped === true &&
			r.dragFromCloseNoop === true;
		/* v0.1.89 — model picker in-panel (parity main chat): caption footer
		   live, header bersih, pill/menu/refresh/Edit-Models dialog bekerja */
		const pickerOk =
			r.footShown === true && r.headLabelGone === true && r.pickerMounted === true &&
			r.menuOpens === true && r.menuStyled === true && r.pickSwitches === true &&
			r.refreshKeepsOpen === true && r.visDialogOpens === true &&
			r.visToggleWrites === true && r.visClosed === true;
		/* v0.1.90 — {activeNote}: blok [Attached file:] terlampir ke wire,
		   konten LIVE doc (suntingan belum-simpan ikut), token distrip dari
		   wire, bubble menyimpan teks mentah */
		const activeNoteOk =
			r.activenoteAttached === true && r.activenoteLive === true &&
			r.activenoteStripped === true && r.activenoteBubbleRaw === true;
		/* v0.1.92 — retry/failover: retry per kelas error, 401 tanpa retry
		   langsung failover, abort sebelum attempt tak memanggil target,
		   stream parsial ter-reset end-to-end */
		const resilienceOk =
			r.resilienceRetries === true && r.resilienceFailover === true &&
			r.resilienceAbort === true && r.streamResetOnRetry === true;
		/* v0.1.144 R40: hostile Mermaid must pass through the real Quick Ask
		   finalization/render path as one canonical fence. */
		const mermaidOk = r.mermaidCanonical === true;
		/* v0.1.100 — resize seam: pojok utuh DI DALAM frame (pelajaran
		   Tahoe), kursor ↘, tak terlihat saat diam, aria; keyboard +12/+48
		   tepat, sized class + chat-scroll flex filler, drag delta tepat,
		   clamp MIN 300×200 (semua NILAI RESOLVED — pelajaran 79) */
		const seamOk =
			r.seamCorner === true && r.seamCursor === true && r.seamInvisible === true &&
			r.seamAria === true && r.seamKeys === true && r.seamSizedClass === true &&
			r.seamSizedFlex === true && r.seamDrag === true && r.seamClamped === true;
		if (!wireOk || !replaceOk || !guardOk || !escOk || !iconOk || !chipsOk || !scrollOk || !errOk || !containOk || !a11yOk || !dragOk || !seamOk || !pickerOk || !activeNoteOk || !resilienceOk || !mermaidOk) {
			throw new Error(`qask check failed: ${raw}`);
		}
		/* v0.1.98 (owner: "kasus sama di composer quick ask") — the composer
		   hover must change NOTHING. v0.1.89 mirrored the picker CSS but the
		   global field-reset layer stayed .oa-app-only, so quickask fields
		   took the UA/host hover paint. Measure rest vs :hover on the live
		   panel (self-contained evaluators — lesson 76). */
		{
			const snapAsk = () => {
				const el = document.querySelector(".oa-quickask-input");
				if (!el) return null;
				const c = getComputedStyle(el);
				return {
					borderColor: c.borderTopColor, borderStyle: c.borderTopStyle,
					bg: c.backgroundColor, shadow: c.boxShadow,
					outline: `${c.outlineWidth} ${c.outlineStyle}`.trim(),
					color: c.color, opacity: c.opacity,
				};
			};
			const restAsk = await page.evaluate(snapAsk);
			await page.hover(".oa-quickask-input");
			await page.waitForTimeout(60);
			const hoverAsk = await page.evaluate(snapAsk);
			const diffAsk = {};
			if (restAsk && hoverAsk) {
				for (const k of Object.keys(restAsk)) {
					if (restAsk[k] !== hoverAsk[k]) diffAsk[k] = [restAsk[k], hoverAsk[k]];
				}
			}
			if (!restAsk || Object.keys(diffAsk).length > 0) {
				throw new Error(`qask check failed: composer hover moved paint: ${JSON.stringify(diffAsk)}`);
			}
		}
		/* v0.1.99 (owner: "malah timbul masalah baru") — the composer must win
		   over the global reset on its OWN metrics. v0.1.98's :is() blob
		   inflated the reset to (0,3,1) and silently zeroed padding/min-height
		   (hover-diff stayed {} → green palsu). Assert RESOLVED values:
		   padding 10px 12px 4px · min/max-height 26/150 · line-height 1.5×
		   (the longhand `font: inherit` shorthand also used to eat lh). */
		{
			const metAsk = await page.evaluate(() => {
				const el = document.querySelector(".oa-quickask-input");
				if (!el) return null;
				const c = getComputedStyle(el);
				return {
					pt: c.paddingTop, pr: c.paddingRight, pb: c.paddingBottom, pl: c.paddingLeft,
					fs: c.fontSize, lh: c.lineHeight, minH: c.minHeight, maxH: c.maxHeight,
					token: getComputedStyle(document.body).getPropertyValue("--font-ui-small").trim(),
				};
			});
			const metricsOwn = metAsk && metAsk.pt === "10px" && metAsk.pr === "12px" &&
				metAsk.pb === "4px" && metAsk.pl === "12px" &&
				metAsk.minH === "26px" && metAsk.maxH === "150px" &&
				Math.abs(parseFloat(metAsk.lh) / parseFloat(metAsk.fs) - 1.5) < 0.02 &&
				(!metAsk.token || metAsk.fs === metAsk.token);
			if (!metricsOwn) {
				throw new Error(`qask check failed: composer metrics not its own (reset outranks component): ${JSON.stringify(metAsk)}`);
			}
		}
		/* coarse-pointer (touch): actions TIDAK boleh hanya hidup di hover.
		   Harness = Playwright; fitur pointer/hover TIDAK di-emulate oleh
		   Emulation.setEmulatedMedia (hanya prefers-*) → trik DevTools:
		   mobile metrics + touch emulation mem-flip @media (pointer:coarse) */
		let coarseActionsVisible = false;
		try {
			const cdp = await page.context().newCDPSession(page);
			await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true });
			await cdp.send("Emulation.setDeviceMetricsOverride", {
				width: 800, height: 700, deviceScaleFactor: 2, mobile: true,
			});
			await page.waitForTimeout(150);
			const coarseActive = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
			if (coarseActive) {
				coarseActionsVisible = await page.evaluate(() => {
					const a = document.querySelector(".oa-quickask .oa-msg-actions");
					return !!a && getComputedStyle(a).opacity === "1";
				});
			}
			await cdp.send("Emulation.clearDeviceMetricsOverride");
			await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
		} catch { /* turun ke uji struktural */ }
		if (!coarseActionsVisible) {
			/* fallback deterministik: media-rule-nya ADA di CSSOM dengan
			   selector + opacity 1 yang benar (engine menolak flip media) */
			const ruleOk = await page.evaluate(() => {
				for (const sheet of document.styleSheets) {
					try {
						for (const rule of sheet.cssRules) {
							if (!(rule instanceof CSSMediaRule)) continue;
							const cond = rule.conditionText;
							if (!cond.includes("hover: none") || !cond.includes("pointer: coarse")) continue;
							for (const inner of rule.cssRules) {
								if (inner.selectorText === ".oa-quickask .oa-msg-actions" && inner.style.opacity === "1") return true;
							}
						}
					} catch { /* sheet inaccessible */ }
				}
				return false;
			});
			if (!ruleOk) {
				throw new Error("qask check failed: coarse-pointer actions row not visible (hover-reveal leak)");
			}
		}
		console.log("  [qask] overlay mounts anchored ✓ · <selected_text> first turn only ✓ · Replace through guard ✓ · stray-edit guard ✓ · Esc ✓ · close 28px icon-btn + glyph fit/centered ✓ · grip glyph gone ✓ · resize seam (corner/cursor/invisible/keys +12·+48/sized-flex/delta/clamp 300×200) ✓ · chips: fallback→custom live ✓ · chip row scrolls ✓ · error inline + retry ✓ · coarse-pointer reveal ✓ · drag head grip-move (delta/detach/clamp/×-noop) ✓ · model picker (caption live, pick, refresh opens, vis dialog) ✓ · {activeNote} live-doc ✓ · composer hover no-op + metrics own ✓ · retry/failover (kelas error, 401→swap, abort, stream reset) ✓ · R40 canonical Mermaid final ✓");
	}
	if (s === "branch") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaBranchCheck, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("branch check: __oaBranchCheck never set (the /branch fork never settled)");
		}
		const r = JSON.parse(raw);
		const lineageOk =
			typeof r.parentId === "string" &&
			typeof r.childId === "string" &&
			r.childId !== r.parentId &&
			(r.childTitle ?? "").endsWith("Branch 1") &&
			(r.childTurns ?? 0) >= 4;
		const integrityOk = r.branchNotice === true && r.childGreetingVisible === true && r.parentWireStable === true && r.childWireGrows === true;
		if (!lineageOk || !integrityOk) {
			throw new Error(`branch check failed: ${raw}`);
		}
		console.log("  [branch] child on disk with parent lineage ✓ · lineage title ✓ · active chat switches ✓ · parent wire byte-stable ✓ · child grows alone ✓");
	}
	if (s === "chips") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaChipsCheck, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("chips check: __oaChipsCheck never set (the composer chip flow never settled)");
		}
		const r = JSON.parse(raw);
		const chipsOk =
			(r.halfTyped?.chips?.length ?? 9) === 0 &&
			(r.committedCmd?.chips ?? []).join(",") === "command:/retry" &&
			(r.mixed?.chips ?? []).join(",") === "command:/retry,skill:/alpha" &&
			(r.mixed?.text ?? "").includes("/usr/local") &&
			!(r.afterDelete?.text ?? "").includes("/alpha") &&
			!(r.afterDelete?.chips ?? []).some((c) => (c ?? "").includes("skill")) &&
			(r.afterPaste?.chips ?? []).includes("skill:/alpha") &&
			(r.beforeSend?.chips ?? []).includes("skill:/beta-skill") &&
			r.bubblePill === true &&
			r.skillRode === true;
		if (!chipsOk) {
			throw new Error(`chips check failed: ${raw}`);
		}
		console.log("  [chips] typed command chips on space ✓ · skill mid-message ✓ · /usr/local safe ✓ · atomic delete ✓ · paste hydrates ✓ · /skill-name dispatch ✓ · bubble pills ✓");
	}
	if (s === "composer") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaComposerCheck, null, { timeout: 30000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("composer check: __oaComposerCheck never set (the history-browse flow never settled)");
		}
		const r = JSON.parse(raw);
		if (
			r.up1 !== "pertanyaan kedua composer" ||
			r.up2 !== "pertanyaan pertama composer" ||
			r.down1 !== "pertanyaan kedua composer" ||
			r.down2 !== "" ||
			r.typedKept !== "draft saya" ||
			r.typedBrowsed !== "draft saya"
		) {
			throw new Error(`composer check failed: ${raw}`);
		}
		console.log("  [composer] ↑/↓ recall earlier prompts ✓ · draft restored on ↓ ✓ · typed draft never hijacked ✓");
	}
	if (s === "menugeo") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaMenuGeoCheck, null, { timeout: 15000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("menugeo check: __oaMenuGeoCheck never set (menus never settled)");
		}
		const r = JSON.parse(raw);
		if (!r.modelShown || !r.attachShown || !r.modelAbove || !r.attachAbove || !r.modelWide || !r.attachWide) {
			throw new Error(`menugeo check failed: ${raw} (want both menus shown, above the composer, full composer width)`);
		}
		console.log("  [menugeo] model + attach menus — shown ✓ · above the composer ✓ · full composer width ✓");
	}
	if (s === "goal") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaGoalCheck, null, { timeout: 40000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("goal check: __oaGoalCheck never set (the Ralph loop never settled)");
		}
		const r = JSON.parse(raw);
		const loopOk =
			r.kickoffRuns === 1 &&
			r.continuationRuns === 1 &&
			r.continuationHasGoal === true &&
			r.judgeCalls === 2 &&
			r.judgeModelOk === true && // v0.1.27: the aux pin switches the MODEL on the wire
			r.goalSnap?.status === "done" &&
			r.goalSnap?.turnsUsed === 1;
		const surfaceOk = r.chip.includes("Standing goal (done)") && r.statusNotice === true && r.chipAfterClear === null && r.doneNotice === true;
		if (!loopOk || !surfaceOk) {
			throw new Error(`goal check failed: ${raw}`);
		}
		console.log("  [goal] kickoff ✓ · judge CONTINUE→continuation ✓ · DONE→✓ chip ✓ · /goal status ✓ · clear removes chip ✓");
	}
	if (s === "steer") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaSteerCheck, null, { timeout: 40000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("steer check: __oaSteerCheck never set (the steered run never settled)");
		}
		const r = JSON.parse(raw);
		const ok =
			r.stashNotice === true && // busy stash confirmed, CLI wording
			r.queueRowsHeld === 0 && // and NEVER parked as a queue row
			r.markerOnWire === true && // byte-exact marker rode the tool result
			r.steerNoteShown === true && // transcript shows the attributed note
			r.markerRawLeaked === false && // without leaking raw marker text
			r.idleBubblePlain === true && // idle /steer → plain user bubble
			r.idleRan === true; // and it really reached the model
		if (!ok) {
			throw new Error(`steer check failed: ${raw}`);
		}
		console.log("  [steer] busy stash (no queue row) ✓ · marker rides the tool result ✓ · steer note renders ✓ · idle → ordinary next turn ✓");
	}
	if (s === "webe") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaWebeCheck, null, { timeout: 40000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("webe check: __oaWebeCheck never set (the web_extract turns never settled)");
		}
		const r = JSON.parse(raw);
		const ok =
			r.footerOnWire === true && // the 75/25 window's [TRUNCATED] footer
			r.savedPathOnWire === true && // names the vault path
			r.readNotePointer === true && // with the exact read_note paging call
			r.vaultStored === true && // full text really written into the vault
			r.summarizeModelOk === true && // summarize rode the pinned aux model
			r.summaryOnWire === true; // and replaced the raw window (no fail-open leak)
		if (!ok) {
			throw new Error(`webe check failed: ${raw}`);
		}
		console.log("  [webe] head+tail window + footer ✓ · full text in vault ✓ · read_note pointer ✓ · summarize rode the aux pin ✓");
	}
	if (s === "moa") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaMoaCheck, null, { timeout: 40000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("moa check: __oaMoaCheck never set (the MoA turn never settled)");
		}
		const r = JSON.parse(raw);
		const ok =
			r.refsOnceQwen === true && // advisors ran once for the whole TURN…
			r.refsOnceGemma === true && // (1 advisor + 1 title call, never a 2nd advisor run)
			r.actingTwice === true && // …while the preset's aggregator made BOTH acting calls
			r.guidanceBothIters === true && // guidance block on every acting wire
			r.headerFields === true && // with the official header fields
			r.adviceOnWire === true && // joined advisor blocks reach the aggregator
			r.refBlocksShown === true && // disclosure shows the labelled reference blocks
			r.aggregatingShown === true && // plus the aggregating line
			r.progressSelfCleaned === true && // progress trail replaced (self-cleaning)
			r.answerShown === true; // the aggregator's answer rendered
		if (!ok) {
			throw new Error(`moa check failed: ${raw}`);
		}
		console.log("  [moa] advisors once per user turn ✓ · aggregator acts with joined guidance ✓ · disclosure shows refs + aggregating ✓");
	}
	if (s === "moa2") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaMoa2Check, null, { timeout: 40000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("moa2 check: __oaMoa2Check never set (the one-shot turn never settled)");
		}
		const r = JSON.parse(raw);
		const ok =
			r.usageShown === true && // bare /moa prints the official usage line
			r.oneShotNotice === true && // the exact official notice rides the chat
			r.advisorsOnceQwen === true && // advisors fanned out once for the turn…
			r.advisorsOnceGemma === true && // (gemma: 1 advisor + 1 title call)
			r.actingTwice === true && // …the aggregator acted twice, with guidance on
			r.guidanceBothIters === true && // every acting wire
			r.answerShown === true && // the answer rendered
			r.restoredPreset === true && // the picker state was restored after the turn
			r.restoredModel === true &&
			r.pivotNotice === true && // bare /model crew implicit-pivots onto MoA
			r.pivotSet === true &&
			r.pivotKeepsModel === true && // and leaves the plain model untouched
			r.pillShowsPreset === true && // the pill shows the preset
			r.disabledNoPivot === true && // a DISABLED preset never pivots (#55187)
			r.disabledLeavesNotice === true && // and the leave-notice is honest
			r.prefixedNoPivot === true; // "moa:crew" is not a bare name
		if (!ok) {
			throw new Error(`moa2 check failed: ${raw}`);
		}
		console.log("  [moa2] /moa one-shot restores ✓ · bare /model pivots (enabled-only) ✓ · moa: prefix never matches ✓");
	}
	if (s === "menu2") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaMenu2Check, null, { timeout: 40000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("menu2 check: __oaMenu2Check never set (the menu/dialog driver never finished)");
		}
		const r = JSON.parse(raw);
		const ok =
			r.placeholderOk === true && // official "Search models"
			r.groupsAlpha === true && // LLM Studio (local) then OpenRouter, alphabetical
			r.rowsCollapsedOk === true && // fast pair merged into one row, date-pin dropped
			r.claudeNamed === true && // merged family shows the base name only
			r.gptNamed === true &&
			r.orphanFastTag === true && // orphan -fast stands alone WITH its tag
			r.datePinDropped === true &&
			r.moaSect === true && // bottom "MoA presets" section
			r.moaCrewRow === true &&
			r.moaOffRow === true && // disabled presets list too (official)
			r.footerTexts === true && // Refresh Models + Edit Models…
			r.kbCurrentRow === true && // current row keyboard-highlighted on open
			r.kbTargetClaude === true &&
			r.crossProviderPicked === true && // Enter committed a (provider, model) PAIR
			r.pillShowsClaude === true &&
			r.collapsedHidden === true && // collapse hides rows…
			r.collapsedPersist === true && // …and persists to settings
			r.searchSpansHidden === true && // search ignores the collapsed rail
			r.expandedBack === true && // re-expand restores the group
			r.sboxParts === true && // v0.1.115 SearchField strip: struktur role/ikon/input
			r.noClearEmpty === true && // ✕ absen saat kosong
			r.clearShown === true && // ✕ muncul saat berisi
			r.clearWorks === true && // klik ✕ membersihkan
			r.escAfterFilled === true && // Escape dua tahap: berisi → bersih + menu tetap buka
			r.menuOpenDuring === true && // Refresh Models keeps the menu OPEN
			r.spinSeen === true && // icon spins while catalogs re-pull
			r.menuOpenAfter === true &&
			r.refreshedOrCatalog === true && // second provider's list re-pulled
			r.refreshedRows === true && // menu reflects the new catalog live
			r.healedModel === true && // active model healed against the fetched list
			r.refreshNotice === true && // one summary notice
			r.refreshNoSettingsJump === true && // NEVER routes to settings (owner report 2026-08-01)
			r.dlgOpen === true && // Edit Models… opens the visibility dialog
			r.dlgTitle === true &&
			r.twoVisGroups === true &&
			r.mastersAllOn === true && // curated default: every family on, masters plain-checked
			r.masterPartial === true && // one row off → indeterminate
			r.oneOff === true && // stored list materializes minus that family
			r.sentinelAdded === true && // last row off → hide-all sentinel
			r.onlyOneKept === true && // re-enable keeps ONLY that family (official)
			r.otherProviderUntouched === true && // untouched provider keeps its curated list
			r.addProviderShown === true &&
			/* v0.1.120 (owner: list model kena serapan yang sama): ghost grup
			   nama-family tak-terputus tak meluber + padding list 4px */
			r.modelListNoXOverflow === true &&
			r.modelGroupContained === true &&
			r.modelListPadPin === true;
		if (!ok) {
			throw new Error(`menu2 check failed: ${raw}`);
		}
		console.log("  [menu2] groups/families/display names ✓ · kbd cross-provider pick ✓ · collapse+search ✓ · refresh stays open ✓ · visibility dialog (tri-state, sentinel) ✓ · model-list containment ✓");
	}
	if (s === "empty") {
		let raw = null;
		try {
			raw = await page.waitForFunction(() => window.__oaEmptyCheck, null, { timeout: 20000 }).then((h) => h.jsonValue());
		} catch {
			throw new Error("empty check: __oaEmptyCheck never set");
		}
		const r = JSON.parse(raw);
		const ok =
			r.wordmark === "OPEN AGENT" &&
			typeof r.copy === "string" &&
			r.copy.length > 12 &&
			r.hintLeft === false &&
			r.inOfficialPool === true; // copy line = official intro-copy.jsonl text (v0.1.36)
		if (!ok) throw new Error(`empty check failed: ${raw}`);
		console.log("  [empty] wordmark OPEN AGENT ✓ · one rotating copy line ✓ · super-minimal (no hint) ✓");

		/* composer action radius (owner directive 2026-08-02): one family —
		   measured computed style, not source strings. Official parity:
		   every composer control rounded-full (hermes controls.tsx @main). */
		const radii = await page.evaluate(() => {
			const pick = (sel) => {
				const el = document.querySelector("#root " + sel);
				if (!el) return { r: "missing" };
				const cs = getComputedStyle(el);
				return { r: cs.borderRadius, ar: cs.aspectRatio, sq: el.offsetWidth === el.offsetHeight, bg: cs.backgroundColor };
			};
			return JSON.stringify({ toggle: pick(".oa-attach-toggle"), action: pick(".oa-prompt-action"), pill: pick(".oa-model-pill") });
		});
		const rr = JSON.parse(radii);
		if (!(rr.toggle.r === "999px" && rr.action.r === "999px" && rr.pill.r === "999px")) {
			throw new Error(`composer radius check failed: ${radii}`);
		}
		console.log("  [empty] composer action radius: one family 999px ✓ (official rounded-full parity)");
		/* v0.1.122 (owner pick "tint lembut di rest" + koreksi kapsul): toggle
		   [+] rest BERTINTA (bg bukan transparan), toggle & action keduanya
		   bujur sangkar terkunci (aspect-ratio 1/1 + w===h — "capsul vertical"
		   mustahil lagi); pill tetap kapsul by design, dikecualikan */
		if (!(rr.toggle.ar === "1 / 1" && rr.action.ar === "1 / 1" && rr.toggle.sq === true && rr.action.sq === true && rr.toggle.bg !== "rgba(0, 0, 0, 0)")) {
			throw new Error(`composer rest-face/capsule check failed: ${radii}`);
		}
		console.log("  [empty] composer rest-face: [+] rest bertinta lembut ✓ · aspect-ratio 1/1 anti-kapsul ✓");

		/* v0.1.123 (owner: "hover oa-attach-anchor kok warnanya pakai warna
		   button stop"): v0.1.122 hover memakai --background-modifier-active-hover
		   yang di app.css Asli = hsla(aksen, 0.1) — tint AKSEN, bukan abu pekat
		   (reference-obsidian-app.css:2828; harness memuat css itu sehingga
		   kesalahan kekur terukur di sini). Hover NYATA diukur: harus tetap
		   NETRAL (channel seimbang), lebih pekat dari rest, dan bukan path tint */
		await page.hover("#root .oa-attach-toggle");
		/* tunggu transition background 100ms selesai — sample terlalu dini
		   membaca FRAME INTERPOLASI (oklab hampir-rest), bukan wajah final
		   (terbukti 2026-08-09: computed mid-transition = oklab white 6.67%) */
		await page.waitForTimeout(170);
		const hv = JSON.parse(await page.evaluate(() => {
			const el = document.querySelector("#root .oa-attach-toggle");
			const cs = getComputedStyle(el);
			return JSON.stringify({ bg: cs.backgroundColor, color: cs.color });
		}));
		await page.mouse.move(7, 7); /* lepas hover supaya probe berikutnya bersih */
		/* mesin modern menserialisasi color-mix sebagai color(srgb …), yang lama
		   sebagai rgba() — parser harus paham dua-duanya */
		const chn = (str) => {
			const m1 = String(str).match(/rgba?\(([^)]+)\)/);
			if (m1) return m1[1].split(",").map(Number);
			const m2 = String(str).match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
			if (m2) return [Number(m2[1]) * 255, Number(m2[2]) * 255, Number(m2[3]) * 255, m2[4] === undefined ? 1 : Number(m2[4])];
			return [];
		};
		const hvc = chn(hv.bg);
		const hvcRest = chn(rr.toggle.bg);
		const spread = hvc.length >= 3 ? Math.max(hvc[0], hvc[1], hvc[2]) - Math.min(hvc[0], hvc[1], hvc[2]) : 999;
		const hoverOk = hvc.length === 4 && spread <= 18 && hvc[3] >= 0.08 && hvc[3] > (hvcRest[3] ?? 0) + 0.02;
		if (!hoverOk) {
			throw new Error(`attach hover netral check failed (GEJALA OWNER "pakai warna button stop"): ${JSON.stringify({ hv, restBg: rr.toggle.bg })}`);
		}
		console.log("  [empty] attach hover: tint aksen ala button-stop PERGI ✓ · tangga netral color-mix 12% text-normal (channel seimbang " + spread + " · α " + hvc[3].toFixed(3) + " > rest " + (hvcRest[3] ?? 0) + ") ✓");

		/* IME composition honesty (v0.1.72, prompt-kit audit B2): Enter DURING
		   an active composition belongs to the IME — it confirms a candidate
		   and must NEVER submit half-converted text (upstream patched the
		   same class for its textarea, prompt-kit #82). Pre-fix repro: the
		   composing Enter submitted exactly like a plain one. */
		const ime = await page.evaluate(async () => {
			const ed = document.querySelector(".oa-prompt-textarea");
			const text = () => (ed.textContent ?? "").trim();
			ed.focus();
			document.execCommand("insertText", false, "ime lane text");
			await new Promise((r) => setTimeout(r, 80)); // let input state flush into handleSubmit
			ed.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
			ed.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
			await new Promise((r) => setTimeout(r, 600));
			const kept = text() !== "";
			/* back to pristine for any later probe sharing this page */
			ed.textContent = "";
			ed.dispatchEvent(new Event("input", { bubbles: true }));
			return kept;
		});
		if (!ime) throw new Error("IME lane failed: Enter during composition submitted the composer");
		console.log("  [empty] IME composition: Enter confirms candidates, never submits ✓");

		/* composer frame click-to-focus (v0.1.73, audit B3): clicking the
		   container PADDING (never a button) focuses the editor — the
		   official PromptInput container behaviour. */
		const clicked = await page.evaluate(() => {
			const ed = document.querySelector(".oa-prompt-textarea");
			const frame = document.querySelector(".oa-prompt-input");
			document.activeElement?.blur?.();
			frame.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
			return document.activeElement === ed;
		});
		if (!clicked) throw new Error("frame click-focus lane failed: padding click did not focus the composer");
		console.log("  [empty] composer frame click focuses the editor ✓");

		/* editor context-menu bridge (candidate ③, v0.1.75): the api ChatApp
		   registers on the sink is the meat behind main.ts's editor-menu glue
		   (Obsidian-side, guarded statically in smoke). Drive the sink
		   directly: attach lands an honestly-labelled chip, Ask prefills a
		   "> " blockquote with the composer focused, skill arms through the
		   single-source arm path, and a repeat attach dedupes BY NAME. */
		const ctx = await page.evaluate(async () => {
			const sink = window.__oaChatApiSink;
			const P = { path: "Notes/ideo.md", basename: "ideo", fromLine: 12, toLine: 14, text: "kucing oren itu setia" };
			const chipNames = () => [...document.querySelectorAll(".oa-attach-chip")].map((c) => c.textContent ?? "");
			sink.current.attachSelection(P);
			await new Promise((r) => setTimeout(r, 350));
			const chipOk = chipNames().some((t) => t.includes("Notes/ideo.md L12-14"));
			sink.current.quoteSelectionForAsk({ path: "Notes/ideo.md", basename: "ideo", fromLine: 7, toLine: 7, text: "satu baris" });
			await new Promise((r) => setTimeout(r, 350));
			const ta = document.querySelector(".oa-prompt-textarea");
			const quoteOk = (ta.textContent ?? "").includes("> satu baris");
			const focusOk = document.activeElement === ta;
			sink.current.runSkillOnSelection("alpha", P);
			await new Promise((r) => setTimeout(r, 600));
			const rootText = document.getElementById("root").textContent ?? "";
			const armOk = rootText.includes("alpha") && rootText.includes("armed");
			const dedupeOk = chipNames().filter((t) => t.includes("Notes/ideo.md L12-14")).length === 1;
			/* v0.1.76 custom snippet action: lead text first, the quoted
			   selection appended BELOW it (caret-at-end flow), focus kept */
			sink.current.runSnippetOnSelection("Translate ke Inggris:", { path: "Notes/ideo.md", basename: "ideo", fromLine: 7, toLine: 7, text: "satu baris" });
			await new Promise((r) => setTimeout(r, 350));
			const ta2 = ta.textContent ?? "";
			const snipOk =
				ta2.includes("Translate ke Inggris:") &&
				ta2.split("> satu baris").length - 1 === 2 &&
				ta2.lastIndexOf("Translate ke Inggris:") > ta2.indexOf("> satu baris") &&
				document.activeElement === ta;
			return JSON.stringify({ chipOk, quoteOk, focusOk, armOk, dedupeOk, snipOk, chips: chipNames() });
		});
		const cr = JSON.parse(ctx);
		if (!(cr.chipOk && cr.quoteOk && cr.focusOk && cr.armOk && cr.dedupeOk && cr.snipOk)) {
			throw new Error(`editor bridge lane failed: ${ctx}`);
		}
		console.log("  [empty] editor bridge: chip path+L12-14 ✓ · ask blockquote+focus ✓ · skill arm notice ✓ · addFiles dedupe ✓ · snippet lead+quote ✓");

		/* v0.1.127 (owner ×3: "ctrl enter tidak berfungsi" + preferensi bawaan
		   Shift+Enter): chord kirim NYATA di DUA posisi toggle, di-drive
		   KeyboardEvent scuba — React synthetic menangkap event buatan karena
		   ia berbubel dari target. Fase 1 = bawaan BARU (toggle OFF): Enter =
		   baris baru yang hidup sampai ke WIRE, Shift+Enter = kirim,
		   Ctrl+Enter = kirim. Fase 2 = toggle ON (skenario "keys"): Enter =
		   kirim, Shift+Enter = baris baru, Ctrl+Enter tetap kirim —
		   keluhan "Ctrl+Enter mati" musnah di dua mode. Satu fungsi men-drive
		   dua halaman supaya keypad-nya byte-identical. */
		const driveKeys = async (pg, mode) => {
			/* keyboard ASLI (isTrusted) — input pipeline CDP dispatches
			   keydown+textInput persis ketikan manusia; synthetic
			   KeyboardEvent tidak dipakai supaya saksi tak pernah meragukan
			   pengiriman event ke handler React. Konten DIVERIFIKASI dengan
			   memindai seluruh wire (bukan at(-1)) karena request side-task
			   (title generation) ikut terekam di arus yang sama. */
			const read = () =>
				pg.evaluate(() => {
					const ed = document.querySelector(".oa-prompt-textarea");
					const reqs = window.__oaRequests ?? [];
					const sel = window.getSelection();
					return {
						n: reqs.length,
						placeholder: ed?.getAttribute("data-placeholder") ?? "",
						edText: (ed?.textContent ?? "").slice(-48),
						html: (ed?.innerHTML ?? "").slice(-120),
						anchor: sel?.anchorNode ? `${sel.anchorNode.nodeName}#${sel.anchorOffset}` : "none",
						focused: document.activeElement === ed,
					};
				});
			const findUser = (snippet) =>
				pg.evaluate(
					(snippet) =>
						(window.__oaRequests ?? []).some((r) =>
							r.some((m) => m.role === "user" && (m.content ?? "").includes(snippet))
						),
					snippet
				);
			const settle = async () => {
				await pg.waitForTimeout(450);
				for (let i = 0; i < 40; i++) {
					const idle = await pg.evaluate(
						() => !document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")
					);
					if (idle) return;
					await pg.waitForTimeout(150);
				}
			};
			const off = mode === "off";
			const ed = pg.locator(".oa-prompt-textarea");
			await ed.focus();
			await pg.keyboard.press("Control+A");
			await pg.keyboard.press("Backspace"); /* composer bersih dulu — dua halaman simetris */
			await pg.keyboard.type("baris satu");
			const before = await read();
			await pg.keyboard.press(off ? "Enter" : "Shift+Enter"); /* chord BARIS BARU (native) menurut mode */
			await pg.waitForTimeout(170);
			const afterNl = await read();
			await pg.keyboard.type("baris dua");
			await pg.waitForTimeout(150);
			const mid = await read();
			mid.afterNl = afterNl;
			await pg.keyboard.press(off ? "Shift+Enter" : "Enter"); /* chord KIRIM menurut mode */
			await settle();
			const after1 = await read();
			const wireSatuDua = await findUser("baris satu\nbaris dua");
			await ed.focus();
			await pg.keyboard.type("kirim pakai ctrl");
			await pg.keyboard.press("Control+Enter"); /* Ctrl+Enter = chord kirim netral, dua mode */
			await settle();
			const after2 = await read();
			const wireCtrl = await findUser("kirim pakai ctrl");
			return {
				placeholder: before.placeholder,
				newlineSentNothing: mid.n === before.n,
				sendChordSent: after1.n > before.n && wireSatuDua,
				ctrlEnterSent: after2.n > after1.n && wireCtrl,
				diag: { before, mid, n1: after1.n, n2: after2.n, wireSatuDua, wireCtrl },
			};
		};
		const kOff = await driveKeys(page, "off");
		const page2 = await browser.newPage({ viewport: { width: 470, height: FRAME_HEIGHT + 40 }, colorScheme: "dark" });
		let kOn = null;
		try {
			await page2.setContent(
				shell(bundleText.replace("window.location.search", JSON.stringify("?s=keys")), refCss, pluginCss)
			);
			await page2.waitForFunction(() => window.__oaReady === true, null, { timeout: 20000 });
			kOn = await driveKeys(page2, "on");
		} finally {
			await page2.close();
		}
		const chordOk =
			kOff.newlineSentNothing === true &&
			kOff.sendChordSent === true &&
			kOff.ctrlEnterSent === true &&
			kOff.placeholder.includes("(Shift+Enter to send)") &&
			kOn.newlineSentNothing === true &&
			kOn.sendChordSent === true &&
			kOn.ctrlEnterSent === true &&
			kOn.placeholder.includes("(/ for commands)") &&
			!kOn.placeholder.includes("Shift+Enter");
		if (!chordOk) throw new Error(`composer send-chord check failed (v0.1.127): ${JSON.stringify({ kOff, kOn })}`);
		console.log(
			"  [empty] send-chord: bawaan Shift+Enter=kirim ✓ · Enter=baris baru sampai WIRE ✓ · Ctrl+Enter=kirim di dua mode ✓ · placeholder jujur per toggle ✓"
		);
	}
	/* Disk-upload honesty check (owner report 2026-07-21: "cannot upload
	   files via the file browser"): in the attach scenario (menu already
	   open) clicking "File browser…" must (1) open a native file chooser
	   and (2) a picked file must become an .oa-attach-chip — vanishing or
	   a silent rejection both fail loudly here. */
	if (s === "attach") {
		const row = page.locator(".oa-attach-item", { hasText: "File browser" });
		if ((await row.count()) === 0) throw new Error("attach check: 'File browser…' row not rendered");
		if (await row.isDisabled()) throw new Error("attach check: 'File browser…' row disabled (browse hook context broken)");
		let chooser;
		try {
			[chooser] = await Promise.all([
				page.waitForEvent("filechooser", { timeout: 4000 }),
				row.click(),
			]);
		} catch {
			throw new Error("attach check: clicking 'File browser…' opened NO file chooser");
		}
		await chooser.setFiles({
			name: "meeting.md",
			mimeType: "text/markdown",
			buffer: Buffer.from("# Meeting\nDiscuss the agent loop."),
		});
		await page.waitForTimeout(400);
		const chips = await page.locator(".oa-attach-chip.is-file").count();
		if (chips !== 1) {
			throw new Error("attach check: picked file did not attach (chips=" + chips + ")");
		}
		/* same check, more rounds (owner reports 2026-07-21/22): disk image via
		   the vision path, a REAL pdf via local text extraction (owner's actual
		   use case — pdfjs fake-worker must succeed), still-unsupported Office
		   files rejected with a clear notice, and the 1 MB text cap. */
		const pickWith = async (file, settleMs = 400) => {
			await page.locator(".oa-attach-anchor > .oa-attach-toggle").click();
			await page.waitForTimeout(120);
			const r = page.locator(".oa-attach-item", { hasText: "File browser" });
			const [c] = await Promise.all([page.waitForEvent("filechooser", { timeout: 4000 }), r.click()]);
			await c.setFiles(file);
			await page.waitForTimeout(settleMs);
		};
		const imChips0 = await page.locator(".oa-attach-chip.is-image").count();
		await pickWith({ name: "shot.png", mimeType: "image/png", buffer: Buffer.alloc(2048, 7) });
		if (await page.locator(".oa-attach-chip.is-image").count() !== imChips0 + 1) {
			throw new Error("attach check: picked image did not attach as image chip (vision path broken)");
		}
		const fChips0 = await page.locator(".oa-attach-chip.is-file").count();
		await pickWith({ name: "slides.pdf", mimeType: "application/pdf", buffer: makeTinyPdf("Hello PDF world") }, 3000);
		if (await page.locator(".oa-attach-chip.is-file").count() !== fChips0 + 1) {
			const dbg = await page.evaluate(() => JSON.stringify({ notices: window.__oaNotices ?? [] }));
			throw new Error(`attach check: pdf did not attach via local text extraction — ${dbg} · console-tail: ${logs.slice(-6).join(" | ")}`);
		}
		await pickWith({ name: "letter.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.alloc(4096, 5) });
		const n1 = await page.evaluate(() => (window.__oaNotices ?? []).at(-1) ?? "");
		if (!/unsupported type/.test(n1)) throw new Error(`attach check: docx should reject with 'unsupported type', got: ${n1}`);
		await pickWith({ name: "huge.md", mimeType: "text/markdown", buffer: Buffer.alloc(1536 * 1024, 97) });
		const n2 = await page.evaluate(() => (window.__oaNotices ?? []).at(-1) ?? "");
		if (!/over the 1 MB text-file limit/.test(n2)) throw new Error(`attach check: 1.5 MB text should hit the measured cap, got: ${n2}`);
		const fin = { f: await page.locator(".oa-attach-chip.is-file").count(), i: await page.locator(".oa-attach-chip.is-image").count() };
		if (fin.f !== 2 || fin.i !== 1) {
			throw new Error(`attach check: expected 2 text/pdf chips + 1 image chip (rejects must add none), got ${JSON.stringify(fin)}`);
		}
		await page.locator("#sim-frame").screenshot({ path: resolve(here, "shots", "attach-after.png") });
		console.log("  [attach] file browser check: text chip ✓ · image vision ✓ · PDF extraction ✓ · measured rejections (docx/oversize) ✓");
	}
	/* Sent-message attachment block (owner ask 2026-07-22): after Send, the
	   composer chips clear, but the user bubble must KEEP the attachment
	   chips so history shows what context the model received. Driver attaches
	   via the native chooser, clicks Send, waits out the run, then re-captures
	   the frame so the preview shows the final bubble. */
	if (s === "attachsent") {
		await page.locator(".oa-attach-anchor > .oa-attach-toggle").click();
		await page.waitForTimeout(120);
		const item = page.locator(".oa-attach-item", { hasText: "File browser" });
		const [c] = await Promise.all([page.waitForEvent("filechooser", { timeout: 4000 }), item.click()]);
		await c.setFiles({
			name: "meeting.md",
			mimeType: "text/markdown",
			buffer: Buffer.from("# Meeting\nAgent loop recap."),
		});
		await page.waitForTimeout(400);
		if ((await page.locator(".oa-attach-chip.is-file").count()) !== 1) {
			throw new Error("attachsent check: composer chip missing before send");
		}
		await page.locator(".oa-prompt-action-primary").click();
		for (let i = 0; i < 60; i++) {
			await page.waitForTimeout(150);
			if (!(await page.$(".oa-thinking-bar"))) break;
		}
		await page.waitForTimeout(400);
		const sentChips = await page.locator(".oa-msg-user .oa-attach-chip").count();
		const body = await page.locator(".oa-msg-user").first().textContent();
		if (sentChips !== 1 || !body?.includes("meeting.md")) {
			throw new Error(
				`attachsent check: sent bubble lost its attachment block (chips=${sentChips}) · console-tail: ${logs.slice(-6).join(" | ")}`
			);
		}
		frames[s] = await page.$eval("#root", (el) => el.innerHTML);
		if (shots) {
			/* bubble proof needs the scroll at the TOP (the run pinned it bottom) */
			await page.evaluate(() => {
				const el = document.querySelector(".oa-chat-scroll");
				if (el) el.scrollTop = 0;
			});
			await page.waitForTimeout(120);
			await page.locator("#sim-frame").screenshot({ path: resolve(here, "shots", `${s}.png`) });
		}
		console.log("  [attachsent] chip stays on the sent bubble ✓ (history shows uploaded files)");
	}
	await page.close();
		}
	} finally {
		await browser.close();
	}
	writeFileSync(resolve(here, "frames.json"), JSON.stringify(frames));
	if (errors.length) console.warn("real-preview warnings:", errors.join("; "));
	return frames;
}

if (process.argv[1] && process.argv[1].endsWith("build.mjs")) {
	buildRealFrames()
		.then((frames) => {
			console.log(`real-preview frames: ${Object.keys(frames).join(", ")}`);
			for (const [k, v] of Object.entries(frames)) console.log(`  ${k}: ${v.length} chars`);
		})
		.catch((e) => {
			console.error("real-preview failed:", e.message ?? e);
			process.exit(1);
		});
}
