## One search turned into a flood of requests

**What you saw.** When the page opened it asked for `search::false`, and as soon as that answer arrived it asked for `search::false` again. Typing `la` did the same: one request for `search:la:false`, then another one as soon as the first answered. In the browser, where every answer arrives on its own, the page never stopped asking.

**Why.** The effect listed `filters` as its dependency, and `filters` was an object literal, `{ query, inStock }`, built again on every render. React compares dependencies with `Object.is`, and two objects are never the same object, even when they hold the same values. So after every render React saw a changed dependency and ran the effect again. Each answer called `setResults`, which rendered the component, which made a new `filters` object, which started another search, whose answer called `setResults` again.

**The fix.** Depend on the values the search actually uses, the `query` string and the `inStock` boolean. Strings and booleans compare by value, so the effect runs only when one of them really changes. Build the filters object inside the effect, where it no longer needs to be a dependency:

```tsx
useEffect(() => {
  let ignore = false;
  searchProducts({ query, inStock }).then((products) => {
    if (ignore) return;
    setResults(products);
  });
  return () => {
    ignore = true;
  };
}, [query, inStock]);
```

If the object has to live outside the effect, for example because it is passed to other code too, `useMemo(() => ({ query, inStock }), [query, inStock])` keeps the same object until `query` or `inStock` changes.

**Rule to remember.** An object, array or function created during render is new on every render. Don't list it as an effect dependency; depend on the primitive values inside it, or create it inside the effect.

## The count stayed at Results: 0

**What you saw.** All three products were listed, but the line above them still read `Results: 0`.

**Why.** The count was a second piece of state, copied from `results.length` by an effect with an empty dependency array. An empty array means the effect runs once, after the first render, when `results` was still empty. It copied `0`, and nothing ever copied the length again when the results arrived.

**The fix.** Don't keep the count in state at all. Work it out from the list while rendering, so it always matches what is on screen:

```tsx
const [results, setResults] = useState<Product[]>([]);
const count = results.length;
```

Then remove `setCount` and the effect that called it.

**Rule to remember.** If a value can be calculated from state you already have, calculate it during render. Copying it into state with an effect makes a second source of truth that can fall out of step with the first.
