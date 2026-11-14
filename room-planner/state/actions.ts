import { addObstacle, newObstacle, updateObstacle } from '../domain/obstacles';
import { addOpening, openingSpan, slideOpening, updateOpening } from '../domain/openings';
import { insertCorner, moveCorner, type OutlineResult, removeCorner, snapCornerTarget } from '../domain/outline';
import { interiorPoint } from '../domain/polygon';
import type { Obstacle, Point } from '../domain/types';
import { ROOM_PROBLEM_TEXT, type RoomProblem, usePlanStore } from './planStore';
import { useUiStore } from './uiStore';

/** Cross-store actions: operations on the plan driven by the UI selection or lookup state. */

/** Turns the selected item `deg` degrees clockwise (a quarter turn by default); no-op when nothing is selected. */
export function rotateSelected(deg = 90): void {
  const id = useUiStore.getState().selectedId;
  if (id === null) return;
  usePlanStore.getState().rotateItemBy(id, deg);
}

/** Removes the selected item and clears the selection; no-op when nothing is selected. */
export function removeSelected(): void {
  const id = useUiStore.getState().selectedId;
  if (id === null) return;
  usePlanStore.getState().removeItem(id);
  useUiStore.getState().select(null);
}

/**
 * Places the previewed product in the room, selects it and ends the lookup; returns the new item's
 * id. Returns null and changes nothing when not in preview, or when the plan is full (the preview
 * is kept, so it can be placed once an item is removed).
 */
export function placePreview(): string | null {
  const ui = useUiStore.getState();
  if (ui.lookup.status !== 'preview') return null;
  const id = usePlanStore.getState().addItem(ui.lookup.product);
  if (id === null) return null;
  ui.select(id);
  ui.setLookup({ status: 'idle' });
  return id;
}

/**
 * Moves the selected item's centre by exactly (dx, dy) inches, with no grid snapping, kept inside
 * the room bounds; no-op when nothing is selected.
 */
export function nudgeSelected(dx: number, dy: number): void {
  const id = useUiStore.getState().selectedId;
  if (id === null) return;
  usePlanStore.getState().moveItemBy(id, dx, dy);
}

/**
 * Stores an outline edit through applyOutline and records the outcome for the room editor: a
 * refusal (by the outline rules, or because a door or window cannot follow) sets the room problem
 * to its text, an accepted edit clears it. Returns true when accepted.
 */
function applyRoomEdit(result: OutlineResult): boolean {
  return recordRoomOutcome(usePlanStore.getState().applyOutline(result));
}

/**
 * Records the outcome of a room edit for the room editor: a refusal sets the room problem to its
 * text, an accepted edit (null) clears it. Returns true when accepted.
 */
function recordRoomOutcome(problem: RoomProblem | null): boolean {
  useUiStore.getState().setRoomProblem(problem === null ? null : ROOM_PROBLEM_TEXT[problem]);
  return problem === null;
}

function hasCorner(id: string): boolean {
  return usePlanStore.getState().room.outline.some((c) => c.id === id);
}

/**
 * Moves corner `id` towards `target` (inches), snapped by snapCornerTarget (angle snapping when
 * `opts.angleSnap`, else the corner grid). An unknown corner changes nothing, the room problem included.
 */
export function dragCornerTo(id: string, target: Point, opts: { angleSnap: boolean; toleranceIn: number }): void {
  if (!hasCorner(id)) return;
  const { outline } = usePlanStore.getState().room;
  applyRoomEdit(moveCorner(outline, id, snapCornerTarget(outline, id, target, opts)));
}

/**
 * Splits wall `wallId` with a new corner near `at` (inches) and selects it; an unknown wall
 * changes nothing. A refused split leaves the selection as it was.
 */
export function addCornerOnWall(wallId: string, at: Point): void {
  if (!hasCorner(wallId)) return;
  const id = crypto.randomUUID();
  if (applyRoomEdit(insertCorner(usePlanStore.getState().room.outline, wallId, at, id))) {
    useUiStore.getState().selectCorner(id);
  }
}

