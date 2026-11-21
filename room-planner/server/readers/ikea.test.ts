// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { LOOKUP_LIMITS, parseProductFields } from '../../lookup/contract';
import { readIkea } from './ikea';
import { canonicalUrl, finishFields, metaContent, parsePage } from './shared';

/** A saved shop page from `fixtures/`. */
function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

/** A page whose head holds the given JSON-LD blocks, each a value or raw text. */
function page(...blocks: unknown[]): string {
  const scripts = blocks
    .map((block) => {
      const text = typeof block === 'string' ? block : JSON.stringify(block);
      return `<script type="application/ld+json">${text}</script>`;
    })
    .join('\n');
  return `<!DOCTYPE html><html><head><title>Shop</title>${scripts}</head><body></body></html>`;
}

const PHOTO = 'https://www.ikea.com/us/en/images/products/sofa__1_pe1_s5.jpg';

/** A minimal JSON-LD Product; `extra` adds or replaces keys. */
function product(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'KIVIK Sofa',
    description: 'A deep sofa.',
    image: PHOTO,
    width: '89 3/4 "',
    depth: '37 "',
    height: '32 5/8 "',
    offers: { '@type': 'Offer', price: '899.00', priceCurrency: 'USD' },
    ...extra,
  };
}

describe('readIkea on saved pages', () => {
  it('reads the IKEA product page', () => {
    const fields = readIkea(fixture('ikea-product.html'));
    expect(fields).not.toBeNull();
    expect(fields).toMatchObject({
      name: 'BILLY Bookcase - black oak effect 31 1/2x11x41 3/4 "',
      price: 59,
      w: 31.5,
      d: 11,
      h: 41.75,
      imageUrl: 'https://www.ikea.com/us/en/images/products/billy-bookcase-black-oak-effect__1097107_pe864733_s5.jpg',
      sizeNote: null,
    });
    expect(fields?.description.startsWith('BILLY Bookcase - black oak effect')).toBe(true);
    expect(fields?.description.length).toBeLessThanOrEqual(600);
    expect(parseProductFields(fields)).toEqual(fields);
  });

  it('returns null for the IKEA category page', () => {
    expect(readIkea(fixture('ikea-category.html'))).toBeNull();
  });
});

