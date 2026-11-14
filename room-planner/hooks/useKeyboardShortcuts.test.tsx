import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import type { Item } from '../domain/types';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { startDrag } from './startDrag';
import { useElementSize } from './useElementSize';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

const BED = 'seed-bed';

function bed(): Item | undefined {
  return usePlanStore.getState().items.find((i) => i.id === BED);
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
    // Lift the bed off the wall so every arrow direction has room to move.
    usePlanStore.getState().moveItemTo(BED, 40, 20);
    renderHook(() => useKeyboardShortcuts());
  });

  it.each(['r', 'R'])('%s rotates the selected item', (key) => {
    useUiStore.getState().select(BED);
    press(document.body, key);
    expect(bed()?.rot).toBe(1);
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
    expect(bed()?.rot).toBe(1);
  });

  it.each([{ metaKey: true }, { ctrlKey: true }, { altKey: true }])('modifier %o is ignored', (mod) => {
    useUiStore.getState().select(BED);
    press(document.body, 'r', mod);
    press(document.body, 'Backspace', mod);
    const ev = press(document.body, 'ArrowRight', mod);
    expect(bed()).toMatchObject({ x: 40, y: 20, rot: 0 });
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
