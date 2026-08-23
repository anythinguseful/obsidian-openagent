# Arena Agent Workflow

Arena Agent does not use a durable, repository-supported `.arena/` skill
format. In this workspace, `.arena/` is excluded from persisted snapshots.

The portable workflow is therefore:

1. An agent discovers this repository through root `AGENTS.md`.
2. `AGENTS.md` routes the task to the tracked development skills in `skills/`.
3. `skills/manifest.yaml` declares each skill's scope, priority, and source.
4. These workflow notes supply repeatable procedures for audit, docs, and
   release work.

The tracked `skills/` directory is for developing this plugin. It is separate
from runtime skills that the Open Agent plugin can install into an end user's
Obsidian vault.
