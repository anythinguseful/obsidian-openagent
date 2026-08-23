/**
 * markdown-keys — v0.1.116 · jawaban atas "text area kita bisa gak
 * fungsinya kayak markdown editor, jadi bisa pakai fungsi tab dll"
 * (owner memilih PAKET LENGKAP). SATU mesin keydown untuk semua input
 * multi-baris plugin supaya rasanya identik di mana-mana:
 *
 *   settings stackedTextArea ×N   Enter = baris baru (list dilanjutkan)
 *   edit-area pesan (chat)        Shift+Enter = baris baru (Enter = komit)
 *   composer kaya (chat)          Enter/Shift+Enter BERTUKAR per setelan
 *                                 kirim (v0.1.127) — mesin hanya menjahit
 *                                 baris baru; chord kirim + Ctrl/Cmd+Enter
 *                                 diputuskan lapisan UI, bukan mesin
 *
 * Perilaku (selera editor Obsidian/VSCode):
 *   Tab / Shift+Tab   indent/outdent 2-spasi — seluruh baris tersentuh
 *                     saat ada seleksi; outdent tanpa indentasi = dilepas
 *                     ke perilaku bawaan (Tab tetap bisa pindah fokus)
 *   Enter di list     lanjutkan  - / * / +   |   1. → 2.   |   - [ ]   |   >
 *                     item kosong → KELUAR list (penanda dihapus + indent
 *                     turun satu level), seperti editor Obsidian
 *   auto-tutup        ( [ { " ' ` *  — hanya di depan batas kata (spasi,
 *                     penutup lain, akhir baris) supaya ketikan di tengah
 *                     kata tidak dibuntuti pasangan; seleksi → DIBUNGKUS
 *   skip-over         ketik penutup tepat sebelum penutup yang sama →
 *                     kursor melangkah, bukan menyisip dobel (ini juga
 *                     yang membuat alur ** bold terasa natural)
 *   Backspace di (|)  pasangan kosong dihapus sekaligus
 *
 * Arsitektur (pelajaran 96: satu mesin, kulit dihormati):
 *   computeMarkdownEdit  murni string — bebas DOM, bisa diuji apa pun
 *   applyCaretState      textarea sungguhan: native-setter + input event
 *                        — DETERMINISTIS ke el.value (v0.1.117: execCommand
 *                        dicabut; ia menyasar seleksi window dan pernah
 *                        menyisipkan pasangan ke composer Obsidian)
 *   composer adapter     contenteditable kaya: HANYA operasi caret via
 *                        execCommand — chip contenteditable=false tak
 *                        pernah terbelah; wrap/range ops sengaja ditolak
 */
export interface CaretState {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

export type EditKind = "indent" | "outdent" | "enter" | "pair-open" | "wrap" | "skip" | "pair-delete";

/** v0.1.127: chord kirim composer kaya — "enter" = Enter kirim / Shift+Enter
    baris baru; "shift-enter" membaliknya (bawaan baru sang owner). Chord
    Ctrl/Cmd+Enter tak pernah dimiliki mesin: ia SELALU kirim di lapisan UI. */
export type SendChord = "enter" | "shift-enter";

export interface MarkdownEdit extends CaretState {
	kind: EditKind;
}

/** event minimum — cocok struktural dengan KeyboardEvent React & DOM */
interface KeyLike {
	key: string;
	shiftKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	defaultPrevented: boolean;
	preventDefault(): void;
}

const OPENERS: Record<string, string> = {
	"(": ")",
	"[": "]",
	"{": "}",
	'"': '"',
	"'": "'",
	"`": "`",
	"*": "*",
};
const PAIRABLE = new Set(Object.keys(OPENERS));
const SKIPPABLE = new Set([")", "]", "}", '"', "'", "`", "*"]);
/** karakter di depan kursor yang membuat auto-tutup aman (bukan tengah kata) */
const BOUNDARY_RE = /[\s)\]}>"'`*.,;:!?]/;
const INDENT = "  ";

function lineStart(value: string, pos: number): number {
	return value.lastIndexOf("\n", pos - 1) + 1;
}

