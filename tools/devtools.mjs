// Developer commands behind the Makefile (Windows only, like the plugin).
//
//   node tools/devtools.mjs status               which plugin Stream Deck runs: dev link or installed package
//   node tools/devtools.mjs switch-dev           back to the linked project folder (development)
//   node tools/devtools.mjs switch-prod [local]  install the latest GitHub release (or, with "local", a package of the current code)
//   node tools/devtools.mjs logs [lines]         last lines of the running plugin's log
//   node tools/devtools.mjs editor               open the group editor (development builds only)
//   node tools/devtools.mjs release <x.y.z>      tag vX.Y.Z and push it: GitHub Actions publishes the release
//
// Switching never touches profiles or settings: both versions share the plugin id, so
// keys and custom groups carry over. A backup of the profiles and of the Stream Deck
// registry key is still taken first, in .backups/ (not removed by make clean).
import { execFileSync, execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PLUGIN = "it.jacopofilonzi.deck-citizen";
const SOURCE = `${PLUGIN}.sdPlugin`;
const APPDATA = process.env.APPDATA ?? "";
const STREAM_DECK = path.join(APPDATA, "Elgato", "StreamDeck");
const INSTALLED = path.join(STREAM_DECK, "Plugins", SOURCE);
const STREAM_DECK_EXE = "C:\\Program Files\\Elgato\\StreamDeck\\StreamDeck.exe";
const REGISTRY_KEY = "HKCU\\Software\\Elgato Systems GmbH\\StreamDeck";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sh = (command, options = {}) => execSync(command, { stdio: "inherit", ...options });
const quiet = (command) => execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString();

/** "dev" (symlink to this project), "prod" (installed package), or "none". */
function mode() {
	const stat = fs.lstatSync(INSTALLED, { throwIfNoEntry: false });
	if (!stat) return "none";
	return stat.isSymbolicLink() ? "dev" : "prod";
}

function installedVersion() {
	try {
		return JSON.parse(fs.readFileSync(path.join(INSTALLED, "manifest.json"), "utf-8")).Version;
	} catch {
		return undefined;
	}
}

function isRunning() {
	return quiet('tasklist /FI "IMAGENAME eq StreamDeck.exe" /NH').includes("StreamDeck.exe");
}

async function stopStreamDeck() {
	if (!isRunning()) return;
	console.log("Closing Stream Deck…");
	quiet("taskkill /IM StreamDeck.exe /F");
	for (let i = 0; i < 40 && isRunning(); i++) await sleep(250);
	await sleep(1000); // let it release the plugin files
}

async function startStreamDeck() {
	if (isRunning()) return;
	console.log("Starting Stream Deck…");
	spawn(STREAM_DECK_EXE, [], { detached: true, stdio: "ignore" }).unref();
	await sleep(8000);
}

function backup() {
	const dir = path.join(".backups", new Date().toISOString().replace(/[:.]/g, "-"));
	fs.mkdirSync(dir, { recursive: true });
	fs.cpSync(path.join(STREAM_DECK, "ProfilesV3"), path.join(dir, "ProfilesV3"), { recursive: true });
	execFileSync("reg", ["export", REGISTRY_KEY, path.join(dir, "streamdeck.reg"), "/y"], { stdio: "ignore" });
	console.log(`Backup of profiles and settings: ${dir}`);
}

function latestLog(dir = path.join(INSTALLED, "logs")) {
	const logs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".log")) : [];
	const newest = logs.map((f) => path.join(dir, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
	return newest;
}

function printLog(lines = 20) {
	const file = latestLog();
	if (!file) {
		console.log("No plugin log yet.");
		return;
	}
	console.log(`${file}\n`);
	console.log(fs.readFileSync(file, "utf-8").trimEnd().split("\n").slice(-lines).join("\n"));
}

function status() {
	const current = mode();
	const text = { dev: "development (linked to this project folder)", prod: `installed package, version ${installedVersion() ?? "?"}`, none: "not installed" }[current];
	console.log(`Plugin: ${text}`);
	console.log(`Stream Deck: ${isRunning() ? "running" : "not running"}`);
}

async function switchDev() {
	if (mode() === "dev") {
		console.log("Already on the development version.");
		return;
	}
	backup();
	sh("npm run build");
	await stopStreamDeck();
	if (mode() === "prod") {
		// Only the plugin folder goes: profiles and settings stay with Stream Deck.
		fs.rmSync(INSTALLED, { recursive: true, force: true });
		console.log("Removed the installed package.");
	}
	sh(`npx streamdeck link ${SOURCE}`);
	await startStreamDeck();
	status();
}

async function switchProd(local) {
	let file;
	if (local) {
		sh("npm run pack");
		file = path.resolve("dist", `${PLUGIN}.streamDeckPlugin`);
	} else {
		const dir = path.join("build", "release");
		fs.rmSync(dir, { recursive: true, force: true });
		fs.mkdirSync(dir, { recursive: true });
		console.log("Downloading the latest GitHub release…");
		sh(`gh release download --pattern "*.streamDeckPlugin" --dir "${dir}"`);
		file = path.resolve(dir, `${PLUGIN}.streamDeckPlugin`);
	}
	backup();
	if (mode() === "dev") {
		sh(`npx streamdeck unlink ${PLUGIN}`);
	}
	const before = installedVersion();
	const startedAt = Date.now();
	await startStreamDeck();
	console.log("Opening the package: confirm the installation in Stream Deck.");
	sh(`start "" "${file}"`);

	// Wait for the user to confirm, then for the plugin to start.
	for (let i = 0; i < 120; i++) {
		await sleep(1000);
		const log = mode() === "prod" ? latestLog() : undefined;
		if (log && fs.statSync(log).mtimeMs > startedAt) {
			await sleep(2000);
			status();
			if (before) console.log(`(was ${before})`);
			printLog(5);
			return;
		}
	}
	console.log("No installation seen in 2 minutes. If you cancelled it, run this again (or `make switch-dev`).");
	status();
}

function openEditor() {
	if (mode() !== "dev") {
		console.log("The editor deep link exists only in development builds; open it from a key's Plugin settings instead.");
		return;
	}
	sh(`start "" "streamdeck://plugins/message/${PLUGIN}/debug/editor"`);
}

function release(version) {
	if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
		throw new Error("Usage: make release VERSION=1.2.3");
	}
	if (quiet("git status --porcelain").trim()) {
		throw new Error("Commit or stash your changes first: the release is built from the pushed commit.");
	}
	sh("git push");
	sh(`git tag -a v${version} -m v${version}`);
	sh(`git push origin v${version}`);
	console.log(`Tag v${version} pushed: GitHub Actions builds and publishes the release.`);
}

const [command, arg] = process.argv.slice(2);
const commands = {
	status,
	"switch-dev": switchDev,
	"switch-prod": () => switchProd(arg === "local"),
	logs: () => printLog(Number(arg) || 30),
	editor: openEditor,
	release: () => release(arg),
};
if (!commands[command]) {
	console.error(`Unknown command "${command ?? ""}". See the header of tools/devtools.mjs.`);
	process.exit(1);
}
try {
	await commands[command]();
} catch (err) {
	console.error(err.message);
	process.exit(1);
}
