import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { buildParts } from '../domain/furniture/parts';
import { cylinder } from '../domain/furniture/parts/types';
import { planParts } from '../domain/furniture/planParts';
import { KIND_ORDER, defaultStyle } from '../domain/furniture/recipe';
import { boundsOf } from '../domain/polygon';
import { footprintCorners, itemFootprint, planPartOutline, roomBounds, roomHeight } from '../domain/shape';
import { obstaclePolygon } from '../domain/obstacles';
import type { Item, Obstacle, Point } from '../domain/types';
import { furnishedDocument, placedItem, rectRoom } from '../test/fixtures';
import { computeCameraPose } from './camera';
import type { Vec3 } from './camera';
import { buildPrisms, frontOf, makeProjector, obstaclePrisms, sortByPiece, sortPrisms } from './blueprintScene';
import type { Prism } from './blueprintScene';
import type { PaneRect } from './panes';

// The real part builders by default; the round rug test hands its rug the one round part the rug
// builder gives a round rug, so that it does not depend on that builder's other geometry.
vi.mock('../domain/furniture/parts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/furniture/parts')>();
  return { ...actual, buildParts: vi.fn(actual.buildParts) };
});

afterEach(() => {
  vi.mocked(buildParts).mockReset();
});

function seed(id: string): Item {
  const found = furnishedDocument().items.find(i => i.id === id);
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

function prismFrom(id: string, pts: readonly Point[], z0 = 0, z1 = 10): Prism {
  return { pts, z0, z1, itemId: id, kind: 'box' };
}

/** Quarter turns; turn n is an angle of n × 90 degrees. */
const ROTS = [0, 1, 2, 3] as const;
type QuarterTurn = (typeof ROTS)[number];
/** Footprint centres of the 50×30 box whose footprint's top-left is (20, 35), per quarter turn (odd turns are 30×50). */
const CENTRE_OF_BOX_AT_20_35: Record<QuarterTurn, { cx: number; cy: number }> = {
  0: { cx: 45, cy: 50 }, 1: { cx: 35, cy: 60 }, 2: { cx: 45, cy: 50 }, 3: { cx: 35, cy: 60 },
};

describe('buildPrisms', () => {
  it('makes one prism per plan part from planPartOutline of the item footprint, for every kind and quarter turn', () => {
    for (const kind of KIND_ORDER) {
      for (const rot of ROTS) {
        const it = placedItem({ id: `${kind}-${rot}`, kind, w: 50, d: 30, h: 40, ...CENTRE_OF_BOX_AT_20_35[rot], angle: rot * 90 });
        const { prisms, rugs } = buildPrisms([it]);
        const mine = kind === 'rug' ? rugs : prisms;
        const other = kind === 'rug' ? prisms : rugs;
        const parts = planParts(it);
        expect(other).toHaveLength(0);
        expect(mine).toHaveLength(parts.length);
        parts.forEach((part, i) => {
          const p = at(mine, i);
          expect(p.pts).toEqual(planPartOutline(itemFootprint(it), part));
          expect(p.z0).toBe(part.z0);
          expect(p.z1).toBe(part.z1);
          expect(p.itemId).toBe(`${kind}-${rot}`);
          expect(p.kind).toBe(kind);
        });
      }
    }
  });

  it('keeps every prism inside the turned footprint, for every kind and quarter turn', () => {
    for (const kind of KIND_ORDER) {
      for (const rot of ROTS) {
        const it = placedItem({ kind, w: 50, d: 30, h: 40, ...CENTRE_OF_BOX_AT_20_35[rot], angle: rot * 90 });
        const { prisms, rugs } = buildPrisms([it]);
        const fb = boundsOf(footprintCorners(itemFootprint(it)));
        for (const p of [...prisms, ...rugs]) {
          const b = boundsOf(p.pts);
          expect(b.minX).toBeGreaterThanOrEqual(fb.minX - 1e-9);
          expect(b.maxX).toBeLessThanOrEqual(fb.maxX + 1e-9);
          expect(b.minY).toBeGreaterThanOrEqual(fb.minY - 1e-9);
          expect(b.maxY).toBeLessThanOrEqual(fb.maxY + 1e-9);
        }
      }
    }
  });

  it('turns each bed plan part into a prism with its heights, and a round rug into one 16-point prism in rugs', () => {
    const bed = seed('seed-bed');
    const rug: Item = { ...placedItem({ id: 'rug-1', kind: 'rug', w: 60, d: 40, h: 0.5, cx: 40, cy: 120 }),
      style: { ...defaultStyle('rug'), shape: 'round' } };
    // The rug is built first: one round part filling its footprint.
    vi.mocked(buildParts).mockReturnValueOnce([{ ...cylinder('main', 0, 0, 0, 0.5, 60), sy: 40 }]);
    const { prisms, rugs } = buildPrisms([rug, bed]);
    const parts = planParts(bed);
    expect(parts.length).toBeGreaterThan(1);
    expect(prisms).toHaveLength(parts.length);
    parts.forEach((part, i) => {
      const p = at(prisms, i);
      expect(p.itemId).toBe('seed-bed');
      expect([p.z0, p.z1]).toEqual([part.z0, part.z1]);
      expect(p.pts).toEqual(planPartOutline(itemFootprint(bed), part));
    });
    expect(rugs).toHaveLength(1);
    expect(at(rugs, 0).itemId).toBe('rug-1');
    expect(at(rugs, 0).pts).toHaveLength(16);
    expect([at(rugs, 0).z0, at(rugs, 0).z1]).toEqual([0, 0.5]);
  });

  it('turns the quarter-turned desk parts with its footprint', () => {
    const desk = seed('seed-desk');
    const { prisms } = buildPrisms([desk]);
    const parts = planParts(desk);
    expect(prisms).toHaveLength(parts.length);
    // At 90° the local x runs down the plan and the local y runs to the left, about (131, 131.5).
    parts.forEach(({ rect: [u0, u1, v0, v1] }, i) => {
      const b = boundsOf(at(prisms, i).pts);
      expect(b.minX).toBeCloseTo(131 - (v1 - 0.5) * 26, 9);
      expect(b.maxX).toBeCloseTo(131 - (v0 - 0.5) * 26, 9);
      expect(b.minY).toBeCloseTo(131.5 + (u0 - 0.5) * 55, 9);
      expect(b.maxY).toBeCloseTo(131.5 + (u1 - 0.5) * 55, 9);
    });
  });

  it('puts rug parts in rugs and not in prisms', () => {
    const rug: Item = { ...seed('seed-bed'), id: 'rug-1', kind: 'rug', h: 0.5, style: defaultStyle('rug') };
    const { prisms, rugs } = buildPrisms([rug, seed('seed-desk')]);
    expect(rugs.length).toBeGreaterThanOrEqual(1);
    expect(rugs.every((r) => r.itemId === 'rug-1')).toBe(true);
    expect(prisms.some(b => b.itemId === 'rug-1')).toBe(false);
    expect(prisms).toHaveLength(planParts(seed('seed-desk')).length);
  });
});

/** A fixed obstacle with the given shape and size, centred at (x, y). */
function obstacle(id: string, shape: Obstacle['shape'], x: number, y: number, width: number, depth: number,
  height: number, elevation = 0): Obstacle {
  return { id, shape, label: '', x, y, rotation: 0, width, depth, height, elevation };
}

describe('obstaclePrisms', () => {
  it('extrudes a box obstacle from its elevation to elevation + height, flagged as an obstacle', () => {
    const box = { ...obstacle('ob-1', 'box', 30, 130, 20, 10, 30, 40), rotation: 90 };
    const [p, ...rest] = obstaclePrisms([box]);
    expect(rest).toHaveLength(0);
    expect(p).toEqual({ pts: obstaclePolygon(box), z0: 40, z1: 70, itemId: 'ob-1', kind: 'box', obstacle: true });
    expect(p?.pts).toHaveLength(4);
  });

  it('gives a column its 16-point polygon, one prism per obstacle in order', () => {
    const column = obstacle('ob-2', 'cylinder', 50, 50, 12, 12, 96);
    const prisms = obstaclePrisms([obstacle('ob-1', 'box', 10, 10, 5, 5, 5), column]);
    expect(prisms.map((p) => p.itemId)).toEqual(['ob-1', 'ob-2']);
    expect(at(prisms, 1).pts).toHaveLength(16);
    expect(at(prisms, 1).pts).toEqual(obstaclePolygon(column));
    expect(at(prisms, 1)).toMatchObject({ z0: 0, z1: 96, kind: 'box', obstacle: true });
  });

  it('makes no prisms for no obstacles', () => {
    expect(obstaclePrisms([])).toEqual([]);
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

describe('many-sided prisms', () => {
  // A 16-sided column of radius 10 centred at (20, 5), x 10–30, beside a box at x 40–60.
  const column = at(obstaclePrisms([obstacle('col', 'cylinder', 20, 5, 20, 20, 10)]), 0);
  const box = prism('box', 40, 60, -5, 15);

  it('decides a 16-sided column and a box side by side by the camera side', () => {
    expect(column.pts).toHaveLength(16);
    const left: Vec3 = [-100, 5, 5];
    const right: Vec3 = [200, 5, 5];
    expect(frontOf(column, box, left)).toBe(1);
    expect(frontOf(box, column, left)).toBe(-1);
    expect(frontOf(column, box, right)).toBe(-1);
    expect(frontOf(box, column, right)).toBe(1);
  });

  it('uses all 16 points of the column: a box cutting into its far side is not separated from it', () => {
    // The box x 0–12 overlaps the column's left edge at (10, 5), which is its point 8.
    const cutting = prism('cut', 0, 12, -5, 15);
    expect(frontOf(column, cutting, [-100, 5, 5])).toBe(0);
    expect(frontOf(cutting, column, [-100, 5, 5])).toBe(0);
  });

  it('sorts the column and the box far to near, each once', () => {
    expect(sortPrisms([column, box], [-100, 5, 5]).map((p) => p.itemId)).toEqual(['box', 'col']);
    expect(sortPrisms([box, column], [200, 5, 5]).map((p) => p.itemId)).toEqual(['col', 'box']);
    const sorted = sortPrisms([column, box, prism('third', 0, 70, 30, 40)], [35, 200, 80]);
    expect(sorted).toHaveLength(3);
    expect(new Set(sorted.map((p) => p.itemId))).toEqual(new Set(['col', 'box', 'third']));
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
    const items = furnishedDocument().items.map((i, n) => ({ ...i, angle: (n % 4) * 90 }));
    const { prisms } = buildPrisms(items);
    const sorted = sortPrisms(prisms, [-200, 300, 150]);
    expect(sorted).toHaveLength(prisms.length);
    expect(new Set(sorted)).toEqual(new Set(prisms));
  });
});

describe('sortByPiece', () => {
  /** A default piece of `kind`, unturned, centred at (100, 100). */
  function piece(kind: Item['kind'], w: number, d: number, h: number, style: Record<string, string> = {}): Item {
    const it = placedItem({ id: `${kind}-1`, kind, w, d, h, cx: 100, cy: 100 });
    return { ...it, style: { ...it.style, ...style } };
  }

  /** Where each of the piece's prisms (by its index in buildPrisms) lands in the sorted order. */
  function drawOrder(it: Item, cam: Vec3): number[] {
    const { prisms } = buildPrisms([it]);
    const sorted = sortByPiece(prisms, cam);
    expect(sorted).toHaveLength(prisms.length);
    return prisms.map((p) => sorted.indexOf(p));
  }

  it('draws a sofa\'s back frame before its seat cushions from the front, and after them from behind', () => {
    const sofa = piece('sofa', 84, 36, 33);
    const parts = planParts(sofa);
    // buildPrisms keeps planParts' order: the back frame has the highest top, and the seat
    // cushions reach the front edge above the deck.
    const back = parts.length - 1;
    const cushions = parts.flatMap((p, i) => (p.rect[3] === 1 && p.z0 > 11 ? [i] : []));
    expect(cushions).toHaveLength(3);
    const front = drawOrder(sofa, [100, 400, 60]);
    const behind = drawOrder(sofa, [100, -200, 60]);
    for (const c of cushions) {
      expect(front[back]).toBeLessThan(front[c] ?? -1);
      expect(behind[back]).toBeGreaterThan(behind[c] ?? Infinity);
    }
  });

  it('draws a tall headboard before the mattress from the foot of the bed, and after it from the head', () => {
    const bed = piece('bed', 64, 85, 38, { headboard: 'tall' });
    const parts = planParts(bed);
    const headboard = parts.length - 1;
    expect(parts[headboard]?.rect[2]).toBe(0);
    // The mattress: the part that sits on the frame and covers the most of the bed.
    const mattress = parts.findIndex((p) => p.z0 > 5 && p.rect[3] - p.rect[2] > 0.9);
    expect(mattress).toBeGreaterThan(-1);
    const foot = drawOrder(bed, [100, 400, 80]);
    const head = drawOrder(bed, [100, -200, 80]);
    expect(foot[headboard]).toBeLessThan(foot[mattress] ?? -1);
    expect(head[headboard]).toBeGreaterThan(head[mattress] ?? Infinity);
  });

  it('draws a table\'s legs before its top from above, and after it from below the top', () => {
    const table = piece('table', 44, 24, 30, { shelf: 'no' });
    const parts = planParts(table);
    const top = parts.length - 1;
    const legs = parts.flatMap((p, i) => (p.z0 === 0 ? [i] : []));
    expect(legs).toHaveLength(4);
    const above = drawOrder(table, [100, 300, 200]);
    const low = drawOrder(table, [100, 300, 5]);
    for (const leg of legs) {
      expect(above[leg]).toBeLessThan(above[top] ?? -1);
      expect(low[leg]).toBeGreaterThan(low[top] ?? Infinity);
    }
  });

  it('keeps each piece\'s parts together and orders the pieces as whole pieces, far to near', () => {
    const near = placedItem({ id: 'near', kind: 'sofa', w: 84, d: 36, h: 33, cx: 100, cy: 200 });
    const far = placedItem({ id: 'far', kind: 'bed', w: 64, d: 85, h: 38, cx: 100, cy: 60 });
    const column = obstacle('col', 'cylinder', 200, 130, 12, 12, 96);
    const { prisms } = buildPrisms([near, far]);
    const all = [...prisms, ...obstaclePrisms([column])];
    const sorted = sortByPiece(all, [100, 600, 120]);
    expect(new Set(sorted)).toEqual(new Set(all));
    expect(sorted).toHaveLength(all.length);
    const ids = sorted.map((p) => p.itemId);
    // Runs of one piece each, in the order far bed, then the column and the sofa.
    const runs = ids.filter((id, i) => id !== ids[i - 1]);
    expect(runs).toHaveLength(3);
    expect(runs[0]).toBe('far');
    expect(runs.indexOf('near')).toBeGreaterThan(0);
  });

  it('keeps an obstacle apart from an item that has the same id', () => {
    const it = placedItem({ id: 'same', kind: 'table', w: 44, d: 24, h: 30, cx: 100, cy: 100 });
    const ob = obstacle('same', 'box', 100, 300, 20, 20, 40);
    const { prisms } = buildPrisms([it]);
    const all = [...prisms, ...obstaclePrisms([ob])];
    const sorted = sortByPiece(all, [100, 600, 60]);
    expect(sorted).toHaveLength(all.length);
    // The obstacle stands between the camera and the table, so it is drawn last, on its own.
    expect(sorted[sorted.length - 1]?.obstacle).toBe(true);
    expect(sorted.slice(0, -1).every((p) => !p.obstacle)).toBe(true);
  });

  it('returns nothing for no prisms', () => {
    expect(sortByPiece([], [0, 0, 0])).toEqual([]);
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
