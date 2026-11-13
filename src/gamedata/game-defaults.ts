import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { parseDefaultProfile } from "../keybinds/default-profile.ts";
import { channelDir, compareBuilds, readGameBuild, type GameLocation } from "../keybinds/sources.ts";
import type { BindLayer, KeybindSource } from "../keybinds/types.ts";
import { decodeXml } from "../xml/decode.ts";
import { buildLabels, readIni, type Labels } from "./labels.ts";
import { findEntries, readEntry } from "./p4k.ts";

const PROFILE_ENTRY = "Data/Libs/Config/defaultProfile.xml";
const STRINGS_ENTRY = "Data/Localization/english/global.ini";
/** A real default profile has well over a thousand actions; far fewer means a bad read. */
const MIN_ACTIONS = 500;

export type DefaultsOrigin = "game" | "bundled";

export type DefaultsInfo = {
	/** Where the default binds in use come from. */
	origin?: DefaultsOrigin;
	/** Build of the default binds in use, e.g. `sc-alpha-4.10.2`. */
	build?: string;
	/** Build of the installed game, undefined if the game was not found. */
	installedBuild?: string;
	/** True while the game files are being read (the bundled copy is used meanwhile). */
	reading: boolean;
	/** Why the game files could not be read, if they could not. */
	error?: string;
};

type GameFiles = { archive: string; build?: string; key: string };

/**
 * Default binds and action names, read from the player's own game (Data.p4k) so they
 * always match the installed patch. The result is cached per game version; reading
 * takes a few seconds and happens again only after the game updates.
 *
 * Until the first read finishes, or if it fails, the copy bundled with the plugin
 * (data/defaults/<build>) is used as a fallback.
 */
export class GameDefaultsSource implements KeybindSource {
	readonly name = "game-defaults";

	readonly #bundledDir: string;
	readonly #location: () => GameLocation;
	readonly #onRead: () => void;
	readonly #log: { info(text: string): void; warn(text: string): void };
	readonly #cacheRoot: string;

	#info: DefaultsInfo = { reading: false };
	#labels: { key: string; read: () => Promise<Labels> } | undefined;
	#labelsCache: { key: string; labels: Labels } | undefined;
	#reading: Promise<void> | undefined;
	#failedKey: string | undefined;

	constructor(options: {
		bundledDir: string;
		location: () => GameLocation;
		/** Called after the game files were read, so the binds can be reloaded. */
		onRead: () => void;
		log: { info(text: string): void; warn(text: string): void };
		cacheRoot?: string;
	}) {
		this.#bundledDir = options.bundledDir;
		this.#location = options.location;
		this.#onRead = options.onRead;
		this.#log = options.log;
		this.#cacheRoot = options.cacheRoot ?? path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "deck-citizen", "game-data");
	}

	get info(): DefaultsInfo {
		return this.#info;
	}

	/** Labels matching the default binds in use. */
	async labels(): Promise<Labels> {
		const source = this.#labels;
		if (!source) {
			return { maps: {}, actions: {} };
		}
		if (this.#labelsCache?.key !== source.key) {
			this.#labelsCache = { key: source.key, labels: await source.read().catch(() => ({ maps: {}, actions: {} })) };
		}
		return this.#labelsCache.labels;
	}

