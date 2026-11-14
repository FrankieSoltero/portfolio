import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obstacleFootprint } from '../../domain/obstacles';
import { dragObstacleTo } from '../../state/actions';
import type { Door, Obstacle, Opening, WindowOpening } from '../../domain/types';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { planDoc, rectRoom } from '../../test/fixtures';
import { doorDrawing, windowDrawing } from '../../view/planFeatures';
import { planItemBox, type PlanLayout } from '../../view/planLayout';
import { PlanFeatures } from './PlanFeatures';
import { FreezePlanLayoutContext } from './RoomEditLayer';

// The actions run for real; the spy records how the obstacles call it.
vi.mock('../../state/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/actions')>();
  return { ...actual, dragObstacleTo: vi.fn(actual.dragObstacleTo) };
});

const ROOM = rectRoom(144, 168, 96);
const LAYOUT: PlanLayout = { scale: 2, ox: 10, oy: 20 };
const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
const W1: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 24, height: 48 };
/** 30 in wide: 60 px at scale 2, so its label shows. */
const BOX: Obstacle = { id: 'o1', shape: 'box', label: 'Radiator', x: 30, y: 140, rotation: 30, width: 30, depth: 8, height: 30, elevation: 0 };
/** 12 in across: 24 px at scale 2, so its label is hidden. */
const COLUMN: Obstacle = { id: 'o2', shape: 'cylinder', label: 'Column', x: 100, y: 100, rotation: 0, width: 12, depth: 12, height: 96, elevation: 0 };

function load(openings: Opening[], obstacles: Obstacle[]): void {
  usePlanStore.getState().reset(planDoc(ROOM, [], 'ft', openings, obstacles));
}

function attr(el: Element | null | undefined, name: string): number {
  return parseFloat(el?.getAttribute(name) ?? 'NaN');
}

function obstacleEl(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`div.plan-obstacle[data-obstacle-id="${id}"]`);
  if (!el) throw new Error(`no obstacle ${id}`);
  return el;
}

/** Every element PlanFeatures draws for openings and obstacles. */
function drawnElements(): Element[] {
  return [...document.querySelectorAll('svg.plan-features, [data-opening-id], [data-obstacle-id]')];
}

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  vi.mocked(dragObstacleTo).mockClear();
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

