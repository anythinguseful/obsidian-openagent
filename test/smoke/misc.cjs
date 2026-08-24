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

const { ROOT, read, region, regionFrom, fs, path, plugin, obsidianMock } = require("./harness.cjs");

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

	/* v0.1.195 (Lesson 195) — META-GUARD: the smoke lane must never slice a
	   region with a raw indexOf again.

	   The bug this closes: `x.slice(x.indexOf(A), x.indexOf(B))` returns a
	   WRONG-BUT-PLAUSIBLE region when A is missing, because indexOf gives -1
	   and slice reads -1 as "one char before EOF". Three live guards were
	   measuring garbage and still reporting green — settings.cjs genSection
	   was "" (so every `!genSection.includes(...)` arm was vacuously true),
	   settings.cjs safetySection ran 141099 chars across 73 methods, and
	   styles.cjs `anchor` was "" because its end marker's first occurrence
	   sat 65k chars BEFORE the start marker.

	   A guard that silently stops testing is worse than no guard: it spends
	   the trust of a green check. region()/regionFrom() in harness.cjs throw
	   on a missing marker, and this block keeps the raw idiom from returning.
	   The scan is textual and deliberately narrow: `v.slice(v.indexOf(` with
	   the SAME identifier on both sides, which is exactly the broken shape. */
	{
		const laneDir = path.join(ROOT, "test", "smoke");
		const lane = fs
			.readdirSync(laneDir)
			.filter((f) => f.endsWith(".cjs"))
			.sort();
		const rawIdiom = /(\w+)\.slice\(\s*\1\.indexOf\(/;
		const offenders = [];
		for (const f of lane) {
			const body = fs.readFileSync(path.join(laneDir, f), "utf8");
			/* Prose describing the anti-pattern must not trip the scan — this
			   block and harness.cjs both spell the idiom out. Blank the
			   comments while PRESERVING newlines, so reported line numbers
			   still point at the real offender. (Same intent as the
			   comment-stripping recipe the heading-order guard uses; a
			   line-prefix test is not enough because a continuation line of a
			   block comment starts with neither // nor *.) */
			const code = body
				.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
				.replace(/(^|[^:])\/\/.*$/gm, (m, p) => p + " ".repeat(m.length - p.length));
			code.split("\n").forEach((line, i) => {
				if (rawIdiom.test(line)) offenders.push(`${f}:${i + 1}`);
			});
		}
		/* Test the replacements by CALLING them, not by matching their source.
		   A text match is too weak here and I proved it: turning region()'s
		   first `throw` into `return ""` left the suite green, because the
		   same message string still appeared in regionFrom() and the throw
		   count stayed above the threshold. A guard for fail-loud behaviour
		   has to observe the behaviour. */
		const throws = (fn) => {
			try {
				fn();
				return false;
			} catch {
				return true;
			}
		};
		const body = "AAA start MIDDLE end ZZZ";
		const ok =
			offenders.length === 0 &&
			/* happy path still returns the region between the markers */
			region(body, "start", "end") === "start MIDDLE " &&
			regionFrom(body, "MIDDLE") === "MIDDLE end ZZZ" &&
			/* a missing marker must THROW, never yield a plausible-looking
			   slice — this is the whole point of Lesson 195 */
			throws(() => region(body, "nope", "end")) &&
			throws(() => region(body, "start", "nope")) &&
			throws(() => regionFrom(body, "nope")) &&
			/* the end marker is searched only AFTER the start, so a marker
			   that also occurs earlier cannot produce a reversed range
			   (the styles.cjs .oa-attach-anchor bug) */
			throws(() => region("end AAA start MIDDLE", "start", "end")) &&
			region("end AAA start MIDDLE end", "start", "end") === "start MIDDLE ";
		if (ok) {
			console.log("✓ v0.1.195: smoke lane has no raw indexOf region slices · region()/regionFrom() throw on a missing marker (Lesson 195)");
		} else {
			console.error(
				`✗ v0.1.195 raw indexOf region slice returned (or harness region() weakened)${
					offenders.length ? ` — offenders: ${offenders.join(", ")}` : ""
				}`,
			);
			failed++;
		}
	}

	// v0.1.197 (error/bug sweep 2026-08-24, finding T1): Obsidian runs in a
	// webview, so navigator.clipboard.writeText() rejects whenever the document
	// is unfocused or the host blocks the async Clipboard API. A bare .then()
	// makes a failed copy look exactly like a successful one and the user
	// pastes stale content. The repo had drifted into THREE hand-written
	// fallbacks plus two call sites with none; src/ui/clipboard.ts is now the
	// single sanctioned path. Anything else reaching for writeText directly is
	// a regression -- except ChatApp's copySelection, whose fallback runs
	// execCommand against the live highlight (routing it through copyText
	// would clear the very selection it is copying).
	{
		const walk = (dir) =>
			fs
				.readdirSync(dir, { withFileTypes: true })
				.flatMap((e) =>
					e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") || e.name.endsWith(".tsx") ? [path.join(dir, e.name)] : []
				);
		const SANCTIONED = ["src/ui/clipboard.ts", "src/ui/ChatApp.tsx"];
		const srcFiles = walk(path.join(ROOT, "src"));
		const offenders = [];
		for (const f of srcFiles) {
			const rel = path.relative(ROOT, f).split(path.sep).join("/");
			if (SANCTIONED.includes(rel)) continue;
			const body = fs.readFileSync(f, "utf8");
			// strip comments so this guard's own prose cannot trip it (Lesson 195)
			const code = body
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.split("\n")
				.filter((l) => !/^\s*(\/\/|\*)/.test(l))
				.join("\n");
			if (/navigator\.clipboard/.test(code)) offenders.push(rel);
		}

		// The module must actually carry BOTH paths and report rather than throw.
		// Read it comment-stripped: this file's own docstring names execCommand,
		// and an uncommented read would satisfy the check from prose alone --
		// the exact failure mode the v0.1.195 meta-guard was written for.
		const canon = read("src/ui/clipboard.ts")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.split("\n")
			.filter((l) => !/^\s*(\/\/|\*)/.test(l))
			.join("\n");
		const canonSound =
			canon.includes("navigator.clipboard.writeText(text)") &&
			canon.includes('document.execCommand("copy")') &&
			/Promise<boolean>/.test(canon) &&
			/return true/.test(canon) &&
			/return false/.test(canon);
		// the two call sites the sweep found must consume the boolean, not assume success
		const cb = read("src/ui/components/code-block.tsx");
		const msg = read("src/ui/components/message.tsx");
		const consumers =
			cb.includes("copyText(code)") &&
			msg.includes("copyText(getText())") &&
			/if \(!ok \|\| !mounted\.current\) return;/.test(cb) &&
			/if \(!ok \|\| !mounted\.current\) return;/.test(msg);
		// a scanner that walks nothing passes vacuously -- floor + named canary
		const enoughFiles = srcFiles.length >= 100;

		if (offenders.length === 0 && canonSound && consumers && enoughFiles) {
			console.log(
				`✓ v0.1.197: clipboard has one sanctioned path — ${srcFiles.length} source files scanned, no raw navigator.clipboard outside ui/clipboard.ts + ChatApp copySelection`
			);
		} else {
			if (offenders.length) console.error(`✗ v0.1.197 raw navigator.clipboard outside the sanctioned path: ${offenders.join(", ")}`);
			if (!canonSound) console.error("✗ v0.1.197 src/ui/clipboard.ts lost its async-then-execCommand fallback or its boolean report");
			if (!consumers) console.error("✗ v0.1.197 a copy call site stopped checking the boolean / unmount guard before claiming success");
			if (!enoughFiles) console.error(`✗ v0.1.197 clipboard scanner walked only ${srcFiles.length} source files — the walk drifted, guard is not measuring anything`);
			failed++;
		}
	}

	// v0.1.198 (error/bug sweep 2026-08-24, finding A): strictNullChecks was OFF,
	// so "possibly null/undefined" defects compiled clean. Nine were latent, two of
	// them live: ChatApp.selectModel dereferenced a null provider, and pdf.ts's
	// outer-finally cleanup was narrowed to `never` and could never run. The flag
	// is now ON; this guard exists so it cannot be quietly flipped back to buy a
	// green build, and so the two fixed sites cannot silently regress.
	{
		// Parse the real config rather than grepping: a commented-out line, or a
		// second occurrence in prose, must not be able to satisfy this. Parsing
		// also makes comment-stripping unnecessary for the common case -- and a
		// naive block-comment regex MUST NOT be used here, because it eats the
		// `/**/` inside globs like "src/**/*.ts" and silently rewrites include
		// to "src*.ts" (this guard caught exactly that while being written).
		const raw = read("tsconfig.json");
		let cfg = null;
		try {
			cfg = JSON.parse(raw);
		} catch {
			// tsconfig is JSONC: retry with whole-line comments removed only.
			try {
				cfg = JSON.parse(
					raw
						.split("\n")
						.filter((l) => !/^\s*\/\//.test(l))
						.join("\n")
				);
			} catch {
				cfg = null;
			}
		}
		const opts = (cfg && cfg.compilerOptions) || null;
		const parsed = !!opts;
		// strict:true would imply it; accept either spelling, reject absence.
		const strictNulls = parsed && (opts.strictNullChecks === true || (opts.strict === true && opts.strictNullChecks !== false));

		// The flag only protects what it type-checks. If `include` stopped covering
		// src, the flag would be true and meaningless.
		const include = cfg && Array.isArray(cfg.include) ? cfg.include : [];
		const coversSrc = include.some((g) => typeof g === "string" && g.startsWith("src/"));

		// Behavioural pins on the two sites that were actually broken.
		const chat = read("src/ui/ChatApp.tsx");
		const chatFixed = /providerId !== getActiveProvider\(settings\)\?\.id/.test(chat);
		const pdf = read("src/ui/attach/pdf.ts");
		// The cleanup must read through a holder; a bare `let` narrows to never again.
		const pdfFixed =
			/const pending: \{ loadingTask: LoadingTask \| null \}/.test(pdf) &&
			/pending\.loadingTask && !pending\.loadingTask\.destroyed/.test(pdf);
		// Terminal tools must fail closed when no workspace policy is present.
		const term = read("src/agent/terminal/tools.ts");
		const termFixed = /if \(!ctx\.workspacePolicy\)/.test(term) && /refused: no workspace policy/.test(term);

		if (strictNulls && coversSrc && chatFixed && pdfFixed && termFixed) {
			console.log("✓ v0.1.198: strictNullChecks is on, covers src/, and the three fixed null-safety sites still hold");
		} else {
			if (!parsed) console.error("✗ v0.1.198 tsconfig.json could not be parsed — the flag check is not measuring anything");
			else if (!strictNulls) console.error("✗ v0.1.198 strictNullChecks was turned back off in tsconfig.json");
			if (parsed && !coversSrc) console.error("✗ v0.1.198 tsconfig include no longer covers src/ — strictNullChecks checks nothing");
			if (!chatFixed) console.error("✗ v0.1.198 ChatApp.selectModel dropped the optional chaining on getActiveProvider — null provider crashes the model pick again");
			if (!pdfFixed) console.error("✗ v0.1.198 pdf.ts loadingTask cleanup left its holder object — outer finally narrows to never and the destroy is dead code");
			if (!termFixed) console.error("✗ v0.1.198 terminal prepareContext stopped refusing a missing workspacePolicy — sandbox confinement can be bypassed");
			failed++;
		}
	}

	{
		/* v0.1.199 behavioural: focusing a leaf is fire-and-forget, but it must
		   neither throw nor leak an unhandled rejection. Obsidian's typings say
		   revealLeaf returns Promise<void>; older desktop builds returned plain
		   void. A bare `.catch` on the result crashes on the legacy shape, and a
		   bare call loses the rejection on the modern one — so both are tested.
		   The rejecting arm is only meaningful because test/fail-on-unhandled.cjs
		   turns an escaped rejection into a lane failure. */
		const ws = plugin.app.workspace;
		const savedLeaves = ws.getLeavesOfType;
		const savedReveal = ws.revealLeaf;
		const savedLeft = ws.getLeftLeaf;
		ws.getLeavesOfType = () => [];
		ws.getLeftLeaf = () => ({ setViewState: async () => {} });
		plugin.settings.chatLeafLocation = "left";

		let legacyOk = false;
		let rejectingOk = false;
		let thrown = null;
		try {
			/* legacy desktop: returns undefined, so .catch must not be assumed */
			ws.revealLeaf = () => undefined;
			await plugin.activateView();
			legacyOk = true;
			/* modern: returns a promise, and it rejects */
			ws.revealLeaf = () => Promise.reject(new Error("reveal blew up"));
			await plugin.activateView();
			rejectingOk = true;
		} catch (e) {
			thrown = e;
		}
		/* give an unhandled rejection a tick to surface before we score it */
		await new Promise((r) => setTimeout(r, 10));

		ws.getLeavesOfType = savedLeaves;
		ws.revealLeaf = savedReveal;
		ws.getLeftLeaf = savedLeft;

		if (legacyOk && rejectingOk) {
			console.log("\u2713 v0.1.199 behavioural: revealLeaf fire-and-forget survives BOTH contracts \u2014 legacy void return and a rejecting promise");
		} else {
			console.error(`\u2717 v0.1.199 revealLeaf handling regressed (legacyOk=${legacyOk}, rejectingOk=${rejectingOk}, thrown=${thrown && thrown.message})`);
			failed++;
		}
	}

	{
		/* v0.1.200 behavioural: settings writes have TWO contracts, and the
		   split is the whole fix. saveSettings() must keep rejecting, because
		   ten call sites (MCP/terminal consent, chat message transactions) roll
		   their in-memory state back when the write fails -- swallowing there
		   would record consent as granted while nothing reached disk.
		   saveSettingsSafe() is for the ~129 Obsidian control callbacks that
		   THROW AWAY the promise they are handed: before the fix a failed write
		   vanished silently, the toggle stayed flipped, and the setting was gone
		   on the next restart. The rejection arm is only meaningful because
		   test/fail-on-unhandled.cjs turns an escaped rejection into a failure. */
		const savedSaveData = plugin.saveData;
		const savedNotice = obsidianMock.Notice;
		const savedError = console.error;
		const notices = [];
		const errors = [];
		obsidianMock.Notice = class {
			constructor(msg) {
				notices.push(String(msg));
			}
		};
		plugin.saveData = async () => {
			throw new Error("disk full");
		};

		let stillRejects = false;
		let safeThrew = null;
		let safeReturned = "not-called";
		try {
			await plugin.saveSettings();
		} catch (e) {
			stillRejects = e instanceof Error && e.message === "disk full";
		}
		console.error = (...a) => {
			errors.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(" "));
		};
		try {
			safeReturned = plugin.saveSettingsSafe();
		} catch (e) {
			safeThrew = e;
		}
		/* the catch runs on a microtask, so let it land before scoring */
		await new Promise((r) => setTimeout(r, 10));
		console.error = savedError;

		plugin.saveData = savedSaveData;
		obsidianMock.Notice = savedNotice;

		const toldUser = notices.some((n) => n.includes("could not save settings") && n.includes("disk full"));
		const logged = errors.some((e) => e.includes("failed to save settings"));
		const isVoid = safeReturned === undefined;

		if (stillRejects && safeThrew === null && isVoid && toldUser && logged) {
			console.log("\u2713 v0.1.200 behavioural: saveSettings() still rejects for rollback callers; saveSettingsSafe() swallows, notifies and logs instead of losing the write");
		} else {
			console.error(`\u2717 v0.1.200 save-contract regressed (stillRejects=${stillRejects}, safeThrew=${safeThrew && safeThrew.message}, void=${isVoid}, notice=${toldUser}, logged=${logged})`);
			failed++;
		}
	}

	{
		/* v0.1.200 behavioural: the unhandled-rejection net is a REPORTER, so it
		   must never be the thing that breaks startup -- onload() aborts on a
		   throw and the entire plugin dies. It is called before loadSettings(),
		   and non-DOM hosts (this harness, any headless runner) expose a window
		   with no addEventListener at all. It also must filter on our own stack:
		   Obsidian shares one window across plugins, so an unfiltered handler
		   would blame us for another plugin's rejection. */
		const savedWindow = global.window;
		let domlessThrew = null;
		try {
			global.window = {};
			plugin.installRejectionNet();
			global.window = undefined;
			plugin.installRejectionNet();
		} catch (e) {
			domlessThrew = e;
		}

		const added = [];
		const removed = [];
		let handler = null;
		global.window = {
			addEventListener: (ev, fn) => {
				added.push(ev);
				handler = fn;
			},
			removeEventListener: (ev) => removed.push(ev),
		};
		const savedRegister = plugin.register;
		const teardowns = [];
		plugin.register = (fn) => teardowns.push(fn);
		let wiredThrew = null;
		try {
			plugin.installRejectionNet();
		} catch (e) {
			wiredThrew = e;
		}

		const savedNotice2 = obsidianMock.Notice;
		const savedError2 = console.error;
		const seen = [];
		obsidianMock.Notice = class {
			constructor(msg) {
				seen.push(String(msg));
			}
		};
		console.error = () => {};
		let prevented = false;
		if (handler) {
			/* another plugin's rejection: no stack of ours -> stay silent */
			const foreign = new Error("someone else exploded");
			foreign.stack = "Error: someone else exploded\n    at other-plugin/main.js:1:1";
			handler({ reason: foreign, preventDefault: () => { prevented = true; } });
			/* ours: the bundle path carries the plugin id */
			const ours = new Error("our async task exploded");
			ours.stack = `Error: our async task exploded\n    at x (/vault/.obsidian/plugins/${plugin.manifest.id}/main.js:1:1)`;
			handler({ reason: ours, preventDefault: () => { prevented = true; } });
		}
		console.error = savedError2;
		obsidianMock.Notice = savedNotice2;

		for (const fn of teardowns) fn();
		plugin.register = savedRegister;
		global.window = savedWindow;

		const domless = domlessThrew === null;
		const wired = wiredThrew === null && added.length === 1 && added[0] === "unhandledrejection";
		const tornDown = removed.length === 1 && removed[0] === "unhandledrejection";
		const filtered = seen.length === 1 && seen[0].includes("our async task exploded");

		if (domless && wired && tornDown && filtered && !prevented) {
			console.log("\u2713 v0.1.200 behavioural: rejection net survives a DOM-less host, wires+unwires once, reports only our own stack, and never preventDefault()s");
		} else {
			console.error(`\u2717 v0.1.200 rejection net regressed (domless=${domless}, wired=${wired}, tornDown=${tornDown}, filtered=${filtered} [${seen.join(" | ")}], prevented=${prevented})`);
			failed++;
		}
	}

	{
		/* v0.1.200 static: ban the exact shape that caused the silent data loss
		   -- a bare `await x.saveSettings();` as the LAST statement of a UI
		   callback. The callback discards the returned promise, so the rejection
		   had nowhere to go. Sites inside a try are exempt: those handle the
		   failure themselves and must keep awaiting. */
		const ts = require("typescript");
		const HOOKS = new Set(["onChange", "onClick", "onSubmit", "onClose", "onSelect"]);
		const srcFiles = [];
		(function walk(dir) {
			for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, e.name);
				if (e.isDirectory()) walk(full);
				else if (/\.tsx?$/.test(e.name)) srcFiles.push(full);
			}
		})(path.join(ROOT, "src"));

		const offenders = [];
		for (const file of srcFiles) {
			const text = fs.readFileSync(file, "utf8");
			const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
			(function visit(node) {
				if (
					ts.isCallExpression(node) &&
					ts.isPropertyAccessExpression(node.expression) &&
					node.expression.name.text === "saveSettings"
				) {
					const stmt = node.parent && ts.isAwaitExpression(node.parent) ? node.parent.parent : null;
					if (stmt && ts.isExpressionStatement(stmt)) {
						let inTry = false;
						for (let c = node.parent; c; c = c.parent) {
							if (ts.isTryStatement(c) && c.tryBlock.getStart(sf) <= node.getStart(sf) && node.getEnd() <= c.tryBlock.getEnd()) inTry = true;
						}
						const fn = stmt.parent;
						const isLast =
							fn &&
							ts.isBlock(fn) &&
							fn.statements.length > 0 &&
							fn.statements[fn.statements.length - 1] === stmt;
						const owner = isLast ? fn.parent : null;
						const isCallback =
							owner &&
							(ts.isArrowFunction(owner) || ts.isFunctionExpression(owner)) &&
							owner.parent &&
							ts.isCallExpression(owner.parent) &&
							owner.parent.arguments.includes(owner) &&
							ts.isPropertyAccessExpression(owner.parent.expression) &&
							HOOKS.has(owner.parent.expression.name.text);
						if (!inTry && isCallback) {
							offenders.push(`${path.relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
						}
					}
				}
				ts.forEachChild(node, visit);
			})(sf);
		}

		if (offenders.length === 0 && srcFiles.length > 100) {
			console.log(`\u2713 v0.1.200 static: ${srcFiles.length} source files scanned, no fire-and-forget "await x.saveSettings()" left tail-position in a UI callback (use saveSettingsSafe)`);
		} else {
			console.error(`\u2717 v0.1.200 discarded settings-save promise in a UI callback (files=${srcFiles.length}): ${offenders.join(", ")}`);
			failed++;
		}
	}

	return failed;
};
