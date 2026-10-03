/**
 * Append-only session events (DeepSeek Harness seam).
 *
 * Inspect/recovery log. Resume keeps lossless `messages[]` when that wire is
 * at least as long as `eventsToWire`; events fill gaps only. Unknown types
 * drop on load. Never store image bytes here.
 */

import type { ChatMessage, ToolCall } from "../types";

/** Safety cap on a single event payload — trajectory preview is separate. */
export const SESSION_EVENT_TEXT_MAX = 512_000;

export type SessionEventType =
	| "turn/start"
	| "turn/end"
	| "step/start"
	| "step/end"
	| "user/message"
	| "assistant/message"
	| "tool/call"
	| "tool/result"
	| "inject";

const EVENT_TYPES = new Set<SessionEventType>([
	"turn/start",
	"turn/end",
	"step/start",
	"step/end",
	"user/message",
	"assistant/message",
	"tool/call",
	"tool/result",
	"inject",
]);

export type SessionEventSource = "user" | "assistant" | "tool" | "system";

export interface SessionEvent {
	type: SessionEventType;
	at: number;
	/** 1-based agent iteration (= DeepSeek step) when known. */
	step?: number;
	source?: SessionEventSource;
	name?: string;
	status?: string;
	callId?: string;
	/** Clipped payload — never a second unbounded transcript. */
	text?: string;
	/** Count of image_url parts — never pixel bytes. */
	images?: number;
}

export function clipSessionEventText(value: unknown, max = SESSION_EVENT_TEXT_MAX): string | undefined {
	if (typeof value !== "string" || value.length === 0) return undefined;
	return value.length > max ? value.slice(0, max) + "\n…(truncated)" : value;
}

export function sessionEvent(partial: Omit<SessionEvent, "at"> & { at?: number }): SessionEvent {
	const ev: SessionEvent = { type: partial.type, at: partial.at ?? Date.now() };
	if (partial.step != null) ev.step = partial.step;
	if (partial.source) ev.source = partial.source;
	if (partial.name) ev.name = partial.name;
	if (partial.status) ev.status = partial.status;
	if (partial.callId) ev.callId = partial.callId;
	if (typeof partial.images === "number" && Number.isFinite(partial.images) && partial.images > 0) {
		ev.images = Math.floor(partial.images);
	}
	const text = clipSessionEventText(partial.text);
	if (text) ev.text = text;
	return ev;
}

export function sanitizeSessionEvents(value: unknown): SessionEvent[] {
	if (!Array.isArray(value)) return [];
	const out: SessionEvent[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const o = item as Record<string, unknown>;
		if (typeof o.type !== "string" || !EVENT_TYPES.has(o.type as SessionEventType)) continue;
		if (typeof o.at !== "number" || !Number.isFinite(o.at)) continue;
		const ev: SessionEvent = { type: o.type as SessionEventType, at: o.at };
		if (typeof o.step === "number" && Number.isFinite(o.step)) ev.step = o.step;
		if (o.source === "user" || o.source === "assistant" || o.source === "tool" || o.source === "system") {
			ev.source = o.source;
		}
		if (typeof o.name === "string") ev.name = o.name;
		if (typeof o.status === "string") ev.status = o.status;
		if (typeof o.callId === "string") ev.callId = o.callId;
		if (typeof o.images === "number" && Number.isFinite(o.images) && o.images > 0) ev.images = Math.floor(o.images);
		const text = clipSessionEventText(o.text);
		if (text) ev.text = text;
		out.push(ev);
	}
	return out;
}

export interface TrajectoryRow {
	key: string;
	kind: "heading" | "item";
	label: string;
	detail?: string;
	/** Unclipped event text for inspect-on-click. */
	body?: string;
	images?: number;
	type: SessionEventType;
}

function previewLine(text: string | undefined, max = 140): string | undefined {
	if (!text) return undefined;
	const one = text.replace(/\s+/g, " ").trim();
	if (!one) return undefined;
	return one.length > max ? one.slice(0, max) + "…" : one;
}

