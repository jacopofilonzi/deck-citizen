/**
 * Star Citizen key names mapped to PC set-1 scancodes. Names follow the game
 * (keybinding_localization.xml) and refer to the physical key position of a US
 * layout, so they are independent of the user's keyboard language.
 */
export type ScanKey = { scan: number; extended: boolean };

const plain = (scan: number): ScanKey => ({ scan, extended: false });
const ext = (scan: number): ScanKey => ({ scan, extended: true });

export const KEYBOARD: Readonly<Record<string, ScanKey>> = {
	escape: plain(0x01),
	"1": plain(0x02),
	"2": plain(0x03),
	"3": plain(0x04),
	"4": plain(0x05),
	"5": plain(0x06),
	"6": plain(0x07),
	"7": plain(0x08),
	"8": plain(0x09),
	"9": plain(0x0a),
	"0": plain(0x0b),
	minus: plain(0x0c),
	equals: plain(0x0d),
	backspace: plain(0x0e),
	tab: plain(0x0f),
	q: plain(0x10),
	w: plain(0x11),
	e: plain(0x12),
	r: plain(0x13),
	t: plain(0x14),
	y: plain(0x15),
	u: plain(0x16),
	i: plain(0x17),
	o: plain(0x18),
	p: plain(0x19),
	lbracket: plain(0x1a),
	rbracket: plain(0x1b),
	enter: plain(0x1c),
	lctrl: plain(0x1d),
	a: plain(0x1e),
	s: plain(0x1f),
	d: plain(0x20),
	f: plain(0x21),
	g: plain(0x22),
	h: plain(0x23),
	j: plain(0x24),
	k: plain(0x25),
	l: plain(0x26),
	semicolon: plain(0x27),
	apostrophe: plain(0x28),
	grave: plain(0x29),
	lshift: plain(0x2a),
	backslash: plain(0x2b),
	z: plain(0x2c),
	x: plain(0x2d),
	c: plain(0x2e),
	v: plain(0x2f),
	b: plain(0x30),
	n: plain(0x31),
	m: plain(0x32),
	comma: plain(0x33),
	period: plain(0x34),
	slash: plain(0x35),
	rshift: plain(0x36),
	np_multiply: plain(0x37),
	lalt: plain(0x38),
	space: plain(0x39),
	capslock: plain(0x3a),
	f1: plain(0x3b),
	f2: plain(0x3c),
	f3: plain(0x3d),
	f4: plain(0x3e),
	f5: plain(0x3f),
	f6: plain(0x40),
	f7: plain(0x41),
	f8: plain(0x42),
	f9: plain(0x43),
	f10: plain(0x44),
	numlock: ext(0x45),
	scrolllock: plain(0x46),
	np_7: plain(0x47),
	np_8: plain(0x48),
	np_9: plain(0x49),
	np_subtract: plain(0x4a),
	np_4: plain(0x4b),
	np_5: plain(0x4c),
	np_6: plain(0x4d),
	np_add: plain(0x4e),
	np_1: plain(0x4f),
	np_2: plain(0x50),
	np_3: plain(0x51),
	np_0: plain(0x52),
	np_period: plain(0x53),
	oem_102: plain(0x56),
	f11: plain(0x57),
	f12: plain(0x58),
	np_enter: ext(0x1c),
	rctrl: ext(0x1d),
	np_divide: ext(0x35),
	print: ext(0x37),
	ralt: ext(0x38),
	home: ext(0x47),
	up: ext(0x48),
	pgup: ext(0x49),
	left: ext(0x4b),
	right: ext(0x4d),
	end: ext(0x4f),
	down: ext(0x50),
	pgdn: ext(0x51),
	insert: ext(0x52),
	delete: ext(0x53),
};

export type MouseButton = "left" | "right" | "middle" | "x1" | "x2";

export type MouseKey = { kind: "button"; button: MouseButton } | { kind: "wheel"; delta: 1 | -1 };

export const MOUSE: Readonly<Record<string, MouseKey>> = {
	mouse1: { kind: "button", button: "left" },
	mouse2: { kind: "button", button: "right" },
	mouse3: { kind: "button", button: "middle" },
	mouse4: { kind: "button", button: "x1" },
	mouse5: { kind: "button", button: "x2" },
	mwheel_up: { kind: "wheel", delta: 1 },
	mwheel_down: { kind: "wheel", delta: -1 },
};

/** Human readable names for the keys that are not self-explanatory. */
const DISPLAY: Readonly<Record<string, string>> = {
	lalt: "LAlt",
	ralt: "RAlt",
	lctrl: "LCtrl",
	rctrl: "RCtrl",
	lshift: "LShift",
	rshift: "RShift",
	np_enter: "Num Enter",
	np_divide: "Num /",
	np_multiply: "Num *",
	np_subtract: "Num -",
	np_add: "Num +",
	np_period: "Num .",
	mouse1: "Mouse L",
	mouse2: "Mouse R",
	mouse3: "Mouse M",
	mouse4: "Mouse 4",
	mouse5: "Mouse 5",
	mwheel_up: "Wheel Up",
	mwheel_down: "Wheel Down",
	pgup: "PgUp",
	pgdn: "PgDn",
	lbracket: "[",
	rbracket: "]",
	minus: "-",
	equals: "=",
	comma: ",",
	period: ".",
	slash: "/",
	backslash: "\\",
	semicolon: ";",
	apostrophe: "'",
	grave: "`",
};

/**
 * A parsed keyboard/mouse input: keys in the order they must be pressed
 * (modifiers first, main key last).
 */
export type ParsedInput = { keys: string[] };

const DEVICE_PREFIX = /^(kb|mo)\d+_/;
const OTHER_DEVICE_PREFIX = /^(js|gp)\d+_/;

/**
 * Returns true for inputs that belong to the keyboard/mouse column of the game's
 * bindings (`kb1_...`, `mo1_...` or a bare default like `ralt+np_0`).
 */
export function isKeyboardMouseInput(raw: string): boolean {
	return !OTHER_DEVICE_PREFIX.test(raw.trim().toLowerCase());
}

/**
 * Normalizes an input string from either defaultProfile.xml (`ralt+np_0`) or
 * actionmaps.xml (`kb1_ralt+np_0`). Returns an empty string for "unbound".
 */
export function normalizeInput(raw: string): string {
	return raw.trim().toLowerCase().replace(DEVICE_PREFIX, "").trim();
}

/**
 * Parses a normalized input into its keys. Returns undefined if any key cannot be
 * sent by the plugin (joystick axes, mouse axes, unknown names, ...).
 */
export function parseInput(input: string): ParsedInput | undefined {
	const normalized = normalizeInput(input);
	if (normalized === "") {
		return undefined;
	}
	const keys = normalized.split("+").map((key) => key.trim());
	if (keys.some((key) => !(key in KEYBOARD) && !(key in MOUSE))) {
		return undefined;
	}
	return { keys };
}

/**
 * Formats an input for display, e.g. `ralt+np_0` -> `RAlt + Num 0`.
 */
export function formatInput(input: string): string {
	return normalizeInput(input)
		.split("+")
		.map((key) => DISPLAY[key] ?? (key.startsWith("np_") ? `Num ${key.slice(3)}` : key.toUpperCase()))
		.join(" + ");
}
