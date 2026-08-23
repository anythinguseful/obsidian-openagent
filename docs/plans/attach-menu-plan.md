---
title: "Plan — Attach Menu `[+]` + `@` Inline References + Vision"
type: plan
status: done
date: 2026-07-19
tags: [openagent, ui, plan]
---

# Plan — Attach Menu `[+]` + `@` Inline References + Vision

> **STATUS: ✅ IMPLEMENTED (Tahap A + B + C) — 2026-07-19.**
> 9 test suites green (incl. `test/attach.test.cjs` baru, 45+ checks);
> real-preview frames `attach`/`snips`/`atref` live; ZIP synced.
> Catatan implementasi: harus toggle plugin OFF/ON setelah copy file baru.
>
> ~~STATUS: DRAFT — menunggu "implementasikan".~~
> Referensi UI: screenshot user (menu ATTACH berisi header seksi, item ber-ikon,
> separator, dan footer tip) + keputusan user di sesi ini.

## 1. Ringkasan keputusan user

| Keputusan | Pilihan user |
|---|---|
| Isi menu `[+]` | **Active note**, **Files (vault)**, **File browser (disk — perilaku 📎 sekarang, tetap ada)**, **Images (vault)**, **Folder (vault)**, **Prompt snippets…**, footer **tip** |
| Prompt suggestions halaman utama | **PINDAH** menjadi "Prompt snippets" — halaman utama chat jadi bersih; daftar snippet **baru di settings** (tambah/edit/hapus) |
| `@` autocomplete di composer | **Dikerjakan sekalian** (bukan nanti) |
| Gambar ke model | **Otomatis**: vision (`image_url`) bila provider/model mendukung, fallback konteks path |

## 2. Fakta kode saat ini (hasil studi)

- `UploadedFile = {id, name, content: string, size}` — teks (maks **1 MB**/file), **gambar** (maks 5 MB/file, jalur vision data URL), dan **PDF** (maks 20 MB/file, teks diekstrak lokal via pdfjs-dist fake-worker, maks 50 halaman, hasil dipangkas ke 1 MB); maks 8 file; dedup by name; jenis lain ditolak dengan pesan terukur (per 2026-07-21 dulu 256 KB "binary not supported" yang mematikan upload; 2026-07-22 PDF ditambahkan karena file nyata owner memang PDF).
- (2026-07-22, atas permintaan owner) pesan terkirim membawa **blok lampiran** di bubble user: `ConversationTurn.attachments` (meta display-only — nama/ukuran/jenis/path) dirender sebagai chip di atas teks, jadi riwayat menunjukkan persis konteks apa yang diterima model. Regenerate/edit-resend tetap mengirim teks saja (caveat terdokumentasi di runSlash `/retry`).
- Lampiran di-inline ke prompt: blok `[Attached file: <name>]` + `[Attached note: <path>]` di-prepend ke pesan user (wire); bubble user tetap teks asli (`rawPrompt`) — **pola ini dipertahankan**.
- `ChatMessage.content: string | null` — wire multimodal butuh perluasan (Tahap C); assistant/tool content tidak pernah disentuh loop → aman bila hanya pesan user yang membawa parts.
- Composer bar sekarang: `[📎 FileUploadTrigger][📄 active-note toggle] … [ModelPicker][send]` — 📎 dan 📄 **digantikan satu tombol `[+]`**; chip lampiran tetap memakai prop `attachments` yang sudah ada.
- Home chat memakai `PromptSuggestionGroup items={SUGGESTIONS}` (4 string hardcoded) → **dihapus** dari home; nilai 4 itu menjadi **seed** `settings.promptSnippets`.
- Pola popup keyboard sudah ada: slash-command popup di composer (`SLASH_COMMANDS`, sekitar baris 995 ChatApp) → pola yang sama dipakai ulang untuk `@`-popup.
- Obsidian API native untuk picker: `FuzzySuggestModal<TFile|TFolder>` (sudah dipakai pola Modal di settingsTab) — konsisten, keyboard-friendly, tidak perlu komponen baru.
- `PromptInputHandle` saat ini hanya `focus()` → perlu ditambah akses textarea untuk caret (insert di posisi kursor).
- `icons.tsx` memakai `make("<lucide-name>")` — ikon baru (`image`, `folder`, `file`, `upload`, `message-square-text`, `check`) cukup ditambah 1 baris masing-masing; **shim preview juga harus ditambah** agar real-preview tidak melempar error.

## 3. UX akhir

### 3.1 Composer

```
┌─────────────────────────────────────────────┐
│ [chip note] [chip file x] …                 │  ← attachments bar (sudah ada)
├─────────────────────────────────────────────┤
│ Ask anything…  (/ for commands)             │
│                                             │
│ [+]                                    [⏏] │  ← + | spacer | model pill | send
└─────────────────────────────────────────────┘
```

