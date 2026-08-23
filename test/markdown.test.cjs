/**
 * Markdown rendering suite (docs/plans/markdown-rendering-plan.md)
 *  · splitMarkdownSegments — pure fence segmenter (md vs code)
 *  · mdToHtml — the real-preview shim's approximation (tables/headings/…)
 */

const { execSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "markdown.cjs");
execSync(
	`npx esbuild test/markdown-entry.ts --bundle --platform=node --format=cjs --outfile=${out}`,
	{ cwd: root, stdio: "inherit" }
);

const { splitMarkdownSegments: seg, mdToHtml } = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};
const kinds = (segs) => segs.map((s) => s.kind).join(",");

/* ---------- splitMarkdownSegments ---------- */

check(seg("") .length === 0, "empty text → no segments");
check(kinds(seg("just prose")) === "md", "plain text stays md");
check(seg("just prose")[0].content === "just prose", "md content verbatim");

const single = seg("before\n\n```ts\nconst x = 1;\n```\n\nafter");
check(kinds(single) === "md,code,md", "fence splits md/code/md");
check(single[1].lang === "ts" && single[1].content === "const x = 1;", "lang parsed, code body clean");

const tilt = seg("~~~\ntilde block\n~~~");
check(kinds(tilt) === "code" && tilt[0].content === "tilde block", "tilde fences work");

const longer = seg("```\na\n````\nb");
check(kinds(longer) === "code,md" && longer[0].content === "a", "longer close fence closes");

const nested = seg("````\n```\ninner fence stays\n```\n````");
check(kinds(nested) === "code" && nested[0].content.includes("```\ninner fence stays"), "shorter inner fence is content");

const unclosed = seg("hello\n```json\n{\"a\":1}\nstill code");
check(kinds(unclosed) === "md,code" && unclosed[1].content === "{\"a\":1}\nstill code", "unclosed fence runs to end");

const inline = seg("use `some` inline code and `x````y` stays text");
check(kinds(inline) === "md", "inline backticks never open a segment");

const lead = seg("   ```py\nspaced opener\n```");
check(kinds(lead) === "code" && lead[0].lang === "py", "indented opener (CommonMark) works");

const infoBacktick = seg("``` has `backtick` in info\nnot a fence\ntail");
check(kinds(infoBacktick) === "md", "backtick in info string = not a fence (CommonMark)");

check(kinds(seg("answer\n```")) === "md", "dangling bare fence at EOF dropped");

const closeInfo = seg("```\nx\n``` notclose\n```");
check(kinds(closeInfo) === "code" && closeInfo[0].content === "x\n``` notclose", "close fence with text = content");

const crlf = seg("a\r\n```\r\nb\r\n```\r\nc");
check(kinds(crlf) === "md,code,md" && crlf[1].content === "b", "CRLF hidden from segmenter");

const multi = seg("```js\n1\n```\ntext\n```\n2\n```");
check(kinds(multi) === "code,md,code" && multi[2].content === "2", "multiple blocks in one answer");

const langEmpty = seg("```\nx\n```");
check(langEmpty[0].lang === undefined, "no info string → lang undefined");

/* ---------- mdToHtml (shim approximation) ---------- */

check(mdToHtml("# Big").includes("<h1>Big</h1>"), "heading h1");
check(mdToHtml("## Mid").includes("<h2>Mid</h2>"), "heading h2");
check(mdToHtml("- a\n- b").includes("<ul><li>a</li><li>b</li></ul>"), "unordered list");
check(mdToHtml("1. a\n2. b").includes("<ol><li>a</li><li>b</li></ol>"), "ordered list");
check(
	mdToHtml("- [x] done\n- [ ] todo").includes('class="task-list-item is-checked"') &&
		mdToHtml("- [x] done\n- [ ] todo").includes("checked"),
	"task list checked/unchecked"
);
check(mdToHtml("> famous\n> words").includes("<blockquote><p>famous<br>words</p></blockquote>"), "blockquote lines join");
check(mdToHtml("a\n\n---\n\nb").includes("<hr>"), "hr");
check(mdToHtml("**bold** and *em* and `code`").includes("<strong>bold</strong>"), "bold");
check(mdToHtml("**bold** and *em*").includes("<em>em</em>"), "italic");
check(mdToHtml("use `x` here").includes("<code>x</code>"), "inline code");
check(
	mdToHtml("see [[note-x]]").includes('class="internal-link" data-href="note-x"'),
	"wikilink with data-href"
);
check(
	mdToHtml("[link](https://example.com)").includes('href="https://example.com" class="external-link"'),
	"external link"
);
const tbl = mdToHtml("| A | B |\n|---|---|\n| 1 | 2 |");
check(tbl.includes("<table>") && tbl.includes("<th>A</th>") && tbl.includes("<td>2</td>"), "pipe table");
check(mdToHtml("a < b & \"quotes\"").includes("a &lt; b &amp; &quot;quotes&quot;"), "html escaped in prose");
check(mdToHtml("```\n<div>raw</div>\n```").includes("&lt;div&gt;raw&lt;/div&gt;"), "html escaped in fence");

