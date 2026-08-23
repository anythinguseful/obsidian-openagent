---
title: "Catatan Studi Obsidian Copilot → Open Agent"
type: study
status: done
date: 2026-08-02
tags: [openagent, copilot, study]
---

# Catatan Studi Obsidian Copilot → Open Agent

Tanggal studi: **2026-08-02** (Pontianak, WIB).
Sumber yang diverifikasi **mentah** (klon lokal, bukan README):
- `main` — **v3.3.3** (`/tmp/copilot`, klon `--filter=blob:none --depth 1`)
- `v4-preview` — cabang pengembangan aktif, kir terakhir hari yang sama
  (`358b81c refactor(settings): require Obsidian Keychain for credentials (#2719)`)
- Kedua cabang: `minAppVersion 1.11.4` (bandingkan: kita `1.5.0`)

Status: **① Preview diff SUDAH DIIMPLEMENTASIKAN** di `v0.1.58` (komit
`fb56d74`). **③ Editor context menu DIKIRIM** di `v0.1.75` (2026-08-04,
submenu Open Agent: Add/Ask/Run-skill + toggle Settings → General).
Dokumen ini arsip keputusan untuk sisa kandidat, urutan tidak mengikat.

---

## Ringkasan peta (fakta → vonis)

| Area | Fakta dari kode | Vonis |
|---|---|---|
| Composer: `writeFile`/`editFile` + ApplyView | Tool MENGAJUKAN perubahan; preview diff di leaf tersendiri; accept/reject per-hunk; bypass hanya via `settings.autoAcceptEdits` (parameter `confirmation` dari LLM sengaja diabaikan) | ✅ **Sudah diadopsi** (v0.1.58, versi inline kita) |
| Chat sebagai catatan vault | `ChatPersistenceManager` — simpan `.md` ke folder vault (project-aware), muat balik dari `.md` | ⏳ Kandidat ② |
| Menu konteks editor | Submenu "Copilot": Add selection to chat context, Quick Ask, Trigger quick command, + perintah kustom | ⏳ Kandidat ③ |
| Tool tag & waktu | `getTagList` (daftar tag + statistik, **read-only**); `getCurrentTime`, `getTimeRangeMs`, `getTimeInfoByEpoch`, `convertTimeBetweenTimezones` | ⏳ Kandidat ④ |
| Daily/random note via CLI | `obsidianDailyRead`/`obsidianRandomRead` — **lewat binary eksternal `obsidian-cli`**, SAMA SEKALI bukan vault API | ⚠️ Adopsi konsepnya saja, BUKAN implementasinya |
| API key → Keychain | v4 MENGHAPUS `encryptionService` sendiri; pindah ke `app.secretStorage` bawaan Obsidian (namespace per-vault, gate `isAvailable()`, ada UI migrasi) | ⏳ Kandidat ⑤ |
| Quick Ask (overlay CM6) | Panel melayang di atas seleksi + replace-guard + highlight persisten | ✅ TERKIRIM v0.1.81 (port: anchors, highlight factory, mapPos ReplaceGuard — divergensi di ③+) |
| Custom Command `{}` + `{activeNote}` | Perintah kustom dengan placeholder seleksi/note aktif, auto-ditambahkan bila belum ada | ✅ Dijawab v0.1.76 lewat *prompt snippets* ber-flag `ctxMenu` (teks + kutipan seleksi ke composer); placeholder `{}`/`{activeNote}` sengaja TIDAK ditiru |
| RAG / Vault QA penuh | Indeks embeddings, hybrid retriever, beberapa backend | ❌ Lewati — berat, indeks abadi |
| YouTube transcription | Lewat backend berbayar milik dev (Brevilabs) | ❌ Lewati — tidak ada jalur lokal jujur |
| Relevant Notes | `RelevantNotesView` (baru muncul di v4) — butuh indeks | ❌ Lewati (tergantung RAG) |
| Dataview di konteks | Eksekusi kueri dataview → disuntik sebagai blok XML | ❌ Lewati — dependensi plugin pihak ketiga |
| Symposium (v4) | Pipeline publish catatan → HTML tersanitasi gaya Obsidian Publish (bukan multi-agent!) | ❌ Tidak relevan |
| Arah v4: host agent eksternal | Backend `claude` (SDK in-process), `codex`, `opencode` via ACP/`@agentclientprotocol/sdk` + vault MCP client + permission modals + skills store | ❌ Bukan jalan kita — loop in-process OpenAI-compatible tetap |

