---
name: openagent-docs
description: Project-specific documentation routing and integrity for Open Agent. Use before creating, moving, substantially revising, auditing, archiving, or releasing any project documentation; also use when documentation, evidence, plans, release notes, or refactor TODOs need to stay consistent.
---

# Open Agent documentation contract

Use this skill after `doc-coauthoring` for substantial drafting and after
`writing-guidelines` for prose review. This skill decides where the final
artifact belongs and what project contracts it must satisfy.

## Route by purpose

| Artifact | Location | Required outcome |
|---|---|---|
| Feature/refactor plan | `docs/plans/` | Start from `_TEMPLATE.md`; status is honest. |
| Upstream/source research | `docs/studies/` | Record primary source, scope, conclusion, and date. |
| Audit of Open Agent itself | `docs/audits/` | State baseline, evidence, findings, limits, and outcome. |
| Living user/security contract | `docs/reference/` | Update when behavior changes; avoid implementation history. |
| Superseded diagnosis/plan | `docs/arsip/` | Mark `archived`; link to the replacement. |
| Raw logs, matrices, checksums, screenshots | `evidence/` | Keep proof separate from readable narrative. |
| User release summary | `RELEASES.md` | Concise behavior-oriented changelog. |
| Release proof | `releases/vN/` | Final report, artifact hashes, source manifest. |

## Non-negotiable format

1. Every `docs/**/*.md` note has frontmatter: `title`, `type`, `status`,
   `date`, `tags`.
2. Internal links are relative Markdown links, never machine-specific paths or
   wikilinks.
3. Curated docs link to raw proof in `evidence/`; do not paste logs/checksums
   into the narrative.
4. Update `docs/README.md` when adding a material plan, study, audit, or
   reference note.
5. Update `RELEASES.md` and `releases/vN/` together for a release.
6. Run `npm run check:docs` before calling documentation complete.

## Refactor/status discipline

- Mark work `done` only when its implementation is present and the promised
  witness passes.
- Mark reverted/superseded work `archived` or restore an active plan to pending;
  never leave a completed claim after code was restored.
- Record offered options, owner decisions, current work label, deferred work,
  and why a path was deferred in the roadmap/plan that owns the decision.
- Do not turn a conversation transcript into docs. Capture the decision,
  contract, evidence, and next action only.

## Workflow

1. Read `docs/README.md`, `docs/working-agreement.md`, and the closest existing
   note before drafting.
2. Select the route above.
3. Use the project template or established sibling structure.
4. Link source/proof relatively; validate every link target exists.
5. Update the hub if required.
6. Run `npm run check:docs`.

See `references/document-routing.md` and `references/release-documentation.md`
for compact checklists.
