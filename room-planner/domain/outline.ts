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
export const LIMIT_SLACK = 1e-9;

/** True when v is a finite number within [min, max]; the limits are exact up to LIMIT_SLACK. */
export function inLimits(v: number, min: number, max: number): boolean {
  return Number.isFinite(v) && v >= min - LIMIT_SLACK && v <= max + LIMIT_SLACK;
}

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

/** True when both coordinates are within ±CONFIG.coordMax, the limit a saved plan accepts (exact). */
function isInRange(p: Point): boolean {
  return Math.abs(p.x) <= CONFIG.coordMax && Math.abs(p.y) <= CONFIG.coordMax;
}

/**
 * The first problem with the outline, checked in the order: a coordinate that is not a finite
 * number (too-large), too-few, too-many, short-wall, too-large (a bounding box wider or longer than
 * CONFIG.roomMax, or a corner beyond ±CONFIG.coordMax), crossing; null when it is a valid room.
 */
export function validateOutline(outline: readonly Corner[]): OutlineProblem | null {
  if (!outline.every(isFinitePoint)) return 'too-large';
  if (outline.length < MIN_CORNERS) return 'too-few';
  if (outline.length > CONFIG.maxCorners) return 'too-many';
  if (wallsOf(outline).some((w) => w.length < CONFIG.wallMin - LIMIT_SLACK)) return 'short-wall';
  const { w, l } = boundsOf(outline);
  if (w > CONFIG.roomMax + LIMIT_SLACK || l > CONFIG.roomMax + LIMIT_SLACK) return 'too-large';
  if (!outline.every(isInRange)) return 'too-large';
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

/** A slide shorter than this (in) leaves the outline unchanged. */
const MIN_SLIDE = 0.005;

/** A slid corner that lands within this distance (in) of its neighbour merges with it. */
const SLIDE_MERGE = 0.01;

/** The unit vector along v, or (0, 0) when v has no length. */
function unit(v: Point): Point {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

/**
 * The wall's unit direction `u` (start to end) and inward normal `n = (−u.y, u.x)`. A zero-length
 * wall has no direction, so it gives u = (1, 0) and n = (0, 1).
 */
export function wallFrame(wall: Wall): { u: Point; n: Point } {
  if (wall.length === 0) return { u: { x: 1, y: 0 }, n: { x: 0, y: 1 } };
  const u = { x: (wall.b.x - wall.a.x) / wall.length, y: (wall.b.y - wall.a.y) / wall.length };
  return { u, n: { x: -u.y, y: u.x } };
}

/**
 * True when unit vectors u and v point the same way: their cross product is at most
 * CONFIG.sameDirectionSlack and their dot product is positive.
 */
export function sameDirection(u: Point, v: Point): boolean {
  return Math.abs(u.x * v.y - u.y * v.x) <= CONFIG.sameDirectionSlack && u.x * v.x + u.y * v.y > 0;
}

/** The wall `wallId` with the corners before its start (P) and after its end (N); null when unknown. */
function slideContext(outline: readonly Corner[], wallId: string) {
  const wall = wallsOf(outline).find((w) => w.id === wallId);
  if (wall === undefined) return null;
  const count = outline.length;
  const P = outline[(wall.index - 1 + count) % count];
  const N = outline[(wall.index + 2) % count];
  const { u, n } = wallFrame(wall);
  const p = unit({ x: wall.a.x - P.x, y: wall.a.y - P.y });
  const q = unit({ x: N.x - wall.b.x, y: N.y - wall.b.y });
  return { wall, P, N, u, n, p, q };
}

/**
 * Slides wall `wallId` by `distance` along its inward normal (negative slides outward), keeping
 * every wall's direction. At each end, a neighbour running in the same direction as the wall gets a
 * new corner (`ids.start` before the start, `ids.end` after it) so a step forms; any other
 * neighbour has the end corner moved along it, and a neighbour used up (within 0.01) is removed.
 * Every other corner keeps its id, position and order. A distance that is not a finite number is
 * refused as too-large; an unknown wall or a distance below 0.005 leaves the outline unchanged.
 */
export function slideWall(
  outline: readonly Corner[],
  wallId: string,
  distance: number,
  ids: { start: string; end: string },
): OutlineResult {
  if (!Number.isFinite(distance)) return notFinite();
  const ctx = slideContext(outline, wallId);
  if (ctx === null || Math.abs(distance) < MIN_SLIDE) return unchanged(outline);
  const { wall, P, N, u, n, p, q } = ctx;
  const A = wall.a;
  const B = wall.b;
  const d = distance;
  const removed = new Set<string>();

  let inserted: Corner | null = null;
  let movedA: Corner;
  const pn = p.x * n.x + p.y * n.y;
  if (sameDirection(p, u)) {
    inserted = { id: ids.start, x: A.x, y: A.y };
    movedA = { id: A.id, x: A.x + n.x * d, y: A.y + n.y * d };
  } else {
    const t = d / pn;
    movedA = { id: A.id, x: A.x + p.x * t, y: A.y + p.y * t };
    if (Math.hypot(movedA.x - P.x, movedA.y - P.y) <= SLIDE_MERGE) {
      movedA = { id: A.id, x: P.x, y: P.y };
      removed.add(P.id);
    }
  }

  let insertedEnd: Corner | null = null;
  let movedB: Corner = B;
  const qn = q.x * n.x + q.y * n.y;
  if (sameDirection(q, u)) {
    insertedEnd = { id: ids.end, x: B.x + n.x * d, y: B.y + n.y * d };
  } else {
    const t = d / qn;
    movedB = { id: B.id, x: B.x + q.x * t, y: B.y + q.y * t };
    if (Math.hypot(movedB.x - N.x, movedB.y - N.y) <= SLIDE_MERGE) removed.add(B.id);
  }

  const candidate: Corner[] = [];
  outline.forEach((c, k) => {
    if (k === wall.index) {
      if (inserted !== null) candidate.push(inserted);
      candidate.push(movedA);
      if (insertedEnd !== null) candidate.push(insertedEnd);
    } else if (removed.has(c.id)) {
      // Used up by the slide: the wall's end corner has merged with this neighbour.
    } else if (c.id === B.id) {
      candidate.push(movedB);
    } else {
      candidate.push(c);
    }
  });
  return settle(candidate);
}

/** v rounded to 0.0001, with −0 given as 0. */
function round4(v: number): number {
  return Math.round(v * 10000) / 10000 + 0;
}

/**
 * The slide distances at which a neighbour of wall `wallId` reaches zero length: for a start
 * neighbour not in the wall's direction −|A − P|·(p·n), for an end neighbour not in the wall's
 * direction |N − B|·(q·n). Rounded to 0.0001, without duplicates, ascending; [] for an unknown wall.
 */
export function wallSlideStops(outline: readonly Corner[], wallId: string): number[] {
  const ctx = slideContext(outline, wallId);
  if (ctx === null) return [];
  const { wall, P, N, u, n, p, q } = ctx;
  const stops: number[] = [];
  if (!sameDirection(p, u)) {
    stops.push(-Math.hypot(wall.a.x - P.x, wall.a.y - P.y) * (p.x * n.x + p.y * n.y));
  }
  if (!sameDirection(q, u)) {
    stops.push(Math.hypot(N.x - wall.b.x, N.y - wall.b.y) * (q.x * n.x + q.y * n.y));
  }
  return [...new Set(stops.map(round4))].sort((m, k) => m - k);
}

/**
 * Snaps a raw slide distance: to the stop nearest `raw` when one lies within CONFIG.cornerSnap / 2
 * of it (inclusive), otherwise to the nearest multiple of CONFIG.cornerSnap. A distance that is not
 * a finite number is returned as it is.
 */
export function snapSlideDistance(raw: number, stops: readonly number[]): number {
  if (!Number.isFinite(raw)) return raw;
  let nearest: number | null = null;
  for (const s of stops) {
    if (nearest === null || Math.abs(s - raw) < Math.abs(nearest - raw)) nearest = s;
  }
  if (nearest !== null && Math.abs(nearest - raw) <= CONFIG.cornerSnap / 2) return nearest;
  return snapToGrid(raw);
}

/** Width and length of a 4-corner outline whose walls alternate horizontal and vertical; else null. */
export function rectangleSize(outline: readonly Point[]): { w: number; l: number } | null {
  if (outline.length !== 4) return null;
  const eps = CONFIG.conflictEpsilon;
  const walls = outline.map((a, i) => ({ a, b: outline[(i + 1) % outline.length] }));
  const horizontal = walls.map(({ a, b }) => Math.abs(b.y - a.y) <= eps && Math.abs(b.x - a.x) > eps);
  const vertical = walls.map(({ a, b }) => Math.abs(b.x - a.x) <= eps && Math.abs(b.y - a.y) > eps);
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
