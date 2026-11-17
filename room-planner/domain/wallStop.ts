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

/**
 * v rounded to 0.01 in the direction of target: the nearest 0.01, stepped back 0.01 when that
 * passes v going away from target. A v already on the 0.01 grid comes back unchanged (flooring
 * v * 100 would not do that, as 64.07 * 100 is just under 6407).
 */
function roundTowards(v: number, target: number): number {
  const nearest = round2(v);
  if (v >= target && nearest > v) return round2(nearest - 0.01);
  if (v < target && nearest < v) return round2(nearest + 0.01);
  return nearest;
}

/**
 * The end that fits after halving the segment from p (which fits) to q (which does not)
 * CONFIG.wallStopIterations times, keeping the end that fits each time. Not rounded.
 */
function halveTowards(inside: InsideTest, p: Point, q: Point): Point {
  let lo = p;
  let hi = q;
  for (let i = 0; i < CONFIG.wallStopIterations; i++) {
    const mid = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2 };
    if (inside(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * The furthest point from p towards q where the piece still fits, given that it fits at p:
 * q itself when it fits; otherwise the segment is halved CONFIG.wallStopIterations times
 * keeping the end that fits, and that end is rounded to 0.01 (to the nearest, then towards p),
 * falling back to p when neither rounding fits.
 */
function furthestFit(inside: InsideTest, p: Point, q: Point): Point {
  if (inside(q)) return q;
  const lo = halveTowards(inside, p, q);
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

/**
 * The 0.01 values just below and just above v, found by rounding to the nearest 0.01 and stepping
 * 0.01 from there (flooring v * 100 is not exact); both are v itself when v is on the 0.01 grid.
 */
function gridNeighbours(v: number): [number, number] {
  const nearest = round2(v);
  return [nearest > v ? round2(nearest - 0.01) : nearest, nearest < v ? round2(nearest + 0.01) : nearest];
}

/**
 * The end of a slide from p (which fits) towards the unrounded point q: the furthest fit towards q,
 * unrounded (q itself when it fits), then the one of its four 0.01-grid neighbours (x and y each
 * rounded down or up) that fits and is nearest to target; on a tie the first in the order
 * (x down, y down), (x up, y down), (x down, y up), (x up, y up). Null when none fits.
 */
function slideEnd(inside: InsideTest, p: Point, q: Point, target: Point): Point | null {
  const end = inside(q) ? q : halveTowards(inside, p, q);
  const xs = gridNeighbours(end.x);
  const ys = gridNeighbours(end.y);
  const distance = (c: Point): number => Math.hypot(c.x - target.x, c.y - target.y);
  // Nearest first (a stable sort keeps the order above on a tie), so the first that fits is the one.
  const byDistance = ys.flatMap((y) => xs.map((x) => ({ x, y }))).sort((a, b) => distance(a) - distance(b));
  return byDistance.find(inside) ?? null;
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

/** Options for stopAtWalls. */
export interface StopAtWallsOptions {
  /** Where a piece that does not fit at `from` goes, in place of `to`. */
  readonly whenOutside?: Point;
  /** Move only along the line from `from` to `to`: no candidate paths, no slide along a wall. */
  readonly straight?: boolean;
}

/**
 * Where a piece moved from `from` towards `to` ends up when it stops at the room's walls.
 * `to` is rounded to 0.01 first. A piece that does not fit at `from` (within
 * CONFIG.conflictEpsilon) goes to `options.whenOutside` when it is given, otherwise to `to`, rounded
 * to 0.01 and not stopped. A move whose target fits goes to the target. Otherwise, with
 * `options.straight`, the piece goes as far as it fits along the line from `from` to `to`; without
 * it, the piece goes as far as it fits along each candidate path (x then y, y then x, and a slide
 * along each angled wall direction) and the candidate end nearest to `to` wins, the earliest on a
 * tie. A slide's end is found unrounded and then becomes the fitting one of its four 0.01-grid
 * neighbours nearest to `to`; a slide with no fitting neighbour gives no candidate. The fit
 * tolerance is CONFIG.wallStopEpsilon, or CONFIG.conflictEpsilon when the piece starts up to that
 * much over a wall, so such a piece still slides. Both coordinates of the result are rounded to
 * 0.01 when `from` is.
 */
export function stopAtWalls(
  shapeAt: (centre: Point) => readonly Point[],
  from: Point,
  to: Point,
  outline: readonly Point[],
  options: StopAtWallsOptions = {},
): Point {
  const target = roundPoint(to);
  const insideWithin = (c: Point, eps: number): boolean => convexInsidePolygon(shapeAt(c), outline, eps);
  if (!insideWithin(from, CONFIG.conflictEpsilon)) return options.whenOutside ? roundPoint(options.whenOutside) : target;
  const eps = insideWithin(from, CONFIG.wallStopEpsilon) ? CONFIG.wallStopEpsilon : CONFIG.conflictEpsilon;
  const inside: InsideTest = (c) => insideWithin(c, eps);
  if (inside(target)) return target;
  if (options.straight) return furthestFit(inside, from, target);

  const xFirst = furthestFit(inside, from, { x: target.x, y: from.y });
  const yFirst = furthestFit(inside, from, { x: from.x, y: target.y });
  const candidates = [
    furthestFit(inside, xFirst, { x: xFirst.x, y: target.y }),
    furthestFit(inside, yFirst, { x: target.x, y: yFirst.y }),
  ];
  for (const u of angledWallDirections(outline)) {
    const k = (target.x - from.x) * u.x + (target.y - from.y) * u.y;
    if (k === 0) continue;
    const end = slideEnd(inside, from, { x: from.x + k * u.x, y: from.y + k * u.y }, target);
    if (end) candidates.push(end);
  }
  return nearestTo(candidates, target);
}
