import { setTimeout as sleep } from "node:timers/promises";

import { KEYBOARD, MOUSE, type ParsedInput } from "./keys.ts";
import { sendKey, sendMouseButton, sendMouseWheel } from "./win32.ts";

/** Pause between the individual key events of a combination (modifier, then key). */
const COMBO_GAP_MS = 15;

/**
 * Low level operations the injector needs. The real implementation is Win32
 * SendInput; tests can pass a recorder instead.
 */
export type InputBackend = {
	key(name: string, down: boolean): void;
};

export const sendInputBackend: InputBackend = {
	key(name, down) {
		const keyboard = KEYBOARD[name];
		if (keyboard) {
			sendKey(keyboard, down);
			return;
		}
		const mouse = MOUSE[name];
		if (mouse?.kind === "button") {
			sendMouseButton(mouse.button, down);
		} else if (mouse?.kind === "wheel" && down) {
			// A wheel step has no "up"; it is sent once, on press.
			sendMouseWheel(mouse.delta);
		}
	},
};

/**
 * Sends inputs to the game. Operations are queued so that two presses never
 * interleave their key events (e.g. a macro and a key press at the same time).
 */
export class InputInjector {
	readonly #backend: InputBackend;
	#queue: Promise<void> = Promise.resolve();

	constructor(backend: InputBackend = sendInputBackend) {
		this.#backend = backend;
	}

	#enqueue(task: () => Promise<void> | void): Promise<void> {
		const next = this.#queue.then(task);
		this.#queue = next.catch(() => undefined);
		return next;
	}

	async #press(input: ParsedInput): Promise<void> {
		for (const [i, key] of input.keys.entries()) {
			if (i > 0) {
				await sleep(COMBO_GAP_MS);
			}
			this.#backend.key(key, true);
		}
	}

	async #release(input: ParsedInput): Promise<void> {
		for (const [i, key] of [...input.keys].reverse().entries()) {
			if (i > 0) {
				await sleep(COMBO_GAP_MS);
			}
			this.#backend.key(key, false);
		}
	}

	/** Presses the keys of a combination in order (modifiers first) and keeps them down. */
	down(input: ParsedInput): Promise<void> {
		return this.#enqueue(() => this.#press(input));
	}

	/** Releases the keys of a combination in reverse order. */
	up(input: ParsedInput): Promise<void> {
		return this.#enqueue(() => this.#release(input));
	}

	/**
	 * Presses a combination `taps` times, keeping it down for `holdMs` each time.
	 * Runs as one queued operation, so nothing can slip in between.
	 */
	tap(input: ParsedInput, holdMs: number, taps = 1, gapMs = 60): Promise<void> {
		return this.#enqueue(async () => {
			for (let i = 0; i < taps; i++) {
				if (i > 0) {
					await sleep(gapMs);
				}
				await this.#press(input);
				try {
					await sleep(holdMs);
				} finally {
					await this.#release(input);
				}
			}
		});
	}

	/** Waits inside the queue (used by macros). */
	delay(ms: number): Promise<void> {
		return this.#enqueue(async () => {
			await sleep(ms);
		});
	}
}
