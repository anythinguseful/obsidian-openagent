/**
 * Quick Ask — floating chat panel (React meat; Copilot quick-ask ported).
 *
 * v0.1.82: rebuilt on our prompt-kit component ports (owner ask: "kalau
 * prompt-kit bisa diterapkan akan lebih mantap") so the floating panel is
 * the same visual family as the main chat:
 *  · ChatContainer — stick-to-bottom + floating ScrollButton
 *  · Message / MessageActions / CopyAction — hover-reveal icon actions
 *    (Copy flips to a check, exactly like the chat)
 *  · Markdown — final answers render real markdown (wikilinks/code);
 *    streaming stays plain pre-wrap — the same rule the chat follows
 *  · Loader (typing) — before the first token, instead of dead air
 *  · PromptInputAction — composer's own send/stop icon buttons
 *  · empty state offers suggestion chips (they FILL the input, never
 *    auto-send — a suggestion you can't inspect before it flies off is
 *    a lie)
 *
 * Interaction contract (parity with Copilot, verified in source):
 *  - multi-turn, tools OFF, dedicated system prompt (verbatim below);
 *  - the selection rides the FIRST user message only, wrapped in
 *    `<selected_text>…</selected_text>` — display bubbles never show the
 *    XML (Copilot does the same);
 *  - Replace flows through the ReplaceGuard (disabled + honest reason on
 *    drift); Replace and Insert close the panel on success; Esc / ×
 *    close; Enter sends, Shift+Enter newline;
 *  - `{activeNote}` in the typed question resolves to the note this panel
 *    was opened on, read LIVE from the editor doc at send time (v0.1.90);
 *    bubbles keep the raw typed text, the wire carries the [Attached
 *    file:] block (main-chat parity format);
 *  - a failed turn rolls the user bubble back (Copilot parity), an
 *    aborted turn just stops (divergence: Copilot rolls back too; we
 *    keep the question so it can be resent).
 */

import { useEffect, useRef, useState } from "react";
import { Notice } from "obsidian";
import type { ChatMessage } from "../types";
import type { QuickAskMenuState, QuickAskOverlay, QuickAskOverlayOptions } from "./overlay";
import { extractActiveNoteToken } from "../agent/promptTokens";
import { ChatContainer } from "../ui/components/chat-container";
import { CopyAction, Message, MessageAction, MessageActions } from "../ui/components/message";
import { Markdown } from "../ui/components/markdown";
import { canonicalizeAssistantOutput } from "../markdown/canonical-output";
import { Loader } from "../ui/components/loader";
import { PromptInputAction } from "../ui/components/prompt-input";
/* v0.1.89 — picker model yang sama persis dengan main chat (owner: "model
   picker sama seperti di main chat ui") */
import { ModelPicker } from "../ui/components/model-picker";
import { ArrowUpIcon, SparklesIcon, StopIcon, TextCursorInputIcon, XIcon } from "../ui/icons";
import { Icon } from "../ui/Icon";

/** Copilot `quickCommandPrompts.ts` QUICK_COMMAND_SYSTEM_PROMPT, verbatim. */
const QUICK_COMMAND_SYSTEM_PROMPT = `
You are an AI assistant designed to execute user instructions with precision. Your responses should be:

- Direct and focused: Address only what is explicitly requested
- Concise: Avoid unnecessary elaboration unless the user asks for details
- Context-aware: When text is selected or highlighted, treat it as the primary target for any requested action
- Action-oriented: Prioritize completing the task over explaining the process

Key principles:

- Follow instructions literally and completely
- Assume selected/highlighted text is the focus unless told otherwise
- Use all provided context: Consider any additional information, examples, or constraints the user provides to better complete the task
- Add explanations only when explicitly requested or when clarification is essential
- Maintain the user's preferred format and style

Response format: Match the format implied by the user's request (e.g., if they ask for a list, provide a list; if they ask for a rewrite, provide only the rewritten text).
`;

interface QaMessage {
	id: number;
	role: "user" | "assistant";
	content: string;
}

let nextId = 1;

/** built-in suggestion chips reflect the actual capability (selection vs
    cursor). v0.1.85: they're the FALLBACK — once the user flags any prompt
    snippet with Quick Ask in Settings → Commands, those snippets take over
    (chip = title, click stages the snippet text); built-ins return as soon
    as every flag is cleared, so the empty state never goes bare. */
const SUGGESTIONS_WITH_SELECTION = ["Summarize this", "Explain this", "Improve the writing"];
const SUGGESTIONS_NO_SELECTION = ["Brainstorm ideas", "Draft an outline about…"];

