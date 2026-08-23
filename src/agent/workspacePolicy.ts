/**
 * Workspace path policy — the single lexical boundary for every
 * agent-controlled or model-visible vault path.
 *
 * This module is intentionally pure (no Obsidian imports) so the same rules
 * can be used by tools, runner/headless contexts, chat attachments, cron,
 * approval previews, settings migration, and adversarial unit tests.
 *
 * Security contract: this is a LOGICAL Obsidian vault-path boundary. A
 * symlink/junction that is logically inside the selected folder is in scope;
 * portable physical-realpath containment is not available on every Obsidian
 * platform.
 */

export type WorkspaceMode = "whole-vault" | "preferred-folder" | "strict-folder";

export interface WorkspaceSettingsLike {
	workspaceMode?: unknown;
	workspaceFolder?: unknown;
	workspaceExcludedFolders?: unknown;
	fileReadMaxChars?: unknown;
}

export interface WorkspacePathOptions {
	/** Empty input may represent the vault/root folder for browse operations. */
	allowEmpty?: boolean;
	/** Prefix relative input with the configured folder in Preferred/Strict. */
	preferredRouting?: boolean;
	label?: string;
}

const VALID_MODES = new Set<WorkspaceMode>(["whole-vault", "preferred-folder", "strict-folder"]);
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const DRIVE_RE = /^[a-zA-Z]:/;

/** Migration-only mode normalization. Legacy empty root = Whole; non-empty = Preferred. */
export function normalizeWorkspaceMode(value: unknown, legacyFolder: unknown): WorkspaceMode {
	if (typeof value === "string" && VALID_MODES.has(value as WorkspaceMode)) return value as WorkspaceMode;
	return typeof legacyFolder === "string" && legacyFolder.trim() ? "preferred-folder" : "whole-vault";
}

/** Exact segment-boundary containment (never raw prefix containment). */
export function pathContains(root: string, path: string): boolean {
	return path === root || path.startsWith(`${root}/`);
}

/**
 * Canonicalize one logical vault-relative path while rejecting shapes that
 * normalizePath() alone does not make safe. No dot segment is ever resolved:
 * it is rejected before a Vault/Adapter sink sees it.
 */
export function canonicalVaultPath(
	value: unknown,
	options: { allowEmpty?: boolean; label?: string } = {}
): string {
	const label = options.label ?? "Vault path";
	if (typeof value !== "string") throw new Error(`${label} must be a vault-relative string.`);
	/* Match Obsidian's documented logical-path cleanup for NBSP + Unicode,
	   while keeping the security-significant dot-segment check explicit. */
	const raw = value.replace(/\u00a0/g, " ").trim().normalize("NFC");
	if (!raw) {
		if (options.allowEmpty) return "";
		throw new Error(`${label} cannot be empty.`);
	}
	if (CONTROL_RE.test(raw)) throw new Error(`${label} contains a control character.`);
	if (raw.startsWith("/") || raw.startsWith("\\") || DRIVE_RE.test(raw)) {
		throw new Error(`${label} must be relative to the vault; absolute, drive, and UNC paths are refused.`);
	}

	const slash = raw.replace(/\\/g, "/");
	const segments = slash.split("/");
	if (segments.some((segment) => segment === "." || segment === "..")) {
		throw new Error(`${label} contains a refused "." or ".." path segment.`);
	}
	const clean = segments.filter((segment) => segment.length > 0).join("/");
	if (!clean) {
		if (options.allowEmpty) return "";
		throw new Error(`${label} cannot resolve to the vault root.`);
	}
	return clean;
}

/** Keep only canonical, unique exclusion roots. Malformed entries never become broad matches. */
export function sanitizeWorkspaceExclusions(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const out: string[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		try {
			const path = canonicalVaultPath(item, { label: "Workspace exclusion" });
			if (!seen.has(path)) {
				seen.add(path);
				out.push(path);
			}
		} catch {
			/* Invalid persisted/imported exclusions are dropped, never reinterpreted. */
		}
	}
	return out;
}

function fnv1a32(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, "0");
}

function partitionSlug(root: string): string {
	const slug = root
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 28) || "workspace";
	return `strict-${slug}-${fnv1a32(root)}`;
}

export class WorkspacePolicy {
	readonly mode: WorkspaceMode;
	readonly root: string;
	readonly exclusions: readonly string[];
	readonly configDir: string;
	readonly valid: boolean;
	readonly error: string | null;
	readonly partitionKey: string | null;
	/** Fingerprint of every setting that can change model-visible vault scope. */
	readonly scopeKey: string;
	readonly fileReadMaxChars: number;

	constructor(settings: WorkspaceSettingsLike, configDir = ".obsidian") {
		this.mode = normalizeWorkspaceMode(settings.workspaceMode, settings.workspaceFolder);
		const rawCeiling = Math.floor(Number(settings.fileReadMaxChars));
		this.fileReadMaxChars = Number.isFinite(rawCeiling) ? Math.min(20_000, Math.max(1_000, rawCeiling)) : 20_000;
		this.configDir = canonicalVaultPath(configDir || ".obsidian", { label: "Obsidian config directory" });
		this.exclusions = Object.freeze(sanitizeWorkspaceExclusions(settings.workspaceExcludedFolders));

		let root = "";
		let error: string | null = null;
		if (this.mode !== "whole-vault") {
			try {
				root = canonicalVaultPath(settings.workspaceFolder, { label: "Workspace folder" });
				if (pathContains(this.configDir, root) || pathContains(root, this.configDir)) {
					throw new Error("Workspace folder cannot be the Obsidian config directory or contain it.");
				}
			} catch (cause) {
				error = cause instanceof Error ? cause.message : String(cause);
			}
		}
		this.root = root;
		this.valid = error === null;
		this.error = error;
		this.partitionKey = this.mode === "strict-folder"
			? root
				? partitionSlug(root)
				: `strict-invalid-${fnv1a32(String(settings.workspaceFolder ?? ""))}`
			: null;
		this.scopeKey = `scope-${fnv1a32(JSON.stringify([
			this.mode,
			this.root,
			[...this.exclusions].sort(),
			this.fileReadMaxChars,
			this.configDir,
		]))}`;
		Object.freeze(this);
	}

