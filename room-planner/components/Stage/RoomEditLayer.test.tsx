import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import { createInitialDocument } from '../../domain/catalog';
import { openingSpan } from '../../domain/openings';
import { wallsOf } from '../../domain/outline';
import { roomBounds } from '../../domain/shape';
import type { Corner, Door, Obstacle, Opening, Point, WindowOpening } from '../../domain/types';
import { addCornerOnWall, dragCornerTo, placeOpeningOnWall, slideOpeningTo } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import type { PaneRect } from '../../view/panes';
import { computePlanLayout, type PlanLayout, toPane } from '../../view/planLayout';
import { FreezePlanLayoutContext, RoomEditLayer, useRoomModeDrag } from './RoomEditLayer';

// The actions run for real; the spies record how the layer calls them.
vi.mock('../../state/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/actions')>();
  return {
    ...actual,
    dragCornerTo: vi.fn(actual.dragCornerTo),
    addCornerOnWall: vi.fn(actual.addCornerOnWall),
    placeOpeningOnWall: vi.fn(actual.placeOpeningOnWall),
    slideOpeningTo: vi.fn(actual.slideOpeningTo),
  };
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
  vi.mocked(placeOpeningOnWall).mockClear();
  vi.mocked(slideOpeningTo).mockClear();
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

