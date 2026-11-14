import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from './catalog';
import { newObstacle } from './obstacles';
import { openingSpan } from './openings';
import { parsePlan, type ParseResult } from './planSchema';
import type { Corner, Door, Item, Kind, ModelTier, Obstacle, PlanDocument, WindowOpening } from './types';

type Obj = Record<string, unknown>;
type Path = readonly (string | number)[];

/** Today's (version 3) seeded document after a JSON round trip, as storage would hand it back. */
function seed(): Obj {
  return JSON.parse(JSON.stringify(createInitialDocument())) as Obj;
}

/** The version 2 seeded document as slice B wrote it: today's seed without the two lists. */
function v2Seed(): Obj {
  return set(drop(drop(seed(), ['openings']), ['obstacles']), ['schemaVersion'], 2);
}

/** A door on the top wall c1 (from the openings tests). */
const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
/** A window on the right wall c2. */
const W1: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 36, height: 48 };
/** A default box obstacle. */
const B1: Obstacle = newObstacle('box', { x: 40, y: 120 }, 96, 'b1');
/** A default column obstacle. */
const C1: Obstacle = newObstacle('cylinder', { x: 100, y: 100 }, 96, 'k1');

/** Today's seed holding D1, W1, a box and a column, as a typed document. */
function fullDoc(): PlanDocument {
  return { ...createInitialDocument(), openings: [{ ...D1 }, { ...W1 }], obstacles: [{ ...B1 }, { ...C1 }] };
}

/** fullDoc after a JSON round trip. */
function full(): Obj {
  return JSON.parse(JSON.stringify(fullDoc())) as Obj;
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
  return set(seed(), ['room', 'outline'], outline);
}

/** `count` copies of the seed bed with distinct ids i1, i2, …. */
function manyItems(count: number): Obj[] {
  const bed = (seed().items as Obj[])[0];
  return Array.from({ length: count }, (_, k) => ({ ...clone(bed), id: `i${k + 1}` }));
}

const MARKER = 'SECRET-MARKER';
/** Every reason is a short "<path>: <rule>" built from known field names, indices and rule names. */
const REASON_FORMAT = /^[A-Za-z0-9.?]+: [a-z_-]+$/;

const KINDS: Kind[] = ['sofa', 'chair', 'bed', 'desk', 'table', 'shelf', 'rug', 'box'];
const TIERS: ModelTier[] = ['retailer', 'generated', 'parametric', 'box'];

