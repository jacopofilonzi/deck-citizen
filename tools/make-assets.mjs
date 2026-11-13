// Generates the plugin's binary assets: the menu profiles (.streamDeckProfile) and
// the PNG plugin icon. Run by `npm run build`; output goes into the .sdPlugin folder.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const SD_PLUGIN = "it.jacopofilonzi.deck-citizen.sdPlugin";
const PLUGIN_UUID = "it.jacopofilonzi.deck-citizen";
const SLOT_UUID = `${PLUGIN_UUID}.menu-slot`;

/**
 * One menu profile per device layout. `model` is the Stream Deck model code the
 * Stream Deck app writes in its own profiles for that device.
 */
const PROFILES = [
	{ name: "SC Menu", model: "20GAA9902", columns: 5, rows: 3 },
	{ name: "SC Menu Mini", model: "20GAI9901", columns: 3, rows: 2 },
	{ name: "SC Menu XL", model: "20GAT9902", columns: 8, rows: 4 },
	{ name: "SC Menu Plus", model: "20GBD9901", columns: 4, rows: 2, encoders: true },
	{ name: "SC Menu Neo", model: "20GBJ9901", columns: 4, rows: 2 },
];

// ---------------------------------------------------------------------------
// Minimal ZIP writer (deflated files, like the profiles Elgato ships).

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return c >>> 0;
});

function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

// Fixed timestamp (2026-01-01 00:00) so rebuilding produces identical files.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function zip(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;
	for (const { name, data } of entries) {
		const nameBytes = Buffer.from(name, "utf-8");
		const raw = data ?? Buffer.alloc(0);
		const method = data === undefined ? 0 : 8;
		const body = method === 8 ? zlib.deflateRawSync(raw) : raw;
		const crc = crc32(raw);

		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt16LE(0x0800, 6); // UTF-8 names
		local.writeUInt16LE(method, 8);
		local.writeUInt16LE(DOS_TIME, 10);
		local.writeUInt16LE(DOS_DATE, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(body.length, 18);
		local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(nameBytes.length, 26);
		locals.push(local, nameBytes, body);

		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(20, 4);
		central.writeUInt16LE(20, 6);
		central.writeUInt16LE(0x0800, 8);
		central.writeUInt16LE(method, 10);
		central.writeUInt16LE(DOS_TIME, 12);
		central.writeUInt16LE(DOS_DATE, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(body.length, 20);
		central.writeUInt32LE(raw.length, 24);
		central.writeUInt16LE(nameBytes.length, 28);
		central.writeUInt32LE(name.endsWith("/") ? 0x10 : 0, 38);
		central.writeUInt32LE(offset, 42);
		centrals.push(central, nameBytes);

		offset += local.length + nameBytes.length + body.length;
	}
	const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, ...centrals, end]);
}

// ---------------------------------------------------------------------------
// Profiles

/**
 * Stream Deck names page folders after the page UUID in base32, plus "Z". The alphabet
 * is base32hex without "U" (so "V" is 30 and "W" is 31); a "U" makes the page unreadable.
 */
function pageFolder(uuid) {
	const bytes = Buffer.from(uuid.replace(/-/g, ""), "hex");
	const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTVW";
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += alphabet[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) {
		out += alphabet[(value << (5 - bits)) & 31];
	}
	return `${out}Z`;
}

