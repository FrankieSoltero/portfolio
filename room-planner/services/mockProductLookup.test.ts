import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import type { ProductPreview } from '../domain/types';
import { SAMPLE_LINKS, createMockProductLookup } from './mockProductLookup';
import { LookupError } from './productLookup';

/** Resolves a lookup with zero delay so catalogue tests stay synchronous-ish. */
function lookupNow(url: string): Promise<ProductPreview> {
  return createMockProductLookup({ delayMs: 0 }).lookup(url);
}

async function settle<T>(p: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  try {
    return { value: await p };
  } catch (error) {
    return { error };
  }
}

describe('SAMPLE_LINKS', () => {
  it('has the exact sample links', () => {
    expect(SAMPLE_LINKS).toEqual({
      sofa: 'https://shop.example/living/alder-3-seat-sofa',
      shelf: 'https://shop.example/storage/girder-bookshelf',
      unknown: 'https://market.example/item/48213',
    });
  });
});

describe('createMockProductLookup timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects an invalid link with invalid_url without waiting', async () => {
    const lookup = createMockProductLookup();
    const result = settle(lookup.lookup('nope'));
    // No timers advanced: the rejection must not depend on the delay.
    expect(vi.getTimerCount()).toBe(0);
    const { error } = await result;
    expect(error).toBeInstanceOf(LookupError);
    expect((error as LookupError).code).toBe('invalid_url');
  });

  it('defaults to CONFIG.lookupDelayMs: pending before 900 ms, resolved after', async () => {
    expect(CONFIG.lookupDelayMs).toBe(900);
    const lookup = createMockProductLookup();
    let resolved: ProductPreview | undefined;
    void lookup.lookup(SAMPLE_LINKS.sofa).then((p) => {
      resolved = p;
    });
    await vi.advanceTimersByTimeAsync(899);
    expect(resolved).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved?.kind).toBe('sofa');
  });

  it('honours a custom delayMs', async () => {
    const lookup = createMockProductLookup({ delayMs: 50 });
    let resolved: ProductPreview | undefined;
    void lookup.lookup(SAMPLE_LINKS.shelf).then((p) => {
      resolved = p;
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(resolved).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(resolved?.kind).toBe('shelf');
  });

  it('rejects with an AbortError and clears the timer when aborted mid-delay', async () => {
    const lookup = createMockProductLookup();
    const controller = new AbortController();
    const result = settle(lookup.lookup(SAMPLE_LINKS.sofa, { signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(400);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    const { value, error } = await result;
    expect(value).toBeUndefined();
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with an AbortError immediately when the signal is already aborted', async () => {
    const lookup = createMockProductLookup();
    const controller = new AbortController();
    controller.abort();
    const result = settle(lookup.lookup(SAMPLE_LINKS.sofa, { signal: controller.signal }));
    expect(vi.getTimerCount()).toBe(0);
    const { error } = await result;
    expect(error).toBeInstanceOf(DOMException);
    expect((error as DOMException).name).toBe('AbortError');
  });
});

describe('createMockProductLookup catalogue matching', () => {
  it('picks the earlier catalogue row when a URL holds two keywords', async () => {
    const p = await lookupNow('https://shop.example/table/sofa-and-table-set');
    expect(p.kind).toBe('sofa');
  });

  it.each([
    ['couch', 'sofa', 'Alder 3-seat sofa', 84, 36, 33, 1290],
    ['sectional', 'sofa', 'Alder 3-seat sofa', 84, 36, 33, 1290],
    ['desk', 'desk', 'Tack writing desk', 55, 26, 30, 420],
    ['bookcase', 'shelf', 'Girder bookshelf', 36, 13, 78, 310],
    ['shelving', 'shelf', 'Girder bookshelf', 36, 13, 78, 310],
    ['bed', 'bed', 'Low platform bed, queen', 64, 85, 38, 890],
    ['chair', 'chair', 'Brace lounge chair', 30, 32, 31, 540],
    ['rug', 'rug', 'Flatweave rug', 60, 96, 0.5, 340],
    ['table', 'table', 'Slab coffee table', 44, 24, 16, 260],
  ] as const)('keyword %s matches the %s row', async (keyword, kind, name, w, d, h, price) => {
    const p = await lookupNow(`https://shop.example/p/${keyword}-42`);
    expect(p).toMatchObject({ kind, name, w, d, h, price, known: true });
  });

  it('assigns model tiers per kind with no asset URL', async () => {
    const retailer = { tier: 'retailer', label: '3D model from retailer', assetUrl: null };
    const generated = { tier: 'generated', label: 'Model built from photos', assetUrl: null };
    const expected = {
      sofa: retailer,
      desk: retailer,
      bed: retailer,
      shelf: generated,
      chair: generated,
      rug: generated,
      table: generated,
    } as const;
    for (const [kind, model] of Object.entries(expected)) {
      const p = await lookupNow(`https://shop.example/p/${kind}`);
      expect(p.kind).toBe(kind);
      expect(p.model).toEqual(model);
    }
  });

  it('matches keywords case-insensitively', async () => {
    const p = await lookupNow('https://shop.example/p/SOFA-1');
    expect(p.kind).toBe('sofa');
  });

  it('returns a known product for the sofa sample', async () => {
    const p = await lookupNow(SAMPLE_LINKS.sofa);
    expect(p).toEqual({
      kind: 'sofa',
      name: 'Alder 3-seat sofa',
      host: 'shop.example',
      sourceUrl: SAMPLE_LINKS.sofa,
      price: 1290,
      w: 84,
      d: 36,
      h: 33,
      known: true,
      model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
    });
  });

  it('uses the normalised URL as sourceUrl', async () => {
    const p = await lookupNow('  www.shop.example/living/alder-3-seat-sofa ');
    expect(p.sourceUrl).toBe('https://www.shop.example/living/alder-3-seat-sofa');
    expect(p.host).toBe('shop.example');
  });

  it('never carries credentials into sourceUrl', async () => {
    const p = await lookupNow('https://u:p@shop.example/living/alder-3-seat-sofa');
    expect(p.sourceUrl).toBe('https://shop.example/living/alder-3-seat-sofa');
    expect(p.sourceUrl).not.toContain('@');
  });

  it('builds a sized box from the slug for an unknown product', async () => {
    const url = 'https://market.example/living/blue-thing.html';
    const p = await lookupNow(url);
    expect(p).toEqual({
      kind: 'box',
      name: 'Blue thing',
      host: 'market.example',
      sourceUrl: url,
      price: null,
      w: 36,
      d: 24,
      h: 30,
      known: false,
      model: { tier: 'box', label: 'No model, shown as a sized box', assetUrl: null },
    });
  });

  it('names an unknown numeric slug "Untitled product"', async () => {
    const p = await lookupNow('https://market.example/item/48213');
    expect(p.name).toBe('Untitled product');
    expect(p.kind).toBe('box');
  });

  it('names an unknown empty path "Untitled product"', async () => {
    const p = await lookupNow('https://market.example/');
    expect(p.name).toBe('Untitled product');
    expect(p.kind).toBe('box');
  });

  it('decodes percent-escapes and underscores in the slug', async () => {
    const p = await lookupNow('https://market.example/x/oak_side%20stand');
    expect(p.name).toBe('Oak side stand');
  });

  it('keeps a malformed percent-escape slug instead of failing', async () => {
    const p = await lookupNow('https://market.example/x/odd%E0%A4%A');
    expect(p.name).toBe('Odd%E0%A4%A');
  });

  it('returns a fresh model object on every lookup', async () => {
    const a = await lookupNow(SAMPLE_LINKS.sofa);
    a.model.label = 'changed';
    const b = await lookupNow(SAMPLE_LINKS.sofa);
    expect(b.model.label).toBe('3D model from retailer');
  });
});
