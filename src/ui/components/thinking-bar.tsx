/**
 * prompt-kit · ThinkingBar
 * Ported from ibelick/prompt-kit (thinking-bar) — slim bar shown while the
 * model is in its thinking phase (before the first content token). Shimmer
 * text, optional stop affordance ("Answer now").
 */

import { TextShimmer } from "./text-shimmer";

export function ThinkingBar({
	text = "Thinking",
	onStop,
	stopLabel = "Answer now",
}: {
	text?: string;
	onStop?: () => void;
	stopLabel?: string;
}) {
	return (
		<div className="oa-thinking-bar">
			<TextShimmer className="oa-thinking-bar-text" duration={1.4}>
				{text}
			</TextShimmer>
			{onStop ? (
				/* official prompt-kit skin: quiet dotted-underline text button
				   pinned to the bar's right edge (justify-between) — no pill, no
				   chevron (verified against prompt-kit main, 2026-08-07) */
				<button className="oa-thinking-bar-stop" onClick={onStop} aria-label={stopLabel}>
					{stopLabel}
				</button>
			) : null}
		</div>
	);
}
