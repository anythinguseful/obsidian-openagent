/**
 * Real-preview harness entry — mounts the REAL ChatApp from src/ui with
 * mocked vault/network, then drives a scenario via clicks. The resulting
 * DOM is by construction identical to what Obsidian renders (same build,
 * same React, same styles.css); only the vault/network edges are faked.
 *
 * Scenarios (query param ?s=):
 *   empty     — fresh chat, hero + composer
 *   convo     — submit one prompt; canned LM Studio streams a full answer
 *   working   — submit; canned response never arrives (thinking/pulse frame)
 *   panel     — conversations panel opened (real click)
 *   menu      — model picker menu opened (real click)
 *   attach    — [+] attach menu opened (real click)
 *   snips     — attach menu → Prompt snippets submenu (real clicks)
 *   atref     — "@da" typed; @ reference popup open with matches
 */

import React from "react";
import { createRoot } from "react-dom/client";
import type { RequestUrlParam, RequestUrlResponse } from "./obsidian-shim";
import { Notice, TFile, MarkdownView as ShimMarkdownView, Component as ShimComponent } from "./obsidian-shim";
import { ChatApp, ChatAppProps } from "../../src/ui/ChatApp";
import { newChatApiSink } from "../../src/ui/chatApi";
import { AgentRunner } from "../../src/agent/runner";
import { AgentLoop, type AgentLoopEvents } from "../../src/agent/agentLoop";
import { workspacePolicyFor, type WorkspacePolicy } from "../../src/agent/workspacePolicy";
import { buildSystemPrompt } from "../../src/agent/systemPrompt";
import { ALL_TOOLS } from "../../src/agent/tools";
import { SessionStore, type Session } from "../../src/agent/sessions";
import { DEFAULT_SETTINGS, OpenAgentSettings, makeDefaultProfile } from "../../src/settings";
import { modelDisplayParts, modelVisibilityKey } from "../../src/agent/modelMenu";
import { introBodyPool } from "../../src/ui/components/intro";
import { Tool, type ToolPart } from "../../src/ui/components/tool";
import { ThinkingBar } from "../../src/ui/components/thinking-bar";
import type { App } from "obsidian";
import { EditorState } from "@codemirror/state";
import { EditorView as CMEditorView } from "@codemirror/view";
import { QuickAskController } from "../../src/quickask/controller";
import type { QuickAskMenuState } from "../../src/quickask/overlay";
import { displayModelName } from "../../src/agent/modelMenu";
import { attemptWithResilience, setBackoffScale } from "../../src/agent/resilience";
import { ProviderHttpError } from "../../src/agent/providers";
import type { TodoApi } from "../../src/agent/todo";
import type { MoaTurnEngine } from "../../src/agent/moaLoop";
import type { TerminalExecutionIdentity } from "../../src/agent/terminal/types";
import type { ChatMessage } from "../../src/types";

/* ------------------------------- settings -------------------------------- */

const MODEL = "gemma-4-e4b-uncensored-hauway-qat-4b";

const simSettings: OpenAgentSettings = {
	...DEFAULT_SETTINGS,
	streaming: false,
	providers: [
		{
			id: "lmstudio",
			name: "LM Studio (local)",
			baseUrl: "http://localhost:1234/v1",
			apiKey: "",
			enabled: true,
			customHeaders: {},
			models: [MODEL, "qwen3-30b-a3b-instruct-2507"],
		},
	],
	activeProviderId: "lmstudio",
	model: MODEL,
	fallbackProviderId: null,
	fallbackModel: null,
	profiles: [makeDefaultProfile()],
	activeProfileId: "default",
};

/* compress scenario: a 900-token window (override, so no provider metadata
   lookup decides this) + 2 protected tail messages — three ~1200-char
   prompts cross the 0.80 threshold exactly when the third turn starts */
if (scenarioParam() === "compress") {
	simSettings.modelContextLength = 900;
	simSettings.compressionProtectLastN = 2;
	simSettings.compressionThreshold = 0.8;
}

/* v0.1.127 probe chord kirim fase-2: ?s=keys = halaman bersih tetapi toggle
   "Enter sends message" AKTIF — skema kebalikan ikut terbukti di browser
   asli. Skenario dedikasi (bukan param baru) supaya penggantian literal
   window.location.search milik harness tetap tunggal. */
if (scenarioParam() === "keys") {
	simSettings.enterToSend = true;
}

/* v0.1.158 amended: Lesson 121 made titleGenerationEnabled default OFF, but
   the "title" scenario tests the aux naming path — opt in explicitly so the
   scenario keeps testing what it names (harness must follow settings
   defaults, not fight them). v0.1.171 amended: the moa/moa2 lanes assert
   "1 advisor + 1 title call" for the gemma slot, so they opt in the SAME
   way (their count drifted when the default flipped OFF). */
if (scenarioParam() === "title" || scenarioParam() === "moa" || scenarioParam() === "moa2") {
	simSettings.titleGenerationEnabled = true;
}

/* ------------------------------- canned net ------------------------------- */

const REASONING =
	"The user asked about the agent loop. I should explain the iterative cycle: context assembly, tool selection, execution, observation, and when it stops. Keep it tight and use the vault's terminology where possible.";

const REPLY_MD = `Here is your weekly vault digest — formatted for chat:

## Overview

**12 notes** changed this week across 3 projects. The highlights:

- \`daily/2026-07-14\` — new inbox triage notes
- [[project-hermes]] — shipped the \`[SILENT]\` marker
- \`openagent-skills\` — 2 skills learned

---

### Activity by folder

| Folder | Notes changed | Top topic |
| ------ | ------------- | --------- |
| daily | 7 | journaling |
| projects | 4 | hermes agent |
| inbox | 1 | triage |

### Suggested next step

> Start your Monday with the [[weekly-review-template]] — the agent can pre-fill it from last week's digests.

Here is the automation snippet if you want it recurring:

\`\`\`json
{
  "action": "create",
  "name": "Weekly digest",
  "schedule": "0 9 * * 1",
  "skills": "vault-digest",
  "chain": true
}
\`\`\`

### This week in one diagram

\`\`\`mermaid
%% leading payload 50% 🚀
%%{init: {'theme': 'base'}}%%
flowchart LR
  subgraph Agent Loop ✨
    A[Inbox] -- triage --> B[Projects]
  end
  B -- digest --> C[Weekly review]
  X[Konsep] --> S[Skematik Desain (SD)]; X -->|Revisi (final)| S
  D2 --> E; % Semua agen mengirim hasil ke titik evaluasi bersama
  I --> D1; % Atau Agen mana pun yang memanggilnya
  J -- Belum --> B; % Kembali ke awal loop untuk langkah korektif/berikutnya
  Z --> Q; %% exact double payload 50% 🚀
\`\`\`

Full list in [[vault-digest-2026-W29]]. Want me to create that automation?

Remote-media safety fixture (the first item must render as a link, never auto-load; the data image remains local):

![preview from web](https://remote-media.invalid/pixel.png)

![inline local pixel](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)`;

/* v0.1.124: jawaban slash2 membawa fence mermaid MENTAH (label berkurung)
   sehingga /save → vault bisa disaksi mensanitasi isinya */
const REPLY_SLASH2 = `Siap — ini diagram singkatnya:

\`\`\`mermaid
flowchart LR
  D[Brief] --> C[Skematik Desain (SD)]; D -->|Revisi (final)| C
  D2 --> E; % Semua agen mengirim hasil ke titik evaluasi bersama
\`\`\`

Begitu saja.`;

const REPLY = `Here's the loop in one pass:

1. **Assemble** — system prompt (identity, tools, memory, skills) + messages.
2. **Decide** — the model either replies or emits a tool call.
3. **Act** — the loop executes the tool (vault read/write, web, memory…) and appends the result.
4. **Observe** — the new tool result becomes context for the next step.

It repeats until the model answers without calling tools — that's the stop condition. In Open Agent the same machinery powers chat, slash commands and cron automations (\`runHeadless\` just runs it without the interactive stream).

Want me to compress this into [[agent-loop-cheatsheet]]?`;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const NEVER = new Promise<never>(() => {});
let queueCallCount = 0;
let steerCallCount = 0;
let webeCallCount = 0;
let moaCallCount = 0;
let fcardCallCount = 0;
let previewCallCount = 0;
let clfyCallCount = 0;

async function cannedRequest(req: RequestUrlParam): Promise<RequestUrlResponse> {
	const url = req.url;
	/* webe scenario (v0.1.28): the page web_extract fetches — big enough to
	   force the 75/25 head+tail window (+28k clean chars > the 15k budget) */
	if (url.includes("contoh.id/halaman-panjang")) {
		const para = "Baris isi halaman panjang tentang topik alpha-web — fakta bergizi yang harus terbaca model.\n";
		return {
			status: 200,
			headers: {},
			arrayBuffer: new ArrayBuffer(0),
			text: `<html><head><title>Halaman Alpha</title></head><body><main><p>${para.repeat(420)}</p></main></body></html>`,
			json: {},
		};
	}
	if (url.endsWith("/models")) {
		return {
			status: 200,
			headers: {},
			arrayBuffer: new ArrayBuffer(0),
			text: "",
			json: {
				data: [{ id: MODEL }, { id: "qwen3-30b-a3b-instruct-2507" }, { id: "hermes-4-70b" }, { id: "hermes-4-405b" }],
			},
		};
	}
	if (url.includes("/chat/completions")) {
		await delay(120);
		const scenario = scenarioParam();
		if (scenario === "working") return NEVER.then(() => ({} as RequestUrlResponse));
		/* v0.1.17: record every chat payload (wire honesty for the compress
		   check) and answer auxiliary side-task calls by their prompt
		   markers — title generation + the compression summarizer */
		const bodyText = typeof req.body === "string" ? req.body : "";
		let wire: { role?: string; content?: unknown }[] = [];
		let wireModel = "";
		try {
			const parsed = JSON.parse(bodyText) as { model?: unknown; messages?: { role?: string; content?: unknown }[] };
			wire = Array.isArray(parsed.messages) ? parsed.messages : [];
			wireModel = String(parsed.model ?? "");
		} catch {
			/* non-JSON body — record nothing */
		}
		(window.__oaRequestModels ??= []).push(wireModel);
		(window.__oaRequests ??= []).push(
			wire.map((m) => ({
				role: m.role ?? "?",
				/* v0.1.54: keep the FULL system prompt — the feedback-signal
				   proof line lives deep inside it; non-system stays sliced */
				content: typeof m.content === "string" ? (m.role === "system" ? m.content : m.content.slice(0, 200)) : "(non-text)",
				/* v0.1.26 /steer: the marker rides the END of a tool result —
				   the head slice above would cut it away, the tail keeps it
				   (600 since v0.1.28: web_extract's whole footer block is
				   ~400 chars deep, and the [TRUNCATED] line leads it) */
				tail: typeof m.content === "string" ? m.content.slice(-600) : "",
			}))
		);
		const wireText = wire.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
		/* v0.1.25 /goal: the judge gets a two-verdict script — first CONTINUE,
		   then DONE — so the Ralph loop can be witnessed end to end */
		const goalJudge = wireText.includes("You judge whether a recent reply satisfies")
			? ((window.__oaGoalJudgeCount = (window.__oaGoalJudgeCount ?? 0) + 1) === 1
				? '{"done": false, "wait": false, "reason": "belum tuntas"}'
				: '{"done": true, "wait": false, "reason": "tuntas"}')
			: null;
		const webSummary = wireText.includes("Condense this web page")
			? "RINGKASAN-WEB-OK: 3 fakta inti tentang alpha-web."
			: null;
		const auxReply = goalJudge ?? webSummary ?? (wireText.includes("Write a short conversation title")
			? "Kucing Oren Kesayangan"
			: wireText.includes("Summarize the conversation below") || wireText.includes("Fold the conversation below")
				? "RINGKASAN-OK"
				: null);
		if (auxReply !== null) {
			return {
				status: 200,
				headers: {},
				arrayBuffer: new ArrayBuffer(0),
				text: "",
				json: {
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: auxReply, tool_calls: [] },
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 140, completion_tokens: 6, total_tokens: 146 },
				},
			};
		}
		/* queue scenario: the FIRST turn must stay busy long enough for the
		   driver to enqueue two prompts; later turns drain fast */
		if (scenario === "queue") {
			queueCallCount++;
			if (queueCallCount === 1) await delay(900);
		}
		/* webe scenario (v0.1.28): turn 1 extracts RAW (window+footer+store),
		   turn 2 asks with summarize:true (the aux pin must route the call),
		   later turns answer plain */
		if (scenario === "webe") {
			webeCallCount++;
			if (webeCallCount <= 2) {
				const args = webeCallCount === 1
					? { urls: ["https://contoh.id/halaman-panjang-alpha"] }
					: { urls: ["https://contoh.id/halaman-panjang-alpha"], summarize: true };
				return {
					status: 200,
					headers: {},
					arrayBuffer: new ArrayBuffer(0),
					text: "",
					json: {
						choices: [
							{
								index: 0,
								message: {
									role: "assistant",
									content: "",
									tool_calls: [
										{
											id: `call_webe_${webeCallCount}`,
											type: "function",
											function: { name: "web_extract", arguments: JSON.stringify(args) },
										},
									],
								},
								finish_reason: "tool_calls",
							},
						],
						usage: { prompt_tokens: 500, completion_tokens: 24, total_tokens: 524 },
					},
				};
			}
		}
		/* clfy scenario (v0.1.80, Hermes clarify lane): ONE run cycles all
		   four platform interactions — single pick, open-ended, multi-select
		   + typed Other, then a choices card the driver SKILLFULLY skips —
		   and a final text reply that only exists if the loop continued */
		if (scenario === "clfy") {
			clfyCallCount++;
			const clarifyCall = (id: string, args: Record<string, unknown>) => ({
				status: 200,
				headers: {},
				arrayBuffer: new ArrayBuffer(0),
				text: "",
				json: {
					choices: [
						{
							index: 0,
							message: {
								role: "assistant",
								content: "",
								tool_calls: [{ id, type: "function", function: { name: "clarify", arguments: JSON.stringify(args) } }],
							},
							finish_reason: "tool_calls",
						},
					],
					usage: { prompt_tokens: 300, completion_tokens: 12, total_tokens: 312 },
				},
			});
			if (clfyCallCount === 1) return clarifyCall("call_c1", { question: "Folder mana yang mau dirapikan?", choices: ["Projects", "Daily", "Semua vault"] });
			if (clfyCallCount === 2) return clarifyCall("call_c2", { question: "Ada catatan khusus sebelum aku mulai?" });
			if (clfyCallCount === 3) return clarifyCall("call_c3", { question: "Kategori mana yang ikut dirapikan?", choices: ["meeting", "ide", "bacaan"], multi_select: true });
			if (clfyCallCount === 4) return clarifyCall("call_c4", { question: "Konfirmasi terakhir: mulai sekarang?", choices: ["Ya, mulai", "Nanti saja"] });
			return {
				status: 200,
				headers: {},
				arrayBuffer: new ArrayBuffer(0),
				text: "",
				json: {
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: "SIP-SELESAI — keputusan sudah lengkap.", tool_calls: [] },
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 900, completion_tokens: 10, total_tokens: 910 },
				},
			};
		}
		/* moa scenario (v0.1.30, agent/moa_loop.py parity): advisor calls ride
		   the official advisor system prompt — answer as the SLOT's model;
		   acting call 1 asks for the fast tool (a REAL second acting
		   iteration follows, with the guidance still attached while the
		   advisors must NOT re-run under the user_turn cadence); acting
		   call 2 answers plain */
		/* fcard scenario (v0.1.56, changed-files card lane): one turn lands TWO
		   writes on Projects/Plan.md (dedupe → last-verb ×2) and one create on
		   Daily/Notes.md, then the final text reply */
		if (scenario === "fcard") {
			fcardCallCount++;
			if (fcardCallCount === 1) {
				return {
					status: 200,
					headers: {},
					arrayBuffer: new ArrayBuffer(0),
					text: "",
					json: {
						choices: [
							{
								index: 0,
								message: {
									role: "assistant",
									content: "",
									tool_calls: [
										{ id: "call_fc1", type: "function", function: { name: "write_note", arguments: JSON.stringify({ path: "Projects/Plan.md", content: "# Plan\n- alpha\n- beta", mode: "create" }) } },
										{ id: "call_fc2", type: "function", function: { name: "write_note", arguments: JSON.stringify({ path: "Projects/Plan.md", content: "- gamma", mode: "append" }) } },
										{ id: "call_fc3", type: "function", function: { name: "write_note", arguments: JSON.stringify({ path: "Daily/Notes.md", content: "# Notes", mode: "create" }) } },
									],
								},
								finish_reason: "tool_calls",
							},
						],
						usage: { prompt_tokens: 600, completion_tokens: 40, total_tokens: 640 },
					},
				};
			}
			return {
				status: 200,
				headers: {},
				arrayBuffer: new ArrayBuffer(0),
				text: "",
				json: {
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: "Selesai — Plan.md aku perbarui dan Notes.md kubuat.", tool_calls: [] },
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 660, completion_tokens: 18, total_tokens: 678 },
				},
			};
		}

		if (scenario === "preview") {
			previewCallCount++;
			if (previewCallCount === 1) {
				return {
					status: 200,
					headers: {},
					arrayBuffer: new ArrayBuffer(0),
					text: "",
					json: {
						choices: [
							{
								index: 0,
								message: {
									role: "assistant",
									content: "",
									tool_calls: [
										{ id: "call_pv1", type: "function", function: { name: "write_note", arguments: JSON.stringify({ path: "Harian/Preview.md", content: "# Catatan\nbaris lama satu\nbaris lama dua", mode: "create" }) } },
									],
								},
								finish_reason: "tool_calls",
							},
						],
						usage: { prompt_tokens: 60, completion_tokens: 12, total_tokens: 72 },
					},
				};
			}
			if (previewCallCount === 3) {
				return {
					status: 200,
					headers: {},
					arrayBuffer: new ArrayBuffer(0),
					text: "",
					json: {
						choices: [
							{
								index: 0,
								message: {
									role: "assistant",
									content: "",
									tool_calls: [
										{ id: "call_pv2", type: "function", function: { name: "edit_note", arguments: JSON.stringify({ path: "Harian/Preview.md", old_text: "baris lama satu", new_text: "baris BARU satu" }) } },
									],
								},
								finish_reason: "tool_calls",
							},
						],
						usage: { prompt_tokens: 70, completion_tokens: 12, total_tokens: 82 },
					},
				};
			}
			return {
				status: 200,
				headers: {},
				arrayBuffer: new ArrayBuffer(0),
				text: "",
				json: {
					choices: [{ index: 0, message: { role: "assistant", content: "Siap, urusan catatan beres." }, finish_reason: "stop" }],
					usage: { prompt_tokens: 40, completion_tokens: 6, total_tokens: 46 },
				},
			};
		}
		if (scenario === "moa" || scenario === "moa2") {
			if (wireText.includes("You are a reference advisor in a Mixture of Agents")) {
				const who = wireModel === "qwen3-30b-a3b-instruct-2507" ? "QWEN" : "GEMMA";
				return {
					status: 200,
					headers: {},
					arrayBuffer: new ArrayBuffer(0),
					text: "",
					json: {
						choices: [
							{
								index: 0,
								message: { role: "assistant", content: `NASIHAT-${who}: mulai dari fakta catatan; jawab ringkas; jangan klaim menjalankan alat.`, tool_calls: [] },
								finish_reason: "stop",
							},
						],
						usage: { prompt_tokens: 320, completion_tokens: 18, total_tokens: 338 },
					},
				};
			}
			moaCallCount++;
			if (moaCallCount === 1) {
				return {
					status: 200,
					headers: {},
					arrayBuffer: new ArrayBuffer(0),
					text: "",
					json: {
						choices: [
							{
								index: 0,
								message: {
									role: "assistant",
									content: "",
									tool_calls: [
										{
											id: "call_moa_1",
											type: "function",
											function: { name: "search_vault", arguments: JSON.stringify({ query: "fakta alpha" }) },
										},
									],
								},
								finish_reason: "tool_calls",
							},
						],
						usage: { prompt_tokens: 900, completion_tokens: 30, total_tokens: 930 },
					},
				};
			}
			return {
				status: 200,
				headers: {},
				arrayBuffer: new ArrayBuffer(0),
				text: "",
				json: {
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: "JAWABAN-MOA: alpha terdokumentasi — jawaban aggregator memakai nasihat kedua penasihat.", tool_calls: [] },
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 950, completion_tokens: 22, total_tokens: 972 },
				},
			};
		}
		/* steer scenario (v0.1.26): the FIRST main turn asks for the slow
		   tool — the driver types /steer while it honestly executes; the
		   follow-up turn and the idle-path turn answer plain */
		if (scenario === "steer") {
			steerCallCount++;
			if (steerCallCount === 1) {
				return {
					status: 200,
					headers: {},
					arrayBuffer: new ArrayBuffer(0),
					text: "",
					json: {
						choices: [
							{
								index: 0,
								message: {
									role: "assistant",
									content: "",
									tool_calls: [
										{
											id: "call_steer_1",
											type: "function",
											function: { name: "search_vault", arguments: JSON.stringify({ query: "alpha" }) },
										},
									],
								},
								finish_reason: "tool_calls",
							},
						],
						usage: { prompt_tokens: 400, completion_tokens: 20, total_tokens: 420 },
					},
				};
			}
		}
		return {
			status: 200,
			headers: {},
			arrayBuffer: new ArrayBuffer(0),
			text: "",
			json: {
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: scenario === "md" ? REPLY_MD : scenario === "slash2" ? REPLY_SLASH2 : REPLY,
							reasoning_content: REASONING,
							tool_calls: [],
						},
						finish_reason: "stop",
					},
				],
				usage: { prompt_tokens: 4210, completion_tokens: 372, total_tokens: 4582 },
			},
		};
	}
	throw new Error(`sim: unhandled request ${url}`);
}

/* --------------------------------- mocks ---------------------------------- */

const now = Date.now();
const meta = (id: string, title: string, hoursAgo: number, turnCount: number) => ({
	id,
	title,
	createdAt: now - (hoursAgo + 2) * 3_600_000,
	updatedAt: now - hoursAgo * 3_600_000,
	model: MODEL,
	turnCount,
});

