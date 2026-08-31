/**
 * Settings real-preview builder — renders the REAL OpenAgentSettingTab
 * (same src tree that ships in main.js) inside headless Chromium with a
 * canned populated plugin, then captures one screenshot per settings
 * section and runs DOM/keyboard audit probes:
 *
 *   test/real-preview/shots/settings-<section>.png   → pixel evidence
 *   test/real-preview/settings-audit-probes.json     → probe results (TRACKED witness;
 *                                                       rewrite policy lives in
 *                                                       planSettingsWitnessUpdate — a release
 *                                                       run, OA_RELEASE_WITNESS=readonly,
 *                                                       never touches it)
 *   test/real-preview/out/settings-audit-probes.json → ignored timestamped sidecar of every run
 *
 * Graduated 2026-08-02 (v0.1.53): now a release step (after the chat
 * preview), and ANY red probe fails the release — the audit-phase "record
 * only" era is over. Run standalone: node test/real-preview/build-settings.mjs
 */

import { chromium } from "playwright";
import esbuild from "esbuild";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { planSettingsWitnessUpdate } from "../../scripts/release-assets.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");

/* same self-healing launch as build.mjs — the sandbox wipes the browser
   cache and OS libs between sessions */
async function launchBrowser() {
	try {
		return await chromium.launch();
	} catch (e) {
		if (!/Executable doesn't exist|error while loading shared libraries/i.test(String(e?.message ?? e))) throw e;
		console.warn("settings-preview: chromium unusable — installing headless shell + system deps, one retry…");
		const r = spawnSync("npx", ["playwright", "install", "--with-deps", "chromium-headless-shell"], {
			cwd: root,
			stdio: "inherit",
		});
		if (r.status !== 0) throw e;
		return await chromium.launch();
	}
}

/* MANUAL SYNC with src/settingsTab.ts SECTIONS (duplicate by design of
   the harness — keep positions identical). Empty placeholder tabs stay
   hidden until they contain actionable settings. */
const SECTIONS = ["general", "providers", "model", "workspace", "safety", "agent", "appearance", "command", "profiles", "capabilities", "memory", "notifications", "automations", "advanced", "about"];

async function bundle() {
	const out = resolve(here, "out", "settings-sim.js");
	mkdirSync(dirname(out), { recursive: true });
	await esbuild.build({
		entryPoints: [resolve(here, "settings-entry.tsx")],
		bundle: true,
		format: "iife",
		platform: "browser",
		target: "chrome110",
		jsx: "automatic",
		outfile: out,
		alias: { obsidian: resolve(here, "obsidian-shim.ts") },
		external: ["canvas"],
		define: { "process.env.NODE_ENV": '"production"' },
		logLevel: "silent",
	});
	return out;
}

function shell(bundleText, refCss, pluginCss, sec) {
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="oa-sec" content="${sec}">
<style>${refCss}</style>
<style>${pluginCss}</style>
<style>
	html, body { margin: 0; background: var(--background-primary, #1e1e1e); }
	/* the settings modal's content pane in the real app, at a width where
	   one-line setting rows are the norm */
	#sim-frame { width: 700px; margin: 0; border: 1px solid var(--background-modifier-border, #333);
		background: var(--background-primary, #1e1e1e); }
</style>
</head>
<body class="theme-dark">
<div id="sim-frame"><div id="root"></div></div>
<script>${bundleText.replace(/<\/script>/g, "<\\/script>")}</script>
</body>
</html>`;
}

async function openPage(browser, html, sec) {
	const page = await browser.newPage({ viewport: { width: 760, height: 820 }, colorScheme: "dark" });
	const logs = [];
	page.on("console", (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
	page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`));
	await page.setContent(html);
	await page.waitForFunction(() => window.__oaReady === true, null, { timeout: 15000 }).catch(() => {
		logs.push("[harness] __oaReady timeout");
	});
	await page.waitForTimeout(200);
	return { page, logs };
}

async function main() {
	const bundleFile = await bundle();
	const bundleText = readFileSync(bundleFile, "utf8");
	const refCss = readFileSync(resolve(root, "test", "reference-obsidian-app.css"), "utf8");
	const pluginCss = readFileSync(resolve(root, "styles.css"), "utf8");
	mkdirSync(resolve(here, "shots"), { recursive: true });
	/* retired sections leave stale shots behind (settings-sessions.png after the
	   2026-08-03 merge) — drop any settings shot this SECTIONS list no longer
	   owns, so artifact evidence can never drift from reality */
	{
		const keep = new Set([...SECTIONS.map((x) => `settings-${x}.png`), "settings-hub-taphint.png"]);
		for (const f of readdirSync(resolve(here, "shots"))) {
			if (/^settings-.*\.png$/.test(f) && !keep.has(f)) {
				rmSync(resolve(here, "shots", f));
				console.log(`  [hygiene] removed stale shot ${f}`);
			}
		}
	}

	const browser = await launchBrowser();
	const probes = {};
	try {
		/* ---- pass 1: one clean screenshot per section ---- */
		for (const sec of SECTIONS) {
			const html = shell(bundleText, refCss, pluginCss, sec);
			const { page, logs } = await openPage(browser, html, sec);
			/* EVIDENCE POLICY (harness-only, 2026-07-22): app.css pins the BODY
			   to height:100% + overflow:clip (the real app is a fixed workspace
			   shell; settings content scrolls inside .vertical-tab-content).
			   For FULL-SECTION evidence shots we simply give the viewport the
			   content's full height — no style overrides (they break the app's
			   % chain and blank the paint). Scroll-cut pixels in an old harness
			   shot were an artifact, never a production bug. */
			const fullH = await page.evaluate(() => document.body.scrollHeight);
			if (fullH > 820) {
				await page.setViewportSize({ width: 760, height: Math.min(fullH + 40, 12000) });
				await page.waitForTimeout(150);
			}
			const errs = logs.filter((l) => l.startsWith("[pageerror]") || l.startsWith("[harness]"));
			if (errs.length) console.warn(`  [${sec}] page errors:`, errs.join(" | "));
			await page.locator("#sim-frame").screenshot({ path: resolve(here, "shots", `settings-${sec}.png`) });
			const counts = await page.evaluate(() => ({
				settingItems: document.querySelectorAll(".setting-item").length,
				buttons: document.querySelectorAll("button").length,
			}));
			console.log(`  [${sec}] shot ✓ (${counts.settingItems} setting rows, ${counts.buttons} buttons)`);
			await page.close();
		}

		/* ---- pass 2: audit probes ---- */

		// F1 — custom-model field (audit S1, fixed 2026-07-23): typing must
		// stay local (no re-render, no data writes); commit happens exactly
		// once, on Enter/blur. A regression flips `fixed` back to false.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "model"), "model");
			/* v0.1.14: the catalog is the ACTIVE provider's own `models` list */
			const activeCatalog = `(() => { const s = window.__oaSettings; const p = s.providers.find((x) => x.id === s.activeProviderId); return (p && Array.isArray(p.models) ? p.models : []).slice(); })()`;
			const favBefore = await page.evaluate(activeCatalog);
			const field = page.locator('input[aria-label="Custom model id"]');
			if ((await field.count()) === 0) {
				probes.F1 = { status: "absent-field" };
			} else {
				await field.click();
				await page.keyboard.type("gpt-4o", { delay: 60 }).catch(() => {});
				await page.waitForTimeout(150);
				const during = await page.evaluate(`(() => { const s = window.__oaSettings; return ({
					favorites: ${activeCatalog},
					model: s.model,
					focusedLabel: document.activeElement instanceof HTMLElement ? document.activeElement.getAttribute("aria-label") : null,
				}); })()`);
				await page.keyboard.press("Enter");
				await page.waitForTimeout(250);
				const after = await page.evaluate(`(() => { const s = window.__oaSettings; return ({
					favorites: ${activeCatalog},
					model: s.model,
				}); })()`);
				const typingIsStable =
					during.favorites.length === favBefore.length && during.focusedLabel === "Custom model id";
				const noPartialPollution = !after.favorites.some((m) => m !== "gpt-4o" && "gpt-4o".startsWith(m));
				const committedOnce = after.model === "gpt-4o" && after.favorites.filter((m) => m === "gpt-4o").length === 1;
				probes.F1 = {
					fixed: typingIsStable && noPartialPollution && committedOnce,
					typingIsStable,
					noPartialPollution,
					committedOnce,
					modelAfter: after.model,
					favoritesAfter: after.favorites,
					detail: "typed 'gpt-4o' char-by-char then Enter — typing must not re-render, commit exactly once",
				};
			}
			await page.close();
		}

		// F2 — providers: disclosure heads must be real buttons with aria-expanded
		// (audit S2, fixed 2026-07-23). A regression flips `fixed` back to false.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "providers"), "providers");
			probes.F2 = await page.evaluate(() => {
				const heads = [...document.querySelectorAll(".oa-provider-group-label.oa-disclosure")];
				const asButtons = heads.filter((el) => el.tagName === "BUTTON").length;
				const withAria = heads.filter((el) => el.hasAttribute("aria-expanded")).length;
				return {
					fixed: heads.length > 0 && asButtons === heads.length && withAria === heads.length,
					disclosureCount: heads.length,
					asButtons,
					withAriaExpanded: withAria,
				};
			});
			await page.close();
		}

		// F18 — general: Backup & Restore vs Danger Zone (owner directive
		// 2026-08-02 v0.1.50; pixel lane graduated 2026-08-02 v0.1.53): the
		// five data rows must render under the right headings IN DOM ORDER,
		// and the Danger Zone title must carry the hazard tint (measured
		// computed color vs a normal subsection title — not source strings).
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");
			probes.F18 = await page.evaluate(() => {
				const content = document.querySelector(".oa-settings-content");
				const els = content ? [...content.querySelectorAll(".oa-subsection, .setting-item")] : [];
				const seq = els.map((el) =>
					el.classList.contains("oa-subsection")
						? "H:" + (el.querySelector(".oa-subsection-title")?.textContent.trim() ?? "?")
						: "R:" + (el.querySelector(".setting-item-name")?.textContent.trim() ?? "?")
				);
				const backupH = seq.indexOf("H:Backup & Restore");
				const dangerH = seq.indexOf("H:Danger Zone");
				const between = backupH >= 0 && dangerH > backupH ? seq.slice(backupH + 1, dangerH).filter((x) => x.startsWith("R:")) : [];
				const after = dangerH >= 0 ? seq.slice(dangerH + 1).filter((x) => x.startsWith("R:")) : [];
				const normalTitle = document.querySelector(".oa-subsection:not(.oa-danger-zone) .oa-subsection-title");
				const dangerTitle = document.querySelector(".oa-subsection.oa-danger-zone .oa-subsection-title");
				const tint = !!(normalTitle && dangerTitle) && getComputedStyle(normalTitle).color !== getComputedStyle(dangerTitle).color;
				return {
					fixed:
						backupH >= 0 && dangerH > backupH &&
						between.length === 3 && after.length === 2 &&
						between[0] === "R:Include API keys in exports" &&
						between[1] === "R:Export settings" &&
						between[2] === "R:Import settings" &&
						after[0] === "R:Reset settings" &&
						after[1] === "R:Reset everything" &&
						tint,
					backupH,
					dangerH,
					between,
					after,
					tint,
				};
			});
			await page.close();
		}

		// F3 — profiles: every icon-only button must carry an accessible name
		// (audit S2, fixed 2026-07-23). A regression flips `fixed` back to false.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "profiles"), "profiles");
			probes.F3 = await page.evaluate(() => {
				const bad = [...document.querySelectorAll("button[title]:not([aria-label])")].filter((b) =>
					b.querySelector("svg")
				);
				const named = [...document.querySelectorAll(".oa-profile-item button[aria-label]")].map((b) =>
					b.getAttribute("aria-label")
				);
				return {
					fixed: bad.length === 0,
					accessibleNameMissing: bad.length,
					tooltips: bad.map((b) => b.getAttribute("title")),
					namedSample: named.slice(0, 6),
				};
			});
			await page.close();
		}

		// F4 — tablist: arrow-key navigation between tabs (audit S3-4, fixed
		// 2026-07-23). ArrowRight must move focus AND activate the next tab,
		// Home jumps back to the first tab, and inactive tabs carry
		// tabindex=-1 (roving). A regression flips `fixed` back to false.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");
			const first = page.locator(".oa-settings-tab").first();
			await first.focus();
			const focusedBefore = await page.evaluate(() => document.activeElement?.textContent?.trim());
			await page.keyboard.press("ArrowRight");
			await page.waitForTimeout(60);
			const focusedAfter = await page.evaluate(() => document.activeElement?.textContent?.trim());
			const activeAfter = await page.evaluate(() => document.querySelector(".oa-settings-tab.is-active")?.textContent?.trim());
			await page.keyboard.press("Home");
			await page.waitForTimeout(60);
			const focusedAfterHome = await page.evaluate(() => document.activeElement?.textContent?.trim());
			const roving = await page.evaluate(() => {
				const tabs = [...document.querySelectorAll(".oa-settings-tab")];
				return {
					activeTabIndexCount: tabs.filter((t) => t.getAttribute("tabindex") === "0").length,
					inactiveMinusOne: tabs.filter((t) => !t.classList.contains("is-active")).every((t) => t.getAttribute("tabindex") === "-1"),
				};
			});
			probes.F4 = {
				fixed:
					focusedAfter !== focusedBefore &&
					activeAfter === focusedAfter &&
					focusedAfterHome === focusedBefore &&
					roving.activeTabIndexCount === 1 &&
					roving.inactiveMinusOne,
				focusedBefore,
				focusedAfter,
				activeAfter,
				focusedAfterHome,
				...roving,
			};
			await page.close();
		}

		// F5 — providers: test result element rendered BELOW its row and hidden
		// while empty (audit S3-5, fixed 2026-07-23). A regression flips
		// `fixed` back to false.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "providers"), "providers");
			probes.F5 = await page.evaluate(() => {
				const res = document.querySelector(".oa-test-result");
				if (!res) return { present: false };
				const testRow = [...document.querySelectorAll(".setting-item")].find((el) =>
					el.textContent.includes("Test connection")
				);
				if (!testRow) return { present: true, rowFound: false };
				const resultBeforeRow = !!(res.compareDocumentPosition(testRow) & Node.DOCUMENT_POSITION_FOLLOWING);
				const emptyHidden = getComputedStyle(res).display === "none";
				return { present: true, fixed: !resultBeforeRow && emptyHidden, resultBeforeRow, emptyHidden };
			});
			await page.close();
		}

		// F6 — header build-stamp tooltip language: English-only contract
		// (audit S3-6, fixed 2026-07-23). A regression flips `fixed` back to false.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");
			probes.F6 = await page.evaluate(() => {
				const title = document.querySelector(".oa-settings-header-version")?.getAttribute("title") ?? "";
				const looksIndonesian = /basi|dipakai|tidak|untuk|menjalankan/i.test(title);
				return { title, fixed: !looksIndonesian && /proves which build is running/.test(title), looksIndonesian };
			});
			await page.close();
		}

		// F7 — capabilities: mcp.json import label precedes its textarea
		// (audit S3-7, fixed 2026-07-23). A regression flips `fixed` back to false.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "capabilities"), "capabilities");
			probes.F7 = await page.evaluate(() => {
				const imp = document.querySelector(".oa-mcp-import");
				if (!imp) return { present: false };
				const textareaBeforeLabel = imp.firstElementChild?.tagName === "TEXTAREA";
				const labelFirst = imp.firstElementChild?.classList.contains("setting-item") ?? false;
				return { present: true, fixed: !textareaBeforeLabel && labelFirst, textareaBeforeLabel, labelFirst };
			});
			await page.close();
		}

		// F9 — browse hub: the community chip's remove control must stay
		// chip-sized (owner 2026-07-23). The real app styles every bare
		// <button> with input-height and, via :not(.clickable-icon), a
		// background + box-shadow — measured here against a trusted sibling
		// chip because the default taps never render a ×. A regression flips
		// `fixed` back to false.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "capabilities"), "capabilities");
			probes.F9 = await page.evaluate(() => {
				const chip = document.querySelector(".oa-hub-chip.oa-trust-community");
				if (!chip) return { present: false };
				const x = chip.querySelector(".oa-hub-chip-x");
				if (!x) return { present: true, xFound: false };
				const trusted = document.querySelector(".oa-hub-chip.oa-trust-trusted");
				const cs = getComputedStyle(x);
				const chipH = chip.getBoundingClientRect().height;
				const xH = x.getBoundingClientRect().height;
				const tH = trusted ? trusted.getBoundingClientRect().height : chipH;
				const transparentBg = cs.backgroundColor === "rgba(0, 0, 0, 0)" || cs.backgroundColor === "transparent";
				const noShadow = cs.boxShadow === "none";
				return {
					present: true,
					fixed: transparentBg && noShadow && Math.abs(chipH - tH) <= 2 && xH <= tH,
					chipHeight: Math.round(chipH),
					xHeight: Math.round(xH),
					trustedChipHeight: Math.round(tH),
					transparentBg,
					noShadow,
				};
			});
			await page.close();
		}

		// F10 — hub search box doubles as the add-tap input (owner 2026-07-23,
		// Hermes desktop parity): typing owner/repo shows the add hint, plain
		// queries don't; Enter adds the tap AND it loads immediately (chip
		// gains a count — proves the hubLoaded no-op fix: the old Add-tap row
		// silently did nothing until a plugin reload). A regression flips
		// `fixed` back to false.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "capabilities"), "capabilities");
			const search = page.locator(".oa-hub-search");
			await search.fill("pdf");
			await page.waitForTimeout(420);
			const hintForQuery = await page.evaluate(() => document.querySelector(".oa-hub-tap-hint-btn") !== null);
			await search.fill("newowner/new-skills");
			await page.waitForTimeout(420);
			const hintText = await page.evaluate(() => document.querySelector(".oa-hub-tap-hint-btn")?.textContent ?? null);
			const chipsBefore = await page.evaluate(() => document.querySelectorAll(".oa-hub-chip").length);
			// evidence shot: the hint state (repo typed, hint offered) —
			// SAME trick as the shot pass (lesson 19): raise the viewport to
			// full height first or the paint below the fold is eaten
			if (hintText !== null) {
				const fullH = await page.evaluate(() => document.body.scrollHeight + 40);
				await page.setViewportSize({ width: 700, height: Math.min(fullH, 12000) });
				await page.waitForTimeout(80);
				await page.locator(".oa-hub").screenshot({ path: resolve(here, "shots", "settings-hub-taphint.png") });
			}
			await search.press("Enter");
			await page.waitForTimeout(500);
			probes.F10 = await page.evaluate(
				({ hintForQuery, hintText, chipsBefore }) => {
					const chips = [...document.querySelectorAll(".oa-hub-chip")];
					const newChip = chips.find((c) => c.textContent.includes("newowner/new-skills")) ?? null;
					const plugin = window.__oaPlugin;
					return {
						fixed:
							!hintForQuery &&
							hintText !== null &&
							hintText.includes("newowner/new-skills") &&
							!!newChip &&
							newChip.classList.contains("oa-trust-community") &&
							newChip.querySelector(".oa-hub-chip-x") !== null &&
							(newChip.querySelector(".oa-hub-chip-count")?.textContent ?? "") === "1" &&
							chips.length === chipsBefore + 1 &&
							document.querySelector(".oa-hub-tap-hint-btn") === null &&
							document.querySelector(".oa-hub-search").value === "" &&
							!!plugin &&
							plugin.settings.hubTaps.includes("newowner/new-skills"),
						hintForQuery,
						hintText,
						chipsBefore,
						chipsAfter: chips.length,
						chipCount: newChip?.querySelector(".oa-hub-chip-count")?.textContent ?? null,
						hubTaps: plugin ? [...plugin.settings.hubTaps] : null,
					};
				},
				{ hintForQuery, hintText, chipsBefore }
			);
			await page.close();
		}

		// F11 — Providers IA: this tab configures connections; it does not
		// choose the provider used by chat. The current route is visible as
		// context, row clicks only open an editor, and the routing CTA points
		// to Model (or Profiles when the active profile overrides it).
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "providers"), "providers");
			const before = await page.evaluate(() => window.__oaPlugin.settings.activeProviderId);
			await page.locator(".oa-provider-row").nth(2).click(); // configure Ollama
			await page.waitForTimeout(180);
			const mid = await page.evaluate(() => {
				const plugin = window.__oaPlugin;
				const configureHead = [...document.querySelectorAll(".oa-subsection-title")].find((el) =>
					(el.textContent ?? "").startsWith("Configure ")
				)?.textContent ?? null;
				const route = document.querySelector(".oa-provider-route");
				const buttons = [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());
				/* 2026-08-30: the route action must sit at the bottom-right, after
				   the description (owner placement) — measured, not eyeballed
				   (Lesson 44 family). */
				const descEl = route?.querySelector(".oa-provider-route-desc");
				const btnEl = route?.querySelector(".oa-mini-btn");
				const dRect = descEl?.getBoundingClientRect();
				const bRect = btnEl?.getBoundingClientRect();
				const rRect = route?.getBoundingClientRect();
				const routeGeom = dRect && bRect && rRect ? {
					btnBelowDesc: bRect.top >= dRect.bottom - 2,
					btnInsideCard: bRect.top > rRect.top && bRect.bottom <= rRect.bottom + 1,
					rightPadDelta: Math.round((rRect.right - bRect.right) * 10) / 10,
				} : null;
				const inUseRow = [...document.querySelectorAll(".oa-provider-row")].find((row) =>
					row.querySelector(".oa-provider-status.is-in-use")
				);
				return {
					active: plugin.settings.activeProviderId,
					configureHead,
					sectionDesc: document.querySelector(".oa-section-desc")?.textContent ?? null,
					connectionDesc: [...document.querySelectorAll(".oa-subsection-desc")][0]?.textContent ?? null,
					routeText: route?.textContent ?? null,
					hasManagePin: buttons.includes("Manage profile pin"),
					hasSetActive: buttons.includes("Set active"),
					viewedRows: document.querySelectorAll(".oa-provider-row.is-viewed").length,
					inUseProvider: inUseRow?.querySelector(".oa-provider-name")?.textContent ?? null,
					editingField: [...document.querySelectorAll(".setting-item .setting-item-name")].map((el) => el.textContent).filter((t) => (t ?? "").includes("base URL"))[0] ?? null,
					routeGeom,
				};
			});
			await page.getByRole("button", { name: "Manage profile pin" }).click();
			await page.waitForTimeout(100);
			const routeTarget = await page.locator('.oa-settings-tab[aria-selected="true"]').textContent();

			// Without a profile pin, the same context card must identify the
			// global default and send provider+model selection to Model.
			await page.evaluate(() => {
				window.__oaPlugin.settings.activeProfileId = "default";
			});
			await page.locator(".oa-settings-tab", { hasText: "Providers" }).click();
			await page.waitForTimeout(100);
			const globalRoute = await page.locator(".oa-provider-route").textContent();
			await page.getByRole("button", { name: "Choose provider & model" }).click();
			await page.waitForTimeout(100);
			const globalRouteTarget = await page.locator('.oa-settings-tab[aria-selected="true"]').textContent();

			probes.F11 = {
				before,
				mid,
				routeTarget,
				globalRoute,
				globalRouteTarget,
				fixed:
					before === "lmstudio" &&
					mid.active === "lmstudio" && // configuring Ollama did NOT switch chat
					mid.configureHead === "Configure Ollama (local)" &&
					mid.editingField === "Ollama (local) base URL" &&
					mid.sectionDesc.includes("Choose the provider + model used by chat in the Model tab") &&
					mid.connectionDesc.includes("this never changes the provider used by chat") &&
					mid.routeText.includes("Provider used by chat") &&
					mid.routeText.includes("OpenRouter") &&
					mid.routeText.includes("Profile override") &&
					mid.routeText.includes("Global default: LM Studio (local)") &&
					mid.hasManagePin &&
					mid.routeGeom !== null &&
					mid.routeGeom.btnBelowDesc && // 2026-08-30: action after the description
					mid.routeGeom.btnInsideCard &&
					mid.routeGeom.rightPadDelta >= 6 && mid.routeGeom.rightPadDelta <= 20 && // right-aligned to the card padding
					!mid.hasSetActive && // activation control no longer competes with setup
					mid.viewedRows === 1 &&
					mid.inUseProvider === "OpenRouter" &&
					routeTarget?.trim() === "Profiles" &&
					globalRoute?.includes("LM Studio (local)") &&
					globalRoute?.includes("Global default") &&
					!globalRoute?.includes("Profile override") &&
					globalRouteTarget?.trim() === "Model",
			};
			await page.close();
		}

		// F12 — per-provider model catalogs (owner goal 2026-07-30, Hermes
		// Desktop parity): each Model-tab selector reads the catalog belonging
		// to its own provider. Atomic provider+model activation is exercised
		// by F14; empty-catalog healing remains covered by model-catalog.test.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "model"), "model");
			probes.F12 = await page.evaluate(() => {
				const opts = (label) => {
					const sel = [...document.querySelectorAll("select")].find((x) => x.getAttribute("aria-label") === label);
					return sel ? [...sel.options].map((o) => o.value) : null; // null = no SELECT (was a free-text input)
				};
				const state = window.__oaPlugin.settings;
				const result = {
					active: state.activeProviderId,
					model: state.model,
					main: opts("Model"),
					fb1: opts("Fallback 1 model"),
					fb2: opts("Fallback 2 model"),
				};
				return {
					...result,
					fixed:
						result.active === "lmstudio" &&
						result.model === "gemma-4-e4b-uncensored-hauway-qat-4b" &&
						Array.isArray(result.main) &&
						result.main.includes("gemma-4-e4b-uncensored-hauway-qat-4b") &&
						result.main.includes("qwen3-30b-a3b-instruct-2507") &&
						Array.isArray(result.fb1) &&
						result.fb1.includes("qwen3-30b-a3b-instruct-2507") &&
						Array.isArray(result.fb2) &&
						result.fb2.includes("meta-llama/llama-3.3-70b-instruct"),
				};
			});
			await page.close();
		}

		// F13 — settings info-architecture (owner directive 2026-07-30, Hermes
		// Desktop parity): nav labels are "Chat" and "Memory & Context";
		// the context knobs (Context file + Attach active note by default)
		// live under Memory & Context and nowhere else; the other tabs keep
		// their rows. A regression flips fixed back to false.
		{
			const tabLabels = `.oa-settings-tab`;
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "memory"), "memory");
			probes.F13 = await page.evaluate(
				({ tabSel }) => {
					const names = [...document.querySelectorAll(".setting-item-name")].map((el) => (el.textContent ?? "").trim());
					const nav = [...document.querySelectorAll(tabSel)].map((el) => (el.textContent ?? "").trim());
					const ctxHead = [...document.querySelectorAll(".oa-subsection-title")].some((el) => (el.textContent ?? "").trim() === "Context");
					const title = document.querySelector("h2")?.textContent ?? null;
					return {
						navHasChat: nav.includes("Chat"),
						navHasMemoryContext: nav.includes("Memory & Context"),
						navHasOldAgent: nav.includes("Agent"),
						navHasOldMemory: nav.includes("Memory"),
						title,
						ctxHead,
						hasContextFile: names.includes("Context file"),
						hasAttach: names.includes("Attach active note by default"),
						hasMemoryRows: ["Enable long-term memory", "Memory folder", "User profile", "Memory nudge interval"].every((n) =>
							names.includes(n)
						),
						names,
					};
				},
				{ tabSel: tabLabels }
			);
			await page.close();
			probes.F13.fixed =
				probes.F13.navHasChat &&
				probes.F13.navHasMemoryContext &&
				!probes.F13.navHasOldAgent &&
				!probes.F13.navHasOldMemory &&
				probes.F13.title === "Memory & Context" &&
				probes.F13.ctxHead &&
				probes.F13.hasContextFile &&
				probes.F13.hasAttach &&
				probes.F13.hasMemoryRows;
		}
		{
			// the renamed tabs' pages: Chat keeps its rows minus the moved ones
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "agent"), "agent");
			const names = await page.evaluate(
				() => [...document.querySelectorAll(".setting-item-name")].map((el) => (el.textContent ?? "").trim())
			);
			/* v0.1.77: "Prompt snippets" LEFT the Chat page for the Commands tab —
			   the probe now asserts BOTH: the four rows that stay AND the
			   absence of the relocated one (the move is the point). v0.1.151:
			   "Max tool iterations" also moved OUT of Chat → Advanced.
			   v0.1.172: the row is now GLOBAL "Personality" (Hermes
			   display.personality), no longer a per-profile overlay. */
			probes.F13.chatKeeps = {
				kept: ["Personality", "Save sessions", "Max sessions kept"].every((n) =>
					names.includes(n)
				),
				contextFileGone: !names.includes("Context file"),
				snippetsMovedToCommands: !names.includes("Prompt snippets"),
				iterationsMovedToAdvanced: !names.includes("Max tool iterations"),
				/* 2026-08-09 (v0.1.126, owner restructure): the two rows move OUT of
				   Chat — Safety tab menerima Approval mode, Workspace tab menerima
				   Workspace folder; pindah IS the point */
				approvalMovedToSafety: !names.includes("Approval mode"),
				workspaceMovedOut: !names.includes("Workspace folder"),
			};
			probes.F13.fixed =
				probes.F13.fixed && probes.F13.chatKeeps.kept && probes.F13.chatKeeps.contextFileGone && probes.F13.chatKeeps.snippetsMovedToCommands && probes.F13.chatKeeps.iterationsMovedToAdvanced && probes.F13.chatKeeps.approvalMovedToSafety && probes.F13.chatKeeps.workspaceMovedOut;
			await page.close();
		}

		/* F44 — v0.1.179 embedding model picker: a DROPDOWN (not a text input),
		   seeded from the active provider's catalog, with an "off" option and
		   the current value kept visible.
		   2026-08-24 (v0.1.152, owner "ada main model dan embedding model"): the
		   row lives in the MODEL tab now and carries its own provider dropdown,
		   so the page opened here moves with it. */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "model"), "model");
			const emb = await page.evaluate(() => {
				const row = [...document.querySelectorAll(".setting-item")].find(
					(it) => (it.querySelector(".setting-item-name")?.textContent ?? "").trim() === "Embedding model"
				);
				const sel = [...(row?.querySelectorAll("select") ?? [])].find(
					(x) => x.getAttribute("aria-label") === "Embedding model"
				);
				const provSel = [...(row?.querySelectorAll("select") ?? [])].find(
					(x) => x.getAttribute("aria-label") === "Embedding provider"
				);
				const textInput = row?.querySelector("input[type=text], input:not([type])");
				return {
					present: !!sel,
					isTextInput: !!textInput,
					value: sel?.value ?? null,
					options: sel ? [...sel.options].map((o) => o.text) : [],
					/* v0.1.152: the pair half — a provider dropdown beside the model,
					   exactly like the main model pick */
					providerPresent: !!provSel,
					providerOptions: provSel ? [...provSel.options].map((o) => o.text) : [],
					applyPresent: [...(row?.querySelectorAll("button") ?? [])].some(
						(b) => (b.textContent ?? "").trim() === "Apply"
					),
					desc: (row?.querySelector(".setting-item-description")?.textContent ?? "").trim(),
				};
			});
			await page.close();
			probes.F44embedPick = {
				fixed:
					emb.present === true &&
					emb.isTextInput === false &&
					emb.value === "" &&
					emb.options.includes("off (keyword recall only)") &&
					emb.options.includes("gemma-4-e4b-uncensored-hauway-qat-4b") &&
					emb.providerPresent === true &&
					emb.applyPresent === true &&
					emb.desc.includes("Pick a model"),
				...emb,
			};
		}

		/* F45 — v0.1.186 (owner: "compress when above / preserve recent tail
		   tak muncul"): the % sliders must render a PLAIN number (not an empty
		   box from "%" written into type=number) + a visible "%" unit label. */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "memory"), "memory");
			const pct = await page.evaluate(() => {
				const row = (name) =>
					[...document.querySelectorAll(".setting-item")].find(
						(it) => (it.querySelector(".setting-item-name")?.textContent ?? "").trim() === name
					);
				const numVal = (name) => row(name)?.querySelector('input[type="number"]')?.value ?? null;
				const unitShown = (name) => !!row(name)?.querySelector(".oa-slideinput-unit");
				const rangeVal = (name) => row(name)?.querySelector('input[type="range"]')?.value ?? null;
				/* v0.1.189 seamless: the "%" must sit INSIDE the number box (its
				   rect contained by the input's rect), not float a gap away. */
				const unitInside = (name) => {
					const num = row(name)?.querySelector('input[type="number"]');
					const unit = row(name)?.querySelector(".oa-slideinput-unit");
					if (!num || !unit) return false;
					const nr = num.getBoundingClientRect();
					const ur = unit.getBoundingClientRect();
					return (
						ur.left >= nr.left - 1 &&
						ur.right <= nr.right + 1 &&
						ur.top >= nr.top - 1 &&
						ur.bottom <= nr.bottom + 1
					);
				};
				return {
					thrNum: numVal("Compression threshold"),
					thrUnit: unitShown("Compression threshold"),
					thrUnitInside: unitInside("Compression threshold"),
					thrRange: rangeVal("Compression threshold"),
					tailNum: numVal("Compression target"),
					tailUnit: unitShown("Compression target"),
					tailUnitInside: unitInside("Compression target"),
					tailRange: rangeVal("Compression target"),
				};
			});
			await page.close();
			probes.F45pctSlider = {
				fixed:
					/* 2026-08-24: default realigned to Hermes (0.50) */
					pct.thrNum === "50" &&
					pct.thrUnit === true &&
					pct.thrUnitInside === true &&
					pct.thrRange === "50" &&
					pct.tailNum === "20" &&
					pct.tailUnit === true &&
					pct.tailUnitInside === true &&
					pct.tailRange === "20",
				...pct,
			};
		}

		/* F46 — v0.1.187 reset button: change Memory budget → re-render → the
		   ↺ button + modified-dot appear → click → value reverts to default
		   and the button disappears. Real-DOM proof of the whole loop. */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "memory"), "memory");
			const r = await page.evaluate(() => {
				const row = () =>
					[...document.querySelectorAll(".setting-item")].find(
						(it) => (it.querySelector(".setting-item-name")?.textContent ?? "").trim() === "Memory budget"
					);
				const setVal = (v) => {
					const input = row()?.querySelector('input[type="number"]');
					const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
					setter.call(input, v);
					/* Obsidian TextComponent.onChange binds to the INPUT event */
					input.dispatchEvent(new Event("input", { bubbles: true }));
				};
				/* extra buttons render as a div in the shim (button in the real
				   app) — select by aria-label, element-agnostic */
				const resetBtn = () => row()?.querySelector('[aria-label="Reset to default"]');
				const s = window.__oaPlugin.settings;
				const before = s.memoryCharLimit;
				setVal(9999);
				const afterEdit = s.memoryCharLimit;
				window.__oaTab.display(); // re-render so the dot + reset button appear
				const btnAppeared = !!resetBtn();
				const dotAppeared = !!row()?.querySelector(".oa-mod-dot");
				resetBtn()?.click();
				const afterReset = s.memoryCharLimit;
				window.__oaTab.display();
				const btnGone = !resetBtn();
				return { before, afterEdit, btnAppeared, dotAppeared, afterReset, btnGone };
			});
			await page.close();
			probes.F46resetBtn = {
				fixed:
					r.before === 4000 &&
					r.afterEdit === 9999 &&
					r.btnAppeared === true &&
					r.dotAppeared === true &&
					r.afterReset === 4000 &&
					r.btnGone === true,
				...r,
			};
		}

		/* F47 — About v0.1.190: the informational tab renders identity, license,
		   attribution and Copy diagnostics; the settings header keeps ONLY the
		   short tagline (full description moved to About); and the diagnostics
		   blob carries no secret material. */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "about"), "about");
			const about = await page.evaluate(() => {
				const names = [...document.querySelectorAll(".setting-item-name")].map((el) => (el.textContent ?? "").trim());
				const headerDesc = (document.querySelector(".oa-settings-header-desc")?.textContent ?? "").trim();
				const copyBtn = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Copy diagnostics");
				/* stub the clipboard so the real click's blob can be inspected */
				window.__oaCopied = null;
				Object.defineProperty(navigator, "clipboard", {
					configurable: true,
					value: { writeText: (t) => { window.__oaCopied = t; return Promise.resolve(); } },
				});
				copyBtn?.click();
				return { names, headerDesc, hasCopyBtn: !!copyBtn };
			});
			await page.waitForTimeout(30);
			const copied = await page.evaluate(() => window.__oaCopied);
			await page.close();
			const required = ["Version", "Requirements", "Description", "MIT License", "Hermes Agent", "Copy diagnostics"];
			const blob = copied ?? "";
			probes.F47about = {
				fixed:
					required.every((n) => about.names.includes(n)) &&
					about.headerDesc === "A self-improving AI agent for your vault." &&
					!about.headerDesc.includes("modeled after") &&
					about.hasCopyBtn === true &&
					blob.includes("Open Agent v0.1.157") &&
					blob.includes("Toolsets enabled") &&
					!blob.includes("sk-") &&
					!blob.includes("apiKey"),
				...about,
				blob,
			};
		}

		/* MCP fixture diagnosis — capture state after n8n selection without asserting yet. */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "capabilities"), "capabilities");
			await page.getByText("Install from catalog", { exact: true }).evaluate((el) => el.click());
			const n8n = page.locator(".oa-hub-row").filter({ hasText: "n8n" }).first();
			await n8n.getByText("Install", { exact: true }).evaluate((el) => el.click());
			await page.waitForTimeout(20);
			probes.F48mcpCatalogDiag = await page.evaluate(() => ({
				modalText: document.body.textContent ?? "",
				passwordInputs: document.querySelectorAll('input[type="password"]').length,
				allInputs: [...document.querySelectorAll("input")].map((i) => ({ type: i.type, placeholder: i.placeholder, autocomplete: i.autocomplete })),
			}));
			await page.close();
		}

		/* F48 — MCP catalog fixture shape: n8n must expose both declared env
		   names before we attempt secret/install behavior. */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "capabilities"), "capabilities");
			await page.getByText("Install from catalog", { exact: true }).evaluate((el) => el.click());
			const n8n = page.locator(".oa-hub-row").filter({ hasText: "n8n" }).first();
			await n8n.getByText("Install", { exact: true }).evaluate((el) => el.click());
			await page.waitForTimeout(20);
			const form = await page.locator(".oa-mcp-catalog-form").evaluate((el) => ({
				envNames: el.getAttribute("data-env-names"),
				inputs: [...el.querySelectorAll("input")].map((i) => ({ type: i.type, autocomplete: i.autocomplete, placeholder: i.placeholder })),
			}));
			const secret = page.locator('input[type="password"]');
			await secret.fill("mcp-secret-probe");
			await page.evaluate(() => { window.__oaMcpCatalogFail = true; });
			const install = page.getByText("Install", { exact: true }).last();
			await install.evaluate((el) => el.click());
			await page.waitForTimeout(30);
			const failed = await page.evaluate(() => ({ calls: window.__oaMcpCatalogInstalls ?? 0, disabled: [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Install")?.disabled ?? null, leaked: (document.body.textContent ?? "").includes("mcp-secret-probe") }));
			await page.evaluate(() => { window.__oaMcpCatalogFail = false; });
			await install.evaluate((el) => el.click());
			await page.waitForTimeout(30);
			const success = await page.evaluate(() => ({ calls: window.__oaMcpCatalogInstalls ?? 0, text: document.body.textContent ?? "" }));
			await page.close();
			probes.F48mcpCatalogShape = {
				fixed: form.envNames === "N8N_BASE_URL,N8N_API_KEY" && form.inputs.length === 2 && form.inputs.some((i) => i.type === "password" && i.autocomplete === "off") && failed.calls === 1 && failed.disabled === false && !failed.leaked && success.calls === 2 && success.text.includes('Installed “n8n”'),
				...form, failed, success,
			};
		}

		/* F33 — Notifications v0.1.142 + About v0.1.190: the shared tab/search
		   registry. Appearance sits after Chat; About (informational) closes
		   the strip and is searchable; Workspace/Safety keep their controls. */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");
			const tabs = await page.evaluate(() =>
				[...document.querySelectorAll(".oa-settings-tab")].map((el) => ({
					key: el.dataset.key,
					label: (el.textContent ?? "").trim(),
				}))
			);
			const searchSections = {};
			for (const query of ["appearance", "native notification", "completion sound", "about"]) {
				await page.fill(".oa-settings-search-input", query);
				await page.waitForTimeout(60);
				searchSections[query] = await page.locator(".oa-settings-search-result-meta").allTextContents();
			}
			await page.close();
			const keys = tabs.map((t) => t.key);
			const at = (k) => keys.indexOf(k);
			const orderOk =
				at("workspace") > at("model") && at("workspace") < at("safety") && at("safety") < at("agent") &&
				at("notifications") > at("memory") && at("notifications") < at("automations");
			const notificationsInTabs = keys.includes("notifications");
			/* v0.1.150: Appearance returns with real rows (after Chat). */
			const appearanceInTabs = keys.includes("appearance") && at("appearance") > at("agent") && at("appearance") < at("command");
			/* v0.1.190: About is a real informational tab — last in the strip. */
			const aboutInTabs = keys.includes("about") && at("about") === keys.length - 1;
			const notificationsInSearch = ["native notification", "completion sound"].every((query) =>
				searchSections[query].some((meta) => meta.startsWith("Notifications"))
			);
			const appearanceInSearch = searchSections["appearance"].some((meta) => meta.startsWith("Appearance"));
			const aboutInSearch = searchSections["about"].some((meta) => meta.startsWith("About"));
			const readSection = async (sec) => {
				const { page: pg } = await openPage(browser, shell(bundleText, refCss, pluginCss, sec), sec);
				const names = await pg.evaluate(() =>
					[...document.querySelectorAll(".setting-item-name")].map((el) => (el.textContent ?? "").trim())
				);
				await pg.close();
				return names;
			};
			const ws = await readSection("workspace");
			const sf = await readSection("safety");

			/* Exercise the real controls, not just their labels: defaults, all 14
			   choices, the user-gesture Test path, app-cue Preview, and persistence
			   callbacks must survive the bundled Settings renderer. */
			const { page: ntPage } = await openPage(browser, shell(bundleText, refCss, pluginCss, "notifications"), "notifications");
			const nt = await ntPage.evaluate(() =>
				[...document.querySelectorAll(".setting-item-name")].map((el) => (el.textContent ?? "").trim())
			);
			const notificationDefaults = await ntPage.evaluate(() => {
				const row = (name) => [...document.querySelectorAll(".setting-item")].find((el) =>
					(el.querySelector(".setting-item-name")?.textContent ?? "").trim() === name
				);
				const checked = (name) => row(name)?.querySelector('input[type="checkbox"]')?.checked ?? null;
				const preset = row("Completion sound preset")?.querySelector("select");
				return {
					status: (row("Native notification status")?.querySelector(".setting-item-description")?.textContent ?? "").trim(),
					nativeMaster: checked("Enable native notifications"),
					kinds: ["Chat completed", "Chat error", "Approval required", "Input required", "Automation completed", "Automation error"].map(checked),
					soundMaster: checked("Play completion sound"),
					presetValue: preset?.value ?? null,
					presetOptions: preset ? [...preset.options].map((o) => ({ value: o.value, text: o.textContent ?? "" })) : [],
				};
			});
			/* The settings shell uses an internal scroll viewport. DOM activation is
			   intentional here: it executes the real component handlers without
			   Playwright rejecting controls below the outer page viewport. */
			await ntPage.getByRole("button", { name: "Request permission & test" }).evaluate((el) => el.click());
			await ntPage.locator(".setting-item").filter({ hasText: "Completion sound preset" }).locator("select").evaluate((el) => {
				el.value = "14";
				el.dispatchEvent(new Event("change", { bubbles: true }));
			});
			await ntPage.getByRole("button", { name: "Preview", exact: true }).evaluate((el) => el.click());
			await ntPage.locator(".setting-item").filter({ hasText: "Enable native notifications" }).locator(".checkbox-container").evaluate((el) => el.click());
			await ntPage.locator(".setting-item").filter({ hasText: "Play completion sound" }).locator(".checkbox-container").evaluate((el) => el.click());
			await ntPage.waitForTimeout(20);
			const notificationInteractions = await ntPage.evaluate(() => {
				const state = globalThis;
				const row = (name) => [...document.querySelectorAll(".setting-item")].find((el) =>
					(el.querySelector(".setting-item-name")?.textContent ?? "").trim() === name
				);
				const checked = (name) => row(name)?.querySelector('input[type="checkbox"]')?.checked ?? null;
				return {
					testCalls: state.__oaNotificationTestCalls ?? 0,
					previewCalls: state.__oaSoundPreviewCalls ?? 0,
					previewVariant: state.__oaSoundPreviewVariant ?? null,
					saveCalls: state.__oaSettingsSaveCalls ?? 0,
					nativeMasterAfterClick: checked("Enable native notifications"),
					soundMasterAfterClick: checked("Play completion sound"),
				};
			});
			await ntPage.close();
			const notificationControls =
				notificationDefaults.status.includes("Supported") && notificationDefaults.status.includes("permission not requested") &&
				notificationDefaults.nativeMaster === false && notificationDefaults.kinds.every((v) => v === true) &&
				notificationDefaults.soundMaster === false && notificationDefaults.presetValue === "1" &&
				notificationDefaults.presetOptions.length === 14 && notificationDefaults.presetOptions[0]?.text.includes("Two-note comfort") &&
				notificationInteractions.testCalls === 1 && notificationInteractions.previewCalls === 1 &&
				notificationInteractions.previewVariant === 14 && notificationInteractions.saveCalls >= 3 &&
				notificationInteractions.nativeMasterAfterClick === true && notificationInteractions.soundMasterAfterClick === true;
			const notificationRows = [
				"Native notification status",
				"Enable native notifications",
				"Chat completed",
				"Approval required",
				"Automation error",
				"Play completion sound",
				"Completion sound preset",
			].every((name) => nt.includes(name));
			probes.F33 = {
				fixed:
					orderOk && notificationsInTabs && appearanceInTabs && appearanceInSearch && aboutInTabs && notificationsInSearch && aboutInSearch &&
					notificationRows && notificationControls && ws.includes("Workspace folder") &&
					sf.includes("Approval mode") && !sf.includes("Workspace folder"),
				tabs,
				notificationsInTabs,
				appearanceInTabs,
				appearanceInSearch,
				aboutInTabs,
				notificationsInSearch,
				aboutInSearch,
				searchSections,
				notificationRows: nt,
				notificationControls,
				notificationDefaults,
				notificationInteractions,
				workspaceRows: ws,
				safetyRows: sf,
			};
		}

		/* F35 — Package A persistent exact values. The three audited limits use
		   the shared range + number control, both faces stay synchronized, and
		   committing memory interval 0 visibly preserves the "0 disables" copy. */
		{
			const readSlider = (label) => {
				const range = document.querySelector(`input[type="range"][aria-label="${label}"]`);
				const exact = document.querySelector(`input[type="number"][aria-label="${label} (exact value)"]`);
				return range && exact
					? { range: range.value, exact: exact.value, visible: exact.getBoundingClientRect().width > 0 }
					: null;
			};
			const { page: chatPage } = await openPage(browser, shell(bundleText, refCss, pluginCss, "agent"), "agent");
			const chatBefore = await chatPage.evaluate(readSlider, "Max sessions kept");
			await chatPage.close();
			/* v0.1.151: "Max tool iterations" moved Chat → Advanced (Hermes
			   agent.max_turns). The slider probe follows the row to its new
			   home — the point is the move, not the old address. */
			const { page: advancedPage } = await openPage(browser, shell(bundleText, refCss, pluginCss, "advanced"), "advanced");
			const iterationsBefore = await advancedPage.evaluate(readSlider, "Max tool iterations");
			await advancedPage.locator('input[aria-label="Max tool iterations (exact value)"]').fill("17");
			await advancedPage.locator('input[aria-label="Max tool iterations (exact value)"]').press("Tab");
			await advancedPage.waitForTimeout(80);
			const iterationsAfter = await advancedPage.evaluate((readSliderSrc) => {
				const readSlider = eval(`(${readSliderSrc})`);
				return {
					control: readSlider("Max tool iterations"),
					setting: window.__oaPlugin.settings.maxIterations,
				};
			}, readSlider.toString());
			await advancedPage.close();

			const { page: memoryPage } = await openPage(browser, shell(bundleText, refCss, pluginCss, "memory"), "memory");
			const memoryBefore = await memoryPage.evaluate(readSlider, "Memory nudge interval");
			await memoryPage.locator('input[aria-label="Memory nudge interval (exact value)"]').fill("0");
			await memoryPage.locator('input[aria-label="Memory nudge interval (exact value)"]').press("Tab");
			await memoryPage.waitForTimeout(80);
			const memoryZero = await memoryPage.evaluate((readSliderSrc) => {
				const readSlider = eval(`(${readSliderSrc})`);
				const row = [...document.querySelectorAll(".setting-item")].find((el) =>
					el.querySelector(".setting-item-name")?.textContent?.trim() === "Memory nudge interval"
				);
				return {
					control: readSlider("Memory nudge interval"),
					setting: window.__oaPlugin.settings.memoryNudgeInterval,
					desc: row?.querySelector(".setting-item-description")?.textContent ?? "",
				};
			}, readSlider.toString());
			await memoryPage.close();

			probes.F35sliders = {
				fixed:
					chatBefore?.range === "100" && chatBefore.exact === "100" && chatBefore.visible &&
					iterationsBefore?.range === "12" && iterationsBefore.exact === "12" && iterationsBefore.visible &&
					iterationsAfter.control?.range === "17" && iterationsAfter.control.exact === "17" && iterationsAfter.setting === 17 &&
					memoryBefore?.range === "8" && memoryBefore.exact === "8" && memoryBefore.visible &&
					memoryZero.control?.range === "0" && memoryZero.control.exact === "0" && memoryZero.setting === 0 &&
					memoryZero.desc.includes("0 disables"),
				chatBefore,
				iterationsBefore,
				iterationsAfter,
				memoryBefore,
				memoryZero,
			};
		}

		// F34 — general: chord kirim (v0.1.127, owner ×3). Deskripsi toggle
		// "Enter sends message" harus menjelaskan skema LENGKAP (Shift+Enter
		// bawaan + Ctrl/Cmd+Enter selalu kirim) dan bawaan SETTINGS = OFF di
		// objek settings maupun di wajah DOM checkbox-nya.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");
			probes.F34 = await page.evaluate(() => {
				const items = [...document.querySelectorAll(".setting-item")];
				const row = items.find(
					(it) => (it.querySelector(".setting-item-name")?.textContent ?? "").trim() === "Enter sends message"
				);
				const desc = (row?.querySelector(".setting-item-description")?.textContent ?? "").trim();
				const box = row?.querySelector(".checkbox-container") ?? null;
				const settingsOff = window.__oaPlugin?.settings?.enterToSend === false;
				const domOff = !!box && !box.classList.contains("is-enabled");
				return {
					fixed:
						desc.includes("Shift+Enter") &&
						desc.includes("Ctrl/Cmd+Enter always sends") &&
						settingsOff &&
						domOff,
					desc,
					settingsOff,
					domOff,
				};
			});
			await page.close();
		}

		// F43 — v0.1.161 chat panel location: the General tab exposes a
		// dropdown with the three leaf choices; the default value is "right".
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");
			const leaf = await page.evaluate(() => {
				const row = [...document.querySelectorAll(".setting-item")].find(
					(it) => (it.querySelector(".setting-item-name")?.textContent ?? "").trim() === "Chat panel location"
				);
				const sel = row?.querySelector("select");
				return {
					present: !!sel,
					value: sel?.value ?? null,
					options: sel ? [...sel.options].map((o) => o.text) : [],
					desc: (row?.querySelector(".setting-item-description")?.textContent ?? "").trim(),
					setting: window.__oaPlugin?.settings?.chatLeafLocation,
				};
			});
			await page.close();
			probes.F43chatLeaf = {
				fixed:
					leaf.present === true &&
					leaf.value === "right" &&
					leaf.options.includes("Left sidebar") &&
					leaf.options.includes("Main workspace (tab)") &&
					leaf.options.includes("Right sidebar") &&
					leaf.desc.includes("moves an open panel there right away") &&
					leaf.setting === "right",
				...leaf,
			};
		}

		// F14 — Package A Model route contract. Research pins both slots, so
		// the card must show the effective OpenRouter route separately from the
		// LM Studio global default, expose profile-pin management, and label the
		// commit action Save global default. The atomic draft behavior remains;
		// an unpinned profile still receives the concise Apply action.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "model"), "model");
			const readPair = `(() => { const s = window.__oaPlugin.settings; return { active: s.activeProviderId, model: s.model }; })()`;
			const before = await page.evaluate(() => {
				const s = window.__oaPlugin.settings;
				const routeText = document.querySelector(".oa-model-route")?.textContent ?? "";
				const assignmentRow = [...document.querySelectorAll(".setting-item")].find((el) =>
					el.querySelector(".setting-item-name")?.textContent?.trim() === "Global default model"
				);
				const customRow = [...document.querySelectorAll(".setting-item")].find((el) =>
					el.querySelector(".setting-item-name")?.textContent?.trim() === "Custom global model id"
				);
				const assignmentButtons = assignmentRow
					? [...assignmentRow.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim())
					: [];
				const routeButtons = document.querySelector(".oa-model-route")
					? [...document.querySelector(".oa-model-route").querySelectorAll("button")].map((b) => (b.textContent ?? "").trim())
					: [];
				return {
					active: s.activeProviderId,
					model: s.model,
					routeText,
					assignmentDesc: assignmentRow?.querySelector(".setting-item-description")?.textContent ?? "",
					customDesc: customRow?.querySelector(".setting-item-description")?.textContent ?? "",
					hasManagePin: routeButtons.includes("Manage profile pin"),
					hasSaveGlobal: assignmentButtons.includes("Save global default"),
					hasApply: assignmentButtons.includes("Apply"),
				};
			});
			await page.locator('select[aria-label="Provider"]').selectOption("openrouter");
			await page.waitForTimeout(250); // display() re-render
			const mid = await page.evaluate(() => {
				const s = window.__oaPlugin.settings;
				const opts = [...document.querySelectorAll('select[aria-label="Model"] option')].map((o) => o.value);
				const saveBtn = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Save global default");
				return {
					opts,
					saveDisabled: saveBtn ? saveBtn.disabled : null,
					stillUntouched: s.activeProviderId === "lmstudio" && s.model === "gemma-4-e4b-uncensored-hauway-qat-4b",
				};
			});
			probes.F14 = { before, mid, after: null, unpinned: null, routeTarget: null, fixed: false };
			await page.locator('select[aria-label="Model"]').selectOption("meta-llama/llama-3.3-70b-instruct");
			await page.getByRole("button", { name: "Save global default" }).click();
			await page.waitForTimeout(250);
			probes.F14.after = await page.evaluate(readPair);

			// CTA on the pinned route card must land on Profiles.
			await page.getByRole("button", { name: "Manage profile pin" }).click();
			await page.waitForTimeout(100);
			probes.F14.routeTarget = (await page.locator('.oa-settings-tab[aria-selected="true"]').textContent())?.trim() ?? null;

			// Remove the effective pin only in this isolated page state and verify
			// the dynamic action returns to Apply for the global route.
			await page.evaluate(() => {
				window.__oaPlugin.settings.activeProfileId = "default";
			});
			await page.locator(".oa-settings-tab", { hasText: "Model" }).click();
			await page.waitForTimeout(100);
			probes.F14.unpinned = await page.evaluate(() => {
				const routeText = document.querySelector(".oa-model-route")?.textContent ?? "";
				const buttons = [...document.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());
				return {
					routeText,
					hasApply: buttons.includes("Apply"),
					hasSaveGlobal: buttons.includes("Save global default"),
					hasManagePin: buttons.includes("Manage profile pin"),
				};
			});
			probes.F14.fixed =
				probes.F14.before.active === "lmstudio" &&
				probes.F14.before.model === "gemma-4-e4b-uncensored-hauway-qat-4b" &&
				probes.F14.before.routeText.includes("OpenRouter") &&
				probes.F14.before.routeText.includes("meta-llama/llama-3.3-70b-instruct") &&
				probes.F14.before.routeText.includes("Profile override") &&
				probes.F14.before.routeText.includes("global default: LM Studio (local)") &&
				probes.F14.before.routeText.includes("Profile pins continue to control this chat") &&
				probes.F14.before.assignmentDesc.includes("Saving it does not remove the active profile pin") &&
				probes.F14.before.customDesc.includes("active profile pin continues to control this chat") &&
				probes.F14.before.hasManagePin && probes.F14.before.hasSaveGlobal && !probes.F14.before.hasApply &&
				Array.isArray(probes.F14.mid.opts) &&
				probes.F14.mid.opts.length === 1 &&
				probes.F14.mid.opts[0] === "meta-llama/llama-3.3-70b-instruct" && // options follow the draft provider
				probes.F14.mid.saveDisabled === true && // cleared draft blocks Save global default
				probes.F14.mid.stillUntouched && // drafts never write state
				probes.F14.after.active === "openrouter" &&
				probes.F14.after.model === "meta-llama/llama-3.3-70b-instruct" && // one atomic global pair
				probes.F14.routeTarget === "Profiles" &&
				probes.F14.unpinned.routeText.includes("Global default") &&
				probes.F14.unpinned.hasApply && !probes.F14.unpinned.hasSaveGlobal && !probes.F14.unpinned.hasManagePin;
			await page.close();
		}

		// F15knobs — context & compression knobs, now on the Memory & Context
		// page (2026-08-24 dedupe: the Model tab used to render its own copy
		// of three of these rows, writing the SAME setting keys from two
		// places). This half of the old F15 asserts the knobs survived the
		// move with the Hermes-aligned defaults (threshold 0.50,
		// protect_last_n 20). 2026-08-30: "Context window" leads the CONTEXT
		// group (above "Context file") instead of the Compression group.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "memory"), "memory-knobs");
			const findRowM = `(name) => [...document.querySelectorAll(".setting-item")].find((el) => el.querySelector(".setting-item-name")?.textContent?.trim() === name)`;
			probes.F15knobs = await page.evaluate((findRowSrc) => {
				const findRow = eval(findRowSrc);
				const ctx = document.querySelector('input[aria-label="Context window"]');
				const enable = findRow("Auto-compression")?.querySelector('.checkbox-container input[type="checkbox"]');
				const thr = findRow("Compression threshold")?.querySelector('input[type="range"]');
				const prot = findRow("Protected recent messages")?.querySelector('input[type="range"]');
				const protNum = findRow("Protected recent messages")?.querySelector('input[type="number"]');
				/* row order 2026-08-30: "Context window" opens the CONTEXT group
				   (above the context file); the compression knobs follow in
				   their own group */
				const rows = [...document.querySelectorAll(".setting-item-name")].map((n) => n.textContent?.trim());
				return {
					ctx: !!ctx && ctx.placeholder === "0 = auto",
					enableOn: enable ? enable.checked : null,
					thr: thr ? { min: thr.min, max: thr.max, step: thr.step, value: thr.value } : null,
					prot: prot ? { min: prot.min, max: prot.max, value: prot.value } : null,
					protNum: protNum?.value ?? null,
					order:
						rows.indexOf("Context window") >= 0 &&
						rows.indexOf("Context window") < rows.indexOf("Context file") &&
						rows.indexOf("Context file") < rows.indexOf("Auto-compression"),
					/* the Model tab's duplicate is asserted by F15.gone, which runs
					   ON that page; a constant here would assert nothing. */
				};
			}, findRowM);
			const k = probes.F15knobs;
			k.fixed =
				k.ctx && k.enableOn === true &&
				k.thr?.min === "10" && k.thr?.max === "99" && k.thr?.step === "1" && k.thr?.value === "50" &&
				k.prot?.min === "0" && k.prot?.max === "24" && k.prot?.value === "20" && k.protNum === "20" &&
				k.order;
			await page.close();
		}

		// F15 — auxiliary-model slots (v0.1.17, Hermes Desktop aux parity):
		// both aux rows start un-pinned ("auto (use main)",
		// Set-to-main disabled); Change opens an inline provider+model pick
		// INSIDE that row (the main global pick also has a commit button —
		// every lookup stays row-scoped); switching the provider clears the
		// model draft (Apply disabled, nothing written); Apply pins the pair
		// without touching the main model; Set to main restores auto.
		// 2026-08-24: the knob half moved to F15knobs (Memory & Context); the
		// compression MODEL slot deliberately stays here.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "model"), "model");
			/* v0.1.154 amended: the title flow has TWO rows — the enable toggle
			   ("Title generation") + the aux-model slot ("Title model").
			   Pass aux=true to target the slot — the row carrying a
			   "Set to main" button. v0.1.183: slot renamed to kill the
			   duplicate label. */
			const findRow = `(name, aux) => [...document.querySelectorAll(".setting-item")].find((el) => el.querySelector(".setting-item-name")?.textContent?.trim() === name && (!aux || [...el.querySelectorAll("button")].some((b) => (b.textContent ?? "").trim() === "Set to main")))`;
			const before = await page.evaluate((findRowSrc) => {
				const findRow = eval(findRowSrc);
				const comp = findRow("Compression");
				const title = findRow("Title model", true);
				const setMain = (row) => [...(row?.querySelectorAll("button") ?? [])].find((b) => (b.textContent ?? "").trim() === "Set to main");
				/* the duplicated knobs must NOT be on this page any more */
				const gone =
					!document.querySelector('input[aria-label="Context window"]') &&
					!findRow("Enable compression") && !findRow("Compression threshold") &&
					!findRow("Protected tail messages");
				return {
					gone,
					compAuto: comp?.textContent.includes("auto (use main)") ?? false,
					titleAuto: title?.textContent.includes("auto (use main)") ?? false,
					compSetMainDisabled: setMain(comp)?.disabled ?? null,
					titleSetMainDisabled: setMain(title)?.disabled ?? null,
					auxEmpty: !window.__oaPlugin.settings.auxModels?.compression && !window.__oaPlugin.settings.auxModels?.titleGeneration,
				};
			}, findRow);
			probes.F15 = { before, mid: null, after: null, restored: null, fixed: false };
			// open the Compression slot editor (row-scoped: the main pick also has a commit action)
			await page.evaluate((findRowSrc) => {
				const findRow = eval(findRowSrc);
				[...findRow("Compression").querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Change").click();
			}, findRow);
			await page.waitForTimeout(250);
			// switch the draft provider to OpenRouter — the model draft must clear
			await page.evaluate((findRowSrc) => {
				const findRow = eval(findRowSrc);
				const dd = findRow("Compression").querySelector('select[aria-label="Compression provider"]');
				dd.value = "openrouter";
				dd.dispatchEvent(new Event("change", { bubbles: true }));
			}, findRow);
			await page.waitForTimeout(250);
			probes.F15.mid = await page.evaluate((findRowSrc) => {
				const findRow = eval(findRowSrc);
				const row = findRow("Compression");
				const modelDd = row?.querySelector('select[aria-label="Compression model"]');
				const apply = [...(row?.querySelectorAll("button") ?? [])].find((b) => (b.textContent ?? "").trim() === "Apply");
				const s = window.__oaPlugin.settings;
				return {
					modelOpts: modelDd ? [...modelDd.options].map((o) => o.value) : null,
					applyDisabled: apply?.disabled ?? null,
					untouched: !s.auxModels?.compression && s.activeProviderId === "lmstudio" && s.model === "gemma-4-e4b-uncensored-hauway-qat-4b",
				};
			}, findRow);
			// pick the model and Apply — the pair pins atomically inside the row
			await page.evaluate((findRowSrc) => {
				const findRow = eval(findRowSrc);
				const dd = findRow("Compression").querySelector('select[aria-label="Compression model"]');
				dd.value = "meta-llama/llama-3.3-70b-instruct";
				dd.dispatchEvent(new Event("change", { bubbles: true }));
			}, findRow);
			await page.waitForTimeout(120);
			await page.evaluate((findRowSrc) => {
				const findRow = eval(findRowSrc);
				[...findRow("Compression").querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Apply").click();
			}, findRow);
			await page.waitForTimeout(250);
			probes.F15.after = await page.evaluate((findRowSrc) => {
				const findRow = eval(findRowSrc);
				const s = window.__oaPlugin.settings;
				return {
					pinned: s.auxModels?.compression ?? null,
					desc: findRow("Compression")?.querySelector(".setting-item-description")?.textContent ?? null,
					titleStillAuto: findRow("Title model", true)?.textContent.includes("auto (use main)") ?? false,
					mainUntouched: s.activeProviderId === "lmstudio" && s.model === "gemma-4-e4b-uncensored-hauway-qat-4b",
				};
			}, findRow);
			// Set to main restores auto
			await page.evaluate((findRowSrc) => {
				const findRow = eval(findRowSrc);
				[...findRow("Compression").querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Set to main").click();
			}, findRow);
			await page.waitForTimeout(250);
			probes.F15.restored = await page.evaluate((findRowSrc) => {
				const findRow = eval(findRowSrc);
				return {
					pin: window.__oaPlugin.settings.auxModels?.compression ?? null,
					auto: findRow("Compression")?.textContent.includes("auto (use main)") ?? false,
				};
			}, findRow);
			const b = probes.F15.before, m = probes.F15.mid, a = probes.F15.after, r = probes.F15.restored;
			probes.F15.fixed =
				b.gone &&
				b.compAuto && b.titleAuto && b.compSetMainDisabled === true && b.titleSetMainDisabled === true && b.auxEmpty &&
				Array.isArray(m.modelOpts) && m.modelOpts.length === 1 && m.modelOpts[0] === "meta-llama/llama-3.3-70b-instruct" &&
				m.applyDisabled === true && m.untouched &&
				a.pinned?.providerId === "openrouter" && a.pinned?.model === "meta-llama/llama-3.3-70b-instruct" &&
				(a.desc ?? "").includes("OpenRouter · meta-llama/llama-3.3-70b-instruct") && a.titleStillAuto && a.mainUntouched &&
				r.pin === null && r.auto;
			await page.close();
		}

		// F16 — base-URL description is specific to the viewed provider
		// (owner 2026-07-31: the LM Studio row carried Ollama + OpenRouter
		// examples — "kenapa ada yang lain juga?"). The desc of the viewed
		// provider's base-URL row must mention ONLY that provider's URL.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "providers"), "providers");
			const descOf = () =>
				page.evaluate(() => {
					const row = [...document.querySelectorAll(".setting-item")].find((el) =>
						(el.querySelector(".setting-item-name")?.textContent ?? "").includes("base URL")
					);
					return {
						name: row?.querySelector(".setting-item-name")?.textContent?.trim() ?? null,
						desc: row?.querySelector(".setting-item-description")?.textContent ?? null,
					};
				});
			const lm = await descOf(); // default view = active LM Studio
			await page.locator(".oa-provider-row").nth(2).click(); // view Ollama (view-only, F11)
			await page.waitForTimeout(180);
			const ol = await descOf();
			const lmOnly =
				lm.desc !== null && lm.desc.includes("1234/v1") && lm.desc.includes("LM Studio") &&
				!lm.desc.includes("11434") && !lm.desc.includes("openrouter.ai") && !lm.desc.includes("Ollama");
			const olOnly =
				ol.desc !== null && ol.desc.includes("11434/v1") &&
				!ol.desc.includes("1234") && !ol.desc.includes("openrouter.ai") && !ol.desc.includes("LM Studio");
			probes.F16 = { lm, ollama: ol, fixed: lmOnly && olOnly && (ol.name ?? "").startsWith("Ollama") };
			await page.close();
		}

		// F8 — profiles: "New profile" row holds exactly 2 controls (name +
		// Create blank); the clone action lives on its own bare row below
		// (audit S3-8, fixed 2026-07-23). A regression flips `fixed` back to false.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "profiles"), "profiles");
			probes.F8 = await page.evaluate(() => {
				const rows = [...document.querySelectorAll(".setting-item")];
				const nameRow = rows.find((el) => el.querySelector(".setting-item-name")?.textContent?.trim() === "New profile");
				if (!nameRow) return { present: false };
				const controls = nameRow.querySelectorAll(".setting-item-control > *").length;
				const cloneRow = rows.find(
					(el) => el !== nameRow && (el.querySelector(".setting-item-control")?.textContent ?? "").includes("Clone active profile")
				);
				const cloneIsBare = !!cloneRow && (cloneRow.querySelector(".setting-item-name")?.textContent?.trim() ?? "") === "";
				return {
					present: true,
					fixed: controls === 2 && !!cloneRow && cloneIsBare,
					controlsOnNameRow: controls,
					cloneRowFound: !!cloneRow,
					cloneIsBare,
				};
			});
			await page.close();
		}

		// F17 — Mixture of Agents section (v0.1.29, Hermes Desktop parity):
		// the editor seeds the OFFICIAL default preset; nothing persists while
		// any slot is half-filled (muted waiting-hint instead); completing the
		// slots persists the whole normalized config; a per-reference toggle
		// persists quiet; "Add reference model" prefills from the aggregator;
		// an EXPLICIT action (Set default) on a broken draft fails LOUD with
		// the official problem text and the last-good config stays on disk.
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "model"), "model");
			const findRowSrc = `(name) => [...document.querySelectorAll(".setting-item")].find((el) => el.querySelector(".setting-item-name")?.textContent?.trim() === name)`;
			const readState = `(() => {
				const findRow = eval(${JSON.stringify(findRowSrc)});
				const s = window.__oaPlugin.settings;
				return {
					heading: [...document.querySelectorAll(".oa-subsection-title")].some((el) => (el.textContent ?? "").trim() === "Mixture of Agents"),
					blurb: document.body.textContent.includes("The aggregator is the acting model."),
					defaultLine: document.querySelector(".oa-moa-default-line")?.textContent ?? null,
					ref1Desc: findRow("Reference 1")?.querySelector(".oa-mono")?.textContent ?? null,
					ref2Desc: findRow("Reference 2")?.querySelector(".oa-mono")?.textContent ?? null,
					aggDesc: findRow("Aggregator")?.querySelector(".oa-mono")?.textContent ?? null,
					hint: !!document.querySelector(".oa-moa-hint"),
					problems: document.querySelector(".oa-moa-problems")?.textContent ?? null,
					deleteDisabled: [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Delete")?.disabled ?? null,
					moa: s.moa ? JSON.parse(JSON.stringify(s.moa)) : null,
				};
			})()`;
			probes.F17 = { before: await page.evaluate(readState), mid: null, filled: null, toggled: null, added: null, loud: null, fixed: false };

			// helper writers: pick provider/model inside ONE named row
			const pick = async (rowName, label, value) => {
				await page.evaluate(
					([findSrc, row, aria, v]) => {
						const findRow = eval(findSrc);
						const dd = findRow(row)?.querySelector(`select[aria-label="${aria}"]`);
						if (!dd) throw new Error(`F17: no select ${aria} in ${row}`);
						dd.value = v;
						dd.dispatchEvent(new Event("change", { bubbles: true }));
					},
					[findRowSrc, rowName, label, value]
				);
				await page.waitForTimeout(250);
			};

			// Reference 1: provider alone → model cleared → hint must appear, moa still unsaved
			await pick("Reference 1", "MoA slot provider", "lmstudio");
			probes.F17.mid = await page.evaluate(readState);
			await pick("Reference 1", "MoA slot model", "gemma-4-e4b-uncensored-hauway-qat-4b");
			await pick("Reference 2", "MoA slot provider", "lmstudio");
			await pick("Reference 2", "MoA slot model", "qwen3-30b-a3b-instruct-2507");
			await pick("Aggregator", "MoA slot provider", "openrouter");
			await pick("Aggregator", "MoA slot model", "meta-llama/llama-3.3-70b-instruct");
			probes.F17.filled = await page.evaluate(readState);

			// quiet toggle persists (a disabled-but-complete slot is valid).
			// Click the Obsidian ToggleComponent CONTAINER — a synthetic click
			// on the inner <input> doesn't move the component's state.
			await page.evaluate((findSrc) => {
				const findRow = eval(findSrc);
				findRow("Reference 1")?.querySelector(".checkbox-container")?.click();
			}, findRowSrc);
			await page.waitForTimeout(250);
			const toggled = await page.evaluate(readState);
			await page.evaluate((findSrc) => {
				const findRow = eval(findSrc);
				findRow("Reference 1")?.querySelector(".checkbox-container")?.click();
			}, findRowSrc);
			await page.waitForTimeout(250);
			probes.F17.toggled = toggled;

			// Add reference model → prefilled from the aggregator, quiet-persists
			// (JS click — the row sits below the fold; a playwright action click
			// would fail "outside of the viewport", same workaround as F15)
			await page.evaluate(() => {
				[...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Add reference model")?.click();
			});
			await page.waitForTimeout(250);
			probes.F17.added = await page.evaluate(readState);

			// break Reference 3 (provider change clears its model) → quiet wait…
			await pick("Reference 3", "MoA slot provider", "ollama");
			// …then an EXPLICIT action must fail LOUD and keep the last-good config
			await page.evaluate(() => {
				[...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Set default")?.click();
			});
			await page.waitForTimeout(250);
			probes.F17.loud = await page.evaluate(readState);
			await page.close();

			const b = probes.F17.before, m = probes.F17.mid, f = probes.F17.filled, t = probes.F17.toggled, a = probes.F17.added, l = probes.F17.loud;
			probes.F17.fixed =
				b.heading && b.blurb && (b.defaultLine ?? "").includes("default") &&
				b.ref1Desc === "openai-codex · gpt-5.5" && b.ref2Desc === "openrouter · deepseek/deepseek-v4-pro" &&
				b.aggDesc === "openrouter · anthropic/claude-opus-4.8" &&
				b.moa === null && b.deleteDisabled === true &&
				m.hint === true && m.moa === null && // half-filled: waiting, never saved
				f.moa?.presets?.default?.reference_models?.[0]?.provider === "lmstudio" &&
				f.moa?.presets?.default?.reference_models?.[0]?.model === "gemma-4-e4b-uncensored-hauway-qat-4b" &&
				f.moa?.presets?.default?.reference_models?.[1]?.model === "qwen3-30b-a3b-instruct-2507" &&
				f.moa?.presets?.default?.aggregator?.provider === "openrouter" &&
				f.moa?.presets?.default?.aggregator?.model === "meta-llama/llama-3.3-70b-instruct" &&
				f.moa?.default_preset === "default" && f.hint === false &&
				t.moa?.presets?.default?.reference_models?.[0]?.enabled === false &&
				a.moa?.presets?.default?.reference_models?.length === 3 &&
				a.moa?.presets?.default?.reference_models?.[2]?.provider === "openrouter" && // prefill from aggregator
				l.hint === false && // the red problems box REPLACES the waiting hint
				(l.problems ?? "").includes("preset 'default' reference 3: model is required (provider 'ollama' has no model selected)") &&
				l.moa?.presets?.default?.reference_models?.[2]?.provider === "openrouter" && // last-good kept
				l.moa?.presets?.default?.reference_models?.length === 3;
		}

		/* F19–F24 — settings search + modified dot (v0.1.94, additive).
		   Search rows harvest from the REAL section builders into a detached
		   host; clicking a result leaves search mode, jumps to the section,
		   and flashes the row. The dot marks rows whose value differs from
		   DEFAULT_SETTINGS. v0.1.127 amended: subjeknya showTimestamps=true
		   — enterToSend=false kini SAMA dengan bawaan barunya (bali default)
		   sehingga row Enter-send menjadi saudara pristine, bukan subjek. */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");

			// F19 — type → results + mode swap; click → jump + flash on the row.
			probes.F19 = await (async () => {
				await page.fill(".oa-settings-search-input", "timestamps");
				await page.waitForTimeout(60);
				const r = await page.evaluate(() => {
					const strip = document.querySelector(".oa-settings-tabstrip");
					const content = document.querySelector(".oa-settings-content");
					const rows = [...document.querySelectorAll(".oa-settings-search-result")];
					return {
						count: rows.length,
						first: rows[0]?.querySelector(".oa-settings-search-result-name")?.textContent?.trim() ?? "",
						stripHidden: strip ? getComputedStyle(strip).display === "none" : false,
						contentHidden: content ? getComputedStyle(content).display === "none" : false,
					};
				});
				await page.locator("#sim-frame").screenshot({ path: resolve(here, "shots", "settings-search.png") });
				await page.click(".oa-settings-search-result");
				await page.waitForTimeout(60);
				const j = await page.evaluate(() => {
					const flashed = document.querySelector(".setting-item.oa-settings-flash");
					const content = document.querySelector(".oa-settings-content");
					return {
						flashedName: (flashed?.querySelector(".setting-item-name")?.textContent ?? "").replace(/\s+/g, ""),
						contentBack: content ? getComputedStyle(content).display !== "none" : false,
						focusInside: !!(flashed && flashed.contains(document.activeElement)),
					};
				});
				return {
					fixed:
						r.count >= 1 && r.first === "Show message timestamps" &&
						r.stripHidden && r.contentHidden &&
						j.flashedName.includes("Showmessagetimestamps") && j.contentBack,
					before: r, after: j,
				};
			})();

			// F20 — moved out of this block on 2026-08-30: the dot subject row
			// "Show message timestamps" no longer renders on the general page
			// (it moved to Appearance), so its probe opens the appearance page
			// directly below.

			// F21 — search chrome a11y: role=search, labelled input & clear,
			// live status region.
			probes.F21 = await page.evaluate(() => {
				const wrap = document.querySelector(".oa-settings-search");
				const input = document.querySelector(".oa-settings-search-input");
				const clear = document.querySelector(".oa-settings-search-clear");
				const status = document.querySelector(".oa-settings-search-status");
				return {
					fixed:
						wrap?.getAttribute("role") === "search" &&
						input?.getAttribute("aria-label") === "Search settings" &&
						!!input?.getAttribute("placeholder") &&
						clear?.getAttribute("aria-label") === "Clear search" &&
						status?.getAttribute("aria-live") === "polite",
				};
			});

			// F22 — cross-tab jump: a Providers-only row lands on its tab.
			probes.F22 = await (async () => {
				await page.fill(".oa-settings-search-input", "api key");
				await page.waitForTimeout(60);
				const rows = await page.evaluate(() =>
					[...document.querySelectorAll(".oa-settings-search-result")].map((b) => ({
						name: b.querySelector(".oa-settings-search-result-name")?.textContent?.trim() ?? "",
						meta: b.querySelector(".oa-settings-search-result-meta")?.textContent?.trim() ?? "",
					}))
				);
				const idx = rows.findIndex((x) => x.name === "API key" && x.meta.startsWith("Providers"));
				if (idx >= 0) await page.locator(".oa-settings-search-result").nth(idx).click();
				await page.waitForTimeout(60);
				const after = await page.evaluate(() => ({
					active: document.querySelector(".oa-settings-tab.is-active")?.dataset.key ?? "",
					flashedName: (document.querySelector(".setting-item.oa-settings-flash .setting-item-name")?.textContent ?? "").trim(),
				}));
				return { fixed: idx >= 0 && after.active === "providers" && after.flashedName === "API key", rows, after };
			})();

			// F23 — empty state: polite copy in the live region, zero rows.
			probes.F23 = await (async () => {
				await page.fill(".oa-settings-search-input", "zzz-no-such-setting");
				await page.waitForTimeout(60);
				const r = await page.evaluate(() => ({
					status: document.querySelector(".oa-settings-search-status")?.textContent ?? "",
					rows: document.querySelectorAll(".oa-settings-search-result").length,
				}));
				await page.fill(".oa-settings-search-input", "");
				await page.waitForTimeout(60);
				const cleared = await page.evaluate(() => document.querySelectorAll(".oa-settings-search-result").length === 0);
				return { fixed: r.rows === 0 && r.status.startsWith("No settings match") && cleared, ...r };
			})();

			// F24 — Escape exits search mode: results gone, strip+content back.
			probes.F24 = await (async () => {
				await page.fill(".oa-settings-search-input", "memory");
				await page.waitForTimeout(60);
				const before = await page.evaluate(() => document.querySelectorAll(".oa-settings-search-result").length);
				await page.press(".oa-settings-search-input", "Escape");
				await page.waitForTimeout(60);
				const r = await page.evaluate(() => ({
					rows: document.querySelectorAll(".oa-settings-search-result").length,
					stripVisible: getComputedStyle(document.querySelector(".oa-settings-tabstrip")).display !== "none",
					contentVisible: getComputedStyle(document.querySelector(".oa-settings-content")).display !== "none",
				}));
				return { fixed: before > 0 && r.rows === 0 && r.stripVisible && r.contentVisible, before, ...r };
			})();

			await page.close();
		}

		/* F20 — modified dot (v0.1.94, moved 2026-08-30): the dot subject row
		   "Show message timestamps" moved from General to Appearance, so the
		   probe follows it there. Pristine sibling: "Tool calls" (seed keeps
		   it at its default). */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "appearance"), "appearance");
			probes.F20 = await page.evaluate(() => {
				const item = [...document.querySelectorAll(".setting-item")];
				const byName = (t) => item.find((el) => (el.querySelector(".setting-item-name")?.textContent ?? "").includes(t));
				const dot = byName("Show message timestamps")?.querySelector(".oa-mod-dot");
				const siblingDot = byName("Tool calls")?.querySelector(".oa-mod-dot");
				return {
					fixed: !!dot && dot.getAttribute("aria-label") === "Changed from default" && !siblingDot && document.querySelectorAll(".oa-mod-dot").length === 1,
					dotA11y: dot?.getAttribute("aria-label") ?? null,
					dotsOnPane: document.querySelectorAll(".oa-mod-dot").length,
				};
			});
			await page.close();
		}

		/* F25 — settings search chrome (v0.1.96): the clear button must not
		   paint a UA-native box and must take ZERO layout when the query is
		   empty (display swap, not visibility). The input paints no own
		   frame — appearance:none + parent-prefixed rules keep the UA/host
		   out. Self-contained evaluators only (page.evaluate drops outer
		   closures — never reference Node-scoped helpers from inside). */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");
			const empty = await page.evaluate(() => {
				const btn = document.querySelector(".oa-settings-search-clear");
				const cb = getComputedStyle(btn);
				const r = btn.getBoundingClientRect();
				return { display: cb.display, rect: [Math.round(r.width), Math.round(r.height)] };
			});
			await page.fill(".oa-settings-search-input", "memory");
			await page.waitForTimeout(60);
			const active = await page.evaluate(() => {
				const btn = document.querySelector(".oa-settings-search-clear");
				const input = document.querySelector(".oa-settings-search-input");
				const cb = getComputedStyle(btn), ci = getComputedStyle(input);
				return {
					display: cb.display,
					border: `${cb.borderTopWidth} ${cb.borderTopStyle}`,
					bg: cb.backgroundColor, shadow: cb.boxShadow,
					inputBorder: `${ci.borderTopWidth} ${ci.borderTopStyle}`,
					inputBg: ci.backgroundColor, inputShadow: ci.boxShadow,
				};
			});
			await page.click(".oa-settings-search-clear");
			await page.waitForTimeout(60);
			const after = await page.evaluate(() => ({
				value: document.querySelector(".oa-settings-search-input").value,
				rows: document.querySelectorAll(".oa-settings-search-result").length,
				displayBack: getComputedStyle(document.querySelector(".oa-settings-search-clear")).display,
			}));
			probes.F25 = {
				fixed:
					empty.display === "none" && empty.rect[0] === 0 &&
					active.display === "flex" &&
					(active.border.endsWith("none") || active.border.startsWith("0px")) &&
					active.shadow === "none" &&
					(active.bg === "rgba(0, 0, 0, 0)" || active.bg === "transparent") &&
					(active.inputBorder.endsWith("none") || active.inputBorder.startsWith("0px")) &&
					(active.inputBg === "rgba(0, 0, 0, 0)" || active.inputBg === "transparent") &&
					active.inputShadow === "none" &&
					after.value === "" && after.rows === 0 && after.displayBack === "none",
				empty, active, after,
			};
			await page.close();
		}

		/* F26 — Settings search is not the shared SearchField. Keep its inner
		   input calm even when a later theme rule tries to restore stock hover,
		   active, or focus paint. Sample pointer entry/active/exit immediately,
		   in-flight, and settled; focus stays on the shell via :focus-within. */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");
			await page.addStyleTag({ content: `
				@keyframes oa-host-search-pulse { from { opacity: .55; } to { opacity: .75; } }
				body.theme-dark input.oa-settings-search-input[type="search"]:hover,
				body.theme-dark input.oa-settings-search-input[type="search"]:active,
				body.theme-dark input.oa-settings-search-input[type="search"]:focus {
					background: rgb(92, 36, 120) !important;
					border: 3px solid rgb(255, 65, 170) !important;
					box-shadow: 0 0 0 4px rgb(255, 65, 170) !important;
					outline: 3px solid rgb(255, 65, 170) !important;
					color: rgb(255, 255, 0) !important;
					opacity: .55 !important;
					filter: brightness(1.8) !important;
					transform: translateY(-2px) !important;
					text-shadow: 0 0 3px red !important;
					transition: all 120ms linear !important;
					animation: oa-host-search-pulse 120ms infinite alternate !important;
				}
			` });
			const snap = () => {
				const el = document.querySelector(".oa-settings-search-input");
				const wrap = document.querySelector(".oa-settings-search");
				const pick = (cs) => ({
					borderColor: cs.borderTopColor, borderStyle: cs.borderTopStyle, borderWidth: cs.borderTopWidth,
					bg: cs.backgroundColor, bgImage: cs.backgroundImage, shadow: cs.boxShadow,
					outline: `${cs.outlineWidth} ${cs.outlineStyle}`.trim(),
					color: cs.color, opacity: cs.opacity, filter: cs.filter, transform: cs.transform,
					textShadow: cs.textShadow, transitionProperty: cs.transitionProperty,
					transitionDuration: cs.transitionDuration, animationName: cs.animationName,
				});
				return {
					input: pick(getComputedStyle(el)),
					wrap: pick(getComputedStyle(wrap)),
					focused: document.activeElement === el,
				};
			};
			const shot = (name) => page.locator("#sim-frame").screenshot({ path: resolve(here, "shots", name) });
			await page.evaluate(() => document.querySelector(".oa-settings-search-input")?.blur());
			await page.mouse.move(0, 0);
			const rest = await page.evaluate(snap);
			await shot("settings-search-rest.png");

			/* Pointer entry is sampled in three distinct windows. A settle-only
			   snapshot would miss a transient host/theme transition. */
			await page.hover(".oa-settings-search-input");
			const hoverImmediate = await page.evaluate(snap);
			await shot("settings-search-hover-entry.png");
			await page.waitForTimeout(60);
			const hoverInFlight = await page.evaluate(snap);
			await shot("settings-search-hover-in-flight.png");
			await page.waitForTimeout(180);
			const hoverSettled = await page.evaluate(snap);
			await shot("settings-search-hover-settled.png");
			/* Retain the historical evidence filename for downstream reviewers. */
			await shot("settings-search-hover.png");

			await page.mouse.down();
			const activeImmediate = await page.evaluate(snap);
			await page.waitForTimeout(60);
			const activeInFlight = await page.evaluate(snap);
			await page.waitForTimeout(180);
			const activeSettled = await page.evaluate(snap);
			await page.mouse.up();
			await page.waitForTimeout(240);
			const focused = await page.evaluate(snap);

			/* Remove focus while the pointer is still inside, then sample pointer
			   exit immediately, during the hostile 120 ms window, and settled. */
			await page.evaluate(() => document.querySelector(".oa-settings-search-input")?.blur());
			const preExit = await page.evaluate(snap);
			await page.mouse.move(0, 0);
			const exitImmediate = await page.evaluate(snap);
			await shot("settings-search-exit-entry.png");
			await page.waitForTimeout(60);
			const exitInFlight = await page.evaluate(snap);
			await shot("settings-search-exit-in-flight.png");
			await page.waitForTimeout(180);
			const exitSettled = await page.evaluate(snap);
			await shot("settings-search-exit-settled.png");

			const diff = (a, b, parts) => {
				const out = {};
				for (const part of parts) {
					for (const k of Object.keys(a[part])) {
						if (a[part][k] !== b[part][k]) out[`${part}.${k}`] = [a[part][k], b[part][k]];
					}
				}
				return out;
			};
			const hoverImmediateDiff = diff(rest, hoverImmediate, ["input", "wrap"]);
			const hoverInFlightDiff = diff(rest, hoverInFlight, ["input", "wrap"]);
			const hoverSettledDiff = diff(rest, hoverSettled, ["input", "wrap"]);
			const activeImmediateDiff = diff(rest, activeImmediate, ["input"]);
			const activeInFlightDiff = diff(rest, activeInFlight, ["input"]);
			const activeSettledInputDiff = diff(rest, activeSettled, ["input"]);
			const focusInputDiff = diff(rest, focused, ["input"]);
			const preExitDiff = diff(rest, preExit, ["input", "wrap"]);
			const exitImmediateDiff = diff(rest, exitImmediate, ["input", "wrap"]);
			const exitInFlightDiff = diff(rest, exitInFlight, ["input", "wrap"]);
			const exitSettledDiff = diff(rest, exitSettled, ["input", "wrap"]);
			const shellFocusVisible = focused.focused &&
				(focused.wrap.outline !== rest.wrap.outline || focused.wrap.shadow !== rest.wrap.shadow || focused.wrap.borderColor !== rest.wrap.borderColor);
			probes.F26 = {
				fixed:
					Object.keys(hoverImmediateDiff).length === 0 && Object.keys(hoverInFlightDiff).length === 0 &&
					Object.keys(hoverSettledDiff).length === 0 && Object.keys(activeImmediateDiff).length === 0 &&
					Object.keys(activeInFlightDiff).length === 0 && Object.keys(activeSettledInputDiff).length === 0 &&
					Object.keys(focusInputDiff).length === 0 && Object.keys(preExitDiff).length === 0 &&
					Object.keys(exitImmediateDiff).length === 0 && Object.keys(exitInFlightDiff).length === 0 &&
					Object.keys(exitSettledDiff).length === 0 && shellFocusVisible,
				hoverImmediateDiff, hoverInFlightDiff, hoverSettledDiff,
				activeImmediateDiff, activeInFlightDiff, activeSettledInputDiff,
				focusInputDiff, preExitDiff, exitImmediateDiff, exitInFlightDiff, exitSettledDiff, shellFocusVisible,
				rest, hoverImmediate, hoverInFlight, hoverSettled,
				activeImmediate, activeInFlight, activeSettled, focused,
				preExit, exitImmediate, exitInFlight, exitSettled,
			};
			await page.close();
		}

		/* F27 — lobe data-entry ports di settings (owner 2026-08-07, pilihan
		   "both"): SOURCE diverifikasi raw lobehub/lobe-ui@master —
		   Segmented = antd radiogroup ber-thumb geser (dipakai Approval
		   mode, menggantikan dropdown), SliderWithInput = slider+angka
		   sinkron dua arah dengan unlimitedInput (dipakai Temperature &
		   Max output tokens). Witness = DOM+keyboard+settings nyata. */
		{
			/* v0.1.126: row Approval mode kini hidup di tab Safety (owner
			   restructure; semua asser behavior tetap pada row yang SAMA) */
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "safety"), "safety");
			const r = await page.evaluate(async () => {
				const wait = (ms) => new Promise((r2) => setTimeout(r2, ms));
				const row = [...document.querySelectorAll(".setting-item")].find((el) =>
					(el.querySelector(".setting-item-name")?.textContent ?? "").includes("Approval mode"));
				if (!row) return { row: false };
				const seg = row.querySelector(".oa-seg");
				const noDropdown = !row.querySelector("select");
				if (!seg) return { row: true, seg: false, noDropdown };
				const btns = [...seg.querySelectorAll("button[role=radio]")];
				const plugin = window.__oaPlugin;
				const before = plugin.settings.approvalMode;
				const checked0 = btns.find((b) => b.getAttribute("aria-checked") === "true")?.dataset.value;
				const getB = (v) => btns.find((b) => b.dataset.value === v);
				const thumbRect = () => seg.querySelector(".oa-seg-thumb")?.getBoundingClientRect() ?? null;
				await wait(80); /* place() pasang thumb di rAF pertama */
				const t1 = thumbRect();
				/* klik target ≠ nilai awal supaya thumb terlihat berpindah */
				const clickTarget = before === "manual" ? "cautious" : "manual";
				getB(clickTarget).click();
				await wait(260); /* transisi thumb 180ms — ukur setelah mendarat */
				const mid = plugin.settings.approvalMode;
				const t2 = thumbRect();
				const bMid = getB(clickTarget).getBoundingClientRect();
				getB(clickTarget).focus();
				getB(clickTarget).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
				await wait(260);
				const afterKey = plugin.settings.approvalMode;
				const focusNow = document.activeElement?.dataset?.value;
				const t3 = thumbRect();
				const bKey = getB(afterKey)?.getBoundingClientRect();
				const align = (t, b) => !!t && !!b && Math.abs(t.left - b.left) <= 3 && Math.abs(t.width - b.width) <= 3;
				return {
					row: true, seg: true, noDropdown,
					roles: seg.getAttribute("role") === "radiogroup" && btns.length === 3 && btns.every((b) => b.getAttribute("role") === "radio"),
					ariaLabel: seg.getAttribute("aria-label") === "Approval mode",
					startMatchesSetting: checked0 === before,
					tabStops: btns.filter((b) => b.tabIndex === 0).length === 1,
					clickTarget, clickWorks: mid === clickTarget,
					keyWorks: afterKey !== mid && focusNow === afterKey,
					thumbFollowsClick: align(t2, bMid),
					thumbFollowsKey: align(t3, bKey),
					thumbMoved: !!t1 && !!t2 && (t1.left !== t2.left),
				};
			});
			probes.F27seg = {
				fixed: !!(r.row && r.seg && r.noDropdown && r.roles && r.ariaLabel && r.startMatchesSetting &&
					r.tabStops && r.clickWorks && r.keyWorks && r.thumbFollowsClick && r.thumbFollowsKey && r.thumbMoved),
				r,
			};
			await page.close();
		}
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "model"), "model");
			const r = await page.evaluate(async () => {
				const wait = (ms) => new Promise((r2) => setTimeout(r2, ms));
				const rows = [...document.querySelectorAll(".setting-item")];
				const rowOf = (label) => rows.find((el) => (el.querySelector(".setting-item-name")?.textContent ?? "").includes(label));
				const trow = rowOf("Temperature") ?? null;
				const mrow = rowOf("Max output tokens") ?? null;
				if (!trow || !mrow) return { rows: false };
				const plugin = window.__oaPlugin;
				const tSl = trow.querySelector(".oa-slideinput") ?? null;
				const mSl = mrow.querySelector(".oa-slideinput") ?? null;
				const noNativeSlider = !trow.querySelector("input.slider");
				if (!tSl || !mSl) return { rows: true, tSl: !!tSl, mSl: !!mSl, noNativeSlider };
				const tr = tSl.querySelector('input[type="range"]');
				const tn = tSl.querySelector('input[type="number"]');
				const mr = mSl.querySelector('input[type="range"]');
				const mn = mSl.querySelector('input[type="number"]');
				const setN = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
				const fireInput = (el, v) => { setN.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); };
				const fireChange = (el, v) => { setN.call(el, v); el.dispatchEvent(new Event("change", { bubbles: true })); };
				/* temperature: geser slider → settings + kotak sinkron */
				fireInput(tr, "1.5");
				await wait(40);
				const tAfter = plugin.settings.temperature;
				const tnSynced = tn.value === "1.5";
				/* ketik angka → preview menggerakkan slider tanpa commit, change clamp+commit */
				fireInput(tn, "0.25");
				const trPreview = tr.value;
				fireChange(tn, "0.25");
				await wait(40);
				const tNum = plugin.settings.temperature;
				/* di luar rentang → clamp ke 2 */
				fireChange(tn, "9");
				await wait(40);
				const tClamp = plugin.settings.temperature;
				/* maxTokens: unlimitedInput — angka raksasa diterima, slider diam di rel */
				fireChange(mn, "999999");
				await wait(40);
				const mBig = plugin.settings.maxTokens;
				const mRail = Number(mr.max) === 16384 && Number(mr.value) <= 16384;
				fireInput(mr, "4096");
				await wait(40);
				const mSet = plugin.settings.maxTokens;
				const mnSynced = mn.value === "4096";
				const aria = !!tr.getAttribute("aria-label") && !!mn.getAttribute("aria-label") &&
					tr.getAttribute("aria-valuetext") !== null && !!mr.getAttribute("aria-label");
				/* v0.1.110 (owner: panjang slider harus sama): rail dikunci
				   fixed 240px-64-16=160 → lebar kedua rail HARUS identik */
				const tRailW = Math.round(tr.getBoundingClientRect().width);
				const mRailW = Math.round(mr.getBoundingClientRect().width);
				const sameRail = Math.abs(tRailW - mRailW) <= 1;
				return { rows: true, tSl: true, mSl: true, noNativeSlider, tAfter, tnSynced, trPreview, tNum, tClamp, mBig, mRail, mSet, mnSynced, aria, tRailW, mRailW, sameRail };
			});
			probes.F27slide = {
				fixed: !!(r.rows && r.tSl && r.mSl && r.noNativeSlider && r.tAfter === 1.5 && r.tnSynced &&
					r.trPreview === "0.25" && r.tNum === 0.25 && r.tClamp === 2 && r.mBig === 999999 &&
					r.mRail && r.mSet === 4096 && r.mnSynced && r.aria && r.sameRail),
				r,
			};
			await page.close();
		}

		{
			/* F28 — v0.1.109 owner ask (baris kontrol MoA / "setting-item
			   mod-toggle"): dropdown preset full-width seperti picker lain,
			   teks "Enabled" kelihatan SEBELUM toggle, tombol Add preset
			   SESUDAH input nama. Perilaku ikut dijaga: Add mati saat nama
			   kosong/dup, hidup saat nama segar. */
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "model"), "model");
			const r = await page.evaluate(async () => {
				/* info kosong pada baris tanpa nama memiliki margin native 16px di
				   app.css lintas versi memberi margin pada child pertama. Suntik
				   aturan native itu secara eksplisit di sini agar aksioma
				   flush-kiri .oa-moa-ctl
				   .setting-item-info{display:none} sungguh teruji (pola F29). */
				const emu = document.createElement("style");
				emu.textContent = ".setting-item > *:first-child { margin-inline-end: var(--size-4-4); }";
				document.head.appendChild(emu);
				const row = document.querySelector(".setting-item.oa-moa-ctl") ?? null;
				if (!row) return { row: false };
				const pick = row.querySelector('select[aria-label="MoA preset"]');
				const label = row.querySelector(".oa-moa-ctl-label");
				const tog = row.querySelector(".checkbox-container");
				const input = row.querySelector('input[aria-label="New MoA preset name"]');
				const addBtn = [...row.querySelectorAll("button")].find((b) => b.textContent === "Add preset") ?? null;
				const pair = row.querySelector(".oa-moa-ctl-new") ?? null;
				if (!pick || !label || !tog || !input || !addBtn || !pair) {
					return { row: true, pick: !!pick, label: !!label, tog: !!tog, input: !!input, addBtn: !!addBtn, pair: !!pair };
				}
				const cs = getComputedStyle(pick);
				const ctlCs = getComputedStyle(row.querySelector(".setting-item-control"));
				const labelText = (label.textContent ?? "").trim();
				const labelBeforeToggle = !!(label.compareDocumentPosition(tog) & Node.DOCUMENT_POSITION_FOLLOWING);
				const inputBeforeAdd = !!(input.compareDocumentPosition(addBtn) & Node.DOCUMENT_POSITION_FOLLOWING);
				const pickRect = pick.getBoundingClientRect();
				const inputRect = input.getBoundingClientRect();
				const addRect = addBtn.getBoundingClientRect();
				const pickW = Math.round(pickRect.width);
				const inputW = Math.round(inputRect.width);
				const pickAboveInput = pickRect.bottom <= inputRect.top + 1;
				/* v0.1.111 (owner bug tata letak): input + Add harus SEBARIS dan
				   menempel dalam satu wadah — tak pernah yatim di baris sendiri */
				const sameLine = Math.abs(inputRect.top - addRect.top) <= 2;
				const pairOwns = pair.contains(input) && pair.contains(addBtn);
				/* v0.1.112 (owner: "spasi yang dorong di kiri"): kontrol tak lagi
				   rata kanan; v0.1.113 (owner DevTools: "tak mentok ke kanan" +
				   "purple space kiri dropdown"): space-between meratakan DUA
				   tepi — label kiri == tepi pick, tombol Add kanan == tepi pick;
				   info kosong disembunyikan sehingga pick sendiri mentok pada
				   tepi konten baris (diuji dengan margin native yang disuntik). */
				const justifyBetween = ctlCs.justifyContent === "space-between";
				const noLeftVoid = Math.abs(inputRect.left - pickRect.left) <= 2 ||
					Math.abs(label.getBoundingClientRect().left - pickRect.left) <= 2;
				const inputTight = Math.round(inputRect.width) >= 120 && Math.round(inputRect.width) <= 170;
				const rowCs = getComputedStyle(row);
				const contentLeft = row.getBoundingClientRect().left + parseFloat(rowCs.paddingLeft);
				const pickFlushLeft = Math.abs(pickRect.left - contentLeft) <= 2;
				const addFlushRight = Math.abs(addRect.right - pickRect.right) <= 2;
				const addInitialDisabled = addBtn.disabled;
				const setN = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
				setN.call(input, "zilla");
				input.dispatchEvent(new Event("input", { bubbles: true }));
				const addEnabledOnFresh = !addBtn.disabled;
				setN.call(input, "default");
				input.dispatchEvent(new Event("input", { bubbles: true }));
				const addStaysDisabledOnDup = addBtn.disabled;
				return {
					row: true, pick: true, label: true, tog: true, input: true, addBtn: true, pair: true,
					flexGrow: cs.flexGrow, labelText, labelBeforeToggle, inputBeforeAdd, pickW, inputW,
					pickAboveInput, sameLine, pairOwns, justifyBetween, noLeftVoid, inputTight,
					pickFlushLeft, addFlushRight,
					addInitialDisabled, addEnabledOnFresh, addStaysDisabledOnDup,
				};
			});
			probes.F28moa = {
				fixed: !!(r.row && r.pick && r.label && r.tog && r.input && r.addBtn && r.pair &&
					r.flexGrow === "1" && r.labelText === "Enabled" && r.labelBeforeToggle &&
					r.inputBeforeAdd && r.pickW > r.inputW && r.pickAboveInput &&
					r.sameLine && r.pairOwns && r.justifyBetween && r.noLeftVoid && r.inputTight &&
					r.pickFlushLeft && r.addFlushRight &&
					r.addInitialDisabled && r.addEnabledOnFresh && r.addStaysDisabledOnDup),
				r,
			};
			await page.close();
		}

		{
			/* F29 — v0.1.111 (owner: "ketika toggle enable seperti di force ke
			   atas / scroll ke atas"): display() rebuild penuh → tinggi konten
			   kolaps sesaat → browser clamp scrollTop ke 0. Kini display()
			   merekam posisi scroller sebelum empty() dan memulihkannya sehabis
			   render. Bukti kuat: baris LAMA TERDETAS (rebuild sungguh terjadi)
			   namun scrollY bertahan ±4px, dan enabled SUNGGUH berbalik. */
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "model"), "model");
			const r = await page.evaluate(async () => {
				const wait = (ms) => new Promise((res) => setTimeout(res, ms));
				/* emulasi pane Obsidian asli di mana TAB adalah scroller
				   overflow:auto (shim sudah menempel .vertical-tab-content ke
				   containerEl; tinggal batasi tinggi + overflow) */
				const st = document.createElement("style");
				st.textContent = ".vertical-tab-content{height:60vh !important; overflow-y:auto !important;}";
				document.head.appendChild(st);
				const sc = document.querySelector(".vertical-tab-content");
				const row = document.querySelector(".setting-item.oa-moa-ctl");
				if (!row || !sc) return { row: !!row, sc: !!sc };
				row.scrollIntoView({ block: "center" });
				await wait(30);
				const y1 = sc.scrollTop;
				const plugin = window.__oaPlugin;
				const enabledBefore = plugin.settings.moa?.presets?.default?.enabled !== false;
				const tog = row.querySelector(".checkbox-container");
				if (!tog) return { row: true, sc: true, tog: false, y1: Math.round(y1) };
				tog.click();
				await wait(60);
				const y2 = sc.scrollTop;
				const enabledAfter = plugin.settings.moa?.presets?.default?.enabled !== false;
				return {
					sc: true, row: true, tog: true, y1: Math.round(y1), y2: Math.round(y2),
					detached: !row.isConnected,
					flipped: enabledBefore !== enabledAfter,
				};
			});
			probes.F29scroll = {
				fixed: !!(r.sc && r.row && r.tog && r.y1 > 300 && r.detached && r.flipped && Math.abs(r.y2 - r.y1) <= 4),
				r,
			};
			await page.close();
		}

		{
			/* F30 — v0.1.114 (owner: "samakan component search biar selaras"):
			   ibu dari selaras adalah TEPi yang sama. Ukur [left,right] bilah
			   search vs tabstrip vs baris konten pertama — ketiganya harus
			   berbagi tepi yang identik. Angka rect-telah-dibulatkan dilaporkan
			   mentah supaya delta mekanismenya terbaca saat merah. */
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");
			const r = await page.evaluate(() => {
				const q = (sel) => {
					const el = document.querySelector(sel);
					if (!el) return null;
					const rc = el.getBoundingClientRect();
					return [Math.round(rc.left), Math.round(rc.right)];
				};
				const search = q(".oa-settings-search");
				const strip = q(".oa-settings-tabstrip");
				const row = q(".oa-settings-content .setting-item");
				const results = q(".oa-settings-search-results") ? true : false;
				/* v0.1.118 (owner): garis halus strip hilang & gap search↔strip
				   TUNGGAL (bukan margin ganda): ukur celah vertikal nyata */
				const searchEl = document.querySelector(".oa-settings-search");
				const stripEl = document.querySelector(".oa-settings-tabstrip");
				let gap = null;
				let hairline = null;
				if (searchEl && stripEl) {
					gap = Math.round(stripEl.getBoundingClientRect().top - searchEl.getBoundingClientRect().bottom);
					hairline = getComputedStyle(stripEl).borderBottomWidth;
				}
				return { search, strip, row, results, gap, hairline };
			});
			probes.F30search = {
				fixed: !!(r.search && r.strip && r.row && r.results &&
					Math.abs(r.search[0] - r.row[0]) <= 1 && Math.abs(r.search[1] - r.row[1]) <= 1 &&
					Math.abs(r.strip[0] - r.row[0]) <= 1 && Math.abs(r.strip[1] - r.row[1]) <= 1 &&
					r.hairline === "0px" && r.gap !== null && r.gap >= 6 && r.gap <= 11),
				r,
			};
			await page.close();
		}

		{
			/* F31 — v0.1.114 (owner: "samakan component search biar selaras" =
			   search SKILL): kedua search skills (hub + installed) memakai
			   KOMPONEN yang sama dengan bilah Search settings — shell + ikon +
			   clear + has-query + Escape. Rupa dibandingkan lewat computed
			   style TERHADAP komponen induk (bukan cek string kelas), kelas
			   input lama tetap utuh, Update all tetap di kanan dan hub search
			   menyerap ruang. */
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "capabilities"), "capabilities");
			const r = await page.evaluate(async () => {
				const wait = (ms) => new Promise((res) => setTimeout(res, ms));
				const top = document.querySelector(".oa-settings-search:not(.oa-skills-search-wrap):not(.oa-hub-search-wrap)");
				const skills = document.querySelector(".oa-skills-search-wrap");
				const hub = document.querySelector(".oa-hub-search-wrap");
				if (!top || !skills || !hub) return { top: !!top, skills: !!skills, hub: !!hub };
				const parts = (w) => ({
					role: w.getAttribute("role") === "search",
					icon: !!w.querySelector(".oa-settings-search-icon"),
					clear: !!w.querySelector(".oa-settings-search-clear"),
					inputCls: !!w.querySelector(".oa-settings-search-input"),
				});
				const skIn = skills.querySelector("input.oa-skills-search");
				const hubIn = hub.querySelector("input.oa-hub-search");
				if (!skIn || !hubIn) return { top: true, skills: true, hub: true, skIn: !!skIn, hubIn: !!hubIn };
				const csT = getComputedStyle(top), csS = getComputedStyle(skills), csH = getComputedStyle(hub);
				const sameLook =
					csS.borderRadius === csT.borderRadius && csH.borderRadius === csT.borderRadius &&
					csS.borderTopWidth === csT.borderTopWidth && csH.borderTopWidth === csT.borderTopWidth &&
					csS.backgroundColor === csT.backgroundColor && csH.backgroundColor === csT.backgroundColor;
				const hT = Math.round(top.getBoundingClientRect().height);
				const hS = Math.round(skills.getBoundingClientRect().height);
				const hH = Math.round(hub.getBoundingClientRect().height);
				/* ketik → has-query + clear tampak; klik clear → kosong + class hilang */
				const setN = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
				setN.call(skIn, "pdf"); skIn.dispatchEvent(new Event("input", { bubbles: true }));
				await wait(30);
				const hasQuery = skills.classList.contains("has-query");
				const clearVis = getComputedStyle(skills.querySelector(".oa-settings-search-clear")).display !== "none";
				skills.querySelector(".oa-settings-search-clear").click();
				await wait(40);
				const cleared = skIn.value === "" && !skills.classList.contains("has-query");
				/* hub wrap flex-menyerap: tombol Update all di KANAN box */
				const hubBtn = [...document.querySelectorAll(".oa-hub-controls .oa-mini-btn")].find((b) => b.textContent === "Update all") ?? null;
				const hubRow = hub.getBoundingClientRect();
				const btnRow = hubBtn ? hubBtn.getBoundingClientRect() : null;
				const hubGrows = !!btnRow && hubRow.left < btnRow.left && hubRow.right <= btnRow.left;
				const hubFlex = getComputedStyle(hub).flexGrow;
				return {
					top: true, skills: true, hub: true, skIn: true, hubIn: true,
					pSkills: parts(skills), pHub: parts(hub), sameLook,
					heights: [hT, hS, hH], sameHeight: Math.abs(hT - hS) <= 1 && Math.abs(hS - hH) <= 1,
					hasQuery, clearVis, cleared, hubGrows, hubFlex,
				};
			});
			probes.F31skills = {
				fixed: !!(r.top && r.skills && r.hub && r.skIn && r.hubIn &&
					r.pSkills?.role && r.pSkills?.icon && r.pSkills?.clear && r.pSkills?.inputCls &&
					r.pHub?.role && r.pHub?.icon && r.pHub?.clear && r.pHub?.inputCls &&
					r.sameLook && r.sameHeight && r.hasQuery && r.clearVis && r.cleared &&
					r.hubGrows && r.hubFlex === "1"),
				r,
			};
			await page.close();
		}

		{
			/* F32 — v0.1.116 (owner: "text area kita bisa gak fungsinya kayak
			   markdown editor, jadi bisa pakai fungsi tab dll" → paket LENGKAP):
			   satu mesin markdown-keys di SEMUA stackedTextArea. Saksi hidup di
			   Custom system prompt (pane advanced): indent/outdent multi-baris
			   dengan jangkar seleksi benar, Enter melanjutkan bullet/checkbox/
			   nomor/quote & keluar di item kosong, auto-tutup pasangan + batas
			   kata, skip-over, Backspace pasangan kosong, bungkus seleksi, dan
			   (v0.1.117) DETEKTOR KEBOCORAN: tak satu pun event input boleh
			   mendarat di elemen lain (kasus owner: pasangan bocor ke composer). */
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "advanced"), "advanced");
			const r = await page.evaluate(() => {
				const ta = document.querySelector('textarea[aria-label="Custom system prompt"]');
				if (!ta) return { ta: false };
				const SET = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
				const set = (v, s0, e0 = s0) => {
					SET.call(ta, v);
					ta.dispatchEvent(new Event("input", { bubbles: true }));
					ta.setSelectionRange(s0, e0);
				};
				const key = (k, shift = false) =>
					ta.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
				ta.focus();
				/* v0.1.117 (owner: "simbol [] () ikut muncul di composer"):
				   detektor kebocoran — SEMUA event input di dokumen dicatat; satu-
				   satunya target SAH selama pengujian adalah ta itu sendiri */
				const leakTargets = [];
				document.addEventListener("input", (e) => {
					if (e.target !== ta) {
						const t2 = e.target;
						leakTargets.push(t2.tagName + "." + String(t2.className ?? "").slice(0, 40));
					}
				}, true);
				set("- satu", 6); key("Tab");
				const tabIndent = ta.value === "- satu  " && ta.selectionStart === 8;
				set("aa\n\nbb", 0, 6); key("Tab");
				const tabMulti = ta.value === "  aa\n\n  bb" && ta.selectionStart === 2 && ta.selectionEnd === 10;
				key("Tab", true);
				const shiftTabMulti = ta.value === "aa\n\nbb" && ta.selectionStart === 0 && ta.selectionEnd === 6;
				set("abc", 1);
				const evFree = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
				ta.dispatchEvent(evFree);
				const tabFallsThrough = evFree.defaultPrevented === false && ta.value === "abc";
				set("- satu", 6); key("Enter");
				const enterBullet = ta.value === "- satu\n- " && ta.selectionStart === 9;
				key("Enter");
				const enterExit = ta.value === "- satu\n" && ta.selectionStart === 7;
				set("- [x] selesai", 13); key("Enter");
				const enterCheck = ta.value === "- [x] selesai\n- [ ] ";
				set("2. kedua", 8); key("Enter");
				const enterNum = ta.value === "2. kedua\n3. " && ta.selectionStart === 12;
				set("> q", 3); key("Enter");
				const enterQuote = ta.value === "> q\n> ";
				set("teks", 4); key("(");
				const pairOpen = ta.value === "teks()" && ta.selectionStart === 5;
				set("teks", 2); key("(");
				const midWordNoPair = ta.value === "teks" && ta.selectionStart === 2;
				set("()", 1); key(")");
				const skipOver = ta.value === "()" && ta.selectionStart === 2;
				set("()", 1); key("Backspace");
				const pairDelete = ta.value === "" && ta.selectionStart === 0;
				set("kata", 0, 4); key('"');
				const wrap = ta.value === '"kata"' && ta.selectionStart === 1 && ta.selectionEnd === 5;
				set("", 0);
				const noLeak = leakTargets.length === 0;
				return {
					ta: true, tabIndent, tabMulti, shiftTabMulti, tabFallsThrough,
					enterBullet, enterExit, enterCheck, enterNum, enterQuote,
					pairOpen, midWordNoPair, skipOver, pairDelete, wrap,
					noLeak, leakTargets: leakTargets.slice(0, 3),
				};
			});
			probes.F32mdkeys = {
				fixed: !!(r.ta && r.tabIndent && r.tabMulti && r.shiftTabMulti && r.tabFallsThrough &&
					r.enterBullet && r.enterExit && r.enterCheck && r.enterNum && r.enterQuote &&
					r.pairOpen && r.midWordNoPair && r.skipOver && r.pairDelete && r.wrap && r.noLeak),
				r,
			};
			await page.close();
		}

		/* F37 — v0.1.140 Settings textarea paint. Exercise every textarea
		   rendered by the populated Capabilities, Automations and Advanced
		   pages, plus the profile SOUL editor after a real Edit click. For each
		   field, hover=active=focus uses the neutral border token with no inner
		   shadow/outline; keyboard focus and each field's original resize affordance remain intact. This deliberately
		   excludes Quick Ask and modal editors from the Settings-only contract. */
		{
			const paintKeys = [
				"backgroundColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
				"borderTopStyle", "borderTopWidth", "boxShadow", "outlineStyle", "outlineWidth",
			];
			const paint = async (locator) => locator.evaluate((el, keys) => {
				const cs = getComputedStyle(el);
				return Object.fromEntries(keys.map((key) => [key, cs[key]]));
			}, paintKeys);
			const auditPageTextareas = async (section, prepare) => {
				const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, section), section);
				if (prepare) await prepare(page);
				/* app.css clips the workspace body; like the evidence pass, expose
				   the full settings section so Playwright can hit real :hover. */
				const fullH = await page.evaluate(() => document.body.scrollHeight);
				if (fullH > 820) {
					await page.setViewportSize({ width: 760, height: Math.min(fullH + 40, 12000) });
					await page.waitForTimeout(80);
				}
				const fields = page.locator(".oa-settings textarea");
				const count = await fields.count();
				const results = [];
				for (let i = 0; i < count; i++) {
					const field = fields.nth(i);
					await field.evaluate((el) => el.blur());
					await page.mouse.move(0, 0);
					const rest = await paint(field);
					await field.hover();
					await page.waitForTimeout(220); // settle app.css's 150 ms border transition
					const hover = await paint(field);
					await page.mouse.down();
					await page.waitForTimeout(220);
					const active = await paint(field);
					await page.mouse.up();
					await page.waitForTimeout(220);
					const focus = await paint(field);
					const meta = await field.evaluate((el) => {
						const resolveColor = (value) => {
							const probe = document.createElement("span");
							probe.style.color = value;
							document.body.appendChild(probe);
							const color = getComputedStyle(probe).color;
							probe.remove();
							return color;
						};
						const kind = el.classList.contains("oa-mcp-import-text")
							? "mcp-import"
							: el.classList.contains("oa-profile-soul")
							? "profile-soul"
							: el.closest(".setting-item.oa-has-stacked")
							? "stacked"
							: "unknown";
						return {
							kind,
							className: el.className,
							ariaLabel: el.getAttribute("aria-label"),
							placeholder: el.getAttribute("placeholder"),
							focused: document.activeElement === el,
							resize: getComputedStyle(el).resize,
							tabIndex: el.tabIndex,
							accent: resolveColor("var(--interactive-accent)"),
							neutralBase: resolveColor("var(--background-modifier-border)"),
							neutralHover: resolveColor("var(--background-modifier-border-hover)"),
						};
					});
					const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
					const backgroundStayedCalm = rest.backgroundColor === hover.backgroundColor;
					const neutralColors = new Set([meta.neutralBase, meta.neutralHover]);
					const neutralBorder = [focus.borderTopColor, focus.borderRightColor, focus.borderBottomColor, focus.borderLeftColor]
						.every((color) => neutralColors.has(color) && color !== meta.accent);
					const noFocusChrome = focus.boxShadow === "none" &&
						(focus.outlineStyle === "none" || focus.outlineWidth === "0px");
					const resizePreserved = meta.kind === "profile-soul" ? meta.resize === "both" : meta.resize === "vertical";
					results.push({
						...meta,
						fixed:
							same(hover, active) && same(hover, focus) && backgroundStayedCalm && neutralBorder && noFocusChrome &&
							meta.focused && resizePreserved && meta.tabIndex >= 0,
						backgroundStayedCalm, neutralBorder, noFocusChrome, resizePreserved,
						rest, hover, active, focus,
					});
				}
				await page.close();
				return results;
			};

			const capabilities = await auditPageTextareas("capabilities");
			const automations = await auditPageTextareas("automations");
			const advanced = await auditPageTextareas("advanced");
			const profiles = await auditPageTextareas("profiles", async (page) => {
				await page.locator('button[aria-label^="Edit profile"]').nth(1).click();
				await page.waitForTimeout(80);
			});
			const all = [...capabilities, ...automations, ...advanced, ...profiles];
			const classesCovered = ["mcp-import", "profile-soul", "stacked"].every((kind) =>
				all.some((x) => x.kind === kind)
			);
			probes.F37settingsTextareas = {
				fixed:
					capabilities.length > 0 && automations.length > 0 && advanced.length > 0 && profiles.length > 0 &&
					classesCovered && all.every((x) => x.fixed),
				classesCovered,
				counts: {
					capabilities: capabilities.length,
					automations: automations.length,
					advanced: advanced.length,
					profiles: profiles.length,
				},
				fields: all,
			};
		}

		/* F38 — v0.1.154 command drag-reorder: every snippet row carries a
		   draggable grip handle while its up/down arrows stay present (the
		   keyboard/mobile path). Real-DOM proof, not source grep. */
		{
			const { page: cmdPage } = await openPage(browser, shell(bundleText, refCss, pluginCss, "command"), "command");
			const dragMarkup = await cmdPage.evaluate(() => {
				const rows = [...document.querySelectorAll(".oa-snippet-row")];
				const grips = [...document.querySelectorAll(".oa-snippet-row .oa-cmd-grip")];
				return {
					rows: rows.length,
					grips: grips.length,
					allDraggable: grips.every((g) => g.getAttribute("draggable") === "true"),
					arrowsKept: rows.every((r) => r.querySelectorAll(".oa-cmd-order button").length === 2),
					orderFirst: rows.every((r) => r.firstElementChild?.classList.contains("oa-cmd-grip")),
				};
			});
			await cmdPage.close();
			probes.F38cmdDrag = {
				fixed:
					dragMarkup.rows > 0 &&
					dragMarkup.grips === dragMarkup.rows &&
					dragMarkup.allDraggable &&
					dragMarkup.arrowsKept &&
					dragMarkup.orderFirst,
				...dragMarkup,
			};
		}

		/* F39 — v0.1.155 surfaces-in-modal: the command row keeps no inline
		   toggle column (which squeezed the title to 0px at 560px) — the
		   title is readable again and a "Shows in:" summary is present. */
		{
			const { page: cmdPage } = await openPage(browser, shell(bundleText, refCss, pluginCss, "command"), "command");
			const surf = await cmdPage.evaluate(() => {
				const rows = [...document.querySelectorAll(".oa-snippet-row")];
				const first = rows[0];
				if (!first) return { rows: 0 };
				const title = first.querySelector(".oa-snippet-title");
				const summary = first.querySelector(".oa-snippet-surfaces");
				return {
					rows: rows.length,
					noInlineFlags: document.querySelectorAll(".oa-cmd-flags").length === 0,
					titleW: title ? Math.round(title.getBoundingClientRect().width) : -1,
					summary: summary ? summary.textContent : null,
				};
			});
			await cmdPage.close();
			probes.F39cmdSurfaces = {
				fixed:
					surf.rows > 0 &&
					surf.noInlineFlags &&
					surf.titleW > 80 &&
					typeof surf.summary === "string" &&
					surf.summary.startsWith("Shows in:"),
				...surf,
			};
		}

		/* F40 — v0.1.156: the snippet tips card sits at the TOP of the edit
		   modal, carries a lightbulb icon (svg), and reads as a card (hairline
		   border). Real-DOM proof of order + visuals. */
		{
			const { page: cmdPage } = await openPage(browser, shell(bundleText, refCss, pluginCss, "command"), "command");
			await cmdPage.evaluate(() => {
				const add = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Add command");
				add?.click();
			});
			await cmdPage.waitForTimeout(300);
			await cmdPage.locator(".oa-confirm-modal").screenshot({ path: resolve(here, "shots", "snippet-modal.png") });
			const tip = await cmdPage.evaluate(() => {
				const modal = document.querySelector(".oa-confirm-modal");
				const tips = modal?.querySelector(".oa-snippet-tips");
				if (!tips) return { open: !!modal };
				const rect = tips.getBoundingClientRect();
				const cs = getComputedStyle(tips);
				/* first element after the h3 heading = tips card at top */
				const head = modal.querySelector("h3");
				const order = head && head.nextElementSibling === tips;
				return {
					open: !!modal,
					present: true,
					atTop: order,
					iconSvg: !!tips.querySelector(".oa-snippet-tips-icon svg"),
					border: cs.borderTopWidth !== "0px" && cs.borderTopStyle === "solid",
					width: Math.round(rect.width),
				};
			});
			await cmdPage.close();
			probes.F40snippetTips = {
				fixed:
					tip.open === true &&
					tip.present === true &&
					tip.atTop === true &&
					tip.iconSvg === true &&
					tip.border === true &&
					tip.width > 200,
				...tip,
			};
		}

		/* F41 — v0.1.157 Skeleton: the shimmer rows render in a real browser
		   (wiring is pinned by smoke v0.1.157 — this probe pins the VISUAL
		   contract: line geometry, pulse animation, reduced-motion fallback). */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "command"), "command");
			await page.evaluate(() => {
				/* append INSIDE .oa-settings — the skeleton rules are scoped
				   to that ancestor, so injecting outside it renders 0-height */
				const host = document.querySelector(".oa-settings") ?? document.getElementById("sim-frame");
				const sk = document.createElement("div");
				sk.className = "oa-skeleton";
				for (let i = 0; i < 3; i++) {
					const row = document.createElement("div");
					row.className = "oa-skeleton-row";
					const main = document.createElement("div");
					main.className = "oa-skeleton-line is-main";
					const sub = document.createElement("div");
					sub.className = "oa-skeleton-line is-sub";
					row.append(main, sub);
					sk.appendChild(row);
				}
				host.appendChild(sk);
			});
			await page.waitForTimeout(120);
			const read = () =>
				page.evaluate(() => {
					const rows = [...document.querySelectorAll(".oa-skeleton-row")];
					const main = document.querySelector(".oa-skeleton-line.is-main");
					const sub = document.querySelector(".oa-skeleton-line.is-sub");
					const sk = document.querySelector(".oa-skeleton");
					const line = (el) => {
						if (!el) return null;
						const r = el.getBoundingClientRect();
						return { w: Math.round(r.width), h: Math.round(r.height), anim: getComputedStyle(el).animationName, radius: getComputedStyle(el).borderRadius };
					};
					return { rows: rows.length, main: line(main), sub: line(sub), width: Math.round(sk.getBoundingClientRect().width) };
				});
			const normal = await read();
			await page.emulateMedia({ reducedMotion: "reduce" });
			const reduced = await read();
			await page.locator(".oa-skeleton").screenshot({ path: resolve(here, "shots", "skeleton.png") });
			await page.close();
			probes.F41skeleton = {
				fixed:
					normal.rows === 3 &&
					normal.main && normal.main.w > 0 && normal.main.h > 0 && normal.main.anim === "oa-skeleton-pulse" &&
					normal.sub && normal.sub.h < normal.main.h &&
					reduced.main && reduced.main.anim === "none",
				normal,
				reduced,
			};
		}

		/* F49 — v0.1.154: grouping shells are gone. Named subsections sit as
		   direct children of the content pane again; MCP servers remain object
		   cards; scheduled tasks are not wrapped in a group shell. */
		{
			const { page: capPage } = await openPage(browser, shell(bundleText, refCss, pluginCss, "capabilities"), "capabilities");
			const capabilities = await capPage.evaluate(() => {
				const groups = [...document.querySelectorAll(".oa-settings-group")];
				const mcp = document.querySelector(".oa-mcp-server");
				const cs = (el) => el ? getComputedStyle(el) : null;
				return {
					groups: groups.length,
					mcpInGroup: !!mcp?.closest(".oa-settings-group"),
					mcpBorder: cs(mcp)?.borderTopWidth ?? null,
					mcpRadius: cs(mcp)?.borderTopLeftRadius ?? null,
					looseSubsections: [...document.querySelectorAll(".oa-settings-content > .oa-subsection")].length,
				};
			});
			await capPage.close();

			const { page: cronPage } = await openPage(browser, shell(bundleText, refCss, pluginCss, "automations"), "automations");
			const cron = await cronPage.evaluate(() => {
				const task = document.querySelector(".oa-cron-task");
				const group = task?.closest(".oa-settings-group");
				return {
					taskPresent: !!task,
					taskInGroup: !!group,
				};
			});
			await cronPage.close();
			probes.F49settingsGroups = {
				fixed:
					capabilities.groups === 0 &&
					capabilities.looseSubsections >= 5 &&
					capabilities.mcpInGroup === false &&
					capabilities.mcpBorder !== "0px" && capabilities.mcpRadius !== "0px" &&
					cron.taskPresent && cron.taskInGroup === false,
				capabilities,
				cron,
			};
		}

		/* F50 — v0.1.157 (owner directive 2026-08-31): MCP server card text
		   fields stack full-width below their labels. Command/Arguments
		   (stdio card) and URL (http card) used to be narrow right-aligned
		   control-column inputs that truncated long values; they now share
		   the oa-has-stacked treatment of Environment/Headers — input is a
		   direct child of the setting-item, sits below the info block, and
		   spans the card's content width. */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "capabilities"), "capabilities");
			probes.F50mcpStackedFields = await page.evaluate(() => {
				const cards = [...document.querySelectorAll(".oa-mcp-server")];
				const row = (card, name) => {
					const el = [...card.querySelectorAll(".setting-item")].find(
						(s) => s.querySelector(".setting-item-name")?.textContent?.trim() === name
					);
					if (!el) return null;
					const input = el.querySelector(":scope > input[type=\"text\"]");
					const info = el.querySelector(".setting-item-info");
					if (!input || !info) return { stacked: el.classList.contains("oa-has-stacked"), hasInput: !!input, belowInfo: false, flush: false };
					const r = input.getBoundingClientRect();
					const i = info.getBoundingClientRect();
					const se = el.getBoundingClientRect();
					return {
						stacked: el.classList.contains("oa-has-stacked"),
						hasInput: true,
						belowInfo: r.top >= i.bottom - 2,
						flush: Math.abs(r.left - se.left - 16) <= 4 && Math.abs(se.right - 16 - r.right) <= 4 && r.width >= se.width - 44,
					};
				};
				const stdio = cards.find((c) => [...c.querySelectorAll(".setting-item-name")].some((n) => n.textContent?.trim() === "Command"));
				const http = cards.find((c) => [...c.querySelectorAll(".setting-item-name")].some((n) => n.textContent?.trim() === "URL"));
				const cmd = stdio ? row(stdio, "Command") : null;
				const args = stdio ? row(stdio, "Arguments") : null;
				const url = http ? row(http, "URL") : null;
				const ok = (p) => !!p && p.stacked && p.hasInput && p.belowInfo && p.flush;
				return { cmd, args, url, fixed: ok(cmd) && ok(args) && ok(url) };
			});
			await page.close();
		}

		/* F42 — v0.1.159 TokenTag: the statusbar token pill renders its
		   context-window bar (2px), the fill obeys inline width, and the
		   overload state paints text+fill red. Static markup probe (the
		   wiring lives in ChatApp and is pinned by smoke v0.1.159). */
		{
			const { page } = await openPage(browser, shell(bundleText, refCss, pluginCss, "general"), "general");
			await page.evaluate(() => {
				const host = document.getElementById("sim-frame");
				const app = document.createElement("div");
				app.className = "oa-app";
				app.innerHTML =
					'<div class="oa-statusbar"><span class="oa-statusbar-item oa-token-tag">' +
					'<span class="oa-token-tag-text">↑1.2k ↓3.1k · 60%</span>' +
					'<span class="oa-token-bar" aria-hidden="true"><span class="oa-token-bar-fill" style="width:60%"></span></span>' +
					'</span>' +
					'<span class="oa-statusbar-item oa-token-tag is-over">' +
					'<span class="oa-token-tag-text">↑4.5k ↓1.0k · 112%</span>' +
					'<span class="oa-token-bar" aria-hidden="true"><span class="oa-token-bar-fill" style="width:100%"></span></span>' +
					'</span></div>';
				host.appendChild(app);
			});
			const read = () =>
				page.evaluate(() => {
					const g = (sel) => {
						const el = document.querySelector(sel);
						if (!el) return null;
						const r = el.getBoundingClientRect();
						const cs = getComputedStyle(el);
						return { w: Math.round(r.width), h: Math.round(r.height), color: cs.color, bg: cs.backgroundColor };
					};
					return { bar: g(".oa-token-bar"), fill: g(".oa-token-bar-fill"), overText: g(".oa-token-tag.is-over .oa-token-tag-text"), overFill: g(".oa-token-tag.is-over .oa-token-bar-fill") };
				});
			const tk = await read();
			await page.locator(".oa-token-tag").first().screenshot({ path: resolve(here, "shots", "token-tag.png") });
			await page.close();
			probes.F42tokenTag = {
				fixed:
					!!tk.bar && tk.bar.h === 2 && tk.bar.w > 0 &&
					!!tk.fill && tk.fill.w < tk.bar.w &&
					!!tk.overFill && !!tk.overText && tk.overText.color !== "rgb(0, 0, 0)",
				...tk,
			};
		}

	} finally {
		await browser.close();
	}
	/* Witness write policy (run 32653162333 fix): this JSON is a TRACKED file,
	   and the release pipeline asserts a clean tracked tree. Every run still
	   records its full timestamped result in the ignored sidecar under out/;
	   the tracked witness itself is only rewritten by the pure planner — and a
	   release run (OA_RELEASE_WITNESS=readonly, set by scripts/release.mjs)
	   never touches it, so `npm run release` can never dirty the tree it is
	   about to certify. */
	const now = new Date().toISOString();
	const witnessPath = resolve(here, "settings-audit-probes.json");
	mkdirSync(resolve(here, "out"), { recursive: true });
	writeFileSync(resolve(here, "out", "settings-audit-probes.json"), JSON.stringify({ at: now, probes }, null, 2));
	const readonlyWitness = process.env.OA_RELEASE_WITNESS === "readonly";
	const plan = planSettingsWitnessUpdate({
		trackedJson: existsSync(witnessPath) ? readFileSync(witnessPath, "utf8") : null,
		freshProbes: probes,
		readonly: readonlyWitness,
		now,
	});
	if (plan.writeTracked) writeFileSync(witnessPath, plan.trackedText);
	if (plan.notice) console.warn(`settings-witness: ${plan.notice}`);
	console.log("\n[probes]");
	for (const [k, v] of Object.entries(probes)) console.log(`  ${k}: ${JSON.stringify(v)}`);
	/* v0.1.53 gate (graduated to the release pipeline): the run is recorded
	   first (sidecar always; tracked witness per policy), then any red probe
	   fails the step loudly. */
	const redProbes = Object.entries(probes).filter(([, v]) => v && v.fixed === false);
	if (redProbes.length > 0) {
		console.error(`✗ settings audit probes FAILED: ${redProbes.map(([k]) => k).join(", ")}`);
		process.exit(1);
	}
	console.log(`\nsettings-preview shots: ${SECTIONS.map((s) => `settings-${s}.png`).join(", ")}`);
}

main().catch((e) => {
	console.error("settings-preview failed:", e.message ?? e);
	process.exit(1);
});
