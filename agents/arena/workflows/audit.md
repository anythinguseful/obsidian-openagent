# Audit workflow

1. Read `AGENTS.md`, `docs/working-agreement.md`, and the task-specific skill.
2. Separate curated audit narrative (`docs/audits/`) from raw proof
   (`evidence/`). Do not mix browser logs, checksums, or matrices into the
   narrative note.
3. State the audited baseline, scope, method, findings, evidence links, and
   what is not proven. Use `type: audit` frontmatter for a new audit note.
4. Update `docs/README.md` when an audit becomes part of the project record.
5. Run `npm run check:docs`; run the relevant technical gate before claiming a
   finding is reproduced or fixed.
