// Property inspector of the "Function" action.
// Talks to Stream Deck over its WebSocket; all data (groups, functions, bind status)
// comes from the plugin, which is also the only writer of the global settings.
"use strict";

const MENU = "menu";
const CHANNELS = ["LIVE", "PTU", "EPTU", "TECH-PREVIEW", "HOTFIX"];
const CUSTOM_EXAMPLE = `[
  {
    "id": "my_ship",
    "label": "My Ship",
    "color": "#f43f5e",
    "icon": "ship",
    "stayInMenu": true,
    "functions": [
      { "id": "doors", "label": "Open Doors", "icon": "door-open", "ref": "doors/open" },
      { "id": "beacon", "label": "Beacon", "icon": "light", "keys": "lctrl+f1" },
      { "id": "ready", "label": "Ready Up", "macro": [
        { "keys": "ralt+r" }, { "delayMs": 1500 }, { "keys": "n" }
      ] }
    ],
    "layouts": { "5x3": { "x1y1": "doors", "x2y1": "beacon", "x3y1": "ready" } }
  }
]`;

let socket;
let context;
let actionUuid;
let settings = {};
let state;
let customDirty = false;

let customResult = null;

// ---------------------------------------------------------------------------
// Stream Deck connection

// Called by Stream Deck when the property inspector loads.
// eslint-disable-next-line no-unused-vars
function connectElgatoStreamDeckSocket(port, uuid, registerEvent, _info, actionInfo) {
	context = uuid;
	const info = JSON.parse(actionInfo);
	actionUuid = info.action;
	settings = info.payload?.settings ?? {};

	socket = new WebSocket(`ws://127.0.0.1:${port}`);
	socket.onopen = () => {
		send({ event: registerEvent, uuid });
		toPlugin({ type: "getState" });
	};
	socket.onmessage = (message) => {
		const data = JSON.parse(message.data);
		if (data.event === "didReceiveSettings") {
			settings = data.payload?.settings ?? {};
			render();
		} else if (data.event === "sendToPropertyInspector") {
			onPluginMessage(data.payload);
		}
	};
}

function send(message) {
	socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));
}

function toPlugin(payload) {
	send({ event: "sendToPlugin", action: actionUuid, context, payload });
}

function saveSettings(changes) {
	settings = { ...settings, ...changes };
	for (const [key, value] of Object.entries(settings)) {
		if (value === undefined || value === "") {
			delete settings[key];
		}
	}
	send({ event: "setSettings", context, payload: settings });
	render();
}

function onPluginMessage(payload) {
	if (payload?.type === "state") {
		state = payload;
		render();
	} else if (payload?.type === "updateResult") {
		updateError = payload.error ? `Could not install: ${payload.error}` : null;
		render();
	} else if (payload?.type === "customGroupsResult") {
		customResult = payload.error ? { error: payload.error } : { ok: "Custom groups saved." };
		if (!payload.error) {
			customDirty = false;
		}
		renderCustomResult();
	}
}

// ---------------------------------------------------------------------------
// DOM helpers

function el(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(props)) {
		if (key === "class") {
			node.className = value;
		} else if (key.startsWith("on")) {
			node.addEventListener(key.slice(2), value);
		} else if (value !== undefined && value !== null && value !== false) {
			node[key] = value;
		}
	}
	for (const child of [].concat(children)) {
		if (child !== null && child !== undefined && child !== false) {
			node.append(child);
		}
	}
	return node;
}

function row(label, control) {
	return el("div", { class: "row" }, [el("label", { textContent: label }), control]);
}

function select(options, value, onchange) {
	const node = el("select", { onchange: (e) => onchange(e.target.value) });
	for (const option of options) {
		node.append(el("option", { value: option.value, textContent: option.label, disabled: option.disabled }));
	}
	node.value = value ?? "";
	return node;
}

function checkbox(label, checked, onchange) {
	const input = el("input", { type: "checkbox", checked, onchange: (e) => onchange(e.target.checked) });
	return el("div", { class: "row" }, [el("label", { textContent: "" }), el("label", { class: "check" }, [input, " ", label])]);
}

