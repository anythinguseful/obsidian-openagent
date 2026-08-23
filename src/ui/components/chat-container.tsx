/**
 * prompt-kit · ChatContainer
 * Ported from ibelick/prompt-kit (chat-container) with stick-to-bottom
 * behaviour (use-stick-to-bottom logic inlined).
 */

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ScrollButton } from "./scroll-button";

export function ChatContainer({ children }: { children: ReactNode }) {
	const outerRef = useRef<HTMLDivElement>(null);
	const [atBottom, setAtBottom] = useState(true);
	const atBottomRef = useRef(true);
	/* v0.1.160 (A5 BackBottom): unread affordance — new content landed while
	   the user was scrolled up. Cleared when they return to the bottom. */
	const [newBelow, setNewBelow] = useState(false);

	const scrollToBottom = useCallback((smooth = false) => {
		const el = outerRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
	}, []);

	const handleScroll = useCallback(() => {
		const el = outerRef.current;
		if (!el) return;
		const near = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
		atBottomRef.current = near;
		setAtBottom(near);
		if (near) setNewBelow(false);
	}, []);

	/* when content grows: pinned → follow it; away → mark "new below" */
	const onContentGrow = useCallback(() => {
		if (atBottomRef.current) scrollToBottom(false);
		else setNewBelow(true);
	}, [scrollToBottom]);

	// auto-scroll on new content while pinned to bottom
	useEffect(() => {
		const el = outerRef.current;
		if (!el) return;
		const observer = new MutationObserver(onContentGrow);
		observer.observe(el, { childList: true, subtree: true, characterData: true });
		return () => observer.disconnect();
	}, [onContentGrow]);

	/* 2026-08-04 (v0.1.72 prompt-kit audit B1): observe RESIZE too — vault
	   images and other late-loading rich content GROW the log without any
	   DOM mutation, and a mutation-only observer lets the pinned view hang
	   mid-air until some unrelated event scrolls it. use-stick-to-bottom
	   (the official behaviour this file inlines) watches resize for exactly
	   this reason; proven by the dbg-b1b2 repro (pinned view stranded 150px
	   above the grown bottom before this effect existed). */
	useEffect(() => {
		const el = outerRef.current;
		const content = el?.firstElementChild;
		if (!el || !content) return;
		const observer = new ResizeObserver(onContentGrow);
		observer.observe(content);
		return () => observer.disconnect();
	}, [onContentGrow]);

	return (
		<div className="oa-chat-container">
			<div className="oa-chat-scroll" ref={outerRef} onScroll={handleScroll} role="log">
				<div className="oa-chat-content">{children}</div>
			</div>
			<ScrollButton
				visible={!atBottom}
				badge={newBelow}
				onClick={() => {
					setNewBelow(false);
					scrollToBottom(true);
				}}
			/>
		</div>
	);
}
