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

Stages 1–5 are complete in v0.1.151. The roadmap is now paused at Stage 6:
reassess the remaining large owners before authorizing another refactor.

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
| **Pisahkan section Settings** | Mulai dari satu section berisiko rendah, lalu buat pola renderer reusable untuk mengecilkan settingsTab tanpa mengubah UI. | awaiting a new decision/plan |
| **Pisahkan composer controller** | Ekstrak input, queue, slash, attachment, history, dan keyboard dari ChatApp; nilai tinggi tetapi blast radius lebih besar. | deferred |
| **Pecah smoke/harness test** | Kurangi hotspot test dahulu agar refactor plugin berikutnya lebih mudah dan diagnosis failure lebih jelas. | deferred |

The owner asked, **“mana yang anda sarankan kita kerjakan duluan?”** The
recommendation was Session Panel because its boundary was clearest, it left the
agent loop and persistence in place, and existing panel/search/rename lanes
already provided proof. The owner approved it, and it shipped.

## Current work label

> [!todo] **CURRENTLY WORKING — roadmap reassessment**
>
> Session Panel, Settings modal Phases 1–3, MCP credential isolation, and the
> security-sensitive MCP Catalog extraction are complete. No further product
> refactor is implicitly authorized. The next owner decision is whether to:
> extract Settings section renderers, split the smoke/harness hotspot first,
> extract a composer controller, or prioritize a feature/bug instead.

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

**Status: active; no implementation selected**

Current hotspots at v0.1.151:

- `src/ui/ChatApp.tsx`: approximately 5.3k lines;
- `src/settingsTab.ts`: approximately 4.9k lines;
- `test/smoke.test.cjs`: approximately 7.0k lines.

Candidate order remains a product/architecture decision. A new refactor must
receive its own plan and behavior witnesses; this roadmap does not authorize a
broad rewrite.

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

- Which Stage 6 candidate should receive the next dedicated plan? Waiting for
  owner selection after documentation reconciliation.
