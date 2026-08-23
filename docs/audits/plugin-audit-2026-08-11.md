---
title: "Plugin technical audit (2026-08-11)"
type: audit
status: done
date: 2026-08-11
tags: [openagent, audit, security, historical]
---

> Historical audit record. Its supporting raw evidence is kept in [`../../evidence/audits/obsidian-openagent-audit-2026-08-11.md`](../../evidence/audits/obsidian-openagent-audit-2026-08-11.md). This note preserves the readable audit narrative; logs, matrices, checksums, and other execution artifacts remain in `evidence/`.

# Audit Teknis Obsidian Open Agent

**Tanggal:** 11 Agustus 2026 (Asia/Jakarta)  
**Repositori:** `https://github.com/anythinguseful/obsidian-openagent`  
**Checkout yang diaudit:** branch `main`, commit `ed1ccac063d706f1cdeff745629621a29955dc03`  
**Versi plugin:** `0.1.135` · minimum Obsidian `1.5.0`  
**Status working tree setelah audit:** bersih; tidak ada source code yang diubah

---

## 1. Ringkasan eksekutif

Proyek ini sudah jauh melewati tahap prototipe. Inti produk—chat agent di dalam Obsidian, provider OpenAI-compatible, 21 tools dalam 9 toolset, attachment/PDF, memory, skills, Hub, cron, delegation, MoA, Quick Ask, session persistence, context management, dan diff preview—sudah terimplementasi. Baseline lokal dan CI publik saat ini sehat.

Namun, **saya belum merekomendasikan menambah fitur besar sebelum satu putaran hardening**. Ada tiga prioritas utama:

1. **Approval/capability policy belum mewakili efek nyata tool.** Dalam mode default `cautious`, hanya tool dengan flag statis `dangerous` yang meminta izin. `create_skill`, `manage_skill`, dan `cronjob` dapat menciptakan persistensi, mengubah/menghapus skill, atau membuat/menjalankan automation tanpa approval. Child/delegated agent juga masih dapat membuat atau mengubah skill, walau komentarnya menyatakan child tidak menyentuh shared state.
2. **Fetcher yang dapat dipanggil model belum memiliki network boundary yang cukup.** `web_extract` meneruskan URL model langsung ke Obsidian `requestUrl`; tidak ada pembatasan scheme, private/loopback host, redirect, timeout, atau ukuran respons sebelum seluruh body dimuat. `vision_analyze` membatasi bentuk URL ke HTTP(S), tetapi masih belum mempunyai private-network/redirect/timeout policy. Ini adalah gap SSRF/local-resource dan prompt-injection hardening; exploit dinamis belum diuji di runtime Obsidian.
3. **Kontrak packaging PDF tidak dijaga end-to-end.** PDF wajib memakai `vendor/pdf.worker.min.js` dan sengaja tidak punya fallback. ZIP saat ini benar-benar memuat worker itu, tetapi README drop-in hanya menyuruh pengguna menyalin tiga file lain, dan `check:docs` juga tidak mewajibkan worker. Instalasi manual sesuai README dapat membuat attachment PDF gagal.

Selain itu, `npm audit` menemukan 7 advisory, termasuk `pdfjs-dist` runtime langsung; CI belum menjalankan real-browser preview; release pipeline belum tunggal/konsisten; dua file UI masing-masing sekitar 4K LOC; dan `strictNullChecks` masih dinonaktifkan.

### Putusan singkat

- **Kesehatan build/test:** hijau.
- **Kelengkapan produk:** kuat untuk versi awal; MCP masih config-only.
- **Kelayakan rilis artifact saat ini:** ZIP `0.1.135` yang ada valid dan sinkron, termasuk PDF worker.
- **Risiko utama:** capability/approval, untrusted network content, dependency PDF, dan kontrak packaging.
- **Langkah berikut yang disarankan:** hardening + regression tests dahulu, baru refactor dan fitur baru.

---

## 2. Ruang lingkup dan metode

Audit dilakukan tanpa perubahan kode, meliputi:

- inventaris source, test, docs, workflow, dan artifact rilis;
- pembacaan jalur agent loop, registry tools, runner interaktif/headless/delegation, provider transport, attachment PDF, Hub/skills, settings, dan system prompt;
- build dan pemeriksaan TypeScript;
- seluruh suite test yang terdaftar di `npm test`;
- pemeriksaan docs/release consistency;
- audit dependency penuh dan production-only;
- pemeriksaan ZIP terhadap artifact committed;
- pemeriksaan statis secret, path handling, request jaringan, dynamic code, dan approval boundaries;
- verifikasi status GitHub Actions terbaru.

Ini **bukan pentest dinamis penuh** di desktop/mobile Obsidian. Khusus risiko SSRF/local-resource, audit membuktikan tidak adanya policy di source, tetapi tidak mencoba mengakses layanan lokal nyata melalui `requestUrl`.

