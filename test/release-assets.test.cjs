const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
	const {
		assertTrackedTreeClean,
		buildFinalReport,
		buildSourceManifest,
		checksumLine,
		parsePublishArgs,
		planSettingsWitnessUpdate,
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

		/* Regression guard (run 32653162333): the release must fail closed the
		   moment ANY tracked file drifts — the settings witness rewrite used to
		   dirty the tree mid-pipeline and the failure surfaced only as a bare
		   exit code 1 at the very end. */
		writeFileSync(join(repo, "README.md"), "tracked source — drifted\n");
		assert.throws(() => assertTrackedTreeClean(repo), /Tracked source is dirty/);
		passed++;
		console.log("✓ clean-tree assertion names the drifted tracked file");
		assert.throws(
			() =>
				prepareReleaseAssets({
					root: repo,
					releaseDir,
					version: "0.1.151",
					buildStamp: "2026-08-23 16:00Z",
					reconstructed: true,
					preview: "skipped",
					pdfProof: "fixture CI",
				}),
			/Tracked source is dirty/,
		);
		passed++;
		console.log("✓ asset preparation fails closed on a dirty tracked tree");
		writeFileSync(join(repo, "README.md"), "tracked source\n");
		assertTrackedTreeClean(repo);
		passed++;
		console.log("✓ restored tracked tree passes the clean assertion again");
	} finally {
		rmSync(repo, { recursive: true, force: true });
	}

	/* Regression guard (run 32653162333): the settings harness witness is a
	   TRACKED file rewritten with a fresh timestamp on every run — that churn
	   alone guaranteed a dirty tree before the clean-tree check existed a
	   stable answer for. The planner decides when the tracked witness may be
	   touched; a release run (readonly) may never touch it. */
	{
		const probesA = { F1: { fixed: true }, F2: { fixed: true, count: 2 } };
		const tracked = JSON.stringify({ at: "2026-08-23T00:00:00.000Z", probes: probesA }, null, 2);

		const same = planSettingsWitnessUpdate({ trackedJson: tracked, freshProbes: probesA, readonly: false, now: "2026-08-24T09:00:00.000Z" });
		check(same.writeTracked === false, "identical probe results never rewrite the tracked witness (no timestamp churn)");

		const probesB = { F1: { fixed: true }, F2: { fixed: true, count: 3 } };
		const dev = planSettingsWitnessUpdate({ trackedJson: tracked, freshProbes: probesB, readonly: false, now: "2026-08-24T09:00:00.000Z" });
		check(dev.writeTracked === true && JSON.parse(dev.trackedText).probes.F2.count === 3, "changed probe results rewrite the witness outside release runs");
		check(JSON.parse(dev.trackedText).at === "2026-08-24T09:00:00.000Z", "witness rewrite stamps the run it records");

		const ro = planSettingsWitnessUpdate({ trackedJson: tracked, freshProbes: probesB, readonly: true, now: "2026-08-24T09:00:00.000Z" });
		check(ro.writeTracked === false, "readonly release runs never rewrite the tracked witness");
		check(typeof ro.notice === "string" && ro.notice.length > 0, "readonly release runs surface witness drift as a notice, not a silent skip");

		const roSame = planSettingsWitnessUpdate({ trackedJson: tracked, freshProbes: probesA, readonly: true, now: "2026-08-24T09:00:00.000Z" });
		check(roSame.writeTracked === false && roSame.notice === null, "readonly runs with matching probes stay silent and clean");

		const missingDev = planSettingsWitnessUpdate({ trackedJson: null, freshProbes: probesA, readonly: false, now: "2026-08-24T09:00:00.000Z" });
		check(missingDev.writeTracked === true, "a missing witness is created outside release runs");
		const missingRo = planSettingsWitnessUpdate({ trackedJson: null, freshProbes: probesA, readonly: true, now: "2026-08-24T09:00:00.000Z" });
		check(missingRo.writeTracked === false && typeof missingRo.notice === "string", "readonly runs never create the witness themselves");
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
