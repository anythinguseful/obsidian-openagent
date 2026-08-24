---
title: "Open Agent — Documentation"
type: index
status: active
date: 2026-08-11
tags: [openagent, documentation, index]
---

# Open Agent — Documentation

Project documentation for the **Open Agent** Obsidian plugin — architecture
studies, parity notes, audits, feature plans, and the process memory behind
them. These notes are written to be read both **on GitHub** and **inside
Obsidian** as a vault (all internal links are relative markdown links, which
resolve in both).

- Back to the repository readme: [README](../README.md)
- Raw audit logs, matrices, checksums, and release proof live in the project [evidence](../evidence/README.md) folder; this docs vault keeps the curated narrative.

---

## Where to start

| Document | What it is |
| --- | --- |
| [Working Agreement](working-agreement.md) | Binding process memory: owner's standing instructions, enforcement mechanisms, documentation rules, GitHub handoff bootstrap, and the Lessons log (1–179). **Read this first in any new session.** |
| [Backlog](backlog.md) | Deferred ideas with explicit reasons, unlock conditions, and cheap alternatives. |
| [Hermes tools gap](studies/hermes-tools-gap-2026-08-09.md) | Live map of Hermes Agent tools vs Open Agent, with the recommended roadmap. |
| [Reference sources](reference/reference-sources.md) | One-stop registry of verified official upstream sources allowed for parity work. |

---

## Reading the status field

Every note carries a `status` in its frontmatter:

| Status | Meaning |
| --- | --- |
| `active` | Living document, updated as the project evolves. |
| `done` | The planned/studied work shipped; kept as a record. |
| `draft` | Plan under discussion, not yet implemented. |
| `archived` | Superseded; kept for history only. |

`type` classifies the note: `plan` · `study` · `audit` · `reference` · `process` · `backlog` · `index`.

---

## Plans (`plans/`)

Feature plans and port designs, with their implementation status.

