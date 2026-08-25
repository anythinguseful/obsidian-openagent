---
title: "Studi: lobe-ui → Open Agent (gap komponen untuk penataan ulang UI)"
type: study
status: done
date: 2026-08-20
tags: [openagent, lobe-ui, ui, study]
---

# Studi: lobe-ui → Open Agent (gap komponen untuk penataan ulang UI)

## Summary

Owner berencana menata ulang UI agar lebih rapi, dan meminta cek komponen lobe-ui
mana yang layak diterapkan. Sumber diverifikasi langsung dari repo resmi
`lobehub/lobe-ui` (`master`) pada 2026-08-20:

- listing `src/` (78 komponen), `src/chat/` (13), `src/base-ui/` (24) via GitHub API;
- file kunci dibaca raw: `Empty/type.ts`, `EditableText/type.ts`,
  `chat/TokenTag/TokenTag.tsx`, `chat/BackBottom/BackBottom.tsx`.

Konteks yang menetapkan arah (dari `reference-sources.md` + Lesson 75):
lobe-ui dibangun di atas **antd v5** (design-token `antd-style`). Port langsung
mustahil — tema antd ≠ tema Obsidian. Yang layak = **port pola/perilaku + kontrak
prop**, bukan JSX/token. Ini persis yang sudah kita lakukan untuk CodeDiff,
Segmented, dan SliderWithInput.

## Yang SUDAH diport dari lobe-ui (jangan diulang)

| lobe-ui | Port kita |
|---|---|
| CodeDiff | `src/ui/preview-diff.tsx` (approval-preview diff) |
| Segmented | `createSegmented` (src/ui/settings-controls.ts) |
| SliderWithInput | `createSliderInput` (src/ui/settings-controls.ts) |
| Highlighter | `src/ui/highlight.ts` + markdown-segments |

## A — Layak diterapkan (untuk penataan ulang)

Diurut nilai-tertinggi dulu. Semua ini mengisi **gap nyata** di UI kita, bukan
sekadar kosmetik.

### A1. EditableText — rename sesi inline di panel (GAP FUNGSI)
- Verified: `EditableText.tsx` = teks + ikon pensil → klik jadi input, commit saat
  blur/Enter (`onChangeEnd`).
- UI kita: panel sesi hanya bisa **hapus**; rename cuma lewat `/title`. Celah
  fungsi nyata.
- Penerapan: baris sesi + judul topbar pakai pola klik-untuk-edit, persist ke
  SessionStore (hati-hati id + partition, pola `persistQueue` yang sudah ada).

### A2. Empty — standarisasi empty state (GAP KONSISTENSI)
- Verified: `Empty/type.ts` = `title` + `description` + `action` + `icon`/`image`
  + `type: 'default' | 'page'`.
- UI kita: string ad-hoc tersebar — "No saved chats yet.", "No chats match.",
  empty hub, empty skills, empty automations. Tiap permukaan beda rasa.
- Penerapan: satu pola `oa-empty` (judul + deskripsi + aksi opsional), dipakai di
  panel sesi, hub, skills, automations. Intro chat tetap komponen sendiri.

### A3. TokenTag — pill pemakaian token (GAP INFORMASI)
- Verified: `chat/TokenTag/TokenTag.tsx` = angka token + progress ring + mode
  `used` / `remained` / `overload` (merah saat > 100%).
- UI kita: statusbar cuma `↑in ↓out` polos, tanpa konteks sisa/batas.
- Penerapan: statusbar + (opsional) composer — "↑in ↓out · N% dari window",
  merah saat melewati context window.

### A4. SortableList — drag-reorder snippet (GAP UX)
- Identified by name (listing `src/SortableList`); lobe pakai dnd-kit.
- UI kita: urutan snippet di Commands pakai tombol chevron up/down (baris 2218).
- Penerapan: drag-and-drop baris snippet; fallback tombol tetap ada untuk a11y.

### A5. BackBottom — tombol kembali-ke-bawah (ENRICH)
- Verified: `chat/BackBottom/BackBottom.tsx` = muncul saat scroll menjauh ≥ 240px,
  smooth-scroll ke bawah, dukungan unread-count badge.
- UI kita: `scroll-button.tsx` (port prompt-kit) sudah ada. Nilai tambah lobe =
  ambang visibilitas + badge jumlah belum-terbaca.
- Penerapan: opsional — perkaya ScrollButton, bukan ganti.

### A6. FileTypeIcon — ikon tipe file di chip attachment (POLISH)
- Identified by name; petakan ekstensi → ikon.
- UI kita: chip attachment polos tanpa penanda tipe (md/pdf/png/…).
- Penerapan: ikon kecil di chip lampiran + picker `[+]`.

### A7. Skeleton — placeholder loading daftar (POLISH)
- Identified by name.
- UI kita: panel sesi/hub loading tanpa bentuk.
- Penerapan: skeleton baris saat `refreshSessions()` / hub fetch.

### A8. ColorSwatches — pemilih warna profil (POLISH, nilai kecil)
- Identified by name; swatch bulat, terpilih dikelilingi ring.
- UI kita: dot warna profil manual di Profiles.
- Penerapan: opsional; nilai kecil karena fungsinya sudah jalan.

## B — Sudah punya / sudah diport (skip)

Bubble/Message (`message.tsx` prompt-kit) · ChatInputArea/MessageInput
(`prompt-input.tsx`) · ChatList (`chat-container.tsx` + stick-to-bottom) ·
LoadingDots (`loader.tsx`) · CopyButton (`CopyAction`) · Tooltip (Obsidian
`setTooltip`) · Toast (Obsidian `Notice`) · SearchBar (`search-field.tsx`) ·
Menu/DropdownMenu/ContextMenu (popover + menu konteks editor) · Snippet
(`code-block.tsx`) · Markdown/Mermaid (renderer Obsidian) · ScrollArea (CSS).

