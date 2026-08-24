---
title: "Settings section renderers"
type: plan
status: active
date: 2026-08-24
tags: [openagent, plan, architecture, settings, refactor]
---

# Settings section renderers

## Summary

`src/settingsTab.ts` is 4,938 lines and owns fourteen settings sections in one
class. This plan moves the **self-contained** section renderers out into
`src/settings/sections/`, leaving `OpenAgentSettingTab` as the owner of data,
persistence, navigation, and every renderer that still mutates class state.

It is the second Stage 6 target, selected by the owner on 2026-08-24 after the
[smoke/harness split](smoke-harness-split-2026-08-24.md) finished. Scope for
this session: **batch** — the largest self-contained renderers, not a pilot and
not the whole class.

Like the smoke split, this is an ownership change, not a rewrite. No user-facing
behavior changes, no control moves between sections, no setting is renamed.

## Why these renderers, measured

Every number below comes from the TypeScript AST (`/tmp/deps.cjs`,
`/tmp/idents.cjs`), not a regex survey — Lesson 183 applies.

`renderSectionBody()` is already a clean seam: a `switch` with exactly one
method per section. The real question is which of those methods can leave
without dragging class state along. Measured per renderer:

| renderer | lines | class state read | class state written |
| --- | --- | --- | --- |
| `memory` | 288 | — | — |
| `general` | 189 | — | — |
| `mcp` | 169 | — | — |
| `renderCommandRows` | 150 | — | — |
| `workspace` | 125 | — | — |
| `notifications` | 119 | — | — |
| `command` | 105 | — | — |
| `advanced` | 104 | — | — |
| `terminalSettings` | 102 | — | — |
| `appearance` | 74 | — | — |
| `safety` | 69 | — | — |
| `addWorkspaceExclusion` | 12 | — | — |
| **total** | **1,506** | | |

Contrast with the renderers that stay:

| renderer | lines | class state written |
| --- | --- | --- |
| `cronForm` | 372 | `searchHarvesting`, `editingCronId` |
| `model` | 371 | `section`, `modelPickProviderId`, `modelPickModel` |
| `providers` | 249 | `section`, `providerEditingId`, `otherProvidersOpen`, `providersAdvancedOpen`, `testResultEl` |
| `display` | 177 | `section` |
| `hub` / `skillsBrowser` | 217 | hub cache + DOM handles |

That is the whole argument for the batch boundary. The twelve movable members
touch **zero** of the 34 class properties; the ones left behind write to them
from inside closures, so moving those would mean inventing a state-passing
contract first. This plan does not invent one.

What the movable renderers do need is small and uniform: `this.plugin`,
`this.app`, and four presentation helpers (`subheading`, `resetButton`,
`emptyState`, `display`).

## Target shape

```text
src/settings/sections/
  context.ts     — SectionContext type + the four shared helpers
  memory.ts      — memory(ctx, containerEl)
  general.ts     — general(ctx, containerEl)
  ...
```

Each renderer becomes a free function taking a `SectionContext`:

```ts
export type SectionContext = {
  app: App;
  plugin: OpenAgentPlugin;
  subheading(el: HTMLElement, text: string, desc: string): HTMLElement;
  resetButton(setting: Setting, path: string): void;
  emptyState(el: HTMLElement, opts: EmptyStateOpts): HTMLElement;
  display(): void;
};
```

`OpenAgentSettingTab` builds one context object and passes it in. The class
keeps owning the helpers, so `this.display()` still re-renders through the same
path and `resetButton` still writes through the same `saveSettings`.

Three file-local helpers (`copyText`, `exportStamp`, `stackedTextArea`) are used
by both moved and retained renderers. `stackedTextArea` in particular is called
from `cronForm` (L4229), which stays. They move to a shared module rather than
being duplicated.

## Phases

Each phase is one commit and must pass the full gate before the next begins.

