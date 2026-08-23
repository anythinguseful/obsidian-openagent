/**
 * Mini syntax highlighter (v0.1.43)
 *
 * Deliberate deviation, kept: official Hermes Desktop renders fenced code
 * through Shiki (react-shiki, multi-MB grammar bundle, lazy-loaded in
 * components/chat/shiki-highlighter.tsx with a 150k-char / 3k-line budget).
 * We keep Shiki out. A tiny regex tokenizer paints the spans instead, and
 * the colors come from Obsidian's official --code-* theme variables
 * (docs.obsidian.md → CSS variables → Editor/Code) so vault themes keep
 * ownership of the palette. This is a chat surface, not an editor: the
 * languages below cover the fences agents actually emit; anything else —
 * and anything beyond the budget — renders as plain preformatted text,
 * exactly like before.
 *
 * Tokenizer contract (unit-tested in test/highlight.test.cjs):
 *  · lossless — joining token .v values reproduces the input byte-for-byte
 *  · ordered rules, first match wins (comments → strings → numbers → words)
 *  · identifiers matched against a word set; unknown languages return null
 */

export type HlTokenType =
	| "comment"
	| "string"
	| "keyword"
	| "number"
	| "function"
	| "property"
	| "tag"
	| "value"
	| "operator"
	| "punctuation"
	| "important"
	| "plain";

export interface HlToken {
	t: HlTokenType;
	v: string;
}

/** Blocks larger than this highlight as plain text — chat speed > coverage. */
export const HIGHLIGHT_BUDGET = 20_000;

/** internal pseudo-type: identifiers looked up in the language's word set */
type Rule = readonly [HlTokenType | "word", string];

interface LangSpec {
	rules: readonly Rule[];
	keywords: ReadonlySet<string>;
}

/* shared atoms — rule sources use NON-CAPTURING groups only: the master
 * regex wraps each rule in exactly one capturing group and the group index
 * identifies which rule matched */
const STRING_DQ = String.raw`"(?:[^"\\\n]|\\[\s\S])*"`;
const STRING_SQ = String.raw`'(?:[^'\\\n]|\\[\s\S])*'`;
const STRING_TPL = String.raw`\x60(?:[^\x60\\]|\\[\s\S])*\x60`;
const NUMBER = String.raw`(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?n?)`;
const OPERATOR = String.raw`=>|===|!==|==|!=|<=|>=|&&|\|\||\+\+|--|[+\-*/%=!<>~^&|?:]+`;
const PUNCT = String.raw`[{}\(\)\[\];,.:]`;
const JS_WORD = String.raw`[A-Za-z_$][\w$]*`;

const kw = (words: string): ReadonlySet<string> => new Set(words.split(" "));

const js: LangSpec = {
	keywords: kw(
		"as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield interface type enum implements namespace declare abstract readonly private protected public keyof infer is never unknown any boolean number string object symbol bigint undefined null true false"
	),
	rules: [
		["comment", String.raw`\/\/[^\n]*`],
		["comment", String.raw`\/\*[\s\S]*?\*\/`],
		["string", STRING_DQ],
		["string", STRING_SQ],
		["string", STRING_TPL],
		["number", NUMBER],
		["function", String.raw`\.${JS_WORD}(?=\s*\()`],
		["function", String.raw`${JS_WORD}(?=\s*\()`],
		["property", String.raw`\.${JS_WORD}`],
		["word", JS_WORD],
		["operator", OPERATOR],
		["punctuation", PUNCT],
	],
};

