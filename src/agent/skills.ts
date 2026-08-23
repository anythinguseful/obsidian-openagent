/**
 * Skills system — Hermes' closed learning loop, agentskills.io format.
 *
 * Skills are folders containing a SKILL.md with YAML frontmatter:
 *
 *   openagent/openagent-skills/
 *     daily-review/
 *       SKILL.md
 *
 * The agent can read them (injected into the system prompt) and can
 * author new ones via the `create_skill` tool — so the agent gets
 * better at recurring tasks the more it is used.
 */

import { App, TFile, TFolder, normalizePath, parseYaml } from "obsidian";
import { trashRespectingPrefs } from "./vaultCompat";
import { canonicalVaultPath, pathContains } from "./workspacePolicy";

const noop = (): void => {};

/** Canonical on-disk folder segment used by every create/import path. */
export function skillStorageSlug(name: string): string {
	const safe = name
		.toLowerCase()
		.replace(/[^a-z0-9-_\s]/g, "")
		.trim()
		.replace(/\s+/g, "-");
	if (!safe) throw new Error("Skill name must contain at least one letter or number.");
	return safe;
}

export interface Skill {
	name: string;
	description: string;
	whenToUse: string;
	instructions: string;
	path: string;
	/** Per-skill master switch (default true). */
	enabled: boolean;
	/** v0.1.76 (Copilot showInContextMenu parity): show in the editor
	   right-click "Run skill on selection…" picker — `contextMenu: false`
	   in SKILL.md frontmatter hides it (default true). Arming by explicit
	   name keeps working regardless. */
	ctxMenu?: boolean;
}

export class SkillsStore {
	private app: App;
	private folder: string;

	constructor(app: App, folder: string) {
		this.app = app;
		this.folder = canonicalVaultPath(folder, { label: "Managed skills folder" });
	}

	setFolder(folder: string) {
		this.folder = canonicalVaultPath(folder, { label: "Managed skills folder" });
	}

	private containedPath(path: string, label = "Managed skill path"): string {
		const clean = canonicalVaultPath(path, { label });
		if (!pathContains(this.folder, clean)) throw new Error(`${label} escaped the managed skills folder.`);
		return clean;
	}

	get currentFolder(): string {
		return this.folder;
	}

