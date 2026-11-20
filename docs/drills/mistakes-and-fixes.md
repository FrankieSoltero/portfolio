# Drills: mistakes and fixes

A running log of what went wrong while building the drills section and the rule that
prevents a repeat. Newest entries go at the bottom.

| Date | Area | Mistake | Fix or rule |
|------|------|---------|-------------|
| 2026-11-20 | Fairness gate | vitest 5's `fsModuleCache` made the solution run reuse the starter's transform, so the gate tested the starter twice and could never fail on a broken solution. | Fixed with `fsModuleCache: false` in `vitest.drills.config.mts`. Rule: prove a two-variant gate can fail by running it against a deliberately broken solution. |
| 2026-11-20 | Git | The feature branch was first cut from another session's branch in a shared checkout and picked up two foreign commits. | Rebuilt on `main` in a separate git worktree. Rule: run `git branch --show-current` immediately before branching, and give parallel work its own worktree. |
| 2026-11-20 | Plan | The plan gave no task ownership of the CSS for the index and drill pages. | A styling task (Task 19) was added. Rule: every user-visible surface in a plan needs a task that owns its stylesheet. |
| 2026-11-20 | Check tables | The plan marked a `comment-threads` check and a `posts-feed` check red, but one planted bug was not independently catchable and one row passed on the starter. | One assertion was added to each check (`Threads loaded: 2`; the `Could not load comments` alert before the retry). Rule: for every planted bug, plant it alone in the solution and require a red check, and trace every row on the starter before fixing the table. |
| 2026-11-20 | Fairness gate | The gate does not compare the starter's failing checks with the plan's table, so a stub starter passes. | Rule until the gate is tightened: reviewers trace each row by hand. |
| 2026-11-20 | Implementer hygiene | A scratch cleanup ran `rm -rf content` and removed a tracked folder; it was restored with `git checkout`. | Rule: delete only exact scratch paths you created, never a parent folder. |
| 2026-11-20 | Tooling | `tsc` failed with TS18003 when `tsconfig.drills.json` matched no starter files. | Added `"files": []` to `tsconfig.drills.json` so `tsc` passes with zero starter files. |
| 2026-11-20 | Lint | `drills/useProgress.ts` needed one `eslint-disable-next-line react-hooks/set-state-in-effect`, the first suppression in the repo. | Accepted: the hook must render empty first and load stored progress after mount. Do not copy the suppression elsewhere without the same reason. |
