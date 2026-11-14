import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument, PARTS } from '../domain/catalog';
import { footprint, mapPart } from '../domain/geometry';
import { boundsOf } from '../domain/polygon';
import { footprintCorners, itemFootprint, partCorners, roomBounds, roomHeight } from '../domain/shape';
import type { Item, Kind, Point, Rot } from '../domain/types';
import { placedItem, rectRoom } from '../test/fixtures';
import { computeCameraPose } from './camera';
import type { Vec3 } from './camera';
import { buildPrisms, frontOf, makeProjector, sortPrisms } from './blueprintScene';
import type { Prism } from './blueprintScene';
import type { PaneRect } from './panes';

function seed(id: string): Item {
  const found = createInitialDocument().items.find(i => i.id === id);
  if (!found) throw new Error(`missing seed item ${id}`);
  return found;
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`no element at ${i}`);
  return v;
}

/** An axis-aligned prism with corners back-left, back-right, front-right, front-left. */
function prism(id: string, x0: number, x1: number, y0: number, y1: number, z0 = 0, z1 = 10): Prism {
  return {
    pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
    z0, z1, itemId: id, kind: 'box',
  };
}

function prismFrom(id: string, pts: readonly [Point, Point, Point, Point], z0 = 0, z1 = 10): Prism {
  return { pts, z0, z1, itemId: id, kind: 'box' };
}

const KINDS = Object.keys(PARTS) as Kind[];
const ROTS: readonly Rot[] = [0, 1, 2, 3];
/** Footprint centres of the 50×30 box whose footprint's top-left is (20, 35), per quarter turn (odd turns are 30×50). */
const CENTRE_OF_BOX_AT_20_35: Record<Rot, { cx: number; cy: number }> = {
  0: { cx: 45, cy: 50 }, 1: { cx: 35, cy: 60 }, 2: { cx: 45, cy: 50 }, 3: { cx: 35, cy: 60 },
};

describe('buildPrisms', () => {
  it('makes one prism per part from partCorners of the item footprint, for every kind and quarter turn', () => {
    for (const kind of KINDS) {
      for (const rot of ROTS) {
        const it = placedItem({ id: `${kind}-${rot}`, kind, w: 50, d: 30, h: 40, ...CENTRE_OF_BOX_AT_20_35[rot], angle: rot * 90 });
        const { prisms, rugs } = buildPrisms([it]);
        const mine = kind === 'rug' ? rugs : prisms;
        const other = kind === 'rug' ? prisms : rugs;
        expect(other).toHaveLength(0);
        expect(mine).toHaveLength(PARTS[kind].length);
        PARTS[kind].forEach((part, i) => {
          const p = at(mine, i);
          expect(p.pts).toEqual(partCorners(itemFootprint(it), part));
          expect(p.z0).toBeCloseTo(part[4] * 40, 10);
          expect(p.z1).toBeCloseTo(part[5] * 40, 10);
          expect(p.itemId).toBe(`${kind}-${rot}`);
          expect(p.kind).toBe(kind);
        });
      }
    }
  });

  it('covers the same plan rectangle as the old quarter-turn part box, for every kind and quarter turn', () => {
    for (const kind of KINDS) {
      for (const rot of ROTS) {
        const it = placedItem({ kind, w: 50, d: 30, h: 40, ...CENTRE_OF_BOX_AT_20_35[rot], angle: rot * 90 });
        const { prisms, rugs } = buildPrisms([it]);
        const [fw, fd] = footprint(it);
        PARTS[kind].forEach((part, i) => {
          const m = mapPart(part, rot);
          const b = boundsOf(at(kind === 'rug' ? rugs : prisms, i).pts);
          expect(b.minX).toBeCloseTo(20 + m[0] * fw, 9);
          expect(b.maxX).toBeCloseTo(20 + m[1] * fw, 9);
          expect(b.minY).toBeCloseTo(35 + m[2] * fd, 9);
          expect(b.maxY).toBeCloseTo(35 + m[3] * fd, 9);
        });
      }
    }
  });

  it('turns each bed part into a prism scaled by height and offset by position', () => {
    const { prisms, rugs } = buildPrisms([seed('seed-bed')]);
    expect(rugs).toHaveLength(0);
    expect(prisms).toHaveLength(4);
    const first = at(prisms, 0);
    expect(first.pts[0].x).toBeCloseTo(40, 10);
    expect(first.pts[0].y).toBeCloseTo(3.4, 10);
    expect(first.pts[2].x).toBeCloseTo(104, 10);
    expect(first.pts[2].y).toBeCloseTo(85, 10);
    expect(first.z1).toBeCloseTo(15.96, 10);
  });

  it('turns the quarter-turned desk parts with its footprint', () => {
    const desk = seed('seed-desk');
    const { prisms } = buildPrisms([desk]);
    expect(prisms).toHaveLength(PARTS.desk.length);
    PARTS.desk.forEach((part, i) => {
      const b = boundsOf(at(prisms, i).pts);
      const m = mapPart(part, 1);
      expect(b.minX).toBeCloseTo(118 + m[0] * 26, 10);
      expect(b.maxX).toBeCloseTo(118 + m[1] * 26, 10);
      expect(b.minY).toBeCloseTo(104 + m[2] * 55, 10);
      expect(b.maxY).toBeCloseTo(104 + m[3] * 55, 10);
    });
    expect(boundsOf(at(prisms, 1).pts).minX).toBeCloseTo(119.56, 10);
    expect(boundsOf(at(prisms, 1).pts).maxY).toBeCloseTo(107.3, 10);
  });

  it('puts rug parts in rugs and not in prisms', () => {
    const rug: Item = { ...seed('seed-bed'), id: 'rug-1', kind: 'rug', h: 0.5 };
    const { prisms, rugs } = buildPrisms([rug, seed('seed-desk')]);
    expect(rugs).toHaveLength(1);
    expect(at(rugs, 0).itemId).toBe('rug-1');
    expect(prisms.some(b => b.itemId === 'rug-1')).toBe(false);
    expect(prisms).toHaveLength(PARTS.desk.length);
  });
});

