/**
 * Key icons, drawn on a 48x48 grid in the duotone style: a full-color outline with
 * closed shapes filled in transparency. Any icon can be used with an "-off" suffix
 * (e.g. "light-off"), which dims it and crosses it out.
 */

/** One stroke of an icon. `fill`: closed shape that gets the transparent fill. */
type IconPart = { d: string; fill?: true; opacity?: number };

const ICONS: Record<string, IconPart[]> = {
	// Doors and locks
	door: [{ d: "M12 4h24v38H12z", fill: true }, { d: "M6 42h36" }, { d: "M30 21v5" }],
	"door-open": [{ d: "M4 42h40M6 6h36" }, { d: "M6 6h8v36H6z", fill: true }, { d: "M34 6h8v36h-8z", fill: true }, { d: "M22 24h-6m3-4-3 4 3 4M26 24h6m-3-4 3 4-3 4" }],
	"door-close": [{ d: "M4 42h40" }, { d: "M10 6h14v36H10z", fill: true }, { d: "M24 6h14v36H24z", fill: true }, { d: "M14 24h5m-2-3 2 3-2 3M34 24h-5m2-3-2 3 2 3" }],
	lock: [{ d: "M11 22h26v20H11z", fill: true }, { d: "M16 22v-6a8 8 0 0 1 16 0v6" }, { d: "M24 29v6" }],
	unlock: [{ d: "M11 22h26v20H11z", fill: true }, { d: "M16 22v-6a8 8 0 0 1 15.5-2.8" }, { d: "M24 29v6" }],
	// Lights and power
	light: [{ d: "M17 30a11 11 0 1 1 14 0v4H17z", fill: true }, { d: "M19 39h10M21 44h6" }, { d: "M24 1v3M5 17H2M46 17h-3M9 5l2 2M39 5l-2 2" }],
	power: [{ d: "M24 5v18" }, { d: "M14 11a15 15 0 1 0 20 0" }],
	thrusters: [{ d: "M15 6h18l-4 16H19z", fill: true }, { d: "M19 28c0 6 5 9 5 15 0-6 5-9 5-15" }, { d: "M12 6h24" }],
	shield: [{ d: "M24 4 8 10v12c0 10 7 18 16 22 9-4 16-12 16-22V10z", fill: true }],
	weapons: [{ d: "M24 10a14 14 0 1 1 0 28a14 14 0 1 1 0-28z", fill: true }, { d: "M24 3v11M24 34v11M3 24h11M34 24h11" }],
	reset: [{ d: "M38 24a14 14 0 1 1-4.1-9.9" }, { d: "M35 5v10H25" }],
	// Directions (shield faces)
	"arrow-up": [{ d: "M24 40V8M12 20 24 8l12 12" }],
	"arrow-down": [{ d: "M24 8v32M12 28l12 12 12-12" }],
	"arrow-left": [{ d: "M40 24H8M20 12 8 24l12 12" }],
	"arrow-right": [{ d: "M8 24h32M28 12l12 12-12 12" }],
	"to-top": [{ d: "M8 6h32" }, { d: "M24 42V14M14 24l10-10 10 10" }],
	"to-bottom": [{ d: "M8 42h32" }, { d: "M24 6v28M14 24l10 10 10-10" }],
	// Landing and flight
	gear: [{ d: "M24 4v18M16 12h16" }, { d: "M24 23a10 10 0 1 1 0 20a10 10 0 1 1 0-20z", fill: true }, { d: "M24 30a3 3 0 1 1 0 6a3 3 0 1 1 0-6z" }],
	"gear-down": [{ d: "M24 3v17M18 14l6 6 6-6" }, { d: "M24 24a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0-19z", fill: true }],
	"gear-up": [{ d: "M24 20V3M18 9l6-6 6 6" }, { d: "M24 24a9.5 9.5 0 1 1 0 19a9.5 9.5 0 1 1 0-19z", fill: true }],
	autoland: [{ d: "M24 4v20m-7-7 7 7 7-7" }, { d: "M6 34h36" }, { d: "M12 41h24", opacity: 0.5 }],
	vtol: [{ d: "M14 6h20v14H14z", fill: true }, { d: "M18 26v14m-4-4 4 4 4-4M30 26v14m-4-4 4 4 4-4" }],
	ship: [{ d: "M24 4 39 42 24 33 9 42z", fill: true }],
	decoupled: [{ d: "M24 8 32 30 24 25 16 30z", fill: true }, { d: "M24 4v-1M24 36v8", opacity: 0.6 }, { d: "M36 36h8m-3-3 3 3-3 3" }],
	limiter: [{ d: "M6 36a18 18 0 0 1 36 0z", fill: true }, { d: "M24 36l9-11" }, { d: "M4 42h40" }],
	gforce: [
		{ d: "M24 5 12 10v10c0 9.5 5 16.5 12 20 7-3.5 12-10.5 12-20V10z", fill: true },
		{ d: "M28.6 17.4a6.5 6.5 0 1 0 .9 7.6V21h-5" },
		{ d: "M4 8v22m-3-3 3 3 3-3M44 8v22m-3-3 3 3 3-3" },
	],
	// Quantum and docking
	quantum: [{ d: "M24 19a5 5 0 1 1 0 10a5 5 0 1 1 0-10z", fill: true }, { d: "M14 14a14 14 0 0 0 0 20M34 14a14 14 0 0 1 0 20M8 8a22 22 0 0 0 0 32M40 8a22 22 0 0 1 0 32" }],
	"quantum-engage": [{ d: "M9 12l12 12-12 12M23 12l12 12-12 12" }, { d: "M39 20a4 4 0 1 1 0 8a4 4 0 1 1 0-8z", fill: true }],
	dock: [{ d: "M4 17h12v14H4z", fill: true }, { d: "M32 17h12v14H32z", fill: true }, { d: "M16 24h5m6 0h5M21 19v10M27 19v10" }],
	// Plugin UI
	back: [{ d: "M20 12 8 24l12 12M8 24h32" }],
	next: [{ d: "M28 12l12 12-12 12M40 24H8" }],
	menu: [{ d: "M8 8h13v13H8zM27 8h13v13H27zM8 27h13v13H8zM27 27h13v13H27z", fill: true }],
	setup: [{ d: "M24 15a9 9 0 1 1 0 18a9 9 0 1 1 0-18z", fill: true }, { d: "M24 3v7M24 38v7M3 24h7M38 24h7M9 9l5 5M34 34l5 5M39 9l-5 5M9 39l5-5" }],
};

