/**
 * Coalesces transport-level and outer resilience notifications that refer to
 * the same Quick Ask attempt. The UI must clear escaped partial output once,
 * while the next attempt still starts with a fresh reset budget.
 */
export interface AttemptResetGate {
	beginAttempt(): void;
	resetOnce(): void;
}

export function createAttemptResetGate(onReset?: () => void): AttemptResetGate {
	let resetForAttempt = false;
	return {
		beginAttempt() {
			resetForAttempt = false;
		},
		resetOnce() {
			if (resetForAttempt) return;
			resetForAttempt = true;
			onReset?.();
		},
	};
}
