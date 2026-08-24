/**
 * The single sanctioned way to put text on the clipboard.
 *
 * Obsidian runs in a webview: `navigator.clipboard.writeText()` rejects when
 * the document is not focused, when the host blocks the async Clipboard API,
 * and in older webviews where it is missing entirely. Every call site must
 * therefore have a rejection path — a bare `.then()` makes a failed copy
 * indistinguishable from a successful one, and the user pastes stale content
 * believing the copy worked (error/bug sweep 2026-08-24, finding T1).
 *
 * Before this module the repo carried three separately written fallbacks
 * (settings/sections/helpers.ts, settings/modals/profile.ts, settingsTab.ts)
 * and two call sites that had none. Consolidating removes the "write it
 * again" pressure that produced the two misses.
 *
 * NOT consolidated on purpose: ChatApp's `copySelection`. Its fallback runs
 * `document.execCommand("copy")` against the still-live highlight rather than
 * a detached textarea, because there the selection *is* the payload; routing
 * it through here would clear that selection. Different strategy, same
 * contract — it already handles rejection.
 */

/**
 * Copy `text`, falling back to `execCommand` on a detached textarea when the
 * async Clipboard API is unavailable or refuses.
 *
 * Never rejects. Returns whether the text actually reached the clipboard, so
 * callers can avoid claiming success they cannot verify.
 */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		/* fall through to the legacy path */
	}
	try {
		const ta = document.createElement("textarea");
		ta.value = text;
		/* keep the page from scrolling to a visible textarea mid-copy */
		ta.style.position = "fixed";
		ta.style.top = "0";
		ta.style.left = "0";
		ta.style.opacity = "0";
		document.body.appendChild(ta);
		ta.select();
		const ok = document.execCommand("copy");
		ta.remove();
		return ok;
	} catch {
		/* clipboard fully blocked — the caller decides how to degrade */
		return false;
	}
}