describe('parsePlan — behaviour', () => {
  it('accepts the current seeded document after a JSON round trip, deep-equal to it', () => {
    const input = seed();
    expect(parsePlan(input)).toEqual({ ok: true, doc: createInitialDocument() });
  });

  it('returns a new object that shares nothing with the input', () => {
    const input = seed();
    const doc = accepted(input);
    expect(doc).not.toBe(input);
    expect(doc.room).not.toBe(input.room);
    expect(doc.items[0]).not.toBe((input.items as Obj[])[0]);
    (input.items as Obj[])[0].name = 'changed';
    ((input.room as Obj).outline as Obj[])[0].x = 5;
    expect(doc).toEqual(createInitialDocument());
  });

  it('converts a version 1 room to a rectangle outline c1…c4 with its height, at version 3', () => {
    const doc = accepted(set(v1Seed(), ['items'], []));
    expect(doc.schemaVersion).toBe(3);
    expect([doc.openings, doc.obstacles]).toEqual([[], []]);
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

  it('converts the version 2 seeded document to today’s seeded document (both lists empty)', () => {
    expect(parsePlan(v2Seed())).toEqual({ ok: true, doc: createInitialDocument() });
  });

  it('ignores openings and obstacles keys in a version 2 document: the lists start empty', () => {
    const doc = accepted(set(set(v2Seed(), ['openings'], [D1]), ['obstacles'], 'junk'));
    expect([doc.schemaVersion, doc.openings, doc.obstacles]).toEqual([3, [], []]);
  });

  it('checks every version 2 rule on a version 2 document', () => {
    expect(parsePlan(set(v2Seed(), ['items', 0, 'x'], 1440.01))).toEqual(refusal('items.0.x: too_big'));
    expect(parsePlan(set(v2Seed(), ['items', 1, 'id'], 'seed-bed'))).toEqual(refusal('items: duplicate-id'));
    expect(parsePlan(drop(v2Seed(), ['room']))).toEqual(refusal('room: invalid_type'));
  });

  it('accepts a version 3 document with a door, a window, a box and a column, deep-equal after a JSON round trip', () => {
    expect(parsePlan(full())).toEqual({ ok: true, doc: fullDoc() });
  });

  it('drops unknown keys at every level, including __proto__, constructor and prototype, with plain prototypes', () => {
    const evil = '"__proto__":{"polluted":true,"schemaVersion":3},"constructor":{"prototype":{"polluted":true}},'
      + '"prototype":{"polluted":true},"extra":"x",';
    // Every "{" in the document's JSON opens an object (no string in it has a brace), so this reaches every level.
    const text = JSON.stringify(fullDoc()).replace(/\{/g, `{${evil}`);
    const input: unknown = JSON.parse(text);
    expect(Object.keys(input as Obj)).toContain('__proto__');
    expect(Object.keys((input as { openings: Obj[] }).openings[0])).toContain('__proto__');
    expect(Object.keys((input as { obstacles: Obj[] }).obstacles[0])).toContain('__proto__');
    const doc = accepted(input);
    expect(doc).toEqual(fullDoc());
    const objects: object[] = [
      doc, doc.room, ...doc.room.outline, ...doc.items, ...doc.items.map((i) => i.model), ...doc.openings, ...doc.obstacles,
    ];
    for (const o of objects) {
      expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(o, '__proto__')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(o, 'constructor')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(o, 'prototype')).toBe(false);
      expect((o as Obj).polluted).toBeUndefined();
    }
    for (const list of [doc.openings, doc.obstacles]) expect(Object.getPrototypeOf(list)).toBe(Array.prototype);
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'units', 'room', 'items', 'openings', 'obstacles']);
    expect(Object.keys(doc.openings[0])).toEqual(['id', 'kind', 'wallId', 'offset', 'width', 'height', 'hinge', 'swing']);
    expect(Object.keys(doc.openings[1])).toEqual(['id', 'kind', 'wallId', 'offset', 'width', 'sill', 'height']);
    for (const o of doc.obstacles) {
      expect(Object.keys(o)).toEqual(['id', 'shape', 'label', 'x', 'y', 'rotation', 'width', 'depth', 'height', 'elevation']);
    }
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
    ['an array', [seed()]],
    ['a number', 2],
    ['undefined', undefined],
    ['a boolean', true],
    ['a function', () => seed()],
    ['a symbol', Symbol('plan')],
    ['a bigint', BigInt(2)],
  ])('refuses %s as not an object', (_name, input) => {
    expect(parsePlan(input)).toEqual(refusal('document: not-an-object'));
  });

  it.each([4, 40, 1e21])('refuses schemaVersion %s as newer', (version) => {
    expect(parsePlan(set(seed(), ['schemaVersion'], version))).toEqual({ ok: false, newer: true, reason: 'schemaVersion: newer' });
  });

  it('refuses a newer version even when nothing else in it is readable', () => {
    expect(parsePlan({ schemaVersion: 4 })).toEqual({ ok: false, newer: true, reason: 'schemaVersion: newer' });
  });

  it.each([
    ['0', 0], ['-1', -1], ['-3', -3], ['2.5', 2.5], ['3.5', 3.5], ['"2"', '2'], ['"3"', '3'], ['"4"', '4'], ['null', null],
    ['true', true], ['NaN', NaN], ['Infinity', Infinity], ['an object', { v: 2 }],
  ])('refuses schemaVersion %s as unsupported, not newer', (_name, version) => {
    expect(parsePlan(set(seed(), ['schemaVersion'], version))).toEqual(refusal('schemaVersion: unsupported'));
  });

  it('refuses a missing schemaVersion as unsupported, not newer', () => {
    expect(parsePlan(drop(seed(), ['schemaVersion']))).toEqual(refusal('schemaVersion: unsupported'));
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
    expect(parsePlan(set(seed(), ['items'], manyItems(201)))).toEqual(refusal('items: too_big'));
  });

  it('refuses two items or two corners sharing an id', () => {
    expect(parsePlan(set(seed(), ['items', 1, 'id'], 'seed-bed'))).toEqual(refusal('items: duplicate-id'));
    expect(parsePlan(set(seed(), ['room', 'outline', 2, 'id'], 'c1'))).toEqual(refusal('room.outline: duplicate-id'));
  });

  it('refuses hostile URLs', () => {
    const tail = 'a'.repeat(3000);
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', ` https://x.example/${tail}`]) {
      const result = parsePlan(set(seed(), ['items', 0, 'sourceUrl'], url));
      expect(result).toEqual({ ok: false, newer: false, reason: expect.stringMatching(/^items\.0\.sourceUrl: (url|too_big)$/) });
    }
  });

  it.each([
    ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['"12"', '12'], ['true', true], ['null', null], ['[12]', [12]],
  ])('refuses %s where a number is expected (no coercion)', (_name, value) => {
    expect(parsePlan(set(seed(), ['items', 0, 'w'], value))).toEqual(refusal('items.0.w: invalid_type'));
    expect(parsePlan(set(seed(), ['room', 'height'], value))).toEqual(refusal('room.height: invalid_type'));
    expect(parsePlan(set(seed(), ['room', 'outline', 1, 'x'], value))).toEqual(refusal('room.outline.1.x: invalid_type'));
    expect(parsePlan(set(seed(), ['items', 0, 'angle'], value))).toEqual(refusal('items.0.angle: invalid_type'));
  });

  it('refuses a numeric string price (null is the only non-number allowed)', () => {
    expect(parsePlan(set(seed(), ['items', 0, 'price'], '890'))).toEqual(refusal('items.0.price: invalid_type'));
  });

  it('refuses ids with characters outside [A-Za-z0-9_-]', () => {
    expect(parsePlan(set(seed(), ['items', 0, 'id'], '<img src=x>'))).toEqual(refusal('items.0.id: invalid_format'));
    expect(parsePlan(set(seed(), ['room', 'outline', 0, 'id'], '<img src=x>'))).toEqual(refusal('room.outline.0.id: invalid_format'));
  });

  it('stores angle 450 as 90', () => {
    expect(accepted(set(seed(), ['items', 0, 'angle'], 450)).items[0].angle).toBe(90);
  });

  it.each([
    [-90, 270], [12.346, 12.35], [359.996, 0], [720.004, 0], [-0.004, 0], [360, 0], [405.5, 45.5],
  ])('stores angle %s as %s (normalised, rounded to 0.01, inside [0, 360))', (angle, stored) => {
    expect(accepted(set(seed(), ['items', 0, 'angle'], angle)).items[0].angle).toBe(stored);
  });

  it('stores a huge finite angle as a finite angle inside [0, 360)', () => {
    const { angle } = accepted(set(seed(), ['items', 0, 'angle'], 1e307)).items[0];
    expect(Number.isFinite(angle) && angle >= 0 && angle < 360).toBe(true);
  });

  it('never puts a value from the input into the reason', () => {
    const failing: unknown[] = [
      set(seed(), ['units'], MARKER),
      set(seed(), ['schemaVersion'], MARKER),
      set(seed(), ['items', 0, 'kind'], MARKER),
      set(seed(), ['items', 0, 'id'], `${MARKER}<`),
      set(seed(), ['items', 0, 'name'], MARKER.repeat(20)),
      set(seed(), ['items', 0, 'sourceUrl'], `javascript:${MARKER}`),
      set(seed(), ['items', 0, 'model', 'assetUrl'], `ftp://${MARKER}.example/`),
      set(seed(), ['items', 0, 'model', 'tier'], MARKER),
      set(seed(), ['items', 0, 'price'], MARKER),
      set(seed(), ['room', 'outline', 0, 'id'], MARKER.repeat(5)),
      set(set(seed(), [MARKER], 1), ['units'], 'in'),
      set(set(seed(), ['items', 0, MARKER], MARKER), ['items', 0, 'w'], -1),
      set(set(seed(), ['room', 'outline', 0, MARKER], 1), ['room', 'outline', 0, 'x'], 'nope'),
      set(seed(), ['room'], { [MARKER]: { [MARKER]: MARKER } }),
      set(seed(), ['items'], { [MARKER]: MARKER }),
      set(seed(), ['items', 1, 'id'], 'seed-bed'),
      set(v1Seed(), ['items', 0, 'rot'], MARKER),
      MARKER,
      { [MARKER]: 2 },
      set(full(), ['obstacles', 0, 'label'], MARKER.repeat(4)),
      set(set(full(), ['obstacles', 0, 'label'], MARKER), ['obstacles', 0, 'width'], 241),
      set(set(full(), ['openings', 0, MARKER], MARKER), ['openings', 0, 'width'], 'wide'),
      set(set(full(), ['obstacles', 1, MARKER], 1), ['obstacles', 1, 'shape'], 'cone'),
      set(full(), ['openings', 0, 'wallId'], MARKER),
      set(full(), ['openings', 1, 'wallId'], `${MARKER}<`),
      set(full(), ['openings', 0, 'kind'], MARKER),
      set(full(), ['openings', 0, 'id'], `${MARKER}!`),
      set(set(full(), ['openings', 0, 'id'], MARKER), ['obstacles', 0, 'id'], MARKER),
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
    const throwingItem = set(seed(), ['items'], []);
    (throwingItem.items as unknown[]).push(Object.defineProperty({}, 'id', { enumerable: true, get() { throw new Error(MARKER); } }));
    const trap = (): never => { throw new Error(MARKER); };
    const hostileProxy = new Proxy({}, { get: trap, has: trap, ownKeys: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap });
    const { proxy: revoked, revoke } = Proxy.revocable({}, {});
    revoke();
    const cyclicRoom = seed();
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
      set(seed(), ['room'], hostileProxy),
      revoked,
      set(seed(), ['items'], [revoked]),
      cyclicRoom,
      set(seed(), ['items'], cyclicItems),
      { ...deep, schemaVersion: 2 },
      { ...deep, schemaVersion: 3 },
      set(seed(), ['room'], deep),
      set(seed(), ['items', 0, 'model'], deep),
      set(full(), ['openings'], [revoked]),
      set(full(), ['obstacles'], hostileProxy),
      set(full(), ['openings', 0], deep),
      set(full(), ['obstacles'], cyclicItems),
      ((): Obj => {
        const doc = full();
        (doc.openings as unknown[]).push(Object.defineProperty({}, 'kind', { enumerable: true, get() { throw new Error(MARKER); } }));
        return doc;
      })(),
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
    expect(accepted(set(seed(), ['extra'], deep))).toEqual(createInitialDocument());
  });
});

