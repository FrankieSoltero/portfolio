import {
  insertCorner,
  moveCorner,
  OUTLINE_PROBLEM_TEXT,
  type OutlineResult,
  removeCorner,
  snapCornerTarget,
} from '../domain/outline';
import type { Point } from '../domain/types';
import { usePlanStore } from './planStore';
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

/** Places the previewed product in the room, selects it and ends the lookup; no-op unless in preview. */
export function placePreview(): void {
  const ui = useUiStore.getState();
  if (ui.lookup.status !== 'preview') return;
  const id = usePlanStore.getState().addItem(ui.lookup.product);
  ui.select(id);
  ui.setLookup({ status: 'idle' });
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
 * refusal sets the room problem to its text, an accepted edit clears it. Returns true when accepted.
 */
function applyRoomEdit(result: OutlineResult): boolean {
  const accepted = usePlanStore.getState().applyOutline(result);
  useUiStore.getState().setRoomProblem(result.ok ? null : OUTLINE_PROBLEM_TEXT[result.problem]);
  return accepted;
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
