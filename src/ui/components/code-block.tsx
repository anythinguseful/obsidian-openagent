/**
 * prompt-kit · CodeBlock
 * Ported from ibelick/prompt-kit (code-block) — faithful compound shape:
 * CodeBlock (container) composes CodeBlockGroup (header row) + CodeBlockCode
 * (pre>code). Open Agent header carries the language label + copy button.
 *
 * Deliberate deviation: official CodeBlockCode highlights via Shiki + a
 * `theme` prop (react-shiki, multi-MB grammar bundle). Shiki is NOT ported —
 * since v0.1.43 a mini regex tokenizer (../highlight.ts) paints the spans,
 * and colors come from Obsidian's official --code-* CSS variables so vault
 * themes keep ownership of the palette.
 */

import { ReactNode, useMemo, useState } from "react";
import { highlightCode } from "../highlight";
import { CheckIcon, CopyIcon } from "../icons";

/** prompt-kit CodeBlockGroup — the header row above the code */
export function CodeBlockGroup({
	children,
	className = "",
}: {
	children: ReactNode;
	className?: string;
}) {
	return <div className={`oa-code-header ${className}`.trim()}>{children}</div>;
}

/**
 * prompt-kit CodeBlockCode — the raw code surface.
 * `language` is exposed as data-language and fed to the mini tokenizer
 * (../highlight.ts); unknown languages and over-budget blocks render plain.
 */
export function CodeBlockCode({
	code,
	language = "text",
	className = "",
}: {
	code: string;
	language?: string;
	className?: string;
}) {
	const tokens = useMemo(() => highlightCode(code, language), [code, language]);
	return (
		<pre className={`oa-code-pre ${className}`.trim()}>
			<code data-language={language}>
				{tokens
					? tokens.map((tok, i) =>
							tok.t === "plain" ? (
								tok.v
							) : (
								<span key={i} className={`oa-tok oa-tok-${tok.t}`}>
									{tok.v}
								</span>
							),
						)
					: code}
			</code>
		</pre>
	);
}

/** prompt-kit CodeBlock — container composing group + code, plus copy UX */
export function CodeBlock({ code, language = "" }: { code: string; language?: string }) {
	return (
		<div className="oa-code-block">
			<CodeBlockGroup>
				<span className="oa-code-lang">{language || "text"}</span>
				<CopyButton code={code} />
			</CodeBlockGroup>
			<CodeBlockCode code={code} language={language || "text"} />
		</div>
	);
}

function CopyButton({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			className="oa-code-copy"
			onClick={() => {
				navigator.clipboard.writeText(code).then(() => {
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1500);
				});
			}}
		>
			{copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
			<span>{copied ? "Copied" : "Copy"}</span>
		</button>
	);
}
