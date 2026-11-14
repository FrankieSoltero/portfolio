import type { Bounds, Point } from './types';

/**
 * Pure 2D polygon geometry in plan space (inches; x to the right, y down the screen).
 * A polygon is its corners in order; the closing wall runs from the last corner back to the first.
 * Every `eps` is a touching tolerance: within `eps` counts as touching, which is neither
 * overlapping nor outside.
 */

/** Number of horizontal scanlines interiorPoint samples when the centroid is not usable. */
const INTERIOR_SCANLINES = 16;

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
}

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

/** Shoelace area ½·Σ(xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ); positive for the outline convention, e.g. (0,0) (W,0) (W,L) (0,L). */
export function signedArea(pts: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    sum += cross(pts[i], pts[(i + 1) % pts.length]);
  }
  return sum / 2;
}

/** Area enclosed by the polygon, whatever its winding. */
export function polygonArea(pts: readonly Point[]): number {
  return Math.abs(signedArea(pts));
}

/** Axis-aligned bounding box; all zeros for an empty list. */
export function boundsOf(pts: readonly Point[]): Bounds {
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, l: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, l: maxY - minY };
}

/** Closest point to p on segment a–b and its parameter t in [0, 1] (t = 0 for a zero-length segment). */
export function projectOntoSegment(p: Point, a: Point, b: Point): { point: Point; t: number } {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  return { point: { x: a.x + ab.x * t, y: a.y + ab.y * t }, t };
}

/** Distance from p to the nearest point of segment a–b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const { point } = projectOntoSegment(p, a, b);
  return Math.hypot(p.x - point.x, p.y - point.y);
}

/** Distance from p to the nearest wall of the polygon. */
function distanceToBoundary(p: Point, pts: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    best = Math.min(best, distanceToSegment(p, pts[i], pts[(i + 1) % pts.length]));
  }
  return best;
}

/** True when p is inside the polygon or within eps of its boundary (even-odd rule otherwise). */
export function pointInPolygon(p: Point, pts: readonly Point[], eps: number): boolean {
  if (pts.length === 0) return false;
  if (distanceToBoundary(p, pts) <= eps) return true;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Signed distance of p from the infinite line through a–b (positive on the left of a→b in maths axes). */
function sideOf(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const len = Math.hypot(ab.x, ab.y);
  return len === 0 ? 0 : cross(ab, sub(p, a)) / len;
}

/**
 * True when segments a–b and c–d cross or overlap by more than touching: a proper crossing in
 * which every endpoint is more than eps off the other segment's line, or a collinear overlap
 * longer than eps. Sharing an endpoint or a T-touch is not a crossing.
 */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point, eps: number): boolean {
  const dc = sideOf(c, a, b);
  const dd = sideOf(d, a, b);
  const da = sideOf(a, c, d);
  const db = sideOf(b, c, d);
  if (Math.abs(dc) <= eps && Math.abs(dd) <= eps) {
    // c–d lies along a–b: measure the overlap of the two along a–b's direction.
    const ab = sub(b, a);
    const len = Math.hypot(ab.x, ab.y);
    if (len === 0) return false;
    const u = { x: ab.x / len, y: ab.y / len };
    const tc = dot(sub(c, a), u);
    const td = dot(sub(d, a), u);
    const overlap = Math.min(len, Math.max(tc, td)) - Math.max(0, Math.min(tc, td));
    return overlap > eps;
  }
  const straddlesAb = (dc > eps && dd < -eps) || (dc < -eps && dd > eps);
  const straddlesCd = (da > eps && db < -eps) || (da < -eps && db > eps);
  return straddlesAb && straddlesCd;
}

/** Shortest distance between segments a–b and c–d (0 when they cross). */
function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsCross(a, b, c, d, 0)) return 0;
  return Math.min(
    distanceToSegment(a, c, d),
    distanceToSegment(b, c, d),
    distanceToSegment(c, a, b),
    distanceToSegment(d, a, b),
  );
}

/**
 * True when the outline is a simple polygon: at least 3 corners, every wall longer than eps,
 * neighbouring walls do not fold back over each other, and walls that are not neighbours stay
 * more than eps apart (no crossing and no corner touching another wall).
 */
export function isSimplePolygon(pts: readonly Point[], eps: number): boolean {
  const n = pts.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) <= eps) return false;
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const c = pts[j];
      const d = pts[(j + 1) % n];
      const neighbours = j === i + 1 || (i === 0 && j === n - 1);
      if (neighbours ? segmentsCross(a, b, c, d, eps) : segmentDistance(a, b, c, d) <= eps) return false;
    }
  }
  return true;
}

/** [min, max] of the polygon's corners projected onto axis. */
function project(pts: readonly Point[], axis: Point): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    const v = dot(p, axis);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return [min, max];
}

/** Unit normals of every non-degenerate wall of the polygon. */
function edgeNormals(pts: readonly Point[]): Point[] {
  const normals: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    const e = sub(pts[(i + 1) % pts.length], pts[i]);
    const len = Math.hypot(e.x, e.y);
    if (len > 0) normals.push({ x: -e.y / len, y: e.x / len });
  }
  return normals;
}

