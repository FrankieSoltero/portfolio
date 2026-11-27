import { describe, expect, it } from 'vitest';
import type { Kind, StyleValues } from '../../types';
import { STYLE_OPTIONS, TYPICAL_SIZE, defaultStyle } from '../recipe';
import { buildParts } from './index';
import type { Part, PieceSize } from './types';

const EPS = 1e-6;
const SHELF: PieceSize = TYPICAL_SIZE.shelf;
const DRESSER: PieceSize = TYPICAL_SIZE.dresser;
const NIGHTSTAND: PieceSize = TYPICAL_SIZE.nightstand;
const TVSTAND: PieceSize = TYPICAL_SIZE.tvstand;

const top = (p: Part) => p.z0 + p.sz;
const front = (p: Part) => p.cy + p.sy / 2;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

function build(kind: Kind, change: Record<string, string>, size: PieceSize, seed = 1): Part[] {
  return buildParts(kind, size, { ...defaultStyle(kind), ...change }, seed);
}

/** Horizontal boards of a shelf (top, bottom and shelves): main parts thinner in z than across. */
function boards(parts: readonly Part[]): Part[] {
  return parts
    .filter((p) => p.slot === 'main' && p.detail !== true && p.sz < Math.min(p.sx, p.sy))
    .sort((a, b) => a.z0 - b.z0);
}

/** Book parts: detail parts in a book slot. */
function books(parts: readonly Part[]): Part[] {
  return parts.filter((p) => p.detail === true && p.slot.startsWith('book'));
}

/** Drawer fronts and doors: soft, non-detail parts. */
function fronts(parts: readonly Part[]): Part[] {
  return parts.filter((p) => p.slot === 'soft' && p.detail !== true);
}

/** Handles: accent detail parts. */
function handles(parts: readonly Part[]): Part[] {
  return parts.filter((p) => p.slot === 'accent' && p.detail === true);
}

/** Every option combination of `kind`. */
function everyStyle(kind: Kind): StyleValues[] {
  return STYLE_OPTIONS[kind].reduce<StyleValues[]>(
    (styles, o) => styles.flatMap((s) => o.values.map((v) => ({ ...s, [o.key]: v.value }))),
    [{}],
  );
}

/** Every broken invariant of one part list, as readable lines (empty when all hold). */
function violations(parts: readonly Part[], size: PieceSize): string[] {
  const bad: string[] = [];
  if (parts.length === 0) bad.push('no parts');
  if (parts.length > 200) bad.push(`${parts.length} parts`);
  if (books(parts).length > 150) bad.push(`${books(parts).length} books`);
  parts.forEach((p, i) => {
    if (![p.cx, p.cy, p.z0, p.sx, p.sy, p.sz].every(Number.isFinite)) bad.push(`#${i} not finite`);
    if (!(p.sx > 0 && p.sy > 0 && p.sz > 0)) bad.push(`#${i} extent ${p.sx} ${p.sy} ${p.sz}`);
    if (Math.abs(p.cx) + p.sx / 2 > size.w / 2 + EPS) bad.push(`#${i} outside in x`);
    if (Math.abs(p.cy) + p.sy / 2 > size.d / 2 + EPS) bad.push(`#${i} outside in y`);
    if (p.z0 < -EPS) bad.push(`#${i} below the floor`);
    if (top(p) > size.h + EPS) bad.push(`#${i} above the top`);
    if (p.radius !== undefined && (p.shape !== 'rounded' || p.radius > Math.min(p.sx, p.sy, p.sz) / 2 + EPS)) {
      bad.push(`#${i} radius ${p.radius}`);
    }
  });
  return bad;
}

describe('storage invariants over every option combination', () => {
  const kinds: Kind[] = ['shelf', 'dresser', 'nightstand', 'tvstand'];
  it.each(kinds)('%s: parts lie inside the piece with positive extents at every size', (kind) => {
    const sizes: PieceSize[] = [
      TYPICAL_SIZE[kind],
      { w: 0.25, d: 0.25, h: 0.25 },
      { w: 1, d: 1, h: 0.25 },
      { w: 720, d: 720, h: 720 },
      { w: 240, d: 12, h: 12 },
      { w: 12, d: 240, h: 40 },
      // Paper-thin in one direction and tall: a knob must still fit its front and the depth.
      { w: 0.25, d: 40, h: 40 },
      { w: 40, d: 0.25, h: 40 },
    ];
    for (const style of everyStyle(kind)) {
      for (const size of sizes) {
        for (const seed of [1, 2]) {
          const label = `${kind} ${JSON.stringify(style)} ${JSON.stringify(size)} seed ${seed}`;
          expect(violations(buildParts(kind, size, style, seed), size), label).toEqual([]);
        }
      }
    }
  });
});

