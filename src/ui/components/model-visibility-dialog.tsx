/**
 * Edit Models dialog — Hermes Desktop parity port of
 * apps/desktop/src/components/model-visibility-dialog.tsx (v0.1.32):
 *
 *   - Title "Models", search "Search models".
 *   - One collapsible provider section per provider (same collapse store as
 *     the dropdown), with a tri-state master checkbox: off / on /
 *     indeterminate by how many of the provider's families are visible.
 *   - One row per collapsed model family with the pretty display name,
 *     variant tag and a switch; toggles ride the official
 *     toggleModelVisibility / setProviderVisibility semantics (hide-all
 *     sentinel, no curated restore on re-enable).
 *   - "Add provider…" footer link routes to provider settings (official
 *     routes to the onboarding provider selector; Obsidian has no
 *     onboarding — Settings → Providers is the equivalent surface).
 */

import { useMemo, useState } from "react";
import {
	collapseModelFamilies,
	effectiveVisibleKeys,
	modelDisplayParts,
	modelVisibilityKey,
	setProviderVisibility,
	toggleModelVisibility,
	type MenuProvider,
} from "../../agent/modelMenu";
import { ChevronRightIcon, PlusIcon, XIcon } from "../icons";
import { SearchField } from "./search-field";

export function ModelVisibilityDialog({
	providers,
	stored,
	collapsedSlugs,
	onToggleCollapsed,
	onSetVisibleModels,
	onOpenSettings,
	onClose,
}: {
	providers: MenuProvider[];
	stored: string[] | null;
	collapsedSlugs: string[];
	onToggleCollapsed: (slug: string) => void;
	onSetVisibleModels: (next: string[]) => void;
	onOpenSettings: () => void;
	onClose: () => void;
}) {
	const [search, setSearch] = useState("");
	const q = search.trim().toLowerCase();
	const visible = useMemo(() => effectiveVisibleKeys(stored, providers), [stored, providers]);

	const matches = (provider: MenuProvider, model: string) =>
		!q || `${model} ${provider.name} ${provider.slug} ${modelDisplayParts(model).name}`.toLowerCase().includes(q);

	const setProvider = (provider: MenuProvider, next: boolean) =>
		onSetVisibleModels(setProviderVisibility(stored, providers, provider.slug, next));

	return (
		<div className="oa-modal-overlay" role="presentation" onClick={onClose}>
			<div
				className="oa-modal oa-vis-dialog"
				role="dialog"
				aria-label="Models"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="oa-vis-head">
					<span className="oa-vis-title">Models</span>
					<button type="button" className="oa-icon-btn" aria-label="Close" onClick={onClose}>
						<XIcon size={13} />
					</button>
				</div>
				<SearchField
					variant="strip"
					className="oa-vis-search"
					autoFocus
					value={search}
					placeholder="Search models"
					ariaLabel="Search models"
					onValue={setSearch}
				/>

				<div className="oa-vis-list">
					{providers.length === 0 ? (
						<div className="oa-vis-empty">No authenticated providers.</div>
					) : (
						providers.map((provider) => {
							const shown = collapseModelFamilies(provider.models).filter((f) => matches(provider, f.id));
							if (shown.length === 0) return null;
							const allFamilies = collapseModelFamilies(provider.models);
							const onCount = allFamilies.filter((f) => visible.has(modelVisibilityKey(provider.slug, f.id))).length;
							const checkState = onCount === 0 ? false : onCount === allFamilies.length ? true : "indeterminate";
							const collapsed = collapsedSlugs.includes(provider.slug) && !q;
							return (
								<div className="oa-vis-group" key={provider.slug}>
									<div className="oa-vis-group-head">
										<button
											type="button"
											className="oa-vis-group-label"
											onClick={() => onToggleCollapsed(provider.slug)}
											aria-expanded={!collapsed}
										>
											<span className="oa-vis-group-name">{provider.name}</span>
											<ChevronRightIcon size={10} className={`oa-model-menu-caret${collapsed ? "" : " is-open"}`} />
										</button>
										<input
											type="checkbox"
											className="oa-vis-master"
											aria-label={`${provider.name}: show all models`}
											checked={checkState === true}
											ref={(el) => {
												if (el) el.indeterminate = checkState === "indeterminate";
											}}
											onChange={(e) => setProvider(provider, e.target.checked)}
										/>
									</div>
									{!collapsed
										? shown.map((family) => {
												const key = modelVisibilityKey(provider.slug, family.id);
												const parts = modelDisplayParts(family.id);
												const on = visible.has(key);
												return (
													<label className="oa-vis-row" key={key} title={family.fastId ? `${family.id} · ${family.fastId}` : family.id}>
														<span className="oa-vis-row-label">
															{parts.name}
															{parts.tag ? <span className="oa-model-menu-tag"> {parts.tag}</span> : null}
														</span>
														{/* v0.1.34: the switch IS the app's own
														   checkbox-container (hidden native input inside)
														   — every theme, incl. custom toggle styling,
														   renders it exactly like Settings toggles */}
														<span className={`checkbox-container${on ? " is-enabled" : ""}`}>
															<input
																type="checkbox"
																aria-label={`${parts.name}: show in model menu`}
																checked={on}
																onChange={() =>
																	onSetVisibleModels(toggleModelVisibility(stored, providers, provider.slug, family.id))
																}
															/>
														</span>
													</label>
												);
										  })
										: null}
								</div>
							);
						})
					)}
				</div>

				<div className="oa-vis-foot">
					<button
						type="button"
						className="oa-vis-add"
						onClick={() => {
							onClose();
							onOpenSettings();
						}}
					>
						<PlusIcon size={12} /> Add provider…
					</button>
				</div>
			</div>
		</div>
	);
}
