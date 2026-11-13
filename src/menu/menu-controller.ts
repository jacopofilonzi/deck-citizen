import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { app } from "../app.ts";
import type { Group, MenuLayout } from "../catalog/types.ts";
import { functionImage } from "../render/function-image.ts";
import { renderBlank, renderKey } from "../render/key-image.ts";
import { buildMenuPages, cellKey, fromDeck, type GridSize, type MenuPage } from "./grid.ts";
import { MENU_PROFILES } from "./profiles.ts";

type MenuState = {
	groupId: string;
	layout?: MenuLayout;
	stay: boolean;
	page: number;
};

type SlotAction = KeyAction<JsonObject>;

/**
 * Shows a group as a page of keys, using the plugin's menu profile. One menu can be
 * open per device; the slots of the profile ask this controller what to display.
 */
class MenuController {
	readonly #menus = new Map<string, MenuState>();
	readonly #slots = new Map<string, Map<string, SlotAction>>();

	constructor() {
		app.on("changed", () => this.#renderAll());
	}

	canOpen(deviceType: number): boolean {
		return MENU_PROFILES[deviceType as keyof typeof MENU_PROFILES] !== undefined;
	}

	/**
	 * Opens the menu of `group` on a device.
	 */
	async open(deviceId: string, deviceType: number, group: Group, options: { layout?: MenuLayout; stay: boolean }): Promise<boolean> {
		const profile = MENU_PROFILES[deviceType as keyof typeof MENU_PROFILES];
		if (!profile) {
			return false;
		}
		this.#menus.set(deviceId, { groupId: group.id, layout: options.layout, stay: options.stay, page: 0 });
		if ((this.#slots.get(deviceId)?.size ?? 0) > 0) {
			this.#renderDevice(deviceId);
		} else {
			await streamDeck.profiles.switchToProfile(deviceId, profile);
		}
		return true;
	}

	/** Leaves the menu and returns to the profile that was active before. */
	async close(deviceId: string): Promise<void> {
		this.#menus.delete(deviceId);
		await streamDeck.profiles.switchToProfile(deviceId);
	}

	slotAppeared(action: SlotAction): void {
		const device = action.device.id;
		let slots = this.#slots.get(device);
		if (!slots) {
			slots = new Map();
			this.#slots.set(device, slots);
		}
		slots.set(action.id, action);
		this.#render(action);
	}

	slotDisappeared(action: { id: string; device: { id: string } }): void {
		this.#slots.get(action.device.id)?.delete(action.id);
		void app.executor.release(action.id);
	}

	async slotDown(action: SlotAction): Promise<void> {
		const device = action.device.id;
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

	#slotAt(action: SlotAction) {
		const coordinates = action.coordinates;
		if (!coordinates) {
			return undefined;
		}
		const size = action.device.size;
		const cell = cellKey(fromDeck(coordinates, size));
		const pages = this.#pages(action.device.id, size);
		if (!pages) {
			return cell === "x0y0" ? ({ kind: "back" } as const) : undefined;
		}
		const menu = this.#menus.get(action.device.id);
		return pages[Math.min(menu?.page ?? 0, pages.length - 1)]?.get(cell);
	}

	#render(action: SlotAction): void {
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

export const menus = new MenuController();