---

## 3. Snapshot proyek

| Item | Hasil |
|---|---|
| Branch / commit | `main` / `ed1ccac063d706f1cdeff745629621a29955dc03` |
| Versi | `0.1.135` |
| Minimum Obsidian | `1.5.0` |
| Source TypeScript | 55 file, sekitar 16.244 LOC |
| Test tree | 39 file; `npm test` menjalankan 19 command suite |
| Dokumentasi | 29 file saat inventaris |
| Registry agent | 21 tools / 9 toolsets |
| Toolsets default | `vault`, `web`, `memory`, `skills`, `automations`, `clarify`, `todo`, `vision`, `delegation` |
| Git tags | tidak ada |
| Working tree akhir | bersih |

### 21 tools yang aktif di registry

`read_note`, `write_note`, `edit_note`, `delete_note`, `rename_move_note`, `list_files`, `search_vault`, `get_active_note`, `web_extract`, `save_memory`, `update_user_profile`, `search_memory`, `create_skill`, `list_skills`, `view_skill`, `manage_skill`, `cronjob`, `delegate_task`, `vision_analyze`, `todo`, dan `clarify`.

---

## 4. Arsitektur

### 4.1 Gambaran aliran utama

```text
Obsidian plugin entry / commands / views
                │
                ▼
       Chat UI + Quick Ask UI
                │
                ▼
             Runner
   ┌────────────┼────────────┐
   │            │            │
interactive  headless cron  delegated children
   │            │            │
   └────────────┴────────────┘
                │
                ▼
           AgentLoop
 model request → tool call → approval → execution → tool result → next turn
                │
       ┌────────┴────────┐
       ▼                 ▼
 Provider transport   Tool registry/context
       │                 │
 configured LLM      vault, web, memory,
 endpoints           skills, cron, vision, etc.
```

### 4.2 Lapisan penting

| Lapisan | File utama | Peran |
|---|---|---|
| Plugin lifecycle | `src/main.ts` | Inisialisasi stores, runner, views, commands, settings, cron |
| Agent orchestration | `src/agent/runner.ts` | Menyusun prompt/context serta membuat loop interaktif, child, dan headless |
| Agent execution | `src/agent/agentLoop.ts` | Streaming/fallback loop, tool-call execution, approval, abort/steer |
| Capabilities | `src/agent/tools.ts` | Registry 21 tools dan pemetaan 9 toolsets |
| Prompt assembly | `src/agent/systemPrompt.ts` | Identity, tool guidance, skills, memory, context file, feedback |
| Provider I/O | `src/agent/providers.ts` | Streaming dan fallback buffered, headers/key, timeout, catalog |
| Durable agent state | `memory.ts`, `skills.ts`, `sessions.ts`, `cron.ts` | Memory/profile, skills, sessions, automation |
| Skill distribution | `src/agent/hub.ts` | Install GitHub/direct URL, scan, lock, update |
| Main chat UI | `src/ui/ChatApp.tsx` | Chat, queue, attachments, previews, model/session controls |
| Settings UI | `src/settingsTab.ts` | Provider/profile/capability/safety/data settings |
| PDF attachment | `src/ui/attach/pdf.ts` | Lazy PDF.js extraction dan external worker |
| Build/release | `esbuild.config.mjs`, `scripts/release.mjs`, `scripts/check-docs.mjs` | Bundle, vendor worker, preview, ZIP, metadata checks |

### 4.3 Penyimpanan dan trust boundaries

- Settings/provider configuration disimpan melalui data plugin Obsidian.
- Memory dan user profile menjadi input prompt pada sesi berikutnya.
- Skills lokal dimuat ke system prompt bila aktif.
- Sessions dan hasil automation disimpan lokal di vault/plugin storage.
- Isi note, web, PDF, image, skill, memory, dan hasil tool akhirnya dapat masuk ke konteks model. Karena itu semuanya merupakan **data dengan trust berbeda**, bukan sekadar teks biasa.
- Layanan eksternal utama adalah provider LLM yang dikonfigurasi pengguna dan URL yang dipanggil tool web/vision.

### 4.4 Penilaian arsitektur

Kekuatan utamanya adalah pemisahan domain agent yang cukup jelas: loop, runner, provider, tools, memory, skills, cron, dan context manager tidak seluruhnya menumpuk di entry point. Kekurangannya berada di sisi UI: `ChatApp.tsx` sekitar 4.041 LOC dan `settingsTab.ts` sekitar 4.021 LOC, sehingga hampir setengah source TypeScript terpusat pada dua file. Ini memperbesar blast radius perubahan UI dan menyulitkan unit testing yang lebih granular.

---

## 5. Status fitur

