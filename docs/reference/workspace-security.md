---
title: "Workspace path security"
type: reference
status: active
date: 2026-08-14
tags: [openagent, workspace, security, paths]
---

# Workspace path security

Open Agent v0.1.145 applies one canonical logical-path policy to every route that can expose vault content to a model or mutate a vault path. Configure it under **Settings → Open Agent → Workspace**.

## Modes

| Mode | Behavior |
| --- | --- |
| **Whole vault** | Model-visible user content may come from any logical vault path except the protected Obsidian configuration directory and configured exclusions. A folder value is not used for routing in this mode. |
| **Preferred folder** | Preserves the legacy routing behavior: relative tool paths are resolved under the preferred folder, but this is **not** a vault-wide confidentiality boundary. Reads and searches may still use other allowed vault paths. |
| **Strict folder boundary** | Explicit opt-in containment. Model-visible user content is limited to the configured root, minus exclusions. There is no per-message override that can widen this scope. |

Migration is compatibility-preserving: older settings with an empty workspace folder become **Whole vault**; older settings with a non-empty folder become **Preferred folder**. **Strict folder boundary** is never enabled by migration and must be selected explicitly.

## Covered surfaces

The same policy is used for:

- read, search, list, write, edit, delete, and rename/move tools;
- active-note and context-file injection;
- vault-backed image/vision inputs, attachments, prompt tokens, tags, and editor-selection payloads;
- web-extract cache notes;
- cron targets, archives, scheduled/headless execution, and chained tasks;
- child/delegated runs;
- deferred picker and command results, which are revalidated after asynchronous work before reaching the UI or model.

Queue entries and editor payloads carry Workspace provenance. Stale entries are parked or rejected rather than guessed into the current scope.

## Strict-mode isolation

Strict mode additionally partitions:

- managed memory and skills by project scope; and
- conversation sessions inside the plugin-private session directory.

A changed root, exclusion set, or read ceiling cannot silently reuse model-visible history from a different Strict scope.

## File-read ceiling

**File-read limit** is configurable from **1,000 to 20,000 characters** and defaults to **20,000** for compatibility. It limits one file request or attachment read. For larger files, use paged `read_note` requests (`offset` and `limit`) or narrow the requested content instead of bypassing the ceiling.

## What the boundary does—and does not—guarantee

The guarantee is **logical Obsidian vault-path containment**. Absolute paths, traversal/dot segments, control characters, protected configuration paths, and configured exclusions are rejected before a path reaches a Vault/Adapter operation.

It is **not a physical filesystem sandbox**. Obsidian can expose symbolic links or junctions whose logical path is inside the vault while the physical target is elsewhere. Open Agent treats that item according to its logical Obsidian path. Do not place symlinks or junctions to sensitive external locations inside a Strict root; use operating-system permissions or a separately sandboxed vault when physical containment is required.

## Repair behavior

An invalid or missing Strict root fails closed for user-content access while leaving Settings available so the configuration can be repaired. Managed plugin data uses validated roots and separate plugin-private storage rules rather than being made visible through a Workspace exception.
