/**
 * Write-preview planner + diff rows suite (v0.1.58)
 *  · planWrite mirrors write_note's three modes byte-for-byte (incl. the
 *    unknown-mode → append fallback and the create-collision error text)
 *  · planEdit shares the fragment math with edit_note (single source)
 *  · buildPreviewRows: line pass + word-level pairing, cap marker is honest
 */

const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "preview-planner.cjs");
execSync(`npx esbuild test/preview-planner-entry.ts --bundle --platform=node --format=cjs --outfile=${out}`, {
	cwd: root,
	stdio: "inherit",
});

const { planWrite, planEdit, applyEditToContent, buildPreviewRows } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

/* ---- planWrite ---- */
const createNew = planWrite({ path: "x", content: "# A", mode: "create" }, "ws/x.md", null);
check(createNew.ok === true && createNew.preview.original === null && createNew.preview.proposed === "# A", "create on missing note: original null, proposed = content");

const createExists = planWrite({ path: "x", content: "# A", mode: "create" }, "ws/x.md", "old");
check(createExists.ok === false && createExists.error === "Note already exists: ws/x.md. Use mode=overwrite or mode=append.", "create collision error is byte-identical with the tool");

const ow = planWrite({ path: "x", content: "v2", mode: "overwrite" }, "ws/x.md", "v1");
check(ow.ok === true && ow.preview.original === "v1" && ow.preview.proposed === "v2" && ow.preview.mode === "overwrite", "overwrite keeps the original for the diff");

const app = planWrite({ path: "x", content: "more", mode: "append" }, "ws/x.md", "v1");
check(app.ok === true && app.preview.proposed === "v1\nmore", "append mirrors the tool: original + \\n + content");

const appNew = planWrite({ path: "x", content: "more", mode: "append" }, "ws/x.md", null);
check(appNew.ok === true && appNew.preview.proposed === "more", "append into missing note writes content as-is");

const weird = planWrite({ path: "x", content: "more", mode: "sideways" }, "ws/x.md", "v1");
check(weird.ok === true && weird.preview.mode === "append" && weird.preview.proposed === "v1\nmore", "unknown mode falls into append exactly like execute()");
const malformedMermaid = "```mermaid\nflowchart LR\n  A --> B; %% exact payload";
const canonicalMalformed = "```text\nflowchart LR\n  A --> B; %% exact payload\n```";
const mermaidCreate = planWrite({ path: "x", content: malformedMermaid, mode: "create" }, "ws/m.md", null);
check(
	mermaidCreate.ok === true && mermaidCreate.preview.proposed === canonicalMalformed,
	"write preview bytes use canonical fail-closed Mermaid output"
);
const mermaidAppend = planWrite({ path: "x", content: malformedMermaid, mode: "append" }, "ws/m.md", "existing");
check(
	mermaidAppend.ok === true && mermaidAppend.preview.proposed === `existing\n${canonicalMalformed}`,
	"append preview composes the same canonical bytes that persistence receives"
);

/* ---- planEdit ---- */
const edit = planEdit({ path: "x", old_text: "two", new_text: "TWO" }, "ws/x.md", "one two three");
check(edit.ok === true && edit.preview.mode === "edit" && edit.preview.proposed === "one TWO three", "edit replaces the first occurrence only");

const miss = planEdit({ path: "x", old_text: "nope", new_text: "y" }, "ws/x.md", "one two");
check(miss.ok === false && miss.error === "Fragment not found in ws/x.md.", "missing-fragment error byte-identical with the tool");

const noFile = planEdit({ path: "x", old_text: "a", new_text: "b" }, "ws/x.md", null);
check(noFile.ok === false && noFile.error === "File not found: ws/x.md", "missing file mirrors readFile's error text (single name for the failure)");
const mermaidEdit = planEdit(
	{ path: "x", old_text: "A --> B", new_text: "A --> C" },
	"ws/m.md",
	"```mermaid\nflowchart LR\n  A --> B; %% exact payload\n```"
);
check(
	mermaidEdit.ok === true && mermaidEdit.preview.proposed === "```mermaid\nflowchart LR\n  A --> C;\n  %% exact payload\n```",
	"edit preview canonicalizes the complete proposed persisted bytes"
);

check(applyEditToContent("aaa", "a", "b") === "baa", "applyEditToContent: first occurrence, no regex");

/* ---- buildPreviewRows ---- */
const fresh = buildPreviewRows("", "# T\nline one\nline two");
check(fresh.addedCount === 3 && fresh.removedCount === 0 && fresh.rows.every((r) => r.type === "added"), "fresh create: every line added, nothing removed");

const pair = buildPreviewRows("alpha beta gamma", "alpha BETA gamma");
const rm = pair.rows.find((r) => r.type === "removed");
const ad = pair.rows.find((r) => r.type === "added");
check(Boolean(rm && rm.words && rm.words.some((w) => w.removed && w.value === "beta")), "removed row carries the struck word");
check(Boolean(ad && ad.words && ad.words.some((w) => w.added && w.value === "BETA")), "added row carries the highlighted word");
check(pair.rows.every((r) => r.type !== "context" || r.text !== undefined), "rows never malformed");

const tail = buildPreviewRows("a\nb\nc\n", "a\nb\nc\nd");
check(tail.addedCount === 1 && tail.removedCount === 0, "trailing-append diffs stay one added line");

const big = buildPreviewRows("", Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n"), 120);
check(big.hiddenChanged === 80 && big.rows.filter((r) => r.type === "added").length === 120, "cap hides 200-120 and the count stays honest");

if (failed > 0) {
	console.error(`\n${failed} preview-planner check(s) failed`);
	process.exit(1);
}
console.log("\nAll preview planner + diff row checks passed.");
