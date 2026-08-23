# Release workflow

1. Confirm the active source tree is the intended release candidate and every
   tracked change is committed on the session branch.
2. Synchronize version metadata: `manifest.json`, `package.json`,
   `package-lock.json`, `versions.json`, MCP client information, test/runtime
   version assertions, and `RELEASES.md`.
3. Push the exact candidate and obtain green GitHub CI, including the PDF
   browser job. Local browser proof remains the default; the exact-commit CI
   proof path exists only for an environment where Chromium cannot be restored.
4. Run `npm run release`. Do not describe a release as complete unless it ends
   with **ZIP SYNCED** and prepares all six GitHub assets under ignored
   `release/`: install ZIP + checksum, clean-source ZIP + checksum, source
   manifest, and final report.
5. Run `npm run publish:release` first. The dry run must prove: clean tracked
   tree, synchronized version, pushed exact commit, successful exact-commit CI,
   untampered assets, and no existing tag/release.
6. Publish only through the explicit form:
   `npm run publish:release -- --publish --confirm vN`. The publisher creates a
   draft, uploads each asset with bounded retry, verifies every remote byte,
   publishes, then verifies again. Failed drafts are removed.
7. If Arena cannot reach `uploads.github.com`, do not weaken or partially
   publish. The owner copies the reviewed
   `agents/arena/workflows/release-github-actions.yml` template to
   `.github/workflows/release.yml` through GitHub UI after merge, waits for
   green main CI, and dispatches it manually.
8. GitHub Releases is the durable archive. The machine-local `release/`
   directory is staging only; run `npm run clean` after remote verification.
9. Never silently rewrite an existing tag or release. Subsequent source changes
   belong to the next version. Reconstructed historical releases must say so
   and must never claim the missing original artifact checksum.
