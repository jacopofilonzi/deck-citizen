import streamDeck from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { app, PLUGIN_DIR } from "../app.ts";
import { Catalog } from "../catalog/catalog.ts";
import { BUILTIN_GROUPS, groupToJson, readGroup } from "../catalog/groups.ts";
import { KEYBOARD, MOUSE } from "../input/keys.ts";
import { functionImage } from "../render/function-image.ts";
import { ICON_NAMES, iconSvg } from "../render/icons.ts";
import type { Labels } from "../gamedata/labels.ts";
import { renderKey } from "../render/key-image.ts";

/** Stop when no editor page has been connected for this long. */
const NO_PAGE_GRACE_MS = 15_000;
/** Stop after this long without any request, even if a page is still open. */
const IDLE_MS = 15 * 60_000;

const STATIC_DIR = path.join(PLUGIN_DIR, "editor");
const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
};


class HttpError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

/**
 * Local web server for the custom group editor. It starts when the user opens the
 * editor and stops by itself once no editor page is open, or after a long idle time.
 * It only listens on 127.0.0.1, on a random port, and every URL carries a secret token.
 */
class EditorServer {
	#server: http.Server | undefined;
	#url: string | undefined;
	#token = "";
	#pages = new Set<http.ServerResponse>();
	#noPageTimer: NodeJS.Timeout | undefined;
	#idleTimer: NodeJS.Timeout | undefined;

