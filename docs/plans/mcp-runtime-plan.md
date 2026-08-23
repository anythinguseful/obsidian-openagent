---
title: "Rencana: MCP runtime client (paritas Hermes)"
type: plan
status: done
date: 2026-08-19
tags: [openagent, mcp, plan]
---

# Rencana: MCP runtime client (paritas Hermes)

## Summary

MCP selama ini **config-only** (settings bisa diisi/import, tapi tak ada yang
tersambung). Runtime client menghubungkan server stdio, mendiscovery tool,
dan menyuntikkannya ke agent sebagai `mcp__<server>__<tool>`.

Sumber: `optional-mcps/*/manifest.yaml` + `hermes_cli/mcp_*.py` Hermes
(diverifikasi byte-level @ `9162ea6` / `aeabff6`), dipetakan ke plugin.

## Contract

- Hanya server **enabled** yang dijalankan; **stdio** dulu (`command`+`args`+`env`), HTTP menyusul.
- Gate: `mcpEnabled` (master) **dan** first-use consent (receipt per-vault, pola Terminal).
- Tool muncul sebagai `mcp__<server>__<tool>` (toolset `mcp`) — hanya di jalur interactive chat.
- Timeout 30 dtk/call, output 100 KB, env minimal (PATH/HOME/temp, tanpa secret).

## Decisions

- D1: First-use consent (mirror Terminal) — proses eksternal = kelas risiko sama; consent sekali + granularitas via switch per-server.
- D2: Injeksi hanya di `getToolsWithMcp` (jalur owned interactive); headless/delegated/Quick Ask memakai `getTools` sinkron → otomatis tanpa MCP (fail-closed by construction).
- D3: Klien murni + transport ter-inject (node-testable); stdio = `require("child_process")` lazy.
- D4: Satu server gagal → di-skip (agent tak melihatnya), tidak merusak seluruh run.
- D5: tools/list di-cache per server; perubahan config menginvalidasi cache server itu.

## Phases

### Phase 1 — client + stdio transport (DONE)
### Phase 2 — McpRuntime + injeksi dinamis (DONE)
### Phase 3 — consent + lifecycle + UI modal (DONE)
### Phase 4 — HTTP transport (DONE — Streamable HTTP POST via requestUrl)
### Phase 5 — katalog `mcp install` ala Hermes (DONE — curated + pinned git install)

## GWT

```text
Given server enabled + consent ada
When getToolsWithMcp dijalankan
Then tool mcp__<server>__<tool> muncul dengan description berprefix [MCP server]

Given server command gagal spawn
When listTools dijalankan
Then server itu di-skip (tool tidak muncul), agent tetap jalan

Given settings import tanpa receipt ledger
When restorePersistedMcpConsent dijalankan
Then consentVersion tetap 0 (fail-closed)
```

## Risks

> [!risk]
> Server MCP = proses eksternal tak tersandbox. Mitigasi: consent + env minimal
> + timeout + cap + hanya server enabled. (Sama dengan Local terminal mode.)

> [!risk]
> Tool MCP bisa menamai dirinya mirip tool internal. Mitigasi: prefix `mcp__`
> + `[MCP server]` di description, dan tidak pernah bisa menimpa nama internal.

## Batasan jujur

- Transport HTTP = Streamable HTTP saja (POST JSON-RPC + session-id + SSE/JSON).
  Transport SSE klasik (`transport: sse`, dua koneksi GET+POST) BELUM didukung.
- OAuth (native 2.1 browser flow) BELUM ada — karena itu entri katalog Hermes yang
  remote-OAuth (notion/linear/stripe/…) TIDAK ditawarkan (fail-closed).
- Katalog hanya memuat entri yang benar-benar bisa dijalankan plugin: `n8n`
  (stdio + git + api-key env) dan `unreal-engine` (http + tanpa auth).
- Belum diverifikasi terhadap server MCP asli (diuji via transport fake) — verifikasi eksternal menyusul.
