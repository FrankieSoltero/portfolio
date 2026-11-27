/**
 * Blueprint (2D canvas) scene maths: furniture part and obstacle prisms, painter's-order
 * sorting and the perspective projector. Pure, in plan space (x right, y down, z up).
 * Geometry comes only from the shape accessors (`itemFootprint`, `planPartOutline`, `obstaclePolygon`)
 * and each item's plan parts (`planParts`).
 * Ported from prototype lines 463–470 (`front`), 586–599 (projection) and 621–641 (boxes, ordering).
 */
import { CONFIG } from '../config';
import { planParts } from '../domain/furniture/planParts';
import { obstaclePolygon } from '../domain/obstacles';
import { itemFootprint, planPartOutline } from '../domain/shape';
import type { Item, Kind, Obstacle, Point } from '../domain/types';
import type { CameraPose, Vec3 } from './camera';

/**
 * One part of an item, or one fixed obstacle, as an upright prism: a convex plan polygon of
 * 3 or more points with positive signed area, extruded from z0 to z1. A furniture part has four
 * corners (back-left, back-right, front-right, front-left), or 16 points when it is round; an
 * obstacle is flagged `obstacle`.
 */
export interface Prism { pts: readonly Point[]; z0: number; z1: number; itemId: string; kind: Kind; obstacle?: true }

/** Smallest camera-space depth the projector divides by, so points behind the camera stay finite. */
const MIN_DEPTH = 1;

/** Splits every item into one prism per plan part; rug parts go to `rugs`, everything else to `prisms`. */
export function buildPrisms(items: readonly Item[]): { prisms: Prism[]; rugs: Prism[] } {
  const prisms: Prism[] = [];
  const rugs: Prism[] = [];
  for (const it of items) {
    const fp = itemFootprint(it);
    for (const part of planParts(it)) {
      const p: Prism = {
        pts: planPartOutline(fp, part),
        z0: part.z0, z1: part.z1,
        itemId: it.id, kind: it.kind,
      };
      (it.kind === 'rug' ? rugs : prisms).push(p);
    }
  }
  return { prisms, rugs };
}

/**
 * One prism per obstacle, in order: its plan polygon (`obstaclePolygon`: four corners for a box,
 * 16 for a column) extruded from its elevation to elevation + height.
 */
export function obstaclePrisms(obstacles: readonly Obstacle[]): Prism[] {
  return obstacles.map((o) => ({
    pts: obstaclePolygon(o), z0: o.elevation, z1: o.elevation + o.height,
    itemId: o.id, kind: 'box', obstacle: true,
  }));
}

/** A candidate separating axis: a unit plan direction, or the vertical. */
type Axis = { kind: 'z' } | { kind: 'plan'; nx: number; ny: number };

/** Unit normals of the prism's edges, in edge order. */
function edgeAxes(p: Prism): Axis[] {
  const axes: Axis[] = [];
  p.pts.forEach((a, i) => {
    const b = p.pts[(i + 1) % p.pts.length] ?? a;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 0) axes.push({ kind: 'plan', nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len });
  });
  return axes;
}

