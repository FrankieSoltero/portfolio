import { promises as dns } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { pipeline, Transform, type Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { LOOKUP_LIMITS } from '../lookup/contract';
import { shopForHost } from '../lookup/shops';

/**
 * Fetches a shop's product page from a link a visitor pasted, without letting that link reach
 * anything but a shop. The only hosts ever contacted are IKEA, Amazon and Wayfair hosts (as
 * `shopForHost` decides), over `https` on port 443, at an address this module has itself checked
 * to be public; the connection is pinned to that checked address, and every redirect is checked
 * again from the start. One deadline covers the whole call. Nothing here throws or logs.
 *
 * Known behaviour of the default `resolve` and `request`:
 * - `dns.promises.lookup` cannot be cancelled. At the deadline the fetch gives up waiting and
 *   answers, but the system lookup itself finishes in the background.
 * - Because no agent is shared (`agent: false`), Node adds a `Connection: close` header to each
 *   request on top of the four reader headers.
 */

/** What a fetch gives: the page as text, or why there is none. */
export type FetchResult = { ok: true; html: string } | { ok: false; reason: 'blocked' | 'unavailable' | 'unsupported_shop' };

/** The outside world a fetch uses; tests replace any part of it. */
export interface FetchDeps {
  resolve(hostname: string): Promise<{ address: string; family: 4 | 6 }[]>;
  request(target: { url: URL; address: string; family: 4 | 6; headers: Record<string, string>; signal: AbortSignal }): Promise<{ status: number; headers: Record<string, string | undefined>; body: AsyncIterable<Uint8Array> }>;
  now(): number;
}

type Target = Parameters<FetchDeps['request']>[0];
type Response = Awaited<ReturnType<FetchDeps['request']>>;

/** Exactly the headers every request sends: no cookie, no referer, nothing about the visitor. */
const READER_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent': 'RoomPlannerLinkPreview/1.0',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, identity',
};

/** The redirect statuses followed. Any other 3xx is treated as a failure. */
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/** Statuses a shop answers with when it refuses automated readers. */
const BLOCKED_STATUSES: ReadonlySet<number> = new Set([403, 429, 503]);

/** Media types accepted as a page. */
const PAGE_TYPES: ReadonlySet<string> = new Set(['text/html', 'application/xhtml+xml']);

/** Text that only appears on Amazon's robot check page, compared in lower case. */
const CHALLENGE_MARKERS = ['api-services-support@amazon.com', '/errors/validatecaptcha'];

/**
 * IPv4 ranges that are not public: "this network", private, shared (carrier NAT), loopback,
 * link-local, IETF protocol assignments, documentation, the old 6to4 relay, benchmarking,
 * multicast and reserved (which includes the broadcast address).
 */
const BLOCKED_V4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_V4.addSubnet(network, prefix, 'ipv4');
}

/**
 * IPv6 is checked the other way round: only global unicast (`2000::/3`) is allowed at all, which
 * already shuts out unspecified, loopback, IPv4-mapped and translated addresses, discard-only,
 * unique-local, link-local and multicast. Inside it, these are refused too: IETF protocol
 * assignments (including Teredo), documentation, and 6to4 (which embeds any IPv4 address).
 */
const GLOBAL_V6 = new BlockList();
GLOBAL_V6.addSubnet('2000::', 3, 'ipv6');
const BLOCKED_V6 = new BlockList();
for (const [network, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  BLOCKED_V6.addSubnet(network, prefix, 'ipv6');
}

/**
 * True only when `address` is an IP address of the given family that is publicly routable.
 * Anything that is not an IP address, a zoned address, and every IPv4-mapped IPv6 address
 * give false. Never throws.
 */
export function isPublicAddress(address: string, family: 4 | 6): boolean {
  try {
    if (typeof address !== 'string' || address.includes('%') || isIP(address) !== family) return false;
    if (family === 4) return !BLOCKED_V4.check(address, 'ipv4');
    return GLOBAL_V6.check(address, 'ipv6') && !BLOCKED_V6.check(address, 'ipv6');
  } catch {
    return false;
  }
}

/**
 * A DNS lookup for `node:https` that answers every question with the one address already
 * checked, so the connection goes to that address and a DNS answer that changes between the
 * check and the connection cannot move it. Exported for tests.
 */
export function pinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

/** A pass-through stream that fails once more than `limit` bytes have gone through it. */
function byteCap(limit: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      if (total > limit) callback(new Error('body over the page cap'));
      else callback(null, chunk);
    },
  });
}