/** Removes the selected corner and clears the corner selection; no-op when no corner is selected. */
export function removeSelectedCorner(): void {
  const id = useUiStore.getState().selectedCornerId;
  if (id === null || !hasCorner(id)) return;
  if (applyRoomEdit(removeCorner(usePlanStore.getState().room.outline, id))) {
    useUiStore.getState().selectCorner(null);
  }
}

/**
 * Moves the selected corner by exactly (dx, dy) inches, with no angle or grid snapping; no-op when
 * no known corner is selected.
 */
export function nudgeSelectedCorner(dx: number, dy: number): void {
  const id = useUiStore.getState().selectedCornerId;
  const { outline } = usePlanStore.getState().room;
  const corner = outline.find((c) => c.id === id);
  if (corner === undefined) return;
  applyRoomEdit(moveCorner(outline, corner.id, { x: corner.x + dx, y: corner.y + dy }));
}

/** The fields updateSelectedOpening may change: those of updateOpening. */
type OpeningPatch = Parameters<typeof updateOpening>[3];
/** The fields updateSelectedObstacle may change: those of updateObstacle. */
type ObstaclePatch = Parameters<typeof updateObstacle>[2];

function hasOpening(id: string): boolean {
  return usePlanStore.getState().openings.some((o) => o.id === id);
}

function findObstacle(id: string | null): Obstacle | undefined {
  return usePlanStore.getState().obstacles.find((o) => o.id === id);
}

/**
 * Places a door or window (the armed room tool) on wall `wallId`, centred on `at` (inches) projected
 * onto the wall and moved along it to fit. On success selects it and sets the tool back to 'corner';
 * a refusal shows its reason and keeps the tool armed. Does nothing while the tool is 'corner' or
 * for an unknown wall.
 */
export function placeOpeningOnWall(wallId: string, at: Point): void {
  const ui = useUiStore.getState();
  const kind = ui.roomTool;
  if (kind === 'corner' || !hasCorner(wallId)) return;
  const id = crypto.randomUUID();
  const plan = usePlanStore.getState();
  if (recordRoomOutcome(plan.applyOpenings(addOpening(plan.room.outline, plan.openings, kind, wallId, at, id)))) {
    useUiStore.getState().selectOpening(id);
    useUiStore.getState().setRoomTool('corner');
  }
}

/**
 * Slides door or window `id` along its wall to `offset` inches (rounded to 1 in and kept on the
 * wall; at a wall end it stays, which is not a refusal). An overlap is refused with its reason. An
 * unknown id changes nothing, the room problem included.
 */
export function slideOpeningTo(id: string, offset: number): void {
  if (!hasOpening(id)) return;
  const plan = usePlanStore.getState();
  recordRoomOutcome(plan.applyOpenings(slideOpening(plan.room.outline, plan.openings, id, offset)));
}

/** Slides the selected door or window `delta` inches along its wall; no-op when none is selected. */
export function slideSelectedOpening(delta: number): void {
  const id = useUiStore.getState().selectedOpeningId;
  const opening = usePlanStore.getState().openings.find((o) => o.id === id);
  if (opening === undefined) return;
  slideOpeningTo(opening.id, opening.offset + delta);
}

/** Below this |direction · u| a direction is across the wall and does not slide an opening. */
const ACROSS_THE_WALL = 1e-9;

/**
 * Slides the selected door or window `step` inches along its wall the way `direction` (a plan-space
 * vector, y down, such as an arrow key's) points: the offset changes by sign(direction · u) × step,
 * where u is the wall's direction, so on a wall running right to left a step to the right lowers the
 * offset. A direction across the wall (|direction · u| < 1e-9), no selection, or an opening whose wall
 * is not in the outline changes nothing, the room problem included.
 */
export function slideSelectedOpeningToward(direction: Point, step: number): void {
  const id = useUiStore.getState().selectedOpeningId;
  const { room, openings } = usePlanStore.getState();
  const opening = openings.find((o) => o.id === id);
  if (opening === undefined) return;
  const span = openingSpan(room.outline, opening);
  if (span === null) return;
  const along = direction.x * span.u.x + direction.y * span.u.y;
  if (Math.abs(along) < ACROSS_THE_WALL) return;
  slideSelectedOpening(Math.sign(along) * step);
}