/* ---------- markdown-preprocess (Copilot parity, source-verified) ---------- */

const {
	guardAssistantDiagramRemoteMedia: armDiagram,
	guardAssistantRemoteMedia: arm,
	preprocessAIResponse: pp,
	resolveVaultImages: rvi,
	sanitizeMermaidSrc: mmer,
	sanitizeMermaidFences: mmf,
	canonicalizeAssistantOutput: canonical,
	clipMarkdownFenceSafe: clipFenceSafe,
	walkMarkdownFences: walkFences,
} = require(out);

/* executable fences are neutralised — a compromised/hostile model answer
   must never run Dataview/Tasks queries through Obsidian's renderer */
check(pp("```dataview\nSELECT a\n```") === "```text\nSELECT a\n```", "dataview fence → text");
check(pp("```dataviewjs\nawait 1\n```") === "```javascript\nawait 1\n```", "dataviewjs fence → javascript");
check(pp("```tasks\nnot done\n```") === "```text\nnot done\n```", "tasks fence → text");
check(pp("```dataviewish\nx\n```").startsWith("```dataviewish"), "look-alike fence untouched");

/* LaTeX delimiters LLMs emit → the $$/$ Obsidian actually typesets */
/* faithful port detail: Copilot's delimiter regexes consume adjacent whitespace —
   multiline input collapses to one-line $$...$$; Obsidian still typesets it as display math. */
check(pp("\\[\nE = mc^2\n\\]") === "$$E = mc^2$$", "display math \\[ \\] → $$ (deviation: we emit real $$; Copilot's JS quirk yields single $)");
check(pp("inline \\(a+b\\) here") === "inline $a+b$ here", "inline math \\( \\) → $");
check(pp("`\\(not-math\\)`") === "`\\(not-math\\)`", "inline code protected from LaTeX pass");
check(pp("```\n\\[x\\]\n```") === "```\n\\[x\\]\n```", "fenced code protected from LaTeX pass");

/* vault images resolve outside code only; unknown targets stay verbatim */
const fakeApp = {
	metadataCache: {
		getFirstLinkpathDest: (sel) => (sel === "img.png" ? { path: "images/img.png" } : null),
	},
	vault: { getResourcePath: (f) => "app://local/" + f.path },
};
check(
	rvi("look ![[img.png]]", fakeApp) === "look ![](app://local/images/img.png)",
	"![[image]] → resourcePath"
);
check(rvi("![[missing.png]]", fakeApp) === "![[missing.png]]", "unknown image stays verbatim");
check(rvi("`![[img.png]]`", fakeApp) === "`![[img.png]]`", "image syntax inside code untouched");

/* Paket B: assistant-generated remote media must not create a network-load
   element before a user gesture. Ordinary links and local/data images stay. */
