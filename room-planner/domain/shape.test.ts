import { describe, expect, it } from 'vitest';
import { PARTS } from './catalog';
import { signedArea } from './polygon';
import {
  footprintCorners,
  itemFootprint,
  normaliseAngle,
  partCorners,
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

describe('partCorners', () => {
  it('places the first sofa part of a 60×40 item at each quarter turn', () => {
    // Fixed values the Task 2 comparison with the quarter-turn part mapping produced, for the
    // 60×40 item whose axis-aligned footprint's top-left was (30, 50).
    const cases: [number, number, number, [number, number][]][] = [
      [0, 60, 70, [[34.8, 61.2], [85.2, 61.2], [85.2, 90], [34.8, 90]]],
      [90, 50, 80, [[58.8, 54.8], [58.8, 105.2], [30, 105.2], [30, 54.8]]],
      [180, 60, 70, [[85.2, 78.8], [34.8, 78.8], [34.8, 50], [85.2, 50]]],
      [270, 50, 80, [[41.2, 105.2], [41.2, 54.8], [70, 54.8], [70, 105.2]]],
    ];
    for (const [angle, x, y, expected] of cases) {
      expectPoints(partCorners(itemFootprint({ x, y, w: 60, d: 40, angle }), PARTS.sofa[0]), expected);
    }
  });

  it('turns a part about the footprint centre at an angle that is not a quarter turn', () => {
    // The 20×20 part [0, 0.5, 0, 0.5] of a 40×40 item centred at the origin, turned 45°.
    const r = 10 * Math.SQRT2;
    expectPoints(
      partCorners(itemFootprint({ x: 0, y: 0, w: 40, d: 40, angle: 45 }), [0, 0.5, 0, 0.5, 0, 1]),
      [[0, -2 * r], [r, -r], [0, 0], [-r, -r]],
    );
  });

  it('lists the part corners back-left, back-right, front-right, front-left', () => {
    const fp: Footprint = { cx: 72, cy: 42.5, w: 64, d: 85, angle: 0 };
    expectPoints(partCorners(fp, [0, 0.5, 0, 0.2, 0, 1]), [[40, 0], [72, 0], [72, 17], [40, 17]]);
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
