---
title: "Studi: Memory & Context engine (Hindsight-style, plugin-native, tanpa Docker/MCP)"
type: study
status: done
date: 2026-08-21
tags: [openagent, memory, context, hindsight, mem0, letta, zep, study]
---

# Studi: Memory & Context engine (Hindsight-style, plugin-native)

## Summary

Owner mau menaikkan memory & context Open Agent dengan meniru Hindsight, tapi
**tanpa Docker dan tanpa MCP** — semuanya built-in ke plugin, memakai LLM
model utama (+ opsional model embedding) di mesin lokal.

Sumber yang diperiksa langsung (bukan dari ingatan):

- **Hermes Desktop/CLI** — `agent/memory_provider.py`, `agent/memory_manager.py`,
  `agent/context_engine.py`, `agent/context_compressor.py`,
  `plugins/memory/hindsight/*` (plugin Hindsight RESMI Hermes),
  `plugins/memory/honcho/*`, `hermes_cli/config_defaults.py`.
- **Hindsight upstream** — `README.md` + `CLAUDE.md` + `hindsight-api-slim/engine`
  (retain/recall/reflect, world/experience/observation/mental model, 4 strategi
  retrieval, cross-encoder rerank, bank, dispositions).
- **Pembanding** — Mem0, Letta/MemGPT, Zep/Graphiti (arsitektur, benchmark).

Kesimpulan inti: **Hindsight utuh tidak bisa ditanam** (server Python +
Postgres + embedding + cross-encoder). Tapi **desainnya bisa ditulis ulang
di dalam plugin** dengan 4 pilar yang semuanya layak dan sudah terbukti di
ekosistem lain. Bagian yang tidak bisa ditiru (mesin vektor/cross-encoder)
diganti LLM re-rank — kualitas memadai untuk skala vault (ratusan–ribuan
fakta), jujur di bawah benchmark Hindsight yang butuh server.

---

## 1. Hermes = anchor paritas kita (yang WAJIB kita tiru bentuknya)

Hermes punya dua lapis pluggable yang persis membagi dua pertanyaan owner:

### 1.1 `MemoryProvider` (memory) — lifecycle baku

Dari `agent/memory_provider.py` + `agent/memory_manager.py`:

```
initialize()            — sambungkan, siapkan resource
system_prompt_block()   — teks statis untuk system prompt
prefetch(query)         — recall LATAR sebelum tiap turn
sync_turn(user, asst)   — tulis ASYNC setelah tiap turn (retain)
get_tool_schemas()      — tool memory yang diekspos ke model
handle_tool_call()      — dispatch tool call
shutdown()
```

Aturan orkestrasi yang penting (kita tiru):

- **Maksimal SATU provider eksternal** — cegah schema bloat (kita: satu engine).
- **`is_trivial_prompt`** — recall DILEWATI untuk sapaan/ack/`/command`
  (`yes, ok, thanks, hi, continue, got it…`). Hemat satu round-trip per turn,
  dan mencegah ingatan basi membelokkan balasan satu kata.
- **Prefetch timeout 8s** (recall tidak boleh blokir turn); sync drain 5s.
- **Recall indicator deterministik** — status baris "recalled N memories"
  yang dihitung dari count, bukan re-parse teks.
- **Sanitasi batas injeksi** (`sanitize_memory_context`): redact secret →
  cap 6000 char → head 4000 + tail 1500 + marker truncation.
  `sanitize_context` membuang tag fence/injeksi dari output provider.

### 1.2 Plugin Hindsight resmi Hermes — blueprint konfigurasi

Hermes SUDAH mengirim plugin Hindsight (`plugins/memory/hindsight/`).
Ini daftar setting-nya, yang jadi template setting kita:

**Recall**
- `recall_budget` low/mid/high
- `recall_prefetch_method` `recall` (fakta mentah) | `reflect` (sintesis LLM)
- `recall_max_tokens` 4096 · `recall_max_input_chars` 800
- `recall_prompt_preamble` (kustom)
- `recall_types` — **default dipersempit ke `observation` saja** (lapisan
  ter-konsolidasi, denser per token) — ini keputusan desain yang bagus.
- `auto_recall` · `recall_sync` (sync=relevan tapi tambah latensi; default
  async: recall turn sebelumnya di-inject turn berikutnya)

**Retain**
- `auto_retain` · `retain_async` · `retain_every_n_turns` (1 = tiap turn)
- `retain_context` (label konteks) · `retain_tags` · `retain_source`

