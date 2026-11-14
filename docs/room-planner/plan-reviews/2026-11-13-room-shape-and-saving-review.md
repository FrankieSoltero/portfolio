# Plan review: Room shape, free rotation and saving

Plan: `docs/room-planner/plans/2026-11-13-room-shape-and-saving.md`
Date: 2026-11-13. Gate: overall at least 85, every dimension at least 80, no blocking
violation.

## Verdict: BLOCKED by the council; executed on the owner's decision of 2026-11-13

The three-round cap is reached. The plan was corrected after round 3, and those
corrections have not been reviewed. Executing needs either a fresh review that passes
or the owner's explicit decision.

## Scores

| Dimension | Weight | Round 1 | Round 2 | Round 3 |
|---|---|---|---|---|
| D1 Task decomposition and ordering | 15 | 82 | carried (82) | 86 |
| D2 Verifiability | 20 | 87 | carried (87) | 89 |
| D3 Spec fidelity and traceability | 20 | 88 | carried (88) | 87 |
| D4 Concreteness | 15 | 88 | carried (88) | 86 (grader 91, one skeptic miss) |
| D5 Risk and reversibility | 15 | 86 | carried (86) | 91 |
| D6 Consistency and completeness | 15 | 72 | 78 | 78 |
| **Overall** | | **84.2** | **85.1** | **86.4** |
| Blocking violations | | 2 | 0 | 1 |

Round 2 re-graded only D6. Round 3 re-graded all six on the revised plan.

## What blocked each round

All blocking findings were errors in the plan's own worked examples or check rows, not
in the design.

| Round | Blocking finding | Fix applied |
|---|---|---|
| 1 | Task 7 example: two 20×20 boxes 25 in apart were said to overlap when one is turned 45°. They do not (14.142 + 10 < 25). | Distance changed to 23 in, with the arithmetic shown. |
| 1 | Live check said every row starts from cleared storage, but several rows needed the previous row's state. | Rows now run in order; a row says "Fresh" when it clears storage. |
| 3 | Live row B13 acted on the bed after row B12 had replaced the items with a fixture that has no bed. | B13 now acts on the fixture's box. |

## Non-blocking findings and what was done

- **Round 1:** oversized tasks (data switch, saving, docs plus verification) were
  split, taking the plan from 14 to 18 tasks; subjective expectations were made
  measurable; starting shapes went back to one click as the spec says; on-plan wall
  labels (not in the spec) were dropped; a plan saved by a newer version is now left
  untouched; a release gate and rollback order were added.
- **Round 2 (D6 only):** an angle-snap example that was within tolerance of two lines;
  a clearance row whose expected line could not exist; an ambiguous small-room notch;
  a grep that missed three removed names; screenshot-judged rows; one file marked
  Create that exists. All corrected.
- **Round 3:** a "move corner refused" example that did not actually self-cross; the
  reset flow contradicting itself when clearing storage fails and in a newer-version
  session; the plan drag after the data switch and the Task 2 test that depends on a
  removed function; unnamed items in the keyboard row; a few rows still judged from
  screenshots; no named fake store for tests; missing review path in the docs task.
  All corrected in the plan after the round.

## Pattern

D6 stayed below its floor in every round because each fix round left new
inconsistencies in hand-written examples and in the order-dependent live-check rows.
After round 3 the author re-derived every numeric example in Tasks 1, 2, 3, 6 and 9
and every live-check row's starting state by hand.

## Note on the review tool

Round 2 raised its "non-convergence" flag (overall moved 0.9). That round re-graded
one dimension of weight 15, so the overall could move by at most 4.2 points, and no
finding recurred between rounds. Proposal for the tool: when only some dimensions are
re-graded, compare those dimensions' scores between rounds instead of the overall.

## Fresh review of the corrected plan (owner's choice, 2026-11-13)

| Dimension | Score |
|---|---|
| D1 Task decomposition and ordering | 82 |
| D2 Verifiability | 90 |
| D3 Spec fidelity and traceability | 86 |
| D4 Concreteness | 88 |
| D5 Risk and reversibility | 90 |
| D6 Consistency and completeness | 84 |
| **Overall** | **86.8** |

Every score threshold was met. Verdict: **BLOCKED** on one blocking violation: the
data model switch (then Task 9) bundled the type change, the conflict rewrite, the
area change, the sidebar rewiring and an open-ended sweep of test fixtures in one
commit.

Fix applied after this review (not yet reviewed): the task was split into four.
Conflicts are re-implemented on outlines first (Task 9), floor area takes a number
(Task 10), every test builds rooms and items through helper functions (Task 11, with
the 18 affected test files listed by name), and the switch itself (Task 12) is then
limited to a named list of files. The plan now has 21 tasks. The review's minor
findings were also applied, including two wrong test-file names in the plan
(`useKeyboardShortcuts.test.tsx`, `bars.test.tsx`).

## Owner decision (2026-11-13)

Shown the result above, the owner chose "Build now": execute the corrected 21-task
plan without a further review round. Each task is reviewed as it is built and the
whole branch is reviewed at the end.

## Open owner decisions

1. Plan decisions 1 to 3 (magnetic angle snapping, furniture not held inside the room,
   edge handles removed) were put to the owner on 2026-11-13 and are unanswered.
