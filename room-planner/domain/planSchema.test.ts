import { describe, expect, it } from 'vitest';
import { createInitialDocument } from './catalog';
import { parsePlan, type ParseResult } from './planSchema';
import type { Corner, Item, Kind, ModelTier, PlanDocument } from './types';

type Obj = Record<string, unknown>;
type Path = readonly (string | number)[];

/** Today's seeded document after a JSON round trip, as storage would hand it back. */
function v2Seed(): Obj {
  return JSON.parse(JSON.stringify(createInitialDocument())) as Obj;
}

/** The version 1 seeded document exactly as slice A wrote it (commit 6ed5e96, createInitialDocument). */
function v1Seed(): Obj {
  return {
    schemaVersion: 1,
    units: 'ft',
    room: { w: 144, l: 168, h: 96 },
    items: [
      {
        id: 'seed-bed', kind: 'bed', name: 'Low platform bed, queen', host: 'shop.example',
        sourceUrl: null, price: 890, w: 64, d: 85, h: 38, x: 40, y: 0, rot: 0,
        model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
      },
      {
        id: 'seed-desk', kind: 'desk', name: 'Tack writing desk', host: 'shop.example',
        sourceUrl: null, price: 420, w: 55, d: 26, h: 30, x: 118, y: 104, rot: 1,
        model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
      },
    ],
  };
}

function clone(base: Obj): Obj {
  return JSON.parse(JSON.stringify(base)) as Obj;
}

/** Walks to the parent of the last path segment. */
function parentOf(root: Obj, path: Path): Record<string | number, unknown> {
  let node = root as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  return node;
}

/** A deep copy of base with the value at path replaced (any value, including NaN or a getter-free object). */
function set(base: Obj, path: Path, value: unknown): Obj {
  const copy = clone(base);
  parentOf(copy, path)[path[path.length - 1]] = value;
  return copy;
}

/** A deep copy of base with the key at path removed. */
function drop(base: Obj, path: Path): Obj {
  const copy = clone(base);
  delete parentOf(copy, path)[path[path.length - 1]];
  return copy;
}

function accepted(input: unknown): PlanDocument {
  const result = parsePlan(input);
  if (!result.ok) throw new Error(`expected ok, refused with "${result.reason}"`);
  return result.doc;
}

function refusal(reason: string): ParseResult {
  return { ok: false, newer: false, reason };
}

/** Corners with ids c1, c2, … in the order given. */
function corners(...xy: [number, number][]): Corner[] {
  return xy.map(([x, y], i) => ({ id: `c${i + 1}`, x, y }));
}

/** A regular n-gon of radius r about (cx, cy), positive signed area, coordinates rounded to 0.01. */
function regular(n: number, r: number, cx: number, cy: number): Corner[] {
  return Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    return { id: `c${k + 1}`, x: Math.round((cx + r * Math.cos(a)) * 100) / 100, y: Math.round((cy + r * Math.sin(a)) * 100) / 100 };
  });
}

function withOutline(outline: unknown): Obj {
  return set(v2Seed(), ['room', 'outline'], outline);
}

/** `count` copies of the seed bed with distinct ids i1, i2, …. */
function manyItems(count: number): Obj[] {
  const bed = (v2Seed().items as Obj[])[0];
  return Array.from({ length: count }, (_, k) => ({ ...clone(bed), id: `i${k + 1}` }));
}

const MARKER = 'SECRET-MARKER';
/** Every reason is a short "<path>: <rule>" built from known field names, indices and rule names. */
const REASON_FORMAT = /^[A-Za-z0-9.?]+: [a-z_-]+$/;

const KINDS: Kind[] = ['sofa', 'chair', 'bed', 'desk', 'table', 'shelf', 'rug', 'box'];
const TIERS: ModelTier[] = ['retailer', 'generated', 'parametric', 'box'];

