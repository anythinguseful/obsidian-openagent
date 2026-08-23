# Audit Paket B — Network & Prompt-Injection Boundary

**Proyek:** Open Agent for Obsidian  
**Tanggal:** 2026-08-11 (Asia/Jakarta)  
**Branch:** `arena/tool-hardening`  
**HEAD:** `00b7b50b8869d64da53861398881d7f294093a45` (`Release v0.1.137`)  
**Mode audit:** statis pada HEAD terbaru; tidak ada source code yang diubah  
**Status working tree saat audit:** bersih

## Ringkasan eksekutif

Paket A sudah memperbaiki banyak jalur efek samping: write/skill/cron mendapat klasifikasi approval yang lebih tepat, sedangkan child dan headless agent memakai capability allowlist fail-closed. Namun Paket B masih diperlukan.

Dua temuan berprioritas tertinggi adalah:

1. **OA-SEC-02 — URL yang dipilih model masih dapat mencapai network melalui `requestUrl` tanpa policy terpusat.** Ini berlaku pada `web_extract` dan remote `vision_analyze`. Input belum menolak credentials, localhost/private/link-local/metadata host, IPv4/IPv6 khusus, atau port non-web. Redirect dan DNS juga belum dibatasi.
2. **OA-SEC-03 — marker `/steer` yang dianggap sebagai pesan pengguna asli bersifat statis dan belum di-escape dari tool output.** Halaman web atau note dapat memuat marker yang sama persis; parser UI kemudian dapat menampilkannya sebagai user steer, sementara system prompt menyuruh model mempercayai marker persis tersebut.

Temuan tambahan: `requestUrl` tidak menyediakan hard timeout, redirect mode, final URL, streaming body, atau abort signal; remote image validation belum konsisten; remote media dari Markdown assistant belum diblokir sebelum render; dan dua memory-write tools masih berjalan tanpa approval pada mode default `cautious`.

**Rekomendasi:** implementasikan **Paket B Seimbang** sebagai patch berikutnya. Paket ini memberi perlindungan bermakna tanpa memblokir provider lokal seperti LM Studio/Ollama. Akan tetapi, karena keterbatasan API publik Obsidian, patch berbasis `requestUrl` harus jujur disebut **best-effort** terhadap DNS rebinding, redirect ke host privat, hard abort, dan pre-download byte cap. Menyatakan empat hal tersebut “sepenuhnya tertutup” akan menyesatkan.

---

## 1. Peta trust dan network surface

| Surface | Pemilih URL | Trust/use case | Policy yang direkomendasikan |
|---|---|---|---|
| `web_extract` | Model | Data eksternal tidak dipercaya; general public web | **Deny private/local**, validasi scheme/credentials/host/port, text-only, deadline dan cap best-effort, provenance eksplisit |
| Remote `vision_analyze` | Model | Data eksternal tidak dipercaya; image fetch | Policy public-web yang sama, ditambah magic-byte image allowlist dan 5 MiB logical cap |
| Provider `/models` dan `/chat/completions` | Pengguna melalui Settings | Endpoint layanan yang sengaja dikonfigurasi; localhost sah | **Jangan** diberi default deny-private; pertahankan local HTTP untuk LM Studio/Ollama |
| Hub GitHub tap | Aplikasi/hardcoded | `api.github.com` + `raw.githubusercontent.com` | Allowlist host dan cap terpisah; bukan model-driven URL |
| Hub direct `SKILL.md` | Pengguna secara eksplisit | User-entered HTTPS, preview/scan/install flow | Jangan disamakan dengan model URL; tetap perlukan robustness cap/timeout pada paket terpisah atau sub-scope kecil |
| Link HTTP(S) di jawaban | Model membuat link, pengguna harus klik | Explicit user gesture | Boleh dipertahankan sebagai link; jangan auto-open |
| Remote image/media di Markdown jawaban | Model | Browser dapat memuat otomatis tanpa user gesture | Blok auto-load; ubah menjadi link/placeholder yang memerlukan klik |

Pemisahan ini wajib. Policy SSRF untuk model-driven URL **tidak boleh** ditempel global ke seluruh `requestUrl`, karena provider lokal yang sah saat ini memakai, antara lain, `http://localhost:1234/v1` dan `http://localhost:11434/v1`.

---

## 2. Temuan

### OA-SEC-02 — Model-driven network fetch tanpa centralized policy

**Severity:** High  
**Status:** terbuka pada v0.1.137

#### Bukti