const remoteInline = arm("before ![tracking pixel](https://attacker.invalid/pixel.png) after");
check(
	!remoteInline.includes("![") && remoteInline.includes("[Remote image: tracking pixel blocked — click to open](<https://attacker.invalid/pixel.png>)"),
	"remote Markdown image becomes an ordinary user-gesture link"
);
check(arm("[ordinary link](https://example.org/page)") === "[ordinary link](https://example.org/page)", "ordinary remote links remain unchanged");
check(
	arm("![](app://local/images/x.png) ![](data:image/png;base64,iVBORw0KGgo=) ![](images/x.png)") ===
		"![](app://local/images/x.png) ![](data:image/png;base64,iVBORw0KGgo=) ![](images/x.png)",
	"vault/app, data, and relative image embeds remain available"
);
check(
	arm("`![x](https://attacker.invalid/code.png)`\n```md\n![x](https://attacker.invalid/fence.png)\n```") ===
		"`![x](https://attacker.invalid/code.png)`\n```md\n![x](https://attacker.invalid/fence.png)\n```",
	"remote-looking image syntax inside inline/fenced code remains literal"
);
const remoteRef = arm("![logo][cdn]\n\n[cdn]: https://attacker.invalid/logo.png");
check(remoteRef.startsWith("[logo][cdn]") && !remoteRef.startsWith("!["), "remote reference-style image loses embed semantics while link definition remains");
const remoteHtml = arm('<img src="https://attacker.invalid/a.png"><video poster="//attacker.invalid/p.jpg"></video>');
check(
	!/<(?:img|video)\b/i.test(remoteHtml) && remoteHtml.includes("blocked — click to open"),
	"raw HTML remote image/video tags become ordinary links before render"
);
check(
	arm('![x](<https://attacker.invalid/a(foo).png>)').includes("blocked — click to open") &&
		arm('![x](h&#116;tps&colon;&sol;&sol;attacker.invalid/e.png)').includes("blocked — click to open"),
	"parenthesised and entity-obfuscated remote Markdown destinations are blocked"
);
check(
	arm('<img alt=">" src="https://attacker.invalid/q.png">').includes("blocked — click to open") &&
		arm('<img src="h&#116;tps&colon;&sol;&sol;attacker.invalid/e.png">').includes("blocked — click to open") &&
		arm('<img src="h&Tab;ttps&colon;&sol;&sol;attacker.invalid/t.png">').includes("blocked — click to open"),
	"complete-tag scanner blocks quoted-angle, entity, and control-obfuscated HTML URLs"
);
check(
	arm('<feImage href="https://attacker.invalid/svg.png"><track src="//attacker.invalid/sub.vtt">').split("blocked — click to open").length === 3 &&
		arm('<base href="https://attacker.invalid/"><meta http-equiv="refresh" content="0;url=https://attacker.invalid/">').split("blocked").length >= 3,
	"SVG, media-support, base, and navigation tags cannot bypass the raw HTML guard"
);
check(
	!armDiagram('A@{ img: "https://attacker.invalid/diagram.png", label: "A" }').includes("attacker.invalid") &&
		armDiagram('click A href "https://example.org/details"').includes("https://example.org/details"),
	"Mermaid image properties are blocked without removing user-gesture diagram links"
);
check(
	arm('<img src="data:image/png;base64,iVBORw0KGgo=">').includes('<img src="data:image/png;base64,iVBORw0KGgo=">') &&
		arm('<a href="https://example.org/page">ordinary</a>') === '<a href="https://example.org/page">ordinary</a>',
	"raw HTML data image and ordinary link remain available"
);
const cssDirect = arm('<div style="background:url(https://attacker.invalid/bg.png)">x</div>');
const cssEscaped = arm('<div style="background:url(h\\74 tps://attacker.invalid/bg.png)">x</div>');
check(
	cssDirect.includes("blocked — click to open") && !cssDirect.includes("style=") &&
		cssEscaped.includes("blocked — click to open") && !cssEscaped.includes("style=") &&
		!arm('<style>.x{background:url(https://attacker.invalid/bg.png)}</style>').includes("attacker.invalid") &&
		!arm('@import "https://attacker.invalid/theme.css";').includes("attacker.invalid"),
	"remote CSS url(), escaped schemes, style blocks, and imports are neutralised"
);

/* 2026-08-07 v0.1.107 mermaid salvage (owner console: "Lexical error on
   line 2. Unrecognized text ... subgraph Agent Loop ✨"): bare subgraph
   titles carrying emoji die in mermaid's jison lexer — quoting is the
   official escape. Byte-verified through mermaid.parse@11: bare emoji
   title FAILS, quoted title parses, emoji node labels parse, plain-id
   subgraphs parse. Narrow & idempotent: quote only bare non-id titles,
   never re-touch quoted/id[title]/plain-id forms. */
