---
title: "Paritas slash command composer — Hermes Desktop (2026-07-31)"
type: study
status: done
date: 2026-07-31
tags: [openagent, hermes, parity, slash, study]
---

# Paritas slash command composer — Hermes Desktop (2026-07-31)

Studi source resmi (raw `NousResearch/hermes-agent@main`, file persis):
- `apps/desktop/src/lib/desktop-slash-commands.ts` — registry kanonik (627 baris)
- `apps/desktop/src/app/chat/composer/hooks/use-slash-completions.ts` — popover (301)
- `apps/desktop/src/app/session/hooks/use-prompt-actions/slash.ts` — dispatcher (1083)
- `apps/desktop/src/app/chat/composer/slash-refs.ts` — chip/pill hydration (106)

## Fakta resmi — arsitektur

**Satu tabel kebenaran** (`DESKTOP_COMMAND_SPECS`): tiap command punya nama,
alias, deskripsi, `surface` (cara dipenuhi), `argumentMode`, dan flag
`hidden`. Semua hal — gating eksekusi, saran popover, filter katalog, help —
turun dari tabel ini. Tak ada block-list paralel.

**4 surface + 1 penanda:**
- `action` — handler lokal client (new, branch, yolo, wake, handoff,
  profile, skin, title, help, browser, journey, pet, hatch, compress).
- `picker` — buka overlay (`/model`, `/resume`); arg yang diketik diselesaikan
  picker. `/model` sengaja `hidden` dari popover (picker-nya hidup di status
  bar — popover tak boleh buntu di inline completion).
