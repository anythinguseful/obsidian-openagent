---
title: "MCP catalog modal security refactor"
type: plan
status: done
date: 2026-08-23
tags: [openagent, plan, mcp, security, settings, refactor]
---

# MCP catalog modal security refactor

## Summary

`McpCatalogModal` was excluded from the ordinary Settings extraction because it
manages third-party installation, API-key fields, reinstall state, installer
failures, and refresh behavior. The extraction shipped in v0.1.151 only after
credential storage was separated from exportable settings and the dedicated
browser/security witnesses passed.

The class now lives in `src/settings/modals/mcp-catalog.ts` and is opened by the
Capabilities section in `src/settingsTab.ts`.

## Final contract

- Secret catalog values never enter exported settings, profile exports,
  diagnostics, notices, logs, or model-visible tool output.
- Secret fields render as password inputs with autocomplete disabled.
- The modal collects temporary form values but delegates installation and
  persistence to `OpenAgentPlugin.installMcpCatalogEntry`.
- The plugin boundary separates secret and non-secret values, writes secrets to
  the plugin-private store, and keeps transport configuration inspectable.
- Failed installs restore the button and report a non-secret error.
- Successful installs render completion once and refresh Settings once.
- Install and reinstall use the same consent and secret boundaries.
- MCP tools remain limited to the owned interactive desktop chat path; they are
  unavailable to delegation, cron/headless, Quick Ask, and mobile.

The final implementation retains `OpenAgentPlugin` as the modal facade rather
than introducing a second narrow callback interface. This is deliberate for the
completed mechanical extraction: security ownership remains in existing plugin
methods, while the modal does not write the secret store directly. Narrowing the
facade later would be a separate refactor, not unfinished v0.1.151 work.

## Decisions

- D1: Use the dedicated plugin-private secret store approved in
  [MCP credential storage decision](mcp-credential-storage-decision-2026-08-23.md).
- D2: Characterize password rendering, failure recovery, success refresh, and
  reinstall state before moving the class.
- D3: Extract exactly one class through `scripts/inspect-ts-class.mjs` and keep
  the Settings call site intact.
- D4: Preserve the plugin install method as the security/persistence choke
  point; do not move credential persistence into the modal.

## Implementation result

1. `src/agent/mcp/secrets.ts` owns secret splitting, private persistence,
   migration, import stripping, runtime resolution, and clear lifecycle.
2. `src/settings/modals/mcp-catalog.ts` owns catalog list/form/done rendering.
3. `src/settingsTab.ts` imports and opens the extracted class.
4. `test/mcp-secrets.test.cjs` and `test/mcp-secret-migration.test.cjs` cover
   private storage and legacy migration.
5. Settings/export tests cover secret exclusion.
6. Static smoke guards pin password-only secret fields, recoverable failure,
   refresh-on-success, and reinstall state.
7. Settings real-DOM F48 proves declared n8n fields, password/autocomplete-off,
   failure recovery, no body-text secret leak, and successful completion.

## GWT

```text
Given the n8n catalog entry declares N8N_API_KEY as secret
When its install form opens
Then that value is collected in a password input with autocomplete off and is
absent from visible modal text.

Given installation fails
When the promise resolves or rejects
Then Install becomes usable again, no success state appears, and no credential
is included in the notice.

Given installation succeeds
When the plugin boundary returns success
Then the modal shows Installed, refreshes Settings once, and stores the secret
outside exportable server configuration.

Given the class is extracted
When source ownership is inspected
Then mcp-catalog.ts owns the modal and settingsTab.ts retains only import,
construction, and the refresh callback.
```

## Verification

- Tracked real-DOM result: `F48mcpCatalogShape.fixed === true`.
- Static catalog security and ownership guards pass in `test/smoke.test.cjs`.
- Secret-store, migration, settings/export, and runtime-boundary tests are part
  of `npm test`.
- v0.1.151 release notes record the completed extraction and hardening.

## Risks and outcome

> [!risk]
> A UI refactor could expose or retain secret values. Outcome: secret storage is
> separate by construction and browser proof checks the rendered boundary.

> [!risk]
> Installer failure could leave a stale disabled or successful state. Outcome:
> F48 performs a failed attempt before success and verifies recovery.

## Open Questions

- None for this plan. A narrower modal dependency interface may be considered
  only as a future architecture refactor with no security or behavior change.
