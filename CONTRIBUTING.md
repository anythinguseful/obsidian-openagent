# Contributing to Open Agent

Open Agent is an Obsidian plugin with security-sensitive tool execution, model networking, and local PDF parsing. Keep changes small, reviewable, and covered by regression tests.

## Requirements

- Node.js 20 or newer (CI uses Node.js 22)
- npm
- A Chromium-compatible browser for browser regressions; the test harness can install Playwright's headless shell when absent
- `zip` for packaging a release

## Setup

```bash
npm ci
```

## Validation

Run the complete source gate:

```bash
npm run verify
```

This runs typecheck, production build, unit/smoke tests, the adversarial PDF browser matrix, documentation/metadata checks, and the development-skill integrity gate.

To exercise real preview pages and produce a synchronized installable artifact as well:

```bash
npm run release
```

The release command writes an ignored, versioned ZIP under `release/`. Do not commit generated `main.js`, `vendor/`, preview output, browser downloads, dependency caches, or release ZIPs.

Clean generated output with:

```bash
npm run clean
```

## Security invariants

Changes must preserve approval boundaries for destructive tools, headless/cron capability restrictions, model-network and remote-media boundaries, and PDF worker fail-closed behavior. Add a regression for every repaired boundary. See [SECURITY.md](SECURITY.md) and the security audit notes under `docs/audits/`.

## Pull requests

- Explain the user-visible change and threat-model impact.
- Include tests and documentation updates where relevant.
- Keep dependency upgrades explicit; do not use forced audit upgrades as a substitute for review.
- Confirm `npm run verify` passes before requesting review.
