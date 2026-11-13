import { action, SingletonAction, type KeyDownEvent, type KeyUpEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import { menus } from "../menu/menu-controller.ts";

/**
 * A generic key of the menu profile. It has no settings: what it shows and does is
 * decided by the menu controller from its position on the device.
 */
@action({ UUID: "com.jacopo.scdeck.menu-slot" })
export class MenuSlotAction extends SingletonAction {
	override onWillAppear(ev: WillAppearEvent): void {
		if (ev.action.isKey()) {
			menus.slotAppeared(ev.action);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		menus.slotDisappeared(ev.action);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await menus.slotDown(ev.action);
	}

	override async onKeyUp(ev: KeyUpEvent): Promise<void> {
		await menus.slotUp(ev.action);
	}
}
