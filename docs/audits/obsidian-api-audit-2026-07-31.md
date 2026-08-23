---
title: "Audit API Obsidian — app 1.13.4 (2026-07-31)"
type: audit
status: done
date: 2026-07-31
tags: [openagent, obsidian, audit]
---

# Audit API Obsidian — app 1.13.4 (2026-07-31)

Pemicu: owner melaporkan app Obsidian sekarang **1.13.4**; tugas: cek
pembaruan API resmi terhadap plugin.

## Fakta terverifikasi (sumber mentah resmi)

1. **npm registry `obsidian`** (registry.npmjs.org/obsidian): `latest = 1.13.1`
   (published 2026-06-09). Garis rilis typings: 1.11.4 (2026-01-07) → 1.12.3
   (2026-02-23) → 1.13.0 (2026-05-28). Typings memang mengekor di belakang
   versi app (app 1.13.4, typings 1.13.1) — normal.
2. **CHANGELOG resmi `obsidianmd/obsidian-api` berhenti di v1.7.2.** Bukan
   sumber kebenaran untuk 1.8+. Sumber kebenaran praktis: npm registry +
   `obsidian.d.ts` + kompiler.
3. **devDependency `^1.5.7` FLOAT**: package-lock sebelum audit sudah
   me-resolve **1.13.1** — setiap `npm install` segar memasang typings
   terbaru 1.x. Selama ini tsc sudah memvalidasi terhadap 1.13.1, tetapi
   deklarasi `^1.5.7` menipu mata. → Deklarasi dibump ke `^1.13.1`
   (tooling-only; isi zip tak berubah).
4. **Scan `@deprecated` pada obsidian.d.ts 1.13.1**: 13 deklarasi deprecated,
   **TAK SATU PUN** menyentuh 32 simbol yang kita pakai (App, Plugin, ItemView,
   requestUrl, MarkdownRenderer.render — bentuk modern, Notice, Setting +
   komponennya, dll.).
5. **Perubahan ekosistem dari obsidian.md/changelog.xml**: Bases
   `BaseOption#shouldHide` breaking (kita tak pakai Bases), `appendBinary`
   baru (tak dipakai), app 1.11+ memakai Chromium 139 (sisi runtime app),
   SliderComponent sejak 1.5.9 update on release — handler slider kita
   idempoten (tulis setting + save), jadi aman di kedua perilaku.

## Temuan NYATA (bug kompatibilitas) — diperbaiki di v0.1.18

`FileManager#trashFile` (dipakai di `skills.ts` + `main.ts`) **belum ada di
typings 1.5.7** → di app ≤1.5.7 crash `… is not a function` saat hapus skill
atau reset-everything, padahal `minAppVersion: 1.5.0`. Typings 1.5.7 adalah
1.5.x pertama yang dipublish di npm (tak ada 1.5.0–1.5.6), dan 1.6.6 sudah
memuat `trashFile` (jendela masalah: <1.6.x).

**Fix**: shim `src/agent/vaultCompat.ts` → `trashRespectingPrefs(app, file)`
— feature-detect (`typeof trashFile === "function"`, pola resmi
`setInstant`): API baru dipakai bila ada, jika tidak fallback
`vault.trash(file, true)` (tersedia di 1.5.7). minAppVersion tetap 1.5.0 —
kini terbukti jujur.

## Bukti

- `tsc --noEmit` hijau pada typings **1.13.1** DAN **1.5.7** (swap test).
- Guard smoke "v0.1.18 API compat": tak boleh ada `fileManager.trashFile`
  langsung di luar shim.

## Prosedur uji silang (untuk diulang tiap audit API)

```bash
cd /tmp && npm pack obsidian@1.5.7 && mkdir -p o157 && tar xzf obsidian-1.5.7.tgz -C o157
cd ~/openagent
mv node_modules/obsidian node_modules/.obsidian-new && cp -r /tmp/o157/package node_modules/obsidian
npx tsc --noEmit                       # harus hijau = janji minAppVersion jujur
rm -rf node_modules/obsidian && mv node_modules/.obsidian-new node_modules/obsidian
npx tsc --noEmit                       # konfirmasi restore (typings latest)
```

> Catatan: node_modules di-wipe antar sesi — lakukan setelah `npm install`.
