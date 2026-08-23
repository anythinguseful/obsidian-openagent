/**
 * Quick Ask — overlay host (positioning + React mount).
 *
 * The React meat lives in panel.tsx; this class only owns the fixed
 * container, computes placement via `coordsAtPos`, and re-renders the
 * panel when the guard version bumps (document changed under us).
 *
 * Deliberate v1 simplifications vs Copilot's QuickAskOverlay (documented
 * in docs/studies/copilot-study-notes.md):
 *  - positioning is `position: fixed` to the viewport (recomputed on
 *    scroll / resize / doc change) instead of an editor-hosted overlay;
 *  - placement has a simple below/above side lock so the panel does not
 *    flip sides while the answer streams in;
 *  - v0.1.88–100 gesture geometry: the head row is the drag handle
 *    (Pointer Events → mouse AND touch; grip glyph DIHAPUS v0.1.100
 *    owner pick grip-none — barisnya sendiri affordance-nya). Dragging
 *    DETACHES the panel from its caret anchor: scroll/resize stops
 *    re-anchoring it. Resize KEMBALI v0.1.100 atas permintaan owner —
 *    bukan tombol: seam tak terlihat 16px pojok kanan-bawah (macOS
 *    way yang diperbaiki: zona hit DI DALAM frame — pelajaran Tahoe),
 *    keyboard lewat fokus seam + panah. Session-only both — closing
 *    resets, next open re-anchors & content-driven height returns.
 */

import { createElement } from "react";
import { Root, createRoot } from "react-dom/client";
import type { EditorView } from "@codemirror/view";
import type { App, Component } from "obsidian";
import type { ChatMessage } from "../types";
import type { ReplaceGuard } from "./replaceGuard";
import type { MenuProvider } from "../agent/modelMenu";
import type { WorkspacePolicy } from "../agent/workspacePolicy";
import { QuickAskPanel } from "./panel";

export type QuickAskRunTurn = (
	messages: ChatMessage[],
	onToken: (text: string) => void,
	signal: AbortSignal,
	/** v0.1.92 — dipanggil SEBELUM hop retry/failover: host me-reset stream
	    parsial supaya attempt gagal-setelah-streaming tak dobel tampil */
	onRetry: (() => void) | undefined,
	workspacePolicy: WorkspacePolicy
) => Promise<string>;

/** v0.1.85 — satu chip saran di panel kosong: label = teks chip,
    text = yang distage ke input saat chip diklik (editable sebelum send) */
export interface QuickAskSuggestion {
	label: string;
	text: string;
}

/** v0.1.89 — state menu model LIVE (getter dibaca ulang setelah setiap
    pick/refresh sehingga pill + caption footer selalu cermin settings) */
export interface QuickAskMenuState {
	providerSlug: string;
	providerName: string;
	model: string;
	providers: MenuProvider[];
	visibleModels: string[] | null;
	collapsedSlugs: string[];
}

/** v0.1.89 — kontrak model-picker in-panel (komponen ModelPicker yang
    sama dengan main chat; MoA sengaja TIDAK dioper — runTurn Quick Ask
    = chatCompletion tunggal) */
export interface QuickAskModelMenu {
	getState: () => QuickAskMenuState;
	onSelect: (provider: string, model: string) => void | Promise<void>;
	onRefresh: () => void | Promise<void>;
	onSetVisibleModels: (next: string[]) => void;
	onToggleCollapsed: (slug: string) => void;
	onOpenSettings: () => void;
}

export interface QuickAskOverlayOptions {
	editorView: EditorView;
	/** selected text captured at open time (content snapshot) */
	selectedText: string;
	/** v0.1.90 — path note tempat panel dibuka (label lampiran {activeNote});
	    konten dibaca LIVE dari editorView.state.doc saat kirim, bukan
	    snapshot — suntingan belum-simpan ikut terlampir */
	activeNotePath: string | null;
	replaceGuard: ReplaceGuard;
	/** v0.1.89 — model-menu live (pill + footer caption); menggantikan
	    snapshot modelLabel di header (owner: label pindah bawah composer) */
	modelMenu: QuickAskModelMenu;
	snapshotWorkspacePolicy: () => WorkspacePolicy;
	runTurn: QuickAskRunTurn;
	/** suggestion chips resolved at open time (v0.1.85): custom ones from
	    snippets flagged quickAsk, [] → the panel shows its built-ins */
	suggestions: QuickAskSuggestion[];
	onClose: () => void;
	/** Obsidian hosts for the prompt-kit Markdown port (render + event
	    lifecycle host); plugin itself is the natural Component */
	app: App;
	component: Component;
}