| Area | Status | Catatan audit |
|---|---|---|
| Chat streaming dan fallback provider | **Tersedia** | Jalur streaming + buffered fallback, timeout provider, usage/failover events |
| Provider/model configuration | **Tersedia** | Provider OpenAI-compatible dan catalog built-in/custom |
| Profiles/personality | **Tersedia** | Profile dan overlay terintegrasi dengan prompt/runner |
| Tool calling | **Tersedia** | 21 tools / 9 toolsets; approval policy perlu hardening |
| Vault read/search/write/edit/delete/move | **Tersedia** | Mutasi vault utama sudah ditandai `dangerous` |
| Attachment image/PDF/text | **Tersedia** | PDF dibatasi 20 MiB/50 halaman, `isEvalSupported: false`, external worker wajib |
| Quick Ask | **Tersedia** | Jalur editor assistant terpisah |
| Sessions | **Tersedia** | Persistensi dan pencarian UI ada |
| Memory/user profile | **Tersedia** | Persisten dan masuk prompt; perlu threat model untuk untrusted-source persistence |
| Skills lokal | **Tersedia** | Create/list/view/manage dan supporting files |
| Skills Hub | **Tersedia** | Install/update/lock dan security scan tersedia |
| Cron automations | **Tersedia** | Lifecycle create/list/update/pause/resume/run/remove; approval gap |
| Delegation | **Tersedia** | Child contexts bounded dan concurrency dibatasi; shared-state capability gap |
| Mixture of Agents | **Tersedia** | Punya suite khusus |
| Todo/context compression/steer/clarify | **Tersedia** | Terintegrasi ke loop |
| Vision | **Tersedia** | Native vision atau auxiliary model |
| MCP | **Konfigurasi saja** | UI/schema/import ada; runtime client belum tersedia dan UI mengakuinya |
| Vector/semantic retrieval | **Belum** | Masih roadmap/deferred |
| Generic web search | **Belum sebagai tool khusus** | Yang ada direct page extraction (`web_extract`) |
| Terminal/process/browser automation | **Belum** | Tidak termasuk scope runtime sekarang |

Dokumen `docs/studies/hermes-tools-gap-2026-08-09.md` sudah drift: masih menyebut registry 16 tools, sedangkan source aktual memiliki 21 tools dan 9 toolsets.

---

## 6. Baseline kualitas dan bukti rilis

### 6.1 Hasil lokal

| Gate | Hasil |
|---|---|
| `npm ci` | Lulus; 95 package dipasang |
| `npm run typecheck` | Lulus |
| `npm run build` | Lulus |
| `npm test` | Lulus; 19 command suite |
| `npm run check:docs` | Lulus; 13/13 checks |
| Production bundle | Lulus |
| Git working tree setelah cleanup | Bersih |

### 6.2 Catatan TypeScript strict

Project config menetapkan `noImplicitAny: true`, tetapi **`strictNullChecks: false`**. Menjalankan `--strict` saja tidak cukup untuk membuktikan strict-null karena nilai eksplisit di `tsconfig.json` tetap menang. Ketika dipaksa dengan:

```bash
npx tsc --noEmit --skipLibCheck --strict --strictNullChecks true
```

hasilnya **gagal dengan 12 diagnostic**:

- 9 property initialization pada `src/main.ts`;
- 1 narrowing menjadi `never` dan 1 mismatch `string | undefined` pada `src/settingsTab.ts`;
- 1 possible-null pada `src/ui/ChatApp.tsx`.

Jadi baseline resmi hijau, tetapi proyek belum full strict-null. Jumlah error relatif kecil dan cocok dijadikan quick win sebelum refactor besar.

### 6.3 CI publik

GitHub Actions terbaru yang diperiksa berhasil:

- Run: `31449650908`
- URL: `https://github.com/anythinguseful/obsidian-openagent/actions/runs/31449650908`
- Gate CI: Node 22 → `npm ci` → typecheck → build → test → docs check.

### 6.4 ZIP rilis saat ini

`openagent-obsidian-plugin-v0.1.135.zip`:

- ukuran: **591.058 byte**;
- SHA-256: `7906b272a34be71a66ef84e15d9b04a2aad02b383b087d34542ff76916486d6e`;
- empat payload file:
  - `openagent/main.js` — 879.680 byte;
  - `openagent/manifest.json` — 347 byte;
  - `openagent/styles.css` — 111.265 byte, sengaja minified khusus ZIP;
  - `openagent/vendor/pdf.worker.min.js` — 1.073.729 byte.

`main.js` dan `manifest.json` dalam ZIP byte-identical dengan artifact committed. Worker ada. Perbedaan `styles.css` sesuai desain release-minification.

---

## 7. Temuan terprioritas

