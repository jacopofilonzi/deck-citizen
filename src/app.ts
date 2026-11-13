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
import { KeybindService } from "./keybinds/keybind-service.ts";
import {
	BundledDefaultsSource,
	DEFAULT_GAME_LOCATION,
	readGameBuild,
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

	#settings: GlobalSettings = {};
	/** Build of the installed game (from build_manifest.id), undefined if not found. */
	#gameBuild: string | undefined;
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
	 * The installed game build, the build of the bundled default binds, and a warning
	 * when they do not match (or the game is not found).
	 */
	get gameStatus(): { installedBuild?: string; defaultsBuild?: string; warning?: string } {
		const defaultsBuild = this.keybinds.resolver.layers.find((layer) => layer.build)?.build;
		const installedBuild = this.#gameBuild;
		let warning: string | undefined;
		if (this.keybinds.resolver.layers.length === 0) {
			// Binds not loaded yet: nothing to compare.
		} else if (!installedBuild) {
			warning = `Star Citizen was not found in ${path.join(this.location.root, this.location.channel)}. Set the game folder and channel in Plugin settings; until then only the default binds are used.`;
		} else if (defaultsBuild && installedBuild !== defaultsBuild) {
			warning = `Your game is ${installedBuild}, but this plugin version knows the default binds of ${defaultsBuild}. Keys you bound yourself work; actions added or changed by the patch may show the wrong key or none. Update the plugin when a new version is out.`;
		}
		return { installedBuild, defaultsBuild, warning };
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
	 * source of truth is decided: today bundled defaults + the user's actionmaps.xml.
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
			new BundledDefaultsSource(path.join(PLUGIN_DIR, "data", "defaults"), async () => {
				this.#gameBuild = await readGameBuild(this.location);
				return this.#gameBuild;
			}),
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
