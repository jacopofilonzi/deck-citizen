import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { app } from "../app.ts";
import type { Step } from "../catalog/catalog.ts";
import type { Group, GroupFunction, MenuLayout } from "../catalog/types.ts";
import { functionImage } from "../render/function-image.ts";
import { renderBlank, renderKey } from "../render/key-image.ts";
import { BACK_CELL, buildMenuPages, cellKey, fromDeck, type Cell, type GridSize, type MenuPage } from "./grid.ts";
import { MENU_PROFILES } from "./profiles.ts";

type MenuState = {
	groupId: string;
	layout?: MenuLayout;
	stay: boolean;
	/** Run functions that ask for confirmation without asking. */
	skipConfirm: boolean;
	page: number;
};

/** A pending "are you sure?" page: Confirm in the middle, Abort where Back is. */
type ConfirmState = {
	group: Group;
	fn: GroupFunction;
	steps: Step[];
	/** Opened from inside a menu (go back to it) or from a single key (leave the menu profile). */
	fromMenu: boolean;
	secondsLeft: number;
	timer: NodeJS.Timeout;
};

/** Without an answer, the confirmation page aborts after this many seconds. */
const CONFIRM_SECONDS = 5;
const CONFIRM_COLOR = "#ef4444";

type SlotAction = KeyAction<JsonObject>;

/**
 * Shows a group as a page of keys, using the plugin's menu profile. One menu can be
 * open per device; the slots of the profile ask this controller what to display.
 */
class MenuController {
	readonly #menus = new Map<string, MenuState>();
	readonly #slots = new Map<string, Map<string, SlotAction>>();
	readonly #confirms = new Map<string, ConfirmState>();

	constructor() {
		app.on("changed", () => this.#renderAll());
	}

	canOpen(deviceType: number): boolean {
		return MENU_PROFILES[deviceType as keyof typeof MENU_PROFILES] !== undefined;
	}

	/**
	 * Opens the menu of `group` on a device.
	 */
	async open(deviceId: string, deviceType: number, group: Group, options: { layout?: MenuLayout; stay: boolean; skipConfirm?: boolean }): Promise<boolean> {
		this.#cancelConfirm(deviceId);
		this.#menus.set(deviceId, { groupId: group.id, layout: options.layout, stay: options.stay, skipConfirm: options.skipConfirm === true, page: 0 });
		return this.#show(deviceId, deviceType);
	}

	/**
	 * Asks for confirmation before running a function pressed on a single key or dial,
	 * using the menu profile. Returns false when the device has no menu profile.
	 */
	async confirm(deviceId: string, deviceType: number, group: Group, fn: GroupFunction, steps: Step[]): Promise<boolean> {
		if (!this.canOpen(deviceType)) {
			return false;
		}
		this.#menus.delete(deviceId);
		this.#startConfirm(deviceId, group, fn, steps, false);
		return this.#show(deviceId, deviceType);
	}

	/** Leaves the menu and returns to the profile that was active before. */
	async close(deviceId: string): Promise<void> {
		this.#cancelConfirm(deviceId);
		this.#menus.delete(deviceId);
		await streamDeck.profiles.switchToProfile(deviceId);
	}

	async #show(deviceId: string, deviceType: number): Promise<boolean> {
		const profile = MENU_PROFILES[deviceType as keyof typeof MENU_PROFILES];
		if (!profile) {
			return false;
		}
		if ((this.#slots.get(deviceId)?.size ?? 0) > 0) {
			this.#renderDevice(deviceId);
		} else {
			await streamDeck.profiles.switchToProfile(deviceId, profile);
		}
		return true;
	}

	#startConfirm(deviceId: string, group: Group, fn: GroupFunction, steps: Step[], fromMenu: boolean): void {
		this.#cancelConfirm(deviceId);
		const state: ConfirmState = {
			group,
			fn,
			steps,
			fromMenu,
			secondsLeft: CONFIRM_SECONDS,
			timer: setInterval(() => {
				state.secondsLeft--;
				if (state.secondsLeft <= 0) {
					void this.#answerConfirm(deviceId, false);
				} else {
					this.#renderDevice(deviceId);
				}
			}, 1000),
		};
		this.#confirms.set(deviceId, state);
	}

