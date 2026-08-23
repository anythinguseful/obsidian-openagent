/**
 * Todo tool — planning & task management, 1:1 semantic port of Hermes
 * tools/todo_tool.py (studied byte-level 2026-08-09, gap-doc 🟡 #2).
 *
 * Hermes design (verbatim from their module docstring):
 *   - Single `todo` tool: provide `todos` param to write, omit to read
 *   - Every call returns the full current list
 *   - No system prompt mutation; behavioral guidance lives entirely in
 *     the tool schema description
 *   - State lives per agent instance; after context-compression events the
 *     ACTIVE items are re-injected into the wire so the plan survives
 *
 * Deliberate deviation, documented: Hermes keeps the store in-memory per
 * agent process and rebuilds it from gateway history replay (their
 * MAX_TODO_RESULT_CHARS cap guards that replay path). An Obsidian plugin
 * restarts with the app, so our store RIDES THE SESSION FILE instead —
 * `session.todos`, the same precedent as goal (v0.1.25) and compression
 * (v0.1.17). No replay path exists, so the 512k replay cap is not ported.
 */

export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export interface TodoItem {
	id: string;
	content: string;
	status: TodoStatus;
}

export const VALID_TODO_STATUSES: readonly TodoStatus[] = ["pending", "in_progress", "completed", "cancelled"];

/* Hermes caps (todo_tool.py): generous relative to real plans — a todo item
   is a short task description and active lists are a handful of items. */
export const MAX_TODO_CONTENT_CHARS = 4000;
export const MAX_TODO_ITEMS = 256;
const TRUNCATION_MARKER = "… [truncated]";

/* Persisted as ordinary message content — their ContextCompressor uses this
   stable header to distinguish the synthetic post-compaction row; our
   compression cache folds it into the summary block the same way. */
export const TODO_INJECTION_HEADER = "[Your active task list was preserved across context compression]";

const MARKERS: Record<TodoStatus, string> = { completed: "[x]", in_progress: "[>]", pending: "[ ]", cancelled: "[~]" };

function capContent(content: string): string {
	if (content.length > MAX_TODO_CONTENT_CHARS) {
		return content.slice(0, MAX_TODO_CONTENT_CHARS - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
	}
	return content;
}

/** their _validate: normalize one item, forgiving fallbacks for junk. */
function validateItem(item: unknown): TodoItem {
	if (typeof item !== "object" || item === null)
		return { id: "?", content: "(invalid item)", status: "pending" };
	const t = item as Record<string, unknown>;
	const id = String(t.id ?? "").trim() || "?";
	const rawContent = String(t.content ?? "").trim();
	const content = rawContent ? capContent(rawContent) : "(no description)";
	const st = String(t.status ?? "pending").trim().toLowerCase() as TodoStatus;
	const status = VALID_TODO_STATUSES.includes(st) ? st : "pending";
	return { id, content, status };
}

/** their _dedupe_by_id: collapse duplicate ids, LAST occurrence wins and
   keeps its position. */
function dedupeById(todos: unknown[]): unknown[] {
	const lastIndex = new Map<string, number>();
	todos.forEach((item, i) => {
		if (typeof item !== "object" || item === null) {
			lastIndex.set(`__invalid_${i}`, i);
			return;
		}
		const id = String((item as Record<string, unknown>).id ?? "").trim() || "?";
		lastIndex.set(id, i);
	});
	return [...lastIndex.values()]
		.sort((a, b) => a - b)
		.map((i) => todos[i]);
}

export class TodoStore {
	private items: TodoItem[];

	constructor(initial?: TodoItem[]) {
		this.items = initial ? initial.map((t) => ({ ...t })) : [];
	}

	/** their write(): merge=false replaces the whole list (fresh plan);
	   merge=true updates existing items by id (only provided fields) and
	   appends new ones. Returns the full current list. Items without an id
	   cannot be merged and are skipped in merge mode. */
	write(todos: unknown[], merge = false): TodoItem[] {
		if (!merge) {
			this.items = dedupeById(todos).map(validateItem);
		} else {
			const existing = new Map(this.items.map((i) => [i.id, i]));
			for (const t of dedupeById(todos)) {
				if (typeof t !== "object" || t === null) continue;
				const rec = t as Record<string, unknown>;
				const itemId = String(rec.id ?? "").trim();
				if (!itemId) continue; // can't merge without an id
				const cur = existing.get(itemId);
				if (cur) {
					if (typeof rec.content === "string" && rec.content) cur.content = capContent(rec.content.trim());
					if (rec.status) {
						const st = String(rec.status).trim().toLowerCase() as TodoStatus;
						if (VALID_TODO_STATUSES.includes(st)) cur.status = st;
					}
				} else {
					const v = validateItem(t);
					existing.set(v.id, v);
					this.items.push(v);
				}
			}
			// rebuild, preserving order for existing items (their logic)
			const seen = new Set<string>();
			this.items = this.items
				.map((i) => ({ ...(existing.get(i.id) ?? i) }))
				.filter((i) => {
					if (seen.has(i.id)) return false;
					seen.add(i.id);
					return true;
				});
		}
		// keep the highest-priority head — list order IS priority
		if (this.items.length > MAX_TODO_ITEMS) this.items = this.items.slice(0, MAX_TODO_ITEMS);
		return this.read();
	}

	read(): TodoItem[] {
		return this.items.map((i) => ({ ...i }));
	}

	/** their format_for_injection: ONLY pending/in_progress — completed or
	   cancelled items would make the model re-do finished work after
	   compression. null when nothing active. */
	formatForInjection(): string | null {
		const active = this.items.filter((i) => i.status === "pending" || i.status === "in_progress");
		if (active.length === 0) return null;
		const lines = [TODO_INJECTION_HEADER];
		for (const item of active) lines.push(`- ${MARKERS[item.status] ?? "[?]"} ${item.id}. ${item.content} (${item.status})`);
		return lines.join("\n");
	}
}

/** Standalone injection for a plain item array (ChatApp compression site). */
export function formatTodoInjection(items: TodoItem[]): string | null {
	return new TodoStore(items).formatForInjection();
}

/** their todo_tool() return payload: full list + per-status summary counts. */
export function renderTodoResult(items: TodoItem[]): string {
	const count = (s: TodoStatus) => items.filter((i) => i.status === s).length;
	return JSON.stringify({
		todos: items,
		summary: {
			total: items.length,
			pending: count("pending"),
			in_progress: count("in_progress"),
			completed: count("completed"),
			cancelled: count("cancelled"),
		},
	});
}

/** ToolContext-side surface. Chat binds it to the session file; headless
   loops bind an ephemeral one (Hermes: one store per agent instance). The
   merge/replace semantics live in the TOOL via TodoStore — this is a dumb
   get/set boundary. */
export interface TodoApi {
	read(): TodoItem[];
	write(items: TodoItem[]): void;
}

/** Fresh per-run store for one-shot loops (cron headless, quick ask). */
export function ephemeralTodoApi(): TodoApi {
	let items: TodoItem[] = [];
	return {
		read: () => items.map((i) => ({ ...i })),
		write: (next) => {
			items = next.map((i) => ({ ...i }));
		},
	};
}
