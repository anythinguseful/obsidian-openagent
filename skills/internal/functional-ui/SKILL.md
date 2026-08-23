---
name: functional-ui
description: Taste layer for functional/product surfaces (chat panes, settings tabs, dashboards, status views) — information arrangement, density budgets, progressive disclosure, narrow-width discipline. Use when building or reshaping UI whose job is to be USED rather than admired. Pair with openagent-ui (binding contract, wins on conflict), frontend-design (aesthetic direction/process), web-design-guidelines (final audit).
---

# Functional UI — arrangement is the design

Distilled 2026-07-22 from the AI LABS video "Insane Claude Design Skills You
Need To Build Beautiful Websites" (dashboard-skill segment of the transcript)
+ Anthropic's frontend-design process, adapted to the Open Agent Obsidian
plugin. Not lifted from any upstream repo — the dashboard-skill URL the video
cited (bergside/awesome-design-skills) returned 404 at fetch time.

Landing-page taste (frontend-design) optimizes for a point of view.
Functional taste optimizes for **zero hesitation**: the user instantly sees
what state things are in and what to do next. On functional surfaces the
"design" is mostly *arrangement*, not styling.

## Arrange before you style

Before writing code, write down (in thinking):

1. The surface's single job (one sentence).
2. The 3–5 pieces of information on it, grouped by how the user reads them
   (status -> primary content -> secondary actions).
3. What the user does most often here — its control must be the easiest to reach.

If you cannot name the groupings, the surface is not designed yet.

## Density budget (anti-clutter)

- One screen serves one primary task. Supporting info gets demoted
  (muted/smaller) or moved behind progressive disclosure (a "Details" toggle,
  a modal, a sub-section).
- If the primary task needs scrolling, **remove** things — never shrink type
  or tighten line-height to cram more in.
- Whitespace is load-bearing: it is what makes groupings visible. Prefer
  spacing over dividers; prefer dividers over boxes-inside-boxes.

## One loud thing per surface

A chat pane has at most one element that shouts (e.g. the running state).
Everything else stays quiet. When you add a new accent, name the old accent
you are retiring.

## Hierarchy from the system, not from novelty

Build hierarchy from placement, spacing, and the host's existing text roles
(Obsidian's `--text-muted` / `--text-faint` and its size steps). Never
introduce a new color, weight ramp, shadow, or gradient just to create
emphasis — inside a themed host that breaks dark/light parity and reads as
foreign (see openagent-ui fixed constraint 1).

## Every element does exactly one job

- Controls are verbs that say what happens ("Save changes"); information is
  nouns, delivered as compact meta lines separated by " · ".
- No element silently does double duty (a badge that is also a button, a
  status line that is also a link).
- Icon-only buttons get `aria-label` (never `title` — owner regression
  guard); everything clickable is a real `<button>`.

## States are part of the layout

Empty, loading, error, and disabled are designed states, not afterthoughts:

- Empty states invite the first action (what it is + how to start).
- Errors say what happened and how to fix it, next to the field they belong to.
- Never ship a surface whose failure renders blank.

## Narrow-first discipline (our "mobile")

An Obsidian side pane goes down to ~280 px; mobile Obsidian even less. A
layout that only works wide is a broken layout:

- Check the surface at its narrowest realistic width before calling it done
  (preview frame or harness resize).
- Text truncates gracefully (ellipsis or wrap), never overflows or overlaps.
- Primary controls keep reachable size and spacing when narrow; multi-column
  tricks collapse to one column early.

## Motion is functional, short, and optional

- Transitions announce cause: an element appearing, a state change, a panel
  opening — 100–200 ms, named properties (never `all`).
- No decorative animation in functional UI: no scroll reveals, no parallax,
  no ambient motion.
- `prefers-reduced-motion` respected; an animation must never carry the only
  signal (pair with a text/icon state).

## Finish pass

1. Screenshot the frame (pixels are ground truth in this project).
2. Chanel check: remove one thing; if the surface still does its job, keep
   it removed.
3. Run the web-design-guidelines audit on the touched markup.
4. Confirm against openagent-ui fixed constraints — on any conflict,
   openagent-ui wins.
