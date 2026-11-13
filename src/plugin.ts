import streamDeck from "@elgato/streamdeck";

import { ScDeckAction } from "./actions/sc-action.ts";
import { MenuSlotAction } from "./actions/menu-slot.ts";
import { app } from "./app.ts";
import { editorServer } from "./editor/editor-server.ts";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new ScDeckAction());
streamDeck.actions.registerAction(new MenuSlotAction());

await streamDeck.connect();

try {
	await app.init();
	const layers = app.keybinds.resolver.layers.map((layer) => `${layer.name}${layer.build ? ` (${layer.build})` : ""}: ${layer.actions.size} actions`);
	streamDeck.logger.info(`Keybinds loaded from ${app.location.root}\\${app.location.channel} - ${layers.join(", ")}`);
} catch (err) {
	streamDeck.logger.error(`Initialization failed: ${(err as Error).message}`);
}

// Development aids:
// - `streamdeck://plugins/message/com.jacopo.scdeck/debug/profile?name=SC%20Menu` switches the
//   first connected device to a bundled profile, to test profile installs.
// - `streamdeck://plugins/message/com.jacopo.scdeck/debug/editor` opens the group editor.
streamDeck.system.onDidReceiveDeepLink((ev) => {
	if (ev.url.path === "/debug/editor") {
		void editorServer.open();
		return;
	}
	if (ev.url.path !== "/debug/profile") {
		return;
	}
	const device = [...streamDeck.devices].find((d) => d.isConnected);
	const name = ev.url.queryParameters.get("name");
	if (device) {
		streamDeck.logger.info(`Debug: switching ${device.id} to ${name ?? "previous profile"}`);
		void streamDeck.profiles.switchToProfile(device.id, name ? `profiles/${name}` : undefined);
	}
});

const shutdown =(): void => {
	void app.executor.releaseAll();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
