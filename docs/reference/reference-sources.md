---
title: "Reference sources (official upstream registry)"
type: reference
status: active
date: 2026-08-07
tags: [openagent, reference, sources]
---

# Reference sources (official upstream registry)

Indeks satu pintu untuk SEMUA sumber resmi yang boleh dikutip saat kerja parity.
Aturan main (dari working-agreement): **verify raw dulu** (raw.githubusercontent /
API / lampiran resmi owner), tandai tanggal verifikasinya, jangan pernah styling
dari bacaan narasi docs sendirian (pelajaran 86 — pixel/SOURCE mengalahkan teks).

> Dibuat 2026-08-07 setelah owner menyerahkan lobe-ui + shadcn-ui.
> Status tiap entri: *verified* = struktur repo + file kunci dibaca langsung hari itu.

## Component/refs utama

| Sumber | URL | Untuk apa di proyek ini | Status |
|---|---|---|---|
| **prompt-kit** | github.com/ibelick/prompt-kit (`main`) | Paritas komponen chat: thinking-bar, tool, loader, message, prompt-input, reasoning, feedback | verified (dipakai harian, raw fetch per komponen) |
| **lobe-ui** | github.com/lobehub/lobe-ui (`master`) | Paritas fitur AIGC lanjutan: **CodeDiff** (acuan approval-preview diff), Highlighter, komponen chat AIGC lain | verified 2026-08-07 (repo+tree+file kunci via API/raw) |
| **shadcn-ui/ui** | github.com/shadcn-ui/ui (`main`) | Disiplin design-token (CSS-var theming), pola aksesibilitas primitif (radix/base-ui), referensi komponen umum bila butuh port baru | verified 2026-08-07 (repo via API) |
| Hermes Agent | github.com/NousResearch/hermes-agent | Arsitektur agent loop, tools, skills, sessions | historical (lihat doc studi per fitur) |
| Hermes Desktop | hermes-agent/tree/main/apps/desktop | Peta settings + shell chat | historical |
| obsidian-copilot | github.com/logancyang/obsidian-copilot | Preprocess markdown, ApplyView/diff recipe | historical |
| Obsidian app.css | `test/reference-obsidian-app.css` (snapshot canonical untuk harness) | Token tema resmi Obsidian (warna, spacing, radius); **diff-view resmi: baris 0.2 / segmen 0.4** | verified 2026-08-07 (lampiran owner) |
| lucide | github.com/lucide-icons/lucide | Glyph resmi — body SVG di-inline verbatim (nama antar-era berubah: circle-check/check-circle dsb) | verified (per glyph, curl) |

## CodeDiff (lobe-ui) — fakta terverifikasi SOURCE 2026-08-07

Kunci file: `src/CodeDiff/{CodeDiff.tsx, DiffPanel.tsx, PatchDiff.tsx, style.ts, theme.ts, type.ts, demos/Unified.tsx}`.

1. **Mesin diff-nya bukan tulisan lobe** — wrap library **`@pierre/diffs`**
   (`MultiFileDiff`, shadow-DOM `:host` CSS vars). Artinya port langsung mustahil
   (web component + antd-token) — pendekatan port-visual kita (markup+CSS sendiri)
   adalah jalan yang benar; sumber ini dipakai untuk MENGUNCI angka/struktur.
2. **Screenshot owner = `demos/Unified.tsx` byte-for-byte** (pasangan oldCode/
   newCode `import React` → `import React, { useState }` dst.) — jadi referensi
   visual diff kita kini punya repro resmi: `viewMode="unified"`.
3. **Token tint**: `:host` override memetakan `--diffs-added-light:
   colorSuccessHover · --diffs-added-dark: colorSuccessBorderHover ·
   --diffs-deleted-* : colorErrorHover/colorErrorBorderHover` (varian *Hover* =
   translusen, konsisten dgn pixel hasil probing + konvensi Obsidian 0.2/0.4).
   `[data-gutter-buffer]{opacity:.2}` (area filler gutter). Header:
   `fontFamilyCode 13px colorTextSecondary`; kelas `additions=colorSuccess 12px`,
   `deletions=colorError 12px`.
4. **Counts header dihitung NAIF** (`countContentChanges`): himpunan baris —
   jumlah baris unik yang hilang di tiap sisi, BUKAN line-diff. Pada kasus umum
   sama hasilnya dgn jsdiff kita; pada file dgn baris duplikat angkanya bisa
   berbeda (kita lebih akurat — sengaja tidak ditiru, catat supaya tak "dikoreksi"
   balik suatu hari).
5. Header mendukung `showHeader`, `defaultExpand`, `actionsRender`
   (custom action kanan), `variant: filled|outlined|borderless`.

## shadcn-ui — cara pakai yang sehat

- Pola yang boleh ditiru: konvensi token tema (satu keluarga var radius/warna,
  `--radius` turunan), pola `aria-*` primitif, struktur komponen kecil
  compose-over-config.
- Pola yang JANGAN ditiru mentah: Tailwind utility inline (stylesheet kita
  selector-based, terikat var tema Obsidian) — terjemahkan kelasnya ke var
  `var(--*)` Obsidian, pertahankan konvensi `oa-` + discipline LESSON 75
  (refine selector di tempat; append-at-EOF hanya selector BARU).

## Data Entry (lobe-ui) — fakta terverifikasi SOURCE 2026-08-07 (v0.1.108)

Dipakai untuk port settings (owner: komponen lobe-ui data entry di page
settings; scope BOTH). File raw yang di-curl ulang dari master:

- `src/Segmented/Segmented.tsx` + `src/Segmented/style.ts` — wrapper tipis
  antd **Segmented**. Variant filled: rail `border: 1px solid
  colorFillQuaternary; background: colorBgLayout`, thumb kartu meluncur ke
  opsi aktif. Port kita: `createSegmented` — radiogroup + roving tabindex,
  thumb `transition: left/width .18s` (src/ui/settings-controls.ts).
- `src/SliderWithInput/SliderWithInput.tsx` — antd **Slider + InputNumber**
  dalam Flexbox horizontal gap 16; kotak `maxWidth: 64` (small 40);
  `unlimitedInput` (default false) melepas `max` dari InputNumber sehingga
  ketikan boleh melebihi rail; `Number.isNaN || isNull` diabaikan;
  `changeOnWheel` default OFF di antd (kita tak memasang wheel-handler).
  Port kita: `createSliderInput` — temperature -1..2 step 0.05 · maxTokens
  rail 0..16384 step 256 + unlimitedInput.

Keduanya wrapper antd TIPIS — yang diport kontrak behavior-nya, bukan
JSX/token antd (tema antd != Obsidian; penempatan CSS patuh LESSON 75).

## Komponen lobe-ui lain (verifikasi 2026-08-20)

Listing penuh `src/` (78) + `src/chat/` (13) + `src/base-ui/` (24) dibaca via
GitHub API; file kunci diverifikasi raw: `Empty/type.ts`, `EditableText/type.ts`,
`chat/TokenTag/TokenTag.tsx`, `chat/BackBottom/BackBottom.tsx`. Analisis
layak-port vs skip: `docs/studies/lobe-ui-gap-2026-08-20.md`.

