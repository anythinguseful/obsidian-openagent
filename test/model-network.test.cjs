/** Pure/transport-double regression tests for the model-selected URL policy. */
const { execSync } = require("child_process");
const path = require("path");
const Module = require("module");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "model-network.cjs");
execSync(`npx esbuild src/agent/modelNetwork.ts --bundle --platform=node --format=cjs --external:obsidian --outfile=${out}`, {
	cwd: root,
	stdio: "inherit",
});

const obsidianMock = { requestUrl: async () => { throw new Error("default transport must not run in policy unit tests"); } };
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "obsidian") return "obsidian-model-network-mock";
	return originalResolve.call(this, request, ...args);
};
require.cache["obsidian-model-network-mock"] = {
	id: "obsidian-model-network-mock",
	filename: "obsidian-model-network-mock",
	loaded: true,
	exports: obsidianMock,
};

const { validateModelSelectedUrl, requestModelSelectedResource } = require(out);
let failed = 0;
const check = (ok, label) => {
	if (ok) console.log(`✓ ${label}`);
	else {
		console.error(`✗ ${label}`);
		failed++;
	}
};
const reject = async (fn, label, pattern) => {
	try {
		await fn();
		console.error(`✗ ${label} (did not reject)`);
		failed++;
	} catch (error) {
		const message = String(error?.message ?? error);
		if (pattern && !pattern.test(message)) {
			console.error(`✗ ${label} (wrong error: ${message})`);
			failed++;
		} else console.log(`✓ ${label}`);
	}
};

const response = (overrides = {}) => ({
	status: 200,
	headers: { "content-type": "text/html; charset=utf-8" },
	arrayBuffer: new TextEncoder().encode("<p>safe</p>").buffer,
	text: "<p>safe</p>",
	json: {},
	...overrides,
});

