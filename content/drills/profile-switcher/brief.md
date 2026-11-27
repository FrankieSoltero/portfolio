This PR runs, but it isn't ready to merge.

It adds a profile switcher: pick one of three users and their profile loads from the server with `fetchUser()` from `api.ts`. Review it, find what's wrong, and fix `App.tsx` until every check passes.

## What the feature should do

1. Show three buttons, `Show Ada`, `Show Grace` and `Show Linus`. Clicking one loads that user's profile.
2. When the page opens, user 1, `Ada`, is chosen and their profile loads.
3. While a profile is loading, show `Loading…` in place of the profile.
4. When it has loaded, show the user's name as a heading and, below it, a line with their role: `Ada` with `Role: Engineer`, `Grace` with `Role: Admiral`, `Linus` with `Role: Maintainer`.
5. The profile on screen is always the one for the user chosen last.
6. If the profile can't be loaded, show `Could not load profile` as an alert. Choosing a user again loads their profile as usual.
