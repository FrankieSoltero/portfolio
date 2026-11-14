import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { readTokens } from '../../styles/tokens';
import type { Tokens } from '../../styles/tokens';
import type { PaneRect } from '../../view/panes';
import { BlueprintView } from './BlueprintView';

// jsdom has no stylesheet, so the tokens are supplied (or withheld) per test.
vi.mock('../../styles/tokens', () => ({ readTokens: vi.fn() }));

const T: Tokens = {
  bg: 'T-bg', text: 'T-text', n100: 'T-n100', n200: 'T-n200',
  a100: 'T-a100', a200: 'T-a200', a300: 'T-a300', a400: 'T-a400', a700: 'T-a700',
};

const PANE: PaneRect = { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 1000 };

interface Call { name: string; args: unknown[] }

/** A 2D context stand-in that records method calls; jsdom has no canvas implementation. */
function recordingContext(calls: Call[]): CanvasRenderingContext2D {
  const proxy = new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string') return undefined;
      return (...args: unknown[]) => {
        calls.push({ name, args });
        return name === 'measureText' ? { width: 40 } : undefined;
      };
    },
    set: () => true,
  });
  return proxy as unknown as CanvasRenderingContext2D;
}

let calls: Call[];
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

/** Number of `drawBlueprint` runs so far: each one starts with a single clearRect. */
function draws(): number {
  return calls.filter((c) => c.name === 'clearRect').length;
}

/** Runs every pending animation frame callback once. */
function flushFrames(): void {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((cb) => cb(0));
  });
}

function canvasOf(container: HTMLElement): HTMLCanvasElement {
  const c = container.querySelector('canvas');
  if (!c) throw new Error('no canvas rendered');
  return c;
}

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  calls = [];
  frames = new Map();
  nextFrame = 1;
  vi.mocked(readTokens).mockReturnValue(T);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => recordingContext(calls)) as unknown as HTMLCanvasElement['getContext'],
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'fonts');
});

describe('BlueprintView', () => {
  it('sizes the canvas to the pane at the device pixel ratio, capped at 2, and scales the context', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { container } = render(<BlueprintView pane={PANE} />);
    flushFrames();
    const canvas = canvasOf(container);
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1200);
    const transform = calls.findIndex((c) => c.name === 'setTransform');
    expect(calls[transform]?.args).toEqual([2, 0, 0, 2, 0, 0]);
    const clear = calls.findIndex((c) => c.name === 'clearRect');
    expect(clear).toBeGreaterThan(transform);
    expect(calls[clear]?.args).toEqual([0, 0, 1000, 600]);
  });

  it('coalesces store changes into at most one draw per animation frame', () => {
    render(<BlueprintView pane={PANE} />);
    expect(draws()).toBe(0);
    flushFrames();
    expect(draws()).toBe(1);
    // Separate acts, so each change is its own render within the same frame.
    act(() => useUiStore.getState().select('seed-desk'));
    act(() => useUiStore.getState().setCamera({ yaw: 0.2, pitch: 0.7, zoom: 1.2 }));
    act(() => usePlanStore.getState().moveItemTo('seed-desk', 100, 90));
    expect(frames.size).toBe(1);
    flushFrames();
    expect(draws()).toBe(2);
    flushFrames();
    expect(draws()).toBe(2);
  });

  it('gives the canvas an accessible name', () => {
    const { getByRole } = render(<BlueprintView pane={PANE} />);
    expect(getByRole('img', { name: 'Blueprint view of the room' })).toBeInstanceOf(HTMLCanvasElement);
  });

  it('cancels the pending frame on unmount', () => {
    const { unmount } = render(<BlueprintView pane={PANE} />);
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });

  it('orbits the camera from the drag start on pointer drag', () => {
    const { container } = render(<BlueprintView pane={PANE} />);
    fireEvent.pointerDown(canvasOf(container), { clientX: 10, clientY: 20 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 25 });
    fireEvent.pointerMove(window, { clientX: 110, clientY: 30 });
    fireEvent.pointerUp(window);
    const cam = useUiStore.getState().camera;
    expect(cam.yaw).toBeCloseTo(-1.45, 10);
    expect(cam.pitch).toBeCloseTo(0.61, 10);
    expect(cam.zoom).toBe(1);
  });

  it('zooms on wheel and prevents the page from scrolling', () => {
    const { container } = render(<BlueprintView pane={PANE} />);
    const ev = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    act(() => {
      canvasOf(container).dispatchEvent(ev);
    });
    expect(useUiStore.getState().camera.zoom).toBeCloseTo(1.1052, 4);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('skips drawing until the colour tokens are readable, then draws once', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.mocked(readTokens).mockReturnValue(null);
    render(<BlueprintView pane={PANE} />);
    flushFrames();
    expect(draws()).toBe(0);
    vi.mocked(readTokens).mockReturnValue(T);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    flushFrames();
    expect(draws()).toBe(1);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    flushFrames();
    expect(draws()).toBe(1);
  });

  it('redraws once more when the web fonts finish loading', async () => {
    let resolveFonts: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      resolveFonts = resolve;
    });
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
    render(<BlueprintView pane={PANE} />);
    flushFrames();
    expect(draws()).toBe(1);
    await act(async () => {
      resolveFonts();
      await ready;
    });
    flushFrames();
    expect(draws()).toBe(2);
    flushFrames();
    expect(draws()).toBe(2);
  });
});
