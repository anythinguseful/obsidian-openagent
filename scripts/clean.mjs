import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = [
	"main.js",
	"vendor",
	"release",
	"preview",
	"test/dist",
	"test/real-preview/out",
	"test/real-preview/frames.json",
	"test/real-preview/shots",
	"test/ui-preview.png",
	"coverage",
];

for (const rel of generated) {
	rmSync(resolve(root, rel), { recursive: true, force: true });
	console.log(`removed ${rel}`);
}
