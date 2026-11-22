// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOOKUP_LIMITS, parseProductFields, SIZE_NOTE_UNLABELLED } from '../../lookup/contract';
import { cpuMs, growth, GROWTH_MAX, growthMessage, HANG_GUARD_MS, HANG_TIMEOUT_MS } from '../../test/cpuTiming';
import { readAmazon } from './amazon';
import { readIkea } from './ikea';
import { readProduct } from './index';
import { readWayfair } from './wayfair';

/** A saved shop page from `fixtures/`. */
function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

/** A minimal Wayfair product page: a `/pdp/` canonical link and the given body. */
function wayfairPage(body: string, head = ''): string {
  return `<html><head><link rel="canonical" href="https://www.wayfair.com/furniture/pdp/sofa-w1.html">${head}</head><body>${body}</body></html>`;
}

/** A minimal Amazon product page with the given title text and extra body. */
function amazonPage(title: string, body = ''): string {
  return `<html><head><title>Amazon.com</title></head><body><span id="productTitle">${title}</span>${body}</body></html>`;
}

/** An Amazon details table holding one row. */
function detailsRow(label: string, value: string): string {
  return `<table><tr><th> ${label} </th><td> ${value} </td></tr></table>`;
}

const WAYFAIR_PHOTO = 'https://assets.wfcdn.com/avif/im/04015086/compr-r85/3434/343463261/Jadier+66%22+Upholstered+Loveseat+Square+Sofa.jpg';
const HOSTILE = '&lt;img src=x onerror=alert(1)&gt;';
/** An apostrophe written as a JSON `\u` escape (backslash, `u`, `0027`), built at run time so it stays escaped in the page text. */
const ESCAPED_APOSTROPHE = ['\\', 'u', '0027'].join('');

describe('readWayfair on saved pages', () => {
  it('reads the Wayfair product page', () => {
    const fields = readWayfair(fixture('wayfair-product.html'));
    expect(fields).toMatchObject({
      name: 'Jadier 66" Upholstered Loveseat Square Sofa',
      price: 319.99,
      h: 32.3,
      w: 65.8,
      d: 32.3,
      imageUrl: WAYFAIR_PHOTO,
      sizeNote: null,
    });
    expect(fields?.description.startsWith('This loveseat creates an inviting spot to relax')).toBe(true);
    expect(fields?.description).toContain('tufting');
    expect(fields?.description.length).toBeLessThanOrEqual(600);
    expect(parseProductFields(fields)).toEqual(fields);
  });

  it('returns null for the Wayfair category page', () => {
    expect(readWayfair(fixture('wayfair-category.html'))).toBeNull();
  });
});

