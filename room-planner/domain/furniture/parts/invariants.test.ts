import { describe, expect, it } from 'vitest';
import type { Kind, StyleValues } from '../../types';
import { KIND_ORDER, STYLE_OPTIONS, TYPICAL_SIZE, defaultStyle } from '../recipe';
import { buildParts } from './index';
import type { Part, PieceSize } from './types';

const EPS = 1e-6;

/** The sizes every kind is built at: its typical size, tiny, huge, long and thin, deep and thin. */
function sizesFor(kind: Kind): PieceSize[] {
  return [
    TYPICAL_SIZE[kind],
    { w: 1, d: 1, h: 0.25 },
    { w: 0.25, d: 0.25, h: 0.25 },
    { w: 720, d: 720, h: 720 },
    { w: 240, d: 12, h: 12 },
    { w: 12, d: 240, h: 40 },
  ];
}

/** The default style and every style that changes one option of it to one other value. */
function variationsOf(kind: Kind): StyleValues[] {
  const base = defaultStyle(kind);
  const out: StyleValues[] = [base];
  for (const o of STYLE_OPTIONS[kind]) {
    for (const v of o.values) {
      if (v.value !== o.fallback) out.push({ ...base, [o.key]: v.value });
    }
  }
  return out;
}

/** Every broken invariant of one part list, as readable lines (empty when all hold). */
function violations(parts: readonly Part[], size: PieceSize): string[] {
  const bad: string[] = [];
  if (parts.length === 0) bad.push('no parts');
  if (parts.length > 200) bad.push(`${parts.length} parts`);
  parts.forEach((p, i) => {
    const nums = [p.cx, p.cy, p.z0, p.sx, p.sy, p.sz];
    if (!nums.every(Number.isFinite)) bad.push(`#${i} not finite`);
    if (!(p.sx > 0 && p.sy > 0 && p.sz > 0)) bad.push(`#${i} extent ${p.sx} ${p.sy} ${p.sz}`);
    if (Math.abs(p.cx) + p.sx / 2 > size.w / 2 + EPS) bad.push(`#${i} outside in x`);
    if (Math.abs(p.cy) + p.sy / 2 > size.d / 2 + EPS) bad.push(`#${i} outside in y`);
    if (p.z0 < 0) bad.push(`#${i} below the floor`);
    if (p.z0 + p.sz > size.h + EPS) bad.push(`#${i} above the top`);
    if (p.radius !== undefined && (p.shape !== 'rounded' || p.radius > Math.min(p.sx, p.sy, p.sz) / 2 + EPS)) {
      bad.push(`#${i} radius ${p.radius}`);
    }
    if (p.taper !== undefined && (p.shape !== 'cylinder' || !(p.taper > 0 && p.taper <= 1))) bad.push(`#${i} taper ${p.taper}`);
  });
  return bad;
}

/** Calls `check` for every kind × style variation × size in the invariant matrix. */
function forEveryCase(kind: Kind, check: (size: PieceSize, style: StyleValues, label: string) => void): void {
  for (const style of variationsOf(kind)) {
    for (const size of sizesFor(kind)) {
      check(size, style, `${kind} ${JSON.stringify(style)} ${JSON.stringify(size)}`);
    }
  }
}

describe('parts invariants', () => {
  it.each(KIND_ORDER)('%s: parts are non-empty and lie inside the piece', (kind) => {
    forEveryCase(kind, (size, style, label) => {
      expect(violations(buildParts(kind, size, style), size), label).toEqual([]);
    });
  });

  it.each(KIND_ORDER)('%s: the same input gives the same parts', (kind) => {
    forEveryCase(kind, (size, style, label) => {
      expect(buildParts(kind, size, style, 3), label).toEqual(buildParts(kind, size, style, 3));
    });
  });

  it.each(KIND_ORDER)('%s: the seed changes only detail parts', (kind) => {
    const solid = (parts: Part[]) => parts.filter((p) => p.detail !== true);
    forEveryCase(kind, (size, style, label) => {
      expect(solid(buildParts(kind, size, style, 2)), label).toEqual(solid(buildParts(kind, size, style)));
    });
  });
});
