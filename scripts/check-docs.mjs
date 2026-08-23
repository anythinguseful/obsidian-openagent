/**
 * Source, documentation, metadata, and repository-hygiene gate.
 *
 * Release ZIP bytes are verified by scripts/release.mjs and live in the
 * ignored release/ directory. A clean source checkout must not depend on a
 * previously committed artifact.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
const invalidDocs = docsMd
	.filter((abs) => {
		const match = readFileSync(abs, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
		return !match || !match[1].includes("title:") || !match[1].includes("type:") || !match[1].includes("status:");
	})
	.map((abs) => abs.slice(root.length + 1));
check(invalidDocs.length === 0, `docs: ${docsMd.length} Markdown files have title/type/status frontmatter`, `docs missing required frontmatter: ${invalidDocs.join(", ")}`);

console.log(`\n${checks} source/docs checks, ${failures.length} failure(s)`);
if (failures.length > 0) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("All source/docs checks passed.");