/**
 * Changes fields of the selected door or window (those updateOpening allows for its kind); a value
 * that is not allowed is refused with its reason. No-op when none is selected.
 */
export function updateSelectedOpening(patch: OpeningPatch): void {
  const id = useUiStore.getState().selectedOpeningId;
  if (id === null || !hasOpening(id)) return;
  const plan = usePlanStore.getState();
  recordRoomOutcome(plan.applyOpenings(updateOpening(plan.room.outline, plan.openings, id, patch)));
}

/**
 * Adds a box, or a column as tall as the room, at the room's interior point and selects it; a
 * refusal (the room already has the most obstacles allowed) shows its reason and selects nothing.
 */
export function addObstacleAtCentre(shape: 'box' | 'cylinder'): void {
  const plan = usePlanStore.getState();
  const id = crypto.randomUUID();
  const obstacle = newObstacle(shape, interiorPoint(plan.room.outline), plan.room.height, id);
  if (recordRoomOutcome(plan.applyObstacles(addObstacle(plan.obstacles, obstacle)))) {
    useUiStore.getState().selectObstacle(id);
  }
}

/**
 * Moves obstacle `id`'s centre to (x, y) inches, its bounding box on the furniture grid, kept inside
 * the room bounds, and clears the room problem. An unknown id changes nothing, the room problem included.
 */
export function dragObstacleTo(id: string, x: number, y: number): void {
  if (findObstacle(id) === undefined) return;
  usePlanStore.getState().moveObstacleTo(id, x, y);
  recordRoomOutcome(null);
}

/**
 * Moves the selected obstacle's centre by exactly (dx, dy) inches, kept inside the room bounds, and
 * clears the room problem; no-op when no known obstacle is selected.
 */
export function nudgeSelectedObstacle(dx: number, dy: number): void {
  const obstacle = findObstacle(useUiStore.getState().selectedObstacleId);
  if (obstacle === undefined) return;
  usePlanStore.getState().moveObstacleBy(obstacle.id, dx, dy);
  recordRoomOutcome(null);
}

/** Turns the selected obstacle `deg` degrees clockwise; no-op when no known obstacle is selected. */
export function rotateSelectedObstacle(deg: number): void {
  const obstacle = findObstacle(useUiStore.getState().selectedObstacleId);
  if (obstacle === undefined) return;
  const plan = usePlanStore.getState();
  recordRoomOutcome(plan.applyObstacles(updateObstacle(plan.obstacles, obstacle.id, { rotation: obstacle.rotation + deg })));
}

/**
 * Changes fields of the selected obstacle (those updateObstacle allows); a value that is not allowed
 * is refused with its reason. No-op when no known obstacle is selected.
 */
export function updateSelectedObstacle(patch: ObstaclePatch): void {
  const obstacle = findObstacle(useUiStore.getState().selectedObstacleId);
  if (obstacle === undefined) return;
  const plan = usePlanStore.getState();
  recordRoomOutcome(plan.applyObstacles(updateObstacle(plan.obstacles, obstacle.id, patch)));
}

/**
 * Removes whichever of the selected corner (as removeSelectedCorner), door or window, or obstacle is
 * selected, and clears that selection on success. No-op when nothing known is selected.
 */
export function removeSelectedRoomThing(): void {
  const { selectedCornerId, selectedOpeningId, selectedObstacleId } = useUiStore.getState();
  if (selectedCornerId !== null) {
    removeSelectedCorner();
    return;
  }
  if (selectedOpeningId !== null && hasOpening(selectedOpeningId)) {
    usePlanStore.getState().removeOpening(selectedOpeningId);
    recordRoomOutcome(null);
    useUiStore.getState().selectOpening(null);
    return;
  }
  const obstacle = findObstacle(selectedObstacleId);
  if (obstacle === undefined) return;
  usePlanStore.getState().removeObstacle(obstacle.id);
  recordRoomOutcome(null);
  useUiStore.getState().selectObstacle(null);
}
