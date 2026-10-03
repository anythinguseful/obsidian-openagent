/**
 * Inject inbox (DeepSeek seam, Phase 3).
 *
 * Text admitted here lands on the *next* step (top of the agent loop,
 * before the model request). `/steer` is one consumer — same concat and
 * leftover rules as run_agent.py. Hard interrupt clears the inbox.
 */

export class InjectInbox {
	private pending: string | null = null;

	/** Rejects empty; multiple pushes before drain concatenate with "\\n". */
	push(text: string): boolean {
		if (!text || !text.trim()) return false;
		const cleaned = text.trim();
		this.pending = this.pending ? `${this.pending}\n${cleaned}` : cleaned;
		return true;
	}

	drain(): string | null {
		const text = this.pending;
		this.pending = null;
		return text;
	}

	/** Put-back when this step had no tool message to ride. */
	restore(text: string): void {
		this.pending = this.pending ? `${this.pending}\n${text}` : text;
	}

	clear(): void {
		this.pending = null;
	}
}