describe('parsePlan — limits (last accepted, first refused)', () => {
  it('schemaVersion: 1, 2 and 3 accepted (stored as 3); 0 refused; 4 newer', () => {
    expect(accepted(v1Seed()).schemaVersion).toBe(3);
    expect(accepted(v2Seed()).schemaVersion).toBe(3);
    expect(accepted(seed()).schemaVersion).toBe(3);
    expect(parsePlan(set(seed(), ['schemaVersion'], 0))).toEqual(refusal('schemaVersion: unsupported'));
    expect(parsePlan(set(seed(), ['schemaVersion'], 4))).toEqual({ ok: false, newer: true, reason: 'schemaVersion: newer' });
  });

  it('units: ft and m accepted; in and FT refused', () => {
    expect(accepted(set(seed(), ['units'], 'ft')).units).toBe('ft');
    expect(accepted(set(seed(), ['units'], 'm')).units).toBe('m');
    expect(parsePlan(set(seed(), ['units'], 'in'))).toEqual(refusal('units: invalid_value'));
    expect(parsePlan(set(seed(), ['units'], 'FT'))).toEqual(refusal('units: invalid_value'));
    expect(parsePlan(set(v1Seed(), ['units'], 'in'))).toEqual(refusal('units: invalid_value'));
  });

  it('room.height: 36 and 720 accepted; 35.99 and 720.01 refused', () => {
    expect(accepted(set(seed(), ['room', 'height'], 36)).room.height).toBe(36);
    expect(accepted(set(seed(), ['room', 'height'], 720)).room.height).toBe(720);
    expect(parsePlan(set(seed(), ['room', 'height'], 35.99))).toEqual(refusal('room.height: too_small'));
    expect(parsePlan(set(seed(), ['room', 'height'], 720.01))).toEqual(refusal('room.height: too_big'));
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
    expect(accepted(set(seed(), ['items', 0, 'id'], ok64)).items[0].id).toBe(ok64);
    expect(accepted(set(seed(), ['items', 0, 'id'], 'x')).items[0].id).toBe('x');
    expect(accepted(set(seed(), ['room', 'outline', 0, 'id'], ok64)).room.outline[0].id).toBe(ok64);
    expect(parsePlan(set(seed(), ['items', 0, 'id'], `${ok64}e`))).toEqual(refusal('items.0.id: invalid_format'));
    expect(parsePlan(set(seed(), ['items', 0, 'id'], ''))).toEqual(refusal('items.0.id: invalid_format'));
    expect(parsePlan(set(seed(), ['items', 0, 'id'], 'a b'))).toEqual(refusal('items.0.id: invalid_format'));
    expect(parsePlan(set(seed(), ['items', 0, 'id'], 'a\n'))).toEqual(refusal('items.0.id: invalid_format'));
    expect(parsePlan(set(seed(), ['items', 0, 'id'], 7))).toEqual(refusal('items.0.id: invalid_type'));
    expect(parsePlan(set(seed(), ['room', 'outline', 0, 'id'], `${ok64}e`))).toEqual(refusal('room.outline.0.id: invalid_format'));
    expect(parsePlan(set(seed(), ['room', 'outline', 0, 'id'], ''))).toEqual(refusal('room.outline.0.id: invalid_format'));
  });

  it('items: 0 and 200 accepted; 201 refused; ids distinct', () => {
    expect(accepted(set(seed(), ['items'], [])).items).toEqual([]);
    expect(accepted(set(seed(), ['items'], manyItems(200))).items).toHaveLength(200);
    expect(parsePlan(set(seed(), ['items'], manyItems(201)))).toEqual(refusal('items: too_big'));
    expect(parsePlan(set(seed(), ['items'], [...manyItems(2), ...manyItems(1)]))).toEqual(refusal('items: duplicate-id'));
    expect(parsePlan(set(seed(), ['items'], { 0: manyItems(1)[0] }))).toEqual(refusal('items: invalid_type'));
  });

  it.each(KINDS)('item kind %s accepted', (kind) => {
    expect(accepted(set(seed(), ['items', 0, 'kind'], kind)).items[0].kind).toBe(kind);
  });

  it('item kind outside the eight refused', () => {
    expect(parsePlan(set(seed(), ['items', 0, 'kind'], 'lamp'))).toEqual(refusal('items.0.kind: invalid_value'));
    expect(parsePlan(set(seed(), ['items', 0, 'kind'], 'Bed'))).toEqual(refusal('items.0.kind: invalid_value'));
  });

  it('item name: 1 and 200 characters accepted; 0 and 201 refused', () => {
    expect(accepted(set(seed(), ['items', 0, 'name'], 'n')).items[0].name).toBe('n');
    expect(accepted(set(seed(), ['items', 0, 'name'], 'n'.repeat(200))).items[0].name).toHaveLength(200);
    expect(parsePlan(set(seed(), ['items', 0, 'name'], ''))).toEqual(refusal('items.0.name: too_small'));
    expect(parsePlan(set(seed(), ['items', 0, 'name'], 'n'.repeat(201)))).toEqual(refusal('items.0.name: too_big'));
    expect(parsePlan(set(seed(), ['items', 0, 'name'], 5))).toEqual(refusal('items.0.name: invalid_type'));
  });

  it('item host: 0 and 255 characters accepted; 256 refused', () => {
    expect(accepted(set(seed(), ['items', 0, 'host'], '')).items[0].host).toBe('');
    expect(accepted(set(seed(), ['items', 0, 'host'], 'h'.repeat(255))).items[0].host).toHaveLength(255);
    expect(parsePlan(set(seed(), ['items', 0, 'host'], 'h'.repeat(256)))).toEqual(refusal('items.0.host: too_big'));
    expect(parsePlan(set(seed(), ['items', 0, 'host'], null))).toEqual(refusal('items.0.host: invalid_type'));
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
      expect(read(accepted(set(seed(), path, null)))).toBeNull();
      expect(read(accepted(set(seed(), path, 'http://x.example/a?b=1#c')))).toBe('http://x.example/a?b=1#c');
      expect(read(accepted(set(seed(), path, 'HTTPS://X.EXAMPLE/')))).toBe('HTTPS://X.EXAMPLE/');
      expect(max).toHaveLength(2048);
      expect(read(accepted(set(seed(), path, max)))).toBe(max);
    });

    it('refuses 2049 characters', () => {
      expect(parsePlan(set(seed(), path, `${max}a`))).toEqual(reason('too_big'));
    });

    it.each([
      'javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'blob:https://x.example/1', 'file:///etc/passwd',
      'ftp://x.example/', '//x.example/a', '/relative/path', 'relative', '', ' https://x.example/', 'https://x.example/ ',
      '\thttps://x.example/', 'https://x.example/\n', '\u0001https://x.example/', 'https://', 'http//x.example',
    ])('refuses %j', (url) => {
      expect(parsePlan(set(seed(), path, url))).toEqual(reason('url'));
    });

    it('refuses a non-string', () => {
      expect(parsePlan(set(seed(), path, 5))).toEqual(reason('invalid_type'));
      expect(parsePlan(set(seed(), path, { href: 'https://x.example/' }))).toEqual(reason('invalid_type'));
    });
  });

  it('item price: null, 0 and 10,000,000 accepted; −0.01 and 10,000,000.01 refused', () => {
    expect(accepted(set(seed(), ['items', 0, 'price'], null)).items[0].price).toBeNull();
    expect(accepted(set(seed(), ['items', 0, 'price'], 0)).items[0].price).toBe(0);
    expect(accepted(set(seed(), ['items', 0, 'price'], 10_000_000)).items[0].price).toBe(10_000_000);
    expect(parsePlan(set(seed(), ['items', 0, 'price'], -0.01))).toEqual(refusal('items.0.price: too_small'));
    expect(parsePlan(set(seed(), ['items', 0, 'price'], 10_000_000.01))).toEqual(refusal('items.0.price: too_big'));
    expect(parsePlan(set(seed(), ['items', 0, 'price'], Infinity))).toEqual(refusal('items.0.price: invalid_type'));
  });

  it.each(['w', 'd', 'h'] as const)('item %s: 0.01 and 720 accepted; 0 and 720.01 refused', (key) => {
    expect(accepted(set(seed(), ['items', 0, key], 0.01)).items[0][key]).toBe(0.01);
    expect(accepted(set(seed(), ['items', 0, key], 720)).items[0][key]).toBe(720);
    expect(parsePlan(set(seed(), ['items', 0, key], 0))).toEqual(refusal(`items.0.${key}: too_small`));
    expect(parsePlan(set(seed(), ['items', 0, key], -1))).toEqual(refusal(`items.0.${key}: too_small`));
    expect(parsePlan(set(seed(), ['items', 0, key], 720.01))).toEqual(refusal(`items.0.${key}: too_big`));
  });

  it.each(['x', 'y'] as const)('item %s: −1440 and 1440 accepted; −1440.01 and 1440.01 refused', (key) => {
    expect(accepted(set(seed(), ['items', 0, key], 1440)).items[0][key]).toBe(1440);
    expect(accepted(set(seed(), ['items', 0, key], -1440)).items[0][key]).toBe(-1440);
    expect(parsePlan(set(seed(), ['items', 0, key], 1440.01))).toEqual(refusal(`items.0.${key}: too_big`));
    expect(parsePlan(set(seed(), ['items', 0, key], -1440.01))).toEqual(refusal(`items.0.${key}: too_small`));
  });

  it('item angle: any finite number accepted; NaN and Infinity refused; a v2 item without angle refused', () => {
    expect(accepted(set(seed(), ['items', 0, 'angle'], -1e6)).items[0].angle).toBe(80);
    expect(parsePlan(set(seed(), ['items', 0, 'angle'], NaN))).toEqual(refusal('items.0.angle: invalid_type'));
    expect(parsePlan(set(seed(), ['items', 0, 'angle'], -Infinity))).toEqual(refusal('items.0.angle: invalid_type'));
    expect(parsePlan(set(drop(seed(), ['items', 0, 'angle']), ['items', 0, 'rot'], 1))).toEqual(refusal('items.0.angle: invalid_type'));
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
    expect(accepted(set(seed(), ['items', 0, 'model', 'tier'], tier)).items[0].model.tier).toBe(tier);
  });

  it('item model.tier outside the four refused; model.label 0 and 200 accepted, 201 refused', () => {
    expect(parsePlan(set(seed(), ['items', 0, 'model', 'tier'], 'gold'))).toEqual(refusal('items.0.model.tier: invalid_value'));
    expect(accepted(set(seed(), ['items', 0, 'model', 'label'], '')).items[0].model.label).toBe('');
    expect(accepted(set(seed(), ['items', 0, 'model', 'label'], 'l'.repeat(200))).items[0].model.label).toHaveLength(200);
    expect(parsePlan(set(seed(), ['items', 0, 'model', 'label'], 'l'.repeat(201)))).toEqual(refusal('items.0.model.label: too_big'));
    expect(parsePlan(set(seed(), ['items', 0, 'model'], null))).toEqual(refusal('items.0.model: invalid_type'));
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
    JSON.parse(JSON.stringify(fullDoc()).replace(where, `${where}"__proto__":{"isAdmin":true},`).replace('"ft"', '"yd"'));

  const hostileLists: [string, unknown][] = [
    ['openings missing', drop(full(), ['openings'])],
    ['obstacles missing', drop(full(), ['obstacles'])],
    ['openings null', set(full(), ['openings'], null)],
    ['obstacles a string', set(full(), ['obstacles'], huge)],
    ['openings an object keyed like an array', set(full(), ['openings'], { 0: D1 })],
    ['an opening null', set(full(), ['openings', 0], null)],
    ['an opening a deeply nested array', set(full(), ['openings', 0], nested(10_000))],
    ['an obstacle a deeply nested array', set(full(), ['obstacles', 0], nested(10_000))],
    ['an opening kind a number', set(full(), ['openings', 0, 'kind'], 1)],
    ['an opening kind missing', drop(full(), ['openings', 0, 'kind'])],
    ['an opening wallId huge', set(full(), ['openings', 0, 'wallId'], huge)],
    ['an opening offset a numeric string', set(full(), ['openings', 0, 'offset'], '20')],
    ['a window sill null', set(full(), ['openings', 1, 'sill'], null)],
    ['a door missing its swing', drop(full(), ['openings', 0, 'swing'])],
    ['an obstacle label huge', set(full(), ['obstacles', 0, 'label'], huge)],
    ['an obstacle shape missing', drop(full(), ['obstacles', 0, 'shape'])],
    ['an obstacle rotation a string', set(full(), ['obstacles', 0, 'rotation'], '90')],
    ['an obstacle elevation an array', set(full(), ['obstacles', 0, 'elevation'], [0])],
    ['an obstacle height Infinity', set(full(), ['obstacles', 0, 'height'], Infinity)],
    ['a huge openings array', set(full(), ['openings'], new Array(1_000_000).fill(D1))],
    ['a huge obstacles array', set(full(), ['obstacles'], new Array(1_000_000).fill(0))],
    ['__proto__ in an opening with a bad units', protoJson('"openings":[{')],
    ['__proto__ in an obstacle with a bad units', protoJson('"obstacles":[{')],
  ];

  const hostile: [string, unknown][] = [
    ['empty object', {}],
    ['only a version', { schemaVersion: 2 }],
    ['units a number', set(seed(), ['units'], 1)],
    ['units missing', drop(seed(), ['units'])],
    ['room null', set(seed(), ['room'], null)],
    ['room an array', set(seed(), ['room'], [])],
    ['room a string', set(seed(), ['room'], 'room')],
    ['room missing', drop(seed(), ['room'])],
    ['height missing', drop(seed(), ['room', 'height'])],
    ['outline missing', drop(seed(), ['room', 'outline'])],
    ['outline of numbers', withOutline([1, 2, 3, 4])],
    ['outline of nested arrays', withOutline([nested(1000), nested(1000), nested(1000)])],
    ['corner missing x', drop(seed(), ['room', 'outline', 0, 'x'])],
    ['corner id a number', set(seed(), ['room', 'outline', 0, 'id'], 1)],
    ['items null', set(seed(), ['items'], null)],
    ['items a string', set(seed(), ['items'], huge)],
    ['items missing', drop(seed(), ['items'])],
    ['item null', set(seed(), ['items', 0], null)],
    ['item a deeply nested array', set(seed(), ['items', 0], nested(10_000))],
    ['item kind a number', set(seed(), ['items', 0, 'kind'], 3)],
    ['item name huge', set(seed(), ['items', 0, 'name'], huge)],
    ['item host huge', set(seed(), ['items', 0, 'host'], huge)],
    ['item sourceUrl huge', set(seed(), ['items', 0, 'sourceUrl'], `https://x.example/${huge}`)],
    ['item price a boolean', set(seed(), ['items', 0, 'price'], false)],
    ['item h a numeric string', set(seed(), ['items', 0, 'h'], '38')],
    ['item x null', set(seed(), ['items', 0, 'x'], null)],
    ['item y an array', set(seed(), ['items', 0, 'y'], [0])],
    ['item angle a string', set(seed(), ['items', 0, 'angle'], '90')],
    ['item model a string', set(seed(), ['items', 0, 'model'], 'box')],
    ['item model missing', drop(seed(), ['items', 0, 'model'])],
    ['model label a number', set(seed(), ['items', 0, 'model', 'label'], 1)],
    ['model assetUrl a data URL', set(seed(), ['items', 0, 'model', 'assetUrl'], 'data:model/gltf+json,{}')],
    ['a huge items array', set(seed(), ['items'], new Array(1_000_000).fill(0))],
    ['a huge outline', withOutline(new Array(1_000_000).fill({ id: 'c', x: 0, y: 0 }))],
    ['v1 room missing w', drop(v1Seed(), ['room', 'w'])],
    ['v1 room given as an outline', set(v1Seed(), ['room'], (seed().room as Obj))],
    ['v2 room given as w, l, h', set(seed(), ['room'], { w: 144, l: 168, h: 96 })],
    ['__proto__ at the top with a bad units', protoJson('{')],
    ['__proto__ in room with a bad units', protoJson('"room":{')],
    ['__proto__ in an item with a bad units', protoJson('"items":[{')],
    ['__proto__ in a model with a bad units', protoJson('"model":{')],
    ['a Map', new Map([['schemaVersion', 2]])],
    ['a Date', new Date(0)],
    ['a boxed number', Object(2)],
    ...hostileLists,
  ];

  it('has at least 30 hostile inputs, at least 10 of them in the openings and obstacles', () => {
    expect(hostile.length).toBeGreaterThanOrEqual(30);
    expect(hostileLists.length).toBeGreaterThanOrEqual(10);
  });

  it.each(hostile)('%s → ok: false, newer: false, a safe reason, no throw', (_name, input) => {
    let result: ParseResult | undefined;
    expect(() => { result = parsePlan(input); }).not.toThrow();
    expect(result).toEqual({ ok: false, newer: false, reason: expect.stringMatching(REASON_FORMAT) });
    expect(result?.ok === false && result.reason.length).toBeLessThanOrEqual(80);
    expect(({} as Obj).isAdmin).toBeUndefined();
  });
});