export function QuickAskPanel(props: {
	options: QuickAskOverlayOptions;
	guardVersion: number;
	/* v0.1.88 — the host itself: head drags + grip resizes live there
	   (session-only geometry, Pointer Events) */
	overlay: QuickAskOverlay;
}): JSX.Element {
	const { options } = props;
	const [display, setDisplay] = useState<QaMessage[]>([]);
	const [wire, setWire] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [streamText, setStreamText] = useState("");
	/* v0.1.87 audit (kontrak copy: error dekat aksi + actionable): turn gagal
	   menaruh baris kecil DI panel (bukan Notice lalu hilang tanpa jejak) dan
	   pertanyaan dikembalikan ke input */
	const [failure, setFailure] = useState<string | null>(null);
	/* v0.1.89 — state menu model LIVE: dibaca ulang setelah pick/refresh
	   sehingga pill model + caption footer selalu cermin settings aktif */
	const [menuState, setMenuState] = useState<QuickAskMenuState>(() => options.modelMenu.getState());
	const refreshMenuState = (): void => setMenuState(options.modelMenu.getState());
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const hasSelection = options.selectedText.trim().length > 0;
	/* v0.1.85 — custom chips (snippets flagged quickAsk) win when any;
	   otherwise the state-aware built-ins. Customs show in BOTH states:
	   snippets carry no selection-awareness metadata, and whatever gets
	   staged into the input stays editable anyway */
	const suggestions: { label: string; text: string }[] =
		options.suggestions.length > 0
			? options.suggestions
			: (hasSelection ? SUGGESTIONS_WITH_SELECTION : SUGGESTIONS_NO_SELECTION).map((t) => ({ label: t, text: t }));

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const send = async (): Promise<void> => {
		const text = input.trim();
		if (!text || busy) return;
		let workspacePolicy;
		try {
			workspacePolicy = options.snapshotWorkspacePolicy();
			if (options.activeNotePath) workspacePolicy.assertVisiblePath(options.activeNotePath, "Quick Ask note");
		} catch (error) {
			new Notice(`Open Agent: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}
		/* v0.1.90 — {activeNote} (owner ask; token ketiga keempat TETAP
		   literal di Quick Ask, hanya {activeNote} yang diresolve):
		   distrip dari teks wire (bubble tampil tetap teks mentah), konten
		   dibaca LIVE dari doc editor saat kirim — suntingan belum-simpan
		   ikut terlampir. Format blok = parity [Attached file:] main chat;
		   path tak dikenal → Notice bernama, bukan senyap (kontrak v0.1.78) */
		const tok = extractActiveNoteToken(text);
		let attachNote: { path: string; content: string } | null = null;
		if (tok.activeNote) {
			if (options.activeNotePath) {
				const full = options.editorView.state.doc.toString();
				const limit = workspacePolicy.fileReadMaxChars;
				attachNote = {
					path: options.activeNotePath,
					content: full.length > limit
						? `${full.slice(0, limit)}\n\n[Truncated at ${limit} characters. Use paged vault reads for more.]`
						: full,
				};
			} else {
				new Notice("Open Agent: couldn't resolve prompt token: {activeNote} — it stayed out of the message.");
			}
		}
		const question = tok.text;
		if (!question && !attachNote) return;
		/* selection rides the first user turn only (Copilot parity) */
		let wireUserText =
			wire.length === 0 && hasSelection
				? `${question}\n\n<selected_text>\n${options.selectedText}\n</selected_text>`
				: question;
		if (attachNote) {
			wireUserText += `\n\n[Attached file: ${attachNote.path}]\n\`\`\`\n${attachNote.content}\n\`\`\``;
		}
		const nextWire: ChatMessage[] = [...wire, { role: "user", content: wireUserText }];
		setDisplay((prev) => [...prev, { id: nextId++, role: "user", content: text }]);
		setWire(nextWire);
		setInput("");
		setBusy(true);
		setStreamText("");
		setFailure(null);
		const abort = new AbortController();
		abortRef.current = abort;
		try {
			const result = await options.runTurn(
				[{ role: "system", content: QUICK_COMMAND_SYSTEM_PROMPT }, ...nextWire],
				(tok) => setStreamText((prev) => prev + tok),
				abort.signal,
				/* v0.1.92 retry/failover: attempt yang sudah streaming-lalu-gagal
				   di-reset di sini — partial tak pernah menyambung ke teks attempt
				   berikutnya */
				() => setStreamText(""),
				workspacePolicy
			);
			if (abort.signal.aborted) return;
			const canonical = canonicalizeAssistantOutput(result);
			setWire([...nextWire, { role: "assistant", content: canonical }]);
			setDisplay((prev) => [...prev, { id: nextId++, role: "assistant", content: canonical }]);
		} catch (err) {
			if (!abort.signal.aborted) {
				const msg = err instanceof Error ? err.message : String(err);
				new Notice(`Open Agent: ${msg}`);
				/* roll the optimistic user bubble back (Copilot parity) DAN
				   kembalikan pertanyaan ke input + baris error inline (v0.1.87:
				   kontrak copy — what happened + an actionable way out, di panel) */
				setDisplay((prev) => prev.slice(0, -1));
				setWire(wire);
				setInput(text); // teks MENTAH yang diketik (token {activeNote} dan lainnya utuh)
				setFailure(`Send failed: ${msg} — your question is back in the input.`);
			}
		} finally {
			abortRef.current = null;
			setBusy(false);
			setStreamText("");
		}
	};

	const stop = (): void => abortRef.current?.abort();

	const insert = (content: string): void => {
		try {
			const view = options.editorView;
			const insertPos = view.state.selection.main.to;
			/* CM6 normalizes \r\n → \n — measure with the converted Text */
			const insertText = view.state.toText(canonicalizeAssistantOutput(content));
			view.dispatch({
				changes: { from: insertPos, to: insertPos, insert: insertText },
				selection: { anchor: insertPos, head: insertPos + insertText.length },
			});
			view.focus();
			new Notice("Open Agent: Inserted");
			options.onClose();
		} catch {
			new Notice("Open Agent: Failed to insert. Editor may have changed.");
		}
	};

	const replace = (content: string): void => {
		const result = options.replaceGuard.replace(canonicalizeAssistantOutput(content));
		if (!result.ok) {
			new Notice(`Open Agent: ${result.message ?? "Cannot replace."}`);
			return;
		}
		new Notice("Open Agent: Replaced");
		options.onClose();
	};

	/* guard re-validated on every render; guardVersion bumps on docChanged
	   (driven by the CM6 ViewPlugin via the overlay) */
	const replaceStatus = hasSelection && !busy ? options.replaceGuard.validate() : null;

	const autogrow = (el: HTMLTextAreaElement): void => {
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
	};

	return (
		<div
			className="oa-quickask-panel"
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					e.stopPropagation();
					options.onClose();
				}
			}}
		>
			{/* v0.1.88 — head row = drag handle. Tombol di dalamnya (×) BUKAN
			   handle: filter target membiarkan kliknya lewat apa adanya.
			   Drag melepaskan panel dari anchor caret (session-only) */}
			<div
				className="oa-quickask-head"
				onPointerDown={(e) => {
					if (e.button !== 0) return;
					if ((e.target as HTMLElement).closest("button")) return;
					props.overlay.beginDrag(e.nativeEvent);
				}}
			>
				{/* v0.1.100 — grip glyph DIHAPUS (owner pick grip-none, parity
				   Copilot/Obsidian modal): TIDAK ada affordance digambar; baris
				   head sendiri drag-nya (cursor grab → grabbing mengumumkan) */}
				<SparklesIcon size={13} className="oa-quickask-spark" />
				<span className="oa-quickask-title">Quick Ask</span>
				{hasSelection && (
					<span
						className="oa-quickask-selchip"
						title={options.selectedText}
					>{`“${options.selectedText.slice(0, 60)}${options.selectedText.length > 60 ? "…" : ""}”`}</span>
				)}
				<button type="button" className="oa-quickask-close oa-icon-btn" aria-label="Close quick ask" onClick={() => options.onClose()}>
					<XIcon size={13} />
				</button>
			</div>

			<div className="oa-quickask-body">
				<ChatContainer>
					{display.length === 0 && !busy && (
						<div className="oa-quickask-empty">
							<div className="oa-quickask-empty-hint">
								{hasSelection
									? "Ask anything about the selected text — or ask it to rewrite it."
									: "Ask anything. No text is selected, so Replace is unavailable."}
							</div>
							<div className="oa-quickask-sugs">
								{suggestions.map((sug) => (
									<button
										key={sug.label}
										type="button"
										className="oa-quickask-sug"
										title={sug.text !== sug.label ? sug.text : undefined}
										onClick={() => {
															setInput(sug.text);
															inputRef.current?.focus();
														}}
									>
										{sug.label}
									</button>
								))}
							</div>
						</div>
					)}
					{display.map((m) =>
						m.role === "user" ? (
							<Message key={m.id} role="user">
								<div className="oa-quickask-msg-text">{m.content}</div>
							</Message>
						) : (
							<Message key={m.id} role="assistant">
								<Markdown app={options.app} component={options.component}>
									{m.content}
								</Markdown>
								<MessageActions>
									<CopyAction getText={() => canonicalizeAssistantOutput(m.content)} tooltip="Copy answer" />
									<MessageAction tooltip="Insert at cursor" onClick={() => insert(m.content)}>
										<TextCursorInputIcon size={13} />
									</MessageAction>
									{hasSelection && (
										/* needs disabled + tooltip-on-disabled, which
										   MessageAction doesn't model — raw button in the
										   same visual uniform */
										<button
											type="button"
											className="oa-msg-action oa-quickask-replace"
											aria-label="Replace selection"
											title={replaceStatus && !replaceStatus.ok ? replaceStatus.message : "Replace selection"}
											disabled={busy || !replaceStatus?.ok}
											onClick={() => replace(m.content)}
										>
											<Icon name="replace" size={13} />
										</button>
									)}
								</MessageActions>
							</Message>
						)
					)}
					{streamText && (
						<Message role="assistant">
							<div className="oa-quickask-msg-text is-streaming">{streamText}</div>
						</Message>
					)}
					{busy && !streamText && <Loader variant="typing" size="sm" text="Thinking" />}
				</ChatContainer>
			</div>

			{failure !== null && (
				<div className="oa-quickask-error" role="alert">{failure}</div>
			)}
			<div className="oa-quickask-composer">
				<textarea
					ref={inputRef}
					className="oa-quickask-input"
					rows={1}
					aria-label={hasSelection ? "Ask about the selection" : "Ask anything"}
					placeholder={hasSelection ? "Ask about the selection…" : "Ask anything…"}
					value={input}
					disabled={busy}
					onChange={(e) => {
						setInput(e.target.value);
						autogrow(e.target);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void send();
						}
					}}
				/>
				{/* actions row — same geometry as the main composer (actions sit in
				    their own row under the text, send anchored to the right end);
				    icons/variants mirror ChatApp: arrow-up primary send, square
				    danger stop */}
				<div className="oa-quickask-composer-actions">
					{/* v0.1.89 — ModelPicker main-chat di cluster kanan sebelah Send
					   (parity). MoA tidak dioper: runTurn Quick Ask = chatCompletion
					   tunggal tools OFF; pick menulis settings aktif (parity
					   selectModel) dan state dibaca ulang dari getter */}
					<ModelPicker
						model={menuState.model}
						providerSlug={menuState.providerSlug}
						providers={menuState.providers}
						disabled={busy}
						onSelect={(providerId, m) => {
							void Promise.resolve(options.modelMenu.onSelect(providerId, m)).then(refreshMenuState);
						}}
						onRefresh={() =>
							Promise.resolve(options.modelMenu.onRefresh()).then(refreshMenuState)
						}
						onOpenSettings={options.modelMenu.onOpenSettings}
						visibleModelsStored={menuState.visibleModels}
						onSetVisibleModels={(next) => {
							options.modelMenu.onSetVisibleModels(next);
							refreshMenuState();
						}}
						collapsedSlugs={menuState.collapsedSlugs}
						onToggleCollapsed={(slug) => {
							options.modelMenu.onToggleCollapsed(slug);
							refreshMenuState();
						}}
					/>
					{busy ? (
						<PromptInputAction tooltip="Stop" variant="danger" onClick={stop}>
							<StopIcon size={14} />
						</PromptInputAction>
					) : (
						<PromptInputAction tooltip="Send" variant="primary" disabled={!input.trim()} onClick={() => void send()}>
							<ArrowUpIcon size={16} />
						</PromptInputAction>
					)}
				</div>
			</div>

			{/* v0.1.89 — footer caption statusbar-mini (owner: keterangan model
			   pindah dari header ke bawah composer, seperti main chat ui) */}
			<div className="oa-quickask-foot" aria-live="polite">
				{`${menuState.providerName} · ${menuState.model || "no model"}`}
			</div>

			{/* v0.1.100 — resize KEMBALI sebagai SEAM tak terlihat (owner:
			   mau tetap ada tapi bukan tombol; referensi macOS/VS Code yang
			   diperbaiki — zona hit 16px DI DALAM frame, pelajaran Tahoe).
			   Button semantik: keyboard (fokus + panah, Shift ×4) & screen
			   reader masuk lewat sini; Pointer Events → mouse AND touch */}
			<button
				type="button"
				className="oa-quickask-seam"
				aria-label="Resize panel"
				title="Resize — drag, or focus and use arrow keys"
				onPointerDown={(e) => {
					if (e.button !== 0) return;
					e.preventDefault();
					props.overlay.beginResize(e.nativeEvent);
				}}
				onKeyDown={(e) => {
					const step = e.shiftKey ? 48 : 12;
					const d =
						e.key === "ArrowRight" ? [step, 0] :
						e.key === "ArrowLeft" ? [-step, 0] :
						e.key === "ArrowDown" ? [0, step] :
						e.key === "ArrowUp" ? [0, -step] : null;
					if (!d) return;
					e.preventDefault();
					props.overlay.resizeByKeys(d[0], d[1]);
				}}
			/>
		</div>
	);
}
