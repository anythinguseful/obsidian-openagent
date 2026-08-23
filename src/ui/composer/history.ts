/**
 * Composer input-history browse (Hermes Desktop parity).
 *
 * Ported from Hermes apps/desktop/src/store/composer-input-history.ts: the
 * user-text ring is DERIVED from the live session messages on each press
 * (single source of truth, no mirror). ArrowUp steps to older prompts;
 * ArrowDown steps back toward the present and restores the draft that was
 * being typed when browsing started.
 */

/** Derive the user-text ring (newest first) from session messages. */
export function deriveUserHistory<T extends { role: string }>(
	messages: readonly T[],
	getText: (m: T) => string
): string[] {
	const out: string[] = [];
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.role !== "user") continue;
		const t = getText(m).trim();
		if (t) out.push(t);
	}
	return out;
}

export interface BrowseForwardResult {
	text: string;
	returnedToPresent: boolean;
}

/**
 * One browse cursor per session. `cursor === -1` means "not browsing".
 * `draftSnapshot` holds the composer text at the moment browsing started, so
 * stepping back down to the present restores it.
 */
export class ComposerHistoryBrowse {
	private cursor = -1;
	private draftSnapshot = "";

	isBrowsing(): boolean {
		return this.cursor >= 0;
	}

	reset(): void {
		this.cursor = -1;
		this.draftSnapshot = "";
	}

	/** Start browsing backward, or step to the next older entry. Returns the
	 *  text to place in the composer, or null when already at the oldest entry
	 *  (or the ring is empty). */
	browseBackward(currentDraft: string, history: readonly string[]): string | null {
		if (history.length === 0) return null;
		if (this.cursor === -1) {
			this.draftSnapshot = currentDraft;
			this.cursor = 0;
		} else if (this.cursor < history.length - 1) {
			this.cursor += 1;
		} else {
			return null;
		}
		return history[this.cursor];
	}

	/** Browse forward toward the present. At the newest entry the saved draft
	 *  is restored and the cursor resets. */
	browseForward(history: readonly string[]): BrowseForwardResult | null {
		if (this.cursor === -1) return null;
		if (this.cursor > 0) {
			this.cursor -= 1;
			return { text: history[this.cursor], returnedToPresent: false };
		}
		const text = this.draftSnapshot;
		this.cursor = -1;
		this.draftSnapshot = "";
		return { text, returnedToPresent: true };
	}
}
