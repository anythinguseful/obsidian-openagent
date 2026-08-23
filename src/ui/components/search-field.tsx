import { SearchIcon, XIcon } from "../icons";
import type { KeyboardEvent, Ref } from "react";

/**
 * SearchField — SATU komponen pencarian untuk seluruh UI obrolan
 * (v0.1.115, owner: "bagian mana lagi ui kita yang ada fitur searchnya?
 *  bisa disamakan semua?"). Saudara React dari searchField() di
 * settingsTab (bilah Search settings) — dua kulit:
 *
 *   "strip"  baris tanpa bingkai di dalam menu popup (model menu, profile
 *            menu, model-visibility dialog) — pengganti TIGA salinan CSS
 *            .oa-model-menu-search / .oa-profile-menu-search / .oa-vis-search
 *            (+ duplikat .oa-quickask). Garis bawah = pemisah seksi menu.
 *   "pill"   field berbingkai (panel riwayat chat) — border + radius-m.
 *
 * Kontraknya (disamai dengan komponen settings): ikon lup di kiri, tombol
 * ✕ hanya saat ada isi, Escape dua tahap (berisi → bersihkan + telan;
 * kosong → diteruskan ke pemanggil, mis. tutup menu). Kelas konteks bisa
 * dititipkan via className supaya lane/penempatan lama tak pindah.
 */
export function SearchField(props: {
	value: string;
	onValue: (v: string) => void;
	placeholder: string;
	ariaLabel: string;
	variant?: "strip" | "pill";
	className?: string;
	autoFocus?: boolean;
	inputRef?: Ref<HTMLInputElement>;
	onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
	const variant = props.variant ?? "pill";
	const clear = (): void => props.onValue("");
	return (
		<div
			className={`oa-searchbox oa-searchbox--${variant}${props.className ? ` ${props.className}` : ""}`}
			role="search"
		>
			<span className="oa-searchbox-icon" aria-hidden="true">
				<SearchIcon size={12} />
			</span>
			<input
				ref={props.inputRef}
				className="oa-searchbox-input"
				type="search"
				value={props.value}
				placeholder={props.placeholder}
				aria-label={props.ariaLabel}
				autoFocus={props.autoFocus}
				onChange={(e) => props.onValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Escape" && props.value !== "") {
						e.stopPropagation();
						clear();
						return;
					}
					props.onKeyDown?.(e);
				}}
			/>
			{props.value !== "" ? (
				<button type="button" className="oa-searchbox-clear" aria-label="Clear search" onClick={clear}>
					<XIcon size={11} />
				</button>
			) : null}
		</div>
	);
}
