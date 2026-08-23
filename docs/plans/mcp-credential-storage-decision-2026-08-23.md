---
title: "MCP credential storage decision"
type: plan
status: done
date: 2026-08-23
tags: [openagent, plan, mcp, security, credentials]
---

# MCP credential storage decision

## Summary

Before extracting `McpCatalogModal`, the project decided where catalog
credentials live. Hermes separates prompted MCP authentication values from
transport configuration. Open Agent adopted the same boundary in v0.1.151:
secret catalog values use a plugin-private local store, while non-secret
transport configuration remains inspectable in settings.

This decision and its implementation are complete.

## Verified Hermes reference

Source reviewed:

- `optional-mcps/n8n/manifest.yaml`;
- `hermes_cli/mcp_catalog.py`.

The shipped n8n manifest marks `N8N_API_KEY` as `secret: true`. Hermes stores
prompted authentication values in `~/.hermes/.env`, separate from server
transport configuration in `config.yaml`.

## Options considered

| Option | Storage | Benefit | Risk |
| --- | --- | --- | --- |
| A — retain the old shape | plugin settings/data | Smallest migration | Secrets remain coupled to export/import/diagnostic paths and diverge from Hermes. |
| **B — dedicated plugin-private secret store** | local file outside exportable settings | Separates credentials from server config by construction | Requires migration, lifecycle, and boundary tests. |

## Owner decision

**2026-08-23 — Option B approved and implemented.** MCP secrets use a dedicated
plugin-private secret store. Transport configuration and non-secret values
remain inspectable in server config. This decision is binding for migration,
UI, export/import, diagnostics, reset behavior, runtime spawn, and MCP Catalog.

## Final contract

- Catalog secret fields never enter `OpenAgentSettings`, export JSON, profile
  export, diagnostics, notices, logs, or model-visible tool output.
- Values are stored in a plugin-private local store keyed by server and variable
  name.
- Catalog install and runtime resolve the store only at their owned boundaries.
- A blank or failed reinstall never overwrites the stored value. Required
  secret fields must be re-entered for a successful reinstall; that successful
  submission replaces the stored value.
- Reset settings preserves credentials. Reset Everything removes them only
  through its explicit destructive confirmation.
- Import does not create credentials and strips catalog secret-shaped values.
- Diagnostics expose no value; only non-secret server metadata may be shown.
- Runtime merges secrets only when spawning the configured stdio server and
  excludes secret values from cache keys.

## Migration result

1. Existing catalog secret values in legacy MCP config are detected.
2. They are copied to the private store.
3. Sensitive keys are removed from exportable config before the next save.
4. Migration failure does not silently discard the legacy value.
5. Subsequent loads do not remigrate already-clean configuration.

Implementation lives in `src/agent/mcp/secrets.ts`; plugin load, install,
runtime, import, reset, and diagnostics call its boundary helpers.

## Witness matrix

| Witness | Status | Location/result |
| --- | --- | --- |
| Private store round-trip and clear | done | `test/mcp-secrets.test.cjs` |
| Legacy one-time migration | done | `test/mcp-secret-migration.test.cjs` |
| Export/import/profile redaction | done | settings and migration tests |
| Runtime merge only at spawn | done | MCP/runtime boundary tests |
| Reset settings preserves; Reset Everything clears | done | reset lifecycle tests |
| Password field and no DOM text leak | done | Settings real-DOM F48 |
| Failure restores install button | done | Settings real-DOM F48 |
| Success completion and refresh | done | Settings real-DOM F48 |
| MCP excluded from delegated/headless/Quick Ask/mobile paths | done | existing MCP capability partition guards |

## GWT

```text
Given legacy n8n configuration contains an API key
When settings load successfully
Then the key moves to the private store and exportable configuration no longer
contains its value.

Given a stored key already exists
When reinstall submits a blank required password field
Then installation is refused and the existing private value remains unchanged.

Given settings are exported or diagnostics are copied
When their output is inspected
Then no MCP secret value or secret-bearing environment entry is present.

Given Reset settings is confirmed
When defaults are restored
Then MCP secrets remain; only Reset Everything removes the private store.
```

## Outcome

The storage decision unblocked the completed
[MCP Catalog modal security refactor](mcp-catalog-modal-security-plan-2026-08-23.md).
No credential migration or catalog storage work remains pending in v0.1.151.
