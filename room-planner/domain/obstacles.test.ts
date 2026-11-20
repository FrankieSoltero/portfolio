import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import {
  OBSTACLE_PROBLEM_TEXT,
  addObstacle,
  moveObstacle,
  newObstacle,
  obstacleDisplayName,
  obstacleFootprint,
  obstacleName,
  obstaclePolygon,
  shiftObstacle,
  updateObstacle,
  validateObstacles,
  type ObstaclesResult,
} from './obstacles';
import { defaultColours, defaultStyle } from './furniture/recipe';
import { moveItem } from './geometry';
import { signedArea } from './polygon';
import { footprintCorners } from './shape';
import type { Item, Obstacle, Point } from './types';

function okObstacles(result: ObstaclesResult): Obstacle[] {
  if (!result.ok) throw new Error(`expected ok, got ${result.problem}`);
  return result.obstacles;
}

/** Freezes the array and every element, so any mutation throws (modules run in strict mode). */
function frozen<T extends object>(list: T[]): readonly T[] {
  list.forEach((x) => Object.freeze(x));
  return Object.freeze(list);
}

/** The outline of the brief's 144 × 168 room. */
const OUTLINE: Point[] = [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 168 }, { x: 0, y: 168 }];

/** The default box and the default column for a 96 in room, written out. */
const BOX: Obstacle = { id: 'o1', shape: 'box', label: 'Box', x: 72, y: 84, rotation: 0, width: 24, depth: 24, height: 36, elevation: 0 };
const COLUMN: Obstacle = { id: 'c1', shape: 'cylinder', label: 'Column', x: 20, y: 20, rotation: 0, width: 12, depth: 12, height: 96, elevation: 0 };

function box(over: Partial<Obstacle> = {}): Obstacle {
  return { ...BOX, ...over };
}

/** n valid default boxes with ids o0, o1, …. */
function many(n: number): Obstacle[] {
  return Array.from({ length: n }, (_, i) => box({ id: `o${i}` }));
}

describe('constants', () => {
  it('gives the exact text for every problem', () => {
    expect(OBSTACLE_PROBLEM_TEXT).toEqual({
      'obstacle-size': 'That size is not allowed.',
      'too-many-obstacles': 'A room can have at most 64 obstacles.',
    });
  });
});

describe('newObstacle', () => {
  it('gives a box its defaults, centred at the point rounded to 0.01', () => {
    expect(newObstacle('box', { x: 10.123, y: 20.456 }, 96, 'b')).toEqual({
      id: 'b', shape: 'box', label: 'Box', x: 10.12, y: 20.46, rotation: 0, width: 24, depth: 24, height: 36, elevation: 0,
    });
  });

  it('gives a column its defaults and the room height', () => {
    expect(newObstacle('cylinder', { x: 50, y: 60 }, 108, 'c')).toEqual({
      id: 'c', shape: 'cylinder', label: 'Column', x: 50, y: 60, rotation: 0, width: 12, depth: 12, height: 108, elevation: 0,
    });
  });
});

describe('obstacleFootprint', () => {
  it('is the centre, width, depth and rotation', () => {
    const o = box({ x: 30, y: 130, width: 20, depth: 10, rotation: 90 });
    expect(obstacleFootprint(o)).toEqual({ cx: 30, cy: 130, w: 20, d: 10, angle: 90 });
  });
});

