## Add 3 only added one

**What you saw.** Clicking `Add 3` once moved the line from `Count: 0` to `Count: 1`, not `Count: 3`.

**Why.** The handler called `setCount(count + 1)` three times. Inside one click, `count` is the value from the render the handler belongs to, so all three calls computed `0 + 1` and asked React to set the count to `1` three times. Calling the setter doesn't change `count` in the running handler; it schedules the next render.

**The fix.** Pass the setter a function. React queues the three updates and feeds each one the result of the one before:

```tsx
setCount((c) => c + 1);
setCount((c) => c + 1);
setCount((c) => c + 1);
```

**Rule to remember.** When the next state depends on the previous state, use the functional form of the setter, `setX((prev) => next)`, not a value computed from the variable in scope.

## Clicks made during a save disappeared

**What you saw.** Clicking `Add 1 after saving` and then `Add 1` twice showed `Count: 2`, but once the save finished the line dropped back to `Count: 1`. Starting two saves back to back also ended on `Count: 1` instead of `Count: 2`.

**Why.** The handler ran `await saveClick()` and then `setCount(count + 1)`. The `count` it used is the one captured when the button was clicked, before the save started. By the time the save finished, other clicks had already moved the count on, and the handler overwrote them with the old number plus one. Two saves started from the same render both captured the same `count`, so both set the same value.

**The fix.** Ask React for the latest count when the save finishes, not the one from before the wait:

```tsx
await saveClick();
setCount((c) => c + 1);
```

**Rule to remember.** After an `await`, the state variables in your handler are a snapshot from before the wait. To update state based on its current value, use the functional form of the setter.
