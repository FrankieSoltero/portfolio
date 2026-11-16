import { boundsOf, round2 } from './polygon';
import { footprintCorners, itemFootprint, normaliseAngle } from './shape';
import type { Bounds, Item, Point } from './types';
import { stopAtWalls } from './wallStop';

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
 * Shared by placeItem and moveObstacle.
 */
export function footprintHalfExtents(w: number, d: number, angleDeg: number): { hx: number; hy: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.round(Math.cos(rad) * TRIG_PRECISION) / TRIG_PRECISION);
  const sin = Math.abs(Math.round(Math.sin(rad) * TRIG_PRECISION) / TRIG_PRECISION);
  return { hx: (w * cos + d * sin) / 2, hy: (w * sin + d * cos) / 2 };
}

/**
 * The centre coordinate nearest `v` whose bounding-box min edge (centre − half) is a multiple of
 * snap, clamped into [min, max] and stored to 0.01. Shared by placeItem and moveObstacle.
 */
export function snapCentreInto(v: number, half: number, snap: number, min: number, max: number): number {
  const snapped = Math.round((v - half) / snap) * snap + half;
  return round2(Math.min(Math.max(snapped, min), max));
}

/**
 * Returns a copy of item with its centre placed at (x, y), so the min corner of the footprint's
 * axis-aligned bounding box is on the `snap` grid (for a quarter turn, the footprint's top-left),
 * then clamped into the bounds. Walls are not checked: only the centre is kept inside the bounds.
 * Used to place a new piece; moves go through moveItem.
 */
export function placeItem(item: Item, x: number, y: number, bounds: Bounds, snap: number): Item {
  const { hx, hy } = footprintHalfExtents(item.w, item.d, item.angle);
  return {
    ...item,
    x: snapCentreInto(x, hx, snap, bounds.minX, bounds.maxX),
    y: snapCentreInto(y, hy, snap, bounds.minY, bounds.maxY),
  };
}

/** Returns a copy of item centred on the point stopAtWalls gives for a move from its centre to `to`. */
function stopItemAtWalls(item: Item, to: Point, outline: readonly Point[]): Item {
  const shapeAt = (c: Point): readonly Point[] => footprintCorners(itemFootprint({ ...item, x: c.x, y: c.y }));
  const p = stopAtWalls(shapeAt, { x: item.x, y: item.y }, to, outline);
  return { ...item, x: p.x, y: p.y };
}

/**
 * Returns a copy of item moved towards (x, y): the place is first found as placeItem finds it,
 * within the outline's bounding box, and the piece then stops at the room's walls (stopAtWalls).
 * A piece wholly inside the room stays wholly inside, flush against a wall it would cross, even
 * where that position is off the grid. A piece that starts partly outside goes to the place
 * unchanged.
 */
export function moveItem(item: Item, x: number, y: number, outline: readonly Point[], snap: number): Item {
  const place = placeItem(item, x, y, boundsOf(outline), snap);
  return stopItemAtWalls(item, { x: place.x, y: place.y }, outline);
}

/**
 * Returns a copy of item moved by (dx, dy), with no grid snapping: the place is its centre moved by
 * exactly the step, clamped into the outline's bounding box and stored to 0.01, and the piece then
 * stops at the room's walls (stopAtWalls). A piece wholly inside the room moves the part of the
 * step that fits and stays wholly inside; one that starts partly outside goes to the place unchanged.
 */
export function shiftItem(item: Item, dx: number, dy: number, outline: readonly Point[]): Item {
  const bounds = boundsOf(outline);
  const place = {
    x: round2(Math.min(Math.max(item.x + dx, bounds.minX), bounds.maxX)),
    y: round2(Math.min(Math.max(item.y + dy, bounds.minY), bounds.maxY)),
  };
  return stopItemAtWalls(item, place, outline);
}

/** Returns a copy of item turned `deg` degrees clockwise about its centre; the position is unchanged. */
export function rotateItemBy(item: Item, deg: number): Item {
  return { ...item, angle: storedAngle(item.angle + deg) };
}

/** Returns a copy of item turned to `deg` degrees clockwise; the position is unchanged. */
export function setItemAngle(item: Item, deg: number): Item {
  return { ...item, angle: storedAngle(deg) };
}
