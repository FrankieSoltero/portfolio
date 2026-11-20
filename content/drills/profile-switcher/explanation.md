## A slow answer replaced the profile you chose

**What you saw.** With Ada still loading, clicking `Show Grace` and then `Show Linus` started three requests. When the answers came back in the order Linus, Grace, Ada, the screen showed `Linus`, then `Grace`, and ended on `Ada`, even though Linus was the user chosen last.

**Why.** Each time `userId` changed, the effect started a new `fetchUser()` call, but nothing told the earlier calls that they were no longer wanted. Every call still ran `setUser(data)` when it finished, so whichever answer arrived last won, not whichever user was chosen last. Network answers don't arrive in the order you asked for them.

**The fix.** Return a cleanup function from the effect. React runs it before the effect runs again for the next user, so it can mark the old request as out of date, and the request's handler can check that mark before touching state:

```tsx
useEffect(() => {
  let ignore = false;
  fetchUser(userId).then((data) => {
    if (ignore) return;
    setUser(data);
  });
  return () => {
    ignore = true;
  };
}, [userId]);
```

**Rule to remember.** An effect that starts async work should return a cleanup that cancels it or tells it to ignore its result. Only the request from the latest run of the effect may update state.

## Switching users left the old profile up with no Loading…

**What you saw.** After Ada's profile loaded, clicking `Show Grace` kept `Ada` and `Role: Engineer` on screen, with no `Loading…`, until Grace's profile arrived.

**Why.** `loading` started as `true` and was set to `false` when the first profile arrived, but nothing ever set it back to `true`. The first load showed `Loading…` only because of the initial value; every later load ran while `loading` was still `false`, so the screen kept rendering the previous user's profile.

**The fix.** Turn loading on at the start of every load, inside the effect that starts the request:

```tsx
useEffect(() => {
  setLoading(true);
  fetchUser(userId).then((data) => {
    setUser(data);
    setLoading(false);
  });
}, [userId]);
```

**Rule to remember.** A loading flag describes the current request, not the first one. Set it when each request starts and clear it when that request ends, whichever way it ends.

## A failed request left Loading… on screen forever

**What you saw.** When Ada's profile couldn't be loaded, the screen kept showing `Loading…` and never showed `Could not load profile`.

**Why.** The effect only passed a success handler to `.then()`. When `fetchUser()` rejected, no code ran at all: `loading` stayed `true`, no error was recorded, and the rejection went unhandled. The screen kept whatever it showed before the request.

**The fix.** Handle the rejection as well: record the error and turn loading off. Clear the error when the next load starts, so choosing another user can show their profile again:

```tsx
useEffect(() => {
  let ignore = false;
  setLoading(true);
  setFailed(false);
  fetchUser(userId).then(
    (data) => {
      if (ignore) return;
      setUser(data);
      setLoading(false);
    },
    () => {
      if (ignore) return;
      setFailed(true);
      setLoading(false);
    }
  );
  return () => {
    ignore = true;
  };
}, [userId]);
```

Then render `Could not load profile` in an element with `role="alert"` when `failed` is `true`.

**Rule to remember.** Every request can fail. Give each one a failure path that updates the screen, and make sure loading ends on both paths.
