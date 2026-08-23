# Laporan Final Audit Paket C — Dependency / PDF Security

> **Status update:** Paket C telah disetujui pengguna dan terintegrasi ke repo utama pada 13 Agustus 2026. Dokumen ini mempertahankan kondisi audit pra-persetujuan sebagai historical evidence. Status integrasi dan gate terkini ada di `/home/user/obsidian-openagent-paket-c-integration-report-2026-08-13.md`.

**Tanggal lokal:** 13 Agustus 2026 (Asia/Jakarta)  
**Repo utama yang diaudit:** `/home/user/obsidian-openagent`  
**Salinan kandidat saat audit:** `/home/user/paket-c-audit-work` (telah diarsipkan setelah seluruh gate lulus)  
**Source delta terverifikasi:** `/home/user/paket-c-candidate-source-delta.tar.gz`  
**Baseline repo utama:** `02589ab6e38eaf154acdd963bae51c20f8ac6805` (`v0.1.138`)  
**Status keputusan saat audit:** **PASS pada salinan kandidat**; persetujuan kemudian diberikan dan integrasi sudah selesai

---

## 1. Ringkasan eksekutif

Kandidat Paket C memenuhi acceptance criteria utama:

- `pdfjs-dist` dipatok tepat ke **4.10.38** dan `diff` ke **8.0.4**.
- Audit dependency production menghasilkan **0 vulnerability** pada semua severity.
- PDF.js memakai **legacy browser build** dan file worker eksternal yang dibundel sebagai classic IIFE ber-target **ES2020**.
- Parsing wajib memakai `Worker` browser sungguhan melalui `GlobalWorkerOptions.workerPort`; source/worker hilang atau rusak akan **fail closed**, tanpa fake-worker/main-thread fallback.
- Lifecycle worker sekarang mencakup deadline seluruh operasi, serialisasi pemakaian shared raw Worker, cleanup loading task berbatas waktu, termination/reset/retry, blob-URL revocation, dan unload cleanup.
- Matrix browser adversarial lulus **49/49** pada Chromium **149.0.7827.55** dan target lama Chromium **114.0.5735.133**.
- Full typecheck, production build, seluruh `npm test`, real-preview, settings-preview, docs checks, release dry run, dan verifikasi byte ZIP semuanya lulus.
- Repo utama tetap clean dan belum menerima satu pun source Paket C.

**Rekomendasi:** setujui kandidat Paket C untuk dipindahkan secara terkontrol ke repo utama, lalu ulangi semua gate pada repo utama sebelum membuat patch release berikutnya (disarankan `v0.1.139`).

---

## 2. Dependency dan advisory

### Kandidat production

| Dependency | Baseline | Kandidat exact | Hasil |
|---|---:|---:|---|
| `pdfjs-dist` | `^3.11.174` | `4.10.38` | Melewati versi terdampak CVE-2024-4367; browser legacy build dipakai |
| `diff` | `^7.0.0` | `8.0.4` | Melewati jsdiff DoS `<8.0.3` |

Hasil final `npm audit --omit=dev --json`:

```text
info 0 · low 0 · moderate 0 · high 0 · critical 0 · total 0
```

Bukti: `/home/user/paket-c-candidate-audit-prod-final.json`.

### Seluruh dependency tree, termasuk devDependencies

`npm audit --json` masih melaporkan **1 moderate advisory dev-only** pada `esbuild@0.20.2` (`GHSA-67mh-4wv8-2f99`). Advisory tersebut mengenai API development server esbuild. Proyek ini menggunakan esbuild sebagai one-shot bundler dan tidak menjalankan esbuild development server dalam release atau artifact plugin.

Statusnya:

- bukan production dependency yang dikirim dalam ZIP;
- tidak berada pada jalur parsing PDF runtime;
- tidak memengaruhi hasil production audit yang menjadi acceptance Paket C;
- update yang ditawarkan npm adalah perubahan semver-major ke `esbuild@0.28.2`, sehingga sebaiknya diaudit sebagai perubahan build-tool terpisah dan tidak diselipkan ke Paket C tanpa keputusan eksplisit.

