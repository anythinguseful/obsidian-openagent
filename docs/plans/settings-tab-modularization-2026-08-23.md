---
title: "Settings tab modularization"
type: plan
status: active
date: 2026-08-23
tags: [openagent, plan, architecture, settings, refactor]
---

# Settings tab modularization

## Summary

`src/settingsTab.ts` is a large imperative owner for Settings navigation,
sections, forms, modal UI, and persistence callbacks. The goal is to reduce its
size through **small, behavior-preserving extraction seams**, not a rewrite.

The immediate pattern is simple: a modal owns rendering and temporary form
state; `OpenAgentSettingTab` remains responsible for settings data, validation,
persistence, and every business callback.

## Contract

- No Settings row order, copy, UI behavior, persistence format, or security
  consent behavior changes as part of this refactor.
- A moved modal receives dependencies through constructor arguments. It must not
  reach into global plugin state on its own.
- Every extraction preserves existing selectors and test-visible behavior.
- One class or one tightly coupled family is moved per stage.
- Each stage must pass typecheck, build, smoke, and the relevant real-DOM
  preview before another class is moved.

## Completed

| Stage | Status | Result |
|---|---|---|
| Session Panel extraction | done | `SessionPanel` left `ChatApp`; panel-local rename state is separate from SessionStore/agent lifecycle. See [Session panel extraction](session-panel-extraction-2026-08-23.md). |

## Settings status

> [!warning]
> Settings modal extraction is **not yet landed**. A series of experimental
> moves was reverted after an unsafe class-boundary extraction targeted the
> wrong modal. `settingsTab.ts` is restored to the verified v0.1.149 baseline.
>
> The plan remains active, but no `src/settings/modals/` implementation is
> currently present.

## TODO — ordered by safety

### Phase 1 — simple picker/confirmation UI

**Status: done**

1. `JsonImportModal` ✅
2. `ExportFileSuggestModal` ✅
3. `FolderSuggestModal` ✅
4. `SkillSuggestModal` ✅
5. `ConfirmResetModal` ✅

All five now live in `src/settings/modals/json-import.ts`. Each was extracted
with `scripts/inspect-ts-class.mjs`, which obtains its class range from the
TypeScript AST. Typecheck, build, smoke, and Settings real-DOM preview passed
after the final move.

### Phase 2 — focused Settings domain modal

**Status: done**

4. `ConfirmProfileDeleteModal` ✅
5. `ProfileExportModal` ✅
6. `SnippetEditModal` ✅

Profile and snippet ownership now lives in `src/settings/modals/profile.ts` and
`src/settings/modals/snippet.ts`; their richer form-state/static guards were
moved to module ownership while Settings wiring remains asserted.

### Phase 3 — capability/automation surfaces

**Status: done**

7. `HubSkillPreviewModal` ✅
8. `TerminalConsentModal` + `McpConsentModal` ✅
9. `BlueprintCatalogModal` ✅
10. `GuardFindingsModal` ✅

These now live in dedicated modal modules. Settings real-DOM preview, smoke,
docs, and skills checks passed after the final move.

### Phase 4 — defer until a dedicated security plan

11. `McpCatalogModal`

It handles third-party installation, credentials, and installer feedback. It
must not move until a dedicated contract/test matrix exists.

## Extraction protocol

1. Read the target class and every call site.
2. Create or amend the behavior witness before moving code.
3. Extract using a **brace-aware class boundary**, never a comment/text anchor.
4. Update imports and move only the target class.
5. Amend static guards so they verify ownership in the new module and wiring in
   `settingsTab.ts`.
6. Run: typecheck → build → smoke → relevant real-DOM preview.
7. If a stage fails outside the expected guard amendment, restore that class
   alone before continuing.

## Risks

> [!risk]
> Static test pins can describe an old file location instead of a behavior.
> Mitigation: split assertions into modal contract and Settings wiring; never
> delete an assertion merely to make the move pass.

> [!risk]
> Text-anchor extraction can consume a class boundary or neighboring helper.
> Mitigation: count braces from the class declaration and move one class only.

> [!risk]
> MCP catalog has security-sensitive installer and credential state.
> Mitigation: explicitly defer it to a dedicated plan.

## Open Questions

- After Phase 3, decide whether remaining Settings sections should be rendered
  through extracted section modules or whether modal extraction has provided
  enough maintainability gain.