check(mmer("subgraph Agent Loop ✨") === 'subgraph "Agent Loop ✨"', "mermaid: bare emoji subgraph title → quoted");
check(mmer("  subgraph Agent Loop ✨") === '  subgraph "Agent Loop ✨"', "mermaid: indent preserved");
check(mmer('subgraph "Agent Loop ✨"') === 'subgraph "Agent Loop ✨"', "mermaid: already-quoted untouched");
check(mmer("subgraph core") === "subgraph core", "mermaid: plain id untouched (edge-referencable)");
check(mmer("subgraph core[Core System]") === "subgraph core[Core System]", "mermaid: id[title] form untouched");
check(mmer("A[🚀 Task/Input] --> B[✅ Done]") === "A[🚀 Task/Input] --> B[✅ Done]", "mermaid: emoji node labels left alone (they parse)");
check(
	mmer("flowchart LR\n  subgraph Agent Loop ✨\n    A[🚀 Task/Input]\n  end\n  A -- digest --> C[Weekly review]") ===
	'flowchart LR\n  subgraph "Agent Loop ✨"\n    A[🚀 Task/Input]\n  end\n  A -- digest --> C[Weekly review]',
	"mermaid: one bad line fixed, neighbours byte-identical"
);
check(mmer("subgraph He said \"hi\" ✨") === 'subgraph "He said #quot;hi#quot; ✨"', "mermaid: inner double quotes escaped");
check(mmer("%% subgraph Agent ✨ stays a comment") === "%% subgraph Agent ✨ stays a comment", "mermaid: comment lines untouched");

/* 2026-08-09 v0.1.123 flowchart paren-label salvage (owner console:
   "Error: Parse error on line 3: … C[Skematik Desain (SD)] … got 'PS'").
   Byte-verified through mermaid.parse@11.16.1 (throwaway matrix replay):
   unquoted parens/quotes inside flowchart labels fail the whole diagram;
   quoted labels always parse; shape exteriors, free edge text, @-configs,
   class braces and non-flowchart diagrams stay byte-identical. */
check(mmer("flowchart LR\n  A[Konsep] --> C[Skematik Desain (SD)]; B -- Revi --> C") ===
	'flowchart LR\n  A[Konsep] --> C["Skematik Desain (SD)"]; B -- Revi --> C',
	"mermaid: kurung dalam label kotak → terkutip (kasus owner persis), teks edge bebas utuh");
check(mmer('flowchart LR\n  C["Skematik Desain (SD)"]') === 'flowchart LR\n  C["Skematik Desain (SD)"]',
	"mermaid: label berkutip tak disentuh (idempotent)");
check(mmer("flowchart LR\n  D{Decide (y/n)?} --> E") === 'flowchart LR\n  D{"Decide (y/n)?"} --> E',
	"mermaid: diamond berkurung → terkutip");
check(mmer("flowchart LR\n  A([Click (here)]) --> B") === 'flowchart LR\n  A(["Click (here)"]) --> B',
	"mermaid: interior stadium → terkutip, bentuk tetap stadium");
check(mmer("flowchart LR\n  DB[(Database (prod))]") === 'flowchart LR\n  DB[("Database (prod)")]',
	"mermaid: interior cylinder (kurung seimbang di ujung) → terkutip utuh");
check(mmer("flowchart LR\n  A[[Do (x)]] --> B") === 'flowchart LR\n  A[["Do (x)"]] --> B',
	"mermaid: interior subroutine → terkutip");
check(mmer("flowchart LR\n  H{{hex (a)}} --> B") === 'flowchart LR\n  H{{"hex (a)"}} --> B',
	"mermaid: interior hexagon → terkutip");
check(mmer("flowchart LR\n  A -->|Revisi (final)| B") === 'flowchart LR\n  A -->|"Revisi (final)"| B',
	"mermaid: caption edge berpipa → terkutip");
check(mmer('flowchart LR\n  A -->|"Revisi (final)"| B') === 'flowchart LR\n  A -->|"Revisi (final)"| B',
	"mermaid: caption berkutip tak disentuh");
check(mmer("flowchart LR\n  A([Go]) --> DB[(Storage)] --> S[[Proc]] --> H{{Hex}}") ===
	"flowchart LR\n  A([Go]) --> DB[(Storage)] --> S[[Proc]] --> H{{Hex}}",
	"mermaid: bentuk bersih tanpa kurung → byte-identical");
check(mmer("flowchart LR\n  A -- Revisi (final) --> B") === "flowchart LR\n  A -- Revisi (final) --> B",
	"mermaid: label edge BEBAS (tanpa pipa) meme parse — dibiarkan persis");
check(mmer("flowchart TD\n  A@{ label: 'Skematik Desain (SD)', shape: rect }") ===
	"flowchart TD\n  A@{ label: 'Skematik Desain (SD)', shape: rect }",
	"mermaid: konfigurasi @{ label: ... } tak disentuh");
check(mmer('flowchart LR\n  A[say "hi" now]') === 'flowchart LR\n  A["say #quot;hi#quot; now"]',
	"mermaid: kutip mentah di label → di-escape #quot; lalu terkutip");
