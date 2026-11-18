import type { Item, Kind, Obstacle, Opening, PlanDocument, Room, Units } from '../domain/types';

/**
 * Test fixture builders. Their arguments describe a room or a placement without naming how the
 * app stores it, so a change to the stored shape only has to change this file.
 */

/** A rectangular room `w` wide (x), `l` long (y) and `h` tall, in inches; corners c1…c4 from (0, 0). */
export function rectRoom(w: number, l: number, h: number): Room {
  return {
    outline: [{ id: 'c1', x: 0, y: 0 }, { id: 'c2', x: w, y: 0 }, { id: 'c3', x: w, y: l }, { id: 'c4', x: 0, y: l }],
    height: h,
  };
}

/** What a test says about an item: its size, where its footprint is centred and how it is turned. */
export interface PlacedItemSpec {
  id?: string;
  kind?: Kind;
  name?: string;
  w: number;
  d: number;
  h: number;
  /** Footprint centre on the plan, in inches. */
  cx: number;
  cy: number;
  /** Degrees clockwise on the plan; defaults to 0. */
  angle?: number;
  price?: number | null;
}

/** An item whose footprint is centred at (cx, cy) and turned by `angle` degrees clockwise. */
export function placedItem(spec: PlacedItemSpec): Item {
  const id = spec.id ?? 'item';
  return {
    id,
    kind: spec.kind ?? 'box',
    name: spec.name ?? `Item ${id}`,
    host: 'shop.example',
    sourceUrl: null,
    price: spec.price ?? null,
    w: spec.w,
    d: spec.d,
    h: spec.h,
    x: spec.cx,
    y: spec.cy,
    angle: spec.angle ?? 0,
    model: { tier: 'box', label: 'Box', assetUrl: null },
  };
}

/**
 * A plan document in the current schema; units default to feet like the seeded plan, and the room
 * has no doors, windows or obstacles unless given.
 */
export function planDoc(
  room: Room,
  items: Item[],
  units: Units = 'ft',
  openings: Opening[] = [],
  obstacles: Obstacle[] = [],
): PlanDocument {
  return { schemaVersion: 3, units, room, items, openings, obstacles };
}

/**
 * The furnished plan the app used to start with: the 144 x 168 in room (8 ft tall, feet) with the
 * queen bed `seed-bed` and the desk `seed-desk`. The app now starts empty; tests that need furniture
 * load this. Returns a fresh object every call.
 */
export function furnishedDocument(): PlanDocument {
  return {
    schemaVersion: 3,
    units: 'ft',
    room: rectRoom(144, 168, 96),
    items: [
      {
        id: 'seed-bed', kind: 'bed', name: 'Low platform bed, queen', host: 'shop.example',
        sourceUrl: null, price: 890, w: 64, d: 85, h: 38, x: 72, y: 42.5, angle: 0,
        model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
      },
      {
        id: 'seed-desk', kind: 'desk', name: 'Tack writing desk', host: 'shop.example',
        sourceUrl: null, price: 420, w: 55, d: 26, h: 30, x: 131, y: 131.5, angle: 90,
        model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
      },
    ],
    openings: [],
    obstacles: [],
  };
}
