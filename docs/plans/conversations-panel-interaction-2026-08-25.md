---
title: "Conversations panel interaction"
type: plan
status: done
date: 2026-08-25
tags: [openagent, plan, ui, chat, accessibility]
---

# Conversations panel interaction

## Summary

The Conversations panel visually presents each saved chat as a selectable row,
but its selection surface is currently a clickable `div`. Rename and Delete are
hidden until pointer hover, leaving keyboard users without an equivalent path.
The owner selected a short confirmation dialog before a saved chat is deleted.

This change makes the main selection surface a semantic button, exposes actions
on keyboard focus as well as hover, and confirms deletion through an
Obsidian-native modal. It preserves session loading, inline rename, search,
and the existing panel placement.

## Contract

Before:

```text
[ div click: title + meta ]  [Rename/Delete appear only on hover]
Delete → immediately removes the saved chat
```

After:

```text
[ button: title + meta ]     [Rename] [Delete]
       focus reveals actions
Delete → “Delete chat?” → Cancel / Delete chat
```

- The session title/meta is a real `button` that invokes `onSelect(id)`.
- Rename and Delete are sibling buttons, never nested inside the selection
  button.
- Hover and `:focus-within` both reveal the action cluster.
- Delete opens an Obsidian `Modal`; only its destructive confirmation invokes
  `onDelete(id)`.
- Escape/cancel closes the modal without deleting.
- Inline rename still replaces the selection button only while editing.

## Decisions

| Pick | Source | Tradeoff |
| --- | --- | --- |
| Semantic selection button | UI aesthetics audit F2 + Vercel guideline | Requires a small markup split so controls do not nest. |
| Reveal on `:focus-within` | UI aesthetics audit F2 | Keeps the compact pointer appearance while making keyboard actions discoverable. |
| Confirmation before deletion | Owner decision, 2026-08-25 | One extra click; avoids an irreversible action from a compact icon button. |
| Obsidian `Modal` | Existing profile/reset confirmation pattern | Reuses host focus/Escape behavior rather than creating a second modal system. |

## Impact

- `src/ui/components/session-panel.tsx` — semantic row structure and local
  delete-confirmation modal.
- `src/ui/ChatApp.tsx` — pass the Obsidian `App` to the panel.
- `styles.css` — refine the existing panel-row selectors in place and add the
  new selection-button/focus-within contract.
- `test/smoke/chat.cjs` — pin the semantic selection, focus reveal, and modal
  callback path.
- `test/real-preview/chat-entry.tsx` and `test/real-preview/build.mjs` — prove
  keyboard focus exposes actions, Enter selects a session, cancel preserves it,
  and confirmation calls deletion.

## Test seams

The approved public seams are:

1. **Session selection:** keyboard focus and Enter on the visible row control
   invokes the existing `onSelect(id)` callback.
2. **Action discoverability:** a focused row reveals Rename/Delete without a
   pointer hover.
3. **Deletion:** Cancel leaves the callback untouched; only the modal's
   destructive button invokes `onDelete(id)`.

## Phases

### Phase 1 — semantic row and focus affordance

Replace the clickable row with a layout container, selection button, and action
siblings. Preserve inline rename and existing callbacks.

### Phase 2 — confirmed deletion and real-DOM proof

Add the host modal, then extend the panel fixture to execute the four approved
seams.

## Implementation status (2026-08-25)

Both phases are complete.

- The selectable title/meta surface is now `.oa-panel-row-select`, a real
  button. Rename and Delete remain sibling buttons; inline rename temporarily
  replaces only the selection button.
- Rename/Delete actions are revealed by either pointer hover or
  `:focus-within`; the focus-visible selection ring keeps the keyboard path
  apparent.
- `ConfirmSessionDeleteModal` reuses Obsidian `Modal`. Cancel does nothing;
  only `Delete chat` invokes the existing `onDelete` callback.
- The real-DOM panel/slash lanes pass under HeadlessChrome 149: focus reveals
  both actions, Enter selects `s-1`, inline rename still commits/cancels, Cancel
  preserves the row, and confirmation removes `s-1` exactly once.

## GWT

```text
Given the Conversations panel is open
When a user focuses a saved chat with the keyboard
Then Rename and Delete become visible, and Enter selects that chat.

Given the user presses Delete on a saved chat
When they choose Cancel in the confirmation modal
Then the saved chat remains and no delete callback is invoked.

Given the user confirms Delete chat
Then the existing delete callback runs exactly once.
```

## Risks

> [!risk]
> Changing the row structure can break inline rename or long-title containment.
> Mitigation: preserve `.oa-panel-row-text`, keep the existing ghost geometry
> witness, and add the focus/selection witness beside rename tests.

> [!risk]
> A custom dialog could create a competing focus model.
> Mitigation: reuse Obsidian `Modal`, as the profile and reset flows do.

## Open Questions

- None for this scope. Chat architecture verification follows this completed UI
  change as requested by the owner.
