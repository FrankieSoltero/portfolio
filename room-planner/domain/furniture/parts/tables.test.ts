import { describe, expect, it } from 'vitest';
import { defaultStyle } from '../recipe';
import { buildParts } from './index';
import type { Part, PieceSize } from './types';

const EPS = 1e-6;
const DESK: PieceSize = { w: 55, d: 26, h: 30 };
const TABLE: PieceSize = { w: 44, d: 24, h: 16 };

const top = (p: Part) => p.z0 + p.sz;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/** Desk top thickness: clamp(0.05 h, 0.75, 2). */
const deskTopThick = (size: PieceSize) => Math.min(Math.max(0.05 * size.h, 0.75), 2);

function desk(change: Record<string, string> = {}, size: PieceSize = DESK): Part[] {
  return buildParts('desk', size, { ...defaultStyle('desk'), ...change });
}

function table(change: Record<string, string> = {}, size: PieceSize = TABLE): Part[] {
  return buildParts('table', size, { ...defaultStyle('table'), ...change });
}

/** Foot bars (accent boxes on the floor) and posts (accent boxes above the floor). */
function trestleParts(parts: readonly Part[]): { feet: Part[]; posts: Part[] } {
  const boxes = parts.filter((p) => p.slot === 'accent' && p.shape === 'box' && p.detail !== true);
  return { feet: boxes.filter((p) => p.z0 === 0), posts: boxes.filter((p) => p.z0 > 0) };
}

/** Drawer boxes: main, non-detail parts hanging from the underside of the desk top. */
function drawerBoxes(parts: readonly Part[], size: PieceSize): Part[] {
  const underside = size.h - deskTopThick(size);
  return parts.filter((p) => p.slot === 'main' && p.detail !== true && p.z0 > 0 && near(top(p), underside));
}

/** The table top: the part whose top is the piece's top. */
function tableTop(parts: readonly Part[], size: PieceSize): Part[] {
  return parts.filter((p) => near(top(p), size.h));
}

describe('desk', () => {
  it('stands on four metal legs, two trestles, or two full-depth side panels', () => {
    const legs = desk({ supports: 'legs' }).filter((p) => p.shape === 'cylinder');
    expect(legs).toHaveLength(4);
    for (const leg of legs) expect(leg.slot).toBe('accent');

    const { feet, posts } = trestleParts(desk({ supports: 'trestle' }));
    expect(feet).toHaveLength(2);
    expect(posts).toHaveLength(2);
    for (const f of feet) expect(f.sy).toBeCloseTo(0.8 * DESK.d, 6);
    for (const p of posts) {
      expect(p.cy).toBeCloseTo(0, 6);
      expect(top(p)).toBeCloseTo(DESK.h - deskTopThick(DESK), 6);
    }

    const panels = desk({ supports: 'panels' }).filter((p) => p.slot === 'main' && p.z0 === 0);
    expect(panels).toHaveLength(2);
    for (const p of panels) expect(p.sy).toBeCloseTo(DESK.d, 6);
  });

  it.each([
    ['none', 0, 0],
    ['left', 1, 0],
    ['right', 0, 1],
    ['both', 1, 1],
  ])('hangs %s drawers under the top', (drawers, left, right) => {
    const parts = desk({ drawers });
    const boxes = drawerBoxes(parts, DESK);
    expect(boxes.filter((p) => p.cx < 0)).toHaveLength(left);
    expect(boxes.filter((p) => p.cx > 0)).toHaveLength(right);
    const handles = parts.filter((p) => p.detail === true);
    expect(handles).toHaveLength(left + right);
    for (const hd of handles) expect(hd.slot).toBe('accent');
  });

  it('draws both drawers as one on the right below 30 wide and none below 20', () => {
    const narrow: PieceSize = { ...DESK, w: 28 };
    const boxes = drawerBoxes(desk({ drawers: 'both' }, narrow), narrow);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].cx).toBeGreaterThan(0);
    const tiny: PieceSize = { ...DESK, w: 18 };
    for (const drawers of ['left', 'right', 'both']) {
      expect(drawerBoxes(desk({ drawers }, tiny), tiny)).toHaveLength(0);
    }
  });
});

