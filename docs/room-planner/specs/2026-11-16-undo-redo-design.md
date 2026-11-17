# Design: undo and redo (slice E)

Date: 2026-11-16. Status: approved by the owner on 2026-11-16. Three details were settled
while planning and are marked "(planning)" below.
Branch: `undo-redo`, from `main` at `14a106e`. Delivered as its own pull request.

## Why

The planner has no undo. A wrong drag, a deleted piece of furniture or a starting shape
chosen by mistake can only be repaired by hand. This is the first of three slices that close
the gaps a visitor notices; the owner chose the order on 2026-11-16.

## Owner decisions (2026-11-16)

| Question | Answer |
|---|---|
| Order of the remaining work | Undo first, then sharing (share link and a picture of the plan), then the product lookup. One pull request each. |
| Phone layout | Not built. The planner stays desktop only. |
| Product lookup | Open. Direction: bring the product in and let the visitor change its size. Designed in its own round. |

## Behaviour

### What one step is

Undo takes back one thing the visitor did, as they would describe it:

| The visitor did | One undo step |
|---|---|
| Dragged something (furniture, wall, corner, door, window, obstacle) | The whole drag, from press to release |
| Pressed arrow keys or R several times on the same thing | The whole run, until 1 second passes without a key or something else is changed |
| Typed in a sidebar field (a wall length, width, ceiling, a door's size, an obstacle's size or name) | Everything typed in that field until focus leaves it |
| Typed a length on the plan and pressed Enter | That one length |
| Added or removed furniture, a corner, a door, a window, an obstacle | That one add or remove |
| Chose a starting shape (Rectangle, L-shape, Notched) | The whole change of shape |

An action that was refused, or that changed nothing, adds no step.

### What undo covers

- Covered: everything saved in the plan. The room's outline and ceiling height, doors,
  windows, obstacles, and furniture (added, moved, turned, removed).
- Not covered: the units choice (ft/in or m/cm), what is selected, room mode or furnish
  mode, the layout tabs, the 3D camera, the product link field. Undo never changes these,
  with one exception: a selection that points at something undo removed is cleared.
- Undo works the same in both modes and follows one timeline. In furnish mode it can take
  back a room edit made earlier, and the other way round.

### Controls

- Keys: Cmd+Z (Ctrl+Z on Windows and Linux) undoes. Shift+Cmd+Z, Shift+Ctrl+Z and Ctrl+Y redo.
- Two buttons in the header, beside the "Room planner" title: "Undo" and "Redo", each greyed
  out when there is nothing to undo or redo. (planning: the header, not the bar above the
  stage, because undo acts on the whole plan. A greyed-out button stays focusable, so
  keyboard focus is not lost when the last step is undone.)
- While the cursor is in a text field the keys keep the browser's own text undo, so they
  never take back a plan step by surprise. The buttons always act on the plan.
- The keys and buttons do nothing while a drag is in progress.
- Each undo and redo is announced to screen readers ("Undone", "Redone").

### History rules

- The history holds the last 100 steps. Older steps are dropped.
- Doing anything new after an undo discards the steps that could have been redone.
- The history lasts for the visit. Reloading the page keeps the plan (as today) and starts
  an empty history. The history is not saved.
- The plan is saved after an undo or redo the same way as after any other change.
- "Reset plan" clears the history. (planning: it is a confirmed start-over that also erases
  the saved plan, so it is not a step that undo can take back.)

## How it is built

- A new history module keeps two lists of earlier plans (to undo, to redo). The plan is
  already replaced, never changed in place, so a step is a reference to an earlier plan and
  costs almost no memory.
- The history watches the plan store. A change opens a new step unless it belongs to the
  current group. Groups are declared where the action starts: drags open a group on press
  and close it on release; key runs and field typing name their group (the thing and the
  kind of change), and a change with the same name within 1 second (keys) or in the same
  field visit joins it.
- Undo and redo put an earlier plan back through the store's existing `reset`, keeping the
  current units.
- No new package. No change to the saved-plan format (schema v3) or its key.
- Nothing is sent anywhere; the history stays in the page's memory.

## Decisions made here, for the owner to confirm

1. Units are left out of undo.
2. In a text field, the undo keys belong to the text, not the plan.
3. The history is cleared by a reload.
4. 100 steps.
5. No list of past steps and no names on steps ("Undo move sofa"); the buttons just say
   Undo and Redo.

## Not in this slice

- Sharing and the product lookup (the next two slices).
- A history panel, named steps, history that survives a reload.
- Fixing the two-tabs overwrite.

## Verification

- Unit tests for the history module (grouping, the 100-step cap, redo discarded by a new
  change, refused actions add nothing).
- Component tests for the keys, the buttons and their disabled states, and text fields.
- A live browser check on the final commit: one row per line of the "one step" table, plus
  undo across modes, redo, reload, and a clean console.
- `npm run check` passes; the page's First Load JS is reported.
