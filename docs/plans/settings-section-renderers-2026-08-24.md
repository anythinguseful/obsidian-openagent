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
| `mcp` | 172 | — | — |
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

  `terminalSettings` **DONE** (2026-08-24). 103 lines out of `settingsTab.ts`
  (4,551 → 4,448) into `src/settings/sections/terminal.ts`; call site inside
  `capabilities()` became `terminalSection(this.sectionContext(), containerEl)`,
  with the two subheadings deliberately left in `capabilities()`. The security
  shape moved verbatim: desktop-only early return, the toggle that refuses
  `toolsets.terminal = true` while `terminal.consentVersion !== 1`, and the
  receipt minted only from the modal's own callback. `TerminalConsentModal`
  dropped from the tab's import (it survived only in a comment — a bare
  `grep -c` reported 2 and looked live).

  Two guards broke, and **neither was in the file this plan predicted**. The
  terminal consent guard lives in the root `test/smoke.test.cjs`, whose source
  readers only open `src/main.ts`, `src/settings.ts`, `src/settingsTab.ts` — so
  the moved string vanished from its view. It was amended by adding a reader for
  the new module and tightening: the mint call, the modal construction, and the
  `setValue(false)` rejected gesture are pinned in the module, plus a negative
  pin (`!settingsTab.includes("grantTerminalConsent")`) so a second copy cannot
  grow back in the tab. The `v0.1.94` cross-file `markModified(` count was fixed
  by **adding the third file to the sum and keeping 63** (42 + 17 + 4), not by
  lowering the number — that count is the proof no dot was lost. `resetButton(st`
  === 20 was unaffected.

  One finding, written up as Lesson 193: red-proofing past the arms I had just
  written exposed a **pre-existing hole**. Deleting the call site outright —
  the entire Terminal & Processes section never renders — left `tsc` green and
  **zero** guards failing. The old `this.terminalSettings(containerEl)` had
  never been pinned either; `memory` was covered only by accident, via the IA
  guard that inspects tab contents. Closed by smoke `v0.1.194`, which locks the
  full chain per extracted module (import → `sectionContext()` call → order
  against its subheading → module `export` signature → no leftover
  `private <name>(` in the tab). Six arms, all six red-proofed. **Rule for the
  remaining extractions: the wiring guard ships in the same commit as the
  move.**
  `general` **DONE** (2026-08-24). 190 lines out (4,449 → 4,259) into
  `src/settings/sections/general.ts`; call site in `display()` became
  `generalSection(this.sectionContext(), host)`. Unlike `terminal`, this one
  owns its two `subheading` calls and chains `.addClass("oa-danger-zone")` on
  the returned element — which the `SectionContext` already supports, since
  `subheading` returns `HTMLElement`. Four imports went orphan
  (`buildSettingsExport`, `exportStamp`, `copyText`, `ConfirmResetModal`) while
  `JsonImportModal` / `ExportFileSuggestModal` stayed live for other callers.

  The move itself was verified by **byte-exact roundtrip**, not by re-reading:
  the body was sliced programmatically, de-indented, `this.*` → `ctx.*` applied
  by regex, then reversed and compared `==` against the original. Identical.

  Six guards broke; a literal-matching predictor had called five. The miss was
  the `C1–C16` copy band, which pins a *substring* of a longer `setDesc` — whole
  literal against whole literal never matches that. All six amended by
  repointing the subject at the module and adding negative pins so a duplicate
  row cannot grow back in the tab; `markModified` stays **63** (39 + 17 + 4 + 3).

  Lesson 194 records the real find: the v0.1.50 heading-order guard measured
  `indexOf` over raw source, so the new module's own doc comment — which names
  both groups while explaining their order — was found first and failed the
  guard on correct code. The weakness pre-dated the extraction (a comment in
  `settingsTab.ts` would have done the same). Fixed by stripping comments before
  measuring, and red-proofed **in both directions**: seven mutations must go
  red, and an injected comment listing the groups in reverse order must leave it
  green.

  `mcp` **DONE** (2026-08-24) — Phase 3 complete. 172 lines out
  (4,259 → 4,085) into `src/settings/sections/mcp.ts`; the call site inside
  `capabilities()` became `mcpSection(this.sectionContext(), containerEl)`, with
  the "MCP servers" subheading deliberately left behind in `capabilities()`,
  exactly as with `terminal`. Verified by byte-exact roundtrip again: slice →
  de-indent → `this.*` → `ctx.*` → reverse the transform → `===` the original.
  Identical, so zero hand-retyping risk. Statement order was the hazard to
  watch: the Import button's `onClick` closes over `area`, which is declared
  *below* it, and that only works because the closure runs on click.

  A stored note claimed this renderer read the hub cache. **It was wrong** — the
  boundary was re-grepped and the body reaches for exactly `ctx.plugin` (15×),
  `ctx.display` (5×), `ctx.app` (2×) and `ctx.emptyState` (1×). It sits next to
  the hub methods in the file; it references none of them. Five imports went
  orphan (`kvToLines`, `linesToKv`, `parseMcpServersDoc`, `McpConsentModal`,
  `McpCatalogModal`) while `stackedTextArea` stayed live (two other callers) and
  `markModified` kept 38 uses in the tab.

  **Five guards broke; the prediction list had named two.** The three misses all
  live outside `test/smoke/settings.cjs`'s predicted sites: the root
  `test/smoke.test.cjs` "mcp.json import wired" arm, and the `v0.1.147h` /
  `v0.1.147i` MCP blocks, which read `src/settingsTab.ts` into a variable named
  `tab` and assert on modal construction. Same failure mode as Phase 3's
  `terminal` step — *the guard for a moved string is often not in the file you
  expect* — which is now a standing expectation, not a surprise. All five were
  amended by repointing the subject at the module; none was weakened.
  `markModified(` stays **63** (38 + 17 + 4 + 3 + 1) with `mcp.ts` added to the
  sum, and `v0.1.194` gained its fourth `wired` entry plus the MCP
  subheading-order arm in the same commit, per the Phase-3 rule.

  Red-proof: ten mutations, ten red. Two of the ten were **bad probes first** —
  one mutated a string that does not exist in the file (`parseMcpServersDoc(doc`
  vs the real `parseMcpServersDoc(area.value)`), the other renamed
  `markModified(` to `noop_markModified(`, which still matches the counting
  regex `/markModified\(/g`. Both reported a false "arm is dead". A probe that
  never lands looks exactly like a guard that never fires, so the harness now
  aborts loudly when its `count == 1` assertion fails instead of proceeding.
