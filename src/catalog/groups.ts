import builtinData from "./builtin-groups.json" with { type: "json" };

import { parseInput } from "../input/keys.ts";
import { ICON_NAMES, isIconName } from "../render/icons.ts";
import type { ActionId } from "../keybinds/types.ts";
import type { Command, Group, GroupFunction, MacroStep, MenuLayout, WheelDirection } from "./types.ts";

const DEFAULT_COLOR = "#64748b";
const ID = /^[a-z0-9_-]+$/i;
const CELL = /^x(\d+)y(\d+)$/;
const ACTION_ID = /^[\w-]+\/[\w-]+$/;

export class GroupValidationError extends Error {}

const fail = (path: string, message: string): never => {
	throw new GroupValidationError(`${path}: ${message}`);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function readString(value: unknown, path: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		fail(path, "must be a non-empty string");
	}
	return (value as string).trim();
}

function readKeys(value: unknown, path: string): string {
	const keys = readString(value, path);
	if (!parseInput(keys)) {
		fail(path, `"${keys}" is not a key combination the plugin can send (use game key names, e.g. "lctrl+f1")`);
	}
	return keys;
}

function readCommand(raw: Record<string, unknown>, path: string): Command {
	if (raw.action !== undefined) {
		const action = readString(raw.action, `${path}.action`);
		if (!ACTION_ID.test(action)) {
			fail(`${path}.action`, 'must look like "<actionmap>/<action>"');
		}
		let fallback: ActionId | undefined;
		if (raw.fallback !== undefined) {
			fallback = readString(raw.fallback, `${path}.fallback`) as ActionId;
			if (!ACTION_ID.test(fallback)) {
				fail(`${path}.fallback`, 'must look like "<actionmap>/<action>"');
			}
		}
		if (raw.wheel !== undefined && raw.wheel !== "up" && raw.wheel !== "down") {
			fail(`${path}.wheel`, 'must be "up" or "down"');
		}
		return { type: "game", action: action as ActionId, fallback, wheel: raw.wheel as WheelDirection | undefined };
	}
	if (raw.keys !== undefined) {
		const holdMs = raw.holdMs;
		if (holdMs !== undefined && (typeof holdMs !== "number" || holdMs < 0)) {
			fail(`${path}.holdMs`, "must be a positive number");
		}
		return { type: "keys", keys: readKeys(raw.keys, `${path}.keys`), holdMs: holdMs as number | undefined, hold: raw.hold === true };
	}
	if (raw.macro !== undefined) {
		if (!Array.isArray(raw.macro) || raw.macro.length === 0) {
			fail(`${path}.macro`, "must be a non-empty list of steps");
		}
		const steps = (raw.macro as unknown[]).map((step, i): MacroStep => {
			const stepPath = `${path}.macro[${i}]`;
			if (!isObject(step)) {
				return fail(stepPath, "must be an object");
			}
			if (typeof step.delayMs === "number") {
				return { delayMs: step.delayMs };
			}
			return { keys: readKeys(step.keys, `${stepPath}.keys`), holdMs: typeof step.holdMs === "number" ? step.holdMs : undefined };
		});
		return { type: "macro", steps };
	}
	if (raw.ref !== undefined) {
		const ref = readString(raw.ref, `${path}.ref`);
		if (!/^[\w-]+\/[\w-]+$/.test(ref)) {
			fail(`${path}.ref`, 'must look like "<groupId>/<functionId>"');
		}
		return { type: "ref", ref };
	}
	return fail(path, 'needs one of "action", "keys", "macro" or "ref"');
}

function readLayouts(raw: unknown, functions: GroupFunction[], path: string): Record<string, MenuLayout> {
	if (raw === undefined) {
		return {};
	}
	if (!isObject(raw)) {
		return fail(path, "must be an object");
	}
	const ids = new Set(functions.map((fn) => fn.id));
	const layouts: Record<string, MenuLayout> = {};
	for (const [size, cells] of Object.entries(raw)) {
		if (!/^\d+x\d+$/.test(size) || !isObject(cells)) {
			fail(`${path}.${size}`, 'must be keyed by grid size like "5x3" and map cells to function ids');
		}
		const layout: MenuLayout = {};
		for (const [cell, fnId] of Object.entries(cells as Record<string, unknown>)) {
			if (!CELL.test(cell)) {
				fail(`${path}.${size}.${cell}`, 'cell must look like "x1y2"');
			}
			if (cell === "x0y0") {
				fail(`${path}.${size}.${cell}`, "x0y0 is reserved for the Back key");
			}
			if (typeof fnId !== "string" || !ids.has(fnId)) {
				fail(`${path}.${size}.${cell}`, `unknown function "${String(fnId)}"`);
			}
			layout[cell] = fnId as string;
		}
		layouts[size] = layout;
	}
	return layouts;
}

