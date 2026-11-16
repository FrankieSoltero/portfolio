# Stop at walls plan: review

- **Plan:** `docs/room-planner/plans/2026-11-16-stop-at-walls.md`
- **Date:** 2026-11-16, round 1, full council.
- **Verdict:** PASS (overall 87.8; pass needs 85 overall, 80 per dimension, no blocking violation).

| Dimension | Weight | Grader | Skeptic misses | Final |
|---|---|---|---|---|
| D1 Task decomposition & ordering | 15 | 86 | 0 | 86 |
| D2 Verifiability | 20 | 88 | 0 | 88 |
| D3 Spec fidelity & traceability | 20 | 86 | 0 | 86 |
| D4 Concreteness | 15 | 89 | 0 | 89 |
| D5 Risk & reversibility | 15 | 91 | 0 | 91 |
| D6 Consistency & completeness | 15 | 87 | 0 | 87 |

## Findings (all minor unless marked)

### D1 Task decomposition & ordering

The decomposition is sound. The pure stop function comes first, then the move wiring, then the live check, then the docs. The table makes the dependencies explicit and says "All tasks run one at a time, in the order of their numbers." Nothing security- or data-critical is ordered after the step that exposes it, and tests come first in Tasks 1 and 2. Two minor issues remain. Task 2 is large, since it bundles four move functions, `placeItem`, the store and action wiring, doc-comment rewrites and six test files in one commit. The `mistakes-handover.md` input to Task 4 sits outside the dependency table.

- (minor, mechanical) "| 2. Moves use it | `room-planner/domain/geometry.ts`, `room-planner/domain/geometry.test.ts`, `room-planner/domain/obstacles.ts`, `room-planner/domain/obstacle" — Split Task 2 into 2a (furniture: geometry.ts, placeItem, its tests) and 2b (obstacles), and 2c (store/actions wiring, doc comments, store/flow tests), each with its own dependency row and commit. This gives smaller review units and a more precise rollback.
- (minor, mechanical) "Consumes: the live-check record of Task 3 and the controller's `mistakes-handover.md` in the plan's lean-sdd workspace." — List the `mistakes-handover.md` input in the Task Dependency Table or name its producing step, so the dependency on the controller's accumulated notes appears in the ordering contract rather than only in Task 4's interfaces.

### D2 Verifiability

Verifiability is strong. Tasks 1 and 2 have exact commands with expected results, a numeric behaviour table, and a test-first rule that requires quoting the failing run. Task 3 has a 14-row do/expect table with exact stored-value assertions and a commit-match check. The done criteria are objective. Two minor gaps keep it in the 85-94 band. The Task 4 doc content has no command that checks it, and the doc-comment rewrite in Task 2 has no check.

- (minor, mechanical) "**Verify:** `npm run check` → exit 0; the numbers quoted in the README match its output." — Add checks for the doc edits, for example: grep the Status line in the spec for `approved by the owner on 2026-11-16`; grep README for the links to the spec, plan, plan review and live check; count `###` entries under `## 2026-11-16 — Stop at walls` and compare with the item count in `mistakes-handover.md`. Name the README lines that carry the test-file count, test count and First Load JS.
- (minor, mechanical) "Doc comments that say only the centre is kept inside (in `geometry.ts`, `obstacles.ts`, `planStore.ts`, `actions.ts`) are rewritten to state the new rule." — Add a Verify step such as `grep -n -i 'centre' room-planner/domain/geometry.ts room-planner/domain/obstacles.ts room-planner/state/planStore.ts room-planner/state/actions.ts` showing no remaining comment that says only the centre is kept inside.

### D3 Spec fidelity & traceability

Spec coverage is strong. Task 1 cites 'Behaviour' rows 1 to 7, 10 and 11, and Task 2 cites rows 1 to 4 and 8 to 11. Together they cover all 11 spec rows, the Testing bullets and 'What does not change'. Task 3 covers the spec's live-check bullet. Nothing the spec marks out of scope is implemented. Four minor fidelity gaps remain. The algorithm in step 6 goes beyond the spec's x-then-y step 3 without flagging it, and the 1e-6 epsilon differs from the spec's 0.0001. The 0.01 start tolerance is not in the spec. Task 4 cites no spec requirement. The plan calls the spec approved while the spec's Status still reads 'waiting'.

- (minor, owner-decision) "6. Candidates, each built with step 5: - x then y: ... - y then x: the same with the axes swapped; - one slide per distinct wall direction of the outline that i" — The spec's 'How it works' step 3 is x then y only, with a 0.0001 in tolerance and an 'x and y moves' slide. The plan adds y-then-x, wall-direction slides, nearest-candidate selection and a 1e-6 epsilon. Amend the spec's 'How it works' (Task 4 already edits the spec) or add a note in the plan saying this refines spec step 3 for the angled-wall and L-shape rows, so the spec and plan agree.
- (minor, owner-decision) "3. `eps` is `CONFIG.wallStopEpsilon` when `inside(from, CONFIG.wallStopEpsilon)` is true, otherwise `CONFIG.conflictEpsilon` (a piece stored up to 0.01 over a w" — The spec says a piece not wholly inside at the start moves freely and does not mention the 0.01 tolerance. Either cite or add this as a spec clarification, or confirm the owner accepts it.
- (minor, mechanical) "**Spec:** none of the spec's behaviour; this is the project rule that every change records its mistakes and keeps the planner README current." — Task 4 cites no spec requirement. Cite the spec's 'Known limits' (angled-wall lag) for the README line, and cite the project docs rule (CLAUDE.md) explicitly as the source.
- (minor, mechanical) "(approved by the owner on 2026-11-16)" — The spec file currently says 'Status: waiting for the owner's approval'. Task 4 flips it only at the end. Either update the spec Status before execution or note that the approval is recorded elsewhere.