---

## ② Chat tersimpan sebagai catatan vault (markdown)

**Skenario**: percakapan "Riset kucing oren" muncul sebagai berkas
`openagent/chats/2026-08-02-riset-kucing-oren.md` — ikut di-graf, ikut
hasil pencarian Obsidian, bisa dibuka tanpa plugin, dan bisa dimuat
balik jadi sesi hidup.

**Fakta dari Copilot** (`src/core/ChatPersistenceManager.ts`):
- Simpan riwayat chat ke markdown di vault; nama berkas project-aware:
  `<folder>/<projectId>__chat-<epochPesanPertama>.md`, fallback
  `chat-<epoch>.md`; folder diatur `settings.defaultSaveFolder`.
- Ada jalur **load** dari markdown kembali ke panel chat.
- Model penyimpanan ganda: repo pesan internal + mirror `.md`.

**Kondisi kita hari ini (fakta)**: sesi sudah tersimpan otomatis tiap
turn sebagai JSON di data plugin (`saveSessions`), tidak terlihat dari
vault. `/save` mengekspor transkrip SEKALI JALAN (tidak bisa dimuat).

**Sketsa desain untuk kita** — dua jalur, pilih saat implementasi:
- **A (mirror, disarankan)**: JSON tetap sumber kebenaran; berkas `.md`
  ditulis ulang otomatis tiap persist sebagai cermin manusiawi (judul
  sesi → nama berkas). Load-balik tetap dari JSON (tidak ada parser md);
  berkas md = read-only untuk manusia + graf + search.
- **B (vault-as-primary)**: sesi HIDUP di berkas md (seperti Copilot).
  Lebih vault-native, tapi perlu parser md↔turns yang jujur (parts
  tool/marker/system harus survive round-trip) — biaya & risiko jauh
  lebih besar.

**Pra-cek wajib**: (1) sanitasi judul → nama berkas (ada util kita?
Copilot punya `sanitizeVaultPathSegment`); (2) benturan dua sesi berjudul
sama (suffix tanggal); (3) pengaturan baru `chatFolder` + tombol
"Open in vault" dari panel sesi; (4) lane sim: tulis cermin ke mock
vault, buka ulang, assert isi; (5) jangan sentuh `messagesRef` wire.

**Taksir biaya**: jalur A sedang (½–1 hari kerja lane), jalur B besar.

**Tanya-jawab desain (2026-08-05, owner tanya sebelum memutuskan):**
- "Kalau user mengedit file mirror-nya?" → di jalur A: suntingan TERTIMPA
  di persist berikut (JSON satu-satunya kebenaran; sesi tak pernah
  korup oleh edit md). Rename/pindah file = fork aman — mirror hanya
  menulis path kanonik sesi, tak menyentuh file hasil rename.
- Dua opsi perilaku tercatat: (A) selalu tulis ulang + banner callout
  peringatan di atas file (direkomendasikan agent untuk v1); (B) deteksi
  suntingan luar → bekukan mirror sesi (freeze flag; jebakan: membedakan
  tulisan sendiri vs plugin sync/git).
- Keputusan owner 2026-08-05: ragu → SKIP dulu.

---

## ③ Menu klik-kanan editor + seleksi sebagai warga kota

**✅ TERKIRIM v0.1.75** (+ kedalaman settings **v0.1.76**: toggle
granular per-aksi, flag `contextMenu:` per-skill, custom action dari
prompt snippets ber-flag — jawaban kita untuk "Custom Command" Copilot
TANPA placeholder `{}`) — sketsa butir 1/2/3 di bawah menjadi:
`src/editorMenu.ts` (menu + payload + 3 Notice guard + feature-detect
submenu) → `ChatView` sink → `ChatApp` api; chip label `path L12-14`
(Copilot vocabulary, hyphen); arm skill satu sumber `armSkillOneShot`.

