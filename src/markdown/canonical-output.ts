/**
 * Canonical assistant Markdown boundary.
 *
 * Every user-visible or durable sink must pass complete assistant output
 * through this helper. Rendering may still apply the same sanitizer as
 * defense-in-depth, but persistence/copy/editor writes must not depend on
 * a renderer to repair Mermaid later.
 */
import { sanitizeMermaidFences } from "../ui/markdown-preprocess";

export function canonicalizeAssistantOutput(markdown: string): string {
	return sanitizeMermaidFences(markdown);
}
