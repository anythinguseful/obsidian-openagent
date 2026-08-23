#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertTrackedTreeClean,
	currentCommit,
	parsePublishArgs,
	releaseAssetPaths,
	sha256File,
	verifyGithubCiProof,
	verifyReleaseAssetSet,
} from "./release-assets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = join(root, "release");

function run(cmd, args, options = {}) {
	return execFileSync(cmd, args, { cwd: root, encoding: "utf8", ...options });
}

function readJson(rel) {
	return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function assertVersionMetadata(version) {
	const manifest = readJson("manifest.json");
	const pkg = readJson("package.json");
	const lock = readJson("package-lock.json");
	const versions = readJson("versions.json");
	const last = Object.keys(versions).at(-1);
	if (manifest.version !== version || pkg.version !== version || lock.version !== version || lock.packages?.[""]?.version !== version || last !== version) {
		throw new Error(`Version metadata is not synchronized at ${version}.`);
	}
	if (versions[version] !== manifest.minAppVersion) throw new Error(`versions.json does not map ${version} to ${manifest.minAppVersion}.`);
}

function assertCommitPushed(head) {
	const refs = run("git", ["ls-remote", "origin"]);
	if (!refs.split(/\r?\n/).some((line) => line.startsWith(`${head}\t`))) {
		throw new Error(`Commit ${head} is not the tip of any pushed origin ref.`);
	}
}

function assertReleaseAbsent(tag) {
	const remoteTag = run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`]).trim();
	if (remoteTag) throw new Error(`Remote tag ${tag} already exists; published releases are immutable.`);

	const viewed = spawnSync("gh", ["release", "view", tag, "--json", "tagName"], { cwd: root, encoding: "utf8" });
	if (viewed.status === 0) throw new Error(`GitHub Release ${tag} already exists; refusing to rewrite it.`);
	const message = `${viewed.stdout ?? ""}\n${viewed.stderr ?? ""}`;
	if (!/release not found|not found|404/i.test(message)) {
		throw new Error(`Could not prove GitHub Release ${tag} is absent: ${message.trim()}`);
	}
}

function verifyRemoteAssets(tag, localAssets) {
	const remote = JSON.parse(run("gh", ["release", "view", tag, "--json", "url,tagName,assets"]));
	const byName = new Map((remote.assets ?? []).map((asset) => [asset.name, asset]));
	for (const local of localAssets) {
		const asset = byName.get(local.name);
		if (!asset) throw new Error(`Published release is missing ${local.name}.`);
		if (asset.size !== local.size) throw new Error(`Published size mismatch for ${local.name}: ${asset.size} != ${local.size}.`);
	}
	if (byName.size !== localAssets.length) throw new Error(`Published release has ${byName.size} assets; expected exactly ${localAssets.length}.`);

	const dir = mkdtempSync(join(tmpdir(), `oa-release-download-${tag}-`));
	try {
		run("gh", ["release", "download", tag, "--dir", dir, "--clobber"]);
		for (const local of localAssets) {
			const downloaded = join(dir, local.name);
			if (statSync(downloaded).size !== local.size || sha256File(downloaded) !== local.sha256) {
				throw new Error(`Downloaded GitHub asset differs from local verified bytes: ${local.name}.`);
			}
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	return remote.url;
}

function main() {
	const args = parsePublishArgs(process.argv.slice(2));
	const manifest = readJson("manifest.json");
	const version = manifest.version;
	const tag = `v${version}`;
	if (args.publish && args.confirm !== tag) throw new Error(`Confirmation must be exactly --confirm ${tag}.`);

	assertVersionMetadata(version);
	assertTrackedTreeClean(root);
	const head = currentCommit(root);
	if (args.target && args.target !== head) throw new Error(`Prepared assets bind to HEAD ${head}; --target ${args.target} is not allowed.`);
	assertCommitPushed(head);
	const ci = verifyGithubCiProof(root);
	const verified = verifyReleaseAssetSet(releaseAssetPaths(releaseDir, version));
	assertReleaseAbsent(tag);

	console.log(`release preflight: ${tag}`);
	console.log(`source commit: ${head}`);
	console.log(`CI proof: ${ci.url}`);
	for (const asset of verified.assets) console.log(`asset: ${asset.name} (${asset.size} B, ${asset.sha256})`);

	if (!args.publish) {
		console.log("\nDRY RUN — no tag or GitHub Release was created.");
		console.log(`To publish: npm run publish:release -- --publish --confirm ${tag}`);
		return;
	}

	const paths = releaseAssetPaths(releaseDir, version);
	run("gh", [
		"release",
		"create",
		tag,
		"--target",
		head,
		"--title",
		`Open Agent v${version}`,
		"--notes-file",
		paths.finalReport,
		...verified.assets.map((asset) => asset.path),
	], { stdio: "inherit", encoding: undefined });

	const url = verifyRemoteAssets(tag, verified.assets);
	console.log(`\nGITHUB RELEASE PUBLISHED AND VERIFIED: ${url}`);
}

try {
	main();
} catch (err) {
	console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
}
