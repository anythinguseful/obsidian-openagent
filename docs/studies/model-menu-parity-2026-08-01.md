---
title: "Paritas model menu composer — Hermes Desktop (2026-08-01, v0.1.32)"
type: study
status: done
date: 2026-08-01
tags: [openagent, hermes, parity, study]
---

# Paritas model menu composer — Hermes Desktop (2026-08-01, v0.1.32)

Studi source resmi (raw `NousResearch/hermes-agent@main`):
- `apps/desktop/src/app/shell/model-menu-panel.tsx` — dropdown komposer (target kita)
- `apps/desktop/src/components/model-visibility-dialog.tsx` — dialog "Models"
- `apps/desktop/src/lib/model-status-label.ts` — `modelDisplayParts`, display names
- `apps/desktop/src/store/model-visibility.ts` — kurasi default + sentinel hide-all
- `apps/desktop/src/lib/model-search-text.ts` — teks pencarian + alias
- `apps/desktop/src/i18n/en.ts` — `shell.modelMenu` + `modelVisibility` (verbatim)

Catatan: `components/model-picker.tsx` (dialog besar "Switch model" dengan harga
dan badge Pro/Free-tier) adalah permukaan LAIN — bukan target pill komposer.

## Yang dikapalkan (nama + fungsi, byte-akurat)

**Dropdown komposer (`shell.modelMenu`)** — `src/ui/components/model-picker.tsx`:
- Search `"Search models"`; kosong → `"No models found"`.
- SEMUA provider berkatalog = grup collapsible, alfabetis per nama provider;
  urutan model mengikuti katalog (tak pernah di-sort ulang); model aktif
  tetap tampil kecuali saat mencari (official `includeCurrent` rule).
- Family collapsing (`collapseModelFamilies`): base + `-fast` → SATU baris
  di posisi base; `-fast` yatim berdiri sendiri; pin tanggal `-YYYYMMDD`
  dibuang saat alias rolling-nya ada. Baris family hasil merge menampilkan
  nama base saja (resmi: tak ada tag "Fast" — tag itu untuk id `-fast`
  mandiri / orphan).
- Display names (`modelDisplayParts` / `prettifyBase`): prefix provider
  dibuang di `/` terakhir; VARIANT_TAGS (Fast/Thinking/Preview/Latest,
  first-match); `claude-` → titleCase sisanya (resmi menampilkan "Opus 4.8",
  TANPA kata "Claude"); `gpt-` → `GPT-`; `gemini-` → `"Gemini " + rest`
  (rest TIDAK di-title-case); generik titleCase dengan dash→spasi; kosong →
  "No model". Tooltip baris: `id · fastId` (title native, tanpa aria-label
  → tak ada tooltip ganda).
- Pencarian menjangkau semua model (tanpa cap), haystack
  `${modelSearchText(id)} ${fastId} ${provider.name} ${provider.slug} ${displayName}`;
  collapse rail diabaikan saat ada query; alias `{k3: ["kimi-k3","kimi"]}`.
- Bagian bawah `"MoA presets"`, baris `"MoA: {preset}"` (semua preset
  terdaftar begitu ≥1 enabled — aturan resmi `moaPresetMatches`,
  haystack `moa ${preset}`).
- Keyboard: kbRows datar (skip grup collapsed saat tak ada query), autoIndex
  = query? pertama : baris aktif (termasuk cocok fastId); ↑↓
  preventDefault+stopPropagation; Enter commit (baris aktif hanya menutup);
  `data-kb-active` + `scrollIntoView({block:"nearest"})`.
- Footer: `"Refresh Models"` — menu TETAP TERBUKA (`preventDefault` resmi),
  ikon spin, per provider diisolasi errornya, satu Notice rangkuman;
  `"Edit Models…"` → menutup menu, membuka dialog.

**Dialog Models (`modelVisibility`)** — `src/ui/components/model-visibility-dialog.tsx`:
- Judul `"Models"` + tombol X; search `"Search models"`; kosong →
  `"No authenticated providers."`; footer `"Add provider…"` → settings provider
  (Obsidian tak punya onboarding).
- Grup provider (store collapse dibagi dengan dropdown), master tri-state
  (`0 → off`, `semua → on`, sisanya indeterminate via `el.indeterminate`).
