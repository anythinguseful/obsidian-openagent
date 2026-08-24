---
name: openagent-ui
description: Project-local UI Design System for the Open Agent Obsidian plugin. Use BEFORE and DURING any UI/visual work on the plugin (chat view, settings tab, modals, statuses, missed-run notice, preview frames) to enforce the user's binding style decisions; pair with `frontend-design` for aesthetic direction, `functional-ui` for information arrangement, and `web-design-guidelines` for a11y/UX audits.
---

# Open Agent UI — binding style contract

These are the owner's confirmed decisions. They **win over** any generic advice in other skills (e.g. if `frontend-design` pushes a custom font or palette, that freedom is already spent — see "fixed constraints").

## Fixed constraints (do not violate)

1. **Theme = Obsidian's.** Colors and typography come ONLY from Obsidian CSS variables (`--text-normal`, `--text-muted`, `--text-faint`, `--background-primary/-secondary/-modifier-*`, `--interactive-accent`, `--color-*`). Never hardcode a palette or font stack. Dark/light/custom themes must Just Work.
   - **Fallbacks, scoped honestly** (audited 2026-08-20 — see `docs/audits/ui-contract-audit-2026-08-20.md`): a fallback is REQUIRED where a missing var would break a surface silently — the `-rgb` color variants used inside `rgba()` (`var(--color-red-rgb, 248 81 73)`), `--radius-*` (`var(--radius-m, 8px)`), and any var we define ourselves (`--oa-*` / `--shimmer-*`). Fallback is RECOMMENDED for `--color-*` (`var(--color-green, #08b94e)`). It is NOT required for core vars Obsidian guarantees (`--text-*`, `--font-*`, `--background-*`, `--interactive-accent`, `--shadow-*`) — hardcoding those would itself violate this constraint.
