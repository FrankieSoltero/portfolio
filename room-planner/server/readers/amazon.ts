import { type HTMLElement, NodeType, TextNode } from 'node-html-parser';
import { SIZE_NOTE_UNLABELLED, type ProductFields } from '../../lookup/contract';
import { isShopPhotoUrl } from '../../lookup/shops';
import { parseDimensionLine } from '../sizes';
import { descendants, dollars, elementsById, finishFields, nextElement, parsePage, plain, readText, shortText, type TextBudget } from './shared';

/**
 * Reads an Amazon product page from its markup: the `#productTitle` text, the main photo, the
 * price in the core price block, the feature bullets and the "Product Dimensions" or "Item
 * Dimensions" row of the details table. A page without `#productTitle` (such as a bot-check page)
 * is not a product.
 *
 * Every step is linear in the page, so a hostile page costs about what parsing it does (see
 * `parsePage`): the blocks are found by their ids in one walk of the page, and what is inside one by
 * more walk (`descendants`) testing one tag or one class, never by a selector (a selector with a
 * descendant step, or any selector run on an element below the root, makes the selector engine
 * walk the ancestors of every candidate); ancestor walks stop after `ANCESTOR_STEPS_MAX` levels;
 * and text is read up to a bound (`readText`), never with the parser's own `text`, which reads
 * everything inside an element again for each nested element.
 */

/** The host the main photo must be on when it is read from `data-old-hires`. */
const AMAZON_PHOTO_HOST = 'm.media-amazon.com';

/** The ids of the price blocks searched for the price, in order. */
const PRICE_BLOCKS = ['corePrice_desktop', 'corePriceDisplay_desktop_feature_div'];

/** The classes Amazon marks the price to pay with; searched before any other price. */
const PRICE_TO_PAY = ['priceToPay', 'apexPriceToPay'];

/** The id of the text Amazon writes for screen readers with the price to pay, such as ` $139.99 `. */
const PRICE_LABEL_ID = 'apex-pricetopay-accessibility-label';

/** The ids of the title, the main photo and the feature bullets block. */
const TITLE_ID = 'productTitle';
const LANDING_IMAGE_ID = 'landingImage';
const BULLETS_ID = 'feature-bullets';

/** The details table row labels that hold the sizes. */
const SIZE_LABELS = ['Product Dimensions', 'Item Dimensions'];

/** The word in a sizes label after which an order hint such as `LxWxH` may follow. */
const DIMENSIONS_WORD = 'Dimensions';

/** The most levels an ancestor walk climbs; Amazon's price markup is a few levels deep. */
const ANCESTOR_STEPS_MAX = 16;

/** The most characters and nodes read from one price, or one details label; more is neither. */
const SHORT_TEXT_MAX = 200;
const SHORT_NODES_MAX = 16;

/** The most characters and nodes read from the details cell holding the sizes; more is not a sizes line. */
const SIZES_TEXT_MAX = 1000;
const SIZES_NODES_MAX = 256;

/**
 * What reading the feature bullets may do in all: raw characters kept and nodes visited. A real
 * bullets block is a few thousand characters in a few hundred nodes; the description is cut to 600.
 */
