import { childByTag, childrenByTag, type XmlNode } from "../xml/xml-node.ts";
import { activationModeFromAttrs, inlineActivationFromAttrs } from "./activation.ts";
import { isKeyboardMouseInput, normalizeInput } from "../input/keys.ts";
import type { ActionId, ActivationMode, BindLayer, LayerEntry } from "./types.ts";

/**
 * Keyboard inputs of an `<action>` in defaultProfile.xml. The game uses three forms:
 * - attribute: `<action keyboard="ralt+np_0"/>`
 * - child:     `<action><keyboard input="q" activationMode="double_tap"/></action>`
 * - list:      `<action><keyboard><inputdata input="enter"/>...</keyboard></action>`
 */
function readKeyboard(action: XmlNode): { inputs: string[]; activationMode?: string } {
	const child = childByTag(action, "keyboard");
	if (child) {
		const raw = [child.attrs.input, ...childrenByTag(child, "inputdata").map((data) => data.attrs.input)];
		return {
			inputs: raw.filter((input): input is string => input !== undefined).map(normalizeInput).filter(Boolean),
			activationMode: child.attrs.activationMode,
		};
	}
	const attr = action.attrs.keyboard;
	return { inputs: attr === undefined ? [] : [normalizeInput(attr)].filter(Boolean) };
}

/**
 * Converts a decoded defaultProfile.xml into a bind layer.
 */
export function parseDefaultProfile(root: XmlNode, name: string, build?: string): BindLayer {
	if (root.tag !== "profile") {
		throw new Error(`Unexpected root <${root.tag}> in default profile`);
	}

	const activationModes = new Map<string, ActivationMode>();
	for (const mode of childrenByTag(childByTag(root, "ActivationModes") ?? { tag: "", attrs: {}, children: [], text: "" }, "ActivationMode")) {
		const parsed = activationModeFromAttrs(mode.attrs);
		activationModes.set(parsed.name, parsed);
	}

	const actions = new Map<ActionId, LayerEntry>();
	for (const actionmap of childrenByTag(root, "actionmap")) {
		const mapName = actionmap.attrs.name;
		if (!mapName) {
			continue;
		}
		for (const action of childrenByTag(actionmap, "action")) {
			const actionName = action.attrs.name;
			if (!actionName) {
				continue;
			}
			const keyboard = readKeyboard(action);
			actions.set(`${mapName}/${actionName}`, {
				inputs: keyboard.inputs.filter(isKeyboardMouseInput),
				activationMode: keyboard.activationMode ?? action.attrs.activationMode,
				inlineActivation: inlineActivationFromAttrs(action.attrs),
				label: action.attrs.UILabel,
			});
		}
	}

	return { name, actions, activationModes, build };
}