| Document | Status | Summary |
| --- | --- | --- |
| [Attach menu plan](plans/attach-menu-plan.md) | done | Attach menu `[+]`, `@` inline references, vision. |
| [Automations & cron plan](plans/automations-cron-plan.md) | done | Cron scheduler v2, `cronjob` tool, task UI. |
| [Capabilities settings plan](plans/capabilities-settings-plan.md) | done | Tools / Skills / MCP settings modelled after Hermes Desktop. |
| [Data & portability plan](plans/data-portability-plan.md) | done | Data layout and portability (Tier 1). |
| [Delegation plan](plans/hermes-delegation-plan-2026-08-09.md) | done | `delegate_task` — isolated subagents (bounded port, v0.1.135). |
| [Markdown rendering plan](plans/markdown-rendering-plan.md) | done | Markdown formatting in chat (streaming, code blocks, typography). |
| [Profiles plan](plans/profiles-plan.md) | done | Agent profiles inside one vault, modelled after Hermes. |
| [Providers & model plan](plans/providers-models-plan.md) | done | Providers and Model settings modelled after Hermes Desktop. |
| [Web search plan](plans/web-search-plan.md) | done | `web_search` (Hermes parity): pluggable backend (ddgs/brave/tavily/searxng), title/url/description results. |
| [MCP runtime plan](plans/mcp-runtime-plan.md) | done | MCP runtime client (stdio + Streamable HTTP): consent-gated, `mcp__<server>__<tool>` tools, lazy spawn, interactive-path-only, plus a curated install catalog. |
| [Blueprint catalog plan](plans/blueprint-catalog-plan.md) | done | Curated cron blueprints with typed slots (schedule + prompt pre-filled). |
| [Appearance settings plan](plans/appearance-settings-plan.md) | done | Settings → Appearance: tool cards, reasoning, session density, intro, reactions (self-owned chat surface, Obsidian's theme untouched). |
| [Session panel extraction](plans/session-panel-extraction-2026-08-23.md) | done | Conversations rendering and rename draft extracted while ChatApp retains persistence and agent lifecycle. |
| [Settings tab modularization](plans/settings-tab-modularization-2026-08-23.md) | done | All Settings modal phases, including the security-sensitive MCP Catalog, are extracted and verified. |
| [Refactor roadmap after skills](plans/refactor-roadmap-after-skills-2026-08-23.md) | active | Stages 1–5 and both scoped Stage 6 targets are complete; no future architecture target is selected. |
| [MCP catalog modal security refactor](plans/mcp-catalog-modal-security-plan-2026-08-23.md) | done | Password rendering, failure recovery, secret boundaries, and the extracted installer modal shipped in v0.1.151. |
| [MCP credential storage decision](plans/mcp-credential-storage-decision-2026-08-23.md) | done | Option B private secret storage, migration, export stripping, reset, and runtime boundaries shipped in v0.1.151. |
| [GitHub Release retention and publication](plans/github-release-retention-2026-08-23.md) | done | Durable assets live in the [reconstructed, reverified v0.1.151 GitHub Release](https://github.com/anythinguseful/obsidian-openagent/releases/tag/v0.1.151). |
| [Smoke/harness split](plans/smoke-harness-split-2026-08-24.md) | done | Stage 6 target, completed 2026-08-24: `test/smoke.test.cjs` split from 7,012 to 1,296 lines across eleven phases into a shared harness plus seven domain guard modules, with all 289 `✓` preserved at every step. |
| [Settings section renderers](plans/settings-section-renderers-2026-08-24.md) | done | Stage 6 target #2 completed: twelve self-contained renderer members moved into `src/settings/sections/`, while the class retains data, persistence, navigation, search indexing, and stateful renderers. |

## Studies (`studies/`)

Upstream research and parity notes — always verified against raw sources.

| Document | Status | Summary |
| --- | --- | --- |
| [Browse Hub study](studies/browse-hub.md) | done | Hermes Desktop Browse Hub: connected hubs, chips, status. |
| [Copilot study notes](studies/copilot-study-notes.md) | done | Obsidian Copilot → Open Agent port notes. |
| [Copilot docs organization](studies/copilot-docs-organization-2026-08-18.md) | done | How obsidian-copilot organizes docs (user vs agent, DOCS_GUIDE, routing, plans, changelog). |
| [Design skills notes](studies/design-skills-notes.md) | done | AI LABS design-skills video review (2026-07-22). |
| [Empty-state parity](studies/empty-state-parity-2026-08-01.md) | done | Hermes Desktop Intro empty state (v0.1.35). |
| [Clarify tool study](studies/hermes-clarify-tool.md) | done | Hermes `clarify` tool, verified from source. |
| [Slash parity](studies/hermes-slash-parity-2026-07-31.md) | done | Composer slash commands vs Hermes Desktop. |
| [Tools gap](studies/hermes-tools-gap-2026-08-09.md) | done | Historical Hermes tool-gap roadmap; all recommended gaps closed and the current inventory is 25 tools in 10 toolsets. |
| [Memory & Context engine research](studies/memory-context-engine-research-2026-08-21.md) | done | Hindsight-style plugin-native memory design; retain, recall, reflect, mental models, and optional embeddings shipped in three phases. |
| [Model menu parity](studies/model-menu-parity-2026-08-01.md) | done | Composer model menu (v0.1.32). |
| [Model settings parity](studies/model-settings-parity-2026-07-30.md) | done | Model settings page vs Hermes Desktop. |
| [Prompt-kit audit](studies/promptkit-audit.md) | done | prompt-kit components audit against the upstream clone. |
| [Skill research UI/UX](studies/skill-research-uiux.md) | done | UI/UX design-skill research for the agent (2026-08-06). |
| [lobe-ui component gap](studies/lobe-ui-gap-2026-08-20.md) | done | Which lobe-ui components are worth porting for the UI tidy-up (EditableText, Empty, TokenTag, SortableList, …). |

## Audits (`audits/`)

Audits of the plugin itself (our own surface, not upstream).

| Document | Status | Summary |
| --- | --- | --- |
| [Plugin audit 2026-08-09](audits/audit-2026-08-09.md) | done | Full plugin audit after v0.1.127. |
| [Error & bug sweep 2026-08-24](audits/error-bug-sweep-2026-08-24.md) | done | Repo-wide sweep closed after all documented dimensions were verified and its recorded findings received regression guards. |
| [Documentation consistency audit 2026-08-23](audits/documentation-consistency-audit-2026-08-23.md) | done | v0.1.151 source/test/release truth versus stale plan status, hub coverage, and release-proof contracts. |
| [Plugin technical audit 2026-08-11](audits/plugin-audit-2026-08-11.md) | done | Historical v0.1.135 technical audit; its hardening findings informed later work. |
| [Mermaid inline-percent audit 2026-08-13](audits/mermaid-inline-percent-audit-2026-08-13.md) | done | Root cause and regression scope for invalid trailing Mermaid comments. |
| [Mermaid pipeline audit 2026-08-14](audits/mermaid-pipeline-audit-2026-08-14.md) | done | Historical read-only audit of Mermaid rendering, retry, and vault-write paths. |
| [Workspace path-security audit 2026-08-14](audits/workspace-path-security-audit-2026-08-14.md) | done | Historical basis for Workspace Modes; current semantics live in Workspace path security. |
| [Security hardening — Paket B](audits/security-hardening-paket-b-2026-08-11.md) | done | Balanced model-network, provenance, vision, steering, and remote-media boundaries, including honest `requestUrl` residuals. |
| [Security hardening — Paket C](audits/security-hardening-paket-c-2026-08-13.md) | done | Fail-closed PDF worker lifecycle, hard caps/deadline, CVE fixture, and 49-check browser regression. |
| [Obsidian API audit](audits/obsidian-api-audit-2026-07-31.md) | done | API compatibility against Obsidian 1.13.4. |
| [Settings tab audit](audits/settings-audit-2026-07-22.md) | done | Settings tab audit (v0.1.2 baseline). |
| [Settings copy review](audits/settings-copy-review-2026-07-25.md) | done | UI copy review — fully approved, shipped as v0.1.11. |
| [Settings descriptions audit 2026-08-22](audits/settings-descriptions-audit-2026-08-22.md) | done | Full Settings copy inventory; approved A–E changes and anti-regression voice/length guards shipped. |
| [UI audit](audits/ui-audit.md) | done | UI audit using the vendored web-design-guidelines skill. |
| [UI contract audit 2026-08-20](audits/ui-contract-audit-2026-08-20.md) | done | Bug-bounty pass of the openagent-ui contract: 14 rules verified, 3 warns, 1 contract clarification (var() fallback scoping). |

## Reference (`reference/`)

| Document | Status | Summary |
| --- | --- | --- |
| [Reference sources](reference/reference-sources.md) | active | Verified official upstream registry (prompt-kit, lobe-ui, shadcn, Hermes, Obsidian app.css, lucide). |
| [Workspace path security](reference/workspace-security.md) | active | Whole/Preferred/Strict semantics, migration, read ceiling, covered surfaces, and the logical-vs-physical containment boundary. |
| [Cron expressions](reference/cron-expressions.md) | active | How the 5-field automation schedule works: fields, operators, copy-paste examples, and where the UI hides it behind human choices. |

## Archive (`arsip/`)

| Document | Status | Summary |
| --- | --- | --- |
| [Quote bar diagnosis — round 2](arsip/diagnostik-quote.md) | archived | Superseded diagnosis notes for the quote bar. |

---

## Opening this documentation in Obsidian

The `docs/` folder is an Obsidian-friendly vault:

1. Obsidian → **Open another vault** → **Open folder as vault** → select this
   `docs/` folder (or the repository root — the root `README.md` links here).
2. Read through `README.md` (this hub) in Reading view; internal links are
   relative markdown links, so they resolve both here and on GitHub.
3. The frontmatter (`title`, `type`, `status`, `date`, `tags`) shows up in
   Obsidian's Properties panel and enables dataview-style queries.

## Document conventions

- **Frontmatter** is mandatory on every note (`title`, `type`, `status`,
  `date`, `tags`) — enforced by `scripts/check-docs.mjs` (bootstrap check).
- **Links** are relative markdown links (`[name](subfolder/note.md)`) — they
  work on GitHub and in Obsidian alike; avoid `[[wikilinks]]` here so the
  GitHub view stays clickable.
- **Folders** by type: `plans/` · `studies/` · `audits/` · `reference/` ·
  `arsip/`. Root files are living documents (`working-agreement.md`,
  `backlog.md`) or this hub.
- **Status** must be updated honestly when a plan ships or is superseded.
- **New plans** start from [`plans/_TEMPLATE.md`](plans/_TEMPLATE.md)
  (Summary → Contract → Decisions → Impact → Phases → GWT → Risks → Open
  Questions).
- **Release changelog** for users lives in [`RELEASES.md`](../RELEASES.md) at
  the repository root; verified ZIPs, checksums, source manifest, and final
  reports are retained as immutable GitHub Release assets. Local `release/` is
  disposable staging and is never a documentation dependency.