**Format injeksi recall** (verbatim, kita tiru):

```
# Hindsight Memory (persistent cross-session context)
Use this to answer questions about the user and prior sessions.
Do not call tools to look up information that is already present here.

<hasil recall>
```

**System prompt block**: satu baris "Active. Bank: X, budget: Y" + perintah
tool (`recall/reflect/retain`).

### 1.3 `ContextEngine` + `context_compressor` — kita SUDAH 90% setara

- Compressor Hermes: ringkasan berulang (iterative), proteksi head+tail,
  **token-budget tail** (bukan cuma hitungan pesan), budget ringkasan
  proporsional, **tool-output pruning pre-pass** sebelum summarization.
- Kita sudah: rolling summary + token-tail (`v0.1.175 target_ratio`) +
  `protectLastN` + threshold. Yang belum: tool-output pruning pre-pass
  (kecil, bisa menyusul).

---

## 2. Hindsight upstream — apa yang sebenarnya bernilai ditiru

### 2.1 Struktur ingatan (inti "belajar, bukan cuma ingat")

| Lapisan | Makna | Catatan |
|---|---|---|
| **world facts** | fakta dunia ("kompor panas") | evidence mentah |
| **experience facts** | pengalaman agent ("aku pernah salah") | evidence mentah |
| **observations** | keyakinan ter-konsolidasi dari banyak fakta | dedupe + proof count + **refined, bukan overwrite** |
| **mental models** | jawaban tetap atas pertanyaan tetap ("apa preferensi user?") | dibaca = database read, TANPA LLM |

Ini yang benar-benar membedakan Hindsight: fakta tidak menumpuk datar, tapi
**digabung jadi observations yang diperkuat/melemahkan/memperluas**, lalu
mental model = kesimpulan siap-pakai yang dibaca gratis tiap boot.

### 2.2 Tiga operasi

- **retain** — LLM ekstrak fakta + entitas + relasi + waktu → normalisasi →
  index.
- **recall** — 4 strategi paralel: **semantic** (vector) + **BM25** (keyword)
  + **graph** (entitas/temporal/kausal) + **temporal** (rentang waktu) →
  merge (reciprocal rank fusion) → **cross-encoder rerank** → trim ke batas token.
- **reflect** — sintesis dari memori yang ada (bukan dari query).

### 2.3 Yang TIDAK bisa kita tiru (dan penggantinya)

| Komponen Hindsight | Kenapa tidak bisa | Pengganti kita |
|---|---|---|
| Postgres (pg0) + server FastAPI | server terpisah | file JSONL di vault (skala vault cukup) |
| model embedding + cross-encoder (±215 MB + GPU) | model terpisah, memori besar | **LLM re-rank** (model utama); embedding OPSIONAL via `/v1/embeddings` |
| konsolidasi latar (dedicated worker) | proses server | tugas `reflect` diam-diam di sela turn (fire-and-forget) |

