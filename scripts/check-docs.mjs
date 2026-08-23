/**
 * Source, documentation, metadata, and repository-hygiene gate.
 *
 * Release ZIP bytes are verified by scripts/release.mjs and live in the
 * ignored release/ directory. A clean source checkout must not depend on a
 * previously committed artifact.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;

function read(rel) {
	return readFileSync(join(root, rel), "utf8");
}

function check(ok, pass, fail = pass) {
	checks++;
	if (ok) console.log(`✓ ${pass}`);
	else failures.push(fail);
}

function mustInclude(rel, needle, label) {
	const abs = join(root, rel);
	check(
		existsSync(abs) && read(rel).includes(needle),
		`${rel} memuat ${JSON.stringify(needle)}`,
		`${rel}: hilang atau tidak memuat ${JSON.stringify(needle)} (${label})`,
	);
}

function mustNotInclude(rel, needle, label) {
	const abs = join(root, rel);
	check(
		existsSync(abs) && !read(rel).includes(needle),
		`${rel} tidak memuat ${JSON.stringify(needle)}`,
		`${rel}: hilang atau masih memuat ${JSON.stringify(needle)} (${label})`,
	);
}

/* Public entry points and maintained workflow. */
mustInclude("README.md", "25 tools in 10 toggleable toolsets", "verified tool inventory");
mustInclude("README.md", "vendor/pdf.worker.min.js", "manual installation keeps the PDF worker");
mustInclude("CONTRIBUTING.md", "npm run verify", "documented contributor gate");
mustInclude("SECURITY.md", "CVE-2024-4367", "documented PDF security boundary");
mustInclude("SECURITY.md", "logical Obsidian-path guarantee", "Workspace symlink/junction boundary is documented honestly");
mustInclude("SECURITY.md", "Terminal & Processes v1", "desktop execution boundary is documented");
mustInclude("SECURITY.md", "Local expert mode is deliberately **unsandboxed**", "Local backend limitation is documented honestly");
mustInclude("docs/reference/workspace-security.md", "Strict folder boundary", "Workspace mode contract is documented");
mustInclude("docs/reference/workspace-security.md", "1,000 to 20,000 characters", "file-read ceiling and paging contract are documented");
mustInclude("package.json", '"check:docs"', "this gate remains registered");
mustInclude("package.json", '"check:skills"', "development-skill gate remains registered");
mustInclude("package.json", '"verify"', "complete source gate remains registered");
mustInclude("package.json", '"publish:release"', "explicit GitHub Release publisher remains registered");
mustInclude("scripts/release.mjs", "prepareReleaseAssets", "release pipeline prepares the complete GitHub asset set");
mustInclude("scripts/publish-release.mjs", "verifyGithubCiProof", "publisher binds browser proof to the exact commit");
mustInclude("scripts/publish-release.mjs", "GITHUB RELEASE PUBLISHED AND VERIFIED", "publisher verifies uploaded bytes before success");
mustInclude("RELEASES.md", "github.com/anythinguseful/obsidian-openagent/releases", "GitHub Releases is the durable release archive");
mustNotInclude("RELEASES.md", "releases/vN/openagent-vN-final-report.md", "dead machine-local release-report contract");
mustInclude("agents/arena/workflows/release.md", "npm run publish:release", "Arena release workflow includes explicit publication");
mustInclude("agents/arena/workflows/release-github-actions.yml", "workflow_dispatch:", "owner-installable GitHub release transport remains manual-only");
mustInclude("agents/arena/workflows/release-github-actions.yml", "contents: write", "release workflow declares the narrow permission required to upload assets");
mustInclude("skills/internal/openagent-docs/SKILL.md", "GitHub Release assets", "documentation routing points to durable release proof");
mustInclude("skills/internal/openagent-ui/SKILL.md", "preview/index.html", "preview workflow points to the maintained hub");
mustNotInclude("skills/internal/openagent-ui/SKILL.md", "test/preview-final.html", "dead preview path");
mustNotInclude("skills/internal/openagent-ui/SKILL.md", "test/preview.html", "dead preview path");

/* Version metadata must move as one unit. */
const manifest = JSON.parse(read("manifest.json"));
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const versions = JSON.parse(read("versions.json"));
const versionKeys = Object.keys(versions);
const lastVersion = versionKeys.at(-1);
check(manifest.version === pkg.version, `manifest.json version == package.json version (${manifest.version})`, `manifest.json version (${manifest.version}) != package.json version (${pkg.version})`);
check(lock.version === manifest.version, `package-lock.json version == manifest.version (${manifest.version})`, `package-lock.json version (${lock.version}) != manifest.version (${manifest.version})`);
check(lock.packages?.[""]?.version === manifest.version, `package-lock root package version == manifest.version (${manifest.version})`, `package-lock root package version (${lock.packages?.[""]?.version}) != manifest.version (${manifest.version})`);
check(lastVersion === manifest.version, `versions.json last key == manifest.version (${lastVersion})`, `versions.json last key (${lastVersion}) != manifest.version (${manifest.version})`);
check(versions[manifest.version] === manifest.minAppVersion, `versions.json[${manifest.version}] == manifest.minAppVersion (${manifest.minAppVersion})`, `versions.json[${manifest.version}] (${versions[manifest.version]}) != manifest.minAppVersion (${manifest.minAppVersion})`);

