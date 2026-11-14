import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import {
  LIMIT_SLACK,
  OUTLINE_PROBLEM_TEXT,
  insertCorner,
  moveCorner,
  normaliseOutline,
  rectangleSize,
  removeCorner,
  setRectangleSize,
  setWallLength,
  snapCornerTarget,
  startingShape,
  validateOutline,
  wallsOf,
  type OutlineResult,
  type StartingShape,
} from './outline';
import { round2, signedArea } from './polygon';
import type { Corner, Point } from './types';

/** Corners with ids c1, c2, … in the order given. */
function corners(...xy: [number, number][]): Corner[] {
  return xy.map(([x, y], i) => ({ id: `c${i + 1}`, x, y }));
}

/** A regular n-gon of radius r centred at (cx, cy), positive signed area, coordinates rounded. */
function regular(n: number, r: number, cx: number, cy: number): Corner[] {
  return Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    return { id: `p${k}`, x: round2(cx + r * Math.cos(a)), y: round2(cy + r * Math.sin(a)) };
  });
}

function coords(outline: readonly Corner[]): [number, number][] {
  return outline.map(({ x, y }) => [x, y]);
}

function okOutline(result: OutlineResult): Corner[] {
  if (!result.ok) throw new Error(`expected ok, got ${result.problem}`);
  return result.outline;
}

