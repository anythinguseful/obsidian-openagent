/**
 * Skills Guard — a lightweight port of Hermes' skills_guard scanner.
 *
 * Every external skill (hub, URL) is pattern-scanned before install:
 *   · dangerous → destructive commands, remote-code execution, exfiltration
 *   · caution   → prompt-injection phrasing, safety-tampering, opaque blobs
 *
 * The scanner is intentionally conservative (string heuristics, no exec);
 * verdict + findings drive the install policy in the hub UI:
 * dangerous = explicit typed confirmation, caution = confirm, safe = install.
 */

export interface GuardFinding {
	severity: "dangerous" | "caution";
	file: string;
	line: number | null;
	description: string;
}

export interface GuardReport {
	verdict: "safe" | "caution" | "dangerous";
	findings: GuardFinding[];
}

interface Rule {
	severity: "dangerous" | "caution";
	pattern: RegExp;
	description: string;
}

const RULES: Rule[] = [
	{ severity: "dangerous", pattern: /rm\s+-[a-z]*r[a-z]*f[a-z]*\s+(\/|~|\$HOME|\.)/i, description: "Recursive forced delete on a broad path" },
	{ severity: "dangerous", pattern: /\b(curl|wget)\b[^\n|]*\|\s*(bash|sh|zsh|python[0-9.]*|node|perl|ruby)\b/i, description: "Pipes a remote download straight into an interpreter" },
	{ severity: "dangerous", pattern: /\b(eval|exec)\s*\(\s*(fetch|request|curl|wget)/i, description: "Executes remotely fetched content" },
	{ severity: "dangerous", pattern: /(api[-_ ]?key|token|secret|password|credential)s?[^\n]{0,60}\b(curl|wget|webhook|http POST|exfiltrat|send (it|them|this) to)/i, description: "Reads secrets and sends them somewhere" },
	{ severity: "dangerous", pattern: /\b(webhook\.site|requestbin|hookbin|pipedream\.net)\b/i, description: "Known exfiltration endpoint" },
	{ severity: "dangerous", pattern: /\b(mkfs|dd\s+if=|:(){ :\|:& };:|format\s+[a-z]:)/i, description: "Disk-destructive command" },
	{ severity: "caution", pattern: /ignore (all )?(previous|prior|above) instructions/i, description: "Prompt-injection phrasing" },
	{ severity: "caution", pattern: /(reveal|print|output|leak)[^\n]{0,30}system prompt/i, description: "Asks for the system prompt" },
	{ severity: "caution", pattern: /(disable|bypass|turn off)[^\n]{0,30}(approval|safety|guard|sandbox|filter)/i, description: "Tries to tamper with safety controls" },
	{ severity: "caution", pattern: /\byolo\b/i, description: "References unguarded/unchecked mode" },
	{ severity: "caution", pattern: /base64\s+(--decode|-d|-D)/i, description: "Decodes an opaque base64 payload" },
	{ severity: "caution", pattern: /\b(sudo|osascript|powershell|cmd\.exe)\b/i, description: "Shells out with elevated or OS-level commands" },
	{ severity: "caution", pattern: /\b(chmod\s+[0-7]*7[0-7]{2}|chmod\s+\+x)/i, description: "Marks files executable" },
];

/** Scan text-bearing files of a skill bundle. */
export function scanSkillFiles(files: { path: string; text: string }[]): GuardReport {
	const findings: GuardFinding[] = [];
	for (const f of files) {
		const lines = f.text.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			for (const rule of RULES) {
				if (rule.pattern.test(line)) {
					findings.push({
						severity: rule.severity,
						file: f.path,
						line: i + 1,
						description: rule.description,
					});
				}
			}
		}
		/* opaque long base64 blobs (slide over the whole file — spans lines) */
		const blob = f.text.match(/[A-Za-z0-9+/]{400,}={0,2}/);
		if (blob) {
			findings.push({
				severity: "caution",
				file: f.path,
				line: null,
				description: `Large opaque base64 blob (${blob[0].length} chars)`,
			});
		}
	}
	const verdict = findings.some((f) => f.severity === "dangerous")
		? "dangerous"
		: findings.length > 0
			? "caution"
			: "safe";
	return { verdict, findings };
}

/** Install policy from a verdict (Hermes: community danger is blocked; we require explicit consent). */
export function installPolicy(report: GuardReport): "allow" | "ask" | "block" {
	if (report.verdict === "dangerous") return "block";
	if (report.verdict === "caution") return "ask";
	return "allow";
}
