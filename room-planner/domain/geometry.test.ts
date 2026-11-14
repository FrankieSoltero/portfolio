import { describe, expect, it } from 'vitest';
import { createInitialDocument } from './catalog';
import { centrePosition, clampSnap, footprint, mapPart, moveItem, rotateItem, snapRoomDim } from './geometry';
import type { Item, PartRect, Room } from './types';

const ROOM: Room = { w: 144, l: 168, h: 96 };

function seed(id: string): Item {
  const item = createInitialDocument().items.find((i) => i.id === id);
  if (!item) throw new Error(`missing seed item ${id}`);
  return item;
}

function expectTupleClose(actual: readonly number[], expected: readonly number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 10));
}

describe('footprint', () => {
  it('keeps w×d for even rotations and swaps for odd rotations', () => {
    expect(footprint({ w: 55, d: 26, rot: 0 })).toEqual([55, 26]);
    expect(footprint({ w: 55, d: 26, rot: 1 })).toEqual([26, 55]);
    expect(footprint({ w: 55, d: 26, rot: 2 })).toEqual([55, 26]);
    expect(footprint({ w: 55, d: 26, rot: 3 })).toEqual([26, 55]);
  });
});

describe('mapPart', () => {
  const part: PartRect = [0.1, 0.4, 0.2, 0.3, 0, 1];

  it('returns the part unchanged at rot 0', () => {
    expectTupleClose(mapPart(part, 0), [0.1, 0.4, 0.2, 0.3]);
  });

  it('maps the part a quarter turn at rot 1', () => {
    expectTupleClose(mapPart(part, 1), [0.7, 0.8, 0.1, 0.4]);
  });

  it('maps the part a half turn at rot 2', () => {
    expectTupleClose(mapPart(part, 2), [0.6, 0.9, 0.7, 0.8]);
  });

  it('maps the part three quarter turns at rot 3', () => {
    expectTupleClose(mapPart(part, 3), [0.2, 0.3, 0.6, 0.9]);
  });
});

describe('clampSnap', () => {
  it('rounds to the nearest snap step', () => {
    expect(clampSnap(10.4, 100, 1)).toBe(10);
    expect(clampSnap(10.5, 100, 1)).toBe(11);
    expect(clampSnap(13, 100, 6)).toBe(12);
  });

  it('clamps into [0, max] and treats a negative max as 0', () => {
    expect(clampSnap(-5, 100, 1)).toBe(0);
    expect(clampSnap(150, 100, 1)).toBe(100);
    expect(clampSnap(5, -10, 1)).toBe(0);
  });
});

describe('moveItem', () => {
  it('clamps the item inside the room using its footprint', () => {
    const moved = moveItem(seed('seed-bed'), 200, -3, ROOM, 1);
    expect(moved.x).toBe(80);
    expect(moved.y).toBe(0);
  });

  it('returns a new object and leaves the input unchanged', () => {
    const bed = seed('seed-bed');
    const before = structuredClone(bed);
    const moved = moveItem(bed, 10, 20, ROOM, 1);
    expect(moved).not.toBe(bed);
    expect(bed).toEqual(before);
    expect(moved).toEqual({ ...before, x: 10, y: 20 });
  });
});

describe('rotateItem', () => {
  it('turns the seed desk about its centre and re-clamps it', () => {
    const desk = seed('seed-desk');
    const rotated = rotateItem(desk, ROOM, 1);
    expect(rotated.rot).toBe(2);
    expect(rotated.x).toBe(89);
    expect(rotated.y).toBe(119);
    expect(desk).toMatchObject({ rot: 1, x: 118, y: 104 });
  });

  it('wraps rot 3 back to rot 0', () => {
    const item: Item = { ...seed('seed-desk'), rot: 3, x: 0, y: 0 };
    expect(rotateItem(item, ROOM, 1).rot).toBe(0);
  });
});

describe('centrePosition', () => {
  it('centres the footprint in the room', () => {
    expect(centrePosition({ w: 84, d: 36 }, ROOM, 1)).toEqual({ x: 30, y: 66 });
  });

  it('pins an oversized item to the origin on the overflowing axis', () => {
    expect(centrePosition({ w: 200, d: 36 }, ROOM, 1).x).toBe(0);
  });
});

describe('snapRoomDim', () => {
  it('snaps to the room handle step and clamps to the room limits', () => {
    expect(snapRoomDim(100)).toBe(99);
    expect(snapRoomDim(20)).toBe(36);
    expect(snapRoomDim(1000)).toBe(720);
    expect(snapRoomDim(145.4)).toBe(144);
  });
});
