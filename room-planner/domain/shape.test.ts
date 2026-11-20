import { describe, expect, it } from 'vitest';
import type { PlanPart } from './furniture/planParts';
import { signedArea } from './polygon';
import {
  footprintCorners,
  itemFootprint,
  normaliseAngle,
  planPartOutline,
  roomBounds,
  roomHeight,
  roomOutline,
  type Footprint,
} from './shape';
import { placedItem, rectRoom } from '../test/fixtures';
import type { Point } from './types';

const ROOM = rectRoom(144, 168, 96);
const BED = placedItem({ w: 64, d: 85, h: 38, cx: 72, cy: 42.5 });
const DESK = placedItem({ w: 55, d: 26, h: 30, cx: 131, cy: 131.5, angle: 90 });

function expectPoints(actual: readonly Point[], expected: readonly [number, number][], digits = 10): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((p, i) => {
    expect(p.x).toBeCloseTo(expected[i][0], digits);
    expect(p.y).toBeCloseTo(expected[i][1], digits);
  });
}

describe('room accessors', () => {
  it('outlines a rectangular room from (0,0) clockwise on the plan', () => {
    expect(roomOutline(ROOM)).toEqual([
      { id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 144, y: 0 }, { id: 'c3', x: 144, y: 168 }, { id: 'c4', x: 0, y: 168 },
    ]);
  });

  it('reports the room height', () => {
    expect(roomHeight(ROOM)).toBe(96);
  });

  it('bounds the room outline', () => {
    expect(roomBounds(ROOM)).toEqual({ minX: 0, minY: 0, maxX: 144, maxY: 168, w: 144, l: 168 });
  });
});

describe('itemFootprint', () => {
  it('reads the stored centre and angle', () => {
    expect(itemFootprint({ x: 10.5, y: 20.25, w: 30, d: 12, angle: 37.5 })).toEqual({ cx: 10.5, cy: 20.25, w: 30, d: 12, angle: 37.5 });
  });

  it('centres an unrotated item on its footprint', () => {
    expect(itemFootprint(BED)).toEqual({ cx: 72, cy: 42.5, w: 64, d: 85, angle: 0 });
  });

  it('keeps the unrotated width and depth and the angle', () => {
    expect(itemFootprint(DESK)).toEqual({ cx: 131, cy: 131.5, w: 55, d: 26, angle: 90 });
  });
});

describe('footprintCorners', () => {
  it('lists back-left, back-right, front-right, front-left at 0 degrees', () => {
    expectPoints(footprintCorners({ cx: 72, cy: 42.5, w: 64, d: 85, angle: 0 }), [[40, 0], [104, 0], [104, 85], [40, 85]]);
  });

  it('turns the corners clockwise at 90 degrees', () => {
    expectPoints(footprintCorners(itemFootprint(DESK)), [[144, 104], [144, 159], [118, 159], [118, 104]]);
  });

  it('turns the corners clockwise at 45 degrees', () => {
    expectPoints(
      footprintCorners({ cx: 0, cy: 0, w: 20, d: 20, angle: 45 }),
      [[0, -14.142], [14.142, 0], [0, 14.142], [-14.142, 0]],
      3,
    );
  });

  it('keeps a positive signed area at any angle', () => {
    for (const angle of [0, 15, 45, 90, 135, 180, 225, 270, 315, 359.5]) {
      const fp: Footprint = { cx: 30, cy: -12, w: 55, d: 26, angle };
      expect(signedArea(footprintCorners(fp)), `angle ${angle}`).toBeGreaterThan(0);
    }
  });
});

/** A rectangular plan part over the fractions [u0, u1] × [v0, v1]. */
function rectPart(u0: number, u1: number, v0: number, v1: number, round = false): PlanPart {
  return { rect: [u0, u1, v0, v1], round, z0: 0, z1: 1 };
}

