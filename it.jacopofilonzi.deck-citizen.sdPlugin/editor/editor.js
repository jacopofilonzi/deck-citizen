// Custom group editor. Served by the plugin on 127.0.0.1 while this page is open.
// Edits the same JSON as the "Custom groups" box in the key settings; the plugin
// validates everything and draws the previews.
"use strict";

const COLORS = ["#3b82f6", "#06b6d4", "#14b8a6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#ec4899", "#8b5cf6", "#6366f1", "#a3a3a3"];
const DEFAULT_SIZE = { name: "Stream Deck", columns: 5, rows: 3 };
const TYPES = [
	{ id: "action", label: "Game action" },
	{ id: "keys", label: "Keys" },
	{ id: "macro", label: "Macro" },
	{ id: "ref", label: "Other function" },
];

// Browser key codes (physical position) -> Star Citizen key names.
const CODE_TO_KEY = {
	Escape: "escape", Minus: "minus", Equal: "equals", Backspace: "backspace", Tab: "tab",
	BracketLeft: "lbracket", BracketRight: "rbracket", Enter: "enter", ControlLeft: "lctrl", ControlRight: "rctrl",
	Semicolon: "semicolon", Quote: "apostrophe", Backquote: "grave", ShiftLeft: "lshift", ShiftRight: "rshift",
	Backslash: "backslash", Comma: "comma", Period: "period", Slash: "slash", AltLeft: "lalt", AltRight: "ralt",
	Space: "space", CapsLock: "capslock", NumLock: "numlock", ScrollLock: "scrolllock", IntlBackslash: "oem_102",
	NumpadMultiply: "np_multiply", NumpadSubtract: "np_subtract", NumpadAdd: "np_add", NumpadDecimal: "np_period",
	NumpadEnter: "np_enter", NumpadDivide: "np_divide", PrintScreen: "print", Home: "home", End: "end",
	PageUp: "pgup", PageDown: "pgdn", Insert: "insert", Delete: "delete",
	ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
};
const MODIFIERS = ["lctrl", "rctrl", "lshift", "rshift", "lalt", "ralt"];

let server = null; // state from the plugin
let saved = []; // custom groups as last saved
let groups = []; // custom groups being edited
let pendingSettings = null; // game settings from an imported backup, applied on Save
let selected = 0;
let previewTimer;

// ---------------------------------------------------------------------------
// Plugin connection

async function api(route, body) {
	const res = await fetch(`api/${route}`, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(data.error || `Request failed (${res.status})`);
	}
	return data;
}

async function loadState(keepEdits) {
	server = await api("state");
	saved = clone(Array.isArray(server.customGroups) ? server.customGroups : server.customGroups?.groups ?? []);
	if (!keepEdits) {
		groups = clone(saved);
		selected = Math.min(selected, Math.max(groups.length - 1, 0));
	}
	if (server.customGroupsError) {
		showBanner(`The saved custom groups have an error and are not in use: ${server.customGroupsError}`);
	}
	render();
}

function listen() {
	const events = new EventSource("api/events");
	let failures = 0;
	events.addEventListener("changed", () => void loadState(true).catch(() => undefined));
	events.onopen = () => {
		failures = 0;
		hideBanner();
	};
	events.onerror = () => {
		failures++;
		if (failures >= 3) {
			events.close();
			showBanner("The editor was closed by Stream Deck (or the plugin restarted). Open it again from the key settings: Plugin settings > Open group editor. Unsaved changes are still on this page; copy them from JSON if you need them.");
		}
	};
}

// ---------------------------------------------------------------------------
// Helpers

const clone = (value) => JSON.parse(JSON.stringify(value));
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(props)) {
		if (value === undefined || value === null || value === false) {
			continue;
		}
		if (key === "class") {
			node.className = value;
		} else if (key === "style") {
			node.style.cssText = value;
		} else if (key.startsWith("on")) {
			node.addEventListener(key.slice(2), value);
		} else if (key in node) {
			node[key] = value;
		} else {
			node.setAttribute(key, value);
		}
	}
	for (const child of [].concat(children)) {
		if (child !== undefined && child !== null && child !== false) {
			node.append(child);
		}
	}
	return node;
}

function field(label, control, hint) {
	return el("label", { class: "field" }, [el("span", { textContent: label }), control, hint ? el("p", { class: "hint", textContent: hint }) : null]);
}

function slug(text, fallback) {
	const id = String(text).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
	return id || fallback;
}

function uniqueId(base, taken) {
	let id = base;
	for (let i = 2; taken.has(id); i++) {
		id = `${base}_${i}`;
	}
	return id;
}

function allGroupIds() {
	return new Set([...server.builtinGroups.map((g) => g.id), ...groups.map((g) => g.id)]);
}

function commandType(fn) {
	return TYPES.find((t) => t.id in fn)?.id ?? "action";
}

