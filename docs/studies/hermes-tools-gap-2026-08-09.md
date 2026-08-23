---
title: "Gap Tools: Hermes Agent (desktop) vs Open Agent"
type: study
status: done
date: 2026-08-09
tags: [openagent, hermes, tools, roadmap, study]
---

# Gap Tools: Hermes Agent (desktop) vs Open Agent

## Summary

This study began as the 2026-08-09 gap map between Hermes Agent/Desktop and
Open Agent. Its recommended roadmap is complete. The current v0.1.151 registry
contains **25 tools in 10 toggleable toolsets**; the original skills, web search,
session search, todo, delegation, vision, terminal/process, and MCP gaps were
closed through later releases.

The document is now a historical decision record, not a live backlog. New
parity work must start from current Hermes source and the actual registry rather
than reusing the original counts below.

Verified sources used by the study:

- [Built-in Tools Reference](https://hermes-agent.nousresearch.com/docs/reference/tools-reference);
- [Tools & Toolsets](https://hermes-agent.nousresearch.com/docs/user-guide/features/tools);
- [fathah/hermes-desktop](https://github.com/fathah/hermes-desktop);
- byte-level source notes recorded in the Working Agreement and feature plans.

## Original baseline

At the first audit, Open Agent had 16 tools and several Hermes capabilities were
missing or only partially represented. The useful candidates were prioritized
in this order:

1. `web_search`;
2. `session_search`;
3. full skill view/manage operations;
4. `todo`;
5. `delegate_task`;
6. terminal/process support only with explicit desktop consent.

Vision and MCP were subsequently approved through their own bounded security
and runtime designs.

## Completed roadmap

| Area | Result in Open Agent | Final scope |
| --- | --- | --- |
| Vault files | done | Read/write/edit/delete/rename, list/search, and active-note access under Workspace policy. |
| Web | done | `web_extract` plus pluggable `web_search`. |
| Memory | done | Save/update/search plus `session_search`; later expanded by the plugin-native Memory & Context engine. |
| Skills | done | Create/list/view/manage, including exact patch/update and supporting-file operations. |
| Automations | done | `cronjob` lifecycle, monitors, prompt scanning, and script/no-agent watchdog. |
| Clarification | done | Structured `clarify` questions in the owned interactive path. |
| Todo | done | Session task list with merge semantics, caps, and post-compression injection. |
| Delegation | done | Isolated `delegate_task` children, bounded parallel pool, final summaries only, fail-closed tool partition. |
| Vision | done | Vault/URL/data inputs, native pixels-in-tool-result path, optional auxiliary vision fallback. |
| Terminal/process | done | Desktop-only terminal and background process tools behind separate consent and approval boundaries. |
| MCP | done | Dynamic interactive-only tools over stdio and Streamable HTTP, consent-gated and excluded from child/headless/mobile paths. |

Detailed implementation contracts live in the corresponding plans and security
notes rather than being duplicated here.

## Current inventory — v0.1.151

| Toolset | Tools |
| --- | --- |
| `vault` | `read_note`, `write_note`, `edit_note`, `delete_note`, `rename_move_note`, `list_files`, `search_vault`, `get_active_note` |
| `web` | `web_extract`, `web_search` |
| `memory` | `save_memory`, `update_user_profile`, `search_memory`, `session_search` |
| `skills` | `create_skill`, `list_skills`, `view_skill`, `manage_skill` |
| `automations` | `cronjob` |
| `delegation` | `delegate_task` |
| `vision` | `vision_analyze` |
| `todo` | `todo` |
| `clarify` | `clarify` |
| `terminal` | `terminal`, `process` |

Total: **25 tools in 10 toolsets**. This exact public count is pinned by
`scripts/check-docs.mjs` against the README contract.

## Deliberate non-goals

Hermes includes broad desktop/gateway integrations that do not automatically
belong inside an Obsidian plugin:

- application-specific desktop UI control;
- Discord/Feishu/Yuanbao and other messaging gateways;
- Spotify and Home Assistant;
- multi-agent kanban dispatch;
- unrestricted computer-use/browser automation;
- image/video generation backends;
- a general execute-code sandbox.

These are not unfinished items from this roadmap. Each would require a new
owner decision, threat model, dependency/runtime study, and explicit user value.

## Outcome

All recommended yellow gaps from the original study are closed. The study is
`done`; the project should not continue implementing Hermes tools merely to
increase counts.
