/**
 * Settings search index (v0.1.94, additive) — pure logic, no imports from
 * settingsTab (no cycles). The index is built by rendering every section
 * into a DETACHED host with the same builders the real pane uses, so the
 * searchable text can never drift from what the UI actually shows.
 *
 * Rows inside groups that only render after interaction (e.g. a hub search
 * result) are simply absent from the index — the jump then lands on the
 * section itself with a Notice fallback.
 */

export interface SettingsSearchEntry {
	section: string;
	sectionLabel: string;
	group: string;
	name: string;
	desc: string;
	/** occurrence index among same-named rows of the same section (e.g. per-provider "API key") */
	ordinal: number;
}

export interface SettingsSectionRef {
	key: string;
	label: string;
}

/**
 * Render each section via `render(key, host)` and index its Setting rows
 * (`.setting-item` name + description) along with the nearest preceding
 * subheading (`.oa-subsection h3`) as the group label.
 */
export function buildSettingsIndex(
	sections: SettingsSectionRef[],
	render: (key: string, host: HTMLElement) => void
): SettingsSearchEntry[] {
	const index: SettingsSearchEntry[] = [];
	for (const sec of sections) {
		const host = document.createElement("div");
		try {
			render(sec.key, host);
		} catch {
			continue; // a section that cannot render headless is skipped, not fatal
		}
		let group = "";
		const seen = new Map<string, number>();
		for (const el of Array.from(host.querySelectorAll<HTMLElement>(".oa-subsection, .setting-item"))) {
			if (el.classList.contains("oa-subsection")) {
				group = el.querySelector("h3")?.textContent?.trim() || group;
				continue;
			}
			const name = el.querySelector(".setting-item-name")?.textContent?.trim() ?? "";
			if (!name) continue;
			const desc = el.querySelector(".setting-item-description")?.textContent?.trim() ?? "";
			const ordinal = seen.get(name) ?? 0;
			seen.set(name, ordinal + 1);
			index.push({ section: sec.key, sectionLabel: sec.label, group, name, desc, ordinal });
		}
		host.remove();
	}
	return index;
}

/** Case-insensitive AND-of-tokens match across name, description, group and section label. */
export function filterSettingsIndex(index: SettingsSearchEntry[], query: string): SettingsSearchEntry[] {
	const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!tokens.length) return [];
	return index.filter((entry) => {
		const haystack = `${entry.name} ${entry.desc} ${entry.group} ${entry.sectionLabel}`.toLowerCase();
		return tokens.every((token) => haystack.includes(token));
	});
}
