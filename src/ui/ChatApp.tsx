/**
 * Open Agent chat application — hermes-desktop layout on prompt-kit
 * components. Chat column + slide-over session panel + composer with
 * model pill + statusbar. Overlays (approval, slash menu, panels) float
 * above content instead of pushing it around.
 */

import { App, Component, MarkdownView, Notice, TFile, normalizePath } from "obsidian";
import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { AgentLoop, AgentLoopEvents, ApprovalDecision, ApprovalRequest } from "../agent/agentLoop";
import type { ClarifyAnswer, ClarifyRequest } from "../agent/tools";
import {
	ProviderHttpError,
	cacheVisionSupport,
	chatCompletion,
	fetchAdvertisedContextLength,
	listModels,
	modelSupportsVision,
} from "../agent/providers";
import { getActiveProfile, resolveConnection, resolveOverlayKey } from "../agent/profiles";
import { exactMoaPresetName, moaUsage, normalizeMoaConfig, setActiveMoaPreset } from "../agent/moa";
import { MoaTurnEngine, type MoaDisplayEvent } from "../agent/moaLoop";
import { activateProviderCatalog, applyFetchedModels, catalogOf, rememberModelInCatalog, withCurrentModel } from "../agent/modelCatalog";
import { providerUsable } from "../agent/resilience";
import {
	applyCompressionCache,
	pickTokenTailStart,
	buildSummaryPrompt,
	estimateTokens,
	pickProtectedStart,
	resolveAuxTask,
	resolveContextWindow,
	shouldCompress,
	validCompressionCache,
	type CompressionCache,
} from "../agent/contextManager";
import { AgentRunner } from "../agent/runner";
import { buildRecallBlock, isTrivialPrompt } from "../agent/memoryEngine";
import { embedTexts } from "../agent/providers";
import { ComposerHistoryBrowse, deriveUserHistory } from "./composer/history";
import { workspacePolicyFor, type WorkspacePolicy } from "../agent/workspacePolicy";
import { formatTodoInjection, TodoApi, TodoItem } from "../agent/todo";
import { ChatApi, ChatApiSink, SelectionPayload } from "./chatApi";
import type { Skill } from "../agent/skills";
import { BUILD_STAMP, PLUGIN_VERSION } from "../buildInfo";
import {
	QueuedPrompt,
	enqueueEntry,
	isQueueParked,
	parkQueue,
	promoteEntry,
	removeEntry,
	prepareQueueMutation,
	queueMutationTargetIsCurrent,
	queueTransactions,
	afterSuccessfulQueueCommit,
	shouldAutoDrain,
	unparkQueue,
	updateEntry,
} from "../agent/promptQueue";
import { Session, SessionMeta, SessionStore, newSessionId } from "../agent/sessions";
import { ChatMessage, ConversationTurn, TokenUsage, TurnPart } from "../types";
import { OpenAgentSettings, PERSONALITY_OVERLAYS, getActiveProvider, isOverlayKey } from "../settings";
import type { OpenAgentNotificationEvent } from "../notifications";
import { ChatContainer } from "./components/chat-container";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "./components/reasoning";
import { FileUpload, FileUploadContent, UploadedFile } from "./components/file-upload";
import { MarkdownDoc } from "./components/markdown";
import { CopyAction, Message, MessageAction, MessageActions } from "./components/message";
import { ModelPicker } from "./components/model-picker";
import { Intro } from "./components/intro";
import { ProfilePicker } from "./components/profile-picker";
import { SearchField } from "./components/search-field";
import { SessionPanel } from "./components/session-panel";
import { markdownTextareaKeydown } from "./markdown-keys";
import { canonicalizeAssistantOutput } from "../markdown/canonical-output";
import {
	PromptInput,
	PromptInputAction,
	PromptInputActions,
	PromptInputHandle,
} from "./components/prompt-input";
import { SourceRef, Sources } from "./components/source";
import { TextShimmer } from "./components/text-shimmer";
import { Tool, ToolPart } from "./components/tool";
import { ThinkingBar } from "./components/thinking-bar";
import { AttachMenu } from "./attach/attach-menu";
import {
	FOLDER_ATTACH_MAX_BYTES,
	FOLDER_ATTACH_MAX_FILES,
	IMAGE_ATTACH_MAX_BYTES,
	VAULT_TEXT_EXT,
	VaultFileSuggest,
	VaultFolderSuggest,
	VaultImageSuggest,
	collectFolderMarkdown,
	mimeFromExt,
} from "./attach/vault-pickers";
import { extractAtRefs, findAtQuery, resolveAtRefs, spliceToken, type AtQuery } from "./attach/at-refs";
import { extractPromptTokens, noteMatchesWantedTags, resolveTitleToPath } from "../agent/promptTokens";
import { slashChipMatches, type ChipScanOptions } from "./composer/chips";
import {
	GOAL_MAX_PARSE_FAILURES,
	GOAL_MAX_TRANSPORT_FAILURES,
	GOAL_MAX_TURNS,
	SessionGoal,
	buildGoalJudgePrompt,
	continuationPrompt,
	newGoal,
	parseGoalVerdict,
} from "../agent/goals";
import { steerPreview } from "../agent/steer";
import {
	CheckIcon,
	FileTextIcon,
	ImageIcon,
	NoteIcon,
	PinIcon,
	PlusIcon,
	ArrowUpIcon,
	LayersIcon,
	SettingsIcon,
	RotateCcwIcon,
	StopIcon,
	TrashIcon,
	XIcon,
	ZapIcon,
	TerminalIcon,
	SnippetIcon,
	TextCursorInputIcon,
	PencilIcon,
	RefreshIcon,
	CopyIcon,
	QuoteIcon,
	BrainIcon,
} from "./icons";
import { FeedbackBar, type FeedbackValue } from "./components/feedback";
import { deriveChangedFiles } from "./components/changed-files";
import { ChangedFilesCard } from "./components/changed-files-card";
import { SystemMessage } from "./components/system-message";
import { PreviewDiff } from "./components/preview-diff";
import { planEdit, planWrite, WritePreview } from "../agent/writePreview";
import { resolveWritePath } from "../agent/tools";

/** Consecutive parts of the same kind, kept in chronological order. */
type TraceBlock =
	| { kind: "reasoning"; parts: Extract<TurnPart, { kind: "reasoning" }>[] }
	| { kind: "tool"; parts: Extract<TurnPart, { kind: "tool" }>[] }
	| { kind: "text"; parts: Extract<TurnPart, { kind: "text" }>[] }
	| { kind: "marker"; parts: Extract<TurnPart, { kind: "marker" }>[] };

/** Complete mutable-session payload captured for one persistence owner. */
type SessionPersistSnapshot = {
	enabled: boolean;
	id: string;
	title: string | null;
	model: string;
	messages: ChatMessage[];
	personality: string | null;
	compression: CompressionCache | null;
	parent: string | null;
	goal: SessionGoal | null;
	todos: TodoItem[] | null;
};

type GoalContinuationContext = {
	settings: OpenAgentSettings;
	signal: AbortSignal;
	sessionStore: SessionStore;
	sessionState: SessionPersistSnapshot;
	workspacePolicy: WorkspacePolicy;
};

/* The old home-screen suggestions now live in Settings → Commands and
   surface in the composer [+] menu ("Prompt snippets…"). */

/** v0.1.77 Commands tab: slash-menu name for a prompt snippet — titles
    carry spaces/punctuation, slash tokens don't */
const snippetSlug = (title: string): string =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.slice(0, 40) || "snippet";

const SLASH_COMMANDS: { name: string; desc: string; args?: string; aliases?: string[] }[] = [
	{ name: "/new", desc: "Start a fresh conversation", aliases: ["/reset"] },
	{ name: "/branch", desc: "Fork this chat into a new one — parent stays untouched", aliases: ["/fork"] },
	{ name: "/goal", desc: "Standing goal — the agent loops with a judge until done (max 20 turns)", args: "[text|status|pause|resume|clear]" },
	{ name: "/resume", desc: "Open the conversations panel — /resume <search>", args: "[search]", aliases: ["/sessions", "/switch"] },
	{ name: "/title", desc: "Show or rename this session — /title <name>", args: "[name]" },
	{ name: "/status", desc: "Show current session status" },
	{ name: "/steer", desc: "Steer the current run after the next tool call — /steer <text>", args: "<text>" },
	{ name: "/save", desc: "Save the transcript to the vault (openagent/exports)" },
	{ name: "/profile", desc: "Show or switch the active profile — /profile <name>", args: "[name]" },
	{ name: "/approvals", desc: "Show or set approval mode — /approvals <manual|cautious|yolo>", args: "<mode>" },
	{ name: "/model", desc: "Switch model — /model <name>; a bare preset name switches to MoA", args: "<name>" },
	{ name: "/moa", desc: "One-shot Mixture of Agents — /moa <prompt>, then restore your model", args: "<prompt>" },
	{ name: "/personality", desc: "Session personality overlay — /personality <name|none>", args: "<name|none>" },
	{ name: "/skills", desc: "List, read or arm a skill — /skills read|use <name>", args: "[list|read|use <name>]", aliases: ["/skill", "/search", "/use"] },
	{ name: "/memory", desc: "Show long-term memory" },
	{ name: "/usage", desc: "Show token usage for this session" },
	{ name: "/version", desc: "Show plugin version + build stamp" },
	{ name: "/queue", desc: "Queue a prompt behind the current turn — /queue <text>", args: "<text>", aliases: ["/q"] },
	{ name: "/compress", desc: "Summarize & compress the context", args: "[focus]", aliases: ["/compact"] },
	{ name: "/retry", desc: "Retry the last turn" },
	{ name: "/undo", desc: "Remove the last exchange" },
	{ name: "/learn", desc: "Distill this session's workflow into a reusable skill", args: "[focus]" },
	{ name: "/stop", desc: "Interrupt the agent" },
	{ name: "/help", desc: "Show available commands", aliases: ["/commands"] },
];

/* Official desktop parity (desktop-slash-commands.ts): aliases resolve to
   their canonical command and never appear as popover rows of their own. */
const SLASH_ALIASES = new Map<string, string>(
	SLASH_COMMANDS.flatMap((c) => (c.aliases ?? []).map((a) => [a, c.name] as const))
);

/* Per-thread composer drafts (Hermes Desktop v0.17): half-typed text stays
   with its chat when you hop sessions, and comes back when you return.
   Module-scoped so view remounts don't lose it; cleared on app unload. */
/* skill tokens chip/slug-match on this normalized form (Hermes skill names
   are lowercase dashed — ours may carry spaces/case in frontmatter) */
const skillSlug = (name: string): string => name.toLowerCase().replace(/[\s_]+/g, "-");

const composerDrafts = new Map<string, string>();

/** Turn tool parts → prompt-kit v5 ToolPart states. `pending` literally IS
   "input-streaming" here (the args JSON is still arriving); `running`
   (executing) maps to "input-available"; denied is our approval extension. */
function toToolPart(p: Extract<TurnPart, { kind: "tool" }>): ToolPart {
	let input: Record<string, unknown> | string | undefined;
	try {
		const parsed: unknown = JSON.parse(p.args);
		input = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : p.args;
	} catch {
		input = p.args || undefined; // partial JSON while streaming → shown raw
	}
	const base = { type: p.toolName, toolCallId: p.toolCallId };
	switch (p.status) {
		case "pending":
			return { ...base, state: "input-streaming", input };
		case "running":
			return { ...base, state: "input-available", input };
		case "done":
			return { ...base, state: "output-available", input, output: p.result ?? "" };
		case "denied":
			return { ...base, state: "denied", input, errorText: p.result ?? "Denied by user." };
		default:
			return { ...base, state: "output-error", input, errorText: p.result ?? "Tool failed." };
	}
}

export interface ChatAppProps {
	app: App;
	/** v0.1.130: folder plugin di configDir (contoh `.obsidian/plugins
	    /openagent`) — jalur byte vendor pdf.worker; ChatView mengisinya dari
	    plugin.manifest.dir */
	pluginDir?: string;
	settings: OpenAgentSettings;
	runner: AgentRunner;
	sessions: SessionStore;
	saveSettings: () => Promise<void>;
	/** Fire-and-forget save: reports its own failure, never rejects. Use
	    this unless the caller rolls state back on failure. */
	saveSettingsSafe: () => void;
	openSettings: (section?: string) => void;
	applyProfile: (id: string) => Promise<void>;
	renderComponent: Component;
	/** editor→chat bridge (candidate ③): ChatView/harness sink; optional so
	   the bare mount (tests, previews) keeps working */
	chatApiSink?: ChatApiSink;
	/** Privacy-safe lifecycle events; optional in simulation/test mounts. */
	onNotification?: (event: OpenAgentNotificationEvent) => void;
	/** v0.1.163: a session to restore on mount (leaf relocation keeps the
	   conversation alive); ChatView supplies it from the plugin's pending id. */
	initialSessionId?: string | null;
	/** v0.1.163: report the active session id up so relocation can capture it. */
	onSessionIdChange?: (id: string) => void;
}

let turnSeq = 0;
const nextTurnId = () => `turn-${++turnSeq}-${Date.now()}`;

function compact(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	return String(n);
}

/* Sent-bubble pill rendering — directive-text.tsx parity: an inert (already
   sent) text uses the SAME scan as composer hydration, so the transcript and
   the composer can never disagree about what a pill is. */
const ChipText = ({ text, resolver }: { text: string; resolver: ChipScanOptions }) => {
	const matches = slashChipMatches(text, { boundaryBefore: true, trailingCommitted: true, ...resolver });
	if (matches.length === 0) return <>{text}</>;
	const out: (string | JSX.Element)[] = [];
	let pos = 0;
	matches.forEach((m, i) => {
		if (m.start > pos) out.push(text.slice(pos, m.start));
		out.push(
			<span key={`chip-${i}-${m.start}`} className="oa-chip" data-kind={m.kind}>
				{m.command}
			</span>
		);
		pos = m.end;
	});
	if (pos < text.length) out.push(text.slice(pos));
	return <>{out}</>;
};

/* v0.1.48 (owner: "feedback pakai component prompt kit, tanpa emoji"):
   the feedback surface becomes the prompt-kit feedback-bar — ThumbsUp /
   ThumbsDown icons in the message footrow (components/feedback.tsx).
   The v0.1.42 emoji quick-row is retired; the iMessage double-tap
   gesture survives, tapping "up" on the turn. */
const TAPBACK_FEEDBACK: FeedbackValue = "up";
/** Sessions from the emoji era may persist v0.1.42 values — fold them
 *  into the icon pair when rendering (❤️/👍 → up, 👎 → down, else none;
 *  the next toggle writes canonical values). */
const feedbackOf = (reaction?: string): FeedbackValue | null =>
	reaction === "up" || reaction === "❤️" || reaction === "👍"
		? "up"
		: reaction === "down" || reaction === "👎"
			? "down"
			: null;
/* double-click already means something else on these: links and controls
   act, inputs and code blocks select — the gesture only claims the plain
   message body (official NOT_A_TAPBACK verbatim) */
/* 2026-08-07 (v0.1.103, owner: "select text dengan metode klik tidak ke
   select … seperti ke cancel"): double-click on message TEXT natively
   selects the word — then this gesture handler wiped it 0ms later via
   removeAllRanges() (and silently toggled the reaction). The detail!==2
   branch in the handler already DESIGNED selection preservation for
   triple-click; double-click was the same class of hole. Text content now
   excluded: dblclick on words = word selection (and the quote bar pops via
   the selectionchange path — the classic way to quote); dblclick on bubble
   chrome keeps the tapback gesture. Lane 5 in build.mjs sleeps here. */
const TAPBACK_EXCLUDE = 'a, button, input, pre, select, textarea, [contenteditable="true"], [role="button"], .oa-msg-content';

/* ------------------------------------------------------------------ */

/** Hermes clarify tool's question card (v0.1.80) — platform-ui parity with
    their CLI: up to 4 agent-offered rows, and the UI always appends the
    5th "Other (type your answer)" path. Three modes by req shape:
    choices+single → one click answers; choices+multi → checkboxes + Confirm;
    no choices → the free-text editor is open from the start. Transient UI
    state (picked set, other text) lives HERE so parent re-renders never
    lose a half-made selection. */
function ClarifyCard(props: { req: ClarifyRequest; onAnswer: (a: ClarifyAnswer) => void; onSkip: () => void }) {
	const { req, onAnswer, onSkip } = props;
	const [otherOpen, setOtherOpen] = useState(req.choices === null); // open-ended edits directly
	const [otherText, setOtherText] = useState("");
	const [picked, setPicked] = useState<Set<string>>(new Set());

	const submitOpen = () => {
		const t = otherText.trim();
		if (t) onAnswer(t);
	};
	const togglePick = (label: string) => {
		setPicked((prev) => {
			const next = new Set(prev);
			if (next.has(label)) next.delete(label);
			else next.add(label);
			return next;
		});
	};
	const otherTrim = otherText.trim();
	const confirmMulti = () => {
		const out = [...picked];
		if (otherTrim) out.push(otherTrim);
		if (out.length === 0) return;
		onAnswer(out);
	};

	return (
		<div className="oa-overlay">
			<div className="oa-clarify" role="dialog" aria-label="The agent asks a question">
				<div className="oa-clarify-head">
					<span aria-hidden="true">❓</span>
					<span>The agent asks</span>
				</div>
				<div className="oa-clarify-q">{req.question}</div>
				{req.choices !== null && !req.multiSelect ? (
					<div className="oa-clarify-choices">
						{req.choices.map((c) => (
							<button key={c} type="button" className="oa-clarify-choice" onClick={() => onAnswer(c)}>
								{c}
							</button>
						))}
						<button
							type="button"
							className="oa-clarify-choice is-other"
							onClick={() => setOtherOpen(true)}
							disabled={otherOpen}
						>
							Other (type your answer)
						</button>
					</div>
				) : null}
				{req.choices !== null && req.multiSelect ? (
					<div className="oa-clarify-choices">
						{req.choices.map((c) => (
							<label key={c} className="oa-clarify-check">
								<input type="checkbox" checked={picked.has(c)} onChange={() => togglePick(c)} />
								<span>{c}</span>
							</label>
						))}
						<input
							className="oa-clarify-other-input"
							type="text"
							placeholder="Other (type your answer)"
							value={otherText}
							onChange={(e) => setOtherText(e.target.value)}
							aria-label="Other answer"
						/>
					</div>
				) : null}
				{(req.choices === null || (otherOpen && !req.multiSelect)) && (
					<textarea
						className="oa-clarify-freetext"
						rows={2}
						placeholder="Type your answer…"
						value={otherText}
						onChange={(e) => setOtherText(e.target.value)}
						aria-label="Your answer"
					/>
				)}
				<div className="oa-clarify-actions">
					{req.choices !== null && req.multiSelect ? (
						<button
							type="button"
							className="oa-btn oa-btn-primary"
							disabled={picked.size === 0 && !otherTrim}
							onClick={confirmMulti}
						>
							Confirm
						</button>
					) : null}
					{(req.choices === null || (otherOpen && !req.multiSelect)) && (
						<button type="button" className="oa-btn oa-btn-primary" disabled={!otherTrim} onClick={submitOpen}>
							Send answer
						</button>
					)}
					<button type="button" className="oa-clarify-skip" onClick={onSkip}>
						Skip — let the agent decide
					</button>
				</div>
			</div>
		</div>
	);
}

function approvalKindLabel(kind: ApprovalRequest["kind"]): string {
	switch (kind) {
		case "persistent-write":
			return "persistent write";
		case "destructive":
			return "destructive action";
		case "scheduling":
			return "scheduled automation action";
		default:
			return "tool action";
	}
}

/* ------------------------------------------------------------------ */

