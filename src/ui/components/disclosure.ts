/**
 * Persisted disclosure (open/closed) state for trace blocks, modeled on
 * Hermes Desktop's $toolDisclosureStates: a local UI preference kept in
 * localStorage, capped so long-lived installs don't grow the blob forever.
 * Persisted state always wins over the streaming default — the first
 * explicit user toggle sticks across reloads and session restores.
 */

const STORAGE_KEY = "openagent.traceDisclosure.v1";
const MAX_ENTRIES = 240;

function loadAll(): Record<string, boolean> {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		return Object.fromEntries(
			Object.entries(parsed as Record<string, unknown>)
				.filter((entry): entry is [string, boolean] => typeof entry[0] === "string" && typeof entry[1] === "boolean")
				.slice(-MAX_ENTRIES)
		);
	} catch {
		return {};
	}
}

export function getDisclosure(id: string): boolean | undefined {
	if (!id) return undefined;
	return loadAll()[id];
}

export function setDisclosure(id: string, open: boolean): void {
	if (!id) return;
	try {
		const all = loadAll();
		all[id] = open;
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(Object.entries(all).slice(-MAX_ENTRIES))));
	} catch {
		/* a local UI preference — storage failures are fine to ignore */
	}
}
