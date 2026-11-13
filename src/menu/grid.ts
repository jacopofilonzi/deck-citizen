import type { Group, MenuLayout } from "../catalog/types.ts";

/**
 * Grid coordinates used by the plugin and in layouts: x from the left, y from the
 * bottom, so `x0y0` is the bottom-left key. Stream Deck itself counts rows from the top.
 */
export type Cell = { x: number; y: number };
export type GridSize = { columns: number; rows: number };
export type DeckCoordinates = { column: number; row: number };

export const BACK_CELL: Cell = { x: 0, y: 0 };

export const cellKey = (cell: Cell): string => `x${cell.x}y${cell.y}`;

export function parseCellKey(key: string): Cell | undefined {
	const match = /^x(\d+)y(\d+)$/.exec(key);
	return match ? { x: Number(match[1]), y: Number(match[2]) } : undefined;
}

export const sizeKey = (size: GridSize): string => `${size.columns}x${size.rows}`;

export function fromDeck(coordinates: DeckCoordinates, size: GridSize): Cell {
	return { x: coordinates.column, y: size.rows - 1 - coordinates.row };
}

export function toDeck(cell: Cell, size: GridSize): DeckCoordinates {
	return { column: cell.x, row: size.rows - 1 - cell.y };
}

const inside = (cell: Cell, size: GridSize): boolean => cell.x >= 0 && cell.y >= 0 && cell.x < size.columns && cell.y < size.rows;

/** What a menu key shows. */
export type MenuSlot = { kind: "back" } | { kind: "next"; page: number; pages: number } | { kind: "function"; fnId: string };

/** One page of a menu: cell key -> slot. Cells not listed are blank. */
export type MenuPage = Map<string, MenuSlot>;

/**
 * Free cells in reading order (top row first, left to right), Back excluded.
 */
function freeCells(size: GridSize): Cell[] {
	const cells: Cell[] = [];
	for (let y = size.rows - 1; y >= 0; y--) {
		for (let x = 0; x < size.columns; x++) {
			if (x !== BACK_CELL.x || y !== BACK_CELL.y) {
				cells.push({ x, y });
			}
		}
	}
	return cells;
}

/**
 * Builds the pages of a group's menu for a device size.
 *
 * - With a layout (per-key override, or the group's layout for this size) the menu
 *   has a single page showing exactly the cells of the layout.
 * - Otherwise every function is placed in reading order; if they do not fit, the
 *   bottom-right key becomes "next page".
 */
export function buildMenuPages(group: Group, size: GridSize, override?: MenuLayout): MenuPage[] {
	const layout = override && Object.keys(override).length > 0 ? override : group.layouts[sizeKey(size)];
	const known = new Set(group.functions.map((fn) => fn.id));

	if (layout) {
		const page: MenuPage = new Map([[cellKey(BACK_CELL), { kind: "back" }]]);
		for (const [key, fnId] of Object.entries(layout)) {
			const cell = parseCellKey(key);
			if (cell && inside(cell, size) && cellKey(cell) !== cellKey(BACK_CELL) && known.has(fnId)) {
				page.set(cellKey(cell), { kind: "function", fnId });
			}
		}
		return [page];
	}

	const cells = freeCells(size);
	const functions = group.functions.map((fn) => fn.id);
	const paged = functions.length > cells.length;
	const nextCell: Cell = { x: size.columns - 1, y: 0 };
	const slots = paged ? cells.filter((cell) => cellKey(cell) !== cellKey(nextCell)) : cells;
	const capacity = Math.max(1, slots.length);
	const pageCount = Math.max(1, Math.ceil(functions.length / capacity));

	const pages: MenuPage[] = [];
	for (let p = 0; p < pageCount; p++) {
		const page: MenuPage = new Map([[cellKey(BACK_CELL), { kind: "back" }]]);
		functions.slice(p * capacity, (p + 1) * capacity).forEach((fnId, i) => {
			const cell = slots[i];
			if (cell) {
				page.set(cellKey(cell), { kind: "function", fnId });
			}
		});
		if (paged) {
			page.set(cellKey(nextCell), { kind: "next", page: p, pages: pageCount });
		}
		pages.push(page);
	}
	return pages;
}