- `[+]` (`oa-attach-toggle`, `PlusIcon 12`) di pojok kiri — menggantikan 📎 dan 📄.
- 📎/📄 lama dihapus dari bar. Drag & drop ke seluruh area chat **tetap jalan** (wrapper `FileUpload` tidak diutak-atik).
- Chip lampiran (sudah ada) tetap di atas composer; chip note aktif dapat [x] untuk melepas.

### 3.2 Menu `[+]` (dropup, anchor kiri — `bottom: calc(100% + 8px); left: 0`)

```
 ATTACH
 ├ 📄 Active note: <basename>        [✓ bila aktif]
 ├ 📄 Files…              (picker note vault — md/canvas/txt)
 ├ ⬆  File browser…       (dialog OS — perilaku 📎 sekarang)
 ├ 🖼 Images…             (picker gambar vault)
 ├ 📁 Folder…             (picker folder vault)
 ├───────────────────────────────────
 ├ 💬 Prompt snippets…    (submenu)
 ├───────────────────────────────────
 └ Tip: type [@] to reference files inline.
```

- Styling mengikuti `oa-model-menu` (vars Obsidian, radius, shadow); header seksi uppercase muted; footer tip dengan `<kbd>@</kbd>` (gaya kbd vars Obsidian).
- Tutup: klik di luar / Esc / pilih item. `aria-haspopup="menu"`, item `role="menuitem"`.
- "Active note" **disabled** ("No active note") bila tidak ada file aktif; kalau sudah terlampir → ikon `check` di kanan dan klik = melepas (toggle).
- Semua item disabled saat agent sedang berjalan (selain snippets → tetap boleh insert teks).

### 3.3 Perilaku tiap item

| Item | Aksi |
|---|---|
| Active note | Toggle `attachNote` (pipeline `[Attached note: <path>]` yang sudah ada); label dinamis basename |
| Files… | `VaultFileSuggest` (FuzzySuggestModal TFile: md/canvas/txt/md lain yang text-like) → `vault.read` → `addFiles` chip |
| File browser… | Klik `inputRef` milik `FileUpload` (hidden input) → pipeline upload disk yang ada, apa adanya |
| Images… | `VaultImageSuggest` (TFile ext png/jpg/jpeg/webp/gif/bmp) → `vault.readBinary` → chip gambar (Tahap C) |
| Folder… | `VaultFolderSuggest` (TFolder) → semua md di dalamnya (rekursif) → cap **20 file / 200 KB total**; bila lebih → Notice konfirmasi ringkas + ambil 20 terbaru (mtime) |
| Prompt snippets… | Submenu inline (konten menu diganti daftar snippet + header `← Back`); klik = insert teks snippet di caret composer + fokus |

### 3.4 Prompt snippets pindah ke settings

- `settings.promptSnippets: { id: string; title: string; text: string }[]` — default seed = 4 suggestion lama:
  1. "Summarize my active note and save the summary"
  2. "Search the vault for meeting notes and list them"
  3. "What do you remember about me?"
  4. "Help me plan my week — create a note"
- Settings → seksi baru **Prompt snippets** (di tab Agent, setelah Behaviour): daftar baris (judul + preview teks 1 baris, edit ✎ / hapus 🗑), tombol **Add snippet** → modal kecil (title + textarea text). `newSnippetId()` = `snip-<ts>-<seq>`.
- Home chat: `PromptSuggestionGroup` **dihapus**; hero tetap "How can I help?" + hint diganti → `Type / for commands · @ to reference files`.
- **Migrasi**: `loadSettings` — field hilang → seed default; field ada (walau kosong `[]`) → hormati (array tidak di-merge, diganti utuh — verifikasi semantik merge saat implementasi).

### 3.5 `@` inline references (Tahap B)

- Mengetik `@` di composer membuka popup kandidat file vault (pola popup slash-command yang sudah ada): filter by substring pada basename+folder, maks 8, keyboard ↑/↓ + Enter/Tab pilih, Esc tutup; ketik spasi/hapus `@` → tutup.
- Format token yang diinsert: **`@[[path/Note.md]]`** (Obsidian-native, aman spasi, render wikilink yang sudah distyle otomatis di bubble).
- Saat send: regex `/@\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]/g` → resolve path ke `TFile` (exact → basename unik, case-insens) → masuk pipeline `[Attached file: <path>]`. Token yang tidak resolve → dibiarkan literal (Notice sekali: "1 @-reference not found").
- `@[[...]]` tidak wajib dari popup — user boleh mengetik manual.
- Catatan scope: popup tidak muncul di dalam code fence (nice-to-have, v1 biarkan — dicatat).

## 4. Vision (Tahap C)

1. **Deteksi kemampuan** (`listModelInfos(provider)` baru — picker tetap memakai `listModels`):
   - OpenRouter: `GET /models` → `architecture.modality` mengandung `image` di input → vision ✓.
   - Provider lain: heuristik nama model — `gpt-4o|gpt-4\.1|gpt-5|o4|gemini|claude-3|claude-4|claude-sonnet|llava|-vl|qwen[0-9.]*-vl|pixtral|gemma-[34]|e4b|minicpm-v|moondream|llama-3\.2-.*vision|glm-4v` (case-insens).
   - Hasil di-cache per provider+model di memori; `debugMode` log keputusan.