| ID | Prioritas | Area | Ringkasan |
|---|---:|---|---|
| OA-SEC-01 | **P1 / High** | Approval & capability | Efek tool tidak sesuai flag `dangerous`; skill/cron persistence dapat lolos approval dan child/headless boundary |
| OA-SEC-02 | **P1 / High (hardening)** | Network & prompt injection | Fetcher model-driven tidak punya policy scheme/private host/redirect/timeout/body-size lengkap |
| OA-REL-01 | **P1 / High** | Packaging | PDF worker wajib tetapi README dan `check:docs` tidak memasukkannya sebagai kontrak instalasi |
| OA-DEP-01 | **P1 / High** | Dependencies | 7 advisory; `pdfjs-dist` adalah concern runtime langsung, upgrade perlu regression branch |
| OA-QA-01 | **P2 / Medium** | CI | Real-browser preview tidak dijalankan oleh GitHub CI atau `npm test` |
| OA-REL-02 | **P2 / Medium** | Release | Pipeline release/docs terfragmentasi dan build stamp membuat output non-reproducible |
| OA-MNT-01 | **P2 / Medium** | Maintainability | Dua file UI sekitar 4K LOC dan strict-null masih off |
| OA-DOC-01 | **P3 / Low** | Docs | Tool-gap study drift; install-from-source juga hanya menyebut `main.js` |
| OA-GOV-01 | **P3 / Low** | Repository hygiene | MIT dinyatakan, tetapi LICENSE/CHANGELOG/CONTRIBUTING/SECURITY belum ada |

Tidak ada P0 yang terkonfirmasi: baseline berjalan dan ZIP saat ini lengkap. P1 berarti sebaiknya dibereskan sebelum memperluas capability atau mendorong adopsi lebih luas.

---

## 8. Detail temuan dan rekomendasi

### OA-SEC-01 — Approval dan capability boundary tidak mengikuti efek operasi

**Bukti**

- `src/agent/agentLoop.ts:125-130`: mode `cautious` hanya mengembalikan `!!tool.dangerous`.
- `src/agent/agentLoop.ts:146-152`: bila approval diperlukan tetapi handler tidak ada, keputusan default adalah deny. Mekanisme fail-closed ini baik, tetapi hanya bekerja untuk tool yang diklasifikasikan memerlukan approval.
- Hanya mutasi note utama (`write_note`, `edit_note`, `delete_note`, `rename_move_note`) yang memiliki `dangerous: true`.
- `src/agent/tools.ts:588-612`: `create_skill` menulis skill persisten yang akan tersedia pada sesi berikutnya, tanpa flag dangerous.
- `src/agent/tools.ts:661-722`: `manage_skill` dapat full-rewrite, patch, delete, write supporting file, dan remove file, tanpa flag dangerous.
- `src/agent/tools.ts:728+`: `cronjob` dapat create/update/run/remove scheduled automation, tanpa flag dangerous.
- `src/agent/delegate.ts:32`: daftar tool child yang diblokir tidak mencakup `create_skill` atau `manage_skill`, walau komentar menyatakan child tidak menyentuh shared state.
- `src/agent/runner.ts:205-209`: headless cron hanya membuang `cronjob`; `manage_skill` dan `create_skill` tetap tersedia tanpa approval handler.
- Settings UI menjelaskan cautious sebagai “Only destructive calls ask”, sehingga `manage_skill delete` dan `cronjob remove` jelas tidak memenuhi janji UI saat ini.

**Dampak**

- Model dapat mengubah atau menghapus skill tanpa confirmation pada mode default.
- Model dapat membuat/menjalankan automation tanpa confirmation.
- Child atau scheduled run dapat menciptakan/mengubah skill bersama, walau konteks tersebut tidak punya UI approval.
- Skill dimuat ke system prompt pada sesi berikutnya. Dikombinasikan dengan konten web/note yang tidak tepercaya, ini membuka jalur **persistent prompt injection**: instruksi dari data eksternal dapat memengaruhi pembuatan skill, lalu skill tersebut memperoleh posisi prompt yang lebih dipercaya pada sesi mendatang.

**Rekomendasi**

1. Ganti boolean statis dengan policy per operasi, misalnya:
   - `read`;
   - `network-read`;
   - `ephemeral-write`;
   - `persistent-write`;
   - `destructive`;
   - `scheduling`.
2. Classifier harus dapat melihat argumen: `cronjob list` berbeda dengan `cronjob remove`; `manage_skill delete` berbeda dari read-only tool.
3. Untuk patch cepat sebelum refactor policy:
   - tandai `create_skill`, `manage_skill`, dan `cronjob` sebagai membutuhkan approval di cautious;
   - blokir `create_skill` + `manage_skill` dari delegated child;
   - gunakan allowlist eksplisit untuk headless cron, bukan hanya blacklist satu tool.