/** mesin murni: kembalikan keadaan baru, atau null = biarkan default browser */
export function computeMarkdownEdit(
	cur: CaretState,
	key: { key: string; shiftKey: boolean; ctrlKey?: boolean; metaKey?: boolean },
	opts: { newlineOnShiftEnter: boolean; sendKey?: SendChord }
): MarkdownEdit | null {
	const k = key.key;
	if (k === "Tab") return key.shiftKey ? outdentEdit(cur) : indentEdit(cur);
	if (k === "Enter") {
		/* v0.1.127 (owner: "ctrl enter … sebenarnya tidak berfungsi" — akar
		   terukur: chord kirim yang hanya bermakna di SATU posisi toggle jadi
		   TOMBOL MATI di posisi lain): chord kirim apapun dengan Ctrl/Cmd
		   dilepas utuh ke lapisan UI. */
		if (key.ctrlKey || key.metaKey) return null;
		/* chord kirim "shift-enter" membalik makna Enter polos/Shift+Enter
		   tanpa menyentuh jalur textarea warisan (yang tak mengirim sendKey) */
		const nlShift = opts.sendKey === "shift-enter" ? false : opts.sendKey === "enter" ? true : opts.newlineOnShiftEnter;
		const isNewline = nlShift ? key.shiftKey : !key.shiftKey;
		/* non-list tetap null → pemanggil composer memakai hard-break native
		   (v0.1.127 keylab/driveKeys: hanya jalur itu yang byte-benarkuat;
		   div-split Enter default & caret-snap text-node ujung dilumat) */
		return isNewline ? enterEdit(cur) : null;
	}
	if (k === "Backspace") {
		if (cur.selectionStart !== cur.selectionEnd) return null;
		return pairDeleteEdit(cur);
	}
	if (k.length !== 1) return null;
	const s = cur.selectionStart;
	const e = cur.selectionEnd;
	if (s !== e) {
		return PAIRABLE.has(k) ? wrapEdit(cur, k) : null;
	}
	const nextCh = s < cur.value.length ? cur.value[s] : "";
	if (SKIPPABLE.has(k) && nextCh === k) {
		return { ...cur, kind: "skip", selectionStart: s + 1, selectionEnd: s + 1 };
	}
	if (PAIRABLE.has(k) && (nextCh === "" || BOUNDARY_RE.test(nextCh))) {
		return {
			kind: "pair-open",
			value: cur.value.slice(0, s) + k + OPENERS[k] + cur.value.slice(s),
			selectionStart: s + 1,
			selectionEnd: s + 1,
		};
	}
	return null;
}

function indentEdit(cur: CaretState): MarkdownEdit {
	const { value } = cur;
	const s = cur.selectionStart;
	const e = cur.selectionEnd;
	if (s === e) {
		return {
			kind: "indent",
			value: value.slice(0, s) + INDENT + value.slice(s),
			selectionStart: s + INDENT.length,
			selectionEnd: s + INDENT.length,
		};
	}
	/* seleksi: indent setiap baris tersentuh (baris kosong dilewati); baris
	   terakhir yang berakhir persis di kolom 0 tidak ikut (selera VSCode).
	   Jangkar bergeser oleh SEMUA sisipan di depannya — bukan cuma sisipan
	   di barisnya sendiri (regresi yang mudah lolos: baris kosong di tengah
	   membuat baris berikutnya kurang geser). */
	const regionStart = lineStart(value, s);
	const regionEnd = e > s && value[e - 1] === "\n" ? e - 1 : e;
	const lines = value.slice(regionStart, regionEnd).split("\n");
	const out = lines.map((ln) => (ln.length > 0 ? INDENT + ln : ln)).join("\n");
	const shiftFor = (anchor: number): number => {
		let add = 0;
		let ls = regionStart;
		for (const ln of lines) {
			if (ln.length > 0 && anchor >= ls) add += INDENT.length;
			ls += ln.length + 1;
		}
		return add;
	};
	return {
		kind: "indent",
		value: value.slice(0, regionStart) + out + value.slice(regionEnd),
		selectionStart: s + shiftFor(s),
		selectionEnd: e + shiftFor(e),
	};
}

function outdentEdit(cur: CaretState): MarkdownEdit | null {
	const { value } = cur;
	const s = cur.selectionStart;
	const e = cur.selectionEnd;
	const regionStart = lineStart(value, s);
	const regionEnd = s !== e && value[e - 1] === "\n" ? e - 1 : e;
	const lines = value.slice(regionStart, regionEnd).split("\n");
	const removedOf = (ln: string): number =>
		ln.startsWith("\t") || ln.startsWith("\u00a0") ? 1 : Math.min(2, ln.length - ln.replace(/^[ \u00a0]+/, "").length);
	let touched = false;
	const out = lines
		.map((ln) => {
			const r = ln.length > 0 ? removedOf(ln) : 0;
			if (r > 0) touched = true;
			return ln.slice(r);
		})
		.join("\n");
	if (!touched) return null; // lepas ke default: Tab bisa pindah fokus
	/* jangkar bergeser kiri oleh SEMUA hapusan di depannya; clamp: jangkar di
	   dalam hapusan (mis. caret di antara spasi) berhenti di awal baris */
	const unshiftFor = (anchor: number): number => {
		let sub = 0;
		let ls = regionStart;
		for (const ln of lines) {
			if (ln.length > 0 && anchor >= ls) sub += Math.min(removedOf(ln), anchor - ls);
			ls += ln.length + 1;
		}
		return sub;
	};
	return {
		kind: "outdent",
		value: value.slice(0, regionStart) + out + value.slice(regionEnd),
		selectionStart: s - unshiftFor(s),
		selectionEnd: e - unshiftFor(e),
	};
}