	#cancelConfirm(deviceId: string): ConfirmState | undefined {
		const state = this.#confirms.get(deviceId);
		if (state) {
			clearInterval(state.timer);
			this.#confirms.delete(deviceId);
		}
		return state;
	}

	/** Confirm (runs the function) or Abort, then back to the menu or out of the menu profile. */
	async #answerConfirm(deviceId: string, confirmed: boolean): Promise<void> {
		const state = this.#cancelConfirm(deviceId);
		if (!state) {
			return;
		}
		if ((this.#slots.get(deviceId)?.size ?? 0) === 0) {
			// The user already left the menu profile: nothing to run or to go back from.
			return;
		}
		if (confirmed) {
			// Confirmed functions are run in one go: there is no key release to wait for.
			await app.executor.trigger(state.steps);
		}
		const menu = this.#menus.get(deviceId);
		if (state.fromMenu && menu && (menu.stay || !confirmed)) {
			this.#renderDevice(deviceId);
		} else {
			await this.close(deviceId);
		}
	}

	slotAppeared(action: SlotAction): void {
		const device = action.device.id;
		let slots = this.#slots.get(device);
		if (!slots) {
			slots = new Map();
			this.#slots.set(device, slots);
		}
		slots.set(action.id, action);
		if (this.#confirms.has(device)) {
			// Where Confirm goes depends on which slots exist: redraw them all.
			this.#renderDevice(device);
		} else {
			this.#render(action);
		}
	}

	slotDisappeared(action: { id: string; device: { id: string } }): void {
		this.#slots.get(action.device.id)?.delete(action.id);
		void app.executor.release(action.id);
	}

	async slotDown(action: SlotAction): Promise<void> {
		const device = action.device.id;
		if (this.#confirms.has(device)) {
			const cell = this.#cellOf(action);
			if (cell === this.#confirmCell(device, action.device.size)) {
				await this.#answerConfirm(device, true);
			} else if (cell === cellKey(BACK_CELL)) {
				await this.#answerConfirm(device, false);
			}
			return;
		}
		const slot = this.#slotAt(action);
		const menu = this.#menus.get(device);

		if (!slot || slot.kind === "back" || !menu) {
			// No menu state (e.g. Stream Deck restarted while in the menu): Back is the only sensible action.
			if (!slot || slot.kind === "back") {
				await this.close(device);
			}
			return;
		}
		if (slot.kind === "next") {
			menu.page = (menu.page + 1) % slot.pages;
			this.#renderDevice(device);
			return;
		}

		const group = app.catalog.group(menu.groupId);
		const fn = group?.functions.find((f) => f.id === slot.fnId);
		if (!group || !fn) {
			await action.showAlert();
			return;
		}
		const execution = app.catalog.plan(fn.command);
		if (!execution.ok) {
			await action.showAlert();
			return;
		}
		if (!menu.skipConfirm && app.catalog.needsConfirm(fn)) {
			this.#startConfirm(device, group, fn, execution.steps, true);
			this.#renderDevice(device);
			return;
		}
		if (menu.stay) {
			await app.executor.press(action.id, execution.steps);
		} else {
			// The menu closes right away, so there is no key release to wait for.
			await app.executor.trigger(execution.steps);
			await this.close(device);
		}
	}

	async slotUp(action: SlotAction): Promise<void> {
		await app.executor.release(action.id);
	}

	#pages(deviceId: string, size: GridSize): MenuPage[] | undefined {
		const menu = this.#menus.get(deviceId);
		const group = app.catalog.group(menu?.groupId);
		return menu && group ? buildMenuPages(group, size, menu.layout) : undefined;
	}

	#cellOf(action: SlotAction): string | undefined {
		return action.coordinates ? cellKey(fromDeck(action.coordinates, action.device.size)) : undefined;
	}

	#slotAt(action: SlotAction) {
		const cell = this.#cellOf(action);
		if (!cell) {
			return undefined;
		}
		const size = action.device.size;
		const pages = this.#pages(action.device.id, size);
		if (!pages) {
			return cell === "x0y0" ? ({ kind: "back" } as const) : undefined;
		}
		const menu = this.#menus.get(action.device.id);
		return pages[Math.min(menu?.page ?? 0, pages.length - 1)]?.get(cell);
	}

	#render(action: SlotAction): void {
		const confirm = this.#confirms.get(action.device.id);
		if (confirm) {
			this.#renderConfirm(action, confirm);
			return;
		}
		const slot = this.#slotAt(action);
		const menu = this.#menus.get(action.device.id);
		const group = app.catalog.group(menu?.groupId);
		let image: string;

		if (!slot) {
			image = renderBlank();
		} else if (slot.kind === "back") {
			image = renderKey({ caption: group?.label, label: "Back", icon: "back", color: group?.color ?? "#64748b" });
		} else if (slot.kind === "next") {
			image = renderKey({ caption: group?.label, label: "Next", icon: "next", color: group?.color ?? "#64748b", footer: `${slot.page + 1} / ${slot.pages}` });
		} else {
			const fn = group?.functions.find((f) => f.id === slot.fnId);
			image = group && fn ? functionImage(group, fn, app.catalog.status(fn)) : renderBlank();
		}
		void action.setImage(image);
		void action.setTitle("");
	}

	/**
	 * Cell of the Confirm key: the middle of the device, or the first key in reading order
	 * if the profile has no slot there (e.g. the user removed it from the menu profile).
	 */
	#confirmCell(deviceId: string, size: GridSize): string {
		const preferred = cellKey(confirmCell(size));
		const cells = new Set([...(this.#slots.get(deviceId)?.values() ?? [])].map((slot) => this.#cellOf(slot)));
		if (cells.has(preferred)) {
			return preferred;
		}
		for (let y = size.rows - 1; y >= 0; y--) {
			for (let x = 0; x < size.columns; x++) {
				const cell = cellKey({ x, y });
				if (cell !== cellKey(BACK_CELL) && cells.has(cell)) {
					return cell;
				}
			}
		}
		return preferred;
	}

	#renderConfirm(action: SlotAction, confirm: ConfirmState): void {
		const cell = this.#cellOf(action);
		const { fn, group } = confirm;
		let image: string;
		if (cell === this.#confirmCell(action.device.id, action.device.size)) {
			image = renderKey({ caption: fn.label, label: "Confirm", icon: fn.icon ?? group.icon, color: CONFIRM_COLOR });
		} else if (cell === cellKey(BACK_CELL)) {
			image = renderKey({ caption: fn.label, label: "Abort", icon: "back", color: "#64748b", footer: `${confirm.secondsLeft} s` });
		} else {
			image = renderBlank();
		}
		void action.setImage(image);
		void action.setTitle("");
	}

	#renderDevice(deviceId: string): void {
		for (const action of this.#slots.get(deviceId)?.values() ?? []) {
			this.#render(action);
		}
	}

	#renderAll(): void {
		for (const deviceId of this.#slots.keys()) {
			this.#renderDevice(deviceId);
		}
	}
}

/** Where the Confirm key goes: the middle of the device. */
function confirmCell(size: GridSize): Cell {
	return { x: Math.floor(size.columns / 2), y: Math.floor(size.rows / 2) };
}

export const menus = new MenuController();
