import type { NativeNotificationKind, OpenAgentNotificationSettings } from "./settings";

/** Privacy-safe lifecycle signal emitted by chat/cron. It deliberately carries
 * no prompt, note path, tool arguments, command, output, or raw error text. */
export interface OpenAgentNotificationEvent {
	kind: NativeNotificationKind;
	contextId: string;
}

export interface NativeNotificationStatus {
	supported: boolean;
	reason: "ready" | "mobile" | "api-unavailable";
	permission: NotificationPermission | "unavailable";
}

export type NativeNotificationDispatchResult =
	| "shown"
	| "master-disabled"
	| "kind-disabled"
	| "not-away"
	| "chat-visible"
	| "unsupported"
	| "permission-not-granted"
	| "throttled"
	| "error";

export type NativeNotificationTestResult = "sent" | "unsupported" | "denied" | "error";

interface NotificationHandle {
	close(): void;
	addEventListener?(type: "click" | "close" | "error", listener: () => void, options?: { once?: boolean }): void;
	onclick: (() => void) | null;
	onclose: (() => void) | null;
	onerror: (() => void) | null;
}

interface NotificationConstructorLike {
	readonly permission: NotificationPermission;
	requestPermission(): Promise<NotificationPermission>;
	new (title: string, options?: NotificationOptions): NotificationHandle;
}

export interface NativeNotificationEnvironment {
	isDesktop: () => boolean;
	isAway: () => boolean;
	isChatVisible: () => boolean;
	activateChat: () => void | Promise<void>;
	getConstructor?: () => NotificationConstructorLike | null;
	now?: () => number;
}

const PRIVACY_SAFE_COPY: Record<NativeNotificationKind, { title: string; body: string }> = {
	turnDone: { title: "Open Agent finished", body: "Your chat task is complete." },
	turnError: { title: "Open Agent needs attention", body: "The chat stopped with an error. Open Obsidian for details." },
	approvalRequired: { title: "Open Agent needs approval", body: "Review the pending action in Obsidian." },
	inputRequired: { title: "Open Agent needs input", body: "Answer the pending question in Obsidian." },
	backgroundDone: { title: "Open Agent automation finished", body: "A scheduled task completed." },
	backgroundError: { title: "Open Agent automation needs attention", body: "A scheduled task failed. Open Obsidian for details." },
};

const ATTENTION_KINDS = new Set<NativeNotificationKind>(["approvalRequired", "inputRequired"]);

function defaultConstructor(): NotificationConstructorLike | null {
	try {
		return typeof Notification === "function" ? (Notification as unknown as NotificationConstructorLike) : null;
	} catch {
		return null;
	}
}

/** Desktop-only native banner dispatcher. Permission is never requested from
 * background lifecycle code: only testFromUserGesture() may prompt. */
export class NativeNotificationService {
	private readonly active = new Set<NotificationHandle>();
	/** Internal-only key: context ids never enter the native title/body/tag. */
	private readonly lastShownByKindContext = new Map<string, number>();

	constructor(
		private readonly getSettings: () => OpenAgentNotificationSettings,
		private readonly env: NativeNotificationEnvironment
	) {}

	status(): NativeNotificationStatus {
		if (!this.env.isDesktop()) return { supported: false, reason: "mobile", permission: "unavailable" };
		const Ctor = (this.env.getConstructor ?? defaultConstructor)();
		if (!Ctor) return { supported: false, reason: "api-unavailable", permission: "unavailable" };
		return { supported: true, reason: "ready", permission: Ctor.permission };
	}

	dispatch(event: OpenAgentNotificationEvent, options: { silent?: boolean } = {}): NativeNotificationDispatchResult {
		const settings = this.getSettings();
		if (!settings.nativeEnabled) return "master-disabled";
		if (!settings.nativeKinds[event.kind]) return "kind-disabled";

		const status = this.status();
		if (!status.supported) return "unsupported";
		if (status.permission !== "granted") return "permission-not-granted";

		/* Completion, errors, and background events are away-only. Approval and
		 * input may additionally alert when the app is foregrounded but the chat
		 * pane itself is not visible. */
		if (ATTENTION_KINDS.has(event.kind)) {
			if (!this.env.isAway() && this.env.isChatVisible()) return "chat-visible";
		} else if (!this.env.isAway()) {
			return "not-away";
		}

		const now = (this.env.now ?? Date.now)();
		const throttleKey = `${event.kind}:${event.contextId}`;
		const lastShownAt = this.lastShownByKindContext.get(throttleKey) ?? Number.NEGATIVE_INFINITY;
		if (now - lastShownAt < 1000) return "throttled";
		const Ctor = (this.env.getConstructor ?? defaultConstructor)();
		if (!Ctor) return "unsupported";
		try {
			const copy = PRIVACY_SAFE_COPY[event.kind];
			const notification = new Ctor(copy.title, {
				body: copy.body,
				tag: `openagent:${event.kind}`,
				silent: options.silent === true,
			});
			this.lastShownByKindContext.set(throttleKey, now);
			if (this.lastShownByKindContext.size > 128) {
				for (const [key, shownAt] of this.lastShownByKindContext) {
					if (now - shownAt > 60_000) this.lastShownByKindContext.delete(key);
				}
			}
			this.track(notification);
			return "shown";
		} catch {
			return "error";
		}
	}

	/** Must only be called directly from a Settings button click. This is the
	 * single permission-request path and intentionally bypasses master/kind,
	 * away, and throttle gates so setup remains testable. */
	async testFromUserGesture(): Promise<NativeNotificationTestResult> {
		const status = this.status();
		if (!status.supported) return "unsupported";
		const Ctor = (this.env.getConstructor ?? defaultConstructor)();
		if (!Ctor) return "unsupported";
		try {
			const permission = Ctor.permission === "default" ? await Ctor.requestPermission() : Ctor.permission;
			if (permission !== "granted") return "denied";
			const notification = new Ctor("Open Agent notifications are ready", {
				body: "This privacy-safe test was requested from Settings.",
				tag: "openagent:test",
			});
			this.track(notification);
			return "sent";
		} catch {
			return "error";
		}
	}

	private track(notification: NotificationHandle): void {
		this.active.add(notification);
		const remove = () => this.active.delete(notification);
		const click = () => {
			try {
				notification.close();
			} catch {
				/* native handle already closed */
			}
			void Promise.resolve(this.env.activateChat()).catch((): void => {});
		};
		if (typeof notification.addEventListener === "function") {
			notification.addEventListener("click", click, { once: true });
			notification.addEventListener("close", remove, { once: true });
			notification.addEventListener("error", remove, { once: true });
		} else {
			notification.onclick = click;
			notification.onclose = remove;
			notification.onerror = remove;
		}
	}

	dispose(): void {
		for (const notification of this.active) {
			try {
				notification.close();
			} catch {
				/* best effort */
			}
		}
		this.active.clear();
		this.lastShownByKindContext.clear();
	}
}
