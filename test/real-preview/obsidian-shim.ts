/**
 * Browser shim for the `obsidian` module, used ONLY by the real-preview
 * harness (esbuild aliases obsidian → this file). Implements exactly the
 * surface our src/ui tree touches: Notice, Component, setIcon (lucide),
 * MarkdownRenderer (lightweight md→html), requestUrl (canned), Platform.
 *
 * Also polyfills Obsidian's HTMLElement extensions (el.empty(), el.addClass…)
 * which parts of the UI rely on.
 */

import { mdToHtml } from "./md-lite";

function polyfillDom(): void {
	interface El extends HTMLElement {
		empty?: () => void;
		addClass?: (...cls: string[]) => void;
		removeClass?: (...cls: string[]) => void;
		toggleClass?: (cls: string, value?: boolean) => void;
		setText?: (text: string) => void;
	}
	const proto = (window as unknown as { HTMLElement: { prototype: El } }).HTMLElement.prototype;
	if (!proto.empty) {
		proto.empty = function (this: HTMLElement): void {
			while (this.firstChild) this.removeChild(this.firstChild);
		};
		proto.addClass = function (this: HTMLElement, ...cls: string[]): void {
			this.classList.add(...cls);
		};
		proto.removeClass = function (this: HTMLElement, ...cls: string[]): void {
			this.classList.remove(...cls);
		};
		proto.toggleClass = function (this: HTMLElement, cls: string, value?: boolean): void {
			this.classList.toggle(cls, value);
		};
			proto.setText = function (this: HTMLElement, text: string): void {
				this.textContent = text;
			};
			proto.appendText = function (this: HTMLElement, text: string): void {
				this.appendChild(document.createTextNode(text));
			};
		}
		/* createEl/createDiv/createSpan — Obsidian's DOM builders, used by
		   non-React code (settingsTab.ts). Added 2026-07-22 for the settings
		   harness; shapes: {cls, text, attr} like the real API. */
		type CreateOpts = { cls?: string | string[]; text?: string; attr?: Record<string, string> } | undefined;
		const decorate = <T extends HTMLElement>(el: T, o: CreateOpts): T => {
			if (o?.cls) el.classList.add(...(Array.isArray(o.cls) ? o.cls : String(o.cls).split(/\s+/).filter(Boolean)));
			if (o?.text !== undefined) el.textContent = o.text;
			if (o?.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
			return el;
		};
		if (!proto.createDiv) {
			proto.createDiv = function (this: HTMLElement, o?: CreateOpts): HTMLElement {
				return this.appendChild(decorate(document.createElement("div"), o));
			};
			proto.createSpan = function (this: HTMLElement, o?: CreateOpts): HTMLSpanElement {
				return this.appendChild(decorate(document.createElement("span"), o));
			};
			proto.createEl = function <K extends keyof HTMLElementTagNameMap>(
				this: HTMLElement,
				tag: K,
				o?: CreateOpts & { type?: string }
			): HTMLElementTagNameMap[K] {
				const el = this.appendChild(decorate(document.createElement(tag), o));
				if (o && "type" in o && o.type) el.setAttribute("type", o.type);
				return el;
			};
		}
}
polyfillDom();

/* ---------------------------------- icons --------------------------------- */

const ICONS: Record<string, string> = {
	server:
		'<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
	send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
	square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
	plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
	/* attach menu additions */
	file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
	folder:
		'<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
	image:
		'<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
	"message-square-text":
		'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M13 8H7"/><path d="M17 12H7"/>',
	"at-sign": '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
	"arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
	/* v0.1.57 system banner icons — paths verbatim from lucide upstream
	   (lucide-icons/lucide icons/{info,circle-alert}.svg @main, curl-verified) */
	info: '<circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />',
	"circle-alert": '<circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />',
	/* v0.1.49 feedback banner — paths verbatim from lucide upstream
	   (lucide-icons/lucide icons/thumbs-{up,down}.svg @main, curl-verified) */
	"thumbs-up":
		'<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/>',
	/* v0.1.49 loud-on-unknown exposed these as silently empty in-sim —
	   paths verbatim from lucide upstream @main (curl-verified) */
	"arrow-up": '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
	layers:
		'<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
	quote:
		'<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
	"text-cursor-input":
		'<path d="M12 20h-1a2 2 0 0 1-2-2 2 2 0 0 1-2 2H6"/><path d="M13 8h7a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-7"/><path d="M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h1"/><path d="M6 4h1a2 2 0 0 1 2 2 2 2 0 0 1 2-2h1"/><path d="M9 6v12"/>',
	"thumbs-down":
		'<path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/><path d="M17 14V2"/>',
	bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
	user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
	copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	"chevron-down": '<path d="m6 9 6 6 6-6"/>',
	"chevron-right": '<path d="m9 18 6-6-6-6"/>',
	"chevron-up": '<path d="m18 15-6-6-6 6"/>',
	settings:
		'<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
	wrench:
		'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
	brain:
		'<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>',
	sparkles:
		'<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
	history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
	"trash-2":
		'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
	"file-text":
		'<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
	"triangle-alert":
		'<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
	terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
	zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
	search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
	"refresh-cw":
		'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
	"panel-left": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
	clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
	pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/>',
	palette:
		'<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
	globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
	paperclip:
		'<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
	upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
	/* settings-harness additions (2026-07-22): tab + row icons */
	key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
	cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
	users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
	puzzle:
		'<path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z"/>',
	"chevron-left": '<path d="m15 18-6-6 6-6"/>',
	eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
	"eye-off":
		'<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
	pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
	download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
	play: '<polygon points="6 3 20 12 6 21 6 3"/>',
	/* v0.1.77 Commands tab icons — geometry fetched from official lucide
	   main (raw.githubusercontent.com/lucide-icons/lucide). terminal-square
	   rides square-terminal geometry (chevron-up/down were already in the map above): lucide RENAMED it upstream (404 on
	   the old id); Obsidian keeps the old id working in-app (Copilot ships
	   it in production on the same runtime class) */
	"copy-plus": '<line x1="15" x2="15" y1="12" y2="18"/><line x1="12" x2="18" y1="15" y2="15"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
	"terminal-square": '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>',
	/* v0.1.82: Replace action in the Quick Ask action row (paths from
	   lucide-static, extracted verbatim via npm pack) */
	replace:
		'<path d="M14 4a1 1 0 0 1 1-1"/><path d="M15 10a1 1 0 0 1-1-1"/><path d="M21 4a1 1 0 0 0-1-1"/><path d="M21 9a1 1 0 0 1-1 1"/><path d="m3 7 3 3 3-3"/><path d="M6 10V5a2 2 0 0 1 2-2h2"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
};

export function setIcon(el: HTMLElement, name: string): void {
	const body = ICONS[name];
	/* v0.1.49: unknown names used to render a SILENT empty svg — the v0.1.49
	   banner's thumbs were invisible in-sim while fine in-app (the sim's
	   fidelity gap, not the plugin's). Loud beats empty: warn so build
	   console logs flag the gap immediately. */
	if (!body) console.warn(`shim: unknown lucide icon "${name}" (add real paths to ICONS)`);
	el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide lucide-${name}">${body ?? ""}</svg>`;
}

/* --------------------------------- notices -------------------------------- */

export class Notice {
	static last: string | null = null;
	private el: { hide: () => void } | null = null;
	constructor(message: unknown, _timeout?: number) {
		Notice.last = typeof message === "string" ? message : "(fragment notice)";
		(window as unknown as { __oaNotices?: string[] }).__oaNotices =
			((window as unknown as { __oaNotices?: string[] }).__oaNotices ?? []).concat(Notice.last);
	}
	hide(): void {}
}

/* -------------------------------- component ------------------------------- */

export class Component {
	register(_unload?: unknown): void {}
	registerEvent(_ref?: unknown): void {}
	registerDomEvent(_el?: unknown, _type?: unknown, _cb?: unknown): void {}
	registerInterval(id: number): number {
		return id;
	}
	load(): void {}
	onload(): void {}
	onunload(): void {}
	unload(): void {}
	addChild<T extends Component>(child: T): T {
		return child;
	}
	removeChild<T extends Component>(child: T): T {
		return child;
	}
}

export class MarkdownRenderer {
	static async render(
		_app: unknown,
		markdown: string,
		el: HTMLElement,
		_sourcePath: string,
		_component: Component
	): Promise<void> {
		el.innerHTML = mdToHtml(markdown ?? "");
	}
}

/* --------------------------------- network -------------------------------- */

export interface RequestUrlParam {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: string;
	throw?: boolean;
}
export interface RequestUrlResponse {
	status: number;
	headers: Record<string, string>;
	arrayBuffer: ArrayBuffer;
	json: unknown;
	text: string;
}

export async function requestUrl(req: RequestUrlParam): Promise<RequestUrlResponse> {
	const w = window as unknown as { __oaRequestUrl?: (r: RequestUrlParam) => Promise<RequestUrlResponse> };
	if (!w.__oaRequestUrl) throw new Error("sim: __oaRequestUrl not installed");
	return w.__oaRequestUrl(req);
}

/* ----------------------------------- misc --------------------------------- */

export function normalizePath(p: string): string {
	return p.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
}

export const Platform = {
	isDesktop: true,
	/* Read at access time so a harness scenario can override the platform
	   before mount (window.__oaForceMobile). */
	get isMobile() {
		return (window as unknown as { __oaForceMobile?: boolean }).__oaForceMobile === true;
	},
	isMacOS: false,
	isWin: true,
	isLinux: false,
};

export function htmlToMarkdown(html: string): string {
	return html;
}

/* --------------------------------- files ---------------------------------- */

export class TAbstractFile {
	path = "";
	name = "";
	parent: unknown = null;
}
export class TFile extends TAbstractFile {
	extension = "md";
	get basename(): string {
		return this.name.replace(/\.md$/, "");
	}
	stat = { ctime: 0, mtime: 0, size: 0 };
}
export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
	isRoot(): boolean {
		return this.path === "/" || this.path === "";
	}
	vault: unknown = null;
}

