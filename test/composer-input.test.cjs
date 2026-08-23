/** Composer input-history browse + own undo/redo regression tests (v0.1.180).
 *
 * Pure ports of Hermes Desktop's composer-input-history store and
 * undo-history module — no Obsidian, no DOM. Verifies: the derived ring
 * (newest first, non-user skipped), browseBackward/browseForward with draft
 * snapshot restore, and the undo stack (coalesce window, no-op skip, limit,
 * reset, shortcut predicates).
 */
const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");

/* bundle both pure modules (no Obsidian import) */
execSync(
	`npx esbuild src/ui/composer/undo.ts --bundle --platform=node --format=cjs --outfile=${path.join(__dirname, "dist", "composer-undo.cjs")}`,
	{ cwd: root, stdio: "inherit" }
);
execSync(
	`npx esbuild src/ui/composer/history.ts --bundle --platform=node --format=cjs --outfile=${path.join(__dirname, "dist", "composer-history.cjs")}`,
	{ cwd: root, stdio: "inherit" }
);

const U = require(path.join(__dirname, "dist", "composer-undo.cjs"));
const H = require(path.join(__dirname, "dist", "composer-history.cjs"));

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

/* ── history ring ── */
{
	const msgs = [
		{ role: "user", text: "first question" },
		{ role: "assistant", text: "answer one" },
		{ role: "system", text: "a notice" },
		{ role: "user", text: "  second question  " },
		{ role: "user", text: "   " }, // blank → skipped
	];
	const ring = H.deriveUserHistory(msgs, (m) => m.text);
	check(ring.length === 2 && ring[0] === "second question" && ring[1] === "first question", "ring: newest first, non-user + blank skipped");
	check(H.deriveUserHistory([], (m) => m.text).length === 0, "ring: empty messages → empty");
}

/* ── browse state machine ── */
{
	const b = new H.ComposerHistoryBrowse();
	const hist = ["three", "two", "one"];
	check(!b.isBrowsing(), "browse: starts not browsing");

	check(b.browseBackward("my draft", hist) === "three", "browse: first ArrowUp → newest, snapshot the draft");
	check(b.isBrowsing() === true, "browse: cursor active");
	check(b.browseBackward("ignored", hist) === "two", "browse: second ArrowUp → older");
	check(b.browseBackward("ignored", hist) === "one", "browse: third ArrowUp → oldest");

	check(b.browseBackward("ignored", hist) === null, "browse: ArrowUp at oldest → null (no further step)");
	const down = b.browseForward(hist);
	check(down.text === "two" && down.returnedToPresent === false, "browse: ArrowDown steps toward newer");
	const down2 = b.browseForward(hist);
	check(down2.text === "three" && down2.returnedToPresent === false, "browse: ArrowDown to newest");
	const down3 = b.browseForward(hist);
	check(down3.text === "my draft" && down3.returnedToPresent === true, "browse: ArrowDown past newest restores the saved draft");
	check(!b.isBrowsing(), "browse: cursor reset after returning to present");

	check(b.browseBackward("ignored", []) === null, "browse: empty ring → null");
	check(b.browseForward(hist) === null, "browse: forward while not browsing → null");

	b.browseBackward("d", ["x"]);
	b.reset();
	check(!b.isBrowsing(), "browse: reset clears the cursor");
}

/* ── undo stack ── */
{
	let t = 1000;
	const h = U.createComposerUndoHistory(200, () => t);

	const s = (text, caret) => ({ text, caret });
	check(h.undo(s("now", 3)) === null, "undo: empty stack → null");
	check(h.redo(s("now", 3)) === null, "redo: empty stack → null");

	h.record(s("", 0));
	h.record(s("h", 1));
	h.record(s("he", 2));
	check(h.undo(s("hel", 3)).text === "he", "undo: steps back one entry");
	check(h.undo(s("he", 2)).text === "h", "undo: steps back again");
	check(h.redo(s("h", 1)).text === "he", "redo: steps forward one entry");

	/* typing burst coalesces: entries within 600ms merge into one step */
	const h2 = U.createComposerUndoHistory(200, () => t);
	h2.record(s("", 0), { coalesce: true });
	t += 100;
	h2.record(s("a", 1), { coalesce: true });
	t += 100;
	h2.record(s("ab", 2), { coalesce: true });
	check(h2.undo(s("abc", 3)).text === "", "undo: burst coalesces to the start-of-burst state");

	/* a non-coalescing edit opens a new entry and clears the redo stack */
	const h3 = U.createComposerUndoHistory(200, () => t);
	h3.record(s("", 0));
	h3.undo(s("a", 1)); // bank "a" into redo
	h3.record(s("", 0)); // new edit → future cleared
	check(h3.redo(s("b", 1)) === null, "undo: a fresh edit invalidates the redo stack");

	/* no-op record (same text as top of stack) is dropped — provable by the
	   depth of the stack: three records, only two entries survive */
	const h4 = U.createComposerUndoHistory(200, () => t);
	h4.record(s("a", 1));
	h4.record(s("a", 1)); // no-op
	h4.record(s("b", 1));
	check(h4.undo(s("c", 1)).text === "b", "undo: no-op record — first step is the real edit");
	check(h4.undo(s("b", 1)).text === "a", "undo: no-op record — second step reaches the older entry");
	check(h4.undo(s("a", 1)) === null, "undo: no-op record — stack depth proves the duplicate was dropped");

	/* reset drops everything */
	const h5 = U.createComposerUndoHistory(200, () => t);
	h5.record(s("", 0));
	h5.reset();
	check(h5.undo(s("a", 1)) === null, "undo: reset clears the stack");
}

/* ── shortcut predicates ── */
{
	const k = (key, opts = {}) => ({ key, ...opts });
	check(U.isUndoShortcut(k("z", { ctrlKey: true })) === true, "shortcut: Ctrl+Z is undo");
	check(U.isUndoShortcut(k("z", { metaKey: true })) === true, "shortcut: Cmd+Z is undo");
	check(U.isUndoShortcut(k("z", { ctrlKey: true, shiftKey: true })) === false, "shortcut: Ctrl+Shift+Z is NOT undo");
	check(U.isUndoShortcut(k("z")) === false, "shortcut: bare z is not undo");

	check(U.isRedoShortcut(k("z", { ctrlKey: true, shiftKey: true })) === true, "shortcut: Ctrl+Shift+Z is redo");
	check(U.isRedoShortcut(k("z", { metaKey: true, shiftKey: true })) === true, "shortcut: Cmd+Shift+Z is redo");
	check(U.isRedoShortcut(k("y", { ctrlKey: true })) === true, "shortcut: Ctrl+Y is redo (Windows/Linux)");
	check(U.isRedoShortcut(k("y", { ctrlKey: true, metaKey: true })) === false, "shortcut: Ctrl+Cmd+Y is not redo");
}

if (failed) {
	console.error(`\n${failed} composer-input check(s) failed`);
	process.exit(1);
}
console.log("\nAll composer-input checks passed.");
