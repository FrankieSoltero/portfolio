import { CONFIG } from '../config';
import { storedAngle } from './geometry';
import { LIMIT_SLACK } from './outline';
import { round2 } from './polygon';
import { footprintCorners, type Footprint } from './shape';
import type { Bounds, Obstacle, Point } from './types';

/**
 * Pure operations on a room's fixed obstacles: boxes (columns, radiators, built-ins, raised units
 * with an `elevation`) and round columns (`shape: 'cylinder'`, diameter `width`, `depth` always equal
 * to `width`). `x`, `y` are the footprint centre on the plan and `rotation` is degrees clockwise.
 * Every list edit returns a new list or refuses with the first problem it would cause; inputs are
 * never mutated.
 */

export type ObstacleProblem = 'obstacle-size' | 'too-many-obstacles';

export const OBSTACLE_PROBLEM_TEXT: Readonly<Record<ObstacleProblem, string>> = {
  'obstacle-size': 'That size is not allowed.',
  'too-many-obstacles': `A room can have at most ${CONFIG.maxObstacles} obstacles.`,
};

export type ObstaclesResult = { ok: true; obstacles: Obstacle[] } | { ok: false; problem: ObstacleProblem };

type ObstaclePatch = Partial<Pick<Obstacle, 'label' | 'rotation' | 'width' | 'depth' | 'height' | 'elevation'>>;

/** The fields updateObstacle may change. */
const PATCHABLE: readonly string[] = ['label', 'rotation', 'width', 'depth', 'height', 'elevation'];

/**
 * Half-extents are rounded to this precision, so a quarter-turned box snaps exactly as moveItem's
 * trig-rounded half-extents do (footprintCorners leaves ~1e-15 of trig noise).
 */
const EXTENT_PRECISION = 1e9;

function unchanged(obstacles: readonly Obstacle[]): ObstaclesResult {
  return { ok: true, obstacles: obstacles.slice() };
}

/** Accepts the candidate list or refuses with its first problem. */
function settle(candidate: Obstacle[]): ObstaclesResult {
  const problem = validateObstacles(candidate);
  return problem === null ? { ok: true, obstacles: candidate } : { ok: false, problem };
}

/** True when v is a finite number within [min, max]; the limits are exact up to LIMIT_SLACK. */
function inLimits(v: number, min: number, max: number): boolean {
  return Number.isFinite(v) && v >= min - LIMIT_SLACK && v <= max + LIMIT_SLACK;
}

function hasAllowedSize(o: Obstacle): boolean {
  return (
    Number.isFinite(o.x) &&
    Number.isFinite(o.y) &&
    Number.isFinite(o.rotation) &&
    inLimits(o.width, CONFIG.obstacleSizeMin, CONFIG.obstacleSizeMax) &&
    inLimits(o.depth, CONFIG.obstacleSizeMin, CONFIG.obstacleSizeMax) &&
    inLimits(o.height, CONFIG.obstacleSizeMin, CONFIG.obstacleHeightMax) &&
    inLimits(o.elevation, 0, CONFIG.obstacleHeightMax) &&
    typeof o.label === 'string' &&
    o.label.length <= CONFIG.obstacleLabelMax &&
    (o.shape !== 'cylinder' || o.depth === o.width)
  );
}

/** The obstacle's footprint: centre, unturned width and depth, and clockwise rotation. */
export function obstacleFootprint(o: Obstacle): Footprint {
  return { cx: o.x, cy: o.y, w: o.width, d: o.depth, angle: o.rotation };
}

/**
 * The obstacle's outline on the plan, with positive signed area: a box's four footprint corners
 * (back-left first); a cylinder's CONFIG.cylinderSegments points on its circle of radius width / 2,
 * the first at (x + r, y), going clockwise on the plan. A cylinder's rotation does not move them.
 */
export function obstaclePolygon(o: Obstacle): Point[] {
  if (o.shape === 'box') return footprintCorners(obstacleFootprint(o));
  const r = o.width / 2;
  const n = CONFIG.cylinderSegments;
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return { x: o.x + r * Math.cos(t), y: o.y + r * Math.sin(t) };
  });
}

/**
 * Half the width and half the length of the obstacle's axis-aligned bounding box: a box's from its
 * turned footprint corners (the rule moveItem uses), a cylinder's the radius on both axes.
 */
