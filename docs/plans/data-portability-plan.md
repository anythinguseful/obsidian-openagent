---
title: "Rencana: Data & Portability (Tier 1)"
type: plan
status: done
date: 2026-07-19
tags: [openagent, data, plan]
---

# Rencana: Data & Portability (Tier 1)

> **STATUS: ✅ SELESAI & TERIMPLEMENTASI — build `2026-07-19 22:55Z`, 478 checks hijau.**
> (keputusan & desain di bawah dipertahankan apa adanya sebagai catatan)
> Lingkup & kanal sudah diputuskan lewat ask_user:
> - **Lingkup = Tier 1 penuh**: (1) Danger zone (reset 2 tingkat), (2) Export/Import settings, (3) Export/Import "soul" (profile bundle)
> - **Kanal = file vault + tombol copy clipboard** (tanpa dialog OS; jalan di desktop & mobile)

## 1. Masalah yang dipecahkan

1. Tidak ada cara reset settings dari UI (harus hapus `data.json` manual).
2. Tidak ada backup/pindah settings antar-vault; tidak ada pemulihan setelah reset.
3. Tidak ada cara berbagi/memindahkan "persona" agent (soul + personality + pins) tanpa membocorkan API key.

## 2. Prinsip desain

- **Addition, bukan reskin** (SKILL.md #5): semua UI baru = Setting rows biasa di tab yang sudah ada; tidak mengubah layout section mana pun.
- **Satu sumber kebenaran normalisasi**: logika merge/migrate settings saat ini inline di `main.ts#loadSettings`. Diekstrak menjadi `normalizeLoadedSettings(raw)` murni di `settings.ts` (tanpa import obsidian → bisa di-unit-test di `settings.test.cjs`). `loadSettings` dan **Import** sama-sama memakainya → export lama tetap kebaca di versi baru selamanya.
- **API keys tidak bocor**: redaksi default-ON untuk berbagi; header sensitif (`authorization`, `x-api-key`, `proxy-authorization`, `cookie`, case-insensitive) ikut dikosongkan.
- **Destructive = terkonfirmasi + dapat dipulihkan**: reset-everything memakai `app.fileManager.trashFile` (pindah ke trash OS — recoverable), bukan `vault.delete` permanen.
- Semua format ber-`version: 1` → importer menolak versi lebih baru dengan pesan jelas (bukan error aneh).

## 3. Format file (JSON ber-version-field)

### 3a. Settings export — `openagent/exports/openagent-settings-<YYYYMMDD-HHmmss>.json`

```jsonc
{
  "openagentExport": "settings",
  "version": 1,
  "exportedAt": "2026-07-20T09:00:00.000Z",
  "pluginVersion": "0.1.0",
  "redacted": true,
  "settings": { /* ...full settings... */ }
}
```

- `hubCache` **dikecualikan** dari export (cache; akan di-fetch ulang) → file kecil & tak basi.
- Redaksi (`includeKeys = false`, DEFAULT): tiap `providers[].apiKey = ""` + header sensitif di `customHeaders` dikosongkan. Field lain (baseUrl, customHeaders non-rahasia, katalog model per provider (`providers[].models`), cronTasks, promptSnippets, profiles+soul, dll.) ikut semua.
- Non-redaksi (`includeKeys = true`): byte-identik dengan data.json-minus-hubCache.

### 3b. Soul bundle (profile export) — `openagent/exports/openagent-profile-<slug>-<stamp>.json`

```jsonc
{
  "openagentExport": "profile",
  "version": 1,
  "exportedAt": "...",
  "profile": {
    "name": "Researcher",
    "soul": "...",
    "personality": "analyst",       // key PERSONALITY_OVERLAYS
    "customPersona": "",              // terisi bila personality custom
    "connection": { "providerId": "openrouter", "model": "…" } /* atau null */,
    "color": "#…",
    "skills": [ { "name": "…", "whenToUse": "…", "instructions": "…" } ]  // opsional
  }
}
```

- **Tanpa** `id`, `createdAt`, statistik → import selalu membuat profil baru (id via `slugifyProfileId(name, taken)` yang sudah ada).
- Tidak ada secrets by construction (connection hanya pin id+model, bukan key).
- Toggle "Include skills" (default ON bila profil punya skills): skills milik profil itu ikut.

## 4. Komponen

### 4a. `src/settings.ts` (fungsi murni — unit-testable)

```ts
export const EXPORT_SCHEMA_VERSION = 1;
export function normalizeLoadedSettings(raw: any): OpenAgentSettings;   // ekstrak dari loadSettings
export function redactSettingsSecrets(s: OpenAgentSettings): OpenAgentSettings; // deep copy
export function buildSettingsExport(s, includeKeys): SettingsExportDoc; // minus hubCache
export function parseSettingsExport(text: string): any;                 // validasi → raw settings (throws Error berpesan jelas)
export function buildProfileExport(p, skills | undefined): ProfileExportDoc;
export function parseProfileExport(text: string): ProfileExportPayload; // validasi → payload (throws)
```

### 4b. `src/main.ts`

- `loadSettings()` → `this.settings = normalizeLoadedSettings(await this.loadData() ?? {})` (perilaku IDENTIK; diverifikasi suite settings yang sudah ada).
- `importSettingsFromText(text): Promise<void>` — parse → `normalizeLoadedSettings(raw)` → assign → `saveSettings()` → `applyProfileFolders()` → `refreshViews()` → Notice.
- `resetSettings()` — `this.settings = normalizeLoadedSettings({})` (yaitu DEFAULT) → save → rebind → refresh.
- `resetEverything()` — kumpulkan folder data agent (memory+skills+sessions **per profil** via `memoryFolderFor/skillsFolderFor/sessionSubdirFor` + `openagent/cron`) → `fileManager.trashFile` satu per satu (abaikan yang tidak ada) → lalu `resetSettings()`. Notice merangkum: "dipindah ke system trash — dapat dipulihkan".

### 4c. `src/settingsTab.ts`

**Tab General — blok baru di paling bawah** (heading "Backup & Restore" (3 baris: include keys, export, import) + "Danger Zone" (2 baris reset) — v0.1.50, rows Setting biasa):

1. `Include API keys in exports` — toggle (default OFF; desc menjelaskan header sensitif ikut dikosongkan).
2. `Export settings — Save to vault` → tulis file export + Notice path (result juga tampil dekat field). `Copy` → clipboard (`navigator.clipboard.writeText`, fallback textarea-select).
3. `Import settings` → dua caranya dalam satu baris: `Paste JSON…` (modal textarea + tombol Import, pola persis Import mcp.json yang sudah ada) & `From vault file…` (FuzzySuggestModal memilih `openagent/exports/**.json`). Validasi gagal → `.oa-field-error` dekat field (bukan crash).
4. Separator.
5. **Danger zone**: `Reset settings` (button `.setWarning()`) → modal konfirmasi (judul jelas + daftar dampak + saran "export dulu"; aksi = Reset settings). `Reset everything` (`.setWarning()`) → modal konfirmasi **ketik `RESET`** (input harus sama persis sebelum tombol aktif) + daftar persis folder yang akan dipindah ke trash (dihitung live dari settings user).

**Tab Profiles:**

1. Tombol import di atas daftar: `Import profile…` — modal sama (paste / dari file vault), payload bundle → profil baru (nama tabrakan → suffix ` (2)` dst; id slugified unik). Bila `skills[]` ada → ditulis via `skillsStore.createSkill(...)` SETELAH profil dibuat & folder profil di-bind; nama skill tabrakan → suffix `(imported)`.
2. Per-baris profil: icon-button `download` "Export profile" → modal kecil: toggle Include skills + `Save to vault` / `Copy`.

### 4d. `styles.css` (blok baru di AKHIR file, berkomentar, sesuai kontrak)

Hanya yang belum ada: `.oa-data-result` (hasil export dekat field, mono kecil, ` · `-compact), `.oa-reset-modal kbd`/input match state, `.oa-modal-actions` gap. Warna danger via `var(--color-red, #f87171)` / `rgba(var(--color-red-rgb, 248 81 73), …)`. Tanpa emoji di UI (ikon Lucide via setIcon).

## 5. Rencana test

- **`test/settings.test.cjs`** (unit, settings.ts bundling standalone sudah ada):
  - `normalizeLoadedSettings({})` ≡ DEFAULT (object-equal pada kunci kunci utama); merge toolsets; migrate cron (reuse fixture yang ada).
  - Round-trip: `normalizeLoadedSettings(parseSettingsExport(buildSettingsExport(s,false)).settings)` → apiKey kosong & header authorization kosong; non-redacted mempertahankan apiKey.
  - Parser menolak: JSON rusak, `openagentExport` salah, `version` lebih baru (pesan menyebut "newer version").
  - Profile bundle round-trip; nama tabrakan → suffix; skills[ ] valid/opsional.
- **`test/smoke.test.cjs`** guards: string `openagentExport`, `normalizeLoadedSettings`, `Danger zone`, `Reset everything`, `trashFile` ada di build; toggle redaksi default OFF.
- Chat/REAL preview frames tak tersentuh (tidak ada perubahan UI chat).

## 6. Langkah implementasi (urutan)

1. `settings.ts`: ekstrak `normalizeLoadedSettings` + helpers export/import/redact (murni dulu).
2. `main.ts`: pindah ke helper; `importSettingsFromText`; `resetSettings`; `resetEverything` (trash).
3. `settingsTab.ts`: blok Data di General (10 baris Setting) + modal konfirmasi reset + modal paste + FuzzySuggest file + tombol Profiles.
4. `styles.css` blok baru di akhir.
5. Tests (settings unit + smoke guards).
6. `npm run release` (typecheck → build → 10 suites → preview → zip → verify) → ZIP SYNCED.
7. Commit git terpisah per langkah besar.

## 7. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Import settings rusak menghapus konfigurasi sekarang | Import = replace hanya setelah parse+normalize SUKSES; error → tidak menulis apa pun. Sarankan "export dulu" di deskripsi. |
| Bocornya API key saat berbagi | Redaksi DEFAULT-ON; header sensitif ikut; doc `redacted:true` tercatat di file. |
| Reset everything menghapus permanen | `trashFile` (system trash, recoverable) + modal ketik `RESET` + daftar folder live. |
| Behavioral drift akibat ekstraksi normalize | Suite settings + smoke yang sudah ada harus tetap hijau tanpa diubah (kecuali penambahan). |
| Export jadul di versi mendatang | `version` field + importer lewat `normalizeLoadedSettings` (same pipeline as app load). |

## 8. Out of scope (dicatat agar tak melebar)

Sync otomatis antar-vault, dialog OS save-as (electron), enkripsi export, export sessions/memory (beda concern; folder-nya sudah file vault biasa yang bisa disalin manual), quick-tools Tier 2 (get_backlinks/scoped search — batch terpisah bila disetujui nanti).
