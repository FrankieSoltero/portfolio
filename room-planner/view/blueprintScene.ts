/**
 * Blueprint (2D canvas) scene maths: furniture part boxes, painter's-order sorting
 * and the perspective projector. Pure, in plan space (x, y, z up).
 * Ported from prototype lines 463–470 (`front`), 586–599 (projection) and 621–641 (boxes, ordering).
 */
import { PARTS } from '../domain/catalog';
import { footprint, mapPart } from '../domain/geometry';
import type { Item, Kind } from '../domain/types';
import type { CameraPose, Vec3 } from './camera';

/** One axis-aligned part box in plan space, tagged with the item it belongs to. */
export interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; itemId: string; kind: Kind }

/** Tolerance for treating touching boxes as separated. */
const SEPARATION_EPSILON = 0.01;
/** Smallest camera-space depth the projector divides by, so points behind the camera stay finite. */
const MIN_DEPTH = 1;

type AxisKeys = readonly [lo: 'x0' | 'y0' | 'z0', hi: 'x1' | 'y1' | 'z1', index: 0 | 1 | 2];
const AXES: readonly AxisKeys[] = [['x0', 'x1', 0], ['y0', 'y1', 1], ['z0', 'z1', 2]];

/** Splits every item into part boxes; rug parts go to `rugs`, everything else to `boxes`. */
export function buildBoxes(items: readonly Item[]): { boxes: Box[]; rugs: Box[] } {
  const boxes: Box[] = [];
  const rugs: Box[] = [];
  for (const it of items) {
    const [fw, fd] = footprint(it);
    for (const part of PARTS[it.kind]) {
      const m = mapPart(part, it.rot);
      const b: Box = {
        x0: it.x + m[0] * fw, x1: it.x + m[1] * fw,
        y0: it.y + m[2] * fd, y1: it.y + m[3] * fd,
        z0: part[4] * it.h, z1: part[5] * it.h,
        itemId: it.id, kind: it.kind,
      };
      (it.kind === 'rug' ? rugs : boxes).push(b);
    }
  }
  return { boxes, rugs };
}

/**
 * Whether `a` is in front of `b` as seen from `cam`: 1 if a is in front, -1 if b is,
 * 0 when no separating axis decides it. Axes are tried in x, y, z order.
 */
export function frontOf(a: Box, b: Box, cam: Vec3): -1 | 0 | 1 {
  for (const [lo, hi, k] of AXES) {
    if (a[hi] <= b[lo] + SEPARATION_EPSILON) {
      if (cam[k] <= a[hi]) return 1;
      if (cam[k] >= b[lo]) return -1;
    } else if (b[hi] <= a[lo] + SEPARATION_EPSILON) {
      if (cam[k] >= a[lo]) return 1;
      if (cam[k] <= b[hi]) return -1;
    }
  }
  return 0;
}

function centreDistSq(b: Box, cam: Vec3): number {
  return ((b.x0 + b.x1) / 2 - cam[0]) ** 2 + ((b.y0 + b.y1) / 2 - cam[1]) ** 2 + ((b.z0 + b.z1) / 2 - cam[2]) ** 2;
}

/**
 * Painter's order, far to near. Each step draws the farthest box that is not in front of
 * any remaining box; if every remaining box is blocked (a cycle), the farthest one is drawn.
 * Always terminates and returns each input box exactly once.
 */
export function sortBoxes(boxes: readonly Box[], cam: Vec3): Box[] {
  const order: Box[] = [];
  const rem = boxes.slice();
  while (rem.length > 0) {
    let pick = -1;
    let best = -1;
    let far = 0;
    let farD = -1;
    rem.forEach((bi, i) => {
      const d = centreDistSq(bi, cam);
      if (d > farD) { farD = d; far = i; }
      const blocked = rem.some((bj, j) => j !== i && frontOf(bi, bj, cam) === 1);
      if (!blocked && d > best) { best = d; pick = i; }
    });
    order.push(...rem.splice(pick < 0 ? far : pick, 1));
  }
  return order;
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