- `rpc` — RPC gateway khusus langsung (`/save` → session.save, `/status` →
  session.status, `/title` → session.title) — mem-bypass slash.exec supaya
  tak kena timeout pipe + noise "not a quick/plugin/skill command" (#44456).
- `exec` — jalan di backend via slash.exec, output teks inline.
- `unavailable` — command Hermes yang memang tak punya UI desktop; alasan
  ditampilkan (30 terminal-only, 2 messaging, 2 settings, 6 advanced).

**argumentMode**: `options` (daftar opsi hingga — bisa commit jadi chip),
`text` (prosa bebas), `mixed` (subcommand + prosa; `/resume` sengaja mixed
karena arg = pencarian bebas multi-kata).

**Popover**: fetch `commands.catalog` saat "/" polos (section ber-grup:
Commands / Skills / Options), `complete.slash` saat mengetik
(dengan `replace_from` untuk arg-stage — arg stub ditulis ulang jadi token
utuh). `/resume <q>` dijawab client-side: fuzzy title/preview/id, 7 sesi
inline + baris "Browse all sessions…". Skill commands diperingkat by usage
(most-used dulu; bare "/" mem-prune built-in yang tak pernah dipakai — tapi
pencarian tak pernah menyembunyikan match). Cache ber-epoch
(`slash-completion-cache.ts`).

**Chips**: command tanpa arg di posisi awal → pill ter-commit; skill
reference boleh chip di tengah kalimat; regex menjaga `/usr/local` (path,
bukan command). Teks hasil paste/restore di-hydrate dengan aturan yang sama
persis dengan yang diketik (slash-refs.ts).

**Dispatcher**: `/title <nama>` → RPC session.title (bare → exec).
`/compress [focus]` → RPC session.compress dengan `focus_topic` opsional,
in-flight coalescing anti double-enter, transcript diganti dari hasil —
bubble yang dirangkum benar-benar hilang dari layar + usage/title ikut
ter-update. Exec output di-append sebagai pesan system; toast bila belum
ada sesi.

## Yang SUDAH ada di plugin kita (12)

/new · /model · /personality · /skills · /memory · /usage · /compress ·
/retry · /undo · /learn · /stop · /help — popover prefix-match statis
(maks 6, tanpa grup), tanpa alias, tanpa arg-completion, tanpa chip.

Catatan kesetaraan: /personality kita = official (options); /help ✓;
/stop ✓; /retry ✓; /undo ✓; /usage ✓. /skills kita TETAP disediakan
meski desktop meng-unavailable-kannya (dikelola di sidebar) — pilihan sadar
kita; /memory kita pun punya (desktop: `/journey` memory graph, beda).

## GAP — diurutkan untuk konteks kita (Obsidian, provider lokal, kita pemilik session store)

### Batch quick (semua mesinnya sudah ada — risiko rendah)
1. **`/title <nama>`** — saat ini TIDAK ADA cara sama sekali memberi judul
   manual (grep `rename` di ChatApp: nol; panel pun tak punya). Official:
   bare `/title` menunjukkan judul sekarang. Implementasi: set
   sessionTitleRef + persist + refresh list.
2. **Aliases resmi** — /reset→/new, /compact→/compress, /commands→/help,
   dst. Kita: nol alias. Map kecil di SLASH_COMMANDS.
3. **`/version`** — kita sudah punya build stamp (lesson 17); slash-nya
   belum. Tampil versi + stamp + minAppVersion.
4. **`/queue <teks>` (+/q)** — enkapsulasi `enqueueEntry` yang sudah ada
   (v0.1.12). Official: exec, argumentMode text.
5. **`/resume [query]`** — official punya picker+inline fuzzy; kita: buka
   panel Conversations dengan search terprefill arg (search panel sudah
   ada). Bare /resume = buka panel.

### Batch menengah (satu arc)
6. **Arg-aware completion** — argumentMode options/text/mixed: /personality
   melengkapi kunci overlay, /model melengkapi katalog provider aktif;
   popover ber-grup (Commands/Skills/Options) + meta live.
7. **Skill commands di palette** — official: skill user muncul sebagai
   /nama-skill (grup Skills) dan tereksekusi. Kita: skills hanya auto-load
   / via /skills list. Perlu katalog dinamis (bukan list statis) + semantik
   eksekusi lokal (suntik SKILL.md ke prompt? keputusan desain).
8. **`/status`** — ringkas: model, mode approval, usage sesi, judul, profil.
   Kita pemilik semua state — murah, satu notice turn.
9. **`/save`** — official: transkrip ke JSON. Obsidian-natural: tulis
   transkrip ke vault (openagent/exports/*.md) + Notice path-nya.
10. **`/profile <nama>`** — ProfilePicker UI sudah ada di composer; slash
    + arg-completion dari daftar profil melengkapi (applyProfile sudah ada).
11. **`/approvals <manual|cautious|yolo>`** — toggle mode approval inline
    (sekarang settings-only). Tinggal tulis setting + Notice.

### Arc terpisah (butuh keputusan / mesin baru)
12. **Chips/pills composer** — rework UI nyata (rich editor, hydration
    paste/undo — slash-refs.ts). Nilai tinggi tapi menyentuh prompt-input.
13. **`/branch` (/fork)** — official: cabang dari pesan TERAKHIR ke chat
    baru. Session store kita mendukung copy messages → sesi baru + switch.
14. **`/goal <teks|status|pause|resume|clear>`** — standing goal per sesi
    yang disuntik ke konteks tiap turn. Mirip mekanik sessionOverlay kita;
    tetap mesin baru + UI status.
15. **`/steer <teks>`** — koreksi run yang sedang berjalan setelah tool call
    berikutnya (bukan antri giliran). Menyentuh agentLoop langsung.

### Tidak applicable / nilai kecil di plugin
/wake, /handoff, /skin, /pet, /hatch, /browser, /agents, /background,
/rollback (analog Obsidian = core File Recovery), /debug, /journey, /yolo
(tercakup /approvals), /tools (sudah jadi tab Capabilities), + seluruh daftar
terminal-only resmi.

## Rekomendasi urutan

Batch quick (1–5) dulu — semuanya membungkus mesin yang sudah teruji,
risiko render kecil, nilai langsung terasa (terutama /title: lubang fungsi
nyata, dan /resume). Lalu /status + /save + /profile + /approvals. Chips +
skill-in-palette + /branch + /goal + /steer = arc berikutnya atas persetujuan
owner.

## Status (2026-07-31 malam)

Batch quick DIKIRIM di v0.1.20 atas pilihan owner: /title (+bare show ·
hanya cara rename yang ada), alias resmi (/reset /sessions /switch /q
/compact /commands, lowercase-normalized seperti resmi), /version (define
__OA_VERSION__ dari manifest), /queue (+/q — strip token di busy-branch,
drain edge-independent), /resume (panel + search prefill arg). E2E
scenario "slash" (14 REAL frames) + harness sessions.search mirror. Batch
menengah & arc terpisah tetap terbuka di backlog.

## Status 2 (2026-07-31 malam, v0.1.21)

Batch menengah DIKIRIM: /status · /save (transkrip markdown →
openagent/exports, folder diekspor settings) · /profile (id atau nama,
lewat applyProfile asli) · /approvals (manual|cautious|yolo, live) +
arg-stage popover (argumentMode options/mixed: /personality overlay,
/approvals modes, /model katalog aktif, /profile ids — klik mengisi
composer, Enter mengeksekusi). E2E scenario "slash2" (15 REAL frames).
Sisa terbuka: skill commands di palette + grup popover (Commands/Skills/
Options), chips, /branch, /goal, /steer.

---

## Status append 3 — v0.1.22 shipped (2026-07-31, "skills in the palette")

**Upstream moved since this study was written** (re-verified raw the same day):
the desktop app restructured `src/features/**` → `src/app/**`; the four files
are the same, contents unchanged in the parts we mirror. Trust the tree
(`git/trees/main?recursive=1`) over any hard-coded path in this doc.

Shipped:
- **Skills → slash palette with group headers.** Bare `/` now renders the
  official group order `['Commands','Skills','Options']` (raw:
  `use-slash-completions.ts`): a `Commands` header over the command rows, a
  `Skills` header over up to 4 installed skills. Clicking a skill **stages**
  the typed verb `/skills use <name> ` in the composer (desktop completions
  fill text; Enter sends) instead of firing blind.
- **`/skills` verbs, cli parity.** Raw `hermes_cli/commands.py` documents
  `Args: name (list|read): name`; we ship `list`, `read`, `use`. `read`/`use`
  arm a ONE-SHOT skill context (`[Skill: name]\n<instructions>`, 4 KB cap) that
  rides the next message to the model and self-consumes — including for skills
  whose frontmatter says `enabled: false` (a typed verb always reaches the
  skill; the system-prompt catalog stays the `enabled`-only path).
- **Aliases** `/skill`, `/search`, `/use` → `/skills` (hidden from the palette,
  lowercase-normalized — the official alias rule already in place).
- **Arg-stage completion for /skills**: verbs first; after `read`/for `use` +
  space, skill names complete as options.
- Harness: scenario **slash3** (16 REAL frames) — group-header order, verb
  staging, disabled-skill read, one-shot injection witnessed on the wire, and
  the second message going out clean.

Deliberately not shipped: embedding the skill body via the gateway's
`[IMPORTANT: …]` scaffold (that's a backend projection of *invoked* skill
commands — our parity honors its spirit: display text vs model text split was
already plumbed via `turn.parts` + `displayText` in the queue), quick-command
creation, usage-ranked ordering (`commands.catalog.skills` map needs a
gateway), and `/skill:create` (our `/learn` + create_skill tool already cover
authoring).

Still open (unchanged): **chips/pills** (composer rich-text rework),
**/branch**, **/goal**, **/steer**.

---

## Status append 4 — v0.1.23 shipped (2026-07-31, "/branch")

Next item in the open queue, shipped: **`/branch` (alias `/fork`)** — the chat
fork. Raw sources studied same-day: `desktop-slash-commands.ts` row
("Branch the latest message into a new chat", action `branch`) and the
`forkBranch()` handler in `use-session-actions/index.ts` (session.branch RPC
→ child seeded with `branchMessages`, linked `parent_session_id`, auto
lineage title `branchTitle(siblings+1)`, child opens as its own tab while the
parent stays put).

Local parity (no gateway; everything in the vault):
- Parent **stays byte-stable**: the child session is a fresh JSON file with
  regenerated turn ids, its own `messages` copy and `parent: <parentId>`
  lineage on both `Session` and `SessionMeta` (panel list carries it too).
- Lineage naming: `<parent title> — Branch N`, N = existing siblings + 1.
- The child becomes the ACTIVE chat; running `/branch` mid-turn is refused
  with a Notice (Hermes branches a settled view), empty chats say "nothing
  to branch yet".
- Harness: scenario **branch** (17 REAL frames) — child on disk with the
  parent link, lineage title, active-chat switch, parent wire **byte-for-byte
  identical** after the child grows, and the child's wire growing alone.

Deliberately deferred (same note as desktop's own roadmap): per-message
branch affordances and the worktree (`use-composer-branch.ts`) coding flow —
that file is about git worktrees, a different "branch" entirely; our vault
has no working-copy concept to mirror it with.

---

## Status append 5 — v0.1.24 shipped (2026-07-31, slash chips, FULL rework)

Owner picked the full contenteditable rework (over transcript-only or
overlay). What shipped:

- **`src/ui/composer/chips.ts`** — the pure ruleset, `SLASH_COMMAND_RE`
  byte-for-byte from `slash-refs.ts` plus the DOM (de)serialization helpers.
  Chippability is injected (same split as `desktop-slash-commands.ts` →
  `chippableKind`): **no-arg commands chip only at token 0** (`args:` now
  honestly marks the arg-takers — /title /resume /profile /approvals /model
  /personality /queue /learn /compress /skills never chip), **skills chip
  anywhere**, committed = trailing space, `/usr/local` safe.
- **`prompt-input.tsx` rebuilt on contenteditable.** Chips are atomic
  `contenteditable=false` spans (Backspace deletes the whole pill — the
  browser gives atomicity for free). Plain text stays the data model:
  chips serialize back to `/name`, so submit/drafts/queue edits/at-refs
  are untouched; a caret shim (`ComposerHandle`) answers the old
  `getTextarea()` call shape. Hydration mirrors desktop: external writes
  (prefill, queue restore) scan `trailingCommitted: true`, typing fires
  on the committing space, paste inserts then hydrates inertly, blur
  commits a settled tail.
- **Typed `/skill-name` runs as the Hermes skill dispatch** (default branch
  of runSlash): with args it runs now with the skill riding and the bubble
  showing the invocation; bare it arms one-shot (= /skills use).
- **Transcript pills** (`ChipText`): sent user bubbles render the same
  scan, so composer and history can never disagree (directive-text.tsx).
- Harness scenario **chips** (18 REAL frames): space-committed command chip,
  mid-message skill chip, path guard, atomic delete via real backspace,
  paste hydration with a trailing token, `/beta-skill …` dispatch witnessed
  on the wire, bubble pills.

---

## Status append 6 — v0.1.25 shipped (2026-07-31, /goal Ralph loop)

The last big study item of the composer parity arc. Verified against
`hermes_cli/goals.py` + `apps/desktop/src/store/goals.ts` (raw source):
a standing goal, judged after **every** turn ("is the goal satisfied by
the last reply?"), with the loop driven by ordinary user-role
continuations — never hidden system prose. What shipped:

- **`src/agent/goals.ts`** — the ruleset. Constants byte-equivalent to
  `goals.py`: max 20 turns, judge budget 4096 tokens, 4000-char reply
  snippet, **fail-open** on judge failure, auto-pause after 3 consecutive
  parse failures / 5 transport failures. Continuation carries the official
  `[Continuing toward your standing goal]\nGoal: …` prefix as an ordinary
  user message, so the model's own transcript explains the loop.
- **ChatApp `/goal`** — set (stores + kicks `runAgent(arg)` as a normal
  turn), plus the real subcommands: `status` / `pause` / `resume` /
  `clear`. After every settled reply the pipeline runs
  title-generation → goal judge (`maybeContinueGoal`, cycle-guarded via a
  ref so the judge's own continuation can't double-fire). The judge call
  rides the third aux slot **`goalJudge`** (Model tab → Auxiliary models
  now shows three rows — pin the verdict call to a cheaper model).
- **Status chip** — `oa-goal-chip` in the statusbar: `goal N/20` while
  active, `goal ✓` when the judge says done, `goal paused`. Session blob
  gains an optional `goal` field (additive, old sessions load fine).
- **`sendQueued` fix (caught by the new scenario):** a queued `/goal …`
  entry used to drain as prose into the model. Drained entries now
  re-dispatch through `runSlash`, so queued commands run as commands.
- Harness scenario **goal** (19 REAL frames): canned two-verdict judge
  (CONTINUE then DONE) — kickoff witness, continuation wire, `goal ✓`
  chip, `/goal status` reply, `clear` removing the chip.

Deferred on purpose: cross-surface goal resume (desktop keeps goals per
session id; ours already persists per session) and `/goal` mid-run
queueing (#63352 in official; our queue fix above covers the UX).

---

## Status append 7 — v0.1.26 shipped (2026-08-01, /steer mid-turn injection)

The last composer-parity study item. Verified raw against `run_agent.py`
(`steer()` / `_drain_pending_steer`), `agent/prompt_builder.py`
(`STEER_MARKER_*`, `format_steer_marker`, `STEER_CHANNEL_NOTE`),
`agent/conversation_loop.py` (pre-API drain), `agent_runtime_helpers.py`
(post-batch drain) and `cli.py` + `tests/cli/test_cli_steer_busy_path.py`
(busy inline dispatch, idle next-turn fallback, leftover delivery line):

- **`src/agent/steer.ts`** — the marker is byte-exact official; the trust
  note goes into the system prompt (brand-swapped) so the model treats
  ONLY that marker as the user and never a lookalike in tool output.
  `splitSteerMarkers` is the transcript side: it renders the steer as an
  attributed note and refuses to pill an unbalanced lookalike.
- **AgentLoop** — `steer(text)` stash (concat "\n", rejects empty), ONE
  drain point at the iteration boundary (our loop owns the boundary, so
  official's post-batch and pre-API points are the same moment here),
  injects into the LAST tool-role message of the whole wire, restores the
  stash when nothing safe to ride exists, hard interrupt DROPS it, and a
  clean settle hands the leftover back for next-turn delivery.
- **ChatApp** — `/steer` is the one busy command that never queues (CLI
  inline-dispatch parity); busy → "Steer queued — arrives after the next
  tool call", idle → the text becomes an ordinary next-turn message
  (official `_pending_input.put(payload)`), leftover → "Delivering
  leftover /steer as next turn" then it runs as a user turn. The
  `onSteerApplied` event mirrors the marker into the rendered card + the
  saved wire, idempotently.
- **Tool card** — output pane splits the marker out and renders
  "Mid-run steer from the user" as an accent-bordered note; the raw
  marker never shows.
- Harness scenario **steer** (20 REAL frames): a deliberately SLOW tool
  (a human-scale window, no backdoor) — busy stash confirmed with zero
  queue rows, the byte-exact marker witnessed on the next request's wire
  (tail capture), the note rendered after a real disclosure click, idle
  /steer as a plain bubble that really reached the model.
- **Lesson 27 logged:** grep filters can eat failing assertion payloads
  (case-insensitive "Notice" in JSON keys — pipe harness output to a
  file), and `document.body.textContent` includes `<script>` sources, so
  every DOM text assertion must scope to `#root`.

`/steer` joins the shipped parity set; the slash-composer arc is complete.
Next backlog: `web_extract` aux slot (#2), MoA presets.

---

## Status append 8 — v0.1.27 shipped (2026-08-01, aux pin = provider AND model)

Found while studying `web_extract` for the settings-parity backlog: all
three aux call sites (compression, title generation, goal judge) resolved
the pin via `resolveAuxTask` and used its PROVIDER — but passed the raw
settings into `chatCompletion`, whose request takes `model` from
`settings.model`. A pinned aux slot therefore switched provider only; the
model on the wire was always the main one. Fix: every aux call rides
`{ ...settings, model: pair.model }`. Wire-proven: the goal scenario pins
goalJudge to a second model on the SAME provider and asserts both judge
calls carry the pinned id. Lesson 28 logged.

---

## Status append 9 — v0.1.28 shipped (2026-08-01, `web_extract` tool + aux slot)

Backlog #2. Verified raw against `tools/web_tools.py`, `hermes_cli/web_server.py`
(`_AUX_TASK_SLOTS`), `apps/desktop/src/app/settings/model-settings.tsx`
(`AUX_TASKS`, CLI label "Web extract — web page summarization") and
`agent/auxiliary_client.py`:

- **The fork:** the aux slot `web_extract` is REAL in official settings (it
  lists among 11 `_AUX_TASK_SLOTS`), but `git grep` over the full repo found
  ZERO live `call_llm(task="web_extract")` call sites — the slot is vestigial
  upstream. Owner chose **option B (full parity + live slot)**: the tool gets
  upstream-exact extraction semantics AND our settings row gets a real opt-in
  consumer (`summarize`, default off = upstream behavior).
- **`src/agent/webExtract.ts`** — byte-semantics parity: pages ≤ char_limit
  (default 15000, min 2000) return whole; larger → head+tail window
  (head = floor(0.75·limit), newline-snapped both sides), the official middle
  marker + `─×8 [TRUNCATED] ─×8` footer with comma-formatted
  `Showing H + T of N total clean characters`, `Full text saved to: PATH`,
  and the read-the-middle pointer (offset = head newline count + 2, `─×29`
  rule). Store filename `<hostslug>-<sha256(url)[:10]>.md` (hostname
  lowercased, port dropped, `[^A-Za-z0-9._-]→"-"`, 60 chars); stored copy
  bounded at 2,000,000 chars with the official overflow notice. WebCrypto
  sha256 with a two-seed FNV-1a 10-hex fallback for insecure contexts.
- **`tools.ts`** — `web_extract` replaces `web_fetch` (schema `urls`
  maxItems 5 + `char_limit`; legacy `url` arg tolerated). Full text goes to
  the vault at `openagent/web-cache/`, so truncation never loses data.
  `read_note` gains official-shaped `offset`/`limit` (1-based lines,
  continuation hint, past-end error) so the footer pointer is truly
  followable. `summarize: true` (OUR extension, disclosed in the schemata)
  rides the pinned Web extract aux pair end-to-end (`resolveAuxTask` on BOTH
  the summarize call and per official shape), 60k input cap, fail-open back
  to the raw window on aux error.
- **Settings** — 4th aux row "Web extract — condenses fetched pages when
  summarize is used (web page summarization)"; contextManager gains the
  `"webExtract"` slot; the chat sources block reads the `web_extract` tool
  name + urls array.
- Harness scenario **webe** (21 REAL frames): a real fetch of a ~43k canned
  page, raw call proves head+tail window + footer + vault store + pointer,
  `summarize:true` pinned to a second model asserts the aux model id on the
  wire (`summarizeModelOk`), and 18 unit checks pin the window math, digest
  shape (both crypto paths), store bound, and read_note paging.
- **Lesson 29 logged:** evidence slices must be sized from the artifact
  (footer ≈400 chars > `slice(-300)`), and fallback code paths need
  exact-shape unit tests (first FNV fallback emitted 8 hex, breaking the
  `{10}` anchor regex).

Backlog remaining: MoA presets (last item).

---

## Status append 10 — v0.1.29 shipped (2026-08-01, MoA presets: config layer + settings section)

Last backlog item, step 1 of 3. Verified raw against
`hermes_cli/moa_config.py` (509 lines, read whole), `hermes_cli/moa_cmd.py`,
`agent/moa_loop.py` (2183 lines), `hermes_cli/inventory.py`
(`_moa_provider_row`, `_raw_config_has_enabled_moa_preset`), `cli.py` `/moa`,
`hermes_cli/web_server.py` (`/api/model/moa` GET/PUT + `validate_moa_payload`
→ HTTP 422 #64156), `agent/auxiliary_client.py` (moa task resolution),
desktop `model-settings.tsx` (MoA section + `moaSlotComplete` /
`moaConfigComplete` / `updateMoaSlot` / `withActive`), `types/hermes.ts`
(`MoaConfigResponse`) and the desktop chat event surface (`moa.progress` /
`moa.reference` / `moa.phase` → the reasoning disclosure).

- **`src/agent/moa.ts`** — the config layer, semantic-parity port: official
  seeds (openai-codex/gpt-5.5 + openrouter/deepseek-v4-pro refs,
  openrouter/claude-opus-4.8 aggregator), tolerant READ (`normalizeMoaConfig`:
  junk degrades to defaults, legacy flat shape → default preset, JSON-string
  refs parsed) vs loud WRITE (`validateMoaPayload`: half-filled slots,
  explicit empty refs, and recursive `moa`-provider slots named with the
  official problem strings — validate does NOT parse JSON-string refs, the
  asymmetry is official). Fanout coercion (canonical string `user_turn`
  default / `per_iteration` / `every_n:N`, mapping form, `n=1` collapses),
  slot coercions (reasoning_effort incl. `ultra` + `none` aliases per
  hermes_constants, per-slot max_tokens positive-only, reference_timeout
  finite-positive-or-inherit), `exactMoaPresetName` honoring the enabled
  opt-out (#55187), desktop editor helpers (`updateMoaSlot` provider change
  clears the model, `moaConfigComplete`, `withActiveOption`). Not ported (no
  upstream surface writes them): `privacy_filter`, `save_traces`, the
  `MOA_MARKER_PREFIX` hidden-turn encoding, and per-slot reasoning/token UI.
- **Settings → Mixture of Agents section** — desktop layout parity: preset
  dropdown + Enabled toggle + Set default + Delete (disabled at one preset) +
  "new preset" input + Add preset (duplicates the current preset); the mono
  `Default: <name>` line; Reference N rows (per-slot enable toggle, mono
  `provider · model` desc, dimmed when disabled, provider+model pickers
  below, Remove disabled at one ref); Add reference model prefills from the
  aggregator slot; Aggregator row. Adapted to this tab's edit→save→display
  flow as a working DRAFT: quiet edits persist only when the whole draft
  validates (muted "waiting for a complete preset" hint otherwise — the
  desktop autosave equally skips half-filled states because the backend
  422s them); explicit actions fail LOUD with the red problem list and the
  last-good config stays on disk. `settings.moa` stays `null` until the
  first valid save — Hermes' explicit-only rule (the shipped default preset
  alone must never make MoA appear, `_raw_config_has_enabled_moa_preset`).
- **Probe F17** in the settings harness walks the whole story: official
  seeds render, nothing persists mid-edit, completion persists the
  normalized config, the quiet toggle persists, Add-reference prefills, and
  Set-default on a broken draft shows the official problem text while
  keeping the last-good config.
- **Lesson 30 logged:** `Setting.addButton()` returns the SETTING, not the
  ButtonComponent (capture the component inside the callback), and a
  synthetic click on an Obsidian toggle's inner `<input>` doesn't move the
  component — click the `.checkbox-container`.

60 unit checks pin the config semantics (`test/moa.test.cjs`). Next:
v0.1.30 runtime (virtual "Mixture of Agents" provider in the model picker,
advisor fan-out + aggregator synthesis + guidance attach with the official
prompts, cadence + degraded handling, moa.* events in the reasoning
disclosure), then v0.1.31 (`/moa` one-shot + bare `/model <preset>`).

---

## Status append 11 — v0.1.30 shipped (2026-08-01, MoA runtime: facade + virtual provider)

Step 2 of 3. Verified raw against `agent/moa_loop.py` (MoAClient create(),
`_reference_messages`, `_run_reference`/`_run_references_parallel`,
`_attach_reference_guidance`, the fanout-cadence block, `_slot_runtime`,
`_degraded_notice`, `moa.progress`/`moa.reference`/`moa.phase` emission) and
the desktop consumer (`use-message-stream/gateway-event.ts`).

- **`src/agent/moaLoop.ts`** — the facade, official-shape: advisory view
  (system dropped, `[called tool: name(args)]` inline, tool results folded
  into the preceding assistant turn with the 4000-char head+tail budget and
  counted omission marker, image-only user turns become the official
  placeholder, the view always ends on a user turn via the synthetic
  advisory instruction); the verbatim reference-advisor system prompt;
  parallel fan-out (pool of 8), per-advisor failures as `[failed: …]` notes
  (never throwing), interrupt as `[skipped: interrupted by user]`; NO
  synthesis call — the aggregator IS the acting model and the joined
  `Reference N — label:` blocks ride under the verbatim
  `[Mixture of Agents reference context]` header, attached at the END of a
  CLONED wire (trailing user merged, never two consecutive user turns; the
  transcript never carries the block — official peels, we clone).
  All-fail → the "acting alone" notice (loud) or nothing (silent). Cadence:
  user_turn hashes the prefix to the last REAL user message (stable across
  tool iterations → advisors run once per turn); per_iteration hashes the
  full view; every_n:N keeps a per-turn counter (iteration 1 on-cadence,
  identical-state repeats don't eat slots, off-cadence reuses the cache).
  An interrupted fan-out is never cached. Disabled preset / zero enabled
  references → the aggregator acts alone, no events.
- **Deliberate deltas (recorded):** acting call's max_tokens comes from the
  user's normal setting, NOT the preset's 4096 — that cap is legacy schema,
  the official runtime dropped it ("it truncated long syntheses"); view
  signatures use two-seed FNV-1a hex instead of sha256 (cache keys, not
  security); per-advisor cost/usage accounting, trace persistence,
  privacy_filter, and Anthropic cache_control decoration are not ported.
- **AgentLoop** gains the facade hook: one `prepareIteration` per API call;
  the acting connection is the aggregator slot (fresh object per call so a
  failover swap never corrupts the base connection).
- **Picker** — the virtual "Mixture of Agents" provider rides the top of
  the same menu (official warning text as the section hint), visible only
  when ≥1 ENABLED user-saved preset exists; the pill shows the preset name;
  picking a preset writes the official `active_preset` slot; picking a
  normal model clears it.
- **ChatApp** — the events land in the ONE reasoning disclosure with the
  desktop replace/accumulate semantics: first `◇ MoA refs k/n` replaces,
  later progress accumulates, the first `◇ Reference i/n — label` block
  replaces again (progress trail self-cleans), `◇ MoA aggregating…`
  accumulates; advisor spend never pills the model's own reasoning.
- Harness scenario **moa** (22 REAL frames): a preset "crew" (gemma+qwen
  advisors, hermes-4-70b aggregator) answers one turn with a mid-turn tool
  call — wire counts prove advisors ran ONCE while the aggregator made BOTH
  acting calls with the guidance header + joined advice; the disclosure shows
  labelled reference blocks and the aggregating line, progress self-cleaned.
- **Lesson 31 logged:** raw control characters in TS sources are
  anchor-breaking and invisible — a smoke guard now FAILS on any
  U+0000–U+001F (minus \t \n \r) in src/; it instantly caught two new ones
  (`\x1d`/`\x1e` signature separators in moaLoop.ts) AND one latent pre-
  existing (`\x1f` fallback-dedupe separator in settings.ts). All converted
  to escape text. Plus the every_n signature subtlety: official hashes the
  FULL view for every_n (only user_turn hashes the turn prefix), so
  on-cadence iterations re-run; copying the user_turn prefix shape to
  every_n would have made it a user_turn clone that never re-runs.

37 unit checks pin the pure semantics (`test/moaLoop.test.cjs`). Next:
v0.1.31 — `/moa` one-shot sugar + bare `/model <preset>` implicit match.

---

## Appendix 12 — v0.1.31: `/moa` one-shot sugar + bare `/model <preset>`

Verified raw (NousResearch/hermes-agent @ depth-1 clone, current main):

- `cli.py` ~10024 — **`/moa` is one-shot sugar only**: with no payload it
  prints `moa_usage()` verbatim ("Usage: /moa <prompt>  (runs one prompt
  through the default MoA preset, then restores your model; pick a preset
  from the model picker to switch for the session)"); with a payload it
  stashes `{requested_provider, provider, model, api_key, base_url,
  api_mode}` into `_pending_moa_restore_model`, pivots to the virtual
  `moa` provider at the DEFAULT preset, prints the notice
  `MoA one-shot queued with preset {preset}; previous model will be
  restored after this turn.`, and seeds the next turn. After the turn
  (`_pending_moa_disable_after_turn`, cli.py ~13666) the stash is restored.
  Session switching stays a model-picker gesture — `/moa` is never a switch.
- `hermes_cli/model_switch.py` PATH B ~1353 — a **bare `/model <name>`**
  calls `exact_moa_preset_name`: ONLY an exact, ENABLED preset name pivots
  onto the MoA virtual provider (implicit match, #55187 — a `enabled:false`
  preset must never silently capture a colliding model name). Prefixed
  `"moa:x"` is not a bare name; explicit `moa:` selection stays in the
  picker. A plain `/model <model>` while on MoA leaves the virtual provider.

Port:

- **SLASH_COMMANDS** gains `/moa <prompt>`; the popover/help/drain paths
  pick it up free. A queued `/moa …` typed while busy behaves like every
  queued slash: it RUNS as the command on drain (v0.1.25 parity), matching
  the CLI's `_pending_agent_seed` behavior.
- **`/moa`** in `runSlash`: bare → official usage line; no saved preset →
  honest notice pointing at Settings; otherwise stash
  `settings.moa.active_preset` into `moaOneShotRestoreRef`, switch to the
  default preset, print the official notice verbatim, and run the payload
  (typed text rides as `displayText`, so the bubble shows what you typed).
- **Restore lives in `runAgent`'s `finally`** — success, error and `/stop`
  all end the stint exactly after one turn (official restores after the
  run; a nested steer-leftover/goal continuation reads `settings.moa`
  lazily so it already rides the restored state).
- **`/model`** — bare ENABLED preset name → `setActiveMoaPreset` + notice,
  plain model untouched; otherwise the pre-existing plain switch runs and
  now ALSO clears `active_preset` (leaves the virtual provider, same as a
  picker pick) with an honest "left the MoA virtual provider" tail on the
  notice when it did.
- Harness scenario **moa2** (23 REAL frames): default preset "crew" NOT
  active + a second DISABLED preset "off". Wire + settings state prove:
  bare `/moa` prints usage; `/moa <p>` runs one turn through the facade
  (advisors once, aggregator twice with guidance, notice verbatim) and
  restores `active_preset: ""`; `/model crew` pivots (pill shows "crew",
  settings.model untouched); `/model off` never pivots and honestly leaves
  MoA; `/model moa:crew` is a plain (odd) model name — never a pivot.

The MoA backlog (config → runtime → sugar) is now COMPLETE: v0.1.29 config
layer + settings section, v0.1.30 advisor facade + virtual provider,
v0.1.31 one-shot + implicit pivot.
