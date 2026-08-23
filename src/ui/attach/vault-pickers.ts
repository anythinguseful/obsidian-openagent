/**
 * Attach menu · vault pickers
 * FuzzySuggestModal-based pickers (native Obsidian UX, keyboard-first) for
 * attaching vault content to the composer: notes, images, whole folders.
 * The pure helpers (extension tables, folder collector) are exported for
 * unit tests; the modal classes stay thin Obsidian adapters.
 */

import { App, FuzzySuggestModal, TFile, TFolder } from "obsidian";

/* ------------------------------- constants ------------------------------- */

/** text-like vault files the Files… picker offers */
export const VAULT_TEXT_EXT = /\.(md|markdown|txt|canvas)$/i;
/** image files the Images… picker offers (vision-capable) */
export const VAULT_IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;
/** markdown files collected by the Folder… picker */
export const VAULT_MARKDOWN_EXT = /\.md$/i;

/** Folder… caps — a folder attach is meant as context, not a vault dump */
export const FOLDER_ATTACH_MAX_FILES = 20;
export const FOLDER_ATTACH_MAX_BYTES = 200 * 1024;

/** Images… cap — base64 inflates ~33%; keep provider payloads sane */
export const IMAGE_ATTACH_MAX_BYTES = 5 * 1024 * 1024;

export function mimeFromExt(name: string): string {
	const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
	switch (ext) {
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "webp":
			return "image/webp";
		case "gif":
			return "image/gif";
		case "bmp":
			return "image/bmp";
		default:
			return "application/octet-stream";
	}
}

/* ---------------------------- folder collector ---------------------------- */

export interface FolderCollectResult {
	picked: TFile[];
	/** true when caps excluded files the folder actually contained */
	truncated: boolean;
	totalBytes: number;
	totalInFolder: number;
}

/**
 * Newest-first markdown collect under `folderPath` ("" or "/" = vault root),
 * bounded by file-count and byte caps. Oversized files are skipped (not
 * fatal) and count toward `truncated`.
 */
export function collectFolderMarkdown(
	files: TFile[],
	folderPath: string,
	maxFiles: number = FOLDER_ATTACH_MAX_FILES,
	maxBytes: number = FOLDER_ATTACH_MAX_BYTES,
	canExpose: (path: string) => boolean = () => true
): FolderCollectResult {
	const root = folderPath === "" || folderPath === "/";
	const prefix = root ? "" : folderPath.replace(/\/+$/, "") + "/";
	const inFolder = files
		.filter((f) => canExpose(f.path) && VAULT_MARKDOWN_EXT.test(f.name) && (root || f.path.startsWith(prefix)))
		.sort((a, b) => b.stat.mtime - a.stat.mtime);
	const picked: TFile[] = [];
	let totalBytes = 0;
	for (const f of inFolder) {
		if (picked.length >= maxFiles) break;
		if (totalBytes + f.stat.size > maxBytes) continue; // skip oversize, keep filling
		picked.push(f);
		totalBytes += f.stat.size;
	}
	return { picked, truncated: picked.length < inFolder.length, totalBytes, totalInFolder: inFolder.length };
}

/* --------------------------------- pickers -------------------------------- */

export class VaultFileSuggest extends FuzzySuggestModal<TFile> {
	private readonly onPick: (file: TFile) => void;
	private readonly canExpose: (path: string) => boolean;
	constructor(app: App, onPick: (file: TFile) => void, canExpose: (path: string) => boolean = () => true) {
		super(app);
		this.onPick = onPick;
		this.canExpose = canExpose;
		this.setPlaceholder("Attach a vault note…  (md · txt · canvas)");
	}
	getItems(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((f) => this.canExpose(f.path) && VAULT_TEXT_EXT.test(f.name))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}
	getItemText(file: TFile): string {
		return file.path;
	}
	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}

export class VaultImageSuggest extends FuzzySuggestModal<TFile> {
	private readonly onPick: (file: TFile) => void;
	private readonly canExpose: (path: string) => boolean;
	constructor(app: App, onPick: (file: TFile) => void, canExpose: (path: string) => boolean = () => true) {
		super(app);
		this.onPick = onPick;
		this.canExpose = canExpose;
		this.setPlaceholder("Attach a vault image…  (png · jpg · webp · gif · bmp)");
	}
	getItems(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((f) => this.canExpose(f.path) && VAULT_IMAGE_EXT.test(f.name))
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}
	getItemText(file: TFile): string {
		return file.path;
	}
	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}

export class VaultFolderSuggest extends FuzzySuggestModal<TFolder> {
	private readonly onPick: (folder: TFolder) => void;
	private readonly canExpose: (path: string) => boolean;
	constructor(app: App, onPick: (folder: TFolder) => void, canExpose: (path: string) => boolean = () => true) {
		super(app);
		this.onPick = onPick;
		this.canExpose = canExpose;
		this.setPlaceholder("Attach a folder's notes…");
	}
	getItems(): TFolder[] {
		const out: TFolder[] = [];
		const walk = (folder: TFolder) => {
			if ((folder.isRoot() && this.canExpose("")) || (!folder.isRoot() && this.canExpose(folder.path))) out.push(folder);
			for (const child of folder.children) if (child instanceof TFolder) walk(child);
		};
		walk(this.app.vault.getRoot());
		return out;
	}
	getItemText(folder: TFolder): string {
		return folder.isRoot() ? "/ (vault root)" : folder.path;
	}
	onChooseItem(folder: TFolder): void {
		this.onPick(folder);
	}
}
