---
title: "Plan — Markdown Format Rendering di Chat"
type: plan
status: done
date: 2026-07-19
tags: [openagent, markdown, ui, plan]
---

# Plan — Markdown Format Rendering di Chat

> **STATUS: ✅ SELESAI (2026-07-19)** — Streaming: **hybrid** · Code block: **prompt-kit CodeBlock** · Tipografi: **compact chat** · Reasoning: **tetap plain**. 10 suite hijau (37 cek markdown baru), preview `preview-chat-markdown.html` terverifikasi visual.

## Konteks

Jawaban agent sudah dirender lewat `MarkdownRenderer` Obsidian (`src/ui/components/markdown.tsx`, dipakai di `ChatApp.tsx` render text part). Masalah saat ini:

1. **Render ulang penuh tiap token streaming** (`useEffect` per token → parse + DOM rebuild puluhan kali/detik) → flicker, scroll melompat, fence ` ``` ` belum tertutup membuat sisa jawaban berubah jadi blok kode sesaat.
2. **Tipografi bawaan reader** di pane chat 380px: heading raksasa, jarak list/tabel lebar, tabel kepotong.
3. **Tidak ada copy button** di code block — `code-block.tsx` (port prompt-kit) belum dipakai sama sekali.
4. **Link mati** — klik `[[wikilink]]` / link eksternal dalam custom view tidak kebuka (tidak ada handler).
5. **Preview shim naif** — `mdToHtml` di `obsidian-shim.ts` hanya tahu fence + list → preview tidak jujur untuk markdown kaya.

## Keputusan implementasi (binding)

| # | Pilihan | Konsekuensi |
|---|---|---|
| Streaming | **Hybrid** | Saat `running`: teks plain `white-space: pre-wrap` (stabil). Selesai: render markdown penuh |
| Code block | **prompt-kit CodeBlock** | Segmen fence dipisah dari markdown + dirender komponen sendiri (header bahasa + copy). Kehilangan Prism Obsidian — diterima |
| Skala | **Compact** | h1 1.25em → h4 1.0em, list/tabel/blockquote dirapatkan, semua CSS vars Obsidian |
| Reasoning | **Plain** | Body CoT tetap pre-wrap polos |

## Desain

### A. Segmenter (`src/ui/markdown-segments.ts`, murni)
`splitMarkdownSegments(text) → ({ kind: "md" | "code"; lang?: string; content: string })[]`
- Parser berbasis baris: fence pembuka = baris diawali ≥3 backtick **atau** ≥3 tilde; penutup = karakter sama, panjang ≥ pembuka.
- `lang`: sisa baris pembuka (trim, kosong → `undefined`).
- Fence tak tertutup di akhir → segmen code sampai habis (jawaban model lupa tutup tetap tampil sebagai kode).
- Inline `` ` `` tidak pernah memulai segmen (fence hanya valid di awal baris) → aman untuk teks ber-backtick.

### B. Komponen render
- `markdown.tsx` ditambah **`MarkdownDoc`**: memetakan segmen → `Markdown` (Obsidian renderer) untuk `md`, `CodeBlock` untuk `code`. `Markdown` lama tetap dipakai internal.
- **`code-block.tsx`** diaktifkan: `<CodeBlock language code>` — header (bahasa + copy button `navigator.clipboard`, ikon Copy→Check ala `CopyAction`) + `<pre>` scroll. Style `.oa-code-block` sebagian sudah ada di styles.css — dilengkapi (header bar, tombol, `.oa-stream-text`).
- **`ChatApp.tsx`**: text part assistant → `streaming/running` ? `<span class="oa-stream-text">{text}</span>` : `<MarkdownDoc>{text}</MarkdownDoc>`. Gate memakai state `running` yang sudah ada (bukan hanya turn berjalan — block teks terakhir).

### C. Klik link (delegasi)
Satu handler di root chat (`.oa-app`): `closest(".oa-markdown a")` →
- `[[wikilink]]` / `.internal-link` → `app.workspace.openLinkText(href, sourcePath)`
- `.external-link` / `http(s)` → `window.open(href)`
- Tidak ikut campur untuk anchor `#heading` internal.

### D. Tipografi compact (styles.css, blok `.oa-markdown`)
- Heading: h1 1.25em / h2 1.15em / h3 1.05em / h4+ 1.0em; margin rapat; h1/h2 tanpa border bawah (flat).
- List: padding-left 1.2em, gap item 2px; nested rapat. Task list: checkbox readonly tampil rapi.
- Tabel: border `var(--background-modifier-border)`, header `var(--background-secondary)`, sel padding 4/8px, wrapper `overflow-x:auto`.
- Inline code: chip `var(--background-secondary)` + radius 4px. Blockquote: border-left 2px `var(--background-modifier-border)` + text muted. hr: hairline. img: max-width 100%.
- Semua via CSS vars Obsidian (kontrak proyek), tanpa emoji.

### E. Preview jujur
- Shim `mdToHtml` di-upgrade: h1–h4, bold/italic, inline code, link, hr, blockquote, tabel pipe sederhana, task list — cukup untuk paritas visual kecil.
- Skenario real-preview baru **`md`**: jawaban canned kaya (heading, list-bold, tabel, fence TS berbahasa, blockquote, `[[wikilink]]`, inline code) dirender kondisi selesai → halaman baru **`preview/preview-chat-markdown.html`**.
- Karena fence dipisah oleh kode kita (bukan Obsidian), CodeBlock di preview = 100% real; render md non-kode ≈ aproksimasi shim (dinyatakan di deskripsi halaman).

## Tahap implementasi

| Tahap | Isi | Verifikasi |
|---|---|---|
| A | segmenter murni + `MarkdownDoc` + gate hybrid di ChatApp | unit suite `test/markdown.test.cjs` |
| B | CodeBlock aktif (+styles header/copy) | unit + frame `md` |
| C | klik link delegasi + tipografi compact | frame `md` + smoke guards |
| D | shim upgrade + skenario `md` + halaman preview | screenshot verifikasi |
| E | pipeline penuh (tsc/build/9+1 suite/preview/ZIP) | hijau semua |

## Test plan

`test/markdown.test.cjs` (baru, pola esbuild-bundle seperti attach.test):
- fence dasar, multi blok, `~~~`, fence panjang ≥ pembuka, lang ada/tidak, tak tertutup, inline backtick aman, CRLF, fence di awal teks, teks kosong.
- shim `mdToHtml`: heading/bold/tabel menghasilkan tag yang diharapkan (aproksimasi tidak menyimpang diam-diam).
- smoke guards: `splitMarkdownSegments` dipakai ChatApp, `oa-stream-text` gate `running`, `CodeBlock` direferensikan, blok CSS compact ada, delegasi klik ada, skenario `md` terdaftar di `build.mjs` + `SCENARIOS`.

## Di luar scope

- Syntax highlight penuh di CodeBlock (keputusan: terima kehilangan Prism untuk sekarang; bisa ditambah nanti via Prism bawaan Obsidian kalau mau).
- Math/LaTeX (MathJax renderer Obsidian ikut MarkdownRenderer — blok md tetap dapat otomatis; segmen `code` tidak).
- Render markdown untuk pesan **user** (tetap plain untuk `@`-refs & kecepatan).
