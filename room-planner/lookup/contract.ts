import { z } from 'zod';
import { isShopPhotoUrl } from './shops';

/**
 * The contract between the product lookup route and the browser: the route's path, its error
 * codes, its limits and the shape of the product fields it returns. Shared by both sides, so it
 * imports nothing from `node:` or `server/`. Everything a page yields is untrusted, so
 * `parseProductFields` is the one gate both the route's output and the browser's input pass.
 */

/** The path the browser posts a pasted link to. */
export const LOOKUP_PATH = '/api/room-planner/lookup';

/** Why a lookup failed; the route answers with exactly one of these. */
export const LOOKUP_ERROR_CODES = ['invalid_url', 'unsupported_shop', 'blocked', 'not_a_product', 'unavailable', 'rate_limited'] as const;

export type LookupErrorCode = (typeof LOOKUP_ERROR_CODES)[number];

/**
 * The lookup's fixed limits: request body bytes, link and text lengths in characters, the largest
 * size in inches and price in dollars kept, page bytes after decompression, total time per lookup,
 * redirects followed, and lookups allowed per address per rate window.
 */
export const LOOKUP_LIMITS = {
  bodyMax: 4096,
  urlMax: 2048,
  nameMax: 200,
  descriptionMax: 600,
  sizeMax: 10000,
  priceMax: 10_000_000,
  pageMax: 4 * 1024 * 1024,
  timeoutMs: 8000,
  redirectsMax: 3,
  rateLimit: 20,
  rateWindowMs: 600_000,
} as const;

/** The note shown when a page gave three sizes without saying which is width, depth or height. */
export const SIZE_NOTE_UNLABELLED = 'Check these sizes: the page did not say which is which.';

/**
 * The note shown when the planner swapped a page's width and depth, because the page gave a piece
 * that is normally wider than deep a depth more than 1.5 times its width.
 */
export const SIZE_NOTE_SWAPPED = 'Check these sizes: width and depth looked swapped on the page.';

/**
 * The longest size note accepted, in characters (a project bound, not one the spec names). The
 * page readers cut a longer note to it rather than failing the whole product here.
 */
export const SIZE_NOTE_MAX = 200;

/** What a lookup returns for a product. A field the page did not give is null. */
export interface ProductFields {
  name: string;
  description: string;
  price: number | null;
  imageUrl: string | null;
  w: number | null;
  d: number | null;
  h: number | null;
  sizeNote: string | null;
}

const CODE_SET: ReadonlySet<unknown> = new Set(LOOKUP_ERROR_CODES);

/** True when `value` is one of the six lookup error codes. */
export function isLookupErrorCode(value: unknown): value is LookupErrorCode {
  return CODE_SET.has(value);
}

/** A finite number above 0 and at most `max`; zod refuses `NaN` and the infinities too. */
function positiveUpTo(max: number) {
  return z.number().gt(0).max(max).refine(Number.isFinite);
}

const sizeSchema = positiveUpTo(LOOKUP_LIMITS.sizeMax).nullable();

/** Exactly the ProductFields keys: a missing or extra key is refused. */
const productFieldsSchema = z.strictObject({
  name: z.string().min(1).max(LOOKUP_LIMITS.nameMax),
  description: z.string().max(LOOKUP_LIMITS.descriptionMax),
  price: positiveUpTo(LOOKUP_LIMITS.priceMax).nullable(),
  imageUrl: z.string().refine(isShopPhotoUrl).nullable(),
  w: sizeSchema,
  d: sizeSchema,
  h: sizeSchema,
  sizeNote: z.string().max(SIZE_NOTE_MAX).nullable(),
});

/**
 * Validates untrusted product fields and returns a fresh copy, or null when any field is out of
 * range, a key is missing or extra, or the value is not an object. Never throws: a getter that
 * throws while the value is read is refused too.
 */
export function parseProductFields(value: unknown): ProductFields | null {
  try {
    const parsed = productFieldsSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
