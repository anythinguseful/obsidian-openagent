---
title: "Rencana: web_search (paritas Hermes)"
type: plan
status: done
date: 2026-08-19
tags: [openagent, web, search, plan]
---

# Rencana: web_search (paritas Hermes)

## Summary

Menutup gap Hermes paling terasa (`docs/studies/hermes-tools-gap-2026-08-09.md`):
agent bisa **membaca** halaman (`web_extract`) tapi tidak bisa **mencari**.
`web_search` menambahkan kemampuan itu — satu query → judul/URL/deskripsi
berperingkat; model membaca halaman hasil lewat `web_extract` setelahnya.

Sumber: `tools/web_tools.py` + `plugins/web/{ddgs,brave_free,tavily,searxng}/`
Hermes @ `aeabff6` (2026-08-17), dibaca byte-level.

## Contract

- Tool `web_search` (toolset `web`, jadi **24 tools / 10 toolsets**).
- Params: `query` (wajib, mendukung `site:` dsb.), `max_results` (1–10, default 5).
- Hasil: `position. title / url / description` — metadata saja (persis Hermes).
- Backend (Settings → Capabilities → Web search):
  - `ddgs` (default, tanpa key) — DuckDuckGo HTML endpoint;
  - `brave` — Brave Search API, key free-tier;
  - `tavily` — Tavily Search API, key;
  - `searxng` — instance SearXNG self-hosted, URL.
- Fallback jujur: backend ber-key tanpa credential → otomatis `ddgs` + Notice.

## Decisions

- D1: DDG via endpoint HTML `html.duckduckgo.com/html/` (pola `ddgs` Hermes)
  sebagai jalur gratis default.
- D2: Parser **murni** (parse HTML/JSON tanpa network) + transport ter-inject
  (`requestUrl` di tools.ts) → seluruh logika unit-testable di node.
- D3: Keys di `settings.webSearch`, di-redact saat export (pola providers).
- D4: `web_search` di `DELEGATE_BLOCKED_TOOLS` (anak delegasi tak boleh
  network read, konsisten `web_extract`).
- D5: Batas jujur DDG — bisa rate-limit/diblokir; error memberi arahan ganti
  backend (tidak silent-empty).

## Impact

- File baru: `src/agent/webSearch.ts` · `test/web-search.test.cjs`.
- Sentuh: `src/agent/tools.ts` (+tool + ALL_TOOLS), `src/settings.ts`
  (+`webSearch` block + normalisasi + redaksi), `src/settingsTab.ts` (UI),
  `src/agent/delegate.ts` (blocked).
- Pin angka: README + check-docs 23→24 tools · tools.test 23→24 · markModified
  41→45.

## Phases

### Phase 1 — backend + parser + runner (DONE)
### Phase 2 — tool + settings + UI + delegate (DONE)
### Phase 3 — test (17 web-search + 6 settings) + docs (DONE)

## GWT

```text
Given settings backend=brave tanpa key
When web_search dijalankan
Then fallback ke ddgs + notice "missing Brave Search API key"

Given HTML DDG berisi <a class="result__a" href="//duckduckgo.com/l/?uddg=...">
When parseDdgHtml dijalankan
Then url di-unwrap ke tujuan asli + judul/snippet di-decode lalu strip tag

Given payload Brave/Tavily/SearXNG valid
When parse dijalankan
Then judul/url/deskripsi + posisi terpetakan, item > limit terpotong
```

## Risks

> [!risk]
> DDG HTML bisa rate-limit/diblokir (bukan API resmi). Mitigasi: fallback
> multi-backend + error berarah + batas hasil kecil (≤10).

> [!risk]
> Key web search bocor via export. Mitigasi: redaksi `braveKey`/`tavilyKey` di
> `redactSettingsSecrets` + test.

> [!risk]
> Search result = konten tak tepercaya → injeksi prompt. Mitigasi: hasil
> berformat posisi/url/deskripsi pendek; model membaca halaman lewat
> `web_extract` yang sudah membungkus konten sebagai UNTRUSTED.

## Batasan jujur

- Verifikasi end-to-end terhadap endpoint asli (DDG/Brave/Tavily/SearXNG)
  belum dilakukan di Arena — parser diuji terhadap fixture; respons nyata bisa
  berbeda (langkah verifikasi eksternal menyusul).