/* Release binaries belong to ignored release/, never to the source root. */
const rootReleaseZips = readdirSync(root).filter((name) => /^openagent-obsidian-plugin.*\.zip$/i.test(name));
check(rootReleaseZips.length === 0, "source root contains no release ZIPs", `source root contains release ZIPs: ${rootReleaseZips.join(", ")}`);
check(existsSync(join(root, "LICENSE")) && read("LICENSE").startsWith("MIT License"), "LICENSE contains the MIT license", "LICENSE missing or not the declared MIT license");

/* Every repository document remains directly renderable in GitHub/Obsidian. */
mustInclude("docs/README.md", "Open Agent — Documentation", "documentation hub");
const docsMd = [];
(function walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const abs = join(dir, entry.name);
		if (entry.isDirectory()) walk(abs);
		else if (entry.name.endsWith(".md")) docsMd.push(abs);
	}
})(join(root, "docs"));
const REQUIRED_FRONTMATTER = ["title", "type", "status", "date", "tags"];
const ALLOWED_STATUSES = new Set(["active", "done", "draft", "archived"]);
const docMeta = new Map();
const invalidDocs = [];
for (const abs of docsMd) {
	const rel = relative(root, abs).replaceAll("\\", "/");
	const match = readFileSync(abs, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
	if (!match) { invalidDocs.push(`${rel} (missing frontmatter)`); continue; }
	const fields = Object.fromEntries(
		match[1]
			.split(/\r?\n/)
			.map((line) => line.match(/^([a-z]+):\s*(.*)$/i))
			.filter(Boolean)
			.map((row) => [row[1], row[2].trim()]),
	);
	const missing = REQUIRED_FRONTMATTER.filter((key) => !fields[key]);
	if (missing.length) invalidDocs.push(`${rel} (missing ${missing.join(", ")})`);
	else if (!ALLOWED_STATUSES.has(fields.status)) invalidDocs.push(`${rel} (invalid status ${fields.status})`);
	else docMeta.set(rel, fields);
}
check(
	invalidDocs.length === 0,
	`docs: ${docsMd.length} Markdown files have complete frontmatter and an allowed status`,
	`docs frontmatter failures: ${invalidDocs.join("; ")}`,
);

/* The hub is the durable inventory; material docs must be listed with the same status. */
const hub = read("docs/README.md");
const hubFailures = [];
for (const dir of ["plans", "studies", "audits", "reference"]) {
	for (const entry of readdirSync(join(root, "docs", dir), { withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "_TEMPLATE.md") continue;
		const target = `${dir}/${entry.name}`;
		const rel = `docs/${target}`;
		const status = docMeta.get(rel)?.status;
		if (!hub.includes(`](${target})`)) hubFailures.push(`${rel} is not listed`);
		else if (status && !hub.includes(`](${target}) | ${status} |`)) hubFailures.push(`${rel} hub status != ${status}`);
	}
}
check(hubFailures.length === 0, "docs hub lists every material document with matching status", `docs hub drift: ${hubFailures.join("; ")}`);

// Lesson 181: guards moved into test/smoke/ sit one directory deeper, so any
// surviving __dirname silently repoints and the guard reads the wrong file (or
// throws). Every literal path in the smoke modules must resolve, and only the
// harness may anchor itself with __dirname.
const smokeDir = join(root, "test", "smoke");
const smokePathFailures = [];
const smokeDirnameFailures = [];
for (const entry of readdirSync(smokeDir, { withFileTypes: true })) {
	if (!entry.isFile() || !entry.name.endsWith(".cjs")) continue;
	const rel = `test/smoke/${entry.name}`;
	const source = read(rel);
	const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
	if (entry.name !== "harness.cjs" && /\b__dirname\b/.test(code)) {
		smokeDirnameFailures.push(rel);
	}
	for (const match of code.matchAll(/path\.join\(\s*ROOT\s*,\s*([^)]+)\)/g)) {
		const segments = [...match[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
		if (segments.length === 0 || /[^\s",]/.test(match[1].replace(/"[^"]*"/g, "").replace(/,/g, ""))) continue;
		if (!existsSync(join(root, ...segments))) {
			smokePathFailures.push(`${rel}: ROOT/${segments.join("/")}`);
		}
	}
}
check(
	smokePathFailures.length === 0,
	"smoke modules: every literal ROOT-anchored path resolves",
	`smoke module path drift: ${smokePathFailures.join("; ")}`,
);
check(
	smokeDirnameFailures.length === 0,
	"smoke modules: only the harness anchors on __dirname",
	`__dirname outside the smoke harness (breaks when guards move deeper): ${smokeDirnameFailures.join("; ")}`,
);

console.log(`\n${checks} source/docs checks, ${failures.length} failure(s)`);
if (failures.length > 0) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("All source/docs checks passed.");
