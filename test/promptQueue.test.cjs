/**
 * Queued-prompt store unit tests ("queue prompt", Hermes Desktop parity):
 *   FIFO ops · promote · edit drops displayText · park gates auto-drain ·
 *   persist strips image payloads · sanitize/prune hygiene
 */

const { execSync } = require("child_process");
const path = require("path");

const out = path.join(__dirname, "dist", "promptQueue.cjs");
execSync(
	`npx esbuild src/agent/promptQueue.ts --bundle --platform=node --format=cjs --outfile=${out}`,
	{ cwd: path.join(__dirname, ".."), stdio: "inherit" }
);

const Q = require(out);

let passed = 0;
let failed = 0;
function check(ok, label) {
	if (ok) {
		passed++;
		console.log(`✓ ${label}`);
	} else {
		failed++;
		console.error(`✗ ${label}`);
	}
}

const att = (name, extra = {}) => ({ id: `a-${name}`, name, content: `[Attached ${name}]`, size: 12, ...extra });

/* ---------- FIFO ---------- */
{
	let r = Q.enqueueEntry("s-fifo", [], { text: "first", attachments: [] });
	const e1 = r.entry;
	r = Q.enqueueEntry("s-fifo", r.list, { text: "second", attachments: [att("n.md")] });
	check(r.list.length === 2 && r.list[0].text === "first" && r.list[1].id === r.entry.id, "enqueue: FIFO order, entry shape");
	check(r.list[1].attachments[0] !== att("n.md"), "enqueue: attachments cloned");

	const gone = Q.removeEntry(r.list, e1.id);
	check(gone.length === 1 && gone[0].text === "second", "remove: by id");
	check(Q.removeEntry(r.list, "nope").length === 2, "remove: unknown id is a no-op");
}

/* ---------- promote ---------- */
{
	let r = Q.enqueueEntry("s-prom", [], { text: "a", attachments: [] });
	r = Q.enqueueEntry("s-prom", r.list, { text: "b", attachments: [] });
	r = Q.enqueueEntry("s-prom", r.list, { text: "c", attachments: [] });
	const head = Q.promoteEntry(r.list, r.list[2].id);
	check(head[0].text === "c" && head[1].text === "a", "promote: to head keeps FIFO of the rest");
	check(Q.promoteEntry(r.list, r.list[0].id) === r.list, "promote: already-head is identity");
}

/* ---------- edit ---------- */
{
	let r = Q.enqueueEntry("s-edit", [], { text: "expanded body", attachments: [], displayText: "/skill run" });
	const { list, changed } = Q.updateEntry(r.list, r.entry.id, { text: "rewritten" });
	check(changed === true && list[0].text === "rewritten" && !("displayText" in list[0]), "edit: rewrites text, drops displayText projection");
	check(Q.updateEntry(list, r.entry.id, { text: "rewritten" }).changed === false, "edit: identical text is a no-op");
}

/* ---------- park gates auto-drain ---------- */
{
	check(Q.shouldAutoDrain({ isBusy: true, parked: false, queueLength: 2 }) === false, "drain: never while busy");
	check(Q.shouldAutoDrain({ isBusy: false, parked: true, queueLength: 2 }) === false, "drain: parked holds the head");
	check(Q.shouldAutoDrain({ isBusy: false, parked: false, queueLength: 0 }) === false, "drain: empty queue is quiet");
	check(Q.shouldAutoDrain({ isBusy: false, parked: false, queueLength: 1 }) === true, "drain: idle + entries flows (edge-independent)");

	Q.parkQueue("s-gate");
	check(Q.isQueueParked("s-gate") === true, "park: set");
	Q.enqueueEntry("s-gate", [], { text: "fresh intent", attachments: [] });
	check(Q.isQueueParked("s-gate") === false, "enqueue a fresh prompt lifts the park (resume gesture)");
	Q.parkQueue("s-gate2");
	Q.unparkQueue("s-gate2");
	check(Q.isQueueParked("s-gate2") === false, "unpark: manual resume gesture");
}

