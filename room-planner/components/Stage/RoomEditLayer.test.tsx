import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { wallsOf } from '../../domain/outline';
import { roomBounds } from '../../domain/shape';
import type { Corner, Point } from '../../domain/types';
import { addCornerOnWall, dragCornerTo } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import type { PaneRect } from '../../view/panes';
import { computePlanLayout, type PlanLayout, toPane } from '../../view/planLayout';
import { RoomEditLayer } from './RoomEditLayer';

// The actions run for real; the spies record how the layer calls them.
vi.mock('../../state/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/actions')>();
  return { ...actual, dragCornerTo: vi.fn(actual.dragCornerTo), addCornerOnWall: vi.fn(actual.addCornerOnWall) };
});

const MAIN: PaneRect = { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 608 };
const NEW_ID = '00000000-0000-4000-8000-000000000002';

let layout: PlanLayout;

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  useUiStore.getState().setMode('room');
  layout = computePlanLayout(roomBounds(usePlanStore.getState().room), MAIN);
  vi.mocked(dragCornerTo).mockClear();
  vi.mocked(addCornerOnWall).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Renders the layer inside a stand-in for the plan view; `onParent` sees pointer downs that bubble. */
function renderLayer(onParent: () => void = () => {}): HTMLElement {
  render(
    <div data-testid="plan" onPointerDown={onParent}>
      <RoomEditLayer layout={layout} />
    </div>,
  );
  return screen.getByTestId('plan');
}

function handle(n: number): HTMLElement {
  return screen.getByRole('button', { name: `Corner ${n}` });
}

function wallHits(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.room-wall-hit')];
}

function corner(id: string): Corner | undefined {
  return usePlanStore.getState().room.outline.find((c) => c.id === id);
}

function px(el: HTMLElement, prop: 'left' | 'top' | 'width' | 'height'): number {
  return parseFloat(el.style[prop]);
}

/** The last target dragCornerTo was given, and its options. */
function lastDrag(): { id: string; target: Point; opts: { angleSnap: boolean; toleranceIn: number } } {
  const call = vi.mocked(dragCornerTo).mock.lastCall;
  if (!call) throw new Error('dragCornerTo was not called');
  return { id: call[0], target: call[1], opts: call[2] };
}

describe('RoomEditLayer corner handles', () => {
  it('renders one button per corner, named Corner <n>, centred on the corner', () => {
    renderLayer();
    const outline = usePlanStore.getState().room.outline;
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Corner 1', 'Corner 2', 'Corner 3', 'Corner 4',
    ]);
    outline.forEach((c, i) => {
      const b = handle(i + 1);
      expect(b.tagName).toBe('BUTTON');
      expect(b).toHaveAttribute('type', 'button');
      expect(b).toHaveClass('room-corner');
      const p = toPane(c, layout);
      expect(px(b, 'left')).toBeCloseTo(p.x, 3);
      expect(px(b, 'top')).toBeCloseTo(p.y, 3);
    });
  });

  it('aria-pressed reflects the selected corner', () => {
    useUiStore.getState().selectCorner('c3');
    renderLayer();
    expect(handle(3)).toHaveAttribute('aria-pressed', 'true');
    for (const n of [1, 2, 4]) expect(handle(n)).toHaveAttribute('aria-pressed', 'false');
  });

  it('pointer down on a handle selects its corner and does not reach the plan background', () => {
    const onParent = vi.fn();
    renderLayer(onParent);
    fireEvent.pointerDown(handle(2), { clientX: 100, clientY: 100 });
    expect(useUiStore.getState().selectedCornerId).toBe('c2');
    expect(handle(2)).toHaveAttribute('aria-pressed', 'true');
    expect(onParent).not.toHaveBeenCalled();
    fireEvent.pointerUp(window);
  });

  it('Enter and Space on a focused handle select its corner', async () => {
    const user = userEvent.setup();
    renderLayer();
    handle(2).focus();
    await user.keyboard('{Enter}');
    expect(useUiStore.getState().selectedCornerId).toBe('c2');
    handle(4).focus();
    await user.keyboard(' ');
    expect(useUiStore.getState().selectedCornerId).toBe('c4');
  });
});

