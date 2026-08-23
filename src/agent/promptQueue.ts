/**
 * Queued prompts ("queue prompt") — Hermes Desktop composer-queue parity.
 * Semantics pulled from the desktop source (raw.githubusercontent.com,
 * NousResearch/hermes-agent @main, 2026-07-26):
 *   apps/desktop/src/store/composer-queue.ts
 *   apps/desktop/src/app/chat/composer/hooks/use-composer-queue.ts
 *   apps/desktop/src/app/chat/composer/queue-panel.tsx
 *
 * Kept 1:1:
 *  - per-session FIFO of {id, text, displayText?, attachments, queuedAt}
 *  - editing drops displayText: the projection no longer describes the text
 *  - park/unpark is IN-MEMORY only — an explicit Stop halts auto-drain until
 *    a resume gesture (queue a fresh prompt / manual send / Resume / empty)
 *  - shouldAutoDrain is edge-INDEPENDENT: idle + entries + not parked sends,
 *    so remounts/reloads can't strand the head
 *
 * Project-fit divergences (disclosed to owner 2026-07-26):
 *  - no migrateQueuedPrompts — our session ids are stable
 *  - no background drain of offscreen sessions — one chat view; returning to
 *    a session fires the same edge-independent drain
 *  - auto-drain dispatches once instead of a 4-attempt backoff — our submit
 *    is fire-and-forget; failures surface as normal error turns
 *
 * Owner decision D2 (attachments): text/PDF payload persists; image base64
 * (dataUrl) is stripped from the PERSISTED copy only — a full entry rides in
 * memory while the plugin lives, a restored image degrades to its
 * placeholder text after restart.
 */

export interface QueuedAttachment {
	id: string;
	name: string;
	/** text payload or a placeholder note (image) */
	content: string;
	size: number;
	kind?: "text" | "image";
	dataUrl?: string;
	path?: string;
}

export interface QueuedPrompt {
	id: string;
	text: string;
	/** what the queue panel shows when it differs from the sent text
	 *  (no producer today — kept for parity with the desktop entry shape) */
	displayText?: string;
	attachments: QueuedAttachment[];
	queuedAt: number;
}

export type PromptQueueState = Record<string, QueuedPrompt[]>;
/** Session partition provenance. Missing entries are legacy queues: retain
 *  them until the owning session is opened/changed instead of guessing. */
export type PromptQueueScopeState = Record<string, string>;

/** sanity cap — the desktop caps auto-drain RETRIES, not length; a runaway
 *  composer shouldn't be able to grow data.json without bound (sanitizer) */
export const MAX_QUEUE_PER_SESSION = 50;

/* park is in-memory by design (desktop: a fresh process starts unparked) */
const parkedSids = new Set<string>();

export const isQueueParked = (sid: string): boolean => parkedSids.has(sid);
export const parkQueue = (sid: string): void => void parkedSids.add(sid);
export const unparkQueue = (sid: string): void => void parkedSids.delete(sid);

export interface AutoDrainInput {
	isBusy: boolean;
	parked: boolean;
	queueLength: number;
	/** Optimistic queue state is not dispatchable until its data.json write
	 *  commits. This is global because two Chat views share one settings file. */
	persistencePending?: number;
}

/** edge-independent: fires whenever the session can take the next turn */
export const shouldAutoDrain = ({ isBusy, parked, queueLength, persistencePending = 0 }: AutoDrainInput): boolean =>
	!isBusy && !parked && queueLength > 0 && persistencePending === 0;

/** One settings object/data.json backs every session and every Chat view.
 *  Serialize queue mutation + save + rollback globally; a per-component lock
 *  permits two views to restore over one another after overlapping failures. */
export class SerializedQueueTransactions {
	private tail: Promise<void> = Promise.resolve();
	private pendingCount = 0;

	get pending(): number {
		return this.pendingCount;
	}

