# Plan review: Room Planner workspace

Plan: `Docs/plans/2026-11-12-room-planner-workspace.md`
Date: 2026-11-12

## Verdict: PASS (round 2, overall 85.4/100)

Gate: overall ≥ 85, every dimension ≥ 80, zero blocking violations. Round 1 was BLOCKED at 79.2 with 6 blocking violations. Round 2 re-graded the dimensions that failed round 1; the others were carried forward unchanged, so their listed violations describe the round-1 plan.

## Scores

| Dimension | Weight | Round 1 | Round 2 grader | Skeptic misses | Round 2 final |
|---|---|---|---|---|---|
| D1 Task decomposition & ordering | 15 | 80 | 80 | 0 | 80 |
| D2 Verifiability | 20 | 72 | 88 | 0 | 88 |
| D3 Spec fidelity & traceability | 20 | 78 | 91 | 2 | 84 |
| D4 Concreteness | 15 | 88 | 88 | 0 | 88 |
| D5 Risk & reversibility | 15 | 86 | 86 | 0 | 86 |
| D6 Consistency & completeness | 15 | 74 | 86 | 0 | 86 |

## Owner decisions taken between rounds

- Lighting is accepted when the owner approves a side-by-side comparison in the browser.
- Arrow keys nudge the selected item (1 in, 12 in with Shift). Room edge handles stay pointer-only.

## Round 2 violations (all minor)

### D1 Task decomposition & ordering (carried forward from round 1)

Not re-graded. Its round-1 findings were addressed by the plan revision (task splits, token reader moved, version pins, backup commit).

### D2 Verifiability

- **minor / mechanical** — Done criteria / verifications objective (two readers same verdict)
  - Quote: L14 \| Resize the window to 1100×700 and back \| both views refit without overflow or blank canvas
  - Fix: State a measurable check, e.g. document.documentElement.scrollWidth <= innerWidth, and canvas width/height equal pane size times pixel ratio, read in the console.
- **minor / mechanical** — Concrete verification with observable result
  - Quote: 3D view fills the stage with a bed and a desk in a room with a plank floor
  - Fix: Replace with checkable facts: canvas bounding rect equals stage rect; two [data-item-id] entries in the list; floor texture visible in a named screenshot comparison.
- **minor / owner-decision** — Objective done criteria (not felt)
  - Quote: Adjust `CONFIG.hemiIntensity` and `CONFIG.sunIntensity` so the app capture is close to the prototype capture
  - Fix: The owner-approval gate is explicit, but add an objective pre-check (e.g. mean luminance of the floor region within a stated percentage) before asking for approval.
- **minor / mechanical** — Every behaviour row has a concrete verification command
  - Quote: \| No empty test runs \| `vite.config.ts` \| `passWithNoTests` removed, so a run that matches no tests fails \|
  - Fix: Add a Verify line: `grep -c passWithNoTests vite.config.ts` returns 0.
- **minor / mechanical** — Concrete expected result
  - Quote: loading card for about 1 s, then the preview card
  - Fix: Specify a range, e.g. loading card visible between 0.8 and 1.2 s, or reference the 900 ms CONFIG value.

### D3 Spec fidelity & traceability

- **minor / mechanical** — Every spec requirement covered by a task (traceability completeness)
  - Quote: \| three.js port notes \| colour space, light units, no `preserveDrawingBuffer` \| 15, 16, 20 \|
  - Fix: Add a traceability row for the spec port note 'Token colours for 3D come from getComputedStyle once the stylesheet has loaded', mapped to Tasks 10, 15, 16 and 17. Task 10's readTokens covers it, but the table never cites it.
- **minor / mechanical** — Spec requirement 'Starting a new lookup, discarding, or unmounting aborts the previous one' fully covered
  - Quote: \| Discard \| click `Discard` \| lookup idle; link field empty; no item added \|
  - Fix: Add a behaviour row stating whether Discard aborts the in-flight signal, or note that Discard is only reachable in the preview state where nothing is in flight. Stale and unmount are covered; discard is not tied to abort.
- **minor / mechanical** — Nothing in the plan beyond the spec (no invented requirements)
  - Quote: `npm audit --omit=dev` → no high or critical.
  - Fix: The spec lists no dependency-audit requirement, and neither the traceability table nor Done criteria 2 cites a source for it. Cite the corporate security standard as the origin, or mark it as an explicit plan addition.
- **minor / mechanical** — The plan's claims about the spec are accurate (misquoting scope = violation).
  - Quote: Files in this plan that the spec's layout did not list: `README.md` (project readme), `src/styles/tokens.ts` (token reader shared by both 3D views), `src/view/blueprintDraw.ts` (the canvas drawing routine, split from the component so it can
  - Fix: List every file the spec's layout omits. That means also `src/state/actions.ts` (Task 9: rotateSelected, removeSelected, placePreview, nudgeSelected), `src/test/setup.ts` (Task 1) and `Docs/verification/*` (Task 20). Then either add them to the spec's `state/`, `src/` and `Docs/` layout entries, or drop the claim that the spec's layout 'has been updated to match'. The spec's `state/` entry currently names only planStore.ts, uiStore.ts and selectors.ts.