describe('parsePlan — limits shared with CONFIG', () => {
  it('room height and v1 room sizes: CONFIG.roomMin and CONFIG.roomMax accepted; 0.01 beyond refused', () => {
    expect(accepted(set(seed(), ['room', 'height'], CONFIG.roomMin)).room.height).toBe(CONFIG.roomMin);
    expect(accepted(set(seed(), ['room', 'height'], CONFIG.roomMax)).room.height).toBe(CONFIG.roomMax);
    expect(parsePlan(set(seed(), ['room', 'height'], CONFIG.roomMin - 0.01))).toEqual(refusal('room.height: too_small'));
    expect(parsePlan(set(seed(), ['room', 'height'], CONFIG.roomMax + 0.01))).toEqual(refusal('room.height: too_big'));
    const empty = set(v1Seed(), ['items'], []);
    expect(parsePlan(set(empty, ['room', 'w'], CONFIG.roomMax)).ok).toBe(true);
    expect(parsePlan(set(empty, ['room', 'w'], CONFIG.roomMax + 0.01))).toEqual(refusal('room.w: too_big'));
  });

  it('room.outline: CONFIG.maxCorners corners accepted; one more refused', () => {
    expect(accepted(withOutline(regular(CONFIG.maxCorners, 300, 360, 360))).room.outline).toHaveLength(CONFIG.maxCorners);
    expect(parsePlan(withOutline(regular(CONFIG.maxCorners + 1, 300, 360, 360)))).toEqual(refusal('room.outline: too_big'));
  });

  it('follows CONFIG when its room size and corner limits change', async () => {
    vi.resetModules();
    vi.doMock('../config', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../config')>();
      return { CONFIG: { ...actual.CONFIG, roomMin: 48, roomMax: 600, maxCorners: 10 } };
    });
    try {
      const { parsePlan: parseWith } = await import('./planSchema');
      expect(parseWith(set(seed(), ['room', 'height'], 600)).ok).toBe(true);
      expect(parseWith(set(seed(), ['room', 'height'], 600.01))).toEqual(refusal('room.height: too_big'));
      expect(parseWith(set(seed(), ['room', 'height'], 48)).ok).toBe(true);
      expect(parseWith(set(seed(), ['room', 'height'], 47.99))).toEqual(refusal('room.height: too_small'));
      expect(parseWith(withOutline(regular(10, 200, 300, 300))).ok).toBe(true);
      expect(parseWith(withOutline(regular(11, 200, 300, 300)))).toEqual(refusal('room.outline: too_big'));
    } finally {
      vi.doUnmock('../config');
      vi.resetModules();
    }
  });

  it('follows CONFIG when its opening and obstacle limits change, through the shared validators', async () => {
    vi.resetModules();
    vi.doMock('../config', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../config')>();
      return { CONFIG: { ...actual.CONFIG, maxOpenings: 1, maxObstacles: 1, obstacleLabelMax: 3, openingWidthMax: 30, obstacleSizeMax: 20 } };
    });
    try {
      const { parsePlan: parseWith } = await import('./planSchema');
      const one = set(set(full(), ['openings'], [{ ...D1, width: 30 }]), ['obstacles'], [{ ...B1, width: 20, depth: 20 }]);
      expect(parseWith(one).ok).toBe(true);
      expect(parseWith(full())).toEqual(refusal('openings: too_big'));
      expect(parseWith(set(full(), ['openings'], [D1]))).toEqual(refusal('obstacles: too_big'));
      expect(parseWith(set(one, ['obstacles', 0, 'label'], 'Boxy'))).toEqual(refusal('obstacles.0.label: too_big'));
      expect(parseWith(set(one, ['openings', 0, 'width'], 30.01))).toEqual(refusal('openings: opening-size'));
      expect(parseWith(set(one, ['obstacles', 0, 'width'], 20.01))).toEqual(refusal('obstacles: obstacle-size'));
    } finally {
      vi.doUnmock('../config');
      vi.resetModules();
    }
  });
});

