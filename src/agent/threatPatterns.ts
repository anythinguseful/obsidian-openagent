/**
 * Threat patterns — the single source of truth for injection / exfiltration /
 * secret-variable shapes in content that gets injected into the system prompt.
 *
 * Mirrors Hermes `tools/threat_patterns.py`: shared by the cron-prompt scanner
 * and the memory-content scanner so both judge the same way. Kept conservative
 * — these are obvious, high-confidence shapes, not style heuristics.
 */

/** Secret-variable shape (Hermes `_CRON_SECRET_VAR_RE`): ${KEY}, $TOKEN, … */
export const SECRET_VAR_RE = /\$\{?\w*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)\w*\}?/;

/** High-confidence exfil shapes that never belong in unattended/model-visible
 * content. */
export const EXFIL_PATTERNS: RegExp[] = [
	/(^|\s)(cat|curl|wget)\s+.*\.env/i,
	/(\.ssh\/id_|\.aws\/credentials|\.gnupg\/(secret|private))/i,
	/(base64\s+(-d|--decode)|eval\s*\(|process\.env|os\.environ)/i,
];

/** Direct prompt-injection instructions. */
export const INJECTION_PATTERNS: RegExp[] = [
	/ignore\s+(all\s+)?previous\s+instructions/i,
	/reveal\s+your\s+(system\s+)?prompt/i,
	/disregard\s+your\s+training/i,
];

/** First matching threat category, or null when the text is clean. */
export function firstThreatMessage(text: string): string | null {
	if (SECRET_VAR_RE.test(text)) return "secret-like variable/pattern";
	for (const re of EXFIL_PATTERNS) {
		if (re.test(text)) return "shell/credential-exfiltration pattern";
	}
	for (const re of INJECTION_PATTERNS) {
		if (re.test(text)) return "prompt-injection instruction";
	}
	return null;
}
