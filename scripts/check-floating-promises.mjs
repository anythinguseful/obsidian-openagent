/**
 * Floating-promise gate (sweep dimension B, done properly).
 *
 * The 2026-08-24 error/bug sweep scanned for `.then` without `.catch` with a
 * regex and recorded the limitation in its own notes: *grep cannot detect a
 * floating promise*. It genuinely cannot — `foo()` on its own line is only a
 * floating promise if the CHECKER knows `foo` returns a thenable. That needs
 * types, so this gate drives the real TypeScript type-checker over the repo
 * tsconfig and reports promise-typed expression statements.
 *
 * Two calibration facts, both learned the hard way and both load-bearing:
 *
 *  1. Obsidian's `ValueComponent.then(cb)` is a FLUENT BUILDER, not a promise
 *     (`then(cb: (component: this) => any): this`). A naive "has a callable
 *     `then` property" test flags every `t.setValue(...)` settings row — 195
 *     hits, ~190 of them false. Even TypeScript's own
 *     `checker.getPromisedTypeOfPromise()` returns a type for it. The reliable
 *     discriminator is the SECOND parameter: a real `Promise.then` accepts an
 *     `onrejected` callback, the fluent builder takes exactly one argument.
 *
 *  2. `void p` and `void p.finally(...)` do NOT handle a rejection — verified
 *     at runtime, both still raise `unhandledRejection`. Only an explicit
 *     `.catch` (or a two-argument `.then(onfulfilled, onrejected)`) does. So
 *     `void` is accepted as the repo's deliberate fire-and-forget marker ONLY
 *     when the expression also terminates in a rejection handler.
 *
 * Assignments (`this.tail = p`) are not statements-in-void: the promise is
 * stored and awaited elsewhere, so they are not reported.
 */
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ts = require(join(root, "node_modules", "typescript"));

const failures = [];
let checks = 0;

function check(ok, pass, fail = pass) {
	checks++;
	if (ok) console.log(`✓ ${pass}`);
	else failures.push(fail);
}

/* ---------------- program ---------------- */

