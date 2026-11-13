import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { BUILTIN_GROUPS } from "../src/catalog/groups.ts";
import { planPress } from "../src/keybinds/activation.ts";
import { parseDefaultProfile } from "../src/keybinds/default-profile.ts";
import { KeybindResolver } from "../src/keybinds/resolver.ts";
import { parseUserActionmaps } from "../src/keybinds/user-actionmaps.ts";
import { decodeXml } from "../src/xml/decode.ts";

const BUILD = "sc-alpha-4.10.2";
const dataDir = path.join(import.meta.dirname, "..", "game-data", BUILD);
const read = (file: string): Buffer => fs.readFileSync(file);

const defaults = parseDefaultProfile(decodeXml(read(path.join(dataDir, "defaultProfile.xml"))), "defaults", BUILD);
const user = parseUserActionmaps(decodeXml(read(path.join(import.meta.dirname, "fixtures", "actionmaps.xml"))), "user");
const resolver = new KeybindResolver([defaults, user]);

describe("decoders", () => {
	it("decodes the CryXmlB original and the text copy to the same tree", () => {
		const binary = decodeXml(read(path.join(dataDir, "raw", "defaultProfile.cryxml")));
		const text = decodeXml(read(path.join(dataDir, "defaultProfile.xml")));
		assert.deepEqual(binary, text);
	});
});

describe("default profile", () => {
	it("reads actions, inputs and activation modes", () => {
		assert.ok(defaults.actions.size > 1000);
		assert.deepEqual(defaults.actions.get("lights_controller/v_lights")?.inputs, ["l"]);
		assert.deepEqual(defaults.actions.get("spaceship_general/v_open_all_doors")?.inputs, []);
		assert.equal(defaults.activationModes.get("delayed_press")?.pressTriggerThreshold, 0.25);
	});

	it("reads keyboard inputs declared as child elements", () => {
		assert.deepEqual(defaults.actions.get("prone/prone_rollleft")?.inputs, ["q"]);
		assert.equal(defaults.actions.get("prone/prone_rollleft")?.activationMode, "double_tap");
		assert.deepEqual(defaults.actions.get("default/focus_on_chat_textinput")?.inputs, ["enter", "np_enter"]);
	});
});

describe("resolver", () => {
	it("applies user rebinds over defaults", () => {
		const open = resolver.resolve("spaceship_general/v_open_all_doors");
		assert.deepEqual(open?.inputs, ["ralt+np_0"]);
		assert.equal(open?.inputsFrom, "user");
		assert.equal(open?.activation.name, "press");
	});

	it("treats an empty user rebind as unbound", () => {
		assert.deepEqual(resolver.resolve("lights_controller/v_lights")?.inputs, []);
	});

	it("keeps the default keyboard bind when only a joystick was rebound", () => {
		assert.deepEqual(resolver.resolve("spaceship_movement/v_afterburner")?.inputs, defaults.actions.get("spaceship_movement/v_afterburner")?.inputs);
	});

	it("returns undefined for unknown actions", () => {
		assert.equal(resolver.resolve("spaceship_general/does_not_exist"), undefined);
	});

	it("distinguishes tap and hold on the same key", () => {
		const gear = resolver.resolve("spaceship_movement/v_toggle_landing_system");
		const autoland = resolver.resolve("spaceship_movement/v_autoland");
		assert.deepEqual(gear?.inputs, ["n"]);
		assert.deepEqual(autoland?.inputs, ["n"]);
		const gearPlan = planPress(gear!.activation);
		const autolandPlan = planPress(autoland!.activation);
		assert.equal(gearPlan.kind, "timed");
		assert.equal(autolandPlan.kind, "timed");
		assert.ok(gearPlan.kind === "timed" && gearPlan.holdMs < 250);
		assert.ok(autolandPlan.kind === "timed" && autolandPlan.holdMs > 250);
	});

	it("uses inline activation (hold to keep going, hold delay for max)", () => {
		assert.equal(planPress(resolver.resolve("spaceship_power/v_power_throttle_up")!.activation).kind, "passthrough");
		const max = planPress(resolver.resolve("spaceship_power/v_engineering_assignment_engine_max")!.activation);
		assert.ok(max.kind === "timed" && max.holdMs > 250);
	});
});

describe("built-in groups", () => {
	it("only reference actions that exist in the game build", () => {
		for (const group of BUILTIN_GROUPS) {
			for (const fn of group.functions) {
				if (fn.command.type === "game") {
					assert.ok(resolver.has(fn.command.action), `${group.id}/${fn.id} -> ${fn.command.action}`);
				}
			}
		}
	});
});