/** The prism's extent along an axis, as [lo, hi]. */
function extent(p: Prism, axis: Axis): [number, number] {
  if (axis.kind === 'z') return [p.z0, p.z1];
  let lo = Infinity;
  let hi = -Infinity;
  for (const q of p.pts) {
    const d = q.x * axis.nx + q.y * axis.ny;
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
}

function along(cam: Vec3, axis: Axis): number {
  return axis.kind === 'z' ? cam[2] : cam[0] * axis.nx + cam[1] * axis.ny;
}

/**
 * Whether `a` is in front of `b` as seen from `cam`: 1 if a is in front, -1 if b is,
 * 0 when no separating axis decides it. Axes are tried in order: z, the edge normals of
 * `a`, then those of `b`. Prisms touching within `CONFIG.conflictEpsilon` count as
 * separated; when the camera lies between them on an axis, the next axis is tried.
 */
export function frontOf(a: Prism, b: Prism, cam: Vec3): -1 | 0 | 1 {
  const eps = CONFIG.conflictEpsilon;
  const axes: Axis[] = [{ kind: 'z' }, ...edgeAxes(a), ...edgeAxes(b)];
  for (const axis of axes) {
    const [aLo, aHi] = extent(a, axis);
    const [bLo, bHi] = extent(b, axis);
    const c = along(cam, axis);
    if (aHi <= bLo + eps) {
      if (c <= aHi) return 1;
      if (c >= bLo) return -1;
    } else if (bHi <= aLo + eps) {
      if (c >= aLo) return 1;
      if (c <= bHi) return -1;
    }
  }
  return 0;
}

function centreDistSq(p: Prism, cam: Vec3): number {
  const n = p.pts.length;
  const cx = p.pts.reduce((s, q) => s + q.x, 0) / n;
  const cy = p.pts.reduce((s, q) => s + q.y, 0) / n;
  return (cx - cam[0]) ** 2 + (cy - cam[1]) ** 2 + ((p.z0 + p.z1) / 2 - cam[2]) ** 2;
}

/**
 * Painter's order, far to near. Each step draws the farthest prism that is not in front of
 * any remaining prism (a pair each in front of the other is ignored); if every remaining
 * prism is blocked (a cycle), the farthest one is drawn.
 * Always terminates and returns each input prism exactly once.
 */
export function sortPrisms(prisms: readonly Prism[], cam: Vec3): Prism[] {
  const order: Prism[] = [];
  const rem = prisms.slice();
  while (rem.length > 0) {
    let pick = -1;
    let best = -1;
    let far = 0;
    let farD = -1;
    rem.forEach((pi, i) => {
      const d = centreDistSq(pi, cam);
      if (d > farD) { farD = d; far = i; }
      // A pair that are each "in front" of the other (the axis order differs by argument
      // order) cannot occlude each other, so that pair blocks neither.
      const blocked = rem.some((pj, j) => j !== i && frontOf(pi, pj, cam) === 1 && frontOf(pj, pi, cam) !== 1);
      if (!blocked && d > best) { best = d; pick = i; }
    });
    order.push(...rem.splice(pick < 0 ? far : pick, 1));
  }
  return order;
}

/** The convex hull of the points, with positive signed area and no repeated or collinear points. */
function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: readonly Point[]): Point[] => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2) {
        const a = out[out.length - 2];
        const b = out[out.length - 1];
        if (a === undefined || b === undefined || cross(a, b, p) > 0) break;
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** One prism around all of a piece's parts: the convex hull of their outlines, from the lowest bottom to the highest top. */
function boundingPrism(parts: readonly Prism[]): Prism {
  const first = parts[0];
  if (first === undefined || parts.length === 1) return first ?? { pts: [], z0: 0, z1: 0, itemId: '', kind: 'box' };
  return {
    pts: convexHull(parts.flatMap((p) => p.pts)),
    z0: Math.min(...parts.map((p) => p.z0)),
    z1: Math.max(...parts.map((p) => p.z1)),
    itemId: first.itemId, kind: first.kind, ...(first.obstacle ? { obstacle: true as const } : {}),
  };
}

/**
 * Painter's order, far to near, sorted in two levels so the cost follows the number of pieces
 * rather than the number of parts: `sortPrisms` orders one bounding prism per piece (an item's
 * parts share its id; each obstacle is a piece of its own), then each piece's own parts are
 * ordered among themselves with `sortPrisms` and drawn in its place. Pieces do not interpenetrate
 * in a valid plan, so ordering whole pieces is sound. Overlapping (conflicting) pieces may draw
 * imperfectly: a piece nested inside another's hull (a chair tucked under a desk, which is
 * flagged as a conflict) is drawn wholly before or after it. Returns each input prism exactly once.
 */
export function sortByPiece(prisms: readonly Prism[], cam: Vec3): Prism[] {
  const pieces = new Map<string, Prism[]>();
  for (const p of prisms) {
    const key = `${p.obstacle ? 'obstacle' : 'item'}:${p.itemId}`;
    const group = pieces.get(key);
    if (group) group.push(p);
    else pieces.set(key, [p]);
  }
  const partsOf = new Map<Prism, Prism[]>();
  for (const parts of pieces.values()) partsOf.set(boundingPrism(parts), parts);
  return sortPrisms([...partsOf.keys()], cam).flatMap((bound) => {
    const parts = partsOf.get(bound) ?? [];
    return parts.length > 1 ? sortPrisms(parts, cam) : parts;
  });
}

/**
 * Perspective projector from plan space to pane pixels, matching the 3D camera.
 * The camera target lands at the centre of the safe area, `[safeW / 2, paneH / 2]`.
 */
export function makeProjector(pose: CameraPose, safeW: number, paneH: number): (p: Vec3) => [number, number] {
  // The prototype projects in a mirrored world, world = (x, -y, z).
  const cw: Vec3 = [pose.position[0], -pose.position[1], pose.position[2]];
  const fx = pose.target[0] - cw[0];
  const fy = -pose.target[1] - cw[1];
  const fz = pose.target[2] - cw[2];
  const fl = Math.hypot(fx, fy, fz);
  const f: Vec3 = [fx / fl, fy / fl, fz / fl];
  const rl = Math.hypot(f[1], f[0]);
  const r: Vec3 = [f[1] / rl, -f[0] / rl, 0];
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const focal = pose.focalPx;
  return (p: Vec3): [number, number] => {
    const dx = p[0] - cw[0];
    const dy = -p[1] - cw[1];
    const dz = p[2] - cw[2];
    const zc = Math.max(MIN_DEPTH, dx * f[0] + dy * f[1] + dz * f[2]);
    const s = focal / zc;
    return [safeW / 2 + (dx * r[0] + dy * r[1]) * s, paneH / 2 - (dx * u[0] + dy * u[1] + dz * u[2]) * s];
  };
}
