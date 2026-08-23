/**
 * Unit tests for secret redaction (redact.ts) — pure, no obsidian.
 */

const { execSync } = require("child_process");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "redact.cjs");
execSync(`npx esbuild src/agent/redact.ts --bundle --platform=node --format=cjs --outfile=${out}`, {
	cwd: root,
	stdio: "inherit",
});

const { redactSecretsInText } = require(out);

const tests = [];
function t(name, fn) {
	tests.push({ name, fn });
}

t("openai sk- token masked", () => {
	const r = redactSecretsInText("key is sk-abcdefghijklmnopqrstuvwxyz123456789");
	assert.strictEqual(r.text, "key is [REDACTED]");
	assert.ok(r.redactions >= 1);
});

t("google AIza token masked", () => {
	const r = redactSecretsInText("x AIza" + "a".repeat(35) + " y");
	assert.strictEqual(r.text, "x [REDACTED] y");
});

t("aws AKIA key masked", () => {
	const r = redactSecretsInText("AKIAIOSFODNN7EXAMPLE");
	assert.strictEqual(r.text, "[REDACTED]");
});

t("github token masked", () => {
	const r = redactSecretsInText("ghp_" + "a".repeat(40));
	assert.strictEqual(r.text, "[REDACTED]");
});

t("slack token masked", () => {
	const r = redactSecretsInText("xoxb-1234567890-abcdefghijklmnop");
	assert.strictEqual(r.text, "[REDACTED]");
});

t("bearer token masked", () => {
	const r = redactSecretsInText("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456");
	assert.strictEqual(r.text, "Authorization: [REDACTED]");
});

t("jwt masked", () => {
	const r = redactSecretsInText("tok eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U");
	assert.strictEqual(r.text, "tok [REDACTED]");
});

t("private key block masked", () => {
	const r = redactSecretsInText("before\n-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----\nafter");
	assert.strictEqual(r.text, "before\n[REDACTED]\nafter");
});

t("api_key=value masked", () => {
	const r = redactSecretsInText('api_key="abcdef1234567890"');
	assert.strictEqual(r.text, "[REDACTED]");
});

t("ordinary prose untouched", () => {
	const text = "The weather in Pontianak is fine today. Write a note about it.";
	const r = redactSecretsInText(text);
	assert.strictEqual(r.text, text);
	assert.strictEqual(r.redactions, 0);
});

t("short lookalikes untouched (no false positive)", () => {
	const text = "sk-sk-sk tokens are short here and password: abc";
	const r = redactSecretsInText(text);
	assert.strictEqual(r.text, text);
});

(async () => {
	let passed = 0;
	let failed = 0;
	for (const { name, fn } of tests) {
		try {
			fn();
			passed++;
			console.log(`✓ ${name}`);
		} catch (err) {
			failed++;
			console.error(`✗ ${name}\n    ${err && err.message ? err.message : err}`);
		}
	}
	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
})();
