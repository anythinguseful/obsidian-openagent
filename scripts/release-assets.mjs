import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

export const RELEASE_CI_CHECK_NAME = "typecheck · build · test · PDF security · docs";

export function sha256Buffer(data) {
	return createHash("sha256").update(data).digest("hex");
}

export function sha256File(path) {
	return sha256Buffer(readFileSync(path));
}

export function checksumLine(hash, path) {
	if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error(`Invalid SHA-256 digest for ${path}.`);
	return `${hash.toLowerCase()}  ${basename(path)}\n`;
}

function parseChecksum(text, expectedName) {
	const match = text.match(/^([0-9a-f]{64})  ([^\r\n]+)\r?\n?$/i);
	if (!match) throw new Error(`Invalid checksum file for ${expectedName}.`);
	if (match[2] !== expectedName) {
		throw new Error(`Checksum names ${match[2]}, expected ${expectedName}.`);
	}
	return match[1].toLowerCase();
}

export function buildSourceManifest(entries) {
	return [...entries]
		.map((entry) => {
			const path = String(entry.path).replaceAll("\\", "/");
			if (!path || /[\r\n]/.test(path)) throw new Error(`Unsafe tracked path in source manifest: ${JSON.stringify(path)}`);
			return { path, hash: sha256Buffer(entry.content) };
		})
		.sort((a, b) => a.path.localeCompare(b.path, "en"))
		.map((entry) => `${entry.hash}  ${entry.path}`)
		.join("\n") + "\n";
}

export function releaseAssetPaths(releaseDir, version) {
	const pluginZip = join(releaseDir, `openagent-obsidian-plugin-v${version}.zip`);
	const sourceZip = join(releaseDir, `openagent-v${version}-clean-source.zip`);
	return {
		pluginZip,
		pluginChecksum: `${pluginZip}.sha256`,
		sourceZip,
		sourceChecksum: `${sourceZip}.sha256`,
		sourceManifest: join(releaseDir, `openagent-v${version}-source-manifest.sha256`),
		finalReport: join(releaseDir, `openagent-v${version}-final-report.md`),
	};
}

export function verifyReleaseAssetSet(paths) {
	const ordered = [
		paths.pluginZip,
		paths.pluginChecksum,
		paths.sourceZip,
		paths.sourceChecksum,
		paths.sourceManifest,
		paths.finalReport,
	];
	for (const path of ordered) {
		if (!existsSync(path)) throw new Error(`Required GitHub Release asset is missing: ${basename(path)}`);
		if (!statSync(path).isFile()) throw new Error(`Release asset is not a file: ${basename(path)}`);
	}

	const pluginHash = sha256File(paths.pluginZip);
	const expectedPluginHash = parseChecksum(readFileSync(paths.pluginChecksum, "utf8"), basename(paths.pluginZip));
	if (pluginHash !== expectedPluginHash) throw new Error(`Checksum mismatch for ${basename(paths.pluginZip)}.`);

	const sourceHash = sha256File(paths.sourceZip);
	const expectedSourceHash = parseChecksum(readFileSync(paths.sourceChecksum, "utf8"), basename(paths.sourceZip));
	if (sourceHash !== expectedSourceHash) throw new Error(`Checksum mismatch for ${basename(paths.sourceZip)}.`);

	const assets = ordered.map((path) => ({
		path,
		name: basename(path),
		size: statSync(path).size,
		sha256: sha256File(path),
	}));
	return { assets, pluginHash, sourceHash };
}

export function buildFinalReport({
	version,
	commit,
	buildStamp,
	generatedAt,
	reconstructed,
	preview,
	pdfProof,
	assets,
}) {
	const status = reconstructed ? "Reconstructed verification release" : "Verified release";
	const disclosure = reconstructed
		? "These assets were rebuilt from the tracked v0.1.151 source and verified again. They are not the missing historical artifact bytes, and no historical checksum is claimed."
		: "These assets were produced and verified from the tagged source in the same release run.";
	const rows = assets
		.map((asset) => `| \`${asset.name}\` | ${asset.size} | \`${asset.sha256}\` |`)
		.join("\n");
	return `# Open Agent v${version} — final report\n\n` +
		`**Status:** ${status}  \n` +
		`**Source commit:** \`${commit}\`  \n` +
		`**Build stamp:** ${buildStamp}  \n` +
		`**Generated:** ${generatedAt}  \n\n` +
		`## Verification\n\n` +
		`- Typecheck: passed.\n` +
		`- Production build: passed.\n` +
		`- Unit and smoke tests: passed.\n` +
		`- PDF security browser proof: ${pdfProof}.\n` +
		`- Source/docs and development-skill checks: passed.\n` +
		`- Preview: ${preview}.\n` +
		`- Install ZIP staging: byte/sentinel verified; release command ended with \`ZIP SYNCED\`.\n\n` +
		`## Artifact identity\n\n${disclosure}\n\n` +
		`| Asset | Bytes | SHA-256 |\n| --- | ---: | --- |\n${rows}\n\n` +
		`The source manifest records every tracked path used for the clean-source archive. The two checksum files use standard \`sha256sum\` format.\n`;
}

