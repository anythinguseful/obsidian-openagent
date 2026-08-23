---
title: "Rencana: Settings Tools / Skills / MCP ala Hermes Desktop"
type: plan
status: done
date: 2026-07-19
tags: [openagent, settings, capabilities, plan]
---

# Rencana: Settings Tools / Skills / MCP ala Hermes Desktop

Hasil studi source Hermes Desktop (`apps/desktop/src/app/skills/` + `settings/`), disusun untuk plugin **Open Agent** (Obsidian). Prinsip: ikuti konsep & format konfigurasi Hermes sedekat mungkin, sesuaikan dengan batasan lingkungan Obsidian (tanpa backend gateway — semua lokal di vault/data.json).

---

## 0. Temuan kunci

Halaman **Skills** di Hermes Desktop adalah satu halaman "Capabilities" dengan 4 mode:

`['skills', 'toolsets', 'mcp', 'hub']`

→ keputusan penggabungan Tools + Skills + MCP di tab **Capabilities** kita **persis** dengan strukturnya Hermes. Tinggal menyamakan isi per bagian.

---

## 1. Tools (tab "toolsets" di Hermes)

**Punya Hermes:**
- Daftar toolset (search + urut by usage), toggle on/off per toolset.
- Badge **jumlah pemanggilan tool** dari analytics 365 hari per tool.
- Detail panel per toolset (`toolset-config-panel.tsx`): provider backend + env-var keys (set/reveal/clear), post-setup install, katalog model untuk image/video gen.

**Punya kita sekarang:** 4 toggle toolset + input teks "disabled tools" dipisah koma.

**Rencana adopsi:**

| # | Item | Tahap |
|---|---|---|
| 1.1 | **Daftar per-tool dengan toggle** menggantikan input koma — tools dikelompokkan per toolset, toggle per tool mengisi `disabledTools` | A |
| 1.2 | Badge usage count per tool, dihitung **lokal dari riwayat sesi** (`openagent-sessions`, parts berisi tool calls) | B |
| 1.3 | Env-var keys per toolset (ala config panel) — relevan saat nanti ada provider **web search** (Tavily/Brave). Belum ada backendnya sekarang | C |

## 2. Skills (tab "skills" di Hermes)

**Punya Hermes:** search, sort by usage, badge **kategori + provenance** (`learned` = ditulis agent, `hub` = dari registry), **toggle enable per skill**, edit via code editor, archive dgn dialog konfirmasi. Plus tab **Hub**: registry online (multi-source search, trust level builtin/trusted/community, preview + **security scan**, install/uninstall/update-all).

**Punya kita sekarang:** browser lokal (search, expand isi, delete ke trash). Belum ada: enable per skill, kategori, provenance.

**Rencana adopsi:**

| # | Item | Tahap |
|---|---|---|
| 2.1 | **Toggle enable per skill** — frontmatter `enabled: false`; baris browser dapat switch; `loadSkills()`/`catalog()` melewatkan yang non-aktif | A |
| 2.2 | Badge **kategori** (frontmatter `category`) + **provenance** (`learned` kalau dibuat via `create_skill`) | B |
| 2.3 | Usage count per skill (estimasi dari sesi: seberapa sering skill muncul di system prompt/penyebutan) — indikator kasar | B |
| 2.4 | "Hub" versi mini: **install dari URL** (paste raw URL SKILL.md → `requestUrl` → simpan ke folder skills). Tanpa registry penuh | B |
| 2.5 | Registry hub penuh + security scan — butuh endpoint online; di luar jangkauan realistis plugin | D (opsional) |

## 3. MCP (tab "mcp" di Hermes)

**Punya Hermes (`mcp-tab.tsx`):**
- **Format konfigurasi mengikuti ekosistem `mcp.json`** — nama server = key JSON, transport inferred (`command` = stdio, `url` = HTTP), normalisasi `type`→`transport`. Snippet dari README server MCP bisa **paste verbatim**.
- Probe koneksi nyata (connect/disconnect) dengan cache TTL + fingerprint config → status: off / probing / ok / needs-auth / error.
- Ringkasan kapabilitas ("12 tools enabled"), filter per-tool include/exclude per server, OAuth untuk server remote, log tail, katalog curated one-click install.

**Punya kita sekarang (config-only):** master toggle + kartu per server (name/command/args/env/enabled). Formatnya model batin sendiri, bukan mcp.json.

**Rencana adopsi:**

| # | Item | Tahap |
|---|---|---|
| 3.1 | **Migrasi schema ke bentuk mcp.json**: field `command`/`args[]`/`env{}`/`url`/`headers{}`/`transport` (auto: url→http, command→stdio) + `enabled` + `tools.include/exclude`. Nama server sebagai key (seperti Hermes), `id` internal dibuang. Storage tetap `data.json` plugin | A |
| 3.2 | Field **URL + headers** (untuk server HTTP) di kartu server | A |
| 3.3 | **Import "Paste mcp.json"** — textarea menerima `{"mcpServers":{…}}` maupun map polos (parser toleran ala `parseServersDoc`), merge ke daftar | A |
| 3.4 | Slot **status dot** (abu "unknown") di baris server sekarang; diisi probe nyata saat runtime client tiba | B |
| 3.5 | Probe/test + per-tool include/exclude UI + log tail — datang **bersama runtime client stdio/HTTP** (Tahap runtime) | C |
| 3.6 | Katalog curated statis lokal (filesystem, fetch, github, memory, sqlite… preset JSON one-click add) — tanpa backend | B/C (opsional) |

## 4. Tahapan kerja

- **Tahap A (UI & schema, tanpa runtime):** 1.1 · 2.1 · 3.1 · 3.2 · 3.3
- **Tahap B (pemanis lokal):** 1.2 · 2.2 · 2.3 · 2.4 · 3.4 · (3.6)
- **Tahap C (menyertai fitur runtime):** 1.3 · 3.5 (dan runtime MCP sesungguhnya)
- **Tahap D (opsional/jauh):** 2.5 hub registry + security scan

Catatan migrasi: field MCP yang sekarang (`id`, `name`, `args: string`, `env: string`) ditransformasi sekali jalan saat load settings → bentuk mcp.json (`args[]`, `env{}`, keyed-by-name).
