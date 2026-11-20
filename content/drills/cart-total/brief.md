This PR runs, but it isn't ready to merge.

It adds a shopping cart with quantity controls, a running item count and total, and a discount box. Review it, find what's wrong, and fix `App.tsx` until every check passes.

## What the feature should do

1. Show three cart lines, `Notebook` at `$4.50`, `Pen` at `$1.25` and `Bag` at `$29.99`, each with a quantity of 1. Each line reads the name, `×` and the quantity, for example `Pen × 1`.
2. Each line has a button named `Increase` plus the item's name, for example `Increase Pen`, that adds one to its quantity, and a button named `Decrease` plus the name, for example `Decrease Pen`, that takes one away. `Decrease` is disabled while the quantity is 1.
3. Each line also has a button named `Remove` plus the name, for example `Remove Bag`, that takes the whole line out of the cart.
4. Below the cart, a line shows how many items are in it, the sum of all the quantities: `Items: 3` at first.
5. Another line shows the total price of everything in the cart, with two decimal places: `Total: $35.74` at first.
6. A checkbox labelled `10% off` takes 10% off the whole total while it is ticked, rounded to the nearest cent, so ticking it at first shows `Total: $32.17`. Unticking it shows the full total again.
7. The item count and the total match what is in the cart after any mix of increases, decreases, removals and discount changes.