check(mmer("graph TB\n  C[Skematik Desain (SD)]") === 'graph TB\n  C["Skematik Desain (SD)"]',
	"mermaid: keyword graph lama ikut terselamatkan");
check(mmer("flowchart LR\n  %% A[Note (x)] cuma komentar\n  B[Ok]") ===
	"flowchart LR\n  %% A[Note (x)] cuma komentar\n  B[Ok]",
	"mermaid: baris komentar tak disentuh");
check(mmer("classDiagram\n  class Foo{\n    +int bar()\n  }") === "classDiagram\n  class Foo{\n    +int bar()\n  }",
	"mermaid: classDiagram (kurung legal di class body) tak disentuh");
check(mmer("sequenceDiagram\n  A->>B: hello (x)") === "sequenceDiagram\n  A->>B: hello (x)",
	"mermaid: sequenceDiagram tak disentuh");
check(mmer("flowchart LR\n  C[Skematik Desain #40;SD#41;]") === "flowchart LR\n  C[Skematik Desain #40;SD#41;]",
	"mermaid: entitas #40;/#41; bukan pemicu (sudah aman) → byte-identical");
const bouquet = "flowchart LR\n  subgraph core[Core (sys)]\n    A[Start (s1)] --> B([Go (now)])\n  end\n  B -- ok --> C{Pick (1/2)}\n  C -->|Note (n1)| D[(Db (prod))]";
check(mmer(mmer(bouquet)) === mmer(bouquet), "mermaid: dua kali jalan == sekali jalan (idempoten pada buket)");

/* 2026-08-13 v0.1.143: exact owner diagram failed in both Chat UI and
   write_note with Mermaid 11.16.1: trailing JavaScript-like `; % comment`
   is not Mermaid syntax. Keeping `%%` inline also fails; preserve the
   statement and move the comment to its own `%%` line. */
const ownerInlinePercentDiagram = "graph TD\n    A[👤 User Input / Goal Setting] --> B(🧠 Harness: Penerima Tugas);\n\n    subgraph \"The Orchestration Loop\"\n        B --> C{❓ Keputusan Harness};\n        C -- Perlu Langkah Berikutnya --> D1[🤖 Agent Spesialis 1];\n        C -- Perlu Langkah Berikutnya --> D2[🤖 Agent Spesialis N];\n        C -- Selesai / Butuh Sintesis --> F;\n\n        D1 --> E{✅ Hasil Agent 1};\n        D2 --> E; % Semua agen mengirim hasil ke titik evaluasi bersama\n\n        E --> G{🛠️ Perlu Alat Eksternal?};\n        G -- Ya --> H[🌐 Tool Call: Search/API];\n        H --> I(⬅️ Hasil dari Tool);\n        I --> D1; % Atau Agen mana pun yang memanggilnya\n\n        G -- Tidak (Sudah Selesai Tugas) --> F;\n    end\n\n    F[📝 Harness: Sintesis & Review] --> J{🎯 Goal Tercapai?};\n\n    J -- Belum --> B; % Kembali ke awal loop untuk langkah korektif/berikutnya\n    J -- Ya --> K([✅ Output Akhir Diberikan ke User]);\n\n    style A fill:#f9d71c,stroke:#333,stroke-width:2px\n    style B fill:#4a90e2,stroke:#333,stroke-width:2px\n    style C fill:#ff6b6b,stroke:#333,stroke-width:3px\n    style F fill:#7ed321,stroke:#333,stroke-width:3px\n    style J fill:#ffb04a,stroke:#333,stroke-width:3px\n    style K fill:#1abc9c,stroke:#2ecc71,stroke-width:3px";
const ownerInlinePercentExpected = ownerInlinePercentDiagram
	.replace("        D2 --> E; % Semua agen mengirim hasil ke titik evaluasi bersama", "        D2 --> E;\n        %% Semua agen mengirim hasil ke titik evaluasi bersama")
	.replace("        I --> D1; % Atau Agen mana pun yang memanggilnya", "        I --> D1;\n        %% Atau Agen mana pun yang memanggilnya")
	.replace("    J -- Belum --> B; % Kembali ke awal loop untuk langkah korektif/berikutnya", "    J -- Belum --> B;\n    %% Kembali ke awal loop untuk langkah korektif/berikutnya");
check(mmer(ownerInlinePercentDiagram) === ownerInlinePercentExpected,
	"mermaid v0.1.143: diagram owner exact memindah 3 komentar inline ke baris %% sendiri");
check(mmer(mmer(ownerInlinePercentDiagram)) === ownerInlinePercentExpected,
	"mermaid v0.1.143: normalisasi komentar inline idempoten");
