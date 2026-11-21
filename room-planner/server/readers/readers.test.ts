// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProductFields, SIZE_NOTE_UNLABELLED } from '../../lookup/contract';
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
    ['escaped apostrophes', String.raw`Overall Dimensions\",\"value\":\"30'' H X 80'' W X 35'' D\",\"__typename\"`],
  ])('unescapes %s in the embedded data', (_case, data) => {
    const html = wayfairPage(`<h1 data-rtl-id="listingHeaderNameHeading">Sofa</h1><script>self.__next_f.push([1,"{\\"key\\":\\"${data}}"])</script>`);
    expect(readWayfair(html)).toMatchObject({ h: 30, w: 80, d: 35 });
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

  it('leaves the photo null when data-a-dynamic-image is not JSON', () => {
    expect(readAmazon(amazonPage('Sofa', '<img id="landingImage" data-a-dynamic-image="{not json">'))).toMatchObject({ name: 'Sofa', imageUrl: null });
  });

  it('reads the price from corePriceDisplay_desktop_feature_div, skipping text not in US dollars', () => {
    const block = '<div id="corePriceDisplay_desktop_feature_div"><span class="a-price"><span class="a-offscreen">€9.00</span></span><span class="a-price"><span class="a-offscreen">$49.99</span></span></div>';
    expect(readAmazon(amazonPage('Sofa', block))?.price).toBe(49.99);
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

describe('Wayfair and Amazon readers on hostile and huge input', () => {
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
  ])('%s returns null for 5 MB of text in under 500 ms', (_name, reader) => {
    const huge = 'a'.repeat(5 * 1024 * 1024);
    const started = Date.now();
    expect(reader(huge)).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it.each([
    ['readWayfair', readWayfair],
    ['readAmazon', readAmazon],
  ])('%s never throws on input that is not a page', (_name, reader) => {
    expect(reader(null as unknown as string)).toBeNull();
    expect(reader('<<<>>>&&&</dl></table>')).toBeNull();
  });
});
