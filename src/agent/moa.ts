/**
 * Mixture-of-Agents (MoA) configuration — Hermes `hermes_cli/moa_config.py`
 * parity port (verified raw 2026-08-01 @ e444d16), plus the Hermes Desktop
 * editor helpers from model-settings.tsx (moaSlotComplete / moaConfigComplete
 * / updateMoaSlot / withActive).
 *
 * Contract (official):
 *  - READ boundary is TOLERANT: normalizeMoaConfig degrades hand-edited junk
 *    to defaults instead of crashing (a hand-edited settings file must never
 *    break the agent).
 *  - WRITE boundary is LOUD: validateMoaPayload lists the problems a
 *    tolerant read would silently paper over; the settings save path refuses
 *    to persist a half-filled slot (official rejects with HTTP 422, #64156).
 *  - Slots may never point at the "moa" virtual provider itself (recursive
 *    MoA tree).
 *
 * Round-tripped but NOT edited by the desktop UI (kept for parity; runtime
 * reads them): reference_temperature / aggregator_temperature /
 * reference_timeout / degraded_reference_policy / max_tokens /
 * reference_max_tokens / fanout / per-slot reasoning_effort + max_tokens.
 *
 * Not ported (no surface writes them upstream either): moa.privacy_filter,
 * moa.save_traces, MOA_MARKER_PREFIX hidden-turn encoding (tui/gateway-only).
 */

export interface MoaSlot {
	provider: string;
	model: string;
	enabled: boolean;
	/** optional per-slot reasoning effort — round-tripped, not edited here */
	reasoning_effort?: string;
	/** optional per-slot advisor output cap — round-tripped, not edited here */
	max_tokens?: number;
}

export interface MoaPreset {
	enabled: boolean;
	reference_models: MoaSlot[];
	aggregator: MoaSlot;
	/** null = temperature omitted from the request (provider default) */
	reference_temperature: number | null;
	aggregator_temperature: number | null;
	/** null = inherit the call timeout (official: auxiliary.moa_reference.timeout, 900s) */
	reference_timeout: number | null;
	degraded_reference_policy: "loud" | "silent";
	/** acting-aggregator output cap (default 4096) */
	max_tokens: number;
	/** null = advisors uncapped */
	reference_max_tokens: number | null;
	/** "user_turn" (default) | "per_iteration" | "every_n:<N>" (N ≥ 2) */
	fanout: string;
}

export interface MoaConfig {
	default_preset: string;
	active_preset: string;
	presets: Record<string, MoaPreset>;
	/* Compatibility/flattened view of the default preset — official shape,
	   kept for callers that predate named presets. */
	reference_models: MoaSlot[];
	aggregator: MoaSlot;
	reference_temperature: number | null;
	aggregator_temperature: number | null;
	reference_timeout: number | null;
	degraded_reference_policy: "loud" | "silent";
	max_tokens: number;
	reference_max_tokens: number | null;
	fanout: string;
	enabled: boolean;
}

export const DEFAULT_MOA_PRESET_NAME = "default";

/* Official starting points (moa_config.py) — kept verbatim; they are editor
   seeds, validity only ever requires a non-empty provider+model pair. */
export const DEFAULT_MOA_REFERENCE_MODELS: { provider: string; model: string }[] = [
	{ provider: "openai-codex", model: "gpt-5.5" },
	{ provider: "openrouter", model: "deepseek/deepseek-v4-pro" },
];

export const DEFAULT_MOA_AGGREGATOR: { provider: string; model: string } = {
	provider: "openrouter",
	model: "anthropic/claude-opus-4.8",
};

export const DEFAULT_MOA_REFERENCE_TIMEOUT: number | null = null;

/* ── coercions (moa_config.py) ─────────────────────────────────────────── */

