# Raw evidence — repo condition audit 2026-08-30

Every block below is live command output captured on 2026-08-30 from the
Arena session branch `arena/01a04ef0-obsidian-openagent` (base = `main` =
`148a4f4`). Companion note: docs/audits/repo-condition-audit-2026-08-30.md.

## Baseline

$ git log --oneline -1 HEAD
148a4f4 Merge pull request #7 from anythinguseful/arena/01a039fd-obsidian-openagent

$ git status --porcelain | wc -l
1

$ node --version
v22.22.3

## Version chain

$ grep -m1 '"version"' manifest.json package.json
manifest.json:	"version": "0.1.155",
package.json:	"version": "0.1.155",

$ python3 -c "import json;d=json.load(open('package-lock.json'));print('lock:',d['version'])"
lock: 0.1.155

$ tail -3 versions.json
	"0.1.154": "1.5.0",
	"0.1.155": "1.5.0"
}

$ grep -n 'clientInfo' src/agent/mcp/client.ts
89:			clientInfo: { name: "openagent", version: "0.1.155" },

## Tags and GitHub Releases

$ git ls-remote --tags origin | tail -5
0ccc352995c8d31b42a8935bfce1d2d25f4d5395	refs/tags/v0.1.151
2940e5b066726380e69659da7df8d0b0004b925c	refs/tags/v0.1.152
f79bcf800a598d3877607ccad498488bcd157e61	refs/tags/v0.1.153
148a4f455da47462ea9e8da49b63f2d1e8abf06f	refs/tags/v0.1.155

$ gh release list --limit 5
Open Agent v0.1.155	Latest	v0.1.155	2026-08-25T18:58:51Z
Open Agent v0.1.153		v0.1.153	2026-08-25T01:24:04Z
Open Agent v0.1.152		v0.1.152	2026-08-24T19:07:40Z
Open Agent v0.1.151		v0.1.151	2026-08-23T17:40:33Z

$ gh release view v0.1.155 --json assets --jq '.assets[].name'
openagent-obsidian-plugin-v0.1.155.zip
openagent-obsidian-plugin-v0.1.155.zip.sha256
openagent-v0.1.155-clean-source.zip
openagent-v0.1.155-clean-source.zip.sha256
openagent-v0.1.155-final-report.md
openagent-v0.1.155-source-manifest.sha256

$ gh run list --branch main --limit 4
completed	success	Publish GitHub Release	Publish GitHub Release	main	workflow_dispatch	32886518842	4m15s	4d
completed	success	Merge pull request #7 from anythinguseful/arena/01a039fd-obsidian-ope…	CI	main	push	32885984040	4m6s	4d
completed	success	Publish GitHub Release	Publish GitHub Release	main	workflow_dispatch	32797104266	4m33s	4d
completed	success	Merge pull request #6 from anythinguseful/arena/01a03535-obsidian-ope…	CI	main	push	32796696633	4m42s	4d

## Tool inventory counted from source

$ grep -c 'toolset: "' src/agent/tools.ts src/agent/terminal/tools.ts
src/agent/tools.ts:24
src/agent/terminal/tools.ts:2

$ grep -o 'name: "[a-z_]*"' src/agent/tools.ts src/agent/terminal/tools.ts | sort -u | wc -l
25

$ grep -n 'tools in .* toggleable toolsets' README.md docs/working-agreement.md scripts/check-docs.mjs
README.md:68:| Tools & toolsets (25 tools) | `src/agent/tools.ts` plus `src/agent/terminal/tools.ts` — 25 tools in 10 toggleable toolsets: **vault** (read_note/write_note/edit_note/delete_note/rename_move_note/list_files/search_vault/get_active_note), **web** (web_extract/web_search), **memory** (save_memory/update_user_profile — add·replace·remove under a char budget · search_memory/session_search), **skills** (create_skill/list_skills/view_skill/manage_skill), **automations** (cronjob), **delegation** (delegate_task), **vision** (vision_analyze), **todo**, **clarify**, and desktop-only **terminal** (terminal/process). Existing toolsets default on; Terminal & Processes defaults off and requires separate first-use consent. |
docs/working-agreement.md:73:   "21 tools in 9 toggleable toolsets", `docs/working-agreement.md`
scripts/check-docs.mjs:45:mustInclude("README.md", "25 tools in 10 toggleable toolsets", "verified tool inventory");

## Lessons log completeness (tolerant parser)

$ python3 - <<'PYEOF'
import re
text = open('docs/working-agreement.md', encoding='utf-8').read()
section = text[text.index('## Lessons log'):]
found = set()
for m in re.finditer(r'^\s*(?:[-*]\s*)?(?:###\s*(\d+)\.|##\s*Lesson\s+(\d+)(?!\d)|[-*]\s*(\d+)\.\s|\*\*(\d+)\.\s|^(\d+)\.\s)', section, re.M):
    n = next(g for g in m.groups() if g)
    found.add(int(n))