check(mmer('flowchart LR\n  A["literal; % tetap di label"] --> B\n  C[literal; % tetap di bracket] --> D\n  E -->|threshold 50%; % tetap di caption| F') ===
	'flowchart LR\n  A["literal; % tetap di label"] --> B\n  C[literal; % tetap di bracket] --> D\n  E -->|threshold 50%; % tetap di caption| F',
	"mermaid v0.1.143: persen mirip komentar di quote/label/caption byte-identical");
check(mmer('flowchart LR\n  A["literal; % label"] --> B; % komentar nyata') ===
	'flowchart LR\n  A["literal; % label"] --> B;\n  %% komentar nyata',
	"mermaid v0.1.143: kandidat dalam quote dilewati, suffix top-level tetap diselamatkan");
check(mmer("flowchart LR\n  A[Start (x)] --> B; % jangan ubah C[Label (y)] di komentar") ===
	'flowchart LR\n  A["Start (x)"] --> B;\n  %% jangan ubah C[Label (y)] di komentar',
	"mermaid v0.1.143: label statement diselamatkan tanpa mengubah payload komentar");
check(mmer("flowchart LR\n  A -- It's done --> B; % komentar sesudah apostrof") ===
	"flowchart LR\n  A -- It's done --> B;\n  %% komentar sesudah apostrof",
	"mermaid v0.1.143: apostrof di teks edge tidak menyamarkan suffix komentar");
check(mmer("flowchart LR\n  A --> B; %% komentar inline dua-persen") ===
	"flowchart LR\n  A --> B;\n  %% komentar inline dua-persen",
	"mermaid v0.1.144: exact inline ; %% dipindah utuh ke own-line");
check(mmer("%% preamble\n%%{init: {'theme': 'base'}}%%\n\nflowchart LR\n  A[X (y)] --> B; %% payload") ===
	"%% preamble\n%%{init: {'theme': 'base'}}%%\n\nflowchart LR\n  A[\"X (y)\"] --> B;\n  %% payload",
	"mermaid v0.1.144: comment/directive/blank preamble tetap memungkinkan salvage");
check(mmer("sequenceDiagram\n  A->>B: nilai; % bukan komentar flowchart") ===
	"sequenceDiagram\n  A->>B: nilai; % bukan komentar flowchart",
	"mermaid v0.1.143: non-flowchart byte-identical");
check(mmer("flowchart LR\r\n  A --> B; % komentar CRLF\r\n  B --> C") ===
	"flowchart LR\r\n  A --> B;\r\n  %% komentar CRLF\r\n  B --> C",
	"mermaid v0.1.143: CRLF dan indentasi dipertahankan");

/* 2026-08-09 v0.1.124: sanitizeMermaidFences — the 'PS' crash rode the
   VAULT via /save exports (owner startup stack loadLayout → loadFile →
   … → mermaid.render on the exported note). Walk document fences and
   salvage only mermaid bodies; everything else byte-identical. */
check(mmf("teks atas\n\n```mermaid\nflowchart LR\n  C[Skematik Desain (SD)] --> B[Ok]\n```\n\n```json\n{\"a\": 1}\n```\n\ntutup") ===
	'teks atas\n\n```mermaid\nflowchart LR\n  C["Skematik Desain (SD)"] --> B[Ok]\n```\n\n```json\n{"a": 1}\n```\n\ntutup',
	"ekspor-doc: fence mermaid terselamatkan, fence json & prosa byte-identical");
check(mmf("~~~mermaid\ngraph TB\n  A[Alur (x)]\n~~~") === '~~~mermaid\ngraph TB\n  A["Alur (x)"]\n~~~',
	"ekspor-doc: fence tilde ikut berjalan");
check(mmf("```MERMAID\nflowchart LR\n  A[X (y)]\n```") === '\`\`\`MERMAID\nflowchart LR\n  A["X (y)"]\n\`\`\`'.replace("```MERMAID", "```MERMAID"),
	"ekspor-doc: lang MERMAID kapital tetap dikenali");
check(mmf("````mermaid\nflowchart LR\n  A[X (y)]\n````") === '````mermaid\nflowchart LR\n  A["X (y)"]\n````',
	"ekspor-doc: fence 4 backtick cocok tutupnya (bukan 3)");
check(mmf("```mermaid\nflowchart LR\n  A[X (y)]") === "```text\nflowchart LR\n  A[X (y)]\n```",
	"ekspor-doc v0.1.144: fence Mermaid tak tertutup dinetralkan dan ditutup");