- **Phase 1 — DONE (2026-08-24).** `context.ts` plus `memory` (288 lines).
  Proved the pattern on the cleanest renderer: zero class state, zero local
  helpers, five imports. Result: `settingsTab.ts` 4,938 → 4,650 lines;
  `src/settings/sections/memory.ts` 307 lines. The moved body is byte-identical
  to `git show HEAD:src/settingsTab.ts` L3745-4032 after one dedent level and
  `this.` → `ctx.` over the six contract members — verified mechanically, and
  the checker rejects any leftover `this.`.

  Eleven guards were amended (the pre-flight scan predicted these among its 22):
  `v0.1.126`, `v0.1.148`, `v0.1.175`, `v0.1.176`, `v0.1.178`, `v0.1.179`,
  `v0.1.181`, `v0.1.186`, `v0.1.187`, `v0.1.94`, `settings IA`. All 289 `✓`
  match the baseline exactly, and each of the eleven was individually red-proofed
  by mutating the new module.

  Three findings, written up as Lesson 189:
  1. Five negative assertions (`!tab.includes(...)`) had to move with their
     subject — left behind they stay green vacuously and never show as `✗`.
  2. Count assertions must sum across owners *and* exclude scaffolding: the
     `resetButton` count split 13 + 9, but a naive union read 23 because the
     `sectionContext()` delegation line also matched. Narrowed to
     `resetButton\(st`.
  3. Pre-existing bug surfaced: `settingsTab.ts` holds a *second*
     `compressionEnabled` toggle (L1532, "Enable compression") plus a
     "Compression" row from `auxModelRow`, so two v0.1.175 pins were passing on
     the wrong lines. Pins repointed; the duplicate itself is left untouched and
     recorded under Open questions rather than fixed inside a refactor commit.
- **Phase 2 — DONE (2026-08-24).** `src/settings/sections/helpers.ts` (71
  lines) now owns `exportStamp`, `copyText` and `stackedTextArea`, needed before
  any renderer that uses them can move. The three bodies are byte-identical to
  `git show 0ca2ff0:src/settingsTab.ts` L4548-4596 modulo the added `export`,
  verified mechanically. `settingsTab.ts` 4,665 → 4,617 lines.

  Scope was settled by an AST caller survey (`/tmp/helpers.cjs`), not grep: the
  file has **five** module-level helpers, and only these three are shared with
  renderers that move. `baseUrlDesc` is called by `providers` alone and
  `stackedControl` by `model` / `moaSection` / `auxModelRow` alone — all
  retained, so both stay in `settingsTab.ts`. That also resolved the worry
  logged in Phase 1 that the `stacked fields` guard would be split across two
  files: only the `stackedTextArea` pin moved.

  One guard broke, exactly as predicted — `stacked fields`. It was amended on
  four arms (helper ownership in the module, absence from the tab, the
  `addTextArea(` negative pin evaluated against `st + helpers`, and the
  `oa-has-stacked` class), each individually red-proofed. 289 `✓`, baseline diff
  empty.

  One finding, written up as Lesson 190: the red-proof turned up a **hole in the
  original guard**. Renaming the `oa-has-stacked` class in the TS helper left
  smoke fully green, because the block only pinned the CSS rule that consumes
  the class, never the code that applies it. A CSS-only pin cannot prove the
  markup still opts in. Added the missing arm.
- **Phase 3** — `general`, `mcp`, `terminalSettings`.
- **Phase 4** — `workspace` + `addWorkspaceExclusion`, `command` +
  `renderCommandRows`. Moved in pairs: each private helper has exactly one
  caller, both in the moving set.
- **Phase 5** — `notifications`, `advanced`, `appearance`, `safety`.

Phase order is by risk, not by size: the renderer with the fewest dependencies
goes first so that a failure in Phase 1 is unambiguous.

## The real cost: 22 amended guards

`test/smoke/settings.cjs` pins `src/settingsTab.ts` 57 times. A predictive scan
(`/tmp/breakage.cjs`, matching each guard's string literals against the moved
text) says **22 of those 57 guards will break** — they assert on strings that
will no longer be in `settingsTab.ts`.

