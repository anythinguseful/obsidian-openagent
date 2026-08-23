/**
 * Local PDF text extraction for disk uploads (owner need 2026-07-21: the
 * files they actually attach are PDFs, and without this every single
 * upload attempt bounced). Uses pdfjs-dist, dynamically imported on the
 * FIRST pdf so chat startup cost stays zero. Everything is parsed on the
 * user's machine — no file leaves the vault.
 *
 * v0.1.130 (audit 2026-08-09 batch 3): pdf.worker is EXTERNAL — shipped as
 * `vendor/pdf.worker.min.js`, read through the vault adapter, and started
 * as a genuine browser Worker. There is intentionally no fake-worker or
 * main-thread fallback.
 *
 * Package C candidate (audit 2026-08-12): PDF.js 4 legacy build, classic
 * workerPort integration, a hard parse deadline, serialized reuse of the
 * shared worker, bounded loading-task cleanup, and reset-after-failure.
 */

import type { App } from "obsidian";

export const PDF_ATTACH_MAX_BYTES = 20 * 1024 * 1024;
/** Parse at most this many pages; the extracted text is separately capped by the caller. */
export const PDF_ATTACH_MAX_PAGES = 50;
/** Whole-operation deadline (document load + every page + text extraction). */
export const PDF_ATTACH_TIMEOUT_MS = 30_000;
/** Cleanup must not be allowed to turn a bounded rejection into a permanent hang. */
const PDF_ATTACH_CLEANUP_TIMEOUT_MS = 2_000;

/** Source of the shipped worker bytes — real vault adapter in app, equivalent adapter in browser tests. */
export interface PdfWorkerSource {
	app: App;
	pluginDir: string;
}

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfWorkerOptions = { workerSrc?: string; workerPort?: Worker | null };
type PdfJsWithWorker = PdfJsModule & { GlobalWorkerOptions?: PdfWorkerOptions };
type LoadingTask = ReturnType<PdfJsModule["getDocument"]>;

export function isPdfLike(name: string, type: string): boolean {
	return /application\/pdf/i.test(type) || /\.pdf$/i.test(name);
}

let workerReady: Promise<void> | null = null;
let sharedWorker: Worker | null = null;
let sharedWorkerUrl: string | null = null;
let sharedPdfjs: PdfJsWithWorker | null = null;
let activeWorkerReject: ((reason: Error) => void) | null = null;
let unloadRegistered = false;

/**
 * PDFWorker.fromPort caches a wrapper per raw port and a document destroys
 * that wrapper when it closes. Concurrent documents sharing the same port
 * can therefore destroy one another. Serialize extraction while retaining
 * the raw browser Worker between calls.
 */
let extractionTail: Promise<void> = Promise.resolve();

function asError(reason: unknown, fallback: string): Error {
	if (reason instanceof Error) return reason;
	return new Error(typeof reason === "string" && reason ? reason : fallback);
}

function disposeSharedWorker(pdfjs: PdfJsWithWorker | null, expected?: Worker | null): void {
	const worker = sharedWorker;
	if (!worker || (expected && worker !== expected)) return;

	sharedWorker = null;
	workerReady = null;
	if (pdfjs?.GlobalWorkerOptions?.workerPort === worker) {
		pdfjs.GlobalWorkerOptions.workerPort = null;
	}
	try {
		worker.terminate();
	} catch {
		// Already dead is still disposed.
	}
	if (sharedWorkerUrl) {
		URL.revokeObjectURL(sharedWorkerUrl);
		sharedWorkerUrl = null;
	}
}

async function ensureSharedWorker(
	pdfjs: PdfJsWithWorker,
	src: PdfWorkerSource,
	cancelled: () => boolean
): Promise<void> {
	if (workerReady) return workerReady;

	const init = (async () => {
		if (!src.pluginDir) {
			throw new Error("pdf worker: pluginDir missing — ChatApp must pass it through");
		}
		const bytes = await src.app.vault.adapter.readBinary(`${src.pluginDir}/vendor/pdf.worker.min.js`);
		// readBinary is not abortable. If the whole-operation deadline won while
		// it was pending, never construct a late orphan Worker when it settles.
		if (cancelled()) {
			throw new Error("pdf worker: initialization cancelled after extraction deadline");
		}
		if (!bytes || bytes.byteLength < 10_000) {
			throw new Error(`pdf worker: vendor/pdf.worker.min.js unreadable (${bytes?.byteLength ?? 0} B) — reinstall the plugin`);
		}

		const blob = new Blob([bytes], { type: "text/javascript" });
		const blobUrl = URL.createObjectURL(blob);
		let worker: Worker;
		try {
			// The shipped v4 worker is bundled by esbuild as a classic IIFE.
			worker = new Worker(blobUrl);
		} catch (reason) {
			URL.revokeObjectURL(blobUrl);
			throw asError(reason, "pdf worker: browser Worker construction failed");
		}

		sharedWorker = worker;
		sharedWorkerUrl = blobUrl;
		sharedPdfjs = pdfjs;
		pdfjs.GlobalWorkerOptions.workerPort = worker;

		worker.addEventListener("error", (event) => {
			const error = new Error(`pdf worker: ${event.message || "worker script failed"}`);
			const rejectActive = activeWorkerReject;
			disposeSharedWorker(pdfjs, worker);
			rejectActive?.(error);
		});

		if (!unloadRegistered) {
			unloadRegistered = true;
			window.addEventListener("unload", () => disposeSharedWorker(sharedPdfjs), { once: true });
		}
	})();

	let guarded: Promise<void>;
	guarded = init.catch((reason) => {
		// Do not let an abandoned, late-settling read clobber a newer retry.
		if (workerReady === guarded) workerReady = null;
		throw reason;
	});
	workerReady = guarded;
	return guarded;
}

