import { describe, expect, it } from 'vitest';
import { convexInsidePolygon } from './polygon';
import { footprintCorners } from './shape';
import type { Point } from './types';
import { stopAtWalls } from './wallStop';

/** Plain rectangular room, 144 × 168. */
const R: Point[] = [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 168 }, { x: 0, y: 168 }];
/** L-shaped room: the bottom-right 72 × 84 is cut out. */
const L: Point[] = [
  { x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 84 }, { x: 72, y: 84 }, { x: 72, y: 168 }, { x: 0, y: 168 },
];
/** One angled wall, on the line x + y = 244. */
const A: Point[] = [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 100 }, { x: 76, y: 168 }, { x: 0, y: 168 }];

/** shapeAt for a w × d rectangle turned by angle degrees, centred on the given point. */
function rect(w: number, d: number, angle = 0): (c: Point) => readonly Point[] {
  return (c) => footprintCorners({ cx: c.x, cy: c.y, w, d, angle });
}

describe('stopAtWalls', () => {
  it('returns the target when the piece fits there', () => {
    expect(stopAtWalls(rect(60, 80), { x: 72, y: 84 }, { x: 90, y: 90 }, R)).toEqual({ x: 90, y: 90 });
  });

  it('stops at the wall a move goes past', () => {
    expect(stopAtWalls(rect(60, 80), { x: 72, y: 84 }, { x: 200, y: 84 }, R)).toEqual({ x: 114, y: 84 });
  });

  it('stops in the corner when a move goes past two walls', () => {
    expect(stopAtWalls(rect(60, 80), { x: 72, y: 84 }, { x: 200, y: -50 }, R)).toEqual({ x: 114, y: 40 });
  });

  it('stops at each of the other walls', () => {
    const from = { x: 72, y: 84 };
    expect(stopAtWalls(rect(60, 80), from, { x: -50, y: 84 }, R)).toEqual({ x: 30, y: 84 });
    expect(stopAtWalls(rect(60, 80), from, { x: 72, y: -50 }, R)).toEqual({ x: 72, y: 40 });
    expect(stopAtWalls(rect(60, 80), from, { x: 72, y: 400 }, R)).toEqual({ x: 72, y: 128 });
  });

  it('stops flush with a wall that is not on a whole inch', () => {
    const room = [{ x: 0, y: 0 }, { x: 147.5, y: 0 }, { x: 147.5, y: 168 }, { x: 0, y: 168 }];
    expect(stopAtWalls(rect(60, 80), { x: 72, y: 84 }, { x: 130, y: 84 }, room)).toEqual({ x: 117.5, y: 84 });
  });

  it('stops flush when the piece is not a whole inch wide', () => {
    expect(stopAtWalls(rect(60.5, 80), { x: 72, y: 84 }, { x: 130, y: 84 }, R)).toEqual({ x: 113.75, y: 84 });
  });

  it('stops a quarter-turned piece by its turned size', () => {
    expect(stopAtWalls(rect(60, 80, 90), { x: 72, y: 84 }, { x: 200, y: 0 }, R)).toEqual({ x: 104, y: 30 });
  });

  it('stops a piece turned 30° within 0.01 of the wall', () => {
    const shapeAt = rect(60, 80, 30);
    const p = stopAtWalls(shapeAt, { x: 72, y: 84 }, { x: 200, y: 84 }, R);
    expect(p.y).toBe(84);
    expect(convexInsidePolygon(shapeAt(p), R, 1e-6)).toBe(true);
    expect(convexInsidePolygon(shapeAt({ x: p.x + 0.02, y: 84 }), R, 1e-6)).toBe(false);
  });

  it('slides along a wall it is already against', () => {
    expect(stopAtWalls(rect(60, 80), { x: 114, y: 84 }, { x: 130, y: 100 }, R)).toEqual({ x: 114, y: 100 });
  });

  it('stops at the wall of an L cut-out', () => {
    expect(stopAtWalls(rect(40, 40), { x: 36, y: 126 }, { x: 100, y: 126 }, L)).toEqual({ x: 52, y: 126 });
  });

  it('lets a piece jump across the cut-out when the target fits', () => {
    expect(stopAtWalls(rect(40, 40), { x: 36, y: 140 }, { x: 110, y: 40 }, L)).toEqual({ x: 110, y: 40 });
  });

  it('stops at an angled wall on first touch', () => {
    expect(stopAtWalls(rect(40, 40), { x: 100, y: 100 }, { x: 110, y: 100 }, A)).toEqual({ x: 104, y: 100 });
  });

  it('slides along an angled wall', () => {
    expect(stopAtWalls(rect(40, 40), { x: 104, y: 100 }, { x: 130, y: 100 }, A)).toEqual({ x: 117, y: 87 });
  });

  it('returns the target when the piece starts outside the room', () => {
    expect(stopAtWalls(rect(60, 80), { x: 140, y: 84 }, { x: 200, y: 84 }, R)).toEqual({ x: 200, y: 84 });
  });

  it('returns the target when the piece is too big to fit', () => {
    expect(stopAtWalls(rect(200, 200), { x: 72, y: 84 }, { x: 10, y: 10 }, R)).toEqual({ x: 10, y: 10 });
  });

  it('still slides a piece that starts 0.01 over a wall', () => {
    expect(stopAtWalls(rect(60, 80), { x: 114.01, y: 84 }, { x: 114.01, y: 100 }, R)).toEqual({ x: 114.01, y: 100 });
  });

  it('keeps a piece that starts 0.01 over a wall where it is when pushed further in', () => {
    expect(stopAtWalls(rect(60, 80), { x: 114.01, y: 84 }, { x: 120, y: 84 }, R)).toEqual({ x: 114.01, y: 84 });
  });

  it('rounds the target to 0.01', () => {
    expect(stopAtWalls(rect(60, 80), { x: 72, y: 84 }, { x: 90.004, y: 90.006 }, R)).toEqual({ x: 90, y: 90.01 });
  });

  it('rounds towards the start when the nearest 0.01 is over the wall', () => {
    // The wall at x = 143.996 puts the flush centre at 113.996: 114 is over it, 113.99 is not.
    const room = [{ x: 0, y: 0 }, { x: 143.996, y: 0 }, { x: 143.996, y: 168 }, { x: 0, y: 168 }];
    expect(stopAtWalls(rect(60, 80), { x: 72, y: 64.07 }, { x: 200, y: 64.07 }, room)).toEqual({ x: 113.99, y: 64.07 });
  });

  it('keeps an unchanged on-grid coordinate when a turned piece stops at a wall', () => {
    // A 10 × 10 piece turned 30° reaches 6.83 below its centre, so it stops at y = 161.16.
    const room = [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 100 }, { x: 72, y: 100 }, { x: 72, y: 168 }, { x: 0, y: 168 }];
    for (const x of [64.07, 64.1, 64.21, 64.24, 64.32, 40.05, 40.12]) {
      expect(stopAtWalls(rect(10, 10, 30), { x: 110, y: 60 }, { x, y: 200 }, room)).toEqual({ x, y: 161.16 });
    }
  });

  it('returns the start when there is no move', () => {
    expect(stopAtWalls(rect(60, 80), { x: 114, y: 84 }, { x: 114, y: 84 }, R)).toEqual({ x: 114, y: 84 });
  });
});

