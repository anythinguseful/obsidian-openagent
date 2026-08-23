/**
 * Model picker — Hermes Desktop composer model pill (status-bar dropdown),
 * v0.1.32 FULL parity with apps/desktop/src/app/shell/model-menu-panel.tsx:
 *
 *   - Search field ("Search models") with keyboard semantics: ArrowUp/Down
 *     cycles one flat row list, Enter commits; the selected index is derived
 *     (current model with no query, first match while typing) with an
 *     arrow-key override reset on every keystroke; the active row scrolls
 *     into view (data-kb-active).
 *   - Provider GROUPS: alphabetical by provider name, collapsible headers
 *     (disclosure caret revealed on hover — same collapse store as the Edit
 *     Models dialog), stable catalog order inside each provider.
 *   - Rows: pretty display name + grayed variant tag (Opus 4.8 · Fast),
 *     check icon on the current row; base + "-fast" ids ride ONE family row.
 *   - MoA presets in their own bottom section ("MoA presets", rows
 *     "MoA: <preset>"), searchable like everything else.
 *   - Footer: "Refresh Models" (spins while fetching, menu STAYS OPEN) and
 *     "Edit Models…" (opens the visibility dialog).
 *   - Visibility: the curated per-provider default or the user's Edit-Models
 *     customization; typing spans every model regardless.
 *
 * Deltas that CANNOT be ported (no gateway): per-model capabilities
 * (effort/fast submenu), pricing/Pro/Free-tier badges, and a backend
 * featured_models shortlist. Documented in docs/studies/model-settings-parity.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
	collapseModelFamilies,
	displayModelName,
	effectiveVisibleKeys,
	groupMenuModels,
	modelDisplayParts,
	moaPresetMatches,
	type MenuProvider,
} from "../../agent/modelMenu";
import { CheckIcon, ChevronRightIcon, ChevronUpIcon, RefreshIcon, SettingsIcon } from "../icons";
import { SearchField } from "./search-field";
import { ModelVisibilityDialog } from "./model-visibility-dialog";

type KbRow =
	| { kind: "family"; key: string; provider: string; familyId: string; fastId: string | null }
	| { kind: "moa"; key: string; preset: string };

export function ModelPicker({
	model,
	providerSlug,
	providers,
	disabled,
	onSelect,
	onRefresh,
	onOpenSettings,
	moa,
	visibleModelsStored,
	onSetVisibleModels,
	collapsedSlugs,
	onToggleCollapsed,
}: {
	/** active model id (or the MoA preset name when moa.active is set) */
	model: string;
	/** active provider slug */
	providerSlug: string;
	/** every provider with its own model catalog (may be empty) */
	providers: MenuProvider[];
	disabled?: boolean;
	onSelect: (provider: string, model: string) => void;
	/** Refresh Models — async; the menu stays open while it runs */
	onRefresh: () => Promise<void> | void;
	onOpenSettings: () => void;
	/** Mixture of Agents presets: bottom section "MoA presets" */
	moa?: { names: string[]; active: string; onSelect: (name: string) => void };
	/** settings.visibleModels passthrough (null = curated defaults) */
	visibleModelsStored: string[] | null;
	onSetVisibleModels: (next: string[]) => void;
	collapsedSlugs: string[];
	onToggleCollapsed: (slug: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [refreshing, setRefreshing] = useState(false);
	const [kbOverride, setKbOverride] = useState<number | null>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const activeMoa = moa?.active ?? "";
	const plainModel = activeMoa ? "" : model;

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
		window.setTimeout(() => inputRef.current?.focus(), 30);
		return () => {
			document.removeEventListener("mousedown", onDocDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const q = search.trim().toLowerCase();
	const visible = useMemo(() => effectiveVisibleKeys(visibleModelsStored, providers), [visibleModelsStored, providers]);
	const groups = useMemo(
		() => groupMenuModels(providers, search, { provider: providerSlug, model: plainModel }, visible),
		[providers, search, providerSlug, plainModel, visible]
	);
	const shownMoa = useMemo(
		() => (moa?.names ?? []).filter((n) => moaPresetMatches(n, search)),
		[moa?.names, search]
	);
	const isCollapsed = (slug: string) => !q && collapsedSlugs.includes(slug);

	/* one flat keyboard list mirroring EXACTLY what's rendered (official:
	   the selection can never sit on a hidden row) */
	const kbRows = useMemo<KbRow[]>(
		() => [
			...groups.flatMap((g) =>
				isCollapsed(g.provider.slug)
					? []
					: g.families.map(
							(f): KbRow => ({
								kind: "family",
								key: `${g.provider.slug}:${f.id}`,
								provider: g.provider.slug,
								familyId: f.id,
								fastId: f.fastId,
							})
					  )
			),
			...shownMoa.map((preset): KbRow => ({ kind: "moa", key: `moa:${preset}`, preset })),
		],
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[groups, shownMoa, collapsedSlugs, q]
	);

	const currentKey = activeMoa ? `moa:${activeMoa}` : `${providerSlug}:${plainModel}`;
	const autoIndex = q
		? kbRows.length > 0
			? 0
			: -1
		: kbRows.findIndex((r) => r.key === currentKey || (r.kind === "family" && r.fastId === plainModel));
	const kbIndex = kbOverride !== null && kbOverride < kbRows.length ? kbOverride : autoIndex;
	const kbActiveKey = kbIndex >= 0 ? kbRows[kbIndex]?.key : null;

	useEffect(() => {
		listRef.current?.querySelector("[data-kb-active]")?.scrollIntoView({ block: "nearest" });
	}, [kbActiveKey]);

	const commitRow = (row: KbRow) => {
		if (row.kind === "moa") {
			if (row.preset !== activeMoa) moa!.onSelect(row.preset);
			setOpen(false);
			return;
		}
		if (row.key !== currentKey && row.fastId !== plainModel) onSelect(row.provider, row.familyId);
		setOpen(false);
	};
	const commitKb = () => {
		if (kbIndex >= 0) commitRow(kbRows[kbIndex]);
	};
	const stepKb = (delta: -1 | 1) => {
		if (kbRows.length === 0) return;
		const from = kbIndex >= 0 ? kbIndex : delta === 1 ? -1 : 0;
		setKbOverride((from + delta + kbRows.length) % kbRows.length);
	};

	const anyGroups = groups.length > 0;
	const anyMoa = shownMoa.length > 0;

	return (
		<div className="oa-model-picker" ref={wrapRef}>
			<button
				className="oa-model-pill"
				onClick={() => {
					setOpen(!open);
					setSearch("");
					setKbOverride(null);
				}}
				disabled={disabled}
				aria-label="Choose model"
				aria-haspopup="listbox"
				aria-expanded={open}
			>
				<span className="oa-model-pill-label">{activeMoa || displayModelName(model) || "Select model"}</span>
				<ChevronUpIcon size={11} className={`oa-model-pill-chevron${open ? " is-open" : ""}`} />
			</button>

			{open ? (
				<div className="oa-model-menu" role="listbox" aria-label="Models">
					{/* v0.1.115: strip = kulit tanpa bingkai di dalam menu;
					   keyboard list-nav dipegang pemanggil (SearchField
					   hanya menelan Escape ber-isi duluan) */}
					<SearchField
						variant="strip"
						className="oa-model-menu-search"
						inputRef={inputRef}
						value={search}
						placeholder="Search models"
						ariaLabel="Search models"
						onValue={(v) => {
							setSearch(v);
							setKbOverride(null);
						}}
						onKeyDown={(e) => {
							/* claim arrows/Enter so DOM focus stays in the input and
							   Enter commits the highlighted row without a DownArrow first
							   (official VS Code checked-or-first pattern) */
							if (e.key === "ArrowDown" || e.key === "ArrowUp") {
								e.preventDefault();
								e.stopPropagation();
								stepKb(e.key === "ArrowDown" ? 1 : -1);
							} else if (e.key === "Enter") {
								e.preventDefault();
								e.stopPropagation();
								commitKb();
							}
						}}
					/>

					{!anyGroups && !anyMoa ? (
						<div className="oa-model-menu-empty">No models found</div>
					) : (
						<div className="oa-model-menu-list" ref={listRef}>
							{groups.map((group) => {
								const slug = group.provider.slug;
								const collapsed = isCollapsed(slug);
								return (
									<div key={slug} className="oa-model-menu-group">
										<button
											type="button"
											className="oa-model-menu-hdr"
											onClick={() => onToggleCollapsed(slug)}
											aria-label={`${collapsed ? "Expand" : "Collapse"} ${group.provider.name}`}
											aria-expanded={!collapsed}
										>
											<span className="oa-model-menu-hdr-name">{group.provider.name}</span>
											<ChevronRightIcon
												size={10}
												className={`oa-model-menu-caret${collapsed ? "" : " is-open"}`}
											/>
										</button>
										{!collapsed
											? group.families.map((family) => {
													const isCurrent =
														!activeMoa &&
														slug === providerSlug &&
														(plainModel === family.id || plainModel === family.fastId);
													const parts = modelDisplayParts(family.id);
													const key = `${slug}:${family.id}`;
													return (
														<button
															key={key}
															role="option"
															aria-selected={isCurrent}
															className={`oa-model-menu-item${isCurrent ? " is-active" : ""}${kbActiveKey === key ? " is-kb" : ""}`}
															data-kb-active={kbActiveKey === key ? "" : undefined}
															title={family.fastId ? `${family.id} · ${family.fastId}` : family.id}
															onClick={() =>
																commitRow({
																	kind: "family",
																	key,
																	provider: slug,
																	familyId: family.id,
																	fastId: family.fastId,
																})
															}
														>
															<span className="oa-model-menu-item-label">
																{parts.name}
																{parts.tag ? <span className="oa-model-menu-tag"> {parts.tag}</span> : null}
															</span>
															{isCurrent ? <CheckIcon size={12} className="oa-model-menu-check" /> : null}
														</button>
													);
											  })
											: null}
									</div>
								);
							})}
							{anyMoa ? (
								<>
									<div className="oa-model-menu-sect">MoA presets</div>
									{shownMoa.map((preset) => {
										const isCur = preset === activeMoa;
										const key = `moa:${preset}`;
										return (
											<button
												key={key}
												role="option"
												aria-selected={isCur}
												className={`oa-model-menu-item${isCur ? " is-active" : ""}${kbActiveKey === key ? " is-kb" : ""}`}
												data-kb-active={kbActiveKey === key ? "" : undefined}
												onClick={() => commitRow({ kind: "moa", key, preset })}
											>
												<span className="oa-model-menu-item-label">MoA: {preset}</span>
												{isCur ? <CheckIcon size={12} className="oa-model-menu-check" /> : null}
											</button>
										);
									})}
								</>
							) : null}
						</div>
					)}

					<div className="oa-model-menu-footer">
						<button
							type="button"
							disabled={refreshing}
							aria-label="Refresh Models"
							onClick={() => {
								/* official refreshModels(): the menu STAYS OPEN while the
								   catalog re-fetches; only the icon spins */
								if (refreshing) return;
								setRefreshing(true);
								void Promise.resolve(onRefresh()).finally(() => setRefreshing(false));
							}}
						>
							<RefreshIcon size={12} className={refreshing ? "oa-spin" : undefined} /> Refresh Models
						</button>
						<button
							type="button"
							aria-label="Edit Models"
							onClick={() => {
								setOpen(false);
								setEditOpen(true);
							}}
						>
							<SettingsIcon size={12} /> Edit Models…
						</button>
					</div>
				</div>
			) : null}

			{editOpen ? (
				<ModelVisibilityDialog
					providers={providers.filter((p) => collapseModelFamilies(p.models).length > 0)}
					stored={visibleModelsStored}
					collapsedSlugs={collapsedSlugs}
					onToggleCollapsed={onToggleCollapsed}
					onSetVisibleModels={onSetVisibleModels}
					onOpenSettings={onOpenSettings}
					onClose={() => setEditOpen(false)}
				/>
			) : null}
		</div>
	);
}