/**
 * Separating-axis test for two convex polygons: true only when their projections overlap by
 * more than eps on every wall normal of both, so polygons that merely touch do not overlap.
 */
export function convexOverlap(a: readonly Point[], b: readonly Point[], eps: number): boolean {
  if (a.length === 0 || b.length === 0) return false;
  for (const axis of [...edgeNormals(a), ...edgeNormals(b)]) {
    const [minA, maxA] = project(a, axis);
    const [minB, maxB] = project(b, axis);
    if (Math.min(maxA, maxB) - Math.max(minA, minB) <= eps) return false;
  }
  return true;
}

/**
 * True when part of segment p–q lies more than eps inside the convex polygon (Cyrus–Beck clip
 * against each wall moved eps inward). Works for either winding.
 */
function segmentEntersConvex(p: Point, q: Point, convex: readonly Point[], eps: number): boolean {
  const winding = signedArea(convex) < 0 ? -1 : 1;
  const pq = sub(q, p);
  let tEnter = 0;
  let tExit = 1;
  for (let i = 0; i < convex.length; i++) {
    const a = convex[i];
    const e = sub(convex[(i + 1) % convex.length], a);
    const len = Math.hypot(e.x, e.y);
    if (len === 0) continue;
    const n = { x: (-e.y / len) * winding, y: (e.x / len) * winding };
    // Inside the shrunk wall when f(t) = start + t·rate > 0.
    const start = dot(n, sub(p, a)) - eps;
    const rate = dot(n, pq);
    if (rate === 0) {
      if (start <= 0) return false;
    } else if (rate > 0) {
      tEnter = Math.max(tEnter, -start / rate);
    } else {
      tExit = Math.min(tExit, -start / rate);
    }
    if (tEnter >= tExit) return false;
  }
  return true;
}

/** Area centroid, falling back to the mean corner for a degenerate (zero-area) polygon. */
function centroid(pts: readonly Point[]): Point {
  const area = signedArea(pts);
  if (area === 0) {
    const sum = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / pts.length, y: sum.y / pts.length };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const k = cross(a, b);
    cx += (a.x + b.x) * k;
    cy += (a.y + b.y) * k;
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

/**
 * True when the convex polygon `inner` lies within the outline, touching allowed: every corner
 * of `inner` is inside (within eps), no wall of the outline passes more than eps inside `inner`,
 * and the centre of `inner` is inside the outline.
 */
export function convexInsidePolygon(inner: readonly Point[], outline: readonly Point[], eps: number): boolean {
  if (inner.length === 0 || outline.length < 3) return false;
  if (!inner.every((p) => pointInPolygon(p, outline, eps))) return false;
  for (let i = 0; i < outline.length; i++) {
    if (segmentEntersConvex(outline[i], outline[(i + 1) % outline.length], inner, eps)) return false;
  }
  return pointInPolygon(centroid(inner), outline, eps);
}

/**
 * Distance along the unit direction of dir from origin to the nearest wall the ray hits
 * (a hit at the origin counts as 0); null when it hits none or dir has zero length.
 * Walls parallel to the ray are ignored.
 */
export function rayToPolygon(origin: Point, dir: Point, pts: readonly Point[]): number | null {
  const len = Math.hypot(dir.x, dir.y);
  if (len === 0) return null;
  const u = { x: dir.x / len, y: dir.y / len };
  let best: number | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const e = sub(pts[(i + 1) % pts.length], a);
    const denom = cross(u, e);
    if (denom === 0) continue;
    const ao = sub(a, origin);
    const s = cross(ao, e) / denom;
    const t = cross(ao, u) / denom;
    if (s >= 0 && t >= 0 && t <= 1 && (best === null || s < best)) best = s;
  }
  return best;
}

/**
 * A point inside the polygon, away from its walls: the area centroid when it is inside, unless a
 * scanline sample lies farther from every wall. Samples are the midpoints of the inside spans of
 * INTERIOR_SCANLINES horizontal lines across the bounding box.
 */
export function interiorPoint(pts: readonly Point[]): Point {
  const c = centroid(pts);
  let best: Point | null = null;
  let bestDist = -Infinity;
  const consider = (p: Point): void => {
    if (!pointInPolygon(p, pts, 0)) return;
    const d = distanceToBoundary(p, pts);
    if (d > bestDist) {
      best = p;
      bestDist = d;
    }
  };
  consider(c);
  const { minY, l } = boundsOf(pts);
  for (let k = 0; k < INTERIOR_SCANLINES; k++) {
    const y = minY + ((k + 0.5) / INTERIOR_SCANLINES) * l;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      // Half-open in y so a corner on the scanline is counted once.
      if (a.y <= y !== b.y <= y) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) consider({ x: (xs[i] + xs[i + 1]) / 2, y });
  }
  return best ?? c;
}

/** Rounds to 0.01 (Math.round(v * 100) / 100), turning a negative zero into 0. */
export function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}
