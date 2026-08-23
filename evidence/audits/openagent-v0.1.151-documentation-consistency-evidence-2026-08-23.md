# Open Agent v0.1.151 — documentation consistency evidence

Audit date: 2026-08-23 (Asia/Jakarta)
Audited branch: `arena/01a02f3f-obsidian-openagent`
Audited commit: `e4c9a7fca275ac7d8b4d21579adb92f73c77b48b`

## Repository state

```text
git status --short --branch
## arena/01a02f3f-obsidian-openagent

git rev-list --left-right --count origin/main...HEAD
0  0

gh pr list --state all
[]

package.json version: 0.1.151
manifest.json version: 0.1.151
```

The checkout is a grafted upload snapshot with one visible commit, so this audit uses the current source tree, tracked test witnesses, and `RELEASES.md` rather than reconstructing unavailable intermediate commits.

## Source ownership versus plan claims

Current modal modules:

```text
143 src/settings/modals/blueprint-catalog.ts
 79 src/settings/modals/consent.ts
 61 src/settings/modals/guard-findings.ts
 81 src/settings/modals/hub.ts
164 src/settings/modals/json-import.ts
127 src/settings/modals/mcp-catalog.ts
101 src/settings/modals/profile.ts
113 src/settings/modals/snippet.ts
```

Current MCP Catalog ownership:

```text
src/settings/modals/mcp-catalog.ts: export class McpCatalogModal
src/settingsTab.ts: imports McpCatalogModal
src/settingsTab.ts: constructs McpCatalogModal from the Capabilities section
```

Tracked witness result from `test/real-preview/settings-audit-probes.json`:

```json
{
  "F48mcpCatalogShape": {
    "fixed": true,
    "envNames": "N8N_BASE_URL,N8N_API_KEY",
    "inputs": [
      { "type": "text", "autocomplete": "", "placeholder": "n8n instance URL" },
      { "type": "password", "autocomplete": "off", "placeholder": "n8n API key (generate under Settings → API)" }
    ],
    "failed": { "calls": 1, "disabled": false, "leaked": false },
    "successCalls": 2
  }
}
```

Static and unit witnesses also exist in:

```text
test/smoke.test.cjs
  - reads src/settings/modals/mcp-catalog.ts
  - pins password-only secret fields
  - pins recoverable failure, refresh-on-success, and reinstall state

test/mcp-secrets.test.cjs
  - private store path and round-trip/clear behavior

test/mcp-secret-migration.test.cjs
  - legacy migration and export exclusion

test/settings.test.cjs
  - MCP secret-shaped env redaction
```

Release record:

```text
RELEASES.md: Open Agent v0.1.151 — MCP credential isolation & catalog hardening
- n8n catalog real-DOM witness covers password field, failure recovery,
  success completion, and no DOM secret leak.
- MCP Catalog modal is extracted into its own security-sensitive module.
```

Contradictory documentation claims still present:

```text
docs/plans/settings-tab-modularization-2026-08-23.md
- status: active
- says Settings modal extraction is not yet landed
- says src/settings/modals/ is not present
- later says Phases 1–3 are done
- leaves Phase 4 MCP Catalog deferred

docs/plans/mcp-catalog-modal-security-plan-2026-08-23.md
- status: draft
- describes extraction and real-DOM witness as future work

docs/plans/mcp-credential-storage-decision-2026-08-23.md
- status: active
- Implementation status says the real-DOM witness and AST extraction are pending

docs/plans/refactor-roadmap-after-skills-2026-08-23.md
- current label says Phase 2 is next
- Stage 3 still lists Phase 1 classes as next
- Stage 5 still marks MCP Catalog work deferred
```

## Hub inventory and status

Filesystem versus `docs/README.md`:

```text
plans:    17 material files, 16 listed
  unlisted: docs/plans/session-panel-extraction-2026-08-23.md

studies:  14 files, 13 listed
  unlisted: docs/studies/memory-context-engine-research-2026-08-21.md

audits:   13 files before this audit, 12 listed
  unlisted: docs/audits/settings-descriptions-audit-2026-08-22.md

reference: 3 files, 3 listed
```

Known hub status mismatch before this audit:

```text
docs/README.md shows MCP credential storage decision as draft
docs/plans/mcp-credential-storage-decision-2026-08-23.md frontmatter says active
```

## Frontmatter and status vocabulary

All 52 pre-audit files under `docs/` contain the five contract keys:

```text
title, type, status, date, tags
```

The hub documents only four statuses:

```text
active, done, draft, archived
```

One file uses an undeclared value:

```text
docs/audits/settings-descriptions-audit-2026-08-22.md
status: applied
```

The current `scripts/check-docs.mjs` checks only `title`, `type`, and `status` key presence. It does not enforce `date`, `tags`, allowed status values, hub coverage/status parity, or relative-link validity.

## Working Agreement structure

Parsed lesson headings:

```text
heading count: 178
number range: 1–177
missing numbers: none
duplicate: 149 appears twice
```

The second half is not in numeric order: after Lesson 122 the file jumps to 153, 158, 160, 161, 171, 172, 177, then descends through older entries. This does not remove content, but it makes the “Lessons log (1–177)” harder to audit and is compatible with the exact duplicate heading going unnoticed.

## Paths and links

Confirmed machine-specific paths in curated docs:

```text
docs/audits/mermaid-pipeline-audit-2026-08-14.md
- /home/user/releases/v0.1.143/...
- /home/user/uploads/...

docs/audits/workspace-path-security-audit-2026-08-14.md
- /home/user/releases/v0.1.144/...
```

These conflict with the repository rule that curated docs use relative project links rather than machine-specific workspace paths.

A simple Markdown-link scan reported three apparent broken links, but all three are examples/placeholders inside prose or code:

```text
[name](subfolder/note.md)
[x](subfolder/note.md)
[arsip](<link>)
```

No confirmed broken project-relative document link was found after classifying those examples. Code-formatted Obsidian wikilink syntax such as `@[[note]]` is product documentation, not a docs-navigation violation.

## Release proof

`RELEASES.md`, `docs/working-agreement.md`, and `skills/internal/openagent-docs/SKILL.md` all state that detailed release proof lives under `releases/vN/`. The current tracked tree contains no `releases/` files or directories, including no v0.1.151 final report.

This audit cannot determine from the grafted snapshot whether the reports were intentionally omitted during upload or never written. The present repository nevertheless promises a path that readers cannot open.

## Existing gate result

```text
npm run check:docs
24 source/docs checks, 0 failure(s)
All source/docs checks passed.
```

The green result proves the checks currently implemented. It does not cover the semantic/status/hub/release-proof findings above.
