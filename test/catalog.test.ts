import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Catalog } from "../src/catalog/catalog.ts";
import { BUILTIN_GROUPS, GroupValidationError, readCustomGroups } from "../src/catalog/groups.ts";
import { formatInput, parseInput } from "../src/input/keys.ts";
import { KeybindResolver } from "../src/keybinds/resolver.ts";
import type { BindLayer } from "../src/keybinds/types.ts";
import { buildMenuPages, fromDeck, toDeck } from "../src/menu/grid.ts";
import { iconSvg, isIconName } from "../src/render/icons.ts";

const layer: BindLayer = {
	name: "test",
	activationModes: new Map(),
	actions: new Map([
		["spaceship_general/v_open_all_doors", { inputs: ["ralt+np_0"], activationMode: "press" }],
		["spaceship_general/v_close_all_doors", { inputs: [] }],
		["spaceship_general/v_toggle_all_doors", { inputs: ["maxis_x"] }],
	]),
};

const doors = BUILTIN_GROUPS.find((group) => group.id === "doors")!;
const power = BUILTIN_GROUPS.find((group) => group.id === "power")!;

describe("keys", () => {
	it("parses and formats inputs", () => {
		assert.deepEqual(parseInput("kb1_ralt+np_0")?.keys, ["ralt", "np_0"]);
		assert.equal(parseInput("kb1_ "), undefined);
		assert.equal(parseInput("js1_button2"), undefined);
		assert.equal(formatInput("ralt+np_0"), "RAlt + Num 0");
	});
});

describe("catalog", () => {
	const catalog = new Catalog(BUILTIN_GROUPS, new KeybindResolver([layer]));
	const status = (fnId: string) => catalog.status(doors.functions.find((fn) => fn.id === fnId)!);

	it("reports function status from the binds", () => {
		assert.deepEqual(status("open"), { state: "ready", bindText: "RAlt + Num 0" });
		assert.deepEqual(status("close"), { state: "unbound" });
		assert.equal(status("toggle").state, "unsupported");
		assert.equal(status("lock").state, "missing");
	});

	it("follows references to other groups", () => {
		const [custom] = readCustomGroups([{ id: "mine", label: "Mine", functions: [{ id: "o", label: "O", ref: "doors/open" }] }]);
		const withCustom = new Catalog([...BUILTIN_GROUPS, custom!], new KeybindResolver([layer]));
		assert.deepEqual(withCustom.status(custom!.functions[0]!), { state: "ready", bindText: "RAlt + Num 0" });
	});
});

describe("mouse wheel axis and confirmation", () => {
	const wheelLayer: BindLayer = {
		name: "wheel",
		activationModes: new Map(),
		actions: new Map([
			["spaceship_mining/v_increase_mining_throttle", { inputs: ["maxis_z"] }],
			["spaceship_mining/v_decrease_mining_throttle", { inputs: [] }],
			["spaceship_salvage/v_salvage_increase_beam_spacing", { inputs: ["f5"] }],
			["spaceship_salvage/v_salvage_beam_spacing_rel", { inputs: ["maxis_z"] }],
		]),
	};
	const catalog = new Catalog(BUILTIN_GROUPS, new KeybindResolver([wheelLayer]));
	const fn = (group: string, id: string) => BUILTIN_GROUPS.find((g) => g.id === group)!.functions.find((f) => f.id === id)!;

	it("drives a wheel axis bind with wheel steps in the function's direction", () => {
		assert.deepEqual(catalog.status(fn("mining", "power_up")), { state: "ready", bindText: "Wheel Up" });
		// Power - has no bind of its own: it falls back to the wheel axis of Power +.
		assert.deepEqual(catalog.status(fn("mining", "power_down")), { state: "ready", bindText: "Wheel Down" });
	});

	it("prefers the action's own key over the fallback", () => {
		assert.deepEqual(catalog.status(fn("salvage", "spacing_up")), { state: "ready", bindText: "F5" });
		assert.deepEqual(catalog.status(fn("salvage", "spacing_down")), { state: "ready", bindText: "Wheel Down" });
	});

	it("keeps a wheel axis unsupported without a direction", () => {
		const [custom] = readCustomGroups([{ id: "w", label: "W", functions: [{ id: "a", label: "A", action: "spaceship_mining/v_increase_mining_throttle" }] }]);
		assert.equal(catalog.status(custom!.functions[0]!).state, "unsupported");
	});

	it("asks for confirmation on eject and self destruct, also through refs", () => {
		assert.equal(catalog.needsConfirm(fn("emergency", "eject")), true);
		assert.equal(catalog.needsConfirm(fn("emergency", "exit_seat")), false);
		const [custom] = readCustomGroups([{ id: "c", label: "C", functions: [{ id: "boom", label: "Boom", ref: "emergency/self_destruct" }] }]);
		assert.equal(catalog.needsConfirm(custom!.functions[0]!), true);
	});

	it("rejects an invalid wheel direction", () => {
		assert.throws(() => readCustomGroups([{ id: "w", label: "W", functions: [{ id: "a", label: "A", action: "a/b", wheel: "left" }] }]), /wheel/);
	});
});

