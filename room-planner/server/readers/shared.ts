import { type HTMLElement, TextNode, parse } from 'node-html-parser';
import { LOOKUP_LIMITS, parseProductFields, type ProductFields } from '../../lookup/contract';
import { isShopPhotoUrl } from '../../lookup/shops';
import { parseLength } from '../sizes';

/**
 * The parts of a shop page reader that every shop shares: parsing the page, finding its JSON-LD
 * Product, reading meta tags and the canonical link, and cutting what was read to the lookup's
 * limits. Page content is untrusted: nothing here evaluates it, every regular expression is
 * linear, and text is returned as text (entity-decoded, never sanitised as HTML) because the
 * browser renders it as React text only.
 */

/** A JSON object, as opposed to an array, a string or null. */
type JsonObject = Record<string, unknown>;

/** UN/CEFACT unit codes a JSON-LD size may carry, as the unit words `parseLength` reads. */
const UNIT_CODES: Record<string, string> = {
  INH: 'in',
  CMT: 'cm',
  MMT: 'mm',
  FOT: 'ft',
};

/** True when `value` is a plain JSON object. */
function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when the object's `@type` is `type`, or is an array that contains it. */
function hasType(value: JsonObject, type: string): boolean {
  const declared = value['@type'];
  return declared === type || (Array.isArray(declared) && declared.includes(type));
}

/** A JSON-LD string with its HTML entities decoded, or null when the value is not a string. */
function decodedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return new TextNode(value, null).text;
}

/** Text with each run of whitespace made one space and the ends trimmed; '' for a non-string. */
function collapseSpace(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** Text cut to at most `max` characters, never leaving half of a surrogate pair at the end. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  let kept = text.slice(0, max);
  const last = kept.charCodeAt(kept.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) kept = kept.slice(0, -1);
  return kept.trimEnd();
}

/** A number that is finite, above 0 and at most `max`, or null. */
function inRange(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) return null;
  return value;
}

/**
 * Parses a page into a node-html-parser root. Null for input that is not a string, is empty, or is
 * over `LOOKUP_LIMITS.pageMax` characters; the size check comes first so a huge page is never
 * parsed. Never throws.
 */
export function parsePage(html: string): HTMLElement | null {
  if (typeof html !== 'string' || html.length === 0 || html.length > LOOKUP_LIMITS.pageMax) return null;
  try {
    return parse(html);
  } catch {
    return null;
  }
}

/** The Product in one parsed JSON-LD value: the value itself, an item of an array, or an item of `@graph`. */
function productIn(data: unknown): JsonObject | null {
  const candidates = Array.isArray(data) ? data : [data];
  for (const candidate of candidates) {
    if (!isObject(candidate)) continue;
    if (hasType(candidate, 'Product')) return candidate;
    const graph = candidate['@graph'];
    if (!Array.isArray(graph)) continue;
    for (const item of graph) {
      if (isObject(item) && hasType(item, 'Product')) return item;
    }
  }
  return null;
}

/**
 * The first JSON-LD Product on the page: an object whose `@type` is `Product` (or an array
 * containing it), found directly in a `<script type="application/ld+json">` block, in an array
 * there, or in its `@graph`. A block that is not JSON is skipped; a Product nested deeper (such as
 * the items of a category page's list) is not one. Null when there is none.
 */
export function findJsonLdProduct(root: HTMLElement): Record<string, unknown> | null {
  for (const script of root.querySelectorAll('script')) {
    if (script.getAttribute('type')?.trim().toLowerCase() !== 'application/ld+json') continue;
    let data: unknown;
    try {
      data = JSON.parse(script.rawText);
    } catch {
      continue;
    }
    const product = productIn(data);
    if (product) return product;
  }
  return null;
}

/**
 * The trimmed, entity-decoded `content` of the first `<meta>` whose `property` is `property` (such
 * as `og:title`), else of the first whose `name` is; either compared without case. Null when there
 * is none or it is empty.
 */
export function metaContent(root: HTMLElement, property: string): string | null {
  const wanted = property.toLowerCase();
  const metas = root.querySelectorAll('meta');
  for (const attribute of ['property', 'name']) {
    for (const meta of metas) {
      if (meta.getAttribute(attribute)?.trim().toLowerCase() !== wanted) continue;
      const content = meta.getAttribute('content')?.trim();
      if (content) return content;
    }
  }
  return null;
}

/**
 * The page's `<link rel="canonical">` address, normalised, when it is an absolute `http` or
 * `https` address of at most `LOOKUP_LIMITS.urlMax` characters. Null otherwise.
 */
