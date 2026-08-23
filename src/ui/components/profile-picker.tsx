/**
 * Profile picker — Hermes Desktop-style identity switcher in the chat
 * topbar: a compact pill (color dot + profile name) opening a menu of
 * profiles with the active one checked, plus a manage shortcut. Search
 * appears only when there are many profiles.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AgentProfile } from "../../settings";
import { CheckIcon, ChevronDownIcon, SettingsIcon } from "../icons";
import { SearchField } from "./search-field";

export function ProfilePicker({
	profiles,
	activeId,
	disabled,
	onSelect,
	onManage,
}: {
	profiles: AgentProfile[];
	activeId: string;
	disabled?: boolean;
	onSelect: (id: string) => void;
	onManage: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [filter, setFilter] = useState("");
	const wrapRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDocDown = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("mousedown", onDocDown);
		document.addEventListener("keydown", onKey);
		if (profiles.length > 6) window.setTimeout(() => inputRef.current?.focus(), 30);
		return () => {
			document.removeEventListener("mousedown", onDocDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open, profiles.length]);

	const options = useMemo(() => {
		const f = filter.trim().toLowerCase();
		return f ? profiles.filter((p) => p.name.toLowerCase().includes(f)) : profiles;
	}, [profiles, filter]);

	const active = profiles.find((p) => p.id === activeId) ?? profiles[0];
	if (!active) return null;

	return (
		<div className="oa-profile-picker" ref={wrapRef}>
			<button
				className="oa-profile-pill"
				onClick={() => {
					setOpen(!open);
					setFilter("");
				}}
				disabled={disabled}
				aria-label={`Profile: ${active.name} — each profile has its own persona, memory, skills & chats`}
				aria-haspopup="listbox"
				aria-expanded={open}
			>
				<span className={`oa-profile-dot oa-color-${active.color}`} />
				<span className="oa-profile-pill-label">{active.name}</span>
				<ChevronDownIcon size={11} className={`oa-profile-pill-chevron${open ? " is-open" : ""}`} />
			</button>

			{open ? (
				<div className="oa-profile-menu" role="listbox">
					{profiles.length > 6 ? (
						<SearchField
							variant="strip"
							className="oa-profile-menu-search"
							inputRef={inputRef}
							value={filter}
							placeholder="Filter profiles…"
							ariaLabel="Filter profiles"
							onValue={setFilter}
						/>
					) : null}
					<div className="oa-profile-menu-list">
						{options.length === 0 ? (
							<div className="oa-profile-menu-empty">No matching profiles.</div>
						) : (
							options.map((p) => (
								<button
									key={p.id}
									role="option"
									aria-selected={p.id === active.id}
									className={`oa-profile-menu-item${p.id === active.id ? " is-active" : ""}`}
									onClick={() => {
										if (p.id !== active.id) onSelect(p.id);
										setOpen(false);
									}}
									aria-label={p.id}
								>
									<span className={`oa-profile-dot oa-color-${p.color}`} />
									<span className="oa-profile-menu-name">{p.name}</span>
									<span className="oa-profile-menu-check">
										{p.id === active.id ? <CheckIcon size={12} /> : null}
									</span>
								</button>
							))
						)}
					</div>
					<div className="oa-profile-menu-footer">
						<button
							onClick={() => {
								onManage();
								setOpen(false);
							}}
						>
							<SettingsIcon size={12} /> Manage profiles
						</button>
					</div>
				</div>
			) : null}
		</div>
	);
}
