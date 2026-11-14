import { round2 } from './polygon';
import { normaliseAngle } from './shape';
import type { Bounds, Item } from './types';

/**
 * Pure item placement. An item's `x`, `y` are its footprint centre and `angle` is degrees clockwise
 * on the plan in [0, 360). Stored coordinates and angles are rounded to 0.01.
 */

/**
 * An angle as it is stored: wrapped into [0, 360), rounded to 0.01, then wrapped again so 359.996
 * stores as 0, not 360. Wrapping before rounding keeps a huge finite angle finite. The one rule for
 * every stored angle (edits here, and planSchema on load).
 */
export function storedAngle(deg: number): number {
  return round2(normaliseAngle(round2(normaliseAngle(deg))));
}

/** Trig results are rounded to this precision, so quarter turns give exact half-extents. */
const TRIG_PRECISION = 1e12;

/**
 * Half the width and half the length of the axis-aligned bounding box of a w × d footprint
 * turned `angleDeg` degrees: hx = (|w·cos θ| + |d·sin θ|) / 2, hy = (|w·sin θ| + |d·cos θ|) / 2.
 * Shared by moveItem and moveObstacle.
 */
export function footprintHalfExtents(w: number, d: number, angleDeg: number): { hx: number; hy: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.round(Math.cos(rad) * TRIG_PRECISION) / TRIG_PRECISION);
  const sin = Math.abs(Math.round(Math.sin(rad) * TRIG_PRECISION) / TRIG_PRECISION);
  return { hx: (w * cos + d * sin) / 2, hy: (w * sin + d * cos) / 2 };
}

/**
 * The centre coordinate nearest `v` whose bounding-box min edge (centre − half) is a multiple of
 * snap, clamped into [min, max] and stored to 0.01. Shared by moveItem and moveObstacle.
 */
export function snapCentreInto(v: number, half: number, snap: number, min: number, max: number): number {
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
  const { hx, hy } = footprintHalfExtents(item.w, item.d, item.angle);
  return {
    ...item,
    x: snapCentreInto(x, hx, snap, bounds.minX, bounds.maxX),
    y: snapCentreInto(y, hy, snap, bounds.minY, bounds.maxY),
  };
}

/**
 * Returns a copy of item with its centre moved by exactly (dx, dy), clamped into the bounds and
 * stored to 0.01. No grid snapping, so a nudge moves a piece by exactly the step at any angle.
 */
export function shiftItem(item: Item, dx: number, dy: number, bounds: Bounds): Item {
  return {
    ...item,
    x: round2(Math.min(Math.max(item.x + dx, bounds.minX), bounds.maxX)),
    y: round2(Math.min(Math.max(item.y + dy, bounds.minY), bounds.maxY)),
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