describe('shelf', () => {
  const shelf = (change: Record<string, string> = {}, size: PieceSize = SHELF, seed = 1) => build('shelf', change, size, seed);

  it('picks clamp(round(h / 14), 2, 8) openings when shelves is auto', () => {
    expect(boards(shelf({ shelves: 'auto' }))).toHaveLength(7);
  });

  it('clamps an explicit count so every opening is at least 5 high', () => {
    const low: PieceSize = { ...SHELF, h: 30 };
    const b = boards(shelf({ shelves: '8' }, low));
    expect(b.length - 1).toBeGreaterThanOrEqual(1);
    expect(b.length - 1).toBeLessThan(8);
    for (let i = 1; i < b.length; i++) expect(b[i].z0 - top(b[i - 1])).toBeGreaterThanOrEqual(5 - EPS);
    expect(near(b[0].z0, 0)).toBe(true);
    expect(near(top(b[b.length - 1]), low.h)).toBe(true);
    expect(boards(shelf({ shelves: '2' }))).toHaveLength(3);
  });

  it('adds one thin panel at the back edge spanning the height only when back is yes', () => {
    const backPanels = (parts: readonly Part[]) =>
      parts.filter((p) => p.slot === 'main' && near(p.cy - p.sy / 2, -SHELF.d / 2) && p.sy < p.sx && near(p.sz, SHELF.h) && p.z0 === 0);
    const withBack = backPanels(shelf({ back: 'yes' }));
    expect(withBack).toHaveLength(1);
    expect(withBack[0].sy).toBeCloseTo(0.4, 6);
    expect(backPanels(shelf({ back: 'no' }))).toHaveLength(0);
  });

  it('fills each opening with books when books is yes, and none when no', () => {
    const parts = shelf({ books: 'yes' });
    const found = books(parts);
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(150);
    expect(books(shelf({ books: 'no' }))).toHaveLength(0);

    // Each opening: the books standing on a board span 55% to 95% of the width between the sides.
    const sides = parts.filter((p) => p.slot === 'main' && near(p.sz, SHELF.h) && p.sx < p.sy);
    expect(sides).toHaveLength(2);
    const inner = Math.min(...sides.map((p) => Math.abs(p.cx) - p.sx / 2)) * 2;
    for (const board of boards(parts).slice(0, -1)) {
      const row = found.filter((p) => near(p.z0, top(board)));
      expect(row.length).toBeGreaterThan(0);
      const span = Math.max(...row.map((p) => p.cx + p.sx / 2)) - Math.min(...row.map((p) => p.cx - p.sx / 2));
      expect(span / inner).toBeGreaterThanOrEqual(0.55 - EPS);
      expect(span / inner).toBeLessThanOrEqual(0.95 + EPS);
    }
  });

  it('keeps the books at most 150 on a huge shelf', () => {
    const huge: PieceSize = { w: 720, d: 720, h: 720 };
    const found = books(shelf({ shelves: '8', books: 'yes' }, huge));
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(150);
  });

  it('varies only the books with the seed', () => {
    const one = shelf({ books: 'yes' }, SHELF, 1);
    const two = shelf({ books: 'yes' }, SHELF, 2);
    expect(books(one)).not.toEqual(books(two));
    const solid = (parts: Part[]) => parts.filter((p) => p.detail !== true);
    expect(solid(one)).toEqual(solid(two));
  });
});

