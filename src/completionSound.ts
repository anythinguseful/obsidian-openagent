import {
	COMPLETION_SOUND_VARIANT_COUNT,
	DEFAULT_COMPLETION_SOUND_VARIANT,
	type OpenAgentNotificationSettings,
} from "./settings";

export type CompletionSoundResult = "played" | "disabled" | "deduped" | "unsupported" | "blocked" | "error";

export interface CompletionSoundVariant {
	id: number;
	name: string;
	description: string;
}

/** Original, asset-free cues inspired by Hermes' synthesized completion
 * library. Variant 1 is the approved default. */
export const COMPLETION_SOUND_VARIANTS: readonly CompletionSoundVariant[] = [
	{ id: 1, name: "Two-note comfort", description: "A soft resolving two-note chime." },
	{ id: 2, name: "Gentle chime", description: "Three calm ascending tones." },
	{ id: 3, name: "Glass ping", description: "A light, high glass-like confirmation." },
	{ id: 4, name: "Soft marimba", description: "Two short rounded wooden tones." },
	{ id: 5, name: "Bright resolve", description: "A crisp upward answer." },
	{ id: 6, name: "Warm triad", description: "A compact major chord arpeggio." },
	{ id: 7, name: "Quiet bell", description: "One restrained bell with a harmonic." },
	{ id: 8, name: "Rising spark", description: "Four quick rising notes." },
	{ id: 9, name: "Digital bloom", description: "A clean electronic three-note bloom." },
	{ id: 10, name: "Wooden knock", description: "A muted double confirmation." },
	{ id: 11, name: "Celestial fifth", description: "An airy open-fifth resolution." },
	{ id: 12, name: "Tiny fanfare", description: "A compact celebratory cadence." },
	{ id: 13, name: "Deep settle", description: "A low, warm two-tone landing." },
	{ id: 14, name: "Aurora cascade", description: "A delicate descending shimmer." },
] as const;

type Wave = OscillatorType;
interface Tone {
	at: number;
	duration: number;
	frequency: number;
	gain: number;
	wave?: Wave;
	toFrequency?: number;
}

const PLANS: readonly (readonly Tone[])[] = [
	[
		{ at: 0, duration: 0.28, frequency: 523.25, gain: 0.34, wave: "sine" },
		{ at: 0.16, duration: 0.42, frequency: 659.25, gain: 0.32, wave: "sine" },
	],
	[
		{ at: 0, duration: 0.22, frequency: 440, gain: 0.25 },
		{ at: 0.12, duration: 0.25, frequency: 554.37, gain: 0.25 },
		{ at: 0.24, duration: 0.36, frequency: 659.25, gain: 0.28 },
	],
	[
		{ at: 0, duration: 0.48, frequency: 1046.5, gain: 0.23, wave: "sine", toFrequency: 1108.73 },
		{ at: 0.01, duration: 0.25, frequency: 2093, gain: 0.055, wave: "sine" },
	],
	[
		{ at: 0, duration: 0.18, frequency: 392, gain: 0.28, wave: "triangle" },
		{ at: 0.17, duration: 0.23, frequency: 523.25, gain: 0.28, wave: "triangle" },
	],
	[
		{ at: 0, duration: 0.18, frequency: 587.33, gain: 0.22, wave: "triangle", toFrequency: 659.25 },
		{ at: 0.13, duration: 0.36, frequency: 783.99, gain: 0.29, wave: "sine" },
	],
	[
		{ at: 0, duration: 0.42, frequency: 392, gain: 0.2 },
		{ at: 0.08, duration: 0.42, frequency: 493.88, gain: 0.19 },
		{ at: 0.16, duration: 0.46, frequency: 587.33, gain: 0.18 },
	],
	[
		{ at: 0, duration: 0.75, frequency: 698.46, gain: 0.22, wave: "sine" },
		{ at: 0, duration: 0.48, frequency: 1396.91, gain: 0.055, wave: "sine" },
	],
	[
		{ at: 0, duration: 0.14, frequency: 440, gain: 0.18, wave: "triangle" },
		{ at: 0.08, duration: 0.16, frequency: 523.25, gain: 0.2, wave: "triangle" },
		{ at: 0.16, duration: 0.18, frequency: 659.25, gain: 0.2, wave: "triangle" },
		{ at: 0.24, duration: 0.28, frequency: 880, gain: 0.22, wave: "sine" },
	],
	[
		{ at: 0, duration: 0.3, frequency: 329.63, gain: 0.14, wave: "square", toFrequency: 349.23 },
		{ at: 0.1, duration: 0.32, frequency: 493.88, gain: 0.14, wave: "square", toFrequency: 523.25 },
		{ at: 0.2, duration: 0.4, frequency: 739.99, gain: 0.16, wave: "sine" },
	],
	[
		{ at: 0, duration: 0.11, frequency: 196, gain: 0.3, wave: "triangle", toFrequency: 130.81 },
		{ at: 0.14, duration: 0.13, frequency: 261.63, gain: 0.27, wave: "triangle", toFrequency: 174.61 },
	],
	[
		{ at: 0, duration: 0.65, frequency: 523.25, gain: 0.17, wave: "sine" },
		{ at: 0.14, duration: 0.72, frequency: 783.99, gain: 0.18, wave: "sine" },
		{ at: 0.16, duration: 0.46, frequency: 1567.98, gain: 0.035, wave: "sine" },
	],
	[
		{ at: 0, duration: 0.16, frequency: 523.25, gain: 0.2, wave: "triangle" },
		{ at: 0.1, duration: 0.17, frequency: 659.25, gain: 0.2, wave: "triangle" },
		{ at: 0.2, duration: 0.19, frequency: 783.99, gain: 0.2, wave: "triangle" },
		{ at: 0.31, duration: 0.36, frequency: 1046.5, gain: 0.24, wave: "sine" },
	],
	[
		{ at: 0, duration: 0.34, frequency: 196, gain: 0.3, wave: "sine" },
		{ at: 0.2, duration: 0.5, frequency: 261.63, gain: 0.26, wave: "sine" },
	],
	[
		{ at: 0, duration: 0.38, frequency: 987.77, gain: 0.12, wave: "sine" },
		{ at: 0.08, duration: 0.4, frequency: 830.61, gain: 0.14, wave: "sine" },
		{ at: 0.16, duration: 0.42, frequency: 659.25, gain: 0.16, wave: "sine" },
		{ at: 0.24, duration: 0.5, frequency: 523.25, gain: 0.18, wave: "sine" },
	],
] as const;

