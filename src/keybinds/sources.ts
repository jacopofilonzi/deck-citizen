import fs from "node:fs/promises";
import path from "node:path";

import { decodeXml } from "../xml/decode.ts";
import { parseDefaultProfile } from "./default-profile.ts";
import type { BindLayer, KeybindSource } from "./types.ts";
import { parseUserActionmaps } from "./user-actionmaps.ts";

/**
 * Where the game is installed. `root` is the folder that contains LIVE, PTU, ...
 */
export type GameLocation = { root: string; channel: string };

export const DEFAULT_GAME_LOCATION: GameLocation = {
	root: "C:\\Program Files\\Roberts Space Industries\\StarCitizen",
	channel: "LIVE",
};

export function channelDir(location: GameLocation): string {
	return path.join(location.root, location.channel);
}

export function userProfileDir(location: GameLocation): string {
	return path.join(channelDir(location), "user", "client", "0", "Profiles", "default");
}

/**
 * Reads the installed game build (e.g. `sc-alpha-4.10.2`) from build_manifest.id.
 */
export async function readGameBuild(location: GameLocation): Promise<string | undefined> {
	try {
		const manifest = JSON.parse(await fs.readFile(path.join(channelDir(location), "build_manifest.id"), "utf-8"));
		return buildFromManifest(manifest?.Data);
	} catch {
		return undefined;
	}
}

/**
 * Build name from the manifest data. `Branch` only names the release line
 * (`sc-alpha-4.10.0`); `Version` (`4.10.200.58746`) carries the patch, in hundreds.
 */
export function buildFromManifest(data: { Branch?: unknown; Version?: unknown } | undefined): string | undefined {
	const branch = typeof data?.Branch === "string" ? data.Branch : undefined;
	const version = typeof data?.Version === "string" ? /^(\d+)\.(\d+)\.(\d+)/.exec(data.Version) : null;
	if (!version) {
		return branch;
	}
	const prefix = branch?.replace(/-?\d+(\.\d+)*$/, "") || "sc-alpha";
	return `${prefix}-${version[1]}.${version[2]}.${Math.floor(Number(version[3]) / 100)}`;
}

/**
 * Compares build folder names like `sc-alpha-4.10.2` by their numeric parts.
 */
function compareBuilds(a: string, b: string): number {
	const numbers = (value: string): number[] => (value.match(/\d+/g) ?? []).map(Number);
	const [x, y] = [numbers(a), numbers(b)];
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		const diff = (x[i] ?? 0) - (y[i] ?? 0);
		if (diff !== 0) {
			return diff;
		}
	}
	return a.localeCompare(b);
}

/**
 * Default binds copied into the plugin from a game build (data/defaults/<build>/defaultProfile.xml).
 * Picks the folder matching the installed build, or the newest one available.
 * The file may be plain XML or CryXmlB; both are accepted.
 */
export class BundledDefaultsSource implements KeybindSource {
	readonly name = "bundled-defaults";

	readonly #defaultsDir: string;
	readonly #preferredBuild?: () => Promise<string | undefined>;

	constructor(defaultsDir: string, preferredBuild?: () => Promise<string | undefined>) {
		this.#defaultsDir = defaultsDir;
		this.#preferredBuild = preferredBuild;
	}

	async load(): Promise<BindLayer> {
		const builds = (await fs.readdir(this.#defaultsDir, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort(compareBuilds);
		const preferred = await this.#preferredBuild?.();
		const build = builds.find((b) => b === preferred) ?? builds.at(-1);
		if (build === undefined) {
			throw new Error(`No bundled default binds in ${this.#defaultsDir}`);
		}
		const data = await fs.readFile(path.join(this.#defaultsDir, build, "defaultProfile.xml"));
		return parseDefaultProfile(decodeXml(data), this.name, build);
	}
}

/**
 * The user's own rebinds from actionmaps.xml. A missing file is not an error: it
 * just means the user never changed a bind.
 */
export class UserActionmapsSource implements KeybindSource {
	readonly name = "user-actionmaps";

	readonly #location: () => GameLocation;

	constructor(location: () => GameLocation) {
		this.#location = location;
	}

	get file(): string {
		return path.join(userProfileDir(this.#location()), "actionmaps.xml");
	}

	async load(): Promise<BindLayer> {
		let data: Buffer;
		try {
			data = await fs.readFile(this.file);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ENOENT") {
				return { name: this.name, actions: new Map(), activationModes: new Map() };
			}
			throw err;
		}
		return parseUserActionmaps(decodeXml(data), this.name);
	}

	watchedFiles(): string[] {
		return [this.file];
	}
}
