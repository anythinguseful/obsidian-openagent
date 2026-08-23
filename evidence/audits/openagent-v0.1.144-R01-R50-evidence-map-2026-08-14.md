# Open Agent v0.1.144 — Pemetaan Evidence R01–R50

**Tanggal:** 2026-08-14  
**Candidate:** `openagent` 0.1.144  
**Baseline protected:** v0.1.143, tetap 192 file dan aggregate checksum 23/23 PASS  
**Hasil:** **R01–R50 terpetakan; 45 direct executable, 5 integration/shared-boundary; 0 exception.**

## Legenda

- **Direct** — assertion executable memanggil implementasi yang menjadi target dan memeriksa hasilnya.
- **Integration** — kombinasi assertion executable pada shared canonical boundary dengan browser/action atau persisted sink nyata. Ini bukan klaim berbasis inspeksi source saja.
- **Exception** — pengecualian eksplisit. Tidak ada exception pada candidate ini.

Log utama:

- `openagent-v0.1.144-final-npm-test-2026-08-14.log`
- `openagent-v0.1.144-final-mermaid-parser-matrix-2026-08-14.log`
- `openagent-v0.1.144-final-main-chat-preview-2026-08-14.log`
- `openagent-v0.1.144-final-pdf-security-2026-08-14.log`
- `openagent-v0.1.144-final-settings-preview-2026-08-14.log`

## R01–R12 — Normalizer dan parser

Semua fixture parser memeriksa tiga kondisi: exact canonical bytes, idempotence, dan parser acceptance pada Mermaid **11.4.1**, **11.13.0**, dan **11.16.1/current**. Hasil akhir **36/36 PASS**.

| ID | Kelas | Assertion/evidence executable | Hasil |
|---|---|---|---|
| R01 | Direct | `scripts/verify-mermaid-parsers.mjs` fixture clean flowchart; exact + idempotent + parse pada 3 parser. | PASS |
| R02 | Direct | Parser fixture raw parenthesized label/caption; hanya interior yang perlu dikutip. | PASS |
| R03 | Direct | Parser fixture exact `A --> B; % komentar`; berubah menjadi statement + own-line `%%`. | PASS |
| R04 | Direct | Parser fixture exact `A --> B; %% komentar`; payload dipertahankan dan tidak menjadi satu-percent. | PASS |
| R05 | Direct | Parser fixture leading blank/comment preamble; prefix tetap dan body disanitasi. | PASS |
| R06 | Direct | Parser fixture init directive preamble; directive tetap dan body disanitasi. | PASS |
| R07 | Direct | Parser fixture quoted node label berisi literal `; %` dan `; %%`; byte-identical. | PASS |
| R08 | Direct | Parser fixture quoted edge caption berisi literal `; %` dan `; %%`; byte-identical. | PASS |
| R09 | Direct | Parser fixture CRLF; exact expected mempertahankan CRLF dan indentasi. | PASS |
| R10 | Direct | Parser fixture `sequenceDiagram` dan `classDiagram`; output exact dan parser-specific PASS pada 3 versi. | PASS |
| R11 | Direct | `sanitizeMermaidSrc(canonical) === canonical` dijalankan untuk seluruh 36 parser rows. | PASS |
| R12 | Direct | Parser fixture comment payload `50% user's 🚀 payload`; exact payload utuh pada 3 parser. | PASS |

Evidence source: `scripts/verify-mermaid-parsers.mjs`; immutable log: `openagent-v0.1.144-final-mermaid-parser-matrix-2026-08-14.log`.

## R13–R20 — Fence/document policy

| ID | Kelas | Assertion/evidence executable | Hasil |
|---|---|---|---|
| R13 | Direct | `test/markdown.test.cjs`: adjacent Mermaid fences tetap dua segment dan keduanya canonical. | PASS |
| R14 | Direct | Mixed backtick/tilde fences mempertahankan delimiter asli. | PASS |
| R15 | Direct | Non-Mermaid fence byte-identical. | PASS |
| R16 | Direct | Merged retry boundary ditangani deterministic fail-closed sebagai text, bukan diagram executable. | PASS |
| R17 | Direct | Premature Mermaid reopen tidak dianggap diagram valid; canonical output diawali text fence. | PASS |
| R18 | Direct | Unclosed Mermaid memakai satu canonical text-and-close policy; sink tools juga memverifikasi persisted fail-closed bytes. | PASS |
| R19 | Direct | Four-backtick opener mempertahankan matching closer dan body yang benar. | PASS |
| R20 | Direct | `clipMarkdownFenceSafe()` diuji untuk cut di dalam fence, complete fence sebelum cut, zero/tiny hard cap, dan marker di dalam batas. | PASS |

