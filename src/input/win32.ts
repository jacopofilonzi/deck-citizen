import koffi from "koffi";

import type { MouseButton, ScanKey } from "./keys.ts";

const INPUT_MOUSE = 0;
const INPUT_KEYBOARD = 1;

const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_SCANCODE = 0x0008;

const MOUSEEVENTF = {
	left: { down: 0x0002, up: 0x0004, data: 0 },
	right: { down: 0x0008, up: 0x0010, data: 0 },
	middle: { down: 0x0020, up: 0x0040, data: 0 },
	x1: { down: 0x0080, up: 0x0100, data: 1 },
	x2: { down: 0x0080, up: 0x0100, data: 2 },
} as const satisfies Record<MouseButton, { down: number; up: number; data: number }>;
const MOUSEEVENTF_WHEEL = 0x0800;
const WHEEL_DELTA = 120;

const MOUSEINPUT = koffi.struct("MOUSEINPUT", {
	dx: "long",
	dy: "long",
	mouseData: "uint32",
	dwFlags: "uint32",
	time: "uint32",
	dwExtraInfo: "uintptr_t",
});

const KEYBDINPUT = koffi.struct("KEYBDINPUT", {
	wVk: "uint16",
	wScan: "uint16",
	dwFlags: "uint32",
	time: "uint32",
	dwExtraInfo: "uintptr_t",
});

const HARDWAREINPUT = koffi.struct("HARDWAREINPUT", {
	uMsg: "uint32",
	wParamL: "uint16",
	wParamH: "uint16",
});

const INPUT = koffi.struct("INPUT", {
	type: "uint32",
	u: koffi.union("INPUT_UNION", { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
});

const user32 = koffi.load("user32.dll");
const SendInput = user32.func("__stdcall", "SendInput", "uint32", ["uint32", koffi.pointer(INPUT), "int"]);
const INPUT_SIZE = koffi.sizeof(INPUT);

function send(input: object): void {
	const sent = SendInput(1, [input], INPUT_SIZE) as number;
	if (sent !== 1) {
		throw new Error("SendInput was blocked (another application may be filtering input)");
	}
}

/**
 * Presses or releases a key by scancode. Games read scancodes, not virtual keys.
 */
export function sendKey(key: ScanKey, down: boolean): void {
	let flags = KEYEVENTF_SCANCODE;
	if (key.extended) {
		flags |= KEYEVENTF_EXTENDEDKEY;
	}
	if (!down) {
		flags |= KEYEVENTF_KEYUP;
	}
	send({ type: INPUT_KEYBOARD, u: { ki: { wVk: 0, wScan: key.scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } } });
}

export function sendMouseButton(button: MouseButton, down: boolean): void {
	const event = MOUSEEVENTF[button];
	send({
		type: INPUT_MOUSE,
		u: { mi: { dx: 0, dy: 0, mouseData: event.data, dwFlags: down ? event.down : event.up, time: 0, dwExtraInfo: 0 } },
	});
}

export function sendMouseWheel(direction: 1 | -1): void {
	send({
		type: INPUT_MOUSE,
		u: { mi: { dx: 0, dy: 0, mouseData: (direction * WHEEL_DELTA) >>> 0, dwFlags: MOUSEEVENTF_WHEEL, time: 0, dwExtraInfo: 0 } },
	});
}