describe('obstaclePolygon', () => {
  it('is the four footprint corners of a box', () => {
    const o = box({ x: 30, y: 130, width: 20, depth: 10, rotation: 90 });
    expect(obstaclePolygon(o)).toEqual(footprintCorners({ cx: 30, cy: 130, w: 20, d: 10, angle: 90 }));
  });

  it('is 16 points on a cylinder circle, from angle 0, clockwise on the plan', () => {
    const o: Obstacle = { ...COLUMN, x: 50, y: 50, width: 12, depth: 12 };
    const pts = obstaclePolygon(o);
    expect(pts).toHaveLength(CONFIG.cylinderSegments);
    expect(pts).toHaveLength(16);
    for (const p of pts) expect(Math.hypot(p.x - 50, p.y - 50)).toBeCloseTo(6, 9);
    expect(pts[0]).toEqual({ x: 56, y: 50 });
    // The next point turns towards +y (down the plan), i.e. clockwise as seen.
    expect(pts[1].y).toBeGreaterThan(50);
    expect(signedArea(pts)).toBeGreaterThan(0);
  });

  it('does not turn a cylinder with its rotation', () => {
    const o: Obstacle = { ...COLUMN, x: 50, y: 50 };
    expect(obstaclePolygon({ ...o, rotation: 45 })).toEqual(obstaclePolygon(o));
  });
});

describe('validateObstacles', () => {
  it('accepts a default box and a default column in a 96 in room', () => {
    const defaults = [newObstacle('box', { x: 72, y: 84 }, 96, 'b'), newObstacle('cylinder', { x: 20, y: 20 }, 96, 'c')];
    expect(validateObstacles(defaults)).toBeNull();
    expect(validateObstacles([BOX, COLUMN])).toBeNull();
    expect(validateObstacles([])).toBeNull();
  });

  it.each<[string, Partial<Obstacle>]>([
    ['width 0.5', { width: 0.5 }],
    ['width 241', { width: 241 }],
    ['depth 241', { depth: 241 }],
    ['height 0', { height: 0 }],
    ['height 721', { height: 721 }],
    ['elevation -1', { elevation: -1 }],
    ['elevation 721', { elevation: 721 }],
    ['NaN x', { x: NaN }],
    ['NaN y', { y: NaN }],
    ['NaN rotation', { rotation: NaN }],
    ['NaN width', { width: NaN }],
    ['NaN depth', { depth: NaN }],
    ['NaN height', { height: NaN }],
    ['NaN elevation', { elevation: NaN }],
    ['infinite x', { x: Infinity }],
  ])('refuses %s as obstacle-size', (_name, over) => {
    expect(validateObstacles([BOX, box(over)])).toBe('obstacle-size');
  });

  it('accepts the exact limits', () => {
    expect(validateObstacles([box({ width: 1, depth: 240, height: 1, elevation: 0 })])).toBeNull();
    expect(validateObstacles([box({ width: 240, depth: 1, height: 720, elevation: 720 })])).toBeNull();
  });

  it('allows a label of 40 characters or none, and refuses 41', () => {
    expect(validateObstacles([box({ label: 'x'.repeat(40) })])).toBeNull();
    expect(validateObstacles([box({ label: '' })])).toBeNull();
    expect(validateObstacles([box({ label: 'x'.repeat(41) })])).toBe('obstacle-size');
  });

  it('counts a label in UTF-16 units: 20 astral characters (40 units) accepted, 21 (42 units) refused', () => {
    expect('😀'.repeat(20)).toHaveLength(40);
    expect(validateObstacles([box({ label: '😀'.repeat(20) })])).toBeNull();
    expect(validateObstacles([box({ label: '😀'.repeat(21) })])).toBe('obstacle-size');
  });

  it('refuses a cylinder whose depth differs from its width', () => {
    expect(validateObstacles([{ ...COLUMN, depth: 13 }])).toBe('obstacle-size');
  });

  it('refuses 65 obstacles and accepts 64', () => {
    expect(validateObstacles(many(64))).toBeNull();
    expect(validateObstacles(many(65))).toBe('too-many-obstacles');
  });
});