describe('parsePlan — behaviour', () => {
  it('accepts the current seeded document after a JSON round trip, deep-equal to it', () => {
    const input = v2Seed();
    expect(parsePlan(input)).toEqual({ ok: true, doc: createInitialDocument() });
  });

  it('returns a new object that shares nothing with the input', () => {
    const input = v2Seed();
    const doc = accepted(input);
    expect(doc).not.toBe(input);
    expect(doc.room).not.toBe(input.room);
    expect(doc.items[0]).not.toBe((input.items as Obj[])[0]);
    (input.items as Obj[])[0].name = 'changed';
    ((input.room as Obj).outline as Obj[])[0].x = 5;
    expect(doc).toEqual(createInitialDocument());
  });

  it('converts a version 1 room to a rectangle outline c1…c4 with its height, at version 2', () => {
    const doc = accepted(set(v1Seed(), ['items'], []));
    expect(doc.schemaVersion).toBe(2);
    expect(doc.room).toEqual({
      outline: [{ id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 144, y: 0 }, { id: 'c3', x: 144, y: 168 }, { id: 'c4', x: 0, y: 168 }],
      height: 96,
    });
  });

  it('converts version 1 items from top-left and quarter turns to centre and angle', () => {
    const [bed, desk] = accepted(v1Seed()).items;
    expect([desk.x, desk.y, desk.angle]).toEqual([131, 131.5, 90]);
    expect([bed.x, bed.y, bed.angle]).toEqual([72, 42.5, 0]);
  });

  it('converts version 1 half and three-quarter turns', () => {
    const half = accepted(set(set(v1Seed(), ['items', 1, 'rot'], 2), ['items', 1, 'x'], 10)).items[1];
    expect([half.x, half.y, half.angle]).toEqual([37.5, 117, 180]);
    const three = accepted(set(v1Seed(), ['items', 1, 'rot'], 3)).items[1];
    expect([three.x, three.y, three.angle]).toEqual([131, 131.5, 270]);
  });

  it('converts the whole version 1 seeded document to today’s seeded document', () => {
    expect(parsePlan(v1Seed())).toEqual({ ok: true, doc: createInitialDocument() });
  });

  it('checks every version 2 limit after converting version 1 (a top-left at 1440 puts the centre past 1440)', () => {
    expect(parsePlan(set(v1Seed(), ['items', 0, 'x'], 1440))).toEqual(refusal('items.0.x: too_big'));
  });

  it('drops unknown keys at every level, including __proto__, constructor and prototype, with plain prototypes', () => {
    const evil = '"__proto__":{"polluted":true,"schemaVersion":3},"constructor":{"prototype":{"polluted":true}},'
      + '"prototype":{"polluted":true},"extra":"x",';
    // Every "{" in the seed's JSON opens an object (no string in it has a brace), so this reaches every level.
    const text = JSON.stringify(createInitialDocument()).replace(/\{/g, `{${evil}`);
    const input: unknown = JSON.parse(text);
    expect(Object.keys(input as Obj)).toContain('__proto__');
    const doc = accepted(input);
    expect(doc).toEqual(createInitialDocument());
    const objects: object[] = [doc, doc.room, ...doc.room.outline, ...doc.items, ...doc.items.map((i) => i.model)];
    for (const o of objects) {
      expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(o, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(o, 'constructor')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(o, 'prototype')).toBe(false);
      expect((o as Obj).polluted).toBeUndefined();
    }
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'units', 'room', 'items']);
    expect(Object.keys(doc.room)).toEqual(['outline', 'height']);
    expect(Object.keys(doc.room.outline[0])).toEqual(['id', 'x', 'y']);
    expect(Object.keys(doc.items[0])).toEqual([
      'id', 'kind', 'name', 'host', 'sourceUrl', 'price', 'w', 'd', 'h', 'x', 'y', 'angle', 'model',
    ]);
    expect(Object.keys(doc.items[0].model)).toEqual(['tier', 'label', 'assetUrl']);
    expect(({} as Obj).polluted).toBeUndefined();
  });

  it('drops unknown keys in a version 1 document too, including the stale rot', () => {
    const input = set(set(v1Seed(), ['items', 0, 'angle'], 45), ['room', 'outline'], 'x');
    const doc = accepted(input);
    expect(doc).toEqual(createInitialDocument());
    expect(Object.keys(doc.room)).toEqual(['outline', 'height']);
    expect(Object.prototype.hasOwnProperty.call(doc.items[0], 'rot')).toBe(false);
  });

  it.each([
    ['null', null],
    ['a string', '{"schemaVersion":2}'],
    ['an array', [v2Seed()]],
    ['a number', 2],
    ['undefined', undefined],
    ['a boolean', true],
    ['a function', () => v2Seed()],
    ['a symbol', Symbol('plan')],
    ['a bigint', BigInt(2)],
  ])('refuses %s as not an object', (_name, input) => {
    expect(parsePlan(input)).toEqual(refusal('document: not-an-object'));
  });

  it.each([3, 40, 1e21])('refuses schemaVersion %s as newer', (version) => {
    expect(parsePlan(set(v2Seed(), ['schemaVersion'], version))).toEqual({ ok: false, newer: true, reason: 'schemaVersion: newer' });
  });

  it('refuses a newer version even when nothing else in it is readable', () => {
    expect(parsePlan({ schemaVersion: 3 })).toEqual({ ok: false, newer: true, reason: 'schemaVersion: newer' });
  });

  it.each([
    ['0', 0], ['-1', -1], ['-3', -3], ['2.5', 2.5], ['3.5', 3.5], ['"2"', '2'], ['"3"', '3'], ['null', null],
    ['true', true], ['NaN', NaN], ['Infinity', Infinity], ['an object', { v: 2 }],
  ])('refuses schemaVersion %s as unsupported, not newer', (_name, version) => {
    expect(parsePlan(set(v2Seed(), ['schemaVersion'], version))).toEqual(refusal('schemaVersion: unsupported'));
  });

  it('refuses a missing schemaVersion as unsupported, not newer', () => {
    expect(parsePlan(drop(v2Seed(), ['schemaVersion']))).toEqual(refusal('schemaVersion: unsupported'));
  });

  it('refuses a crossing (bow-tie) outline', () => {
    expect(parsePlan(withOutline(corners([0, 0], [100, 100], [100, 0], [0, 100])))).toEqual(refusal('room.outline: crossing'));
  });

  it('accepts a valid outline given in negative order and stores it in positive order', () => {
    const reversed = corners([0, 0], [0, 168], [144, 168], [144, 0]);
    expect(accepted(withOutline(reversed)).room.outline).toEqual([
      { id: 'c4', x: 144, y: 0 }, { id: 'c3', x: 144, y: 168 }, { id: 'c2', x: 0, y: 168 }, { id: 'c1', x: 0, y: 0 },
    ]);
  });

  it('stores outline coordinates rounded to 0.01 as normaliseOutline gives them', () => {
    const outline = corners([0.004, 0], [144.006, 0], [144, 168], [0, 168]);
    expect(accepted(withOutline(outline)).room.outline.slice(0, 2)).toEqual([{ id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 144.01, y: 0 }]);
  });

  it('refuses 65 corners and 201 items', () => {
    expect(parsePlan(withOutline(regular(65, 300, 360, 360)))).toEqual(refusal('room.outline: too_big'));
    expect(parsePlan(set(v2Seed(), ['items'], manyItems(201)))).toEqual(refusal('items: too_big'));
  });

  it('refuses two items or two corners sharing an id', () => {
    expect(parsePlan(set(v2Seed(), ['items', 1, 'id'], 'seed-bed'))).toEqual(refusal('items: duplicate-id'));
    expect(parsePlan(set(v2Seed(), ['room', 'outline', 2, 'id'], 'c1'))).toEqual(refusal('room.outline: duplicate-id'));
  });

  it('refuses hostile URLs', () => {
    const tail = 'a'.repeat(3000);
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', ` https://x.example/${tail}`]) {
      const result = parsePlan(set(v2Seed(), ['items', 0, 'sourceUrl'], url));
      expect(result).toEqual({ ok: false, newer: false, reason: expect.stringMatching(/^items\.0\.sourceUrl: (url|too_big)$/) });
    }
  });

  it.each([
    ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['"12"', '12'], ['true', true], ['null', null], ['[12]', [12]],
  ])('refuses %s where a number is expected (no coercion)', (_name, value) => {
    expect(parsePlan(set(v2Seed(), ['items', 0, 'w'], value))).toEqual(refusal('items.0.w: invalid_type'));
    expect(parsePlan(set(v2Seed(), ['room', 'height'], value))).toEqual(refusal('room.height: invalid_type'));
    expect(parsePlan(set(v2Seed(), ['room', 'outline', 1, 'x'], value))).toEqual(refusal('room.outline.1.x: invalid_type'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'angle'], value))).toEqual(refusal('items.0.angle: invalid_type'));
  });

  it('refuses a numeric string price (null is the only non-number allowed)', () => {
    expect(parsePlan(set(v2Seed(), ['items', 0, 'price'], '890'))).toEqual(refusal('items.0.price: invalid_type'));
  });

  it('refuses ids with characters outside [A-Za-z0-9_-]', () => {
    expect(parsePlan(set(v2Seed(), ['items', 0, 'id'], '<img src=x>'))).toEqual(refusal('items.0.id: invalid_format'));
    expect(parsePlan(set(v2Seed(), ['room', 'outline', 0, 'id'], '<img src=x>'))).toEqual(refusal('room.outline.0.id: invalid_format'));
  });

  it('stores angle 450 as 90', () => {
    expect(accepted(set(v2Seed(), ['items', 0, 'angle'], 450)).items[0].angle).toBe(90);
  });

  it.each([
    [-90, 270], [12.346, 12.35], [359.996, 0], [720.004, 0], [-0.004, 0], [360, 0], [405.5, 45.5],
  ])('stores angle %s as %s (normalised, rounded to 0.01, inside [0, 360))', (angle, stored) => {
    expect(accepted(set(v2Seed(), ['items', 0, 'angle'], angle)).items[0].angle).toBe(stored);
  });

  it('stores a huge finite angle as a finite angle inside [0, 360)', () => {
    const { angle } = accepted(set(v2Seed(), ['items', 0, 'angle'], 1e307)).items[0];
    expect(Number.isFinite(angle) && angle >= 0 && angle < 360).toBe(true);
  });

  it('never puts a value from the input into the reason', () => {
    const failing: unknown[] = [
      set(v2Seed(), ['units'], MARKER),
      set(v2Seed(), ['schemaVersion'], MARKER),
      set(v2Seed(), ['items', 0, 'kind'], MARKER),
      set(v2Seed(), ['items', 0, 'id'], `${MARKER}<`),
      set(v2Seed(), ['items', 0, 'name'], MARKER.repeat(20)),
      set(v2Seed(), ['items', 0, 'sourceUrl'], `javascript:${MARKER}`),
      set(v2Seed(), ['items', 0, 'model', 'assetUrl'], `ftp://${MARKER}.example/`),
      set(v2Seed(), ['items', 0, 'model', 'tier'], MARKER),
      set(v2Seed(), ['items', 0, 'price'], MARKER),
      set(v2Seed(), ['room', 'outline', 0, 'id'], MARKER.repeat(5)),
      set(set(v2Seed(), [MARKER], 1), ['units'], 'in'),
      set(set(v2Seed(), ['items', 0, MARKER], MARKER), ['items', 0, 'w'], -1),
      set(set(v2Seed(), ['room', 'outline', 0, MARKER], 1), ['room', 'outline', 0, 'x'], 'nope'),
      set(v2Seed(), ['room'], { [MARKER]: { [MARKER]: MARKER } }),
      set(v2Seed(), ['items'], { [MARKER]: MARKER }),
      set(v2Seed(), ['items', 1, 'id'], 'seed-bed'),
      set(v1Seed(), ['items', 0, 'rot'], MARKER),
      MARKER,
      { [MARKER]: 2 },
    ];
    for (const input of failing) {
      const result = parsePlan(input);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).not.toContain(MARKER);
      expect(result.reason).toMatch(REASON_FORMAT);
    }
  });

  it('never throws: throwing getters, throwing and revoked proxies, cycles and deep nesting', () => {
    const throwingTop = { get schemaVersion(): number { throw new Error(MARKER); } };
    const throwingItem = set(v2Seed(), ['items'], []);
    (throwingItem.items as unknown[]).push(Object.defineProperty({}, 'id', { enumerable: true, get() { throw new Error(MARKER); } }));
    const trap = (): never => { throw new Error(MARKER); };
    const hostileProxy = new Proxy({}, { get: trap, has: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap });
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();
    const cyclicRoom = v2Seed();
    (cyclicRoom.room as Obj).self = cyclicRoom.room;
    (cyclicRoom.room as Obj).outline = [cyclicRoom.room];
    const cyclicItems: unknown[] = [];
    cyclicItems.push(cyclicItems);
    let deep: Obj = {};
    for (let k = 0; k < 100_000; k++) deep = { room: deep, items: [deep] };
    const inputs: unknown[] = [
      throwingTop,
      throwingItem,
      hostileProxy,
      set(v2Seed(), ['room'], hostileProxy),
      revoked,
      set(v2Seed(), ['items'], [revoked]),
      cyclicRoom,
      set(v2Seed(), ['items'], cyclicItems),
      { ...deep, schemaVersion: 2 },
      set(v2Seed(), ['room'], deep),
      set(v2Seed(), ['items', 0, 'model'], deep),
    ];
    for (const input of inputs) {
      let result: ParseResult | undefined;
      expect(() => { result = parsePlan(input); }).not.toThrow();
      expect(result).toEqual({ ok: false, newer: false, reason: expect.stringMatching(REASON_FORMAT) });
      expect(result?.ok === false && result.reason).not.toContain(MARKER);
    }
  });

  it('accepts a deeply nested value under an unknown key, which is dropped unread', () => {
    let deep: Obj = {};
    for (let k = 0; k < 100_000; k++) deep = { next: deep };
    expect(accepted(set(v2Seed(), ['extra'], deep))).toEqual(createInitialDocument());
  });
});

