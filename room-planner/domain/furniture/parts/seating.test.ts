import { describe, expect, it } from 'vitest';
import { findConflicts } from '../../conflicts';
import { itemFootprint } from '../../shape';
import type { StyleValues } from '../../types';
import { placedItem, rectRoom } from '../../../test/fixtures';
import { TYPICAL_SIZE, defaultStyle } from '../recipe';
import { buildParts } from './index';
import type { Part, PieceSize } from './types';

const EPS = 1e-6;
const SOFA: PieceSize = { w: 84, d: 36, h: 33 };
const CHAIR: PieceSize = TYPICAL_SIZE.chair;

const top = (p: Part) => p.z0 + p.sz;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;

/** The sofa seat-top height: clamp(0.5 h, 6, 20). */
const sofaSeatTop = (size: PieceSize) => Math.min(20, Math.max(6, 0.5 * size.h));

function sofa(size: PieceSize, change: Record<string, string> = {}): Part[] {
  return buildParts('sofa', size, { ...defaultStyle('sofa'), ...change });
}

function chair(change: Record<string, string> = {}, size: PieceSize = CHAIR): Part[] {
  return buildParts('chair', size, { ...defaultStyle('chair'), ...change });
}

/** Seat cushions: soft rounded parts whose top is the seat top. */
function seatCushions(parts: readonly Part[], seatTop: number): Part[] {
  return parts.filter((p) => p.slot === 'soft' && p.shape === 'rounded' && near(top(p), seatTop));
}

/** Back cushions: soft parts that rise above the seat top. */
function backCushions(parts: readonly Part[], seatTop: number): Part[] {
  return parts.filter((p) => p.slot === 'soft' && top(p) > seatTop + EPS);
}

/** Main-slot parts whose top is above `height`. */
function mainAbove(parts: readonly Part[], height: number): Part[] {
  return parts.filter((p) => p.slot === 'main' && top(p) > height + EPS);
}

/** The back frame: the tallest main part touching the back edge. */
function backFrame(parts: readonly Part[], size: PieceSize): Part {
  const atBack = parts.filter((p) => p.slot === 'main' && near(p.cy - p.sy / 2, -size.d / 2));
  return atBack.reduce((a, b) => (top(b) > top(a) ? b : a));
}

/** Arms: main parts above the seat top other than the back frame. */
function arms(parts: readonly Part[], size: PieceSize, seatTop: number): Part[] {
  const frame = backFrame(parts, size);
  return mainAbove(parts, seatTop).filter((p) => p !== frame);
}

describe('sofa', () => {
  it('picks the seat count from the width when seats is auto', () => {
    const count = (w: number) => seatCushions(sofa({ ...SOFA, w }), sofaSeatTop(SOFA)).length;
    expect(count(84)).toBe(3);
    expect(count(30)).toBe(1);
    expect(count(240)).toBe(5);
  });

  it('clamps an explicit seat count so every cushion is at least 14 wide', () => {
    const cushions = seatCushions(sofa({ ...SOFA, w: 40 }, { seats: '5' }), sofaSeatTop(SOFA));
    expect(cushions.length).toBeGreaterThanOrEqual(1);
    expect(cushions.length).toBeLessThan(5);
    for (const c of cushions) expect(c.sx).toBeGreaterThanOrEqual(14);
  });

  it('keeps the chosen seat count: the style is not changed and a wide sofa gets all five', () => {
    const style: StyleValues = Object.freeze({ ...defaultStyle('sofa'), seats: '5' });
    const before = { ...style };
    buildParts('sofa', { ...SOFA, w: 40 }, style);
    expect(style).toEqual(before);
    expect(seatCushions(buildParts('sofa', { ...SOFA, w: 130 }, style), sofaSeatTop(SOFA))).toHaveLength(5);
  });

  it('has only the back frame above the seat when there are no arms', () => {
    const parts = sofa(SOFA, { arms: 'none' });
    const above = mainAbove(parts, sofaSeatTop(SOFA));
    expect(above).toHaveLength(1);
    expect(above[0].cy - above[0].sy / 2).toBeCloseTo(-SOFA.d / 2, 6);
    expect(top(above[0])).toBeCloseTo(0.9 * SOFA.h, 6);
    expect(arms(sofa(SOFA), SOFA, sofaSeatTop(SOFA))).toHaveLength(2);
  });

  it('stands the body on the floor with no legs when legs is none', () => {
    expect(sofa(SOFA).filter((p) => p.slot === 'accent')).toHaveLength(4);
    const parts = sofa(SOFA, { legs: 'none' });
    expect(parts.filter((p) => p.slot === 'accent')).toEqual([]);
    expect(Math.min(...parts.map((p) => p.z0))).toBe(0);
  });

  it.each([
    ['low', 0.75],
    ['standard', 0.9],
    ['high', 1],
  ])('puts a %s back frame top at the right height', (back, factor) => {
    const parts = sofa(SOFA, { back });
    expect(top(backFrame(parts, SOFA))).toBeCloseTo(factor * SOFA.h, 6);
    expect(Math.max(...parts.map(top))).toBeLessThanOrEqual(SOFA.h + EPS);
  });

  it('gives one back cushion per seat when loose and one across all seats when tight', () => {
    expect(backCushions(sofa(SOFA, { cushions: 'loose' }), sofaSeatTop(SOFA))).toHaveLength(3);
    expect(backCushions(sofa(SOFA, { cushions: 'tight' }), sofaSeatTop(SOFA))).toHaveLength(1);
  });

  it.each([
    ['left', -1],
    ['right', 1],
  ])('runs a %s chaise to the front edge with no arm in front of the back on that side', (chaise, sign) => {
    const size: PieceSize = { w: 96, d: 62, h: 33 };
    const seatTop = sofaSeatTop(size);
    const parts = sofa(size, { chaise });
    const toFront = seatCushions(parts, seatTop).filter((p) => near(p.cy + p.sy / 2, size.d / 2));
    expect(toFront).toHaveLength(1);
    expect(Math.sign(toFront[0].cx)).toBe(sign);
    const sideArms = arms(parts, size, seatTop);
    expect(sideArms).toHaveLength(1);
    expect(Math.sign(sideArms[0].cx)).toBe(-sign);
    expect(seatCushions(sofa(size), seatTop).filter((p) => near(p.cy + p.sy / 2, size.d / 2))).toHaveLength(3);
  });

  it('ignores the chaise on a sofa narrower than 60', () => {
    const size: PieceSize = { w: 50, d: 36, h: 33 };
    expect(sofa(size, { chaise: 'left' })).toEqual(sofa(size, { chaise: 'none' }));
    const wide: PieceSize = { w: 60, d: 36, h: 33 };
    expect(sofa(wide, { chaise: 'left' })).not.toEqual(sofa(wide, { chaise: 'none' }));
  });

  it('falls back to the default style for a bad or empty style without throwing', () => {
    const expected = sofa(SOFA);
    expect(buildParts('sofa', SOFA, { arms: 'huge' })).toEqual(expected);
    expect(buildParts('sofa', SOFA, { arms: 'huge', seats: '2' })).toEqual(expected);
    expect(buildParts('sofa', SOFA, {})).toEqual(expected);
  });

  it('keeps the collision outline the full footprint whatever the chaise', () => {
    const room = rectRoom(144, 168, 96);
    const at = (chaise: string, cx: number) => {
      const item = placedItem({ id: 's', kind: 'sofa', w: 96, d: 62, h: 33, cx, cy: 40 });
      return { ...item, style: { ...item.style, chaise } };
    };
    for (const cx of [60, 130]) {
      const left = at('left', cx);
      const none = at('none', cx);
      expect(itemFootprint(left)).toEqual(itemFootprint(none));
      expect(findConflicts([left], room)).toEqual(findConflicts([none], room));
    }
    expect(findConflicts([at('left', 130)], room)).not.toEqual({});
  });
});

