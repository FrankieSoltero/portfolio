import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { PARTS } from '../domain/catalog';
import { boundsOf } from '../domain/polygon';
import { footprintCorners, itemFootprint, partCorners, roomBounds, roomHeight } from '../domain/shape';
import { obstaclePolygon } from '../domain/obstacles';
import type { Item, Kind, Obstacle, Point } from '../domain/types';
import { furnishedDocument, placedItem, rectRoom } from '../test/fixtures';
import { computeCameraPose } from './camera';
import type { Vec3 } from './camera';
import { buildPrisms, frontOf, makeProjector, obstaclePrisms, sortPrisms } from './blueprintScene';
import type { Prism } from './blueprintScene';
import type { PaneRect } from './panes';

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

const KINDS = Object.keys(PARTS) as Kind[];
/** Quarter turns; turn n is an angle of n × 90 degrees. */
const ROTS = [0, 1, 2, 3] as const;
type QuarterTurn = (typeof ROTS)[number];
/** Footprint centres of the 50×30 box whose footprint's top-left is (20, 35), per quarter turn (odd turns are 30×50). */
const CENTRE_OF_BOX_AT_20_35: Record<QuarterTurn, { cx: number; cy: number }> = {
  0: { cx: 45, cy: 50 }, 1: { cx: 35, cy: 60 }, 2: { cx: 45, cy: 50 }, 3: { cx: 35, cy: 60 },
};
/**
 * Plan rectangles [minX, maxX, minY, maxY] of each part of that box, per kind and quarter turn, as
 * the slice A quarter-turn part mapping placed them (values copied from that passing comparison).
 */
const QUARTER_TURN_PART_BOXES: Record<Kind, readonly (readonly (readonly [number, number, number, number])[])[]> = {
  sofa: [
    [[24, 66, 43.4, 65], [20, 70, 35, 43.4], [20, 24, 43.4, 65], [66, 70, 43.4, 65]],
    [[20, 41.6, 39, 81], [41.6, 50, 35, 85], [20, 41.6, 35, 39], [20, 41.6, 81, 85]],
    [[24, 66, 35, 56.6], [20, 70, 56.6, 65], [66, 70, 35, 56.6], [20, 24, 35, 56.6]],
    [[28.4, 50, 39, 81], [20, 28.4, 35, 85], [28.4, 50, 81, 85], [28.4, 50, 35, 39]],
  ],
  chair: [
    [[26, 64, 42.5, 65], [20, 70, 35, 42.5], [20, 26, 42.5, 65], [64, 70, 42.5, 65]],
    [[20, 42.5, 41, 79], [42.5, 50, 35, 85], [20, 42.5, 35, 41], [20, 42.5, 79, 85]],
    [[26, 64, 35, 57.5], [20, 70, 57.5, 65], [64, 70, 35, 57.5], [20, 26, 35, 57.5]],
    [[27.5, 50, 41, 79], [20, 27.5, 35, 85], [27.5, 50, 79, 85], [27.5, 50, 35, 41]],
  ],
  bed: [
    [[20, 70, 36.2, 65], [20, 70, 35, 36.2], [24, 43, 37.4, 42.8], [47, 66, 37.4, 42.8]],
    [[20, 48.8, 35, 85], [48.8, 50, 35, 85], [42.2, 47.6, 39, 58], [42.2, 47.6, 62, 81]],
    [[20, 70, 35, 63.8], [20, 70, 63.8, 65], [47, 66, 57.2, 62.6], [24, 43, 57.2, 62.6]],
    [[21.2, 50, 35, 85], [20, 21.2, 35, 85], [22.4, 27.8, 62, 81], [22.4, 27.8, 39, 58]],
  ],
  desk: [
    [[20, 70, 35, 65], [21, 23, 36.8, 63.2], [67, 69, 36.8, 63.2]],
    [[20, 50, 35, 85], [21.8, 48.2, 36, 38], [21.8, 48.2, 82, 84]],
    [[20, 70, 35, 65], [67, 69, 36.8, 63.2], [21, 23, 36.8, 63.2]],
    [[20, 50, 35, 85], [21.8, 48.2, 82, 84], [21.8, 48.2, 36, 38]],
  ],
  table: [
    [[20, 70, 35, 65], [23, 26, 38, 62], [64, 67, 38, 62]],
    [[20, 50, 35, 85], [23, 47, 38, 41], [23, 47, 79, 82]],
    [[20, 70, 35, 65], [64, 67, 38, 62], [23, 26, 38, 62]],
    [[20, 50, 35, 85], [23, 47, 79, 82], [23, 47, 38, 41]],
  ],
  shelf: [
    [[20, 70, 35, 65]],
    [[20, 50, 35, 85]],
    [[20, 70, 35, 65]],
    [[20, 50, 35, 85]],
  ],
  rug: [
    [[20, 70, 35, 65]],
    [[20, 50, 35, 85]],
    [[20, 70, 35, 65]],
    [[20, 50, 35, 85]],
  ],
  box: [
    [[20, 70, 35, 65]],
    [[20, 50, 35, 85]],
    [[20, 70, 35, 65]],
    [[20, 50, 35, 85]],
  ],
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
        const expected = at(QUARTER_TURN_PART_BOXES[kind], rot);
        expect(expected).toHaveLength(PARTS[kind].length);
        PARTS[kind].forEach((_part, i) => {
          const [minX, maxX, minY, maxY] = at(expected, i);
          const b = boundsOf(at(kind === 'rug' ? rugs : prisms, i).pts);
          expect(b.minX).toBeCloseTo(minX, 9);
          expect(b.maxX).toBeCloseTo(maxX, 9);
          expect(b.minY).toBeCloseTo(minY, 9);
          expect(b.maxY).toBeCloseTo(maxY, 9);
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
    // The quarter-turned part boxes of the 26 × 55 footprint at (118, 104), [minX, maxX, minY, maxY].
    const expected = [
      [118, 144, 104, 159],
      [119.56, 142.44, 105.1, 107.3],
      [119.56, 142.44, 155.7, 157.9],
    ] as const;
    PARTS.desk.forEach((_part, i) => {
      const b = boundsOf(at(prisms, i).pts);
      const [minX, maxX, minY, maxY] = at(expected, i);
      expect(b.minX).toBeCloseTo(minX, 10);
      expect(b.maxX).toBeCloseTo(maxX, 10);
      expect(b.minY).toBeCloseTo(minY, 10);
      expect(b.maxY).toBeCloseTo(maxY, 10);
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
