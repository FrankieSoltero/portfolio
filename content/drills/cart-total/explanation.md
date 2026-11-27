## The count and total stopped following the cart

**What you saw.** After `Increase Pen` and then `Decrease Pen`, the line read `Pen × 1` again but the summary still said `Items: 4` and `Total: $36.99`. After `Remove Bag`, the bag was gone from the list but the summary still said `Items: 3` and `Total: $35.74` instead of `Items: 2` and `Total: $5.75`.

**Why.** The item count and the total were kept in their own `useState` calls, next to the cart lines they describe. That makes three copies of the same facts, and every change to the cart has to remember to update all three. `increase` did; `decrease` and `removeLine` only changed the lines, so the count and total kept their old values. Each new way to change the cart is another place for the copies to fall out of step.

**The fix.** Store only the lines, and compute the count and the total from them while rendering:

```tsx
const [lines, setLines] = useState<Line[]>(INITIAL_LINES);

const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
const fullCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
```

`increase`, `decrease` and `removeLine` then only change `lines`, and the summary is always right because there is nothing else to keep in step.

**Rule to remember.** If a value can be calculated from state you already have, calculate it during render instead of storing it. One source of truth cannot disagree with itself.

## The discount went wrong once the cart changed

**What you saw.** Ticking `10% off` showed the right `Total: $32.17`. But with it ticked, `Increase Notebook` showed `Total: $36.67` instead of `Total: $36.22`, and unticking it then showed `Total: $40.74` instead of `Total: $40.24`.

**Why.** Ticking the box multiplied the stored total by `0.9` and unticking divided it by `0.9`. That turns the stored number into a discounted total while the box is on. The next `Increase Notebook` added the notebook's full `$4.50` to that discounted number, so the new notebook got no discount. Unticking then divided everything by `0.9`, which scaled that full-price notebook up to `$5.00`. The stored total only stays correct if nothing changes between ticking and unticking.

**The fix.** Keep whether the discount is on as its own piece of state, never change the full total because of it, and apply the discount when you work out what to show:

```tsx
const [discountOn, setDiscountOn] = useState(false);

const totalCents = discountOn ? Math.round(fullCents * 0.9) : fullCents;
```

**Rule to remember.** Store the inputs, not the results of applying them. A toggle should store whether it is on; the effect of the toggle belongs in a calculation that runs on every render.
