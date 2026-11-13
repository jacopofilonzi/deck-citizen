import type { XmlNode } from "./xml-node.ts";

const SIGNATURE = "CryXmlB\0";
const HEADER_SIZE = 44;
const NODE_SIZE = 28;
const ATTRIBUTE_SIZE = 8;

/**
 * Returns true when the buffer holds a CryEngine binary XML document.
 */
export function isCryXml(data: Uint8Array): boolean {
	return data.length >= HEADER_SIZE && Buffer.from(data.subarray(0, 8)).toString("latin1") === SIGNATURE;
}

/**
 * Decodes a CryEngine binary XML ("CryXmlB") document, the format used for XML
 * files packed inside Star Citizen's Data.p4k.
 *
 * Layout (little endian): an 8 byte signature, then nine uint32 header fields
 * pointing at the node table, attribute table, child index table and string pool.
 */
export function decodeCryXml(data: Uint8Array): XmlNode {
	if (!isCryXml(data)) {
		throw new Error("Not a CryXmlB document");
	}

	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const u32 = (offset: number): number => view.getUint32(offset, true);

	const nodeTable = u32(12);
	const nodeCount = u32(16);
	const attributeTable = u32(20);
	const childTable = u32(28);
	const stringPool = u32(36);

	const decoder = new TextDecoder("utf-8");
	const stringCache = new Map<number, string>();
	const readString = (offset: number): string => {
		let value = stringCache.get(offset);
		if (value === undefined) {
			const start = stringPool + offset;
			let end = start;
			while (end < data.length && data[end] !== 0) {
				end++;
			}
			value = decoder.decode(data.subarray(start, end));
			stringCache.set(offset, value);
		}
		return value;
	};

	const build = (index: number): XmlNode => {
		const base = nodeTable + index * NODE_SIZE;
		const tag = readString(view.getInt32(base, true));
		const text = readString(view.getInt32(base + 4, true));
		const attributeCount = view.getUint16(base + 8, true);
		const childCount = view.getUint16(base + 10, true);
		const firstAttribute = view.getInt32(base + 16, true);
		const firstChild = view.getInt32(base + 20, true);

		const attrs: Record<string, string> = {};
		for (let i = 0; i < attributeCount; i++) {
			const at = attributeTable + (firstAttribute + i) * ATTRIBUTE_SIZE;
			attrs[readString(view.getInt32(at, true))] = readString(view.getInt32(at + 4, true));
		}

		const children: XmlNode[] = [];
		for (let i = 0; i < childCount; i++) {
			children.push(build(view.getInt32(childTable + (firstChild + i) * 4, true)));
		}

		return { tag, attrs, children, text: text.trim() };
	};

	if (nodeCount === 0) {
		throw new Error("CryXmlB document has no nodes");
	}
	return build(0);
}
