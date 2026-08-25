# Arena Agent Workflow

Arena Agent does not use a durable, repository-supported `.arena/` skill
format. In this workspace, `.arena/` is excluded from persisted snapshots.

The portable workflow is therefore:

1. An agent discovers this repository through root `AGENTS.md`.
2. `AGENTS.md` routes the task to the tracked development skills in `skills/`.
3. `skills/manifest.yaml` declares each skill's scope, priority, and source.
4. These workflow notes supply repeatable procedures for audit, docs, and
   release work.

The tracked `skills/` directory is for developing this plugin. It is separate
from runtime skills that the Open Agent plugin can install into an end user's
Obsidian vault.

## Chromium bootstrap for Arena workspaces

**Arena-only environment procedure (verified 2026-08-25).** Some Arena
workspaces cannot install Playwright Chromium through its CDN or `apt`: Debian
package mirrors may be unreachable, while `registry.npmjs.org` remains
reachable. This is an environment limitation, not a project dependency or a
reason to skip browser proof.

Use the following procedure before `test/real-preview/build-settings.mjs`,
`npm run test:pdf-security`, or `npm run release` when Playwright reports that
its executable is missing:

```bash
# node_modules can disappear between Arena messages; restore it first when absent.
test -d node_modules || npm ci

rm -rf /tmp/chromium-pkg
mkdir -p /tmp/chromium-pkg
npm pack @sparticuz/chromium@149.0.0 --pack-destination /tmp/chromium-pkg
tar -xzf /tmp/chromium-pkg/sparticuz-chromium-149.0.0.tgz -C /tmp/chromium-pkg

# Resolve the installed Playwright revision. chromium.executablePath() names
# the full-browser cache path, but chromium.launch() in headless mode probes a
# sibling headless-shell path, so populate BOTH without hardcoding the revision.
export PLAYWRIGHT_BIN="$(node -e "const { chromium } = require('playwright'); console.log(chromium.executablePath())")"
export PLAYWRIGHT_CACHE_ROOT="$(dirname "$(dirname "$(dirname "$PLAYWRIGHT_BIN")")")"
export PLAYWRIGHT_REV="$(basename "$(dirname "$(dirname "$PLAYWRIGHT_BIN")")")"
export PLAYWRIGHT_REV="${PLAYWRIGHT_REV#chromium-}"
export PLAYWRIGHT_HEADLESS_BIN="$PLAYWRIGHT_CACHE_ROOT/chromium_headless_shell-$PLAYWRIGHT_REV/chrome-headless-shell-linux64/chrome-headless-shell"
mkdir -p "$(dirname "$PLAYWRIGHT_BIN")" "$(dirname "$PLAYWRIGHT_HEADLESS_BIN")" /tmp/chromium-pkg/nss

node - <<'NODE'
const fs = require('fs');
const zlib = require('zlib');
const base = '/tmp/chromium-pkg/package/bin';
const binary = zlib.brotliDecompressSync(fs.readFileSync(`${base}/chromium.br`));
fs.writeFileSync(process.env.PLAYWRIGHT_BIN, binary);
fs.writeFileSync(process.env.PLAYWRIGHT_HEADLESS_BIN, binary);
fs.writeFileSync('/tmp/chromium-pkg/al2023.tar', zlib.brotliDecompressSync(fs.readFileSync(`${base}/al2023.tar.br`)));
NODE
chmod +x "$PLAYWRIGHT_BIN" "$PLAYWRIGHT_HEADLESS_BIN"
tar -xf /tmp/chromium-pkg/al2023.tar -C /tmp/chromium-pkg/nss
```

Run every Playwright command with the NSS libraries:

```bash
LD_LIBRARY_PATH=/tmp/chromium-pkg/nss/lib node -e "const { chromium } = require('playwright'); (async () => { const b = await chromium.launch(); const p = await b.newPage(); console.log(await p.evaluate('navigator.userAgent')); await b.close(); })()"
LD_LIBRARY_PATH=/tmp/chromium-pkg/nss/lib node test/real-preview/build-settings.mjs
LD_LIBRARY_PATH=/tmp/chromium-pkg/nss/lib npm run release
```

The first command must print `HeadlessChrome/149` before treating browser proof
as available. The unpacked binary, NSS libraries, Playwright cache, browser
shots, and release artifacts are intentionally outside tracked source (or
ignored): Arena can reset them between messages. Recreate them as needed; never
commit them and do not add an `.arena/` contract.
