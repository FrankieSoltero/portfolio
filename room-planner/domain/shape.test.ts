import { describe, expect, it } from 'vitest';
import { PARTS } from './catalog';
import { footprint, mapPart } from './geometry';
import { boundsOf, signedArea } from './polygon';
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
import type { Kind, Point, Room, Rot } from './types';

const ROOM: Room = { w: 144, l: 168, h: 96 };
const BED = { x: 40, y: 0, w: 64, d: 85, rot: 0 as Rot };
const DESK = { x: 118, y: 104, w: 55, d: 26, rot: 1 as Rot };

function expectPoints(actual: readonly Point[], expected: readonly [number, number][], digits = 10): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((p, i) => {
    expect(p.x).toBeCloseTo(expected[i][0], digits);
    expect(p.y).toBeCloseTo(expected[i][1], digits);
  });
}

describe('room accessors', () => {
  it('outlines a rectangular room from (0,0) clockwise on the plan', () => {
    expect(roomOutline(ROOM)).toEqual([{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 168 }, { x: 0, y: 168 }]);
  });

  it('reports the room height', () => {
    expect(roomHeight(ROOM)).toBe(96);
  });

  it('bounds the room outline', () => {
    expect(roomBounds(ROOM)).toEqual({ minX: 0, minY: 0, maxX: 144, maxY: 168, w: 144, l: 168 });
  });
});

describe('itemFootprint', () => {
  it('centres an unrotated item on its footprint', () => {
    expect(itemFootprint(BED)).toEqual({ cx: 72, cy: 42.5, w: 64, d: 85, angle: 0 });
  });

  it('keeps the unrotated width and depth and turns a quarter turn into 90 degrees', () => {
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
  it('agrees with the quarter-turn part mapping for every part of every kind', () => {
    for (const kind of Object.keys(PARTS) as Kind[]) {
      for (const part of PARTS[kind]) {
        for (const rot of [0, 1, 2, 3] as Rot[]) {
          const item = { x: 30, y: 50, w: 60, d: 40, rot };
          const [fw, fd] = footprint(item);
          const [m0, m1, m2, m3] = mapPart(part, rot);
          const b = boundsOf(partCorners(itemFootprint(item), part));
          const label = `${kind} [${part.join(',')}] rot ${rot}`;
          expect(Math.abs(b.minX - (item.x + m0 * fw)), label).toBeLessThan(1e-9);
          expect(Math.abs(b.maxX - (item.x + m1 * fw)), label).toBeLessThan(1e-9);
          expect(Math.abs(b.minY - (item.y + m2 * fd)), label).toBeLessThan(1e-9);
          expect(Math.abs(b.maxY - (item.y + m3 * fd)), label).toBeLessThan(1e-9);
        }
      }
    }
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
