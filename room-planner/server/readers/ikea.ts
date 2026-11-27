import type { ProductFields } from '../../lookup/contract';
import { finishFields, findJsonLdProduct, parsePage, productFromJsonLd } from './shared';

/**
 * Reads an IKEA product page. IKEA publishes a JSON-LD Product on every product page, so that is
 * the only source used: a page without one (such as a category page) is not a product.
 */

/**
 * The product fields on an IKEA page, cut to the lookup's limits, or null when the page is empty,
 * too large, or has no JSON-LD Product with a name. Never throws.
 */
export function readIkea(html: string): ProductFields | null {
  try {
    const root = parsePage(html);
    if (!root) return null;
    const product = findJsonLdProduct(root);
    return product ? finishFields(productFromJsonLd(product)) : null;
  } catch {
    return null;
  }
}
