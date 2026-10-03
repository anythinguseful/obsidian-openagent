---
title: "Troubleshooting"
type: reference
status: active
date: 2026-09-11
tags: [openagent, troubleshooting, user]
---

# Troubleshooting

Symptoms that actually show up. You do not need to open the source.

## Chat does not reply / empty bubble

1. Reload the plugin after an update (`main.js` replaced).
2. Settings → Open Agent → **Debug mode**: check the Obsidian console.
3. Local models (LM Studio / Ollama): raise the server context window
   (for example LM Studio `n_ctx`). “Prompt too long” / HTTP 400 means the
   request is larger than the model window — not only an empty bubble.
4. Some models put the answer in *reasoning* instead of ordinary text; the
   plugin should still show that content. If the bubble is still empty after
   a reload, try a non-reasoning instruct model.

## Web search does not run / “the model has no internet”

Search is **not** a chat-provider feature. Settings → **Capabilities → Web search**.

- Default **DuckDuckGo** — no API key.
- Brave / Tavily need a key; SearXNG needs a URL. Empty key → fall back to DuckDuckGo.
- **Web extract** opens one URL you already have; it is not the search box.
- Turn the Web toolset off in Capabilities → the agent will not search.

## Local model feels slow

The plugin prompt includes system text + tool list + history, much larger than
plain chat. Disable unused toolsets, turn off title generation if you do not
need it, and pin small jobs (titles / compression) to a fast model.

## Terminal never appears

Desktop only, default off, first-use consent required. Not available on mobile,
Quick Ask, cron, or subagents.

## After a plugin update, MCP installs / cron scripts vanished

Folders inside the plugin directory are wiped on update. Re-run catalog install
or put the scripts back. See README → Data layout.

## Mermaid broken in a vault note

Chat is sanitized; notes already on disk are not rewritten silently.
Fix the fence in the note: quote labels that contain parentheses.

## Still stuck

Settings → Community plugins: check the Open Agent **version**. File a GitHub
issue with the bug template (other plugins disabled, log, screenshot).
