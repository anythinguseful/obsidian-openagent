/**
 * Unit tests for the MCP Streamable HTTP transport (http.ts) — JSON-RPC over
 * an injected POST primitive (a fake), no network, no Obsidian. Covers header
 * merging, session-id echo, JSON + SSE response parsing, status errors,
 * network errors, empty bodies, and notifications.
 */

const { execSync } = require("child_process");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const httpOut = path.join(__dirname, "dist", "mcp-http.cjs");
const clientOut = path.join(__dirname, "dist", "mcp-client-http.cjs");
execSync(`npx esbuild src/agent/mcp/http.ts --bundle --platform=node --format=cjs --outfile=${httpOut}`, { cwd: root, stdio: "inherit" });
execSync(`npx esbuild src/agent/mcp/client.ts --bundle --platform=node --format=cjs --outfile=${clientOut}`, { cwd: root, stdio: "inherit" });

const { HttpTransport, mergeHttpHeaders, headerValue, isHttpUrl, parseSse, parseMcpHttpBody } = require(httpOut);
const { McpClient } = require(clientOut);

const tests = [];
function t(name, fn) {
	tests.push({ name, fn });
}

/* ---------------- pure helpers ---------------- */

t("mergeHttpHeaders: user overrides base case-insensitively", () => {
	const out = mergeHttpHeaders({ "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, { authorization: "Bearer x", "X-Foo": "1" });
	assert.strictEqual(out["authorization"], "Bearer x");
	assert.strictEqual(out["X-Foo"], "1");
	// Accept/Content-Type unchanged (no casing collision)
	assert.strictEqual(out["Accept"], "application/json, text/event-stream");
	assert.strictEqual(out["Content-Type"], "application/json");
});

t("mergeHttpHeaders: casing collision removes the base key", () => {
	const out = mergeHttpHeaders({ Authorization: "default" }, { authorization: "user" });
	assert.strictEqual(out["Authorization"], undefined);
	assert.strictEqual(out["authorization"], "user");
});

t("mergeHttpHeaders: empty/undefined values are dropped", () => {
	const out = mergeHttpHeaders({ A: "1" }, { B: "", C: undefined, D: "2" });
	assert.deepStrictEqual(Object.keys(out).sort(), ["A", "D"]);
});

t("headerValue: case-insensitive lookup", () => {
	assert.strictEqual(headerValue({ "mcp-session-id": "s1" }, "Mcp-Session-Id"), "s1");
	assert.strictEqual(headerValue({ "Content-Type": "application/json" }, "content-type"), "application/json");
	assert.strictEqual(headerValue({}, "x"), null);
});

t("isHttpUrl: http(s) only", () => {
	assert.ok(isHttpUrl("http://127.0.0.1:8000/mcp"));
	assert.ok(isHttpUrl("https://mcp.example.com/mcp"));
	assert.ok(!isHttpUrl("file:///etc/passwd"));
	assert.ok(!isHttpUrl("javascript:alert(1)"));
	assert.ok(!isHttpUrl(""));
	assert.ok(!isHttpUrl(undefined));
});

t("parseSse: extracts data: events", () => {
	const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":2,"result":{}}\n\n';
	const out = parseSse(sse);
	assert.strictEqual(out.length, 2);
	assert.strictEqual(out[0], '{"jsonrpc":"2.0","id":1,"result":{}}');
});

t("parseSse: strips a single leading space after data:", () => {
	const out = parseSse("data: {\"a\":1}\n\n");
	assert.strictEqual(out[0], '{"a":1}');
});

t("parseSse: ignores non-data lines (comments, event, id)", () => {
	const out = parseSse(": keepalive\nid: 5\nevent: message\ndata: {\"x\":1}\n\n");
	assert.strictEqual(out.length, 1);
	assert.strictEqual(out[0], '{"x":1}');
});

t("parseMcpHttpBody: JSON object -> one line", () => {
	const out = parseMcpHttpBody('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}', "application/json; charset=utf-8");
	assert.strictEqual(out.length, 1);
	assert.ok(out[0].includes('"ok":true'));
});

t("parseMcpHttpBody: JSON array -> one line per message", () => {
	const out = parseMcpHttpBody('[{"jsonrpc":"2.0","id":1},{"jsonrpc":"2.0","id":2}]', "application/json");
	assert.strictEqual(out.length, 2);
});

t("parseMcpHttpBody: empty body -> []", () => {
	assert.deepStrictEqual(parseMcpHttpBody("", "application/json"), []);
	assert.deepStrictEqual(parseMcpHttpBody("   ", null), []);
});

t("parseMcpHttpBody: SSE content type routes to SSE parser", () => {
	const out = parseMcpHttpBody('data: {"id":9}\n\n', "text/event-stream");
	assert.strictEqual(out.length, 1);
	assert.strictEqual(out[0], '{"id":9}');
});

t("parseMcpHttpBody: malformed JSON throws", () => {
	assert.throws(() => parseMcpHttpBody("<html>not json</html>", "application/json"));
});

/* ---------------- HttpTransport integration (fake post) ---------------- */

function rpcResult(id, result) {
	return { jsonrpc: "2.0", id, result };
}
function rpcTools(id) {
	return rpcResult(id, { tools: [{ name: "echo", description: "Echo" }, { name: "search", description: "Search" }] });
}

function makeServerHandler(calls) {
	return (url, headers, body) => {
		calls.push({ url, headers, body });
		const req = JSON.parse(body);
		let resp;
		if (req.method === "initialize") resp = rpcResult(req.id, { protocolVersion: "2024-11-05" });
		else if (req.method === "tools/list") resp = rpcTools(req.id);
		else if (req.method === "tools/call") resp = rpcResult(req.id, { content: [{ type: "text", text: "hello" }] });
		else resp = rpcResult(req.id, {});
		return Promise.resolve({ status: 200, headers: { "content-type": "application/json", "mcp-session-id": "sess-123" }, text: JSON.stringify(resp) });
	};
}

t("HttpTransport: initialize + listTools over POST", async () => {
	const calls = [];
	const tr = new HttpTransport("https://mcp.example.com/mcp", makeServerHandler(calls));
	const c = new McpClient(tr);
	c.start();
	await c.initialize();
	const tools = await c.listTools();
	assert.strictEqual(tools.length, 2);
	assert.strictEqual(tools[0].name, "echo");
	assert.ok(calls.length >= 3); // initialize + initialized notification + tools/list
});

t("HttpTransport: sends JSON-RPC headers and echoes session id", async () => {
	const calls = [];
	const tr = new HttpTransport("https://mcp.example.com/mcp", makeServerHandler(calls));
	const c = new McpClient(tr);
	c.start();
	await c.initialize();
	await c.listTools();
	const first = calls[0];
	assert.strictEqual(first.url, "https://mcp.example.com/mcp");
	assert.strictEqual(first.headers["Content-Type"], "application/json");
	assert.ok(first.headers["Accept"].includes("application/json"));
	assert.ok(first.headers["Accept"].includes("text/event-stream"));
	// session id captured from the first response is echoed thereafter
	const later = calls[calls.length - 1];
	assert.strictEqual(later.headers["Mcp-Session-Id"], "sess-123");
});

t("HttpTransport: user headers override defaults (case-insensitive)", async () => {
	const calls = [];
	const tr = new HttpTransport("https://mcp.example.com/mcp", makeServerHandler(calls), { authorization: "Bearer tok" });
	const c = new McpClient(tr);
	c.start();
	await c.initialize();
	assert.strictEqual(calls[0].headers["authorization"], "Bearer tok");
});

t("HttpTransport: SSE response is parsed", async () => {
	const calls = [];
	const tr = new HttpTransport("https://mcp.example.com/mcp", (url, headers, body) => {
		const req = JSON.parse(body);
		if (req.method === "initialize") {
			return Promise.resolve({ status: 200, headers: { "content-type": "text/event-stream" }, text: `data: ${JSON.stringify(rpcResult(req.id, { protocolVersion: "2024-11-05" }))}\n\n` });
		}
		if (req.method === "tools/list") {
			return Promise.resolve({ status: 200, headers: { "content-type": "text/event-stream" }, text: `data: ${JSON.stringify(rpcTools(req.id))}\n\n` });
		}
		return Promise.resolve({ status: 200, headers: { "content-type": "application/json" }, text: JSON.stringify(rpcResult(req.id, {})) });
	});
	const c = new McpClient(tr);
	c.start();
	await c.initialize();
	const tools = await c.listTools();
	assert.strictEqual(tools.length, 2);
});

t("HttpTransport: non-2xx rejects the caller", async () => {
	const tr = new HttpTransport("https://mcp.example.com/mcp", () => Promise.resolve({ status: 401, headers: {}, text: "unauthorized" }));
	const c = new McpClient(tr);
	c.start();
	await assert.rejects(() => c.initialize(), /HTTP 401/);
});

t("HttpTransport: network error rejects the caller immediately", async () => {
	const tr = new HttpTransport("https://mcp.example.com/mcp", () => Promise.reject(new Error("net::ERR_CONNECTION_REFUSED")));
	const c = new McpClient(tr, 5000);
	c.start();
	await assert.rejects(() => c.initialize(), /net::ERR_CONNECTION_REFUSED/);
});

t("HttpTransport: empty body for a request rejects", async () => {
	const tr = new HttpTransport("https://mcp.example.com/mcp", () => Promise.resolve({ status: 202, headers: {}, text: "" }));
	const c = new McpClient(tr, 5000);
	c.start();
	await assert.rejects(() => c.initialize(), /empty response body/);
});

t("HttpTransport: notification POST with 202 empty body is a no-op", async () => {
	// initialize() sends a request (answered) then a notifications/initialized
	// POST with no id; that notification gets 202 + empty body and must not
	// reject the client or hang the chain.
	const tr = new HttpTransport("https://mcp.example.com/mcp", (url, headers, body) => {
		const req = JSON.parse(body);
		if (req.method === "initialize") {
			return Promise.resolve({ status: 200, headers: { "content-type": "application/json" }, text: JSON.stringify(rpcResult(req.id, { protocolVersion: "2024-11-05" })) });
		}
		return Promise.resolve({ status: 202, headers: {}, text: "" });
	});
	const c = new McpClient(tr, 2000);
	c.start();
	await c.initialize(); // must NOT reject
});

t("HttpTransport: timeout surfaces as a caller rejection", async () => {
	const tr = new HttpTransport("https://mcp.example.com/mcp", () => new Promise(() => {}), {}, 30);
	const c = new McpClient(tr, 1000);
	c.start();
	await assert.rejects(() => c.initialize(), /timed out/);
});

(async () => {
	let passed = 0;
	let failed = 0;
	for (const { name, fn } of tests) {
		try {
			await fn();
			passed++;
			console.log(`✓ ${name}`);
		} catch (err) {
			failed++;
			console.error(`✗ ${name}\n    ${err && err.message ? err.message : err}`);
		}
	}
	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
})();