describe('frontOf', () => {
  it('puts a in front when it is entirely left of b and the camera is left of a', () => {
    const a = prism('a', 0, 10, 0, 10);
    const b = prism('b', 20, 30, 0, 10);
    expect(frontOf(a, b, [-50, 5, 5])).toBe(1);
    expect(frontOf(b, a, [-50, 5, 5])).toBe(-1);
  });

  it('returns 0 for overlapping prisms', () => {
    const a = prism('a', 0, 10, 0, 10);
    const b = prism('b', 5, 15, 5, 15, 5, 15);
    expect(frontOf(a, b, [-50, -50, 50])).toBe(0);
  });

  it('decides a prism wholly above another by the camera height', () => {
    const top = prism('top', 0, 10, 0, 10, 20, 30);
    const low = prism('low', 0, 10, 0, 10, 0, 10);
    expect(frontOf(top, low, [5, 5, 100])).toBe(1);
    expect(frontOf(low, top, [5, 5, 100])).toBe(-1);
    expect(frontOf(top, low, [5, 5, -50])).toBe(-1);
    expect(frontOf(low, top, [5, 5, -50])).toBe(1);
    // Camera between them in z, and no plan axis separates them.
    expect(frontOf(top, low, [5, 5, 15])).toBe(0);
  });

  it('tries z before the plan axes', () => {
    const top = prism('top', 0, 10, 0, 10, 20, 30);
    const low = prism('low', 40, 50, 0, 10, 0, 10);
    // In x the camera is on low's side; z is tried first and puts top in front.
    expect(frontOf(top, low, [100, 5, 100])).toBe(1);
  });

  it("tries a's edge normals before b's", () => {
    // A diamond (a 20 × 20 square at 45°) and an axis-aligned square to its right.
    const diamond = prismFrom('diamond', footprintCorners({ cx: 0, cy: 0, w: 20, d: 20, angle: 45 }));
    const square = prism('square', 20, 30, -5, 5);
    // The diamond's first edge normal is along (1, −1): the camera is on the diamond's side.
    // The square's first separating normal is x: the camera is on the square's side.
    const cam: Vec3 = [40, 40, 5];
    expect(frontOf(diamond, square, cam)).toBe(1);
    expect(frontOf(square, diamond, cam)).toBe(1);
  });

  it('counts prisms touching within 0.01 as separated', () => {
    const a = prism('a', 0, 10, 0, 10);
    // Overlapping by 0.005 in x: within the tolerance, so still separated.
    const b = prism('b', 9.995, 20, 0, 10);
    expect(frontOf(a, b, [-50, 5, 5])).toBe(1);
    const c = prism('c', 9.98, 20, 0, 10);
    expect(frontOf(a, c, [-50, 5, 5])).toBe(0);
  });

  it('tries the next axis when the camera lies between the prisms on the first separating one', () => {
    const a = prism('a', 0, 10, 0, 10);
    const b = prism('b', 20, 30, 20, 30);
    // y (a's first edge normal) has the camera between; x decides.
    expect(frontOf(a, b, [-50, 15, 5])).toBe(1);
    expect(frontOf(a, b, [100, 15, 5])).toBe(-1);
  });

  it('decides a rotated prism separated from a square only along a diagonal', () => {
    const diamond = prismFrom('diamond', footprintCorners({ cx: 0, cy: 0, w: 20, d: 20, angle: 45 }));
    const square = prism('square', 10, 20, 10, 20);
    const squareSide: Vec3 = [100, 100, 5];
    expect(frontOf(square, diamond, squareSide)).toBe(1);
    expect(frontOf(diamond, square, squareSide)).toBe(-1);
    const diamondSide: Vec3 = [-100, -100, 5];
    expect(frontOf(diamond, square, diamondSide)).toBe(1);
    expect(frontOf(square, diamond, diamondSide)).toBe(-1);
  });
});

