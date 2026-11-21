/**
 * The main and accent colours of a product photo, worked out from its pixels. Pure: the browser
 * step that loads the photo and reads its pixels lives in `services/photoSampler.ts`.
 *
 * The backdrop is removed first: a pixel is background-like when it is transparent, near white,
 * or close to the corner colour, and the background is the background-like pixels reachable from
 * the border. Whatever is left (including white enclosed by the object) is the object, grouped
 * into coarse colour buckets; the largest bucket is the main colour and a large enough, different
 * enough other bucket is the accent.
 */

/** The colours of a product photo as `#rrggbb` in lower case, or null when there is none. */
export interface PhotoColours {
  main: string | null;
  accent: string | null;
}

/** A pixel with alpha below this is transparent, so background-like. */
const ALPHA_MIN = 128;
/** A pixel with every channel at least this is near white, so background-like. */
const WHITE_MIN = 240;
/** A pixel whose largest channel difference from the corner colour is at most this is background-like. */
const CORNER_TOLERANCE = 24;
/** Fewer object pixels than this share of the image means there is no object to colour. */
const OBJECT_SHARE_MIN = 0.02;
/** The accent's bucket must hold at least this share of the object pixels. */
const ACCENT_SHARE_MIN = 0.05;
/** The accent must differ from main by at least this sum of absolute channel differences. */
const ACCENT_DISTANCE_MIN = 96;

/** The running total of one colour bucket's pixels. */
interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

/** An RGB colour with each channel 0 to 255. */
type Rgb = readonly [number, number, number];

/** No colours at all. */
function noColours(): PhotoColours {
  return { main: null, accent: null };
}

/**
 * The main and accent colours of an RGBA image (4 bytes per pixel, rows top to bottom). Main is
 * the largest colour bucket of the object; accent is the largest other bucket holding at least 5%
 * of the object pixels and differing from main by at least 96, or null. Both are null when the
 * input is malformed or less than 2% of the image is object. Never throws.
 */
export function dominantColours(pixels: Uint8ClampedArray, width: number, height: number): PhotoColours {
  if (!(pixels instanceof Uint8ClampedArray)) return noColours();
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return noColours();
  const total = width * height;
  if (pixels.length !== total * 4) return noColours();

  const background = findBackground(pixels, width, height);
  const buckets = new Map<number, Bucket>();
  let objectPixels = 0;
  for (let p = 0; p < total; p += 1) {
    if (background[p] === 1) continue;
    const i = p * 4;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
    objectPixels += 1;
  }
  if (objectPixels === 0 || objectPixels < total * OBJECT_SHARE_MIN) return noColours();

  // Buckets in first-seen order, so equal counts resolve the same way every time.
  let main: Bucket | null = null;
  for (const bucket of buckets.values()) {
    if (main === null || bucket.count > main.count) main = bucket;
  }
  if (main === null) return noColours();
  const mainColour = meanColour(main);

  let accent: Bucket | null = null;
  for (const bucket of buckets.values()) {
    if (bucket === main || bucket.count < objectPixels * ACCENT_SHARE_MIN) continue;
    if (distance(meanColour(bucket), mainColour) < ACCENT_DISTANCE_MIN) continue;
    if (accent === null || bucket.count > accent.count) accent = bucket;
  }

  return { main: toHex(mainColour), accent: accent === null ? null : toHex(meanColour(accent)) };
}

/**
 * Marks the background: background-like pixels reachable from the border by 4-connected steps.
 * Returns one byte per pixel, 1 for background. The fill uses an explicit stack, not recursion,
 * so a large image cannot overflow the call stack.
 */
function findBackground(pixels: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const total = width * height;
  const corner = cornerColour(pixels, width, height);
  const background = new Uint8Array(total);
  const stack: number[] = [];

  const visit = (p: number): void => {
    if (background[p] === 1 || !isBackgroundLike(pixels, p * 4, corner)) return;
    background[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < width; x += 1) {
    visit(x);
    visit((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    visit(y * width);
    visit(y * width + width - 1);
  }

  while (stack.length > 0) {
    const p = stack.pop() as number;
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < total - width) visit(p + width);
  }
  return background;
}

/** The mean RGB of the four corner pixels. */
function cornerColour(pixels: Uint8ClampedArray, width: number, height: number): Rgb {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const p of corners) {
    r += pixels[p * 4];
    g += pixels[p * 4 + 1];
    b += pixels[p * 4 + 2];
  }
  return [r / 4, g / 4, b / 4];
}

/** True when the pixel at byte offset `i` is transparent, near white or close to the corner colour. */
function isBackgroundLike(pixels: Uint8ClampedArray, i: number, corner: Rgb): boolean {
  const r = pixels[i];
  const g = pixels[i + 1];
  const b = pixels[i + 2];
  if (pixels[i + 3] < ALPHA_MIN) return true;
  if (r >= WHITE_MIN && g >= WHITE_MIN && b >= WHITE_MIN) return true;
  const largest = Math.max(Math.abs(r - corner[0]), Math.abs(g - corner[1]), Math.abs(b - corner[2]));
  return largest <= CORNER_TOLERANCE;
}

/** A bucket's colour: the mean of its pixels, rounded per channel. */
function meanColour(bucket: Bucket): Rgb {
  return [
    Math.round(bucket.r / bucket.count),
    Math.round(bucket.g / bucket.count),
    Math.round(bucket.b / bucket.count),
  ];
}

/** The sum of absolute channel differences between two colours. */
function distance(a: Rgb, b: Rgb): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/** `#rrggbb` in lower case. */
function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}
