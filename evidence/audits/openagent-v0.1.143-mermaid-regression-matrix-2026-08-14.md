# Open Agent v0.1.143 — Mermaid Regression Matrix

**Tanggal:** 2026-08-14  
**Status:** audit/read-only; matrix target untuk calon v0.1.144  
**Baseline protected:** `obsidian-openagent-v0.1.143-clean-source`  
**Runtime dikonfirmasi pengguna:** Obsidian Desktop 1.13.x, Open Agent v0.1.143, terjadi pada lebih dari satu surface; raw fenced block tidak tersedia.

Mermaid 11.13.0 adalah compatibility reference paling relevan untuk keluarga Obsidian 1.13.x berdasarkan changelog publik yang diperiksa; nomor patch/OS dan fingerprint parser lokal belum tersedia.

## 1. Legenda

- ✅ aman/berfungsi pada kasus yang diuji
- ⚠️ parsial atau hasil antar-path berbeda
- ❌ gap terkonfirmasi
- Δ approval preview berbeda dari persisted write
- N/A tidak berlaku pada surface tersebut

“Sanitized” berarti transform narrow pada source Mermaid, bukan penghapusan diagram atau komentar.

## 2. Parser compatibility matrix

Hasil ini berasal dari parser asli di jsdom. Semua versi memberi hasil identik.

| ID | Fixture | Mermaid 11.4.1 raw → sanitized | Mermaid 11.13.0 raw → sanitized | Mermaid 11.16.1 raw → sanitized |
|---|---|---|---|---|
| P01 | clean flowchart | PASS → PASS | PASS → PASS | PASS → PASS |
| P02 | edge caption `(Thought)` | `PS` → PASS | `PS` → PASS | `PS` → PASS |
| P03 | top-level `; % comment` | `NODE_STRING` → PASS | `NODE_STRING` → PASS | `NODE_STRING` → PASS |
| P04 | top-level `; %% comment` | `NODE_STRING` → `NODE_STRING` | `NODE_STRING` → `NODE_STRING` | `NODE_STRING` → `NODE_STRING` |
| P05 | leading own-line comment + raw paren label | `PS` → `PS` | `PS` → `PS` | `PS` → `PS` |
| P06 | leading init directive + raw paren label | `PS` → `PS` | `PS` → `PS` | `PS` → `PS` |
| P07 | merged six-backtick + second graph | `GRAPH` → `GRAPH` | `GRAPH` → `GRAPH` | `GRAPH` → `GRAPH` |

Raw evidence: `openagent-v0.1.143-mermaid-parser-matrix-2026-08-14.log`.

## 3. Current surface matrix — v0.1.143

| Fixture/surface | Main Chat final | Quick Ask final | `/save` | `write_note` execute | `write_note` preview | Main Insert | Quick Insert/Replace | `edit_note` | cron archive/target |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S01 clean closed fence | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| S02 header-first raw `(Thought)` | ✅ | ❌ | ✅ | ✅ | Δ | ❌ | ❌ | ❌ | ❌ |
| S03 header-first `; %` | ✅ | ❌ | ✅ | ✅ | Δ | ❌ | ❌ | ❌ | ❌ |
| S04 header-first `; %%` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| S05 leading `%%` + raw `(Thought)` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| S06 leading init directive + raw `(Thought)` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| S07 two adjacent valid fences | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| S08 merged six-backtick/retry fence | ❌ `GRAPH` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| S09 premature reopen inside body | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| S10 unclosed Mermaid fence | ⚠️ synthetic close saat render | ⚠️ direct Markdown behavior | ❌ unchanged | ❌ unchanged | ❌ raw | ❌ raw | ❌ raw | ❌ raw | ❌ raw/clippable |
| S11 non-Mermaid fence/prose | ✅ preserved | ✅ preserved | ✅ preserved | ✅ preserved | ✅ | ✅ raw | ✅ raw | ✅ raw | ✅ raw |

Catatan:

- Main Chat final aman hanya bila `MarkdownDoc` mengenali Mermaid segment dan `sanitizeMermaidSrc()` mengaktifkan flowchart branch.
- `Δ` berarti preview tidak menunjukkan source yang benar-benar ditulis setelah sanitizer execute.
- editor/vault sinks yang mentah dapat gagal kemudian saat Obsidian membuka Live Preview/Reading View.
- cron target memotong output sampai 4000 karakter tanpa fence awareness.

