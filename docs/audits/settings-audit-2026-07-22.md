---
title: "Settings tab audit — 2026-07-22"
type: audit
status: done
date: 2026-07-22
tags: [openagent, settings, audit]
---

# Settings tab audit — 2026-07-22

Baseline: v0.1.2 (`d5008a9`). Scope: all 10 sub-pages — General, Providers,
Model, Agent, Profiles, Capabilities, Memory, Sessions, Automations, Advanced.
**Status: CLOSED.** S1 + S2 fixed in v0.1.3/v0.1.4 (owner-verified in
production); the S3 batch (all 5) fixed in v0.1.5 — probes F1–F8 all green.
S4-9: owner decision on 2026-07-23 — **leave as-is** (accepted consciously).

## Method (why this evidence can be trusted)

1. Full static read of `src/settingsTab.ts` (2,822 lines) + the settings CSS.
2. New **real-DOM settings harness** (`test/real-preview/`): the real
   `OpenAgentSettingTab` mounted through an extended `obsidian-shim.ts`
   (added `PluginSettingTab`, `Setting`, all component classes using the real
   app DOM structures) against the vendored `reference-obsidian-app.css`
   (theme classes on `<body>`, like the app). The canned plugin is populated:
   4 providers, 2 profiles (one with pins), 2 fallback rows, 2 MCP servers,
   2 automations (one paused, last run error), 2 snippets, skills list,
   5 hub taps with catalogs.
   - Files: `settings-entry.tsx` (mount), `build-settings.mjs` (10 section
     screenshots + DOM/keyboard probes). Standalone — **not** wired into
     `npm run release`; the canonical 10-frame chat pipeline is untouched.
   - **Evidence policy:** screenshots are taken after resizing the viewport to
     the content's full height. The real app pins
     `body { height:100%; overflow:clip }`, so on a short viewport the paint
     below the fold is eaten — the first pass produced black regions and fake
     "clipped text"/"missing rows" that turned out to be pure harness
     artifacts (verified healthy via DOM + re-shoot).
3. Probe results: `test/real-preview/settings-audit-probes.json` (committed).
   Screenshots: `test/real-preview/shots/settings-*.png` (gitignored, like
   chat shots); reproduce any time with `node test/real-preview/build-settings.mjs`.

Severity: **S1** candidate to fix first · **S2** clearly worth fixing ·
**S3** polish · **S4** awareness / needs owner choice.

---

## S1-1. "Custom model id" breaks typing and corrupts model state — reproduced bug — **FIXED in v0.1.3** (probe F1 flipped green: `fixed: true`, commit exactly once on Enter)

**Scene:** Settings → Model → click "custom model id" and type `gpt-4o`.
After the **first character** the whole tab re-renders: the field clears,
focus jumps to the page body, and the rest of the typing is lost. Worse, the
half-typed string is already committed: `model` becomes `"g"` and `"g"` is
appended to `favoriteModels` — and persisted.

**Evidence:** probe F1 typed 3 chars → `favoritesAfter: […, "g"]`,
`modelAfter: "g"`, `focusAfter: BODY`.

**Cause:** `settingsTab.ts → model()` — the custom-model `TextComponent`
writes + `saveSettings()` + `refreshViews()` + `this.display()` on every
`input` keystroke, and pushes every intermediate string into
`favoriteModels`.

**Fix direction:** commit on Enter/blur only (no re-render per keystroke);
add to favorites on commit only; keep the dropdown in sync without
`display()`. Re-probe with the harness typing E2E to verify.

## S2-2. Provider disclosure heads are unreachable by keyboard — **FIXED in v0.1.4** (probe F2: real `<button>`s + `aria-expanded`; pixels verified identical)

**Evidence:** probe F2 — "Other providers (1)" and
"Custom headers — LM Studio (local)" are clickable `<div>`s with no
role/tabindex: keyboard and screen-reader users cannot expand them.

**Fix direction:** render them as real `<button>`s (native focus, Enter,
Space) or add `role="button"` + `tabindex="0"` + keydown.

## S2-3. Profile-row icon buttons have no accessible name — **FIXED in v0.1.4** (probe F3: 0 missing names; per-profile `aria-label`s)

**Evidence:** probe F3 — 6 icon-only buttons (Edit / Clone / Delete on both
profile rows) carry only `title`, no `aria-label`. (Export already has both —
the pattern exists in the same file.)

**Fix direction:** add `aria-label` mirroring the tooltips.

