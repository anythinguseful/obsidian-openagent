---
title: "Copilot Documentation Organization Study"
type: study
status: done
date: 2026-08-18
tags: [openagent, copilot, documentation, study]
---

# Studi: Cara Obsidian Copilot Mengatur Dokumentasi

Tanggal studi: **2026-08-18** (Pontianak, WIB).
Sumber diverifikasi **mentah** (klon lokal, bukan README sekunder):

- Repo: `logancyang/obsidian-copilot`
- HEAD: `d3ad51a` — "4.0.1 (#2878)", 2026-08-16
- Klon: `--depth 1 --filter=blob:none` ke `/tmp/copilot`

Studi ini fokus pada **organisasi dokumentasi** (bukan porting fitur — itu sudah
dicatat di `copilot-study-notes.md`). Tujuan: mencari preseden konkret untuk
perbaikan cara dokumentasi proyek Open Agent.

---

## Ringkasan peta (fakta → vonis)

| Area | Fakta dari repo | Vonis untuk Open Agent |
|---|---|---|
| Dua lapis docs: user vs agent | `docs/` (user-facing) terpisah dari `designdocs/` (agent/dev-facing) | ⏳ Kandidat ① — kita hanya punya satu lapis `docs/` |
| Hub `docs/index.md` + routing | `docs/index.md` = hub berkelompok topik, setiap file sesuai topiknya | ✅ Sudah mirip (`docs/README.md`) — beda gaya pengelompokan |
| **DOCS_GUIDE.md** | Aturan eksplisit "kapan & bagaimana update docs saat mengubah perilaku user-facing" | ⏳ Kandidat ② — kita belum punya aturan ini tertulis |
| `AGENTS.md` + tabel routing | Instruksi agent satu pintu + tabel "When you're… → Read" ke guide spesifik | ⏳ Kandidat ③ — kita pakai `skills/`, tanpa tabel routing |
| Guide per-aktivitas (`designdocs/agents/`) | STYLE / TESTING / PLUGIN_DEV / VENDOR / PROCESS / DOCS guide | ⏳ Kandidat ④ — sebagian konsepnya ada di skills/lessons, belum terpilah |
| Format plan terarsip | `docs/plans/archive/*.md` dengan frontmatter `title/session/revision/status/created` + Summary/Contract/Decisions/Impact/Phases/Risks/Open Questions/Interview | ⏳ Kandidat ⑤ — format plan kita beda |
| Changelog satu file | `RELEASES.md` kronologis terbalik, tiap rilis: ringkasan + bullet bertema + daftar PR | ⏳ Kandidat ⑥ — kita pakai final-report per rilis di `releases/` |
| Hygiene issue/PR | `.github/ISSUE_TEMPLATE/` (bug wajib: nonaktifkan plugin lain, log file, screenshot) + `CONTRIBUTING.md` lengkap | ⏳ Kandidat ⑦ — kita cuma punya `ci.yml` |

---

## ① Dua lapis dokumentasi

Copilot memisahkan dua audiens secara tegas:

**`docs/` — user-facing (pengguna akhir, non-teknis):**

```text
docs/
  index.md                        # hub: "Start here" + kelompok topik
  getting-started.md              # alur instal & setup
  agent-mode-and-tools.md
  agent-mode-windows-setup.md
  agents-md-examples.md
  chat-interface.md
  context-and-mentions.md
  copilot-plus-and-self-host.md
  custom-commands.md
  llm-providers.md
  miyo-api.md
  models-and-parameters.md
  projects.md
  system-prompts.md
  troubleshooting-and-faq.md
  vault-search-and-indexing.md
  plans/archive/                  # plan yang sudah disetujui, diarsip
```

Aturan gayanya (dari `designdocs/agents/DOCS_GUIDE.md`, verbatim):

> Docs are written for non-technical users — no source code references, explain
> behavior and concepts.

Nama file **sama dengan topiknya** (`llm-providers.md` untuk perubahan provider,
`agent-mode-and-tools.md` untuk perubahan tool).

**`designdocs/` — agent/dev-facing (untuk coding agent & maintainer):**

```text
designdocs/
  AGENT_HOME_ARCHITECTURE.md
  AGENT_INSTRUCTIONS_AND_PROMPT_CACHING.md
  AGENT_TRAIL_GROUPING.md
  MULTI_AGENT_FANOUT_ARCHITECTURE.md
  OBSIDIAN_COMMUNITY_REVIEW.md
  agents/                        # guide per aktivitas
    DOCS_GUIDE.md
    PLUGIN_DEV_GUIDE.md
    PROCESS_GUIDE.md
    STYLE_GUIDE.md
    TESTING_GUIDE.md
    VENDOR_GUIDE.md
  todo/                          # utang teknis
    TECHDEBT.md
    PORTAL_CONTAINER_CONTRACT.md
    UI_RENDERING_PERFORMANCE.md
    models_management_redesign_cleanup.md
    subscription_models_via_agent_backends.md
```

Poin penting: **`todo/` adalah tempat resmi utang teknis** — bukan tersebar di
komentar kode atau backlog campur aduk.