describe('PlanFeatures', () => {
  it('draws a door as a gap line, a leaf line and an arc path inside svg.plan-features', () => {
    load([D1], []);
    render(<PlanFeatures layout={LAYOUT} />);
    const svg = document.querySelector('svg.plan-features');
    expect(svg).not.toBeNull();
    const expected = doorDrawing(D1, ROOM.outline, LAYOUT);
    if (expected === null) throw new Error('no drawing');

    const gap = svg?.querySelector('line.plan-door-gap[data-opening-id="d1"]');
    expect([attr(gap, 'x1'), attr(gap, 'y1'), attr(gap, 'x2'), attr(gap, 'y2')]).toEqual([50, 20, 114, 20]);
    const leaf = svg?.querySelector('line.plan-door-leaf[data-opening-id="d1"]');
    expect([attr(leaf, 'x1'), attr(leaf, 'y1'), attr(leaf, 'x2'), attr(leaf, 'y2')]).toEqual([50, 20, 50, 84]);
    const arc = svg?.querySelector('path.plan-door-arc[data-opening-id="d1"]');
    expect(arc?.getAttribute('d')).toBe(expected.arc);
    expect(arc?.getAttribute('d')).toBe('M 114 20 A 64 64 0 0 1 50 84');
  });

  it('draws a window as two line.plan-window elements, on the wall line and 3 px inside', () => {
    load([W1], []);
    render(<PlanFeatures layout={LAYOUT} />);
    const lines = document.querySelectorAll('svg.plan-features line.plan-window[data-opening-id="w1"]');
    expect(lines).toHaveLength(2);
    const coords = [...lines].map((l) => [attr(l, 'x1'), attr(l, 'y1'), attr(l, 'x2'), attr(l, 'y2')]);
    expect(coords).toEqual([[298, 220, 298, 292], [295, 220, 295, 292]]);
    expect(windowDrawing(W1, ROOM.outline, LAYOUT)?.inner).toEqual([{ x: 295, y: 220 }, { x: 295, y: 292 }]);
  });

  it('draws nothing for an opening whose wall is missing', () => {
    load([{ ...D1, wallId: 'zz' }, { ...W1, wallId: 'zz' }], []);
    render(<PlanFeatures layout={LAYOUT} />);
    expect(document.querySelectorAll('[data-opening-id]')).toHaveLength(0);
  });

  it('draws each obstacle as a div.plan-obstacle placed by planItemBox and turned; a column is round', () => {
    load([], [BOX, COLUMN]);
    render(<PlanFeatures layout={LAYOUT} />);
    expect(document.querySelectorAll('div.plan-obstacle')).toHaveLength(2);
    for (const o of [BOX, COLUMN]) {
      const el = obstacleEl(o.id);
      const box = planItemBox(obstacleFootprint(o), LAYOUT);
      expect(parseFloat(el.style.left)).toBeCloseTo(box.left, 9);
      expect(parseFloat(el.style.top)).toBeCloseTo(box.top, 9);
      expect(parseFloat(el.style.width)).toBeCloseTo(box.width, 9);
      expect(parseFloat(el.style.height)).toBeCloseTo(box.height, 9);
      expect(el.style.transform).toBe(`rotate(${box.rotateDeg}deg)`);
    }
    expect(obstacleEl('o1').style.transform).toBe('rotate(30deg)');
    expect(obstacleEl('o1')).not.toHaveClass('is-round');
    expect(obstacleEl('o2')).toHaveClass('is-round');
  });

  it('shows an obstacle label as text only when its box is wider than 48 px', () => {
    load([], [BOX, COLUMN, { ...BOX, id: 'o3', label: 'Exactly 48', width: 24 }, { ...BOX, id: 'o4', label: 'Just over', width: 24.5 }]);
    render(<PlanFeatures layout={LAYOUT} />);
    expect(obstacleEl('o1')).toHaveTextContent('Radiator');
    expect(obstacleEl('o2')).toHaveTextContent('');
    expect(screen.queryByText('Column')).toBeNull();
    expect(screen.queryByText('Exactly 48')).toBeNull();
    expect(obstacleEl('o4')).toHaveTextContent('Just over');
  });

  it('renders a label that looks like markup as visible text, never as an element', () => {
    const label = '<img src=x onerror=alert(1)>';
    load([], [{ ...BOX, label }]);
    render(<PlanFeatures layout={LAYOUT} />);
    expect(screen.getByText(label)).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
  });

  it('flags a conflicting obstacle and the lines of a conflicting opening is-conflict', () => {
    // Taller than the 96 in ceiling: the box (100 in) and the window (60 + 48 = 108 in).
    const tallWindow: WindowOpening = { ...W1, sill: 60 };
    load([D1, tallWindow], [{ ...BOX, height: 100 }, COLUMN]);
    render(<PlanFeatures layout={LAYOUT} />);
    expect(obstacleEl('o1')).toHaveClass('is-conflict');
    expect(obstacleEl('o2')).not.toHaveClass('is-conflict');
    const windowLines = document.querySelectorAll('[data-opening-id="w1"]');
    expect(windowLines).toHaveLength(2);
    for (const el of windowLines) expect(el).toHaveClass('is-conflict');
    const doorParts = document.querySelectorAll('[data-opening-id="d1"]');
    expect(doorParts).toHaveLength(3);
    for (const el of doorParts) expect(el).not.toHaveClass('is-conflict');
  });

  it('is hidden from assistive technology, not focusable, and ignores pointer and key events', () => {
    load([D1, W1], [BOX, COLUMN]);
    useUiStore.getState().select('seed-bed');
    const before = usePlanStore.getState();
    render(<PlanFeatures layout={LAYOUT} />);
    expect(document.querySelector('svg.plan-features')).toHaveAttribute('aria-hidden', 'true');
    for (const id of ['o1', 'o2']) expect(obstacleEl(id)).toHaveAttribute('aria-hidden', 'true');
    for (const el of drawnElements()) {
      expect(el).not.toHaveAttribute('tabindex');
      fireEvent.pointerDown(el, { clientX: 10, clientY: 10 });
      fireEvent.click(el);
      fireEvent.keyDown(el, { key: 'Enter' });
    }
    expect(useUiStore.getState().selectedId).toBe('seed-bed');
    const after = usePlanStore.getState();
    expect(after.openings).toBe(before.openings);
    expect(after.obstacles).toBe(before.obstacles);
  });
});

