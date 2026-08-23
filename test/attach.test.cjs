/**
 * Attach feature suite — `@` inline refs (parse/resolve), prompt snippets
 * (seed/sanitize), folder collector caps, mime table, vision heuristic +
 * /models metadata parsing. Pure helpers only; modals stay untested.
 */

const { execSync } = require("child_process");
const path = require("path");
const Module = require("module");

const out = path.join(__dirname, "dist", "attach.cjs");
execSync(
	`npx esbuild test/attach-entry.ts --bundle --platform=node --format=cjs --external:obsidian --external:canvas --outfile=${out}`,
	{ cwd: path.join(__dirname, ".."), stdio: "inherit" }
);

const obsidianMock = new Proxy(
	{},
	{
		get: (_, prop) => {
			if (prop === "MarkdownRenderer") return { render: async () => {} };
			if (prop === "normalizePath") return (p) => p;
			if (prop === "parseYaml") return () => ({});
			return class {};
		},
	}
);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "obsidian") return "obsidian-mock";
	return originalResolve.call(this, request, ...args);
};
require.cache["obsidian-mock"] = { id: "obsidian-mock", filename: "obsidian-mock", loaded: true, exports: obsidianMock };

const A = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

/* ------------------------------ findAtQuery ------------------------------ */
{
	check(A.findAtQuery("", 0) === null, "findAtQuery: empty text → null");
	check(A.findAtQuery("@", 1)?.query === "", "findAtQuery: lone @ → popup with empty query");
	check(A.findAtQuery("hello @dail", 11)?.query === "dail", "findAtQuery: token after space");
	check(A.findAtQuery("hello @dail", 7)?.query === "", "findAtQuery: caret right after @");
	check(A.findAtQuery("foo@bar", 7) === null, "findAtQuery: foo@bar is not a reference");
	check(A.findAtQuery("see @[[Daily Notes/today.md]] done", 32) === null, "findAtQuery: completed token → null");
	check(A.findAtQuery("(@inc", 5)?.query === "inc", "findAtQuery: ( after paren still counts");
	check(A.findAtQuery("@[[parti", 8)?.query === "parti", "findAtQuery: [[ prefix stripped from query");
	check(A.findAtQuery("hello world", 11) === null, "findAtQuery: no token → null");
	check(A.findAtQuery("say @ hi", 6) === null, "findAtQuery: @ followed by space → null");
}

/* ------------------------------ extractAtRefs ---------------------------- */
{
	const refs = A.extractAtRefs("please read @[[Notes/A.md]] and @[[Daily/Today Note.md|today]] plus @[[B.md]]");
	check(refs.length === 3, `extractAtRefs: three tokens (${refs.length})`);
	check(refs[0].path === "Notes/A.md" && !refs[0].alias, "extractAtRefs: plain path");
	check(refs[1].path === "Daily/Today Note.md" && refs[1].alias === "today", "extractAtRefs: spaces + alias");
	check(A.extractAtRefs("[[not a ref]] and @ not a ref").length === 0, "extractAtRefs: wikilinks and lone @ ignored");
	check(A.extractAtRefs(" ignore @[[  ]]").length === 0, "extractAtRefs: empty brackets ignored");
}

/* ------------------------------ resolveAtRefs ---------------------------- */
{
	const vault = ["Notes/A.md", "Daily/Today Note.md", "Daily/Archive/Today Note.md", "B.md", "deep/nested/Note.md"];
	const refs = A.extractAtRefs("@[[Notes/A.md]] @[[B.md]] @[[nested/Note.md]] @[[Today Note.md]] @[[missing.md]]");
	const r = A.resolveAtRefs(refs, vault);
	check(r[0].resolved === "Notes/A.md", "resolve: exact path");
	check(r[1].resolved === "B.md", "resolve: unique basename");
	check(r[2].resolved === "deep/nested/Note.md", "resolve: unique suffix (folder/note)");
	check(r[3].resolved === null, "resolve: ambiguous basename → unresolved");
	check(r[4].resolved === null, "resolve: missing → unresolved");
}

