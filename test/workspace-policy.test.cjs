/** Adversarial unit suite for the pure Workspace v0.1.145 path policy. */
const path = require("path");
const { execSync } = require("child_process");

const out = path.join(__dirname, "dist", "workspace-policy.cjs");
execSync(
	`npx esbuild ${path.join(__dirname, "..", "src", "agent", "workspacePolicy.ts")} --bundle --platform=node --format=cjs --outfile=${out}`,
	{ stdio: "inherit" }
);

const {
	WorkspacePolicy,
	canonicalVaultPath,
	normalizeWorkspaceMode,
	pathContains,
	partitionManagedFolder,
	sanitizeWorkspaceExclusions,
	workspaceSessionPartition,
} = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else { console.error(`✗ ${label}`); failed++; }
};
const throws = (label, fn, part = "") => {
	try { fn(); check(false, label); }
	catch (e) { check(!part || String(e.message).includes(part), `${label}${part ? ` (“${e.message}”)` : ""}`); }
};

/* Migration: Strict can never appear unless it was explicit. */
check(normalizeWorkspaceMode(undefined, "") === "whole-vault", "legacy empty workspace → Whole vault");
check(normalizeWorkspaceMode(undefined, "Projects/A") === "preferred-folder", "legacy non-empty workspace → Preferred folder");
check(normalizeWorkspaceMode("strict-folder", "Projects/A") === "strict-folder", "explicit Strict survives migration");
check(normalizeWorkspaceMode("junk", "Projects/A") === "preferred-folder", "invalid mode never becomes Strict");

/* Canonical lexical shape. */
check(canonicalVaultPath(" A\\B//C.md ") === "A/B/C.md", "mixed and duplicate separators canonicalized");
check(canonicalVaultPath("Cafe\u0301/one\u00a0two.md") === "Café/one two.md", "Unicode NFC and NBSP canonicalized");
throws("slash-only browse path is refused as absolute", () => canonicalVaultPath("///", { allowEmpty: true }), "relative");
for (const bad of ["../secret.md", "A/../secret.md", "A/./x.md", "/etc/passwd", "\\server\\share", "C:\\x", "C:relative", "A\u0000B"] ) {
	throws(`refuses hostile path: ${JSON.stringify(bad)}`, () => canonicalVaultPath(bad));
}
throws("blank direct path refused", () => canonicalVaultPath("   "), "cannot be empty");

/* Exact segment containment — prefix collisions and case are never guessed. */
check(pathContains("WS", "WS") && pathContains("WS", "WS/x.md"), "root equality + child containment");
check(!pathContains("WS", "WS2/x.md") && !pathContains("WS", "ws/x.md"), "prefix collision and case mismatch rejected");

const whole = new WorkspacePolicy({
	workspaceMode: "whole-vault",
	workspaceFolder: "ignored",
	workspaceExcludedFolders: ["Private", "Tmp/cache"],
});
check(whole.valid && whole.resolvePath("Notes/a.md") === "Notes/a.md", "Whole keeps canonical vault-relative path");
check(whole.resolveBrowseFolder("") === "", "Whole empty browse root remains vault root");
throws("Whole protects config root", () => whole.resolvePath(".obsidian/plugins/x/data.json"), "protected");
throws("Whole applies exact exclusion root", () => whole.resolvePath("Private"), "excluded");
throws("Whole applies exclusion descendants", () => whole.resolvePath("Tmp/cache/x.md"), "excluded");
check(whole.resolvePath("Private2/x.md") === "Private2/x.md", "exclusion prefix collision remains visible");

const preferred = new WorkspacePolicy({
	workspaceMode: "preferred-folder",
	workspaceFolder: "Projects/Alpha",
	workspaceExcludedFolders: ["Projects/Alpha/vendor"],
});
check(preferred.resolvePath("note.md") === "Projects/Alpha/note.md", "Preferred prefixes relative direct path");
check(preferred.resolvePath("Projects/Alpha/note.md") === "Projects/Alpha/note.md", "Preferred does not double-prefix rooted path");
check(preferred.resolveBrowseFolder("") === "", "Preferred browse remains vault-wide");
check(preferred.assertVisiblePath("Elsewhere/readme.md") === "Elsewhere/readme.md", "Preferred existing-file visibility remains vault-wide");
throws("Preferred direct path exclusion enforced after routing", () => preferred.resolvePath("vendor/pkg.md"), "excluded");
throws("Preferred rejects traversal instead of prefixing it", () => preferred.resolvePath("../secret.md"), "refused");

