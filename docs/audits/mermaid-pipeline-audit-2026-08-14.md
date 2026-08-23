---
title: "Mermaid pipeline audit (2026-08-14)"
type: audit
status: done
date: 2026-08-14
tags: [openagent, audit, mermaid, historical]
---

> Historical audit record. Its supporting raw evidence is kept in [`../../evidence/audits/openagent-v0.1.143-mermaid-pipeline-audit-2026-08-14.md`](../../evidence/audits/openagent-v0.1.143-mermaid-pipeline-audit-2026-08-14.md). This note preserves the readable audit narrative; logs, matrices, checksums, and other execution artifacts remain in `evidence/`.

# Open Agent v0.1.143 — Audit Read-Only Pipeline Mermaid

**Tanggal audit:** 2026-08-14 (Asia/Jakarta)  
**Target:** `/home/user/releases/v0.1.143/obsidian-openagent-v0.1.143-clean-source`  
**Mode:** read-only terhadap protected source/release  
**Keputusan:** **jangan memodifikasi v0.1.143**. Temuan layak ditangani sebagai patch baru **v0.1.144**, setelah persetujuan eksplisit.

## 1. Ringkasan eksekutif

Audit menemukan **tiga kelas kegagalan runtime** dalam log pengguna:

| Token parser | Jumlah | Bentuk yang terlihat di log |
|---|---:|---|
| `PS` | 4 | label/caption mentah mengandung `(Thought)` |
| `NODE_STRING` | 4 | komentar `; %% ...` berada pada baris statement |
| `GRAPH` | 1 | dua fenced response melebur menjadi baris enam backtick, lalu `mermaid` + `graph TD` masuk ke body diagram pertama |
| **Total** | **9** | **3 pola unik** |

Kesimpulan utama:

1. **`NODE_STRING` terkonfirmasi langsung dan dapat direproduksi.** Mermaid mengharuskan komentar `%%` berada pada baris sendiri. Sanitizer v0.1.143 hanya memperbaiki suffix top-level `; % ...`, sengaja membiarkan `; %% ...` apa adanya. Akibatnya pola log tetap gagal pada Mermaid 11.4.1, 11.13.0, dan 11.16.1.
2. **Jalur retry Main Chat tidak attempt-atomic.** Probe source-level memaksa attempt pertama mengirim diagram lengkap lalu timeout, kemudian retry mengirim diagram baru. Callback UI menjadi `OLD + NEW`, sedangkan transcript internal hanya `NEW`. Bila `OLD` berakhir dengan ` ``` ` dan `NEW` dimulai dengan ` ```mermaid `, UI membentuk tepat kelas struktur:

       ```mermaid
       flowchart TD
         A --> A;
       ``````mermaid
       graph TD
         A[User] --> B[Agent]
       ```

   Segmenter memasukkan baris enam backtick dan diagram kedua ke body Mermaid pertama. Parser di ketiga versi menghasilkan **`got 'GRAPH'`**, sama dengan kelas token log. Ini adalah **mekanisme source-level yang terkonfirmasi dan sangat konsisten dengan log**, tetapi **belum membuktikan** bahwa retry benar-benar terjadi pada sesi pengguna karena log tidak memiliki timestamp, raw response, atau marker network/retry.
3. **`PS` bukan regression antar-versi Mermaid.** Bentuk mentah gagal identik di ketiga versi; sanitizer memperbaikinya bila `flowchart`/`graph` adalah header pertama yang dikenali. Namun komentar own-line atau init directive di depan header membuat gate flowchart v0.1.143 tidak aktif, sehingga bentuk `PS` tetap gagal sebelum dan sesudah sanitizer.
4. **Coverage sanitizer tidak seragam.** Main Chat final render, `/save`, dan eksekusi `write_note` memiliki sebagian perlindungan. Quick Ask final render, Main Chat Insert, Quick Ask Insert/Replace, `edit_note`, serta output cron ke archive/target dapat meneruskan Mermaid mentah ke Obsidian.
5. **Transport menerima anomali secara diam-diam.** EOF bersih tanpa `[DONE]` diterima sebagai sukses dengan implicit `finishReason: "stop"`; baris SSE JSON malformed diabaikan dan parsing dilanjutkan. Ini belum terbukti sebagai penyebab log, tetapi dapat menghilangkan token struktural tanpa sinyal diagnostik.
6. **Perbedaan versi Mermaid bukan penjelasan utama untuk fixture yang diuji.** Hasil 11.4.1, 11.13.0, dan 11.16.1 identik pada semua fixture audit.