/**
 * The response body as a stream of decoded bytes: as it is for no encoding or `identity`,
 * gunzipped as it streams for `gzip`, and null for any other encoding (which was not asked
 * for). The reader caps the decoded bytes; for `gzip` the raw bytes are capped here too, at the
 * same 4 MiB, because gzip can also inflate to nothing (empty stored blocks) and would otherwise
 * be read without end. Decoding is lazy, so the reader's cap also limits how far a small gzip
 * bomb expands. Exported for tests.
 */
export function decodeBody(raw: Readable, encoding: string | undefined): Readable | null {
  const coding = (encoding ?? '').trim().toLowerCase();
  if (coding === '' || coding === 'identity') return raw;
  if (coding !== 'gzip') return null;
  // `pipeline` destroys every stream, the raw response included, when one fails or the reader
  // stops early.
  return pipeline(raw, byteCap(LOOKUP_LIMITS.pageMax), createGunzip(), () => {});
}

/**
 * Lets go of a body that will not be read, so its connection closes now rather than at the end
 * of the call. A stream (the default `request`'s body, which is the response or is piped from
 * it) is destroyed; any other body has its iterator returned. Never throws.
 */
function release(body: AsyncIterable<Uint8Array>): void {
  try {
    const stream = body as Partial<Readable>;
    if (typeof stream.destroy === 'function') {
      stream.destroy();
      return;
    }
    Promise.resolve(body[Symbol.asyncIterator]().return?.()).catch(() => {});
  } catch {
    // A body that cannot be released is left to the final abort.
  }
}

/** The address without one trailing dot, as TLS server names and Host headers want it. */
function bareHost(hostname: string): string {
  return hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
}

