/**
 * prompt-kit · FileUpload
 * Ported from ibelick/prompt-kit (file-upload) — drag & drop wrapper with a
 * hidden file input (FileUploadTrigger) and a full-surface drop overlay
 * (FileUploadContent).
 *
 * Obsidian adaptation: prompt-kit attaches drag listeners to `window`,
 * which in Obsidian would break the app's own drop behaviour (e.g. dropping
 * files into a note). Listeners are therefore scoped to the component root,
 * and the overlay renders inline instead of via a React portal.
 */

import {
	ChangeEvent,
	Dispatch,
	ReactNode,
	SetStateAction,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { UploadIcon } from "../icons";
import { IMAGE_ATTACH_MAX_BYTES } from "../attach/vault-pickers";
import { PDF_ATTACH_MAX_BYTES, PdfWorkerSource, extractPdfText, isPdfLike } from "../attach/pdf";

interface FileUploadContextValue {
	isDragging: boolean;
	setIsDragging: Dispatch<SetStateAction<boolean>>;
	inputRef: React.RefObject<HTMLInputElement>;
	disabled?: boolean;
}

const FileUploadContext = createContext<FileUploadContextValue | null>(null);

export interface UploadedFile {
	id: string;
	name: string;
	/** text payload (text kind) or a placeholder note (image kind) */
	content: string;
	size: number;
	/** "text" (default) or "image" — vault images can ride the vision path */
	kind?: "text" | "image";
	/** image kind: data:<mime>;base64,… ready for image_url wiring */
	dataUrl?: string;
	/** vault path when the file came from the vault (vs disk upload) */
	path?: string;
}

/** Text upload cap from disk (owner decision 2026-07-21): was 256 KB, which
 *  silently rejected every real-world file the owner picked (PDF/screenshots/
 *  exports "I can't upload any file type"). Notice strings ALWAYS carry the
 *  measured size so a legitimately-small file failing would surface instantly. */
export const MAX_TEXT_BYTES = 1024 * 1024;
const TEXT_EXT =
	/\.(md|markdown|txt|text|json|jsonc|csv|tsv|ya?ml|xml|html?|css|s[ac]ss|js|jsx|ts|tsx|mjs|cjs|py|rs|go|java|kt|c|h|hpp|cpp|cs|rb|php|sh|bash|zsh|fish|sql|lua|swift|toml|ini|cfg|conf|env|log|svg|canvas)$/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

export function isTextLike(file: File): boolean {
	return file.type.startsWith("text/") || file.type === "application/json" || TEXT_EXT.test(file.name);
}

/** disk images ride the same vision path as vault images (dataUrl chip) */
export function isImageLike(file: File): boolean {
	return file.type.startsWith("image/") || IMAGE_EXT.test(file.name);
}

function readAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result ?? ""));
		r.onerror = () => reject(new Error("read failed"));
		r.readAsDataURL(file);
	});
}

/** prompt-kit `accept` semantics: ".ext" · "image/*" · exact mime, comma-joined */
export function acceptOk(file: File, accept: string): boolean {
	const tokens = accept
		.split(",")
		.map((t) => t.trim().toLowerCase())
		.filter(Boolean);
	if (!tokens.length) return true;
	const name = file.name.toLowerCase();
	const mime = (file.type || "").toLowerCase();
	return tokens.some((t) => {
		if (t.startsWith(".")) return name.endsWith(t);
		if (t.endsWith("/*")) return mime.startsWith(t.slice(0, -1));
		return mime === t;
	});
}

