import { describe, expect, it } from 'vitest';
import {
  DOOR_DEFAULTS,
  OPENING_PROBLEM_TEXT,
  WINDOW_DEFAULTS,
  addOpening,
  openingName,
  openingSpan,
  rehomeOpenings,
  removeOpening,
  slideOpening,
  updateOpening,
  validateOpenings,
  type OpeningsResult,
} from './openings';
import type { Corner, Door, Opening, WindowOpening } from './types';

/** Corners with ids `<prefix>1`, `<prefix>2`, … in the order given. */
function corners(prefix: string, ...xy: [number, number][]): Corner[] {
  return xy.map(([x, y], i) => ({ id: `${prefix}${i + 1}`, x, y }));
}

function okOpenings(result: OpeningsResult): Opening[] {
  if (!result.ok) throw new Error(`expected ok, got ${result.problem}`);
  return result.openings;
}

function win(id: string, wallId: string, offset: number, width = 36): WindowOpening {
  return { id, kind: 'window', wallId, offset, width, sill: 36, height: 48 };
}

/** Freezes the array and every element, so any mutation throws (modules run in strict mode). */
function frozen<T extends object>(list: T[]): readonly T[] {
  list.forEach((x) => Object.freeze(x));
  return Object.freeze(list);
}

/** The room R of the brief: 144 × 168. */
const R = corners('c', [0, 0], [144, 0], [144, 168], [0, 168]);
const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
/** A 720 × 720 room: 60 openings 12 wide fit on its top wall, touching end to end. */
const BIG = corners('b', [0, 0], [720, 0], [720, 720], [0, 720]);

/** n valid 12-wide windows in BIG: the first 60 on wall b1, the rest on wall b2, touching only. */
function many(n: number): Opening[] {
  return Array.from({ length: n }, (_, i) =>
    i < 60 ? win(`w${i}`, 'b1', 12 * i, 12) : win(`w${i}`, 'b2', 12 * (i - 60), 12),
  );
}

describe('constants', () => {
  it('gives the exact text for every problem', () => {
    expect(OPENING_PROBLEM_TEXT).toEqual({
      'opening-off-wall': 'That would leave a door or window without room on its wall.',
      'opening-overlap': 'Doors and windows cannot overlap.',
      'opening-size': 'That size is not allowed.',
      'too-many-openings': 'A room can have at most 64 doors and windows.',
      'corner-in-opening': 'A corner cannot go inside a door or window.',
      'corner-has-openings': 'Remove the doors and windows on these walls first.',
      'shape-has-openings': 'Remove the doors and windows before starting from a shape.',
    });
  });

  it('gives the door and window defaults', () => {
    expect(DOOR_DEFAULTS).toEqual({ width: 32, height: 80, hinge: 'start', swing: 'in' });
    expect(WINDOW_DEFAULTS).toEqual({ width: 36, sill: 36, height: 48 });
  });
});

describe('openingSpan', () => {
  it('spans a door on the top wall', () => {
    expect(openingSpan(R, D1)).toEqual({ a: { x: 20, y: 0 }, b: { x: 52, y: 0 }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, wallIndex: 0 });
  });

  it('spans an opening on the left wall, running up from its start corner', () => {
    const opening = win('w', 'c4', 60, 32);
    expect(openingSpan(R, opening)).toEqual({ a: { x: 0, y: 108 }, b: { x: 0, y: 76 }, u: { x: 0, y: -1 }, n: { x: 1, y: 0 }, wallIndex: 3 });
  });

  it('is null for a wall id not in the outline', () => {
    expect(openingSpan(R, { ...D1, wallId: 'zz' })).toBeNull();
  });
});

describe('openingName', () => {
  it('names an opening by kind and wall alone when its wall has one opening', () => {
    const w = win('w1', 'c2', 20);
    expect(openingName(R, [D1, w], D1)).toBe('Door on wall 1');
    expect(openingName(R, [D1, w], w)).toBe('Window on wall 2');
  });

  it('numbers two doors on one wall by offset, whatever their order in the list', () => {
    const left: Door = { ...D1, id: 'dl', offset: 0 };
    const right: Door = { ...D1, id: 'dr', offset: 56 };
    for (const list of [[left, right], [right, left]]) {
      expect(openingName(R, list, left)).toBe('Door on wall 1 (1 of 2)');
      expect(openingName(R, list, right)).toBe('Door on wall 1 (2 of 2)');
    }
  });

  it('counts every door and window on the wall, as the plan handles always have', () => {
    const early = win('w3', 'c1', 60, 30);
    const late = win('w2', 'c1', 100, 30);
    const list = [late, D1, early, win('w1', 'c2', 20)];
    expect(list.map((o) => openingName(R, list, o))).toEqual([
      'Window on wall 1 (3 of 3)',
      'Door on wall 1 (1 of 3)',
      'Window on wall 1 (2 of 3)',
      'Window on wall 2',
    ]);
  });

  it('counts walls from 1 in outline order', () => {
    const list = [win('w4', 'c4', 60, 32)];
    expect(openingName(R, list, list[0] as Opening)).toBe('Window on wall 4');
  });
});

