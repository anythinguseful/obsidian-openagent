/**
 * Agent profiles — Hermes-style isolated identities inside one vault
 * (hermes_cli/profiles.py + the desktop profile switcher, adapted).
 *
 * A profile bundles:
 *   · soul               — durable identity (Hermes SOUL.md), slot #1 of the prompt
 *   · provider/model pin — optional; null means "follow global"
 *   · data isolation     — own memory/, skills/ and sessions/ folders
 *
 * NOTE (v0.1.172): a profile has NO personality. Hermes' display.personality
 * is a GLOBAL Chat setting (settings.personality here); a session
 * /personality overrides it per chat. Overlays layer on the SOUL, never
 * replace it.
 *
 * The reserved "default" profile is anchored to the pre-profiles
 * folders (openagent/openagent-memory, …/openagent-skills and the
 * shared sessions dir), so existing single-profile vaults migrate with
 * zero visible change. API keys stay global — profiles isolate agent
 * data, not secrets (consciously narrower than Hermes' per-profile
 * .env; an Obsidian plugin has one key store).
 */

import { App } from "obsidian";
import {
	AgentProfile,
	DEFAULT_IDENTITY,
	DEFAULT_PROFILE_ID,
	OpenAgentSettings,
	PERSONALITY_OVERLAYS,
	PROFILE_COLORS,
	ProfileColor,
	isOverlayKey,
	slugifyProfileId,
} from "../settings";
import { canonicalVaultPath, partitionManagedFolder, workspaceSessionPartition } from "./workspacePolicy";

export function getActiveProfile(s: OpenAgentSettings): AgentProfile {
	return s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0];
}

/**
 * Durable identity (Hermes SOUL.md semantics): the active profile's SOUL
 * text verbatim, or the built-in default identity when blank/unreadable.
 */
export function resolveIdentity(s: OpenAgentSettings): string {
	const p = s.profiles.length > 0 ? getActiveProfile(s) : null;
	const soul = p?.soul?.trim();
	return soul ? soul : DEFAULT_IDENTITY;
}

/**
 * Effective /personality overlay KEY for a conversation: the session-level
 * override wins; otherwise the GLOBAL `personality` setting (Hermes
 * display.personality parity — profiles carry NO personality). "none"/unknown
 * → null (identity only). Overlays supplement the SOUL, never replace it.
 */
export function resolveOverlayKey(s: OpenAgentSettings, sessionOverlay?: string | null): string | null {
	if (sessionOverlay && isOverlayKey(sessionOverlay)) return sessionOverlay;
	return isOverlayKey(s.personality) ? s.personality : null;
}

/** Overlay prompt text for a key (null when none). */
export function overlayText(key: string | null): string | null {
	return key && isOverlayKey(key) ? PERSONALITY_OVERLAYS[key] : null;
}

/**
 * Effective connection for an agent run: profile pin wins, otherwise the
 * global default. `pinned` flags drive the "pinned by profile" indicators.
 */
export function resolveConnection(s: OpenAgentSettings): {
	providerId: string;
	model: string;
	pinned: { provider: boolean; model: boolean };
} {
	const p = s.profiles.length > 0 ? getActiveProfile(s) : null;
	return {
		providerId: p?.providerId ?? s.activeProviderId,
		model: p?.model ?? s.model,
		pinned: { provider: !!p?.providerId, model: !!p?.model },
	};
}

/** Canonical unpartitioned roots are used by explicit reset/profile deletion. */
export function memoryBaseFolderFor(p: AgentProfile, s: OpenAgentSettings): string {
	return canonicalVaultPath(
		p.id === DEFAULT_PROFILE_ID ? s.memoryFolder : `openagent/profiles/${p.id}/memory`,
		{ label: "Managed memory folder" }
	);
}
export function skillsBaseFolderFor(p: AgentProfile, s: OpenAgentSettings): string {
	return canonicalVaultPath(
		p.id === DEFAULT_PROFILE_ID ? s.skillsFolder : `openagent/profiles/${p.id}/skills`,
		{ label: "Managed skills folder" }
	);
}

/** Default keeps legacy roots in Whole/Preferred; Strict adds a deterministic project partition. */
export function memoryFolderFor(p: AgentProfile, s: OpenAgentSettings): string {
	return partitionManagedFolder(memoryBaseFolderFor(p, s), s);
}
export function skillsFolderFor(p: AgentProfile, s: OpenAgentSettings): string {
	return partitionManagedFolder(skillsBaseFolderFor(p, s), s);
}
/** SessionStore subdir; Strict is plugin-private and partitioned by profile + project policy. */
export function sessionSubdirFor(p: AgentProfile, s?: OpenAgentSettings): string {
	const profile = p.id === DEFAULT_PROFILE_ID ? "" : p.id;
	if (!s) return profile; // compatibility for callers that only need profile partitioning
	const workspace = workspaceSessionPartition(s);
	if (!workspace) return profile;
	return [profile, "workspaces", workspace].filter(Boolean).join("/");
}

export interface CreateProfileOptions {
	cloneFromId?: string;
	color?: ProfileColor;
}

export class ProfileStore {
	constructor(
		private app: App,
		private pluginId: string,
		private getSettings: () => OpenAgentSettings,
		private save: () => Promise<void>
	) {}