- `src/agent/tools.ts:531-535`: setiap URL `web_extract` diteruskan langsung ke `requestUrl({ url, throw: true })`.
- `src/agent/vision.ts:138-157`: remote `vision_analyze` meneruskan HTTP(S) URL langsung ke `requestUrl`.
- `src/agent/delegate.ts:31-41` dan `:60-62`: `vision_analyze` tetap tersedia bagi child dan headless/scheduled agents. Artinya remote image fetch juga dapat terjadi dalam konteks tanpa approval UI.

#### Yang belum divalidasi

- URL harus absolut dan hanya scheme yang diizinkan;
- username/password tersemat (`https://user:pass@host/`);
- `localhost`, subdomain `.localhost`, trailing dot, `.local`, `.internal`, `home.arpa`, metadata host;
- IPv4 private, loopback, link-local, CGNAT, benchmark, multicast, reserved;
- bentuk IPv4 alternatif yang dinormalisasi WHATWG (`127.1`, integer, hex, octal);
- IPv6 loopback, unspecified, ULA, link-local, multicast, IPv4-mapped IPv6;
- non-default port;
- redirect target;
- DNS result dan rebinding.

#### Dampak

Model atau prompt injection dalam konten dapat mencoba mengakses service lokal/private, metadata endpoint, atau melakukan network probing. Pada remote vision, capability ini juga tersedia di child/headless context.

#### Rekomendasi

Buat policy khusus model-driven fetch—bukan global provider policy—yang minimal:

1. parse dengan `new URL` dan kirim URL yang sudah dinormalisasi;
2. hanya izinkan `http:`/`https:`; pertahankan HTTP publik demi kompatibilitas tetapi tandai sebagai insecure provenance;
3. tolak credentials dan fragment sebelum transport;
4. izinkan port default web saja (`80`/`443`) pada default policy;
5. tolak special-use hostname dan literal IPv4/IPv6 non-global;
6. validasi status 2xx;
7. mode `text` dan `image` memiliki content-type serta byte budget berbeda;
8. semua kegagalan memberi error yang tidak membocorkan response body atau credentials.

### OA-ROB-02 — `requestUrl` tidak dapat memberi hard redirect/timeout/body guarantees

**Severity:** High untuk resource-exhaustion/SSRF residual  
**Status:** batas platform, bukan sekadar bug satu fungsi

Shipped Obsidian typings (`node_modules/obsidian/obsidian.d.ts:5439-5485`) menunjukkan:

- request hanya memiliki `url`, method, content type, body, headers, dan `throw`;
- tidak ada `AbortSignal`, timeout, `redirect: "manual"`, atau streaming reader;
- response tidak memiliki `url`/final URL;
- body tersedia sebagai `arrayBuffer`, `json`, dan `text`, yaitu sudah dibuffer.

Konsekuensinya:

- `Promise.race` hanya membuat caller berhenti menunggu; request bawahnya tetap berjalan;
- final redirect host tidak dapat diperiksa dari API publik ini;
- body-size check baru dapat dilakukan setelah response selesai dimuat;
- `Content-Length` dapat diperiksa, tetapi tidak menjadi pre-download hard cap;
- DNS rebinding tidak dapat ditutup hanya dengan validasi nama host.

Provider transport sudah mengakui limit ini di `src/agent/providers.ts:117-147`: timeout adalah timer race dan request tetap selesai di background.

#### Keputusan arsitektur yang perlu eksplisit

- **Mode seimbang (direkomendasikan untuk patch):** tetap memakai `requestUrl` agar desktop/mobile dan CORS-clean extraction tidak rusak; tambah preflight host policy, soft deadline, exposed-header checks, dan post-buffer cap. Dokumentasikan residual redirect/DNS/hard-cap.
- **Mode strict:** custom streaming client di desktop dengan DNS pinning, redirect manual, hard abort dan incremental byte cap; remote model-fetch pada mobile dibatasi/fail-closed bila transport aman tidak tersedia. Lebih kuat, tetapi kompleks dan berisiko kompatibilitas lintas platform.

Tidak direkomendasikan memakai browser `fetch` sebagai drop-in universal: redirect/abort/streaming memang tersedia, tetapi general web extraction akan sering gagal karena CORS—alasan `requestUrl` digunakan sejak awal.

### OA-SEC-03 — Static trusted steer marker dapat dipalsukan oleh tool output

**Severity:** High  
**Status:** terbuka

#### Bukti