**Skenario**: sedang membaca catatan panjang, blok satu paragraf → klik
kanan → *Open Agent → Add selection to chat* → composer sudah berisi
kutipan + chip konteks; ketik "jelaskan maksud ini", Enter.

**Fakta dari Copilot** (`src/commands/contextMenu.ts`, `constants.ts`):
- Submenu di menu konteks editor berisi: **Add selection to chat
  context**, **Quick Ask**, **Trigger quick command**, lalu daftar
  perintah kustom user.
- Perintah-perintah itu terdaftar sebagai command palette biasa
  (`ADD_SELECTION_TO_CHAT_CONTEXT`, `TRIGGER_QUICK_ASK`, …) dan dieksekusi
  lewat `app.commands.executeCommandById`.

**Kondisi kita hari ini (fakta)**: NOL hook editor — grep
`editor-menu` kosong. Yang ada: `quoteSelection` (kutip seleksi DARI
TRANSKRIP chat ke composer), lampiran `@`-ref & file, chip konteks.

**Sketsa desain**: `workspace.on("editor-menu")` → submenu "Open Agent":
1. **Add selection to chat** — ambil seleksi dari `MarkdownView.editor`,
   kirim ke ChatView sebagai lampiran teks (naik kelas `pendingFiles`
   kita — sudah ada jalur attach teks!) + fokuskan pane chat.
2. **Ask about selection** — kutipan masuk composer prefilled (`> …` +
   kursor di bawahnya), user tinggal mengetik pertanyaan.
3. **Run skill on selection** (jalan kalau murah): daftar skill →
   `/skills use <nama>` dengan seleksi sebagai argumen — memanfaatkan
   arm-one-shot yang sudah ada, TANPA sistem perintah-kustom paralel
   (jawaban kita atas fitur "Custom Command" Copilot: tidak meniru
   placeholder `{}`, cukup skill + seleksi).

**Pra-cek wajib**: (1) kanal editor→ChatView (event/plugin state — jangan
global siluman); (2) polite-no-selection (item menu disabled + Notice);
(3) chip lampiran harus jujur mencatat sumbernya (path + baris);
(4) lane sim butir 1 & 2; (5) CM6 widget TIDAK termasuk (itu Quick Ask —
terpisah, lebih besar).

**Taksir biaya**: kecil-sedang; ROI langsung terasa.

---

## ③+ Deep dive lanjutan: settings & fitur menu konteks (2026-08-04)

Diminta owner sebelum scope diputus. Klon segar `632c1e8` (HEAD Cabang
v3/v4 hari itu), dibaca mentah: `src/commands/{index,contextMenu,type,
customCommandManager,customCommandUtils,state,quickCommandPrompts}.ts(x)`,
`src/settings/v2/components/CommandSettings.tsx`, `src/settings/model.ts`,
`src/types/message.ts`, `src/components/chat-components/{ContextBadges,
ChatContextMenu,ContextControl}.tsx`.

**Settings surface Copilot (fakta baru):**
- Custom commands = **file `.md` asli di vault** di folder
  `settings.customPromptsFolder`; body file = prompt, metadata di
  **frontmatter**: `showInContextMenu` / `showInSlashMenu` / `order` /
  `modelKey` / `lastUsedMs`. Sinkron dua arah lewat vault watcher +
  pending-write set (anti echo-loop), state in-memory via jotai.
- Settings v2 punya: folder picker, toggle
  `enableCustomPromptTemplating`, dropdown `promptSortStrategy`, modal
  editor per-command (judul/konten/flag/model), drag-order.
- **Tidak ada toggle global on/off** untuk menu konteks — granularitas
  penuhnya per-command + pindah folder.

