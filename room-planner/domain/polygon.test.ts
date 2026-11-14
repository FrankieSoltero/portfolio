import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import {
  boundsOf,
  convexInsidePolygon,
  convexOverlap,
  distanceToSegment,
  interiorPoint,
  isSimplePolygon,
  pointInPolygon,
  polygonArea,
  projectOntoSegment,
  rayToPolygon,
  round2,
  segmentsCross,
  signedArea,
} from './polygon';
import type { Point } from './types';

const EPS = CONFIG.conflictEpsilon;

function pts(...xy: [number, number][]): Point[] {
  return xy.map(([x, y]) => ({ x, y }));
}

const RECT = pts([0, 0], [144, 0], [144, 168], [0, 168]);
const L_SHAPE = pts([0, 0], [72, 0], [72, 84], [144, 84], [144, 168], [0, 168]);
const U_SHAPE = pts([0, 0], [30, 0], [30, 60], [60, 60], [60, 0], [90, 0], [90, 90], [0, 90]);

/** Corners of a w×d rectangle centred at (cx, cy), turned angleDeg clockwise on the plan. */
function rectCorners(cx: number, cy: number, w: number, d: number, angleDeg: number): Point[] {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return pts([-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]).map(({ x, y }) => ({
    x: cx + x * cos - y * sin,
    y: cy + x * sin + y * cos,
  }));
}

/** Axis-aligned w×d rectangle with its top-left corner at (x, y). */
function box(x: number, y: number, w: number, d: number): Point[] {
  return pts([x, y], [x + w, y], [x + w, y + d], [x, y + d]);
}

describe('signedArea and polygonArea', () => {
  it('gives a positive area for the rectangle room', () => {
    expect(signedArea(RECT)).toBe(24192);
  });

  it('gives a negative area when the corners are reversed, and polygonArea is its absolute value', () => {
    const reversed = [...RECT].reverse();
    expect(signedArea(reversed)).toBe(-24192);
    expect(polygonArea(reversed)).toBe(24192);
  });

  it('measures the L-shape', () => {
    expect(signedArea(L_SHAPE)).toBe(18144);
    expect(polygonArea(L_SHAPE)).toBe(18144);
  });
});

describe('boundsOf', () => {
  it('bounds the L-shape', () => {
    expect(boundsOf(L_SHAPE)).toEqual({ minX: 0, minY: 0, maxX: 144, maxY: 168, w: 144, l: 168 });
  });
});

describe('pointInPolygon', () => {
  it('finds a point inside the L-shape', () => {
    expect(pointInPolygon({ x: 10, y: 10 }, L_SHAPE, EPS)).toBe(true);
  });

  it('rejects a point in the cut-out', () => {
    expect(pointInPolygon({ x: 100, y: 40 }, L_SHAPE, EPS)).toBe(false);
  });

  it('counts a point on a wall as inside', () => {
    expect(pointInPolygon({ x: 72, y: 40 }, L_SHAPE, EPS)).toBe(true);
  });

  it('rejects a point just outside a wall', () => {
    expect(pointInPolygon({ x: 72.02, y: 40 }, L_SHAPE, EPS)).toBe(false);
  });
});

describe('distanceToSegment and projectOntoSegment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it('measures the perpendicular distance within the segment', () => {
    expect(distanceToSegment({ x: 4, y: 3 }, a, b)).toBeCloseTo(3, 10);
    expect(projectOntoSegment({ x: 4, y: 3 }, a, b)).toEqual({ point: { x: 4, y: 0 }, t: 0.4 });
  });

  it('clamps beyond either end to the nearest endpoint', () => {
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBeCloseTo(5, 10);
    expect(projectOntoSegment({ x: 13, y: 4 }, a, b)).toEqual({ point: { x: 10, y: 0 }, t: 1 });
    expect(projectOntoSegment({ x: -5, y: 1 }, a, b)).toEqual({ point: { x: 0, y: 0 }, t: 0 });
  });
});

describe('segmentsCross', () => {
  it('detects a crossing', () => {
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }, EPS)).toBe(true);
  });

  it('ignores a shared endpoint', () => {
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, EPS)).toBe(false);
  });

  it('detects a collinear overlap', () => {
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 15, y: 0 }, EPS)).toBe(true);
  });

  it('ignores a T-touch', () => {
    expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 10 }, EPS)).toBe(false);
  });
});

