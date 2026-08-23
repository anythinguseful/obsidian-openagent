/**
 * prompt-kit · ScrollButton
 * Ported from ibelick/prompt-kit (scroll-button). v0.1.160 adds the
 * lobe-ui BackBottom unread affordance: an optional dot badge that marks
 * "new content arrived while you were scrolled up" (no fake count — a dot
 * is the honest signal at this scope).
 */

import { ChevronDownIcon } from "../icons";

export function ScrollButton({
	visible,
	onClick,
	badge = false,
}: {
	visible: boolean;
	onClick: () => void;
	/** v0.1.160: show the unread dot (new content arrived while away from bottom). */
	badge?: boolean;
}) {
	/* 2026-08-04 (v0.1.73 prompt-kit audit B4): official behaviour — kept
	   MOUNTED with an opacity/translate fade and pointer-events gating, so
	   the button eases in/out instead of popping into existence. The class
	   toggle keeps the old props contract (visible, onClick) unchanged. */
	return (
		<button
			className={`oa-scroll-button${visible ? "" : " is-hidden"}`}
			onClick={onClick}
			aria-label={badge ? "Scroll to bottom — new messages" : "Scroll to bottom"}
			aria-hidden={!visible || undefined}
			tabIndex={visible ? 0 : -1}
		>
			<ChevronDownIcon size={14} />
			{badge && visible ? <span className="oa-scroll-button-dot" aria-hidden="true" /> : null}
		</button>
	);
}