## 2. Status integritas baseline

Sebelum probe:

- manifest protected source: **192/192 OK**;
- `package.json`: `0.1.143`;
- `manifest.json`: `0.1.143`;
- symlink: **0**;
- protected source/release tidak dipakai sebagai direktori instalasi probe.

Probe dijalankan pada scratch copy terpisah di `/tmp`. Tidak ada perubahan kode, artifact, checksum, atau evidence release v0.1.143.

## 3. Batasan dan klasifikasi bukti

### 3.1 Kelas bukti

- **A — bukti runtime langsung:** teks yang benar-benar ada di log pengguna.
- **B — reproduksi terkontrol dari source:** perilaku dieksekusi dari helper/source v0.1.143 dengan mock atau parser asli.
- **C — inferensi yang konsisten:** source dapat menghasilkan bentuk yang sama dengan log, tetapi sesi runtime pengguna tidak merekam event penyebabnya.
- **D — belum diketahui:** data yang tidak tersedia dan tidak boleh ditebak.

### 3.2 Batasan log dan konfirmasi runtime

Konfirmasi pengguna setelah audit:

- runtime: **Obsidian Desktop 1.13.x**;
- plugin aktif saat reproduksi: **Open Agent v0.1.143**;
- surface: **lebih dari satu**;
- raw fenced Markdown lengkap: **tidak tersedia**.

Ini memperkuat relevansi matrix Mermaid 11.13.0 sebagai compatibility reference untuk keluarga Obsidian 1.13.x. Nomor patch Obsidian, OS, dan versi Mermaid yang dibaca langsung dari runtime belum tersedia, sehingga mapping changelog tetap reference, bukan fingerprint binary aktual.

Log `/home/user/uploads/obsidian.md-1786616796152.log`:

- SHA-256: `5ccd8dafa4215a73a0620a1a96b16b571353d603eebdbc07c3d79697b62b0b35`;
- tidak memiliki timestamp;
- tidak menyebut versi plugin;
- tidak menyebut versi Obsidian/Electron/Mermaid;
- tidak memuat raw fenced Markdown lengkap;
- tidak memiliki marker `network`, `fetch`, `timeout`, `retry`, `failover`, status HTTP, `[DONE]`, atau `finish_reason`;
- frame `plugin:openagent:242` tidak cukup untuk membedakan Main Chat dari Quick Ask.

Ketiadaan marker network **bukan** bukti bahwa retry tidak terjadi: same-provider retry di `AgentLoop` tidak membuat marker failover, dan debug transport dapat nonaktif. Namun audit tetap tidak menaikkan mekanisme retry menjadi akar runtime yang pasti tanpa raw response atau telemetry.

## 4. Peta pipeline yang diaudit

### 4.1 Request dan provider

`src/agent/providers.ts`:

- `buildBody()` mengirim `model`, `messages`, dan `stream`;
- default settings yang efektif: `temperature: 0.7`, `maxTokens: 4096`, `streaming: true`;
- `max_tokens` dikirim bila `maxTokens > 0`;
- `temperature` dikirim bila `temperature >= 0`;
- stream menambahkan `stream_options: { include_usage: true }`;
- tidak ada parameter atau constraint khusus Mermaid.

`src/agent/systemPrompt.ts` dan `src/quickask/panel.tsx`:

- tidak ada aturan khusus untuk fence Mermaid, komentar own-line, quoting label, atau larangan inline `%%`;
- Quick Ask menggunakan prompt ringkas berbasis Copilot, bukan prompt Main Chat.

