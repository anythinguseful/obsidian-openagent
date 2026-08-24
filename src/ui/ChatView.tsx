/**
 * Obsidian ItemView hosting the React chat app.
 */

import { ItemView, WorkspaceLeaf, Component as ObsidianComponent } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import type OpenAgentPlugin from "../main";
import { ChatApp } from "./ChatApp";
import {
	ChatApiSink,
	SelectionPayload,
	dispatchToChatApi,
	newChatApiSink,
} from "./chatApi";

export const CHAT_VIEW_TYPE = "openagent-chat";

export class ChatView extends ItemView {
	private root: Root | null = null;
	private renderComponent: ObsidianComponent;
	/* editor→chat bridge (candidate ③): main.ts dispatches through this sink;
	   calls made while React is still mounting are stashed in `pending` and
	   ChatApp drains them when it registers its api (see src/ui/chatApi.ts) */
	private chatApiSink: ChatApiSink = newChatApiSink();
	/* v0.1.163: the live session id, reported up by ChatApp — captured before
	   a leaf relocation so the recreated view can restore the conversation. */
	private currentSessionId: string | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: OpenAgentPlugin) {
		super(leaf);
		this.renderComponent = new ObsidianComponent();
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Open Agent";
	}

	getIcon(): string {
		return "bot";
	}

	/** v0.1.163: the active session id (null while a fresh chat hasn't been
	 * assigned/reported yet). Read by main.ts right before relocation. */
	getCurrentSessionId(): string | null {
		return this.currentSessionId;
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("oa-view");
		this.renderComponent.load();
		this.root = createRoot(container);
		this.root.render(
			<ChatApp
				app={this.app}
				pluginDir={this.plugin.manifest.dir ?? undefined}
				settings={this.plugin.settings}
				runner={this.plugin.runner}
				sessions={this.plugin.sessionStore}
				saveSettings={() => this.plugin.saveSettings()}
				saveSettingsSafe={() => this.plugin.saveSettingsSafe()}
				openSettings={(section?: string) => this.plugin.openSettings(section)}
				applyProfile={(id: string) => this.plugin.applyProfile(id)}
				renderComponent={this.renderComponent}
				chatApiSink={this.chatApiSink}
				onNotification={(event) => this.plugin.handleNotificationEvent(event)}
				initialSessionId={this.plugin.consumePendingChatSessionId()}
				onSessionIdChange={(id) => (this.currentSessionId = id)}
			/>
		);
	}

	async onClose(): Promise<void> {
		this.root?.unmount();
		this.root = null;
		this.renderComponent.unload();
		/* a stash made right before close belongs to the closed session —
		   the next mount must NOT replay it */
		this.chatApiSink.pending.length = 0;
	}

	/** Layout-level visibility used only by the approval/input native gate.
	 * Inactive tabs are hidden by Obsidian; zero-size/display-hidden panes do
	 * not count as visible even though their ChatView object still exists. */
	isActuallyVisible(): boolean {
		try {
			if (!this.contentEl.isConnected || this.contentEl.getClientRects().length === 0) return false;
			const rect = this.contentEl.getBoundingClientRect();
			if (rect.width < 1 || rect.height < 1) return false;
			const style = getComputedStyle(this.contentEl);
			return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0;
		} catch {
			return false;
		}
	}

	/** Re-render with fresh settings (called after settings change). */
	refresh(): void {
		this.root?.render(
			<ChatApp
				app={this.app}
				pluginDir={this.plugin.manifest.dir ?? undefined}
				settings={this.plugin.settings}
				runner={this.plugin.runner}
				sessions={this.plugin.sessionStore}
				saveSettings={() => this.plugin.saveSettings()}
				saveSettingsSafe={() => this.plugin.saveSettingsSafe()}
				openSettings={(section?: string) => this.plugin.openSettings(section)}
				applyProfile={(id: string) => this.plugin.applyProfile(id)}
				renderComponent={this.renderComponent}
				chatApiSink={this.chatApiSink}
				onNotification={(event) => this.plugin.handleNotificationEvent(event)}
			/>
		);
	}

	/* ---------------- editor context-menu entry points ----------------
	   (src/editorMenu.ts → here → ChatApp's registered api) */

	attachSelectionFromEditor(p: SelectionPayload): void {
		dispatchToChatApi(this.chatApiSink, (api) => api.attachSelection(p));
	}

	quoteSelectionFromEditor(p: SelectionPayload): void {
		dispatchToChatApi(this.chatApiSink, (api) => api.quoteSelectionForAsk(p));
	}

	runSkillOnSelectionFromEditor(skillName: string, p: SelectionPayload): void {
		dispatchToChatApi(this.chatApiSink, (api) => api.runSkillOnSelection(skillName, p));
	}

	runSnippetOnSelectionFromEditor(lead: string, p: SelectionPayload): void {
		dispatchToChatApi(this.chatApiSink, (api) => api.runSnippetOnSelection(lead, p));
	}
}
