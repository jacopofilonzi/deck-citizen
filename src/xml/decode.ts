import { XMLParser } from "fast-xml-parser";

import { decodeCryXml, isCryXml } from "./cryxml.ts";
import type { XmlNode } from "./xml-node.ts";

const ATTRIBUTES_KEY = ":@";
const TEXT_KEY = "#text";

const parser = new XMLParser({
	preserveOrder: true,
	ignoreAttributes: false,
	attributeNamePrefix: "",
	parseAttributeValue: false,
	parseTagValue: false,
	trimValues: false,
	ignoreDeclaration: true,
	ignorePiTags: true,
	commentPropName: false,
});

type OrderedEntry = Record<string, unknown>;

function toNode(entry: OrderedEntry): XmlNode | undefined {
	const tag = Object.keys(entry).find((key) => key !== ATTRIBUTES_KEY && key !== TEXT_KEY);
	if (tag === undefined) {
		return undefined;
	}

	const attrs: Record<string, string> = {};
	for (const [key, value] of Object.entries((entry[ATTRIBUTES_KEY] as Record<string, unknown>) ?? {})) {
		attrs[key] = String(value);
	}

	const children: XmlNode[] = [];
	let text = "";
	for (const child of (entry[tag] as OrderedEntry[]) ?? []) {
		if (TEXT_KEY in child) {
			text += String(child[TEXT_KEY]);
			continue;
		}
		const node = toNode(child);
		if (node) {
			children.push(node);
		}
	}

	return { tag, attrs, children, text: text.trim() };
}

/**
 * Decodes plain-text XML into an {@link XmlNode} tree.
 */
export function decodeTextXml(source: string): XmlNode {
	const entries = parser.parse(source) as OrderedEntry[];
	for (const entry of entries) {
		const node = toNode(entry);
		if (node) {
			return node;
		}
	}
	throw new Error("XML document has no root element");
}

/**
 * Decodes an XML document of any supported format, detected from its content:
 * CryEngine binary XML (as packed in Data.p4k) or plain-text XML.
 */
export function decodeXml(data: Uint8Array): XmlNode {
	if (isCryXml(data)) {
		return decodeCryXml(data);
	}
	let text = new TextDecoder("utf-8").decode(data);
	if (text.charCodeAt(0) === 0xfeff) {
		text = text.slice(1);
	}
	return decodeTextXml(text);
}