/** "Skip confirmation" option, shown only when one of the key's functions asks for confirmation. */
function confirmOption(functions) {
	const asking = functions.filter((fn) => fn?.confirm);
	if (asking.length === 0) {
		return [];
	}
	return [
		checkbox("Skip confirmation", settings.skipConfirm === true, (value) => saveSettings({ skipConfirm: value || undefined })),
		el("p", { class: "hint", textContent: `${asking.map((fn) => fn.label).join(", ")} ${asking.length > 1 ? "ask" : "asks"} for confirmation before running.` }),
	];
}

function message(kind, text) {
	return el("div", { class: `message ${kind}`, textContent: text });
}

const marker = (fn) => (fn.state === "ready" ? "" : fn.state === "missing" ? " ✖" : " ⚠");

function groupOptions(placeholder) {
	const builtin = state.groups.filter((g) => !g.custom);
	const custom = state.groups.filter((g) => g.custom);
	return [
		{ value: "", label: placeholder },
		...builtin.map((g) => ({ value: g.id, label: g.label })),
		...(custom.length ? [{ value: "", label: "── Custom ──", disabled: true }] : []),
		...custom.map((g) => ({ value: g.id, label: g.label })),
	];
}

function functionOptions(group, withMenu) {
	return [
		{ value: "", label: "Choose a function…" },
		...group.functions.map((fn) => ({ value: fn.id, label: fn.label + marker(fn) })),
		...(withMenu ? [{ value: MENU, label: "Menu (all functions)" }] : []),
	];
}

function statusMessage(fn) {
	if (fn.state === "ready") {
		return message("info", `Key: ${fn.bindText}`);
	}
	return message(fn.state === "missing" ? "error" : "warning", fn.message);
}

// ---------------------------------------------------------------------------
// Rendering

function render() {
	const app = document.getElementById("app");
	if (!state) {
		return;
	}
	let main = document.getElementById("main");
	if (!main) {
		app.replaceChildren(el("div", { id: "main" }), renderGlobal());
		main = document.getElementById("main");
	}
	main.replaceChildren(
		...(state.update ? [updateBanner(state.update)] : []),
		...(state.game.warning ? [message("warning", state.game.warning)] : []),
		...(state.controller === "Encoder" ? renderDial() : renderKey()),
	);
	updateGlobal();
}

let updateError = null;

function updateBanner(update) {
	return el("div", { class: "message update" }, [
		el("strong", { textContent: `Update available: ${update.version}` }),
		` (you have ${update.current}). `,
		el("div", { class: "buttons", style: "margin: 6px 0 0" }, [
			el("button", { textContent: "Install", onclick: () => ((updateError = null), toPlugin({ type: "installUpdate" })) }),
			el("button", { textContent: "What's new", onclick: () => toPlugin({ type: "openRelease" }) }),
		]),
		el("p", { class: "hint", style: "margin: 6px 0 0", textContent: updateError ?? "Install downloads the new version; Stream Deck then asks you to confirm." }),
	]);
}

function renderKey() {
	const nodes = [];
	const group = state.groups.find((g) => g.id === settings.group);
	nodes.push(row("Group", select(groupOptions("Choose a group…"), settings.group, (value) => saveSettings({ group: value, fn: undefined, layout: undefined }))));
	if (!group) {
		return nodes;
	}

	nodes.push(row("Function", select(functionOptions(group, true), settings.fn, (value) => saveSettings({ fn: value }))));

	if (settings.fn === MENU) {
		nodes.push(...renderMenuOptions(group));
	} else {
		const fn = group.functions.find((f) => f.id === settings.fn);
		if (fn) {
			nodes.push(statusMessage(fn), ...confirmOption([fn]));
		}
	}
	return nodes;
}