**Feature mechanics (fakta baru):**
- Handler Add-selection: tiga Notice guard berurutan ("No text
  selected" → "No active file" → "Could not determine selection
  range"); context object `{id: uuid, content, sourceType:"note",
  noteTitle, notePath, startLine, endLine}` (1-based); **mutually
  exclusive — hanya SATU selection-context terakhir** yang disimpan;
  lalu `activateView()`.
- Label chip di chat: `L12` atau `L12-14` — **hyphen biasa, bukan
  en-dash** — dirender di ContextBadges + ChatContextMenu; chip bisa
  dilepas; bagian dari context system lebih luas (notes/folders/urls/
  web tabs + flag migrasi `includeActiveNoteAsContext`). Ada juga
  WebSelectedTextContext (url/favicon) — fitur web-plus, n/a buat kita.
- Quick Ask: `checkCallback` — **ditolak di source mode** (khusus
  reading/live-preview), meraih `editor.cm` (CM6 EditorView), panel
  overlay via `quickAskController.show(activeView, view)`.
- Placeholder pipeline quick command: `{}` = seleksi (bila prompt tak
  punya placeholder → seleksi **auto-append** terbungkus tag XML
  `<selected_text>…</selected_text>`); `{activeNote}`; `{variabel}` =
  isian user via modal (regex mengecualikan `{copilot-selection}` legacy
  dan `{[[note]]}` referensi catatan); system prompt khusus
  action-oriented (`QUICK_COMMAND_SYSTEM_PROMPT`); hasil lewat
  CustomCommandChatModal → ApplyCustomCommandModal (apply balik ke
  seleksi).

**Vonis untuk kita (memperbarui sketsa ③):**
- Butir 1: tiru bentuk handler + **label `basename L12-14` hyphen**
  + tiga Notice guard; TAPI jangan tiru slot tunggal mereka — chips
  `pendingFiles` kita (append, removable, persisten) lebih baik.
- Butir 3 **lebih murah dari taksiran awal**: skills kita ≈ custom
  commands mereka secara peran; quick-pick cukup **FuzzySuggestModal
  native** (tanpa UI picker baru di composer); mesin berat mereka (md +
  frontmatter + watcher + templating + chat modal) **tidak ditiru**.
- Settings kita: satu toggle global di General (default ON) — jujur dan
  kecil, vs granularitas per-command mereka yang butuh frontmatter infra.
- Quick Ask overlay CM6: ✅ TERKIRIM v0.1.81 — `src/quickask/`
  (anchors/highlight/replaceGuard/extension/controller/overlay/panel),
  command `openagent-quick-ask` + item menu konteks + toggle Settings.
  Parity: gate source-mode (Notice), multi-turn tools-OFF, system prompt
  verbatim, `<selected_text>` hanya turn pertama, Copy/Insert/Replace
  (guard 7-reason), Esc tutup. Divergensi v1 (disengaja, boleh
  menyusul): tanpa drag/resize; positioning fixed-ke-viewport (rAF,
  karena layout-read ilegal selama CM update); tanpa konteks
  {activeNote}; tanpa picker model di panel (ikuti koneksi chat aktif);
  tanpa retry/failover (Copilot juga direct); Notice berprefiks
  "Open Agent: "; abort menyimpan pertanyaan (Copilot rollback).
  Tambahan v0.1.85 (di luar Copilot): chip saran panel kini CUSTOM via
  prompt snippet — flag opt-in keempat `quickAsk` di baris Settings →
  Commands; ≥1 flagged → chip = judul snippet (klik stage text, bisa
  diedit — aturan staging sama seperti semua permukaan snippet lain);
  tak ada flagged → bawaan balik. Getter live per-open.
- v0.1.82 (permintaan owner "kalau prompt-kit bisa diterapkan lebih
  mantap"): panel dibangun ulang di atas port prompt-kit kita —
  ChatContainer (stick-to-bottom + ScrollButton), Message/Actions +
  CopyAction, Markdown untuk jawaban final (pre-wrap saat streaming),
  Loader typing, PromptInputAction send/stop, suggestion chips (hanya
  MENGISI input, tak pernah auto-send). Lebar+posisi panel diklamp ke
  rect editor (parity contentLeft/Right).

## ③++ Commands settings tab (terkirim v0.1.77 — owner 2026-08-04)

Arahan owner: tiru *experience* CommandSettings Copilot, **pengaturan
model per-command sengaja TIDAK diikuti (model kita global)**, dan slash
di composer vs aksi di editor adalah dua permukaan berbeda fungsi.

- **Tab baru "Commands"** (icon `terminal-square`, setelah Chat):
  subheading *Editor context menu* (master + 3 aksi bawaan, pindah dari
  General) dan *Custom commands* (tabel prompt snippets).
- **Kolom parity Copilot**: urutan manual (panah ▲▼ — pengganti jujur
  dnd-kit tanpa dependency), **In Menu** (klik-kanan editor) dan
  **Slash** (menu `/` composer) per baris, aksi edit/duplicate/
  delete-armed; tombol *Restore defaults* (armed dua-klik) + *Add
  command* (baru mulai terlihat di KEDUA permukaan — parity
  `EMPTY_COMMAND`).
- **Dua permukaan, dua fungsi (persis butir owner)**: In Menu → teks
  snippet + kutipan seleksi ke composer (v0.1.76); Slash → grup
  "Snippets" baru di popover `/` composer, klik = `fill:` teks penuh
  ke input (persis semantik slash Copilot).
- **`{variable}` templating akhirnya DIADOPSI di v0.1.78** (owner minta
  tips Copilot di form — tips tanpa perilaku = UI bohong): `{}` =
  seleksi (inline saat aksi editor; saat kirim dari composer pakai
  seleksi live editor, kosong → token luruh), `{[[Judul]]}`/`{activeNote}`/
  `{#tag1, #tag2}` = note ter-resolve menjadi blok `[Attached file]`
  lewat pipeline yang sama dengan `@[[refs]]` (`src/agent/promptTokens.ts`
  murni; resolusi vault di `runAgent`). Divergensi sadar & terdokumentasi:
  tag = properti frontmatter saja (bukan inline body, sesuai tips);
  sapuan tag di-cap 24 (paritas cap composer) + Notice; token gagal-
  resolve DISEBUT di Notice (Copilot diam-diam membuang); `{activeNote}`
  tak ikut ganda saat chip attachNote aktif (catatan itu sudah riding
  sebagai prefix). Toggle ON/OFF tampil di composer = kolom **Slash
  Cmd** yang sudah ada sejak v0.1.77.
- **Tetap ditinggalkan dengan sadar**: file-.md-command berikut
  frontmatter-nya (sistem kita satu sumber: `promptSnippets` di
  settings), strategi sortir Recency/Alphabetical (kita: manual saja).
- Tombol ikon baris v0.1.76 ber-evolusi jadi kolom toggle In Menu yang
  sesungguhnya (flag tetap hanya ditulis saat ON); sisa lama dihapus
  (disiplin dead-code purge).

---

## ④ Tool kecil vault-native: tag + waktu (+ konsep daily note)

**Skenario**: "catat epiphani ini ke daily note hari ini, tag
saja #ide"; agent memakai tool deterministik, bukan menulis file
sembarangan.

**Fakta dari Copilot**:
- `TagTools.ts` — SATU tool: `getTagList` — daftar semua tag di vault
  + statistik kemunculan. **Read-only.** (Tidak ada add/remove tag.)
- `TimeTools.ts` — empat tool: `getCurrentTime` (jam + timezone),
  `getTimeRangeMs` (**bahasa alami → rentang ms**, dipakai memberi makan
  `localSearch` mereka), `getTimeInfoByEpoch`, `convertTimeBetweenTimezones`.
- `ObsidianCliDailyTools.ts` — `obsidianDailyRead`/`obsidianRandomRead`
  dijalankan LEWAT binary eksternal `obsidian-cli`. **Jangan ditiru
  implementasinya** — dependensi proses eksternal di luar vault API.

**Sketsa untuk kita** (toolset vault, deterministik):
- `list_tags` — read-only, + jumlah kemunculan (seperti Copilot; jujur,
  murah via metadataCache).
- `get_current_time` — ISO + timezone lokal; pasangan cron/prompt waktu.
- `daily_note` (konsep, BUKAN via CLI) — baca/buat daily note hari ini:
  hormati setting Daily Notes core (format tanggal + folder, dibaca dari
  konfig internal Obsidian bila tersedia; fallback `Daily/YYYY-MM-DD.md`
  didokumentasikan). Append lewat jalur `write_note` yang sudah
  di-preview (otomatis ikut gerbang v0.1.58 ✓).
- `getTimeRangeMs`: masuk kandidat HANYA bila search_vault kita
  mendapatkan filter rentang — jangan tambahkan tool tanpa konsumen.

**Pra-cek wajib**: (1) deskripsi tool jujur (batasan format tanggal,
fallback folder); (2) daily-note settings API internal — verifikasi
ke sumber Obsidian saat implementasi, catat level klaim; (3) lane sim:
canned memanggil `daily_note`, assert write mendarat lewat preview
(bukan bypass); (4) smoke anchor pola yang sama dengan tool lain.

**Taksir biaya**: kecil per tool; daily-note yang paling "rapuh konvensi".

---

## ⑤ API key → Obsidian Keychain (`app.secretStorage`)

**Skenario**: `data.json` vault kamu bocor tersalin (sync konflik,
backup publik) — hari ini kunci API ikut plaintext di dalamnya; dengan
Keychain, yang bocor hanya referensi, kuncinya tetap di keychain OS.

**Fakta dari Cabang v4** (`src/services/keychainService.ts`, commit
`#2719`):
- `encryptionService` buatan sendiri DIHAPUS; wajib memakai
  `app.secretStorage` bawaan Obsidian.
- Kunci di-namespace per-vault (`getVaultId()`), gate
  `isAvailable() = !!app.secretStorage`, ada jalur migrasi + UI-nya di
  Advanced Settings.
- Copilot minApp **1.11.4** — mereka bebas menaikkan; kita di 1.5.0.

**Kondisi kita (fakta)**: kunci provider disimpan apa adanya di
settings (tersimpan di `data.json`); fitur Backup & Restore punya toggle
"Include API keys in exports".

**Sketsa untuk kita**:
- Gate ketersediaan (TANPA menaikkan minApp): bila
  `app.secretStorage` ada → simpan `secretRef` di settings, kuncinya di
  keychain; bila tidak ada → perilaku hari ini, + banner jujur di
  Settings ("kunci disimpan lokal plaintext — upgrade Obsidian untuk
  Keychain").
- Migrasi bertahap: saat saveSettings, kunci plaintext yang ada
  dipindahkan sekali jalan lalu lapangan plaintext dikosongkan.
- Export/Import: "Include API keys" mengekspor dari keychain (bukan
  dari field plaintext); impor menulis ke keychain.
- Riset wajib sebelum implementasi: ketersediaan `secretStorage` di
  Obsidian versi lama & **mobile** — level klaim HIPOTESIS sampai
  diverifikasi ke dok/changelog resmi; fallback harus terbukti di lane.

**Taksir biaya**: kecil-sedang; nilai keamanan nyata; risiko utama =
support matrix versi.

**Riset support matrix TERVERIFIKASI 2026-08-05 (siap eksekusi saat dilanjut):**
- `app.secretStorage` `@since 1.11.4` (d.ts obsidian 1.13.1; changelog
  resmi: SecretStorage + SecretComponent + settings "Keychain"). Copilot
  menaikkan minApp 1.7.2→1.11.4 demi ini; kita tetap 1.5.0 + gate
  `!!app.secretStorage` (divergensi yang sudah direncanakan).
- API bertipe: `setSecret(id, secret): void`, `getSecret(id): string|null`,
  `listSecrets(): string[]`. `deleteSecret` ADA di runtime tapi TIDAK ada
  di type defs → feature-detect, fallback `setSecret(id, "")` tombstone
  (pola `removeSecret` Copilot). ID: lowercase alnum+dash, maks 64 char;
  storage global per-app → wajib namespace plugin+vault.
- Vault ID (pola Copilot): hash basePath 8-hex di desktop (deterministik),
  random di mobile, dipersist di settings. Untuk kita: FNV-1a basePath →
  `_keychainVaultId`; tak perlu dependensi md5.
- Kondisi kita memudahkan: 7 provider preset fix (id slug) → ID
  `openagent-v{vid}-api-key-{providerId}` aman by construction;
  `saveData()` hanya SATU callsite (`saveSettings`) → chokepoint tunggal;
  export membaca dari memory → hampir tak perlu diubah.
- Catatan jujur: forum melaporkan 1.11.4 menyimpan plaintext di Local
  Storage → klaim kita hanya "kunci keluar dari data.json" (kebocoran
  sync/backup), BUKAN enkripsi at-rest.
- Scope yang disodorkan: apiKey saja (header kustom sensitif tetap
  perilaku lama + ter-redact di export).
- Fork terakhir (migrasi otomatis vs opt-in ala Copilot) disodorkan ke
  owner 2026-08-05 — owner: ragu → SKIP dulu. Fakta di atas siap pakai.

---

## ⑦ Riset: Custom Prompt Folder (Copilot) — VERIFIED 2026-08-05 @ 632c1e8

Sumber: `src/commands/` (customCommandUtils/Register/Manager/type/migrator/
constants), `src/constants.ts`, `src/settings/v2/components/CommandSettings.tsx`.

**Konsep**: prompt = FILE .md di folder vault; tiap file otomatis jadi
perintah Obsidian (command palette). Folder default `copilot/copilot-custom-prompts`
(setting `customPromptsFolder`; sanitize: trim, kosong → balik default).

**Format file**: hanya anak langsung folder (subfolder diabaikan); judul =
basename file (validasi menolak `#<>:"/\|?*[]^` + spasi pinggir + duplikat
case-insensitive). Frontmatter (5 kunci verbatim):
- `copilot-command-context-menu-enabled` (OPT-OUT: default true — EMPTY_COMMAND)
- `copilot-command-slash-enabled` (OPT-OUT: default true)
- `copilot-command-order` (seed 1000/1010/…; file baru tanpa order → max+10)
- `copilot-command-model-key` ("" = ikuti model aktif; isi = pin model utk command itu)
- `copilot-command-last-used` (ms; diupdate tiap pakai → sort recency)

**Siklus hidup**: vault watcher create/delete/rename/modify, debounce 1000ms
TRAILING (komentar verbatim: frontmatter belum ter-update saat modify event
mendarat); guard `pendingFileWrites` supaya tulisan sendiri (ensureFrontmatter,
recordUsage) tidak memicu loop. Registrasi = `addCommand({ id:
encodeURIComponent(title.toLowerCase()), name: title, editorCallback })`;
hapus/rename lama via `app.plugins... removeCommand` (API privat, di-cast).
ensureCommandFrontmatter idempoten (hanya mengisi yang kosong) saat
create/rename.

**Eksekusi**: editorCallback → `CustomCommandChatModal` (mode menu:
autoExecuteOnOpen=true) = modal chat streaming multi-turn BERDASAR mesin
yang sama dengan Quick Ask mereka (SelectionHighlight + ReplaceGuard +
Copy/Insert/Replace!), system prompt default "You are a helpful assistant…";
perubahan model di modal = session-only (tidak menimpa modelKey file).

**Template (processCommandPrompt→processPrompt; settings
`enableCustomPromptTemplating` default true)**:
- `{}` → ditulis ulang `{selected_text}`; seleksi ditempel inline sebagai
  `<selected_text>\n…\n</selected_text>`; TANPA seleksi → konten active note
  (`type="active_note"`); keduanya tak ada → literal "(No selected text or
  active note available)".
- `{copilot-selection}` (LEGACY) → replace inline mentah.
- Prompt TANPA placeholder apapun + ada seleksi → APPEND `\n\n<selected_text>…</…>`.
- `{[[Judul Note]]}` → konten note inline sebagai blok `<note_context>`
  (title/path/ctime/mtime/content).
- `{activeNote}` (case-insensitive), `{activeWebTab}` (reserved web context).
- `{#tag1,tag2}` → semua note bertag; `{nama/variabel}` → note per path
  (getNotesFromPath); dibungkus `<variable_note>` per note lalu dirujuk
  `<variable name="…">`.
- Semua tambahan ditempel SETELAH prompt asli dipisah `\n\n`. Templating OFF
  → prompt mentah + `\n\n`.
- Sort slash menu via `promptSortStrategy` (default TIMESTAMP=recency,
  pakai lastUsedMs; alternatif alphabetical/manual-order).

**Seeding**: modal konfirmasi SATU KALI (`suggestedDefaultCommands`) jika
belum ada command: "add Copilot recommended commands?" — 16 DEFAULT_COMMANDS
(Fix grammar and spelling, Translate to Chinese, Summarize, Simplify,
Explain like I am 5, Emojify, Make shorter/longer, …, Clip YouTube
Transcript, Clip Web Page) — semua bergaya `{}`. Legacy lama dimigrasi;
yang tak cocok dipindah ke subfolder `unsupported/`.

---

## ⑧ Riset: System Prompt Folder (Copilot) — VERIFIED 2026-08-05 @ 632c1e8

Sumber: `src/system-prompts/` (type/state/utils/manager/register/builder/
constants), `src/constants.ts` (DEFAULT_SYSTEM_PROMPT verbatim 8 aturan),
`ChatSettingsPopover.tsx`.

**Konsep**: system prompt = FILE .md di folder vault (default
`copilot/system-prompts`; setting `userSystemPromptsFolder` di
AdvancedSettings). Satu bisa jadi **default global persisten**
(`settings.defaultSystemPromptTitle`, default `""` = tak ada), dan
pemirsaannya dicerminkan KE FILE frontmatter
(`copilot-system-prompt-default: true`) — ramah sync antar-device.
Frontmatter lain: created/modified/last-used (ms).

**State dua lapis** (jotai atoms, register via systemPromptRegister):
- SESSIOn (melekat pada chat yang sedang terbuka): `selectedPromptTitle` +
  `disableBuiltinSystemPrompt`. Di-reset saat new-chat / load history;
  saat load plugin diisi dari default global. Dipilih lewat
  **ChatSettingsPopover** (ikon gear di header chat): dropdown prompt,
  toggle "disable builtin" DENGAN dialog konfirmasi, tombol buka file
  sumber di tab baru.
- PERSISTEN: `defaultSystemPromptTitle` di data.json.

**Komposisi efektif** (getSystemPrompt, prioritas session > global > ""):
builtin DEFAULT_SYSTEM_PROMPT (8 aturan verbatim) + jika ada user prompt:
`<user_custom_instructions>\n…\n</user_custom_instructions>` DITEMPEL di
belakang. disableBuiltin-true → user prompt BERDIRI SENDIRI menggantikan
builtin. Memory user di-prepend di depan semuanya. Legacy
`settings.userSystemPrompt` dimigrasi ke file TETAP dihormati sbg fallback.

**Watcher**: pola identik ⑦ (debounce + pending writes + cache atoms).

**Relasi ke kita (catatan desain, bukan fakta Copilot)**: kita sudah punya
(a) system prompt global agent (built per Settings), (b) profiles+mood
(personality per profil), (c) Quick Ask system prompt khusus. ⑧ alami =
lapis AD-HOC tambahan persis pola wrapper mereka: builtin-kita =
komposisi kita saat ini, file system-prompt = user_custom_instructions,
dengan toggle session "ganti total" berkonfirmasi seperti Copilot.

---

## Antrian saran (bukan komitmen)

1. ③ menu editor + ④ tag/time — quick wins (nilai/biaya terbaik).
2. ② jalur A (mirror md otomatis).
3. ⑤ keychain (butuh riset support matrix dulu).
4. Quick Ask / custom-command — evaluasi ulang SETELAH ③ berdiri.
5. **Custom prompt folder** → RISET SELESAI (§⑦, 2026-08-05) lalu
   DITAHAN owner (2026-08-05): fork paradigma disodorkan (file-as-truth
   vs hybrid vs read-only vs tahan), rekomendasi jalan bertahap
   (tahap-1: templating `{}`/`{[[note]]}`/`{#tag}`/`{activeNote}` di
   snippet yang ada tanpa ganti storage) — owner memilih mengendapkan
   kedua topik dulu. Fakta+rekomendasi di atas siap pakai kapanpun.
6. **System prompt folder** → RISET SELESAI (§⑧, 2026-08-05), ikut
   DITAHAN bersama ⑤ oleh owner (2026-08-05). File .md + default
   persisten dicerminkan frontmatter + override session bereset,
   komposisi wrapper <user_custom_instructions> di atas builtin —
   relasi ke profiles/personality kita belum diputus, bahan lengkap.

*Ditulis oleh agent saat rilis v0.1.58; sumber: dua klon cabang di atas,
dibaca langsung, bukan dari dokumentasi sekunder.*
