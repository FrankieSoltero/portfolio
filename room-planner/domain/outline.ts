import { CONFIG } from '../config';
import { boundsOf, isSimplePolygon, projectOntoSegment, round2, signedArea } from './polygon';
import type { Corner, Point } from './types';

/**
 * Pure operations on a room outline: corners in order with positive signed area (plan y down),
 * where wall i runs from corner i to corner i + 1 (wrapping) and shares the id of its starting
 * corner. Every edit returns a new outline or refuses with the first problem it would cause.
 */

export type OutlineProblem = 'crossing' | 'short-wall' | 'too-few' | 'too-many' | 'too-large';

export const OUTLINE_PROBLEM_TEXT: Readonly<Record<OutlineProblem, string>> = {
  crossing: 'Walls cannot cross.',
  'short-wall': 'That wall would be too short.',
  'too-few': 'A room needs at least 3 corners.',
  'too-many': `A room can have at most ${CONFIG.maxCorners} corners.`,
  'too-large': 'That would make the room too large.',
};

export type OutlineResult = { ok: true; outline: Corner[] } | { ok: false; problem: OutlineProblem };

export interface Wall { id: string; index: number; a: Corner; b: Corner; length: number }

export type StartingShape = 'rectangle' | 'l-shape' | 'notched';

/** Fewest corners a room can have. */
const MIN_CORNERS = 3;

/**
 * Floating-point slack for the wall and room size limits. The limits are exact (a 5.99 in wall is
 * short, a 720.01 in room is too large), so this only absorbs arithmetic noise on stored values.
 */
const LIMIT_SLACK = 1e-9;

/** Below this |cross product| two unit directions are treated as parallel. */
const PARALLEL_SLACK = 1e-9;

function unchanged(outline: readonly Corner[]): OutlineResult {
  return { ok: true, outline: outline.slice() };
}

/** Normalises the candidate outline, then accepts it or refuses with its first problem. */
function settle(candidate: readonly Corner[]): OutlineResult {
  const outline = normaliseOutline(candidate);
  const problem = validateOutline(outline);
  return problem === null ? { ok: true, outline } : { ok: false, problem };
}

function isFinitePoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

/** A non-finite coordinate or length is refused as too-large, so no NaN corner is ever stored. */
function notFinite(): OutlineResult {
  return { ok: false, problem: 'too-large' };
}

function snapToGrid(v: number): number {
  return Math.round(v / CONFIG.cornerSnap) * CONFIG.cornerSnap;
}

