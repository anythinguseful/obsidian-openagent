/**
 * Smoke test: load the built bundle with a mocked `obsidian` module and
 * instantiate the plugin with a mock app to verify wiring works end to end
 * (minus the real Obsidian runtime).
 */

const Module = require("module");
const path = require("path");
const fs = require("fs");
// Anchored to the repo root so guards keep resolving paths exactly as they did
// when this harness lived in test/smoke.test.cjs.
const ROOT = path.join(__dirname, "..", "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Obsidian runtime always provides `window`; shim it for Node.
global.window = {
	setInterval,
	clearInterval,
	setTimeout,
	clearTimeout,
	moment: () => ({ format: () => "2026-07-16" }),
};

/* ---------- obsidian mock ---------- */

class MockBase {
	constructor() {}
	addClass() {}
	createDiv(o) {
		return new El();
	}
	createEl() {
		return new El();
	}
	empty() {}
	load() {}
	unload() {}
}
class El extends MockBase {
	set text(v) {}
	get style() {
		return {};
	}
	setAttribute() {}
	addEventListener() {}
	appendChild() {}
}

const obsidianMock = {
	/* Explicit mobile-like gate: the bundle/onload smoke must not acquire the
	   desktop Terminal runtime when Obsidian reports a non-desktop platform. */
	Platform: { isDesktopApp: false },
	Plugin: class extends MockBase {
		async loadData() {
			return null;
		}
		async saveData() {}
		addRibbonIcon() {}
		addCommand() {}
		/* v0.1.75: editor context menu registration goes through registerEvent */
		registerEvent() {}
		/* v0.1.81: Quick Ask CM6 ViewPlugin goes through registerEditorExtension */
		registerEditorExtension() {}
		addSettingTab() {}
		registerView() {}
		registerInterval() {}
	},
	PluginSettingTab: class extends MockBase {},
	ItemView: class extends MockBase {},
	Setting: class {
		setName() { return this; }
		setDesc() { return this; }
		addToggle() { return this; }
		addDropdown() { return this; }
		addText() { return this; }
		addTextArea() { return this; }
		addSlider() { return this; }
		addButton() { return this; }
		addExtraButton() { return this; }
	},
	Notice: class extends MockBase {},
	Component: class extends MockBase {},
	Modal: class extends MockBase {},
	FuzzySuggestModal: class extends MockBase {
		setPlaceholder() {}
	},
	TFile: class {},
	TFolder: class {},
	MarkdownRenderer: { render: async () => {} },
	normalizePath: (p) => p,
	parseYaml: () => ({}),
	setIcon: () => {},
	requestUrl: async () => {
		throw new Error("network disabled in smoke test");
	},
	moment: () => ({ format: () => "2026-07-16" }),
};

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
	if (request === "obsidian") return "obsidian-mock";
	return originalResolve.call(this, request, ...args);
};
require.cache["obsidian-mock"] = {
	id: "obsidian-mock",
	filename: "obsidian-mock",
	loaded: true,
	exports: obsidianMock,
};

/* ---------- load bundle ---------- */

const mainPath = path.join(ROOT, "main.js");
const mod = require(mainPath);
const OpenAgentPlugin = mod.default ?? mod;

if (typeof OpenAgentPlugin !== "function") {
	console.error("FAIL: default export is not a plugin class");
	process.exit(1);
}
console.log("✓ bundle loads, default export is the plugin class");

/* ---------- instantiate with mock app ---------- */

const plugin = new OpenAgentPlugin();
plugin.app = {
	vault: {
		configDir: ".obsidian",
		getName: () => "SmokeVault",
		getAbstractFileByPath: () => null,
		getMarkdownFiles: () => [],
		adapter: {
			exists: async () => false,
			mkdir: async () => {},
			list: async () => ({ files: [], folders: [] }),
			read: async () => "{}",
			write: async () => {},
			remove: async () => {},
		},
	},
	workspace: {
		getLeavesOfType: () => [],
		getRightLeaf: () => null,
		/* v0.1.161: chat panel location — the other two leaf sources */
		getLeftLeaf: () => null,
		getLeaf: () => null,
		getActiveFile: () => null,
		/* v0.1.78 (lesson 60): runAgent reads workspace.activeEditor?.editor
		   for the {} token — pin the surface so a future remove fails loud */
		activeEditor: null,
		revealLeaf: () => {},
		/* v0.1.75: registerEditorContextMenu subscribes workspace.on("editor-menu") —
		   the mock returns a bare EventRef; registerEvent only stores it */
		on: () => ({}),
	},
	metadataCache: { getFileCache: () => null },
	setting: { open() {}, openTabById() {} },
};
plugin.manifest = { id: "openagent", version: "0.1.0", name: "Open Agent", author: "anonymous" };

/* ---------- shared harness exports ---------- */

module.exports = { ROOT, read, path, fs, plugin, OpenAgentPlugin, mod, obsidianMock };