	/** Strict roots must also exist as folders; callers provide the Vault fact. */
	assertReady(strictRootExists = true): void {
		if (!this.valid) throw new Error(`Workspace policy is invalid: ${this.error ?? "unknown error"}`);
		if (this.mode === "strict-folder" && !strictRootExists) {
			throw new Error(`Strict workspace folder does not exist or is not a folder: ${this.root || "(empty)"}`);
		}
	}

	private assertAllowedCanonical(path: string, label: string): string {
		if (pathContains(this.configDir, path)) {
			throw new Error(`${label} is inside the protected Obsidian config directory: ${path}`);
		}
		const excluded = this.exclusions.find((root) => pathContains(root, path));
		if (excluded) throw new Error(`${label} is excluded by workspace policy (${excluded}): ${path}`);
		if (this.mode === "strict-folder" && !pathContains(this.root, path)) {
			throw new Error(`${label} is outside the strict workspace folder "${this.root}": ${path}`);
		}
		return path;
	}

	/**
	 * Resolve model/user input for direct path operations. Preferred and
	 * Strict preserve legacy relative routing: paths not already rooted under
	 * workspaceFolder are interpreted relative to it.
	 */
	resolvePath(value: unknown, options: WorkspacePathOptions = {}): string {
		this.assertReady();
		const label = options.label ?? "Vault path";
		const clean = canonicalVaultPath(value, { allowEmpty: options.allowEmpty, label });
		if (!clean) {
			if (this.mode === "strict-folder") return this.assertAllowedCanonical(this.root, label);
			return "";
		}
		let candidate = clean;
		if (
			options.preferredRouting !== false &&
			this.mode !== "whole-vault" &&
			!pathContains(this.root, candidate)
		) {
			candidate = `${this.root}/${candidate}`;
		}
		return this.assertAllowedCanonical(candidate, label);
	}

	/**
	 * Resolve an optional browse/search folder. Preferred remains vault-wide
	 * for migration compatibility; Strict starts at its root and cannot widen.
	 */
	resolveBrowseFolder(value: unknown, label = "Browse folder"): string {
		this.assertReady();
		const clean = canonicalVaultPath(value, { allowEmpty: true, label });
		if (this.mode === "strict-folder") return this.resolvePath(clean, { allowEmpty: true, label });
		if (!clean) return "";
		return this.assertAllowedCanonical(clean, label);
	}

	/** Check an already-resolved TFile/TFolder path without applying a prefix. */
	assertVisiblePath(value: unknown, label = "Vault path"): string {
		this.assertReady();
		const clean = canonicalVaultPath(value, { label });
		return this.assertAllowedCanonical(clean, label);
	}

	allowsPath(value: unknown): boolean {
		try {
			this.assertVisiblePath(value);
			return true;
		} catch {
			return false;
		}
	}

	description(): string {
		if (!this.valid) return `Invalid ${this.mode} policy (${this.error ?? "unknown error"}); vault access fails closed.`;
		if (this.mode === "whole-vault") return "Whole vault user-content scope (protected/excluded paths remain blocked).";
		if (this.mode === "preferred-folder") {
			return `Preferred folder "${this.root}" changes relative path resolution; it is not a vault-wide access boundary.`;
		}
		return `Strict logical Obsidian path boundary: "${this.root}" (linked folders under this root are treated as in scope).`;
	}
}

export function workspacePolicyFor(settings: WorkspaceSettingsLike, configDir = ".obsidian"): WorkspacePolicy {
	return new WorkspacePolicy(settings, configDir);
}

/** Project-partition a managed memory/skills root only in Strict mode. */
export function partitionManagedFolder(
	baseFolder: unknown,
	settings: WorkspaceSettingsLike | WorkspacePolicy,
	configDir = ".obsidian"
): string {
	const base = canonicalVaultPath(baseFolder, { label: "Managed Open Agent folder" });
	const policy = settings instanceof WorkspacePolicy ? settings : new WorkspacePolicy(settings, configDir);
	/* Invalid Strict stays isolated in a non-global sentinel partition so the
	   plugin can still open Settings to repair it; user-content runs still
	   fail in assertReady(). */
	if (pathContains(policy.configDir, base)) {
		throw new Error(`Managed Open Agent folder cannot be inside the protected config directory: ${base}`);
	}
	return policy.partitionKey ? `${base}/workspaces/${policy.partitionKey}` : base;
}

/** Session partition lives under plugin-private storage; return only a safe subdir token. */
export function workspaceSessionPartition(settings: WorkspaceSettingsLike | WorkspacePolicy): string {
	const policy = settings instanceof WorkspacePolicy ? settings : new WorkspacePolicy(settings);
	/* Conversation wire history can contain prior vault reads. Keep Strict
	   sessions in a narrower scope partition so changed exclusions/ceiling
	   cannot resurrect content through an older session. */
	return policy.partitionKey ? `${policy.partitionKey}/${policy.scopeKey}` : "";
}