describe('validateOpenings', () => {
  it('accepts a door that fits', () => {
    expect(validateOpenings(R, [D1])).toBeNull();
  });

  it('accepts an opening flush with the wall end', () => {
    expect(validateOpenings(R, [{ ...D1, offset: 112 }])).toBeNull();
  });

  it('refuses an opening past the wall end', () => {
    expect(validateOpenings(R, [{ ...D1, offset: 113 }])).toBe('opening-off-wall');
  });

  it('refuses a negative offset', () => {
    expect(validateOpenings(R, [{ ...D1, offset: -1 }])).toBe('opening-off-wall');
  });

  it('refuses an unknown wall', () => {
    expect(validateOpenings(R, [{ ...D1, wallId: 'zz' }])).toBe('opening-off-wall');
  });

  it('refuses two openings that overlap on one wall', () => {
    expect(validateOpenings(R, [D1, win('w', 'c1', 50)])).toBe('opening-overlap');
  });

  it('accepts two openings that only touch', () => {
    expect(validateOpenings(R, [D1, win('w', 'c1', 52)])).toBeNull();
  });

  it('does not compare openings on different walls', () => {
    expect(validateOpenings(R, [D1, win('w', 'c2', 20)])).toBeNull();
  });

  it.each<[string, Opening]>([
    ['width 11', { ...D1, width: 11 }],
    ['width 241', { ...win('w', 'b1', 0), width: 241 }],
    ['door height 11', { ...D1, height: 11 }],
    ['door height 241', { ...D1, height: 241 }],
    ['window height 241', { ...win('w', 'c1', 0), height: 241 }],
    ['sill 241', { ...win('w', 'c1', 0), sill: 241 }],
    ['sill -1', { ...win('w', 'c1', 0), sill: -1 }],
    ['width NaN', { ...D1, width: Number.NaN }],
    ['height Infinity', { ...D1, height: Number.POSITIVE_INFINITY }],
    ['sill NaN', { ...win('w', 'c1', 0), sill: Number.NaN }],
    ['offset NaN', { ...D1, offset: Number.NaN }],
  ])('refuses %s as opening-size', (_, opening) => {
    const outline = opening.wallId === 'b1' ? BIG : R;
    expect(validateOpenings(outline, [opening])).toBe('opening-size');
  });

  it('accepts sizes exactly at the limits', () => {
    expect(validateOpenings(BIG, [{ ...win('w', 'b1', 0), width: 240, height: 240, sill: 240 }])).toBeNull();
    expect(validateOpenings(BIG, [{ ...win('w', 'b1', 0), width: 12, height: 12, sill: 0 }])).toBeNull();
  });

  it('accepts 64 openings and refuses 65', () => {
    expect(validateOpenings(BIG, many(64))).toBeNull();
    expect(validateOpenings(BIG, many(65))).toBe('too-many-openings');
  });

  it('reports problems in the order too-many, size, off-wall, overlap', () => {
    expect(validateOpenings(BIG, [...many(64), { ...win('x', 'zz', 0), width: 1 }])).toBe('too-many-openings');
    expect(validateOpenings(R, [{ ...D1, wallId: 'zz' }, { ...D1, id: 'd2', width: 1 }])).toBe('opening-size');
    expect(validateOpenings(R, [D1, win('w', 'c1', 30), { ...D1, id: 'd2', offset: 500 }])).toBe('opening-off-wall');
  });
});