describe('readIkea JSON-LD shapes', () => {
  it.each([
    ['directly', page(product())],
    ['inside an array', page([{ '@type': 'BreadcrumbList' }, product()])],
    ['inside @graph', page({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite' }, product()] })],
    ['with an array @type', page(product({ '@type': ['Product', 'IndividualProduct'] }))],
  ])('finds the Product %s', (_case, html) => {
    expect(readIkea(html)?.name).toBe('KIVIK Sofa');
  });

  it('ignores a Product nested deeper than the top level, an array or @graph', () => {
    const list = { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', item: product() }] };
    expect(readIkea(page(list))).toBeNull();
  });

  it.each([
    ['a string', PHOTO],
    ['a string array', [PHOTO, 'https://www.ikea.com/other.jpg']],
    ['an ImageObject', { '@type': 'ImageObject', contentUrl: PHOTO }],
    ['an ImageObject with url', { '@type': 'ImageObject', url: PHOTO }],
    ['an ImageObject array', [{ '@type': 'ImageObject', contentUrl: PHOTO }, { '@type': 'ImageObject', contentUrl: 'https://www.ikea.com/other.jpg' }]],
  ])('reads the image as %s', (_case, image) => {
    expect(readIkea(page(product({ image })))?.imageUrl).toBe(PHOTO);
  });
});

describe('readIkea JSON-LD sizes', () => {
  it.each([
    ['IKEA text', '31 1/2 "'],
    ['a value in centimetres', { '@type': 'QuantitativeValue', value: 80, unitCode: 'CMT' }],
    ['a text value in inches', { '@type': 'QuantitativeValue', value: '31.5', unitText: 'in' }],
  ])('reads %s as 31.5 in', (_case, size) => {
    expect(readIkea(page(product({ width: size, depth: size, height: size })))).toMatchObject({ w: 31.5, d: 31.5, h: 31.5 });
  });

  it('keeps the other fields when the page has no size data', () => {
    const html = page(product({ width: undefined, depth: undefined, height: undefined }));
    expect(readIkea(html)).toEqual({
      name: 'KIVIK Sofa',
      description: 'A deep sofa.',
      price: 899,
      imageUrl: PHOTO,
      w: null,
      d: null,
      h: null,
      sizeNote: null,
    });
  });
});

describe('readIkea offers', () => {
  it.each([
    ['a single Offer', { '@type': 'Offer', price: 59, priceCurrency: 'USD' }],
    [
      'the first USD offer in an array',
      [
        { '@type': 'Offer', price: '70', priceCurrency: 'EUR' },
        { '@type': 'Offer', price: '59', priceCurrency: 'USD' },
        { '@type': 'Offer', price: '61', priceCurrency: 'USD' },
      ],
    ],
    ['an AggregateOffer lowPrice', { '@type': 'AggregateOffer', lowPrice: '59.00', highPrice: '99.00', priceCurrency: 'USD' }],
  ])('reads the price from %s', (_case, offers) => {
    expect(readIkea(page(product({ offers })))?.price).toBe(59);
  });

  it('drops a price that is not in USD and keeps the rest', () => {
    const fields = readIkea(page(product({ offers: { '@type': 'Offer', price: '59', priceCurrency: 'EUR' } })));
    expect(fields).toMatchObject({ name: 'KIVIK Sofa', price: null, imageUrl: PHOTO, w: 89.75 });
  });
});

describe('readIkea on untrusted pages', () => {
  it('uses the valid Product block after one that is not JSON', () => {
    expect(readIkea(page('{"@type": "Product", "name": ', product()))?.name).toBe('KIVIK Sofa');
  });

  it('drops a JSON-LD photo on a foreign host and keeps the rest', () => {
    const fields = readIkea(page(product({ image: 'https://evil.example/sofa.jpg' })));
    expect(fields).toMatchObject({ name: 'KIVIK Sofa', imageUrl: null, price: 899 });
  });

  it('drops an og:image on a foreign host and keeps the rest', () => {
    const root = parsePage('<head><meta property="og:image" content="https://evil.example/sofa.jpg"></head>');
    expect(root).not.toBeNull();
    const imageUrl = metaContent(root!, 'og:image');
    expect(imageUrl).toBe('https://evil.example/sofa.jpg');
    expect(finishFields({ name: 'KIVIK Sofa', imageUrl, price: 899 })).toMatchObject({ name: 'KIVIK Sofa', imageUrl: null, price: 899 });
  });

  it('decodes entities in the name', () => {
    const fields = readIkea(page(product({ name: 'Sofa &quot;Big&quot; &amp; Co&#x27;s' })));
    expect(fields?.name).toBe('Sofa "Big" & Co\'s');
  });

  it('returns hostile markup as literal text', () => {
    const fields = readIkea(page(product({ name: '&lt;img src=x onerror=alert(1)&gt;' })));
    expect(fields?.name).toBe('<img src=x onerror=alert(1)>');
  });

  it('returns null for empty input', () => {
    expect(readIkea('')).toBeNull();
    expect(parsePage('')).toBeNull();
  });

  it('returns null for 5 MB of text in under 500 ms', () => {
    const huge = 'a'.repeat(5 * 1024 * 1024);
    const started = Date.now();
    expect(readIkea(huge)).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
    // The page is refused for its size before it is parsed, not merely found to hold no product.
    expect(parsePage(huge)).toBeNull();
  });

  it('never throws on input that is not a page', () => {
    expect(readIkea(null as unknown as string)).toBeNull();
    expect(readIkea(page('null', '[]', '"Product"', '{"@graph": 5}'))).toBeNull();
  });
});

describe('finishFields', () => {
  it('cuts the name to 200 and the description to 600 characters', () => {
    const fields = finishFields({ name: 'n'.repeat(500), description: 'd'.repeat(1000) });
    expect(fields?.name).toHaveLength(200);
    expect(fields?.description).toHaveLength(600);
    expect(parseProductFields(fields)).toEqual(fields);
  });

  it('returns null when there is no name', () => {
    expect(finishFields({ description: 'A sofa.' })).toBeNull();
    expect(finishFields({ name: '   ' })).toBeNull();
  });

  it('drops sizes and prices outside the limits', () => {
    const fields = finishFields({ name: 'Sofa', price: 20_000_000, w: 0, d: Number.NaN, h: 20_000 });
    expect(fields).toMatchObject({ price: null, w: null, d: null, h: null });
  });
});

describe('metaContent and canonicalUrl', () => {
  const root = parsePage(fixture('ikea-product.html'))!;

  it('reads og: meta by property', () => {
    expect(metaContent(root, 'og:title')).toBe('BILLY bookcase, black oak effect, 311/2x11x413/4"  - IKEA');
    expect(metaContent(root, 'og:missing')).toBeNull();
  });

  it('reads the canonical link', () => {
    expect(canonicalUrl(root)).toBe('https://www.ikea.com/us/en/p/billy-bookcase-black-oak-effect-00477337/');
    expect(canonicalUrl(parsePage('<link rel="canonical" href="javascript:alert(1)">')!)).toBeNull();
  });
});

describe('parsePage on hostile pages just under the size limit', () => {
  /** The time a hostile page may take, with headroom for a loaded machine. */
  const BOUND_MS = 2000;
  const head = page(product());

  /** Room left for the hostile part of a page just under `LOOKUP_LIMITS.pageMax`. */
  const room = LOOKUP_LIMITS.pageMax - head.length - 16;

  /** A Product page followed by `unit` repeated up to just under the size limit. */
  function repeated(unit: string): string {
    return head + unit.repeat(Math.floor(room / unit.length));
  }

  /** A Product page followed by `<div>` nested as deep as fits, every one of them closed. */
  function closedNesting(): string {
    const depth = Math.floor(room / '<div></div>'.length);
    return head + '<div>'.repeat(depth) + '</div>'.repeat(depth);
  }

  const shapes: [string, () => string][] = [
    ['unclosed <div>', () => repeated('<div>')],
    ['<div></span> pairs', () => repeated('<div></span>')],
    ['<!-- openers', () => repeated('<!--')],
    ['<![CDATA[ openers', () => repeated('<![CDATA[')],
    ['<dl><dt>x', () => repeated('<dl><dt>x')],
    ['<table><tr><th>a<td>b', () => repeated('<table><tr><th>a<td>b')],
    ['<ul><li>x', () => repeated('<ul><li>x')],
    ['closed nested <div>', closedNesting],
  ];

  it.each(shapes)('parses a page of %s quickly', (_case, build) => {
    const html = build();
    expect(html.length).toBeLessThanOrEqual(LOOKUP_LIMITS.pageMax);
    expect(html.length).toBeGreaterThan(LOOKUP_LIMITS.pageMax - 64);
    const started = Date.now();
    expect(parsePage(html)).not.toBeNull();
    const elapsed = Date.now() - started;
    expect(elapsed, `took ${elapsed} ms`).toBeLessThan(BOUND_MS);
  });

  it.each(shapes)('reads the Product before a page of %s quickly', (_case, build) => {
    const html = build();
    const started = Date.now();
    expect(readIkea(html)?.name).toBe('KIVIK Sofa');
    const elapsed = Date.now() - started;
    expect(elapsed, `took ${elapsed} ms`).toBeLessThan(BOUND_MS);
  });

  /** A Product page with `before` placed at the start of its head, and no `-->` or `]]>` anywhere. */
  function withBefore(before: string): string {
    return page(product()).replace('<head>', `<head>${before}`);
  }

  it.each([
    ['a script string', '<script>var s="<!--";</script>'],
    ['a meta attribute value', '<meta name="note" content="<!--">'],
    ['a script string, CDATA', '<script>var s="<![CDATA[";</script>'],
    ['body text', '<span>see <!-- here</span>'],
  ])('keeps the page when one unterminated opener sits in %s', (_case, before) => {
    expect(readIkea(withBefore(before))?.name).toBe('KIVIK Sofa');
  });

  it('keeps a JSON-LD description that contains an unterminated <!--', () => {
    const fields = readIkea(page(product({ description: 'Arms <!-- and legs' })));
    expect(fields).toMatchObject({ name: 'KIVIK Sofa', description: 'Arms <!-- and legs' });
  });

  it('keeps the page with 16 unterminated openers of each kind before the Product', () => {
    expect(readIkea(withBefore('<span><!--</span>'.repeat(16)))?.name).toBe('KIVIK Sofa');
    expect(readIkea(withBefore('<span><![CDATA[</span>'.repeat(16)))?.name).toBe('KIVIK Sofa');
  });

  it('cuts the page at the first of 17 unterminated openers, so a Product after them is lost', () => {
    expect(readIkea(withBefore('<span><!--</span>'.repeat(17)))).toBeNull();
    expect(readIkea(withBefore('<span><![CDATA[</span>'.repeat(17)))).toBeNull();
    // A Product before the flood is kept.
    expect(readIkea(`${page(product())}${'<!--'.repeat(17)}`)?.name).toBe('KIVIK Sofa');
  });

  it('parses a near-4 MiB page with exactly 16 unterminated <!-- spread through it quickly', () => {
    const gap = 'a'.repeat(Math.floor((room - 16 * 4) / 16));
    const html = head + `${gap}<!--`.repeat(16);
    expect(html.length).toBeGreaterThan(LOOKUP_LIMITS.pageMax - 64);
    expect(html.length).toBeLessThanOrEqual(LOOKUP_LIMITS.pageMax);
    const started = Date.now();
    expect(parsePage(html)).not.toBeNull();
    expect(readIkea(html)?.name).toBe('KIVIK Sofa');
    const elapsed = Date.now() - started;
    expect(elapsed, `took ${elapsed} ms`).toBeLessThan(BOUND_MS);
  });
});

describe('readIkea on a very deep tree', () => {
  /** 200k unclosed `<div>`, then a Product block nested at the bottom of them. */
  const deep = `<html><head><title>Shop</title></head><body>${'<div>'.repeat(200_000)}${page(product({ name: 'Sofa &amp; Co' }))}`;

  it('reads a Product nested 200k levels deep without overflowing the stack', () => {
    expect(readIkea(deep)?.name).toBe('Sofa & Co');
  });

  it('returns null when a reader step overflows the stack', async () => {
    vi.resetModules();
    vi.doMock('./shared', async (importOriginal) => ({
      ...(await importOriginal<typeof import('./shared')>()),
      findJsonLdProduct: () => {
        throw new RangeError('Maximum call stack size exceeded');
      },
    }));
    try {
      const { readIkea: readWithOverflow } = await import('./ikea');
      expect(readWithOverflow(deep)).toBeNull();
    } finally {
      vi.doUnmock('./shared');
      vi.resetModules();
    }
  });
});

describe('review fixes', () => {
  it('cuts an over-long size note to 200 characters instead of dropping the product', () => {
    const fields = finishFields({ name: 'Sofa', sizeNote: 'n'.repeat(500) });
    expect(fields?.name).toBe('Sofa');
    expect(fields?.sizeNote).toHaveLength(200);
  });

  it('reads an AggregateOffer price when it has no lowPrice', () => {
    const offers = { '@type': 'AggregateOffer', price: '59.00', priceCurrency: 'USD' };
    expect(readIkea(page(product({ offers })))?.price).toBe(59);
  });

  it.each([
    ['a string array', ['https://evil.example/sofa.jpg', 'not a url', PHOTO]],
    ['an ImageObject array', [{ '@type': 'ImageObject', contentUrl: 'https://evil.example/sofa.jpg' }, { '@type': 'ImageObject', contentUrl: PHOTO }]],
  ])('takes the first shop photo in %s', (_case, image) => {
    expect(readIkea(page(product({ image })))?.imageUrl).toBe(PHOTO);
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])('refuses the unit code %j', (unitCode) => {
    const size = { '@type': 'QuantitativeValue', value: 80, unitCode };
    expect(readIkea(page(product({ width: size })))?.w).toBeNull();
  });
});
