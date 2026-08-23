import { type RefObject, useCallback, useState } from "react";
import { PencilIcon, PlusIcon, TrashIcon, XIcon } from "../icons";
import { type SessionMeta } from "../../agent/sessions";
import { SearchField } from "./search-field";

export interface SessionPanelGroup {
	label: string;
	items: SessionMeta[];
}

interface SessionPanelProps {
	panelRef: RefObject<HTMLElement | null>;
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
										onClick={() => onSelect(session.id)}
									>
										<div className="oa-panel-row-text">
											{renamingId === session.id ? (
												<input
													className="oa-panel-row-rename-input"
													aria-label="Rename chat"
													autoFocus
													value={renameDraft}
													onClick={(event) => event.stopPropagation()}
													onChange={(event) => setRenameDraft(event.target.value)}
													onBlur={() => void commitRename()}
													onKeyDown={(event) => {
														if (event.key === "Enter") void commitRename();
														else if (event.key === "Escape") {
															event.stopPropagation();
															cancelRename();
														}
													}}
												/>
											) : (
												<span className="oa-panel-row-title">{session.title}</span>
											)}
											<span className="oa-panel-row-meta">
												{session.turnCount} turns · {session.model || "—"}
											</span>
											{hits?.get(session.id) ? <span className="oa-panel-row-excerpt">{hits.get(session.id)}</span> : null}
										</div>
										<button
											className="oa-panel-row-rename"
											aria-label="Rename chat"
											onClick={(event) => {
												event.stopPropagation();
												setRenamingId(session.id);
												setRenameDraft(session.title);
											}}
										>
											<PencilIcon size={12} />
										</button>
										<button
											className="oa-panel-row-del"
											aria-label="Delete chat"
											onClick={(event) => {
												event.stopPropagation();
												onDelete(session.id);
											}}
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
