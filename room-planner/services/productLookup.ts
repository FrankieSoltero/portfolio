import { PRODUCT_TEXT_LIMITS } from '../domain/planSchema';
import type { ProductPreview } from '../domain/types';
import type { LookupErrorCode } from '../lookup/contract';

/** Why a product lookup failed: the contract's six codes. Each maps to user-facing copy in LOOKUP_MESSAGES. */
export type { LookupErrorCode } from '../lookup/contract';

/** The user-facing text for each lookup error code. */
export const LOOKUP_MESSAGES: Record<LookupErrorCode, string> = {
  invalid_url: "That doesn't look like a link. Paste the full product URL.",
  unsupported_shop: "That shop isn't supported yet. Pick a type below.",
  blocked: "The shop didn't let us read that page. Pick a type below.",
  not_a_product: "That page isn't a single product.",
  unavailable: "Couldn't read that page. Try again, or pick a type below.",
  rate_limited: 'Too many lookups. Try again in a few minutes.',
};

export class LookupError extends Error {
  readonly code: LookupErrorCode;

  constructor(code: LookupErrorCode) {
    super(LOOKUP_MESSAGES[code]);
    this.name = 'LookupError';
    this.code = code;
  }
}

/** A user-pasted product link after validation and normalisation. */
export interface ParsedProductUrl {
  /** Normalised absolute URL (always http: or https:). */
  url: string;
  /** Lower-case hostname with any leading `www.` removed. */
  host: string;
  /** URL pathname, e.g. `/living/alder-3-seat-sofa`. */
  path: string;
}

const HTTP_SCHEME = /^https?:\/\//i;
/** Any RFC 3986 scheme prefix, e.g. `javascript:`, `data:`, `ftp:`. */
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/**
 * A scheme-less `host:port` prefix, which ANY_SCHEME would otherwise mistake for a scheme.
 * It also lets scheme-like inputs through (`javascript://host.tld/…`, `javascript:/a.b`,
 * `http:/\evil.com`, `file:///…`); after `https://` is prepended their host is the bare scheme
 * name, so the no-dot host check below rejects them. That check must not be relaxed (for
 * example to allow `localhost`) without revisiting this pattern.
 */
const HOST_WITH_PORT = /^[^:/?#]+:\d*(?:[/?#]|$)/;
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * Validates and normalises a user-pasted product link. This is the only gate on
 * pasted links: it accepts http(s) links (adding `https://` when no scheme is
 * given) and rejects anything with another scheme rather than rescuing it.
 *
 * @throws LookupError with code `invalid_url` when the input is not a usable link.
 */
export function parseProductUrl(raw: string): ParsedProductUrl {
  const trimmed = raw.trim();
  if (!trimmed) throw new LookupError('invalid_url');

  let candidate: string;
  if (HTTP_SCHEME.test(trimmed)) {
    candidate = trimmed;
  } else if (ANY_SCHEME.test(trimmed) && !HOST_WITH_PORT.test(trimmed)) {
    throw new LookupError('invalid_url');
  } else {
    candidate = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new LookupError('invalid_url');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) throw new LookupError('invalid_url');
  const host = parsed.hostname.replace(/^www\./, '');
  if (!host.includes('.')) throw new LookupError('invalid_url');

  // Never carry credentials into the stored source URL. The query string is kept on purpose.
  parsed.username = '';
  parsed.password = '';
  return { url: parsed.href, host, path: parsed.pathname };
}

/** Turns a product link into a preview the user can place in the room. */
export interface ProductLookup {
  lookup(url: string, opts?: { signal?: AbortSignal }): Promise<ProductPreview>;
}

/** The name given to a product whose own name is empty. */
export const UNTITLED_PRODUCT = 'Untitled product';

/** The text a stored item takes from a looked-up product. */
export interface ProductText {
  name: string;
  host: string;
  sourceUrl: string | null;
}

/**
 * Caps a looked-up product's text to what a saved plan accepts (PRODUCT_TEXT_LIMITS), so placing
 * it never makes the plan unreadable: a link longer than the limit becomes null, the name is cut
 * (and an empty one becomes UNTITLED_PRODUCT), and the host is cut. Every lookup's preview, and
 * every item made from one, goes through this.
 */
export function capProductText(text: ProductText): ProductText {
  const name = text.name.slice(0, PRODUCT_TEXT_LIMITS.nameMax);
  return {
    name: name === '' ? UNTITLED_PRODUCT : name,
    host: text.host.slice(0, PRODUCT_TEXT_LIMITS.hostMax),
    sourceUrl: text.sourceUrl !== null && text.sourceUrl.length <= PRODUCT_TEXT_LIMITS.urlMax ? text.sourceUrl : null,
  };
}
