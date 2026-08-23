---
title: "Session panel extraction"
type: plan
status: done
date: 2026-08-23
tags: [openagent, plan, architecture, chat, sessions]
---

# Session panel extraction

## Summary

`ChatApp.tsx` owns both the agent conversation lifecycle and the complete
Conversations popover. The popover has a clear, independently testable surface:
session list, async search excerpts, date groups, active-row state, inline
rename, deletion, and close. Extract it into a dedicated UI component while
keeping session persistence and agent lifecycle in `ChatApp`.

The goal is a smaller, easier-to-reason-about chat owner with **no visible or
behavioral change** in the panel.

## Contract

`SessionPanel` receives rendered session data and event callbacks. It does not:

- import `SessionStore`;
- load, save, delete, or rename sessions itself;
- own the active chat lifecycle;
- call the agent loop;
- persist settings.

`ChatApp` remains the owner of async storage work and passes callbacks for
select, rename, delete, close, and filter changes. Search stays in `ChatApp`
because it is async and scoped through the current session partition; the panel
only renders supplied grouped rows and excerpts.

Visible behavior remains identical:

- panel is a composer-anchored popover with no backdrop;
- search, date groups, active row, compact density, rename Enter/blur, rename
  Escape, delete, outside-click, and Escape handling remain intact;
- an active-session rename still updates the in-memory title guard.

## Decisions

- D1: Extract rendering first, not storage/controller state. Source: owner
  approval 2026-08-23; minimizes blast radius.
- D2: Keep search state and result grouping in `ChatApp`. Source: async search
  is partition-sensitive and currently guarded by request timers.
- D3: Move only panel-local rename UI state into `SessionPanel`; persistence
  remains a callback. Source: inline rename is a panel interaction while
  `SessionStore.rename` must stay under the chat owner.
- D4: Preserve existing CSS class names and harness selectors. Source: real-DOM
  panel and slash scenarios already prove the user-facing contract.

## Impact

| File | Change |
|---|---|
| `src/ui/components/session-panel.tsx` | New presentational/stateful panel component. |
| `src/ui/ChatApp.tsx` | Removes panel JSX and panel-local rename state; retains session loading/search/persistence and overlay wiring. |
| `test/real-preview/build.mjs` | Existing panel/rename witness remains; add component-seam assertion only if needed. |
| `test/smoke.test.cjs` | Amend structural pins from ChatApp internals to the component contract. |
| `docs/working-agreement.md` | Add a Lesson only if extraction reveals a reusable hazard. |

Not changed: `SessionStore`, session JSON format, agent loop, Settings, CSS
visual contract, slash commands, or workspace policy.

## Phases

### Phase 1 — Characterize the surface

- Record all current panel state, callbacks, CSS classes, and browser witnesses.
- Preserve the existing panel and inline-rename real-DOM scenarios.

Verification: current real-DOM panel and slash scenarios pass before any move.

### Phase 2 — Extract component

- Add `SessionPanel` with typed props for groups, filter, hits, selection,
  rename, deletion, and close.
- Transfer only panel-local rename draft/cancel/commit UI behavior.
- Keep event handlers for persistence in `ChatApp` callbacks.

Verification: typecheck, panel/rename real-DOM lane, smoke structural guard.

### Phase 3 — Prove no drift

- Run `npm run verify`.
- Run chat real-DOM preview and inspect its panel/rename scenarios.
- Confirm no changed session persistence shape and no agent-loop import added to
  the panel component.

**Result (2026-08-23):** complete. `SessionPanel` now owns only the popover
render and rename draft interaction. `ChatApp` retains search, partition-aware
load/rename/delete persistence, queue cleanup, and the active-session title
mirror. Typecheck, smoke, chat real-DOM preview, docs, and skill checks passed.

## GWT

```text
Given saved conversations exist
When the user opens Conversations
Then the same popover, groups, active row, and search field appear above the composer.

Given a row is renamed and Enter is pressed
When persistence succeeds
Then the row title updates and the input closes without changing recency.

Given a rename draft is cancelled with Escape
When the input closes
Then the stored title remains unchanged.

Given a panel component renders
When it is inspected
Then it has no SessionStore or AgentLoop dependency; ChatApp remains the owner
of persistence callbacks.
```

## Risks

> [!risk]
> Moving state can change focus, outside-click behavior, or stale closure
> behavior. Mitigation: keep open/close and async search in `ChatApp`, preserve
> CSS selectors, and use the existing browser rename/panel scenarios as the
> compatibility witness.

> [!risk]
> Smoke pins may describe the old file location rather than the product
> contract. Mitigation: amend them to assert component ownership and callback
> wiring, not an obsolete ChatApp-local declaration.

## Open Questions

- None. The extraction boundary and non-goals are approved by the owner.