	async loadSkills(): Promise<Skill[]> {
		const skills: Skill[] = [];
		const files = this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(this.folder + "/") && f.name === "SKILL.md");
		for (const f of files) {
			const skill = await this.parseSkill(f);
			if (skill) skills.push(skill);
		}
		return skills;
	}

	private async parseSkill(file: TFile): Promise<Skill | null> {
		try {
			const raw = await this.app.vault.read(file);
			const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
			let meta: Record<string, any> = {};
			let body = raw;
			if (fmMatch) {
				meta = parseYaml(fmMatch[1]) ?? {};
				body = fmMatch[2];
			}
			return {
				name: String(meta.name ?? file.parent?.name ?? file.basename),
				description: String(meta.description ?? ""),
				whenToUse: String(meta.when_to_use ?? meta.whenToUse ?? ""),
				instructions: body.trim(),
				path: file.path,
				enabled: meta.enabled !== false,
				ctxMenu: meta.contextMenu !== false,
			};
		} catch {
			return null;
		}
	}

	async createSkill(name: string, description: string, whenToUse: string, instructions: string): Promise<string> {
		const safe = skillStorageSlug(name);
		const path = this.containedPath(`${this.folder}/${safe}/SKILL.md`, "New skill path");
		const dir = path.split("/").slice(0, -1).join("/");
		await this.app.vault.createFolder(dir).catch(noop);
		const content = [
			"---",
			`name: ${safe}`,
			`description: ${description.replace(/\n/g, " ")}`,
			`when_to_use: ${(whenToUse || description).replace(/\n/g, " ")}`,
			`created: ${new Date().toISOString().slice(0, 10)}`,
			"---",
			"",
			instructions.trim(),
			"",
		].join("\n");
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(path, content);
		}
		return path;
	}

	/* ---- v0.1.132: Hermes skill_view / skill_manage parity (gap doc §3) ---- */

	/** Resolve a skill by name: exact → case-insensitive; ambiguity is an
	   error listing candidates (cron's findCronTask pattern). */
	async resolveSkill(name: string): Promise<{ skill?: Skill; error?: string }> {
		const want = name.trim();
		if (!want) return { error: "Please pass a skill name — list_skills shows the installed names." };
		const skills = await this.loadSkills();
		const exact = skills.find((s) => s.name === want);
		if (exact) return { skill: exact };
		const ci = skills.filter((s) => s.name.toLowerCase() === want.toLowerCase());
		if (ci.length === 1) return { skill: ci[0] };
		if (ci.length > 1)
			return { error: `"${want}" is ambiguous — matches: ${ci.map((s) => `"${s.name}"`).join(", ")}. Use the exact name.` };
		return {
			error: `Skill not found: "${want}". Installed: ${skills.map((s) => s.name).slice(0, 12).join(", ") || "(none)"}.`,
		};
	}

	/** Folder of a skill (parent of its SKILL.md). */
	skillDir(skill: Skill): string {
		const path = this.containedPath(skill.path, "Skill file");
		return path.split("/").slice(0, -1).join("/");
	}

	/** Resolve a user-given path RELATIVE to the skill folder — traversal
	   guard: absolute paths and all dot segments are refused (null = refused). */
	resolveSkillRel(skillDir: string, rel: string): string | null {
		try {
			const dir = this.containedPath(skillDir, "Skill folder");
			const clean = canonicalVaultPath(rel, { label: "Skill-relative path" });
			const abs = this.containedPath(`${dir}/${clean}`, "Skill supporting file");
			return pathContains(dir, abs) ? abs : null;
		} catch {
			return null;
		}
	}

	/** Supporting files beside SKILL.md (any extension — references,
	   templates, scripts; getAllLoadedFiles covers non-md too). */
	listSkillFiles(skill: Skill): string[] {
		const dir = this.skillDir(skill);
		return this.app.vault
			.getAllLoadedFiles()
			.filter((f) => f instanceof TFile && f.path.startsWith(dir + "/") && f.path !== skill.path)
			.map((f) => f.path.slice(dir.length + 1))
			.sort();
	}

	/** Full SKILL.md raw text. */
	async readSkillRaw(skill: Skill): Promise<string> {
		const f = this.app.vault.getAbstractFileByPath(skill.path);
		if (!(f instanceof TFile)) throw new Error(`Skill file vanished: ${skill.path}`);
		return this.app.vault.read(f);
	}

	/** Read one supporting file (traversal-guarded, whole content). */
	async readSkillFile(skill: Skill, relPath: string): Promise<string> {
		const abs = this.resolveSkillRel(this.skillDir(skill), relPath);
		if (!abs) throw new Error(`Path refused: "${relPath}" must stay inside the skill folder (no absolute paths, no "..").`);
		const f = this.app.vault.getAbstractFileByPath(abs);
		if (!(f instanceof TFile)) throw new Error(`"${relPath}" not found in skill "${skill.name}" — view_skill shows the supporting files it has.`);
		return this.app.vault.read(f);
	}

	/** Hermes "edit": full SKILL.md replacement (structural rewrites). */
	async updateSkillRaw(name: string, content: string): Promise<string> {
		const r = await this.resolveSkill(name);
		if (!r.skill) throw new Error(r.error);
		const f = this.app.vault.getAbstractFileByPath(r.skill.path);
		if (!(f instanceof TFile)) throw new Error(`Skill file vanished: ${r.skill.path}`);
		await this.app.vault.modify(f, content);
		return r.skill.path;
	}

	/** Hermes "patch" (PREFERRED for small fixes): old_string must occur
	   exactly once — zero and multiple matches both fail with honest counts. */
	async patchSkill(name: string, oldStr: string, newStr: string): Promise<void> {
		const r = await this.resolveSkill(name);
		if (!r.skill) throw new Error(r.error);
		const raw = await this.readSkillRaw(r.skill);
		const hits = oldStr.length === 0 ? 0 : raw.split(oldStr).length - 1;
		if (hits === 0)
			throw new Error(`old_string not found in "${r.skill.name}" — call view_skill to see the current content.`);
		if (hits > 1)
			throw new Error(`old_string matches ${hits} locations in "${r.skill.name}" — include more surrounding context so it is unique.`);
		const f = this.app.vault.getAbstractFileByPath(r.skill.path);
		if (!(f instanceof TFile)) throw new Error(`Skill file vanished: ${r.skill.path}`);
		await this.app.vault.modify(f, raw.split(oldStr).join(newStr));
	}

	/** Add/update a supporting file inside the skill folder. SKILL.md itself
	   is refused — it goes through update/patch (Hermes separates them too). */
	async writeSkillFile(name: string, relPath: string, content: string): Promise<string> {
		const r = await this.resolveSkill(name);
		if (!r.skill) throw new Error(r.error);
		if (normalizePath(relPath.trim()) === "SKILL.md")
			throw new Error("Refused: SKILL.md goes through update (full rewrite) or patch (targeted fix), not write_file.");
		const abs = this.resolveSkillRel(this.skillDir(r.skill), relPath);
		if (!abs) throw new Error(`Path refused: "${relPath}" must stay inside the skill folder (no absolute paths, no "..").`);
		await this.app.vault.createFolder(abs.split("/").slice(0, -1).join("/")).catch(noop);
		const existing = this.app.vault.getAbstractFileByPath(abs);
		if (existing instanceof TFile) await this.app.vault.modify(existing, content);
		else await this.app.vault.create(abs, content);
		return abs;
	}

	/** Remove a supporting file (trash per Obsidian prefs; SKILL.md refused). */
	async removeSkillFile(name: string, relPath: string): Promise<void> {
		const r = await this.resolveSkill(name);
		if (!r.skill) throw new Error(r.error);
		if (normalizePath(relPath.trim()) === "SKILL.md")
			throw new Error("Refused: delete the whole skill with action delete instead of removing its SKILL.md.");
		const abs = this.resolveSkillRel(this.skillDir(r.skill), relPath);
		if (!abs) throw new Error(`Path refused: "${relPath}" must stay inside the skill folder (no absolute paths, no "..").`);
		const f = this.app.vault.getAbstractFileByPath(abs);
		if (!(f instanceof TFile)) throw new Error(`"${relPath}" not found in skill "${r.skill.name}".`);
		await trashRespectingPrefs(this.app, f);
	}

	/** Hermes skill_manage delete: the WHOLE skill (SKILL.md + supporting
	   files) — trashes the skill folder, not just the entry file. */
	async deleteSkillTree(name: string): Promise<string> {
		const r = await this.resolveSkill(name);
		if (!r.skill) throw new Error(r.error);
		const dir = this.skillDir(r.skill);
		const folder = this.app.vault.getAbstractFileByPath(dir);
		if (folder instanceof TFolder) await trashRespectingPrefs(this.app, folder);
		else await this.deleteSkill(r.skill.path);
		return r.skill.name;
	}

	/** Remove a skill (its SKILL.md goes to the configured trash location). */
	async deleteSkill(path: string): Promise<void> {
		const f = this.app.vault.getAbstractFileByPath(this.containedPath(path, "Skill deletion path"));
		if (f instanceof TFile) await trashRespectingPrefs(this.app, f);
	}

	/** Write the `enabled` flag into the SKILL.md frontmatter, preserving the rest. */
	async setSkillEnabled(path: string, enabled: boolean): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.containedPath(path, "Skill toggle path"));
		if (!(file instanceof TFile)) return;
		const content = await this.app.vault.read(file);
		let next: string;
		const fm = content.match(/^---\n([\s\S]*?)\n---/);
		if (fm) {
			const body = fm[1];
			const replaced = /^enabled:.*$/m.test(body)
				? body.replace(/^enabled:.*$/m, `enabled: ${enabled}`)
				: `${body}\nenabled: ${enabled}`;
			next = content.replace(fm[0], `---\n${replaced}\n---`);
		} else {
			next = `---\nenabled: ${enabled}\n---\n\n` + content;
		}
		await this.app.vault.modify(file, next);
	}

	/** Compact catalog injected into the system prompt (skips disabled skills). */
	catalog(skills: Skill[], maxChars = 3000): string {
		const active = skills.filter((s) => s.enabled);
		if (active.length === 0) return "";
		let out = "";
		for (const s of active) {
			const block = `### ${s.name}\nTrigger: ${s.whenToUse || s.description}\n${s.instructions}\n\n`;
			if (out.length + block.length > maxChars) break;
			out += block;
		}
		return out.trim();
	}
}