gaps = [i for i in range(1, 219) if i not in found]
print(f'unique={len(found)} max={max(found)} gaps={gaps if gaps else "NONE 1..218 complete"}')
PYEOF
unique=218 max=218 gaps=NONE 1..218 complete

## Secret-pattern scan over tracked files

$ git grep -lE '(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z]+ PRIVATE KEY-----)' -- .
test/redact.test.cjs

## Tracked-file hygiene

$ git ls-files | grep -E '^(main\.js|vendor/|release/|preview/|test/dist|coverage)' | wc -l
0

$ git ls-files | wc -l
394

$ git ls-files | while read f; do s=$(stat -c%s "$f" 2>/dev/null); echo "$s $f"; done | sort -rn | head -3
1129264 evidence/audits/chat-audit-contact-sheet.jpg
816001 test/real-preview/settings-audit-probes.json
601283 test/reference-obsidian-app.css

## Branch inventory and the unmerged commit

$ git ls-remote --heads origin | sed 's|.*refs/heads/||'
arena/01a02f3f-obsidian-openagent
arena/01a02fb9-obsidian-openagent
arena/01a02fd1-obsidian-openagent
arena/01a034f2-obsidian-openagent
arena/01a03535-obsidian-openagent
arena/01a039fd-obsidian-openagent
arena/01a03a54-obsidian-openagent
main

$ git fetch origin arena/01a03a54-obsidian-openagent 2>&1 | tail -1
 * branch            arena/01a03a54-obsidian-openagent -> FETCH_HEAD

$ git log --oneline -2 FETCH_HEAD
c0d5e5b docs: align bootstrap inventory check
148a4f4 Merge pull request #7 from anythinguseful/arena/01a039fd-obsidian-openagent

$ git log --oneline main..FETCH_HEAD
c0d5e5b docs: align bootstrap inventory check

$ git cherry main FETCH_HEAD
+ c0d5e5ba0276ba975c81b57ec84616f7076a88b6

$ git show c0d5e5b --stat | tail -5
    Co-authored-by: arena-agent <297053741+arena-agent@users.noreply.github.com>

 docs/working-agreement.md | 2 +-
 scripts/check-docs.mjs    | 1 +
 2 files changed, 2 insertions(+), 1 deletion(-)

$ git diff main FETCH_HEAD | head -40
diff --git a/docs/working-agreement.md b/docs/working-agreement.md
index 02f3610..5720857 100644
--- a/docs/working-agreement.md
+++ b/docs/working-agreement.md
@@ -70,7 +70,7 @@ apa pun — audit dulu, implementasi belakangan:
    dan riwayatnya.
 2. **Verifikasi artefak handoff kunci.** Cek keberadaan: `.github/workflows/ci.yml`,
    `scripts/check-docs.mjs`, `package.json` script `check:docs`, README
-   "21 tools in 9 toggleable toolsets", `docs/working-agreement.md`
+   "25 tools in 10 toggleable toolsets", `docs/working-agreement.md`
    "Bootstrap sesi GitHub" + Lesson 117, dan `agents/skills/internal/openagent-ui/SKILL.md`
    menunjuk `preview/index.html`. Yang hilang = pekerjaan rekonstruksi.
 3. **Baca dokumen & skill binding.** `docs/working-agreement.md` (seluruh
diff --git a/scripts/check-docs.mjs b/scripts/check-docs.mjs
index 313cc2e..0d431a1 100644
--- a/scripts/check-docs.mjs
+++ b/scripts/check-docs.mjs
@@ -43,6 +43,7 @@ function mustNotInclude(rel, needle, label) {
 
 /* Public entry points and maintained workflow. */
 mustInclude("README.md", "25 tools in 10 toggleable toolsets", "verified tool inventory");
+mustInclude("docs/working-agreement.md", "25 tools in 10 toggleable toolsets", "GitHub bootstrap verifies the current tool inventory");
 mustInclude("README.md", "vendor/pdf.worker.min.js", "manual installation keeps the PDF worker");
 mustInclude("CONTRIBUTING.md", "npm run verify", "documented contributor gate");
 mustInclude("SECURITY.md", "CVE-2024-4367", "documented PDF security boundary");

## Gates at audit time

$ npm run check:docs 2>&1 | tail -2
40 source/docs checks, 0 failure(s)
All source/docs checks passed.

$ npm run check:skills 2>&1 | tail -2
86 skill checks, 0 failure(s)
All development-skill checks passed.