2. **Wire multimodal**: user message terakhir → `content: [ {type:"text",text}, ...{type:"image_url",image_url:{url:"data:image/png;base64,…"}} ]`.
   - `ChatMessage.content` diperluas `string | ContentPart[] | null` (type `ContentPart` baru di types.ts); `buildBody` lolos apa adanya; agentLoop hanya membaca content assistant/tool → aman.
   - Ukuran: cap **5 MB/gambar**, total 15 MB; sisanya → path mode + Notice.
3. **Fallback path mode** (vision tidak terdukung/tidak diketahui): blok teks
   `[Attached image: <vault path>]\n(Image file in the vault; not visually readable in this mode.)`
   — agent tetap bisa menyematkan `![[path]]` ke note.
4. Chip gambar di attachments bar: thumbnail 18px (dataURL) rounded; chip teks tetap PaperclipIcon.
5. `isTextLike`/`MAX_FILE_BYTES` milik upload disk **tidak berubah** (file browser tetap teks saja v1); gambar dari disk bisa lewat vault dulu. (Dicatat sebagai kemungkinan lanjutan.)

## 5. Implementasi per tahap

### Tahap A — menu `[+]` + pickers + snippets + file browser
- `settings.ts`: `PromptSnippet`, `promptSnippets` default+merge.
- `settingsTab.ts`: seksi Prompt snippets (list + add/edit modal + delete; guard hapus konfirmasi kecil).
- `src/ui/attach/` :
  - `attach-menu.tsx` — popover menu (state submenu snippets), a11y roles, kbd footer.
  - `vault-pickers.ts` — `VaultFileSuggest`, `VaultImageSuggest`, `VaultFolderSuggest` (FuzzySuggestModal).
- `file-upload.tsx`: export `FileUploadBrowseTrigger` (renderless button → `inputRef.click()`).
- `ChatApp.tsx`: ganti 📎/📄 → `[+]`; hapus `PromptSuggestionGroup` + `SUGGESTIONS`; hint home baru; folder attach (cap+Notice).
- `styles.css`: blok `.oa-attach-menu` (reuse var menu) + `.oa-kbd`.
- icons: tambah `ImageIcon`, `FolderIcon`, `FileIcon`, `UploadIcon`(ada), `SnippetIcon` (`message-square-text`), `CheckIcon`; **sinkronkan ke shim real-preview**.
- Harness: skenario `attach` (menu open) + `snippets` (submenu open).

### Tahap B — `@` autocomplete
- `prompt-input.tsx`: `PromptInputHandle` += `getTextarea()`.
- `ChatApp.tsx`: deteksi token `@` dari `onValueChange`+caret; popup kandidat (reuse pola slash popup); insert `@[[path]]`; ekstraksi saat send → `addFiles`; Notice untuk token tak-resolve.
- Preview bubble: token `@[[...]]` otomatis ter-render sebagai wikilink (sudah distyle) — verifikasi di real frame.
- Harness: skenario `atref` (popup `@` open).

### Tahap C — vision
- `providers.ts`: `listModelInfos`, heuristik, cache.
- `types.ts`: `ContentPart`; `file-upload.tsx`: `UploadedFile.kind: "text"|"image"`, `dataUrl?`, `path?`.
- `ChatApp.tsx`: rakit wire multimodal; path-mode fallback; chip thumbnail; cap ukuran.
- Test heuristik + perakitan wire (unit).

## 6. Test & qualitas (wajib tiap tahap)

- `tsc` → `build` → 8 suite + suite baru `test/attach.test.cjs`:
  - parser token `@[[...]]` (spasi, alias, duplikat basename, unresolved),
  - seed/migrasi `promptSnippets`,
  - cap folder (20/200KB) & cap gambar (5MB),
  - heuristik vision (tabel positif/negatif) + body wire multimodal benar.
- Smoke guard: menu `[+]` ada di markup; seksi settings snippets; ikon shim sinkron (daftar lucide shim ⊇ icons.tsx).
- Real-preview: skenario baru masuk `frames.json` + badge `● real render`.
- Ritual akhir: regenerate preview → repackage ZIP → `cmp` → **ZIP SYNCED** → present.

## 7. Risiko / catatan

- **Merge array settings**: pastikan `promptSnippets: []` user tidak tertimpa seed (cek deep-merge).
- **Shim icon preview**: setiap ikon baru wajib didaftarkan di `obsidian-shim.ts`, kalau tidak real-preview melempar error — guard di smoke test.
- **Ukuran memori**: dataURL base64 menambah ~33%; cap total 15 MB menjaga.
- **Perilaku lampiran per-send** (bukan tersimpan di sesi untuk run lanjutan) — sama seperti perilaku sekarang; **out of scope** mengubah persistence lampiran.
- **Deteksi vision heuristik** bisa salah (false positive → provider menolak gambar): fallback — tangkap error HTTP 400 yang menyebut image/modality → retry otomatis path mode untuk pesan itu + Notice (murah, robust).