/** A raw window `id` on `wallId` at `offset`, 12 in wide. */
function rawWindow(id: string, wallId: string, offset: number): Obj {
  return { id, kind: 'window', wallId, offset, width: 12, sill: 36, height: 48 };
}

/** full() with the 720 × 720 room, so 64 openings and the widest ones fit. */
function bigRoom(): Obj {
  return set(full(), ['room', 'outline'], corners([0, 0], [720, 0], [720, 720], [0, 720]));
}

/** 16 windows 24 in apart on each wall of bigRoom(): `count` of them, ids w0, w1, …. */
function manyWindows(count: number): Obj[] {
  return Array.from({ length: count }, (_, k) => rawWindow(`w${k}`, `c${(k % 4) + 1}`, Math.floor(k / 4) * 24));
}

/** `count` default boxes with ids o0, o1, …. */
function manyObstacles(count: number): Obstacle[] {
  return Array.from({ length: count }, (_, k) => newObstacle('box', { x: 40, y: 120 }, 96, `o${k}`));
}

describe('parsePlan — doors and windows', () => {
  it('stores every opening number rounded to 0.01', () => {
    const input = set(set(set(full(), ['openings', 0, 'offset'], 20.004), ['openings', 0, 'width'], 32.006), ['openings', 1, 'sill'], 36.004);
    const [door, win] = accepted(set(input, ['openings', 1, 'height'], 48.006)).openings;
    expect([door.offset, door.width]).toEqual([20, 32.01]);
    expect(win).toEqual({ ...W1, sill: 36, height: 48.01 });
  });

  it('keeps only a window’s own keys: hinge, swing and other extra keys are dropped', () => {
    const input = set(set(set(full(), ['openings', 1, 'hinge'], 'left'), ['openings', 1, 'swing'], 'out'), ['openings', 1, 'extra'], 1);
    const doc = accepted(input);
    expect(doc.openings[1]).toEqual(W1);
    expect(Object.keys(doc.openings[1])).toEqual(['id', 'kind', 'wallId', 'offset', 'width', 'sill', 'height']);
  });

  it('keeps only a door’s own keys: a sill is dropped', () => {
    const doc = accepted(set(full(), ['openings', 0, 'sill'], 36));
    expect(doc.openings[0]).toEqual(D1);
    expect(Object.keys(doc.openings[0])).toEqual(['id', 'kind', 'wallId', 'offset', 'width', 'height', 'hinge', 'swing']);
  });

  it('refuses an opening on a wall the outline does not have', () => {
    expect(parsePlan(set(full(), ['openings', 0, 'wallId'], 'zz'))).toEqual(refusal('openings: opening-off-wall'));
  });

  it('validates openings against the outline as stored, after a corner rename', () => {
    expect(parsePlan(set(full(), ['room', 'outline', 0, 'id'], 'c9'))).toEqual(refusal('openings: opening-off-wall'));
  });

  it('offset: 112 on the 144 in wall accepted; 113 and −1 refused (off its wall)', () => {
    expect(accepted(set(full(), ['openings', 0, 'offset'], 112)).openings[0].offset).toBe(112);
    expect(parsePlan(set(full(), ['openings', 0, 'offset'], 113))).toEqual(refusal('openings: opening-off-wall'));
    expect(parsePlan(set(full(), ['openings', 0, 'offset'], -1))).toEqual(refusal('openings: opening-off-wall'));
  });

  it('refuses two overlapping openings; touching ones accepted', () => {
    expect(parsePlan(set(full(), ['openings', 1], rawWindow('w1', 'c1', 50)))).toEqual(refusal('openings: opening-overlap'));
    expect(accepted(set(full(), ['openings', 1], rawWindow('w1', 'c1', 52))).openings).toHaveLength(2);
  });

  it('openings: 0 and 64 accepted; 65 refused', () => {
    expect(accepted(set(full(), ['openings'], [])).openings).toEqual([]);
    expect(accepted(set(bigRoom(), ['openings'], manyWindows(64))).openings).toHaveLength(64);
    expect(parsePlan(set(bigRoom(), ['openings'], manyWindows(65)))).toEqual(refusal('openings: too_big'));
  });

  it('width: 12 and 240 accepted; 11 and 240.01 refused', () => {
    expect(accepted(set(full(), ['openings', 1, 'width'], 12)).openings[1].width).toBe(12);
    expect(accepted(set(bigRoom(), ['openings', 1, 'width'], 240)).openings[1].width).toBe(240);
    expect(parsePlan(set(full(), ['openings', 1, 'width'], 11))).toEqual(refusal('openings: opening-size'));
    expect(parsePlan(set(bigRoom(), ['openings', 1, 'width'], 240.01))).toEqual(refusal('openings: opening-size'));
  });

  it('height: 12 and 240 accepted; 11.99 and 240.01 refused', () => {
    expect(accepted(set(full(), ['openings', 0, 'height'], 12)).openings[0].height).toBe(12);
    expect(accepted(set(full(), ['openings', 0, 'height'], 240)).openings[0].height).toBe(240);
    expect(parsePlan(set(full(), ['openings', 0, 'height'], 11.99))).toEqual(refusal('openings: opening-size'));
    expect(parsePlan(set(full(), ['openings', 1, 'height'], 240.01))).toEqual(refusal('openings: opening-size'));
  });

  it('sill: 0 and 240 accepted; −0.01 and 240.01 refused', () => {
    expect(accepted(set(full(), ['openings', 1, 'sill'], 0)).openings[1]).toMatchObject({ sill: 0 });
    expect(accepted(set(full(), ['openings', 1, 'sill'], 240)).openings[1]).toMatchObject({ sill: 240 });
    expect(parsePlan(set(full(), ['openings', 1, 'sill'], -0.01))).toEqual(refusal('openings: opening-size'));
    expect(parsePlan(set(full(), ['openings', 1, 'sill'], 240.01))).toEqual(refusal('openings: opening-size'));
  });

  it('refuses an unknown kind, hinge or swing', () => {
    expect(parsePlan(set(full(), ['openings', 0, 'kind'], 'gate'))).toEqual(refusal('openings.0.kind: invalid_union'));
    expect(parsePlan(set(full(), ['openings', 0, 'hinge'], 'left'))).toEqual(refusal('openings.0.hinge: invalid_value'));
    expect(parsePlan(set(full(), ['openings', 0, 'swing'], 'sideways'))).toEqual(refusal('openings.0.swing: invalid_value'));
  });

  it('accepts both hinges and both swings', () => {
    const door = accepted(set(set(full(), ['openings', 0, 'hinge'], 'end'), ['openings', 0, 'swing'], 'out')).openings[0];
    expect(door).toEqual({ ...D1, hinge: 'end', swing: 'out' });
  });

  it('refuses an id or wallId outside [A-Za-z0-9_-]{1,64}', () => {
    expect(parsePlan(set(full(), ['openings', 0, 'id'], '<b>'))).toEqual(refusal('openings.0.id: invalid_format'));
    expect(parsePlan(set(full(), ['openings', 0, 'wallId'], 'c1 '))).toEqual(refusal('openings.0.wallId: invalid_format'));
    expect(parsePlan(set(full(), ['openings', 0, 'wallId'], 'c'.repeat(65)))).toEqual(refusal('openings.0.wallId: invalid_format'));
  });

  it.each([
    ['NaN', NaN], ['Infinity', Infinity], ['"20"', '20'], ['null', null], ['true', true],
  ])('refuses %s where an opening number is expected (no coercion)', (_name, value) => {
    expect(parsePlan(set(full(), ['openings', 0, 'offset'], value))).toEqual(refusal('openings.0.offset: invalid_type'));
    expect(parsePlan(set(full(), ['openings', 1, 'sill'], value))).toEqual(refusal('openings.1.sill: invalid_type'));
  });
});

