// @vitest-environment node
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import { newObstacle } from '../domain/obstacles';
import { parsePlan } from '../domain/planSchema';
import type { Item, PlanDocument } from '../domain/types';
import { decodePlan, encodePlan } from './shareLink';

/**
 * The share-link codec (Task 1). Every expected link is checked against Node's own base64url and
 * raw-deflate, so the format is pinned independently of the code under test.
 */

const MAX_BYTES = CONFIG.maxStoredChars;
const MAX_DATA_CHARS = 2 + Math.ceil((MAX_BYTES * 4) / 3);

type StreamGlobal = 'CompressionStream' | 'DecompressionStream';
const realGlobals: Record<StreamGlobal, unknown> = {
  CompressionStream: globalThis.CompressionStream,
  DecompressionStream: globalThis.DecompressionStream,
};

/** Replaces (or, with undefined, removes) a stream global for one test; afterEach restores it. */
function replaceGlobal(name: StreamGlobal, value: unknown): void {
  if (value === undefined) delete (globalThis as Record<string, unknown>)[name];
  else (globalThis as Record<string, unknown>)[name] = value;
}

afterEach(() => {
  for (const name of Object.keys(realGlobals) as StreamGlobal[]) replaceGlobal(name, realGlobals[name]);
});

/** Counts DecompressionStream constructions from now until the test ends; returns the reader. */
function countInflates(): () => number {
  let constructed = 0;
  const Real = realGlobals.DecompressionStream as typeof DecompressionStream;
  replaceGlobal('DecompressionStream', class extends Real {
    constructor(format: CompressionFormat) {
      super(format);
      constructed += 1;
    }
  });
  return () => constructed;
}

function b64url(bytes: Uint8Array | string): string {
  return Buffer.from(bytes).toString('base64url');
}

/** The UTF-8 JSON a link carries, read with Node's base64url and raw inflate. */
function payloadJson(data: string): string {
  const dot = data.indexOf('.');
  const bytes = Buffer.from(data.slice(dot + 1), 'base64url');
  const version = data.slice(0, dot);
  if (version === '1') return inflateRawSync(bytes).toString('utf8');
  if (version === '0') return bytes.toString('utf8');
  throw new Error(`unexpected version ${version}`);
}

function accepted(input: unknown): PlanDocument {
  const result = parsePlan(input);
  if (!result.ok) throw new Error(`fixture refused: ${result.reason}`);
  return result.doc;
}

async function encoded(doc: PlanDocument): Promise<string> {
  const data = await encodePlan(doc);
  if (data === null) throw new Error('expected share data, got null');
  return data;
}

async function expectRoundTrip(doc: PlanDocument): Promise<void> {
  const data = await encoded(doc);
  expect(data.startsWith('1.')).toBe(true);
  expect(await decodePlan(data)).toEqual({ status: 'ok', doc: accepted(doc) });
}

function item(id: string, patch: Partial<Item> = {}): Item {
  return {
    id, kind: 'bed', name: 'Low platform bed, queen', host: 'shop.example', sourceUrl: null, price: 890,
    w: 64, d: 85, h: 38, x: 72, y: 42.5, angle: 0,
    model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
    ...patch,
  };
}

function lShape(): PlanDocument {
  return {
    ...createInitialDocument(),
    room: {
      outline: [
        { id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 120, y: 0 }, { id: 'c3', x: 120, y: 96 },
        { id: 'c4', x: 240, y: 96 }, { id: 'c5', x: 240, y: 192 }, { id: 'c6', x: 0, y: 192 },
      ],
      height: 96,
    },
  };
}

