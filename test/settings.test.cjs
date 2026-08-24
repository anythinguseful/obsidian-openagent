/**
 * Unit tests for the mcp.json helpers in src/settings.ts
 * (parseMcpServersDoc / migrateMcpServers / kvToLines / linesToKv).
 * settings.ts has no obsidian imports, so it bundles standalone.
 */

const path = require("path");
const { execSync } = require("child_process");

const out = path.join(__dirname, "dist", "settings.cjs");
execSync(
	`npx esbuild ${path.join(__dirname, "..", "src", "settings.ts")} --bundle --platform=node --format=cjs --outfile=${out}`,
	{ stdio: "inherit" }
);

const {
	parseMcpServersDoc,
	migrateMcpServers,
	kvToLines,
	linesToKv,
	DEFAULT_SETTINGS,
	EXPORT_SCHEMA_VERSION,
	normalizeLoadedSettings,
	restorePersistedTerminalConsent,
	restorePersistedMcpConsent,
	redactSettingsSecrets,
	buildSettingsExport,
	parseSettingsExport,
	buildProfileExport,
	parseProfileExport,
	uniqueProfileName,
	sanitizeSnippets,
} = require(out);

let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};

/* ---------- parseMcpServersDoc ---------- */

const doc = parseMcpServersDoc(
	JSON.stringify({
		mcpServers: {
			filesystem: {
				command: "npx",
				args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
				env: { DEBUG: true, LIMIT: 5 },
			},
			remote: { url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer x" }, enabled: false },
		},
	})
);
check(doc.filesystem.command === "npx", "parse: stdio command");
check(doc.filesystem.args.length === 3, "parse: args array");
check(doc.filesystem.env.DEBUG === "true" && doc.filesystem.env.LIMIT === "5", "parse: env values stringified");
check(doc.filesystem.enabled === true, "parse: enabled defaults true");
check(doc.remote.url === "https://mcp.example.com/mcp", "parse: url kept");
check(doc.remote.headers.Authorization === "Bearer x", "parse: headers kept");
check(doc.remote.enabled === false, "parse: explicit disabled honored");

const snake = parseMcpServersDoc(JSON.stringify({ mcp_servers: { a: { command: "x" } } }));
check(snake.a.command === "x", "parse: mcp_servers snake-case wrapper accepted");

const bare = parseMcpServersDoc(JSON.stringify({ b: { type: "http", url: "http://x" } }));
check(bare.b.transport === "http", "parse: bare map + type→transport normalization");

let threw = false;
try {
	parseMcpServersDoc("{ not json");
} catch {
	threw = true;
}
check(threw, "parse: invalid JSON throws");

threw = false;
try {
	parseMcpServersDoc(JSON.stringify({ mcpServers: {} }));
} catch {
	threw = true;
}
check(threw, "parse: empty mcpServers throws");

/* ---------- migrateMcpServers ---------- */

const legacy = migrateMcpServers([
	{ id: "mcp-1", name: "filesystem", command: "npx", args: "-y server /tmp", env: "A=1\nB=2", enabled: true },
	{ id: "mcp-2", name: "", command: "python srv.py", args: "", env: "", enabled: false },
]);
check(legacy.filesystem.command === "npx", "migrate: legacy name becomes key");
check(legacy.filesystem.args.length === 3, "migrate: args string split");
check(legacy.filesystem.env.A === "1" && legacy.filesystem.env.B === "2", "migrate: env lines → record");
check(legacy["mcp-2"].enabled === false, "migrate: empty name falls back to id, disabled kept");

const dup = migrateMcpServers([
	{ id: "1", name: "x", command: "a", args: "", env: "", enabled: true },
	{ id: "2", name: "x", command: "b", args: "", env: "", enabled: true },
]);
check(dup.x.command === "a" && dup["x-2"].command === "b", "migrate: duplicate names disambiguated");

const round = migrateMcpServers({ prod: { url: "http://p", enabled: true } });
check(round.prod.url === "http://p", "migrate: map input passes through normalized");
check(Object.keys(migrateMcpServers("junk")).length === 0, "migrate: junk → empty map");
check(Object.keys(migrateMcpServers(undefined)).length === 0, "migrate: undefined → empty map");

/* ---------- kv helpers ---------- */

check(kvToLines({ A: "1", B: "two words" }) === "A=1\nB=two words", "kvToLines joins with newlines");
check(kvToLines(undefined) === "", "kvToLines(undefined) empty");
const kv = linesToKv("A=1\n B = spaced \nno-equals-line\n=x\nC=v=a=l");
check(kv.A === "1" && kv.B === "spaced" && !("no-equals-line" in kv) && kv.C === "v=a=l", "linesToKv tolerant parsing");

/* ---------- normalizeLoadedSettings (load = import single pipeline) ---------- */

const normDefault = normalizeLoadedSettings({});
check(normDefault.providers.length === DEFAULT_SETTINGS.providers.length, "normalize({}): preset providers present");
check(normDefault.profiles.length === 1 && normDefault.activeProfileId === "default", "normalize({}): single Default profile");
check(normDefault.toolsets.automations === true, "normalize({}): toolsets default on");

/* v0.1.147 safety: approval timeout + redact + checkpoints */
check(normDefault.approvalTimeoutSec === 0, "normalize({}): approval timeout default off");

/* v0.1.147 web search */
check(normDefault.webSearch.backend === "ddgs" && normDefault.webSearch.braveKey === "" && normDefault.webSearch.tavilyKey === "", "normalize({}): webSearch defaults to ddgs, no keys");
const wsDirty = normalizeLoadedSettings({ webSearch: { backend: "bogus", braveKey: " K \u0000", tavilyKey: "T", searxngUrl: "not-a-url" } });
check(wsDirty.webSearch.backend === "ddgs", "normalize: invalid backend coerced to ddgs");
check(wsDirty.webSearch.braveKey === "", "normalize: control-char key dropped");
check(wsDirty.webSearch.tavilyKey === "T", "normalize: valid key kept");
check(wsDirty.webSearch.searxngUrl === "", "normalize: non-http(s) URL dropped");
const wsExport = buildSettingsExport(normalizeLoadedSettings({ webSearch: { backend: "brave", braveKey: "SECRET", tavilyKey: "T2" } }), false);
check(wsExport.settings.webSearch.braveKey === "" && wsExport.settings.webSearch.tavilyKey === "", "settings export: web search keys redacted");
check(normDefault.redactSecrets === true && normDefault.checkpointsEnabled === true, "normalize({}): redact + checkpoints default on");
const safetyDirty = normalizeLoadedSettings({ approvalTimeoutSec: 9999, redactSecrets: false, checkpointsEnabled: "nope" });
check(safetyDirty.approvalTimeoutSec === 600, "normalize: approval timeout clamped to 600");
check(safetyDirty.redactSecrets === false, "normalize: explicit false respected");
check(safetyDirty.checkpointsEnabled === true, "normalize: malformed checkpoints fails to safe default");

/* v0.1.148 memory budgets: clamped to 500–20,000, malformed → default. */
check(normDefault.memoryCharLimit === 4000 && normDefault.userCharLimit === 2500, "normalize({}): memory budgets default 4000/2500");
const memDirty = normalizeLoadedSettings({ memoryCharLimit: 999999, userCharLimit: 1 });
check(memDirty.memoryCharLimit === 20000, "normalize: memory budget clamped to 20,000");
check(memDirty.userCharLimit === 500, "normalize: profile budget clamped to 500");
const memBad = normalizeLoadedSettings({ memoryCharLimit: "nope", userCharLimit: null });
check(memBad.memoryCharLimit === 4000 && memBad.userCharLimit === 2500, "normalize: malformed budgets fall back to defaults");

/* v0.1.178: embedding model is trimmed and bounded, defaults empty */
check(normDefault.memoryEngineEmbedModel === "", "normalize({}): embedding model defaults empty");
check(normalizeLoadedSettings({ memoryEngineEmbedModel: "  embedding-gemma-300m  " }).memoryEngineEmbedModel === "embedding-gemma-300m", "normalize: embedding model trimmed");
check(normalizeLoadedSettings({ memoryEngineEmbedModel: 42 }).memoryEngineEmbedModel === "", "normalize: non-string embedding model → empty");
check(normalizeLoadedSettings({ memoryEngineRecallMax: 99 }).memoryEngineRecallMax === 20, "normalize: recall budget clamped to 20");

/* v0.1.152 (owner 2026-08-24 "ada main model dan embedding model"): embedding
   now carries its OWN provider pin, so a local embedding server can serve
   recall while chat runs elsewhere. The pin must obey the same stale-pin
   hygiene as the aux slots, and — the trap this caught during development —
   it must be sanitized AFTER the preset merge builds s.providers. Sanitized
   any earlier, every real provider id looks dangling and gets wiped. */
check(normDefault.memoryEngineEmbedProviderId === "", "normalize({}): embedding provider defaults empty (follow chat provider)");
{
	/* A real data.json stores only the keys the user actually touched, so a
	   provider entry routinely arrives with NO baseUrl — the preset merge is
	   what supplies it. Pinning such a provider is therefore the case that
	   proves the sanitize runs after that merge: before it, s.providers is
	   still the raw loaded array and p.baseUrl is undefined. */
	const pinned = normalizeLoadedSettings({
		providers: [{ id: "lmstudio", apiKey: "x" }],
		memoryEngineEmbedProviderId: "lmstudio",
	});
	check(pinned.memoryEngineEmbedProviderId === "lmstudio", "normalize: embedding pin SURVIVES a provider whose base URL comes from the preset merge");
}
{
	const dangling = normalizeLoadedSettings({ memoryEngineEmbedProviderId: "no-such-provider" });
	check(dangling.memoryEngineEmbedProviderId === "", "normalize: embedding pin to an unknown provider falls back to the chat provider");
}
{
	/* a provider with no base URL cannot answer /v1/embeddings — keeping the
	   pin would send recall to a dead endpoint instead of degrading to keyword */
	const noUrl = normalizeLoadedSettings({
		providers: [{ id: "lmstudio", baseUrl: "" }],
		memoryEngineEmbedProviderId: "lmstudio",
	});
	check(noUrl.memoryEngineEmbedProviderId === "", "normalize: embedding pin dropped when the provider has no base URL");
}
check(normalizeLoadedSettings({ memoryEngineEmbedProviderId: 42 }).memoryEngineEmbedProviderId === "", "normalize: non-string embedding provider → empty");

/* v0.1.175: compression target_ratio default + out-of-range → fallback
   (same reject+fallback pattern as the sibling compressionThreshold) */
check(normDefault.compressionTargetRatio === 0.2, "normalize({}): compression target_ratio defaults to 0.20");
check(normalizeLoadedSettings({ compressionTargetRatio: 0.9 }).compressionTargetRatio === 0.2, "normalize: target_ratio > 0.5 falls back to 0.20");
check(normalizeLoadedSettings({ compressionTargetRatio: 0.01 }).compressionTargetRatio === 0.2, "normalize: target_ratio < 0.05 falls back to 0.20");
check(normalizeLoadedSettings({ compressionTargetRatio: "junk" }).compressionTargetRatio === 0.2, "normalize: malformed target_ratio falls back to 0.20");

/* v0.1.193: threshold/protect_last_n realigned to Hermes config_defaults
   (compression.threshold 0.50, compression.protect_last_n 20; verified
   2026-08-24). At the old 0.8/4 a chat compacted very late and kept almost
   nothing, so a long session could overflow the provider window mid-tool-call.
   Both the default AND the sanitize fallback must land on the new value —
   they used to be two separate literals, which is exactly how they drift. */
check(normDefault.compressionThreshold === 0.5, "normalize({}): compression threshold defaults to 0.50 (Hermes)");
check(normDefault.compressionProtectLastN === 20, "normalize({}): protect_last_n defaults to 20 (Hermes)");
check(normalizeLoadedSettings({ compressionThreshold: 1.5 }).compressionThreshold === 0.5, "normalize: out-of-range threshold falls back to 0.50");
check(normalizeLoadedSettings({ compressionThreshold: "junk" }).compressionThreshold === 0.5, "normalize: malformed threshold falls back to 0.50");
check(normalizeLoadedSettings({ compressionProtectLastN: 99 }).compressionProtectLastN === 20, "normalize: out-of-range protect_last_n falls back to 20");
check(normalizeLoadedSettings({ compressionProtectLastN: "junk" }).compressionProtectLastN === 20, "normalize: malformed protect_last_n falls back to 20");
/* a vault that already saved a legal value keeps it — this is a default
   change, not a forced migration */
check(normalizeLoadedSettings({ compressionThreshold: 0.8 }).compressionThreshold === 0.8, "normalize: saved threshold 0.80 survives the default change");
check(normalizeLoadedSettings({ compressionProtectLastN: 4 }).compressionProtectLastN === 4, "normalize: saved protect_last_n 4 survives the default change");

/* v0.1.150 appearance: enums fall back to defaults, default-ON toggles keep
   current behaviour when absent, default-OFF toggles fail closed. */
check(
	normDefault.toolViewMode === "collapsed" && normDefault.reasoningCollapsedByDefault === false &&
		normDefault.sessionListDensity === "comfortable" && normDefault.showIntroScreen === true && normDefault.showReactions === true,
	"normalize({}): appearance defaults preserve current behaviour"
);
const appDirty = normalizeLoadedSettings({
	toolViewMode: "bogus",
	reasoningCollapsedByDefault: true,
	sessionListDensity: "compact",
	showIntroScreen: false,
	showReactions: "nope",
});
check(appDirty.toolViewMode === "collapsed", "normalize: invalid toolViewMode → collapsed");
check(appDirty.reasoningCollapsedByDefault === true, "normalize: reasoningCollapsedByDefault === true respected");
check(appDirty.sessionListDensity === "compact", "normalize: compact density respected");
check(appDirty.showIntroScreen === false, "normalize: explicit false hides the intro");
check(appDirty.showReactions === true, "normalize: malformed showReactions fails to ON default (absent behaviour)");

/* v0.1.161 chat panel location: enum, invalid → right-sidebar default. */
check(normDefault.chatLeafLocation === "right", "normalize({}): chat panel defaults to the right sidebar");
const leafDirty = normalizeLoadedSettings({ chatLeafLocation: "bogus" });
check(leafDirty.chatLeafLocation === "right", "normalize: invalid chatLeafLocation → right");
const leafMain = normalizeLoadedSettings({ chatLeafLocation: "main" });
check(leafMain.chatLeafLocation === "main", "normalize: chatLeafLocation main respected");
const leafLeft = normalizeLoadedSettings({ chatLeafLocation: "left" });
check(leafLeft.chatLeafLocation === "left", "normalize: chatLeafLocation left respected");

/* v0.1.151 advanced: bounded integers, malformed → defaults. */
check(normDefault.checkpointMaxSnapshots === 30 && normDefault.toolOutputMaxChars === 5000, "normalize({}): checkpoint/tool-output defaults 30/5000");
const advDirty = normalizeLoadedSettings({ checkpointMaxSnapshots: 9999, toolOutputMaxChars: 1 });
check(advDirty.checkpointMaxSnapshots === 200, "normalize: checkpoint max clamped to 200");
check(advDirty.toolOutputMaxChars === 1000, "normalize: tool output limit clamped to 1,000");
const advBad = normalizeLoadedSettings({ checkpointMaxSnapshots: "x", toolOutputMaxChars: null });
check(advBad.checkpointMaxSnapshots === 30 && advBad.toolOutputMaxChars === 5000, "normalize: malformed advanced limits fall back to defaults");
check(
	normDefault.toolsets.terminal === false &&
		normDefault.terminal.backend === "docker" &&
		normDefault.terminal.consentVersion === 0 &&
		normDefault.terminal.localExpertEnabled === false,
	"normalize({}): terminal is Docker-configured but disabled and unconsented by default"
);
const terminalWithoutConsent = normalizeLoadedSettings({ toolsets: { terminal: true }, terminal: { consentVersion: 0 } });
check(terminalWithoutConsent.toolsets.terminal === false, "normalize: imported terminal switch cannot bypass versioned consent");
const terminalReceipt = "a".repeat(64);
const terminalPersistedRaw = {
	toolsets: { terminal: true },
	terminal: {
		backend: "local",
		dockerImage: " example/image:1 ",
		consentVersion: 1,
		consentReceipt: terminalReceipt,
		localExpertEnabled: true,
		injectedFlag: true,
	},
};
const terminalImported = normalizeLoadedSettings(terminalPersistedRaw);
check(
	terminalImported.toolsets.terminal === false &&
		terminalImported.terminal.consentVersion === 0 &&
		terminalImported.terminal.consentReceipt === "" &&
		terminalImported.terminal.backend === "local" &&
		terminalImported.terminal.dockerImage === "example/image:1" &&
		terminalImported.terminal.localExpertEnabled === true &&
		!("injectedFlag" in terminalImported.terminal),
	"normalize: imported/hand-edited consent fails closed while bounded execution settings survive"
);
const terminalRestored = restorePersistedTerminalConsent(
	normalizeLoadedSettings(terminalPersistedRaw),
	terminalPersistedRaw,
	terminalReceipt
);
check(
	terminalRestored.toolsets.terminal === true &&
		terminalRestored.terminal.consentVersion === 1 &&
		terminalRestored.terminal.consentReceipt === terminalReceipt,
	"terminal consent: exact separate per-vault receipt restores normal persisted consent"
);
const terminalReceiptMismatch = restorePersistedTerminalConsent(
	normalizeLoadedSettings(terminalPersistedRaw),
	terminalPersistedRaw,
	"b".repeat(64)
);
check(
	terminalReceiptMismatch.toolsets.terminal === false && terminalReceiptMismatch.terminal.consentVersion === 0,
	"terminal consent: missing/mismatched ledger receipt cannot restore hand-edited state"
);

/* v0.1.147 MCP consent: same fail-closed shape */
const mcpReceipt = "a".repeat(64);
const mcpPersistedRaw = { mcpEnabled: true, mcpConsent: { consentVersion: 1, consentReceipt: mcpReceipt } };
const mcpRestored = restorePersistedMcpConsent(normalizeLoadedSettings(mcpPersistedRaw), mcpPersistedRaw, mcpReceipt);
check(mcpRestored.mcpConsent.consentVersion === 1 && mcpRestored.mcpConsent.consentReceipt === mcpReceipt, "mcp consent: exact ledger receipt restores");
const mcpMismatch = restorePersistedMcpConsent(normalizeLoadedSettings(mcpPersistedRaw), mcpPersistedRaw, "b".repeat(64));
check(mcpMismatch.mcpConsent.consentVersion === 0, "mcp consent: mismatched ledger receipt cannot restore");
check(normalizeLoadedSettings({ mcpConsent: { consentVersion: 1, consentReceipt: mcpReceipt } }).mcpConsent.consentVersion === 0, "mcp consent: normalize always fails closed");
const terminalDirty = normalizeLoadedSettings({
	toolsets: { terminal: "yes" },
	terminal: { backend: "host", dockerImage: "bad\nimage", consentVersion: 99, localExpertEnabled: 1 },
});
check(
	terminalDirty.toolsets.terminal === false &&
		terminalDirty.terminal.backend === "docker" &&
		terminalDirty.terminal.dockerImage === DEFAULT_SETTINGS.terminal.dockerImage &&
		terminalDirty.terminal.consentVersion === 0 &&
		terminalDirty.terminal.consentReceipt === "" &&
		terminalDirty.terminal.localExpertEnabled === false,
	"normalize: malformed terminal/import values fail closed"
);
check(Array.isArray(normDefault.cronTasks) && normDefault.cronTasks.length === 0, "normalize({}): no cron tasks");
check(normDefault.personality === "none", "normalize({}): global personality defaults to none");

const normLegacy = normalizeLoadedSettings({
	toolsets: { vault: false }, // new toolsets must still default on
	cronTasks: [{ intervalMinutes: 30, name: "legacy", prompt: "p", targetNote: "t" }],
	activeProviderId: "openai",
});
check(normLegacy.toolsets.vault === false && normLegacy.toolsets.web === true, "normalize: toolsets deep-merged");
check(normLegacy.cronTasks.length === 1 && normLegacy.cronTasks[0].schedule.expr === "*/30 * * * *", "normalize: legacy cron migrated");
check(normLegacy.activeProviderId === "openai", "normalize: scalar prefs kept");

/* ---------- redactSettingsSecrets / buildSettingsExport ---------- */

const withSecrets = normalizeLoadedSettings({});
withSecrets.providers[0].apiKey = "sk-secret";
withSecrets.providers[0].customHeaders = { Authorization: "Bearer abc", "X-Team": "blue" };
withSecrets.terminal.consentVersion = 1;
withSecrets.terminal.consentReceipt = terminalReceipt;
withSecrets.toolsets.terminal = true;
const redacted = redactSettingsSecrets(withSecrets);
check(redacted.providers[0].apiKey === "", "redact: apiKey stripped");
check(redacted.providers[0].customHeaders.Authorization === "", "redact: Authorization header stripped");
check(redacted.providers[0].customHeaders["X-Team"] === "blue", "redact: non-secret header kept");
check(withSecrets.providers[0].apiKey === "sk-secret", "redact: original untouched (deep copy)");

/* MCP servers: secret-shaped env + sensitive headers are blanked on export. */
withSecrets.mcpServers = {
	n8n: {
		enabled: true,
		transport: "stdio",
		command: "python",
		env: { N8N_API_KEY: "n8n-secret", N8N_BASE_URL: "http://127.0.0.1:5678" },
	},
	remote: {
		enabled: true,
		transport: "http",
		url: "https://mcp.example.com/mcp",
		headers: { Authorization: "Bearer tok", "X-Client": "oa" },
	},
};
const mcpRedacted = redactSettingsSecrets(withSecrets);
check(mcpRedacted.mcpServers.n8n.env.N8N_API_KEY === "", "redact: MCP secret-shaped env blanked");
check(mcpRedacted.mcpServers.n8n.env.N8N_BASE_URL === "http://127.0.0.1:5678", "redact: MCP non-secret env kept");
check(mcpRedacted.mcpServers.remote.headers.Authorization === "", "redact: MCP Authorization header blanked");
check(mcpRedacted.mcpServers.remote.headers["X-Client"] === "oa", "redact: MCP non-secret header kept");

const docExport = buildSettingsExport(withSecrets, false, "0.1.0");
check(docExport.openagentExport === "settings" && docExport.version === EXPORT_SCHEMA_VERSION, "export doc: type + schema version");
check(docExport.redacted === true, "export doc: redaction flagged");
check(docExport.settings.hubCache === undefined, "export doc: hubCache excluded");
check(docExport.settings.providers[0].apiKey === "", "export doc: payload redacted");
check(
	docExport.settings.toolsets.terminal === false &&
		docExport.settings.terminal.consentVersion === 0 &&
		docExport.settings.terminal.consentReceipt === undefined,
	"export doc: terminal enablement and private first-use receipt are never portable"
);
const docFull = buildSettingsExport(withSecrets, true, "0.1.0");
check(docFull.redacted === false && docFull.settings.providers[0].apiKey === "sk-secret", "export doc: includeKeys keeps secrets");
check(
	docFull.settings.toolsets.terminal === false &&
		docFull.settings.terminal.consentVersion === 0 &&
		docFull.settings.terminal.consentReceipt === undefined,
	"export doc: includeKeys still excludes terminal consent capability"
);

/* round-trip: export(redacted) → import → normalize behaves like app load */
const roundTrip = normalizeLoadedSettings(parseSettingsExport(JSON.stringify(docExport)));
check(roundTrip.providers.length === withSecrets.providers.length, "round-trip: providers merged by preset");
check(roundTrip.providers[0].apiKey === "", "round-trip: redacted key imports as empty (not sentinel junk)");

/* ---------- parse rejection paths ---------- */

const expectThrow = (label, fn, msgPart) => {
	try {
		fn();
		check(false, label);
	} catch (e) {
		check(String(e.message).includes(msgPart), `${label} (“${e.message}”)`);
	}
};
expectThrow("import: invalid JSON", () => parseSettingsExport("{ nope"), "Not valid JSON");
expectThrow("import: not an export", () => parseSettingsExport("{}"), "Not an Open Agent export");
expectThrow(
	"import: newer version",
	() => parseSettingsExport(JSON.stringify({ openagentExport: "settings", version: 99, settings: {} })),
	"newer version"
);
expectThrow(
	"import: profile file into settings",
	() => parseSettingsExport(JSON.stringify({ openagentExport: "profile", version: 1, profile: { name: "x" } })),
	"Profiles tab"
);
expectThrow(
	"import: settings file into profiles",
	() => parseProfileExport(JSON.stringify({ openagentExport: "settings", version: 1, settings: {} })),
	"General tab"
);

/* ---------- profile (soul) bundle ---------- */

const prof = normalizeLoadedSettings({}).profiles[0];
prof.soul = "You are meticulous.";
const bundle = buildProfileExport(prof, [
	{ name: "vault-digest", whenToUse: "daily summaries", instructions: "1. list files…" },
	{ name: "", whenToUse: "", instructions: "junk-entry-dropped" },
]);
check(bundle.openagentExport === "profile" && bundle.profile.skills.length === 1, "bundle: junk skills dropped");
const parsedProfile = parseProfileExport(JSON.stringify(bundle));
check(parsedProfile.name === "Default" && parsedProfile.soul === "You are meticulous.", "bundle: soul round-trips");
check(parsedProfile.providerId === null && parsedProfile.color === "blue", "bundle: pins/color round-trip");
check(parsedProfile.skills[0].name === "vault-digest", "bundle: skill round-trips");

const dirty = parseProfileExport(
	JSON.stringify({ openagentExport: "profile", version: 1, profile: { name: "  X  ", color: "neon", personality: "bogus", providerId: 42 } })
);
check(dirty.name === "X" && dirty.color === "gray" && !("personality" in dirty) && dirty.providerId === null, "bundle: dirty fields sanitized, personality dropped");
expectThrow("bundle: nameless rejected", () => parseProfileExport(JSON.stringify({ openagentExport: "profile", version: 1, profile: {} })), "no profile name");
expectThrow(
	"bundle: malformed declared skill rejects the whole bundle",
	() => parseProfileExport(JSON.stringify({
		openagentExport: "profile",
		version: 1,
		profile: { name: "X", skills: [{ name: "valid", instructions: "ok" }, { name: "broken", instructions: "" }] },
	})),
	"skill 2"
);
expectThrow(
	"bundle: non-array skills rejected",
	() => parseProfileExport(JSON.stringify({ openagentExport: "profile", version: 1, profile: { name: "X", skills: {} } })),
	"skills must be an array"
);

/* ---------- dedupe on normalize (aged/hand-edited data.json) ---------- */

const dupes = normalizeLoadedSettings({
	promptSnippets: [
		{ id: "a", title: "first", text: "one" },
		{ id: "a", title: "dup", text: "two" },
		{ id: "b", title: "other", text: "three" },
	],
	cronTasks: [
		{ id: "c1", name: "task", prompt: "p", targetNote: "t", schedule: { kind: "cron", expr: "0 9 * * *" } },
		{ id: "c1", name: "task DUP", prompt: "p", targetNote: "t", schedule: { kind: "cron", expr: "0 10 * * *" } },
	],
	hubTaps: ["owner/repo", " owner/repo ", "other/tap", 42],
	favoriteModels: ["m1", "m1", " m2 ", "m2", "", 7],
	fallbackProviders: [
		{ providerId: "ollama", model: "qwen" },
		{ providerId: "ollama", model: "qwen" },
		{ providerId: "ollama", model: "llama" },
		{ bogus: true },
	],
});
check(dupes.promptSnippets.length === 2 && dupes.promptSnippets[0].title === "first", "dedupe: snippet ids collapse, first wins");
check(dupes.cronTasks.length === 1 && dupes.cronTasks[0].name === "task", "dedupe: cron ids collapse, first wins");
check(JSON.stringify(dupes.hubTaps) === JSON.stringify(["owner/repo", "other/tap"]), "dedupe: hub taps by repo, junk dropped");
/* per-provider catalogs (v0.1.14): the legacy GLOBAL favoriteModels list is
   folded onto the ACTIVE provider's catalog (default active = openrouter),
   trimmed/collapsed, and the legacy key is gone afterwards */
check(dupes.favoriteModels === undefined, "catalogs: legacy favoriteModels key deleted on load");
check(
	JSON.stringify((dupes.providers.find((p) => p.id === "openrouter") ?? {}).models) === JSON.stringify(["m1", "m2"]),
	"catalogs: legacy global list folded onto the ACTIVE provider, trimmed+collapsed"
);
check(
	dupes.fallbackProviders.length === 2 &&
		dupes.fallbackProviders[0].model === "qwen" &&
		dupes.fallbackProviders[1].model === "llama",
	"dedupe: identical fallback pairs collapse, junk dropped"
);

/* ---------- per-provider model catalogs (v0.1.14) ---------- */

const junkCat = normalizeLoadedSettings({ providers: [{ id: "lmstudio", models: [" m ", "m", 9, ""] }], activeProviderId: "lmstudio" });
check(
	JSON.stringify((junkCat.providers.find((p) => p.id === "lmstudio") ?? {}).models) === JSON.stringify(["m"]),
	"catalogs: per-provider models sanitized on load"
);
const keepCat = normalizeLoadedSettings({
	providers: [{ id: "lmstudio", models: ["have"] }],
	activeProviderId: "lmstudio",
	favoriteModels: ["legacy"],
});
check(
	JSON.stringify((keepCat.providers.find((p) => p.id === "lmstudio") ?? {}).models) === JSON.stringify(["have"]) &&
		keepCat.favoriteModels === undefined,
	"catalogs: migration never overwrites a non-empty provider catalog, key dropped"
);

/* ---------- notifications v0.1.142 ---------- */

const notificationDefaults = normalizeLoadedSettings({}).notifications;
check(
	notificationDefaults.nativeEnabled === false &&
		notificationDefaults.completionSoundEnabled === false &&
		notificationDefaults.completionSoundVariant === 1,
	"notifications: native and completion-sound masters default off; Two-note comfort is selected"
);
check(
	Object.values(notificationDefaults.nativeKinds).length === 6 &&
		Object.values(notificationDefaults.nativeKinds).every(Boolean),
	"notifications: all six per-kind defaults are on behind the off master"
);
const notificationDirty = normalizeLoadedSettings({
	notifications: {
		nativeEnabled: "yes",
		completionSoundEnabled: 1,
		completionSoundVariant: 99,
		nativeKinds: { turnDone: false, turnError: "false", approvalRequired: false },
	},
}).notifications;
check(
	notificationDirty.nativeEnabled === false &&
		notificationDirty.completionSoundEnabled === false &&
		notificationDirty.completionSoundVariant === 1,
	"notifications: malformed opt-in masters fail closed and bad preset heals"
);
check(
	notificationDirty.nativeKinds.turnDone === false &&
		notificationDirty.nativeKinds.approvalRequired === false &&
		notificationDirty.nativeKinds.turnError === true &&
		notificationDirty.nativeKinds.backgroundError === true,
	"notifications: only explicit false disables a kind; missing/new kinds default on"
);
const notificationExportSource = normalizeLoadedSettings({
	notifications: {
		nativeEnabled: true,
		completionSoundEnabled: true,
		completionSoundVariant: 14,
		nativeKinds: { inputRequired: false },
	},
});
const notificationExport = buildSettingsExport(notificationExportSource, false, "0.1.143");
check(
	notificationExport.settings.notifications.nativeEnabled === true &&
		notificationExport.settings.notifications.completionSoundVariant === 14 &&
		notificationExport.settings.notifications.nativeKinds.inputRequired === false,
	"notifications: per-vault preferences survive settings export"
);

/* ---------- uniqueProfileName ---------- */

check(uniqueProfileName("Sage", ["default"]) === "Sage", "unique name: free name untouched");
check(uniqueProfileName("Sage", ["Sage"]) === "Sage (2)", "unique name: collision → (2)");
check(uniqueProfileName("Sage", ["sage", "Sage (2)"]) === "Sage (3)", "unique name: case-insensitive chain");

if (failed > 0) {
	console.error(`\n${failed} settings check(s) failed.`);
	process.exit(1);
}
/* v0.1.85 — quickAsk snippet flag: OPT-IN shape, persists only as true */
{
	const qa = sanitizeSnippets([
		{ id: "a", title: "Formal", text: "Ubah ke gaya formal", quickAsk: true },
		{ id: "b", title: "Off", text: "teks", quickAsk: false },
		{ title: "Polos", text: "teks lagi" },
	]);
	check(qa.length === 3, "sanitizeSnippets: all three valid rows survive");
	check(qa[0].quickAsk === true, "quickAsk=true persists");
	check(!("quickAsk" in qa[1]), "quickAsk=false is deleted (pre-flag shape)");
	check(!("quickAsk" in qa[2]), "missing quickAsk stays absent");
	check(qa[0].ctxMenu === undefined && qa[0].slash === undefined, "flags never bleed across each other");
}

console.log("\nAll settings checks passed.");
