import { describe, expect, it } from 'vitest';
import { createInitialDocument } from './catalog';
import { conflictsAmong, findConflicts, type ConflictEntry } from './conflicts';
import type { Footprint } from './shape';
import type { Item, Point, Room } from './types';

const ROOM: Room = { w: 144, l: 168, h: 96 };

/** The 144×168 rectangle as an outline. */
const RECT: readonly Point[] = [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 168 }, { x: 0, y: 168 }];

/** An L-shaped outline whose reflex corner is at (72, 84). */
const L_SHAPE: readonly Point[] = [
  { x: 0, y: 0 }, { x: 72, y: 0 }, { x: 72, y: 84 }, { x: 144, y: 84 }, { x: 144, y: 168 }, { x: 0, y: 168 },
];

const HEIGHT = 96;

/** A 20×20 box entry, 30 in tall, centred at (40, 40) at 0°; override any field per test. */
function entry(id: string, fp: Partial<Footprint> = {}, overrides: Partial<Omit<ConflictEntry, 'fp'>> = {}): ConflictEntry {
  return {
    id, name: `Entry ${id}`, kind: 'box', h: 30,
    fp: { cx: 40, cy: 40, w: 20, d: 20, angle: 0, ...fp },
    ...overrides,
  };
}

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

describe('conflictsAmong', () => {
  it('flags an entry whose footprint corners leave the outline', () => {
    const a = entry('a', { cx: 140 }); // spans x 130–150, past the 144 wall
    expect(conflictsAmong([a], RECT, HEIGHT)).toEqual({ a: 'Outside the room' });
  });

  it('reports nothing for a footprint flush against the walls', () => {
    const bed = entry('bed', { cx: 72, cy: 42.5, w: 64, d: 85, angle: 0 });
    expect(conflictsAmong([bed], RECT, HEIGHT)).toEqual({});
  });

  it('flags a footprint that covers the reflex corner of an L-shaped room', () => {
    const a = entry('a', { cx: 75, cy: 85, w: 30, d: 30, angle: 0 });
    expect(conflictsAmong([a], L_SHAPE, HEIGHT)).toEqual({ a: 'Outside the room' });
  });

  it('flags an entry taller than the ceiling', () => {
    const a = entry('a', {}, { h: 97 });
    expect(conflictsAmong([a], RECT, HEIGHT)).toEqual({ a: 'Taller than the ceiling' });
  });

  it('flags both entries when their footprints overlap, naming the other', () => {
    const a = entry('a', {}, { name: 'Left' });
    const b = entry('b', { cx: 55 }, { name: 'Right' }); // 5 in of overlap
    expect(conflictsAmong([a, b], RECT, HEIGHT)).toEqual({ a: 'Overlaps Right', b: 'Overlaps Left' });
  });

  it('names the first other overlapping entry in array order', () => {
    const a = entry('a', { w: 30, d: 30 });
    const b = entry('b', { cx: 50 }, { name: 'B' });
    const c = entry('c', { cy: 50 }, { name: 'C' });
    expect(conflictsAmong([a, b, c], RECT, HEIGHT).a).toBe('Overlaps B');
    expect(conflictsAmong([a, c, b], RECT, HEIGHT).a).toBe('Overlaps C');
  });

  it('does not flag two square entries 23 in apart at 0°', () => {
    const a = entry('a');
    const b = entry('b', { cx: 63 }); // 10 + 10 < 23
    expect(conflictsAmong([a, b], RECT, HEIGHT)).toEqual({});
  });

  it('flags the same pair once the second is turned 45°', () => {
    const a = entry('a', {}, { name: 'Square' });
    const b = entry('b', { cx: 63, angle: 45 }, { name: 'Diamond' }); // 14.142 + 10 > 23
    expect(conflictsAmong([a, b], RECT, HEIGHT)).toEqual({ a: 'Overlaps Diamond', b: 'Overlaps Square' });
  });

  it('lets an entry sit on a rug without flagging either', () => {
    const rug = entry('rug', { cx: 50, cy: 50, w: 60, d: 40 }, { kind: 'rug', h: 1 });
    const sofa = entry('sofa', { cx: 50, cy: 50, w: 40, d: 20 }, { kind: 'sofa' });
    expect(conflictsAmong([rug, sofa], RECT, HEIGHT)).toEqual({});
    expect(conflictsAmong([sofa, rug], RECT, HEIGHT)).toEqual({});
  });

  it('still checks a rug against the outline and the height', () => {
    const outside = entry('out', { cx: 130, w: 60, d: 40 }, { kind: 'rug', h: 1 });
    const tall = entry('tall', { cx: 50, cy: 120 }, { kind: 'rug', h: 97 });
    expect(conflictsAmong([outside, tall], RECT, HEIGHT)).toEqual({
      out: 'Outside the room',
      tall: 'Taller than the ceiling',
    });
  });

  it('reports only outside for an entry that is both outside and overlapping', () => {
    const a = entry('a', { cx: 140 }, { name: 'Edge box', h: 120 });
    const b = entry('b', { cx: 125 }, { name: 'Inner box' }); // spans 115–135, overlaps a's 130–150
    expect(conflictsAmong([a, b], RECT, HEIGHT)).toEqual({ a: 'Outside the room', b: 'Overlaps Edge box' });
  });
});
