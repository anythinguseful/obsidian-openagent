/**
 * Model menu — Hermes Desktop parity ports (v0.1.32).
 *
 * Verified raw from NousResearch/hermes-agent @ main:
 *   apps/desktop/src/app/shell/model-menu-panel.tsx   (dropdown surface)
 *   apps/desktop/src/components/model-visibility-dialog.tsx (edit dialog)
 *   apps/desktop/src/lib/model-status-label.ts        (display names)
 *   apps/desktop/src/store/model-visibility.ts        (visibility store math)
 *   apps/desktop/src/lib/model-search-text.ts         (search aliases)
 *
 * Everything here is pure: no React, no Obsidian, so the unit tests pin the
 * semantics byte-for-byte. The React components only render what these
 * helpers decide.
 */

/* ---------------- display names (lib/model-status-label.ts) ---------------- */

/** Strip provider prefix and normalize for display. */
export function modelBaseId(model: string): string {
	const trimmed = model.trim();
	const slash = trimmed.lastIndexOf("/");
	return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

/* Trailing model-id variants that render as a grayed tag beside the name
   (e.g. "Opus 4.8" + "Fast") rather than collapsing two distinct ids to
   the same display name. Order matters (first match wins). */
const VARIANT_TAGS: ReadonlyArray<readonly [RegExp, string]> = [
	[/-fast$/i, "Fast"],
	[/-thinking$/i, "Thinking"],
	[/-preview$/i, "Preview"],
	[/-latest$/i, "Latest"],
];

const titleCase = (text: string): string => text.replace(/\b\w/g, (char) => char.toUpperCase()).trim();

function prettifyBase(base: string): string {
	if (/^claude-/i.test(base)) return titleCase(base.replace(/^claude-/i, "").replace(/-/g, " "));
	if (/^gpt-/i.test(base)) return base.replace(/^gpt-/i, "GPT-");
	if (/^gemini-/i.test(base)) return base.replace(/^gemini-/i, "Gemini ").replace(/-/g, " ");
	return titleCase(base.replace(/-/g, " "));
}

/** Split a model id into a clean display name plus an optional grayed
    variant tag, so distinct ids (e.g. `…-4.8` vs `…-4.8-fast`) don't
    collapse. A trailing date-pin (`…-20251101`) is snapshot noise, stripped. */
export function modelDisplayParts(model: string): { name: string; tag: string } {
	let base = modelBaseId(model);
	let tag = "";
	for (const [pattern, label] of VARIANT_TAGS) {
		if (pattern.test(base)) {
			tag = label;
			base = base.replace(pattern, "");
			break;
		}
	}
	base = base.replace(/-\d{8}$/, "");
	return { name: prettifyBase(base) || model.trim() || "No model", tag };
}

/** Friendly one-line model name for menus and the pill. */
export function displayModelName(model: string): string {
	return modelDisplayParts(model).name;
}

/* ---------------- model families (store/model-visibility.ts) ---------------- */

/** A model and its optional `…-fast` sibling collapsed into one logical row.
    `id` is the canonical (base) model; `fastId` is the fast variant if present. */
export interface ModelFamily {
	id: string;
	fastId: string | null;
}

/** Collapse a provider's model list so a base model and its `…-fast` variant
    become a single family (one row, one toggle). Order follows the base
    model's position. A `…-fast` model with no base stands on its own. A
    date-pinned snapshot superseded by its rolling alias is dropped. */
export function collapseModelFamilies(models: readonly string[]): ModelFamily[] {
	const present = new Set(models);
	const families: ModelFamily[] = [];
	const consumed = new Set<string>();
	for (const model of models) {
		if (consumed.has(model)) continue;
		if (/-fast$/i.test(model) && present.has(model.replace(/-fast$/i, ""))) continue; // represented by its base entry
		if (/-\d{8}$/.test(model) && present.has(model.replace(/-\d{8}$/, ""))) continue; // superseded snapshot dupe
		const fastId = `${model}-fast`;
		const hasFast = present.has(fastId);
		families.push({ id: model, fastId: hasFast ? fastId : null });
		consumed.add(model);
		if (hasFast) consumed.add(fastId);
	}
	return families;
}

/* ---------------- visibility store (store/model-visibility.ts) ---------------- */

/** Models shown per provider before the user has customized the list.
    Provider catalogs are already relevance-ordered. */
export const DEFAULT_VISIBLE_PER_PROVIDER = 50;

/** Stable key for a provider/model pair (`::` never collides with a model
    id's single colon, e.g. `model:tag`). */
export const modelVisibilityKey = (provider: string, model: string): string => `${provider}::${model}`;

/** Sentinel stored when the user explicitly hides ALL of a provider's models —
    distinguishes "user hid everything" from "never customized". */
export const emptyProviderSentinelKey = (provider: string): string => modelVisibilityKey(provider, "");
export const isProviderSentinel = (key: string): boolean => key.endsWith("::");

export interface MenuProvider {
	/** stable slug (settings providers use `id`) */
	slug: string;
	name: string;
	models: string[];
	/** optional curated short list; when present it defines the default view */
	featured?: string[];
}

/** Curated default keys: featured shortlist when present, else top-N
    collapsed families per provider. One expansion rule for every caller. */
function expandProviderDefaults(provider: MenuProvider, target: Set<string>): void {
	const families = collapseModelFamilies(provider.models);
	const featured = provider.featured ?? [];
	const defaults = featured.length ? families.filter((f) => featured.includes(f.id)) : families.slice(0, DEFAULT_VISIBLE_PER_PROVIDER);
	for (const family of defaults) target.add(modelVisibilityKey(provider.slug, family.id));
}

/** The default-visible key set across providers. */
export function defaultVisibleKeys(providers: readonly MenuProvider[]): Set<string> {
	const keys = new Set<string>();
	for (const provider of providers) expandProviderDefaults(provider, keys);
	return keys;
}

/** Working set: stored keys + curated expansion for any provider the user has
    NOT customized. Hide-all sentinels are PRESERVED (this is the set toggle
    handlers mutate); use effectiveVisibleKeys for display. A null store means
    "never customized" → the curated default applies. */
export function resolveVisibleKeys(stored: readonly string[] | null, providers: readonly MenuProvider[]): Set<string> {
	if (!stored) return defaultVisibleKeys(providers);
	if (stored.length === 0) return new Set();
	const next = new Set(stored);
	for (const provider of providers) {
		const prefix = `${provider.slug}::`;
		const hasStored = stored.some((k) => k.startsWith(prefix) && !isProviderSentinel(k));
		const hasSentinel = stored.includes(emptyProviderSentinelKey(provider.slug));
		if (hasStored || hasSentinel) continue;
		expandProviderDefaults(provider, next);
	}
	return next;
}

/** Display set: working set with bookkeeping sentinels stripped. */
export function effectiveVisibleKeys(stored: readonly string[] | null, providers: readonly MenuProvider[]): Set<string> {
	const next = resolveVisibleKeys(stored, providers);
	for (const key of [...next]) if (isProviderSentinel(key)) next.delete(key);
	return next;
}

/** Next persisted set after one model row toggles. Seeds from
    resolveVisibleKeys so other providers' sentinels survive. Hiding a
    provider's LAST visible model records the explicit hide-all sentinel;
    re-enabling clears THAT provider's sentinel and keeps ONLY the re-enabled
    model (curated defaults deliberately NOT restored). */
export function toggleModelVisibility(
	stored: readonly string[] | null,
	providers: readonly MenuProvider[],
	providerSlug: string,
	model: string
): string[] {
	const next = resolveVisibleKeys(stored, providers);
	const key = modelVisibilityKey(providerSlug, model);
	const sentinel = emptyProviderSentinelKey(providerSlug);
	if (next.has(key)) {
		next.delete(key);
		const remaining = [...next].some((k) => k.startsWith(`${providerSlug}::`) && !isProviderSentinel(k));
		if (!remaining) next.add(sentinel);
	} else {
		next.delete(sentinel);
		next.add(key);
	}
	return [...next];
}

/** Master switch: visible=true enables every collapsed family of the provider
    (clearing its sentinel); false removes them all and records the sentinel. */
export function setProviderVisibility(
	stored: readonly string[] | null,
	providers: readonly MenuProvider[],
	providerSlug: string,
	visible: boolean
): string[] {
	const next = resolveVisibleKeys(stored, providers);
	const sentinel = emptyProviderSentinelKey(providerSlug);
	const provider = providers.find((p) => p.slug === providerSlug);
	const families = collapseModelFamilies(provider?.models ?? []);
	for (const key of [...next]) if (key.startsWith(`${providerSlug}::`)) next.delete(key);
	if (visible) {
		for (const family of families) next.add(modelVisibilityKey(providerSlug, family.id));
		if (families.length === 0) next.delete(sentinel); // zero models can't be "all on"
	} else {
		next.add(sentinel);
	}
	return [...next];
}

/* ---------------- search (lib/model-search-text.ts + normalize) ---------------- */

/** Search-key normalization (official lib/text.ts normalize). */
const normalize = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v)).trim().toLowerCase();