Bukti: `/home/user/paket-c-candidate-audit-all-final.json`.

### Optional dependency PDF.js

`pdfjs-dist@4.10.38` mendeklarasikan optional dependency `@napi-rs/canvas`. Dependency ini adalah jalur Node PDF.js:

- PDF.js menilai Electron renderer dan Dedicated Worker sebagai **bukan Node runtime** untuk branch tersebut;
- pengujian Chromium 114 dan 149 membuktikan jalur browser berjalan tanpa native canvas;
- artifact ZIP tidak mengirim `node_modules` atau binary native apa pun;
- ZIP final hanya berisi direktori plugin dengan `main.js`, `manifest.json`, `styles.css`, dan `vendor/pdf.worker.min.js`.

Tree production lengkap disimpan di `/home/user/paket-c-production-tree-final.txt`.

---

## 3. Boundary runtime dan desain worker

### Kompatibilitas target lama

- TypeScript target: `ES2020`.
- Main bundle esbuild target: `es2020`.
- PDF worker bundle target: `es2020`.
- Main import: `pdfjs-dist/legacy/build/pdf.mjs`.
- Worker source: `pdfjs-dist/legacy/build/pdf.worker.min.mjs`, dibundel menjadi classic IIFE.
- Uji target lama: Google Chrome for Testing **114.0.5735.133**, setara baseline Chromium Electron 25.

Deklarasi `engines.node >=20` pada package PDF.js tidak menjadi syarat runtime plugin karena build browser telah dibundel. Environment pengembangan yang dipakai adalah Node 20; CI proyek memakai Node 22.

### Enforcement real Worker

Kandidat melakukan hal berikut:

1. membaca `vendor/pdf.worker.min.js` melalui vault adapter;
2. membuat blob URL;
3. menjalankan `new Worker(blobUrl)`;
4. memasang raw Worker ke `GlobalWorkerOptions.workerPort`;
5. menolak operasi bila source tidak tersedia, worker bytes tidak terbaca, construction gagal, atau raw Worker tidak aktif.

Tidak ada konfigurasi `workerSrc` yang dapat memicu fake-worker fallback. Static smoke dan browser harness mengunci pola ini.

### Lifecycle hardening

- Input PDF maksimum: **20 MiB**.
- Halaman maksimum: **50**.
- Output text dibatasi saat akumulasi, bukan setelah seluruh dokumen selesai.
- `isEvalSupported: false` dipertahankan sebagai defense-in-depth.
- Deadline produksi: **30 detik**, mencakup import, pembacaan worker bytes, load document, page loop, dan text extraction.
- Deadline test hanya boleh memperpendek batas produksi.
- `readBinary` yang tidak abortable dapat ditinggalkan setelah timeout, tetapi cancellation guard mencegah Worker terlambat dibuat dan init state dibuka untuk retry.
- Cleanup `loadingTask.destroy()` dibatasi **2 detik**.
- Timeout/error melakukan clear `workerPort`, terminate raw Worker, revoke blob URL, dan mengizinkan fresh-worker recovery.
- Pemakaian shared raw Worker diserialkan karena wrapper `PDFWorker.fromPort` di-cache per port dan dapat saling menghancurkan bila dokumen berjalan bersamaan.
- Unload halaman menutup shared Worker dan mencabut URL.

---

## 4. Browser security/lifecycle matrix

Kedua runtime berikut lulus **49/49**:

| Runtime | Hasil | Metrics |
|---|---:|---|
| Chromium `149.0.7827.55` | 49/49 PASS | `workersCreated=4`, `workersTerminated=3`, `urlsRevoked=3` |
| Chromium `114.0.5735.133` | 49/49 PASS | `workersCreated=4`, `workersTerminated=3`, `urlsRevoked=3` |

Cakupan yang dibuktikan:

- cap input 20 MiB, cap halaman 50, deadline produksi 30 detik;
- missing source dan missing worker bytes fail closed tanpa membuat Worker;
- worker-byte read yang tidak pernah settle tetap terkena deadline seluruh operasi dan tidak membuat late Worker;
- corrupt worker ditolak dan diterminasi;
- valid PDF mengekstrak marker yang diharapkan;
- repeated extraction stabil dan memakai ulang satu live raw Worker;
- dua caller bersamaan diselesaikan benar melalui queue serial tanpa worker leak;
- output cap diterapkan saat akumulasi;
- dokumen 60 halaman memasukkan halaman 50 dan tidak pernah memasukkan halaman 51;
- malformed dan truncated PDF settle/reject secara bounded;
- fixture `/FontMatrix` bergaya CVE-2024-4367 tidak mengeksekusi marker;
- oversized PDF ditolak sebelum Worker baru dibuat;
- silent worker mencapai timeout eksplisit dan diterminasi;
- operasi berikutnya pulih dengan fresh Worker;
- repeated use pasca-timeout stabil;
- blob URL dicabut pada corruption, unload, dan timeout.

Fixtures statis berada di `test/fixtures/pdf-security/`. Browser runner mendukung `OA_CHROMIUM_EXECUTABLE` untuk menjalankan target Chromium tertentu dan memiliki one-retry self-healing install bila default Playwright Chromium belum tersedia.

---

## 5. Regression, preview, dan release gates

### Gate final

| Gate | Hasil |
|---|---|
| Configured typecheck | PASS |
| Production build | PASS; worker `1,354,326` byte |
| Seluruh `npm test` | PASS |
| Attach unit suite | PASS |
| Static smoke Paket C | PASS |
| PDF security browser — Chromium 149 | 49/49 PASS |
| PDF security browser — Chromium 114 | 49/49 PASS |
| Real chat preview | PASS |
| Settings preview + audit probes | PASS |
| Docs/release-consistency checks | 14/14 PASS |
| Production dependency audit | 0 vulnerability |
| Full release dry run | PASS |
| ZIP byte synchronization | PASS |

Browser regression sekarang terintegrasi di tiga tempat agar tidak terlupa:

1. script `npm run test:pdf-security`;
2. explicit gate dalam `scripts/release.mjs`;
3. step **Adversarial PDF browser regression** dalam GitHub Actions CI.

### Release dry run final

Log final: `/home/user/paket-c-release-dry-run-final.log`.

Tahapan yang tercatat lulus:

```text
typecheck
build
tests
PDF security browser (Chromium 149; 49 checks)
preview
settings preview
zip
byte verification
ZIP SYNCED
```

Build stamp: `2026-08-12 19:04Z` (13 Agustus 2026, 02:04 WIB).  
Dry-run ZIP: `/home/user/openagent-obsidian-plugin.zip`  
Size: `739,742` byte  
SHA-256: `7c5b47d83d666a279dcee7e23f530d749238644f68090e910ef91d155a776943`

Dry-run ZIP ini adalah bukti audit, **bukan patch release baru** dan belum menggantikan artifact stabil `v0.1.138`.

### Byte synchronization

| File | SHA-256 repo kandidat | Status terhadap ZIP |
|---|---|---|
| `main.js` | `680a3a9d27011489699ce86b15d02aa9e5c5ac3442eeadd37b10eec75eb81910` | MATCH |
| `manifest.json` | `623b06e3bfd67afcc36295f2e01c353bf80fed1d20e2c822faa061d1d7ae44d4` | MATCH |
| `vendor/pdf.worker.min.js` | `df2e5e34c82ebd1d564392c67479d7bbcb95eb36bf3c671995c0939aca9ad070` | MATCH |

Worker repo dan ZIP sama-sama `1,354,326` byte. `styles.css` sengaja zip-minified oleh release pipeline dan lulus sentinel + parse verification.

---

## 6. File kandidat yang akan dipindahkan bila disetujui

### Modified

- `.github/workflows/ci.yml`
- `package.json`
- `package-lock.json`
- `scripts/build-vendor.mjs`
- `scripts/release.mjs`
- `src/ui/attach/pdf.ts`
- `test/smoke.test.cjs`

### Added

