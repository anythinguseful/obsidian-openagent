---
title: "UI Audit — 2026-07-19"
type: audit
status: done
date: 2026-07-19
tags: [openagent, ui, audit]
---

# UI Audit — 2026-07-19

Dilakukan dengan skill **`web-design-guidelines`** (Vercel, vendored di
`agents/skills/vendor/vercel/web-design-guidelines/reference/`) di atas scope UI produksi
(`styles.css`, `src/settingsTab.ts`, `src/ui/ChatApp.tsx`, `src/ui/components/*`,
`src/main.ts`), dalam batas kontrak **`openagent-ui`**. Obsidian-native widgets
(`Setting`, dropdown, toggle Obsidian) sudah membawa a11y bawaan — audit fokus ke
markup kustom kita.

## Temuan & status perbaikan

### styles.css
| Lokasi | Temuan | Status |
|---|---|---|
| :104-108 | `.oa-app button:focus-visible` membunuh ring default; hanya tab-nav/settings-tab yang punya ganti → icon-btn, oa-btn, slash-item tak punya focus terlihat | ✅ fallback ring `:focus-visible` global |
| :134-138 | hal yang sama untuk input/textarea/select | ✅ ring `:focus-visible` |
| :984/:1244/:2338 | menu/panel/profile search input `:focus` tanpa ring | ✅ override `:focus-visible` |
| — | 8 `@keyframes`, nol `prefers-reduced-motion` | ✅ blok reduce global (v2: movement mati, indikator status tetap hidup sebagai opacity pulse — diverifikasi headless Chromium `test/dist/anim-run.cjs`) |
| — | tak ada `overscroll-behavior: contain` di surface scroll modal/menu | ✅ ditambah |
| — | heading tanpa `text-wrap: balance` | ✅ ditambah |
| — | `tabular-nums` hanya 1 tempat | ✅ cron history/chip count/note |

### src/settingsTab.ts
| Lokasi | Temuan | Status |
|---|---|---|
| :1160 | hub chip × = `<span title>` → tak focusable/keyboard | ✅ jadi `<button aria-label>` |
| :1435 | skills toggle div: aria-label tapi tanpa role/tabindex/keyboard | ✅ role=checkbox + tabindex + Space/Enter + aria-checked |
| :1457 | skills row expand via `<div>` click → tak bisa keyboard | ✅ role=button + tabindex + aria-expanded |
| :1827 | cron history `<a>` tanpa href + onclick → tak focusable | ✅ jadi `<button>` |
| :487/:1060 | search inputs (skills, hub) hanya placeholder | ✅ aria-label |
| cron dot | status dot: title saja | ✅ role=img + aria-label |

### src/ui/ (React)
| Lokasi | Temuan | Status |
|---|---|---|
| ChatApp.tsx:721/746/749/1132/1135 | icon-only buttons: `title` saja, tanpa aria-label | ✅ aria-label ditambah |
| ChatApp.tsx:1062 + file-upload.tsx | FileUploadTrigger tak meneruskan aria-label | ✅ prop `ariaLabel` |
| ChatApp.tsx:1141, profile-picker.tsx:79, model-picker.tsx:74 | search inputs tanpa aria-label | ✅ ditambah |
| prompt-input.tsx:67 | composer textarea tanpa aria-label | ✅ "Message Open Agent" |
| PromptInputAction | tooltip → aria-label | ✓ sudah benar |

## Pass / tidak relevan (dicatat sadar)
- `…` unicode sudah dipakai di semua string user-visible; curly quotes umum dipakai.
- Destructive actions: profile delete punya confirm modal ✓; cron delete langsung — **disengaja** (data catatan tidak ikut terhapus; task bisa dibuat ulang, konsisten dengan pola Obsidian settings lain). Skill delete langsung — reviu nanti bila user minta.
- Modals memakai `Modal` Obsidian (Esc/close bawaan ✓) + overlay kita pakai backdrop click.
- `transition: all`: nol kejadian ✓. `<div onClick>` navigasi: nol ✓ (yang ada: expander lokal).
- Notice missed-run: tombol native `<button>` berlabel teks ✓.

## Kontrak proyek yang menang atas saran skill
- frontend-design mendorong palet/font khusus → **ditolak**: tema = CSS vars Obsidian (lihat `agents/skills/internal/openagent-ui/SKILL.md`).
- `<meta theme-color>`, `color-scheme`, preconnect, dsb → milik Obsidian (app host), bukan plugin.
