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
verified vendor snapshots, and `check:skills`, the owner approved a sequence of
small architecture improvements. The goal is not line-count reduction for its
own sake: each step must create a clear ownership boundary while preserving
user-visible behavior and existing proof.

Stages 1–5 are complete in v0.1.151. Both scoped Stage 6 targets are now
**done**: the smoke/harness split and the Settings section-renderer extraction
completed on 2026-08-24. The roadmap remains active as a decision record; a
future Stage 6 target needs its own plan and owner approval before any
implementation.

## Decision framework

Every candidate is judged against four questions:

1. Is there a clear domain boundary?
2. Can the move preserve behavior through existing or small new witnesses?
3. Does it avoid agent-loop, persistence, and security-sensitive blast radius?
4. Will the extracted module become a reusable pattern rather than a file move?

## Original owner Q&A — first refactor choice

The owner selected **Architecture** as the improvement focus. The exact question
presented was:

> **Refactor pertama mana yang ingin kita rencanakan lalu implementasikan dengan
> TDD dan real-DOM proof?**

| Option offered | Original explanation | Current status |
| --- | --- | --- |
| **Pisahkan session panel dari ChatApp** | Paling kecil dan aman: daftar/pencarian/rename/load sesi menjadi surface terpisah; ChatApp tetap pemilik agent loop. | **done** |
| **Pisahkan section Settings** | Mulai dari satu section berisiko rendah, lalu buat pola renderer reusable untuk mengecilkan settingsTab tanpa mengubah UI. | **done** — selected 2026-08-24 and completed in batch scope; plan: [Settings section renderers](settings-section-renderers-2026-08-24.md) |
| **Pisahkan composer controller** | Ekstrak input, queue, slash, attachment, history, dan keyboard dari ChatApp; nilai tinggi tetapi blast radius lebih besar. | deferred |
| **Pecah smoke/harness test** | Kurangi hotspot test dahulu agar refactor plugin berikutnya lebih mudah dan diagnosis failure lebih jelas. | **selected 2026-08-24** — plan: [Smoke/harness split](smoke-harness-split-2026-08-24.md) |

The owner asked, **“mana yang anda sarankan kita kerjakan duluan?”** The
recommendation was Session Panel because its boundary was clearest, it left the
agent loop and persistence in place, and existing panel/search/rename lanes
already provided proof. The owner approved it, and it shipped.

## Current work label

> [!todo] **CURRENT PRIORITY — choose a future Stage 6 target**
>
> Session Panel, Settings modal Phases 1–3, MCP credential isolation, the
> security-sensitive MCP Catalog extraction, release retention, the
> smoke/harness split, the Settings section-renderer extraction, and the
> [error & bug sweep](../audits/error-bug-sweep-2026-08-24.md) are complete and
> verified in `main`. The closed audit defines no implied follow-up work.
>
> The **smoke/harness split** completed on 2026-08-24: `test/smoke.test.cjs`
> went from 7,012 to 1,296 lines across eleven phases. See
> [Smoke/harness split](smoke-harness-split-2026-08-24.md).
>
> The **Settings section-renderer extraction** also completed on 2026-08-24 in
> its approved batch scope. The ten extracted renderer modules now own the
> twelve self-contained members under `src/settings/sections/`; the current
> `src/settingsTab.ts` is 3,409 lines. The class retains settings data,
> persistence, navigation, search indexing, and stateful renderers. See
> [Settings section renderers](settings-section-renderers-2026-08-24.md).
>
> The original selection rationale remains useful: `renderSectionBody()` offered
> a ready ownership seam, while `ChatApp()` has no comparable seam. The
> [Hermes Desktop architecture parity audit](../audits/hermes-desktop-architecture-parity-2026-08-25.md)
> confirms that a broad rewrite is not justified; its only candidate is a
> separate interactive-run controller study. That study is not selected or
> authorized. No future product refactor is implicitly authorized.

## Completed sequence

### Stage 1 — durable agent workflow

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

**Status: done**

