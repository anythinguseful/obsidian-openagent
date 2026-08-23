/**
 * prompt-kit · feedback-bar
 * Ported from ibelick/prompt-kit (components/prompt-kit/feedback-bar.tsx) —
 * faithful shape, owner-verified 2026-08-02 (picked over the deviated
 * row-pair adaptation): inline-flex border card; title left; the Helpful /
 * Not helpful ghost button pair (size-8 shells, size-4 icons, rounded-md,
 * muted → foreground on hover); Close behind a leading border. Tailwind
 * classes are translated to Obsidian CSS variables; lucide icons resolve
 * through Obsidian's built-in Icon set.
 *
 * The host (ChatApp) owns visibility policy: the banner shows under a
 * finished assistant answer until the user picks a side (choice persists
 * as turn.reaction = "up"|"down") or closes it (turn.feedbackDismissed).
 * The official component itself stays a pure presentational callback
 * surface — no state, exactly like upstream.
 */

import { ReactNode } from "react";
import { ThumbsDownIcon, ThumbsUpIcon, XIcon } from "../icons";

export type FeedbackValue = "up" | "down";

type FeedbackBarProps = {
	className?: string;
	title: string;
	icon?: ReactNode;
	onHelpful?: () => void;
	onNotHelpful?: () => void;
	onClose?: () => void;
};

export function FeedbackBar({ className = "", title, icon, onHelpful, onNotHelpful, onClose }: FeedbackBarProps) {
	return (
		<div className={`oa-feedback-bar ${className}`.trim()}>
			<div className="oa-feedback-title">
				{icon}
				<span>{title}</span>
			</div>
			<div className="oa-feedback-btns">
				<button type="button" className="oa-feedback-btn" aria-label="Helpful" onClick={onHelpful}>
					<ThumbsUpIcon size={16} />
				</button>
				<button type="button" className="oa-feedback-btn" aria-label="Not helpful" onClick={onNotHelpful}>
					<ThumbsDownIcon size={16} />
				</button>
			</div>
			<div className="oa-feedback-close-col">
				<button type="button" className="oa-feedback-close" aria-label="Close" onClick={onClose}>
					<XIcon size={20} />
				</button>
			</div>
		</div>
	);
}