const BULLETS_BUDGET: Readonly<TextBudget> = { chars: 20_000, nodes: 5_000 };

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
function largestDynamicImage(landingImage: HTMLElement | undefined): string | null {
  const attribute = landingImage?.getAttribute('data-a-dynamic-image');
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

/**
 * The first `data-old-hires` photo on `m.media-amazon.com`, else the largest `data-a-dynamic-image`
 * entry of `#landingImage`.
 */
function readPhoto(root: HTMLElement, landingImage: HTMLElement | undefined): string | null {
  for (const element of root.querySelectorAll('[data-old-hires]')) {
    const photo = amazonPhoto(element.getAttribute('data-old-hires') ?? '');
    if (photo) return photo;
  }
  return largestDynamicImage(landingImage);
}

/**
 * How `element` sits in the price markup between it and `container`, looking at most
 * `ANCESTOR_STEPS_MAX` levels up: `inPrice` when an ancestor is an `.a-price`, and `struck` when
 * one such `.a-price` is struck through (the old "List Price": `data-a-strike="true"` or class
 * `a-text-price`).
 */
function priceAncestry(element: HTMLElement, container: HTMLElement): { inPrice: boolean; struck: boolean } {
  let inPrice = false;
  let node = element.parentNode;
  for (let steps = 0; node && node !== container && steps < ANCESTOR_STEPS_MAX; steps += 1, node = node.parentNode) {
    if (!node.classList.contains('a-price')) continue;
    inPrice = true;
    if (node.getAttribute('data-a-strike') === 'true' || node.classList.contains('a-text-price')) return { inPrice, struck: true };
  }
  return { inPrice, struck: false };
}

/**
 * The first `.a-offscreen` inside `scope` whose text starts with `$` and that `keep` accepts, read
 * as dollars; null when there is none. Text longer than a price is not one.
 */
function firstDollars(scope: HTMLElement, keep: (element: HTMLElement) => boolean): number | null {
  for (const element of descendants(scope)) {
    if (!element.classList.contains('a-offscreen')) continue;
    const text = shortText(element, SHORT_TEXT_MAX, SHORT_NODES_MAX)?.trim() ?? '';
    if (text.startsWith('$') && keep(element)) return dollars(text);
  }
  return null;
}

/**
 * The text directly inside `element`, without the text of the elements in it (so the whole-dollar
 * part without its nested decimal point), entity-decoded. Null when it has more than
 * `SHORT_NODES_MAX` children or `SHORT_TEXT_MAX` characters: that is not a price part.
 */
function ownText(element: HTMLElement): string | null {
  const children = element.childNodes;
  if (children.length > SHORT_NODES_MAX) return null;
  let raw = '';
  for (const child of children) {
    if (child.nodeType === NodeType.ELEMENT_NODE) continue;
    raw += child.rawText;
    if (raw.length > SHORT_TEXT_MAX) return null;
  }
  return new TextNode(raw, null).text;
}

/**
 * A price composed from the parts the page shows: `symbol` (only `$` counts), `whole` (digits,
 * commas dropped) and `fraction` (digits, or none). Null for any other parts.
 */
function composedDollars(symbol: string | null, whole: string | null, fraction: string | null): number | null {
  if (symbol?.trim() !== '$' || whole === null) return null;
  const dollarsText = whole.replace(/,/g, '').trim();
  const centsText = (fraction ?? '').trim();
  if (!/^\d+$/.test(dollarsText) || (centsText !== '' && !/^\d+$/.test(centsText))) return null;
  return Number(centsText === '' ? dollarsText : `${dollarsText}.${centsText}`);
}

/**
 * The price inside the price-to-pay element `toPay`, found in one walk: the first `.a-offscreen`
 * whose text starts with `$`, else the price composed from the first `.a-price-symbol`,
 * `.a-price-whole` (its own text) and `.a-price-fraction` (Amazon's current markup leaves the
 * offscreen text empty and shows the price only in those parts). Null when neither gives one.
 */
function priceToPayDollars(toPay: HTMLElement): number | null {
  let symbol: string | null = null;
  let whole: string | null = null;
  let fraction: string | null = null;
  for (const element of descendants(toPay)) {
    const classes = element.classList;
    if (classes.contains('a-offscreen')) {
      const text = shortText(element, SHORT_TEXT_MAX, SHORT_NODES_MAX)?.trim() ?? '';
      if (text.startsWith('$')) return dollars(text);
    } else if (symbol === null && classes.contains('a-price-symbol')) {
      symbol = shortText(element, SHORT_TEXT_MAX, SHORT_NODES_MAX) ?? '';
    } else if (whole === null && classes.contains('a-price-whole')) {
      whole = ownText(element) ?? '';
    } else if (fraction === null && classes.contains('a-price-fraction')) {
      fraction = shortText(element, SHORT_TEXT_MAX, SHORT_NODES_MAX) ?? '';
    }
  }
  return composedDollars(symbol, whole, fraction);
}

/**
 * The price, in this order: the accessibility label `label` (`#apex-pricetopay-accessibility-label`)
 * when its text starts with `$`; then, in the core price blocks (`blocks`: `#corePrice_desktop`,
 * then `#corePriceDisplay_desktop_feature_div`, those the page has), the price inside the first
 * element Amazon marks as the one to pay (`.priceToPay` or `.apexPriceToPay`, see
 * `priceToPayDollars`); else the first `.a-offscreen` inside an `.a-price` that is not struck
 * through. Only US dollars count.
 */
function readPrice(label: HTMLElement | undefined, blocks: readonly HTMLElement[]): number | null {
  const labelText = label === undefined ? '' : (shortText(label, SHORT_TEXT_MAX, SHORT_NODES_MAX)?.trim() ?? '');
  if (labelText.startsWith('$')) {
    const price = dollars(labelText);
    if (price !== null) return price;
  }
  for (const block of blocks) {
    let toPay: HTMLElement | undefined;
    for (const element of descendants(block)) {
      if (PRICE_TO_PAY.some((name) => element.classList.contains(name))) {
        toPay = element;
        break;
      }
    }
    const price = toPay === undefined ? null : priceToPayDollars(toPay);
    if (price !== null) return price;
  }
  for (const block of blocks) {
    const price = firstDollars(block, (element) => {
      const { inPrice, struck } = priceAncestry(element, block);
      return inPrice && !struck;
    });
    if (price !== null) return price;
  }
  return null;
}

/**
 * The `#feature-bullets` list item texts joined by a space. All the items together are read
 * within `BULLETS_BUDGET`, so nested items on a hostile page cannot make this quadratic; a real
 * block fits well within it.
 */
function readDescription(block: HTMLElement | undefined): string {
  if (block === undefined) return '';
  const budget: TextBudget = { ...BULLETS_BUDGET };
  const texts: string[] = [];
  for (const item of descendants(block)) {
    if (budget.nodes <= 0 || budget.chars <= 0) break;
    if (item.tagName !== 'LI') continue;
    const text = plain(readText(item, budget).text);
    if (text !== '') texts.push(text);
  }
  return texts.join(' ');
}

/**
 * Width, depth, height and size note from the first details `<th>` that names the product or item
 * dimensions and the `<td>` right after it. Letters after the word `Dimensions` in that label
 * (`LxWxH`, `D x W x H`) are the order hint. The note warns when the numbers were not labelled.
 * Each `<th>` is read only up to a label's length, and only the first match looks at its siblings.
 */
function readSizes(root: HTMLElement): Partial<ProductFields> {
  let label = '';
  const heading = root.querySelectorAll('th').find((th) => {
    label = plain(shortText(th, SHORT_TEXT_MAX, SHORT_NODES_MAX) ?? '');
    return SIZE_LABELS.some((wanted) => label.includes(wanted));
  });
  if (heading === undefined) return {};
  const cell = nextElement(heading);
  if (cell === null || cell.tagName !== 'TD') return {};
  const line = shortText(cell, SIZES_TEXT_MAX, SIZES_NODES_MAX);
  if (line === null) return {};
  const after = label.slice(label.indexOf(DIMENSIONS_WORD) + DIMENSIONS_WORD.length);
  const order = /[a-z]/i.test(after) ? after : undefined;
  const sizes = parseDimensionLine(line, order);
  if (!sizes) return {};
  return { w: sizes.w, d: sizes.d, h: sizes.h, sizeNote: sizes.labelled ? null : SIZE_NOTE_UNLABELLED };
}

/**
 * The product fields on an Amazon page, cut to the lookup's limits, or null when the page is
 * empty, too large, has no `#productTitle` (not a product page), or the title is empty. Never throws.
 */
export function readAmazon(html: string): ProductFields | null {
  try {
    const root = parsePage(html);
    if (!root) return null;
    const byId = elementsById(root, [TITLE_ID, LANDING_IMAGE_ID, BULLETS_ID, PRICE_LABEL_ID, ...PRICE_BLOCKS]);
    const title = byId.get(TITLE_ID);
    if (!title) return null;
    const priceBlocks = PRICE_BLOCKS.flatMap((id) => byId.get(id) ?? []);
    return finishFields({
      name: title.text,
      description: readDescription(byId.get(BULLETS_ID)),
      price: readPrice(byId.get(PRICE_LABEL_ID), priceBlocks),
      imageUrl: readPhoto(root, byId.get(LANDING_IMAGE_ID)),
      ...readSizes(root),
    });
  } catch {
    return null;
  }
}
