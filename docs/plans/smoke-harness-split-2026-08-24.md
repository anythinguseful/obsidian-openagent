---
title: "Smoke/harness split"
type: plan
status: draft
date: 2026-08-24
tags: [openagent, plan, architecture, testing, refactor]
---

# Smoke/harness split

## Summary

`test/smoke.test.cjs` is the largest file in the repository at 7,012 lines —
larger than `src/ui/ChatApp.tsx` (5,358) and `src/settingsTab.ts` (4,938). It
holds 195 guard blocks written as hand-rolled `if/else` statements with 209
`failed++` sites, and it reads project source as **text** 558 times, including
46 reads of `settingsTab.ts` and 30 of `ChatApp.tsx`.

That last number is why this work comes before another plugin refactor. The two
remaining Stage 6 candidates — Settings section renderers and the composer
controller — both move code inside the exact files this harness string-pins.
Splitting the harness first means those refactors amend a small, per-domain file
instead of hunting through 7k lines of text matching. The Lessons log already
records this failure mode repeatedly (Lessons 20, 96, 107, 121, 125, 127, 143,
180): a guard describing the old world bites the new world silently.

This plan is a **test-infrastructure** change. No plugin behavior changes, no
guard is deleted, and no assertion is weakened.

## Contract

- Guard **coverage is conserved**: the split ends with the same **289 emitted
  `✓` lines** passing, and the sorted set of those lines is byte-identical to
  the pre-split baseline. A guard may move file; it may not disappear or be
  softened to pass.
- `npm test` keeps a single smoke entry point so `package.json`, CI, and
  `scripts/release-assets.mjs` need no coordinated change in the same commit.
- The mocked `obsidian` module, the bundle load, and the mock-app plugin
  instantiation stay in **one** shared harness module; they are not duplicated
  per domain file.
- Exit behavior is unchanged: any failed guard prints `✗ …`, increments the
  failure count, and exits non-zero.
- A moved guard keeps its original message text so historical Lessons entries
  and `RELEASES.md` references remain greppable.
- No change to `src/**` is in scope.

## Decisions

- D1: Split by **domain**, not by line count or version number — sources: the
  existing sibling suites (`settings.test.cjs`, `cron.test.cjs`, …) already
  establish a domain-per-file convention.
- D2: Keep a shared harness module rather than a test framework dependency —
  source: `CONTRIBUTING.md` keeps dependencies explicit and reviewable; the
  suite is plain Node with no runner today. Adopt the `check(ok, label)` helper
  that 19 of the 41 sibling suites already define, so the smoke suite converges
  on the existing house convention instead of a new one.
- D3: Guards stay **static-string pins where they are static today**. Converting
  a string pin into a behavioral test is valuable but is a *separate* change;
  mixing conversion with relocation would make the diff unreviewable and could
  silently drop coverage. `[assumed]` — confirm with owner.
- D4: Move guards **verbatim** (condition, message, comment) — source: Lesson
  107, which established verbatim block moves plus witness relocation as the
  safe pattern for restructuring.

| Pick | Approach | Tradeoff |
|---|---|---|
| ✅ | Shared harness + domain files, guards moved verbatim | Largest number of small commits; safest to review |
|  | One-shot rewrite into a test framework | Faster to a nice end state; rewrites 195 guards at once, high risk of silent coverage loss |
|  | Leave as-is, split opportunistically during later refactors | No upfront cost; pays the pin-hunting tax repeatedly and mixes concerns |

## Impact

Touched:

- `test/smoke.test.cjs` — shrinks as guards move out.
- `test/smoke/` (new) — shared harness plus domain guard modules.
- `package.json` — only if the entry point name changes (D2 prefers it does not).

Explicitly **not** changed:

- any file under `src/`;
- plugin behavior, settings, or persistence format;
- the real-DOM preview harness under `test/real-preview/`;
- the other 39 unit suites in the `npm test` chain;
- `.github/workflows/ci.yml` (owner-only territory per the working agreement).

Measured starting state:

| Metric | Value |
|---|---|
| Lines | 7,012 |
| `console.log("✓` sites in source | 195 |
| **`✓` lines actually emitted at runtime** | **289** (all unique; some sites run in loops) |
| `failed++` sites | 209 |
| `read(...)` source reads | 558 |
| Median guard block | 29 lines |
| Largest guard block | 372 lines (from line 161) |
| Blocks that are purely static pins | ~108 |
| Blocks exercising plugin runtime | ~12 |

