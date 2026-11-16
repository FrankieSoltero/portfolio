import { describe, expect, it } from 'vitest';
import { createInitialDocument } from './catalog';
import {
  footprintHalfExtents,
  moveItem,
  placeItem,
  rotateItemBy,
  setItemAngle,
  shiftItem,
  snapCentreInto,
  storedAngle,
} from './geometry';
import { boundsOf } from './polygon';
import { footprintCorners, itemFootprint, roomBounds, roomOutline } from './shape';
import type { Item, Point } from './types';

const BOUNDS = roomBounds(createInitialDocument().room);
const OUTLINE = roomOutline(createInitialDocument().room);

function seed(id: string): Item {
  const item = createInitialDocument().items.find((i) => i.id === id);
  if (!item) throw new Error(`missing seed item ${id}`);
  return item;
}

describe('moveItem', () => {
  it('snaps the footprint bounding box min corner to the snap step', () => {
    // The seed bed is 64 × 85 unturned: half-extents 32, 42.5.
    const moved = moveItem(seed('seed-bed'), 80.4, 50.6, OUTLINE, 1);
    expect(moved).toMatchObject({ x: 80, y: 50.5 });
    // Started partly outside the room (x 0), so the walls do not stop it and the 6 in grid shows.
    expect(moveItem({ ...seed('seed-bed'), x: 0 }, 13, 14, OUTLINE, 6)).toMatchObject({ x: 14, y: 12.5 });
  });

  it('keeps the seed bed flush with the back wall when it slides along it', () => {
    for (const x of [30.3, 60, 96.6]) {
      const moved = moveItem(seed('seed-bed'), x, 42.7, OUTLINE, 1);
      expect(moved.y).toBe(42.5);
      expect(boundsOf(footprintCorners(itemFootprint(moved))).minY).toBeCloseTo(0, 10);
    }
  });

  it('puts the min corner of a quarter-turned odd-sized item on the grid', () => {
    // 55 × 27 turned 90°: the bounding box is 27 × 55, half-extents 13.5, 27.5.
    const item: Item = { ...seed('seed-desk'), w: 55, d: 27, angle: 90 };
    const moved = moveItem(item, 50.2, 60.3, OUTLINE, 1);
    expect(moved).toMatchObject({ x: 50.5, y: 60.5 });
    const b = boundsOf(footprintCorners(itemFootprint(moved)));
    expect(b.minX).toBeCloseTo(37, 10);
    expect(b.minY).toBeCloseTo(33, 10);
  });

  it('puts the min corner of a 45° item on the grid, to the 0.01 in the centre is stored to', () => {
    // 40 × 20 at 45°: half-extents (40 + 20)·cos 45° / 2 = 21.2132 on both axes.
    const item: Item = { ...seed('seed-desk'), w: 40, d: 20, angle: 45 };
    const moved = moveItem(item, 50, 50, OUTLINE, 1);
    expect(moved).toMatchObject({ x: 50.21, y: 50.21 });
    const b = boundsOf(footprintCorners(itemFootprint(moved)));
    expect(b.minX).toBeCloseTo(29, 2);
    expect(b.minY).toBeCloseTo(29, 2);
  });

  it('clamps the centre into the bounds after snapping', () => {
    // Started partly outside the room (x 108–172), so the walls do not stop it.
    const outside: Item = { ...seed('seed-bed'), x: 140 };
    expect(moveItem(outside, -50, 900, OUTLINE, 1)).toMatchObject({ x: 0, y: 168 });
    expect(moveItem(outside, 143.8, 168.4, OUTLINE, 1)).toMatchObject({ x: 144, y: 168 });
    const offset = [{ x: 10, y: 20 }, { x: 50, y: 20 }, { x: 50, y: 60 }, { x: 10, y: 60 }];
    expect(moveItem(seed('seed-bed'), 0, 100, offset, 1)).toMatchObject({ x: 10, y: 60 });
  });

  it('stops the footprint flush with the walls instead of letting it reach past them', () => {
    expect(moveItem(seed('seed-bed'), 5.2, 5.2, OUTLINE, 1)).toMatchObject({ x: 32, y: 42.5 });
  });

  it('stores coordinates rounded to 0.01 in', () => {
    // Started partly outside the room (x 108–172), so the walls do not stop it.
    const moved = moveItem({ ...seed('seed-bed'), x: 140 }, 0.29, 0.71, OUTLINE, 0.1);
    expect(moved.x).toBe(0.3);
    expect(moved.y).toBe(0.7);
  });

  it('keeps the angle and returns a new object, leaving the input unchanged', () => {
    const desk = seed('seed-desk');
    const before = structuredClone(desk);
    const moved = moveItem(desk, 10, 20.5, OUTLINE, 1);
    expect(moved).not.toBe(desk);
    expect(desk).toEqual(before);
    // Stopped flush in the top-left corner: the quarter-turned desk's half-extents are 13, 27.5.
    expect(moved).toEqual({ ...before, x: 13, y: 27.5 });
  });
});