const PANEL_MARGIN = 8;
const MIN_PANEL_W = 300;
/* v0.1.100 resize bound (kembali atas permintaan owner): height floor
   covers head + a sliver of chat + composer; width floor matches the
   anchored clamp's (a resized panel never gets narrower than default) */
const MIN_PANEL_H = 200;

export class QuickAskOverlay {
	private container: HTMLDivElement | null = null;
	private root: Root | null = null;
	private guardVersion = 0;
	private placementSide: "below" | "above" | null = null;
	private lastBottom: number | null = null;
	private lastTop: number | null = null;
	private lastFocus: number | null = null;
	private destroyed = false;
	/* v0.1.88–100 — userPos = panel DETACHED dari anchor caret oleh drag;
	   userSize = kotak eksplisit dari seam resize (v0.1.100 kembali).
	   Keduanya SESSION-ONLY: overlay hidup satu siklus open→close. null
	   = tetap anchor math / tinggi content-driven */
	private userPos: { left: number; top: number } | null = null;
	private userSize: { width: number; height: number } | null = null;
	private dragCleanup: (() => void) | null = null;
	private rafId: number | null = null;
	private readonly onScroll = () => this.reposition();
	private readonly onResize = () => this.reposition();

	constructor(private readonly options: QuickAskOverlayOptions) {}

	getReplaceGuard(): ReplaceGuard {
		return this.options.replaceGuard;
	}

	mount(bottomPos: number, topPos: number | null, focusPos: number | null): void {
		const doc = this.options.editorView.dom.ownerDocument;
		const container = doc.createElement("div");
		container.className = "oa-quickask";
		doc.body.appendChild(container);
		this.container = container;
		this.root = createRoot(container);

		/* panel is mounted after the editor lost focus; recompute placement
		   on scroll/resize so it never floats away from its anchor */
		const win = doc.defaultView;
		this.options.editorView.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
		win?.addEventListener("resize", this.onResize);

		this.renderPanel();
		this.updatePosition(bottomPos, topPos, focusPos);
	}

	updatePosition(bottomPos: number, topPos: number | null, focusPos: number | null): void {
		this.lastBottom = bottomPos;
		this.lastTop = topPos;
		this.lastFocus = focusPos;
		/* layout reads (coordsAtPos / getBoundingClientRect) are ILLEGAL
		   during a CM update — and we are always called from one (the show
		   effect, or docChanged mapping). Defer to the next frame. */
		this.schedulePlace();
	}

	private schedulePlace(): void {
		if (this.rafId !== null) return;
		const win = this.options.editorView.dom.ownerDocument.defaultView;
		if (!win) return;
		this.rafId = win.requestAnimationFrame(() => {
			this.rafId = null;
			if (!this.destroyed && this.lastBottom !== null) {
				this.place(this.lastBottom, this.lastTop, this.lastFocus);
			}
		});
	}

	private reposition(): void {
		if (this.lastBottom !== null) this.place(this.lastBottom, this.lastTop, this.lastFocus);
	}

	schedulePanelRerender(): void {
		this.guardVersion += 1;
		this.renderPanel();
	}

	private renderPanel(): void {
		if (!this.root || this.destroyed) return;
		this.root.render(
			createElement(QuickAskPanel, {
				options: this.options,
				guardVersion: this.guardVersion,
				overlay: this,
			})
		);
	}

