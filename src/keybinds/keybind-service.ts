import { EventEmitter } from "node:events";
import fs from "node:fs";

import { KeybindResolver } from "./resolver.ts";
import type { ActionId, EffectiveBind, KeybindSource } from "./types.ts";

const WATCH_INTERVAL_MS = 2000;

/**
 * Owns the configured keybind sources, reloads them when their files change and
 * exposes the resolved binds. Swapping the source of truth means passing a
 * different list of sources; nothing else in the plugin depends on where binds come from.
 */
export class KeybindService extends EventEmitter<{ changed: []; error: [Error] }> {
	#sources: KeybindSource[] = [];
	#resolver = new KeybindResolver([]);
	#watched = new Set<string>();
	#reloading: Promise<void> | undefined;

	get resolver(): KeybindResolver {
		return this.#resolver;
	}

	resolve(id: ActionId): EffectiveBind | undefined {
		return this.#resolver.resolve(id);
	}

	/**
	 * Replaces the sources (lowest priority first) and reloads.
	 */
	async setSources(sources: KeybindSource[]): Promise<void> {
		this.#sources = sources;
		await this.reload();
	}

	/**
	 * Reloads every source. A source that fails is skipped and reported, so a broken
	 * actionmaps.xml never disables the bundled defaults.
	 */
	reload(): Promise<void> {
		this.#reloading ??= this.#reload().finally(() => (this.#reloading = undefined));
		return this.#reloading;
	}

	async #reload(): Promise<void> {
		const layers = [];
		for (const source of this.#sources) {
			try {
				layers.push(await source.load());
			} catch (err) {
				this.emit("error", new Error(`Keybind source "${source.name}" failed: ${(err as Error).message}`));
			}
		}
		this.#resolver = new KeybindResolver(layers);
		this.#watch();
		this.emit("changed");
	}

	#watch(): void {
		const files = new Set(this.#sources.flatMap((source) => source.watchedFiles?.() ?? []));
		for (const file of this.#watched) {
			if (!files.has(file)) {
				fs.unwatchFile(file);
				this.#watched.delete(file);
			}
		}
		for (const file of files) {
			if (!this.#watched.has(file)) {
				fs.watchFile(file, { interval: WATCH_INTERVAL_MS }, (curr, prev) => {
					if (curr.mtimeMs !== prev.mtimeMs) {
						void this.reload();
					}
				});
				this.#watched.add(file);
			}
		}
	}

	dispose(): void {
		for (const file of this.#watched) {
			fs.unwatchFile(file);
		}
		this.#watched.clear();
	}
}
