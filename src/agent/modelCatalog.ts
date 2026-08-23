/**
 * Per-provider model catalogs (Hermes Desktop parity — owner goal 2026-07-30:
 * "Provider = setting + connection test, Model = pick default + fallback").
 *
 * Official semantics, verified against the raw hermes-agent@main source:
 *   - catalogs live ON the provider/endpoint, never in one shared drawer
 *     (apps/desktop settings/custom-endpoints-settings.tsx saves `models`
 *     per endpoint; lib/model-options.ts serves providers[].models)
 *   - test/validate only DISCOVERS models for the endpoint being edited and
 *     never clobbers an existing pick (prefill only when the field is empty)
 *   - a stale pick is healed ONLY against a NON-EMPTY catalog that no longer
 *     contains it (manualPickRemoved — conservative: empty/absent catalogs
 *     never wipe a pick)
 *   - out-of-catalog picks stay selectable, never render blank (withActive)
 *
 * Owner incident: one global flat list meant "Test & fetch" on a NON-active
 * provider overwrote the active provider's catalog and silently reset the
 * chat model — the same lesson-22 trap class, one level down.
 *
 * obsidian-free: unit-tested by test/model-catalog.test.cjs.
 */

import type { ProviderConfig } from "../settings";

/** Trim, drop junk, collapse repeats (first occurrence wins). */
export function dedupeModels(models: unknown): string[] {
	if (!Array.isArray(models)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const m of models) {
		if (typeof m !== "string") continue;
		const t = m.trim();
		if (!t || seen.has(t)) continue;
		seen.add(t);
		out.push(t);
	}
	return out;
}

/** One provider's catalog (defensive against legacy/odd data). */
export function catalogOf(provider: ProviderConfig | null | undefined): string[] {
	return dedupeModels(provider?.models);
}

/** withActive: the current pick stays selectable even when out-of-catalog. */
export function withCurrentModel(catalog: string[], current: string): string[] {
	return current && !catalog.includes(current) ? [current, ...catalog] : catalog;
}

/**
 * Official manualPickRemoved heal: an EMPTY catalog is a transient state
 * (never fetched / unreachable) → keep the current pick untouched; a
 * non-empty catalog missing the pick → adopt the first entry. Also covers
 * the "prefill only when empty" rule (current === "" → catalog[0]).
 */
export function healModelAgainstCatalog(catalog: string[], current: string): string {
	if (catalog.length === 0) return current;
	return current && catalog.includes(current) ? current : catalog[0];
}

/**
 * "Test connection" on the VIEWED provider: writes ONLY that provider's
 * catalog. The active-model heal runs solely when the tested provider IS the
 * global default — testing any other provider must not touch the chat's model.
 */
export function applyFetchedModels(
	settings: { providers: ProviderConfig[]; activeProviderId: string; model: string },
	providerId: string,
	fetched: unknown
): boolean {
	const p = settings.providers.find((x) => x.id === providerId);
	if (!p) return false;
	p.models = dedupeModels(fetched);
	if (providerId === settings.activeProviderId) {
		settings.model = healModelAgainstCatalog(p.models, settings.model);
	}
	return true;
}

/**
 * Explicit activation ("Set active") = a (provider, model) pair must stay
 * valid: switch the active provider, then heal the model pick against THAT
 * provider's catalog. Empty catalog → the pick stays as-is (custom ids
 * remain possible; a later fetch fills in).
 */
export function activateProviderCatalog(
	settings: { providers: ProviderConfig[]; activeProviderId: string; model: string },
	providerId: string
): boolean {
	const p = settings.providers.find((x) => x.id === providerId);
	if (!p) return false;
	settings.activeProviderId = providerId;
	settings.model = healModelAgainstCatalog(catalogOf(p), settings.model);
	return true;
}

/** Remember an ad-hoc model id (chat /model command) in a provider's catalog. */
export function rememberModelInCatalog(provider: ProviderConfig | null | undefined, model: string): void {
	if (!provider) return;
	const t = model.trim();
	if (!t) return;
	const cat = catalogOf(provider);
	if (cat.includes(t)) return;
	provider.models = [...cat, t];
}

/**
 * One-time migration off the pre-v0.1.14 global flat catalog: move it onto
 * the ACTIVE provider — only when that catalog is empty (never overwrite
 * existing data). Returns true when the legacy list had content to fold in.
 */
export function migrateLegacyFavoriteModels(
	settings: { providers: ProviderConfig[]; activeProviderId: string },
	legacy: unknown
): boolean {
	const list = dedupeModels(legacy);
	if (list.length === 0) return false;
	const active = settings.providers.find((p) => p.id === settings.activeProviderId);
	if (!active) return false;
	if (catalogOf(active).length === 0) active.models = list;
	return true;
}
