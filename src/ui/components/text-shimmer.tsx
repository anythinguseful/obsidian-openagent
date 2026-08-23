/**
 * prompt-kit · TextShimmer
 * Ported from ibelick/prompt-kit (text-shimmer) — CSS-only version.
 * Faithful API + defaults: `as` (element, default "span"),
 * `duration` (seconds, default 4), `spread` (shine band width %,
 * clamped 5–45, default 20).
 */

import { CSSProperties, ReactNode } from "react";

export function TextShimmer({
	children,
	className = "",
	duration = 4,
	spread = 20,
	as,
}: {
	children: ReactNode;
	className?: string;
	/** seconds per shine sweep — prompt-kit default 4 */
	duration?: number;
	/** shine band width as a % of the text (clamped 5–45) — prompt-kit default 20 */
	spread?: number;
	/** element to render — prompt-kit default "span" */
	as?: "span" | "p" | "div";
}) {
	const style = {
		"--shimmer-duration": `${duration}s`,
		"--shimmer-spread": `${Math.min(45, Math.max(5, spread))}%`,
	} as CSSProperties;
	const Tag = as ?? "span";
	return (
		<Tag className={`oa-text-shimmer ${className}`} style={style}>
			{children}
		</Tag>
	);
}
