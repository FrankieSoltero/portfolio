import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findConflicts } from '../../domain/conflicts';
import { roomBounds, roomHeight, roomOutline } from '../../domain/shape';
import type { Obstacle, Opening } from '../../domain/types';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { furnishedDocument } from '../../test/fixtures';
import { readTokens } from '../../styles/tokens';
import type { Tokens } from '../../styles/tokens';
import type { SceneInput } from '../../three/SceneRenderer';
import { computeCameraPose } from '../../view/camera';
import { captureView } from '../../view/captureRegistry';
import type { PaneRect } from '../../view/panes';
import ThreeView from './ThreeView';

// No WebGL in jsdom: the scene renderer is replaced by a recorder.
const sr = vi.hoisted(() => ({
  ctor: vi.fn<(canvas: HTMLCanvasElement, tokens: unknown) => void>(),
  update: vi.fn<(input: unknown) => void>(),
  dispose: vi.fn<() => void>(),
  capture: vi.fn<() => HTMLCanvasElement | null>(),
  fail: false,
}));
vi.mock('../../three/SceneRenderer', () => ({
  SceneRenderer: class {
    private readonly canvas: HTMLCanvasElement;
    constructor(canvas: HTMLCanvasElement, tokens: unknown) {
      sr.ctor(canvas, tokens);
      if (sr.fail) throw new Error('WebGL unavailable');
      this.canvas = canvas;
    }
    update(input: unknown): void {
      sr.update(input);
    }
    capture(): HTMLCanvasElement | null {
      return sr.capture();
    }
    /** Like the real renderer, disposing forces a context loss on the canvas. */
    dispose(): void {
      sr.dispose();
      this.canvas.dispatchEvent(new Event('webglcontextlost'));
    }
  },
}));

// jsdom has no stylesheet, so the tokens are supplied (or withheld) per test.
vi.mock('../../styles/tokens', () => ({ readTokens: vi.fn() }));

const T: Tokens = {
  bg: 'T-bg', text: 'T-text', n100: 'T-n100', n200: 'T-n200',
  a100: 'T-a100', a200: 'T-a200', a300: 'T-a300', a400: 'T-a400', a700: 'T-a700',
};

const PANE: PaneRect = { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 800 };

const originalMarkWebgl = useUiStore.getState().markWebglUnavailable;

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

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

function lastInput(): SceneInput {
  const call = sr.update.mock.calls.at(-1);
  if (!call) throw new Error('update never called');
  return call[0] as SceneInput;
}

/** Replaces markWebglUnavailable with a spy that still performs the real action. */
function spyMarkWebgl(): ReturnType<typeof vi.fn<() => void>> {
  const spy = vi.fn(originalMarkWebgl);
  useUiStore.setState({ markWebglUnavailable: spy });
  return spy;
}

