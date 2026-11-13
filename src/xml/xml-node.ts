/**
 * Minimal, format-independent XML tree. Both the plain-text XML decoder and the
 * binary CryXmlB decoder produce this shape, so the rest of the plugin never
 * needs to know which format a file was stored in.
 */
export type XmlNode = {
	tag: string;
	attrs: Record<string, string>;
	children: XmlNode[];
	text: string;
};

/**
 * Returns the direct children of `node` with the given tag.
 */
export function childrenByTag(node: XmlNode, tag: string): XmlNode[] {
	return node.children.filter((child) => child.tag === tag);
}

/**
 * Returns the first direct child of `node` with the given tag.
 */
export function childByTag(node: XmlNode, tag: string): XmlNode | undefined {
	return node.children.find((child) => child.tag === tag);
}
