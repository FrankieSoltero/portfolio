import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionBar } from '../components/SelectionBar';
import { CONFIG } from '../config';
import type { Corner, Door, Item, Obstacle } from '../domain/types';
import { clearHistory, redo, runKeyed, undo, useHistoryStore } from '../state/historyStore';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { furnishedDocument } from '../test/fixtures';
import { startDrag } from './startDrag';
import { useElementSize } from './useElementSize';
import { ROTATE_STEP_COARSE, ROTATE_STEP_FINE, useKeyboardShortcuts } from './useKeyboardShortcuts';

// undo, redo and runKeyed are spies that call the real functions, so a test can count the calls the hook makes.
vi.mock('../state/historyStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../state/historyStore')>();
  return { ...actual, undo: vi.fn(actual.undo), redo: vi.fn(actual.redo), runKeyed: vi.fn(actual.runKeyed) };
});

const BED = 'seed-bed';

function bed(): Item | undefined {
  return usePlanStore.getState().items.find((i) => i.id === BED);
}

function desk(): Item | undefined {
  return usePlanStore.getState().items.find((i) => i.id === 'seed-desk');
}

/** Dispatches a cancelable keydown on `target` (bubbling to window) and returns the event. */
function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

const appended: Element[] = [];

/** Appends a focused form control to the body; removed again in afterEach. */
function focused<K extends 'input' | 'textarea' | 'select'>(tag: K, type?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (type && el instanceof HTMLInputElement) el.type = type;
  document.body.appendChild(el);
  appended.push(el);
  el.focus();
  return el;
}

