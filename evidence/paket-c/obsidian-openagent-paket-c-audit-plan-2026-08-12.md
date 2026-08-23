# Audit dan Rencana Paket C — Dependency/PDF Security

**Proyek:** Obsidian Open Agent  
**Tanggal:** 12 Agustus 2026  
**Status:** audit berjalan; belum disetujui untuk implementasi  
**Baseline:** v0.1.138, branch `arena/tool-hardening`, commit `02589ab6e38eaf154acdd963bae51c20f8ac6805`

## Aturan perubahan

1. Audit, eksperimen, dan rangkuman harus selesai sebelum source repository utama diubah.
2. Semua kandidat diuji pada salinan terisolasi.
3. Implementasi hanya dilakukan setelah pemilik menyetujui rekomendasi final Paket C.
4. Patch Paket C tidak boleh sekaligus mengambil backlog lain tanpa persetujuan.

Repo utama masih bersih pada commit baseline. Salinan eksperimen saat ini berada di `/home/user/paket-c-audit-work`.

## Tujuan

- Menghapus advisory produksi yang berasal dari `pdfjs-dist@3.11.174` dan `diff@7.0.0`.
- Memastikan parsing PDF lokal tetap memakai worker browser sungguhan, bukan fake worker/main thread.
- Menjaga kompatibilitas minimum Obsidian 1.5.x yang dapat berjalan pada Electron 25/Chromium 114.
- Menjaga worker eksternal dalam ZIP selalu sinkron dengan `main.js`.
- Menambah batas dan regression coverage untuk PDF tidak tepercaya.

## Di dalam scope

### A. PDF.js

- Upgrade terkontrol dari `pdfjs-dist@3.11.174`.
- Audit import ESM/CJS dan lazy-loading.
- Audit build `legacy` terhadap target ES2020 dan runtime Chromium lama.
- Audit worker eksternal, Blob URL, worker port, dan release synchronization.
- Audit optional native dependency tree (`canvas` lama versus `@napi-rs/canvas`).
- Uji valid, malformed, truncated, dan malicious PDF.
- Uji page cap, byte cap, kegagalan worker, penghentian proses, dan cleanup.

### B. jsdiff

- Upgrade dari `diff@7.0.0` ke patch aman.
- Verifikasi API yang benar-benar dipakai plugin: `diffLines` dan `diffWordsWithSpace`.
- Jalankan seluruh unit/smoke test untuk mencegah perubahan format diff.

### C. Packaging

- Verifikasi typecheck, production build, full unit/smoke suite, dan browser real-preview.
- Verifikasi ZIP berisi `main.js`, `manifest.json`, minified `styles.css`, dan `vendor/pdf.worker.min.js`.
- Verifikasi byte worker di ZIP identik dengan worker hasil build.
- Catat perubahan ukuran artifact dan dependency tree.

## Di luar scope

- Strict-null cleanup yang masih memiliki 12 diagnostic.
- Menjadikan browser real-preview sebagai gate CI permanen.
- Uji instal/update pada aplikasi Obsidian nyata.
- Push, Pull Request, dan GitHub Release.
- Strict transport di luar batas public `requestUrl`.
- Perubahan fitur atau UI yang tidak diperlukan oleh dependency/PDF security.

## Baseline risiko

- Dependency langsung: `pdfjs-dist@3.11.174`, `diff@7.0.0`.
- Audit install tree baseline: enam advisory produksi.
- PDF.js baseline termasuk rentang terdampak CVE-2024-4367; `isEvalSupported:false` sudah menjadi mitigasi, tetapi bukan pengganti upgrade.
- Dependency optional PDF.js lama membawa `canvas → @mapbox/node-pre-gyp → tar`.
- jsdiff 7 termasuk rentang advisory DoS pada API patch parsing; plugin tidak memakai API terdampak, tetapi dependency tetap harus dipatch.
- Input PDF dibatasi 20 MiB, maksimum 50 halaman, dan output teks dibatasi caller; belum ada deadline parsing eksplisit.

## Kandidat yang sedang diaudit

- `pdfjs-dist@4.10.38` melalui `pdfjs-dist/legacy/build/pdf.mjs`.
- Worker `legacy/build/pdf.worker.min.mjs` dibundel sebagai classic self-starting IIFE.
- `diff@8.0.4`.

Alasan tidak langsung memakai PDF.js 5.5+/6.x: PDF.js 5.5 menaikkan baseline Chrome ke 118, sedangkan minimum Obsidian yang didukung masih dapat memakai Chromium 114. Versi 4.10 legacy lebih konservatif.

## Temuan sementara