### 4.2 Main Chat

Aliran efektif:

1. provider SSE;
2. `AgentLoop.requestWithResilience()`;
3. `events.onToken`;
4. `ChatApp.appendText()` menambahkan token ke turn UI;
5. ketika streaming selesai, UI mengganti plain streaming span menjadi `MarkdownDoc`;
6. `splitMarkdownSegments()` membagi prose/fence;
7. body Mermaid melewati `sanitizeMermaidSrc()`;
8. fence direkonstruksi dan dikirim ke `Obsidian.MarkdownRenderer`;
9. Mermaid bawaan Obsidian mem-parse diagram.

Main Chat menyimpan dua representasi:

- `turnsRef`: representasi UI yang menerima callback token;
- `messagesRef`: transcript wire yang menerima `result.messages` dari attempt sukses.

Keduanya dapat berbeda setelah retry/fallback parsial.

### 4.3 Quick Ask

- token streaming masuk ke `streamText`;
- retry/failover memanggil reset callback sehingga partial stream dibersihkan;
- final answer disimpan dari `result`;
- final answer dirender melalui komponen `Markdown`, **bukan `MarkdownDoc`**;
- akibatnya final Quick Ask tidak melewati segmenter dan `sanitizeMermaidSrc()` khusus Mermaid;
- Insert/Replace memakai content mentah.

### 4.4 Segmenter dan renderer

`src/ui/markdown-segments.ts`:

