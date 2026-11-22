import { afterEach, describe, expect, it, vi } from 'vitest';
import { dominantColours } from '../domain/furniture/photoColours';
import {
  createPixelLoader,
  PHOTO_SAMPLE_SIZE,
  PHOTO_TIMEOUT_MS,
  type PixelLoaderEnv,
  samplePhotoColours,
  type SamplerDeps,
} from './photoSampler';

const PHOTO = 'https://m.media-amazon.com/images/I/61sofa.jpg';
const NO_COLOURS = { main: null, accent: null };

/** A 64 × 64 white image with a centred 32 × 32 square of #2f4057 above an 8-row band of #b98d5e. */
function photoPixels(): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(64 * 64 * 4).fill(255);
  for (let y = 16; y < 48; y += 1) {
    for (let x = 16; x < 48; x += 1) {
      pixels.set(y < 40 ? [0x2f, 0x40, 0x57, 255] : [0xb9, 0x8d, 0x5e, 255], (y * 64 + x) * 4);
    }
  }
  return pixels;
}

/** A loadPixels that never settles, recording the signal it was given. */
function hangingLoader() {
  const seen: { signal: AbortSignal | null } = { signal: null };
  const loadPixels = vi.fn<SamplerDeps['loadPixels']>((_url, _size, signal) => {
    seen.signal = signal;
    return new Promise<Uint8ClampedArray>(() => {});
  });
  return { loadPixels, seen };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('photo sampler constants', () => {
  it('samples at 64 pixels and gives up after 6000 ms', () => {
    expect(PHOTO_SAMPLE_SIZE).toBe(64);
    expect(PHOTO_TIMEOUT_MS).toBe(6000);
  });
});

describe('samplePhotoColours', () => {
  it('gives the dominant colours of a shop photo’s pixels', async () => {
    const pixels = photoPixels();
    const loadPixels = vi.fn<SamplerDeps['loadPixels']>(async () => pixels);
    const colours = await samplePhotoColours(PHOTO, { deps: { loadPixels } });
    expect(colours).toEqual(dominantColours(pixels, 64, 64));
    expect(colours).toEqual({ main: '#2f4057', accent: '#b98d5e' });
    expect(loadPixels).toHaveBeenCalledWith(PHOTO, 64, expect.any(AbortSignal));
  });

  it('gives nulls for a photo on a foreign host without loading it', async () => {
    const loadPixels = vi.fn<SamplerDeps['loadPixels']>(async () => photoPixels());
    for (const url of ['https://evil.example/sofa.jpg', 'http://m.media-amazon.com/images/I/61sofa.jpg', 'not a url']) {
      expect(await samplePhotoColours(url, { deps: { loadPixels } })).toEqual(NO_COLOURS);
    }
    expect(loadPixels).not.toHaveBeenCalled();
  });

  it('gives nulls when loading the pixels fails', async () => {
    const rejecting = vi.fn<SamplerDeps['loadPixels']>(async () => {
      throw new DOMException('The canvas has been tainted.', 'SecurityError');
    });
    expect(await samplePhotoColours(PHOTO, { deps: { loadPixels: rejecting } })).toEqual(NO_COLOURS);

    const throwing = vi.fn<SamplerDeps['loadPixels']>(() => {
      throw new Error('thrown before a promise was made');
    });
    expect(await samplePhotoColours(PHOTO, { deps: { loadPixels: throwing } })).toEqual(NO_COLOURS);
  });

  it('gives nulls and aborts the load when it does not settle within 6000 ms', async () => {
    vi.useFakeTimers();
    const { loadPixels, seen } = hangingLoader();
    let result: unknown = 'pending';
    void samplePhotoColours(PHOTO, { deps: { loadPixels } }).then((colours) => {
      result = colours;
    });

    await vi.advanceTimersByTimeAsync(PHOTO_TIMEOUT_MS - 1);
    expect(result).toBe('pending');
    expect(seen.signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(result).toEqual(NO_COLOURS);
    expect(seen.signal?.aborted).toBe(true);
  });

  it('gives nulls and aborts the load when the caller aborts', async () => {
    const { loadPixels, seen } = hangingLoader();
    const caller = new AbortController();
    const sampling = samplePhotoColours(PHOTO, { signal: caller.signal, deps: { loadPixels } });
    expect(seen.signal?.aborted).toBe(false);

    caller.abort();
    expect(await sampling).toEqual(NO_COLOURS);
    expect(seen.signal?.aborted).toBe(true);
  });

  it('gives nulls without loading when the caller has already aborted', async () => {
    const { loadPixels } = hangingLoader();
    const caller = new AbortController();
    caller.abort();
    expect(await samplePhotoColours(PHOTO, { signal: caller.signal, deps: { loadPixels } })).toEqual(NO_COLOURS);
    expect(loadPixels).not.toHaveBeenCalled();
  });

  it('gives nulls with the default loader in jsdom, which has no createImageBitmap, without fetching', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'));
    try {
      let result: unknown = 'pending';
      void samplePhotoColours(PHOTO).then((colours) => {
        result = colours;
      });
      // Settles on its own, well before the timeout could rescue a hanging load.
      await vi.advanceTimersByTimeAsync(0);
      expect(result).toEqual(NO_COLOURS);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('createPixelLoader (the default loader, with the browser parts replaced)', () => {
  const MiB = 1024 * 1024;

  /** A fake bitmap that records whether it was closed. */
  function fakeBitmap() {
    return { width: 64, height: 64, close: vi.fn() } as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };
  }

  /** Fakes for every browser part: a fetch answering `response`, a bitmap maker and a pixel reader. */
  function fakeEnv(response: Response | (() => Promise<Response>) = new Response(new Uint8Array(100))) {
    const bitmap = fakeBitmap();
    const fetchFn = vi.fn<typeof fetch>(async () => (typeof response === 'function' ? response() : response));
    const createBitmap = vi.fn<NonNullable<PixelLoaderEnv['createImageBitmap']>>(async () => bitmap);
    const readBitmap = vi.fn<PixelLoaderEnv['readBitmap']>(() => photoPixels());
    return { env: { fetch: fetchFn, createImageBitmap: createBitmap, readBitmap }, fetchFn, createBitmap, readBitmap, bitmap };
  }

  it('fetches its own copy without cookies, cache, referrer or redirects, and reads it at 64 pixels', async () => {
    const { env, fetchFn, createBitmap, readBitmap, bitmap } = fakeEnv();
    const colours = await samplePhotoColours(PHOTO, { deps: { loadPixels: createPixelLoader(env) } });
    expect(colours).toEqual({ main: '#2f4057', accent: '#b98d5e' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(PHOTO);
    expect(init).toEqual({
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
    expect(createBitmap).toHaveBeenCalledWith(expect.any(Blob), { resizeWidth: 64, resizeHeight: 64, resizeQuality: 'low' });
    expect(readBitmap).toHaveBeenCalledWith(bitmap, 64);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('gives nulls for a response that is not ok, without making a bitmap', async () => {
    const { env, createBitmap } = fakeEnv(new Response('nope', { status: 404 }));
    expect(await samplePhotoColours(PHOTO, { deps: { loadPixels: createPixelLoader(env) } })).toEqual(NO_COLOURS);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it('gives nulls for a photo larger than 8 MiB, without making a bitmap', async () => {
    const { env, createBitmap } = fakeEnv(new Response(new Uint8Array(8 * MiB + 1)));
    expect(await samplePhotoColours(PHOTO, { deps: { loadPixels: createPixelLoader(env) } })).toEqual(NO_COLOURS);
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it('accepts a photo of exactly 8 MiB', async () => {
    const { env } = fakeEnv(new Response(new Uint8Array(8 * MiB)));
    expect(await samplePhotoColours(PHOTO, { deps: { loadPixels: createPixelLoader(env) } })).toEqual({ main: '#2f4057', accent: '#b98d5e' });
  });

  it('gives nulls when createImageBitmap throws', async () => {
    const { env, createBitmap } = fakeEnv();
    createBitmap.mockRejectedValue(new DOMException('The source image could not be decoded.', 'InvalidStateError'));
    expect(await samplePhotoColours(PHOTO, { deps: { loadPixels: createPixelLoader(env) } })).toEqual(NO_COLOURS);
  });

  it('gives nulls, and still closes the bitmap, when reading its pixels fails', async () => {
    const { env, readBitmap, bitmap } = fakeEnv();
    readBitmap.mockImplementation(() => {
      throw new Error('No 2D canvas context is available.');
    });
    expect(await samplePhotoColours(PHOTO, { deps: { loadPixels: createPixelLoader(env) } })).toEqual(NO_COLOURS);
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('gives nulls without fetching when createImageBitmap is missing', async () => {
    const { env, fetchFn } = fakeEnv();
    const loader = createPixelLoader({ ...env, createImageBitmap: undefined });
    expect(await samplePhotoColours(PHOTO, { deps: { loadPixels: loader } })).toEqual(NO_COLOURS);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('gives nulls when fetch rejects', async () => {
    const { env } = fakeEnv(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await samplePhotoColours(PHOTO, { deps: { loadPixels: createPixelLoader(env) } })).toEqual(NO_COLOURS);
  });

  it('gives nulls and aborts the fetch when the caller aborts', async () => {
    const seen: { signal: AbortSignal | null } = { signal: null };
    const { env } = fakeEnv();
    env.fetch.mockImplementation((_url, init) => {
      seen.signal = init?.signal ?? null;
      return new Promise<Response>(() => {});
    });
    const caller = new AbortController();
    const sampling = samplePhotoColours(PHOTO, { signal: caller.signal, deps: { loadPixels: createPixelLoader(env) } });
    caller.abort();
    expect(await sampling).toEqual(NO_COLOURS);
    expect(seen.signal?.aborted).toBe(true);
  });
});