async function destroyLoadingTaskBounded(task: LoadingTask, pdfjs: PdfJsWithWorker, operationWorker: Worker | null): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), PDF_ATTACH_CLEANUP_TIMEOUT_MS);
	});
	try {
		const result = await Promise.race([
			task.destroy().then(() => "done" as const),
			timedOut,
		]);
		if (result === "timeout") {
			disposeSharedWorker(pdfjs, operationWorker);
		}
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

async function extractPdfTextExclusive(
	buf: ArrayBuffer,
	maxBytes: number,
	src: PdfWorkerSource | undefined,
	timeoutMs: number
): Promise<string> {
	if (buf.byteLength > PDF_ATTACH_MAX_BYTES) {
		throw new Error(`PDF is over the ${PDF_ATTACH_MAX_BYTES / 1024 / 1024} MB limit`);
	}
	const textLimit = Math.max(0, Math.floor(Number.isFinite(maxBytes) ? maxBytes : 0));
	if (textLimit === 0) return "";

	const boundedTimeout = Math.max(1, Math.min(PDF_ATTACH_TIMEOUT_MS, Math.floor(timeoutMs)));
	const deadlineError = new Error(`PDF extraction timed out after ${boundedTimeout} ms`);
	let expired = false;
	let operationPdfjs: PdfJsWithWorker | null = null;
	let operationWorker: Worker | null = null;
	let loadingTask: LoadingTask | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let rejectForWorker: ((reason: Error) => void) | null = null;

	const workerFailure = new Promise<never>((_resolve, reject) => {
		rejectForWorker = reject;
	});
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			expired = true;
			const workerAtDeadline = operationWorker ?? sharedWorker;
			if (workerAtDeadline) {
				disposeSharedWorker(operationPdfjs ?? sharedPdfjs, workerAtDeadline);
			} else {
				// Abandon a non-abortable readBinary initialization. Its guarded
				// promise may settle later, but cancellation prevents Worker creation.
				workerReady = null;
			}
			reject(deadlineError);
		}, boundedTimeout);
	});

	const operation = (async () => {
		const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as PdfJsWithWorker;
		operationPdfjs = pdfjs;
		if (expired) throw deadlineError;
		if (!src) {
			throw new Error("pdf worker: source missing — refusing fake-worker/main-thread fallback");
		}
		await ensureSharedWorker(pdfjs, src, () => expired);
		if (expired) throw deadlineError;
		if (!sharedWorker || pdfjs.GlobalWorkerOptions.workerPort !== sharedWorker) {
			throw new Error("pdf worker: real browser worker failed to initialize");
		}
		operationWorker = sharedWorker;
		activeWorkerReject = (reason) => rejectForWorker?.(reason);

		loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false });
		try {
			const doc = await loadingTask.promise;
			let out = "";
			const pages = Math.min(doc.numPages, PDF_ATTACH_MAX_PAGES);
			for (let p = 1; p <= pages && out.length < textLimit; p++) {
				const page = await doc.getPage(p);
				const tc = await page.getTextContent();
				for (const item of tc.items) {
					if (!("str" in item) || !item.str) continue;
					const remaining = textLimit - out.length;
					if (remaining <= 0) break;
					out += `${item.str} `.slice(0, remaining);
				}
				if (out.length < textLimit) {
					out = out.trimEnd() + "\n\n".slice(0, textLimit - out.trimEnd().length);
				}
			}
			return out.slice(0, textLimit).trim();
		} finally {
			if (loadingTask) {
				await destroyLoadingTaskBounded(loadingTask, pdfjs, operationWorker);
			}
		}
	})();

	try {
		return await Promise.race([operation, workerFailure, deadline]);
	} finally {
		expired = true;
		if (timer !== undefined) clearTimeout(timer);
		if (activeWorkerReject && rejectForWorker) activeWorkerReject = null;
		// If timeout/worker failure won the race, request PDF.js cleanup without
		// awaiting it; the raw worker was already terminated and this queue can recover.
		if (loadingTask && !loadingTask.destroyed) {
			void loadingTask.destroy().catch(() => {});
		}
	}
}

/**
 * Extract text with a hard 30 s ceiling. The optional fourth argument only
 * permits shorter deadlines (used by adversarial browser regression tests).
 */
export function extractPdfText(
	buf: ArrayBuffer,
	maxBytes: number,
	src?: PdfWorkerSource,
	timeoutMs = PDF_ATTACH_TIMEOUT_MS
): Promise<string> {
	const run = extractionTail.then(() => extractPdfTextExclusive(buf, maxBytes, src, timeoutMs));
	extractionTail = run.then(
		(): void => {},
		(): void => {}
	);
	return run;
}
