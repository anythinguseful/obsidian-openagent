---
title: "Settings tab modularization"
type: plan
status: done
date: 2026-08-23
tags: [openagent, plan, architecture, settings, refactor]
---

# Settings tab modularization

## Summary

`src/settingsTab.ts` originally owned Settings navigation, sections, forms,
modal UI, and persistence callbacks in one file. This refactor extracted the
modal layer through small, behavior-preserving seams rather than rewriting the
Settings surface.

The modal program is complete in v0.1.151. Eight modules under
`src/settings/modals/` now own temporary modal state and rendering;
`OpenAgentSettingTab` still owns section navigation and settings wiring, while
plugin/domain callbacks remain responsible for persistence and security.

## Contract

- No Settings row order, copy, UI behavior, persistence format, or consent
  behavior changes as part of the extraction.
- A modal owns rendering and temporary form state, not unrelated Settings
  sections.
- Existing selectors and test-visible behavior remain stable.
- Static guards verify ownership in the extracted module and wiring at the
  call site; old assertions are amended, not deleted merely to pass.
- Security-sensitive work receives dedicated migration and real-DOM witnesses
  before it is declared complete.

## Decisions

- D1: Extract one class or tightly coupled family at a time. Source: approved
  refactor roadmap and the project regression discipline.
- D2: Use `scripts/inspect-ts-class.mjs` for TypeScript-AST class boundaries;
  never use a comment or generic closing brace as an extraction anchor.
- D3: Keep section renderers in `OpenAgentSettingTab` during this plan. Moving
  Settings sections requires a separate owner-approved plan.
- D4: Defer `McpCatalogModal` until its credential lifecycle and browser
  witness were explicit. That gate was completed in v0.1.151; see
  [MCP credential storage decision](mcp-credential-storage-decision-2026-08-23.md)
  and [MCP Catalog security refactor](mcp-catalog-modal-security-plan-2026-08-23.md).

## Implementation result

| Phase | Status | Module(s) | Result |
| --- | --- | --- | --- |
| 1 — simple picker/confirmation UI | done | `json-import.ts` | `JsonImportModal`, `ExportFileSuggestModal`, `FolderSuggestModal`, `SkillSuggestModal`, and `ConfirmResetModal`. |
| 2 — focused domain modals | done | `profile.ts`, `snippet.ts` | Profile delete/export and snippet editing moved with their form-state guards. |
| 3 — capability/automation surfaces | done | `hub.ts`, `consent.ts`, `blueprint-catalog.ts`, `guard-findings.ts` | Hub preview, Terminal/MCP consent, blueprint catalog, and Skills Guard findings moved without behavior changes. |
| 4 — security-sensitive catalog | done | `mcp-catalog.ts` | MCP Catalog moved after private secret storage, migration/redaction tests, and real-DOM F48 passed. |

Current modal modules:

```text
src/settings/modals/blueprint-catalog.ts
src/settings/modals/consent.ts
src/settings/modals/guard-findings.ts
src/settings/modals/hub.ts
src/settings/modals/json-import.ts
src/settings/modals/mcp-catalog.ts
src/settings/modals/profile.ts
src/settings/modals/snippet.ts
```

## Extraction protocol used

1. Read the target class and all call sites.
2. Add or confirm the relevant behavior witness.
3. Inspect the class range through the TypeScript AST.
4. Move only the target class or approved family.
5. Amend static guards to check new ownership plus old wiring.
6. Run typecheck, build, smoke, and Settings real-DOM proof.
7. Restore the isolated move if a failure is not an expected ownership-pin
   amendment.

An early text-boundary experiment targeted the wrong class and was reverted
before the safe AST protocol was adopted. No reverted implementation remains in
the current source.

## GWT

```text
Given a Settings modal is opened from its existing row
When the extraction is complete
Then the same modal content, actions, persistence callback, and close behavior remain.

Given an installer credential is marked secret
When MCP Catalog renders and runs install or reinstall
Then the value appears only in a password input, never in DOM text or notices,
and persistence crosses the plugin-owned secret boundary.

Given the Settings source is inspected
When modal ownership is enumerated
Then each extracted class lives under src/settings/modals/ and settingsTab keeps
only its import, construction, and owning section callbacks.
```

## Verification

- v0.1.150 completed Phases 1–3 with typecheck, build, smoke, Settings real-DOM,
  docs, and skills checks.
- v0.1.151 completed Phase 4 with secret-store/migration/export tests, MCP
  runtime boundary checks, static catalog guards, and real-DOM F48.
- `RELEASES.md` records both release outcomes.

## Risks and outcome

> [!risk]
> Static tests can pin an old file location instead of behavior. Outcome: guards
> now split module ownership from Settings call-site wiring.

> [!risk]
> Credential handling can be exposed by a UI-only move. Outcome: secret values
> live outside exportable settings and the MCP browser witness checks password
> rendering, failure recovery, success, and no DOM leak.

## Follow-up

This plan does **not** authorize extracting Settings section renderers. The
remaining `settingsTab.ts` size is a separate architecture decision. The active
[refactor roadmap](refactor-roadmap-after-skills-2026-08-23.md) now pauses at
reassessment rather than silently starting another refactor.
