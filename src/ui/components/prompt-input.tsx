/**
 * prompt-kit · PromptInput — slash-chip composer (Hermes Desktop parity)
 *
 * The editor is a contenteditable: slash tokens render as atomic pill spans
 * (contenteditable=false → Backspace deletes the WHOLE chip, like Hermes).
 * The text model stays PLAIN — chips serialize back to `/name`, so submit,
 * drafts, queue edits and the transcript never know chips exist. Chip rules
 * (no-arg commands at token 0, skills anywhere, committed-by-space, path
 * guard) live in src/ui/composer/chips.ts, mirroring slash-refs.ts.
 *
 * External value changes (prefill, queue-edit restore, snippet insert)
 * hydrate inertly (trailingCommitted), typed transforms fire on the space
 * that commits the token.
 */

import { KeyboardEvent as ReactKeyboardEvent, ReactNode, forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { caretOffsetOf, serializeComposer, setCaretOffset, slashChipMatches, type ChipScanOptions } from "../composer/chips";
import { markdownComposerEdit } from "../markdown-keys";
import { createComposerUndoHistory, isRedoShortcut, isUndoShortcut, type ComposerSnapshot } from "../composer/undo";

/** what caret-sensitive callers (snippets, @-refs) need from the editor */
export interface ComposerHandle {
	readonly value: string;
	readonly selectionStart: number;
	readonly selectionEnd: number;
	/** caret-only by design (v0.1.73 audit B6) — the old name promised a
	   range but the contenteditable shim only ever collapsed to a caret */
	setCaret: (pos: number) => void;
	focus: () => void;
}

export interface PromptInputHandle {
	focus: () => void;
	/** caret shim — same call shape a textarea offered (serialized model) */
	getTextarea: () => ComposerHandle | null;
	/** v0.1.180: drop the composer's own undo history (session swap/edit). */
	resetUndo: () => void;
}

export type ChipResolver = Pick<ChipScanOptions, "isCommandChippable" | "isSkill">;

function chipSpan(command: string, kind: string): HTMLSpanElement {
	const span = document.createElement("span");
	span.className = "oa-chip";
	span.dataset.kind = kind;
	span.contentEditable = "false";
	span.textContent = command;
	return span;
}

/* rebuild the editor DOM from plain text, converting match ranges to chips */
function renderText(el: HTMLElement, text: string, resolver: ChipResolver | undefined, inert: boolean): void {
	while (el.firstChild) el.removeChild(el.firstChild);
	const matches = resolver
		? slashChipMatches(text, { boundaryBefore: true, trailingCommitted: inert, ...resolver })
		: [];
	let pos = 0;
	for (const m of matches) {
		if (m.start > pos) el.appendChild(document.createTextNode(text.slice(pos, m.start)));
		el.appendChild(chipSpan(m.command, m.kind));
		pos = m.end;
	}
	if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
}

/* segment the current DOM: [kind,label] tuples — chips as chip/kind, text as text */
function domSignature(el: HTMLElement): string {
	const parts: string[] = [];
	for (let i = 0; i < el.childNodes.length; i++) {
		const n = el.childNodes[i];
		if (n instanceof HTMLElement && n.classList.contains("oa-chip")) parts.push(`chip:${n.dataset.kind}:${n.textContent}`);
		else parts.push(`text:${n.textContent ?? ""}`);
	}
	return parts.join("|");
}

function textSignature(text: string, resolver: ChipResolver, trailingCommitted: boolean): string {
	const matches = slashChipMatches(text, { boundaryBefore: true, trailingCommitted, ...resolver });
	const parts: string[] = [];
	let pos = 0;
	for (const m of matches) {
		if (m.start > pos) parts.push(`text:${text.slice(pos, m.start)}`);
		parts.push(`chip:${m.kind}:${m.command}`);
		pos = m.end;
	}
	if (pos < text.length) parts.push(`text:${text.slice(pos)}`);
	return parts.join("|");
}

export const PromptInput = forwardRef<
	PromptInputHandle,
	{
		value: string;
		onValueChange: (v: string) => void;
		onSubmit?: () => void;
		disabled?: boolean;
		enterToSend?: boolean;
		placeholder?: string;
		attachments?: ReactNode;
		children?: ReactNode;
		isLoading?: boolean;
		maxHeight?: number | string;
		allowEmptySubmit?: boolean;
		/** slash-chip predicates (no-arg commands + installed skills) */
		chipResolver?: ChipResolver;
	}
>(function PromptInput(
	{ value, onValueChange, onSubmit, disabled, enterToSend = true, placeholder, attachments, children, isLoading, maxHeight = 240, allowEmptySubmit = false, chipResolver },
	ref
) {
	const editorRef = useRef<HTMLDivElement>(null);
	const lastEmittedRef = useRef(value);
	const pasteHydrateRef = useRef(false);
	/* v0.1.180 (Hermes parity): own undo/redo stack — chip re-renders bypass
	   Chromium's native undo, so we own the whole stack. */
	const undoRef = useRef(createComposerUndoHistory());

	const snapshot = (): ComposerSnapshot => {
		const el = editorRef.current;
		if (!el) return { caret: 0, text: value };
		return { caret: caretOffsetOf(el) ?? value.length, text: serializeComposer(el) };
	};

	const applySnapshot = (s: ComposerSnapshot | null): boolean => {
		const el = editorRef.current;
		if (!el || !s) return false;
		renderText(el, s.text, chipResolver, true);
		setCaretOffset(el, s.caret);
		lastEmittedRef.current = s.text;
		onValueChange(s.text);
		return true;
	};

	/* external writes (prefill, queue restore, snippet) hydrate inertly;
	   typed edits keep their DOM — reported via onInput instead */
	useEffect(() => {
		const el = editorRef.current;
		if (!el) return;
		if (serializeComposer(el) !== value) {
			renderText(el, value, chipResolver, true);
			lastEmittedRef.current = value;
		}
	}, [value, chipResolver]);

	useEffect(() => {
		const el = editorRef.current;
		if (!el) return;
		el.style.maxHeight = typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight;
	}, [maxHeight]);

	const syncChips = (): void => {
		const el = editorRef.current;
		if (!el || !chipResolver) return;
		const text = serializeComposer(el);
		const trailing = pasteHydrateRef.current;
		pasteHydrateRef.current = false;
		const want = textSignature(text, chipResolver, trailing);
		if (want !== domSignature(el)) {
			const caret = caretOffsetOf(el);
			renderText(el, text, chipResolver, trailing);
			if (caret !== null) setCaretOffset(el, caret);
		}
		const after = serializeComposer(el);
		if (after !== lastEmittedRef.current) {
			lastEmittedRef.current = after;
			onValueChange(after);
		}
	};

	const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		/* 2026-08-04 (v0.1.72 prompt-kit audit B2): keys inside an active IME
		   composition belong to the IME — Enter CONFIRMS a candidate; it must
		   never submit half-converted text (upstream patched the same class
		   of bug for its textarea, prompt-kit #82). */
		if ((e.nativeEvent as KeyboardEvent).isComposing) return;
		/* v0.1.180 (Hermes parity): undo/redo are ours — the chip re-render
		   bypasses Chromium's stack. Claim the chord before anything else. */
		if (isUndoShortcut(e)) {
			e.preventDefault();
			applySnapshot(undoRef.current.undo(snapshot()));
			return;
		}
		if (isRedoShortcut(e)) {
			e.preventDefault();
			applySnapshot(undoRef.current.redo(snapshot()));
			return;
		}
		/* v0.1.116: kunci markdown di composer kaya — DECISION murni dari
		   markdown-keys, MUTASI lewat renderText kanonik milik komponen ini
		   sendiri bukan execCommand (Chrome mengubah "\n" jadi <div> padahal
		   offset composer dihitung atas <br>/teks + spasi ujung jadi &nbsp;).
		   Hanya caret collapsed: seleksi/rentang dilepas ke bawaan supaya
		   tak pernah membelah chip. */
		{
			const el = editorRef.current;
			const sel = window.getSelection();
			if (el && sel && sel.isCollapsed) {
				/* v0.1.127: mesin markdown diberi tahu chord kirim dari setelan,
				   supaya Enter/Shift+Enter bertukar makna persis toggle — mesin
				   menjahit baris baru, cabang submit di bawah yang mengirim */
				const next = markdownComposerEdit(e, serializeComposer(el), caretOffsetOf(el), {
					sendKey: enterToSend ? "enter" : "shift-enter",
				});
				if (next) {
					e.preventDefault();
					undoRef.current.record(snapshot());
					renderText(el, next.value, chipResolver, true);
					setCaretOffset(el, next.selectionStart);
					lastEmittedRef.current = next.value;
					onValueChange(next.value);
					return;
				}
			}
		}
		if (e.key !== "Enter") return;
		/* v0.1.127 (owner: "ctrl enter … sebenarnya tidak berfungsi" — akar:
		   cabang lama hanya punya makna di SATU posisi toggle = tombol mati
		   di posisi pabrik): Ctrl/Cmd+Enter SELALU mengirim; Enter dan
		   Shift+Enter bertukar sesuai enterToSend. */
		const isSendChord = e.ctrlKey || e.metaKey || (enterToSend && !e.shiftKey) || (!enterToSend && e.shiftKey);
		if (isSendChord) {
			e.preventDefault();
			if (!disabled && (serializeNow().trim() || allowEmptySubmit)) onSubmit?.();
			return;
		}
		/* chord BARIS BARU yang lolos mesin = teks non-list. v0.1.127 (diukur
		   keylab + driveKeys): SATU-SATUNYA jalur chromium yang byte-benar di
		   composer pre-wrap adalah hard-break native — Enter bawaan membelah
		   block <div> yang serializeComposer (root-level) tak menghitung
		   → baris-baris terjepit di wire ("baris satubaris dua"), dan
		   menjahit "\n" teks manual menyentuh kanonisasi caret-snap ujung.
		   execCommand dipakai persis segaris Shift+Enter native; seleksi
		   collapsed DI DALAM editor (gerbang blok markdown di atas) sehingga
		   varian-bocor v0.1.117 (perintah menyasar seleksi window dari
		   konteks textarea) tak berlaku di sini. */
		const isNewlineChord = !e.ctrlKey && !e.metaKey && (enterToSend ? e.shiftKey : !e.shiftKey);
		const ed = editorRef.current;
		if (isNewlineChord && ed && ed.contains(document.activeElement)) {
			e.preventDefault();
			undoRef.current.record(snapshot());
			document.execCommand("insertLineBreak");
		}
	};

	const serializeNow = (): string => {
		const el = editorRef.current;
		return el ? serializeComposer(el) : value;
	};

	useImperativeHandle(ref, () => ({
		focus: () => editorRef.current?.focus(),
		resetUndo: () => undoRef.current.reset(),
		getTextarea: (): ComposerHandle | null => {
			const el = editorRef.current;
			if (!el) return null;
			return {
				get value() {
					return serializeComposer(el);
				},
				get selectionStart() {
					return caretOffsetOf(el) ?? serializeComposer(el).length;
				},
				get selectionEnd() {
					return caretOffsetOf(el) ?? serializeComposer(el).length;
				},
				setCaret(pos: number) {
					setCaretOffset(el, pos);
				},
				focus() {
					el.focus();
				},
			};
		},
	}));

	return (
		<div
			className={`oa-prompt-input${isLoading ? " is-loading" : ""}`}
			aria-busy={isLoading || undefined}
			onClick={(e) => {
				/* 2026-08-04 (v0.1.73 prompt-kit audit B3): official container
				   behaviour — clicking the composer frame focuses the editor, but
				   never yanks a control click (buttons keep their own target). */
				if ((e.target as HTMLElement).closest("button")) return;
				editorRef.current?.focus();
			}}
		>
			{attachments ? <div className="oa-prompt-attachments">{attachments}</div> : null}
			{/* keep the .oa-prompt-textarea class: stylesheet + existing drivers */}
			<div
				ref={editorRef}
				className="oa-prompt-textarea oa-rich-composer"
				contentEditable
				role="textbox"
				aria-multiline="true"
				aria-label="Message Open Agent"
				data-placeholder={placeholder ?? "Ask your vault anything…"}
				onInput={(e) => {
					/* v0.1.72 (prompt-kit audit B2): never rewrite the editor DOM
					   mid-composition — a chip-sync during an active CJK IME
					   session destroys it. Hold syncs until compositionend. */
					if ((e.nativeEvent as InputEvent).isComposing) return;
					syncChips();
				}}
				onBeforeInput={(e) => {
					/* v0.1.180: bank the pre-edit state before Chromium mutates
					   the DOM. Typing bursts coalesce into one undo step. */
					const ie = e.nativeEvent as InputEvent;
					undoRef.current.record(snapshot(), { coalesce: ie.inputType === "insertText" });
				}}
				onCompositionEnd={() => syncChips()}
				onKeyDown={handleKeyDown}
				onPaste={(e) => {
					e.preventDefault();
					undoRef.current.record(snapshot());
					pasteHydrateRef.current = true;
					document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
				}}
				onBlur={() => {
					/* a blur leaves the text inert — a trailing committed token chips */
					if (!chipResolver) return;
					const el = editorRef.current;
					if (!el) return;
					const text = serializeComposer(el);
					const want = textSignature(text, chipResolver, true);
					if (want !== domSignature(el)) {
						const caret = caretOffsetOf(el);
						renderText(el, text, chipResolver, true);
						if (caret !== null) setCaretOffset(el, caret);
					}
				}}
				suppressContentEditableWarning
			/>
			<PromptInputActions>{children}</PromptInputActions>
		</div>
	);
});

export function PromptInputActions({ children }: { children: ReactNode }) {
	return <div className="oa-prompt-actions">{children}</div>;
}

export function PromptInputAction({
	tooltip,
	onClick,
	disabled,
	variant = "ghost",
	children,
}: {
	tooltip: string;
	onClick?: () => void;
	disabled?: boolean;
	variant?: "ghost" | "primary" | "danger";
	children: ReactNode;
}) {
	return (
		<button
			className={`oa-prompt-action oa-prompt-action-${variant}`}
			aria-label={tooltip}
			onClick={onClick}
			disabled={disabled}
		>
			{children}
		</button>
	);
}
