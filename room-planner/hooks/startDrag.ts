import type React from 'react';
import { closeGroup, openGroup } from '../state/historyStore';

/**
 * Starts a pointer drag from a pointerdown event: reports movement relative to the start point
 * until the pointer is released or the gesture is cancelled. Ported from prototype lines 380–386,
 * plus pointercancel so an interrupted gesture still ends the drag. Every plan change from the
 * start until the drag ends, including one made in `onEnd`, is one undo step.
 */
export function startDrag(
  e: React.PointerEvent,
  onMove: (dx: number, dy: number) => void,
  onEnd?: () => void,
): void {
  e.preventDefault();
  e.stopPropagation();
  const sx = e.clientX;
  const sy = e.clientY;
  const move = (ev: PointerEvent) => onMove(ev.clientX - sx, ev.clientY - sy);
  const end = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    // The group closes after onEnd, so a change made there joins the drag's step.
    try {
      onEnd?.();
    } finally {
      closeGroup('drag');
    }
  };
  openGroup('drag');
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
