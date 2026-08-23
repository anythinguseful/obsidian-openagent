---
title: "MCP catalog modal security refactor"
type: plan
status: draft
date: 2026-08-23
tags: [openagent, plan, mcp, security, settings, refactor]
---

# MCP catalog modal security refactor

## Summary

`McpCatalogModal` is intentionally excluded from ordinary Settings modal
extraction because it manages third-party installation, API-key fields,
reinstall state, installer failures, and refresh behavior. This plan defines
the security contract required before moving it from `settingsTab.ts`.

## Contract

The extracted modal may render catalog entries and collect user-entered values,
but it must not widen capability or persist credentials itself. It receives
explicit callbacks for install/reinstall and refresh. The owning Settings/plugin
layer remains responsible for validation, consent, persistence, and runtime
reconciliation.

## Characterization (2026-08-23)

The current modal is a direct owner of `OpenAgentPlugin` and therefore is not
yet ready for a mechanical move:

- Secret environment fields render as `type="password"` and set
  `autocomplete="off"`; existing values are read from the installed server
  configuration.
- Install collects an `envValues` object and calls
  `plugin.installMcpCatalogEntry(entry.name, envValues)` exactly once per click.
- A failed result or rejected promise re-enables the button and names the
  failure in a Notice; success renders a completion screen and calls the
  Settings refresh callback.
- List state distinguishes Install/Reinstall from an installed badge using the
  current `mcpServers` settings map.

These facts are source-level observations. The next work is a dedicated
real-DOM/security witness before a class move.

## Required witnesses

- Credentials are rendered only in password inputs where marked secret and are
  not emitted into notices, diagnostics, logs, or preview text.
- Cancel/back leaves plugin settings unchanged.
- Failed install leaves the button recoverable and does not claim success.
- Successful install refreshes catalog state exactly once.
- Reinstall preserves the same security gates as install.
- MCP consent remains required and MCP tools stay unavailable to delegation,
  cron/headless, Quick Ask, and mobile paths.
- AST extraction moves exactly one class and existing Settings real-DOM / MCP
  tests remain green.

## Phases

1. Characterize current catalog behavior and add/confirm witnesses.
2. Extract class with `inspect-ts-class.mjs` only after the witness is green.
3. Move static guards from old file location to modal ownership plus Settings
   wiring.
4. Run full verify and release as a new version.

## Risks

> [!risk]
> A UI-only refactor can accidentally expose or retain secret values. Mitigate
> with a dedicated DOM/log witness before extraction.

> [!risk]
> Installer failure can leave a stale enabled/installed visual state. Mitigate
> with failure and reinstall witnesses.

## Open Questions

- Should catalog install logic remain on `OpenAgentPlugin` or move behind a
  typed install callback interface? Answer after behavior characterization.
