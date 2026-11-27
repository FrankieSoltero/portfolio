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

**The fix.** Don't keep a loading flag that has to be switched back on. Store the answer together with the user id it was for, and work out during render whether it belongs to the user chosen now. If it doesn't, the profile for that user is still on its way:

```tsx
type Outcome = { forId: number; user: User } | { forId: number; failed: true };

const [outcome, setOutcome] = useState<Outcome | null>(null);
const loading = outcome === null || outcome.forId !== userId;

useEffect(() => {
  let ignore = false;
  fetchUser(userId).then((user) => {
    if (ignore) return;
    setOutcome({ forId: userId, user });
  });
  return () => {
    ignore = true;
  };
}, [userId]);
```

Clicking `Show Grace` sets `userId` to 2 while the stored outcome is still for user 1, so the very render after the click shows `Loading…` instead of Ada. State is only set when an answer arrives, in the handler, and the cleanup's `ignore` flag still keeps a late answer for an earlier user out. Calling `setLoading(true)` at the top of the effect is a common older pattern, but React's current lint rule `react-hooks/set-state-in-effect` flags it, because it makes React render a second time straight after the first.

**Rule to remember.** A loading flag describes the current request, not the first one. Rather than remembering to switch it on and off, keep each answer with the id it was for and compare that id with the current choice while rendering.

## A failed request left Loading… on screen forever

**What you saw.** When Ada's profile couldn't be loaded, the screen kept showing `Loading…` and never showed `Could not load profile`.

**Why.** The effect only passed a success handler to `.then()`. When `fetchUser()` rejected, no code ran at all: `loading` stayed `true`, no error was recorded, and the rejection went unhandled. The screen kept whatever it showed before the request.

**The fix.** Handle the rejection as well, and store the failure as the outcome for the user it was for. Storing it ends the loading on its own, because the outcome now matches the chosen user. And because the failure carries its user id, choosing another user stops it from applying straight away, so there is no error flag to clear before the next load:

```tsx
useEffect(() => {
  let ignore = false;
  fetchUser(userId).then(
    (user) => {
      if (ignore) return;
      setOutcome({ forId: userId, user });
    },
    () => {
      if (ignore) return;
      setOutcome({ forId: userId, failed: true });
    }
  );
  return () => {
    ignore = true;
  };
}, [userId]);
```

Then render `Loading…` while `loading` is `true`, `Could not load profile` in an element with `role="alert"` when the outcome is a failure, and the profile otherwise:

```tsx
{loading ? (
  <p>Loading…</p>
) : "failed" in outcome ? (
  <p role="alert">Could not load profile</p>
) : (
  <section>
    <h2>{outcome.user.name}</h2>
    <p>{`Role: ${outcome.user.role}`}</p>
  </section>
)}
```

**Rule to remember.** Every request can fail. Give each one a failure path that updates the screen, and make sure loading ends on both paths.
