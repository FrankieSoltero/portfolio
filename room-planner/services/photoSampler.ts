import { dominantColours, type PhotoColours } from '../domain/furniture/photoColours';
import { isShopPhotoUrl } from '../lookup/shops';

/**
 * Samples a product photo in the browser to find a piece's main and accent colours. This is the
 * thin browser step: it fetches its own copy of the photo from a shop's own photo host (without
 * cookies and without the browser's cache, see `createPixelLoader`), reads its pixels from a small
 * canvas that is never added to the document, and hands them to `dominantColours`. The photo
 * address is only used here and by the preview card's image; it is never stored.
 */

/** The photo is drawn at this many pixels square before its colours are read. */
export const PHOTO_SAMPLE_SIZE = 64;
/** A photo that has not been read within this many milliseconds is given up on. */
export const PHOTO_TIMEOUT_MS = 6000;

/** The steps the sampler takes that touch the browser, replaceable in tests. */
export interface SamplerDeps {
  /** The RGBA pixels of the photo at `url` drawn at `size` × `size`. Rejects on any failure. */
  loadPixels(url: string, size: number, signal: AbortSignal): Promise<Uint8ClampedArray>;
}

/**
 * The main and accent colours of the product photo at `url`. A photo not on a shop's photo host
 * (see `isShopPhotoUrl`) is never loaded. Gives nulls when the photo is foreign, fails to load or
 * cannot be read (a tainted canvas), takes longer than PHOTO_TIMEOUT_MS, or `opts.signal` aborts;
 * a timeout or an abort also aborts the load. Never rejects and never throws.
 */
export async function samplePhotoColours(
  url: string,
  opts?: { signal?: AbortSignal; deps?: Partial<SamplerDeps> },
): Promise<PhotoColours> {
  if (!isShopPhotoUrl(url)) return noColours();
  const outer = opts?.signal;
  if (outer?.aborted) return noColours();
  const loadPixels = opts?.deps?.loadPixels ?? createPixelLoader();
  const inner = new AbortController();

  return new Promise<PhotoColours>((resolve) => {
    let settled = false;
    const finish = (colours: PhotoColours): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outer?.removeEventListener('abort', giveUp);
      resolve(colours);
    };
    const giveUp = (): void => {
      inner.abort();
      finish(noColours());
    };
    const timer = setTimeout(giveUp, PHOTO_TIMEOUT_MS);
    outer?.addEventListener('abort', giveUp, { once: true });

    let loading: Promise<Uint8ClampedArray>;
    try {
      loading = Promise.resolve(loadPixels(url, PHOTO_SAMPLE_SIZE, inner.signal));
    } catch {
      finish(noColours());
      return;
    }
    loading.then(
      (pixels) => finish(dominantColours(pixels, PHOTO_SAMPLE_SIZE, PHOTO_SAMPLE_SIZE)),
      () => finish(noColours()),
    );
  });
}

/** No colours at all. */
function noColours(): PhotoColours {
  return { main: null, accent: null };
}

/** The largest photo the sampler reads, in bytes; a larger one is refused. */
export const PHOTO_BYTES_MAX = 8 * 1024 * 1024;

/**
 * How the sampler requests its own copy of the photo: CORS, so its pixels can be read; no cookies,
 * no referrer and no redirects; and never from or into the browser's cache. That cache is shared
 * with the preview card's ordinary `<img>` load of the same photo, which is not a CORS request; a
 * shop that sends its allow-origin header only when asked, without `Vary: Origin`, leaves a cached
 * copy that a CORS request is blocked from reading.
 */
const PHOTO_REQUEST: Readonly<Omit<RequestInit, 'signal'>> = {
  mode: 'cors',
  credentials: 'omit',
  cache: 'no-store',
  referrerPolicy: 'no-referrer',
  redirect: 'error',
};

/** The browser parts the default loader uses, replaceable in tests. */
export interface PixelLoaderEnv {
  fetch: typeof fetch;
  /** Missing where the browser has none (as in jsdom); the loader then rejects without fetching. */
  createImageBitmap?: (image: Blob, options: ImageBitmapOptions) => Promise<ImageBitmap>;
  /** The RGBA pixels of `bitmap` drawn at `size` × `size`. Throws when they cannot be read. */
  readBitmap(bitmap: ImageBitmap, size: number): Uint8ClampedArray;
}

/** Draws `bitmap` at `size` × `size` on a detached canvas and reads the pixels back. */
function readBitmapOnCanvas(bitmap: ImageBitmap, size: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) throw new Error('No 2D canvas context is available.');
  context.drawImage(bitmap, 0, 0, size, size);
  return context.getImageData(0, 0, size, size).data;
}

/** The browser's own parts, read when a load starts. */
function browserEnv(): PixelLoaderEnv {
  const create: PixelLoaderEnv['createImageBitmap'] =
    typeof globalThis.createImageBitmap === 'function' ? (image, options) => globalThis.createImageBitmap(image, options) : undefined;
  return {
    fetch: (input, init) => globalThis.fetch(input, init),
    createImageBitmap: create,
    readBitmap: readBitmapOnCanvas,
  };
}

/**
 * The default loadPixels, with `env` replacing any of the browser parts. It fetches its own copy
 * of the photo (see `PHOTO_REQUEST`), refuses a response that is not ok or a photo over
 * `PHOTO_BYTES_MAX` bytes, decodes it with `createImageBitmap` at `size` × `size`, reads the
 * pixels from a detached canvas and closes the bitmap. Rejects on any failure, when `signal`
 * aborts, and (before fetching anything) when there is no `createImageBitmap`.
 */
export function createPixelLoader(env: Partial<PixelLoaderEnv> = {}): SamplerDeps['loadPixels'] {
  return async (url, size, signal) => {
    const { fetch: fetchPhoto, createImageBitmap: createBitmap, readBitmap } = { ...browserEnv(), ...env };
    if (typeof createBitmap !== 'function') throw new Error('createImageBitmap is not available.');
    signal.throwIfAborted();
    const response = await fetchPhoto(url, { ...PHOTO_REQUEST, signal });
    if (!response.ok) throw new Error(`The photo request failed with status ${response.status}.`);
    // A declared size over the limit is refused before the body is read.
    if (Number(response.headers.get('content-length')) > PHOTO_BYTES_MAX) throw new Error('The photo is too large.');
    const blob = await response.blob();
    if (blob.size > PHOTO_BYTES_MAX) throw new Error('The photo is too large.');
    signal.throwIfAborted();
    const bitmap = await createBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: 'low' });
    try {
      signal.throwIfAborted();
      return readBitmap(bitmap, size);
    } finally {
      bitmap.close();
    }
  };
}