/** Angled wall c2→c3, a door on c1, a window on the angled wall and a column. */
function angledRoom(): PlanDocument {
  return {
    ...createInitialDocument(),
    room: {
      outline: [
        { id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 144, y: 0 }, { id: 'c3', x: 192, y: 72 },
        { id: 'c4', x: 192, y: 168 }, { id: 'c5', x: 0, y: 168 },
      ],
      height: 96,
    },
    openings: [
      { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' },
      { id: 'w1', kind: 'window', wallId: 'c2', offset: 20, width: 36, sill: 36, height: 48 },
    ],
    obstacles: [newObstacle('cylinder', { x: 100, y: 100 }, 96, 'k1')],
  };
}

function fortyItems(): PlanDocument {
  return {
    ...createInitialDocument(),
    items: Array.from({ length: 40 }, (_, i) => item(`item-${i}`, { x: 40 + (i % 8) * 10, y: 40 + Math.floor(i / 8) * 20 })),
  };
}

/** The version 1 seeded document as the first planner stored it. */
function v1Stored(): unknown {
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
    ],
  };
}

/** The version 2 seeded document: today's seed without the two lists. */
function v2Stored(): unknown {
  const { units, room, items } = createInitialDocument();
  return { schemaVersion: 2, units, room, items };
}

/** Both link versions for the same JSON text, built with Node's codecs. */
function linksFor(json: string): string[] {
  return ['0.' + b64url(json), '1.' + b64url(deflateRawSync(Buffer.from(json, 'utf8')))];
}

