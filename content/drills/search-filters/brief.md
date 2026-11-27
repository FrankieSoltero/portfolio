This PR runs, but it isn't ready to merge.

It adds a product search: type into a search box or tick a checkbox, and the matching products load from the server with `searchProducts()` from `api.ts`. Review it, find what's wrong, and fix `App.tsx` until every check passes.

## What the feature should do

1. Show a text input labelled `Search products` and a checkbox labelled `In stock only`. When the page opens, the input is empty and the checkbox is not ticked.
2. The catalogue holds three products: `Lamp` (in stock), `Lantern` (out of stock) and `Desk` (in stock). A product matches when its name contains the search text, ignoring case; with `In stock only` ticked, only products in stock match.
3. Results load for the current filters and show the matching product names as a list, one list item each. When the page opens, the list shows `Lamp`, `Lantern` and `Desk`; typing `la` shows `Lamp` and `Lantern`; ticking `In stock only` with an empty search shows `Lamp` and `Desk`.
4. The page asks the server once for each set of filters: once when it opens, and once more each time the search text or the checkbox changes.
5. A line shows how many products are listed. It starts at `Results: 0` and reads `Results: 3` when all three products are listed.
6. While a search is on its way, the previous list stays on screen until the new results arrive.