	private place(bottomPos: number, topPos: number | null, focusPos: number | null): void {
		const container = this.container;
		if (!container) return;
		const view = this.options.editorView;
		const win = view.dom.ownerDocument.defaultView;
		if (!win) return;
		const vw = win.innerWidth;
		const vh = win.innerHeight;

		const coords = (pos: number | null) => {
			if (pos === null || pos < 0 || pos > view.state.doc.length) return null;
			return view.coordsAtPos(pos);
		};
		const bottomRect = coords(bottomPos);
		const topRect = coords(topPos);
		const focusRect = coords(focusPos);

		/* horizontal: anchor at the focus end (selection.head), clamped to
		   the EDITOR's content rect like Copilot (contentLeft/Right), with
		   the viewport as the outer bound — without this a 520px panel on
		   a 430px pane pushes the × and Send off the visible strip
		   (lane-shot proof 2026-08-05) */
		const scrollRect = view.scrollDOM.getBoundingClientRect();
		const availLeft = scrollRect ? scrollRect.left + 4 : PANEL_MARGIN;
		const availRight = scrollRect ? scrollRect.right - 4 : vw - PANEL_MARGIN;
		const maxAvail = Math.max(MIN_PANEL_W, availRight - availLeft);
		const maxVw = Math.max(MIN_PANEL_W, vw - PANEL_MARGIN * 2);
		/* userSize ditulis-balik hasil clamp-nya supaya langkah KEYBOARD
		   berikutnya mulai dari kotak yang terlihat, bukan dari nilai
		   mentah drag (jebakan klasik: drag jauh → clamp, panah macet) */
		let panelWidth: number;
		let panelHeight: number | null = null;
		if (this.userSize) {
			const cw = Math.min(Math.max(MIN_PANEL_W, this.userSize.width), maxVw);
			const ch = Math.min(Math.max(MIN_PANEL_H, this.userSize.height), vh - PANEL_MARGIN * 2);
			this.userSize = { width: cw, height: ch };
			panelWidth = cw;
			panelHeight = ch;
		} else {
			panelWidth = Math.min(520, maxAvail);
		}
		if (!this.userPos) panelWidth = Math.min(panelWidth, maxAvail);

		container.style.width = `${Math.round(panelWidth)}px`;
		if (panelHeight !== null) {
			container.classList.add("oa-quickask-sized");
			container.style.height = `${Math.round(panelHeight)}px`;
		} else {
			container.classList.remove("oa-quickask-sized");
			container.style.height = "";
		}
		container.style.left = `${Math.round(availLeft)}px`;
		container.style.top = `-10000px`; // provisional (measure without a flash)
		container.style.visibility = "hidden";
		const height = container.getBoundingClientRect().height || 320;

		/* detached oleh drag: anchor caret tak lagi berlaku — kunci box user
		   ke viewport lalu selesai; scroll/doc-change reposition menjaga
		   persis titik ini (clamp ulang kalau window berubah ukuran) */
		if (this.userPos) {
			const maxLeft = Math.max(PANEL_MARGIN, vw - PANEL_MARGIN - panelWidth);
			const maxTop = Math.max(PANEL_MARGIN, vh - PANEL_MARGIN - height);
			const dLeft = Math.min(Math.max(this.userPos.left, PANEL_MARGIN), maxLeft);
			const dTop = Math.min(Math.max(this.userPos.top, PANEL_MARGIN), maxTop);
			this.userPos = { left: dLeft, top: dTop };
			container.style.left = `${Math.round(dLeft)}px`;
			container.style.top = `${Math.round(dTop)}px`;
			container.style.visibility = "";
			return;
		}

		const anchorRect = focusRect ?? bottomRect ?? topRect;
		let left = anchorRect ? anchorRect.left : availLeft + (availRight - availLeft - panelWidth) / 2;
		left = Math.min(Math.max(left, availLeft), availRight - panelWidth);
		container.style.left = `${Math.round(left)}px`;

		/* vertical: below the selection by default, flip above when the
		   space below is tight; side lock keeps the choice stable while
		   the stream grows the panel */
		const gap = 6;
		const fitsBelow = bottomRect !== null && bottomRect.bottom + gap + height <= vh - PANEL_MARGIN;
		const fitsAbove = topRect !== null && topRect.top - gap - height >= PANEL_MARGIN;
		let side: "below" | "above";
		if (this.placementSide === "below" && bottomRect !== null) side = fitsBelow || !fitsAbove ? "below" : "above";
		else if (this.placementSide === "above" && topRect !== null) side = fitsAbove || !fitsBelow ? "above" : "below";
		else if (fitsBelow) side = "below";
		else if (fitsAbove) side = "above";
		else side = bottomRect !== null ? "below" : "above";
		this.placementSide = side;

		let top: number;
		if (side === "below" && bottomRect) top = bottomRect.bottom + gap;
		else if (side === "above" && topRect) top = topRect.top - gap - height;
		else top = (vh - height) / 2;
		top = Math.min(Math.max(top, PANEL_MARGIN), Math.max(PANEL_MARGIN, vh - PANEL_MARGIN - height));

		container.style.top = `${Math.round(top)}px`;
		container.style.visibility = "";
	}

