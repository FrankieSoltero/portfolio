import { afterEach, describe, expect, it, vi } from 'vitest';
import { recipeColours, styleFromText } from '../domain/furniture/fromProduct';
import type { PhotoColours } from '../domain/furniture/photoColours';
import { defaultColours, TYPICAL_SIZE } from '../domain/furniture/recipe';
import { LOOKUP_ERROR_CODES, LOOKUP_PATH, SIZE_NOTE_UNLABELLED, type LookupErrorCode, type ProductFields } from '../lookup/contract';
import { capProductText, LookupError } from './productLookup';
import { createRemoteProductLookup, remoteProductLookup, type RemoteLookupDeps } from './remoteProductLookup';

// capProductText is wrapped in a spy (still doing its real work) so the text-caps row can see it is used.
vi.mock('./productLookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./productLookup')>();
  return { ...actual, capProductText: vi.fn(actual.capProductText) };
});

const LINK = 'https://www.ikea.com/us/en/p/jadier-loveseat-s123/';
const PHOTO = 'https://m.media-amazon.com/images/I/61sofa.jpg';
const SOFA_NAME = 'Jadier 66" Upholstered Loveseat Square Sofa';
const NO_COLOURS = { main: null, accent: null };

/** Colours as the tables in fromProduct.ts give them. */
const NAVY = '#2f4057';
const BLACK_METAL = '#2b2b2d';
const BRASS = '#b08d57';

/** Product fields as the route would answer them: a sofa with all three sizes and a photo. */
function fields(overrides: Partial<ProductFields> = {}): ProductFields {
  return {
    name: SOFA_NAME,
    description: '',
    price: 499,
    imageUrl: PHOTO,
    w: 66,
    d: 34,
    h: 32,
    sizeNote: null,
    ...overrides,
  };
}

/** A response whose body is `body` as JSON. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A lookup with a fake fetch answering `response` and a fake photo sampler answering `photo`. */
function setUp(response: () => Response = () => jsonResponse(200, fields()), photo: PhotoColours = NO_COLOURS) {
  const fetch = vi.fn<RemoteLookupDeps['fetch']>(async () => response());
  const samplePhoto = vi.fn<RemoteLookupDeps['samplePhoto']>(async () => photo);
  return { fetch, samplePhoto, lookup: createRemoteProductLookup({ fetch, samplePhoto }) };
}

/** The error `promise` rejects with; fails the test when it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected the lookup to reject');
}

/** Expects `promise` to reject with a LookupError carrying `code`. */
async function expectLookupError(promise: Promise<unknown>, code: LookupErrorCode): Promise<void> {
  const err = await rejection(promise);
  expect(err).toBeInstanceOf(LookupError);
  expect((err as LookupError).code).toBe(code);
}

