import { childrenByTag, type XmlNode } from "../xml/xml-node.ts";

/** English names of action maps and actions, as shown by the editor. */
export type Labels = {
	maps: Record<string, string>;
	actions: Record<string, { label?: string; description?: string }>;
};

/**
 * Reads Data/Localization/english/global.ini: `key=value` lines; keys may carry options
 * after a comma (`ui_x,P=...`). Keys are matched case-insensitively.
 */
export function readIni(data: Buffer): Map<string, string> {
	const strings = new Map<string, string>();
	let text = data.toString("utf-8");
	if (text.charCodeAt(0) === 0xfeff) {
		text = text.slice(1);
	}
	for (const line of text.split(/\r?\n/)) {
		const eq = line.indexOf("=");
		if (eq > 0) {
			strings.set(line.slice(0, eq).split(",")[0]!.toLowerCase(), line.slice(eq + 1));
		}
	}
	return strings;
}

/**
 * Builds the labels of every action map and action of a default profile, keeping only
 * the strings the keybinds use.
 */
export function buildLabels(profile: XmlNode, strings: Map<string, string>): Labels {
	const lookup = (key: string | undefined): string | undefined => {
		if (!key?.startsWith("@")) {
			return undefined;
		}
		return strings.get(key.slice(1).toLowerCase())?.trim() || undefined;
	};
	const labels: Labels = { maps: {}, actions: {} };
	for (const actionmap of childrenByTag(profile, "actionmap")) {
		const name = actionmap.attrs.name ?? "";
		const mapLabel = lookup(actionmap.attrs.UILabel);
		if (mapLabel) {
			labels.maps[name] = mapLabel;
		}
		for (const action of childrenByTag(actionmap, "action")) {
			const label = lookup(action.attrs.UILabel);
			const description = lookup(action.attrs.UIDescription);
			const entry: { label?: string; description?: string } = {};
			if (label) entry.label = label;
			if (description && description !== label) entry.description = description;
			if (entry.label || entry.description) {
				labels.actions[`${name}/${action.attrs.name}`] = entry;
			}
		}
	}
	return labels;
}
