/**
 * Shared context for extracted settings section renderers.
 *
 * Each renderer in this folder used to be a private method on
 * `OpenAgentSettingTab`, reaching for `this.plugin`, `this.app` and a handful
 * of presentation helpers. They are free functions now, and this type is the
 * explicit version of what `this` used to give them.
 *
 * Only renderers that touch **no** class state may live here. The tab still
 * owns settings data, persistence, navigation, search indexing, and every
 * renderer that mutates a class property (`model`, `providers`, `cronForm`,
 * `display`, the hub). Those stay put until a plan defines how state crosses
 * the boundary -- see docs/plans/settings-section-renderers-2026-08-24.md.
 *
 * `display` is deliberately part of the contract: several renderers re-render
 * the whole tab after a destructive action, and they must go through the same
 * path the class uses so scroll restoration and section state are preserved.
 */

import type { App, Setting } from "obsidian";
import type OpenAgentPlugin from "../../main";

export type EmptyStateOpts = { title: string; description?: string; action?: HTMLElement };

export type SectionContext = {
	app: App;
	plugin: OpenAgentPlugin;
	/** Section sub-heading with a description line. Callers may addClass the result. */
	subheading(containerEl: HTMLElement, text: string, desc: string): HTMLElement;
	/** Appends a reset-to-default control, but only when the value is modified. */
	resetButton(setting: Setting, path: string): void;
	/** Unified empty-state block (v0.1.152 lobe-ui Empty shape). */
	emptyState(containerEl: HTMLElement, opts: EmptyStateOpts): HTMLElement;
	/** Re-render the whole tab, preserving scroll position and active section. */
	display(): void;
};
