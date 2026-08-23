import {
	PDF_ATTACH_MAX_BYTES,
	PDF_ATTACH_MAX_PAGES,
	PDF_ATTACH_TIMEOUT_MS,
	extractPdfText,
} from "../src/ui/attach/pdf";

declare global {
	interface Window {
		__oaPdfSecurityInput: { worker: string; fixtures: Record<string, string> };
		__oaPdfSecurityResult?: { ok: boolean; checks: string[]; failures: string[]; metrics: Record<string, number> };
		__oaPdfSecurityDone?: boolean;
		__OA_CVE_2024_4367_EXECUTED__?: boolean;
	}
}

const input = window.__oaPdfSecurityInput;
const checks: string[] = [];
const failures: string[] = [];
const metrics: Record<string, number> = {};

function bytesFromB64(value: string): Uint8Array {
	const raw = atob(value);
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

const workerBytes = bytesFromB64(input.worker);
const fixtures = Object.fromEntries(Object.entries(input.fixtures).map(([name, b64]) => [name, bytesFromB64(b64)]));
const realWorker = globalThis.Worker;
let workersCreated = 0;
let workersTerminated = 0;
let urlsRevoked = 0;

class TrackingWorker extends realWorker {
	constructor(url: string | URL, options?: WorkerOptions) {
		super(url, options);
		workersCreated++;
	}
	override terminate(): void {
		workersTerminated++;
		super.terminate();
	}
}
(globalThis as unknown as { Worker: typeof Worker }).Worker = TrackingWorker;
const realRevoke = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = (url: string): void => {
	urlsRevoked++;
	realRevoke(url);
};

function source(bytes: Uint8Array | (() => Promise<ArrayBuffer>)) {
	return {
		app: {
			vault: {
				adapter: {
					readBinary: async (): Promise<ArrayBuffer> => {
						if (typeof bytes === "function") return bytes();
						return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
					},
				},
			},
		},
		pluginDir: ".obsidian/plugins/openagent",
	} as never;
}

const realSource = source(workerBytes);

/** PDF.js transfers its input buffer to the worker, so every attempt needs fresh ownership. */
function fixture(name: string): ArrayBuffer {
	return fixtures[name].slice().buffer;
}

function check(condition: unknown, label: string): void {
	if (condition) checks.push(label);
	else failures.push(label);
}

async function bounded<T>(label: string, maxMs: number, run: () => Promise<T>): Promise<{ value?: T; error?: string; elapsed: number }> {
	const started = performance.now();
	try {
		const value = await run();
		const elapsed = performance.now() - started;
		check(elapsed <= maxMs, `${label}: settled within ${maxMs} ms`);
		return { value, elapsed };
	} catch (reason) {
		const elapsed = performance.now() - started;
		check(elapsed <= maxMs, `${label}: rejected within ${maxMs} ms`);
		return { error: String(reason), elapsed };
	}
}

async function main(): Promise<void> {
	check(PDF_ATTACH_MAX_BYTES === 20 * 1024 * 1024, "input cap remains 20 MiB");
	check(PDF_ATTACH_MAX_PAGES === 50, "page cap remains 50");
	check(PDF_ATTACH_TIMEOUT_MS === 30_000, "production parse deadline remains 30 seconds");

	const noSource = await bounded("missing source", 1_000, () => extractPdfText(fixture("valid.pdf"), 1024, undefined, 250));
	check(!!noSource.error && /refusing fake-worker|source missing/.test(noSource.error), "missing source cannot fall back to fake/main-thread worker");
	check(workersCreated === 0, "missing source creates no Worker");

	const missing = await bounded("missing worker bytes", 1_000, () => extractPdfText(fixture("valid.pdf"), 1024, source(new Uint8Array()), 250));
	check(!!missing.error && /unreadable/.test(missing.error), "missing worker fails closed before PDF parsing");
	check(workersCreated === 0, "missing worker creates no Worker");

	const createdBeforeReadHang = workersCreated;
	const hangingRead = await bounded("worker-byte read timeout", 2_000, () =>
		extractPdfText(fixture("valid.pdf"), 1024, source(() => new Promise<ArrayBuffer>(() => {})), 150)
	);
	check(!!hangingRead.error && /timed out/.test(hangingRead.error), "non-abortable worker-byte read is covered by the whole-operation deadline");
	check(workersCreated === createdBeforeReadHang, "timed-out worker-byte read cannot create a late Worker");

	const corruptBytes = new TextEncoder().encode("this is invalid javascript !" + " ".repeat(10_050));
	const corrupt = await bounded("corrupt worker", 2_000, () => extractPdfText(fixture("valid.pdf"), 1024, source(corruptBytes), 500));
	check(!!corrupt.error, "corrupt worker rejects rather than using a fake worker");
	check(workersCreated >= 1 && workersTerminated >= 1, "corrupt worker is terminated");

	const firstCreated = workersCreated;
	const valid1 = await bounded("valid PDF first use", 5_000, () => extractPdfText(fixture("valid.pdf"), 1024, realSource, 4_000));
	check(valid1.value?.includes("PACKAGE_C_VALID_TEXT"), "valid PDF extracts expected text");
	check(workersCreated === firstCreated + 1, "valid extraction creates one real replacement Worker");

	const valid2 = await bounded("valid PDF repeated use", 5_000, () => extractPdfText(fixture("valid.pdf"), 1024, realSource, 4_000));
	check(valid2.value === valid1.value, "repeated extraction is stable");
	check(workersCreated === firstCreated + 1, "repeated extraction reuses the live raw Worker");

	const createdBeforeConcurrent = workersCreated;
	const concurrent = await bounded("concurrent extraction serialization", 10_000, () =>
		Promise.all([
			extractPdfText(fixture("valid.pdf"), 1024, realSource, 4_000),
			extractPdfText(fixture("valid.pdf"), 1024, realSource, 4_000),
		])
	);
	check(concurrent.value?.every((text) => text === valid1.value), "concurrent callers settle correctly through the serialized worker queue");
	check(workersCreated === createdBeforeConcurrent, "serialized concurrent callers reuse one live raw Worker");

	const outputCap = await bounded("output cap", 5_000, () => extractPdfText(fixture("valid.pdf"), 7, realSource, 4_000));
	check(typeof outputCap.value === "string" && outputCap.value.length <= 7, "caller text cap is enforced during accumulation");

	const pages = await bounded("60-page cap", 8_000, () => extractPdfText(fixture("sixty-pages.pdf"), 1024 * 1024, realSource, 7_000));
	check(pages.value?.includes("PAGE_50"), "page 50 is included");
	check(!pages.value?.includes("PAGE_51"), "page 51 is never parsed into output");

	const malformed = await bounded("malformed PDF", 5_000, () => extractPdfText(fixture("malformed.pdf"), 1024, realSource, 4_000));
	check(!!malformed.error || (malformed.value?.length ?? 0) <= 1024, "malformed PDF settles safely with bounded output");

	const truncated = await bounded("truncated PDF", 5_000, () => extractPdfText(fixture("truncated.pdf"), 1024, realSource, 4_000));
	check(!!truncated.error || (truncated.value?.length ?? 0) <= 1024, "truncated PDF settles safely with bounded output");

	window.__OA_CVE_2024_4367_EXECUTED__ = false;
	const cve = await bounded("CVE-2024-4367 FontMatrix PDF", 5_000, () =>
		extractPdfText(fixture("cve-2024-4367-fontmatrix.pdf"), 4096, realSource, 4_000)
	);
	check(!!cve.error || (cve.value?.length ?? 0) <= 4096, "CVE-style PDF settles with bounded output");
	check(window.__OA_CVE_2024_4367_EXECUTED__ === false, "CVE-style FontMatrix payload never executes");

	const createdBeforeOversize = workersCreated;
	const oversized = await bounded("oversized PDF", 1_000, () =>
		extractPdfText(new ArrayBuffer(PDF_ATTACH_MAX_BYTES + 1), 1024, realSource, 250)
	);
	check(!!oversized.error && /over the 20 MB limit/.test(oversized.error), "oversized input is rejected at the extractor boundary");
	check(workersCreated === createdBeforeOversize, "oversized input starts no replacement Worker");

	// Retire the healthy shared worker, then substitute a syntactically valid worker
	// that never answers PDF.js. The operation deadline must kill it and allow repair.
	window.dispatchEvent(new Event("unload"));
	const terminatedBeforeHang = workersTerminated;
	const hangingBytes = new TextEncoder().encode("self.onmessage = function () {};" + " ".repeat(10_050));
	const hanging = await bounded("silent worker timeout", 2_000, () =>
		extractPdfText(fixture("valid.pdf"), 1024, source(hangingBytes), 150)
	);
	check(!!hanging.error && /timed out/.test(hanging.error), "silent worker hits the explicit parse deadline");
	check(workersTerminated > terminatedBeforeHang, "timed-out worker is terminated");

	const createdBeforeRecovery = workersCreated;
	const recovered = await bounded("post-timeout recovery", 5_000, () => extractPdfText(fixture("valid.pdf"), 1024, realSource, 4_000));
	check(recovered.value?.includes("PACKAGE_C_VALID_TEXT"), "next extraction recovers with a fresh real Worker");
	check(workersCreated === createdBeforeRecovery + 1, "post-timeout recovery creates exactly one replacement Worker");

	const recoveredAgain = await bounded("post-timeout repeated use", 5_000, () => extractPdfText(fixture("valid.pdf"), 1024, realSource, 4_000));
	check(recoveredAgain.value === recovered.value, "post-timeout worker survives repeated use");
	check(workersCreated === createdBeforeRecovery + 1, "post-timeout repeated use does not leak Workers");

	// unload listener is once-only by design; the first dispatch already proved normal
	// session cleanup. Timeout separately proved forced termination and URL revocation.
	check(urlsRevoked >= 3, "worker blob URLs are revoked across corruption, unload, and timeout");
	metrics.workersCreated = workersCreated;
	metrics.workersTerminated = workersTerminated;
	metrics.urlsRevoked = urlsRevoked;
	metrics.checks = checks.length;
}

main()
	.catch((reason) => failures.push(`harness fatal: ${String(reason)}`))
	.finally(() => {
		window.__oaPdfSecurityResult = { ok: failures.length === 0, checks, failures, metrics };
		window.__oaPdfSecurityDone = true;
	});
