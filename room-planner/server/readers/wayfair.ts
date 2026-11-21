import type { HTMLElement } from 'node-html-parser';
import { SIZE_NOTE_UNLABELLED, type ProductFields } from '../../lookup/contract';
import { parseDimensionLine } from '../sizes';
import { canonicalUrl, finishFields, metaContent, parsePage } from './shared';

/**
 * Reads a Wayfair product page. Wayfair publishes no JSON-LD Product, so the name, photo, price
 * and sizes come from the page markup: the listing heading (or `og:title`), `og:image`, the lead
 * price, and the "Overall Dimensions" line of the dimensions list, or of the page's embedded data
 * when the list is missing. A page whose canonical address has no `/pdp/` is not a product.
 */

/** The shop name Wayfair adds to the end of `og:title`, longest form first. */
const TITLE_SUFFIXES = [' & Reviews | Wayfair', ' | Wayfair'];

/** The labels, exactly, of the dimensions list entry that holds the overall sizes. */
const OVERALL_LABELS = new Set(['Overall Dimensions', 'Overall']);

/**
 * Where the overall sizes start in the page's embedded data. The data is JSON written inside a
 * JavaScript string, so its quotes appear escaped as `\"`.
 */
const EMBEDDED_MARKER = String.raw`Overall Dimensions\",\"value\":\"`;

/** The most characters of embedded data read after the marker; a sizes line is far shorter. */
const EMBEDDED_MAX = 300;

/** Text with each run of whitespace made one space and the ends trimmed. */
function plain(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The listing heading's text, else `og:title` without its trailing shop name; null when neither. */
function readName(root: HTMLElement): string | null {
  const heading = root.querySelector('h1[data-rtl-id="listingHeaderNameHeading"]');
  const headingText = heading ? plain(heading.text) : '';
  if (headingText !== '') return headingText;
  const title = metaContent(root, 'og:title');
  if (title === null) return null;
  const suffix = TITLE_SUFFIXES.find((ending) => title.endsWith(ending));
  return suffix ? title.slice(0, -suffix.length) : title;
}

/**
 * A US dollar amount written as `$319.99` or `$1,299.00`; null for any other text. Only text
 * that starts with `$` counts as dollars. (`shared.ts` keeps its price reader private and does not
 * check for the `$`, so this one is local; `amazon.ts` holds the same helper.)
 */
function dollars(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('$')) return null;
  const amount = trimmed.slice(1).replace(/,/g, '').trim();
  return /^\d+(?:\.\d+)?$/.test(amount) ? Number(amount) : null;
}

/** The first `PriceDisplay` that is not struck through (an `<s>`, the old price), read as dollars. */
function readPrice(root: HTMLElement): number | null {
  for (const element of root.querySelectorAll('[data-test-id="PriceDisplay"]')) {
    if (element.tagName === 'S') continue;
    return dollars(element.text);
  }
  return null;
}

/** The text of the `<dd>` after the `<dt>` labelled `Overall Dimensions` or `Overall`; null when none. */
function listedSizes(root: HTMLElement): string | null {
  for (const term of root.querySelectorAll('dt')) {
    if (!OVERALL_LABELS.has(plain(term.text))) continue;
    const next = term.nextElementSibling;
    if (next && next.tagName === 'DD') return next.text;
  }
  return null;
}

/** One backslash escape at `index`: `\uXXXX` as its character, `\n`, `\r`, `\t` as a space, else the escaped character. */
function readEscape(text: string, index: number): { char: string; length: number } {
  const next = text[index + 1];
  const hex = text.slice(index + 2, index + 6);
  if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(hex)) return { char: String.fromCharCode(parseInt(hex, 16)), length: 6 };
  if (next === 'n' || next === 'r' || next === 't') return { char: ' ', length: 2 };
  return { char: next ?? '', length: 2 };
}

/**
 * Reads `text` undoing one level of backslash escapes (`\"` to `"`, `\\` to `\`, `'` to
 * `'`). With `stopAtQuote`, reading ends at the first unescaped `"`, which closes a JSON string,
 * and null is returned when there is none; otherwise the whole text is read.
 */
function unescapeText(text: string, stopAtQuote: boolean): string | null {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (stopAtQuote && char === '"') return result;
    if (char === '\\') {
      const escape = readEscape(text, i);
      result += escape.char;
      i += escape.length;
    } else {
      result += char;
      i += 1;
    }
  }
  return stopAtQuote ? null : result;
}

/**
 * The overall sizes line in the page's embedded data: the first value after
 * `Overall Dimensions\",\"value\":\"`. Only a bounded slice after the marker is read, so this
 * stays linear in the page size. The value is JSON inside a JavaScript string, so the string's
 * escapes are undone first and the JSON string is then read up to its closing quote.
 */
function embeddedSizes(html: string): string | null {
  const start = html.indexOf(EMBEDDED_MARKER);
  if (start === -1) return null;
  const from = start + EMBEDDED_MARKER.length;
  const json = unescapeText(html.slice(from, from + EMBEDDED_MAX), false) ?? '';
  return unescapeText(json, true);
}

/** Width, depth, height and size note from the dimensions list, else from the embedded data. */
function readSizes(root: HTMLElement, html: string): Partial<ProductFields> {
  const line = listedSizes(root) ?? embeddedSizes(html);
  const sizes = line === null ? null : parseDimensionLine(line);
  if (!sizes) return {};
  return { w: sizes.w, d: sizes.d, h: sizes.h, sizeNote: sizes.labelled ? null : SIZE_NOTE_UNLABELLED };
}

/**
 * The product fields on a Wayfair page, cut to the lookup's limits, or null when the page is
 * empty, too large, not a product page (its canonical address has no `/pdp/`), or has no name.
 * Never throws.
 */
export function readWayfair(html: string): ProductFields | null {
  try {
    const root = parsePage(html);
    if (!root) return null;
    if (!canonicalUrl(root)?.includes('/pdp/')) return null;
    const name = readName(root);
    if (name === null) return null;
    return finishFields({
      name,
      price: readPrice(root),
      imageUrl: metaContent(root, 'og:image'),
      ...readSizes(root, html),
    });
  } catch {
    return null;
  }
}
