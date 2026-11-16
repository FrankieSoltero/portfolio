import { CONFIG } from '../config';
import { convexInsidePolygon, round2 } from './polygon';
import type { Point } from './types';

/**
 * Stopping a moved piece at the room's walls, in plan space (inches). A piece is described by
 * `shapeAt`, its convex outline when its centre is at a given point; "inside" is always
 * convexInsidePolygon of that outline against the room's outline.
 */

/** True when the piece centred on a point lies inside the room within eps. */
type InsideTest = (centre: Point) => boolean;

/** Both coordinates rounded to 0.01. */
function roundPoint(p: Point): Point {
  return { x: round2(p.x), y: round2(p.y) };
}

/** v rounded to 0.01 in the direction of target (down when v is above it, up when below). */
function roundTowards(v: number, target: number): number {
  const scaled = v * 100;
  return round2((v >= target ? Math.floor(scaled) : Math.ceil(scaled)) / 100);
}

/**
 * The furthest point from p towards q where the piece still fits, given that it fits at p:
 * q itself when it fits; otherwise the segment is halved CONFIG.wallStopIterations times
 * keeping the end that fits, and that end is rounded to 0.01 (to the nearest, then towards p),
 * falling back to p when neither rounding fits.
 */
function furthestFit(inside: InsideTest, p: Point, q: Point): Point {
  if (inside(q)) return q;
  let lo = p;
  let hi = q;
  for (let i = 0; i < CONFIG.wallStopIterations; i++) {
    const mid = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
    if (inside(mid)) lo = mid;
    else hi = mid;
  }
  const nearest = roundPoint(lo);
  if (inside(nearest)) return nearest;
  const towards = { x: roundTowards(lo.x, p.x), y: roundTowards(lo.y, p.y) };
  if (inside(towards)) return towards;
  return p;
}

/**
 * Unit directions of the outline's walls that are not parallel to an axis, one per direction
 * (a wall and its reverse share a direction; each is given with a positive x).
 */
function angledWallDirections(outline: readonly Point[]): Point[] {
  const dirs: Point[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 || dy === 0) continue;
    const sign = dx > 0 ? 1 : -1;
    const len = Math.hypot(dx, dy);
    const u = { x: (sign * dx) / len, y: (sign * dy) / len };
    if (!dirs.some((d) => d.x === u.x && d.y === u.y)) dirs.push(u);
  }
  return dirs;
}

/** The candidate nearest to target (straight-line distance); the earliest one on a tie. */
function nearestTo(candidates: readonly Point[], target: Point): Point {
  let best = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.x - target.x, c.y - target.y);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Where a piece moved from `from` towards `to` ends up when it stops at the room's walls.
 * `to` is rounded to 0.01 first. A piece that does not fit at `from` (within
 * CONFIG.conflictEpsilon) goes to `to` unchanged, as does a move whose target fits. Otherwise the
 * piece goes as far as it fits along each candidate path (x then y, y then x, and a slide along
 * each angled wall direction), and the candidate end nearest to `to` wins, the earliest on a tie.
 * The fit tolerance is CONFIG.wallStopEpsilon, or CONFIG.conflictEpsilon when the piece starts up
 * to that much over a wall, so such a piece still slides. Both coordinates of the result are
 * rounded to 0.01 when `from` is.
 */
export function stopAtWalls(
  shapeAt: (centre: Point) => readonly Point[],
  from: Point,
  to: Point,
  outline: readonly Point[],
): Point {
  const target = roundPoint(to);
  const insideWithin = (c: Point, eps: number): boolean => convexInsidePolygon(shapeAt(c), outline, eps);
  if (!insideWithin(from, CONFIG.conflictEpsilon)) return target;
  const eps = insideWithin(from, CONFIG.wallStopEpsilon) ? CONFIG.wallStopEpsilon : CONFIG.conflictEpsilon;
  const inside: InsideTest = (c) => insideWithin(c, eps);
  if (inside(target)) return target;

  const xFirst = furthestFit(inside, from, { x: target.x, y: from.y });
  const yFirst = furthestFit(inside, from, { x: from.x, y: target.y });
  const candidates = [
    furthestFit(inside, xFirst, { x: xFirst.x, y: target.y }),
    furthestFit(inside, yFirst, { x: target.x, y: yFirst.y }),
  ];
  for (const u of angledWallDirections(outline)) {
    const k = (target.x - from.x) * u.x + (target.y - from.y) * u.y;
    if (k === 0) continue;
    candidates.push(furthestFit(inside, from, roundPoint({ x: from.x + k * u.x, y: from.y + k * u.y })));
  }
  return nearestTo(candidates, target);
}