describe('addObstacle', () => {
  it('adds a default box', () => {
    expect(addObstacle([], newObstacle('box', { x: 72, y: 84 }, 96, 'o1'))).toEqual({
      ok: true,
      obstacles: [{ id: 'o1', shape: 'box', label: 'Box', x: 72, y: 84, rotation: 0, width: 24, depth: 24, height: 36, elevation: 0 }],
    });
  });

  it('refuses a 65th obstacle', () => {
    expect(addObstacle(many(64), newObstacle('box', { x: 1, y: 1 }, 96, 'extra'))).toEqual({
      ok: false,
      problem: 'too-many-obstacles',
    });
  });

  it('refuses an obstacle of a size not allowed', () => {
    expect(addObstacle([], box({ width: 0.5 }))).toEqual({ ok: false, problem: 'obstacle-size' });
  });
});

describe('moveObstacle', () => {
  it('snaps the bounding-box minimum corner to the grid', () => {
    const moved = moveObstacle(BOX, 30.4, 50.6, OUTLINE, 1);
    expect(moved).toEqual({ ...BOX, x: 30, y: 51 });
  });

  it('clamps the centre into the bounds', () => {
    // Started partly outside the room (x 138–162), so the walls do not stop it.
    const o = box({ x: 150 });
    const moved = moveObstacle(o, -50, 900, OUTLINE, 1);
    expect(moved).toEqual({ ...o, x: 0, y: 168 });
  });

  it('snaps a turned box by its turned bounding box', () => {
    // 20 × 11 turned 90: half extents 5.5 across and 10 down, so min corner (24.9, 40.6) → (25, 41).
    const o = box({ width: 20, depth: 11, rotation: 90 });
    expect(moveObstacle(o, 30.4, 50.6, OUTLINE, 1)).toEqual({ ...o, x: 30.5, y: 51 });
  });

  it('snaps a quarter-turned box exactly, as moveItem does, despite trig noise', () => {
    // 24 × 25 turned 270: half extents exactly 12.5 across and 12 down, so min corner (17.5, 18) → (18, 18).
    // At centre (30, 30) the raw corners put the half width at 12.500000000000004, which would snap to 17.
    const o = box({ x: 30, y: 30, width: 24, depth: 25, rotation: 270 });
    expect(moveObstacle(o, 30, 30, OUTLINE, 1)).toEqual({ ...o, x: 30.5, y: 30 });
  });

  it('places a box exactly where moveItem places the same footprint', () => {
    const item: Item = {
      id: 'i', kind: 'box', name: 'n', host: '', sourceUrl: null, price: null,
      w: 0, d: 0, h: 10, x: 0, y: 0, angle: 0, model: { tier: 'box', label: '', assetUrl: null },
      style: defaultStyle('box'), colours: defaultColours('box'),
    };
    for (const [w, d, angle] of [[24, 25, 0], [24, 25, 90], [24, 25, 180], [24, 25, 270], [20, 11, 30], [7.5, 13, 135]]) {
      for (const [from, to] of [[[30, 30], [30, 30]], [[72, 84], [40.37, 61.5]], [[10, 160], [-5, 170]]]) {
        const o = box({ x: from[0], y: from[1], width: w, depth: d, rotation: angle });
        const i = moveItem({ ...item, x: from[0], y: from[1], w, d, angle }, to[0], to[1], OUTLINE, 1);
        const moved = moveObstacle(o, to[0], to[1], OUTLINE, 1);
        expect([moved.x, moved.y]).toEqual([i.x, i.y]);
      }
    }
  });

  it('snaps a cylinder by its circle, whatever its rotation', () => {
    // Radius 6.5: min corner (23.9, 44.1) → (24, 44).
    const o: Obstacle = { ...COLUMN, width: 13, depth: 13, rotation: 45 };
    expect(moveObstacle(o, 30.4, 50.6, OUTLINE, 1)).toEqual({ ...o, x: 30.5, y: 50.5 });
  });
});

describe('shiftObstacle', () => {
  it('moves by exactly the step', () => {
    const o = box({ x: 30.4, y: 50.6 });
    expect(shiftObstacle(o, 1, 0, OUTLINE)).toEqual({ ...o, x: 31.4 });
  });

  it('clamps into the bounds', () => {
    expect(shiftObstacle(box({ x: 143.5, y: 0.5 }), 12, -12, OUTLINE)).toEqual(box({ x: 144, y: 0 }));
  });
});