- Simple picker/confirmation modals moved to `json-import.ts`.
- Profile and snippet modals moved to their domain modules.
- Hub, consent, blueprint, and guard-finding modals moved to capability modules.
- Detail: [Settings tab modularization](settings-tab-modularization-2026-08-23.md).

### Stage 4 — rich domain modal verification

**Status: done**

Dedicated witnesses preserve:

- profile delete/export;
- snippet editor state;
- Hub preview and Skills Guard confirmation;
- Terminal/MCP consent;
- Blueprint Catalog form behavior.

These shipped with the v0.1.150 Settings modularization release.

### Stage 5 — security-sensitive MCP Catalog

**Status: done**

- Option B private credential storage was approved and implemented.
- Legacy n8n values migrate out of exportable server config.
- Import/export/reset/runtime boundaries are covered by tests.
- Real-DOM F48 proves password rendering, recoverable failure, no DOM secret
  leak, and success.
- `McpCatalogModal` now lives in `src/settings/modals/mcp-catalog.ts`.
- Detail: [MCP credential storage decision](mcp-credential-storage-decision-2026-08-23.md)
  and [MCP Catalog security refactor](mcp-catalog-modal-security-plan-2026-08-23.md).

### Stage 6 — reassess large owners

**Status: active roadmap; two scoped targets completed 2026-08-24**

The first Stage 6 target was the smoke/harness split because it was an enabler:
the old harness pinned both remaining candidates as raw text. Its plan,
[Smoke/harness split](smoke-harness-split-2026-08-24.md), is **done**:
`test/smoke.test.cjs` went from 7,012 to 1,296 lines, while every baseline
witness was retained.

The second target, **Settings section renderers**, was selected in batch scope
and is also **done**. The plan
[Settings section renderers](settings-section-renderers-2026-08-24.md) moved
the twelve self-contained renderer members into ten modules under
`src/settings/sections/`. `src/settingsTab.ts` is now 3,409 lines; it retains
settings data, persistence, navigation, search indexing, and the renderers that
own class state.

The original pin-count correction remains part of the decision record: the
measured figures were **77** pins for `src/settingsTab.ts` and **78** for
`src/ui/ChatApp.tsx`, not 46 and 30. The smoke split concentrated the settings
pins and made the subsequent extraction reviewable.

`src/ui/ChatApp.tsx` and its composer controller remain deferred. A future
refactor must receive its own owner-approved plan and behavior witnesses; this
roadmap does not authorize a broad rewrite.

## Contract

- A refactor changes code ownership, not user behavior.
- `ChatApp` remains the owner of agent lifecycle until a separate approved
  composer plan exists.
- `OpenAgentSettingTab` remains the owner of settings data/persistence until a
  separate section-renderer plan exists.
- Existing smoke assertions are amended from old location pins to behavior plus
  new-module ownership; they are never simply removed.
- A stage that causes unexpected failures is restored before another begins.
- Completed work is marked `done` before another session chooses the next stage.

## Verification

For every stage:

```text
typecheck → build → smoke → relevant real-DOM preview → docs/skills checks
```

Before a release, run the complete `npm run verify` and release pipeline.

## Risks

> [!risk]
> Large source and harness files invite broad rewrites. Mitigation: approve one
> ownership seam at a time and retain the old owner for lifecycle/persistence.

> [!risk]
> Test strings may describe old ownership. Mitigation: keep the behavior
> assertion, add the new module assertion, and retain call-site wiring proof.

> [!risk]
> A roadmap can itself become stale after work ships. Mitigation: the
> documentation consistency audit now records v0.1.151 as the source baseline;
> future completion must update this current-work label in the same change.

## Open Questions

- Which Stage 6 architecture candidate should receive the next dedicated plan?
  The smoke/harness split and [Settings section renderers](settings-section-renderers-2026-08-24.md)
  are both `done`. No third target is selected.
- Should `src/ui/ChatApp.tsx` be split at all, and along which seam? — open.
  It still needs a state-ownership answer before a file layout; no refactor work
  is authorized until that answer is captured in its own plan.