export function canonicalUrl(root: HTMLElement): string | null {
  for (const link of root.querySelectorAll('link')) {
    const rel = link.getAttribute('rel')?.toLowerCase().split(/\s+/) ?? [];
    if (!rel.includes('canonical')) continue;
    const href = link.getAttribute('href')?.trim() ?? '';
    if (href.length === 0 || href.length > LOOKUP_LIMITS.urlMax) continue;
    try {
      const url = new URL(href);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch {
      // Not an absolute address; try the next link.
    }
  }
  return null;
}

/** A price written as a number or as text such as `59`, `899.00` or `1,299.00`; null otherwise. */
function readPrice(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/,/g, '');
  return /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : null;
}

/** The price of one offer when it is in US dollars: `lowPrice` for an `AggregateOffer`, else `price`. */
function offerPrice(offer: unknown): number | null {
  if (!isObject(offer)) return null;
  const currency = offer.priceCurrency;
  if (typeof currency !== 'string' || currency.trim().toUpperCase() !== 'USD') return null;
  return readPrice(hasType(offer, 'AggregateOffer') ? offer.lowPrice : offer.price);
}

/** The price from a Product's `offers`: a single offer, or the first US dollar one in an array. */
function priceFromOffers(offers: unknown): number | null {
  if (!Array.isArray(offers)) return offerPrice(offers);
  for (const offer of offers) {
    const price = offerPrice(offer);
    if (price !== null) return price;
  }
  return null;
}

/** The first image address: `image` as a string, an `ImageObject`, or an array of either. */
function firstImage(image: unknown): string | null {
  const first: unknown = Array.isArray(image) ? image[0] : image;
  if (isObject(first)) return decodedText(first.contentUrl) ?? decodedText(first.url);
  return decodedText(first);
}

/**
 * One JSON-LD size in inches: text such as `31 1/2 "`, a bare number (inches), or a
 * `QuantitativeValue` whose `unitCode` (`INH`, `CMT`, `MMT`, `FOT`) or `unitText` names its unit.
 * Null when it cannot be read, or the unit code is one this reader does not know.
 */
function sizeFrom(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? parseLength(String(value)) : null;
  if (typeof value === 'string') return parseLength(decodedText(value) ?? '');
  if (!isObject(value)) return null;
  const amount = value.value;
  if (!(typeof amount === 'string' || (typeof amount === 'number' && Number.isFinite(amount)))) return null;
  let unit = '';
  if (typeof value.unitCode === 'string') {
    unit = UNIT_CODES[value.unitCode.trim().toUpperCase()] ?? '';
    if (unit === '') return null;
  } else if (typeof value.unitText === 'string') {
    unit = value.unitText;
  }
  return parseLength(`${amount} ${unit}`);
}

/**
 * The fields a JSON-LD Product gives: name and description (entity-decoded), the price from its
 * offers, the first image address as written, and width, depth and height in inches. A field the
 * Product does not give is left out or null; nothing here is cut to the limits yet (see `finishFields`).
 */
export function productFromJsonLd(product: Record<string, unknown>): Partial<ProductFields> {
  const fields: Partial<ProductFields> = {
    price: priceFromOffers(product.offers),
    imageUrl: firstImage(product.image),
    w: sizeFrom(product.width),
    d: sizeFrom(product.depth),
    h: sizeFrom(product.height),
  };
  const name = decodedText(product.name);
  if (name !== null) fields.name = name;
  const description = decodedText(product.description);
  if (description !== null) fields.description = description;
  return fields;
}

/** A photo address normalised by the URL parser, when it is on a shop photo host; null otherwise. */
function photoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > LOOKUP_LIMITS.urlMax) return null;
  try {
    const href = new URL(value.trim()).href;
    return isShopPhotoUrl(href) ? href : null;
  } catch {
    return null;
  }
}

/**
 * Applies every lookup limit to fields read from a page: whitespace collapsed, the name cut to 200
 * and the description to 600 characters, a price or size outside its range dropped, and a photo
 * kept only on a shop photo host. Null when there is no name. The result passes `parseProductFields`.
 */
export function finishFields(partial: Partial<ProductFields>): ProductFields | null {
  try {
    const name = cut(collapseSpace(partial.name), LOOKUP_LIMITS.nameMax);
    if (name === '') return null;
    const sizeNote = collapseSpace(partial.sizeNote);
    return parseProductFields({
      name,
      description: cut(collapseSpace(partial.description), LOOKUP_LIMITS.descriptionMax),
      price: inRange(partial.price, LOOKUP_LIMITS.priceMax),
      imageUrl: photoUrl(partial.imageUrl),
      w: inRange(partial.w, LOOKUP_LIMITS.sizeMax),
      d: inRange(partial.d, LOOKUP_LIMITS.sizeMax),
      h: inRange(partial.h, LOOKUP_LIMITS.sizeMax),
      sizeNote: sizeNote === '' ? null : sizeNote,
    });
  } catch {
    return null;
  }
}