	async run<T>(work: () => Promise<T>): Promise<T> {
		this.pendingCount++;
		const previous = this.tail;
		let releaseGate!: () => void;
		const gate = new Promise<void>((resolve) => { releaseGate = resolve; });
		const tail = previous.catch(() => {}).then(() => gate);
		this.tail = tail;
		await previous.catch(() => {});
		try {
			return await work();
		} finally {
			this.pendingCount = Math.max(0, this.pendingCount - 1);
			releaseGate();
			if (this.tail === tail) this.tail = Promise.resolve();
		}
	}
}

export const queueTransactions = new SerializedQueueTransactions();

export interface QueueMutationOwnership {
	mounted: boolean;
	sameSettings: boolean;
	currentPartition: string;
	targetPartition: string;
	sid: string;
	sourceSessionId: string;
	activeSessionId: string;
	requireActive: boolean;
	ownerPartition?: string;
}

/** Shared stale-target/provenance gate for queued event handlers that may
 *  spend time waiting behind another data.json transaction. */
export function queueMutationTargetIsCurrent(input: QueueMutationOwnership): boolean {
	return input.mounted &&
		input.sameSettings &&
		input.currentPartition === input.targetPartition &&
		(!input.requireActive || (input.sid === input.sourceSessionId && input.activeSessionId === input.sourceSessionId)) &&
		(input.ownerPartition == null || input.ownerPartition === input.targetPartition);
}

/** Side effects such as interrupting the active model must happen only after
 *  the queue ordering that justifies them is durably committed. */
export async function afterSuccessfulQueueCommit(
	commit: () => Promise<boolean>,
	afterCommit: () => void
): Promise<boolean> {
	if (!await commit()) return false;
	afterCommit();
	return true;
}

