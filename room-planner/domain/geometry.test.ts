import { describe, expect, it } from 'vitest';
import { createInitialDocument } from './catalog';
import { moveItem, rotateItemBy, setItemAngle, shiftItem } from './geometry';
import { boundsOf } from './polygon';
import { footprintCorners, itemFootprint, roomBounds } from './shape';
import type { Item } from './types';

const BOUNDS = roomBounds(createInitialDocument().room);

function seed(id: string): Item {
  const item = createInitialDocument().items.find((i) => i.id === id);
  if (!item) throw new Error(`missing seed item ${id}`);
  return item;
}

describe('moveItem', () => {
  it('snaps the footprint bounding box min corner to the snap step', () => {
    // The seed bed is 64 × 85 unturned: half-extents 32, 42.5.
    const moved = moveItem(seed('seed-bed'), 80.4, 50.6, BOUNDS, 1);
    expect(moved).toMatchObject({ x: 80, y: 50.5 });
    expect(moveItem(seed('seed-bed'), 13, 14, BOUNDS, 6)).toMatchObject({ x: 14, y: 12.5 });
  });

  it('keeps the seed bed flush with the back wall when it slides along it', () => {
    for (const x of [30.3, 60, 96.6]) {
      const moved = moveItem(seed('seed-bed'), x, 42.7, BOUNDS, 1);
      expect(moved.y).toBe(42.5);
      expect(boundsOf(footprintCorners(itemFootprint(moved))).minY).toBeCloseTo(0, 10);
    }
  });

  it('puts the min corner of a quarter-turned odd-sized item on the grid', () => {
    // 55 × 27 turned 90°: the bounding box is 27 × 55, half-extents 13.5, 27.5.
    const item: Item = { ...seed('seed-desk'), w: 55, d: 27, angle: 90 };
    const moved = moveItem(item, 50.2, 60.3, BOUNDS, 1);
    expect(moved).toMatchObject({ x: 50.5, y: 60.5 });
    const b = boundsOf(footprintCorners(itemFootprint(moved)));
    expect(b.minX).toBeCloseTo(37, 10);
    expect(b.minY).toBeCloseTo(33, 10);
  });

  it('puts the min corner of a 45° item on the grid, to the 0.01 in the centre is stored to', () => {
    // 40 × 20 at 45°: half-extents (40 + 20)·cos 45° / 2 = 21.2132 on both axes.
    const item: Item = { ...seed('seed-desk'), w: 40, d: 20, angle: 45 };
    const moved = moveItem(item, 50, 50, BOUNDS, 1);
    expect(moved).toMatchObject({ x: 50.21, y: 50.21 });
    const b = boundsOf(footprintCorners(itemFootprint(moved)));
    expect(b.minX).toBeCloseTo(29, 2);
    expect(b.minY).toBeCloseTo(29, 2);
  });

  it('clamps the centre into the bounds after snapping', () => {
    expect(moveItem(seed('seed-bed'), -50, 900, BOUNDS, 1)).toMatchObject({ x: 0, y: 168 });
    expect(moveItem(seed('seed-bed'), 143.8, 168.4, BOUNDS, 1)).toMatchObject({ x: 144, y: 168 });
    const offset = { minX: 10, minY: 20, maxX: 50, maxY: 60, w: 40, l: 40 };
    expect(moveItem(seed('seed-bed'), 0, 100, offset, 1)).toMatchObject({ x: 10, y: 60 });
  });

  it('lets the footprint reach past the bounds; only the centre is kept inside', () => {
    expect(moveItem(seed('seed-bed'), 5.2, 5.2, BOUNDS, 1)).toMatchObject({ x: 5, y: 5.5 });
  });

  it('stores coordinates rounded to 0.01 in', () => {
    const moved = moveItem(seed('seed-bed'), 0.29, 0.71, BOUNDS, 0.1);
    expect(moved.x).toBe(0.3);
    expect(moved.y).toBe(0.7);
  });

  it('keeps the angle and returns a new object, leaving the input unchanged', () => {
    const desk = seed('seed-desk');
    const before = structuredClone(desk);
    const moved = moveItem(desk, 10, 20.5, BOUNDS, 1);
    expect(moved).not.toBe(desk);
    expect(desk).toEqual(before);
    expect(moved).toEqual({ ...before, x: 10, y: 20.5 });
  });
});

describe('shiftItem', () => {
  it('moves the centre by exactly (dx, dy), without snapping to the grid', () => {
    // The desk turned 180°: half-extents 27.5, 13, so its bounding box min corner is off the grid.
    const desk: Item = { ...seed('seed-desk'), angle: 180 };
    expect(shiftItem(desk, 1, 0, BOUNDS)).toMatchObject({ x: 132, y: 131.5, angle: 180 });
    expect(shiftItem(desk, 0, 12, BOUNDS)).toMatchObject({ x: 131, y: 143.5 });
    expect(shiftItem(seed('seed-bed'), 0.3, -0.4, BOUNDS)).toMatchObject({ x: 72.3, y: 42.1 });
  });

  it('clamps the centre into the bounds', () => {
    const bed: Item = { ...seed('seed-bed'), x: 143.6 };
    expect(shiftItem(bed, 1, 0, BOUNDS).x).toBe(144);
    expect(shiftItem(seed('seed-bed'), -500, 500, BOUNDS)).toMatchObject({ x: 0, y: 168 });
  });

  it('stores coordinates rounded to 0.01 in', () => {
    const item: Item = { ...seed('seed-bed'), x: 0.1, y: 0.7 };
    const shifted = shiftItem(item, 0.2, 0.1, BOUNDS);
    expect(shifted.x).toBe(0.3);
    expect(shifted.y).toBe(0.8);
  });

  it('returns a new object and leaves the input unchanged', () => {
    const desk = seed('seed-desk');
    const before = structuredClone(desk);
    const shifted = shiftItem(desk, -1, 1, BOUNDS);
    expect(shifted).not.toBe(desk);
    expect(desk).toEqual(before);
    expect(shifted).toEqual({ ...before, x: 130, y: 132.5 });
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