function counter(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}${++i}`;
}

/** Distance from p to the nearest line through `through` at a multiple of CONFIG.angleSnapDeg. */
function nearestSnapLineDistance(through: Point, p: Point): number {
  let best = Infinity;
  for (let k = 0; k * CONFIG.angleSnapDeg < 180; k++) {
    const a = (k * CONFIG.angleSnapDeg * Math.PI) / 180;
    const d = Math.abs(Math.cos(a) * (p.y - through.y) - Math.sin(a) * (p.x - through.x));
    best = Math.min(best, d);
  }
  return best;
}

const RECT = corners([0, 0], [144, 0], [144, 168], [0, 168]);
const L_SHAPE = corners([0, 0], [72, 0], [72, 84], [144, 84], [144, 168], [0, 168]);
const NOTCHED = corners([0, 0], [54, 0], [54, 21], [90, 21], [90, 0], [144, 0], [144, 168], [0, 168]);
/** Triangle whose first wall runs from (0,0) to (30,40), length 50. */
const ANGLED = corners([0, 0], [30, 40], [-30, 60]);
const NON_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe('OUTLINE_PROBLEM_TEXT', () => {
  it('gives the exact text for every problem', () => {
    expect(OUTLINE_PROBLEM_TEXT).toEqual({
      crossing: 'Walls cannot cross.',
      'short-wall': 'That wall would be too short.',
      'too-few': 'A room needs at least 3 corners.',
      'too-many': 'A room can have at most 64 corners.',
      'too-large': 'That would make the room too large.',
    });
  });
});

describe('wallsOf', () => {
  it('gives one wall per corner, each running to the next corner and closing back to the first', () => {
    const walls = wallsOf(RECT);
    expect(walls).toHaveLength(4);
    expect(walls[0]).toEqual({ id: 'c1', index: 0, a: RECT[0], b: RECT[1], length: 144 });
    expect(walls[3]).toEqual({ id: 'c4', index: 3, a: RECT[3], b: RECT[0], length: 168 });
  });
});

describe('validateOutline', () => {
  it('accepts the rectangle, the L-shape and the notched shape', () => {
    expect(validateOutline(RECT)).toBeNull();
    expect(validateOutline(L_SHAPE)).toBeNull();
    expect(validateOutline(NOTCHED)).toBeNull();
  });

  it('reports too-few for 2 corners', () => {
    expect(validateOutline(corners([0, 0], [100, 0]))).toBe('too-few');
  });

  it('reports too-many for 65 corners of a valid convex polygon, and accepts 64', () => {
    expect(validateOutline(regular(64, 300, 360, 360))).toBeNull();
    expect(validateOutline(regular(65, 300, 360, 360))).toBe('too-many');
  });

  it('reports crossing for a bow-tie', () => {
    expect(validateOutline(corners([0, 0], [100, 100], [100, 0], [0, 100]))).toBe('crossing');
  });

  it('reports short-wall for corners 5.99 apart and accepts exactly 6', () => {
    expect(validateOutline(corners([0, 0], [5.99, 0], [5.99, 100], [0, 100]))).toBe('short-wall');
    expect(validateOutline(corners([0, 0], [6, 0], [6, 100], [0, 100]))).toBeNull();
  });

  it('reports too-large for a bounding box 720.01 across and accepts exactly 720', () => {
    expect(validateOutline(corners([0, 0], [720.01, 0], [720.01, 100], [0, 100]))).toBe('too-large');
    expect(validateOutline(corners([0, 0], [100, 0], [100, 720.01], [0, 720.01]))).toBe('too-large');
    expect(validateOutline(corners([0, 0], [720, 0], [720, 720], [0, 720]))).toBeNull();
  });

  it('reports too-large for any coordinate that is not a finite number, before every other rule', () => {
    for (const v of NON_FINITE) {
      expect(validateOutline(corners([0, 0], [144, 0], [144, v], [0, 168]))).toBe('too-large');
      expect(validateOutline(corners([v, 0], [144, 0], [144, 168], [0, 168]))).toBe('too-large');
      // Also too few corners: the non-finite coordinate is reported first.
      expect(validateOutline(corners([0, 0], [v, 0]))).toBe('too-large');
    }
  });

  it('reports too-large for a corner beyond ±CONFIG.coordMax (1440) in x or y, and accepts exactly ±1440', () => {
    expect(CONFIG.coordMax).toBe(1440);
    expect(validateOutline(corners([1340, 0], [1440.01, 0], [1440.01, 100], [1340, 100]))).toBe('too-large');
    expect(validateOutline(corners([-1440.01, 0], [-1340, 0], [-1340, 100], [-1440.01, 100]))).toBe('too-large');
    expect(validateOutline(corners([0, 1340], [100, 1340], [100, 1440.01], [0, 1440.01]))).toBe('too-large');
    expect(validateOutline(corners([0, -1440.01], [100, -1440.01], [100, -1340], [0, -1340]))).toBe('too-large');
    expect(validateOutline(corners([1340, -1440], [1440, -1440], [1440, -1340], [1340, -1340]))).toBeNull();
    expect(validateOutline(corners([-1440, 1340], [-1340, 1340], [-1340, 1440], [-1440, 1440]))).toBeNull();
  });

  it('checks the coordinate limit with the size rule: after short-wall, before crossing', () => {
    // 3 in walls beyond 1440: short-wall is reported first.
    expect(validateOutline(corners([1500, 0], [1503, 0], [1503, 100], [1500, 100]))).toBe('short-wall');
    // A bow-tie beyond 1440: too-large is reported before crossing.
    expect(validateOutline(corners([1500, 0], [1600, 100], [1600, 0], [1500, 100]))).toBe('too-large');
  });

  it('exports LIMIT_SLACK, the floating-point slack on the wall and room size limits', () => {
    expect(LIMIT_SLACK).toBe(1e-9);
  });

  it('reports several problems in the order too-few, too-many, short-wall, too-large, crossing', () => {
    // 2 corners 1 apart: too few and too short.
    expect(validateOutline(corners([0, 0], [1, 0]))).toBe('too-few');
    // 65 corners whose walls are about 1 in long: too many and too short.
    expect(validateOutline(regular(65, 10, 50, 50))).toBe('too-many');
    // A 3 in wall, 800 in across, walls crossing near (2.99, 99.63).
    const shortWideCrossing = corners([0, 0], [800, 0], [0, 100], [3, 100]);
    expect(validateOutline(shortWideCrossing)).toBe('short-wall');
    // A bow-tie 800 in across.
    expect(validateOutline(corners([0, 0], [800, 100], [800, 0], [0, 100]))).toBe('too-large');
  });
});

describe('normaliseOutline', () => {
  it('reverses an outline given in reverse order so the signed area is positive, ids staying with their coordinates', () => {
    const reversed = [RECT[0], RECT[3], RECT[2], RECT[1]];
    expect(signedArea(reversed)).toBeLessThan(0);
    const out = normaliseOutline(reversed);
    expect(signedArea(out)).toBeGreaterThan(0);
    for (const c of RECT) expect(out.find((o) => o.id === c.id)).toEqual(c);
    const start = out.findIndex((o) => o.id === 'c1');
    const cyclic = out.map((_, i) => out[(start + i) % out.length].id);
    expect(cyclic).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('keeps a positive outline in order and rounds its coordinates to 0.01', () => {
    const out = normaliseOutline(corners([0.004, 0], [144, 0.006], [144, 168], [0, 168]));
    expect(out).toEqual(corners([0, 0], [144, 0.01], [144, 168], [0, 168]));
  });
});

describe('moveCorner', () => {
  it('moves only the given corner; other corners and all ids are unchanged', () => {
    const out = okOutline(moveCorner(RECT, 'c3', { x: 160, y: 180 }));
    expect(out).toEqual([RECT[0], RECT[1], { id: 'c3', x: 160, y: 180 }, RECT[3]]);
  });

  it('rounds the stored position to 0.01', () => {
    const out = okOutline(moveCorner(RECT, 'c3', { x: 160.004, y: 180.006 }));
    expect(out[2]).toEqual({ id: 'c3', x: 160, y: 180.01 });
  });

  it('refuses a move that makes walls cross', () => {
    expect(moveCorner(RECT, 'c3', { x: 72, y: -50 })).toEqual({ ok: false, problem: 'crossing' });
  });

  it('leaves the outline unchanged for an unknown id', () => {
    expect(moveCorner(RECT, 'nope', { x: 1, y: 1 })).toEqual({ ok: true, outline: RECT });
  });

  it('refuses a target that is not a finite number as too-large', () => {
    for (const v of NON_FINITE) {
      expect(moveCorner(RECT, 'c3', { x: v, y: 180 })).toEqual({ ok: false, problem: 'too-large' });
      expect(moveCorner(RECT, 'c3', { x: 160, y: v })).toEqual({ ok: false, problem: 'too-large' });
    }
  });
});

describe('snapCornerTarget', () => {
  it('snaps to the 1 in grid when angle snapping is off', () => {
    const target = { x: 100.4, y: 49.6 };
    expect(snapCornerTarget(RECT, 'c2', target, { angleSnap: false, toleranceIn: 4 })).toEqual({ x: 100, y: 50 });
  });

  it('snaps one wall when the target is within tolerance of a line through one neighbour only', () => {
    const target = { x: 120, y: 2.9 };
    expect(nearestSnapLineDistance(RECT[0], target)).toBeCloseTo(2.9, 6);
    expect(nearestSnapLineDistance(RECT[2], target)).toBeGreaterThan(19);
    const p = snapCornerTarget(RECT, 'c2', target, { angleSnap: true, toleranceIn: 4 });
    expect(p.x).toBeCloseTo(120, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('snaps both walls to the intersection of the two lines', () => {
    // Within 1.2 in of the 0° line through c4 and 1.5 in of the 90° line through c2.
    const target = { x: 145.5, y: 166.8 };
    const p = snapCornerTarget(RECT, 'c3', target, { angleSnap: true, toleranceIn: 4 });
    expect(p.x).toBeCloseTo(144, 9);
    expect(p.y).toBeCloseTo(168, 9);
  });

  it('snaps to the grid when the target is out of tolerance of every line through either neighbour', () => {
    const target = { x: 170.4, y: 200.6 };
    expect(nearestSnapLineDistance(RECT[1], target)).toBeGreaterThan(4);
    expect(nearestSnapLineDistance(RECT[3], target)).toBeGreaterThan(4);
    expect(snapCornerTarget(RECT, 'c3', target, { angleSnap: true, toleranceIn: 4 })).toEqual({ x: 170, y: 201 });
  });

  it('snaps to the 45° line through the previous corner at the point nearest the target', () => {
    const outline = corners([0, 0], [60, 45], [130, 140], [0, 120]);
    const target = { x: 50.3, y: 49.5 };
    expect(nearestSnapLineDistance(outline[2], target)).toBeGreaterThan(2);
    const p = snapCornerTarget(outline, 'c2', target, { angleSnap: true, toleranceIn: 2 });
    expect(p.x).toBeCloseTo(49.9, 9);
    expect(p.y).toBeCloseTo(49.9, 9);
  });

  it('snaps only the nearer line when the two lines are parallel', () => {
    // 0° lines through c1 (y = 0) and c3 (y = 3); the target is 1.2 from the first, 1.8 from the second.
    const outline = corners([0, 0], [150, -40], [300, 3], [150, 200]);
    const p = snapCornerTarget(outline, 'c2', { x: 150, y: 1.2 }, { angleSnap: true, toleranceIn: 4 });
    expect(p.x).toBeCloseTo(150, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('snaps only the nearer line when the two lines meet farther than the tolerance from the target', () => {
    // The 15° line through c3 meets y = 0 at (140, 0), about 10.1 in from the target.
    const r15 = (15 * Math.PI) / 180;
    const next = { x: 140 + 200 * Math.cos(r15), y: 200 * Math.sin(r15) };
    const outline: Corner[] = [
      { id: 'c1', x: 0, y: 0 },
      { id: 'c2', x: 150, y: -40 },
      { id: 'c3', ...next },
      { id: 'c4', x: 150, y: 200 },
    ];
    const target = { x: 150, y: 1.5 };
    const toNext = nearestSnapLineDistance(next, target);
    expect(toNext).toBeLessThan(1.5);
    const p = snapCornerTarget(outline, 'c2', target, { angleSnap: true, toleranceIn: 4 });
    // Projection of the target onto the 15° line through (140, 0).
    const along = (target.x - 140) * Math.cos(r15) + target.y * Math.sin(r15);
    expect(p.x).toBeCloseTo(140 + along * Math.cos(r15), 9);
    expect(p.y).toBeCloseTo(along * Math.sin(r15), 9);
  });
});

describe('insertCorner', () => {
  it('inserts a corner projected onto the wall and snapped along it to 1 in from its start', () => {
    const out = okOutline(insertCorner(RECT, 'c1', { x: 60.3, y: 4 }, 'n1'));
    expect(out).toHaveLength(5);
    expect(out).toEqual([RECT[0], { id: 'n1', x: 60, y: 0 }, RECT[1], RECT[2], RECT[3]]);
  });

  it('snaps along an angled wall by distance from its start', () => {
    // Projected 20.2 in along the wall from (0,0) toward (30,40); snapped to 20 in.
    const out = okOutline(insertCorner(ANGLED, 'c1', { x: 12.2, y: 16.1 }, 'n1'));
    expect(out[1]).toEqual({ id: 'n1', x: 12, y: 16 });
  });

  it('refuses a corner less than 6 in from either end of the wall and accepts exactly 6', () => {
    expect(insertCorner(RECT, 'c1', { x: 5.4, y: 0 }, 'n1')).toEqual({ ok: false, problem: 'short-wall' });
    expect(insertCorner(RECT, 'c1', { x: 139, y: 3 }, 'n1')).toEqual({ ok: false, problem: 'short-wall' });
    expect(insertCorner(RECT, 'c1', { x: 6, y: 0 }, 'n1').ok).toBe(true);
  });

  it('refuses a 65th corner', () => {
    const outline = regular(64, 300, 360, 360);
    const mid = { x: (outline[0].x + outline[1].x) / 2, y: (outline[0].y + outline[1].y) / 2 };
    expect(insertCorner(outline, 'p0', mid, 'n1')).toEqual({ ok: false, problem: 'too-many' });
  });

  it('leaves the outline unchanged for an unknown wall', () => {
    expect(insertCorner(RECT, 'nope', { x: 60, y: 0 }, 'n1')).toEqual({ ok: true, outline: RECT });
  });

  it('refuses a target that is not a finite number as too-large', () => {
    for (const v of NON_FINITE) {
      expect(insertCorner(RECT, 'c1', { x: v, y: 4 }, 'n1')).toEqual({ ok: false, problem: 'too-large' });
      expect(insertCorner(RECT, 'c1', { x: 60, y: v }, 'n1')).toEqual({ ok: false, problem: 'too-large' });
    }
  });
});

describe('removeCorner', () => {
  it('removes the reflex corner of the L-shape', () => {
    const out = okOutline(removeCorner(L_SHAPE, 'c3'));
    expect(out).toHaveLength(5);
    expect(out).toEqual([L_SHAPE[0], L_SHAPE[1], L_SHAPE[3], L_SHAPE[4], L_SHAPE[5]]);
  });

  it('refuses to remove a corner of a triangle', () => {
    expect(removeCorner(ANGLED, 'c1')).toEqual({ ok: false, problem: 'too-few' });
  });

  it('refuses a removal whose result self-crosses', () => {
    const cShape = corners([0, 0], [100, 0], [100, 20], [20, 20], [20, 80], [100, 80], [100, 100], [0, 100]);
    expect(validateOutline(cShape)).toBeNull();
    // The new wall (0,100)→(100,0) crosses the wall (100,20)→(20,20) at (80,20).
    expect(removeCorner(cShape, 'c1')).toEqual({ ok: false, problem: 'crossing' });
  });

  it('leaves the outline unchanged for an unknown id', () => {
    expect(removeCorner(RECT, 'nope')).toEqual({ ok: true, outline: RECT });
  });
});

describe('setWallLength', () => {
  it('moves only the wall end corner along the wall', () => {
    const out = okOutline(setWallLength(RECT, 'c1', 120));
    expect(out).toEqual([RECT[0], { id: 'c2', x: 120, y: 0 }, RECT[2], RECT[3]]);
  });

  it('keeps the direction of an angled wall', () => {
    const out = okOutline(setWallLength(ANGLED, 'c1', 100));
    expect(out[1]).toEqual({ id: 'c2', x: 60, y: 80 });
  });

  it('refuses a short wall, crossing walls and a too-large room', () => {
    expect(setWallLength(RECT, 'c1', 5.9)).toEqual({ ok: false, problem: 'short-wall' });
    // (54,0) moves to (100,0); the wall (100,0)→(54,21) crosses the wall (90,21)→(90,0).
    expect(setWallLength(NOTCHED, 'c1', 100)).toEqual({ ok: false, problem: 'crossing' });
    expect(setWallLength(RECT, 'c1', 721)).toEqual({ ok: false, problem: 'too-large' });
  });

  it('refuses a negative length as too short', () => {
    expect(setWallLength(RECT, 'c1', -50)).toEqual({ ok: false, problem: 'short-wall' });
  });

  it('refuses a length that is not a finite number as too-large', () => {
    for (const v of NON_FINITE) {
      expect(setWallLength(RECT, 'c1', v)).toEqual({ ok: false, problem: 'too-large' });
    }
  });

  it('refuses to lengthen a zero-length wall, which has no direction', () => {
    const doubled = corners([0, 0], [0, 0], [144, 0], [144, 168], [0, 168]);
    expect(setWallLength(doubled, 'c1', 50)).toEqual({ ok: false, problem: 'short-wall' });
  });

  it('leaves the outline unchanged for an unknown wall', () => {
    expect(setWallLength(RECT, 'nope', 100)).toEqual({ ok: true, outline: RECT });
  });
});

describe('rectangleSize', () => {
  it('gives the size of an axis-aligned rectangle', () => {
    expect(rectangleSize(RECT)).toEqual({ w: 144, l: 168 });
  });

  it('gives null for an L-shape or a 4-corner outline that is not axis-aligned', () => {
    expect(rectangleSize(L_SHAPE)).toBeNull();
    expect(rectangleSize(corners([0, 0], [100, 10], [90, 110], [-10, 100]))).toBeNull();
  });

  it('accepts plain points without ids, as the plan view reads the outline', () => {
    const pts: readonly Point[] = [{ x: 10, y: 20 }, { x: 130, y: 20 }, { x: 130, y: 200 }, { x: 10, y: 200 }];
    expect(rectangleSize(pts)).toEqual({ w: 120, l: 180 });
    expect(rectangleSize(L_SHAPE.map(({ x, y }) => ({ x, y })))).toBeNull();
  });

  it('gives the size of a rectangle away from the origin or starting from another corner', () => {
    expect(rectangleSize(corners([10, 20], [130, 20], [130, 200], [10, 200]))).toEqual({ w: 120, l: 180 });
    expect(rectangleSize(corners([130, 200], [10, 200], [10, 20], [130, 20]))).toEqual({ w: 120, l: 180 });
    expect(rectangleSize(corners([144, 0], [144, 168], [0, 168], [0, 0]))).toEqual({ w: 144, l: 168 });
  });
});

describe('setRectangleSize', () => {
  it('moves the corners at the larger x so the width is the new width', () => {
    const out = okOutline(setRectangleSize(RECT, { w: 120 }));
    expect(out).toEqual(corners([0, 0], [120, 0], [120, 168], [0, 168]));
  });

  it('keeps the minimum x and y of a rectangle away from the origin', () => {
    const offset = corners([130, 200], [10, 200], [10, 20], [130, 20]);
    const out = okOutline(setRectangleSize(offset, { w: 100, l: 50 }));
    expect(out).toEqual(corners([110, 70], [10, 70], [10, 20], [110, 20]));
  });

  it('refuses a size below 36 as short-wall and above 720 as too-large; accepts 36 and 720', () => {
    expect(setRectangleSize(RECT, { w: 35 })).toEqual({ ok: false, problem: 'short-wall' });
    expect(setRectangleSize(RECT, { l: 35.99 })).toEqual({ ok: false, problem: 'short-wall' });
    expect(setRectangleSize(RECT, { w: 721 })).toEqual({ ok: false, problem: 'too-large' });
    expect(setRectangleSize(RECT, { l: 720.01 })).toEqual({ ok: false, problem: 'too-large' });
    expect(rectangleSize(okOutline(setRectangleSize(RECT, { w: 36, l: 720 })))).toEqual({ w: 36, l: 720 });
  });

  it('refuses a size that is not a finite number as too-large', () => {
    for (const v of NON_FINITE) {
      expect(setRectangleSize(RECT, { w: v })).toEqual({ ok: false, problem: 'too-large' });
      expect(setRectangleSize(RECT, { l: v })).toEqual({ ok: false, problem: 'too-large' });
    }
  });

  it('leaves a non-rectangle unchanged', () => {
    expect(setRectangleSize(L_SHAPE, { w: 120 })).toEqual({ ok: true, outline: L_SHAPE });
  });
});

describe('startingShape', () => {
  const expected: Record<StartingShape, [number, number][]> = {
    rectangle: [[0, 0], [144, 0], [144, 168], [0, 168]],
    'l-shape': [[0, 0], [72, 0], [72, 84], [144, 84], [144, 168], [0, 168]],
    notched: [[0, 0], [54, 0], [54, 21], [90, 21], [90, 0], [144, 0], [144, 168], [0, 168]],
  };

  for (const shape of Object.keys(expected) as StartingShape[]) {
    it(`builds a valid ${shape} at 144×168 with a distinct id per corner`, () => {
      const out = startingShape(shape, 144, 168, counter('s'));
      expect(coords(out)).toEqual(expected[shape]);
      expect(out.map((c) => c.id)).toEqual(out.map((_, i) => `s${i + 1}`));
      expect(validateOutline(out)).toBeNull();
      expect(signedArea(out)).toBeGreaterThan(0);
    });

    it(`builds a valid ${shape} at 36×36`, () => {
      expect(validateOutline(startingShape(shape, 36, 36, counter('s')))).toBeNull();
    });
  }

  it('keeps the notch at least 6 in wide and deep in a small room', () => {
    expect(coords(startingShape('notched', 36, 36, counter('s')))).toEqual([
      [0, 0], [14, 0], [14, 6], [23, 6], [23, 0], [36, 0], [36, 36], [0, 36],
    ]);
  });
});