/** Stable UUID derived from a name, so rebuilding does not change the profiles. */
function stableUuid(seed) {
	const hash = crypto.createHash("sha1").update(`it.jacopofilonzi.deck-citizen:${seed}`).digest();
	hash[6] = (hash[6] & 0x0f) | 0x40;
	hash[8] = (hash[8] & 0x3f) | 0x80;
	const hex = hash.subarray(0, 16).toString("hex");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function makeProfile({ name, model, columns, rows, encoders }) {
	const profileId = stableUuid(`${name}:profile`).toUpperCase();
	const pageId = stableUuid(`${name}:page`);

	const slot = {
		Name: "Menu Slot",
		Settings: null,
		State: 0,
		States: [{ Image: "" }],
		UUID: SLOT_UUID,
	};
	const actions = {};
	for (let column = 0; column < columns; column++) {
		for (let row = 0; row < rows; row++) {
			actions[`${column},${row}`] = slot;
		}
	}
	const controllers = [{ Actions: actions, Type: "Keypad" }];
	if (encoders) {
		controllers.push({ Actions: null, Type: "Encoder" });
	}

	const root = `${profileId}.sdProfile/`;
	const json = (value) => Buffer.from(JSON.stringify(value), "utf-8");
	return zip([
		{ name: root },
		{ name: `${root}Images/` },
		{
			name: `${root}manifest.json`,
			data: json({
				Device: { Model: model, UUID: "" },
				InstalledByPluginUUID: PLUGIN_UUID,
				Name: name,
				Pages: { Current: pageId, Pages: [pageId] },
				PreconfiguredName: name,
				Version: "2.0",
			}),
		},
		{ name: `${root}Profiles/` },
		{ name: `${root}Profiles/${pageFolder(pageId)}/` },
		{ name: `${root}Profiles/${pageFolder(pageId)}/Images/` },
		{ name: `${root}Profiles/${pageFolder(pageId)}/manifest.json`, data: json({ Controllers: controllers }) },
	]);
}

// ---------------------------------------------------------------------------
// PNG icon (drawn with 4x4 supersampling)

function png(width, height, rgba) {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
	}
	const chunk = (type, data) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 6;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", header),
		chunk("IDAT", zlib.deflateSync(raw)),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

/** Plugin icon: a planet with a ring on a dark rounded square. */
function drawIcon(size) {
	const rgba = Buffer.alloc(size * size * 4);
	const ss = 4;
	const radius = size * 0.18;
	const paint = (u, v) => {
		// Rounded square background.
		const dx = Math.max(Math.abs(u - 0.5) - (0.5 - radius / size), 0);
		const dy = Math.max(Math.abs(v - 0.5) - (0.5 - radius / size), 0);
		if (Math.hypot(dx, dy) > radius / size) {
			return null;
		}
		const x = u - 0.5;
		const y = v - 0.5;
		// Tilted ring (ellipse band).
		const angle = -0.35;
		const rx = x * Math.cos(angle) - y * Math.sin(angle);
		const ry = x * Math.sin(angle) + y * Math.cos(angle);
		const ring = Math.hypot(rx / 0.4, ry / 0.13);
		const planet = Math.hypot(x, y) < 0.2;
		const ringVisible = ring > 0.86 && ring < 1.0 && !(planet && ry < 0);
		if (ringVisible) {
			return [56, 189, 248];
		}
		if (planet) {
			return y < -0.05 ? [241, 245, 249] : [148, 163, 184];
		}
		return [17, 21, 28];
	};
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let sy = 0; sy < ss; sy++) {
				for (let sx = 0; sx < ss; sx++) {
					const color = paint((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
					if (color) {
						r += color[0];
						g += color[1];
						b += color[2];
						a++;
					}
				}
			}
			const i = (py * size + px) * 4;
			rgba[i] = a ? r / a : 0;
			rgba[i + 1] = a ? g / a : 0;
			rgba[i + 2] = a ? b / a : 0;
			rgba[i + 3] = Math.round((a / (ss * ss)) * 255);
		}
	}
	return png(size, size, rgba);
}

// ---------------------------------------------------------------------------

const profilesDir = path.join(SD_PLUGIN, "profiles");
fs.rmSync(profilesDir, { recursive: true, force: true });
fs.mkdirSync(profilesDir, { recursive: true });
for (const profile of PROFILES) {
	fs.writeFileSync(path.join(profilesDir, `${profile.name}.streamDeckProfile`), makeProfile(profile));
}

const imgs = path.join(SD_PLUGIN, "imgs");
fs.mkdirSync(imgs, { recursive: true });
fs.writeFileSync(path.join(imgs, "plugin.png"), drawIcon(256));
fs.writeFileSync(path.join(imgs, "plugin@2x.png"), drawIcon(512));

console.log(`Generated ${PROFILES.length} menu profiles and the plugin icon.`);
