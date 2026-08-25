# Document routing checklist

- User-visible behavior changed: update the relevant docs note in the same work.
- New audit: narrative in `docs/audits/`, raw proof in `evidence/`.
- New plan: `docs/plans/`, frontmatter status starts `draft` or `active`.
- Existing plan implemented: mark `done` only after the stated verification.
- Failed/reverted experiment: correct the plan immediately; do not preserve a false done state.
- New material document: add it to `docs/README.md`.
- Finish: run `npm run check:docs`.
