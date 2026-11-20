import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item, Kind } from '../types';
import { buildParts } from './parts';
import { box, cylinder, type Part } from './parts/types';
import { fillsFootprint, planParts } from './planParts';
import { KIND_ORDER, TYPICAL_SIZE, defaultStyle } from './recipe';

// The real builders by default; single tests hand-make the parts, so that kinds whose builders
// are still being written (books, handles, round rugs) can be shown without their geometry.
vi.mock('./parts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./parts')>();
  return { ...actual, buildParts: vi.fn(actual.buildParts) };
});

afterEach(() => {
  vi.mocked(buildParts).mockClear();
});

type PieceSpec = Pick<Item, 'id' | 'kind' | 'w' | 'd' | 'h' | 'style'>;

/** A piece of `kind` at its typical size in its default style, with `style` over it. */
function piece(kind: Kind, style: Record<string, string> = {}): PieceSpec {
  return { id: `${kind}-1`, kind, ...TYPICAL_SIZE[kind], style: { ...defaultStyle(kind), ...style } };
}

/** The next buildParts call returns `parts` instead of the kind's own. */
function nextParts(parts: Part[]): void {
  vi.mocked(buildParts).mockReturnValueOnce(parts);
}

describe('planParts', () => {
  it('gives fractions inside the footprint for the default sofa, with the arms on both edges', () => {
    const parts = planParts(piece('sofa'));
    expect(parts.length).toBeGreaterThan(1);
    for (const { rect: [u0, u1, v0, v1] } of parts) {
      for (const n of [u0, u1, v0, v1]) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(1);
      }
      expect(u0).toBeLessThan(u1);
      expect(v0).toBeLessThan(v1);
    }
    // The left arm starts at the left edge and the right arm ends at the right edge.
    expect(parts.some(({ rect: [u0, u1] }) => Math.abs(u0) < 1e-9 && u1 < 0.5)).toBe(true);
    expect(parts.some(({ rect: [u0, u1] }) => Math.abs(u1 - 1) < 1e-9 && u0 > 0.5)).toBe(true);
  });

  it('gives fractions inside the footprint and at least one part for every kind at its typical size', () => {
    for (const kind of KIND_ORDER) {
      const parts = planParts(piece(kind));
      expect(parts.length, kind).toBeGreaterThanOrEqual(1);
      for (const { rect: [u0, u1, v0, v1], z0, z1 } of parts) {
        for (const n of [u0, u1, v0, v1]) {
          expect(n, kind).toBeGreaterThanOrEqual(0);
          expect(n, kind).toBeLessThanOrEqual(1);
        }
        expect(z0, kind).toBeLessThanOrEqual(z1);
      }
    }
  });

  it('turns a part into fractions of the footprint, v = 0 at the back, clamped to [0, 1], heights in inches', () => {
    // A 40 × 20 × 30 piece: x in [-20, 20], y in [-10, 10] with the back at -10.
    nextParts([box('main', -10, 30, -12, 0, 4, 9)]);
    const [part, ...rest] = planParts({ id: 'b', kind: 'box', w: 40, d: 20, h: 30, style: {} });
    expect(rest).toEqual([]);
    expect(part?.rect[0]).toBeCloseTo(0.25, 12);
    expect(part?.rect[1]).toBe(1);
    expect(part?.rect[2]).toBe(0);
    expect(part?.rect[3]).toBeCloseTo(0.5, 12);
    expect(part?.round).toBe(false);
    expect([part?.z0, part?.z1]).toEqual([4, 9]);
  });

  it('calls buildParts with the piece\'s kind, size and style and the default seed', () => {
    const p = piece('bed', { headboard: 'tall' });
    planParts(p);
    expect(buildParts).toHaveBeenCalledWith('bed', { w: 64, d: 85, h: 38 }, p.style);
  });

  it('returns the one part of a piece whose only part fills the footprint', () => {
    nextParts([box('main', -18, 18, -12, 12, 0, 30)]);
    expect(planParts(piece('box'))).toEqual([{ rect: [0, 1, 0, 1], round: false, z0: 0, z1: 30 }]);
  });

  it('leaves out detail parts such as books and handles', () => {
    // A shelf body with two books on it, then a dresser carcass with two knobs.
    const book = { ...box('book0', -10, -8, -4, 4, 10, 18), detail: true } as const;
    const book2 = { ...box('book1', -8, -6, -4, 4, 10, 17), detail: true } as const;
    nextParts([box('main', -18, 18, -6.5, 6.5, 0, 78), book, book2]);
    const shelf = planParts(piece('shelf'));
    expect(shelf).toHaveLength(1);
    expect(shelf[0]?.z1).toBe(78);

    const knob = { ...cylinder('accent', -10, 9.5, 20, 21, 1), detail: true } as const;
    nextParts([box('main', -30, 30, -9, 9, 0, 34), knob, { ...knob, cx: 10 }]);
    const dresser = planParts(piece('dresser'));
    expect(dresser).toHaveLength(1);
    expect(dresser[0]?.round).toBe(false);
  });

  it('marks the round table top round', () => {
    const parts = planParts(piece('table', { top: 'round' }));
    const top = parts.reduce((a, b) => (b.z1 > a.z1 ? b : a));
    expect(top.round).toBe(true);
    expect(top.rect).toEqual([0, 1, 0, 1]);
    expect(planParts(piece('table')).every((p) => p.z1 < 16 || !p.round)).toBe(true);
  });

  it('marks a round rug round', () => {
    // A round rug as one cylinder filling the footprint, the shape its builder gives it.
    nextParts([{ ...cylinder('main', 0, 0, 0, 0.5, 60), sy: 96 }]);
    expect(planParts(piece('rug', { shape: 'round' }))).toEqual([{ rect: [0, 1, 0, 1], round: true, z0: 0, z1: 0.5 }]);
  });

  it('lists the default bed\'s parts lowest top first', () => {
    const z1s = planParts(piece('bed')).map((p) => p.z1);
    expect(z1s.length).toBeGreaterThan(1);
    expect(z1s).toEqual([...z1s].sort((a, b) => a - b));
  });

  it('sorts parts by their top, keeping the given order between equal tops', () => {
    nextParts([
      box('main', -20, 0, -10, 10, 5, 30),
      box('main', 0, 20, -10, 10, 0, 10),
      box('soft', -20, 20, -10, 0, 0, 30),
      box('accent', -20, 20, 0, 10, 2, 10),
    ]);
    const parts = planParts({ id: 'b', kind: 'box', w: 40, d: 20, h: 30, style: {} });
    expect(parts.map((p) => [p.rect, p.z0, p.z1])).toEqual([
      [[0.5, 1, 0, 1], 0, 10],
      [[0, 1, 0.5, 1], 2, 10],
      [[0, 0.5, 0, 1], 5, 30],
      [[0, 1, 0, 0.5], 0, 30],
    ]);
  });

  it('keeps the 40 parts with the largest top-view area, in order, when there are more', () => {
    // 60 strips 1 in deep across a 60 in wide piece; strip i is (i + 1) in wide, all 10 in tall.
    const strips = Array.from({ length: 60 }, (_, i) => box('main', -30, -29 + i, i - 30, i - 29, 0, 10));
    nextParts(strips);
    const parts = planParts({ id: 'b', kind: 'box', w: 60, d: 60, h: 10, style: {} });
    expect(parts).toHaveLength(40);
    // The widest 40 are strips 20 to 59, still in their order.
    parts.forEach((p, k) => {
      expect(p.rect[1]).toBeCloseTo((k + 21) / 60, 12);
      expect(p.rect[2]).toBeCloseTo((k + 20) / 60, 12);
    });
  });
});

describe('fillsFootprint', () => {
  const part = (rect: [number, number, number, number]) => ({ rect, round: false, z0: 0, z1: 1 });

  it('is true for the whole footprint, to within rounding', () => {
    expect(fillsFootprint(part([0, 1, 0, 1]))).toBe(true);
    expect(fillsFootprint(part([1e-12, 1 - 1e-12, 0, 1]))).toBe(true);
  });

  it('is false when any side falls short of the footprint\'s edge', () => {
    expect(fillsFootprint(part([0.01, 1, 0, 1]))).toBe(false);
    expect(fillsFootprint(part([0, 0.99, 0, 1]))).toBe(false);
    expect(fillsFootprint(part([0, 1, 0.04, 1]))).toBe(false);
    expect(fillsFootprint(part([0, 1, 0, 0.5]))).toBe(false);
  });
});