/* ------------------------------ modal stubs ------------------------------- */
/** minimal MarkdownView — ChatApp uses it only in `instanceof` checks before
 *  touching the editor (insert-at-cursor action). Views in the shim are never
 *  real MarkdownViews, which mirrors the "no markdown leaf focused" path. */
export class MarkdownView {
	editor = {
		getSelection: (): string => "",
		replaceSelection: (_s: string): void => {},
		replaceRange: (_s: string, _pos?: unknown): void => {},
		getCursor: (): { line: number; ch: number } => ({ line: 0, ch: 0 }),
		focus: (): void => {},
	};
}

/* vault-pickers.ts subclasses FuzzySuggestModal at module scope, so the shim
   must provide a real class even though scenarios never open the pickers. */

export class Modal {
	contentEl: HTMLElement = document.createElement("div");
	constructor(public app: unknown) {}
	/* v0.1.156: render for real (mount contentEl → body, then onOpen) so
	   modal UI can be probed like the settings pane. The HTMLElement helpers
	   (addClass/createEl/…) are polyfilled above; Notice/setIcon are shimmed. */
	open(): void {
		document.body.appendChild(this.contentEl);
		this.onOpen();
	}
	close(): void {
		this.onClose();
		this.contentEl.remove();
	}
	onOpen(): void {}
	onClose(): void {}
}

