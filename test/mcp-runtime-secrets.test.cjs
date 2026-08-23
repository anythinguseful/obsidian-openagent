const fs = require("fs");
const path = require("path");

const runtime = fs.readFileSync(path.join(__dirname, "../src/agent/mcp/runtime.ts"), "utf8");
let failed = 0;
const ok = (v, label) => { if (v) console.log(`✓ ${label}`); else { console.error(`✗ ${label}`); failed++; } };

/* Contract-level witness: secret values must not join configKey, while they
   merge only at the stdio spawn boundary. Runtime integration uses injected
   resolver data; this guard prevents future refactors from reversing that. */
ok(runtime.includes('configKey(name, cfg, Object.keys(secrets))'), "runtime cache key receives secret names, not merged config");
ok(runtime.includes('secretNames.sort()'), "runtime cache key records secret presence deterministically");
ok(!runtime.includes('cfg.env, cfg.url, cfg.headers, secrets'), "runtime cache key never appends secret values");
ok(runtime.includes('mcpEnv({ ...(cfg.env ?? {}), ...secrets })'), "stdio spawn merges secrets only at env boundary");
ok(runtime.includes('resolveSecrets(name)'), "runtime resolves secrets asynchronously per server");

if (failed) process.exit(1);
console.log("All MCP runtime secret-boundary checks passed.");