const py: LangSpec = {
	keywords: kw(
		"and as assert async await break class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield None True False self cls"
	),
	rules: [
		["comment", String.raw`#[^\n]*`],
		["string", String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''`],
		["string", String.raw`(?:[rfbuRFBU]{0,2})${STRING_DQ}`],
		["string", String.raw`(?:[rfbuRFBU]{0,2})${STRING_SQ}`],
		["number", NUMBER],
		["function", String.raw`@[A-Za-z_][\w.]*`],
		["function", String.raw`\.[A-Za-z_]\w*(?=\s*\()`],
		["function", String.raw`[A-Za-z_]\w*(?=\s*\()`],
		["property", String.raw`\.[A-Za-z_]\w*`],
		["word", String.raw`[A-Za-z_]\w*`],
		["operator", OPERATOR],
		["punctuation", PUNCT],
	],
};

const json: LangSpec = {
	keywords: new Set(),
	rules: [
		["property", String.raw`"(?:[^"\\\n]|\\[\s\S])*"(?=\s*:)`],
		["string", STRING_DQ],
		["number", String.raw`-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?`],
		["keyword", String.raw`(?:true|false|null)\b`],
		["punctuation", PUNCT],
	],
};

const sh: LangSpec = {
	keywords: kw(
		"if then else elif fi for while do done case esac in function select until time coproc echo printf export local readonly source alias set unset shift exit return break continue cd test"
	),
	rules: [
		["string", STRING_DQ],
		["string", STRING_SQ],
		["comment", String.raw`#[^\n]*`],
		["value", String.raw`\$(?:\{[^}\n]*\}|\([^)\n]*\)|[A-Za-z_]\w*|[0-9@#?$!*])`],
		["number", NUMBER],
		["word", String.raw`[A-Za-z_][\w-]*`],
		["operator", OPERATOR],
		["punctuation", String.raw`[{}\(\)\[\];]`],
	],
};

const yaml: LangSpec = {
	keywords: kw("true false null yes no on off"),
	rules: [
		["comment", String.raw`#[^\n]*`],
		["string", STRING_DQ],
		["string", STRING_SQ],
		["punctuation", String.raw`^[ \t]*-(?=\s)`],
		["property", String.raw`^[ \t]*[A-Za-z0-9_.-]+(?=\s*:)`],
		["tag", String.raw`[&*][A-Za-z_][\w-]*`],
		["number", NUMBER],
		["word", String.raw`[A-Za-z_][\w-]*`],
		["punctuation", PUNCT],
	],
};

const md: LangSpec = {
	keywords: new Set(),
	rules: [
		["punctuation", String.raw`^[ \t]*(?:\x60{3,}|~{3,})[^\n]*`],
		["punctuation", String.raw`^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$`],
		["keyword", String.raw`^[ \t]*#{1,6}(?=\s)[^\n]*`],
		["comment", String.raw`^[ \t]*>[^\n]*`],
		["punctuation", String.raw`^[ \t]*(?:[-*+]|\d+\.)(?=\s)`],
		["string", String.raw`\x60[^\x60\n]+\x60`],
		["important", String.raw`\*\*[^*\n]+\*\*`],
		["tag", String.raw`!?\[[^\]\n]*\]\(`],
		["string", String.raw`(?<=\]\()[^)\n]+(?=\))`],
	],
};

const LANGS: Record<string, LangSpec> = { js, py, json, sh, yaml, md };
const ALIASES: Record<string, string> = {
	javascript: "js",
	js: "js",
	mjs: "js",
	cjs: "js",
	jsx: "js",
	typescript: "js",
	ts: "js",
	tsx: "js",
	python: "py",
	py: "py",
	json: "json",
	bash: "sh",
	sh: "sh",
	shell: "sh",
	shellscript: "sh",
	zsh: "sh",
	yaml: "yaml",
	yml: "yaml",
	markdown: "md",
	md: "md",
};

const compiled = new Map<string, RegExp>();

function compile(spec: LangSpec): RegExp {
	const body = spec.rules.map(([, src]) => `(${src})`).join("|");
	return new RegExp(body, "gm");
}

function push(out: HlToken[], t: HlTokenType, v: string): void {
	const tail = out[out.length - 1];
	if (tail && tail.t === t) tail.v += v;
	else out.push({ t, v });
}

function tokenize(code: string, spec: LangSpec, re: RegExp): HlToken[] {
	const out: HlToken[] = [];
	re.lastIndex = 0;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(code)) !== null) {
		if (m[0].length === 0) {
			re.lastIndex++;
			continue; // zero-width safety — never loop forever
		}
		let ri = -1;
		for (let g = 1; g < m.length; g++) {
			if (m[g] !== undefined) {
				ri = g - 1;
				break;
			}
		}
		if (ri >= 0) {
			if (m.index > last) push(out, "plain", code.slice(last, m.index));
			const [kind, src] = spec.rules[ri];
			const t: HlTokenType =
				kind === "word" ? (spec.keywords.has(m[0].toLowerCase()) ? "keyword" : "plain") : kind;
			let text = m[0];
			/* line-anchored rules (`^[ \t]*…`) swallow the indent into the
			   match — hand it back to plain so tokens carry the visible
			   glyph run only (yaml keys/list markers, md heading/quote/…) */
			if (src.startsWith("^")) {
				const indent = /^[ \t]+/.exec(text);
				if (indent) {
					push(out, "plain", indent[0]);
					text = text.slice(indent[0].length);
				}
			}
			push(out, t, text);
			last = re.lastIndex;
		}
	}
	if (last < code.length) push(out, "plain", code.slice(last));
	return out;
}

/**
 * Tokenize `code` for `language` (fence info-string). Returns null when the
 * language is not in the mini set or the block exceeds the budget — callers
 * render plain text for both, the pre-highlight behavior.
 */
export function highlightCode(code: string, language: string): HlToken[] | null {
	if (!code || code.length > HIGHLIGHT_BUDGET) return null;
	const id = ALIASES[language.trim().toLowerCase()];
	if (!id) return null;
	const spec = LANGS[id];
	let re = compiled.get(id);
	if (!re) {
		re = compile(spec);
		compiled.set(id, re);
	}
	const tokens = tokenize(code, spec, re);
	return tokens.length > 0 ? tokens : null;
}