beforeEach(() => {
  // The furnished plan, so the view is drawn with items in it.
  usePlanStore.getState().reset(furnishedDocument());
  useUiStore.getState().reset();
  sr.ctor.mockClear();
  sr.update.mockClear();
  sr.dispose.mockClear();
  sr.capture.mockReset();
  sr.capture.mockReturnValue(null);
  sr.fail = false;
  frames = new Map();
  nextFrame = 1;
  vi.mocked(readTokens).mockReturnValue(T);
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
  useUiStore.setState({ markWebglUnavailable: originalMarkWebgl });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ThreeView', () => {
  it('creates one scene renderer on the canvas and updates it with the store state', () => {
    const { container } = render(<ThreeView pane={PANE} />);
    flushFrames();
    flushFrames();
    expect(sr.ctor).toHaveBeenCalledTimes(1);
    expect(sr.ctor).toHaveBeenCalledWith(canvasOf(container), T);
    expect(sr.update).toHaveBeenCalledTimes(1);
    const plan = usePlanStore.getState();
    const ui = useUiStore.getState();
    const input = lastInput();
    expect(input.outline).toEqual(roomOutline(plan.room));
    expect(input.height).toBe(roomHeight(plan.room));
    expect(input).not.toHaveProperty('room');
    expect(input.items).toBe(plan.items);
    expect(input.selectedId).toBeNull();
    expect(input.conflicts).toEqual(findConflicts(plan.items, plan.room));
    expect(input.pose).toEqual(computeCameraPose(roomBounds(plan.room), roomHeight(plan.room), ui.camera, PANE));
    expect(input.viewWidth).toBe(1000);
    expect(input.viewHeight).toBe(600);
  });

  it('passes the room corners, openings and obstacles from the store, and updates when they change', () => {
    render(<ThreeView pane={PANE} />);
    flushFrames();
    flushFrames();
    const plan = usePlanStore.getState();
    expect(lastInput().outline).toBe(plan.room.outline);
    expect(lastInput().openings).toBe(plan.openings);
    expect(lastInput().obstacles).toBe(plan.obstacles);
    const openings: Opening[] = [
      { id: 'd1', kind: 'door', wallId: plan.room.outline[0]?.id ?? '', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' },
    ];
    const obstacles: Obstacle[] = [
      { id: 'o1', shape: 'box', label: '', x: 30, y: 130, rotation: 90, width: 20, depth: 10, height: 30, elevation: 40 },
    ];
    act(() => usePlanStore.setState({ openings, obstacles }));
    flushFrames();
    expect(sr.update).toHaveBeenCalledTimes(2);
    expect(lastInput().openings).toBe(openings);
    expect(lastInput().obstacles).toBe(obstacles);
  });

  it('caps the pixel ratio at the configured maximum', () => {
    vi.stubGlobal('devicePixelRatio', 3);
    render(<ThreeView pane={PANE} />);
    flushFrames();
    flushFrames();
    expect(lastInput().pixelRatio).toBe(2);
  });

  it('coalesces store changes into at most one update per animation frame', () => {
    render(<ThreeView pane={PANE} />);
    flushFrames();
    flushFrames();
    expect(sr.update).toHaveBeenCalledTimes(1);
    // Separate acts, so each change is its own render within the same frame.
    act(() => useUiStore.getState().select('seed-desk'));
    act(() => useUiStore.getState().setCamera({ yaw: 0.2, pitch: 0.7, zoom: 1.2 }));
    act(() => usePlanStore.getState().moveItemTo('seed-desk', 100, 90));
    expect(frames.size).toBe(1);
    flushFrames();
    expect(sr.update).toHaveBeenCalledTimes(2);
    expect(lastInput().selectedId).toBe('seed-desk');
    flushFrames();
    expect(sr.update).toHaveBeenCalledTimes(2);
  });

  it('orbits the camera from the drag start on pointer drag', () => {
    const { container } = render(<ThreeView pane={PANE} />);
    fireEvent.pointerDown(canvasOf(container), { clientX: 10, clientY: 20 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 25 });
    fireEvent.pointerMove(window, { clientX: 110, clientY: 30 });
    fireEvent.pointerUp(window);
    const cam = useUiStore.getState().camera;
    expect(cam.yaw).toBeCloseTo(-1.45, 10);
    expect(cam.pitch).toBeCloseTo(0.61, 10);
    expect(cam.zoom).toBe(1);
  });

  it('zooms on wheel through a non-passive listener and prevents the page from scrolling', () => {
    const add = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener');
    const { container } = render(<ThreeView pane={PANE} />);
    expect(add).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    const ev = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    act(() => {
      canvasOf(container).dispatchEvent(ev);
    });
    expect(useUiStore.getState().camera.zoom).toBeCloseTo(1.1052, 4);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('marks WebGL unavailable once and stays mounted when the renderer cannot be created', () => {
    const mark = spyMarkWebgl();
    sr.fail = true;
    const { container } = render(<ThreeView pane={PANE} />);
    flushFrames();
    flushFrames();
    expect(sr.ctor).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().webglAvailable).toBe(false);
    expect(sr.update).not.toHaveBeenCalled();
    expect(canvasOf(container)).toBeTruthy();
  });

  it('marks WebGL unavailable when the canvas loses its context', () => {
    const mark = spyMarkWebgl();
    const { container } = render(<ThreeView pane={PANE} />);
    flushFrames();
    act(() => {
      canvasOf(container).dispatchEvent(new Event('webglcontextlost'));
    });
    expect(mark).toHaveBeenCalledTimes(1);
  });

  it('disposes the renderer once on unmount and never updates afterwards', () => {
    const { unmount } = render(<ThreeView pane={PANE} />);
    flushFrames();
    flushFrames();
    expect(sr.update).toHaveBeenCalledTimes(1);
    act(() => useUiStore.getState().select('seed-desk'));
    expect(frames.size).toBe(1);
    unmount();
    expect(sr.dispose).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    flushFrames();
    expect(sr.update).toHaveBeenCalledTimes(1);
  });

  it('does not mark WebGL unavailable for the context loss its own unmount forces', () => {
    const mark = spyMarkWebgl();
    const { unmount } = render(<ThreeView pane={PANE} />);
    flushFrames();
    flushFrames();
    unmount();
    expect(sr.dispose).toHaveBeenCalledTimes(1);
    expect(mark).not.toHaveBeenCalled();
    expect(useUiStore.getState().webglAvailable).toBe(true);
  });

  it('gives the canvas an accessible name', () => {
    const { getByRole } = render(<ThreeView pane={PANE} />);
    expect(getByRole('img', { name: '3D view of the room' })).toBeInstanceOf(HTMLCanvasElement);
  });

  it('waits for the colour tokens before creating the renderer, then creates exactly one', () => {
    vi.mocked(readTokens).mockReturnValue(null);
    render(<ThreeView pane={PANE} />);
    flushFrames();
    expect(sr.ctor).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    vi.mocked(readTokens).mockReturnValue(T);
    flushFrames();
    expect(sr.ctor).toHaveBeenCalledTimes(1);
    expect(sr.ctor).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), T);
    flushFrames();
    flushFrames();
    expect(sr.ctor).toHaveBeenCalledTimes(1);
    expect(sr.update).toHaveBeenCalledTimes(1);
  });

  it('registers no capture until its renderer exists', () => {
    vi.mocked(readTokens).mockReturnValue(null);
    render(<ThreeView pane={PANE} />);
    flushFrames();
    sr.capture.mockReturnValue(document.createElement('canvas'));
    expect(captureView()).toBeNull();
    expect(sr.capture).not.toHaveBeenCalled();
  });

  it("registers a capture that returns the renderer's capture once the renderer exists", () => {
    const picture = document.createElement('canvas');
    sr.capture.mockReturnValue(picture);
    render(<ThreeView pane={PANE} />);
    flushFrames();
    expect(captureView()).toBe(picture);
    expect(sr.capture).toHaveBeenCalledTimes(1);
    sr.capture.mockReturnValue(null);
    expect(captureView()).toBeNull();
  });

  it('unregisters its capture on unmount', () => {
    sr.capture.mockReturnValue(document.createElement('canvas'));
    const { unmount } = render(<ThreeView pane={PANE} />);
    flushFrames();
    expect(captureView()).not.toBeNull();
    unmount();
    expect(captureView()).toBeNull();
  });
});
