import { useEffect, useRef, useState, type RefObject } from "react";
import { copyText } from "../clipboard";
import { XIcon } from "../icons";
import {
	filterTrajectoryRows,
	type TrajectoryFilter,
	type TrajectoryRow,
} from "../../agent/sessionEvents";

interface TrajectoryPanelProps {
	panelRef: RefObject<HTMLElement>;
	rows: TrajectoryRow[];
	onClose: () => void;
	/** True while AgentLoop is the live driver — inject is next-step, not a new turn. */
	injectEnabled?: boolean;
	onInject?: (text: string) => boolean;
}

const FILTERS: { id: TrajectoryFilter; label: string }[] = [
	{ id: "all", label: "All" },
	{ id: "user", label: "User" },
	{ id: "assistant", label: "Assistant" },
	{ id: "tool", label: "Tool" },
	{ id: "inject", label: "Inject" },
];

/**
 * Trajectory popover — same chrome as Conversations (`oa-panel`).
 * Projects `Session.events` only; not a second chat transcript.
 */
export function TrajectoryPanel({ panelRef, rows, onClose, injectEnabled, onInject }: TrajectoryPanelProps) {
	const listRef = useRef<HTMLDivElement>(null);
	const [filter, setFilter] = useState<TrajectoryFilter>("all");
	const [draft, setDraft] = useState("");
	const [openKey, setOpenKey] = useState<string | null>(null);
	const [copyNote, setCopyNote] = useState<{ key: string; ok: boolean } | null>(null);
	const [injectNote, setInjectNote] = useState<"ok" | "fail" | null>(null);
	const visible = filterTrajectoryRows(rows, filter);
	useEffect(() => {
		const el = listRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [visible.length]);

	const submitInject = () => {
		const text = draft.trim();
		if (!text || !onInject) return;
		const ok = onInject(text);
		if (ok) setDraft("");
		setInjectNote(ok ? "ok" : "fail");
		window.setTimeout(() => setInjectNote(null), 1200);
	};

	return (
		<div className="oa-overlay oa-panel-overlay">
			<aside ref={panelRef} className="oa-panel oa-trajectory-panel">
				<div className="oa-panel-head">
					<span>Trajectory</span>
					<button className="oa-icon-btn" aria-label="Close trajectory" onClick={onClose}>
						<XIcon size={14} />
					</button>
				</div>
				<div className="oa-traj-filters" role="tablist" aria-label="Filter by source">
					{FILTERS.map((f) => (
						<button
							key={f.id}
							type="button"
							role="tab"
							aria-selected={filter === f.id}
							className={`oa-traj-filter${filter === f.id ? " is-active" : ""}`}
							onClick={() => setFilter(f.id)}
						>
							{f.label}
						</button>
					))}
				</div>
				<div className="oa-panel-list" ref={listRef}>
					{visible.length === 0 ? (
						<div className="oa-panel-empty">
							{rows.length === 0 ? "No trajectory yet — send a message." : "No events for this source."}
						</div>
					) : (
						visible.map((row) =>
							row.kind === "heading" ? (
								<div key={row.key} className="oa-panel-group-label oa-traj-head">
									{row.label}
								</div>
							) : (
								<div
									key={row.key}
									className={`oa-traj-row is-${row.type.replace("/", "-")}${openKey === row.key ? " is-open" : ""}`}
								>
									<button
										type="button"
										className="oa-traj-row-main"
										aria-expanded={row.body ? openKey === row.key : undefined}
										disabled={!row.body}
										onClick={() => setOpenKey((k) => (k === row.key ? null : row.key))}
									>
										<span className="oa-traj-label">{row.label}</span>
										{openKey === row.key && row.body ? (
											<pre className="oa-traj-body">{row.body.length > 16000 ? `${row.body.slice(0, 16000)}\n…` : row.body}</pre>
										) : row.detail ? (
											<span className="oa-traj-detail">{row.detail}</span>
										) : null}
									</button>
									{openKey === row.key && row.body ? (
										<button
											type="button"
											className={`oa-traj-copy${copyNote?.key === row.key && !copyNote.ok ? " is-fail" : ""}`}
											aria-live="polite"
											onClick={() => {
												copyText(row.body ?? "")
													.then((ok) => {
														setCopyNote({ key: row.key, ok });
														window.setTimeout(
															() => setCopyNote((n) => (n?.key === row.key ? null : n)),
															1200
														);
													})
													.catch(() => setCopyNote({ key: row.key, ok: false }));
											}}
										>
											{copyNote?.key === row.key ? (copyNote.ok ? "Copied" : "Copy failed") : "Copy"}
										</button>
									) : null}
								</div>
							)
						)
					)}
				</div>
				{onInject ? (
					<div className="oa-traj-inject">
						<input
							className="oa-traj-inject-input"
							type="text"
							value={draft}
							disabled={!injectEnabled}
							placeholder={injectEnabled ? "Inject next step…" : "Inject while the agent is running"}
							aria-label="Inject next step"
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									submitInject();
								}
							}}
						/>
						<button
							type="button"
							className="oa-traj-inject-btn"
							disabled={!injectEnabled || !draft.trim()}
							onClick={submitInject}
						>
							Inject
						</button>
						<span className={`oa-traj-inject-note${injectNote === "fail" ? " is-fail" : ""}`} aria-live="polite">
							{injectNote === "ok" ? "Queued" : injectNote === "fail" ? "Inject failed" : ""}
						</span>
					</div>
				) : null}
			</aside>
		</div>
	);
}
