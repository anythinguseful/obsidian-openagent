---
title: "Browse Hub — studi Hermes Desktop & adaptasi"
type: study
status: done
date: 2026-07-19
tags: [openagent, hermes, skills, study]
---

# Browse Hub — studi Hermes Desktop & adaptasi

Studi: `apps/desktop/src/app/skills/hub.tsx`, docs *Web Dashboard* & *Skills Hub* (deepwiki), `website/docs/user-guide/features/skills.md`.

## Cara Hermes Desktop "Browse Hub" bekerja

- Satu tab di halaman Capabilities terpadu (Skills / Tools / MCP / **Browse Hub**).
- **Connected hub chips** dengan status per sumber (spinner saat mencari, tint merah saat degraded/rate-limited).
- **Pencarian progresif per sumber** (debounce 350 ms): tiap sumber dicari terpisah, hasil mengalir masuk; dedupe berdasarkan `identifier` dengan **trust rank** `builtin 2 > trusted 1 > community 0`, urut trust lalu nama.
- Landing (query kosong) menampilkan **featured**.
- Baris hasil: nama · badge trust · badge installed · deskripsi · tombol Preview / Install–Uninstall; status aksi per baris (tanpa desync saat paralel).
- **Dialog Preview**: isi SKILL.md + daftar file + tombol **Scan** on-demand (Skills Guard: verdict safe/caution/dangerous + findings `[severity] file:line — deskripsi`) + Install dari dialog.
- **Update all** untuk skill terinstal; **action log** (LogTail) mengekor output install.
- Sumber Hermes: `official` (optional-skills repo sendiri), `skills-sh` (delegasi GitHub), `well-known` (`/.well-known/skills/index.json`), `github` (tap default: openai/skills, anthropics/skills, huggingface/skills, NVIDIA/skills, garrytan/gstack), `url` (SKILL.md langsung), clawhub/lobehub/browse-sh.
- Keamanan: Skills Guard memindai tiap skill eksternal saat install; pola berbahaya → blok/minta override sesuai trust. Hub **user-driven**: agent tidak punya tool untuk install dari hub.
- Backend-nya menjembatan CLI (`hermes skills search/install/update --json`) — tidak tersedia di plugin.

## Adaptasi di Open Agent (diimplementasikan)

- **`src/agent/hub.ts` — `HubClient`**: tap GitHub default yang sama (openai, anthropics, huggingface, NVIDIA, vercel-labs/agent-skills) + **custom taps** (`owner/repo[/subdir]`, community trust). Katalog = SATU panggilan `git/trees/{branch}?recursive=1` per tap, **cache 6 jam** di `data.json` (`settings.hubCache`) karena kuota API 60 req/jam; file diunduh dari `raw.githubusercontent.com` (bebas kuota API), binary-safe ≤512 KB.
- **Pencarian lokal progresif** di atas cache per tap (chip hidup per sumber), debounce 350 ms, dedupe trust-ranked (Hermes `_TRUST_RANK`), landing = 6 skill pertama per tap.
- **Deskripsi lazy** dari frontmatter SKILL.md (12 baris terlihat pertama).
- **`src/agent/skillsGuard.ts`** — port ringan: pola dangerous (remote-exec `curl|sh`, `rm -rf`, eksfiltrasi key/token/webhook.site, mkfs/dd), caution (frasa prompt-injection, tampering safety, base64 blob, sudo). Verdict → `installPolicy`: allow / ask (dialog findings) / **block** (dialog + checkbox consent).
- **Install per baris** = scan dulu → kebijakan → tulis ke folder skills **profile aktif** (`<slug>/<files>`), dicatat di **`hub-lock.json`** (repo, dir, branch, blob-shas) → badge "installed", **Uninstall**, **Update all** (bandingkan blob sha, reinstall yang berubah). Badge provenance **hub** di daftar skills.
- **Install from URL** (SKILL.md langsung, discan dulu) — sumber `url` Hermes.
- Invarian Hermes dipertahankan: **tidak ada tool agent** untuk hub — instalasi hanya lewat UI (user-driven).
- Modal **Preview** (SKILL.md + files + scan on-demand + Install) dan modal **Guard findings**.

## Ditunda (disadari)

- Sumber `well-known` (`/.well-known/skills/index.json`) dan indeks marketplace `skills.sh` (pencarian server-side).
- Action log bergaya LogTail (kami memakai Notice ringkas, bukan panel log).
- Auto-scan markdown editor SKILL.md lokal; peringkat/usage analytics per skill.
- Tap berpath dalam (`optional-skills` Nous Research) bisa ditambah user manual sebagai custom tap — distandarisasi nanti bila diminta.
