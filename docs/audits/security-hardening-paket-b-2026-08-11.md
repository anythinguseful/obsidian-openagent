---
title: "Security hardening — Paket B"
type: audit
status: done
date: 2026-08-11
tags: [openagent, security, network, markdown, vision, trust-boundary]
---

# Security hardening — Paket B

This note records the implemented **balanced** hardening scope approved after
the Paket B audit. It is a boundary statement, not a claim that Electron or
Obsidian's network stack has become a fully controllable browser sandbox.

## Scope

The centralized model-network policy applies only to URLs chosen by the model
for:

- `web_extract`; and
- remote `vision_analyze` images.

It intentionally does **not** wrap provider transports or provider base URLs
configured by the user. Local LM Studio/Ollama endpoints and custom provider
endpoints therefore keep their existing behavior.

## Implemented controls

- Model-selected URLs are parsed and canonicalized before transport.
- Only HTTP(S) on default web ports is accepted; credentials, malformed URLs,
  local/single-label/special-use hosts, and private or special IPv4/IPv6
  literals are rejected.
- Responses require a 2xx status. Web extraction additionally requires an
  allowed textual content type (or a text-like body when the header is absent).
- Exposed `Content-Length` and the already-buffered body are checked against a
  per-call cap. A soft deadline and caller abort race stop the caller from
  waiting indefinitely where possible.
- Remote, data-URL, and vault vision inputs use the same PNG/JPEG/GIF/WebP/BMP
  magic-byte allowlist before pixels reach a model.
- Tool, web, file, attachment, OCR, and image content is explicitly treated as
  untrusted data in model prompts. Exact reserved `/steer` marker tokens from
  tool output are escaped before transcript and model-wire use.
- Persistent memory/profile writes use the cautious `persistent-write`
  approval class.
- Assistant-authored remote Markdown/HTML/CSS/Mermaid media is neutralized
  before rendering. The blocked resource becomes inert or an ordinary link
  requiring a user click; ordinary links and valid local/data images remain.
- Manual-install documentation and release validation require
  `vendor/pdf.worker.min.js`.

## Honest transport limitations

Obsidian's public `requestUrl` API returns an already-buffered response and
does not expose redirect hops, the final URL, DNS resolution, response-body
streaming, or an `AbortSignal` transport hook. Consequently Paket B does **not**
claim to provide:

1. validation of hidden redirect destinations;
2. DNS pinning or protection against DNS rebinding between validation and
   connection;
3. hard cancellation of a request already started by `requestUrl`; or
4. a pre-download body cap (the byte cap is enforced after buffering, plus any
   exposed `Content-Length` check).

The deadline and caller abort are deliberately described as **soft** and
**best-effort**. Closing these residuals would require a transport primitive
that exposes redirect, resolver, streaming, and cancellation controls; it
cannot be truthfully emulated on top of the current public API.

## Regression gates

The implementation is covered by policy-level network tests, tool and agent
loop tests, Markdown parser/obfuscation regressions, configured TypeScript
checks, production build, docs checks, and a real browser preview assertion
that fails if assistant remote media creates an element or starts a request.
