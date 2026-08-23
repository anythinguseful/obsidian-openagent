# Vendored from Matt Pocock Skills

- Repository: <https://github.com/mattpocock/skills>
- Pinned commit: `5b15a47f2d7150f545fbcacbfe381787fc0230dc`
- Snapshot date: 2026-08-23
- License: MIT; the upstream license text is retained as `LICENSE`.
- Included skills: `handoff`, `tdd`, `diagnosing-bugs`.

The upstream payload is retained without edits. Open Agent-specific adaptation
belongs in `agents/arena/workflows/`, where it can safely override assumptions
that do not hold in Arena: temporary handoff storage, `CONTEXT.md`, native
subagent calls, and local-server defaults.

Refresh only from a reviewed upstream commit. Record the new SHA here and in
`skills/manifest.yaml`; do not silently pull from upstream `main`.