## S3-4. Tab strip is click-only — no arrow-key navigation — **FIXED in v0.1.5** (probe F4: ArrowLeft/Right cycle with wrap and activate on focus, Home/End jump to edges, roving `tabindex` (exactly one `0`, rest `-1`); ink bar + hold-scroll buttons untouched)

**Evidence:** probe F4 — `role="tablist"`/tabs implies keyboard semantics,
but ArrowRight does not move focus (stays on "General").

**Fix direction:** ArrowLeft/Right + Home/End navigate tabs (roving
tabindex), keeping the visible scroll buttons behavior.

## S3-5. Test-connection result sits ABOVE the row that produces it — **FIXED in v0.1.5** (probe F5: element now directly below the row, and hidden while empty via `.oa-test-result:empty` so no stray gap)

**Evidence:** probe F5 — `.oa-test-result` is created before the
"Test connection" Setting; the result appears between "Custom headers" and
the button, and the empty div permanently occupies layout space.

**Fix direction:** move the result element directly below the row; hide it
while empty.

## S3-6. Build-stamp tooltip is in Indonesian — **FIXED in v0.1.5** (probe F6: English copy — "Build … — proves which build is running after file swaps")

**Evidence:** probe F6 — `title` = "Build … — dipakai untuk memastikan
plugin tidak menjalankan build basi". Contract: UI strings are English.

**Fix direction:** English copy, e.g. "Build … — proves which build is
actually running after file swaps."

## S3-7. mcp.json import: textarea precedes its own label row — **FIXED in v0.1.5** (probe F7: Setting row first, textarea below; desc text updated "above" → "below")

**Evidence:** probe F7 — inside `.oa-mcp-import` the `<textarea>` comes
first; the "Import mcp.json" Setting (name/desc/button) follows below,
inverted vs. every other row and vs. the label-first JsonImportModal.

**Fix direction:** move the Setting row above the textarea, or label the
textarea directly and drop the Setting.

## S3-8. Profiles: "New profile" row packs three controls — **FIXED in v0.1.5** (probe F8: name field + "Create blank" only on the row; "Clone active profile" moved to its own bare button row, same pattern as "Add MCP server")

**Evidence:** `settings-profiles.png` — text input + two buttons in one row;
at 700px the description wraps to five lines and the placeholder truncates.

**Fix direction:** stacked control (as on the Model page), or give
"Clone active" its own row.

## S4-9. Capabilities is a single ~4,700px page (35+ rows) — **OWNER DECISION 2026-07-23: leave as-is**

**Decision:** the owner explicitly chose option (a). The page stays one long
document; this is accepted consciously, not an oversight. Constraint #5 still
applies — no silent structural change. Revisit only on a fresh owner ask.

**Follow-up 2026-07-23 (v0.1.6):** a fresh owner ask DID arrive — Hermes
semantics for tool controls. The 14 per-tool rows were removed (not a
redesign: a deletion the owner explicitly requested), shrinking the page in
the harness from 35 to 20 setting rows. The five toolset switches remain the
only tool controls.

**Evidence:** `settings-capabilities.png` — Tools (5 toolsets + 14 tool
rows), Skills (3 rows + browser), MCP servers, Browse Hub. Reachable but
~6–7 screens of scrolling.

**Options:** (a) leave as-is — default, per constraint #5 (improve by
addition only); (b) owner-approved structure change (split Capabilities into
two tabs, or grouping) — explicit choice required; a previous collapsible
redesign was reverted, so nothing structural happens silently.

---

## Verified healthy (do not touch)

- **Tab strip:** left/right nudge + press-hold scroll, active tab
  auto-centers, ink bar lands correctly on all 10 sections.
- **Pin notes** (provider/model pinned by profile) — visible, unambiguous.
- **Model fallback rows:** stacked provider+model controls; dropdown for the
  active provider, plain text otherwise.
- **Automations:** status dots, `·`-separated meta lines, inline red error
  line; preset/cron validation; focus-skill chips.
- **Browse Hub:** per-tap status chips, trust badges, install/uninstall rows,
  featured/search counts — all settle with canned taps.
- **Danger zone:** two-step confirms, typed `RESET`, red confined to the
  destructive button.
- **Empty/negative states:** explicit copy everywhere; no blank surfaces.

## Harness notes for future work

- `obsidian-shim.ts` also gained `createEl/createDiv/createSpan` polyfills,
  settings-tab/row icons, and a stub `parseYaml` — all test-only.
- Lesson 19 (working agreement): harness shots can lie; verify layout claims
  in the DOM before believing pixels.
