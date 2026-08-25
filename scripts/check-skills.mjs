/**
 * Development-skill integrity gate.
 *
 * The project keeps portable agent instructions in AGENTS.md, project-owned
 * skills in agents/skills/internal/, and reviewed upstream snapshots in agents/skills/vendor/.
 * This checker validates the graph without adding a YAML dependency.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let checks = 0;

function abs(rel) {
	return resolve(root, rel);
}

function read(rel) {
	return readFileSync(abs(rel), "utf8");
}

function check(ok, pass, fail = pass) {
	checks++;
	if (ok) console.log(`✓ ${pass}`);
	else failures.push(fail);
}

function isProjectFile(rel) {
	const target = abs(rel);
	const escaped = relative(root, target).split(sep).includes("..");
	return !escaped && existsSync(target) && statSync(target).isFile();
}

function collectSkillFiles(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const child = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...collectSkillFiles(child));
		else if (entry.name === "SKILL.md") out.push(child.slice(root.length + 1).replaceAll("\\", "/"));
	}
	return out.sort();
}

function parseManifest(text) {
	const entries = [];
	let current = null;
	for (const raw of text.split(/\r?\n/)) {
		const item = raw.match(/^  - name: ([a-z0-9-]+)$/);
		if (item) {
			current = { name: item[1] };
			entries.push(current);
			continue;
		}
		const field = raw.match(/^    (path|upstream|commit|required_for|adapter):\s*(.+)$/);
		if (field && current) current[field[1]] = field[2].trim();
	}
	return entries;
}

check(isProjectFile("AGENTS.md"), "AGENTS.md exists at the repository root", "AGENTS.md is missing from the repository root");
check(isProjectFile("agents/skills/README.md"), "skills registry README exists", "agents/skills/README.md is missing");
check(isProjectFile("agents/skills/manifest.yaml"), "machine-readable skills manifest exists", "agents/skills/manifest.yaml is missing");
check(isProjectFile("agents/arena/README.md"), "Arena workflow guide exists", "agents/arena/README.md is missing");

const manifestText = isProjectFile("agents/skills/manifest.yaml") ? read("agents/skills/manifest.yaml") : "";
const entries = parseManifest(manifestText);
const names = new Set(entries.map((entry) => entry.name));
check(entries.length >= 7, `skills manifest declares ${entries.length} skills`, "skills manifest has too few declared skills");
check(names.size === entries.length, "skills manifest names are unique", "skills manifest contains duplicate skill names");

const declaredPaths = new Set();
for (const entry of entries) {
	check(Boolean(entry.path), `manifest ${entry.name} declares a path`, `manifest ${entry.name} has no path`);
	if (!entry.path) continue;
	check(isProjectFile(entry.path), `manifest ${entry.name} path exists`, `manifest ${entry.name} path missing or escapes project: ${entry.path}`);
	declaredPaths.add(entry.path);
	const skill = isProjectFile(entry.path) ? read(entry.path) : "";
	check(
		skill.startsWith("---\n") && skill.includes(`name: ${entry.name}\n`) && skill.includes("description:"),
		`${entry.name} has Agent Skills frontmatter`,
		`${entry.name} SKILL.md lacks matching name/description frontmatter`,
	);
	if (entry.upstream) {
		check(/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(entry.upstream), `${entry.name} records an upstream repository`, `${entry.name} has invalid upstream identifier: ${entry.upstream}`);
		check(/^[0-9a-f]{40}$/i.test(entry.commit ?? ""), `${entry.name} pins a 40-character commit SHA`, `${entry.name} lacks a pinned 40-character upstream commit`);
		const parts = entry.path.split("/");
		const vendorIdx = parts.indexOf("vendor");
		const vendor = vendorIdx >= 0 ? parts.slice(0, vendorIdx + 2).join("/") : "";
		check(isProjectFile(`${vendor}/UPSTREAM.md`), `${entry.name} vendor provenance exists`, `${entry.name} is missing ${vendor}/UPSTREAM.md`);
	}
	if (entry.adapter) check(isProjectFile(entry.adapter), `${entry.name} adapter exists`, `${entry.name} adapter missing: ${entry.adapter}`);
}

check(!existsSync(abs("skills")), "root skills/ is gone — development skills live under agents/skills/", "root skills/ still exists; move it to agents/skills/");
const actualSkills = collectSkillFiles(abs("agents/skills"));
const missingManifest = actualSkills.filter((path) => !declaredPaths.has(path));
const missingFiles = [...declaredPaths].filter((path) => !actualSkills.includes(path));
check(missingManifest.length === 0, "every tracked SKILL.md is declared in the manifest", `SKILL.md files missing from manifest: ${missingManifest.join(", ")}`);
check(missingFiles.length === 0, "every manifest path resolves to a tracked SKILL.md", `manifest paths not found among SKILL.md files: ${missingFiles.join(", ")}`);

const required = [
	"openagent-ui",
	"functional-ui",
	"openagent-docs",
	"frontend-design",
	"skill-creator",
	"doc-coauthoring",
	"webapp-testing",
	"web-design-guidelines",
	"writing-guidelines",
	"handoff",
	"tdd",
	"diagnosing-bugs",
];
check(required.every((name) => names.has(name)), "required internal and approved vendor skills are registered", `missing required skills: ${required.filter((name) => !names.has(name)).join(", ")}`);

const agents = isProjectFile("AGENTS.md") ? read("AGENTS.md") : "";
for (const needle of [
	"docs/working-agreement.md",
	"agents/skills/README.md",
	"agents/skills/internal/openagent-ui/SKILL.md",
	"agents/skills/vendor/mattpocock/handoff/SKILL.md",
	"agents/skills/vendor/mattpocock/tdd/SKILL.md",
	"agents/skills/vendor/mattpocock/diagnosing-bugs/SKILL.md",
]) check(agents.includes(needle), `AGENTS.md routes ${needle}`, `AGENTS.md does not route ${needle}`);
check(agents.includes("Do not create `.arena/`"), "AGENTS.md rejects the non-persistent .arena directory", "AGENTS.md does not reject .arena/ explicitly");

const handoff = isProjectFile("agents/arena/workflows/handoff.md") ? read("agents/arena/workflows/handoff.md") : "";
check(handoff.includes("agents/arena/handoffs/YYYY-MM-DD--short-topic.md"), "handoff adapter uses a persistent workspace destination", "handoff adapter lacks the persistent handoff destination");
const gitignore = isProjectFile(".gitignore") ? read(".gitignore") : "";
check(gitignore.includes("agents/arena/handoffs/*.md"), "Git ignores session handoff documents", "session handoff documents are not ignored by Git");
check(isProjectFile("agents/arena/handoffs/.gitkeep"), "handoff destination remains discoverable", "agents/arena/handoffs/.gitkeep is missing");

console.log(`\n${checks} skill checks, ${failures.length} failure(s)`);
if (failures.length) {
	for (const failure of failures) console.error(`✗ ${failure}`);
	process.exit(1);
}
console.log("All development-skill checks passed.");
