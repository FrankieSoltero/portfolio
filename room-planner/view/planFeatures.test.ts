import { describe, expect, it } from 'vitest';
import type { Door, Point, WindowOpening } from '../domain/types';
import { rectRoom } from '../test/fixtures';
import type { PlanLayout } from './planLayout';
import { doorDrawing, windowDrawing } from './planFeatures';

/** Room R of the brief: 144 × 168 × 96, corners c1…c4 from (0, 0). */
const R = rectRoom(144, 168, 96);
const LAYOUT: PlanLayout = { scale: 2, ox: 10, oy: 20 };
/** Door D1 of the brief: on the top wall c1, 20 in from (0, 0), 32 in wide, swinging in from its start. */
const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
const W1: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 24, height: 48 };

function expectPoint(actual: Point | undefined, x: number, y: number): void {
  expect(actual?.x).toBeCloseTo(x, 9);
  expect(actual?.y).toBeCloseTo(y, 9);
}

describe('doorDrawing', () => {
  it('draws D1 swinging in from its start: gap, leaf along the inward normal, clockwise arc', () => {
    const d = doorDrawing(D1, R.outline, LAYOUT);
    if (d === null) throw new Error('no drawing');
    expect(d.id).toBe('d1');
    expectPoint(d.gap[0], 50, 20);
    expectPoint(d.gap[1], 114, 20);
    expectPoint(d.leaf[0], 50, 20);
    expectPoint(d.leaf[1], 50, 84);
    expect(d.arc).toBe('M 114 20 A 64 64 0 0 1 50 84');
  });

  it('hinged at its end, the leaf stands at the far end and the arc turns anticlockwise', () => {
    const d = doorDrawing({ ...D1, hinge: 'end' }, R.outline, LAYOUT);
    if (d === null) throw new Error('no drawing');
    expectPoint(d.gap[0], 50, 20);
    expectPoint(d.gap[1], 114, 20);
    expectPoint(d.leaf[0], 114, 20);
    expectPoint(d.leaf[1], 114, 84);
    expect(d.arc).toBe('M 50 20 A 64 64 0 0 0 114 84');
  });

  it('swinging out, the leaf and arc are mirrored to the outside of the wall', () => {
    const d = doorDrawing({ ...D1, swing: 'out' }, R.outline, LAYOUT);
    if (d === null) throw new Error('no drawing');
    expectPoint(d.leaf[0], 50, 20);
    expectPoint(d.leaf[1], 50, -44);
    expect(d.arc).toBe('M 114 20 A 64 64 0 0 0 50 -44');
  });

  it('draws a door on the left wall c4, running up from (0, 168): gap, leaf to the right, arc', () => {
    const d = doorDrawing({ ...D1, id: 'd4', wallId: 'c4' }, R.outline, LAYOUT);
    if (d === null) throw new Error('no drawing');
    expectPoint(d.gap[0], 10, 316);
    expectPoint(d.gap[1], 10, 252);
    expectPoint(d.leaf[0], 10, 316);
    expectPoint(d.leaf[1], 74, 316);
    expect(d.arc).toBe('M 10 252 A 64 64 0 0 1 74 316');
  });

  it('is null for a door on a wall that is not in the outline', () => {
    expect(doorDrawing({ ...D1, wallId: 'zz' }, R.outline, LAYOUT)).toBeNull();
  });
});

describe('windowDrawing', () => {
  it('draws a window on c2 on the wall line, with its band edges 3 px inside and 3 px outside it', () => {
    const w = windowDrawing(W1, R.outline, LAYOUT);
    if (w === null) throw new Error('no drawing');
    expect(w.id).toBe('w1');
    expectPoint(w.a, 298, 220);
    expectPoint(w.b, 298, 292);
    expectPoint(w.inside[0], 295, 220);
    expectPoint(w.inside[1], 295, 292);
    expectPoint(w.outside[0], 301, 220);
    expectPoint(w.outside[1], 301, 292);
  });

  it('is null for a window on a wall that is not in the outline', () => {
    expect(windowDrawing({ ...W1, wallId: 'zz' }, R.outline, LAYOUT)).toBeNull();
  });
});
