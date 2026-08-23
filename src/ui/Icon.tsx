/**
 * Icon — React wrapper around Obsidian's built-in Lucide set.
 * Uses the app's own `setIcon()` so every glyph is the exact lucide icon
 * Obsidian ships: no hand-copied paths, no bundled icon dependency, and
 * icon revisions follow the host app automatically.
 */

import { setIcon } from "obsidian";
import { useEffect, useRef } from "react";

export interface IconProps {
	size?: number;
	className?: string;
}

export function Icon({ name, size = 16, className }: IconProps & { name: string }) {
	const ref = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		if (ref.current) setIcon(ref.current, name);
	}, [name]);

	return (
		<span
			ref={ref}
			className={`oa-icon${className ? ` ${className}` : ""}`}
			style={{ width: size, height: size }}
			aria-hidden="true"
		/>
	);
}
