import { CONFIG } from '../config';
import type { ItemModel, Kind, ProductPreview } from '../domain/types';
import { parseProductUrl, type ParsedProductUrl, type ProductLookup } from './productLookup';

/** Links the UI offers as one-click examples. */
export const SAMPLE_LINKS: { sofa: string; shelf: string; unknown: string } = {
  sofa: 'https://shop.example/living/alder-3-seat-sofa',
  shelf: 'https://shop.example/storage/girder-bookshelf',
  unknown: 'https://market.example/item/48213',
};

type CatalogueKind = Exclude<Kind, 'box'>;
type ModelTemplate = Omit<ItemModel, 'assetUrl'>;

interface CatalogueRow {
  kind: CatalogueKind;
  match: RegExp;
  name: string;
  w: number;
  d: number;
  h: number;
  price: number;
}

/** Mock catalogue in match order: the first row whose keyword appears in the URL wins. */
const CATALOGUE: readonly CatalogueRow[] = [
  { kind: 'sofa', match: /sofa|couch|sectional/i, name: 'Alder 3-seat sofa', w: 84, d: 36, h: 33, price: 1290 },
  { kind: 'desk', match: /desk/i, name: 'Tack writing desk', w: 55, d: 26, h: 30, price: 420 },
  { kind: 'shelf', match: /shelf|bookcase|shelving/i, name: 'Girder bookshelf', w: 36, d: 13, h: 78, price: 310 },
  { kind: 'bed', match: /bed/i, name: 'Low platform bed, queen', w: 64, d: 85, h: 38, price: 890 },
  { kind: 'chair', match: /chair/i, name: 'Brace lounge chair', w: 30, d: 32, h: 31, price: 540 },
  { kind: 'rug', match: /rug/i, name: 'Flatweave rug', w: 60, d: 96, h: 0.5, price: 340 },
  { kind: 'table', match: /table/i, name: 'Slab coffee table', w: 44, d: 24, h: 16, price: 260 },
];

const RETAILER: ModelTemplate = { tier: 'retailer', label: '3D model from retailer' };
const GENERATED: ModelTemplate = { tier: 'generated', label: 'Model built from photos' };
const BOX: ModelTemplate = { tier: 'box', label: 'No model, shown as a sized box' };

const MODELS: Record<CatalogueKind, ModelTemplate> = {
  sofa: RETAILER,
  desk: RETAILER,
  bed: RETAILER,
  shelf: GENERATED,
  chair: GENERATED,
  rug: GENERATED,
  table: GENERATED,
};

const UNKNOWN_SIZE = { w: 36, d: 24, h: 30 } as const;
const UNTITLED = 'Untitled product';

function makeModel(template: ModelTemplate): ItemModel {
  return { ...template, assetUrl: null };
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // Malformed percent-escape: keep the raw segment rather than failing the lookup.
    return segment;
  }
}

/** Derives a readable name from the last path segment, e.g. `blue-thing.html` → `Blue thing`. */
function nameFromPath(path: string): string {
  const last = path.split('/').filter(Boolean).pop() ?? '';
  const slug = decodeSegment(last)
    .replace(/\.\w+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  const name = !slug || /^\d+$/.test(slug) ? UNTITLED : slug;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function buildPreview(parsed: ParsedProductUrl): ProductPreview {
  const row = CATALOGUE.find((r) => r.match.test(parsed.url));
  if (row) {
    return {
      kind: row.kind,
      name: row.name,
      host: parsed.host,
      sourceUrl: parsed.url,
      price: row.price,
      w: row.w,
      d: row.d,
      h: row.h,
      known: true,
      model: makeModel(MODELS[row.kind]),
    };
  }
  return {
    kind: 'box',
    name: nameFromPath(parsed.path),
    host: parsed.host,
    sourceUrl: parsed.url,
    price: null,
    ...UNKNOWN_SIZE,
    known: false,
    model: makeModel(BOX),
  };
}

function abortError(): DOMException {
  return new DOMException('The product lookup was aborted.', 'AbortError');
}

/**
 * A lookup that never touches the network: it matches keywords in the URL
 * against a fixed catalogue after a simulated delay.
 */
export function createMockProductLookup(opts?: { delayMs?: number }): ProductLookup {
  const delayMs = opts?.delayMs ?? CONFIG.lookupDelayMs;

  return {
    lookup(url, lookupOpts) {
      const signal = lookupOpts?.signal;
      if (signal?.aborted) return Promise.reject(abortError());

      let parsed: ParsedProductUrl;
      try {
        parsed = parseProductUrl(url);
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }

      return new Promise<ProductPreview>((resolve, reject) => {
        const onAbort = (): void => {
          clearTimeout(timer);
          reject(abortError());
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve(buildPreview(parsed));
        }, delayMs);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
}
