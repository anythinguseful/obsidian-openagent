/**
 * Harness kernel seams (DeepSeek, Phase 4).
 *
 * One driver runs the turn (`AgentLoop`). Request prep (MoA) is a plugin on
 * that driver — it must not grow a second tool-execute path.
 */

import type { ChatMessage } from "../types";
import type { ProviderConfig } from "../settings";

export interface HarnessPreparedIteration {
	wire: ChatMessage[];
	provider: ProviderConfig;
	model: string;
}

/** Per-step wire/connection rewrite. MoaTurnEngine is the first implementation. */
export interface HarnessRequestPrep {
	prepareIteration(wire: ChatMessage[]): Promise<HarnessPreparedIteration>;
}