function readIcon(value: unknown, path: string): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string" || !isIconName(value)) {
		return fail(path, `must be one of: ${ICON_NAMES.filter((name) => !name.endsWith("-off")).join(", ")} (any of them can end with "-off")`);
	}
	return value;
}

/**
 * Validates and normalizes one group definition (built-in data or user JSON).
 */
export function readGroup(raw: unknown, custom: boolean, path = "group"): Group {
	if (!isObject(raw)) {
		return fail(path, "must be an object");
	}
	const id = readString(raw.id, `${path}.id`);
	if (!ID.test(id)) {
		fail(`${path}.id`, "may only contain letters, digits, '_' and '-'");
	}
	if (!Array.isArray(raw.functions) || raw.functions.length === 0) {
		fail(`${path}.functions`, "must be a non-empty list");
	}
	const seen = new Set<string>();
	const functions = (raw.functions as unknown[]).map((fn, i): GroupFunction => {
		const fnPath = `${path}.functions[${i}]`;
		if (!isObject(fn)) {
			return fail(fnPath, "must be an object");
		}
		const fnId = readString(fn.id, `${fnPath}.id`);
		if (!ID.test(fnId) || fnId === "menu") {
			fail(`${fnPath}.id`, 'may only contain letters, digits, "_" and "-", and cannot be "menu"');
		}
		if (seen.has(fnId)) {
			fail(`${fnPath}.id`, `duplicate id "${fnId}"`);
		}
		seen.add(fnId);
		if (fn.confirm !== undefined && typeof fn.confirm !== "boolean") {
			fail(`${fnPath}.confirm`, "must be true or false");
		}
		return {
			id: fnId,
			label: readString(fn.label, `${fnPath}.label`),
			icon: readIcon(fn.icon, `${fnPath}.icon`),
			confirm: fn.confirm === true || undefined,
			command: readCommand(fn, fnPath),
		};
	});

	return {
		id,
		label: readString(raw.label, `${path}.label`),
		color: typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : DEFAULT_COLOR,
		icon: readIcon(raw.icon, `${path}.icon`),
		stayInMenu: raw.stayInMenu === true,
		functions,
		layouts: readLayouts(raw.layouts, functions, `${path}.layouts`),
		custom,
	};
}

export const BUILTIN_GROUPS: readonly Group[] = builtinData.groups.map((group, i) => readGroup(group, false, `builtin[${i}]`));

/**
 * Parses the user's custom groups (the JSON edited in the plugin settings).
 * Custom group ids must not clash with built-in ones.
 */
export function readCustomGroups(raw: unknown): Group[] {
	const list = isObject(raw) && Array.isArray(raw.groups) ? raw.groups : raw;
	if (!Array.isArray(list)) {
		return fail("custom groups", 'must be a list of groups or { "groups": [...] }');
	}
	const builtinIds = new Set(BUILTIN_GROUPS.map((group) => group.id));
	const seen = new Set<string>();
	return list.map((group, i) => {
		const parsed = readGroup(group, true, `groups[${i}]`);
		if (builtinIds.has(parsed.id)) {
			fail(`groups[${i}].id`, `"${parsed.id}" is already used by a built-in group`);
		}
		if (seen.has(parsed.id)) {
			fail(`groups[${i}].id`, `duplicate id "${parsed.id}"`);
		}
		seen.add(parsed.id);
		return parsed;
	});
}

/**
 * Converts a group back to the JSON format accepted by {@link readCustomGroups}.
 */
export function groupToJson(group: Group): Record<string, unknown> {
	return {
		id: group.id,
		label: group.label,
		color: group.color,
		icon: group.icon,
		stayInMenu: group.stayInMenu,
		functions: group.functions.map((fn) => {
			const base = { id: fn.id, label: fn.label, icon: fn.icon, confirm: fn.confirm };
			const command = fn.command;
			switch (command.type) {
				case "game":
					return { ...base, action: command.action, fallback: command.fallback, wheel: command.wheel };
				case "keys":
					return { ...base, keys: command.keys, holdMs: command.holdMs, hold: command.hold || undefined };
				case "macro":
					return { ...base, macro: command.steps };
				case "ref":
					return { ...base, ref: command.ref };
			}
		}),
		layouts: Object.keys(group.layouts).length > 0 ? group.layouts : undefined,
	};
}
