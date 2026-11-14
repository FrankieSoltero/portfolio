import { describe, expect, it } from 'vitest';
import { fmtLen } from '../domain/units';
import type { Item, Room } from '../domain/types';
import type { PaneRect } from './panes';
import { computeClearances, computePlanLayout } from './planLayout';
import type { ClearanceLine, PlanLayout } from './planLayout';

const ROOM: Room = { w: 144, l: 168, h: 96 };

function pane(over: Partial<PaneRect>): PaneRect {
  return { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 1000, ...over };
}

function item(over: Partial<Item>): Item {
  return {
    id: 'i1', kind: 'box', name: 'Box', host: 'example.com', sourceUrl: null, price: null,
    w: 24, d: 24, h: 24, x: 60, y: 72, rot: 0,
    model: { tier: 'box', label: 'Box', assetUrl: null },
    ...over,
  };
}

describe('computePlanLayout', () => {
  it('fits the room to the main pane safe width with the 64 px margin', () => {
    const layout = computePlanLayout(ROOM, pane({ w: 1000, h: 600, safeW: 608, inset: false }));
    expect(layout.scale).toBeCloseTo(472 / 168, 4);
    expect(layout.scale).toBeCloseTo(2.8095, 4);
    expect(layout.ox).toBeCloseTo(101.714, 3);
    expect(layout.oy).toBeCloseTo(64, 10);
  });

  it('fits the room to an inset pane with the 48 px margin', () => {
    const layout = computePlanLayout(ROOM, pane({ w: 360, h: 264, safeW: 360, inset: true }));
    expect(layout.scale).toBeCloseTo(1, 10);
    expect(layout.ox).toBeCloseTo(108, 10);
    expect(layout.oy).toBeCloseTo(48, 10);
  });

  it('never lets the scale fall below the 0.2 floor', () => {
    const layout = computePlanLayout(ROOM, pane({ w: 100, h: 100, safeW: 100 }));
    expect(layout.scale).toBe(0.2);
  });
});

describe('computeClearances', () => {
  const layout: PlanLayout = { scale: 2, ox: 10, oy: 20 };

  function byDir(lines: ClearanceLine[]): Record<string, ClearanceLine | undefined> {
    // Identify each line by which wall it runs to, using its pane position.
    return {
      left: lines.find((l) => l.orientation === 'h' && l.left === layout.ox),
      right: lines.find((l) => l.orientation === 'h' && l.left !== layout.ox),
      top: lines.find((l) => l.orientation === 'v' && l.top === layout.oy),
      bottom: lines.find((l) => l.orientation === 'v' && l.top !== layout.oy),
    };
  }

  it('draws four wall-gap lines for a centred item, labelled with fmtLen of each gap', () => {
    const lines = computeClearances(item({}), ROOM, layout, 'ft');
    expect(lines).toHaveLength(4);
    const d = byDir(lines);
    // item centre in pane px: x (60+12)*2+10 = 154, y (72+12)*2+20 = 188
    expect(d.left).toEqual({ left: 10, top: 188, length: 120, orientation: 'h', label: fmtLen(60, 'ft'), showLabel: true });
    expect(d.right).toEqual({ left: 10 + 84 * 2, top: 188, length: 120, orientation: 'h', label: fmtLen(60, 'ft'), showLabel: true });
    expect(d.top).toEqual({ left: 154, top: 20, length: 144, orientation: 'v', label: fmtLen(72, 'ft'), showLabel: true });
    expect(d.bottom).toEqual({ left: 154, top: 20 + 96 * 2, length: 144, orientation: 'v', label: fmtLen(72, 'ft'), showLabel: true });
  });

  it('uses the rotated footprint for the far-wall gaps', () => {
    const lines = computeClearances(item({ w: 40, d: 20, rot: 1, x: 10, y: 10 }), ROOM, layout, 'm');
    const d = byDir(lines);
    // footprint is 20 wide × 40 deep
    expect(d.right?.length).toBeCloseTo((144 - 10 - 20) * 2, 10);
    expect(d.right?.label).toBe(fmtLen(144 - 10 - 20, 'm'));
    expect(d.bottom?.length).toBeCloseTo((168 - 10 - 40) * 2, 10);
  });

  it('skips the left line when the item is flush to the left wall', () => {
    const lines = computeClearances(item({ x: 0 }), ROOM, layout, 'ft');
    expect(lines).toHaveLength(3);
    expect(byDir(lines).left).toBeUndefined();
  });

  it('skips a gap of exactly 0.5 in but keeps one just above it', () => {
    expect(computeClearances(item({ x: 0.5 }), ROOM, layout, 'ft')).toHaveLength(3);
    expect(computeClearances(item({ x: 0.51 }), ROOM, layout, 'ft')).toHaveLength(4);
  });

  it('hides the label when gap × scale is at most 34 px', () => {
    // left gap 17 in × scale 2 = 34 px → hidden; 17.5 in → 35 px → shown
    const hidden = byDir(computeClearances(item({ x: 17 }), ROOM, layout, 'ft')).left;
    const shown = byDir(computeClearances(item({ x: 17.5 }), ROOM, layout, 'ft')).left;
    expect(hidden?.showLabel).toBe(false);
    expect(shown?.showLabel).toBe(true);
  });
});