describe('RoomEditLayer corner drag', () => {
  it('calls dragCornerTo with the start plus the pointer movement over the scale, angle snapping on', () => {
    renderLayer();
    const s = layout.scale;
    fireEvent.pointerDown(handle(2), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 130, clientY: 85 });
    const { id, target, opts } = lastDrag();
    expect(id).toBe('c2');
    expect(target.x).toBeCloseTo(144 + 30 / s, 9);
    expect(target.y).toBeCloseTo(-15 / s, 9);
    expect(opts.angleSnap).toBe(true);
    expect(opts.toleranceIn).toBeCloseTo(CONFIG.angleSnapTolerancePx / s, 9);
    fireEvent.pointerUp(window);
  });

  it('a move with Alt held turns angle snapping off, and releasing Alt turns it back on', () => {
    renderLayer();
    fireEvent.pointerDown(handle(2), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 110, clientY: 100, altKey: true });
    expect(lastDrag().opts.angleSnap).toBe(false);
    fireEvent.pointerMove(window, { clientX: 112, clientY: 100, altKey: false });
    expect(lastDrag().opts.angleSnap).toBe(true);
    fireEvent.pointerUp(window);
  });

  it('a refused move keeps the last valid outline with the reason; a valid move again follows and clears it', () => {
    renderLayer();
    const s = layout.scale;
    fireEvent.pointerDown(handle(2), { clientX: 100, clientY: 100 });
    // To (150, 0): a valid spot.
    fireEvent.pointerMove(window, { clientX: 100 + 6 * s, clientY: 100, altKey: true });
    expect(corner('c2')).toEqual({ id: 'c2', x: 150, y: 0 });
    const valid = usePlanStore.getState().room;
    // To (−50, 84): the wall from c2 to c3 would cross the wall from c4 to c1.
    fireEvent.pointerMove(window, { clientX: 100 - 194 * s, clientY: 100 + 84 * s, altKey: true });
    expect(usePlanStore.getState().room).toBe(valid);
    expect(useUiStore.getState().roomProblem).toBe('Walls cannot cross.');
    expect(px(handle(2), 'left')).toBeCloseTo(toPane({ x: 150, y: 0 }, layout).x, 3);
    // Back to (160, −10).
    fireEvent.pointerMove(window, { clientX: 100 + 16 * s, clientY: 100 - 10 * s, altKey: true });
    expect(corner('c2')).toEqual({ id: 'c2', x: 160, y: -10 });
    expect(useUiStore.getState().roomProblem).toBeNull();
    fireEvent.pointerUp(window);
  });

  it.each(['pointerUp', 'pointerCancel'] as const)('%s ends the drag and removes every window listener it added', (end) => {
    const added: [string, EventListenerOrEventListenerObject | null][] = [];
    const removed: [string, EventListenerOrEventListenerObject | null][] = [];
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
      added.push([type, fn]);
      add(type, fn, opts);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, fn, opts) => {
      removed.push([type, fn]);
      remove(type, fn, opts);
    });
    renderLayer();
    fireEvent.pointerDown(handle(2), { clientX: 100, clientY: 100 });
    expect(added.length).toBeGreaterThan(0);
    fireEvent[end](window);
    for (const entry of added) expect(removed).toContainEqual(entry);
    vi.mocked(dragCornerTo).mockClear();
    fireEvent.pointerMove(window, { clientX: 150, clientY: 150 });
    expect(dragCornerTo).not.toHaveBeenCalled();
  });
});

describe('RoomEditLayer wall hit targets', () => {
  it('draws one hit target per wall, at least 12 px across, along the wall and before every handle', () => {
    renderLayer();
    const walls = wallsOf(usePlanStore.getState().room.outline);
    const hits = wallHits();
    expect(hits).toHaveLength(walls.length);
    const firstHandle = handle(1);
    walls.forEach((w, i) => {
      const el = hits[i];
      if (!el) throw new Error(`no hit target for wall ${i}`);
      expect(el.dataset.wallId).toBe(w.id);
      const a = toPane(w.a, layout);
      const h = px(el, 'height');
      expect(h).toBeGreaterThanOrEqual(12);
      // A band from corner a, as long as the wall, centred on it and turned to point at b.
      expect(px(el, 'left')).toBeCloseTo(a.x, 3);
      expect(px(el, 'top')).toBeCloseTo(a.y - h / 2, 3);
      expect(px(el, 'width')).toBeCloseTo(w.length * layout.scale, 3);
      const deg = (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI;
      const m = /rotate\((-?[\d.]+)deg\)/.exec(el.style.transform);
      expect(parseFloat(m?.[1] ?? 'NaN')).toBeCloseTo(deg, 6);
      // Earlier in the document, so a handle near a corner is drawn over it.
      expect(el.compareDocumentPosition(firstHandle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('pointer down on a wall adds a corner at the pointer position in plan inches and selects it', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(NEW_ID);
    const onParent = vi.fn();
    const plan = renderLayer(onParent);
    // The plan view sits 50 px right and 20 px down in the window.
    vi.spyOn(plan, 'getBoundingClientRect').mockReturnValue({
      left: 50, top: 20, right: 658, bottom: 620, x: 50, y: 20, width: 608, height: 600, toJSON: () => ({}),
    });
    const p = toPane({ x: 72.3, y: 1 }, layout);
    const top = wallHits()[0];
    if (!top) throw new Error('no top wall');
    fireEvent.pointerDown(top, { clientX: p.x + 50, clientY: p.y + 20 });
    expect(addCornerOnWall).toHaveBeenCalledTimes(1);
    const [wallId, at] = vi.mocked(addCornerOnWall).mock.calls[0] ?? [];
    expect(wallId).toBe('c1');
    expect(at?.x).toBeCloseTo(72.3, 9);
    expect(at?.y).toBeCloseTo(1, 9);
    expect(usePlanStore.getState().room.outline.map((c) => c.id)).toEqual(['c1', NEW_ID, 'c2', 'c3', 'c4']);
    expect(corner(NEW_ID)).toEqual({ id: NEW_ID, x: 72, y: 0 });
    expect(useUiStore.getState().selectedCornerId).toBe(NEW_ID);
    expect(screen.getByRole('button', { name: 'Corner 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(onParent).not.toHaveBeenCalled();
  });

  it('pointer down on a wall within 6 in of its end adds nothing and gives the reason', () => {
    renderLayer();
    const before = usePlanStore.getState().room;
    const p = toPane({ x: 140, y: 0 }, layout);
    const top = wallHits()[0];
    if (!top) throw new Error('no top wall');
    fireEvent.pointerDown(top, { clientX: p.x, clientY: p.y });
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().roomProblem).toBe('That wall would be too short.');
    expect(wallHits()).toHaveLength(4);
  });
});