describe('dresser', () => {
  const dresser = (change: Record<string, string> = {}, size: PieceSize = DRESSER) => build('dresser', change, size);

  it('makes columns × rows drawer fronts, reduced so every front is at least 3 high and 5 wide', () => {
    expect(fronts(dresser({ columns: '2', rows: '3' }))).toHaveLength(6);
    expect(fronts(dresser({ columns: '3', rows: '6' }, { w: 60, d: 18, h: 34 }))).toHaveLength(18);
    const small = fronts(dresser({ columns: '3', rows: '6' }, { w: 12, d: 12, h: 12 }));
    expect(small.length).toBeGreaterThanOrEqual(1);
    expect(small.length).toBeLessThan(18);
    for (const f of small) {
      expect(f.sz).toBeGreaterThanOrEqual(3);
      expect(f.sx).toBeGreaterThanOrEqual(5);
    }
  });

  it('stands the fronts 0.4 proud of the body with 0.3 gaps between them', () => {
    const parts = dresser({ columns: '2', rows: '3' });
    const body = parts.filter((p) => p.slot === 'main');
    expect(body).toHaveLength(1);
    const all = fronts(parts);
    for (const f of all) {
      expect(f.sy).toBeCloseTo(0.4, 6);
      expect(f.cy - f.sy / 2).toBeCloseTo(front(body[0]), 6);
    }
    const left = all.filter((f) => f.cx < 0).sort((a, b) => a.z0 - b.z0);
    expect(left).toHaveLength(3);
    for (let i = 1; i < left.length; i++) expect(left[i].z0 - top(left[i - 1])).toBeCloseTo(0.3, 6);
    const bottomRow = all.filter((f) => near(f.z0, left[0].z0)).sort((a, b) => a.cx - b.cx);
    expect(bottomRow[1].cx - bottomRow[1].sx / 2 - (bottomRow[0].cx + bottomRow[0].sx / 2)).toBeCloseTo(0.3, 6);
  });

  it('puts one knob, one bar or no handle on each front', () => {
    const knobs = handles(dresser({ columns: '2', rows: '3', handles: 'knob' }));
    expect(knobs).toHaveLength(6);
    for (const k of knobs) expect(k.shape).toBe('cylinder');

    const barParts = dresser({ columns: '2', rows: '3', handles: 'bar' });
    const bars = handles(barParts);
    expect(bars).toHaveLength(6);
    const frontWidth = fronts(barParts)[0].sx;
    for (const b of bars) {
      expect(b.shape).toBe('box');
      expect(b.sx).toBeCloseTo(0.4 * frontWidth, 6);
    }

    expect(handles(dresser({ columns: '2', rows: '3', handles: 'none' }))).toHaveLength(0);
  });

  it('centres a knob clamp(0.06 w, 0.5, 1.25) across on its front, 0.5 proud', () => {
    for (const [w, diameter] of [[60, 1.25], [14, 0.84], [6, 0.5]] as const) {
      const size: PieceSize = { w, d: 18, h: 34 };
      const parts = dresser({ columns: '1', rows: '2', handles: 'knob' }, size);
      const all = fronts(parts);
      for (const k of handles(parts)) {
        expect(k.sx).toBeCloseTo(diameter, 6);
        const f = all.find((x) => near(x.cx, k.cx) && near(x.z0 + x.sz / 2, k.z0 + k.sz / 2));
        expect(f).toBeDefined();
        if (f !== undefined) expect(front(k) - front(f)).toBeCloseTo(0.5, 6);
      }
    }
  });

  it('stands on four tapered legs or a recessed plinth', () => {
    const legs = dresser({ base: 'legs' }).filter((p) => p.shape === 'cylinder' && p.detail !== true);
    expect(legs).toHaveLength(4);
    for (const leg of legs) {
      expect(leg.slot).toBe('accent');
      expect(leg.taper).toBeDefined();
      expect(leg.z0).toBe(0);
      expect(top(leg)).toBeCloseTo(0.14 * DRESSER.h, 6);
    }

    const parts = dresser({ base: 'plinth' });
    expect(parts.filter((p) => p.shape === 'cylinder' && p.detail !== true)).toHaveLength(0);
    const plinth = parts.filter((p) => p.slot === 'accent' && p.detail !== true);
    expect(plinth).toHaveLength(1);
    expect(plinth[0].shape).toBe('box');
    expect(plinth[0].z0).toBe(0);
    expect(plinth[0].sz).toBeCloseTo(0.08 * DRESSER.h, 6);
    const [body] = parts.filter((p) => p.slot === 'main');
    expect(front(body) - front(plinth[0])).toBeCloseTo(1, 6);
    expect(body.z0).toBeCloseTo(top(plinth[0]), 6);
  });
});

