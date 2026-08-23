/** changed-files — pure derivation for the assistant turn's "N files changed"
 *  card (Hermes Desktop thread/changed-files.ts parity 2026-08-02): fold the
 *  turn's LANDED file-mutating tool parts into one row per file, first-touched
 *  order. No React/DOM.
 *
 *  Honest divergences (our wire carries no inline diffs, unlike desktop):
 *  the row meta is the LAST landed operation verb with a ×N touch count —
 *  never invented +/- numbers. Only status "done" counts: pending/running
 *  calls may still change shape, denied/error/failed ones changed nothing
 *  (official rule, adapted). Derived from the turn's PERSISTED parts, so the
 *  card survives reloads and appears retroactively on old sessions. */

import type { TurnPart } from "../../types";

export interface ChangedFile {
	/** Vault-relative path the row opens (rename reports the NEW path). */
	path: string;
	/** Basename label. */
	name: string;
	/** Last landed operation verb. */
	verb: "created" | "overwritten" | "appended" | "edited" | "deleted" | "moved";
	/** Number of landed mutations to this file in this turn. */
	touches: number;
	/** The turn deleted the file (the row can't open it — flagged for the click path). */
	deleted: boolean;
}

type Mapped = { path: string; verb: ChangedFile["verb"] };

/** write/edit/rename all produce .md targets (tools.ts ensureMd); delete is
    any vault file, so it keeps the raw path. */
const ensureMd = (p: string): string => (p.endsWith(".md") ? p : `${p}.md`);

const MAP_WRITE: Record<string, ChangedFile["verb"]> = {
	create: "created",
	overwrite: "overwritten",
	append: "appended",
};

/* v0.1.121 (owner: klik file yang baru dibuat malah notice "no longer in
   the vault" padahal filenya ada) — kartu dulu menyimpan path ARGVS MENTAH,
   padahal seluruh keluarga write menulis lewat tools.ts:vaultPath yang
   mengawali settings.workspaceFolder ("Projects/…"). Resolver di bawah
   MENIRU fungsi itu persis (modul ini sengaja bebas impor obsidian —
   kalau vaultPath berubah, ubah keduanya). */
const withWorkspace = (raw: string, workspaceFolder: string): string => {
	const rawTrim = raw.trim();
	const ws = workspaceFolder.trim();
	if (ws && !rawTrim.startsWith(ws + "/") && rawTrim !== ws) return `${ws}/${rawTrim}`;
	return rawTrim;
};

export function deriveChangedFiles(parts: readonly TurnPart[], workspaceFolder = ""): ChangedFile[] {
	const byPath = new Map<string, ChangedFile>();
	for (const part of parts) {
		if (part.kind !== "tool" || part.status !== "done") continue;
		let args: Record<string, unknown>;
		try {
			args = JSON.parse(part.args) as Record<string, unknown>;
		} catch {
			continue; // malformed args — never landed as a file op we can name
		}
		let mapped: Mapped | null = null;
		switch (part.toolName) {
			case "write_note": {
				const path = String(args.path ?? "");
				if (!path) break;
				mapped = { path: ensureMd(withWorkspace(path, workspaceFolder)), verb: MAP_WRITE[String(args.mode ?? "")] ?? "overwritten" };
				break;
			}
			case "edit_note": {
				const path = String(args.path ?? "");
				if (path) mapped = { path: ensureMd(withWorkspace(path, workspaceFolder)), verb: "edited" };
				break;
			}
			case "delete_note": {
				const path = String(args.path ?? "");
				if (path) mapped = { path: withWorkspace(path, workspaceFolder), verb: "deleted" };
				break;
			}
			case "rename_move_note": {
				const path = String(args.new_path ?? "");
				if (path) mapped = { path: ensureMd(withWorkspace(path, workspaceFolder)), verb: "moved" };
				break;
			}
			default:
				break;
		}
		if (!mapped) continue;
		const existing = byPath.get(mapped.path);
		if (existing) {
			existing.touches += 1;
			existing.verb = mapped.verb; // last landed op owns the label
			existing.deleted = mapped.verb === "deleted";
		} else {
			byPath.set(mapped.path, {
				path: mapped.path,
				name: mapped.path.split("/").pop() ?? mapped.path,
				verb: mapped.verb,
				touches: 1,
				deleted: mapped.verb === "deleted",
			});
		}
	}
	return [...byPath.values()];
}
