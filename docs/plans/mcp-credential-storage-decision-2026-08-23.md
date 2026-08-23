---
title: "MCP credential storage decision"
type: plan
status: active
date: 2026-08-23
tags: [openagent, plan, mcp, security, credentials]
---

# MCP credential storage decision

## Summary

Before extracting `McpCatalogModal`, decide where catalog credentials live.
Hermes stores prompted MCP authentication values in `~/.hermes/.env`, separate
from server transport configuration in `config.yaml`. Open Agent currently
collects `envValues` in the catalog modal and passes them to plugin install
logic; that path must be classified before UI refactor work continues.

## Verified Hermes reference

Source reviewed:

- `optional-mcps/n8n/manifest.yaml`
- `hermes_cli/mcp_catalog.py`

The shipped n8n manifest marks `N8N_API_KEY` as `secret: true`. Hermes states
that prompted auth values, including non-secret auth env values, are saved to
`~/.hermes/.env`; transport/configuration remains in `config.yaml`.

## Options

| Option | Storage | Benefit | Risk |
|---|---|---|---|
| A — retain current shape | plugin settings/data | Smallest migration | Secret can remain coupled to export/import/diagnostics paths and diverges from Hermes. |
| B — dedicated vault-local secret store | plugin-private local file/ledger outside settings export | Separates credentials from server config; can be redacted and excluded by construction | Requires migration, lifecycle, reset, and testing work. |

## Recommended decision

Choose **Option B**. Store credentials outside exportable settings and expose
only secret variable names/availability to UI and diagnostics. Server config
continues to store transport details and non-sensitive fields.

## Owner decision

**2026-08-23 — Option B approved:** MCP secrets use a dedicated plugin-private
secret store. Transport configuration and non-secret values remain inspectable
in server config. This decision is binding for migration, UI, export/import,
diagnostics, reset behavior, and MCP Catalog refactor work.

## Contract if Option B is approved

- Catalog secret fields never enter `OpenAgentSettings`, export JSON, profile
  export, diagnostics, notices, logs, or model-visible tool output.
- Secret values are persisted in a local plugin-private store keyed by server
  name and variable name.
- Catalog install reads the secret store only at runtime/install boundary.
- Reinstall may preserve a stored secret unless the user explicitly replaces
  it; blank secret input never overwrites a stored value.
- Reset settings does not silently destroy credentials; Reset everything can
  remove them only with explicit warning/confirmation.
- Import does not create credentials.
- Diagnostics report only server name and whether a required secret is present.

## Migration

1. Detect existing sensitive catalog env values in legacy MCP server config.
2. Move them once into the secret store.
3. Remove sensitive keys from config before next save.
4. If migration write fails, retain existing config and surface an actionable
   error; never discard a credential silently.

## Required witnesses

- n8n API key is a password field and is absent from DOM text/Notice output.
- Export/import/profile bundle/diagnostics contain no secret value.
- Legacy config migrates once and leaves only non-secret config behind.
- Failure preserves existing secret and re-enables install UI.
- Reinstall, reset settings, and reset everything follow the lifecycle contract.
- MCP remains unavailable to delegation, cron/headless, Quick Ask, and mobile.

## Implementation status

**Done**

1. Owner approved Option B.
2. `src/agent/mcp/secrets.ts` provides split, private-store, legacy migration,
   import stripping, and clear lifecycle helpers.
3. Catalog install saves secret env values to
   `.obsidian/plugins/openagent/mcp-secrets.json`; only non-secret values enter
   `mcpServers` config.
4. Runtime resolves secrets per server and merges them only at stdio spawn;
   config keys contain secret names, never values.
5. Legacy settings migrate on load; settings import strips catalog secret env;
   Reset Everything clears the secret store while Reset settings preserves it.
6. Pure, runtime-boundary, migration, export-redaction, reset, and smoke tests
   are part of `npm test`.

**Pending**

7. Add n8n real-DOM catalog witness (fixture currently fails to render the
   API-key field despite source catalog data being complete).
8. Complete MCP Catalog AST extraction only after the real-DOM witness passes.

## Open Questions

- Should non-secret auth values such as `N8N_BASE_URL` remain in server config
  or join the secret store exactly like Hermes? Recommended: keep non-secret
  values in server config for inspectability, while secret values use the
  dedicated store.