export function normalizeCompletionSoundVariant(value: unknown): number {
	const n = Math.floor(Number(value));
	return Number.isFinite(n) && n >= 1 && n <= COMPLETION_SOUND_VARIANT_COUNT
		? n
		: DEFAULT_COMPLETION_SOUND_VARIANT;
}

interface AudioContextConstructorLike {
	new (): AudioContext;
}

export interface CompletionSoundEnvironment {
	getConstructor?: () => AudioContextConstructorLike | null;
	now?: () => number;
}

function defaultAudioConstructor(): AudioContextConstructorLike | null {
	try {
		const w = window as typeof window & { webkitAudioContext?: AudioContextConstructorLike };
		return ((w.AudioContext ?? w.webkitAudioContext) as AudioContextConstructorLike | undefined) ?? null;
	} catch {
		return null;
	}
}

/** Per-plugin/vault Web Audio owner. No audio assets or network requests are
 * used; the AudioContext is created lazily on Preview or first completion. */
export class CompletionSoundPlayer {
	private context: AudioContext | null = null;
	private readonly lastPlayedByContext = new Map<string, number>();

	constructor(
		private readonly getSettings: () => OpenAgentNotificationSettings,
		private readonly env: CompletionSoundEnvironment = {}
	) {}

	isSupported(): boolean {
		return !!(this.env.getConstructor ?? defaultAudioConstructor)();
	}

	async playCompletion(contextId: string): Promise<CompletionSoundResult> {
		const settings = this.getSettings();
		if (!settings.completionSoundEnabled) return "disabled";
		const now = (this.env.now ?? Date.now)();
		const last = this.lastPlayedByContext.get(contextId) ?? Number.NEGATIVE_INFINITY;
		if (now - last < 1000) return "deduped";
		const result = await this.play(settings.completionSoundVariant);
		if (result === "played") this.lastPlayedByContext.set(contextId, now);
		return result;
	}

	/** User-gesture Preview bypasses the enabled switch and dedupe. */
	async preview(variant: number): Promise<CompletionSoundResult> {
		return this.play(variant);
	}

	private async play(variant: number): Promise<CompletionSoundResult> {
		try {
			const context = await this.readyContext();
			if (!context) return this.isSupported() ? "blocked" : "unsupported";
			const plan = PLANS[normalizeCompletionSoundVariant(variant) - 1];
			const master = context.createGain();
			master.gain.setValueAtTime(0.22, context.currentTime);
			master.connect(context.destination);
			const base = context.currentTime + 0.015;
			for (const tone of plan) {
				const oscillator = context.createOscillator();
				const envelope = context.createGain();
				const start = base + tone.at;
				const end = start + tone.duration;
				oscillator.type = tone.wave ?? "sine";
				oscillator.frequency.setValueAtTime(tone.frequency, start);
				if (tone.toFrequency) oscillator.frequency.exponentialRampToValueAtTime(tone.toFrequency, end);
				envelope.gain.setValueAtTime(0.0001, start);
				envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, tone.gain), start + Math.min(0.025, tone.duration / 4));
				envelope.gain.exponentialRampToValueAtTime(0.0001, end);
				oscillator.connect(envelope);
				envelope.connect(master);
				oscillator.start(start);
				oscillator.stop(end + 0.02);
			}
			return "played";
		} catch {
			return "error";
		}
	}

	private async readyContext(): Promise<AudioContext | null> {
		const Ctor = (this.env.getConstructor ?? defaultAudioConstructor)();
		if (!Ctor) return null;
		if (!this.context || this.context.state === "closed") this.context = new Ctor();
		if (this.context.state === "suspended") {
			try {
				await this.context.resume();
			} catch {
				return null;
			}
		}
		return this.context.state === "running" ? this.context : null;
	}

	dispose(): void {
		const context = this.context;
		this.context = null;
		this.lastPlayedByContext.clear();
		if (context && context.state !== "closed") void context.close().catch((): void => {});
	}
}
