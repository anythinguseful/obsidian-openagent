---
title: "Rencana: tab Appearance (paritas Hermes Desktop)"
type: plan
status: done
date: 2026-08-20
tags: [openagent, appearance, settings, plan]
---

# Rencana: tab Appearance (paritas Hermes Desktop)

## Summary

Tab Appearance selama ini **disembunyikan-while-empty** (Lesson 107), dengan
kesimpulan "di Hermes seksi appearance kosong (`keys: []`)". Kesimpulan itu
ternyata kurang lengkap: `keys: []` hanya daftar field yang digerakkan
config-schema — Hermes Desktop punya halaman Appearance buatan tangan
(`appearance-settings.tsx`) yang berisi banyak kontrol.

Tab ini diisi dengan kontrol yang **kita miliki sendiri** (chat surface), bukan
tema Obsidian.

## Contract

Lima setting baru di Settings → Appearance:

- **Tool calls** — expanded / collapsed / hidden (hidden tetap menyimpan kartu
  Sources + changed-files).
- **Reasoning** — "Collapse by default" (header "Thought" tetap ada; body baru
  terbuka saat diklik).
- **Session list density** — comfortable / compact (jarak baris panel chat).
- **Intro screen** — tampilkan / sembunyikan layar pembuka saat chat kosong.
- **Reaction buttons** — tampilkan / sembunyikan tombol helpful/not-helpful.

Default = perilaku lama (collapsed · tidak collapse · comfortable · intro ya ·
reaction ya) sehingga user existing tak melihat perubahan.

## Decisions

- D1: HANYA kontrol milik chat surface yang di-port. Theme/zoom/translucency/
  backdrop = chrome host shell (di kasus kita tema Obsidian) — **tidak**
  di-port, sesuai kontrak `var(--*)`. `(review)`
- D2: `toolViewMode` default "collapsed" (perilaku sekarang), bukan "expanded".
  `[assumed]` — jangan mengubah apa yang user existing lihat.
- D3: default-ON pakai `!== false`, default-OFF pakai `=== true` (Lesson 128).
  `(review)`

## Impact

- `src/settings.ts` — 5 field + defaults + normalisasi.
- `src/settingsTab.ts` — SectionKey + SECTIONS + SECTION_DESC + `appearance()`.
- `src/ui/ChatApp.tsx` — gate tool/reasoning/intro/reactions/density.
- `src/ui/components/reasoning.tsx` — prop `defaultOpen`.
- `styles.css` — `.oa-panel.is-compact`.
- `test/settings.test.cjs`, `test/smoke.test.cjs` (guard v0.1.150 + amend 3
  pin lama), `test/real-preview/build-settings.mjs` (F33 + SECTIONS).
- TIDAK berubah: tema Obsidian, `var(--*)`, komponen tool/reasoning/feedback.

## GWT

```text
Given Settings → Appearance → Tool calls = Hidden
When chat menjalankan tool
Then kartu tool tidak dirender, tapi Sources/changed-files tetap muncul

Given Reasoning "Collapse by default" ON
When model berpikir
Then header Thought tampil, body tertutup sampai diklik

Given Session list density = Compact
When panel chat dibuka
Then baris sesi lebih rapat (padding setengah)

Given Intro screen OFF
When chat kosong dibuka
Then layar pembuka tidak tampil
```

## Risks

> [!risk]
> Pin lama mem-pin ABSENSI appearance (`!includes('key: "appearance"')` ×2,
> F33, markModified ×45→47). Mitigasi: semua diamend di tempat, bukan dimatikan.

> [!risk]
> Komentar narasi memuat kata yang di-pin ABSEN (translucency) → guard makan
> komentarnya sendiri. Mitigasi: tulis ulang tanpa kata itu (Lesson 121c).
