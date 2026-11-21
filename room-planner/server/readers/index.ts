import type { ProductFields } from '../../lookup/contract';
import type { Shop } from '../../lookup/shops';
import { readAmazon } from './amazon';
import { readIkea } from './ikea';
import { readWayfair } from './wayfair';

/** Each shop's page reader. */
const READERS: Record<Shop, (html: string) => ProductFields | null> = {
  ikea: readIkea,
  wayfair: readWayfair,
  amazon: readAmazon,
};

/**
 * The product fields on a shop's page, read by that shop's reader, or null when the page is not a
 * single product page (or the shop is not one the planner reads). Never throws.
 */
export function readProduct(shop: Shop, html: string): ProductFields | null {
  const reader = Object.hasOwn(READERS, shop) ? READERS[shop] : undefined;
  return reader ? reader(html) : null;
}
