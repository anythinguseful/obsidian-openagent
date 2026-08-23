#!/usr/bin/env node
/**
 * Cross-version Mermaid parser gate for the v0.1.144 canonical normalizer.
 *
 * Dependencies intentionally stay outside the release dependency graph:
 *   OA_MERMAID_MATRIX_NODE_MODULES=/path/to/node_modules node scripts/verify-mermaid-parsers.mjs
 * The directory must contain jsdom plus aliases mermaid-114 (11.4.1),
 * mermaid-1113 (11.13.0), and mermaid-current (the npm-current version).
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repo = process.cwd();
const modules = process.env.OA_MERMAID_MATRIX_NODE_MODULES;
if (!modules) {
	console.error("Set OA_MERMAID_MATRIX_NODE_MODULES to the external parser-fixture node_modules directory.");
	process.exit(2);
}
const req = createRequire(path.join(path.resolve(modules, ".."), "package.json"));
const { JSDOM } = req("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>");
for (const key of ["window", "document", "navigator", "Element", "HTMLElement", "SVGElement", "Node", "DOMParser"]) {
	globalThis[key] = dom.window[key];
}

const work = await mkdtemp(path.join(tmpdir(), "openagent-mermaid-gate-"));
let failed = 0;
const rows = [];
try {
	const normalizerBundle = path.join(work, "normalizer.cjs");
	await build({
		entryPoints: [path.join(repo, "src/ui/markdown-preprocess.ts")],
		bundle: true,
		platform: "node",
		format: "cjs",
		outfile: normalizerBundle,
	});
	const { sanitizeMermaidSrc } = req(normalizerBundle);

	const fixtures = [
		{
			id: "R01",
			raw: "flowchart LR\n  A[Start] --> B[Done]",
			expected: "flowchart LR\n  A[Start] --> B[Done]",
		},
		{
			id: "R02",
			raw: "flowchart LR\n  A[Plan (Thought)] -->|Review (Final)| B",
			expected: "flowchart LR\n  A[\"Plan (Thought)\"] -->|\"Review (Final)\"| B",
		},
		{
			id: "R03",
			raw: "flowchart LR\n  A --> B; % komentar",
			expected: "flowchart LR\n  A --> B;\n  %% komentar",
		},
		{
			id: "R04",
			raw: "flowchart LR\n  A --> B; %% komentar",
			expected: "flowchart LR\n  A --> B;\n  %% komentar",
		},
		{
			id: "R05",
			raw: "\n%% leading comment\n\nflowchart LR\n  A[Plan (Thought)] --> B",
			expected: "\n%% leading comment\n\nflowchart LR\n  A[\"Plan (Thought)\"] --> B",
		},
		{
			id: "R06",
			raw: "%%{init: {\"theme\": \"base\"}}%%\nflowchart LR\n  A[Plan (Thought)] --> B",
			expected: "%%{init: {\"theme\": \"base\"}}%%\nflowchart LR\n  A[\"Plan (Thought)\"] --> B",
		},
		{
			id: "R07",
			raw: "flowchart LR\n  A[\"literal; % and ; %% stay\"] --> B",
			expected: "flowchart LR\n  A[\"literal; % and ; %% stay\"] --> B",
		},
		{
			id: "R08",
			raw: "flowchart LR\n  A -->|\"literal; % and ; %% stay\"| B",
			expected: "flowchart LR\n  A -->|\"literal; % and ; %% stay\"| B",
		},
		{
			id: "R09",
			raw: "flowchart LR\r\n  A[Plan (Thought)] --> B; %% komentar\r\n",
			expected: "flowchart LR\r\n  A[\"Plan (Thought)\"] --> B;\r\n  %% komentar\r\n",
		},
		{
			id: "R10-sequence",
			raw: "sequenceDiagram\n  A->>B: Call (raw); %% literal",
			expected: "sequenceDiagram\n  A->>B: Call (raw); %% literal",
		},
		{
			id: "R10-class",
			raw: "classDiagram\n  class A {\n    run(x)\n  }",
			expected: "classDiagram\n  class A {\n    run(x)\n  }",
		},
		{
			id: "R12",
			raw: "flowchart LR\n  A --> B; %% 50% user's 🚀 payload",
			expected: "flowchart LR\n  A --> B;\n  %% 50% user's 🚀 payload",
		},
	];

	const parsers = [
		["11.4.1", "mermaid-114"],
		["11.13.0", "mermaid-1113"],
		["current", "mermaid-current"],
	];
	for (const [label, alias] of parsers) {
		const resolved = req.resolve(alias);
		const imported = await import(pathToFileURL(resolved).href);
		const mermaid = imported.default ?? imported;
		mermaid.initialize({ startOnLoad: false, securityLevel: "strict", logLevel: "fatal" });
		const version = req(`${alias}/package.json`).version;
		for (const fixture of fixtures) {
			const canonical = sanitizeMermaidSrc(fixture.raw);
			const exact = canonical === fixture.expected;
			const idempotent = sanitizeMermaidSrc(canonical) === canonical;
			let parser = "PASS";
			try {
				await mermaid.parse(canonical);
			} catch (err) {
				parser = `FAIL:${String(err?.message ?? err).split("\n")[0].slice(0, 120)}`;
			}
			const pass = exact && idempotent && parser === "PASS";
			if (!pass) failed++;
			rows.push({ fixture: fixture.id, parser: label, version, exact, idempotent, parse: parser, pass });
			console.log(`${pass ? "PASS" : "FAIL"} ${fixture.id} Mermaid ${version} exact=${exact} idempotent=${idempotent} parse=${parser}`);
		}
	}
	console.log("\nPARSER_MATRIX_JSON");
	console.log(JSON.stringify(rows, null, 2));
	console.log(`\nSUMMARY ${rows.length - failed}/${rows.length} PASS`);
} finally {
	dom.window.close();
	await rm(work, { recursive: true, force: true });
}
process.exit(failed === 0 ? 0 : 1);
