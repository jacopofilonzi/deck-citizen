import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import zlib from "node:zlib";

import { GameDefaultsSource } from "../src/gamedata/game-defaults.ts";
import { findEntries, readEntry } from "../src/gamedata/p4k.ts";

const BUILD_DIR = path.join(import.meta.dirname, "..", "game-data");
const BUILD = fs.readdirSync(BUILD_DIR).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)!;
const PROFILE = fs.readFileSync(path.join(BUILD_DIR, BUILD, "defaultProfile.xml"));

type ZipFile = { name: string; data: Buffer; deflate?: boolean };

/** Small ZIP writer for tests; `zip64` writes the 64-bit records Data.p4k uses. */
function makeZip(files: ZipFile[], zip64 = false): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const file of files) {
		const body = file.deflate ? zlib.deflateRawSync(file.data) : file.data;
		const name = Buffer.from(file.name);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(file.deflate ? 8 : 0, 8);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(file.data.length, 22);
		local.writeUInt16LE(name.length, 26);
		locals.push(local, name, body);

		const extra = Buffer.alloc(zip64 ? 28 : 0);
		if (zip64) {
			extra.writeUInt16LE(1, 0);
			extra.writeUInt16LE(24, 2);
			extra.writeBigUInt64LE(BigInt(file.data.length), 4);
			extra.writeBigUInt64LE(BigInt(body.length), 12);
			extra.writeBigUInt64LE(BigInt(offset), 20);
		}
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(file.deflate ? 8 : 0, 10);
		central.writeUInt32LE(zip64 ? 0xffffffff : body.length, 20);
		central.writeUInt32LE(zip64 ? 0xffffffff : file.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt16LE(extra.length, 30);
		central.writeUInt32LE(zip64 ? 0xffffffff : offset, 42);
		centrals.push(central, name, extra);
		offset += 30 + name.length + body.length;
	}
	const cd = Buffer.concat(centrals);
	const end: Buffer[] = [];
	if (zip64) {
		const record = Buffer.alloc(56);
		record.writeUInt32LE(0x06064b50, 0);
		record.writeBigUInt64LE(BigInt(cd.length), 40);
		record.writeBigUInt64LE(BigInt(offset), 48);
		const locator = Buffer.alloc(20);
		locator.writeUInt32LE(0x07064b50, 0);
		locator.writeBigUInt64LE(BigInt(offset + cd.length), 8);
		end.push(record, locator);
	}
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt32LE(zip64 ? 0xffffffff : cd.length, 12);
	eocd.writeUInt32LE(zip64 ? 0xffffffff : offset, 16);
	return Buffer.concat([...locals, cd, ...end, eocd]);
}

const INI = Buffer.from("\ufeffui_CICockpitDoorsOpenAll=Open All Doors\r\nui_CICockpitDoorsOpenAllDesc,P=Opens every door\r\n");
const tempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "deck-citizen-test-"));

/** A fake game install: LIVE/Data.p4k and build_manifest.id. */
function fakeGame(files: ZipFile[]): string {
	const root = tempDir();
	fs.mkdirSync(path.join(root, "LIVE"));
	fs.writeFileSync(path.join(root, "LIVE", "Data.p4k"), makeZip(files, true));
	fs.writeFileSync(path.join(root, "LIVE", "build_manifest.id"), JSON.stringify({ Data: { Branch: "sc-alpha-9.9.0", Version: "9.9.100.1" } }));
	return root;
}

function source(root: string, onRead = (): void => undefined) {
	const warnings: string[] = [];
	const src = new GameDefaultsSource({
		bundledDir: BUILD_DIR,
		location: () => ({ root, channel: "LIVE" }),
		onRead,
		log: { info: () => undefined, warn: (text) => warnings.push(text) },
		cacheRoot: path.join(tempDir(), "cache"),
	});
	return { src, warnings };
}

describe("p4k archive", () => {
	for (const zip64 of [false, true]) {
		it(`finds and reads stored and deflated files (${zip64 ? "ZIP64" : "ZIP"})`, async () => {
			const file = path.join(tempDir(), "Data.p4k");
			fs.writeFileSync(file, makeZip([{ name: "Data\\A.txt", data: Buffer.from("hello") }, { name: "Data\\Libs\\B.xml", data: PROFILE, deflate: true }], zip64));
			const found = await findEntries(file, ["data/libs/b.xml", "Data/missing"]);
			assert.deepEqual([...found.keys()], ["data/libs/b.xml"]);
			assert.deepEqual(await readEntry(file, found.get("data/libs/b.xml")!), PROFILE);
		});
	}

	it("reads the real Data.p4k when Star Citizen is installed", { skip: !fs.existsSync("C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k") }, async () => {
		const archive = "C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k";
		const found = await findEntries(archive, ["Data/Libs/Config/defaultProfile.xml"]);
		const data = await readEntry(archive, found.get("Data/Libs/Config/defaultProfile.xml")!);
		assert.equal(data.toString("latin1", 0, 8), "CryXmlB\0");
	});
});

describe("game default binds", () => {
	it("reads the game files in the background, then uses the cached copy", async () => {
		const root = fakeGame([
			{ name: "Data\\Libs\\Config\\defaultProfile.xml", data: PROFILE, deflate: true },
			{ name: "Data\\Localization\\english\\global.ini", data: INI },
		]);
		let read!: () => void;
		const done = new Promise<void>((resolve) => (read = resolve));
		const { src, warnings } = source(root, () => read());

		const first = await src.load();
		assert.equal(first.origin, "bundled");
		assert.equal(src.info.reading, true);
		await done;

		const second = await src.load();
		assert.equal(second.origin, "game");
		assert.equal(second.build, "sc-alpha-9.9.1");
		assert.ok(second.actions.size > 1000);
		assert.deepEqual(src.info, { origin: "game", build: "sc-alpha-9.9.1", installedBuild: "sc-alpha-9.9.1", reading: false });
		assert.deepEqual((await src.labels()).actions["spaceship_general/v_open_all_doors"], { label: "Open All Doors", description: "Opens every door" });
		assert.deepEqual(warnings, []);
	});

	it("falls back to the bundled copy when the game files cannot be read", async () => {
		const root = fakeGame([{ name: "Data\\Other.txt", data: Buffer.from("x") }]);
		let read!: () => void;
		const done = new Promise<void>((resolve) => (read = resolve));
		const { src, warnings } = source(root, () => read());
		await src.load();
		await done;
		const layer = await src.load();
		assert.equal(layer.origin, "bundled");
		assert.equal(layer.build, BUILD);
		assert.match(src.info.error ?? "", /not found in Data\.p4k/);
		assert.equal(warnings.length, 1);
	});

	it("uses the bundled copy when the game is not installed", async () => {
		const { src } = source(path.join(tempDir(), "nowhere"));
		const layer = await src.load();
		assert.equal(layer.origin, "bundled");
		assert.equal(src.info.installedBuild, undefined);
		assert.equal(src.info.reading, false);
	});
});
