/**
 * Unit tests for the web_search backend (webSearch.ts):
 *   · backend resolution (key/url gating, ddgs fallback)
 *   · DuckDuckGo HTML parser (links, snippets, redirect unwrap, entities)
 *   · Brave/Tavily/SearXNG JSON parsers
 *   · runner with a mock transport (per-backend URL + headers/body)
 *   · result formatting + bounds
 */

const { execSync } = require("child_process");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const out = path.join(__dirname, "dist", "web-search.cjs");
execSync(`npx esbuild src/agent/webSearch.ts --bundle --platform=node --format=cjs --outfile=${out}`, {
	cwd: root,
	stdio: "inherit",
});

const {
	parseDdgHtml,
	parseBraveJson,
	parseTavilyJson,
	parseSearxngJson,
	resolveSearchBackend,
	backendNeedsKey,
	formatSearchResults,
	runWebSearch,
	WEB_SEARCH_MAX_RESULTS,
} = require(out);

const tests = [];
function t(name, fn) {
	tests.push({ name, fn });
}

/* ---------------- backend resolution ---------------- */

const S = (overrides = {}) => ({ backend: "ddgs", braveKey: "", tavilyKey: "", searxngUrl: "", ...overrides });

t("resolve: ddgs default and fallback when key missing", () => {
	assert.strictEqual(resolveSearchBackend(S()), "ddgs");
	assert.strictEqual(resolveSearchBackend(S({ backend: "brave" })), "ddgs"); // no key → fallback
	assert.strictEqual(resolveSearchBackend(S({ backend: "tavily" })), "ddgs");
	assert.strictEqual(resolveSearchBackend(S({ backend: "searxng" })), "ddgs");
});

t("resolve: keyed backends selected when configured", () => {
	assert.strictEqual(resolveSearchBackend(S({ backend: "brave", braveKey: "k" })), "brave");
	assert.strictEqual(resolveSearchBackend(S({ backend: "tavily", tavilyKey: "k" })), "tavily");
	assert.strictEqual(resolveSearchBackend(S({ backend: "searxng", searxngUrl: "http://x" })), "searxng");
});

t("backendNeedsKey: reports the missing credential", () => {
	assert.strictEqual(backendNeedsKey(S()).missing, null);
	assert.strictEqual(backendNeedsKey(S({ backend: "brave" })).missing, "Brave Search API key");
	assert.strictEqual(backendNeedsKey(S({ backend: "tavily" })).missing, "Tavily API key");
	assert.strictEqual(backendNeedsKey(S({ backend: "searxng" })).missing, "SearXNG instance URL");
});

/* ---------------- parsers ---------------- */

t("ddgs parser: links + snippets + redirect unwrap", () => {
	const html = `
		<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Example &amp; Title</a>
		<a class="result__snippet">A nice &lt;b&gt;description&lt;/b&gt; here</a>
		<a class="result__a" href="https://second.example/x">Second</a>
		<a class="result__snippet">Second desc</a>
	`;
	const results = parseDdgHtml(html, 5);
	assert.strictEqual(results.length, 2);
	assert.strictEqual(results[0].title, "Example & Title");
	assert.strictEqual(results[0].url, "https://example.com/page");
	assert.strictEqual(results[0].description, "A nice description here");
	assert.strictEqual(results[0].position, 1);
	assert.strictEqual(results[1].url, "https://second.example/x");
});

t("ddgs parser: skips entries without a title", () => {
	const html = `<a class="result__a" href="https://a.example/"></a><a class="result__snippet">x</a>`;
	assert.strictEqual(parseDdgHtml(html, 5).length, 0);
});

t("ddgs parser: respects limit", () => {
	let html = "";
	for (let i = 0; i < 10; i++) html += `<a class="result__a" href="https://e${i}.example/">T${i}</a><a class="result__snippet">D${i}</a>`;
	assert.strictEqual(parseDdgHtml(html, 3).length, 3);
});

t("brave/tavily/searxng parsers map fields", () => {
	const brave = parseBraveJson({ web: { results: [{ title: "B", url: "https://b", description: "d" }] } }, 5);
	assert.deepStrictEqual(brave[0], { title: "B", url: "https://b", description: "d", position: 1 });

	const tavily = parseTavilyJson({ results: [{ title: "T", url: "https://t", content: "c" }] }, 5);
	assert.strictEqual(tavily[0].description, "c");

	const searx = parseSearxngJson({ results: [{ title: "S", url: "https://s", content: "sc" }] }, 5);
	assert.strictEqual(searx[0].title, "S");
});

