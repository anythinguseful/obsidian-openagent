---
title: "Security hardening — Paket C (PDF extraction)"
type: audit
status: done
date: 2026-08-13
tags: [openagent, security, pdf, worker, regression]
---

# Security hardening — Paket C

Paket C hardens local PDF attachment extraction and makes its threat model executable in CI and the release pipeline.

## Dependency baseline

- `pdfjs-dist@4.10.38`
- `diff@8.0.4`

The runtime dependency audit for v0.1.139 reports zero known vulnerabilities. A development-only advisory affecting the esbuild development server is tracked separately and is not shipped in the plugin ZIP.

## Enforced boundaries

PDF extraction in `src/ui/attach/pdf.ts` now enforces:

- a 20 MiB input cap;
- a 50-page extraction cap;
- bounded accumulated text output;
- a 30-second whole-operation deadline;
- fail-closed behavior when the worker source or bytes are unavailable;
- a dedicated Worker with no fake/main-thread fallback;
- serialization so concurrent documents do not share an unsafe wrapper;
- termination and state reset after corruption or timeout;
- recovery with a fresh Worker on the next valid extraction;
- reuse of a healthy Worker;
- blob URL revocation during corruption, timeout, replacement, and unload.

## Adversarial browser regression

`npm run test:pdf-security` bundles and runs a 49-check browser matrix. It covers missing source, missing worker bytes, non-abortable reads, corrupt and silent workers, valid/repeated/concurrent extraction, input/page/output limits, malformed/truncated PDFs, post-timeout recovery, lifecycle cleanup, and a non-executing CVE-2024-4367 FontMatrix marker fixture.

The matrix is part of:

1. the local `npm run verify` gate;
2. the full `npm run release` pipeline;
3. GitHub Actions CI.

The v0.1.139 baseline passed 49/49 checks in Chromium 149 and exact Chrome 114 (the Chromium generation used by Electron 25).

## Release invariant

A release is rejected if the source/type/test/browser/docs gates fail, the build stamp is missing, a required plugin file is absent, ZIP-minified CSS loses sentinel selectors, or staged runtime bytes differ from the just-built source artifacts.
