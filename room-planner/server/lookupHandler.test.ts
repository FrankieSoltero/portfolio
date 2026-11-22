// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductFields } from '../lookup/contract';
import { handleLookup, type LookupDeps } from './lookupHandler';
import type { RateLimiter } from './rateLimit';
import { readProduct } from './readers';
import type { FetchResult } from './safeFetch';

// The page readers are replaced so each test decides what a page yields.
vi.mock('./readers', () => ({ readProduct: vi.fn() }));
const reader = vi.mocked(readProduct);

/** The address every test request is sent to; only its path matters to the handler. */
const ENDPOINT = 'https://frankiesoltero.example/api/room-planner/lookup';

/** The made-up host the test site is served from. */
const HOST = 'planner.example';

/** A product link on a shop the planner reads. */
const SHOP_LINK = 'https://www.ikea.com/us/en/p/x/';

/** Fields a reader might return for a product page. */
const FIELDS: ProductFields = {
  name: 'Lack side table',
  description: 'A small square side table.',
  price: 12.99,
  imageUrl: 'https://www.ikea.com/us/en/images/products/lack.jpg',
  w: 21.625,
  d: 21.625,
  h: 17.75,
  sizeNote: null,
};

/** Builds a lookup request; `headers` replace the same-origin JSON defaults (null removes one). */
function lookupRequest(body: BodyInit | null, headers: Record<string, string | null> = {}): Request {
  const merged: Record<string, string | null> = {
    Host: HOST,
    Origin: `https://${HOST}`,
    'Content-Type': 'application/json',
    ...headers,
  };
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(merged)) {
    if (value !== null) kept[name] = value;
  }
  return new Request(ENDPOINT, { method: 'POST', headers: kept, body });
}

/** A same-origin request asking for `url`. */
function linkRequest(url: unknown, headers: Record<string, string | null> = {}): Request {
  return lookupRequest(JSON.stringify({ url }), headers);
}

/** Test doubles for every dependency, with spies, returning a page and allowing every call. */
function fakeDeps(overrides: Partial<LookupDeps> = {}) {
  const fetchPage = vi.fn<LookupDeps['fetchPage']>(async () => ({ ok: true, html: '<html></html>' }));
  const allow = vi.fn<RateLimiter['allow']>(() => ({ ok: true }));
  const log = vi.fn<LookupDeps['log']>();
  const deps: LookupDeps = { fetchPage, limiter: { allow }, now: () => 1_000, log, ...overrides };
  return { deps, fetchPage, allow, log };
}

/** The response's status and parsed JSON body. */
async function read(res: Response): Promise<{ status: number; body: unknown }> {
  return { status: res.status, body: JSON.parse(await res.text()) };
}

/** The single log line's parsed JSON. */
function loggedLine(log: ReturnType<typeof fakeDeps>['log']): unknown {
  expect(log).toHaveBeenCalledTimes(1);
  return JSON.parse(log.mock.calls[0][0]);
}

beforeEach(() => {
  reader.mockReset();
  reader.mockReturnValue(FIELDS);
});

describe('handleLookup: success', () => {
  it('answers 200 with exactly the product fields', async () => {
    const { deps, fetchPage } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK), deps);
    expect(await read(res)).toEqual({ status: 200, body: FIELDS });
    expect(fetchPage).toHaveBeenCalledWith(SHOP_LINK);
    expect(reader).toHaveBeenCalledWith('ikea', '<html></html>');
  });

  it('answers 502 unavailable when the reader returns fields outside the contract', async () => {
    reader.mockReturnValue({ ...FIELDS, name: '', extra: 'x' } as unknown as ProductFields);
    const { deps } = fakeDeps();
    expect(await read(await handleLookup(linkRequest(SHOP_LINK), deps))).toEqual({ status: 502, body: { error: 'unavailable' } });
  });
});