export const newQueueId = (): string =>
	`queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const cloneAttachments = (list: QueuedAttachment[]): QueuedAttachment[] => list.map((a) => ({ ...a }));

/** append; queueing a fresh prompt always lifts a park (fresh intent, desktop) */
export function enqueueEntry(
	sid: string,
	list: QueuedPrompt[],
	payload: { text: string; attachments: QueuedAttachment[]; displayText?: string }
): { entry: QueuedPrompt; list: QueuedPrompt[] } {
	const entry: QueuedPrompt = {
		id: newQueueId(),
		text: payload.text,
		...(payload.displayText ? { displayText: payload.displayText } : {}),
		attachments: cloneAttachments(payload.attachments),
		queuedAt: Date.now(),
	};
	unparkQueue(sid);
	return { entry, list: [...list, entry] };
}

export function removeEntry(list: QueuedPrompt[], id: string): QueuedPrompt[] {
	return list.filter((e) => e.id !== id);
}

/** move an entry to the head (send-next-while-busy interrupt; desktop parity) */
export function promoteEntry(list: QueuedPrompt[], id: string): QueuedPrompt[] {
	const idx = list.findIndex((e) => e.id === id);
	if (idx <= 0) return list;
	return [list[idx], ...list.slice(0, idx), ...list.slice(idx + 1)];
}

/** rewrite text/attachments; a rewritten entry sheds its displayText projection */
export function updateEntry(
	list: QueuedPrompt[],
	id: string,
	update: { text: string; attachments?: QueuedAttachment[] }
): { list: QueuedPrompt[]; changed: boolean } {
	let changed = false;
	const next = list.map((entry) => {
		if (entry.id !== id) return entry;
		const attachments = update.attachments ? cloneAttachments(update.attachments) : entry.attachments;
		if (entry.text === update.text && !update.attachments) return entry;
		changed = true;
		const { displayText: _dropped, ...rest } = entry;
		return { ...rest, text: update.text, attachments };
	});
	return { list: changed ? next : list, changed };
}

/** disk copy: image base64 stays in memory only (owner decision D2) */
export function serializeForPersist(entry: QueuedPrompt): QueuedPrompt {
	return {
		...entry,
		attachments: entry.attachments.map((a) => {
			if (!a.dataUrl) return { ...a };
			const { dataUrl: _stripped, ...rest } = a;
			return rest;
		}),
	};
}

export interface QueuePersistenceState {
	promptQueue: PromptQueueState;
	promptQueueScopes: PromptQueueScopeState;
}

export interface PreparedQueueMutation {
	/** Full in-memory entries, including transient image dataUrl payloads. */
	entries: QueuedPrompt[];
	previousLiveEntries: QueuedPrompt[];
	rollback: () => void;
}

/** Apply one mutation to the persisted settings object while retaining an
 *  unsanitized rollback payload for the active UI. Must run inside
 *  `queueTransactions.run()` so rollback ownership cannot overlap. */
export function prepareQueueMutation(
	state: QueuePersistenceState,
	sid: string,
	partition: string,
	currentLiveEntries: QueuedPrompt[],
	update: QueuedPrompt[] | ((current: QueuedPrompt[]) => QueuedPrompt[] | null)
): PreparedQueueMutation | null {
	const previousEntries = state.promptQueue[sid];
	const previousOwner = state.promptQueueScopes[sid];
	const entries = typeof update === "function" ? update(currentLiveEntries) : update;
	if (entries == null) return null;

	if (entries.length === 0) {
		delete state.promptQueue[sid];
		delete state.promptQueueScopes[sid];
	} else {
		state.promptQueue[sid] = entries.map(serializeForPersist);
		state.promptQueueScopes[sid] = partition;
	}
	return {
		entries,
		previousLiveEntries: currentLiveEntries,
		rollback: () => {
			if (previousEntries === undefined) delete state.promptQueue[sid];
			else state.promptQueue[sid] = previousEntries;
			if (previousOwner === undefined) delete state.promptQueueScopes[sid];
			else state.promptQueueScopes[sid] = previousOwner;
		},
	};
}

/** shape/sanity gate for loaded data.json (normalizeLoadedSettings) */
export function sanitizePromptQueue(raw: unknown): PromptQueueState {
	const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	const out: PromptQueueState = {};
	for (const [sid, list] of Object.entries(src)) {
		if (!Array.isArray(list)) continue;
		const entries: QueuedPrompt[] = [];
		for (const item of list.slice(0, MAX_QUEUE_PER_SESSION)) {
			if (!item || typeof item !== "object") continue;
			const e = item as Partial<QueuedPrompt>;
			const text = typeof e.text === "string" ? e.text : "";
			const attachments = (Array.isArray(e.attachments) ? e.attachments : [])
				.filter((a): a is QueuedAttachment => !!a && typeof a === "object" && typeof (a as QueuedAttachment).name === "string")
				.map((a) => ({ ...a }));
			if (!text.trim() && attachments.length === 0) continue;
			entries.push({
				id: typeof e.id === "string" && e.id ? e.id : newQueueId(),
				text,
				...(typeof e.displayText === "string" && e.displayText ? { displayText: e.displayText } : {}),
				attachments,
				queuedAt: typeof e.queuedAt === "number" && e.queuedAt > 0 ? e.queuedAt : Date.now(),
			});
		}
		if (entries.length > 0) out[sid] = entries;
	}
	return out;
}

/** Shape gate for the queue→session-partition provenance sidecar. */
export function sanitizePromptQueueScopes(raw: unknown): PromptQueueScopeState {
	const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	const out: PromptQueueScopeState = {};
	for (const [sid, scope] of Object.entries(src)) {
		if (sid && typeof scope === "string") out[sid] = scope;
	}
	return out;
}

/** drop queues whose session no longer exists (same hygiene as the hub tap cache prune) */
export function prunePromptQueue(state: PromptQueueState, has: (sid: string) => boolean): boolean {
	let removed = false;
	for (const sid of Object.keys(state)) {
		if (!has(sid)) {
			delete state[sid];
			removed = true;
		}
	}
	return removed;
}