The 195/289 gap matters: counting source occurrences would under-count real
coverage, so the conservation check below is defined on **emitted** output.
Capture the baseline before Phase 1 begins:

```bash
npm ci && npm run build          # prerequisite: the suite requires ./main.js
node test/smoke.test.cjs | grep '✓' | sort > /tmp/smoke-baseline.txt   # 289 lines
```

> [!warning]
> The suite `require`s the built `main.js`, which is gitignored. Without a build
> it dies at line 111 with `MODULE_NOT_FOUND`, prints **zero** `✓` lines, and
> exits 1. That failure looks exactly like "the split deleted every guard", so
> always confirm the baseline command produces 289 lines before trusting a diff.

After every commit, `diff` the same command's output against that baseline; it
must be empty. All 289 lines are unique today, so the diff is exact.

## How the harness was built (archaeology)

Git history is not usable here: the repository was uploaded as a single commit
(`e4c9a7f`), so `test/smoke.test.cjs` has only two commits behind it. The file
does, however, carry its own history in its guard messages.

- 124 of the 195 guard sites are stamped with a version, spanning **v0.1.17 →
  v0.1.192**. Read top to bottom they are almost perfectly ascending (5
  inversions in 123 transitions), which means the file was grown
  **append-only**: each release added its regression guard at the end.
- The remaining 71 guards are unstamped — mostly the early structural checks.
- Structurally the whole file is one `(async () => { … })()` IIFE opened at line
  158 and closed at line 7,008, with a single shared `failed` counter and a
  final `process.exit(1)`.
- There are only **10 top-level declarations** (`Module`, `path`, `fs`, `read`,
  `obsidianMock`, `originalResolve`, `mainPath`, `mod`, `OpenAgentPlugin`,
  `plugin`). Everything else lives inside per-guard braces.
- Guards are already self-isolating to the point of redundancy: `const fs =
  require(...)` appears **67** times and a local `const read = …` **43** times,
  re-declared inside blocks that could have used the top-level ones.

Two conclusions follow, and they are what make this split cheap:

1. The coupling surface is **10 variables**, not 7,012 lines. Guards do not
   share intermediate state with each other; they share only the harness.
2. The file was never *designed* at 7k lines — it accreted one release at a
   time, and each accretion was written as a self-contained block. The split is
   therefore mostly **mechanical relocation**, not redesign.

### Sibling convention already exists

19 of the 41 suites already define the same helper:

```js
let failed = 0;
const check = (ok, label) => { if (ok) console.log(`✓ ${label}`); else { console.error(`✗ ${label}`); failed++; } };
```

`test/settings.test.cjs` (539 lines) is the reference shape: bundle the unit
under test, declare `check`, group guards in commented `{ … }` blocks stamped
with the version that motivated them. The smoke suite is the main holdout — it
hand-rolls all 209 `failed++` sites instead. So the target state is not
invented; it is the convention the rest of the suite already follows.

## Recommended answers to the open questions

Offered as a recommendation, not a decision — the owner still owns q1–q3.

- **q1 — do not convert pins to behavioral tests in this work.** The append-only
  history means many pins encode a *specific* past regression (Lessons 20, 107,
  121, 125, 127). Rewriting one into a behavioral test silently changes which
  regression it catches. Relocate now; convert later, per guard, with a reason.
- **q2 — pilot with `styles` (30 guards).** It is the only sizeable domain with
  no dependency on `plugin`, the bundle, or the `obsidian` mock: those guards
  just read `styles.css` and assert on text. If the harness extraction is wrong,
  this domain fails loudly and in isolation. `settings` (22) is the natural
  second, because it is the domain a later Settings refactor will touch.
- **q3 — keep one entry point.** `npm test` already chains 40 suites on one
  line; adding six more entries makes CI output noisier and would require
  touching `.github/workflows/ci.yml`, which is owner-only territory. Keep
  `test/smoke.test.cjs` as the orchestrator that requires the domain modules.

Measured domain distribution of the 195 guard sites:

| Domain | Guards | Notes |
|---|---:|---|
| runtime/behavioural | 84 | Uses the live `plugin` instance; stays closest to the harness |
| core/src | 37 | Text pins on assorted `src/` modules |
| styles | 30 | `styles.css` only — **recommended pilot**, zero harness coupling |
| settings | 22 | `settingsTab.ts` / `settings.ts` — unblocks the Settings refactor |
| chat/composer | 17 | `ChatApp.tsx` — unblocks the composer refactor |
| ui-components | 5 | `src/ui/components/*` |

