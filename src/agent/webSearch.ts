/**
 * Web search — the `web_search` tool backend.
 *
 * Provider model mirrors Hermes `tools/web_tools.py` (verified raw
 * 2026-08-18 @ aeabff6): one query across a pluggable backend, results are
 * title/url/description metadata only (the LLM then uses web_extract to read
 * a page). Backends:
 *   · ddgs   — DuckDuckGo HTML endpoint, no key, free (default)
 *   · brave  — Brave Search API, free-tier key
 *   · tavily — Tavily Search API, key
 *   · searxng— self-hosted SearXNG JSON API, URL
 *
 * The network call is injected as a transport so every parser is a pure
 * function unit-testable under plain node. The plugin passes Obsidian's
 * `requestUrl` in tools.ts.
 */

import type { WebSearchSettings } from "../settings";

export const WEB_SEARCH_MAX_RESULTS = 10;
export const WEB_SEARCH_DEFAULT_RESULTS = 5;

export interface WebSearchResult {
	title: string;
	url: string;
	description: string;
	position: number;
}

export interface WebSearchResponse {
	status: number;
	text: string;
	headers?: Record<string, string>;
}

/** Network transport injected by the plugin (Obsidian `requestUrl`). `body`
 * is present for POST backends (Tavily); GET backends pass undefined. */
export type WebSearchTransport = (url: string, headers?: Record<string, string>, body?: string) => Promise<WebSearchResponse>;

/** The backend that will actually run, given settings. Falls back to ddgs when
 * the selected backend lacks its credential. Honest, never silent-empty. */
export function resolveSearchBackend(s: WebSearchSettings): "ddgs" | "brave" | "tavily" | "searxng" {
	if (s.backend === "brave" && s.braveKey) return "brave";
	if (s.backend === "tavily" && s.tavilyKey) return "tavily";
	if (s.backend === "searxng" && s.searxngUrl) return "searxng";
	return "ddgs";
}

export function backendNeedsKey(s: WebSearchSettings): { backend: "ddgs" | "brave" | "tavily" | "searxng"; missing: string | null } {
	const effective = resolveSearchBackend(s);
	if (s.backend === "brave" && !s.braveKey) return { backend: effective, missing: "Brave Search API key" };
	if (s.backend === "tavily" && !s.tavilyKey) return { backend: effective, missing: "Tavily API key" };
	if (s.backend === "searxng" && !s.searxngUrl) return { backend: effective, missing: "SearXNG instance URL" };
	return { backend: effective, missing: null };
}

/* ------------------------------------------------------------------ */
/* parsers (pure)                                                      */
/* ------------------------------------------------------------------ */

/** DuckDuckGo HTML endpoint: results are <a class="result__a" href=…>title</a>
 * with a sibling <a class="result__snippet">description</a>. Strip redirect
 * wrapping (//duckduckgo.com/l/?uddg=<encoded>) back to the real URL. */
export function parseDdgHtml(html: string, limit: number): WebSearchResult[] {
	const results: WebSearchResult[] = [];
	const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
	const snippetRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
	const links: { url: string; title: string }[] = [];
	let m: RegExpExecArray | null;
	while ((m = linkRe.exec(html)) !== null && links.length < limit) {
		const rawUrl = decodeEntities(m[1]);
		const url = decodeDdgRedirect(rawUrl);
		// Decode entities first, then strip tags: DDG emits highlighted titles
		// as &lt;b&gt;…&lt;/b&gt;, which would otherwise survive as literal "<b>".
		const title = stripTags(decodeEntities(m[2])).trim();
		if (!title) continue;
		links.push({ url, title });
	}
	const snippets: string[] = [];
	while ((m = snippetRe.exec(html)) !== null && snippets.length < limit) {
		snippets.push(stripTags(decodeEntities(m[1])).trim());
	}
	links.forEach((link, i) => {
		results.push({
			title: link.title,
			url: link.url,
			description: snippets[i] ?? "",
			position: i + 1,
		});
	});
	return results;
}

function decodeDdgRedirect(raw: string): string {
	try {
		// DDG emits protocol-relative hrefs ("//duckduckgo.com/l/?uddg=…").
		const absolute = raw.startsWith("//") ? "https:" + raw : raw;
		const u = new URL(absolute);
		const uddg = u.searchParams.get("uddg");
		return uddg ? decodeURIComponent(uddg) : raw;
	} catch {
		return raw;
	}
}