describe('sortPrisms', () => {
  it('orders prisms far to near along a line from the camera', () => {
    const cam: Vec3 = [-100, 5, 5];
    const near = prism('near', 0, 10, 0, 10);
    const far = prism('far', 40, 50, 0, 10);
    expect(sortPrisms([near, far], cam).map(b => b.itemId)).toEqual(['far', 'near']);
  });

  it('terminates on a cyclic set and returns every prism exactly once', () => {
    // Pinwheel: each prism is in front of the next, so every prism is blocked.
    const cam: Vec3 = [15, 15, 100];
    const a = prism('a', 0, 10, 0, 20);
    const b = prism('b', 10, 30, 0, 10);
    const c = prism('c', 20, 30, 10, 30);
    const d = prism('d', 0, 20, 20, 30);
    expect([frontOf(b, a, cam), frontOf(c, b, cam), frontOf(d, c, cam), frontOf(a, d, cam)]).toEqual([1, 1, 1, 1]);
    const sorted = sortPrisms([a, b, c, d], cam);
    expect(sorted).toHaveLength(4);
    expect(new Set(sorted)).toEqual(new Set([a, b, c, d]));
  });

  it('ignores a pair that are each in front of the other, so a real occluder still draws later', () => {
    const cam: Vec3 = [10, 100, 60];
    // P: a 5 × 5 part at x 10–15, y 40–45, turned 90°. Q: unturned at x 30–35, y 60–65.
    // R: a long shelf at x −200–20, y 50–55, between P and the camera, hiding P's lower front.
    const p = prismFrom('P', footprintCorners({ cx: 12.5, cy: 42.5, w: 5, d: 5, angle: 90 }), 0, 30);
    const q = prism('Q', 30, 35, 60, 65, 0, 30);
    const r = prism('R', -200, 20, 50, 55, 0, 30);
    // Mixed parity puts the axes in a different order for (P, Q) and (Q, P): both answer 1.
    expect([frontOf(p, q, cam), frontOf(q, p, cam)]).toEqual([1, 1]);
    expect([frontOf(r, p, cam), frontOf(p, r, cam)]).toEqual([1, -1]);
    for (const input of [[p, q, r], [r, q, p], [q, r, p]]) {
      const ids = sortPrisms(input, cam).map(b => b.itemId);
      expect(ids).toHaveLength(3);
      expect(ids.indexOf('P')).toBeLessThan(ids.indexOf('R'));
    }
  });

  it('returns each rotated prism exactly once', () => {
    const items = createInitialDocument().items.map((i, n) => ({ ...i, rot: (n % 4) as Rot }));
    const { prisms } = buildPrisms(items);
    const sorted = sortPrisms(prisms, [-200, 300, 150]);
    expect(sorted).toHaveLength(prisms.length);
    expect(new Set(sorted)).toEqual(new Set(prisms));
  });
});

describe('makeProjector', () => {
  const pane: PaneRect = { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 608 };
  const room = rectRoom(144, 168, 96);
  const pose = computeCameraPose(roomBounds(room), roomHeight(room), { ...CONFIG.camera }, pane);

  it('maps the camera target to the centre of the safe area', () => {
    const project = makeProjector(pose, pane.safeW, pane.h);
    const [x, y] = project(pose.target);
    expect(x).toBeCloseTo(304, 6);
    expect(y).toBeCloseTo(300, 6);
  });

  it('projects a point above the target higher on screen', () => {
    const project = makeProjector(pose, pane.safeW, pane.h);
    const [x, y] = project([pose.target[0], pose.target[1], pose.target[2] + 10]);
    expect(x).toBeCloseTo(304, 6);
    expect(y).toBeLessThan(300);
  });
});
