/**
 * Mini syntax highlighter suite (v0.1.43)
 *  · highlightCode — lossless regex tokenizer for chat code cards
 *  · contract: round-trip byte-for-byte; ordered rules; null outside the set
 */

const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "highlight.cjs");
execSync(
	`npx esbuild test/highlight-entry.ts --bundle --platform=node --format=cjs --outfile=${out}`,
	{ cwd: root, stdio: "inherit" }
);

const { highlightCode, HIGHLIGHT_BUDGET } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

const join = (toks) => toks.map((t) => t.v).join("");
const find = (toks, type, text) => toks.some((t) => t.t === type && t.v === text);
const findRe = (toks, type, re) => toks.some((t) => t.t === type && re.test(t.v));

/* ---------- lossless round-trip across every supported language ---------- */

const SAMPLES = {
	js: `const name = "agent"; // who
function greet(user) {
	return "hi " + user.toUpperCase();
}
const list = [1, 0x1f, 2.5e3].map((n) => {
	const f = \`tpl \${name}\`;
	return n * 2; /* tail */
});
const ans = list.length + 1;`,
	py: `# setup
def load(path: str) -> list[int]:
    """docstring"""
    return open(path).readlines()`,
	json: `{
  "action": "create",
  "name": "Weekly digest",
  "schedule": "0 9 * * 1",
  "retries": 3,
  "ratio": 2.5,
  "chain": true,
  "fallback": null
}`,
	sh: `#!/bin/bash
NAME=\${USER:-agent}  # who
if [ -n "$NAME" ]; then
  echo "hi $NAME" | wc -c
fi
WHO=$NAME`,
	yaml: `name: digest # weekly
schedule:
  days: [1]
  offset: 5
on: true
tags:
  - a
  - b`,
	md: `# Title
Some **bold** and \`inline\` text.
> quoted note
- point one
1. point two
See [the docs](https://example.com).
\`\`\`json
{}
\`\`\``,
};

for (const [lang, src] of Object.entries(SAMPLES)) {
	const toks = highlightCode(src, lang);
	check(toks !== null, `${lang}: supported`);
	if (toks) check(join(toks) === src, `${lang}: round-trip lossless`);
}

const jsT = highlightCode(SAMPLES.js, "js");
check(find(jsT, "keyword", "const") && find(jsT, "keyword", "function"), "js: keywords const/function");
check(find(jsT, "string", '"agent"'), "js: double-quoted string");
check(find(jsT, "comment", "// who") && find(jsT, "comment", "/* tail */"), "js: line + block comments");
check(find(jsT, "function", "greet"), "js: call-shaped identifier → function");
check(find(jsT, "function", ".toUpperCase"), "js: method call → function");
check(find(jsT, "property", ".length"), "js: non-call member → property");
check(find(jsT, "number", "0x1f") && find(jsT, "number", "2.5e3"), "js: hex + exponent numbers");
check(find(jsT, "operator", "=>"), "js: arrow operator");
check(findRe(jsT, "string", /^`tpl \$\{name\}`$/), "js: template literal stays one string");

const pyT = highlightCode(SAMPLES.py, "python");
check(find(pyT, "comment", "# setup"), "py: comment");
check(find(pyT, "keyword", "def") && find(pyT, "keyword", "return"), "py: keywords def/return");
check(find(pyT, "string", '"""docstring"""'), "py: triple-quoted string");
check(find(pyT, "function", "load") && find(pyT, "function", ".readlines"), "py: call + method → function");

const jsonT = highlightCode(SAMPLES.json, "json");
check(find(jsonT, "property", '"action"') && find(jsonT, "string", '"create"'),
	"json: colon-key → property, value string → string");
check(find(jsonT, "number", "3") && find(jsonT, "number", "2.5"), "json: numbers");
check(find(jsonT, "keyword", "true") && find(jsonT, "keyword", "null"), "json: true/null → keyword");

const shT = highlightCode(SAMPLES.sh, "bash");
check(find(shT, "comment", "#!/bin/bash"), "sh: shebang is a comment");
check(find(shT, "value", "${USER:-agent}") && find(shT, "value", "$NAME"), "sh: variables → value");
check(find(shT, "keyword", "if") && find(shT, "keyword", "fi") && find(shT, "keyword", "echo"), "sh: keywords");
check(find(shT, "string", '"hi $NAME"'), "sh: quoted string (inner $ not split)");

const yT = highlightCode(SAMPLES.yaml, "yaml");
check(find(yT, "property", "name") && find(yT, "property", "days"), "yaml: root + indented keys → property");
check(find(yT, "comment", "# weekly"), "yaml: comment");
check(find(yT, "keyword", "true"), "yaml: boolean → keyword");
check(yT.filter((t) => t.t === "punctuation" && t.v === "-").length === 2, "yaml: list markers → punctuation");

const mdT = highlightCode(SAMPLES.md, "markdown");
check(findRe(mdT, "keyword", /^# Title$/), "md: heading line → keyword");
check(find(mdT, "important", "**bold**"), "md: bold → important");
check(find(mdT, "string", "`inline`"), "md: inline code → string");
check(findRe(mdT, "comment", /^> quoted note$/), "md: quote line → comment");
check(find(mdT, "tag", "[the docs](") && find(mdT, "string", "https://example.com"), "md: link bracket → tag, url → string");
check(findRe(mdT, "punctuation", /^```/), "md: fence markers → punctuation");

/* ---------- guards ---------- */

check(highlightCode("fn main() {}", "rust") === null, "unknown language → null (plain)");
check(highlightCode("", "js") === null, "empty code → null");
check(highlightCode("x".repeat(HIGHLIGHT_BUDGET + 1), "js") === null, "over-budget → null (plain)");
check(highlightCode("x".repeat(HIGHLIGHT_BUDGET), "js") !== null, "at-budget still highlights");
check(highlightCode("let a = 1;", "  TypeScript  ") !== null, "alias + trim/case folding");
check(highlightCode("x = 1", "mermaid") === null, "mermaid stays de-highlighted (diagram route owns it)");

/* keyword lookup must not leak across languages */
check(!find(highlightCode("def = 1;", "js"), "keyword", "def"), "js: 'def' is not a keyword here");
check(!find(highlightCode("const = 1", "py"), "keyword", "const"), "py: 'const' is not a keyword here");

/* adjacent same-type tokens merge (span count stays low) */
const merged = highlightCode("a = b + c;", "js");
check(merged.every((t, i) => i === 0 || t.t !== merged[i - 1].t), "no adjacent same-type tokens");

if (failed > 0) {
	console.error(`\n${failed} highlight check(s) FAILED`);
	process.exit(1);
}
console.log("\nhighlight checks: all green");