- Kurasi default `DEFAULT_VISIBLE_PER_PROVIDER = 50`; key `slug::model`;
  sentinel `slug::` (hide-all); `resolveVisibleKeys` mempertahankan sentinel
  + mengekspansi provider yang belum disentuh; `effectiveVisibleKeys`
  membuang sentinel; toggle terakhir off menambah sentinel; re-enable
  membersihkan sentinel dan menyimpan HANYA family itu untuk provider tsb
  (provider lain tak tersentuh); featured shortlist (opsional di lib)
  diprioritaskan di atas top-N.
- State baru di settings: `visibleModels: string[] | null` (null = tak pernah
  kustomisasi) + `collapsedMenuProviders: string[]`.

## Skip terdokumentasi (dengan alasan, bukan fork terbuka)

- **Submenu effort/fast per-model + label meta baris** — resmi membaca
  capabilities + preset per model dari gateway mereka; `/v1/models` standar
  tak membawa metadata tsb (lihat §7 model-settings-parity-2026-07-30 —
  meng-gate dari tebakan nama = halusinasi). Pasangan `-fast` tetap terlihat
  via merge family + tooltip `id · fastId`.
- **Badge harga / Pro / Free-tier** — milik dialog besar `ModelPickerDialog`
  (permukaan lain), dan butuh data pricing gateway.
- **Backend `featured_models` shortlist** — lib sudah menerima `featured?`
  opsional; tak ada sumber resminya di Obsidian.

## Bukti & guard

- `test/modelMenu.test.cjs` — unit port lib (display names, families,
  visibility/sentinel, grouping, search alias) hijau.
- `test/smoke.test.cjs` blok v0.1.32 + guard tooltip hygiene (hanya flag
  title=+aria-label= SERENTAK; title= polos legal).
- Harness `menu2` (real-preview, 24 frame): grup alfabetis + family merge +
  drop pin + orphan Fast; keyboard ↓↓Enter memilih (provider, model) pair
  lintas provider; collapse persist; search menembus rail; refresh tetap
  terbuka + katalog kedua provider tertarik ulang + heal model aktif;
  dialog tri-state + sentinel + re-enable satu-satunya + "Add provider…".
- Bug yang tertangkap harness sebelum rilis: mutasi settings dari aksi menu
  tak me-render ulang → `bumpSettingsRev()` (useReducer) di tiga callback.

---

## v0.1.33 — fix band (owner report 2026-08-01)

Owner found two real-environment defects the sim could not see on first pass:

1. **Refresh Models jumped to settings.** The refresh gate was
   `p.enabled && p.baseUrl` — but every PROVIDER_PRESET ships
   `enabled: false` (nothing ever flips it), so a normal vault produced
   ZERO targets and the "configure a provider first" branch called
   `props.openSettings()`. Official refresh NEVER navigates. Fix: gate on
   the plugin's canonical `providerUsable()` (baseUrl + key, or the
   keyless locals {lmstudio, ollama, custom}); zero-usable → Notice only.
2. **Switch looked foreign.** Raw appearance:none geometry disagreed with
   Obsidian's own `.checkbox-container` toggles in Settings. Fix:
   restyled `.oa-vis-switch` with the app's exact toggle vars
   (`--toggle-s-width` 34px, thumb 15px, `--toggle-thumb-radius`,
   border 2px, is-enabled accent) so the dialog reads native.

Regression guards (same commit): sim `openSettings` spy
(`__oaSettingsOpened` must stay 0 through the whole menu2 flow — the
seed's OpenRouter now carries a test key so the connected-provider gate
still proves the 2-target refresh); smoke asserts the refresh slice uses
`providerUsable(p)` and contains no `props.openSettings()`.

---

## v0.1.34 — owner directives (2026-08-01)

1. **The switch IS the app toggle.** `.oa-vis-switch` (both hand-drawn
   variants) retired; the dialog now renders Obsidian's own
   `<span class="checkbox-container is-enabled?"><input></span>` markup,
   so any theme's toggle styling carries over verbatim. No custom switch
   CSS remains.
2. **Footer rows stack vertically.** Refresh Models / Edit Models… were a
   two-column split; they are now full-width left-aligned rows like the
   official DropdownMenuItems.

Guards: smoke v0.1.34 (checkbox-container markup, vertical footer css,
driver selector) + menu2 driver clicks `.checkbox-container input`.