describe('moveObstacle and shiftObstacle stop at the walls', () => {
  it('stops a box moved past a wall flush against it', () => {
    expect(moveObstacle(BOX, -30, 84, OUTLINE, 1)).toEqual({ ...BOX, x: 12, y: 84 });
  });

  it('stops a column nudged past a wall flush against it', () => {
    const o: Obstacle = { ...COLUMN, x: 72, y: 84 };
    expect(shiftObstacle(o, 100, 0, OUTLINE)).toEqual({ ...o, x: 138, y: 84 });
  });
});

/** One angled wall, on the line x + y = 244. */
const ANGLED: Point[] = [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 100 }, { x: 76, y: 168 }, { x: 0, y: 168 }];

describe('moveObstacle and shiftObstacle at an angled wall', () => {
  it('stops a box dragged past the bounding box beyond an angled wall where the pointer points', () => {
    // The pointer goes from (100, 100) to (220, 220), 2 in a frame, straight at the angled wall.
    const start = box({ x: 100, y: 100, width: 20, depth: 20 });
    let o = start;
    for (let frame = 1; frame <= 60; frame++) o = moveObstacle(o, 100 + 2 * frame, 100 + 2 * frame, ANGLED, 1);
    expect(o).toEqual({ ...start, x: 112, y: 112 });
  });

  it('nudges a column straight into an angled wall and stops: y never changes', () => {
    // The 16-sided outline reaches 10 in towards the wall, so the column stops at x = 244 − 100 − 10√2.
    let o: Obstacle = { ...COLUMN, x: 100, y: 100, width: 20, depth: 20 };
    for (let i = 0; i < 40; i++) {
      o = shiftObstacle(o, 1, 0, ANGLED);
      expect(o.y).toBe(100);
    }
    expect(o.x).toBe(129.85);
  });
});

describe('updateObstacle', () => {
  const LIST: Obstacle[] = [BOX, COLUMN];

  it('sets the given fields and leaves the rest', () => {
    const next = okObstacles(updateObstacle(LIST, 'o1', { elevation: 40, label: 'AC unit' }));
    expect(next).toEqual([{ ...BOX, elevation: 40, label: 'AC unit' }, COLUMN]);
  });

  it('rounds numbers to 0.01', () => {
    const next = okObstacles(updateObstacle(LIST, 'o1', { width: 20.123, height: 30.456 }));
    expect(next[0]).toEqual({ ...BOX, width: 20.12, height: 30.46 });
  });

  it("sets a cylinder's depth with its width", () => {
    const next = okObstacles(updateObstacle(LIST, 'c1', { width: 18 }));
    expect(next[1]).toEqual({ ...COLUMN, width: 18, depth: 18 });
  });

  it("ignores a depth alone on a cylinder, and a depth beside a width", () => {
    expect(okObstacles(updateObstacle(LIST, 'c1', { depth: 30 }))[1]).toEqual(COLUMN);
    expect(okObstacles(updateObstacle(LIST, 'c1', { width: 18, depth: 30 }))[1]).toEqual({ ...COLUMN, width: 18, depth: 18 });
  });

  it('stores the rotation as an angle in [0, 360)', () => {
    expect(okObstacles(updateObstacle(LIST, 'o1', { rotation: 450 }))[0].rotation).toBe(90);
  });

  it('refuses a size not allowed', () => {
    expect(updateObstacle(LIST, 'o1', { height: 0 })).toEqual({ ok: false, problem: 'obstacle-size' });
  });

  it('leaves the list unchanged for an unknown id', () => {
    expect(updateObstacle(LIST, 'nope', { height: 50 })).toEqual({ ok: true, obstacles: LIST });
  });

  it('ignores fields that may not be patched', () => {
    const patch = { x: 1, id: 'zz', shape: 'cylinder' } as unknown as Parameters<typeof updateObstacle>[2];
    expect(okObstacles(updateObstacle(LIST, 'o1', patch))).toEqual(LIST);
  });
});

