---
title: "TEMPLATE — rencana fitur"
type: plan
status: draft
date: YYYY-MM-DD
tags: [openagent, plan]
---

# TEMPLATE — struktur rencana (plan)

Mulai plan baru dengan menyalin file ini. Frontmatter wajib (`title`, `type`,
`status`, `date`, `tags`) — dijaga `scripts/check-docs.mjs`. Status harus
jujur: `draft` saat dibahas, `done` saat ship, `archived` saat digantikan.

Struktur badan diadopsi 2026-08-18 dari format plan obsidian-copilot (studi:
`docs/studies/copilot-docs-organization-2026-08-18.md`).

## Summary

[1–2 paragraf + mermaid flowchart sebelum/sesudah bila membantu. Jawab:
masalah apa, perbaikan apa, kenapa sekarang.]

## Contract

[Signature/API/perilaku presisi yang dijanjikan. Untuk fitur UI: perilaku yang
terlihat di layar, ditulis sebagai sebelum → sesudah.]

## Decisions

- D1: [keputusan] — sumber: `(issue)`, `← tanya owner`, `[assumed]`, `(review)`
- D2: …

Bila ada opsi yang ditimbang, tabel: `| Pick | Approach | Tradeoff |`.

## Impact

[Blast radius eksplisit: file/konsumen yang tersentuh (path + baris bila tahu).
Sebutkan juga apa yang TIDAK berubah.]

## Phases

### Phase 1 — [nama]
Goal: [tujuan fase]
Files:
- `src/...` — [perubahan]

Verification: [perintah test + apa yang diharapkan hijau]

## GWT

```text
Given [kondisi awal]
When [aksi]
Then [hasil yang diharapkan]
```

Tulis kasus positif, negatif, dan boundary.

## Risks

> [!risk]
> [risiko] — mitigasi: [cara menekan risiko].

## Open Questions

- q1: [pertanyaan] — status: [terjawab / menunggu owner]
