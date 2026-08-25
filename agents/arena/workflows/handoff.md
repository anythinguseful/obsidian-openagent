# Arena Handoff Workflow

Use the pinned vendor skill `agents/skills/vendor/mattpocock/handoff/SKILL.md` for the
content contract, with these Arena-specific overrides.

## Persistent destination

Do **not** save handoff output to the OS temporary directory. Write it to:

```text
agents/arena/handoffs/YYYY-MM-DD--short-topic.md
```

The handoff directory is ignored by Git but remains in the Arena workspace
snapshot. It is a session bridge, not durable product documentation.

## Required content

- Current goal and exact state.
- What changed, verified facts, and failed/blocked work.
- Next smallest safe action.
- Exact paths to plans, audits, release artifacts, and evidence instead of
  duplicating their contents.
- Suggested skills selected from `agents/skills/manifest.yaml`.
- Commands already run and their result.
- Redact secrets, API keys, tokens, credentials, and personal data.

## Project overrides

- If the vendor skill mentions `CONTEXT.md`, use `AGENTS.md`,
  `docs/working-agreement.md`, and the relevant docs note instead.
- Do not assume native background subagents or a local web server exist.
- Before ending a substantial session, update documentation/provenance first;
  then write a handoff only when a future session needs continuation context.
