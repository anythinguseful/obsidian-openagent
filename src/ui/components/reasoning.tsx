/**
 * prompt-kit · Reasoning — faithful port (2026 API) with Open Agent extras.
 *
 * THIS is the component for raw model thinking text (streamed
 * reasoning_content deltas) — prompt-kit's ChainOfThought is for structured
 * step plans, an earlier port wrongly did this job wearing its name.
 *
 * Semantics (per prompt-kit docs):
 *   <Reasoning isStreaming={live}>
 *     <ReasoningTrigger>Thought for 2s</ReasoningTrigger>
 *     <ReasoningContent live={live}>…thinking text…</ReasoningContent>
 *   </Reasoning>
 *
 * 2026-08-02 v0.1.40: the trigger takes ONE finished label ("Thought" /
 * "Thought briefly" / "Thought for Ns", Hermes Desktop verbatim). Never
 * title+meta together — they duplicated the word ("Thought Thought for Ns").
 * The optional `meta` slot stays for unrelated side info, not the duration.
 *
 * - isStreaming=true force-opens the body; when the stream ends it
 *   auto-closes UNLESS the user toggled it manually (their choice then wins).
 * - Open Agent extra: a manual open/closed choice persists per block via
 *   disclosureId, and the live body pins to the bottom under a top fade so
 *   new tokens settle in from below (Hermes Thinking pane).
 */

import { ReactNode, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon } from "../icons";
import { getDisclosure, setDisclosure } from "./disclosure";

interface ReasoningCtx {
	open: boolean;
	setOpen: (open: boolean) => void;
}
const ReasoningContext = createContext<ReasoningCtx | null>(null);

export function Reasoning({
	isStreaming = false,
	disclosureId,
	defaultOpen = true,
	children,
}: {
	isStreaming?: boolean;
	/** When set, the user's manual open/closed choice persists across reloads. */
	disclosureId?: string;
	/** v0.1.150: when false (Appearance → Reasoning collapsed by default),
	 * the body stays closed while streaming until the user opens it. */
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	const persisted = useMemo(() => (disclosureId ? getDisclosure(disclosureId) : undefined), [disclosureId]);
	const [open, setOpenState] = useState(persisted ?? (isStreaming && defaultOpen));
	const userTouched = useRef(persisted !== undefined);

	/* prompt-kit auto-close: end of stream collapses the body again — but a
	   deliberate manual toggle outranks the automation. */
	useEffect(() => {
		if (userTouched.current) return;
		setOpenState(isStreaming && defaultOpen);
	}, [isStreaming, defaultOpen]);

	const setOpen = (o: boolean) => {
		userTouched.current = true;
		if (disclosureId) setDisclosure(disclosureId, o);
		setOpenState(o);
	};

	return (
		<ReasoningContext.Provider value={{ open, setOpen }}>
			<div className={`oa-reasoning${open ? " is-open" : ""}`}>{children}</div>
		</ReasoningContext.Provider>
	);
}

export function ReasoningTrigger({ children, meta }: { children: ReactNode; meta?: string }) {
	const ctx = useContext(ReasoningContext);
	if (!ctx) return null;
	return (
		<button className="oa-reasoning-trigger" aria-expanded={ctx.open} onClick={() => ctx.setOpen(!ctx.open)}>
			<span className="oa-reasoning-bullet" aria-hidden="true" />
			<span className="oa-reasoning-title">{children}</span>
			{meta ? <span className="oa-reasoning-meta">{meta}</span> : null}
			<span className={`oa-reasoning-chevron${ctx.open ? " is-open" : ""}`}>
				<ChevronDownIcon size={13} />
			</span>
		</button>
	);
}

/** Scroll container that keeps the newest tokens in view while streaming. */
function LiveBody({ live, children }: { live: boolean; children: ReactNode }) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!live) return;
		const el = scrollRef.current;
		const content = contentRef.current;
		if (!el || !content) return;
		// RO's guaranteed initial delivery runs with layout already clean, so
		// pinning needs no forced reflow at effect time.
		const pin = () => {
			el.scrollTop = el.scrollHeight;
		};
		const observer = new ResizeObserver(pin);
		observer.observe(content);
		return () => observer.disconnect();
	}, [live]);

	return (
		<div className={`oa-reasoning-body${live ? " is-live" : ""}`} ref={scrollRef}>
			<div ref={contentRef}>{children}</div>
		</div>
	);
}

export function ReasoningContent({ children, live = false }: { children: ReactNode; live?: boolean }) {
	const ctx = useContext(ReasoningContext);
	if (!ctx || !ctx.open) return null;
	return (
		<div className="oa-reasoning-content">
			<LiveBody live={live}>{children}</LiveBody>
		</div>
	);
}