/** The walls in order; wall i runs from corner i to corner i + 1, wrapping to the first. */
export function wallsOf(outline: readonly Corner[]): Wall[] {
  const n = outline.length;
  return outline.map((a, index) => {
    const b = outline[(index + 1) % n];
    return { id: a.id, index, a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
  });
}

/**
 * The first problem with the outline, checked in the order: a coordinate that is not a finite
 * number (too-large), too-few, too-many, short-wall, too-large, crossing; null when it is a valid room.
 */
export function validateOutline(outline: readonly Corner[]): OutlineProblem | null {
  if (!outline.every(isFinitePoint)) return 'too-large';
  if (outline.length < MIN_CORNERS) return 'too-few';
  if (outline.length > CONFIG.maxCorners) return 'too-many';
  if (wallsOf(outline).some((w) => w.length < CONFIG.wallMin - LIMIT_SLACK)) return 'short-wall';
  const { w, l } = boundsOf(outline);
  if (w > CONFIG.roomMax + LIMIT_SLACK || l > CONFIG.roomMax + LIMIT_SLACK) return 'too-large';
  if (!isSimplePolygon(outline, CONFIG.conflictEpsilon)) return 'crossing';
  return null;
}

/** Rounds every coordinate to 0.01 and reverses the order when the signed area is negative. */
export function normaliseOutline(outline: readonly Corner[]): Corner[] {
  const rounded = outline.map(({ id, x, y }) => ({ id, x: round2(x), y: round2(y) }));
  return signedArea(rounded) < 0 ? rounded.reverse() : rounded;
}

/** A line through `through` at a multiple of the snap angle, as a unit direction. */
interface SnapLine { through: Point; dir: Point; distance: number }

/** The snap line through `through` nearest to p (each line covers both θ and θ + 180°). */
function nearestSnapLine(through: Point, p: Point): SnapLine {
  let best: SnapLine | null = null;
  for (let k = 0; k * CONFIG.angleSnapDeg < 180; k++) {
    const rad = (k * CONFIG.angleSnapDeg * Math.PI) / 180;
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    const distance = Math.abs(dir.x * (p.y - through.y) - dir.y * (p.x - through.x));
    if (best === null || distance < best.distance) best = { through, dir, distance };
  }
  // The loop runs at least once (k = 0), so best is set.
  return best as SnapLine;
}

function projectOntoLine(p: Point, line: SnapLine): Point {
  const s = (p.x - line.through.x) * line.dir.x + (p.y - line.through.y) * line.dir.y;
  return { x: line.through.x + s * line.dir.x, y: line.through.y + s * line.dir.y };
}

function intersect(m: SnapLine, n: SnapLine): Point | null {
  const denom = m.dir.x * n.dir.y - m.dir.y * n.dir.x;
  if (Math.abs(denom) < PARALLEL_SLACK) return null;
  const dx = n.through.x - m.through.x;
  const dy = n.through.y - m.through.y;
  const s = (dx * n.dir.y - dy * n.dir.x) / denom;
  return { x: m.through.x + s * m.dir.x, y: m.through.y + s * m.dir.y };
}

/**
 * Where a dragged corner should go for a pointer at `target`. With angle snapping, each wall
 * meeting the corner snaps to a multiple of CONFIG.angleSnapDeg when the target is within
 * toleranceIn of that direction's line through the neighbouring corner: both walls snap to the
 * lines' intersection (unless the lines are parallel or meet farther than toleranceIn from the
 * target, when only the nearer line is used), one wall snaps by projecting onto its line, and
 * otherwise the target snaps to the CONFIG.cornerSnap grid.
 */
export function snapCornerTarget(
  outline: readonly Corner[],
  id: string,
  target: Point,
  opts: { angleSnap: boolean; toleranceIn: number },
): Point {
  const grid = { x: snapToGrid(target.x), y: snapToGrid(target.y) };
  const i = outline.findIndex((c) => c.id === id);
  if (!opts.angleSnap || i < 0) return grid;
  const n = outline.length;
  const lines = [outline[(i - 1 + n) % n], outline[(i + 1) % n]]
    .map((neighbour) => nearestSnapLine(neighbour, target))
    .filter((line) => line.distance <= opts.toleranceIn)
    .sort((m, k) => m.distance - k.distance);
  if (lines.length === 0) return grid;
  if (lines.length === 2) {
    const meet = intersect(lines[0], lines[1]);
    if (meet !== null && Math.hypot(meet.x - target.x, meet.y - target.y) <= opts.toleranceIn) return meet;
  }
  return projectOntoLine(target, lines[0]);
}

/** Moves corner `id` to `to` (rounded to 0.01); an unknown id leaves the outline unchanged. */
export function moveCorner(outline: readonly Corner[], id: string, to: Point): OutlineResult {
  if (!outline.some((c) => c.id === id)) return unchanged(outline);
  return settle(outline.map((c) => (c.id === id ? { id, x: to.x, y: to.y } : c)));
}

/**
 * Splits wall `wallId` with a new corner `newId` at `at` projected onto the wall and snapped
 * along it to CONFIG.cornerSnap from the wall's start; an unknown wall leaves the outline unchanged.
 */
export function insertCorner(outline: readonly Corner[], wallId: string, at: Point, newId: string): OutlineResult {
  if (!isFinitePoint(at)) return notFinite();
  const wall = wallsOf(outline).find((w) => w.id === wallId);
  if (wall === undefined) return unchanged(outline);
  const { a, b, length } = wall;
  const { t } = projectOntoSegment(at, a, b);
  const f = length === 0 ? 0 : snapToGrid(t * length) / length;
  const corner = { id: newId, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  return settle([...outline.slice(0, wall.index + 1), corner, ...outline.slice(wall.index + 1)]);
}

/** Removes corner `id`, joining its two walls; an unknown id leaves the outline unchanged. */
export function removeCorner(outline: readonly Corner[], id: string): OutlineResult {
  if (!outline.some((c) => c.id === id)) return unchanged(outline);
  return settle(outline.filter((c) => c.id !== id));
}

/**
 * Sets wall `wallId` to `length` by moving its end corner along the wall's direction; the start
 * corner and every other corner stay. An unknown wall leaves the outline unchanged; a length that
 * is not a finite number is refused as too-large, and one below CONFIG.wallMin as short-wall.
 */
export function setWallLength(outline: readonly Corner[], wallId: string, length: number): OutlineResult {
  if (!Number.isFinite(length)) return notFinite();
  const wall = wallsOf(outline).find((w) => w.id === wallId);
  if (wall === undefined) return unchanged(outline);
  if (length < CONFIG.wallMin - LIMIT_SLACK) return { ok: false, problem: 'short-wall' };
  const { a, b } = wall;
  // A zero-length wall has no direction; validateOutline never accepts one, so nothing to keep.
  if (wall.length === 0) return { ok: false, problem: 'short-wall' };
  const k = length / wall.length;
  const end = { id: b.id, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  return settle(outline.map((c) => (c.id === b.id ? end : c)));
}

/** Width and length of a 4-corner outline whose walls alternate horizontal and vertical; else null. */
export function rectangleSize(outline: readonly Corner[]): { w: number; l: number } | null {
  if (outline.length !== 4) return null;
  const eps = CONFIG.conflictEpsilon;
  const horizontal = wallsOf(outline).map(({ a, b }) => Math.abs(b.y - a.y) <= eps && Math.abs(b.x - a.x) > eps);
  const vertical = wallsOf(outline).map(({ a, b }) => Math.abs(b.x - a.x) <= eps && Math.abs(b.y - a.y) > eps);
  const alternates =
    (horizontal[0] && vertical[1] && horizontal[2] && vertical[3]) ||
    (vertical[0] && horizontal[1] && vertical[2] && horizontal[3]);
  if (!alternates) return null;
  const { w, l } = boundsOf(outline);
  return { w: round2(w), l: round2(l) };
}

/**
 * Resizes a rectangle outline: corners at the largest x move so the width is `w`, corners at the
 * largest y move so the length is `l`; the minimum x and y stay. Sizes outside
 * [CONFIG.roomMin, CONFIG.roomMax] are refused (too-large above, short-wall below), and a size
 * that is not a finite number as too-large. Any other outline is returned unchanged.
 */
export function setRectangleSize(outline: readonly Corner[], size: { w?: number; l?: number }): OutlineResult {
  const given = [size.w, size.l].filter((v): v is number => v !== undefined);
  if (!given.every(Number.isFinite)) return notFinite();
  if (rectangleSize(outline) === null) return unchanged(outline);
  for (const v of given) {
    if (v > CONFIG.roomMax) return { ok: false, problem: 'too-large' };
    if (v < CONFIG.roomMin) return { ok: false, problem: 'short-wall' };
  }
  const { minX, minY, maxX, maxY } = boundsOf(outline);
  const eps = CONFIG.conflictEpsilon;
  return settle(
    outline.map((c) => ({
      id: c.id,
      x: size.w !== undefined && Math.abs(c.x - maxX) <= eps ? minX + size.w : c.x,
      y: size.l !== undefined && Math.abs(c.y - maxY) <= eps ? minY + size.l : c.y,
    })),
  );
}

/**
 * A starting outline of `w` × `l` from (0, 0), each corner with an id from `newId`. The L-shape
 * removes the top-right w/2 × l/2; the notch, centred on the top wall, is round(w/4) wide and
 * round(l/8) deep but never less than CONFIG.wallMin. Derived coordinates use Math.round.
 */
export function startingShape(shape: StartingShape, w: number, l: number, newId: () => string): Corner[] {
  const W = round2(w);
  const L = round2(l);
  let xy: [number, number][];
  if (shape === 'l-shape') {
    const hw = Math.round(W / 2);
    const hl = Math.round(L / 2);
    xy = [[0, 0], [hw, 0], [hw, hl], [W, hl], [W, L], [0, L]];
  } else if (shape === 'notched') {
    const width = Math.max(CONFIG.wallMin, Math.round(W / 4));
    const depth = Math.max(CONFIG.wallMin, Math.round(L / 8));
    const x0 = Math.round((W - width) / 2);
    xy = [[0, 0], [x0, 0], [x0, depth], [x0 + width, depth], [x0 + width, 0], [W, 0], [W, L], [0, L]];
  } else {
    xy = [[0, 0], [W, 0], [W, L], [0, L]];
  }
  return xy.map(([x, y]) => ({ id: newId(), x, y }));
}