export class FuzzySuggestModal<T> extends Modal {
	setPlaceholder(_p: string): void {}
	getItems(): T[] {
		return [];
	}
	getItemText(_item: T): string {
		return "";
	}
	onChooseItem(_item: T): void {}
}

/* ================ settings-harness additions (2026-07-22) =================
 * Real-DOM reproduction of Obsidian's PluginSettingTab + Setting and the
 * component classes settingsTab.ts uses. Selector structures mirror app.css
 * (.setting-item*, .checkbox-container, .dropdown, .extra-setting-button,
 * .mod-cta/.mod-warning, input[type='range']) so screenshots against the
 * vendored reference css are honest. Test-only; production never sees this. */

export class App {
	vault = {
		getAbstractFileByPath: (_p: string): unknown => null,
		getFiles: (): TFile[] => [],
		read: async (_f: TFile): Promise<string> => "",
	};
	workspace = {
		getLeaf: (_new?: boolean) => ({ openFile: async (_f: TFile): Promise<void> => {} }),
	};
}

export class SettingTab {
	app: App;
	containerEl: HTMLElement;
	constructor(app: App) {
		this.app = app;
		this.containerEl = document.createElement("div");
	}
	display(): void {}
	hide(): void {}
}

export class PluginSettingTab extends SettingTab {
	plugin: unknown;
	constructor(app: App, plugin: unknown) {
		super(app);
		this.plugin = plugin;
		/* real app: the tab's containerEl carries .vertical-tab-content,
		   which is where app.css's settings padding lives */
		this.containerEl.addClass("vertical-tab-content");
	}
}

class BaseComponent {
	disabled = false;
	setDisabled(disabled: boolean): this {
		this.disabled = disabled;
		return this;
	}
}