const cfgPath = join(root, "tsconfig.json");
const rawCfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
if (rawCfg.error) {
	console.error("Cannot read tsconfig.json");
	process.exit(1);
}
const parsed = ts.parseJsonConfigFileContent(rawCfg.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

const srcDir = join(root, "src");

/**
 * A real thenable: some call signature of `then` takes an onrejected second
 * parameter. Obsidian's fluent `then(cb)` has arity 1 and is excluded.
 */
function isRealPromise(type) {
	if (!type) return false;
	if (type.isUnion?.()) return type.types.some(isRealPromise);
	const then = checker.getPropertyOfType(type, "then");
	if (!then) return false;
	const decl = then.valueDeclaration ?? then.declarations?.[0];
	if (!decl) return false;
	const thenType = checker.getTypeOfSymbolAtLocation(then, decl);
	return thenType.getCallSignatures().some((sig) => sig.getParameters().length >= 2);
}

/**
 * Strip the `void` marker / parentheses so the PROMISE is what gets type-checked.
 * `typeof (void p)` is `void`, so testing the outer node would silently skip
 * every `void`-prefixed statement — i.e. exactly the fire-and-forget calls this
 * gate exists to police.
 */
function unwrap(expr) {
	let node = expr;
	while (ts.isVoidExpression(node) || ts.isParenthesizedExpression(node)) node = node.expression;
	return node;
}

/** Does this expression terminate in a rejection handler? */
function handlesRejection(expr) {
	let node = unwrap(expr);
	while (ts.isAwaitExpression(node)) node = unwrap(node.expression);
	while (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
		const name = node.expression.name.text;
		if (name === "catch") return true;
		// two-argument .then(onfulfilled, onrejected) handles it too
		if (name === "then" && node.arguments.length >= 2) return true;
		node = node.expression.expression;
	}
	return false;
}

const offenders = [];
const voidMarked = [];
let statementsScanned = 0;
let promiseStatements = 0;

for (const sf of program.getSourceFiles()) {
	if (sf.isDeclarationFile) continue;
	if (!sf.fileName.startsWith(srcDir)) continue;
	const walk = (node) => {
		if (ts.isExpressionStatement(node)) {
			statementsScanned++;
			const expr = node.expression;
			/* `x = p` stores the promise for someone else to await (the
			   PromptQueue / pdf extraction / MCP chain tails all do this), so
			   it is not dropped on the floor and is out of scope here. */
			const isAssignment =
				ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken;
			// an awaited statement is fully handled by the caller's try/catch
			const inner = unwrap(expr);
			if (!isAssignment && !ts.isAwaitExpression(inner) && isRealPromise(checker.getTypeAtLocation(inner))) {
				promiseStatements++;
				if (!handlesRejection(expr)) {
					const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
					const where = `${relative(root, sf.fileName)}:${line + 1} — ${node.getText().split("\n")[0].trim().slice(0, 90)}`;
					/* `void` is this repo's deliberate fire-and-forget marker (124+
					   uses). It does NOT actually handle a rejection, but retro-
					   fitting a `.catch` onto every one of them is a separate,
					   owner-scoped decision. Report those separately so a NEW
					   unmarked floating promise cannot hide in the crowd. */
					if (ts.isVoidExpression(expr)) voidMarked.push(where);
					else offenders.push(where);
				}
			}
		}
		ts.forEachChild(node, walk);
	};
	ts.forEachChild(sf, walk);
}

/* ---------------- corpus floor + canaries ----------------
   A scanner that finds nothing looks identical to one that passes, so assert
   the analysis actually ran over a real corpus before trusting a zero. */

check(
	program.getSourceFiles().filter((f) => !f.isDeclarationFile && f.fileName.startsWith(srcDir)).length >= 100,
	"corpus: the type-checker sees the src/ program"
);
check(statementsScanned >= 2000, `corpus: ${statementsScanned} expression statements scanned (floor 2000)`);
/* Floor 5 = the population after the v0.1.199 fixes (3 sendQueued sites, the
   markdown render, the 3 revealLeaf calls collapse into these statements).
   If a refactor drops this to 0 the gate has stopped seeing promises at all
   and its green would be meaningless. */
check(promiseStatements >= 5, `corpus: ${promiseStatements} promise-typed statements found (floor 5)`);

/* Canary: the Obsidian fluent-builder exclusion must still be doing work. If a
   future obsidian.d.ts changes `then`, this flips and the 190 false positives
   would silently come back — as a flood, not as a silent pass. */
const settingsTab = program.getSourceFile(join(root, "src", "settingsTab.ts"));
let fluentSeen = 0;
if (settingsTab) {
	const walk = (node) => {
		if (ts.isExpressionStatement(node)) {
			const t = checker.getTypeAtLocation(node.expression);
			const then = t && checker.getPropertyOfType(t, "then");
			if (then) {
				const d = then.valueDeclaration ?? then.declarations?.[0];
				if (d && !isRealPromise(t)) fluentSeen++;
			}
		}
		ts.forEachChild(node, walk);
	};
	ts.forEachChild(settingsTab, walk);
}
check(fluentSeen >= 20, `canary: ${fluentSeen} Obsidian fluent-builder statements correctly excluded (floor 20)`);

check(
	offenders.length === 0,
	"no UNMARKED floating promises in src/",
	`unmarked floating promises (${offenders.length}) — add an explicit .catch, or \`void\` if the rejection is truly ignorable:\n    ${offenders.join("\n    ")}`
);

/* Ratchet on the deliberate fire-and-forget population. These are `void`-marked
   and therefore intentional, but `void` does NOT swallow a rejection — so the
   set must not quietly grow. Lower the cap whenever sites are converted. */
const VOID_BUDGET = 96;
check(
	voidMarked.length <= VOID_BUDGET,
	`void fire-and-forget budget: ${voidMarked.length} <= ${VOID_BUDGET}`,
	`void fire-and-forget grew to ${voidMarked.length} (budget ${VOID_BUDGET}). New sites:\n    ${voidMarked.slice(VOID_BUDGET).join("\n    ")}`
);

console.log(`\n${checks} checks, ${failures.length} failed`);
if (failures.length > 0) {
	for (const f of failures) console.error(`✗ ${f}`);
	process.exit(1);
}