- `test/pdf-security-browser-entry.ts`
- `test/pdf-security-browser.test.cjs`
- `test/fixtures/pdf-security/valid.pdf`
- `test/fixtures/pdf-security/sixty-pages.pdf`
- `test/fixtures/pdf-security/truncated.pdf`
- `test/fixtures/pdf-security/malformed.pdf`
- `test/fixtures/pdf-security/cve-2024-4367-fontmatrix.pdf`

Generated preview snapshots dari dry run telah dikembalikan ke baseline agar tidak ikut sebagai noise source Paket C.

Setelah audit selesai, 14 file di atas disimpan byte-for-byte dalam:

- arsip: `/home/user/paket-c-candidate-source-delta.tar.gz`;
- SHA-256 arsip final setelah pemulihan CI: `865c3ced494dc1262822bad8fc786ee1a45364a522f6d4cb179fa099ff410575`;
- manifest file: `/home/user/paket-c-candidate-source-manifest.sha256`;
- hasil verifikasi internal: **14/14 file cocok**.

Salinan penuh kandidat yang menduplikasi repo telah dihapus untuk menjaga workspace di bawah budget. Kandidat dapat dipulihkan deterministik dari repo utama bersih + source delta ini.

---

## 7. Risiko residual

| Risiko | Tingkat | Penanganan / alasan non-blocking |
|---|---|---|
| Satu advisory moderate pada dev-only `esbuild@0.20.2` | Rendah | Hanya development-server API; tidak dipakai release dan tidak dikirim. Audit update major secara terpisah. |
| Promise `readBinary` yang benar-benar tidak pernah settle tidak dapat dibatalkan oleh API vault | Rendah | Caller tetap timeout; state retry dibuka; cancellation guard mencegah late Worker. Sisa Promise kecil berakhir saat page/plugin unload. |
| Parser kompleks tetap mungkin memiliki bug baru yang belum diketahui | Residual inheren | Version patched, `isEvalSupported:false`, worker isolation, caps, timeout, termination, dan fail-closed behavior mengurangi blast radius. |
| Fixture CVE memakai marker non-destruktif, bukan payload berbahaya penuh | Rendah | Struktur `/FontMatrix` bergaya PoC tetap melewati jalur relevan tanpa membawa efek destruktif ke workspace. |
| Belum dilakukan instalasi manual ke aplikasi Obsidian Electron 25 asli | Rendah | Runtime Chromium 114 exact lulus, ES2020 lulus, dan real-preview lulus; instalasi manual tetap baik sebagai post-release validation. |
| Serialisasi dapat membuat PDF kedua menunggu PDF pertama | Diterima | Trade-off sengaja untuk menghindari wrapper/port lifecycle collision; setiap operasi sendiri tetap bounded. |

Tidak ada risiko residual yang dinilai blocker untuk memindahkan kandidat ke repo utama.

---

## 8. Integritas repo utama

Pada akhir audit:

```text
/home/user/obsidian-openagent
HEAD 02589ab6e38eaf154acdd963bae51c20f8ac6805
git status --short: kosong
```

Repo utama belum menerima source, lockfile, test, generated bundle, atau version bump Paket C.

Workspace telah dibersihkan dari browser cache sementara, log yang superseded, salinan kandidat penuh, serta dua backup ZIP lama yang redundan. Pemakaian persisten turun menjadi **51 MiB**, di bawah budget 128 MiB. Backup offline stabil `v0.1.138`, ZIP tracked di repo, repo utama, laporan/evidence final, ZIP bukti audit, dan source delta Paket C dipertahankan.

---

## 9. Approval gate

### Rekomendasi

**Setujui Paket C (rekomendasi).**

Setelah persetujuan, langkah berikutnya adalah:

1. pindahkan hanya file kandidat yang terdaftar ke repo utama;
2. inspeksi diff dan pastikan tidak ada generated-preview noise;
3. jalankan production audit, typecheck, build, full tests, browser 149 dan 114, real-preview, docs checks, dan release dry run ulang dari repo utama;
4. rangkum diff final;
5. baru kemudian siapkan patch release berikutnya (disarankan `v0.1.139`) dan backup offline—tanpa menimpa `v0.1.138`.

Alternatif aman adalah **tunda Paket C**; repo utama akan tetap di `v0.1.138` tanpa perubahan.
