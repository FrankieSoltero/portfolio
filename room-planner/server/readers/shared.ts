import { type HTMLElement, type Node, NodeType, TextNode, parse } from 'node-html-parser';
import { LOOKUP_LIMITS, parseProductFields, type ProductFields, SIZE_NOTE_MAX } from '../../lookup/contract';
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

/**
 * UN/CEFACT unit codes a JSON-LD size may carry, as the unit words `parseLength` reads. A Map, so a
 * page's code can never reach an inherited property such as `constructor`.
 */
const UNIT_CODES: ReadonlyMap<string, string> = new Map([
  ['INH', 'in'],
  ['CMT', 'cm'],
  ['MMT', 'mm'],
  ['FOT', 'ft'],
]);

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

/** Text with each run of whitespace made one space and the ends trimmed. */
export function plain(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Text with each run of whitespace made one space and the ends trimmed; '' for a non-string. */
function collapseSpace(value: unknown): string {
  return typeof value === 'string' ? plain(value) : '';
}

/**
 * A US dollar amount written as `$49.99` or `$1,299.00`; null for any other text. Only text that
 * starts with `$` counts as dollars (the JSON-LD price reader below does not check for it).
 */
export function dollars(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('$')) return null;
  const amount = trimmed.slice(1).replace(/,/g, '').trim();
  return /^\d+(?:\.\d+)?$/.test(amount) ? Number(amount) : null;
}

/**
 * How much reading text may still do: characters of raw page text kept, and nodes visited. Reads
 * that share one budget take from it in turn, so together they never do more than it allows.
 */
export interface TextBudget {
  chars: number;
  nodes: number;
}

/**
 * The text of `element` and everything inside it, entity-decoded, read in document order with an
 * explicit stack until `budget` runs out; `complete` is false when it ran out first. A `<br>` reads
 * as a line break, as the parser's own `text` does. Unlike that getter, the cost is bounded by the
 * budget, so reading the text of many nested elements (on a hostile page each one holds all the
 * ones after it) stays linear instead of growing with the square of the nesting.
 */
export function readText(element: HTMLElement, budget: TextBudget): { text: string; complete: boolean } {
  let raw = '';
  const stack: Node[] = [];
  for (let i = element.childNodes.length - 1; i >= 0; i -= 1) stack.push(element.childNodes[i]);
  while (stack.length > 0) {
    if (budget.nodes <= 0) return { text: new TextNode(raw, null).text, complete: false };
    const node = stack.pop() as Node;
    budget.nodes -= 1;
    let piece = '';
    if (node.nodeType !== NodeType.ELEMENT_NODE) {
      piece = node.rawText;
    } else if ((node as HTMLElement).rawTagName.toLowerCase() === 'br') {
      piece = '\n';
    } else {
      for (let i = node.childNodes.length - 1; i >= 0; i -= 1) stack.push(node.childNodes[i]);
    }
    if (piece.length > budget.chars) {
      raw += piece.slice(0, budget.chars);
      budget.chars = 0;
      return { text: new TextNode(raw, null).text, complete: false };
    }
    raw += piece;
    budget.chars -= piece.length;
  }
  return { text: new TextNode(raw, null).text, complete: true };
}

/**
 * The text of `element` (see `readText`) when it holds at most `maxChars` characters of raw text
 * in at most `maxNodes` nodes; null when it holds more. For short fields such as a label or a price.
 */
export function shortText(element: HTMLElement, maxChars: number, maxNodes: number): string | null {
  const read = readText(element, { chars: maxChars, nodes: maxNodes });
  return read.complete ? read.text : null;
}

/**
 * The elements inside `scope` (not `scope` itself), in document order, found by one walk with an
 * explicit stack; a caller that stops early stops the walk. Used in place of
 * `scope.querySelectorAll` on an element below the root: there the selector engine checks every
 * candidate's ancestors back up to `scope`, which on a page of deep unclosed tags takes time
 * growing with the square of the depth (measured: 2.5 s at 128 KiB, 50 s at 512 KiB).
 */
export function* descendants(scope: HTMLElement): Generator<HTMLElement> {
  const stack: Node[] = [];
  for (let i = scope.childNodes.length - 1; i >= 0; i -= 1) stack.push(scope.childNodes[i]);
  while (stack.length > 0) {
    const node = stack.pop() as Node;
    if (node.nodeType !== NodeType.ELEMENT_NODE) continue;
    yield node as HTMLElement;
    for (let i = node.childNodes.length - 1; i >= 0; i -= 1) stack.push(node.childNodes[i]);
  }
}

/**
 * The first element in document order with each of `ids`, found in one walk of the page (which
 * stops once all are found); an id no element has is missing from the map. One walk in place of
 * one `getElementById` walk per id.
 */
export function elementsById(root: HTMLElement, ids: readonly string[]): Map<string, HTMLElement> {
  const wanted = new Set(ids);
  const found = new Map<string, HTMLElement>();
  for (const element of descendants(root)) {
    const id = element.id;
    if (id === '' || !wanted.has(id) || found.has(id)) continue;
    found.set(id, element);
    if (found.size === wanted.size) break;
  }
  return found;
}

/**
 * The first element after `node` among its parent's children, or null. Reads the parent's children
 * once, by index; the parser's own `nextElementSibling` rescans them from the first on every call.
 */
