/**
 * Secret redaction for model-visible content (Hermes security.redact_secrets).
 *
 * Web pages, tool results, and file contents are untrusted and may contain
 * keys/tokens that should never ride to the model. `redactSecretsInText`
 * masks high-confidence secret shapes with a fixed placeholder — deliberately
 * conservative: only patterns with an unmistakable fingerprint are touched,
 * so ordinary prose (and ordinary notes) is never mangled.
 *
 * Pure — unit-testable with plain node.
 */

const REDACTED = "[REDACTED]";

interface Pattern {
	label: string;
	re: RegExp;
}

const PATTERNS: Pattern[] = [
	/* private keys (PEM) — anything between BEGIN and END markers */
	{ label: "private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
	/* OpenAI / generic "sk-" tokens (20+ chars of letters/digits/dash) */
	{ label: "API key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
	/* Google API keys (AIza + 35) */
	{ label: "API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
	/* AWS access key id (AKIA + 16 uppercase/digits) */
	{ label: "AWS key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
	/* GitHub tokens (ghp_/gho_/ghu_/ghr_/ghs_) */
	{ label: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
	/* Slack tokens (xoxb/xoxp/xoxa/xoxr + hyphens) */
	{ label: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
	/* Bearer tokens in Authorization contexts */
	{ label: "Bearer token", re: /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}\b/g },
	/* JWT-ish compact tokens (three base64url segments) — high confidence only */
	{ label: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g },
	/* key=value / key: value secrets with a secret-sounding name */
	{ label: "credential", re: /\b(api[_-]?key|secret|token|password|passwd|authorization)\b\s*[:=]\s*["']?[A-Za-z0-9._~+\/=-]{8,}["']?/gi },
];

export interface RedactResult {
	text: string;
	/** number of distinct spans masked (0 = clean) */
	redactions: number;
}

/** Mask every high-confidence secret shape in `text`. */
export function redactSecretsInText(text: string): RedactResult {
	let out = text;
	let count = 0;
	for (const { re } of PATTERNS) {
		re.lastIndex = 0;
		out = out.replace(re, () => {
			count++;
			return REDACTED;
		});
	}
	return { text: out, redactions: count };
}