describe('base64url helper (golden vector)', () => {
  it('bytes 0xfb 0xff encode to -_8', () => {
    expect(b64url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
  });
});

describe('encodePlan', () => {
  it('normal: 1.<base64url of raw deflate of the JSON>, decoding to parsePlan(doc).doc', async () => {
    const doc = createInitialDocument();
    const data = await encoded(doc);
    expect(data).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    expect(payloadJson(data)).toBe(JSON.stringify(doc));
    expect(await decodePlan(data)).toEqual({ status: 'ok', doc: accepted(doc) });
  });

  it('no CompressionStream global: 0.<base64url of the JSON>, decoding to the same doc', async () => {
    replaceGlobal('CompressionStream', undefined);
    const doc = createInitialDocument();
    const data = await encoded(doc);
    expect(data).toBe('0.' + b64url(JSON.stringify(doc)));
    expect(await decodePlan(data)).toEqual({ status: 'ok', doc: accepted(doc) });
  });

  it('compression that throws when constructed falls back to 0.', async () => {
    replaceGlobal('CompressionStream', class {
      constructor() {
        throw new Error('no compression');
      }
    });
    const doc = createInitialDocument();
    await expect(encodePlan(doc)).resolves.toBe('0.' + b64url(JSON.stringify(doc)));
  });

  it('compression whose stream errors falls back to 0.', async () => {
    replaceGlobal('CompressionStream', class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;
      constructor() {
        const t = new TransformStream<Uint8Array, Uint8Array>({
          transform() {
            throw new Error('stream failed');
          },
        });
        this.readable = t.readable;
        this.writable = t.writable;
      }
    });
    const doc = createInitialDocument();
    await expect(encodePlan(doc)).resolves.toBe('0.' + b64url(JSON.stringify(doc)));
  });

  it('compressed output over MAX_BYTES falls back to 0., so the data never passes MAX_DATA_CHARS', async () => {
    /** A stand-in compressor that outputs `size` zero bytes, whatever it is given. */
    const inflating = (size: number) =>
      class {
        readonly readable: ReadableStream<Uint8Array>;
        readonly writable: WritableStream<Uint8Array>;
        constructor() {
          const t = new TransformStream<Uint8Array, Uint8Array>({
            transform() {},
            flush(controller) {
              controller.enqueue(new Uint8Array(size));
            },
          });
          this.readable = t.readable;
          this.writable = t.writable;
        }
      };
    const doc = createInitialDocument();
    replaceGlobal('CompressionStream', inflating(MAX_BYTES + 1));
    await expect(encodePlan(doc)).resolves.toBe('0.' + b64url(JSON.stringify(doc)));
    replaceGlobal('CompressionStream', inflating(MAX_BYTES));
    const atLimit = await encoded(doc);
    expect(atLimit.startsWith('1.')).toBe(true);
    expect(atLimit.length).toBe(MAX_DATA_CHARS);
  });

  it('extra keys on the argument: only the six fields, in order, are encoded', async () => {
    const doc = createInitialDocument();
    const state = { ...doc, selectedId: 'seed-bed', reset: () => undefined, applyOpenings: () => null };
    const data = await encoded(state as PlanDocument);
    expect(payloadJson(data)).toBe(
      JSON.stringify({
        schemaVersion: doc.schemaVersion, units: doc.units, room: doc.room,
        items: doc.items, openings: doc.openings, obstacles: doc.obstacles,
      }),
    );
  });

  it('a plan parsePlan refuses gives null', async () => {
    const bad = { ...createInitialDocument(), units: 'yd' } as unknown as PlanDocument;
    await expect(encodePlan(bad)).resolves.toBeNull();
  });

  it('JSON over MAX_BYTES UTF-8 bytes gives null (bytes, not characters, are counted)', async () => {
    const kana = (n: number) => 'あ'.repeat(n);
    const doc: PlanDocument = {
      ...createInitialDocument(),
      items: Array.from({ length: 200 }, (_, i) =>
        item(`big-${i}`, {
          name: kana(200), host: kana(255), sourceUrl: `https://a.example/${kana(1500)}`,
          model: { tier: 'box', label: kana(200), assetUrl: null },
        }),
      ),
    };
    accepted(doc);
    const json = JSON.stringify(doc);
    expect(json.length).toBeLessThanOrEqual(MAX_BYTES);
    expect(new TextEncoder().encode(json).length).toBeGreaterThan(MAX_BYTES);
    await expect(encodePlan(doc)).resolves.toBeNull();
  });

  it('non-Latin text round-trips exactly', async () => {
    const doc: PlanDocument = {
      ...createInitialDocument(),
      items: [item('jp', { name: '寝室のベッド' }), item('emoji', { name: 'Sofa 🛋️ with 👍🏽', x: 80 })],
    };
    const result = await decodePlan(await encoded(doc));
    expect(result).toEqual({ status: 'ok', doc: accepted(doc) });
    if (result.status !== 'ok') return;
    expect(result.doc.items.map((i) => i.name)).toEqual(['寝室のベッド', 'Sofa 🛋️ with 👍🏽']);
  });

  it('round trips: the starting plan', async () => {
    await expectRoundTrip(createInitialDocument());
  });

  it('round trips: an L-shape room', async () => {
    await expectRoundTrip(lShape());
  });

  it('round trips: angled walls, a door, a window and a column', async () => {
    const doc = angledRoom();
    expect(accepted(doc).openings).toHaveLength(2);
    expect(accepted(doc).obstacles).toHaveLength(1);
    await expectRoundTrip(doc);
  });

  it('round trips: a plan with 40 items', async () => {
    await expectRoundTrip(fortyItems());
  });

  it('round trips without compression too', async () => {
    replaceGlobal('CompressionStream', undefined);
    for (const doc of [lShape(), angledRoom(), fortyItems()]) {
      const data = await encoded(doc);
      expect(data.startsWith('0.')).toBe(true);
      expect(await decodePlan(data)).toEqual({ status: 'ok', doc: accepted(doc) });
    }
  });
});

