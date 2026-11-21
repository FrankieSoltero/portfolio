// @vitest-environment node
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOOKUP_LIMITS } from '../lookup/contract';
import { decodeBody, fetchShopPage, isPublicAddress, pinnedLookup, type FetchDeps } from './safeFetch';

type FakeResponse = Awaited<ReturnType<FetchDeps['request']>>;
type Target = Parameters<FetchDeps['request']>[0];

const PUBLIC = { address: '104.16.0.1', family: 4 as const };
const HTML = '<html><head><title>Chair</title></head><body>A chair</body></html>';
const HTML_TYPE = { 'content-type': 'text/html; charset=utf-8' };
const SENT_HEADERS = {
  'User-Agent': 'RoomPlannerLinkPreview/1.0',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, identity',
};

/** A body that yields each part as one UTF-8 chunk. */
async function* chunks(...parts: (string | Uint8Array)[]): AsyncIterable<Uint8Array> {
  for (const part of parts) yield typeof part === 'string' ? new TextEncoder().encode(part) : part;
}

function page(html: string, headers: Record<string, string | undefined> = HTML_TYPE): FakeResponse {
  return { status: 200, headers, body: chunks(html) };
}

function status(code: number, headers: Record<string, string | undefined> = {}): FakeResponse {
  return { status: code, headers, body: chunks() };
}

function redirect(location: string, code = 302): FakeResponse {
  return status(code, { location });
}

/**
 * Fake deps: `resolve` answers with `addresses` (or the next of `answers`), `request` answers
 * with the next of `responses` (an Error is thrown), and `now` stays at 0 unless replaced.
 */
function fakeDeps(
  responses: (FakeResponse | Error)[],
  answers: { address: string; family: 4 | 6 }[][] = [],
) {
  const queue = [...responses];
  const answerQueue = [...answers];
  const resolve = vi.fn<FetchDeps['resolve']>(async () => answerQueue.shift() ?? [PUBLIC]);
  const request = vi.fn<(target: Target) => Promise<FakeResponse>>(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('no more fake responses');
    if (next instanceof Error) throw next;
    return next;
  });
  const now = vi.fn(() => 0);
  return { resolve, request, now };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('isPublicAddress', () => {
  it.each([
    ['0.0.0.0', 4],
    ['10.1.2.3', 4],
    ['100.64.0.1', 4],
    ['127.0.0.1', 4],
    ['169.254.169.254', 4],
    ['172.16.0.1', 4],
    ['172.31.255.255', 4],
    ['192.0.0.1', 4],
    ['192.0.2.1', 4],
    ['192.168.1.1', 4],
    ['198.18.0.1', 4],
    ['198.51.100.1', 4],
    ['203.0.113.1', 4],
    ['224.0.0.1', 4],
    ['255.255.255.255', 4],
    ['::', 6],
    ['::1', 6],
    ['::ffff:8.8.8.8', 6],
    ['64:ff9b::1', 6],
    ['100::1', 6],
    ['2001:db8::1', 6],
    ['fc00::1', 6],
    ['fd12::1', 6],
    ['fe80::1', 6],
    ['ff02::1', 6],
    ['not-an-address', 4],
    ['not-an-address', 6],
  ] as const)('refuses %s (IPv%i)', (address, family) => {
    expect(isPublicAddress(address, family)).toBe(false);
  });

  it.each([
    ['8.8.8.8', 4],
    ['172.32.0.1', 4],
    ['104.16.0.1', 4],
    ['2606:4700::1', 6],
  ] as const)('accepts %s (IPv%i)', (address, family) => {
    expect(isPublicAddress(address, family)).toBe(true);
  });

  it.each([
    ['192.88.99.1', 4],
    ['240.0.0.1', 4],
    ['2001::1', 6],
    ['2002:a00:1::1', 6],
    ['3fff::1', 6],
    ['::ffff:808:808', 6],
  ] as const)('also refuses the special range holding %s (IPv%i)', (address, family) => {
    expect(isPublicAddress(address, family)).toBe(false);
  });

  it('refuses a zoned address', () => {
    expect(isPublicAddress('2606:4700::1%eth0', 6)).toBe(false);
  });

  it('refuses an address given with the wrong family', () => {
    expect(isPublicAddress('8.8.8.8', 6)).toBe(false);
    expect(isPublicAddress('2606:4700::1', 4)).toBe(false);
  });
});

