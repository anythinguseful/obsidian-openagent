---
title: "Review deskripsi UI settings — Open Agent (2026-07-25)"
type: audit
status: done
date: 2026-07-25
tags: [openagent, settings, copy, audit]
---

# Review deskripsi UI settings — Open Agent (2026-07-25) · **DILULUSKAN penuh: K1 = pangkas dekoratif (kecuali --yolo), C1–C16 semua disetujui → dirilis sebagai v0.1.11**

Hasil survei seluruh teks settings: **66 nama baris + 51 deskripsi + 10 deskripsi tab + 4 sub-judul + 5 baris toolset** — ditarik verbatim dari `src/settingsTab.ts`, bukan dari ingatan.

**Cara pakai file ini:** tiap usulan bernomor (C1, C2, …). Balas misalnya "setujui semua", atau "kecuali C4 dan C10", atau edit bebas per nomor. Setelah disetujui → copy diganti di kode dan ikut rilis berikutnya.

---

## 1. Prinsip redaksi yang kupakai

- **R1** Satu ide per kalimat; info tambahan jadi kalimat kedua yang pendek.
- **R2** Benda nyata dulu, jargon belakangan ("SKILL.md files the agent reads…", bukan "The learning loop — …").
- **R3** Tanda baca konsisten: kalimat lengkap diakhiri titik. Pengecualian sadar: daftar kata kerja (5 baris toolset: "read / write / edit …") boleh fragmen tanpa titik — mereka konsisten satu kelompok.
- **R4** Notasi "=" hanya untuk nilai/flag ("0 = unlimited" boleh; "On = full private backup" jadi "On:").
- **R5** Klaim faktual wajib terverifikasi ke kode (contoh: "clone mulai kosong" dicek ke `src/agent/profiles.ts`).
- **R6** Istilah internal proyek (soul, Hermes ladder) dibuang atau dapat pasangan bahasa awam — keputusan akhir di K1.

## 2. Dua keputusan lintas-halaman (pilih dulu — usulan di bawah menyesuaikan)

**K1 · Rujukan "Hermes" — muncul di 7 tempat.** Karenanya copy sebagian terasa seperti catatan internal, bukan teks untuk pengguna.
(a) **Pangkas yang dekoratif (usulanku)** — copy langsung menjelaskan dirinya. Kecuali satu: di "Approval mode", `(Hermes --yolo)` kubiarkan karena menjelaskan kata "yolo" yang memang nama mode.
(b) **Pertahankan semua** — proyek ini memang sengaja menjajari Hermes; pengguna yang tahu Hermes senang, yang tidak tahu akan bertanya-tanya.

**K2 · Format "Custom headers" inkonsisten antar halaman (fakta).** Providers: "JSON object of extra request headers". MCP: "KEY=VALUE pairs, one per line". Teks tidak kuubah; menyatukan format = perubahan fungsional → usulanku cukup dicatat ke backlog, bukan rilis ini.

## 3. Usulan perbaikan (bernomor)

### General
| No | Sekarang | Usulan | Alasan |
|---|---|---|---|
| C1 | JSON snapshot of all settings (providers, profiles, snippets, automations… — cache excluded). | JSON snapshot of all settings — providers, profiles, snippets, automations. Cache excluded. | Kurung + "…" + em-dash menumpuk; dua kalimat pendek lebih cepat dibaca. |
| C2 | Off (default) = safe to share: API keys and Authorization-style headers are stripped. On = full private backup. Re-asked every time this tab opens. | Off (default): API keys and Authorization headers are stripped — safe to share. On: full private backup. Switches back to Off every time this tab opens. | R4 + fakta: nilainya *reset diam-diam* tiap tab dibuka (komentar kode: ephemeral by design) — "re-asked" menjanjikan pertanyaan yang tidak ada. |
| C3 | All settings back to defaults — providers & keys, profiles/souls, snippets, automations. … | …profiles, snippets, automations. … (sisanya tetap) | "souls" istilah internal; di sini "profiles" cukup. Istilah soul bundle tetap dipakai di tempat yang memang membahasnya (impor profil). |

### Providers
| No | Sekarang | Usulan | Alasan |
|---|---|---|---|
| C4 | OpenAI-compatible root, port included — e.g. http://localhost:1234/v1 (LM Studio), … | OpenAI-compatible root **URL**, port included — e.g. … (contoh tetap utuh) | "root" gantung; daftar contoh yang panjang memang berguna → tidak dipangkas. |