function halfExtents(o: Obstacle): { hx: number; hy: number } {
  if (o.shape === 'cylinder') return { hx: o.width / 2, hy: o.width / 2 };
  const corners = footprintCorners(obstacleFootprint(o));
  const half = (dist: (p: Point) => number): number =>
    Math.round(Math.max(...corners.map(dist)) * EXTENT_PRECISION) / EXTENT_PRECISION;
  return { hx: half((p) => Math.abs(p.x - o.x)), hy: half((p) => Math.abs(p.y - o.y)) };
}

/**
 * The centre coordinate nearest `v` whose bounding-box min edge (centre − half) is a multiple of
 * snap, clamped into [min, max] and stored to 0.01 (the same rule as moveItem).
 */
function snapInto(v: number, half: number, min: number, max: number, snap: number): number {
  const snapped = Math.round((v - half) / snap) * snap + half;
  return round2(Math.min(Math.max(snapped, min), max));
}

/**
 * The first problem with the obstacles, checked in the order: too-many-obstacles (more than
 * CONFIG.maxObstacles), obstacle-size (a width or depth outside [obstacleSizeMin, obstacleSizeMax],
 * a height outside [obstacleSizeMin, obstacleHeightMax], an elevation outside [0,
 * obstacleHeightMax], a position, rotation or size that is not a finite number, a label longer than
 * obstacleLabelMax, or a cylinder whose depth differs from its width); null when every one is valid.
 */
export function validateObstacles(obstacles: readonly Obstacle[]): ObstacleProblem | null {
  if (obstacles.length > CONFIG.maxObstacles) return 'too-many-obstacles';
  if (!obstacles.every(hasAllowedSize)) return 'obstacle-size';
  return null;
}

/**
 * A new obstacle `newId` centred on `at` (rounded to 0.01): a 24 × 24 × 36 in box labelled 'Box', or
 * a 12 in column labelled 'Column' as tall as the room; both on the floor and unturned.
 */
export function newObstacle(shape: 'box' | 'cylinder', at: Point, roomHeight: number, newId: string): Obstacle {
  const base = { id: newId, shape, x: round2(at.x), y: round2(at.y), rotation: 0, elevation: 0 };
  return shape === 'box'
    ? { ...base, label: 'Box', width: 24, depth: 24, height: 36 }
    : { ...base, label: 'Column', width: 12, depth: 12, height: roomHeight };
}

/** The list with `obstacle` appended, or the first problem that would cause. */
export function addObstacle(obstacles: readonly Obstacle[], obstacle: Obstacle): ObstaclesResult {
  return settle([...obstacles, obstacle]);
}

/**
 * Returns a copy of the obstacle with its centre moved to (x, y), placed so the min corner of its
 * axis-aligned bounding box is on the `snap` grid, then clamped into the bounds (as moveItem does).
 */
export function moveObstacle(o: Obstacle, x: number, y: number, bounds: Bounds, snap: number): Obstacle {
  const { hx, hy } = halfExtents(o);
  return {
    ...o,
    x: snapInto(x, hx, bounds.minX, bounds.maxX, snap),
    y: snapInto(y, hy, bounds.minY, bounds.maxY, snap),
  };
}

/** Returns a copy of the obstacle moved by exactly (dx, dy), clamped into the bounds, stored to 0.01. */
export function shiftObstacle(o: Obstacle, dx: number, dy: number, bounds: Bounds): Obstacle {
  return {
    ...o,
    x: round2(Math.min(Math.max(o.x + dx, bounds.minX), bounds.maxX)),
    y: round2(Math.min(Math.max(o.y + dy, bounds.minY), bounds.maxY)),
  };
}

/**
 * Changes the given fields of obstacle `id` (numbers rounded to 0.01, the rotation stored through
 * storedAngle). On a cylinder a width also sets the depth, and a depth is otherwise ignored. Other
 * fields are ignored. An unknown id leaves the list unchanged.
 */
export function updateObstacle(obstacles: readonly Obstacle[], id: string, patch: ObstaclePatch): ObstaclesResult {
  const index = obstacles.findIndex((o) => o.id === id);
  if (index < 0) return unchanged(obstacles);
  const obstacle = obstacles[index];
  const fields: Record<string, unknown> = Object.fromEntries(
    Object.entries(patch)
      .filter(([key, value]) => value !== undefined && PATCHABLE.includes(key))
      .map(([key, value]) => [key, key === 'rotation' ? storedAngle(value as number) : typeof value === 'number' ? round2(value) : value]),
  );
  if (obstacle.shape === 'cylinder') {
    delete fields.depth;
    if (fields.width !== undefined) fields.depth = fields.width;
  }
  const next = { ...obstacle, ...fields } as Obstacle;
  return settle(obstacles.map((o, i) => (i === index ? next : o)));
}
