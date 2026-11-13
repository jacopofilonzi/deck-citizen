/**
 * Static key images, drawn as SVG so they stay sharp on every device.
 */

import { iconSvg } from "./icons.ts";

const SIZE = 144;
const BACKGROUND = "#11151c";
const TEXT = "#f1f5f9";
const MUTED = "#94a3b8";
const WARNING = "#f59e0b";
const ERROR = "#ef4444";

export type KeyImage = {
	/** Small caption at the top (usually the group). */
	caption?: string;
	/** Main text (usually the function). */
	label: string;
	/** Text at the bottom (usually the bind, e.g. "RAlt + Num 0"). */
	footer?: string;
	color: string;
	/** Problem shown instead of the footer. */
	warning?: { text: string; severity: "warning" | "error" };
	/** Icon name (see icons.ts). With an icon the label moves below it. */
	icon?: string;
};

const escape = (text: string): string =>
	text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/**
 * Splits text into at most `maxLines` lines of about `width` characters.
 */
export function wrap(text: string, width: number, maxLines: number): string[] {
	const lines: string[] = [];
	let current = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (current === "") {
			current = word;
		} else if (current.length + 1 + word.length <= width) {
			current += ` ${word}`;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current) {
		lines.push(current);
	}
	if (lines.length > maxLines) {
		const kept = lines.slice(0, maxLines);
		kept[maxLines - 1] = `${kept[maxLines - 1]?.slice(0, Math.max(1, width - 1))}…`;
		return kept;
	}
	return lines.map((line) => (line.length > width + 2 ? `${line.slice(0, width + 1)}…` : line));
}

function textBlock(lines: string[], centerY: number, fontSize: number, color: string, weight = 600): string {
	const lineHeight = fontSize * 1.15;
	const top = centerY - ((lines.length - 1) * lineHeight) / 2;
	return lines
		.map(
			(line, i) =>
				`<text x="${SIZE / 2}" y="${top + i * lineHeight}" font-size="${fontSize}" font-weight="${weight}" fill="${color}" text-anchor="middle" dominant-baseline="central" font-family="Segoe UI, Arial, sans-serif">${escape(line)}</text>`,
		)
		.join("");
}

export function renderKeySvg(image: KeyImage): string {
	const parts: string[] = [
		`<rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}"/>`,
		`<rect x="0" y="0" width="${SIZE}" height="10" fill="${image.color}"/>`,
	];

	if (image.caption) {
		parts.push(textBlock(wrap(image.caption.toUpperCase(), 16, 1), 26, 14, image.color, 700));
	}

	const icon = image.icon ? iconSvg(image.icon, SIZE / 2, 63, 44, image.color) : "";
	if (icon) {
		parts.push(icon);
		const lines = wrap(image.label, 13, 2);
		const fontSize = lines.length === 2 ? 15 : image.label.length > 9 ? 17 : 20;
		parts.push(textBlock(lines, lines.length === 2 ? 99 : 103, fontSize, TEXT));
	} else {
		const lines = wrap(image.label, 10, 3);
		const fontSize = lines.length >= 3 ? 22 : lines.length === 2 ? 25 : image.label.length > 8 ? 24 : 30;
		parts.push(textBlock(lines, 76, fontSize, TEXT));
	}

	if (image.warning) {
		const color = image.warning.severity === "error" ? ERROR : WARNING;
		parts.push(`<rect x="0" y="${SIZE - 28}" width="${SIZE}" height="28" fill="${color}"/>`);
		parts.push(textBlock(wrap(image.warning.text, 14, 1), SIZE - 14, 14, "#111111", 700));
	} else if (image.footer) {
		parts.push(textBlock(wrap(image.footer, 18, 1), SIZE - 14, 13, MUTED, 500));
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join("")}</svg>`;
}

export function renderKey(image: KeyImage): string {
	return `data:image/svg+xml;base64,${Buffer.from(renderKeySvg(image), "utf-8").toString("base64")}`;
}

/** Image for an empty menu slot. */
export function renderBlank(): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="#000000"/></svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}
