import type { FunctionStatus } from "../catalog/catalog.ts";
import type { Group, GroupFunction } from "../catalog/types.ts";
import { renderKey, type KeyImage } from "./key-image.ts";

/** Text shown on a key whose function cannot run. */
export function warningFor(status: FunctionStatus): KeyImage["warning"] {
	switch (status.state) {
		case "ready":
			return undefined;
		case "unbound":
			return { text: "NO BIND", severity: "warning" };
		case "unsupported":
			return { text: "UNSUPPORTED", severity: "warning" };
		case "missing":
			return { text: "MISSING", severity: "error" };
	}
}

/** Explanation for the property inspector. */
export function explainStatus(status: FunctionStatus): string | undefined {
	switch (status.state) {
		case "ready":
			return undefined;
		case "unbound":
			return "This function has no key bound in Star Citizen. To use it, bind a real key to it in the game (Options > Keybindings), then it will work from here.";
		case "unsupported":
			return `This function is bound to "${status.bindText}", which the plugin cannot send (only keyboard keys and mouse buttons are supported). Bind it to a keyboard key in Star Citizen.`;
		case "missing":
			return `${status.reason}. It may have been renamed or removed by a game update.`;
	}
}

export function functionImage(group: Group, fn: GroupFunction, status: FunctionStatus): string {
	return renderKey({
		caption: group.label,
		label: fn.label,
		icon: fn.icon ?? group.icon,
		color: group.color,
		footer: status.state === "ready" ? status.bindText : undefined,
		warning: warningFor(status),
	});
}
