# Open Agent v0.1.142 — Mermaid inline-percent audit

**Date:** 2026-08-13 (Asia/Jakarta)  
**Status:** root cause reproduced; no source modified

## Owner reproduction

The reported flowchart contains three trailing single-percent comments:

```mermaid
D2 --> E; % Semua agen mengirim hasil ke titik evaluasi bersama
I --> D1; % Atau Agen mana pun yang memanggilnya
J -- Belum --> B; % Kembali ke awal loop untuk langkah korektif/berikutnya
```

Obsidian reports `Parse error ... got 'NODE_STRING'` at the first line.

## Reproduction against Mermaid 11.16.1

- raw owner diagram: **FAIL**, same line and token;
- current v0.1.142 `sanitizeMermaidSrc`: output byte-identical, all 3 invalid comments remain, parser **FAIL**;
- current v0.1.142 `sanitizeMermaidFences`: fenced document byte-identical, all 3 invalid comments remain;
- changing `%` to inline `%%`: still **FAIL**;
- moving each comment to a separate, indentation-preserving `%% ...` line: **PASS**.

## Root cause

Mermaid flowchart comments use `%%` and need their own line. The model emitted a JavaScript/C-like trailing `%` comment after a semicolon. The existing sanitizer handles emoji subgraph titles, parenthesized/quoted flowchart labels, edge-pipe captions, and class-before-label ordering, but it does not handle trailing single-percent comments.

The same shared coverage hole explains both surfaces:

1. chat uses `MarkdownDoc -> sanitizeMermaidSrc -> Obsidian MarkdownRenderer`;
2. `write_note` uses `sanitizeMermaidFences`, which calls the same `sanitizeMermaidSrc`, so the invalid source is persisted into the Markdown file.

Relevant Mermaid sanitizer/renderer/tool files and their regression tests are byte-identical between v0.1.141 and v0.1.142. Therefore this was not introduced by Paket Notifications; it is an older syntax-coverage hole exposed by the new diagram.

## Proposed v0.1.143 patch

1. Add a narrow flowchart-only salvage for a top-level `; % comment` suffix.
2. Emit the statement unchanged, followed by an indentation-preserving own-line `%% comment`.
3. Detect top-level context so `%` inside quoted labels, brackets/shapes, edge captions, style values, and valid `%%` comments is not rewritten.
4. Keep the transform idempotent and byte-identical when no invalid suffix exists.
5. Add the exact owner diagram as a red-to-green regression for both chat sanitizer and fenced `write_note` create/overwrite/append paths.
6. Re-run the real Mermaid 11.16.1 parser matrix, configured project tests, real chat/Settings previews, privacy/integrity gates, and full release pipeline in a new v0.1.143 candidate.

Protected v0.1.142 remains read-only.