Evidence source: `test/markdown.test.cjs`, `test/tools.test.cjs`; log: `openagent-v0.1.144-final-npm-test-2026-08-14.log`.

## R21–R30 — Attempt-atomic transport

| ID | Kelas | Assertion/evidence executable | Hasil |
|---|---|---|---|
| R21 | Direct | `test/agent-loop.test.cjs`: timeout setelah partial `OLD`, retry `NEW`; UI dan transcript hanya `NEW`; lifecycle discard/start observable. | PASS |
| R22 | Direct | Dua attempt Mermaid tidak pernah menyatu menjadi ``````mermaid`; final retry terisolasi. | PASS |
| R23 | Direct | `test/provider-stream.test.cjs`: read/protocol failure setelah partial memanggil reset lalu buffered replacement lengkap tepat sekali. | PASS |
| R24 | Direct | Failed-attempt reasoning dibuang; reasoning dari attempt sukses tetap. | PASS |
| R25 | Direct | Pending tool-call card dari failed attempt dibuang. | PASS |
| R26 | Direct | Retry pada iteration kedua hanya rollback iteration aktif; committed tool round-trip iteration pertama tetap urut. | PASS |
| R27 | Direct | Bila semua attempt gagal, tidak ada partial yang tersisa sebagai successful assistant content; semua failed attempt mendapat discard lifecycle. | PASS |
| R28 | Direct | Primary partial dibuang sebelum satu failover answer; UI/transcript hanya `FALLBACK-ONLY`. | PASS |
| R29 | Direct | `createAttemptResetGate()` memberi tepat satu reset per discarded Quick Ask attempt; real browser Quick Ask juga memverifikasi tidak ada `PARSIALHASIL`. | PASS |
| R30 | Direct | Session/wire result setelah retry sama dengan successful UI answer dan tidak memuat `OLD`. | PASS |

Evidence source: `test/agent-loop.test.cjs`, `test/provider-stream.test.cjs`, lane `[qask]` pada full real preview.

## R31–R38 — SSE protocol dan observability

| ID | Kelas | Assertion/evidence executable | Hasil |
|---|---|---|---|
| R31 | Direct | Valid `[DONE]` terminal; content sukses, `sawDone=true`, trailing event tidak diproses. | PASS |
| R32 | Direct | EOF tanpa `[DONE]` tetapi dengan finish reason diterima; `sawFinishReason=true`, bukan anomalous EOF. | PASS |
| R33 | Direct | EOF tanpa completion marker tetap compatible tetapi `eofWithoutCompletion=true`; keputusan tidak diam-diam. | PASS |
| R34 | Direct | Malformed JSON sebelum token memilih buffered fallback deterministically; anomaly count terlihat dan reset tidak sia-sia. | PASS |
| R35 | Direct | Malformed JSON setelah partial mereset whole attempt sebelum replacement; diagnostics tetap observable. | PASS |
| R36 | Direct | Final SSE line tanpa newline tetap diproses dan menghasilkan finish reason. | PASS |
| R37 | Direct | UTF-8 emoji yang terpotong lintas tiga chunks direkonstruksi tanpa replacement character. | PASS |
| R38 | Direct | `[DONE]` diikuti garbage/data valid diabaikan deterministically; event count stabil. | PASS |

Security assertion yang menyertai R35: diagnostic debug log hanya memuat metadata dan tidak memuat API key, raw malformed wire, partial content, atau replacement content.

Evidence source: `test/provider-stream.test.cjs`; log: `openagent-v0.1.144-final-npm-test-2026-08-14.log`.

## R39–R50 — Surface parity

| ID | Kelas | Assertion/evidence executable | Hasil |
|---|---|---|---|
| R39 | Direct | Full browser lane `[md]` mengirim hostile Mermaid melalui Main Chat nyata; `code.language-mermaid` mempertahankan leading comment/init directive/payload, mengutip label, dan memindahkan exact `; %%` ke own-line comment. | PASS |
| R40 | Direct | Full browser lane `[qask]` mengirim fixture hostile dalam dua stream tokens melalui Quick Ask nyata; final DOM canonical dan tidak menyisakan inline `; %%`. | PASS |
| R41 | Integration | Main Chat commit boundary canonical diuji pada R39; action Insert dan Copy membaca committed text serta melewati canonical boundary yang sama. Browser Chat action framework aktif; smoke gate mengunci wiring action-to-boundary. | PASS |
| R42 | Integration | Quick Ask final canonical boundary diuji pada R40; CM6 Insert action dieksekusi dalam real `[qask]` lane dan handler menerapkan boundary yang sama sebelum dispatch. | PASS |
| R43 | Integration | Quick Ask final canonical boundary diuji pada R40; CM6 ReplaceGuard/Replace dieksekusi dalam real `[qask]` lane dan handler menerapkan boundary yang sama sebelum replace. | PASS |
| R44 | Integration | Real browser lane `[slash2]` menjalankan `/save` dan memeriksa vault Markdown; exact comment/preamble behavior juga diuji direct oleh normalizer sebelum sink. Prose/non-Mermaid preservation berada pada R15. | PASS |
| R45 | Direct | `test/tools.test.cjs`: exact approval planner kemudian real `write_note` executor; create dan append persisted bytes sama dengan `preview.proposed`. | PASS |
| R46 | Integration | Real `write_note` executor menguji create/overwrite/append, exact `; %%`, unclosed fail-closed, clean byte-identity, dan canonical parenthesized labels; parser acceptance canonical fixtures dibuktikan oleh 36/36 matrix. | PASS |
| R47 | Direct | `planEdit()` dan real `edit_note` executor menghasilkan final persisted note byte-identical dengan `preview.proposed`. | PASS |
| R48 | Direct | `prepareCronOutput()` menghasilkan full canonical archive bytes; short archive/target/chain berbagi satu canonical boundary. | PASS |
| R49 | Direct | Target hard cap 4000 dan chain cap diuji; cut fence dihilangkan utuh, marker berada dalam cap, dan tidak ada partial Mermaid fence. | PASS |
| R50 | Direct | Seed legacy note `legacy-untouched.md` tetap byte-identical setelah unrelated plugin/tool activity. | PASS |

Catatan integrasi R41–R44/R46: klasifikasi ini sengaja tidak disebut “direct” karena hostile fixture dan action/sink assertion berada pada dua executable layers yang berbagi canonical boundary. Tidak ada acceptance criterion yang dikecualikan; source-string smoke hanya guard wiring tambahan, bukan satu-satunya evidence.

## Gate non-R yang terkait acceptance

| Gate | Evidence | Hasil |
|---|---|---:|
| Configured TypeScript | `openagent-v0.1.144-final-typecheck-2026-08-14.log` | PASS |
| Production build | `openagent-v0.1.144-final-build-2026-08-14.log` | PASS |
| Full serial npm test | `openagent-v0.1.144-final-npm-test-2026-08-14.log` | PASS |
| Documentation audit | `openagent-v0.1.144-final-docs-2026-08-14.log` | PASS, 18/18 |
| Mermaid parser compatibility | final parser matrix log | PASS, 36/36 |
| PDF-security browser | final PDF log | PASS, 49 checks |
| Full Main Chat/Quick Ask preview | final main-chat preview log | PASS, R39/R40 included |
| Settings real preview | final settings preview log | PASS, 13 tabs, 37 probe lines, 0 `fixed:false` |
| Prompt defense-in-depth | `test/system-prompt.test.cjs` executes assembled prompt check; source normalizer remains authoritative boundary. | PASS |
| Protected v0.1.143 | `openagent-v0.1.144-protected-v0.1.143-integrity-2026-08-14.log` | PASS, 192 files; 23/23 aggregate |

Clean-source inventory, ZIP structure, release manifest, and aggregate checksum gates dicatat terpisah setelah packaging agar evidence merepresentasikan artifact final, bukan working tree.
