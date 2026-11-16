import { fireEvent } from '@testing-library/react';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHistory, undo, useHistoryStore } from '../state/historyStore';
import { usePlanStore } from '../state/planStore';
import { startDrag } from './startDrag';

/** A pointerdown at (x, y), with just the fields startDrag reads. */
function pointerDown(x = 0, y = 0): React.PointerEvent {
  return { clientX: x, clientY: y, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as React.PointerEvent;
}

/** One change: the seeded bed moves one inch to the right. */
function nudgeBed(): void {
  usePlanStore.getState().moveItemBy('seed-bed', 1, 0);
}

/** Undoes until nothing is left, returning how many steps were taken back. */
function undoAll(): number {
  let n = 0;
  while (undo()) n += 1;
  return n;
}

beforeEach(() => {
  usePlanStore.getState().reset();
  clearHistory();
});

describe('startDrag: history', () => {
  it('makes a drag that changes the plan three times one step', () => {
    startDrag(pointerDown(), nudgeBed);
    fireEvent.pointerMove(window, { clientX: 1, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 2, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 3, clientY: 0 });
    fireEvent.pointerUp(window);
    expect(useHistoryStore.getState().canUndo).toBe(true);
    expect(undoAll()).toBe(1);
  });

  it('makes a cancelled drag one step and closes its group, so a later change is a new step', () => {
    startDrag(pointerDown(), nudgeBed);
    fireEvent.pointerMove(window, { clientX: 1, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 2, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 3, clientY: 0 });
    fireEvent.pointerCancel(window);
    nudgeBed();
    expect(undoAll()).toBe(2);
  });

  it('records no step for a drag without a change, and leaves undo unblocked afterwards', () => {
    startDrag(pointerDown(), () => {});
    fireEvent.pointerUp(window);
    expect(useHistoryStore.getState().canUndo).toBe(false);
    nudgeBed();
    expect(undo()).toBe(true);
  });

  it('refuses undo while a drag is in progress', () => {
    startDrag(pointerDown(), nudgeBed);
    fireEvent.pointerMove(window, { clientX: 1, clientY: 0 });
    expect(undo()).toBe(false);
    fireEvent.pointerUp(window);
    expect(undo()).toBe(true);
  });

  it('counts a change made in onEnd as part of the drag step', () => {
    startDrag(pointerDown(), nudgeBed, nudgeBed);
    fireEvent.pointerMove(window, { clientX: 1, clientY: 0 });
    fireEvent.pointerUp(window);
    expect(undoAll()).toBe(1);
  });

  it('closes the drag group when onEnd throws: the error surfaces and undo is not blocked afterwards', () => {
    const boom = new Error('onEnd failed');
    const reported: unknown[] = [];
    // A listener's error is reported on window, not thrown out of dispatchEvent.
    const onError = (ev: ErrorEvent) => {
      reported.push(ev.error);
      ev.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      startDrag(pointerDown(), nudgeBed, () => {
        throw boom;
      });
      fireEvent.pointerMove(window, { clientX: 1, clientY: 0 });
      fireEvent.pointerUp(window);
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(reported).toEqual([boom]);
    expect(undo()).toBe(true);
  });
});

describe('startDrag: existing behaviour', () => {
  it('reports movement relative to the start, calls onEnd once and removes its listeners', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const down = pointerDown(10, 20);
    startDrag(down, onMove, onEnd);
    expect(down.preventDefault).toHaveBeenCalledTimes(1);
    expect(down.stopPropagation).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(window, { clientX: 15, clientY: 32 });
    expect(onMove).toHaveBeenLastCalledWith(5, 12);
    fireEvent.pointerUp(window);
    expect(onEnd).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(window, { clientX: 40, clientY: 40 });
    fireEvent.pointerUp(window);
    fireEvent.pointerCancel(window);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