Jujur: tanpa embedding + cross-encoder, recall sinonim ("ingatan yang
katanya beda") lebih lemah. Untuk vault pribadi ini selisih kecil; bila
terasa, `embedding-gemma-300m` mengatasinya tanpa arsitektur baru.

---

## 3. Peta pembanding (kenapa memilih tiap bagian dari mana)

### 3.0 Delapan provider memory di Hermes Desktop (semua dibaca dari source)

| Provider | Deployment | Butuh apa | Yang menarik |
|---|---|---|---|
| **ByteRover** | lokal-first (CLI `brv`) + opsional cloud sync | install `curl \| sh` | knowledge tree ber-tier (fuzzy → LLM) |
| **Hindsight** | cloud / local embedded (daemon+Postgres) / local external (Docker) | API key ATAU server | facts→observations→mental models + fusion recall |
| **Honcho** | cloud (OAuth/key) atau self-host | akun/API key | model user dialektik |
| **Holographic** | **lokal murni (SQLite)** | TIDAK ADA | FTS5 + **trust scoring** + entity resolution + **deteksi kontradiksi** + HRR |
| **Mem0** | cloud (API key); OSS bisa self-host | API key (plugin = mode platform) | ekstraksi server-side + dedupe + rerank |
| **OpenViking** | server terpisah `openviking-server` (ByteDance) | server jalan | hierarki filesystem + auto-extract |
| **RetainDB** | cloud saja ($20/bln) | API key | hybrid vector+BM25+rerank, 7 tipe memori |
| **Supermemory** | hosted ATAU self-host server (`npx supermemory local`) | API key / server | profil + semantic search + session ingest |

**Kesimpulan klasifikasi** — dari 8, hanya **1 yang benar-benar bisa
"built-in tanpa apa-apa": Holographic** (SQLite lokal, tanpa server, tanpa
akun, tanpa LLM wajib). Sisanya cloud atau butuh server/daemon/CLI terpisah —
persis yang TIDAK kita mau.

**Bonus penting dari Holographic** (belum ada di desain awal, layak diambil):

- **Trust scoring** — tiap fakta punya nilai 0–1; tool `fact_feedback`
  (helpful/unhelpful) menaikkan/menurunkan; recall mengurutkan
  relevansi × trust. Murah, tanpa LLM.
- **Deteksi kontradiksi** — saat menambah fakta, cari fakta yang bertentangan,
  tampilkan ke LLM untuk `update`/`remove` (reconcile), bukan menumpuk.
  Ini melengkapi typed `add/update/delete` ala Mem0.
- (HRR compositional retrieval — sengaja DILEWAT, butuh vektor/numpy; kita
  sudah punya entity-graph sebagai gantinya.)

### 3.1 Tabel framework (arsitektur besar)

| Framework | Arsitektur | Yang kita ambil | Yang kita buang |
|---|---|---|---|
| **Hindsight** | facts→observations→mental models + fusion recall | model data + fusi recall + format injeksi | Postgres, cross-encoder, server |
| **Holographic** | SQLite + FTS + trust + kontradiksi | trust scoring + deteksi kontradiksi + entity resolution | SQLite (diganti JSONL), HRR |
| **Mem0** | LLM extract → typed add/update/delete + (opsional) graph; scoping user/agent/run | **jalur tulis 2-fase** + operasi typed + scoping per profil | vector store wajib, cloud |
| **Letta/MemGPT** | 3-tier: core (selalu) / recall (baru) / archival (on-demand) + ringkasan rekursif | **context engine**: core vs archival + kompresi (sudah ada) | runtime agent penuh |
| **Zep/Graphiti** | temporal knowledge graph + validity windows (LongMemEval 63.8%) | hanya ide: timestamp + decay pada fakta | graph server (paling berat) |

Catatan benchmark (independen, LongMemEval): Mem0 49%, Zep 63.8%.
Hindsight klaim SOTA tapi pengukuran kita berbeda skala — jangan dijadikan
janji; jadikan "target kualitas arah".

---

## 4. Desain Open Agent (putusan yang saya rekomendasikan)

### 4.1 Bentuk simpanan — file JSONL di vault (no server)

```
<vault>/openagent/openagent-memory/          (folder lama, diperluas)
  MEMORY.md          ← cermin manusia (tetap, write-through)
  USER.md            ← cermin manusia (tetap)
  .engine/facts.jsonl      ← world/experience facts + entitas + timestamp + evidence
  .engine/observations.jsonl ← observations + proof count + freshness
  .engine/models.jsonl     ← mental models (pertanyaan → jawaban tetap)
```

- Satu "bank" per **profil** (Hindsight bank ≈ profil kita) — isolasi data
  profile sudah jadi pola yang kita pakai.
- JSONL = append-only + tahan drift, mudah di-reset, bisa di-diff.
- Angka jujur: bagus untuk ratusan–ribuan fakta; bukan untuk jutaan (vault
  tidak akan sampai sana).

### 4.2 Jalur tulis (retain) — Mem0 2-fase + Hindsight typing + Holographic kontradiksi

1. `sync_turn` setelah tiap turn (gate `retain_every_n_turns`, default 1,
   skip turn trivial).
2. LLM (model utama / aux pin) ekstrak: fakta ber-tipe (world/experience),
   entitas, relasi, timestamp. Prompt ekstraksi meniru Hindsight
   (`retain_mission` kecil).
3. Merge typed: `add` / `update` (fakta sama → refined) / `delete` —
   dedupe by normalized text + entity.
4. **Deteksi kontradiksi** (Holographic): fakta baru vs fakta lama yang
   bertentangan → LLM reconcile (update/remove salah satunya), bukan
   menumpuk dua-duanya.

### 4.3 Jalur baca (recall) — fusion Hindsight minus vector (+ LLM rerank)

Saat turn dimulai (skip trivial):

1. **BM25** — kata kunci di facts/observations (murni TS).
2. **Entity expansion** — fakta yang berbagi entitas dengan query/kandidat.
3. **Temporal** — bobot recency/decay.
4. **Trust** (Holographic) — nilai 0–1 per fakta, naik/turun via umpan balik
   (helpful/unhelpful); skor akhir = relevansi × trust. Tanpa LLM.
5. Gabung → kandidat → **LLM re-rank** pilih yang relevan (budget token).
6. (Opsional, Fase 3) **semantic** via `/v1/embeddings` bila `embeddingModel`
   diisi → ikut fusion sebelum rerank.

Injeksi: format Hindsight (preamble + "Do not call tools…") + sanitasi
(redact + cap 6000) + statusbar indicator "recalled N".

### 4.4 Reflect — konsolidasi diam-diam

Fire-and-forget di sela turn (tidak blokir): LLM gabung fakta sejenis →
observation (proof count + evidence quotes), lalu mental model bila template
pertanyaan cocok. Dibaca = file read murni (tanpa LLM), persis Hindsight.

### 4.5 Context engine — TIDAK diubah besar

Kita sudah setara compressor Hermes (rolling summary + token-tail +
protectLastN). Tambahan opsional kecil: tool-output pruning pre-pass sebelum
summarization.

---

## 5. Kesesuaian spek owner (dihitung, bukan janji)

- Ryzen 9 6900HS (8C/16T), 16 GB RAM, **RTX 3060 Laptop 6 GB VRAM**, Win11.
  (Koreksi owner 2026-08-21: 6 GB, bukan 8 GB — ini versi laptop.)
- `gemma-4-e4b` ≈ 2,5–3 GB VRAM + `embedding-gemma-300m` ≈ 0,3 GB →
  total ±3,5 GB dari **6 GB**. Masih aman, tapi lebih ketat — sisa ±2,5 GB
  untuk sistem/driver.
- Bila terasa ketat: `embedding-gemma-300m` bisa di-offload ke CPU (300M
  param, embedding hanya dipakai saat recall). Atau tanpa embedding sama
  sekali (Fase 1–2 tidak butuh).
- `embedding-gemma-300m`: 300M param, 768 dims, konteks 2048 token,
  ±622 MB unduhan, via endpoint OpenAI-compat `/v1/embeddings` (LM Studio
  sudah mendukung). Untuk fakta vault (pendek), 2K token konteks cukup.
- TANPA embedding pun recall jalan (BM25 + graph + temporal + LLM rerank).
  Embedding hanya menambah "sinonim/parafrase".

---

## 6. Fase implementasi (yang saya usulkan)

| Fase | Isi | Ukuran |
|---|---|---|
| **1** | schema file + retain (LLM extract, typed add/update/delete) + recall (BM25+entity+temporal+LLM rerank) + injeksi + indicator + setting baru di Memory & Context | besar tapi inti |
| **2** | reflect: facts→observations→mental models (background) + baca mental model gratis di boot | sedang |
| **3** (opsional) | semantic recall via `/v1/embeddings` + `embedding-gemma-300m` | kecil |

Setiap fase = ritual gate lengkap (smoke + unit + real-DOM harness + zip test).
MEMORY.md/USER.md tetap jadi cermin yang bisa diedit user (write-through) —
bukan diganti, supaya tidak ada data lama yang "hilang rasa".

## 7. Risiko & divergensi jujur

- Setiap retain/reflect = 1 panggilan LLM ekstra (token + latensi). Mitigasi:
  aux-task pin (model kecil untuk ekstraksi) + retain async + skip turn trivial.
- Recall sync menambah latensi per turn; default async (prefetch turn
  sebelumnya), persis Hermes.
- Kualitas di bawah Hindsight-ber-server (tanpa cross-encoder). Diterima
  sadar — untuk vault ini memadai, dan Fase 3 menutup gap terbesar.
- JSONL di vault = tanggung jawab workspace policy (folder memori sudah
  di-scope ketat; file `.engine/*` ikut aturan yang sama).

## 8. Keputusan menunggu owner

1. Mulai Fase 1 sekarang? (rekomendasi saya: YA — inti dari semuanya)
2. `retain_every_n_turns` default: 1 (setiap turn, paling akurat, token
   lebih boros) atau 3 (hemat)? Rekomendasi saya: **1**, karena user pakai
   lokal (token gratis) dan akurasi lebih penting.
3. Recall default: `recall` (fakta) vs `reflect` (sintesis)? Rekomendasi:
   mulai `recall` (predictable), `reflect` menyusul di Fase 2.
