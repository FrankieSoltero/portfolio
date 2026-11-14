import { describe, expect, it } from 'vitest';
import { rayToPolygon } from '../domain/polygon';
import { roomBounds, roomOutline } from '../domain/shape';
import type { Footprint } from '../domain/shape';
import { fmtLen } from '../domain/units';
import type { Bounds, Point } from '../domain/types';
import { rectRoom } from '../test/fixtures';
import type { PaneRect } from './panes';
import { computeClearances, computePlanLayout, labelBox, planItemBox, toPane } from './planLayout';
import type { ClearanceLine, PlanLayout } from './planLayout';

const ROOM = rectRoom(144, 168, 96);
const OUTLINE = roomOutline(ROOM);

function pane(over: Partial<PaneRect>): PaneRect {
  return { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 1000, ...over };
}

function fp(over: Partial<Footprint>): Footprint {
  return { cx: 72, cy: 84, w: 24, d: 24, angle: 0, ...over };
}

describe('computePlanLayout', () => {
  it('fits the room to the main pane safe width with the 64 px margin', () => {
    const layout = computePlanLayout(roomBounds(ROOM), pane({ w: 1000, h: 600, safeW: 608, inset: false }));
    expect(layout.scale).toBeCloseTo(472 / 168, 4);
    expect(layout.scale).toBeCloseTo(2.8095, 4);
    expect(layout.ox).toBeCloseTo(101.714, 3);
    expect(layout.oy).toBeCloseTo(64, 10);
  });

  it('fits the room to an inset pane with the 48 px margin', () => {
    const layout = computePlanLayout(roomBounds(ROOM), pane({ w: 360, h: 264, safeW: 360, inset: true }));
    expect(layout.scale).toBeCloseTo(1, 10);
    expect(layout.ox).toBeCloseTo(108, 10);
    expect(layout.oy).toBeCloseTo(48, 10);
  });

  it('never lets the scale fall below the 0.2 floor', () => {
    const layout = computePlanLayout(roomBounds(ROOM), pane({ w: 100, h: 100, safeW: 100 }));
    expect(layout.scale).toBe(0.2);
  });

  it('centres an offset bounding box in the safe area, with (ox, oy) the pane position of plan (0, 0)', () => {
    const bounds: Bounds = { minX: -24, minY: 12, maxX: 76, maxY: 62, w: 100, l: 50 };
    const layout = computePlanLayout(bounds, pane({ w: 1000, h: 600, safeW: 608, inset: false }));
    // min((608 − 128) / 100, (600 − 128) / 50) = 4.8
    expect(layout.scale).toBeCloseTo(4.8, 10);
    expect(layout.ox).toBeCloseTo((608 - 100 * layout.scale) / 2 + 24 * layout.scale, 10);
    expect(layout.oy).toBeCloseTo((600 - 50 * layout.scale) / 2 - 12 * layout.scale, 10);
    // The bounding box's top-left corner lands on the centred position.
    const tl = toPane({ x: -24, y: 12 }, layout);
    expect(tl.x).toBeCloseTo((608 - 480) / 2, 10);
    expect(tl.y).toBeCloseTo((600 - 240) / 2, 10);
  });
});

describe('toPane', () => {
  it('maps a plan point to (ox + x·scale, oy + y·scale)', () => {
    expect(toPane({ x: 3, y: -4 }, { scale: 2, ox: 10, oy: 20 })).toEqual({ x: 16, y: 12 });
  });
});

