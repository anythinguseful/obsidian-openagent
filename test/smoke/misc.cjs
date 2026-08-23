/**
 * Smoke guards that belong to no single UI surface: workspace relocation
 * behaviour, tooltip hygiene, control-character hygiene, the radius
 * certification, and the two bundle-size/minify guards.
 *
 * Moved from test/smoke.test.cjs in Phase 11, the final cluster of the
 * smoke/harness split. Guard conditions and messages are unchanged; only the
 * enclosing function, one level of indentation, and the path anchor differ.
 *
 * TESTDIR exists for the guards that build paths dynamically, e.g.
 * path.join(__dirname, p) where p is a loop variable. Those cannot be
 * re-anchored per path the way read() calls are, so instead of guessing an
 * anchor they keep their original semantics: in the monolith __dirname was
 * the test/ directory, and TESTDIR is exactly that. Anything with a literal,
 * knowable path uses the repo-root read() from the harness instead.
 */

const { ROOT, read, fs, path, plugin } = require("./harness.cjs");

// The monolith's __dirname. Only for dynamically composed paths -- prefer
// read() whenever the path is a literal, so check-docs guard 1 can see it.
const TESTDIR = path.join(ROOT, "test");

// Async because the workspace-relocation guard awaits plugin.activateView().
// The orchestrator is an async IIFE, so it awaits this call.
module.exports = async function miscGuards() {
	let failed = 0;

	{
		const events = [];
		const leftSplit = {};
		const rightSplit = {};
		let detached = false;
		let openedOn = null;
		const existingLeaf = {
			getRoot: () => rightSplit,
			getViewState: () => ({ type: "openagent-chat", state: {}, active: true }),
			detach: () => {
				detached = true;
			},
			/* v0.1.163: relocation captures the live session id first */
			view: { getCurrentSessionId: () => "sess-42" },
		};
		const ws = plugin.app.workspace;
		const savedLeaves = ws.getLeavesOfType;
		const savedReveal = ws.revealLeaf;
		ws.leftSplit = leftSplit;
		ws.rightSplit = rightSplit;
		ws.getLeavesOfType = () => [existingLeaf];
		ws.getLeftLeaf = () => ({
			setViewState: async () => {
				openedOn = "left";
			},
		});
		ws.getLeaf = () => ({
			setViewState: async () => {
				openedOn = "main";
			},
		});
		ws.getRightLeaf = () => ({
			setViewState: async () => {
				openedOn = "right";
			},
		});
		ws.revealLeaf = (leaf) => events.push(leaf === existingLeaf ? "existing" : "target");

		plugin.settings.chatLeafLocation = "left";
		await plugin.activateView();
		const moved = detached && openedOn === "left" && events.length === 1 && events[0] === "target";
		/* the conversation survives the move: captured id is handed back */
		const captured = plugin.consumePendingChatSessionId();

		detached = false;
		openedOn = null;
		events.length = 0;
		plugin.settings.chatLeafLocation = "right";
		await plugin.activateView();
		const stays = !detached && openedOn === null && events.length === 1 && events[0] === "existing";

		ws.getLeavesOfType = savedLeaves;
		ws.revealLeaf = savedReveal;
		delete ws.leftSplit;
		delete ws.rightSplit;

		if (moved && stays && captured === "sess-42") {
			console.log("✓ v0.1.162 behavioural: existing chat MOVES to the configured location; same-region reveals in place; session id captured for restore");
		} else {
			console.error(`✗ v0.1.162 behavioural relocation failed (moved=${moved}, stays=${stays}, captured=${captured}, events=${events.join(",")}, openedOn=${openedOn})`);
			failed++;
		}
	}
	{
		const files = ["../src/ui/ChatApp.tsx"].concat(
			fs
				.readdirSync(path.join(ROOT, "src", "ui", "components"))
				.filter((f) => f.endsWith(".tsx"))
				.map((f) => `../src/ui/components/${f}`)
		);
		const offenders = files.filter((p) =>
			(fs.readFileSync(path.join(TESTDIR, p), "utf8").match(/<[^>]*>/g) ?? []).some(
				(tag) => tag.includes("title=") && tag.includes("aria-label=")
			)
		);
		if (offenders.length === 0) {
			console.log("✓ tooltip hygiene: no element carries title= together with aria-label= (no double tips)");
		} else {
			console.error(`✗ title= + aria-label= on one element (double tooltip): ${offenders.join(", ")}`);
			failed++;
		}
	}
	{
		const walk = (dir) =>
			fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
				e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") || e.name.endsWith(".tsx") ? [path.join(dir, e.name)] : []
			);
		const offenders = walk(path.join(ROOT, "src")).filter((f) => /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(fs.readFileSync(f, "utf8")));
		if (offenders.length === 0) {
			console.log("✓ lesson-31: no raw control characters in src/ (escape-text only)");
		} else {
			console.error(`✗ lesson-31 raw control characters in: ${offenders.join(", ")}`);
			failed++;
		}
	}
	{
		const css = read("styles.css");
		const ok = { s: "4", m: "8", l: "12" };
		const found = [...css.matchAll(/var\(--radius-([sml]), (\d+)px\)/g)];
		const bad = found.filter((m) => ok[m[1]] !== m[2]);
		if (
			bad.length === 0 &&
			found.length >= 20 &&
			/\.oa-app \.oa-msg-action \{[\s\S]{0,400}?border-radius: var\(--radius-s/.test(css) &&
			css.includes(".oa-app .oa-attach-toggle { border-radius: 999px; }") &&
			/\.oa-app \.oa-prompt-action \{[\s\S]{0,700}?border-radius: 999px;/.test(css)
		) {
			console.log("✓ radius certification: all fallbacks official (s4/m8/l12) · msg-action family kept · composer circles intact");
		} else {
			console.error("✗ radius certification drifted", bad.map((m) => m[0]).join(","));
			failed++;
		}
	}
	{
		const cfg = read("esbuild.config.mjs");
		const size = read("main.js").length;
		const ok =
			cfg.includes("minify: prod ? true : false") &&
			!cfg.includes("es.drop") && !cfg.includes("\tdrop:") && // jalur debugMode menjaga console.* nya — opsi pelempar-log tak boleh masuk
			size > 100000 &&
			size < 1200000 && // v0.1.145 Workspace enforcement adds policy/provenance guards; keep the minified bundle below 1.2 MB
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.128: production minify aktif · main.js terjepit < 2,3 MB (dry-run 1,93 MB dari 5,40 MB) · console debugMode tidak di-drop");
		} else {
			console.error(`✗ v0.1.128 minify regressed (main.js ${size} B)`);
			failed++;
		}
	}
	{
		const rel = read("scripts/release.mjs");
		const css = read("styles.css");
		const ok =
			rel.includes("CSS_SENTINELS") &&
			rel.includes('loader: "css"') &&
			rel.includes("minify: true") &&
			rel.includes("minifyCssForZip(join(root, f)") &&
			rel.includes("(zip-minified, sentinel-verified)") &&
			css.includes("QUICK ASK FIELD RESET") && // komentar sumber bertahan = repo styles.css TIDAK ikut terminify
			css.includes(".oa-selbar .oa-selbar-btn {") && // aturan selbar asli tetap di selector nyata (v0.1.102)
			css.includes("\n") && // layout multi-baris utuh
			read("manifest.json").includes('"version": "0.1.151"');
		if (ok) {
			console.log("✓ v0.1.131: styles.css zip-only minify + sentinel verify · repo tetap readable · audit CSS 43/43 tuntas false-positive");
		} else {
			console.error("✗ v0.1.131 zip-only css minify regressed");
			failed++;
		}
	}

	return failed;
};
