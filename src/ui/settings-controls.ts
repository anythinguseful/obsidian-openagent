/**
 * Settings data-entry controls — v0.1.108, port vanilla dari lobe-ui
 * Data Entry (owner: "tertarik dengan komponen lobe-ui data entry, apakah
 * bisa kita pakai di page setting"). SOURCE diverifikasi raw 2026-08-07
 * (docs/reference/reference-sources.md):
 *
 *   Segmented     = lobehub/lobe-ui@master src/Segmented — pembungkus antd
 *                   Segmented: radiogroup ber-thumb kartu yang MELUNCUR ke
 *                   opsi terpilih (filled: border tipis + track lembut).
 *   SliderWithInput = src/SliderWithInput — antd Slider + InputNumber satu
 *                   baris: slider flex:1, kotak angka 64px, keduanya sinkron
 *                   dua arah; `unlimitedInput` membiarkan angka melebihi
 *                   batas slider; NaN/null diabaikan; changeOnWheel default
 *                   OFF di antd jadi kita tidak memasang wheel-handler.
 *
 * Kenapa port vanilla: settings tab kita DOM Obsidian murni (nol React
 * root) dan token antd ≠ token Obsidian — pola yang sama dengan port
 * prompt-kit kita. Modul ini bebas import "obsidian" (unit-testable),
 * stilisasi hidup di styles.css (selector .oa-settings, append-at-EOF).
 *
 * Reduce-motion (audit lesson 85 ke EMPAT blok): kedua kontrol hanya
 * memakai TRANSISI visual (thumb slide, hover). Generic kill 0.01ms di
 * blok reduce-motion mengubahnya jadi instant state-change — perilaku
 * yang diinginkan — dan tak ada animasi status yang butuh jalur calm.
 */

export interface SegmentedOption {
	value: string;
	label: string;
	/** tooltip kecil di hover (opsional) */
	title?: string;
}

export interface SegmentedHandle {
	el: HTMLElement;
	getValue(): string;
	setValue(v: string): void;
}

/** antd-Segmented parity: PIL opsi diskrit sebagai rail ber-thumb geser.
    opsiSingkat didesain untuk 2-5 opsi; teks panjang jatuh ke ellipsis. */
export function createSegmented(opts: {
	options: SegmentedOption[];
	value: string;
	ariaLabel: string;
	onPick: (value: string) => void;
}): SegmentedHandle {
	const el = document.createElement("div");
	el.className = "oa-seg";
	el.setAttribute("role", "radiogroup");
	el.setAttribute("aria-label", opts.ariaLabel);

	const thumb = document.createElement("div");
	thumb.className = "oa-seg-thumb";
	thumb.setAttribute("aria-hidden", "true");

	const buttons: HTMLButtonElement[] = [];
	let current = opts.value;

	const place = () => {
		const btn = buttons.find((b) => b.dataset.value === current);
		if (!btn) {
			thumb.style.opacity = "0";
			return;
		}
		thumb.style.opacity = "";
		thumb.style.left = `${btn.offsetLeft}px`;
		thumb.style.width = `${btn.offsetWidth}px`;
	};
	const syncAria = () => {
		for (const b of buttons) {
			const on = b.dataset.value === current;
			b.setAttribute("aria-checked", String(on));
			/* roving tabindex ala pola radiogroup ARIA: satu titik tab */
			b.tabIndex = on ? 0 : -1;
		}
	};
	const pick = (v: string) => {
		if (v === current) return;
		current = v;
		syncAria();
		place();
		opts.onPick(v);
	};

	for (const o of opts.options) {
		const b = document.createElement("button");
		b.type = "button";
		b.className = "oa-seg-opt";
		b.dataset.value = o.value;
		b.setAttribute("role", "radio");
		b.textContent = o.label;
		if (o.title) b.title = o.title;
		b.addEventListener("click", () => pick(o.value));
		b.addEventListener("keydown", (ev) => {
			const idx = opts.options.findIndex((x) => x.value === current);
			let next: number | null = null;
			if (ev.key === "ArrowRight" || ev.key === "ArrowDown") next = (idx + 1) % opts.options.length;
			else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") next = (idx - 1 + opts.options.length) % opts.options.length;
			else if (ev.key === "Home") next = 0;
			else if (ev.key === "End") next = opts.options.length - 1;
			if (next !== null) {
				ev.preventDefault();
				const nv = opts.options[next].value;
				pick(nv);
				buttons.find((x) => x.dataset.value === nv)?.focus();
			}
		});
		b.addEventListener("focus", () => {
			/* fokus via Tab: thumb mengikuti fokus hanya bila opsi memang
			   terpilih — fokus ≠ seleksi di radiogroup, tapi fokus pada pemegang
			   tabindex (yang terpilih), jadi cukup reposisi defensif */
			if (b.dataset.value === current) place();
		});
		buttons.push(b);
	}

	el.appendChild(thumb);
	for (const b of buttons) el.appendChild(b);
	syncAria();
	/* ukur setelah layout — offsetWidth masih 0 sebelum elemen menempel */
	requestAnimationFrame(place);

	return {
		el,
		getValue: () => current,
		setValue: (v: string) => {
			if (buttons.some((b) => b.dataset.value === v)) pick(v);
		},
	};
}

