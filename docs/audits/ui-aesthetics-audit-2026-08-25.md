---
title: "UI aesthetics audit — Settings and chat"
type: audit
status: done
date: 2026-08-25
tags: [openagent, ui, aesthetics, settings, chat, audit]
---

# UI aesthetics audit — Settings and chat

## Scope and conclusion

This is a source-level audit of the visual language requested for **cards,
rows, and dividers** in Settings and the chat panel. It does not authorize a
reskin or an implementation.

The current UI already has a coherent direction: normal Settings controls are
host-native rows; cards identify an object, result, or decision with its own
context; dividers describe an internal boundary rather than separating every
item. This direction matches the binding UI contract: prefer spacing, then a
hairline, and use a card only when it conveys real information structure.

The evidence does **not** support adding a generic card wrapper or a divider to
every Settings row or chat turn. That would create the nested-box "panelitis"
the project explicitly rejects. The one concrete interaction defect found is in
the Conversations panel; it is documented below because it also changes the
visual availability of row actions.

## Method and limits

- Read `skills/internal/openagent-ui/SKILL.md` (binding visual contract),
  `skills/internal/functional-ui/SKILL.md` (functional hierarchy), and the
  current Vercel Web Interface Guidelines source on 2026-08-25.
- Inspected the current markup and CSS for Settings sections, MCP/Skills/Cron
  objects, the conversations panel, tool cards, changed-files cards, system
  messages, approval, reasoning, and composer-adjacent surfaces.
- Compared the result with the completed [UI contract audit](ui-contract-audit-2026-08-20.md)
  and [UI audit](ui-audit.md).
- Chromium is unavailable in this workspace, so no new pixel comparison was
  possible. Findings labelled visual-system are source-backed; any future
  aesthetic change still requires real-DOM proof in light and dark themes and
  at narrow pane widths.

## Current visual system

### Settings: rows are the default, cards are the exception

The Settings page already uses one clear hierarchy:

1. The page title and description are separated by a single hairline
   (`styles.css`, `.oa-section-title`).
2. Subsections use a larger spacing break (28 px) and a compact heading plus
   description (`.oa-subsection`), rather than a new card.
3. Ordinary controls use Obsidian's native `.setting-item` rows.
4. Cards are reserved for an object with several related controls: for example
   one MCP server (`.oa-mcp-server`), one Skill row, or the new-cron form.

That is the right division of labor. A card is meaningful for an MCP server
because its enabled state, endpoint/command, headers or environment, and delete
action form one object. A scalar such as a slider, toggle, or dropdown does not
need a second container around its native Settings row.

### Chat: cards already mark work objects, not conversation turns

The chat transcript keeps ordinary user and assistant messages light. A card is
used where the agent exposes a distinct work object:

- a tool invocation (`.oa-tool`);
- a changed-files summary (`.oa-changed`);
- a system-level notice (`.oa-sysmsg`);
- an approval decision (`.oa-approval`);
- a code block or table.

Those cards already share the intended grammar: themed surface, small radius,
hairline border, compact header, and content that may expand. The header/content
boundary is a divider only where it explains structure: tool header → Input /
Output; changed-files count → file rows; preview header → diff rows. Markdown
`hr` is intentionally spacing-only, so ordinary assistant prose does not become
a ruled document.

## Findings

### F1 — Do not introduce global cards or global dividers

**Status: confirmed design constraint, not a defect.**

A generic `.oa-card` treatment across Settings would box normal scalar controls
inside another box while Obsidian already renders the row surface. Applying a
full divider between every chat turn would make a transcript read like a table
and compete with message rhythm.

**Keep:** spacing between Settings groups; native rows for scalar values; cards
for multi-control objects; dividers inside a card when its header, body, and
actions are separate reading regions.

**Do not add:** a card around every Settings group, a border around every chat
message, or a horizontal rule between every transcript turn.

### F2 — Conversations panel has a row-action accessibility and affordance gap

**Status: concrete defect; separate from a visual reskin.**

`src/ui/components/session-panel.tsx` renders a selectable conversation as a
`div` with `onClick`, with no keyboard handler. Its Rename and Delete buttons
are `display: none` until `.oa-panel-row:hover` in `styles.css`.

Consequences:

- a keyboard user has no semantic control to open a conversation;
- action buttons are visually and operationally unavailable without pointer
  hover;
- the row is visually presented as one interactive item but lacks a matching
  focus state;
- delete has no confirmation or undo affordance.

The appropriate repair is structural, not decorative: keep an outer layout
container, make the conversation-selection region a real button, keep Rename
and Delete as sibling buttons, and reveal the action cluster on `:focus-within`
as well as `:hover`. A later owner decision is needed for the destructive action:
confirmation or a short-lived Undo path.

### F3 — Current card variants should be reviewed as a family before any visual change

**Status: visual-system follow-up, not a proven inconsistency.**

The existing card roles deliberately have different weight:

- Tool and changed-files cards use `--radius-m` and a neutral hairline.
- System messages and approvals use `--radius-l`; approval also carries a
  warning border and shadow because it blocks an agent action.
- Cards with lists have capped inner scrolling, so a long result does not bury
  the composer.

These differences are justified by role in source. They should not be flattened
into one universal card style without screenshot comparison. The useful next
audit frame is a dense transcript containing a completed tool, an error tool,
changed files, a system notice, and an approval card. It can then answer whether
card weight is genuinely inconsistent or merely role-specific.

### F4 — Settings grouping should be audited by density, not by decoration

**Status: visual-system follow-up.**

The source already uses spacing for group breaks and cards for compound objects.
The remaining aesthetic question is whether a particular **dense** Settings tab
has too many consecutive groups or too much description text. This cannot be
answered honestly from selector names alone.

The appropriate real-DOM frames are:

- Capabilities: tools, terminal, web search, skills, and MCP in one pane;
- Model: provider/model controls plus auxiliary-model routes;
- Memory & Context: context, compression, and recall controls;
- a 280 px narrow pane and both light/dark themes.

Measure title-to-first-row rhythm, group-to-group gap, row height, overflow, and
visible focus. Only then decide whether to adjust spacing or add a divider to a
specific group boundary.

## Proposed decision boundaries for a later discussion

| Surface | Keep as-is | Candidate change | Requires owner choice |
| --- | --- | --- | --- |
| Ordinary Settings scalar | Native row | None by default | No |
| Compound Settings object | Card | Standardize only after a visual family comparison | Yes, if appearance changes |
| Settings group boundary | Spacing first | Add a hairline only when a measured dense group needs a stronger break | Yes |
| Ordinary chat turn | Lightweight transcript | None | No |
| Tool / diff / approval / system work object | Role-specific card | Compare card weight in a dense real transcript before unifying | Yes |
| Conversations row | Current layout is not sufficient | Semantic select control plus focus-visible actions | No for accessibility repair; yes for delete confirmation vs Undo |

## Next action

No CSS or markup change follows from this audit automatically. Before an
esthetic change, capture the real-DOM frames listed in F3/F4 and compare them
at the same viewport in light and dark themes. The owner can then choose one
narrow, evidence-backed visual direction rather than approving a generic
"card + row + divider" treatment.