describe('PlanFeatures obstacles in furnish mode', () => {
  it('have no role, are not editable and take no focus', () => {
    load([], [BOX, COLUMN]);
    render(<PlanFeatures layout={LAYOUT} />);
    for (const id of ['o1', 'o2']) {
      const el = obstacleEl(id);
      expect(el).not.toHaveAttribute('role');
      expect(el).not.toHaveAttribute('tabindex');
      expect(el).not.toHaveAttribute('aria-pressed');
      expect(el).not.toHaveClass('is-editable');
    }
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('PlanFeatures obstacles in room mode', () => {
  function stored(id: string): Obstacle | undefined {
    return usePlanStore.getState().obstacles.find((o) => o.id === id);
  }

  beforeEach(() => {
    load([D1, W1], [BOX, COLUMN, { ...COLUMN, id: 'o3', label: '', x: 60, y: 60 }, { ...BOX, id: 'o4', label: '', x: 60, y: 100 }]);
    useUiStore.getState().setMode('room');
  });

  it('are buttons named by their label, or Box / Column when it is empty, in the tab order and editable', () => {
    render(<PlanFeatures layout={LAYOUT} />);
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Radiator', 'Column', 'Column', 'Box']);
    for (const id of ['o1', 'o2', 'o3', 'o4']) {
      const el = obstacleEl(id);
      expect(el).toHaveAttribute('role', 'button');
      expect(el).toHaveAttribute('tabindex', '0');
      expect(el).not.toHaveAttribute('aria-hidden');
      expect(el).toHaveClass('is-editable');
      expect(el).toHaveAttribute('aria-pressed', 'false');
    }
    // The doors and windows stay a drawing.
    expect(document.querySelector('svg.plan-features')).toHaveAttribute('aria-hidden', 'true');
  });

  it('aria-pressed and is-selected reflect the selected obstacle', () => {
    useUiStore.getState().selectObstacle('o2');
    render(<PlanFeatures layout={LAYOUT} />);
    expect(obstacleEl('o2')).toHaveAttribute('aria-pressed', 'true');
    expect(obstacleEl('o2')).toHaveClass('is-selected');
    expect(obstacleEl('o1')).toHaveAttribute('aria-pressed', 'false');
    expect(obstacleEl('o1')).not.toHaveClass('is-selected');
  });

  it('pointer down selects the obstacle and does not reach the plan background', () => {
    useUiStore.getState().selectCorner('c2');
    const onParent = vi.fn();
    render(
      <div onPointerDown={onParent}>
        <PlanFeatures layout={LAYOUT} />
      </div>,
    );
    fireEvent.pointerDown(obstacleEl('o1'), { clientX: 100, clientY: 100 });
    expect(useUiStore.getState().selectedObstacleId).toBe('o1');
    expect(useUiStore.getState().selectedCornerId).toBeNull();
    expect(obstacleEl('o1')).toHaveAttribute('aria-pressed', 'true');
    expect(onParent).not.toHaveBeenCalled();
    fireEvent.pointerUp(window);
  });

  it('Enter and Space on a focused obstacle select it', async () => {
    const user = userEvent.setup();
    render(<PlanFeatures layout={LAYOUT} />);
    obstacleEl('o2').focus();
    await user.keyboard('{Enter}');
    expect(useUiStore.getState().selectedObstacleId).toBe('o2');
    obstacleEl('o1').focus();
    await user.keyboard(' ');
    expect(useUiStore.getState().selectedObstacleId).toBe('o1');
  });

  it('a drag moves the obstacle from its centre by the movement over the scale', () => {
    render(<PlanFeatures layout={LAYOUT} />);
    fireEvent.pointerDown(obstacleEl('o2'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 90 });
    expect(dragObstacleTo).toHaveBeenLastCalledWith('o2', 110, 95);
    expect(stored('o2')).toMatchObject({ x: 110, y: 95 });
    fireEvent.pointerMove(window, { clientX: 125, clientY: 91 });
    expect(dragObstacleTo).toHaveBeenLastCalledWith('o2', 112.5, 95.5);
    fireEvent.pointerUp(window);
    vi.mocked(dragObstacleTo).mockClear();
    fireEvent.pointerMove(window, { clientX: 150, clientY: 150 });
    expect(dragObstacleTo).not.toHaveBeenCalled();
  });

  it('pointer cancel ends the drag and releases a frozen layout', () => {
    const freeze = vi.fn();
    render(
      <FreezePlanLayoutContext value={freeze}>
        <PlanFeatures layout={LAYOUT} />
      </FreezePlanLayoutContext>,
    );
    fireEvent.pointerDown(obstacleEl('o2'), { clientX: 100, clientY: 100 });
    expect(freeze).toHaveBeenLastCalledWith(LAYOUT);
    fireEvent.pointerCancel(window);
    expect(freeze).toHaveBeenLastCalledWith(null);
    fireEvent.pointerMove(window, { clientX: 150, clientY: 150 });
    expect(dragObstacleTo).not.toHaveBeenCalled();
  });

  it('once the mode is no longer room, further moves edit nothing, even back in room mode', () => {
    render(<PlanFeatures layout={LAYOUT} />);
    fireEvent.pointerDown(obstacleEl('o2'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 90 });
    const moved = usePlanStore.getState().obstacles;
    act(() => useUiStore.getState().setMode('furnish'));
    fireEvent.pointerMove(window, { clientX: 140, clientY: 90 });
    act(() => useUiStore.getState().setMode('room'));
    fireEvent.pointerMove(window, { clientX: 160, clientY: 90 });
    expect(usePlanStore.getState().obstacles).toBe(moved);
    fireEvent.pointerUp(window);
  });

  it('unmounting mid-drag ends the drag', () => {
    const freeze = vi.fn();
    const { unmount } = render(
      <FreezePlanLayoutContext value={freeze}>
        <PlanFeatures layout={LAYOUT} />
      </FreezePlanLayoutContext>,
    );
    fireEvent.pointerDown(obstacleEl('o2'), { clientX: 100, clientY: 100 });
    unmount();
    expect(freeze).toHaveBeenLastCalledWith(null);
    fireEvent.pointerMove(window, { clientX: 150, clientY: 150 });
    expect(dragObstacleTo).not.toHaveBeenCalled();
    fireEvent.pointerUp(window);
  });

  it('back in furnish mode the obstacles are a drawing again', () => {
    render(<PlanFeatures layout={LAYOUT} />);
    act(() => useUiStore.getState().setMode('furnish'));
    expect(obstacleEl('o1')).toHaveAttribute('aria-hidden', 'true');
    expect(obstacleEl('o1')).not.toHaveAttribute('role');
    expect(obstacleEl('o1')).not.toHaveClass('is-editable');
    fireEvent.pointerDown(obstacleEl('o1'), { clientX: 100, clientY: 100 });
    expect(useUiStore.getState().selectedObstacleId).toBeNull();
  });
});
