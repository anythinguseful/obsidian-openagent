---
title: "Rencana: Automations — Cron Scheduler ala Hermes Agent"
type: plan
status: done
date: 2026-07-19
tags: [openagent, automations, cron, plan]
---

# Rencana: Automations — Cron Scheduler ala Hermes Agent

> **STATUS: Tahap A+B+C ✅ (2026-07-19) · Tahap D ✅ (2026-07-19)** — Tahap A+B+C: scheduler v2 + tool `cronjob` + UI. **Tahap D**: `[SILENT]` marker · skills injection per task · repeat count (auto-complete) · context chaining · delivery notice. Semua field baru opsional — perilaku default task lama tidak berubah.

Hasil studi fitur cron **Hermes Agent** (docs user-guide/features/cron, developer-guide/cron-internals, `apps/desktop/src/app/cron/`), disusun untuk plugin **Open Agent**. Prinsip: ikuti model job & lifecycle Hermes, sesuaikan dengan batasan Obsidian — plugin hanya hidup saat Obsidian terbuka (tidak ada gateway daemon).

---

## 0. Temuan kunci dari Hermes

- **Model job** (`jobs.json`): `{id, name, prompt, schedule:{kind,expr,display}, skills[], deliver, repeat:{times,completed}, state, enabled, next_run_at, last_run_at, last_status, run_count}`.
- **4 format jadwal**: one-shot `30m` · interval `every 2h` · **cron 5-field** (`0 9 * * *`) · timestamp ISO.
- **Lifecycle penuh** lewat SATU tool `cronjob` (create/list/update/pause/resume/run/remove) — agent mengatur jadwalnya sendiri dari chat; cron session **tidak boleh** membuat cron job (anti runaway).
- **Output per-job** di `output/{job_id}/{timestamp}.md`, execution ledger dengan `last_status` + `run_count`.
- **UI Desktop**: preset schedule (hourly/daily 09:00/weekdays/weekly/monthly/every-15-min/custom), status dot (scheduled/running=primary, paused=amber, error=red, completed/disabled=muted), run history per job.
- **`[SILENT]` marker**: hasil run yang diawali `[SILENT]` tidak dikirim (untuk monitoring "lapor hanya bila ada masalah").

## 1. Audit automation kita sekarang

| # | Masalah | Dampak |
|---|---|---|
| 1.1 | Hanya `intervalMinutes` | **Drift** — "tiap hari" = N menit setelah run terakhir, bukan jam tetap |
| 1.2 | `lastRun` di-set sebelum run, tanpa `lastStatus` | Task gagal terlihat "sudah jalan" |
| 1.3 | Tak ada edit (hapus + buat ulang) | UX buruk |
| 1.4 | Tak ada riwayat run | Sukses/gagal tak kasat mata |
| 1.5 | Append terus ke satu note | `Reports.md` membengkak |
| 1.6 | Tool `dangerous` auto-deny saat headless | Task bisa gagal diam-diam → harus terlihat di status |
| 1.7 | Tak ada tool `cronjob` untuk agent | Automasi hanya dari settings |

## 2. Keputusan (disetujui)

1. **Jadwal**: preset dropdown (hourly / daily 09:00 / weekdays / weekly / monthly / every 15 min) + **custom cron expression 5-field** dengan parser mini buatan sendiri (tanpa dependency).
2. **Missed runs**: **tanya via Notice** saat Obsidian dibuka — "N automation(s) missed while away" dengan tombol **Run all now** / **Skip**.
3. **Output**: **keduanya** — arsip per-run di `openagent/cron/runs/<task>/<timestamp>.md`, target note tetap di-append ringkas (hasil + link ke arsip).
4. **Tool agent**: `cronjob` (create/list/update/pause/resume/run/remove) sekalian, dengan guard anti-rekursi.

## 3. Desain

### 3.1 Model task baru

```ts
interface CronTask {
  id: string;
  name: string;
  prompt: string;
  schedule: { kind: "preset" | "cron"; expr: string; display: string };
  targetNote: string;
  enabled: boolean;               // false = paused
  nextRun: number;                // epoch ms, dihitung dari expr
  lastRun: number;
  lastStatus: "ok" | "error" | null;
  lastError?: string;
  runCount: number;
  createdAt: number;
}
```