describe('handleLookup: origin', () => {
  it('refuses a request with no Origin with 403 unavailable and no fetch', async () => {
    const { deps, fetchPage } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK, { Origin: null }), deps);
    expect(await read(res)).toEqual({ status: 403, body: { error: 'unavailable' } });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('refuses a foreign Origin with 403 and no fetch', async () => {
    const { deps, fetchPage } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK, { Origin: 'https://evil.example', Host: 'frankiesoltero.com' }), deps);
    expect(await read(res)).toEqual({ status: 403, body: { error: 'unavailable' } });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it.each(['null', 'not a url', ''])('refuses Origin %j with 403', async (origin) => {
    const { deps, fetchPage } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK, { Origin: origin }), deps);
    expect(res.status).toBe(403);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('refuses when the Host header is missing', async () => {
    const { deps } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK, { Host: null }), deps);
    expect(res.status).toBe(403);
  });

  it('refuses an Origin whose host only starts with the site host', async () => {
    const { deps } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK, { Origin: `https://${HOST}.evil.example` }), deps);
    expect(res.status).toBe(403);
  });

  it.each([
    ['http://localhost:3000', 'localhost:3000'],
    ['https://preview-abc.vercel.example', 'preview-abc.vercel.example'],
    ['https://Planner.Example', 'PLANNER.example'],
  ])('allows Origin %s with Host %s', async (origin, host) => {
    const { deps } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK, { Origin: origin, Host: host }), deps);
    expect(res.status).toBe(200);
  });

  it('refuses a port mismatch between Origin and Host', async () => {
    const { deps } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK, { Origin: 'http://localhost:3001', Host: 'localhost:3000' }), deps);
    expect(res.status).toBe(403);
  });
});

