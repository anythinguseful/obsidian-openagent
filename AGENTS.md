# Open Agent — Agent Bootstrap

This is the entry point for any coding agent working on this repository,
including Arena Agent. Read it before inspecting or changing code.

## Start every session

1. Read [`docs/working-agreement.md`](docs/working-agreement.md). It contains
   owner decisions, the Lessons log, security/process rules, and documentation
   requirements.
2. Read [`agents/skills/README.md`](agents/skills/README.md), then load every skill required
   by the routing table below before acting.
3. Inspect the current workspace. Do not assume generated files, dependencies,
   Git metadata, or a prior session's local state exists.
4. Before code changes, restore dependencies when needed with `npm ci` and run
   the baseline appropriate to the task. Before declaring completion, run the
   required gate in `CONTRIBUTING.md`.

## Skill routing

| When working on… | Load before acting |
| --- | --- |
| Any UI, CSS, visual state, or interface copy | `agents/skills/internal/openagent-ui/SKILL.md` **first**; then `frontend-design`, `functional-ui`, and `web-design-guidelines` as applicable |
| Visual direction, typography, or layout | `agents/skills/vendor/anthropics/frontend-design/SKILL.md` |
| Chat, Settings, dashboard, or other functional surface | `agents/skills/internal/functional-ui/SKILL.md` |
| UI accessibility or UX review | `agents/skills/vendor/vercel/web-design-guidelines/SKILL.md` |
| User-facing behavior or documentation | `agents/skills/internal/openagent-docs/SKILL.md`; `docs/working-agreement.md`; `docs/README.md` |
| Create/evaluate a skill or agent workflow | `agents/skills/vendor/anthropics/skill-creator/SKILL.md`; `agents/skills/manifest.yaml` |
| Write a substantial plan, spec, or decision document | `agents/skills/vendor/anthropics/doc-coauthoring/SKILL.md`; `docs/plans/_TEMPLATE.md` |
| Security, Workspace policy, Terminal, MCP, or network boundaries | `docs/working-agreement.md`; relevant note under `docs/audits/` or `docs/reference/` |
| Release or packaging | `agents/arena/workflows/release.md`; `CONTRIBUTING.md`; `scripts/release.mjs` |
| Audit or evidence organization | `agents/arena/workflows/audit.md`; `agents/arena/workflows/docs.md` |
| Continue work in a later Arena session | `agents/skills/vendor/mattpocock/handoff/SKILL.md`; `agents/arena/workflows/handoff.md` |
| Diagnose a bug, failure, or performance regression | `agents/skills/vendor/mattpocock/diagnosing-bugs/SKILL.md`; relevant project audit/test |
| Build a fix test-first | `agents/skills/vendor/mattpocock/tdd/SKILL.md`; `CONTRIBUTING.md` |

`openagent-ui` is the binding UI contract and wins if it conflicts with a
more generic design skill.

Do not vendor a new development skill until it fits this Obsidian plugin
on Arena (see `docs/working-agreement.md` — Vendor skill intake + Lesson 220).
Unfit skills are reported, not installed.

## Repository conventions

- `docs/` holds curated project documentation; `evidence/` holds raw logs,
  matrices, checksums, and other supporting proof.
- Use relative Markdown links in docs, never machine-specific workspace paths.
- Do not create `.arena/`: Arena excludes that directory from workspace
  snapshots, so it cannot be a durable project contract.
- Do not commit generated `main.js`, `vendor/`, `release/`, preview output,
  browser downloads, dependency caches, or release ZIPs. See `CONTRIBUTING.md`.
- A repaired bug needs a regression guard and a Lessons-log entry when it
  establishes a reusable project rule.

## Arena-specific workflow notes

[`agents/arena/README.md`](agents/arena/README.md) explains the durable Arena
workflow. Those files are project conventions, not an Arena auto-load format:
this `AGENTS.md` is the discovery point.
