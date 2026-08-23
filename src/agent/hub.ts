/**
 * Browse Hub — Hermes-style skills hub, adapted for a sandboxed plugin.
 *
 * Hermes Desktop's "Browse Hub" searches several registries progressively
 * (one query per source, results streaming in), dedupes by identifier with
 * a trust rank (builtin > trusted > community), previews SKILL.md, runs a
 * security scan on demand, installs/uninstalls per row, and offers
 * "Update all" for installed hub skills.
 *
 * We can't shell out to the CLI, so our sources speak plain HTTPS:
 *   · GitHub taps (the same default taps Hermes ships): fetched as ONE
 *     git-tree call per tap, cached 6h in plugin data; files download from
 *     raw.githubusercontent.com (no API quota used)
 *   · custom taps the user adds (owner/repo[/subdir])
 *   · direct SKILL.md URLs
 * well-known endpoints and the skills.sh marketplace index are deferred.
 *
 * Installs land in the ACTIVE profile's skills folder (isolated per
 * profile, like everything else) and are tracked in `hub-lock.json`, which
 * powers the installed badges, provenance and Update all.
 */

import { App } from "obsidian";
import { HubSkillMeta, HubTap, HubTrust, TapCacheEntry } from "../settings";
import { scanSkillFiles, installPolicy, GuardReport } from "./skillsGuard";
import { canonicalVaultPath, pathContains } from "./workspacePolicy";

/* ------------------------------------------------------------------ */
/* local result types (catalog types live in settings.ts)              */
/* ------------------------------------------------------------------ */

export interface HubSkill extends HubSkillMeta {
	identifier: string; // `${repo}::${dir}`
	tap: HubTap;
	repo: string;
	trust: HubTrust;
	installedName: string | null;
}

export interface LockEntry {
	slug: string;
	repo: string;
	dir: string;
	branch: string;
	installedAt: number;
	/** file rel-path → git blob sha at install time (drives Update all) */
	shas: Record<string, string>;
}

export type HubLock = Record<string, LockEntry>; // key = identifier `${repo}::${dir}`

export interface HubTransport {
	(url: string): Promise<{ status: number; text: string; buffer: ArrayBuffer }>;
}

/* ------------------------------------------------------------------ */
/* taps                                                                */
/* ------------------------------------------------------------------ */

/** The bundled default tap — kepano's official Obsidian skills (skills/
 *  subtree; repo verified 2026-07-23: 5 skills — defuddle, json-canvas,
 *  obsidian-bases, obsidian-cli, obsidian-markdown).
 *  owner directive 2026-07-23: this is now the SINGLE primary source; the
 *  five Hermes-shipped taps (openai/anthropics/huggingface/NVIDIA/vercel)
 *  were removed. Custom taps stay addable from the hub search box. */
export const DEFAULT_HUB_TAPS: HubTap[] = [
	{ id: "kepano", label: "kepano/obsidian-skills", repo: "kepano/obsidian-skills/skills", trust: "trusted" },
];

/** Parse "owner/repo[/subdir]" into a tap (custom taps are community trust). */
export function parseTap(input: string): HubTap | null {
	const clean = input.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/^\/+|\/+$/g, "");
	const parts = clean.split("/").filter(Boolean);
	if (parts.length < 2) return null;
	const owner = parts[0];
	const repo = parts[1];
	if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
	return {
		id: `${owner}/${repo}${parts.length > 2 ? "/" + parts.slice(2).join("/") : ""}`.toLowerCase().replace(/[^\w/]+/g, "-"),
		label: parts.join("/"),
		repo: parts.join("/"),
		trust: "community",
	};
}

/** default taps + parsed custom taps (settings.hubTaps) — the single live-tap-list helper */
export function allHubTaps(customs: string[]): HubTap[] {
	return [
		...DEFAULT_HUB_TAPS,
		...customs.map((t) => parseTap(t)).filter((t): t is HubTap => t !== null),
	];
}