function asRecord(v: unknown): Record<string, unknown> | null {
	return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function coerceFloatOrNone(value: unknown): number | null {
	/* Optional sampling params: null = don't send — provider default applies,
	   matching how a single-model agent never sends temperature unless set. */
	if (value === null || value === undefined || value === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function coerceReferenceTimeout(value: unknown): number | null {
	/* Finite positive per-preset advisor timeout; anything else = inherit. */
	if (value === null || value === undefined || value === "" || typeof value === "boolean") {
		return DEFAULT_MOA_REFERENCE_TIMEOUT;
	}
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) return DEFAULT_MOA_REFERENCE_TIMEOUT;
	return n;
}

function coerceDegradedPolicy(value: unknown): "loud" | "silent" {
	/* Unknown values fail loud, mirroring official. */
	const v = String(value ?? "loud").trim().toLowerCase();
	return v === "silent" || v === "loud" ? v : "loud";
}

function coerceInt(value: unknown, dflt: number): number {
	if (value === null || value === undefined || value === "") return dflt;
	const n = Number(value);
	return Number.isFinite(n) ? Math.trunc(n) : dflt;
}

function coerceIntOrNone(value: unknown): number | null {
	/* Optional caps: null = no cap (the safe default). */
	if (value === null || value === undefined || value === "") return null;
	const n = Number(value);
	if (!Number.isFinite(n)) return null;
	const i = Math.trunc(n);
	return i > 0 ? i : null;
}

export function coerceMoaFanout(value: unknown): string {
	/* Canonical: "per_iteration" | "user_turn" | "every_n:<N>" (N ≥ 2).
	   Mapping form {mode:"every_n", n:N} normalizes to the string; every_n:1
	   collapses to per_iteration; junk → "user_turn" (cheapest cadence). */
	if (asRecord(value)) {
		const rec = value as Record<string, unknown>;
		const mode = String(rec.mode ?? "").trim().toLowerCase();
		if (mode === "every_n") {
			const n = coerceInt(rec.n, 0);
			if (n >= 2) return `every_n:${n}`;
			return n === 1 ? "per_iteration" : "user_turn";
		}
		value = mode;
	}
	const mode = String(value ?? "").trim().toLowerCase();
	if (mode === "per_iteration" || mode === "user_turn") return mode;
	if (mode.startsWith("every_n")) {
		const sep = mode.indexOf(":");
		const n = sep >= 0 ? coerceInt(mode.slice(sep + 1).trim(), 0) : 0;
		if (n >= 2) return `every_n:${n}`;
		if (n === 1) return "per_iteration";
	}
	return "user_turn";
}

function coerceBool(value: unknown, dflt = true): boolean {
	if (value === null || value === undefined) return dflt;
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const t = value.trim().toLowerCase();
		if (["0", "false", "no", "off"].includes(t)) return false;
		if (["1", "true", "yes", "on"].includes(t)) return true;
		return dflt;
	}
	return Boolean(value);
}

function cleanReasoningEffort(value: unknown): string | null {
	/* Canonical per-slot effort (hermes_constants.parse_reasoning_effort):
	   None/True → unset; False/"none"/"false"/"disabled" → "none"; a valid
	   level → itself; anything else → unset. */
	if (value === null || value === undefined || value === true) return null;
	if (value === false) return "none";
	const t = String(value).trim().toLowerCase();
	if (!t) return null;
	if (["none", "false", "disabled"].includes(t)) return "none";
	if (["minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(t)) return t;
	return null;
}

function cleanSlot(slot: unknown, includeEnabled = false): MoaSlot | null {
	const rec = asRecord(slot);
	if (!rec) return null;
	const provider = String(rec.provider ?? "").trim();
	const model = String(rec.model ?? "").trim();
	if (!provider || !model) return null;
	/* A MoA preset as its own reference/aggregator = recursive MoA tree —
	   reject at the boundary so it can never be saved. */
	if (provider.toLowerCase() === "moa") return null;
	const clean: MoaSlot = { provider, model, enabled: true };
	const effort = cleanReasoningEffort(rec.reasoning_effort);
	if (effort) clean.reasoning_effort = effort;
	const mt = coerceIntOrNone(rec.max_tokens);
	if (mt !== null) clean.max_tokens = mt;
	if (includeEnabled) clean.enabled = coerceBool(rec.enabled, true);
	return clean;
}

export function moaSlotProblem(slot: unknown): string | null {
	/* Human-readable problem for a slot cleanSlot would drop; null = valid.
	   Mirrors cleanSlot exactly so the write validator and the tolerant read
	   can never disagree (official contract). */
	const rec = asRecord(slot);
	if (!rec) return "must be an object with 'provider' and 'model'";
	const provider = String(rec.provider ?? "").trim();
	const model = String(rec.model ?? "").trim();
	if (!provider && !model) return "provider and model are required";
	if (!provider) return "provider is required";
	if (!model) return `model is required (provider '${provider}' has no model selected)`;
	if (provider.toLowerCase() === "moa") {
		return "the Mixture of Agents provider cannot be used inside a preset (recursive MoA)";
	}
	return null;
}

/* ── presets ───────────────────────────────────────────────────────────── */

export function defaultMoaPreset(): MoaPreset {
	return {
		reference_models: DEFAULT_MOA_REFERENCE_MODELS.map((s) => ({ ...s, enabled: true })),
		aggregator: { ...DEFAULT_MOA_AGGREGATOR, enabled: true },
		reference_temperature: null,
		aggregator_temperature: null,
		reference_timeout: DEFAULT_MOA_REFERENCE_TIMEOUT,
		degraded_reference_policy: "loud",
		max_tokens: 4096,
		reference_max_tokens: null,
		fanout: "user_turn",
		enabled: true,
	};
}

export function normalizeMoaPreset(raw: unknown): MoaPreset {
	let rec = asRecord(raw) ?? {};
	let rawRefs: unknown = rec.reference_models;
	/* reference_models may arrive as a JSON string (hand-edited config). */
	if (typeof rawRefs === "string") {
		try {
			rawRefs = JSON.parse(rawRefs);
		} catch {
			rawRefs = [];
		}
	}
	if (!Array.isArray(rawRefs)) {
		/* A scalar / single mapping degrades to defaults, never a crash. */
		rawRefs = asRecord(rawRefs) ? [rawRefs] : [];
	}
	let refs = (rawRefs as unknown[]).map((item) => cleanSlot(item, true)).filter((x): x is MoaSlot => x !== null);
	if (refs.length === 0) refs = defaultMoaPreset().reference_models;
	const aggregator = cleanSlot(rec.aggregator) ?? { ...DEFAULT_MOA_AGGREGATOR, enabled: true };
	return {
		enabled: coerceBool(rec.enabled, true),
		reference_models: refs,
		aggregator,
		reference_temperature: coerceFloatOrNone(rec.reference_temperature),
		aggregator_temperature: coerceFloatOrNone(rec.aggregator_temperature),
		reference_timeout: coerceReferenceTimeout(rec.reference_timeout),
		degraded_reference_policy: coerceDegradedPolicy(rec.degraded_reference_policy),
		max_tokens: coerceInt(rec.max_tokens, 4096),
		reference_max_tokens: coerceIntOrNone(rec.reference_max_tokens),
		fanout: coerceMoaFanout(rec.fanout),
	};
}

/**
 * Tolerant READ boundary — always returns a usable config with at least the
 * default preset. Backward compatible with the legacy flat shape where the
 * top level itself carried reference_models/aggregator.
 */
export function normalizeMoaConfig(raw: unknown): MoaConfig {
	const rec = asRecord(raw) ?? {};
	const presetsRaw = asRecord(rec.presets);
	const presets: Record<string, MoaPreset> = {};
	if (presetsRaw) {
		for (const [name, preset] of Object.entries(presetsRaw)) {
			const clean = String(name ?? "").trim();
			if (clean) presets[clean] = normalizeMoaPreset(preset);
		}
	}
	/* Legacy flat config becomes the default preset. */
	if (Object.keys(presets).length === 0) presets[DEFAULT_MOA_PRESET_NAME] = normalizeMoaPreset(rec);

	let defaultName = String(rec.default_preset ?? "").trim();
	if (!defaultName || !(defaultName in presets)) defaultName = Object.keys(presets)[0] ?? DEFAULT_MOA_PRESET_NAME;
	if (!(defaultName in presets)) presets[defaultName] = defaultMoaPreset();

	let activeName = String(rec.active_preset ?? "").trim();
	if (!(activeName in presets)) activeName = "";

	const active = presets[defaultName];
	return {
		default_preset: defaultName,
		active_preset: activeName,
		presets,
		reference_models: active.reference_models.map((s) => ({ ...s })),
		aggregator: { ...active.aggregator },
		reference_temperature: active.reference_temperature,
		aggregator_temperature: active.aggregator_temperature,
		reference_timeout: active.reference_timeout,
		degraded_reference_policy: active.degraded_reference_policy,
		max_tokens: active.max_tokens,
		reference_max_tokens: active.reference_max_tokens,
		fanout: active.fanout,
		enabled: active.enabled,
	};
}

/**
 * LOUD WRITE boundary — the problems normalizeMoaConfig would silently
 * repair. An empty list means safe to save; the settings save path refuses
 * to persist anything else (official: HTTP 422, #64156).
 */
export function validateMoaPayload(raw: unknown): string[] {
	const rec = asRecord(raw);
	if (!rec) return ["MoA config must be an object"];
	const problems: string[] = [];
	const presetsRaw = asRecord(rec.presets);
	if (presetsRaw) {
		for (const [name, preset] of Object.entries(presetsRaw)) {
			const label = String(name ?? "").trim() || "(unnamed)";
			if (!asRecord(preset)) {
				problems.push(`preset '${label}': must be an object`);
				continue;
			}
			problems.push(...validateOnePreset(label, preset));
		}
		if (Object.keys(presetsRaw).length > 0) return problems;
	}
	/* legacy flat shape */
	problems.push(...validateOnePreset(DEFAULT_MOA_PRESET_NAME, rec));
	return problems;
}

function validateOnePreset(label: string, preset: unknown): string[] {
	const rec = asRecord(preset) ?? {};
	const problems: string[] = [];
	/* Official validate does NOT json-parse a string here: only a list —
	   or a single mapping, wrapped — counts (moa_config.py validate_moa_
	   payload). Anything else = zero complete refs. */
	let rawRefs: unknown = rec.reference_models;
	if (!Array.isArray(rawRefs)) rawRefs = asRecord(rawRefs) ? [rawRefs] : [];
	const refs = rawRefs as unknown[];
	let completeRefs = 0;
	refs.forEach((slot, i) => {
		const p = moaSlotProblem(slot);
		if (p) problems.push(`preset '${label}' reference ${i + 1}: ${p}`);
		else completeRefs += 1;
	});
	if (completeRefs === 0) problems.push(`preset '${label}': needs at least one complete reference model`);
	const agg = moaSlotProblem(rec.aggregator);
	if (agg) problems.push(`preset '${label}' aggregator: ${agg}`);
	return problems;
}

export function listMoaPresets(config: unknown): string[] {
	return Object.keys(normalizeMoaConfig(config).presets);
}

export function resolveMoaPreset(config: unknown, name?: string | null): MoaPreset {
	const cfg = normalizeMoaConfig(config);
	const presetName = String(name ?? cfg.default_preset ?? DEFAULT_MOA_PRESET_NAME).trim();
	const preset = cfg.presets[presetName];
	if (!preset) {
		const available = Object.keys(cfg.presets).join(", ") || "(none)";
		throw new Error(`MoA preset '${presetName}' was not found. Available presets: ${available}. Run \`hermes moa list\`.`);
	}
	return JSON.parse(JSON.stringify(preset)) as MoaPreset;
}

/**
 * Bare-name implicit match (official exact_moa_preset_name): a plain
 * `/model <name>` switches onto MoA only when the name EXACTLY matches an
 * ENABLED preset — a disabled preset must never silently pivot the session
 * (issue #55187). Explicit picker selection does not go through here.
 */
export function exactMoaPresetName(config: unknown, text: unknown): string | null {
	const wanted = String(text ?? "").trim();
	if (!wanted) return null;
	const cfg = normalizeMoaConfig(config);
	const preset = cfg.presets[wanted];
	if (!preset || preset.enabled === false) return null;
	return wanted;
}

export function setActiveMoaPreset(config: unknown, name: string | null): MoaConfig {
	const cfg = normalizeMoaConfig(config);
	const clean = String(name ?? "").trim();
	if (clean && !(clean in cfg.presets)) throw new Error(clean);
	cfg.active_preset = clean;
	return cfg;
}

/* ── Hermes Desktop editor helpers (model-settings.tsx) ────────────────── */

/** Provider change intentionally clears the model (models are per-provider);
    a same-provider update must not wipe it. */
export function updateMoaSlot(slot: MoaSlot, patch: Partial<MoaSlot>): MoaSlot {
	const next = { ...slot, ...patch };
	if (patch.provider && patch.provider !== slot.provider) next.model = "";
	return next;
}

/** The current value rides the option list even when it isn't in the
    provider's catalog (e.g. an official default seed like "openai-codex"). */
export function withActiveOption(options: string[], active: string): string[] {
	return active && !options.includes(active) ? [active, ...options] : options;
}

/** A slot is complete when both halves are chosen. */
export function moaSlotComplete(slot: MoaSlot): boolean {
	return !!(slot.provider.trim() && slot.model.trim());
}

/** True when every slot in every preset is fully specified — the ONLY state
    that is safe to persist (the autosave waits for the edit to finish rather
    than repairing the payload, desktop parity). */
export function moaConfigComplete(config: MoaConfig): boolean {
	return Object.values(config.presets).every(
		(preset) => preset.reference_models.length > 0 && preset.reference_models.every(moaSlotComplete) && moaSlotComplete(preset.aggregator)
	);
}

/** Official one-shot usage line (cli.py / tui_gateway). */
export function moaUsage(): string {
	return "Usage: /moa <prompt>  (runs one prompt through the default MoA preset, then restores your model; pick a preset from the model picker to switch for the session)";
}
