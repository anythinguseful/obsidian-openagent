/**
 * prompt-kit · Tool — faithful port of the AI SDK v5 tool card
 * (verified against prompt-kit main, 2026-07-21): ONE collapsible card per
 * tool invocation — state icon + tool name + status badge in the header,
 * Input / Output / Error panes in the body, Call ID footer.
 *
 *   <Tool toolPart={{
 *     type: "read_note",
 *     state: "output-available",
 *     input: { path: "daily/today.md" },
 *     output: "…text…",
 *     toolCallId: "call_7_0_a1b2c3",
 *   }} />
 *
 * Official states (AI SDK v5): input-streaming (badge "Processing"),
 * input-available ("Ready"), output-available ("Completed"),
 * output-error ("Error") — fallback "Pending".
 *
 * Open Agent extensions:
 *  - state "denied" (badge "Denied") for the approval flow — not an error;
 *  - the card auto-opens on output-error so failures don't hide.
 */

import { useState, type ReactNode } from "react";
import { ChevronDownIcon, SettingsIcon } from "../icons";
import { splitSteerMarkers } from "../../agent/steer";

export type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error" | "denied";

export interface ToolPart {
	type: string;
	state: ToolState;
	/** parsed args object, or the raw JSON string while it is still (partially) streamed */
	input?: Record<string, unknown> | string;
	output?: Record<string, unknown> | string;
	toolCallId?: string;
	errorText?: string;
}

function formatValue(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "string") return value;
	if (typeof value === "object") return JSON.stringify(value, null, 2);
	return String(value);
}

/** 2026-08-07 (v0.1.104): official prompt-kit state glyphs restored.
 *  svg bodies inlined verbatim from lucide upstream (curl-verified):
 *    loader-circle:  https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/loader-circle.svg
 *    circle-check:   https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/circle-check.svg
 *    circle-x:       https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/circle-x.svg
 *  Inlined rather than setIcon-by-name because these glyphs were RENAMED
 *  across lucide releases (check-circle/x-circle era on older installs) —
 *  inline keeps every host version identical. The wrap keeps zero naming
 *  dependency: no <Icon>, no shim list, no bundled lucide version.
 *  The retired custom border-ring loader quantized to a used 1px border
 *  (probe) — a jagged "cacat" ring at real zoom; a vector arc aliases
 *  correctly at any zoom. */