/* ------------------------------ spliceToken ------------------------------ */
{
	const { text, caret } = A.spliceToken("summarize @dai", 10, 14, "Daily/today.md");
	check(text === "summarize @[[Daily/today.md]] ", "spliceToken: token replaced with wikilink + space");
	check(caret === text.length, "spliceToken: caret lands after inserted token");
	const mid = A.spliceToken("see @dai", 4, 8, "Notes/A.md");
	check(mid.text === "see @[[Notes/A.md]] ", "spliceToken: mid-text replace");
}

/* ------------------------------ snippets --------------------------------- */
{
	check(A.DEFAULT_PROMPT_SNIPPETS.length === 4, "snippets: 4 defaults seeded");
	check(A.sanitizeSnippets(undefined).length === 4, "snippets: missing field → seed");
	check(A.sanitizeSnippets(null).length === 4, "snippets: null → seed");
	check(A.sanitizeSnippets([]).length === 0, "snippets: user-emptied [] respected");
	const cleaned = A.sanitizeSnippets([
		{ id: "a", title: "T", text: "do the thing" },
		{ id: "b", title: "", text: "" }, // junk — dropped
		{ no: "shape" }, // junk — dropped
		"garbage",
		{ id: "c", title: "", text: "text only entry becomes its own title" },
	]);
	check(cleaned.length === 2 && cleaned[0].title === "T", "snippets: junk dropped, valid kept");
	check(cleaned[1].title === "text only entry becomes its own title", "snippets: missing title falls back to text");
	const ids = new Set([A.newSnippetId(), A.newSnippetId(), A.newSnippetId()]);
	check(ids.size === 3, "snippets: newSnippetId unique");
}

/* --------------------------- folder collector ---------------------------- */
{
	const f = (path, mtime, size) => ({ path, name: path.split("/").pop(), stat: { mtime, size } });
	const files = [
		f("F/old.md", 100, 1000),
		f("F/new.md", 300, 1000),
		f("F/mid.md", 200, 1000),
		f("F/sub/deep.md", 400, 1000),
		f("G/other.md", 500, 1000),
		f("root.md", 600, 1000),
	];
	const all = A.collectFolderMarkdown(files, "/");
	check(all.totalInFolder === 6 && all.picked.length === 6, "folder: root collects every markdown");
	check(all.picked[0].path === "root.md", "folder: newest first");
	const sub = A.collectFolderMarkdown(files, "F");
	check(sub.totalInFolder === 4 && !sub.picked.some((x) => x.path.startsWith("G/")), "folder: prefix scoped, recursive");
	const capped = A.collectFolderMarkdown(
		Array.from({ length: 30 }, (_, i) => f(`F/n${i}.md`, i, 100)),
		"F"
	);
	check(capped.picked.length === A.FOLDER_ATTACH_MAX_FILES && capped.truncated, "folder: 20-file cap + truncated flag");
	const bytes = A.collectFolderMarkdown(
		[f("F/a.md", 3, 150 * 1024), f("F/b.md", 2, 100 * 1024), f("F/c.md", 1, 10 * 1024)],
		"F"
	);
	check(
		bytes.picked.length === 2 && bytes.totalBytes <= A.FOLDER_ATTACH_MAX_BYTES && bytes.truncated,
		"folder: 200 KB byte cap skips oversize but keeps filling"
	);
}

/* --------------------------------- mime ---------------------------------- */
{
	check(A.mimeFromExt("a/photo.PNG") === "image/png", "mime: PNG (uppercase)");
	check(A.mimeFromExt("p.jpeg") === "image/jpeg", "mime: jpeg");
	check(A.mimeFromExt("p.jpg") === "image/jpeg", "mime: jpg");
	check(A.mimeFromExt("x.unknown") === "application/octet-stream", "mime: fallback");
	check(A.IMAGE_ATTACH_MAX_BYTES === 5 * 1024 * 1024, "image cap = 5 MB");
}