---

## ② `DOCS_GUIDE.md` — aturan "kapan update docs"

Isi lengkapnya pendek (ini inti aturannya):

- Saat **mengubah perilaku user-facing** (fitur baru, setting berubah, fungsi
  dihapus) → **update doc yang sesuai di `docs/`**. Nama file cocok dengan
  topiknya.
- Docs ditulis untuk pengguna non-teknis — tanpa referensi kode sumber.
- Satu perubahan menyentuh banyak doc → update semuanya.
- Ragu doc mana → cek `docs/index.md` (daftar lengkap + deskripsi).

Ini preseden yang paling langsung relevan: **kita belum punya aturan tertulis
"kapan docs wajib ikut berubah"**. Yang kita punya adalah enforcement
`check-docs.mjs` untuk *bentuk* (frontmatter wajib, hub wajib), bukan untuk
*kesegaran konten* (doc harus ikut berubah saat fitur berubah).

---

## ③ `AGENTS.md` + tabel routing

`AGENTS.md` (symlink `CLAUDE.md → AGENTS.md`) adalah **satu pintu masuk** untuk
coding agent. Strukturnya:

1. **Overview** — apa repo ini, 2 paragraf.
2. **Commands** — perintah build/lint/test yang boleh & yang dilarang
   (contoh: "NEVER RUN `npm run dev`").
3. **Core principles** — prinsip lintas-perubahan (generalizable solutions,
   referential stability, comment-the-why, dll.), masing-masing dengan tautan
   `→` ke guide detail.
4. **Task-specific guides** — tabel routing:

   | When you're… | Read |
   |---|---|
   | writing tests / E2E | `TESTING_GUIDE.md` |
   | building React components | Component gallery workflow |
   | writing code (DI/TS/React/comments/CSS) | `STYLE_GUIDE.md` |
   | touching plugin runtime (app/network/popout) | `PLUGIN_DEV_GUIDE.md` |
   | using a specific provider | `VENDOR_GUIDE.md` |
   | multi-step dev session | `PROCESS_GUIDE.md` |
   | changing user-facing behavior | `DOCS_GUIDE.md` |
   | reviewing / Obsidian submission | `OBSIDIAN_COMMUNITY_REVIEW.md` |

5. **Important notes** — tautan ke arsitektur, TECHDEBT, TODO.md, token
   Tailwind.
6. **Review guidelines** — blok yang di-sync dari repo terpisah
   (ditandai `<!-- synced ... -->`, jangan diedit di sini).

Pola yang patut diperhatikan: **prinsip ringkas di AGENTS.md, detail di guide
terpisah, dihubungkan tabel routing**. Open Agent saat ini menyebar prinsip di
`working-agreement.md` (1.313 baris) + `skills/*/SKILL.md` tanpa satu tabel
routing "kalau kerja X, baca Y".

---

## ④ Guide per aktivitas

Tiap guide fokus satu aktivitas, tidak tumpang tindih:

