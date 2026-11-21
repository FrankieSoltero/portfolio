import { describe, expect, it } from 'vitest';
import { LOOKUP_ERROR_CODES, isLookupErrorCode, parseProductFields, type ProductFields } from './contract';

/** A product with every field set and in range. */
function valid(): ProductFields {
  return {
    name: 'GLOSTAD Loveseat',
    description: 'A compact two-seat sofa.',
    price: 179,
    imageUrl: 'https://www.ikea.com/us/en/images/products/glostad-loveseat.jpg',
    w: 69.25,
    d: 31.875,
    h: 26.75,
    sizeNote: null,
  };
}

describe('parseProductFields', () => {
  it('returns the same fields when every field is in range', () => {
    expect(parseProductFields(valid())).toEqual(valid());
  });

  it('accepts the optional fields as null and each value at its limit', () => {
    const atLimits: ProductFields = {
      name: 'n'.repeat(200),
      description: 'd'.repeat(600),
      price: 10_000_000,
      imageUrl: null,
      w: 10000,
      d: null,
      h: null,
      sizeNote: 's'.repeat(200),
    };
    expect(parseProductFields(atLimits)).toEqual(atLimits);
  });

  it.each<[string, Partial<Record<keyof ProductFields, unknown>>]>([
    ['name over 200', { name: 'n'.repeat(201) }],
    ['name empty', { name: '' }],
    ['description over 600', { description: 'd'.repeat(601) }],
    ['size 0', { w: 0 }],
    ['size negative', { d: -1 }],
    ['size over 10000', { h: 10000.01 }],
    ['size NaN', { w: Number.NaN }],
    ['size infinite', { d: Number.POSITIVE_INFINITY }],
    ['price 0', { price: 0 }],
    ['price over 10,000,000', { price: 10_000_000.01 }],
    ['imageUrl not a shop photo', { imageUrl: 'https://evil.example/a.jpg' }],
    ['imageUrl over http', { imageUrl: 'http://www.ikea.com/us/en/images/products/x.jpg' }],
    ['sizeNote over 200', { sizeNote: 's'.repeat(201) }],
  ])('refuses %s', (_case, change) => {
    expect(parseProductFields({ ...valid(), ...change })).toBeNull();
  });

  it('refuses an extra key', () => {
    expect(parseProductFields({ ...valid(), sourceUrl: 'https://www.ikea.com/' })).toBeNull();
  });

  it('refuses a missing key', () => {
    const missing: Partial<ProductFields> = valid();
    delete missing.sizeNote;
    expect(parseProductFields(missing)).toBeNull();
  });

  it.each([[null], [undefined], ['fields'], [42], [[]], [[valid()]]])('refuses the non-object %j', (value) => {
    expect(parseProductFields(value)).toBeNull();
  });

  it('refuses, without throwing, an object whose getter throws', () => {
    const trap = { ...valid() };
    Object.defineProperty(trap, 'name', { enumerable: true, get: () => { throw new Error('boom'); } });
    expect(parseProductFields(trap)).toBeNull();
  });
});

describe('isLookupErrorCode', () => {
  it.each(['invalid_url', 'unsupported_shop', 'blocked', 'not_a_product', 'unavailable', 'rate_limited'])(
    'accepts %s',
    (code) => {
      expect(isLookupErrorCode(code)).toBe(true);
    },
  );

  it('lists exactly the six codes', () => {
    expect(LOOKUP_ERROR_CODES).toEqual(['invalid_url', 'unsupported_shop', 'blocked', 'not_a_product', 'unavailable', 'rate_limited']);
  });

  it.each([['ok'], ['INVALID_URL'], [''], ['toString'], [null], [undefined], [1], [{}], [['blocked']]])('refuses %j', (value) => {
    expect(isLookupErrorCode(value)).toBe(false);
  });
});