### Model
| No | Sekarang | Usulan | Alasan |
|---|---|---|---|
| C5 | Hermes effort ladder — sent to providers that support it, ignored elsewhere. | Thinking budget — sent to providers that support it, ignored elsewhere. | R1/R2 (lihat K1). Isi dropdown: none/minimal/…, bawaan "medium" — terverifikasi. |
| C6 | …Only the turn in progress switches; the next message uses the primary again. | …Only the current turn switches; new messages use the primary again. | Polesan ritme saja; klaim teknis tidak berubah. |

### Profiles
| No | Sekarang | Usulan | Alasan |
|---|---|---|---|
| C7 | Blank starts clean; clone copies the active profile's persona and pins (memory, skills & chats start empty). | Blank = fresh persona. Clone = copies the active profile's persona and pins. Both start with empty memory, skills and chats. | Kurung di ujung membuat orang bertanya "kosong untuk yang mana?" Fakta terverifikasi: clone hanya menyalin konfigurasi. |
| C8 | *(deskripsi tab)* Hermes-style identities: persona + optional provider/model pin — each with its own memory, skills and chats. | Named identities: persona + optional provider/model pin — each with its own memory, skills and chats. | K1. |

### Capabilities (sub-judul keempat bagian + 1 baris)
| No | Sekarang | Usulan | Alasan |
|---|---|---|---|
| C9 | Hermes-style toolsets — one switch per toolset. | One switch per toolset. | K1; kalimat sudah menerangkan dirinya. |
| C10 | The learning loop — agentskills.io SKILL.md files the agent reads and authors. | SKILL.md files the agent reads and authors — the learning loop. | R2: benda nyata dulu; nama domain dibuang (tak menambah arti di UI). |
| C11 | External tool servers over the Model Context Protocol. Config only for now — the runtime client arrives in a later update. | …Config only — the runtime client arrives in a later update. | "for now" pengisi. |
| C12 | Hermes-style skills hub — bundled source: kepano's Obsidian skills. Search progressively, preview + security-scan, one-click install into the active profile. | Bundled source: kepano's Obsidian skills. Search, preview + security-scan, then one-click install into the active profile. | K1 + "progressively" istilah cara kerja internal, tidak terlihat pengguna. |
| C13 | Let the agent capture reusable procedures as skills after complex tasks (Hermes' closed learning loop). | …after complex tasks (its learning loop). | K1. |

### Automations (deskripsi tab)
| No | Sekarang | Usulan | Alasan |
|---|---|---|---|
| C14 | Hermes-style cron — natural-language tasks on a schedule, output archived and appended to a note. | Scheduled tasks in natural language — output archived and appended to a note. | K1; "cron" teknis tak perlu di kalimat pembuka (tetap muncul di nama toolset). |

### Memory
| No | Sekarang | Usulan | Alasan |
|---|---|---|---|
| C15 | Remind the agent to persist knowledge every N user messages (0 disables). | Remind the agent to save what it learned — every N of your messages (0 disables). | "persist knowledge" kaku; "your messages" lebih konkret dari "user messages". |

### Advanced
| No | Sekarang | Usulan | Alasan |
|---|---|---|---|
| C16 | *(Request timeout (ms) — tanpa deskripsi)* | Applied to every provider request, chat and model-listing alike. | SATU-SATUNYA tambahan deskripsi. Fakta terverifikasi: `requestTimeoutMs` dipakai di panggilan chat & muat katalog model (`src/agent/providers.ts`). |

## 4. Baris tanpa deskripsi — biarkan kosong (keputusan sadar)

Nama sudah menerangkan dirinya; menambah kalimat hanya menambah bacaan: **Show message timestamps · Enable skills · Enable long-term memory · Save sessions**. (Pengecualian: Request timeout → C16.)

## 5. Dibiarkan apa adanya (OK) — ringkas

- General: Enter sends message · Attach active note by default · Reset settings (selain C3) · Reset everything · Import settings
- Providers: API key · Custom headers (lihat K2) · Test connection
- Model: Model · Temperature · Max output tokens · Streaming · deskripsi tab Model
- Agent: Approval mode (nilai manual/cautious/yolo ditulis apa adanya + Hermes --yolo) · Max tool iterations · Workspace folder · Personality overlay (sudah dinamis & jelas) · Context file · Prompt snippets
- Profiles: Name · Color · Personality overlay · Provider pin · Model pin · Import profile
- Capabilities: 5 baris toolset (R3) · Enable MCP · URL · Headers · Command · Arguments · Environment · Import mcp.json · Skills folder · Install from URL
- Memory: Memory folder · User profile · deskripsi tab
- Sessions: Max sessions kept · deskripsi tab
- Automations: semua baris form kecuali C14
- Advanced: Custom system prompt · Debug mode · deskripsi tab

---

*Statistik survei: ±140 string ditelaah · 16 usulan (15 ubah + 1 tambah) · sisanya OK.*
