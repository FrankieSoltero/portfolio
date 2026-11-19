import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roomBounds, roomHeight, roomOutline } from '../../domain/shape';
import type { Obstacle, Opening } from '../../domain/types';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { furnishedDocument } from '../../test/fixtures';
import { readTokens } from '../../styles/tokens';
import type { Tokens } from '../../styles/tokens';
import { drawBlueprint } from '../../view/blueprintDraw';
import { computeCameraPose } from '../../view/camera';
import { captureView, registerViewCapture } from '../../view/captureRegistry';
import type { PaneRect } from '../../view/panes';
import { BlueprintView } from './BlueprintView';

// jsdom has no stylesheet, so the tokens are supplied (or withheld) per test.
vi.mock('../../styles/tokens', () => ({ readTokens: vi.fn() }));

// The real drawing still runs; the spy only records each frame's input.
vi.mock('../../view/blueprintDraw', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../view/blueprintDraw')>();
  return { ...actual, drawBlueprint: vi.fn(actual.drawBlueprint) };
});

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
  // The furnished plan, so the view is drawn with items in it.
  usePlanStore.getState().reset(furnishedDocument());
  useUiStore.getState().reset();
  calls = [];
  frames = new Map();
  nextFrame = 1;
  vi.mocked(readTokens).mockReturnValue(T);
  vi.mocked(drawBlueprint).mockClear();
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

  it('draws from the room outline and height, with the pane size and camera pose', () => {
    render(<BlueprintView pane={PANE} />);
    flushFrames();
    const plan = usePlanStore.getState();
    const ui = useUiStore.getState();
    expect(vi.mocked(drawBlueprint)).toHaveBeenCalledTimes(1);
    const input = vi.mocked(drawBlueprint).mock.calls[0]?.[1];
    expect(input?.outline).toEqual(roomOutline(plan.room));
    expect(input?.height).toBe(roomHeight(plan.room));
    expect(input).not.toHaveProperty('room');
    expect(input?.items).toBe(plan.items);
    expect(input?.pose).toEqual(computeCameraPose(roomBounds(plan.room), roomHeight(plan.room), ui.camera, PANE));
    expect(input?.viewWidth).toBe(1000);
    expect(input?.viewHeight).toBe(600);
    expect(input?.safeW).toBe(1000);
  });

  it('passes the room corners, openings and obstacles from the store, and redraws when they change', () => {
    render(<BlueprintView pane={PANE} />);
    flushFrames();
    const plan = usePlanStore.getState();
    const first = vi.mocked(drawBlueprint).mock.calls[0]?.[1];
    expect(first?.outline).toBe(plan.room.outline);
    expect(first?.openings).toBe(plan.openings);
    expect(first?.obstacles).toBe(plan.obstacles);
    const openings: Opening[] = [
      { id: 'd1', kind: 'door', wallId: plan.room.outline[0]?.id ?? '', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' },
    ];
    const obstacles: Obstacle[] = [
      { id: 'o1', shape: 'box', label: '', x: 30, y: 130, rotation: 90, width: 20, depth: 10, height: 30, elevation: 40 },
    ];
    act(() => usePlanStore.setState({ openings, obstacles }));
    flushFrames();
    expect(vi.mocked(drawBlueprint)).toHaveBeenCalledTimes(2);
    const second = vi.mocked(drawBlueprint).mock.calls[1]?.[1];
    expect(second?.openings).toBe(openings);
    expect(second?.obstacles).toBe(obstacles);
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

  describe('capture', () => {
    interface CtxCall { canvas: HTMLCanvasElement; name: string; args: unknown[]; fillStyle: unknown }

    /** Every 2D context call on any canvas, with the canvas and the fill style it was made with. */
    let ctxCalls: CtxCall[];

    /** A 2D context stand-in for `canvas` that records each call and keeps assigned properties. */
    function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
      const state: Record<string, unknown> = {};
      return new Proxy(state, {
        get(_t, name) {
          if (typeof name !== 'string') return undefined;
          if (name in state) return state[name];
          return (...args: unknown[]) => {
            ctxCalls.push({ canvas, name, args, fillStyle: state.fillStyle });
            return name === 'measureText' ? { width: 40 } : undefined;
          };
        },
        set(_t, name, value: unknown) {
          if (typeof name === 'string') state[name] = value;
          return true;
        },
      }) as unknown as CanvasRenderingContext2D;
    }

    beforeEach(() => {
      ctxCalls = [];
      vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(
        (function (this: HTMLCanvasElement) {
          return canvasContext(this);
        }) as unknown as HTMLCanvasElement['getContext'],
      );
    });

    it('captures a new canvas of its own canvas size, filled with the page background, with its drawing on top', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      const { container } = render(<BlueprintView pane={PANE} />);
      flushFrames();
      const view = canvasOf(container);
      const out = captureView();
      if (!out) throw new Error('no capture');
      expect(out).not.toBe(view);
      expect(out.width).toBe(2000);
      expect(out.height).toBe(1200);
      const calls = ctxCalls.filter((c) => c.canvas === out);
      const fill = calls.findIndex((c) => c.name === 'fillRect');
      const draw = calls.findIndex((c) => c.name === 'drawImage');
      expect(fill).toBeGreaterThanOrEqual(0);
      expect(calls[fill]?.args).toEqual([0, 0, 2000, 1200]);
      expect(calls[fill]?.fillStyle).toBe(T.bg);
      expect(draw).toBeGreaterThan(fill);
      expect(calls[draw]?.args).toEqual([view, 0, 0]);
    });

    it('reads the background colour when the picture is taken', () => {
      render(<BlueprintView pane={PANE} />);
      flushFrames();
      vi.mocked(readTokens).mockReturnValue({ ...T, bg: 'T-bg-later' });
      const out = captureView();
      const fill = ctxCalls.find((c) => c.canvas === out && c.name === 'fillRect');
      expect(fill?.fillStyle).toBe('T-bg-later');
    });

    it('captures null when the colour tokens are not readable', () => {
      render(<BlueprintView pane={PANE} />);
      flushFrames();
      vi.mocked(readTokens).mockReturnValue(null);
      expect(captureView()).toBeNull();
    });

    it('captures null when its canvas is zero-size', () => {
      render(<BlueprintView pane={{ ...PANE, w: 0, h: 0, safeW: 0 }} />);
      flushFrames();
      expect(captureView()).toBeNull();
    });

    it('unregisters its capture on unmount', () => {
      const { unmount } = render(<BlueprintView pane={PANE} />);
      flushFrames();
      expect(captureView()).not.toBeNull();
      unmount();
      expect(captureView()).toBeNull();
    });

    it('leaves a newer registration in place when it unmounts (style switch)', () => {
      const { unmount } = render(<BlueprintView pane={PANE} />);
      flushFrames();
      const newer = document.createElement('canvas');
      const unregisterNewer = registerViewCapture(() => newer);
      unmount();
      expect(captureView()).toBe(newer);
      unregisterNewer();
    });

    it('stays registered when an older view unregisters after it mounted (style switch)', () => {
      const unregisterOlder = registerViewCapture(() => document.createElement('canvas'));
      const { container } = render(<BlueprintView pane={PANE} />);
      flushFrames();
      unregisterOlder();
      const out = captureView();
      expect(out).not.toBeNull();
      const draw = ctxCalls.find((c) => c.canvas === out && c.name === 'drawImage');
      expect(draw?.args[0]).toBe(canvasOf(container));
    });
  });
});