describe('shiftItem', () => {
  it('moves the centre by exactly (dx, dy), without snapping to the grid', () => {
    // The desk turned 180°: half-extents 27.5, 13, so its bounding box min corner is off the grid.
    const desk: Item = { ...seed('seed-desk'), angle: 180 };
    expect(shiftItem(desk, 1, 0, OUTLINE)).toMatchObject({ x: 132, y: 131.5, angle: 180 });
    expect(shiftItem(desk, 0, 12, OUTLINE)).toMatchObject({ x: 131, y: 143.5 });
    // The bed is flush with the back wall, so the step up stops at it.
    expect(shiftItem(seed('seed-bed'), 0.3, -0.4, OUTLINE)).toMatchObject({ x: 72.3, y: 42.5 });
  });

  it('clamps the centre into the bounds', () => {
    // Started partly outside the room (x 111.6–175.6), so the walls do not stop it.
    const bed: Item = { ...seed('seed-bed'), x: 143.6 };
    expect(shiftItem(bed, 1, 0, OUTLINE).x).toBe(144);
    expect(shiftItem(bed, -500, 500, OUTLINE)).toMatchObject({ x: 0, y: 168 });
  });

  it('stores coordinates rounded to 0.01 in', () => {
    const item: Item = { ...seed('seed-bed'), x: 0.1, y: 0.7 };
    const shifted = shiftItem(item, 0.2, 0.1, OUTLINE);
    expect(shifted.x).toBe(0.3);
    expect(shifted.y).toBe(0.8);
  });

  it('returns a new object and leaves the input unchanged', () => {
    const desk = seed('seed-desk');
    const before = structuredClone(desk);
    const shifted = shiftItem(desk, -1, 1, OUTLINE);
    expect(shifted).not.toBe(desk);
    expect(desk).toEqual(before);
    expect(shifted).toEqual({ ...before, x: 130, y: 132.5 });
  });
});

/** Plain rectangular room, 144 × 168. */
const R: Point[] = [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 168 }, { x: 0, y: 168 }];

/** An unturned w × d piece of furniture centred on (x, y). */
function piece(w: number, d: number, x: number, y: number, over: Partial<Item> = {}): Item {
  return { ...seed('seed-bed'), w, d, x, y, angle: 0, ...over };
}

describe('moveItem and shiftItem stop at the walls', () => {
  it('moves inside the room as before: grid snap, no stop', () => {
    expect(moveItem(piece(60, 80, 72, 84), 90.4, 90.3, R, 1)).toMatchObject({ x: 90, y: 90 });
  });

  it('stops a move past a wall flush against it', () => {
    expect(moveItem(piece(60, 80, 72, 84), 130.4, 84.3, R, 1)).toMatchObject({ x: 114, y: 84 });
  });

  it('lets the wall beat the grid when the room is not a whole inch wide', () => {
    const room = [{ x: 0, y: 0 }, { x: 147.5, y: 0 }, { x: 147.5, y: 168 }, { x: 0, y: 168 }];
    expect(moveItem(piece(60, 80, 72, 84), 140, 84, room, 1)).toMatchObject({ x: 117.5, y: 84 });
  });

  it('nudges a piece into a wall by the part of the step that fits', () => {
    expect(shiftItem(piece(60, 80, 113.5, 84), 1, 0, R)).toMatchObject({ x: 114, y: 84 });
  });

  it('leaves a piece flush at a wall where it is when nudged into it', () => {
    expect(shiftItem(piece(60, 80, 114, 84), 1, 0, R)).toMatchObject({ x: 114, y: 84 });
  });

  it('stops a rug like any other furniture', () => {
    expect(moveItem(piece(60, 80, 72, 84, { kind: 'rug' }), 130.4, 84.3, R, 1)).toMatchObject({ x: 114, y: 84 });
  });

  it('moves a piece that starts outside the room as before', () => {
    expect(moveItem(piece(60, 80, 140, 84), 150.2, 84, R, 1)).toMatchObject({ x: 144, y: 84 });
  });
});

