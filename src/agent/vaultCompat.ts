/**
 * Vault compat shims — obsidian APIs newer than minAppVersion (1.5.0),
 * feature-detected at call time (working agreement lesson 24, 2026-07-31).
 *
 * Why this file exists: the `obsidian` typings range (`^x.y`) FLOATS to the
 * latest 1.x on every fresh install, so "it compiles" never proves "it runs
 * on the oldest app we promise". Cross-compile proof: this project must
 * typecheck against BOTH the latest typings and obsidian@1.5.7 typings
 * (the first published 1.5.x; the obsidian npm package has no 1.5.0–1.5.6).
 */
import type { App, FileManager, TAbstractFile } from "obsidian";

/**
 * `FileManager#trashFile` (respects the user's system/app trash preferences,
 * emits the file-explorer events) arrived after 1.5.7 — it is present in the
 * 1.6.6 typings but absent in 1.5.7. On older apps, fall back to the
 * always-available `Vault#trash(file, system)`.
 */
export async function trashRespectingPrefs(app: App, file: TAbstractFile): Promise<void> {
	const trashFile = (
		app.fileManager as FileManager & { trashFile?: (file: TAbstractFile) => Promise<void> }
	).trashFile;
	if (typeof trashFile === "function") {
		await trashFile.call(app.fileManager, file);
	} else {
		await app.vault.trash(file, true);
	}
}