- **Migrasi** dari `{intervalMinutes, lastRun}` → `schedule = {kind:"preset", expr:`*/N * * * *` atau ekuivalen, display:`every N min`}`; `nextRun = lastRun + N menit`; `runCount = 0`. Migrasi di `loadSettings()` (pola yang sama dengan `migrateMcpServers`).
- Preset = sekumpulan expr: `every-15-min` `*/15 * * * *` · `hourly` `0 * * * *` · `daily` `0 9 * * *` · `weekdays` `0 9 * * 1-5` · `weekly` `0 9 * * 1` · `monthly` `0 9 1 * *` (mengikuti `SCHEDULE_OPTIONS` Hermes Desktop).

### 3.2 Parser cron mini (`src/agent/cron.ts`)

- Field: `menit jam hari-bulan bulan hari-minggu`; token: `*`, `*/n`, `a`, `a-b`, `a,b,c`; hari-minggu 0–6 (0=Minggu).
- `nextCronRun(expr, fromMs)`: scan menit per menit ke depan (maks 366 hari) — sederhana, benar, cukup cepat untuk tick per menit.
- Validasi dengan pesan error berbahasa manusia untuk form.
- Label display: hasil preset → label preset; custom → expr apa adanya.

### 3.3 Scheduler (`main.ts`)

- Tick per menit (sudah ada). **Guard overlap**: set `runningTasks: Set<id>` — task yang sedang jalan tidak di-retrigger.
- Saat due: `lastRun = now`, jalankan `runCronTask`; setelah selesai: `runCount++`, `lastStatus`, `lastError?`, **`nextRun = nextCronRun(expr, now)`**, simpan.
- **Missed-run**: di `onload`, kumpulkan task `enabled && nextRun < now`. Jika ada → `Notice` interaktif: "N automation(s) missed while Obsidian was closed." + tombol **Run all now** (jalan berurutan dengan jeda 2 dtk antar task) / **Skip** (recompute nextRun dari now). Notice custom (`DocumentFragment` untuk tombol).
- **Failed runs tetap menjadwalkan nextRun** (linear, tidak retry burst) — mirip Hermes (state error tapi next_run_at tetap dihitung).

### 3.4 Output (sesuai keputusan "both")

- Arsip: `openagent/cron/runs/<safe-task-name>/YYYYMMDD-HHmm <task>.md` — berisi prompt, status, durasi, output penuh.
- Target note di-append ringkas:

```markdown
## <task name> — <timestamp>
✅ ok · <durasi>s · [arsip](<link>)
<output>
```

- Durasi run diukur (`Date.now()` sebelum/sesudah).

### 3.5 UI Automations (settingsTab)

- **Daftar task** dengan: status **dot** berwarna (hijau=ok/scheduled, kuning=paused, merah=error, abu=disabled) + nama + baris meta (`display jadwal` · `next: <relatif>` · `last: ok/error <relatif>` · `×N runs`). Style mengikuti pola settings yang ada (setting-item, bukan kartu baru).
- Aksi per task: toggle enable (pause/resume), extra buttons: **play** (run now), **pencil** (edit), **trash-2** (hapus).
- **Form add/edit** (satu komponen, mode ganda): name · prompt · dropdown preset jadwal + input custom cron (muncul saat preset=custom, validasi live via parser) · target note. Edit memakai form yang sama terisi nilai task.
- **Run history sederhana**: blok expandable per task menampilkan 5 arsip terakhir (vault list di folder runs) dengan link.

### 3.6 Tool `cronjob` untuk agent

- `toolset: "skills"`? Tidak — toolset baru **`automations`**? Tetap 4 toolset: masukkan ke `vault`? Keputusan: toolset **`skills`** kurang tepat; buat toolset baru `"automations"` + toggle di Capabilities (konsisten dengan arsitektur toolset kita).
- Actions: `create | list | update | pause | resume | run | remove` (mirip Hermes `cronjob_tools.py`). `update/pause/resume/run/remove` menerima **id ATAU nama** (case-insensitive; nama ambigu → tolak dengan daftar kandidat, persis guard Hermes).
- **Anti-rekursi**: tool aktif di chat normal; di **headless cron run** tool `cronjob` dikeluarkan dari daftar (`runHeadless` meneruskan flag; runner memfilter). Sesuai larangan Hermes: cron session tidak boleh membuat cron.
- Karena cron run headless: laporkan jika output dicapai via tool yang di-deny approval — sudah tercatat via `lastStatus`/`lastError`.

## 4. Tahapan implementasi