describe('table', () => {
  it('makes a rectangle top a rounded slab and a round top an elliptic cylinder', () => {
    const [rect] = tableTop(table({ top: 'rectangle' }), TABLE);
    expect(rect.shape).toBe('rounded');
    expect(rect.radius).toBeLessThanOrEqual(0.5);
    const [round] = tableTop(table({ top: 'round' }), TABLE);
    expect(round.shape).toBe('cylinder');
    expect(round.sx).toBe(44);
    expect(round.sy).toBe(24);
  });

  it('stands on four tapered legs, a pedestal, or two accent trestles', () => {
    const legs = table({ base: 'legs' }).filter((p) => p.shape === 'cylinder');
    expect(legs).toHaveLength(4);
    for (const leg of legs) expect(leg.taper).toBeDefined();

    const pedestal = table({ base: 'pedestal' }).filter((p) => p.shape === 'cylinder');
    expect(pedestal).toHaveLength(2);
    const [base, column] = [...pedestal].sort((a, b) => a.z0 - b.z0);
    expect(base.z0).toBe(0);
    expect(column.z0).toBeCloseTo(top(base), 6);
    expect(column.sx).toBeLessThan(base.sx);

    const { feet, posts } = trestleParts(table({ base: 'trestle' }));
    expect(feet).toHaveLength(2);
    expect(posts).toHaveLength(2);
  });

  it('adds a lower shelf at 0.3 h only when tall enough and not on a pedestal', () => {
    const shelves = (parts: readonly Part[], size: PieceSize) =>
      parts.filter((p) => p.slot === 'main' && near(p.z0, 0.3 * size.h));
    expect(shelves(table({ shelf: 'yes' }), TABLE)).toHaveLength(1);
    expect(shelves(table({ shelf: 'yes', base: 'trestle' }), TABLE)).toHaveLength(1);
    expect(shelves(table({ shelf: 'no' }), TABLE)).toHaveLength(0);
    const low: PieceSize = { ...TABLE, h: 10 };
    expect(shelves(table({ shelf: 'yes' }, low), low)).toHaveLength(0);
    expect(table({ shelf: 'yes' }, low)).toEqual(table({ shelf: 'no' }, low));
    expect(table({ shelf: 'yes', base: 'pedestal' })).toEqual(table({ shelf: 'no', base: 'pedestal' }));
  });

  it('keeps every leg centre of a round table under the ellipse of its top', () => {
    for (const size of [TABLE, { w: 30, d: 60, h: 29 }, { w: 48, d: 48, h: 30 }]) {
      const legs = table({ top: 'round', base: 'legs' }, size).filter((p) => p.shape === 'cylinder' && p.z0 === 0);
      expect(legs).toHaveLength(4);
      for (const leg of legs) {
        expect((leg.cx / (size.w / 2)) ** 2 + (leg.cy / (size.d / 2)) ** 2).toBeLessThanOrEqual(1);
      }
    }
  });
});

/** Every number of each part rounded to 1e-9 (and −0 made 0), so float noise does not count as a change. */
function rounded9(parts: readonly Part[]): Part[] {
  const r = (n: number) => Math.round(n * 1e9) / 1e9 + 0;
  return parts.map((p) => {
    const out: Part = { ...p, cx: r(p.cx), cy: r(p.cy), z0: r(p.z0), sx: r(p.sx), sy: r(p.sy), sz: r(p.sz) };
    if (p.radius !== undefined) out.radius = r(p.radius);
    return out;
  });
}

const RECT_TOP: Part = { shape: 'rounded', cx: 0, cy: 0, z0: 15.04, sx: 44, sy: 24, sz: 0.96, slot: 'main', radius: 0.48 };
const RECT_LEGS: Part[] = [-9.96, 9.96].flatMap((cy) =>
  [-19.96, 19.96].map((cx): Part => ({ shape: 'cylinder', cx, cy, z0: 0, sx: 1.68, sy: 1.68, sz: 15.04, slot: 'accent', taper: 0.55 })),
);
const RECT_PEDESTAL: Part[] = [
  { shape: 'cylinder', cx: 0, cy: 0, z0: 0, sx: 16.8, sy: 16.8, sz: 0.96, slot: 'accent' },
  { shape: 'cylinder', cx: 0, cy: 0, z0: 0.96, sx: 3.36, sy: 3.36, sz: 14.08, slot: 'accent' },
];
const RECT_TRESTLES: Part[] = [
  { shape: 'box', cx: -17.82, cy: 0, z0: 0, sx: 1.32, sy: 19.2, sz: 1.32, slot: 'accent' },
  { shape: 'box', cx: 17.82, cy: 0, z0: 0, sx: 1.32, sy: 19.2, sz: 1.32, slot: 'accent' },
  { shape: 'box', cx: -17.82, cy: 0, z0: 1.32, sx: 1.32, sy: 1.32, sz: 13.72, slot: 'accent' },
  { shape: 'box', cx: 17.82, cy: 0, z0: 1.32, sx: 1.32, sy: 1.32, sz: 13.72, slot: 'accent' },
];
const DESK_TOP: Part = { shape: 'box', cx: 0, cy: 0, z0: 28.5, sx: 55, sy: 26, sz: 1.5, slot: 'main' };
/** The right drawer box and its handle, centred at `cx`. */
const deskDrawer = (cx: number): Part[] => [
  { shape: 'box', cx, cy: 0, z0: 22.5, sx: 16.5, sy: 24, sz: 6, slot: 'main' },
  { shape: 'box', cx, cy: 12.25, z0: 25.125, sx: 5, sy: 0.5, sz: 0.75, slot: 'accent', detail: true },
];