/** Brave Search API v1: JSON { web: { results: [{title,url,description}] } }. */
export function parseBraveJson(json: unknown, limit: number): WebSearchResult[] {
	const obj = json as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
	const list = obj?.web?.results ?? [];
	return list.slice(0, limit).map((r, i) => ({
		title: String(r.title ?? ""),
		url: String(r.url ?? ""),
		description: String(r.description ?? ""),
		position: i + 1,
	}));
}

/** Tavily Search API: JSON { results: [{title,url,content}] }. */
export function parseTavilyJson(json: unknown, limit: number): WebSearchResult[] {
	const obj = json as { results?: Array<{ title?: string; url?: string; content?: string }> };
	const list = obj?.results ?? [];
	return list.slice(0, limit).map((r, i) => ({
		title: String(r.title ?? ""),
		url: String(r.url ?? ""),
		description: String(r.content ?? ""),
		position: i + 1,
	}));
}

/** SearXNG JSON API: JSON { results: [{title,url,content}] }. */
export function parseSearxngJson(json: unknown, limit: number): WebSearchResult[] {
	return parseTavilyJson(json, limit);
}

/* ------------------------------------------------------------------ */
/* formatting                                                          */
/* ------------------------------------------------------------------ */

export function formatSearchResults(results: WebSearchResult[], query: string, backend: string): string {
	if (results.length === 0) return `No results for “${query}” (backend: ${backend}).`;
	const body = results
		.map((r) => `${r.position}. ${r.title}\n   ${r.url}${r.description ? `\n   ${r.description}` : ""}`)
		.join("\n\n");
	return `Web search “${query}” via ${backend} — ${results.length} result(s):\n\n${body}`;
}

/* ------------------------------------------------------------------ */
/* runner                                                              */
/* ------------------------------------------------------------------ */

export async function runWebSearch(
	query: string,
	limit: number,
	settings: WebSearchSettings,
	transport: WebSearchTransport,
): Promise<WebSearchResult[]> {
	const q = query.trim();
	if (!q) throw new Error("web_search: query is required.");
	const n = Math.max(1, Math.min(WEB_SEARCH_MAX_RESULTS, Math.floor(limit) || WEB_SEARCH_DEFAULT_RESULTS));
	const backend = resolveSearchBackend(settings);

	switch (backend) {
		case "brave": {
			const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${n}`;
			const res = await transport(url, { "X-Subscription-Token": settings.braveKey });
			assertStatus(res, "Brave");
			return parseBraveJson(safeJson(res.text), n);
		}
		case "tavily": {
			const url = "https://api.tavily.com/search";
			const res = await transport(url, { "Content-Type": "application/json" }, JSON.stringify({ api_key: settings.tavilyKey, query: q, max_results: n }));
			assertStatus(res, "Tavily");
			return parseTavilyJson(safeJson(res.text), n);
		}
		case "searxng": {
			const base = settings.searxngUrl.replace(/\/+$/, "");
			const url = `${base}/search?q=${encodeURIComponent(q)}&format=json`;
			const res = await transport(url);
			assertStatus(res, "SearXNG");
			return parseSearxngJson(safeJson(res.text), n);
		}
		case "ddgs":
		default: {
			const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
			const res = await transport(url, { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Open Agent" });
			if (!Number.isInteger(res.status) || res.status < 200 || res.status > 299) {
				throw new Error(`DuckDuckGo search failed (${res.status || "unknown status"}). Try another backend in Settings → Capabilities → Web search.`);
			}
			const results = parseDdgHtml(res.text, n);
			if (results.length === 0) {
				throw new Error("DuckDuckGo returned no parseable results (rate-limited or blocked). Try again later or configure another backend in Settings → Capabilities → Web search.");
			}
			return results;
		}
	}
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function assertStatus(res: WebSearchResponse, name: string): void {
	if (!Number.isInteger(res.status) || res.status < 200 || res.status > 299) {
		throw new Error(`${name} search failed (${res.status || "unknown status"}).`);
	}
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return {};
	}
}

function stripTags(html: string): string {
	return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function decodeEntities(text: string): string {
	return text
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ")
		.replace(/&#(\d+);/g, (_all, code: string) => String.fromCodePoint(Number(code)));
}
