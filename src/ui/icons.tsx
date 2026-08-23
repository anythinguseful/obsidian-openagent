/**
 * Named icons, mapped onto Obsidian's built-in Lucide set via <Icon>.
 * The export names are stable (call sites don't change); only the glyph
 * source moved from hand-copied paths to the app's own lucide icons.
 */

import { ReactElement } from "react";
import { Icon, IconProps } from "./Icon";

const make = (name: string) =>
	function NamedIcon({ size = 16, className }: IconProps): ReactElement {
		return <Icon name={name} size={size} className={className} />;
	};

export const SendIcon = make("send");
export const ArrowUpIcon = make("arrow-up");
export const StopIcon = make("square");
export const PlusIcon = make("plus");
export const CopyIcon = make("copy");
export const CheckIcon = make("check");
export const XIcon = make("x");
export const ChevronDownIcon = make("chevron-down");
export const ChevronRightIcon = make("chevron-right");
export const SettingsIcon = make("settings");
export const BrainIcon = make("brain"); /* v0.1.129: sengaja BERTAHAN — backlog brain-icon dot sedang di-park owner */
export const SparklesIcon = make("sparkles");
export const TrashIcon = make("trash-2");
export const NoteIcon = make("file-text");
export const AlertIcon = make("triangle-alert");
export const InfoIcon = make("info");
export const AlertCircleIcon = make("circle-alert");
export const ZapIcon = make("zap");
export const SearchIcon = make("search");
export const RefreshIcon = make("refresh-cw");
/* topbar conversations toggle (owner 2026-08-20). Obsidian bundles an older
   lucide where this glyph is still named "history" — current lucide renamed
   history → rotate-ccw-clock (history is the deprecated alias), so the old
   name is the one Obsidian's setIcon actually resolves. */
export const RotateCcwIcon = make("history");
export const ChevronUpIcon = make("chevron-up");
export const LayersIcon = make("layers");
export const PinIcon = make("pin");
export const GlobeIcon = make("globe");
export const UploadIcon = make("upload");
export const FileTextIcon = make("file-text");
export const FileIcon = make("file");
export const FolderIcon = make("folder");
export const ImageIcon = make("image");
export const SnippetIcon = make("message-square-text");
export const TerminalIcon = make("terminal"); /* v0.1.165: slash-popover command rows (Hermes codicon 'terminal') */
export const ArrowLeftIcon = make("arrow-left");
export const TextCursorInputIcon = make("text-cursor-input");
export const PencilIcon = make("pencil");

export const QuoteIcon = make("quote");

export const ThumbsUpIcon = make("thumbs-up");

export const ThumbsDownIcon = make("thumbs-down");
