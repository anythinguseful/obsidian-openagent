---
title: "How Open Agent documentation works"
type: reference
status: active
date: 2026-09-11
tags: [openagent, documentation, process]
---

# How Open Agent documentation works

This is the **method**, not a feature encyclopedia.

Binding decisions (do not reverse): one `docs/` vault (Lesson 118); no
`docs/` vs `designdocs/` split; no root `ARCHITECTURE.md`; no giant manuals
that rot (Lessons 88 / 224).

**Language (Lesson 118):** hub pages, frontmatter, and **new** notes are
**English**. Chat with the owner may be Indonesian. Older notes (especially
the working agreement) stay as written.

## Audiences — split in the hub, not in extra folders

| Who | Read first | Skip |
| --- | --- | --- |
| Vault user | [README](../../README.md) install + first run; [troubleshooting](troubleshooting.md) | Working agreement, Lessons, smoke tests |
| Maintainer / coding agent | [docs/README.md](../README.md); [working-agreement](../working-agreement.md); [architecture](architecture.md) | Putting `src/` paths on user pages |
| PR contributor | [CONTRIBUTING.md](../../CONTRIBUTING.md); [SECURITY.md](../../SECURITY.md) | Treating `RELEASES.md` as ZIP proof |

Architecture is a **maintainer** map (Hermes puts it in developer-guide). Users
may open it; the hub lists it under Changing the plugin.

## Diátaxis — thin on purpose

| Kind | Where | Status |
| --- | --- | --- |
| Tutorial | README First run | Exists; do not duplicate as a 20-page Getting Started |
| How-to / FAQ | [troubleshooting.md](troubleshooting.md) | Living; only symptoms that actually happened |
| Reference | `docs/reference/*` | Exists |
| Explanation / decisions | `plans/` `studies/` `audits/` | Exists |
| Agent process | working-agreement + `AGENTS.md` | Exists; **not** a user guide |
| User changelog | [RELEASES.md](../../RELEASES.md) | Exists |
| Release proof | GitHub Release assets | Exists |

We **do not** chase: a full USER_GUIDE, HTTP API docs, a separate ADR tree
(plans are ADRs), a wiki.

## Content rules

1. User-visible behavior changed → update the matching **user-facing** note in
   the same commit (working-agreement § documentation rules).
2. User pages: behavior and concepts. **No** `src/…` paths except the README
   Feature map (contributor table).
3. Architecture may name paths — it is maintainer reference.
4. New plans start from `_TEMPLATE.md`. Frontmatter status stays honest.
5. Material new notes get a row in `docs/README.md`.
6. `npm run check:docs` before claiming docs are done.

## Gaps vs “standard app docs” — decisions

| Common gap | Our decision |
| --- | --- |
| Separate user guide | No. README + troubleshooting + in-app Settings |
| FAQ | Yes, one troubleshooting file, grown from real reports |
| Architecture | Yes, `reference/architecture.md` — not root `ARCHITECTURE.md` |
| `docs/` vs `designdocs/` | No (Lesson 120) |
| Issue templates | Already `.github/ISSUE_TEMPLATE/` |
| DOCS_GUIDE | Already in the working agreement; this file is the short map |

If unsure which file: [docs/README.md](../README.md), two “start” tables.