describe('nightstand', () => {
  const nightstand = (change: Record<string, string> = {}, size: PieceSize = NIGHTSTAND) => build('nightstand', change, size);
  const cabinetBottom = 0.14 * NIGHTSTAND.h;
  const half = cabinetBottom + (NIGHTSTAND.h - cabinetBottom) / 2;

  it.each([
    ['0', 0],
    ['1', 1],
    ['2', 2],
  ])('has %s drawers as that many fronts, each with a knob', (drawers, count) => {
    const parts = nightstand({ drawers });
    expect(fronts(parts)).toHaveLength(count);
    expect(handles(parts)).toHaveLength(count);
    for (const k of handles(parts)) expect(k.shape).toBe('cylinder');
  });

  it('is an open box with one shelf at half the cabinet height for 0 drawers', () => {
    const shelves = boards(nightstand({ drawers: '0' })).filter((p) => p.z0 > cabinetBottom + EPS && top(p) < NIGHTSTAND.h - EPS);
    expect(shelves).toHaveLength(1);
    expect(shelves[0].z0 + shelves[0].sz / 2).toBeCloseTo(half, 6);
  });

  it('puts one drawer over the top half and an open bay below for 1 drawer', () => {
    const parts = nightstand({ drawers: '1' });
    const [drawer] = fronts(parts);
    expect(drawer.z0).toBeGreaterThanOrEqual(half);
    expect(top(drawer)).toBeLessThanOrEqual(NIGHTSTAND.h);
    const middle = boards(parts).filter((p) => p.z0 > cabinetBottom + EPS && top(p) < NIGHTSTAND.h - EPS);
    expect(middle).toHaveLength(1);
  });

  it('makes two equal fronts for 2 drawers', () => {
    const [a, b] = fronts(nightstand({ drawers: '2' }));
    expect(a.sz).toBeCloseTo(b.sz, 6);
    expect(a.sx).toBeCloseTo(b.sx, 6);
  });
});

describe('tv stand', () => {
  const tvstand = (change: Record<string, string> = {}, size: PieceSize = TVSTAND) => build('tvstand', change, size);
  /** Dividers: upright main panels away from the sides. */
  const dividers = (parts: readonly Part[], size: PieceSize) =>
    parts.filter((p) => p.slot === 'main' && p.sx < p.sz && p.sx < p.sy && Math.abs(p.cx) + p.sx / 2 < size.w / 2 - EPS);

  it('splits the stand into bays with dividers, reduced until every bay is at least 8 wide', () => {
    expect(dividers(tvstand({ bays: '3' }, { ...TVSTAND, w: 60 }), { ...TVSTAND, w: 60 })).toHaveLength(2);
    const narrow: PieceSize = { ...TVSTAND, w: 20 };
    expect(dividers(tvstand({ bays: '4' }, narrow), narrow)).toHaveLength(1);
    expect(fronts(tvstand({ bays: '4', fronts: 'doors' }, narrow))).toHaveLength(2);
  });

  it('has no fronts when open, a door with a knob or a drawer with a bar per bay', () => {
    expect(fronts(tvstand({ bays: '3', fronts: 'open' }))).toHaveLength(0);
    expect(handles(tvstand({ bays: '3', fronts: 'open' }))).toHaveLength(0);

    const doors = tvstand({ bays: '3', fronts: 'doors' });
    expect(fronts(doors)).toHaveLength(3);
    expect(handles(doors)).toHaveLength(3);
    for (const k of handles(doors)) expect(k.shape).toBe('cylinder');

    const drawers = tvstand({ bays: '3', fronts: 'drawers' });
    expect(fronts(drawers)).toHaveLength(3);
    const bars = handles(drawers);
    expect(bars).toHaveLength(3);
    for (const b of bars) {
      expect(b.shape).toBe('box');
      expect(b.sx).toBeCloseTo(0.4 * fronts(drawers)[0].sx, 6);
    }
  });

  it('gives each open bay one shelf only when h is at least 14', () => {
    const inner = (parts: readonly Part[], size: PieceSize) =>
      boards(parts).filter((p) => p.z0 > 0.14 * size.h + 1 && top(p) < size.h - EPS);
    expect(inner(tvstand({ bays: '3', fronts: 'open' }), TVSTAND)).toHaveLength(3);
    const low: PieceSize = { ...TVSTAND, h: 12 };
    expect(inner(tvstand({ bays: '3', fronts: 'open' }, low), low)).toHaveLength(0);
  });
});
