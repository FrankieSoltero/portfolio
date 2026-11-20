This PR runs, but it isn't ready to merge.

It adds a click counter with three buttons, one of which saves the click to the server before counting it. Review it, find what's wrong, and fix `App.tsx` until every check passes.

## What the feature should do

1. Show a line with the current count, starting at `Count: 0`.
2. A button named `Add 1` adds 1 to the count.
3. A button named `Add 3` adds 3 to the count.
4. A button named `Add 1 after saving` saves the click with `saveClick()` from `api.ts`, and when that save finishes, adds 1 to the count.
5. As the count goes up, the line reads `Count: 1`, `Count: 2`, `Count: 3` and so on.
