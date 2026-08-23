/* bundle entry for attach.test.cjs — re-exports the attach feature's pure API surface */
export { findAtQuery, extractAtRefs, resolveAtRefs, spliceToken } from "../src/ui/attach/at-refs";
export { sanitizeSnippets, newSnippetId, DEFAULT_PROMPT_SNIPPETS } from "../src/settings";
export {
	collectFolderMarkdown,
	mimeFromExt,
	FOLDER_ATTACH_MAX_FILES,
	FOLDER_ATTACH_MAX_BYTES,
	IMAGE_ATTACH_MAX_BYTES,
} from "../src/ui/attach/vault-pickers";
export { visionHeuristic, parseModelInfo } from "../src/agent/providers";
export { isTextLike, isImageLike, acceptOk, MAX_TEXT_BYTES } from "../src/ui/components/file-upload";
export { isPdfLike, PDF_ATTACH_MAX_BYTES, PDF_ATTACH_MAX_PAGES } from "../src/ui/attach/pdf";
