---
title: "Open Agent — Release handoff v0.1.158"
type: process
status: active
date: 2026-08-31
tags: [openagent, process, release]
---
# Serah terima publikasi — v0.1.158 (2026-08-31)

Untuk owner. Semua yang perlu dilakukan **dari GitHub UI**, tanpa sesi agent.
Direkam juga sebagai penutup keputusan audit 2026-08-30 (butuh keputusan owner).

## Keadaan saat dokumen ini ditulis

- Branch `arena/01a04ef0-obsidian-openagent` memuat 8 commit di atas `main`
  (v0.1.156 → v0.1.158 + docs). **`main` belum disentuh** — sesuai aturan sesi.
- `manifest.json` = **0.1.158**; entri `RELEASES.md` lengkap sampai 0.1.158.
- v0.1.156 dan v0.1.157 **tidak diterbitkan terpisah**: isinya kumulatif, semua
  ikut terkirim di v0.1.158. Keduanya (plus v0.1.154) dianotasi sebagai
  *intermediate* di `RELEASES.md` — hanya **v0.1.158** yang diterbitkan.
- Aset zip lokal di `release/` TIDAK diperlukan untuk jalur ini — workflow
  membangun ulang seluruh aset di CI-nya sendiri.

## Langkah publikasi (GitHub UI)

1. **Buka PR**: dari branch `arena/01a04ef0-obsidian-openagent` → base `main`.
   Judul saran: `v0.1.156–v0.1.158: settings placement & field-stack fixes`.
2. **Tunggu CI hijau** pada PR: check `typecheck · build · test · PDF security ·
   docs` (±4 menit). Ini satu-satunya gerbang; tidak ada langkah manual lain.
3. **Merge PR** (merge commit, seperti PR #1–#7 sebelumnya).
4. **Actions → "Publish GitHub Release" → Run workflow** di branch `main`:
   - input `reconstructed`: **false** (ini rilis biasa, bukan rekonstruksi).
   - Workflow akan: `npm ci` → pasang chromium headless → `npm run release`
     (membangun + memverifikasi seluruh set aset, probe real-DOM wajib hijau)
     → dry run publisher → `gh release create v0.1.158 --draft` → unggah aset →
     verifikasi ulang (unduh + sha256) → terbitkan.

Selesai: rilis **Open Agent v0.1.158** tampil publik dengan ZIP instalasi +
sha256 + clean-source + manifest + final report — persis pola v0.1.151–155.

## Catatan penanganan gangguan

- **Workflow gagal di tengah** (mis. network): draft release bisa tertinggal.
  Hapus draft itu (Releases → draft → Delete), perbaiki sebabnya, jalankan ulang
  workflow. Publisher menolak menimpa rilis yang sudah ada ("refusing to
  rewrite"), jadi draft basi memang harus dihapus dulu.
- **Egress sandbox Arena bisa memblokir `uploads.github.com`** (terjadi
  2026-08-31: TLS gagal HTTP 000, sementara `api.github.com` normal). Gejala:
  `publish:release --publish` membuat draft lalu gagal upload (EOF, retry 4×)
  dan **menghapus draft-nya sendiri** — tidak ada rilis parsial; aman di-retry
  kapan pun. Bila uploads masih terblokir di percobaan berikutnya, jalurnya:
  (a) retry dari sesi/sandbox baru (egress bisa berubah), (b) merge PR lalu
  pakai workflow (upload berjalan dari runner GitHub, tak terpengaruh), atau
  (c) upload manual: buat draft `v0.1.158` → target commit head PR, drag-drop
  keenam file dari `release/` (sha256 tercantum di final report), publish.
- **CI merah di PR**: jangan merge; lihat log check-nya. Semua gate lokal sudah
  hijau saat commit-commit ini dibuat (tsc, 1.900+ test, docs+skills, rilis
  lokal ZIP SYNCED), jadi merah biasanya berarti flake atau perbedaan lingkungan.
- **Alternatif tanpa workflow** (opsional, butuh sesi agent + GitHub auth):
  checkout `main` pasca-merge → `npm ci` → bootstrap Chromium per
  `agents/arena/README.md` → `npm run release` → `npm run publish:release --
  --publish --confirm v0.1.158`. Hasil akhirnya identik.

## Tertutup oleh langkah ini

- Temuan audit #1 (commit yatim `c0d5e5b`): sudah diangkat ke branch ini via
  cherry-pick (`004b688`) — inventaris 25 tools/10 toolset + pin `check-docs`.
- Temuan audit #2 (v0.1.154 tanpa artefak): dianotasi *accepted intermediate*.
- Temuan audit #3 (baris arsip basi): semua baris `Release archive` di
  `RELEASES.md` kini mencerminkan status terbit/intermediate yang sebenarnya.
