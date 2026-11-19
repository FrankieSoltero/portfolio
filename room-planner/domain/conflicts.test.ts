import { describe, expect, it } from 'vitest';
import {
  BLOCKS_A_DOOR,
  COVERS_A_WINDOW,
  conflictsAmong,
  doorReservedArea,
  findConflicts,
  findPlanIssues,
  windowZone,
  type ConflictEntry,
} from './conflicts';
import { signedArea } from './polygon';
import type { Footprint } from './shape';
import { furnishedDocument, placedItem, rectRoom, type PlacedItemSpec } from '../test/fixtures';
import type { Door, Item, Obstacle, Point, WindowOpening } from './types';

const ROOM = rectRoom(144, 168, 96);

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

/** A plain 20×20×30 box in the room's top-left corner (centre (10, 10)); override any field per test. */
function item(overrides: Partial<PlacedItemSpec> & Pick<PlacedItemSpec, 'id'>): Item {
  return placedItem({ w: 20, d: 20, h: 30, cx: 10, cy: 10, ...overrides });
}

describe('findConflicts', () => {
  it('reports nothing for the furnished plan\'s bed and desk', () => {
    const doc = furnishedDocument();
    expect(findConflicts(doc.items, doc.room)).toEqual({});
  });

  it('flags an item whose footprint runs past the right wall', () => {
    const a = item({ id: 'a', cx: 135 }); // 125 + 20 = 145 > 144
    expect(findConflicts([a], ROOM)).toEqual({ a: 'Outside the room' });
  });

  it('flags an item at a negative coordinate', () => {
    const a = item({ id: 'a', cx: 9 });
    expect(findConflicts([a], ROOM)).toEqual({ a: 'Outside the room' });
  });

  it('flags an item taller than the ceiling', () => {
    const a = item({ id: 'a', cx: 20, cy: 20, h: 100 });
    expect(findConflicts([a], ROOM)).toEqual({ a: 'Taller than the ceiling' });
  });

  it('reports outside rather than too tall when both apply', () => {
    const a = item({ id: 'a', cx: 9, h: 100 });
    expect(findConflicts([a], ROOM)).toEqual({ a: 'Outside the room' });
  });

  it('reports too tall rather than an overlap when both apply', () => {
    const a = item({ id: 'a', name: 'Tall cabinet', h: 100 });
    const b = item({ id: 'b', cx: 20, cy: 20 });
    expect(findConflicts([a, b], ROOM)).toEqual({
      a: 'Taller than the ceiling',
      b: 'Overlaps Tall cabinet',
    });
  });

  it('flags both items when two boxes overlap by 1 in', () => {
    const a = item({ id: 'a', name: 'Left box' });
    const b = item({ id: 'b', name: 'Right box', cx: 29 });
    expect(findConflicts([a, b], ROOM)).toEqual({
      a: 'Overlaps Right box',
      b: 'Overlaps Left box',
    });
  });

  it('does not flag boxes that share an edge exactly', () => {
    const a = item({ id: 'a' });
    const b = item({ id: 'b', cx: 30 });
    expect(findConflicts([a, b], ROOM)).toEqual({});
  });

  it('lets furniture sit on a rug without flagging either', () => {
    const rug = item({ id: 'rug', kind: 'rug', name: 'Wool rug', w: 60, d: 40, h: 1, cx: 30, cy: 20 });
    const sofa = item({ id: 'sofa', kind: 'sofa', name: 'Sofa', w: 40, d: 20, cx: 30, cy: 20 });
    expect(findConflicts([rug, sofa], ROOM)).toEqual({});
    expect(findConflicts([sofa, rug], ROOM)).toEqual({});
  });

  it('still flags a rug that runs past a wall', () => {
    const rug = item({ id: 'rug', kind: 'rug', w: 60, d: 40, h: 1, cx: 130, cy: 20 });
    expect(findConflicts([rug], ROOM)).toEqual({ rug: 'Outside the room' });
  });

  it('uses the rotated footprint when testing overlap', () => {
    const b = item({ id: 'b', name: 'Crate', w: 10, d: 10, cx: 5, cy: 25 });
    // Unrotated 40×10 spans y 0–10 and misses the crate at y 20–30.
    const flat = item({ id: 'a', name: 'Bench', w: 40, d: 10, cx: 20, cy: 5, angle: 0 });
    expect(findConflicts([flat, b], ROOM)).toEqual({});
    // Rotated, the footprint is 10×40 and spans y 0–40, covering the crate.
    const turned = item({ id: 'a', name: 'Bench', w: 40, d: 10, cx: 5, cy: 20, angle: 90 });
    expect(findConflicts([turned, b], ROOM)).toEqual({
      a: 'Overlaps Crate',
      b: 'Overlaps Bench',
    });
  });

  it('names the first overlapping item in array order', () => {
    const a = item({ id: 'a', name: 'A', w: 30, d: 30, cx: 15, cy: 15 });
    const b = item({ id: 'b', name: 'B', w: 10, d: 10, cx: 25, cy: 5 });
    const c = item({ id: 'c', name: 'C', w: 10, d: 10, cx: 5, cy: 25 });
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

/** Door D1 of the brief: on the top wall c1, 20 in from (0, 0), 32 in wide, swinging in from its start. */
const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };

/** A window on the right wall c2, spanning y 100–136; its zone is x 138–144. */
function windowOnC2(sill: number): WindowOpening {
  return { id: 'w1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill, height: 48 };
}

/** The 20 × 20 × 30 `Radiator` box on the floor at the seed bed's centre; override any field per test. */
function box(overrides: Partial<Obstacle> = {}): Obstacle {
  return {
    id: 'ob', shape: 'box', label: 'Radiator', x: 72, y: 42.5, rotation: 0,
    width: 20, depth: 20, height: 30, elevation: 0, ...overrides,
  };
}

/** A 12 in round column, as tall as the room, centred at (x, y). */
function column(id: string, x: number, y: number): Obstacle {
  return { id, shape: 'cylinder', label: 'Column', x, y, rotation: 0, width: 12, depth: 12, height: 96, elevation: 0 };
}

/** The furnished plan's bed and desk. */
function seedItems(): Item[] {
  return furnishedDocument().items;
}

function seedBed(): Item {
  return seedItems()[0];
}

/** True when some point of `pts` is within 0.001 of `p` on both axes. */
function hasPoint(pts: readonly Point[], p: Point): boolean {
  return pts.some((q) => Math.abs(q.x - p.x) < 1e-3 && Math.abs(q.y - p.y) < 1e-3);
}

function expectPoint(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 3);
  expect(actual.y).toBeCloseTo(expected.y, 3);
}

describe('reason constants', () => {
  it('names the door and window reasons', () => {
    expect(BLOCKS_A_DOOR).toBe('Blocks a door');
    expect(COVERS_A_WINDOW).toBe('Covers a window');
  });
});

describe('doorReservedArea', () => {
  it('is the hinge point and a 9-point quarter arc for a door swinging in from its start', () => {
    const area = doorReservedArea(D1, ROOM.outline);
    expect(area).not.toBeNull();
    const pts = area ?? [];
    expect(pts).toHaveLength(10);
    expectPoint(pts[0], { x: 20, y: 0 });
    expectPoint(pts[1], { x: 52, y: 0 });
    expectPoint(pts[5], { x: 42.627, y: 22.627 });
    expectPoint(pts[9], { x: 20, y: 32 });
    expect(signedArea(pts)).toBeGreaterThan(0);
  });

  it('swings from the far end, with positive area, for a door hinged at its end', () => {
    const pts = doorReservedArea({ ...D1, hinge: 'end' }, ROOM.outline) ?? [];
    expect(pts).toHaveLength(10);
    expect(hasPoint(pts, { x: 52, y: 0 })).toBe(true);
    expect(hasPoint(pts, { x: 20, y: 0 })).toBe(true);
    expect(hasPoint(pts, { x: 52, y: 32 })).toBe(true);
    expect(hasPoint(pts, { x: 29.373, y: 22.627 })).toBe(true);
    expect(signedArea(pts)).toBeGreaterThan(0);
  });

  it('is a 24 in deep strip inside the wall for a door swinging out', () => {
    const pts = doorReservedArea({ ...D1, swing: 'out' }, ROOM.outline);
    expect(pts).toEqual([{ x: 20, y: 0 }, { x: 52, y: 0 }, { x: 52, y: 24 }, { x: 20, y: 24 }]);
    expect(signedArea(pts ?? [])).toBeGreaterThan(0);
  });

  it('is null for a door on a wall that is not in the outline', () => {
    expect(doorReservedArea({ ...D1, wallId: 'zz' }, ROOM.outline)).toBeNull();
  });
});

describe('windowZone', () => {
  it('is a 6 in deep strip inside the wall', () => {
    const pts = windowZone(windowOnC2(36), ROOM.outline);
    expect(pts).toEqual([{ x: 144, y: 100 }, { x: 144, y: 136 }, { x: 138, y: 136 }, { x: 138, y: 100 }]);
    expect(signedArea(pts ?? [])).toBeGreaterThan(0);
  });

  it('is null for a window on a wall that is not in the outline', () => {
    expect(windowZone({ ...windowOnC2(36), wallId: 'zz' }, ROOM.outline)).toBeNull();
  });
});

describe('findPlanIssues: doors', () => {
  it('flags the seed bed inside the swing of D1', () => {
    const { conflicts } = findPlanIssues(seedItems(), ROOM, [D1], []);
    expect(conflicts).toEqual({ 'seed-bed': 'Blocks a door' });
  });

  it('flags nothing for a door on c4 whose arc stops at x = 32', () => {
    const door: Door = { ...D1, id: 'd4', wallId: 'c4', offset: 60 };
    expect(findPlanIssues(seedItems(), ROOM, [door], [])).toEqual({ conflicts: {}, warnings: {} });
  });

  it('flags the seed bed in the 24 in strip of a door swinging out', () => {
    const { conflicts } = findPlanIssues([seedBed()], ROOM, [{ ...D1, swing: 'out' }], []);
    expect(conflicts).toEqual({ 'seed-bed': 'Blocks a door' });
  });

  it('flags the seed bed in the swing of D1 hinged at its end', () => {
    const { conflicts } = findPlanIssues([seedBed()], ROOM, [{ ...D1, hinge: 'end' }], []);
    expect(conflicts).toEqual({ 'seed-bed': 'Blocks a door' });
  });

  it('lets a rug lie in the arc of a door', () => {
    const rug = item({ id: 'rug', kind: 'rug', name: 'Wool rug', w: 40, d: 30, h: 1, cx: 40, cy: 20 });
    expect(findPlanIssues([rug], ROOM, [D1], [])).toEqual({ conflicts: {}, warnings: {} });
  });
});

describe('findPlanIssues: windows', () => {
  it('does not warn about the seed desk below a 36 in sill', () => {
    const { conflicts, warnings } = findPlanIssues(seedItems(), ROOM, [windowOnC2(36)], []);
    expect(warnings).toEqual({});
    expect(conflicts).toEqual({});
  });

  it('warns, without a conflict, about the seed desk above a 24 in sill', () => {
    const { conflicts, warnings } = findPlanIssues(seedItems(), ROOM, [windowOnC2(24)], []);
    expect(warnings).toEqual({ 'seed-desk': 'Covers a window' });
    expect(conflicts['seed-desk']).toBeUndefined();
  });

  it('does not warn about furniture that ends 0.1 in short of the window zone', () => {
    const near = item({ id: 'near', w: 20, d: 20, h: 40, cx: 127.9, cy: 120 }); // x 117.9–137.9
    expect(findPlanIssues([near], ROOM, [windowOnC2(24)], [])).toEqual({ conflicts: {}, warnings: {} });
  });

  it('warns about a rug taller than the sill', () => {
    const rug = item({ id: 'rug', kind: 'rug', w: 20, d: 20, h: 30, cx: 130, cy: 120 });
    expect(findPlanIssues([rug], ROOM, [windowOnC2(24)], []).warnings).toEqual({ rug: 'Covers a window' });
  });
});

describe('findPlanIssues: furniture against obstacles', () => {
  it('flags the seed bed over the Radiator box', () => {
    const { conflicts } = findPlanIssues(seedItems(), ROOM, [], [box()]);
    expect(conflicts).toEqual({ 'seed-bed': 'Overlaps Radiator' });
  });

  it('names an unlabelled obstacle as the planner does: Box or Column', () => {
    const { conflicts } = findPlanIssues(seedItems(), ROOM, [], [box({ label: '' })]);
    expect(conflicts).toEqual({ 'seed-bed': 'Overlaps Box' });
    const column: Obstacle = { ...box({ label: '' }), shape: 'cylinder', depth: 20 };
    expect(findPlanIssues(seedItems(), ROOM, [], [column]).conflicts).toEqual({ 'seed-bed': 'Overlaps Column' });
  });

  it('does not flag furniture that shares an edge with an obstacle, and flags it 1 in further in', () => {
    // The Radiator moved to y 120 spans x 62–82; the crate spans x 42–62, so they share the edge x = 62.
    const radiator = box({ y: 120 });
    const crate = item({ id: 'crate', name: 'Crate', w: 20, d: 20, h: 30, cx: 52, cy: 120 });
    expect(findPlanIssues([crate], ROOM, [], [radiator])).toEqual({ conflicts: {}, warnings: {} });
    const inside = item({ id: 'crate', name: 'Crate', w: 20, d: 20, h: 30, cx: 53, cy: 120 });
    expect(findPlanIssues([inside], ROOM, [], [radiator])).toEqual({ conflicts: { crate: 'Overlaps Radiator' }, warnings: {} });
  });

  it('lets the 38 in bed fit under the box raised to 40 in', () => {
    expect(findPlanIssues(seedItems(), ROOM, [], [box({ elevation: 40 })])).toEqual({ conflicts: {}, warnings: {} });
  });

  it('flags the 38 in bed under the box raised to only 30 in', () => {
    const { conflicts } = findPlanIssues(seedItems(), ROOM, [], [box({ elevation: 30 })]);
    expect(conflicts).toEqual({ 'seed-bed': 'Overlaps Radiator' });
  });

  it('names the first overlapping obstacle in list order', () => {
    const first = box({ id: 'ob1', label: 'First' });
    const second = box({ id: 'ob2', label: 'Second', x: 60 });
    expect(findPlanIssues([seedBed()], ROOM, [], [first, second]).conflicts['seed-bed']).toBe('Overlaps First');
    expect(findPlanIssues([seedBed()], ROOM, [], [second, first]).conflicts['seed-bed']).toBe('Overlaps Second');
  });

  it('lets a rug lie under an obstacle', () => {
    const rug = item({ id: 'rug', kind: 'rug', w: 40, d: 40, h: 1, cx: 72, cy: 120 });
    expect(findPlanIssues([rug], ROOM, [], [box({ y: 120 })])).toEqual({ conflicts: {}, warnings: {} });
  });

  it('reports a furniture overlap before the obstacle and door checks', () => {
    const crate = item({ id: 'crate', name: 'Crate', w: 20, d: 20, h: 30, cx: 72, cy: 42.5 });
    const { conflicts } = findPlanIssues([seedBed(), crate], ROOM, [D1], [box()]);
    expect(conflicts['seed-bed']).toBe('Overlaps Crate');
  });

  it('reports an obstacle overlap before the door check', () => {
    const { conflicts } = findPlanIssues([seedBed()], ROOM, [D1], [box()]);
    expect(conflicts['seed-bed']).toBe('Overlaps Radiator');
  });
});

describe('findPlanIssues: obstacles', () => {
  it('flags an obstacle that runs past a wall', () => {
    const out = box({ id: 'out', x: 140, y: 84, width: 24, depth: 24 });
    expect(findPlanIssues([], ROOM, [], [out]).conflicts).toEqual({ out: 'Outside the room' });
  });

  it('flags an obstacle whose top is above the ceiling, and not one that reaches it exactly', () => {
    const tall = box({ id: 'tall', y: 120, height: 60, elevation: 40 });
    expect(findPlanIssues([], ROOM, [], [tall]).conflicts).toEqual({ tall: 'Taller than the ceiling' });
    expect(findPlanIssues([], ROOM, [], [{ ...tall, height: 56 }]).conflicts).toEqual({});
  });

  it('reports outside rather than too tall when both apply', () => {
    const both = box({ id: 'both', x: 140, y: 84, width: 24, depth: 24, height: 200 });
    expect(findPlanIssues([], ROOM, [], [both]).conflicts).toEqual({ both: 'Outside the room' });
  });

  it('flags a column in the swing of D1', () => {
    expect(findPlanIssues([], ROOM, [D1], [column('col', 36, 14)]).conflicts).toEqual({ col: 'Blocks a door' });
  });

  it('does not flag a box in the swing that starts at the top of the door, and flags one starting below it', () => {
    const shelf = box({ id: 'shelf', x: 36, y: 14, width: 10, depth: 10, height: 10, elevation: 80 });
    expect(findPlanIssues([], ROOM, [D1], [shelf]).conflicts).toEqual({});
    expect(findPlanIssues([], ROOM, [D1], [{ ...shelf, elevation: 79 }]).conflicts).toEqual({ shelf: 'Blocks a door' });
  });

  it('does not flag obstacles that overlap each other', () => {
    const a = box({ id: 'a', y: 120 });
    const b = box({ id: 'b', x: 80, y: 120 });
    expect(findPlanIssues([], ROOM, [], [a, b]).conflicts).toEqual({});
  });
});

describe('findPlanIssues: openings', () => {
  it('flags a door taller than the ceiling', () => {
    const door: Door = { ...D1, id: 'tall-door', wallId: 'c3', height: 100 };
    expect(findPlanIssues([], ROOM, [door], []).conflicts).toEqual({ 'tall-door': 'Taller than the ceiling' });
  });

  it('flags a window whose top is above the ceiling, and not one whose top meets it', () => {
    const high: WindowOpening = { ...windowOnC2(60), id: 'high' }; // 60 + 48 = 108
    const flush: WindowOpening = { ...windowOnC2(48), id: 'flush', offset: 20 }; // 48 + 48 = 96
    expect(findPlanIssues([], ROOM, [high, flush], []).conflicts).toEqual({ high: 'Taller than the ceiling' });
  });

  it('ignores openings on a wall that is not in the outline', () => {
    const door: Door = { ...D1, id: 'dz', wallId: 'zz', height: 100 };
    const win: WindowOpening = { ...windowOnC2(0), id: 'wz', wallId: 'zz', height: 200 };
    const obstacles = [column('col', 28, 14)]; // x 22–34: in D1's swing were D1 on c1, clear of the bed
    expect(() => findPlanIssues(seedItems(), ROOM, [door, win], obstacles)).not.toThrow();
    expect(findPlanIssues(seedItems(), ROOM, [door, win], obstacles)).toEqual({ conflicts: {}, warnings: {} });
  });

  it('keeps furniture, obstacle and opening ids in one conflicts map', () => {
    const tallDoor: Door = { ...D1, height: 100 };
    const out = box({ id: 'out', x: 140, y: 84, width: 24, depth: 24 });
    expect(findPlanIssues([seedBed()], ROOM, [tallDoor], [out]).conflicts).toEqual({
      'seed-bed': 'Blocks a door',
      out: 'Outside the room',
      d1: 'Taller than the ceiling',
    });
  });
});

describe('findPlanIssues with no openings or obstacles', () => {
  it('gives the conflicts of findConflicts and no warnings', () => {
    const items = [item({ id: 'a', name: 'Left box' }), item({ id: 'b', name: 'Right box', cx: 29 }), item({ id: 'c', cx: 135 })];
    const issues = findPlanIssues(items, ROOM, [], []);
    expect(issues.conflicts).toEqual(findConflicts(items, ROOM));
    expect(issues.conflicts).toEqual({ a: 'Overlaps Right box', b: 'Overlaps Left box', c: 'Outside the room' });
    expect(issues.warnings).toEqual({});
  });
});
