/**
 * Resilience — Hermes-style retry + turn-scoped failover.
 *
 * Retry policy mirrors Hermes' fallback semantics:
 *   429 / 5xx  → retriable (retry with backoff, then consider failover)
 *   401/403/404 → immediate fail (no point retrying auth/not-found)
 *   network/unknown → one conservative retry
 *
 * Failover is turn-scoped: the agent loop may swap to the first configured
 * fallback {provider, model} at most once per run; the next user message
 * starts on the primary again.
 */

import { OpenAgentSettings, ProviderConfig } from "../settings";
import { ProviderHttpError } from "./providers";

export interface FallbackTarget {
	provider: ProviderConfig;
	model: string;
}

export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503]);
export const IMMEDIATE_FAIL_STATUSES: ReadonlySet<number> = new Set([401, 403, 404]);

/** Total attempts (including the first try) granted to one connection. */
export function maxAttempts(err: unknown): number {
	if (err instanceof ProviderHttpError) {
		if (RETRYABLE_STATUSES.has(err.status)) return 3; // 2 retries
		if (IMMEDIATE_FAIL_STATUSES.has(err.status)) return 1; // no retry
	}
	return 2; // network/unknown → a single retry
}

/* Test hook: the suite scales sleeps down to zero; production keeps 1×. */
let backoffScale = 1;
export function setBackoffScale(scale: number): void {
	backoffScale = scale;
}

/** Exponential backoff (1s, 3s, …) between attempts. */
export function backoffMs(attempt: number): number {
	const base = attempt === 1 ? 1000 : 3000;
	return base * backoffScale;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/** Providers that accept connections without an API key (local / open). */
const KEYLESS_OK = new Set(["lmstudio", "ollama", "custom"]);

export function providerUsable(p: ProviderConfig | undefined): p is ProviderConfig {
	return !!p && !!p.baseUrl && (!!p.apiKey || KEYLESS_OK.has(p.id));
}

export interface ResilienceRetryInfo {
	targetIndex: number;
	/** attempt yang baru gagal (1-based); 0 = hop failover ke target ini */
	attempt: number;
	error: unknown;
}

/**
 * attemptWithResilience — loop retry+failover sebagai helper mandiri
 * (v0.1.92, dipakai Quick Ask; prinsip = bagian atas file ini):
 * per target, retry selama `attempt < maxAttempts(err)` dengan jeda
 * backoffMs; habis itu pindah ke target berikutnya. Failover tetap
 * turn-scoped — CALLER yang membatasi jumlah target (Quick Ask: maks 2).
 * Abort memutus sebelum attempt berikutnya. onRetry dipanggil SEBELUM
 * setiap hop retry ATAU failover supaya host bisa me-reset stream
 * parsial (attempt yang sudah streaming-lalu-gagal tak boleh nyambung).
 */
export async function attemptWithResilience<T>(
	targets: readonly (() => Promise<T>)[],
	opts: { signal?: AbortSignal; onRetry?: (info: ResilienceRetryInfo) => void } = {}
): Promise<T> {
	if (targets.length === 0) throw new Error("no targets");
	let lastErr: unknown = null;
	for (let t = 0; t < targets.length; t++) {
		if (t > 0) opts.onRetry?.({ targetIndex: t, attempt: 0, error: lastErr });
		let attempt = 0;
		for (;;) {
			if (opts.signal?.aborted) {
				throw opts.signal.reason instanceof Error ? opts.signal.reason : new Error("aborted");
			}
			attempt++;
			try {
				return await targets[t]();
			} catch (err) {
				lastErr = err;
				if (opts.signal?.aborted) throw err;
				if (attempt < maxAttempts(err)) {
					opts.onRetry?.({ targetIndex: t, attempt, error: err });
					await sleep(backoffMs(attempt));
					continue;
				}
				break; // attempts target ini habis → failover ke target berikutnya
			}
		}
	}
	throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Resolve the fallback chain to concrete targets, dropping entries whose
 * provider is missing/unconfigured or whose model is blank — mirroring
 * Hermes ("entries missing either field are ignored").
 */
export function resolveFallbacks(settings: OpenAgentSettings): FallbackTarget[] {
	const out: FallbackTarget[] = [];
	for (const entry of settings.fallbackProviders ?? []) {
		const provider = settings.providers.find((x) => x.id === entry.providerId);
		const model = (entry.model ?? "").trim();
		if (!model || !providerUsable(provider)) continue;
		out.push({ provider, model });
	}
	return out;
}