describe('parsePlan — limits (last accepted, first refused)', () => {
  it('schemaVersion: 1 and 2 accepted; 0 refused', () => {
    expect(accepted(v1Seed()).schemaVersion).toBe(2);
    expect(accepted(v2Seed()).schemaVersion).toBe(2);
    expect(parsePlan(set(v2Seed(), ['schemaVersion'], 0))).toEqual(refusal('schemaVersion: unsupported'));
  });

  it('units: ft and m accepted; in and FT refused', () => {
    expect(accepted(set(v2Seed(), ['units'], 'ft')).units).toBe('ft');
    expect(accepted(set(v2Seed(), ['units'], 'm')).units).toBe('m');
    expect(parsePlan(set(v2Seed(), ['units'], 'in'))).toEqual(refusal('units: invalid_value'));
    expect(parsePlan(set(v2Seed(), ['units'], 'FT'))).toEqual(refusal('units: invalid_value'));
    expect(parsePlan(set(v1Seed(), ['units'], 'in'))).toEqual(refusal('units: invalid_value'));
  });

  it('room.height: 36 and 720 accepted; 35.99 and 720.01 refused', () => {
    expect(accepted(set(v2Seed(), ['room', 'height'], 36)).room.height).toBe(36);
    expect(accepted(set(v2Seed(), ['room', 'height'], 720)).room.height).toBe(720);
    expect(parsePlan(set(v2Seed(), ['room', 'height'], 35.99))).toEqual(refusal('room.height: too_small'));
    expect(parsePlan(set(v2Seed(), ['room', 'height'], 720.01))).toEqual(refusal('room.height: too_big'));
  });

  it.each(['w', 'l', 'h'])('v1 room.%s: 36 and 720 accepted; 35.99 and 720.01 refused', (key) => {
    const empty = set(v1Seed(), ['items'], []);
    expect(parsePlan(set(empty, ['room', key], 36)).ok).toBe(true);
    expect(parsePlan(set(empty, ['room', key], 720)).ok).toBe(true);
    expect(parsePlan(set(empty, ['room', key], 35.99))).toEqual(refusal(`room.${key}: too_small`));
    expect(parsePlan(set(empty, ['room', key], 720.01))).toEqual(refusal(`room.${key}: too_big`));
    expect(parsePlan(set(empty, ['room', key], '96'))).toEqual(refusal(`room.${key}: invalid_type`));
  });

  it('v1 room.h becomes the height', () => {
    expect(accepted(set(set(v1Seed(), ['items'], []), ['room', 'h'], 36)).room.height).toBe(36);
  });

  it('room.outline: 3 and 64 corners accepted; 2 and 65 refused', () => {
    expect(accepted(withOutline(corners([0, 0], [100, 0], [0, 100]))).room.outline).toHaveLength(3);
    expect(accepted(withOutline(regular(64, 300, 360, 360))).room.outline).toHaveLength(64);
    expect(parsePlan(withOutline(corners([0, 0], [100, 0])))).toEqual(refusal('room.outline: too_small'));
    expect(parsePlan(withOutline(regular(65, 300, 360, 360)))).toEqual(refusal('room.outline: too_big'));
    expect(parsePlan(withOutline('c1,c2,c3'))).toEqual(refusal('room.outline: invalid_type'));
  });

  it('room.outline x: 1440 and −1440 accepted; 1440.01 and −1440.01 refused', () => {
    const atMax = corners([1340, 0], [1440, 0], [1440, 100]);
    const atMin = corners([-1440, 0], [-1340, 0], [-1440, 100]);
    expect(accepted(withOutline(atMax)).room.outline[1]).toEqual({ id: 'c2', x: 1440, y: 0 });
    expect(accepted(withOutline(atMin)).room.outline.map((c) => c.x)).toContain(-1440);
    expect(parsePlan(withOutline(corners([1340, 0], [1440.01, 0], [1440, 100])))).toEqual(refusal('room.outline.1.x: too_big'));
    expect(parsePlan(withOutline(corners([-1440.01, 0], [-1340, 0], [-1440, 100])))).toEqual(refusal('room.outline.0.x: too_small'));
  });

  it('room.outline y: 1440 and −1440 accepted; 1440.01 and −1440.01 refused', () => {
    expect(accepted(withOutline(corners([0, 1340], [100, 1440], [0, 1440]))).room.outline.map((c) => c.y)).toContain(1440);
    expect(accepted(withOutline(corners([0, -1440], [100, -1440], [0, -1340]))).room.outline.map((c) => c.y)).toContain(-1440);
    expect(parsePlan(withOutline(corners([0, 1340], [100, 1440.01], [0, 1440])))).toEqual(refusal('room.outline.1.y: too_big'));
    expect(parsePlan(withOutline(corners([0, -1440.01], [100, -1440], [0, -1340])))).toEqual(refusal('room.outline.0.y: too_small'));
  });

  it('room.outline ids: distinct accepted; a repeated id refused', () => {
    expect(accepted(withOutline(corners([0, 0], [100, 0], [0, 100]))).room.outline.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    const repeated = corners([0, 0], [100, 0], [0, 100]);
    repeated[2].id = 'c2';
    expect(parsePlan(withOutline(repeated))).toEqual(refusal('room.outline: duplicate-id'));
  });

  it('room.outline validity after normaliseOutline: width 720 accepted; 720.01, a 5.99 wall and a crossing refused', () => {
    expect(accepted(withOutline(corners([0, 0], [720, 0], [720, 100], [0, 100]))).room.outline[1].x).toBe(720);
    expect(parsePlan(withOutline(corners([0, 0], [720.01, 0], [720.01, 100], [0, 100])))).toEqual(refusal('room.outline: too-large'));
    expect(parsePlan(withOutline(corners([0, 0], [100, 0], [100, 5.99], [100, 100], [0, 100])))).toEqual(refusal('room.outline: short-wall'));
    expect(accepted(withOutline(corners([0, 0], [100, 0], [100, 6], [100, 100], [0, 100]))).room.outline).toHaveLength(5);
    expect(parsePlan(withOutline(corners([0, 0], [100, 100], [100, 0], [0, 100])))).toEqual(refusal('room.outline: crossing'));
  });

  it('id: [A-Za-z0-9_-], 1 to 64 characters, for items and corners', () => {
    const ok64 = 'aZ09_-'.repeat(10) + 'abcd';
    expect(ok64).toHaveLength(64);
    expect(accepted(set(v2Seed(), ['items', 0, 'id'], ok64)).items[0].id).toBe(ok64);
    expect(accepted(set(v2Seed(), ['items', 0, 'id'], 'x')).items[0].id).toBe('x');
    expect(accepted(set(v2Seed(), ['room', 'outline', 0, 'id'], ok64)).room.outline[0].id).toBe(ok64);
    expect(parsePlan(set(v2Seed(), ['items', 0, 'id'], `${ok64}e`))).toEqual(refusal('items.0.id: invalid_format'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'id'], ''))).toEqual(refusal('items.0.id: invalid_format'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'id'], 'a b'))).toEqual(refusal('items.0.id: invalid_format'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'id'], 'a\n'))).toEqual(refusal('items.0.id: invalid_format'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'id'], 7))).toEqual(refusal('items.0.id: invalid_type'));
    expect(parsePlan(set(v2Seed(), ['room', 'outline', 0, 'id'], `${ok64}e`))).toEqual(refusal('room.outline.0.id: invalid_format'));
    expect(parsePlan(set(v2Seed(), ['room', 'outline', 0, 'id'], ''))).toEqual(refusal('room.outline.0.id: invalid_format'));
  });

  it('items: 0 and 200 accepted; 201 refused; ids distinct', () => {
    expect(accepted(set(v2Seed(), ['items'], [])).items).toEqual([]);
    expect(accepted(set(v2Seed(), ['items'], manyItems(200))).items).toHaveLength(200);
    expect(parsePlan(set(v2Seed(), ['items'], manyItems(201)))).toEqual(refusal('items: too_big'));
    expect(parsePlan(set(v2Seed(), ['items'], [...manyItems(2), ...manyItems(1)]))).toEqual(refusal('items: duplicate-id'));
    expect(parsePlan(set(v2Seed(), ['items'], { 0: manyItems(1)[0] }))).toEqual(refusal('items: invalid_type'));
  });

  it.each(KINDS)('item kind %s accepted', (kind) => {
    expect(accepted(set(v2Seed(), ['items', 0, 'kind'], kind)).items[0].kind).toBe(kind);
  });

  it('item kind outside the eight refused', () => {
    expect(parsePlan(set(v2Seed(), ['items', 0, 'kind'], 'lamp'))).toEqual(refusal('items.0.kind: invalid_value'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'kind'], 'Bed'))).toEqual(refusal('items.0.kind: invalid_value'));
  });

  it('item name: 1 and 200 characters accepted; 0 and 201 refused', () => {
    expect(accepted(set(v2Seed(), ['items', 0, 'name'], 'n')).items[0].name).toBe('n');
    expect(accepted(set(v2Seed(), ['items', 0, 'name'], 'n'.repeat(200))).items[0].name).toHaveLength(200);
    expect(parsePlan(set(v2Seed(), ['items', 0, 'name'], ''))).toEqual(refusal('items.0.name: too_small'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'name'], 'n'.repeat(201)))).toEqual(refusal('items.0.name: too_big'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'name'], 5))).toEqual(refusal('items.0.name: invalid_type'));
  });

  it('item host: 0 and 255 characters accepted; 256 refused', () => {
    expect(accepted(set(v2Seed(), ['items', 0, 'host'], '')).items[0].host).toBe('');
    expect(accepted(set(v2Seed(), ['items', 0, 'host'], 'h'.repeat(255))).items[0].host).toHaveLength(255);
    expect(parsePlan(set(v2Seed(), ['items', 0, 'host'], 'h'.repeat(256)))).toEqual(refusal('items.0.host: too_big'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'host'], null))).toEqual(refusal('items.0.host: invalid_type'));
  });

  describe.each([
    ['sourceUrl', ['items', 0, 'sourceUrl']],
    ['model.assetUrl', ['items', 0, 'model', 'assetUrl']],
  ] as const)('item %s', (field, path) => {
    const reason = (rule: string): ParseResult => refusal(`items.0.${field}: ${rule}`);
    const read = (doc: PlanDocument): string | null => (field === 'sourceUrl' ? doc.items[0].sourceUrl : doc.items[0].model.assetUrl);
    const head = 'https://x.example/';
    const max = head + 'a'.repeat(2048 - head.length);

    it('accepts null, http and https URLs, up to 2048 characters', () => {
      expect(read(accepted(set(v2Seed(), path, null)))).toBeNull();
      expect(read(accepted(set(v2Seed(), path, 'http://x.example/a?b=1#c')))).toBe('http://x.example/a?b=1#c');
      expect(read(accepted(set(v2Seed(), path, 'HTTPS://X.EXAMPLE/')))).toBe('HTTPS://X.EXAMPLE/');
      expect(max).toHaveLength(2048);
      expect(read(accepted(set(v2Seed(), path, max)))).toBe(max);
    });

    it('refuses 2049 characters', () => {
      expect(parsePlan(set(v2Seed(), path, `${max}a`))).toEqual(reason('too_big'));
    });

    it.each([
      'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'blob:https://x.example/1', 'file:///etc/passwd',
      'ftp://x.example/', '//x.example/a', '/relative/path', 'relative', '', ' https://x.example/', 'https://x.example/ ',
      '\thttps://x.example/', 'https://x.example/\n', '\u0001https://x.example/', 'https://', 'http//x.example',
    ])('refuses %j', (url) => {
      expect(parsePlan(set(v2Seed(), path, url))).toEqual(reason('url'));
    });

    it('refuses a non-string', () => {
      expect(parsePlan(set(v2Seed(), path, 5))).toEqual(reason('invalid_type'));
      expect(parsePlan(set(v2Seed(), path, { href: 'https://x.example/' }))).toEqual(reason('invalid_type'));
    });
  });

  it('item price: null, 0 and 10,000,000 accepted; −0.01 and 10,000,000.01 refused', () => {
    expect(accepted(set(v2Seed(), ['items', 0, 'price'], null)).items[0].price).toBeNull();
    expect(accepted(set(v2Seed(), ['items', 0, 'price'], 0)).items[0].price).toBe(0);
    expect(accepted(set(v2Seed(), ['items', 0, 'price'], 10_000_000)).items[0].price).toBe(10_000_000);
    expect(parsePlan(set(v2Seed(), ['items', 0, 'price'], -0.01))).toEqual(refusal('items.0.price: too_small'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'price'], 10_000_000.01))).toEqual(refusal('items.0.price: too_big'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'price'], Infinity))).toEqual(refusal('items.0.price: invalid_type'));
  });

  it.each(['w', 'd', 'h'] as const)('item %s: 0.01 and 720 accepted; 0 and 720.01 refused', (key) => {
    expect(accepted(set(v2Seed(), ['items', 0, key], 0.01)).items[0][key]).toBe(0.01);
    expect(accepted(set(v2Seed(), ['items', 0, key], 720)).items[0][key]).toBe(720);
    expect(parsePlan(set(v2Seed(), ['items', 0, key], 0))).toEqual(refusal(`items.0.${key}: too_small`));
    expect(parsePlan(set(v2Seed(), ['items', 0, key], -1))).toEqual(refusal(`items.0.${key}: too_small`));
    expect(parsePlan(set(v2Seed(), ['items', 0, key], 720.01))).toEqual(refusal(`items.0.${key}: too_big`));
  });

  it.each(['x', 'y'] as const)('item %s: −1440 and 1440 accepted; −1440.01 and 1440.01 refused', (key) => {
    expect(accepted(set(v2Seed(), ['items', 0, key], 1440)).items[0][key]).toBe(1440);
    expect(accepted(set(v2Seed(), ['items', 0, key], -1440)).items[0][key]).toBe(-1440);
    expect(parsePlan(set(v2Seed(), ['items', 0, key], 1440.01))).toEqual(refusal(`items.0.${key}: too_big`));
    expect(parsePlan(set(v2Seed(), ['items', 0, key], -1440.01))).toEqual(refusal(`items.0.${key}: too_small`));
  });

  it('item angle: any finite number accepted; NaN and Infinity refused; a v2 item without angle refused', () => {
    expect(accepted(set(v2Seed(), ['items', 0, 'angle'], -1e6)).items[0].angle).toBe(80);
    expect(parsePlan(set(v2Seed(), ['items', 0, 'angle'], NaN))).toEqual(refusal('items.0.angle: invalid_type'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'angle'], -Infinity))).toEqual(refusal('items.0.angle: invalid_type'));
    expect(parsePlan(set(drop(v2Seed(), ['items', 0, 'angle']), ['items', 0, 'rot'], 1))).toEqual(refusal('items.0.angle: invalid_type'));
  });

  it('v1 item rot: 0 to 3 accepted; 4, −1, 1.5, "1" and a missing rot refused', () => {
    for (const rot of [0, 1, 2, 3]) expect(accepted(set(v1Seed(), ['items', 0, 'rot'], rot)).items[0].angle).toBe(rot * 90);
    for (const rot of [4, -1, 1.5, '1', null]) {
      expect(parsePlan(set(v1Seed(), ['items', 0, 'rot'], rot))).toEqual(refusal('items.0.rot: invalid_value'));
    }
    expect(parsePlan(drop(v1Seed(), ['items', 0, 'rot']))).toEqual({ ok: false, newer: false, reason: expect.stringMatching(/^items\.0\.rot: /) });
  });

  it('v1 items obey the shared item limits', () => {
    expect(parsePlan(set(v1Seed(), ['items', 0, 'name'], ''))).toEqual(refusal('items.0.name: too_small'));
    expect(parsePlan(set(v1Seed(), ['items', 0, 'sourceUrl'], 'javascript:alert(1)'))).toEqual(refusal('items.0.sourceUrl: url'));
    expect(parsePlan(set(v1Seed(), ['items', 0, 'w'], '64'))).toEqual(refusal('items.0.w: invalid_type'));
    expect(parsePlan(set(v1Seed(), ['items', 1, 'id'], 'seed-bed'))).toEqual(refusal('items: duplicate-id'));
    expect(parsePlan(set(v1Seed(), ['items'], manyItems(201)))).toEqual(refusal('items: too_big'));
  });

  it.each(TIERS)('item model.tier %s accepted', (tier) => {
    expect(accepted(set(v2Seed(), ['items', 0, 'model', 'tier'], tier)).items[0].model.tier).toBe(tier);
  });

  it('item model.tier outside the four refused; model.label 0 and 200 accepted, 201 refused', () => {
    expect(parsePlan(set(v2Seed(), ['items', 0, 'model', 'tier'], 'gold'))).toEqual(refusal('items.0.model.tier: invalid_value'));
    expect(accepted(set(v2Seed(), ['items', 0, 'model', 'label'], '')).items[0].model.label).toBe('');
    expect(accepted(set(v2Seed(), ['items', 0, 'model', 'label'], 'l'.repeat(200))).items[0].model.label).toHaveLength(200);
    expect(parsePlan(set(v2Seed(), ['items', 0, 'model', 'label'], 'l'.repeat(201)))).toEqual(refusal('items.0.model.label: too_big'));
    expect(parsePlan(set(v2Seed(), ['items', 0, 'model'], null))).toEqual(refusal('items.0.model: invalid_type'));
  });
});