/* ---------- persist ---------- */
{
	const img = att("shot.png", { kind: "image", dataUrl: "data:image/png;base64,AAAA", path: "assets/shot.png" });
	const r = Q.enqueueEntry("s-pers", [], { text: "look", attachments: [img, att("doc.pdf")] });
	const disk = Q.serializeForPersist(r.entry);
	check(!("dataUrl" in disk.attachments[0]), "persist: image base64 stripped from disk copy (D2)");
	check(disk.attachments[0].name === "shot.png" && disk.attachments[0].path === "assets/shot.png", "persist: image label/path survive for the chip");
	check(disk.attachments[1].content === "[Attached doc.pdf]", "persist: text payloads kept");
	check("dataUrl" in r.entry.attachments[0], "persist: in-memory entry keeps vision payload");
}

/* ---------- sanitize / prune ---------- */
{
	const clean = Q.sanitizePromptQueue({
		ok: [
			{ text: "keep me", attachments: [{ name: "a.md" }], queuedAt: 1 },
			{ text: "   ", attachments: [] }, // empty → dropped
			"garbage",
			{ id: "x1", text: "with id", attachments: "nope" },
		],
		bad: "not-an-array",
	});
	check(Object.keys(clean).length === 1 && clean.ok.length === 2, "sanitize: drops invalid entries + non-array sids");
	check(typeof clean.ok[0].id === "string" && clean.ok[0].id.length > 0, "sanitize: missing id mints one");
	check(clean.ok[1].id === "x1" && Array.isArray(clean.ok[1].attachments), "sanitize: id kept, attachments normalized");

	const over = { s: Array.from({ length: 60 }, (_, i) => ({ text: `m${i}`, attachments: [] })) };
	check(Q.sanitizePromptQueue(over).s.length === Q.MAX_QUEUE_PER_SESSION, "sanitize: sanity cap per session");
	check(Q.sanitizePromptQueue("junk") && Object.keys(Q.sanitizePromptQueue("junk")).length === 0, "sanitize: non-object root → empty");

	const state = { live: [{ id: "1", text: "t", attachments: [], queuedAt: 1 }], dead: [{ id: "2", text: "t", attachments: [], queuedAt: 2 }] };
	check(Q.prunePromptQueue(state, (sid) => sid === "live") === true && !("dead" in state) && "live" in state, "prune: dead-session queues dropped, live kept");
	check(Q.prunePromptQueue(state, () => true) === false, "prune: idempotent on a healthy state");
}