check(mmf("```mermaid\nflowchart LR\n  A --> B\n```mermaid\nflowchart LR\n  B --> C\n```").startsWith("```text\n"),
	"ekspor-doc v0.1.144: merged/reopened Mermaid fail-closed sebagai text");
check(mmf('```mermaid\nflowchart LR\n  A["X (y)"]\n```') === '```mermaid\nflowchart LR\n  A["X (y)"]\n```',
	"ekspor-doc: fence sudah bersih → byte-identical");
check(mmf("tanpa fence sama sekali C[Skematik Desain (SD)]") === "tanpa fence sama sekali C[Skematik Desain (SD)]",
	"ekspor-doc: tanpa fence tak tersentuh");
check(mmf(mmf("```mermaid\nflowchart LR\n  A[X (y)] --> B([Go (1)])\n```")) === mmf("```mermaid\nflowchart LR\n  A[X (y)] --> B([Go (1)])\n```"),
	"ekspor-doc: idempoten dua kali jalan");

/* v0.1.144 R13–R20: one structural fence policy for canonical outputs and
   hard-capped cron views. */
const adjacentMermaid = "```mermaid\nflowchart LR\n  A[X (1)] --> B\n```\n```mermaid\ngraph TD\n  C[Y (2)] --> D\n```";
const adjacentCanonical = canonical(adjacentMermaid);
check(
	walkFences(adjacentCanonical).length === 2 && adjacentCanonical.includes('A[\"X (1)\"]') && adjacentCanonical.includes('C[\"Y (2)\"]'),
	"R13 adjacent Mermaid fences stay separate and both canonicalize"
);
const mixedDelimiters = "~~~mermaid\nflowchart LR\n  A[X (1)] --> B\n~~~\n```json\n{\"x\": 1}\n```";
check(
	canonical(mixedDelimiters) === "~~~mermaid\nflowchart LR\n  A[\"X (1)\"] --> B\n~~~\n```json\n{\"x\": 1}\n```",
	"R14/R15 mixed delimiters remain original and non-Mermaid is byte-identical"
);
const mergedRetry = "```mermaid\nflowchart LR\n A-->A\n``````mermaid\ngraph TD\n C-->D\n```";
check(
	canonical(mergedRetry).startsWith("```text\n") && walkFences(mergedRetry)[0].malformed,
	"R16 merged retry boundary is deterministic fail-closed text"
);
const prematureReopen = "```mermaid\nflowchart LR\n A-->A\n```mermaid\ngraph TD\n C-->D\n```";
check(canonical(prematureReopen).startsWith("```text\n"), "R17 premature Mermaid reopen is never executable");
check(
	canonical("```mermaid\nflowchart LR\n A-->B") === "```text\nflowchart LR\n A-->B\n```",
	"R18 unclosed Mermaid uses canonical text-and-close policy"
);
check(
	canonical("````mermaid\nflowchart LR\n A[X (1)]\n````") === "````mermaid\nflowchart LR\n A[\"X (1)\"]\n````",
	"R19 four-backtick opener retains its matching delimiter"
);
const clipInside = "intro\n```mermaid\n" + "x".repeat(100) + "\n```\ntail";
const clippedInside = clipFenceSafe(clipInside, 24);
check(clippedInside === "intro…" && clippedInside.length <= 24, "R20 clipping omits a whole fence and includes marker inside cap");
const fullBeforeCut = "```mermaid\nflowchart LR\nA-->B\n```\n" + "x".repeat(100);
const clippedAfterFence = clipFenceSafe(fullBeforeCut, 48, "…end");
check(
	clippedAfterFence.includes("```mermaid\nflowchart LR\nA-->B\n```") && clippedAfterFence.length <= 48,
	"R20 clipping retains a complete fence before the cut and never exceeds cap"
);
check(clipFenceSafe("abcdef", 0) === "" && clipFenceSafe("abcdef", 2, "long") === "lo", "R20 zero/tiny caps remain hard caps");

/* 2026-08-09 v0.1.125: class-BEFORE label `ID:::cls[...]` is never valid
   jison (byte-verified on 11.16.1 — dies even on clean labels) — reorder
   to class-after (parses for every shape) and the label chain quotes
   parens afterwards. */
check(mmer("flowchart LR\n  A:::big[Label (x)] --> B") === 'flowchart LR\n  A["Label (x)"]:::big --> B',
	"mermaid: class-sebelum + kurung → class-sesudah + terkutip");
