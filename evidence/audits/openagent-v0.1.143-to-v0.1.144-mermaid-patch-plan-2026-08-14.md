# Open Agent — Patch Plan Mermaid v0.1.144

**Disusun:** 2026-08-14  
**Input:** audit read-only protected v0.1.143  
**Status:** **rencana saja; belum disetujui untuk coding**  
**Runtime terkonfirmasi:** Obsidian Desktop 1.13.x + Open Agent v0.1.143; lebih dari satu surface; raw fenced block tidak tersedia.

## 1. Tujuan patch

v0.1.144 harus menyelesaikan empat prioritas tanpa menimpa v0.1.143:

1. membuat streaming/retry Main Chat **attempt-atomic**;
2. memperbaiki exact inline `; %%` dan leading preamble tanpa menghapus komentar;
3. menyamakan Mermaid policy di Chat, Quick Ask, Insert/Replace, `/save`, write/edit tools, dan cron;
4. menjamin approval preview byte-identical dengan content yang benar-benar ditulis.

Hardening SSE/fence dan prompt menjadi lapisan tambahan, bukan pengganti fix transport dan sanitizer.

## 2. Guardrails wajib

- Jangan mengubah file apa pun di protected v0.1.143.
- Setelah approval, buat working copy baru dari verified clean source v0.1.143.
- Jangan menimpa ZIP, checksum, manifest, report, screenshot, atau evidence v0.1.143.
- Jangan melakukan global rewrite pada vault user atau note lama.
- Jangan menghapus komentar Mermaid; pindahkan suffix menjadi own-line `%%` dengan payload utuh.
- Jangan mengganti seluruh parser Mermaid atau membundle runtime Mermaid ke plugin hanya untuk menutup fixture ini.
- Jangan mengandalkan prompt sebagai satu-satunya perbaikan.
- Jangan menjalankan upgrade dependency besar, `npm audit fix --force`, atau perubahan unrelated.
- Setiap transform harus narrow, idempotent, dan menjaga non-Mermaid/prose.

## 3. Prioritas

### P0 — blocker release

- OA-MMD-01: attempt-atomic retry/fallback Main Chat.
- OA-MMD-02: inline `; %%` menjadi own-line comment.
- OA-MMD-04: sanitizer parity di surface yang dapat merender/menulis Markdown.
- OA-MMD-07: preview/write parity.

### P1 — hardening wajib sebelum final

- OA-MMD-03: flowchart detection setelah comment/directive preamble.
- OA-MMD-05: shared structural fence policy.
- OA-MMD-06: SSE anomaly diagnostics/completeness policy.

### P2 — defense-in-depth

- OA-MMD-08: instruksi Mermaid singkat pada prompt.

## 4. Tahap implementasi

## Phase 0 — Preserve dan buat patch workspace

Setelah approval:

1. verifikasi ulang `/home/user/releases/v0.1.143/obsidian-openagent-v0.1.143-clean-source.manifest.sha256`;
2. salin protected source ke working directory baru bernama v0.1.144;
3. pastikan `.git`/cache/node_modules lama tidak ikut sebagai release content;
4. catat pre-change manifest working copy;
5. ubah versi hanya di copy v0.1.144 saat implementation gate siap;
6. jangan menyentuh installable/source ZIP v0.1.143.

## Phase 1 — Tambahkan failing regression tests lebih dulu

Tambahkan fixture dari regression matrix R01–R50, terutama:

- exact `PS` log shape;
- exact `; %% Kembali ke Input/Lingkungan`;
- leading own-line comment;
- leading init directive;
- exact six-backtick body yang menghasilkan `GRAPH`;
- timeout `OLD` → retry `NEW`;
- partial stream → buffered full answer;
- Quick Ask/Main Insert/write/edit/cron parity;
- write preview sama dengan persisted bytes.

Test harus menguji behavior, bukan hanya `source.includes(...)`.

## Phase 2 — Attempt-atomic stream transaction

### 2.1 Contract baru

Tambahkan lifecycle internal ke `AgentLoopEvents`/stream callbacks:

- `onAttemptStart(meta)`;
- `onAttemptDiscard(meta)`;
- `onAttemptCommit(meta)`;
- callback provider-level untuk meminta discard sebelum internal buffered fallback setelah partial stream.

Metadata minimal:

- iteration;
- attempt number;
- target/provider-model identifier yang tidak mengandung credential;
- reason category (`timeout`, `http`, `network`, `stream-protocol`, `buffered-fallback`, `failover`).

