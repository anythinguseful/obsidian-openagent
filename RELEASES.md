# Release Notes

Changelog ringkas untuk pengguna. Mulai v0.1.151, ZIP terverifikasi,
checksum, clean source, source manifest, dan final report disimpan sebagai
asset permanen di [GitHub Releases](https://github.com/anythinguseful/obsidian-openagent/releases).
Arsip machine-local untuk versi sebelumnya tidak ikut dalam upload GitHub;
catatan perubahan historisnya tetap dipertahankan di bawah.

---

# Open Agent v0.1.158 — Vault-folder fields no longer truncate

**Release archive:** prepared — publication route: merge the settings PR, then run the **Publish GitHub Release** workflow on `main` (steps in `docs/release-handoff-2026-08-31.md`).

- **Folder paths read in full.** Memory folder and Skills folder — the last two settings fields whose values were clipped by the narrow right-aligned input (the audit measured 34px and 11px missing) — now stack full-width below their labels, the same treatment as the MCP server fields in v0.1.157. Validation behavior is unchanged (invalid paths still revert with a notice).

---

# Open Agent v0.1.157 — MCP server fields stack full-width

**Release archive:** intermediate — not published separately; its content ships inside v0.1.158.

- **MCP server forms are readable again.** Command, Arguments, and URL on each server card (MCP servers section) now render as full-width fields below their labels — the same stacked treatment as Environment and Headers — instead of narrow right-aligned inputs that truncated long values like `npx -y @modelcontextprotocol/server-filesystem …`.

---

# Open Agent v0.1.156 — Settings placement tidy-up

**Release archive:** intermediate — not published separately; its content ships inside v0.1.158.

- **Provider route card action moved.** The button on the routing card (Providers and Model tabs) now sits at the bottom-right, after the description, instead of floating at mid-card height.
- **"Show message timestamps" lives in Appearance.** The toggle moved from General into the Chat surface group; behavior is unchanged.
- **"Context window" leads the Context group.** In Memory & Context the window sits above "Context file", no longer at the head of Compression; behavior and values are unchanged.
- **unreal-engine removed from the MCP install catalog.** The one-click template is gone; a previously installed server keeps working from its saved configuration.

---

# Open Agent v0.1.155 — Development skills live under agents/

**Release archive:** published 2026-08-25 — full asset set on GitHub Releases (tag v0.1.155).

- **Development skills moved.** The tracked agent-skill tree is now `agents/skills/` (sibling of `agents/arena/`), so agent workflow and skills sit in one place.
- **Runtime vault skills are unchanged.** `openagent/openagent-skills/` and Hub installs still live in the vault. Plugin behavior is the same.
- **Routing follows the folder.** `AGENTS.md`, `check:skills`, and the working-agreement table now point at `agents/skills/`. A root `skills/` folder is treated as a regression.

---

# Open Agent v0.1.154 — Restore Settings from before grouping

**Release archive:** no standalone artifact — accepted intermediate; its content shipped inside the v0.1.155 asset set (PR #7 bumped two versions in one merge). Do not reconstruct.

- **Settings groups are no longer boxed.** Named subsections go back to native Obsidian rows with spacing and headings — the extra hairline shells from v0.1.153 are gone.
- **MCP servers stay as object cards.** Those are real managed objects, not decorative wrappers around every setting.
- **No setting behavior changed.** Names, order, controls, search, and security stay the same.
- **Real-DOM proof.** `F49settingsGroups` now verifies that grouping shells are absent and that Capabilities subsections sit as direct children of the pane.

---

# Open Agent v0.1.153 — Unified Settings grouping ✦

**Release archive:** published 2026-08-25 — full asset set on GitHub Releases (tag v0.1.153).

- **Settings now reads as one system.** Each named group keeps its title, purpose, and native Obsidian rows inside one quiet hairline shell instead of mixing floating rows and unrelated cards.
- **MCP servers and scheduled tasks now belong to that same system.** They remain stronger managed-object cards, but share the group border, radius, spacing, and divider language.
- **No settings behavior changed.** Names, order, controls, data, search harvesting, and security behavior remain the same.
- **Real-DOM proof added.** `F49settingsGroups` verifies the grouped structure and computed 1 px / 8 px card geometry for Capabilities and Automations.
- **Consecutive tool calls now read as one activity.** A single outer card contains independently expandable tool rows separated by hairlines, so repeated tool calls no longer form a wall of nested cards.
- **Conversations are safer and easier to use.** Session rows are keyboard-selectable, row actions appear on focus as well as hover, and deleting a saved chat now requires confirmation.
- **Interactive run ownership is narrower.** `AgentRunner` now creates the interactive loop and scoped context; ChatApp receives a small run/steer handle while keeping UI callbacks and presentation.
- **Memory routing is stricter.** USER.md now accepts stable user facts only; MEMORY.md accepts reusable environment/project lessons; unmistakable dated tool/test/session activity is rejected from both stores and stays in session history.
- **Clarify questions survive history.** Questions, choices, answers, skips, and interruptions now persist as read-only chat summaries; opening history never silently resumes an old agent loop.

---

# Open Agent v0.1.152 — Fix release: harness saveSettingsSafe, CI crash, & preflight 🔧

**Release archive:** published 2026-08-24 — full asset set on GitHub Releases (tag v0.1.152).

- **Fix penyebab kegagalan run 32758294248.** Settings-preview harness (`settings-entry.tsx`) tidak punya `saveSettingsSafe` yang dipakai kode produksi → `moaSave()` crash → semua probe DOM gagal. Shim `chat-entry.tsx` juga ikut diperbaiki.
- **Probe F14** diperbaiki: tombol "Apply" yang sebelumnya dipindai dari seluruh halaman (termasuk baris Embedding model) kini dibatasi ke baris Global default model.
- **Preflight cepat:** `npm run release` sekarang cek apakah versi sudah di-tag di remote dalam 1 detik, bukan menunggu pipeline 3+ menit.
- **Bump versi** ke 0.1.152 agar publisher dapat melanjutkan.

Semua probe settings-audit (F1–F49) telah diverifikasi hijau dengan Chromium asli untuk pertama kalinya.

---

# Open Agent v0.1.151 — MCP credential isolation & catalog hardening 🔐

**Release archive:** [Open Agent v0.1.151 on GitHub](https://github.com/anythinguseful/obsidian-openagent/releases/tag/v0.1.151) is a reconstructed verification release with six published assets, including the install ZIP and SHA-256. The artifacts were rebuilt and reverified from the tracked v0.1.151 source; they do **not** claim byte identity with the unavailable historical ZIP.

- MCP catalog secrets now live in a plugin-private secret store, separate from exportable settings.
- Legacy n8n API keys migrate once; imports strip catalog secrets; Reset Everything clears the secret store.
- Runtime merges secret env values only at process spawn and excludes secret values from cache keys.
- n8n catalog real-DOM witness covers password field, failure recovery, success completion, and no DOM secret leak.
- MCP Catalog modal is extracted into its own security-sensitive module.

---

# Open Agent v0.1.150 — Settings modularization & durable project workflow 🧩

Rilis fondasi maintainability: modal Settings dipisahkan menurut domain,
sementara workflow agent, dokumentasi, dan skill proyek menjadi lebih tahan
lintas sesi.

- Settings modal Phase 1–3 dipindahkan ke `src/settings/modals/` tanpa
  perubahan perilaku: import/export, picker, reset, profile, snippet, Hub,
  consent, blueprint, dan guard findings.
- Inspector class berbasis TypeScript AST menjaga refactor berikutnya dari
  boundary komentar/brace yang rapuh.
- `openagent-docs`, `skill-creator`, dan `doc-coauthoring` melengkapi sistem
  skill; `check:skills` menjaga manifest, provenance, dan routing.
- `McpCatalogModal` sengaja belum dipindahkan; membutuhkan plan security
  khusus karena credential dan third-party installer.

**Status:** *locally validated* — pipeline rilis penuh, real-DOM preview, docs,
dan skill checks lulus.

---

# Open Agent v0.1.149 — Durable agent workflow & Session Panel extraction 🧭

Rilis fondasi developer workflow: skill proyek kini portable, terverifikasi,
dan mudah dipakai lintas sesi Arena. Di plugin, Conversations panel menjadi
komponen terpisah tanpa mengubah perilaku pengguna.

## Development workflow

- **`AGENTS.md`** menjadi pintu masuk agent: routing tugas, skill wajib,
  baseline, dan batas repository.
- Skill dipisah jelas menjadi **internal** (kontrak Open Agent) dan snapshot
  **vendor resmi** dari Anthropic, Vercel, serta Matt Pocock. Setiap snapshot
  memiliki commit SHA, provenance, dan lisensi.
- Tambah `check:skills` ke `verify` dan release pipeline. Guard memeriksa
  registry, path `SKILL.md`, frontmatter, upstream pin, adapter Arena, dan
  handoff persisten.
- Bukti audit mentah kini berada di folder proyek `evidence/`; docs audit
  menautkan bukti itu secara relatif.

## Architecture

- **Session Panel** diekstrak dari `ChatApp`. Komponen baru memegang tampilan
  Conversations dan draft rename; `ChatApp` tetap menjadi pemilik SessionStore,
  partition safety, queue cleanup, dan agent lifecycle.
- Tampilan dan perilaku panel tidak berubah: popover di atas composer, search,
  date groups, density, rename Enter/Escape, delete, dan close tetap sama.

**Status:** *locally validated* — typecheck, seluruh test, PDF browser matrix,
docs/skills checks, dan chat real-DOM preview lulus. Provider/MCP/Docker nyata
masih memerlukan smoke sesuai konfigurasi mesin pengguna.

---

# Open Agent v0.1.148 — Settings finishing pass & Hermes personality parity ⚙️

Rilis pemolesan setelah v0.1.147: pengaturan yang lebih mudah dipulihkan,
persentase yang lebih jelas, copy yang lebih ringkas, dan personality bawaan
yang kembali setara dengan Hermes.

## Settings

- ↺ **Reset to default** muncul hanya pada nilai angka/teks yang sudah diubah;
  tombol mengembalikan satu nilai tanpa menyentuh toggle, pilihan enum, atau
  daftar folder.
- **Persentase compression** kembali terlihat pada kotak angka dan tanda `%`
  kini menyatu di dalam field, bukan menjadi elemen terpisah.
- Deskripsi Settings diaudit dan diringkas agar menjelaskan kegunaan utama
  terlebih dahulu; istilah internal yang membingungkan dihapus.
- Tab **About** kembali hadir dengan identitas build, lisensi, attribution,
  dan tombol Copy diagnostics yang tidak menyertakan rahasia.

## Personality

- Keempat belas personality bawaan kini memakai prompt **verbatim Hermes
  Desktop**. Mode tambahan khusus vault (researcher, engineer, writer,
  librarian) tetap tersedia.

**Status:** *locally validated* — typecheck, build, seluruh test, PDF browser
matrix, dokumentasi, dan preview real-DOM chat/settings lulus. Smoke end-to-end
pada model/provider nyata tetap bergantung pada konfigurasi mesin pengguna.

---

# Open Agent v0.1.147 — Memory & Context Engine + Composer & UI polish 🧠

Rilis besar: **memory & context engine ala Hindsight** (plugin-native, tanpa
Docker/MCP/server), **composer parity Hermes Desktop**, dan **rapian layout
Settings** — di atas banyak perbaikan UI/paritas sejak 0.1.146.

## Structured memory engine (Hindsight-style, 3 fase)

- 🧠 **Facts → observations → mental models** — satu panggilan LLM mendistilasi
  tiap turn jadi fakta ber-tipe (world/experience) dengan add/update/delete +
  dedupe; `reflect` latar menggabungkan fakta jadi observations ber-bukti
  (proof count) dan menjawab mental-model pertanyaan tetap (dibaca gratis dari
  disk, tanpa LLM).
- 🔎 **Recall fusion murni** — BM25 + entity overlap + temporal decay + trust
  (nol latensi); semantic recall opsional via `/v1/embeddings`
  (mis. `embedding-gemma-300m`) dengan cosine fusion; observations ikut
  di-recall.
- 💾 **Penyimpanan vault** — `<memory folder>/.engine/{facts,observations,
  models,meta}.jsonl`; MEMORY.md/USER.md tetap cermin terbaca manusia.
- 🧭 **3 kontrol baru** di Memory & Context → Structured memory (toggle,
  retain tiap N turn, recall budget, picker embedding model) + blok
  **Compression** (enabled / threshold / target_ratio / protect_last_n).

## Composer parity Hermes Desktop

- ⬆️⬇️ **Input-history browse** — panah atas/bawah memanggil prompt lama;
  draft yang sedang diketik tidak dibajak; kembali ke "masa kini" memulihkan
  draft.
- ↩️ **Undo/redo milik sendiri** (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y) —
  re-render chip tidak lagi merusak undo Chromium.
- ⏹️ **Escape = berhenti** saat agent menjawab.

## Layout & perbaikan UI

- 🧩 **Settings** — label kelompok konsisten di semua tab, deskripsi diringkas
  (baris kembali 79px), pasangan provider+model sejajar (Global default,
  Fallback, MoA Reference, Aggregator), label duplikat "Title generation"
  dibelah ("Title generation" toggle vs "Title model" slot).
- 🧭 **Personality global** (= `display.personality` Hermes) — profile hanya
  membawa SOUL; `/personality` tetap overlay per-sesi.
- 🪟 **Panel sesi** — satu floating popover di atas composer (tanpa backdrop),
  sama seperti slash menu; toggle ↺ di topbar.
- 💬 **Slash overlay** selebar composer dengan ikon+nama+deskripsi, highlight
  keyboard + scroll-follow.
- 🖥️ **Terminal Windows** — quoting `cmd /d /s /c` verbatim (pipa/`&&`/kutip
  tak lagi pecah) + pengungkapan dialek shell ke model; context-length LM
  Studio dibaca dari API native, fallback 256K.

## Perbaikan bug

- Token pill: `%` & "over budget" kini dari **kiriman terakhir** (bukan total
  kumulatif) — alarm palsu "1772%" hilang; context length LM Studio terbaca
  (131072).
- Harness drift cluster (title/slash2/slash3/md/moa/moa2) — akar = mock runner
  kehilangan `getToolsWithMcp` + default `titleGenerationEnabled` flip.

**Status:** *locally validated* — full gate (typecheck · build · 34 suite test ·
check-docs 23/23 · chat + settings real-DOM) hijau. End-to-end terhadap server
MCP/embedding asli menunggu smoke nyata di mesin user.

---

# Open Agent v0.1.146 — Terminal & Processes v1 🖥️

Paket Seimbang Terminal & Processes v1: tool `terminal` + `process`
(registry **23 tools dalam 10 toolsets**).

- 🖥️ **Terminal foreground/background via Docker** — satu disposable container
  per command/process; network `none`, rootfs read-only, seluruh capability
  di-drop; image pre-resolved, `--pull never`.
- 🛡️ **Physical Workspace containment** — resolusi physical path untuk
  Whole/Preferred/Strict; symlink/junction escape fail-closed; `.obsidian`
  dan exclusions tertutup.
- ✅ **Exact prepared approval** — fresh Allow once per command start (termasuk
  saat YOLO); revalidation menolak drift image/Workspace/setting sebelum spawn.
- 🧾 **Consent fail-closed** — receipt acak 32-byte per vault; import/export
  tidak bisa menciptakan consent.
- 📱 **Desktop-only lazy Node runtime** — mobile tetap jalan; capability
  Terminal hanya pada owned chat session.
- ⏱️ **Bounded lifecycle** — foreground maks 120 dtk, background 900 dtk,
  output/retention caps.

**Status:** *locally validated* — end-to-end menunggu real Docker smoke test
(`releases/v0.1.146/openagent-v0.1.146-external-docker-smoke.md`).

---

# Open Agent v0.1.145 — Workspace Modes 🗂️

Tiga mode Workspace — **Whole vault**, **Preferred folder**, **Strict folder
boundary** — satu kebijakan path kanonik untuk semua konten yang bisa dilihat
model.

- Kebijakan kanonik di `workspacePolicy.ts` (lexical validation, tolak absolute
  path/`..`/control char, lindungi config dir).
- Migrasi kompatibel: kosong → Whole, berisi folder → Preferred, Strict hanya
  eksplisit; Strict invalid tidak pernah fallback diam-diam.
- Cakupan end-to-end (read/search/list/write/edit/delete/rename, `@` reference,
  vision, cron, delegation).
- **File-read ceiling** 1.000–20.000 karakter (default 20.000).

---

# Open Agent v0.1.144 — Mermaid & Stream Atomicity 🧩

- Kebijakan fence/diagram bersama (`fences.ts` + `canonical-output.ts`).
- Komentar Mermaid `; % …` dipindah ke own-line `%%` tanpa kehilangan payload;
  preamble dipertahankan; input malformed fail-closed.
- Retry/fallback attempt-atomic (partial attempt di-rollback sebelum attempt
  berikutnya).
- Observability SSE deterministik tanpa merekam konten sensitif.
- Regression matrix R01–R50: 45 direct, 5 integration, 0 exception.

---

# Open Agent v0.1.143 — Mermaid inline-percent fix 🧪

- Akar: Mermaid 11.16.1 menolak suffix `; % komentar` (gaya JavaScript).
- Scanner stateful pada shared preprocessor — aktif hanya untuk
  flowchart/graph, memindahkan komentar ke own-line `%%`, melindungi quoted
  label/edge caption.
- Berlaku di Chat UI, `write_note`, dan ekspor `/save`.

---

# Open Agent v0.1.142 — Notifications & Sound 🔔

- Tab Notifications aktif kembali: native OS notifications privacy-safe
  (master default OFF; enam event switch; permission hanya dari aksi user).
- Completion sound aplikasi terpisah dari suara native OS.
- In-app `Notice` dipertahankan.

---

# Open Agent v0.1.141 — Settings search paint (lanjutan) 🎨

- Selector typed Settings-only mem-pin rest/hover/active/focus neutral dan
  mematikan transition/animation inner-input.
- Tidak menyentuh Quick Ask, chat SearchField, atau modal non-Settings.

---

# Open Agent v0.1.140 — UI regression patch 🎨

- Menghapus legacy hover/active paint yang muncul kembali di shared search
  fields; focus tetap terlihat di shell/pill pembungkus.
- Textarea Settings memakai paint neutral yang tenang.

---

# Open Agent v0.1.139 — Paket C: PDF security hardening 📄

- Ekstraksi PDF via `pdfjs-dist@4.10.38` fail-closed: worker lifecycle,
  hard caps, deadline, cleanup/recovery.
- Upgrade `diff@8.0.4`.
- Regression matrix adversarial **49/49 PASS** (Chromium 149 + Chrome 114).
