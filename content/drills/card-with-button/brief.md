This PR runs, but it isn't ready to merge.

It adds a small product list where you can pick one product and add products to a cart. Review it, find what's wrong, and fix `App.tsx` until every check passes.

## What the feature should do

1. Show three products, `Lamp`, `Desk` and `Chair`, each on its own card.
2. Each card has a button named `Select` plus the product's name, for example `Select Lamp`. Clicking it selects that product.
3. Each card also has a button named `Add` plus the product's name plus `to cart`, for example `Add Desk to cart`. Clicking it adds that product to the cart.
4. Below the products, a line shows the selected product: `Selected: none` at first, then the product's name, for example `Selected: Lamp`.
5. Another line shows how many products are in the cart: `Cart: 0` at first, then `Cart: 1`, `Cart: 2` and so on.
6. Selecting a product also works without a mouse: you can reach a product's select button with Tab and press it with Enter or Space.