/* ------------------------------ vision ----------------------------------- */
{
	const yes = ["gpt-4o", "gpt-4.1-mini", "gemini-2.5-pro", "claude-sonnet-4", "llava-13b", "qwen2.5-vl-32b", "gemma-4-e4b-it", "pixtral-12b", "moondream2"];
	const no = ["gpt-3.5-turbo", "qwen3-30b-a3b-instruct-2507", "hermes-4-70b", "deepseek-r1", "gemma-2-9b", "llama-3.1-8b"];
	check(yes.every((m) => A.visionHeuristic(m)), `vision: heuristic catches ${yes.length} vision models`);
	check(no.every((m) => !A.visionHeuristic(m)), `vision: heuristic rejects ${no.length} text-only models`);
	check(
		A.parseModelInfo({ id: "gpt-4o", architecture: { modality: "text+image->text" } })?.vision === true,
		"vision: OpenRouter modality parsed (image input)"
	);
	check(
		A.parseModelInfo({ id: "text", architecture: { modality: "text->text" } })?.vision === false,
		"vision: text-only modality parsed"
	);
	check(A.parseModelInfo({ id: "plain" })?.vision === undefined, "vision: no architecture → unknown");
	check(A.parseModelInfo({ noId: true }) === null, "vision: junk entry → null");
	/* context-window metadata (context compression auto, v0.1.17) */
	check(A.parseModelInfo({ id: "or-model", context_length: 128000.7 })?.contextLength === 128000, "ctx: context_length parsed (floored)");
	check(A.parseModelInfo({ id: "or-model" })?.contextLength === undefined, "ctx: absent metadata → undefined (auto falls back)");
	check(A.parseModelInfo({ id: "or-model", context_window: 0 })?.contextLength === undefined, "ctx: junk/zero rejected");
}

/* ----------------------- disk upload classification ---------------------- */
/* owner report 2026-07-21: every disk file got rejected (all > 256 KB) —
   text cap raised to 1 MB and disk images now ride the vision path */
{
	const fake = (name, type, size = 10) => /** @type {File} */ ({ name, type, size });
	check(A.MAX_TEXT_BYTES === 1024 * 1024, "disk upload text cap = 1 MB (was 256 KB)");
	check(A.isTextLike(fake("note.md", "text/markdown")), "isTextLike: md by ext");
	check(A.isTextLike(fake("data.csv", "text/csv")), "isTextLike: csv by mime+ext");
	check(!A.isTextLike(fake("doc.pdf", "application/pdf")), "isTextLike: pdf rejected");
	check(A.isImageLike(fake("shot.png", "image/png")), "isImageLike: png");
	check(A.isImageLike(fake("photo", "image/jpeg")), "isImageLike: mime-only image");
	check(A.isImageLike(fake("x.webp", "")), "isImageLike: webp by ext");
	check(!A.isImageLike(fake("note.md", "text/markdown")), "isImageLike: md not image");
	check(!A.isImageLike(fake("doc.pdf", "application/pdf")), "isImageLike: pdf not image");
}

/* ----------------------------- pdf uploads ------------------------------- */
/* owner report 2026-07-22: the files they actually attach are PDFs — local
   extraction (pdfjs fake worker) now turns them into text chips */
{
	check(A.isPdfLike("report.pdf", "application/pdf"), "isPdfLike: mime+ext");
	check(A.isPdfLike("report.pdf", ""), "isPdfLike: ext only");
	check(!A.isPdfLike("notes.md", "text/markdown"), "isPdfLike: md not pdf");
	check(A.PDF_ATTACH_MAX_BYTES === 20 * 1024 * 1024, "pdf cap = 20 MB");
	check(A.PDF_ATTACH_MAX_PAGES === 50, "pdf parsed pages capped at 50");
}

if (failed > 0) {
	console.error(`\n${failed} attach check(s) failed`);
	process.exit(1);
}
console.log("\nAll attach checks passed.");