4. Pertimbangkan review/approval untuk memory/profile writes yang bersumber dari web/tool content, karena keduanya juga masuk prompt di masa depan.
5. Tambahkan provenance sederhana pada turn/tool output agar policy tahu apakah rencana persistent write berasal dari input langsung pengguna atau data tidak tepercaya.

**Acceptance tests**

- Cautious meminta izin untuk skill create/update/delete dan cron create/update/run/remove.
- `cronjob list`, `list_skills`, `view_skill`, dan pencarian tetap read-only tanpa prompt bila policy mengizinkan.
- Child tidak mempunyai tool shared-state write.
- Headless run auto-deny semua persistent/destructive effect tanpa bergantung pada flag tool yang mudah terlupa.
- Regression test memastikan tool mutatif baru tidak dapat diregister tanpa deklarasi effect policy.

---

### OA-SEC-02 — Network boundary dan untrusted-content policy belum memadai

**Bukti**

- `src/agent/tools.ts:491-502`: URL dari argumen model dibersihkan sebagai string lalu langsung diberikan ke `requestUrl({ url, throw: true })`.
- Tidak ada validasi scheme, URL credentials, hostname/IP private, loopback, link-local, metadata endpoint, atau redirect target.
- Tidak ada timeout untuk `web_extract` dan tidak ada batas byte sebelum `resp.text` sudah dimuat. `char_limit` hanya membatasi hasil setelah full body ada di memori.
- `vision_analyze` membatasi bentuk remote ke HTTP(S) dan ukuran hasil menjadi 5 MiB, tetapi fetch-nya tetap tidak mempunyai private-host/redirect/timeout policy dan ukuran baru diperiksa setelah respons diterima.
- `src/agent/systemPrompt.ts` punya proteksi khusus steer marker, tetapi belum ada aturan umum yang tegas bahwa isi web, note, attachment, skill yang belum dipercaya, dan tool output adalah **data, bukan instruksi**.

**Dampak**

Secara statis, model dapat mengarahkan fetch ke resource lokal/private bila `requestUrl` mengizinkannya. Respons masuk kembali ke konteks model, sehingga berpotensi membaca data layanan lokal atau menjadi bagian dari rantai exfiltration/prompt injection. Respons besar/lambat juga dapat menahan atau menekan memori plugin. Tingkat exploitability nyata bergantung pada perilaku Electron/Obsidian `requestUrl`, DNS, redirect, dan layanan yang tersedia; itu belum divalidasi dinamis.

**Rekomendasi**

- Buat satu `safeRequestUrl` wrapper untuk semua fetch model-driven.
- Hanya izinkan `http:` dan `https:`; tolak credentials di URL.
- Tolak localhost, loopback, private, link-local, multicast, `.local`, dan cloud metadata address untuk default policy; sediakan opt-in eksplisit bila pengguna memang membutuhkan intranet.
- Resolve DNS dan validasi IPv4/IPv6; validasi ulang setiap redirect. Cegah DNS rebinding sejauh API memungkinkan.
- Tetapkan timeout, redirect count, content-type policy, dan streaming/max-response-byte cap.
- Bedakan provider endpoint yang dikonfigurasi pengguna dari URL yang dipilih model.
- Tambahkan system-prompt boundary: konten eksternal tidak boleh mengubah objective, approval policy, secrets policy, atau membuat persistent state tanpa konfirmasi.
- Bungkus hasil tool dengan metadata provenance, bukan hanya markdown bebas.

**Acceptance tests**

- Tolak `file:`, `data:` untuk web extract, `localhost`, `127.0.0.1`, `::1`, RFC1918, link-local, metadata IP, URL credentials, serta redirect publik → private.
- Timeout dan body cap diuji.
- Domain publik normal tetap berhasil.
- Test prompt-injection memastikan teks halaman tidak dapat memicu persistent write tanpa approval.

---

### OA-REL-01 — PDF worker wajib tidak tercakup kontrak install/check

**Bukti**

- `src/ui/attach/pdf.ts:19-21` menyatakan tidak ada fallback tersembunyi.
- `src/ui/attach/pdf.ts:45-56` membaca `${pluginDir}/vendor/pdf.worker.min.js`; worker hilang menghasilkan error install.
- `scripts/release.mjs:28` dengan benar memasukkan worker ke daftar artifact.
- ZIP `0.1.135` saat ini juga benar-benar memuat worker.
- `README.md:31-35` hanya menyuruh pengguna menyalin `main.js`, `manifest.json`, dan `styles.css`.
- `scripts/check-docs.mjs:127-160` hanya mewajibkan tiga file yang sama di ZIP; ZIP tanpa worker masih dapat lolos docs check.
- `README.md:43` mengatakan build “produces main.js”, padahal production build juga menghasilkan worker vendor.

**Dampak**

