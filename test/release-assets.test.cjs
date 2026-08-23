const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
	const {
		buildFinalReport,
		buildSourceManifest,
		checksumLine,
		parsePublishArgs,
		prepareReleaseAssets,
		releaseAssetPaths,
		runWithRetries,
		selectSuccessfulCiCheck,
		sha256Buffer,
		verifyReleaseAssetSet,
	} = await import(pathToFileURL(join(__dirname, "../scripts/release-assets.mjs")).href);

	let passed = 0;
	function check(ok, label) {
		assert.equal(Boolean(ok), true, label);
		passed++;
		console.log(`✓ ${label}`);
	}

	check(
		sha256Buffer(Buffer.from("abc")) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		"SHA-256 uses the standard digest",
	);
	check(
		checksumLine("a".repeat(64), "/tmp/openagent.zip") === `${"a".repeat(64)}  openagent.zip\n`,
		"checksum line stores the asset basename in sha256sum format",
	);

	const manifest = buildSourceManifest([
		{ path: "z.txt", content: Buffer.from("last") },
		{ path: "a file.txt", content: Buffer.from("first") },
	]);
	check(manifest.split("\n")[0].endsWith("  a file.txt"), "source manifest is path-sorted");
	check(manifest.split("\n")[1].endsWith("  z.txt"), "source manifest keeps every tracked path");

	const report = buildFinalReport({
		version: "0.1.151",
		commit: "1".repeat(40),
		buildStamp: "2026-08-23 16:00Z",
		generatedAt: "2026-08-23T16:05:00.000Z",
		reconstructed: true,
		preview: "skipped (--skip-preview)",
		pdfProof: "GitHub CI https://github.example/run/7",
		assets: [
			{ name: "openagent-obsidian-plugin-v0.1.151.zip", size: 123, sha256: "a".repeat(64) },
		],
	});
	check(report.includes("Reconstructed verification release"), "report discloses reconstructed v0.1.151 bytes");
	check(report.includes("not the missing historical artifact bytes"), "report rejects false historical byte identity");
	check(report.includes("GitHub CI https://github.example/run/7"), "report records exact browser proof");

	const root = mkdtempSync(join(tmpdir(), "oa-release-assets-test-"));
	try {
		const paths = releaseAssetPaths(root, "0.1.151");
		writeFileSync(paths.pluginZip, "plugin");
		writeFileSync(paths.pluginChecksum, checksumLine(sha256Buffer(Buffer.from("plugin")), paths.pluginZip));
		writeFileSync(paths.sourceZip, "source");
		writeFileSync(paths.sourceChecksum, checksumLine(sha256Buffer(Buffer.from("source")), paths.sourceZip));
		writeFileSync(paths.sourceManifest, `${"b".repeat(64)}  README.md\n`);
		writeFileSync(paths.finalReport, "verified report\n");

		const verified = verifyReleaseAssetSet(paths);
		check(verified.assets.length === 6, "asset verifier requires all six GitHub Release files");
		check(verified.assets.find((x) => x.name.endsWith("plugin-v0.1.151.zip")).sha256 === sha256Buffer(Buffer.from("plugin")), "asset verifier recomputes plugin bytes");

		writeFileSync(paths.pluginZip, "tampered");
		assert.throws(() => verifyReleaseAssetSet(paths), /checksum mismatch/i);
		passed++;
		console.log("✓ asset verifier rejects tampering after checksum generation");

		check(readFileSync(paths.pluginChecksum, "utf8").includes("openagent-obsidian-plugin-v0.1.151.zip"), "checksum remains independently inspectable");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}

	const repo = mkdtempSync(join(tmpdir(), "oa-release-prepare-test-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd: repo });
		execFileSync("git", ["config", "user.name", "Release Test"], { cwd: repo });
		execFileSync("git", ["config", "user.email", "release-test@example.invalid"], { cwd: repo });
		writeFileSync(join(repo, "README.md"), "tracked source\n");
		execFileSync("git", ["add", "README.md"], { cwd: repo });
		execFileSync("git", ["commit", "-q", "-m", "fixture"], { cwd: repo });
		const releaseDir = join(repo, "release");
		mkdirSync(releaseDir);
		writeFileSync(join(releaseDir, "openagent-obsidian-plugin-v0.1.151.zip"), "plugin bytes");
		const prepared = prepareReleaseAssets({
			root: repo,
			releaseDir,
			version: "0.1.151",
			buildStamp: "2026-08-23 16:00Z",
			reconstructed: true,
			preview: "skipped",
			pdfProof: "fixture CI",
		});
		check(prepared.assets.length === 6, "asset preparation produces the complete GitHub inventory");
		check(readFileSync(prepared.paths.sourceManifest, "utf8").includes("  README.md"), "prepared source manifest covers tracked source");
		check(readFileSync(prepared.paths.finalReport, "utf8").includes(prepared.commit), "prepared final report binds the source commit");
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}

	let attempts = 0;
	const retried = runWithRetries(() => {
		attempts++;
		if (attempts < 3) throw new Error("transient upload EOF");
		return "uploaded";
	}, { attempts: 4, delayMs: 0 });
	check(retried === "uploaded" && attempts === 3, "transient upload failures retry without duplicating a successful call");
	attempts = 0;
	assert.throws(() => runWithRetries(() => { attempts++; throw new Error("still down"); }, { attempts: 2, delayMs: 0 }), /still down/);
	check(attempts === 2, "upload retry stops at the configured fail-closed limit");

	const ci = selectSuccessfulCiCheck(
		{
			check_runs: [
				{ name: "other", head_sha: "2".repeat(40), status: "completed", conclusion: "success", html_url: "https://other" },
				{ name: "typecheck · build · test · PDF security · docs", head_sha: "1".repeat(40), status: "completed", conclusion: "failure", html_url: "https://failed" },
				{ name: "typecheck · build · test · PDF security · docs", head_sha: "2".repeat(40), status: "completed", conclusion: "success", html_url: "https://passed" },
			],
		},
		"2".repeat(40),
	);
	check(ci?.html_url === "https://passed", "CI proof binds success to the exact commit and verify job");
	check(selectSuccessfulCiCheck({ check_runs: [] }, "2".repeat(40)) === null, "missing CI proof fails closed");

	const dry = parsePublishArgs([]);
	check(dry.publish === false, "publisher defaults to dry-run");
	const live = parsePublishArgs(["--publish", "--confirm", "v0.1.151"]);
	check(live.publish && live.confirm === "v0.1.151", "publisher requires an explicit versioned confirmation value");
	assert.throws(() => parsePublishArgs(["--publish"]), /--confirm/);
	passed++;
	console.log("✓ publisher rejects mutation without explicit confirmation");

	console.log(`\n${passed} release-asset checks passed.`);
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
