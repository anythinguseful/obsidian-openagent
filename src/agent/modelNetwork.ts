import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from "obsidian";

/**
 * Network policy for URLs selected by a model (currently web_extract and
 * remote vision_analyze) — deliberately NOT used by provider transports or
 * endpoints the user configures in Settings.
 *
 * Obsidian's public requestUrl API returns an already-buffered response and
 * does not expose redirect hops, the final URL, DNS resolution, streaming,
 * or AbortSignal. Therefore this module can reject unsafe URL syntax before
 * transport and validate the returned response, but its deadline/abort are
 * caller-side races only. It cannot provide DNS pinning, redirect policing,
 * hard cancellation, or a pre-download byte cap. Keep those residual limits
 * explicit whenever this policy is described.
 */

export const MODEL_NETWORK_TIMEOUT_MS = 20_000;
export const MODEL_NETWORK_MAX_URL_CHARS = 8_192;

export type ModelResourceKind = "text" | "image";

export interface ModelNetworkOptions {
	kind: ModelResourceKind;
	maxBytes: number;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export interface ModelNetworkResponse {
	url: string;
	status: number;
	headers: Record<string, string>;
	arrayBuffer: ArrayBuffer;
	text: string;
	contentType: string;
	bytes: number;
}

export type ModelNetworkTransport = (request: RequestUrlParam | string) => Promise<RequestUrlResponse>;

function fail(message: string): never {
	throw new Error(`Model-selected URL blocked: ${message}`);
}

function parseIPv4(host: string): number[] | null {
	if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
	const parts = host.split(".").map(Number);
	if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
	return parts;
}

function isPublicIPv4(parts: number[]): boolean {
	const [a, b] = parts;
	if (a === 0 || a === 10 || a === 127) return false;
	if (a === 100 && b >= 64 && b <= 127) return false; // shared/CGNAT
	if (a === 169 && b === 254) return false;
	if (a === 172 && b >= 16 && b <= 31) return false;
	if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return false;
	if (a === 192 && b === 31 && parts[2] === 196) return false; // AS112 direct delegation
	if (a === 192 && b === 52 && parts[2] === 193) return false; // AMT
	if (a === 192 && b === 88 && parts[2] === 99) return false; // deprecated 6to4 relay anycast
	if (a === 192 && b === 168) return false;
	if (a === 192 && b === 175 && parts[2] === 48) return false; // AS112 service
	if (a === 198 && (b === 18 || b === 19)) return false;
	if (a === 198 && b === 51 && parts[2] === 100) return false;
	if (a === 203 && b === 0 && parts[2] === 113) return false;
	if (a >= 224) return false; // multicast, reserved, broadcast
	return true;
}

function parseIPv6(rawHost: string): bigint | null {
	let host = rawHost.toLowerCase();
	if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
	if (!host.includes(":")) return null;
	if (host.includes("%")) return null; // zone identifiers are local-interface selectors
	if ((host.match(/::/g) ?? []).length > 1) return null;

	/* Accept a dotted IPv4 tail as well as URL's usual normalised hextets. */
	const dotted = host.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
	if (dotted) {
		const v4 = parseIPv4(dotted[1]);
		if (!v4) return null;
		const hi = ((v4[0] << 8) | v4[1]).toString(16);
		const lo = ((v4[2] << 8) | v4[3]).toString(16);
		host = host.slice(0, host.length - dotted[1].length) + `${hi}:${lo}`;
	}

	const halves = host.split("::");
	const left = halves[0] ? halves[0].split(":") : [];
	const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
	if (left.concat(right).some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
	let words: string[];
	if (halves.length === 2) {
		const zeros = 8 - left.length - right.length;
		if (zeros < 1) return null;
		words = [...left, ...Array(zeros).fill("0"), ...right];
	} else {
		if (left.length !== 8) return null;
		words = left;
	}
	if (words.length !== 8) return null;
	return words.reduce((value, word) => (value << 16n) | BigInt(`0x${word}`), 0n);
}

function prefixMatches(value: bigint, prefix: bigint, bits: number): boolean {
	if (bits === 0) return true;
	return (value >> BigInt(128 - bits)) === (prefix >> BigInt(128 - bits));
}

const V6 = {
	mapped: 0x00000000000000000000ffff00000000n,
	nat64: 0x0064ff9b000000000000000000000000n,
	nat64Local: 0x0064ff9b000100000000000000000000n,
	discard: 0x01000000000000000000000000000000n,
	global: 0x20000000000000000000000000000000n,
	ietf: 0x20010000000000000000000000000000n,
	doc: 0x20010db8000000000000000000000000n,
	sixToFour: 0x20020000000000000000000000000000n,
	as112: 0x2620004f800000000000000000000000n,
	doc2: 0x3fff0000000000000000000000000000n,
};

function isPublicIPv6(value: bigint): boolean {
	if (value === 0n || value === 1n) return false;
	/* Mapped, translation, and transition ranges are special even when their
	   embedded IPv4 happens to be public. Rejecting the whole range avoids a
	   second interpretation path between URL validation and transport. */
	if (prefixMatches(value, V6.mapped, 96)) return false;
	if (prefixMatches(value, V6.nat64Local, 48) || prefixMatches(value, V6.nat64, 96)) return false;
	if (prefixMatches(value, V6.discard, 64)) return false;
	if (!prefixMatches(value, V6.global, 3)) return false; // excludes ULA/link-local/multicast/etc.
	if (prefixMatches(value, V6.ietf, 23)) return false;
	if (prefixMatches(value, V6.doc, 32) || prefixMatches(value, V6.doc2, 20)) return false;
	if (prefixMatches(value, V6.sixToFour, 16) || prefixMatches(value, V6.as112, 48)) return false;
	return true;
}

const LOCAL_HOST_SUFFIXES = [
	"localhost",
	"local",
	"internal",
	"localdomain",
	"home.arpa",
	"arpa",
	"home",
	"lan",
	"corp",
	"alt",
	"test",
	"invalid",
	"example",
	"onion",
];

function assertPublicHostname(input: string): void {
	const host = input.toLowerCase().replace(/\.+$/, "");
	if (!host || host.length > 253) fail("invalid hostname");

	const v4 = parseIPv4(host);
	if (v4) {
		if (!isPublicIPv4(v4)) fail("private, local, documentation, multicast, or otherwise special IPv4 address");
		return;
	}

	const v6 = parseIPv6(host);
	if (v6 !== null) {
		if (!isPublicIPv6(v6)) fail("private, local, documentation, transition-to-private, or otherwise special IPv6 address");
		return;
	}

	/* URL canonicalisation turns Unicode hostnames into ASCII/punycode. DNS is
	   intentionally not resolved here: requestUrl exposes no resolver result
	   that could be pinned to the subsequent connection. */
	if (
		!/^[a-z0-9.-]+$/.test(host) ||
		host.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
	) {
		fail("invalid hostname");
	}
	if (!host.includes(".")) fail("single-label/intranet hostname");
	if (LOCAL_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
		fail("local or special-use hostname");
	}
	if (host === "metadata.google.internal" || host === "instance-data") fail("cloud metadata hostname");
}

/** Parse and canonicalise one model-selected public-web URL before transport. */
export function validateModelSelectedUrl(raw: string): URL {
	if (typeof raw !== "string" || !raw || raw.length > MODEL_NETWORK_MAX_URL_CHARS) fail("missing or overlong URL");
	if (raw.trim() !== raw || /[\u0000-\u001f\u007f]/.test(raw)) fail("whitespace or control characters in URL");
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return fail("malformed URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") fail("only http:// and https:// are allowed");
	if (url.username || url.password || /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(raw)) fail("embedded credentials");
	if (url.port) fail("non-default web port");
	assertPublicHostname(url.hostname);
	url.hash = ""; // fragments are not sent over HTTP; never pass model-only labels to transport
	return url;
}

function header(headers: Record<string, string>, name: string): string {
	const target = name.toLowerCase();
	for (const [key, value] of Object.entries(headers ?? {})) {
		if (key.toLowerCase() === target) return String(value);
	}
	return "";
}

function contentLength(headers: Record<string, string>): number | null {
	const raw = header(headers, "content-length").trim();
	if (!/^\d+$/.test(raw)) return null;
	const value = Number(raw);
	return Number.isSafeInteger(value) ? value : null;
}

function bodyBytes(response: RequestUrlResponse): Uint8Array {
	const fromBuffer = response.arrayBuffer instanceof ArrayBuffer ? new Uint8Array(response.arrayBuffer) : new Uint8Array();
	if (fromBuffer.byteLength > 0 || !response.text) return fromBuffer;
	/* Real requestUrl responses carry both representations. This fallback is
	   for faithful/minimal test doubles and still enforces the actual text. */
	return new TextEncoder().encode(response.text);
}

function isAllowedTextContentType(contentType: string): boolean {
	if (!contentType || contentType === "application/octet-stream") return true; // permitted only if byte sniff below is textual
	if (contentType.startsWith("text/")) return true;
	return (
		contentType === "application/json" ||
		contentType.endsWith("+json") ||
		contentType === "application/xml" ||
		contentType.endsWith("+xml") ||
		contentType === "application/xhtml+xml" ||
		contentType === "application/rss+xml" ||
		contentType === "application/atom+xml"
	);
}

function assertLikelyText(bytes: Uint8Array): void {
	const sample = bytes.subarray(0, Math.min(bytes.byteLength, 4096));
	let controls = 0;
	for (const byte of sample) {
		if (byte === 0) throw new Error("Model-selected URL response rejected: binary body in web text fetch");
		if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) controls++;
	}
	if (sample.byteLength > 0 && controls / sample.byteLength > 0.01) {
		throw new Error("Model-selected URL response rejected: binary/control-heavy body in web text fetch");
	}
}

function waitForResponse(
	transport: ModelNetworkTransport,
	request: RequestUrlParam,
	timeoutMs: number,
	signal?: AbortSignal
): Promise<RequestUrlResponse> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			globalThis.clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			fn();
		};
		const onAbort = () => finish(() => reject(new Error("Model-selected URL request aborted by caller (transport may still finish in background)")));
		const timer = globalThis.setTimeout(
			() => finish(() => reject(new Error(`Model-selected URL request exceeded the ${timeoutMs} ms soft deadline (transport may still finish in background)`))),
			timeoutMs
		);
		if (signal?.aborted) {
			onAbort();
			return;
		}
		signal?.addEventListener("abort", onAbort, { once: true });
		Promise.resolve()
			.then(() => (settled ? null : transport(request)))
			.then(
				(response) => {
					if (response) finish(() => resolve(response));
				},
				(error) => finish(() => reject(error))
			);
	});
}

