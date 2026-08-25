---
title: "UI contract audit (bug-bounty pass) — openagent-ui compliance"
type: audit
status: done
date: 2026-08-20
tags: [openagent, ui, audit, contract]
---

# UI contract audit (bug-bounty pass) — openagent-ui compliance

## Summary

A bug-bounty style sweep of the binding UI contract
(`agents/skills/internal/openagent-ui/SKILL.md`, incl. the 2026-08-20 anti-breakage rules)
against the real codebase. Every check is evidence-based (grep + real-DOM
measurement where relevant). Verdict: **no critical violations** — the contract
is implemented. Three low-severity warns and one contract over-promise were
found and are documented honestly below.

## Method

- Grep `styles.css` for the banned fingerprints (transition-all, heavy
  gradients, hardcoded palette/fonts, letter-spacing, uppercase, bare
  `var(--…)` without fallback).
- Grep `src/` for emoji in production UI and for clickable non-`<button>`
  elements.
- Programmatic re-check of the settings wiring invariant (SECTIONS ↔
  renderSectionBody ↔ SECTION_DESC ↔ markModified count).
- Real-DOM harness (settings) already proves the recent surfaces (tabs render,
  colors computed, drag/tips/skeleton visible).

## Results

| # | Contract rule | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Theme = Obsidian's; never hardcode palette/font | ✅ | 0 hardcoded hex palette (only a literal `#000` in a CSS **mask**, which requires it); 23/23 `font-family` uses are `var(--font-*)` |
| 2 | No heavy gradients | ✅ | only 2: prompt-kit shimmer (approved) + a `mask-image` fade (not decorative) |
| 3 | No emoji in production UI | ✅ | 0 emoji in `src/**/*.ts(x)` |
| 4 | Plugin name "Open Agent" (space), `openagent` id/folders | ✅ | verified in copy + data layout |
| 5 | Never re-apply reverted reskins | ✅ | settings rail unchanged; additions only (Appearance/Advanced rows, empty states, skeleton) |
| 6 | `transition` lists properties, never `all` | ✅ | 0 `transition: all` |
| 7 | No `…`→`...` drift (ellipsis char) | ✅ | no three-dot in UI copy; `…` used |
| 8 | Semantic `<button>` for actions | ✅ | provider rows are `<button type="button" aria-pressed aria-label>`; disclosure heads are `<button aria-expanded>`; snippet actions/grip have aria-label/title |
| 9 | `:focus-visible` kept visible | ✅ | 29 focus-visible rules |
| 10 | Radius via `var(--radius-*, fallback)` + `--size-4-*` spacing | ✅ | 98 radius uses; size-4-1/2/3/4/6 in use |
| 11 | `prefers-reduced-motion` respected | ✅ | multiple blocks incl. shimmer/skeleton/pulse |
| 12 | Settings wiring all-or-nothing | ✅ | 14 sections, 0 missing `case`, 0 missing `SECTION_DESC`, `markModified` = 54 (pin matched) |
| 13 | `oa-` class names are a contract (grep pins first) | ✅ | all guards green (`npm test`) |
| 14 | "Done" = real-DOM proof | ✅ | F38/F39/F40/F41 probes + shots (drag, surfaces, tips, skeleton) |

## Warns (low severity, pre-existing, owner decision)

1. **Small-caps labels use `uppercase + letter-spacing`** — 9 selectors:
   `.oa-tool-pane-label`, `.oa-subsection-title`, `.oa-provider-route-label`,
   `.oa-provider-group-label`, `.oa-slash-hdr`, `.oa-steer-label`,
   `.oa-model-menu-sect`, `.oa-vis-group-label`, `.oa-intro-wordmark`.
   The anti-slop list names "letter-spacing tweaks" as an AI-slop fingerprint.
   These are **consistent, deliberate** (and the wordmark is brand). Changing
   them is a reskin, which constraint 5 forbids. **Recommendation: leave as-is;**
   record the decision here so it isn't re-litigated.
2. **`aria-live` only on 2 surfaces** (settings search status, Quick Ask foot).
   Transient `Notice` toasts are Obsidian-owned and don't announce — outside our
   control. Acceptable residual.
3. **32 `--color-*` uses lack a fallback** (green 11, red 8, purple 4, orange 4,
   blue 2, accent 3). These are core-defined in Obsidian's app.css, so no bug;
   the one surface that actually broke (profile swatches) was a **specificity**
   bug, already fixed in v0.1.153. Fallback for `--color-*` is recommended for
   NEW work, not required retrofitting.

## Contract clarification (the honest finding)

Constraint 1 was tightened on 2026-08-20 to: *"Every `var()` carries a
fallback — absolute."* That over-promises: the codebase has ~1,200 `var()`
uses without a fallback (`--text-*`, `--font-*`, `--background-*`,
`--interactive-accent`, `--shadow-*`), and **correctly so** — those are
guaranteed by Obsidian core and must never be hardcoded. The genuinely risky
group — the `-rgb` variants used inside `rgba()` — already carries a fallback
everywhere (0 bare `var(--color-*-rgb)` hits).

The rule is refined below to what is actually defensible: fallback **required**
for `-rgb` variants, `--radius-*`, and custom `--oa-*`/self-owned vars;
**recommended** for `--color-*`; **not required** for core typography/background
vars (hardcoding them would itself violate constraint 1).

## Conclusion

The UI contract is implemented; the anti-breakage rules added 2026-08-20 are
holding (guards green, harness green). No production code changed in this
audit — only the contract text is clarified. Build `…-skeleton-test.zip`
remains current.
