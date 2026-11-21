import { dominantColours, type PhotoColours } from '../domain/furniture/photoColours';
import { isShopPhotoUrl } from '../lookup/shops';

/**
 * Samples a product photo in the browser to find a piece's main and accent colours. This is the
 * thin browser step: it loads the photo from a shop's own photo host, reads its pixels from a
 * small canvas that is never added to the document, and hands them to `dominantColours`. The
 * photo address is only used here; it is never stored.
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
  const loadPixels = opts?.deps?.loadPixels ?? loadImagePixels;
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

/**
 * The default loadPixels: loads the photo anonymously (no cookies, no referrer), draws it at
 * `size` × `size` on a detached canvas and reads the pixels back. Rejects, rather than hanging,
 * when there is no 2D canvas context (as in jsdom), when the photo fails to load, when reading
 * the canvas is refused (a photo served without CORS taints it), or when `signal` aborts.
 */
function loadImagePixels(url: string, size: number, signal: AbortSignal): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The photo load was aborted.', 'AbortError'));
      return;
    }
    // The context is checked before the photo is requested, so nothing is fetched when it is missing.
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    let context: CanvasRenderingContext2D | null;
    try {
      context = canvas.getContext('2d', { willReadFrequently: true });
    } catch {
      context = null;
    }
    if (context === null) {
      reject(new Error('No 2D canvas context is available.'));
      return;
    }
    const ctx = context;

    const img = new Image();
    const cleanUp = (): void => {
      img.onload = null;
      img.onerror = null;
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = (): void => {
      cleanUp();
      img.removeAttribute('src');
      reject(new DOMException('The photo load was aborted.', 'AbortError'));
    };
    img.onload = () => {
      cleanUp();
      try {
        ctx.drawImage(img, 0, 0, size, size);
        resolve(ctx.getImageData(0, 0, size, size).data);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      cleanUp();
      reject(new Error('The photo failed to load.'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    // Both must be set before `src`, or the request goes out with credentials and a referrer.
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}