export function nextElement(node: HTMLElement): HTMLElement | null {
  const siblings = node.parentNode?.childNodes ?? [];
  for (let i = siblings.indexOf(node) + 1; i < siblings.length; i += 1) {
    if (siblings[i].nodeType === NodeType.ELEMENT_NODE) return siblings[i] as HTMLElement;
  }
  return null;
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
 * The most unterminated `<!--` (or `<![CDATA[`) openers a page keeps as it is. The parser searches
 * from each unterminated opener to the end of the page for a closer it never finds, so each one
 * costs one extra scan of the page: 16 cost at most 16 scans. One stray opener in a script, an
 * attribute or a JSON-LD string is normal and must not lose the page; thousands are an attack
 * that would take time growing with the square of the page's length.
 */
const MAX_UNTERMINATED_OPENERS = 16;

/**
 * The page as it is when at most `MAX_UNTERMINATED_OPENERS` of its `opener`s have no `closer`
 * after them; with more, the page cut at the first of those, as a browser treats an unterminated
 * comment as running to the end of the page. Linear: one `lastIndexOf`, then `indexOf` in a loop
 * that stops counting once past the limit. No pattern.
 */
function cutUnterminated(html: string, opener: string, closer: string): string {
  const lastCloser = html.lastIndexOf(closer);
  const first = html.indexOf(opener, lastCloser === -1 ? 0 : lastCloser + closer.length);
  if (first === -1) return html;
  let count = 1;
  for (let at = html.indexOf(opener, first + opener.length); at !== -1; at = html.indexOf(opener, at + opener.length)) {
    count += 1;
    if (count > MAX_UNTERMINATED_OPENERS) return html.slice(0, first);
  }
  return html;
}

/**
 * Parses a page into a node-html-parser root. Null for input that is not a string, is empty, or is
 * over `LOOKUP_LIMITS.pageMax` characters; the size check comes first so a huge page is never
 * parsed. A flood of unterminated `<!--` or `<![CDATA[` openers is cut off first (see
 * `cutUnterminated`), and unclosed tags are left where they are (`parseNoneClosedTags`) rather
 * than moved up the tree, which the parser otherwise does in time growing with the square of the
 * nesting depth. Measured as CPU time on the development machine (2026-11-22) on 25 near-4 MiB
 * hostile shapes (deep unclosed or closed nesting, `<dt>`, `<li>`, `<tr>`, price and label floods,
 * comment and CDATA floods), a whole read took 0.1 to 1.8 s through each of the three readers on
 * a performance core; the slowest is a flood of `<a>`, 1.4 to 1.5 s through the IKEA reader (almost
 * all of it this parse) and up to 1.8 s through the Wayfair and Amazon readers. These times depend
 * on load and on the kind of core, several times longer on an efficiency core, so the tests do not
 * bound them: they check that the time grows in step with the page (see `test/cpuTiming.ts`).
 * Never throws.
 */
export function parsePage(html: string): HTMLElement | null {
  if (typeof html !== 'string' || html.length === 0 || html.length > LOOKUP_LIMITS.pageMax) return null;
  try {
    const page = cutUnterminated(cutUnterminated(html, '<!--', '-->'), '<![CDATA[', ']]>');
    return parse(page, { parseNoneClosedTags: true });
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

/**
 * The price of one offer when it is in US dollars: for an `AggregateOffer` its `lowPrice`, or its
 * `price` when it has no readable `lowPrice`; for any other offer its `price`.
 */
function offerPrice(offer: unknown): number | null {
  if (!isObject(offer)) return null;
  const currency = offer.priceCurrency;
  if (typeof currency !== 'string' || currency.trim().toUpperCase() !== 'USD') return null;
  if (hasType(offer, 'AggregateOffer')) return readPrice(offer.lowPrice) ?? readPrice(offer.price);
  return readPrice(offer.price);
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

/** The address one image entry gives: a string, or an `ImageObject`'s `contentUrl`, else its `url`. */
function imageAddress(entry: unknown): string | null {
  if (isObject(entry)) return decodedText(entry.contentUrl) ?? decodedText(entry.url);
  return decodedText(entry);
}

/**
 * The first image that is a shop photo, normalised: `image` as a string, an `ImageObject`, or an
 * array of either, where an entry on a foreign host or not an address is skipped. Null when none is.
 */
function firstImage(image: unknown): string | null {
  const entries: unknown[] = Array.isArray(image) ? image : [image];
  for (const entry of entries) {
    const photo = photoUrl(imageAddress(entry));
    if (photo !== null) return photo;
  }
  return null;
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
    unit = UNIT_CODES.get(value.unitCode.trim().toUpperCase()) ?? '';
    if (unit === '') return null;
  } else if (typeof value.unitText === 'string') {
    unit = value.unitText;
  }
  return parseLength(`${amount} ${unit}`);
}

/**
 * The fields a JSON-LD Product gives: name and description (entity-decoded), the price from its
 * offers, the first image that is a shop photo, and width, depth and height in inches. A field the
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
 * and the description to 600 characters, the size note to 200, a price or size outside its range
 * dropped, and a photo kept only on a shop photo host. Null when there is no name. The result
 * passes `parseProductFields`.
 */
export function finishFields(partial: Partial<ProductFields>): ProductFields | null {
  try {
    const name = cut(collapseSpace(partial.name), LOOKUP_LIMITS.nameMax);
    if (name === '') return null;
    const sizeNote = cut(collapseSpace(partial.sizeNote), SIZE_NOTE_MAX);
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
