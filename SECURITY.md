# Security policy

## Reporting a vulnerability

Do not disclose an exploitable issue in a public issue before a fix is available. Contact the repository owner through a private GitHub security advisory after the new repository is created. Include affected versions, reproduction steps, impact, and any proposed mitigation.

Do not include real API keys, private vault contents, credentials, or destructive payloads in reports or fixtures.

## Supported baseline

The clean repository baseline is Open Agent `0.1.146` with minimum Obsidian version `1.5.0`.

## Current security boundaries

- Destructive vault operations remain approval-gated unless the user explicitly chooses a less restrictive approval mode.
- Skill creation/management and cron creation/management use approval boundaries.
- Headless and scheduled runs use a fail-closed capability allowlist.
- One canonical Workspace policy covers tools, active/context notes, attachments and prompt tokens, vision vault inputs, web cache, cron/headless/archive paths, editor payloads, and child/delegated runs.
- Strict folder boundary is explicit opt-in, filters model-visible user content to the configured logical root and exclusions, and partitions managed memory, skills, and plugin-private sessions by project scope.
- File reads are capped per request (configurable from 1,000 to 20,000 characters; default 20,000) with paged-read guidance.
- Workspace containment is a logical Obsidian-path guarantee, not a physical filesystem sandbox: symlinks and junctions can target locations outside their logical vault path.
- Provider network requests, remote media, and delegated execution are bounded and covered by regression tests.
- PDF extraction uses `pdfjs-dist@4.10.38`, a real dedicated Worker, input/page/output caps, serialization, a whole-operation deadline, worker termination, recovery, and blob URL cleanup.
- The adversarial PDF matrix includes a non-executing CVE-2024-4367 FontMatrix regression fixture and must pass before release.

## Terminal & Processes v1

Terminal execution is a separate, high-risk desktop capability. It is off by default and requires an explicit checked first-use warning. Valid consent is tied to a random receipt stored both in plugin settings and in a separate local-only ledger for the physical vault; importing or hand-editing settings cannot create consent.

- The Terminal service is acquired only after Obsidian confirms a desktop runtime. Mobile, Quick Ask, delegated children, cron/headless runs, and generic or unattended runner paths do not receive `terminal` or `process`.
- Every command start is prepared as an exact approval snapshot and requires **Allow once**, including in YOLO. Process kill also requires Allow once. Terminal never creates an allow-always grant, and changes to command, image identity, Workspace, or security settings invalidate the prepared action before execution.
- Docker mode uses one disposable container per foreground command or background process. It disables networking and automatic image pulls, closes stdin, allocates no PTY, drops capabilities, enables `no-new-privileges`, makes the container root read-only, and applies CPU, memory, and process limits.
- The Workspace and cwd are resolved physically. Symlink/junction escapes, a symlinked Workspace root, and unrelated nested host submounts are refused. `.obsidian` and configured exclusions are masked inside the container.
- Docker isolation still depends on the security of the installed Docker Engine, daemon configuration, selected image, kernel, and host. A mocked runtime regression suite is not a substitute for a real-engine smoke test.
- Local expert mode is deliberately **unsandboxed**. It is foreground-only, receives a minimal environment, and is refused in Strict Workspace and YOLO modes. A command can still exercise the operating-system permissions of Obsidian; use Docker or external OS isolation for untrusted or adversarial execution.
- Output, runtime, concurrency, retained process records, log windows, health checks, ownership, cleanup, and Stop All are bounded. These controls limit resource use; they do not turn Local mode into a sandbox.

## Cron scripts (watchdog)

Scheduled automations may run a small user-managed script each tick (the Hermes `script` / `no_agent` pattern). This executes code on the host, so it is bounded and separated from the agent:

- Scripts live under the protected Obsidian config dir (`.obsidian/plugins/<id>/scripts/`). The workspace policy already blocks every agent tool from that directory, so the model can never read, list, or plant a script — only the user places files there.
- Execution is desktop-only, acquired lazily via `require("child_process")` (no eager Node import; mobile never loads it). It uses `execFile` with an interpreter chosen strictly by file extension (`.sh`/`.bash` → bash, `.js` → node, `.py` → python3), stdin closed, a 30-second hard timeout, a 64 KiB output cap, and a minimal environment (PATH/HOME/temp only — no ambient secrets).
- A script and a monitor URL are mutually exclusive on one automation. `no_agent` delivers the script's stdout verbatim to the target note with no model call at all.
- Scripts are not sandboxed: they run with the same operating-system privileges as Obsidian, exactly like the Local terminal backend. Only point an automation at scripts you have written and trust.

## MCP (external tool servers)

The MCP runtime connects to the configured servers, so it is gated like Terminal:

- **First-use consent** — a checked modal plus a per-vault random receipt in a separate local ledger; importing or hand-editing settings cannot mint consent (mirrors the Terminal consent shape).
- **Two transports** — stdio servers run their command via `child_process` acquired lazily (no eager Node import; mobile never spawns). HTTP servers are spoken to over Obsidian's `requestUrl` (Streamable HTTP: JSON-RPC POST, session-id echo, JSON or SSE responses). Non-http(s) URLs are refused.
- **Minimal environment** — stdio servers receive PATH/HOME/temp plus only the variables you configure for them, never ambient secrets or vault API keys.
- **Bounded** — 30-second timeout per call, 100 KB output cap, stdin never written except JSON-RPC lines.
- **Isolated exposure** — MCP tools (`mcp__<server>__<tool>`) appear only on the owned interactive chat path; delegation, cron/headless, and Quick Ask never see them.
- **Not sandboxed** — server commands run with the same OS privileges as Obsidian. Only add servers you trust, exactly like Local terminal mode.

## MCP catalog (curated installs)

The catalog installs pinned, curated servers in one step (mirrors Hermes' `optional-mcps/`):

- **Curated and pinned** — only entries the plugin can run end-to-end are offered (currently n8n and unreal-engine). Git installs pin a full commit SHA and are never auto-updated; a reinstall wipes and re-clones at the same SHA.
- **Runs third-party code** — `git clone` + checkout + the manifest's bootstrap commands (e.g. `python3 -m venv`, `pip install -r requirements.txt`) execute on this device through `execFile`, with a non-interactive git environment (no credential prompts), hard timeouts, and a bounded output — but **not in a sandbox**. Installing is a trust decision about the publisher.
- **Desktop-only, lazy Node** — `child_process`/`fs` are acquired lazily, so mobile never runs an install.
- **Secrets at install time** — api-key entries prompt for values which are stored in the server's `env` in plugin settings (data.json, plaintext on disk). The OAuth-only remote entries in Hermes' catalog are deliberately absent: the plugin has no OAuth browser flow.

## Safety guardrails

- **Approval timeout** — approval prompts auto-deny after a configurable number of seconds (0 = wait forever), so a missed prompt never leaves a run hanging indefinitely.
- **Secret redaction** — detected API keys, tokens, and private keys in model-visible tool output (web pages, file reads) are masked with a fixed placeholder before they reach the model. Conservative patterns only; ordinary prose is never altered. Toggle in Settings → Safety.
- **Memory injection scan** — MEMORY.md / USER.md entries are scanned for injection/exfiltration shapes before they enter the system prompt; a poisoned entry renders as `[BLOCKED: reason]` while the raw vault file is left untouched for you to inspect and edit.
- **Checkpoints** — before the agent modifies or trashes a note, its previous content is snapshotted under `openagent/checkpoints/`. These are plain notes you can diff against or copy back. Toggle in Settings → Safety.

## Dependency policy

Runtime dependency audits must report zero known vulnerabilities for a release. Development-only advisories are reviewed separately and must not be fixed with an unreviewed breaking upgrade.