describe('rectangle tops are unchanged by the round-top cuts', () => {
  // The parts as built before the round-top trestle and shelf cuts, at the typical sizes.
  it.each<[string, () => Part[], Part[]]>([
    ['desk on legs', () => desk({ supports: 'legs' }), [
      DESK_TOP,
      ...[-11.31, 11.31].flatMap((cy) =>
        [-25.81, 25.81].map((cx): Part => ({ shape: 'cylinder', cx, cy, z0: 0, sx: 0.91, sy: 0.91, sz: 28.5, slot: 'accent' })),
      ),
      ...deskDrawer(17.105),
    ]],
    ['desk on trestles', () => desk({ supports: 'trestle' }), [
      DESK_TOP,
      { shape: 'box', cx: -22.275, cy: 0, z0: 0, sx: 1.65, sy: 20.8, sz: 1.65, slot: 'accent' },
      { shape: 'box', cx: 22.275, cy: 0, z0: 0, sx: 1.65, sy: 20.8, sz: 1.65, slot: 'accent' },
      { shape: 'box', cx: -22.275, cy: 0, z0: 1.65, sx: 1.65, sy: 1.65, sz: 26.85, slot: 'accent' },
      { shape: 'box', cx: 22.275, cy: 0, z0: 1.65, sx: 1.65, sy: 1.65, sz: 26.85, slot: 'accent' },
      ...deskDrawer(13.2),
    ]],
    ['desk on panels', () => desk({ supports: 'panels' }), [
      DESK_TOP,
      { shape: 'box', cx: -26.8125, cy: 0, z0: 0, sx: 1.375, sy: 26, sz: 28.5, slot: 'main' },
      { shape: 'box', cx: 26.8125, cy: 0, z0: 0, sx: 1.375, sy: 26, sz: 28.5, slot: 'main' },
      ...deskDrawer(17.875),
    ]],
    ['table on legs with a shelf', () => table({ top: 'rectangle', base: 'legs', shelf: 'yes' }), [
      RECT_TOP, ...RECT_LEGS,
      { shape: 'box', cx: 0, cy: 0, z0: 4.8, sx: 39.92, sy: 19.92, sz: 0.72, slot: 'main' },
    ]],
    ['table on legs without a shelf', () => table({ top: 'rectangle', base: 'legs', shelf: 'no' }), [RECT_TOP, ...RECT_LEGS]],
    ['table on a pedestal with a shelf', () => table({ top: 'rectangle', base: 'pedestal', shelf: 'yes' }), [RECT_TOP, ...RECT_PEDESTAL]],
    ['table on a pedestal without a shelf', () => table({ top: 'rectangle', base: 'pedestal', shelf: 'no' }), [RECT_TOP, ...RECT_PEDESTAL]],
    ['table on trestles with a shelf', () => table({ top: 'rectangle', base: 'trestle', shelf: 'yes' }), [
      RECT_TOP, ...RECT_TRESTLES,
      { shape: 'box', cx: 0, cy: 0, z0: 4.8, sx: 35.64, sy: 16.8, sz: 0.72, slot: 'main' },
    ]],
    ['table on trestles without a shelf', () => table({ top: 'rectangle', base: 'trestle', shelf: 'no' }), [RECT_TOP, ...RECT_TRESTLES]],
  ])('%s', (_name, build, expected) => {
    expect(rounded9(build())).toEqual(expected);
  });
});

describe('round table top', () => {
  /** (x, y) measured against the ellipse of `top`: at most 1 inside it. */
  const inTop = (top: Part, x: number, y: number) => ((x - top.cx) / (top.sx / 2)) ** 2 + ((y - top.cy) / (top.sy / 2)) ** 2;

  /** Points on a part's top-view outline: its rectangle's corners, or for a cylinder points round its ellipse. */
  function outline(p: Part): [number, number][] {
    if (p.shape !== 'cylinder') {
      return [-1, 1].flatMap((sx) => [-1, 1].map((sy): [number, number] => [p.cx + (sx * p.sx) / 2, p.cy + (sy * p.sy) / 2]));
    }
    return Array.from({ length: 720 }, (_, i): [number, number] => {
      const a = (i / 720) * 2 * Math.PI;
      return [p.cx + (Math.cos(a) * p.sx) / 2, p.cy + (Math.sin(a) * p.sy) / 2];
    });
  }

  const SIZES: PieceSize[] = [TABLE, { w: 48, d: 48, h: 30 }, { w: 36, d: 36, h: 17 }, { w: 96, d: 30, h: 30 }];
  const cases = SIZES.flatMap((size) =>
    ['legs', 'pedestal', 'trestle'].flatMap((base) => ['yes', 'no'].map((shelf) => ({ size, base, shelf }))),
  );

  it.each(cases)('keeps every part of a $size.w × $size.d × $size.h table on $base with shelf $shelf under the top', ({ size, base, shelf }) => {
    const parts = table({ top: 'round', base, shelf }, size);
    const [tops, rest] = [tableTop(parts, size), parts.filter((p) => !near(top(p), size.h))];
    expect(tops).toHaveLength(1);
    expect(rest.length).toBeGreaterThan(0);
    for (const p of rest) {
      for (const [x, y] of outline(p)) expect(inTop(tops[0], x, y)).toBeLessThanOrEqual(1 + EPS);
    }
  });
});
