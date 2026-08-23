/**
 * prompt-kit · Source
 * Ported from ibelick/prompt-kit (source) — citation chip with favicon-ish
 * icon, domain label and a hover card (title + description). Our agent
 * fetches pages via `web_fetch`; fetched URLs are listed under the answer
 * as sources. Clicking opens the page externally.
 *
 * The hover card is CSS-only (no floating-ui dependency).
 */

import { GlobeIcon } from "../icons";

export interface SourceRef {
	href: string;
	title?: string;
	description?: string;
}

function domainOf(href: string): string {
	try {
		return new URL(href).hostname.replace(/^www\./, "");
	} catch {
		return href.split("/").pop() || href;
	}
}

export function Source({ href, title, description }: SourceRef) {
	const domain = domainOf(href);
	return (
		<span className="oa-source">
			<button
				className="oa-source-chip"
				onClick={() => window.open(href, "_blank")}
				aria-label={`Open source ${domain}`}
			>
				<GlobeIcon size={11} />
				<span>{domain}</span>
			</button>
			<span className="oa-source-card" role="tooltip">
				<span className="oa-source-card-domain">{domain}</span>
				<span className="oa-source-card-title">{title || "Visited source"}</span>
				<span className="oa-source-card-desc">{description || href}</span>
			</span>
		</span>
	);
}

export function Sources({ sources }: { sources: SourceRef[] }) {
	if (sources.length === 0) return null;
	return (
		<div className="oa-sources">
			<span className="oa-sources-label">Sources</span>
			<div className="oa-sources-list">
				{sources.map((s) => (
					<Source key={s.href} {...s} />
				))}
			</div>
		</div>
	);
}
