/**
 * prompt-kit · Message
 * Ported from ibelick/prompt-kit (message) — 2026-08-02 v0.1.39: avatars
 * retired from every turn (official Hermes Desktop renders NO avatars —
 * assistant is full-width flat text, user is a full-width bubble). Layout
 * freed ~34px of pane width per message. MessageAvatar (img/fallback API)
 * retired with them: it was unused library surface.
 * Faithful surface: MessageActions, MessageAction. The <Message>
 * wrapper itself keeps Open Agent's own layout (role rows + timestamps).
 * 2026-08-04 v0.1.74: the prompt-kit MessageContent export retired (dead
 * surface — every caller renders markdown through MarkdownDoc directly),
 * taking the App/Component/MarkdownDoc imports with it.
 */

import { ReactNode, useEffect, useRef, useState, type MouseEvent } from "react";
import { copyText } from "../clipboard";
import { CopyIcon, CheckIcon } from "../icons";

export function Message({
	role,
	children,
	timestamp,
	showTimestamp,
	onDoubleClick,
}: {
	role: "user" | "assistant";
	children: ReactNode;
	timestamp?: number;
	showTimestamp?: boolean;
	/** tapback gesture surface (v0.1.42): callers gate detail/excludes inside */
	onDoubleClick?: (ev: MouseEvent<HTMLDivElement>) => void;
}) {
	return (
		<div className={`oa-msg oa-msg-${role}`} onDoubleClick={onDoubleClick}>
			<div className="oa-msg-main">
				<div className="oa-msg-content">{children}</div>
				{showTimestamp && timestamp ? (
					<div className="oa-msg-time">{new Date(timestamp).toLocaleTimeString()}</div>
				) : null}
			</div>
		</div>
	);
}

export function MessageActions({ children }: { children: ReactNode }) {
	return <div className="oa-msg-actions">{children}</div>;
}

export function MessageAction({
	tooltip,
	onClick,
	children,
}: {
	tooltip: string;
	onClick?: () => void;
	children: ReactNode;
}) {
	return (
		<button className="oa-msg-action" aria-label={tooltip} onClick={onClick}>
			{children}
		</button>
	);
}

export function CopyAction({ getText, tooltip = "Copy" }: { getText: () => string; tooltip?: string }) {
	const [copied, setCopied] = useState(false);
	/* the 1500ms reset must not fire setState on an unmounted action */
	const mounted = useRef(true);
	const timer = useRef<number | null>(null);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			if (timer.current !== null) window.clearTimeout(timer.current);
		};
	}, []);
	return (
		<MessageAction
			tooltip={copied ? "Copied!" : tooltip}
			onClick={() => {
				/* copyText never rejects; a false result means the host blocked
				   every path, so the tooltip must not claim success */
				void copyText(getText()).then((ok) => {
					if (!ok || !mounted.current) return;
					setCopied(true);
					if (timer.current !== null) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => {
						timer.current = null;
						if (mounted.current) setCopied(false);
					}, 1500);
				});
			}}
		>
			{copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
		</MessageAction>
	);
}
