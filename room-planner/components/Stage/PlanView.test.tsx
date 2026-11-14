import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialDocument } from '../../domain/catalog';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { snapRoomDim } from '../../domain/geometry';
import type { Item, PlanDocument } from '../../domain/types';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import type { PaneRect } from '../../view/panes';
import { computeClearances, computePlanLayout } from '../../view/planLayout';
import { InsetFrame } from './InsetFrame';
import { PlanView } from './PlanView';

const MAIN: PaneRect = { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 608 };
const INSET: PaneRect = { left: 600, top: 300, w: 380, h: 280, z: 8, inset: true, divider: false, safeW: 380 };
/** Fitted scale for the seeded 144×168 room in MAIN: (600 − 128) / 168. */
const SCALE = 472 / 168;

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

function px(el: HTMLElement, prop: 'left' | 'top' | 'width' | 'height'): number {
  return parseFloat(el.style[prop]);
}

function itemEl(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
  if (!el) throw new Error(`no item ${id}`);
  return el;
}

function roomEl(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.plan-room');
  if (!el) throw new Error('no room');
  return el;
}

/** The [left, top, width, height] percentages of an item's part hairlines. */
function partBoxes(id: string): number[][] {
  return [...itemEl(id).querySelectorAll<HTMLElement>('.plan-part')].map((p) =>
    [p.style.left, p.style.top, p.style.width, p.style.height].map((v) => {
      expect(v.endsWith('%')).toBe(true);
      return parseFloat(v);
    }),
  );
}

function expectBoxClose(actual: number[] | undefined, expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((v, i) => expect(actual?.[i]).toBeCloseTo(v, 6));
}

function item(id: string): Item | undefined {
  return usePlanStore.getState().items.find((i) => i.id === id);
}

const RUG: Item = {
  id: 'rug-1', kind: 'rug', name: 'Wool rug', host: 'shop.example', sourceUrl: null, price: 100,
  w: 60, d: 40, h: 1, x: 10, y: 100, rot: 0, model: { tier: 'parametric', label: 'Parametric', assetUrl: null },
};

function withRug(): PlanDocument {
  const doc = createInitialDocument();
  return { ...doc, items: [...doc.items, RUG] };
}