describe('chair', () => {
  it('builds an armchair as a one-seat sofa with two arms when arms is yes', () => {
    const seatTop = sofaSeatTop(CHAIR);
    expect(seatCushions(chair(), seatTop)).toHaveLength(1);
    expect(arms(chair({ arms: 'yes' }), CHAIR, seatTop)).toHaveLength(2);
    expect(arms(chair({ arms: 'no' }), CHAIR, seatTop)).toHaveLength(0);
  });

  it('builds a dining chair with a thin seat, a slim back to the top and four legs', () => {
    const seatTop = Math.min(19, Math.max(6, 0.5 * CHAIR.h));
    const parts = chair({ type: 'dining', arms: 'no' });
    const seat = parts.filter((p) => p.slot === 'main' && near(top(p), seatTop));
    expect(seat).toHaveLength(1);
    expect(seat[0].sz).toBeLessThanOrEqual(3);
    const back = backFrame(parts, CHAIR);
    expect(top(back)).toBeCloseTo(CHAIR.h, 6);
    expect(back.z0).toBeCloseTo(seatTop, 6);
    expect(back.sy).toBeLessThanOrEqual(2.5);
    expect(mainAbove(parts, seatTop)).toEqual([back]);
    expect(parts.filter((p) => p.slot === 'accent')).toHaveLength(4);
    expect(arms(chair({ type: 'dining', arms: 'yes' }), CHAIR, seatTop).length).toBeGreaterThan(0);
  });

  it('builds an office chair on one column and a round base whatever the legs', () => {
    for (const legs of ['block', 'tapered', 'metal', 'pedestal']) {
      const parts = chair({ type: 'office', legs });
      const cylinders = parts.filter((p) => p.shape === 'cylinder');
      expect(cylinders).toHaveLength(2);
      const [base, column] = [...cylinders].sort((a, b) => a.z0 - b.z0);
      expect(base.z0).toBe(0);
      expect(base.sx).toBeCloseTo(0.7 * Math.min(CHAIR.w, CHAIR.d), 6);
      expect(column.sx).toBeLessThan(base.sx);
      expect(column.z0).toBeCloseTo(top(base), 6);
    }
    const seatTop = Math.min(19, Math.max(6, 0.5 * CHAIR.h));
    const seat = chair({ type: 'office' }).filter((p) => near(top(p), seatTop) && p.shape === 'rounded');
    expect(seat).toHaveLength(1);
    expect(seat[0].sz).toBeLessThanOrEqual(3);
  });

  it('stands any chair on a pedestal when legs is pedestal', () => {
    const parts = chair({ legs: 'pedestal' });
    expect(parts.filter((p) => p.shape === 'cylinder')).toHaveLength(2);
    expect(chair({ type: 'dining', legs: 'pedestal' }).filter((p) => p.shape === 'cylinder')).toHaveLength(2);
  });
});
