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
