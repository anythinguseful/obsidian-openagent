/**
 * Lightweight markdown → html for the real-preview harness (browser shim)
 * — pure, no DOM/obsidian deps so unit tests can bundle it under node.
 * Approximation of Obsidian's MarkdownRenderer scoped to what chat prose
 * actually uses: paragraphs, headings, lists (+tasks/ordered), quotes,
 * hr, pipe tables, inline code/bold/italic, links, wikilinks.
 */

/* ---------------------------- markdown renderer --------------------------- */

const esc = (s: string): string =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
	return esc(s)
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/\*([^*]+)\*/g, "<em>$1</em>")
		/* Keep the browser harness honest about Markdown image side effects:
		   without Paket B's pre-render guard, a remote src must become a real
		   <img> and therefore be observable by Puppeteer's request listener. */
		.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="external-link">$1</a>')
		.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '<a class="internal-link" data-href="$1" href="$1">$2$1</a>');
}

export function mdToHtml(md: string): string {
	const out: string[] = [];
	const lines = md.split("\n");
	let listItems: string[] | null = null;
	let listTag: "ul" | "ol" = "ul";
	let quoteLines: string[] = [];
	let tableRows: string[] | null = null;
	let inCode = false;
	let para: string[] = [];
	const flushPara = (): void => {
		if (para.length) {
			out.push(`<p>${para.map(inline).join("<br>")}</p>`);
			para = [];
		}
	};
	const flushList = (): void => {
		if (listItems) {
			out.push(`<${listTag}>${listItems.join("")}</${listTag}>`);
			listItems = null;
		}
	};
	const flushQuote = (): void => {
		if (quoteLines.length) {
			out.push(`<blockquote><p>${quoteLines.map(inline).join("<br>")}</p></blockquote>`);
			quoteLines = [];
		}
	};
	const flushTable = (): void => {
		if (!tableRows) return;
		out.push(tableToHtml(tableRows));
		tableRows = null;
	};
	const flushAll = (): void => {
		flushPara();
		flushList();
		flushQuote();
		flushTable();
	};
	for (const line of lines) {
		const fence = line.match(/^```(\w*)\s*$/);
		if (fence) {
			flushAll();
			if (inCode) {
				out.push("</code></pre>");
				inCode = false;
			} else {
				out.push(`<pre><code class="language-${esc(fence[1] ?? "")}">`);
				inCode = true;
			}
			continue;
		}
		if (inCode) {
			out.push(esc(line) + "\n");
			continue;
		}
		const h = line.match(/^(#{1,6})\s+(.*)$/);
		if (h) {
			flushAll();
			const lvl = h[1].length;
			out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
			continue;
		}
		/* pipe table: header row, separator row, body rows */
		if (/^\s*\|.*\|\s*$/.test(line) && !isTableSeparator(line)) {
			flushPara();
			flushList();
			flushQuote();
			if (!tableRows) tableRows = [];
			tableRows.push(line);
			continue;
		}
		if (isTableSeparator(line) && tableRows) continue; // skip |---|---| marker
		/* blockquote */
		const quote = line.match(/^>\s?(.*)$/);
		if (quote) {
			flushPara();
			flushList();
			flushTable();
			quoteLines.push(quote[1]);
			continue;
		}
		/* hr */
		if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
			flushAll();
			out.push("<hr>");
			continue;
		}
		/* task list */
		const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
		if (task) {
			flushPara();
			flushQuote();
			flushTable();
			if (!listItems) {
				listItems = [];
				listTag = "ul";
			}
			const done = task[1].toLowerCase() === "x";
			listItems.push(
				`<li class="task-list-item${done ? " is-checked" : ""}"><input type="checkbox" class="task-list-item-checkbox"${done ? " checked" : ""} disabled>${inline(task[2])}</li>`
			);
			continue;
		}
		const li = line.match(/^\s*[-*]\s+(.*)$/);
		if (li) {
			flushPara();
			flushQuote();
			flushTable();
			if (!listItems) {
				listItems = [];
				listTag = "ul";
			}
			listItems.push(`<li>${inline(li[1])}</li>`);
			continue;
		}
		const oli = line.match(/^\s*\d+[.)]\s+(.*)$/);
		if (oli) {
			flushPara();
			flushQuote();
			flushTable();
			if (!listItems) {
				listItems = [];
				listTag = "ol";
			}
			listItems.push(`<li>${inline(oli[1])}</li>`);
			continue;
		}
		if (!line.trim()) {
			flushAll();
			continue;
		}
		flushList();
		flushQuote();
		flushTable();
		para.push(line);
	}
	flushAll();
	if (inCode) out.push("</code></pre>");
	return out.join("\n");
}

function isTableSeparator(line: string): boolean {
	return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function tableToHtml(rows: string[]): string {
	const cellsOf = (row: string): string[] =>
		row
			.trim()
			.replace(/^\||\|$/g, "")
			.split("|")
			.map((c) => c.trim());
	const [head, ...body] = rows;
	const th = cellsOf(head)
		.map((c) => `<th>${inline(c)}</th>`)
		.join("");
	const trs = body
		.map((r) => `<tr>${cellsOf(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
		.join("");
	return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}