function enterEdit(cur: CaretState): MarkdownEdit | null {
	const { value } = cur;
	const s = cur.selectionStart;
	const e = cur.selectionEnd;
	const L = lineStart(value, s);
	const nl = value.indexOf("\n", s);
	const lineEnd = nl === -1 ? value.length : nl;
	const pre = value.slice(L, s);
	const postLine = value.slice(s, lineEnd);
	const collapsed = s === e;

	const continuation = (marker: string): MarkdownEdit => {
		const ins = "\n" + marker;
		return {
			kind: "enter",
			value: value.slice(0, s) + ins + value.slice(e),
			selectionStart: s + ins.length,
			selectionEnd: s + ins.length,
		};
	};
	const exitList = (kept: string): MarkdownEdit => ({
		kind: "enter",
		value: value.slice(0, L) + kept + value.slice(lineEnd),
		selectionStart: L + kept.length,
		selectionEnd: L + kept.length,
	});

	let m = pre.match(/^([ \t\u00a0]*)([-*+])([ \u00a0]+)(\[[ xX]\][ \u00a0]*)?(.*)$/);
	if (m) {
		const [, indent, bullet, space, box, rest] = m;
		if (collapsed && rest.trim() === "" && postLine.trim() === "") {
			// item kosong → keluar satu level (penanda hilang + indent menyusut)
			return exitList(indent.replace(/[\t\u00a0]$| {1,2}$/, ""));
		}
		return continuation(indent + bullet + space + (box ? "[ ] " : ""));
	}
	m = pre.match(/^([ \t\u00a0]*)(\d+)([.)])([ \u00a0]+)(.*)$/);
	if (m) {
		const [, indent, num, sep, space, rest] = m;
		if (collapsed && rest.trim() === "" && postLine.trim() === "") {
			return exitList(indent.replace(/[\t\u00a0]$| {1,2}$/, ""));
		}
		return continuation(indent + String(parseInt(num, 10) + 1) + sep + space);
	}
	m = pre.match(/^([ \t\u00a0]*)((?:>[ \u00a0]?)+)(.*)$/);
	if (m) {
		const [, indent, quote, rest] = m;
		if (collapsed && rest.trim() === "" && postLine.trim() === "") {
			return exitList((indent + quote).replace(/>\s*$/, "").replace(/[ \t]+$/, ""));
		}
		return continuation(indent + quote);
	}
	return null;
}

function wrapEdit(cur: CaretState, key: string): MarkdownEdit {
	const s = cur.selectionStart;
	const e = cur.selectionEnd;
	return {
		kind: "wrap",
		value: cur.value.slice(0, s) + key + cur.value.slice(s, e) + OPENERS[key] + cur.value.slice(e),
		selectionStart: s + 1,
		selectionEnd: e + 1,
	};
}

function pairDeleteEdit(cur: CaretState): MarkdownEdit | null {
	const s = cur.selectionStart;
	if (s === 0 || s >= cur.value.length) return null;
	const open = cur.value[s - 1];
	if (PAIRABLE.has(open) && cur.value[s] === OPENERS[open]) {
		return {
			kind: "pair-delete",
			value: cur.value.slice(0, s - 1) + cur.value.slice(s + 1),
			selectionStart: s - 1,
			selectionEnd: s - 1,
		};
	}
	return null;
}

function composingOf(e: KeyLike): boolean {
	const ne = (e as { nativeEvent?: KeyboardEvent }).nativeEvent;
	return Boolean((ne ?? (e as unknown as KeyboardEvent)).isComposing);
}

function guarded(e: KeyLike): boolean {
	return e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || composingOf(e);
}