| Tahap | Isi | Verifikasi |
|---|---|---|
| **A** | `src/agent/cron.ts` (parser + next-run + validasi), model `CronTask` baru + migrasi, scheduler overlap-guard + lastStatus/runCount/nextRun benar, missed-run Notice, output arsip+ringkas | unit test parser (banyak kasus), test migrasi, smoke update |
| **B** | UI: list ber-status + aksi play/edit/trash, form add/edit dengan preset+custom validasi live, run history 5 terakhir | preview frame automations baru, smoke guards |
| **C** | Toolset `automations` + tool `cronjob` (semua action, id/nama lookup, anti-rekursi saat headless) | tools.test + agent-loop test untuk guard |
| **D** (nanti) | `[SILENT]` marker, skills injection per task, repeat count, context_from chaining, delivery Notice-ringkas opt-in | — |

### Catatan keamanan
- Cron run = agent tanpa pengawasan → tool `dangerous` tetap auto-deny (kecuali mode yolo); kegagalannya kini **terlihat** lewat `lastStatus: error` + notice error.
- Custom cron divalidasi ketat di form (tidak ada input jadwal tak valid masuk settings).

### Di luar scope (dokumentasi sadar)
- Gateway daemon / jalan saat Obsidian tertutup — mustahil dari plugin; mitigasi = Notice missed-run.
- Fan-out delivery (telegram dll.) — plugin Obsidian: target = vault note + Notice saja.
- `monitor_script` (skrip sebagai sumber monitor) — butuh eksekusi file lokal; `monitor_url` dikirim lebih dulu, `monitor_script` menyusul bila eksekusi tersedia.
- `script`/`no_agent` (watchdog tanpa LLM) — masih tertunda (butuh sandbox eksekusi).

## Tahap E — monitor + keamanan prompt (DONE 2026-08-19)
## Tahap F — script / no_agent watchdog (DONE 2026-08-19)

Paritas Hermes `script` + `no_agent` (cron_tools.py):

- **Lokasi & batas keamanan** — skrip hidup di `.obsidian/plugins/<id>/scripts/` (config dir yang SUDAH dilindungi workspace policy) → agent tidak bisa membaca/menulis/menanam skrip; hanya user yang menaruh file. Nama = basename ketat (`sanitizeScriptName`: tolak traversal, leading dot, path).
- **Eksekusi** — desktop-only, `execFile` (tanpa shell) via `require("child_process")` LAZY (tanpa import Node statis; mobile tidak pernah memuatnya); interpreter berdasarkan ekstensi (`.sh`/`.bash` → bash, `.js` → node, `.py` → python3); timeout 30 dtk, output 64 KiB, stdin tertutup, env minimal (PATH/HOME/temp saja — tanpa secret ambien).
- **Dua mode** — `script` (stdout di-inject ke prompt agent sebagai konteks) · `noAgent` (stdout = deliverable, di-append verbatim ke target note, TANPA panggilan LLM — watchdog klasik).
- **Saling eksklusif** dengan `monitorUrl` (ditolak di `newCronTask` + UI + tool). Kegagalan skrip = status `error` + notice (tidak pernah fail-silent).
- Migration passthrough `script` (disanitasi) + `noAgent`.

Test: 10 kasus baru di `cron.test.cjs`; smoke guard v0.1.147c; SECURITY.md mencatat batas jujur (skrip TIDAK disandbox — sama seperti Local backend terminal).

## Tahap E — monitor + keamanan prompt (DONE 2026-08-19)

Paritas Hermes `monitor_url` + scan keamanan cron (`cron_tools.py`):

- **Monitor change-detection** — `monitorUrl` pada `CronTask`; tiap tick fetch URL (bounded: timeout 30 dtk, cap 256 KB), hash byte-exact (`cronHash` FNV-1a 32). Tidak berubah → **agent run di-skip seluruhnya** (arsip "no change", target note tak disentuh); berubah → blok `[Monitor change detected]` (unified diff via `diff` + konten baru, bounded) di-prepend ke prompt. Fetch gagal → fail-open (run normal). Reset hash saat URL diganti.
- **Scan keamanan prompt** (`scanCronPrompt`) — strip unicode tak-terlihat (zero-width/bidi/C0) selalu; temuan secret-variable / exfil / prompt-injection dilaporkan (Notice + tool result), bukan diam-diam dibuang. Diterapkan di create/update (tool + UI form) DAN strip runtime (defense-in-depth terhadap data.json suntingan tangan).
- Migration passthrough `monitorUrl` / `monitorLastHash` / `monitorLastContent` (validasi URL + hash).