describe('parsePlan — hostile sweep', () => {
  const huge = 'x'.repeat(5_000_000);
  const nested = (depth: number): unknown => {
    let v: unknown = 1;
    for (let k = 0; k < depth; k++) v = [v];
    return v;
  };
  const protoJson = (where: string): unknown =>
    JSON.parse(JSON.stringify(createInitialDocument()).replace(where, `${where}"__proto__":{"isAdmin":true},`).replace('"ft"', '"yd"'));

  const hostile: [string, unknown][] = [
    ['empty object', {}],
    ['only a version', { schemaVersion: 2 }],
    ['units a number', set(v2Seed(), ['units'], 1)],
    ['units missing', drop(v2Seed(), ['units'])],
    ['room null', set(v2Seed(), ['room'], null)],
    ['room an array', set(v2Seed(), ['room'], [])],
    ['room a string', set(v2Seed(), ['room'], 'room')],
    ['room missing', drop(v2Seed(), ['room'])],
    ['height missing', drop(v2Seed(), ['room', 'height'])],
    ['outline missing', drop(v2Seed(), ['room', 'outline'])],
    ['outline of numbers', withOutline([1, 2, 3, 4])],
    ['outline of nested arrays', withOutline([nested(1000), nested(1000), nested(1000)])],
    ['corner missing x', drop(v2Seed(), ['room', 'outline', 0, 'x'])],
    ['corner id a number', set(v2Seed(), ['room', 'outline', 0, 'id'], 1)],
    ['items null', set(v2Seed(), ['items'], null)],
    ['items a string', set(v2Seed(), ['items'], huge)],
    ['items missing', drop(v2Seed(), ['items'])],
    ['item null', set(v2Seed(), ['items', 0], null)],
    ['item a deeply nested array', set(v2Seed(), ['items', 0], nested(10_000))],
    ['item kind a number', set(v2Seed(), ['items', 0, 'kind'], 3)],
    ['item name huge', set(v2Seed(), ['items', 0, 'name'], huge)],
    ['item host huge', set(v2Seed(), ['items', 0, 'host'], huge)],
    ['item sourceUrl huge', set(v2Seed(), ['items', 0, 'sourceUrl'], `https://x.example/${huge}`)],
    ['item price a boolean', set(v2Seed(), ['items', 0, 'price'], false)],
    ['item h a numeric string', set(v2Seed(), ['items', 0, 'h'], '38')],
    ['item x null', set(v2Seed(), ['items', 0, 'x'], null)],
    ['item y an array', set(v2Seed(), ['items', 0, 'y'], [0])],
    ['item angle a string', set(v2Seed(), ['items', 0, 'angle'], '90')],
    ['item model a string', set(v2Seed(), ['items', 0, 'model'], 'box')],
    ['item model missing', drop(v2Seed(), ['items', 0, 'model'])],
    ['model label a number', set(v2Seed(), ['items', 0, 'model', 'label'], 1)],
    ['model assetUrl a data URL', set(v2Seed(), ['items', 0, 'model', 'assetUrl'], 'data:model/gltf+json,{}')],
    ['a huge items array', set(v2Seed(), ['items'], new Array(1_000_000).fill(0))],
    ['a huge outline', withOutline(new Array(1_000_000).fill({ id: 'c', x: 0, y: 0 }))],
    ['v1 room missing w', drop(v1Seed(), ['room', 'w'])],
    ['v1 room given as an outline', set(v1Seed(), ['room'], (v2Seed().room as Obj))],
    ['v2 room given as w, l, h', set(v2Seed(), ['room'], { w: 144, l: 168, h: 96 })],
    ['__proto__ at the top with a bad units', protoJson('{')],
    ['__proto__ in room with a bad units', protoJson('"room":{')],
    ['__proto__ in an item with a bad units', protoJson('"items":[{')],
    ['__proto__ in a model with a bad units', protoJson('"model":{')],
    ['a Map', new Map([['schemaVersion', 2]])],
    ['a Date', new Date(0)],
    ['a boxed number', Object(2)],
  ];

  it('has at least 30 hostile inputs', () => {
    expect(hostile.length).toBeGreaterThanOrEqual(30);
  });

  it.each(hostile)('%s → ok: false, newer: false, a safe reason, no throw', (_name, input) => {
    let result: ParseResult | undefined;
    expect(() => { result = parsePlan(input); }).not.toThrow();
    expect(result).toEqual({ ok: false, newer: false, reason: expect.stringMatching(REASON_FORMAT) });
    expect(result?.ok === false && result.reason.length).toBeLessThanOrEqual(80);
    expect(({} as Obj).isAdmin).toBeUndefined();
  });
});

describe('parsePlan — result type', () => {
  it('returns a PlanDocument whose items are Items', () => {
    const doc: PlanDocument = accepted(v2Seed());
    const item: Item = doc.items[0];
    expect(item.model).toEqual({ tier: 'retailer', label: '3D model from retailer', assetUrl: null });
  });
});
