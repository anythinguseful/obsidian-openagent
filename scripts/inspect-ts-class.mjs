#!/usr/bin/env node
/**
 * Read-only TypeScript AST inspector for safe refactor preparation.
 *
 * Usage:
 *   node scripts/inspect-ts-class.mjs src/settingsTab.ts JsonImportModal
 *   node scripts/inspect-ts-class.mjs --print src/settingsTab.ts JsonImportModal
 *
 * It deliberately never writes files. The reported range is supplied by the
 * TypeScript parser, not a comment/text anchor or hand-rolled brace counter.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const args = process.argv.slice(2);
const print = args[0] === "--print";
if (print) args.shift();
const [file, className] = args;
if (!file || !className || args.length !== 2) {
	console.error("Usage: node scripts/inspect-ts-class.mjs [--print] <file.ts> <ClassName>");
	process.exit(2);
}

const path = resolve(file);
const source = readFileSync(path, "utf8");
const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const diagnostics = tree.parseDiagnostics;
if (diagnostics.length) {
	for (const diagnostic of diagnostics) {
		const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
		console.error(`${path}:${diagnostic.start ?? 0}: ${message}`);
	}
	process.exit(1);
}

const matches = [];
function visit(node) {
	if (ts.isClassDeclaration(node) && node.name?.text === className) matches.push(node);
	ts.forEachChild(node, visit);
}
visit(tree);
if (matches.length !== 1) {
	console.error(`${path}: expected exactly one class named ${className}; found ${matches.length}`);
	process.exit(1);
}

const node = matches[0];
const start = node.getStart(tree, false);
const end = node.end;
const line = tree.getLineAndCharacterOfPosition(start).line + 1;
const endLine = tree.getLineAndCharacterOfPosition(end).line + 1;
const result = { file, className, start, end, line, endLine, bytes: end - start };
if (print) process.stdout.write(source.slice(start, end));
else console.log(JSON.stringify(result));
