import { boundsOf } from './polygon';
import type { Bounds, Item, PartRect, Point, Room } from './types';

/**
 * Shape accessors the views read from: the room's outline and height, and each item's
 * footprint as a centre, unrotated size and angle. Views read the stored room and items only
 * through these. Angles are degrees, clockwise as seen on the plan (x right, y down).
 */

/** An item's footprint: centre (cx, cy), unrotated width w and depth d, and angle in degrees. */
export interface Footprint { cx: number; cy: number; w: number; d: number; angle: number }

/** The room's corners in outline order (positive signed area). */
export function roomOutline(room: Room): readonly Point[] {
  return room.outline;
}

/** The room's ceiling height in inches. */
export function roomHeight(room: Room): number {
  return room.height;
}

/** Axis-aligned bounding box of the room's outline. */
export function roomBounds(room: Room): Bounds {
  return boundsOf(roomOutline(room));
}

/** The item's footprint centre, unrotated size and clockwise angle. */
export function itemFootprint(item: Pick<Item, 'x' | 'y' | 'w' | 'd' | 'angle'>): Footprint {
  return { cx: item.x, cy: item.y, w: item.w, d: item.d, angle: item.angle };
}

/** Plan-space position of the local point (lx, ly) of a footprint; local y = −d/2 is the back edge. */
function toPlan(fp: Footprint, lx: number, ly: number): Point {
  const rad = (fp.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: fp.cx + lx * cos - ly * sin, y: fp.cy + lx * sin + ly * cos };
}

/** Corners of the local rectangle [u0,u1] × [v0,v1] (fractions of w and d), back-left first, clockwise. */
function rectCorners(fp: Footprint, u0: number, u1: number, v0: number, v1: number): [Point, Point, Point, Point] {
  const x0 = (u0 - 0.5) * fp.w;
  const x1 = (u1 - 0.5) * fp.w;
  const y0 = (v0 - 0.5) * fp.d;
  const y1 = (v1 - 0.5) * fp.d;
  return [toPlan(fp, x0, y0), toPlan(fp, x1, y0), toPlan(fp, x1, y1), toPlan(fp, x0, y1)];
}

/** The footprint's corners: back-left, back-right, front-right, front-left. */
export function footprintCorners(fp: Footprint): [Point, Point, Point, Point] {
  return rectCorners(fp, 0, 1, 0, 1);
}

/** A part's corners from its [u0,u1,v0,v1] fractions of the unrotated footprint, turned with it. */
export function partCorners(fp: Footprint, part: PartRect): [Point, Point, Point, Point] {
  const [u0, u1, v0, v1] = part;
  return rectCorners(fp, u0, u1, v0, v1);
}

/** The angle in degrees wrapped into [0, 360). */
export function normaliseAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}
