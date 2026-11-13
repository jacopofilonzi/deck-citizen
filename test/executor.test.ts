import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Executor } from "../src/catalog/executor.ts";
import { InputInjector, type InputBackend } from "../src/input/injector.ts";

function recorder(): { backend: InputBackend; events: string[] } {
	const events: string[] = [];
	return { events, backend: { key: (name, down) => events.push(`${down ? "+" : "-"}${name}`) } };
}

const combo = { keys: ["ralt", "np_0"] };

describe("executor", () => {
	it("taps a combination: modifiers first, released in reverse", async () => {
		const { backend, events } = recorder();
		await new Executor(new InputInjector(backend)).press("k", [{ input: combo, plan: { kind: "timed", holdMs: 1, taps: 1 } }]);
		assert.deepEqual(events, ["+ralt", "+np_0", "-np_0", "-ralt"]);
	});

	it("double taps", async () => {
		const { backend, events } = recorder();
		await new Executor(new InputInjector(backend)).press("k", [{ input: { keys: ["f9"] }, plan: { kind: "timed", holdMs: 1, taps: 2 } }]);
		assert.deepEqual(events, ["+f9", "-f9", "+f9", "-f9"]);
	});

	it("holds passthrough inputs until the key is released", async () => {
		const { backend, events } = recorder();
		const executor = new Executor(new InputInjector(backend));
		await executor.press("k", [{ input: { keys: ["f10"] }, plan: { kind: "passthrough", fallbackHoldMs: 1 } }]);
		assert.deepEqual(events, ["+f10"]);
		await executor.release("k");
		assert.deepEqual(events, ["+f10", "-f10"]);
	});

	it("measures the hold time of a delayed press", async () => {
		const times: number[] = [];
		const backend: InputBackend = { key: () => times.push(performance.now()) };
		await new Executor(new InputInjector(backend)).press("k", [{ input: { keys: ["n"] }, plan: { kind: "timed", holdMs: 300, taps: 1 } }]);
		assert.ok(times[1]! - times[0]! >= 295, `held ${times[1]! - times[0]!}ms`);
	});
});