const savedSessions: Session[] = [];
const removedSessionIds = new Set<string>();
const sessionsMock = {
	/* Workspace v0.1.145: ChatApp snapshots the plugin-private session
	   partition around every asynchronous operation. The browser harness has
	   one stable legacy partition, but must expose the real store contract. */
	partitionKey: () => "",
	snapshot() {
		return this;
	},
	list: async () => [
		...savedSessions
			.filter((s) => !removedSessionIds.has(s.id))
			.map((s) => ({
				id: s.id,
				title: s.title,
				createdAt: s.createdAt,
				updatedAt: s.updatedAt,
				model: s.model,
				turnCount: s.turnCount,
			})),
		...[
			meta("s-1", "agent-loop design", 1, 6),
			meta("s-2", "weekly review prep", 5, 4),
			meta("s-3", "hub skill ideas", 26, 8),
			meta("s-4", "vault cleanup plan", 50, 3),
		].filter((s) => !removedSessionIds.has(s.id)),
	],
	load: async (id: string) => {
		window.__oaLoadedSession = id;
		return null;
	},
	/* real-store parity (v0.1.20): the panel's debounced full-text search
	   calls sessions.search — an honest "no content hits" keeps the panel
	   on its title filter, exactly like a store with no matches */
	search: async (_q: string, _limit?: number) => [],
	save: async (s: Session) => {
		const i = savedSessions.findIndex((x) => x.id === s.id);
		if (i >= 0) savedSessions[i] = s;
		else savedSessions.push(s);
		window.__oaSavedSessions = savedSessions.map((x) => ({
			id: x.id,
			title: x.title,
			parent: x.parent ?? null,
			messageCount: x.messages?.length ?? 0,
			goal: x.goal ? { status: x.goal.status, turnsUsed: x.goal.turnsUsed } : null,
			/* content probe (v0.1.23 /branch): the parent's saved wire must stay
			   byte-stable while the child grows past it */
			wire: (x.messages ?? []).map((m) => (typeof m.content === "string" ? m.content : "")).join(" ").slice(0, 2500),
			compression: x.compression ? { summary: x.compression.summary, upto: x.compression.upto } : null,
			/* v0.1.57 sysmsg lane: role/severity honesty of every saved turn */
			turnRoles: (x.turns ?? []).map((t) => `${t.role}${t.notice ? ":" + t.notice : ""}`),
		}));
	},
	/* v0.1.158 (A1 EditableText): in-place rename — patch the stored title
	   and mirror it for the panel's next list() (recency NOT bumped). */
	rename: async (id: string, title: string) => {
		const i = savedSessions.findIndex((x) => x.id === id);
		if (i < 0) return null;
		savedSessions[i] = { ...savedSessions[i], title };
		window.__oaRenamed = { id, title };
		return savedSessions[i];
	},
	remove: async (id: string) => {
		removedSessionIds.add(id);
		window.__oaDeletedSession = id;
	},
	touch: async () => {},
};

const harnessMemory = {
	add: async () => {},
	replace: async () => {},
	remove: async () => {},
	addUser: async () => {},
	replaceUser: async () => {},
	removeUser: async () => {},
	search: async () => [],
};
const harnessSkills = {
	loadSkillDocs: async () => [],
	createSkill: async () => "x",
	loadSkills: async () => [],
};

const runnerMock = {
	/* Workspace v0.1.145: deferred editor/attachment and managed-store reads
	   are authorized against immutable policy/store views. Keep these browser
	   doubles contract-complete rather than bypassing the production guards. */
	snapshotWorkspacePolicy: () => workspacePolicyFor(simSettings),
	memoryForPolicy: () => harnessMemory,
	skillsForPolicy: () => harnessSkills,
	/* v0.1.55 gate-hole lesson: assemble the REAL prompt in the sim — the
	   canned placeholder made every prompt-affecting feature invisible in the
	   wire lanes (the v0.1.54 feedback-signal lane correctly went red on it);
	   deterministic, all subsystems here are instant mocks */
	assembleSystemPrompt: async (nudge: boolean, _incl: boolean, ov: string | null | undefined, feedbackDue = false) =>
		buildSystemPrompt({
			settings: simSettings,
			tools: [],
			skills: [],
			memory: { readMemory: async () => "", readUserProfile: async () => "" } as never,
			app: appMock as unknown as App,
			pluginDir: ".obsidian/plugins/openagent",
			memoryNudgeDue: nudge,
			activeNotePath: null,
			contextFileContent: null,
			personalityOverlay: ov ?? null,
			feedbackDue,
		}),
	readActiveNote: async () => null,
	getTools: () => [],
	/* v0.1.176: the interactive run path calls engineForPolicy for
	   structured-memory recall/retain/reflect (v0.1.176/177). The browser
	   fixture has no real vault adapter, so this returns a no-op engine —
	   search() = no facts, retain()/reflect() = no-op, mentalModelsBlock()
	   = none — keeping the lane honest (the wiring runs) without depending on
	   a vault file. */
	engineForPolicy: () => ({
		search: async () => [],
		retain: async () => ({ added: 0, updated: 0, deleted: 0 }),
		reflect: async () => null,
		mentalModelsBlock: async () => null,
	}),
	/* v0.1.171: the interactive run path calls getToolsWithMcp (v0.1.147i),
	   not getTools — but every tool-using scenario overrides getTools per
	   lane. Delegate through `this.getTools()` at CALL time so the scenario
	   override stays live (a captured `() => []` would starve fcard/steer/
	   webe/clfy/preview of their tools). */
	getToolsWithMcp: async function () {
		return this.getTools();
	},
	/* Keep the mock contract-complete: production ChatApp asks the runner for
	   the narrow interactive handle rather than constructing AgentLoop itself. */
	createInteractiveRun: async function (options: {
		settings: OpenAgentSettings;
		workspacePolicy: WorkspacePolicy;
		execution: TerminalExecutionIdentity;
		todo: TodoApi;
		moa?: MoaTurnEngine | null;
	}) {
		const { settings, workspacePolicy, execution, todo, moa } = options;
		const tools = await this.getToolsWithMcp(settings, { interactiveTerminal: true });
		const ctx = this.makeContext(workspacePolicy, settings, execution);
		ctx.todo = todo;
		const loop = new AgentLoop(settings, tools, ctx, moa ?? null);
		return {
			tools,
			run: (messages: ChatMessage[], events: AgentLoopEvents) => loop.run(messages, events),
			steer: (text: string) => loop.steer(text),
		};
	},
	/* Terminal v1 lifecycle is part of the ChatApp contract even though this
	   browser fixture intentionally exposes no terminal schemas/runtime. */
	stopTerminalSession: async () => 0,
	makeContext: () => ({}),
	memory: harnessMemory,
	skills: harnessSkills,
};

/* fake vault files for the @ popup + pickers (name/basename/stat shapes) */
const fakeFiles = [
	"Inbox/Quick capture.md",
	"Daily/2026-07-19.md",
	"Daily/2026-07-18.md",
	"agent-loop-cheatsheet.md",
	"Projects/openagent/attach-plan.md",
].map((p) => ({
	path: p,
	name: p.split("/").pop()!,
	basename: p.split("/").pop()!.replace(/\.md$/, ""),
	stat: { ctime: 0, mtime: Date.now() - 3_600_000, size: 1200 },
}));

/* v0.1.58: entries carry CONTENT too — the preview diff reads the file it
   is about to change, so a soft "" here would diff against nothing */
const simCreated = new Map<string, { file: TFile; content: string }>();

/* v0.1.78 token-lane vault: GENUINE TFile instances with real content and
   property tags, so runAgent's prompt-token resolution (Copilot {}/
   {[[]]}/{activeNote}/{#tags}) reads a vault as honest as the real one —
   narrowing fakeFiles/read/getFiles/metadataCache instead would be another
   lesson-47 soft-mock hole. */
const simTokenSeed: { path: string; content: string; tags: string[] }[] = [
	{ path: "Tokens/Apple.md", content: "APPLE-BODY — catatan tentang apel.", tags: ["fruit"] },
	{ path: "Tokens/Banana.md", content: "BANANA-BODY — catatan tentang pisang.", tags: ["fruit", "yellow"] },
	{ path: "Tokens/Car.md", content: "CAR-BODY — catatan tentang mobil.", tags: ["vehicle"] },
];
const simTokenFiles = new Map<string, TFile>(
	simTokenSeed.map((s) => {
		const f = new TFile();
		f.path = s.path;
		f.name = s.path.split("/").pop() ?? s.path;
		return [s.path, f];
	})
);

const appMock = {
	workspace: {
		/* honest for the token lane: the active note is whatever the lane
		   staged; other lanes never set it → null, exactly as before */
		getActiveFile: () => (window.__oaActiveNotePath ? simTokenFiles.get(window.__oaActiveNotePath) ?? null : null),
		getLeaf: (_n?: boolean) => ({
			openFile: async (f: { path: string }) => {
				(window.__oaVaultOpens ??= []).push(f.path);
			},
		}),
		getLeavesOfType: () => [],
		on: () => ({ unload: () => {} }),
		offref: () => {},
	},
	vault: {
		getName: () => "simvault",
		/* v0.1.56: creation is HONEST — written files exist afterwards, so the
		   changed-files card's open path is testable in-sim (was always-null,
		   another soft-mock hole in the lesson-47 family) */
		getAbstractFileByPath: (p: string) => simCreated.get(p)?.file ?? simTokenFiles.get(p) ?? null,
		create: async (path: string, content: string) => {
			(window.__oaVaultWrites ??= []).push({ path, content });
			const f = new TFile();
			f.path = path;
			f.name = path.split("/").pop() ?? path;
			simCreated.set(path, { file: f, content });
			return f;
		},
		append: async (f: TFile, content: string) => {
			// honest append: recorded as a follow-up write on the same file
			(window.__oaVaultWrites ??= []).push({ path: f.path, content });
			const e = simCreated.get(f.path);
			if (e) e.content += content; // raw concat — the tool prepends its own \n
		},
		/* modify must exist too: web_extract re-saves its cache note via modify
		   once turn 1 created it — without this the sim threw inside storeFullPage,
		   storedPath went null and the "(Summarized — full text saved to: …)"
		   footer silently vanished (sim fidelity gap, caught red by the webe wire
		   gate on 2026-08-02) */
		modify: async (f: TFile, content: string) => {
			(window.__oaVaultWrites ??= []).push({ path: f.path, content });
			const e = simCreated.get(f.path);
			if (e) e.content = content; // honest content, readable afterwards
		},
		createFolder: async (_path: string) => {},
		/* honest read for files the run itself wrote (pre-existing fakeFiles
		   notes stay "" — unchanged contract) */
		read: async (f: TFile) =>
			[...simCreated.values()].find((e) => e.file === f)?.content ??
			simTokenSeed.find((s) => s.path === f.path)?.content ??
			"",
		/* v0.1.130: jalur vendor pdf.worker — lane attach membuktikan byte
		   vendor yang sama (di-serve dari window.__oaPdfWorkerB64 milik
		   build.mjs, hasil scripts/build-vendor.mjs) menjadi Blob→Worker */
		adapter: {
			readBinary: async (path: string) => {
				if (path.endsWith("vendor/pdf.worker.min.js") && window.__oaPdfWorkerB64) {
					const bin = atob(window.__oaPdfWorkerB64);
					const u8 = new Uint8Array(bin.length);
					for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
					return u8.buffer;
				}
				return new ArrayBuffer(0);
			},
		},
		getFiles: () => [...fakeFiles, ...simTokenFiles.values()],
		getRoot: () => ({ path: "/", children: [], isRoot: () => true }),
	},
	/* property tags for the token lane — the ONLY caller is prompt-token
	   resolution; every other file gets null, the pre-existing contract */
	metadataCache: {
		getFileCache: (f: { path: string }) => {
			const s = simTokenSeed.find((x) => x.path === f.path);
			return s ? { frontmatter: { tags: [...s.tags] } } : null;
		},
	},
};

/* editor→chat bridge sink (candidate ③, v0.1.75): the harness stands in
   for ChatView — ChatApp registers its api here and build.mjs lanes drive
   it directly (the menu glue itself is Obsidian-side, guarded statically) */
const chatApiSink = newChatApiSink();
(window as any).__oaChatApiSink = chatApiSink;

const props: ChatAppProps = {
	app: appMock as unknown as App,
	pluginDir: ".obsidian/plugins/openagent",
	settings: simSettings,
	runner: runnerMock as unknown as AgentRunner,
	sessions: sessionsMock as unknown as SessionStore,
	saveSettings: async () => {},
		saveSettingsSafe: (): void => {},
	/* v0.1.33 regression spy: Refresh Models (or any in-menu action) must
	   NEVER route to settings — the pre-fix refresh did exactly that when
	   a vault's zero providers passed the enabled gate */
	openSettings: () => {
		window.__oaSettingsOpened = (window.__oaSettingsOpened ?? 0) + 1;
	},
	applyProfile: async () => {},
	chatApiSink,
	renderComponent: Object.assign(
		{
			register: () => {},
			registerEvent: () => {},
			registerDomEvent: () => {},
			registerInterval: (id: number) => id,
			load: () => {},
			onload: () => {},
			onunload: () => {},
			unload: () => {},
			addChild: <T,>(c: T): T => c,
			removeChild: <T,>(c: T): T => c,
		},
		{}
	),
};

/* slash3 scenario: seed the skills catalog BEFORE mount — the popover loads
   it once at module scope, mutating after render never arrives (lesson 12) */
if (scenarioParam() === "slash3" || scenarioParam() === "chips") {
	props.runner.skills.loadSkills = async () => [
		{ name: "beta-skill", description: "Uji skill beta", instructions: "INSTRUKSI-BETA: selalu jawab sopan.", path: "x", enabled: false },
		{ name: "alpha", description: "Skill alpha", instructions: "INSTRUKSI-ALPHA", path: "y", enabled: true },
	];
}

/* empty scenario (candidate ③ lane): one enabled skill so the bridge lane
   can arm it through the sink BEFORE mount — same lesson-12 reasoning as
   slash3 above; post-mount mutation would never reach the loadSkills ref */
if (scenarioParam() === "empty") {
	props.runner.skills.loadSkills = async () => [
		{ name: "alpha", description: "Skill alpha", instructions: "INSTRUKSI-ALPHA", path: "y", enabled: true },
	];
}

/* slash3 (v0.1.77 Commands tab): one snippet flagged for the composer
   slash surface — the lane proves the Snippets group renders and picking
   the row stages the FULL prompt text (fill: semantics) */
if (scenarioParam() === "slash3") {
	simSettings.promptSnippets = [
		{ id: "snip-lane-1", title: "Ringkas Dulu", text: "TOLONG RINGKAS SEKARANG", slash: true },
	];
}

/* snips (v0.1.79 picker toggle): one OPT-OUT (`picker:false`) among three
   — the picker must list the other two and count only ENABLED rows in
   the root row's "N saved" sub */
if (scenarioParam() === "snips") {
	simSettings.promptSnippets = [
		{ id: "snip-lane-2", title: "Kelihatan Selalu", text: "ISI KELIHATAN" },
		{ id: "snip-lane-3", title: "Juga Kelihatan", text: "ISI KEDUA", slash: true },
		{ id: "snip-lane-4", title: "Tersembunyi Mana", text: "ISI SEMBUNYI", picker: false },
	];
}

/* slash2 scenario: seed a second profile + spy on applyProfile BEFORE the
   <ChatApp {...props}/> spread copies prop references (lesson 12 class:
   mutating props after render never reaches the component) */
if (scenarioParam() === "slash2") {
	simSettings.profiles.push({ ...makeDefaultProfile(), id: "research", name: "Research" });
	props.applyProfile = async (id: string) => {
		window.__oaProfileApplied = id;
	};
}

/* slash scenario (v0.1.119, owner: cacat padding menu profil): seed 7 profil
   tambahan supaya menu profil menumbuhkan strip pencarian (>6 profil —
   komponen hanya merendernya saat banyak profil); lane mengukur ritme
   padding strip terhadap baris item. Sebelum mount (lesson 12). */
if (scenarioParam() === "slash") {
	const extraNames = ["Riset", "Menulis", "Koding", "Arsip", "Pribadi", "Kerja", "Eksperimen"];
	for (const [i, name] of extraNames.entries()) {
		simSettings.profiles.push({ ...makeDefaultProfile(), id: `p${i + 2}`, name });
	}
}

/* webe scenario (v0.1.28): pin the Web extract aux slot to a DIFFERENT
   model — the summarize call must ride the pin, proving the new slot
   routes; the tool under test is the REAL web_extract (window, store,
   summarize) against the mock vault, not a lookalike */
if (scenarioParam() === "webe") {
	simSettings.auxModels = {
		...(simSettings.auxModels ?? {}),
		webExtract: { providerId: "lmstudio", model: "qwen3-30b-a3b-instruct-2507" },
	};
	props.runner.getTools = () => ALL_TOOLS.filter((t) => t.name === "web_extract");
	props.runner.makeContext = () => ({ app: props.app as App, settings: simSettings });
}

/* fcard scenario (v0.1.56, changed-files card): the REAL write_note against
   the honest sim vault — same per-scenario getTools pattern as webe/steer;
   the default empty registry is why the first attempt errored "unknown
   tool" (soft-mock family, lesson 47 — caught by the v0.1.55 gate fix) */
if (scenarioParam() === "fcard") {
	props.runner.getTools = () => ALL_TOOLS.filter((t) => t.name === "write_note");
	props.runner.makeContext = () => ({ app: props.app as App, settings: simSettings });
	/* v0.1.58: write_note is dangerous now, so fcard pins yolo — its lane
	   doubles as the "yolo lands writes with NO preview" regression proof */
	simSettings.approvalMode = "yolo";
	/* v0.1.121 (owner): vault berfolder kerja "Projects" — baris kartu harus
	   menunjuk file yang benar-benar tertulis (Daily/Notes.md mendarat di
	   Projects/Daily/Notes.md); kasus persis notice palsu pemilik. v0.1.145
	   makes this routing mode explicit—the migrated legacy equivalent is
	   Preferred folder, while Whole vault intentionally ignores the root. */
	simSettings.workspaceMode = "preferred-folder";
	simSettings.workspaceFolder = "Projects";
}
/* preview scenario (v0.1.58): cautious default → every write/edit PENDS on
   the diff card; the driver accepts turn 1 and denies turn 2 */
if (scenarioParam() === "preview") {
	props.runner.getTools = () => ALL_TOOLS.filter((t) => t.name === "write_note" || t.name === "edit_note");
	props.runner.makeContext = () => ({ app: props.app as App, settings: simSettings });
}

/* clfy scenario (v0.1.80, Hermes clarify): the REAL clarify tool against
   the chat's requestClarify channel — same per-scenario getTools
   whitelist as webe/fcard/preview; without it the lane dies with
   "Unknown tool: clarify" (lesson-47 soft-mock family, hit again here) */
if (scenarioParam() === "clfy") {
	props.runner.getTools = () => ALL_TOOLS.filter((t) => t.name === "clarify");
	props.runner.makeContext = () => ({ app: props.app as App, settings: simSettings });
}

/* goal scenario (v0.1.27): pin the goalJudge aux slot to a DIFFERENT model
   than main — the wire must show every judge call riding the PIN, proving
   aux pins switch the model, not just the provider */
if (scenarioParam() === "goal") {
	simSettings.auxModels = {
		...(simSettings.auxModels ?? {}),
		goalJudge: { providerId: "lmstudio", model: "qwen3-30b-a3b-instruct-2507" },
	};
}

/* steer scenario (v0.1.26): give the sim ONE slow tool so the driver can
   type /steer while the batch is honestly still executing — the same
   wall-clock window a human gets, no backdoor hook (lesson 12 again) */
if (scenarioParam() === "steer") {
	props.runner.getTools = () => [
		{
			name: "search_vault",
			description: "Search notes by text",
			toolset: "vault",
			dangerous: false,
			parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
			execute: async () => {
				await new Promise((r) => setTimeout(r, 900)); // a slow read — a person's steer window
				return "HASIL-CARIAN: alpha → 2 catatan cocok";
			},
		},
	];
}

/* moa scenario (v0.1.30): a SAVED, ENABLED preset "crew" already picked via
   active_preset (raw user-shape config, like a data.json the settings UI
   wrote) — the pill must show the preset and every iteration rides the
   facade. The canned tool is FAST (steer's slow-read sibling): a REAL
   second acting iteration, never a backdoor counter */
/* moa2 scenario (v0.1.31, cli.py /moa + model_switch.py PATH B parity): the
   SAME preset "crew" is the DEFAULT but not active — the session starts on
   the plain picker model. A second preset "off" stays enabled:false to prove
   bare /model names never implicit-match a disabled preset (#55187). */
if (scenarioParam() === "moa2") {
	(simSettings as unknown as Record<string, unknown>).moa = {
		default_preset: "crew",
		presets: {
			crew: {
				enabled: true,
				reference_models: [
					{ provider: "lmstudio", model: MODEL, enabled: true },
					{ provider: "lmstudio", model: "qwen3-30b-a3b-instruct-2507", enabled: true },
				],
				aggregator: { provider: "lmstudio", model: "hermes-4-70b", enabled: true },
				reference_temperature: null,
				aggregator_temperature: null,
				reference_timeout: null,
				degraded_reference_policy: "loud",
				max_tokens: 4096,
				reference_max_tokens: null,
				fanout: "user_turn",
			},
			off: {
				enabled: false,
				reference_models: [{ provider: "lmstudio", model: MODEL, enabled: true }],
				aggregator: { provider: "lmstudio", model: "hermes-4-70b", enabled: true },
				reference_temperature: null,
				aggregator_temperature: null,
				reference_timeout: null,
				degraded_reference_policy: "loud",
				max_tokens: 4096,
				reference_max_tokens: null,
				fanout: "user_turn",
			},
		},
	};
	props.runner.getTools = () => [
		{
			name: "search_vault",
			description: "Search notes by text",
			toolset: "vault",
			dangerous: false,
			parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
			execute: async () => "HASIL-MOA: alpha terdokumentasi di 2 catatan (fasta-satu, fasta-dua).",
		},
	];
}


