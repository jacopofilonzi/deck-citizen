import type { ActionId } from "../keybinds/types.ts";

/**
 * Runs a game action using the player's current bind.
 * - `fallback`: another action used when `action` has no bind the plugin can send.
 * - `wheel`: when the bind is the mouse wheel axis (`maxis_z`), the wheel direction to
 *   send. Lets a key or a dial drive actions the game puts on the scroll wheel.
 */
export type GameCommand = { type: "game"; action: ActionId; fallback?: ActionId; wheel?: WheelDirection };

export type WheelDirection = "up" | "down";

/**
 * Sends a fixed key or combination, e.g. `lctrl+f1`. `hold: true` keeps the keys down
 * for as long as the Stream Deck key is held; otherwise they are tapped for `holdMs`.
 */
export type KeysCommand = { type: "keys"; keys: string; holdMs?: number; hold?: boolean };

export type MacroStep = { keys: string; holdMs?: number } | { delayMs: number };

/** A sequence of key presses and pauses, run on key press. */
export type MacroCommand = { type: "macro"; steps: MacroStep[] };

/** Runs another group's function: `<groupId>/<functionId>`. */
export type RefCommand = { type: "ref"; ref: string };

export type Command = GameCommand | KeysCommand | MacroCommand | RefCommand;

export type GroupFunction = {
	id: string;
	label: string;
	/** Icon name (see render/icons.ts); falls back to the group's icon. */
	icon?: string;
	/** Ask for confirmation before running (e.g. eject, self destruct). */
	confirm?: boolean;
	command: Command;
};

/**
 * Menu layout for one grid size: `"x<col>y<row>"` (x from the left, y from the
 * bottom) -> function id. Only the listed functions appear in the menu.
 */
export type MenuLayout = Record<string, string>;

export type Group = {
	id: string;
	label: string;
	color: string;
	/** Icon name (see render/icons.ts), used for the menu key and functions without their own. */
	icon?: string;
	/** After a function is pressed in the menu: stay (true) or go back (false). */
	stayInMenu: boolean;
	functions: GroupFunction[];
	/** Layouts keyed by grid size, e.g. `"5x3"`. */
	layouts: Record<string, MenuLayout>;
	custom: boolean;
};

/** `<groupId>/<functionId>` */
export type FunctionRef = string;
