## Adding to the cart changed the selection

**What you saw.** Clicking `Add Desk to cart` raised the line to `Cart: 1`, but it also changed `Selected: none` to `Selected: Desk`. With `Lamp` selected, adding `Chair` moved the selection to `Chair`.

**Why.** The selection handler sat on the card's wrapping `div`, and the add button was inside that `div`. A click event doesn't stop at the element you clicked: after the button's own `onClick` runs, the event bubbles up through every ancestor, and each ancestor's `onClick` runs too. So one click on the add button ran `addToCart` and then the card's `setSelected(product)`.

**The fix.** Take the handler off the wrapper and put it on an element that only means "select", one that doesn't contain the add button:

```tsx
<div>
  <button type="button" onClick={() => setSelected(product)}>
    {`Select ${product}`}
  </button>{" "}
  <button type="button" onClick={addToCart}>
    {`Add ${product} to cart`}
  </button>
</div>
```

Calling `event.stopPropagation()` in the add button's handler would also hide the symptom, but it leaves a clickable card that wraps other controls, and every control added to the card later has to remember to stop the event too.

**Rule to remember.** Clicks bubble. Don't put a click handler on an element that wraps other interactive controls; give each action its own control, side by side.

## There was no button to select a product

**What you saw.** The card showed the text `Select Lamp`, but there was no button with that name. You couldn't reach it with Tab or press it with Enter or Space, and a screen reader didn't announce it as something you can press.

**Why.** The text lived in a `span` inside a `div` with an `onClick`. A `div` has no role, isn't in the tab order and doesn't turn Enter or Space into a click. An `onClick` makes it respond to a mouse, and nothing else.

**The fix.** Use a real `button` with the text as its name:

```tsx
<button type="button" onClick={() => setSelected(product)}>
  {`Select ${product}`}
</button>
```

The browser then gives it the `button` role, a place in the tab order, a focus ring, and clicks from Enter and Space, with no extra code.

**Rule to remember.** If something does an action when clicked, make it a `button`. A clickable `div` works only for a mouse; a `button` works for everyone.