Test: 10 kasus baru di `cron.test.cjs`; smoke guard v0.1.147b.

---

## Tahap D — keputusan implementasi (2026-07-19)

### Model (`CronTask` tambahan — semuanya opsional)
- `skills?: string[]` — nama skill yang jadi fokus task ini
- `maxRuns?: number | null` — cap N run → auto-complete (null/absent = ∞)
- `chainContext?: boolean` — output run sebelumnya ikut ke prompt run berikutnya
- `notify?: boolean` — Notice saat run terjadwal sukses (run manual selalu Notice; error selalu Notice)
- `lastOutput?: string` — output run terakhir ≤2000 char (bahan chaining)
- Derived: `isCronCompleted(t) = t.maxRuns != null && t.runCount >= t.maxRuns`
- Migrasi: v2 passthrough dengan type-check; v1 → undefined. `buildTaskPrompt()` murni untuk chaining, `isSilentOutput()` untuk marker.

### Perilaku
1. **`[SILENT]`** — output `trimStart` diawali `[SILENT]` → **skip** compact append ke target note; arsip tetap ditulis (status `ok · silent`); scheduled-finish tanpa Notice (kecuali `notify`); manual run → Notice "finished silently — archived". Ledger `lastStatus: "ok"`.
2. **Skills injection (prompt-side)** — blok `[Task focus skills]` berisi `whenToUse + instructions` skill terpilih di-prepend ke prompt task. Nama tak ditemukan → Notice + lanjut dengan yang ada. `runHeadless(prompt, { extraPrompt })`.
3. **Repeat count** — selesai run & `runCount >= maxRuns` → `enabled=false`, `nextRun=0`, Notice selesai. Re-enable manual diizinkan (run berikutnya langsung complete lagi — satu run per resume; terdokumentasi).
4. **Context chaining** — `chainContext && lastOutput` → prompt jadi `[Previous run output (<human time>)]\n"""\n<lastOutput ≤2000>\n"""\n\n<prompt>`. Run silent tetap ikut chaining.
5. **Delivery notice** — sukses terjadwal non-silent + `notify` → Notice `✅ <name> → target (Xs)`. (Default false: cron tidak berisik.)

### Tool `cronjob` (create/update/list)
Args baru: `skills` (koma), `max_runs` (number; 0 = ∞), `chain` (bool), `notify` (bool). List line: `skills:a,b` · `2/3 runs` · `chain` · `notify` · `completed`. Deskripsi tool mengajarkan `[SILENT]`.

### UI settings · automations
Form baru: **Skills** (chip multi dari loaded skills), **Max runs** (number, 0=∞), **Chain run context** (toggle), **Notify on run** (toggle). List: dot **completed** (muted) + bit meta. Frame 7 statis: field form + baris completed diperbarui.

### Test
`cron.test.cjs` tambah: passthrough migrasi, `isSilentOutput`, `buildTaskPrompt` (skills+chain), completion transition, cronjob create/update args baru.

### DONE (2026-07-19)
Seluruh Tahap D terimplementasi — catatan implementasi akhir vs keputusan di atas:
- **Skills injection & chaining digabung di `buildTaskPrompt(task, skillDocs, prevRunAt)`** (murni), lalu `runHeadless(runPrompt)` polos — `runHeadless` tetap punya `opts.extraPrompt` untuk pemakaian lain. Urutan akhir: `[Previous run output…]` → `[Task focus skills…]` → prompt task.
- **Fix label chaining**: `task.lastRun` di-set ke waktu mulai *sebelum* prompt dibangun, jadi timestamp header chain diambil dari `prevRunAt` yang ditangkap lebih dulu (`const prevRunAt = task.lastRun` di `runCronTask`) — kalau tidak, header selalu menampilkan "sekarang".
- `lastOutput` disimpan **dengan** marker `[SILENT]` bila ada (mengajari model pola silent berulang pada task monitor); arsip tetap menyimpan output penuh.
- Smoke guards Tahap D di `smoke.test.cjs`; frame 7 statis: baris completed (dot hollow) + bit `skills 1 · notify` + form Focus skills chips / Max runs / Chain / Notify. Total 115 cek cron hijau, 9 suite hijau.
