---
title: "Hermes clarify tool — catatan studi (divirifikasi dari sumber)"
type: study
status: done
date: 2026-08-05
tags: [openagent, hermes, clarify, study]
---

# Hermes clarify tool — catatan studi (divirifikasi dari sumber)

Sumber: `/tmp/hermes` HEAD **aec3318** (clone 2026-08-05), berkas
`tools/clarify_tool.py` + `cli.py` (`_clarify_callback`).

## Fakta dari sumber

- **Nama**: `clarify`, toolset `clarify`, emoji ❓, `check_fn` selalu true.
- **Skema**: `question` (required; HANYA pertanyaan), `choices` (array
  string, `maxItems: 4` — UI selalu append opsi ke-5
  "Other (type your answer)"), `multi_select` (bool, default false;
  tanpa efek bila choices absen).
- **Tiga mode**: single-select (klik satu) / multi-select (checkbox,
  `user_response` jadi list) / open-ended (tanpa choices → freetext).
- **Envelope hasil** (yang kembali ke model):
  `{question, choices_offered, user_response}` (JSON).
- **Petunjuk CRITICAL di deskripsi**: opsi HANYA di `choices`, jangan
  di-enumerasi di teks question (render jadi prosa mati).
- **Guidance pakai**: ambiguitas / keputusan ber-trade-off / umpan balik
  pasca-tugas. JANGAN untuk konfirmasi yes/no berbahaya (itu urusan
  approval). Pilih default sendiri untuk keputusan low-stakes.
- **Tahan-LLM-aneh**: `_flatten_choice` membuka choice berbentuk dict
  dengan presedensi `label → description → text → title` (name/value
  sengaja dikecualikan); dict tanpa kunci itu dibuang.
- **Headless**: `callback=None` → `tool_error("Clarify tool is not
  available in this execution context.")` — cron/jalur tanpa platform
  mendapat error jujur, agen lanjut sendiri.
- **CLI platform callback**: arrow-key navigable; open-ended langsung ke
  freetext; multi via Space+Enter; **timeout default 120 detik**
  (`clarify.timeout`, ≤0 = tanpa batas) — lewat waktu → UI ditutup dan
  respons berisi kalimat: "The user did not provide a response within
  the time limit. Use your best judgement to make the choice and
  proceed."

## Pemetaan ke Open Agent (v0.1.80)

- Skema + envelope + panduan deskripsi diport hampir verbatim
  (`CLARIFY_MAX_CHOICES = 4`, `flattenClarifyChoice` presedensi sama).
- Callback platform = event loop baru `requestClarify` (kelas mesin yang
  sama dengan `requestApproval` — promise di-resolve klik kartu);
  `executeTool` menyuntikkannya sebagai argumen ketiga `ToolInteractive`
  { clarify }. Headless/cron tak punya handler → kalimat error Hermes.
- **Divergensi sadar #1 — tanpa auto-timeout.** Obsidian chat bukan
  terminal dengan egg-timer 120 detik; kartu menunggu selamanya persis
  seperti kartu approval. Semantik timeout mereka MASih tersedia sebagai
  gestur eksplisit: tombol "Skip — let the agent decide" meng-resolve
  kalimat "The user skipped this question. Use your best judgement to
  make the choice and proceed."
- **Divergensi sadar #2 — Other di mode multi**: teks Other ikut sebagai
  satu pilihan dalam list (CLI mereka mengappend-nya sebagai opsi ke-5
  yang bisa dicentang; efek setara).
- Kartu UI: overlay di atas composer (famili approval, aksen berbeda);
  state transient (centang, teks Other) milik komponen kartu supaya
  re-render induk tak menghapus pilihan setengah jadi.
- Toolset `clarify` default ON; sakelar di Settings → Capabilities.
