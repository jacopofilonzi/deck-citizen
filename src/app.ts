import streamDeck from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Catalog } from "./catalog/catalog.ts";
import { Executor } from "./catalog/executor.ts";
import { BUILTIN_GROUPS, readCustomGroups } from "./catalog/groups.ts";
import type { Group } from "./catalog/types.ts";
import { InputInjector } from "./input/injector.ts";
import { GameDefaultsSource } from "./gamedata/game-defaults.ts";
import { KeybindService } from "./keybinds/keybind-service.ts";
import {
	DEFAULT_GAME_LOCATION,
	UserActionmapsSource,
	type GameLocation,
} from "./keybinds/sources.ts";

/**
 * Plugin-wide settings, stored in the Stream Deck global settings.
 */
export type GlobalSettings = {
	gameRoot?: string;
	channel?: string;
	/** User-defined groups, in the JSON format of the plugin's group data. */
	customGroups?: JsonValue;
	/** Look for new releases on GitHub (default: on). */
	checkUpdates?: boolean;
	/** Last version announced with a notification, so each one is announced once. */
	notifiedVersion?: string;
};

/** Folder of the .sdPlugin (the bundle lives in its bin/ folder). */
export const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Shared plugin state: settings, keybinds, groups and the input executor.
 * Emits `changed` whenever anything that affects how keys look or behave changes.
 */
class App extends EventEmitter<{ changed: [] }> {
	readonly keybinds = new KeybindService();
	readonly executor = new Executor(new InputInjector());
	/** Default binds and action names: read from the installed game, bundled copy as fallback. */
	readonly gameDefaults = new GameDefaultsSource({
		bundledDir: path.join(PLUGIN_DIR, "data", "defaults"),
		location: () => this.location,
		onRead: () => void this.keybinds.reload(),
		log: { info: (text) => streamDeck.logger.info(text), warn: (text) => streamDeck.logger.warn(text) },
	});

	#settings: GlobalSettings = {};
	#lastGameWarning: string | undefined;
	#customGroups: Group[] = [];
	#customGroupsError: string | undefined;
	#catalog = new Catalog(BUILTIN_GROUPS, this.keybinds.resolver);

	constructor() {
		super();
		this.keybinds.on("changed", () => this.#rebuild());
		this.keybinds.on("error", (err) => streamDeck.logger.warn(err.message));
	}

	get catalog(): Catalog {
		return this.#catalog;
	}

	get settings(): Readonly<GlobalSettings> {
		return this.#settings;
	}

	/**
	 * Where the default binds come from (the installed game, or the copy bundled with the
	 * plugin), and a warning when the bundled copy is in use for a different game build,
	 * or the game is not found.
	 */
	get gameStatus(): { installedBuild?: string; defaultsBuild?: string; defaultsOrigin?: string; reading: boolean; warning?: string } {
		const info = this.gameDefaults.info;
		let warning: string | undefined;
		if (this.keybinds.resolver.layers.length === 0 || info.reading) {
			// Binds not loaded yet, or the game files are being read right now.
		} else if (!info.installedBuild) {
			warning = `Star Citizen was not found in ${path.join(this.location.root, this.location.channel)}. Set the game folder and channel in Plugin settings; until then the default binds bundled with the plugin are used.`;
		} else if (info.origin === "bundled") {
			const why = info.error ? `the game files could not be read (${info.error})` : "the game files could not be read";
			warning =
				info.build && info.build !== info.installedBuild
					? `Default binds come from the plugin's copy for ${info.build}, because ${why}; your game is ${info.installedBuild}. Keys you bound yourself work; actions changed by the patch may show the wrong key.`
					: `Default binds come from the plugin's copy, because ${why}.`;
		}
		return { installedBuild: info.installedBuild, defaultsBuild: info.build, defaultsOrigin: info.origin, reading: info.reading, warning };
	}

	get customGroupsError(): string | undefined {
		return this.#customGroupsError;
	}

	get location(): GameLocation {
		return {
			root: this.#settings.gameRoot?.trim() || DEFAULT_GAME_LOCATION.root,
			channel: this.#settings.channel?.trim() || DEFAULT_GAME_LOCATION.channel,
		};
	}

	/**
	 * Loads the global settings and the keybind sources. The source list is where the
	 * source of truth is decided: the game's default binds (bundled copy as fallback) + the user's actionmaps.xml.
	 */
	async init(): Promise<void> {
		const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings & JsonObject>();
		const groups = Array.isArray(settings.customGroups) ? settings.customGroups.length : 0;
		streamDeck.logger.info(`Global settings: ${groups} custom group(s), game root ${settings.gameRoot ? "set" : "default"}, channel ${settings.channel || "default"}`);
		this.#applySettings(settings);
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings & JsonObject>((ev) => {
			this.#applySettings(ev.settings);
			void this.keybinds.reload();
		});

		await this.keybinds.setSources([
			this.gameDefaults,
			new UserActionmapsSource(() => this.location),
		]);
	}

	/**
	 * Updates and persists global settings. Only the plugin writes them, so there is a
	 * single owner and no race with the property inspector.
	 */
	async updateSettings(changes: Partial<GlobalSettings>): Promise<void> {
		const next = { ...this.#settings, ...changes };
		this.#applySettings(next);
		await streamDeck.settings.setGlobalSettings(next as JsonObject);
		await this.keybinds.reload();
	}

	/**
	 * Validates custom groups JSON without saving it. Returns an error message, if any.
	 */
	validateCustomGroups(raw: JsonValue): string | undefined {
		try {
			readCustomGroups(raw);
			return undefined;
		} catch (err) {
			return (err as Error).message;
		}
	}

	#applySettings(settings: GlobalSettings): void {
		this.#settings = settings ?? {};
		try {
			this.#customGroups = this.#settings.customGroups === undefined ? [] : readCustomGroups(this.#settings.customGroups);
			this.#customGroupsError = undefined;
		} catch (err) {
			this.#customGroups = [];
			this.#customGroupsError = (err as Error).message;
			streamDeck.logger.warn(`Custom groups ignored: ${this.#customGroupsError}`);
		}
		this.#rebuild();
	}

	#rebuild(): void {
		const warning = this.gameStatus.warning;
		if (warning && warning !== this.#lastGameWarning) {
			streamDeck.logger.warn(warning);
		}
		this.#lastGameWarning = warning;
		this.#catalog = new Catalog([...BUILTIN_GROUPS, ...this.#customGroups], this.keybinds.resolver);
		this.emit("changed");
	}
}

export const app = new App();
