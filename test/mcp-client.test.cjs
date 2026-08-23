/**
 * Unit tests for the MCP client (client.ts) — pure JSON-RPC over a fake
 * in-memory transport. No child_process, no real server.
 */

const { execSync } = require("child_process");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "mcp-client.cjs");
execSync(`npx esbuild src/agent/mcp/client.ts --bundle --platform=node --format=cjs --outfile=${out}`, {
	cwd: root,
	stdio: "inherit",
});

const { McpClient } = require(out);

/** Fake transport: replies via a responder(request) => response | undefined. */
class FakeTransport {
	constructor(responder) {
		this.responder = responder;
		this.sent = [];
		this.cb = null;
	}
	start() {}
	send(json) {
		const req = JSON.parse(json);
		this.sent.push(req);
		if (req.id == null) return; // notification
		const res = this.responder(req);
		if (res !== undefined) {
			const cb = this.cb;
			setImmediate(() => cb(JSON.stringify(res)));
		}
	}
	onLine(cb) {
		this.cb = cb;
	}
	close() {}
}

const TOOLS = [
	{ name: "echo", description: "Echo text", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
	{ name: "search", description: "Search", inputSchema: { type: "object", properties: {} } },
];

function happyResponder(req) {
	switch (req.method) {
		case "initialize":
			return { jsonrpc: "2.0", id: req.id, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "fake" } } };
		case "tools/list":
			return { jsonrpc: "2.0", id: req.id, result: { tools: TOOLS } };
		case "tools/call":
			return { jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: "hello from " + req.params.name }] } };
		default:
			return { jsonrpc: "2.0", id: req.id, result: {} };
	}
}

const tests = [];
function t(name, fn) {
	tests.push({ name, fn });
}

t("initialize + listTools returns schemas", async () => {
	const tr = new FakeTransport(happyResponder);
	const c = new McpClient(tr);
	c.start();
	await c.initialize();
	const tools = await c.listTools();
	assert.strictEqual(tools.length, 2);
	assert.strictEqual(tools[0].name, "echo");
	// initialize + tools/list sent
	assert.strictEqual(tr.sent.map((m) => m.method).join(","), "initialize,notifications/initialized,tools/list");
});

t("tools/list is cached (one tools/list request)", async () => {
	const tr = new FakeTransport(happyResponder);
	const c = new McpClient(tr);
	c.start();
	await c.initialize();
	await c.listTools();
	await c.listTools();
	assert.strictEqual(tr.sent.filter((m) => m.method === "tools/list").length, 1);
});

t("callTool extracts text content", async () => {
	const tr = new FakeTransport(happyResponder);
	const c = new McpClient(tr);
	c.start();
	await c.initialize();
	const text = await c.callTool("echo", { text: "hi" });
	assert.strictEqual(text, "hello from echo");
});

t("error response rejects", async () => {
	const tr = new FakeTransport((req) => {
		if (req.method === "tools/call") return { jsonrpc: "2.0", id: req.id, error: { code: -1, message: "boom" } };
		return happyResponder(req);
	});
	const c = new McpClient(tr);
	c.start();
	await c.initialize();
	await assert.rejects(() => c.callTool("echo", {}), /boom/);
});

t("isError result rejects", async () => {
	const tr = new FakeTransport((req) => {
		if (req.method === "tools/call") return { jsonrpc: "2.0", id: req.id, result: { isError: true, content: [{ type: "text", text: "nope" }] } };
		return happyResponder(req);
	});
	const c = new McpClient(tr);
	c.start();
	await c.initialize();
	await assert.rejects(() => c.callTool("echo", {}), /reported an error/);
});

t("request timeout rejects", async () => {
	const tr = new FakeTransport(() => undefined); // never responds
	const c = new McpClient(tr, 20);
	c.start();
	await assert.rejects(() => c.initialize(), /timed out after 20ms/);
});

t("output is capped", async () => {
	const big = "x".repeat(500);
	const tr = new FakeTransport((req) => {
		if (req.method === "tools/call") return { jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: big }] } };
		return happyResponder(req);
	});
	const c = new McpClient(tr, 1000, 100);
	c.start();
	await c.initialize();
	const text = await c.callTool("echo", {});
	assert.ok(text.length < 200);
	assert.ok(text.includes("truncated"));
});

t("notifications (no id) are ignored without breaking", async () => {
	const tr = new FakeTransport(happyResponder);
	const c = new McpClient(tr);
	c.start();
	// feed a notification line directly
	tr.cb(JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress" }));
	await c.initialize();
	const tools = await c.listTools();
	assert.strictEqual(tools.length, 2);
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