- **Phase 4** — `workspace` + `addWorkspaceExclusion`, `command` +
  `renderCommandRows`. Moved in pairs: each private helper has exactly one
  caller, both in the moving set.
  **DONE** (2026-08-24). 403 lines out of `settingsTab.ts` (4,085 → 3,682);
  `workspace.ts` 161 lines, `command.ts` 278 lines. Six imports went orphan in
  the tab and were pruned (`DEFAULT_PROMPT_SNIPPETS`, `newSnippetId`,
  `SnippetEditModal`, `FolderSuggestModal`, `sanitizeWorkspaceExclusions`,
  `WorkspaceMode`); `TFolder` and `canonicalVaultPath` stayed — other callers
  remain. Byte-exact roundtrip passed on all four blocks yet the code still
  failed typecheck on five unimported symbols: a roundtrip proves the *move*,
  never the *imports*. Enumerate free identifiers (types included) up front.
  11 guards broke across three files — `settings.cjs` (settings IA, v0.1.154,
  v0.1.181, v0.1.187, v0.1.188, v0.1.126, v0.1.94), `preview.cjs` (attach,
  v0.1.75, v0.1.76, v0.1.77, v0.1.79) and `quickask.cjs` (v0.1.81) — again
  confirming that a moved string's guard is usually not in the file you expect.
  Only 6 of the 11 were named in the 22-guard prediction. All were amended, not
  weakened: each keeps its behaviour assertion (repointed at the new module),
  gains a negative pin so the row cannot regrow in the tab, and pins the
  `sectionContext()` call proving the section is still wired in.
  `markModified(` totals **63**, unchanged (29 tab + 17 memory + 5 command +
  4 terminal + 4 workspace + 3 general + 1 mcp) and `resetButton(st` totals
  **20** (8 + 10 + 2) — the invariants that prove no control was lost in
  transit. Gate: tsc 0 · build 0 · smoke 296 ✓ / 0 ✗ (sorted diff vs baseline
  clean apart from v0.1.197's scanned-file count 124 → 126, which is the two new
  modules being picked up) · `npm test` 1858 ✓ / 0 ✗ · check:docs 38/0 ·
  red-proof 16/16. Four of the first sixteen mutations came back green because
  the *mutation* was faulty — appending a suffix leaves the original substring
  intact for an `includes()` pin, and a `/*x*/` prefix does not change a count.
  A green mutation indicts the probe before it indicts the guard: mutations must
  destroy the substring, and the harness now asserts the pattern is really gone.