describe('stopAtWalls options', () => {
  it('returns whenOutside, rounded to 0.01, for a piece that starts outside the room', () => {
    const whenOutside = { x: 144.004, y: 84.006 };
    expect(stopAtWalls(rect(60, 80), { x: 140, y: 84 }, { x: 200, y: 84 }, R, { whenOutside })).toEqual({ x: 144, y: 84.01 });
  });

  it('ignores whenOutside for a piece that starts inside the room', () => {
    const whenOutside = { x: 144, y: 84 };
    expect(stopAtWalls(rect(60, 80), { x: 72, y: 84 }, { x: 200, y: 84 }, R, { whenOutside })).toEqual({ x: 114, y: 84 });
  });

  it('with straight, stops on the line from the start to the target instead of sliding along a wall', () => {
    // Without straight this move slides along room A's angled wall to (117, 87).
    expect(stopAtWalls(rect(40, 40), { x: 104, y: 100 }, { x: 130, y: 100 }, A, { straight: true })).toEqual({ x: 104, y: 100 });
    expect(stopAtWalls(rect(60, 80), { x: 114, y: 84 }, { x: 130, y: 100 }, R, { straight: true })).toEqual({ x: 114, y: 84 });
  });

  it('with straight, goes as far as fits along the line', () => {
    expect(stopAtWalls(rect(20, 20), { x: 100, y: 100 }, { x: 130, y: 130 }, A, { straight: true })).toEqual({ x: 112, y: 112 });
    expect(stopAtWalls(rect(20, 20), { x: 100, y: 100 }, { x: 101, y: 100 }, A, { straight: true })).toEqual({ x: 101, y: 100 });
  });
});