describe('planPartOutline', () => {
  it('places a rectangle part of a 60×40 item at each quarter turn', () => {
    // Fixed values the Task 2 comparison with the quarter-turn part mapping produced, for the
    // 60×40 item whose axis-aligned footprint's top-left was (30, 50), and the former first sofa
    // part [.08, .92, .28, 1].
    const cases: [number, number, number, [number, number][]][] = [
      [0, 60, 70, [[34.8, 61.2], [85.2, 61.2], [85.2, 90], [34.8, 90]]],
      [90, 50, 80, [[58.8, 54.8], [58.8, 105.2], [30, 105.2], [30, 54.8]]],
      [180, 60, 70, [[85.2, 78.8], [34.8, 78.8], [34.8, 50], [85.2, 50]]],
      [270, 50, 80, [[41.2, 105.2], [41.2, 54.8], [70, 54.8], [70, 105.2]]],
    ];
    for (const [angle, x, y, expected] of cases) {
      expectPoints(planPartOutline(itemFootprint({ x, y, w: 60, d: 40, angle }), rectPart(0.08, 0.92, 0.28, 1)), expected);
    }
  });

  it('turns a part about the footprint centre at an angle that is not a quarter turn', () => {
    // The 20×20 part [0, 0.5, 0, 0.5] of a 40×40 item centred at the origin, turned 45°.
    const r = 10 * Math.SQRT2;
    expectPoints(
      planPartOutline(itemFootprint({ x: 0, y: 0, w: 40, d: 40, angle: 45 }), rectPart(0, 0.5, 0, 0.5)),
      [[0, -2 * r], [r, -r], [0, 0], [-r, -r]],
    );
  });

  it('lists a rectangle part\'s corners back-left, back-right, front-right, front-left', () => {
    const fp: Footprint = { cx: 72, cy: 42.5, w: 64, d: 85, angle: 0 };
    expectPoints(planPartOutline(fp, rectPart(0, 0.5, 0, 0.2)), [[40, 0], [72, 0], [72, 17], [40, 17]]);
  });

  it('outlines a round part as 16 points on the ellipse inscribed in its rectangle, turned with the footprint', () => {
    const fp: Footprint = { cx: 30, cy: -12, w: 50, d: 30, angle: 30 };
    const part = rectPart(0.2, 0.6, 0.1, 0.5, true);
    const pts = planPartOutline(fp, part);
    expect(pts).toHaveLength(16);
    // Local centre and radii of the ellipse: x in [-15, 5], y in [-12, 0].
    const [lcx, lcy, rx, ry] = [-5, -6, 10, 6];
    const rad = (30 * Math.PI) / 180;
    for (const p of pts) {
      // Back into the footprint's own frame, then onto the unit circle.
      const dx = p.x - fp.cx;
      const dy = p.y - fp.cy;
      const lx = dx * Math.cos(rad) + dy * Math.sin(rad);
      const ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
      expect(Math.abs(((lx - lcx) / rx) ** 2 + ((ly - lcy) / ry) ** 2 - 1)).toBeLessThan(1e-6);
    }
    // The first point is at the ellipse's right end, turned 30° clockwise about the centre.
    const first = { x: fp.cx + 5 * Math.cos(rad) + 6 * Math.sin(rad), y: fp.cy + 5 * Math.sin(rad) - 6 * Math.cos(rad) };
    expectPoints(pts.slice(0, 1), [[first.x, first.y]]);
    expect(signedArea(pts)).toBeGreaterThan(0);
  });

  it('outlines a round part with a given number of segments, all on the ellipse, and keeps 16 by default', () => {
    const fp: Footprint = { cx: 30, cy: -12, w: 50, d: 30, angle: 30 };
    const part = rectPart(0.2, 0.6, 0.1, 0.5, true);
    const pts = planPartOutline(fp, part, 48);
    expect(pts).toHaveLength(48);
    const [lcx, lcy, rx, ry] = [-5, -6, 10, 6];
    const rad = (30 * Math.PI) / 180;
    for (const p of pts) {
      const dx = p.x - fp.cx;
      const dy = p.y - fp.cy;
      const lx = dx * Math.cos(rad) + dy * Math.sin(rad);
      const ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
      expect(Math.abs(((lx - lcx) / rx) ** 2 + ((ly - lcy) / ry) ** 2 - 1)).toBeLessThan(1e-6);
    }
    expect(planPartOutline(fp, part)).toHaveLength(16);
    expect(planPartOutline(fp, rectPart(0, 0.5, 0, 0.2), 48)).toHaveLength(4);
    expect(() => planPartOutline(fp, part, 7)).toThrow(RangeError);
    expect(() => planPartOutline(fp, part, 12.5)).toThrow(RangeError);
  });
});

describe('normaliseAngle', () => {
  it('wraps degrees into [0, 360)', () => {
    expect(normaliseAngle(-90)).toBe(270);
    expect(normaliseAngle(360)).toBe(0);
    expect(normaliseAngle(725)).toBe(5);
    expect(normaliseAngle(0)).toBe(0);
  });
});
