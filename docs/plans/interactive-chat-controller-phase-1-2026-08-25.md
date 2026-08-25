---
title: "Interactive chat controller — Phase 1"
type: plan
status: done
date: 2026-08-25
tags: [openagent, plan, architecture, chat, hermes]
---

# Interactive chat controller — Phase 1

## Summary

The Hermes Desktop architecture audit found one material debt: `ChatApp` creates
`AgentLoop` directly and constructs the execution context, even though the
runner is already the application domain boundary for headless and delegated
runs.

Phase 1 is deliberately narrow. It moves only the creation of an owned
interactive run into `AgentRunner`. `ChatApp` still owns React state,
presentation, prompt-side UI work, session persistence, queue, and approval/
clarify rendering. The outcome is a typed interactive-run handle that exposes
prepared tools, `run(messages, events)`, and `steer(text)` — enough to stop the
UI from constructing `AgentLoop` or `ToolContext` directly.

## Contract

Before:

```text
ChatApp → getToolsWithMcp + makeContext + new AgentLoop → loop.run
```

After:

```text
ChatApp → AgentRunner.createInteractiveRun → { tools, run, steer }
                                          → AgentLoop + scoped ToolContext
```

- `AgentRunner` owns interactive tool discovery, terminal execution identity,
  scoped context, run-owned todo API, MoA injection, and `AgentLoop` creation.
- `ChatApp` receives tools only to assemble the system prompt, forwards events
  to the handle, and retains the handle only for `/steer` and cancellation UI.
- No change to interactive-only MCP/terminal admission, workspace snapshot,
  tool result behavior, session persistence, or event ordering.

## Decisions

| Pick | Reason | Tradeoff |
| --- | --- | --- |
| Small factory, not a full controller | Preserves existing behavior while creating the first clean seam. | Does not yet move queue/persistence/compression out of ChatApp. |
| Typed handle, not raw `AgentLoop` | UI needs only `tools`, `run`, and `steer`; it must not reach loop internals. | Future loop controls need an explicit handle API. |
| Runner owns scoped context | Same authority as headless/delegated construction; avoids a second interactive construction pattern. | Runner API grows by one deliberate method. |
| Preserve UI-owned event callbacks | Approval/clarify are rendered in React and remain the UI boundary. | Event adapter remains in ChatApp for this phase. |

## Impact

- `src/agent/runner.ts` — interactive-run handle type and factory.
- `src/ui/ChatApp.tsx` — replace direct tool/context/loop construction with the
  factory handle and narrow the ref type to `steer`.
- `test/agent-loop.test.cjs` — unit seam: factory returns interactive-only
  tools, run-owned context, and forwards the run/event contract.
- `test/real-preview/chat-entry.tsx`, `test/real-preview/build.mjs`, and smoke
  guard — live chat still streams, handles tools, and accepts steer through the
  new handle.

## Test seams

The approved seams are:

1. **Runner factory:** `createInteractiveRun()` exposes only tools, `run`, and
   `steer`; interactive terminal/MCP tools are admitted exactly as before.
2. **Tool context:** the factory uses the supplied immutable workspace policy,
   terminal identity, run todo, and MoA engine.
3. **Chat integration:** a real preview run still emits tool activity and a
   steer request reaches the active run handle.

## Phases

### Phase 1 — runner handle

Add the factory and a focused unit test that exercises interactive-only
capability admission and delegation of `run`/`steer`.

### Phase 2 — ChatApp handoff

Replace the direct `new AgentLoop` path, narrow `loopRef`, amend smoke wiring,
and run the existing tool/steer browser lanes.

## Implementation status (2026-08-25)

Both phases are complete.

- `AgentRunner.createInteractiveRun()` now owns interactive tool discovery,
  scoped context construction, run-owned todo injection, terminal identity,
  MoA injection, and `AgentLoop` construction.
- The returned `InteractiveRunHandle` exposes only `tools`, `run`, and `steer`.
  `ChatApp` no longer imports or constructs `AgentLoop`, and its ref is narrowed
  to the `steer` capability it actually needs.
- The real preview harness mirrors the new runner contract rather than hiding
  it with a soft mock. `convo`, `steer`, and `toolstate` pass in HeadlessChrome
  149; this proves normal streaming, the mid-run steer channel, and tool-state
  rendering remain intact.
- `npm run verify` passes with the Arena Chromium bootstrap.

## GWT

```text
Given an owned interactive chat run with terminal/MCP capability available
When ChatApp starts the run
Then AgentRunner creates the loop with that scoped context and exposes the
same prepared tools to system-prompt assembly.

Given a live interactive run
When the user sends /steer
Then the handle forwards it to the active loop and the tool-result behavior
remains unchanged.

Given a headless or delegated run
When it starts
Then it does not use the interactive factory and retains its fail-closed tool
allowlist.
```

## Risks

> [!risk]
> A wrapper can become a cosmetic indirection while ChatApp still owns loop
> construction. Mitigation: remove the `new AgentLoop` expression and direct
> `makeContext`/`getToolsWithMcp` calls from ChatApp in this phase.

> [!risk]
> Tool discovery may move after system-prompt assembly and change the schemas
> advertised to the provider. Mitigation: handle exposes the prepared tool list
> before the prompt is assembled; browser wire lanes remain the witness.

> [!risk]
> A new generic factory could accidentally grant interactive MCP/terminal tools
> to headless/child contexts. Mitigation: make it an explicitly named
> `createInteractiveRun`, and retain the existing sync headless/delegate paths.

## Open Questions

- Should compression/title/memory/persistence move behind the controller later?
  — deferred until this handle proves stable.
- Should queue draining move with that later controller? — deferred.