describe('addOpening', () => {
  it('adds a door centred on the click', () => {
    expect(okOpenings(addOpening(R, [], 'door', 'c1', { x: 72, y: 5 }, 'n1'))).toEqual([
      { id: 'n1', kind: 'door', wallId: 'c1', offset: 56, width: 32, height: 80, hinge: 'start', swing: 'in' },
    ]);
  });

  it('clamps a door near the wall end onto the wall', () => {
    const [door] = okOpenings(addOpening(R, [], 'door', 'c1', { x: 140, y: 0 }, 'n1'));
    expect(door.offset).toBe(112);
  });

  it('clamps a door near the wall start onto the wall', () => {
    const [door] = okOpenings(addOpening(R, [], 'door', 'c1', { x: 3, y: 0 }, 'n1'));
    expect(door.offset).toBe(0);
  });

  it('adds a window with the window defaults', () => {
    expect(okOpenings(addOpening(R, [], 'window', 'c2', { x: 144, y: 118 }, 'n1'))).toEqual([
      { id: 'n1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 36, height: 48 },
    ]);
  });

  it('narrows the door to a wall shorter than the default', () => {
    const outline = corners('s', [0, 0], [20, 0], [20, 100], [0, 100]);
    const [door] = okOpenings(addOpening(outline, [], 'door', 's1', { x: 15, y: 0 }, 'n1'));
    expect(door).toMatchObject({ width: 20, offset: 0 });
  });

  it('keeps the width to two decimals and on the wall when the short wall has an irrational length', () => {
    // Wall s1 is 19.98990…; round2 would round it up to 19.99, past the wall end.
    const outline = corners('s', [0, 0], [14.13, 14.14], [-60, 80]);
    const length = Math.hypot(14.13, 14.14);
    const [door] = okOpenings(addOpening(outline, [], 'door', 's1', { x: 7, y: 7 }, 'n1'));
    expect(door.width).toBeLessThanOrEqual(length);
    expect(door.width).toBe(Math.round(door.width * 100) / 100);
    expect(length - door.width).toBeLessThan(0.01);
    expect(door.offset).toBe(0);
  });

  it('takes the full width of a diagonal wall exactly 12 long despite floating-point noise', () => {
    // (3.22, 4.19) → (10.42, 13.79) is 12 long but computes as 11.999999999999996.
    const outline = corners('s', [3.22, 4.19], [10.42, 13.79], [-20, 30]);
    const [door] = okOpenings(addOpening(outline, [], 'door', 's1', { x: 6, y: 8 }, 'n1'));
    expect(door).toMatchObject({ width: 12, offset: 0 });
  });

  it('takes the full width of a diagonal wall 12.55 long despite floating-point noise', () => {
    // (0, 0) → (7.53, 10.04) is 12.55 long but computes as 12.549999999999999.
    const outline = corners('s', [0, 0], [7.53, 10.04], [-20, 30]);
    const [door] = okOpenings(addOpening(outline, [], 'door', 's1', { x: 3, y: 4 }, 'n1'));
    expect(door).toMatchObject({ width: 12.55, offset: 0 });
  });

  it('refuses a wall shorter than the narrowest opening', () => {
    const outline = corners('s', [0, 0], [10, 0], [10, 100], [0, 100]);
    expect(addOpening(outline, [], 'door', 's1', { x: 5, y: 0 }, 'n1')).toEqual({ ok: false, problem: 'opening-off-wall' });
  });

  it('refuses an opening that would overlap another', () => {
    expect(addOpening(R, [D1], 'door', 'c1', { x: 40, y: 0 }, 'n1')).toEqual({ ok: false, problem: 'opening-overlap' });
  });

  it('refuses a 65th opening and accepts a 64th', () => {
    expect(addOpening(BIG, many(64), 'door', 'b3', { x: 360, y: 720 }, 'n1')).toEqual({ ok: false, problem: 'too-many-openings' });
    expect(okOpenings(addOpening(BIG, many(63), 'door', 'b3', { x: 360, y: 720 }, 'n1'))).toHaveLength(64);
  });

  it('keeps the existing openings and appends the new one', () => {
    const list = okOpenings(addOpening(R, [D1], 'window', 'c1', { x: 100, y: 0 }, 'n1'));
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual(D1);
    expect(list[1]).toMatchObject({ id: 'n1', wallId: 'c1', offset: 82 });
  });

  it('leaves the list unchanged for an unknown wall', () => {
    expect(okOpenings(addOpening(R, [D1], 'door', 'zz', { x: 0, y: 0 }, 'n1'))).toEqual([D1]);
  });

  it('refuses a point that is not finite', () => {
    expect(addOpening(R, [], 'door', 'c1', { x: Number.NaN, y: 0 }, 'n1')).toEqual({ ok: false, problem: 'opening-size' });
  });
});

describe('slideOpening', () => {
  it('rounds the offset to 1 in', () => {
    expect(okOpenings(slideOpening(R, [D1], 'd1', 60.4))).toEqual([{ ...D1, offset: 60 }]);
  });

  it('clamps past the wall end', () => {
    expect(okOpenings(slideOpening(R, [D1], 'd1', 500))).toEqual([{ ...D1, offset: 112 }]);
  });

  it('clamps before the wall start', () => {
    expect(okOpenings(slideOpening(R, [D1], 'd1', -30))).toEqual([{ ...D1, offset: 0 }]);
  });

  it('refuses a slide into another opening', () => {
    expect(slideOpening(R, [D1, win('w', 'c1', 60)], 'd1', 40)).toEqual({ ok: false, problem: 'opening-overlap' });
  });

  it('leaves the list unchanged for an unknown id', () => {
    expect(okOpenings(slideOpening(R, [D1], 'zz', 40))).toEqual([D1]);
  });
});

describe('updateOpening', () => {
  it('changes only the fields given', () => {
    expect(okOpenings(updateOpening(R, [D1], 'd1', { width: 36, hinge: 'end' }))).toEqual([{ ...D1, width: 36, hinge: 'end' }]);
  });

  it('stores sizes rounded to 0.01 and ignores fields of the other kind', () => {
    const patch = { width: 36.004, sill: 20 } as Parameters<typeof updateOpening>[3];
    expect(okOpenings(updateOpening(R, [D1], 'd1', patch))).toEqual([{ ...D1, width: 36 }]);
  });

  it('changes a window sill', () => {
    expect(okOpenings(updateOpening(R, [win('w', 'c1', 0)], 'w', { sill: 20 }))).toEqual([{ ...win('w', 'c1', 0), sill: 20 }]);
  });

  it('refuses a width that runs off the wall', () => {
    expect(updateOpening(R, [D1], 'd1', { width: 130 })).toEqual({ ok: false, problem: 'opening-off-wall' });
  });

  it('refuses a size outside the limits', () => {
    expect(updateOpening(R, [D1], 'd1', { height: 241 })).toEqual({ ok: false, problem: 'opening-size' });
  });

  it('leaves the list unchanged for an unknown id', () => {
    expect(okOpenings(updateOpening(R, [D1], 'zz', { width: 36 }))).toEqual([D1]);
  });
});

describe('removeOpening', () => {
  it('removes the opening', () => {
    expect(removeOpening([D1], 'd1')).toEqual([]);
  });

  it('returns an equal list for an unknown id', () => {
    expect(removeOpening([D1], 'zz')).toEqual([D1]);
  });
});

describe('rehomeOpenings', () => {
  const withC2At = (x: number, y: number): Corner[] => R.map((c) => (c.id === 'c2' ? { id: 'c2', x, y } : c));
  const inserted = (x: number, y: number): Corner[] => [R[0], { id: 'n1', x, y }, ...R.slice(1)];

  it('keeps openings when a corner moves', () => {
    expect(okOpenings(rehomeOpenings(R, withC2At(100, 0), [D1]))).toEqual([D1]);
  });

  it('refuses a move that leaves an opening without room on its wall', () => {
    expect(rehomeOpenings(R, withC2At(50, 0), [D1])).toEqual({ ok: false, problem: 'opening-off-wall' });
    expect(okOpenings(rehomeOpenings(R, withC2At(52, 0), [D1]))).toEqual([D1]);
  });

  it('keeps an opening before a corner added after it', () => {
    expect(okOpenings(rehomeOpenings(R, inserted(60, 0), [D1]))).toEqual([D1]);
  });

  it('moves an opening past a corner added before it onto the new wall', () => {
    expect(okOpenings(rehomeOpenings(R, inserted(10, 0), [D1]))).toEqual([{ ...D1, wallId: 'n1', offset: 10 }]);
  });

  it('refuses a corner added inside an opening', () => {
    expect(rehomeOpenings(R, inserted(40, 0), [D1])).toEqual({ ok: false, problem: 'corner-in-opening' });
  });

  it('accepts a corner added exactly at either end of an opening', () => {
    expect(okOpenings(rehomeOpenings(R, inserted(52, 0), [D1]))).toEqual([D1]);
    expect(okOpenings(rehomeOpenings(R, inserted(20, 0), [D1]))).toEqual([{ ...D1, wallId: 'n1', offset: 0 }]);
  });

  it('leaves openings on other walls alone when a corner is added', () => {
    const other = win('w', 'c3', 10);
    expect(okOpenings(rehomeOpenings(R, inserted(10, 0), [D1, other]))).toEqual([{ ...D1, wallId: 'n1', offset: 10 }, other]);
  });

  it('handles a corner added on the closing wall, between the last and the first corner', () => {
    const opening = win('w', 'c4', 60, 32);
    const after = (y: number): Corner[] => [{ id: 'n1', x: 0, y }, ...R];
    expect(okOpenings(rehomeOpenings(R, after(48), [opening]))).toEqual([opening]);
    expect(okOpenings(rehomeOpenings(R, after(128), [opening]))).toEqual([{ ...opening, wallId: 'n1', offset: 20 }]);
    expect(rehomeOpenings(R, after(84), [opening])).toEqual({ ok: false, problem: 'corner-in-opening' });
  });

  it('handles a corner added at the last index of the outline', () => {
    const opening = win('w', 'c4', 60, 32);
    const after = (y: number): Corner[] => [...R, { id: 'n1', x: 0, y }];
    expect(okOpenings(rehomeOpenings(R, after(48), [opening]))).toEqual([opening]);
    expect(okOpenings(rehomeOpenings(R, after(128), [opening]))).toEqual([{ ...opening, wallId: 'n1', offset: 20 }]);
  });

  it('keeps an opening flush with the end of a diagonal wall on it when a corner is added before it', () => {
    // Wall q1 is 107.7033 long; the door is flush with its end. After N, wall n1 is 104.8492 long:
    // round2(75.70 − 2.8541) = 72.85 would end at 104.85, so the offset is clamped to 72.84.
    const before = corners('q', [0, 0], [100, 40], [0, 100]);
    const after: Corner[] = [before[0], { id: 'n1', x: 2.65, y: 1.06 }, ...before.slice(1)];
    const door: Door = { ...D1, wallId: 'q1', offset: 75.7, width: 32 };
    expect(validateOpenings(before, [door])).toBeNull();
    expect(okOpenings(rehomeOpenings(before, after, [door]))).toEqual([{ ...door, wallId: 'n1', offset: 72.84 }]);
  });

  it('refuses removing a corner on whose walls an opening sits', () => {
    const after = R.filter((c) => c.id !== 'c2');
    expect(rehomeOpenings(R, after, [D1])).toEqual({ ok: false, problem: 'corner-has-openings' });
    expect(rehomeOpenings(R, after, [win('w', 'c2', 10)])).toEqual({ ok: false, problem: 'corner-has-openings' });
    const onC3 = { ...D1, wallId: 'c3' };
    expect(okOpenings(rehomeOpenings(R, after, [onC3]))).toEqual([onC3]);
  });

  it('keeps each opening on its physical wall when the order is reversed', () => {
    const before = corners('t', [0, 0], [100, 0], [0, 100]);
    const after: Corner[] = [{ id: 't3', x: 0, y: -100 }, { id: 't2', x: 100, y: 0 }, { id: 't1', x: 0, y: 0 }];
    const door: Door = { ...D1, wallId: 't1', offset: 10, width: 30, hinge: 'start' };
    expect(okOpenings(rehomeOpenings(before, after, [door]))).toEqual([{ ...door, wallId: 't2', offset: 60, hinge: 'end' }]);
    expect(okOpenings(rehomeOpenings(before, after, [{ ...door, hinge: 'end' }]))).toEqual([
      { ...door, wallId: 't2', offset: 60, hinge: 'start' },
    ]);
    const window = win('w', 't1', 10, 30);
    expect(okOpenings(rehomeOpenings(before, after, [window]))).toEqual([{ ...window, wallId: 't2', offset: 60 }]);
  });

  it('wraps to the last corner when the first corner of the array is removed', () => {
    const after = R.slice(1);
    expect(rehomeOpenings(R, after, [win('w', 'c4', 10)])).toEqual({ ok: false, problem: 'corner-has-openings' });
    expect(rehomeOpenings(R, after, [D1])).toEqual({ ok: false, problem: 'corner-has-openings' });
    const onC2 = win('w', 'c2', 10);
    expect(okOpenings(rehomeOpenings(R, after, [onC2]))).toEqual([onC2]);
  });

  it('measures the reversed offset with the wall length in after', () => {
    const before = corners('t', [0, 0], [100, 0], [0, 100]);
    const after: Corner[] = [{ id: 't3', x: 0, y: -100 }, { id: 't2', x: 120, y: 0 }, { id: 't1', x: 0, y: 0 }];
    const door: Door = { ...D1, wallId: 't1', offset: 10, width: 30, hinge: 'start' };
    expect(okOpenings(rehomeOpenings(before, after, [door]))).toEqual([{ ...door, wallId: 't2', offset: 80, hinge: 'end' }]);
  });

  it('reverses openings on the first and on the closing wall of a 4-corner outline', () => {
    // R mirrored across y = 0 and listed in reverse, which keeps the signed area positive.
    const after: Corner[] = [{ id: 'c4', x: 0, y: -168 }, { id: 'c3', x: 144, y: -168 }, { id: 'c2', x: 144, y: 0 }, { id: 'c1', x: 0, y: 0 }];
    const closing = win('w', 'c4', 60, 32);
    expect(okOpenings(rehomeOpenings(R, after, [D1, closing]))).toEqual([
      { ...D1, wallId: 'c2', offset: 92, hinge: 'end' },
      { ...closing, wallId: 'c1', offset: 76 },
    ]);
  });

  it('keeps a reversed opening on a diagonal wall when rounding would push it past the end', () => {
    // Wall t1 → t2 is 42.0595 long: round2(42.0595 − 0 − 30) = 12.06 would end at 42.06, so it is clamped to 12.05.
    const before = corners('t', [0, 0], [40, 13], [0, 100]);
    const after: Corner[] = [{ id: 't3', x: 20, y: -50 }, { id: 't2', x: 40, y: 13 }, { id: 't1', x: 0, y: 0 }];
    const door: Door = { ...D1, wallId: 't1', offset: 0, width: 30, hinge: 'start' };
    expect(okOpenings(rehomeOpenings(before, after, [door]))).toEqual([{ ...door, wallId: 't2', offset: 12.05, hinge: 'end' }]);
  });

  it('refuses a reversed opening whose wall became too short, rather than sliding it', () => {
    // Before: wall t2 → t3 is |(0,100) − (100,0)| = 141.42; the window spans 100…130 on it.
    // After (t3 dragged to (50,−30), order reversed): wall t3 → t2 is |(100,0) − (50,−30)| = 58.31,
    // so the raw offset is 58.31 − 100 − 30 = −71.69: it no longer fits.
    const before = corners('t', [0, 0], [100, 0], [0, 100]);
    const after: Corner[] = [{ id: 't3', x: 50, y: -30 }, { id: 't2', x: 100, y: 0 }, { id: 't1', x: 0, y: 0 }];
    const window = win('w', 't2', 100, 30);
    expect(validateOpenings(before, [window])).toBeNull();
    expect(rehomeOpenings(before, after, [window])).toEqual({ ok: false, problem: 'opening-off-wall' });
  });

  it('refuses the same shrink without a reversal', () => {
    // t3 moved to (50,30): wall t2 → t3 is |(50,30) − (100,0)| = 58.31 < 130, order unchanged.
    const before = corners('t', [0, 0], [100, 0], [0, 100]);
    const after = corners('t', [0, 0], [100, 0], [50, 30]);
    expect(rehomeOpenings(before, after, [win('w', 't2', 100, 30)])).toEqual({ ok: false, problem: 'opening-off-wall' });
  });

  describe('reversed offset within rounding noise of the wall', () => {
    // Wall t1 → t2 before is |(40,14)| = 42.38; the door spans 12.06…42.06 on it. After the reversal
    // wall t2 → t1 is |(40, y)|, and the raw new offset is that length − 12.06 − 30.
    const before = corners('t', [0, 0], [40, 14], [0, 100]);
    const after = (y: number): Corner[] => [{ id: 't3', x: 20, y: -50 }, { id: 't2', x: 40, y }, { id: 't1', x: 0, y: 0 }];
    const door: Door = { ...D1, wallId: 't1', offset: 12.06, width: 30, hinge: 'start' };

    it('accepts a raw offset of −0.0036 (length 42.0564) at 0', () => {
      expect(okOpenings(rehomeOpenings(before, after(12.99), [door]))).toEqual([{ ...door, wallId: 't2', offset: 0, hinge: 'end' }]);
    });

    it('clamps a raw offset of −0.0067 (length 42.0533), which rounds to −0.01, to 0', () => {
      expect(okOpenings(rehomeOpenings(before, after(12.98), [door]))).toEqual([{ ...door, wallId: 't2', offset: 0, hinge: 'end' }]);
    });

    it('refuses a raw offset of −0.0129 (length 42.0471), beyond the 0.01 of noise', () => {
      expect(rehomeOpenings(before, after(12.96), [door])).toEqual({ ok: false, problem: 'opening-off-wall' });
    });

    it('refuses a raw offset of −0.48 (length 41.5791)', () => {
      expect(rehomeOpenings(before, after(11.35), [door])).toEqual({ ok: false, problem: 'opening-off-wall' });
    });
  });

  it('refuses an opening moved past the end of the new wall when a corner is added, rather than sliding it back', () => {
    // n1 (10,0) is added and c2 moves to (50,0): wall n1 is 40 long, D1's raw offset 20 − 10 = 10 > 40 − 32 + 0.01.
    const after: Corner[] = [R[0], { id: 'n1', x: 10, y: 0 }, { id: 'c2', x: 50, y: 0 }, R[2], R[3]];
    expect(rehomeOpenings(R, after, [D1])).toEqual({ ok: false, problem: 'opening-off-wall' });
  });

  it('refuses replacing the outline while there are openings', () => {
    const after = corners('x', [0, 0], [100, 0], [100, 100], [0, 100]);
    expect(rehomeOpenings(R, after, [D1])).toEqual({ ok: false, problem: 'shape-has-openings' });
    expect(rehomeOpenings(R, after, [])).toEqual({ ok: true, openings: [] });
  });

  it('accepts every change with no openings', () => {
    const before = corners('t', [0, 0], [100, 0], [0, 100]);
    expect(rehomeOpenings(R, withC2At(50, 0), [])).toEqual({ ok: true, openings: [] });
    expect(rehomeOpenings(R, inserted(40, 0), [])).toEqual({ ok: true, openings: [] });
    expect(rehomeOpenings(R, R.filter((c) => c.id !== 'c2'), [])).toEqual({ ok: true, openings: [] });
    expect(rehomeOpenings(before, before.slice().reverse(), [])).toEqual({ ok: true, openings: [] });
  });
});

describe('rehomeOpenings across edits of several corners', () => {
  /** Corners from `[id, x, y]` triples, in the order given. */
  const outline = (...entries: [string, number, number][]): Corner[] => entries.map(([id, x, y]) => ({ id, x, y }));
  const T = outline(['c1', 0, 0], ['m1', 48, 0], ['m2', 96, 0], ['c2', 144, 0], ['c3', 144, 168], ['c4', 0, 168]);
  const U = outline(
    ['c1', 0, 0], ['x1', 48, 0], ['m1', 48, 24], ['x2', 96, 24], ['m2', 96, 0], ['c2', 144, 0], ['c3', 144, 168], ['c4', 0, 168],
  );
  const Q = outline(['q1', 0, 0], ['q2', 100, 0], ['q3', 150, 50], ['q4', 150, 150], ['q5', 0, 150]);
  const onC1: Door = { ...D1, wallId: 'c1', offset: 8, width: 32 };
  const onM1: Door = { ...D1, id: 'd2', wallId: 'm1', offset: 8, width: 32 };
  const onM2 = win('w', 'm2', 6);

  it('keeps every opening when a step is created (two corners added)', () => {
    expect(okOpenings(rehomeOpenings(T, U, [onC1, onM1, onM2]))).toEqual([onC1, onM1, onM2]);
  });

  it('keeps every opening when a step is removed (two corners removed)', () => {
    expect(okOpenings(rehomeOpenings(U, T, [onC1, onM1, onM2]))).toEqual([onC1, onM1, onM2]);
  });

  it('refuses an opening on a removed step', () => {
    expect(rehomeOpenings(U, T, [win('w', 'x1', 0, 12)])).toEqual({ ok: false, problem: 'corner-has-openings' });
  });

  describe('a wall slid until its neighbour is used up', () => {
    const after = outline(['q1', 0, 50], ['q3', 150, 50], ['q4', 150, 150], ['q5', 0, 150]);

    it('keeps an opening on the slid wall', () => {
      const door: Door = { ...D1, wallId: 'q1', offset: 10, width: 32 };
      expect(okOpenings(rehomeOpenings(Q, after, [door]))).toEqual([door]);
    });

    it('refuses an opening on the used-up wall', () => {
      expect(rehomeOpenings(Q, after, [win('w', 'q2', 10, 36)])).toEqual({ ok: false, problem: 'corner-has-openings' });
    });
  });

  describe('two corners added on one straight wall', () => {
    const after = outline(['c1', 0, 0], ['n1', 40, 0], ['n2', 100, 0], ['c2', 144, 0], ['c3', 144, 168], ['c4', 0, 168]);

    it('moves each opening onto the new wall it lies on', () => {
      const [a, b, c] = [win('a', 'c1', 50), win('b', 'c1', 104), win('c', 'c1', 2)];
      expect(okOpenings(rehomeOpenings(R, after, [a, b, c]))).toEqual([
        { ...a, wallId: 'n1', offset: 10 },
        { ...b, wallId: 'n2', offset: 4 },
        c,
      ]);
    });

    it('refuses an opening across an added corner', () => {
      expect(rehomeOpenings(R, after, [D1])).toEqual({ ok: false, problem: 'corner-in-opening' });
    });
  });

  describe('a corner in a straight run removed', () => {
    const after = T.filter((c) => c.id !== 'm1');

    it('keeps a door on the wall before it, since that wall keeps its direction', () => {
      expect(okOpenings(rehomeOpenings(T, after, [onC1]))).toEqual([onC1]);
    });

    it('refuses a door on its own wall', () => {
      expect(rehomeOpenings(T, after, [onM1])).toEqual({ ok: false, problem: 'corner-has-openings' });
    });
  });

  it('refuses a door on a wall whose direction changes when a corner is removed', () => {
    expect(rehomeOpenings(R, R.filter((c) => c.id !== 'c2'), [D1])).toEqual({ ok: false, problem: 'corner-has-openings' });
  });

  it('refuses an outline with no ids in common', () => {
    const after = outline(['z1', 0, 0], ['z2', 144, 0], ['z3', 144, 168], ['z4', 0, 168]);
    expect(rehomeOpenings(R, after, [D1])).toEqual({ ok: false, problem: 'shape-has-openings' });
  });

  it('refuses common ids that are out of order', () => {
    const after = outline(['c1', 0, 0], ['c3', 144, 0], ['c2', 144, 168], ['c4', 0, 168]);
    expect(rehomeOpenings(R, after, [D1])).toEqual({ ok: false, problem: 'shape-has-openings' });
  });

  it('refuses a slid wall too short for its door', () => {
    const after = outline(['q1', 70, 0], ['q2', 100, 0], ['q3', 150, 50], ['q4', 150, 150], ['q5', 70, 150]);
    const door: Door = { ...D1, wallId: 'q1', offset: 0, width: 32 };
    expect(rehomeOpenings(Q, after, [door])).toEqual({ ok: false, problem: 'opening-off-wall' });
  });

  it('never mutates its inputs', () => {
    const before = frozen(T.map((c) => ({ ...c })));
    const after = frozen(U.map((c) => ({ ...c })));
    const added = frozen(outline(['c1', 0, 0], ['n1', 40, 0], ['n2', 100, 0], ['c2', 144, 0], ['c3', 144, 168], ['c4', 0, 168]));
    const openings = frozen([{ ...onC1 }, { ...onM1 }, { ...onM2 }]);
    const moving = frozen([win('a', 'c1', 50)]);
    const copies = structuredClone([before, after, added, openings, moving]);

    okOpenings(rehomeOpenings(before, after, openings));
    okOpenings(rehomeOpenings(after, before, openings));
    expect(okOpenings(rehomeOpenings(R, added, moving))).toEqual([{ ...moving[0], wallId: 'n1', offset: 10 }]);

    expect([before, after, added, openings, moving]).toEqual(copies);
  });
});

describe('immutability', () => {
  it('never mutates its inputs', () => {
    const outline = frozen(R.map((c) => ({ ...c })));
    const openings = frozen([{ ...D1 }, win('w', 'c2', 10)]);
    const outlineCopy = structuredClone(outline);
    const openingsCopy = structuredClone(openings);
    const after = frozen([outline[0], { id: 'n1', x: 10, y: 0 }, ...outline.slice(1)]);
    const reversedBefore = frozen(corners('t', [0, 0], [100, 0], [0, 100]));
    const reversedAfter = frozen([{ id: 't3', x: 0, y: -100 }, { id: 't2', x: 100, y: 0 }, { id: 't1', x: 0, y: 0 }]);
    const reversedOpenings = frozen([{ ...D1, wallId: 't1', offset: 10, width: 30 }]);

    openingSpan(outline, openings[0]);
    validateOpenings(outline, openings);
    const added = okOpenings(addOpening(outline, openings, 'door', 'c3', { x: 72, y: 168 }, 'n1'));
    const slid = okOpenings(slideOpening(outline, openings, 'd1', 30));
    const updated = okOpenings(updateOpening(outline, openings, 'd1', { width: 36 }));
    const removed = removeOpening(openings, 'd1');
    const rehomed = okOpenings(rehomeOpenings(outline, after, openings));
    okOpenings(rehomeOpenings(reversedBefore, reversedAfter, reversedOpenings));

    expect(outline).toEqual(outlineCopy);
    expect(openings).toEqual(openingsCopy);
    expect(reversedOpenings[0]).toMatchObject({ wallId: 't1', offset: 10, hinge: 'start' });
    // Untouched openings come back with equal values.
    for (const list of [added, slid, updated, removed, rehomed]) expect(list).toContainEqual(openingsCopy[1]);
  });
});