describe('decodePlan', () => {
  it.each(['', 'abc'])('empty or no dot (%j) is invalid', async (data) => {
    expect(await decodePlan(data)).toEqual({ status: 'invalid' });
  });

  it('longer than MAX_DATA_CHARS is invalid without decoding', async () => {
    expect(MAX_DATA_CHARS).toBe(699053);
    const inflates = countInflates();
    const tooLong = '1.' + 'A'.repeat(MAX_DATA_CHARS - 1);
    expect(tooLong.length).toBe(699054);
    expect(await decodePlan(tooLong)).toEqual({ status: 'invalid' });
    expect(inflates()).toBe(0);
    // One character fewer is read (and refused as a broken stream).
    expect(await decodePlan(tooLong.slice(0, -1))).toEqual({ status: 'invalid' });
    expect(inflates()).toBe(1);
  });

  it.each(['x.AAAA', '.AAAA', '1234.AAAA'])('version not 1 to 3 digits (%j) is invalid', async (data) => {
    expect(await decodePlan(data)).toEqual({ status: 'invalid' });
  });

  it.each(['2.AAAA', '17.AAAA'])('version 2 or higher (%j) is newer', async (data) => {
    expect(await decodePlan(data)).toEqual({ status: 'newer' });
  });

  it.each(['0.ab+/', '0.ab==', '0.a b'])('payload outside the alphabet (%j) is invalid', async (data) => {
    expect(await decodePlan(data)).toEqual({ status: 'invalid' });
  });

  it('a version 1 payload outside the alphabet is refused before any inflating', async () => {
    const inflates = countInflates();
    const link = await encoded(fortyItems());
    // The same link in standard, padded base64.
    const standard = '1.' + Buffer.from(link.slice(2), 'base64url').toString('base64');
    expect(standard).toMatch(/[+/=]/);
    for (const data of ['1.ab+/', '1.ab==', '1.a b', standard]) {
      expect(await decodePlan(data)).toEqual({ status: 'invalid' });
    }
    expect(inflates()).toBe(0);
  });

  it('payload length 1 more than a multiple of 4 is invalid', async () => {
    expect(await decodePlan('0.A')).toEqual({ status: 'invalid' });
    // A real link (padded with JSON whitespace to a whole number of 4-character groups) with one
    // stray character added; that character's 6 bits make no byte, so only the length rule refuses it.
    let json = JSON.stringify(createInitialDocument());
    while (Buffer.byteLength(json) % 3 !== 0) json += ' ';
    const data = '0.' + b64url(json);
    expect(await decodePlan(data)).toEqual({ status: 'ok', doc: accepted(createInitialDocument()) });
    expect(await decodePlan(data + 'A')).toEqual({ status: 'invalid' });
    // Version 1: refused before any inflating.
    const inflates = countInflates();
    expect(await decodePlan('1.A')).toEqual({ status: 'invalid' });
    expect(inflates()).toBe(0);
  });

  it.each(['0.', '1.'])('empty payload (%j) is invalid', async (data) => {
    expect(await decodePlan(data)).toEqual({ status: 'invalid' });
  });

  it('an empty version 1 payload is refused before any inflating', async () => {
    const inflates = countInflates();
    expect(await decodePlan('1.')).toEqual({ status: 'invalid' });
    expect(inflates()).toBe(0);
  });

  it('leading zeros in the version are read as its number (accepted behavior)', async () => {
    const doc = createInitialDocument();
    const data = await encoded(doc);
    expect(data.startsWith('1.')).toBe(true);
    expect(await decodePlan('0' + data)).toEqual({ status: 'ok', doc: accepted(doc) });
    expect(await decodePlan('002.AAAA')).toEqual({ status: 'newer' });
  });

  it('version 0, bytes that are not valid UTF-8, is invalid', async () => {
    expect(await decodePlan('0.' + b64url(new Uint8Array([0xff, 0xfe])))).toEqual({ status: 'invalid' });
    // A plan that would be accepted if the stray byte were read as a replacement character.
    const [before, after] = JSON.stringify(createInitialDocument()).split('Tack writing desk');
    const bytes = Buffer.concat([Buffer.from(before), Buffer.from([0xff]), Buffer.from(after)]);
    expect(await decodePlan('0.' + b64url(bytes))).toEqual({ status: 'invalid' });
  });

  it('version 0, not JSON, is invalid', async () => {
    expect(await decodePlan('0.' + b64url('hello'))).toEqual({ status: 'invalid' });
  });

  it('version 0, JSON parsePlan refuses, is invalid', async () => {
    expect(await decodePlan('0.' + b64url('{}'))).toEqual({ status: 'invalid' });
  });

  it('versions 0 and 1, a plan with schemaVersion 99, are newer', async () => {
    for (const data of linksFor('{"schemaVersion":99}')) {
      expect(await decodePlan(data)).toEqual({ status: 'newer' });
    }
  });

  it('versions 0 and 1, version 1 and 2 stored plans, are ok and converted by parsePlan', async () => {
    for (const stored of [v1Stored(), v2Stored()]) {
      for (const data of linksFor(JSON.stringify(stored))) {
        expect(await decodePlan(data)).toEqual({ status: 'ok', doc: accepted(stored) });
      }
    }
  });

  it('version 1, no DecompressionStream global, is invalid', async () => {
    const data = await encoded(createInitialDocument());
    expect(data.startsWith('1.')).toBe(true);
    replaceGlobal('DecompressionStream', undefined);
    expect(await decodePlan(data)).toEqual({ status: 'invalid' });
  });

  it('version 1, bytes that are not a deflate stream, is invalid', async () => {
    expect(await decodePlan('1.' + b64url('hello'))).toEqual({ status: 'invalid' });
  });

  it('version 1, cut short, is invalid', async () => {
    const data = await encoded(fortyItems());
    expect(data.startsWith('1.')).toBe(true);
    // Minus 10 characters, as the brief states; minus 11 as well, so one of the two is never
    // refused merely for its length and the truncated stream itself is exercised.
    expect(await decodePlan(data.slice(0, -10))).toEqual({ status: 'invalid' });
    expect(await decodePlan(data.slice(0, -11))).toEqual({ status: 'invalid' });
  });

  it('version 1, inflating past MAX_BYTES, is invalid and reading stops once past it', async () => {
    let read = 0;
    let largestChunk = 0;
    const Real = realGlobals.DecompressionStream as typeof DecompressionStream;
    // Counts only the chunks the reader pulls (no read-ahead buffer between them).
    replaceGlobal('DecompressionStream', class {
      readonly writable: WritableStream<BufferSource>;
      readonly readable: ReadableStream<Uint8Array>;
      constructor(format: CompressionFormat) {
        const inner = new Real(format);
        this.writable = inner.writable;
        const reader = inner.readable.getReader();
        this.readable = new ReadableStream<Uint8Array>(
          {
            async pull(controller) {
              const next = await reader.read();
              if (next.done) {
                controller.close();
                return;
              }
              read += next.value.byteLength;
              largestChunk = Math.max(largestChunk, next.value.byteLength);
              controller.enqueue(next.value);
            },
            cancel(reason) {
              return reader.cancel(reason);
            },
          },
          { highWaterMark: 0 },
        );
      }
    });
    const data = '1.' + b64url(deflateRawSync(Buffer.alloc(600000, 'a')));
    expect(await decodePlan(data)).toEqual({ status: 'invalid' });
    expect(read).toBeGreaterThan(MAX_BYTES);
    expect(read).toBeLessThanOrEqual(MAX_BYTES + largestChunk);
    expect(read).toBeLessThan(600000);
  });

  it('version 1 feeds the inflater in small slices, so a bomb is never written whole', async () => {
    const writes: number[] = [];
    const Real = realGlobals.DecompressionStream as typeof DecompressionStream;
    // Records every chunk written to the inflater, in front of the real one.
    replaceGlobal('DecompressionStream', class {
      readonly writable: WritableStream<BufferSource>;
      readonly readable: ReadableStream<Uint8Array>;
      constructor(format: CompressionFormat) {
        const inner = new Real(format);
        const writer = inner.writable.getWriter();
        this.readable = inner.readable;
        this.writable = new WritableStream<BufferSource>({
          write(chunk) {
            writes.push(chunk.byteLength);
            return writer.write(chunk);
          },
          close() {
            return writer.close();
          },
          abort(reason) {
            return writer.abort(reason);
          },
        });
      }
    });
    // 40 MB of zeros: about 40 KB of raw deflate, well under MAX_DATA_CHARS.
    const bomb = deflateRawSync(Buffer.alloc(40 * 1024 * 1024));
    const data = '1.' + b64url(bomb);
    expect(data.length).toBeLessThanOrEqual(MAX_DATA_CHARS);
    expect(await decodePlan(data)).toEqual({ status: 'invalid' });
    expect(writes.length).toBeGreaterThan(0);
    expect(Math.max(...writes)).toBeLessThanOrEqual(16 * 1024);
  });

  it('version 1 stops feeding the inflater once its output passes MAX_BYTES', async () => {
    // Node's inflater buffers ahead of its reader, so this models the Compression Streams spec (and
    // Chromium): a TransformStream with default queues whose transform turns each written chunk into
    // all of its output at once, here 1000 output bytes per input byte, as a deflate bomb would.
    let transformed = 0;
    replaceGlobal('DecompressionStream', class {
      readonly writable: WritableStream<BufferSource>;
      readonly readable: ReadableStream<Uint8Array>;
      constructor() {
        const t = new TransformStream<BufferSource, Uint8Array>({
          transform(chunk, controller) {
            transformed += chunk.byteLength;
            controller.enqueue(new Uint8Array(chunk.byteLength * 1000));
          },
        });
        this.writable = t.writable;
        this.readable = t.readable;
      }
    });
    const payloadBytes = 64 * 1024;
    const data = '1.' + b64url(new Uint8Array(payloadBytes));
    expect(await decodePlan(data)).toEqual({ status: 'invalid' });
    expect(transformed).toBeGreaterThan(0);
    expect(transformed).toBeLessThanOrEqual(payloadBytes / 8);
  });

  it('a plan whose compressed data spans many slices still round-trips', async () => {
    // Deterministic, poorly compressible names.
    let seed = 7;
    const noise = (n: number) =>
      Array.from({ length: n }, () => {
        // xorshift32
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        return 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[(seed >>> 0) % 62];
      }).join('');
    const doc: PlanDocument = {
      ...createInitialDocument(),
      items: Array.from({ length: 200 }, (_, i) => item(`n-${i}`, { name: noise(200), host: noise(100) })),
    };
    const data = await encoded(doc);
    expect(data.startsWith('1.')).toBe(true);
    expect(inflateRawSync(Buffer.from(data.slice(2), 'base64url')).toString('utf8')).toBe(JSON.stringify(doc));
    expect(Buffer.from(data.slice(2), 'base64url').length).toBeGreaterThan(16 * 1024);
    expect(await decodePlan(data)).toEqual({ status: 'ok', doc: accepted(doc) });
  });

  it('a __proto__ key in the JSON is never copied and pollutes nothing', async () => {
    const json = JSON.stringify(createInitialDocument()).replace('{', '{"__proto__":{"polluted":true},');
    expect(Object.prototype.hasOwnProperty.call(JSON.parse(json), '__proto__')).toBe(true);
    for (const data of linksFor(json)) {
      const result = await decodePlan(data);
      expect(result).toEqual({ status: 'ok', doc: accepted(createInitialDocument()) });
      if (result.status !== 'ok') continue;
      expect(Object.getPrototypeOf(result.doc)).toBe(Object.prototype);
      expect(Object.prototype.hasOwnProperty.call(result.doc, '__proto__')).toBe(false);
      expect((result.doc as unknown as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  });

  it('never rejects on any of the refused inputs', async () => {
    const inputs = [
      '', 'abc', '.', '..', '1..', '0.A.B', '999.', '0.' + '_'.repeat(8), '1.' + '-'.repeat(8),
      '0.\uD800', '1.\uDC00AB', '\uD800.AAAA', '1.é', '0.寝室', '1.AAAA🛋️',
    ];
    for (const data of inputs) {
      await expect(decodePlan(data)).resolves.toEqual({ status: data === '999.' ? 'newer' : 'invalid' });
    }
  });
});
