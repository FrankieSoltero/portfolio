import type { HTMLElement } from 'node-html-parser';
import { SIZE_NOTE_UNLABELLED, type ProductFields } from '../../lookup/contract';
import { isShopPhotoUrl } from '../../lookup/shops';
import { parseDimensionLine } from '../sizes';
import { finishFields, parsePage } from './shared';

/**
 * Reads an Amazon product page from its markup: the `#productTitle` text, the main photo, the
 * price in the core price block, the feature bullets and the "Product Dimensions" or "Item
 * Dimensions" row of the details table. A page without `#productTitle` (such as a bot-check page)
 * is not a product.
 */

/** The host the main photo must be on when it is read from `data-old-hires`. */
const AMAZON_PHOTO_HOST = 'm.media-amazon.com';

/** The price blocks searched for the price, in order. */
const PRICE_BLOCKS = ['#corePrice_desktop', '#corePriceDisplay_desktop_feature_div'];

/** The prices Amazon marks as the one to pay; searched before any other price. */
const PRICE_TO_PAY = '.priceToPay .a-offscreen, .apexPriceToPay .a-offscreen';

/** The details table row labels that hold the sizes. */
const SIZE_LABELS = ['Product Dimensions', 'Item Dimensions'];

/** The word in a sizes label after which an order hint such as `LxWxH` may follow. */
const DIMENSIONS_WORD = 'Dimensions';

/** Text with each run of whitespace made one space and the ends trimmed. */
function plain(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A US dollar amount written as `$49.99` or `$1,299.00`; null for any other text. Only text that
 * starts with `$` counts as dollars. (`shared.ts` keeps its price reader private and does not
 * check for the `$`, so this one is local; `wayfair.ts` holds the same helper.)
 */
function dollars(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('$')) return null;
  const amount = trimmed.slice(1).replace(/,/g, '').trim();
  return /^\d+(?:\.\d+)?$/.test(amount) ? Number(amount) : null;
}

/** An address normalised by the URL parser when it is a shop photo on `m.media-amazon.com` (or a subdomain); null otherwise. */
function amazonPhoto(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (host !== AMAZON_PHOTO_HOST && !host.endsWith(`.${AMAZON_PHOTO_HOST}`)) return null;
    return isShopPhotoUrl(url.href) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The largest photo in `#landingImage`'s `data-a-dynamic-image`, a JSON object mapping each
 * address to its `[width, height]`. Only entries whose address is an Amazon photo count, so a
 * larger foreign or junk key cannot hide a valid one; of those, the largest width × height wins.
 * Null when the attribute is missing, is not JSON, or has no usable entry.
 */
function largestDynamicImage(root: HTMLElement): string | null {
  const attribute = root.querySelector('#landingImage')?.getAttribute('data-a-dynamic-image');
  if (!attribute) return null;
  let data: unknown;
  try {
    data = JSON.parse(attribute);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const entries = data as Record<string, unknown>;
  let best: string | null = null;
  let bestArea = 0;
  for (const address of Object.keys(entries)) {
    const photo = amazonPhoto(address);
    if (!photo) continue;
    const size = entries[address];
    if (!Array.isArray(size) || typeof size[0] !== 'number' || typeof size[1] !== 'number') continue;
    const area = size[0] * size[1];
    if (Number.isFinite(area) && area > bestArea) {
      best = photo;
      bestArea = area;
    }
  }
  return best;
}

/** The first `data-old-hires` photo on `m.media-amazon.com`, else the largest `data-a-dynamic-image` entry. */
function readPhoto(root: HTMLElement): string | null {
  for (const element of root.querySelectorAll('[data-old-hires]')) {
    const photo = amazonPhoto(element.getAttribute('data-old-hires') ?? '');
    if (photo) return photo;
  }
  return largestDynamicImage(root);
}

/**
 * True when `element` sits inside a struck-through `.a-price` (the old "List Price"): one with
 * `data-a-strike="true"` or class `a-text-price`, between `element` and `container`.
 */
function isStruckThrough(element: HTMLElement, container: HTMLElement): boolean {
  for (let node = element.parentNode; node && node !== container; node = node.parentNode) {
    if (!node.classList.contains('a-price')) continue;
    if (node.getAttribute('data-a-strike') === 'true' || node.classList.contains('a-text-price')) return true;
  }
  return false;
}

/**
 * The first element matching `selector` in the core price blocks whose text starts with `$` and
 * that `keep` accepts, read as dollars; null when there is none.
 */
function firstDollars(root: HTMLElement, selector: string, keep: (element: HTMLElement, container: HTMLElement) => boolean): number | null {
  for (const block of PRICE_BLOCKS) {
    const container = root.querySelector(block);
    if (!container) continue;
    for (const element of container.querySelectorAll(selector)) {
      const text = element.text.trim();
      if (text.startsWith('$') && keep(element, container)) return dollars(text);
    }
  }
  return null;
}

/**
 * The price in the core price blocks: the price Amazon marks as the one to pay (`.priceToPay` or
 * `.apexPriceToPay`), else the first `.a-price .a-offscreen` that is not struck through. Only
 * text that starts with `$` counts.
 */
function readPrice(root: HTMLElement): number | null {
  return (
    firstDollars(root, PRICE_TO_PAY, () => true) ??
    firstDollars(root, '.a-price .a-offscreen', (element, container) => !isStruckThrough(element, container))
  );
}

/** The `#feature-bullets` list item texts joined by a space. */
function readDescription(root: HTMLElement): string {
  return root
    .querySelectorAll('#feature-bullets li')
    .map((item) => plain(item.text))
    .filter((text) => text !== '')
    .join(' ');
}

/**
 * Width, depth, height and size note from the first details row whose `<th>` names the product or
 * item dimensions. Letters after the word `Dimensions` in that label (`LxWxH`, `D x W x H`) are the
 * order hint. The note warns when the numbers were not labelled.
 */
function readSizes(root: HTMLElement): Partial<ProductFields> {
  for (const row of root.querySelectorAll('tr')) {
    const label = plain(row.querySelector('th')?.text ?? '');
    if (!SIZE_LABELS.some((wanted) => label.includes(wanted))) continue;
    const cell = row.querySelector('td');
    if (!cell) continue;
    const after = label.slice(label.indexOf(DIMENSIONS_WORD) + DIMENSIONS_WORD.length);
    const order = /[a-z]/i.test(after) ? after : undefined;
    const sizes = parseDimensionLine(cell.text, order);
    if (!sizes) return {};
    return { w: sizes.w, d: sizes.d, h: sizes.h, sizeNote: sizes.labelled ? null : SIZE_NOTE_UNLABELLED };
  }
  return {};
}

/**
 * The product fields on an Amazon page, cut to the lookup's limits, or null when the page is
 * empty, too large, has no `#productTitle` (not a product page), or the title is empty. Never throws.
 */
export function readAmazon(html: string): ProductFields | null {
  try {
    const root = parsePage(html);
    if (!root) return null;
    const title = root.querySelector('#productTitle');
    if (!title) return null;
    return finishFields({
      name: title.text,
      description: readDescription(root),
      price: readPrice(root),
      imageUrl: readPhoto(root),
      ...readSizes(root),
    });
  } catch {
    return null;
  }
}