/** The default request: `node:https`, pinned to the checked address, no shared agent. */
function defaultRequest(target: Target): Promise<Response> {
  return new Promise((resolve, reject) => {
    const host = bareHost(target.url.hostname);
    const req = httpsRequest(
      {
        protocol: 'https:',
        hostname: host,
        port: 443,
        path: `${target.url.pathname}${target.url.search}`,
        method: 'GET',
        headers: { ...target.headers, Host: host },
        servername: host,
        lookup: pinnedLookup(target.address, target.family),
        agent: false,
        signal: target.signal,
      },
      (res) => {
        const body = decodeBody(res, res.headers['content-encoding']);
        if (body === null) {
          res.destroy();
          reject(new Error('unsupported content encoding'));
          return;
        }
        const headers: Record<string, string | undefined> = {};
        for (const [name, value] of Object.entries(res.headers)) {
          headers[name] = Array.isArray(value) ? value.join(', ') : value;
        }
        resolve({ status: res.statusCode ?? 0, headers, body });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** The default resolve: every address the system resolver gives for the host. */
async function defaultResolve(hostname: string): Promise<{ address: string; family: 4 | 6 }[]> {
  const answers = await dns.lookup(hostname, { all: true });
  return answers.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));
}

const DEFAULT_DEPS: FetchDeps = { resolve: defaultResolve, request: defaultRequest, now: () => Date.now() };

/**
 * The link as a URL when it may be fetched: `https`, no user name or password, no port other
 * than the default, on a shop's host. Otherwise null. `base` resolves a relative redirect.
 */
function shopUrl(link: string, base?: URL): URL | null {
  let url: URL;
  try {
    url = new URL(link, base);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return null;
  return shopForHost(url.hostname) === null ? null : url;
}

/** A header's value by name in any case. */
function header(headers: Record<string, string | undefined>, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return undefined;
}

/** True when the content type names an HTML page. */
function isPageType(contentType: string | undefined): boolean {
  if (contentType === undefined) return false;
  return PAGE_TYPES.has(contentType.split(';')[0].trim().toLowerCase());
}

/** Signals that the deadline passed; caught inside `fetchShopPage`. */
class Expired extends Error {}

/**
 * Fetches a shop page. A link that is not an `https` shop link with no port or credentials is
 * `unsupported_shop`; a refusal status or a robot check page is `blocked`; anything else that
 * goes wrong (a non-public address, a redirect off the shop list, too many redirects, a wrong
 * status or type, a page over 4 MiB, more than 8000 ms in all, a network error) is
 * `unavailable`. Never throws.
 */
export async function fetchShopPage(url: string, deps?: Partial<FetchDeps>): Promise<FetchResult> {
  const unavailable: FetchResult = { ok: false, reason: 'unavailable' };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { resolve, request, now } = { ...DEFAULT_DEPS, ...definedOnly(deps) };
    let current = typeof url === 'string' ? shopUrl(url) : null;
    if (current === null) return { ok: false, reason: 'unsupported_shop' };

    const deadline = now() + LOOKUP_LIMITS.timeoutMs;
    // The timer aborts work that never answers; `checkTime` catches time passing between awaits.
    const expired = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Expired()), { once: true });
    });
    expired.catch(() => {});
    timer = setTimeout(() => controller.abort(), LOOKUP_LIMITS.timeoutMs);
    const within = <T>(work: Promise<T>): Promise<T> => Promise.race([work, expired]);
    const checkTime = (): void => {
      if (now() > deadline) throw new Expired();
    };

    for (let redirects = 0; ; redirects += 1) {
      checkTime();
      const addresses = await within(Promise.resolve(resolve(current.hostname)));
      checkTime();
      if (!Array.isArray(addresses) || addresses.length === 0) return unavailable;
      if (!addresses.every(({ address, family }) => isPublicAddress(address, family))) return unavailable;
      const { address, family } = addresses[0];

      const response = await within(
        Promise.resolve(request({ url: current, address, family, headers: { ...READER_HEADERS }, signal: controller.signal })),
      );
      checkTime();

      if (REDIRECT_STATUSES.has(response.status)) {
        // At most one connection is open at a time: this hop's body is never read.
        release(response.body);
        if (redirects >= LOOKUP_LIMITS.redirectsMax) return unavailable;
        const location = header(response.headers, 'location');
        if (location === undefined || location === '') return unavailable;
        const next = shopUrl(location, current);
        if (next === null) return unavailable;
        current = next;
        continue;
      }
      if (BLOCKED_STATUSES.has(response.status)) return { ok: false, reason: 'blocked' };
      if (response.status !== 200 || !isPageType(header(response.headers, 'content-type'))) return unavailable;

      const html = await readPage(response.body, within, checkTime);
      if (html === null) return unavailable;
      const lower = html.toLowerCase();
      if (CHALLENGE_MARKERS.some((marker) => lower.includes(marker))) return { ok: false, reason: 'blocked' };
      return { ok: true, html };
    }
  } catch {
    return unavailable;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // Ends any connection still open: after a page, a refusal, a cap or the deadline alike.
    controller.abort();
  }
}

/**
 * Reads the body as UTF-8, or gives null once it passes the page cap. Stops pulling as soon as
 * the cap or the deadline is passed. A read still in flight is stopped by the abort signal that
 * `fetchShopPage` fires when it finishes, not by anything here.
 */
async function readPage(
  body: AsyncIterable<Uint8Array>,
  within: <T>(work: Promise<T>) => Promise<T>,
  checkTime: () => void,
): Promise<string | null> {
  const iterator = body[Symbol.asyncIterator]();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const step = await within(Promise.resolve(iterator.next()));
      checkTime();
      if (step.done) break;
      total += step.value.byteLength;
      if (total > LOOKUP_LIMITS.pageMax) return null;
      parts.push(step.value);
    }
  } finally {
    // Not awaited: a body that never answers must not hold the fetch open.
    Promise.resolve()
      .then(() => iterator.return?.())
      .catch(() => {});
  }
  const decoder = new TextDecoder('utf-8');
  return parts.map((part) => decoder.decode(part, { stream: true })).join('') + decoder.decode();
}

/** The given deps without keys set to undefined, so those fall back to the defaults. */
function definedOnly(deps: Partial<FetchDeps> | undefined): Partial<FetchDeps> {
  const out: Partial<FetchDeps> = {};
  if (deps?.resolve) out.resolve = deps.resolve;
  if (deps?.request) out.request = deps.request;
  if (deps?.now) out.now = deps.now;
  return out;
}