2. **Geometry/flatness follows prompt-kit + Hermes Desktop** — small radii (4–8px), hairline borders (`--background-modifier-border`), quiet surfaces, no glassmorphism, no heavy shadows, no gradients.
3. **No emoji in production UI** (Obsidian `setIcon()` with Lucide names only). Emoji are allowed ONLY in `preview/` frame tab icons and inside note *content* the agent writes (e.g. ✅/❌ run status in cron notes, which the user approved).
4. **Plugin name "Open Agent"** (with a space) in every user-visible string; id stays `openagent`; vault folders `openagent/openagent-skills`, `openagent/openagent-memory`, `openagent/openagent-sessions`, run archives `openagent/cron/runs/`.
5. **Never re-apply the reverted "polish/flat/fresh design" settings redesigns.** The user stopped that work and reverted it: keep the current section-rail settings layout; improve only by addition (new sections/rows), not reskinning. (2026-07-19 note: the same fate hit the B+ collapsible-cards settings redesign — approved, implemented, then fully reverted on the user's request because preview↔reality mismatches kept surfacing. Any settings-UI aspiration must go through a real-DOM harness first.)

## Anti-slop fingerprints (2026-08-06 calibration)

Sources verified in `docs/studies/skill-research-uiux.md` §1/§6 (Anthropic
frontend-design revision; ui.sh design-skill pages). These mark UI as
AI-generated *right now* — never emit them, whatever other skills suggest:

- Purple-dominant palettes / purple gradients; gradients ON TEXT or as
  background blobs (constraint 2 bans heavy gradients — this names the tell).
- "Panelitis": boxing content into nested rounded panels without an
  information reason. Separate with spacing or a background shift first.
- The three 2026 cluster looks are DEFAULTS, not choices: cream bg + serif
  display + terracotta accent; near-black + single acid/vermilion accent;
  broadsheet hairlines + zero radius. A brief asking for one wins — a free
  axis never goes there.
- Decorative shadows/glow as affordance; emoji-as-icon (constraint 3);
  letter-spacing tweaks; animating layout properties; custom easings.
- States designed at default only: always verify hover / focus-visible /
  disabled / busy / empty / error — and narrowest width, light AND dark —
  before calling UI done (ui.sh: check across breakpoints + interaction
  states).

## Voice & copy

- Interface copy in English (user chats with me in Indonesian, but UI strings are English).
- Sentence case buttons and labels; verbs that say exactly what happens ("Save changes", "Run all now"). Errors say what happened + how to fix, next to the field, red via `.oa-field-error` / `--color-red`.
- **Sentence case survives upstream parity.** Obsidian's plugin guidelines are explicit: "only the first word in a sentence, and proper nouns, should be capitalized." Hermes Desktop's `FIELD_LABELS` are Title Case because they are schema-driven form labels — copy the *term* ("Compression threshold"), never the casing ("Compression Threshold"). Known inherited violations still to fix: "Memory Budget", "Profile Budget" in `src/settings/sections/memory.ts`.
- Compact meta lines use ` · ` separators and relative times ("next in 3h").

### Settings descriptions (2026-08-22 — owner: "singkat, padat, jelas, mudah dipahami; menerangkan kegunaan utama")

- **Use first, mechanism second.** Lead with what the setting does for the user; the how only if it changes the decision.
- **≤ 140 characters** per `setDesc` literal (counted excluding `${...}` holes — enforced by smoke v0.1.191). Two sentences max.
- **Default goes at the end**: `On by default.` / `Off by default.` — not mid-parenthesis.
- **Never leak upstream-internal names** into UI strings: `target_ratio`, `protect_last_n`, `provider-advertised`, `operator-level instructions`, "the wire". Keep those in code comments; the user cares about the effect, not the upstream term.
- **Hard numbers that can drift** (e.g. fallback context 256000) appear in a desc only when the desc needs them — then pin them in a test so the copy goes red when the source changes.

## Anti-breakage rules (2026-08-20 — added after the settings tidy-up surfaced real regressions)

These are the recurring ways UI work has actually broken in this project
(Lessons 107, 121, 130, 133–136). The smoke guards are tripwires; these rules
stop the fall before it happens. Check all five before calling a UI change done.

1. **Settings-section wiring is all-or-nothing.** A new section needs FOUR edits
   in one commit: the `SectionKey` union member, a `SECTIONS` entry, a
   `SECTION_DESC` entry, and a `case` in `renderSectionBody`. A tab with a
   registry entry but no switch case renders EMPTY — this shipped once
   (Lesson 107/133). Smoke now proves every registry key has a case; never make
   it red.
2. **CSS must beat Obsidian's own painters.** Obsidian styles the same elements
   (`button:hover/active/focus`, `.clickable-icon`, `.setting-item` children)
   at (0,1,1). An `oa-` rule that sets background/border/color on those elements
   must also hold under their pseudo-states — use two-class selectors
   (`.oa-swatch.oa-color-x` = 0,2,0) or `:not()` guards. Verify the COMPUTED
   style in the real-DOM harness, not just "the rule exists" (Lesson 136: a
   class existing ≠ it rendering).
3. **`oa-` class names are a contract.** Before introducing a class, grep the
   smoke test for it — a guard may pin its ABSENCE (e.g. a retired unscoped
   `.oa-empty-title`). If so, rename yours or amend the guard in the same
   commit. Never reuse a retired name, and never let a guard keep pointing at a
   name you now legitimately use.
4. **Comments must not carry pinned-forbidden tokens.** Guard strings pin what
   may NOT appear; a comment or JSDoc that quotes the forbidden string bites
   itself (Lessons 121c/130/134). Rephrase comments without the pinned word.
5. **"Done" = real-DOM proof.** Source grep is not verification. A UI change is
   done only when a preview frame or the settings harness
   (`test/real-preview/build-settings.mjs`) actually rendered it — colors
   visible, tab non-empty, states correct. This extends the anti-slop "verify
   states" line: verify them *in a render*, not in code.

## Working ritual (required for every UI change)

1. Read this file, then skim `frontend-design/SKILL.md` principles; apply its *process* (deliberate choices, restraint, self-critique) inside the fixed constraints above. For functional surfaces (chat pane, settings rail, statuses), also apply `functional-ui/SKILL.md` *before* styling: groupings, density budget, narrow-first, states-as-layout. (2026-07-22: pairing added after the AI LABS design-skills video review — owner: "tambahkan skill yang sekiranya diperlukan".)
2. Before finishing, audit the touched markup with `web-design-guidelines` rules (vendored copy + refresh note) — at minimum: icon-only buttons have `aria-label`/`title`, focus stays visible, `transition` lists properties (never `all`), `prefers-reduced-motion` respected, semantic `<button>` for actions.
3. Add/refresh the matching frame(s) in `test/preview-frames.source.html` (static source — styled output lives under `preview/` only) and/or capture a real-render scenario in `test/real-preview/`, then run the full pipeline: `npx tsc -noEmit -skipLibCheck` → `npm run build` → `npm test` → `npm run release` (preview pages + settings audit + zip + byte-verify → prints **ZIP SYNCED**; pass `--skip-preview` only when headless Chromium is unavailable). Present `preview/index.html` (the hub — generated by `node test/build-preview.mjs`, gitignored).
4. New CSS goes at the end of `styles.css` in a commented section block; classes use the `oa-` prefix.
