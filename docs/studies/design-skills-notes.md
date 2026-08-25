---
title: "Design skills — video review notes (2026-07-22)"
type: study
status: done
date: 2026-07-22
tags: [openagent, design, ui, study]
---

# Design skills — video review notes (2026-07-22)

**Source:** AI LABS, "Insane Claude Design Skills You Need To Build Beautiful
Websites" (YouTube, published 2026-06-23, 14 min). Reviewed from the full
transcript. Owner directive: "tambahkan skill yang sekiranya diperlukan".

**Core claim of the video:** as models improve, their design output converges
on generic "AI slop" (same fonts, purple gradients on white). The edge is
forcing a design decision *before* any code, packaged as reusable SKILL.md
files.

## Adopted

- **New workspace skill `agents/skills/internal/functional-ui/`** (outside this repo, indexed
  in `agents/skills/README.md`): arrangement-first design, density budget,
  one-loud-thing, states-as-layout, narrow-first discipline (our equivalent
  of the video's mobile section — the Obsidian side pane is ~280 px),
  functional-only motion. This is the video's dashboard-skill idea adapted to
  our chat pane + settings tab. Provenance: distilled from the transcript;
  the upstream repo the video cited (bergside/awesome-design-skills
  skills/dashboard) returned 404 at fetch time, so nothing was copied.
- `agents/skills/internal/openagent-ui/SKILL.md` working ritual now pairs with it
  (arrangement before styling).
- `agents/skills/vendor/anthropics/frontend-design/` (Anthropic, Apache-2.0) and
  `agents/skills/vendor/vercel/web-design-guidelines/` (Vercel) were already vendored and already
  cover direction + audit.

## Skipped — with reasons

| Video item | Why skipped |
|---|---|
| shadcn skill + MCP | React-component registry for web apps; we build with Obsidian's own components and CSS variables. |
| GSAP skill | Landing-page animation library; conflicts with our flat/quiet constraint and adds bundle weight. The useful core (cheap properties, named transitions) is folded into functional-ui. |
| UI UX Pro Max | Marketing-oriented generator engine; our direction is already pinned, an engine adds process, not quality. |
| Taste presets (minimalist / brutalist / all-rounder / premium) | One-direction presets for landing pages; stacking one would violate "theme = Obsidian's". |
| Higgsfield (image/video gen) | No generated media needed inside a chat/settings UI. |
| Native mobile packs (Material 3 / SwiftUI / Expo) | We target Obsidian's own mobile shell; folded into functional-ui's narrow-first section instead. |

## Fact vs. claim (kept separate)

- **Fact (verified):** the skills list + descriptions above as presented in
  the video transcript; the raw Anthropic `frontend-design/SKILL.md` content
  (fetched raw, consistent with the vendored copy); the bergside dashboard
  URL returning 404 on 2026-07-22.
- **Claim (video, unverified):** mentions of "Opus 4.8" and "Fable 5" as the
  newest models with changed prompting guides — recorded as-is, not treated
  as established fact.