> [!warning] **Superseded on 2026-08-24 during Phase 2 — the table above is wrong.**
> It was produced by a first-file-wins heuristic: each guard was filed under the
> first source file it happened to read. Re-measuring with a balanced-brace scan
> over the 205 level-1 blocks, and classifying a guard into a domain only when it
> reads that domain's files **exclusively**, gives a very different picture.

Corrected distribution, measured after Phase 2 landed (175 `✓` remaining in
`smoke.test.cjs`, plus the 4 already moved to `test/smoke/styles.cjs`):

| Category | `✓` | Splittable by domain? |
|---|---:|---|
| multi-file static | 88 | **No** — each reads 2+ domains' files in one block |
| runtime/behavioural | 77 | No — needs the live `plugin`; belongs with the harness |
| settings (exclusive) | 6 | Yes |
| chat (exclusive) | 4 | Yes |
| styles (exclusive) | 4 | Done — moved in Phase 2 |

> **Superseded 2026-08-24 (second measurement, before Phase 3b).** The table
> above is wrong about *why* blocks are stuck, and its two big numbers should
> not be quoted. It counts how many files a block reads; the real constraint is
> which **shared top-level variables** a block closes over. The orchestrator
> declares 42 of them outside every guard block, and 186 of 190 blocks use at
> least one. Only 6 are runtime values (`s`, `prompt`, `names`, `checks`,
> `iUrl`, `iDisc`); the other 32 are plain `read("…")` results that any module
> can recreate in one line.
>
> | Constraint | Blocks | Lines | Movable? |
> |---|---:|---:|---|
> | depends only on file-content variables | 105 | 3,119 | Yes — mechanical, same recipe as Phase 2/3 |
> | depends on a runtime variable | 85 | 2,708 | Not without changing the guard contract |
>
> So a domain split is *cheaper* than the first table implied (3b), and a
> runtime split is *dearer* (3c: 85 blocks are runtime-bound, not the 12 that
> touch `plugin` directly). Both original numbers stay on the page because the
> Phase 3a decision was taken while they were believed.

The conclusion that survives: **only ~14 of 289 checks are separable by the
strict "reads one domain's files exclusively" rule.** But that rule was the
wrong question — grouping by *subject* (option 3b) reaches 105 blocks, because
a block may read `styles.css` and still be unambiguously about Settings.

This does not invalidate the enabler rationale, but it resizes the prize. See
the revised Phase 3 below.

## Phases

### Phase 1 — extract the shared harness

Goal: one module owns the `obsidian` mock, `global.window` shim, bundle load,
and mock-app plugin instance; `smoke.test.cjs` imports it and every existing
guard still runs from the same entry point.

Files:
- `test/smoke/harness.cjs` — mock + bundle load + plugin factory + `read()`.
- `test/smoke.test.cjs` — requires the harness; guards untouched.

Verification: `npm test` green, and the baseline diff is empty (289 lines).

### Phase 2 — move one low-risk domain

Goal: prove the pattern on a single cohesive domain before touching the rest.
Recommended pilot is `styles` (30 guards): it reads only `styles.css` and has no
dependency on `plugin`, the bundle, or the `obsidian` mock, so a mistake in
Phase 1 surfaces in isolation rather than as a confusing cascade.

Files:
- `test/smoke/<domain>.cjs` — guards moved verbatim.
- `test/smoke.test.cjs` — requires and runs the domain module.

Verification: `npm test` green; baseline diff empty — the moved guards' `✓`
lines reappear with byte-identical text.

### Phase 3 — move remaining domains incrementally

**Revised 2026-08-24 after the Phase 2 measurement.** The original goal —
"repeat per domain until `smoke.test.cjs` is a thin orchestrator" — is not
reachable by relocation alone. (The original figures here — 88 multi-file, 77
runtime-bound — were superseded by the second measurement above: the binding
constraint is shared top-level variables, 105 blocks movable / 85 not.)

Move only what is genuinely exclusive:

- `test/smoke/settings.cjs` — 6 checks;
- `test/smoke/chat.cjs` — 4 checks.

That takes `smoke.test.cjs` to roughly 6.6k lines, not to a thin orchestrator.
Anything beyond this needs an owner decision, because the options stop being
free:

| Pick | Approach | Tradeoff |
|---|---|---|
| 3a ✅ | Stop after the exclusive guards | Honest and cheap; the 6.5k file mostly remains |
| 3b | Split multi-file blocks by *subject* rather than by file read | Genuinely shrinks the file; requires judgement per block, so it is no longer a verbatim move |
| 3c | Group runtime guards into `test/smoke/runtime.cjs` behind a `plugin` parameter | Removes 77 checks from the orchestrator; touches how guards receive the plugin |

Recommendation: take the exclusive guards now, then stop and re-decide. The
enabler goal is already partly met — a future Settings or ChatApp refactor now
has `test/smoke/settings.cjs` and `test/smoke/chat.cjs` to amend for the guards
that are purely theirs, and a smaller haystack for the rest.

Verification: after each commit, `npm test` green and the baseline diff empty.

### Phase 4 — red-proof the split

Goal: prove the relocated guards can still fail.

For a sample of moved guards, temporarily break the pinned source, confirm the
guard reports `✗` and the suite exits non-zero, then restore. A guard that
cannot go red is not a guard.

Verification: deliberate-break run exits non-zero; restored run is green.

## GWT

```text
Given the smoke suite has been split into domain modules
When `npm test` runs
Then the same 289 ✓ lines are emitted and the process exits 0
```

```text
Given a guard was moved verbatim into a domain module
When the source line it pins is deliberately broken
Then that guard prints its original ✗ message and the suite exits non-zero
```

```text
Given a later refactor moves code out of src/settingsTab.ts
When a settings guard needs amending
Then only test/smoke/settings.cjs is edited, not a 7k-line file
```

## Risks

> [!risk]
> A guard is silently dropped during relocation — mitigation: diff the sorted
> emitted `✓` lines against the captured 289-line baseline after every commit;
> a dropped guard shows up as a missing line, not just a smaller number.

> [!risk]
> Relocation is mixed with "improving" a guard, hiding a coverage change inside
> a move — mitigation: D4 requires verbatim moves; any rewrite is a separate,
> separately reviewed commit.

> [!risk]
> Moved guards become dead code that always passes because the module is never
> required — mitigation: Phase 4 red-proof, plus the baseline diff (a never-required module
> loses its `✓` lines and fails the diff immediately).