That is the honest cost of this refactor, and it is where the mistakes will be.
The roadmap contract is explicit: assertions are **amended** from location pins
to behavior plus new-module ownership, never deleted. So for each broken guard:

- keep the behavior assertion, repointed at the new module;
- keep proof that the section is still wired into `renderSectionBody`;
- never weaken a condition to make it pass.

The predicted list is recorded here so a later session can tell an expected
break from a real regression:

`v0.1.179` · `v0.1.181` · `settings IA` · `v0.1.175` · `v0.1.187` · `v0.1.188` ·
`Notifications IA` · `data portability` · `stacked fields` · `settings S3` ·
`settings copy` · `v0.1.17` · `v0.1.147e` · `v0.1.147h` · `v0.1.147i` ·
`v0.1.148` · `v0.1.151` · `v0.1.154` · `v0.1.176` · `v0.1.178` · `v0.1.186` ·
`v0.1.162`

The prediction is a scan, not a proof. The authority is the 289-line baseline
diff after each phase.

## Verification

Per phase, in this order:

```text
typecheck → build → node test/smoke.test.cjs (sorted ✓ diff vs baseline)
→ npm test → npm run check:docs → red-proof
```

The sorted `✓` diff against `/home/user/smoke-baseline.txt` is the primary
gate. Lesson 187: exit code 0 with zero `✗` does **not** prove the guards ran —
only the count and content of `✓` does. When a guard is amended the baseline
changes deliberately; the diff must then be inspected line by line and the new
baseline recorded in the same commit.

Every phase ends with a red-proof: break the moved code, confirm the amended
guard goes red, restore.

> [!warning] **The real-DOM settings witness cannot run in this sandbox.**
> `test/real-preview/build-settings.mjs` mounts the real `OpenAgentSettingTab`
> in Playwright and is the strongest behavioral check available. Playwright's
> browser download fails here (`Failed to download Chrome Headless Shell`,
> and `apt` has no `xvfb`/font packages), so it is **not** part of the local
> gate. It runs in `scripts/release.mjs`, so CI still covers it before any
> release. Until then, the static guards plus typecheck are the only proof, and
> that is a weaker net than the smoke split enjoyed. Phases are kept small for
> exactly this reason.

## Risks

> [!risk]
> Moving a renderer that secretly reads class state would break settings
> silently — the static guards match text, not behavior. Mitigation: the
> movable set was chosen by AST property-access analysis, and every phase
> re-runs typecheck, which catches a lost `this`.

> [!risk]
> Amending 22 guards invites weakening them into tautologies. Mitigation: each
> amended guard keeps its original condition count and gains a wiring
> assertion; each is red-proofed.

> [!risk]
> The Playwright witness gap means a CSS-class or element-order regression
> could reach CI unnoticed locally. Mitigation: renderers move verbatim —
> element creation order is not touched — and CI runs the witness.

## Contract

- Behavior is unchanged: no control moves between sections, nothing renamed.
- `OpenAgentSettingTab` remains the owner of settings data, persistence,
  navigation, search indexing, and all stateful renderers.
- Renderers that write class state stay until a separate plan defines a
  state-passing contract.
- A phase that fails is restored before the next begins.

## Open questions

- Should the retained stateful renderers (`model`, `providers`, `cronForm`)
  eventually move behind a state-passing contract, or stay with the class
  permanently? — deferred; not needed for this batch.
- **Duplicate `compressionEnabled` toggle (found in Phase 1).** The Model tab
  renders "Enable compression" (`settingsTab.ts` L1532) and the Memory & Context
  section renders "Compression" — two toggles writing the same setting, present
  since before this refactor (`git show HEAD:src/settingsTab.ts` L1530/L3961).
  Which one is the owner is a product decision, so it is not being settled
  inside an extraction commit. Needs an owner answer before either is removed.
