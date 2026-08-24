/**
 * prompt-kit · Markdown
 * API-compatible with ibelick/prompt-kit's markdown component, backed by
 * Obsidian's own MarkdownRenderer so callouts, wikilinks, tables and
 * code fences render exactly like the rest of the vault.
 *
 * MarkdownDoc = the chat-facing renderer: prose goes through Obsidian,
 * fenced code blocks go through prompt-kit's CodeBlock (language header +
 * copy button) — per docs/plans/markdown-rendering-plan.md.
 *
 * Before render, assistant text passes through markdown-preprocess
 * (Copilot parity): executable fences neutralised, LaTeX \[ \] / \( \)
 * normalised to $$/$, and ![[vault images]] resolved to resource paths.
 */

import { App, Component, MarkdownRenderer } from "obsidian";
import { useEffect, useMemo, useRef } from "react";
import { splitMarkdownSegments } from "../markdown-segments";
import {
	guardAssistantDiagramRemoteMedia,
	guardAssistantRemoteMedia,
	preprocessAIResponse,
	resolveVaultImages,
	sanitizeMermaidSrc,
} from "../markdown-preprocess";
import { CodeBlock } from "./code-block";

/* 2026-08-02 v0.1.41 — diagram fences (mermaid) must NOT become a code card:
   they go THROUGH Obsidian's renderer, whose own postprocessor replaces the
   fence with the rendered diagram (Hermes Desktop parity: its markdown router
   sends ```mermaid / ```svg fences to dedicated renderers, every other
   language to the code block). */
const DIAGRAM_LANGS = new Set(["mermaid"]);

export function Markdown({
	children,
	app,
	component,
	sourcePath = "",
}: {
	children: string;
	app: App;
	component: Component;
	sourcePath?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.empty();
		// required for Obsidian's markdown typography (paragraph/heading spacing)
		el.addClass("markdown-rendered");
		const processed = resolveVaultImages(guardAssistantRemoteMedia(preprocessAIResponse(children ?? "")), app, sourcePath);
		/* A rejected render would otherwise leave a silently blank message
		   bubble; fall back to plain text so the content is never lost. */
		void MarkdownRenderer.render(app, processed, el, sourcePath, component).catch(() => {
			el.setText(processed);
		});
		/* chat panes live outside the workspace link handler — wire clicks
		   ourselves: [[wikilinks]] open the note, http(s) opens the browser */
		el.onclick = (ev) => {
			const a = (ev.target as HTMLElement).closest("a");
			if (!a) return;
			ev.preventDefault();
			ev.stopPropagation();
			const href = a.getAttribute("href") || "";
			const internal = a.classList.contains("internal-link") || a.dataset.href !== undefined;
			if (internal) {
				const linktext = (a.dataset.href || href).replace(/^\[\[|\]\]$/g, "");
				void app.workspace?.openLinkText?.(linktext, sourcePath);
			} else if (/^https?:\/\//i.test(href)) {
				window.open(href);
			}
		};
	}, [children, app, component, sourcePath]);

	return <div className="oa-markdown" ref={ref} />;
}

/** Renders assistant text: md segments via Obsidian, code fences via CodeBlock. */
export function MarkdownDoc({
	children,
	app,
	component,
	sourcePath = "",
}: {
	children: string;
	app: App;
	component: Component;
	sourcePath?: string;
}) {
	const segments = useMemo(() => splitMarkdownSegments(children ?? ""), [children]);
	if (segments.length === 1 && segments[0].kind === "md") {
		return (
			<Markdown app={app} component={component} sourcePath={sourcePath}>
				{segments[0].content}
			</Markdown>
		);
	}
	return (
		<>
			{segments.map((seg, i) => {
				/* diagram fence → re-emit the fence into Obsidian's own pipeline so
				   its mermaid postprocessor renders the diagram (never the code
				   card). Fence char avoids clashing with body backticks. */
				if (
					seg.kind === "code" &&
					seg.closed &&
					!seg.malformed &&
					seg.lang &&
					DIAGRAM_LANGS.has(seg.lang.trim().toLowerCase())
				) {
					const fence = seg.content.includes("```") ? "~~~" : "```";
					{/* v0.1.107: salvage LLM mermaid quirks (bare emoji subgraph
					    titles) before Obsidian's renderer meets mermaid's
					    lexer — invalid input would explode in the console
					    with jison's misleading excerpt. Idempotent. */}
					return (
						<Markdown key={`dg-${i}`} app={app} component={component} sourcePath={sourcePath}>
							{`${fence}${seg.lang}\n${sanitizeMermaidSrc(guardAssistantDiagramRemoteMedia(seg.content))}\n${fence}`}
						</Markdown>
					);
				}
				return seg.kind === "code" ? (
					<CodeBlock
						key={`cb-${i}`}
						code={seg.content}
						language={seg.lang === "mermaid" ? "text" : seg.lang}
					/>
				) : (
					<Markdown key={`md-${i}`} app={app} component={component} sourcePath={sourcePath}>
						{seg.content}
					</Markdown>
				);
			})}
		</>
	);
}