- `src/agent/steer.ts:27-48` mendefinisikan marker statis dan memberi instruksi kepada model untuk mempercayai exact marker.
- `src/agent/steer.ts:62-82` mengklasifikasikan setiap pasangan exact marker di tool output sebagai steer untuk UI.
- `src/agent/agentLoop.ts` belum meng-escape marker reserved sebelum tool result masuk wire/transcript.

Halaman web, note, memory, atau output tool lain dapat berisi marker yang sama. Ini menciptakan dua masalah:

1. **Prompt provenance spoof:** model diberi instruksi untuk memperlakukan marker persis sebagai pesan pengguna asli.
2. **UI provenance spoof:** `splitSteerMarkers` dapat menampilkan teks dari tool/web/file sebagai user steer pill.

#### Rekomendasi

- escape/neutralize token marker reserved pada **semua output tool** sebelum clipping, transcript, dan wire;
- tambahkan boundary eksplisit `BEGIN/END UNTRUSTED TOOL OUTPUT` atau metadata ekuivalen;
- append marker steer asli hanya setelah output yang sudah disanitasi;
- tambahkan system rule: web/file/image/tool content adalah data, bukan instruksi; jangan melakukan state-changing call semata-mata karena isi data meminta;
- regression test harus membuktikan exact marker dari tool tidak menghasilkan `steers[]`, sedangkan genuine `/steer` tetap berfungsi.

Nonce per run dapat menjadi hardening lanjutan, tetapi escaping sebelum wire/UI adalah perbaikan minimum yang paling kecil risikonya.

### OA-SEC-04 — Remote media pada jawaban dapat menjadi network request tanpa klik

**Severity:** Medium  
**Status:** perlu runtime confirmation di Obsidian nyata, tetapi tidak ada guard pre-render saat ini

`src/ui/components/markdown.tsx` mengirim assistant Markdown ke `MarkdownRenderer.render`. Link biasa baru dibuka setelah klik, tetapi Markdown image/raw media dapat membuat browser memuat `http(s)` resource saat render. Ini membuka tracking/privacy leak dan GET side effects ke endpoint publik/lokal tanpa user gesture.

#### Rekomendasi

- preprocess assistant Markdown sebelum `MarkdownRenderer`;
- ubah remote Markdown image dan raw HTML media menjadi placeholder/link klik-sadar;
- pertahankan vault `app://` resource dan attachment `data:` yang dibuat aplikasi;
- tambahkan real-render test yang memonitor request; unit regex saja tidak cukup untuk menjamin raw HTML/reference-image cases;
- audit Mermaid image directives agar URL remote tidak lolos melalui SVG hasil render.

### OA-SEC-05 — Memory writes masih tidak di-gate pada default `cautious`

**Severity:** Medium  
**Status:** terbuka

`save_memory` dan `update_user_profile` (`src/agent/tools.ts:567-597`) tidak memiliki `approvalKind`. Default settings adalah `approvalMode: "cautious"`, sehingga keduanya diklasifikasikan `standard` dan dapat menulis persistent prompt context tanpa approval.

Paket A sudah memblokir kedua tool ini dari child/headless agent, sehingga blast radius berkurang. Namun pada interactive parent, web/file prompt injection masih dapat mencoba menanam instruksi atau fakta palsu yang akan diinjeksikan ke percakapan mendatang.

#### Rekomendasi

Klasifikasikan keduanya sebagai `persistent-write`, tampilkan preview entry/category pada approval card, dan pertahankan `manual`/`yolo` semantics yang ada.

### OA-SEC-06 — Vision format validation tidak konsisten dengan kontrak tool

**Severity:** Medium  
**Status:** terbuka

- Remote response memakai magic bytes, tetapi jika tidak cocok akan menerima header apa pun yang dimulai `image/`; akibatnya SVG/AVIF atau header palsu dapat lolos walaupun pesan error menjanjikan hanya PNG/JPEG/GIF/WebP/BMP.
- `data:` input menerima MIME generik dan tidak memvalidasi decoded magic bytes/base64 secara ketat.
- HTTP status hanya menolak `>=400`; visible 3xx atau status lain non-2xx seharusnya ditolak.
- 5 MiB check terjadi setelah seluruh `arrayBuffer` diterima.

#### Rekomendasi

Gunakan satu allowlist magic-byte authoritative untuk remote/data/vault; header dan extension hanya menjadi diagnostic, bukan izin. Decode data URL setelah estimasi cap, validasi base64 dan magic, lalu canonicalize MIME.

### OA-REL-01 — Manual install docs/check masih tidak mewajibkan PDF worker