describe('parsePlan — openings on an outline stored in reverse order', () => {
  /*
   * The seeded rectangle given in reverse order: c4 (0,168), c3 (144,168), c2 (144,0), c1 (0,0), so
   * negative signed area. Its walls are c4→c3 (y = 168), c3→c2 (x = 144), c2→c1 (y = 0, running from
   * (144,0) to (0,0)) and c1→c4 (x = 0). A door on wall c2 at offset 20, width 32, runs from x = 124
   * to x = 92 on y = 0.
   *
   * normaliseOutline reverses the list to c1 (0,0), c2 (144,0), c3 (144,168), c4 (0,168). The wall on
   * y = 0 is now c1→c2, from (0,0) to (144,0), length 144. Kept on that physical wall, the door's
   * wallId becomes c1 (the old wall's end corner) and its offset 144 − 20 − 32 = 92, so it runs from
   * x = 92 to x = 124: the same two end points. Its hinge flips from start to end.
   */
  const REVERSED = [{ id: 'c4', x: 0, y: 168 }, { id: 'c3', x: 144, y: 168 }, { id: 'c2', x: 144, y: 0 }, { id: 'c1', x: 0, y: 0 }];
  const GIVEN_DOOR: Door = { ...D1, wallId: 'c2', offset: 20, hinge: 'start' };

  function reversedWith(door: Door): Obj {
    return set(set(full(), ['room', 'outline'], REVERSED), ['openings'], [door]);
  }

  it('keeps a door on its physical wall: outline stored in positive order, wallId c1, offset 92, hinge flipped', () => {
    const doc = accepted(reversedWith(GIVEN_DOOR));
    expect(doc.room.outline.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(doc.openings).toEqual([{ ...GIVEN_DOOR, wallId: 'c1', offset: 92, hinge: 'end' }]);
    const given = openingSpan(REVERSED, GIVEN_DOOR);
    const stored = openingSpan(doc.room.outline, doc.openings[0]);
    expect(given).toMatchObject({ a: { x: 124, y: 0 }, b: { x: 92, y: 0 } });
    // The same two end points on y = 0; measured from the other end, so a and b swap.
    expect(stored).toMatchObject({ a: given?.b, b: given?.a });
  });

  it('refuses a door that does not fit its wall in the given outline', () => {
    expect(parsePlan(reversedWith({ ...GIVEN_DOOR, offset: 130 }))).toEqual(refusal('openings: opening-off-wall'));
  });

  it('refuses a door on a wall the given outline does not have', () => {
    expect(parsePlan(reversedWith({ ...GIVEN_DOOR, wallId: 'zz' }))).toEqual(refusal('openings: opening-off-wall'));
  });
});

describe('parsePlan — obstacles', () => {
  it('stores every obstacle number rounded to 0.01 and the rotation through storedAngle', () => {
    const input = set(set(set(full(), ['obstacles', 0, 'x'], 40.004), ['obstacles', 0, 'width'], 24.006), ['obstacles', 0, 'elevation'], 0.004);
    const box = accepted(set(input, ['obstacles', 0, 'rotation'], 12.346)).obstacles[0];
    expect(box).toEqual({ ...B1, x: 40, width: 24.01, elevation: 0, rotation: 12.35 });
  });

  it.each([[450, 90], [-90, 270], [360, 0]])('stores rotation %s as %s', (rotation, stored) => {
    expect(accepted(set(full(), ['obstacles', 0, 'rotation'], rotation)).obstacles[0].rotation).toBe(stored);
  });

  it('obstacles: 0 and 64 accepted; 65 refused', () => {
    expect(accepted(set(full(), ['obstacles'], [])).obstacles).toEqual([]);
    expect(accepted(set(full(), ['obstacles'], manyObstacles(64))).obstacles).toHaveLength(64);
    expect(parsePlan(set(full(), ['obstacles'], manyObstacles(65)))).toEqual(refusal('obstacles: too_big'));
  });

  it.each(['width', 'depth'] as const)('%s: 1 and 240 accepted; 0.99 and 241 refused', (key) => {
    expect(accepted(set(full(), ['obstacles', 0, key], 1)).obstacles[0][key]).toBe(1);
    expect(accepted(set(full(), ['obstacles', 0, key], 240)).obstacles[0][key]).toBe(240);
    expect(parsePlan(set(full(), ['obstacles', 0, key], 0.99))).toEqual(refusal('obstacles: obstacle-size'));
    expect(parsePlan(set(full(), ['obstacles', 0, key], 241))).toEqual(refusal('obstacles: obstacle-size'));
  });

  it('height: 1 and 720 accepted; 0.99 and 720.01 refused', () => {
    expect(accepted(set(full(), ['obstacles', 0, 'height'], 1)).obstacles[0].height).toBe(1);
    expect(accepted(set(full(), ['obstacles', 0, 'height'], 720)).obstacles[0].height).toBe(720);
    expect(parsePlan(set(full(), ['obstacles', 0, 'height'], 0.99))).toEqual(refusal('obstacles: obstacle-size'));
    expect(parsePlan(set(full(), ['obstacles', 0, 'height'], 720.01))).toEqual(refusal('obstacles: obstacle-size'));
  });

  it('elevation: 0 and 720 accepted; −1 and 720.01 refused', () => {
    expect(accepted(set(full(), ['obstacles', 0, 'elevation'], 0)).obstacles[0].elevation).toBe(0);
    expect(accepted(set(full(), ['obstacles', 0, 'elevation'], 720)).obstacles[0].elevation).toBe(720);
    expect(parsePlan(set(full(), ['obstacles', 0, 'elevation'], -1))).toEqual(refusal('obstacles: obstacle-size'));
    expect(parsePlan(set(full(), ['obstacles', 0, 'elevation'], 720.01))).toEqual(refusal('obstacles: obstacle-size'));
  });

  it('label: 0 and 40 characters accepted; 41 refused; a non-string refused', () => {
    expect(accepted(set(full(), ['obstacles', 0, 'label'], '')).obstacles[0].label).toBe('');
    expect(accepted(set(full(), ['obstacles', 0, 'label'], 'l'.repeat(40))).obstacles[0].label).toHaveLength(40);
    expect(parsePlan(set(full(), ['obstacles', 0, 'label'], 'l'.repeat(41)))).toEqual(refusal('obstacles.0.label: too_big'));
    expect(parsePlan(set(full(), ['obstacles', 0, 'label'], 5))).toEqual(refusal('obstacles.0.label: invalid_type'));
  });

  it('refuses an unknown shape', () => {
    expect(parsePlan(set(full(), ['obstacles', 0, 'shape'], 'cone'))).toEqual(refusal('obstacles.0.shape: invalid_value'));
  });

  it('refuses a cylinder whose depth differs from its width, after rounding', () => {
    expect(parsePlan(set(full(), ['obstacles', 1, 'depth'], 13))).toEqual(refusal('obstacles: obstacle-size'));
    expect(accepted(set(full(), ['obstacles', 1, 'depth'], 12.004)).obstacles[1].depth).toBe(12);
  });

  it.each(['x', 'y'] as const)('%s: −1440 and 1440 accepted; −1441 and 1441 refused', (key) => {
    expect(accepted(set(full(), ['obstacles', 0, key], 1440)).obstacles[0][key]).toBe(1440);
    expect(accepted(set(full(), ['obstacles', 0, key], -1440)).obstacles[0][key]).toBe(-1440);
    expect(parsePlan(set(full(), ['obstacles', 0, key], 1441))).toEqual(refusal(`obstacles.0.${key}: too_big`));
    expect(parsePlan(set(full(), ['obstacles', 0, key], -1441))).toEqual(refusal(`obstacles.0.${key}: too_small`));
  });

  it.each([
    ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['"24"', '24'], ['null', null], ['true', true], ['[24]', [24]],
  ])('refuses %s where an obstacle number is expected (no coercion)', (_name, value) => {
    for (const key of ['x', 'y', 'rotation', 'width', 'depth', 'height', 'elevation']) {
      expect(parsePlan(set(full(), ['obstacles', 0, key], value))).toEqual(refusal(`obstacles.0.${key}: invalid_type`));
    }
  });

  it('refuses a huge finite size that rounding would turn into Infinity', () => {
    expect(parsePlan(set(full(), ['obstacles', 0, 'height'], 1e308))).toEqual(refusal('obstacles: obstacle-size'));
    expect(parsePlan(set(full(), ['openings', 0, 'offset'], 1e308))).toEqual(refusal('openings: opening-size'));
  });
});

describe('parsePlan — ids across corners, items, openings and obstacles', () => {
  it('refuses an opening id equal to an obstacle id, an item id or a corner id', () => {
    expect(parsePlan(set(full(), ['obstacles', 0, 'id'], 'd1'))).toEqual(refusal('obstacles: duplicate-id'));
    expect(parsePlan(set(full(), ['openings', 0, 'id'], 'seed-bed'))).toEqual(refusal('openings: duplicate-id'));
    expect(parsePlan(set(full(), ['openings', 0, 'id'], 'c3'))).toEqual(refusal('openings: duplicate-id'));
  });

  it('refuses an obstacle id equal to an item id or a corner id', () => {
    expect(parsePlan(set(full(), ['obstacles', 1, 'id'], 'seed-desk'))).toEqual(refusal('obstacles: duplicate-id'));
    expect(parsePlan(set(full(), ['obstacles', 1, 'id'], 'c4'))).toEqual(refusal('obstacles: duplicate-id'));
  });

  it('refuses two openings or two obstacles sharing an id', () => {
    expect(parsePlan(set(full(), ['openings', 1, 'id'], 'd1'))).toEqual(refusal('openings: duplicate-id'));
    expect(parsePlan(set(full(), ['obstacles', 1, 'id'], 'b1'))).toEqual(refusal('obstacles: duplicate-id'));
  });

  it('refuses an item id equal to a corner id', () => {
    expect(parsePlan(set(full(), ['items', 0, 'id'], 'c1'))).toEqual(refusal('items: duplicate-id'));
  });
});

describe('parsePlan — new field names appear by name in a reason', () => {
  it.each([
    [['openings'], 'x', 'openings: invalid_type'],
    [['obstacles'], 'x', 'obstacles: invalid_type'],
    [['openings', 0, 'wallId'], 7, 'openings.0.wallId: invalid_type'],
    [['openings', 0, 'offset'], 'x', 'openings.0.offset: invalid_type'],
    [['openings', 0, 'width'], 'x', 'openings.0.width: invalid_type'],
    [['openings', 0, 'height'], 'x', 'openings.0.height: invalid_type'],
    [['openings', 1, 'sill'], 'x', 'openings.1.sill: invalid_type'],
    [['openings', 0, 'hinge'], 'x', 'openings.0.hinge: invalid_value'],
    [['openings', 0, 'swing'], 'x', 'openings.0.swing: invalid_value'],
    [['openings', 0, 'id'], 7, 'openings.0.id: invalid_type'],
    [['obstacles', 0, 'shape'], 'x', 'obstacles.0.shape: invalid_value'],
    [['obstacles', 0, 'label'], 7, 'obstacles.0.label: invalid_type'],
    [['obstacles', 0, 'rotation'], 'x', 'obstacles.0.rotation: invalid_type'],
    [['obstacles', 0, 'width'], 'x', 'obstacles.0.width: invalid_type'],
    [['obstacles', 0, 'depth'], 'x', 'obstacles.0.depth: invalid_type'],
    [['obstacles', 0, 'height'], 'x', 'obstacles.0.height: invalid_type'],
    [['obstacles', 0, 'elevation'], 'x', 'obstacles.0.elevation: invalid_type'],
  ] as const)('%j', (path, value, reason) => {
    const result = parsePlan(set(full(), path, value));
    expect(result).toEqual(refusal(reason));
    expect(result.ok === false && result.reason).not.toContain('?');
  });
});

describe('parsePlan — result type', () => {
  it('returns a PlanDocument whose items are Items', () => {
    const doc: PlanDocument = accepted(seed());
    const item: Item = doc.items[0];
    expect(item.model).toEqual({ tier: 'retailer', label: '3D model from retailer', assetUrl: null });
  });
});
