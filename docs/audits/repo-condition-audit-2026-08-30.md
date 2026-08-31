---
title: "Repo condition audit — post v0.1.155"
type: audit
status: done
date: 2026-08-30
tags: [openagent, audit, repo, release, hygiene, handoff]
---

# Repo condition audit — post v0.1.155

## Scope and conclusion

Read-only condition audit of the repository at `main` = `148a4f4`
(v0.1.155, PR #7 merged), performed on 2026-08-30 from a fresh Arena session
before any code change. Conclusion: **the repository is healthy** — the
version chain, release proof, CI history, tree hygiene, documentation
contracts, and the Lessons log all verify clean. No code defect was found.
Three findings remain open as owner decisions; none of them affect the
running plugin:

1. A finished, **unshipped commit** sits on an unmerged remote branch
   (`arena/01a03a54-obsidian-openagent`).
2. **v0.1.154 has no tag and no GitHub Release** although `versions.json` and
   `RELEASES.md` record it; its content shipped inside PR #7.
3. The per-release **"Release archive:" lines in `RELEASES.md` are stale**
   for the versions that were published.

## Method and limits

- GitHub session bootstrap per the working agreement: `git fetch --prune`,
  PR inventory (`gh pr list --state all`), remote-tag verification, and the
  handoff-artifact inventory (`.github/workflows/ci.yml`,
  `scripts/check-docs.mjs`, `check:docs` script, README tool inventory,
  `agents/skills/internal/openagent-ui/SKILL.md` → `preview/index.html`).
- Full baseline re-run in-session: `npm ci`, `npm run typecheck`,
  `npm run build`, `npm test` (1,900 ✓ / 0 ✗), `npm run check:docs`
  (40 checks), `npm run check:skills` (86 checks) — all green.
- Read-only verification: version chain (manifest / package / lock /
  versions.json / MCP `clientInfo`), tags and GitHub Release assets, README
  tool inventory recounted from `src/agent/tools.ts` +
  `src/agent/terminal/tools.ts` (25 tools in 10 toolsets — matches),
  Lessons-log numbering parsed 1–218 with a format-tolerant parser
  (no gaps), secret-pattern scan over tracked files (only the synthetic
  patterns inside `test/redact.test.cjs` match), `.gitignore` coverage,
  tracked-file sizes, and remote-branch inventory.
- Not covered: a fresh `npm run release` pipeline run (release proof was
  taken from the published GitHub Release and CI instead), runtime behavior
  inside Obsidian, and a line-by-line code review. GitHub-state claims
  reflect 2026-08-30.

## Findings

### 1. Unshipped commit on an unmerged remote branch (most important)

Remote branch `arena/01a03a54-obsidian-openagent` points at `c0d5e5b`
"docs: align bootstrap inventory check" — exactly one commit on top of the
current `main` head, never referenced by any PR (`git cherry main` confirms
it is not in `main`). The commit is small and coherent:

- `docs/working-agreement.md` bootstrap inventory line still says
  "21 tools in 9 toggleable toolsets" on `main` (line 73); the commit fixes
  it to "25 tools in 10", matching the source-verified reality.
- `scripts/check-docs.mjs` gains one `mustInclude` pinning the working
  agreement to the current inventory, so the drift cannot recur silently.

This is the mirror image of Lesson 117: a remote object exists that no
handoff document mentions. The work looks finished; it only lacks transport
(rewrite on this session's branch, or open a PR from the original branch).

### 2. v0.1.154 exists in metadata but has no installable artifact

`versions.json` and `RELEASES.md` both carry a 0.1.154 entry, but there is
no `v0.1.154` tag and no GitHub Release — the release list jumps from
v0.1.153 to v0.1.155. The 0.1.154 content (restore Settings from before
grouping) shipped inside PR #7, which bumped two versions in one merge.
Consequence: nobody can download a v0.1.154 ZIP from GitHub Releases.
Whether this is an accepted intermediate bump or needs a reconstructed
release / a `RELEASES.md` annotation is an owner decision (the
reconstruction path and its honest-disclosure rule are defined in the
release lessons).

### 3. Stale "Release archive:" template lines in `RELEASES.md`

Entries 0.1.151–0.1.155 still read "prepared locally; publication requires
the separate explicit GitHub Release confirmation flow", yet 0.1.151–153
and 0.1.155 **are** published with full asset sets. The sentence was
accurate at write time and was never refreshed after publication. Cosmetic,
but it makes the changelog under-report its own release state.

## Proven vs not proven

- Proven: every claim above is backed by live command output captured in
  the raw evidence file; `git status` there shows exactly one dirty entry —
  the evidence file being written itself.
- Not proven: that the unshipped commit is still *wanted* (only that it is
  finished-shaped and applies cleanly on top of current `main`); and that
  no other remote branch contains work, since branches for PRs #1, #3–#7
  were only checked against the PR list, not content-diffed individually.

## Outcome

Audit recorded; no source, test, or release file was changed. Decisions
pending owner: (a) transport `c0d5e5b` through a PR, (b) disposition of
v0.1.154, (c) refreshing the `RELEASES.md` archive lines.