Pengguna yang mengikuti drop-in instruction secara literal mendapat plugin yang tampak terpasang, tetapi PDF attachment gagal pada saat digunakan. Selain itu, perubahan packaging di masa depan dapat tidak sengaja menghilangkan worker dan tetap lolos CI docs check.

**Rekomendasi**

- Ubah instruksi utama menjadi “extract/copy seluruh folder `openagent/`” atau sebut empat artifact dan path `vendor/` secara eksplisit.
- Wajibkan `openagent/vendor/pdf.worker.min.js` dalam `check:docs` dan release verifier.
- Tambahkan smoke test instalasi dari ZIP bersih: extract → load plugin → attach PDF satu halaman → text extraction berhasil.
- Tambahkan checksum/size sanity untuk worker, bukan hanya keberadaan nama entry.

---

### OA-DEP-01 — Dependency advisories memerlukan upgrade terkontrol

**Hasil `npm audit`**

| Package | Severity | Posisi | Penilaian praktis |
|---|---:|---|---|
| `pdfjs-dist` | High | direct/runtime | Concern utama; versi `3.11.174` masuk rentang advisory arbitrary-JS execution |
| `diff` | Low | direct/runtime | Kode hanya memakai `diffLines`/`diffWordsWithSpace`; advisory berada pada `parsePatch`/`applyPatch`, sehingga jalur sekarang tidak terjangkau |
| `esbuild` | Moderate | direct/dev | Advisory dev-server; pipeline ini tidak memakai API serve, tetapi versi tetap perlu diperbarui |
| `canvas` | High | transitive/optional | Node branch PDF.js; tidak masuk runtime bundle Obsidian |
| `@mapbox/node-pre-gyp` | High | transitive/install | Rantai optional/install-time melalui canvas |
| `brace-expansion` | High | transitive/install | Rantai install tooling |
| `tar` | Critical | transitive/install | Rantai install-time melalui canvas/node-pre-gyp; tidak masuk bundle runtime |

Total penuh: **7** (1 critical, 4 high, 1 moderate, 1 low).  
Production-only: **6** (1 critical, 4 high, 1 low).

**Nuansa penting**

- `pdf.ts` sudah membatasi 20 MiB, maksimal 50 halaman, memakai worker terpisah, dan menetapkan `isEvalSupported: false`. Ini defense-in-depth yang baik, tetapi bukan pengganti upgrade dependency.
- `pdfjs-dist@4.8.69` sudah berada di atas rentang advisory langsung (`<=4.7.76` pada output audit), mendukung Node `>=18`, dan metadata npm tidak lagi menampilkan dependency canvas. Ini kandidat migrasi bertahap.
- `pdfjs-dist@5.6.205` adalah target latest yang disarankan npm, tetapi memerlukan Node `>=20.19 || >=22.13 || >=24` dan merupakan major upgrade yang lebih besar.
- `diff@8.0.3` adalah versi pertama di luar rentang advisory `<8.0.3`, walau `npm audit fix` menawarkan `9.0.0` karena constraint major saat ini.
- `esbuild>=0.25.0` berada di luar advisory `<=0.24.2`; latest yang diperiksa `0.28.2` juga major relatif terhadap constraint saat ini.

**Rekomendasi**

Jangan menjalankan blind `npm audit fix --force`. Buat branch dependency khusus:

1. uji `pdfjs-dist@4.8.69` lebih dahulu sebagai lompatan minimum yang menghapus advisory langsung dan rantai canvas menurut metadata; bila integrasi ESM/worker tidak stabil, evaluasi 5.x;
2. rebuild worker dari package yang sama dan pastikan main/worker version match;
3. jalankan unit PDF + real-browser PDF lane + PDF malformed/encrypted/large regression pada desktop dan mobile bila didukung;
4. naikkan `diff` minimal ke `8.0.3`, lalu regression preview diff;
5. naikkan esbuild minimal ke versi fixed dan regression bundle/release;
6. tambahkan `npm audit --omit=dev` sebagai signal CI terpisah dengan policy allowlist sementara agar advisory baru tidak tenggelam.

---

### OA-QA-01 — Real-browser preview tidak menjadi CI gate

**Bukti**

- `.github/workflows/ci.yml` hanya menjalankan install, typecheck, build, `npm test`, dan `check:docs`.
- `npm test` menjalankan 19 suite CJS, bukan real-preview/Playwright.
- `scripts/release.mjs` menjalankan preview dan settings preview, tetapi hanya ketika release command digunakan dan bisa dilewati dengan `--skip-preview`.

**Dampak**

Regresi DOM/CSS, attachment worker, atau setting interaction yang hanya terlihat di Chromium dapat masuk ke `main` walau CI hijau.

**Rekomendasi**

