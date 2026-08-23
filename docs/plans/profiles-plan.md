---
title: "Rencana: Agent Profiles ala Hermes"
type: plan
status: done
date: 2026-07-19
tags: [openagent, profiles, plan]
---

# Rencana: Agent Profiles ala Hermes

Hasil studi fitur **profiles** Hermes Agent (`hermes_cli/profiles.py`, `apps/desktop/src/app/chat/sidebar/profile-switcher.tsx`, docs & deepwiki), disusun untuk plugin **Open Agent**. Konsep inti Hermes: profile = home directory terisolasi (config, `.env`, SOUL.md, memory, skills, sessions, cron) — "browser profiles untuk AI agent". Di Obsidian, vault sudah menjadi batas isolasi kasar (satu `data.json` per vault); profiles memberi isolasi **di dalam satu vault**.

---

## 0. Temuan kunci dari Hermes

- Isolasi per profile: `config.yaml`, `.env` (secret tidak bocor antar profile), `SOUL.md` (identitas), `memory/`, `skills/`, `sessions/`, cron.
- Pembuatan: `create <nama>` blank · `--clone` (config+.env+SOUL) · `--clone-all` (semua termasuk memory & sessions).
- Switch: `hermes -p <nama>` (one-off) · `profile use <nama>` (sticky) · alias binary.
- Desktop: switcher di sidebar chat, sesi per-(chat, profile), prewarm saat hover.
- Export/import profile (arsip) untuk berbagi setup.
- Backward compat: agent default = prefix lama, pengguna satu profile tak melihat perubahan apa pun.

## 1. Audit plugin kita

| Komponen | Kondisi sekarang |
|---|---|
| Persona | `PERSONALITIES` 5 preset statis → system prompt; **global** |
| Provider/model | satu aktif global (`activeProviderId`, `model`) |
| Memory | `openagent/openagent-memory/` (MEMORY.md + USER.md), satu set |
| Skills | `openagent/openagent-skills/`, satu set |
| Sessions | `.obsidian/plugins/openagent/sessions/` (JSON di luar vault), satu set |
| Switcher | belum ada konsep profile sama sekali |

Kabar baik: `MemoryStore.setFolder()` dan `SkillsStore.setFolder()` **sudah ada** — switch profile tinggal memanggilnya. `SessionStore` menyimpan `dir` di constructor → perlu `setDir()`.

## 2. Keputusan (disetujui)

1. **Isolasi penuh**: memory + skills + sessions per profile.
2. **Override dasar**: persona (pilih `PERSONALITIES` atau prompt SOUL custom) + pin provider+model opsional (`follow global` = default).
3. **Switcher**: **pill di topbar chat** + kelola penuh di tab Settings baru.
4. **Pembuatan**: Blank atau **Clone dari profile aktif**; profile **Default** terbentuk otomatis dari kondisi sekarang (migrasi, nol gangguan).

## 3. Desain

### 3.1 Model

```ts
interface AgentProfile {
  id: string;               // slug; "default" dicadangkan
  name: string;
  color: string;            // "gray" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" → var(--color-*)
  personality: string;      // key PERSONALITIES, atau "custom"
  customPersona: string;    // teks SOUL saat personality === "custom"
  providerId: string | null;  // null = follow global (settings.activeProviderId)
  model: string | null;       // null = follow global (settings.model)
  createdAt: number;
}
// settings.profiles: AgentProfile[]  (min. 1)
// settings.activeProfileId: string   (default "default")
```

- **Migrasi** di `loadSettings()` (pola `migrateMcpServers`): jika `profiles` kosong → buat `[{id:"default", name:"Default", personality: settings.personality ?? "default", providerId:null, model:null, ...}]`, `activeProfileId = "default"`. `settings.personality` lama tetap ada sebagai fallback baca.
- Resolusi efektif (di runner): `provider = profile.providerId ?? settings.activeProviderId`, `model = profile.model ?? settings.model`, `persona = profile.personality === "custom" ? profile.customPersona : PERSONALITIES[profile.personality]`.

### 3.2 Layout folder & sessions

- **Default profile memakai folder yang ada** (nol perpindahan): memory `openagent/openagent-memory`, skills `openagent/openagent-skills`, sessions `.obsidian/plugins/openagent/sessions/` (file lama tetap terbaca).
- **Profile lain**: memory `openagent/profiles/<slug>/memory`, skills `openagent/profiles/<slug>/skills`, sessions `.obsidian/plugins/openagent/sessions/<slug>/`.
- USER.md/MEMORY.md per profile → tiap identitas "mengenal" konteks berbeda (persis semantik Hermes).

### 3.3 Runtime switch

- **`src/agent/profiles.ts` — `ProfileStore`**: `list()`, `create(name, {cloneFromId?})`, `rename`, `update(id, patch)`, `remove(id)` (guard: ≥1 profile; menghapus yang aktif → pindah ke default; folder ditawari keep/trash), `duplicate`.
- **`plugin.applyProfile(id)`**: set `activeProfileId` + save → `memoryStore.setFolder(...)` → `skillsStore.setFolder(...)` → `sessionStore.setDir(...)` (method baru) → ChatApp `refreshSessions()` + clear current conversation (Notice: `Switched to <name>`).
- **Runner**: `getSettings()` meng-overlay profile aktif (provider object + model + persona). Provider settings & ModelPicker menandai saat nilai di-pin profile ("pinned by <profile>").

### 3.4 UI

