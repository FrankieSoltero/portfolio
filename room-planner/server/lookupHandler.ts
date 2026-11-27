import { LOOKUP_LIMITS, parseProductFields, type LookupErrorCode, type ProductFields } from '../lookup/contract';
import { shopForHost, type Shop } from '../lookup/shops';
import { createRateLimiter, type RateLimiter } from './rateLimit';
import { readProduct } from './readers';
import { fetchShopPage, type FetchResult } from './safeFetch';

/**
 * The product lookup route's work: takes a pasted shop link from the planner's own page, checks
 * the caller, rate-limits by address, fetches the page through the SSRF-safe fetch and answers
 * with only the extracted product fields or `{ error }`. Checks run in a fixed order: origin,
 * content type and body, the link, the shop list, the limiter, the fetch, then the reader. Only a
 * request that reaches the fetch is charged to the limiter. One log line per request, holding the
 * shop name and the outcome and nothing else. Never throws.
 */

/** The outside world a lookup uses; tests replace any part of it. */
export interface LookupDeps { fetchPage(url: string): Promise<FetchResult>; limiter: RateLimiter; now(): number; log(line: string): void }

/** One limiter per server instance, shared by every request that uses the defaults. */
const DEFAULT_LIMITER = createRateLimiter({ limit: 20, windowMs: 600_000, maxKeys: 5000 });

const DEFAULT_DEPS: LookupDeps = {
  fetchPage: (url) => fetchShopPage(url),
  limiter: DEFAULT_LIMITER,
  now: () => Date.now(),
  log: (line) => console.info(line),
};

/** The longest limiter key kept, so long header values cannot grow the limiter's memory. */
const KEY_MAX = 64;

/** Headers on every answer. No `Access-Control-*` header: the route is for this site only. */
const BASE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

/** The status each fetch failure is answered with. */
const FETCH_FAILURES: Readonly<Record<string, { status: number; code: LookupErrorCode }>> = {
  blocked: { status: 502, code: 'blocked' },
  unavailable: { status: 502, code: 'unavailable' },
  unsupported_shop: { status: 400, code: 'unsupported_shop' },
};

/** How a request ended: the answer's status and body, and the outcome for the log line. */
type Outcome =
  | { status: 200; fields: ProductFields }
  | { status: number; code: LookupErrorCode; retryAfterSec?: number };

/** A refusal with `code`. */
function refuse(status: number, code: LookupErrorCode, retryAfterSec?: number): Outcome {
  return { status, code, retryAfterSec };
}

/**
 * Answers one lookup request. `deps` replaces any of the fetch, the limiter, the clock or the log;
 * the defaults are the SSRF-safe fetch, one module-level limiter of 20 lookups per 600,000 ms per
 * address, `Date.now` and `console.info`. Never throws; an unexpected failure is 502 `unavailable`
 * with nothing about the error in the body.
 */
export async function handleLookup(req: Request, deps?: Partial<LookupDeps>): Promise<Response> {
  let log = DEFAULT_DEPS.log;
  // Written as soon as the link's shop is known, so even a failure after that logs the shop.
  const seen: { shop: Shop | null } = { shop: null };

  let outcome: Outcome;
  let response: Response;
  try {
    const merged = { ...DEFAULT_DEPS, ...definedOnly(deps) };
    log = merged.log;
    outcome = await lookup(req, merged, seen);
    // Built here, so a failure while building the answer is a 502 too, never a throw.
    response = respond(outcome);
  } catch {
    outcome = refuse(502, 'unavailable');
    response = respond(outcome);
  }

  try {
    log(JSON.stringify({ event: 'room_planner_lookup', shop: seen.shop, outcome: 'fields' in outcome ? 'ok' : outcome.code }));
  } catch {
    // A failing log must not change the answer.
  }
  return response;
}

