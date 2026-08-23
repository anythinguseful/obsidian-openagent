/** bundle entry for test/markdown.test.cjs — pure helpers only */
export { splitMarkdownSegments } from "../src/ui/markdown-segments";
export { mdToHtml } from "./real-preview/md-lite";
export {
	guardAssistantDiagramRemoteMedia,
	guardAssistantRemoteMedia,
	preprocessAIResponse,
	resolveVaultImages,
	sanitizeMermaidSrc,
	sanitizeMermaidFences,
} from "../src/ui/markdown-preprocess";
export { computeMarkdownEdit } from "../src/ui/markdown-keys";
export { canonicalizeAssistantOutput } from "../src/markdown/canonical-output";
export { clipMarkdownFenceSafe, walkMarkdownFences } from "../src/markdown/fences";
