/**
 * Profiles unit tests (Hermes-style identities):
 *   migration · slug healing · effective connection/persona resolution ·
 *   folder mapping · store create/clone/update/delete guards
 */

const { execSync } = require("child_process");
const path = require("path");
const Module = require("module");

/* ---------- compile settings.ts + profiles.ts ---------- */

const settingsOut = path.join(__dirname, "dist", "settings.cjs");
const profilesOut = path.join(__dirname, "dist", "profiles.cjs");
execSync(`npx esbuild src/settings.ts --bundle --platform=node --format=cjs --outfile=${settingsOut}`, {
	cwd: path.join(__dirname, ".."),
	stdio: "inherit",
});
execSync(
	`npx esbuild src/agent/profiles.ts --bundle --platform=node --format=cjs --external:obsidian --outfile=${profilesOut}`,
	{ cwd: path.join(__dirname, ".."), stdio: "inherit" }
);

/* ---------- obsidian mock ---------- */

const obsidianMock = { normalizePath: (p) => p, Notice: class {}, TFile: class {}, TFolder: class {} };
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "obsidian") return "obsidian-mock";
	return originalResolve.call(this, request, ...args);
};
require.cache["obsidian-mock"] = {
	id: "obsidian-mock",
	filename: "obsidian-mock",
	loaded: true,
	exports: obsidianMock,
};

const S = require(settingsOut);
const P = require(profilesOut);

/* ---------- helpers ---------- */

let passed = 0;
let failed = 0;
function check(ok, label) {
	if (ok) {
		passed++;
		console.log(`✓ ${label}`);
	} else {
		failed++;
		console.error(`✗ ${label}`);
	}
}

function freshSettings() {
	const s = JSON.parse(JSON.stringify(S.DEFAULT_SETTINGS));
	s.profiles = S.migrateProfiles(undefined);
	s.activeProfileId = "default";
	return s;
}

function freshStore(settings, spy = {}) {
	const rmdirCalls = [];
	const events = [];
	const app = {
		vault: {
			configDir: ".obsidian",
			adapter: {
				exists: async (p) => (spy.existingPaths ?? []).includes(p),
				rmdir: async (p) => {
					events.push(`rmdir:${p}`);
					rmdirCalls.push(p);
					if (spy.rmdirError) throw spy.rmdirError;
				},
			},
		},
	};
	let saves = 0;
	const store = new P.ProfileStore(app, "openagent", () => settings, async () => {
		saves++;
		events.push("save");
		if (spy.saveError) throw spy.saveError;
	});
	return { store, rmdirCalls, events, saves: () => saves, app };
}