describe('readWayfair fields', () => {
  it('returns null when the canonical address has no /pdp/', () => {
    const html = fixture('wayfair-product.html').replace('/furniture/pdp/corrigan-studio-w009077849.html"/>', '/furniture/sb0/sofas-c413892.html"/>');
    expect(readWayfair(html)).toBeNull();
  });

  it.each([
    ['& Reviews | Wayfair', 'Jadier Sofa & Reviews | Wayfair'],
    ['| Wayfair', 'Jadier Sofa | Wayfair'],
  ])('falls back to og:title with a trailing %s removed', (_case, title) => {
    const html = wayfairPage('', `<meta property="og:title" content="${title.replace('&', '&amp;')}">`);
    expect(readWayfair(html)?.name).toBe('Jadier Sofa');
  });

  it('skips a struck-through price and reads the first lead price', () => {
    const html = wayfairPage('<h1 data-rtl-id="listingHeaderNameHeading">Sofa</h1><s data-test-id="PriceDisplay">$412.00</s><span data-test-id="PriceDisplay">$1,319.99</span>');
    expect(readWayfair(html)?.price).toBe(1319.99);
  });

  it('drops a price that is not in US dollars', () => {
    const html = wayfairPage('<h1 data-rtl-id="listingHeaderNameHeading">Sofa</h1><span data-test-id="PriceDisplay">£319.99</span>');
    expect(readWayfair(html)).toMatchObject({ name: 'Sofa', price: null });
  });

  it('reads sizes from a dt whose text is Overall', () => {
    const html = wayfairPage("<h1 data-rtl-id=\"listingHeaderNameHeading\">Sofa</h1><dl><dt>Seat</dt><dd>1'' H X 2'' W X 3'' D</dd><dt> Overall </dt><dd>30'' H X 80'' W X 35'' D</dd></dl>");
    expect(readWayfair(html)).toMatchObject({ h: 30, w: 80, d: 35, sizeNote: null });
  });

  it('falls back to the embedded data when there is no dimensions list', () => {
    const html = fixture('wayfair-product.html').replace(/<dl[\s\S]*<\/dl>/, '');
    expect(html).not.toContain('<dl');
    expect(readWayfair(html)).toMatchObject({ h: 32.3, w: 65.8, d: 32.3, sizeNote: null });
  });

  it.each([
    ['escaped quotes', String.raw`Overall Dimensions\",\"value\":\"30\\\" H X 80\\\" W X 35\\\" D\",\"__typename\"`],
    ['escaped apostrophes', String.raw`Overall Dimensions\",\"value\":\"30${ESCAPED_APOSTROPHE}${ESCAPED_APOSTROPHE} H X 80${ESCAPED_APOSTROPHE}${ESCAPED_APOSTROPHE} W X 35${ESCAPED_APOSTROPHE}${ESCAPED_APOSTROPHE} D\",\"__typename\"`],
  ])('unescapes %s in the embedded data', (_case, data) => {
    const html = wayfairPage(`<h1 data-rtl-id="listingHeaderNameHeading">Sofa</h1><script>self.__next_f.push([1,"{\\"key\\":\\"${data}}"])</script>`);
    expect(readWayfair(html)).toMatchObject({ h: 30, w: 80, d: 35 });
  });

  it('reads \\u escapes in the embedded sizes', () => {
    const inch = `${ESCAPED_APOSTROPHE}${ESCAPED_APOSTROPHE}`;
    const data = String.raw`Overall Dimensions\",\"value\":\"32.3${inch} H X 65.8${inch} W X 32.3${inch} D\",\"__typename\"`;
    expect(data).not.toContain("'");
    const html = wayfairPage(`<h1 data-rtl-id="listingHeaderNameHeading">Sofa</h1><script>self.__next_f.push([1,"${data}"])</script>`);
    expect(readWayfair(html)).toMatchObject({ h: 32.3, w: 65.8, d: 32.3, sizeNote: null });
  });

  it('reads the description from the embedded marketing copy, undoing its escapes', () => {
    const data = String.raw`\"data\":{\"marketingCopy\":\"It${ESCAPED_APOSTROPHE}s a \\\"cloud\\\" sofa\\nwith tufting.\",\"listing\":{}}`;
    expect(data).not.toContain("'");
    const html = wayfairPage(`<h1 data-rtl-id="listingHeaderNameHeading">Sofa</h1><script>self.__next_f.push([1,"{${data}}"])</script>`);
    expect(readWayfair(html)?.description).toBe('It\'s a "cloud" sofa with tufting.');
  });

  it('keeps marketing copy that has no closing quote within the read limit', () => {
    const html = wayfairPage(`<h1 data-rtl-id="listingHeaderNameHeading">Sofa</h1>${String.raw`\"marketingCopy\":\"`}${'word '.repeat(1000)}`);
    const description = readWayfair(html)?.description ?? '';
    expect(description.startsWith('word word')).toBe(true);
    expect(description.length).toBeLessThanOrEqual(600);
  });

  it('leaves the description empty when there is no marketing copy', () => {
    expect(readWayfair(wayfairPage('<h1 data-rtl-id="listingHeaderNameHeading">Sofa</h1>'))?.description).toBe('');
  });

  it('leaves the sizes null when the embedded value never ends', () => {
    const html = wayfairPage(`<h1 data-rtl-id="listingHeaderNameHeading">Sofa</h1>${String.raw`Overall Dimensions\",\"value\":\"`}${'3'.repeat(10_000)}`);
    expect(readWayfair(html)).toMatchObject({ name: 'Sofa', w: null, d: null, h: null });
  });
});

describe('readAmazon on saved pages', () => {
  it('reads the Amazon product page', () => {
    const html = fixture('amazon-product.html');
    const title = /<span id="productTitle"[^>]*>([^<]*)<\/span>/.exec(html)?.[1] ?? '';
    const fields = readAmazon(html);
    expect(fields).toMatchObject({
      name: title.trim().slice(0, 200),
      imageUrl: 'https://m.media-amazon.com/images/I/61fd2oCrvyL._AC_SL1500_.jpg',
      d: 14.01,
      w: 9.77,
      h: 0.66,
      sizeNote: SIZE_NOTE_UNLABELLED,
      price: null,
    });
    expect(fields?.description.startsWith('SUPERCHARGED BY M2 PRO OR M2 MAX')).toBe(true);
    expect(parseProductFields(fields)).toEqual(fields);
  });

  it('reads labelled sizes and the price from the labelled page', () => {
    const fields = readAmazon(fixture('amazon-labelled.html'));
    expect(fields).toMatchObject({
      name: 'Rivet Revolve Modern Upholstered Sofa, Navy',
      d: 35,
      w: 80,
      h: 30,
      sizeNote: null,
      price: 1299,
    });
    expect(parseProductFields(fields)).toEqual(fields);
  });

  it('returns null for the bot-check page', () => {
    const html = fixture('amazon-challenge.html');
    expect(html).toContain('api-services-support@amazon.com');
    expect(readAmazon(html)).toBeNull();
  });

  it('reads the price from the current price markup, where the price-to-pay offscreen text is empty', () => {
    const fields = readAmazon(fixture('amazon-apex-price.html'));
    expect(fields).toMatchObject({
      price: 139.99,
      d: 15.7,
      w: 47.2,
      h: 32,
      sizeNote: null,
      imageUrl: 'https://m.media-amazon.com/images/I/81z-nvSknnL._AC_SL1415_.jpg',
    });
    // The page's #productTitle has no brand name; the brand appears only in the photo's alt text.
    expect(fields?.name.startsWith('Wood Dresser for Bedroom, 6 Drawer Dresser with Metal Handles')).toBe(true);
    expect(fields?.description.startsWith('Classic Dresser:')).toBe(true);
    expect(parseProductFields(fields)).toEqual(fields);
  });

  it('gives no price for an unavailable product, and the sizes exactly as the page labels them', () => {
    const fields = readAmazon(fixture('amazon-unavailable.html'));
    expect(fields).toMatchObject({ price: null, d: 84, w: 32.5, h: 29, sizeNote: null });
    expect(fields?.name.startsWith('Velvet Sofa, 84')).toBe(true);
    expect(parseProductFields(fields)).toEqual(fields);
  });
});

describe('readAmazon price-to-pay markup', () => {
  /** A price-to-pay element whose offscreen text is `offscreen` and whose visible parts are `parts`. */
  function toPay(offscreen: string, parts: string): string {
    return `<span class="a-price aok-align-center priceToPay apex-pricetopay-value"><span class="a-offscreen">${offscreen}</span><span aria-hidden="true">${parts}</span></span>`;
  }

  /** Visible price parts: symbol, whole with its nested decimal point, and fraction. */
  function parts(symbol: string, whole: string, fraction: string): string {
    return `<span class="a-price-symbol">${symbol}</span><span class="a-price-whole">${whole}<span class="a-price-decimal">.</span></span><span class="a-price-fraction">${fraction}</span>`;
  }

  function priceOf(block: string): number | null | undefined {
    return readAmazon(amazonPage('Sofa', `<div id="corePriceDisplay_desktop_feature_div">${block}</div>`))?.price;
  }

  it('composes the price from symbol, whole (commas dropped) and fraction when the offscreen text is empty', () => {
    expect(priceOf(toPay(' ', parts('$', '1,299', '00')))).toBe(1299);
    expect(priceOf(toPay('', parts('$', '139', '99')))).toBe(139.99);
  });

  it('composes nothing when the symbol is not $', () => {
    expect(priceOf(toPay(' ', parts('€', '139', '99')))).toBeNull();
  });

  it('still prefers a non-empty offscreen price inside the price to pay', () => {
    expect(priceOf(toPay('$49.99', parts('$', '139', '99')))).toBe(49.99);
  });

  it('falls back to the first price that is not struck through when the price to pay has neither', () => {
    const block = `${toPay(' ', '')}<span class="a-price"><span class="a-offscreen">$75.00</span></span>`;
    expect(priceOf(block)).toBe(75);
  });

  it('takes the accessibility label first, over a struck-through list price', () => {
    const block =
      '<span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">$1,499.00</span></span>' +
      '<span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> $1,299.00 </span>' +
      toPay(' ', '');
    expect(priceOf(block)).toBe(1299);
  });

  it('ignores an accessibility label that does not start with $', () => {
    const block = `<span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> £12.00 </span>${toPay(' ', parts('$', '139', '99'))}`;
    expect(priceOf(block)).toBe(139.99);
  });
});

describe('readAmazon fields', () => {
  it('uses the largest data-a-dynamic-image entry when there is no data-old-hires photo', () => {
    const images = JSON.stringify({
      'https://m.media-amazon.com/images/I/small.jpg': [342, 342],
      'https://m.media-amazon.com/images/I/wide.jpg': [900, 300],
      'https://m.media-amazon.com/images/I/big.jpg': [679, 679],
    }).replace(/"/g, '&quot;');
    const html = amazonPage('Sofa', `<img data-old-hires="https://evil.example/a.jpg"><img id="landingImage" data-a-dynamic-image="${images}">`);
    expect(readAmazon(html)?.imageUrl).toBe('https://m.media-amazon.com/images/I/big.jpg');
  });

  it('picks the largest data-a-dynamic-image entry among Amazon photo addresses only', () => {
    const images = '{"__proto__":[9999,9999],"https://evil.example/huge.jpg":[5000,5000],"https://m.media-amazon.com/images/I/ok.jpg":[100,100]}'.replace(/"/g, '&quot;');
    const html = amazonPage('Sofa', `<img id="landingImage" data-a-dynamic-image="${images}">`);
    expect(readAmazon(html)?.imageUrl).toBe('https://m.media-amazon.com/images/I/ok.jpg');
  });

  it('cuts a title over 200 characters to 200', () => {
    const title = `Sofa ${'x'.repeat(300)}`;
    const name = readAmazon(amazonPage(title))?.name;
    expect(name).toHaveLength(200);
    expect(name).toBe(title.slice(0, 200));
  });

  it('leaves the photo null when data-a-dynamic-image is not JSON', () => {
    expect(readAmazon(amazonPage('Sofa', '<img id="landingImage" data-a-dynamic-image="{not json">'))).toMatchObject({ name: 'Sofa', imageUrl: null });
  });

  it('reads the price from corePriceDisplay_desktop_feature_div, skipping text not in US dollars', () => {
    const block = '<div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">€9.00</span></span><span class="a-price"><span class="a-offscreen">$49.99</span></span></div>';
    expect(readAmazon(amazonPage('Sofa', block))?.price).toBe(49.99);
  });

  it('skips the struck-through List Price row and reads the price to pay', () => {
    const block =
      '<div id="corePrice_desktop"><table>' +
      '<tr><td>List Price:</td><td><span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">$1,499.00</span><span aria-hidden="true">$1,499.00</span></span></td></tr>' +
      '<tr><td>Price:</td><td><span class="a-price a-text-price a-size-medium apexPriceToPay"><span class="a-offscreen">$1,299.00</span></span></td></tr>' +
      '</table></div>';
    expect(readAmazon(amazonPage('Sofa', block))?.price).toBe(1299);
  });

  it.each([
    ['data-a-strike="true"', '<span class="a-price" data-a-strike="true">'],
    ['class a-text-price', '<span class="a-price a-text-price">'],
  ])('skips a price struck through by %s and reads the next one', (_case, opener) => {
    const block = `<div id="corePrice_desktop">${opener}<span class="a-offscreen">$1,499.00</span></span><span class="a-price"><span class="a-offscreen">$1,299.00</span></span></div>`;
    expect(readAmazon(amazonPage('Sofa', block))?.price).toBe(1299);
  });

  it('returns no price when the only price is struck through', () => {
    const block = '<div id="corePrice_desktop"><span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">$1,499.00</span></span></div>';
    expect(readAmazon(amazonPage('Sofa', block))).toMatchObject({ name: 'Sofa', price: null });
  });

  it('prefers priceToPay over prices before it', () => {
    const block =
      '<div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">$5.00</span></span>' +
      '<span class="a-price priceToPay"><span class="a-offscreen">$1,299.00</span></span></div>';
    expect(readAmazon(amazonPage('Sofa', block))?.price).toBe(1299);
  });

  it('ignores a price outside the price blocks', () => {
    expect(readAmazon(amazonPage('Sofa', '<span class="a-price"><span class="a-offscreen">$49.99</span></span>'))?.price).toBeNull();
  });

  it('joins the feature bullets with a space', () => {
    const html = amazonPage('Sofa', '<div id="feature-bullets"><ul><li> Soft  seat. </li><li>Navy.</li></ul></div>');
    expect(readAmazon(html)?.description).toBe('Soft seat. Navy.');
  });

  it.each([
    ['Item Dimensions LxWxH', '80 x 35 x 30 inches'],
    ['Product Dimensions (D x W x H)', '35 x 80 x 30 inches'],
  ])('uses the letters after Dimensions in "%s" as the order', (label, value) => {
    expect(readAmazon(amazonPage('Sofa', detailsRow(label, value)))).toMatchObject({ w: 80, d: 35, h: 30, sizeNote: null });
  });

  it('leaves the sizes null when no row names the dimensions', () => {
    expect(readAmazon(amazonPage('Sofa', detailsRow('Item Weight', '4 x 5 x 6')))).toMatchObject({ w: null, d: null, h: null, sizeNote: null });
  });
});

describe('readProduct', () => {
  it.each([
    ['ikea', 'ikea-product.html', readIkea],
    ['wayfair', 'wayfair-product.html', readWayfair],
    ['amazon', 'amazon-product.html', readAmazon],
  ] as const)('sends %s pages to its reader', (shop, name, reader) => {
    const html = fixture(name);
    expect(readProduct(shop, html)).not.toBeNull();
    expect(readProduct(shop, html)).toEqual(reader(html));
  });

  it('returns null for an unknown shop', () => {
    expect(readProduct('ebay' as never, fixture('amazon-product.html'))).toBeNull();
  });
});

describe('Wayfair and Amazon readers on hostile and huge input', { retry: 2 }, () => {
  it('returns hostile markup in a Wayfair title as literal text', () => {
    const html = wayfairPage(`<h1 data-rtl-id="listingHeaderNameHeading">${HOSTILE}</h1>`);
    expect(readWayfair(html)?.name).toBe('<img src=x onerror=alert(1)>');
  });

  it('returns hostile markup in an Amazon title as literal text', () => {
    expect(readAmazon(amazonPage(HOSTILE))?.name).toBe('<img src=x onerror=alert(1)>');
  });

  it.each([
    ['readWayfair', readWayfair],
    ['readAmazon', readAmazon],
  ])('%s returns null for empty input', (_name, reader) => {
    expect(reader('')).toBeNull();
  });

  it.each([
    ['readWayfair', readWayfair],
    ['readAmazon', readAmazon],
  ])('%s returns null for 5 MB of text', (_name, reader) => {
    const huge = 'a'.repeat(5 * 1024 * 1024);
    const elapsed = cpuMs(() => expect(reader(huge)).toBeNull());
    // A hang guard only (see `test/cpuTiming.ts`); the page is refused for its size before parsing.
    expect(elapsed, `took ${elapsed} ms`).toBeLessThan(HANG_GUARD_MS);
  });

  it.each([
    ['readWayfair', readWayfair],
    ['readAmazon', readAmazon],
  ])('%s never throws on input that is not a page', (_name, reader) => {
    expect(reader(null as unknown as string)).toBeNull();
    expect(reader('<<<>>>&&&</dl></table>')).toBeNull();
  });
});

describe('Wayfair and Amazon readers on hostile pages', { retry: 2 }, () => {
  /**
   * The sizes of the growth check (see `test/cpuTiming.ts`): a page of `SMALL` characters and one
   * 8 times larger, read back to back. Large enough to measure, small enough to keep the suite quick.
   */
  const SMALL = 256 * 1024;
  const LARGE = 8 * SMALL;

  /** A page both readers take as a product named `Sofa`: a `/pdp/` canonical, the Wayfair heading and `#productTitle`. */
  const HEAD =
    '<html><head><link rel="canonical" href="https://www.wayfair.com/furniture/pdp/sofa-w1.html"></head><body>' +
    '<h1 data-rtl-id="listingHeaderNameHeading">Sofa</h1><span id="productTitle">Sofa</span>';

  /** One price an Amazon price block holds. */
  const PRICE = '<span class="a-price"><span class="a-offscreen">$1</span></span>';

  /** A price block opening a price to pay whose offscreen text is empty, so its parts are read. */
  const TO_PAY_EMPTY = '<div id="corePriceDisplay_desktop_feature_div"><span class="a-price priceToPay"><span class="a-offscreen"> </span>';

  /**
   * `HEAD`, then `before`, then `unit` repeated (or, with `closer`, `unit` repeated and then
   * `closer` as many times), then `after`, filling the page to just under `maxLength`.
   */
  function flood(maxLength: number, before: string, unit: string, closer = '', after = ''): string {
    const fixed = HEAD.length + before.length + after.length;
    const count = Math.floor((maxLength - 16 - fixed) / (unit.length + closer.length));
    return HEAD + before + unit.repeat(count) + closer.repeat(count) + after;
  }

  const shapes: [string, (max: number) => string][] = [
    ['<dt>Overall</dt> repeated', (max) => flood(max, '', '<dt>Overall</dt>')],
    ['<i> then <li> inside #feature-bullets', (max) => flood(max, '<div id="feature-bullets">', '<i>', '<li>')],
    ['<i> then <li> outside #feature-bullets', (max) => flood(max, '', '<i>', '<li>')],
    ['prices repeated inside #corePrice_desktop', (max) => flood(max, '<div id="corePrice_desktop">', PRICE)],
    ['deep unclosed nesting above a price', (max) => flood(max, '<div id="corePrice_desktop">', '<span>', '', PRICE)],
    ['unclosed <dt>Overall', (max) => flood(max, '', '<dt>Overall')],
    ['<dt> nested in unclosed <span>', (max) => flood(max, '', '<dt><span>')],
    ['<li> nested in unclosed <div> inside #feature-bullets', (max) => flood(max, '<div id="feature-bullets">', '<li><div>')],
    ['unclosed .a-offscreen nested in a price', (max) => flood(max, '<div id="corePrice_desktop"><span class="a-price">', '<span class="a-offscreen">x')],
    ['struck-through prices repeated', (max) => flood(max, '<div id="corePrice_desktop">', '<span class="a-price a-text-price"><span class="a-offscreen">$1</span></span>')],
    ['unclosed .a-price nesting', (max) => flood(max, '<div id="corePrice_desktop">', '<span class="a-price">', '', '<span class="a-offscreen">$1</span>')],
    ['unclosed .priceToPay nesting', (max) => flood(max, '<div id="corePrice_desktop">', '<span class="priceToPay">')],
    ['dimension labels nested in one row', (max) => flood(max, '<table><tr>', '<th>Product Dimensions</th><div>')],
    ['unclosed PriceDisplay nesting', (max) => flood(max, '', '<span data-test-id="PriceDisplay">')],
    ['price parts repeated inside the price to pay', (max) => flood(max, TO_PAY_EMPTY, '<span class="a-price-whole">1</span>')],
    ['unclosed price parts nested inside the price to pay', (max) => flood(max, TO_PAY_EMPTY, '<span class="a-price-whole">1')],
  ];

  const readers = [
    ['readWayfair', readWayfair],
    ['readAmazon', readAmazon],
  ] as const;

  const cases = shapes.flatMap(([shape, build]) => readers.map(([name, reader]) => [name, shape, build, reader] as const));

  it.each(cases)('%s reads a page of %s in time growing in step with its size', (_name, _shape, build, reader) => {
    const result = growth((html) => expect(reader(html)?.name).toBe('Sofa'), build(SMALL), build(LARGE));
    expect(result.ratio, growthMessage(result)).toBeLessThan(GROWTH_MAX);
  });

  /**
   * The shapes that also get a near-4 MiB hang guard, per reader: the slowest measured for that
   * reader on 2026-11-22 (0.5 to 0.9 s alone; every other shape took 0.1 to 0.55 s). Nested `<i>`
   * then `<li>`, inside and outside the bullets, builds the most elements; `<li>` nested in `<div>`
   * walks the bullets block; `<dt>` nested in `<span>` makes Wayfair read many labels; deep
   * nesting above a price makes Amazon walk a long chain. The growth check covers every shape.
   */
  const GUARDED: Record<(typeof readers)[number][0], ReadonlySet<string>> = {
    readWayfair: new Set([
      '<i> then <li> inside #feature-bullets',
      '<i> then <li> outside #feature-bullets',
      '<dt> nested in unclosed <span>',
      '<li> nested in unclosed <div> inside #feature-bullets',
    ]),
    readAmazon: new Set([
      '<i> then <li> inside #feature-bullets',
      '<i> then <li> outside #feature-bullets',
      '<li> nested in unclosed <div> inside #feature-bullets',
      'deep unclosed nesting above a price',
    ]),
  };

  it.each(cases.filter(([name, shape]) => GUARDED[name].has(shape)))(
    '%s reads a near-4 MiB page of %s without hanging',
    (_name, _shape, build, reader) => {
      const html = build(LOOKUP_LIMITS.pageMax);
      expect(html.length).toBeLessThanOrEqual(LOOKUP_LIMITS.pageMax);
      expect(html.length).toBeGreaterThan(LOOKUP_LIMITS.pageMax - 128);
      let name: string | undefined;
      const elapsed = cpuMs(() => {
        name = reader(html)?.name;
      });
      expect(name).toBe('Sofa');
      // A hang guard only: it fails if the minutes-long behaviour comes back, not on a slow core.
      expect(elapsed, `took ${elapsed} ms`).toBeLessThan(HANG_GUARD_MS);
    },
    HANG_TIMEOUT_MS,
  );

  it('still reads the price under a flood of prices and under deep nesting', () => {
    expect(readAmazon(flood(LARGE, '<div id="corePrice_desktop">', PRICE))?.price).toBe(1);
    expect(readAmazon(flood(LARGE, '<div id="corePrice_desktop">', '<span>', '', PRICE))?.price).toBe(1);
  });
});