/** selisih minimal a→b: ganti a[p..qA) dengan b[p..qB) */
function minimalDiff(a: string, b: string): { p: number; qA: number; qB: number } | null {
	if (a === b) return null;
	let p = 0;
	while (p < a.length && p < b.length && a[p] === b[p]) p++;
	let qA = a.length;
	let qB = b.length;
	while (qA > p && qB > p && a[qA - 1] === b[qB - 1]) {
		qA--;
		qB--;
	}
	return { p, qA, qB };
}

/** terapkan CaretState ke <textarea> — DETERMINISTIS: tulis langsung ke
    el.value. v0.1.117 (owner: "mengetik simbol [] () di textarea settings
    ikut muncul di composer"): jalur execCommand("insertText") DICABUT —
    execCommand menyasar SELEKSI window (bukan element), dan di Obsidian
    asli seleksi bisa tinggal di composer contenteditable sehingga sisipan
    jatuh ke composer, cek nilai gagal, fallback MENDUPLIKASI ke textarea
    — simbol pasangan tampil di dua tempat (huruf native aman). Biaya
    sadar: Ctrl+Z bawaan berhenti di batas edit mesin; event input dipicu
    manual supaya React/Obsidian tetap sinkron. */
export function applyCaretState(el: HTMLTextAreaElement, next: CaretState): void {
	if (el.value !== next.value) {
		const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
		if (setter) {
			setter.call(el, next.value);
			el.dispatchEvent(new Event("input", { bubbles: true }));
		} else {
			el.value = next.value;
		}
	}
	el.setSelectionRange(next.selectionStart, next.selectionEnd);
}

/**
 * Adapter untuk <textarea> sungguhan (settings + edit-area pesan).
 * newlineOnShiftEnter: true untuk bidang yang Enter-nya = kirim (composer
 * chat & edit pesan) → lanjutan list menempel di Shift+Enter.
 * Return true = tombol sudah ditangani (caller tak perlu melanjutkan).
 */
export function markdownTextareaKeydown(
	e: KeyLike,
	el: HTMLTextAreaElement,
	opts: { newlineOnShiftEnter: boolean }
): boolean {
	if (guarded(e)) return false;
	const next = computeMarkdownEdit(
		{ value: el.value, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd },
		e,
		opts
	);
	if (!next) return false;
	e.preventDefault();
	applyCaretState(el, next);
	return true;
}

/**
 * potongan yang dihapus composer HARUS teks polos di sekitar caret —
 * penanda list, spasi, atau satu pasangan kosong; chip/teks pengguna tak
 * pernah disentuh (nbsp   termasuk: Chrome mengubah spasi ujung
 * baris contenteditable jadi &nbsp;).
 */
const SAFE_DELETE_RE = /^[ \t\u00a0\-*+>\d.)\]\[({}"'`xX]*$/;

/**
 * Keputusan MURNI untuk composer kaya (contenteditable + chip). Mutasi
 * DOM dilakukan PEMANGGIL lewat renderText kanoniknya sendiri — bukan
 * execCommand. Alasannya (bukti lane v0.1.116): Chrome mengubah "\n"
 * insertText jadi <div> padahal serializeComposer/caretOffsetOf composer
 * menghitung <br>, spasi ujung baris jadi &nbsp;, dan execCommand(
 * "delete") no-op pada caret kosong — rerender kanonik menjamin model
 * teks & DOM tak pernah cekcok, chip ikut ter-render ulang dengan benar.
 * Hanya operasi caret: seleksi non-collapsed & wrap ditolak pemanggil.
 */
export function markdownComposerEdit(
	e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; defaultPrevented: boolean },
	text: string,
	caret: number | null,
	/* v0.1.127: chord kirim dari setelan — cabang submit pemanggil yang
	   memutuskan Enter/Shift+Enter; mesin menjahit SISANYA jadi baris baru */
	opts?: { sendKey?: SendChord }
): MarkdownEdit | null {
	if (caret === null || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return null;
	const next = computeMarkdownEdit(
		{ value: text, selectionStart: caret, selectionEnd: caret },
		e,
		{ newlineOnShiftEnter: true, sendKey: opts?.sendKey }
	);
	if (!next || next.kind === "wrap") return null;
	const d = minimalDiff(text, next.value);
	if (d) {
		const removedLen = d.qA - d.p;
		if (removedLen > 0) {
			/* hapusan harus menempel ke caret & isinya aman: penanda list,
			   spasi, atau satu pasangan kosong — bukan chip/teks pengguna */
			const removed = text.slice(d.p, d.qA);
			const touchesCaret = d.p <= caret && d.qA >= caret;
			if (!touchesCaret || !SAFE_DELETE_RE.test(removed)) return null;
			if (next.kind === "outdent" && d.qA !== caret) return null;
		}
	}
	return next;
}