describe('placeItem', () => {
  it('snaps the bounding-box min corner to the grid and clamps the centre into the bounds, ignoring walls', () => {
    expect(placeItem(piece(60, 80, 0, 0), 130.4, 84.3, BOUNDS, 1)).toMatchObject({ x: 130, y: 84 });
    expect(placeItem(piece(60, 80, 0, 0), -50, 900, BOUNDS, 1)).toMatchObject({ x: 0, y: 168 });
    expect(placeItem(piece(60, 80, 0, 0), 13, 14, BOUNDS, 6)).toMatchObject({ x: 12, y: 16 });
  });
});

describe('rotateItemBy', () => {
  it('turns the seed desk by 90 degrees about its centre', () => {
    const desk = seed('seed-desk');
    const rotated = rotateItemBy(desk, 90);
    expect(rotated).toMatchObject({ angle: 180, x: 131, y: 131.5 });
    expect(desk).toMatchObject({ angle: 90, x: 131, y: 131.5 });
  });

  it('wraps past 360 and below 0', () => {
    const item: Item = { ...seed('seed-desk'), angle: 350 };
    expect(rotateItemBy(item, 15).angle).toBe(5);
    expect(rotateItemBy({ ...item, angle: 0 }, -90).angle).toBe(270);
    expect(rotateItemBy({ ...item, angle: 270 }, 90).angle).toBe(0);
  });

  it('stores the angle rounded to 0.01 degrees and never as 360', () => {
    const item: Item = { ...seed('seed-desk'), angle: 0.1 };
    expect(rotateItemBy(item, 0.2).angle).toBe(0.3);
    expect(rotateItemBy({ ...item, angle: 359.99 }, 0.004).angle).toBe(359.99);
    expect(rotateItemBy({ ...item, angle: 359.99 }, 0.006).angle).toBe(0);
  });
});

describe('setItemAngle', () => {
  it('sets the normalised angle and keeps the position', () => {
    const desk = seed('seed-desk');
    expect(setItemAngle(desk, -30)).toMatchObject({ angle: 330, x: 131, y: 131.5 });
    expect(setItemAngle(desk, 405).angle).toBe(45);
    expect(setItemAngle(desk, 12.346).angle).toBe(12.35);
    expect(desk.angle).toBe(90);
  });
});

describe('storedAngle', () => {
  it.each([
    [-90, 270], [12.346, 12.35], [359.996, 0], [720.004, 0], [-0.004, 0], [360, 0], [405.5, 45.5], [450, 90],
  ])('stores %s as %s (normalised, rounded to 0.01, inside [0, 360))', (deg, stored) => {
    expect(storedAngle(deg)).toBe(stored);
  });

  it('stores a huge finite angle as a finite angle inside [0, 360)', () => {
    for (const deg of [1e307, -1e307, Number.MAX_VALUE]) {
      const angle = storedAngle(deg);
      expect(Number.isFinite(angle) && angle >= 0 && angle < 360).toBe(true);
    }
  });

  it('turns a huge finite angle into a finite one through rotateItemBy and setItemAngle', () => {
    const desk = seed('seed-desk');
    expect(Number.isFinite(setItemAngle(desk, 1e307).angle)).toBe(true);
    expect(Number.isFinite(rotateItemBy(desk, 1e307).angle)).toBe(true);
  });
});

describe('footprintHalfExtents', () => {
  it('gives half the turned bounding box, exact on a quarter turn', () => {
    expect(footprintHalfExtents(24, 25, 0)).toEqual({ hx: 12, hy: 12.5 });
    expect(footprintHalfExtents(24, 25, 90)).toEqual({ hx: 12.5, hy: 12 });
    expect(footprintHalfExtents(24, 25, 270)).toEqual({ hx: 12.5, hy: 12 });
    const turned = footprintHalfExtents(20, 10, 30);
    expect(turned.hx).toBeCloseTo((20 * Math.cos(Math.PI / 6) + 10 * 0.5) / 2, 9);
    expect(turned.hy).toBeCloseTo((20 * 0.5 + 10 * Math.cos(Math.PI / 6)) / 2, 9);
  });
});

describe('snapCentreInto', () => {
  it('puts the min edge (centre − half) on the snap grid, then clamps and rounds to 0.01', () => {
    // Min edge 17.6 → 18: centre 30.5.
    expect(snapCentreInto(30.1, 12.5, 1, 0, 144)).toBe(30.5);
    expect(snapCentreInto(30.1, 12.5, 6, 0, 144)).toBe(30.5);
    expect(snapCentreInto(200, 12.5, 1, 0, 144)).toBe(144);
    expect(snapCentreInto(-5, 12.5, 1, 0, 144)).toBe(0);
    expect(snapCentreInto(10, 1 / 3, 1, 0, 144)).toBe(10.33);
  });
});
