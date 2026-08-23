---
title: "Open Agent — Backlog / Wacana"
type: backlog
status: active
date: 2026-07-19
tags: [openagent, backlog]
---

# Open Agent — Backlog / Wacana

Ide yang sengaja **ditunda**, bukan dikerjakan sekarang. Tiap entri mencatat: kenapa ditunda, kapan layak diangkat lagi, dan alternatif murahnya. Update sesuai keputusan di percakapan.

> **STATUS: aktif dipakai mulai 2026-07-19.**

## Vector / embeddings index — DITUNDA (2026-07-19)

**Ide**: index semantik vault (embeddings + cosine search) ala Smart Connections/Copilot, untuk pencarian konseptual dan Vault QA.

**Kenapa ditunda**:
- Filosofi Hermes: agent navigasi on-demand (search/list/read) — `search_vault` keyword + tag via `metadataCache` sudah cukup untuk pola agentic; pintarnya di LLM, bukan di index.
- Biaya tinggi: storage vektor ekstra (ikut git), re-index per `vault.on("modify")` = embed ulang tiap ketik, chunking + migrasi skema → failure mode baru. Lompatan kompleksitas terbesar sejauh ini vs manfaatnya.
- Obsidian sudah punya index gratis (MetadataCache: links/tags/headings/frontmatter/backlinks) yang belum dimaksimalkan.

**Kapan layak diangkat (unlock conditions)**:
- Vault 5–10 ribu+ note dan keyword search sering meleset.
- Sering query konseptual ("note tentang X") yang kata kuncinya beda.
- Kebutuhan Vault QA (jawab lintas banyak note) atau memory recall semantik.

**Jalur kalau diangkat nanti**: tetap 100% lokal — LM Studio mendukung `/v1/embeddings`; incremental re-index via vault events; cache vektor per-`{provider, model, mtime}`.

**Alternatif murah yang sudah tercatat (belum dikerjakan, tanpa embeddings)**:
1. Tool `get_backlinks` — `metadataCache.getBacklinksForFile()` → agent menelusuri graf tautan vault.
2. Search multi-kata — `prepareSimpleSearch()` (API Obsidian) alih-alih satu substring.
3. Scoped search — filter `tag:#…`, heading, frontmatter via MetadataCache.

## Unifikasi format Custom headers (Providers vs MCP) — DITUNDA (2026-07-25, dari review copy K2)

**Fakta inkonsistensi**: Providers → "JSON object of extra request headers"; MCP → "KEY=VALUE pairs, one per line". Dua format, dua halaman, fungsi sama.

**Kenapa ditunda**: menyatukan format = perubahan fungsional (parser/validasi), bukan copy. Perlu keputusan owner: format mana yang jadi standar + migrasi data tersimpan.

**Kapan diangkat**: saat owner minta, atau saat runtime MCP live dan header sering disunting — beban dua format baru terasa nyata.

## Hermes auxiliary models + mesin pendukung — PRIORITAS DIPUTUSKAN (2026-07-31)

**Konteks**: bedah paritas halaman Model (studies/model-settings-parity-2026-07-30.md).
Owner memilih main-model pick dulu (v0.1.16, dikirim) lalu bertanya aux resmi
mana yang layak dibangun mesinnya lebih dulu. Urutan yang disarankan (keputusan
final milik owner saat diangkat):

1. **Context manager + `compression` aux + `model_context_length`** — nilai
   terbesar untuk setup owner (model lokal berkonteks kecil; presiden insiden
   LM Studio 180-token). Mesin: rangkum turn lama, protect_last_n, budget
   token per provider; satu arc: engine + knob context length + slot aux
   compression + slot aux vision bisa ikut (bedah item 3).
2. **`web_extract` aux** — `web_fetch` kini mengembalikan teks mentah utuh;
   ekstraksi model murah menghemat konteks (mendukung #1) dan menaikkan
   kualitas jawaban web. Bisa berdiri sendiri atau menempel arc #1.
3. **`title_generation`** — quick win murah: satu call setelah balasan
   pertama → judul sesi bermakna di daftar. Nilai kecil tapi nyata.
4. **`approval` aux** — gerbang pintar antara cautious/yolo. Nilai ada, risiko
   tertinggi (model menilai destructiveness → wajib harness approval kuat +
   fail-safe ke manual). Belakangan.
5. **`mcp` runtime client** — roadmap tersendiri (settings MCP masih
   config-only "runtime arrives later"); bukan arc settings.
6. **`curator` / `skills_hub`** — memori & hub belum punya panggilan model
   terpisah; nilai kecil hari ini.

**Unlock umum**: saat mesin sebuah slot ada, UI slot-nya (auto (use main) /
provider·model tersemat / Change / Set to main) menyalin pola resmi yang
sudah dibedah — termasuk stale-guard (slot kembali auto saat provider hilang).

**Status 2026-07-31 (v0.1.17, DIKIRIM)**: #1 dan #3 selesai sesuai pilihan
owner ("1 dan 3 dulu"). Terkirim: engine `src/agent/contextManager.ts`
(estimasi token chars/4 · window: override setting → metadata provider →
32768 · ambang 80% · protect-last-N yang snap ke batas pesan user · ringkasan
bergulir yang MENULIS ULANG jadi SATU ringkasan, bukan menumpuk · cache
per sesi dengan stale-guard /retry /compress · kegagalan summarizer tidak
pernah memblokir run — Notice + lanjut tanpa kompresi) · slot aux
`compression` + `title_generation` di tab Model (pola resmi: auto (use main)
/ Change / Apply / Set to main · draft provider mengosongkan draft model ·
Apply atomik · sanitize saat load) · knob Context window (0=auto) · judul
sesi otomatis setelah balasan pertama (silent saat gagal). Fakta implementasi
yang disengaja: kompresi berjalan PRE-LOOP di ChatApp (agentLoop tetap
bersih — dijaga smoke guard); wire-only — riwayat tersimpan utuh di disk.
Berikutnya kandidat: #2 `web_extract` ("yang lain menyusul").