(async () => {
	/* URL preflight: reject before any transport call. */
	const blocked = [
		["not a url", "malformed"],
		["file:///etc/passwd", "non-http"],
		["https://user:pass@example.org/x", "credentials"],
		["https://example.org:8443/x", "non-default port"],
		["http://localhost/x", "localhost"],
		["http://service.internal/x", "internal hostname"],
		["http://service.alt/x", "private-use alt hostname"],
		["http://resolver.arpa/x", "infrastructure hostname"],
		["http://-bad.example.org/x", "invalid DNS label"],
		["http://printer/x", "single-label hostname"],
		["http://127.0.0.1/x", "IPv4 loopback"],
		["http://2130706433/x", "legacy integer IPv4 canonicalises to loopback"],
		["http://169.254.169.254/latest/meta-data", "link-local metadata IPv4"],
		["http://10.1.2.3/x", "private IPv4"],
		["http://100.100.100.200/x", "CGNAT metadata IPv4"],
		["http://192.0.2.10/x", "documentation IPv4"],
		["http://[::1]/x", "IPv6 loopback"],
		["http://[fc00::1]/x", "IPv6 ULA"],
		["http://[fe80::1]/x", "IPv6 link-local"],
		["http://[::ffff:127.0.0.1]/x", "IPv4-mapped IPv6 to loopback"],
		["http://[::ffff:8.8.8.8]/x", "IPv4-mapped IPv6 even with public payload"],
		["http://[64:ff9b::808:808]/x", "NAT64 IPv6"],
		["http://[2002:7f00:1::]/x", "6to4 embedding loopback"],
		["http://[2002:0808:0808::]/x", "6to4 IPv6 even with public payload"],
		["http://[2001:3::1]/x", "IETF protocol-assignment IPv6"],
		["http://[2001:db8::1]/x", "documentation IPv6"],
		["http://[2620:4f:8000::1]/x", "AS112 special IPv6"],
	];
	for (const [url, label] of blocked) {
		let calls = 0;
		await reject(
			() => requestModelSelectedResource(url, { kind: "text", maxBytes: 1024 }, async () => (calls++, response())),
			`preflight blocks ${label}`,
			/blocked/i
		);
		check(calls === 0, `preflight ${label}: transport not called`);
	}

	const domain = validateModelSelectedUrl("https://example.org/page#model-fragment");
	check(domain.href === "https://example.org/page", "public domain accepted and fragment stripped before transport");
	check(validateModelSelectedUrl("https://example.org:443/x").href === "https://example.org/x", "explicit default HTTPS port accepted/canonicalised");
	check(validateModelSelectedUrl("https://[2606:4700:4700::1111]/dns").hostname.includes("2606:4700"), "public global IPv6 accepted");

	let requested = "";
	const ok = await requestModelSelectedResource(
		"https://example.org/page#private-label",
		{ kind: "text", maxBytes: 1024 },
		async (req) => {
			requested = req.url;
			return response();
		}
	);
	check(requested === "https://example.org/page" && ok.status === 200 && ok.contentType === "text/html", "validated URL and response pass through canonical request");

	await reject(
		() => requestModelSelectedResource("https://example.org/x", { kind: "text", maxBytes: 1024 }, async () => response({ status: 302 })),
		"non-2xx status rejected",
		/failed \(302\)/
	);
	await reject(
		() => requestModelSelectedResource("https://example.org/x", { kind: "text", maxBytes: 1024 }, async () => response({ headers: { "Content-Type": "application/pdf" } })),
		"non-text content type rejected for web extraction",
		/content type/i
	);
	await reject(
		() => requestModelSelectedResource("https://example.org/x", { kind: "text", maxBytes: 8 }, async () => response({ headers: { "Content-Length": "99", "Content-Type": "text/plain" } })),
		"exposed Content-Length over cap rejected",
		/Content-Length/
	);
	await reject(
		() => requestModelSelectedResource("https://example.org/x", { kind: "text", maxBytes: 8 }, async () => response({ headers: { "Content-Type": "text/plain" }, text: "0123456789", arrayBuffer: new TextEncoder().encode("0123456789").buffer })),
		"actual buffered body over cap rejected",
		/post-buffer/
	);
	await reject(
		() => requestModelSelectedResource("https://example.org/x", { kind: "text", maxBytes: 1024 }, async () => response({ headers: {}, text: "x\0binary", arrayBuffer: new TextEncoder().encode("x\0binary").buffer })),
		"missing content type only passes after text sniff; binary body rejected",
		/binary body/
	);
	const genericText = await requestModelSelectedResource(
		"https://example.org/x",
		{ kind: "text", maxBytes: 1024 },
		async () => response({ headers: {}, text: "plain text", arrayBuffer: new TextEncoder().encode("plain text").buffer })
	);
	check(genericText.bytes === 10, "missing content type accepted only for a text-like body");

	await reject(
		() => requestModelSelectedResource("https://example.org/slow", { kind: "text", maxBytes: 1024, timeoutMs: 10 }, async () => new Promise(() => {})),
		"never-resolving transport loses to soft deadline",
		/soft deadline/
	);
	const controller = new AbortController();
	controller.abort();
	let abortCalls = 0;
	await reject(
		() => requestModelSelectedResource("https://example.org/abort", { kind: "text", maxBytes: 1024, signal: controller.signal }, async () => (abortCalls++, response())),
		"caller abort rejects best-effort request",
		/aborted by caller/
	);
	check(abortCalls === 0, "already-aborted caller signal prevents transport start");
	const racedController = new AbortController();
	let racedCalls = 0;
	const racedRequest = requestModelSelectedResource(
		"https://example.org/raced-abort",
		{ kind: "text", maxBytes: 1024, signal: racedController.signal },
		async () => (racedCalls++, response())
	);
	racedController.abort();
	await reject(() => racedRequest, "caller abort before transport microtask rejects request", /aborted by caller/);
	check(racedCalls === 0, "caller abort before transport microtask prevents transport start");

	/* Image mode leaves MIME authority to vision's magic-byte allowlist, but
	   still enforces network policy, status, deadline, and bytes. */
	const image = await requestModelSelectedResource(
		"https://example.org/image",
		{ kind: "image", maxBytes: 32 },
		async () => response({ headers: { "Content-Type": "application/octet-stream" }, text: "", arrayBuffer: new Uint8Array([1, 2, 3]).buffer })
	);
	check(image.bytes === 3, "image mode returns bounded bytes for magic-byte validation by caller");

	if (failed) {
		console.error(`\n${failed} model-network test(s) failed`);
		process.exit(1);
	}
	console.log("\nAll model-network tests passed.");
})().catch((error) => {
	console.error(error);
	process.exit(1);
});
