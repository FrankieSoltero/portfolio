import { useEffect } from 'react';
import { CONFIG } from '../config';
import {
  nudgeSelected,
  nudgeSelectedCorner,
  nudgeSelectedObstacle,
  removeSelected,
  removeSelectedRoomThing,
  rotateSelected,
  rotateSelectedObstacle,
  slideSelectedOpeningToward,
} from '../state/actions';
import { useUiStore } from '../state/uiStore';

/** R turns the selected item by the coarse step; Shift+R by the fine step (degrees clockwise). */
export const ROTATE_STEP_COARSE = 90;
export const ROTATE_STEP_FINE = 15;

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1],
};

/** True when the event target is a form field; radios count only when `includeRadio` is set. */
function inFormField(target: EventTarget | null, includeRadio: boolean): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return includeRadio || target.type !== 'radio';
  return false;
}

/**
 * Room mode acts on the selected corner, door or window, or obstacle (at most one is selected).
 * Arrows nudge a corner or an obstacle, and slide a door or window along its wall the way the arrow
 * points on screen (an arrow across the wall does nothing); Shift takes the large step. R turns an obstacle 90°, Shift+R 15°.
 * Delete/Backspace remove the selected thing. Escape disarms an armed door or window tool, or else
 * clears the room selection.
 */
function onRoomKeyDown(e: KeyboardEvent): void {
  const { selectedCornerId, selectedOpeningId, selectedObstacleId, roomTool } = useUiStore.getState();
  const anySelected = selectedCornerId !== null || selectedOpeningId !== null || selectedObstacleId !== null;
  if (!anySelected && roomTool === 'corner') return;

  const arrow = ARROWS[e.key];
  if (arrow) {
    if (!anySelected || inFormField(e.target, true)) return;
    e.preventDefault();
    const step = e.shiftKey ? CONFIG.nudgeStepLarge : CONFIG.nudgeStep;
    if (selectedCornerId !== null) nudgeSelectedCorner(arrow[0] * step, arrow[1] * step);
    else if (selectedOpeningId !== null) slideSelectedOpeningToward({ x: arrow[0], y: arrow[1] }, step);
    else nudgeSelectedObstacle(arrow[0] * step, arrow[1] * step);
    return;
  }

  if (inFormField(e.target, false)) return;
  if (e.key === 'r' || e.key === 'R') {
    if (selectedObstacleId !== null) rotateSelectedObstacle(e.shiftKey ? ROTATE_STEP_FINE : ROTATE_STEP_COARSE);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (anySelected) removeSelectedRoomThing();
  } else if (e.key === 'Escape') {
    const ui = useUiStore.getState();
    if (roomTool !== 'corner') ui.setRoomTool('corner');
    else {
      ui.selectCorner(null);
      ui.selectOpening(null);
      ui.selectObstacle(null);
    }
  }
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (useUiStore.getState().mode === 'room') {
    onRoomKeyDown(e);
    return;
  }
  if (useUiStore.getState().selectedId === null) return;

  const arrow = ARROWS[e.key];
  if (arrow) {
    // Every input, radios included, keeps its native arrow behaviour (segmented controls).
    if (inFormField(e.target, true)) return;
    e.preventDefault();
    const step = e.shiftKey ? CONFIG.nudgeStepLarge : CONFIG.nudgeStep;
    nudgeSelected(arrow[0] * step, arrow[1] * step);
    return;
  }

  // Prototype lines 275–281: text fields swallow these keys, a focused radio does not.
  if (inFormField(e.target, false)) return;
  // Shift decides the step, not the letter's case: caps-lock R without Shift is a coarse turn.
  if (e.key === 'r' || e.key === 'R') rotateSelected(e.shiftKey ? ROTATE_STEP_FINE : ROTATE_STEP_COARSE);
  else if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
  else if (e.key === 'Escape') useUiStore.getState().select(null);
}

/**
 * Workspace shortcuts. Furnish mode acts on the selected item: R turns it 90°, Shift+R 15°,
 * Delete/Backspace remove, Escape deselect, arrows nudge. Room mode acts on the selected corner,
 * door or window, or obstacle, and Escape also disarms the door and window tools (see onRoomKeyDown).
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
