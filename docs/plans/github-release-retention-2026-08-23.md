---
title: "GitHub Release retention and publication"
type: plan
status: active
date: 2026-08-23
tags: [openagent, plan, release, github, packaging]
---

# GitHub Release retention and publication

## Summary

Historical release bundles were retained in a machine-local root workspace
outside the repository. That location does not survive Arena sessions and was
not included in the GitHub upload, leaving `RELEASES.md` and the documentation
contract pointing to unavailable `releases/vN/` reports.

The owner approved moving permanent retention to **GitHub Releases**. Starting
with v0.1.151, each release will attach its installable ZIP, checksum, clean
source archive, source manifest, and final report to an immutable GitHub Release.
The repository keeps the concise `RELEASES.md` changelog and links; it does not
track generated release binaries or depend on a machine-local archive folder.

v0.1.151 must be described honestly as a **reconstructed verification release**:
the source is present, but the original machine-local artifact bytes are gone.
No historical checksum will be invented or claimed to match.

## Contract

- GitHub Releases is the permanent archive for release assets.
- `release/` remains an ignored local staging directory and may be deleted only
  after GitHub upload and remote checksum verification.
- Repository source never tracks generated `main.js`, `vendor/`, install ZIPs,
  clean-source ZIPs, or release binaries.
- `RELEASES.md` remains the user-facing chronological summary and links to the
  corresponding GitHub tag/release.
- A GitHub Release contains:
  1. `openagent-obsidian-plugin-vN.zip`;
  2. install ZIP `.sha256`;
  3. `openagent-vN-clean-source.zip`;
  4. clean-source `.sha256`;
  5. source manifest `.sha256`;
  6. `openagent-vN-final-report.md`.
- Publication is explicit and separate from local packaging. A normal build or
  `npm run release` never publishes to GitHub by itself.
- Existing GitHub tags/releases are immutable: the publisher refuses overwrite.
- The release target must be a pushed commit whose CI/browser proof corresponds
  to the source being packaged.
- v0.1.151 release text states that its artifacts were reconstructed from the
  tracked v0.1.151 source and newly verified; they are not the missing original
  ZIP bytes.

## Decisions

| ID | Decision | Source |
| --- | --- | --- |
| D1 | Publish v0.1.151 and use the same process for every future release. | Owner selection, 2026-08-23. |
| D2 | GitHub Releases is the primary and only durable binary archive. | Owner selection, 2026-08-23. |
| D3 | Keep only `RELEASES.md` and release links in the repository; final reports and all generated proof files are GitHub assets. | Owner selection, 2026-08-23. |
| D4 | Historical v0.1.139–v0.1.150 artifacts are not reconstructed without a separate request; their changelog remains historical. | Honesty boundary: original bytes are unavailable. |
| D5 | No GitHub Actions workflow change is required. Existing CI supplies exact-commit browser proof; local tooling prepares and explicitly publishes assets. | Arena workflow boundary. |

## Impact

### Tooling

- `scripts/release.mjs`
  - retain the existing full local gate and `ZIP SYNCED` invariant;
  - after synchronized packaging, prepare checksums, clean source, source
    manifest, and final report under ignored `release/`;
  - record whether preview was executed or explicitly skipped.
- `scripts/release-assets.mjs`
  - pure/deterministic helpers for SHA-256, tracked-source manifest, report
    metadata, and asset verification.
- `scripts/publish-release.mjs`
  - preflight GitHub CLI, pushed commit, green exact-commit CI proof, asset
    presence/checksums, version/tag absence, and clean tree;
  - support a non-publishing dry run;
  - call `gh release create` only with an explicit confirmation flag;
  - fetch uploaded assets afterward and verify their names/sizes/checksums.
- `package.json`
  - add an explicit `publish:release` command; no automatic publication hook.

### Documentation

Update current retention wording in:

- `RELEASES.md`;
- `CONTRIBUTING.md`;
- `agents/arena/workflows/release.md`;
- `skills/internal/openagent-docs/SKILL.md` and its release checklist;
- `docs/README.md`;
- current binding sections of `docs/working-agreement.md`.