if (scenarioParam() === "menu2") {
	/* v0.1.32 model-menu parity harness (Hermes Desktop shell.modelMenu +
	   model-visibility-dialog): the second provider carries a fast-pair and
	   a date-pinned sibling so the menu must collapse families and drop the
	   pin; two MoA presets (one enabled, one not — official rule: ALL list
	   once any is enabled) fill the bottom section. */
	simSettings.providers.push({
		id: "openrouter",
		name: "OpenRouter",
		baseUrl: "https://openrouter.ai/api/v1",
		apiKey: "sk-test-999", // v0.1.33: refresh gate = providerUsable (keyed cloud counts)
		enabled: true,
		customHeaders: {},
		models: [
			"anthropic/claude-opus-4.8",
			"anthropic/claude-opus-4.8-fast",
			"anthropic/claude-opus-4.8-20251101",
			"openai/gpt-5.5",
			"qwen3-next-80b-fast", // orphan fast: no base sibling, stands alone
		],
	});
	(simSettings as unknown as Record<string, unknown>).moa = {
		default_preset: "crew",
		presets: {
			crew: {
				enabled: true,
				reference_models: [
					{ provider: "lmstudio", model: MODEL, enabled: true },
					{ provider: "lmstudio", model: "qwen3-30b-a3b-instruct-2507", enabled: true },
				],
				aggregator: { provider: "lmstudio", model: "hermes-4-70b", enabled: true },
				reference_temperature: null,
				aggregator_temperature: null,
				reference_timeout: null,
				degraded_reference_policy: "loud",
				max_tokens: 4096,
				reference_max_tokens: null,
				fanout: "user_turn",
			},
			off: {
				enabled: false,
				reference_models: [{ provider: "lmstudio", model: MODEL, enabled: true }],
				aggregator: { provider: "lmstudio", model: "hermes-4-70b", enabled: true },
				reference_temperature: null,
				aggregator_temperature: null,
				reference_timeout: null,
				degraded_reference_policy: "loud",
				max_tokens: 4096,
				reference_max_tokens: null,
				fanout: "user_turn",
			},
		},
	};
}
if (scenarioParam() === "moa") {
	(simSettings as unknown as Record<string, unknown>).moa = {
		default_preset: "crew",
		active_preset: "crew",
		presets: {
			crew: {
				enabled: true,
				reference_models: [
					{ provider: "lmstudio", model: MODEL, enabled: true },
					{ provider: "lmstudio", model: "qwen3-30b-a3b-instruct-2507", enabled: true },
				],
				aggregator: { provider: "lmstudio", model: "hermes-4-70b", enabled: true },
				reference_temperature: null,
				aggregator_temperature: null,
				reference_timeout: null,
				degraded_reference_policy: "loud",
				max_tokens: 4096,
				reference_max_tokens: null,
				fanout: "user_turn",
			},
		},
	};
	props.runner.getTools = () => [
		{
			name: "search_vault",
			description: "Search notes by text",
			toolset: "vault",
			dangerous: false,
			parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
			execute: async () => "HASIL-MOA: alpha terdokumentasi di 2 catatan (fasta-satu, fasta-dua).",
		},
	];
}

/* ------------------------------- scenario driver --------------------------- */

function scenarioParam(): string {
	return new URLSearchParams(window.location.search).get("s") ?? "empty";
}

declare global {
	interface Window {
		__oaRequestUrl: typeof cannedRequest;
		__oaNotices?: string[];
		__oaReady?: boolean;
		__oaQueueCheck?: string;
		__oaCompressCheck?: string;
		__oaTitleCheck?: string;
		__oaPersonalityCheck?: string;
	__oaPanelCheck?: string;
		__oaSlashCheck?: string;
		__oaSlash2Check?: string;
		__oaSlash3Check?: string;
		__oaProfileApplied?: string;
		__oaVaultWrites?: { path: string; content: string }[];
		__oaRequests?: { role: string; content: string; tail?: string }[][];
		__oaPdfWorkerB64?: string;
		__oaRequestModels?: string[];
		__oaSavedSessions?: { id: string; title: string; parent: string | null; messageCount: number; wire: string; goal: { status: string; turnsUsed: number } | null; compression: { summary: string; upto: number } | null; turnRoles: string[] }[];
		__oaBranchCheck?: string;
		__oaChipsCheck?: string;
		__oaGoalCheck?: string;
		__oaGoalJudgeCount?: number;
		__oaSteerCheck?: string;
		__oaWebeCheck?: string;
		__oaMoaCheck?: string;
		__oaMoa2Check?: string;
		__oaMenu2Check?: string;
		__oaReaxCheck?: string;
		__oaFcardCheck?: string;
		__oaSysmsgCheck?: string;
		__oaPreviewCheck?: string;
		__oaVaultOpens?: string[];
		__oaActiveNotePath?: string;
		__oaTokenCheck?: string;
		__oaQaskCheck?: string;
		__oaQaskWire?: { role: string; content: string }[][];
		__oaSnipsCheck?: string;
		__oaWorkCheck?: string;
		__oaClfyCheck?: string;
		__oaHlCheck?: string;
		__oaSelCheck?: string;
		__oaSettingsOpened?: number;
		__oaEmptyCheck?: string;
	}
}
window.__oaRequestUrl = cannedRequest;

function typeIntoComposer(text: string): void {
	/* v0.1.24: the composer is a slash-chip contenteditable — replace-all via
	   select-all + insertText fires the same input path a human paste does */
	const ta = document.querySelector<HTMLElement>(".oa-prompt-textarea");
	if (!ta) throw new Error("composer not mounted");
	ta.focus();
	const sel = window.getSelection();
	if (sel) {
		sel.selectAllChildren(ta); // replace-all semantics (matches the old setter)
	}
	document.execCommand("insertText", false, text);
}

/** Static court for the two prompt-kit fidelity fixes (v0.1.104):
    official ThinkingBar geometry (stop right-flush, dotted underline) and
    the four official Tool state glyphs (16px colored svgs, spinning arc
    for streaming). Deterministic — no race with an in-flight run. */
function ToolstateFixture() {
	const parts: ToolPart[] = [
		{ type: "search_vault", state: "input-streaming", input: { query: "alpha" }, toolCallId: "call_ts_1" },
		{ type: "search_vault", state: "input-available", input: { query: "alpha" }, toolCallId: "call_ts_2" },
		{ type: "search_vault", state: "output-available", input: { query: "alpha" }, output: "2 catatan cocok", toolCallId: "call_ts_3" },
		{ type: "search_vault", state: "output-error", input: { query: "alpha" }, errorText: "ENOENT: note not found", toolCallId: "call_ts_4" },
	];
	return (
		<div className="oa-app" style={{ height: "100%", overflow: "auto", padding: 16 }}>
			<ThinkingBar text="Thinking" onStop={() => {}} />
			<div style={{ height: 16 }} />
			<div className="oa-tools-list">
				{parts.map((p) => (
					<Tool key={p.toolCallId} toolPart={p} />
				))}
			</div>
		</div>
	);
}

