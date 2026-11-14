import type { Item, Kind, PlanDocument, Room, Rot, Units } from '../domain/types';

/**
 * Test fixture builders. Their arguments describe a room or a placement without naming how the
 * app stores it, so a change to the stored shape only has to change this file.
 */

/** Degrees per quarter turn of the stored `rot`. */
const QUARTER_TURN_DEG = 90;

/** A rectangular room `w` wide (x), `l` long (y) and `h` tall, in inches. */
export function rectRoom(w: number, l: number, h: number): Room {
  return { w, l, h };
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

/**
 * An item whose footprint is centred at (cx, cy) and turned by `angle`. Until Task 12 the stored
 * item only holds quarter turns, so any other angle throws.
 */
export function placedItem(spec: PlacedItemSpec): Item {
  const angle = spec.angle ?? 0;
  const rot = (((angle / QUARTER_TURN_DEG) % 4) + 4) % 4;
  if (!Number.isInteger(rot)) {
    throw new Error(`placedItem: angle ${angle} is not a multiple of 90; other angles need Task 12`);
  }
  const [fw, fd] = rot % 2 ? [spec.d, spec.w] : [spec.w, spec.d];
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
    x: spec.cx - fw / 2,
    y: spec.cy - fd / 2,
    rot: rot as Rot,
    model: { tier: 'box', label: 'Box', assetUrl: null },
  };
}

/** A plan document in the current schema; units default to feet like the seeded plan. */
export function planDoc(room: Room, items: Item[], units: Units = 'ft'): PlanDocument {
  return { schemaVersion: 1, units, room, items };
}
