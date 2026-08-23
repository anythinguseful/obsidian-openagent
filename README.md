# Open Agent ☤

**A self-improving AI agent that lives inside your Obsidian vault.**

Open Agent brings the architecture of [Nous Research's Hermes Agent](https://github.com/NousResearch/hermes-agent)
to Obsidian: a real agent loop with tool calling, a closed learning loop (skills), persistent
memory, searchable sessions, and cron automations. The settings map to
[Hermes Desktop](https://github.com/NousResearch/hermes-agent/tree/main/apps/desktop),
and the chat UI is built with [prompt-kit](https://github.com/ibelick/prompt-kit) components
ported to Obsidian.

- **Author:** anonymous
- **Plugin ID:** `openagent`
- **Min Obsidian version:** 1.5.0

---

## Documentation

The [`docs/`](docs/) folder is a structured, Obsidian-friendly documentation
vault: **plans** (feature designs), **studies** (upstream parity research),
**audits** (plugin audits), **reference** (verified upstream sources), plus
the **working agreement** (process memory & Lessons log). Every note carries
frontmatter metadata and relative links that resolve both on GitHub and
inside Obsidian. Start at [**docs/README.md**](docs/README.md) — the hub.

---

## Install

### From release files (drop-in)

1. Copy `main.js`, `manifest.json`, `styles.css`, and `vendor/pdf.worker.min.js` into
   `<your-vault>/.obsidian/plugins/openagent/` (preserve the `vendor/` subfolder).
2. Reload Obsidian → **Settings → Community plugins** → enable **Open Agent**.
3. Open with the ribbon icon (🤖) or command palette → **Open Open Agent chat**.

### From source

Requires Node.js 20.11 or newer.

```bash
cd openagent
npm ci
npm run verify     # typecheck, build, tests, PDF browser matrix, docs/metadata, skills
npm run dev        # optional watch mode
```

For an installable, synchronized archive, run `npm run release`. The versioned ZIP is written under the ignored `release/` directory. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

## First run

1. **Settings → Open Agent → Providers** — select a provider connection to configure (Nous Portal,
   OpenRouter, OpenAI, Anthropic, LM Studio, Ollama, or any custom OpenAI-compatible endpoint), then enter its URL and API key.
2. Click **Test connection** — the plugin verifies that connection and saves its model catalog without changing the provider used by chat.
3. **Settings → Open Agent → Model** — choose and apply the provider + model pair used by chat (or enter a custom model id).
4. **Settings → Open Agent → Workspace** — keep **Whole vault**, choose a routing-only **Preferred folder**, or explicitly opt in to a **Strict folder boundary**.
5. Optional, desktop only: **Settings → Open Agent → Capabilities → Terminal & Processes** — read and accept the first-use warning, then configure Docker or the separate unsandboxed Local expert mode. Terminal is off by default.
6. Chat. Type `/help` in the composer for slash commands.

---

## Feature map ↔ Hermes Agent

| Hermes capability | Open Agent implementation |
| --- | --- |
| Agent loop / tool calling | `src/agent/agentLoop.ts` — streaming chat → tool calls → execute → repeat, with iteration cap and interrupt-and-redirect (`AbortSignal`) |
| Tools & toolsets (25 tools) | `src/agent/tools.ts` plus `src/agent/terminal/tools.ts` — 25 tools in 10 toggleable toolsets: **vault** (read_note/write_note/edit_note/delete_note/rename_move_note/list_files/search_vault/get_active_note), **web** (web_extract/web_search), **memory** (save_memory/update_user_profile — add·replace·remove under a char budget · search_memory/session_search), **skills** (create_skill/list_skills/view_skill/manage_skill), **automations** (cronjob), **delegation** (delegate_task), **vision** (vision_analyze), **todo**, **clarify**, and desktop-only **terminal** (terminal/process). Existing toolsets default on; Terminal & Processes defaults off and requires separate first-use consent. |
| `--yolo` / approval modes | Approval mode `manual` (approve everything) · `cautious` (destructive only) · `yolo` (ordinary tools do not ask). Inline approval card with *Allow once / Always / Deny* and a per-session allowlist. Terminal command starts and process kills always require exact *Allow once*, including in YOLO; Local execution is refused in YOLO. |
| Closed learning loop (skills) | `src/agent/skills.ts` — [agentskills.io](https://agentskills.io) `SKILL.md` files under the vault (default `openagent/openagent-skills/<name>/SKILL.md`). Skills are injected into the system prompt and the agent authors new ones via `create_skill` after complex tasks |
| Agent-curated memory | `src/agent/memory.ts` — `MEMORY.md` + `USER.md` (dialectic user model) as plain vault notes, add·replace·remove under configurable char budgets (Memory/Profile Budget), injection-scanned before injection, plus periodic **memory nudges** every N user messages |
| Structured memory engine | `src/agent/memoryEngine.ts` — a Hindsight-style typed-fact layer (plugin-native: no Docker/MCP/server). One LLM call distills each turn into world/experience facts with add·update·delete + dedupe; per-message recall fuses BM25 + entity + temporal + trust and — with an optional embedding model (`embedding-gemma-300m`, one setting) — cosine similarity over your provider's `/v1/embeddings`; observations join the recall block. A background `reflect` pass consolidates facts into evidence-backed observations and answers standing mental-model questions (settled knowledge read straight from disk, no LLM at retrieval). All engine files live in `<memory folder>/.engine/` |
| Session search / cross-session recall | `src/agent/sessions.ts` — sessions stored as JSON in the plugin data folder, full-text `search`, load/continue, auto-prune |
| Cron scheduler (automations) | Settings → **Automations** — a guided schedule builder plus ready-made **blueprint templates** (you never type raw cron; a "Means: …" line explains the schedule), an optional change-detection page monitor, an optional no-AI script watchdog, results appended to a target note, run-now button. The full expression reference lives in [Cron expressions](docs/reference/cron-expressions.md) |
| Use any model | `src/agent/providers.ts` — OpenAI-compatible transport with SSE streaming, automatic `requestUrl` fallback, reasoning-effort ladder (`none → ultra`), provider presets |
| Context files (AGENTS.md) | Settings → Memory & Context → **Context file** — injected into every conversation when allowed by the Workspace policy |
| Workspace path policy | Settings → **Workspace** — Whole vault, routing-only Preferred folder, or explicit Strict folder boundary; shared enforcement covers tools, context, attachments/tokens, vision, web cache, cron/headless, and delegation |
| External MCP servers | Settings → **Capabilities → MCP** — stdio (command) and HTTP (URL) servers behind a first-use consent, a curated one-click install catalog (pinned sources), and tools exposed as `mcp__<server>__<tool>` on the interactive chat path only |
| Personalities (`/personality`) | a global default in Settings → Chat (Hermes `display.personality`) — `none` (identity only) · researcher · engineer · writer · librarian …, overridden per chat by `/personality`, plus a custom system prompt in Advanced. Profiles carry only the SOUL identity |
| Slash commands | `/new` `/model` `/moa` `/personality` `/skills` `/learn` `/memory` `/usage` `/version` `/status` `/title` `/resume` `/save` `/branch` `/goal` `/steer` `/queue` `/compress` `/retry` `/undo` `/stop` `/profile` `/approvals` `/help` — with aliases `/sessions` & `/switch` → `/resume`, `/q` → `/queue`, `/fork` → `/branch`, `/compact` → `/compress` |

## Settings map ↔ Hermes Desktop

`src/settingsTab.ts` mirrors the desktop app's settings layout:

**General** (send behavior, timestamps, chat panel location — left sidebar / main tab / right sidebar, settings export/import/reset) ·
**Providers** (register and configure provider connections: base URL, API key, custom headers, test connection) ·
**Model** (choose the active provider/model route, custom model id, reasoning effort, temperature, max tokens, streaming) ·
**Workspace** (Whole/Preferred/Strict mode, root, exclusions, file-read ceiling) ·
**Safety** (approval mode and execution limits) · **Chat** (conversation behavior and personality) ·
**Appearance** (tool cards, reasoning, session density, intro screen, reaction buttons — Obsidian's theme is never touched) ·
**Commands** · **Profiles** · **Capabilities** (toolsets, skills, MCP servers, and desktop-only Terminal & Processes configuration) ·
**Memory & Context** (managed memory, sessions, and context file) ·
**Notifications** · **Automations** (cron tasks, schedule builder, blueprint templates) ·
**Advanced** (max tool iterations, tool output limit, checkpoint snapshots kept, custom system prompt, request timeout, debug).

## UI ↔ prompt-kit + Hermes Desktop layout

The chat view mirrors the Hermes Desktop shell:

- **topbar** — conversation panel toggle, title, live "working" indicator, new chat, settings
- **sessions panel** — slide-over chat list with search and date groups (Today / Yesterday /
  Previous 7 days / Older), active-row accent, hover delete
- **composer** — attachment chips (active note) above an autosizing textarea; the bottom row
  carries a **model pill** (popover with filter, fetch-models and provider-settings actions,
  collapsing when narrow) and the send/stop button
- **statusbar** — provider · model · session tokens (↑in ↓out, compact) · personality
- **quick ask** — selecting text in the chat or a note pops a floating action bar (Quote / Copy); expanding it opens a movable, resizable Q&A overlay (anchor-guarded, drag-clamped) for asking questions against the selection
- **settings** — tab strip (General · Providers · Model · Agent · Tools · Skills · Memory ·
  Sessions · Automations · Advanced) with provider cards, per-provider status dots and
  inline connection-test results

`src/ui/components/` ports these [prompt-kit](https://github.com/ibelick/prompt-kit) components
to Obsidian (CSS hooked into Obsidian theme variables, no external runtime deps):

`chat-container` (stick-to-bottom) · `scroll-button` · `message` (+ hover actions, copy) ·
`markdown` (Obsidian MarkdownRenderer → callouts, wikilinks, tables) · `code-block` ·
`tool` (collapsible tool-call card + status badges) · `reasoning` (live shimmer + duration) ·
`prompt-input` · `prompt-suggestion` · `loader` (typing / wave / circular / shimmer) · `text-shimmer`.

## Data layout

```
<vault>/openagent/openagent-skills/<kebab-name>/SKILL.md      ← skills the agent learned
<vault>/openagent/openagent-memory/MEMORY.md                  ← long-term memory
<vault>/openagent/openagent-memory/USER.md                    ← user profile
<vault>/openagent/Reports.md                        ← default cron output
<vault>/.obsidian/plugins/openagent/sessions/*.json ← conversation history
```

Strict mode partitions managed memory, skills, and plugin-private sessions by project scope; exact managed paths are derived from the configured policy.

Two auxiliary folders live inside the plugin directory and are **wiped when the plugin is updated** (re-run the install afterward): `.obsidian/plugins/openagent/scripts/` (user-placed cron scripts, desktop only) and `.obsidian/plugins/openagent/mcp-installs/` (catalog MCP clones).

## Security notes

- API keys are stored in the vault's plugin `data.json` (local only).
- Destructive tools (`delete_note`, `rename_move_note`) require approval unless approval
  mode is `yolo`.
- Every write tool reports exactly what it changed; the agent is instructed to verify
  edits by reading back.
- Strict mode is a **logical Obsidian path** boundary, not a physical filesystem sandbox;
  a symlink or junction under the allowed root can still target another physical location.
- The per-file read ceiling defaults to 20,000 characters; larger notes should be read in pages.
- Terminal & Processes is desktop-only, off by default, unavailable to Quick Ask, delegation, cron/headless, mobile, and other unattended paths, and requires non-portable per-vault first-use consent.
- Safety guardrails (Settings → Safety): approval prompts auto-deny after a configurable timeout (0 = wait forever), secret-looking keys in model-visible tool output are redacted, and notes are snapshotted to `openagent/checkpoints/` before the agent edits or trashes them.
- MCP servers (stdio commands and HTTP URLs) run unsandboxed behind a first-use consent, are bounded (30 s per call, 100 KB output), and their tools never reach delegation, cron/headless, or Quick Ask. Catalog installs clone and run third-party code on this device.
- Docker commands use one disposable network-off container per command/process with a read-only container root, bounded resources, closed stdin, and a physically resolved Workspace mount. The configured image must already exist locally; automatic pulls are disabled.
- Local expert mode is intentionally **not sandboxed**, is foreground-only, receives a minimal environment, and is refused in Strict Workspace and YOLO modes. Use Docker or OS isolation for adversarial commands.
- Every Terminal command start and process kill requires an exact *Allow once* approval; Terminal never offers an allow-always capability.

For Workspace mode semantics, migration behavior, covered surfaces, and repair guidance, see [Workspace path security](docs/reference/workspace-security.md).

## Security

See [SECURITY.md](SECURITY.md) for the supported baseline, reporting guidance, and enforced runtime boundaries.

## License

[MIT](LICENSE)