	constructor() {
		app.on("changed", () => this.#broadcast("changed"));
	}

	/** Starts the server if needed and opens the editor in the default browser. */
	async open(): Promise<string> {
		const url = this.#url ?? (await this.#start());
		await streamDeck.system.openUrl(url);
		return url;
	}

	async #start(): Promise<string> {
		this.#token = randomBytes(18).toString("base64url");
		const server = http.createServer((req, res) => void this.#handle(req, res));
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", resolve);
		});
		this.#server = server;
		this.#url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/${this.#token}/`;
		streamDeck.logger.info("Group editor server started");
		this.#armNoPageTimer();
		this.#touch();
		return this.#url;
	}

	#stop(reason: string): void {
		for (const page of this.#pages) {
			page.end();
		}
		this.#pages.clear();
		clearTimeout(this.#noPageTimer);
		clearTimeout(this.#idleTimer);
		this.#server?.close();
		this.#server = undefined;
		this.#url = undefined;
		streamDeck.logger.info(`Group editor server stopped (${reason})`);
	}

	#armNoPageTimer(): void {
		clearTimeout(this.#noPageTimer);
		this.#noPageTimer = setTimeout(() => this.#pages.size === 0 && this.#stop("editor closed"), NO_PAGE_GRACE_MS);
	}

	#touch(): void {
		clearTimeout(this.#idleTimer);
		this.#idleTimer = setTimeout(() => this.#stop("idle"), IDLE_MS);
	}

	#broadcast(event: string): void {
		for (const page of this.#pages) {
			page.write(`event: ${event}\ndata: {}\n\n`);
		}
	}

	async #handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const prefix = `/${this.#token}/`;
		// Same-origin only: requests from other sites carry a foreign Origin header.
		const origin = req.headers.origin;
		if (!url.pathname.startsWith(prefix) || (origin && origin !== this.#url?.replace(/\/[^/]+\/$/, ""))) {
			res.writeHead(404).end();
			return;
		}
		this.#touch();
		const route = url.pathname.slice(prefix.length);
		try {
			if (route === "api/events") {
				this.#openEvents(res);
			} else if (route.startsWith("api/")) {
				const body = req.method === "POST" ? await readJson(req) : undefined;
				sendJson(res, 200, await this.#api(route.slice(4), body));
			} else {
				await this.#static(route || "index.html", res);
			}
		} catch (err) {
			const status = err instanceof HttpError ? err.status : 500;
			sendJson(res, status, { error: (err as Error).message });
		}
	}

	/** Server-sent events: tells the page about changes, and tells us the page is open. */
	#openEvents(res: http.ServerResponse): void {
		res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
		res.write("retry: 2000\n\n");
		this.#pages.add(res);
		clearTimeout(this.#noPageTimer);
		res.on("close", () => {
			this.#pages.delete(res);
			if (this.#pages.size === 0) {
				this.#armNoPageTimer();
			}
		});
	}

	async #static(file: string, res: http.ServerResponse): Promise<void> {
		const full = path.resolve(STATIC_DIR, file);
		const type = CONTENT_TYPES[path.extname(full)];
		if (!full.startsWith(STATIC_DIR + path.sep) || !type) {
			throw new HttpError(404, "Not found");
		}
		const data = await fs.readFile(full).catch(() => {
			throw new HttpError(404, "Not found");
		});
		res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }).end(data);
	}

	async #api(route: string, body: unknown): Promise<unknown> {
		switch (route) {
			case "state":
				return this.#state();
			case "preview":
				return preview(body);
			case "save": {
				const request = body as { groups?: JsonValue; settings?: { gameRoot?: unknown; channel?: unknown } } | undefined;
				const groups = request?.groups ?? [];
				const error = app.validateCustomGroups(groups);
				if (!error) {
					// Game settings come along only when a backup was imported.
					const game = request?.settings;
					const text = (value: unknown): string | undefined => (typeof value === "string" ? value.trim() : undefined);
					await app.updateSettings({
						customGroups: groups,
						...(game ? { gameRoot: text(game.gameRoot), channel: text(game.channel) } : {}),
					});
				}
				return { error: error ?? null };
			}
			default:
				throw new HttpError(404, `Unknown request "${route}"`);
		}
	}

	async #state(): Promise<unknown> {
		const labels = await this.#loadLabels();
		const catalog = app.catalog;
		const resolver = app.keybinds.resolver;
		const ids = new Set(resolver.layers.flatMap((layer) => [...layer.actions.keys()]));
		const actions = [...ids].sort().map((id) => {
			const [map = ""] = id.split("/");
			const status = catalog.status({ id: "x", label: "x", command: { type: "game", action: id } });
			return {
				id,
				map,
				mapLabel: labels.maps[map] ?? map,
				label: labels.actions[id]?.label,
				description: labels.actions[id]?.description,
				bind: status.state === "ready" ? status.bindText : status.state === "unsupported" ? `${status.bindText} (not a key)` : undefined,
			};
		});
		const sizes = [...streamDeck.devices].filter((d) => d.isConnected).map((d) => ({ name: d.name, columns: d.size.columns, rows: d.size.rows }));
		return {
			customGroups: app.settings.customGroups ?? [],
			settings: { gameRoot: app.settings.gameRoot ?? "", channel: app.settings.channel ?? "" },
			customGroupsError: app.customGroupsError ?? null,
			builtinGroups: BUILTIN_GROUPS.map(groupToJson),
			icons: Object.fromEntries(ICON_NAMES.map((name) => [name, iconImage(name)])),
			keys: [...Object.keys(KEYBOARD), ...Object.keys(MOUSE)],
			actions,
			sizes,
		};
	}

	#loadLabels(): Promise<Labels> {
		return app.gameDefaults.labels();
	}
}

/**
 * Draws the keys of a group being edited, with the plugin's real renderer and the
 * user's current binds. Invalid groups return the validation error instead.
 */
function preview(body: unknown): unknown {
	const raw = (body as { group?: unknown })?.group;
	try {
		const group = readGroup(raw, true);
		const others = app.catalog.groups.filter((g) => g.id !== group.id);
		const catalog = new Catalog([...others, group], app.keybinds.resolver);
		return {
			error: null,
			menu: renderKey({ caption: "Menu", label: group.label, icon: group.icon ?? "menu", color: group.color }),
			back: renderKey({ caption: group.label, label: "Back", icon: "back", color: group.color }),
			functions: Object.fromEntries(group.functions.map((fn) => [fn.id, functionImage(group, fn, catalog.status(fn))])),
		};
	} catch (err) {
		return { error: (err as Error).message };
	}
}

function iconImage(name: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">${iconSvg(name, 24, 24, 40, "#e2e8f0")}</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		size += (chunk as Buffer).length;
		if (size > 1_000_000) {
			throw new HttpError(413, "Request too large");
		}
		chunks.push(chunk as Buffer);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
	} catch {
		throw new HttpError(400, "Invalid JSON");
	}
}

function sendJson(res: http.ServerResponse, status: number, value: unknown): void {
	res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }).end(JSON.stringify(value));
}

export const editorServer = new EditorServer();