describe("custom groups", () => {
	it("accepts keys, macros and refs", () => {
		const groups = readCustomGroups({
			groups: [
				{
					id: "my_salvage",
					label: "Salvage",
					functions: [
						{ id: "a", label: "A", keys: "lctrl+f1" },
						{ id: "b", label: "B", macro: [{ keys: "f1" }, { delayMs: 200 }, { keys: "f2", holdMs: 300 }] },
						{ id: "c", label: "C", ref: "lights/toggle" },
					],
					layouts: { "5x3": { x2y1: "a" } },
				},
			],
		});
		assert.equal(groups[0]?.functions.length, 3);
	});

	it("rejects bad definitions with a useful message", () => {
		assert.throws(() => readCustomGroups([{ id: "doors", label: "x", functions: [{ id: "a", label: "A", keys: "f1" }] }]), /built-in/);
		assert.throws(() => readCustomGroups([{ id: "x", label: "x", functions: [{ id: "a", label: "A", keys: "notakey" }] }]), GroupValidationError);
		assert.throws(() => readCustomGroups([{ id: "x", label: "x", functions: [{ id: "a", label: "A", keys: "f1" }], layouts: { "5x3": { x0y0: "a" } } }]), /Back/);
		assert.throws(() => readCustomGroups([{ id: "x", label: "x", functions: [{ id: "a", label: "A", icon: "nope", keys: "f1" }] }]), /icon/);
	});
});

describe("icons", () => {
	it("every built-in group and function has a known icon", () => {
		for (const group of BUILTIN_GROUPS) {
			assert.ok(group.icon && isIconName(group.icon), group.id);
			for (const fn of group.functions) {
				assert.ok(fn.icon && isIconName(fn.icon), `${group.id}/${fn.id}`);
			}
		}
	});

	it("accepts -off variants and draws them", () => {
		const [group] = readCustomGroups([{ id: "x", label: "x", icon: "light-off", functions: [{ id: "a", label: "A", keys: "f1" }] }]);
		assert.equal(group?.icon, "light-off");
		assert.match(iconSvg("light-off", 72, 63, 44, "#eab308"), /opacity=".45"/);
		assert.equal(iconSvg("nope", 72, 63, 44, "#eab308"), "");
	});
});

describe("menu grid", () => {
	const size = { columns: 5, rows: 3 };

	it("maps bottom-left coordinates to Stream Deck rows", () => {
		assert.deepEqual(toDeck({ x: 0, y: 0 }, size), { column: 0, row: 2 });
		assert.deepEqual(fromDeck({ column: 3, row: 1 }, size), { x: 3, y: 1 });
	});

	it("uses the group layout: Doors on a 5x3 has Back, Open at x1y1 and Close at x3y1", () => {
		const [page, ...rest] = buildMenuPages(doors, size);
		assert.equal(rest.length, 0);
		assert.deepEqual(Object.fromEntries(page!), {
			x0y0: { kind: "back" },
			x1y1: { kind: "function", fnId: "open" },
			x3y1: { kind: "function", fnId: "close" },
		});
	});

	it("lays out automatically and paginates when there is no layout for the size", () => {
		const pages = buildMenuPages(power, { columns: 3, rows: 2 });
		// 6 keys: Back + Next leave 4 per page for 12 functions.
		assert.equal(pages.length, 3);
		assert.deepEqual(pages[0]?.get("x2y0"), { kind: "next", page: 0, pages: 3 });
		assert.deepEqual(pages[0]?.get("x0y1"), { kind: "function", fnId: "all_on" });
	});

	it("prefers a per-key layout", () => {
		const [page] = buildMenuPages(doors, size, { x2y2: "lock" });
		assert.deepEqual([...page!.keys()].sort(), ["x0y0", "x2y2"]);
	});
});