describe('immutability', () => {
  it('never mutates its inputs', () => {
    const list = frozen([box(), { ...COLUMN }]);
    const one = Object.freeze(box({ x: 10, y: 10 }));
    const outline = Object.freeze(OUTLINE.map((p) => Object.freeze({ ...p })));
    const at = Object.freeze({ x: 5, y: 6 });
    expect(() => {
      newObstacle('box', at, 96, 'n');
      obstacleFootprint(one);
      obstaclePolygon(one);
      obstaclePolygon(list[1]);
      validateObstacles(list);
      addObstacle(list, one);
      moveObstacle(one, 50, 50, outline, 1);
      shiftObstacle(one, 1, 1, outline);
      updateObstacle(list, 'o1', { width: 30, rotation: 400 });
      updateObstacle(list, 'c1', { width: 18 });
      updateObstacle(list, 'nope', { width: 18 });
    }).not.toThrow();
    expect(list[0]).toEqual(BOX);
    expect(one).toEqual(box({ x: 10, y: 10 }));
  });

  it('returns a new list', () => {
    const list = [BOX];
    const added = okObstacles(addObstacle(list, COLUMN));
    expect(added).not.toBe(list);
    expect(list).toHaveLength(1);
    expect(okObstacles(updateObstacle(list, 'nope', {}))).not.toBe(list);
  });
});

describe('obstacleName', () => {
  it('is the label, or Box / Column by shape when the label is empty; a blank label is kept as it is', () => {
    const o = newObstacle('box', { x: 10, y: 10 }, 96, 'o1');
    const c = newObstacle('cylinder', { x: 10, y: 10 }, 96, 'o2');
    expect(obstacleName({ ...o, label: 'Radiator' })).toBe('Radiator');
    expect(obstacleName({ ...c, label: 'Pillar' })).toBe('Pillar');
    expect(obstacleName({ ...o, label: '' })).toBe('Box');
    expect(obstacleName({ ...c, label: '' })).toBe('Column');
    // Only the empty string falls back, as both call sites did before they shared this rule.
    expect(obstacleName({ ...o, label: '  ' })).toBe('  ');
  });
});

describe('obstacleDisplayName', () => {
  it('is obstacleName alone when no other obstacle shares that name', () => {
    const one = box({ label: '' });
    expect(obstacleDisplayName([one], one)).toBe('Box');
  });

  it('adds (k of n) by list position when n obstacles share the exact name', () => {
    const b1 = box({ id: 'b1', label: '' });
    const col = { ...COLUMN, id: 'k1', label: '' };
    const b2 = box({ id: 'b2', label: '' });
    const list = [b1, col, b2];
    expect(list.map((o) => obstacleDisplayName(list, o))).toEqual(['Box (1 of 2)', 'Column', 'Box (2 of 2)']);
  });

  it('suffixes two obstacles labelled Pillar, and counts an empty-label box with one labelled Box', () => {
    const p1 = { ...COLUMN, id: 'p1', label: 'Pillar' };
    const p2 = box({ id: 'p2', label: 'Pillar' });
    const r = box({ id: 'r', label: 'Radiator' });
    expect([p1, r, p2].map((o, _i, all) => obstacleDisplayName(all, o))).toEqual(['Pillar (1 of 2)', 'Radiator', 'Pillar (2 of 2)']);
    const named = box({ id: 'n', label: 'Box' });
    const unnamed = box({ id: 'u', label: '' });
    expect([named, unnamed].map((o, _i, all) => obstacleDisplayName(all, o))).toEqual(['Box (1 of 2)', 'Box (2 of 2)']);
  });
});