describe('fetchShopPage', () => {
  it('returns the page and requests the resolved address once', async () => {
    const deps = fakeDeps([page(HTML)]);
    const result = await fetchShopPage('https://www.ikea.com/us/en/p/chair-123/', deps);
    expect(result).toEqual({ ok: true, html: HTML });
    expect(deps.resolve).toHaveBeenCalledWith('www.ikea.com');
    expect(deps.request).toHaveBeenCalledTimes(1);
    const target = deps.request.mock.calls[0][0];
    expect(target.url.href).toBe('https://www.ikea.com/us/en/p/chair-123/');
    expect(target.address).toBe('104.16.0.1');
    expect(target.family).toBe(4);
  });

  it('decodes the body as UTF-8 across chunk boundaries', async () => {
    const bytes = new TextEncoder().encode('<p>Café</p>');
    const deps = fakeDeps([{ status: 200, headers: HTML_TYPE, body: chunks(bytes.slice(0, 7), bytes.slice(7)) }]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: true, html: '<p>Café</p>' });
  });

  it.each([
    ['not https', 'http://www.ikea.com/x'],
    ['a port', 'https://www.ikea.com:8443/x'],
    ['credentials', 'https://u:p@www.ikea.com/x'],
    ['a user name only', 'https://u@www.ikea.com/x'],
    ['a password only', 'https://:p@www.ikea.com/x'],
    ['not a shop', 'https://example.com/'],
    ['a look-alike host', 'https://ikea.com.evil.example/'],
    ['an IP literal', 'https://104.16.0.1/'],
    ['an IPv6 literal', 'https://[2606:4700::1]/'],
    ['not a URL', 'not a url'],
  ])('refuses a link with %s as unsupported_shop without resolving or requesting', async (_case, url) => {
    const deps = fakeDeps([page(HTML)]);
    expect(await fetchShopPage(url, deps)).toEqual({ ok: false, reason: 'unsupported_shop' });
    expect(deps.resolve).not.toHaveBeenCalled();
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('refuses a private address without requesting', async () => {
    const deps = fakeDeps([page(HTML)], [[{ address: '10.0.0.5', family: 4 }]]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(deps.request).not.toHaveBeenCalled();
  });

  it.each([
    ['public first', [PUBLIC, { address: '127.0.0.1', family: 4 as const }]],
    ['private first', [{ address: '::1', family: 6 as const }, PUBLIC]],
  ])('refuses mixed public and private addresses (%s) without requesting', async (_case, answer) => {
    const deps = fakeDeps([page(HTML)], [answer]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('is unavailable when resolving fails', async () => {
    const deps = fakeDeps([page(HTML)]);
    deps.resolve.mockRejectedValueOnce(new Error('ENOTFOUND'));
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('is unavailable when resolving gives no address', async () => {
    const deps = fakeDeps([page(HTML)], [[]]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('follows a redirect inside the shop, resolving the second hop again', async () => {
    const deps = fakeDeps([redirect('https://www.ikea.com/us/en/p/x/', 301), page(HTML)]);
    expect(await fetchShopPage('https://www.ikea.com/p/x', deps)).toEqual({ ok: true, html: HTML });
    expect(deps.resolve).toHaveBeenCalledTimes(2);
    expect(deps.request).toHaveBeenCalledTimes(2);
    expect(deps.request.mock.calls[1][0].url.href).toBe('https://www.ikea.com/us/en/p/x/');
  });

  it('checks the second hop address again and refuses a private one', async () => {
    const deps = fakeDeps(
      [redirect('https://www.ikea.com/us/en/p/x/', 301), page(HTML)],
      [[PUBLIC], [{ address: '169.254.169.254', family: 4 }]],
    );
    expect(await fetchShopPage('https://www.ikea.com/p/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it('resolves a relative redirect against the current URL', async () => {
    const deps = fakeDeps([redirect('/us/en/p/x/'), page(HTML)]);
    expect(await fetchShopPage('https://www.ikea.com/p/x?a=1', deps)).toEqual({ ok: true, html: HTML });
    expect(deps.request.mock.calls[1][0].url.href).toBe('https://www.ikea.com/us/en/p/x/');
  });

  it("follows a redirect to another shop's host", async () => {
    const deps = fakeDeps([redirect('https://www.wayfair.com/furniture/pdp/x.html'), page(HTML)]);
    expect(await fetchShopPage('https://a.co/d/abc', deps)).toEqual({ ok: true, html: HTML });
    expect(deps.resolve).toHaveBeenLastCalledWith('www.wayfair.com');
    expect(deps.request.mock.calls[1][0].url.hostname).toBe('www.wayfair.com');
  });

  it.each([
    ['off the shop list', 'https://evil.example/'],
    ['to http', 'http://www.ikea.com/x'],
    ['to a port', 'https://www.ikea.com:8443/x'],
    ['with credentials', 'https://u:p@www.ikea.com/x'],
    ['to an IP literal', 'https://127.0.0.1/'],
    ['to a protocol-relative address off the list', '//evil.example/x'],
  ])('refuses a redirect %s without resolving or requesting it', async (_case, location) => {
    const deps = fakeDeps([redirect(location), page(HTML)]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(deps.resolve).toHaveBeenCalledTimes(1);
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it.each([301, 302, 303, 307, 308])('follows a %i redirect', async (code) => {
    const deps = fakeDeps([redirect('/y', code), page(HTML)]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: true, html: HTML });
  });

  it('follows 3 redirects but not a 4th', async () => {
    const deps = fakeDeps([redirect('/1'), redirect('/2'), redirect('/3'), redirect('/4'), page(HTML)]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(deps.request).toHaveBeenCalledTimes(4);
    expect(deps.request.mock.calls[3][0].url.pathname).toBe('/3');
  });

  it('accepts a page after exactly 3 redirects', async () => {
    const deps = fakeDeps([redirect('/1'), redirect('/2'), redirect('/3'), page(HTML)]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: true, html: HTML });
  });

  it('is unavailable for a redirect without a Location', async () => {
    const deps = fakeDeps([status(302), page(HTML)]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(deps.request).toHaveBeenCalledTimes(1);
  });

  it.each([403, 429, 503])('reports status %i as blocked', async (code) => {
    const deps = fakeDeps([status(code, HTML_TYPE)]);
    expect(await fetchShopPage('https://www.amazon.com/dp/B0', deps)).toEqual({ ok: false, reason: 'blocked' });
  });

  it.each(['<p>Contact api-services-support@amazon.com</p>', '<form action="/errors/validateCaptcha">'])(
    'reports a challenge page as blocked: %s',
    async (html) => {
      const deps = fakeDeps([page(html)]);
      expect(await fetchShopPage('https://www.amazon.com/dp/B0', deps)).toEqual({ ok: false, reason: 'blocked' });
    },
  );

  it.each([404, 410, 500, 204, 300, 304])('reports status %i as unavailable', async (code) => {
    const deps = fakeDeps([status(code, HTML_TYPE)]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it.each([
    ['application/json', { 'content-type': 'application/json' }],
    ['no content type', {}],
    ['text/plain', { 'content-type': 'text/plain' }],
  ])('refuses a 200 with %s', async (_case, headers) => {
    const deps = fakeDeps([page(HTML, headers)]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it.each(['TEXT/HTML', 'application/xhtml+xml; charset=utf-8'])('accepts content type %s', async (type) => {
    const deps = fakeDeps([page(HTML, { 'content-type': type })]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: true, html: HTML });
  });

  it('stops reading a body over 4 MiB and aborts the request', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let pulled = 0;
    async function* huge(): AsyncIterable<Uint8Array> {
      for (let i = 0; i < 100; i += 1) {
        pulled += 1;
        yield chunk;
      }
    }
    const deps = fakeDeps([{ status: 200, headers: HTML_TYPE, body: huge() }]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(pulled).toBe(5);
    expect(deps.request.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it('accepts a body of exactly 4 MiB', async () => {
    const body = new Uint8Array(LOOKUP_LIMITS.pageMax).fill(0x61);
    const deps = fakeDeps([{ status: 200, headers: HTML_TYPE, body: chunks(body) }]);
    const result = await fetchShopPage('https://www.ikea.com/x', deps);
    expect(result.ok).toBe(true);
  });

  it('is unavailable and aborts when the time passes 8000 ms during the body', async () => {
    let pulled = 0;
    const deps = fakeDeps([]);
    async function* slow(): AsyncIterable<Uint8Array> {
      for (let i = 0; i < 10; i += 1) {
        pulled += 1;
        if (i === 1) deps.now.mockReturnValue(8001);
        yield new TextEncoder().encode('<p>');
      }
    }
    deps.request.mockResolvedValueOnce({ status: 200, headers: HTML_TYPE, body: slow() });
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(pulled).toBe(2);
    expect(deps.request.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it('is unavailable when the time passes 8000 ms across redirects', async () => {
    const deps = fakeDeps([redirect('/1'), page(HTML)]);
    deps.request.mockImplementationOnce(async () => {
      deps.now.mockReturnValue(8001);
      return redirect('/1');
    });
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    expect(deps.request).toHaveBeenCalledTimes(1);
    expect(deps.resolve).toHaveBeenCalledTimes(1);
    expect(deps.request.mock.calls[0][0].signal.aborted).toBe(true);
  });

  it('accepts a page finished at exactly 8000 ms', async () => {
    const deps = fakeDeps([page(HTML)]);
    deps.now.mockReturnValueOnce(0).mockReturnValue(8000);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: true, html: HTML });
  });

  it('gives up on a request that never answers once 8000 ms pass, aborting the signal', async () => {
    vi.useFakeTimers();
    const deps = fakeDeps([]);
    deps.now.mockImplementation(() => Date.now());
    let seen: AbortSignal | undefined;
    deps.request.mockImplementationOnce((target) => {
      seen = target.signal;
      return new Promise(() => {});
    });
    const pending = fetchShopPage('https://www.ikea.com/x', deps);
    await vi.advanceTimersByTimeAsync(LOOKUP_LIMITS.timeoutMs);
    expect(await pending).toEqual({ ok: false, reason: 'unavailable' });
    expect(seen?.aborted).toBe(true);
  });

  it('gives up on a resolve that never answers once 8000 ms pass', async () => {
    vi.useFakeTimers();
    const deps = fakeDeps([page(HTML)]);
    deps.now.mockImplementation(() => Date.now());
    deps.resolve.mockImplementationOnce(() => new Promise(() => {}));
    const pending = fetchShopPage('https://www.ikea.com/x', deps);
    await vi.advanceTimersByTimeAsync(LOOKUP_LIMITS.timeoutMs);
    expect(await pending).toEqual({ ok: false, reason: 'unavailable' });
    expect(deps.request).not.toHaveBeenCalled();
  });

  it('is unavailable when the request throws', async () => {
    const deps = fakeDeps([new Error('ECONNRESET')]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('is unavailable when the body throws', async () => {
    async function* broken(): AsyncIterable<Uint8Array> {
      yield new TextEncoder().encode('<p>');
      throw new Error('socket hang up');
    }
    const deps = fakeDeps([{ status: 200, headers: HTML_TYPE, body: broken() }]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('never throws, even when an injected dependency throws synchronously', async () => {
    const deps = fakeDeps([page(HTML)]);
    deps.now.mockImplementation(() => {
      throw new Error('clock broke');
    });
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('never throws, even when reading the deps throws', async () => {
    const deps = {
      get resolve(): FetchDeps['resolve'] {
        throw new Error('getter broke');
      },
    } as Partial<FetchDeps>;
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('destroys a redirect body that is a stream before following the redirect', async () => {
    const moved = Readable.from([Buffer.from('Moved')]);
    const deps = fakeDeps([{ status: 301, headers: { location: '/y' }, body: moved }, page(HTML)]);
    const destroyedWhenNextResolved: boolean[] = [];
    deps.resolve.mockImplementation(async () => {
      destroyedWhenNextResolved.push(moved.destroyed);
      return [PUBLIC];
    });
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: true, html: HTML });
    expect(destroyedWhenNextResolved).toEqual([false, true]);
  });

  it('returns the iterator of any other redirect body before following the redirect', async () => {
    const returned = vi.fn(async () => ({ done: true as const, value: undefined }));
    const body: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true as const, value: undefined }), return: returned }),
    };
    const deps = fakeDeps([{ status: 302, headers: { location: '/y' }, body }, page(HTML)]);
    const returnedWhenNextResolved: number[] = [];
    deps.resolve.mockImplementation(async () => {
      returnedWhenNextResolved.push(returned.mock.calls.length);
      return [PUBLIC];
    });
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: true, html: HTML });
    expect(returnedWhenNextResolved).toEqual([0, 1]);
  });

  it('sends exactly the four reader headers on every request, with no cookie or referer', async () => {
    const deps = fakeDeps([
      { status: 302, headers: { location: '/y', 'set-cookie': 'session=1' }, body: chunks() },
      page(HTML),
    ]);
    await fetchShopPage('https://www.ikea.com/x', deps);
    expect(deps.request).toHaveBeenCalledTimes(2);
    for (const [target] of deps.request.mock.calls) {
      expect(target.headers).toEqual(SENT_HEADERS);
    }
  });
});

describe('pinnedLookup', () => {
  it('answers every lookup with the checked address, whatever host is asked for', () => {
    const lookup = pinnedLookup('104.16.0.1', 4);
    const single = vi.fn();
    lookup('evil.example', {}, single);
    expect(single).toHaveBeenCalledWith(null, '104.16.0.1', 4);
    const all = vi.fn();
    lookup('evil.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: '104.16.0.1', family: 4 }]);
  });
});

describe('decodeBody', () => {
  it('passes an identity or unencoded body through', async () => {
    for (const encoding of [undefined, 'identity']) {
      const body = decodeBody(Readable.from([Buffer.from(HTML)]), encoding);
      expect(body).not.toBeNull();
      const parts: Buffer[] = [];
      for await (const part of body!) parts.push(Buffer.from(part));
      expect(Buffer.concat(parts).toString('utf8')).toBe(HTML);
    }
  });

  it('gunzips a gzip body', async () => {
    const body = decodeBody(Readable.from([gzipSync(HTML)]), ' GZIP ');
    const parts: Buffer[] = [];
    for await (const part of body!) parts.push(Buffer.from(part));
    expect(Buffer.concat(parts).toString('utf8')).toBe(HTML);
  });

  it.each(['br', 'deflate', 'gzip, br', 'x-gzip'])('refuses the encoding %s', (encoding) => {
    expect(decodeBody(Readable.from([Buffer.from(HTML)]), encoding)).toBeNull();
  });

  it('cuts a gzip bomb off at the 4 MiB cap', async () => {
    const bomb = gzipSync(Buffer.alloc(64 * 1024 * 1024));
    const raw = Readable.from([bomb]);
    const body = decodeBody(raw, 'gzip')!;
    const deps = fakeDeps([{ status: 200, headers: HTML_TYPE, body }]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    await new Promise((done) => setImmediate(done));
    expect((body as Readable).destroyed).toBe(true);
    expect(raw.destroyed).toBe(true);
  });

  it('cuts off a gzip body that inflates to nothing once 4 MiB of raw input are read', async () => {
    // A valid gzip header, then empty stored deflate blocks (`00 00 00 ff ff`), which inflate to
    // zero bytes. Made lazily in 16 KiB chunks, 16 MiB at most, so no large buffer is allocated.
    const header = Buffer.from([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 0, 0x03]);
    const emptyBlocks = Buffer.alloc(3277 * 5);
    for (let i = 0; i < emptyBlocks.length; i += 5) emptyBlocks.writeUInt16BE(0xffff, i + 3);
    let produced = 0;
    async function* endless(): AsyncIterable<Buffer> {
      produced += header.length;
      yield header;
      for (let i = 0; i < 1024; i += 1) {
        produced += emptyBlocks.length;
        yield emptyBlocks;
      }
    }
    const raw = Readable.from(endless());
    const body = decodeBody(raw, 'gzip')!;
    const deps = fakeDeps([{ status: 200, headers: HTML_TYPE, body }]);
    expect(await fetchShopPage('https://www.ikea.com/x', deps)).toEqual({ ok: false, reason: 'unavailable' });
    await new Promise((done) => setImmediate(done));
    expect(produced).toBeGreaterThan(LOOKUP_LIMITS.pageMax);
    expect(produced).toBeLessThanOrEqual(LOOKUP_LIMITS.pageMax + 512 * 1024);
    expect(raw.destroyed).toBe(true);
  });
});
