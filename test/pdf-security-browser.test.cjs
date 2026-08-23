const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const { spawnSync } = require("child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const outDir = path.join(__dirname, "dist");
const out = path.join(outDir, "pdf-security-browser.js");
const fixtureDir = path.join(__dirname, "fixtures", "pdf-security");
const executablePath = process.env.OA_CHROMIUM_EXECUTABLE || undefined;

async function launchBrowser() {
	try {
		return await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
	} catch (error) {
		if (executablePath) throw error;
		console.error("pdf-security: Chromium unavailable — installing headless shell + system deps, one retry…");
		const installed = spawnSync("npx", ["playwright", "install", "--with-deps", "chromium-headless-shell"], {
			cwd: root,
			stdio: "inherit",
		});
		if (installed.status !== 0) throw error;
		return chromium.launch({ headless: true });
	}
}

async function main() {
	fs.mkdirSync(outDir, { recursive: true });
	await esbuild.build({
		entryPoints: [path.join(__dirname, "pdf-security-browser-entry.ts")],
		bundle: true,
		format: "iife",
		platform: "browser",
		target: "chrome114",
		outfile: out,
		external: ["canvas"],
		logLevel: "silent",
	});

	const fixtures = Object.fromEntries(
		fs.readdirSync(fixtureDir)
			.filter((name) => name.endsWith(".pdf"))
			.map((name) => [name, fs.readFileSync(path.join(fixtureDir, name)).toString("base64")])
	);
	const input = {
		worker: fs.readFileSync(path.join(root, "vendor", "pdf.worker.min.js")).toString("base64"),
		fixtures,
	};
	const bundle = fs.readFileSync(out, "utf8").replace(/<\/script>/gi, "<\\/script>");
	const html = `<!doctype html><meta charset="utf-8"><script>window.__oaPdfSecurityInput=${JSON.stringify(input)};<\/script><script>${bundle}<\/script>`;

	const browser = await launchBrowser();
	console.log(`browser: ${await browser.version()}`);
	const page = await browser.newPage();
	const diagnostics = [];
	page.on("console", (message) => diagnostics.push(`[console:${message.type()}] ${message.text()}`));
	page.on("pageerror", (error) => diagnostics.push(`[pageerror] ${String(error)}`));
	try {
		await page.setContent(html, { waitUntil: "load", timeout: 20_000 });
		await page.waitForFunction(() => window.__oaPdfSecurityDone === true, null, { timeout: 45_000 });
		const result = await page.evaluate(() => window.__oaPdfSecurityResult);
		if (!result) throw new Error("browser harness returned no result");
		for (const label of result.checks) console.log(`✓ ${label}`);
		for (const label of result.failures) console.error(`✗ ${label}`);
		console.log(`metrics: ${JSON.stringify(result.metrics)}`);
		if (diagnostics.length) console.log(diagnostics.join("\n"));
		if (!result.ok) process.exitCode = 1;
	} finally {
		await browser.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