- Tambahkan job Playwright terpisah di CI; simpan screenshot/report artifact saat gagal.
- Jadikan PDF worker lane dan settings real-preview sebagai gate PR yang menyentuh UI/build/attachment.
- Jika biaya CI tinggi, gunakan path filters atau nightly penuh, tetapi minimal satu smoke browser harus wajib pada PR.

---

### OA-REL-02 — Pipeline release belum canonical dan build tidak reproducible

**Bukti**

- `scripts/release.mjs` melakukan typecheck → build → tests → preview → ZIP → byte verification, tetapi tidak menjalankan `check:docs`.
- Script tersebut menulis `../openagent-obsidian-plugin.zip`, sedangkan `check:docs` mengharapkan `openagent-obsidian-plugin-v<version>.zip` di root repo.
- CI menjalankan `check:docs`, tetapi tidak preview.
- `esbuild.config.mjs:18-22` menanam waktu build aktual ke `main.js`; dua build source yang sama menghasilkan byte berbeda.

**Dampak**

Tidak ada satu command yang membuktikan seluruh kontrak CI + browser + docs + artifact versioned. Timestamp juga menimbulkan noise pada committed bundle dan menyulitkan reproducible build/attestation.

**Rekomendasi**

- Satukan canonical pipeline: clean → typecheck → build → unit/smoke → real-browser → docs → package versioned → extract-and-verify bytes → checksum.
- Gunakan satu nama output versioned di repo/release staging.
- Ambil stamp deterministik dari `SOURCE_DATE_EPOCH` atau commit timestamp; simpan waktu publikasi di metadata release, bukan sebagai byte nondeterministik di bundle.
- Verifikasi seluruh artifact wajib, termasuk worker, dan bila CSS memang minified secara khusus, verifikasi hasil minify deterministik terhadap source.

---

### OA-MNT-01 — Hotspot UI dan strict-null debt

`ChatApp.tsx` dan `settingsTab.ts` masing-masing sekitar 4K LOC. Digabung dengan strict-null yang belum aktif, perubahan lintas state/DOM lebih berisiko daripada ukuran total repo seharusnya.

**Rekomendasi urutan refactor**

1. Bereskan 12 strict diagnostic dan aktifkan `strictNullChecks` di CI.
2. Ekstrak state machines/hooks terlebih dahulu, bukan sekadar memindahkan JSX:
   - run/queue/abort/steer state;
   - attachment lifecycle;
   - session/model menu state;
   - approval modal state.
3. Pecah settings per section dengan API render yang typed.
4. Pasang characterization test sebelum memindahkan behavior.
5. Tetapkan guardrail ukuran/modularitas ringan, bukan target LOC absolut.

---

### OA-DOC-01 dan OA-GOV-01 — Drift dan hygiene publik

- Update `hermes-tools-gap-2026-08-09.md` dari 16 menjadi 21 tools/9 toolsets dan tandai gap yang sudah ditutup.
- Selaraskan README install dengan external PDF worker.
- Tambahkan `LICENSE` karena package menyatakan MIT.
- Tambahkan minimal `SECURITY.md` (cara private reporting dan supported versions), `CONTRIBUTING.md`, dan changelog/release notes.
- Setelah canonical release siap, mulai git tag versioned (`v0.1.135` dan seterusnya) agar artifact dapat ditelusuri ke source.

---

## 9. Hal positif yang ditemukan

Audit tidak hanya menemukan gap. Beberapa defense dan praktik yang sudah baik:

- Approval tanpa handler **fail closed** untuk tool yang memang diklasifikasikan perlu approval.
- Mutasi note utama sudah ditandai dangerous dan punya preview/approval flow.
- Supporting-file skill memiliki guard terhadap absolute path dan segmen `..`.
- Hub mempunyai security scan serta lock/update flow.
- PDF parsing dibatasi 20 MiB/50 halaman, lazy, worker-threaded, dan `isEvalSupported: false`.
- Provider transport mempunyai timeout dan fallback behavior.
- Tidak ditemukan secret nyata yang tracked; satu API key hanya fixture palsu di test.
- ZIP committed sekarang sinkron dengan runtime artifact penting dan memuat worker yang benar.
- Test coverage domain cukup luas: loop, tools, settings, profiles, prompt, hub, cron, attachment, markdown, model catalog/menu, context, MoA, changed files, dan preview planner.
- MCP belum diiklankan seolah-olah hidup: UI secara eksplisit menyebut config-only.

### Watch item, bukan vulnerability terkonfirmasi

Destination handling pada installer Hub belum mempunyai guard eksplisit setara supporting-file guard di `skills.ts`. Sanitizer nama dan struktur saat ini mengurangi risiko, dan audit tidak membuktikan traversal yang dapat dieksploitasi. Tetap disarankan menambahkan invariant/test “resolved destination harus tetap berada di skills root” sebagai defense-in-depth.

---

## 10. Roadmap yang disarankan

