import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "it.jacopofilonzi.deck-citizen.sdPlugin";

/**
 * Packages that cannot be bundled (native code). They are kept external and
 * copied next to the bundle so Node can resolve them at runtime.
 */
const nativePackages = ["koffi", "@koromix/koffi-win32-x64"];

/**
 * True when `dest` is a file identical in size and not older than `src`. The running
 * plugin keeps the native binary open, so it must not be overwritten needlessly.
 */
function isUpToDate(src, dest) {
	const from = fs.statSync(src);
	const to = fs.statSync(dest, { throwIfNoEntry: false });
	return !!to && from.isFile() && to.isFile() && from.size === to.size && to.mtimeMs >= from.mtimeMs;
}

/**
 * Copies runtime files into the plugin folder: native packages and the bundled game data.
 */
function copyRuntimeFiles() {
	return {
		name: "copy-runtime-files",
		buildStart() {
			this.addWatchFile("game-data");
		},
		writeBundle() {
			for (const pkg of nativePackages) {
				const from = path.join("node_modules", pkg);
				if (!fs.existsSync(from)) {
					continue;
				}
				fs.cpSync(from, path.join(sdPlugin, "node_modules", pkg), {
					recursive: true,
					// Koffi ships its C++ sources; the plugin only needs the JS loader and the binary.
					filter: (src, dest) => {
						const relative = path.relative(from, src);
						return !/^(vendor|doc|lib[\\/]native)([\\/]|$)/.test(relative) && !/\.(cc|hh|h|c|S|asm|inc)$|CMakeLists\.txt$/.test(relative) && !isUpToDate(src, dest);
					},
				});
			}
			fs.rmSync(path.join(sdPlugin, "data", "defaults"), { recursive: true, force: true });
			fs.cpSync("game-data", path.join(sdPlugin, "data", "defaults"), {
				recursive: true,
				filter: (src) => !src.includes(`${path.sep}raw`),
			});
		},
	};
}

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
	input: "src/plugin.ts",
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		format: "es",
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) => {
			return url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href;
		},
	},
	external: nativePackages,
	plugins: [
		{
			name: "watch-externals",
			buildStart() {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			},
		},
		typescript({
			mapRoot: isWatching ? "./" : undefined,
		}),
		nodeResolve({
			browser: false,
			exportConditions: ["node"],
			preferBuiltins: true,
		}),
		commonjs(),
		json(),
		!isWatching && terser(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			},
		},
		copyRuntimeFiles(),
	],
};

export default config;
