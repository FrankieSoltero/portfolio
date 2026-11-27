import { describe, expect, it } from 'vitest';
import { defaultStyle } from '../recipe';
import { buildParts } from './index';
import type { Part, PieceSize } from './types';

const EPS = 1e-6;
const BED: PieceSize = { w: 64, d: 85, h: 38 };

const top = (p: Part) => p.z0 + p.sz;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/** The mattress top with a headboard: clamp(0.55 h, 4, 26), at most h minus the pillow thickness clamp(0.1 h, 0.05, 5). */
const mattressTop = (size: PieceSize) => Math.min(Math.min(Math.max(0.55 * size.h, 4), 26), size.h - 0.1 * size.h);

function bed(change: Record<string, string> = {}, size: PieceSize = BED): Part[] {
  return buildParts('bed', size, { ...defaultStyle('bed'), ...change });
}

/** Parts touching the back edge (y = -d/2) whose top is above the mattress top: the headboard. */
function headboards(parts: readonly Part[], size: PieceSize): Part[] {
  const above = top(mattress(parts)) + EPS;
  return parts.filter((p) => near(p.cy - p.sy / 2, -size.d / 2) && top(p) > above);
}

/** Parts touching the front edge (y = d/2) whose top is above the mattress top: the footboard. */
function footboards(parts: readonly Part[], size: PieceSize): Part[] {
  const above = top(mattress(parts)) + EPS;
  return parts.filter((p) => near(p.cy + p.sy / 2, size.d / 2) && top(p) > above);
}

/** Legs: accent parts standing on the floor with a footprint under a quarter of the piece's in both directions. */
function legs(parts: readonly Part[], size: PieceSize): Part[] {
  return parts.filter((p) => p.slot === 'accent' && p.z0 === 0 && p.sx < size.w / 4 && p.sy < size.d / 4);
}

/** The mattress: the linen part with the largest footprint. */
function mattress(parts: readonly Part[]): Part {
  return parts.filter((p) => p.slot === 'linen').reduce((a, b) => (b.sx * b.sy > a.sx * a.sy ? b : a));
}

/** Pillows: linen parts that sit on the mattress top. */
function pillows(parts: readonly Part[]): Part[] {
  const m = mattress(parts);
  return parts.filter((p) => p.slot === 'linen' && near(p.z0, top(m)));
}

/** Every part lies inside the piece with a positive size. */
function insideBounds(parts: readonly Part[], size: PieceSize): boolean {
  return parts.every(
    (p) =>
      p.sx > 0 && p.sy > 0 && p.sz > 0 && p.z0 >= 0 && top(p) <= size.h + EPS &&
      Math.abs(p.cx) + p.sx / 2 <= size.w / 2 + EPS && Math.abs(p.cy) + p.sy / 2 <= size.d / 2 + EPS,
  );
}

describe('bed', () => {
  it('draws no headboard, a low one below the top, or a tall one to the top', () => {
    expect(headboards(bed({ headboard: 'none' }), BED)).toHaveLength(0);
    const low = headboards(bed({ headboard: 'low' }), BED);
    expect(low).toHaveLength(1);
    expect(top(low[0])).toBeLessThan(BED.h);
    expect(top(low[0])).toBeGreaterThan(mattressTop(BED));
    const tall = headboards(bed({ headboard: 'tall' }), BED);
    expect(tall).toHaveLength(1);
    expect(top(tall[0])).toBeCloseTo(BED.h, 6);
  });

  it('makes an upholstered headboard a rounded main part and a panel one an accent box', () => {
    const [upholstered] = headboards(bed({ finish: 'upholstered' }), BED);
    expect(upholstered.shape).toBe('rounded');
    expect(upholstered.slot).toBe('main');
    const [panel] = headboards(bed({ finish: 'panel' }), BED);
    expect(panel.shape).toBe('box');
    expect(panel.slot).toBe('accent');
  });

  it('adds one footboard at the front edge, above the mattress, only when footboard is yes', () => {
    const parts = bed({ footboard: 'yes' });
    expect(footboards(parts, BED)).toHaveLength(1);
    expect(top(mattress(parts))).toBeCloseTo(mattressTop(BED), 6);
    expect(footboards(bed({ footboard: 'no' }), BED)).toHaveLength(0);
  });

  it('stands a platform on its frame, a legs base on four legs, and a storage base on the floor with drawers', () => {
    expect(legs(bed({ base: 'platform' }), BED)).toHaveLength(0);
    expect(legs(bed({ base: 'legs' }), BED)).toHaveLength(4);

    const storage = bed({ base: 'storage' });
    const m = mattress(storage);
    const body = storage.filter((p) => p.detail !== true && p.z0 === 0 && near(top(p), m.z0));
    expect(body).toHaveLength(1);
    expect(legs(storage, BED)).toHaveLength(0);
    const fronts = storage.filter((p) => p.detail === true);
    expect(fronts).toHaveLength(4);
    expect(fronts.filter((p) => p.cx < 0)).toHaveLength(2);
    expect(fronts.filter((p) => p.cx > 0)).toHaveLength(2);
    for (const f of fronts) expect(near(Math.abs(f.cx) + f.sx / 2, BED.w / 2)).toBe(true);
  });

  it('lays the mattress as rounded linen with a rounded main duvet over its front 68%', () => {
    const parts = bed();
    const m = mattress(parts);
    expect(m.shape).toBe('rounded');
    const duvet = parts.filter((p) => p.slot === 'main' && p.shape === 'rounded' && top(p) > top(m));
    expect(duvet).toHaveLength(1);
    const mFront = m.cy + m.sy / 2;
    expect(duvet[0].cy - duvet[0].sy / 2).toBeCloseTo(mFront - 0.68 * m.sy, 6);
    expect(duvet[0].cy + duvet[0].sy / 2).toBeGreaterThanOrEqual(mFront + 0.05);
  });

  it('puts one pillow on a bed narrower than 48 and two on a wider one, near the head', () => {
    const narrow = pillows(bed({}, { ...BED, w: 38 }));
    expect(narrow).toHaveLength(1);
    const wide = pillows(bed({}, { ...BED, w: 64 }));
    expect(wide).toHaveLength(2);
    for (const p of [...narrow, ...wide]) {
      expect(p.shape).toBe('rounded');
      expect(p.cy).toBeLessThan(0);
    }
  });

  it('puts the pillow tops at h when there is no headboard', () => {
    const tops = pillows(bed({ headboard: 'none' })).map(top);
    expect(tops.length).toBeGreaterThan(0);
    for (const t of tops) expect(t).toBeCloseTo(BED.h, 6);
  });

  it('still builds a tiny bed inside its bounds', () => {
    const size: PieceSize = { w: 1, d: 1, h: 0.25 };
    for (const base of ['platform', 'legs', 'storage']) {
      const parts = bed({ base, footboard: 'yes' }, size);
      expect(parts.length).toBeGreaterThan(0);
      expect(insideBounds(parts, size)).toBe(true);
    }
  });
});
