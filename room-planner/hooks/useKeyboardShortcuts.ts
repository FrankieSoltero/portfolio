import { useEffect } from 'react';
import { CONFIG } from '../config';
import { nudgeSelected, removeSelected, rotateSelected } from '../state/actions';
import { useUiStore } from '../state/uiStore';

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

function onKeyDown(e: KeyboardEvent): void {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
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
  if (e.key === 'r' || e.key === 'R') rotateSelected();
  else if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
  else if (e.key === 'Escape') useUiStore.getState().select(null);
}

/** Workspace shortcuts on the selected item: R rotate, Delete/Backspace remove, Escape deselect, arrows nudge. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