describe('computeClearances', () => {
  const layout: PlanLayout = { scale: 2, ox: 10, oy: 20 };
  const P = (x: number, y: number): Point => toPane({ x, y }, layout);

  function lengthOf(c: ClearanceLine): number {
    return Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
  }

  function expectLine(c: ClearanceLine | undefined, from: Point, to: Point, label: string, showLabel: boolean): void {
    if (!c) throw new Error('no line');
    expect(c.x1).toBeCloseTo(from.x, 9);
    expect(c.y1).toBeCloseTo(from.y, 9);
    expect(c.x2).toBeCloseTo(to.x, 9);
    expect(c.y2).toBeCloseTo(to.y, 9);
    expect(c.label).toBe(label);
    expect(c.showLabel).toBe(showLabel);
  }

  /** The line that starts at the given plan point, if any. */
  function startingAt(lines: ClearanceLine[], p: Point): ClearanceLine | undefined {
    const q = P(p.x, p.y);
    return lines.find((l) => Math.abs(l.x1 - q.x) < 1e-6 && Math.abs(l.y1 - q.y) < 1e-6);
  }

  it('draws left, right and front lines for the seed bed and skips the zero back gap', () => {
    const lines = computeClearances(fp({ cx: 72, cy: 42.5, w: 64, d: 85, angle: 0 }), OUTLINE, layout, 'ft');
    expect(lines).toHaveLength(3);
    // Each runs from the side's midpoint along its outward normal to the wall.
    expectLine(startingAt(lines, { x: 40, y: 42.5 }), P(40, 42.5), P(0, 42.5), fmtLen(40, 'ft'), true);
    expectLine(startingAt(lines, { x: 104, y: 42.5 }), P(104, 42.5), P(144, 42.5), fmtLen(40, 'ft'), true);
    expectLine(startingAt(lines, { x: 72, y: 85 }), P(72, 85), P(72, 168), fmtLen(83, 'ft'), true);
    expect(startingAt(lines, { x: 72, y: 0 })).toBeUndefined();
  });

  it('uses the turned footprint for the far-wall gaps of a quarter-turned item', () => {
    // Unturned 40 × 20 at (10, 10), turned 90°: on the plan it spans x 10–30, y 10–50.
    const lines = computeClearances(fp({ cx: 20, cy: 30, w: 40, d: 20, angle: 90 }), OUTLINE, layout, 'm');
    expect(lines).toHaveLength(4);
    const right = startingAt(lines, { x: 30, y: 30 });
    const bottom = startingAt(lines, { x: 20, y: 50 });
    if (!right || !bottom) throw new Error('missing line');
    expect(lengthOf(right)).toBeCloseTo((144 - 10 - 20) * 2, 9);
    expect(right.label).toBe(fmtLen(144 - 10 - 20, 'm'));
    expect(lengthOf(bottom)).toBeCloseTo((168 - 10 - 40) * 2, 9);
  });

  it('draws four lines at 45°, each as long as the ray from the side midpoint to the wall', () => {
    const lines = computeClearances(fp({ cx: 72, cy: 84, w: 20, d: 20, angle: 45 }), OUTLINE, layout, 'ft');
    expect(lines).toHaveLength(4);
    const r = Math.SQRT1_2;
    // Outward normals of the back, right, front and left sides turned 45° clockwise.
    const normals: Point[] = [{ x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }, { x: -r, y: -r }];
    for (const n of normals) {
      const mid = { x: 72 + 10 * n.x, y: 84 + 10 * n.y };
      const gap = rayToPolygon(mid, n, OUTLINE);
      if (gap === null) throw new Error('ray missed');
      const line = startingAt(lines, mid);
      expectLine(line, P(mid.x, mid.y), P(mid.x + n.x * gap, mid.y + n.y * gap), fmtLen(gap, 'ft'), true);
      if (line) expect(lengthOf(line)).toBeCloseTo(gap * layout.scale, 9);
    }
  });

  it('stops a line at the nearest wall of an L-shaped outline, not at its bounding box', () => {
    const L: Point[] = [
      { x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 84 }, { x: 72, y: 84 }, { x: 72, y: 168 }, { x: 0, y: 168 },
    ];
    // In the lower arm (x 0–72, y 84–168); its right side faces the cut-out wall at x = 72.
    const lines = computeClearances(fp({ cx: 36, cy: 126, w: 24, d: 24, angle: 0 }), L, layout, 'ft');
    expectLine(startingAt(lines, { x: 48, y: 126 }), P(48, 126), P(72, 126), fmtLen(24, 'ft'), true);
  });

  it('skips a gap of exactly 0.5 in but keeps one just above it', () => {
    // Left gap = cx − 12.
    expect(computeClearances(fp({ cx: 12.5 }), OUTLINE, layout, 'ft')).toHaveLength(3);
    expect(computeClearances(fp({ cx: 12.51 }), OUTLINE, layout, 'ft')).toHaveLength(4);
  });

  it('hides the label when gap × scale is at most 34 px', () => {
    // left gap 17 in × scale 2 = 34 px → hidden; 17.5 in → 35 px → shown
    const hidden = startingAt(computeClearances(fp({ cx: 29 }), OUTLINE, layout, 'ft'), { x: 17, y: 84 });
    const shown = startingAt(computeClearances(fp({ cx: 29.5 }), OUTLINE, layout, 'ft'), { x: 17.5, y: 84 });
    expect(hidden?.showLabel).toBe(false);
    expect(shown?.showLabel).toBe(true);
  });
});

describe('planItemBox', () => {
  it('is the unrotated box centred on the item plus its CSS rotation', () => {
    const box = planItemBox(fp({ cx: 131, cy: 131.5, w: 55, d: 26, angle: 90 }), { scale: 2, ox: 0, oy: 0 });
    expect(box).toEqual({ left: 207, top: 237, width: 110, height: 52, rotateDeg: 90 });
  });

  it('offsets the box by the layout origin', () => {
    const box = planItemBox(fp({ cx: 72, cy: 42.5, w: 64, d: 85, angle: 0 }), { scale: 2, ox: 10, oy: 20 });
    expect(box).toEqual({ left: 10 + 40 * 2, top: 20, width: 128, height: 170, rotateDeg: 0 });
  });
});

describe('labelBox', () => {
  const layout: PlanLayout = { scale: 2, ox: 10, oy: 20 };

  it.each([
    [0, 110, 52],
    [90, 52, 110],
    [180, 110, 52],
    [270, 52, 110],
  ])('keeps the label upright at %i° and sizes it to the footprint as seen on screen', (angle, width, height) => {
    const box = labelBox(fp({ w: 55, d: 26, angle }), layout);
    expect(box.width).toBeCloseTo(width, 10);
    expect(box.height).toBeCloseTo(height, 10);
    expect(box.rotateDeg).toBeCloseTo(0, 10);
  });

  it.each([
    [10, 110, 52, 10],
    [100, 52, 110, 10],
    [44, 110, 52, 44],
    [46, 52, 110, -44],
    [225, 52, 110, -45],
    [350, 110, 52, -10],
  ])('at %i° sizes the label for the nearest quarter turn and tilts it by the rest', (angle, width, height, net) => {
    const box = labelBox(fp({ w: 55, d: 26, angle }), layout);
    expect(box.width).toBeCloseTo(width, 10);
    expect(box.height).toBeCloseTo(height, 10);
    expect(box.rotateDeg).toBeCloseTo(net, 10);
    expect(Math.abs(box.rotateDeg)).toBeLessThanOrEqual(45);
  });
});