### D4 Concreteness

The plan is highly concrete. Files, signatures, constants, commands and expected values are spelled out, and the tests have exact expected coordinates. Only a few minor path or input gaps remain: the mistakes-handover file path, the plan-review link target, the screenshot filenames, the store-test piece and the script location. None would send an executor down a wrong path.

- (minor, mechanical) "the controller's `mistakes-handover.md` in the plan's lean-sdd workspace" — Give the exact path of mistakes-handover.md, or say the dispatch supplies it as an absolute path.
- (minor, mechanical) "links to this spec, plan, plan review and live check" — Name the plan-review output file path (and the plan file path) the README links to. No file for the plan review is listed anywhere in the plan.
- (minor, mechanical) "Create: `docs/room-planner/verification/shots-stop-at-walls/`" — Only `bed-in-corner.png` is named, in W1. List the screenshot filenames the record must contain, or state that W1 is the only screenshot.
- (minor, mechanical) "Store: blocked nudge | default plan, a piece flush at a wall" — Name the piece (a catalog item or an explicit w, d, x, y) and the wall it sits flush against.
- (minor, mechanical) "as one script kept outside the repo" — Give the script's location, for example the scratchpad directory, so the commit does not need it and the run is repeatable.

### D5 Risk & reversibility

Risk is low and well handled. No stored data or schema changes, per-task commits, and an owner-gated merge give a clear revert path. The absence of a flag or migration is explicitly justified. Pieces already outside, a shrinking room and a blocked nudge are covered as failure paths. Two minor gaps remain. One is the unguarded kill-by-port step. The other is that the live-check scope is not stated as local-only.

- (minor, mechanical) "A dev server may be running on port 3478. Stop it by port (`lsof -ti tcp:3478 | xargs kill`) before `npm run check`; never stop a process by name." — Before the kill, require the executor to confirm the listener on 3478 is this repo's next dev process (for example `lsof -i tcp:3478` and check its cwd) and to stop only that. Otherwise report to the controller instead of killing it.
- (minor, mechanical) "Task 3 ... Commit: `Room planner: stop at walls live check`" — State that the live check runs only against localhost:3478 in the isolated Playwright profile and never against the deployed site. Say that screenshots under `shots-stop-at-walls/` must not contain real user data.

### D6 Consistency & completeness

The plan is consistent and well specified. The behavior tables agree with their own geometry; I checked the 147.5 room, the 60.5 piece, the quarter turn, the angled-wall slide, the box and the column. Verify lines and the plan-done criteria are objective commands or exact values. Sections do not contradict each other, and failure paths (start outside, 0.01 over a wall, blocked nudge adding no undo step, too-big piece) are covered. The remaining flaws are minor: an undefined `mistakes-handover.md` dependency, a plan-review file no task creates, a spec "approved" versus Status-line mismatch, ambiguous wording on whether new tests are allowed, and an unqualified "exactly". Because of these, and with no excellence quotes recorded, I did not score it 90 or above.

- (minor, mechanical) "Consumes: the live-check record of Task 3 and the controller's `mistakes-handover.md` in the plan's lean-sdd workspace." — Say who writes `mistakes-handover.md` and when. Give a fallback for when it is missing or empty, for example 'if absent or empty, record one entry for the reversed decision only'. Make 'one entry per item' checkable against it.
- (minor, mechanical) "links to this spec, plan, plan review and live check" — Name the plan-review file path. Either make creating it an explicit step or drop it from the README link list. No task in the plan produces it.
- (minor, mechanical) "**Spec:** `docs/room-planner/specs/2026-11-16-stop-at-walls-design.md` (approved by the owner on 2026-11-16)." — Task 4 changes the spec's Status line to `approved by the owner on 2026-11-16`, yet the header already calls the spec approved. Say that the spec's Status line currently differs and why, or drop the Task 4 row.
- (minor, mechanical) "a test may change only where it (a) calls one of the four move functions with a bounds argument (it now passes an outline), or (b) expects a piece that starts i" — State explicitly that new tests for the Task 2 behavior table may be added to the listed files. The 'may change only' wording could be read to forbid them, so one reader could fail Task 2 for adding tests.
- (minor, mechanical) "stored bed `x = 144 − hx`, `y = hy` exactly" — Define 'exactly' as equality after rounding to 0.01, or as a tolerance such as 0.005. Stored values are round2 and `hx` is computed from `w`, `d` and `angle`, so two readers could split on this.
