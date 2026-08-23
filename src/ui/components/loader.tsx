/**
 * prompt-kit · Loader
 * Ported from ibelick/prompt-kit (loader) — CSS-animated variants.
 * Full official variant set (12) + sizes sm/md/lg. Open Agent keeps
 * "typing" as the DEFAULT variant (every existing call site passes an
 * explicit variant anyway); the official default is "circular".
 */

import { TextShimmer } from "./text-shimmer";

export type LoaderVariant =
	| "circular"
	| "classic"
	| "pulse"
	| "pulse-dot"
	| "dots"
	| "typing"
	| "wave"
	| "bars"
	| "terminal"
	| "text-blink"
	| "text-shimmer"
	| "loading-dots";

export type LoaderSize = "sm" | "md" | "lg";

export function Loader({
	variant = "typing",
	text = "Thinking",
	size = "md",
}: {
	variant?: LoaderVariant;
	text?: string;
	size?: LoaderSize;
}) {
	const cls = (base: string) => `${base} oa-loader-${size}`;
	switch (variant) {
		case "circular":
			return <span className={cls("oa-loader-circular")} aria-label={text} />;
		case "classic":
			return <span className={cls("oa-loader-classic")} aria-label={text} />;
		case "pulse":
			return (
				<span className={cls("oa-loader-pulse")} aria-label={text}>
					<span />
					<span />
				</span>
			);
		case "pulse-dot":
			return (
				<span className={cls("oa-loader-pulse-dot")} aria-label={text}>
					<span className="oa-loader-pulse-dot-core" />
					<span className="oa-loader-pulse-dot-ring" />
				</span>
			);
		case "dots":
			return (
				<span className={cls("oa-loader-dots")} aria-label={text}>
					<span /> <span /> <span />
				</span>
			);
		case "wave":
			return (
				<span className={cls("oa-loader-wave")} aria-label={text}>
					<span /> <span /> <span /> <span /> <span />
				</span>
			);
		case "bars":
			return (
				<span className={cls("oa-loader-bars")} aria-label={text}>
					<span /> <span /> <span /> <span /> <span />
				</span>
			);
		case "terminal":
			return (
				<span className={cls("oa-loader-terminal")} aria-label={text}>
					<span className="oa-loader-terminal-prompt">&gt;</span>
					<span className="oa-loader-terminal-block" />
				</span>
			);
		case "text-blink":
			return (
				<span className={cls("oa-loader-text-blink")} aria-label={text}>
					{text}
				</span>
			);
		case "text-shimmer":
			return <TextShimmer className={cls("oa-loader-text")}>{text}…</TextShimmer>;
		case "loading-dots":
			return (
				<span className={cls("oa-loader-loading-dots")} aria-label={text}>
					{text}
					<span className="oa-loader-loading-dot">.</span>
					<span className="oa-loader-loading-dot">.</span>
					<span className="oa-loader-loading-dot">.</span>
				</span>
			);
		default: // typing
			return (
				<span className={cls("oa-loader-typing")} aria-label={text}>
					<span /> <span /> <span />
				</span>
			);
	}
}