export interface SliderInputHandle {
	el: HTMLElement;
	getValue(): number;
	setValue(v: number): void;
}

/** lobe SliderWithInput parity: slider + kotak angka sinkron dua arah.
    commit dipanggil HANYA pada perubahan sah (slider input / angka yang
    lulus parse clamp), preview ketikan menggerakkan slider tanpa commit. */
export function createSliderInput(opts: {
	ariaLabel: string;
	min: number;
	max: number;
	step: number;
	value: number;
	/** parity `unlimitedInput` lobe: batas slider tetap, kotak angka bebas
	    (clamp hanya ke min). Default false = angka di-clamp ke [min,max]. */
	unlimitedInput?: boolean;
	/** screen-reader value text (aria-valuetext); NEVER written into the
	    number input — a "%"-suffixed value would break <input type=number> */
	format?: (v: number) => string;
	/** visible unit suffix after the number box (e.g. "%") */
	unit?: string;
	commit: (v: number) => void;
}): SliderInputHandle {
	const fmt = opts.format ?? ((v: number) => String(v));
	const el = document.createElement("div");
	el.className = "oa-slideinput";

	const range = document.createElement("input");
	range.type = "range";
	range.min = String(opts.min);
	range.max = String(opts.max);
	range.step = String(opts.step);
	range.setAttribute("aria-label", opts.ariaLabel);

	const num = document.createElement("input");
	num.type = "number";
	num.min = String(opts.min);
	if (!opts.unlimitedInput) num.max = String(opts.max);
	num.step = String(opts.step);
	num.setAttribute("aria-label", `${opts.ariaLabel} (exact value)`);

	let current = opts.value;
	const sync = (v: number, from?: HTMLInputElement) => {
		current = v;
		if (from !== range) range.value = String(v);
		/* v0.1.186: the number input must carry a PLAIN number — writing a
		   formatted "80%" here was rejected by the browser and emptied the
		   box (owner: "compress when above / preserve recent tail tak muncul") */
		if (from !== num) num.value = String(v);
		range.setAttribute("aria-valuetext", fmt(v));
	};

	range.addEventListener("input", () => {
		const v = Number(range.value);
		if (!Number.isFinite(v)) return;
		sync(v, range);
		opts.commit(v);
	});

	num.addEventListener("input", () => {
		/* preview saja — tombol hapus/backspace jangan commit nilai parsial */
		const v = parseFloat(num.value);
		if (Number.isFinite(v)) {
			const lo = opts.min;
			const hi = opts.unlimitedInput ? Number.POSITIVE_INFINITY : opts.max;
			const clamped = Math.min(hi, Math.max(lo, v));
			range.value = String(Math.min(opts.max, Math.max(opts.min, clamped)));
		}
	});
	num.addEventListener("change", () => {
		const v = parseFloat(num.value);
		if (!Number.isFinite(v)) {
			/* ketikan rusak → kembalikan nilai terakhir, jangan commit (parity
			   lobe isNull/NaN guard) */
			num.value = fmt(current);
			return;
		}
		const hi = opts.unlimitedInput ? Number.POSITIVE_INFINITY : opts.max;
		const clamped = Math.min(hi, Math.max(opts.min, v));
		sync(clamped);
		opts.commit(clamped);
	});

	el.appendChild(range);
	/* v0.1.189: number + unit share one wrapper so the unit can sit INSIDE
	   the box (absolute suffix) — one seamless field, not a floating label
	   a gap away (owner: "tampilan persentase lebih menyatu / seamless"). */
	const numwrap = document.createElement("div");
	numwrap.className = "oa-slideinput-numwrap";
	numwrap.appendChild(num);
	if (opts.unit) {
		numwrap.classList.add("has-unit");
		const unit = document.createElement("span");
		unit.className = "oa-slideinput-unit";
		unit.textContent = opts.unit;
		unit.setAttribute("aria-hidden", "true");
		numwrap.appendChild(unit);
	}
	el.appendChild(numwrap);
	sync(opts.value);
	return {
		el,
		getValue: () => current,
		setValue: (v: number) => {
			const hi = opts.unlimitedInput ? Number.POSITIVE_INFINITY : opts.max;
			const clamped = Math.min(hi, Math.max(opts.min, v));
			sync(clamped);
		},
	};
}
