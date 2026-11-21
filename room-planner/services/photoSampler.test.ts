import { afterEach, describe, expect, it, vi } from 'vitest';
import { dominantColours } from '../domain/furniture/photoColours';
import { PHOTO_SAMPLE_SIZE, PHOTO_TIMEOUT_MS, samplePhotoColours, type SamplerDeps } from './photoSampler';

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

  it('gives nulls with the default loader in jsdom, which has no canvas context', async () => {
    vi.useFakeTimers();
    let result: unknown = 'pending';
    void samplePhotoColours(PHOTO).then((colours) => {
      result = colours;
    });
    // Settles on its own, well before the timeout could rescue a hanging load.
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toEqual(NO_COLOURS);
  });
});
