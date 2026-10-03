---
title: "DeepSeek Harness architecture vs Hermes / Open Agent"
type: study
status: done
date: 2026-09-06
tags: [openagent, study, deepseek, hermes, harness]
---

# DeepSeek Harness architecture vs Hermes / Open Agent

Verified 2026-09-06 against:

- [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) `docs/architecture.md` (master)
- Cherry Studio `src/main/services/deepSeekHarness/` — **spawns the `dsh` CLI**, does not embed Cordis
- This repo: `src/agent/agentLoop.ts`, `tools.ts`, `sessions.ts`

## What DeepSeek Harness actually is

**Everything is a plugin** on [Cordis](https://github.com/cordiverse/cordis). There is no privileged kernel: model adapter, tool registry, session log, **and the agent loop** are replaceable plugins.

A running instance is a **profile** stacking **bundles** + `cordis.patch.yml`. Core `ctx` keys:

| Package | Owns |
| --- | --- |
| `core/session` | Append-only `SessionEvent` log |
| `core/system-prompt` | Prompt sections + tool schemas |
| `core/tools` | Scoped registry + guarded execute pipeline |
| `core/agent` | Live `Agent` + `agent/*` events |
| `core/agent-loop` | Default driver (swappable) |
| `llm/llm` | Stream vocabulary + adapters |

### Turn vs step

- **Step** = one model request + the tools it called.
- **Turn** = zero or more steps until nothing is owed.

Waterfalls (`next()` required): `agent/pre-step`, `agent/request`, `llm/stream`, `tools/pre-execute`, `tools/execute`, `tools/post-execute`. Serial: `agent/turn-stopping`.

**Model-visible means logged.** Wire history is *projected* from the event log (`deriveMessages()`), not a parallel `messages[]` that can drift from UI.

### Cherry Studio

Cherry does **not** reimplement this. `DeepSeekHarnessService` writes config and **child-processes** `dsh web`. Unusable as a pattern inside an Obsidian plugin (Node CLI, home dir, extra HTTP UI).

## What Hermes / Open Agent already is

Hermes loop (ported in `AgentLoop.run`): chat → tool calls → execute → repeat until no tools or `maxIterations`.

Already Hermes-complete in this plugin (not in DeepSeek preview):

- Toolsets + operation-aware approval (`prepare` / `revalidate`)
- Skills (`SKILL.md` learning loop + hub)
- Memory + USER.md + session_search
- Todo, clarify, vision, `delegate_task`
- MoA, steer, failover, compression, goals
- Cron, MCP, terminal, workspace policy
- Profiles as *identity + settings*, not plugin trees

Gaps vs DeepSeek (runtime shape, not features):

| DeepSeek | Open Agent today |
| --- | --- |
| Append-only session events | JSON snapshot: `turns` + optional `messages` |
| Loop is a plugin | One `AgentLoop` class |
| Tool waterfall hooks | Inline `executeTool` in the loop |
| `agent.inject()` inbox | `/steer` piggyback on last tool result |
| Per-agent scoped `ctx` | Shared `ToolContext` + settings toolset flags |
| Failed attempts as `assistant/attempt` | Discard callbacks, not durable log |

## Decision for this project

**Do not vendor Cordis or spawn `dsh`.** Obsidian plugin budget, no Node kernel, vault FS.

**Do adopt DeepSeek’s *seams* as a thin in-process kernel**, and keep Hermes capabilities as the default plugins/toolsets.

See [hybrid plan](../plans/deepseek-hermes-hybrid-harness-2026-09-06.md).
