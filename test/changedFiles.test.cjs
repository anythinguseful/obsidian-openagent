/**
 * Changed-files derivation suite (v0.1.56)
 *  · pure fold of a turn's tool parts → one row per touched file
 *  · landed-only (done), first-touched order, last-verb owns the label
 */

const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "changed-files.cjs");
execSync(
	`npx esbuild test/changed-files-entry.ts --bundle --platform=node --format=cjs --outfile=${out}`,
	{ cwd: root, stdio: "inherit" }
);

const { deriveChangedFiles } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

const T = (name, args, status = "done") => ({
	kind: "tool",
	toolCallId: "x",
	toolName: name,
	args: typeof args === "string" ? args : JSON.stringify(args),
	status,
});

{
	const r = deriveChangedFiles([]);
	check(r.length === 0, "empty turn → no rows");
}
{
	const r = deriveChangedFiles([
		T("write_note", { path: "a/b.md", mode: "create" }),
		T("write_note", { path: "a/b.md", mode: "append" }),
	]);
	check(r.length === 1, "dedupe: two writes on one path → one row");
	check(r[0].touches === 2, "touch count sums landed writes");
	check(r[0].verb === "appended", "last landed verb owns the label");
	check(r[0].name === "b.md", "row label is the basename");
}
{
	const r = deriveChangedFiles([
		T("write_note", { path: "first.md", mode: "create" }),
		T("edit_note", { path: "second.md", old_text: "a", new_text: "b" }),
	]);
	check(r.map((x) => x.name).join("|") === "first.md|second.md", "first-touched order preserved");
}
{
	const r = deriveChangedFiles([
		T("write_note", { path: "p", mode: "create", }, "pending"),
		T("write_note", { path: "p", mode: "create" }, "running"),
		T("write_note", { path: "p", mode: "create" }, "denied"),
		T("write_note", { path: "p", mode: "create" }, "error"),
	]);
	check(r.length === 0, "landed-only: pending/running/denied/error change nothing");
}
{
	const r = deriveChangedFiles([
		T("read_note", { path: "x.md" }),
		T("search_vault", { query: "y" }),
		T("list_files", {}),
	]);
	check(r.length === 0, "read-only tools never count");
}
{
	const r = deriveChangedFiles([T("rename_move_note", { path: "old/x.md", new_path: "new/y" })]);
	check(r.length === 1 && r[0].path === "new/y.md", "rename reports the NEW ensured .md path");
	check(r[0].verb === "moved", "rename meta is moved");
}
{
	const r = deriveChangedFiles([T("write_note", { path: "plain", mode: "create" })]);
	check(r[0].path === "plain.md", "write path mirrors the tool's ensureMd");
}
{
	const r = deriveChangedFiles([T("delete_note", { path: "gone.md" })]);
	check(r.length === 1 && r[0].deleted === true && r[0].verb === "deleted", "delete flags the row (click path guards)");
	check(r[0].path === "gone.md", "delete keeps the raw path (any vault file, no ensureMd)");
}
{
	const r = deriveChangedFiles([T("write_note", "not-json-at-all")]);
	check(r.length === 0, "malformed args JSON is ignored, never crashes");
}
{
	const r = deriveChangedFiles([
		{ kind: "text", text: "some answer" },
		{ kind: "marker", text: "failover" },
	]);
	check(r.length === 0, "non-tool parts never count");
}
/* v0.1.121 (owner): workspaceFolder prefix — baris kartu menunjuk file yang
   BENAR-BENAR tertulis (tools meresolve lewat vaultPath; kartu sempat
   menyimpan path mentah hingga klik memunculkan "no longer in the vault"
   palsu untuk vault berfolder kerja "Projects") */
{
	const ws = "Projects";
	const r = deriveChangedFiles([T("write_note", { path: "Concepts/Materiality & Texture.md", mode: "create" })], ws);
	check(r[0].path === "Projects/Concepts/Materiality & Texture.md", "ws prefix: write resolves vaultPath (kasus pemilik)");
	const r2 = deriveChangedFiles([T("write_note", { path: "Projects/Concepts/x", mode: "append" })], ws);
	check(r2[0].path === "Projects/Concepts/x.md", "ws prefix: already-prefixed stays (no double) + ensureMd");
	const r3 = deriveChangedFiles([T("edit_note", { path: "a/b" })], ws);
	check(r3[0].path === "Projects/a/b.md", "ws prefix: edit resolves");
	const r4 = deriveChangedFiles([T("delete_note", { path: "a/gone.md" })], ws);
	check(r4[0].path === "Projects/a/gone.md" && r4[0].deleted === true, "ws prefix: delete resolves, no ensureMd");
	const r5 = deriveChangedFiles([T("rename_move_note", { path: "a/old", new_path: "b/new" })], ws);
	check(r5[0].path === "Projects/b/new.md", "ws prefix: rename new_path resolves");
	const r6 = deriveChangedFiles([T("write_note", { path: "plain", mode: "create" })], "  ");
	check(r6[0].path === "plain.md", "ws prefix: blank folder trims to no-op");
}

if (failed > 0) {
	console.error(`FAILED: ${failed} changed-files check(s)`);
	process.exit(1);
}
console.log("All changed-files derivation checks passed.");