const strict = new WorkspacePolicy({
	workspaceMode: "strict-folder",
	workspaceFolder: "Projects/Alpha",
	workspaceExcludedFolders: ["Projects/Alpha/private", "Other"],
});
check(Object.isFrozen(strict) && Object.isFrozen(strict.exclusions), "policy snapshot and exclusions are immutable");
check(strict.resolvePath("note.md") === "Projects/Alpha/note.md", "Strict prefixes relative direct path");
check(strict.resolveBrowseFolder("") === "Projects/Alpha", "Strict empty browse starts at root");
check(strict.assertVisiblePath("Projects/Alpha/in.md") === "Projects/Alpha/in.md", "Strict accepts in-root existing file");
throws("Strict rejects visible path outside root", () => strict.assertVisiblePath("Projects/Alpha2/out.md"), "outside");
throws("Strict exclusion exact root", () => strict.assertVisiblePath("Projects/Alpha/private"), "excluded");
throws("Strict exclusion child", () => strict.assertVisiblePath("Projects/Alpha/private/x.md"), "excluded");
check(strict.assertVisiblePath("Projects/Alpha/private2/x.md").endsWith("x.md"), "Strict exclusion prefix collision accepted");
check(strict.partitionKey && /^[a-z0-9-]+$/.test(strict.partitionKey), "Strict deterministic safe partition key");
check(strict.partitionKey === new WorkspacePolicy({ workspaceMode: "strict-folder", workspaceFolder: "Projects/Alpha" }).partitionKey, "partition key deterministic");
check(strict.partitionKey !== new WorkspacePolicy({ workspaceMode: "strict-folder", workspaceFolder: "Projects/Beta" }).partitionKey, "different roots partition separately");

for (const root of ["", "../Outside", ".obsidian", ".obsidian/plugins", "Vault/../Outside", "/Absolute", "C:\\Outside"]) {
	const p = new WorkspacePolicy({ workspaceMode: "strict-folder", workspaceFolder: root });
	check(!p.valid, `Strict malformed/protected root remains invalid: ${JSON.stringify(root)}`);
	throws(`Strict malformed/protected root fails closed: ${JSON.stringify(root)}`, () => p.resolveBrowseFolder(""), "invalid");
}
throws("missing Strict root folder fails closed", () => strict.assertReady(false), "does not exist");

const cleanEx = sanitizeWorkspaceExclusions([" A\\B ", "A/B", "../bad", 7, "C"]);
check(JSON.stringify(cleanEx) === JSON.stringify(["A/B", "C"]), "exclusion sanitizer canonicalizes, dedupes, drops malformed entries");
check(partitionManagedFolder("openagent/memory", strict) === `openagent/memory/workspaces/${strict.partitionKey}`, "Strict memory/skills root project-partitioned");
check(partitionManagedFolder("openagent/memory", whole) === "openagent/memory", "Whole managed root remains compatible");
check(workspaceSessionPartition(strict) === `${strict.partitionKey}/${strict.scopeKey}`, "Strict plugin-private session partition matches full exposure scope");
check(
	workspaceSessionPartition(strict) !== workspaceSessionPartition(new WorkspacePolicy({
		workspaceMode: "strict-folder",
		workspaceFolder: "Projects/Alpha",
		workspaceExcludedFolders: ["Projects/Alpha/private", "Projects/Alpha/new-private"],
	})),
	"Strict session history repartitions when exclusions change"
);
check(workspaceSessionPartition(preferred) === "", "Preferred session storage remains compatible");
throws("managed config path refused", () => partitionManagedFolder(".obsidian/plugins/x", whole), "protected");

if (failed) {
	console.error(`\n${failed} workspace policy test(s) failed.`);
	process.exit(1);
}
console.log("\nAll workspace policy tests passed.");
