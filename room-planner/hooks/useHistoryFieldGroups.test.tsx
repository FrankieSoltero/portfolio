import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearHistory, closeGroup, openGroup, undo } from '../state/historyStore';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { useHistoryFieldGroups } from './useHistoryFieldGroups';

/** One plan change: the ceiling goes up by an inch. */
function change(): void {
  const s = usePlanStore.getState();
  s.setRoomHeight(s.room.height + 1);
}

/** Undoes until nothing is left, returning how many steps were taken back. */
function undoAll(): number {
  let n = 0;
  while (undo()) n += 1;
  return n;
}

const appended: Element[] = [];

/** Appends an element to the body; removed again in afterEach. */
function add<K extends 'input' | 'textarea' | 'select' | 'button'>(tag: K, type?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (type && el instanceof HTMLInputElement) el.type = type;
  document.body.appendChild(el);
  appended.push(el);
  return el;
}

/** Dispatches a bubbling pointerdown on `target`, the way a press does before any focus change. */
function pointerDown(target: Element): void {
  target.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
}

/** Dispatches a bubbling keydown on `target`, the way a key press does on the focused element. */
function keyDown(target: EventTarget): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
}

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  clearHistory();
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  appended.splice(0).forEach((el) => el.remove());
  closeGroup('field');
});

describe('useHistoryFieldGroups', () => {
  it('Typing is one step: three changes while a text field is focused make one step', () => {
    renderHook(() => useHistoryFieldGroups());
    add('input', 'text').focus();
    change();
    change();
    change();
    expect(undoAll()).toBe(1);
  });

  it('a textarea and a number input are text fields too', () => {
    renderHook(() => useHistoryFieldGroups());
    for (const el of [add('textarea'), add('input', 'number')]) {
      clearHistory();
      el.focus();
      change();
      change();
      expect(undoAll()).toBe(1);
    }
  });

  it('Leaving ends the step: focus, change, blur, focus the same field again, change make two steps', () => {
    renderHook(() => useHistoryFieldGroups());
    const field = add('input', 'text');
    field.focus();
    change();
    field.blur();
    field.focus();
    change();
    expect(undoAll()).toBe(2);
  });

  it('leaving a text field closes its group: a change after the blur is a step of its own', () => {
    renderHook(() => useHistoryFieldGroups());
    const field = add('input', 'text');
    field.focus();
    change();
    field.blur();
    change();
    expect(undoAll()).toBe(2);
  });

  it('Two fields: focus A, change, focus B, change make two steps', () => {
    renderHook(() => useHistoryFieldGroups());
    const a = add('input', 'text');
    const b = add('textarea');
    a.focus();
    change();
    b.focus();
    change();
    expect(undoAll()).toBe(2);
  });

  it('Radio is not a field: two changes while a radio is focused make two steps', () => {
    renderHook(() => useHistoryFieldGroups());
    add('input', 'radio').focus();
    change();
    change();
    expect(undoAll()).toBe(2);
  });

  it('a select and the other excluded input types are not fields', () => {
    renderHook(() => useHistoryFieldGroups());
    const others = [
      add('select'),
      ...['checkbox', 'button', 'submit', 'reset', 'range', 'color', 'file'].map((t) => add('input', t)),
    ];
    for (const el of others) {
      clearHistory();
      el.focus();
      change();
      change();
      expect(undoAll(), `${el.tagName} ${el instanceof HTMLInputElement ? el.type : ''}`).toBe(2);
    }
  });

  it('Press elsewhere: a pointerdown on another element without a focus change ends the step', () => {
    renderHook(() => useHistoryFieldGroups());
    const field = add('input', 'text');
    const button = add('button');
    // The press is seen in the capture phase, before the pressed element can stop it.
    button.addEventListener('pointerdown', (e) => e.stopPropagation());
    field.focus();
    change();
    pointerDown(button);
    expect(document.activeElement).toBe(field);
    change();
    expect(undoAll()).toBe(2);
  });

  it('Press in the field: a pointerdown on the focused field keeps the step', () => {
    renderHook(() => useHistoryFieldGroups());
    const field = add('input', 'text');
    field.focus();
    change();
    pointerDown(field);
    change();
    expect(undoAll()).toBe(1);
  });

  it('a text field focused before the hook mounts is covered', () => {
    add('input', 'text').focus();
    renderHook(() => useHistoryFieldGroups());
    change();
    change();
    expect(undoAll()).toBe(1);
  });

  it('Unmount: an open field group is closed', () => {
    const { unmount } = renderHook(() => useHistoryFieldGroups());
    add('input', 'text').focus();
    change();
    unmount();
    change();
    expect(undoAll()).toBe(2);
  });

  it('Unmount: the focusin listener is removed', () => {
    const { unmount } = renderHook(() => useHistoryFieldGroups());
    unmount();
    add('input', 'text').focus();
    change();
    change();
    expect(undoAll()).toBe(2);
  });

  it('Unmount: the focusout and pointerdown listeners are removed', () => {
    const { unmount } = renderHook(() => useHistoryFieldGroups());
    const field = add('input', 'text');
    const button = add('button');
    unmount();
    openGroup('field');
    field.focus();
    change();
    pointerDown(button);
    field.blur();
    change();
    expect(undoAll()).toBe(1);
  });

  it('Typing with keys: focus a field, keydown, change, keydown, change make one step', () => {
    renderHook(() => useHistoryFieldGroups());
    const field = add('input', 'text');
    field.focus();
    keyDown(field);
    change();
    keyDown(field);
    change();
    expect(undoAll()).toBe(1);
  });

  it('Removed field, then keys: two changes each after a keydown on the document make two steps', () => {
    renderHook(() => useHistoryFieldGroups());
    const field = add('input', 'text');
    field.focus();
    // A removed focused field fires no focusout.
    field.remove();
    expect(document.activeElement).not.toBe(field);
    keyDown(document);
    change();
    keyDown(document);
    change();
    expect(undoAll()).toBe(2);
  });

  it('Removed field, then focus on a button: a change after it is a step of its own', () => {
    renderHook(() => useHistoryFieldGroups());
    const field = add('input', 'text');
    const button = add('button');
    field.focus();
    change();
    field.remove();
    button.focus();
    change();
    expect(undoAll()).toBe(2);
  });

  it('Removed field, then a press anywhere: two changes after it make two steps', () => {
    renderHook(() => useHistoryFieldGroups());
    const field = add('input', 'text');
    field.focus();
    field.remove();
    pointerDown(document.body);
    change();
    change();
    expect(undoAll()).toBe(2);
  });

  it('Unmount: the keydown listener is removed', () => {
    const { unmount } = renderHook(() => useHistoryFieldGroups());
    unmount();
    openGroup('field');
    change();
    keyDown(document);
    change();
    expect(undoAll()).toBe(1);
  });
});