describe('useRoomModeDrag', () => {
  /** A bare element that starts a room-mode drag on every pointer down, with no button check of its own. */
  function Dragger({ onMove, onEnd }: { onMove: (dx: number, dy: number) => void; onEnd?: () => void }) {
    const beginDrag = useRoomModeDrag();
    return <div data-testid="dragger" onPointerDown={(e) => beginDrag(e, onMove, { freeze: layout, onEnd })} />;
  }

  it('calls onEnd once for a secondary-button pointer down, so a caller\'s setup is undone, and freezes nothing', () => {
    const freeze = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    render(
      <FreezePlanLayoutContext value={freeze}>
        <Dragger onMove={onMove} onEnd={onEnd} />
      </FreezePlanLayoutContext>,
    );
    fireEvent.pointerDown(screen.getByTestId('dragger'), { clientX: 100, clientY: 100, button: 2 });
    expect(onEnd).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(window, { clientX: 140, clientY: 120 });
    fireEvent.pointerUp(window);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(freeze).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('starts no drag for a secondary-button pointer down: no freeze, no moves', () => {
    const freeze = vi.fn();
    const onMove = vi.fn();
    render(
      <FreezePlanLayoutContext value={freeze}>
        <Dragger onMove={onMove} />
      </FreezePlanLayoutContext>,
    );
    fireEvent.pointerDown(screen.getByTestId('dragger'), { clientX: 100, clientY: 100, button: 2 });
    fireEvent.pointerMove(window, { clientX: 140, clientY: 120 });
    fireEvent.pointerUp(window);
    expect(freeze).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId('dragger'), { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(window, { clientX: 140, clientY: 120 });
    expect(freeze).toHaveBeenCalledWith(layout);
    expect(onMove).toHaveBeenLastCalledWith(40, 20);
    fireEvent.pointerUp(window);
  });
});

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

  it('a secondary-button pointer down on a handle selects nothing, freezes nothing and starts no drag', () => {
    useUiStore.getState().selectCorner('c3');
    const freeze = vi.fn();
    const onParent = vi.fn();
    render(
      <div onPointerDown={onParent}>
        <FreezePlanLayoutContext value={freeze}>
          <RoomEditLayer layout={layout} />
        </FreezePlanLayoutContext>
      </div>,
    );
    const before = usePlanStore.getState();
    fireEvent.pointerDown(handle(2), { clientX: 100, clientY: 100, button: 2 });
    expect(useUiStore.getState().selectedCornerId).toBe('c3');
    expect(freeze).not.toHaveBeenCalled();
    // Like a wall band, the press does not reach the plan background, which would clear the selection.
    expect(onParent).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { clientX: 140, clientY: 120 });
    expect(dragCornerTo).not.toHaveBeenCalled();
    expect(usePlanStore.getState()).toBe(before);
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

  it('once the mode is no longer room, further moves of the drag edit nothing and set no problem', () => {
    renderLayer();
    const s = layout.scale;
    fireEvent.pointerDown(handle(2), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 100 + 6 * s, clientY: 100, altKey: true });
    const moved = usePlanStore.getState().room;
    expect(corner('c2')).toEqual({ id: 'c2', x: 150, y: 0 });
    useUiStore.getState().setMode('furnish');
    // A valid target, then one the walls would cross.
    fireEvent.pointerMove(window, { clientX: 100 + 16 * s, clientY: 100 - 10 * s, altKey: true });
    fireEvent.pointerMove(window, { clientX: 100 - 194 * s, clientY: 100 + 84 * s, altKey: true });
    expect(usePlanStore.getState().room).toBe(moved);
    expect(useUiStore.getState().roomProblem).toBeNull();
    // Back in room mode before the pointer is released: that drag stays over.
    useUiStore.getState().setMode('room');
    fireEvent.pointerMove(window, { clientX: 100 + 16 * s, clientY: 100 - 10 * s, altKey: true });
    expect(usePlanStore.getState().room).toBe(moved);
    fireEvent.pointerUp(window);
  });

  it('unmounting mid-drag removes the Alt listener and releases the layout freeze', () => {
    const freeze = vi.fn();
    const added: [string, EventListenerOrEventListenerObject | null, unknown][] = [];
    const removed: [string, EventListenerOrEventListenerObject | null][] = [];
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, opts) => {
      added.push([type, fn, opts]);
      add(type, fn, opts);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type, fn, opts) => {
      removed.push([type, fn]);
      remove(type, fn, opts);
    });
    const { unmount } = render(
      <FreezePlanLayoutContext value={freeze}>
        <RoomEditLayer layout={layout} />
      </FreezePlanLayoutContext>,
    );
    fireEvent.pointerDown(handle(2), { clientX: 100, clientY: 100 });
    expect(freeze).toHaveBeenLastCalledWith(layout);
    unmount();
    expect(freeze).toHaveBeenLastCalledWith(null);
    const alt = added.find(([type, , opts]) => type === 'pointermove' && opts === true);
    if (!alt) throw new Error('no Alt listener was added');
    expect(removed).toContainEqual([alt[0], alt[1]]);
    fireEvent.pointerUp(window);
    expect(freeze).toHaveBeenLastCalledWith(null);
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

/** Door on the top wall c1, 20 in from (0, 0), 32 in wide. */
const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
/** Window on the right wall c2, 100 in from (144, 0), 36 in wide. */
const W1: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 24, height: 48 };
const BOX: Obstacle = { id: 'o1', shape: 'box', label: 'Radiator', x: 30, y: 140, rotation: 0, width: 30, depth: 8, height: 30, elevation: 0 };

function loadOpenings(openings: Opening[], obstacles: Obstacle[] = []): void {
  usePlanStore.getState().reset({ ...createInitialDocument(), openings, obstacles });
  useUiStore.getState().setMode('room');
  layout = computePlanLayout(roomBounds(usePlanStore.getState().room), MAIN);
}

function openingHandle(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

function storedOpening(id: string): Opening | undefined {
  return usePlanStore.getState().openings.find((o) => o.id === id);
}

function wallHit(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.room-wall-hit[data-wall-id="${id}"]`);
  if (!el) throw new Error(`no hit target for wall ${id}`);
  return el;
}

describe('RoomEditLayer placing doors and windows', () => {
  it('with the door tool, pointer down on a wall places a door there and adds no corner', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(NEW_ID);
    const onParent = vi.fn();
    renderLayer(onParent);
    act(() => useUiStore.getState().setRoomTool('door'));
    const outline = usePlanStore.getState().room.outline;
    const p = toPane({ x: 72, y: 5 }, layout);
    fireEvent.pointerDown(wallHit('c1'), { clientX: p.x, clientY: p.y, button: 0 });
    expect(placeOpeningOnWall).toHaveBeenCalledTimes(1);
    const [wallId, at] = vi.mocked(placeOpeningOnWall).mock.calls[0] ?? [];
    expect(wallId).toBe('c1');
    expect(at?.x).toBeCloseTo(72, 9);
    expect(at?.y).toBeCloseTo(5, 9);
    expect(addCornerOnWall).not.toHaveBeenCalled();
    expect(usePlanStore.getState().room.outline).toBe(outline);
    // Centred on the click: offset 72 − 32 / 2.
    expect(storedOpening(NEW_ID)).toMatchObject({ kind: 'door', wallId: 'c1', offset: 56 });
    expect(useUiStore.getState().roomTool).toBe('corner');
    expect(openingHandle('Door on wall 1')).toHaveAttribute('aria-pressed', 'true');
    expect(onParent).not.toHaveBeenCalled();
  });

  it('with the window tool, pointer down on the right wall places a window on wall 2', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(NEW_ID);
    useUiStore.getState().setRoomTool('window');
    renderLayer();
    const p = toPane({ x: 144, y: 84 }, layout);
    fireEvent.pointerDown(wallHit('c2'), { clientX: p.x, clientY: p.y, button: 0 });
    expect(vi.mocked(placeOpeningOnWall).mock.calls[0]?.[0]).toBe('c2');
    expect(storedOpening(NEW_ID)).toMatchObject({ kind: 'window', wallId: 'c2' });
    expect(openingHandle('Window on wall 2')).toBeInTheDocument();
  });

  it.each(['corner', 'door', 'window'] as const)('a secondary-button pointer down on a wall does nothing (%s tool)', (tool) => {
    useUiStore.getState().setRoomTool(tool);
    useUiStore.getState().selectCorner(tool === 'corner' ? 'c3' : null);
    const onParent = vi.fn();
    renderLayer(onParent);
    const before = usePlanStore.getState();
    const p = toPane({ x: 72, y: 0 }, layout);
    fireEvent.pointerDown(wallHit('c1'), { clientX: p.x, clientY: p.y, button: 2 });
    expect(addCornerOnWall).not.toHaveBeenCalled();
    expect(placeOpeningOnWall).not.toHaveBeenCalled();
    expect(usePlanStore.getState().room).toBe(before.room);
    expect(usePlanStore.getState().openings).toBe(before.openings);
    expect(useUiStore.getState().roomTool).toBe(tool);
    expect(useUiStore.getState().selectedCornerId).toBe(tool === 'corner' ? 'c3' : null);
    expect(onParent).not.toHaveBeenCalled();
  });

  it('marks the layer is-placing only while a door or window tool is armed', () => {
    renderLayer();
    const layer = document.querySelector('.room-edit-layer');
    expect(layer).not.toHaveClass('is-placing');
    act(() => useUiStore.getState().setRoomTool('door'));
    expect(layer).toHaveClass('is-placing');
    act(() => useUiStore.getState().setRoomTool('window'));
    expect(layer).toHaveClass('is-placing');
    act(() => useUiStore.getState().setRoomTool('corner'));
    expect(layer).not.toHaveClass('is-placing');
  });
});

describe('RoomEditLayer opening handles', () => {
  it('draws a button.room-opening centred on each opening, named by kind and wall, between the wall bands and the corner handles', () => {
    loadOpenings([D1, W1]);
    renderLayer();
    const outline = usePlanStore.getState().room.outline;
    const handles = [...document.querySelectorAll<HTMLElement>('button.room-opening')];
    expect(handles.map((h) => h.getAttribute('aria-label'))).toEqual(['Door on wall 1', 'Window on wall 2']);
    [D1, W1].forEach((o, i) => {
      const el = handles[i];
      if (!el) throw new Error('missing handle');
      expect(el).toHaveAttribute('type', 'button');
      expect(el).toHaveAttribute('aria-pressed', 'false');
      const span = openingSpan(outline, o);
      if (!span) throw new Error('no span');
      const mid = toPane({ x: (span.a.x + span.b.x) / 2, y: (span.a.y + span.b.y) / 2 }, layout);
      expect(px(el, 'left')).toBeCloseTo(mid.x, 3);
      expect(px(el, 'top')).toBeCloseTo(mid.y, 3);
      for (const band of wallHits()) {
        expect(band.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
      expect(el.compareDocumentPosition(handle(1)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('names a handle by kind and wall alone when its wall has one opening', () => {
    loadOpenings([D1, W1]);
    renderLayer();
    const names = [...document.querySelectorAll('button.room-opening')].map((h) => h.getAttribute('aria-label'));
    expect(names).toEqual(['Door on wall 1', 'Window on wall 2']);
  });

  it('adds the ordinal by offset among the wall\'s openings when the wall has more than one', () => {
    // Stored out of offset order: the ordinal follows the offset along the wall, not the list.
    const late: WindowOpening = { ...W1, id: 'w2', wallId: 'c1', offset: 100, width: 30 };
    const early: WindowOpening = { ...W1, id: 'w3', wallId: 'c1', offset: 60, width: 30 };
    loadOpenings([late, D1, early, W1]);
    renderLayer();
    const names = [...document.querySelectorAll('button.room-opening')].map((h) => h.getAttribute('aria-label'));
    expect(names).toEqual(['Window on wall 1 (3 of 3)', 'Door on wall 1 (1 of 3)', 'Window on wall 1 (2 of 3)', 'Window on wall 2']);
    expect(new Set(names).size).toBe(names.length);
  });

  it('draws no handle for an opening whose wall is missing', () => {
    loadOpenings([D1]);
    usePlanStore.setState({ openings: [{ ...D1, wallId: 'zz' }] });
    renderLayer();
    expect(document.querySelectorAll('.room-opening')).toHaveLength(0);
  });

  it('aria-pressed reflects the selected opening', () => {
    loadOpenings([D1, W1]);
    useUiStore.getState().selectOpening('w1');
    renderLayer();
    expect(openingHandle('Window on wall 2')).toHaveAttribute('aria-pressed', 'true');
    expect(openingHandle('Door on wall 1')).toHaveAttribute('aria-pressed', 'false');
  });

  it('pointer down on a handle selects its opening and does not reach the plan background', () => {
    loadOpenings([D1, W1]);
    useUiStore.getState().selectCorner('c2');
    const onParent = vi.fn();
    renderLayer(onParent);
    fireEvent.pointerDown(openingHandle('Door on wall 1'), { clientX: 100, clientY: 100 });
    expect(useUiStore.getState().selectedOpeningId).toBe('d1');
    expect(useUiStore.getState().selectedCornerId).toBeNull();
    expect(onParent).not.toHaveBeenCalled();
    fireEvent.pointerUp(window);
  });

  it('a secondary-button pointer down on a handle selects nothing, freezes nothing and starts no drag', () => {
    loadOpenings([D1, W1]);
    useUiStore.getState().selectOpening('w1');
    const freeze = vi.fn();
    const onParent = vi.fn();
    render(
      <div onPointerDown={onParent}>
        <FreezePlanLayoutContext value={freeze}>
          <RoomEditLayer layout={layout} />
        </FreezePlanLayoutContext>
      </div>,
    );
    const before = usePlanStore.getState();
    fireEvent.pointerDown(openingHandle('Door on wall 1'), { clientX: 100, clientY: 100, button: 2 });
    expect(useUiStore.getState().selectedOpeningId).toBe('w1');
    expect(freeze).not.toHaveBeenCalled();
    // Like a wall band, the press does not reach the plan background, which would clear the selection.
    expect(onParent).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { clientX: 140, clientY: 120 });
    expect(slideOpeningTo).not.toHaveBeenCalled();
    expect(usePlanStore.getState()).toBe(before);
    fireEvent.pointerUp(window);
  });

  it('Enter and Space on a focused handle select its opening', async () => {
    loadOpenings([D1, W1]);
    const user = userEvent.setup();
    renderLayer();
    openingHandle('Window on wall 2').focus();
    await user.keyboard('{Enter}');
    expect(useUiStore.getState().selectedOpeningId).toBe('w1');
    openingHandle('Door on wall 1').focus();
    await user.keyboard(' ');
    expect(useUiStore.getState().selectedOpeningId).toBe('d1');
  });
});

describe('RoomEditLayer opening drag', () => {
  it('slides a door on a horizontal wall by the movement along the wall over the scale', () => {
    loadOpenings([D1, W1]);
    renderLayer();
    const s = layout.scale;
    fireEvent.pointerDown(openingHandle('Door on wall 1'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 100 + 10 * s, clientY: 107 });
    expect(slideOpeningTo).toHaveBeenLastCalledWith('d1', expect.closeTo(30, 9));
    expect(storedOpening('d1')?.offset).toBe(30);
    fireEvent.pointerMove(window, { clientX: 100 + 12.4 * s, clientY: 60 });
    expect(slideOpeningTo).toHaveBeenLastCalledWith('d1', expect.closeTo(32.4, 9));
    expect(storedOpening('d1')?.offset).toBe(32);
    fireEvent.pointerUp(window);
  });

  it('slides a window on a vertical wall by the vertical movement only', () => {
    loadOpenings([D1, W1]);
    renderLayer();
    const s = layout.scale;
    fireEvent.pointerDown(openingHandle('Window on wall 2'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 100 - 6 * s });
    expect(slideOpeningTo).toHaveBeenLastCalledWith('w1', expect.closeTo(94, 9));
    expect(storedOpening('w1')?.offset).toBe(94);
    fireEvent.pointerUp(window);
  });

  it('slides a door on the bottom wall (running right to left) further along it when dragged left', () => {
    // Wall c3 runs from (144, 168) to (0, 168): direction (−1, 0).
    loadOpenings([{ ...D1, wallId: 'c3' }]);
    layout = { scale: 2, ox: 10, oy: 20 };
    renderLayer();
    fireEvent.pointerDown(openingHandle('Door on wall 3'), { clientX: 200, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 180, clientY: 300 });
    expect(slideOpeningTo).toHaveBeenLastCalledWith('d1', expect.closeTo(30, 9));
    expect(storedOpening('d1')?.offset).toBe(30);
    fireEvent.pointerUp(window);
  });

  it('freezes the layout for the drag and releases it on pointer up; later moves do nothing', () => {
    loadOpenings([D1]);
    const freeze = vi.fn();
    render(
      <FreezePlanLayoutContext value={freeze}>
        <RoomEditLayer layout={layout} />
      </FreezePlanLayoutContext>,
    );
    fireEvent.pointerDown(openingHandle('Door on wall 1'), { clientX: 100, clientY: 100 });
    expect(freeze).toHaveBeenLastCalledWith(layout);
    fireEvent.pointerUp(window);
    expect(freeze).toHaveBeenLastCalledWith(null);
    vi.mocked(slideOpeningTo).mockClear();
    fireEvent.pointerMove(window, { clientX: 150, clientY: 100 });
    expect(slideOpeningTo).not.toHaveBeenCalled();
  });

  it('pointer cancel ends the drag and releases the layout', () => {
    loadOpenings([D1]);
    const freeze = vi.fn();
    render(
      <FreezePlanLayoutContext value={freeze}>
        <RoomEditLayer layout={layout} />
      </FreezePlanLayoutContext>,
    );
    fireEvent.pointerDown(openingHandle('Door on wall 1'), { clientX: 100, clientY: 100 });
    fireEvent.pointerCancel(window);
    expect(freeze).toHaveBeenLastCalledWith(null);
    fireEvent.pointerMove(window, { clientX: 150, clientY: 100 });
    expect(slideOpeningTo).not.toHaveBeenCalled();
  });

  it('once the mode is no longer room, further moves edit nothing, even back in room mode', () => {
    loadOpenings([D1]);
    renderLayer();
    const s = layout.scale;
    fireEvent.pointerDown(openingHandle('Door on wall 1'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 100 + 10 * s, clientY: 100 });
    expect(storedOpening('d1')?.offset).toBe(30);
    const moved = usePlanStore.getState().openings;
    useUiStore.getState().setMode('furnish');
    fireEvent.pointerMove(window, { clientX: 100 + 20 * s, clientY: 100 });
    useUiStore.getState().setMode('room');
    fireEvent.pointerMove(window, { clientX: 100 + 30 * s, clientY: 100 });
    expect(usePlanStore.getState().openings).toBe(moved);
    fireEvent.pointerUp(window);
  });

  it('unmounting mid-drag releases the layout freeze', () => {
    loadOpenings([D1]);
    const freeze = vi.fn();
    const { unmount } = render(
      <FreezePlanLayoutContext value={freeze}>
        <RoomEditLayer layout={layout} />
      </FreezePlanLayoutContext>,
    );
    fireEvent.pointerDown(openingHandle('Door on wall 1'), { clientX: 100, clientY: 100 });
    expect(freeze).toHaveBeenLastCalledWith(layout);
    unmount();
    expect(freeze).toHaveBeenLastCalledWith(null);
    fireEvent.pointerMove(window, { clientX: 150, clientY: 100 });
    expect(slideOpeningTo).not.toHaveBeenCalled();
    fireEvent.pointerUp(window);
  });
});

describe('RoomEditLayer background', () => {
  function backdrop(): HTMLElement {
    const el = document.querySelector<HTMLElement>('.room-edit-backdrop');
    if (!el) throw new Error('no backdrop');
    return el;
  }

  it('is a full-size element before the wall bands, hidden from assistive technology', () => {
    renderLayer();
    expect(backdrop()).toHaveAttribute('aria-hidden', 'true');
    const firstBand = wallHits()[0];
    if (!firstBand) throw new Error('no wall band');
    expect(backdrop().compareDocumentPosition(firstBand) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ['corner', () => useUiStore.getState().selectCorner('c2')],
    ['opening', () => useUiStore.getState().selectOpening('d1')],
    ['obstacle', () => useUiStore.getState().selectObstacle('o1')],
  ] as const)('pointer down on it clears a selected %s', (_kind, selectIt) => {
    loadOpenings([D1], [BOX]);
    selectIt();
    renderLayer();
    fireEvent.pointerDown(backdrop());
    const ui = useUiStore.getState();
    expect([ui.selectedCornerId, ui.selectedOpeningId, ui.selectedObstacleId]).toEqual([null, null, null]);
  });
});

describe('room editor stacking (stage.css)', () => {
  // Vitest runs from the repo root; under jsdom import.meta.url is not a file URL.
  const css = readFileSync(resolve(process.cwd(), 'room-planner/components/Stage/stage.css'), 'utf8');

  /** The z-index of the rule whose selector is exactly `selector`. */
  function zIndex(selector: string): number {
    const at = css.indexOf(`\n${selector} {`);
    if (at < 0) throw new Error(`no rule ${selector}`);
    const body = css.slice(at, css.indexOf('}', at));
    const m = /z-index:\s*(\d+)/.exec(body);
    if (!m?.[1]) throw new Error(`no z-index in ${selector}`);
    return Number(m[1]);
  }

  it('orders editable obstacles, wall bands, opening handles and corner handles bottom to top, all above the furniture and below the inset frame', () => {
    const order = ['.plan-obstacle.is-editable', '.room-wall-hit', '.room-opening', '.room-corner'].map(zIndex);
    // Furniture uses z-index 1 to 4; the inset frame is 9.
    expect(order[0]).toBeGreaterThan(4);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1] ?? Infinity);
    expect(order[order.length - 1]).toBeLessThan(9);
  });

  it('opening handles are at least 24 px across and every new control has a focus-visible outline', () => {
    const rule = css.slice(css.indexOf('\n.room-opening {'), css.indexOf('}', css.indexOf('\n.room-opening {')));
    expect(Number(/\bwidth:\s*(\d+)px/.exec(rule)?.[1])).toBeGreaterThanOrEqual(24);
    expect(Number(/\bheight:\s*(\d+)px/.exec(rule)?.[1])).toBeGreaterThanOrEqual(24);
    expect(css).toMatch(/\n\.room-opening:focus-visible \{[^}]*outline: 2px solid/);
    expect(css).toMatch(/\n\.plan-obstacle\.is-editable:focus-visible \{[^}]*outline: 2px solid/);
    expect(css).toMatch(/\n\.room-edit-layer\.is-placing \.room-wall-hit \{[^}]*cursor: crosshair/);
  });
});
