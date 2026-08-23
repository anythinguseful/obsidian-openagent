# Laporan Integrasi Paket C — Repo Utama

**Tanggal:** 13 Agustus 2026 (Asia/Jakarta)  
**Repo:** `/home/user/obsidian-openagent`  
**Baseline HEAD:** `02589ab6e38eaf154acdd963bae51c20f8ac6805` (`v0.1.138`)  
**Status:** **Paket C terintegrasi dan seluruh gate final PASS; belum di-commit atau dirilis**

## 1. Ringkasan hasil

Setelah persetujuan pengguna, source delta Paket C dipindahkan ke repo utama dan diverifikasi. Dependency runtime sekarang dipatok ke:

- `pdfjs-dist@4.10.38`
- `diff@8.0.4`

Kandidat mempertahankan version metadata `0.1.138`; belum ada version bump, commit, push, PR, atau release publik.

Hasil final dari repo utama:

| Gate | Hasil |
|---|---|
| Source archive checksum | PASS |
| 14 file source delta | 14/14 terverifikasi |
| `git diff --check` | PASS |
| Fresh `npm ci` | PASS |
| Typecheck | PASS |
| Production build | PASS |
| Seluruh `npm test` | PASS |
| PDF browser matrix — Chrome `149.0.7827.55` | **49/49 PASS** |
| PDF browser matrix — Chrome `114.0.5735.133` | **49/49 PASS** |
| Real chat preview | PASS |
| Settings preview/audit probes | PASS |
| Docs/release consistency | **14/14 PASS** |
| Production dependency audit | **0 vulnerability** |
| Full release dry run | **PASS / ZIP SYNCED** |
| Independent ZIP stream hashes | PASS |

## 2. Security matrix

Kedua browser menghasilkan lifecycle metrics identik:

```json
{"workersCreated":4,"workersTerminated":3,"urlsRevoked":3,"checks":49}
```

Matrix mencakup valid, missing-source, missing-worker, non-abortable hanging read, corrupt worker, repeated use, concurrent callers, output cap, 50-page cap, malformed, truncated, CVE-2024-4367 FontMatrix, oversized, silent worker timeout, recovery, reuse, termination, dan blob URL revocation.

Bukti:

- Chrome 149 + full release: `/home/user/paket-c-main-release-final.log`
- Exact Chrome 114: `/home/user/paket-c-main-pdf-security-chrome114-final.log`

## 3. Dependency audit

Production audit:

```text
info 0 · low 0 · moderate 0 · high 0 · critical 0 · total 0
```

Seluruh tree masih memiliki satu advisory moderate pada direct dev dependency `esbuild@0.20.2`. Advisory hanya menyangkut development-server API esbuild, yang tidak digunakan atau dikirim dalam ZIP. `npm audit` menawarkan update semver-major ke `0.28.2`; update tersebut tetap dipisahkan dari Paket C.

Bukti:

- `/home/user/paket-c-main-audit-prod-final.json`
- `/home/user/paket-c-main-audit-all-final.json`

## 4. Release dry run dari repo utama

Full `npm run release` final selesai dengan exit code 0 dan mencakup typecheck, build, seluruh unit/smoke test, browser PDF gate, previews, settings probes, CSS minification, ZIP, dan byte verification.

- Build stamp: `2026-08-13 01:38Z` (`08:38 WIB`)
- ZIP: `/home/user/openagent-obsidian-plugin.zip`
- Size: `739,742` byte
- SHA-256: `19327faa568b56638b20c787efedfa72598448af97fffb1bec667e93bf7527ed`

Independent stream verification:

| File | Bytes | SHA-256 | ZIP |
|---|---:|---|---|
| `main.js` | 975,160 | `fc3dd36232be2599fd7f155c7cb2c13c4bd85ca26142e5c73c2340f04a6c3a56` | MATCH |
| `manifest.json` | 347 | `623b06e3bfd67afcc36295f2e01c353bf80fed1d20e2c822faa061d1d7ae44d4` | MATCH |
| `vendor/pdf.worker.min.js` | 1,354,326 | `df2e5e34c82ebd1d564392c67479d7bbcb95eb36bf3c671995c0939aca9ad070` | MATCH |

`styles.css` di-minify khusus di ZIP dan lolos sentinel + parser verification pada release pipeline.

ZIP ini masih merupakan artifact dry run bernomor metadata `0.1.138`, bukan patch release baru.

## 5. Integrasi regression yang durable

Browser security regression sekarang dijalankan melalui:

1. `npm run test:pdf-security`;
2. `scripts/release.mjs` sebelum previews dan packaging;
3. GitHub Actions step **Adversarial PDF browser regression**.

Perubahan CI sempat tidak tersedia dalam source archive pertama karena snapshot sesi sebelumnya melampaui budget. Saat transfer, kondisi ini terdeteksi melalui perbandingan hash; job label dan explicit test step kemudian dipulihkan sesuai scope audit, sebelum final release dijalankan.

Source delta final telah dibangun ulang dari source repo utama:

- `/home/user/paket-c-candidate-source-delta.tar.gz`
- SHA-256: `865c3ced494dc1262822bad8fc786ee1a45364a522f6d4cb179fa099ff410575`
- manifest: `/home/user/paket-c-candidate-source-manifest.sha256`
- internal verification: **14/14 PASS**

`main.js` dan `vendor/pdf.worker.min.js` adalah generated build outputs dan tidak dimasukkan ke source-delta archive; artifact ZIP dan hash di atas menyimpannya sebagai evidence build.

## 6. File repo yang berubah

### Modified

- `.github/workflows/ci.yml`
- `main.js` — generated production bundle
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

`vendor/pdf.worker.min.js` diregenerasi saat build tetapi berada di direktori `vendor/` yang di-ignore Git; worker tetap wajib ada dalam artifact plugin dan telah diverifikasi MATCH.

Generated `settings-audit-probes.json` sudah dikembalikan ke baseline. Tidak ada preview snapshot noise pada status final.

## 7. Catatan environment non-source

Percobaan release pertama berhenti sebelum preview karena Playwright preview membutuhkan `chromium-headless-shell`, sementara browser awal ditempatkan pada `tmpfs` yang tidak cukup besar. Source tests dan PDF matrix bukan penyebab kegagalan ini. Browser sementara dipindahkan ke `/var/tmp`, dependency OS dipasang, lalu full release diulang dari awal dan lulus.

Semua browser, npm cache, `node_modules`, dan output test sementara kemudian dihapus.

## 8. Workspace dan Git final

- Persistent workspace: **52 MiB** dari budget 128 MiB
- Persistent files: **441**
- Transient cache/dependency directories: **0**
- Paket C temp directories di `/tmp` dan `/var/tmp`: **0**
- Baseline HEAD masih `02589ab6e38eaf154acdd963bae51c20f8ac6805`
- Tidak ada commit baru
- `git diff --check`: PASS
- Tidak ada generated preview probe noise

Worktree sengaja berisi hanya perubahan Paket C yang belum di-commit.

## 9. Gate berikutnya

Rekomendasi berikutnya adalah menyiapkan patch release baru **`v0.1.139`**, tanpa menimpa `v0.1.138`:

1. bump `package.json`, `manifest.json`, dan `versions.json` secara konsisten;
2. build dan jalankan seluruh gate kembali;
3. buat `openagent-obsidian-plugin-v0.1.139.zip`;
4. verifikasi ZIP dan checksum;
5. buat backup offline baru;
6. siapkan commit untuk workflow GitHub Desktop, tanpa meminta kredensial melalui chat.

Langkah release ini memerlukan persetujuan eksplisit terpisah.