- dua closed fences yang adjacent tetapi valid dipisahkan dengan benar;
- unclosed fence menjadi satu code segment sampai EOF;
- close fence harus menggunakan char sama, panjang minimal opener, dan tidak boleh memiliki info string;
- line ` ``````mermaid ` di dalam fence tiga backtick bukan close, sehingga tetap menjadi isi diagram;
- premature reopen ` ```mermaid ` di dalam body juga tetap menjadi isi diagram.

`src/ui/components/markdown.tsx`:

- hanya `MarkdownDoc` yang melakukan split dan Mermaid-specific sanitize;
- komponen `Markdown` langsung mengirim hasil preprocessing umum ke Obsidian.

### 4.5 Sanitizer

`src/ui/markdown-preprocess.ts`:

- `sanitizeMermaidSrc()` mengutip beberapa label flowchart yang mengandung kurung/kutip;
- hanya aktif bila source cocok dengan `^\s*(flowchart|graph)\b`;
- komentar atau directive sebelum header membuat seluruh flowchart salvage tidak aktif;
- suffix top-level `; % ...` dipindah ke own-line `%% ...`;
- suffix `; %% ...` sengaja tidak diubah;
- `sanitizeMermaidFences()` memakai regex closed-fence; unclosed fence dibiarkan mentah;
- malformed merged fence masih dapat cocok sebagai satu outer fence, tetapi body invalid tidak diperbaiki.

### 4.6 Vault/editor sinks

| Surface | Data yang ditulis | Perlindungan v0.1.143 |
|---|---|---|
| `/save` | `turnsRef` UI | `sanitizeMermaidFences()` per turn |
| `write_note` execute | args content | `sanitizeMermaidFences()` |
| `write_note` approval preview | args content | **mentah; dapat berbeda dari persisted content** |
| `edit_note` | final replacement | mentah |
| Main Chat Insert | raw text parts | mentah |
| Quick Ask Insert/Replace | final raw answer | mentah |
| cron archive | full output | mentah |
| cron target | output dipotong sampai 4000 char | mentah; clipping dapat memotong fence |

## 5. Hasil parser-version matrix

Parser asli yang diuji: Mermaid **11.4.1**, **11.13.0**, dan **11.16.1** di jsdom. Semua versi memberi hasil identik.

| Fixture | Raw | Setelah sanitizer | Catatan |
|---|---|---|---|
| clean flowchart | PASS | PASS | byte-identical |
| edge caption dengan `(Thought)` | FAIL `PS` | PASS | quoting salvage bekerja |
| top-level `; % komentar` | FAIL `NODE_STRING` | PASS | patch v0.1.143 bekerja |
| top-level `; %% komentar` | FAIL `NODE_STRING` | FAIL `NODE_STRING` | sanitizer tidak berubah |
| own-line comment sebelum header + label berkurung | FAIL `PS` | FAIL `PS` | flowchart gate tidak aktif |
| init directive sebelum header + label berkurung | FAIL `PS` | FAIL `PS` | flowchart gate tidak aktif |
| merged six-backtick + diagram kedua | FAIL `GRAPH` | FAIL `GRAPH` | exact token class direproduksi |

Interpretasi:

- tidak ada fixture audit yang berubah hasil antara 11.4.1, 11.13.0, dan 11.16.1;
- compatibility gap ada di transform/transport/surface coverage, bukan bukti regression parser version;
- konfirmasi Obsidian Desktop 1.13.x membuat 11.13.0 reference paling relevan; nomor patch/OS dan fingerprint parser aktual belum tersedia.

Evidence raw:

- `openagent-v0.1.143-mermaid-parser-matrix-2026-08-14.log`
- SHA-256 `327d7388779b90f15c0809e0237461ef632f733857b3678161d2e56ca638aad3`

## 6. Reproduksi transport/retry

Probe membundel `providers.ts` dan `agentLoop.ts` dari scratch copy source v0.1.143, lalu memakai mocked `ReadableStream`.

### 6.1 EOF tanpa terminator

Stream berisi satu token valid kemudian EOF, tanpa `[DONE]` dan tanpa `finish_reason`:

- callback: `EOF accepted`;
- result content: `EOF accepted`;
- result `finishReason`: `stop`;
- status: diterima sebagai sukses.

### 6.2 JSON SSE malformed

Urutan event: token `A`, satu `data:` JSON malformed, token `B`, lalu EOF:

- callback final: `AB`;
- baris malformed tidak menimbulkan error;
- parsing melanjutkan event sesudahnya.

### 6.3 Timeout setelah partial token lalu retry sukses

Attempt 1 mengirim:

    ```mermaid
    flowchart TD
      A --> A;
    ```

lalu timeout. Attempt 2 mengirim:

    ```mermaid
    graph TD
      A[User] --> B[Agent]
    ```

Hasil source-level:

- fetch calls: `2`;
- UI callbacks: `[OLD, NEW]`;
- UI final mengandung ` ``````mermaid\ngraph TD `;
- transcript internal: hanya diagram `NEW`;
- `uiJoined !== transcript`;
- body hasil segmenter gagal `GRAPH` pada ketiga parser version.

Ini bukan sekadar masalah render: `turnsRef` yang sudah tercampur kemudian dipersistenkan dan menjadi sumber `/save`, sedangkan `messagesRef` berisi attempt sukses. Dengan demikian satu sesi dapat menyimpan dua versi jawaban yang berbeda.

Evidence raw:

- `openagent-v0.1.143-mermaid-transport-probe-2026-08-14.log`
- SHA-256 `d85ec37e4c980bb585639b4eadb98de126334e825e7a715457115409336314ef`

## 7. Temuan dan severity

### OA-MMD-01 — Main Chat retry tidak attempt-atomic

**Severity: High**  
**Bukti:** B; hubungan dengan `GRAPH` runtime = C yang sangat konsisten.

`AgentLoop` memakai callback token yang sama untuk seluruh retry/failover tanpa rollback attempt sebelumnya. Main Chat menambahkan setiap callback ke turn yang sama. Probe menghasilkan bentuk merged six-backtick dan token `GRAPH` yang sama dengan kelas log.

Dampak:

- Mermaid dari dua attempt dapat melebur;
- UI, persisted session, Copy/Insert, dan `/save` dapat berbeda dari transcript wire;
- retry pada teks biasa juga dapat menghasilkan jawaban campuran;
- generic stream failure setelah partial token lalu buffered fallback memiliki divergence lain: test 5d saat ini mempertahankan partial UI, sementara transcript menerima buffered answer penuh.

### OA-MMD-02 — Inline `; %%` tetap invalid di semua jalur sanitizer

**Severity: High**  
**Bukti:** A + B.

Log menunjukkan empat `NODE_STRING` dengan excerpt `--> A; %% Kembali ...`. Parser matrix membuktikan bentuk ini gagal pada ketiga versi dan sanitizer v0.1.143 tidak mengubahnya.

Dampak langsung pada Main Chat final, `/save`, dan `write_note`; lebih luas lagi pada surface yang sama sekali tidak memakai sanitizer.

### OA-MMD-03 — Leading comment/directive mem-bypass flowchart salvage

**Severity: Medium**  
**Bukti:** B; hubungan dengan empat `PS` runtime = C.

`sanitizeMermaidSrc()` hanya mengenali flowchart bila header berada di awal source setelah whitespace. Own-line comment dan init directive yang valid sebelum header membuat sanitizer kembali tanpa label salvage. Fixture lalu tetap gagal `PS`.

Pola `PS` memang ada langsung di log, tetapi raw fenced body tidak tersedia, sehingga audit tidak dapat memastikan apakah leading prefix adalah penyebab runtime aktual.

### OA-MMD-04 — Coverage sanitizer tidak konsisten antar-surface

**Severity: High**  
**Bukti:** source audit langsung + probe helper.

Quick Ask final, insert/replace editor, `edit_note`, dan cron dapat membawa Mermaid mentah ke renderer vault. Main Chat dapat menampilkan diagram yang tampak berhasil karena render-time sanitizer, lalu tombol Insert menyimpan source mentah yang gagal di Live Preview/Reading View.

### OA-MMD-05 — Fence malformed/unclosed tidak memiliki kebijakan canonical bersama

**Severity: Medium**  
**Bukti:** B.

- adjacent valid fences: aman;
- unclosed fence: Main Chat membuat code segment sampai EOF dan merekonstruksi close saat render, tetapi document sanitizer membiarkan source mentah;
- merged six-backtick/premature reopen: tetap satu body Mermaid;
- `/save`/write path dan render path dapat memperlakukan dokumen yang sama secara berbeda.

### OA-MMD-06 — SSE anomaly ditelan tanpa diagnostics atau completeness signal

**Severity: Medium**  
**Bukti:** B; kaitan dengan log = belum terbukti.

Malformed JSON diabaikan. Clean EOF tanpa `[DONE]`/finish reason diperlakukan sebagai successful stop. Perilaku ini kompatibel dengan sebagian provider, tetapi tidak membedakan stream lengkap dari koneksi yang terpotong secara halus.

### OA-MMD-07 — Approval preview `write_note` dapat berbeda dari write aktual

**Severity: Medium**  
**Bukti:** source audit langsung.

`planWrite()` membuat preview dari args mentah. `write_note.execute()` baru menjalankan `sanitizeMermaidFences()`. Untuk Mermaid yang diubah sanitizer, user menyetujui satu diff tetapi plugin menulis diff lain. Ini bertentangan dengan komentar “one source of truth” pada planner.

### OA-MMD-08 — Prompt dan output budget tidak memberi defense-in-depth Mermaid

**Severity: Low**  
**Bukti:** source audit langsung; kaitan dengan log = belum terbukti.

Prompt Main Chat/Quick Ask tidak meminta:

- satu fenced block per diagram;
- komentar hanya own-line `%%`;
- label kompleks dikutip;
- fence ditutup sebelum final answer.

Default `maxTokens: 4096` juga dapat memotong jawaban panjang, tetapi log tidak menunjukkan `finish_reason: length`, sehingga truncation tidak boleh disebut akar kejadian ini.

## 8. Root-cause statement yang aman

Yang **terbukti langsung dari runtime log**:

- Mermaid menerima source invalid dengan token `PS`, `NODE_STRING`, dan `GRAPH`;
- inline `; %%` adalah salah satu source invalid yang terlihat jelas;
- malformed six-backtick + diagram kedua terlihat dalam excerpt `GRAPH`.

Yang **terbukti dari source/probe**:

- sanitizer v0.1.143 tidak memperbaiki inline `; %%`;
- leading comment/directive mem-bypass flowchart salvage;
- Main Chat retry dapat menggabungkan dua fenced answer menjadi source yang menghasilkan `GRAPH`;
- beberapa surface tidak memakai sanitizer;
- SSE malformed/EOF anomalies tidak diberi sinyal error.

Yang **belum boleh dinyatakan pasti**:

- bahwa retry/timeout benar-benar terjadi pada sesi yang menghasilkan log;
- surface mana yang menghasilkan setiap `PS`;
- versi Mermaid yang dibaca langsung dari binary/runtime (changelog 1.13.x mereferensikan 11.13.0, tetapi bukan fingerprint lokal);
- raw fenced response lengkap;
- apakah satu atau beberapa note lama ikut dirender saat startup.

## 9. Compatibility reference

Dokumentasi Mermaid menyatakan komentar harus berada pada baris sendiri, dimulai `%%`, dan teks sampai newline diperlakukan sebagai komentar:

- <https://mermaid.ai/open-source/syntax/flowchart.html>

Referensi Obsidian yang diperiksa:

- Obsidian 1.8.5 memperbarui Mermaid ke 11.4.1: <https://obsidian.md/changelog/2025-02-03-desktop-v1.8.5/>
- Obsidian 1.13.0 memperbarui Mermaid ke 11.13.0: <https://obsidian.md/changelog/2026-05-28-desktop-v1.13.0/>
- changelog 1.13.4 dan 1.13.6 yang diperiksa tidak mencatat upgrade Mermaid setelah 11.13.0.

Pengguna kemudian mengonfirmasi **Obsidian Desktop 1.13.x** dan **Open Agent v0.1.143**. Dengan demikian 11.13.0 adalah reference yang paling relevan dari changelog publik yang diperiksa, tetapi nomor patch Obsidian dan fingerprint Mermaid aktual masih tidak tersedia.

## 10. Workaround sementara tanpa patch

Untuk Mermaid yang masih dipakai di v0.1.143:

1. ubah inline comment:

       A --> B; %% komentar

   menjadi:

       A --> B;
       %% komentar

2. kutip label/caption yang memiliki kurung:

       A -->|"Perencanaan & Penalaran (Thought)"| B

3. letakkan `flowchart`/`graph` sebagai significant line pertama bila mengandalkan sanitizer v0.1.143;
4. pastikan tiap fence ditutup dan fence berikutnya mulai pada baris baru;
5. bila jawaban terlihat mengandung dua diagram yang menempel setelah reconnect/retry, jangan Insert atau `/save` sebelum memisahkan fence secara manual.

## 11. Data runtime: diterima dan tersisa

Sudah diterima:

1. Open Agent aktif: **v0.1.143**;
2. runtime: **Obsidian Desktop 1.13.x**;
3. error terjadi pada **lebih dari satu surface**;
4. raw fenced Markdown terbaru **tidak tersedia**.

Data tambahan bersifat membantu tetapi tidak memblokir kesimpulan source-level:

- nomor patch Obsidian 1.13.x dan OS;
- pemetaan surface per token (`PS`, `NODE_STRING`, `GRAPH`);
- bila error dapat direproduksi lagi, raw block lengkap dan log bertimestamp dengan Debug Mode aktif.

Karena raw lama tidak tersedia, hubungan retry → `GRAPH` harus tetap diklasifikasikan sebagai reproduksi mekanisme yang sangat konsisten, bukan atribusi historis yang pasti.

## 12. Deliverable terkait

- Regression matrix: `openagent-v0.1.143-mermaid-regression-matrix-2026-08-14.md`
- Patch plan: `openagent-v0.1.143-to-v0.1.144-mermaid-patch-plan-2026-08-14.md`
- Parser evidence: `openagent-v0.1.143-mermaid-parser-matrix-2026-08-14.log`
- Transport evidence: `openagent-v0.1.143-mermaid-transport-probe-2026-08-14.log`