/** owner/repo of a tap (without subdir). */
export function tapRepo(tap: HubTap): string {
	return tap.repo.split("/").slice(0, 2).join("/");
}
/** subdir filter of a tap ("" when the whole repo is scanned). */
export function tapSubdir(tap: HubTap): string {
	return tap.repo.split("/").slice(2).join("/");
}

export function skillIdentifier(repo: string, dir: string): string {
	return `${repo}::${dir}`;
}

/* ------------------------------------------------------------------ */
/* tree → skills (pure, unit-testable)                                 */
/* ------------------------------------------------------------------ */

interface TreeItem {
	path: string;
	type: "blob" | "tree";
	sha: string;
	size?: number;
}

/** Extract skill folders (dirs containing SKILL.md) from a git tree listing. */
export function extractSkills(tree: TreeItem[], subdir: string): { skills: HubSkillMeta[]; files: TapCacheEntry["files"] } {
	const skills: HubSkillMeta[] = [];
	const files: TapCacheEntry["files"] = {};
	const seen = new Set<string>();
	for (const item of tree) {
		if (item.type !== "blob") continue;
		const base = item.path.split("/").pop() ?? "";
		if (base.toLowerCase() !== "skill.md") continue;
		const dir = item.path.split("/").slice(0, -1).join("/");
		if (subdir && dir !== subdir && !dir.startsWith(subdir + "/")) continue;
		if (seen.has(dir)) continue;
		seen.add(dir);
		const name = dir.split("/").pop() || dir || "skill";
		skills.push({ name, dir, skillMd: item.path });
	}
	for (const item of tree) {
		if (item.type !== "blob") continue;
		for (const dir of seen) {
			const prefix = dir ? dir + "/" : "";
			if (item.path.startsWith(prefix)) {
				(files[dir] = files[dir] ?? []).push({ path: item.path.slice(prefix.length), sha: item.sha });
				break;
			}
		}
	}
	skills.sort((a, b) => a.name.localeCompare(b.name));
	return { skills, files };
}

/** Trust-rank merge (Hermes `_TRUST_RANK`: higher trust wins on duplicate results). */
const TRUST_RANK: Record<HubTrust, number> = { trusted: 1, community: 0 };

export function mergeHubResults(lists: HubSkill[][]): HubSkill[] {
	const seen = new Map<string, HubSkill>();
	for (const list of lists) {
		for (const skill of list) {
			const prev = seen.get(skill.identifier);
			if (!prev || TRUST_RANK[skill.trust] > TRUST_RANK[prev.trust]) seen.set(skill.identifier, skill);
		}
	}
	return [...seen.values()].sort((a, b) => TRUST_RANK[b.trust] - TRUST_RANK[a.trust] || a.name.localeCompare(b.name));
}

/** client-side filter over cached skill names/dirs */
export function filterSkills(skills: HubSkillMeta[], term: string): HubSkillMeta[] {
	const q = term.trim().toLowerCase();
	if (!q) return skills;
	return skills.filter((s) => s.name.toLowerCase().includes(q) || s.dir.toLowerCase().includes(q));
}

