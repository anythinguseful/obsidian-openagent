# Documentation workflow

- `docs/` is an Obsidian-friendly, GitHub-readable documentation vault.
- Every note needs `title`, `type`, `status`, `date`, and `tags` frontmatter.
- Links are relative Markdown links, never local workspace paths or wikilinks.
- Put plans in `docs/plans/`, upstream research in `docs/studies/`, plugin
  audits in `docs/audits/`, living contracts in `docs/reference/`, and
  superseded notes in `docs/arsip/`.
- Keep raw proof in `evidence/`, then link to it from the curated narrative.
- Update `docs/README.md` for a material new document and run `npm run check:docs`.
