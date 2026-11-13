import { formatInput, parseInput, type ParsedInput } from "../input/keys.ts";
import { planPress, type PressPlan } from "../keybinds/activation.ts";
import type { KeybindResolver } from "../keybinds/resolver.ts";
import type { Command, FunctionRef, Group, GroupFunction } from "./types.ts";

const MAX_REF_DEPTH = 5;

/**
 * What pressing a function will do, or why it cannot work.
 * - `ready`: it can be executed; `bindText` describes the keys, e.g. "RAlt + Num 0".
 * - `unbound`: the game action has no keyboard/mouse bind; the user has to bind one in the game.
 * - `unsupported`: the bind uses inputs the plugin cannot send (e.g. joystick only, mouse axis).
 * - `missing`: the game action, group or function does not exist (e.g. removed by a patch).
 */
export type FunctionStatus =
	| { state: "ready"; bindText: string }
	| { state: "unbound" }
	| { state: "unsupported"; bindText: string }
	| { state: "missing"; reason: string };

/**
 * A ready-to-run step: one input with its press plan, or a pause.
 */
export type Step = { input: ParsedInput; plan: PressPlan } | { delayMs: number };

export type Execution = { ok: true; steps: Step[] } | { ok: false; status: Exclude<FunctionStatus, { state: "ready" }> };

const SHORT_TAP: PressPlan = { kind: "timed", holdMs: 50, taps: 1 };

/**
 * Lookup of groups and functions, and translation of functions into concrete
 * inputs using the current keybinds.
 */
export class Catalog {
	readonly #groups: Map<string, Group>;
	readonly #resolver: KeybindResolver;

	constructor(groups: readonly Group[], resolver: KeybindResolver) {
		this.#groups = new Map(groups.map((group) => [group.id, group]));
		this.#resolver = resolver;
	}

	get groups(): Group[] {
		return [...this.#groups.values()];
	}

	group(id: string | undefined): Group | undefined {
		return id === undefined ? undefined : this.#groups.get(id);
	}

	function(groupId: string | undefined, fnId: string | undefined): GroupFunction | undefined {
		return this.group(groupId)?.functions.find((fn) => fn.id === fnId);
	}

	lookup(ref: FunctionRef | undefined): { group: Group; fn: GroupFunction } | undefined {
		const [groupId, fnId] = (ref ?? "").split("/");
		const group = this.group(groupId);
		const fn = group?.functions.find((f) => f.id === fnId);
		return group && fn ? { group, fn } : undefined;
	}

	status(fn: GroupFunction): FunctionStatus {
		const execution = this.plan(fn.command);
		if (!execution.ok) {
			return execution.status;
		}
		const text = execution.steps
			.flatMap((step) => ("input" in step ? [formatInput(step.input.keys.join("+"))] : []))
			.join(", ");
		return { state: "ready", bindText: text };
	}

	/**
	 * Turns a command into the steps to run.
	 */
	plan(command: Command, depth = 0): Execution {
		switch (command.type) {
			case "game": {
				const bind = this.#resolver.resolve(command.action);
				if (!bind) {
					return { ok: false, status: { state: "missing", reason: `Game action ${command.action} not found` } };
				}
				if (bind.inputs.length === 0) {
					return { ok: false, status: { state: "unbound" } };
				}
				const input = bind.inputs.map(parseInput).find((parsed) => parsed !== undefined);
				if (!input) {
					return { ok: false, status: { state: "unsupported", bindText: bind.inputs.map(formatInput).join(", ") } };
				}
				return { ok: true, steps: [{ input, plan: planPress(bind.activation) }] };
			}
			case "keys": {
				const input = parseInput(command.keys);
				if (!input) {
					return { ok: false, status: { state: "unsupported", bindText: command.keys } };
				}
				const plan: PressPlan = command.hold
					? { kind: "passthrough", fallbackHoldMs: command.holdMs ?? 100 }
					: command.holdMs !== undefined
						? { kind: "timed", holdMs: command.holdMs, taps: 1 }
						: SHORT_TAP;
				return { ok: true, steps: [{ input, plan }] };
			}
			case "macro": {
				const steps: Step[] = [];
				for (const step of command.steps) {
					if ("delayMs" in step) {
						steps.push({ delayMs: step.delayMs });
						continue;
					}
					const input = parseInput(step.keys);
					if (!input) {
						return { ok: false, status: { state: "unsupported", bindText: step.keys } };
					}
					steps.push({ input, plan: step.holdMs !== undefined ? { kind: "timed", holdMs: step.holdMs, taps: 1 } : SHORT_TAP });
				}
				return { ok: true, steps };
			}
			case "ref": {
				const target = this.lookup(command.ref);
				if (!target) {
					return { ok: false, status: { state: "missing", reason: `Function ${command.ref} not found` } };
				}
				if (depth >= MAX_REF_DEPTH) {
					return { ok: false, status: { state: "missing", reason: `Too many nested references at ${command.ref}` } };
				}
				return this.plan(target.fn.command, depth + 1);
			}
		}
	}
}
