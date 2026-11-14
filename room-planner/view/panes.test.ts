import { describe, expect, it } from 'vitest';
import { computePanes } from './panes';
import type { PaneRect } from './panes';

function req(pane: PaneRect | null): PaneRect {
  if (!pane) throw new Error('expected a pane, got null');
  return pane;
}

describe('computePanes — inset layout', () => {
  it('places the plan as a bottom-right inset over a full-stage 3D main pane', () => {
    const panes = computePanes(1000, 600, 'inset', '2d', false);
    expect(panes.plan).toEqual({ left: 624, top: 320, w: 360, h: 264, z: 8, inset: true, divider: false, safeW: 360 });
    expect(panes.three).toEqual({ left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 608 });
  });

  it('exchanges plan and three when the inset is swapped', () => {
    const normal = computePanes(1000, 600, 'inset', '2d', false);
    const swapped = computePanes(1000, 600, 'inset', '2d', true);
    expect(swapped.plan).toEqual(normal.three);
    expect(swapped.three).toEqual(normal.plan);
  });

  it('clamps the inset to its minimum size and the main safe width to its floor on a small stage', () => {
    const panes = computePanes(400, 300, 'inset', '2d', false);
    const inset = req(panes.plan);
    const main = req(panes.three);
    expect(inset.w).toBe(220);
    expect(inset.h).toBe(200);
    expect(main.safeW).toBe(200);
  });

  it('clamps the inset to its maximum size on a large stage', () => {
    const inset = req(computePanes(2000, 1200, 'inset', '3d', false).plan);
    expect(inset.w).toBe(380);
    expect(inset.h).toBe(320);
  });
});

describe('computePanes — split layout', () => {
  it('gives the plan the floored left half and three the remainder with a divider', () => {
    const panes = computePanes(1001, 600, 'split', '2d', false);
    expect(panes.plan).toEqual({ left: 0, top: 0, w: 500, h: 600, z: 1, inset: false, divider: false, safeW: 500 });
    expect(panes.three).toEqual({ left: 500, top: 0, w: 501, h: 600, z: 1, inset: false, divider: true, safeW: 501 });
  });
});

describe('computePanes — tabs layout', () => {
  const full: PaneRect = { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 1000 };

  it('shows only the plan, full stage, on the 2d tab', () => {
    const panes = computePanes(1000, 600, 'tabs', '2d', false);
    expect(panes.plan).toEqual(full);
    expect(panes.three).toBeNull();
  });

  it('shows only three, full stage, on the 3d tab', () => {
    const panes = computePanes(1000, 600, 'tabs', '3d', true);
    expect(panes.plan).toBeNull();
    expect(panes.three).toEqual(full);
  });
});