- **minor / mechanical** — The plan's claims about the spec are accurate / the plan must not restate a spec rule with a different scope.
  - Quote: If README and prototype disagree, the prototype wins; add a line to `Docs/mistakes-and-fixes.md`.
  - Fix: Restate the spec's rule (Scope, lines 21-23) with its original scope: 'The README is the behavioural contract; where README and prototype disagree on maths, the prototype's maths wins and the difference is recorded in `Docs/mistakes-and-fixes.md`. For sizes, copy and colours the README wins.' As written, the prototype can override the README's copy and colours, and the spec does not allow that.

### D4 Concreteness (carried forward from round 1)

Not re-graded. Its round-1 findings were addressed by the plan revision (task splits, token reader moved, version pins, backup commit).

### D5 Risk & reversibility (carried forward from round 1)

Not re-graded. Its round-1 findings were addressed by the plan revision (task splits, token reader moved, version pins, backup commit).

### D6 Consistency & completeness

- **minor / mechanical** — D6 reproducible pass/fail: verification criteria that two readers could judge differently
  - Quote: L14 \| Resize the window to 1100×700 and back \| both views refit without overflow or blank canvas
  - Fix: Give objective checks, for example: document.documentElement.scrollWidth <= innerWidth and scrollHeight <= innerHeight, and the plan room rectangle and 3D canvas each have non-zero width and height within their pane rectangle (+/- 2 px) after resize and after resizing back.
- **minor / mechanical** — D6 reproducible pass/fail (subjective 'orbits with the pointer')
  - Quote: L5 \| Back to inset; drag in the 3D view; scroll over it \| the room orbits with the pointer; scrolling zooms and the page does not scroll
  - Fix: State measurable results: after a 100 px horizontal drag the view has rotated in the drag direction (blueprint labels or room edges move), and window.scrollY is unchanged after a wheel event over the stage.
- **minor / mechanical** — D6 reproducible pass/fail ('stays under the pointer')
  - Quote: L9 \| Drag the right wall handle left past the desk \| Width input and the dimension label update while dragging; the wall stays under the pointer;
  - Fix: Define the tolerance: the handle centre is within 2 px of the pointer x at pointerup, consistent with the L15 2 px rule.
- **minor / mechanical** — D6 reproducible pass/fail ('about 1 s', 'centred')
  - Quote: L11 \| Click `Sofa`, wait, click `Place in room` \| loading card for about 1 s, then the preview card; the sofa appears centred and selected in both views
  - Fix: Say the loading card is visible and the preview card appears within 900 ms to 1.5 s, and 'centred' means the item's x,y equal centrePosition (x 30, y 66 for the sofa), read from the list or plan.
- **minor / mechanical** — D6 reproducible pass/fail ('same angle')
  - Quote: L6 \| Choose `Blueprint` \| line drawing of the same room from the same angle, with `12′ 0″`, `14′ 0″`, `8′ 0″` labels
  - Fix: Replace 'same angle' with 'camera yaw and pitch equal CONFIG.camera values, and no camera reset occurs on switching', or drop the phrase and keep the label check.
- **minor / mechanical** — D6 internal contradiction between sections
  - Quote: Nothing in this plan deploys, migrates or stores data. Every task is one commit, and the rollback for any task is `git revert <that commit>`.
  - Fix: Task 1 makes two commits (the backup commit `chore: add design handoff and docs` and the scaffold commit). Reword to 'Every task is one commit, except Task 1, which makes two (backup first); rollback of the scaffold is git revert of the second.'

## Round 1 blocking violations (resolved)

- D2 Verifiability: Every task carries a concrete verification: exact command and expected observable result — Add a test for `drawBlueprint` using a recording fake CanvasRenderingContext2D (or a mocked 2D context) that asserts draw order, dashed-line dash arrays and the canvas backing-store size from the Behavior table, and put 
- D2 Verifiability: Verification must be a concrete command/check with an expected observable result, not subjective — Replace 'by eye' with an objective criterion, for example a named screenshot pair at 1440x900 with a stated tolerance (mean pixel luminance of the floor and one wall within X%), or fixed target values for hemiIntensity a
- D6 Consistency & completeness: D6: no contradictions between the plan's own sections — Either add test files for the untested Task 13 rows (modelKey, group cache, outline, camera, resize, WebGL-unavailable, unmount, tokens-not-ready, using a mocked three renderer) and Task 14 rows (drawBlueprint with a stu
- D6 Consistency & completeness: D6: two readers reach the same pass/fail; completeness (Task 13 table rows such as modelKey, Group cache, Outline, Camera, Unmount have no test file; only furnitureModels.test.ts exists) — Add test files covering modelSource.ts and SceneRenderer/ThreeView rows, or name which rows are only checked in Task 15 live and give each an objective observable (e.g. a console assertion or DOM check) there.
- D6 Consistency & completeness: D6: criterion one reader could call passed and another failed (subjective 'by eye' match) — Replace with an objective check, e.g. a fixed tolerance on mean luminance of the floor and a lit furniture face compared with a prototype screenshot at 1440x900, or state the exact intensity values and make them an exact
- D6 Consistency & completeness: D6: done criteria 'compare side by side' and 'the live checklist above completed' have no pass/fail definition per item — Give each checklist item an observable expected result (e.g. 'Swap: plan and 3D panes exchange, selection unchanged') and a tolerance for visual difference, or reference the README measurements to check (sizes, copy, col