check(mmer("flowchart LR\n  A:::big[Plain] --> B") === "flowchart LR\n  A[Plain]:::big --> B",
	"mermaid: class-sebelum label bersih → direorder (selalu invalid di jison)");
check(mmer("flowchart LR\n  DB:::store[(Database)] --> A") === "flowchart LR\n  DB[(Database)]:::store --> A",
	"mermaid: class-sebelum cylinder → class-sesudah, bentuk utuh");
check(mmer('flowchart LR\n  A["Label (x)"]:::big --> B') === 'flowchart LR\n  A["Label (x)"]:::big --> B',
	"mermaid: class-sesudah berkutip → byte-identical");

/* ---------- computeMarkdownEdit send-chord (v0.1.127, owner ×3) ----------
   Bawaan baru: Shift+Enter = kirim / Enter = baris baru; toggle ON membalik;
   Ctrl/Cmd+Enter TAK PERNAH dijahit mesin (dilepas utuh ke lapisan UI). */
const { computeMarkdownEdit: mkEdit } = require(out);
const caretEnd = (v) => ({ value: v, selectionStart: v.length, selectionEnd: v.length });
const CH_OFF = { newlineOnShiftEnter: true, sendKey: "shift-enter" };
const CH_ON = { newlineOnShiftEnter: true, sendKey: "enter" };

/* non-list = null di SEMUA mode — mesin hanya memiliki LIST; baris-baru
   teks-polos composer dijahit pemanggilnya lewat hard-break native
   (lane-proof v0.1.127: satu-satunya jalur yang byte-benar kuat) */
check(mkEdit(caretEnd("halo"), { key: "Enter", shiftKey: false }, CH_OFF) === null,
	"chord OFF: Enter polos non-list = null (hard-break native pemanggil)");
check(mkEdit(caretEnd("halo"), { key: "Enter", shiftKey: true }, CH_OFF) === null,
	"chord OFF: Shift+Enter DILEPAS — milik chord kirim UI");
check(mkEdit(caretEnd("halo"), { key: "Enter", shiftKey: false }, CH_ON) === null,
	"chord ON: Enter DILEPAS — milik chord kirim UI");
check(mkEdit(caretEnd("halo"), { key: "Enter", shiftKey: true }, CH_ON) === null,
	"chord ON: Shift+Enter non-list = null (hard-break native pemanggil)");
check(mkEdit(caretEnd("halo"), { key: "Enter", shiftKey: false, ctrlKey: true }, CH_ON) === null,
	"Ctrl+Enter tak pernah dijahit mesin (ON)");
check(mkEdit(caretEnd("halo"), { key: "Enter", shiftKey: false, ctrlKey: true }, CH_OFF) === null,
	"Ctrl+Enter tak pernah dijahit mesin (OFF)");
check(mkEdit(caretEnd("halo"), { key: "Enter", shiftKey: true, metaKey: true }, CH_OFF) === null,
	"Cmd+Shift+Enter juga dilepas utuh");
check(mkEdit(caretEnd("- a"), { key: "Enter", shiftKey: false }, CH_OFF)?.value === "- a\n- ",
	"chord OFF: lanjutan list TETAP hidup di Enter polos");
{
	const keluar = mkEdit(caretEnd("- a\n- "), { key: "Enter", shiftKey: false }, CH_OFF);
	check(keluar?.kind === "enter" && keluar.value === "- a\n",
		"chord OFF: item kosong KELUAR list tetap jalan (penanda dihapus, barisnya bertahan)");
}
/* warisan textarea tanpa sendKey — pakai teks LIST supaya bedanya terukur */
check(mkEdit(caretEnd("- a"), { key: "Enter", shiftKey: false }, { newlineOnShiftEnter: false })?.value === "- a\n- "
	&& mkEdit(caretEnd("- a"), { key: "Enter", shiftKey: true }, { newlineOnShiftEnter: false }) === null
	&& mkEdit(caretEnd("- a"), { key: "Enter", shiftKey: false }, { newlineOnShiftEnter: true }) === null
	&& mkEdit(caretEnd("- a"), { key: "Enter", shiftKey: true }, { newlineOnShiftEnter: true })?.value === "- a\n- ",
	"warisan newlineOnShiftEnter tanpa sendKey: byte-identical");

if (failed > 0) {
	console.error(`\n${failed} markdown test(s) FAILED`);
	process.exit(1);
}
console.log("\nAll markdown checks passed.");
