---
title: "Settings grouping visual system"
type: plan
status: done
date: 2026-08-25
tags: [openagent, plan, ui, settings, aesthetics]
---

# Settings grouping visual system

## Summary

Settings currently mixes three legitimate but visually disconnected treatments:
native scalar rows, compound-object cards, and headings followed by flat
siblings. The owner reports that this makes groups feel separate rather than
part of one system.

This change adds a lightweight **group shell** around every named Settings
subsection. It preserves native rows inside the shell and keeps MCP servers and
cron tasks as stronger object cards, but aligns their radius, border, padding,
and divider vocabulary with the parent group. No setting moves, renames, or
behavior changes.

## Contract

Before:

```text
Subheading
flat native rows
object card
flat native rows
```

After:

```text
Group shell
  subheading + purpose
  ───────────────────
  native rows
  object card(s), when an entity is managed
```

- Every direct `.oa-subsection` and the sibling content it introduces is wrapped
  in `.oa-settings-group` after a section renderer finishes.
- The shell uses Obsidian theme variables, a quiet hairline, radius `m`, and no
  shadow.
- Direct native rows become a contiguous list with hairlines between siblings.
- Object cards remain visually stronger than scalar rows, but use the same
  border color, radius family, horizontal rhythm, and internal dividers.
- Existing settings behavior, search harvesting, row focus, and section order
  remain unchanged.

## Decisions

| Pick | Approach | Tradeoff |
| --- | --- | --- |
| Group every named subsection | Post-render DOM grouping in `renderSection()` | Avoids rewriting every section renderer, while preserving their existing builders and event handlers. |
| Keep native rows | Style direct `.setting-item` siblings inside the shell | Avoids nested cards around simple toggles, sliders, and dropdowns. |
| Preserve object distinction | MCP server and cron task rows remain object cards | Their multi-control configuration remains readable without becoming a foreign visual system. |
| No global card style | Scope the new group selectors to `.oa-settings` | Chat cards remain role-specific and unchanged. |

## Impact

- `src/settingsTab.ts` — group direct subsection content after each live
  renderer completes.
- `styles.css` — append the new group-shell family and refine existing MCP/cron
  object-card selectors in place.
- `test/smoke/settings.cjs` — ownership and structural guards.
- `test/real-preview/build-settings.mjs` — real-DOM geometry/structure witness.
- `docs/audits/ui-aesthetics-audit-2026-08-25.md` — source audit remains the
  rationale for this plan.

No plugin data schema, provider behavior, tool execution, or settings label is
changed.

## Phases

### Phase 1 — group shell and native rows

Goal: group every direct subsection and its following siblings into a quiet
shell without changing renderer ownership.

Files:
- `src/settingsTab.ts` — add the post-render grouping helper and invoke it only
  after a real section render.
- `styles.css` — add shell, heading, direct-row, divider, focus, and narrow-pane
  rules.
- `test/smoke/settings.cjs` — lock the grouping call, wrapper, and CSS contract.
- `test/real-preview/build-settings.mjs` — inspect the resulting direct DOM
  structure and geometry.

### Phase 2 — align compound object cards

Goal: make MCP-server and cron-task objects read as children of the same system,
not as unrelated cards.

Files:
- `styles.css` — refine MCP and cron object-card spacing, border, radius, and
  sibling separation in place.
- `test/smoke/settings.cjs` and `test/real-preview/build-settings.mjs` — lock
  both object-card variants and their relationship to the parent shell.

## Implementation status (2026-08-25)

Phases 1 and 2 are implemented in this branch:

- `OpenAgentSettingTab.groupSubsections()` wraps each finished named subsection
  and its direct sibling content without cloning nodes or changing the detached
  search-harvest path.
- Group shells keep native rows contiguous with hairline separators.
- MCP server cards and cron task cards now share the group system's border,
  radius, horizontal rhythm, and internal history separator.
- A smoke guard and real-DOM probe `F49settingsGroups` cover the ownership,
  structure, and computed-card contract.

`npm run verify` passes. The real-DOM Settings witness runs locally with
HeadlessChrome 149 and `F49settingsGroups` passes: all six Capabilities
subsections are grouped, no subsection is left loose, MCP is inside its group
with a 1 px border and 8 px radius, and cron tasks retain the same 1 px / 8 px
object-card contract. The tracked witness records the result, so this plan is
`done`.

## GWT

```text
Given a Settings section with a named subsection and multiple native rows
When the section renders
Then the heading and rows share one quiet group shell, and sibling rows are
separated by hairlines rather than disconnected margins.

Given an MCP server or cron task inside a named Settings group
When it renders
Then it remains distinguishable as a managed object while sharing the parent
system's border, radius, spacing, and divider language.

Given the Settings search index harvests a detached renderer
When it builds the index
Then it still reads the same labels and descriptions without changing live DOM
handles or network behavior.
```

## Risks

> [!risk]
> Moving renderer-created nodes can invalidate DOM handles or a search harvest.
> Mitigation: group only direct finished children, preserve nodes rather than
> cloning them, keep the harvest path unchanged, and test the live renderer.

> [!risk]
> A group shell can become a nested-card wall.
> Mitigation: neutral surface, hairline only, no shadow, native rows inside, and
> object cards only where an entity has several related controls.

> [!risk]
> CSS changes may lose against Obsidian settings paint.
> Mitigation: use scoped selectors, inspect computed styles in the real-DOM
> witness, and retain visible focus states.

## Open Questions

- Does Delete in the Conversations panel use confirmation or Undo? — deferred;
  not part of this Settings-only plan.
- Are card weights in the chat transcript visually inconsistent? — deferred
  until a dense real-DOM transcript frame exists.