function ToolGlyph({ spin, children }: { spin?: boolean; children: ReactNode }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={16}
			height={16}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={`oa-tool-glyph${spin ? " is-spin" : ""}`}
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

function StateIcon({ state }: { state: ToolState }) {
	switch (state) {
		case "input-streaming":
			return (
				<span className="oa-tool-state-icon is-streaming">
					<ToolGlyph spin>
						<path d="M21 12a9 9 0 1 1-6.219-8.56" />
					</ToolGlyph>
				</span>
			);
		case "input-available":
			return (
				<span className="oa-tool-state-icon is-available">
					<SettingsIcon size={16} />
				</span>
			);
		case "output-available":
			return (
				<span className="oa-tool-state-icon is-done">
					<ToolGlyph>
						<circle cx="12" cy="12" r="10" />
						<path d="m9 12 2 2 4-4" />
					</ToolGlyph>
				</span>
			);
		case "output-error":
		case "denied":
			return (
				<span className="oa-tool-state-icon is-error">
					<ToolGlyph>
						<circle cx="12" cy="12" r="10" />
						<path d="m15 9-6 6" />
						<path d="m9 9 6 6" />
					</ToolGlyph>
				</span>
			);
		default:
			return (
				<span className="oa-tool-state-icon">
					<SettingsIcon size={16} />
				</span>
			);
	}
}

function StateBadge({ state }: { state: ToolState }) {
	switch (state) {
		case "input-streaming":
			return <span className="oa-tool-badge oa-tool-badge-processing">Processing</span>;
		case "input-available":
			return <span className="oa-tool-badge oa-tool-badge-ready">Ready</span>;
		case "output-available":
			return <span className="oa-tool-badge oa-tool-badge-done">Completed</span>;
		case "output-error":
			return <span className="oa-tool-badge oa-tool-badge-error">Error</span>;
		case "denied":
			return <span className="oa-tool-badge oa-tool-badge-denied">Denied</span>;
		default:
			return <span className="oa-tool-badge oa-tool-badge-pending">Pending</span>;
	}
}

/** chat-side display cap for tool results (Copilot: MAX_DISPLAY_CHARS = 5000).
 * v0.1.151: overridable via Settings → Advanced → Tool output limit. */
const MAX_DISPLAY_CHARS = 5000;

export function Tool({
	toolPart,
	defaultOpen = false,
	className,
	maxDisplayChars = MAX_DISPLAY_CHARS,
}: {
	toolPart: ToolPart;
	defaultOpen?: boolean;
	className?: string;
	maxDisplayChars?: number;
}) {
	const { state, input, output, toolCallId, errorText } = toolPart;
	const [open, setOpen] = useState(defaultOpen || state === "output-error");
	const hasInput =
		input !== undefined && input !== "" && !(typeof input === "object" && input !== null && Object.keys(input).length === 0);
	const hasOutput = output !== undefined && output !== "";
	/* Copilot-parity display guardrail: huge tool results render sliced with a
	   note, keeping the chat responsive. The full result is preserved in
	   state/history (the model-side clip is a separate 20k boundary). */
	const rawOutput = hasOutput ? formatValue(output) : "";
	/* /steer parity: a drained steer lives INSIDE the tool result on the wire
	   (the model needs it there) — the card splits it back out and renders it
	   as an attributed user note, so the transcript shows provenance without
	   leaking the marker's raw text (splitSteerMarkers leaves unbalanced
	   lookalikes untouched) */
	const split = splitSteerMarkers(rawOutput);
	const cap = Number.isFinite(maxDisplayChars) && maxDisplayChars > 0 ? Math.floor(maxDisplayChars) : MAX_DISPLAY_CHARS;
	const outputTruncated = split.tool.length > cap;
	return (
		<div className={`oa-tool${state === "output-error" ? " oa-tool-error" : ""}${className ? ` ${className}` : ""}`}>
			<button className="oa-tool-header" onClick={() => setOpen(!open)} aria-expanded={open}>
				<StateIcon state={state} />
				<span className="oa-tool-name">{toolPart.type}</span>
				<StateBadge state={state} />
				<span className={`oa-tool-chevron${open ? " is-open" : ""}`} aria-hidden="true">
					<ChevronDownIcon size={13} />
				</span>
			</button>
			{open ? (
				<div className="oa-tool-content">
					{hasInput ? (
						<div className="oa-tool-pane">
							<div className="oa-tool-pane-label">Input</div>
							<pre className="oa-steps-pre">
								{typeof input === "object" && input !== null
									? Object.entries(input)
											.map(([key, value]) => `${key}: ${formatValue(value)}`)
											.join("\n")
									: String(input)}
							</pre>
						</div>
					) : null}
					{hasOutput ? (
						<div className="oa-tool-pane">
							<div className="oa-tool-pane-label">Output</div>
							<pre className="oa-steps-pre">
								{outputTruncated ? split.tool.slice(0, cap) : split.tool}
							</pre>
							{outputTruncated ? (
								<div className="oa-tool-cap-note">
									{`… truncated ${(split.tool.length - cap).toLocaleString()} characters for display — full output preserved in history.`}
								</div>
							) : null}
							{split.steers.map((steer, i) => (
								<div key={`${toolCallId}-steer-${i}`} className="oa-steer-note">
									<div className="oa-steer-label">Mid-run steer from the user</div>
									<div className="oa-steer-text">{steer}</div>
								</div>
							))}
						</div>
					) : null}
					{state === "output-error" && errorText ? (
						<div className="oa-tool-pane">
							<div className="oa-tool-pane-label">Error</div>
							<div className="oa-tool-error-text">{errorText}</div>
						</div>
					) : null}
					{state === "denied" && errorText ? (
						<div className="oa-tool-pane">
							<div className="oa-tool-pane-label">Denied</div>
							<div className="oa-tool-note">{errorText}</div>
						</div>
					) : null}
					{state === "input-streaming" ? <div className="oa-tool-hint">Processing tool call…</div> : null}
					{toolCallId ? <div className="oa-tool-callid">Call ID: {toolCallId}</div> : null}
				</div>
			) : null}
		</div>
	);
}
