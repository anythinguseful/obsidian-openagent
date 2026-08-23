/**
 * Smoke guards whose only source input is src/ui/ChatApp.tsx.
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
module.exports = function chatGuards() {
	let failed = 0;

	// v0.1.184 (owner: "tidak ada blok yang menjelaskan sedang compression"):
	// compaction now pushes a visible START banner (system turn) before the
	// summarize call, so the brief ThinkingBar flash is backed by a durable
	// in-transcript block; the END banner ("Context compacted") still follows.
	{
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			chat.includes("pushLocalNoticeTurn(\"Compacting context — folding earlier messages into a rolling summary.\")") &&
			chat.includes("setLiveStatus(\"Compacting context…\")") &&
			chat.includes("pushLocalNoticeTurn(\n\t\t\t\t`Context compacted — ${upto}");
		if (ok) {
			console.log("✓ v0.1.184: compaction — visible start banner + end banner in the transcript");
		} else {
			console.error("✗ v0.1.184 compaction start-banner drifted");
			failed++;
		}
	}

	// v0.1.167 (owner: "arrow key select tidak ikut"): keyboard nav keeps the
	// highlighted row in view via LOCAL scroll (block: nearest), never
	// scrollIntoView (which would also move the transcript).
	{
		const chat = read("src/ui/ChatApp.tsx");
		const ok =
			chat.includes("const slashMenuRef = useRef<HTMLDivElement>(null)") &&
			chat.includes('ref={slashMenuRef}') &&
			chat.includes("const active = list.querySelector<HTMLElement>(\".oa-slash-item.is-active\")") &&
			chat.includes("const topDelta = activeRect.top - listRect.top") &&
			chat.includes("const bottomDelta = activeRect.bottom - listRect.bottom") &&
			chat.includes("list.scrollTop += Math.abs(topDelta) < Math.abs(bottomDelta) ? topDelta : bottomDelta") &&
			chat.includes("list.scrollTop = 0") &&
			chat.includes("}, [slashIndex, slashMenu.rows])") &&
			!chat.includes("scrollIntoView");
		if (ok) {
			console.log("✓ v0.1.167: slash keyboard nav scrolls the highlighted row into view (local, block: nearest)");
		} else {
			console.error("✗ v0.1.167 slash keyboard scroll-follow drifted");
			failed++;
		}
	}

	// ---- v0.1.21 — slash medium batch (Hermes Desktop parity): /status,
	// /save, /profile, /approvals + the arg-stage popover (argumentMode).
	{
		const read = (p) => fs.readFileSync(path.join(ROOT, p.replace(/^\.\.\//, "")), "utf8");
		const app4 = read("../src/ui/ChatApp.tsx");
		const ok =
			app4.includes('case "/status"') && app4.includes('case "/save"') &&
			app4.includes('case "/profile"') && app4.includes('case "/approvals"') &&
			app4.includes("slashMenu") && app4.includes('kind: "opt"') &&
			app4.includes('"active provider catalog"') &&
			app4.includes("openagent/exports") && app4.includes("props.app.vault.create(") &&
			app4.includes("props.applyProfile(hit.id)") &&
			app4.includes("getActiveProfile(settings)") &&
			/* v0.1.168 amended: Platform left the import again — panel is one shell. */
			app4.includes('import { App, Component, MarkdownView, Notice, TFile, normalizePath } from "obsidian"');
		if (ok) {
			console.log("✓ v0.1.21: slash medium batch (/status /save /profile /approvals + arg-stage popover)");
		} else {
			console.error("✗ v0.1.21 slash medium batch drifted (cases, arg-stage, vault save, or applyProfile lost)");
			failed++;
		}
	}

	// ---- v0.1.31 — /moa one-shot sugar (cli.py ~10024: stash, ride the
	// default preset for one turn, restore) + bare /model <preset> implicit
	// pivot (model_switch.py PATH B exact_moa_preset_name, enabled-only,
	// #55187; the "moa:" prefix is never a bare name).
	{
		const read = (p) => fs.readFileSync(path.join(ROOT, p.replace(/^\.\.\//, "")), "utf8");
		const app14 = read("../src/ui/ChatApp.tsx");
		const ok =
			app14.includes('"/moa"') &&
			app14.includes("moaUsage()") &&
			app14.includes("const moaSettings = JSON.parse(JSON.stringify(settings))") &&
			app14.includes("{ settingsOverride: moaSettings }") &&
			app14.includes("MoA one-shot queued with preset ${preset}; your selected model remains unchanged.") &&
			app14.includes("exactMoaPresetName(settings.moa, arg)") &&
			app14.includes("left the MoA virtual provider");
		if (ok) {
			console.log("✓ v0.1.31+: /moa one-shot uses an immutable per-run override + bare /model pivot (enabled-only)");
		} else {
			console.error("✗ v0.1.31 /moa one-shot or bare /model pivot drifted");
			failed++;
		}
	}

	return failed;
};
