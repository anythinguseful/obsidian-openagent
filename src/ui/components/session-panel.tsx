import { type RefObject, useCallback, useState } from "react";
import { App, Modal } from "obsidian";
import { PencilIcon, PlusIcon, TrashIcon, XIcon } from "../icons";
import { type SessionMeta } from "../../agent/sessions";
import { SearchField } from "./search-field";

class ConfirmSessionDeleteModal extends Modal {
	constructor(app: App, private title: string, private onConfirm: () => void) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.addClass("oa-confirm-modal");
		this.contentEl.createEl("h3", { text: `Delete chat “${this.title}”?` });
		this.contentEl.createEl("p", { text: "This permanently removes the saved conversation from Open Agent." });
		const actions = this.contentEl.createDiv({ cls: "oa-modal-actions" });
		actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
		actions.createEl("button", { text: "Delete chat", cls: "mod-warning" }).addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}
}

export interface SessionPanelGroup {
	label: string;
	items: SessionMeta[];
}

interface SessionPanelProps {
	/* React 18's RefObject<T> already types `current` as `T | null`; spelling the
	   null again produces RefObject<HTMLElement | null>, which no longer matches
	   the `ref` prop. Mirrors file-upload.tsx's inputRef. */
	app: App;
	panelRef: RefObject<HTMLElement>;
	compact: boolean;
	filter: string;
	groups: SessionPanelGroup[];
	hits: Map<string, string> | null;
	activeSessionId: string;
	onFilter: (value: string) => void;
	onNew: () => void;
	onClose: () => void;
	onSelect: (id: string) => void;
	onRename: (id: string, title: string) => Promise<void>;
	onDelete: (id: string) => void;
}

/**
 * Conversations popover UI. ChatApp owns SessionStore access, partition
 * freshness, and agent lifecycle; this component owns only panel-local rename
 * interaction and forwards every durable action through typed callbacks.
 */
export function SessionPanel({
	app,
	panelRef,
	compact,
	filter,
	groups,
	hits,
	activeSessionId,
	onFilter,
	onNew,
	onClose,
	onSelect,
	onRename,
	onDelete,
}: SessionPanelProps) {
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameDraft, setRenameDraft] = useState("");

	const cancelRename = useCallback(() => {
		setRenamingId(null);
		setRenameDraft("");
	}, []);

	const commitRename = useCallback(async () => {
		const id = renamingId;
		const title = renameDraft.trim();
		cancelRename();
		if (!id || !title) return;
		await onRename(id, title);
	}, [cancelRename, onRename, renameDraft, renamingId]);

	return (
		<div className="oa-overlay oa-panel-overlay">
			<aside ref={panelRef} className={`oa-panel${compact ? " is-compact" : ""}`}>
				<div className="oa-panel-head">
					<span>Chats</span>
					<button className="oa-icon-btn" aria-label="New chat" onClick={onNew}>
						<PlusIcon size={14} />
					</button>
					<button className="oa-icon-btn" aria-label="Close panel" onClick={onClose}>
						<XIcon size={14} />
					</button>
				</div>
				<SearchField
					variant="pill"
					className="oa-panel-search"
					placeholder="Search chats…"
					ariaLabel="Search chats"
					value={filter}
					onValue={onFilter}
				/>
				<div className="oa-panel-list">
					{groups.length === 0 ? (
						<div className="oa-panel-empty">{filter ? "No chats match." : "No saved chats yet."}</div>
					) : (
						groups.map((group) => (
							<div key={group.label} className="oa-panel-group">
								<div className="oa-panel-group-label">{group.label}</div>
								{group.items.map((session) => (
									<div
										key={session.id}
										className={`oa-panel-row${session.id === activeSessionId ? " is-active" : ""}`}
									>
										{renamingId === session.id ? (
											<div className="oa-panel-row-text">
												<input
													className="oa-panel-row-rename-input"
													aria-label="Rename chat"
													autoFocus
													value={renameDraft}
													onChange={(event) => setRenameDraft(event.target.value)}
													onBlur={() => void commitRename()}
													onKeyDown={(event) => {
														if (event.key === "Enter") void commitRename();
														else if (event.key === "Escape") cancelRename();
													}}
												/>
												<span className="oa-panel-row-meta">
													{session.turnCount} turns · {session.model || "—"}
												</span>
											</div>
										) : (
											<button
												type="button"
												className="oa-panel-row-select"
												aria-label={`Open chat “${session.title}”`}
												onClick={() => onSelect(session.id)}
											>
												<div className="oa-panel-row-text">
													<span className="oa-panel-row-title">{session.title}</span>
													<span className="oa-panel-row-meta">
														{session.turnCount} turns · {session.model || "—"}
													</span>
													{hits?.get(session.id) ? <span className="oa-panel-row-excerpt">{hits.get(session.id)}</span> : null}
												</div>
											</button>
										)}
										<button
											className="oa-panel-row-rename"
											aria-label="Rename chat"
											onClick={() => {
												setRenamingId(session.id);
												setRenameDraft(session.title);
											}}
										>
											<PencilIcon size={12} />
										</button>
										<button
											className="oa-panel-row-del"
											aria-label="Delete chat"
											onClick={() => new ConfirmSessionDeleteModal(app, session.title, () => onDelete(session.id)).open()}
										>
											<TrashIcon size={12} />
										</button>
									</div>
								))}
							</div>
						))
					)}
				</div>
			</aside>
		</div>
	);
}