/** A fetch that never answers but rejects with the signal's reason when it aborts, as fetch does. */
function abortableFetch() {
  return vi.fn<RemoteLookupDeps['fetch']>(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) reject(signal.reason);
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('remoteProductLookup: before the request', () => {
  it.each(['', 'javascript:alert(1)', 'sofa'])('refuses something that is not a link, with no request: %j', async (raw) => {
    const { fetch, lookup } = setUp();
    await expectLookupError(lookup.lookup(raw), 'invalid_url');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['https://example.com/sofa', 'https://ikea.com.evil.example/p/x', 'https://evilikea.com/p/x'])(
    'refuses a link that is not from a supported shop, with no request: %s',
    async (raw) => {
      const { fetch, lookup } = setUp();
      await expectLookupError(lookup.lookup(raw), 'unsupported_shop');
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe('remoteProductLookup: the request', () => {
  it('posts the link once to the lookup route as JSON, without credentials, with the signal', async () => {
    const { fetch, lookup } = setUp();
    const controller = new AbortController();
    await lookup.lookup(LINK, { signal: controller.signal });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [path, init] = fetch.mock.calls[0];
    expect(path).toBe(LOOKUP_PATH);
    expect(init).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: LINK }),
      credentials: 'omit',
      signal: controller.signal,
    });
    expect(init?.signal).toBe(controller.signal);
  });

  it.each(['  www.ikea.com/us/en/p/x/?a=1 ', 'https://u:p@www.ikea.com/us/en/p/x/?a=1'])(
    'sends the normalised link (https added, spaces trimmed, credentials removed): %j',
    async (raw) => {
      const { fetch, lookup } = setUp();
      await lookup.lookup(raw);
      expect(fetch.mock.calls[0][1]?.body).toBe(JSON.stringify({ url: 'https://www.ikea.com/us/en/p/x/?a=1' }));
    },
  );

  it.each(['http://www.ikea.com/us/en/p/x/', 'http://www.ikea.com:80/us/en/p/x/', 'HTTP://www.ikea.com/us/en/p/x/'])(
    'upgrades an http shop link to https, posts it and keeps it as the source link: %s',
    async (raw) => {
      const { fetch, lookup } = setUp();
      const preview = await lookup.lookup(raw);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][1]?.body).toBe(JSON.stringify({ url: 'https://www.ikea.com/us/en/p/x/' }));
      expect(preview.sourceUrl).toBe('https://www.ikea.com/us/en/p/x/');
    },
  );

  it.each(['http://www.ikea.com:8080/x', 'http://www.ikea.com:443/x'])(
    'refuses an http shop link with its own port as unsupported, with no request: %s',
    async (raw) => {
      const { fetch, lookup } = setUp();
      await expectLookupError(lookup.lookup(raw), 'unsupported_shop');
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

describe('remoteProductLookup: errors from the route', () => {
  const STATUS: Record<LookupErrorCode, number> = {
    invalid_url: 400,
    unsupported_shop: 400,
    blocked: 502,
    not_a_product: 422,
    unavailable: 502,
    rate_limited: 429,
  };

  it.each(LOOKUP_ERROR_CODES)('turns an error answer naming %s into that LookupError', async (code) => {
    const { lookup } = setUp(() => jsonResponse(STATUS[code], { error: code }));
    await expectLookupError(lookup.lookup(LINK), code);
  });

  it.each([
    ['an unknown code', () => jsonResponse(500, { error: 'exploded' })],
    ['an inherited property name as the code', () => jsonResponse(400, { error: 'toString' })],
    ['an object with no code', () => jsonResponse(503, {})],
    ['a bare string', () => jsonResponse(500, 'blocked')],
    ['null', () => jsonResponse(500, null)],
    ['a body that is not JSON', () => new Response('<html>Bad gateway</html>', { status: 502 })],
    ['an empty body', () => new Response(null, { status: 504 })],
  ])('treats an error answer with %s as unavailable', async (_label, response) => {
    const { lookup } = setUp(response);
    await expectLookupError(lookup.lookup(LINK), 'unavailable');
  });

  it('treats a network failure as unavailable', async () => {
    const { fetch, lookup } = setUp();
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expectLookupError(lookup.lookup(LINK), 'unavailable');
  });

  it.each([
    ['a body that is not JSON', () => new Response('not json', { status: 200 })],
    ['null', () => jsonResponse(200, null)],
    ['an extra key', () => jsonResponse(200, { ...fields(), extra: 1 })],
    ['a missing key', () => jsonResponse(200, { name: SOFA_NAME })],
    ['an empty name', () => jsonResponse(200, fields({ name: '' }))],
    ['a photo on a foreign host', () => jsonResponse(200, fields({ imageUrl: 'https://evil.example/sofa.jpg' }))],
    ['a size out of range', () => jsonResponse(200, fields({ w: 20000 }))],
    ['an error code', () => jsonResponse(200, { error: 'blocked' })],
  ])('treats a success answer with %s as unavailable', async (_label, response) => {
    const { samplePhoto, lookup } = setUp(response);
    await expectLookupError(lookup.lookup(LINK), 'unavailable');
    expect(samplePhoto).not.toHaveBeenCalled();
  });

  it('never logs anything, so never the link', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const { fetch, lookup } = setUp(() => jsonResponse(502, { error: 'blocked' }));
    await rejection(lookup.lookup(LINK));
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await rejection(lookup.lookup(LINK));
    await lookup.lookup(LINK).catch(() => {});
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('remoteProductLookup: aborting', () => {
  it('lets the abort error of the request through rather than a LookupError', async () => {
    const fetch = abortableFetch();
    const lookup = createRemoteProductLookup({ fetch, samplePhoto: vi.fn() });
    const controller = new AbortController();
    const pending = rejection(lookup.lookup(LINK, { signal: controller.signal }));
    controller.abort();
    const err = await pending;
    expect(err).not.toBeInstanceOf(LookupError);
    expect(err).toBe(controller.signal.reason);
    expect((err as DOMException).name).toBe('AbortError');
  });

  it('lets the abort error through when the signal was already aborted', async () => {
    const fetch = abortableFetch();
    const lookup = createRemoteProductLookup({ fetch, samplePhoto: vi.fn() });
    const controller = new AbortController();
    controller.abort();
    const err = await rejection(lookup.lookup(LINK, { signal: controller.signal }));
    expect(err).not.toBeInstanceOf(LookupError);
    expect((err as DOMException).name).toBe('AbortError');
  });

  it('rejects with the abort error when the signal aborts while the photo is sampled', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<RemoteLookupDeps['fetch']>(async () => jsonResponse(200, fields()));
    const samplePhoto = vi.fn<RemoteLookupDeps['samplePhoto']>(async () => {
      controller.abort();
      return NO_COLOURS;
    });
    const lookup = createRemoteProductLookup({ fetch, samplePhoto });
    const err = await rejection(lookup.lookup(LINK, { signal: controller.signal }));
    expect(err).not.toBeInstanceOf(LookupError);
    expect((err as DOMException).name).toBe('AbortError');
  });

  it('lets the abort error through when the signal aborts while an error answer is read', async () => {
    const controller = new AbortController();
    const signal = controller.signal;
    // A body that never ends but errors with the signal's reason on an abort, as fetch's body does.
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        signal.addEventListener('abort', () => stream.error(signal.reason), { once: true });
      },
    });
    const fetch = vi.fn<RemoteLookupDeps['fetch']>(async () => new Response(body, { status: 502 }));
    const lookup = createRemoteProductLookup({ fetch, samplePhoto: vi.fn() });
    const pending = rejection(lookup.lookup(LINK, { signal }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    controller.abort();
    const err = await pending;
    expect(err).not.toBeInstanceOf(LookupError);
    expect(err).toBe(signal.reason);
  });

  it('rejects with the abort error when the photo sampler rejects after an abort', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<RemoteLookupDeps['fetch']>(async () => jsonResponse(200, fields()));
    const samplePhoto = vi.fn<RemoteLookupDeps['samplePhoto']>(async () => {
      controller.abort();
      throw new Error('photo load failed');
    });
    const lookup = createRemoteProductLookup({ fetch, samplePhoto });
    const err = await rejection(lookup.lookup(LINK, { signal: controller.signal }));
    expect(err).not.toBeInstanceOf(LookupError);
    expect((err as DOMException).name).toBe('AbortError');
  });
});

describe('remoteProductLookup: kind', () => {
  it('reads the kind from the name', async () => {
    const { lookup } = setUp();
    const preview = await lookup.lookup(LINK);
    expect(preview.kind).toBe('sofa');
    expect(preview.kindFound).toBe(true);
  });

  it('falls back to a box when no rule matches the name', async () => {
    const { lookup } = setUp(() => jsonResponse(200, fields({ name: 'Mystery Object 3000', w: null, d: null, h: null })));
    const preview = await lookup.lookup(LINK);
    expect(preview.kind).toBe('box');
    expect(preview.kindFound).toBe(false);
    expect({ w: preview.w, d: preview.d, h: preview.h }).toEqual(TYPICAL_SIZE.box);
  });
});

describe('remoteProductLookup: sizes', () => {
  it('uses all three sizes when the page gave them', async () => {
    const { lookup } = setUp();
    const preview = await lookup.lookup(LINK);
    expect({ w: preview.w, d: preview.d, h: preview.h }).toEqual({ w: 66, d: 34, h: 32 });
    expect(preview.sizesFound).toBe(true);
  });

  it('clamps each size to [0.25, 240] inches', async () => {
    const { lookup } = setUp(() => jsonResponse(200, fields({ w: 500, d: 0.1, h: 240.5 })));
    const preview = await lookup.lookup(LINK);
    expect({ w: preview.w, d: preview.d, h: preview.h }).toEqual({ w: 240, d: 0.25, h: 240 });
    expect(preview.sizesFound).toBe(true);
  });

  it.each([
    ['width', { w: null }, { w: TYPICAL_SIZE.sofa.w, d: 34, h: 32 }],
    ['depth', { d: null }, { w: 66, d: TYPICAL_SIZE.sofa.d, h: 32 }],
    ['height', { h: null }, { w: 66, d: 34, h: TYPICAL_SIZE.sofa.h }],
    ['all three', { w: null, d: null, h: null }, TYPICAL_SIZE.sofa],
  ])('takes a missing %s from the typical size of the kind', async (_label, missing, expected) => {
    const { lookup } = setUp(() => jsonResponse(200, fields(missing)));
    const preview = await lookup.lookup(LINK);
    expect({ w: preview.w, d: preview.d, h: preview.h }).toEqual(expected);
    expect(preview.sizesFound).toBe(false);
  });
});

describe('remoteProductLookup: style', () => {
  it('reads the style from the name and description with the final width and height', async () => {
    const { lookup } = setUp(() => jsonResponse(200, fields({ description: 'Tufted cushions on tapered legs.' })));
    const preview = await lookup.lookup(LINK);
    const text = `${SOFA_NAME} Tufted cushions on tapered legs.`;
    expect(preview.style).toEqual(styleFromText('sofa', text, { w: 66, h: 32 }));
    expect(preview.style).toMatchObject({ seats: '2', cushions: 'tight', legs: 'tapered' });
  });

  it('gives the style the clamped sizes, not the page sizes', async () => {
    // Taller than wide as given (one drawer column), but both clamp to 240, so wide (two columns).
    const { lookup } = setUp(() => jsonResponse(200, fields({ name: '6-Drawer Dresser', w: 260, h: 300 })));
    const preview = await lookup.lookup(LINK);
    expect(preview.style).toEqual(styleFromText('dresser', '6-Drawer Dresser ', { w: 240, h: 240 }));
    expect(preview.style).toMatchObject({ columns: '2', rows: '3' });
  });

  it('gives the style the typical width when the page gave none', async () => {
    // Typical dresser width 60 against height 50 is wide; the page's height alone would not decide it.
    const { lookup } = setUp(() => jsonResponse(200, fields({ name: '6-Drawer Dresser', w: null, h: 50 })));
    const preview = await lookup.lookup(LINK);
    expect(preview.style).toEqual(styleFromText('dresser', '6-Drawer Dresser ', { w: TYPICAL_SIZE.dresser.w, h: 50 }));
    expect(preview.style).toMatchObject({ columns: '2', rows: '3' });
  });
});

describe('remoteProductLookup: colours', () => {
  it('takes main and accent from the text and does not sample the photo', async () => {
    const { samplePhoto, lookup } = setUp(() =>
      jsonResponse(200, fields({ name: 'Navy Loveseat', description: 'Black metal legs.' })),
    );
    const preview = await lookup.lookup(LINK);
    expect(preview.colours).toEqual({ main: NAVY, accent: BLACK_METAL });
    expect(samplePhoto).not.toHaveBeenCalled();
  });

  it('keeps the name main and takes a missing accent from the photo', async () => {
    const { samplePhoto, lookup } = setUp(
      () => jsonResponse(200, fields({ name: 'Navy Loveseat' })),
      { main: '#111111', accent: '#c0c0c0' },
    );
    const controller = new AbortController();
    const preview = await lookup.lookup(LINK, { signal: controller.signal });
    expect(samplePhoto).toHaveBeenCalledTimes(1);
    expect(samplePhoto).toHaveBeenCalledWith(PHOTO, { signal: controller.signal });
    expect(preview.colours).toEqual({ main: NAVY, accent: '#c0c0c0' });
  });

  it('ignores a photo accent equal to the name main', async () => {
    const { lookup } = setUp(() => jsonResponse(200, fields({ name: 'Navy Loveseat' })), { main: '#111111', accent: NAVY });
    const preview = await lookup.lookup(LINK);
    expect(preview.colours).toEqual(recipeColours('sofa', NAVY, null));
  });

  it('takes main and accent from the photo when the text names no colour', async () => {
    const { samplePhoto, lookup } = setUp(undefined, { main: '#445566', accent: '#ddccbb' });
    const preview = await lookup.lookup(LINK);
    expect(samplePhoto).toHaveBeenCalledWith(PHOTO, { signal: undefined });
    expect(preview.colours).toEqual({ main: '#445566', accent: '#ddccbb' });
  });

  it('keeps an accent word from the text over the photo accent', async () => {
    const { lookup } = setUp(() => jsonResponse(200, fields({ description: 'Solid brass feet.' })), {
      main: '#445566',
      accent: '#ddccbb',
    });
    const preview = await lookup.lookup(LINK);
    expect(preview.colours).toEqual({ main: '#445566', accent: BRASS });
  });

  it('uses the default colours of the kind when there is no photo and no colour word', async () => {
    const { samplePhoto, lookup } = setUp(() => jsonResponse(200, fields({ imageUrl: null })));
    const preview = await lookup.lookup(LINK);
    expect(samplePhoto).not.toHaveBeenCalled();
    expect(preview.colours).toEqual(defaultColours('sofa'));
  });

  it('treats a photo sampler that rejects as giving no colours', async () => {
    const { samplePhoto, lookup } = setUp();
    samplePhoto.mockRejectedValueOnce(new Error('photo load failed'));
    const preview = await lookup.lookup(LINK);
    expect(samplePhoto).toHaveBeenCalledTimes(1);
    expect(preview.colours).toEqual(defaultColours('sofa'));
  });

  it('uses the default colours of the kind when the photo gives none', async () => {
    const { lookup } = setUp();
    const preview = await lookup.lookup(LINK);
    expect(preview.colours).toEqual(defaultColours('sofa'));
  });
});

describe('remoteProductLookup: text caps', () => {
  it('passes the name, host and link through capProductText', async () => {
    vi.mocked(capProductText).mockClear();
    const { lookup } = setUp();
    await lookup.lookup(LINK);
    expect(capProductText).toHaveBeenCalledWith({ name: SOFA_NAME, host: 'ikea.com', sourceUrl: LINK });
  });

  it('keeps a name of the longest length the route allows', async () => {
    const name = `Sofa ${'n'.repeat(195)}`;
    const { lookup } = setUp(() => jsonResponse(200, fields({ name })));
    expect((await lookup.lookup(LINK)).name).toBe(name);
  });

  it('refuses a link too long to store as invalid_url, with no request', async () => {
    const long = `https://www.ikea.com/us/en/p/${'a'.repeat(3000)}`;
    const { fetch, lookup } = setUp();
    await expectLookupError(lookup.lookup(long), 'invalid_url');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('remoteProductLookup: result', () => {
  it('builds the preview from the parsed link and the answer', async () => {
    const { lookup } = setUp(() => jsonResponse(200, fields({ price: 1299.99, sizeNote: SIZE_NOTE_UNLABELLED })));
    const preview = await lookup.lookup('  https://u:p@www.ikea.com/us/en/p/x/?a=1 ');
    expect(preview).toEqual({
      kind: 'sofa',
      name: SOFA_NAME,
      host: 'ikea.com',
      sourceUrl: 'https://www.ikea.com/us/en/p/x/?a=1',
      price: 1299.99,
      w: 66,
      d: 34,
      h: 32,
      kindFound: true,
      sizesFound: true,
      sizeNote: SIZE_NOTE_UNLABELLED,
      imageUrl: PHOTO,
      style: styleFromText('sofa', `${SOFA_NAME} `, { w: 66, h: 32 }),
      colours: defaultColours('sofa'),
    });
  });

  it('passes a null photo and size note through as null', async () => {
    const { lookup } = setUp(() => jsonResponse(200, fields({ imageUrl: null, sizeNote: null, price: null })));
    const preview = await lookup.lookup(LINK);
    expect(preview.imageUrl).toBeNull();
    expect(preview.sizeNote).toBeNull();
    expect(preview.price).toBeNull();
  });
});

describe('remoteProductLookup (default dependencies)', () => {
  it('uses the global fetch', async () => {
    const fetch = vi.fn<RemoteLookupDeps['fetch']>(async () => jsonResponse(200, fields({ imageUrl: null })));
    vi.stubGlobal('fetch', fetch);
    const preview = await remoteProductLookup.lookup(LINK);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(LOOKUP_PATH);
    expect(preview.kind).toBe('sofa');
  });
});