function itemLabel(base: string, images?: number): string {
	if (!images) return base;
	return `${base} · ${images === 1 ? "1 image" : `${images} images`}`;
}

/** Chat-facing projection of the append-only log (Phase 1b panel). */
export function trajectoryRows(events: SessionEvent[]): TrajectoryRow[] {
	const rows: TrajectoryRow[] = [];
	let turn = 0;
	events.forEach((ev, i) => {
		const key = `${ev.at}-${i}-${ev.type}`;
		if (ev.type === "turn/start") {
			turn += 1;
			rows.push({ key, kind: "heading", label: `Turn ${turn}`, type: ev.type });
			return;
		}
		if (ev.type === "turn/end" || ev.type === "step/end") return;
		if (ev.type === "step/start") {
			rows.push({
				key,
				kind: "heading",
				label: ev.step != null ? `Step ${ev.step}` : "Step",
				type: ev.type,
			});
			return;
		}
		if (ev.type === "user/message") {
			rows.push({
				key,
				kind: "item",
				label: itemLabel("You", ev.images),
				detail: previewLine(ev.text),
				body: ev.text,
				images: ev.images,
				type: ev.type,
			});
			return;
		}
		if (ev.type === "assistant/message") {
			rows.push({
				key,
				kind: "item",
				label: itemLabel("Assistant", ev.images),
				detail: previewLine(ev.text),
				body: ev.text,
				images: ev.images,
				type: ev.type,
			});
			return;
		}
		if (ev.type === "tool/call") {
			rows.push({
				key,
				kind: "item",
				label: itemLabel(ev.name ?? "tool", ev.images),
				detail: previewLine(ev.text),
				body: ev.text,
				images: ev.images,
				type: ev.type,
			});
			return;
		}
		if (ev.type === "tool/result") {
			rows.push({
				key,
				kind: "item",
				label: itemLabel(`${ev.name ?? "tool"} · ${ev.status ?? "done"}`, ev.images),
				detail: previewLine(ev.text),
				body: ev.text,
				images: ev.images,
				type: ev.type,
			});
			return;
		}
		if (ev.type === "inject") {
			rows.push({
				key,
				kind: "item",
				label: "Inject",
				detail: previewLine(ev.text),
				body: ev.text,
				type: ev.type,
			});
		}
	});
	return rows;
}

/**
 * Conversation-only wire (no system prompt). Lossy where the log clipped
 * payloads. Does not replace persisted `messages[]`.
 */
export function eventsToWire(events: SessionEvent[]): ChatMessage[] {
	const out: ChatMessage[] = [];
	let pending: ChatMessage | null = null;

	const flush = () => {
		if (pending) {
			out.push(pending);
			pending = null;
		}
	};

	for (const ev of events) {
		if (ev.type === "user/message") {
			flush();
			out.push({ role: "user", content: ev.text ?? "" });
			continue;
		}
		if (ev.type === "assistant/message") {
			flush();
			pending = { role: "assistant", content: ev.text ?? null };
			continue;
		}
		if (ev.type === "tool/call") {
			if (!pending) pending = { role: "assistant", content: null };
			const call: ToolCall = {
				id: ev.callId ?? "",
				type: "function",
				function: { name: ev.name ?? "", arguments: ev.text ?? "" },
			};
			pending.tool_calls = [...(pending.tool_calls ?? []), call];
			continue;
		}
		if (ev.type === "tool/result") {
			flush();
			out.push({
				role: "tool",
				content: ev.text ?? "",
				tool_call_id: ev.callId,
				name: ev.name,
			});
			continue;
		}
		if (ev.type === "inject") {
			const id = ev.callId;
			const marker = ev.text ?? "";
			if (!marker) continue;
			for (let i = out.length - 1; i >= 0; i--) {
				const m = out[i];
				if (m.role !== "tool" || typeof m.content !== "string") continue;
				if (id && m.tool_call_id && m.tool_call_id !== id) continue;
				m.content += marker;
				break;
			}
		}
	}
	flush();
	return out;
}

