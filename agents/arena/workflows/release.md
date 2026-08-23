# Release workflow

1. Confirm the active source tree is the intended release candidate.
2. Synchronize version metadata: `manifest.json`, `package.json`,
   `package-lock.json`, `versions.json`, MCP client information, test/runtime
   version assertions, and `RELEASES.md`.
3. Run `npm run release`. Do not describe a release as complete unless it ends
   with `ZIP SYNCED`.
4. Archive the verified installable ZIP, clean-source ZIP, checksum files,
   source manifest, and final report under the release retention location.
5. Run `npm run clean` only after the archived release artifact is independently
   checksum-verified.
6. Do not silently rewrite an already published release. Subsequent source
   changes belong to the next version.
