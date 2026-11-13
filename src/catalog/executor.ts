import { MULTI_TAP_GAP_MS } from "../keybinds/activation.ts";
import type { InputInjector } from "../input/injector.ts";
import type { ParsedInput } from "../input/keys.ts";
import type { Step } from "./catalog.ts";

/**
 * Runs planned steps. Keeps track of inputs held down by "passthrough" steps so the
 * matching release can be sent when the Stream Deck key goes up.
 */
export class Executor {
	readonly #injector: InputInjector;
	readonly #held = new Map<string, ParsedInput[]>();

	constructor(injector: InputInjector) {
		this.#injector = injector;
	}

	/**
	 * Stream Deck key pressed. `token` identifies the key so that {@link release} can
	 * find what it holds.
	 */
	async press(token: string, steps: Step[]): Promise<void> {
		await this.release(token);
		const held: ParsedInput[] = [];
		for (const step of steps) {
			if ("delayMs" in step) {
				await this.#injector.delay(step.delayMs);
			} else if (step.plan.kind === "passthrough" && steps.length === 1) {
				await this.#injector.down(step.input);
				held.push(step.input);
			} else if (step.plan.kind === "passthrough") {
				// Inside a sequence there is no "hold": press it briefly.
				await this.#injector.tap(step.input, step.plan.fallbackHoldMs);
			} else {
				await this.#injector.tap(step.input, step.plan.holdMs, step.plan.taps, MULTI_TAP_GAP_MS);
			}
		}
		if (held.length > 0) {
			this.#held.set(token, held);
		}
	}

	/** Stream Deck key released. */
	async release(token: string): Promise<void> {
		const held = this.#held.get(token);
		if (!held) {
			return;
		}
		this.#held.delete(token);
		for (const input of held.reverse()) {
			await this.#injector.up(input);
		}
	}

	/**
	 * One-shot execution without a release event (dial ticks): holds are turned into short presses.
	 */
	async trigger(steps: Step[]): Promise<void> {
		for (const step of steps) {
			if ("delayMs" in step) {
				await this.#injector.delay(step.delayMs);
			} else if (step.plan.kind === "passthrough") {
				await this.#injector.tap(step.input, step.plan.fallbackHoldMs);
			} else {
				await this.#injector.tap(step.input, step.plan.holdMs, step.plan.taps, MULTI_TAP_GAP_MS);
			}
		}
	}

	/** Releases everything (e.g. when the plugin shuts down). */
	async releaseAll(): Promise<void> {
		for (const token of [...this.#held.keys()]) {
			await this.release(token);
		}
	}
}
