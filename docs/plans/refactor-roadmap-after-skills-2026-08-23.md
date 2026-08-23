---
title: "Refactor roadmap after development-skills installation"
type: plan
status: active
date: 2026-08-23
tags: [openagent, plan, architecture, refactor, skills]
---

# Refactor roadmap after development-skills installation

## Summary

After the repository gained `AGENTS.md`, internal/vendor skill separation,
verified vendor snapshots, and `check:skills`, the owner asked to improve the
plugin using the new development workflow. This plan records the architecture
choices considered before refactoring, their trade-offs, and the approved
small-step order.

The goal is not to reduce line counts for their own sake. Each refactor must
create a clearer ownership boundary while preserving user-visible behavior and
existing proof.

## Decision framework

Every candidate was judged against four questions:

1. Is there a clear domain boundary?
2. Can the move preserve behavior through existing or small new witnesses?
3. Does it avoid agent-loop, persistence, and security-sensitive blast radius?
4. Will the extracted module become a reusable pattern rather than a file move?

## Original owner Q&A — first refactor choice

The owner selected **Architecture** as the improvement focus. The exact question
then presented was:

> **Refactor pertama mana yang ingin kita rencanakan lalu implementasikan dengan
> TDD dan real-DOM proof?**

| Option offered | Original explanation | Current status |
|---|---|---|
| **Pisahkan session panel dari ChatApp** | Paling kecil dan aman: daftar/pencarian/rename/load sesi menjadi surface terpisah; ChatApp tetap pemilik agent loop. | **DONE** |
| **Pisahkan section Settings** | Mulai dari satu section berisiko rendah, lalu buat pola renderer reusable untuk mengecilkan settingsTab tanpa mengubah UI. | Deferred |
| **Pisahkan composer controller** | Ekstrak input, queue, slash, attachment, history, dan keyboard dari ChatApp; nilai tinggi tetapi blast radius lebih besar. | Deferred |
| **Pecah smoke/harness test** | Kurangi hotspot test dahulu agar refactor plugin berikutnya lebih mudah dan diagnosis failure lebih jelas. | Deferred |

The owner then asked, **“mana yang anda sarankan kita kerjakan duluan?”**
The recommendation was **Pisahkan session panel dari ChatApp** because its
boundary was clearest, it left the agent loop and persistence in place, and the
existing real-DOM panel/search/rename lane could serve as proof. The owner
approved that recommendation, and it is now complete.

## Current refactor label

> [!todo] **CURRENTLY WORKING — Settings modal layer (Phase 2 next)**
> This was selected only **after** Session Panel completed. It is an
> implementation strategy under the earlier “Pisahkan section Settings” option,
> not one of the original four answers.
>
> **Phase 1 is done:** `JsonImportModal`, `ExportFileSuggestModal`,
> `FolderSuggestModal`, `SkillSuggestModal`, and `ConfirmResetModal` now live
> in `src/settings/modals/json-import.ts`. Every move used the tested
> TypeScript-AST class inspector and passed typecheck, build, smoke, and
> Settings real-DOM proof.
>
> Next approved phase: rich domain modals, beginning with Profile delete/export
> after a dedicated contract witness.

## Additional deferred candidate

| Candidate | Status | Why |
|---|---|---|
| MCP Catalog extraction | Deferred behind a security plan | It handles third-party installation, credentials, and installer feedback. |

## Approved sequence

### Stage 1 — Durable agent workflow

**Status: done**

- Root `AGENTS.md` routes all work to contracts and skills.
- Internal and vendor skills are separated under `skills/`.
- `check:skills` validates discovery, manifest, provenance, adapter, and
  handoff contracts.
- Relevant vendor skills are pinned and adapted for Arena without pretending
  `.arena/` is durable.

### Stage 2 — Session Panel extraction

**Status: done**

- `src/ui/components/session-panel.tsx` owns panel rendering and rename draft.
- `ChatApp` owns SessionStore, partition freshness, queue cleanup, and agent
  lifecycle.
- Existing panel/rename real-DOM proof remains the compatibility witness.
- Detail: [Session panel extraction](session-panel-extraction-2026-08-23.md).

### Stage 3 — Settings modal modularization

**Status: active**

- One class per stage, using brace-aware boundaries.
- Completed: `JsonImportModal`, `ExportFileSuggestModal`.
- Next: `FolderSuggestModal`, `SkillSuggestModal`, then `ConfirmResetModal`.
- Detail and TODO: [Settings tab modularization](settings-tab-modularization-2026-08-23.md).

### Stage 4 — Rich domain modals

**Status: deferred**

Move only after dedicated contract witnesses are portable:

- profile delete/export;
- snippet editor;
- Hub preview;
- Terminal/MCP consent;
- Blueprint catalog;
- Skills Guard findings.

### Stage 5 — Security-sensitive catalog UI

**Status: deferred**

`McpCatalogModal` receives its own plan. Its refactor must prove that
credentials, install state, failure notices, and third-party execution consent
remain unchanged.

### Stage 6 — Reassess large owners

**Status: deferred**

After the modal layer stabilizes, reassess whether `settingsTab.ts` needs
section renderers and whether `ChatApp` needs a composer controller. No broad
rewrite is authorized by this plan.

## Contract

- A refactor changes code ownership, not user behavior.
- `ChatApp` remains the owner of agent lifecycle until a separate approved
  composer plan exists.
- `OpenAgentSettingTab` remains the owner of settings data/persistence until a
  separate section-renderer plan exists.
- Existing smoke assertions are amended from old file-location pins to behavior
  plus new-module ownership; they are never simply removed.
- A stage that causes unexpected failures is restored before another stage
  begins.

## Verification

For every stage:

```text
typecheck → build → smoke → relevant real-DOM preview → docs/skills checks
```

Before a release, run the complete `npm run verify` and the release pipeline.

## Risks

> [!risk]
> Modal source is interleaved with class methods and historical helper code.
> Mitigation: extract one class via brace-aware boundaries; never use comments
> or a generic closing-brace text pattern as a boundary.

> [!risk]
> Test strings may describe old ownership. Mitigation: keep the behavior
> assertion, add the new module assertion, and retain Settings wiring proof.

## Open Questions

- When Stage 3 is complete, should remaining rich modals move individually or
  be grouped by domain? Decide from the test/callback dependency map, not line
  count alone.
