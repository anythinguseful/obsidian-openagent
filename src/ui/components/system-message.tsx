/**
 * prompt-kit · SystemMessage
 * Ported from ibelick/prompt-kit (system-message.tsx), verified raw
 * 2026-08-02: a quiet bordered row for system-level notes — per-variant
 * default icons (info / triangle-alert / circle-alert), text-sm body,
 * optional CTA on the right.
 * Documented divergences (same honesty rule as the changed-files card):
 *  - no `fill` prop — prompt-kit's own default (fill=false, border only)
 *    is the single chrome we ship; variants change text+border colour only.
 *  - tailwind/cva classes → Obsidian CSS vars + oa- prefixed styles.
 *  - icon override API kept as `isIconHidden` only (no custom node slot —
 *    every notice here uses the variant's default glyph).
 */

import { ReactElement, ReactNode } from "react";
import { AlertCircleIcon, AlertIcon, InfoIcon } from "../icons";

export type SystemMessageVariant = "action" | "warning" | "error";

const VARIANT_ICON = {
	action: InfoIcon,
	warning: AlertIcon,
	error: AlertCircleIcon,
} as const;

export function SystemMessage({
	variant = "action",
	isIconHidden = false,
	cta,
	children,
}: {
	variant?: SystemMessageVariant;
	isIconHidden?: boolean;
	/** prompt-kit `cta` — label + click; on the right edge, small button */
	cta?: { label: string; onClick: () => void };
	children: ReactNode;
}): ReactElement {
	const IconGlyph = VARIANT_ICON[variant];
	return (
		<div className={`oa-sysmsg oa-sysmsg-${variant}`} data-role="system">
			{!isIconHidden ? (
				<span className="oa-sysmsg-icon" aria-hidden="true">
					<IconGlyph size={16} />
				</span>
			) : null}
			<div className="oa-sysmsg-body">{children}</div>
			{cta ? (
				<button type="button" className="oa-sysmsg-cta" onClick={cta.onClick} aria-label={cta.label}>
					{cta.label}
				</button>
			) : null}
		</div>
	);
}
