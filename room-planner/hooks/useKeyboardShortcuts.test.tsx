import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectionBar } from '../components/SelectionBar';
import { CONFIG } from '../config';
import type { Corner, Item } from '../domain/types';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { startDrag } from './startDrag';
import { useElementSize } from './useElementSize';
import { ROTATE_STEP_COARSE, ROTATE_STEP_FINE, useKeyboardShortcuts } from './useKeyboardShortcuts';

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
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  appended.splice(0).forEach((el) => el.remove());
});

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    // Lift the bed off the wall so every arrow direction has room to move: its centre goes from
    // (72, 42.5) to exactly (40, 20), off the drag grid, so the rows also show a nudge never re-snaps.
    usePlanStore.getState().moveItemBy(BED, -32, -22.5);
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