const OFF_SUFFIX = "-off";

/** Every icon name accepted in group definitions, "-off" variants included. */
export const ICON_NAMES: readonly string[] = Object.keys(ICONS).flatMap((name) => [name, `${name}${OFF_SUFFIX}`]);

export function isIconName(name: string): boolean {
	return name in ICONS || (name.endsWith(OFF_SUFFIX) && name.slice(0, -OFF_SUFFIX.length) in ICONS);
}

/**
 * SVG for an icon centered at (`cx`, `cy`), `size` pixels wide, in `color`.
 * Returns an empty string for unknown names.
 */
export function iconSvg(name: string, cx: number, cy: number, size: number, color: string): string {
	const off = !(name in ICONS) && name.endsWith(OFF_SUFFIX);
	const parts = ICONS[off ? name.slice(0, -OFF_SUFFIX.length) : name];
	if (!parts) {
		return "";
	}
	const paths = parts
		.map((part) => {
			const opacity = part.opacity ? ` opacity="${part.opacity}"` : "";
			const fill = part.fill ? ` fill="${color}" fill-opacity=".28"` : "";
			return `<path d="${part.d}"${fill}${opacity}/>`;
		})
		.join("");
	const body = off ? `<g opacity=".45">${paths}</g><path d="M8 6l32 36"/>` : paths;
	return `<g transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${size / 48})" fill="none" stroke="${color}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
}