describe('isSimplePolygon', () => {
  it('accepts the rectangle and the L-shape', () => {
    expect(isSimplePolygon(RECT, EPS)).toBe(true);
    expect(isSimplePolygon(L_SHAPE, EPS)).toBe(true);
  });

  it('rejects a bow-tie', () => {
    expect(isSimplePolygon(pts([0, 0], [10, 10], [10, 0], [0, 10]), EPS)).toBe(false);
  });

  it('rejects fewer than 3 points', () => {
    expect(isSimplePolygon(pts([0, 0], [10, 0]), EPS)).toBe(false);
  });

  it('rejects an outline that folds back on itself', () => {
    expect(isSimplePolygon(pts([0, 0], [10, 0], [5, 0], [5, 10]), EPS)).toBe(false);
  });

  it('rejects a corner touching a wall it does not belong to', () => {
    expect(isSimplePolygon(pts([0, 0], [20, 0], [20, 20], [10, 0], [0, 20]), EPS)).toBe(false);
  });
});

describe('convexOverlap', () => {
  it('detects overlapping rotated rectangles', () => {
    expect(convexOverlap(rectCorners(0, 0, 20, 20, 0), rectCorners(18, 0, 20, 20, 45), EPS)).toBe(true);
  });

  it('treats squares sharing an edge as touching, not overlapping', () => {
    expect(convexOverlap(box(0, 0, 10, 10), box(10, 0, 10, 10), EPS)).toBe(false);
  });

  it('detects squares overlapping by 0.02', () => {
    expect(convexOverlap(box(0, 0, 10, 10), box(9.98, 0, 10, 10), EPS)).toBe(true);
  });
});

describe('convexInsidePolygon', () => {
  it('accepts a square flush in a corner of the rectangle room', () => {
    expect(convexInsidePolygon(box(0, 0, 10, 10), RECT, EPS)).toBe(true);
  });

  it('rejects the square moved to x = -0.02', () => {
    expect(convexInsidePolygon(box(-0.02, 0, 10, 10), RECT, EPS)).toBe(false);
  });

  it('rejects a square over the reflex corner of the L-shape', () => {
    expect(convexInsidePolygon(box(60, 70, 30, 30), L_SHAPE, EPS)).toBe(false);
  });

  it('accepts a rectangle wholly in the lower arm of the L-shape', () => {
    expect(convexInsidePolygon(pts([10, 90], [60, 90], [60, 160], [10, 160]), L_SHAPE, EPS)).toBe(true);
  });

  it('rejects a rectangle with a corner in the cut-out and an edge across the reflex corner', () => {
    expect(convexInsidePolygon(pts([60, 10], [80, 10], [80, 100], [60, 100]), L_SHAPE, EPS)).toBe(false);
  });

  it('rejects a thin rectangle whose corners are inside but which crosses the U-shape cut-out', () => {
    expect(convexInsidePolygon(pts([10, 10], [80, 10], [80, 20], [10, 20]), U_SHAPE, EPS)).toBe(false);
  });

  it('rejects a diamond around the reflex corner whose corners only touch the walls', () => {
    // Corners (72,60) and (96,84) touch the two walls meeting at the reflex corner (72,84), so no edge
    // crosses a wall properly, yet the edge between them runs through the cut-out.
    const diamond = pts([72, 60], [96, 84], [72, 108], [48, 84]);
    expect(convexInsidePolygon(diamond, L_SHAPE, EPS)).toBe(false);
  });
});

describe('rayToPolygon', () => {
  it('hits the right wall of the rectangle room', () => {
    expect(rayToPolygon({ x: 50, y: 50 }, { x: 1, y: 0 }, RECT)).toBeCloseTo(94, 10);
  });

  it('hits the wall at x = 72 in the L-shape', () => {
    expect(rayToPolygon({ x: 30, y: 40 }, { x: 1, y: 0 }, L_SHAPE)).toBeCloseTo(42, 10);
  });

  it('returns null when the ray points away from everything', () => {
    expect(rayToPolygon({ x: -10, y: 50 }, { x: -1, y: 0 }, RECT)).toBeNull();
  });
});

describe('interiorPoint', () => {
  it('returns the centroid of a convex room', () => {
    const p = interiorPoint(RECT);
    expect(p.x).toBeCloseTo(72, 10);
    expect(p.y).toBeCloseTo(84, 10);
  });

  it('finds a point well inside when the centroid falls outside', () => {
    const p = interiorPoint(U_SHAPE);
    expect(pointInPolygon(p, U_SHAPE, EPS)).toBe(true);
    U_SHAPE.forEach((a, i) => {
      const b = U_SHAPE[(i + 1) % U_SHAPE.length];
      expect(distanceToSegment(p, a, b)).toBeGreaterThan(1);
    });
  });
});

describe('round2', () => {
  it('rounds to 0.01 and never returns negative zero', () => {
    expect(round2(12.3456)).toBe(12.35);
    expect(round2(-0.004)).toBe(0);
    expect(Object.is(round2(-0.004), -0)).toBe(false);
    expect(round2(7)).toBe(7);
  });
});