### 2.2 Main Chat checkpoint

Di `ChatApp`:

1. saat `onAttemptStart`, deep-snapshot parts untuk assistant turn saat itu;
2. snapshot dibuat **per current model attempt**, sehingga successful tool iteration sebelumnya tetap ada;
3. saat `onAttemptDiscard`, pulihkan snapshot dan bersihkan reasoning/tool-call pending milik attempt gagal;
4. saat `onAttemptCommit`, hapus checkpoint tanpa mengubah hasil sukses;
5. persistence hanya dilakukan setelah attempt sukses sudah committed.

Checkpoint tidak boleh me-reset seluruh conversation atau hasil iteration sebelumnya.

### 2.3 Retry/failover

Di `AgentLoop.requestWithResilience()`:

- panggil start sebelum setiap call;
- pada exception, discard sebelum backoff/retry/failover atau final throw;
- next attempt mulai dari checkpoint bersih;
- same-provider retry dan fallback provider memakai aturan yang sama.

### 2.4 Internal streaming → buffered fallback

Di `chatCompletion()`:

- bila stream gagal sebelum token, buffered fallback dapat memancarkan answer seperti saat ini;
- bila stream gagal setelah content/reasoning/tool-call parsial:
  1. minta UI discard partial;
  2. jalankan buffered request;
  3. pancarkan buffered answer penuh tepat satu kali;
- bila buffered fallback juga gagal, outer retry melakukan discard idempotent.

Current Test 5d yang mengharuskan UI mempertahankan partial harus diganti: target baru adalah UI/transcript sama-sama menerima buffered answer penuh.

### 2.5 Quick Ask

Quick Ask sudah mereset partial pada outer retry. Integrasikan provider-level partial→buffered reset tanpa menghasilkan double reset atau flicker. Pertahankan assertion bahwa final display selalu berasal dari successful result.

### 2.6 Acceptance inti

Exact witness:

- attempt 1: closed Mermaid `OLD`, lalu timeout;
- attempt 2: closed Mermaid `NEW`;
- UI = `NEW`;
- transcript = `NEW`;
- persisted session = `NEW`;
- tidak ada ` ``````mermaid `;
- parser final PASS.

## Phase 3 — Canonical Mermaid normalizer

### 3.1 Preamble-aware flowchart detection

Ganti gate “header harus di byte awal” dengan scanner significant-line:

1. pertahankan BOM/blank lines;
2. lewati own-line `%% ...` comments;
3. lewati Mermaid directive line `%%{...}%%` tanpa mengubahnya;
4. tentukan diagram type dari significant line pertama;
5. jalankan flowchart-only label/comment salvage hanya bila type adalah `flowchart` atau `graph`.

Jangan mencari kata `graph` secara bebas di seluruh body karena dapat muncul sebagai text/comment.

### 3.2 Single dan double percent suffix

Pada statement-level semicolon di luar quoted string, shape delimiters, config object, dan pipe caption:

- `statement; % payload` → `statement;` + newline + `%% payload`;
- `statement; %% payload` → hasil yang sama;
- comment payload harus utuh;
- indentasi dan CRLF dipertahankan;
- own-line `%%` yang sudah valid byte-identical;
- `%` di label/string/config/caption tidak disentuh;
- triple/ambiguous percent tidak ditebak tanpa fixture dan policy eksplisit.

### 3.3 Idempotence

Wajib:

- clean diagram byte-identical;
- output kedua sama dengan output pertama;
- non-flowchart tidak terkena flowchart-specific rewrite;
- comment tidak hilang atau terduplikasi.

## Phase 4 — Shared structural fence walker

`sanitizeMermaidFences()` regex dan `splitMarkdownSegments()` saat ini memiliki model fence yang berbeda. Buat shared pure line-based walker yang mengembalikan:

- delimiter char dan panjang;
- info string/language;
- body boundaries;
- closed/unclosed status;
- raw source boundaries agar byte preservation dapat diuji.

Gunakan walker yang sama untuk:

- Main Chat `MarkdownDoc`;
- document sanitizer untuk `/save` dan tools;
- Quick Ask final;
- Insert/Replace normalization;
- cron output/clipping.

### 4.1 Kebijakan malformed/unclosed

Rekomendasi aman:

- selama streaming: tetap plain text, jangan parse Mermaid parsial;
- setelah completion: hanya body dengan fence structurally closed dan tanpa nested/reopen anomaly yang dikirim sebagai Mermaid executable;
- unclosed atau malformed body ditampilkan sebagai code fallback dengan diagnostic kecil, bukan dipaksa ke Obsidian Mermaid;
- write/insert path tidak boleh menulis fence yang membuat sisa note ikut tertelan; gunakan deterministic safe fallback atau tolak action dengan pesan yang jelas;
- jangan melakukan broad heuristic repair terhadap note lama.

Untuk legacy exact merged-six-backtick:

- prevention melalui attempt rollback adalah fix utama;
- renderer dapat mendeteksi signature dan memilih code fallback agar console tidak meledak;
- pemisahan otomatis menjadi dua diagram hanya boleh dilakukan bila fixture dan UX disetujui, karena itu mempertahankan kedua attempt dan dapat menyesatkan;
- jangan memigrasi vault/session lama diam-diam.

## Phase 5 — Surface parity

### 5.1 Quick Ask final

Gunakan Mermaid-aware `MarkdownDoc` atau shared equivalent, bukan direct `Markdown` untuk final answer. Pastikan prose, wikilink, code block, dan selection UX tidak regress.

### 5.2 Copy/Insert/Replace

Tentukan satu policy canonical answer:

- display Mermaid;
- Copy;
- Main Chat Insert;
- Quick Ask Insert/Replace;
- `/save`.

Semua harus memakai source canonical yang sama atau memiliki perbedaan yang eksplisit dan diuji. Rekomendasi: normalize completed Markdown tepat sebelum consumer action, bukan selama token streaming.

### 5.3 `write_note`

Pindahkan Mermaid normalization ke shared write planner/input preparation sehingga:

- preview `proposed` sudah canonical;
- execute menulis tepat `proposed` yang disetujui;
- create/overwrite/append konsisten;
- stale-file check tetap berlaku;
- return character count berdasarkan bytes/string yang benar-benar ditulis.

### 5.4 `edit_note`

Pilihan rekomendasi:

1. apply exact edit;
2. bentuk full proposed Markdown;
3. normalize Mermaid pada proposed result;
4. tampilkan seluruh perubahan tambahan di approval preview;
5. execute menulis proposed yang sama setelah stale check.

Ini boleh mengubah Mermaid lain dalam note hanya bila perubahan terlihat di preview dan disetujui. Alternatif modified-range-only lebih sempit tetapi membutuhkan fence-context mapping dan test lebih kompleks.

### 5.5 Cron

- normalize full output sebelum archive write;
- target 4000-char summary harus fence-aware;
- bila limit memotong sebuah Mermaid block, jangan tulis half diagram: omit block dari compact target dan arahkan ke archive;
- archive menyimpan full canonical output;
- prompt dan metadata task tidak diperlakukan sebagai model output Mermaid kecuali berada dalam scope yang memang dirender.

## Phase 6 — SSE completeness dan observability

### 6.1 Parser counters

Track per request tanpa merekam content sensitif:

- jumlah SSE data events;
- jumlah malformed JSON events;
- saw `[DONE]`;
- saw explicit `finish_reason`;
- byte/chunk count;
- timeout/abort/error category;
- attempt discarded/committed.

### 6.2 Compatibility policy

Jangan mewajibkan `[DONE]` untuk semua provider secara buta. Gunakan policy:

- explicit finish reason atau `[DONE]`: complete;
- EOF tanpa keduanya: compatibility completion dengan diagnostic, atau retry sesuai provider capability;
- malformed event: jangan diam-diam sukses tanpa counter/diagnostic;
- bila anomaly terjadi setelah partial data dan policy memutus retry, discard seluruh attempt dulu.

### 6.3 Debug logging

Saat Debug Mode aktif, log metadata saja. Jangan log API key, authorization header, full prompt, attachment, vault content, atau raw assistant response.

## Phase 7 — Prompt defense-in-depth

Tambahkan instruksi singkat yang sama secara semantik pada Main Chat dan Quick Ask, misalnya:

- emit setiap diagram dalam satu closed `mermaid` fence;
- komentar harus berada pada baris sendiri dan diawali `%%`;
- quote label/caption kompleks yang mengandung punctuation/parentheses;
- jangan menempelkan closing dan opening fence pada baris yang sama.

Prompt tidak menggantikan sanitizer, transport transaction, atau sink parity.

## 5. File yang kemungkinan berubah

Hanya di copy v0.1.144:

- `src/agent/providers.ts`
- `src/agent/agentLoop.ts`
- `src/agent/resilience.ts` bila lifecycle disatukan
- `src/agent/systemPrompt.ts`
- `src/agent/writePreview.ts`
- `src/agent/tools.ts`
- `src/ui/ChatApp.tsx`
- `src/ui/markdown-preprocess.ts`
- `src/ui/markdown-segments.ts` atau shared fence module baru
- `src/ui/components/markdown.tsx`
- `src/quickask/panel.tsx`
- `src/main.ts` untuk Quick Ask runner/cron
- unit/smoke/real-preview tests terkait
- `package.json`, `manifest.json`, `versions.json` hanya untuk version bump/release metadata.

Tidak ada alasan saat ini untuk mengubah protected v0.1.143 atau membundle `mermaid` sebagai production dependency.

## 6. Test strategy

### 6.1 Unit pure

- sanitizer comment/label/preamble/idempotence/CRLF;
- fence walker closed/adjacent/malformed/unclosed;
- write/edit planner parity;
- fence-aware cron clipping.

### 6.2 Transport mocked stream

- timeout after partial;
- retryable HTTP/network after partial;
- generic stream error → buffered fallback;
- failover after partial;
- reasoning/tool-call rollback;
- malformed SSE and clean EOF policy.

### 6.3 Parser matrix

Gunakan 11.4.1 dan 11.13.0 sebagai compatibility references serta current dev parser. Alias packages/probe dependencies boleh tetap ephemeral; jangan menambah tiga runtime Mermaid ke installable plugin.

### 6.4 Surface integration

- Main Chat rendered diagram;
- Quick Ask final diagram;
- Insert/Replace bytes;
- `/save` output;
- `write_note` preview/execute create-overwrite-append;
- `edit_note` preview/execute;
- cron archive/target.

### 6.5 Real preview

Tambahkan witness visual hanya setelah behavioral tests lulus. Regression tidak boleh bergantung hanya pada screenshot atau transition timing.

## 7. Release gates

Sebelum membuat artifact v0.1.144:

1. configured typecheck PASS;
2. unit tests PASS;
3. smoke tests PASS;
4. agent loop/provider/quick ask/cron/tools tests PASS;
5. parser matrix target PASS;
6. real-preview gates PASS;
7. exact retry witness menunjukkan no merged fence;
8. preview/write byte parity PASS;
9. clean build/release PASS;
10. clean-source inventory tidak berisi cache, `node_modules`, `.git`, credential, atau transient probe;
11. source manifest v0.1.144 dibuat dan diverifikasi;
12. installable ZIP structure diverifikasi;
13. aggregate checksum diverifikasi;
14. protected v0.1.143 diverifikasi ulang tetap 192/192 OK.

## 8. Stop/rollback conditions

Hentikan patch bila:

- valid Mermaid lama berubah tanpa alasan;
- comment payload hilang/terpotong;
- non-Mermaid/prose berubah;
- retry menghapus successful iteration/tool output sebelumnya;
- Quick Ask mengalami duplicate reset atau final blank;
- approval preview tidak sama dengan write;
- cron masih dapat menulis partial fence;
- patch membutuhkan global migration vault tanpa persetujuan;
- protected v0.1.143 berubah.

Rollback dilakukan dengan membuang working copy v0.1.144 dan kembali ke protected v0.1.143; artifact lama tidak disentuh.

## 9. Estimasi urutan commit lokal

Jika coding disetujui, pisahkan perubahan agar dapat direview/rollback:

1. `test: pin mermaid failures and attempt divergence`
2. `fix: make model attempts atomic across retry and fallback`
3. `fix: normalize mermaid comments after valid preambles`
4. `fix: share fence policy across render and write surfaces`
5. `fix: align write previews and persisted markdown`
6. `fix: make cron markdown clipping fence-aware`
7. `chore: add stream diagnostics and mermaid prompt guidance`
8. `release: v0.1.144`

Commit/push ke GitHub tetap di luar Arena dan dapat dilakukan pengguna melalui GitHub Desktop bila nanti diinginkan.

## 10. Approval boundary

Belum ada coding atau release v0.1.144. Runtime utama sudah dikonfirmasi, sedangkan raw fenced block tidak tersedia. Langkah implementasi hanya boleh dimulai setelah pengguna menyetujui patch plan ini; nomor patch Obsidian/OS atau reproduksi raw berikutnya membantu diagnostics tetapi tidak wajib untuk memulai source-level fix yang sudah teruji.
