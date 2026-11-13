import { decompress as zstdDecompress } from "fzstd";
import type { FileHandle } from "node:fs/promises";
import fs from "node:fs/promises";
import zlib from "node:zlib";

/**
 * Reader for Star Citizen's Data.p4k: a (very large) ZIP64 archive whose files are
 * stored, deflated or zstd-compressed (method 100). Only the files asked for are read;
 * the central directory (hundreds of MB) is scanned in chunks, never loaded whole.
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIR = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_END = 0x06064b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const METHOD_ZSTD = 100;
const CHUNK = 8 * 1024 * 1024;

export type P4kEntry = { name: string; method: number; flags: number; compressedSize: number; size: number; offset: number };

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
	const buffer = Buffer.alloc(length);
	const { bytesRead } = await file.read(buffer, 0, length, position);
	return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
}

/** Position and size of the central directory, from the (ZIP64) end records. */
async function centralDirectory(file: FileHandle): Promise<{ offset: number; size: number }> {
	const { size } = await file.stat();
	const tailLength = Math.min(size, 65_536 + 22);
	const tail = await readAt(file, size - tailLength, tailLength);
	let eocd = -1;
	for (let i = tail.length - 22; i >= 0; i--) {
		if (tail.readUInt32LE(i) === END_OF_CENTRAL_DIR) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) {
		throw new Error("Not a ZIP archive (no end of central directory)");
	}
	let cdSize = tail.readUInt32LE(eocd + 12);
	let cdOffset = tail.readUInt32LE(eocd + 16);
	const locator = eocd - 20;
	if (locator >= 0 && tail.readUInt32LE(locator) === ZIP64_LOCATOR) {
		const zip64Offset = Number(tail.readBigUInt64LE(locator + 8));
		const zip64 = await readAt(file, zip64Offset, 56);
		if (zip64.readUInt32LE(0) !== ZIP64_END) {
			throw new Error("Broken ZIP64 end record");
		}
		cdSize = Number(zip64.readBigUInt64LE(40));
		cdOffset = Number(zip64.readBigUInt64LE(48));
	}
	return { offset: cdOffset, size: cdSize };
}

/**
 * Finds files by full path (case-insensitive, `\` or `/`). Returns the entries found,
 * keyed by the requested path as given.
 */
export async function findEntries(archive: string, wanted: string[]): Promise<Map<string, P4kEntry>> {
	const normalize = (name: string): string => name.replace(/\//g, "\\").toLowerCase();
	const lookup = new Map(wanted.map((name) => [normalize(name), name]));
	const found = new Map<string, P4kEntry>();
	const file = await fs.open(archive, "r");
	try {
		const cd = await centralDirectory(file);
		let position = cd.offset;
		const end = cd.offset + cd.size;
		let pending: Buffer = Buffer.alloc(0);
		while (position < end && found.size < lookup.size) {
			const chunk = await readAt(file, position, Math.min(CHUNK, end - position));
			if (chunk.length === 0) {
				break;
			}
			position += chunk.length;
			const data = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
			let p = 0;
			while (p + 46 <= data.length) {
				if (data.readUInt32LE(p) !== CENTRAL_HEADER) {
					throw new Error(`Broken central directory at ${cd.offset + p}`);
				}
				const nameLength = data.readUInt16LE(p + 28);
				const extraLength = data.readUInt16LE(p + 30);
				const commentLength = data.readUInt16LE(p + 32);
				const recordLength = 46 + nameLength + extraLength + commentLength;
				if (p + recordLength > data.length) {
					break; // record continues in the next chunk
				}
				const name = data.toString("utf-8", p + 46, p + 46 + nameLength);
				const requested = lookup.get(normalize(name));
				if (requested !== undefined) {
					let compressedSize = data.readUInt32LE(p + 20);
					let size = data.readUInt32LE(p + 24);
					let offset = data.readUInt32LE(p + 42);
					// ZIP64 extra field: 64-bit values for the fields set to 0xFFFFFFFF, in this order.
					const extra = data.subarray(p + 46 + nameLength, p + 46 + nameLength + extraLength);
					for (let q = 0; q + 4 <= extra.length; ) {
						const id = extra.readUInt16LE(q);
						const length = extra.readUInt16LE(q + 2);
						if (id === 1) {
							let r = q + 4;
							if (size === 0xffffffff) {
								size = Number(extra.readBigUInt64LE(r));
								r += 8;
							}
							if (compressedSize === 0xffffffff) {
								compressedSize = Number(extra.readBigUInt64LE(r));
								r += 8;
							}
							if (offset === 0xffffffff) {
								offset = Number(extra.readBigUInt64LE(r));
							}
						}
						q += 4 + length;
					}
					found.set(requested, { name, method: data.readUInt16LE(p + 10), flags: data.readUInt16LE(p + 8), compressedSize, size, offset });
				}
				p += recordLength;
			}
			pending = data.subarray(p);
		}
	} finally {
		await file.close();
	}
	return found;
}

/** Reads and decompresses one entry. */
export async function readEntry(archive: string, entry: P4kEntry): Promise<Buffer> {
	const file = await fs.open(archive, "r");
	try {
		const header = await readAt(file, entry.offset, 30);
		if (header.length < 30 || header.readUInt32LE(0) !== LOCAL_HEADER) {
			throw new Error(`Broken local header for ${entry.name}`);
		}
		const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
		const data = await readAt(file, start, entry.compressedSize);
		let result: Buffer;
		switch (entry.method) {
			case METHOD_STORED:
				result = data;
				break;
			case METHOD_DEFLATE:
				result = zlib.inflateRawSync(data);
				break;
			case METHOD_ZSTD:
				result = Buffer.from(zstdDecompress(data));
				break;
			default:
				throw new Error(`${entry.name}: unsupported compression ${entry.method}`);
		}
		if (result.length !== entry.size) {
			throw new Error(`${entry.name}: expected ${entry.size} bytes, got ${result.length} (encrypted?)`);
		}
		return result;
	} finally {
		await file.close();
	}
}