- `STYLE_GUIDE.md` — TS (`@/` import, interface vs type), React, **aturan komentar
  ("comment the why, not the what"; "no milestone/plan-step references in
  code"; "no comments that rot")**, CSS/Tailwind, dependency-injection untuk
  testability ("pass data, not services").
- `TESTING_GUIDE.md` — struktur describe, component gallery workflow
  (`*.stories.tsx`), E2E via Obsidian CLI.
- `PLUGIN_DEV_GUIDE.md` — akses `app` (jangan global), `requestUrl` vs `fetch`,
  keamanan pop-out window (`element.doc`/`element.win`).
- `VENDOR_GUIDE.md` — quirk per provider (contoh: AWS Bedrock harus pakai
  cross-region inference profile IDs).
- `PROCESS_GUIDE.md` — manajemen sesi multi-langkah lewat **`TODO.md`**:
  Session Goal, Completed/Pending Tasks, Architecture Summary, Testing
  Checklist. `TODO.md` = "single source of truth" progres sesi.

Perhatikan kemiripannya dengan **Lessons log** kita: sama-sama "preseden, jangan
diulang". Bedanya, mereka memilah per **aktivitas**, kita memilah per **insiden
kronologis**.

---

## ⑤ Format plan terarsip

Contoh `docs/plans/archive/2026-06-16-fix-copy-all-text-parts-agent-response.md`
(frontmatter):

```yaml
title: fix-copy-all-text-parts-agent-response
session: otc_rxkcfc
revision: 2
status: approved
created: 2026-06-16
```

Struktur badan:

1. **Summary** — mermaid flowchart sebelum/sesudah + narasi 1 paragraf.
2. **Contract** — signature + perilaku presisi.
3. **Decisions** — `D1..Dn` tiap keputusan + sumbernya (`[assumed]`, `← q1`,
   `(issue spec)`, `(review t1)`), plus tabel opsi "Pick | Approach | Tradeoff".
4. **Impact** — mermaid + blast radius eksplisit (konsumen tunggal disebut:
   `AgentTrailView.tsx:64`).
5. **Phases** — goal, files (dengan path + baris), verification.
6. **GWT blocks** — Given/When/Then.
7. **Risks** — callout `> [!risk]` + mitigasi.
8. **Open Questions** — ditutup eksplisit ("None — q1 & q2 resolved").
9. **Interview** — tiap pertanyaan: opsi + jawaban yang dipilih.

Vonis: format ini **lebih terstruktur** daripada plan kita (yang naratif bebas),
terutama di bagian Decisions + Impact + GWT + Risk. Layak diadopsi sebagian.

---

## ⑥ Changelog `RELEASES.md`

Satu file, kronologis terbalik. Format tiap rilis:

```markdown
# Copilot for Obsidian - Release v4.0.1 🛠️
[paragraf ringkasan 1-2 kalimat]

- 📊 [judul perubahan bertema emoji] — [detail] (@author)
- 🛡️ ...

⚠️ **Bundle size note:** ...

### Improvements
- #2808 Show only the working Buy Me a Coffee button @logancyang
...
### Bug fixes
...
```

Karakteristik: ringkasan singkat dulu → bullet bertema dengan atribusi author →
daftar PR bernomor → catatan risiko (`⚠️`). Sangat rapi untuk dibaca sekilas.

Kita saat ini menyimpan `final-report.md` per rilis di `releases/vN/`. Keduanya
tidak saling menggantikan — report kita jauh lebih detail (bukti verifikasi),
RELEASES.md mereka jauh lebih ringkas (untuk pengguna). Bisa berdampingan.

---

## ⑦ Hygiene issue & kontribusi

- `.github/ISSUE_TEMPLATE/bug_report.md` — **checklist wajib** di atas:
  nonaktifkan plugin lain, lampirkan log file, screenshot; lalu "Bug reports
  missing the required items above will be closed".
- `.github/ISSUE_TEMPLATE/feature_request.md`.
- `.github/FUNDING.yml` + 2 workflow (`node.js.yml`, `release.yml`).
- `CONTRIBUTING.md` — cara lapor bug, alur PR, dev environment, commit signing,
  prompt testing, **manual testing checklist** yang panjang per area.
- Tambahan infrastruktur agent: `.claude/agents/` (code-reviewer, release,
  prerelease, pr-pricing) + `.cursor/rules/` (coding-rule, test-rule).

Vonis: template issue dengan **checklist wajib** + sanksi "akan ditutup" adalah
preseden bagus untuk repo kita yang mulai terbuka (publik di GitHub).

---

## Perbandingan dengan Open Agent (v0.1.146)

| Aspek | Open Agent (saat ini) | Copilot | Gap |
|---|---|---|---|
| Lapis docs | Satu `docs/` (vault) berisi plans/studies/audits/reference | `docs/` user + `designdocs/` agent terpisah | Kita tak pisah audiens |
| Hub | `docs/README.md` ✅ | `docs/index.md` ✅ | Setara |
| "Kapan update docs" | Tidak tertulis (hanya bentuk via check-docs) | `DOCS_GUIDE.md` | **Gap nyata** |
| Pintu masuk agent | `skills/*/SKILL.md` (4 skill) + working-agreement 1.3k baris | `AGENTS.md` + tabel routing → guide | **Gap nyata** |
| Preseden/pelajaran | Lessons log kronologis | Guide per aktivitas | Beda pendekatan |
| Format plan | Naratif bebas + frontmatter | frontmatter + Summary/Contract/Decisions/Impact/Phases/Risks/GWT/Interview | Bisa adopsi |
| Changelog publik | `releases/vN/final-report.md` (detail) | `RELEASES.md` (ringkas) | Bisa berdampingan |
| Issue template | Tidak ada | checklist wajib + sanksi | **Gap nyata** |
| Utang teknis | Tercampur di backlog.md | `designdocs/todo/TECHDEBT.md` | Kecil |

---

## Rekomendasi adopsi (belum keputusan)

Urutan nilai terbesar → terkecil, menunggu keputusan owner:

1. **Aturan "kapan update docs"** (adopsi `DOCS_GUIDE.md` → jadi satu bagian di
   `working-agreement.md` atau file kecil `docs/`), plus perkuat `check-docs.mjs`
   bila memungkinkan.
2. **Tabel routing "kalau kerja X → baca Y"** — jembatan antara
   working-agreement/skills/guide tanpa menambah 1.3k baris.
3. **Template issue + checklist wajib** di `.github/ISSUE_TEMPLATE/`.
4. **Format plan terstruktur** (Summary/Decisions/Impact/Risks) untuk plan baru.
5. **`RELEASES.md` ringkas** berdampingan dengan final-report.
6. **`todo/` atau seksi utang teknis** terpisah dari backlog.

Yang **tidak** disarankan ditiru: pemisahan total `docs/` vs `designdocs/`
(mengubah struktur vault kita yang sudah binding di Lesson 118), dan `AGENTS.md`
penuh (kita sudah punya `skills/` + working-agreement sebagai kontrak).

---

*Fakta di atas dibaca langsung dari klon `d3ad51a`, bukan dari dokumentasi
sekunder.*