function git(root, args, options = {}) {
	return execFileSync("git", args, { cwd: root, encoding: "utf8", ...options });
}

export function assertTrackedTreeClean(root) {
	const status = git(root, ["status", "--porcelain", "--untracked-files=no"]).trim();
	if (status) throw new Error(`Tracked source is dirty; commit or restore it before releasing:\n${status}`);
}

export function currentCommit(root) {
	return git(root, ["rev-parse", "HEAD"]).trim();
}

function trackedEntries(root) {
	const names = git(root, ["ls-files", "-z"], { encoding: "buffer" })
		.toString("utf8")
		.split("\0")
		.filter(Boolean);
	return names.map((path) => ({ path, content: readFileSync(join(root, path)) }));
}

export function prepareReleaseAssets({
	root,
	releaseDir,
	version,
	buildStamp,
	reconstructed = false,
	preview,
	pdfProof,
}) {
	assertTrackedTreeClean(root);
	mkdirSync(releaseDir, { recursive: true });
	const paths = releaseAssetPaths(releaseDir, version);
	if (!existsSync(paths.pluginZip)) throw new Error(`Install ZIP is missing: ${paths.pluginZip}`);

	for (const path of [paths.pluginChecksum, paths.sourceZip, paths.sourceChecksum, paths.sourceManifest, paths.finalReport]) {
		rmSync(path, { force: true });
	}

	const commit = currentCommit(root);
	execFileSync(
		"git",
		[
			"archive",
			"--format=zip",
			`--prefix=openagent-v${version}-clean-source/`,
			"-o",
			paths.sourceZip,
			commit,
		],
		{ cwd: root, stdio: "inherit" },
	);

	const pluginHash = sha256File(paths.pluginZip);
	const sourceHash = sha256File(paths.sourceZip);
	writeFileSync(paths.pluginChecksum, checksumLine(pluginHash, paths.pluginZip));
	writeFileSync(paths.sourceChecksum, checksumLine(sourceHash, paths.sourceZip));
	writeFileSync(paths.sourceManifest, buildSourceManifest(trackedEntries(root)));

	const reportAssets = [
		{ path: paths.pluginZip, name: basename(paths.pluginZip), size: statSync(paths.pluginZip).size, sha256: pluginHash },
		{ path: paths.pluginChecksum, name: basename(paths.pluginChecksum), size: statSync(paths.pluginChecksum).size, sha256: sha256File(paths.pluginChecksum) },
		{ path: paths.sourceZip, name: basename(paths.sourceZip), size: statSync(paths.sourceZip).size, sha256: sourceHash },
		{ path: paths.sourceChecksum, name: basename(paths.sourceChecksum), size: statSync(paths.sourceChecksum).size, sha256: sha256File(paths.sourceChecksum) },
		{ path: paths.sourceManifest, name: basename(paths.sourceManifest), size: statSync(paths.sourceManifest).size, sha256: sha256File(paths.sourceManifest) },
	];
	writeFileSync(
		paths.finalReport,
		buildFinalReport({
			version,
			commit,
			buildStamp,
			generatedAt: new Date().toISOString(),
			reconstructed,
			preview,
			pdfProof,
			assets: reportAssets,
		}),
	);

	return { ...verifyReleaseAssetSet(paths), paths, commit };
}

export function selectSuccessfulCiCheck(payload, headSha, name = RELEASE_CI_CHECK_NAME) {
	const runs = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
	return runs.find((run) =>
		run?.name === name &&
		run?.head_sha === headSha &&
		run?.status === "completed" &&
		run?.conclusion === "success"
	) ?? null;
}

export function repositorySlugFromRemote(remote) {
	const text = String(remote).trim().replace(/\.git$/, "");
	const match = text.match(/github\.com[/:]([^/]+\/[^/]+)$/i);
	if (!match) throw new Error(`Could not derive GitHub repository from origin: ${remote}`);
	return match[1];
}

export function verifyGithubCiProof(root) {
	const head = currentCommit(root);
	const remote = git(root, ["remote", "get-url", "origin"]).trim();
	const slug = repositorySlugFromRemote(remote);
	let payload;
	try {
		payload = JSON.parse(execFileSync("gh", ["api", `repos/${slug}/commits/${head}/check-runs`], { cwd: root, encoding: "utf8" }));
	} catch (err) {
		throw new Error(`Could not query GitHub CI proof for ${head}: ${err instanceof Error ? err.message : String(err)}`);
	}
	const run = selectSuccessfulCiCheck(payload, head);
	if (!run) throw new Error(`No successful ${JSON.stringify(RELEASE_CI_CHECK_NAME)} check exists for exact commit ${head}.`);
	return { head, slug, url: run.html_url, id: run.id };
}

export function parsePublishArgs(argv) {
	const out = { publish: false, confirm: "", target: "" };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--publish") out.publish = true;
		else if (arg === "--confirm") out.confirm = argv[++i] ?? "";
		else if (arg === "--target") out.target = argv[++i] ?? "";
		else throw new Error(`Unknown publisher argument: ${arg}`);
	}
	if (out.publish && !out.confirm) throw new Error("Publication requires --confirm vN.");
	return out;
}
