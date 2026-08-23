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
  suite is plain Node with no runner today.
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
node test/smoke.test.cjs | grep '✓' | sort > /tmp/smoke-baseline.txt   # 289 lines
```

After every commit, `diff` the same command's output against that baseline; it
must be empty. All 289 lines are unique today, so the diff is exact.

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
Candidate domains are visible in the guard messages (Quick Ask, markdown/code
rendering, tooltip hygiene, Settings sections, chat composer).

Files:
- `test/smoke/<domain>.cjs` — guards moved verbatim.
- `test/smoke.test.cjs` — requires and runs the domain module.

Verification: `npm test` green; baseline diff empty — the moved guards' `✓`
lines reappear with byte-identical text.

### Phase 3 — move remaining domains incrementally

Goal: repeat Phase 2 per domain, one commit each, until `smoke.test.cjs` is a
thin orchestrator.

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
  work, or strictly afterwards? — status: waiting for owner (D3 assumes
  strictly afterwards).
- q2: Which domain should Phase 2 pilot, and what is the final domain list? —
  status: waiting for owner; ordering deliberately deferred by owner on
  2026-08-24.
- q3: Should the entry point stay `test/smoke.test.cjs`, or become several
  entries in the `npm test` chain? — status: waiting for owner (D2 assumes it
  stays one entry).