## 4. Current transport/finalization matrix — v0.1.143

| ID | Scenario | UI callback/turn | Transcript result | Current status |
|---|---|---|---|---|
| T01 | normal SSE + finish | sama | sama | ✅ |
| T02 | clean EOF tanpa `[DONE]`/finish reason | content diterima | content + implicit `stop` | ⚠️ tidak ada completeness signal |
| T03 | malformed JSON di antara token valid | malformed event hilang, token lain lanjut | sama dengan callback yang lolos | ⚠️ anomaly diam-diam |
| T04 | stream gagal sebelum token, buffered fallback sukses | buffered answer dipancarkan | buffered answer | ✅ |
| T05 | stream gagal setelah partial, generic buffered fallback sukses | hanya partial lama | buffered answer penuh | ❌ divergence |
| T06 | timeout setelah partial, retry sukses | partial lama + answer retry | hanya answer retry | ❌ divergence/merge |
| T07 | HTTP retryable setelah body parsial lalu retry | berpotensi partial + retry | hanya sukses retry | ❌ tidak attempt-atomic |
| T08 | failover setelah partial | partial primary + fallback; marker ditambah | hanya fallback success | ❌ tidak attempt-atomic |
| T09 | Quick Ask retry/failover | stream partial di-reset | final successful result | ✅ untuk reset attempt |

Raw evidence T02/T03/T06: `openagent-v0.1.143-mermaid-transport-probe-2026-08-14.log`.

## 5. Required regression matrix — target v0.1.144

Semua test di bawah harus menjadi gate; bukan hanya source-string assertion.

### 5.1 Normalizer/parser tests

| ID | Input | Expected canonical result | Parser gate |
|---|---|---|---|
| R01 | clean flowchart | byte-identical | PASS 11.4.1 + 11.13.0 + current dev parser |
| R02 | raw caption/label `(Thought)` | hanya interior yang perlu dikutip | PASS |
| R03 | `A --> B; % komentar` | statement utuh + own-line `%% komentar` | PASS |
| R04 | `A --> B; %% komentar` | statement utuh + own-line `%% komentar`; satu `%` pair, komentar tidak hilang | PASS |
| R05 | leading blank + own-line `%%` + flowchart | prefix byte-identical; body disanitasi | PASS |
| R06 | leading Mermaid init directive + flowchart | directive byte-identical; body disanitasi | PASS |
| R07 | `; %` atau `; %%` di quoted label | byte-identical | PASS bila raw valid |
| R08 | `; %` atau `; %%` di shape/caption/config literal | byte-identical | PASS bila raw valid |
| R09 | CRLF input | CRLF dan indentasi dipertahankan | PASS |
| R10 | `sequenceDiagram`, `classDiagram`, non-flowchart | byte-identical kecuali existing safe subgraph rule yang memang berlaku | parser-specific |
| R11 | sanitizer dijalankan dua kali | hasil kedua byte-identical dengan hasil pertama | PASS |
| R12 | comment text berisi `%`, emoji, apostrof | payload komentar utuh | PASS |

### 5.2 Fence/document tests

