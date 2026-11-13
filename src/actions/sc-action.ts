import streamDeck, {
	action,
	SingletonAction,
	type Action,
	type DialDownEvent,
	type DialRotateEvent,
	type DialUpEvent,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type KeyUpEvent,
	type PropertyInspectorDidAppearEvent,
	type SendToPluginEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { app } from "../app.ts";
import type { Step } from "../catalog/catalog.ts";
import { groupToJson } from "../catalog/groups.ts";
import type { FunctionRef, MenuLayout } from "../catalog/types.ts";
import { editorServer } from "../editor/editor-server.ts";
import { updates } from "../update/update-checker.ts";
import { menus } from "../menu/menu-controller.ts";
import { explainStatus, functionImage } from "../render/function-image.ts";
import { renderKey } from "../render/key-image.ts";

/** Value of `fn` that opens the group's menu instead of running a function. */
export const MENU = "menu";

export type ScSettings = {
	group?: string;
	/** Function id of the group, or {@link MENU}. */
	fn?: string;
	/** Menu only: what happens after a function is pressed. */
	after?: "group" | "stay" | "back";
	/** Menu only: per-key layout replacing the group's one. */
	layout?: MenuLayout;
	/** Run functions that ask for confirmation (eject, self destruct...) right away. */
	skipConfirm?: boolean;
	/** Dials: functions for each gesture. */
	rotateRight?: FunctionRef;
	rotateLeft?: FunctionRef;
	press?: FunctionRef;
};

type ScAction = Action<ScSettings>;

const showAlert = (instance: ScAction): Promise<void> =>
	instance.isKey() || instance.isDial() ? instance.showAlert() : Promise.resolve();

/** Messages the property inspector sends. */
type PiRequest =
	| { type: "getState" }
	| { type: "setGame"; gameRoot: string; channel: string }
	| { type: "setCustomGroups"; json: string }
	| { type: "reloadBinds" }
	| { type: "openEditor" }
	| { type: "installUpdate" }
	| { type: "openRelease" }
	| { type: "setCheckUpdates"; enabled: boolean };

/**
 * The single "Function" action. Configured with a group and either one of its
 * functions or the group's menu. On dials, each gesture runs its own function.
 */
@action({ UUID: "it.jacopofilonzi.deck-citizen.action" })
export class ScDeckAction extends SingletonAction<ScSettings> {
	constructor() {
		super();
		app.on("changed", () => {
			for (const instance of this.actions) {
				void instance.getSettings().then((settings) => this.#render(instance, settings));
			}
		});
	}

	override onWillAppear(ev: WillAppearEvent<ScSettings>): void {
		this.#render(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<ScSettings>): void {
		void app.executor.release(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<ScSettings>): void {
		this.#render(ev.action, ev.payload.settings);
	}

	override async onKeyDown(ev: KeyDownEvent<ScSettings>): Promise<void> {
		const settings = ev.payload.settings;
		const group = app.catalog.group(settings.group);
		if (!group) {
			await ev.action.showAlert();
			return;
		}

		if (settings.fn === MENU) {
			const stay = settings.after === "stay" ? true : settings.after === "back" ? false : group.stayInMenu;
			const opened = await menus.open(ev.action.device.id, ev.action.device.type, group, { layout: settings.layout, stay, skipConfirm: settings.skipConfirm });
			if (!opened) {
				streamDeck.logger.warn(`No menu profile for device type ${ev.action.device.type}`);
				await ev.action.showAlert();
			}
			return;
		}

		await this.#press(ev.action, ev.action.id, `${settings.group}/${settings.fn}`, settings.skipConfirm);
	}

	override async onKeyUp(ev: KeyUpEvent<ScSettings>): Promise<void> {
		await app.executor.release(ev.action.id);
	}

	override async onDialRotate(ev: DialRotateEvent<ScSettings>): Promise<void> {
		const ref = ev.payload.ticks > 0 ? ev.payload.settings.rotateRight : ev.payload.settings.rotateLeft;
		const execution = this.#plan(ref);
		if (!execution) {
			await ev.action.showAlert();
			return;
		}
		if (await this.#askConfirm(ev.action, ref, execution, ev.payload.settings.skipConfirm)) {
			return;
		}
		// One step per tick, no acceleration.
		for (let i = 0; i < Math.abs(ev.payload.ticks); i++) {
			await app.executor.trigger(execution);
		}
	}

	override async onDialDown(ev: DialDownEvent<ScSettings>): Promise<void> {
		await this.#press(ev.action, `${ev.action.id}:press`, ev.payload.settings.press, ev.payload.settings.skipConfirm);
	}

	override async onDialUp(ev: DialUpEvent<ScSettings>): Promise<void> {
		await app.executor.release(`${ev.action.id}:press`);
	}

	override onPropertyInspectorDidAppear(ev: PropertyInspectorDidAppearEvent<ScSettings>): void {
		void this.#sendState(ev.action);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, ScSettings>): Promise<void> {
		const request = ev.payload as PiRequest;
		switch (request?.type) {
			case "getState":
				break;
			case "setGame":
				await app.updateSettings({ gameRoot: request.gameRoot, channel: request.channel });
				break;
			case "reloadBinds":
				await app.keybinds.reload();
				break;
			case "setCustomGroups": {
				let parsed: JsonValue;
				try {
					parsed = request.json.trim() === "" ? [] : (JSON.parse(request.json) as JsonValue);
				} catch (err) {
					await streamDeck.ui.sendToPropertyInspector({ type: "customGroupsResult", error: `Invalid JSON: ${(err as Error).message}` });
					return;
				}
				const error = app.validateCustomGroups(parsed);
				if (error) {
					await streamDeck.ui.sendToPropertyInspector({ type: "customGroupsResult", error });
					return;
				}
				await app.updateSettings({ customGroups: parsed });
				await streamDeck.ui.sendToPropertyInspector({ type: "customGroupsResult", error: null });
				break;
			}
			case "openEditor":
				await editorServer.open();
				return;
			case "installUpdate":
				try {
					await updates.install();
				} catch (err) {
					streamDeck.logger.error(`Update install failed: ${(err as Error).message}`);
					await streamDeck.ui.sendToPropertyInspector({ type: "updateResult", error: (err as Error).message });
				}
				return;
			case "openRelease":
				// Only the release page found by the update check, never a URL from the page.
				if (updates.available) {
					await streamDeck.system.openUrl(updates.available.url);
				}
				return;
			case "setCheckUpdates":
				await app.updateSettings({ checkUpdates: request.enabled === true });
				if (request.enabled) {
					await updates.check();
				}
				break;
			default:
				return;
		}
		await this.#sendState(ev.action);
	}

	#plan(ref: FunctionRef | undefined) {
		const target = app.catalog.lookup(ref);
		if (!target) {
			return undefined;
		}
		const execution = app.catalog.plan(target.fn.command);
		return execution.ok ? execution.steps : undefined;
	}

	/**
	 * Opens the confirmation page if the function asks for it. Returns true when the
	 * press is handled (confirmation shown, or refused because the device cannot show it).
	 */
	async #askConfirm(instance: ScAction, ref: FunctionRef | undefined, steps: Step[], skip: boolean | undefined): Promise<boolean> {
		const target = app.catalog.lookup(ref);
		if (skip || !target || !app.catalog.needsConfirm(target.fn)) {
			return false;
		}
		const shown = await menus.confirm(instance.device.id, instance.device.type, target.group, target.fn, steps);
		if (!shown) {
			streamDeck.logger.warn(`Cannot ask for confirmation on device type ${instance.device.type}; enable "Skip confirmation" to use ${ref} here`);
			await showAlert(instance);
		}
		return true;
	}

	async #press(instance: ScAction, token: string, ref: FunctionRef | undefined, skipConfirm?: boolean): Promise<void> {
		const steps = this.#plan(ref);
		if (!steps) {
			await showAlert(instance);
			return;
		}
		if (await this.#askConfirm(instance, ref, steps, skipConfirm)) {
			return;
		}
		try {
			await app.executor.press(token, steps);
		} catch (err) {
			streamDeck.logger.error(`Input failed: ${(err as Error).message}`);
			await showAlert(instance);
		}
	}

	#render(instance: ScAction, settings: ScSettings): void {
		if (instance.isDial()) {
			const target = app.catalog.lookup(settings.rotateRight ?? settings.rotateLeft ?? settings.press);
			void instance.setTitle(target ? target.group.label : "Deck Citizen");
			return;
		}
		if (!instance.isKey()) {
			return;
		}

		const group = app.catalog.group(settings.group);
		let image: string;
		if (!group) {
			image = renderKey({ caption: "Deck Citizen", label: "Set up", icon: "setup", color: "#64748b", footer: "Open settings" });
		} else if (settings.fn === MENU) {
			image = renderKey({ caption: "Menu", label: group.label, icon: group.icon ?? "menu", color: group.color });
		} else {
			const fn = group.functions.find((f) => f.id === settings.fn);
			image = fn
				? functionImage(group, fn, app.catalog.status(fn))
				: renderKey({ caption: group.label, label: "Pick a function", icon: group.icon, color: group.color });
		}
		void instance.setImage(image);
	}

	/**
	 * Sends the property inspector everything it needs to draw its dropdowns,
	 * including each function's bind status.
	 */
	async #sendState(instance: ScAction): Promise<void> {
		const catalog = app.catalog;
		const user = app.keybinds.resolver.layers.find((layer) => layer.name === "user-actionmaps");

		await streamDeck.ui.sendToPropertyInspector({
			type: "state",
			controller: instance.isDial() ? "Encoder" : "Keypad",
			device: { columns: instance.device.size.columns, rows: instance.device.size.rows, type: instance.device.type },
			menuSupported: menus.canOpen(instance.device.type),
			groups: catalog.groups.map((group) => ({
				id: group.id,
				label: group.label,
				custom: group.custom,
				stayInMenu: group.stayInMenu,
				layouts: group.layouts,
				functions: group.functions.map((fn) => {
					const status = catalog.status(fn);
					return {
						id: fn.id,
						label: fn.label,
						confirm: catalog.needsConfirm(fn),
						state: status.state,
						bindText: "bindText" in status ? status.bindText : null,
						message: explainStatus(status) ?? null,
					};
				}),
			})),
			game: {
				root: app.location.root,
				channel: app.location.channel,
				defaultsBuild: app.gameStatus.defaultsBuild ?? null,
				defaultsOrigin: app.gameStatus.defaultsOrigin ?? null,
				reading: app.gameStatus.reading,
				installedBuild: app.gameStatus.installedBuild ?? null,
				warning: app.gameStatus.warning ?? null,
				userBinds: user?.actions.size ?? 0,
			},
			// The stored JSON, not the parsed groups: if it is invalid the user must still see and fix it.
			customGroups: JSON.stringify(app.settings.customGroups ?? [], null, 2),
			builtinGroups: JSON.stringify(catalog.groups.filter((group) => !group.custom).map(groupToJson), null, 2),
			customGroupsError: app.customGroupsError ?? null,
			update: updates.available ?? null,
			checkUpdates: app.settings.checkUpdates !== false,
		});
	}
}