export function FileUpload({
	onFilesAdded,
	onRejected,
	children,
	multiple = true,
	disabled = false,
	accept,
	pdfWorker,
}: {
	onFilesAdded: (files: UploadedFile[]) => void;
	onRejected?: (file: File, reason: string) => void;
	children: ReactNode;
	multiple?: boolean;
	disabled?: boolean;
	/** prompt-kit: accepted file types (".md,image/*,application/json") */
	accept?: string;
	/** v0.1.130: sumber byte vendor pdf.worker (app adapter + plugin dir).
	    Tanpa ini ekstraksi PDF tak bisa menunjuk worker eksternal. */
	pdfWorker?: PdfWorkerSource;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const dragCounter = useRef(0);

	const handleFiles = useCallback(
		async (files: File[]) => {
			const picked = multiple ? files : files.slice(0, 1);
			const read = await Promise.all(
				picked.map(async (file): Promise<UploadedFile | null> => {
					if (accept && !acceptOk(file, accept)) {
						onRejected?.(file, "type not accepted");
						return null;
					}
					const kb = Math.max(1, Math.round(file.size / 1024));
					if (isImageLike(file)) {
						if (file.size > IMAGE_ATTACH_MAX_BYTES) {
							onRejected?.(file, `${Math.round(file.size / 1048576)} MB — over the 5 MB image limit`);
							return null;
						}
						try {
							const dataUrl = await readAsDataUrl(file);
							return {
								id: `${file.name}-${file.size}-${Date.now()}`,
								name: file.name,
								content: "(attached image)",
								size: file.size,
								kind: "image",
								dataUrl,
							};
						} catch {
							onRejected?.(file, "could not be read");
							return null;
						}
					}
					if (isPdfLike(file.name, file.type)) {
						if (file.size > PDF_ATTACH_MAX_BYTES) {
							onRejected?.(file, `${Math.round(file.size / 1048576)} MB — over the 20 MB PDF limit`);
							return null;
						}
						try {
							const buf = await file.arrayBuffer();
							const text = await extractPdfText(buf, MAX_TEXT_BYTES, pdfWorker);
							if (!text) {
								onRejected?.(file, "this PDF has no text layer (scanned images can't be read yet)");
								return null;
							}
							return {
								id: `${file.name}-${file.size}-${Date.now()}`,
								name: file.name,
								content: text,
								size: file.size,
							};
						} catch (e) {
							console.debug("[openagent] pdf extraction failed:", e);
							onRejected?.(file, "could not extract the PDF text");
							return null;
						}
					}
					if (!isTextLike(file)) {
						onRejected?.(file, "unsupported type — attach text/code files, images, or PDF (Word not supported yet)");
						return null;
					}
					if (file.size > MAX_TEXT_BYTES) {
						onRejected?.(file, `${kb} KB — over the 1 MB text-file limit`);
						return null;
					}
					try {
						const content = await file.text();
						return {
							id: `${file.name}-${file.size}-${Date.now()}`,
							name: file.name,
							content: content.slice(0, MAX_TEXT_BYTES),
							size: file.size,
						};
					} catch {
						onRejected?.(file, "could not be read");
						return null;
					}
				})
			);
			const ok = read.filter((f): f is UploadedFile => f !== null);
			if (ok.length) onFilesAdded(ok);
		},
		[multiple, accept, onFilesAdded, onRejected]
	);

	useEffect(() => {
		const root = rootRef.current;
		if (!root || disabled) return;

		const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

		const onDragEnter = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			e.stopPropagation();
			dragCounter.current++;
			setIsDragging(true);
		};
		const onDragOver = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			e.stopPropagation();
		};
		const onDragLeave = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			e.stopPropagation();
			dragCounter.current--;
			if (dragCounter.current <= 0) {
				dragCounter.current = 0;
				setIsDragging(false);
			}
		};
		const onDrop = (e: DragEvent) => {
			if (!hasFiles(e)) return;
			e.preventDefault();
			e.stopPropagation();
			dragCounter.current = 0;
			setIsDragging(false);
			const files = Array.from(e.dataTransfer?.files ?? []);
			if (files.length) void handleFiles(files);
		};

		root.addEventListener("dragenter", onDragEnter);
		root.addEventListener("dragover", onDragOver);
		root.addEventListener("dragleave", onDragLeave);
		root.addEventListener("drop", onDrop);
		return () => {
			root.removeEventListener("dragenter", onDragEnter);
			root.removeEventListener("dragover", onDragOver);
			root.removeEventListener("dragleave", onDragLeave);
			root.removeEventListener("drop", onDrop);
		};
	}, [disabled, handleFiles]);

	const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
		if (e.target.files?.length) {
			void handleFiles(Array.from(e.target.files));
			e.target.value = "";
		}
	};

	return (
		<FileUploadContext.Provider value={{ isDragging, setIsDragging, inputRef, disabled }}>
			<div
				ref={rootRef}
				className="oa-upload-root"
				onPaste={(e) => {
					const files = Array.from(e.clipboardData?.files ?? []);
					if (files.length) {
						e.preventDefault();
						void handleFiles(files);
					}
				}}
			>
				{children}
				<input
					ref={inputRef}
					type="file"
					multiple={multiple}
					accept={accept}
					onChange={handleFileSelect}
					hidden
				/>
			</div>
		</FileUploadContext.Provider>
	);
}

export function FileUploadTrigger({
	children,
	className = "",
	title,
	ariaLabel,
}: {
	children: ReactNode;
	className?: string;
	title?: string;
	ariaLabel?: string;
}) {
	const ctx = useContext(FileUploadContext);
	return (
		<button
			className={className}
			aria-label={ariaLabel ?? title}
			onClick={(e) => {
				e.stopPropagation();
				ctx?.inputRef.current?.click();
			}}
			disabled={ctx?.disabled}
			type="button"
		>
			{children}
		</button>
	);
}

/**
 * Programmatic access to the hidden input — used by the attach menu's
 * "File browser…" item (a menu row can't itself be a FileUploadTrigger
 * because the trigger renders its own button).
 * Returns null outside a <FileUpload> tree / when disabled.
 */
export function useFileUploadBrowse(): (() => void) | null {
	const ctx = useContext(FileUploadContext);
	if (!ctx || ctx.disabled) return null;
	return () => ctx.inputRef.current?.click();
}

/** Read an image TFile as a data URL is in attach-menu (Tahap C) — the
 *  UploadedFile shape gains optional vision fields here so both disk
 *  uploads and vault images share one chip pipeline. */

export function FileUploadContent({ text = "Drop files to attach" }: { text?: string }) {
	const ctx = useContext(FileUploadContext);
	if (!ctx?.isDragging || ctx.disabled) return null;
	return (
		<div className="oa-upload-overlay" aria-hidden="true">
			<div className="oa-upload-overlay-box">
				<UploadIcon size={20} />
				<span>{text}</span>
			</div>
		</div>
	);
}