async function main() {
	/* ---------- migration ---------- */

	check(
		S.DEFAULT_SETTINGS.profiles.length === 1 && S.DEFAULT_SETTINGS.profiles[0].id === "default",
		"defaults: Default profile seeded"
	);
	{
		const ps = S.migrateProfiles(undefined);
		check(ps.length === 1 && ps[0].id === "default", "migrate: undefined → single Default");
		check(!("personality" in ps[0]), "migrate: profiles carry no personality (Hermes parity)");
		check(ps[0].soul === "", "migrate: Default starts with empty SOUL (built-in identity)");
		check(ps[0].providerId === null && ps[0].model === null, "migrate: Default follows global provider/model");
	}
	{
		/* v1 (identity-or-custom) → v2 (SOUL only — personality is GLOBAL) */
		const ps = S.migrateProfiles([{ id: "default", name: "Default", personality: "custom", customPersona: "You are a scribe." }]);
		check(ps[0].soul === "You are a scribe.", "migrate v1→v2: customPersona becomes SOUL");
		check(!("personality" in ps[0]), "migrate v1→v2: 'custom' preset key dropped (not a profile field)");
		const ps2 = S.migrateProfiles([{ id: "x", name: "X", personality: "writer", customPersona: "ignored" }]);
		check(ps2[0].soul === "" && !("personality" in ps2[0]), "migrate v1→v2: preset key dropped, no SOUL written");
	}
	{
		const ps = S.migrateProfiles([
			{ id: "default", name: "Default", color: "blue", soul: "", personality: "none" },
			{ id: "work ", name: "Work", color: "not-a-color", personality: "writer" },
			{ id: "work", name: "Work 2", color: "red", personality: "bogus" },
			"junk",
			{ name: 42 },
		]);
		check(ps.length === 3, "migrate: junk entries skipped");
		const ids = ps.map((p) => p.id);
		check(new Set(ids).size === ids.length, "migrate: duplicate ids healed");
		check(ps[1].color === "blue", "migrate: invalid color → blue");
		check(ps.every((p) => !("personality" in p)), "migrate: personality never lands on a profile");
		check(typeof ps[1].soul === "string" && ps[1].createdAt > 0, "migrate: fields filled");
	}
	{
		check(S.normalizeActiveProfileId("nope", S.migrateProfiles(undefined)) === "default", "active id: unknown → first");
		check(
			S.slugifyProfileId(" Research & Writing! ", new Set()) === "research-writing",
			"slugify: sanitized"
		);
		check(
			S.slugifyProfileId("Research Writing", new Set(["research-writing", "research-writing-2"])) ===
				"research-writing-3",
			"slugify: deduped"
		);
		check(S.slugifyProfileId("!!!", new Set()) === "profile", "slugify: empty → profile");
	}

	/* ---------- resolution ---------- */

	{
		const s = freshSettings();
		s.activeProviderId = "openrouter";
		s.model = "gpt-x";
		let conn = P.resolveConnection(s);
		check(conn.providerId === "openrouter" && conn.model === "gpt-x", "resolve: no pin → global");
		check(!conn.pinned.provider && !conn.pinned.model, "resolve: no pin → flags false");

		s.profiles.push({
			id: "work",
			name: "Work",
			color: "red",
			personality: "engineer",
			soul: "",
			providerId: "lmstudio",
			model: "qwen3",
			createdAt: 1,
		});
		s.activeProfileId = "work";
		conn = P.resolveConnection(s);
		check(conn.providerId === "lmstudio" && conn.model === "qwen3", "resolve: pin overrides global");
		check(conn.pinned.provider && conn.pinned.model, "resolve: pin flags true");

		s.profiles[1].providerId = null;
		conn = P.resolveConnection(s);
		check(conn.providerId === "openrouter" && conn.model === "qwen3", "resolve: partial pin mixes");
	}
	{
		/* SOUL.md semantics: durable identity in slot #1, verbatim + fallback */
		const s = freshSettings();
		check(P.resolveIdentity(s) === S.DEFAULT_IDENTITY, "identity: blank SOUL → built-in default");
		s.profiles[0].soul = "  You are a vault librarian spirit.  ";
		check(P.resolveIdentity(s) === "You are a vault librarian spirit.", "identity: SOUL injected trimmed-verbatim");
		s.profiles[0].soul = "   ";
		check(P.resolveIdentity(s) === S.DEFAULT_IDENTITY, "identity: whitespace SOUL → default");
		s.profiles = [];
		check(P.resolveIdentity(s) === S.DEFAULT_IDENTITY, "identity: no profiles → default");

		/* /personality = session-level overlay, never the identity; the GLOBAL
		   personality is the default (Hermes display.personality parity) */
		const t = freshSettings();
		check(P.resolveOverlayKey(t, null) === null, "overlay: global default → none");
		t.personality = "writer";
		check(P.resolveOverlayKey(t, null) === "writer", "overlay: global personality applies");
		check(P.resolveOverlayKey(t, "pirate") === "pirate", "overlay: session override wins");
		check(P.resolveOverlayKey(t, "bogus") === "writer", "overlay: bad session key → global personality");
		t.personality = "none";
		check(P.resolveOverlayKey(t, "bogus") === null, "overlay: all-invalid → null");
		check(P.overlayText("writer") === S.PERSONALITY_OVERLAYS.writer, "overlay: text resolves");
		check(P.overlayText(null) === null && P.overlayText("none") === null, "overlay: none/null → no text");
	}

	/* ---------- folder mapping ---------- */

	{
		const s = freshSettings();
		const def = s.profiles[0];
		check(P.memoryFolderFor(def, s) === s.memoryFolder, "folders: default memory = legacy folder");
		check(P.skillsFolderFor(def, s) === s.skillsFolder, "folders: default skills = legacy folder");
		check(P.sessionSubdirFor(def) === "", "folders: default sessions = shared dir");
		const other = { id: "research", name: "Research", color: "cyan", soul: "", providerId: null, model: null, createdAt: 1 };
		check(P.memoryFolderFor(other, s) === "openagent/profiles/research/memory", "folders: profile memory path");
		check(P.skillsFolderFor(other, s) === "openagent/profiles/research/skills", "folders: profile skills path");
		check(P.sessionSubdirFor(other) === "research", "folders: profile sessions subdir");
	}

	/* ---------- store: create / clone / update ---------- */

	{
		const s = freshSettings();
		const { store, saves } = freshStore(s);
		const p = await store.create("Research Notes");
		check(p.id === "research-notes" && p.color === "gray" && p.providerId === null && !("personality" in p), "create: blank defaults, no personality field");
		check(s.profiles.length === 2 && saves() === 1, "create: persisted");

		s.profiles[0].soul = "You are a librarian.";
		s.profiles[0].providerId = "ollama";
		s.profiles[0].model = "llama3";
		const clone = await store.create("", { cloneFromId: "default" });
		check(clone.name === "Default copy" && clone.id === "default-copy", "clone: default name");
		check(
			clone.soul === "You are a librarian." && clone.providerId === "ollama" && clone.model === "llama3",
			"clone: SOUL + pins copied"
		);
		check(clone.id !== "default" && clone.createdAt >= s.profiles[0].createdAt, "clone: new identity");

		const dup = await store.duplicate(p.id);
		check(dup && dup.name === "Research Notes copy", "duplicate: name suffix");
	}

	{
		const s = freshSettings();
		const orphaned = freshStore(s, { existingPaths: ["openagent/profiles/work"] });
		const p = await orphaned.store.create("Work");
		check(p.id === "work-2", "create: retained orphan profile folder forces a fresh id");
		const orphanedSession = freshStore(s, { existingPaths: [".obsidian/plugins/openagent/sessions/research"] });
		const p2 = await orphanedSession.store.create("Research");
		check(p2.id === "research-2", "create: retained orphan session folder forces a fresh id");
	}

	{
		const s = freshSettings();
		const { store } = freshStore(s);
		const p = await store.create("Work");
		const upd = await store.update(p.id, { id: "hacked", name: "  Work HQ ", model: "", providerId: "lmstudio" });
		check(upd.id === p.id, "update: id immutable");
		check(upd.name === "Work HQ", "update: name trimmed");
		check(upd.model === null, 'update: empty model → follow global');
		check(upd.providerId === "lmstudio", "update: provider pin set");
		const bad = await store.update(p.id, { color: "neon" });
		check(bad.color === p.color, "update: invalid color ignored");
		check((await store.update("missing", { name: "x" })) === null, "update: unknown id → null");
	}

	/* v0.1.172 (owner: "di pengaturan profile, merujuk Hermes Desktop,
	   personality tidak ada"): profiles carry NO personality field — Hermes'
	   display.personality is a GLOBAL Chat setting. The SOUL stays the durable
	   identity; profile updates never invent a personality. */
	{
		const s = freshSettings();
		const { store } = freshStore(s);
		const p = await store.create("Vault Librarian");
		check(!("personality" in p), "profile: create never adds a personality field");
		await store.update(p.id, { soul: "You are a careful vault librarian spirit." });
		const upd = await store.update(p.id, { name: "Librarian Plus" });
		check(upd.soul === "You are a careful vault librarian spirit." && !("personality" in upd), "profile: update never touches identity, no personality field");
		check(P.resolveOverlayKey(s, null) === null, "global personality default → no overlay");
		s.personality = "writer";
		check(P.resolveOverlayKey(s, null) === "writer", "global personality drives every profile's new chats");
		check(P.resolveOverlayKey(s, "pirate") === "pirate", "session /personality overrides the global");
	}

	/* ---------- store: save-failure rollback ---------- */

	{
		const s = freshSettings();
		const originalProfiles = s.profiles;
		const failing = freshStore(s, { saveError: new Error("disk full") });
		let rejected = false;
		try { await failing.store.create("Must Roll Back"); } catch (e) { rejected = /disk full/.test(String(e.message)); }
		check(rejected, "create rollback: save failure is propagated");
		check(s.profiles === originalProfiles && s.profiles.length === 1, "create rollback: exact live profile list restored");
	}
	{
		const s = freshSettings();
		const setup = freshStore(s);
		const work = await setup.store.create("Work");
		const originalProfiles = s.profiles;
		const originalWork = s.profiles.find((p) => p.id === work.id);
		const failing = freshStore(s, { saveError: new Error("read only") });
		let rejected = false;
		try { await failing.store.update(work.id, { name: "Changed" }); } catch (e) { rejected = /read only/.test(String(e.message)); }
		check(rejected, "update rollback: save failure is propagated");
		check(s.profiles === originalProfiles && s.profiles.find((p) => p.id === work.id) === originalWork, "update rollback: exact live list/object restored");
	}
	{
		const s = freshSettings();
		const setup = freshStore(s);
		const work = await setup.store.create("Work");
		s.activeProfileId = work.id;
		const originalProfiles = s.profiles;
		const failing = freshStore(s, { saveError: new Error("quota") });
		let rejected = false;
		try { await failing.store.remove(work.id, { trashFolders: true }); } catch (e) { rejected = /quota/.test(String(e.message)); }
		check(rejected, "delete rollback: save failure is propagated");
		check(s.profiles === originalProfiles && s.activeProfileId === work.id, "delete rollback: list and active profile restored");
		check(failing.rmdirCalls.length === 0, "delete rollback: no folder removed before persistence succeeds");
	}

	/* ---------- store: delete guards ---------- */

	{
		const s = freshSettings();
		const { store } = freshStore(s);
		let res = await store.remove("default");
		check(!res.ok, "delete: sole profile refused");

		const work = await store.create("Work");
		res = await store.remove("default");
		check(!res.ok && /Default/.test(res.reason), "delete: Default protected (anchor of existing data)");

		s.activeProfileId = work.id;
		const spy = freshStore(s);
		res = await spy.store.remove("work", { trashFolders: true });
		check(res.ok, "delete: active removed");
		check(s.activeProfileId === "default", "delete: active falls back to default");
		check(
			spy.rmdirCalls.includes("openagent/profiles/work") &&
				spy.rmdirCalls.includes(".obsidian/plugins/openagent/sessions/work"),
			"delete: trash removes both folders"
		);
		check(spy.events[0] === "save" && spy.events[1]?.startsWith("rmdir:"), "delete: persistence commits before destructive cleanup");
		const keep = await store.create("Keep Me");
		check(s.profiles.some((p) => p.id === keep.id), "setup for keep-delete");
		const spy2 = freshStore(s);
		res = await spy2.store.remove(keep.id);
		check(res.ok && s.profiles.every((p) => p.id !== keep.id), "delete: row removed");
		check(spy2.rmdirCalls.length === 0, "delete: default keeps folders on disk");
	}

	console.log(failed === 0 ? "\nAll profiles checks passed." : `\n${failed} profiles checks FAILED.`);
	process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