describe('PlanView', () => {
  it('renders one box per item at ox + x·scale, oy + y·scale, sized footprint × scale', () => {
    render(<PlanView pane={MAIN} />);
    const L = computePlanLayout(usePlanStore.getState().room, MAIN);
    expect(L.scale).toBeCloseTo(SCALE, 6);
    const boxes = document.querySelectorAll('[data-item-id]');
    expect(boxes).toHaveLength(2);
    const bed = itemEl('seed-bed');
    expect(px(bed, 'left')).toBeCloseTo(L.ox + 40 * SCALE, 3);
    expect(px(bed, 'top')).toBeCloseTo(L.oy + 0, 3);
    expect(px(bed, 'width')).toBeCloseTo(64 * SCALE, 3);
    expect(px(bed, 'height')).toBeCloseTo(85 * SCALE, 3);
    // The desk is rotated a quarter turn, so its footprint is 26 × 55.
    const desk = itemEl('seed-desk');
    expect(px(desk, 'left')).toBeCloseTo(L.ox + 118 * SCALE, 3);
    expect(px(desk, 'top')).toBeCloseTo(L.oy + 104 * SCALE, 3);
    expect(px(desk, 'width')).toBeCloseTo(26 * SCALE, 3);
    expect(px(desk, 'height')).toBeCloseTo(55 * SCALE, 3);
  });

  it('items are role=button, labelled by name, aria-pressed by selection', () => {
    useUiStore.getState().select('seed-bed');
    render(<PlanView pane={MAIN} />);
    const bed = screen.getByRole('button', { name: 'Low platform bed, queen' });
    expect(bed).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tack writing desk' })).toHaveAttribute('aria-pressed', 'false');
    expect(bed).toHaveClass('plan-item');
  });

  it('makes every item keyboard-focusable with tabindex 0', () => {
    render(<PlanView pane={MAIN} />);
    for (const el of document.querySelectorAll('[data-item-id]')) expect(el).toHaveAttribute('tabindex', '0');
  });

  it('Enter on a focused item selects it', () => {
    render(<PlanView pane={MAIN} />);
    const desk = itemEl('seed-desk');
    desk.focus();
    expect(desk).toHaveFocus();
    fireEvent.keyDown(desk, { key: 'Enter' });
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
  });

  it('Space on a focused item selects it and prevents default', () => {
    render(<PlanView pane={MAIN} />);
    const desk = itemEl('seed-desk');
    desk.focus();
    const notCancelled = fireEvent.keyDown(desk, { key: ' ' });
    expect(notCancelled).toBe(false);
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
  });

  it('other keys on a focused item are left alone (not prevented, no selection)', () => {
    render(<PlanView pane={MAIN} />);
    const desk = itemEl('seed-desk');
    desk.focus();
    for (const key of ['ArrowRight', 'r', 'Delete', 'Escape']) {
      expect(fireEvent.keyDown(desk, { key })).toBe(true);
    }
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('after Enter selects a focused item, an arrow key reaches the global shortcuts and nudges it', () => {
    renderHook(() => useKeyboardShortcuts());
    render(<PlanView pane={MAIN} />);
    const desk = itemEl('seed-desk');
    desk.focus();
    fireEvent.keyDown(desk, { key: 'Enter' });
    fireEvent.keyDown(desk, { key: 'ArrowLeft' });
    expect(item('seed-desk')).toMatchObject({ x: 117, y: 104 });
  });

  it('a click on an item selects it', () => {
    render(<PlanView pane={MAIN} />);
    fireEvent.click(itemEl('seed-desk'));
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
  });

  it('labels both room dimensions in feet', () => {
    render(<PlanView pane={MAIN} />);
    expect(screen.getByText('12′ 0″')).toBeInTheDocument();
    expect(screen.getByText('14′ 0″')).toBeInTheDocument();
  });

  it.each([
    ['main', 30, MAIN],
    ['inset', 22, INSET],
  ] as const)('draws the dimension lines outside the room in the %s pane (%i px)', (_name, off, pane) => {
    render(<PlanView pane={pane} />);
    const room = roomEl();
    const wDim = document.querySelector<HTMLElement>('.plan-dim-w');
    const lDim = document.querySelector<HTMLElement>('.plan-dim-l');
    if (!wDim || !lDim) throw new Error('no dimension lines');
    expect(px(wDim, 'top')).toBeCloseTo(px(room, 'top') - off, 3);
    expect(px(wDim, 'left')).toBeCloseTo(px(room, 'left'), 3);
    expect(px(wDim, 'width')).toBeCloseTo(px(room, 'width'), 3);
    expect(px(lDim, 'left')).toBeCloseTo(px(room, 'left') - off, 3);
    expect(px(lDim, 'top')).toBeCloseTo(px(room, 'top'), 3);
    expect(px(lDim, 'height')).toBeCloseTo(px(room, 'height'), 3);
  });

  it.each([
    ['ft', 12],
    ['m', 50 / 2.54],
  ] as const)('sizes the room grid to one grid step in %s', (units, step) => {
    usePlanStore.getState().setUnits(units);
    render(<PlanView pane={MAIN} />);
    const g = step * SCALE;
    const [a, b] = roomEl().style.backgroundSize.split(' ').map(parseFloat);
    expect(a).toBeCloseTo(g, 3);
    expect(b).toBeCloseTo(g, 3);
  });

  it('room box is placed at the layout origin and sized room × scale, with corner marks', () => {
    render(<PlanView pane={MAIN} />);
    const L = computePlanLayout(usePlanStore.getState().room, MAIN);
    const room = roomEl();
    expect(px(room, 'left')).toBeCloseTo(L.ox, 3);
    expect(px(room, 'top')).toBeCloseTo(L.oy, 3);
    expect(px(room, 'width')).toBeCloseTo(144 * SCALE, 3);
    expect(px(room, 'height')).toBeCloseTo(168 * SCALE, 3);
    expect(room.querySelectorAll(':scope > i.corner')).toHaveLength(4);
  });

  it('shows name and dims only on boxes larger than 84×38 px', () => {
    render(<PlanView pane={MAIN} />);
    // Bed 64×85 in → 180×239 px: labelled. Desk footprint 26×55 in → 73×155 px: too narrow.
    const bed = itemEl('seed-bed');
    expect(bed).toHaveTextContent('Low platform bed, queen');
    expect(bed).toHaveTextContent('64 × 85 × 38 in');
    expect(itemEl('seed-desk').textContent).toBe('');
    expect(itemEl('seed-desk').querySelector('.plan-item-label')).toBeNull();
  });

  it('draws one hairline per part for multi-part kinds and none for a shelf', () => {
    const doc = createInitialDocument();
    const shelf: Item = { ...RUG, id: 'shelf-1', kind: 'shelf', name: 'Shelf', w: 30, d: 12, h: 70, x: 0, y: 150 };
    usePlanStore.getState().reset({ ...doc, items: [...doc.items, shelf] });
    render(<PlanView pane={MAIN} />);
    const parts = partBoxes('seed-bed');
    expect(parts).toHaveLength(4);
    // Bed part 0 is [0,1,.04,1] unrotated.
    expectBoxClose(parts[0], [0, 4, 100, 96]);
    expect(itemEl('shelf-1').querySelectorAll('.plan-part')).toHaveLength(0);
  });

  it('rotates part hairlines with the item', () => {
    render(<PlanView pane={MAIN} />);
    // Desk rot 1: part 1 [.02,.06,.06,.94] maps to [1−.94, 1−.06, .02, .06].
    const parts = partBoxes('seed-desk');
    expect(parts).toHaveLength(3);
    expectBoxClose(parts[1], [6, 2, 88, 4]);
  });

  it('marks the selected item is-selected with z-index 4', () => {
    useUiStore.getState().select('seed-desk');
    render(<PlanView pane={MAIN} />);
    expect(itemEl('seed-desk')).toHaveClass('is-selected');
    expect(itemEl('seed-desk').style.zIndex).toBe('4');
    expect(itemEl('seed-bed')).not.toHaveClass('is-selected');
    expect(itemEl('seed-bed').style.zIndex).toBe('2');
  });

  it('marks a conflicting unselected item is-conflict', () => {
    usePlanStore.getState().moveItemTo('seed-desk', 50, 10); // onto the bed
    render(<PlanView pane={MAIN} />);
    expect(itemEl('seed-desk')).toHaveClass('is-conflict');
    expect(itemEl('seed-desk')).not.toHaveClass('is-selected');
  });

  it('a non-conflicting item has no is-conflict class', () => {
    render(<PlanView pane={MAIN} />);
    expect(itemEl('seed-desk')).not.toHaveClass('is-conflict');
    expect(itemEl('seed-bed')).not.toHaveClass('is-conflict');
  });

  it('marks a rug is-rug with z-index 1, other pieces z-index 2', () => {
    usePlanStore.getState().reset(withRug());
    render(<PlanView pane={MAIN} />);
    expect(itemEl('rug-1')).toHaveClass('is-rug');
    expect(itemEl('rug-1').style.zIndex).toBe('1');
    expect(itemEl('seed-bed')).not.toHaveClass('is-rug');
    expect(itemEl('seed-bed').style.zIndex).toBe('2');
  });

  it('selects an item on pointerdown and does not bubble to the deselect handler', () => {
    render(<PlanView pane={MAIN} />);
    fireEvent.pointerDown(itemEl('seed-desk'), { clientX: 10, clientY: 10 });
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
    fireEvent.pointerUp(window);
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
  });

  it('drags the bed by (+28.095, +56.19) px to x 50, y 20', () => {
    render(<PlanView pane={MAIN} />);
    fireEvent.pointerDown(itemEl('seed-bed'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 128.095, clientY: 156.19 });
    fireEvent.pointerUp(window);
    expect(item('seed-bed')).toMatchObject({ x: 50, y: 20 });
  });

  it('clamps a drag inside the room: x = room.w − footprint width', () => {
    render(<PlanView pane={MAIN} />);
    fireEvent.pointerDown(itemEl('seed-bed'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 5000, clientY: 100 });
    fireEvent.pointerUp(window);
    expect(item('seed-bed')?.x).toBe(144 - 64);
  });

  it('pointerdown on the pane background deselects', () => {
    useUiStore.getState().select('seed-bed');
    const { container } = render(<PlanView pane={MAIN} />);
    const root = container.firstElementChild;
    if (!root) throw new Error('no root');
    fireEvent.pointerDown(root);
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('draws one clearance line per computeClearances result for the selected bed, chips carry the labels', () => {
    useUiStore.getState().select('seed-bed');
    render(<PlanView pane={MAIN} />);
    const s = usePlanStore.getState();
    const bed = item('seed-bed');
    if (!bed) throw new Error('no bed');
    const expected = computeClearances(bed, s.room, computePlanLayout(s.room, MAIN), s.units);
    const lines = [...document.querySelectorAll<HTMLElement>('.plan-clearance')];
    expect(lines).toHaveLength(expected.length);
    expect(expected.length).toBe(3); // top gap is 0 and skipped
    expected.forEach((c, i) => {
      const el = lines[i];
      if (!el) throw new Error(`no clearance line ${i}`);
      expect(px(el, 'left')).toBeCloseTo(c.left, 3);
      expect(px(el, 'top')).toBeCloseTo(c.top, 3);
      expect(px(el, c.orientation === 'h' ? 'width' : 'height')).toBeCloseTo(c.length, 3);
      expect(el).toHaveClass(`is-${c.orientation}`);
      expect(el.querySelector('.plan-clearance-chip')?.textContent).toBe(c.label);
    });
  });

  it('omits the chip on a clearance line whose showLabel is false', () => {
    usePlanStore.getState().moveItemTo('seed-bed', 10, 0); // 10 in left gap → 28 px
    useUiStore.getState().select('seed-bed');
    render(<PlanView pane={MAIN} />);
    const s = usePlanStore.getState();
    const bed = item('seed-bed');
    if (!bed) throw new Error('no bed');
    const expected = computeClearances(bed, s.room, computePlanLayout(s.room, MAIN), s.units);
    expect(expected.some((c) => !c.showLabel)).toBe(true);
    const lines = [...document.querySelectorAll<HTMLElement>('.plan-clearance')];
    expect(lines).toHaveLength(expected.length);
    expected.forEach((c, i) => {
      const chip = lines[i]?.querySelector('.plan-clearance-chip');
      if (c.showLabel) expect(chip?.textContent).toBe(c.label);
      else expect(chip).toBeNull();
    });
  });

  it('draws no clearances when nothing is selected', () => {
    render(<PlanView pane={MAIN} />);
    expect(document.querySelectorAll('.plan-clearance')).toHaveLength(0);
  });

  it('draws no clearances when the selected item is outside the room', () => {
    usePlanStore.getState().setRoomDim('w', 90); // bed spans x 40–104
    useUiStore.getState().select('seed-bed');
    render(<PlanView pane={MAIN} />);
    expect(document.querySelectorAll('.plan-clearance')).toHaveLength(0);
  });

  it('drags the width handle +84.285 px to room.w 174', () => {
    render(<PlanView pane={MAIN} />);
    const handle = screen.getByTitle('Drag to change width');
    fireEvent.pointerDown(handle, { clientX: 500, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 584.285, clientY: 300 });
    fireEvent.pointerUp(window);
    expect(usePlanStore.getState().room.w).toBe(174);
  });

  it('places the handles centred on the right and bottom walls', () => {
    render(<PlanView pane={MAIN} />);
    const L = computePlanLayout(usePlanStore.getState().room, MAIN);
    const w = 144 * SCALE;
    const h = 168 * SCALE;
    const hw = screen.getByTitle('Drag to change width');
    const hl = screen.getByTitle('Drag to change length');
    expect(px(hw, 'left')).toBeCloseTo(L.ox + w - 6, 3);
    expect(px(hw, 'top')).toBeCloseTo(L.oy + h / 2 - 16, 3);
    expect(px(hl, 'left')).toBeCloseTo(L.ox + w / 2 - 16, 3);
    expect(px(hl, 'top')).toBeCloseTo(L.oy + h - 6, 3);
  });

  it('freezes the layout during a handle drag and recomputes it on pointerup', () => {
    render(<PlanView pane={MAIN} />);
    const before = { left: px(roomEl(), 'left'), top: px(roomEl(), 'top') };
    fireEvent.pointerDown(screen.getByTitle('Drag to change width'), { clientX: 500, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 584.285, clientY: 300 });
    expect(usePlanStore.getState().room.w).toBe(174);
    // Unfrozen, 174 in would fit at (480 / 174) px/in and move the origin.
    expect(px(roomEl(), 'left')).toBeCloseTo(before.left, 3);
    expect(px(roomEl(), 'top')).toBeCloseTo(before.top, 3);
    expect(px(roomEl(), 'width')).toBeCloseTo(174 * SCALE, 3);
    fireEvent.pointerUp(window);
    const after = computePlanLayout(usePlanStore.getState().room, MAIN);
    expect(after.scale).not.toBeCloseTo(SCALE, 3);
    expect(px(roomEl(), 'left')).toBeCloseTo(after.ox, 3);
    expect(px(roomEl(), 'width')).toBeCloseTo(174 * after.scale, 3);
  });

  it('drags the length handle: room.l = snapRoomDim(l0 + dy / scale)', () => {
    render(<PlanView pane={MAIN} />);
    fireEvent.pointerDown(screen.getByTitle('Drag to change length'), { clientX: 300, clientY: 500 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 500 - 56.19 }); // −20 in → 148
    fireEvent.pointerUp(window);
    // Handles snap to 3 in: snapRoomDim(148) = 147.
    expect(snapRoomDim(168 - 56.19 / SCALE)).toBe(147);
    expect(usePlanStore.getState().room.l).toBe(147);
  });

  it('snaps and clamps a handle drag through snapRoomDim', () => {
    render(<PlanView pane={MAIN} />);
    fireEvent.pointerDown(screen.getByTitle('Drag to change length'), { clientX: 300, clientY: 500 });
    fireEvent.pointerMove(window, { clientX: 300, clientY: -5000 });
    fireEvent.pointerUp(window);
    expect(usePlanStore.getState().room.l).toBe(36);
  });

  it('a handle pointerdown does not deselect', () => {
    useUiStore.getState().select('seed-bed');
    render(<PlanView pane={MAIN} />);
    fireEvent.pointerDown(screen.getByTitle('Drag to change width'), { clientX: 0, clientY: 0 });
    fireEvent.pointerUp(window);
    expect(useUiStore.getState().selectedId).toBe('seed-bed');
  });

  it('titles the handles', () => {
    render(<PlanView pane={MAIN} />);
    expect(screen.getByTitle('Drag to change width')).toHaveClass('plan-handle', 'is-w');
    expect(screen.getByTitle('Drag to change length')).toHaveClass('plan-handle', 'is-l');
  });

  it('re-renders when the store changes', () => {
    render(<PlanView pane={MAIN} />);
    act(() => usePlanStore.getState().moveItemTo('seed-bed', 50, 20));
    const L = computePlanLayout(usePlanStore.getState().room, MAIN);
    expect(px(itemEl('seed-bed'), 'left')).toBeCloseTo(L.ox + 50 * SCALE, 3);
  });
});

describe('InsetFrame', () => {
  it('renders the label, corner marks and a Swap button that calls onSwap once without the parent pointerdown', async () => {
    const onSwap = vi.fn();
    const onParent = vi.fn();
    render(
      <div onPointerDown={onParent}>
        <InsetFrame label="Plan" onSwap={onSwap} />
      </div>,
    );
    expect(screen.getByText('Plan')).toHaveClass('inset-label');
    expect(document.querySelectorAll('i.corner')).toHaveLength(4);
    const swap = screen.getByRole('button', { name: 'Swap' });
    expect(swap).toHaveClass('btn', 'btn-secondary');
    await userEvent.setup().click(swap);
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onParent).not.toHaveBeenCalled();
  });

  it('renders the 3D label', () => {
    render(<InsetFrame label="3D" onSwap={() => {}} />);
    expect(screen.getByText('3D')).toBeInTheDocument();
  });
});