function cloneMessage(m: ChatMessage): ChatMessage {
	return {
		...m,
		tool_calls: m.tool_calls?.map((c) => ({
			...c,
			function: { ...c.function },
		})),
		content: Array.isArray(m.content) ? m.content.map((p) => ({ ...p })) : m.content,
	};
}

/**
 * Continue a session: conversation from the event log when it is complete
 * enough; otherwise stored messages. System prompts are never in the log.
 */
export function resumeMessages(session: { messages?: ChatMessage[]; events?: SessionEvent[] }): ChatMessage[] {
	const stored = (session.messages ?? []).map(cloneMessage);
	if (stored.some((m) => Array.isArray(m.content))) return stored;
	const fromEvents = eventsToWire(session.events ?? []);
	if (fromEvents.length === 0) return stored;
	const storedConv = stored.filter((m) => m.role !== "system");
	const systems = stored.filter((m) => m.role === "system");
	if (storedConv.length === 0) return [...systems, ...fromEvents];
	if (fromEvents.length > storedConv.length) return [...systems, ...fromEvents];
	return stored;
}

function conversationEventWeight(type: SessionEventType): number {
	if (type === "user/message" || type === "assistant/message" || type === "tool/result") return 1;
	return 0;
}

/**
 * Drop log tail so `eventsToWire` is not longer than the remaining
 * conversation (non-system) messages after undo/retry/edit.
 */
export function truncateSessionEvents(events: SessionEvent[], conversationCount: number): SessionEvent[] {
	if (conversationCount <= 0) return [];
	const kept: SessionEvent[] = [];
	let count = 0;
	for (const ev of events) {
		const w = conversationEventWeight(ev.type);
		if (count + w > conversationCount) break;
		kept.push(ev);
		count += w;
	}
	let lastConv = -1;
	for (let i = 0; i < kept.length; i++) {
		if (conversationEventWeight(kept[i].type) > 0) lastConv = i;
	}
	if (lastConv < 0) return [];
	const out = kept.slice(0, lastConv + 1);
	for (let i = lastConv + 1; i < kept.length; i++) {
		const t = kept[i].type;
		if (t === "step/end" || t === "turn/end") out.push(kept[i]);
		else break;
	}
	return out;
}

export type TrajectoryFilter = "all" | "user" | "assistant" | "tool" | "inject";

export function filterTrajectoryRows(rows: TrajectoryRow[], filter: TrajectoryFilter): TrajectoryRow[] {
	if (filter === "all") return rows;
	const kept = rows.filter((r) => {
		if (r.kind === "heading") return true;
		if (filter === "inject") return r.type === "inject";
		if (filter === "user") return r.type === "user/message";
		if (filter === "assistant") return r.type === "assistant/message";
		return r.type === "tool/call" || r.type === "tool/result";
	});
	const out: TrajectoryRow[] = [];
	for (let i = 0; i < kept.length; i++) {
		const row = kept[i];
		if (row.kind !== "heading") {
			out.push(row);
			continue;
		}
		let any = false;
		for (let j = i + 1; j < kept.length; j++) {
			if (kept[j].kind === "heading") break;
			any = true;
			break;
		}
		if (any) out.push(row);
	}
	return out;
}

export function countContentImages(content: unknown): number {
	if (!Array.isArray(content)) return 0;
	let n = 0;
	for (const part of content) {
		if (part && typeof part === "object" && (part as { type?: string }).type === "image_url") n++;
	}
	return n;
}

export function messageContentPreview(content: unknown): string | undefined {
	if (typeof content === "string") return clipSessionEventText(content);
	if (Array.isArray(content)) {
		const bits = content
			.map((part) => {
				if (!part || typeof part !== "object") return "";
				const p = part as { type?: string; text?: string };
				return typeof p.text === "string" ? p.text : p.type === "image_url" ? "[image]" : "";
			})
			.filter(Boolean);
		return clipSessionEventText(bits.join("\n"));
	}
	return undefined;
}
