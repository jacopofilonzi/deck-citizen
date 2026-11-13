import streamDeck from "@elgato/streamdeck";
import { execFile, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { app, PLUGIN_DIR } from "../app.ts";
import { isNewer, parseVersion } from "./version.ts";

/** Releases are published here by the GitHub workflow (tags vX.Y.Z). */
const REPO = "jacopofilonzi/deck-citizen";
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_PREFIX = `https://github.com/${REPO}/releases/`;
const PACKAGE_NAME = "it.jacopofilonzi.deck-citizen.streamDeckPlugin";
const PRODUCT = "Deck Citizen";

const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 24 * 60 * 60_000;

export type UpdateInfo = {
	/** e.g. "0.2.0" */
	version: string;
	current: string;
	/** Release page. */
	url: string;
	/** Direct download of the .streamDeckPlugin package. */
	packageUrl?: string;
};

/**
 * Looks for new releases on GitHub, since the plugin is not distributed through the
 * Elgato Marketplace. Announces each new version once with a Windows notification, and
 * keeps it available for the key settings, which offer to install it.
 */
class UpdateChecker extends EventEmitter<{ found: [UpdateInfo] }> {
	#latest: UpdateInfo | undefined;
	#timer: NodeJS.Timeout | undefined;

	get available(): UpdateInfo | undefined {
		return this.#latest;
	}

	/** Starts the periodic check (release builds only, unless forced). */
	start(): void {
		if (__DEV__) {
			return;
		}
		setTimeout(() => void this.check(), FIRST_CHECK_MS).unref();
		this.#timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
		this.#timer.unref();
	}

	/**
	 * Checks GitHub now. `pretendVersion` replaces the installed version (development:
	 * lets the whole flow be tried against the current release).
	 */
	async check(pretendVersion?: string): Promise<UpdateInfo | undefined> {
		if (app.settings.checkUpdates === false && !pretendVersion) {
			return undefined;
		}
		const current = pretendVersion ?? (await installedVersion());
		try {
			const response = await fetch(LATEST_URL, {
				headers: { Accept: "application/vnd.github+json", "User-Agent": "deck-citizen-plugin" },
				signal: AbortSignal.timeout(10_000),
			});
			if (!response.ok) {
				throw new Error(`GitHub answered ${response.status}`);
			}
			const release = (await response.json()) as { tag_name?: string; html_url?: string; assets?: { name?: string; browser_download_url?: string }[] };
			const version = parseVersion(release.tag_name ?? "")?.join(".");
			if (!version || !isNewer(version, current)) {
				return undefined;
			}
			const asset = release.assets?.find((a) => a.name === PACKAGE_NAME)?.browser_download_url;
			const info: UpdateInfo = {
				version,
				current: parseVersion(current)?.join(".") ?? current,
				url: release.html_url?.startsWith(RELEASES_PREFIX) ? release.html_url : `${RELEASES_PREFIX}latest`,
				packageUrl: asset?.startsWith(RELEASES_PREFIX) ? asset : undefined,
			};
			const isNew = this.#latest?.version !== info.version;
			this.#latest = info;
			if (isNew) {
				streamDeck.logger.info(`Update available: ${info.version} (installed ${info.current})`);
				this.emit("found", info);
			}
			if (pretendVersion || app.settings.notifiedVersion !== info.version) {
				notify(info);
				if (!pretendVersion) {
					await app.updateSettings({ notifiedVersion: info.version });
				}
			}
			return info;
		} catch (err) {
			streamDeck.logger.warn(`Update check failed: ${(err as Error).message}`);
			return undefined;
		}
	}

	/** Downloads the package of the available update and opens it: Stream Deck asks to install it. */
	async install(): Promise<void> {
		const info = this.#latest;
		if (!info?.packageUrl) {
			await streamDeck.system.openUrl(info?.url ?? `${RELEASES_PREFIX}latest`);
			return;
		}
		const response = await fetch(info.packageUrl, { headers: { "User-Agent": "deck-citizen-plugin" }, signal: AbortSignal.timeout(60_000) });
		if (!response.ok) {
			throw new Error(`Download failed (${response.status})`);
		}
		const data = Buffer.from(await response.arrayBuffer());
		// A .streamDeckPlugin is a zip file.
		if (data.length < 1024 || data.readUInt32LE(0) !== 0x04034b50) {
			throw new Error("The downloaded file is not a Stream Deck plugin package");
		}
		const file = path.join(os.tmpdir(), `deck-citizen-${info.version}.streamDeckPlugin`);
		await fs.writeFile(file, data);
		if (__DEV__) {
			// Installing over a linked development folder could overwrite the project files.
			streamDeck.logger.info(`Debug: update package downloaded to ${file} (not opened in a development build)`);
			return;
		}
		streamDeck.logger.info(`Opening update package ${file}`);
		spawn("cmd.exe", ["/c", "start", '""', `"${file}"`], { windowsVerbatimArguments: true, detached: true, stdio: "ignore" }).unref();
	}
}

async function installedVersion(): Promise<string> {
	const manifest = JSON.parse(await fs.readFile(path.join(PLUGIN_DIR, "manifest.json"), "utf-8")) as { Version?: string };
	return manifest.Version ?? "0.0.0";
}

const escapeXml = (text: string): string => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Windows toast notification, shown through PowerShell (no extra dependencies). Clicking
 * it opens the release page. Windows may hold it back while a game runs full screen.
 */
function notify(info: UpdateInfo): void {
	const xml =
		`<toast activationType="protocol" launch="${escapeXml(info.url)}">` +
		`<visual><binding template="ToastGeneric">` +
		`<text>${escapeXml(`${PRODUCT} ${info.version} is available`)}</text>` +
		`<text>${escapeXml(`You have ${info.current}. Click to see what's new, or install it from a key's settings in Stream Deck.`)}</text>` +
		`</binding></visual></toast>`;
	const script = [
		"[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null",
		"[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null",
		"$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
		`$xml.LoadXml('${xml.replace(/'/g, "''")}')`,
		"$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)",
		// PowerShell's own app id: toasts need a registered app to show up.
		"[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($toast)",
	].join("\n");
	execFile(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
		{ windowsHide: true, timeout: 20_000 },
		(err) => err && streamDeck.logger.warn(`Update notification failed: ${err.message}`),
	);
}

export const updates = new UpdateChecker();
