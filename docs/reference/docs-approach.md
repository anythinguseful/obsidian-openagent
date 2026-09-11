---
title: "Cara dokumentasi Open Agent"
type: reference
status: active
date: 2026-09-11
tags: [openagent, documentation, process]
---

# Cara dokumentasi Open Agent

Standar **cara** menulis, bukan ensiklopedia fitur.

Putusan yang sudah binding (jangan dibalik): satu vault `docs/` (Lesson 118),
bukan `docs/` vs `designdocs/`; bukan `ARCHITECTURE.md` di root; bukan manual
raksasa yang membusuk (Lesson 88 / 224).

## Audiens — dipisah di hub, bukan di folder

| Siapa | Baca dulu | Jangan |
| --- | --- | --- |
| Pengguna vault | [README](../../README.md) install + first run; [troubleshooting](troubleshooting.md); [architecture](architecture.md) tanpa wajib buka source | `working-agreement`, Lessons, smoke tests |
| Maintainer / coding agent | [docs/README.md](../README.md); [working-agreement](../working-agreement.md); [architecture](architecture.md) | Menyalin path `src/` ke halaman pengguna |
| Kontributor PR | [CONTRIBUTING.md](../../CONTRIBUTING.md); [SECURITY.md](../../SECURITY.md) | Menganggap `RELEASES.md` sebagai bukti ZIP |

## Pemetaan Diátaxis (cukup, tidak lengkap-semua)

Praktik umum: tutorial · how-to · reference · explanation. Kita **sengaja
tipis** di tutorial/how-to.

| Jenis | Di mana | Status |
| --- | --- | --- |
| Tutorial | README First run | Ada; jangan digandakan jadi Getting Started 20 halaman |
| How-to / FAQ | [troubleshooting.md](troubleshooting.md) | Hidup; hanya gejala yang benar-benar terjadi |
| Reference (kontrak hidup) | `docs/reference/*` — architecture, workspace, cron, sumber upstream | Ada |
| Explanation / keputusan | `plans/` `studies/` `audits/` | Ada |
| Proses agen | working-agreement + `AGENTS.md` | Ada; **bukan** user guide |
| Changelog pengguna | [RELEASES.md](../../RELEASES.md) | Ada |
| Bukti rilis | GitHub Release assets | Ada |

Yang **tidak** kita kejar (standar korporat yang akan membusuk): USER_GUIDE
penuh, API docs HTTP, ADR folder terpisah (plan = ADR), wiki.

## Aturan isi

1. Perilaku yang terlihat pengguna berubah → update catatan **user-facing**
   di commit yang sama (working-agreement § Aturan dokumentasi).
2. Halaman pengguna: perilaku dan konsep. **Tanpa** path `src/…` kecuali README
   peta kontributor (bagian Feature map) yang memang untuk developer.
3. Halaman arsitektur boleh menyebut path — itu reference maintainer.
4. Plan baru = `_TEMPLATE.md`. Status jujur.
5. Note baru yang material → baris di `docs/README.md`.
6. `npm run check:docs` sebelum klaim docs selesai.

## Apa yang kurang vs “standar aplikasi” — dan keputusan

| Celah umum | Keputusan kita |
| --- | --- |
| User guide terpisah | Tidak. README + troubleshooting + Settings in-app |
| FAQ | Ya, satu file troubleshooting, tumbuh dari laporan nyata |
| Architecture | Ya, `reference/architecture.md` — bukan root ARCHITECTURE.md |
| Pemisahan docs/designdocs | Tidak (Lesson 120) |
| Issue templates | Sudah `.github/ISSUE_TEMPLATE/` |
| DOCS_GUIDE | Sudah di working-agreement, diringkas di sini |

Kalau ragu file mana: hub [docs/README.md](../README.md), dua tabel “start”.