/* ---------- serialized persistence race regressions ---------- */
(async () => {
	const queued = (id, text, attachments = []) => ({ id, text, attachments, queuedAt: Number(id.replace(/\D/g, "")) || 1 });
	const deferred = () => {
		let resolve;
		let reject;
		const promise = new Promise((ok, bad) => { resolve = ok; reject = bad; });
		return { promise, resolve, reject };
	};

	/* The same helper used by ChatApp: prepare optimistic state while holding
	   the global coordinator, then persist or restore both disk + live copies. */
	const makeHarness = (initialLive, partition = "scope-a") => {
		const sid = "session-race";
		const state = {
			promptQueue: initialLive.length ? { [sid]: initialLive.map(Q.serializeForPersist) } : {},
			promptQueueScopes: initialLive.length ? { [sid]: partition } : {},
		};
		let live = initialLive;
		const tx = new Q.SerializedQueueTransactions();
		const mutate = (update, save) => tx.run(async () => {
			const mutation = Q.prepareQueueMutation(state, sid, partition, live, update);
			if (!mutation) return false;
			live = mutation.entries;
			try {
				await save();
				return true;
			} catch {
				mutation.rollback();
				live = mutation.previousLiveEntries;
				return false;
			}
		});
		return { sid, state, tx, mutate, live: () => live };
	};

	{
		const h = makeHarness([queued("q1", "one")]);
		const firstSave = deferred();
		const order = [];
		const first = h.mutate(
			(current) => [...current, queued("q2", "two")],
			async () => { order.push("save-1-start"); await firstSave.promise; order.push("save-1-end"); }
		);
		const second = h.mutate(
			(current) => [...current, queued("q3", "three")],
			async () => { order.push("save-2"); }
		);
		await Promise.resolve();
		await Promise.resolve();
		check(order.join(",") === "save-1-start" && h.tx.pending === 2, "race: overlapping mutations wait behind one global FIFO mutex");
		check(
			Q.shouldAutoDrain({ isBusy: false, parked: false, queueLength: h.live().length, persistencePending: h.tx.pending }) === false,
			"race: optimistic queue cannot auto-drain while persistence is pending"
		);
		firstSave.resolve();
		const results = await Promise.all([first, second]);
		check(results.every(Boolean) && order.join(",") === "save-1-start,save-1-end,save-2", "race: second save starts only after the first commit");
		check(h.live().map((entry) => entry.text).join(",") === "one,two,three", "race: second updater evaluates against the latest committed queue");
		check(
			Q.shouldAutoDrain({ isBusy: false, parked: false, queueLength: h.live().length, persistencePending: h.tx.pending }) === true,
			"race: drain reopens after every persistence transaction settles"
		);
	}

	{
		const image = queued("q10", "inspect image", [att("shot.png", {
			kind: "image",
			dataUrl: "data:image/png;base64,LIVE",
			path: "project/shot.png",
		})]);
		const h = makeHarness([image]);
		const failedDelete = h.mutate(() => [], async () => { throw new Error("disk full"); });
		const appendAfterFailure = h.mutate(
			(current) => [...current, queued("q11", "after rollback")],
			async () => {}
		);
		const [deleted, appended] = await Promise.all([failedDelete, appendAfterFailure]);
		check(deleted === false && appended === true, "race: persistence failure rolls back before the next mutation runs");
		check(h.live().map((entry) => entry.text).join(",") === "inspect image,after rollback", "race: failed mutation cannot erase or resurrect an intermediate list");
		check(h.live()[0].attachments[0].dataUrl === "data:image/png;base64,LIVE", "race: rollback restores the unsanitized live attachment payload");
		check(!("dataUrl" in h.state.promptQueue[h.sid][0].attachments[0]), "race: successful disk state remains sanitized after attachment rollback");
	}

	{
		const gate = deferred();
		const events = [];
		const committed = Q.afterSuccessfulQueueCommit(
			async () => { events.push("promotion-save-start"); await gate.promise; events.push("promotion-save-end"); return true; },
			() => events.push("stop-current-run")
		);
		await Promise.resolve();
		check(events.join(",") === "promotion-save-start", "promotion: current run is not stopped before the queue save commits");
		gate.resolve();
		check(await committed === true && events.join(",") === "promotion-save-start,promotion-save-end,stop-current-run", "promotion: stop follows a successful durable promotion");
		let stopped = false;
		check(
			await Q.afterSuccessfulQueueCommit(async () => false, () => { stopped = true; }) === false && !stopped,
			"promotion: failed queue commit never stops the active run"
		);
	}

	{
		const base = {
			mounted: true,
			sameSettings: true,
			currentPartition: "scope-a",
			targetPartition: "scope-a",
			sid: "session-a",
			sourceSessionId: "session-a",
			activeSessionId: "session-a",
			requireActive: true,
			ownerPartition: "scope-a",
		};
		check(Q.queueMutationTargetIsCurrent(base) === true, "ownership: matching active session and partition may mutate its queue");
		check(Q.queueMutationTargetIsCurrent({ ...base, activeSessionId: "session-b" }) === false, "ownership: delayed handler cannot mutate after an active-session switch");
		check(Q.queueMutationTargetIsCurrent({ ...base, currentPartition: "scope-b" }) === false, "ownership: delayed handler cannot cross a Workspace/session partition change");
		check(Q.queueMutationTargetIsCurrent({ ...base, ownerPartition: "scope-b" }) === false, "ownership: mismatched queue provenance fails closed");
		check(Q.queueMutationTargetIsCurrent({ ...base, mounted: false }) === false, "ownership: unmounted Chat view cannot claim a queued target");
	}

	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
})().catch((error) => {
	console.error(error);
	process.exit(1);
});
