---
title: "Hermes Desktop architecture parity audit"
type: audit
status: done
date: 2026-08-25
tags: [openagent, audit, architecture, hermes, parity]
---

# Hermes Desktop architecture parity audit

## Question and outcome

**Question:** Does Open Agent's current architecture follow the useful Hermes
Desktop architecture principles, while remaining correct for an Obsidian plugin?

**Outcome:** **yes at the system boundary; partially at the interactive-chat
boundary.** Open Agent correctly adapts Hermes' three-authority model to the
Obsidian host: the plugin lifecycle owns host services, `AgentRunner` owns
shared domain orchestration and scoped capability construction, and `AgentLoop`
owns an individual model/tool execution. The major remaining architectural debt
is that `ChatApp` still owns a large amount of execution orchestration,
persistence, and lifecycle work in addition to presentation.

This is not a recommendation to imitate Hermes Desktop's Electron/gateway
process topology. That topology solves a different host problem. The parity
standard here is **authority, state scope, capability boundaries, and observable
execution behavior**, not matching file names or process count.

## Verified upstream baseline

Official raw source was read on 2026-08-25 from Hermes Agent commit
[`41447a6d7063b2772b0c2f26a5b22d9bd444fb43`](https://github.com/NousResearch/hermes-agent/tree/41447a6d7063b2772b0c2f26a5b22d9bd444fb43):

- [`apps/desktop/README.md`](https://raw.githubusercontent.com/NousResearch/hermes-agent/41447a6d7063b2772b0c2f26a5b22d9bd444fb43/apps/desktop/README.md)
  — Electron owns native capabilities, React owns experience, and the Hermes
  backend owns sessions/tools/model work.
- [`apps/desktop/AGENTS.md`](https://raw.githubusercontent.com/NousResearch/hermes-agent/41447a6d7063b2772b0c2f26a5b22d9bd444fb43/apps/desktop/AGENTS.md)
  — authority-based state placement, cached server truth, scoped persistence,
  explicit identity, and fail-closed capability seams.
- [`apps/desktop/DESIGN.md`](https://raw.githubusercontent.com/NousResearch/hermes-agent/41447a6d7063b2772b0c2f26a5b22d9bd444fb43/apps/desktop/DESIGN.md)
  — chat stays primary; one action has one home; tool activity stays contextual
  rather than navigating on its own.
- [`apps/desktop/src/app/settings/constants.ts`](https://raw.githubusercontent.com/NousResearch/hermes-agent/41447a6d7063b2772b0c2f26a5b22d9bd444fb43/apps/desktop/src/app/settings/constants.ts)
  — settings vocabulary and explicit state scope examples.

## Architecture mapping

| Hermes Desktop authority | Open Agent equivalent | Assessment |
| --- | --- | --- |
| Electron owns native machine capabilities and lifecycle | `src/main.ts` owns Obsidian lifecycle, host services, stores, desktop-only terminal attachment, notifications, views, and cron wiring | **Correct adaptation** |
| Backend owns sessions, tools, model calls, and streaming | `AgentRunner` + `AgentLoop` + stores under `src/agent/` | **Correct direction**; direct in-process implementation is appropriate for an Obsidian plugin |
| Renderer owns presentation and ephemeral interaction | `src/ui/ChatApp.tsx`, components, settings tab, Quick Ask | **Partially correct**; `ChatApp` still owns too much execution work |
| Backend truth is cached/reconciled in renderer | `SessionStore` snapshots, partition checks, policy snapshots, React state/ref guards | **Correct adaptation** |
| Native capability bridge is narrow and deliberate | terminal/MCP are injected into `AgentRunner`; terminal is desktop-only; MCP is interactive-only | **Correct and fail-closed** |

## Confirmed strengths

### A1 — Composition root is explicit

`src/main.ts` constructs durable stores (`MemoryStore`, `EngineMemoryStore`,
`SkillsStore`, `SessionStore`, `ProfileStore`) once after settings load, then
constructs one `AgentRunner`. It injects cron, session search, MCP, and only on
desktop, terminal capability. This matches Hermes' rule that native authority
is composed at one deliberate boundary rather than discovered ad hoc by UI
components.

### A2 — Execution modes have explicit capability partitions

`src/agent/delegate.ts` uses allowlists for child and headless contexts.
`DELEGATE_ALLOWED_TOOLS` and `HEADLESS_ALLOWED_TOOLS` make new capabilities
fail closed until reviewed. `AgentRunner.getToolsWithMcp()` deliberately adds
MCP only to the owned interactive chat path; child and headless loops use the
synchronous base tool path. Terminal follows the same owned-interactive rule.

This is directly aligned with Hermes' narrow-capability principle and is
stronger than a UI-only hiding rule.

### A3 — Workspace/profile/session scope is explicit

`WorkspacePolicy` is snapshotted before a run; `AgentRunner` pins scoped
memory, skills, and engine stores to that policy. `ProfileStore` partitions
memory, skills, and sessions by profile and, in Strict mode, workspace. Session
stores expose an immutable snapshot and partition key so a late async result
cannot write into a newly selected profile/workspace.

This follows Hermes' instruction that persisted state declares whether it is
global, profile, session, project, or window scoped. The intentional divergence
is documented: API keys are global in the Obsidian plugin while profile data is
isolated.

### A4 — One action has one domain home

Settings actions write through the plugin/store boundary. Tool execution enters
through `AgentLoop`; direct managed writes remain tool-owned. The recent
Conversations-panel work preserved this rule: the panel only owns local UI
state, while `ChatApp` remains the callback bridge to `SessionStore`.

### A5 — User context is guarded against stale async work

The interactive path captures a workspace policy and session-store snapshot,
then checks partition/session identity after awaits. This is the plugin
counterpart of Hermes' generation/request-token rules: an old run cannot publish
or persist into a newly selected context.

## Findings

### H1 — `ChatApp` crossed the renderer/domain boundary too often

**Status: Phase 1 resolved 2026-08-25; further extraction deferred.**

`ChatApp` previously imported and constructed `AgentLoop` directly. The completed
[Interactive chat controller — Phase 1](../plans/interactive-chat-controller-phase-1-2026-08-25.md)
introduces `AgentRunner.createInteractiveRun()`: the runner now owns interactive
tool discovery, scoped context, run-owned todo, terminal identity, MoA injection,
and loop construction. The UI receives only the prepared tools and a narrow
`run`/`steer` handle.

This removes the direct renderer-to-loop construction seam while preserving
React-owned event callbacks, presentation, session persistence, queue, and
prompt-side UI work. Browser lanes prove normal streaming, tool activity, and
mid-run steer still behave unchanged.

The remaining `ChatApp` size is not a reason for another broad refactor. A later
phase must first establish ownership contracts for durable session persistence,
queue/abort lifecycle, compression/title/memory/goals, and the event stream.
No such phase is authorized by this audit.

### H2 — Settings remains a secondary large owner, but its boundary is healthier

`src/settingsTab.ts` is 3,433 lines, down from the earlier monolith. Stateless
renderers moved into `src/settings/sections/`; the class still owns persistence,
navigation, search indexing, and stateful renderers. This matches the intended
boundary and is materially healthier than the interactive-chat situation.

Do not extract the remaining stateful sections until a separate state-passing
contract exists. The completed renderer-extraction plan remains the correct
precedent.

### H3 — The architecture audit needs a recurring source-backed cadence

The official Hermes Desktop source changes rapidly. A prior technical audit is
historical and cannot decide current parity. This audit establishes the current
baseline commit, but it is not a standing claim that all future Hermes behavior
is already matched.

Re-run a focused architecture parity audit when one of these changes:

- execution ownership or `AgentRunner` / `AgentLoop` boundaries;
- profile, workspace, or session identity/scope;
- a new execution mode (interactive, headless, child, Quick Ask);
- an injected native capability such as MCP or terminal.

## Deliberate divergences — correct for Obsidian

| Hermes Desktop shape | Open Agent choice | Why it is correct |
| --- | --- | --- |
| Electron + preload + gateway process | In-process Obsidian plugin services and runner | Obsidian is the host/native boundary; creating another desktop shell or gateway would duplicate authority. |
| Backend-owned cross-surface session truth | Plugin-private JSON `SessionStore` plus React cache | Open Agent has one plugin surface; durable store remains outside the React tree and session snapshots guard async races. |
| Projects own working directory | Workspace policy owns vault visibility and writes | A vault is not a filesystem project chooser; Whole/Preferred/Strict is the plugin's required security boundary. |
| Per-profile remote credentials | Global provider credentials; isolated profile data | Explicit documented product choice; secrets are host/plugin configuration, while profile state partitions memory/skills/sessions. |
| Full desktop pages, files, terminal panes | Obsidian views, vault leaves, and editor/Quick Ask integration | Host-native navigation and files are already provided by Obsidian. |

## Conclusion and recommended order

The architectural core is **correctly adapted**, not a partial clone of Hermes
Desktop. No broad rewrite is justified.

H1's first material follow-up is complete: interactive loop/context construction
now belongs to `AgentRunner`. Further controller extraction should be selected
only if the owner wants to invest in maintainability; it is not required to fix
current behavior.

Before any future feature work that touches execution state, use this order:

1. identify state authority and scope;
2. map the user-visible event seam;
3. write a dedicated plan and characterization witnesses;
4. move one controller boundary at a time;
5. compare source and real-DOM behavior before/after.
