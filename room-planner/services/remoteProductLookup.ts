import { CONFIG } from '../config';
import {
  accentColourFromText,
  kindFromName,
  mainColourFromName,
  recipeColours,
  styleFromText,
} from '../domain/furniture/fromProduct';
import type { PhotoColours } from '../domain/furniture/photoColours';
import { TYPICAL_SIZE } from '../domain/furniture/recipe';
import type { ProductPreview } from '../domain/types';
import { isLookupErrorCode, LOOKUP_PATH, parseProductFields, type ProductFields } from '../lookup/contract';
import { shopForHost } from '../lookup/shops';
import { samplePhotoColours } from './photoSampler';
import { capProductText, LookupError, parseProductUrl, type ProductLookup } from './productLookup';

/**
 * The browser side of the product lookup: it sends a pasted shop link to the site's own lookup
 * route, checks the answer, and turns the product fields into a preview the planner can place.
 * The route's answer is untrusted like the page it came from, so only a body that passes
 * `parseProductFields` is used. The link is never logged.
 */

/** The steps the lookup takes that touch the network or the browser, replaceable in tests. */
export interface RemoteLookupDeps {
  fetch: typeof fetch;
  samplePhoto: typeof samplePhotoColours;
}

/** The global fetch, looked up on each call so it is always called on the global object. */
const globalFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

/** `value` limited to the sizes a piece may have, in inches. */
function clampDim(value: number): number {
  return Math.min(CONFIG.itemDimMax, Math.max(CONFIG.itemDimMin, value));
}

/** The parsed JSON body of `response`, or undefined when it is not JSON. Rejects only on an abort. */
async function readJson(response: Response, signal: AbortSignal | undefined): Promise<unknown> {
  try {
    return await response.json();
  } catch (err) {
    if (signal?.aborted) throw err;
    return undefined;
  }
}

/** The error an error answer names, or `unavailable` when it names no known code. */
function errorFromBody(body: unknown): LookupError {
  const code = typeof body === 'object' && body !== null ? (body as { error?: unknown }).error : undefined;
  return new LookupError(isLookupErrorCode(code) ? code : 'unavailable');
}

/**
 * Posts `link` to the lookup route and returns the product fields it answered. Rejects with the
 * matching LookupError for an error answer, `unavailable` for a network failure or any answer it
 * cannot use, and with the fetch's own abort error when `signal` aborts.
 */
async function requestFields(
  fetchFn: typeof fetch,
  link: string,
  signal: AbortSignal | undefined,
): Promise<ProductFields> {
  let response: Response;
  try {
    response = await fetchFn(LOOKUP_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: link }),
      credentials: 'omit',
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new LookupError('unavailable');
  }
  const body = await readJson(response, signal);
  if (!response.ok) throw errorFromBody(body);
  const fields = parseProductFields(body);
  if (fields === null) throw new LookupError('unavailable');
  return fields;
}

/**
 * A piece's main and accent colours: words in the name (main) and in the name and description
 * (accent) first; the photo fills only what the words left out, and its accent only when it
 * differs from the final main. The photo is sampled only when something is missing.
 */
async function pieceColours(
  fields: ProductFields,
  kind: ProductPreview['kind'],
  samplePhoto: RemoteLookupDeps['samplePhoto'],
  signal: AbortSignal | undefined,
): Promise<ProductPreview['colours']> {
  let main = mainColourFromName(fields.name);
  let accent = accentColourFromText(`${fields.name} ${fields.description}`, main);
  if (fields.imageUrl !== null && (main === null || accent === null)) {
    let photo: PhotoColours;
    try {
      photo = await samplePhoto(fields.imageUrl, { signal });
    } catch {
      // The sampler promises never to reject; if it does anyway, the photo simply gives no colours.
      photo = { main: null, accent: null };
    }
    // The sampler gives no colours rather than rejecting on an abort, so the abort is raised here.
    signal?.throwIfAborted();
    if (main === null) main = photo.main;
    if (accent === null && photo.accent !== null && photo.accent !== main) accent = photo.accent;
  }
  return recipeColours(kind, main, accent);
}

/**
 * A normalised shop link in the `https` form the lookup route accepts. An `http` link is upgraded
 * to `https`; one with its own port is refused as `unsupported_shop`, because the route refuses
 * ports. (`new URL` drops a default port such as `:80`, so only a non-default one counts.)
 */
function httpsLink(normalised: string): string {
  const parsed = new URL(normalised);
  if (parsed.protocol !== 'http:') return normalised;
  if (parsed.port !== '') throw new LookupError('unsupported_shop');
  parsed.protocol = 'https:';
  return parsed.href;
}

/**
 * A product lookup that asks the site's lookup route. `deps` replaces the global fetch and the
 * photo sampler (tests pass fakes, so they make no network requests).
 */
export function createRemoteProductLookup(deps?: Partial<RemoteLookupDeps>): ProductLookup {
  const fetchFn = deps?.fetch ?? globalFetch;
  const samplePhoto = deps?.samplePhoto ?? samplePhotoColours;

  return {
    async lookup(url, opts) {
      const signal = opts?.signal;
      const parsed = parseProductUrl(url);
      if (shopForHost(parsed.host) === null) throw new LookupError('unsupported_shop');
      const link = httpsLink(parsed.url);
      // A link too long for a plan to store is refused before any request is made.
      if (capProductText({ name: '', host: parsed.host, sourceUrl: link }).sourceUrl === null) {
        throw new LookupError('invalid_url');
      }

      const fields = await requestFields(fetchFn, link, signal);

      const text = capProductText({ name: fields.name, host: parsed.host, sourceUrl: link });
      // Already checked above; this narrows the type and guards against a change to the caps.
      if (text.sourceUrl === null) throw new LookupError('invalid_url');

      const foundKind = kindFromName(fields.name);
      const kind = foundKind ?? 'box';
      const typical = TYPICAL_SIZE[kind];
      const w = fields.w === null ? typical.w : clampDim(fields.w);
      const d = fields.d === null ? typical.d : clampDim(fields.d);
      const h = fields.h === null ? typical.h : clampDim(fields.h);

      return {
        kind,
        name: text.name,
        host: text.host,
        sourceUrl: text.sourceUrl,
        price: fields.price,
        w,
        d,
        h,
        kindFound: foundKind !== null,
        sizesFound: fields.w !== null && fields.d !== null && fields.h !== null,
        sizeNote: fields.sizeNote,
        imageUrl: fields.imageUrl,
        style: styleFromText(kind, `${fields.name} ${fields.description}`, { w, h }),
        colours: await pieceColours(fields, kind, samplePhoto, signal),
      };
    },
  };
}

/** The lookup the planner uses: the global fetch and the browser photo sampler. */
export const remoteProductLookup: ProductLookup = createRemoteProductLookup();