> [!risk]
> The shared harness diverges from the real `AgentRunner`/plugin contract
> (Lesson 143's "mock must be contract-complete") — mitigation: harness
> extraction is verbatim in Phase 1; no mock method is added or removed.

## Open Questions

- q1: Should static string pins be converted to behavioral tests as part of this
  work, or strictly afterwards? — status: waiting for owner; **recommendation:
  strictly afterwards** (see Recommended answers).
- q2: Which domain should Phase 2 pilot, and what is the final domain list? —
  status: waiting for owner; **recommendation: pilot `styles` (30 guards)**,
  then `settings`, with the six-domain table above as the list.
- q3: Should the entry point stay `test/smoke.test.cjs`, or become several
  entries in the `npm test` chain? — status: waiting for owner;
  **recommendation: keep one entry point** (avoids touching CI workflow).

## Progress — 2026-08-24 (parser-verified)

`test/smoke.test.cjs` **7.012 → 5.353 baris (−24%)**, 289 `✓` utuh di setiap
fase. Modul: `harness.cjs`, `styles.cjs`, `settings.cjs`, `chat.cjs`,
**`agent.cjs`** (baru). Gerbang tiap fase: diff `✓` terurut kosong, plus
`npm test` / typecheck / build / `check:docs` 38.

Sisa monolit **145 blok** (angka dari AST, bukan regex):

| klaster | blok | baris | catatan |
| --- | --- | --- | --- |
| preview | 55 | 1.529 | terbesar; sebaiknya dipecah beberapa sesi |
| settings | 40 | 1.166 | modul tujuan sudah ada |
| chat | 32 | 868 | modul tujuan sudah ada |
| quickask | 12 | 376 | rata-rata 6,3 file/blok — termahal |
| styles | 2 | 40 | sisa; salah satunya pakai runtime `s` |
| lain | 4 | 112 | tanpa `read()` literal |

**Koreksi angka.** Tabel domain di atas dan q2 ("pilot `styles` (30 guards)")
berasal dari survei regex dan **salah**; lihat Lesson 183. Fakta AST: tidak ada
deklarasi `read()` di module scope (459 semuanya di dalam blok), hanya 6
variabel di badan IIFE, dan **1** blok yang benar-benar memakai runtime `s`.
Rencana "naikkan variabel bersama ke harness" dibatalkan sebelum ditulis karena
premisnya tidak ada.

**Penghalang nyata yang tersisa** hanyalah blok yang masih memakai
`fs`/`path`/`__dirname` inline — mekanis, ditulis ulang ke `read()` saat pindah.

`agent.cjs` adalah satu-satunya modul domain yang mengimpor `ROOT`/`fs`/`path`:
guard v0.1.18 melakukan `fs.readdirSync` untuk membuktikan tak ada panggilan
`fileManager.trashFile` langsung di luar shim. Alasannya didokumentasikan di
header modul.

## Progress — 2026-08-24, split selesai (Phase 9–11)

`test/smoke.test.cjs` **7.012 → 1.296 baris (−82%)**, 289 `✓` utuh di setiap
fase tanpa kecuali. Monolit sekarang tinggal orkestrator: bootstrap harness,
tujuh `require`, tujuh pemanggilan guard, plus tiga guard yang sengaja tetap
tinggal (lihat di bawah).

| modul | baris | guard |
| --- | --- | --- |
| `settings.cjs` | 1.994 | 70 |
| `preview.cjs` | 1.509 | 55 |
| `chat.cjs` | 928 | 35 |
| `styles.cjs` | 509 | 19 |
| `quickask.cjs` | 400 | 12 |
| `agent.cjs` | 172 | 7 |
| `misc.cjs` | 180 | 6 |
| `harness.cjs` | 163 | — |

**Phase 10 (preview, 55 blok / 1.529 baris).** Klaster dengan pencampuran
anchor terparah: 24 blok memakai anchor root dan `test/` sekaligus. Aturan
Phase 9 sudah menangani `read()` dan `readFileSync` satu baris, tapi ada
`readFileSync` yang membentang beberapa baris sehingga lolos ke aturan
`path.join` generik yang belum anchor-aware — hasilnya
`ROOT/real-preview/obsidian-shim.ts`, kurang segmen `test`. Lihat Lesson 186.

**Phase 11 (misc, 6 blok / 152 baris).** Sisa yang tidak dimiliki satu surface
pun: relokasi workspace, tooltip hygiene, control-character hygiene,
sertifikasi radius, dan dua guard minify. Dua hal baru di sini:

- Guard relokasi memakai `await plugin.activateView()`, jadi `miscGuards`
  adalah satu-satunya modul `async` dan dipanggil dengan `await`. Lupa
  `await`-nya tidak membuat test merah — prosesnya hanya keluar sebelum
  promise selesai dan enam `✓` hilang diam-diam. Diff baseline yang
  menangkapnya, bukan exit code.
- Tiga guard membangun path secara dinamis (`path.join(__dirname, p)` dengan
  `p` variabel loop) sehingga tidak bisa di-anchor per path. Alih-alih menebak,
  modul mendeklarasikan `TESTDIR = path.join(ROOT, "test")` yang nilainya
  persis `__dirname` monolit. Path literal tetap wajib lewat `read()` supaya
  terlihat oleh check-docs guard 1.

**Tetap di monolit, dengan alasan.** Tiga `✓` tersisa, dan hanya satu di
antaranya berupa blok mandiri:

1. `✓ onload() completes` — bootstrap; memang milik orkestrator.
2. `✓ system prompt assembles` — `await plugin.runner.assembleSystemPrompt()`,
   pernyataan runtime di badan IIFE, bukan blok yang bisa dipindah utuh.
3. `✓ prompt-kit: Reasoning …` — satu-satunya blok tersisa (28 baris).

Catatan koreksi: guard radius v0.1.52/v0.1.94 **ikut pindah** ke `misc.cjs` dan
`settings.cjs`; anggapan lama bahwa keduanya harus tinggal berasal dari survei
regex yang sama dengan Lesson 183 — `s` di sana ternyata kunci objek
`{ s: "4", m: "8", l: "12" }`, bukan variabel runtime. Diverifikasi ulang
dengan AST sebelum dipindah.

Blok nomor 3 sempat ikut Phase 11 lalu ditarik kembali: check-docs guard 1 mewajibkan setiap literal
`path.join(ROOT, …)` resolve di disk, dan ini dibuktikan langsung dengan modul
probe sekali pakai — bukan diasumsikan. Guard semacam ini hanya boleh pindah
kalau path-nya lewat `read()`, seperti `pdf-worker.d.ts` di `preview.cjs`.
