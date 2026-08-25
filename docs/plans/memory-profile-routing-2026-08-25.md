---
title: "Memory and user-profile routing"
type: plan
status: done
date: 2026-08-25
tags: [openagent, plan, memory, safety, hermes]
---

# Memory and user-profile routing

## Summary

A user profile entry recorded a dated tool-testing session. It is neither a
stable fact about the user nor reusable long-term memory; it belongs in session
history. The current Open Agent read filter protects budgets and prompt
injection, but does not enforce the semantic boundary between `MEMORY.md`,
`USER.md`, and transient session activity.

Hermes Agent source at `41447a6` establishes the needed contract: `user` holds
name/role/preferences/style; `memory` holds environment/conventions/tool quirks/
lessons; both must skip task progress, completed-work logs, and temporary TODO
state. Open Agent keeps its existing two-tool interface but ports that routing
contract and adds a narrow deterministic guard for unmistakable activity-log
entries.

## Contract

| Entry kind | Destination |
| --- | --- |
| User identity, role, stable preference, communication style, durable personal goal | `USER.md` via `update_user_profile` |
| Environment fact, project convention, tool quirk, reusable lesson/decision | `MEMORY.md` via `save_memory` |
| Dated tool/test/session activity, completed-work log, temporary TODO, one-turn request | Rejected; retain in session history |

The guard must stay conservative. It rejects only shapes that are unmistakably
transient activity; it must not reject a genuine stable statement merely because
it mentions tools or testing.

## Verified Hermes source

- `tools/memory_tool.py` @ `41447a6` — `TARGETS` and `SKIP` contract in
  `MEMORY_SCHEMA`; `user` vs `memory` target routing.
- The same file uses injection scanning and budget bounds, but its semantic
  routing is primarily tool-schema guidance. Open Agent deliberately adds a
  narrow write-time guard for the reported exact leak.

## Decisions

| Pick | Reason | Tradeoff |
| --- | --- | --- |
| Keep two Open Agent tools | Existing registry, approval, and UI already distinguish memory/profile. | Does not copy Hermes' single `memory(target=...)` API literally. |
| Shared routing copy | One canonical prompt/schema text prevents tool descriptions and nudge from drifting. | Requires a small shared constant/module. |
| Narrow activity-log guard | Catches the reported leak even if a model ignores tool guidance. | Cannot attempt broad natural-language classification without false positives. |
| Reject rather than reroute automatically | A tool cannot safely infer whether an entry should become memory or session-only. | Model must choose `save_memory` or do nothing on retry. |

## Impact

- `src/agent/memory.ts` — pure transient-activity predicate and guarded memory/
  profile writes.
- `src/agent/tools.ts` — shared routing copy in both tool schemas plus actionable
  rejection response.
- `src/agent/systemPrompt.ts` — exact routing nudge.
- `test/tools.test.cjs`, `test/system-prompt.test.cjs`, and smoke — regression
  coverage for the reported entry, valid stable entries, and copy wiring.

## Test seams

1. **Memory store:** the reported dated tool-test entry is rejected from both
   stores; stable user preference and reusable environment lesson remain valid.
2. **Tool boundary:** each write tool surfaces an actionable error without
   mutating its file.
3. **Prompt assembly:** the nudge states user/memory/transient routing exactly.

## Phases

### Phase 1 — pure routing guard

Add and test the narrow deterministic detector in `memory.ts` before wiring it
to either tool.

### Phase 2 — write boundary and prompt/schema guidance

Apply the guard to both write paths, port Hermes' target/skip language, and add
the system nudge.

### Phase 3 — regression proof

Run tool and prompt tests plus the full pipeline; amend the memory study/audit
with the verified routing contract.

## Implementation status (2026-08-25)

All phases are complete.

- `MEMORY_ROUTING_GUIDANCE` is now the shared owner of USER.md/MEMORY.md/
  transient-session routing copy for both memory tool schemas and the system
  nudge.
- `MemoryStore` rejects unmistakable activity logs before either memory or user
  write path mutates a file. The reported dated tool-test entry is the pinned
  regression; stable user preference and reusable environment lesson remain
  accepted.
- `test/memory.test.cjs`, `test/system-prompt.test.cjs`, and
  `test/tools.test.cjs` prove the detector, direct store boundary, prompt
  routing, and tool-schema wording. The full verification and browser PDF lane
  pass under HeadlessChrome 149.

## GWT

```
Given “Tool test 2026-08-22: user requested a tools-testing session”
When either persistent-memory write tool receives it
Then the write is rejected, neither file changes, and the response says it is
session activity rather than durable memory/profile data.

Given “User prefers explanations in Indonesian”
When update_user_profile receives it
Then USER.md accepts it.

Given “Arena browser proof requires the documented Chromium bootstrap”
When save_memory receives it
Then MEMORY.md accepts it.
```

## Risks

> [!risk]
> Keyword matching can reject a legitimate stable fact. Mitigation: require
> multiple activity signals (dated tool/test/session form or an explicit
> session-request/log phrase), test counterexamples, and do not use a broad
> `test`/`tool` ban.

> [!risk]
> Prompt text and tool copy can drift. Mitigation: one shared routing constant
> and a system-prompt regression assertion.

## Open Questions

- Should a future memory engine perform semantic routing with a dedicated model?
  — deferred. It would add latency and a new failure mode; the current scope is
  a deterministic repair for a clear category error.
