# Open Agent — Development Skills

Tracked development skills for agents maintaining this repository. They use the
[Agent Skills](https://agentskills.io) `SKILL.md` format.

**Start through [`../AGENTS.md`](../AGENTS.md).** Arena does not auto-install
this directory. `AGENTS.md` is the durable discovery and routing entry point.

## Precedence

1. Owner decisions in `docs/working-agreement.md`.
2. Internal project skills under `internal/`.
3. Official vendor skills under `vendor/`.

A vendor skill may improve a process, but it cannot override the Open Agent UI
contract, security boundaries, documentation conventions, or release process.

## Internal skills

| Skill | Required when | Role |
|---|---|---|
| [`openagent-ui`](internal/openagent-ui/SKILL.md) | Any plugin UI, CSS, visual state, or interface copy | Binding project contract |
| [`functional-ui`](internal/functional-ui/SKILL.md) | Chat, Settings, dashboards, statuses, and functional surfaces | In-house product-surface guidance |
| [`openagent-docs`](internal/openagent-docs/SKILL.md) | Plans, audits, docs routing, evidence, release notes, and refactor status | Binding project documentation contract |

## Official vendor skills

| Skill | Source | Use when |
|---|---|---|
| [`frontend-design`](vendor/anthropics/frontend-design/SKILL.md) | Anthropic | Visual direction, typography, layout choices |
| [`webapp-testing`](vendor/anthropics/webapp-testing/SKILL.md) | Anthropic | Testing a standalone local web application with Playwright; project tests remain governed by `CONTRIBUTING.md` |
| [`skill-creator`](vendor/anthropics/skill-creator/SKILL.md) | Anthropic | Creating, evaluating, or improving internal skills and agent workflows |
| [`doc-coauthoring`](vendor/anthropics/doc-coauthoring/SKILL.md) | Anthropic | Substantial docs, technical specs, proposals, or decision documents; project docs conventions still win |
| [`handoff`](vendor/mattpocock/handoff/SKILL.md) | Matt Pocock | Compact a session for the next agent; use the persistent Arena adapter |
| [`tdd`](vendor/mattpocock/tdd/SKILL.md) | Matt Pocock | Test-first changes and regression fixes; project test conventions still win |
| [`diagnosing-bugs`](vendor/mattpocock/diagnosing-bugs/SKILL.md) | Matt Pocock | Evidence-led diagnosis of bugs and performance regressions |
| [`web-design-guidelines`](vendor/vercel/web-design-guidelines/SKILL.md) | Vercel | UI accessibility, UX, and interface review |
| [`writing-guidelines`](vendor/vercel/writing-guidelines/SKILL.md) | Vercel | Documentation and prose review, after project docs rules |

Every vendor snapshot is pinned in [`manifest.yaml`](manifest.yaml) and has an
`UPSTREAM.md` beside its vendor directory. Do not silently pull from upstream
`main`; refresh through a reviewed commit and record the change.

## Different from plugin runtime skills

These are **development skills** for agents modifying this repository. They may
share the `SKILL.md` format with Open Agent's runtime skill system, but are not
installed automatically into an end user's vault. Runtime skills belong under a
vault's `openagent/openagent-skills/` folder and are managed by the plugin.
