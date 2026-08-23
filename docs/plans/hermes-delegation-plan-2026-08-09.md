---
title: "Rencana: delegate_task — subagent terisolasi (port Hermes)"
type: plan
status: done
date: 2026-08-09
tags: [openagent, hermes, delegation, plan]
---

# Rencana: delegate_task — subagent terisolasi (port Hermes)

Studi 2026-08-09 · sumber: `tools/delegate_tool.py` @ NousResearch/hermes-agent `main` (192.445 B,
dibaca byte-level seksi kunci: schema, depth, blocked tools, approval, dispatch, result, prompt anak).
Penutup antrian "tuntaskan yang sudah ada" (gap-doc 🟡 #4).

## 1. Temuan kunci dari sumber asli

| Aspek | Fakta dari source |
|---|---|
| Bentuk panggilan | `delegate_task(goal, context?, tasks[]?, role?, output_schema?)` — single (`goal`) ATAU batch (`tasks[{goal, context?, role?, output_schema?}]`) |
| Isolasi | Anak = instance agen baru, konteks BARU (system prompt anak + user = goal); hanya **summary akhir** yang balik ke parent |
| System prompt anak | "You are a focused subagent…" + TASK + CONTEXT + instruksi summary ketat ("lead with outcomes, bullet points, don't replay process") + catatan depth literal (anti-halucinasi kemampuan nesting) |
| Kedalaman | Default **flat** (max_spawn_depth=1 efektif: parent→child; leaf tak bisa spawn). `role:"orchestrator"` membuka nesting bila depth memungkinkan; error menyebut depth + peringatan biaya API berlipat |
| Tool terlarang anak | `delegate_task`, `clarify`, `memory` (menulis MEMORY bersama!), `send_message`, `cronjob` (tak boleh menjadwalkan atas nama parent) |
| Approval di anak | default **auto-deny** (aman; opt-in yolo via config) — anak tak pernah menyentuh UI parent |
| Konkurensi | batch jalan paralel, default **max 3 anak** (config); hasil digabung SATU result terurut per task_index, ikon ✓/✗ per tugas |
| max_iterations | nilai dari model **diabaikan** — config authoritative (default 50) |
| Timeout | default tanpa timeout (opt-in config) |
| Ringkasan | per task, dicap (MAX_SUMMARY_CHARS 24000, disesuaikan budget konteks parent); entry: subagent_id, status, summary, error?, duration_seconds, api_calls |
| Kill switch | pause-spawn operator (RPC) membekukan fan-out baru tanpa mengganggu anak berjalan |
| output_schema | anak diberi kontrak di depan; parent validasi jawaban akhir + SATU retry koreksi terbatas |
| Top-level async | versi desktop: delegasi top-level berjalan background, result masuk kembali saat SELESAI (chat tak terblok); delegasi DARI subagent = sinkron |

## 2. Adaptasi ke Open Agent (batasan Obsidian)

| Keputusan | Alasan |
|---|---|
| **Sinkron dalam turn parent** (join batch, paralel cap 3) — DEVIASI terdokumentasi dari background-async mereka | Async memerlukan mesin re-entry pesan saat idle yang belum kita punya; bentuk sync-in-turn ini persis pola MoA kita (paralel + agregasi dalam satu turn) DAN persis jalur sync mereka untuk depth>0. Live status menampilkan progres per tugas |
| Anak = `AgentLoop` baru per tugas, history `[system(childPrompt), user(goal)]` — via `runner.makeContext()` yang sama (memory/skills/cron-context bersama) | Isolasi konteks persis semantik mereka; AgentLoop kita sudah objek murni tanpa state global (bukti: MoA menjalankan banyak completion paralel dalam satu turn) |
| Tool anak = tool parent MINUS `delegate_task`, `clarify`, `save_memory`, `update_user_profile`, `cronjob`; todo ephemeral per anak otomatis | Port DELEGATE_BLOCKED_TOOLS mereka; pemetaan jujur: memory mereka save+recall satu tool → kita blok 2 tool TULIS, `search_memory` (read-only) BOLEH |
| Approval anak = deny | `events.requestApproval` tak dipasang di loop anak → agentLoop kita sudah default `?? "deny"` — port alami `_subagent_auto_deny` |
| `role`: schema punya enum leaf/orchestrator, tapi v1 **hanya leaf**; orchestrator → error jujur "nesting belum diaktifkan" | Depth config + prompt block mereka hanya masuk akal lengkap; setengah matang = konfabulasi persis yang diperingatkan source-nya |
| `output_schema`: v1 **ditolak jujur** ("belum didukung") | Validator JSON Schema setengah lebih buruk daripada tidak ada; janji kontrak yang tak bisa ditegakkan = dusta pada model |
| `max_iterations` arg model diabaikan (AgentLoop pakai `settings.maxIterations`) | Paritas "config authoritative" tanpa kerja tambahan |
| Summary cap 8000 chars/task + marker (lebih ketat dari 24000 mereka — konteks chat kita lebih kecil) | Mencegah summary raksasa memenuhi wire parent |
| Timeout: tanpa (paritas default mereka); abort parent menjalar ke anak via `events.signal` yang sama | Observability lewat live status; kill-switch pause-RPC tak ada bandingannya di plugin |
| Result: satu JSON `{results:[{task_index,status,summary,error?,duration_seconds}]}` terurut | Paritas bentuk batch mereka (subagent_id/api_calls internal mereka tak punya arti di sini) |

## 3. Permukaan teknis

- `src/agent/delegate.ts` (baru): `DelegateApi { run(tasks: DelegateTaskSpec[], signal?): Promise<DelegateResultEntry[]> }` + builder `childSystemPrompt(goal, context)` (port teks mereka) + `DELEGATE_BLOCKED_TOOLS` + `formatConsolidatedResult(entries)` + concurrency pool (3) + summary cap.
- `tools.ts`: tool `delegate_task` (toolset baru `"delegation"`, default on) + `ctx.delegation?: DelegateApi`; desc mengajarkan kapan (≤→) TIDAK mendelegasikan (blok WHEN NOT dari source).
- `runner.ts`: pass-in `makeDelegateApi()` — membangun loop anak dari `getTools()` minus blocked + `makeContext()` segar + abort-signal induk; onProgress opsional (dicolok ChatApp ke live status; headless cron: no-op).
- ChatApp: colok `delegateProgress` → `setLiveStatus("Delegating… 2 tasks remaining")` (garis spinner mereka: `🔀 N tasks remaining`).
- Anti-recurs alami: anak tak pernah melihat tool `delegate_task` (blocked) + cronheadless punya ephemeral todo jadi setiap anak juga ephemeral (pola v0.1.133).

## 4. Bukti (witness & red-proof)

- Unit (tools.test): single/batch terurut, prefetch-error (goal kosong/task tanpa goal), cap konkurensi (maks 3 aktif bersamaan — dihitung via counter), summary cap, orchestrator/output_schema ditolak jujur, blocked-tools tak pernah mencapai ctx anak (spy ctx: save_memory cs absen; search_memory HADIR).
- Live loop (agent-loop.test): tool `delegate_task` dengan DelegateApi mock → result terkonsolidasi masuk wire sebagai tool message; anak gagal sebagian → entri error tetap terurut ✓/✗.
- Smoke guard v0.1.135 + red-proof standar (stash → merah → pop).

## 5. Implementasi → v0.1.135

Satu versi: store/util + tool + runner api + UI status + 2 suite test diperluas + guard + docs. Gap-doc: delegate_task 🟡 → ✅ menutup antrian 🟡 sepenuhnya.
