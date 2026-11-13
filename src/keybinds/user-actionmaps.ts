import { childrenByTag, type XmlNode } from "../xml/xml-node.ts";
import { isKeyboardMouseInput, normalizeInput } from "../input/keys.ts";
import type { ActionId, BindLayer, LayerEntry } from "./types.ts";

/**
 * Converts the user's actionmaps.xml into a bind layer. The file only lists what the
 * user changed: an action appears only if it was rebound, and an empty keyboard input
 * (`kb1_ `) means the user removed the bind.
 *
 * Only keyboard/mouse rebinds are taken into account; an action rebound only on a
 * joystick keeps its default keyboard bind.
 */
export function parseUserActionmaps(root: XmlNode, name: string, profileName = "default"): BindLayer {
	const actions = new Map<ActionId, LayerEntry>();
	const profiles = childrenByTag(root, "ActionProfiles");
	const profile = profiles.find((p) => p.attrs.profileName === profileName) ?? profiles[0];

	for (const actionmap of profile ? childrenByTag(profile, "actionmap") : []) {
		const mapName = actionmap.attrs.name;
		if (!mapName) {
			continue;
		}
		for (const action of childrenByTag(actionmap, "action")) {
			const actionName = action.attrs.name;
			if (!actionName) {
				continue;
			}
			const rebinds = childrenByTag(action, "rebind").filter((rebind) => {
				const input = rebind.attrs.input;
				return input !== undefined && isKeyboardMouseInput(input);
			});
			if (rebinds.length === 0) {
				continue;
			}
			actions.set(`${mapName}/${actionName}`, {
				inputs: rebinds.map((rebind) => normalizeInput(rebind.attrs.input ?? "")).filter(Boolean),
				activationMode: rebinds.find((rebind) => rebind.attrs.activationMode)?.attrs.activationMode,
			});
		}
	}

	return { name, actions, activationModes: new Map() };
}
