import { round2 } from './polygon';
import { normaliseAngle } from './shape';
import type { Bounds, Item } from './types';

/**
 * Pure item placement. An item's `x`, `y` are its footprint centre and `angle` is degrees clockwise
 * on the plan in [0, 360). Stored coordinates and angles are rounded to 0.01.
 */

/** `deg` rounded to 0.01 and wrapped into [0, 360); rounding first so 359.996 stores as 0, not 360. */
function storedAngle(deg: number): number {
  return round2(normaliseAngle(round2(deg)));
}

/** Trig results are rounded to this precision, so quarter turns give exact half-extents. */
const TRIG_PRECISION = 1e12;

/**
 * Half the width and half the length of the axis-aligned bounding box of a w × d footprint
 * turned `angle` degrees: hx = (|w·cos θ| + |d·sin θ|) / 2, hy = (|w·sin θ| + |d·cos θ|) / 2.
 */
function halfExtents(item: Pick<Item, 'w' | 'd' | 'angle'>): { hx: number; hy: number } {
  const rad = (item.angle * Math.PI) / 180;
  const cos = Math.abs(Math.round(Math.cos(rad) * TRIG_PRECISION) / TRIG_PRECISION);
  const sin = Math.abs(Math.round(Math.sin(rad) * TRIG_PRECISION) / TRIG_PRECISION);
  return { hx: (item.w * cos + item.d * sin) / 2, hy: (item.w * sin + item.d * cos) / 2 };
}

/**
 * The centre coordinate nearest `v` whose bounding-box min edge (centre − half) is a multiple of
 * snap, clamped into [min, max] and stored to 0.01.
 */
function snapInto(v: number, half: number, min: number, max: number, snap: number): number {
  const snapped = Math.round((v - half) / snap) * snap + half;
  return round2(Math.min(Math.max(snapped, min), max));
}

/**
 * Returns a copy of item with its centre moved to (x, y), placed so the min corner of the
 * footprint's axis-aligned bounding box is on the `snap` grid (for a quarter turn, the footprint's
 * top-left, so a piece can sit flush against a wall), then clamped into the bounds. Only the
 * centre is kept inside; a footprint that leaves the room is a conflict, not a clamp.
 */
export function moveItem(item: Item, x: number, y: number, bounds: Bounds, snap: number): Item {
  const { hx, hy } = halfExtents(item);
  return {
    ...item,
    x: snapInto(x, hx, bounds.minX, bounds.maxX, snap),
    y: snapInto(y, hy, bounds.minY, bounds.maxY, snap),
  };
}

/** Returns a copy of item turned `deg` degrees clockwise about its centre; the position is unchanged. */
export function rotateItemBy(item: Item, deg: number): Item {
  return { ...item, angle: storedAngle(item.angle + deg) };
}

/** Returns a copy of item turned to `deg` degrees clockwise; the position is unchanged. */
export function setItemAngle(item: Item, deg: number): Item {
  return { ...item, angle: storedAngle(deg) };
}
