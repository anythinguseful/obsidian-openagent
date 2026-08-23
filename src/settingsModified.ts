/**
 * "Changed from default" marker (v0.1.94, additive) — a small dot prepended
 * to a Setting row whose live value differs from DEFAULT_SETTINGS. Compares
 * canonically (key-order insensitive) so array/object values don't false-fire.
 */

import type { Setting } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings";

/* JSON.stringify is not stable across key orders — sort keys deeply first. */
function canon(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
	if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
	const rec = value as Record<string, unknown>;
	const keys = Object.keys(rec).sort();
	return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(rec[k])}`).join(",")}}`;
}

export function getPath(root: unknown, path: string): unknown {
	let cur: unknown = root;
	for (const part of path.split(".")) {
		if (cur === null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[part];
	}
	return cur;
}

/** Set `value` at dotted `path` (creates intermediate objects). */
export function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
	const parts = path.split(".");
	let cur = root;
	for (let i = 0; i < parts.length - 1; i++) {
		const next = cur[parts[i]];
		if (next === null || typeof next !== "object" || Array.isArray(next)) {
			cur[parts[i]] = {};
		}
		cur = cur[parts[i]] as Record<string, unknown>;
	}
	cur[parts[parts.length - 1]] = value;
}

/** true when the live value at `path` differs from DEFAULT_SETTINGS. */
export function isModified(current: unknown, path: string): boolean {
	return canon(getPath(current, path)) !== canon(getPath(DEFAULT_SETTINGS, path));
}

/**
 * Prepend the modified-dot to a Setting row's name. No-op when the value
 * still equals the default — call sites stay one-liners at build time and
 * the marker re-evaluates on every render (rows revert after Reset too).
 */
export function markModified(setting: Setting, current: unknown, path: string): void {
	if (!isModified(current, path)) return;
	const dot = setting.nameEl.createSpan({
		cls: "oa-mod-dot",
		attr: {
			role: "img",
			"aria-label": "Changed from default",
			title: "Changed from default",
		},
	});
	setting.nameEl.insertBefore(dot, setting.nameEl.firstChild);
}