### Fase 0 — Bekukan baseline dan branch kerja (0,5 hari)

- Tag/catat commit audit `ed1ccac`.
- Buat branch per concern; jangan campur dependency major, approval refactor, dan UI refactor.
- Tambahkan checklist acceptance dari laporan ini ke issue tracker.

**Exit:** baseline reproducible secara prosedural dan setiap perubahan punya scope terpisah.

### Fase 1 — Safety dan packaging hotfix (1–3 hari)

1. Tutup approval gap untuk `create_skill`, `manage_skill`, `cronjob`.
2. Hilangkan shared-state mutation dari child/headless capability set.
3. Perbaiki README agar menyalin seluruh folder/worker.
4. Wajibkan PDF worker di docs/release check.
5. Tambahkan regression tests untuk approval dan clean-ZIP PDF extraction.

**Exit:** mode cautious memenuhi copy UI; child/headless tidak dapat memodifikasi state persisten; install sesuai docs berhasil untuk PDF.

### Fase 2 — Network dan prompt-injection boundary (2–5 hari)

1. Implementasikan centralized safe fetch policy.
2. Tambahkan timeout/body/redirect/private-network tests.
3. Tambahkan untrusted-content instruction dan provenance.
4. Audit ulang seluruh sumber konteks: note, web, attachment, Hub/local skills, memory.

**Exit:** fetch model-driven mempunyai policy eksplisit dan persistent action dari untrusted content selalu membutuhkan boundary/approval.

### Fase 3 — Dependency remediation (2–5 hari)

1. Branch upgrade PDF.js + worker.
2. Upgrade `diff` dan esbuild ke versi fixed minimum/latest yang kompatibel.
3. Jalankan seluruh baseline + real-browser PDF lane + Obsidian desktop/mobile smoke.
4. Regenerate lockfile/artifact hanya setelah regression hijau.

**Exit:** advisory runtime langsung hilang; optional canvas/tar chain hilang atau didokumentasikan/diisolasi; artifact PDF tetap berfungsi.

### Fase 4 — Canonical CI/release (2–4 hari)

- Tambahkan browser job ke CI.
- Satukan docs + preview + versioned packaging + worker check.
- Buat build stamp deterministik.
- Emit checksum dan release manifest.

**Exit:** satu command dan satu workflow menghasilkan artifact versioned yang dapat diverifikasi dari clean checkout.

### Fase 5 — Type safety dan modularisasi (3–8 hari, bertahap)

- Selesaikan 12 strict diagnostic; aktifkan strict-null.
- Pecah `ChatApp.tsx` dan `settingsTab.ts` berdasarkan state/behavior boundaries.
- Pertahankan characterization tests selama refactor.

**Exit:** full strict-null CI hijau; hotspot lebih kecil tanpa perubahan perilaku.

### Fase 6 — Docs/governance dan baru kemudian fitur baru (1–2 hari + scope fitur)

- Sinkronkan study/backlog/status matrix.
- Tambahkan LICENSE, SECURITY, CONTRIBUTING, changelog, dan version tags.
- Setelah fondasi stabil, pilih fitur berikut berdasarkan kebutuhan pengguna. Kandidat paling natural: MCP runtime **atau** retrieval/search yang lebih dalam, bukan keduanya sekaligus.

---

## 11. Urutan implementasi yang paling aman

Jika hanya ada kapasitas untuk tiga PR berikutnya:

1. **PR 1 — Safety + PDF install contract**  
   Approval/effect tests, child/headless allowlist, README worker, ZIP worker assertion.
2. **PR 2 — Safe network wrapper + untrusted-content boundary**  
   Web/vision URL policy, timeout/body caps, redirect/private-host tests, prompt policy.
3. **PR 3 — Dependency upgrades + browser CI**  
   PDF.js/diff/esbuild upgrade, real-browser PDF regression, canonical CI wiring.

Jangan memulai refactor UI besar atau MCP runtime pada PR yang sama dengan tiga hal di atas. Memisahkan scope membuat regression dan rollback jauh lebih mudah.

---

## 12. Kesimpulan

`obsidian-openagent` memiliki fondasi produk yang nyata dan baseline engineering yang sehat. Masalah utamanya bukan ketiadaan fitur, melainkan beberapa boundary yang tertinggal saat capability bertambah cepat: klasifikasi approval masih boolean, network fetch belum punya policy sentral, dan external PDF worker belum dianggap kontrak instalasi oleh docs/checker.

Dengan menyelesaikan Fase 1–4, proyek akan berubah dari “fitur kaya dan lolos test” menjadi “fitur kaya dengan trust boundary dan release assurance yang sepadan”. Setelah itu refactor UI dan ekspansi seperti MCP dapat dilakukan dengan risiko yang jauh lebih rendah.

**Tidak ada source code yang diubah selama audit ini.**