/** frontmatter name/description from a SKILL.md body */
export function parseSkillFrontmatter(text: string): { name?: string; description?: string } {
	const m = text.match(/^---\n([\s\S]*?)\n---/);
	if (!m) return {};
	const out: { name?: string; description?: string } = {};
	const name = m[1].match(/^name:\s*(.+)$/m);
	if (name) out.name = name[1].trim().replace(/^["']|["']$/g, "");
	const desc = m[1].match(/^description:\s*(.+)$/m);
	if (desc) out.description = desc[1].trim().replace(/^["']|["']$/g, "");
	return out;
}

/** folder slug from a skill name */
export function skillSlug(name: string): string {
	const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
	return slug || "skill";
}

/* ------------------------------------------------------------------ */
/* client                                                              */
/* ------------------------------------------------------------------ */

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h — GitHub API is 60 calls/h unauth

/**
 * Drop cache entries whose tap is no longer configured; true when changed.
 * owner directive 2026-07-25: cache keys outlive tap removal (chips × and
 * the v0.1.9 default-tap swap), so dead catalogs lingered in data.json.
 */
export function pruneHubCache(cache: Record<string, TapCacheEntry>, taps: HubTap[]): boolean {
	const known = new Set(taps.map((t) => t.repo));
	let removed = false;
	for (const key of Object.keys(cache)) {
		if (!known.has(key)) {
			delete cache[key];
			removed = true;
		}
	}
	return removed;
}
const MAX_FILE_BYTES = 512 * 1024;
const MAX_SKILL_FILES = 40;

export class HubClient {
	constructor(
		private app: App,
		private transport: HubTransport,
		private getSkillsFolder: () => string,
		private getCache: () => Record<string, TapCacheEntry>,
		private saveCache: () => Promise<void>
	) {}

	/* ---------- fetching ---------- */

	private async fetchJson(url: string): Promise<{ status: number; json: any }> {
		const r = await this.transport(url);
		if (r.status === 403 || r.status === 429) {
			const err: any = new Error("GitHub rate limit — try again later");
			err.rateLimited = true;
			throw err;
		}
		if (r.status >= 400) throw new Error(`HTTP ${r.status}`);
		return { status: r.status, json: JSON.parse(r.text) };
	}

	/** Load a tap's skill catalog, from the 6h cache or by refetching its git tree. */
	async loadTap(tap: HubTap, force = false): Promise<TapCacheEntry> {
		const cache = this.getCache();
		const key = tap.repo;
		const fresh = cache[key] && Date.now() - cache[key].fetchedAt < CACHE_TTL;
		if (!force && fresh) return cache[key];

		const repo = tapRepo(tap);
		const repoInfo = await this.fetchJson(`https://api.github.com/repos/${repo}`);
		const branch: string = repoInfo.json?.default_branch ?? "main";
		const treeRes = await this.fetchJson(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`);
		const tree: TreeItem[] = Array.isArray(treeRes.json?.tree) ? treeRes.json.tree : [];
		const { skills, files } = extractSkills(tree, tapSubdir(tap));
		const entry: TapCacheEntry = {
			branch,
			fetchedAt: Date.now(),
			skills,
			files,
			truncated: treeRes.json?.truncated === true,
		};
		cache[key] = entry;
		await this.saveCache();
		return entry;
	}

	async fetchFile(repo: string, branch: string, path: string): Promise<{ status: number; text: string; buffer: ArrayBuffer }> {
		const r = await this.transport(
			`https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/${path
				.split("/")
				.map(encodeURIComponent)
				.join("/")}`
		);
		return r;
	}

	/** Lazily fill a skill's description from its frontmatter. */
	async fetchDescription(tap: HubTap, entry: TapCacheEntry, skill: HubSkillMeta): Promise<string> {
		if (skill.description !== undefined) return skill.description;
		try {
			const r = await this.fetchFile(tapRepo(tap), entry.branch, skill.skillMd);
			const fm = parseSkillFrontmatter(r.status === 200 ? r.text : "");
			skill.description = fm.description ?? "";
			if (fm.name) skill.name = fm.name;
		} catch {
			skill.description = "";
		}
		return skill.description;
	}

	/** Preview for the dialog: SKILL.md content + file listing. */
	async preview(tap: HubTap, entry: TapCacheEntry, skill: HubSkillMeta) {
		const repo = tapRepo(tap);
		const r = await this.fetchFile(repo, entry.branch, skill.skillMd);
		if (r.status !== 200) throw new Error(`Could not fetch ${skill.skillMd} (HTTP ${r.status})`);
		const fm = parseSkillFrontmatter(r.text);
		if (fm.name) skill.name = fm.name;
		if (fm.description !== undefined) skill.description = fm.description;
		return {
			skillMd: r.text,
			files: (entry.files[skill.dir] ?? []).map((f) => f.path),
		};
	}

	/* ---------- security scan ---------- */

	async scan(tap: HubTap, entry: TapCacheEntry, skill: HubSkillMeta): Promise<GuardReport> {
		const repo = tapRepo(tap);
		const texts: { path: string; text: string }[] = [];
		const files = (entry.files[skill.dir] ?? []).filter((f) => /\.(md|txt|js|ts|py|sh|json|ya?ml|html?)$/i.test(f.path));
		for (const f of files.slice(0, MAX_SKILL_FILES)) {
			try {
				const r = await this.fetchFile(repo, entry.branch, skill.dir ? `${skill.dir}/${f.path}` : f.path);
				if (r.status === 200) texts.push({ path: f.path, text: r.text.slice(0, 200_000) });
			} catch {
				/* unreadable files don't block the scan */
			}
		}
		return scanSkillFiles(texts);
	}

	/* ---------- managed-path boundary ---------- */

	private skillsRoot(): string {
		return canonicalVaultPath(this.getSkillsFolder(), { label: "Managed skills root" });
	}

	private skillsPath(relative: string, label = "Managed skill path"): string {
		const root = this.skillsRoot();
		const rel = canonicalVaultPath(relative, { label });
		const path = canonicalVaultPath(`${root}/${rel}`, { label });
		if (!pathContains(root, path)) throw new Error(`${label} escaped the managed skills root.`);
		return path;
	}

	/* ---------- lock file ---------- */

	private lockPath(): string {
		return this.skillsPath("hub-lock.json", "Hub lock path");
	}

	async readLock(): Promise<HubLock> {
		try {
			const raw = await this.app.vault.adapter.read(this.lockPath());
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === "object" ? (parsed as HubLock) : {};
		} catch {
			return {};
		}
	}

	private async writeLock(lock: HubLock): Promise<void> {
		const path = this.lockPath();
		const dir = path.split("/").slice(0, -1).join("/");
		try {
			await this.app.vault.adapter.mkdir(dir);
		} catch {
			/* exists */
		}
		await this.app.vault.adapter.write(path, JSON.stringify(lock, null, 2));
	}

	/* ---------- install / uninstall / update ---------- */

	/**
	 * Download + write a hub skill into the active profile's skills folder.
	 * Caller runs the security policy first (scan → allow/ask/consent).
	 */
	async install(
		tap: HubTap,
		entry: TapCacheEntry,
		skill: HubSkillMeta
	): Promise<{ slug: string; fileCount: number; skippedLarge: number }> {
		const repo = tapRepo(tap);
		const files = (entry.files[skill.dir] ?? []).slice(0, MAX_SKILL_FILES);
		/* folder name: frontmatter name wins, fallback to dir basename */
		const head = await this.fetchFile(repo, entry.branch, skill.skillMd);
		if (head.status !== 200) throw new Error(`Could not fetch ${skill.skillMd}`);
		const fm = parseSkillFrontmatter(head.text);
		const slug = skillSlug(fm.name ?? skill.name);
		const targetDir = this.skillsPath(slug, "Hub skill folder");

		const shas: Record<string, string> = {};
		let written = 0;
		let skippedLarge = 0;
		for (const f of files) {
			const relativeFile = canonicalVaultPath(f.path, { label: "Hub skill file" });
			const src = skill.dir ? `${skill.dir}/${relativeFile}` : relativeFile;
			const dest = this.skillsPath(`${slug}/${relativeFile}`, "Hub skill destination");
			if (!pathContains(targetDir, dest)) throw new Error("Hub skill file escaped its skill folder.");
			const sub = dest.split("/").slice(0, -1).join("/");
			try {
				await this.app.vault.adapter.mkdir(sub);
			} catch {
				/* exists */
			}
			const r = await this.fetchFile(repo, entry.branch, src);
			if (r.status !== 200) continue;
			if (r.buffer.byteLength > MAX_FILE_BYTES) {
				skippedLarge++;
				continue;
			}
			await this.app.vault.adapter.writeBinary(dest, r.buffer);
			shas[f.path] = f.sha;
			written++;
		}

		const lock = await this.readLock();
		lock[skillIdentifier(tap.repo, skill.dir)] = {
			slug,
			repo: tap.repo,
			dir: skill.dir,
			branch: entry.branch,
			installedAt: Date.now(),
			shas,
		};
		await this.writeLock(lock);
		return { slug, fileCount: written, skippedLarge };
	}

	async uninstall(identifier: string): Promise<string | null> {
		const lock = await this.readLock();
		const entry = lock[identifier];
		if (!entry) return null;
		const dir = this.skillsPath(entry.slug, "Installed Hub skill folder");
		try {
			await this.app.vault.adapter.rmdir(dir, true);
		} catch {
			/* already gone */
		}
		delete lock[identifier];
		await this.writeLock(lock);
		return entry.slug;
	}

	/** Re-check blob shas of installed hub skills; returns those with updates available. */
	async checkUpdates(taps: HubTap[]): Promise<{ identifier: string; entry: LockEntry }[]> {
		const lock = await this.readLock();
		const stale: { identifier: string; entry: LockEntry }[] = [];
		for (const [identifier, item] of Object.entries(lock)) {
			const tap = taps.find((t) => t.repo === item.repo) ?? parseTap(item.repo);
			if (!tap) continue;
			try {
				const fresh = await this.loadTap(tap, true);
				const files = fresh.files[item.dir] ?? [];
				const changed = files.some((f) => item.shas[f.path] !== undefined && item.shas[f.path] !== f.sha);
				const added = files.some((f) => item.shas[f.path] === undefined);
				if (changed || added) stale.push({ identifier, entry: item });
			} catch {
				/* unreachable source — skip */
			}
		}
		return stale;
	}

	/** Update one installed skill in place (reinstall over its folder). */
	async update(identifier: string, tap: HubTap): Promise<{ slug: string } | null> {
		const lock = await this.readLock();
		const item = lock[identifier];
		if (!item) return null;
		const entry = await this.loadTap(tap, true);
		const skill = entry.skills.find((s) => s.dir === item.dir);
		if (!skill) return null;
		const res = await this.install(tap, entry, skill);
		return { slug: res.slug };
	}

	/* ---------- direct URL installs ---------- */

	/** Fetch a SKILL.md by absolute URL (Hermes `url` source). */
	async fetchUrlSkill(url: string): Promise<{ name: string; text: string; description?: string }> {
		if (!/^https:\/\//i.test(url.trim())) throw new Error("Only https:// URLs are supported");
		const r = await this.transport(url.trim());
		if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
		const fm = parseSkillFrontmatter(r.text);
		const slug = url.trim().split("/").filter(Boolean).slice(-2, -1)[0] ?? "url-skill";
		return { name: fm.name ?? slug, text: r.text, description: fm.description };
	}

	async installUrl(url: string, name: string): Promise<{ slug: string }> {
		const { text } = await this.fetchUrlSkill(url);
		const slug = skillSlug(name);
		const dir = this.skillsPath(slug, "URL skill folder");
		try {
			await this.app.vault.adapter.mkdir(dir);
		} catch {
			/* exists */
		}
		await this.app.vault.adapter.write(this.skillsPath(`${slug}/SKILL.md`, "URL skill file"), text);
		const lock = await this.readLock();
		lock[`url::${url}`] = {
			slug,
			repo: "url",
			dir: url,
			branch: "",
			installedAt: Date.now(),
			shas: {},
		};
		await this.writeLock(lock);
		return { slug };
	}
}

export { installPolicy };
export type { GuardReport, HubTap, HubSkillMeta, HubTrust, TapCacheEntry };
