import { describe, expect, it } from 'vitest';
import type { StyleValues } from '../../types';
import { STYLE_OPTIONS, TYPICAL_SIZE, defaultStyle } from '../recipe';
import { buildParts } from './index';
import type { Part, PieceSize } from './types';

const EPS = 1e-6;
const RUG: PieceSize = TYPICAL_SIZE.rug;

const top = (p: Part) => p.z0 + p.sz;

function rug(change: Record<string, string> = {}, size: PieceSize = RUG): Part[] {
  return buildParts('rug', size, { ...defaultStyle('rug'), ...change });
}

describe('rug', () => {
  it.each([
    ['rectangle', 'box'],
    ['round', 'cylinder'],
  ])('is a %s %s, one part without a border', (shape, partShape) => {
    const parts = rug({ shape, border: 'no' });
    expect(parts).toHaveLength(1);
    const [p] = parts;
    expect(p.shape).toBe(partShape);
    expect(p.slot).toBe('main');
    expect([p.cx, p.cy, p.z0, p.sx, p.sy, p.sz]).toEqual([0, 0, 0, RUG.w, RUG.d, RUG.h]);
  });

  it.each(['rectangle', 'round'])('with a border, a %s rug is an outer part and a raised soft inner part', (shape) => {
    const parts = rug({ shape, border: 'yes' });
    expect(parts).toHaveLength(2);
    const [outer, inner] = parts;
    const inset = Math.min(Math.max(0.07 * Math.min(RUG.w, RUG.d), 1), 5);
    expect(outer.slot).toBe('main');
    expect(outer.shape).toBe(inner.shape);
    expect([outer.sx, outer.sy]).toEqual([RUG.w, RUG.d]);
    expect(outer.sz).toBeCloseTo(0.8 * RUG.h, 6);
    expect(inner.slot).toBe('soft');
    expect(inner.sx).toBeCloseTo(RUG.w - 2 * inset, 6);
    expect(inner.sy).toBeCloseTo(RUG.d - 2 * inset, 6);
    expect(top(inner)).toBeCloseTo(RUG.h, 6);
    // The inner layer starts inside the outer one, so the two never share their bottom face.
    expect(inner.z0).toBeGreaterThan(0);
    expect(inner.z0).toBeLessThan(top(outer));
  });

  it('keeps every part of a 0.25 thick rug within [0, 0.25] with a positive height', () => {
    const thin: PieceSize = { ...RUG, h: 0.25 };
    for (const shape of ['rectangle', 'round']) {
      for (const border of ['yes', 'no']) {
        for (const p of rug({ shape, border }, thin)) {
          expect(p.z0).toBeGreaterThanOrEqual(0);
          expect(top(p)).toBeLessThanOrEqual(0.25 + EPS);
          expect(p.sz).toBeGreaterThan(0);
        }
      }
    }
  });

  it('lies inside the piece with positive extents for every option combination and size', () => {
    const styles = STYLE_OPTIONS.rug.reduce<StyleValues[]>(
      (acc, o) => acc.flatMap((s) => o.values.map((v) => ({ ...s, [o.key]: v.value }))),
      [{}],
    );
    const sizes: PieceSize[] = [
      RUG,
      { w: 0.25, d: 0.25, h: 0.25 },
      { w: 1, d: 1, h: 0.25 },
      { w: 720, d: 720, h: 720 },
      { w: 240, d: 12, h: 12 },
      { w: 12, d: 240, h: 40 },
    ];
    for (const style of styles) {
      for (const size of sizes) {
        const parts = buildParts('rug', size, style);
        const label = `${JSON.stringify(style)} ${JSON.stringify(size)}`;
        expect(parts.length, label).toBeGreaterThan(0);
        expect(parts.length, label).toBeLessThanOrEqual(200);
        for (const p of parts) {
          expect(p.sx > 0 && p.sy > 0 && p.sz > 0, label).toBe(true);
          expect(Math.abs(p.cx) + p.sx / 2, label).toBeLessThanOrEqual(size.w / 2 + EPS);
          expect(Math.abs(p.cy) + p.sy / 2, label).toBeLessThanOrEqual(size.d / 2 + EPS);
          expect(p.z0, label).toBeGreaterThanOrEqual(0);
          expect(top(p), label).toBeLessThanOrEqual(size.h + EPS);
          expect(p.radius, label).toBeUndefined();
        }
      }
    }
  });
});

describe('box', () => {
  it.each([TYPICAL_SIZE.box, { w: 0.25, d: 0.25, h: 0.25 }, { w: 720, d: 12, h: 300 }])('is exactly one main box filling %o', (size) => {
    expect(buildParts('box', size, {})).toEqual([
      { shape: 'box', cx: 0, cy: 0, z0: 0, sx: size.w, sy: size.d, sz: size.h, slot: 'main' },
    ]);
  });
});
