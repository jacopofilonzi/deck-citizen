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
	// Generic controls
	plus: [{ d: "M24 8v32M8 24h32" }],
	minus: [{ d: "M8 24h32" }],
	"chevron-left": [{ d: "M30 9 15 24l15 15" }],
	"chevron-right": [{ d: "M18 9l15 15-15 15" }],
	swap: [{ d: "M8 16h30m-6-6 6 6-6 6M40 32H10m6-6-6 6 6 6" }],
	expand: [{ d: "M24 8v32", opacity: 0.6 }, { d: "M29 24h15m-5-5 5 5-5 5M19 24H4m5-5-5 5 5 5" }],
	contract: [{ d: "M24 8v32", opacity: 0.6 }, { d: "M4 24h14m-5-5 5 5-5 5M44 24H30m5-5-5 5 5 5" }],
	"num-1": [{ d: "M7 7h34v34H7z", fill: true }, { d: "M20 17l5-4v22M19 35h11" }],
	"num-2": [{ d: "M7 7h34v34H7z", fill: true }, { d: "M18 18a6 6 0 0 1 12 0c0 6-12 9-12 17h12" }],
	"num-3": [{ d: "M7 7h34v34H7z", fill: true }, { d: "M18 13h12l-6 8a7 7 0 1 1-6 11" }],
	"num-4": [{ d: "M7 7h34v34H7z", fill: true }, { d: "M28 35V13L17 28h15" }],
	// Weapons and combat
	gimbal: [{ d: "M24 9a15 15 0 1 1 0 30a15 15 0 1 1 0-30z", fill: true }, { d: "M24 2v7M24 39v7M2 24h7M39 24h7" }, { d: "M29 15a4 4 0 1 1 0 8a4 4 0 1 1 0-8z" }],
	aim: [{ d: "M24 6 42 24 24 42 6 24z", fill: true }, { d: "M24 16v16M16 24h16" }],
	staggered: [{ d: "M6 9h16v7H6z", fill: true }, { d: "M16 21h16v7H16z", fill: true }, { d: "M26 33h16v7H26z", fill: true }],
	convergence: [{ d: "M5 10l31 14M5 38l31-14" }, { d: "M40 20a4 4 0 1 1 0 8a4 4 0 1 1 0-8z", fill: true }],
	missile: [{ d: "M24 3c5 4 6 9 6 14v17H18V17c0-5 1-10 6-14z", fill: true }, { d: "M18 24l-6 8v7l6-3M30 24l6 8v7l-6-3" }, { d: "M21 39v5M27 39v5", opacity: 0.6 }],
	decoy: [{ d: "M24 27a7 7 0 1 1 0 14a7 7 0 1 1 0-14z", fill: true }, { d: "M24 21V5M17 24 7 13M31 24l10-11" }],
	noise: [{ d: "M4 24c4-9 8-9 12 0s8 9 12 0 8-9 12 0" }, { d: "M4 12c4-6 8-6 12 0s8 6 12 0 8-6 12 0M4 36c4-6 8-6 12 0s8 6 12 0 8-6 12 0", opacity: 0.5 }],
	target: [{ d: "M6 16V6h10M32 6h10v10M42 32v10H32M16 42H6V32" }, { d: "M24 16a8 8 0 1 1 0 16a8 8 0 1 1 0-16z", fill: true }],
	subtarget: [{ d: "M6 16V6h10M32 6h10v10M42 32v10H32M16 42H6V32", opacity: 0.6 }, { d: "M16 16h16v16H16z", fill: true }, { d: "M24 21v6" }],
	"auto-target": [{ d: "M6 16V6h10M32 6h10v10M42 32v10H32M16 42H6V32" }, { d: "M16 34l8-20 8 20M19 27h10" }],
	pin: [{ d: "M24 44S11 30 11 19a13 13 0 0 1 26 0c0 11-13 25-13 25z", fill: true }, { d: "M24 14a5 5 0 1 1 0 10a5 5 0 1 1 0-10z" }],
	hail: [{ d: "M6 8h36v24H22l-10 8v-8H6z", fill: true }, { d: "M14 17h20M14 24h12" }],
	eye: [{ d: "M3 24s8-13 21-13 21 13 21 13-8 13-21 13S3 24 3 24z", fill: true }, { d: "M24 18a6 6 0 1 1 0 12a6 6 0 1 1 0-12z" }],
	"look-behind": [{ d: "M14 14h16a10 10 0 0 1 0 20H12" }, { d: "M20 8l-6 6 6 6" }],
	camera: [{ d: "M4 14h28v21H4z", fill: true }, { d: "M32 21l12-7v21l-12-7" }],
	// Scanning
	scan: [{ d: "M24 6a18 18 0 1 1 0 36a18 18 0 1 1 0-36z", fill: true }, { d: "M24 24 37 11" }, { d: "M24 15a9 9 0 1 1 0 18", opacity: 0.6 }],
	ping: [{ d: "M24 19a5 5 0 1 1 0 10a5 5 0 1 1 0-10z", fill: true }, { d: "M24 12a12 12 0 1 1 0 24a12 12 0 1 1 0-24z" }, { d: "M24 4a20 20 0 1 1 0 40a20 20 0 1 1 0-40z", opacity: 0.5 }],
	"cone-narrow": [{ d: "M24 43 17 6h14z", fill: true }],
	"cone-wide": [{ d: "M24 43 5 8h38z", fill: true }],
	// Mining and salvage
	mining: [{ d: "M27 27l12-5 7 10-4 12H29l-6-8z", fill: true }, { d: "M4 4l19 19" }, { d: "M26 14l3-3M14 26l-3 3", opacity: 0.6 }],
	laser: [{ d: "M4 24h24" }, { d: "M36 16a8 8 0 1 1 0 16a8 8 0 1 1 0-16z", fill: true }, { d: "M8 16h14M8 32h14", opacity: 0.5 }],
	jettison: [{ d: "M10 26h28v17H10z", fill: true }, { d: "M24 4v16M17 11l7-7 7 7" }],
	salvage: [{ d: "M5 31h38v12H5z", fill: true }, { d: "M13 5l6 24M35 5l-6 24" }],
	fracture: [{ d: "M6 10h36v28H6z", fill: true }, { d: "M26 10l-6 10 8 6-6 12" }],
	disintegrate: [{ d: "M6 10h22v28H6z", fill: true }, { d: "M34 12v2M40 18v2M34 24v2M40 30v2M34 36v2" }],
	fuel: [{ d: "M24 4s14 16 14 26a14 14 0 0 1-28 0C10 20 24 4 24 4z", fill: true }],
	modes: [{ d: "M24 12a12 12 0 1 1 0 24a12 12 0 1 1 0-24z", fill: true }, { d: "M24 24l6-6" }, { d: "M24 3v4M45 24h-4M3 24h4M9 9l3 3M39 9l-3 3" }],
	// Cockpit
	map: [{ d: "M4 10l13-5 14 5 13-5v33l-13 5-14-5-13 5z", fill: true }, { d: "M17 5v33M31 10v33" }],
	mobiglas: [{ d: "M11 14h26v20H11z", fill: true }, { d: "M16 14V5h16v9M16 34v9h16v-9" }],
	visor: [{ d: "M8 24a16 16 0 0 1 32 0v8a6 6 0 0 1-6 6H14a6 6 0 0 1-6-6z", fill: true }, { d: "M14 25c4-3 8-3 12 0", opacity: 0.6 }],
	"night-vision": [{ d: "M15 17a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM33 17a9 9 0 1 1 0 18a9 9 0 1 1 0-18z", fill: true }, { d: "M8 11V6M40 11V6", opacity: 0.6 }],
	// Emergency
	eject: [{ d: "M14 26h20l3 16H11z", fill: true }, { d: "M24 20V4M17 11l7-7 7 7" }],
	"self-destruct": [{ d: "M24 4l4 10 10-4-4 10 10 4-10 4 4 10-10-4-4 10-4-10-10 4 4-10-10-4 10-4-4-10 10 4z", fill: true }],
	exit: [{ d: "M8 6h18v36H8z", fill: true }, { d: "M24 24h18m-6-6 6 6-6 6" }],
	cooler: [{ d: "M24 4v40M7 14l34 20M7 34l34-20" }, { d: "M19 8l5 4 5-4M19 40l5-4 5 4" }],
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