export class TextComponent extends BaseComponent {
	inputEl: HTMLInputElement;
	constructor(containerEl: HTMLElement) {
		super();
		this.inputEl = containerEl.createEl("input", { attr: { type: "text" } });
	}
	setPlaceholder(placeholder: string): this {
		this.inputEl.placeholder = placeholder;
		return this;
	}
	setValue(value: string): this {
		this.inputEl.value = value;
		return this;
	}
	getValue(): string {
		return this.inputEl.value;
	}
	onChange(cb: (value: string) => unknown): this {
		this.inputEl.addEventListener("input", () => cb(this.inputEl.value));
		return this;
	}
	setDisabled(disabled: boolean): this {
		super.setDisabled(disabled);
		this.inputEl.disabled = disabled;
		return this;
	}
}

export class TextAreaComponent extends BaseComponent {
	inputEl: HTMLTextAreaElement;
	constructor(containerEl: HTMLElement) {
		super();
		this.inputEl = containerEl.createEl("textarea");
	}
	setPlaceholder(p: string): this {
		this.inputEl.placeholder = p;
		return this;
	}
	setValue(v: string): this {
		this.inputEl.value = v;
		return this;
	}
	getValue(): string {
		return this.inputEl.value;
	}
	onChange(cb: (value: string) => unknown): this {
		this.inputEl.addEventListener("input", () => cb(this.inputEl.value));
		return this;
	}
}

export class DropdownComponent extends BaseComponent {
	selectEl: HTMLSelectElement;
	constructor(containerEl: HTMLElement) {
		super();
		this.selectEl = containerEl.createEl("select", { cls: "dropdown" });
	}
	addOption(value: string, text: string): this {
		const opt = document.createElement("option");
		opt.value = value;
		opt.textContent = text;
		this.selectEl.appendChild(opt);
		return this;
	}
	setValue(value: string): this {
		this.selectEl.value = value;
		return this;
	}
	getValue(): string {
		return this.selectEl.value;
	}
	onChange(cb: (value: string) => unknown): this {
		this.selectEl.addEventListener("change", () => cb(this.selectEl.value));
		return this;
	}
	setDisabled(disabled: boolean): this {
		super.setDisabled(disabled);
		this.selectEl.disabled = disabled;
		return this;
	}
}

export class ToggleComponent extends BaseComponent {
	toggleEl: HTMLElement;
	private checkbox: HTMLInputElement;
	private cb: ((value: boolean) => unknown) | null = null;
	constructor(containerEl: HTMLElement) {
		super();
		this.toggleEl = containerEl.createDiv({ cls: "checkbox-container" });
		this.toggleEl.setAttribute("tabindex", "0");
		this.checkbox = this.toggleEl.createEl("input", { attr: { type: "checkbox", tabindex: "-1" } }) as HTMLInputElement;
		this.toggleEl.addEventListener("click", () => this.flip());
		this.toggleEl.addEventListener("keydown", (e) => {
			if (e.key === " " || e.key === "Enter") {
				e.preventDefault();
				this.flip();
			}
		});
	}
	private flip(): void {
		if (this.disabled) return;
		this.setValue(!this.checkbox.checked);
		this.cb?.(this.checkbox.checked);
	}
	setValue(value: boolean): this {
		this.checkbox.checked = value;
		this.toggleEl.toggleClass("is-enabled", value);
		this.checkbox.setAttribute("aria-checked", value ? "true" : "false");
		return this;
	}
	getValue(): boolean {
		return this.checkbox.checked;
	}
	onChange(cb: (value: boolean) => unknown): this {
		this.cb = cb;
		return this;
	}
	setTooltip(text: string): this {
		this.toggleEl.setAttribute("title", text);
		return this;
	}
}

export class ButtonComponent extends BaseComponent {
	buttonEl: HTMLButtonElement;
	constructor(containerEl: HTMLElement) {
		super();
		this.buttonEl = containerEl.createEl("button");
	}
	setButtonText(text: string): this {
		this.buttonEl.setText(text);
		return this;
	}
	setClass(cls: string): this {
		this.buttonEl.addClass(cls);
		return this;
	}
	setCta(): this {
		this.buttonEl.addClass("mod-cta");
		return this;
	}
	setWarning(): this {
		this.buttonEl.addClass("mod-warning");
		return this;
	}
	setIcon(name: string): this {
		setIcon(this.buttonEl, name);
		return this;
	}
	onClick(cb: () => unknown): this {
		this.buttonEl.addEventListener("click", () => cb());
		return this;
	}
	setDisabled(disabled: boolean): this {
		super.setDisabled(disabled);
		this.buttonEl.disabled = disabled;
		return this;
	}
}

