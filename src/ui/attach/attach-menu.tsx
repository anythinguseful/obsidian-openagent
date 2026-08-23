/**
 * Attach menu — the composer [+] popover.
 * Reference: the user's target design (section header, icon rows, dividers,
 * footer tip) mapped onto Obsidian CSS vars and our oa-* geometry. Rows that
 * open vault pickers delegate to the parent (ChatApp owns the App handle);
 * "Prompt snippets…" is an inline submenu inside the same popover.
 */

import { ReactElement, useState } from "react";
import type { PromptSnippet } from "../../settings";
import { useFileUploadBrowse } from "../components/file-upload";
import {
	ArrowLeftIcon,
	CheckIcon,
	ChevronRightIcon,
	FileIcon,
	FolderIcon,
	ImageIcon,
	NoteIcon,
	SnippetIcon,
	UploadIcon,
} from "../icons";

export interface AttachMenuProps {
	onClose: () => void;
	/** basename of the workspace's active file; null → row disabled */
	activeFileName: string | null;
	attachNoteActive: boolean;
	/** agent mid-run: attaching is disabled, inserting snippets stays allowed */
	running: boolean;
	onToggleActiveNote: () => void;
	onPickVaultFile: () => void;
	onPickImage: () => void;
	onPickFolder: () => void;
	snippets: PromptSnippet[];
	onInsertSnippet: (snippet: PromptSnippet) => void;
}

interface RowSpec {
	key: string;
	icon: ReactElement;
	label: string;
	sub?: string;
	checked?: boolean;
	disabled?: boolean;
	onSelect: () => void;
	trailing?: ReactElement;
}

function Row({ icon, label, sub, checked, disabled, onSelect, trailing }: RowSpec) {
	return (
		<button
			type="button"
			role="menuitem"
			className="oa-attach-item"
			disabled={disabled}
			aria-disabled={disabled || undefined}
			onClick={onSelect}
		>
			<span className="oa-attach-item-icon" aria-hidden="true">
				{icon}
			</span>
			<span className="oa-attach-item-text">
				<span className="oa-attach-item-label">{label}</span>
				{sub ? <span className="oa-attach-item-sub">{sub}</span> : null}
			</span>
			{checked ? (
				<span className="oa-attach-item-check" aria-label="attached">
					<CheckIcon size={12} />
				</span>
			) : null}
			{trailing ?? null}
		</button>
	);
}

/**
 * Dumb popover — outside-click / Escape closing is owned by the parent
 * (its anchor wraps both the [+] button and this menu, so clicking the
 * button to toggle can't race the menu's own close listener).
 */
export function AttachMenu(props: AttachMenuProps) {
	const [view, setView] = useState<"root" | "snippets">("root");

	const { running } = props;
	/* "File browser…" must grab the FileUpload context HERE — this component
	   renders INSIDE the <FileUpload> provider, while ChatApp (the hook's
	   former home) is the provider's parent and only saw null. */
	const browseDisk = useFileUploadBrowse();
	const fire = (fn: () => void) => () => {
		props.onClose();
		fn();
	};

	if (view === "snippets") {
		return (
			<div className="oa-attach-menu" role="menu" aria-label="Prompt snippets">
				<div className="oa-attach-menu-head oa-attach-menu-head-back">
					<button
						type="button"
						className="oa-attach-back"
						onClick={() => setView("root")}
						aria-label="Back to attach menu"
					>
						<ArrowLeftIcon size={12} />
					</button>
					<span>PROMPT SNIPPETS</span>
				</div>
				{props.snippets.length === 0 ? (
					<div className="oa-attach-empty">None enabled — add or re-enable them via the Snippets toggle in Settings → Commands (open a command to change it).</div>
				) : (
					props.snippets.map((s) => (
						<button
							type="button"
							role="menuitem"
							key={s.id}
							className="oa-attach-item"
							onClick={fire(() => props.onInsertSnippet(s))}
						>
							<span className="oa-attach-item-icon" aria-hidden="true">
								<SnippetIcon size={13} />
							</span>
							<span className="oa-attach-item-text">
								<span className="oa-attach-item-label">{s.title}</span>
								<span className="oa-attach-item-sub">{s.text}</span>
							</span>
						</button>
					))
				)}
			</div>
		);
	}

	return (
		<div className="oa-attach-menu" role="menu" aria-label="Attach">
			<div className="oa-attach-menu-head">ATTACH</div>
			<Row
				key="active-note"
				icon={<NoteIcon size={13} />}
				label={props.activeFileName ? `Active note: ${props.activeFileName}` : "Active note"}
				sub={props.activeFileName ? undefined : "No active note"}
				checked={props.attachNoteActive}
				disabled={running || !props.activeFileName}
				onSelect={fire(props.onToggleActiveNote)}
			/>
			<Row
				key="vault-file"
				icon={<FileIcon size={13} />}
				label="Files…"
				sub="Attach notes from the vault"
				disabled={running}
				onSelect={fire(props.onPickVaultFile)}
			/>
			<Row
				key="vault-image"
				icon={<ImageIcon size={13} />}
				label="Images…"
				sub="Attach vault images (vision when supported)"
				disabled={running}
				onSelect={fire(props.onPickImage)}
			/>
			<Row
				key="vault-folder"
				icon={<FolderIcon size={13} />}
				label="Folder…"
				sub="Attach a folder's notes"
				disabled={running}
				onSelect={fire(props.onPickFolder)}
			/>
			<Row
				key="disk-file"
				icon={<UploadIcon size={13} />}
				label="File browser…"
				sub="Upload files from this device"
				disabled={running || !browseDisk}
				onSelect={fire(() => browseDisk?.())}
			/>
			<div className="oa-attach-sep" role="separator" />
			<Row
				key="snippets"
				icon={<SnippetIcon size={13} />}
				label="Prompt snippets…"
				sub={props.snippets.length ? `${props.snippets.length} saved` : "None yet"}
				disabled={false}
				onSelect={() => setView("snippets")}
				trailing={
					<span className="oa-attach-item-chev" aria-hidden="true">
						<ChevronRightIcon size={12} />
					</span>
				}
			/>
			<div className="oa-attach-sep" role="separator" />
			<div className="oa-attach-tip">
				Tip: type <kbd className="oa-kbd">@</kbd> to reference files inline.
			</div>
		</div>
	);
}