**Severity:** Medium  
**Status:** terbuka sebagai docs/gate gap; artifact v0.1.137 sendiri benar

- ZIP v0.1.137 berisi `openagent/vendor/pdf.worker.min.js` dan release script memverifikasi file itu byte-for-byte.
- README masih menyuruh pengguna menyalin hanya `main.js`, `manifest.json`, dan `styles.css`.
- `scripts/check-docs.mjs` juga hanya mewajibkan tiga entry tersebut.

Akibatnya, manual install sesuai README dapat merusak PDF attachment extraction meskipun release ZIP resmi lengkap.

#### Rekomendasi

Masukkan fix kecil ini dalam patch yang sama: README menyuruh menyalin folder `vendor/`, dan `check:docs` mewajibkan `openagent/vendor/pdf.worker.min.js`.

---

## 3. Scope implementasi Paket B Seimbang (direkomendasikan)

### B1 — Central model-network policy

Buat modul pure/testable baru, misalnya `src/agent/modelNetwork.ts`, dengan:

- URL parser/normalizer;
- special host dan IPv4/IPv6 classifier;
- policy mode `text` dan `image`;
- injectable transport agar unit test tidak memalsukan capability yang tidak dimiliki Obsidian;
- soft deadline/caller abort race;
- status/header/post-buffer cap checks;
- typed result/provenance.

Integrasikan hanya ke:

- `web_extract`;
- remote branch `resolveVisionImage`.

**Jangan** integrasikan policy deny-private ini ke provider transport.

### B2 — Untrusted-content and steer boundary

- sanitasi exact reserved steer marker dari semua tool output;
- system-prompt rule untuk untrusted web/file/image/tool data;
- web result membawa source URL, normalized host, media type, dan status;
- web summarizer mendapat system instruction yang jelas dan page body dibatasi sebagai data;
- native/aux vision prompt menyatakan teks di dalam image bukan user instruction;
- `save_memory` dan `update_user_profile` menjadi `persistent-write`.

### B3 — Auto-load media guard

- blok remote image/media dari assistant Markdown sebelum render;
- ubah menjadi link/placeholder yang membutuhkan user click;
- pertahankan local vault/data attachment rendering;
- tambah unit + browser request-observer regression.

### B4 — Packaging docs micro-fix

- README manual install menyertakan `vendor/`;
- ZIP gate `check:docs` mewajibkan PDF worker.

---

## 4. Acceptance tests yang realistis

### Pure URL policy tests

Harus menolak sebelum transport dipanggil:

- `file:`, `ftp:`, `data:` untuk network wrapper;
- URL relatif dan malformed;
- embedded username/password;
- `localhost`, `localhost.`, `a.localhost`, `.local`, `home.arpa`, metadata names;
- `127.1`, decimal/hex/octal IPv4 spellings setelah WHATWG normalization;
- RFC1918, loopback, link-local, CGNAT, multicast/reserved IPv4;
- `::`, `::1`, ULA, link-local, multicast, IPv4-mapped private IPv6;
- port non-default.

Harus menerima public `https://example.org/path` dan public `http://example.org/` bila compatibility mode dipilih.

### Injected transport tests

- blocked URL membuat transport call count tetap nol;
- hanya 2xx diterima;
- mode text menolak binary/media content type dan oversized logical response;
- mode image menolak header-spoof tanpa supported magic bytes;
- `Content-Length` yang melebihi cap ditolak bila header tersedia;
- body nyata yang melebihi cap ditolak setelah response;
- soft deadline menolak never-resolving fake transport;
- test dan docs **tidak boleh** mengklaim request bawahnya dibatalkan.

### Prompt/provenance tests

- tool output berisi exact open+close steer marker → `splitSteerMarkers(...).steers` tetap kosong;
- genuine `/steer` tetap satu pill dan tetap mencapai model;
- system prompt menyebut untrusted data boundary;
- web summary instruction tidak menempatkan page text sebagai operator/system authority;
- memory tools terklasifikasi `persistent-write`;
- cautious mode meminta approval untuk memory write.

### Vision tests

- supported PNG/JPEG/GIF/WebP/BMP pada remote/data/vault;
- invalid base64;
- MIME mismatch dan SVG/header-only spoof;
- 3xx/4xx/5xx;
- >5 MiB logical rejection;
- private URL diblok sebelum `requestUrl` mock dipanggil.

### Markdown/runtime tests