export class ExtraButtonComponent extends BaseComponent {
	extraSettingsEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		super();
		this.extraSettingsEl = containerEl.createDiv({ cls: "extra-setting-button" });
		this.extraSettingsEl.setAttribute("tabindex", "0");
	}
	setIcon(name: string): this {
		setIcon(this.extraSettingsEl, name);
		return this;
	}
	setTooltip(text: string): this {
		this.extraSettingsEl.setAttribute("title", text);
		this.extraSettingsEl.setAttribute("aria-label", text);
		return this;
	}
	onClick(cb: () => unknown): this {
		this.extraSettingsEl.addEventListener("click", () => cb());
		this.extraSettingsEl.addEventListener("keydown", (e) => {
			if (e.key === " " || e.key === "Enter") {
				e.preventDefault();
				cb();
			}
		});
		return this;
	}
	setDisabled(disabled: boolean): this {
		super.setDisabled(disabled);
		this.extraSettingsEl.toggleClass("is-disabled", disabled);
		return this;
	}
}

export class SliderComponent extends BaseComponent {
	sliderEl: HTMLInputElement;
	constructor(containerEl: HTMLElement) {
		super();
		this.sliderEl = containerEl.createEl("input", { cls: "slider", attr: { type: "range" } }) as HTMLInputElement;
	}
	setLimits(min: number, max: number, step: number): this {
		this.sliderEl.min = String(min);
		this.sliderEl.max = String(max);
		this.sliderEl.step = String(step);
		return this;
	}
	setValue(value: number): this {
		this.sliderEl.value = String(value);
		return this;
	}
	getValue(): number {
		return Number(this.sliderEl.value);
	}
	setDynamicTooltip(): this {
		return this;
	}
	onChange(cb: (value: number) => unknown): this {
		this.sliderEl.addEventListener("input", () => cb(Number(this.sliderEl.value)));
		return this;
	}
	setDisabled(disabled: boolean): this {
		super.setDisabled(disabled);
		this.sliderEl.disabled = disabled;
		return this;
	}
}

export class Setting {
	settingEl: HTMLElement;
	infoEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		this.settingEl = containerEl.createDiv({ cls: "setting-item" });
		this.infoEl = this.settingEl.createDiv({ cls: "setting-item-info" });
		this.nameEl = this.infoEl.createDiv({ cls: "setting-item-name" });
		this.descEl = this.infoEl.createDiv({ cls: "setting-item-description" });
		this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
	}
	setName(name: string | DocumentFragment): this {
		this.nameEl.empty();
		if (typeof name === "string") this.nameEl.setText(name);
		else this.nameEl.appendChild(name);
		return this;
	}
	setDesc(desc: string | DocumentFragment): this {
		this.descEl.empty();
		if (typeof desc === "string") this.descEl.setText(desc);
		else this.descEl.appendChild(desc);
		return this;
	}
	setClass(cls: string): this {
		this.settingEl.addClass(cls);
		return this;
	}
	setHeading(): this {
		this.settingEl.addClass("setting-item-heading");
		return this;
	}
	addText(cb: (c: TextComponent) => unknown): this {
		cb(new TextComponent(this.controlEl));
		return this;
	}
	addTextArea(cb: (c: TextAreaComponent) => unknown): this {
		cb(new TextAreaComponent(this.controlEl));
		return this;
	}
	addDropdown(cb: (c: DropdownComponent) => unknown): this {
		cb(new DropdownComponent(this.controlEl));
		return this;
	}
	addToggle(cb: (c: ToggleComponent) => unknown): this {
		cb(new ToggleComponent(this.controlEl));
		return this;
	}
	addButton(cb: (c: ButtonComponent) => unknown): this {
		cb(new ButtonComponent(this.controlEl));
		return this;
	}
	addExtraButton(cb: (c: ExtraButtonComponent) => unknown): this {
		cb(new ExtraButtonComponent(this.controlEl));
		return this;
	}
	addSlider(cb: (c: SliderComponent) => unknown): this {
		cb(new SliderComponent(this.controlEl));
		return this;
	}
}

/** minimal YAML subset (settings harness never parses real YAML — the plugin
 *  stub returns canned skills — but src/agent/skills.ts imports the name). */
export function parseYaml(text: string): unknown {
	const out: Record<string, unknown> = {};
	for (const line of String(text).split("\n")) {
		const m = /^(\w[\w-]*):\s*(.*)$/.exec(line.trim());
		if (m) out[m[1]] = m[2];
	}
	return out;
}
