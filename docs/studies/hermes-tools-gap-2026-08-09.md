---
title: "Gap Tools: Hermes Agent (desktop) vs Open Agent"
type: study
status: active
date: 2026-08-09
tags: [openagent, hermes, tools, roadmap, study]
---

# Gap Tools: Hermes Agent (desktop) vs Open Agent

Studi 2026-08-09.
**Status 2026-08-09 (v0.1.133):** 🟡 skills → ✅ (v0.1.132: `view_skill` + `manage_skill`) ·
🟡 todo → ✅ **TUNTAS** — `todo` tool, port 1:1 `tools/todo_tool.py` (merge flag, caps 4000/256,
dedupe last-wins, injeksi pasca-kompresi hanya item aktif; state ride session file, ephemeral di
headless/quick-ask). 🟡 vision_analyze → ✅ **TUNTAS** (v0.1.134: native pixels ride tool result saat model utama
vision-capable — cache sumber yang sama dengan attach; fallback = aux vision (slot baru `vision`
di auxiliary tasks) + template prompt mereka verbatim; magic-byte detect, cap 5 MB; region-crop/
konversi format sengaja di luar lingkup — jenis tak dikenal ditolak jujur). Rekomendasi #5 selesai;
🟡 delegate_task → ✅ **TUNTAS** (v0.1.135: port berbatas `tools/delegate_tool.py` — anak
terisolasi per `AgentLoop` baru, blocked-tool set mereka terpetakan ke ekosistem kita, pool
konkurensi 3, consolidated result index-sorted, sinkron dalam turn; orchestrator nesting &
output_schema & async background & pause-RPC sengaja OUT — rencana lengkap di
`plans/hermes-delegation-plan-2026-08-09.md`). **Seluruh 🟡 dari peta ini TUNTAS.** Sumber Hermes: [Built-in Tools Reference](https://hermes-agent.nousresearch.com/docs/reference/tools-reference)
(~83 tools, registry per Agustus 2026) + [Tools & Toolsets](https://hermes-agent.nousresearch.com/docs/user-guide/features/tools)
+ [fathah/hermes-desktop](https://github.com/fathah/hermes-desktop) (14 toolsets di sisi companion app).
Sisi kita: registry `src/agent/tools.ts` = **16 tools**, diverifikasi grep `name: "…"` (jumlah persis 16).

Cara baca: ✅ setara penuh · 🟡 setara sebagian / ada alternatif · ❌ belum ada.

## 1. Toolset Hermes yang SUDAH kita punya (✅ / 🟡)

| Toolset Hermes | Tool mereka | Status di Open Agent |
|---|---|---|
| `clarify` | `clarify` (single-select ≤4 + Other, multi-select, open-ended) | ✅ `clarify` — konsep sama, lahir dari studi Hermes |
| `cronjob` | `cronjob` (create/list/update/pause/resume/run/remove; id-atau-nama; anti-rekursi di headless run) | ✅ `cronjob` — mirror penuh per `plans/automations-cron-plan.md` |
| `file` | `read_file`, `write_file`, `patch`, `search_files` | ✅ bahkan lebih kaya: `read_note` (offset/limit = pagination mereka), `write_note`, `edit_note` (≈patch), `search_vault`+`list_files` (≈search_files dua mode), **plus** `delete_note` & `rename_move_note` (mereka lewat terminal) |
| `memory` | `memory` (save/recall) | ✅ `save_memory` + `search_memory` + `update_user_profile` (profil user = tool dedikasi di kita) |
| `skills` | `skill_manage` (create/update/delete), `skill_view`, `skills_list` | ✅ **v0.1.132**: `create_skill` + `list_skills` + `view_skill` (SKILL.md penuh + daftar supporting files + baca file) + `manage_skill` (patch/update/delete/write_file/remove_file) |
| `web` | `web_search` (Exa/Parallel/Firecrawl/Tavily), `web_extract` (maks 5 URL, budget 15k char, head+tail, PDF URL) | 🟡 `web_extract` ✅ (plus cache-note di vault); `web_search` ✅ **TUNTAS 2026-08-19** (ddgs/brave/tavily/searxng — `docs/plans/web-search-plan.md`) |
| `session_search` | FTS5 atas sesi lampau (discovery/scroll/read/browse) | ✅ **TUNTAS 2026-08-19** — `session_search` tool (title+content, recency-ranked, memory toolset) |
| `todo` | `todo` (task list sesi, merge, read kosong) | ✅ **v0.1.133**: port 1:1 — `todo` (baca tanpa arg, replace/merge, caps 4000/256, injeksi kompresi). goals tetap: lapisan tujuan besar, todo untuk langkah taktis sesi |
| `delegation` | `delegate_task` (subagent konteks terisolasi, final summary saja yang balik) | ✅ **v0.1.135**: `delegate_task` single/batch paralel (cap 3) — MoA tetap ada sebagai teknik ensemble, dua-duanya pelengkap |
| `vision` | `vision_analyze` | ✅ **v0.1.134**: tool `vision_analyze` (vault path/URL/data URL; native fast path pixels-in-tool-result + legacy aux; slot aux `vision` baru) — plus jalur attach native yang sudah lama ada |

## 2. Toolset Hermes yang BELUM kita punya (❌)

### Layak & masuk akal di Obsidian (kandidat backlog bernilai)

| Toolset | Isi | Kenapa menarik untuk kita |
|---|---|---|
| `web` → `web_search` | search → judul/URL/deskripsi, operator `site:` dll | Pasangan alami `web_extract`; gap paling terasa (agent kita bisa baca halaman tapi tak bisa MENCARI) |
| `session_search` | FTS5 atas sesi lampau (discovery/scroll/read/browse) | sessions.ts sudah punya store; ekspos pencarian lintas-sesi sebagai tool = memori episodik murah |
| `skills` penuh | `skill_manage` update/delete + `skill_view` | Melengkapi ⅔ yang sudah ada; murah, pola sudah terbukti |
| `todo` | task list sesi eksplisit | Beda dari goals: dangkal, cepat, agent-editable; Hermes pakai untuk tugas ≥3 langkah |
| `delegation` | `delegate_task` subagent terisolasi | Melampaui MoA (yang satu-tugas); berguna untuk riset bercabang. Berat, tapi runner kita sudah punya pola headless (cron) |
| `terminal` + `process` | shell exec + background process mgmt | MUNGKIN di Electron desktop via Node `child_process`; **risiko keamanan besar** + mustahil di mobile → kalau diambil: desktop-only, opt-in, consent keras |
| `execute_code` | sandbox Python yang bisa memanggil tools secara programatik | Mengurangi ping-pong tool-call; tapi butuh sandbox runtime — berat di plugin |
| `image_gen` | `image_generate` (backend user: FAL/OpenAI/xAI/Krea) | Provider-agnostik, polanya mirip modelCatalog kita; delivery ke vault sebagai file |
| `browser` (10+2) | navigate/snapshot/click/type/scroll/back/press/console/get_images/vision (+`browser_cdp`, `browser_dialog`) | Otomasi web interaktif; di Obsidian bisa via Playwright eksternal? Berat + dependensi native. Versi ringan: `web_extract` sudah menutup kasus baca |
| `x_search` | cari post X via kredensial xAI | Niche; hanya kalau owner pakai xAI |

### Tidak masuk akal / tidak relevan untuk plugin Obsidian (dokumentasi saja)

| Toolset | Isi | Kenapa bukan untuk kita |
|---|---|---|
| `desktop_ui` (7) | read_terminal, close_terminal, open_preview, read_preview, read_window_below, focus_pane, react_to_message | Pane milik aplikasi Hermes desktop; analog kita = workspace Obsidian (sudah: `get_active_note`, open-note, selbar) |
| `project` (3) | project_create/list/switch (workspace multi-folder) | Vault kita ADALAH workspace-nya |
| `kanban` (12) | board multi-agent (show/list/complete/block/heartbeat/comment/create/link/unblock/attach×3) | Butuh dispatcher multi-agent; tujuan jauh berbeda dari plugin catatan |
| `homeassistant` (4) | ha_call_service/get_state/list_entities/list_services | Integrasi smart-home — di luar domain vault |
| `discord`+`discord_admin` | baca/kirim/moderasi server Discord | Gateway platform messaging Hermes (16 gateway mereka); kita hidup di dalam Obsidian |
| `spotify` (7) | playback/devices/queue/search/playlists/albums/library | Plugin bundel mereka; domain hiburan |
| `hermes-yuanbao` (5) | grup/DM/sticker Yuanbao (Tencent) | Platform Cina spesifik |
| `feishu_doc`+`feishu_drive` (5) | dok & komentar Feishu/Lark | Gateway komentar Feishu |
| `computer_use` | kontrol desktop OS (cua-driver) | Kontrol kursor/layar OS dari dalam Obsidian = permukaan risiko ekstrem |
| `video`+`video_gen` (4) | video_analyze, video_generate, xai_video_edit/extend | Generasi/analisis video; berat, backend-key khusus |
| `tts` | text_to_speech → voice message | Bisa saja (speak note?) tapi prioritas rendah |
| MCP dinamis | `mcp__<server>__*` | Hermes memuat tools dari MCP server; kandidat jembatan masa depan bila MCP diminta |

## 3. Ringkasan angka (jujur)

- Registry kita: **16 tools**; registry Hermes (built-in): **~83 tools** + MCP dinamis.
- Setara penuh: **6 area** (clarify, cronjob, file-ops, memory, skills-list/create sebagian-entry, web_extract).
- Setara sebagian / alternatif: **5 area** (skills penuh, todo↔goals, delegate↔MoA, vision↔attach-native, get_active_note↔desktop_ui).
- Belum & layak: **8 area** (web_search, session_search, skill_manage penuh+skill_view, todo, delegate_task, terminal/proses (berisiko), execute_code (berat), image_gen, browser (ringan/auto berat), x_search (niche)).
- Belum & sengaja tidak diambil: **11 area** (gateway messaging, spotify, HA, kanban, desktop_ui, project, computer_use, video, feishu, yuanbao, MCP — domain Hermes-desktop/gateway, bukan domain plugin Obsidian).

## 4. Rekomendasi urutan (kalau owner mau mengejar)

1. **`web_search`** — gap paling terasa, provider-key opsional (Exa/Tavily/Firecrawl/Parallel), pasangan simetris `web_extract`.
2. **`session_search`** — sessions store sudah ada; indeks ringan → memori episodik.
3. **`skill_manage` penuh + `skill_view`** — melengkapi ⅔ → 3/3, murah.
4. **`todo`** — dangkal & cepat; pelengkap goals (bukan pengganti).
5. **`delegate_task`** — mahal tapi diferensiasi besar; pola headless cron sudah menjadi cetak biru isolasi sesi.
6. (`terminal` hanya bila owner sadar & mau: desktop-only, opt-in whitelist command.)