	/* v0.1.88 — drag: grabbed on the head row (panel.tsx filters buttons
	   out). Window-level move/up so a fast pointer leaving the panel
	   still tracks; pointercancel covers touch takeovers. preventDefault
	   on down+move keeps the gesture from selecting note text. */
	beginDrag(ev: PointerEvent): void {
		const container = this.container;
		if (!container) return;
		const win = container.ownerDocument.defaultView;
		if (!win) return;
		ev.preventDefault();
		const rect = container.getBoundingClientRect();
		const startX = ev.clientX;
		const startY = ev.clientY;
		const startLeft = rect.left;
		const startTop = rect.top;
		container.classList.add("is-dragging");
		const onMove = (e: PointerEvent) => {
			e.preventDefault();
			this.userPos = { left: startLeft + (e.clientX - startX), top: startTop + (e.clientY - startY) };
			this.schedulePlace();
		};
		const onUp = () => {
			container.classList.remove("is-dragging");
			win.removeEventListener("pointermove", onMove);
			win.removeEventListener("pointerup", onUp);
			win.removeEventListener("pointercancel", onUp);
			if (this.dragCleanup === onUp) this.dragCleanup = null;
		};
		this.dragCleanup?.();
		this.dragCleanup = onUp;
		win.addEventListener("pointermove", onMove);
		win.addEventListener("pointerup", onUp);
		win.addEventListener("pointercancel", onUp);
	}

	/* v0.1.100 — resize KEMBALI (owner: mau ada, tapi bukan tombol):
	   seam tak terlihat pojok kanan-bawah (logika persis port v0.1.88).
	   Grows from the CURRENT box, never from content; bounds clamp di
	   place() juga (single source of truth) */
	beginResize(ev: PointerEvent): void {
		const container = this.container;
		if (!container) return;
		const win = container.ownerDocument.defaultView;
		if (!win) return;
		ev.preventDefault();
		const rect = container.getBoundingClientRect();
		const startX = ev.clientX;
		const startY = ev.clientY;
		const startW = rect.width;
		const startH = rect.height;
		container.classList.add("is-resizing");
		const onMove = (e: PointerEvent) => {
			e.preventDefault();
			this.userSize = { width: startW + (e.clientX - startX), height: startH + (e.clientY - startY) };
			this.schedulePlace();
		};
		const onUp = () => {
			container.classList.remove("is-resizing");
			win.removeEventListener("pointermove", onMove);
			win.removeEventListener("pointerup", onUp);
			win.removeEventListener("pointercancel", onUp);
			if (this.dragCleanup === onUp) this.dragCleanup = null;
		};
		this.dragCleanup?.();
		this.dragCleanup = onUp;
		win.addEventListener("pointermove", onMove);
		win.addEventListener("pointerup", onUp);
		win.addEventListener("pointercancel", onUp);
	}

	/* v0.1.100 — keyboard resize (seam terfokus + panah; Shift ×4): seeds
	   userSize dari kotak terukur saat seam belum pernah di-drag */
	resizeByKeys(dw: number, dh: number): void {
		const rect = this.container?.getBoundingClientRect();
		if (!rect) return;
		const base = this.userSize ?? { width: rect.width, height: rect.height };
		this.userSize = { width: base.width + dw, height: base.height + dh };
		this.schedulePlace();
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.dragCleanup?.();
		const win = this.options.editorView.dom.ownerDocument.defaultView;
		if (this.rafId !== null && win) {
			win.cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.options.editorView.scrollDOM.removeEventListener("scroll", this.onScroll);
		win?.removeEventListener("resize", this.onResize);
		const root = this.root;
		const container = this.container;
		this.root = null;
		this.container = null;
		/* unmounting a root synchronously from inside its own event handler
		   (× / after Replace) trips React; defer one tick */
		setTimeout(() => {
			root?.unmount();
			container?.remove();
		}, 0);
	}
}
