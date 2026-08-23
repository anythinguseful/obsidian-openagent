/**
 * Vendor build — pdf.worker dieksternalisasi (v0.1.130, audit batch 3).
 *
 * pdfjs-dist worker (1,94 MB mentah — 36% dari keseluruhan bundle pra-v0.1.130)
 * dibangun sebagai file TERPISAH `vendor/pdf.worker.min.js` (iife + minify).
 * main.js menyusut (parse startup Obsidian jauh lebih enteng); plugin memuatnya
 * runtime sebagai blob Worker lewat readBinary vault adapter — lihat
 * src/ui/attach/pdf.ts. File ini regenerable → tidak masuk git (.gitignore),
 * tapi WAJIB ada di zip rilis (scripts/release.mjs ARTIFACTS).
 *
 * Dipanggil dari: esbuild.config.mjs (production), test/real-preview/build.mjs
 * (lane attach menguji jalur worker nyata di browser), scripts/release.mjs
 * (menolak paket tanpa vendor). Tanpa argumen; idempoten.
 */
import esbuild from "esbuild";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
export const VENDOR_REL = "vendor/pdf.worker.min.js";

export async function buildVendorFile(log = true) {
	mkdirSync(resolve(root, "vendor"), { recursive: true });
	await esbuild.build({
		entryPoints: [resolve(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs")],
		// PDF.js v4 publishes its worker as ESM. Bundle the legacy entry into a
		// classic self-starting IIFE so it can still be loaded from vault bytes.
		bundle: true,
		minify: true,
		format: "iife",
		target: "es2020",
		logLevel: "silent",
		outfile: resolve(root, VENDOR_REL),
	});
	if (log) {
		const { statSync } = await import("node:fs");
		console.log(`vendor: ${VENDOR_REL} (${statSync(resolve(root, VENDOR_REL)).size} B)`);
	}
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	buildVendorFile();
}

/** true bila vendor file sudah ada — lane/release menolak jalan tanpa dia */
export function vendorExists() {
	return existsSync(resolve(root, VENDOR_REL));
}
