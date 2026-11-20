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
  slideSelectedWallToward,
} from '../state/actions';
import { redo, runKeyed, undo } from '../state/historyStore';
import { useUiStore } from '../state/uiStore';
import { isTextField } from './textField';

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
 * True when the event target is inside the item editor (`[data-item-editor]`) and is a form field,
 * radios included, or, when `includeButton` is set, a button. The editor's radios and swatch
 * buttons take keys of their own, so item shortcuts must not act on them.
 */
function inItemEditor(target: EventTarget | null, includeButton: boolean): boolean {
  if (!(target instanceof Element) || target.closest('[data-item-editor]') === null) return false;
  return inFormField(target, true) || (includeButton && target instanceof HTMLButtonElement);
}

/** The kinds of thing a key press acts on. A wall's id is its starting corner's id, so the key names the kind too. */
type KeyedKind = 'item' | 'corner' | 'wall' | 'opening' | 'obstacle';

/**
 * Runs a nudge, slide or turn of the thing of `kind` with `id` keyed to it, so a quick run of key
 * presses on one thing is one undo step.
 */
function keyed(kind: KeyedKind, id: string, change: () => void): void {
  runKeyed('keys:' + kind + ':' + id, change);
}

/**
 * The letter a history shortcut is read from: `e.key` in lower case when it is a Latin letter, so
 * layouts that move the letters (Dvorak, AZERTY) go by letter; otherwise, as on a Cyrillic layout,
 * the physical key: `KeyZ` counts as z and `KeyY` as y.
 */
function historyLetter(e: KeyboardEvent): string {
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase();
  if (e.code === 'KeyZ') return 'z';
  if (e.code === 'KeyY') return 'y';
  return '';
}

/**
 * Ctrl or Cmd+Z is undo; Ctrl or Cmd+Shift+Z, and Ctrl+Y without Cmd or Shift, are redo. Any
 * combination with Alt is neither. The letter counts in either case (see historyLetter).
 */
function historyKey(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (e.altKey) return null;
  const key = historyLetter(e);
  if ((e.metaKey || e.ctrlKey) && key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (e.ctrlKey && !e.metaKey && !e.shiftKey && key === 'y') return 'redo';
  return null;
}

/**
 * Room mode acts on the selected corner, wall, door or window, or obstacle (at most one is selected).
 * Arrows nudge a corner or an obstacle, slide a wall in or out the way the arrow points on screen (an
 * arrow along the wall does nothing), and slide a door or window along its wall the way the arrow
 * points on screen (an arrow across the wall does nothing); Shift takes the large step. R turns an obstacle 90°, Shift+R 15°.
 * Delete/Backspace remove the selected corner, door or window, or obstacle; a wall is not removed.
 * Escape disarms an armed door or window tool, or else clears the room selection.
 */
function onRoomKeyDown(e: KeyboardEvent): void {
  const { selectedCornerId, selectedWallId, selectedOpeningId, selectedObstacleId, roomTool } = useUiStore.getState();
  const anySelected =
    selectedCornerId !== null || selectedWallId !== null || selectedOpeningId !== null || selectedObstacleId !== null;
  if (!anySelected && roomTool === 'corner') return;

  const arrow = ARROWS[e.key];
  if (arrow) {
    if (!anySelected || inFormField(e.target, true)) return;
    e.preventDefault();
    const step = e.shiftKey ? CONFIG.nudgeStepLarge : CONFIG.nudgeStep;
    if (selectedCornerId !== null) {
      keyed('corner', selectedCornerId, () => nudgeSelectedCorner(arrow[0] * step, arrow[1] * step));
    } else if (selectedWallId !== null) {
      keyed('wall', selectedWallId, () => slideSelectedWallToward({ x: arrow[0], y: arrow[1] }, step));
    } else if (selectedOpeningId !== null) {
      keyed('opening', selectedOpeningId, () => slideSelectedOpeningToward({ x: arrow[0], y: arrow[1] }, step));
    } else if (selectedObstacleId !== null) {
      keyed('obstacle', selectedObstacleId, () => nudgeSelectedObstacle(arrow[0] * step, arrow[1] * step));
    }
    return;
  }

  if (inFormField(e.target, false)) return;
  if (e.key === 'r' || e.key === 'R') {
    if (selectedObstacleId !== null) {
      keyed('obstacle', selectedObstacleId, () => rotateSelectedObstacle(e.shiftKey ? ROTATE_STEP_FINE : ROTATE_STEP_COARSE));
    }
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (anySelected) removeSelectedRoomThing();
  } else if (e.key === 'Escape') {
    const ui = useUiStore.getState();
    if (roomTool !== 'corner') ui.setRoomTool('corner');
    else {
      ui.selectCorner(null);
      ui.selectWall(null);
      ui.selectOpening(null);
      ui.selectObstacle(null);
    }
  }
}

function onKeyDown(e: KeyboardEvent): void {
  const history = historyKey(e);
  if (history !== null) {
    // In a text field the browser's own text undo runs instead. A select, a colour input and the
    // like have none, so there the plan's undo runs.
    if (isTextField(e.target)) return;
    e.preventDefault();
    if (history === 'undo') undo();
    else redo();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (useUiStore.getState().mode === 'room') {
    onRoomKeyDown(e);
    return;
  }
  const { selectedId } = useUiStore.getState();
  if (selectedId === null) return;

  const arrow = ARROWS[e.key];
  if (arrow) {
    // Every input, radios included, keeps its native arrow behaviour (segmented controls), and so
    // does a button in the item editor.
    if (inFormField(e.target, true) || inItemEditor(e.target, true)) return;
    e.preventDefault();
    const step = e.shiftKey ? CONFIG.nudgeStepLarge : CONFIG.nudgeStep;
    keyed('item', selectedId, () => nudgeSelected(arrow[0] * step, arrow[1] * step));
    return;
  }

  // Prototype lines 275–281: text fields swallow these keys, a focused radio does not.
  if (inFormField(e.target, false)) return;
  // Shift decides the step, not the letter's case: caps-lock R without Shift is a coarse turn.
  // In the item editor a radio swallows R, and a radio or button swallows Delete and Backspace.
  if (e.key === 'r' || e.key === 'R') {
    if (inItemEditor(e.target, false)) return;
    keyed('item', selectedId, () => rotateSelected(e.shiftKey ? ROTATE_STEP_FINE : ROTATE_STEP_COARSE));
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!inItemEditor(e.target, true)) removeSelected();
  } else if (e.key === 'Escape') useUiStore.getState().select(null);
}

/**
 * Workspace shortcuts. In both modes Ctrl or Cmd+Z undoes and Ctrl or Cmd+Shift+Z or Ctrl+Y redoes,
 * except in a text field (see isTextField), where the browser's own text undo runs. Furnish mode acts on the selected
 * item: R turns it 90°, Shift+R 15°, Delete/Backspace remove, Escape deselect, arrows nudge. R,
 * Delete, Backspace and the arrows do not act on a field or radio in the item editor, nor Delete,
 * Backspace and the arrows on a button there. Room
 * mode acts on the selected corner, wall, door or window, or obstacle, and Escape also disarms the
 * door and window tools (see onRoomKeyDown). Key presses on one thing that come close together
 * are one undo step; Delete and Backspace are always a step of their own.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
