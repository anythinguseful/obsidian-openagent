/**
 * Markdown preprocessing for assistant answers (Copilot parity).
 * Source-verified against logancyang/obsidian-copilot@master
 * (src/utils/markdownPreprocess.ts + ChatSingleMessage.preprocess).
 *
 * 1. Executable-fence escape — community plugins (Dataview/Tasks) run
 *    ```dataview / ```dataviewjs / ```tasks fences wherever Obsidian's
 *    MarkdownRenderer touches them. AI output is untrusted text: those
 *    fences must render as static code, never execute.
 *    (In Open Agent's pipeline fences are additionally extracted into the
 *    prompt-kit CodeBlock before render — these escapes are the safety
 *    net for every render path that does hand full markdown to Obsidian.)
 * 2. LaTeX normalization — LLMs emit \[...\] (display) and \(...\)
 *    (inline); Obsidian only typesets $$...$$ / $...$. Code-fence and
 *    inline-code aware, like the original.
 * 3. Vault image wiring — ![[img.png]] → ![](resourcePath) so images
 *    referenced wikilink-style render in chat.
 *
 * The pure functions have no obsidian imports (unit-testable); the App
 * type is a type-only import (erased at build).
 */

import type { App } from "obsidian";
import {
	preferredLineEnding,
	replaceFenceLanguage,
	walkMarkdownFences,
} from "../markdown/fences";