1. Kandidat menghasilkan **0 advisory produksi** melalui `npm audit --omit=dev`.
2. Jalur optional lama `canvas → node-pre-gyp → tar` hilang; PDF.js 4.10 memakai `@napi-rs/canvas@0.1.100` sebagai optional dependency.
3. `diff@8.0.4` mempertahankan API yang digunakan plugin dan full suite sebelumnya lulus.
4. Root/default PDF.js build tidak dipilih untuk kompatibilitas runtime; kandidat wajib memakai build `legacy`.
5. Percobaan awal menggunakan `GlobalWorkerOptions.workerSrc` gagal pada browser nyata: PDF.js v4 memaksa `{type:"module"}`, sementara artifact plugin adalah classic IIFE. Fake-worker fallback kemudian gagal.
6. Solusi kandidat adalah membuat classic `Worker` dari byte vault dan memberikannya melalui `GlobalWorkerOptions.workerPort`. Real-browser PDF extraction kemudian lulus dengan worker sungguhan.
7. Ukuran kandidat terakhir yang sudah terukur: `main.js` 973.147 byte dan worker 1.354.326 byte.
8. Uji Windows menemukan 20 false failure akibat checkout CRLF. Ini bukan regresi runtime, tetapi portability gap. Perbaikan durable yang diusulkan: tetapkan `eol=lf` di `.gitattributes` atau normalisasi line endings pada source-string tests.

## Regression matrix

| Lane | Acceptance |
|---|---|
| Valid PDF | Teks diekstrak melalui worker nyata di browser |
| Truncated PDF | Selesai dengan error terkontrol; tidak hang atau fake-worker diam-diam |
| Malformed PDF | Error terkontrol, cleanup jalan, UI tetap responsif |
| CVE-style FontMatrix PDF | Tidak ada JavaScript marker/side effect; `isEvalSupported:false` tetap dipertahankan |
| Page cap | Maksimum 50 halaman diproses |
| Byte cap | Output dipotong sesuai batas caller |
| Worker missing/corrupt | Gagal jujur dengan notice; tidak parse di main thread |
| Timeout | Loading task dan worker dihentikan setelah deadline |
| Repeated PDFs | Tidak membuat worker tak terbatas dan tidak memakai worker yang telah terminated |
| jsdiff | `diffLines` dan `diffWordsWithSpace` tetap menghasilkan row yang diharapkan |
| ZIP | Worker ada, ukurannya wajar, dan byte-nya sinkron dengan hasil build |
| Windows checkout | Test tidak gagal hanya karena CRLF |

## Acceptance criteria implementasi

- `npm audit --omit=dev`: 0 advisory.
- Configured typecheck: lulus.
- Full test suite: lulus.
- Production build: lulus.
- Real-preview browser, termasuk valid PDF melalui worker nyata: lulus.
- Malformed/truncated/malicious PDF regression: lulus dan bounded.
- Tidak ada fake-worker fallback tersembunyi.
- Worker failure menghasilkan error terkontrol.
- Release pipeline dan ZIP synchronization: lulus.
- Repo utama hanya memuat perubahan yang telah dirangkum dan disetujui.

## Perubahan source yang diperkirakan

- `package.json`
- `package-lock.json`
- `src/ui/attach/pdf.ts`
- `scripts/build-vendor.mjs`
- `test/attach.test.cjs`
- `test/real-preview/build.mjs` dan/atau fixture PDF khusus
- `.gitattributes` atau helper normalisasi test untuk portability Windows
- Dokumentasi audit final Paket C

`esbuild.config.mjs` dan `scripts/release.mjs` hanya berubah jika audit menemukan gate yang belum memadai.

## Risiko residual

- Batas file 20 MiB tidak membatasi ukuran stream terdekompresi atau kompleksitas parser secara sempurna.
- Deadline JavaScript bersifat best effort; penghentian worker diperlukan agar CPU benar-benar berhenti.
- `@napi-rs/canvas` optional hanya relevan pada jalur Node; runtime plugin harus tetap memakai browser worker.
- Kompatibilitas akhir tetap memerlukan uji pada Obsidian/Electron nyata, yang berada di luar Paket C ini.
- Satu advisory development-tree dapat tetap berasal dari build tooling lama dan harus dipisahkan dari runtime ZIP.

## Gate persetujuan

Setelah seluruh lane audit selesai, laporan final harus menyajikan:

1. hasil test dan release dry run;
2. dependency/runtime boundary;
3. file yang benar-benar akan berubah;
4. rekomendasi final dan alternatif;
5. risiko residual.

Source repo utama baru boleh diubah setelah pemilik memilih **Setujui Paket C** atau varian scope yang disepakati.