| ID | Scenario | Expected target |
|---|---|---|
| R13 | adjacent closed Mermaid fences | dua segment terpisah; keduanya disanitasi |
| R14 | mixed backtick/tilde fences | delimiter asli dipertahankan |
| R15 | non-Mermaid fences | byte-identical |
| R16 | merged retry boundary ` ``````mermaid ` | tidak pernah terbentuk dari retry baru; fixture legacy ditangani dengan kebijakan eksplisit |
| R17 | premature ` ```mermaid ` di body | tidak diam-diam dianggap Mermaid valid; deterministic fallback/repair policy |
| R18 | unclosed Mermaid fence | kebijakan sama pada Chat, Copy/Insert, `/save`, tools, dan cron; tidak ada silent path divergence |
| R19 | opener 4+ backtick | closer matching dan body benar |
| R20 | Markdown panjang dipotong untuk cron target | tidak memotong di tengah fence/diagram |

### 5.3 Attempt-atomic transport tests

| ID | Scenario | Required assertion |
|---|---|---|
| R21 | timeout setelah partial `OLD`, retry `NEW` | UI text = `NEW`; transcript = `NEW`; tidak ada `OLDNEW` |
| R22 | partial closed Mermaid lalu retry opens Mermaid | tidak ada ` ``````mermaid `; parser final PASS |
| R23 | generic stream error setelah partial lalu buffered final | partial di-rollback; buffered final dipancarkan sekali |
| R24 | failed attempt memiliki reasoning | reasoning attempt gagal hilang; reasoning sukses tetap |
| R25 | failed attempt memiliki partial tool-call card | pending card attempt gagal hilang |
| R26 | retry pada iteration kedua setelah tool iteration sukses | hanya data attempt kedua yang rollback; tool/turn iteration pertama tetap |
| R27 | semua retry gagal | tidak ada partial attempt yang dipersistenkan sebagai successful assistant content |
| R28 | failover setelah partial | primary partial rollback; fallback menjadi satu-satunya committed answer |
| R29 | Quick Ask retry | reset tetap tepat satu kali per discarded attempt |
| R30 | session persist setelah retry | persisted turns dan wire transcript merepresentasikan answer sukses yang sama |

### 5.4 SSE protocol tests

| ID | Scenario | Required assertion |
|---|---|---|
| R31 | valid `[DONE]` | success, diagnostics bersih |
| R32 | provider-valid EOF tanpa `[DONE]` tetapi ada finish reason | success menurut compatibility policy |
| R33 | EOF tanpa `[DONE]` dan tanpa finish reason | explicit compatibility decision + diagnostic; tidak implicit tanpa observability |
| R34 | malformed JSON sebelum token apa pun | protocol anomaly terdeteksi; retry/fallback policy deterministic |
| R35 | malformed JSON setelah partial token | whole attempt rollback bila diputus invalid; tidak menyimpan source berlubang |
| R36 | final SSE line tanpa newline | event valid tetap diproses |
| R37 | UTF-8 multibyte terpotong antar-chunk | decoder menyusun ulang byte dengan benar |
| R38 | `[DONE]` diikuti garbage | deterministic ignore/error policy dan diagnostic |

### 5.5 Surface parity tests

| ID | Surface | Required assertion |
|---|---|---|
| R39 | Main Chat final | canonical Mermaid render PASS |
| R40 | Quick Ask final | menggunakan Mermaid-aware path; fixture sama PASS |
| R41 | Main Chat Insert | inserted Markdown sama dengan canonical/copy policy |
| R42 | Quick Ask Insert | canonical output sama |
| R43 | Quick Ask Replace | canonical output sama |
| R44 | `/save` | exported Mermaid canonical; prose/non-Mermaid preserved |
| R45 | `write_note` preview vs execute | preview `proposed` byte-identical dengan content yang ditulis |
| R46 | `write_note` create/overwrite/append | semua mode parity dan parser PASS |
| R47 | `edit_note` preview vs execute | final proposed byte-identical dengan persisted final note |
| R48 | cron archive | full output canonical dan fence-safe |
| R49 | cron target | clipping fence-aware; tidak menulis partial diagram |
| R50 | old vault note yang tidak disentuh plugin | tidak dimutasi otomatis |

## 6. Release acceptance criteria

Calon v0.1.144 hanya dapat dianggap selesai bila:

1. protected v0.1.143 tetap **192/192 OK**;
2. patch dibuat dari copy baru, bukan in-place;
3. R01–R50 memiliki test atau explicit documented exception yang disetujui;
4. parser fixtures inti PASS pada 11.4.1, 11.13.0, dan parser dev current;
5. exact transport witness menghasilkan UI/transcript yang sama dan tidak menghasilkan `GRAPH`;
6. preview `write_note`/`edit_note` byte-identical dengan write aktual;
7. valid existing Mermaid, prose, non-Mermaid fence, CRLF, dan comment payload tidak rusak;
8. build, typecheck, unit, smoke, real-preview, clean-source inventory, ZIP structure, checksum, dan manifest gates lulus;
9. source/archive/installable v0.1.143 tidak ditimpa.