function renderMenuOptions(group) {
	const nodes = [];
	if (!state.menuSupported) {
		nodes.push(message("warning", "Menus are not available on this device type yet."));
	}
	const groupDefault = group.stayInMenu ? "stay in menu" : "go back";
	nodes.push(
		row(
			"After press",
			select(
				[
					{ value: "group", label: `Group default (${groupDefault})` },
					{ value: "stay", label: "Stay in menu" },
					{ value: "back", label: "Go back" },
				],
				settings.after ?? "group",
				(value) => saveSettings({ after: value === "group" ? undefined : value }),
			),
		),
	);

	const size = `${state.device.columns}x${state.device.rows}`;
	const custom = settings.layout && Object.keys(settings.layout).length > 0;
	nodes.push(
		row(
			"Layout",
			select(
				[
					{ value: "group", label: group.layouts[size] ? "Group layout" : "Automatic" },
					{ value: "custom", label: "Custom for this key" },
				],
				custom ? "custom" : "group",
				(value) => saveSettings({ layout: value === "custom" ? { ...(group.layouts[size] ?? defaultLayout(group)) } : undefined }),
			),
		),
	);
	if (custom) {
		nodes.push(renderLayoutGrid(group));
	}
	nodes.push(...confirmOption(group.functions));

	const problems = group.functions.filter((fn) => fn.state !== "ready");
	if (problems.length > 0) {
		nodes.push(message("warning", `Not bound in Star Citizen: ${problems.map((fn) => fn.label).join(", ")}. Bind a real key to these in the game to use them.`));
	}
	return nodes;
}

/** First functions in reading order, as a starting point for a custom layout. */
function defaultLayout(group) {
	const layout = {};
	const cells = [];
	for (let y = state.device.rows - 1; y >= 0; y--) {
		for (let x = 0; x < state.device.columns; x++) {
			if (x !== 0 || y !== 0) {
				cells.push(`x${x}y${y}`);
			}
		}
	}
	group.functions.slice(0, cells.length).forEach((fn, i) => (layout[cells[i]] = fn.id));
	return layout;
}

function renderLayoutGrid(group) {
	const grid = el("div", { class: "grid" });
	grid.style.gridTemplateColumns = `repeat(${state.device.columns}, 1fr)`;
	const options = [{ value: "", label: "—" }, ...group.functions.map((fn) => ({ value: fn.id, label: fn.label }))];
	// Top row first, so the grid looks like the device. x0y0 (bottom-left) is Back.
	for (let y = state.device.rows - 1; y >= 0; y--) {
		for (let x = 0; x < state.device.columns; x++) {
			const cell = `x${x}y${y}`;
			if (x === 0 && y === 0) {
				grid.append(el("div", { class: "back", textContent: "Back" }));
				continue;
			}
			grid.append(
				select(options, settings.layout?.[cell] ?? "", (value) => {
					const layout = { ...(settings.layout ?? {}) };
					if (value) {
						layout[cell] = value;
					} else {
						delete layout[cell];
					}
					saveSettings({ layout: Object.keys(layout).length ? layout : { [cell]: "" } });
				}),
			);
		}
	}
	return grid;
}

function renderDial() {
	const nodes = [el("p", { class: "hint", textContent: "One step per tick. Each gesture runs its own function." })];
	const chosen = [];
	for (const [key, label] of [
		["rotateRight", "Rotate right"],
		["rotateLeft", "Rotate left"],
		["press", "Press"],
	]) {
		const [groupId, fnId] = (settings[key] ?? "/").split("/");
		const group = state.groups.find((g) => g.id === groupId);
		nodes.push(el("h3", { textContent: label }));
		nodes.push(row("Group", select(groupOptions("None"), groupId, (value) => saveSettings({ [key]: value ? `${value}/` : undefined }))));
		if (group) {
			nodes.push(row("Function", select(functionOptions(group, false), fnId, (value) => saveSettings({ [key]: `${group.id}/${value}` }))));
			const fn = group.functions.find((f) => f.id === fnId);
			if (fn) {
				nodes.push(statusMessage(fn));
				chosen.push(fn);
			}
		}
	}
	nodes.push(...confirmOption(chosen));
	return nodes;
}

// ---------------------------------------------------------------------------
// Plugin-wide settings (built once, so typing is never interrupted by re-renders)