export function ChatApp(props: ChatAppProps) {
	const { settings, runner } = props;
	const mountedRef = useRef(true);
	useEffect(() => {
		mountedRef.current = true;
		return () => { mountedRef.current = false; };
	}, []);
	/* Object identity changes on atomic settings import. Async callbacks use
	   this mirror to refuse commits into an object that is no longer active. */
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const [turns, setTurns] = useState<ConversationTurn[]>([]);
	const [running, setRunning] = useState(false);
	/* Transient status line for token-free windows (prompt processing between
	   agent iterations) — null while actual content is streaming in. */
	const [liveStatus, setLiveStatus] = useState<string | null>(null);
	const [input, setInput] = useState("");
	/* mirrors for effects that must read the freshest values from closures */
	const inputRef = useRef(input);
	useEffect(() => {
		inputRef.current = input;
	}, [input]);
	const [usage, setUsage] = useState<TokenUsage | null>(null);
	const [sessionId, setSessionId] = useState(() => newSessionId());
	const sessionIdRef = useRef(sessionId);
	const sessionLoadRequestRef = useRef(0);
	/* v0.1.163: report the active session id up to ChatView so a leaf
	   relocation can capture it before the view is recreated. */
	useEffect(() => {
		props.onSessionIdChange?.(sessionId);
	}, [sessionId, props.onSessionIdChange]);
	useEffect(() => {
		sessionIdRef.current = sessionId;
	}, [sessionId]);
	/* Background processes are session-owned. Leaving the session/view closes
	   that ownership boundary instead of creating unattended orphan work. */
	useEffect(() => () => {
		void runner.stopTerminalSession(sessionId);
	}, [runner, sessionId]);
	/* SessionStore is rebound in place, so identity cannot express scope. */
	const sessionPartitionKey = props.sessions.partitionKey();
	/* queued prompts ("queue prompt" — Hermes Desktop parity, owner 2026-07-26):
	   state mirrors the ACTIVE session's slice; settings.promptQueue holds the
	   persisted (image-stripped) copy; the park flag is in-memory by design */
	const [queue, setQueue] = useState<QueuedPrompt[]>([]);
	const [queueParked, setQueueParked] = useState(false);
	const [queueEditId, setQueueEditId] = useState<string | null>(null);
	const queueEditSnapshotRef = useRef<{ draft: string; files: UploadedFile[] } | null>(null);
		const queueRef = useRef<QueuedPrompt[]>(queue);
		const queueDrainingRef = useRef(false);
	useEffect(() => {
		const owner = settings.promptQueueScopes[sessionId];
		const loadedQueue = owner == null || owner === sessionPartitionKey ? (settings.promptQueue[sessionId] ?? []) : [];
		queueRef.current = loadedQueue;
		setQueue(loadedQueue);
		setQueueParked(isQueueParked(sessionId));
		setQueueEditId(null);
	}, [sessionId, sessionPartitionKey, settings]);
	/* Save the outgoing session's composer draft on every switch (the cleanup
	   runs before the fresh input lands) and on unmount; loadConversation and
	   newConversation restore the incoming side explicitly. */
	useEffect(() => {
		return () => {
			composerDrafts.set(sessionId, inputRef.current);
		};
	}, [sessionId]);
	const [sessionList, setSessionList] = useState<SessionMeta[]>([]);
	const [panelOpen, setPanelOpen] = useState(false);
	const [editingTurnId, setEditingTurnId] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState("");
	const [panelFilter, setPanelFilter] = useState("");
	/* content search results for the panel filter: sessionId → excerpt */
	const [panelHits, setPanelHits] = useState<Map<string, string> | null>(null);
	/* Debounced full-text search across saved sessions (title-only matching
	   stays instant; content hits merge in as async results resolve). */
	useEffect(() => {
		const q = panelFilter.trim();
		if (q.length < 2) {
			setPanelHits(null);
			return;
		}
		let alive = true;
		const scopedSessions = props.sessions.snapshot();
		const t = window.setTimeout(() => {
			void scopedSessions.search(q, 10).then((hits) => {
				if (alive && props.sessions.partitionKey() === scopedSessions.partitionKey()) {
					setPanelHits(new Map(hits.map((h) => [h.meta.id, h.excerpt])));
				}
			});
		}, 250);
		return () => {
			alive = false;
			window.clearTimeout(t);
		};
	}, [panelFilter, props.sessions, sessionPartitionKey]);
	/* model picker lists the ACTIVE provider's own catalog (per-provider,
	   Hermes Desktop); the current pick stays selectable even off-catalog */
	const [models, setModels] = useState<string[]>(() => withCurrentModel(catalogOf(getActiveProvider(settings)), settings.model));
	/* settings-render revision: several menu actions (collapse toggles,
	   visibility switches, MoA preset picks) mutate the settings OBJECT —
	   persisting is not re-rendering, so without an explicit bump the
	   picker/dialog looked dead until an unrelated state change happened */
	const [, bumpSettingsRev] = useReducer((x: number) => x + 1, 0);
	const [attachNote, setAttachNote] = useState(settings.includeActiveNote);
	/* /personality session overlay (Hermes: session-level, layered on the
	   profile's SOUL). New chats start from the GLOBAL personality
	   (display.personality parity — profiles carry none); the current chat
	   follows settings changes until the user overrides this session
	   explicitly with /personality. */
	const [sessionOverlay, setSessionOverlay] = useState<string | null>(() => resolveOverlayKey(settings, null));
	const overlayExplicitRef = useRef(false);
	const globalOverlayDefault = resolveOverlayKey(settings, null);
	useEffect(() => {
		if (!overlayExplicitRef.current) setSessionOverlay(globalOverlayDefault);
	}, [globalOverlayDefault]);
	const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
	type ApprovalPending = {
		req: ApprovalRequest;
		resolve: (d: ApprovalDecision) => void;
		/** Immutable workspace/settings snapshots owned by the requesting run. */
		workspacePolicy: WorkspacePolicy;
		settings: OpenAgentSettings;
		/* v0.1.58 preview diff (Copilot ApplyView parity, verified raw): the
		   write family previews a real word-level diff instead of the blind
		   args dump; the write itself still runs through the tool on Allow */
		preview?: WritePreview & { mtime: number | null };
		previewError?: string;
		/* set when the note changed on disk since the preview was built */
		stale?: boolean;
		/* v0.1.147 approval timeout handle — cleared on any user decision */
		timeoutHandle?: number;
	};
	const [approval, setApproval] = useState<ApprovalPending | null>(null);
	/* Hermes clarify tool (v0.1.80): the loop pauses on an open question
	   card — same machinery class as the approval card (pending promise
	   resolved by a click), mutually exclusive with it in practice */
		const [clarify, setClarify] = useState<{
			req: ClarifyRequest;
			resolve: (a: ClarifyAnswer) => void;
			workspacePolicy: WorkspacePolicy;
		} | null>(null);
		const approvalRef = useRef(approval);
		approvalRef.current = approval;
		const clarifyRef = useRef(clarify);
		clarifyRef.current = clarify;
		const [attachMenuOpen, setAttachMenuOpen] = useState(false);
	const attachAnchorRef = useRef<HTMLDivElement>(null);
	/* sessions panel: refs so the no-backdrop popover can close on outside
	   pointer / Escape without racing the topbar toggle (same pattern as the
	   [+] attach menu below). */
	const panelRef = useRef<HTMLElement>(null);
	const panelToggleRef = useRef<HTMLButtonElement>(null);
	/* context compression (v0.1.17): rolling wire summary — NEVER written into
	   the canonical history; cached in the session file, wire-rendering only */
	const compressionRef = useRef<CompressionCache | null>(null);
	/* session task list (v0.1.133, Hermes tools/todo_tool.py port): scratch-pad
	   plan scoped to THIS chat. Read/write closures over a ref so every
	   runAgent generation shares one list; persisted into the session file by
	   persistSession (goal/compression precedent) */
	const todoRef = useRef<TodoItem[] | null>(null);
	const todoApiRef = useRef<TodoApi>({
		read: () => (todoRef.current ?? []).map((t) => ({ ...t })),
		write: (items) => {
			todoRef.current = items;
		},
	});
	/* one-shot skill context armed by `/skills read|use <name>` (v0.1.22 cli
	   parity — a typed verb reach for a skill even when it's disabled) */
	const skillContextRef = useRef<string | null>(null);
	/* session title: null → persistSession derives it from the first user turn;
	   set → kept verbatim (loaded sessions, generated titles) */
	const sessionTitleRef = useRef<string | null>(null);
	/* standing goal (v0.1.25, hermes_cli/goals.py): per-session; ref for
	   closures + mirrored state for the statusbar chip */
	const goalRef = useRef<SessionGoal | null>(null);
	const [goal, setGoal] = useState<SessionGoal | null>(null);
	const setGoalSynced = useCallback((g: SessionGoal | null) => {
		goalRef.current = g;
		setGoal(g);
	}, []);
	/* post-turn continuation hook — a REF dodges the runAgent↔hook cycle:
	   the loop lives after every completed turn, this just points at it */
	/* true means the goal scheduled another ordinary run; terminal completion
	   must wait until a later run finally returns false. */
	const continueGoalRef = useRef<(context?: GoalContinuationContext) => Promise<boolean>>(async () => false);
	/* branch lineage: this chat's parent session id (Hermes /branch →
	   parent_session_id). Rides every persist so the link survives saves */
	const sessionParentRef = useRef<string | null>(null);

	const addFiles = useCallback((files: UploadedFile[]) => {
		setPendingFiles((prev) => {
			const byName = new Map(prev.map((f) => [f.name, f]));
			for (const f of files) byName.set(f.name, f); // replace same-name re-drops
			return Array.from(byName.values()).slice(0, 24); // folder attaches bring many
		});
	}, []);

	/* close the [+] menu on outside pointer / Escape — the anchor wraps the
	   button AND the menu, so the toggle click can't race this listener. */
	useEffect(() => {
		if (!attachMenuOpen) return;
		const onDown = (e: PointerEvent) => {
			if (attachAnchorRef.current && e.target instanceof Node && !attachAnchorRef.current.contains(e.target)) {
				setAttachMenuOpen(false);
			}
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setAttachMenuOpen(false);
		};
		document.addEventListener("pointerdown", onDown, true);
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("pointerdown", onDown, true);
			document.removeEventListener("keydown", onKey, true);
		};
	}, [attachMenuOpen]);

	/* close the sessions panel on outside pointer / Escape — the panel is a
	   slash-menu-style popover with NO backdrop, so the document listener is
	   what dismisses it; the toggle button counts as "inside" so toggling
	   closed can't immediately reopen. */
	useEffect(() => {
		if (!panelOpen) return;
		const onDown = (e: PointerEvent) => {
			const t = e.target;
			if (!(t instanceof Node)) return;
			if (panelRef.current?.contains(t) || panelToggleRef.current?.contains(t)) return;
			setPanelOpen(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			/* leave Escape to the rename/search inputs — they use it to cancel
			   their own edit, not to dismiss the panel */
			const t = e.target;
			if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
			setPanelOpen(false);
		};
		document.addEventListener("pointerdown", onDown, true);
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("pointerdown", onDown, true);
			document.removeEventListener("keydown", onKey, true);
		};
	}, [panelOpen]);

		const messagesRef = useRef<ChatMessage[]>([]);
		const abortRef = useRef<AbortController | null>(null);
		const headlessCommandAbortRef = useRef<AbortController | null>(null);
		/* the live AgentLoop — /steer reaches its thread-safe stash through this
		   while a run is in flight (run_agent.py busy-path parity) */
		const loopRef = useRef<AgentLoop | null>(null);
		/* Closing the view must release provider/tool work and interactive
		   promises without scheduling React state from an unmount cleanup. */
		useEffect(() => () => {
			abortRef.current?.abort();
			headlessCommandAbortRef.current?.abort();
			abortRef.current = null;
			headlessCommandAbortRef.current = null;
			loopRef.current = null;
			approvalRef.current?.resolve("deny");
			clarifyRef.current?.resolve("");
			approvalRef.current = null;
			clarifyRef.current = null;
		}, []);

	/* ---------------- attach menu handlers ---------------- */
	/* (disk browse wiring lives inside AttachMenu — only components rendered
	   INSIDE <FileUpload> can see its context; ChatApp is its parent) */

	const newAttachId = (seed: string) => `${seed}-${Date.now().toString(36)}`;
	const snapshotPickerPolicy = useCallback((): WorkspacePolicy | null => {
		try {
			return runner.snapshotWorkspacePolicy();
		} catch (e) {
			new Notice(`Open Agent: ${e instanceof Error ? e.message : String(e)}`);
			return null;
		}
	}, [runner, settings.workspaceMode, settings.workspaceFolder, settings.workspaceExcludedFolders, settings.fileReadMaxChars]);
	const pickerPolicyIsCurrent = useCallback((policy: WorkspacePolicy): boolean => {
		try {
			return runner.snapshotWorkspacePolicy().scopeKey === policy.scopeKey;
		} catch {
			return false;
		}
	}, [runner]);

	const pickVaultFile = useCallback(() => {
		const policy = snapshotPickerPolicy();
		if (!policy) return;
		const sourcePartition = props.sessions.partitionKey();
		const sourceSessionId = sessionIdRef.current;
		const requestIsCurrent = () =>
			pickerPolicyIsCurrent(policy) &&
			props.sessions.partitionKey() === sourcePartition &&
			sessionIdRef.current === sourceSessionId;
		new VaultFileSuggest(props.app, (file) => {
			if (!requestIsCurrent() || !policy.allowsPath(file.path)) return;
			void props.app.vault.read(file).then((content) => {
				if (!requestIsCurrent() || !policy.allowsPath(file.path)) return;
				if (content.length > policy.fileReadMaxChars) {
					new Notice(`Open Agent: ${file.path} exceeds the ${policy.fileReadMaxChars.toLocaleString()} character file-read limit.`);
					return;
				}
				addFiles([
					{ id: newAttachId(file.path), name: file.path, content, size: content.length, path: file.path, kind: "text" },
				]);
			}).catch((e) => {
				if (requestIsCurrent()) new Notice(`Open Agent: could not read ${file.path} — ${e instanceof Error ? e.message : String(e)}`);
			});
		}, (path) => policy.allowsPath(path)).open();
	}, [props.app, props.sessions, addFiles, snapshotPickerPolicy, pickerPolicyIsCurrent]);

	const pickVaultImage = useCallback(() => {
		const policy = snapshotPickerPolicy();
		if (!policy) return;
		const sourcePartition = props.sessions.partitionKey();
		const sourceSessionId = sessionIdRef.current;
		const requestIsCurrent = () =>
			pickerPolicyIsCurrent(policy) &&
			props.sessions.partitionKey() === sourcePartition &&
			sessionIdRef.current === sourceSessionId;
		new VaultImageSuggest(props.app, (file) => {
			if (!requestIsCurrent() || !policy.allowsPath(file.path)) return;
			void props.app.vault.readBinary(file).then((buf) => {
				if (!requestIsCurrent() || !policy.allowsPath(file.path)) return;
				if (buf.byteLength > IMAGE_ATTACH_MAX_BYTES) {
					new Notice(`Open Agent: ${file.name} is ${Math.round(buf.byteLength / 1048576)} MB — images cap at 5 MB.`);
					return;
				}
				// chunked base64 (spread-everything blows the arg limit on big files)
				const bytes = new Uint8Array(buf);
				let bin = "";
				for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
				const dataUrl = `data:${mimeFromExt(file.name)};base64,${btoa(bin)}`;
				addFiles([
					{
						id: newAttachId(file.path),
						name: file.path,
						content: "(attached image)",
						size: buf.byteLength,
						path: file.path,
						kind: "image",
						dataUrl,
					},
				]);
			}).catch((e) => {
				if (requestIsCurrent()) new Notice(`Open Agent: could not read ${file.path} — ${e instanceof Error ? e.message : String(e)}`);
			});
		}, (path) => policy.allowsPath(path)).open();
	}, [props.app, props.sessions, addFiles, snapshotPickerPolicy, pickerPolicyIsCurrent]);

	const pickVaultFolder = useCallback(() => {
		const policy = snapshotPickerPolicy();
		if (!policy) return;
		const sourcePartition = props.sessions.partitionKey();
		const sourceSessionId = sessionIdRef.current;
		const requestIsCurrent = () =>
			pickerPolicyIsCurrent(policy) &&
			props.sessions.partitionKey() === sourcePartition &&
			sessionIdRef.current === sourceSessionId;
		new VaultFolderSuggest(props.app, (folder) => {
			if (
				!requestIsCurrent() ||
				(folder.path === "" ? policy.mode === "strict-folder" : !policy.allowsPath(folder.path))
			) return;
			const vault = props.app.vault;
			const { picked, truncated, totalInFolder } = collectFolderMarkdown(
				vault.getFiles(), folder.path, FOLDER_ATTACH_MAX_FILES, FOLDER_ATTACH_MAX_BYTES,
				(path) => policy.allowsPath(path)
			);
			if (picked.length === 0) {
				new Notice("Open Agent: no markdown notes in that folder.");
				return;
			}
			const authorized = picked.filter((f) => policy.allowsPath(f.path));
			void Promise.all(authorized.map((f) => vault.read(f).then((content) => ({ f, content })))).then((read) => {
				if (!requestIsCurrent()) return;
				const stillVisible = read.filter(({ f }) => policy.allowsPath(f.path));
				const withinCeiling = stillVisible.filter(({ content }) => content.length <= policy.fileReadMaxChars);
				addFiles(
					withinCeiling.map(({ f, content }) => ({
						id: newAttachId(f.path),
						name: f.path,
						content,
						size: content.length,
						path: f.path,
						kind: "text" as const,
					}))
				);
				if (withinCeiling.length < stillVisible.length) {
					new Notice(`Open Agent: skipped ${stillVisible.length - withinCeiling.length} note(s) above the ${policy.fileReadMaxChars.toLocaleString()} character file-read limit.`);
				}
				if (stillVisible.length < read.length) {
					new Notice(`Open Agent: skipped ${read.length - stillVisible.length} note(s) whose Workspace path changed while reading.`);
				}
				if (truncated) {
					new Notice(
						`Open Agent: folder has ${totalInFolder} notes — attached the ${picked.length} newest within 200 KB.`
					);
				}
			}).catch((e) => {
				if (requestIsCurrent()) new Notice(`Open Agent: could not read that folder — ${e instanceof Error ? e.message : String(e)}`);
			});
		}, (path) => path === "" ? policy.mode !== "strict-folder" : policy.allowsPath(path)).open();
	}, [props.app, props.sessions, addFiles, snapshotPickerPolicy, pickerPolicyIsCurrent]);

	/** insert text at the composer caret (or append), keep caret after it */
	const insertAtCaret = useCallback(
		(text: string) => {
			const ta = composerRef.current?.getTextarea();
			const start = ta?.selectionStart ?? input.length;
			const end = ta?.selectionEnd ?? input.length;
			const padBefore = start > 0 && !/\s$/.test(input.slice(0, start)) ? " " : "";
			const padAfter = end < input.length && !/^\s/.test(input.slice(end)) ? " " : "";
			const insert = padBefore + text + padAfter;
			setInput(input.slice(0, start) + insert + input.slice(end));
			window.setTimeout(() => {
				const t = composerRef.current?.getTextarea();
				const pos = start + insert.length;
				t?.setCaret(pos);
				composerRef.current?.focus();
			}, 0);
		},
		[input]
	);
	/* the editor-bridge quote flow reuses insertAtCaret but must not capture
	   a stale one — the api registers ONCE with stable identities, so the
	   latest insertAtCaret lives behind a ref (same trick as continueGoalRef) */
	const insertAtCaretRef = useRef(insertAtCaret);
	useEffect(() => {
		insertAtCaretRef.current = insertAtCaret;
	}, [insertAtCaret]);

	/* ---------------- `@` inline references ---------------- */

	const [atQuery, setAtQuery] = useState<AtQuery | null>(null);
	const [atIndex, setAtIndex] = useState(0);
	/* v0.1.165: slash-popover keyboard highlight (Hermes data-highlighted). */
	const [slashIndex, setSlashIndex] = useState(0);
	/* v0.1.167: the menu container, so keyboard nav can scroll the active row
	   back into view (Hermes local-scroll, block: nearest). */
	const slashMenuRef = useRef<HTMLDivElement>(null);

	/** vault text files matching the unfinished @query */
	const atMatches = useMemo(() => {
		if (!atQuery) return [];
		let policy: WorkspacePolicy;
		try {
			policy = runner.snapshotWorkspacePolicy();
		} catch {
			return [];
		}
		const q = atQuery.query.toLowerCase();
		const files = props.app.vault.getFiles().filter((f) => policy.allowsPath(f.path) && VAULT_TEXT_EXT.test(f.name));
		const hits = files.filter((f) => !q || f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
		hits.sort((a, b) => {
			const ap = a.basename.toLowerCase().startsWith(q) ? 0 : 1;
			const bp = b.basename.toLowerCase().startsWith(q) ? 0 : 1;
			return ap !== bp ? ap - bp : b.stat.mtime - a.stat.mtime;
		});
		return hits.slice(0, 8);
	}, [atQuery, props.app, runner, settings.workspaceMode, settings.workspaceFolder, settings.workspaceExcludedFolders]);

	/* queue-edit cancel (Esc) — restores the composer draft that was live
	   when the pencil was pressed; declared early: handleComposerKeys uses it */
	const cancelQueueEdit = useCallback(() => {
		const snap = queueEditSnapshotRef.current;
		setQueueEditId(null);
		queueEditSnapshotRef.current = null;
		if (snap) {
			setInput(snap.draft);
			setPendingFiles(snap.files);
		}
	}, []);

	const handleInputChange = useCallback((v: string) => {
		setInput(v);
		const caret = composerRef.current?.getTextarea()?.selectionStart ?? v.length;
		setAtQuery(findAtQuery(v, caret));
		setAtIndex(0);
		setSlashIndex(0);
	}, []);

	const acceptAt = useCallback(
		(file: TFile) => {
			setAtQuery((q) => {
				if (!q) return null;
				const caret = composerRef.current?.getTextarea()?.selectionStart ?? input.length;
				const { text, caret: nc } = spliceToken(input, q.start, caret, file.path);
				setInput(text);
				window.setTimeout(() => {
					const t = composerRef.current?.getTextarea();
					t?.setCaret(nc);
					composerRef.current?.focus();
				}, 0);
				return null;
			});
		},
		[input]
	);

	const assistantTurnRef = useRef<string | null>(null);
	const reasoningStartRef = useRef<number>(0);
	const nudgeCounterRef = useRef(0);
	const tokenTotalsRef = useRef({ in: 0, out: 0 });
	const [tokenTotals, setTokenTotals] = useState({ in: 0, out: 0 });
	/* v0.1.159 (A3 TokenTag): context window for the token pill — explicit
	   setting wins, else the provider-advertised length (cached, best-effort).
	   null = unknown → the pill stays a plain ↑in ↓out, never a guess. */
	const [contextWindow, setContextWindow] = useState<number | null>(null);
	const contextWindowConnRef = useRef<string | null>(null);
	/* v0.1.176 structured-memory engine: how many facts the last run recalled
	   (statusbar indicator) + the retain cadence counter. */
	const [recalledCount, setRecalledCount] = useState(0);
	const retainCounterRef = useRef(0);
	const composerRef = useRef<PromptInputHandle>(null);
	/* v0.1.180 (Hermes composer parity): ↑/↓ input-history browse cursor. */
	const historyBrowseRef = useRef<ComposerHistoryBrowse>(new ComposerHistoryBrowse());

	/* Synchronous mirror of `turns`. Streaming helpers replace turn objects
	   via map(), so any captured reference (or the state closure) is stale by
	   the time a run finishes — persistence must read this ref to see the
	   fully streamed parts (reasoning / tool), not the original empty turn. */
	const turnsRef = useRef<ConversationTurn[]>([]);
	const setTurnsSynced = useCallback(
		(next: ConversationTurn[] | ((prev: ConversationTurn[]) => ConversationTurn[])) => {
			const value = typeof next === "function" ? next(turnsRef.current) : next;
			turnsRef.current = value;
			setTurns(value);
		},
		[]
	);

	const refreshSessions = useCallback(async () => {
		const scopedSessions = props.sessions.snapshot();
		const list = await scopedSessions.list();
		if (props.sessions.partitionKey() === scopedSessions.partitionKey()) setSessionList(list);
	}, [props.sessions, sessionPartitionKey]);

	/** Durable half of a panel rename. SessionPanel owns its draft/input state;
	 * ChatApp owns the store snapshot, partition freshness, and active-title
	 * mirror so an asynchronous persistence result cannot affect another scope. */
	const renameSession = useCallback(async (id: string, next: string) => {
		const scopedSessions = props.sessions.snapshot();
		const renamed = await scopedSessions.rename(id, next);
		if (!renamed) {
			new Notice("Open Agent: session not found.");
			return;
		}
		if (props.sessions.partitionKey() !== scopedSessions.partitionKey()) return;
		if (id === sessionIdRef.current) sessionTitleRef.current = next;
		void refreshSessions();
	}, [props.sessions, refreshSessions]);


	useEffect(() => {
		void refreshSessions();
	}, [refreshSessions]);

	/* ---------------- turn mutation helpers ---------------- */

	const patchTurn = useCallback(
		(id: string, fn: (parts: TurnPart[]) => TurnPart[]) => {
			setTurnsSynced((prev) => prev.map((t) => (t.id === id ? { ...t, parts: fn(t.parts) } : t)));
		},
		[setTurnsSynced]
	);

	const appendText = useCallback(
		(id: string, text: string) => {
			patchTurn(id, (parts) => {
				const next = [...parts];
				const last = next[next.length - 1];
				if (last && last.kind === "text") next[next.length - 1] = { kind: "text", text: last.text + text };
				else next.push({ kind: "text", text });
				return next;
			});
		},
		[patchTurn]
	);

	const appendReasoning = useCallback(
		(id: string, text: string) => {
			patchTurn(id, (parts) => {
				const next = [...parts];
				const last = next[next.length - 1];
				if (last && last.kind === "reasoning") next[next.length - 1] = { ...last, text: last.text + text };
				else {
					reasoningStartRef.current = Date.now();
					next.push({ kind: "reasoning", text });
				}
				return next;
			});
		},
		[patchTurn]
	);

	/* MoA display feed (Hermes Desktop gateway-event.ts parity, v0.1.30):
	   progress/reference/phase events share ONE reasoning-disclosure buffer
	   per turn. First progress line REPLACES; later lines accumulate; the
	   first reference block replaces again (the progress trail is
	   self-cleaning); the aggregating line accumulates. Advisor outputs are
	   complete blocks, never token streams, so they never race the model's
	   own reasoning text (which appends into the same disclosure, officially
	   by design). */
	const moaFeedRef = useRef("");
	const moaEmit = useCallback(
		(id: string, e: MoaDisplayEvent) => {
			if (e.type === "progress") {
				const line = `◇ MoA refs ${e.done}/${e.total}${e.label ? ` — ${e.label}` : ""}\n`;
				moaFeedRef.current = e.done <= 1 ? line : moaFeedRef.current + line;
				setLiveStatus(`MoA: refs ${e.done}/${e.total}…`);
			} else if (e.type === "reference") {
				const block = `◇ Reference ${e.index}/${e.count} — ${e.label}\n${e.text}\n\n`;
				moaFeedRef.current = e.index <= 1 ? block : moaFeedRef.current + block;
				setLiveStatus(null);
			} else if (e.type === "phase" && e.phase === "aggregator") {
				moaFeedRef.current += "◇ MoA aggregating…\n";
				setLiveStatus("MoA: aggregating…");
			} else {
				return;
			}
			const buffer = moaFeedRef.current;
			patchTurn(id, (parts) => {
				const next = [...parts];
				const last = next[next.length - 1];
				if (last && last.kind === "reasoning") next[next.length - 1] = { ...last, text: buffer };
				else {
					reasoningStartRef.current = Date.now();
					next.push({ kind: "reasoning", text: buffer });
				}
				return next;
			});
		},
		[patchTurn]
	);

	/* Live preview: the tool call is still streaming in. The card sits in the
	   transcript immediately (badge "Processing", args fill in as they
	   arrive) so the gap between "reasoning done" and "tool runs" never
	   looks frozen. */
	const toolPending = useCallback(
		(id: string, toolCallId: string, toolName: string, args: string) => {
			patchTurn(id, (parts) => {
				const idx = parts.findIndex((p) => p.kind === "tool" && p.toolCallId === toolCallId);
				if (idx >= 0) {
					const cur = parts[idx];
					if (cur.kind !== "tool" || cur.status !== "pending") return parts;
					return parts.map((p, i) => (i === idx && p.kind === "tool" ? { ...p, toolName, args } : p));
				}
				return [...parts, { kind: "tool" as const, toolCallId, toolName, args, status: "pending" as const }];
			});
		},
		[patchTurn]
	);

	/* Pendings belong to streaming previews: if execution never followed
	   (stream died mid-args, failover re-issued the call under a new id),
	   they would dangle forever — strip them once the run settles. */
	const stripPendingTools = useCallback(
		(id: string) => {
			patchTurn(id, (parts) => parts.filter((p) => !(p.kind === "tool" && p.status === "pending")));
		},
		[patchTurn]
	);

	const toolStart = useCallback(
		(id: string, toolCallId: string, toolName: string, args: string) => {
			patchTurn(id, (parts) => {
				const idx = parts.findIndex((p) => p.kind === "tool" && p.toolCallId === toolCallId);
				if (idx >= 0) {
					// upgrade the streaming preview in place: pending → running
					return parts.map((p, i) =>
						i === idx && p.kind === "tool" ? { ...p, toolName, args, status: "running" as const } : p
					);
				}
				return [...parts, { kind: "tool" as const, toolCallId, toolName, args, status: "running" as const }];
			});
		},
		[patchTurn]
	);

	const appendMarker = useCallback(
		(id: string, text: string) => {
			patchTurn(id, (parts) => [...parts, { kind: "marker", text }]);
		},
		[patchTurn]
	);

	const toolResult = useCallback(
		(id: string, toolCallId: string, status: "done" | "error" | "denied", result: string) => {
			patchTurn(id, (parts) =>
				parts.map((p) => (p.kind === "tool" && p.toolCallId === toolCallId ? { ...p, status, result } : p))
			);
		},
		[patchTurn]
	);

	/* /steer drained into a tool result (v0.1.26): the loop already mutated
	   its own request copy — mirror the marker into the rendered card and
	   the saved wire so transcript, disk and model never disagree. The
	   drain can target a PREVIOUS run's tool message (a steer typed while
	   the model thinks before any tool this turn — conversation_loop.py
	   scans the whole wire), so this searches every turn, not just the
	   live one. Idempotent via the includes guard. */
	const applySteerMarker = useCallback(
		(toolCallId: string | undefined, marker: string) => {
			if (!toolCallId) return;
			const wire = messagesRef.current;
			for (let i = wire.length - 1; i >= 0; i--) {
				const m = wire[i];
				if (m.role === "tool" && m.tool_call_id === toolCallId) {
					if (typeof m.content === "string" && !m.content.includes(marker)) m.content += marker;
					break;
				}
			}
			setTurnsSynced((prev) =>
				prev.map((t) =>
					t.parts.some((p) => p.kind === "tool" && p.toolCallId === toolCallId)
						? {
								...t,
								parts: t.parts.map((p) =>
									p.kind === "tool" && p.toolCallId === toolCallId && typeof p.result === "string" && !p.result.includes(marker)
										? { ...p, result: p.result + marker }
										: p
								),
						  }
						: t
				)
			);
		},
		[setTurnsSynced]
	);

	const finalizeReasoning = useCallback(
		(id: string) => {
			patchTurn(id, (parts) =>
				parts.map((p) =>
					p.kind === "reasoning" && p.durationMs == null
						? { ...p, durationMs: Date.now() - reasoningStartRef.current }
						: p
				)
			);
		},
		[patchTurn]
	);

	/* ---------------- session helpers ---------------- */

	/* v0.1.57 system banner (prompt-kit SystemMessage port): local notices
	   are HONEST system turns — persisted as such, rendered as quiet banners,
	   never assistant bubbles and never the wire (history is messagesRef).
	   variant = severity; cta rides as data (handler re-attached at render). */
	const pushLocalNoticeTurn = useCallback(
		(text: string, variant: "action" | "warning" | "error" = "action", cta?: { label: string; openPath: string }) => {
			setTurnsSynced((prev) => [
				...prev,
				{
					id: nextTurnId(),
					role: "system",
					parts: [{ kind: "text", text }],
					timestamp: Date.now(),
					notice: variant,
					...(cta ? { noticeCta: cta } : {}),
				},
			]);
		},
		[setTurnsSynced]
	);

	const persistSession = useCallback(
		async (
			allTurns: ConversationTurn[],
			sessionStore: SessionStore = props.sessions,
			owned?: SessionPersistSnapshot
		) => {
			const state: SessionPersistSnapshot = owned ?? {
				enabled: settings.saveSessions,
				id: sessionId,
				title: sessionTitleRef.current,
				model: resolveConnection(settings).model,
				messages: messagesRef.current,
				personality: sessionOverlay,
				compression: compressionRef.current,
				parent: sessionParentRef.current,
				goal: goalRef.current,
				todos: todoRef.current,
			};
			if (!state.enabled) return;
			const firstUser = allTurns.find((t) => t.role === "user");
			/* an explicit title (loaded or generated) survives saves; only
			   title-less sessions derive one from the first user turn */
			const title =
				state.title ??
				(firstUser?.parts
					.filter((p) => p.kind === "text")
					.map((p) => (p as { text: string }).text)
					.join(" ")
					.slice(0, 60) || "Untitled session");
			const session: Session = {
				id: state.id,
				title,
				createdAt: allTurns[0]?.timestamp ?? Date.now(),
				updatedAt: Date.now(),
				model: state.model,
				turnCount: allTurns.length,
				turns: allTurns,
				messages: state.messages,
				personality: state.personality ?? undefined,
				compression: state.compression ?? undefined,
				...(state.parent ? { parent: state.parent } : {}),
				...(state.goal && state.goal.status !== "cleared" ? { goal: state.goal } : {}),
				...(state.todos?.length ? { todos: state.todos } : {}),
			};
			await sessionStore.save(session);
			void refreshSessions();
		},
		[settings, sessionId, sessionOverlay, props.sessions, refreshSessions]
	);

	/* ---------------- message feedback (v0.1.48, prompt-kit feedback-bar) ---------------- */

	/** One feedback per turn; re-tap retracts, the other thumb switches.
	 *  Paints locally immediately, persists behind (same shape as v0.1.42). */
	const toggleFeedback = useCallback(
		(turnId: string, value: FeedbackValue | null) => {
			setTurnsSynced((prev) => {
				const next = prev.map((t) => (t.id === turnId ? { ...t, reaction: value ?? undefined } : t));
				void persistSession(next);
				return next;
			});
		},
		[setTurnsSynced, persistSession]
	);

	/** Close = permanently dismissed for that turn. Persisted, exactly
	 *  like the rating (owner 2026-08-02: "hilang permanen"). */
	const dismissFeedback = useCallback(
		(turnId: string) => {
			setTurnsSynced((prev) => {
				const next = prev.map((t) => (t.id === turnId ? { ...t, feedbackDismissed: true } : t));
				void persistSession(next);
				return next;
			});
		},
		[setTurnsSynced, persistSession]
	);

	/** The banner surfaces only while neither rating nor dismissal exists —
	 *  and (owner) on ASSISTANT answers only: rating your own message in
	 *  your own bubble is meaningless, that's the emoji-tapback era
	 *  leaking semantics it never had. */
	/* changed-files card (v0.1.56): a row opens the touched note in a vault
	   leaf (desktop opens its diff pane — approved divergence); deleted or
	   missing files report quietly instead of dead-clicking */
	const openChangedFile = (path: string, deleted: boolean): void => {
		if (deleted) {
			new Notice(`Open Agent: ${path} was deleted — nothing to open.`);
			return;
		}
		const f = props.app.vault.getAbstractFileByPath(path);
		if (f instanceof TFile) void props.app.workspace.getLeaf(false).openFile(f);
		else new Notice(`Open Agent: ${path} is no longer in the vault.`);
	};

	const showFeedbackBar = (turn: ConversationTurn): boolean =>
		feedbackOf(turn.reaction) === null && !turn.feedbackDismissed;

	/** The conversation double-tap survives the icon era: double-clicking
	 *  plain message body toggles "up" on the turn. */
	const turnTapback = useCallback(
		(turn: ConversationTurn) => (ev: ReactMouseEvent<HTMLElement>) => {
			if (ev.detail !== 2) return; // a triple-click re-fire selects the paragraph
			const target = ev.target as Element | null;
			if (target && target.closest(TAPBACK_EXCLUDE)) return;
			window.getSelection()?.removeAllRanges();
			toggleFeedback(turn.id, feedbackOf(turn.reaction) === TAPBACK_FEEDBACK ? null : TAPBACK_FEEDBACK);
		},
		[toggleFeedback]
	);

	/* ---------------- selection actions (v0.1.44, chat-UI backlog ④) ----------------
	   Drag-select text inside a message bubble → floating bar with Quote
	   (blockquote into the composer, Obsidian `> `-lines) + Copy. Official
	   Hermes Desktop has no such toolbar — its selection machinery
	   (thread/user-message.tsx hasTextSelection) only GUARDS gestures while
	   text is highlighted; this is modeled after that surface, not ported. */
		const [selBar, setSelBar] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
		const selBarRef = useRef(selBar);
		selBarRef.current = selBar;
		const [selCopied, setSelCopied] = useState(false);
		const selTimer = useRef<number | null>(null);
		const copyClearTimer = useRef<number | null>(null);
		const selDrag = useRef(false);

		useEffect(() => {
			const hide = () => {
				if (copyClearTimer.current !== null) {
					window.clearTimeout(copyClearTimer.current);
					copyClearTimer.current = null;
				}
				selBarRef.current = null;
				setSelBar(null);
				setSelCopied(false);
			};
		const endpointEl = (n: Node | null): Element | null =>
			n ? (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement) : null;
		const recompute = () => {
			if (selDrag.current) return; // never pop the bar mid-drag (official: selection is a reading gesture)
			const sel = window.getSelection();
			if (!sel || sel.isCollapsed || sel.rangeCount === 0) return hide();
			const range = sel.getRangeAt(0);
			/* range.toString(), not Selection.toString(): the Selection variant
			   returns "" for programmatic ranges in headless/unfocused Chromium
			   (harness proof 2026-08-02) — Range reads the DOM directly */
			const text = range.toString();
			if (!text.trim()) return hide();
			/* both endpoints must live inside the SAME message body — quoting
			   across bubbles (or from the composer chrome) is never intended */
			const contentA = endpointEl(sel.anchorNode)?.closest(".oa-msg-content");
			if (!contentA || contentA !== endpointEl(sel.focusNode)?.closest(".oa-msg-content")) return hide();
			const rect = range.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) return hide();
			/* a bar for an off-screen highlight is noise (harness: auto-scrolled
			   chat parked the selected line 366px above the viewport) */
			if (rect.bottom < 0 || rect.top > window.innerHeight) return hide();
			const below = rect.top < 64;
			const nextBar = {
				text,
				x: Math.min(Math.max(rect.left + rect.width / 2, 70), window.innerWidth - 70),
				y: below ? rect.bottom : rect.top,
				below,
			};
			selBarRef.current = nextBar;
			setSelBar(nextBar);
		};
		const schedule = (ms: number) => {
			if (selTimer.current !== null) window.clearTimeout(selTimer.current);
			selTimer.current = window.setTimeout(recompute, ms);
		};
		const onSelChange = () => schedule(60);
		const onPointerDown = () => {
			selDrag.current = true;
		};
		/* v0.1.101 (owner: "fitur quote di chat ui menghilang" — seleksi bisa,
		   bar tak pernah muncul): pointerup TIDAK dijamin datang — browser/OS
		   boleh membatalkan pointer di tengah gestur (touch takeover, gesture
		   OS, drag initiation). Sekali tertelan, flip-flop ini stuk=true
		   selamanya dan bar mati senyap sampai view remount (lane 3 red
		   witness mereproduksi gejala owner di pengadilan). Tambal tiga lapis:
		     1. pointercancel = jalan keluar resmi gestur batal;
		     2. didaftarkan di WINDOW-capture (lebih awal & lebih luas dari
		        document) — tak bisa ditelan stopPropagation di bawahnya, dan
		        pelepasan tombol di chrome jendela tetap tercatat;
		     3. mousemove buttons===0 = fakta fisik tombol sudah dilepas —
		        penyelamat saat up+cancel sama-sama tertelan (berdasarkan
		        tombol, bukan jenis event → tak bisa salah-baca gestur). */
		const onPointerDone = () => {
			if (!selDrag.current) return;
			selDrag.current = false;
			schedule(30); // drag ended → settle check (keyboard-only selection never touches this)
		};
		const onMouseMove = (e: MouseEvent) => {
			if (e.buttons === 0) onPointerDone();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") hide();
		};
		const onScroll = () => hide(); // the bar is anchored to moving text
		document.addEventListener("selectionchange", onSelChange);
		document.addEventListener("pointerdown", onPointerDown, true);
		window.addEventListener("pointerup", onPointerDone, true);
		window.addEventListener("pointercancel", onPointerDone, true);
		window.addEventListener("mousemove", onMouseMove, true);
		document.addEventListener("keydown", onKey, true);
		document.addEventListener("scroll", onScroll, true);
			return () => {
				if (selTimer.current !== null) window.clearTimeout(selTimer.current);
				if (copyClearTimer.current !== null) window.clearTimeout(copyClearTimer.current);
				document.removeEventListener("selectionchange", onSelChange);
			document.removeEventListener("pointerdown", onPointerDown, true);
			window.removeEventListener("pointerup", onPointerDone, true);
			window.removeEventListener("pointercancel", onPointerDone, true);
			window.removeEventListener("mousemove", onMouseMove, true);
			document.removeEventListener("keydown", onKey, true);
			document.removeEventListener("scroll", onScroll, true);
		};
	}, []);

	/** Quote: Obsidian blockquote lines — always starts on its own composer line */
	const quoteSelection = useCallback(() => {
		if (!selBar) return;
		const quoted = selBar.text.split("\n").map((l) => `> ${l}`).join("\n");
		const ta = composerRef.current?.getTextarea();
		const caret = ta?.selectionStart ?? input.length;
		const needsNl = caret > 0 && !input.slice(0, caret).endsWith("\n");
		insertAtCaret((needsNl ? "\n" : "") + quoted + "\n\n");
		selBarRef.current = null;
		setSelBar(null);
		window.getSelection()?.removeAllRanges();
	}, [selBar, insertAtCaret, input]);

	/* ---------------- editor context-menu bridge (candidate ③, v0.1.75) --------
   Registered on the sink from props (ChatView in the real plugin; the sim
   harness passes its own). Both flows mirror the in-chat quote/attach paths
   EXACTLY so editor-origin context behaves identically to what the user can
   already do by hand. */

	/** chip label: full vault path + human line range — Copilot vocabulary
	    (L12 / L12-14, plain hyphen) pinned against our own full-path chips */
	const selectionChipName = (p: SelectionPayload): string => {
		const where = p.fromLine === p.toLine ? `L${p.fromLine}` : `L${p.fromLine}-${p.toLine}`;
		return p.path ? `${p.path} ${where}` : `Selection ${where}`;
	};

	const authorizeEditorPayload = useCallback((p: SelectionPayload): WorkspacePolicy | null => {
		const policy = snapshotPickerPolicy();
		if (!policy) return null;
		try {
			policy.assertVisiblePath(p.path, "Editor selection");
			if ((p.workspaceScope && p.workspaceScope !== policy.scopeKey) || (policy.mode === "strict-folder" && !p.workspaceScope)) {
				throw new Error("Editor selection belongs to a different Workspace scope; select it again.");
			}
			if (p.text.length > policy.fileReadMaxChars) {
				throw new Error(`Editor selection exceeds the ${policy.fileReadMaxChars.toLocaleString()} character file-read limit.`);
			}
			return policy;
		} catch (error) {
			new Notice(`Open Agent: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	}, [snapshotPickerPolicy]);

	const apiAttachSelection = useCallback(
		(p: SelectionPayload) => {
			if (!authorizeEditorPayload(p)) return;
			addFiles([
				{
					id: newAttachId(`editor-selection-${p.path || "note"}-${p.fromLine}`),
					name: selectionChipName(p),
					content: p.text,
					size: p.text.length,
					path: p.path,
					kind: "text",
				},
			]);
			window.setTimeout(() => composerRef.current?.focus(), 0);
		},
		[addFiles, authorizeEditorPayload]
	);

	/* Ask flow: same shape as quoteSelection — "> " per line, own composer
	   line, blank line + caret below so the user just types the question */
	const apiQuoteSelectionForAsk = useCallback((p: SelectionPayload) => {
		if (!authorizeEditorPayload(p)) return;
		const quoted = p.text.split("\n").map((l) => `> ${l}`).join("\n");
		const caret = composerRef.current?.getTextarea()?.selectionStart ?? inputRef.current.length;
		const needsNl = caret > 0 && !inputRef.current.slice(0, caret).endsWith("\n");
		insertAtCaretRef.current((needsNl ? "\n" : "") + quoted + "\n\n");
	}, [authorizeEditorPayload]);

	/* custom snippet action (v0.1.76): snippet text first, blank line, the
	   quoted selection below, caret at the very end — same insertAtCaret
	   mechanics as the Ask flow, so editor-origin prompts read exactly
	   like hand-typed ones */
	const apiRunSnippetOnSelection = useCallback((lead: string, p: SelectionPayload) => {
		if (!authorizeEditorPayload(p)) return;
		const caret = composerRef.current?.getTextarea()?.selectionStart ?? inputRef.current.length;
		const needsNl = caret > 0 && !inputRef.current.slice(0, caret).endsWith("\n");
		/* Copilot {} parity (v0.1.78): when the command text names the slot,
		   the selection goes INLINE there; otherwise keep the legacy
		   lead-then-blockquote staging */
		const body = lead.includes("{}")
			? lead.split("{}").join(p.text).trim()
			: lead.trim() + "\n\n" + p.text.split("\n").map((l) => `> ${l}`).join("\n");
		insertAtCaretRef.current((needsNl ? "\n" : "") + body + "\n\n");
	}, [authorizeEditorPayload]);

	/** THE one place a skill's instructions enter runAgent's context —
	    4000-char cap included. Every arming flow ("/<skill>" slash,
	    "/skills read|use", editor menu) funnels through here. */
	const loadSkillIntoContextRef = (skill: Skill) => {
		skillContextRef.current = `[Skill: ${skill.name}]\n${skill.instructions}`.slice(0, 4000);
	};

	/** arm a skill one-shot + visible notice; shared by the editor-menu
	    bridge and the "/<skill>" bare-slash handler (silent when the skill
	    rides a same-run instruction instead) */
	const armSkillOneShot = useCallback(
		(hit: Skill, opts?: { silent?: boolean }) => {
			loadSkillIntoContextRef(hit);
			if (opts?.silent) return;
			pushLocalNoticeTurn(
				`Skill **\`${hit.name}\`** armed — your next message carries its instructions${hit.enabled ? "." : " (it's disabled by frontmatter; the typed name still wins)."}`
			);
		},
		[pushLocalNoticeTurn]
	);

	const apiRunSkillOnSelection = useCallback(
		(skillName: string, p: SelectionPayload) => {
			const policy = authorizeEditorPayload(p);
			if (!policy) return;
			const sourcePartition = props.sessions.partitionKey();
			const sourceSessionId = sessionIdRef.current;
			apiAttachSelection(p);
			void runner.skillsForPolicy(policy)
				.loadSkills()
				.then((list) => {
					if (
						!pickerPolicyIsCurrent(policy) ||
						props.sessions.partitionKey() !== sourcePartition ||
						sessionIdRef.current !== sourceSessionId
					) return;
					const hit = list.find((s) => s.name === skillName);
					if (!hit) {
						pushLocalNoticeTurn(
							`Skill **\`${skillName}\`** is no longer installed — the selection chip is attached; re-pick via \`/skills use\`.`,
							"warning"
						);
						return;
					}
					armSkillOneShot(hit);
				})
				.catch(() => {});
		},
		[apiAttachSelection, authorizeEditorPayload, runner, pushLocalNoticeTurn, armSkillOneShot, pickerPolicyIsCurrent, props.sessions]
	);

	useEffect(() => {
		const sink = props.chatApiSink;
		if (!sink) return;
		const api: ChatApi = {
			attachSelection: apiAttachSelection,
			quoteSelectionForAsk: apiQuoteSelectionForAsk,
			runSkillOnSelection: apiRunSkillOnSelection,
			runSnippetOnSelection: apiRunSnippetOnSelection,
		};
		sink.current = api;
		/* cold-reveal handshake: flush anything stashed while React was mounting */
		for (const fn of sink.pending) fn(api);
		sink.pending.length = 0;
		return () => {
			sink.current = null;
		};
	}, [props.chatApiSink, apiAttachSelection, apiQuoteSelectionForAsk, apiRunSkillOnSelection, apiRunSnippetOnSelection]);

	/** Copy: clipboard API first; restricted contexts (headless sim, older
	    webviews) fall back to execCommand on the still-live highlight */
		const copySelection = useCallback(() => {
			if (!selBar) return;
			const text = selBar.text;
			const done = () => {
				if (!mountedRef.current || selBarRef.current?.text !== text) return;
				setSelCopied(true);
				if (copyClearTimer.current !== null) window.clearTimeout(copyClearTimer.current);
				copyClearTimer.current = window.setTimeout(() => {
					copyClearTimer.current = null;
					if (!mountedRef.current) return;
					setSelBar((current) => {
						if (current?.text !== text) return current;
						selBarRef.current = null;
						return null;
					});
					setSelCopied(false);
					const selection = window.getSelection();
					const selectedText = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).toString() : "";
					if (selection && selectedText === text) selection.removeAllRanges();
				}, 900);
			};
		const write = navigator.clipboard?.writeText
			? navigator.clipboard.writeText(text)
			: Promise.reject(new Error("no async clipboard api"));
		write.then(done, () => {
			try {
				document.execCommand("copy");
			} catch {
				/* clipboard fully blocked — the label change just won't happen */
				return;
			}
			done();
		});
	}, [selBar]);

	/* automatic context compression (v0.1.17, Hermes Desktop parity): once per
	   run, when the estimated wire crosses the threshold share of the window,
	   fold the earliest messages into a ROLLING summary. Wire-only — the
	   conversation history on disk stays whole; a failed summarizer call just
	   keeps the run uncompressed (Notice), never blocks. Declared before
	   runAgent (TDZ) and reading live refs (lessons/12). */
	const maybeCompressConversation = useCallback(async (
		signal?: AbortSignal,
		effectiveSettings: OpenAgentSettings = settings
	): Promise<void> => {
		if (signal?.aborted || !effectiveSettings.compressionEnabled) return;
		const history = messagesRef.current;
		if (history.length < 2) return; // nothing meaningful to fold yet
		const conn = resolveConnection(effectiveSettings);
		const activeProvider = effectiveSettings.providers.find((p) => p.id === conn.providerId);
		if (!activeProvider?.baseUrl.trim()) return;
		/* drop stale caches first (history cut by /retry, /compress, /new), then
		   build the effective wire the provider would actually see */
		if (!validCompressionCache(history.length, compressionRef.current)) compressionRef.current = null;
		const base = applyCompressionCache(history, compressionRef.current);
		const advertised = await fetchAdvertisedContextLength(activeProvider, conn.model); // never throws (null = no metadata)
		const window = resolveContextWindow(effectiveSettings.modelContextLength, advertised);
		if (!shouldCompress(estimateTokens(base), window, effectiveSettings.compressionThreshold)) return;
		/* v0.1.175 (Hermes target_ratio): the verbatim tail must satisfy BOTH
		   floors — at least protectLastN messages AND at least
		   targetRatio × threshold × window tokens. min() keeps the larger tail
		   (start further left). */
		const startByMessages = pickProtectedStart(base, effectiveSettings.compressionProtectLastN);
		const keepTokens = Math.round(
			effectiveSettings.compressionTargetRatio * effectiveSettings.compressionThreshold * window
		);
		const startByTokens = pickTokenTailStart(base, keepTokens);
		const start = Math.min(startByMessages, startByTokens);
		if (start <= 0) return; // protected tail dominates — nothing safe to fold
		const region = base.slice(0, start);
		const prior = compressionRef.current;
		const pair = resolveAuxTask(effectiveSettings, "compression", { providerId: conn.providerId, model: conn.model });
		const auxProvider = effectiveSettings.providers.find((p) => p.id === pair.providerId);
		if (!auxProvider?.baseUrl.trim()) return;
		setLiveStatus("Compacting context…");
		/* v0.1.184 (owner: "tidak ada blok yang menjelaskan sedang compression"):
		   a visible system banner when compaction STARTS — the ThinkingBar
		   "Compacting context…" flashes too briefly to be seen because the
		   summarize call sits before the agent loop. This is the durable
		   in-transcript block; the end banner ("Context compacted — …") still
		   follows on success. */
		pushLocalNoticeTurn("Compacting context — folding earlier messages into a rolling summary.");
		try {
			/* non-recursive by construction: this runs BEFORE the agent loop,
			   outside any compression-aware path */
			const res = await chatCompletion(
				auxProvider,
				{ ...effectiveSettings, model: pair.model },
				[{ role: "user", content: buildSummaryPrompt(region, prior?.summary ?? null) }],
				null,
				{ signal }
			);
			if (signal?.aborted || messagesRef.current !== history) return;
			const summary = res.content.trim();
			if (!summary) throw new Error("the summarizer returned an empty summary");
			const upto = (prior?.upto ?? 0) + start;
			/* v0.1.133 (Hermes format_for_injection): the ACTIVE todo list is
			   re-injected across compression — appended onto the summary cache
			   so the wire-rendered note carries it; pending/in_progress only,
			   finished items would be re-done otherwise */
			const todoNote = formatTodoInjection(todoRef.current ?? []);
			compressionRef.current = {
				summary: todoNote ? `${summary}\n\n${todoNote}` : summary,
				upto,
				model: `${pair.providerId}/${pair.model}`,
				at: Date.now(),
			};
			pushLocalNoticeTurn(
				`Context compacted — ${upto} earlier messages folded into a summary (last ${effectiveSettings.compressionProtectLastN} kept verbatim). The saved history stays whole; this only shapes what the model sees.`
			);
		} catch (e) {
			if (signal?.aborted) return;
			new Notice(
				`Open Agent: context compaction failed — continuing uncompressed (${
					e instanceof Error ? e.message.split("\n")[0].slice(0, 90) : String(e)
				})`,
				6000
			);
		} finally {
			setLiveStatus(null);
		}
	}, [settings, pushLocalNoticeTurn]);

	/* title generation (v0.1.17): ONE cheap call names a brand-new session
	   after its first completed reply. Silent on any failure — the derived
	   first-message title simply stays. skip conditions: feature off, sessions
	   unsaved, title already set (loaded/generated), or not the first exchange */
	const maybeGenerateTitle = useCallback(async (
		sessionStore: SessionStore = props.sessions,
		signal?: AbortSignal,
		effectiveSettings: OpenAgentSettings = settings,
		owned?: SessionPersistSnapshot
	): Promise<void> => {
		if (signal?.aborted || !effectiveSettings.titleGenerationEnabled || !effectiveSettings.saveSessions || sessionTitleRef.current) return;
		const turns = turnsRef.current;
		const userTurns = turns.filter((t) => t.role === "user");
		if (userTurns.length !== 1) return;
		const textOf = (t: ConversationTurn): string =>
			t.parts
				.filter((p) => p.kind === "text")
				.map((p) => (p as { text: string }).text)
				.join(" ")
				.trim();
		const assistantFirst = turns.find((t) => t.role === "assistant" && textOf(t).length > 0);
		if (!assistantFirst) return;
		const conn = resolveConnection(effectiveSettings);
		const pair = resolveAuxTask(effectiveSettings, "titleGeneration", { providerId: conn.providerId, model: conn.model });
		const provider = effectiveSettings.providers.find((p) => p.id === pair.providerId);
		if (!provider?.baseUrl.trim()) return;
		try {
			const res = await chatCompletion(
				provider,
				{ ...effectiveSettings, model: pair.model },
				[
					{
						role: "user",
						content: `Write a short conversation title (3-7 words, no quotes, no trailing period) for this exchange.\nUser: ${textOf(userTurns[0]).slice(0, 400)}\nAssistant: ${textOf(assistantFirst).slice(0, 400)}\nTitle:`,
					},
				],
				null,
				{ signal }
			);
			if (signal?.aborted || turnsRef.current !== turns) return;
			const title = (res.content ?? "")
				.split("\n")[0]
				.replace(/^["'`*\s]+|["'`.\s]+$/g, "")
				.trim()
				.slice(0, 60);
			if (title.length < 2) return;
			sessionTitleRef.current = title;
			await persistSession(turns, sessionStore, owned ? { ...owned, title } : undefined); // keep payload + destination owned by this run
		} catch {
			/* titles are best-effort — stay silent */
		}
	}, [settings, persistSession, props.sessions]);

	/* v0.1.176 structured-memory retain: after a settled turn, one LLM call
	   distills the last exchange into typed facts (add/update/delete). Runs
	   every N turns (memoryEngineRetainEveryN) and skips trivial prompts.
	   Best-effort — any failure is silent, memory is never load-bearing. */
	const maybeRetainMemory = useCallback(
		async (
			sessionStore: SessionStore,
			signal: AbortSignal | undefined,
			effectiveSettings: OpenAgentSettings,
			allTurns: ConversationTurn[]
		): Promise<void> => {
			if (signal?.aborted || !effectiveSettings.memoryEngineEnabled || !effectiveSettings.memoryEnabled) return;
			const textOf = (t: ConversationTurn): string =>
				t.parts
					.filter((p) => p.kind === "text")
					.map((p) => (p as { text: string }).text)
					.join(" ")
					.trim();
			const userTurns = allTurns.filter((t) => t.role === "user");
			const lastUser = userTurns[userTurns.length - 1];
			const lastAssistant = [...allTurns].reverse().find((t) => t.role === "assistant");
			if (!lastUser || !lastAssistant) return;
			const userText = textOf(lastUser);
			if (!userText || isTrivialPrompt(userText)) return;
			retainCounterRef.current += 1;
			if (retainCounterRef.current % Math.max(1, effectiveSettings.memoryEngineRetainEveryN) !== 0) return;
			const turnText = `User: ${userText}\nAssistant: ${textOf(lastAssistant).slice(0, 2000)}`;
			const conn = resolveConnection(effectiveSettings);
			const provider = effectiveSettings.providers.find((p) => p.id === conn.providerId) ?? getActiveProvider(effectiveSettings);
			if (!provider?.baseUrl.trim()) return;
			const workspacePolicy = runner.snapshotWorkspacePolicy(effectiveSettings);
			const engine = runner.engineForPolicy(workspacePolicy);
			try {
				await engine.retain(
					turnText,
					(messages, sig) =>
						chatCompletion(provider, { ...effectiveSettings, model: conn.model }, messages as ChatMessage[], null, {
							signal: sig,
						}).then((res) => res.content ?? ""),
					{ signal }
				);
				/* v0.1.177 (Fase 2): after a successful retain, consolidate facts
				   → observations + mental models in the background. The store's
				   cadence gate (consolidationDue) throttles this — null = not
				   due yet, no LLM call. Silent on failure. */
				await engine.reflect(
					(messages, sig) =>
						chatCompletion(provider, { ...effectiveSettings, model: conn.model }, messages as ChatMessage[], null, {
							signal: sig,
						}).then((res) => res.content ?? ""),
					{ signal }
				);
			} catch {
				/* retain/reflect are best-effort — stay silent */
			}
		},
		[settings, runner]
	);

	const stopAgent = useCallback(() => {
		abortRef.current?.abort();
		headlessCommandAbortRef.current?.abort();
		headlessCommandAbortRef.current = null;
		/* Interactive tool promises must resolve as well as abort; otherwise a
		   scope reset can leave the old loop parked forever behind a removed card. */
		approvalRef.current?.resolve("deny");
		clarifyRef.current?.resolve("");
		approvalRef.current = null;
		clarifyRef.current = null;
		setApproval(null);
		setClarify(null);
	}, []);

	/* explicit user halt (■ button, Interrupt action, /stop): park the queue
	   too — desktop: an explicit Stop holds queued turns back until a resume
	   gesture (queue a fresh prompt, manual send, Resume, or empty the queue) */
	const haltAgent = useCallback(() => {
		parkQueue(sessionId);
		setQueueParked(true);
		stopAgent();
	}, [sessionId, stopAgent]);

	/* Write the active session's slice to state + disk (disk copy has image
	   payloads stripped — owner decision D2). Updaters are evaluated only
	   after the global queue mutex is acquired, so rapid edit/remove/enqueue
	   actions cannot resurrect stale entries. Emptying un-parks (desktop). */
	const persistQueue = useCallback(
		async (
			sid: string,
			update: QueuedPrompt[] | ((current: QueuedPrompt[]) => QueuedPrompt[] | null),
			options: { requireActive?: boolean } = {}
			): Promise<boolean> => queueTransactions.run(async () => {
					const targetSettings = settings;
				const targetPartition = sessionPartitionKey;
				const sourceSessionId = sessionIdRef.current;
				const requireActive = options.requireActive !== false;
				/* Never let a delayed handler claim or overwrite another scoped
				   queue. Legacy unowned entries may be claimed only while their
				   session is the active scoped session. */
					if (!queueMutationTargetIsCurrent({
						mounted: mountedRef.current,
						sameSettings: settingsRef.current === targetSettings,
						currentPartition: props.sessions.partitionKey(),
						targetPartition,
						sid,
						sourceSessionId,
						activeSessionId: sessionIdRef.current,
						requireActive,
						ownerPartition: targetSettings.promptQueueScopes[sid],
					})) return false;

					const activeTarget = sid === sessionIdRef.current && props.sessions.partitionKey() === targetPartition;
					const previousLiveEntries = activeTarget
						? queueRef.current
						: (targetSettings.promptQueue[sid] ?? []);
					const mutation = prepareQueueMutation(
						targetSettings,
						sid,
						targetPartition,
						previousLiveEntries,
						update
					);
					/* A null updater means its target vanished while waiting for the
					   mutex; never turn that stale action into a duplicate dispatch. */
					if (!mutation) return false;
					const { entries } = mutation;
				/* Optimistic UI is safe because auto-drain is gated by the pending
				   counter. Keep the live copy unsanitized so image data survives a
				   failed delete/edit transaction. */
				if (activeTarget && mountedRef.current) {
					queueRef.current = entries;
					setQueue(entries);
				}
				try {
					await props.saveSettings();
					} catch (e) {
						mutation.rollback();
						if (
							mountedRef.current &&
						settingsRef.current === targetSettings &&
						sid === sessionIdRef.current &&
						props.sessions.partitionKey() === targetPartition
					) {
						queueRef.current = previousLiveEntries;
						setQueue(previousLiveEntries);
						parkQueue(sid);
						setQueueParked(true);
						new Notice(`Open Agent: queue could not be saved — ${e instanceof Error ? e.message : String(e)}`);
					}
					return false;
				}
				const stale =
					settingsRef.current !== targetSettings ||
					props.sessions.partitionKey() !== targetPartition ||
					(requireActive && sessionIdRef.current !== sourceSessionId);
					if (stale) {
						/* The initiating view/scope disappeared during I/O. The global
						   transaction still owns this slice, so restore before unlocking. */
						mutation.rollback();
						if (settingsRef.current === targetSettings) {
							try { await props.saveSettings(); } catch { /* next startup keeps provenance and never guesses */ }
						}
						return false;
					}
				/* Force a post-commit render. If a run became idle during I/O, the
				   drain effect now observes the committed queue after the mutex exits. */
				if (activeTarget && mountedRef.current) {
					queueRef.current = entries;
					setQueue([...entries]);
				}
				if (entries.length === 0) {
					unparkQueue(sid);
					if (activeTarget && mountedRef.current) setQueueParked(false);
				}
					return true;
				}),
			[settings, props, sessionPartitionKey]
		);

	const deleteSession = useCallback((id: string) => {
		const scopedSessions = props.sessions.snapshot();
		void scopedSessions.remove(id).then(async () => {
			/* A stale deletion callback may finish after settings import or a
			   Workspace/profile switch. The session was removed from its captured
			   store, but its queue remains untouched unless that exact settings
			   object/partition is still active. */
			if (
				settingsRef.current === settings &&
				props.sessions.partitionKey() === scopedSessions.partitionKey()
			) await persistQueue(id, [], { requireActive: false });
			if (props.sessions.partitionKey() === scopedSessions.partitionKey()) void refreshSessions();
		}).catch((error) => {
			new Notice(`Open Agent: chat could not be deleted — ${error instanceof Error ? error.message : String(error)}`);
		});
	}, [persistQueue, props.sessions, refreshSessions, settings]);

	const newConversation = useCallback(() => {
		sessionLoadRequestRef.current++;
		stopAgent();
		messagesRef.current = [];
		setTurnsSynced([]);
		setUsage(null);
		setPendingFiles([]);
		const nid = newSessionId();
		sessionIdRef.current = nid;
		setSessionId(nid); // outgoing draft saved by the sessionId effect cleanup
		setInput(composerDrafts.get(nid) ?? "");
		setPanelOpen(false);
		setAttachNote(settings.includeActiveNote);
		overlayExplicitRef.current = false;
		setSessionOverlay(resolveOverlayKey(settings, null));
		compressionRef.current = null;
		todoRef.current = null; // v0.1.133: fresh chat, fresh plan
		skillContextRef.current = null; // never carry project-partitioned instructions across chats/scopes
		retainCounterRef.current = 0; // v0.1.176: structured-memory cadence restarts per chat
		setRecalledCount(0);
		historyBrowseRef.current.reset(); // v0.1.180: fresh chat, fresh browse cursor
		composerRef.current?.resetUndo();
		sessionTitleRef.current = null;
		sessionParentRef.current = null;
		setGoalSynced(null);
nudgeCounterRef.current = 0;
		tokenTotalsRef.current = { in: 0, out: 0 };
		setTokenTotals({ in: 0, out: 0 });
		window.setTimeout(() => composerRef.current?.focus(), 50);
	}, [stopAgent, settings, setTurnsSynced, setGoalSynced]);

	/* Profile switch (pill, settings tab, or command): the plugin already
	   rebound memory/skills/session folders — here we start a fresh
	   conversation and reload the now profile-scoped session list. */
	const prevProfileRef = useRef(settings.activeProfileId);
	useEffect(() => {
		if (prevProfileRef.current === settings.activeProfileId) return;
		prevProfileRef.current = settings.activeProfileId;
		newConversation();
		void refreshSessions();
		const p = settings.profiles.find((x) => x.id === settings.activeProfileId);
		new Notice(`Open Agent: switched to profile “${p?.name ?? "Default"}”.`);
	}, [settings.activeProfileId, settings.profiles, newConversation, refreshSessions]);

	/* Wire history may contain prior vault reads. Any effective exposure or
	   read-ceiling change starts a clean conversation before that history can
	   be sent under a different Workspace policy. Strict sessions are also
	   stored in this finer scope partition. */
	let workspaceScopeKey: string;
	try {
		workspaceScopeKey = workspacePolicyFor(settings, props.app.vault.configDir).scopeKey;
	} catch {
		/* Invalid Strict configuration must render fail-closed; runAgent shows
		   the actionable error. Keep a deterministic reset key without trying
		   to construct a permissive fallback policy. */
		workspaceScopeKey = `invalid:${JSON.stringify([
			settings.workspaceMode,
			settings.workspaceFolder,
			settings.workspaceExcludedFolders,
			settings.fileReadMaxChars,
			props.app.vault.configDir,
		])}`;
	}
	const prevWorkspaceScopeRef = useRef(workspaceScopeKey);
	useEffect(() => {
		if (prevWorkspaceScopeRef.current === workspaceScopeKey) return;
		prevWorkspaceScopeRef.current = workspaceScopeKey;
		newConversation();
		void refreshSessions();
		new Notice("Open Agent: Workspace scope changed — started a fresh conversation.");
	}, [workspaceScopeKey, newConversation, refreshSessions]);

	const loadConversation = useCallback(
		async (id: string) => {
			const policy = snapshotPickerPolicy();
			if (!policy) return;
			const sourceSessionId = sessionIdRef.current;
			const requestId = ++sessionLoadRequestRef.current;
			stopAgent();
			const scopedSessions = props.sessions.snapshot();
			const s = await scopedSessions.load(id);
			if (
				requestId !== sessionLoadRequestRef.current ||
				!pickerPolicyIsCurrent(policy) ||
				props.sessions.partitionKey() !== scopedSessions.partitionKey() ||
				sessionIdRef.current !== sourceSessionId
			) return;
			if (!s) {
				new Notice("Open Agent: session not found.");
				return;
			}
			sessionIdRef.current = s.id;
			setSessionId(s.id); // outgoing draft saved by the sessionId effect cleanup
			setInput(composerDrafts.get(s.id) ?? "");
			setTurnsSynced(s.turns);
			messagesRef.current = s.messages ?? [];
			compressionRef.current = s.compression ?? null;
			sessionTitleRef.current = s.title || null; // loaded titles persist verbatim on save
			sessionParentRef.current = s.parent ?? null;
			setGoalSynced(s.goal ?? null);
			todoRef.current = s.todos ? s.todos.map((t) => ({ ...t })) : null; // v0.1.133
			historyBrowseRef.current.reset(); // v0.1.180: loaded chat, fresh browse cursor
			composerRef.current?.resetUndo();
			overlayExplicitRef.current = !!s.personality;
			setSessionOverlay(
				s.personality && isOverlayKey(s.personality) ? s.personality : resolveOverlayKey(settings, null)
			);
			setPanelOpen(false);
			setUsage(null);
		},
		[props.sessions, sessionPartitionKey, stopAgent, setTurnsSynced, settings, setGoalSynced, snapshotPickerPolicy, pickerPolicyIsCurrent]
	);

	/* v0.1.163: leaf relocation keeps the open conversation alive — when this
	   view is recreated with a pending session, restore it once on mount
	   (same path as clicking a session in the panel). */
	useEffect(() => {
		if (props.initialSessionId) void loadConversation(props.initialSessionId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* Hermes /branch (+/fork): fork the settled chat into a NEW child session
	   seeded with everything so far — the parent stays byte-for-byte intact,
	   the child opens as the active chat, auto-named from the lineage
	   (desktop: session.branch RPC + branchTitle(siblings+1)). Child turn ids
	   are regenerated so future edits never alias parent parts. */
	const branchConversation = useCallback(async () => {
		if (running) {
			new Notice("Open Agent: wait for the current turn to settle — /branch works on an idle chat.");
			return;
		}
		const policy = snapshotPickerPolicy();
		if (!policy) return;
		const srcTurns = turnsRef.current;
		if (srcTurns.length === 0) {
			pushLocalNoticeTurn("Nothing to branch yet — send a message first.", "warning");
			return;
		}
		stopAgent();
		const scopedSessions = props.sessions.snapshot();
		const parentId = sessionIdRef.current;
		const firstUser = srcTurns.find((t) => t.role === "user");
		const parentTitle =
			sessionTitleRef.current ??
			(firstUser?.parts
				.filter((pp) => pp.kind === "text")
				.map((pp) => (pp as { text: string }).text)
				.join(" ")
				.slice(0, 60) || "Untitled session");
		const metas = await scopedSessions.list();
		if (
			!pickerPolicyIsCurrent(policy) ||
			props.sessions.partitionKey() !== scopedSessions.partitionKey() ||
			sessionIdRef.current !== parentId ||
			turnsRef.current !== srcTurns
		) return;
		const siblings = metas.filter((m) => m.parent === parentId).length;
		const branchTitle = `${parentTitle} — Branch ${siblings + 1}`;
		const copyTurns: ConversationTurn[] = srcTurns.map((t) => ({
			...t,
			id: nextTurnId(),
			parts: t.parts.map((pp) => ({ ...pp })),
			...(t.attachments ? { attachments: t.attachments.map((at) => ({ ...at })) } : {}),
		}));
		const branchId = newSessionId();
		const session: Session = {
			id: branchId,
			title: branchTitle,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			model: resolveConnection(settings).model,
			turnCount: copyTurns.length,
			turns: copyTurns,
			messages: messagesRef.current.map((m) => ({ ...m })),
			personality: sessionOverlay ?? undefined,
			compression: compressionRef.current ?? undefined,
			parent: parentId,
			...(todoRef.current?.length ? { todos: todoRef.current.map((t) => ({ ...t })) } : {}), // v0.1.133
		};
		await scopedSessions.save(session);
		if (
			!pickerPolicyIsCurrent(policy) ||
			props.sessions.partitionKey() !== scopedSessions.partitionKey() ||
			sessionIdRef.current !== parentId ||
			turnsRef.current !== srcTurns
		) return;
		void refreshSessions();
		/* open the child; the parent chat is left exactly where it was */
		sessionLoadRequestRef.current++;
		sessionIdRef.current = branchId;
		setSessionId(branchId); // outgoing draft saved by the sessionId effect cleanup
		setInput(composerDrafts.get(branchId) ?? "");
		setTurnsSynced(copyTurns);
		messagesRef.current = session.messages ?? [];
		compressionRef.current = session.compression ?? null;
		todoRef.current = session.todos ?? null; // v0.1.133: the child inherits the plan
		sessionTitleRef.current = branchTitle;
		sessionParentRef.current = parentId;
		overlayExplicitRef.current = !!session.personality;
		setUsage(null);
		pushLocalNoticeTurn(`Branched into “${branchTitle}” — the parent chat stays untouched.`);
	}, [running, settings, sessionOverlay, props, stopAgent, pushLocalNoticeTurn, setTurnsSynced, refreshSessions, setUsage, snapshotPickerPolicy, pickerPolicyIsCurrent]);

	/* ---------------- the agent run ---------------- */

	/* v0.1.58: for write_note/edit_note the approval gets a REAL preview —
	   same planner as the tool, same path resolver, original read on the
	   spot; any failure falls back to the classic blind card (fail-open
	   toward the old behavior, never blocks the gate) */
	const buildApprovalPreview = useCallback(
			async (
				req: ApprovalRequest,
				workspacePolicy: WorkspacePolicy,
				effectiveSettings: OpenAgentSettings = settings
			): Promise<{ preview?: WritePreview & { mtime: number | null }; previewError?: string } | null> => {
				if (req.toolName !== "write_note" && req.toolName !== "edit_note") return null;
				try {
					const resolved = resolveWritePath(effectiveSettings, (req.args as { path?: unknown })?.path, workspacePolicy);
				const af = props.app.vault.getAbstractFileByPath(resolved);
				const isFile = af instanceof TFile;
				const original = isFile ? await props.app.vault.read(af as TFile) : null;
				const plan = req.toolName === "write_note" ? planWrite(req.args, resolved, original) : planEdit(req.args, resolved, original);
				if (plan.ok === false) return { previewError: plan.error };
				return { preview: { ...plan.preview, mtime: isFile ? (af as TFile).stat.mtime : null } };
			} catch (e) {
				return { previewError: e instanceof Error ? e.message : String(e) };
			}
		},
		[props.app, settings]
	);

	const runAgent = useCallback(
		/* filesOverride: explicit attachment set (queue drain) — the caller is a
		   stale-closure risk for pendingFiles otherwise (lessons/12).
		   displayText (Hermes skill_invocation parity): the bubble renders the
		   invocation the user typed, while the MODEL receives rawPrompt — the
		   expanded skill scaffolding must never render (desktop renders
		   `display` / skillInvocationText instead). */
		async (
			rawPrompt: string,
			filesOverride?: UploadedFile[],
			displayText?: string,
			options?: { settingsOverride?: OpenAgentSettings }
		) => {
			let workspacePolicy: WorkspacePolicy;
			try {
				/* One immutable snapshot owns every vault surface for this run. */
				workspacePolicy = runner.snapshotWorkspacePolicy();
			} catch (e) {
				new Notice(`Open Agent: ${e instanceof Error ? e.message : String(e)}`);
				return;
			}
			if (prevWorkspaceScopeRef.current !== workspacePolicy.scopeKey) {
				prevWorkspaceScopeRef.current = workspacePolicy.scopeKey;
				newConversation();
				void refreshSessions();
				new Notice("Open Agent: Workspace scope changed — cleared the staged prompt and conversation; review and send again.");
				return;
			}
			/* Pin the profile/Workspace session destination before any await.
			   saveSettings() may rebind the shared store while this run is alive. */
			const sessionStore = props.sessions.snapshot();
			const runSessionId = sessionIdRef.current;
			/* Provider/MoA/compressor inputs are part of the immutable request.
			   Settings are plain persisted data; clone before any await so a live
			   Settings save cannot reroute later iterations to another model. A
			   /moa one-shot supplies an in-memory override instead of mutating and
			   restoring persisted global settings around an await boundary. */
			const runSettings = JSON.parse(JSON.stringify(options?.settingsOverride ?? settings)) as OpenAgentSettings;
			const runConnection = resolveConnection(runSettings);
			const candidateFiles = filesOverride ?? pendingFiles;
			const effFiles = candidateFiles.filter((f) =>
				!f.path || (workspacePolicy.allowsPath(f.path) && (f.kind === "image" || f.content.length <= workspacePolicy.fileReadMaxChars))
			);
			if (effFiles.length < candidateFiles.length) {
				new Notice(`Open Agent: excluded ${candidateFiles.length - effFiles.length} vault attachment(s) outside this workspace or above its file-read limit.`);
			}
			const provider = runSettings.providers.find((p) => p.id === runConnection.providerId) ?? getActiveProvider(runSettings);
			if (!provider || !provider.baseUrl) {
				new Notice("Open Agent: configure a provider first (Settings → Open Agent → Providers).");
				props.openSettings();
				return;
			}
			if (!runConnection.model) {
				new Notice("Open Agent: pick a model first (Settings → Open Agent → Model).");
				props.openSettings();
				return;
			}

		/* Copilot prompt tokens (v0.1.78): `{}` → the live editor selection at
		   send time; {[[Note]]} / {activeNote} / {#tag1, #tag2} strip out of
		   the text and ride the SAME [Attached file] pipeline as @refs
		   below. Unresolvable tokens are NAMED in a Notice — never
		   silently dropped (the tips in the command modal stay honest). */
		let liveSelection: string | null = null;
		try {
			const selectionFile = props.app.workspace.getActiveFile();
			if (selectionFile && workspacePolicy.allowsPath(selectionFile.path)) {
				liveSelection = props.app.workspace.activeEditor?.editor?.getSelection?.() || null;
			}
		} catch {
			/* sim mock without an editor surface */
		}
		const tok = extractPromptTokens(rawPrompt, liveSelection);
		const promptText = tok.text;
		const tokenFiles: UploadedFile[] = [];
		if (tok.activeNote || tok.titles.length > 0 || tok.tags.length > 0) {
			const mdVaultFiles = props.app.vault.getFiles().filter((f) => workspacePolicy.allowsPath(f.path) && f.path.toLowerCase().endsWith(".md"));
			const mdPaths = mdVaultFiles.map((f) => f.path);
			const alreadyNamed = new Set(effFiles.map((f) => f.name));
			const wanted: string[] = [];
			const missing: string[] = [];
			if (tok.activeNote) {
				const active = props.app.workspace.getActiveFile();
				/* attachNote ON: the active note ALREADY rides as the
				   [Attached note] prefix below — attaching it again here
				   would send the same note twice; the composer's active-note
				   chip is the honest signal. NOT a miss. */
				if (active && workspacePolicy.allowsPath(active.path) && active.path.toLowerCase().endsWith(".md")) {
					if (!alreadyNamed.has(active.path) && !attachNote) wanted.push(active.path);
				} else missing.push("{activeNote}");
			}
			for (const title of tok.titles) {
				const hit = resolveTitleToPath(title, mdPaths);
				if (hit) {
					if (!alreadyNamed.has(hit) && !wanted.includes(hit)) wanted.push(hit);
				} else missing.push(`{[[${title}]]}`);
			}
			if (tok.tags.length > 0) {
				const matched: string[] = [];
				for (const f of mdVaultFiles) {
					const fm = props.app.metadataCache.getFileCache(f)?.frontmatter;
					if (fm && noteMatchesWantedTags(fm.tags, tok.tags)) matched.push(f.path);
				}
				matched.sort();
				if (matched.length === 0) {
					missing.push(`{#${tok.tags.join(", #")}}`);
				} else {
					/* a tag sweep can match half the vault — mirror the composer
					   cap (24) instead of drowning the context window */
					const fresh = matched.filter((p) => !alreadyNamed.has(p) && !wanted.includes(p));
					const room = Math.max(0, 24 - effFiles.length - wanted.length);
					for (const p of fresh.slice(0, room)) wanted.push(p);
					if (fresh.length > room) {
						new Notice(
							`Open Agent: {#${tok.tags.join(", #")}} matched ${matched.length} notes — attached the first ${room} (cap 24).`
						);
					}
				}
			}
			const oversized: string[] = [];
			const read = await Promise.all(
				wanted.map(async (resolved) => {
					const file = props.app.vault.getAbstractFileByPath(resolved);
					if (!(file instanceof TFile)) return null;
					const content = await props.app.vault.read(file);
					if (content.length > workspacePolicy.fileReadMaxChars) {
						oversized.push(resolved);
						return null;
					}
					return {
						id: `tok-${resolved}`,
						name: resolved,
						content,
						size: content.length,
						path: resolved,
						kind: "text" as const,
					} satisfies UploadedFile;
				})
			);
			tokenFiles.push(...read.filter((x): x is Exclude<(typeof read)[number], null> => x !== null));
			if (oversized.length > 0) {
				new Notice(`Open Agent: skipped ${oversized.length} token note(s) above the ${workspacePolicy.fileReadMaxChars.toLocaleString()} character file-read limit.`);
			}
			if (missing.length > 0) {
				new Notice(
					`Open Agent: couldn't resolve prompt token${missing.length > 1 ? "s" : ""}: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", …" : ""} — ${missing.length > 1 ? "they" : "it"} stayed out of the message.`
				);
			}
		}

		/* `@[[path]]` inline references → same [Attached file] pipeline as [+] */
		let atFiles: UploadedFile[] = [];
		const atRefs = extractAtRefs(promptText);
			if (atRefs.length) {
				const vaultPaths = props.app.vault.getFiles().filter((f) => workspacePolicy.allowsPath(f.path)).map((f) => f.path);
				const pendingNames = new Set([...effFiles, ...tokenFiles].map((f) => f.name));
				const seen = new Set<string>();
				const unresolved: string[] = [];
				const toRead: { path: string; resolved: string }[] = [];
				for (const { ref, resolved } of resolveAtRefs(atRefs, vaultPaths)) {
					if (!resolved) {
						unresolved.push(`@[[${ref.path}]]`);
						continue;
					}
					if (seen.has(resolved) || pendingNames.has(resolved)) continue;
					seen.add(resolved);
					toRead.push({ path: ref.path, resolved });
				}
				const oversizedAt: string[] = [];
				const read = await Promise.all(
					toRead.map(async ({ resolved }) => {
						const file = props.app.vault.getAbstractFileByPath(resolved);
						if (!(file instanceof TFile)) return null;
						const content = await props.app.vault.read(file);
						if (content.length > workspacePolicy.fileReadMaxChars) {
							oversizedAt.push(resolved);
							return null;
						}
						return {
							id: `at-${resolved}`,
							name: resolved,
							content,
							size: content.length,
							path: resolved,
							kind: "text" as const,
						} satisfies UploadedFile;
					})
				);
				atFiles = read.filter((x): x is Exclude<(typeof read)[number], null> => x !== null);
				if (oversizedAt.length) {
					new Notice(`Open Agent: skipped ${oversizedAt.length} @-reference(s) above the ${workspacePolicy.fileReadMaxChars.toLocaleString()} character file-read limit.`);
				}
				if (unresolved.length) {
					new Notice(
						`Open Agent: couldn't resolve ${unresolved.length} @-reference${unresolved.length > 1 ? "s" : ""} (${unresolved
							.slice(0, 2)
							.join(", ")}${unresolved.length > 2 ? ", …" : ""})`
					);
				}
			}

			const attachList = [...effFiles, ...tokenFiles, ...atFiles];
			/* vision path: images ride as image_url parts when the model can see;
			   otherwise they degrade to a path reference the agent can embed */
			const imageFiles = attachList.filter((f) => f.kind === "image" && f.dataUrl);
			const visionOk =
				imageFiles.length > 0 && provider && runConnection.model ? await modelSupportsVision(provider, runConnection.model) : false;

			const attachBlocks = (vision: boolean): string =>
				attachList
					.map((f) =>
						f.kind === "image"
							? `[Attached image: ${f.path ?? f.name}]${
									vision
										? " (sent visually to the model.)"
										: `\n(Image in the vault — not visually readable in this mode; treat as a path reference. You may embed it in notes as ![[${f.path ?? f.name}]].)`
								}`
							: `[Attached file: ${f.name}]\n\`\`\`\n${f.content}\n\`\`\``
					)
					.join("\n\n");
			const composePrompt = (vision: boolean): string => {
				let p = promptText;
				if (attachList.length) p = `${attachBlocks(vision)}\n\n${p}`;
				return p;
			};

			let prompt = composePrompt(visionOk);
			let notePrefix = "";
			let noteAttachMeta: { name: string; size: number; path: string } | null = null;
			if (attachNote) {
				const active = await runner.readActiveNote(workspacePolicy.fileReadMaxChars, workspacePolicy);
				if (active) {
					notePrefix = `[Attached note: ${active.path}]\n\`\`\`markdown\n${active.content}\n\`\`\`\n\n`;
					noteAttachMeta = { name: active.path.split("/").pop() ?? active.path, size: 0, path: active.path };
				}
			}
			/* display-only bookkeeping for the sent bubble: the file contents
			   above already ride the prompt; these metadata chips exist so the
			   history shows what was sent (owner ask 2026-07-22) */
			const sentAttachments: ConversationTurn["attachments"] = [
				...(noteAttachMeta ? [noteAttachMeta] : []),
				...attachList.map((f) => ({
					name: f.name,
					size: f.size,
					...(f.kind ? { kind: f.kind } : {}),
					...(f.path ? { path: f.path } : {}),
				})),
			];
			/* one-shot skill context (slash `/skills read|use`) — consumed here so
			   the retry fallback keeps it too, and the next message starts clean */
			const skillPrefix = skillContextRef.current ? skillContextRef.current + "\n\n" : "";
			skillContextRef.current = null;
			/* text the user message carries in each mode; the vision retry swaps in fallbackPrompt */
			const visionPrompt = skillPrefix + notePrefix + prompt;
			const fallbackPrompt = skillPrefix + notePrefix + composePrompt(false);

				/* Vault reads above are local preflight work. Before committing UI or
				   sending any content, prove that neither Workspace nor the
				   profile/session partition changed while those awaits were open. */
				let currentScopeKey: string;
				try {
					currentScopeKey = runner.snapshotWorkspacePolicy().scopeKey;
				} catch {
					new Notice("Open Agent: Workspace configuration changed during send — review and send again.");
					return;
				}
					if (
						!mountedRef.current ||
						currentScopeKey !== workspacePolicy.scopeKey ||
					props.sessions.partitionKey() !== sessionStore.partitionKey() ||
					sessionIdRef.current !== runSessionId
				) {
					new Notice("Open Agent: Workspace, profile, or conversation changed during send — cleared the stale request; review and send again.");
					return;
				}

				const userTurn: ConversationTurn = {
					id: nextTurnId(),
				role: "user",
				parts: [{ kind: "text", text: displayText ?? promptText }],
				timestamp: Date.now(),
				...(sentAttachments.length ? { attachments: sentAttachments } : {}),
			};
			const assistantTurn: ConversationTurn = { id: nextTurnId(), role: "assistant", parts: [], timestamp: Date.now() };
			assistantTurnRef.current = assistantTurn.id;

			const withUser = [...turnsRef.current, userTurn];
			setTurnsSynced([...withUser, assistantTurn]);
			messagesRef.current.push(
				visionOk
					? {
							role: "user",
							content: [
								{ type: "text" as const, text: visionPrompt },
								...imageFiles.map((f) => ({ type: "image_url" as const, image_url: { url: f.dataUrl! } })),
							],
						}
					: { role: "user", content: visionPrompt }
			);
				setRunning(true);
				setUsage(null);
				setLiveStatus(null);

				const abort = new AbortController();
				abortRef.current = abort;
				/* Follow-ups must start only after this controller's finally block has
				   released ownership; otherwise an older finally can clear a newer run. */
				let pendingSteerFollowUp: {
				prompt: string;
				workspacePolicy: WorkspacePolicy;
				sessionPartition: string;
				sessionId: string;
			} | null = null;
					let runOwnedTurns = turnsRef.current;
					let runSessionMessages = messagesRef.current;
					let runTitle = sessionTitleRef.current;
				let runCompression = compressionRef.current;
				const runGoal = goalRef.current;
				let runTodos = todoRef.current?.map((item) => ({ ...item })) ?? null;
			const runTodoApi: TodoApi = {
				read: () => (runTodos ?? []).map((item) => ({ ...item })),
				write: (items) => {
					runTodos = items.map((item) => ({ ...item }));
					if (!abort.signal.aborted) todoRef.current = runTodos;
				},
			};
			const initialSessionState: SessionPersistSnapshot = {
				enabled: runSettings.saveSessions,
				id: runSessionId,
					title: runTitle,
					model: runConnection.model,
						messages: runSessionMessages,
						personality: sessionOverlay,
					compression: runCompression,
					parent: sessionParentRef.current,
					goal: runGoal,
				todos: runTodos,
			};
			const currentSessionState = (): SessionPersistSnapshot => ({
				...initialSessionState,
					title: runTitle,
						messages: runSessionMessages,
						compression: runCompression,
					goal: runGoal,
				todos: runTodos,
			});

			try {
				nudgeCounterRef.current += 1;
				const nudgeDue = runSettings.memoryNudgeInterval > 0 && nudgeCounterRef.current >= runSettings.memoryNudgeInterval;
				if (nudgeDue) nudgeCounterRef.current = 0;

				/* feedback → learning signal (v0.1.54, own invention — Hermes
				   reactions are display-only): a down-rated PREVIOUS assistant
				   reply reflects on this turn; the fresh pending assistant turn
				   is already in turnsRef here — excluded by id */
				const prevAssistant = [...turnsRef.current].reverse().find((t) => t.role === "assistant" && t.id !== assistantTurnRef.current);
				const feedbackDue = prevAssistant ? feedbackOf(prevAssistant.reaction) === "down" : false;

				/* Terminal schemas are opt-in at this one owned interactive path;
				   all generic/headless/delegated runner paths stay terminal-free. */
				const interactiveTools = await runner.getToolsWithMcp(runSettings, { interactiveTerminal: true });
				/* v0.1.176 structured-memory recall: pure-fusion (BM25 + entity +
				   temporal + trust), zero latency — no LLM in this phase. Never
				   breaks the run. */
				setRecalledCount(0);
				let recalledMemory: string | null = null;
				if (runSettings.memoryEngineEnabled && runSettings.memoryEnabled) {
					const q = promptText.trim();
					if (q && !isTrivialPrompt(q)) {
						try {
							const engine = runner.engineForPolicy(workspacePolicy);
							/* v0.1.178 (Fase 3): semantic recall when an embedding
							   model is configured — else pure fusion. Embedding is
							   optional and must never break the run. */
							let embed: ((texts: string[]) => Promise<(number[] | null)[] | null>) | undefined;
							const embedModel = runSettings.memoryEngineEmbedModel.trim();
							/* v0.1.152 (owner 2026-08-24): embedding carries its OWN provider
							   pin, so a local embedding server can serve recall while chat runs
							   on a cloud model. Empty pin = follow the chat provider, which is
							   exactly the pre-v0.1.152 behaviour. */
							const embedProvider = runSettings.memoryEngineEmbedProviderId
								? runSettings.providers.find((p) => p.id === runSettings.memoryEngineEmbedProviderId) ?? provider
								: provider;
							if (embedModel && embedProvider?.baseUrl.trim()) {
								embed = (texts) => embedTexts(embedProvider, embedModel, texts);
							}
							const [facts, obs] = await Promise.all([
								engine.search(q, runSettings.memoryEngineRecallMax, embed),
								engine.searchObservations(q, 4, embed),
							]);
							recalledMemory = buildRecallBlock(facts, obs);
							if (recalledMemory) setRecalledCount(facts.length + obs.length);
						} catch {
							recalledMemory = null; // recall must never break the run
						}
					}
				}
				const system = await runner.assembleSystemPrompt(
					nudgeDue,
					runSettings.includeActiveNote,
					sessionOverlay,
					feedbackDue,
					recalledMemory,
					interactiveTools,
					workspacePolicy,
					runSettings
				);
				/* context compression (v0.1.17): one check per run, before the loop */
					await maybeCompressConversation(abort.signal, runSettings);
					if (abort.signal.aborted) throw new Error("Run interrupted.");
						runSessionMessages = messagesRef.current;
						runCompression = compressionRef.current;
				/* MoA facade (v0.1.30, Hermes moa_loop MoAClient parity): an
				   active preset routes every iteration through the advisor
				   fan-out + guidance attach; the preset's aggregator acts. The
				   feed buffer resets per run — events only fire on the
				   iteration that actually fans out. */
				let moaEngine: MoaTurnEngine | null = null;
				const moaRunCfg = runSettings.moa ? normalizeMoaConfig(runSettings.moa) : null;
				if (moaRunCfg?.active_preset && moaRunCfg.presets[moaRunCfg.active_preset]) {
					moaFeedRef.current = "";
					moaEngine = new MoaTurnEngine({
						presetName: moaRunCfg.active_preset,
						preset: moaRunCfg.presets[moaRunCfg.active_preset],
						settings: runSettings,
						signal: abort.signal,
						emit: (e) => {
							if (!abort.signal.aborted) moaEmit(assistantTurn.id, e);
						},
					});
				}
				const runCtx = runner.makeContext(workspacePolicy, runSettings, {
					kind: "interactive-chat",
					sessionId: runSessionId,
					runId: assistantTurn.id,
				});
				runCtx.todo = runTodoApi; // run-owned: late tool callbacks cannot mutate a replacement chat
				const loop = new AgentLoop(runSettings, interactiveTools, runCtx, moaEngine);
				loopRef.current = loop;

				const aid = assistantTurn.id;
				const captureOwnedTurns = (): void => {
					if (!abort.signal.aborted) runOwnedTurns = turnsRef.current;
				};
				/* compression renders wire-only: history stays whole, the provider
				   sees the rolling summary + the uncompressed tail */
				const runMessages = (): ChatMessage[] => [
					{ role: "system", content: system },
					...applyCompressionCache(messagesRef.current, compressionRef.current),
				];
				/* Each provider attempt owns only the parts appended since its
				   checkpoint. Retry, failover and stream→buffered fallback restore
				   the checkpoint before a replacement emits, while committed tool
				   iterations from earlier requests remain intact. */
				let attemptCheckpoint: TurnPart[] | null = null;
				const cloneParts = (parts: TurnPart[]): TurnPart[] => parts.map((part) => ({ ...part }));
				const events: AgentLoopEvents = {
					signal: abort.signal,
					onAttemptStart: () => {
						if (abort.signal.aborted) return;
						const turn = turnsRef.current.find((item) => item.id === aid);
						attemptCheckpoint = cloneParts(turn?.parts ?? []);
					},
					onAttemptDiscard: () => {
						if (abort.signal.aborted || !attemptCheckpoint) return;
						const restore = cloneParts(attemptCheckpoint);
						patchTurn(aid, () => restore);
						captureOwnedTurns();
						reasoningStartRef.current = 0;
						setLiveStatus("Waiting for the model…");
					},
					onAttemptCommit: () => {
						attemptCheckpoint = null;
					}, 
					onToken: (t) => {
						if (abort.signal.aborted) return;
						setLiveStatus(null);
						finalizeReasoning(aid);
						appendText(aid, t);
						captureOwnedTurns();
					},
					onReasoning: (t) => {
						if (abort.signal.aborted) return;
						setLiveStatus(null);
						appendReasoning(aid, t);
						captureOwnedTurns();
					},
					// token-free window while the provider chews on the next prompt
					onIterationStart: () => {
						if (!abort.signal.aborted) setLiveStatus("Waiting for the model…");
					},
					// live preview: a tool call is streaming in — show it immediately
					onToolCallPending: (id, name, args) => {
						if (abort.signal.aborted) return;
						setLiveStatus(null);
						finalizeReasoning(aid);
						toolPending(aid, id, name, args);
						captureOwnedTurns();
					},
					onToolStart: (id, name, args) => {
						if (abort.signal.aborted) return;
						setLiveStatus(null);
						finalizeReasoning(aid);
						toolStart(aid, id, name, args);
						captureOwnedTurns();
					},
					onToolResult: (id, name, status, res) => {
						if (abort.signal.aborted) return;
						toolResult(aid, id, status, res);
						captureOwnedTurns();
					},
					onSteerApplied: (id, marker) => {
						if (abort.signal.aborted) return;
						applySteerMarker(id, marker);
						captureOwnedTurns();
					},
				onDelegateProgress: (done, total) => {
					if (abort.signal.aborted) return;
					/* v0.1.135 (their 🔀 spinner line): batch join progress in the
					   status line — cleared by the next tool/token event */
					const left = total - done;
					setLiveStatus(left > 0 ? `Delegating… ${left} task${left === 1 ? "" : "s"} remaining` : null);
				},
					onFailover: (info) => {
						if (abort.signal.aborted) return;
						finalizeReasoning(aid);
						const reason = info.reason.split("\n")[0].slice(0, 90);
						appendMarker(aid, `Primary failed (${reason}) — switched to ${info.to}`);
						captureOwnedTurns();
						new Notice(`Open Agent: primary model failed — switched to ${info.to}`, 7000);
					},
					onUsage: (u) => {
						if (abort.signal.aborted) return;
						setUsage(u);
						tokenTotalsRef.current = {
							in: tokenTotalsRef.current.in + u.promptTokens,
							out: tokenTotalsRef.current.out + u.completionTokens,
						};
						setTokenTotals({ ...tokenTotalsRef.current });
					},
					requestApproval: (req) =>
						new Promise<ApprovalDecision>((resolve) => {
							/* idempotent settle — the timeout and the buttons share
							   it, so a late timer can never double-resolve */
							let settled = false;
							let timer: number | null = null;
							const finish = (d: ApprovalDecision): void => {
								if (settled) return;
								settled = true;
								if (timer !== null) {
									window.clearTimeout(timer);
									timer = null;
								}
								resolve(d);
							};
							void buildApprovalPreview(req, workspacePolicy, runSettings).then((extra) => {
								if (abort.signal.aborted) {
									finish("deny");
									return;
								}
									props.onNotification?.({ kind: "approvalRequired", contextId: runSessionId });
									const pendingApproval: ApprovalPending = extra
										? { req, resolve: finish, workspacePolicy, settings: runSettings, ...extra, stale: false }
										: { req, resolve: finish, workspacePolicy, settings: runSettings };
									approvalRef.current = pendingApproval;
									setApproval(pendingApproval);
									/* v0.1.147 approval timeout (Hermes approvals.timeout):
									   auto-deny after N seconds so a missed prompt never
									   hangs the run forever. 0 = wait forever. */
									const timeoutSec = runSettings.approvalTimeoutSec;
									if (timeoutSec > 0) {
										timer = window.setTimeout(() => {
											if (approvalRef.current === pendingApproval) {
												approvalRef.current = null;
												setApproval(null);
												finish("deny");
												new Notice(`Open Agent: approval for ${req.toolName} timed out after ${timeoutSec}s — denied.`);
											}
										}, timeoutSec * 1000);
										pendingApproval.timeoutHandle = timer;
									}
								}).catch(() => finish("deny"));
							}),
					/* Hermes clarify (v0.1.80): the chat IS the platform callback —
					   open the question card and park the loop until a click */
					requestClarify: (req) =>
						new Promise<ClarifyAnswer>((resolve) => {
							if (abort.signal.aborted) {
								resolve("");
								return;
							}
								props.onNotification?.({ kind: "inputRequired", contextId: runSessionId });
								const pendingClarify = { req, resolve, workspacePolicy };
								clarifyRef.current = pendingClarify;
								setClarify(pendingClarify);
						}),
				};

				let result;
				try {
					result = await loop.run(runMessages(), events);
				} catch (err) {
					if (abort.signal.aborted) throw err;
					/* heuristic said vision but the model disagrees (HTTP 400) →
					   flip the cache and resend once as path references */
					if (
						visionOk &&
						err instanceof ProviderHttpError &&
						err.status === 400 &&
						/image|vision|modality|multimodal/i.test(err.message ?? "")
					) {
						cacheVisionSupport(provider.id, runConnection.model, false);
						new Notice("Open Agent: model rejected image input — resending it as a path reference.", 6000);
						const last = messagesRef.current[messagesRef.current.length - 1];
						if (last?.role === "user") last.content = fallbackPrompt;
						result = await loop.run(runMessages(), events);
					} else {
						throw err;
					}
					}

					if (abort.signal.aborted) throw new Error("Run interrupted.");
					finalizeReasoning(aid);
				/* One canonical Mermaid representation feeds both the durable
				   transcript and every later UI/editor sink. Do this only after the
				   attempt commits so a partial stream is never made canonical/persisted. */
				patchTurn(aid, (parts) =>
					parts.map((part) => (part.kind === "text" ? { ...part, text: canonicalizeAssistantOutput(part.text) } : part))
				);
				const canonicalMessages = result.messages.map((message) =>
					message.role === "assistant" && typeof message.content === "string"
						? { ...message, content: canonicalizeAssistantOutput(message.content) }
						: message
				);
				messagesRef.current.push(...canonicalMessages.filter((m) => m.role !== "system"));

				if (result.iterations >= runSettings.maxIterations && result.messages.some((m) => m.tool_calls)) {
					appendText(aid, `\n\n_(Stopped: reached the ${runSettings.maxIterations}-iteration cap.)_`);
				}

				/* The provider ended the reply with finish_reason "length" — the
				   user otherwise can't tell a clean finish from a cut-off one.
				   Name the most likely cap so they know where to raise it. */
				if (result.finishReason === "length") {
					const hint =
						runSettings.maxTokens > 0
							? `the reply hit the "Max tokens" cap (${runSettings.maxTokens}) — raise it in Settings → Open Agent → Model if you need longer replies`
							: `the provider cut the reply at a length/context limit (the plugin's "Max tokens" is unlimited, so check the provider's own settings)`;
					appendText(aid, `\n\n_(Stopped early: ${hint}. finish_reason: length.)_`);
				}

					stripPendingTools(aid); // previews that never reached execution must not persist
					captureOwnedTurns();

					// Persist from this run's payload and immutable destination.
					await persistSession(runOwnedTurns, sessionStore, currentSessionState());
				/* title generation after a successful first exchange (silent) */
					await maybeGenerateTitle(sessionStore, abort.signal, runSettings, currentSessionState());
					if (abort.signal.aborted) return;
					runTitle = sessionTitleRef.current;
					/* v0.1.176 structured-memory retain: fire-and-forget after the
					   turn — the engine distills the exchange into typed facts.
					   A failure here is silent (memory is best-effort). */
					void maybeRetainMemory(sessionStore, abort.signal, runSettings, runOwnedTurns);
			/* /steer leftover (run_agent.py → cli.py: "Delivering leftover
			   /steer as next turn"): the model settled while a steer was
			   still pending — deliver it as the next ordinary user turn.
			   The normal path re-runs here, so the goal judge evaluates
			   THAT turn like any other. A hard interrupt already dropped
			   the stash in the loop, so this only fires on clean settles. */
				if (result.pendingSteer) {
					pushLocalNoticeTurn(`Delivering leftover /steer as next turn: “${steerPreview(result.pendingSteer, 60)}”`);
					pendingSteerFollowUp = {
						prompt: result.pendingSteer,
						workspacePolicy,
						sessionPartition: sessionStore.partitionKey(),
						sessionId: runSessionId,
					};
				} else {
					/* standing goal: judge the finished turn, continue the loop if
					   the goal is still open (hermes_cli/goals.py — after ANY turn).
					   Completion is terminal only when no continuation was scheduled. */
					const goalContinued = await continueGoalRef.current({
						settings: runSettings,
						signal: abort.signal,
						sessionStore,
						sessionState: currentSessionState(),
						workspacePolicy,
					});
					if (!goalContinued && !abort.signal.aborted) {
						props.onNotification?.({ kind: "turnDone", contextId: runSessionId });
					}
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (!abort.signal.aborted) {
					appendText(assistantTurn.id, `\n\n**Error:** ${msg}`);
					new Notice(`Open Agent error: ${msg.slice(0, 120)}`);
					/* Native copy is centralized and never receives the raw error. */
					props.onNotification?.({ kind: "turnError", contextId: runSessionId });
				}
					if (runSettings.debugMode) console.error("[Open Agent] run failed:", err);
					if (!abort.signal.aborted) {
						stripPendingTools(assistantTurn.id);
						runOwnedTurns = turnsRef.current;
					}
					// Save only this run's payload into its immutable destination.
					try {
						await persistSession(
							runOwnedTurns,
							sessionStore,
								currentSessionState()
						);
				} catch {
					/* never mask the original run error */
				}
			} finally {
					/* A late old run may finish after a replacement controller exists.
					   Only the controller that still owns the refs may clear global UI. */
						if (abortRef.current === abort) {
							abortRef.current = null;
							loopRef.current = null;
							approvalRef.current = null;
							clarifyRef.current = null;
							if (mountedRef.current) {
								setRunning(false);
								setLiveStatus(null);
								setApproval(null);
								setClarify(null);
							}
						}
				}
					if (
						pendingSteerFollowUp &&
						mountedRef.current &&
						!abort.signal.aborted &&
					sessionIdRef.current === pendingSteerFollowUp.sessionId &&
					props.sessions.partitionKey() === pendingSteerFollowUp.sessionPartition &&
					pickerPolicyIsCurrent(pendingSteerFollowUp.workspacePolicy)
				) {
					void runAgent(pendingSteerFollowUp.prompt);
				}
			},
			[
			settings,
			attachNote,
			pendingFiles,
			sessionOverlay,
			runner,
			props,
			appendText,
			appendReasoning,
			finalizeReasoning,
			toolStart,
			toolPending,
			stripPendingTools,
			toolResult,
			applySteerMarker,
			persistSession,
			setTurnsSynced,
			buildApprovalPreview,
			newConversation,
			refreshSessions,
			pickerPolicyIsCurrent,
		]
	);

	/* ---------------- goal loop (v0.1.25, hermes_cli/goals.py) ---------------- */

	/* aux call: "is the standing goal satisfied by the last reply?" —
	   the goalJudge slot falls back to the main model like every aux */
	const judgeGoal = useCallback(
		async (
			goalText: string,
			lastReply: string,
			effectiveSettings: OpenAgentSettings = settings,
			signal?: AbortSignal
		) => {
			if (signal?.aborted) throw new Error("Goal judge interrupted.");
			const connG = resolveConnection(effectiveSettings);
			const pair = resolveAuxTask(effectiveSettings, "goalJudge", { providerId: connG.providerId, model: connG.model });
			const provider = effectiveSettings.providers.find((p) => p.id === pair.providerId);
			if (!provider?.baseUrl.trim()) throw new Error("no provider for the goal judge");
			const res = await chatCompletion(
				provider,
				{ ...effectiveSettings, model: pair.model },
				[{ role: "user", content: buildGoalJudgePrompt(goalText, lastReply) }],
				null,
				{ signal }
			);
			if (signal?.aborted) throw new Error("Goal judge interrupted.");
			return parseGoalVerdict(res.content.trim());
		},
		[settings]
	);

	/* after EVERY completed turn: judge → continue / done / wait / auto-pause.
	   Fail-open like the official module, with the same consecutive-failure
	   backstops (3 parse, 5 transport) and the absolute 20-turn budget. */
	const maybeContinueGoal = useCallback(async (context?: GoalContinuationContext): Promise<boolean> => {
		const effectiveSettings = context?.settings ?? settings;
		const signal = context?.signal;
		const g = goalRef.current;
		const ownedTurns = turnsRef.current;
		if (signal?.aborted || !g || g.status !== "active") return false;
		const ownedStore = context?.sessionStore ?? props.sessions.snapshot();
		const ownedPartition = ownedStore.partitionKey();
		const ownedSessionId = context?.sessionState.id ?? sessionIdRef.current;
		const persistGoal = (next: SessionGoal | null): void => {
			const owned = context?.sessionState ? { ...context.sessionState, goal: next } : undefined;
			void persistSession(ownedTurns, ownedStore, owned);
		};
		const scheduleContinuation = (expectedGoal: SessionGoal): void => {
				window.setTimeout(() => {
					if (
						!mountedRef.current ||
						signal?.aborted ||
					goalRef.current !== expectedGoal ||
					turnsRef.current !== ownedTurns ||
					sessionIdRef.current !== ownedSessionId ||
					props.sessions.partitionKey() !== ownedPartition ||
					(context?.workspacePolicy && !pickerPolicyIsCurrent(context.workspacePolicy))
				) return;
				void runAgent(continuationPrompt(expectedGoal.text));
			}, 0);
		};
		if (g.turnsUsed >= GOAL_MAX_TURNS) {
			const paused = { ...g, status: "paused" as const, pausedReason: `turn budget (${GOAL_MAX_TURNS}) spent`, updatedAt: Date.now() };
			setGoalSynced(paused);
			persistGoal(paused);
			pushLocalNoticeTurn(
				`**Goal paused** — the ${GOAL_MAX_TURNS}-turn budget is spent. \`/goal resume\` continues, \`/goal clear\` drops it.`
			);
			return false;
		}
		const lastReply =
			ownedTurns
				.filter((t) => t.role === "assistant")
				.map((t) =>
					t.parts
						.filter((pp) => pp.kind === "text")
						.map((pp) => (pp as { text: string }).text)
						.join("\n")
				)
				.filter((t) => t.trim().length > 0)
				.slice(-1)[0] ?? "";
		setLiveStatus("Judging the goal…");
		const stillOwned = (): boolean => !signal?.aborted && goalRef.current === g && turnsRef.current === ownedTurns;
		const finish = (next: SessionGoal | null, notice: string | null): void => {
			setGoalSynced(next);
			persistGoal(next);
			if (notice) pushLocalNoticeTurn(notice);
		};
		try {
			const verdict = await judgeGoal(g.text, lastReply, effectiveSettings, signal);
			if (!stillOwned()) return false;
			if (verdict.done) {
				finish(
					{ ...g, status: "done", parseFailures: 0, transportFailures: 0, updatedAt: Date.now() },
					`**Goal complete** — ${verdict.reason || "the judge confirmed it."} \`/goal clear\` drops it.`
				);
				return false;
			}
			if (verdict.wait) {
				finish(
					{ ...g, status: "paused", pausedReason: verdict.reason || "waiting for your input", updatedAt: Date.now() },
					`**Goal parked** — the agent is waiting on you: ${verdict.reason || "input needed"}. \`/goal resume\` continues.`
				);
				return false;
			}
			const next: SessionGoal = {
				...g,
				turnsUsed: g.turnsUsed + 1,
				parseFailures: 0,
				transportFailures: 0,
				updatedAt: Date.now(),
			};
			setGoalSynced(next);
			persistGoal(next);
				/* Defer the ordinary continuation until the parent run has completed
				   its finally block, and retain the originating session/scope. */
				scheduleContinuation(next);
				return true;
		} catch (e) {
			if (!stillOwned()) return false;
			const msg = e instanceof Error ? e.message : String(e);
			const isParse = /not JSON/.test(msg);
			const failed = {
				...g,
				parseFailures: g.parseFailures + (isParse ? 1 : 0),
				transportFailures: g.transportFailures + (isParse ? 0 : 1),
				updatedAt: Date.now(),
			};
			if (failed.parseFailures >= GOAL_MAX_PARSE_FAILURES || failed.transportFailures >= GOAL_MAX_TRANSPORT_FAILURES) {
				finish(
					{ ...failed, status: "paused", pausedReason: `goal judge failing (${isParse ? "unparseable replies" : "transport"})` },
					`**Goal paused** — the judge keeps failing (${isParse ? "non-JSON replies" : "transport errors"}). Pin a better model in Settings → Memory & Context → Goal judge, then \`/goal resume\`.`
				);
				return false;
			}
			/* fail-open (goals.py): a broken judge must not wedge progress — the
			   budget is the backstop. Count the failure, continue once more. */
				setGoalSynced(failed);
				persistGoal(failed);
				scheduleContinuation(failed);
				return true;
		} finally {
			if (!signal?.aborted) setLiveStatus(null);
		}
	}, [settings, judgeGoal, persistSession, props.sessions, pushLocalNoticeTurn, runAgent, setGoalSynced, pickerPolicyIsCurrent]);

	continueGoalRef.current = maybeContinueGoal;

	/* ---------------- slash commands ---------------- */

	const runSlash = useCallback(
		async (raw: string): Promise<boolean> => {
			const [cmdToken, ...rest] = raw.trim().split(/\s+/);
			const arg = rest.join(" ").trim();
			const cmd = SLASH_ALIASES.get(cmdToken.toLowerCase()) ?? cmdToken.toLowerCase();
			switch (cmd) {
				case "/new":
					newConversation();
					return true;
				case "/branch":
					await branchConversation();
					return true;
				case "/goal": {
					const verb = arg.toLowerCase();
					if (!arg || verb === "status") {
						const g = goalRef.current;
						pushLocalNoticeTurn(
							g && g.status !== "cleared"
								? `**Standing goal** — \`${g.status}\`${g.pausedReason ? ` (${g.pausedReason})` : ""}\n${g.text}\n\nTurns used: ${g.turnsUsed}/${GOAL_MAX_TURNS}${g.status === "paused" ? " — \`/goal resume\` continues." : ""}${g.status === "done" ? " — \`/goal clear\` drops it." : ""}`
								: "No standing goal. Set one with \`/goal <text>\` — the agent keeps working turn after turn, a judge checks every reply, until it's done (max 20 turns)."
						);
						return true;
					}
					if (verb === "clear") {
						setGoalSynced(null);
						void persistSession(turnsRef.current);
						pushLocalNoticeTurn("Standing goal cleared.");
						return true;
					}
					if (verb === "pause") {
						const g = goalRef.current;
						if (!g || g.status !== "active") {
							pushLocalNoticeTurn("No active goal to pause.", "warning");
							return true;
						}
						setGoalSynced({ ...g, status: "paused", pausedReason: "you paused it", updatedAt: Date.now() });
						void persistSession(turnsRef.current);
						pushLocalNoticeTurn("**Goal paused** — \`/goal resume\` picks it back up.");
						return true;
					}
					if (verb === "resume") {
						const g = goalRef.current;
						if (!g || (g.status !== "paused" && g.status !== "done")) {
							pushLocalNoticeTurn("Nothing to resume.", "warning");
							return true;
						}
						setGoalSynced({ ...g, status: "active", updatedAt: Date.now() });
						void persistSession(turnsRef.current);
						void runAgent(continuationPrompt(g.text));
						return true;
					}
					/* a new goal replaces any standing one and kicks off NOW (the
					   busy path already queued this command — drain re-dispatches
					   it here when the chat settles, Hermes #63352 parity) */
					setGoalSynced(newGoal(arg));
					void persistSession(turnsRef.current);
					void runAgent(arg, undefined, raw);
					return true;
				}
				case "/steer": {
					/* run_agent.py steer(): BUSY → the text is stashed and
					   rides the next tool result (never a queue entry — the
					   busy path in handleSubmit dispatches /steer straight
					   here, CLI inline-dispatch parity). IDLE → the text is
					   an ordinary next-turn message. */
					if (!arg) {
						pushLocalNoticeTurn("Usage: `/steer <prompt>` — injects a message after the next tool call, without interrupting the run.");
						return true;
					}
					const liveLoop = loopRef.current;
					if (running && liveLoop && liveLoop.steer(arg)) {
						pushLocalNoticeTurn(`**Steer queued** — arrives after the next tool call: “${steerPreview(arg, 80)}”`);
						return true;
					}
					void runAgent(arg);
					return true;
				}
				case "/resume": {
					/* official: picker overlay + inline fuzzy; ours: the panel with
					   the search it already has, prefilled by the arg */
					setPanelFilter(arg);
					setPanelOpen(true);
					return true;
				}
				case "/title": {
					if (!arg) {
						pushLocalNoticeTurn(
							sessionTitleRef.current
								? `Current title: “${sessionTitleRef.current}”. Rename with \`/title <name>\`.`
								: "No title yet — the session is named from your first message until you set one with `/title <name>`."
						);
						return true;
					}
					sessionTitleRef.current = arg;
					pushLocalNoticeTurn(
						`Session title set: “${arg}”${settings.saveSessions ? "." : " — session saving is off, so it lasts until reload."}`
					);
					await persistSession(turnsRef.current); // persistSession keeps the ref title verbatim
					return true;
				}
				case "/version": {
					pushLocalNoticeTurn(`**Open Agent** v${PLUGIN_VERSION} · build ${BUILD_STAMP} · min Obsidian 1.5.0`);
					return true;
				}
				case "/queue": {
					if (!arg) {
						pushLocalNoticeTurn("Usage: `/queue <prompt>` — queues it behind the current turn; drains in order. Alias `/q`.");
						return true;
					}
					/* identical to the busy-Enter path: enqueue + unpark — the
					   edge-independent auto-drain effect starts it when idle */
						const { entry } = enqueueEntry(sessionId, queue, { text: arg, attachments: [] });
						setQueueParked(false);
						void persistQueue(sessionId, (current) =>
							current.some((queued) => queued.id === entry.id) ? current : [...current, entry]
						);
					return true;
				}
				case "/status": {
					const connSt = resolveConnection(settings);
					const provSt = settings.providers.find((p) => p.id === connSt.providerId);
					pushLocalNoticeTurn(
						`**Session status**\n` +
							`- Model: \`${connSt.model}\` @ ${provSt?.name ?? connSt.providerId}\n` +
							`- Profile: ${getActiveProfile(settings).name}\n` +
							`- Approval mode: \`${settings.approvalMode}\`\n` +
							`- Title: ${sessionTitleRef.current ? `“${sessionTitleRef.current}”` : "(derived until set — /title)"}\n` +
							`- Usage: ↑${tokenTotals.in} ↓${tokenTotals.out}\n` +
							`- Queue: ${queue.length} waiting`
					);
					return true;
				}
				case "/save": {
					if (turnsRef.current.length === 0) {
						pushLocalNoticeTurn("Nothing to save yet.", "warning");
						return true;
					}
					const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
					const slug = (sessionTitleRef.current ?? "session")
						.toLowerCase()
						.replace(/[^a-z0-9]+/g, "-")
						.replace(/^-+|-+$/g, "")
						.slice(0, 40) || "session";
					const exportPolicy = snapshotPickerPolicy();
					if (!exportPolicy) return true;
					let folder: string;
					try {
						folder = exportPolicy.mode === "strict-folder"
							? exportPolicy.resolvePath("openagent/exports", { label: "Transcript export folder" })
							: exportPolicy.assertVisiblePath("openagent/exports", "Transcript export folder");
					} catch (e) {
						pushLocalNoticeTurn(`Save failed: ${e instanceof Error ? e.message : String(e)}`, "error");
						return true;
					}
					let path: string;
					try {
						path = exportPolicy.assertVisiblePath(normalizePath(`${folder}/chat-${slug}-${stamp}.md`), "Transcript export");
					} catch (e) {
						pushLocalNoticeTurn(`Save failed: ${e instanceof Error ? e.message : String(e)}`, "error");
						return true;
					}
					const shownTitle = sessionTitleRef.current ?? "Chat session";
					const lines: string[] = [
						"---",
						`title: "${shownTitle.replace(/"/g, '\\"')}"`,
						`saved: ${new Date().toISOString()}`,
						`model: ${resolveConnection(settings).model}`,
						"---",
						"",
						`# ${shownTitle}`,
						"",
					];
					for (const t of turnsRef.current) {
						/* v0.1.124 (owner console at STARTUP — stack loadLayout →
						   loadFile → setViewData → spans → toDOM → mermaid.render):
						   the exported NOTE is parsed by Obsidian's own mermaid, where
						   raw `(...)` labels crash again (chat-side sanitize can't
						   reach vault files). Salvage the mermaid fences while
						   writing; everything else in the note stays byte-identical. */
						const text = canonicalizeAssistantOutput(
							t.parts
								.filter((pp) => pp.kind === "text")
								.map((pp) => (pp as { text: string }).text)
								.join("\n")
						);
						const toolNames = t.parts
							.filter((pp) => pp.kind === "tool")
							.map((pp) => (pp as { name?: string }).name ?? "tool");
						if (text.trim()) lines.push(t.role === "user" ? "**You**:" : t.role === "assistant" ? "**Agent**:" : "**System**:", "", text, "");
						for (const tn of toolNames) lines.push(`> tool: ${tn}`, "");
					}
					try {
						if (!pickerPolicyIsCurrent(exportPolicy)) {
							pushLocalNoticeTurn("Save cancelled because the Workspace scope changed.", "warning");
							return true;
						}
						if (!props.app.vault.getAbstractFileByPath(folder)) {
							try {
								await props.app.vault.createFolder(folder);
							} catch {
								/* folder appeared meanwhile */
							}
						}
						if (!pickerPolicyIsCurrent(exportPolicy)) {
							pushLocalNoticeTurn("Save cancelled because the Workspace scope changed.", "warning");
							return true;
						}
						await props.app.vault.create(path, lines.join("\n"));
						new Notice(`Open Agent: transcript saved → ${path}`, 6000);
						pushLocalNoticeTurn(`Transcript saved to \`${path}\`.`, "action", { label: "Open note", openPath: path });
					} catch (e) {
						pushLocalNoticeTurn(`Save failed: ${e instanceof Error ? e.message : String(e)}`, "error");
					}
					return true;
				}
				case "/profile": {
					if (!arg) {
						const active = getActiveProfile(settings);
						pushLocalNoticeTurn(
							`Active profile: ${active.name} (\`${active.id}\`). Switch with \`/profile <name>\` — profiles: ${settings.profiles
								.map((p) => `\`${p.id}\``)
								.join(" ")}.`
						);
						return true;
					}
					const needle = arg.toLowerCase();
					const hit = settings.profiles.find((p) => p.id.toLowerCase() === needle || p.name.toLowerCase() === needle);
					if (!hit) {
						pushLocalNoticeTurn(`Unknown profile \`${arg}\`. Profiles: ${settings.profiles.map((p) => `\`${p.id}\``).join(" ")}.`, "error");
						return true;
					}
					await props.applyProfile(hit.id);
					pushLocalNoticeTurn(`Profile switched to ${hit.name}.`);
					return true;
				}
				case "/approvals": {
					if (!arg) {
						pushLocalNoticeTurn(`Approval mode: \`${settings.approvalMode}\` — set with \`/approvals <manual|cautious|yolo>\`.`);
						return true;
					}
					if (arg !== "manual" && arg !== "cautious" && arg !== "yolo") {
						pushLocalNoticeTurn(`Unknown mode \`${arg}\` — manual | cautious | yolo.`, "error");
						return true;
					}
					settings.approvalMode = arg;
					await props.saveSettings();
					pushLocalNoticeTurn(`Approval mode set to \`${arg}\`.`);
					return true;
				}
				case "/model": {
					if (!arg) return false;
					/* MoA implicit pivot (official model_switch.py PATH B, #55187):
					   a bare EXACT name of an ENABLED preset switches the session
					   onto the MoA virtual provider. A prefixed form ("moa:x") or
					   a disabled preset never matches here — explicit-only picks
					   stay in the model picker. */
					if (settings.moa) {
						const hit = exactMoaPresetName(settings.moa, arg);
						if (hit) {
							settings.moa = setActiveMoaPreset(settings.moa, hit);
							await props.saveSettings();
							pushLocalNoticeTurn(`MoA preset \`${hit}\` active — references advise; the preset's aggregator acts. Pick a normal model to leave.`);
							return true;
						}
					}
					/* a normal-model switch leaves the Mixture of Agents virtual
					   provider (matches the model picker's selectModel) */
					const leftMoa = Boolean(settings.moa?.active_preset);
					if (leftMoa) settings.moa = setActiveMoaPreset(settings.moa!, "");
					settings.model = arg;
					rememberModelInCatalog(getActiveProvider(settings), arg);
					setModels(catalogOf(getActiveProvider(settings)));
					await props.saveSettings();
					pushLocalNoticeTurn(`Model switched to \`${arg}\`${leftMoa ? " — left the MoA virtual provider" : ""}.`);
					return true;
				}
				case "/moa": {
					/* One-shot sugar only: route this immutable request through the
					   default preset without mutating persisted picker state. This avoids
					   a save/restore await window in which Workspace, profile, session,
					   or another model selection could change underneath the command. */
					if (!arg) {
						pushLocalNoticeTurn(moaUsage());
						return true;
					}
					if (!settings.moa || Object.keys(normalizeMoaConfig(settings.moa).presets).length === 0) {
						pushLocalNoticeTurn("No MoA preset saved yet — create one in Settings → Open Agent → Mixture of Agents, or \`/moa\` has nothing to ride.");
						return true;
					}
					const policy = snapshotPickerPolicy();
					if (!policy) return true;
					const sourcePartition = props.sessions.partitionKey();
					const sourceSessionId = sessionIdRef.current;
					const moaCfg = normalizeMoaConfig(settings.moa);
					const preset = moaCfg.default_preset;
					const moaSettings = JSON.parse(JSON.stringify(settings)) as OpenAgentSettings;
					moaSettings.moa = setActiveMoaPreset(moaCfg, preset);
					if (
						!pickerPolicyIsCurrent(policy) ||
						props.sessions.partitionKey() !== sourcePartition ||
						sessionIdRef.current !== sourceSessionId
					) return true;
					pushLocalNoticeTurn(`MoA one-shot queued with preset ${preset}; your selected model remains unchanged.`);
					void runAgent(arg, undefined, raw, { settingsOverride: moaSettings });
					return true;
				}
			case "/personality": {
				if (!arg) {
					pushLocalNoticeTurn(
						sessionOverlay
							? `Active overlay: \`${sessionOverlay}\` (session-level, on top of the profile SOUL). Clear with \`/personality none\`.`
							: `No overlay — identity only (the profile's SOUL). Set one with \`/personality <name>\`.`
					);
					return true;
				}
				if (arg === "none") {
					overlayExplicitRef.current = true;
					setSessionOverlay(null);
					pushLocalNoticeTurn("Personality overlay cleared — this chat now runs on the profile SOUL only.");
					return true;
				}
				if (!isOverlayKey(arg)) {
					pushLocalNoticeTurn(
						`Unknown personality \`${arg}\`. Overlays: ${Object.keys(PERSONALITY_OVERLAYS)
							.map((k) => `\`${k}\``)
							.join(" ")} — or \`none\`. (The durable identity is the SOUL — edit it in Settings → Profiles.)`
					);
					return true;
				}
				overlayExplicitRef.current = true;
				setSessionOverlay(arg);
				pushLocalNoticeTurn(`Overlay \`${arg}\` active for this session — layered on top of the profile SOUL.`);
				return true;
			}
					case "/skills": {
						const policy = snapshotPickerPolicy();
						if (!policy) return true;
						const sourcePartition = props.sessions.partitionKey();
						const sourceSessionId = sessionIdRef.current;
						const skills = await runner.skillsForPolicy(policy).loadSkills();
						if (
							!pickerPolicyIsCurrent(policy) ||
							props.sessions.partitionKey() !== sourcePartition ||
							sessionIdRef.current !== sourceSessionId
						) return true;
					if (!arg) {
						pushLocalNoticeTurn(
							skills.length
								? `**Installed skills (${skills.length}):**\n${skills.map((s) => `- \`${s.name}\` — ${s.description}${s.enabled ? "" : " (disabled)"}`).join("\n")}`
								: "No skills installed yet. The agent creates them automatically after complex tasks (Settings → Open Agent → Skills)."
						);
						return true;
					}
					/* hermes-cli /skills verbs (v0.1.22 parity, raw hermes_cli/commands.py:
					   "Args: name (list|read): name"). TYPED verb — read/attach an
					   explicit skill, even one whose frontmatter says disabled. */
					const head = (arg.split(/\s+/)[0] ?? "").toLowerCase();
					if (head === "list") {
						pushLocalNoticeTurn(
							skills.length
								? `**Installed skills (${skills.length}):**\n${skills.map((s) => `- \`${s.name}\` — ${s.description}${s.enabled ? "" : " (disabled)"}`).join("\n")}`
								: "No skills installed yet."
						);
						return true;
					}
					if (head === "read" || head === "use") {
						const wanted = arg.split(/\s+/).slice(1).join(" ").trim();
						if (!wanted) {
							pushLocalNoticeTurn(`Usage: \`/skills ${head} <skill-name>\` — pick one from \`/skills\`.`);
							return true;
						}
						const skill =
							skills.find((s) => s.name.toLowerCase() === wanted.toLowerCase()) ??
							skills.find((s) => s.name.toLowerCase().includes(wanted.toLowerCase()));
						if (!skill) {
							pushLocalNoticeTurn(`No skill named “${wanted}”. Installed: ${skills.map((s) => `\`${s.name}\``).join(", ") || "none"}.`, "error");
							return true;
						}
						loadSkillIntoContextRef(skill);
						pushLocalNoticeTurn(
							(head === "use" ? `Skill **\`${skill.name}\`** armed` : `**\`${skill.name}\`** loaded`)
							+ ` — its instructions ride along on your next message${skill.enabled ? "." : " (it's disabled by frontmatter; the explicit verb still wins)."}`
						);
						return true;
					}
					pushLocalNoticeTurn(`Unknown sub-command: \`/skills ${head}\` — try \`list\`, \`read\` or \`use\`.`, "error");
					return true;
				}
					case "/memory": {
						const policy = snapshotPickerPolicy();
						if (!policy) return true;
						const sourcePartition = props.sessions.partitionKey();
						const sourceSessionId = sessionIdRef.current;
						const memory = runner.memoryForPolicy(policy);
						const [memText, userText] = await Promise.all([memory.readMemory(), memory.readUserProfile()]);
						if (
							!pickerPolicyIsCurrent(policy) ||
							props.sessions.partitionKey() !== sourcePartition ||
							sessionIdRef.current !== sourceSessionId
						) return true;
						const mem = memText.trim();
						const user = userText.trim();
						pushLocalNoticeTurn(
						`${mem ? `**MEMORY.md**\n${mem}` : "_(MEMORY.md is empty)_"}\n\n${user ? `**USER.md**\n${user}` : ""}`
					);
					return true;
				}
				case "/usage": {
					pushLocalNoticeTurn(
						usage
							? `**Last response** — input: ${usage.promptTokens}, output: ${usage.completionTokens}.\n**Session totals** — ↑${tokenTotals.in}, ↓${tokenTotals.out}.`
							: "No usage recorded yet in this session."
					);
					return true;
				}
				case "/retry": {
					if (running) return true;
					const retryPolicy = snapshotPickerPolicy();
					if (!retryPolicy) return true;
					const retryPartition = props.sessions.partitionKey();
					const retrySessionId = sessionIdRef.current;
					const lastUserIdx = [...turns].map((t, i) => ({ t, i })).filter(({ t }) => t.role === "user").pop()?.i;
					if (lastUserIdx == null) return true;
					const lastPrompt = turns[lastUserIdx].parts
						.filter((p) => p.kind === "text")
						.map((p) => (p as { text: string }).text)
						.join(" ");
					setTurnsSynced(turns.slice(0, lastUserIdx));
					let cut = messagesRef.current.length;
					for (let i = messagesRef.current.length - 1; i >= 0; i--) {
						if (messagesRef.current[i].role === "user") {
							cut = i;
							break;
						}
					}
					messagesRef.current = messagesRef.current.slice(0, cut);
						window.setTimeout(() => {
							if (
								mountedRef.current &&
								pickerPolicyIsCurrent(retryPolicy) &&
							props.sessions.partitionKey() === retryPartition &&
							sessionIdRef.current === retrySessionId
						) void runAgent(lastPrompt);
					}, 30);
					return true;
				}
				case "/undo": {
					if (running) return true;
					const lastUserIdx = [...turns].map((t, i) => ({ t, i })).filter(({ t }) => t.role === "user").pop()?.i;
					if (lastUserIdx == null) return true;
					setTurnsSynced(turns.slice(0, lastUserIdx));
					let cut = 0;
					for (let i = messagesRef.current.length - 1; i >= 0; i--) {
						if (messagesRef.current[i].role === "user") {
							cut = i;
							break;
						}
					}
					messagesRef.current = messagesRef.current.slice(0, cut);
					pushLocalNoticeTurn("Last exchange removed.");
					return true;
				}
				/* Hermes /learn: skill authoring without opening markdown — let
				   the agent distill the workflow it just performed by itself. */
				case "/learn": {
					if (running) return true;
					if (!messagesRef.current.some((m) => m.tool_calls)) {
						pushLocalNoticeTurn("Nothing to learn from yet — run a task with tool use first.", "warning");
						return true;
					}
					const learnPolicy = snapshotPickerPolicy();
					if (!learnPolicy) return true;
					const learnPartition = props.sessions.partitionKey();
					const learnSessionId = sessionIdRef.current;
					const focus = arg ? ` Focus especially on: ${arg}.` : "";
						window.setTimeout(() => {
							if (
								!mountedRef.current ||
								!pickerPolicyIsCurrent(learnPolicy) ||
							props.sessions.partitionKey() !== learnPartition ||
							sessionIdRef.current !== learnSessionId
						) return;
						void runAgent(
							`The workflow we just completed may be worth remembering: distill it into ONE reusable skill via create_skill — concise name, a clear "when to use" trigger, only the essential steps (no fluff, no secrets, keep vault paths relative).${focus} If nothing in this conversation is genuinely reusable, just tell me so instead of creating a skill.`
						);
					}, 30);
					return true;
				}
				case "/compress": {
					if (running) return true;
					const historyText = messagesRef.current
						.map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : ""}`)
						.join("\n")
						.slice(-12000);
					if (!historyText.trim()) {
						pushLocalNoticeTurn("Nothing to compress yet.", "warning");
						return true;
					}
						const policy = snapshotPickerPolicy();
						if (!policy) return true;
						const scopedSessions = props.sessions.snapshot();
						const sourceSessionId = sessionIdRef.current;
							const commandSettings = JSON.parse(JSON.stringify(settings)) as OpenAgentSettings;
							const commandAbort = new AbortController();
							headlessCommandAbortRef.current?.abort();
							headlessCommandAbortRef.current = commandAbort;
							pushLocalNoticeTurn("Compressing context…");
							try {
								const brief = await runner.runHeadless(
									`Summarize this conversation into a dense context brief (bullet points, keep facts, decisions, file paths and open tasks):\n\n${historyText}`,
									{ workspacePolicy: policy, settings: commandSettings, signal: commandAbort.signal }
								);
								if (
									!mountedRef.current ||
									commandAbort.signal.aborted ||
									!pickerPolicyIsCurrent(policy) ||
									props.sessions.partitionKey() !== scopedSessions.partitionKey() ||
									sessionIdRef.current !== sourceSessionId
								) return true;
							messagesRef.current = [
							{ role: "user", content: `[Context brief from earlier conversation]\n${brief}` },
							{ role: "assistant", content: "Understood — I have the context brief. Continuing." },
						];
						compressionRef.current = null; // hard reset replaces the wire — any rolling cache is stale
						pushLocalNoticeTurn(`Context compressed to a brief (${brief.length} chars).`);
							} catch (e) {
								if (
									mountedRef.current &&
									!commandAbort.signal.aborted &&
									pickerPolicyIsCurrent(policy) &&
									props.sessions.partitionKey() === scopedSessions.partitionKey() &&
									sessionIdRef.current === sourceSessionId
								) pushLocalNoticeTurn(`Compression failed: ${e instanceof Error ? e.message : String(e)}`, "error");
							} finally {
								if (headlessCommandAbortRef.current === commandAbort) headlessCommandAbortRef.current = null;
							}
							return true;
					}
				case "/stop":
					stopAgent();
					return true;
				case "/help":
					pushLocalNoticeTurn(
						`**Commands**\n${SLASH_COMMANDS.map((c) => `- \`${c.name}\` — ${c.desc}`).join("\n")}`
					);
					return true;
				default: {
					/* Hermes skill commands (e.g. \`/work fix the leak\`): a skill
					   name IS a slash command. Bare → arm one-shot (= /skills use);
					   with args → the instruction runs now with the skill riding */
					const slug = cmd.startsWith("/") ? cmd.slice(1) : "";
					if (slug) {
						const policy = snapshotPickerPolicy();
						if (!policy) return true;
						const sourcePartition = props.sessions.partitionKey();
						const sourceSessionId = sessionIdRef.current;
						const skills = await runner.skillsForPolicy(policy).loadSkills();
						if (
							!pickerPolicyIsCurrent(policy) ||
							props.sessions.partitionKey() !== sourcePartition ||
							sessionIdRef.current !== sourceSessionId
						) return true;
						const hit = skills.find((s) => skillSlug(s.name) === slug);
						if (hit) {
							/* with args the skill rides THIS run (no arm notice —
							   the turn itself is the feedback); bare = visible arm */
							armSkillOneShot(hit, { silent: !!arg });
							if (arg) void runAgent(arg, undefined, raw);
							return true;
						}
					}
					return false;
				}
			}
		},
		[newConversation, branchConversation, settings, props, pushLocalNoticeTurn, runner, snapshotPickerPolicy, pickerPolicyIsCurrent, usage, tokenTotals, turns, running, runAgent, stopAgent, setTurnsSynced, persistSession, persistQueue, setGoalSynced, queue, sessionId]
	);

	/* dispatch a queued entry as a real turn. Attachments ride the explicit
	   override — NEVER the composer's pendingFiles state, which a closure
	   captures out-of-date (lessons/12 class bug) */
	const sendQueued = useCallback(
		async (entry: QueuedPrompt): Promise<void> => {
			const sourcePartition = sessionPartitionKey;
			const sourceSessionId = sessionId;
			/* Remove-and-persist is the dispatch claim. A save failure or a
			   deferred scope/session change returns false and the queue slice is
			   restored, so the prompt is never leaked or silently double-sent. */
				if (!await persistQueue(sourceSessionId, (current) =>
					current.some((queued) => queued.id === entry.id) ? removeEntry(current, entry.id) : null
				)) return;
			if (
				props.sessions.partitionKey() !== sourcePartition ||
				sessionIdRef.current !== sourceSessionId
			) return;
			/* slash parity on drain (v0.1.25): a queued "/goal …" (Hermes queues
			   goal kickoffs while busy, #63352) must RUN as the command when the
			   chat settles — a literal "/goal" string must never reach the model */
			if (entry.text.startsWith("/")) {
				const handled = await runSlash(entry.text);
				if (handled) return;
				if (
					props.sessions.partitionKey() !== sourcePartition ||
					sessionIdRef.current !== sourceSessionId
				) return;
				pushLocalNoticeTurn(`Unknown command \`${entry.text.split(/\s+/)[0]}\` — sent as a normal message.`, "warning");
			}
			void runAgent(entry.text, entry.attachments, entry.displayText);
		},
			[sessionId, sessionPartitionKey, persistQueue, props.sessions, runAgent, runSlash, pushLocalNoticeTurn]
		);

	/* edge-independent auto-drain (desktop shouldAutoDrain): whenever the
	   session is idle and the queue is non-empty, the head flows. The lock +
	   remove-before-dispatch make double-sends impossible. */
		useEffect(() => {
				if (queueDrainingRef.current) return;
				if (!shouldAutoDrain({
					isBusy: running,
					parked: queueParked,
					queueLength: queue.length,
					persistencePending: queueTransactions.pending,
				})) return;
		const head = queue.find((e) => e.id !== queueEditId); // the entry being edited is skipped (desktop)
		if (!head) return;
		queueDrainingRef.current = true;
		/* `.finally` re-throws, so it alone leaves the rejection unhandled; the
		   `.catch` both releases the drain lock and reports the loss. */
		void sendQueued(head)
			.catch((e: unknown) => {
				pushLocalNoticeTurn(
					`Queued prompt could not be sent — ${e instanceof Error ? e.message : String(e)}`,
					"error"
				);
			})
			.finally(() => {
				queueDrainingRef.current = false;
			});
	}, [running, queue, queueParked, queueEditId, sendQueued, pushLocalNoticeTurn]);

	/* per-row "send": idle = dispatch that entry now (a manual drain — lifts
	   any park, desktop); busy = promote to head, un-park, interrupt — the
	   settle auto-drain then sends it (desktop send-now-while-busy parity) */
		const sendQueuedNow = useCallback(
			(entry: QueuedPrompt) => {
				if (entry.id === queueEditId) return;
				if (running) {
					const sourcePartition = sessionPartitionKey;
					const sourceSessionId = sessionId;
						void afterSuccessfulQueueCommit(
							() => persistQueue(sourceSessionId, (current) =>
								current.some((queued) => queued.id === entry.id) ? promoteEntry(current, entry.id) : null
							),
							() => {
								if (
									!mountedRef.current ||
									props.sessions.partitionKey() !== sourcePartition ||
									sessionIdRef.current !== sourceSessionId
								) return;
								unparkQueue(sourceSessionId);
								setQueueParked(false);
								stopAgent();
							}
						);
					return;
				}
				unparkQueue(sessionId);
				setQueueParked(false);
				void sendQueued(entry).catch((e: unknown) => {
					pushLocalNoticeTurn(
						`Queued prompt could not be sent — ${e instanceof Error ? e.message : String(e)}`,
						"error"
					);
				});
			},
			[running, queueEditId, sessionId, sessionPartitionKey, persistQueue, props.sessions, sendQueued, stopAgent, pushLocalNoticeTurn]
		);

	const beginQueueEdit = useCallback(
		(entry: QueuedPrompt) => {
			queueEditSnapshotRef.current = { draft: input, files: pendingFiles };
			historyBrowseRef.current.reset(); // v0.1.180: queue edit replaces the draft
			setQueueEditId(entry.id);
			setInput(entry.text);
			setPendingFiles(entry.attachments);
			window.setTimeout(() => composerRef.current?.focus(), 30);
		},
		[input, pendingFiles]
	);

	/* v0.1.180 (Hermes parity): while editing a queued turn, ↑/↓ walk the
	   adjacent entries — the ORIGINAL draft snapshot stays put. */
	const stepQueueEdit = useCallback(
		(dir: number) => {
			if (!queueEditId) return;
			const i = queue.findIndex((q) => q.id === queueEditId);
			const target = queue[i + dir];
			if (!target) return;
			setQueueEditId(target.id);
			setInput(target.text);
			setPendingFiles(target.attachments);
		},
		[queue, queueEditId]
	);

	const handleSubmit = useCallback(() => {
		const value = input.trim();
		/* v0.1.180: submitting ends any input-history browse — the ring is
		   derived fresh from the live turns on the next ArrowUp. */
		historyBrowseRef.current.reset();
		/* queue-edit mode: Enter saves the entry back (desktop parity) */
		if (queueEditId) {
				if (value || pendingFiles.length > 0) {
					const editId = queueEditId;
					const editFiles = pendingFiles;
					void persistQueue(sessionId, (current) =>
						current.some((entry) => entry.id === editId)
							? updateEntry(current, editId, { text: value, attachments: editFiles }).list
							: null
					);
				}
			setQueueEditId(null);
			queueEditSnapshotRef.current = null;
			setInput("");
			setPendingFiles([]);
			return;
		}
		if (running) {
			if (value === "/stop") {
				haltAgent();
				return;
			}
			if (!value) return;
			/* /steer is the ONE busy command that must NEVER queue (CLI
			   inline-dispatch parity, test_cli_steer_busy_path): it stashes
			   into the LIVE run — queueing would deliver it after the run it
			   was meant to steer */
			if (/^\/steer(?:\s|$)/i.test(value)) {
				setInput("");
				void (async () => {
					const handled = await runSlash(value);
					if (!handled) pushLocalNoticeTurn(`Unknown command. Try \`/help\`.`, "error");
				})();
				return;
			}
			/* /queue while busy: the ARG is queued, never the command token
			   itself (v0.1.20 — a literal "/queue …" would reach the model) */
			const queuedCmd = /^\/(queue|q)(?:\s+(.*))?$/is.exec(value);
			if (queuedCmd) {
				const qText = (queuedCmd[2] ?? "").trim();
				if (!qText) {
					pushLocalNoticeTurn("Usage: `/queue <prompt>` — queues behind the current turn.");
					setInput("");
					return;
				}
					const { entry } = enqueueEntry(sessionId, queue, { text: qText, attachments: pendingFiles });
					setQueueParked(false);
					void persistQueue(sessionId, (current) =>
						current.some((queued) => queued.id === entry.id) ? current : [...current, entry]
					);
				setInput("");
				setPendingFiles([]);
				return;
			}
			/* Hermes Desktop queue parity: Enter while working enqueues instead
			   of blocking. Queueing = fresh intent a previous Stop must not hold */
				const { entry } = enqueueEntry(sessionId, queue, { text: value, attachments: pendingFiles });
				setQueueParked(false);
				void persistQueue(sessionId, (current) =>
					current.some((queued) => queued.id === entry.id) ? current : [...current, entry]
				);
			setInput("");
			setPendingFiles([]);
			return;
		}
		if (!value) {
			/* empty Enter with a non-empty queue = manual drain (desktop); a
			   manual drain is a resume gesture — lift any park */
			const head = queue.find((e) => e.id !== queueEditId);
			if (head) {
				unparkQueue(sessionId);
				setQueueParked(false);
				/* The dispatch claim already removed this entry from the queue, so a
				   rejection here would drop the prompt silently (and, in an Electron
				   renderer, without even a crash). Surface it instead. `.finally` does
				   NOT handle a rejection — only an explicit `.catch` does. */
				void sendQueued(head).catch((e: unknown) => {
					pushLocalNoticeTurn(
						`Queued prompt could not be sent — ${e instanceof Error ? e.message : String(e)}`,
						"error"
					);
				});
			}
			return;
		}
		setInput("");
		if (value.startsWith("/")) {
			void (async () => {
				const handled = await runSlash(value);
				if (!handled) pushLocalNoticeTurn(`Unknown command. Try \`/help\`.`, "error");
			})();
		} else {
			setPendingFiles([]);
			void runAgent(value);
		}
	}, [input, pendingFiles, running, queue, queueEditId, sessionId, runSlash, runAgent, pushLocalNoticeTurn, haltAgent, persistQueue, sendQueued]);

	/* ---------------- model / sessions data ---------------- */

	const refreshModels = useCallback(async () => {
		/* Hermes Desktop "Refresh Models" (v0.1.32): re-pull every CONNECTED
		   provider's live list (official refreshModels busts the catalog
		   cache per provider); failures are isolated per provider and named
		   in one summary notice. The menu stays open while this runs. */
		/* gate = the plugin's own "connected" predicate (presets ship
		   enabled:false, so gating on p.enabled means ZERO targets for a
		   normal vault — the old branch then routed to settings, which the
		   official menu action NEVER does). Zero usable → Notice only. */
		const targets = settings.providers.filter((p) => providerUsable(p));
		if (targets.length === 0) {
			new Notice("Open Agent: configure a provider first.");
			return;
		}
		const results = await Promise.all(
			targets.map(async (p) => {
				try {
					return { p, models: await listModels(p) };
				} catch (e) {
					return { p, error: e instanceof Error ? e.message : String(e) };
				}
			})
		);
		let loaded = 0;
		const errors: string[] = [];
		for (const r of results) {
			if ("error" in r) errors.push(`${r.p.name}: ${r.error}`);
			else if (r.models.length === 0) errors.push(`${r.p.name}: returned no models`);
			else {
				applyFetchedModels(settings, r.p.id, r.models);
				loaded++;
			}
		}
		if (loaded > 0) {
			setModels(withCurrentModel(catalogOf(getActiveProvider(settings)), settings.model));
			await props.saveSettings();
		}
		if (loaded > 0 && errors.length === 0) {
			new Notice(`Open Agent: refreshed ${loaded} provider catalog(s).`);
		} else if (loaded > 0) {
			new Notice(`Open Agent: refreshed ${loaded} catalog(s) — failed: ${errors.join("; ")}`, 9000);
		} else {
			new Notice(`Open Agent: failed to fetch models — ${errors.join("; ") || "no provider configured"}`, 9000);
		}
	}, [settings, props]);

	/* v0.1.32 (official model-menu parity): the menu selects a (provider,
	   model) PAIR — switching across providers from the menu is the normal
	   path, so the pick activates that provider's catalog first and the pill
	   list re-reads the new active provider. */
	const selectModel = useCallback(
		async (m: string, providerId?: string) => {
			/* Optional chaining, matching the Quick Ask twin in main.ts: with no
			   provider configured (or all disabled) getActiveProvider returns null,
			   and a bare `.id` here threw instead of just activating the pick. */
			if (providerId && providerId !== getActiveProvider(settings)?.id) {
				activateProviderCatalog(settings, providerId);
			}
			settings.model = m;
			rememberModelInCatalog(getActiveProvider(settings), m);
			setModels(withCurrentModel(catalogOf(getActiveProvider(settings)), m));
			/* a normal-model pick leaves the Mixture of Agents virtual provider */
			if (settings.moa?.active_preset) settings.moa = setActiveMoaPreset(settings.moa, "");
			props.saveSettingsSafe();
		},
		[settings, props]
	);

	/* model-menu persistence (Hermes Desktop stores): visibility customization
	   + collapsed provider groups ride settings so they sync like everything
	   else the plugin persists. */
	const setVisibleModelsStored = useCallback(
		(next: string[]) => {
			settings.visibleModels = next;
			bumpSettingsRev();
			props.saveSettingsSafe();
		},
		[settings, props]
	);
	const toggleCollapsedProvider = useCallback(
		(slug: string) => {
			settings.collapsedMenuProviders = settings.collapsedMenuProviders.includes(slug)
				? settings.collapsedMenuProviders.filter((s) => s !== slug)
				: [...settings.collapsedMenuProviders, slug];
			bumpSettingsRev();
			props.saveSettingsSafe();
		},
		[settings, props]
	);

	/* Mixture of Agents (v0.1.30): pick a whole preset — the session rides the
	   virtual "moa" provider until a normal model is picked. Written to the
	   official `active_preset` slot; an explicit pick stays valid even for an
	   enabled:false preset (official: only the bare-name IMPLICIT match honors
	   the opt-out — the picker is explicit). */
	const selectMoaPreset = useCallback(
		async (name: string) => {
			if (!settings.moa) return;
			settings.moa = setActiveMoaPreset(settings.moa, name);
			bumpSettingsRev();
			props.saveSettingsSafe();
		},
		[settings, props]
	);

	/* Copilot parity (ChatButtons): insert the answer into the active note —
	   replaces the selection when one exists, else inserts at the caret */
	const insertIntoNote = useCallback(
		(input: string) => {
			const text = canonicalizeAssistantOutput(input);
			let leaf = props.app.workspace.getMostRecentLeaf();
			if (!leaf || !(leaf.view instanceof MarkdownView)) {
				leaf = props.app.workspace.getLeaf(false);
			}
			if (!leaf || !(leaf.view instanceof MarkdownView)) {
				new Notice("Open a note to insert the answer into.");
				return;
			}
			const editor = leaf.view.editor;
			const selection = editor.getSelection();
			if (selection.length > 0) editor.replaceSelection(text);
			else editor.replaceRange(text, editor.getCursor());
			editor.focus();
		},
		[props.app]
	);

	/* Copilot parity (InlineMessageEditor): editing a user turn resubmits from
	   that point — history after the turn is cut, the new text is sent again */
	const editAndResend = useCallback(
		(turnIdx: number, newText: string) => {
			if (running) return;
			const userOrdinal = turns.slice(0, turnIdx + 1).filter((t) => t.role === "user").length;
			let seen = 0;
			let cut = -1;
			for (let i = 0; i < messagesRef.current.length; i++) {
				if (messagesRef.current[i].role === "user") {
					seen++;
					if (seen === userOrdinal) {
						cut = i;
						break;
					}
				}
			}
			if (cut === -1) return;
			const editPolicy = snapshotPickerPolicy();
			if (!editPolicy) return;
			const editPartition = props.sessions.partitionKey();
			const editSessionId = sessionIdRef.current;
			setTurnsSynced(turns.slice(0, turnIdx));
			messagesRef.current = messagesRef.current.slice(0, cut);
				window.setTimeout(() => {
					if (
						mountedRef.current &&
						pickerPolicyIsCurrent(editPolicy) &&
					props.sessions.partitionKey() === editPartition &&
					sessionIdRef.current === editSessionId
				) void runAgent(newText);
			}, 30);
		},
		[running, turns, setTurnsSynced, runAgent, snapshotPickerPolicy, pickerPolicyIsCurrent, props.sessions]
	);

	/* v0.1.165: each slash row carries a visual kind so the popover mirrors
	   Hermes' reference vocabulary (icon + accent per kind). */
	type SlashRowKind = "command" | "skill" | "snippet";
	type SlashMenuState =
		| { kind: "cmd"; rows: { name: string; desc: string; group?: string; fill?: string; rowKind: SlashRowKind }[] }
		| { kind: "opt"; cmd: string; rows: { value: string; meta: string; rowKind: SlashRowKind }[] };

	/* skills catalog for the slash popover (Hermes "Skills" group): loaded on
	   mount and whenever the skills folder flips */
	const [slashSkills, setSlashSkills] = useState<Skill[]>([]);
	useEffect(() => {
		let cancelled = false;
		const policy = snapshotPickerPolicy();
		if (!policy) {
			setSlashSkills([]);
			return () => {
				cancelled = true;
			};
		}
		runner.skillsForPolicy(policy)
			.loadSkills()
			.then((list) => {
				if (cancelled) return;
				try {
					if (runner.snapshotWorkspacePolicy().scopeKey !== policy.scopeKey) return;
				} catch {
					return;
				}
				setSlashSkills(list);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [runner, snapshotPickerPolicy, settings.skillsFolder, settings.skillsEnabled]);

	/* Hermes slash-chip predicates: only NO-ARG commands chip (as invocations),
	   skills chip anywhere (slash-refs.ts chippableKind) */
	const chipResolver = useMemo(
		(): ChipScanOptions => ({
			isCommandChippable: (name) => {
				const row = SLASH_COMMANDS.find((c) => c.name === `/${name}`);
				return !!row && !row.args;
			},
			isSkill: (name) => slashSkills.some((s) => skillSlug(s.name) === name),
		}),
		[slashSkills]
	);

	/* official desktop argumentMode parity (v0.1.21): once the command token
	   is complete and a space follows, the popover completes the ARGUMENT —
	   /personality overlays, /approvals modes, /model catalog, /profile ids */
	const slashMenu = useMemo((): SlashMenuState => {
		const trimmed = input.trimStart();
		if (!trimmed.startsWith("/")) return { kind: "cmd", rows: [] };
		const stage = /^(\/[a-z]+)\s+(.*)$/i.exec(trimmed);
		if (stage) {
			const cmd = stage[1].toLowerCase();
			const prefix = (stage[2] ?? "").toLowerCase();
			let opts: { value: string; meta: string; rowKind: SlashRowKind }[] = [];
			if (cmd === "/personality") {
				opts = [
					...Object.keys(PERSONALITY_OVERLAYS).map((k) => ({ value: k, meta: "session overlay", rowKind: "command" as SlashRowKind })),
					{ value: "none", meta: "clear the overlay", rowKind: "command" as SlashRowKind },
				];
			} else if (cmd === "/approvals") {
				opts = [
					{ value: "manual", meta: "approve every tool call", rowKind: "command" as SlashRowKind },
					{ value: "cautious", meta: "persistent/destructive/scheduling actions ask", rowKind: "command" as SlashRowKind },
					{ value: "yolo", meta: "never ask (Hermes --yolo)", rowKind: "command" as SlashRowKind },
				];
			} else if (cmd === "/model") {
				opts = models.map((m) => ({ value: m, meta: "active provider catalog", rowKind: "command" as SlashRowKind }));
			} else if (cmd === "/profile") {
				opts = settings.profiles.map((p) => ({ value: p.id, meta: p.name, rowKind: "command" as SlashRowKind }));
			} else if (cmd === "/skills" || cmd === "/skill") {
				/* two-level completion: verbs first, then the verb + skill name
				   (Hermes skill commands ranked in the "Skills" group) */
				const sub = stage[2] ?? "";
				const sp = sub.indexOf(" ");
				const verb = (sp < 0 ? sub : sub.slice(0, sp)).toLowerCase();
				if (sp >= 0 && (verb === "read" || verb === "use")) {
					opts = slashSkills.map((s) => ({ value: `${verb} ${s.name}`, meta: s.description || "installed skill", rowKind: "skill" as SlashRowKind }));
				} else {
					opts = [
						{ value: "list", meta: "show installed skills", rowKind: "skill" as SlashRowKind },
						{ value: "read", meta: "load a skill into your next message", rowKind: "skill" as SlashRowKind },
						{ value: "use", meta: "arm a skill for the next message (even if disabled)", rowKind: "skill" as SlashRowKind },
					];
				}
			}
			if (opts.length > 0) {
				return { kind: "opt", cmd, rows: opts.filter((o) => o.value.toLowerCase().startsWith(prefix)) };
			}
			return { kind: "cmd", rows: [] };
		}
		if (input.includes(" ")) return { kind: "cmd", rows: [] };
		const commandRows = SLASH_COMMANDS.filter((c) => c.name.startsWith(input))
			.map((c) => ({ name: c.name, desc: c.desc, group: "Commands", rowKind: "command" as SlashRowKind }));
		/* Hermes "Skills" group: the catalog's skills appear right below the
		   Commands group on a bare "/"; picking one stages the typed verb so an
		   instruction can follow before Enter */
		const needle = input.slice(1).toLowerCase();
		const skillRows = slashSkills
			.filter((s) => (needle ? s.name.toLowerCase().includes(needle) : true))
			.map((s) => ({
				name: s.name,
				desc: s.description || "installed skill",
				group: "Skills",
				fill: `/skills use ${s.name} `,
				rowKind: "skill" as SlashRowKind,
			}));
		/* "Snippets" slash group (v0.1.77 Commands tab, Copilot
		   showInSlashMenu parity): snippets flagged `slash` in Settings →
		   Commands appear here; picking one stages the FULL prompt text
		   into the composer (fill: semantics — load into chat input) */
		const snippetRows = (settings.promptSnippets ?? [])
			.filter((sn) => sn.slash === true)
			.filter((sn) =>
				needle
					? sn.title.toLowerCase().includes(needle) || snippetSlug(sn.title).includes(needle)
					: true
			)
			.map((sn) => ({ name: `/${snippetSlug(sn.title)}`, desc: sn.title, group: "Snippets", fill: sn.text, rowKind: "snippet" as SlashRowKind }));
		return { kind: "cmd", rows: [...commandRows, ...skillRows, ...snippetRows] };
	}, [input, models, settings.profiles, slashSkills, settings.promptSnippets]);

	/* v0.1.165: pick a slash row — shared by click and keyboard nav. */
	const acceptSlashRow = useCallback(
		(row: { name?: string; value?: string; fill?: string }) => {
			if (slashMenu.kind === "opt" && row.value !== undefined) {
				setInput(`${slashMenu.cmd} ${row.value} `);
				return;
			}
			if (row.fill) {
				setInput(row.fill);
				window.setTimeout(() => composerRef.current?.focus(), 0);
				return;
			}
			setInput("");
			const name = row.name ?? "";
			if (["/model", "/personality", "/approvals", "/profile", "/skills"].includes(name)) setInput(name + " ");
			else void runSlash(name);
		},
		[slashMenu, runSlash]
	);

	/* v0.1.167 (owner: "arrow key select tidak ikut"): keep the highlighted
	   row visible while navigating — mirror Hermes trigger-popover.tsx local
	   scroll (block: nearest). We adjust ONLY the list's own scrollTop; we
	   deliberately never invoke a viewport-scrolling helper that would also
	   move outer ancestors like the transcript. */
	useEffect(() => {
		const list = slashMenuRef.current;
		if (!list || slashMenu.rows.length === 0) return;
		if (slashIndex === 0) {
			list.scrollTop = 0;
			return;
		}
		const active = list.querySelector<HTMLElement>(".oa-slash-item.is-active");
		if (!active) return;
		const listRect = list.getBoundingClientRect();
		const activeRect = active.getBoundingClientRect();
		const topDelta = activeRect.top - listRect.top;
		const bottomDelta = activeRect.bottom - listRect.bottom;
		const overflowsTop = topDelta < 0;
		const overflowsBottom = bottomDelta > 0;
		if (overflowsTop === overflowsBottom) return;
		list.scrollTop += Math.abs(topDelta) < Math.abs(bottomDelta) ? topDelta : bottomDelta;
	}, [slashIndex, slashMenu.rows]);

	/* keyboard drive for the slash + @ popups — capture phase, before
	   PromptInput's Enter. Slash first (Hermes: highlight + Arrow/Enter/Tab). */
	const handleComposerKeys = useCallback(
		(e: ReactKeyboardEvent) => {
			/* queue-edit mode: Esc cancels the edit and restores the draft that
			   was in the composer (desktop: exit edit without saving) */
			if (e.key === "Escape" && queueEditId) {
				e.preventDefault();
				cancelQueueEdit();
				return;
			}
			if (slashMenu.rows.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setSlashIndex((i) => (i + 1) % slashMenu.rows.length);
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setSlashIndex((i) => (i - 1 + slashMenu.rows.length) % slashMenu.rows.length);
					return;
				}
				if (e.key === "Enter" || e.key === "Tab") {
					e.preventDefault();
					e.stopPropagation();
					const row = slashMenu.rows[Math.min(slashIndex, slashMenu.rows.length - 1)];
					if (row) acceptSlashRow(row as { name?: string; value?: string; fill?: string });
					return;
				}
			}
			/* v0.1.180 (Hermes composer parity): ↑/↓ recall earlier prompts and
			   Escape halts the running turn. Runs only when neither the slash
			   popover nor an @-reference owns the arrow keys. */
			if (slashMenu.rows.length === 0 && !atQuery) {
				const turnTextOf = (t: ConversationTurn): string =>
					t.parts
						.filter((p) => p.kind === "text")
						.map((p) => (p as { text: string }).text)
						.join(" ")
						.trim();
				if (e.key === "ArrowUp") {
					/* priority: queue edit → empty draft + queued turn → history */
					if (queueEditId) {
						e.preventDefault();
						stepQueueEdit(-1);
						return;
					}
					if (!input.trim() && queue.length > 0) {
						e.preventDefault();
						beginQueueEdit(queue[queue.length - 1]);
						return;
					}
					/* never hijack a typed draft unless already browsing */
					if (input.trim() && !historyBrowseRef.current.isBrowsing()) return;
					const history = deriveUserHistory(turns, turnTextOf);
					const entry = historyBrowseRef.current.browseBackward(input, history);
					if (entry !== null) {
						e.preventDefault();
						setInput(entry);
					}
					return;
				}
				if (e.key === "ArrowDown") {
					if (queueEditId) {
						e.preventDefault();
						stepQueueEdit(1);
						return;
					}
					if (historyBrowseRef.current.isBrowsing()) {
						const history = deriveUserHistory(turns, turnTextOf);
						const result = historyBrowseRef.current.browseForward(history);
						if (result !== null) {
							e.preventDefault();
							setInput(result.text);
						}
					}
					return;
				}
				if (e.key === "Escape" && running) {
					/* Stop-button parity: Esc interrupts the running turn (the
					   queue-edit and @-menu Esc cases are handled above). */
					e.preventDefault();
					haltAgent();
				}
			}

			if (!atQuery) return;
			if (atMatches.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setAtIndex((i) => (i + 1) % atMatches.length);
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setAtIndex((i) => (i - 1 + atMatches.length) % atMatches.length);
					return;
				}
				if (e.key === "Enter" || e.key === "Tab") {
					e.preventDefault();
					e.stopPropagation();
					acceptAt(atMatches[Math.min(atIndex, atMatches.length - 1)]);
					return;
				}
			}
			if (e.key === "Escape" && atQuery) {
				e.preventDefault();
				setAtQuery(null);
			}
		},
		[atQuery, atMatches, atIndex, acceptAt, queueEditId, cancelQueueEdit, slashMenu, slashIndex, acceptSlashRow, input, queue, turns, running, stepQueueEdit, beginQueueEdit, haltAgent]
	);

	const filteredSessions = useMemo(() => {
		const f = panelFilter.trim().toLowerCase();
		const list = f
			? sessionList.filter((s) => s.title.toLowerCase().includes(f) || (panelHits?.has(s.id) ?? false))
			: sessionList;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const yesterday = today.getTime() - 86400000;
		const week = today.getTime() - 7 * 86400000;
		const groups: { label: string; items: SessionMeta[] }[] = [
			{ label: "Today", items: [] },
			{ label: "Yesterday", items: [] },
			{ label: "Previous 7 days", items: [] },
			{ label: "Older", items: [] },
		];
		for (const s of list) {
			if (s.updatedAt >= today.getTime()) groups[0].items.push(s);
			else if (s.updatedAt >= yesterday) groups[1].items.push(s);
			else if (s.updatedAt >= week) groups[2].items.push(s);
			else groups[3].items.push(s);
		}
		return groups.filter((g) => g.items.length > 0);
	}, [sessionList, panelFilter, panelHits]);

	/* effective connection — the active profile may pin provider/model */
	const conn = resolveConnection(settings);
	/* v0.1.159 (A3 TokenTag): resolve the context window lazily per connection
	   (cached provider lookup). Stale-guarded by key so a switch can't paint
	   the previous model's window. */
	useEffect(() => {
		const providerId = conn.providerId;
		const model = conn.model;
		const key = `${providerId}|${model}`;
		if (!providerId || !model) {
			setContextWindow(settings.modelContextLength > 0 ? settings.modelContextLength : null);
			contextWindowConnRef.current = key;
			return;
		}
		const provider = settings.providers.find((p) => p.id === providerId);
		if (!provider?.baseUrl.trim()) {
			setContextWindow(settings.modelContextLength > 0 ? settings.modelContextLength : null);
			contextWindowConnRef.current = key;
			return;
		}
		contextWindowConnRef.current = key;
		void fetchAdvertisedContextLength(provider, model).then((advertised) => {
			if (contextWindowConnRef.current !== key) return;
			setContextWindow(resolveContextWindow(settings.modelContextLength, advertised));
		});
	}, [conn.providerId, conn.model, settings.modelContextLength, settings.providers]);
	/* MoA picker surface (official _raw_config_has_enabled_moa_preset rule):
	   the virtual provider appears only when the user has SAVED ≥1 enabled
	   preset; once shown it lists every preset (enabled or not). */
	const moaRenderCfg = settings.moa ? normalizeMoaConfig(settings.moa) : null;
	const moaActiveName =
		moaRenderCfg?.active_preset && moaRenderCfg.presets[moaRenderCfg.active_preset] ? moaRenderCfg.active_preset : "";
	const moaPickerNames =
		moaRenderCfg && Object.values(moaRenderCfg.presets).some((p) => p.enabled !== false) ? Object.keys(moaRenderCfg.presets) : [];
	const activeProfile = settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0];
	/* intro copy seed: hash the session id so each fresh chat rotates picks
	   deterministically (official bumps introSeed per new draft) */
	const introSeed = useMemo(() => {
		let h = 0;
		for (let i = 0; i < sessionId.length; i++) h = (h * 31 + sessionId.charCodeAt(i)) >>> 0;
		return h;
	}, [sessionId]);
	const provider = settings.providers.find((p) => p.id === conn.providerId) ?? getActiveProvider(settings);
	const activeFile = props.app.workspace.getActiveFile();
	const empty = turns.length === 0;
	/* v0.1.168 amended: the sessions panel is one floating bottom sheet on
	   every platform. No per-platform branch — one shell everywhere. */

	/* ---------------- render ---------------- */

	return (
		<FileUpload
			onFilesAdded={addFiles}
			pdfWorker={props.pluginDir ? { app: props.app, pluginDir: props.pluginDir } : undefined}
			onRejected={(file, reason) => new Notice(`Open Agent: skipped “${file.name}” — ${reason}.`)}
		>
		<div className="oa-app">
			{/* ---------- header ---------- */}
			<header className="oa-topbar">
				<span className="oa-topbar-title">Open Agent</span>
				<ProfilePicker
					profiles={settings.profiles}
					activeId={settings.activeProfileId}
					disabled={running}
					onSelect={(id) => void props.applyProfile(id)}
					onManage={() => props.openSettings("profiles")}
				/>
				{running ? (
					<span className="oa-topbar-status">
						<span className="oa-pulse-dot" /> working
					</span>
				) : null}
				<span className="oa-spacer" />
				<button className="oa-icon-btn" aria-label="New chat" onClick={newConversation}>
					<PlusIcon size={15} />
				</button>
				<button
					ref={panelToggleRef}
					className={`oa-icon-btn${panelOpen ? " is-on" : ""}`}
					aria-label="Conversations"
					onClick={() => {
						setPanelOpen(!panelOpen);
						setPanelFilter("");
						void refreshSessions();
					}}
				>
					<RotateCcwIcon size={15} />
				</button>
				<button className="oa-icon-btn" aria-label="Settings" onClick={() => props.openSettings()}>
					<SettingsIcon size={15} />
				</button>
			</header>

			{/* ---------- body ---------- */}
			<div className="oa-body">
				<ChatContainer>
					{empty ? (
						<div className="oa-empty">
							{/* v0.1.35 (owner pick: super-minimal): Hermes Desktop
							    Intro parity — wordmark + one rotating copy line,
							    nothing else. A misconfigured provider surfaces via
							    the composer pill instead ("Select model").
							    v0.1.150: Appearance → Intro screen hides this. */}
							{settings.showIntroScreen ? <Intro personality={sessionOverlay ?? undefined} seed={introSeed} /> : null}
						</div>
					) : (
					turns.map((turn, ti) => {
					/* system turns (v0.1.57): quiet banner, never the assistant bubble
					   chrome (no actions, no tapback, no feedback bar) */
					if (turn.role === "system") {{
						const cta = turn.noticeCta;
						return (
							<SystemMessage
								key={turn.id}
								variant={turn.notice ?? "action"}
								cta={cta ? { label: cta.label, onClick: () => openChangedFile(cta.openPath, false) } : undefined}
							>
								<MarkdownDoc app={props.app} component={props.renderComponent}>
									{turn.parts
										.filter((p) => p.kind === "text")
										.map((p) => (p as { text: string }).text)
										.join("\n")}
								</MarkdownDoc>
							</SystemMessage>
						);
					}}
					const isRunningTurn = running && turn.id === assistantTurnRef.current;
					const toolParts = turn.parts.filter((p) => p.kind === "tool");
						const textParts = turn.parts.filter((p) => p.kind === "text");
						/* v0.1.121: baris kartu menunjuk file yang BENAR-BENAR
						   tertulis — resolve workspaceFolder persis seperti tools */
						const changedFiles = deriveChangedFiles(turn.parts, settings.workspaceFolder);
						const fetchedSources: SourceRef[] = [];
						const seenHref = new Set<string>();
					for (const p of toolParts) {
						if (p.kind !== "tool" || p.toolName !== "web_extract" || p.status !== "done") continue;
						try {
							const parsed = JSON.parse(p.args) as { urls?: unknown; url?: unknown };
							const urls = Array.isArray(parsed.urls)
								? parsed.urls.map((u) => String(u ?? "")).filter(Boolean)
								: [String(parsed.url ?? "")].filter(Boolean); // legacy single-url wire rows
							for (const url of urls) {
								if (!seenHref.has(url)) {
									seenHref.add(url);
									fetchedSources.push({ href: url });
								}
							}
						} catch {
							/* malformed args — skip */
						}
					}

						// Chronological trace: group consecutive parts of the same kind
					// into blocks so the agent's work renders in the order it happened
					// (think → act → think → answer). Only the last block streams;
					// earlier ones auto-collapse as the turn moves on.
					const blocks: TraceBlock[] = [];
					for (const part of turn.parts) {
						const last = blocks[blocks.length - 1];
						if (last && last.kind === part.kind) {
							(last.parts as TurnPart[]).push(part);
						} else if (part.kind === "reasoning") {
							blocks.push({ kind: "reasoning", parts: [part] });
					} else if (part.kind === "tool") {
						blocks.push({ kind: "tool", parts: [part] });
					} else if (part.kind === "marker") {
						blocks.push({ kind: "marker", parts: [part] });
					} else {
						blocks.push({ kind: "text", parts: [part] });
					}
					}

					return (
						<Message key={turn.id} role={turn.role} timestamp={turn.timestamp} showTimestamp={settings.showTimestamps} onDoubleClick={turnTapback(turn)}>
							{editingTurnId === turn.id ? (
								<div className="oa-msg-editbox">
									<textarea
										className="oa-msg-editarea"
										value={editDraft}
										autoFocus
										rows={Math.min(10, Math.max(2, editDraft.split("\n").length))}
										onChange={(e) => setEditDraft(e.target.value)}
										onKeyDown={(e) => {
											/* v0.1.116: rasa editor markdown — Enter polos tetap commit;
											   Shift+Enter melanjutkan list, Tab/Shift+Tab indentasi, auto-pair. */
											if (markdownTextareaKeydown(e, e.currentTarget, { newlineOnShiftEnter: true })) return;
											if (e.key === "Enter" && !e.shiftKey) {
												e.preventDefault();
												const next = editDraft.trim();
												if (next) {
													setEditingTurnId(null);
													editAndResend(ti, next);
												}
											} else if (e.key === "Escape") {
												setEditingTurnId(null);
											}
										}}
										aria-label="Edit message"
									/>
									<div className="oa-msg-edit-actions">
										<button
											className="oa-msg-edit-btn is-save"
											onClick={() => {
												const next = editDraft.trim();
												if (next) {
													setEditingTurnId(null);
													editAndResend(ti, next);
												}
											}}
											aria-label="Save and resend"
										>
											Save
										</button>
										<button
											className="oa-msg-edit-btn"
											onClick={() => setEditingTurnId(null)}
											aria-label="Cancel edit"
										>
											Cancel
										</button>
									</div>
								</div>
							) : (
							<>
						{/* owner ask 2026-07-22: files sent with this message stay
						    visible as chips above the bubble text (read-only;
						    regeneration/edit-resend re-sends text only — see the
						    honest caveat in runSlash) */}
						{turn.role === "user" && turn.attachments && turn.attachments.length > 0 ? (
							<div className="oa-msg-attach" aria-label="Attachments sent with this message">
								{turn.attachments.map((f, i) => (
									<span
										key={`${turn.id}-attach-${i}`}
										className={`oa-attach-chip ${f.kind === "image" ? "is-image" : "is-file"}`}
									>
										{f.kind === "image" ? (
											<ImageIcon size={11} />
										) : f.path ? (
											<NoteIcon size={11} />
										) : (
											<FileTextIcon size={11} />
										)}
										<span className="oa-attach-chip-name">{f.path ?? f.name}</span>
										{f.size > 0 ? (
											<span className="oa-attach-chip-size">
												{f.size >= 1048576
													? `${(f.size / 1048576).toFixed(1)} MB`
													: f.size >= 1024
														? `${Math.round(f.size / 1024)} KB`
														: `${f.size} B`}
											</span>
										) : null}
									</span>
								))}
							</div>
						) : null}
						{blocks.map((block, bi) => {
							// Only the chronologically last block streams; everything
							// before it has already finished, so it renders collapsed.
							const streamingBlock = isRunningTurn && bi === blocks.length - 1;
						if (block.kind === "reasoning" && turn.role === "assistant") {
							// Hermes: a reasoning group with no visible text is pure
							// noise — drop the whole header rather than eat a row.
							if (!block.parts.some((p) => p.text.trim().length > 0)) return null;
							// Aggregate duration keeps the collapsed header informative.
							const thoughtMs = block.parts.every((p) => p.durationMs != null)
								? block.parts.reduce((sum, p) => sum + (p.durationMs ?? 0), 0)
								: null;
							/* 2026-08-02 v0.1.40 — Hermes Desktop verbatim
							   (thread/message-parts.tsx): ONE finished label, never
							   title+meta together (that pair printed "Thought
							   Thought for Ns"). No duration → "Thought"; < 1s →
							   "Thought briefly"; else "Thought for Ns" in whole
							   seconds (Ns under a minute, m:ss above it). */
							const thoughtSeconds = thoughtMs != null ? Math.max(0, Math.round(thoughtMs / 1000)) : null;
							const thoughtLabel =
								thoughtSeconds == null
									? "Thought"
									: thoughtSeconds < 1
										? "Thought briefly"
										: `Thought for ${thoughtSeconds < 60 ? `${thoughtSeconds}s` : `${Math.floor(thoughtSeconds / 60)}:${String(thoughtSeconds % 60).padStart(2, "0")}`}`;
							/* prompt-kit semantics: streamed thinking text → Reasoning
							   (auto-open while streaming, auto-close on finish unless
							   the user toggled it). ChainOfThought is for structured
							   step plans, not for raw thinking. */
							return (
								<Reasoning
									key={`${turn.id}-reasoning-${bi}`}
									disclosureId={`oa-trace:${sessionId}:${turn.id}:${bi}:reasoning`}
									isStreaming={streamingBlock}
									defaultOpen={!settings.reasoningCollapsedByDefault}
								>
								<ReasoningTrigger>
									{streamingBlock ? <TextShimmer duration={1.2}>Thinking…</TextShimmer> : thoughtLabel}
								</ReasoningTrigger>
									<ReasoningContent live={streamingBlock}>
										{block.parts
											.map((p) => p.text)
											.join("\n\n")
											.trim()}
									</ReasoningContent>
								</Reasoning>
							);
						}
							if (block.kind === "tool" && turn.role === "assistant") {
								/* prompt-kit semantics: one Tool card per invocation,
								   AI SDK v5 states carried by the badge (Processing →
								   Ready → Completed/Error/Denied). Steps is for progress
								   logs/plans, not for tool-call detail. v0.1.150:
								   Appearance → Tool calls switches expanded/collapsed/
								   hidden (hidden still keeps Sources + changed-files). */
								if (settings.toolViewMode === "hidden") return null;
								return (
									<div key={`${turn.id}-tools-${bi}`} className="oa-tools-list">
										{block.parts.map((p) => (
											<Tool key={p.toolCallId} toolPart={toToolPart(p)} defaultOpen={settings.toolViewMode === "expanded"} maxDisplayChars={settings.toolOutputMaxChars} />
										))}
									</div>
								);
							}
							if (block.kind === "marker") {
								return (
									<div key={`${turn.id}-marker-${bi}`} className="oa-turn-marker">
										<ZapIcon size={11} />
										<span>{block.parts.map((p) => p.text).join(" ")}</span>
									</div>
								);
							}
						return block.parts.map((p, i) => {
							const text = p.kind === "text" ? p.text : "";
							/* hybrid markdown: plain pre-wrap while streaming (stable, no
							   flicker from re-parsing partial markdown), full render on finish */
							if (turn.role === "assistant") {
								return streamingBlock ? (
									<span key={`${turn.id}-text-${bi}-${i}`} className="oa-stream-text">
										{text}
									</span>
								) : (
									<MarkdownDoc key={`${turn.id}-text-${bi}-${i}`} app={props.app} component={props.renderComponent}>
										{text}
									</MarkdownDoc>
								);
							}
							return (
								<span key={`${turn.id}-text-${bi}-${i}`} className="oa-user-text">
									{text.includes("/") ? <ChipText text={text} resolver={chipResolver} /> : text}
								</span>
							);
						});
						})}
						</>
						)}
						{/* ThinkingBar covers every token-free window: initial thinking
						    plus the inter-iteration "Waiting for the model…" gaps. Tool-call
						    previews and running tools carry their own live indicators. */}
						{isRunningTurn && (turn.parts.length === 0 || liveStatus !== null) ? (
							<ThinkingBar text={liveStatus ?? "Thinking"} onStop={haltAgent} stopLabel="Interrupt" />
						) : null}
							{turn.role === "assistant" && !running && fetchedSources.length > 0 ? (
								<Sources sources={fetchedSources} />
							) : null}
							{turn.role === "assistant" && !running && textParts.length > 0 ? (
								/* footrow: a LANDED tapback never rides the hover-reveal
								   actions row (official) — it stands beside it */
								<div className="oa-msg-footrow">
									<MessageActions>
										<MessageAction
											tooltip="Insert at cursor"
											onClick={() =>
												insertIntoNote(textParts.map((p) => (p.kind === "text" ? p.text : "")).join("\n"))
											}
										>
											<TextCursorInputIcon size={13} />
										</MessageAction>
										<CopyAction
											getText={() =>
												canonicalizeAssistantOutput(textParts.map((p) => (p.kind === "text" ? p.text : "")).join("\n"))
											}
										/>
										{ti === turns.length - 1 ? (
											<MessageAction tooltip="Regenerate" onClick={() => void runSlash("/retry")}>
												<RefreshIcon size={13} />
											</MessageAction>
										) : null}
										</MessageActions>
								</div>
							) : null}
							{changedFiles.length > 0 ? <ChangedFilesCard files={changedFiles} onOpen={openChangedFile} /> : null}
						{turn.role === "assistant" && !running && textParts.length > 0 && settings.showReactions && showFeedbackBar(turn) ? (
							<div className="oa-feedback-slot">
								<FeedbackBar
									title="Was this helpful?"
									onHelpful={() => toggleFeedback(turn.id, "up")}
									onNotHelpful={() => toggleFeedback(turn.id, "down")}
									onClose={() => dismissFeedback(turn.id)}
								/>
							</div>
						) : null}
						{turn.role === "user" && !running && editingTurnId !== turn.id && textParts.length > 0 ? (
								<div className="oa-msg-footrow">
									<MessageActions>
										<CopyAction
											getText={() =>
												textParts.map((p) => (p.kind === "text" ? p.text : "")).join("\n")
											}
										/>
										<MessageAction
											tooltip="Edit"
											onClick={() => {
												setEditingTurnId(turn.id);
												setEditDraft(canonicalizeAssistantOutput(textParts.map((p) => (p.kind === "text" ? p.text : "")).join("\n")));
											}}
										>
											<PencilIcon size={13} />
										</MessageAction>
										</MessageActions>
								</div>
							) : null}
						</Message>
						);
					})
				)}
				</ChatContainer>

				{/* ---------- composer zone ---------- */}
				<div className="oa-composer-zone" onKeyDownCapture={handleComposerKeys}>
					{clarify ? (
						<ClarifyCard
							req={clarify.req}
								onAnswer={(a) => {
									if (!pickerPolicyIsCurrent(clarify.workspacePolicy)) {
										clarify.resolve("");
										setClarify(null);
										return;
									}
									clarify.resolve(a);
									setClarify(null);
								}}
							/* Hermes timeout semantics as an EXPLICIT gesture (we don't
							   auto-skip — an Obsidian chat is not a terminal
							   with a 120s egg-timer on it) */
								onSkip={() => {
									if (!pickerPolicyIsCurrent(clarify.workspacePolicy)) {
										clarify.resolve("");
										setClarify(null);
										return;
									}
									clarify.resolve("The user skipped this question. Use your best judgement to make the choice and proceed.");
									setClarify(null);
								}}
						/>
					) : null}
					{approval ? (
						<div className="oa-overlay">
							<div className="oa-approval">
								<div className="oa-approval-head">
									<ZapIcon size={14} />
									<span>
										Allow <code>{approval.req.toolName}</code>
										{" — " + approvalKindLabel(approval.req.kind)}?
									</span>
								</div>
								{approval.preview ? (
									<PreviewDiff
										path={approval.preview.path}
										mode={approval.preview.mode}
										original={approval.preview.original}
										proposed={approval.preview.proposed}
										stale={approval.stale === true}
									/>
								) : approval.previewError ? (
									<div className="oa-preview-error">
										{approval.previewError} — approving runs the tool as-is and it will surface this to the agent.
									</div>
								) : (
									<pre className="oa-approval-args">
										{/* Prepared terminal commands are bounded before this point and must
										    remain fully visible: never silently truncate an approval snapshot. */}
										{JSON.stringify(approval.req.details ?? approval.req.args, null, 2)}
									</pre>
								)}
								<div className="oa-approval-actions">
									<button
										className="oa-btn oa-btn-primary"
										onClick={async () => {
											if (!pickerPolicyIsCurrent(approval.workspacePolicy)) {
												approval.resolve("deny");
												setApproval(null);
												new Notice("Open Agent: Workspace changed — approval denied; run the request again.");
												return;
											}
											/* stale guard (v0.1.58 — beyond Copilot's ApplyView): the
											   note must still match the preview's snapshot; if not,
											   flip to a Recheck state instead of writing blind */
											if (approval.preview) {
												const af = props.app.vault.getAbstractFileByPath(approval.preview.path);
												const mtime = af instanceof TFile ? af.stat.mtime : null;
												if (mtime !== approval.preview.mtime) {
													setApproval({ ...approval, stale: true });
													return;
												}
											}
											approval.resolve("allow-once");
											setApproval(null);
										}}
									>
										<CheckIcon size={13} /> {approval.preview ? "Accept & write" : "Allow once"}
									</button>
									{approval.stale ? (
										<button
											className="oa-btn"
												onClick={async () => {
													if (!pickerPolicyIsCurrent(approval.workspacePolicy)) {
														approval.resolve("deny");
														setApproval(null);
														return;
													}
													const next = await buildApprovalPreview(approval.req, approval.workspacePolicy, approval.settings);
													if (!pickerPolicyIsCurrent(approval.workspacePolicy)) {
														approval.resolve("deny");
														setApproval(null);
														return;
													}
													setApproval(next ? { ...approval, ...next, stale: false } : null);
											}}
											aria-label="Re-read the note and rebuild the diff"
										>
											<RefreshIcon size={13} /> Recheck
										</button>
									) : null}
									{approval.req.allowAlways ? (
										<button
											className="oa-btn"
											onClick={() => {
												if (!pickerPolicyIsCurrent(approval.workspacePolicy)) {
													approval.resolve("deny");
													setApproval(null);
													new Notice("Open Agent: Workspace changed — approval denied; run the request again.");
													return;
												}
												if (approval.preview) {
													const af = props.app.vault.getAbstractFileByPath(approval.preview.path);
													const mtime = af instanceof TFile ? af.stat.mtime : null;
													if (mtime !== approval.preview.mtime) {
														setApproval({ ...approval, stale: true });
														return;
													}
												}
												approval.resolve("allow-always");
												setApproval(null);
											}}
										>
											Allow this type for session
										</button>
									) : null}
									<button
										className="oa-btn oa-btn-danger"
										onClick={() => {
											approval.resolve("deny");
											setApproval(null);
										}}
									>
										<XIcon size={13} /> Deny
									</button>
								</div>
							</div>
						</div>
					) : null}

					{slashMenu.rows.length > 0 ? (
						<div className="oa-overlay oa-slash-overlay">
							<div className="oa-slash-menu" role="listbox" aria-label="Commands" ref={slashMenuRef}>
								{(() => {
									/* v0.1.165 (Hermes trigger-popover parity): one row
									   shape for both menu kinds — icon + name + desc,
									   with the active row highlighted (keyboard AND
									   hover). */
									const flat: { key: string; rowKind: SlashRowKind; name: string; desc: string; group?: string; value?: string; fill?: string }[] =
										slashMenu.kind === "opt"
											? slashMenu.rows.map((o) => ({ key: o.value, rowKind: o.rowKind, name: o.value, desc: o.meta, value: o.value }))
											: slashMenu.rows.map((c) => ({ key: `${c.group ?? "g"}:${c.name}`, rowKind: c.rowKind, name: c.name, desc: c.desc, group: c.group, fill: c.fill }));
									let lastGroup: string | undefined;
									return flat.map((r, i) => {
										const showHeader = r.group && r.group !== lastGroup;
										lastGroup = r.group || lastGroup;
										return (
											<Fragment key={r.key}>
												{showHeader ? <div className="oa-slash-hdr">{r.group}</div> : null}
												<button
													type="button"
													role="option"
													aria-selected={i === slashIndex}
													className={`oa-slash-item${i === slashIndex ? " is-active" : ""}`}
													onMouseEnter={() => setSlashIndex(i)}
													onClick={() => acceptSlashRow(r)}
												>
													<span className={`oa-slash-item-icon oa-slash-kind-${r.rowKind}`} aria-hidden="true">
														{r.rowKind === "command" ? <TerminalIcon size={13} /> : r.rowKind === "skill" ? <ZapIcon size={13} /> : <SnippetIcon size={13} />}
													</span>
													<span className="oa-slash-item-name">{r.name}</span>
													<span className="oa-slash-item-desc">{r.desc}</span>
												</button>
											</Fragment>
										);
									});
								})()}
							</div>
						</div>
					) : null}

					{atQuery && atMatches.length > 0 ? (
						<div className="oa-overlay">
							<div className="oa-slash-menu oa-at-menu" role="listbox" aria-label="File references">
								{atMatches.map((f, i) => (
									<button
										key={f.path}
										role="option"
										aria-selected={i === atIndex}
										className={`oa-slash-item${i === atIndex ? " is-active" : ""}`}
										onMouseEnter={() => setAtIndex(i)}
										onClick={() => acceptAt(f)}
									>
										<code>@{f.basename}</code>
										<span>{f.path === f.name ? "vault root" : f.path.slice(0, Math.max(0, f.path.length - f.name.length - 1))}</span>
									</button>
								))}
							</div>
						</div>
					) : null}

					{/* ---------- sessions panel (slash-menu-style popover) ---------- */}
					{panelOpen ? (
						<SessionPanel
							app={props.app}
							panelRef={panelRef}
							compact={settings.sessionListDensity === "compact"}
							filter={panelFilter}
							groups={filteredSessions}
							hits={panelHits}
							activeSessionId={sessionId}
							onFilter={setPanelFilter}
							onNew={newConversation}
							onClose={() => setPanelOpen(false)}
							onSelect={(id) => void loadConversation(id)}
							onRename={renameSession}
							onDelete={deleteSession}
						/>
					) : null}
					{selBar
						? /* v0.1.102 (owner: "masih sama" — bar dirender tapi tak pernah tampak;
						     diagnostik babak 2 terukur: barTerender:true, rect l:1345 di LUAR
						     viewport, offsetParent=DIV.workspace-leaf): core Obsidian memasang
						     contain:strict di .workspace-leaf → elemen fixed di dalam pane
						     ter-re-anchor ke leaf, jadi left/top yang diukur dari ruang
						     viewport dicat bergeser (+leaf.x,+leaf.y) — di mesin owner sampai
						     keluar layar. Portal ke document.body: body membentang penuh
						     jendela dari origin (0,0), jadi koordinat terukur = koordinat
						     tercatat (preseden: panel quick-ask & semua menu/tooltip core
						     Obsidian). Selektor CSS ikut re-root ke .oa-selbar .oa-selbar-btn
						     — payung reset .oa-app tidak menaungi elemen portal; netralisasi
						     core button kini eksplisit di styles.css. */
							createPortal(
								<div
							className={`oa-selbar${selBar.below ? " is-below" : ""}`}
							style={{ left: selBar.x, top: selBar.y }}
							role="toolbar"
							aria-label="Selection actions"
						>
							<button
								type="button"
								className="oa-selbar-btn"
								/* icon-only: aria-label doubles as Obsidian's native
								   hover tooltip (no title attr per hygiene guard) */
								aria-label="Quote"
								/* mousedown default would collapse the highlight before
								   onClick reads it — keep it alive until the click lands */
								onMouseDown={(e) => e.preventDefault()}
								onClick={quoteSelection}
							>
								<QuoteIcon size={14} />
							</button>
							<button
								type="button"
								className={`oa-selbar-btn${selCopied ? " is-done" : ""}`}
								aria-label={selCopied ? "Copied" : "Copy"}
								onMouseDown={(e) => e.preventDefault()}
								onClick={copySelection}
							>
								{selCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
							</button>
							</div>,
							document.body
							)
						: null}

					{queue.length > 0 ? (
						<div className="oa-queue">
							<div className="oa-queue-head">
								<span className="oa-queue-count">
									{queueParked ? `${queue.length} queued · paused` : `${queue.length} queued`}
								</span>
								{queueParked ? (
									<button
										type="button"
										className="oa-queue-resume"
										aria-label="Resume queue"
										onClick={() => {
											unparkQueue(sessionId);
											setQueueParked(false);
										}}
									>
										Resume
									</button>
								) : null}
							</div>
							{queue.map((entry) => (
								<div key={entry.id} className={`oa-queue-row${queueEditId === entry.id ? " is-editing" : ""}`}>
									<span className="oa-queue-text">
										{(entry.displayText ?? entry.text).trim() || (entry.attachments.length > 0 ? "(attachment only)" : "(empty)")}
									</span>
									{entry.attachments.length > 0 ? (
										<span className="oa-queue-att">+{entry.attachments.length}</span>
									) : null}
									<button
										type="button"
										className="oa-queue-btn"
										aria-label={running ? "Send next (interrupts the current turn)" : "Send now"}
										disabled={queueEditId === entry.id}
										onClick={() => sendQueuedNow(entry)}
									>
										<ArrowUpIcon size={13} />
									</button>
									<button
										type="button"
										className="oa-queue-btn"
										aria-label="Edit queued message"
										disabled={!!queueEditId && queueEditId !== entry.id}
										onClick={() => beginQueueEdit(entry)}
									>
										<PencilIcon size={13} />
									</button>
									<button
										type="button"
										className="oa-queue-btn"
										aria-label="Delete queued message"
										onClick={() => void persistQueue(sessionId, (current) =>
											current.some((queued) => queued.id === entry.id) ? removeEntry(current, entry.id) : null
										)}
									>
										<TrashIcon size={13} />
									</button>
								</div>
							))}
						</div>
					) : null}
					{queueEditId ? <div className="oa-queue-editbar">Editing a queued message — Enter saves, Esc cancels</div> : null}

					<PromptInput
						ref={composerRef}
						value={input}
						onValueChange={handleInputChange}
						chipResolver={chipResolver}
						onSubmit={handleSubmit}
						disabled={false}
						enterToSend={settings.enterToSend}
						allowEmptySubmit={queue.length > 0}
						placeholder={
							running
								? settings.enterToSend
									? "Agent is working — Enter queues this prompt, /stop interrupts…"
									: "Agent is working — Shift+Enter queues this prompt, /stop interrupts…"
								: settings.enterToSend
									? "Ask anything…  (/ for commands)"
									: "Ask anything…  (Shift+Enter to send)"
						}
					attachments={
						(attachNote && activeFile) || pendingFiles.length > 0 ? (
							<>
								{attachNote && activeFile ? (
									<span className="oa-attach-chip is-on">
										<NoteIcon size={11} />
										<span className="oa-attach-chip-name">{activeFile.basename}</span>
										<button className="oa-attach-chip-x" onClick={() => setAttachNote(false)} aria-label="Detach note">
											<XIcon size={10} />
										</button>
									</span>
								) : null}
							{pendingFiles.map((f) => (
								<span key={f.id} className={`oa-attach-chip ${f.kind === "image" ? "is-image" : "is-file"}`}>
									{f.kind === "image" && f.dataUrl ? (
										<img className="oa-attach-chip-thumb" src={f.dataUrl} alt="" />
									) : (
										<FileTextIcon size={11} />
									)}
									<span className="oa-attach-chip-name">{f.name}</span>
										<span className="oa-attach-chip-size">
											{f.size >= 1024 ? `${Math.round(f.size / 1024)} KB` : `${f.size} B`}
										</span>
										<button
											className="oa-attach-chip-x"
											onClick={() => setPendingFiles((prev) => prev.filter((x) => x.id !== f.id))}
											aria-label={`Remove ${f.name}`}
										>
											<XIcon size={10} />
										</button>
									</span>
								))}
							</>
						) : null
					}
					>
					<PromptInputActions>
						{/* left cluster: the [+] attach menu (notes · vault files · disk
						   upload · images · folders · prompt snippets) */}
						<div className="oa-attach-anchor" ref={attachAnchorRef}>
							<button
								type="button"
								className={`oa-attach-toggle${attachMenuOpen ? " is-open" : ""}`}
								aria-label="Attach — notes, files, images, folders, snippets"
								aria-haspopup="menu"
								aria-expanded={attachMenuOpen}
								onClick={() => setAttachMenuOpen((v) => !v)}
							>
								<PlusIcon size={12} />
							</button>
							{attachMenuOpen ? (
								<AttachMenu
									onClose={() => setAttachMenuOpen(false)}
									activeFileName={activeFile?.basename ?? null}
									attachNoteActive={attachNote && !!activeFile}
									running={running}
									onToggleActiveNote={() => setAttachNote((v) => !v)}
									onPickVaultFile={pickVaultFile}
									onPickImage={pickVaultImage}
									onPickFolder={pickVaultFolder}
								/* v0.1.79: the picker is the one OPT-OUT
								   surface — `picker: false` in Commands hides
								   the row here; every other snippet stays
								   listed exactly like before the flag */
								snippets={(props.settings.promptSnippets ?? []).filter((sn) => sn.picker !== false)}
								onInsertSnippet={(s) => insertAtCaret(s.text)}
								/>
							) : null}
						</div>
						<span className="oa-spacer" />
						{/* right cluster: model next to send (send stays in the corner) */}
						{/* Hermes Desktop dropdown parity (v0.1.32): every provider
						   with a catalog is a collapsible group; the pick is a
						   (provider, model) pair; visibility + collapse ride
						   settings. */}
						<ModelPicker
							model={moaActiveName || conn.model}
							providerSlug={conn.providerId}
							providers={settings.providers.map((p) => ({ slug: p.id, name: p.name, models: p.models ?? [] }))}
							moa={{ names: moaPickerNames, active: moaActiveName, onSelect: (n) => void selectMoaPreset(n) }}
							disabled={running}
							onSelect={(providerId, m) => void selectModel(m, providerId)}
							onRefresh={() => refreshModels()}
							onOpenSettings={props.openSettings}
							visibleModelsStored={settings.visibleModels}
							onSetVisibleModels={setVisibleModelsStored}
							collapsedSlugs={settings.collapsedMenuProviders}
							onToggleCollapsed={toggleCollapsedProvider}
						/>
						{running ? (
							<>
								{/* queue prompt: while busy the draft queues — mouse users get the
								   same gesture Enter already has (Hermes Desktop parity) */}
								{input.trim() ? (
									<PromptInputAction tooltip="Queue prompt" variant="primary" onClick={handleSubmit} disabled={false}>
										<LayersIcon size={14} />
									</PromptInputAction>
								) : null}
								<PromptInputAction tooltip="Interrupt" variant="danger" onClick={haltAgent}>
									<StopIcon size={14} />
								</PromptInputAction>
							</>
						) : (
						<PromptInputAction tooltip="Send" variant="primary" onClick={handleSubmit} disabled={!input.trim()}>
							<ArrowUpIcon size={16} />
						</PromptInputAction>
						)}
					</PromptInputActions>
					</PromptInput>

					{/* statusbar (hermes desktop) */}
					<div className="oa-statusbar">
						<span
							className="oa-statusbar-item"
							aria-label={conn.pinned.provider ? `Provider pinned by profile “${activeProfile?.name}”` : undefined}
						>
							{conn.pinned.provider ? <PinIcon size={10} className="oa-pin-icon" /> : null}
							{provider ? provider.name : "no provider"}
						</span>
						<span className="oa-statusbar-sep" />
						<span
							className="oa-statusbar-item"
							aria-label={conn.pinned.model ? `Model pinned by profile “${activeProfile?.name}”` : undefined}
						>
							{conn.pinned.model ? <PinIcon size={10} className="oa-pin-icon" /> : null}
							{conn.model || "no model"}
						</span>
						{tokenTotals.in + tokenTotals.out > 0 ? (
							(() => {
								/* v0.1.159 (A3 TokenTag) — v0.1.174 amended (owner:
								   "↑580.6k ↓16.8k · 1772% … over budget"): the context
								   window is a PER-REQUEST limit, so the % and the
								   overload flag compare the LAST request's input
								   (usage), never the cumulative session total — the
								   total always outgrows the window on a long chat and
								   rang a false alarm. ↑in ↓out stay session totals. */
								const windowKnown = contextWindow !== null && contextWindow > 0;
								const lastIn = usage ? usage.promptTokens : null;
								const pct = windowKnown && lastIn !== null ? Math.round((lastIn / (contextWindow as number)) * 100) : null;
								const over = windowKnown && lastIn !== null && lastIn > (contextWindow as number);
								const label = windowKnown
									? `Session tokens: ↑${compact(tokenTotals.in)} ↓${compact(tokenTotals.out)}${lastIn !== null ? ` · last input ${compact(lastIn)} = ${pct}% of the ${contextWindow} context window${over ? " — over budget" : ""}` : ""}`
									: "Session tokens: input / output";
								return (
									<>
										<span className="oa-statusbar-sep" />
										<span className={`oa-statusbar-item oa-token-tag${over ? " is-over" : ""}`} aria-label={label}>
											<span className="oa-token-tag-text">
												↑{compact(tokenTotals.in)} ↓{compact(tokenTotals.out)}
												{pct !== null ? ` · ${pct}%` : ""}
											</span>
											{pct !== null ? (
												<span className="oa-token-bar" aria-hidden="true">
													<span className="oa-token-bar-fill" style={{ width: `${Math.min(100, pct as number)}%` }} />
												</span>
											) : null}
										</span>
									</>
								);
							})()
						) : null}
						<span className="oa-spacer" />
						{recalledCount > 0 ? (
							<>
								<span className="oa-statusbar-sep" />
								<span
									className="oa-statusbar-item oa-memory-tag"
									aria-label={`Recalled ${recalledCount} ${recalledCount === 1 ? "memory" : "memories"}`}
								>
									<BrainIcon size={11} /> {recalledCount} {recalledCount === 1 ? "memory" : "memories"}
								</span>
							</>
						) : null}
						<span
							className="oa-statusbar-item oa-statusbar-personality"
							aria-label={
								(sessionOverlay ? `Overlay “${sessionOverlay}” on ` : "Identity only — ") +
								`profile “${activeProfile?.name ?? "Default"}” SOUL · /personality <name|none>`
							}
						>
							{sessionOverlay ?? "soul"}
						</span>
						{goal && goal.status !== "cleared" ? (
						<>
							<span className="oa-statusbar-sep" />
							<span
								className="oa-statusbar-item oa-goal-chip"
								aria-label={`Standing goal (${goal.status}${goal.pausedReason ? `: ${goal.pausedReason}` : ""}) — ${goal.text} · turns ${goal.turnsUsed}/${GOAL_MAX_TURNS} · /goal status`}
							>
								⊙ {goal.status === "active" ? `goal ${goal.turnsUsed}/${GOAL_MAX_TURNS}` : goal.status === "done" ? "goal ✓" : "goal paused"}
							</span>
						</>
					) : null}
					</div>
				</div>
			</div>


		<FileUploadContent text="Drop files to attach — text/PDF up to 1 MB · images up to 5 MB" />
	</div>
	</FileUpload>
);
}