/**
 * Best-effort requestUrl wrapper for model-selected URLs. URL checks happen
 * before transport; response checks necessarily happen after requestUrl has
 * buffered the body because the public API exposes no streaming primitive.
 */
export async function requestModelSelectedResource(
	rawUrl: string,
	options: ModelNetworkOptions,
	transport: ModelNetworkTransport = requestUrl
): Promise<ModelNetworkResponse> {
	const url = validateModelSelectedUrl(rawUrl);
	const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? MODEL_NETWORK_TIMEOUT_MS));
	if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1) throw new Error("Model-selected URL request has an invalid byte budget");

	const response = await waitForResponse(transport, { url: url.href, method: "GET", throw: false }, timeoutMs, options.signal);
	if (!Number.isInteger(response.status) || response.status < 200 || response.status > 299) {
		throw new Error(`Model-selected URL request failed (${response.status || "unknown status"}) for ${url.origin}`);
	}

	const declaredLength = contentLength(response.headers);
	if (declaredLength !== null && declaredLength > options.maxBytes) {
		throw new Error(`Model-selected URL response exceeds the ${options.maxBytes}-byte budget (Content-Length: ${declaredLength})`);
	}

	const bytes = bodyBytes(response);
	const textBytes = response.text ? new TextEncoder().encode(response.text).byteLength : 0;
	const actualBytes = Math.max(bytes.byteLength, textBytes);
	if (actualBytes > options.maxBytes) {
		throw new Error(`Model-selected URL response exceeds the ${options.maxBytes}-byte post-buffer budget (${actualBytes} bytes)`);
	}

	const contentType = header(response.headers, "content-type").split(";", 1)[0].trim().toLowerCase();
	if (options.kind === "text") {
		if (!isAllowedTextContentType(contentType)) {
			throw new Error(`Model-selected URL response rejected: unsupported web content type ${contentType || "(missing)"}`);
		}
		assertLikelyText(bytes);
	}

	return {
		url: url.href,
		status: response.status,
		headers: response.headers ?? {},
		arrayBuffer: response.arrayBuffer,
		text: response.text ?? "",
		contentType,
		bytes: actualBytes,
	};
}