- Markdown image URL, reference image, raw `<img>`, media source, dan Mermaid URL cases;
- request observer memastikan tidak ada HTTP(S) request sebelum klik;
- vault `app://` image dan application-created `data:` image tetap tampil;
- ordinary HTTP(S) links tetap dapat dibuka dengan explicit click.

### Release regression

- `npm run typecheck`;
- `npm test`;
- build production;
- real chat/settings previews;
- `npm run check:docs`;
- release ZIP harus berisi empat artifact runtime termasuk `vendor/pdf.worker.min.js`.

---

## 5. Risiko kompatibilitas

| Perubahan | Risiko | Mitigasi |
|---|---|---|
| Deny private/local model URL | User tidak dapat memakai `web_extract` untuk intranet | Sengaja fail-closed; provider lokal tetap berfungsi; user dapat membuka intranet manual di luar agent |
| Default-port-only | Public site pada 8080/8443 ditolak | Error jujur; dapat dipertimbangkan explicit user override pada versi berikutnya |
| Text content-type gate | Server salah konfigurasi dapat ditolak | Izinkan missing/generic type hanya bila conservative text sniff lulus |
| Remote image auto-load block | Jawaban tidak lagi menampilkan external image inline otomatis | Tampilkan placeholder + explicit link/open action |
| Memory approval | Sedikit lebih banyak prompt approval | Berlaku hanya persistence; `allow-always` tetap scoped ke tool+approval class |
| Marker escaping | Tool output yang sengaja mengutip marker berubah sedikit | Tambah visible `[reserved marker escaped]`; lebih aman daripada UI/user provenance spoof |
| Soft response cap | Large page/image masih sempat dibuffer oleh `requestUrl` | Dokumentasikan; hard cap menunggu strict transport architecture |

---

## 6. File yang diperkirakan disentuh

Source utama:

- `src/agent/modelNetwork.ts` (baru)
- `src/agent/tools.ts`
- `src/agent/vision.ts`
- `src/agent/webExtract.ts`
- `src/agent/steer.ts`
- `src/agent/agentLoop.ts`
- `src/agent/systemPrompt.ts`
- `src/ui/markdown-preprocess.ts`
- `src/ui/components/markdown.tsx`

Tests/gates:

- `test/tools.test.cjs`
- `test/agent-loop.test.cjs`
- `test/system-prompt.test.cjs`
- `test/markdown.test.cjs`
- `test/smoke.test.cjs`
- real-preview request-observer fixture/build files bila diperlukan
- `README.md`
- `scripts/check-docs.mjs`

`src/agent/providers.ts` sebaiknya tidak diubah oleh SSRF policy. Jika ada refactor helper timeout, behavior provider lokal harus tetap identik dan diuji terpisah.

---

## 7. Temuan di luar scope Paket B

Audit dependency pada 2026-08-11 melaporkan 7 advisory total (6 saat `--omit=dev`): direct `pdfjs-dist` high, direct `diff` low, dan advisory transitive termasuk `tar` critical melalui optional `canvas`/`node-pre-gyp`; `esbuild` moderate hanya dev. Ini **bukan** bukti bahwa seluruh advisory transitive masuk ZIP runtime—`canvas` diexternalisasi dan tidak tampak dibundle—tetapi `pdfjs-dist` lama memang dibundle dan perlu Paket C/upgrade terkontrol. Kode saat ini memakai `isEvalSupported: false`, yang mengurangi satu kelas risiko PDF.js, tetapi tidak menggantikan upgrade dan malicious-PDF tests.

Strict-null cleanup dan CI browser juga tetap backlog terpisah.

---

## 8. Rekomendasi keputusan

**Rekomendasi utama:** setujui **Paket B Seimbang** (B1–B4), implementasikan dalam satu branch/commit series, jalankan full regression dan release sebagai patch baru—jangan menimpa v0.1.137.

Definisi selesai yang jujur:

- literal/syntactic private-target SSRF ditutup untuk model-driven fetch;
- prompt/tool provenance dan static marker spoof ditutup;
- memory persistence menjadi approval-gated;
- remote assistant media tidak auto-load;
- response type/size diperketat;
- provider lokal dan Hub trust flow tidak diblokir secara membabi buta;
- residual `requestUrl` untuk DNS rebinding, hidden redirect, hard abort, dan pre-buffer cap dicatat eksplisit, bukan diklaim selesai.

Alternatif **Strict Transport** harus dipilih hanya jika pengguna menerima risiko: implementasi desktop lebih besar dan remote model-driven fetch pada mobile mungkin perlu dinonaktifkan ketika transport aman tidak tersedia.