async function mount(): Promise<void> {
	const mountPoint = document.getElementById("root")!;
	/* v0.1.102 sel-lane chrome mirror — see .oa-fake-leaf in build.mjs: the
	   real pane carries contain:strict + a viewport offset; mount #root
	   inside a fake leaf so fixed overlays are judged under that geometry
	   (sel scenario only — the other lanes keep the legacy 470px shell). */
	if (scenarioParam() === "sel") {
		const leaf = document.createElement("div");
		leaf.className = "oa-fake-leaf";
		mountPoint.replaceWith(leaf);
		leaf.appendChild(mountPoint);
	}
	/* v0.1.104 toolstate fixture — static court for the prompt-kit fidelity
	   fixes; renders the components directly so build.mjs can measure exact
	   geometry/colors without racing an in-flight run. */
	if (scenarioParam() === "toolstate") {
		const rootTs = createRoot(mountPoint);
		rootTs.render(<ToolstateFixture />);
		await delay(60);
		window.__oaReady = true;
		return;
	}
	const root = createRoot(mountPoint);
	root.render(<ChatApp {...props} />);
	await delay(80); // let mount effects (sessions list) settle

	const s = scenarioParam();
	if (s === "panel") {
		/* v0.1.170 amended: the sessions panel is a slash-menu-style popover —
		   no backdrop, anchored above the composer, list scrolling inside, and
		   the topbar toggle shows the history glyph (pre-rename lucide name
		   Obsidian bundles for rotate-ccw-clock). */
		document.querySelector<HTMLButtonElement>(".oa-topbar .oa-icon-btn[aria-label='Conversations']")?.click();
		await delay(120);
		const panel = document.querySelector<HTMLElement>(".oa-panel");
		const list = document.querySelector<HTMLElement>(".oa-panel-list");
		const zone = document.querySelector<HTMLElement>(".oa-composer-zone");
		const pr = panel?.getBoundingClientRect();
		const lr = list?.getBoundingClientRect();
		const zr = zone?.getBoundingClientRect();
		const panelCs = panel ? getComputedStyle(panel) : null;
		const listCs = list ? getComputedStyle(list) : null;
		const toggleSvg = document.querySelector(".oa-topbar .oa-icon-btn[aria-label='Conversations'] svg");
		window.__oaPanelCheck = JSON.stringify({
			backdropGone: !document.querySelector(".oa-panel-backdrop"),
			aboveComposer: !!pr && !!zr && pr.bottom <= zr.top + 1,
			panelW: pr ? Math.round(pr.width) : null,
			listH: lr ? Math.round(lr.height) : null,
			listMaxH: listCs?.maxHeight ?? null,
			rowCount: document.querySelectorAll(".oa-panel-row").length,
			panelRadius: panelCs?.borderRadius ?? null,
			hasBorder: panelCs ? panelCs.borderTopWidth !== "0px" && panelCs.borderRightWidth !== "0px" : false,
			glyph: toggleSvg?.getAttribute("class") ?? "",
		});
	} else if (s === "menu") {
		document.querySelector<HTMLButtonElement>(".oa-model-pill")?.click();
		await delay(60);
	} else if (s === "menu2") {
		/* v0.1.32 model-menu parity (Hermes Desktop shell.modelMenu +
		   model-visibility-dialog). Expectations are computed with the same
		   modelMenu lib the components use; the unit test pins the lib to the
		   official semantics, so this proves the WIRING end to end. */
		const input = () => document.querySelector<HTMLInputElement>(".oa-model-menu-search input")!;
		const setInputValue = (el: HTMLInputElement, value: string) => {
			const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
			setter.call(el, value);
			el.dispatchEvent(new Event("input", { bubbles: true }));
		};
		const press = (key: string) =>
			input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
		const groupBox = (name: string) =>
			[...document.querySelectorAll<HTMLElement>(".oa-model-menu-group")].find(
				(g) => g.querySelector(".oa-model-menu-hdr-name")?.textContent === name
			);
		const rowTexts = (root?: HTMLElement) =>
			[...(root?.querySelectorAll<HTMLElement>(".oa-model-menu-item-label") ?? [])].map((x) => x.textContent ?? "");
		const clickPill = async () => {
			document.querySelector<HTMLButtonElement>(".oa-model-pill")?.click();
			await delay(90);
		};
		const visGroup = (name: string) =>
			[...document.querySelectorAll<HTMLElement>(".oa-vis-group")].find(
				(g) => g.querySelector(".oa-vis-group-name")?.textContent === name
			);
		const visSwitch = (group: string, labelContains: string) =>
			[...(visGroup(group)?.querySelectorAll<HTMLElement>(".oa-vis-row") ?? [])].find((r) =>
				(r.querySelector(".oa-vis-row-label")?.textContent ?? "").includes(labelContains)
			)?.querySelector<HTMLInputElement>(".checkbox-container input");

		/* — menu: placeholder, alphabetical groups, collapsed family, MoA section — */
		await clickPill();
		const placeholder = input()?.getAttribute("placeholder") ?? "";
		const hdrNames = [...document.querySelectorAll(".oa-model-menu-hdr-name")].map((x) => x.textContent ?? "");
		const clParts = modelDisplayParts("anthropic/claude-opus-4.8");
		const gptParts = modelDisplayParts("openai/gpt-5.5");
		const orphanParts = modelDisplayParts("qwen3-next-80b-fast");
		const orRows1 = rowTexts(groupBox("OpenRouter"));
		const listEl = document.querySelector<HTMLElement>(".oa-model-menu-list") ?? undefined;
		const allLabels = rowTexts(listEl);
		const sect = document.querySelector(".oa-model-menu-sect")?.textContent ?? "";
		const footerTexts = [...document.querySelectorAll(".oa-model-menu-footer button")].map((x) => x.textContent ?? "");
		const kbOnOpen = document.querySelector(".oa-model-menu-item.is-kb")?.textContent ?? "";

		/* — keyboard: current row (idx 0) → Down ×2 lands on the OpenRouter
		   Claude family → Enter commits a CROSS-provider (provider, model) pair — */
		/* a beat between keys: two presses in the same tick would both read the
		   pre-flush kbIndex and land on the same row (real users type slower) */
		press("ArrowDown");
		await delay(30);
		press("ArrowDown");
		await delay(30);
		const kbTarget = document.querySelector(".oa-model-menu-item.is-kb")?.textContent ?? "";
		press("Enter");
		await delay(140);
		const pillAfterEnter = document.querySelector(".oa-model-pill-label")?.textContent ?? "";
		const pickedProvider = simSettings.activeProviderId;
		const pickedModel = simSettings.model;

		/* — collapse toggle: persists to settings, hides the group's rows — */
		await clickPill();
		groupBox("OpenRouter")?.querySelector<HTMLButtonElement>(".oa-model-menu-hdr")?.click();
		await delay(80);
		const collapsedHidden = rowTexts(groupBox("OpenRouter")).length === 0;
		const collapsedPersist = (simSettings.collapsedMenuProviders ?? []).includes("openrouter");

		/* — search ignores the collapsed rail (official rule) — */
		setInputValue(input(), "claude");
		await delay(80);
		const searchRows = rowTexts(groupBox("OpenRouter"));
		setInputValue(input(), "");
		await delay(70);
		groupBox("OpenRouter")?.querySelector<HTMLButtonElement>(".oa-model-menu-hdr")?.click();
		await delay(80);
		const expandedBackRows = rowTexts(groupBox("OpenRouter")).length;

		/* — v0.1.115 komponen SearchField (strip di dalam menu): struktur
		   peran/ikon/input, ✕ hanya saat berisi, klik ✕ membersihkan,
		   Escape DUA TAHAP (berisi → bersihkan + telan, menu tetap buka) — */
		const msearchBox = document.querySelector<HTMLElement>(".oa-model-menu-search");
		const sboxParts = !!msearchBox &&
			msearchBox.classList.contains("oa-searchbox") && msearchBox.classList.contains("oa-searchbox--strip") &&
			msearchBox.getAttribute("role") === "search" &&
			!!msearchBox.querySelector(".oa-searchbox-icon") && !!msearchBox.querySelector("input.oa-searchbox-input");
		const noClearEmpty = !msearchBox?.querySelector(".oa-searchbox-clear");
		setInputValue(input(), "zz");
		await delay(60);
		const mclearBtn = msearchBox?.querySelector<HTMLButtonElement>(".oa-searchbox-clear") ?? null;
		const clearShown = !!mclearBtn;
		mclearBtn?.click();
		await delay(60);
		const clearWorks = (input()?.value ?? "") === "";
		setInputValue(input(), "claude");
		await delay(60);
		input()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		await delay(60);
		const escAfterFilled = (input()?.value ?? "") === "" && !!document.querySelector(".oa-model-menu");

		/* — v0.1.120 (owner susulan: "oa-model-menu-list sepertinya sama" —
		   BENAR, sisa serapan kedua blok yang sama) — saksi ghost di list
		   model: clone satu GRUP provider asli, ganti label item pertamanya
		   teks TAK-TERPUTUS (nama family super panjang), ukur apakah grup
		   meluber keluar list; plus pin padding list 4px. Sisip-ukur-buang
		   sinkron penuh (tanpa await) supaya kaki refresh tak terganggu. */
		const mList = document.querySelector<HTMLElement>(".oa-model-menu-list");
		const mGroup = mList?.querySelector<HTMLElement>(".oa-model-menu-group");
		let modelListNoXOverflow = false;
		let modelGroupContained = false;
		let modelListPadPin = false;
		if (mList && mGroup) {
			const gClone = mGroup.cloneNode(true) as HTMLElement;
			const gLabel = gClone.querySelector<HTMLElement>(".oa-model-menu-item-label");
			if (gLabel) gLabel.textContent = "familynamatakputus".repeat(8); // 144 char tanpa spasi
			mList.appendChild(gClone);
			const listRect = mList.getBoundingClientRect();
			const gRect = gClone.getBoundingClientRect();
			modelListNoXOverflow = mList.scrollWidth <= mList.clientWidth + 1;
			modelGroupContained = gRect.right <= listRect.right + 1 && gRect.left >= listRect.left - 1;
			modelListPadPin = getComputedStyle(mList).paddingLeft === "4px";
			gClone.remove();
		}

		/* — Refresh Models: menu STAYS OPEN; catalogs re-pull per provider — */
		let spinSeen = false;
		const spinObs = new MutationObserver((records) => {
			if (records.some((r) => `${r.oldValue ?? ""}`.includes("oa-spin"))) spinSeen = true;
		});
		spinObs.observe(document.getElementById("root")!, {
			subtree: true,
			attributes: true,
			attributeFilter: ["class"],
			attributeOldValue: true,
		});
		const refreshBtn = [...document.querySelectorAll<HTMLButtonElement>(".oa-model-menu-footer button")].find((b) =>
			(b.textContent ?? "").includes("Refresh Models")
		);
		refreshBtn?.click();
		await delay(30);
		const menuOpenDuring = !!document.querySelector(".oa-model-menu");
		for (let i = 0; i < 60 && document.querySelector(".oa-model-menu-footer button:disabled"); i++) await delay(100);
		await delay(120);
		spinObs.disconnect();
		const menuOpenAfter = !!document.querySelector(".oa-model-menu");
		const refreshedOrCatalog = (simSettings.providers.find((p) => p.id === "openrouter")?.models ?? []).includes("hermes-4-70b");
		const refreshedRows = rowTexts(groupBox("OpenRouter")).length;
		const refreshNotice = (window.__oaNotices ?? []).some((n) => n.includes("refreshed 2 provider catalog"));

		/* — Edit Models… → the visibility dialog — */
		const editBtn = [...document.querySelectorAll<HTMLButtonElement>(".oa-model-menu-footer button")].find((b) =>
			(b.textContent ?? "").includes("Edit Models")
		);
		editBtn?.click();
		await delay(140);
		const dlgOpen = !!document.querySelector(".oa-modal-overlay .oa-modal");
		const dlgTitle = document.querySelector(".oa-vis-title")?.textContent ?? "";
		const visGroupCount = document.querySelectorAll(".oa-vis-group").length;
		const orMaster = () => visGroup("OpenRouter")?.querySelector<HTMLInputElement>(".oa-vis-master");
		const lmsMaster = () => visGroup("LM Studio (local)")?.querySelector<HTMLInputElement>(".oa-vis-master");
		const mastersAllOn =
			orMaster()?.checked === true && orMaster()?.indeterminate === false &&
			lmsMaster()?.checked === true && lmsMaster()?.indeterminate === false;

		/* one row off → tri-state indeterminate; the rest off → hide-all sentinel;
		   one back on → sentinel cleared, ONLY that family kept (official) */
		const k70 = modelVisibilityKey("openrouter", "hermes-4-70b");
		visSwitch("OpenRouter", modelDisplayParts("hermes-4-70b").name)?.click();
		await delay(80);
		const masterPartial = orMaster()?.indeterminate === true;
		const vis1 = simSettings.visibleModels ?? [];
		const oneOff = vis1.length > 0 && !vis1.includes(k70);
		for (const m of [MODEL, "qwen3-30b-a3b-instruct-2507", "hermes-4-405b"]) {
			visSwitch("OpenRouter", modelDisplayParts(m).name)?.click();
			await delay(70);
		}
		const sentinelKey = "openrouter::";
		const sentinelAdded = (simSettings.visibleModels ?? []).includes(sentinelKey);
		visSwitch("OpenRouter", modelDisplayParts("hermes-4-70b").name)?.click();
		await delay(80);
		const vis2 = simSettings.visibleModels ?? [];
		const orKept = vis2.filter((k) => k.startsWith(sentinelKey) && k !== sentinelKey);
		const onlyOneKept = !vis2.includes(sentinelKey) && orKept.length === 1 && orKept[0] === k70;
		const lmsKeys = [MODEL, "qwen3-30b-a3b-instruct-2507", "hermes-4-70b", "hermes-4-405b"].map((m) =>
			modelVisibilityKey("lmstudio", m)
		);
		const otherProviderUntouched = lmsKeys.every((k) => vis2.includes(k));
		const addProviderShown = (document.querySelector(".oa-vis-add")?.textContent ?? "").includes("Add provider");
		/* frame shot: the dialog stays open — it IS the new surface */

		window.__oaMenu2Check = JSON.stringify({
			placeholderOk: placeholder === "Search models",
			groupsAlpha: hdrNames.join("|") === "LM Studio (local)|OpenRouter",
			rowsCollapsedOk: orRows1.length === 3, // merged fast + dropped pin + orphan kept
			claudeNamed: (orRows1[0] ?? "") === clParts.name, // merged family shows the base name only (official)
			gptNamed: (orRows1[1] ?? "") === gptParts.name,
			orphanFastTag: (orRows1[2] ?? "").startsWith(orphanParts.name) && (orRows1[2] ?? "").includes("Fast"),
			datePinDropped: !allLabels.some((l) => l.includes("20251101")),
			moaSect: sect === "MoA presets",
			moaCrewRow: allLabels.some((l) => l === "MoA: crew"),
			moaOffRow: allLabels.some((l) => l === "MoA: off"),
			footerTexts: footerTexts.some((t) => t.includes("Refresh Models")) && footerTexts.some((t) => t.includes("Edit Models")),
			kbCurrentRow: kbOnOpen.includes(modelDisplayParts(MODEL).name.split(" ").slice(0, 2).join(" ")),
			kbTargetClaude: kbTarget.startsWith(clParts.name),
			crossProviderPicked: pickedProvider === "openrouter" && pickedModel === "anthropic/claude-opus-4.8",
			pillShowsClaude: pillAfterEnter.includes(clParts.name), // official prettify drops the "claude-" prefix
			collapsedHidden,
			collapsedPersist,
			searchSpansHidden: searchRows.some((l) => l.startsWith(clParts.name)),
			expandedBack: expandedBackRows === 3 && !(simSettings.collapsedMenuProviders ?? []).includes("openrouter"),
			sboxParts,
			noClearEmpty,
			clearShown,
			clearWorks,
			escAfterFilled,
			menuOpenDuring,
			spinSeen,
			menuOpenAfter,
			refreshedOrCatalog,
			refreshedRows: refreshedRows === 4,
			healedModel: simSettings.model === MODEL,
			refreshNotice,
			refreshNoSettingsJump: (window.__oaSettingsOpened ?? 0) === 0,
			dlgOpen,
			dlgTitle: dlgTitle === "Models",
			twoVisGroups: visGroupCount === 2,
			mastersAllOn,
			masterPartial,
			oneOff,
			sentinelAdded,
			onlyOneKept,
			otherProviderUntouched,
			addProviderShown,
			modelListNoXOverflow,
			modelGroupContained,
			modelListPadPin,
		});
	} else if (s === "atref") {
		typeIntoComposer("@dail");
		await delay(100);
	} else if (s === "menugeo") {
		/* v0.1.185 (owner: "ubah oa-attach-menu dan oa-model menu diatas
		   composer"): both menus are full-width ABOVE the composer — same
		   geometry as the slash menu / sessions panel, not small popovers
		   pinned to the buttons. */
		const zoneRect = () => document.querySelector<HTMLElement>(".oa-composer-zone")?.getBoundingClientRect();
		document.querySelector<HTMLButtonElement>(".oa-model-pill")?.click();
		await delay(90);
		const mRect = document.querySelector<HTMLElement>(".oa-model-menu")?.getBoundingClientRect();
		const z0 = zoneRect();
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await delay(60);
		document.querySelector<HTMLButtonElement>(".oa-attach-anchor > .oa-attach-toggle")?.click();
		await delay(90);
		const aRect = document.querySelector<HTMLElement>(".oa-attach-menu")?.getBoundingClientRect();
		const z1 = zoneRect();
		window.__oaMenuGeoCheck = JSON.stringify({
			modelShown: !!mRect,
			attachShown: !!aRect,
			modelAbove: !!mRect && !!z0 && mRect.bottom <= z0.top + 1,
			attachAbove: !!aRect && !!z1 && aRect.bottom <= z1.top + 1,
			modelWide: !!mRect && !!z0 && mRect.width >= z0.width - 25,
			attachWide: !!aRect && !!z1 && aRect.width >= z1.width - 25,
		});
	} else if (s === "attach" || s === "snips") {
		document.querySelector<HTMLButtonElement>(".oa-attach-anchor > .oa-attach-toggle")?.click();
		await delay(60);
		if (s === "snips") {
			/* v0.1.79 picker toggle: the slash3-seeded "Tersembunyi Mana"
			   (picker:false) must NOT appear here, while the two visible
			   ones do; the root row's sub counts only ENABLED snippets */
			const rootRow = [...document.querySelectorAll<HTMLButtonElement>(".oa-attach-item")].find((b) =>
				b.textContent?.includes("Prompt snippets")
			);
			const rootSub = rootRow?.querySelector(".oa-attach-item-sub")?.textContent ?? "";
			rootRow?.click();
			await delay(60);
			const rows = [...document.querySelectorAll<HTMLButtonElement>(".oa-attach-item")].map((b) =>
				(b.querySelector(".oa-attach-item-label")?.textContent ?? "").trim()
			);
			window.__oaSnipsCheck = JSON.stringify({ rootSub, rows });
			/* back to the root view so the screenshot keeps the classic frame */
			document.querySelector<HTMLButtonElement>(".oa-attach-back")?.click();
			await delay(60);
		}
	} else if (s === "attachsent") {
		/* prompt typed; the file itself is attached by the driver (native
		   chooser can't be triggered from inside the page) — driver then
		   clicks Send and asserts the bubble keeps its attachment block */
		typeIntoComposer("Summarize the attached file in one sentence.");
		await delay(40);
	} else if (s === "queue") {
		/* queue prompt E2E (owner 2026-07-26): first turn is slow on purpose —
		   while it's thinking, two more prompts must become queue rows, the
		   frame is captured mid-queue, then the queue must drain IN ORDER */
		typeIntoComposer("queue alpha");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		await delay(250); // first turn still thinking (900ms canned delay)
		typeIntoComposer("queue beta");
		await delay(40);
		document.querySelector<HTMLButtonElement>("[aria-label='Queue prompt']")?.click(); // enqueue #1
		await delay(80);
		typeIntoComposer("queue gamma");
		await delay(40);
		document.querySelector<HTMLButtonElement>("[aria-label='Queue prompt']")?.click(); // enqueue #2
		await delay(160);
		const queuedRowsSeen = document.querySelectorAll(".oa-queue-row").length;
		window.__oaReady = true; // mid-queue frame: rows + thinking bar visible
		for (let i = 0; i < 90; i++) {
			await delay(150);
			const busy = !!document.querySelector(".oa-thinking-bar");
			const left = document.querySelectorAll(".oa-queue-row").length;
			if (!busy && left === 0) break;
		}
		await delay(150);
		const users = [...document.querySelectorAll(".oa-msg-user")].map((b) => b.textContent ?? "");
		const order = ["queue alpha", "queue beta", "queue gamma"].map((x) => users.findIndex((u) => u.includes(x)));
		window.__oaQueueCheck = JSON.stringify({ queuedRowsSeen, order, users: users.length });
	} else if (s === "title") {
		/* title generation E2E (v0.1.17): one ordinary prompt; after the reply
		   lands, ONE aux call names the brand-new session — the conversations
		   panel (opened by a real click) must list that title on top */
		typeIntoComposer("Ceritakan tentang kucing oren bernama Oyen yang suka tidur di atas keyboard.");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		for (let i = 0; i < 60; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		await delay(200); // let the aux title call + re-save settle
		document.querySelector<HTMLButtonElement>(".oa-topbar .oa-icon-btn[aria-label='Conversations']")?.click();
		await delay(120);
		const saved = (window.__oaSavedSessions ?? []).slice(-1)[0];
		const panelHas = (document.body.textContent ?? "").includes("Kucing Oren Kesayangan");
		window.__oaTitleCheck = JSON.stringify({ title: saved?.title ?? null, panelHas });
	} else if (s === "compress") {
		/* compression E2E (v0.1.17): three long prompts cross the 900-token
		   window × 0.80 threshold; the third run must fold [u1,a1] into the
		   rolling summary (2 tail messages protected), put the note on the
		   wire, tell the user, and save the cache — history itself untouched */
		const filler = (tag: string, n: number) =>
			`${tag}: ${"diskusi panjang tentang arsitektur plugin dan konteks model. ".repeat(Math.ceil(n / 63)).slice(0, n)}`;
		const sendPrompt = async (text: string) => {
			typeIntoComposer(text);
			await delay(40);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			for (let i = 0; i < 80; i++) {
				await delay(150);
				if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
			}
			await delay(150);
		};
		await sendPrompt(filler("Bab 1 arsitektur", 1200));
		await sendPrompt(filler("Bab 2 kompresi konteks", 1200));
		await sendPrompt(filler("Bab 3 ringkasan bergulir", 1200));
		const reqs = window.__oaRequests ?? [];
		const hasNote = reqs.some((r) => r.some((m) => m.role === "system" && m.content.includes("[Earlier conversation, compacted")));
		const noteHasSummary = reqs.some((r) => r.some((m) => m.role === "system" && m.content.includes("RINGKASAN-OK")));
		const saved = (window.__oaSavedSessions ?? []).slice(-1)[0];
		/* v0.1.57: the compaction note must ride the system banner (honest
		   system role), not pose as an assistant bubble */
		const sysRow = [...document.querySelectorAll<HTMLElement>(".oa-sysmsg")].find((r) => (r.textContent ?? "").includes("Context compacted"));
		const domNotice = !!sysRow && !sysRow.closest(".oa-msg");
		/* v0.1.184: a START banner is also pushed when compaction begins */
		const startRow = [...document.querySelectorAll<HTMLElement>(".oa-sysmsg")].find((r) => (r.textContent ?? "").includes("Compacting context — folding"));
		const domStartNotice = !!startRow && !startRow.closest(".oa-msg");
		window.__oaCompressCheck = JSON.stringify({
			hasNote,
			noteHasSummary,
			summary: saved?.compression?.summary ?? null,
			upto: saved?.compression?.upto ?? null,
			messagesKept: saved?.messageCount ?? null, // 6 = full history survives on disk
			domNotice,
			domStartNotice,
		});
	} else if (s === "slash") {
		/* slash quick-batch E2E (v0.1.20, official desktop parity): /title
		   writes the session title to disk, /version reports build info,
		   /q while idle auto-drains (edge-independent drain), and the
		   /sessions alias opens the panel with the arg as its search */
		const sendSlash = async (text: string) => {
			typeIntoComposer(text);
			await delay(40);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			await delay(280);
		};
		await sendSlash("/title Kucing Terbang");
		await sendSlash("/version");
		await sendSlash("/q pesan antre satu");
		for (let i = 0; i < 60; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		await delay(200);
		await sendSlash("/sessions kucing");
		await delay(200);
		const saved = (window.__oaSavedSessions ?? []).slice(-1)[0];
		const bodyText = document.body.textContent ?? "";
		const panelSearch = document.querySelector<HTMLInputElement>('.oa-panel-search input[aria-label="Search chats"]');
		const panelPrefill = panelSearch?.value ?? null;
		/* v0.1.115 komponen SearchField (pill di panel riwayat): struktur
		   peran/ikon/input; prefill "kucing" → ✕ tampak; klik → kosong */
		const panelBox = panelSearch?.closest(".oa-panel-search");
		const panelBoxParts = !!panelBox &&
			panelBox.classList.contains("oa-searchbox") && panelBox.classList.contains("oa-searchbox--pill") &&
			panelBox.getAttribute("role") === "search" &&
			!!panelBox.querySelector(".oa-searchbox-icon");
		const panelClear = panelBox?.querySelector<HTMLButtonElement>(".oa-searchbox-clear") ?? null;
		const panelClearShown = (panelPrefill ?? "") !== "" && !!panelClear;
		panelClear?.click();
		await delay(60);
		const panelClearWorks =
			(document.querySelector<HTMLInputElement>('.oa-panel-search input[aria-label="Search chats"]')?.value ?? "") === "";
		/* v0.1.119 (owner: ikon tempat sampah "kedorong akibat judul yang
		   panjang, jadinya kepotong dan tidak dapat diklik") — saksi geometri
		   baris GHOST murni: clone satu baris panel asli, ganti judulnya
		   dengan teks TAK TERPUTUS 136 char (kasus owner), paksa tombol
		   hapus tampak persis seperti dinyalakan :hover, lalu ukur apakah
		   ada yang meluber keluar baris/panel. State React tak disentuh dan
		   ghost dibuang lagi — geometri CSS jujur, plus pin rule penyebab. */
		const panelEl = document.querySelector<HTMLElement>(".oa-panel");
		const srcRow = document.querySelector<HTMLElement>(".oa-panel-row");
		let ghostGeometry = false;
		let ghostPins = false;
		let listNoXOverflow = false;
		if (panelEl && srcRow) {
			const ghost = srcRow.cloneNode(true) as HTMLElement;
			const titleEl = ghost.querySelector<HTMLElement>(".oa-panel-row-title");
			if (titleEl) titleEl.textContent = "judultakberhenti".repeat(8); // 136 char tanpa spasi
			const delEl = ghost.querySelector<HTMLElement>(".oa-panel-row-del");
			if (delEl) delEl.style.display = "inline-flex"; // tiru :hover yang menyalakannya
			srcRow.parentElement?.appendChild(ghost);
			const listEl = panelEl.querySelector<HTMLElement>(".oa-panel-list");
			const panelRect = panelEl.getBoundingClientRect();
			const ghostRect = ghost.getBoundingClientRect();
			const delRect = delEl?.getBoundingClientRect();
			const titleRect = titleEl?.getBoundingClientRect();
			ghostGeometry =
				ghostRect.right <= panelRect.right + 1 &&
				ghost.scrollWidth <= ghost.clientWidth + 1 &&
				!!delRect && !!titleRect &&
				delRect.right <= ghostRect.right + 1 &&
				titleRect.right <= ghostRect.right + 1;
			/* akar bug yang TEREKSPOS ghost (v0.1.119 un-merge): rule gabungan
			   2848 dulu menjadikan list flex ROW+wrap — grup melebar mengikuti
			   judul terpanjang (901px di panel 289px!) hingga list scroll-X.
			   Invarian jujur: list tak boleh overflow horizontal, titik. */
			listNoXOverflow = !!listEl && listEl.scrollWidth <= listEl.clientWidth + 1;
			ghostPins =
				getComputedStyle(ghost).overflowX === "hidden" &&
				!!titleEl && getComputedStyle(titleEl).minWidth === "0px";
			ghost.remove();
		}
		/* v0.1.119 (owner, via DevTools: "karna paddingnya") — strip pencarian
		   menu profil diukur NYATA dari computed style: padding harus ikut
		   ritme baris item (6px vertikal / 10px horizontal), bukan 8/12
		   bawaan strip yang menonjol di menu 220px; menu tetap utuh & menutup
		   bersih. Panel ditutup dulu lewat tombol aslinya. */
		document.querySelector<HTMLButtonElement>('.oa-panel [aria-label="Close panel"]')?.click();
		await delay(80);
		document.querySelector<HTMLButtonElement>(".oa-profile-pill")?.click();
		await delay(100);
		const pMenu = document.querySelector<HTMLElement>(".oa-profile-menu");
		const pStrip = pMenu?.querySelector<HTMLElement>(".oa-searchbox--strip");
		const pStripStyle = pStrip ? getComputedStyle(pStrip) : null;
		const profileStripPad =
			!!pStripStyle &&
			pStripStyle.paddingTop === "6px" &&
			pStripStyle.paddingBottom === "6px" &&
			pStripStyle.paddingLeft === "10px" &&
			pStripStyle.paddingRight === "10px";
		const profileMenuItems = pMenu?.querySelectorAll(".oa-profile-menu-item").length ?? 0;
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
		await delay(80);
		const profileMenuClosed = !document.querySelector(".oa-profile-menu");
		/* v0.1.116 kunci markdown di composer kaya (adapter caret-only):
		   chord baris-baru melanjutkan list & keluar di item kosong, Tab
		   menyisip indentasi, auto-pair + skip-over + Backspace pasangan.
		   v0.1.127 amended: bawaan dibalik — chord baris-baru = ENTER POLOS
		   (Shift+Enter kini chord KIRIM — tombol lama itu mengirim draft!). */
		const comp = document.querySelector<HTMLElement>(".oa-prompt-textarea");
		const stripNl = (t: string) => t.replace(/\n+$/, "");
		const compText = () => stripNl(comp?.innerText ?? "");
		const ckey = (key: string, shiftKey = false) =>
			comp?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
		let mdCont = false, mdExit = false, mdTab = false, mdPair = false, mdSkip = false, mdPairDel = false;
		const compFound = comp !== null;
		if (comp) {
			comp.focus();
			document.execCommand("insertText", false, "- satu");
			await delay(30);
			ckey("Enter");
			await delay(30);
			mdCont = compText() === "- satu\n- ";
			ckey("Enter");
			await delay(30);
			mdExit = compText() === "- satu";
			ckey("Tab");
			await delay(30);
			/* sentinel "x": membuktikan indentasi "  " tertanam SEBELUM caret
			   di baris kosong — innerText memangsa spasi ujung sehingga ukur
			   panjang mentah saja bisa bohong */
			document.execCommand("insertText", false, "x");
			await delay(20);
			mdTab = compText().endsWith("  x");
			ckey("(");
			await delay(30);
			mdPair = compText().endsWith("()");
			ckey(")");
			await delay(30);
			mdSkip = compText().endsWith("()");
			ckey("(");
			await delay(30);
			const lenPreDel = compText().length;
			ckey("Backspace");
			await delay(30);
			/* delta −2: pair1 "()" masih ada sehingga endsWith tak cukup tajam */
			mdPairDel = compText().length === lenPreDel - 2;
			/* bersihkan composer supaya draft tak mengotori langkah berikutnya */
			const rng = document.createRange();
			rng.selectNodeContents(comp);
			const sel2 = window.getSelection();
			sel2?.removeAllRanges();
			sel2?.addRange(rng);
			document.execCommand("delete");
			await delay(30);
			comp.blur();
		}
		window.__oaSlashCheck = JSON.stringify({
			title: saved?.title ?? null,
			versionShown: bodyText.includes("build dev-build"),
			drainWorked: [...document.querySelectorAll(".oa-msg-user")].some((b) => (b.textContent ?? "").includes("pesan antre satu")),
			panelOpen: panelSearch !== null,
			panelPrefill,
			panelBoxParts,
			panelClearShown,
			panelClearWorks,
			compFound,
			mdCont,
			mdExit,
			mdTab,
			mdPair,
			mdSkip,
			mdPairDel,
			ghostGeometry,
			ghostPins,
			listNoXOverflow,
			profileStripPad,
			profileMenuItems,
			profileMenuClosed,
		});
	} else if (s === "personality") {
		/* v0.1.171 (owner: "/personality uwu aktif tapi respon tidak berubah"):
		   wire-level proof — /personality sets the session overlay, and the
		   NEXT run's system prompt carries the ACTIVE overlay section (the
		   enforcing wrapper + the overlay text itself). */
		const sendS = async (text: string) => {
			typeIntoComposer(text);
			await delay(40);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			await delay(300);
		};
		await sendS("/personality uwu");
		await delay(200);
		const statusText = document.querySelector(".oa-statusbar-personality")?.textContent ?? "";
		const noticeText = document.body.textContent ?? "";
		await sendS("hello");
		for (let i = 0; i < 60; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		await delay(200);
		const reqs = (window.__oaRequests ?? []).map((r) => r.filter((m) => m.role === "system").map((m) => m.content));
		const sysHasOverlay = reqs.some((arr) =>
			arr.some((c) => c.includes('Personality overlay "uwu" is ACTIVE') && c.includes("MUST adopt this voice") && c.includes("hewwo! i'm your fwiendwy assistant uwu~"))
		);
		const runErrored = [...document.querySelectorAll(".oa-msg-assistant")].some((b) => (b.textContent ?? "").startsWith("Error:"));
		window.__oaPersonalityCheck = JSON.stringify({
			statusText,
			noticeShown: noticeText.includes("Overlay `uwu` active for this session"),
			runErrored,
			sysHasOverlay,
		});
	} else if (s === "slash2") {
		/* slash medium batch E2E (v0.1.21): arg-stage options render, picking
		   one fills the composer, Send applies it; /profile switches via the
		   real prop; /save writes the transcript into the vault; /status
		   reports the mode we just set */
		const sendS = async (text: string) => {
			typeIntoComposer(text);
			await delay(40);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			await delay(280);
		};
		// an ordinary prompt first — gives /status usage and /save real content
		typeIntoComposer("halo dunia dari slash2");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		for (let i = 0; i < 60; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		await delay(150);
		// options-stage: the popover completes the ARGUMENT after the space
		typeIntoComposer("/approvals ");
		await delay(80);
		const optionRows = [...document.querySelectorAll(".oa-slash-item")].map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim());
		const yoloRow = [...document.querySelectorAll<HTMLElement>(".oa-slash-item")].find((el) => (el.textContent ?? "").includes("yolo"));
		yoloRow?.click();
		await delay(60);
		const filled = document.querySelector<HTMLElement>(".oa-prompt-textarea")?.textContent ?? "";
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		await delay(280);
		await sendS("/profile research");
		await sendS("/save");
		await sendS("/status");
		const bodyText = document.body.textContent ?? "";
		const writes = window.__oaVaultWrites ?? [];
		window.__oaSlash2Check = JSON.stringify({
			optionRows,
			filled,
			modeNow: simSettings.approvalMode,
			profileApplied: window.__oaProfileApplied ?? null,
			savePath: writes[0]?.path ?? null,
			saveHasContent: (writes[0]?.content ?? "").includes("halo dunia dari slash2"),
			/* v0.1.124 (owner console startup: 'PS' crash dari NOTE hasil /save):
			   file vault yang ditulis /save harus membawa label mermaid
			   TERKUTIP — render Obsidian pada note tidak boleh meledak lagi */
			saveMermaidSalvage: (writes[0]?.content ?? "").includes('C["Skematik Desain (SD)"]') &&
				(writes[0]?.content ?? "").includes('-->|"Revisi (final)"|') &&
				(writes[0]?.content ?? "").includes("%% Semua agen mengirim hasil ke titik evaluasi bersama") &&
				!/(?:C\[Skematik Desain \(SD\)\]|;[ \t]+%(?!%))/.test(writes[0]?.content ?? ""),
			statusShown: bodyText.includes("Session status") && bodyText.includes("yolo"),
		});
	} else if (s === "slash3") {
		/* skills → slash palette E2E (v0.1.22): a bare "/" renders the Hermes
		   group headers (Commands above Skills), picking a skill STAGES the
		   typed verb; `/skills read <disabled>` still arms, and the skill's
		   instructions ride exactly one next message to the model */
		typeIntoComposer("/");
		await delay(120);
		const headers = [...document.querySelectorAll(".oa-slash-hdr")].map((el) => (el.textContent ?? "").trim());
		const skillRow = [...document.querySelectorAll<HTMLElement>(".oa-slash-item")].find((el) =>
			(el.textContent ?? "").includes("beta-skill")
		);
		const skillRowSeen = !!skillRow;
		/* v0.1.120 (un-merge lengkap, aslakan slash & @ menu): popover masih
		   terbuka — pin hukum aslinya: padding kiri-kanan 0 (bukan 18px
		   serapan), display block (bukan flex ROW+wrap). v0.1.165 (Hermes
		   trigger-popover parity): hairline grup DIRETIRE — header kini
		   terpisah lewat spacing, jadi pin berubah dari "hairline selebar
		   menu" jadi "TANPA border-top sama sekali". */
		const sMenu = document.querySelector<HTMLElement>(".oa-slash-menu");
		let slashPadPin = false;
		let slashDisplayPin = false;
		let slashHdrNoRule = false;
		if (sMenu) {
			const menuStyle = getComputedStyle(sMenu);
			slashPadPin = menuStyle.paddingLeft === "0px" && menuStyle.paddingRight === "0px";
			slashDisplayPin = menuStyle.display === "block";
			const hdrs = [...sMenu.querySelectorAll<HTMLElement>(".oa-slash-hdr")];
			slashHdrNoRule = hdrs.length > 0 && hdrs.every((h) => getComputedStyle(h).borderTopWidth === "0px");
		}
		skillRow?.click();
		await delay(60);
		const filledAfterClick = document.querySelector<HTMLElement>(".oa-prompt-textarea")?.textContent ?? "";
		const sendS = async (text: string) => {
			typeIntoComposer(text);
			await delay(40);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			await delay(240);
		};
		await sendS("/skills read beta-skill");
		const noticeSeen = (document.body.textContent ?? "").includes("beta-skill") && (document.body.textContent ?? "").includes("loaded");
		await sendS("halo dari slash3");
		for (let i = 0; i < 60; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		await sendS("pesan kedua tanpa skill");
		for (let i = 0; i < 60; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		const reqs = window.__oaRequests ?? [];
		const lastUser = (r: { role: string; content: string }[]) => [...r].reverse().find((m) => m.role === "user")?.content ?? "";
		/* agent-run requests only: aux calls (title gen) ride the same mock */
		const mainReqs = reqs.filter((r) => {
			const u = lastUser(r);
			return u.includes("halo dari slash3") || u.includes("pesan kedua tanpa skill");
		});
		/* Snippets slash group (v0.1.77 Commands tab): flagged snippet rows
		   render under their own header; clicking stages the FULL prompt
		   text into the composer (Copilot showInSlashMenu parity) */
		typeIntoComposer("/");
		await delay(120);
		const headers2 = [...document.querySelectorAll(".oa-slash-hdr")].map((el) => (el.textContent ?? "").trim());
		const snipRow = [...document.querySelectorAll<HTMLElement>(".oa-slash-item")].find((el) =>
			(el.textContent ?? "").includes("ringkas-dulu")
		);
		const snipRowSeen = !!snipRow;
		snipRow?.click();
		await delay(60);
		const snipFilled = document.querySelector<HTMLElement>(".oa-prompt-textarea")?.textContent ?? "";
		window.__oaSlash3Check = JSON.stringify({
			headers,
			skillRowSeen,
			filledAfterClick,
			noticeSeen,
			reqHadSkill: mainReqs.length >= 1 && mainReqs[0] ? lastUser(mainReqs[0]).startsWith("[Skill: beta-skill]") && lastUser(mainReqs[0]).includes("INSTRUKSI-BETA") : false,
			reqCleanAfter: mainReqs.length >= 2 && mainReqs[1] ? !lastUser(mainReqs[1]).includes("[Skill:") : null,
			mainReqCount: mainReqs.length,
			snipGroupOk: headers2.includes("Snippets"),
			snipRowSeen,
			snipFilled,
			slashPadPin,
			slashDisplayPin,
			slashHdrNoRule,
		});
	} else if (s === "token") {
		/* prompt tokens E2E (v0.1.78, Copilot {} / {[[]]} / {activeNote} /
		   {#tags} parity): four sends exercise tag expansion, note-title +
		   active-note resolution, an honestly-noticed miss, and the {} drop
		   (sim has no editor selection); then the editor bridge proves {}
		   inline substitution vs the legacy lead+quote staging */
		window.__oaActiveNotePath = "Tokens/Apple.md";
		const sendS = async (text: string) => {
			typeIntoComposer(text);
			await delay(40);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			for (let i = 0; i < 70; i++) {
				await delay(150);
				if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
			}
			await delay(80);
		};
		/* phase A — attachNote ON (sim default, includeActiveNote:true): the
		   composer's active-note chip already carries Apple, so {activeNote}
		   must NOT attach it a second time (and must NOT Notice a miss) */
		await sendS("{activeNote} saja");
		/* detach → phase B: resolution attaches through the token pipeline */
		document.querySelector<HTMLButtonElement>("[aria-label='Detach note']")?.click();
		await delay(60);
		await sendS("Jelaskan {#fruit} secara singkat ya");
		await sendS("{[[Car]]} vs {activeNote} — bedanya apa?");
		await sendS("Coba {[[Hantu]]} dong");
		await sendS("Apa arti {} ini?");
		const reqs = window.__oaRequests ?? [];
		const lastUser = (r: { role: string; content: string }[]) => [...r].reverse().find((m) => m.role === "user")?.content ?? "";
		/* title-gen aux calls ride the same mock and QUOTE the first user
		   bubble — never match them: attach-shape sends start with the
		   attached-file block; bare sends match the exact cleaned text */
		const mainWithAttach = (needle: string) => {
			const hit = reqs.find((r) => {
				const u = lastUser(r);
				return u.startsWith("[Attached file:") && u.includes(needle);
			});
			return hit ? lastUser(hit) : "";
		};
		const mainExact = (exact: string) => reqs.some((r) => lastUser(r) === exact);
		const bubbles = [...document.querySelectorAll(".oa-msg-user")].map((b) => b.textContent ?? "");
		/* stray-chip honesty: after four sends the composer must be PRISTINE —
		   token resolution rides the wire (attachList), never pendingFiles.
		   Scoped to .oa-prompt-input: sent bubbles render their own
		   attachment chips (sentAttachments, intended); an unscoped query
		   once mistook those for composer state (2026-08-05) */
		const composerChips = () =>
			[...document.querySelectorAll(".oa-prompt-input .oa-attach-chip")].map((c) => (c.textContent ?? "").trim());
		const chipsAfterSends = composerChips();
		/* editor-menu custom action via the sink: {} names the slot → inline,
		   no quote; no {} → legacy lead+blockquote staging (unchanged) */
		const sink = window.__oaChatApiSink;
		const bridgeScope = workspacePolicyFor(simSettings).scopeKey;
		sink?.current?.runSnippetOnSelection("Ringkas:\n{}", { path: "Tokens/Apple.md", basename: "Apple", fromLine: 3, toLine: 3, text: "ISI-SELEKSI", workspaceScope: bridgeScope });
		await delay(60);
		const braceInline = document.querySelector<HTMLElement>(".oa-prompt-textarea")?.textContent ?? "";
		sink?.current?.runSnippetOnSelection("Kuliti pelan", { path: "Tokens/Apple.md", basename: "Apple", fromLine: 4, toLine: 4, text: "ISI-KEDUA", workspaceScope: bridgeScope });
		await delay(60);
		const braceQuote = document.querySelector<HTMLElement>(".oa-prompt-textarea")?.textContent ?? "";
		const chipsAfterBridge = composerChips();

		/* Workspace provenance: mismatched scope is rejected in every mode;
		   Strict additionally rejects legacy/malformed payloads with no scope. */
		const bridgeStateBeforeReject = {
			text: document.querySelector<HTMLElement>(".oa-prompt-textarea")?.textContent ?? "",
			chips: composerChips(),
		};
		sink?.current?.attachSelection({ path: "Tokens/Apple.md", basename: "Apple", fromLine: 5, toLine: 5, text: "STALE-SCOPE", workspaceScope: "stale-scope" });
		await delay(30);
		const mismatchRejected =
			(document.querySelector<HTMLElement>(".oa-prompt-textarea")?.textContent ?? "") === bridgeStateBeforeReject.text &&
			JSON.stringify(composerChips()) === JSON.stringify(bridgeStateBeforeReject.chips);
		simSettings.workspaceMode = "strict-folder";
		simSettings.workspaceFolder = "Tokens";
		sink?.current?.attachSelection({ path: "Tokens/Apple.md", basename: "Apple", fromLine: 6, toLine: 6, text: "MISSING-SCOPE" });
		await delay(30);
		const strictMissingScopeRejected =
			(document.querySelector<HTMLElement>(".oa-prompt-textarea")?.textContent ?? "") === bridgeStateBeforeReject.text &&
			JSON.stringify(composerChips()) === JSON.stringify(bridgeStateBeforeReject.chips);
		const editorScopeNotices = (window.__oaNotices ?? []).filter((n) => n.includes("different Workspace scope"));
		simSettings.workspaceMode = "whole-vault";
		simSettings.workspaceFolder = "";
		window.__oaTokenCheck = JSON.stringify({
			skipExact: mainExact("saja"),
			skipStray: reqs.some((r) => lastUser(r).includes("Tokens/Apple.md") && lastUser(r).includes("saja")),
			skipNotice: (window.__oaNotices ?? []).some((n) => n.includes("{activeNote}")),
			tagMsg: mainWithAttach("secara singkat ya"),
			mixMsg: mainWithAttach("bedanya apa?"),
			missExact: mainExact("Coba  dong"),
			missStray: reqs.some((r) => lastUser(r).includes("{[[Hantu]]}")),
			braceExact: mainExact("Apa arti  ini?"),
			bubbles,
			notices: window.__oaNotices ?? [],
			braceInline,
			braceQuote,
			chipsAfterSends,
			chipsAfterBridge,
			mismatchRejected,
			strictMissingScopeRejected,
			editorScopeNoticeCount: editorScopeNotices.length,
		});
		window.__oaReady = true;
	} else if (s === "qask") {
		/* Quick Ask E2E (v0.1.81, Copilot overlay parity): a REAL CM6
		   EditorView hosts the ported overlay stack (controller + ViewPlugin
		   + persistent highlight + mapPos ReplaceGuard); the model is a
		   canned two-token stream. Phases: (A) two sends prove first-turn
		   <selected_text> wrapping + follow-up omission, then Replace
		   applies through the guard and closes; (B) a stray inside-range
		   edit flips the guard to content_changed (button disabled with
		   the honest reason); Esc closes. */
		const holder = document.createElement("div");
		holder.id = "qask-editor";
		holder.style.cssText = "height:110px;overflow:hidden;border-bottom:1px solid #333;padding:2px 6px;font-size:12px;";
		document.getElementById("sim-frame")?.prepend(holder);

		const wire: { role: string; content: string }[][] = [];
		window.__oaQaskWire = wire;
		/* v0.1.85 — suggestion chips sake snippet flag: [] = fallback bawaan di
		   phase A; diisi sebelum shot-candy untuk membuktikan getter LIVE per
		   open (custom menggantikan bawaan, klik men-stage text ke input) */
		let cannedSugs: { label: string; text: string }[] = [];
		/* v0.1.87 — satu turn dipaksa gagal untuk kontrak error inline */
		let failRun = false;
		/* v0.1.92 — satu turn flaky: streaming PARSIAL lalu putus SEKALI;
		   sim sendiri yang membungkusnya dengan attemptWithResilience (modul
		   yang sama dengan main) supaya alur panel→onRetry→reset-stream
		   teruji end-to-end */
		let flakyStream = false;
		/* v0.1.144 R40 — one real Quick Ask turn returns the same hostile
		   Mermaid fixture used by the canonical surface regressions. The
		   final MarkdownDoc must receive the canonical fence, not the raw
		   provider bytes (streaming remains ephemeral). */
		let mermaidRun = false;
		const quickMermaidRaw = "```mermaid\n%% leading payload\n%%{init: {'theme': 'base'}}%%\nflowchart LR\n  A[Plan (Thought)] --> B; %% payload 50% 🚀\n```";
		/* v0.1.89 — state model-menu LIVE: pick/refresh/toggle menulis di
		   sini, getter dibaca ulang panel (footer caption + pill mengikuti);
		   "sim-fast" sengaja berpasangan dengan "sim-model" (satu family row,
		   seperti logika -fast komponen) */
		let simMenu: QuickAskMenuState = {
			providerSlug: "sim",
			providerName: "SimProvider",
			model: "sim-model",
			providers: [
				{ slug: "sim", name: "SimProvider", models: ["sim-model", "sim-fast"] },
				{ slug: "alt", name: "AltGrid", models: ["beta-1", "beta-2"] },
			],
			visibleModels: null,
			collapsedSlugs: [],
		};
		const menuCalls: { picks: [string, string][]; refreshes: number; settings: number } = {
			picks: [],
			refreshes: 0,
			settings: 0,
		};
		const qa = new QuickAskController({
			snapshotWorkspacePolicy: () => workspacePolicyFor(simSettings, ".obsidian"),
			runTurn: async (
				messages: ChatMessage[],
				onToken: (t: string) => void,
				signal: AbortSignal,
				onRetry?: () => void
			) => {
				wire.push(messages.map((m) => ({ role: m.role, content: m.content })));
				if (failRun) {
					failRun = false;
					throw new Error("koneksi sim putus");
				}
				if (flakyStream) {
					flakyStream = false;
					let failedOnce = false;
					return attemptWithResilience(
						[
							async () => {
								if (!failedOnce) {
									failedOnce = true;
									onToken("PARSIAL");
									await delay(80);
									throw new Error("sim mid-stream putus");
								}
								onToken("HASIL");
								await delay(120);
								onToken("-QUICK");
								await delay(80);
								return "HASIL-QUICK";
							},
						],
						{ signal, onRetry }
					);
				}
				if (mermaidRun) {
					mermaidRun = false;
					const cut = Math.floor(quickMermaidRaw.length / 2);
					onToken(quickMermaidRaw.slice(0, cut));
					await delay(80);
					onToken(quickMermaidRaw.slice(cut));
					await delay(80);
					return quickMermaidRaw;
				}
				onToken("HASIL");
				await delay(120);
				onToken("-QUICK");
				await delay(80);
				return "HASIL-QUICK";
			},
			app: appMock as unknown as App,
			pluginDir: ".obsidian/plugins/openagent",
			component: new ShimComponent(),
			getModelMenu: () => simMenu,
			onSelectModel: (provider, model) => {
				menuCalls.picks.push([provider, model]);
				simMenu = {
					...simMenu,
					providerSlug: provider,
					model,
					providerName: simMenu.providers.find((x) => x.slug === provider)?.name ?? provider,
				};
			},
			onRefreshModels: () => {
				menuCalls.refreshes++;
			},
			onSetVisibleModels: (next) => {
				simMenu = { ...simMenu, visibleModels: next };
			},
			onToggleCollapsed: (slug) => {
				simMenu = {
					...simMenu,
					collapsedSlugs: simMenu.collapsedSlugs.includes(slug)
						? simMenu.collapsedSlugs.filter((x) => x !== slug)
						: [...simMenu.collapsedSlugs, slug],
				};
			},
			onOpenSettings: () => {
				menuCalls.settings++;
			},
			getSuggestions: () => cannedSugs,
		});

		const docText = "baris satu\nbaris dua TARGET-SELEKSI di sini\nbaris tiga\n";
		const selFrom = docText.indexOf("TARGET-SELEKSI");
		const selTo = selFrom + "TARGET-SELEKSI".length;
		const cmView = new CMEditorView({
			state: EditorState.create({
				doc: docText,
				selection: { anchor: selFrom, head: selTo },
				extensions: [qa.createExtension()],
			}),
			parent: holder,
		});
		/* structural fake of the Obsidian side: MUST be a real instance of
		   the shim's MarkdownView — the guard's getLeafState checks
		   `leaf.view instanceof MarkdownView` (a plain object leafs out as
		   leaf_changed and Replace silently refuses) */
		const mv = new ShimMarkdownView() as unknown as Record<string, unknown>;
		mv.leaf = { view: mv };
		mv.editor = { cm: cmView };
		mv.file = { path: "Qask/Note.md" };

		const qaSend = async (text: string, expectBubbles: number) => {
			/* wait out the previous turn's `busy` — React flushes the
			   re-enable asynchronously; firing Enter on the stale closure
			   swallows the send (2026-08-05: followUpCount never reached 2) */
			const ta = () => document.querySelector<HTMLTextAreaElement>(".oa-quickask-input");
			for (let i = 0; i < 60; i++) {
				await delay(100);
				const el = ta();
				if (el && !el.disabled) break;
			}
			const el = ta();
			if (!el || el.disabled) throw new Error("qask: panel input never (re-)enabled");
			Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, text);
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
			for (let i = 0; i < 80; i++) {
				await delay(100);
				/* v0.1.82: bubbles are prompt-kit <Message> (oa-msg-<role>);
				   final answers render through Markdown inside them */
				const bubbles = [...document.querySelectorAll(".oa-quickask .oa-msg-assistant")].filter((d) =>
					(d.textContent ?? "").includes("HASIL-QUICK")
				);
				if (bubbles.length >= expectBubbles) return;
			}
			throw new Error("qask: canned answer never landed");
		};
		const panelGone = async () => {
			for (let i = 0; i < 40; i++) {
				await delay(100);
				if (!document.querySelector(".oa-quickask")) return true;
			}
			return false;
		};

		/* phase A — open, highlight, two sends, Replace */
		qa.show(mv as never, cmView);
		await delay(250);
		const panelShown = !!document.querySelector(".oa-quickask");
		const highlightShown = !!holder.querySelector(".oa-quickask-highlight");
		/* fallback bawaan saat belum ada snippet flagged (chip "Summarize this") */
		const fallbackChips = [...document.querySelectorAll(".oa-quickask .oa-quickask-sug")].some(
			(d) => (d.textContent ?? "") === "Summarize this"
		);
		await qaSend("Ringkas ini dong", 1);
		await qaSend("lagi dong", 2);
		/* v0.1.82: Replace is a raw icon button inside MessageActions —
		   aria-label is stable (never flips to check like Copy) */
		const replaceBtn = () =>
			document.querySelector<HTMLButtonElement>('.oa-quickask button[aria-label="Replace selection"]');
		/* wait for the turn to fully settle (busy off → guard buttons live) */
		for (let i = 0; i < 40; i++) {
			await delay(100);
			const b = replaceBtn();
			if (b && !b.disabled) break;
		}
		replaceBtn()?.click();
		await delay(150);
		const docAfterReplace = cmView.state.doc.toString();
		const closedAfterReplace = await panelGone();
		const highlightCleared = !holder.querySelector(".oa-quickask-highlight");

		/* phase-A wire fields are captured BEFORE phase B — phase B adds a
		   third turn (fresh conversation), so wire.length is snapshotted */
		const wireAtA = wire.length;

		/* phase B — reopen on a fresh selection + ONE send (Replace lives on
		   assistant bubbles only — an answer-less panel has no button to
		   disable), THEN a stray inside-range edit must flip the guard:
		   button disabled + Copilot's honest reason */
		const docNow = cmView.state.doc.toString();
		const idx = docNow.indexOf("baris tiga");
		cmView.dispatch({ selection: { anchor: idx, head: idx + "baris tiga".length } });
		qa.show(mv as never, cmView);
		await delay(250);
		await qaSend("ubah jadi huruf besar", 1);
		for (let i = 0; i < 40; i++) {
			await delay(100);
			const b = replaceBtn();
			if (b && !b.disabled) break;
		}
		const preStrayEnabled = replaceBtn()?.disabled === false;
		cmView.dispatch({ changes: { from: idx + 2, insert: "X" } });
		let strayDisabled = false;
		let strayTitle = "";
		for (let i = 0; i < 30; i++) {
			await delay(100);
			const b = replaceBtn();
			if (b && b.disabled) {
				strayDisabled = true;
				strayTitle = b.getAttribute("title") ?? "";
				break;
			}
		}

		/* Esc closes (restoreFocus tolerated — a stray Notice would NOT be
		   silent; the panel simply leaves) */
		document
			.querySelector<HTMLTextAreaElement>(".oa-quickask-input")
			?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
		const escClosed = await panelGone();

		/* shot-candy: reopen with a fresh selection so the frame ends with
		   the panel VISIBLE (the shot fires after the check JSON is set) */
		const doc3 = cmView.state.doc.toString();
		const i3 = doc3.indexOf("baris dua");
		cmView.dispatch({ selection: { anchor: i3, head: i3 + "baris dua".length } });
		/* v0.1.85 — sekarang snippet flagged: getter dibaca LIVE saat open,
		   chip bawaan tergantikan judul snippet; klik chip men-stage text */
		cannedSugs = [
			{ label: "Gaya formal", text: "Ubah ini jadi gaya formal" },
			{ label: "3 poin", text: "Ringkas jadi 3 poin" },
		];
		qa.show(mv as never, cmView);
		await delay(350);
		const shotPanelVisible = !!document.querySelector(".oa-quickask-panel");
		const chipTitles = [...document.querySelectorAll(".oa-quickask .oa-quickask-sug")].map(
			(d) => d.textContent ?? ""
		);
		const customChips =
			chipTitles.length === 2 &&
			chipTitles.includes("Gaya formal") &&
			chipTitles.includes("3 poin") &&
			!chipTitles.includes("Summarize this");
		(document.querySelector(".oa-quickask .oa-quickask-sug") as HTMLButtonElement | null)?.click();
		await delay(150);
		const chipStagesText =
			(document.querySelector<HTMLTextAreaElement>(".oa-quickask-input")?.value ?? "") ===
			"Ubah ini jadi gaya formal";

		/* v0.1.86 (owner: "buat jadi baris scroll aja") — dengan BANYAK snippet
		   flagged, baris chip harus overflow horizontal (scroll), bukan wrap
		   membesarkan panel; semua chip tetap ada di DOM (scroll mengungkap) */
		(document.querySelector(".oa-quickask-close") as HTMLButtonElement | null)?.click();
		await panelGone();
		cannedSugs = [
			{ label: "Ringkas harian", text: "Ringkas ini untuk laporan harian" },
			{ label: "Gaya formal", text: "Ubah ini jadi gaya formal" },
			{ label: "3 poin", text: "Ringkas jadi 3 poin" },
			{ label: "Terjemah EN", text: "Terjemahkan ke bahasa Inggris" },
			{ label: "Perbaiki grammar", text: "Perbaiki tata bahasa tanpa ubah makna" },
			{ label: "Parafrase", text: "Parafrasekan dengan kata lain" },
			{ label: "Cek fakta", text: "Periksa klaim faktual di teks ini" },
			{ label: "Buat judul", text: "Usulkan 5 judul alternatif" },
		];
		qa.show(mv as never, cmView);
		await delay(350);
		const sugRow = document.querySelector<HTMLElement>(".oa-quickask-sugs");
		const sugRowStyle = sugRow ? getComputedStyle(sugRow) : null;
		const chipsScrollRow =
			sugRowStyle !== null &&
			sugRowStyle.flexWrap === "nowrap" &&
			sugRowStyle.overflowX === "auto";
		const chipsOverflow = !!sugRow && sugRow.scrollWidth > sugRow.clientWidth + 2;
		const chipsAllPresent =
			document.querySelectorAll(".oa-quickask .oa-quickask-sug").length === 8;
		/* overscroll di sugs ROW (harus diukur saat empty-state masih ada) */
		const sugsRow = document.querySelector<HTMLElement>(".oa-quickask-sugs");
		const sugsContainedX = !!sugsRow && getComputedStyle(sugsRow).overscrollBehaviorX === "contain";

		/* v0.1.87 — kontrak error: paksa satu turn gagal → baris error inline +
		   pertanyaan kembali ke input + bubble optimis tergulung; retry jalan */
		failRun = true;
		{
			const ta = document.querySelector<HTMLTextAreaElement>(".oa-quickask-input");
			Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta, "coba kirim");
			ta!.dispatchEvent(new Event("input", { bubbles: true }));
			ta!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		}
		let errShown = false;
		for (let i = 0; i < 60; i++) {
			await delay(100);
			const e = document.querySelector(".oa-quickask-error");
			if (e && (e.textContent ?? "").includes("koneksi sim putus")) {
				errShown = true;
				break;
			}
		}
		const errInputBack =
			(document.querySelector<HTMLTextAreaElement>(".oa-quickask-input")?.value ?? "") === "coba kirim";
		const errBubbleRolledBack = document.querySelectorAll(".oa-quickask .oa-msg-user").length === 0;
		/* retry: teks masih di input → kirim ulang; menunggu bubble sukses juga
		   membuktikan busy sudah lepas */
		await qaSend("coba kirim", 1);
		/* race busy-flush: qaSend menunggu bubble, TAPI re-enable (yang menukar
		   tombol Stop-14 kembali Send-16) mendarat async — tunggu disabled
		   lepas sebelum fase berikut mengukur geometri send */
		for (let i = 0; i < 60; i++) {
			await delay(100);
			const ta = document.querySelector<HTMLTextAreaElement>(".oa-quickask-input");
			if (ta && !ta.disabled) break;
		}
		const retryAssistant =
			[...document.querySelectorAll(".oa-quickask .oa-msg-assistant")].some((d) =>
				(d.textContent ?? "").includes("HASIL-QUICK"));
		const errClearedAfterRetry = !document.querySelector(".oa-quickask-error");
		const inputAriaLabel =
			!!document.querySelector(".oa-quickask-input")?.getAttribute("aria-label");
		const chatScroll = document.querySelector<HTMLElement>(".oa-quickask-body .oa-chat-scroll");
		const chatScrollContained = !!chatScroll && getComputedStyle(chatScroll).overscrollBehavior === "contain";

		/* v0.1.84 — geometry guard ikon (owner: "close button tidak square,
		   iconnya tidak ditengah, send button icon juga tidak ditengah"). Ukur
		   box NYATA di panel shot-candy: close square 28×28 (v0.1.100 parity
		   oa-icon-btn — owner: "samakan dengan oa-icon-btn"); span <Icon>
		   harus memiliki ukurannya sendiri dan glyph setIcon mengisi span (X=13,
		   ArrowUp=16 — bukan glyph 24×24 asli lucide); drift tengah ≤1px. */
		const qaDrift = (btn: Element | null | undefined, glyph: Element | null | undefined): number => {
			if (!btn || !glyph) return 999;
			const b = btn.getBoundingClientRect();
			const g = glyph.getBoundingClientRect();
			return (
				Math.abs(b.top + b.height / 2 - (g.top + g.height / 2)) +
				Math.abs(b.left + b.width / 2 - (g.left + g.width / 2))
			);
		};
		const qaCloseBtn = document.querySelector<HTMLButtonElement>(".oa-quickask-close");
		const qaCloseGlyph = qaCloseBtn?.querySelector(".oa-icon");
		const qaSendBtn = document.querySelector<HTMLButtonElement>(".oa-quickask .oa-prompt-action");
		const qaSendGlyph = qaSendBtn?.querySelector(".oa-icon");
		const iconGeometry = {
			closeW: qaCloseBtn?.offsetWidth ?? 0,
			closeH: qaCloseBtn?.offsetHeight ?? 0,
			closeSvgW: Math.round(qaCloseGlyph?.querySelector("svg")?.getBoundingClientRect().width ?? 0),
			sendSvgW: Math.round(qaSendGlyph?.querySelector("svg")?.getBoundingClientRect().width ?? 0),
			closeDrift: Math.round(qaDrift(qaCloseBtn, qaCloseGlyph) * 10) / 10,
			sendDrift: Math.round(qaDrift(qaSendBtn, qaSendGlyph) * 10) / 10,
			/* v0.1.122 anti-kapsul (quick ask parity) */
			sendSquare: !!qaSendBtn && qaSendBtn.offsetWidth === qaSendBtn.offsetHeight,
			sendAspect: qaSendBtn ? getComputedStyle(qaSendBtn).aspectRatio : "",
			closeAspect: qaCloseBtn ? getComputedStyle(qaCloseBtn).aspectRatio : "",
		};

		/* v0.1.88 (owner: "drag/resize panel") — head = drag handle, grip
		   pojok kanan-bawah = resize; keduanya Pointer Events sintetis di
		   sini (move/up sengaja di WINDOW, sesuai listener overlay). Diukur
		   NYATA: delta drag tepat, panel detach dari anchor saat editor
		   scroll, clamp viewport saat drag melewati tepi; resize grow tepat,
		   clamp min 300×200; mode sized: chat-scroll jadi flex filler; grip
		   punya aria + keyboard; drag dari tombol × TIDAK menggerakkan */
		const qaBox = () => {
			const b = document.querySelector(".oa-quickask")!.getBoundingClientRect();
			return { left: Math.round(b.left), top: Math.round(b.top), width: Math.round(b.width), height: Math.round(b.height) };
		};
		const firePtr = (target: Element | Window, type: string, x: number, y: number) => {
			target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
		};
		const dragBy = async (el: Element, dx: number, dy: number) => {
			const r = el.getBoundingClientRect();
			const sx = r.left + r.width / 2;
			const sy = r.top + r.height / 2;
			firePtr(el, "pointerdown", sx, sy);
			firePtr(window, "pointermove", sx + dx / 2, sy + dy / 2);
			firePtr(window, "pointermove", sx + dx, sy + dy);
			firePtr(window, "pointerup", sx + dx, sy + dy);
			await delay(120); // rAF place() mendarat
		};
		const headEl = document.querySelector<HTMLElement>(".oa-quickask-head");
		const headCursor = !!headEl && getComputedStyle(headEl).cursor === "grab";
		/* v0.1.100 — grip glyph DIHAPUS (owner pick grip-none, parity
		   Copilot/Obsidian modal): TIDAK boleh ada affordance tersemat apa
		   pun di head; barisnya sendiri drag-nya. Dan grip-TOMBOL v0.1.88
		   (wujud yang ditolak owner) tak pernah balik — resize kembali
		   sebagai SEAM tak terlihat */
		const gripGlyphGone = !document.querySelector(".oa-quickask-move") && !document.querySelector(".oa-quickask-grip");

		/* v0.1.91 — drag-only (umpan balik owner: tombol resize tidak lazim
		   → dihapus; grip = MOVE seperti Copilot). Panel tak bisa dikecilkan
		   lagi, jadi di sim sempit (470px; lebar panel mentok cap viewport)
		   ruang bebas hanya VERTIKAL — delta tepat diukur ke bawah, horizontal
		   diuji lewat batas clamp yang independen */
		/* 1 — drag vertikal +50 di ruang bebas: delta tepat, horizontal diam */
		const dragBefore = qaBox();
		await dragBy(headEl!, 0, 50);
		const dragAfter = qaBox();
		const dragMoved =
			Math.abs(dragAfter.top - (dragBefore.top + 50)) <= 2 &&
			Math.abs(dragAfter.left - dragBefore.left) <= 2;

		/* 2 — detached: scroll editor TIDAK menarik panel balik ke caret */
		cmView.scrollDOM.dispatchEvent(new Event("scroll"));
		await delay(60);
		const scrollAfter = qaBox();
		const detachedOnScroll =
			scrollAfter.left === dragAfter.left && scrollAfter.top === dragAfter.top;

		/* 3 — clamp viewport: drag jauh ke kanan → tepi kanan berhenti persis
		   di batas (innerWidth - PANEL_MARGIN 8) */
		await dragBy(headEl!, 5000, 0);
		const clampRight = qaBox();
		const dragClamped =
			Math.abs(clampRight.left + clampRight.width - (window.innerWidth - 8)) <= 2;

		/* 4 — pulang ke pojok kiri-atas lewat clamp berlawanan */
		await dragBy(headEl!, -5000, -5000);
		const homeBox = qaBox();

		/* 5 — drag dari tombol ×: panel TIDAK bergerak dan TIDAK tertutup
		   (filter target di head membiarkan tombol apa adanya) */
		const closeBtn2 = document.querySelector<HTMLElement>(".oa-quickask-close");
		await dragBy(closeBtn2!, 120, 40);
		const afterCloseDrag = qaBox();
		const dragFromCloseNoop =
			afterCloseDrag.left === homeBox.left &&
			afterCloseDrag.top === homeBox.top &&
			!!document.querySelector(".oa-quickask-head");

		/* v0.1.100 — resize seam (owner: "mau tetap ada tapi bukan tombol ;
		   coba cari referensi dulu" → macOS way yang DIPERBAIKI: zona hit
		   16px UTUH DI DALAM frame [pelajaran Tahoe — zona di luar frame
		   dibenci], kursor ↘ penanda satu-satunya, tak menggambar apa pun
		   saat diam [bukan tombol]; keyboard & SR lewat button semantik) */
		const seamEl = document.querySelector<HTMLButtonElement>(".oa-quickask-seam");
		const seamRect = seamEl ? seamEl.getBoundingClientRect() : null;
		const panelRectSeam = document.querySelector(".oa-quickask")!.getBoundingClientRect();
		const seamCorner =
			!!seamEl && !!seamRect && seamRect.width >= 14 && seamRect.height >= 14 &&
			Math.abs(panelRectSeam.right - seamRect.right) <= 2 &&
			Math.abs(panelRectSeam.bottom - seamRect.bottom) <= 2;
		const seamStyle = seamEl ? getComputedStyle(seamEl) : null;
		const seamCursor = seamStyle?.cursor === "nwse-resize";
		const seamDbg = {
			children: seamEl ? seamEl.children.length : -1,
			bg: seamStyle?.backgroundColor,
			bw: seamStyle?.borderTopWidth,
			bs: seamStyle?.borderTopStyle,
			outlineW: seamStyle?.outlineWidth,
			opacity: seamStyle?.opacity,
		};
		const seamInvisible =
			!!seamEl && seamEl.children.length === 0 &&
			seamStyle?.backgroundColor === "rgba(0, 0, 0, 0)" &&
			seamStyle?.borderTopWidth === "0px";
		const seamAria = seamEl?.getAttribute("aria-label") === "Resize panel";
		/* desain langkah: panah plain = 12, Shift = 48 (handler seam); lantai
		   300×200 WAJIB menelan panah yang menembus (floor stick terukur).
		   Urutan aman dari cap atas sim (lebar ≤454): drag dulu +40 × +60,
		   clamp min, lalu keyboard dari lantai */
		seamEl?.focus();
		const stepKey = async (key: string, shift = false) => {
			seamEl?.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey: shift, bubbles: true, cancelable: true }));
			await delay(140);
		};
		const r0 = qaBox();
		await dragBy(seamEl!, 40, 60);
		const r1 = qaBox();
		const seamDrag =
			Math.abs(r1.width - (r0.width + 40)) <= 1 &&
			Math.abs(r1.height - (r0.height + 60)) <= 1;
		await dragBy(seamEl!, -9999, -9999);
		const rMin = qaBox();
		const seamClamped = rMin.width === 300 && rMin.height === 200;
		await stepKey("ArrowLeft");
		const g1 = qaBox();
		await stepKey("ArrowRight", true);
		const g2 = qaBox();
		await stepKey("ArrowDown");
		const g3 = qaBox();
		await stepKey("ArrowUp", true);
		const g4 = qaBox();
		const seamKeys =
			g1.width === 300 && g1.height === 200 &&          /* lantai menelan ← */
			Math.abs(g2.width - 348) <= 1 &&                  /* →Shift = +48 tepat */
			Math.abs(g3.height - 212) <= 1 &&                 /* ↓ = +12 tepat */
			g4.height === 200;                                /* ↑Shift ketelan lantai */
		const seamSizedClass = !!document.querySelector(".oa-quickask.oa-quickask-sized");
		const seamChatScroll = document.querySelector(".oa-quickask .oa-chat-scroll");
		const seamSizedFlex = !!seamChatScroll && getComputedStyle(seamChatScroll).maxHeight === "none";

		/* v0.1.89 (owner: "model picker sama seperti main chat ui" + caption
		   model pindah bawah composer) — komponen ModelPicker ASLI di sim:
		   footer caption live, pill membuka menu (group + footer items +
		   mirror CSS terbukti computed), pick lintas provider menutup menu +
		   caption/pill berpindah, Refresh tetap membuka menu, Edit Models…
		   membuka dialog overlay fixed (tak ter-clip panel), toggle row
		   menulis visibleModels, backdrop menutup */
		const footText = () => document.querySelector(".oa-quickask-foot")?.textContent ?? "";
		const footShown = footText() === "SimProvider · sim-model";
		const headLabelGone = !document.querySelector(".oa-quickask-model");
		const pillBtn = () => document.querySelector<HTMLButtonElement>(".oa-quickask .oa-model-pill");
		/* label pill = displayModelName KOMPONEN (pretty "Sim Model" dsb) —
		   lane tidak menebak bentuk cantiknya, memakai fungsi yang sama */
		const pickerMounted = (pillBtn()?.textContent ?? "").includes(displayModelName("sim-model"));

		pillBtn()?.click();
		await delay(150);
		const menuEl = document.querySelector<HTMLElement>(".oa-quickask .oa-model-menu");
		const menuStyle = menuEl ? getComputedStyle(menuEl) : null;
		const menuOpens =
			!!menuEl &&
			[...document.querySelectorAll(".oa-quickask .oa-model-menu-hdr-name")].some(
				(d) => (d.textContent ?? "") === "AltGrid"
			) &&
			!!document.querySelector('.oa-quickask button[aria-label="Refresh Models"]') &&
			!!document.querySelector('.oa-quickask button[aria-label="Edit Models"]');
		const menuStyled = menuStyle !== null && menuStyle.position === "absolute" && menuStyle.width === "300px";

		/* row dipilih via title = RAW family.id (label menampilkan nama cantik;
		   title selalu id mentah) */
		document.querySelector<HTMLButtonElement>('.oa-quickask .oa-model-menu-item[title="beta-2"]')?.click();
		await delay(200);
		const pickSwitches =
			!document.querySelector(".oa-quickask .oa-model-menu") &&
			footText() === "AltGrid · beta-2" &&
			(pillBtn()?.textContent ?? "").includes(displayModelName("beta-2")) &&
			menuCalls.picks.length === 1 &&
			menuCalls.picks[0][0] === "alt" &&
			menuCalls.picks[0][1] === "beta-2";

		pillBtn()?.click();
		await delay(150);
		(document.querySelector('.oa-quickask button[aria-label="Refresh Models"]') as HTMLButtonElement | null)?.click();
		await delay(200);
		const refreshKeepsOpen =
			menuCalls.refreshes === 1 && !!document.querySelector(".oa-quickask .oa-model-menu");

		(document.querySelector('.oa-quickask button[aria-label="Edit Models"]') as HTMLButtonElement | null)?.click();
		await delay(200);
		const visDialog = document.querySelector<HTMLElement>(".oa-modal-overlay");
		const visDialogOpens =
			!!visDialog &&
			getComputedStyle(visDialog).position === "fixed" &&
			(visDialog.textContent ?? "").includes("Models");
		const visRow = document.querySelector<HTMLElement>('.oa-vis-row[title="beta-1"]');
		visRow?.click();
		await delay(150);
		const visToggleWrites = Array.isArray(simMenu.visibleModels) && simMenu.visibleModels.length > 0;
		(visDialog as HTMLElement | null)?.click(); /* klik backdrop = tutup */
		await delay(150);
		const visClosed = !document.querySelector(".oa-modal-overlay");

		/* v0.1.90 (owner: "{activeNote}") — token diresolve ke note tempat
		   panel dibuka; konten dibaca LIVE dari doc editor (suntingan "X"
		   fase stray-edit yang BELUM disimpan harus ikut terlampir — bukti
		   bukan baca disk); bubble tampil teks mentah, wire distrip; mixed
		   case {ActiveNote} membuktikan flag gi */
		await qaSend("apa isi note ini? {ActiveNote}", 2);
		const anWire = wire[wire.length - 1]?.[wire[wire.length - 1].length - 1]?.content ?? "";
		const activenoteAttached =
			anWire.includes("[Attached file: Qask/Note.md]") &&
			anWire.startsWith("apa isi note ini?");
		const activenoteLive = anWire.includes("baXris tiga");
		const activenoteStripped = !anWire.toLowerCase().includes("{activenote}");
		const activenoteBubbleRaw = [...document.querySelectorAll(".oa-quickask .oa-msg-user")].some((d) =>
			(d.textContent ?? "").includes("{ActiveNote}")
		);

		/* v0.1.92 (sisa terakhir paket: retry/failover) — (a) retry kelas
		   jaringan: maxAttempts 2 (gagal 1× lalu sukses, onRetry 1×); (b)
		   401: tanpa retry, langsung failover target kedua (onRetry hop 1×);
		   (c) abort SEBELUM attempt pertama: target tak dipanggil sama
		   sekali; (d) end-to-end panel: streaming PARSIAL → putus → retry
		   → stream ter-RESET (tak pernah "PARSIALHASIL"), final bersih */
		setBackoffScale(0);
		let retryCalls = 0;
		let retryReset = 0;
		const retryResult = await attemptWithResilience(
			[
				async () => {
					retryCalls++;
					if (retryCalls === 1) throw new Error("sim network blip");
					return "OK";
				},
			],
			{ onRetry: () => retryReset++ }
		);
		const resilienceRetries = retryResult === "OK" && retryCalls === 2 && retryReset === 1;

		let aCalls = 0;
		let bCalls = 0;
		let failoverReset = 0;
		const fbResult = await attemptWithResilience(
			[
				async () => {
					aCalls++;
					throw new ProviderHttpError(401, "sim auth");
				},
				async () => {
					bCalls++;
					return "FALLBACK";
				},
			],
			{ onRetry: () => failoverReset++ }
		);
		const resilienceFailover = fbResult === "FALLBACK" && aCalls === 1 && bCalls === 1 && failoverReset === 1;

		const abortCtl = new AbortController();
		abortCtl.abort();
		let abortCalls = 0;
		let abortThrew = false;
		try {
			await attemptWithResilience(
				[
					async () => {
						abortCalls++;
						throw new Error("sim down");
					},
				],
				{ signal: abortCtl.signal }
			);
		} catch {
			abortThrew = true;
		}
		const resilienceAbort = abortThrew && abortCalls === 0;
		setBackoffScale(1);

		/* (d) end-to-end lewat panel: isi input + Enter, pantau div streaming
		   — kebocoran klasik adalah "PARSIALHASIL" (reset tak jalan) */
		flakyStream = true;
		{
			const ta2 = document.querySelector<HTMLTextAreaElement>(".oa-quickask-input");
			Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta2, "uji retry");
			ta2!.dispatchEvent(new Event("input", { bubbles: true }));
			ta2!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		}
		let sawLeak = false;
		for (let i = 0; i < 80; i++) {
			await delay(50);
			const st = document.querySelector(".oa-quickask-msg-text.is-streaming");
			if (st && (st.textContent ?? "").includes("PARSIALHASIL")) sawLeak = true;
			const bubbles = [...document.querySelectorAll(".oa-quickask .oa-msg-assistant")].filter((d) =>
				(d.textContent ?? "").includes("HASIL-QUICK")
			);
			if (bubbles.length >= 3) break;
		}
		const retryBubbles = [...document.querySelectorAll(".oa-quickask .oa-msg-assistant")].filter((d) =>
			(d.textContent ?? "").includes("HASIL-QUICK")
		).length;
		const streamResetOnRetry =
			!sawLeak &&
			retryBubbles >= 3 &&
			![...document.querySelectorAll(".oa-quickask .oa-msg-assistant")].some((d) =>
				(d.textContent ?? "").includes("PARSIAL")
			);

		/* R40 executable surface check: send raw hostile Mermaid through the
		   real QuickAskController + React panel, then inspect the finalized
		   Markdown renderer input. The leading comment/directive and payload
		   survive while the label and exact inline `; %%` become canonical. */
		for (let i = 0; i < 60; i++) {
			await delay(100);
			const ta = document.querySelector<HTMLTextAreaElement>(".oa-quickask-input");
			if (ta && !ta.disabled) break;
		}
		mermaidRun = true;
		{
			const ta = document.querySelector<HTMLTextAreaElement>(".oa-quickask-input");
			Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(ta, "buat diagram");
			ta!.dispatchEvent(new Event("input", { bubbles: true }));
			ta!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
		}
		let quickMermaidCode = "";
		for (let i = 0; i < 80; i++) {
			await delay(100);
			const nodes = [...document.querySelectorAll<HTMLElement>(".oa-quickask .oa-msg-assistant pre code.language-mermaid")];
			quickMermaidCode = nodes[nodes.length - 1]?.textContent ?? "";
			if (quickMermaidCode.includes("payload 50% 🚀")) break;
		}
		const mermaidCanonical =
			quickMermaidCode.includes("%% leading payload") &&
			quickMermaidCode.includes("%%{init: {'theme': 'base'}}%%") &&
			quickMermaidCode.includes("flowchart LR") &&
			quickMermaidCode.includes('A["Plan (Thought)"] --> B;') &&
			quickMermaidCode.includes("%% payload 50% 🚀") &&
			!quickMermaidCode.includes("; %% payload");

		window.__oaQaskCheck = JSON.stringify({
			panelShown,
			highlightShown,
			sysOk: (wire[0]?.[0]?.content ?? "").includes("execute user instructions with precision"),
			selWrap: (wire[0]?.[1]?.content ?? "").includes("<selected_text>\nTARGET-SELEKSI\n</selected_text>"),
			selWrapQuestion: (wire[0]?.[1]?.content ?? "").startsWith("Ringkas ini dong"),
			followUpCount: wireAtA,
			followUpNoSel:
				wireAtA === 2 &&
				!(wire[1]?.[3]?.content ?? "").includes("selected_text") &&
				(wire[1]?.[3]?.content ?? "") === "lagi dong" &&
				(wire[1]?.[2]?.content ?? "") === "HASIL-QUICK",
			replacedDoc: docAfterReplace.includes("baris dua HASIL-QUICK di sini"),
			closedAfterReplace,
			highlightCleared,
			preStrayEnabled,
			strayDisabled,
			strayTitle,
			escClosed,
			shotPanelVisible,
			iconGeometry,
			fallbackChips,
			customChips,
			chipStagesText,
			chipsScrollRow,
			chipsOverflow,
			chipsAllPresent,
			sugsContainedX,
			errShown,
			errInputBack,
			errBubbleRolledBack,
			retryAssistant,
			errClearedAfterRetry,
			inputAriaLabel,
			chatScrollContained,
			headCursor,
			gripGlyphGone,
			seamCorner, seamCursor, seamInvisible, seamAria, seamDbg,
			seamStates: { drag: [r0.width, r0.height, r1.width, r1.height], clamped: [rMin.width, rMin.height], keys: [[g1.width, g1.height], [g2.width, g2.height], [g3.width, g3.height], [g4.width, g4.height]] },
			seamKeys, seamSizedClass, seamSizedFlex, seamDrag, seamClamped,
			dragMoved,
			detachedOnScroll,
			dragClamped,
			dragFromCloseNoop,
			footShown,
			headLabelGone,
			pickerMounted,
			menuOpens,
			menuStyled,
			pickSwitches,
			refreshKeepsOpen,
			visDialogOpens,
			visToggleWrites,
			visClosed,
			activenoteAttached,
			activenoteLive,
			activenoteStripped,
			activenoteBubbleRaw,
			resilienceRetries,
			resilienceFailover,
			resilienceAbort,
			streamResetOnRetry,
			mermaidCanonical,
		});
		window.__oaReady = true;
	} else if (s === "branch") {
		/* /branch E2E (v0.1.23 chat fork, Hermes session.branch): after two
		   settled exchanges the child lands on disk with parent lineage +
		   auto lineage title, the ACTIVE chat switches to it, and a new
		   message in the child never leaks into the parent's saved wire */
		const sendS = async (text: string) => {
			typeIntoComposer(text);
			await delay(40);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			for (let i = 0; i < 70; i++) {
				await delay(150);
				if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
			}
			await delay(160);
		};
		await sendS("induk pesan satu");
		await sendS("induk pesan dua");
		const parentSnapBefore = (window.__oaSavedSessions ?? []).slice(-1)[0];
		const parentId = parentSnapBefore?.id ?? null;
		const parentWireBefore = parentSnapBefore?.wire ?? "";
		typeIntoComposer("/branch");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		await delay(400); // branchConversation: list+save+switch
		const afterBranch = window.__oaSavedSessions ?? [];
		const child = afterBranch.find((x) => x.parent === parentId) ?? null;
		const branchNotice = (document.body.textContent ?? "").includes("Branched into");
		const childGreetingVisible = (document.body.textContent ?? "").includes("induk pesan satu");
		await sendS("anak pesan baru");
		const parentAfter = (window.__oaSavedSessions ?? []).filter((x) => x.id === parentId).slice(-1)[0] ?? null;
		window.__oaBranchCheck = JSON.stringify({
			parentId,
			childId: child?.id ?? null,
			childTitle: child?.title ?? null,
			childTurns: child ? (savedSessions.find((x) => x.id === child.id)?.turnCount ?? null) : null,
			branchNotice,
			childGreetingVisible,
			parentWireStable: parentAfter ? parentAfter.wire === parentWireBefore && !parentAfter.wire.includes("anak pesan baru") : false,
			childWireGrows: child ? ((window.__oaSavedSessions ?? []).filter((x) => x.id === child.id).slice(-1)[0]?.wire ?? "").includes("anak pesan baru") : false,
		});
	} else if (s === "chips") {
		/* slash chips E2E (v0.1.24 full composer rework): typed no-arg command
		   chips at token 0, skill reference chips mid-message, path /usr/local
		   stays text, chip deletes ATOMICALLY with one backspace, paste
		   hydrates inertly (trailing token chips), typed /skill-name runs as
		   the Hermes skill dispatch, and the SENT bubble renders pills */
		const readComposer = () => {
			const el = document.querySelector<HTMLElement>(".oa-prompt-textarea");
			return { text: el?.textContent ?? "", chips: [...(el?.querySelectorAll(".oa-chip") ?? [])].map((c) => `${c.getAttribute("data-kind")}:${c.textContent}`) };
		};
		// 1) typed path: no-arg command chips once the committing space lands
		typeIntoComposer("/retry");
		await delay(90);
		const halfTyped = readComposer(); // no chip yet — uncommitted tail stays editable
		typeIntoComposer("/retry ");
		await delay(90);
		const committedCmd = readComposer();
		// 2) prose + skill reference mid-message + a path that must stay text
		typeIntoComposer("/retry tolong pakai /alpha ya, bukan /usr/local");
		await delay(90);
		const mixed = readComposer();
		// 3) atomic delete: caret right after the skill chip, one backspace
		const el = document.querySelector<HTMLElement>(".oa-prompt-textarea")!;
		const skillChip = [...el.querySelectorAll<HTMLElement>(".oa-chip")].find((c) => c.textContent === "/alpha");
		if (skillChip) {
			const sel = window.getSelection()!;
			const range = document.createRange();
			range.setStartAfter(skillChip);
			range.collapse(true);
			sel.removeAllRanges();
			sel.addRange(range);
			document.execCommand("delete", false);
			await delay(90);
		}
		const afterDelete = readComposer();
		// 4) paste hydration: inert text — even the TRAILING skill token chips
		const dt = new DataTransfer();
		dt.setData("text/plain", "sekarang jalankan /alpha");
		el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
		await delay(120);
		const afterPaste = readComposer();
		// 5) Hermes skill dispatch: typed /skill-name runs with the skill riding
		typeIntoComposer("/beta-skill halo dari chips");
		await delay(40);
		const beforeSend = readComposer();
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		for (let i = 0; i < 70; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		await delay(160);
		const reqs = window.__oaRequests ?? [];
		const lastUser = (r: { role: string; content: string }[]) => [...r].reverse().find((m) => m.role === "user")?.content ?? "";
		const mainReqs = reqs.filter((r) => lastUser(r).includes("halo dari chips"));
		const bubblePill = !!document.querySelector(".oa-user-text .oa-chip, [class*=oa-user] .oa-chip");
		window.__oaChipsCheck = JSON.stringify({
			halfTyped,
			committedCmd,
			mixed,
			afterDelete,
			afterPaste,
			beforeSend,
			bubblePill,
			skillRode: mainReqs.length >= 1 ? lastUser(mainReqs[0]).startsWith("[Skill: beta-skill]") && lastUser(mainReqs[0]).includes("halo dari chips") : false,
		});
	} else if (s === "composer") {
		/* v0.1.180 (Hermes composer parity): ↑/↓ input-history browse — the
		   ring is derived from the live turns; ArrowDown restores the typed
		   draft; a non-empty draft is never hijacked. */
		const compEl = () => document.querySelector<HTMLElement>(".oa-prompt-textarea");
		const compText = () => (compEl()?.textContent ?? "").replace(/\n+$/, "");
		const send = async (text: string) => {
			typeIntoComposer(text);
			await delay(40);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			for (let i = 0; i < 70; i++) {
				await delay(150);
				if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
			}
			await delay(120);
		};
		const arrow = (key: string) =>
			compEl()?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

		await send("pertanyaan pertama composer");
		await send("pertanyaan kedua composer");
		await delay(80);

		arrow("ArrowUp");
		await delay(60);
		const up1 = compText();
		arrow("ArrowUp");
		await delay(60);
		const up2 = compText();
		arrow("ArrowDown");
		await delay(60);
		const down1 = compText();
		arrow("ArrowDown");
		await delay(60);
		const down2 = compText();

		/* a typed draft blocks browsing (never hijack the user's words) */
		typeIntoComposer("draft saya");
		await delay(60);
		arrow("ArrowUp");
		await delay(60);
		const typedKept = compText();
		arrow("ArrowUp");
		await delay(60);
		const typedBrowsed = compText();

		window.__oaComposerCheck = JSON.stringify({ up1, up2, down1, down2, typedKept, typedBrowsed });
	} else if (s === "goal") {
		/* Ralph loop E2E (v0.1.25, hermes_cli/goals.py): /goal <text> kicks off
		   immediately; judge #1 says CONTINUE → an ordinary-user-message
		   continuation runs; judge #2 says DONE → status done, chip ✓; bare
		   /goal reports, /goal clear ends it */
		typeIntoComposer("/goal rangkum semua catatan harian minggu ini");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		let goalSnap: { status: string; turnsUsed: number } | null = null;
		for (let i = 0; i < 90; i++) {
			await delay(200);
			const saved = window.__oaSavedSessions ?? [];
			const withGoal = [...saved].reverse().find((x) => x.goal);
			goalSnap = withGoal?.goal ?? null;
			if (goalSnap && goalSnap.status === "done") break;
		}
		await delay(250);
		const reqs = window.__oaRequests ?? [];
		const lastUser = (r: { role: string; content: string }[]) => [...r].reverse().find((m) => m.role === "user")?.content ?? "";
		const kickoffs = reqs.filter((r) => lastUser(r) === "rangkum semua catatan harian minggu ini");
		const continuations = reqs.filter((r) => lastUser(r).startsWith("[Continuing toward your standing goal]"));
		const chip = document.querySelector(".oa-goal-chip")?.getAttribute("aria-label") ?? "";
		document.querySelector<HTMLTextAreaElement>(".oa-prompt-textarea")?.focus();
		const sendS = async (text: string) => {
			typeIntoComposer(text);
			await delay(40);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			await delay(320);
		};
		await sendS("/goal status");
		const statusNotice = (document.body.textContent ?? "").includes("Standing goal") && (document.body.textContent ?? "").includes("done");
		await sendS("/goal clear");
		const chipAfterClear = document.querySelector(".oa-goal-chip")?.getAttribute("aria-label") ?? null;
		/* v0.1.27 aux-pin guard: BOTH judge calls must have ridden the pinned
		   model (same provider, different model id — model override proof) */
		const models = window.__oaRequestModels ?? [];
		const judgeIdx = reqs
			.map((r, i) => (r.some((m) => (m.content ?? "").includes("You judge whether a recent reply satisfies")) ? i : -1))
			.filter((i) => i >= 0);
		const judgeModelOk = judgeIdx.length === 2 && judgeIdx.every((i) => models[i] === "qwen3-30b-a3b-instruct-2507");
		window.__oaGoalCheck = JSON.stringify({
			goalSnap,
			judgeCalls: window.__oaGoalJudgeCount ?? 0,
			judgeModelOk,
			kickoffRuns: kickoffs.length,
			continuationRuns: continuations.length,
			continuationHasGoal: continuations.some((r) => lastUser(r).includes("rangkum semua catatan harian minggu ini")),
			chip,
			statusNotice,
			chipAfterClear,
			doneNotice: (document.body.textContent ?? "").includes("Goal complete"),
		});
	} else if (s === "steer") {
		/* /steer E2E (v0.1.26, run_agent.py parity): a slow tool gives a
		   human-scale window — typing /steer mid-run must STASH it (never
		   queue), the byte-exact marker rides the tool result into the next
		   request, the card renders an attributed note, and an idle /steer
		   settles as an ordinary next-turn message */
		typeIntoComposer("cari catatan alpha");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		for (let i = 0; i < 40; i++) {
			await delay(100);
			if (document.querySelector(".oa-tool")) break;
		}
		typeIntoComposer("/steer fokus ke error handling");
		await delay(40);
		document.querySelector<HTMLButtonElement>("[aria-label='Queue prompt']")?.click(); // busy dispatch — NOT a queue row
		await delay(200);
		/* text assertions scope to #root — document.body.textContent includes
		   the inline bundle script, which holds every literal (false ✓ trap) */
		const rootText = () => document.getElementById("root")?.textContent ?? "";
		const stashNotice = rootText().includes("Steer queued — arrives after the next tool call");
		const queueRowsHeld = document.querySelectorAll(".oa-queue-row").length;
		for (let i = 0; i < 90; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		await delay(300);
		const reqs = window.__oaRequests ?? [];
		const toolMsgs = reqs.flatMap((r) => r.filter((m) => m.role === "tool"));
		const markerOnWire = toolMsgs.some(
			(m) => (m.tail ?? m.content).includes("[OUT-OF-BAND USER MESSAGE") && (m.tail ?? m.content).includes("fokus ke error handling")
		);
		/* idle path: no run in flight → /steer becomes an ordinary message */
		typeIntoComposer("/steer kabar baik hari ini");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		for (let i = 0; i < 90; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		await delay(200);
		const users = [...document.querySelectorAll(".oa-msg-user")].map((b) => b.textContent ?? "");
		/* a real user would open the tool card to read output + the steer
		   note — the disclosure is collapsed by default, so click it first */
		document.querySelector<HTMLButtonElement>(".oa-tool .oa-tool-header")?.click();
		await delay(120);
		document.querySelector(".oa-tool")?.scrollIntoView({ block: "center" }); // the frame shot shows the note
		const steerNoteShown = [...document.querySelectorAll(".oa-steer-note")].some((n) => (n.textContent ?? "").includes("fokus ke error handling"));
		const markerRawLeaked = rootText().includes("OUT-OF-BAND USER MESSAGE");
		window.__oaSteerCheck = JSON.stringify({
			stashNotice,
			queueRowsHeld,
			markerOnWire,
			steerNoteShown,
			markerRawLeaked,
			toolOutText: (document.querySelector(".oa-tool .oa-steps-pre")?.textContent ?? "").slice(-160),
			idleBubblePlain: users.some((u) => u.includes("kabar baik hari ini") && !u.includes("/steer")),
			idleRan: (window.__oaRequests ?? []).some((r) => r.some((m) => m.role === "user" && (m.content ?? "").includes("kabar baik hari ini"))),
		});
	} else if (s === "webe") {
		/* web_extract E2E (v0.1.28, tools/web_tools.py parity): turn 1 fetches
		   a >budget page RAW — the wire must show the head+tail window, the
		   [TRUNCATED] footer with the vault path + the read_note paging call,
		   and the full text must land in the vault; turn 2 asks summarize:true
		   — the Web extract aux pin must route that call to the pinned model */
		const settle = async () => {
			for (let i = 0; i < 90; i++) {
				await delay(150);
				if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
			}
			await delay(250);
		};
		typeIntoComposer("ambil isi halaman alpha");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		await settle();
		typeIntoComposer("rangkum halaman itu saja");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		await settle();

		const reqs = window.__oaRequests ?? [];
		const modelsW = window.__oaRequestModels ?? [];
		const toolTexts = reqs.flatMap((r) => r.filter((m) => m.role === "tool")).map((m) => `${m.content}\n${m.tail ?? ""}`);
		const rawTool = toolTexts.find((t) => t.includes("[TRUNCATED]")) ?? "";
		const footerOnWire = rawTool.includes("Showing ") && rawTool.includes(" chars (head) + ") && rawTool.includes("total clean characters");
		const savedPathOnWire = rawTool.includes("Full text saved to: openagent/web-cache/contoh.id-");
		const readNotePointer = /read_note path="openagent\/web-cache\/contoh\.id-[0-9a-f]{10}\.md" offset=\d+ limit=200/.test(rawTool);
		const writes = window.__oaVaultWrites ?? [];
		const vaultStored = writes.some((w) => w.path.startsWith("openagent/web-cache/contoh.id-") && w.path.endsWith(".md") && w.content.includes("Baris isi halaman panjang"));
		/* summarize turn: the aux call carries the pinned model; the tool
		   result is the summary row (fail-open would leak the window instead) */
		const sumIdx = reqs.findIndex((r) => r.some((m) => (m.content ?? "").includes("Condense this web page")));
		const summarizeModelOk = sumIdx >= 0 && modelsW[sumIdx] === "qwen3-30b-a3b-instruct-2507";
		const summaryOnWire = toolTexts.some((t) => t.includes("RINGKASAN-WEB-OK") && t.includes("Summarized — full text saved to:"));
		window.__oaWebeCheck = JSON.stringify({
			footerOnWire,
			savedPathOnWire,
			readNotePointer,
			vaultStored,
			summarizeModelOk,
			summaryOnWire,
		});
		/* the frame shot shows the first tool card opened — footer included */
		document.querySelector<HTMLButtonElement>(".oa-tool .oa-tool-header")?.click();
		await delay(120);
		document.querySelector(".oa-tool")?.scrollIntoView({ block: "center" });
	} else if (s === "moa") {
		/* MoA E2E (v0.1.30, agent/moa_loop.py MoAClient parity): ONE user turn
		   with a mid-turn tool call. Under the user_turn cadence the two
		   advisors run exactly ONCE; the preset's AGGREGATOR makes both
		   acting calls, each carrying the official guidance header + joined
		   advisor blocks; the reasoning disclosure shows the labelled
		   reference blocks (progress trail self-cleaned) + aggregating line */
		const settle = async () => {
			for (let i = 0; i < 90; i++) {
				await delay(150);
				if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
			}
			await delay(250);
		};
		typeIntoComposer("jelaskan topik alpha");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		await settle();

		const reqs = window.__oaRequests ?? [];
		const models = window.__oaRequestModels ?? [];
		const count = (id) => models.filter((x) => x === id).length;
		const guidanceReqs = reqs.filter((r) =>
			r.some((x) => `${x.content ?? ""}\n${x.tail ?? ""}`.includes("Mixture of Agents reference context"))
		);
		const tails = reqs.flatMap((r) => r.map((x) => `${x.tail ?? ""}`));
		/* text assertions scope to #root — the inline bundle script holds every
		   literal (lesson 27); open the disclosure like a real user first */
		document.querySelector<HTMLButtonElement>(".oa-reasoning-trigger")?.click();
		await delay(120);
		const rt = document.getElementById("root")?.textContent ?? "";
		window.__oaMoaCheck = JSON.stringify({
			refsOnceQwen: count("qwen3-30b-a3b-instruct-2507") === 1,
			refsOnceGemma: count(MODEL) === 2, // 1 advisor + 1 title call — a 2nd advisor run would make 3
			actingTwice: count("hermes-4-70b") === 2,
			guidanceBothIters: guidanceReqs.length === 2,
			headerFields: reqs.some((r) =>
				r.some((x) => (x.content ?? "").includes("Preset: crew") && (x.content ?? "").includes("Aggregator/acting model: lmstudio:hermes-4-70b"))
			),
			adviceOnWire: tails.some((t) => t.includes("NASIHAT-GEMMA")) && tails.some((t) => t.includes("NASIHAT-QWEN")),
			advisorPromptOnly: !tails.some((t) => t.includes("NASIHAT-GEMMA") && t.includes("You are a reference advisor")),
			refBlocksShown:
				rt.includes("◇ Reference 1/2 — lmstudio:") && rt.includes("◇ Reference 2/2 — lmstudio:") && rt.includes("NASIHAT-GEMMA") && rt.includes("NASIHAT-QWEN"),
			aggregatingShown: rt.includes("◇ MoA aggregating…"),
			progressSelfCleaned: !rt.includes("◇ MoA refs"),
			answerShown: rt.includes("JAWABAN-MOA"),
		});
		/* the frame shot shows the opened disclosure with the advisor blocks */
		document.querySelector(".oa-reasoning")?.scrollIntoView({ block: "center" });
	} else if (s === "moa2") {
		/* /moa one-shot + bare /model pivot (v0.1.31, cli.py ~10024 +
		   model_switch.py PATH B parity). Session starts on the plain
		   model: a bare "/moa" prints the official usage line, "/moa <p>"
		   rides the DEFAULT preset for exactly one turn and restores, a
		   bare "/model <preset>" pivots onto MoA, a DISABLED preset name
		   never pivots (#55187), and the "moa:" prefix is not a bare
		   name. Settings state is read straight from simSettings. */
		const settle = async () => {
			for (let i = 0; i < 90; i++) {
				await delay(150);
				if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
			}
			await delay(250);
		};
		const sendS = async (text: string) => {
			typeIntoComposer(text);
			await delay(60);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			await delay(120);
		};
		const moaState = () => (simSettings as unknown as { moa?: { active_preset?: string }; model?: string }).moa;

		await sendS("/moa"); // bare → usage, never a turn
		await sendS("/moa jelaskan topik alpha");
		await settle();
		const afterOneShot = { active: moaState()?.active_preset ?? null, model: simSettings.model };

		const reqs = window.__oaRequests ?? [];
		const models = window.__oaRequestModels ?? [];
		const count = (id) => models.filter((x) => x === id).length;
		const guidanceReqs = reqs.filter((r) =>
			r.some((x) => `${x.content ?? ""}\n${x.tail ?? ""}`.includes("Mixture of Agents reference context"))
		);

		await sendS("/model crew"); // bare ENABLED preset name → implicit pivot
		await delay(80);
		const afterPivot = { active: moaState()?.active_preset ?? null, model: simSettings.model };
		const pillAfterPivot = document.querySelector(".oa-model-pill-label")?.textContent ?? "";

		await sendS("/model off"); // DISABLED preset → plain switch, leaves MoA
		await delay(80);
		const afterDisabled = { active: moaState()?.active_preset ?? null, model: simSettings.model };

		await sendS("/model moa:crew"); // prefixed form is never a bare match
		await delay(80);
		const afterPrefixed = { active: moaState()?.active_preset ?? null, model: simSettings.model };

		const rt = document.getElementById("root")?.textContent ?? "";
		window.__oaMoa2Check = JSON.stringify({
			usageShown: rt.includes("Usage: /moa") && rt.includes("default MoA preset"),
			oneShotNotice: rt.includes("MoA one-shot queued with preset crew; your selected model remains unchanged."),
			advisorsOnceQwen: count("qwen3-30b-a3b-instruct-2507") === 1,
			advisorsOnceGemma: count(MODEL) === 2, // 1 advisor + 1 title call
			actingTwice: count("hermes-4-70b") === 2,
			guidanceBothIters: guidanceReqs.length === 2,
			answerShown: rt.includes("JAWABAN-MOA"),
			restoredPreset: afterOneShot.active === "" || afterOneShot.active === null,
			restoredModel: afterOneShot.model === MODEL,
			pivotNotice: rt.includes("MoA preset crew active"),
			pivotSet: afterPivot.active === "crew",
			pivotKeepsModel: afterPivot.model === MODEL,
			pillShowsPreset: pillAfterPivot.includes("crew"),
			disabledNoPivot: afterDisabled.active !== "off" && afterDisabled.model === "off",
			disabledLeavesNotice: rt.includes("left the MoA virtual provider"),
			prefixedNoPivot: afterPrefixed.active !== "crew" && afterPrefixed.model === "moa:crew",
		});
		/* the frame shot: scroll the transcript to the top for the notices */
		document.querySelector(".oa-chat-scroll")?.scrollTo({ top: 0 });
	} else if (s === "empty") {
		/* v0.1.35 intro mirror: wordmark + a rotating copy line, nothing else */
		const wordmark = document.querySelector(".oa-intro-wordmark")?.textContent ?? "";
		const copy = document.querySelector(".oa-intro-copy")?.textContent ?? "";
		const hintLeft = !!document.querySelector(".oa-empty-hint");
		const inOfficialPool = introBodyPool().includes(copy);
		window.__oaEmptyCheck = JSON.stringify({ wordmark, copy, hintLeft, inOfficialPool });
	} else if (s === "clfy") {
		/* v0.1.80 Hermes clarify tool: one run cycles all four platform
		   interactions. Cards progress question-by-question (each wait is
		   keyed on the CURRENT question text, never a stale rematch);
		   every resolved user_response must ride the wire as Hermes' JSON
		   envelope {question, choices_offered, user_response} */
		const reactType = (el: HTMLInputElement | HTMLTextAreaElement | null, text: string): boolean => {
			if (!el) return false;
			const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
			const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
			setter.call(el, text);
			el.dispatchEvent(new Event("input", { bubbles: true }));
			return true;
		};
		const cardQ = () => document.querySelector(".oa-clarify-q")?.textContent ?? "";
		const waitCard = async (notQ: string) => {
			for (let i = 0; i < 60; i++) {
				await delay(100);
				if (document.querySelector(".oa-clarify") && cardQ() !== notQ) return true;
			}
			return false;
		};
		typeIntoComposer("rapikan catatanku");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		/* 1 — single pick: 3 agent choices + the always-appended Other row */
		const got1 = await waitCard("");
		const q1 = cardQ();
		const s1Choices = [...document.querySelectorAll<HTMLButtonElement>(".oa-clarify-choice")].map((b) => b.textContent ?? "");
		[...document.querySelectorAll<HTMLButtonElement>(".oa-clarify-choice")].find((b) => b.textContent === "Projects")?.click();
		/* 2 — open-ended: the free-text editor is open from the start */
		const got2 = await waitCard(q1);
		const q2 = cardQ();
		const typed2 = reactType(document.querySelector(".oa-clarify-freetext"), "jangan hapus draft");
		[...document.querySelectorAll<HTMLButtonElement>(".oa-clarify-actions .oa-btn-primary")].find((b) => !b.disabled)?.click();
		/* 3 — multi-select two boxes + a typed Other */
		const got3 = await waitCard(q2);
		const q3 = cardQ();
		for (const label of ["meeting", "ide"]) {
			[...document.querySelectorAll<HTMLElement>(".oa-clarify-check")].find((l) => l.textContent?.includes(label))?.querySelector("input")?.click();
			await delay(30);
		}
		const typed3 = reactType(document.querySelector(".oa-clarify-other-input"), "inbox juga");
		[...document.querySelectorAll<HTMLButtonElement>(".oa-clarify-actions .oa-btn-primary")].find((b) => !b.disabled)?.click();
		/* 4 — explicit skip = Hermes' timeout semantics as a gesture */
		const got4 = await waitCard(q3);
		const q4 = cardQ();
		document.querySelector<HTMLButtonElement>(".oa-clarify-skip")?.click();
		for (let i = 0; i < 80; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		const reqs = window.__oaRequests ?? [];
		const answers: string[] = [];
		const seen = new Set<string>();
		for (const r of reqs) {
			for (const m of r) {
				if (m.role !== "tool") continue;
				/* wire capture head-slices content at 200 (tail keeps 600) —
				   collect only COMPLETE envelopes or the slice poisons JSON
				   parsing (envelope 4 first died exactly like this) */
				for (const c of [m.tail ?? "", m.content ?? ""]) {
					if (c.startsWith('{"question"') && c.trimEnd().endsWith("}") && c.includes('"user_response"') && !seen.has(c)) {
						seen.add(c);
						answers.push(c);
					}
				}
			}
		}
		const bubbles = [...document.querySelectorAll(".oa-msg-assistant")].map((b) => b.textContent ?? "");
		const summaries = [...document.querySelectorAll(".oa-clarify-summary")].map((el) => el.textContent ?? "");
		window.__oaClfyCheck = JSON.stringify({
			got1,
			got2,
			got3,
			got4,
			cardQ: [q1, q2, q3, q4],
			s1Choices,
			typed2,
			typed3,
			answers,
			summaries,
			finishSeen: bubbles.some((b) => b.includes("SIP-SELESAI")),
		});
		window.__oaReady = true;
	} else if (s === "fcard") {
		/* fcard (v0.1.56, changed-files card): the canned run lands two writes
		   on Projects/Plan.md (dedupe → last-verb ×2) and one on Daily/Notes.md;
		   the card folds them; a row click walks the workspace leaf mock
		   (recorded into __oaVaultOpens) */
		typeIntoComposer("Simpan ke Projects/Plan.md dan buat Daily/Notes.md.");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		for (let i = 0; i < 60; i++) {
			await delay(150);
			if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
		}
		let card: HTMLElement | null = null;
		for (let i = 0; i < 40; i++) {
			await delay(150);
			card = document.querySelector<HTMLElement>(".oa-changed");
			if (card) break;
		}
		const header = card?.querySelector(".oa-changed-count")?.textContent?.trim() ?? null;
		const rows = [...(card?.querySelectorAll(".oa-changed-row") ?? [])].map((r) => r.querySelector(".oa-changed-name")?.textContent?.trim() ?? "?");
		const metas = [...(card?.querySelectorAll(".oa-changed-row .oa-changed-meta") ?? [])].map((m) => m.textContent?.trim() ?? "?");
		const iconsDrawn = rows.length > 0 && [...(card?.querySelectorAll(".oa-changed-row") ?? [])].every((r) => r.querySelector("svg path"));
		const writes = (window.__oaVaultWrites ?? []).map((w) => w.path);
		/* v0.1.121 (owner): klik SEMUA baris — setiap klik harus membuka file
		   yang benar-benar tertulis, bukan memunculkan notice palsu */
		for (const b of [...(card?.querySelectorAll<HTMLButtonElement>(".oa-changed-row") ?? [])]) {
			b.click();
			await delay(120);
		}
		const opens = (window.__oaVaultOpens ?? []).slice();
		const falseNotice = (window.__oaNotices ?? []).some((n) => n.includes("no longer in the vault"));
		window.__oaFcardCheck = JSON.stringify({ cardShown: !!card, header, rows, metas, iconsDrawn, writes, opens, wsFolder: simSettings.workspaceFolder, falseNotice });
	} else if (s === "sysmsg") {
		/* system banner lane (v0.1.57, prompt-kit port): slash notices render as
		   honest system banners (variant + icon + markdown), never assistant
		   bubbles with feedback chrome, and persist as system turns. /compress
		   runs FIRST so the empty-history warning row is the one we see. */
		const sendPrompt = async (text: string) => {
			typeIntoComposer(text);
			await delay(40);
			document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
			for (let i = 0; i < 80; i++) {
				await delay(150);
				if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
			}
			await delay(150);
		};
		await sendPrompt("/compress");
		await sendPrompt("/version");
		await sendPrompt("/approvals bogus");
		await sendPrompt("halo agent");
		await sendPrompt("pesan kedua");
		const rows = [...document.querySelectorAll<HTMLElement>(".oa-sysmsg")];
		const find = (needle: string) => rows.find((r) => (r.textContent ?? "").includes(needle));
		const action = find("Open Agent v");
		const warn = find("Nothing to compress yet.");
		const err = find("Unknown mode");
		window.__oaSysmsgCheck = JSON.stringify({
			actionOk: !!action && action.className.includes("oa-sysmsg-action"),
			warnOk: !!warn && warn.className.includes("oa-sysmsg-warning"),
			errOk: !!err && err.className.includes("oa-sysmsg-error"),
			icons: rows.length >= 3 && rows.every((r) => r.querySelector("svg")),
			honest: rows.length >= 3 && rows.every((r) => !r.closest(".oa-msg")),
			noFeedback: rows.every((r) => !r.querySelector(".oa-feedback-slot") && !r.closest(".oa-msg-assistant")),
			persisted: ((window.__oaSavedSessions ?? []).slice(-1)[0]?.turnRoles ?? []).filter((x) => x.startsWith("system")).length >= 3,
			persistedKinds: ((window.__oaSavedSessions ?? []).slice(-1)[0]?.turnRoles ?? []).filter((x) => x.startsWith("system")).slice(0, 5).join("|"),
			rowCount: rows.length,
		});
	} else if (s === "preview") {
		/* approval preview lane (v0.1.58): turn 1 write_note → ACCEPT the diff
		   card (write lands through the real tool); turn 2 edit_note → DENY
		   (no write lands, the denial rides the wire) */
		const clickPrimary = () => document.querySelector<HTMLButtonElement>(".oa-approval-actions .oa-btn-primary")?.click();
		const clickDanger = () => document.querySelector<HTMLButtonElement>(".oa-approval-actions .oa-btn-danger")?.click();
		const waitCard = async () => {
			for (let i = 0; i < 60; i++) {
				await delay(150);
				const c = document.querySelector<HTMLElement>(".oa-approval .oa-preview");
				if (c) return c;
			}
			return null;
		};
		const settleRun = async () => {
			for (let i = 0; i < 80; i++) {
				await delay(150);
				if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
			}
			await delay(150);
		};
		typeIntoComposer("buat catatan preview");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		const card1 = await waitCard();
		const path1 = card1?.querySelector(".oa-preview-path")?.textContent?.trim() ?? null;
		const op1 = card1?.querySelector(".oa-preview-op")?.textContent?.trim() ?? null;
		const add1 = card1?.querySelectorAll(".oa-preview-row.oa-preview-added").length ?? -1;
		const rm1 = card1?.querySelectorAll(".oa-preview-row.oa-preview-removed").length ?? -1;
		/* v0.1.121 (owner: "label hijau itu memang cuma warna atau ada text?")
		   — badge op punya teks ("create"); kontras dijamin tint lembut
		   (latar rgba alpha ~0.14, bahasa baris diff), bukan hijau solid
		   yang menenggelamkan teks hijau di tema pemilik */
		const opEl = card1?.querySelector<HTMLElement>(".oa-preview-op-create");
		const opStyle = opEl ? getComputedStyle(opEl) : null;
		const opBadge = {
			text: (opEl?.textContent ?? "").trim(),
			bg: opStyle?.backgroundColor ?? "",
			fg: opStyle?.color ?? "",
		};
		clickPrimary();
		await settleRun();
		const writes1 = (window.__oaVaultWrites ?? []).filter((w) => w.path === "Harian/Preview.md");
		typeIntoComposer("ubah baris pertama");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		const card2 = await waitCard();
		const op2 = card2?.querySelector(".oa-preview-op")?.textContent?.trim() ?? null;
		const add2 = card2?.querySelectorAll(".oa-preview-row.oa-preview-added").length ?? -1;
		const rm2 = card2?.querySelectorAll(".oa-preview-row.oa-preview-removed").length ?? -1;
		const wordHi = !!card2?.querySelector(".oa-preview-w-add") && !!card2?.querySelector(".oa-preview-w-del");
		/* v0.1.105 (owner: "diff kita masih kelihatan polos" → LobeHub unified
		   diff): measured VISUAL contract of the edit card — it must be taken
		   NOW, before clickDanger dismisses it (detached elements compute
		   nothing). Gutters numbered, soft translucent row tints, colored ±
		   counts, stronger-tinted word segments. */
		const visualOf = (card: HTMLElement | null) => {
			const rowA = card?.querySelector<HTMLElement>(".oa-preview-row.oa-preview-added");
			const rowR = card?.querySelector<HTMLElement>(".oa-preview-row.oa-preview-removed");
			const wAdd = card?.querySelector<HTMLElement>(".oa-preview-w-add");
			const cd = card?.querySelector<HTMLElement>(".oa-preview-count-del");
			const ca = card?.querySelector<HTMLElement>(".oa-preview-count-add");
			const ctxG = [...(card?.querySelectorAll(".oa-preview-row.oa-preview-context .oa-preview-gutter") ?? [])];
			const numA = rowA?.querySelector<HTMLElement>(".oa-preview-gutter");
			const numR = rowR?.querySelector<HTMLElement>(".oa-preview-gutter");
			const numC = ctxG[0] as HTMLElement | undefined;
			return {
				gut: card?.querySelectorAll(".oa-preview-gutter").length ?? 0,
				bgA: rowA ? getComputedStyle(rowA).backgroundColor : "",
				bgR: rowR ? getComputedStyle(rowR).backgroundColor : "",
				delColor: cd ? getComputedStyle(cd).color : "",
				addColor: ca ? getComputedStyle(ca).color : "",
				wAddBg: wAdd ? getComputedStyle(wAdd).backgroundColor : "",
				remGut: numR?.textContent ?? "",
				addGut: numA?.textContent ?? "",
				ctxGuts: ctxG.map((g) => g.textContent).join(","),
				remEdge: rowR ? getComputedStyle(rowR).borderLeftColor : "",
				addEdge: rowA ? getComputedStyle(rowA).borderLeftColor : "",
				remNumColor: numR ? getComputedStyle(numR).color : "",
				addNumColor: numA ? getComputedStyle(numA).color : "",
				ctxNumColor: numC ? getComputedStyle(numC).color : "",
			};
		};
		const visual2 = visualOf(card2);
		clickDanger();
		await settleRun();
		const writes2 = (window.__oaVaultWrites ?? []).filter((w) => w.path === "Harian/Preview.md");
		const toolWire = (window.__oaRequests ?? []).flatMap((r) => r.filter((m) => m.role === "tool")).map((m) => `${m.content}\n${m.tail ?? ""}`);
		window.__oaPreviewCheck = JSON.stringify({
			card1: !!card1 && path1 === "Harian/Preview.md" && op1 === "create" && add1 === 3 && rm1 === 0,
			opBadge,
			accepted: writes1.length === 1 && writes1[0].content.includes("baris lama satu"),
			card2: !!card2 && op2 === "edit" && add2 === 1 && rm2 === 1 && wordHi,
			denied: writes2.length === 1 && toolWire.some((t) => t.includes("The user denied this action")),
			visual2,
		});
		} else if (s === "convo" || s === "working" || s === "md" || s === "reax" || s === "sel") {
		typeIntoComposer("Explain the agent loop like a senior engineer.");
		await delay(40);
		document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
		if (s === "working") {
			await delay(600); // capture mid-think
			/* v0.1.122 (owner): wajah REST tombol Stop diukur NYATA saat run —
			   tint merah lembut ~0.12 (dulu transparan sampai hover), ikon merah
			   solid & berbeda dari latar, bujur sangkar terkunci (w===h +
			   aspect-ratio 1/1) + radius 999px */
			const stopBtn = document.querySelector<HTMLElement>(".oa-prompt-action-danger");
			const stopStyle = stopBtn ? getComputedStyle(stopBtn) : null;
			window.__oaWorkCheck = JSON.stringify({
				stopShown: !!stopBtn,
				stopBg: stopStyle?.backgroundColor ?? "",
				stopFg: stopStyle?.color ?? "",
				stopAspect: stopStyle?.aspectRatio ?? "",
				stopRadius: stopStyle?.borderRadius ?? "",
				stopSquare: !!stopBtn && stopBtn.offsetWidth === stopBtn.offsetHeight,
			});
		} else {
			// wait until the run finishes: thinking bar + working pulse disappear
			for (let i = 0; i < 60; i++) {
				await delay(150);
				if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
			}
			await delay(120);
			/* reax (v0.1.42, Hermes tapback parity): picker 👍 lands as an
			   always-visible badge + persists to the saved session; iMessage
			   double-click on the body switches to ❤️, a second retracts */
			if (s === "reax") {
				/* v0.1.49 prompt-kit feedback BANNER (owner-verified shape):
				   shows under a finished assistant answer; Helpful hides it and
				   persists "up"; the dblclick gesture retracts → banner returns
				   while unrated; Close dismisses permanently AND the dismissal
				   persists; the banner never renders on a user bubble */
				const firstAssistant = document.querySelector<HTMLElement>(".oa-msg-assistant");
				const barNow = () => firstAssistant?.querySelector(".oa-feedback-bar") ?? null;
				const savedReaction = () => savedSessions.map((ss) => ss.turns.find((t) => t.reaction)?.reaction).find(Boolean) ?? null;
				const savedDismissed = () => savedSessions.map((ss) => ss.turns.find((t) => t.feedbackDismissed)?.feedbackDismissed ?? null).find((v) => v !== null) ?? null;
				const barBefore = !!barNow();
				/* icons must be DRAWN (svg paths present), not invisible empty
				   shells — the shim once rendered unknown names silently empty */
				const iconsDrawn = barNow()
					? [...barNow()!.querySelectorAll(".oa-feedback-btn")].every((b) => b.querySelector("svg path"))
					: false;
				barNow()?.querySelector<HTMLButtonElement>('button[aria-label="Helpful"]')?.click();
				await delay(140);
				const barAfterPick = !!barNow();
				const savedAfterPick = savedReaction();
				firstAssistant?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, detail: 2 }));
				await delay(140);
				const savedAfterTap = savedReaction(); // retracted → banner returns
				const barAfterTapback = !!barNow();
				barNow()?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click();
				await delay(140);
				const barAfterClose = !!barNow();
				const dismissedSaved = savedDismissed();
				const userBubbleFree = !document.querySelector(".oa-msg-user .oa-feedback-bar");
				/* v0.1.54 feedback → learning signal: down-rate a FRESH reply
				   (the first turn is permanently dismissed), then one more
				   message — its assembled system prompt must carry the
				   reflection line. Wire-level proof via full-content
				   __oaRequests system entries. */
				typeIntoComposer("And the memory part?");
				await delay(40);
				document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
				for (let i = 0; i < 60; i++) {
					await delay(150);
					if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
				}
				await delay(120);
				const secondAssistant = [...document.querySelectorAll<HTMLElement>(".oa-msg-assistant")].pop();
				secondAssistant
					?.querySelector(".oa-feedback-bar")
					?.querySelector<HTMLButtonElement>('button[aria-label="Not helpful"]')
					?.click();
				await delay(140);
				const savedAfterDown = savedReaction();
				typeIntoComposer("Try again, shorter.");
				await delay(40);
				document.querySelector<HTMLButtonElement>(".oa-prompt-action-primary")?.click();
				for (let i = 0; i < 60; i++) {
					await delay(150);
					if (!document.querySelector(".oa-thinking-bar") && !document.querySelector(".oa-topbar-status")) break;
				}
				await delay(150);
				const reqs = window.__oaRequests ?? [];
				const systemOf = (r: { role: string; content: string }[]) => r.find((m) => m.role === "system");
				const lastSys = [...reqs].reverse().map(systemOf).find(Boolean);
				const firstSys = reqs.length ? systemOf(reqs[0]) : undefined;
				const feedbackInNextSys = (lastSys?.content ?? "").includes("rated not helpful");
				const feedbackAbsentBefore = !!firstSys && !firstSys.content.includes("rated not helpful");
				window.__oaReaxCheck = JSON.stringify({ barBefore, iconsDrawn, barAfterPick, savedAfterPick, savedAfterTap, barAfterTapback, barAfterClose, dismissedSaved, userBubbleFree, savedAfterDown, feedbackInNextSys, feedbackAbsentBefore });
			}
			/* sel (v0.1.44, selection actions bar): a drag-style highlight on
			   message text pops the Quote/Copy bar — Quote pastes Obsidian
			   `> ` blockquote lines into the composer; Copy flips its label
			   (execCommand fallback in headless) and the bar retires itself */
			if (s === "sel") {
				const strong = document.querySelector<HTMLElement>(".oa-msg-assistant .oa-msg-content strong");
				if (strong) {
					/* the reply is taller than the frame — a real hand can only
					   highlight what it sees (the bar is viewport-guarded) */
					strong.scrollIntoView({ block: "center" });
					await delay(150);
					const pick = () => {
						const range = document.createRange();
						range.selectNodeContents(strong);
						const sel = window.getSelection();
						sel?.removeAllRanges();
						sel?.addRange(range);
					};
					pick();
					await delay(250); // selectionchange debounce (60ms) + render
					const barShown = !!document.querySelector(".oa-selbar");
					/* v0.1.47: owner measured a 34.6×19.6px bar — buttons were
					   content-sized because .oa-app button{} out-specificities
					   a single class. Measure the shell, never trust the eye. */
					const btnBox = document.querySelector(".oa-selbar-btn")?.getBoundingClientRect();
					document.querySelector<HTMLButtonElement>('.oa-selbar button[aria-label="Quote"]')?.click();
					await delay(150);
					const composerText = document.querySelector<HTMLElement>(".oa-prompt-textarea")?.textContent ?? "";
					pick(); // Quote cleared the highlight — re-select for the Copy leg
					await delay(250);
					const barAgain = !!document.querySelector(".oa-selbar");
					document.querySelector<HTMLButtonElement>('.oa-selbar button[aria-label="Copy"]')?.click();
					await delay(200);
					/* v0.1.46 icon-only toolbar: the Copied beat is the Copy→Check
					   icon swap (is-done), not a text label anymore */
					const copiedBeat = !!document.querySelector(".oa-selbar-btn.is-done");
					await delay(1100); // the bar retires ~900ms after the beat
					const barGone = !document.querySelector(".oa-selbar");
					window.__oaSelCheck = JSON.stringify({ selected: strong.textContent, barShown, btnW: Math.round((btnBox?.width ?? 0) * 10) / 10, btnH: Math.round((btnBox?.height ?? 0) * 10) / 10, composerText, barAgain, copiedBeat, barGone });
				}
			}
			/* md: the digest is long — show the end (table + code + quote) */
			if (s === "md") {
				const scroller = document.querySelector<HTMLElement>(".oa-chat-scroll");
				if (scroller) scroller.scrollTop = scroller.scrollHeight;
				await delay(80);
				/* v0.1.43 mini highlighter: the digest's json fence must arrive
				   as token spans (property/string/keyword at least) whose joined
				   text round-trips to the fence source; the mermaid fence must
				   still ride the Markdown route (v0.1.41 must not regress while
				   both touch code segments) */
				const code = document.querySelector<HTMLElement>('.oa-code-pre code[data-language="json"]');
				const spanTypes = [
					...new Set(
						[...(code?.querySelectorAll("span[class*='oa-tok-']") ?? [])]
							.map((el) => el.className.match(/oa-tok-(\w+)/)?.[1] ?? "")
							.filter(Boolean),
					),
				];
				const expected = REPLY_MD.split("```json\n")[1]?.split("\n```")[0] ?? "";
				window.__oaHlCheck = JSON.stringify({
					spanTypes,
					roundtrip: code ? code.textContent?.trimEnd() === expected.trimEnd() : false,
					mermaidIntact: !!document.querySelector(".oa-markdown pre code.language-mermaid"),
					/* v0.1.107 salvage: the fence source that ARRIVES at Obsidian's
					   renderer must already carry the quoted subgraph title — the
					   exact shape from the owner's console wall ("Lexical error on
					   line 2. Unrecognized text … subgraph Agent Loop ✨"). */
					mermaidSalvage: (document.querySelector(".oa-markdown pre code.language-mermaid")?.textContent ?? "").includes('subgraph "Agent Loop ✨"'),
					/* v0.1.123 (owner console "Parse error … got 'PS'" pada C[Skematik
					   Desain (SD)]): fence yang sampai ke renderer Obsidian harus SUDAH
					   mengkutip label berkurung & caption edge berpipa — lolos lexer
					   jison tanpa mengubah bentuk/teks lain */
					mermaidParenSalvage: (() => {
						const t = document.querySelector(".oa-markdown pre code.language-mermaid")?.textContent ?? "";
						return t.includes('S["Skematik Desain (SD)"]') && t.includes('-->|"Revisi (final)"|');
					})(),
					/* v0.1.143 exact owner syntax: all three invalid `; % ...`
					   suffixes must arrive as preserved own-line Mermaid comments. */
					mermaidInlinePercentSalvage: (() => {
						const t = document.querySelector(".oa-markdown pre code.language-mermaid")?.textContent ?? "";
						return !/;[ \t]+%(?!%)/.test(t) &&
							(t.match(/^\s*%% (?:Semua agen|Atau Agen|Kembali ke awal loop)/gm) ?? []).length === 3;
					})(),
					/* v0.1.144 R39: exact `; %%` plus a leading semantic preamble
					   travels through the real Main Chat final/render path. */
					mermaidExactDoublePreamble: (() => {
						const t = document.querySelector(".oa-markdown pre code.language-mermaid")?.textContent ?? "";
						return t.includes("%% leading payload 50% 🚀") &&
							t.includes("%%{init: {'theme': 'base'}}%%") &&
							t.includes("Z --> Q;") && t.includes("%% exact double payload 50% 🚀") &&
							!t.includes("; %% exact double payload");
					})(),
				});
			}
		}
	}
	window.__oaReady = true;
}

window.addEventListener("DOMContentLoaded", () => {
	mount().catch((e) => {
		console.error(e);
		new Notice(`sim mount failed: ${e instanceof Error ? e.message : String(e)}`);
		window.__oaReady = true; // unblock the driver either way
	});
});