function setCommand(fn, type) {
	for (const t of TYPES) {
		delete fn[t.id];
	}
	delete fn.holdMs;
	delete fn.hold;
	delete fn.fallback;
	delete fn.wheel;
	if (type === "action") fn.action = "";
	if (type === "keys") fn.keys = "";
	if (type === "macro") fn.macro = [{ keys: "" }];
	if (type === "ref") fn.ref = "";
}

function actionInfo(id) {
	return server.actions.find((a) => a.id === id);
}

function isDirty() {
	return pendingSettings !== null || JSON.stringify(groups) !== JSON.stringify(saved);
}

function showBanner(text) {
	$("banner").textContent = text;
	$("banner").hidden = false;
}

function hideBanner() {
	$("banner").hidden = true;
}

// ---------------------------------------------------------------------------
// Rendering

function changed({ rerender = false } = {}) {
	updateSaveState();
	updateSidebar();
	if (rerender) {
		renderMain();
	}
	schedulePreview();
}

function render() {
	updateSidebar();
	renderMain();
	updateSaveState();
	schedulePreview();
}

function updateSaveState(message) {
	const dirty = isDirty();
	const status = $("saveStatus");
	status.className = `save-status${message?.ok ? " ok" : dirty ? " dirty" : ""}`;
	status.textContent = message?.text ?? (dirty ? "Unsaved changes" : "All changes saved");
	$("save").disabled = !dirty;
	$("discard").hidden = !dirty;
	$("json").value = JSON.stringify(groups, null, 2);
}

function updateSidebar() {
	const list = $("groupList");
	list.replaceChildren(
		...groups.map((group, i) =>
			el("li", {}, [
				el("button", { class: i === selected ? "active" : "", onclick: () => select(i) }, [
					el("span", { class: "swatch", style: `background:${group.color || "#64748b"}` }),
					el("span", { class: "name", textContent: group.label || "(no name)" }),
					el("span", { class: "count", textContent: String(group.functions?.length ?? 0) }),
				]),
			]),
		),
	);
	if (groups.length === 0) {
		list.append(el("li", { class: "empty-list", textContent: "No custom groups yet." }));
	}
	const copy = $("copyBuiltin");
	if (copy.options.length === 0) {
		copy.append(el("option", { value: "", textContent: "Choose a group…" }), ...server.builtinGroups.map((g) => el("option", { value: g.id, textContent: g.label })));
	}
}

function select(i) {
	selected = i;
	updateSidebar();
	renderMain();
	schedulePreview();
}

function renderMain() {
	const main = $("main");
	const group = groups[selected];
	if (!group) {
		main.replaceChildren(
			el("div", { class: "welcome" }, [
				el("h2", { textContent: "Make your own groups" }),
				el("p", { textContent: "A group is a set of functions with a color and an icon. Put any function on a key, or open the whole group as a menu, like the built-in Doors or Lights." }),
				el("p", { textContent: "Functions can run a game action with your own binds, press fixed keys, run a macro, or reuse a function of another group." }),
				el("div", { class: "row-buttons" }, [el("button", { class: "primary", textContent: "New group", onclick: newGroup })]),
			]),
		);
		return;
	}
	main.style.setProperty("--group-color", group.color || "#64748b");
	main.replaceChildren(groupCard(group), functionsCard(group), layoutCard(group));
}

function groupCard(group) {
	const label = el("input", {
		type: "text",
		id: "groupLabel",
		value: group.label ?? "",
		oninput: () => {
			group.label = label.value;
			changed();
		},
	});
	const id = el("input", {
		type: "text",
		id: "groupId",
		value: group.id ?? "",
		oninput: () => {
			group.id = id.value.trim();
			changed();
		},
	});
	const deleteButton = el("button", {
		class: "danger small",
		textContent: "Delete group",
		onclick: () => {
			if (!deleteButton.classList.contains("armed")) {
				deleteButton.classList.add("armed");
				deleteButton.textContent = "Click again to delete";
				setTimeout(() => {
					deleteButton.classList.remove("armed");
					deleteButton.textContent = "Delete group";
				}, 4000);
				return;
			}
			groups.splice(selected, 1);
			selected = Math.max(0, selected - 1);
			changed({ rerender: true });
		},
	});
	const stay = el("input", {
		type: "checkbox",
		id: "groupStay",
		checked: !!group.stayInMenu,
		onchange: () => {
			group.stayInMenu = stay.checked || undefined;
			changed();
		},
	});

	return el("section", { class: "card" }, [
		el("div", { class: "card-head" }, [el("h2", { textContent: "Group" }), el("div", { class: "row-buttons" }, [el("button", { class: "small ghost", textContent: "Export group", onclick: () => exportGroup(group) }), deleteButton])]),
		el("div", { class: "grid-2" }, [field("Name", label), field("Color", colorRow(group)), field("Icon", iconButton(group.icon, "Group icon", (icon) => (group.icon = icon)), "Used on the menu key, and for functions without their own icon.")]),
		el("label", { class: "check" }, [stay, el("span", { textContent: "Stay in the menu after pressing a function (otherwise go back)" })]),
		el("div", { class: "ids" }, [el("label", {}, ["Group id ", id]), el("span", { textContent: "Used by references (id/function) and saved settings. Changing it breaks keys that use this group." })]),
	]);
}