/** The checks and the lookup itself, in order. May throw; the caller turns that into 502. */
async function lookup(req: Request, deps: LookupDeps, seen: { shop: Shop | null }): Promise<Outcome> {
  if (!isSameOrigin(req.headers)) return refuse(403, 'unavailable');
  if (!isJsonType(req.headers.get('content-type'))) return refuse(400, 'invalid_url');

  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) > LOOKUP_LIMITS.bodyMax) return refuse(413, 'invalid_url');
  const bytes = await readBounded(req.body, LOOKUP_LIMITS.bodyMax);
  if (bytes === null) return refuse(413, 'invalid_url');

  const url = linkFromBody(bytes);
  if (url === null || !isHttpsLink(url)) return refuse(400, 'invalid_url');

  const shop = shopForHost(new URL(url).hostname);
  if (shop === null) return refuse(400, 'unsupported_shop');
  seen.shop = shop;

  const decision = deps.limiter.allow(limiterKey(req.headers), deps.now());
  if (!decision.ok) return refuse(429, 'rate_limited', decision.retryAfterSec);

  const page = await deps.fetchPage(url);
  if (page?.ok !== true || typeof page.html !== 'string') {
    const failure = page?.ok === false && Object.hasOwn(FETCH_FAILURES, page.reason) ? FETCH_FAILURES[page.reason] : undefined;
    return failure ? refuse(failure.status, failure.code) : refuse(502, 'unavailable');
  }

  const read = readProduct(shop, page.html);
  if (read === null) return refuse(422, 'not_a_product');
  // The reader's output is checked against the contract once more before it leaves the server.
  const fields = parseProductFields(read);
  return fields === null ? refuse(502, 'unavailable') : { status: 200, fields };
}

/**
 * True when the request comes from the site's own page: an `Origin` header is present, parses as
 * an address, and its host (with port) equals the request's `Host` header, ignoring case. So it
 * works on localhost and on preview hosts with no site name written here. `Origin: null` fails.
 */
function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get('origin');
  const host = headers.get('host');
  if (!origin || !host) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost !== '' && originHost.toLowerCase() === host.toLowerCase();
}

/** True when the media type is `application/json`, with or without parameters, in any case. */
function isJsonType(contentType: string | null): boolean {
  if (contentType === null) return false;
  return contentType.split(';')[0].trim().toLowerCase() === 'application/json';
}

/**
 * The body's bytes, or null as soon as more than `max` bytes have arrived; the rest of the stream
 * is then cancelled rather than read. A missing body is empty.
 */
async function readBounded(body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> {
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      // Stop the sender; a failure to cancel changes nothing about the answer.
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * The `url` from a body that is UTF-8 JSON for a plain object whose only key is `url`, holding a
 * string. Null for anything else. The value is read as an own property, never through a prototype.
 */
function linkFromBody(bytes: Uint8Array): string | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  // JSON gives only plain objects and arrays here; an array's keys are indexes, so it fails below.
  if (typeof value !== 'object' || value === null) return null;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'url') return null;
  const url: unknown = Object.getOwnPropertyDescriptor(value, 'url')?.value;
  return typeof url === 'string' ? url : null;
}

/** True when the link is at most 2048 characters, parses as an address, and uses `https`. */
function isHttpsLink(url: string): boolean {
  if (url.length > LOOKUP_LIMITS.urlMax) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The address the limiter counts against: the first `x-forwarded-for` entry, else `x-real-ip`,
 * else `unknown`, cut to 64 characters. Used only for the limiter, never logged.
 */
function limiterKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0].trim();
  const real = headers.get('x-real-ip')?.trim();
  const key = forwarded || real || 'unknown';
  return key.slice(0, KEY_MAX);
}

/**
 * The JSON answer for an outcome: the product fields, or `{ error }`, plus `Retry-After` on 429
 * when the limiter's wait is a whole number of seconds of at least 1. Any other wait (0, a
 * fraction, NaN, a value that is not a number) is left out, and the answer is still 429.
 */
function respond(outcome: Outcome): Response {
  if ('fields' in outcome) {
    return new Response(JSON.stringify(outcome.fields), { status: 200, headers: BASE_HEADERS });
  }
  const headers: Record<string, string> = { ...BASE_HEADERS };
  const wait = outcome.retryAfterSec;
  if (Number.isSafeInteger(wait) && (wait as number) >= 1) headers['Retry-After'] = String(wait);
  return new Response(JSON.stringify({ error: outcome.code }), { status: outcome.status, headers });
}

/** Only the deps actually given, so an `undefined` entry keeps its default. */
function definedOnly(deps: Partial<LookupDeps> | undefined): Partial<LookupDeps> {
  const out: Partial<LookupDeps> = {};
  if (deps?.fetchPage) out.fetchPage = deps.fetchPage;
  if (deps?.limiter) out.limiter = deps.limiter;
  if (deps?.now) out.now = deps.now;
  if (deps?.log) out.log = deps.log;
  return out;
}
