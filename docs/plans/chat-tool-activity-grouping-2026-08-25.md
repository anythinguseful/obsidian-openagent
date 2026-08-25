---
title: "Chat tool activity grouping"
type: plan
status: done
date: 2026-08-25
tags: [openagent, plan, ui, chat, tools]
---

# Chat tool activity grouping

## Summary

A consecutive block of tool invocations currently renders as several adjacent
cards. In a dense chat transcript this repeats the same outer border and radius
for every row, making tool activity read as a wall of cards rather than one
sequence of agent work.

This change makes `.oa-tools-list` the one outer activity card. Each existing
`Tool` remains a semantic, independently expandable row inside it. Hairlines
separate consecutive rows; an opened Input, Output, Error, or Denied detail
stays attached to the row that owns it. Tool state colors, badges, disclosure
behavior, output caps, and the Appearance setting remain unchanged.

## Contract

Before:

```text
[ tool A · Processing ]
[ tool B · Ready      ]
[ tool C · Completed  ]
[ tool D · Error      ]
  Input / Error detail
```

After:

```text
┌──────────────────────────────┐
│ tool A          Processing   │
├──────────────────────────────┤
│ tool B          Ready        │
├──────────────────────────────┤
│ tool C          Completed    │
├──────────────────────────────┤
│ tool D          Error        │
│ ──────────────────────────── │
│ Input / Error detail          │
└──────────────────────────────┘
```

- A consecutive `tool` block has one outer border, radius, and background.
- Every `Tool` header remains a real button with its own `aria-expanded` state.
- A tool's open body remains visually and semantically attached to that row.
- A block containing only one tool has the same compact outer shape, without a
  duplicate nested card.
- `toolViewMode` behavior (`expanded`, `collapsed`, `hidden`) does not change.

## Decisions

| Pick | Reason | Tradeoff |
| --- | --- | --- |
| Reuse `.oa-tools-list` as the outer activity card | The chronological grouping already exists in `ChatApp`; no new React state or data transform is needed. | A standalone Tool rendered outside this list retains its existing card style. |
| CSS-only card consolidation | Tool markup, expansion behavior, error content, and test fixture stay stable. | The visual group has no decorative title; the first tool row is the useful label. |
| Divider between rows | Makes the sequence scannable without multiplying rounded cards. | Needs a clear border only between direct neighboring tools. |
| Preserve state colors | Processing, Ready, Completed, Error, and Denied are semantic states, not decoration. | No visual simplification may reduce their contrast. |

## Impact

- `styles.css` — consolidate list/card chrome in place.
- `test/smoke/chat.cjs` — preserve the grouped-wrapper and per-tool disclosure
  contract.
- `test/real-preview/build.mjs` and `test/real-preview/chat-entry.tsx` —
  measure the single outer border and row separators in the static tool-state
  fixture.
- `docs/audits/ui-aesthetics-audit-2026-08-25.md` — this plan implements its
  dense-tool-transcript follow-up.

No agent loop, tool execution, output truncation, or user setting changes.

## Phases

### Phase 1 — consolidate outer chrome

- Give `.oa-tools-list` the outer card surface.
- Remove only the nested border/radius/background from child `.oa-tool` when it
  appears in that list.
- Add a hairline between neighboring child tools.
- Keep the existing child content divider and open/error behavior.

### Phase 2 — prove the visual contract

- Extend the `toolstate` real-DOM lane to measure one outer group, four rows,
  three row separators, and a detail body attached to its error row.
- Test normal and reduced-motion state glyph behavior without changing its
  existing owner-approved rotation contract.

## Implementation status (2026-08-25)

Both phases are complete.

- `.oa-tools-list` now owns the one outer border, radius, background, and
  clipping surface for a consecutive tool block.
- Direct child `.oa-tool` cards are visually flattened into rows; adjacent rows
  receive exactly one hairline separator, while an open Error/Input/Output body
  stays inside its own row.
- Smoke coverage keeps the outer activity card, row separator, and existing
  disclosure semantics together.
- The real-DOM `toolstate` fixture passes under HeadlessChrome 149. It measures
  one bordered 8 px-radius group with four rows, three separators, and an open
  error detail attached to its fourth row. Existing normal and reduced-motion
  spinner witnesses also remain green.

## GWT

```text
Given four consecutive tool calls in an assistant turn
When the chat renders them
Then one outer card contains four independently expandable tool rows separated
by three hairlines.

Given an error tool whose disclosure is open
When the group renders
Then the Input and Error detail remains below that tool's own header, inside
the shared card.

Given the user selects hidden tool view mode
When the assistant turn renders
Then the entire activity group remains absent, as before.
```

## Risks

> [!risk]
> Child selectors can accidentally erase the error detail divider or rounded
> group clipping. Mitigation: inspect computed borders and DOM ancestry in the
> real-DOM fixture.

> [!risk]
> A generic change to `.oa-tool` could affect any standalone caller.
> Mitigation: scope every consolidation rule to `.oa-tools-list > .oa-tool`.

> [!risk]
> Grouping can hide state distinctions. Mitigation: preserve the existing
> state icon, text badge, and contrast witnesses.

## Open Questions

- Should a future dense transcript add a textual "Tool activity" heading? —
  deferred; the current first row already names the action and a repeated label
  would add vertical noise.