	watchedFiles(): string[] {
		// Rewritten by the launcher when the game updates.
		return [path.join(channelDir(this.#location()), "build_manifest.id")];
	}

	async load(): Promise<BindLayer> {
		const game = await this.#gameFiles();
		if (game) {
			const cacheDir = path.join(this.#cacheRoot, game.key);
			const cached = await fs.readFile(path.join(cacheDir, "defaultProfile.xml")).catch(() => undefined);
			if (cached) {
				this.#info = { origin: "game", build: game.build, installedBuild: game.build, reading: false };
				this.#labels = { key: cacheDir, read: async () => JSON.parse(await fs.readFile(path.join(cacheDir, "labels.json"), "utf-8")) as Labels };
				return { ...parseDefaultProfile(decodeXml(cached), this.name, game.build), origin: "game" };
			}
			if (this.#failedKey !== game.key) {
				this.#reading ??= this.#read(game, cacheDir).finally(() => (this.#reading = undefined));
			}
		}
		return this.#loadBundled(game);
	}

	/** Reads the default profile and the English strings out of Data.p4k into the cache. */
	async #read(game: GameFiles, cacheDir: string): Promise<void> {
		const started = Date.now();
		try {
			const entries = await findEntries(game.archive, [PROFILE_ENTRY, STRINGS_ENTRY]);
			const profileEntry = entries.get(PROFILE_ENTRY);
			if (!profileEntry) {
				throw new Error(`${PROFILE_ENTRY} not found in Data.p4k`);
			}
			const profile = await readEntry(game.archive, profileEntry);
			const root = decodeXml(profile);
			const layer = parseDefaultProfile(root, this.name, game.build);
			if (layer.actions.size < MIN_ACTIONS) {
				throw new Error(`only ${layer.actions.size} actions in the default profile`);
			}
			const stringsEntry = entries.get(STRINGS_ENTRY);
			const labels = stringsEntry ? buildLabels(root, readIni(await readEntry(game.archive, stringsEntry))) : { maps: {}, actions: {} };

			// Write next to the final folder, then rename: a half-written cache is never used.
			const temp = `${cacheDir}.tmp-${process.pid}`;
			await fs.rm(temp, { recursive: true, force: true });
			await fs.mkdir(temp, { recursive: true });
			await fs.writeFile(path.join(temp, "defaultProfile.xml"), profile);
			await fs.writeFile(path.join(temp, "labels.json"), JSON.stringify(labels));
			await fs.rm(cacheDir, { recursive: true, force: true });
			await fs.rename(temp, cacheDir);
			await this.#pruneCache(path.basename(cacheDir));

			this.#log.info(`Read key bindings from the game (${game.build ?? "unknown build"}, ${layer.actions.size} actions) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
			this.#onRead();
		} catch (err) {
			this.#failedKey = game.key;
			this.#info = { ...this.#info, reading: false, error: (err as Error).message };
			this.#log.warn(`Could not read the game's key bindings, using the copy bundled with the plugin: ${(err as Error).message}`);
			this.#onRead();
		}
	}

	/** Keeps only the cache of the current game version. */
	async #pruneCache(keep: string): Promise<void> {
		for (const entry of await fs.readdir(this.#cacheRoot).catch(() => [])) {
			if (entry !== keep) {
				await fs.rm(path.join(this.#cacheRoot, entry), { recursive: true, force: true }).catch(() => undefined);
			}
		}
	}

	async #loadBundled(game: GameFiles | undefined): Promise<BindLayer> {
		const builds = (await fs.readdir(this.#bundledDir, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort(compareBuilds);
		const build = builds.find((b) => b === game?.build) ?? builds.at(-1);
		if (build === undefined) {
			throw new Error(`No bundled default binds in ${this.#bundledDir}`);
		}
		const dir = path.join(this.#bundledDir, build);
		const data = await fs.readFile(path.join(dir, "defaultProfile.xml"));
		this.#info = {
			origin: "bundled",
			build,
			installedBuild: game?.build,
			reading: this.#reading !== undefined,
			error: this.#failedKey !== undefined && this.#failedKey === game?.key ? this.#info.error : undefined,
		};
		this.#labels = { key: dir, read: async () => JSON.parse(await fs.readFile(path.join(dir, "labels.json"), "utf-8")) as Labels };
		return { ...parseDefaultProfile(decodeXml(data), this.name, build), origin: "bundled" };
	}

	/** The installed game's archive, and a cache key that changes whenever it is updated. */
	async #gameFiles(): Promise<GameFiles | undefined> {
		const location = this.#location();
		const archive = path.join(channelDir(location), "Data.p4k");
		const stat = await fs.stat(archive).catch(() => undefined);
		if (!stat?.isFile()) {
			return undefined;
		}
		const build = await readGameBuild(location);
		const key = `${build ?? "unknown"}-${stat.size}-${Math.round(stat.mtimeMs)}`.replace(/[^\w.-]/g, "_");
		return { archive, build, key };
	}
}
