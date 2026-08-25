# Release documentation checklist

1. Update `RELEASES.md` with a concise user-facing summary and stable GitHub
   Release link.
2. Run `npm run release` until it prints **ZIP SYNCED** and prepares all six
   ignored staging assets: install ZIP + checksum, clean-source ZIP + checksum,
   source manifest, and final report.
3. Run `npm run publish:release` as a dry run; it must verify the exact pushed
   commit, successful GitHub CI, asset hashes, and absent tag/release.
4. Publish only with explicit version confirmation. GitHub Releases is the
   durable archive; never commit generated binaries or rely on a root-workspace
   folder surviving another session.
5. Query/download the published assets and verify their bytes before cleaning
   local staging.
6. Never rewrite a published release. A reconstructed historical release must
   disclose that the original bytes were unavailable and use newly generated
   checksums.