- **Topbar pill** (`oa-profile-pill`): dot warna (`var(--color-*)`) + nama profile; klik → menu (pola model-picker): daftar profile dengan ✓ pada aktif + item "Manage profiles…" (buka settings ke tab Profiles).
- **Tab Settings "Profiles"** (`SectionKey "profiles"`, icon `circle-user-round`, posisi setelah Agent):
  - Daftar: dot warna · nama · ringkasan pin (`provider · model` atau "follows global") · badge "active" · aksi: Set active / Edit / Clone / Delete (Modal konfirmasi + pilihan keep/trash folder).
  - Form edit/baru: nama · swatch warna (8 pilihan) · dropdown persona (`PERSONALITIES` + Custom → textarea SOUL) · dropdown provider (`Follow global` + semua preset) · teks model (`Follow global` saat kosong).
  - Persona picker di tab Agent (yang global) → mengedit profile aktif (Default), sehingga tidak ada dua sumber persona.

### 3.5 Interplay (didokumentasikan sadar)

- **Cron/headless**: berjalan dengan **profile Default** (per-task profile = Tahap D).
- **Sessions panel**: otomatis terfilter per profile aktif (dir terpisah).
- **Tool `update_user_profile`/`save_memory`**: menulis ke folder profile aktif.
- **MCP, automations, disabledTools, approvalMode**: tetap global (sesuai keputusan override dasar).

## 3.1a Amandemen (setelah implementasi): SOUL ≠ personality

Verifikasi ke docs Hermes (`website/docs/user-guide/features/personality.md`): keduanya **lapisan berbeda** —
**SOUL.md** = identitas durable, slot #1 system prompt, verbatim + fallback identitas bawaan; **`/personality`** = overlay **level sesi** ("temporary mode switch") yang menumpuk di atas SOUL. Model awal plan (persona = preset ATAU custom-SOUL) keliru dan sudah dikoreksi:

- `AgentProfile.soul: string` — teks SOUL (kosong → `DEFAULT_IDENTITY`). `AgentProfile.personality: string` — overlay **default untuk chat baru** (`"none"` = identitas saja).
- Katalog overlay `PERSONALITY_OVERLAYS` = built-in Hermes (helpful, concise, technical, creative, teacher, kawaii, catgirl, pirate, shakespeare, surfer, noir, uwu, philosopher, hype) + mode vault (researcher, engineer, writer, librarian).
- System prompt: identitas (SOUL, slot #1) → bagian struktural → **overlay sebagai bagian TERAKHIR** dengan wrapper penguat ("overrides the default tone… commit fully"), sesuai stack Hermes (recency membuat gaya menang atas panduan umum).
- Chat: `/personality <key|none>` mengubah overlay **sesi berjalan** (tersimpan per sesi, ikut dipulihkan saat memuat chat); tanpa arg → menampilkan overlay aktif. Chat baru mulai dari default profile; **chat aktif ikut berubah saat default diubah di Settings**, sampai user meng-override eksplisit dengan `/personality` (flag `overlayExplicitRef`).
- Migrasi v1→v2 otomatis: `personality:"custom"` + `customPersona` → `soul`; key preset lama → overlay (`"default"` → `"none"`).
- Tab Agent: dropdown "Personality" kini mengatur **overlay default** profile aktif; SOUL diedit di tab Profiles.

## 4. Tahapan implementasi

| Tahap | Isi | Verifikasi |
|---|---|---|
| **A** | Model + migrasi + `ProfileStore` + runtime wiring (runner overlay, `setFolder`×2, `SessionStore.setDir`, `applyProfile`) + pill topbar minimal (switch berfungsi) | unit test store (migrasi/clone/guard delete/resolve efektif), smoke guards |
| **B** | Tab Settings Profiles lengkap (list/aksi/form/swatch warna/konfirmasi delete) + persona Agent-tab mengedit profile aktif | preview frame profiles, smoke guards |
| **C** | Polish: indikator "pinned by profile" di Model/provider, Notice switch, menu pill rapi (search saat >6 profile) | preview + pipeline penuh |
| **D** (nanti) | Profile per cron task, export/import profile, avatar di luar dot warna, prewarm saat hover pill | — |

### Catatan keamanan & batasan
- Isolasi profile adalah isolasi **data agent**, bukan sandbox file — persis disclaimer Hermes (profile tidak membatasi tool vault).
- API keys tetap global (keyring provider) — secret tidak dipilah per profile (batasan sadar vs `.env` Hermes; plugin Obsidian satu key-store per plugin).
- Menghapus profile tidak pernah menghapus folder tanpa persetujuan eksplisit (default: keep).

## 3.1b Amandemen (v0.1.172, setelah koreksi owner 2026-08-20)

Owner: *"di pengaturan profile, merujuk Hermes Desktop, personality tidak ada"* — benar.
Verifikasi byte-level `ProfileInfo` desktop + `hermes_cli/personality.py`: **`display.personality` adalah setting GLOBAL** (Settings → Chat), dan **profile Hermes TIDAK membawa personality** (hanya `name`, `display_name`, `provider`, `model`, `path`, `has_env`, `is_default`, `skill_count` + `SOUL.md`).

Amandemen terhadap model 3.1a:

- `AgentProfile.personality` **dihapus**. Profile hanya membawa `soul` (identitas) + pin provider/model + warna.
- Default overlay kini **global** `settings.personality` (= `display.personality`), diedit di tab **Chat** (dropdown "Personality"), bukan per-profile.
- `resolveOverlayKey`: sesi menang → global → null. `/personality` tetap overlay level-sesi (persist per sesi; Hermes mempersist global — divergensi kecil yang disengaja).
- Migrasi: field `personality` lama pada profile di-drop saat load (bukan dipindah ke global); `personality:"custom"` + `customPersona` tetap migrasi → `soul`.