function renderGlobal() {
	const gameRoot = el("input", { type: "text", id: "gameRoot" });
	const channel = select(CHANNELS.map((c) => ({ value: c, label: c })), "LIVE", () => undefined);
	channel.id = "channel";

	const custom = el("textarea", { id: "customGroups", spellcheck: false, placeholder: CUSTOM_EXAMPLE, oninput: () => (customDirty = true) });

	return el("details", { id: "global" }, [
		el("summary", { textContent: "Plugin settings" }),
		el("h3", { textContent: "Game" }),
		row("Game folder", gameRoot),
		row("Channel", channel),
		el("div", { class: "buttons" }, [
			el("button", { textContent: "Save", onclick: () => toPlugin({ type: "setGame", gameRoot: gameRoot.value, channel: channel.value }) }),
			el("button", { textContent: "Reload binds", onclick: () => toPlugin({ type: "reloadBinds" }) }),
		]),
		el("div", { id: "gameInfo", class: "message info" }),
		el("h3", { textContent: "Updates" }),
		el("label", { class: "check", style: "margin-left: 0" }, [
			el("input", { type: "checkbox", id: "checkUpdates", onchange: (e) => toPlugin({ type: "setCheckUpdates", enabled: e.target.checked }) }),
			" Check GitHub for new versions (once a day)",
		]),
		el("h3", { textContent: "Custom groups" }),
		el("div", { class: "buttons", style: "margin-left: 0" }, [
			el("button", { textContent: "Open group editor", onclick: () => toPlugin({ type: "openEditor" }) }),
		]),
		el("p", { class: "hint", textContent: "Opens in your browser. Or edit the JSON below." }),
		el("h3", { textContent: "Custom groups (JSON)" }),
		el("p", {
			class: "hint",
			innerHTML:
				'Each function uses one of: <code>"ref": "group/function"</code>, <code>"keys": "lctrl+f1"</code> (optional <code>"holdMs"</code>, <code>"hold": true</code>), <code>"macro": [...]</code> or <code>"action": "actionmap/action"</code> (optional <code>"fallback"</code> action, <code>"wheel": "up"</code>/<code>"down"</code> for mouse wheel binds). <code>"confirm": true</code> asks before running. Layout cells are <code>x</code> from the left and <code>y</code> from the bottom; <code>x0y0</code> is Back.',
		}),
		custom,
		el("div", { class: "buttons", style: "margin-left: 0" }, [
			el("button", { textContent: "Apply", onclick: () => toPlugin({ type: "setCustomGroups", json: custom.value }) }),
			el("button", {
				textContent: "Export",
				onclick: () => {
					custom.select();
					navigator.clipboard?.writeText(custom.value);
				},
			}),
			el("button", {
				textContent: "Insert example",
				onclick: () => {
					custom.value = CUSTOM_EXAMPLE;
					customDirty = true;
				},
			}),
			el("button", {
				textContent: "Show built-in groups",
				onclick: () => {
					custom.value = state.builtinGroups;
					customDirty = true;
				},
			}),
		]),
		el("div", { id: "customResult" }),
	]);
}

function updateGlobal() {
	const gameRoot = document.getElementById("gameRoot");
	const channel = document.getElementById("channel");
	if (document.activeElement !== gameRoot) {
		gameRoot.value = state.game.root;
	}
	if (document.activeElement !== channel) {
		channel.value = state.game.channel;
	}
	document.getElementById("checkUpdates").checked = state.checkUpdates;
	document.getElementById("gameInfo").textContent =
		`Game: ${state.game.installedBuild ?? "not found"} · Default binds: ${state.game.reading ? "reading your game…" : state.game.defaultsOrigin === "game" ? "from your game" : `plugin copy (${state.game.defaultsBuild ?? "none"})`} · Your rebinds: ${state.game.userBinds}`;

	const custom = document.getElementById("customGroups");
	if (!customDirty) {
		custom.value = state.customGroups === "[]" ? "" : state.customGroups;
	}
	if (!customResult && state.customGroupsError) {
		customResult = { error: `Saved custom groups are invalid and were ignored: ${state.customGroupsError}` };
	}
	renderCustomResult();
}

function renderCustomResult() {
	const target = document.getElementById("customResult");
	if (!target) {
		return;
	}
	target.replaceChildren(
		customResult?.error ? el("div", { class: "message error", style: "margin-left: 0", textContent: customResult.error }) : "",
		customResult?.ok ? el("div", { class: "message ok", style: "margin-left: 0", textContent: customResult.ok }) : "",
	);
}
