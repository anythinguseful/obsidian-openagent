/** ChangedFilesCard — the "N files changed" summary closing an assistant
 *  turn (Hermes Desktop thread/changed-files-card.tsx parity 2026-08-02):
 *  one row per touched file with its operation meta; a row click opens the
 *  note (desktop opens its diff pane — approved Obsidian divergence: we have
 *  no diff infra, the vault leaf IS our review surface). Wears the tool-card
 *  chrome family (.oa-tool radius/border) instead of inventing its own. */

import { FileTextIcon } from "../icons";
import type { ChangedFile } from "./changed-files";

export interface ChangedFilesCardProps {
	files: ChangedFile[];
	onOpen: (path: string, deleted: boolean) => void;
}

export function ChangedFilesCard({ files, onOpen }: ChangedFilesCardProps) {
	return (
		<div className="oa-changed">
			<div className="oa-changed-head">
				<span className="oa-changed-count">
					{files.length === 1 ? "1 file changed" : `${files.length} files changed`}
				</span>
			</div>
			<div className="oa-changed-rows">
				{files.map((f) => (
					<button
						key={f.path}
						type="button"
						className="oa-changed-row"
						aria-label={
							f.deleted ? `${f.path} — deleted in this turn` : `Open ${f.path}`
						}
						onClick={() => onOpen(f.path, f.deleted)}
					>
						<FileTextIcon size={14} />
						<span className="oa-changed-name">{f.name}</span>
						<span className="oa-changed-meta">
							{f.touches > 1 ? `${f.verb} ×${f.touches}` : f.verb}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