## C — Sengaja TIDAK diterapkan (alasan kontrak)

| lobe-ui | Alasan |
|---|---|
| EmojiPicker · FluentEmoji | `agents/skills/internal/openagent-ui/SKILL.md` larang emoji di UI produksi |
| ThemeSwitch · ThemeProvider · ConfigProvider · MotionProvider | tema = milik Obsidian (kontrak `var(--*)`), tidak boleh ditimpa |
| Input · Select · Checkbox · Radio · Switch · AutoComplete · DatePicker | `Setting` Obsidian sudah menyediakan form-control resmi |
| Modal · Form · FormModal · Drawer · Popover | `Modal` Obsidian + `Setting` |
| DraggablePanel | Quick Ask sudah punya drag/resize/anchor-guard sendiri |
| DraggableSideNav · SideNav · Layout · Header · Footer · Flex · Grid · Block · Text | layout primitif; CSS kita + struktur vault |
| Avatar · GroupAvatar | chat kita minimal tanpa avatar |
| Image · Img · ImageSelect · Video | attachment = chip; preview gambar = fitur terpisah, bukan penataan |
| CodeEditor · EditorSlashMenu · Hotkey · HotkeyInput | di luar scope penataan; editor milik Obsidian |
| GuideCard · Toc · HtmlPreview · MaskShadow · NeuralNetworkLoading · FontLoader · Freeze | tak relevan untuk permukaan kita |

## Rekomendasi (untuk rencana "rapikan")

Kerjakan berurutan: **A1 → A2 → A3 → A4** dulu (empat yang mengisi gap nyata),
lalu A5–A8 sebagai polish opsional.

## Status (2026-08-20)

Owner memutuskan: **tab Settings dulu, panel chat belakangan**.

- ✅ **A2 Empty** — selesai (v0.1.152): satu helper `emptyState()` + blok
  `.oa-empty*`, 9 permukaan distandarkan, 6 kelas lama dihapus.
- ✅ **A8 ColorSwatches** — selesai (v0.1.153): swatch profil tadinya rapuh
  (var tanpa fallback + warna hilang saat hover karena `button:hover` Obsidian
  menang). Diperbaiki: selektor dua-kelas (0,2,0) + fallback hex resmi app.css
  + hover/focus-visible.
- ✅ **A4 SortableList** — selesai (v0.1.154–155): drag-reorder native HTML5
  DnD (grip handle, tanpa dependency), panah tetap jadi jalur keyboard/mobile;
  probe F38cmdDrag hijau. Bonus: probe F15 merah prasyarat diperbaiki (dua
  baris "Title generation" menipu findRow). Grip baru membuat baris penuh —
  toggle surface dipindah ke modal edit + ringkasan read-only di baris
  (judul 53px → 430px, terukur F39cmdSurfaces).
- ✅ **A7 Skeleton** — selesai (v0.1.157): baris shimmer menggantikan teks
  "Loading…" di hub + cron focus-skills; reduced-motion aman; probe F41skeleton
  hijau.

**Tab Settings selesai** — semua item kurasi lobe-ui untuk penataan ulang
Settings sudah dikerjakan (A2 Empty, A8 ColorSwatches, A4 SortableList + fix
surface-modal, A7 Skeleton).

**Panel chat** (fase kedua):

- ✅ **A1 EditableText** — selesai (v0.1.158): rename sesi inline di panel
  (pensil → input → Enter/Escape), `SessionStore.rename` recency-preserving;
  bukti di skenario `slash`. Catatan: skenario harness `title` rusak pra-syarat
  (0 model call) — audit harness tersendiri menyusul.
- ✅ **A3 TokenTag** — selesai (v0.1.159): pill token statusbar dapat bar
  context-window + % (hanya saat window diketahui), merah saat overload;
  bar datar (bukan ring antd).
- ✅ **A5 BackBottom** — selesai (v0.1.160): unread dot di ScrollButton
  (konten baru saat scroll ke atas → dot; kembali ke bawah → bersih).
  Catatan: lane convo harness tidak-scrollable pra-syarat, diamend dengan
  filler (fade assertion tak berubah).

**Seluruh kurasi lobe-ui selesai** — Settings (A2/A8/A4/A7 + fix surface-modal
+ tips card) dan panel chat (A1/A3/A5) semua dikerjakan, teruji, dan
terdokumentasi. Yang tersisa adalah temuan lintas-sesi yang diparkir: audit
harness `title` (0 model-call, Lesson 143).

## GWT

```text
Given panel sesi menampilkan judul
When user klik judul
Then judul jadi input; Enter/blur menyimpan (gagal → nama lama kembali)

Given beberapa permukaan kosong (sesi, hub, skills, automations)
When dibuka
Then semua memakai struktur Empty yang sama (judul + deskripsi + aksi)

Given statusbar chat
When sesi memiliki pemakaian token
Then pill menampilkan in/out + sisa terhadap context window (merah saat lampau)
```

## Risks

> [!risk]
> lobe-ui ber-antd — meniru JSX/token antd = melanggar tema Obsidian. Mitigasi:
> port perilaku + kontrak prop, CSS ke `var(--*)` (Lesson 75).

> [!risk]
> Rename sesi menyentuh SessionStore + partition — salah = kehilangan sesi.
> Mitigasi: ikuti pola `persistQueue`/partition-key yang sudah teruji; guard test.

> [!risk]
> Emoji/ikon dekoratif bocor dari contoh lobe. Mitigasi: Icon Lucide + setIcon,
> bukan emoji (SKILL.md).
