// Builds the release package: dist/it.jacopofilonzi.deck-citizen.streamDeckPlugin
//
// 1. Generates the profiles and icons (make-assets).
// 2. Copies the plugin folder to build/ without logs, the dev bundle or source maps.
// 3. Bundles a release build (no development aids, minified) into that copy.
// 4. Sets the manifest version (package.json, or PLUGIN_VERSION) and turns off the Node debugger.
// 5. Packs it with the Elgato CLI (which also validates it).
//
// The development plugin folder (linked into Stream Deck) is left untouched.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PLUGIN = "it.jacopofilonzi.deck-citizen";
const SOURCE = `${PLUGIN}.sdPlugin`;
const STAGE = path.join("build", SOURCE);
const DIST = "dist";

/** Runs a command line (all arguments here are fixed and contain no shell characters). */
const run = (command, args, env = {}) => execSync([command, ...args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))].join(" "), { stdio: "inherit", env: { ...process.env, ...env } });

// PLUGIN_VERSION (set by the release workflow from the git tag) wins over package.json.
const version = process.env.PLUGIN_VERSION || JSON.parse(fs.readFileSync("package.json", "utf-8")).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) {
	throw new Error(`Version "${version}" must look like 1.2.3 (tags: v1.2.3)`);
}

run("node", ["tools/make-assets.mjs"]);

fs.rmSync("build", { recursive: true, force: true });
fs.cpSync(SOURCE, STAGE, {
	recursive: true,
	// Runtime files (bundle, native modules, game data) are produced by the release build.
	filter: (src) => !/^(logs|bin|node_modules|data)([\/]|$)/.test(path.relative(SOURCE, src)),
});

run("npx", ["rollup", "-c"], { RELEASE: "true", PLUGIN_OUT: STAGE.split(path.sep).join("/") });

const bundle = fs.readFileSync(path.join(STAGE, "bin", "plugin.js"), "utf-8");
if (bundle.includes("/debug/")) {
	throw new Error("The release bundle still contains the debug deep links");
}

const manifestPath = path.join(STAGE, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
manifest.Version = `${version}.0`;
delete manifest.Nodejs.Debug;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);

fs.mkdirSync(DIST, { recursive: true });
run("npx", ["streamdeck", "pack", STAGE, "--output", DIST, "--force", "--no-update-check"]);
console.log(`\nPackage: ${path.join(DIST, `${PLUGIN}.streamDeckPlugin`)} (version ${manifest.Version})`);
