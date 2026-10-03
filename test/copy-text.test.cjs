const { execSync } = require("child_process");
const path = require("path");

const out = path.join(__dirname, "dist", "copyText.cjs");
execSync(`npx esbuild src/ui/clipboard.ts --bundle --platform=node --format=cjs --outfile=${out}`, {
	cwd: path.join(__dirname, ".."),
	stdio: "inherit",
});
const { copyText } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

(async () => {
	let clipboard = "";
	Object.defineProperty(global, "navigator", {
		configurable: true,
		value: {
			clipboard: {
				writeText: async (t) => {
					clipboard = t;
				},
			},
		},
	});
	check(await copyText("hello") && clipboard === "hello", "clipboard API path");
	check(!(await copyText("")), "empty rejected");

	Object.defineProperty(global, "navigator", { configurable: true, value: {} });
	let copied = "";
	const el = {
		value: "",
		style: {},
		setAttribute() {},
		select() {
			copied = this.value;
		},
		remove() {},
	};
	global.document = {
		createElement: () => el,
		body: { appendChild() {} },
		execCommand: (cmd) => cmd === "copy",
	};
	check(await copyText("fallback") && copied === "fallback", "execCommand fallback");

	if (failed) {
		console.error(`\n${failed} copy-text check(s) failed`);
		process.exit(1);
	}
	console.log("\nAll copy-text checks passed.");
})();