- **Phase 5 — DONE** (`notifications`, `advanced`, `appearance`, `safety`).
  366 lines left the class: `safety` 69, `appearance` 74, `advanced` 104,
  `notifications` 119. `settingsTab.ts` 3,683 → 3,315 (−368 with the blank
  separators). New modules: `safety.ts` 90, `appearance.ts` 93,
  `advanced.ts` 124, `notifications.ts` 137. Unlike Phase 4, **no private
  helper travelled** — every `this.*` in all four blocks resolved to a
  `SectionContext` member, so the renderers moved alone.
  Three orphan imports pruned from the tab (`createSegmented`,
  `COMPLETION_SOUND_VARIANTS`, `ApprovalMode`); `createSliderInput` and
  `stackedTextArea` stayed, they still have tab-side callers.
  Byte-exact roundtrip on all four blocks before the write, and the
  free-identifier enumeration ran *first* this time — **tsc passed on the
  first attempt**, which is the Phase 4 lesson paying for itself.

  **14 guards amended** across two files — `settings.cjs` (v0.1.181,
  settings IA, v0.1.187, v0.1.126, stacked fields, settings copy C1–C16,
  v0.1.147e, v0.1.150, v0.1.94) and `preview.cjs` (v0.1.108). Only **6 of
  the 14 were predicted** by the L292 scan; `v0.1.147e`, `v0.1.150`,
  `v0.1.108`, `v0.1.94`, `stacked fields` and `settings copy` were not.
  Across Phases 4+5 the prediction has now missed more guards than it
  caught — **the baseline diff is the authority, the scan is only a hint.**

  Three region markers had to be re-anchored: the `safetySection` region
  became a module read, `advanced` likewise, and `agent`'s *end* marker
  (`private appearance(`) moved out, so it now ends at `private profiles(` —
  the next method still in the class.

  Two stale prose comments in the tab (L1553/L1556) still said the moved
  blocks lived in `private safety()` / `private advanced()`. They tripped
  the new `!includes("private safety(")` pin from a *comment*, not code —
  the recorded trap, hit for real. Updated to name the modules.

  Invariants held: `markModified(` **63** (15 tab + 17 memory + 5 command +
  5 appearance + 5 advanced + 4 terminal + 4 workspace + 4 safety +
  3 general + 1 mcp) and `resetButton(st` **20** (3 tab + 10 memory +
  2 workspace + 1 safety + 4 advanced). Both totals are unchanged by the
  move — that is precisely what they are for.

  Gate: tsc 0 · build 0 · smoke **296 ✓ / 0 ✗** · sorted-✓ diff vs baseline
  = **one line**, the `v0.1.197` file count 124 → 130 (+2 Phase 4,
  +4 Phase 5 — a counter, not a regression) · `npm test` **1858 ✓ / 0 ✗** ·
  `check:docs` 38/0 · red-proof **26/26**.

  Red-proof lesson (new): `String.replace(needle, repl)` mutates only the
  **first** occurrence. Four probes aborted because the pin survived
  elsewhere in the same file (`Approval mode` ×3, `markModified(` ×5). The
  harness caught it loudly instead of reporting a false MISS — mutate with
  `split(needle).join(repl)` so every occurrence dies.

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
- ~~**Duplicate `compressionEnabled` toggle (found in Phase 1).**~~ **RESOLVED
  2026-08-24, before Phase 3** (owner: "kenapa ada 2 setingan yang sama? …
  pindahkan saja ke Memory & Context"). The investigation found the duplication
  was wider than the toggle: the Model tab's "Context & compression" block
  (`settingsTab.ts` L1510-1574, from v0.1.17) rendered *three* rows that write
  the same keys as the Memory & Context block added in v0.1.175
  (`compressionEnabled`, `compressionThreshold`, `compressionProtectLastN`) plus
  one row with no counterpart (`modelContextLength`). Two writers on one key
  means editing either side leaves the other showing a stale value until the tab
  re-renders. Settled as: the whole Model-tab block is deleted; "Context window"
  is re-created as the FIRST row of the Memory & Context "Compression" group
  (owner's placement call — the threshold is a percentage *of* the window, so
  they belong together; Hermes Desktop instead keeps `model_context_length` in
  its Model section); the compression *model* slot (`auxModelRow(…,
  "compression", …)`) deliberately stays under "Auxiliary models". Guard:
  smoke `v0.1.193` (single ownership + sentence case), with `v0.1.17`, `v0.1.94`,
  `v0.1.175`, `v0.1.183`, `v0.1.187` amended in the same commit.