describe('handleLookup: content type and body', () => {
  it.each([['text/plain'], ['application/x-www-form-urlencoded'], ['application/jsonp'], [null]])(
    'refuses Content-Type %j with 400 invalid_url and no fetch',
    async (type) => {
      const { deps, fetchPage } = fakeDeps();
      const res = await handleLookup(linkRequest(SHOP_LINK, { 'Content-Type': type }), deps);
      expect(await read(res)).toEqual({ status: 400, body: { error: 'invalid_url' } });
      expect(fetchPage).not.toHaveBeenCalled();
    },
  );

  it('accepts a JSON media type with parameters in any case', async () => {
    const { deps } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK, { 'Content-Type': 'Application/JSON; charset=utf-8' }), deps);
    expect(res.status).toBe(200);
  });

  it('refuses a Content-Length above 4096 with 413 invalid_url before reading', async () => {
    const { deps, fetchPage } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK, { 'Content-Length': '4097' }), deps);
    expect(await read(res)).toEqual({ status: 413, body: { error: 'invalid_url' } });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('accepts a body of exactly 4096 bytes', async () => {
    const base = JSON.stringify({ url: SHOP_LINK });
    const body = base.slice(0, -1) + ' '.repeat(4096 - base.length) + '}';
    expect(new TextEncoder().encode(body).length).toBe(4096);
    const { deps } = fakeDeps();
    expect((await handleLookup(lookupRequest(body), deps)).status).toBe(200);
  });

  it('refuses a body over 4096 bytes with no Content-Length with 413', async () => {
    const body = JSON.stringify({ url: SHOP_LINK }) + ' '.repeat(4096);
    const { deps, fetchPage } = fakeDeps();
    const stream = new Blob([body]).stream();
    const req = new Request(ENDPOINT, {
      method: 'POST',
      headers: { Host: HOST, Origin: `https://${HOST}`, 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(req.headers.get('content-length')).toBeNull();
    expect(await read(await handleLookup(req, deps))).toEqual({ status: 413, body: { error: 'invalid_url' } });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('stops reading an endless body soon after 4096 bytes', async () => {
    let pulls = 0;
    let cancelled = false;
    const chunk = new Uint8Array(1000).fill(0x20);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const req = new Request(ENDPOINT, {
      method: 'POST',
      headers: { Host: HOST, Origin: `https://${HOST}`, 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);
    const { deps } = fakeDeps();
    expect((await handleLookup(req, deps)).status).toBe(413);
    expect(pulls).toBeLessThan(10);
    expect(cancelled).toBe(true);
  });

  it.each([
    ['not JSON', '{url:'],
    ['empty', ''],
    ['an array', JSON.stringify([SHOP_LINK])],
    ['a string', JSON.stringify(SHOP_LINK)],
    ['null', 'null'],
    ['missing url', JSON.stringify({ link: SHOP_LINK })],
    ['url not a string', JSON.stringify({ url: 42 })],
    ['url an object', JSON.stringify({ url: { href: SHOP_LINK } })],
    ['extra keys', JSON.stringify({ url: SHOP_LINK, more: 1 })],
    ['a __proto__ key', `{"url":"${SHOP_LINK}","__proto__":{"url":"x"}}`],
    ['only a __proto__ key', `{"__proto__":{"url":"${SHOP_LINK}"}}`],
  ])('refuses a body that is %s with 400 invalid_url', async (_label, body) => {
    const { deps, fetchPage } = fakeDeps();
    const res = await handleLookup(lookupRequest(body), deps);
    expect(await read(res)).toEqual({ status: 400, body: { error: 'invalid_url' } });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('refuses a body that is not valid UTF-8 with 400 invalid_url', async () => {
    const { deps } = fakeDeps();
    const bytes = new Uint8Array([0x7b, 0x22, 0x75, 0x72, 0x6c, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
    expect(await read(await handleLookup(lookupRequest(bytes), deps))).toEqual({ status: 400, body: { error: 'invalid_url' } });
  });
});

describe('handleLookup: link', () => {
  it.each([
    ['longer than 2048 characters', `${SHOP_LINK}?q=${'a'.repeat(2048)}`],
    ['not parseable', 'not a link'],
    ['http', 'http://www.ikea.com/us/en/p/x/'],
    ['ftp', 'ftp://www.ikea.com/x'],
    ['javascript', 'javascript:alert(1)'],
  ])('refuses a link that is %s with 400 invalid_url', async (_label, url) => {
    const { deps, fetchPage } = fakeDeps();
    expect(await read(await handleLookup(linkRequest(url), deps))).toEqual({ status: 400, body: { error: 'invalid_url' } });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('accepts a link of exactly 2048 characters', async () => {
    const url = SHOP_LINK + '?q=' + 'a'.repeat(2048 - SHOP_LINK.length - 3);
    expect(url.length).toBe(2048);
    const { deps } = fakeDeps();
    expect((await handleLookup(linkRequest(url), deps)).status).toBe(200);
  });

  it('refuses a link not on a shop with 400 unsupported_shop and no fetch', async () => {
    const { deps, fetchPage } = fakeDeps();
    const res = await handleLookup(linkRequest('https://example.com/x'), deps);
    expect(await read(res)).toEqual({ status: 400, body: { error: 'unsupported_shop' } });
    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe('handleLookup: rate limit', () => {
  it('answers 429 rate_limited with Retry-After when the limiter refuses, and does not fetch', async () => {
    const { deps, fetchPage } = fakeDeps({ limiter: { allow: () => ({ ok: false, retryAfterSec: 37 }) } });
    const res = await handleLookup(linkRequest(SHOP_LINK), deps);
    expect(res.headers.get('retry-after')).toBe('37');
    expect(await read(res)).toEqual({ status: 429, body: { error: 'rate_limited' } });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it.each<[string, unknown]>([
    ['0', 0],
    ['negative', -3],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string with a line break', '5\r\nSet-Cookie: x=1'],
    ['an object whose text throws', { toString: () => { throw new Error('bad'); } }],
  ])('answers 429 rate_limited without Retry-After when the limiter gives %s', async (_label, retryAfterSec) => {
    const { deps, log } = fakeDeps({ limiter: { allow: () => ({ ok: false, retryAfterSec }) as unknown as ReturnType<RateLimiter['allow']> } });
    const res = await handleLookup(linkRequest(SHOP_LINK), deps);
    expect(res.headers.get('retry-after')).toBeNull();
    expect(await read(res)).toEqual({ status: 429, body: { error: 'rate_limited' } });
    expect(loggedLine(log)).toEqual({ event: 'room_planner_lookup', shop: 'ikea', outcome: 'rate_limited' });
  });

  it('keys the limiter by the first x-forwarded-for entry, at the injected time', async () => {
    const { deps, allow } = fakeDeps({ now: () => 4242 });
    await handleLookup(linkRequest(SHOP_LINK, { 'x-forwarded-for': ' 203.0.113.9 , 10.0.0.1', 'x-real-ip': '198.51.100.1' }), deps);
    expect(allow).toHaveBeenCalledWith('203.0.113.9', 4242);
  });

  it('keys the limiter by x-real-ip when there is no x-forwarded-for', async () => {
    const { deps, allow } = fakeDeps();
    await handleLookup(linkRequest(SHOP_LINK, { 'x-real-ip': ' 198.51.100.1 ' }), deps);
    expect(allow).toHaveBeenCalledWith('198.51.100.1', 1_000);
  });

  it('keys the limiter by unknown when neither header is present', async () => {
    const { deps, allow } = fakeDeps();
    await handleLookup(linkRequest(SHOP_LINK), deps);
    expect(allow).toHaveBeenCalledWith('unknown', 1_000);
  });

  it('cuts a long limiter key to 64 characters', async () => {
    const { deps, allow } = fakeDeps();
    await handleLookup(linkRequest(SHOP_LINK, { 'x-forwarded-for': 'a'.repeat(5000) }), deps);
    expect(allow).toHaveBeenCalledWith('a'.repeat(64), 1_000);
  });

  it.each([
    ['a foreign origin', () => linkRequest(SHOP_LINK, { Origin: 'https://evil.example' })],
    ['a bad body', () => lookupRequest('{')],
    ['an invalid link', () => linkRequest('http://www.ikea.com/x')],
    ['a link not on a shop', () => linkRequest('https://example.com/x')],
  ])('does not charge the limiter for %s', async (_label, build) => {
    const { deps, allow } = fakeDeps();
    await handleLookup(build(), deps);
    expect(allow).not.toHaveBeenCalled();
  });

  it('uses one module-level limiter of 20 lookups by default', async () => {
    const { deps } = fakeDeps();
    const { limiter: _unused, ...withoutLimiter } = deps;
    void _unused;
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await handleLookup(linkRequest(SHOP_LINK, { 'x-forwarded-for': '192.0.2.77' }), withoutLimiter);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe('handleLookup: fetch and reader outcomes', () => {
  it.each<[FetchResult, number, string]>([
    [{ ok: false, reason: 'blocked' }, 502, 'blocked'],
    [{ ok: false, reason: 'unavailable' }, 502, 'unavailable'],
    [{ ok: false, reason: 'unsupported_shop' }, 400, 'unsupported_shop'],
  ])('maps fetch result %j to %i %s', async (result, status, error) => {
    const { deps } = fakeDeps({ fetchPage: async () => result });
    expect(await read(await handleLookup(linkRequest(SHOP_LINK), deps))).toEqual({ status, body: { error } });
    expect(reader).not.toHaveBeenCalled();
  });

  it('answers 422 not_a_product when the reader returns null', async () => {
    reader.mockReturnValue(null);
    const { deps } = fakeDeps();
    expect(await read(await handleLookup(linkRequest(SHOP_LINK), deps))).toEqual({ status: 422, body: { error: 'not_a_product' } });
  });

  it('answers 502 unavailable, saying nothing of the error, when fetchPage rejects', async () => {
    const { deps } = fakeDeps({ fetchPage: async () => Promise.reject(new Error('secret detail 10.0.0.5')) });
    const res = await handleLookup(linkRequest(SHOP_LINK), deps);
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(text).toBe(JSON.stringify({ error: 'unavailable' }));
  });

  it('answers 502 unavailable, saying nothing of the error, when the reader throws', async () => {
    reader.mockImplementation(() => {
      throw new Error('secret detail');
    });
    const { deps } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK), deps);
    expect(res.status).toBe(502);
    expect(await res.text()).toBe(JSON.stringify({ error: 'unavailable' }));
  });

  it('answers 502 unavailable when fetchPage resolves to something that is not a fetch result', async () => {
    const { deps } = fakeDeps({ fetchPage: async () => ({ ok: true }) as unknown as FetchResult });
    expect(await read(await handleLookup(linkRequest(SHOP_LINK), deps))).toEqual({ status: 502, body: { error: 'unavailable' } });
  });

  it('still answers when log throws', async () => {
    const { deps } = fakeDeps({
      log: () => {
        throw new Error('log down');
      },
    });
    expect((await handleLookup(linkRequest(SHOP_LINK), deps)).status).toBe(200);
  });
});

describe('handleLookup: response headers', () => {
  it.each([
    ['success', () => linkRequest(SHOP_LINK)],
    ['origin refusal', () => linkRequest(SHOP_LINK, { Origin: null })],
    ['body refusal', () => lookupRequest('{')],
    ['too large', () => linkRequest(SHOP_LINK, { 'Content-Length': '5000' })],
    ['not a shop', () => linkRequest('https://example.com/x')],
  ])('sets JSON, no-store and no CORS headers on %s', async (_label, build) => {
    const { deps } = fakeDeps();
    const res = await handleLookup(build(), deps);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect([...res.headers.keys()].filter((k) => k.startsWith('access-control-'))).toEqual([]);
  });

  it('sets the same headers on a rate-limited answer', async () => {
    const { deps } = fakeDeps({ limiter: { allow: () => ({ ok: false, retryAfterSec: 5 }) } });
    const res = await handleLookup(linkRequest(SHOP_LINK), deps);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect([...res.headers.keys()].filter((k) => k.startsWith('access-control-'))).toEqual([]);
  });
});

describe('handleLookup: log line', () => {
  it.each<[string, () => Request, Partial<LookupDeps>, string | null, string]>([
    ['success', () => linkRequest(SHOP_LINK), {}, 'ikea', 'ok'],
    ['no origin', () => linkRequest(SHOP_LINK, { Origin: null }), {}, null, 'unavailable'],
    ['bad body', () => lookupRequest('{'), {}, null, 'invalid_url'],
    ['too large', () => linkRequest(SHOP_LINK, { 'Content-Length': '5000' }), {}, null, 'invalid_url'],
    ['not a shop', () => linkRequest('https://example.com/x'), {}, null, 'unsupported_shop'],
    ['rate limited', () => linkRequest('https://www.wayfair.com/p.html'), { limiter: { allow: () => ({ ok: false, retryAfterSec: 1 }) } }, 'wayfair', 'rate_limited'],
    ['blocked', () => linkRequest('https://a.co/d/abc'), { fetchPage: async () => ({ ok: false, reason: 'blocked' }) }, 'amazon', 'blocked'],
    ['fetch throws', () => linkRequest(SHOP_LINK), { fetchPage: () => Promise.reject(new Error('x')) }, 'ikea', 'unavailable'],
  ])('logs one line for %s', async (_label, build, overrides, shop, outcome) => {
    const { deps, log } = fakeDeps(overrides);
    await handleLookup(build(), deps);
    expect(loggedLine(log)).toEqual({ event: 'room_planner_lookup', shop, outcome });
  });

  it('logs exactly the event string shape, never the link or the address', async () => {
    const { deps, log } = fakeDeps();
    await handleLookup(linkRequest(SHOP_LINK, { 'x-forwarded-for': '203.0.113.9' }), deps);
    const line = log.mock.calls[0][0];
    expect(line).toBe(JSON.stringify({ event: 'room_planner_lookup', shop: 'ikea', outcome: 'ok' }));
    expect(line).not.toContain('ikea.com');
    expect(line).not.toContain('203.0.113.9');
  });

  it('logs not_a_product when the reader finds no product', async () => {
    reader.mockReturnValue(null);
    const { deps, log } = fakeDeps();
    await handleLookup(linkRequest(SHOP_LINK), deps);
    expect(loggedLine(log)).toEqual({ event: 'room_planner_lookup', shop: 'ikea', outcome: 'not_a_product' });
  });

  it('logs with console.info by default', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const { deps } = fakeDeps();
      const { log: _unused, ...withoutLog } = deps;
      void _unused;
      await handleLookup(linkRequest(SHOP_LINK, { Origin: null }), withoutLog);
      expect(info).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith(JSON.stringify({ event: 'room_planner_lookup', shop: null, outcome: 'unavailable' }));
    } finally {
      info.mockRestore();
    }
  });
});

describe('handleLookup: order of checks', () => {
  it('checks the origin before the body', async () => {
    const { deps } = fakeDeps();
    expect((await handleLookup(lookupRequest('{', { Origin: 'https://evil.example' }), deps)).status).toBe(403);
  });

  it('checks the content type before the body size', async () => {
    const { deps } = fakeDeps();
    const res = await handleLookup(linkRequest(SHOP_LINK, { 'Content-Type': 'text/plain', 'Content-Length': '9999' }), deps);
    expect(res.status).toBe(400);
  });

  it('checks the link before the shop list', async () => {
    const { deps } = fakeDeps();
    expect(await read(await handleLookup(linkRequest('http://example.com/x'), deps))).toEqual({ status: 400, body: { error: 'invalid_url' } });
  });

  it('checks the shop list before the limiter', async () => {
    const { deps, allow } = fakeDeps({ limiter: { allow: vi.fn(() => ({ ok: false as const, retryAfterSec: 9 })) } });
    expect((await handleLookup(linkRequest('https://example.com/x'), deps)).status).toBe(400);
    expect(allow).not.toHaveBeenCalled();
  });

  it('charges the limiter before fetching', async () => {
    const order: string[] = [];
    const { deps } = fakeDeps({
      limiter: { allow: () => (order.push('limiter'), { ok: true }) },
      fetchPage: async () => (order.push('fetch'), { ok: true, html: '' }),
    });
    await handleLookup(linkRequest(SHOP_LINK), deps);
    expect(order).toEqual(['limiter', 'fetch']);
  });
});

describe('route', () => {
  it('exports POST as its only method, with runtime nodejs, dynamic force-dynamic and maxDuration 20', async () => {
    const route = await import('../../app/api/room-planner/lookup/route');
    expect(Object.keys(route).sort()).toEqual(['POST', 'dynamic', 'maxDuration', 'runtime']);
    expect(route.runtime).toBe('nodejs');
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.maxDuration).toBe(20);
  });

  it('POST hands the request to the handler', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const { POST } = await import('../../app/api/room-planner/lookup/route');
      const res = await POST(linkRequest(SHOP_LINK, { Origin: null }));
      expect(await read(res)).toEqual({ status: 403, body: { error: 'unavailable' } });
    } finally {
      info.mockRestore();
    }
  });
});
