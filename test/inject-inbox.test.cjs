const { execSync } = require("child_process");
const path = require("path");

const out = path.join(__dirname, "dist", "injectInbox.cjs");
execSync(
	`npx esbuild src/agent/injectInbox.ts --bundle --platform=node --format=cjs --outfile=${out}`,
	{ cwd: path.join(__dirname, ".."), stdio: "inherit" }
);
const { InjectInbox } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

const box = new InjectInbox();
check(box.push("") === false && box.push("   ") === false, "empty inject rejected");
check(box.push("one") === true, "non-empty inject accepted");
check(box.push("two") === true, "second inject accepted");
check(box.drain() === "one\ntwo", "pushes concatenate with newline before drain");
check(box.drain() === null, "empty after drain");
box.push("left");
box.restore("over");
check(box.drain() === "left\nover", "restore concatenates like a later push");
box.push("drop-me");
box.clear();
check(box.drain() === null, "clear drops the inbox (interrupt)");

if (failed) {
	console.error(`\n${failed} inject-inbox check(s) failed`);
	process.exit(1);
}
console.log("\nAll inject-inbox checks passed.");