	private async unusedProfileId(name: string, taken: Set<string>): Promise<string> {
		let id = slugifyProfileId(name, taken);
		while (
			await this.app.vault.adapter.exists(canonicalVaultPath(`openagent/profiles/${id}`, { label: "Profile data root" })) ||
			await this.app.vault.adapter.exists(canonicalVaultPath(
				`${this.app.vault.configDir}/plugins/${this.pluginId}/sessions/${id}`,
				{ label: "Profile session root" }
			))
		) {
			taken.add(id);
			id = slugifyProfileId(name, taken);
		}
		return id;
	}

	list(): AgentProfile[] {
		return this.getSettings().profiles;
	}

	active(): AgentProfile {
		return getActiveProfile(this.getSettings());
	}

	/** Blank profile, or a config clone (persona + pins, not data). */
	async create(name: string, opts?: CreateProfileOptions): Promise<AgentProfile> {
		const s = this.getSettings();
		const taken = new Set(s.profiles.map((p) => p.id));
		const src = opts?.cloneFromId ? s.profiles.find((p) => p.id === opts.cloneFromId) : null;
		const trimmed = name.trim();
		const profileName = src ? (trimmed || `${src.name} copy`) : (trimmed || "Profile");
		const profileId = await this.unusedProfileId(profileName, taken);
		const profile: AgentProfile = src
			? {
					...src,
					id: profileId,
					name: profileName,
					createdAt: Date.now(),
			  }
			: {
					id: profileId,
					name: profileName,
					color: opts?.color ?? "gray",
					soul: "",
					providerId: null,
					model: null,
					createdAt: Date.now(),
			  };
		if (this.getSettings() !== s || s.profiles.some((p) => p.id === profile.id)) {
			throw new Error("Profile settings changed while the new profile was being prepared; please try again.");
		}
		const previousProfiles = s.profiles;
		s.profiles = [...previousProfiles, profile];
		try {
			await this.save();
		} catch (e) {
			s.profiles = previousProfiles;
			throw e;
		}
		return profile;
	}

	/** Patch a profile. `id` and `createdAt` are immutable (folder anchors). */
	async update(
		id: string,
		patch: Partial<Omit<AgentProfile, "id" | "createdAt">>
	): Promise<AgentProfile | null> {
		const s = this.getSettings();
		const idx = s.profiles.findIndex((p) => p.id === id);
		if (idx < 0) return null;
		const cur = s.profiles[idx];
		const next: AgentProfile = {
			...cur,
			...patch,
			id: cur.id,
			createdAt: cur.createdAt,
			name: typeof patch.name === "string" ? patch.name.trim() || cur.name : cur.name,
			color: patch.color && PROFILE_COLORS.includes(patch.color) ? patch.color : cur.color,
			providerId: patch.providerId === undefined ? cur.providerId : patch.providerId || null,
			model: patch.model === undefined ? cur.model : patch.model || null,
		};
		const previousProfiles = s.profiles;
		s.profiles = previousProfiles.map((p, i) => (i === idx ? next : p));
		try {
			await this.save();
		} catch (e) {
			s.profiles = previousProfiles;
			throw e;
		}
		return next;
	}

	async rename(id: string, name: string): Promise<AgentProfile | null> {
		return this.update(id, { name });
	}

	/** Clone config only (soul + pins + color) — memory/skills/sessions start empty, like `hermes profiles create --clone`. */
	async duplicate(id: string): Promise<AgentProfile | null> {
		const src = this.getSettings().profiles.find((p) => p.id === id);
		if (!src) return null;
		return this.create(`${src.name} copy`, { cloneFromId: id });
	}

	/**
	 * Delete a profile. Guards: never the last one, never "default" (it
	 * anchors the pre-profiles data). Deleting the active profile falls
	 * back to default/first. Folders are kept unless trashFolders is set.
	 */
	async remove(id: string, opts?: { trashFolders?: boolean }): Promise<{ ok: boolean; reason?: string }> {
		const s = this.getSettings();
		if (s.profiles.length <= 1) return { ok: false, reason: "At least one profile is required." };
		if (id === DEFAULT_PROFILE_ID) {
			return { ok: false, reason: "The Default profile anchors your existing memory/skills and can't be deleted — rename it instead." };
		}
		const p = s.profiles.find((x) => x.id === id);
		if (!p) return { ok: false, reason: "Profile not found." };

		/* Commit the settings mutation before destructive cleanup. A failed
		   save restores the exact live profile list/selection and leaves every
		   data folder intact. */
		const previousProfiles = s.profiles;
		const previousActive = s.activeProfileId;
		s.profiles = previousProfiles.filter((x) => x.id !== id);
		if (s.activeProfileId === id) {
			s.activeProfileId = s.profiles.find((x) => x.id === DEFAULT_PROFILE_ID)?.id ?? s.profiles[0].id;
		}
		try {
			await this.save();
		} catch (e) {
			s.profiles = previousProfiles;
			s.activeProfileId = previousActive;
			throw e;
		}

		if (opts?.trashFolders) {
			try {
				const profileRoot = canonicalVaultPath(`openagent/profiles/${p.id}`, { label: "Profile data root" });
				await this.app.vault.adapter.rmdir(profileRoot, true);
			} catch {
				/* never created or invalid imported id — never reinterpret */
			}
			try {
				const sessDir = canonicalVaultPath(
					`${this.app.vault.configDir}/plugins/${this.pluginId}/sessions/${p.id}`,
					{ label: "Profile session root" }
				);
				await this.app.vault.adapter.rmdir(sessDir, true);
			} catch {
				/* none — profile is deleted; retained folders remain recoverable */
			}
		}
		return { ok: true };
	}
}
