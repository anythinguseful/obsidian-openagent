const { execSync } = require("child_process");
const path = require("path");

const out = path.join(__dirname, "dist", "toolWaterfall.cjs");
execSync(
	`npx esbuild src/agent/toolWaterfall.ts --bundle --platform=node --format=cjs --outfile=${out}`,
	{ cwd: path.join(__dirname, ".."), stdio: "inherit" }
);

const { runPreExecute, runPostExecute, toolErrorMessage } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

(async () => {
	let executed = 0;
	const denied = await runPreExecute([
		async () => ({
			halt: true,
			message: toolErrorMessage("c1", "echo_tool", "The user denied this action. Do not retry it; ask how to proceed."),
		}),
		async () => {
			executed++;
			return { halt: false };
		},
	]);
	check(denied && denied.content.includes("denied"), "preExecute deny returns the deny payload");
	check(executed === 0, "preExecute deny never runs later listeners (execute never starts)");

	const ok = await runPreExecute([async () => ({ halt: false })]);
	check(ok === null, "preExecute continue → null (driver may execute)");

	const post = await runPostExecute("secret-token", [
		(t) => t.replace("secret-token", "[REDACTED]"),
		(t) => t + "!",
	]);
	check(post === "[REDACTED]!", "postExecute listeners transform in order");

	if (failed) {
		console.error(`\n${failed} tool-waterfall check(s) failed`);
		process.exit(1);
	}
	console.log("\nAll tool-waterfall checks passed.");
})().catch((e) => {
	console.error("FAIL:", e);
	process.exit(1);
});