t("parsers tolerate malformed payloads", () => {
	assert.deepStrictEqual(parseBraveJson({}, 5), []);
	assert.deepStrictEqual(parseTavilyJson("garbage", 5), []);
	assert.deepStrictEqual(parseSearxngJson(null, 5), []);
});

/* ---------------- runner (mock transport) ---------------- */

function mockTransport(respond) {
	const calls = [];
	const transport = async (url, headers, body) => {
		calls.push({ url, headers, body });
		return respond({ url, headers, body });
	};
	transport.calls = calls;
	return transport;
}

t("runner: ddgs hits the html endpoint with a UA", async () => {
	const transport = mockTransport(() => ({
		status: 200,
		text: `<a class="result__a" href="https://a.example/">A</a><a class="result__snippet">d</a>`,
	}));
	const results = await runWebSearch("hello", 5, S(), transport);
	assert.strictEqual(results.length, 1);
	assert.ok(transport.calls[0].url.includes("html.duckduckgo.com/html/?q=hello"));
	assert.ok(transport.calls[0].headers["User-Agent"]);
});

t("runner: brave uses the key header and parses JSON", async () => {
	const transport = mockTransport(() => ({ status: 200, text: JSON.stringify({ web: { results: [{ title: "B", url: "https://b", description: "d" }] } }) }));
	const results = await runWebSearch("q", 5, S({ backend: "brave", braveKey: "K" }), transport);
	assert.strictEqual(results[0].title, "B");
	assert.strictEqual(transport.calls[0].headers["X-Subscription-Token"], "K");
	assert.ok(transport.calls[0].url.includes("api.search.brave.com"));
});

t("runner: tavily POSTs a JSON body with the key", async () => {
	const transport = mockTransport(() => ({ status: 200, text: JSON.stringify({ results: [{ title: "T", url: "https://t", content: "c" }] }) }));
	const results = await runWebSearch("q", 5, S({ backend: "tavily", tavilyKey: "K" }), transport);
	assert.strictEqual(results[0].title, "T");
	assert.strictEqual(JSON.parse(transport.calls[0].body).api_key, "K");
});

t("runner: searxng uses the configured instance URL", async () => {
	const transport = mockTransport(() => ({ status: 200, text: JSON.stringify({ results: [{ title: "S", url: "https://s", content: "c" }] }) }));
	await runWebSearch("q", 5, S({ backend: "searxng", searxngUrl: "http://localhost:8080/" }), transport);
	assert.ok(transport.calls[0].url.startsWith("http://localhost:8080/search?q=q"));
});

t("runner: non-2xx ddgs throws with guidance", async () => {
	const transport = mockTransport(() => ({ status: 429, text: "" }));
	await assert.rejects(() => runWebSearch("q", 5, S(), transport), /rate-limited|failed/i);
});

t("runner: clamps limit to the max", async () => {
	const brave = mockTransport(() => ({ status: 200, text: JSON.stringify({ web: { results: [] } }) }));
	await runWebSearch("q", 999, S({ backend: "brave", braveKey: "K" }), brave);
	assert.ok(brave.calls[0].url.includes("count=" + WEB_SEARCH_MAX_RESULTS));
});

t("runner: empty query throws", async () => {
	await assert.rejects(() => runWebSearch("   ", 5, S(), mockTransport(() => ({ status: 200, text: "" }))), /query is required/);
});

/* ---------------- formatting ---------------- */

t("format: lists results with position/url/description", () => {
	const outStr = formatSearchResults([{ title: "T", url: "https://u", description: "d", position: 1 }], "q", "ddgs");
	assert.ok(outStr.includes("1. T"));
	assert.ok(outStr.includes("https://u"));
	assert.ok(outStr.includes("d"));
	assert.ok(outStr.includes("ddgs"));
});

t("format: empty results message", () => {
	assert.ok(formatSearchResults([], "q", "ddgs").includes("No results"));
});

/* ---------------- summary ---------------- */

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
