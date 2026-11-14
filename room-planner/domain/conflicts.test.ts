import { describe, expect, it } from 'vitest';
import { createInitialDocument } from './catalog';
import { findConflicts } from './conflicts';
import type { Item, Room } from './types';

const ROOM: Room = { w: 144, l: 168, h: 96 };

/** A plain 20×20×30 box at the room origin; override any field per test. */
function item(overrides: Partial<Item> & Pick<Item, 'id'>): Item {
  return {
    kind: 'box', name: `Item ${overrides.id}`, host: 'shop.example', sourceUrl: null, price: null,
    w: 20, d: 20, h: 30, x: 0, y: 0, rot: 0,
    model: { tier: 'box', label: 'Box', assetUrl: null },
    ...overrides,
  };
}

describe('findConflicts', () => {
  it('reports nothing for the seeded bed and desk', () => {
    const doc = createInitialDocument();
    expect(findConflicts(doc.items, doc.room)).toEqual({});
  });

  it('flags an item whose footprint runs past the right wall', () => {
    const a = item({ id: 'a', x: 125 }); // 125 + 20 = 145 > 144
    expect(findConflicts([a], ROOM)).toEqual({ a: 'Outside the room' });
  });

  it('flags an item at a negative coordinate', () => {
    const a = item({ id: 'a', x: -1 });
    expect(findConflicts([a], ROOM)).toEqual({ a: 'Outside the room' });
  });

  it('flags an item taller than the ceiling', () => {
    const a = item({ id: 'a', x: 10, y: 10, h: 100 });
    expect(findConflicts([a], ROOM)).toEqual({ a: 'Taller than the ceiling' });
  });

  it('reports outside rather than too tall when both apply', () => {
    const a = item({ id: 'a', x: -1, h: 100 });
    expect(findConflicts([a], ROOM)).toEqual({ a: 'Outside the room' });
  });

  it('reports too tall rather than an overlap when both apply', () => {
    const a = item({ id: 'a', name: 'Tall cabinet', h: 100 });
    const b = item({ id: 'b', x: 10, y: 10 });
    expect(findConflicts([a, b], ROOM)).toEqual({
      a: 'Taller than the ceiling',
      b: 'Overlaps Tall cabinet',
    });
  });

  it('flags both items when two boxes overlap by 1 in', () => {
    const a = item({ id: 'a', name: 'Left box' });
    const b = item({ id: 'b', name: 'Right box', x: 19 });
    expect(findConflicts([a, b], ROOM)).toEqual({
      a: 'Overlaps Right box',
      b: 'Overlaps Left box',
    });
  });

  it('does not flag boxes that share an edge exactly', () => {
    const a = item({ id: 'a' });
    const b = item({ id: 'b', x: 20 });
    expect(findConflicts([a, b], ROOM)).toEqual({});
  });

  it('lets furniture sit on a rug without flagging either', () => {
    const rug = item({ id: 'rug', kind: 'rug', name: 'Wool rug', w: 60, d: 40, h: 1 });
    const sofa = item({ id: 'sofa', kind: 'sofa', name: 'Sofa', x: 10, y: 10, w: 40, d: 20 });
    expect(findConflicts([rug, sofa], ROOM)).toEqual({});
    expect(findConflicts([sofa, rug], ROOM)).toEqual({});
  });

  it('still flags a rug that runs past a wall', () => {
    const rug = item({ id: 'rug', kind: 'rug', x: 100, w: 60, d: 40, h: 1 });
    expect(findConflicts([rug], ROOM)).toEqual({ rug: 'Outside the room' });
  });

  it('uses the rotated footprint when testing overlap', () => {
    const b = item({ id: 'b', name: 'Crate', y: 20, w: 10, d: 10 });
    // Unrotated 40×10 spans y 0–10 and misses the crate at y 20–30.
    const flat = item({ id: 'a', name: 'Bench', w: 40, d: 10, rot: 0 });
    expect(findConflicts([flat, b], ROOM)).toEqual({});
    // Rotated, the footprint is 10×40 and spans y 0–40, covering the crate.
    const turned = item({ id: 'a', name: 'Bench', w: 40, d: 10, rot: 1 });
    expect(findConflicts([turned, b], ROOM)).toEqual({
      a: 'Overlaps Crate',
      b: 'Overlaps Bench',
    });
  });

  it('names the first overlapping item in array order', () => {
    const a = item({ id: 'a', name: 'A', w: 30, d: 30 });
    const b = item({ id: 'b', name: 'B', x: 20, w: 10, d: 10 });
    const c = item({ id: 'c', name: 'C', y: 20, w: 10, d: 10 });
    expect(findConflicts([a, b, c], ROOM).a).toBe('Overlaps B');
    expect(findConflicts([a, c, b], ROOM).a).toBe('Overlaps C');
  });
});