/** Extra tokens used only for search — wire ids stay unchanged (official
    keeps this tiny table in sync across desktop/tui/web/cli). */
const MODEL_SEARCH_ALIASES: Record<string, readonly string[]> = {
	k3: ["kimi-k3", "kimi"],
};

/** Haystack for substring model search; never changes the wire id. */
export function modelSearchText(model: string): string {
	const id = model.trim();
	if (!id) return model;
	const aliases = MODEL_SEARCH_ALIASES[id.toLowerCase()];
	return aliases?.length ? `${id} ${aliases.join(" ")}` : id;
}

/* ---------------- grouping for the dropdown (model-menu-panel groupModels) ---------------- */

export interface ModelMenuGroup {
	provider: MenuProvider;
	families: ModelFamily[];
}

/**
 * Collapsed menu shows the user's chosen models (or the curated default);
 * typing spans EVERY available model so anything is reachable past the cut —
 * and per-provider matches are NOT capped while searching. The provider's
 * stable catalog order is preserved (filter in place, never re-sort); groups
 * are alphabetized by provider NAME (the backend's "current provider first"
 * float would reshuffle on every switch). The active model is always
 * included — except while searching, where a pinned non-match would read
 * like the top result.
 */
export function groupMenuModels(
	providers: readonly MenuProvider[],
	search: string,
	current: { provider: string; model: string },
	visible: Set<string>
): ModelMenuGroup[] {
	const q = normalize(search);
	const groups: ModelMenuGroup[] = [];
	for (const provider of providers) {
		const allFamilies = collapseModelFamilies(provider.models);
		if (allFamilies.length === 0) continue;
		const matches = (family: ModelFamily) =>
			`${modelSearchText(family.id)} ${family.fastId ?? ""} ${provider.name} ${provider.slug} ${displayModelName(family.id)}`
				.toLowerCase()
				.includes(q);
		let shown: Set<string>;
		if (q) shown = new Set(allFamilies.filter(matches).map((f) => f.id));
		else shown = new Set(allFamilies.filter((f) => visible.has(modelVisibilityKey(provider.slug, f.id))).map((f) => f.id));
		const activeId =
			!q && provider.slug === current.provider && current.model
				? allFamilies.find((f) => f.id === current.model || f.fastId === current.model)?.id
				: undefined;
		const families = allFamilies.filter((f) => shown.has(f.id) || f.id === activeId);
		if (families.length > 0) groups.push({ provider, families });
	}
	groups.sort((a, b) => a.provider.name.localeCompare(b.provider.name));
	return groups;
}

/** MoA preset haystack (official: `moa ${preset}`), so "moa" or the preset
    name both reach the preset rows. */
export function moaPresetMatches(preset: string, search: string): boolean {
	const q = normalize(search);
	return !q || `moa ${preset}`.toLowerCase().includes(q);
}