/** ```dataview → ```text · ```dataviewjs → ```javascript — never execute AI output */
function escapeDataviewCodeBlocks(text: string): string {
	text = text.replace(/```dataview(\s*(?:\n|$))/g, "```text$1");
	text = text.replace(/```dataviewjs(\s*(?:\n|$))/g, "```javascript$1");
	return text;
}

/** ```tasks → ```text — never execute AI output */
function escapeTasksCodeBlocks(text: string): string {
	return text.replace(/```tasks(\s*(?:\n|$))/g, "```text$1");
}

/** \[…\] → $$…$$ · \(…\) → $…$ — fences and inline code untouched */
function normalizeLatexDelimiters(content: string): string {
	/* split on fenced blocks and inline code so LaTeX-looking sequences
	   inside code are never rewritten (Copilot's exact strategy) */
	const parts = content.split(/(```[\s\S]*?```|`[^`]*`)/g);
	return parts
		.map((part, index) => {
			if (index % 2 === 1) return part; // captured code segment
			return part
				/* deliberate deviation: Copilot's own doc comment says the goal is
				   $$...$$ (display math), but their replacement string "$$" is JS's
				   escape for ONE literal "$" — their output is actually $...$
				   (inline). We emit "$$$$" so display math stays display math. */
				.replace(/\\\[\s*/g, "$$$$")
				.replace(/\s*\\\]/g, "$$$$")
				.replace(/\\\(\s*/g, "$")
				.replace(/\s*\\\)/g, "$");
		})
		.join("");
}

/** Safety (executable fences) + math (LaTeX) preprocessing — pure. */
export function preprocessAIResponse(content: string): string {
	const dataviewEscaped = escapeDataviewCodeBlocks(content);
	const tasksEscaped = escapeTasksCodeBlocks(dataviewEscaped);
	return normalizeLatexDelimiters(tasksEscaped);
}

/**
 * 2026-08-07 (v0.1.107) mermaid salvage — LLMs love decorating flowchart
 * subgraph titles with emoji: `subgraph Agent Loop ✨`. Mermaid's jison
 * lexer only accepts BARE titles made of plain identifier chars — anything
 * richer must be quoted, else it dies with the infamous console wall
 * "Lexical error on line N. Unrecognized text" (whose context excerpt
 * mangles line structure — it LOOKS like flattened newlines but is just
 * jison's source window; we byte-verified this by replaying the exact
 * error through mermaid.parse). Verified facts: bare single-word titles
 * parse; bare multi-word titles parse on recent mermaid; bare titles with
 * emoji FAIL; quoted titles always parse; emoji inside node labels
 * `A[🚀 x]` parses fine unquoted. So the salvage is narrow and idempotent:
 * quote ONLY bare subgraph titles that are not (a) already quoted,
 * (b) the `id[title]` form, or (c) a single plain identifier — a plain id
 * may be edge-referenced elsewhere (`A --> core`), and quoting it would
 * sever that reference. Everything else stays byte-identical.
 */
const MERMAID_SUBGRAPH_LINE = /^([ \t]*)subgraph[ \t]+(.+?)[ \t]*$/gm;

/* 2026-08-09 (v0.1.123) flowchart LABEL paren salvage — owner console:
   "Error: Parse error on line 3: … C[Skematik Desain (SD)] … got 'PS'".
   mermaid's jison lexer reads unquoted `(`/`)` as PS/PE tokens even INSIDE
   flowchart labels, so one abbreviation ("Skematik Desain (SD)") explodes
   the whole diagram. Byte-verified against mermaid.parse@11.16.1 (matrix
   replay in /tmp/mmtest, 2026-08-09): unquoted parens FAIL inside [ ] /
   { } labels, `|` edge captions, and even shape interiors ([(db)],
   ([go]), [[sub]], {{hex}}); quoted forms always parse; shape exteriors
   with clean interiors, free `-- text -->` labels (parens parse FINE
   there), `@{label: ... }` configs, classDiagram braces, #40;/&quot;
   entities and every non-flowchart diagram stay untouched. Escape = the
   official one: double quotes (#quot; for inner quotes) — the same
   technique as the v0.1.107 subgraph-title salvage. Narrow + idempotent:
   quote ONLY flowchart/graph label interiors containing `( ) "`. */
const MERMAID_FLOWCHART_HEAD = /^\s*(?:flowchart|graph)\b/i;
const MERMAID_COMMENT_HEAD = /^\s*%%/;
const MERMAID_EDGE_ARROW = "(?:-->|--x|--o|<--<>?|<--x|<--o|<-->|---|==>|===|-\\.->|-\\.-)";

function salvageMermaidLabelText(line: string): string {
	const needsQuote = (inner: string): boolean => {
		const t = inner.trim();
		if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return false; // already quoted
		/* shape exteriors [(db)] / ([go]) parse as-is; already shape-salvaged
		   interiors also start with `(` — never re-wrap them */
		if (t.startsWith("(") || t.startsWith("[")) return false;
		return /[()"]/.test(t);
	};
	const quoted = (inner: string): string => `"${inner.trim().replace(/"/g, "#quot;")}"`;
	const wrap = (m: string, open: string, inner: string, close: string): string =>
		needsQuote(inner) ? `${open}${quoted(inner)}${close}` : m;
	return line
		/* v0.1.125 (matrix-byte-verified 11.16.1): `ID:::class[label]` is NEVER
		   valid jison (class-before dies even on clean labels) — reorder to
		   class-after, which parses for every shape incl. cylinder/stadium;
		   the label chain below then quotes any parens in the interior */
		.replace(/([A-Za-z][\w-]*):::([\w-]+)\s*\[\s*([^\[\]]+?)\s*\]/g, (_m, id: string, cls: string, inner: string) =>
			`${id}[${inner.trim()}]:::${cls}`)
		/* shape interiors dissolve the parse error while KEEPING the shape */
		.replace(/([A-Za-z][\w-]*)\s*\(\[\s*([^\[\]]+?)\s*\]\)/g, (m, id: string, inner: string) => wrap(m, `${id}([`, inner, `])`)) // stadium
		.replace(/([A-Za-z][\w-]*)\s*\[\(\s*([^\[\]]+?)\s*\)\]/g, (m, id: string, inner: string) => wrap(m, `${id}[(`, inner, `)]`)) // cylinder
		.replace(/([A-Za-z][\w-]*)\s*\[\[\s*([^\[\]]+?)\s*\]\]/g, (m, id: string, inner: string) => wrap(m, `${id}[[`, inner, `]]`)) // subroutine
		.replace(/([A-Za-z][\w-]*)\s*\{\{\s*([^{}]+?)\s*\}\}/g, (m, id: string, inner: string) => wrap(m, `${id}{{`, inner, `}}`)) // hexagon
		/* diamond: @{ label: ... } configs never match (@ between id and brace) */
		.replace(/([A-Za-z][\w-]*)\s*\{\s*([^{}]+?)\s*\}/g, (m, id: string, inner: string) => wrap(m, `${id}{`, inner, `}`))
		/* plain squares + subgraph id[title] — never re-touches shapes */
		.replace(/([A-Za-z][\w-]*)\s*\[\s*([^\[\]]+?)\s*\]/g, (m, id: string, inner: string) => wrap(m, `${id}[`, inner, `]`))
		/* edge captions in pipes — free `-- text -->` labels parse fine unquoted */
		.replace(new RegExp(`(${MERMAID_EDGE_ARROW})\\s*\\|([^|]+?)\\|`, "g"), (m, arrow: string, inner: string) => wrap(m, `${arrow}|`, inner, `|`));
}

/* 2026-08-14 (v0.1.144) trailing-percent comment canonicalisation.
   Mermaid comments are own-line `%% ...`; both `; % ...` and `; %% ...`
   fail when left inline. Split either spelling at statement level, emit one
   canonical %% prefix, and preserve the comment payload byte-for-byte. */
const MERMAID_TRAILING_PERCENT = /;[ \t]+%{1,2}(?!%)/g;

function isTopLevelMermaidPosition(line: string, stop: number): boolean {
	let quote = "";
	let squareDepth = 0;
	let roundDepth = 0;
	let curlyDepth = 0;
	let inPipeCaption = false;
	for (let i = 0; i < stop; i++) {
		const ch = line[i];
		if (quote) {
			if (ch === quote) {
				let slashes = 0;
				for (let j = i - 1; j >= 0 && line[j] === "\\"; j--) slashes++;
				if (slashes % 2 === 0) quote = "";
			}
			continue;
		}
		/* Mermaid's quoted-string delimiter is double quote. Treating every
		   apostrophe as a string opener would miss valid free edge text such
		   as `It's done --> B; % comment`. Single-quoted values used inside
		   @{...} remain protected by curlyDepth. */
		if (ch === '"') {
			quote = ch;
			continue;
		}
		if (ch === "[") squareDepth++;
		else if (ch === "]" && squareDepth > 0) squareDepth--;
		else if (ch === "(") roundDepth++;
		else if (ch === ")" && roundDepth > 0) roundDepth--;
		else if (ch === "{") curlyDepth++;
		else if (ch === "}" && curlyDepth > 0) curlyDepth--;
		else if (ch === "|" && squareDepth === 0 && roundDepth === 0 && curlyDepth === 0) {
			inPipeCaption = !inPipeCaption;
		}
	}
	return !quote && squareDepth === 0 && roundDepth === 0 && curlyDepth === 0 && !inPipeCaption;
}

function salvageMermaidFlowchartLine(line: string): string {
	if (MERMAID_COMMENT_HEAD.test(line)) return line;
	const carriage = line.endsWith("\r") ? "\r" : "";
	const body = carriage ? line.slice(0, -1) : line;
	MERMAID_TRAILING_PERCENT.lastIndex = 0;
	let marker: RegExpExecArray | null;
	while ((marker = MERMAID_TRAILING_PERCENT.exec(body))) {
		if (!isTopLevelMermaidPosition(body, marker.index)) continue;
		const indent = body.match(/^[ \t]*/)?.[0] ?? "";
		const statement = salvageMermaidLabelText(body.slice(0, marker.index + 1));
		const commentText = body.slice(marker.index + marker[0].length);
		return `${statement}${carriage}\n${indent}%%${commentText}${carriage}`;
	}
	return salvageMermaidLabelText(line);
}

export function sanitizeMermaidSrc(src: string): string {
	const subgraphed = src.replace(MERMAID_SUBGRAPH_LINE, (m, indent: string, rest: string) => {
		if (rest.startsWith('"')) return m;
		if (rest.includes("[") || rest.includes("]")) return m;
		if (/^[A-Za-z0-9][\w-]*$/.test(rest)) return m;
		return `${indent}subgraph "${rest.replace(/"/g, "#quot;")}"`;
	});
	/* A legal Mermaid preamble can contain blank lines, own-line comments and
	   %%{init...}%% directives before the diagram declaration. Detect the
	   first semantic line instead of requiring flowchart/graph at byte 0. */
	const declaration = subgraphed
		.split(/\r?\n|\r/)
		.map((line) => line.trim())
		.find((line) => line.length > 0 && !line.startsWith("%%"));
	/* Label/comment salvage is flowchart-only — classDiagram uses {} as class
	   bodies (legal parens!), sequence messages are free text. */
	if (!declaration || !MERMAID_FLOWCHART_HEAD.test(declaration)) return subgraphed;
	return subgraphed
		.split("\n")
		.map(salvageMermaidFlowchartLine)
		.join("\n");
}

/* v0.1.144 canonical document policy. Valid closed Mermaid fences are
   normalised in place. Reopened/merged or unclosed Mermaid is rendered and
   persisted as a non-executable text fence; unclosed input receives a
   matching closer at the end of the supplied answer so it cannot swallow a
   pre-existing note tail when inserted. Prose, non-Mermaid fences,
   delimiter runs, indentation and line endings remain byte-identical. */
export function sanitizeMermaidFences(content: string): string {
	let out = "";
	let cursor = 0;
	for (const fence of walkMarkdownFences(content)) {
		out += content.slice(cursor, fence.start);
		if (fence.language !== "mermaid") {
			out += content.slice(fence.start, fence.end);
			cursor = fence.end;
			continue;
		}
		const opener = content.slice(fence.start, fence.openerEnd);
		if (!fence.closed || fence.malformed) {
			out += replaceFenceLanguage(opener, "text");
			out += content.slice(fence.bodyStart, fence.end);
			if (!fence.closed) {
				const eol = preferredLineEnding(content);
				if (out.length > 0 && !out.endsWith("\n") && !out.endsWith("\r")) out += eol;
				out += `${fence.indent}${fence.delimiter.repeat(fence.delimiterLength)}`;
			}
			cursor = fence.end;
			continue;
		}
		out += opener;
		out += sanitizeMermaidSrc(content.slice(fence.bodyStart, fence.bodyEnd));
		out += content.slice(fence.bodyEnd, fence.end);
		cursor = fence.end;
	}
	return out + content.slice(cursor);
}

/** Rewrite matches of `regex` only outside fenced/inline code. */
function replaceOutsideCode(
	text: string,
	regex: RegExp,
	fn: (match: string, selection: string) => string
): string {
	const parts = text.split(/(```[\s\S]*?```|`[^`]*`)/g);
	return parts
		.map((part, index) => (index % 2 === 1 ? part : part.replace(regex, fn)))
		.join("");
}

function safeBlockedLink(url: string, label = "Remote media"): string {
	const href = url.startsWith("//") ? `https:${url}` : url;
	const escapedHref = href.replace(/[<>\r\n]/g, (ch) => encodeURIComponent(ch));
	const escapedLabel = label.replace(/[\[\]]/g, "");
	return `[${escapedLabel} blocked — click to open](<${escapedHref}>)`;
}

function decodeUrlEntities(value: string): string {
	return value
		.replace(/&#(?:x([0-9a-f]+)|([0-9]+));?/gi, (_whole, hex: string, dec: string) => {
			const code = Number.parseInt(hex ?? dec, hex ? 16 : 10);
			return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
		})
		.replace(/&colon;/gi, ":")
		.replace(/&sol;/gi, "/")
		.replace(/&tab;/gi, "\t")
		.replace(/&newline;/gi, "\n")
		.replace(/&amp;/gi, "&");
}

function normalizeUrlProbe(value: string): string {
	return decodeUrlEntities(value)
		/* CSS hexadecimal escapes can hide ':' or letters in style URLs. */
		.replace(/\\([0-9a-f]{1,6})(?:[ \t\r\n\f])?/gi, (_whole, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
		/* Markdown removes backslashes before escapable punctuation. */
		.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g, "$1")
		/* URL parsers ignore ASCII tabs/newlines inside a scheme. */
		.replace(/[\u0009-\u000d]/g, "")
		.trim();
}

function remoteUrlAtStart(value: string): string | null {
	const normalized = normalizeUrlProbe(value).replace(/^['"]|['"]$/g, "");
	return /^(?:https?:)?\/\//i.test(normalized) ? normalized : null;
}

function findRemoteUrl(value: string): string | null {
	const normalized = normalizeUrlProbe(value);
	return normalized.match(/(?:https?:)?\/\/[^\s"'<>]+/i)?.[0] ?? null;
}

const RAW_MEDIA_TAGS = new Set([
	"img",
	"video",
	"audio",
	"source",
	"track",
	"iframe",
	"object",
	"embed",
	"image",
	"feimage",
	"use",
	"input",
	"link",
	"style",
	"base",
	"meta",
	"script",
	"frame",
	"applet",
	"bgsound",
	"body",
	"table",
	"td",
	"th",
]);

const ALWAYS_BLOCK_RAW_TAGS = new Set(["iframe", "object", "embed", "link", "style", "base", "meta", "script", "frame", "applet", "bgsound"]);

/** Replace complete opening tags, respecting `>` inside quoted attributes. */
function guardRawHtmlMedia(content: string): string {
	const opener = /<\s*([a-z][\w:-]*)\b/gi;
	let cursor = 0;
	let out = "";
	let match: RegExpExecArray | null;
	while ((match = opener.exec(content))) {
		const name = match[1].toLowerCase();
		const isMediaTag = RAW_MEDIA_TAGS.has(name);
		let quote = "";
		let end = -1;
		for (let i = opener.lastIndex; i < content.length; i++) {
			const ch = content[i];
			if (quote) {
				if (ch === quote) quote = "";
			} else if (ch === '"' || ch === "'") quote = ch;
			else if (ch === ">") {
				end = i;
				break;
			}
		}
		if (end < 0) break;
		const tag = content.slice(match.index, end + 1);
		const normalizedTag = normalizeUrlProbe(tag);
		const styleRemote = /\bstyle\s*=/i.test(normalizedTag) ? findRemoteUrl(tag) : null;
		const remote = isMediaTag ? findRemoteUrl(tag) : styleRemote;
		const highRisk = isMediaTag && ALWAYS_BLOCK_RAW_TAGS.has(name);
		if (remote || highRisk) {
			out += content.slice(cursor, match.index);
			out += remote ? safeBlockedLink(remote, "Remote media") : "[Embedded media blocked]";
			cursor = end + 1;
		}
		opener.lastIndex = end + 1;
	}
	return cursor === 0 ? content : out + content.slice(cursor);
}

/**
 * Assistant Markdown is untrusted. Convert remote embeds into ordinary links
 * before Obsidian's renderer can create an <img>/<video>/… and initiate a
 * request. A click is an explicit user gesture and uses the existing external
 * link handler. Ordinary links and vault/app/data image embeds remain intact.
 */
export function guardAssistantRemoteMedia(content: string): string {
	return replaceOutsideCode(content, /[\s\S]+/g, (outside) => {
		/* Reference-style image links: only remove the image bang when the
		   matching definition points to a remote URL. */
		const remoteRefs = new Set<string>();
		for (const match of outside.matchAll(/^[ \t]{0,3}\[([^\]]+)\]:[ \t]*(?:<([^>\r\n]+)>|([^\s]+))/gim)) {
			if (remoteUrlAtStart(match[2] ?? match[3] ?? "")) remoteRefs.add(match[1].trim().toLowerCase());
		}
		let guarded = outside.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (whole, alt: string, ref: string) => {
			const key = (ref || alt).trim().toLowerCase();
			return remoteRefs.has(key) ? whole.slice(1) : whole;
		});

		/* Inline Markdown images. This intentionally targets remote network
		   schemes only; ![](app://…), ![](data:…), and relative vault paths
		   continue through the normal renderer. Angle destinations may contain
		   parentheses; the bare form supports CommonMark's usual one-level
		   balanced parentheses and entity/backslash-obfuscated schemes. */
		const blockInline = (whole: string, alt: string, destination: string): string => {
			const remote = remoteUrlAtStart(destination);
			return remote ? safeBlockedLink(remote, alt.trim() ? `Remote image: ${alt.trim()}` : "Remote image") : whole;
		};
		guarded = guarded.replace(
			/!\[([^\]]*)\]\([ \t]*<([^>\r\n]+)>[ \t]*(?:["'][^\r\n]*?["'])?[ \t]*\)/gi,
			blockInline
		);
		guarded = guarded.replace(
			/!\[([^\]]*)\]\([ \t]*((?:\\.|[^()\s]|\([^()\r\n]*\))+)(?:[ \t]+["'][^\r\n]*?["'])?[ \t]*\)/gi,
			blockInline
		);
		guarded = guarded.replace(/!\[\[([^\]]+)\]\]/gi, (whole, destination: string) => {
			const remote = remoteUrlAtStart(destination);
			return remote ? safeBlockedLink(remote, "Remote image") : whole;
		});

		/* Raw HTML media can bypass Markdown image syntax. The scanner consumes
		   a complete opening tag (including `>` inside quoted attributes), then
		   checks decoded/control-normalised URLs. */
		guarded = guardRawHtmlMedia(guarded);

		/* CSS url() and @import can fetch without a media element. Decode CSS
		   escapes before deciding; imports are never needed in chat content and
		   are removed wholesale to avoid parser-differential bypasses. */
		guarded = guarded.replace(/url\(\s*(["']?)([^)]+?)\1\s*\)/gi, (whole, _quote: string, url: string) =>
			remoteUrlAtStart(url) ? "url(\"blocked-remote-media\")" : whole
		);
		guarded = guarded.replace(/@import\b[^;\r\n]*(?:;|$)/gi, "/* remote import blocked */");
		return guarded;
	});
}

/** Mermaid image-shape properties can create a remote SVG <image> without
 * using Markdown image syntax. Preserve click/href directives (user gesture),
 * but neutralise model-authored image resources before Mermaid sees them. */
export function guardAssistantDiagramRemoteMedia(content: string): string {
	return guardAssistantRemoteMedia(content).replace(
		/\b(img|image)\s*:\s*(["'])(.*?)\2/gi,
		(whole, key: string, quote: string, destination: string) =>
			remoteUrlAtStart(destination) ? `${key}: ${quote}blocked-remote-media${quote}` : whole
	);
}

/**
 * ![[img.png]] → ![](app://…resourcePath…) for vault images.
 * Unknown targets stay verbatim (never produces broken embeds).
 * Only rewrites outside code.
 */
export function resolveVaultImages(content: string, app: App, sourcePath = ""): string {
	return replaceOutsideCode(content, /!\[\[(.+?)\]\]/g, (match, selection: string) => {
		const file = app.metadataCache.getFirstLinkpathDest(selection, sourcePath);
		return file ? `![](${app.vault.getResourcePath(file)})` : match;
	});
}