Historical lesson entries that truthfully describe the old machine-local archive
remain historical; add a dated amendment rather than rewriting history.

### Not changed

- plugin runtime behavior;
- release version (`0.1.151` for the reconstructed first GitHub Release);
- `.github/workflows/ci.yml`;
- approval/security/model behavior;
- old changelog entries or unavailable historical hashes.

## Phases

### Phase 1 — deterministic asset preparation

Goal: extend the existing verified local release into a complete GitHub asset
set without publishing anything.

Files:

- `scripts/release-assets.mjs` — hash, source archive/manifest, final report,
  asset verification;
- `scripts/release.mjs` — invoke asset preparation after synchronized ZIP;
- tests — deterministic checksum/manifest/report and tamper-failure cases.

Verification:

```text
npm run typecheck
npm test
npm run check:docs
npm run check:skills
```

### Phase 2 — fail-closed GitHub publisher

Goal: publish only an exact, pushed, green, non-existing release.

Files:

- `scripts/publish-release.mjs`;
- `package.json`;
- publisher preflight/dry-run tests.

Preflight must reject:

- dirty tracked source;
- version mismatch;
- missing or tampered asset;
- missing GitHub CLI/authentication;
- target commit not pushed;
- missing/failed CI browser proof for the target;
- existing tag or GitHub Release;
- absent explicit publish confirmation.

### Phase 3 — documentation migration

Goal: remove the dead machine-local retention contract and document GitHub as
the durable source of release assets.

- Link v0.1.151 changelog to its GitHub Release URL.
- State that pre-v0.1.151 local archives were not included in the GitHub upload.
- Amend the documentation audit finding D3 after publication.
- Extend `check:docs` to pin the new retention contract and reject the old
  current-contract path.

### Phase 4 — v0.1.151 publication

1. Push the release-tooling commit and open a PR.
2. Obtain green GitHub CI for the exact release target, including PDF security.
3. Run the full release pipeline. If local Chromium remains unavailable, do not
   weaken the browser gate; use only the publisher's exact-commit green CI proof
   path approved by this plan.
4. Run publisher dry-run and inspect all asset names/checksums.
5. Publish `v0.1.151` with the reconstructed-verification disclosure.
6. Query the GitHub Release back and independently verify uploaded assets.
7. Update the audit remediation note with the release URL.

## GWT

```text
Given npm run release has not produced ZIP SYNCED
When publication is requested
Then the publisher refuses and no tag or GitHub Release is created.

Given an asset byte changes after its checksum is generated
When dry-run or publish preflight executes
Then checksum verification fails before any GitHub mutation.

Given v0.1.151 has no original retained ZIP
When its GitHub Release is created
Then the body says reconstructed and newly verified, never byte-identical to the
missing historical artifact.

Given a tag or release vN already exists
When publication is requested again
Then the command refuses rather than replacing assets or notes.

Given a release is published
When its assets are queried from GitHub
Then all six required names are present and their downloaded bytes match the
published checksum files.
```

## Risks

> [!risk]
> A local staging folder can vanish between Arena sessions. Mitigation: publish
> in the same verified session; GitHub is the durable archive, not `release/`.

> [!risk]
> A draft/publisher script could accidentally mutate GitHub during testing.
> Mitigation: dry-run is default, publication requires an explicit versioned
> confirmation flag, and existing tags/releases are hard failures.

> [!risk]
> Exact original v0.1.151 bytes are unavailable. Mitigation: rebuild from the
> tracked source, rerun gates, publish new checksums, and label the release
> reconstructed rather than pretending historical identity.

> [!risk]
> Local Chromium is unavailable in the current sandbox. Mitigation: existing
> GitHub CI runs the adversarial browser suite; any CI-proof fallback must bind
> to the exact pushed release commit and be recorded in the report.

## Open Questions

- None. Scope and retention layout were approved by the owner on 2026-08-23.
