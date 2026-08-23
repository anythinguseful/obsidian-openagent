/**
 * Build stamp — replaced by esbuild `define` at bundle time (see
 * esbuild.config.mjs). Shown in Settings → Open Agent header and logged on
 * plugin load, so "which build is actually running?" stops being a guessing
 * game after every plugin-file swap (Obsidian caches require() aggressively).
 */

declare const __OA_BUILD_STAMP__: string | undefined;
declare const __OA_VERSION__: string | undefined;

export const BUILD_STAMP: string =
	typeof __OA_BUILD_STAMP__ !== "undefined" && __OA_BUILD_STAMP__ ? __OA_BUILD_STAMP__ : "dev-build";

/** manifest.json version, baked by esbuild (v0.1.20 — powers `/version`). */
export const PLUGIN_VERSION: string =
	typeof __OA_VERSION__ !== "undefined" && __OA_VERSION__ ? __OA_VERSION__ : "dev";