beforeEach(() => {
  // The starting plan is empty; these shortcuts act on furniture, so every test starts furnished.
  usePlanStore.getState().reset(furnishedDocument());
  useUiStore.getState().reset();
  clearHistory();
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  appended.splice(0).forEach((el) => el.remove());
});

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    // Put the bed's centre at exactly (40, 20), off the drag grid, so the rows also show a nudge never
    // re-snaps. There the bed is partly outside the room (y −22.5 to 62.5), so the walls stop no arrow.
    const doc = furnishedDocument();
    usePlanStore.getState().reset({ ...doc, items: doc.items.map((i) => (i.id === BED ? { ...i, x: 40, y: 20 } : i)) });
    renderHook(() => useKeyboardShortcuts());
  });

  it.each(['r', 'R'])('%s rotates the selected item', (key) => {
    useUiStore.getState().select(BED);
    press(document.body, key);
    expect(bed()?.angle).toBe(90);
  });

  it('names the rotation steps: 90° coarse, 15° fine', () => {
    expect(ROTATE_STEP_COARSE).toBe(90);
    expect(ROTATE_STEP_FINE).toBe(15);
  });

  // Shift decides the step, not the letter's case: Shift+R arrives as 'R', caps-lock R without Shift turns 90°.
  it.each(['R', 'r'])('Shift+%s turns the selected item 15°', (key) => {
    useUiStore.getState().select(BED);
    press(document.body, key, { shiftKey: true });
    expect(bed()?.angle).toBe(15);
  });

  it('Shift+R three times turns the desk from 90° to 135°, and R then adds 90°', () => {
    useUiStore.getState().select('seed-desk');
    for (let i = 0; i < 3; i++) press(document.body, 'R', { shiftKey: true });
    expect(desk()?.angle).toBe(135);
    press(document.body, 'r');
    expect(desk()?.angle).toBe(225);
  });

  it('Shift+R past 345° wraps to 0°', () => {
    usePlanStore.getState().setItemAngle(BED, 345);
    useUiStore.getState().select(BED);
    press(document.body, 'R', { shiftKey: true });
    expect(bed()?.angle).toBe(0);
  });

  it.each([
    ['input', 'text'],
    ['input', 'number'],
    ['textarea', undefined],
  ] as const)('Shift+R with focus in %s %s is ignored', (tag, type) => {
    useUiStore.getState().select(BED);
    press(focused(tag, type), 'R', { shiftKey: true });
    expect(bed()?.angle).toBe(0);
  });

  it.each(['Delete', 'Backspace'])('%s removes the selected item and clears the selection', (key) => {
    useUiStore.getState().select(BED);
    press(document.body, key);
    expect(bed()).toBeUndefined();
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('Escape deselects', () => {
    useUiStore.getState().select(BED);
    press(document.body, 'Escape');
    expect(useUiStore.getState().selectedId).toBeNull();
    expect(bed()).toBeDefined();
  });

  it.each(['r', 'Delete', 'Backspace', 'Escape', 'ArrowRight'])('%s with no selection changes nothing', (key) => {
    const items = usePlanStore.getState().items;
    press(document.body, key);
    expect(usePlanStore.getState().items).toBe(items);
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it.each([
    ['input', 'text'],
    ['input', 'number'],
    ['textarea', undefined],
    ['select', undefined],
  ] as const)('Backspace with focus in %s %s is ignored', (tag, type) => {
    useUiStore.getState().select(BED);
    press(focused(tag, type), 'Backspace');
    expect(bed()).toBeDefined();
    expect(useUiStore.getState().selectedId).toBe(BED);
  });

  it('r with focus on a radio is handled', () => {
    useUiStore.getState().select(BED);
    press(focused('input', 'radio'), 'r');
    expect(bed()?.angle).toBe(90);
  });

  it.each([{ metaKey: true }, { ctrlKey: true }, { altKey: true }])('modifier %o is ignored', (mod) => {
    useUiStore.getState().select(BED);
    press(document.body, 'r', mod);
    press(document.body, 'Backspace', mod);
    const ev = press(document.body, 'ArrowRight', mod);
    expect(bed()).toMatchObject({ x: 40, y: 20, angle: 0 });
    expect(ev.defaultPrevented).toBe(false);
  });

  it.each([
    ['ArrowRight', 41, 20],
    ['ArrowLeft', 39, 20],
    ['ArrowDown', 40, 21],
    ['ArrowUp', 40, 19],
  ])('%s nudges the selected item by one step and prevents default', (key, x, y) => {
    expect(CONFIG.nudgeStep).toBe(1);
    useUiStore.getState().select(BED);
    const ev = press(document.body, key);
    expect(bed()).toMatchObject({ x, y });
    expect(ev.defaultPrevented).toBe(true);
  });

  it('an arrow nudges a piece wholly inside the room freely by one step and prevents default', () => {
    // The seed desk (quarter-turned, x 118–144, y 104–159) starts wholly inside the room.
    useUiStore.getState().select('seed-desk');
    const left = press(document.body, 'ArrowLeft');
    expect(desk()).toMatchObject({ x: 130, y: 131.5 });
    expect(left.defaultPrevented).toBe(true);
    press(document.body, 'ArrowDown');
    expect(desk()).toMatchObject({ x: 130, y: 132.5 });
  });

  it('Shift+ArrowRight nudges by the large step (12 in)', () => {
    expect(CONFIG.nudgeStepLarge).toBe(12);
    useUiStore.getState().select(BED);
    press(document.body, 'ArrowRight', { shiftKey: true });
    expect(bed()).toMatchObject({ x: 52, y: 20 });
  });

  it('R then the arrows move the turned seed desk by exactly one step', () => {
    useUiStore.getState().select('seed-desk');
    press(document.body, 'r'); // angle 180: half-extents 27.5, 13, so the box min corner is off the grid
    press(document.body, 'ArrowRight');
    expect(desk()).toMatchObject({ x: 132, y: 131.5, angle: 180 });
    press(document.body, 'ArrowLeft');
    expect(desk()).toMatchObject({ x: 131, y: 131.5, angle: 180 });
  });

  it('Shift+arrows move the turned seed desk by exactly 12 in', () => {
    useUiStore.getState().select('seed-desk');
    press(document.body, 'r');
    press(document.body, 'ArrowDown', { shiftKey: true });
    expect(desk()).toMatchObject({ x: 131, y: 143.5 });
    press(document.body, 'ArrowLeft', { shiftKey: true });
    expect(desk()).toMatchObject({ x: 119, y: 143.5 });
  });

  it('an arrow at the room bounding box edge clamps the centre', () => {
    useUiStore.getState().select(BED);
    usePlanStore.getState().moveItemBy(BED, 103.6, 0); // centre x 143.6
    press(document.body, 'ArrowRight');
    expect(bed()).toMatchObject({ x: 144, y: 20 });
  });

  it.each(['text', 'number', 'radio'])('arrows with focus in a %s input are ignored', (type) => {
    useUiStore.getState().select(BED);
    const ev = press(focused('input', type), 'ArrowRight');
    expect(bed()).toMatchObject({ x: 40, y: 20 });
    expect(ev.defaultPrevented).toBe(false);
  });

  it('arrows with no selection change nothing and do not prevent default', () => {
    const ev = press(document.body, 'ArrowDown');
    expect(bed()).toMatchObject({ x: 40, y: 20 });
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('useKeyboardShortcuts in room mode', () => {
  function corner(id: string): Corner | undefined {
    return usePlanStore.getState().room.outline.find((c) => c.id === id);
  }

  beforeEach(() => {
    renderHook(() => useKeyboardShortcuts());
    useUiStore.getState().setMode('room');
  });

  it.each(['Delete', 'Backspace'])('%s removes the selected corner and clears the corner selection', (key) => {
    useUiStore.getState().selectCorner('c2');
    press(document.body, key);
    expect(usePlanStore.getState().room.outline.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
    expect(useUiStore.getState().selectedCornerId).toBeNull();
    expect(usePlanStore.getState().items).toHaveLength(2);
  });

  it('Delete on a triangle is refused with the reason', () => {
    useUiStore.getState().selectCorner('c2');
    press(document.body, 'Delete');
    useUiStore.getState().selectCorner('c3');
    const before = usePlanStore.getState().room;
    press(document.body, 'Delete');
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().selectedCornerId).toBe('c3');
    expect(useUiStore.getState().roomProblem).toBe('A room needs at least 3 corners.');
  });

  it.each([
    ['input', 'text'],
    ['input', 'number'],
    ['textarea', undefined],
    ['select', undefined],
  ] as const)('Backspace with focus in %s %s is ignored', (tag, type) => {
    useUiStore.getState().selectCorner('c2');
    press(focused(tag, type), 'Backspace');
    expect(usePlanStore.getState().room.outline).toHaveLength(4);
    expect(useUiStore.getState().selectedCornerId).toBe('c2');
  });

  it.each([
    ['ArrowRight', 145, 0],
    ['ArrowLeft', 143, 0],
    ['ArrowDown', 144, 1],
    ['ArrowUp', 144, -1],
  ])('%s nudges the selected corner by one step and prevents default', (key, x, y) => {
    useUiStore.getState().selectCorner('c2');
    const ev = press(document.body, key);
    expect(corner('c2')).toEqual({ id: 'c2', x, y });
    expect(ev.defaultPrevented).toBe(true);
    expect(bed()).toMatchObject({ x: 72, y: 42.5 });
  });

  it('Shift+arrows nudge the selected corner by 12 in', () => {
    useUiStore.getState().selectCorner('c2');
    press(document.body, 'ArrowRight', { shiftKey: true });
    press(document.body, 'ArrowUp', { shiftKey: true });
    expect(corner('c2')).toEqual({ id: 'c2', x: 156, y: -12 });
  });

  it('an arrow is not angle-snapped: a corner off the grid moves by exactly the step', () => {
    const outline = usePlanStore.getState().room.outline.map((c) => (c.id === 'c2' ? { ...c, x: 150, y: 0.25 } : c));
    usePlanStore.getState().applyOutline({ ok: true, outline });
    useUiStore.getState().selectCorner('c2');
    press(document.body, 'ArrowDown');
    expect(corner('c2')).toEqual({ id: 'c2', x: 150, y: 1.25 });
  });

  it.each(['text', 'number', 'radio'])('arrows with focus in a %s input are ignored', (type) => {
    useUiStore.getState().selectCorner('c2');
    const ev = press(focused('input', type), 'ArrowRight');
    expect(corner('c2')).toEqual({ id: 'c2', x: 144, y: 0 });
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Escape clears the corner selection', () => {
    useUiStore.getState().selectCorner('c2');
    press(document.body, 'Escape');
    expect(useUiStore.getState().selectedCornerId).toBeNull();
    expect(usePlanStore.getState().room.outline).toHaveLength(4);
  });

  it.each(['r', 'R'])('%s does nothing in room mode', (key) => {
    useUiStore.getState().selectCorner('c2');
    useUiStore.getState().select(BED);
    const before = usePlanStore.getState();
    press(document.body, key);
    expect(usePlanStore.getState().room).toBe(before.room);
    expect(usePlanStore.getState().items).toBe(before.items);
  });

  it('Shift+R does nothing in room mode', () => {
    useUiStore.getState().selectCorner('c2');
    useUiStore.getState().select(BED);
    const before = usePlanStore.getState();
    press(document.body, 'R', { shiftKey: true });
    expect(usePlanStore.getState().room).toBe(before.room);
    expect(usePlanStore.getState().items).toBe(before.items);
  });

  it('item shortcuts do not act on a selected item in room mode', () => {
    useUiStore.getState().select(BED);
    const before = usePlanStore.getState();
    for (const key of ['Delete', 'Backspace', 'ArrowRight']) press(document.body, key);
    expect(usePlanStore.getState().items).toBe(before.items);
    expect(usePlanStore.getState().room).toBe(before.room);
  });

  it.each(['Delete', 'Escape', 'ArrowRight'])('%s with no corner selected changes nothing', (key) => {
    const before = usePlanStore.getState().room;
    const ev = press(document.body, key);
    expect(usePlanStore.getState().room).toBe(before);
    expect(ev.defaultPrevented).toBe(false);
  });

  it.each([{ metaKey: true }, { ctrlKey: true }, { altKey: true }])('modifier %o is ignored', (mod) => {
    useUiStore.getState().selectCorner('c2');
    press(document.body, 'Backspace', mod);
    const ev = press(document.body, 'ArrowRight', mod);
    expect(corner('c2')).toEqual({ id: 'c2', x: 144, y: 0 });
    expect(ev.defaultPrevented).toBe(false);
  });

  it('in furnish mode a stray corner selection is ignored and arrows move the selected item', () => {
    useUiStore.getState().setMode('furnish');
    useUiStore.getState().selectCorner('c2');
    useUiStore.getState().select(BED);
    press(document.body, 'ArrowLeft');
    expect(corner('c2')).toEqual({ id: 'c2', x: 144, y: 0 });
    expect(bed()).toMatchObject({ x: 71, y: 42.5 });
  });
});

describe('useKeyboardShortcuts in room mode with a door, window or obstacle', () => {
  /** On the top wall c1, 20 in from (0, 0), 32 in wide. */
  const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
  const BOX: Obstacle = { id: 'o1', shape: 'box', label: 'Radiator', x: 30, y: 100, rotation: 0, width: 30, depth: 8, height: 30, elevation: 0 };

  function door(): Door | undefined {
    return usePlanStore.getState().openings.find((o): o is Door => o.id === 'd1' && o.kind === 'door');
  }

  function box(): Obstacle | undefined {
    return usePlanStore.getState().obstacles.find((o) => o.id === 'o1');
  }

  beforeEach(() => {
    usePlanStore.getState().reset({ ...furnishedDocument(), openings: [D1], obstacles: [BOX] });
    renderHook(() => useKeyboardShortcuts());
    useUiStore.getState().setMode('room');
  });

  // The top wall runs left to right, so Right and Left slide the door and Up and Down, across the
  // wall, leave it where it is.
  it.each([
    ['ArrowRight', false, 21],
    ['ArrowDown', false, 20],
    ['ArrowLeft', false, 19],
    ['ArrowUp', false, 20],
    ['ArrowRight', true, 32],
    ['ArrowDown', true, 20],
    ['ArrowLeft', true, 8],
    ['ArrowUp', true, 20],
  ] as const)('%s (Shift %s) slides the selected door to offset %d and prevents default', (key, shiftKey, offset) => {
    useUiStore.getState().selectOpening('d1');
    const ev = press(document.body, key, { shiftKey });
    expect(door()?.offset).toBe(offset);
    expect(ev.defaultPrevented).toBe(true);
    expect(box()).toMatchObject({ x: 30, y: 100 });
  });

  it.each([
    ['ArrowRight', false, 31, 100],
    ['ArrowLeft', false, 29, 100],
    ['ArrowDown', false, 30, 101],
    ['ArrowUp', false, 30, 99],
    ['ArrowRight', true, 42, 100],
    ['ArrowUp', true, 30, 88],
  ] as const)('%s (Shift %s) nudges the selected obstacle to (%d, %d) and prevents default', (key, shiftKey, x, y) => {
    useUiStore.getState().selectObstacle('o1');
    const ev = press(document.body, key, { shiftKey });
    expect(box()).toMatchObject({ x, y });
    expect(ev.defaultPrevented).toBe(true);
    expect(door()?.offset).toBe(20);
  });

  it.each([
    ['r', false, 90],
    ['R', false, 90],
    ['R', true, 15],
    ['r', true, 15],
  ] as const)('%s (Shift %s) turns the selected obstacle %d°', (key, shiftKey, rotation) => {
    useUiStore.getState().selectObstacle('o1');
    press(document.body, key, { shiftKey });
    expect(box()?.rotation).toBe(rotation);
  });

  it('R with a door selected changes nothing', () => {
    useUiStore.getState().selectOpening('d1');
    const before = usePlanStore.getState();
    press(document.body, 'r');
    expect(usePlanStore.getState().openings).toBe(before.openings);
    expect(usePlanStore.getState().obstacles).toBe(before.obstacles);
  });

  it.each(['Delete', 'Backspace'])('%s removes the selected door and clears the selection', (key) => {
    useUiStore.getState().selectOpening('d1');
    press(document.body, key);
    expect(door()).toBeUndefined();
    expect(useUiStore.getState().selectedOpeningId).toBeNull();
    expect(box()).toBeDefined();
  });

  it.each(['Delete', 'Backspace'])('%s removes the selected obstacle and clears the selection', (key) => {
    useUiStore.getState().selectObstacle('o1');
    press(document.body, key);
    expect(box()).toBeUndefined();
    expect(useUiStore.getState().selectedObstacleId).toBeNull();
    expect(door()).toBeDefined();
  });

  it.each(['door', 'window'] as const)('Escape with the %s tool armed sets the tool back to corner', (tool) => {
    useUiStore.getState().setRoomTool(tool);
    press(document.body, 'Escape');
    expect(useUiStore.getState().roomTool).toBe('corner');
  });

  it.each([
    ['door', () => useUiStore.getState().selectOpening('d1')],
    ['obstacle', () => useUiStore.getState().selectObstacle('o1')],
  ] as const)('Escape clears a selected %s and changes nothing else', (_kind, selectIt) => {
    selectIt();
    const before = usePlanStore.getState();
    press(document.body, 'Escape');
    const ui = useUiStore.getState();
    expect([ui.selectedCornerId, ui.selectedOpeningId, ui.selectedObstacleId]).toEqual([null, null, null]);
    expect(usePlanStore.getState().openings).toBe(before.openings);
    expect(usePlanStore.getState().obstacles).toBe(before.obstacles);
  });

  it.each(['text', 'number', 'radio'])('arrows with focus in a %s input are ignored', (type) => {
    useUiStore.getState().selectOpening('d1');
    const ev = press(focused('input', type), 'ArrowRight');
    expect(door()?.offset).toBe(20);
    expect(ev.defaultPrevented).toBe(false);
    useUiStore.getState().selectObstacle('o1');
    press(focused('input', type), 'ArrowDown');
    expect(box()).toMatchObject({ x: 30, y: 100 });
  });

  it.each([
    ['input', 'text'],
    ['input', 'number'],
    ['textarea', undefined],
    ['select', undefined],
  ] as const)('R and Delete with focus in %s %s are ignored', (tag, type) => {
    useUiStore.getState().selectObstacle('o1');
    press(focused(tag, type), 'R');
    press(focused(tag, type), 'Delete');
    expect(box()).toMatchObject({ rotation: 0 });
    useUiStore.getState().selectOpening('d1');
    press(focused(tag, type), 'Backspace');
    expect(door()).toBeDefined();
  });
});

describe('useKeyboardShortcuts slides a door the way the arrow points on screen', () => {
  /**
   * A 32 in door on wall `wallId` of the seeded rectangle at offset 40. The walls run: c1 top, left to
   * right; c2 right, top to bottom; c3 bottom, right to left; c4 left, bottom to top.
   */
  function doorOn(wallId: string): Door {
    return { id: 'd1', kind: 'door', wallId, offset: 40, width: 32, height: 80, hinge: 'start', swing: 'in' };
  }

  function offset(): number | undefined {
    return usePlanStore.getState().openings.find((o) => o.id === 'd1')?.offset;
  }

  function withDoor(door: Door, outline?: Corner[]): void {
    const base = furnishedDocument();
    usePlanStore.getState().reset({ ...base, room: { ...base.room, outline: outline ?? base.room.outline }, items: [], openings: [door] });
    renderHook(() => useKeyboardShortcuts());
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectOpening('d1');
  }

  it.each([
    ['c1', 'ArrowRight', 41],
    ['c1', 'ArrowLeft', 39],
    ['c1', 'ArrowUp', 40],
    ['c1', 'ArrowDown', 40],
    ['c2', 'ArrowDown', 41],
    ['c2', 'ArrowUp', 39],
    ['c2', 'ArrowRight', 40],
    ['c3', 'ArrowRight', 39],
    ['c3', 'ArrowLeft', 41],
    ['c3', 'ArrowDown', 40],
    ['c4', 'ArrowDown', 39],
    ['c4', 'ArrowUp', 41],
    ['c4', 'ArrowLeft', 40],
  ] as const)('on wall %s, %s leaves the door at offset %d', (wallId, key, expected) => {
    withDoor(doorOn(wallId));
    press(document.body, key);
    expect(offset()).toBe(expected);
  });

  it('Shift+ArrowRight on the bottom wall moves the door 12 in to the right: the offset falls by 12', () => {
    withDoor(doorOn('c3'));
    press(document.body, 'ArrowRight', { shiftKey: true });
    expect(offset()).toBe(28);
  });

  it('a key across the wall changes nothing and sets no room problem', () => {
    withDoor(doorOn('c1'));
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    const before = usePlanStore.getState();
    press(document.body, 'ArrowDown');
    expect(usePlanStore.getState()).toBe(before);
    expect(useUiStore.getState().roomProblem).toBe('Walls cannot cross.');
  });

  it('on a 45° wall running right and down, ArrowRight and ArrowDown both slide it forward, ArrowLeft and ArrowUp back', () => {
    // The wall from p2 (100, 0) to p3 (160, 60) is about 84.9 in long.
    const outline: Corner[] = [
      { id: 'p1', x: 0, y: 0 }, { id: 'p2', x: 100, y: 0 }, { id: 'p3', x: 160, y: 60 }, { id: 'p4', x: 160, y: 168 }, { id: 'p5', x: 0, y: 168 },
    ];
    withDoor({ ...doorOn('p2'), offset: 20 }, outline);
    press(document.body, 'ArrowRight');
    expect(offset()).toBe(21);
    press(document.body, 'ArrowDown');
    expect(offset()).toBe(22);
    press(document.body, 'ArrowLeft');
    expect(offset()).toBe(21);
    press(document.body, 'ArrowUp');
    expect(offset()).toBe(20);
  });
});

describe('useKeyboardShortcuts in room mode with a wall selected', () => {
  /** The seeded room is R: c1 (0,0), c2 (144,0), c3 (144,168), c4 (0,168); wall c1 is the top wall. */
  function outline(): Corner[] {
    return usePlanStore.getState().room.outline;
  }

  beforeEach(() => {
    renderHook(() => useKeyboardShortcuts());
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectWall('c1');
  });

  it('ArrowDown slides the selected top wall 1 in inward and prevents default', () => {
    const ev = press(document.body, 'ArrowDown');
    expect(outline()).toEqual([
      { id: 'c1', x: 0, y: 1 }, { id: 'c2', x: 144, y: 1 }, { id: 'c3', x: 144, y: 168 }, { id: 'c4', x: 0, y: 168 },
    ]);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Shift+ArrowDown then slides the wall a further 12 in', () => {
    press(document.body, 'ArrowDown');
    press(document.body, 'ArrowDown', { shiftKey: true });
    expect(outline().slice(0, 2)).toEqual([{ id: 'c1', x: 0, y: 13 }, { id: 'c2', x: 144, y: 13 }]);
  });

  it('ArrowRight, along the wall, leaves the outline unchanged but still prevents default', () => {
    const before = outline();
    const ev = press(document.body, 'ArrowRight');
    expect(outline()).toBe(before);
    expect(ev.defaultPrevented).toBe(true);
  });

  it.each(['number', 'radio'])('ArrowDown with focus in a %s input does not move the wall', (type) => {
    const before = outline();
    const ev = press(focused('input', type), 'ArrowDown');
    expect(outline()).toBe(before);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Escape clears the selected wall', () => {
    const before = outline();
    press(document.body, 'Escape');
    expect(useUiStore.getState().selectedWallId).toBeNull();
    expect(outline()).toBe(before);
  });

  it('Escape with the door tool armed disarms the tool', () => {
    useUiStore.getState().setRoomTool('door');
    press(document.body, 'Escape');
    expect(useUiStore.getState().roomTool).toBe('corner');
  });

  it.each(['Delete', 'Backspace'])('%s leaves the outline unchanged, the wall selected and the room problem as it was', (key) => {
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    const before = outline();
    press(document.body, key);
    expect(outline()).toBe(before);
    expect(useUiStore.getState().selectedWallId).toBe('c1');
    expect(useUiStore.getState().roomProblem).toBe('Walls cannot cross.');
  });

  it('r changes nothing', () => {
    const plan = usePlanStore.getState();
    const ui = useUiStore.getState();
    press(document.body, 'r');
    expect(usePlanStore.getState()).toBe(plan);
    expect(useUiStore.getState()).toBe(ui);
  });

  it('in furnish mode ArrowDown moves the selected item and no wall', () => {
    useUiStore.getState().setMode('furnish');
    useUiStore.getState().selectWall('c1');
    useUiStore.getState().select(BED);
    const before = outline();
    press(document.body, 'ArrowDown');
    expect(outline()).toBe(before);
    expect(bed()).toMatchObject({ x: 72, y: 43.5 });
  });
});

describe('useKeyboardShortcuts with focus in the selection bar Angle field', () => {
  function Workspace() {
    useKeyboardShortcuts();
    return <SelectionBar />;
  }

  function angleField(): HTMLInputElement {
    return screen.getByLabelText('Angle') as HTMLInputElement;
  }

  beforeEach(() => {
    act(() => useUiStore.getState().select(BED));
    render(<Workspace />);
    angleField().focus();
  });

  it.each([
    ['r', {}],
    ['R', {}],
    ['R', { shiftKey: true }],
  ] as const)('%s %o typed in the field does not rotate the item', (key, init) => {
    press(angleField(), key, init);
    expect(bed()?.angle).toBe(0);
    expect(angleField().value).toBe('0');
  });

  it.each(['Delete', 'Backspace'])('%s typed in the field does not remove the item', (key) => {
    press(angleField(), key);
    expect(bed()).toBeDefined();
    expect(useUiStore.getState().selectedId).toBe(BED);
  });

  it.each(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'])('%s typed in the field does not nudge the item', (key) => {
    const ev = press(angleField(), key, { shiftKey: true });
    expect(bed()).toMatchObject({ x: 72, y: 42.5, angle: 0 });
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('useKeyboardShortcuts lifecycle', () => {
  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts());
    unmount();
    useUiStore.getState().select(BED);
    press(document.body, 'Escape');
    expect(useUiStore.getState().selectedId).toBe(BED);
  });
});

describe('useKeyboardShortcuts undo and redo keys', () => {
  type Case = { key: string; init: KeyboardEventInit };
  type Mode = 'furnish' | 'room';

  /** Each case once in furnish mode and once in room mode. */
  function inBothModes(cases: Case[]): (Case & { mode: Mode })[] {
    return (['furnish', 'room'] as const).flatMap((mode) => cases.map((c) => ({ ...c, mode })));
  }

  /** Appends a focused button to the body, like a wall length label; removed again in afterEach. */
  function focusedButton(): HTMLButtonElement {
    const el = document.createElement('button');
    document.body.appendChild(el);
    appended.push(el);
    el.focus();
    return el;
  }

  beforeEach(() => {
    renderHook(() => useKeyboardShortcuts());
    vi.mocked(undo).mockClear();
    vi.mocked(redo).mockClear();
  });

  it.each(
    inBothModes([
      { key: 'z', init: { metaKey: true } },
      { key: 'Z', init: { metaKey: true } },
      { key: 'z', init: { ctrlKey: true } },
      { key: 'Z', init: { ctrlKey: true } },
    ]),
  )('Undo: $key with $init in $mode mode calls undo once and prevents default', ({ key, init, mode }) => {
    useUiStore.getState().setMode(mode);
    const ev = press(document.body, key, init);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
  });

  it.each(
    inBothModes([
      { key: 'Z', init: { metaKey: true, shiftKey: true } },
      { key: 'z', init: { metaKey: true, shiftKey: true } },
      { key: 'Z', init: { ctrlKey: true, shiftKey: true } },
      { key: 'z', init: { ctrlKey: true, shiftKey: true } },
    ]),
  )('Redo: $key with $init in $mode mode calls redo once and prevents default', ({ key, init, mode }) => {
    useUiStore.getState().setMode(mode);
    const ev = press(document.body, key, init);
    expect(redo).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
  });

  it.each(
    inBothModes([
      { key: 'y', init: { ctrlKey: true } },
      { key: 'Y', init: { ctrlKey: true } },
    ]),
  )('Redo with Y: $key with $init in $mode mode calls redo once and prevents default', ({ key, init, mode }) => {
    useUiStore.getState().setMode(mode);
    const ev = press(document.body, key, init);
    expect(redo).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
  });

  it.each(
    inBothModes([
      { key: 'y', init: { metaKey: true } },
      { key: 'Y', init: { metaKey: true } },
      { key: 'y', init: { ctrlKey: true, metaKey: true } },
      { key: 'Y', init: { ctrlKey: true, shiftKey: true } },
    ]),
  )('Meta+Y: $key with $init in $mode mode does nothing and is not prevented', ({ key, init, mode }) => {
    useUiStore.getState().setMode(mode);
    const ev = press(document.body, key, init);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it.each(
    inBothModes([
      { key: 'z', init: { metaKey: true, altKey: true } },
      { key: 'z', init: { ctrlKey: true, altKey: true } },
      { key: 'Z', init: { ctrlKey: true, altKey: true, shiftKey: true } },
      { key: 'y', init: { ctrlKey: true, altKey: true } },
    ]),
  )('With Alt: $key with $init in $mode mode does nothing and is not prevented', ({ key, init, mode }) => {
    useUiStore.getState().setMode(mode);
    const ev = press(document.body, key, init);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it.each([
    ['input', 'text', { ctrlKey: true }],
    ['input', 'text', { metaKey: true, shiftKey: true }],
    ['textarea', undefined, { metaKey: true }],
    ['textarea', undefined, { ctrlKey: true, shiftKey: true }],
  ] as const)('In a text field: z with focus in %s %s and %o does nothing and is not prevented', (tag, type, init) => {
    for (const mode of ['furnish', 'room'] as const) {
      useUiStore.getState().setMode(mode);
      const ev = press(focused(tag, type), 'z', init);
      expect(ev.defaultPrevented).toBe(false);
    }
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it.each([
    ['a radio', () => focused('input', 'radio')],
    ['a button', focusedButton],
  ] as const)('On a radio or button: Ctrl+Z with focus on %s calls undo', (_name, target) => {
    const ev = press(target(), 'z', { ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it.each(['furnish', 'room'] as const)('Nothing selected: Ctrl+Z in %s mode with nothing selected calls undo', (mode) => {
    useUiStore.getState().setMode(mode);
    press(document.body, 'z', { ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['r', { ctrlKey: true }],
    ['ArrowLeft', { metaKey: true }],
    ['ArrowLeft', { ctrlKey: true }],
    ['Delete', { ctrlKey: true }],
    ['Delete', { metaKey: true }],
  ] as const)('Other mod keys: %s with %o changes nothing in either mode and is not prevented', (key, init) => {
    useUiStore.getState().select(BED);
    const furnishEv = press(document.body, key, init);
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectCorner('c2');
    const roomEv = press(document.body, key, init);
    expect(bed()).toMatchObject({ x: 72, y: 42.5, angle: 0 });
    expect(usePlanStore.getState().room.outline.find((c) => c.id === 'c2')).toEqual({ id: 'c2', x: 144, y: 0 });
    expect([furnishEv.defaultPrevented, roomEv.defaultPrevented]).toEqual([false, false]);
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it.each([
    [{ key: 'я', code: 'KeyZ', ctrlKey: true }, 'undo'],
    [{ key: 'Я', code: 'KeyZ', ctrlKey: true, shiftKey: true }, 'redo'],
    [{ key: 'н', code: 'KeyY', ctrlKey: true }, 'redo'],
    [{ key: 'w', code: 'KeyZ', ctrlKey: true }, 'nothing'],
    [{ key: 'z', code: 'KeyW', ctrlKey: true }, 'undo'],
  ] as const)('Physical key: %o does %s (e.code counts only when e.key is not a Latin letter)', (init, wanted) => {
    const { key, ...rest } = init;
    const ev = press(document.body, key, rest);
    expect(vi.mocked(undo).mock.calls.length).toBe(wanted === 'undo' ? 1 : 0);
    expect(vi.mocked(redo).mock.calls.length).toBe(wanted === 'redo' ? 1 : 0);
    expect(ev.defaultPrevented).toBe(wanted !== 'nothing');
  });

  it.each([
    ['z', { metaKey: true }],
    ['z', { ctrlKey: true }],
  ] as const)('Nothing to undo: %s with %o still prevents default', (key, init) => {
    expect(useHistoryStore.getState().canUndo).toBe(false);
    const ev = press(document.body, key, init);
    expect(vi.mocked(undo).mock.results).toEqual([{ type: 'return', value: false }]);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Ctrl+Z takes back a nudge and Ctrl+Shift+Z puts it back', () => {
    useUiStore.getState().select(BED);
    press(document.body, 'ArrowRight');
    expect(bed()).toMatchObject({ x: 73, y: 42.5 });
    press(document.body, 'z', { ctrlKey: true });
    expect(bed()).toMatchObject({ x: 72, y: 42.5 });
    press(document.body, 'Z', { ctrlKey: true, shiftKey: true });
    expect(bed()).toMatchObject({ x: 73, y: 42.5 });
  });
});

describe('useKeyboardShortcuts key runs', () => {
  const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
  const BOX: Obstacle = { id: 'o1', shape: 'box', label: 'Radiator', x: 30, y: 100, rotation: 0, width: 30, depth: 8, height: 30, elevation: 0 };

  /** Undoes every step and returns how many there were. */
  function stepCount(): number {
    let n = 0;
    while (undo()) n++;
    return n;
  }

  beforeEach(() => {
    usePlanStore.getState().reset({ ...furnishedDocument(), openings: [D1], obstacles: [BOX] });
    renderHook(() => useKeyboardShortcuts());
    clearHistory();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Arrow run, furnish: 3 ArrowRight presses each 1000 ms apart are 1 step that moved the item 3 in', () => {
    expect(CONFIG.historyMergeMs).toBe(1000);
    useUiStore.getState().select(BED);
    press(document.body, 'ArrowRight');
    vi.advanceTimersByTime(1000);
    press(document.body, 'ArrowRight');
    vi.advanceTimersByTime(1000);
    press(document.body, 'ArrowRight');
    expect(bed()).toMatchObject({ x: 75, y: 42.5 });
    expect(stepCount()).toBe(1);
    expect(bed()).toMatchObject({ x: 72, y: 42.5 });
  });

  it('Arrow run, slow: 2 presses 1001 ms apart are 2 steps', () => {
    useUiStore.getState().select(BED);
    press(document.body, 'ArrowRight');
    vi.advanceTimersByTime(1001);
    press(document.body, 'ArrowRight');
    expect(stepCount()).toBe(2);
  });

  it('Into a wall: ArrowUp on the bed flush with the back wall leaves it there, prevents default and is no step', () => {
    useUiStore.getState().select(BED);
    const ev = press(document.body, 'ArrowUp');
    expect(bed()).toMatchObject({ x: 72, y: 42.5 });
    expect(ev.defaultPrevented).toBe(true);
    expect(stepCount()).toBe(0);
  });

  it('Arrows then R: ArrowRight then R on the same item at once are 1 step', () => {
    useUiStore.getState().select(BED);
    press(document.body, 'ArrowRight');
    press(document.body, 'r');
    expect(bed()).toMatchObject({ x: 73, angle: 90 });
    expect(stepCount()).toBe(1);
    expect(bed()).toMatchObject({ x: 72, angle: 0 });
  });

  it('Two things: ArrowRight on the bed, then on the desk at once, are 2 steps', () => {
    // The furnished plan's desk is flush with the right wall; partly outside the room (x 127–153), ArrowRight moves it.
    const doc = furnishedDocument();
    usePlanStore.getState().reset({
      ...doc,
      openings: [D1],
      obstacles: [BOX],
      items: doc.items.map((i) => (i.id === 'seed-desk' ? { ...i, x: 140 } : i)),
    });
    clearHistory();
    useUiStore.getState().select(BED);
    press(document.body, 'ArrowRight');
    useUiStore.getState().select('seed-desk');
    press(document.body, 'ArrowRight');
    expect(stepCount()).toBe(2);
  });

  it.each([
    ['a corner', 'ArrowRight', () => useUiStore.getState().selectCorner('c2')],
    ['a wall', 'ArrowDown', () => useUiStore.getState().selectWall('c1')],
    ['a door', 'ArrowRight', () => useUiStore.getState().selectOpening('d1')],
    ['an obstacle', 'ArrowRight', () => useUiStore.getState().selectObstacle('o1')],
    ['an obstacle', 'r', () => useUiStore.getState().selectObstacle('o1')],
  ] as const)('Room mode runs: two presses at once on %s (%s) are 1 step', (_thing, key, selectIt) => {
    useUiStore.getState().setMode('room');
    selectIt();
    const before = usePlanStore.getState();
    press(document.body, key);
    press(document.body, key);
    expect(usePlanStore.getState()).not.toBe(before);
    expect(stepCount()).toBe(1);
    const after = usePlanStore.getState();
    expect([after.room, after.openings, after.obstacles]).toEqual([before.room, before.openings, before.obstacles]);
  });

  it('Corner then wall: an arrow on corner c1, then on wall c1 (which starts at it) at once, are 2 steps', () => {
    useUiStore.getState().setMode('room');
    const before = usePlanStore.getState().room;
    useUiStore.getState().selectCorner('c1');
    press(document.body, 'ArrowRight');
    const afterCorner = usePlanStore.getState().room;
    expect(afterCorner).not.toBe(before);
    useUiStore.getState().selectWall('c1');
    press(document.body, 'ArrowDown');
    expect(usePlanStore.getState().room).not.toBe(afterCorner);
    expect(undo()).toBe(true);
    expect(usePlanStore.getState().room).toBe(afterCorner);
    expect(stepCount()).toBe(1);
    expect(usePlanStore.getState().room).toBe(before);
  });

  it('Backspace is its own step: ArrowRight then Backspace at once are 2 steps', () => {
    useUiStore.getState().select(BED);
    press(document.body, 'ArrowRight');
    press(document.body, 'Backspace');
    expect(bed()).toBeUndefined();
    expect(stepCount()).toBe(2);
    expect(bed()).toMatchObject({ x: 72, y: 42.5 });
  });

  it.each([
    ['furnish', () => useUiStore.getState().select(BED)],
    ['room', () => useUiStore.getState().selectCorner('c2')],
  ] as const)('Escape in %s mode adds no step and is not keyed', (mode, selectIt) => {
    useUiStore.getState().setMode(mode);
    selectIt();
    vi.mocked(runKeyed).mockClear();
    press(document.body, 'Escape');
    expect(runKeyed).not.toHaveBeenCalled();
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it('Delete is its own step: ArrowRight then Delete at once are 2 steps', () => {
    useUiStore.getState().select(BED);
    press(document.body, 'ArrowRight');
    press(document.body, 'Delete');
    expect(bed()).toBeUndefined();
    expect(stepCount()).toBe(2);
    expect(bed()).toMatchObject({ x: 72, y: 42.5 });
  });
});

describe('startDrag', () => {
  function DragTarget(props: { onMove: (dx: number, dy: number) => void; onEnd?: () => void; onParent: () => void }) {
    return (
      <div onPointerDown={props.onParent}>
        <div data-testid="handle" onPointerDown={(e) => startDrag(e, props.onMove, props.onEnd)} />
      </div>
    );
  }

  it('prevents default, stops propagation and reports movement relative to the start', () => {
    const onMove = vi.fn();
    const onParent = vi.fn();
    render(<DragTarget onMove={onMove} onParent={onParent} />);
    const notCancelled = fireEvent.pointerDown(screen.getByTestId('handle'), { clientX: 10, clientY: 20 });
    expect(notCancelled).toBe(false);
    expect(onParent).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { clientX: 15, clientY: 32 });
    expect(onMove).toHaveBeenLastCalledWith(5, 12);
    fireEvent.pointerUp(window);
  });

  it.each(['pointerUp', 'pointerCancel'] as const)('%s ends the drag, calls onEnd once and removes listeners', (end) => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    render(<DragTarget onMove={onMove} onEnd={onEnd} onParent={() => {}} />);
    fireEvent.pointerDown(screen.getByTestId('handle'), { clientX: 0, clientY: 0 });
    fireEvent[end](window);
    expect(onEnd).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(window, { clientX: 5, clientY: 5 });
    fireEvent.pointerUp(window);
    fireEvent.pointerCancel(window);
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('useElementSize', () => {
  let observed: { cb: ResizeObserverCallback; disconnected: boolean } | null = null;

  class FakeResizeObserver implements ResizeObserver {
    private readonly entry: { cb: ResizeObserverCallback; disconnected: boolean };
    constructor(cb: ResizeObserverCallback) {
      this.entry = { cb, disconnected: false };
      observed = this.entry;
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      this.entry.disconnected = true;
    }
  }

  let box = { w: 0, h: 0 };
  const widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get');
  const heightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get');

  beforeEach(() => {
    observed = null;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    widthSpy.mockImplementation(() => box.w);
    heightSpy.mockImplementation(() => box.h);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    widthSpy.mockReset();
    heightSpy.mockReset();
  });

  function Sized() {
    const [ref, size] = useElementSize<HTMLDivElement>();
    return <div ref={ref} data-testid="sized">{`${size.width}x${size.height}`}</div>;
  }

  function resize(w: number, h: number): void {
    box = { w, h };
    act(() => {
      observed?.cb([], {} as ResizeObserver);
    });
  }

  it('starts at 800x560 while the element measures zero', () => {
    box = { w: 0, h: 0 };
    render(<Sized />);
    expect(screen.getByTestId('sized')).toHaveTextContent('800x560');
  });

  it('measures on mount and on resize, ignoring changes of 1 px or less', () => {
    box = { w: 640, h: 480 };
    render(<Sized />);
    expect(screen.getByTestId('sized')).toHaveTextContent('640x480');
    resize(641, 481);
    expect(screen.getByTestId('sized')).toHaveTextContent('640x480');
    resize(642, 480);
    expect(screen.getByTestId('sized')).toHaveTextContent('642x480');
  });

  it('disconnects the observer on unmount', () => {
    box = { w: 640, h: 480 };
    const { unmount } = render(<Sized />);
    unmount();
    expect(observed?.disconnected).toBe(true);
  });
});
