/**
 * Release pipeline — one command runs the whole ritual, in order:
 *
 *   typecheck → build → tests → adversarial PDF browser → docs → preview (+ settings audit) → zip → verify
 *
 * Born from the "stale build / ZIP drift" incidents: every artifact the user
 * receives must be produced by this single run, and the final step verifies
 * the zip contents byte-for-byte against the just-built files in the repo
 * (styles.css is the one exception: zip-minified, sentinel-verified instead).
 *
 * Usage:
 *   npm run release                                      full local pipeline
 *   npm run release -- --skip-preview                    preview-only fallback
 *   npm run release -- --github-ci-proof --skip-preview  exact-commit CI browser proof
 *   npm run release -- --reconstructed                   disclose rebuilt historical bytes
 *
 * Exit code is non-zero on the first failing step (nothing half-shipped).
 */

import { execFileSync } from "node:child_process";
import { transformSync } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareReleaseAssets, verifyGithubCiProof } from "./release-assets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const releaseDir = join(root, "release");
const zipDest = join(releaseDir, `openagent-obsidian-plugin-v${manifest.version}.zip`);
const skipPreview = process.argv.includes("--skip-preview");
const useGithubCiProof = process.argv.includes("--github-ci-proof");
const reconstructed = process.argv.includes("--reconstructed");
const ARTIFACTS = ["main.js", "manifest.json", "styles.css", "vendor/pdf.worker.min.js"];
const STAMP_RE = /20\d\d-\d\d-\d\d \d\d:\d\dZ/;

function step(name, cmd, args, opts = {}) {
	process.stdout.write(`\n== ${name}\n`);
	try {
		execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
	} catch {
		console.error(`\n✗ release stopped: "${name}" failed (see output above).`);
		process.exit(1);
	}
}

/* 1–3: typecheck, build, tests */
step("typecheck", "npx", ["tsc", "-noEmit", "-skipLibCheck"]);
step("build", "node", ["esbuild.config.mjs", "production"]);
step("tests", "npm", ["test"]);
let pdfProof = "local adversarial PDF browser suite";
if (useGithubCiProof) {
	const proof = verifyGithubCiProof(root);
	pdfProof = `exact-commit GitHub CI ${proof.url}`;
	console.log(`\n== PDF security browser\n   verified by exact-commit GitHub CI: ${proof.url}`);
} else {
	step("PDF security browser", "npm", ["run", "test:pdf-security"]);
}
step("source/docs", "npm", ["run", "check:docs"]);
step("development skills", "npm", ["run", "check:skills"]);

/* 4: preview pages (real-render frames need headless Chromium) */
if (skipPreview) {
	console.log("\n== preview skipped (--skip-preview) — preview/ left as-is");
} else {
	step("preview", "node", ["test/build-preview.mjs"]);
	step("settings preview", "node", ["test/real-preview/build-settings.mjs"]);
}

/* 5: stage + zip (paths inside the archive must be "openagent/<file>") */
const stamp = readFileSync(join(root, "main.js"), "utf8").match(STAMP_RE)?.[0];
if (!stamp) {
	console.error("✗ build stamp missing from main.js — refusing to package a stale/unmarked build.");
	process.exit(1);
}
/* v0.1.131 (audit batch 4): styles.css di-minify KHUSUS ZIP — file repo
   tetap terbaca penuh komentar (pin smoke + dokumentasi menjangkar ke
   layout sumbernya), Obsidian hanya pernah melihat byte staging. Minifier
   css esbuild semantics-preserving dan memang sudah jadi build tool kita
   (nol dependensi baru). Sentinel di bawah secara sengaja substring polos
   tanpa spasi: nama class tidak pernah ditulis ulang minifier. */
const CSS_SENTINELS = [".oa-app", ".oa-composer", ".oa-selbar-btn", ".oa-msg-attach", ".oa-prompt-input"];
function minifyCssForZip(absSrc, absDest) {
	const src = readFileSync(absSrc, "utf8");
	const out = transformSync(src, { loader: "css", minify: true }).code;
	for (const sel of CSS_SENTINELS) {
		if (!out.includes(sel)) {
			throw new Error(`minified styles.css lost sentinel selector ${sel} — refusing to package.`);
		}
	}
	writeFileSync(absDest, out);
	console.log(`   css zip-minify: ${src.length} → ${out.length} B`);
}
const staging = join(tmpdir(), `oa-pkg-${process.pid}`);
rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, "openagent", "vendor"), { recursive: true });
for (const f of ARTIFACTS) {
	if (f === "styles.css") minifyCssForZip(join(root, f), join(staging, "openagent", f));
	else copyFileSync(join(root, f), join(staging, "openagent", f));
}
mkdirSync(releaseDir, { recursive: true });
rmSync(zipDest, { force: true });
step("zip", "zip", ["-q", "-r", zipDest, "openagent"], { cwd: staging });

/* 6: verify — staged bytes identical to repo files + stamp present */
let ok = true;
for (const f of ARTIFACTS) {
	const a = readFileSync(join(root, f));
	const b = readFileSync(join(staging, "openagent", f));
	if (f === "styles.css") {
		/* zip-only minify: byte-equality mustahil BY DESIGN — buktikan staged
		   bytes reparse bersih (esbuild melempar pada css invalid), semua
		   sentinel bertahan, dan memang lebih kecil dari sumber */
		let mOk = b.length < a.length && CSS_SENTINELS.every((sel) => b.includes(sel));
		try {
			transformSync(b.toString("utf8"), { loader: "css", minify: true });
		} catch {
			mOk = false;
		}
		console.log(`${mOk ? "MATCH" : "DIFF "} ${f} (zip-minified, sentinel-verified)`);
		if (!mOk) ok = false;
		continue;
	}
	const match = Buffer.compare(a, b) === 0;
	console.log(`${match ? "MATCH" : "DIFF "} ${f}`);
	if (!match) ok = false;
}
if (!ok) {
	console.error("✗ staged files differ from the repo — zip discarded.");
	rmSync(zipDest, { force: true });
	rmSync(staging, { recursive: true, force: true });
	process.exit(1);
}
console.log(`build stamp: ${stamp}`);
console.log(`zip size: ${statSync(zipDest).size} bytes → ${zipDest}`);
rmSync(staging, { recursive: true, force: true });

const prepared = prepareReleaseAssets({
	root,
	releaseDir,
	version: manifest.version,
	buildStamp: stamp,
	reconstructed,
	preview: skipPreview ? "skipped (--skip-preview)" : "chat and Settings real-DOM passed",
	pdfProof,
});
console.log("\n== GitHub Release assets ready");
for (const asset of prepared.assets) console.log(`   ${asset.name} (${asset.size} B, ${asset.sha256})`);

console.log("\nZIP SYNCED");