function colorRow(group) {
	const picker = el("input", {
		type: "color",
		id: "groupColor",
		value: group.color || "#64748b",
		oninput: () => setColor(picker.value),
	});
	const setColor = (color) => {
		group.color = color;
		picker.value = color;
		row.querySelectorAll(".chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.color === color));
		$("main").style.setProperty("--group-color", color);
		changed();
	};
	const row = el("div", { class: "color-row" }, [
		picker,
		...COLORS.map((color) =>
			el("button", { class: `chip${group.color === color ? " active" : ""}`, style: `background:${color}`, "aria-label": color, "data-color": color, onclick: () => setColor(color) }),
		),
	]);
	return row;
}

function iconButton(current, title, onPick) {
	const button = el("button", { class: "icon-button" });
	const draw = (icon) => {
		button.replaceChildren(icon ? el("img", { src: server.icons[icon], alt: "" }) : el("span", { class: "hint", textContent: "None" }), el("span", { textContent: icon || "Choose…" }));
	};
	draw(current);
	button.addEventListener("click", () =>
		pickIcon(title, current, (icon) => {
			current = icon;
			onPick(icon);
			draw(icon);
			changed();
		}),
	);
	return button;
}

function functionsCard(group) {
	group.functions ??= [];
	return el("section", { class: "card" }, [
		el("div", { class: "card-head" }, [
			el("h2", { textContent: "Functions" }),
			el("button", { class: "small", textContent: "+ Add function", onclick: () => addFunction(group) }),
		]),
		group.functions.length === 0 ? el("p", { class: "hint", textContent: "No functions yet. A group needs at least one." }) : null,
		el("div", { class: "functions" }, group.functions.map((fn, i) => functionRow(group, fn, i))),
	]);
}

function addFunction(group) {
	const taken = new Set(group.functions.map((f) => f.id));
	group.functions.push({ id: uniqueId("function", taken), label: "New function", action: "" });
	changed({ rerender: true });
}

function functionRow(group, fn, index) {
	const label = el("input", {
		type: "text",
		value: fn.label ?? "",
		oninput: () => {
			fn.label = label.value;
			changed();
		},
	});
	const id = el("input", {
		type: "text",
		value: fn.id ?? "",
		oninput: () => {
			const next = id.value.trim();
			for (const layout of Object.values(group.layouts ?? {})) {
				for (const [cell, fnId] of Object.entries(layout)) {
					if (fnId === fn.id) layout[cell] = next;
				}
			}
			fn.id = next;
			changed();
		},
	});
	const move = (delta) => {
		const target = index + delta;
		if (target < 0 || target >= group.functions.length) return;
		group.functions.splice(target, 0, group.functions.splice(index, 1)[0]);
		changed({ rerender: true });
	};
	const type = commandType(fn);

	return el("div", { class: "fn" }, [
		el("div", { class: "fn-head" }, [
			field("Name", label),
			field("Icon", iconButton(fn.icon, `Icon for ${fn.label || "function"}`, (icon) => (icon ? (fn.icon = icon) : delete fn.icon))),
			el("div", { class: "fn-tools" }, [
				el("button", { class: "small ghost", textContent: "↑", title: "Move up", disabled: index === 0, onclick: () => move(-1) }),
				el("button", { class: "small ghost", textContent: "↓", title: "Move down", disabled: index === group.functions.length - 1, onclick: () => move(1) }),
				el("button", {
					class: "small ghost danger",
					textContent: "Remove",
					onclick: () => {
						group.functions.splice(index, 1);
						removeFromLayouts(group, fn.id);
						changed({ rerender: true });
					},
				}),
			]),
		]),
		el("div", { class: "fn-type", role: "group", "aria-label": "What it does" },
			TYPES.map((t) =>
				el("button", {
					class: t.id === type ? "active" : "",
					textContent: t.label,
					onclick: () => {
						if (t.id !== type) {
							setCommand(fn, t.id);
							changed({ rerender: true });
						}
					},
				}),
			),
		),
		el("div", { class: "fn-body" }, commandEditor(group, fn, type)),
		confirmCheck(fn),
		el("div", { class: "ids" }, [el("label", {}, ["Function id ", id])]),
	]);
}

function confirmCheck(fn) {
	const box = el("input", {
		type: "checkbox",
		checked: !!fn.confirm,
		onchange: () => {
			box.checked ? (fn.confirm = true) : delete fn.confirm;
			changed();
		},
	});
	return el("label", { class: "check" }, [box, el("span", { textContent: "Ask for confirmation before running (Confirm / Abort page; each key can skip it in its settings)" })]);
}

function removeFromLayouts(group, fnId) {
	for (const layout of Object.values(group.layouts ?? {})) {
		for (const [cell, id] of Object.entries(layout)) {
			if (id === fnId) delete layout[cell];
		}
	}
}

function commandEditor(group, fn, type) {
	if (type === "action") {
		const info = actionInfo(fn.action);
		const fallbackInfo = actionInfo(fn.fallback);
		const onWheel = [info, fallbackInfo].some((a) => /wheel \(axis\)/i.test(a?.bind ?? ""));
		const wheel = el("select", {
			onchange: () => {
				wheel.value ? (fn.wheel = wheel.value) : delete fn.wheel;
				changed({ rerender: true });
			},
		}, [
			el("option", { value: "", textContent: "Not used", selected: !fn.wheel }),
			el("option", { value: "up", textContent: "Scroll up", selected: fn.wheel === "up" }),
			el("option", { value: "down", textContent: "Scroll down", selected: fn.wheel === "down" }),
		]);
		const fallback = el("div", { class: "keys-row" }, [
			actionButton(fn, "fallback", "No fallback (optional)"),
			fn.fallback ? el("button", { class: "small ghost", textContent: "Clear", onclick: () => (delete fn.fallback, changed({ rerender: true })) }) : null,
		]);
		return [
			actionButton(fn, "action", "Choose a game action…"),
			info && !info.bind && !fallbackInfo?.bind ? el("p", { class: "hint", textContent: "No key is bound to this in Star Citizen. Bind one in the game (Options > Keybindings) for this function to work." }) : null,
			el("details", { class: "more", open: !!(fn.fallback || fn.wheel || onWheel) || undefined }, [
				el("summary", { textContent: "Fallback and mouse wheel" }),
				field("Fallback action", fallback, "Used when the action above has no key the plugin can press."),
				field("If the bind is the mouse wheel", wheel, onWheel && !fn.wheel ? "This action is on the mouse wheel: choose a direction, or the key cannot work." : "Each press (and each dial tick) scrolls one step; holding the key keeps scrolling."),
			]),
		];
	}
	if (type === "keys") {
		const hold = el("input", {
			type: "checkbox",
			checked: !!fn.hold,
			onchange: () => {
				fn.hold = hold.checked || undefined;
				changed();
			},
		});
		return [
			keysInput(fn.keys, (keys) => (fn.keys = keys)),
			el("label", { class: "check" }, [hold, el("span", { textContent: "Hold the keys for as long as the Stream Deck key is held" })]),
		];
	}
	if (type === "macro") {
		const steps = el("div", { class: "steps" }, fn.macro.map((step, i) => macroStep(fn, step, i)));
		return [
			steps,
			el("div", { class: "row-buttons" }, [
				el("button", { class: "small", textContent: "+ Keys", onclick: () => (fn.macro.push({ keys: "" }), changed({ rerender: true })) }),
				el("button", { class: "small", textContent: "+ Pause", onclick: () => (fn.macro.push({ delayMs: 500 }), changed({ rerender: true })) }),
			]),
		];
	}
	// ref
	const options = [el("option", { value: "", textContent: "Choose a function…" })];
	for (const g of [...server.builtinGroups, ...groups.filter((g) => g !== group)]) {
		const optgroup = el("optgroup", { label: g.label || g.id });
		for (const f of g.functions ?? []) {
			const value = `${g.id}/${f.id}`;
			optgroup.append(el("option", { value, textContent: f.label, selected: fn.ref === value }));
		}
		options.push(optgroup);
	}
	const ref = el("select", {
		onchange: () => {
			fn.ref = ref.value;
			changed();
		},
	}, options);
	return [ref, el("p", { class: "hint", textContent: "Runs that function exactly as its own key would." })];
}

function actionButton(fn, key, placeholder) {
	const info = actionInfo(fn[key]);
	return el("button", { class: "action-pick", onclick: () => pickAction(fn, key) }, [
		el("span", { textContent: fn[key] ? info?.label ?? fn[key] : placeholder }),
		fn[key] ? el("span", { class: `bind${info?.bind ? "" : " none"}`, textContent: info ? info.bind ?? "NO BIND" : "Not in this game version" }) : null,
	]);
}

function macroStep(fn, step, i) {
	const remove = el("button", { class: "small ghost danger", textContent: "×", title: "Remove step", onclick: () => (fn.macro.splice(i, 1), changed({ rerender: true })) });
	if ("delayMs" in step) {
		const ms = el("input", {
			type: "number",
			min: "0",
			max: "10000",
			step: "50",
			value: String(step.delayMs),
			oninput: () => {
				step.delayMs = Number(ms.value) || 0;
				changed();
			},
		});
		return el("div", { class: "step" }, [el("span", { class: "hint", textContent: "Pause (ms)" }), ms, remove]);
	}
	return el("div", { class: "step" }, [el("span", { class: "hint", textContent: "Press" }), keysInput(step.keys, (keys) => (step.keys = keys)), remove]);
}

/** Text box for a key combination, with a Record button that captures one. */
function keysInput(value, onChange) {
	const input = el("input", {
		type: "text",
		value: value ?? "",
		placeholder: "e.g. lctrl+f1",
		spellcheck: false,
		oninput: () => {
			onChange(input.value.trim());
			changed();
		},
	});
	const record = el("button", { class: "small", textContent: "Record" });
	record.addEventListener("click", () => recordKeys(record, (keys) => {
		input.value = keys;
		onChange(keys);
		changed();
	}));
	return el("div", { class: "keys-row" }, [input, record]);
}

let recording = null;

/** Captures the next key combination: modifiers plus one key, released together. */
function recordKeys(button, done) {
	recording?.stop();
	const down = new Set();
	const order = [];
	button.classList.add("recording");
	button.textContent = "Press keys…";
	const keydown = (e) => {
		e.preventDefault();
		e.stopPropagation();
		const key = codeToKey(e.code);
		if (!key) return;
		// AltGr arrives as LCtrl + RAlt; keep only RAlt.
		if (key === "ralt" && down.has("lctrl") && order.at(-1) === "lctrl") {
			down.delete("lctrl");
			order.pop();
		}
		if (!down.has(key)) {
			down.add(key);
			order.push(key);
		}
	};
	const keyup = (e) => {
		e.preventDefault();
		if (order.length === 0) return;
		const keys = [...order.filter((k) => MODIFIERS.includes(k)), ...order.filter((k) => !MODIFIERS.includes(k))];
		stop();
		done(keys.join("+"));
	};
	const stop = () => {
		window.removeEventListener("keydown", keydown, true);
		window.removeEventListener("keyup", keyup, true);
		button.classList.remove("recording");
		button.textContent = "Record";
		recording = null;
	};
	window.addEventListener("keydown", keydown, true);
	window.addEventListener("keyup", keyup, true);
	recording = { stop };
}

function codeToKey(code) {
	if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
	if (/^Digit[0-9]$/.test(code)) return code.slice(5);
	if (/^F([1-9]|1[0-2])$/.test(code)) return code.toLowerCase();
	if (/^Numpad[0-9]$/.test(code)) return `np_${code.slice(6)}`;
	return CODE_TO_KEY[code];
}

// ---------------------------------------------------------------------------
// Menu layout

function layoutCard(group) {
	const sizes = [...server.sizes];
	if (!sizes.some((s) => s.columns === DEFAULT_SIZE.columns && s.rows === DEFAULT_SIZE.rows)) {
		sizes.unshift(DEFAULT_SIZE);
	}
	const seen = new Set();
	const unique = sizes.filter((s) => {
		const key = `${s.columns}x${s.rows}`;
		return seen.has(key) ? false : seen.add(key);
	});
	const card = el("section", { class: "card" }, [
		el("div", { class: "card-head" }, [el("h2", { textContent: "Menu layout" })]),
		el("p", { class: "hint", textContent: "Where each function goes when the group opens as a menu. Automatic fills the keys in order. Back is always the bottom-left key." }),
	]);
	for (const size of unique) {
		card.append(layoutEditor(group, size));
	}
	return card;
}

function layoutEditor(group, size) {
	const key = `${size.columns}x${size.rows}`;
	group.layouts ??= {};
	const custom = !!group.layouts[key];
	const toggle = el("input", {
		type: "checkbox",
		checked: custom,
		onchange: () => {
			if (toggle.checked) {
				group.layouts[key] = autoLayout(group, size);
			} else {
				delete group.layouts[key];
			}
			if (Object.keys(group.layouts).length === 0) delete group.layouts;
			changed({ rerender: true });
		},
	});
	const wrap = el("div", { class: "field" }, [el("label", { class: "check" }, [toggle, el("span", { textContent: `${size.name} (${size.columns}×${size.rows}): choose the position of each function` })])]);
	if (!custom) {
		return wrap;
	}
	const layout = group.layouts[key];
	const grid = el("div", { class: "layout-grid", style: `grid-template-columns: repeat(${size.columns}, minmax(0, 1fr))` });
	for (let y = size.rows - 1; y >= 0; y--) {
		for (let x = 0; x < size.columns; x++) {
			const cell = `x${x}y${y}`;
			if (x === 0 && y === 0) {
				grid.append(el("div", { class: "back-cell", textContent: "Back" }));
				continue;
			}
			const pick = el("select", {
				title: cell,
				onchange: () => {
					if (pick.value) {
						for (const [other, fnId] of Object.entries(layout)) {
							if (fnId === pick.value) delete layout[other];
						}
						layout[cell] = pick.value;
					} else {
						delete layout[cell];
					}
					changed({ rerender: true });
				},
			}, [el("option", { value: "", textContent: "—" }), ...group.functions.map((fn) => el("option", { value: fn.id, textContent: fn.label, selected: layout[cell] === fn.id }))]);
			grid.append(pick);
		}
	}
	wrap.append(grid);
	return wrap;
}

/** Same order as the plugin's automatic layout: reading order, skipping Back. */
function autoLayout(group, size) {
	const layout = {};
	const cells = [];
	for (let y = size.rows - 1; y >= 0; y--) {
		for (let x = 0; x < size.columns; x++) {
			if (!(x === 0 && y === 0)) cells.push(`x${x}y${y}`);
		}
	}
	group.functions.forEach((fn, i) => {
		if (cells[i]) layout[cells[i]] = fn.id;
	});
	return layout;
}

// ---------------------------------------------------------------------------
// Preview

function schedulePreview() {
	clearTimeout(previewTimer);
	previewTimer = setTimeout(() => void updatePreview(), 250);
}

async function updatePreview() {
	const group = groups[selected];
	const keys = $("previewKeys");
	const error = $("previewError");
	if (!group) {
		keys.replaceChildren();
		error.hidden = true;
		return;
	}
	try {
		const result = await api("preview", { group });
		error.hidden = !result.error;
		error.textContent = result.error ? friendlyError(result.error) : "";
		if (!result.error) {
			keys.replaceChildren(
				el("figure", {}, [el("img", { src: result.menu, alt: "" }), el("figcaption", { textContent: "Menu key" })]),
				...group.functions.map((fn) => el("figure", {}, [el("img", { src: result.functions[fn.id], alt: "" }), el("figcaption", { textContent: fn.label })])),
			);
		}
	} catch (err) {
		error.hidden = false;
		error.textContent = err.message;
	}
}

/** Turns "group.functions[1].keys: ..." into "Function 2 (Name), keys: ...". */
function friendlyError(message) {
	const group = groups[selected];
	return message.replace(/^group\.functions\[(\d+)\]\.?/, (_, i) => {
		const fn = group.functions[Number(i)];
		return `Function ${Number(i) + 1}${fn?.label ? ` (${fn.label})` : ""}, `;
	}).replace(/^group\./, "Group ");
}

// ---------------------------------------------------------------------------
// Pickers

function openPicker(title, renderBody) {
	const dialog = $("picker");
	const search = $("pickerSearch");
	$("pickerTitle").textContent = title;
	search.value = "";
	const draw = () => renderBody(search.value.trim().toLowerCase(), $("pickerBody"), () => dialog.close());
	search.oninput = draw;
	draw();
	dialog.showModal();
	search.focus();
}

function pickAction(fn, key = "action") {
	const byMap = new Map();
	for (const action of server.actions) {
		if (!byMap.has(action.mapLabel)) byMap.set(action.mapLabel, []);
		byMap.get(action.mapLabel).push(action);
	}
	openPicker(key === "fallback" ? "Fallback game action" : "Game action", (query, body, close) => {
		body.replaceChildren();
		let shown = 0;
		for (const [mapLabel, actions] of byMap) {
			const matches = actions.filter((a) => !query || `${a.label ?? ""} ${a.id} ${mapLabel} ${a.bind ?? ""}`.toLowerCase().includes(query));
			if (matches.length === 0) continue;
			body.append(el("div", { class: "picker-section", textContent: mapLabel }));
			for (const action of matches.slice(0, query ? 200 : 60)) {
				shown++;
				body.append(
					el("button", {
						class: `action-option${action.id === fn[key] ? " active" : ""}`,
						title: action.description ?? "",
						onclick: () => {
							fn[key] = action.id;
							if (key === "action" && (!fn.label || fn.label === "New function")) {
								fn.label = action.label ?? fn.label;
							}
							close();
							changed({ rerender: true });
						},
					}, [
						el("span", { textContent: action.label ?? action.id }),
						el("span", { class: "id", textContent: action.id }),
						el("span", { class: `bind${action.bind ? "" : " none"}`, textContent: action.bind ?? "NO BIND" }),
					]),
				);
			}
		}
		if (shown === 0) body.append(el("p", { class: "hint", textContent: "Nothing matches." }));
	});
}

function pickIcon(title, current, onPick) {
	openPicker(title, (query, body, close) => {
		const names = Object.keys(server.icons).filter((name) => !query || name.includes(query));
		body.replaceChildren(
			el("div", { class: "icon-grid" }, [
				el("button", { class: `icon-option${current ? "" : " active"}`, onclick: () => (onPick(undefined), close()) }, [el("span", { style: "height:36px;display:grid;place-items:center", textContent: "—" }), "None"]),
				...names.map((name) =>
					el("button", { class: `icon-option${name === current ? " active" : ""}`, onclick: () => (onPick(name), close()) }, [el("img", { src: server.icons[name], alt: "" }), name]),
				),
			]),
		);
	});
}

// ---------------------------------------------------------------------------
// Import / export

const FILE_FORMAT = "deck-citizen";

function download(name, data) {
	const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
	el("a", { href: url, download: name }).click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const today = () => new Date().toISOString().slice(0, 10);

/** Everything: all custom groups plus the game folder settings. A backup, or to move to another PC. */
function exportAll() {
	const settings = Object.fromEntries(Object.entries(server.settings ?? {}).filter(([, v]) => v));
	download(`deck-citizen-backup-${today()}.json`, { format: FILE_FORMAT, version: 1, kind: "backup", exported: new Date().toISOString(), groups, settings });
}

/** One group, to share. */
function exportGroup(group) {
	download(`deck-citizen-${slug(group.id, "group")}.json`, { format: FILE_FORMAT, version: 1, kind: "groups", exported: new Date().toISOString(), groups: [group] });
}

/** Reads a file made by Export (or plain group JSON: a list, or { "groups": [...] }). */
function parseImport(text) {
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error("This is not a JSON file.");
	}
	const list = Array.isArray(data) ? data : Array.isArray(data?.groups) ? data.groups : isGroupLike(data) ? [data] : null;
	if (!list) {
		throw new Error("No groups found in this file.");
	}
	const bad = list.findIndex((g) => !isGroupLike(g));
	if (bad >= 0) {
		throw new Error(`Item ${bad + 1} is not a group (it needs an id, a label and functions).`);
	}
	const settings = data?.settings && typeof data.settings === "object" ? data.settings : null;
	return { groups: list, settings: settings && (settings.gameRoot || settings.channel) ? settings : null };
}

function isGroupLike(value) {
	return value && typeof value === "object" && typeof value.id === "string" && Array.isArray(value.functions);
}

function openImport(file) {
	const reader = new FileReader();
	reader.onload = () => {
		try {
			showImport(file.name, parseImport(String(reader.result)));
		} catch (err) {
			showImportError(file.name, err.message);
		}
	};
	reader.readAsText(file);
}

function showImportError(name, message) {
	importDialog(`Import ${name}`, [el("p", { class: "error-text", textContent: message })], [el("button", { class: "ghost", textContent: "Close", value: "cancel" })]);
}

function showImport(name, data) {
	const builtin = new Set(server.builtinGroups.map((g) => g.id));
	const mine = new Set(groups.map((g) => g.id));
	// What to do with each group: "add" (new id), "replace" (same id as one of yours), "copy" (keep both).
	const choices = data.groups.map((g) => (builtin.has(g.id) ? "copy" : mine.has(g.id) ? "replace" : "add"));
	const rows = data.groups.map((g, i) => {
		const conflict = builtin.has(g.id) ? "builtin" : mine.has(g.id) ? "mine" : null;
		const choice = conflict === "mine"
			? el("select", { onchange: (e) => (choices[i] = e.target.value) }, [
				el("option", { value: "replace", textContent: "Replace mine" }),
				el("option", { value: "copy", textContent: "Keep both" }),
				el("option", { value: "skip", textContent: "Skip" }),
			])
			: el("select", { onchange: (e) => (choices[i] = e.target.value) }, [
				el("option", { value: conflict ? "copy" : "add", textContent: conflict ? "Add as a copy" : "Add" }),
				el("option", { value: "skip", textContent: "Skip" }),
			]);
		return el("div", { class: "import-row" }, [
			el("span", { class: "swatch", style: `background:${g.color || "#64748b"}` }),
			el("span", { class: "name", textContent: `${g.label || g.id} · ${g.functions.length} function${g.functions.length === 1 ? "" : "s"}` }),
			el("span", { class: "hint", textContent: conflict === "builtin" ? "same id as a built-in group" : conflict === "mine" ? "you already have this group" : "" }),
			choice,
		]);
	});
	const restore = el("input", { type: "checkbox", checked: true });
	const replaceAll = el("input", { type: "checkbox" });
	const body = [
		el("p", { class: "hint", textContent: "Imported groups are added to the editor. Nothing changes on your Stream Deck until you press Save." }),
		el("div", { class: "import-list" }, rows),
		el("label", { class: "check" }, [replaceAll, el("span", { textContent: "Remove my other groups (replace everything with this file)" })]),
		data.settings
			? el("label", { class: "check" }, [restore, el("span", { textContent: `Also restore the game settings (${[data.settings.gameRoot, data.settings.channel].filter(Boolean).join(", ")})` })])
			: null,
	];
	const apply = el("button", {
		class: "primary",
		textContent: "Import",
		value: "ok",
		onclick: () => {
			const next = replaceAll.checked ? [] : clone(groups);
			const taken = () => new Set([...builtin, ...next.map((g) => g.id)]);
			data.groups.forEach((source, i) => {
				const group = clone(source);
				if (choices[i] === "skip") return;
				if (choices[i] === "replace") {
					const at = next.findIndex((g) => g.id === group.id);
					if (at >= 0) {
						next[at] = group;
						return;
					}
				}
				if (choices[i] === "copy" || taken().has(group.id)) {
					group.id = uniqueId(`${group.id}_imported`, taken());
					group.label = `${group.label || group.id} (imported)`;
				}
				next.push(group);
			});
			groups = next;
			if (data.settings && restore.checked) {
				pendingSettings = { gameRoot: data.settings.gameRoot ?? "", channel: data.settings.channel ?? "" };
			}
			selected = Math.max(0, groups.length - 1);
			render();
			updateSaveState({ text: "Imported: press Save to use it" });
		},
	});
	importDialog(`Import ${name}`, body, [el("button", { class: "ghost", textContent: "Cancel", value: "cancel" }), apply]);
}

function importDialog(title, body, buttons) {
	const dialog = $("importDialog");
	$("importTitle").textContent = title;
	$("importBody").replaceChildren(...body.filter(Boolean));
	$("importButtons").replaceChildren(...buttons);
	dialog.showModal();
}

// ---------------------------------------------------------------------------
// Toolbar and sidebar actions

function newGroup() {
	const id = uniqueId("my_group", allGroupIds());
	groups.push({ id, label: "My group", color: COLORS[groups.length % COLORS.length], icon: "ship", functions: [{ id: "function", label: "New function", action: "" }] });
	selected = groups.length - 1;
	changed({ rerender: true });
}

function copyBuiltin(id) {
	const source = server.builtinGroups.find((g) => g.id === id);
	if (!source) return;
	const copy = clone(source);
	copy.id = uniqueId(`${source.id}_custom`, allGroupIds());
	copy.label = `${source.label} (custom)`;
	for (const key of Object.keys(copy)) {
		if (copy[key] === undefined || copy[key] === false) delete copy[key];
	}
	groups.push(copy);
	selected = groups.length - 1;
	changed({ rerender: true });
}

async function save() {
	$("save").disabled = true;
	try {
		const result = await api("save", { groups, settings: pendingSettings ?? undefined });
		if (result.error) {
			updateSaveState({ text: "Not saved: fix the error in the preview" });
			$("previewError").hidden = false;
			$("previewError").textContent = result.error;
			return;
		}
		saved = clone(groups);
		pendingSettings = null;
		hideBanner();
		updateSaveState({ text: "Saved", ok: true });
	} catch (err) {
		updateSaveState({ text: `Not saved: ${err.message}` });
	}
}

$("save").addEventListener("click", () => void save());
$("discard").addEventListener("click", () => {
	groups = clone(saved);
	pendingSettings = null;
	selected = Math.min(selected, Math.max(groups.length - 1, 0));
	render();
});
$("newGroup").addEventListener("click", newGroup);
$("exportAll").addEventListener("click", exportAll);
$("importButton").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (e) => {
	const file = e.target.files?.[0];
	e.target.value = "";
	if (file) openImport(file);
});
// Dropping a file anywhere on the page imports it.
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
	e.preventDefault();
	const file = e.dataTransfer?.files?.[0];
	if (file) openImport(file);
});
$("copyBuiltin").addEventListener("change", (e) => {
	copyBuiltin(e.target.value);
	e.target.value = "";
});
$("applyJson").addEventListener("click", () => {
	try {
		const parsed = JSON.parse($("json").value);
		const list = Array.isArray(parsed) ? parsed : parsed?.groups;
		if (!Array.isArray(list)) throw new Error('Expected a list of groups or { "groups": [...] }');
		groups = list;
		selected = 0;
		$("jsonError").hidden = true;
		render();
	} catch (err) {
		$("jsonError").hidden = false;
		$("jsonError").textContent = err.message;
	}
});
$("copyJson").addEventListener("click", () => {
	const text = $("json");
	navigator.clipboard?.writeText(text.value).catch(() => text.select());
});
window.addEventListener("beforeunload", (e) => {
	if (isDirty()) e.preventDefault();
});

loadState(false)
	.then(listen)
	.catch((err) => showBanner(`Could not load the editor: ${err.message}`));
