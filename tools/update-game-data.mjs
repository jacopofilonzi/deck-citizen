// Refreshes the game data bundled with the plugin (game-data/<build>/) from the installed
// game, with the plugin's own Data.p4k reader. The plugin reads the player's game at
// runtime; this copy is only its fallback, and the data the tests check against.
//
//   node tools/update-game-data.mjs ["<game root>"] [channel]
//   (default: C:\Program Files\Roberts Space Industries\StarCitizen, LIVE)
//
// Writes raw/*.cryxml (as stored in the game), defaultProfile.xml and
// keybinding_localization.xml as text XML, and labels.json; older build folders are removed.
import fs from "node:fs";
import path from "node:path";

import { buildLabels, readIni } from "../src/gamedata/labels.ts";
import { findEntries, readEntry } from "../src/gamedata/p4k.ts";
import { DEFAULT_GAME_LOCATION, readGameBuild } from "../src/keybinds/sources.ts";
import { decodeXml } from "../src/xml/decode.ts";

const location = { root: process.argv[2] ?? DEFAULT_GAME_LOCATION.root, channel: process.argv[3] ?? DEFAULT_GAME_LOCATION.channel };
const archive = path.join(location.root, location.channel, "Data.p4k");
const build = await readGameBuild(location);
if (!fs.existsSync(archive) || !build) {
	console.error(`Star Citizen not found in ${path.join(location.root, location.channel)}`);
	process.exit(1);
}

const FILES = {
	profile: "Data/Libs/Config/defaultProfile.xml",
	localization: "Data/Libs/Config/keybinding_localization.xml",
	strings: "Data/Localization/english/global.ini",
};
const entries = await findEntries(archive, Object.values(FILES));
const read = async (key) => {
	const entry = entries.get(FILES[key]);
	if (!entry) throw new Error(`${FILES[key]} not found in Data.p4k`);
	return readEntry(archive, entry);
};
const profile = await read("profile");
const localization = await read("localization");
const strings = await read("strings");

const escapeText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Same quoting as Python's xml.sax.saxutils.quoteattr (the format of the files so far). */
function quoteAttr(value) {
	let text = escapeText(value).replace(/\n/g, "&#10;").replace(/\r/g, "&#13;").replace(/\t/g, "&#9;");
	if (text.includes('"')) {
		text = text.includes("'") ? `"${text.replace(/"/g, "&quot;")}"` : `'${text}'`;
	} else {
		text = `"${text}"`;
	}
	return text;
}
/** Text XML, one space of indent per level (the format of the files in game-data/). */
function toXml(node, depth = 0, out = []) {
	const indent = " ".repeat(depth);
	const attrs = Object.entries(node.attrs).map(([key, value]) => ` ${key}=${quoteAttr(value)}`).join("");
	if (node.children.length === 0 && !node.text) {
		out.push(`${indent}<${node.tag}${attrs}/>`);
	} else {
		out.push(`${indent}<${node.tag}${attrs}>${escapeText(node.text)}`);
		for (const child of node.children) toXml(child, depth + 1, out);
		out.push(`${indent}</${node.tag}>`);
	}
	return out;
}
const sortKeys = (value) =>
	value && typeof value === "object" && !Array.isArray(value)
		? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]))
		: value;

const dir = path.join("game-data", build);
fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
fs.writeFileSync(path.join(dir, "raw", "defaultProfile.cryxml"), profile);
fs.writeFileSync(path.join(dir, "raw", "keybinding_localization.cryxml"), localization);
const profileRoot = decodeXml(profile);
fs.writeFileSync(path.join(dir, "defaultProfile.xml"), `${toXml(profileRoot).join("\n")}\n`);
fs.writeFileSync(path.join(dir, "keybinding_localization.xml"), `${toXml(decodeXml(localization)).join("\n")}\n`);
const labels = buildLabels(profileRoot, readIni(strings));
fs.writeFileSync(path.join(dir, "labels.json"), `${JSON.stringify(sortKeys(labels), null, "\t")}\n`);

for (const other of fs.readdirSync("game-data")) {
	if (other !== build) {
		fs.rmSync(path.join("game-data", other), { recursive: true, force: true });
		console.log(`Removed game-data/${other}`);
	}
}
console.log(`game-data/${build}: ${Object.keys(labels.actions).length} labelled actions. Run npm test, then review with git diff.`);
