import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialDocument } from '../../domain/catalog';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { setRectangleSize } from '../../domain/outline';
import { boundsOf } from '../../domain/polygon';
import { itemFootprint, roomBounds, roomOutline } from '../../domain/shape';
import { BLOCKS_A_DOOR, COVERS_A_WINDOW, findPlanIssues } from '../../domain/conflicts';
import type { Door, Item, Obstacle, Opening, PlanDocument, Point, WindowOpening } from '../../domain/types';
import { fmtLen } from '../../domain/units';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { placedItem } from '../../test/fixtures';
import type { PaneRect } from '../../view/panes';
import { doorDrawing } from '../../view/planFeatures';
import { computeClearances, computePlanLayout, labelBox, planItemBox, toPane } from '../../view/planLayout';
import { InsetFrame } from './InsetFrame';
import { PlanView } from './PlanView';

// The shape accessors pass through to the real ones; single tests replace them to show the plan
// is drawn from the outline and footprints alone (shapes today's stored data cannot express yet).
vi.mock('../../domain/shape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../domain/shape')>();
  return {
    ...actual,
    roomOutline: vi.fn(actual.roomOutline),
    roomBounds: vi.fn(actual.roomBounds),
    itemFootprint: vi.fn(actual.itemFootprint),
  };
});

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
// Back to the pass-through implementations after a test replaced one.
afterEach(() => {
  vi.mocked(roomOutline).mockReset();
  vi.mocked(roomBounds).mockReset();
  vi.mocked(itemFootprint).mockReset();
});

/** The seeded layout in MAIN. */
function seedLayout(): ReturnType<typeof computePlanLayout> {
  return computePlanLayout(roomBounds(usePlanStore.getState().room), MAIN);
}

function parsePoints(text: string, pattern: RegExp): Point[] {
  return [...text.matchAll(pattern)].map((m) => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }));
}

/** The room area's clip-path polygon points, in pane pixels. */
function clipPoints(): Point[] {
  const clip = roomEl().style.clipPath;
  expect(clip.startsWith('polygon(')).toBe(true);
  return parsePoints(clip, /(-?[\d.]+)px (-?[\d.]+)px/g);
}

/** The points of the SVG polygon that strokes the walls, in pane pixels. */
function wallPoints(): Point[] {
  const poly = document.querySelector('svg.plan-outline polygon.plan-outline-wall');
  if (!poly) throw new Error('no wall polygon');
  return parsePoints(poly.getAttribute('points') ?? '', /(-?[\d.]+),(-?[\d.]+)/g);
}

function expectPointsClose(actual: Point[], expected: Point[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((p, i) => {
    expect(actual[i]?.x).toBeCloseTo(p.x, 3);
    expect(actual[i]?.y).toBeCloseTo(p.y, 3);
  });
}

/** The CSS rotation in degrees of an inline `transform`, or NaN when there is none. */
function rotation(el: Element | null): number {
  const m = /rotate\((-?[\d.]+)deg\)/.exec((el as HTMLElement | null)?.style.transform ?? '');
  return m ? parseFloat(m[1]) : NaN;
}

function labelBoxEl(id: string): HTMLElement | null {
  return itemEl(id).querySelector<HTMLElement>(':scope > .plan-outline-label');
}

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

const RUG: Item = placedItem({ id: 'rug-1', kind: 'rug', name: 'Wool rug', price: 100, w: 60, d: 40, h: 1, cx: 40, cy: 120 });

function withRug(): PlanDocument {
  const doc = createInitialDocument();
  return { ...doc, items: [...doc.items, RUG] };
}

describe('PlanView', () => {
  it('renders one box per item, placed by planItemBox and turned about its centre', () => {
    render(<PlanView pane={MAIN} />);
    const L = seedLayout();
    expect(L.scale).toBeCloseTo(SCALE, 6);
    const boxes = document.querySelectorAll('[data-item-id]');
    expect(boxes).toHaveLength(2);
    // The unturned bed sits where it always did: ox + x·scale, oy + y·scale, 64 × 85 in.
    const bed = itemEl('seed-bed');
    expect(px(bed, 'left')).toBeCloseTo(L.ox + 40 * SCALE, 3);
    expect(px(bed, 'top')).toBeCloseTo(L.oy + 0, 3);
    expect(px(bed, 'width')).toBeCloseTo(64 * SCALE, 3);
    expect(px(bed, 'height')).toBeCloseTo(85 * SCALE, 3);
    expect(rotation(bed)).toBe(0);
    // The desk (rot 1) is its unturned 55 × 26 box centred on (131, 131.5), turned 90°.
    const desk = itemEl('seed-desk');
    const box = planItemBox(itemFootprint(item('seed-desk') as Item), L);
    expect(px(desk, 'left')).toBeCloseTo(box.left, 3);
    expect(px(desk, 'top')).toBeCloseTo(box.top, 3);
    expect(px(desk, 'width')).toBeCloseTo(55 * SCALE, 3);
    expect(px(desk, 'height')).toBeCloseTo(26 * SCALE, 3);
    expect(rotation(desk)).toBe(90);
    expect(desk.style.transformOrigin).toBe('');
    // Turned about its centre it covers the rectangle the 26 × 55 footprint box covered before.
    expect(px(desk, 'left') + px(desk, 'width') / 2).toBeCloseTo(L.ox + (118 + 13) * SCALE, 3);
    expect(px(desk, 'top') + px(desk, 'height') / 2).toBeCloseTo(L.oy + (104 + 27.5) * SCALE, 3);
  });

  it('draws an item at any angle from its footprint alone', () => {
    vi.mocked(itemFootprint).mockImplementation((i) =>
      i.w === 64 ? { cx: 72, cy: 84, w: 64, d: 85, angle: 30 } : { cx: 20, cy: 150, w: 55, d: 26, angle: 0 });
    render(<PlanView pane={MAIN} />);
    const L = seedLayout();
    const bed = itemEl('seed-bed');
    const box = planItemBox({ cx: 72, cy: 84, w: 64, d: 85, angle: 30 }, L);
    expect(px(bed, 'left')).toBeCloseTo(box.left, 3);
    expect(px(bed, 'top')).toBeCloseTo(box.top, 3);
    expect(px(bed, 'width')).toBeCloseTo(box.width, 3);
    expect(px(bed, 'height')).toBeCloseTo(box.height, 3);
    expect(rotation(bed)).toBe(30);
    // Label sized for the nearest quarter turn (0°): net tilt 30°, i.e. none inside the item.
    const label = labelBoxEl('seed-bed');
    expect(px(label as HTMLElement, 'width')).toBeCloseTo(64 * SCALE, 3);
    expect(px(label as HTMLElement, 'height')).toBeCloseTo(85 * SCALE, 3);
    expect(rotation(label)).toBe(0);
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
    expect(item('seed-desk')).toMatchObject({ x: 130, y: 131.5 });
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
    const L = computePlanLayout(roomBounds(usePlanStore.getState().room), pane);
    const wDim = document.querySelector<HTMLElement>('.plan-dim-w');
    const lDim = document.querySelector<HTMLElement>('.plan-dim-l');
    if (!wDim || !lDim) throw new Error('no dimension lines');
    expect(px(wDim, 'top')).toBeCloseTo(L.oy - off, 3);
    expect(px(wDim, 'left')).toBeCloseTo(L.ox, 3);
    expect(px(wDim, 'width')).toBeCloseTo(144 * L.scale, 3);
    expect(px(lDim, 'left')).toBeCloseTo(L.ox - off, 3);
    expect(px(lDim, 'top')).toBeCloseTo(L.oy, 3);
    expect(px(lDim, 'height')).toBeCloseTo(168 * L.scale, 3);
  });

  it('draws a non-rectangular outline: clipped grid, stroked walls, bounding-box dimensions, no corner marks', () => {
    // An L whose bounding box is x −24…76, y 12…62 (100 × 50 in).
    const outline: Point[] = [
      { x: -24, y: 12 }, { x: 76, y: 12 }, { x: 76, y: 37 }, { x: 26, y: 37 }, { x: 26, y: 62 }, { x: -24, y: 62 },
    ];
    vi.mocked(roomOutline).mockImplementation(() => outline);
    vi.mocked(roomBounds).mockImplementation(() => boundsOf(outline));
    render(<PlanView pane={MAIN} />);
    const L = computePlanLayout(boundsOf(outline), MAIN);
    const expected = outline.map((p) => toPane(p, L));
    expectPointsClose(clipPoints(), expected);
    expectPointsClose(wallPoints(), expected);
    expect(document.querySelectorAll('i.corner')).toHaveLength(0);
    const wDim = document.querySelector<HTMLElement>('.plan-dim-w');
    const lDim = document.querySelector<HTMLElement>('.plan-dim-l');
    if (!wDim || !lDim) throw new Error('no dimension lines');
    const tl = toPane({ x: -24, y: 12 }, L);
    expect(px(wDim, 'left')).toBeCloseTo(tl.x, 3);
    expect(px(wDim, 'top')).toBeCloseTo(tl.y - 30, 3);
    expect(px(wDim, 'width')).toBeCloseTo(100 * L.scale, 3);
    expect(wDim).toHaveTextContent(fmtLen(100, 'ft'));
    expect(px(lDim, 'left')).toBeCloseTo(tl.x - 30, 3);
    expect(px(lDim, 'top')).toBeCloseTo(tl.y, 3);
    expect(px(lDim, 'height')).toBeCloseTo(50 * L.scale, 3);
    expect(lDim).toHaveTextContent(fmtLen(50, 'ft'));
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

  it('clips the room grid to the outline and strokes its walls at the corners of the old room box', () => {
    render(<PlanView pane={MAIN} />);
    const L = seedLayout();
    // The rectangle the room element occupied before: left ox, top oy, 144 × 168 in.
    const rect = [
      { x: L.ox, y: L.oy },
      { x: L.ox + 144 * SCALE, y: L.oy },
      { x: L.ox + 144 * SCALE, y: L.oy + 168 * SCALE },
      { x: L.ox, y: L.oy + 168 * SCALE },
    ];
    expectPointsClose(clipPoints(), rect);
    expectPointsClose(wallPoints(), rect);
    // The grid lines start at the room's origin.
    const [bx, by] = roomEl().style.backgroundPosition.split(' ').map(parseFloat);
    expect(bx).toBeCloseTo(L.ox, 3);
    expect(by).toBeCloseTo(L.oy, 3);
  });

  it('draws the corner marks on the bounding box of a rectangular outline', () => {
    render(<PlanView pane={MAIN} />);
    const L = seedLayout();
    const frame = document.querySelector<HTMLElement>('.blueprint.plan-outline-frame');
    if (!frame) throw new Error('no corner frame');
    expect(px(frame, 'left')).toBeCloseTo(L.ox, 3);
    expect(px(frame, 'top')).toBeCloseTo(L.oy, 3);
    expect(px(frame, 'width')).toBeCloseTo(144 * SCALE, 3);
    expect(px(frame, 'height')).toBeCloseTo(168 * SCALE, 3);
    expect(frame.querySelectorAll(':scope > i.corner')).toHaveLength(4);
    expect(document.querySelectorAll('i.corner')).toHaveLength(4);
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

  it('sizes the label box by labelBox and keeps the label upright on a quarter-turned item', () => {
    const turned = { cx: 72, cy: 84, w: 64, d: 85, angle: 90 };
    vi.mocked(itemFootprint).mockImplementation((i) =>
      i.w === 64 ? turned : { cx: 131, cy: 131.5, w: 55, d: 26, angle: 90 });
    render(<PlanView pane={MAIN} />);
    const lb = labelBox(turned, seedLayout());
    const label = labelBoxEl('seed-bed');
    if (!label) throw new Error('no label box');
    // On screen the turned bed is 85 × 64 in; the label box is that, upright (net 0°).
    expect(px(label, 'width')).toBeCloseTo(85 * SCALE, 3);
    expect(px(label, 'height')).toBeCloseTo(64 * SCALE, 3);
    expect(lb.rotateDeg).toBe(0);
    expect(rotation(itemEl('seed-bed')) + rotation(label)).toBe(0);
    expect(label).toHaveTextContent('Low platform bed, queen');
  });

  it('draws one hairline per part for multi-part kinds and none for a shelf', () => {
    const doc = createInitialDocument();
    const shelf: Item = placedItem({ id: 'shelf-1', kind: 'shelf', name: 'Shelf', price: 100, w: 30, d: 12, h: 70, cx: 15, cy: 156 });
    usePlanStore.getState().reset({ ...doc, items: [...doc.items, shelf] });
    render(<PlanView pane={MAIN} />);
    const parts = partBoxes('seed-bed');
    expect(parts).toHaveLength(4);
    // Bed part 0 is [0,1,.04,1] unrotated.
    expectBoxClose(parts[0], [0, 4, 100, 96]);
    expect(itemEl('shelf-1').querySelectorAll('.plan-part')).toHaveLength(0);
  });

  it('draws part hairlines at their unturned fractions inside the turned item', () => {
    render(<PlanView pane={MAIN} />);
    // Desk part 1 [.02,.06,.06,.94]; the item element itself carries the 90° turn.
    const parts = partBoxes('seed-desk');
    expect(parts).toHaveLength(3);
    expectBoxClose(parts[1], [2, 6, 4, 88]);
    expect(rotation(itemEl('seed-desk'))).toBe(90);
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
    usePlanStore.getState().moveItemTo('seed-desk', 63, 37.5); // onto the bed
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

  it('drags the bed by (+28.095, +56.19) px to centre x 82, y 62.5', () => {
    render(<PlanView pane={MAIN} />);
    fireEvent.pointerDown(itemEl('seed-bed'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 128.095, clientY: 156.19 });
    fireEvent.pointerUp(window);
    expect(item('seed-bed')).toMatchObject({ x: 82, y: 62.5 });
  });

  it('drags the quarter-turned desk by (−28.095, −28.095) px to centre x 121, y 121.5', () => {
    render(<PlanView pane={MAIN} />);
    fireEvent.pointerDown(itemEl('seed-desk'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 100 - 28.095, clientY: 100 - 28.095 });
    fireEvent.pointerUp(window);
    expect(item('seed-desk')).toMatchObject({ x: 121, y: 121.5, angle: 90 });
  });

  it('clamps a drag to the room bounds: the centre stops at x = room width', () => {
    render(<PlanView pane={MAIN} />);
    fireEvent.pointerDown(itemEl('seed-bed'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 5000, clientY: 100 });
    fireEvent.pointerUp(window);
    expect(item('seed-bed')?.x).toBe(144);
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
    const expected = computeClearances(itemFootprint(bed), roomOutline(s.room), seedLayout(), s.units);
    const lines = [...document.querySelectorAll<HTMLElement>('.plan-clearance')];
    expect(lines).toHaveLength(expected.length);
    expect(expected.length).toBe(3); // the back gap is 0 and skipped
    expected.forEach((c, i) => {
      const el = lines[i];
      if (!el) throw new Error(`no clearance line ${i}`);
      // A line from (x1, y1), as long as the gap, turned to point at (x2, y2).
      const deg = (Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180) / Math.PI;
      expect(px(el, 'left')).toBeCloseTo(c.x1, 3);
      expect(px(el, 'top')).toBeCloseTo(c.y1, 3);
      expect(px(el, 'width')).toBeCloseTo(Math.hypot(c.x2 - c.x1, c.y2 - c.y1), 3);
      expect(rotation(el)).toBeCloseTo(deg, 6);
      const chip = el.querySelector('.plan-clearance-chip');
      expect(chip?.textContent).toBe(c.label);
      // The chip turns back so its text stays upright.
      expect(rotation(chip)).toBeCloseTo(-deg, 6);
    });
  });

  it('omits the chip on a clearance line whose showLabel is false', () => {
    usePlanStore.getState().moveItemTo('seed-bed', 42, 42.5); // 10 in left gap → 28 px
    useUiStore.getState().select('seed-bed');
    render(<PlanView pane={MAIN} />);
    const s = usePlanStore.getState();
    const bed = item('seed-bed');
    if (!bed) throw new Error('no bed');
    const expected = computeClearances(itemFootprint(bed), roomOutline(s.room), seedLayout(), s.units);
    expect(expected.some((c) => !c.showLabel)).toBe(true);
    const lines = [...document.querySelectorAll<HTMLElement>('.plan-clearance')];
    expect(lines).toHaveLength(expected.length);
    expected.forEach((c, i) => {
      const chip = lines[i]?.querySelector('.plan-clearance-chip');
      if (c.showLabel) expect(chip?.textContent).toBe(c.label);
      else expect(chip).toBeNull();
    });
  });

  it('runs the clearance lines to the walls of the outline, not of the bounding box', () => {
    // Same bounding box as the seeded room, with the top-right corner cut away to x 120, y 60.
    const outline: Point[] = [
      { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 60 }, { x: 144, y: 60 }, { x: 144, y: 168 }, { x: 0, y: 168 },
    ];
    vi.mocked(roomOutline).mockImplementation(() => outline);
    useUiStore.getState().select('seed-bed');
    render(<PlanView pane={MAIN} />);
    const L = seedLayout();
    const right = [...document.querySelectorAll<HTMLElement>('.plan-clearance')].find(
      (el) => Math.abs(px(el, 'left') - toPane({ x: 104, y: 0 }, L).x) < 1e-3,
    );
    if (!right) throw new Error('no right-hand clearance line');
    // The bed's right side (x 104) faces the cut-out wall at x 120: 16 in, not 40.
    expect(px(right, 'width')).toBeCloseTo(16 * SCALE, 3);
    expect(right.querySelector('.plan-clearance-chip')?.textContent).toBe(fmtLen(16, 'ft'));
  });

  it('draws no clearances when nothing is selected', () => {
    render(<PlanView pane={MAIN} />);
    expect(document.querySelectorAll('.plan-clearance')).toHaveLength(0);
  });

  it('draws no clearances when the selected item is outside the room', () => {
    const { applyOutline, room } = usePlanStore.getState();
    applyOutline(setRectangleSize(room.outline, { w: 90 })); // bed spans x 40–104
    useUiStore.getState().select('seed-bed');
    render(<PlanView pane={MAIN} />);
    expect(document.querySelectorAll('.plan-clearance')).toHaveLength(0);
  });

  it('draws no room edge handles', () => {
    render(<PlanView pane={MAIN} />);
    expect(document.querySelector('[class*="handle"]')).toBeNull();
    expect(screen.queryByTitle('Drag to change width')).toBeNull();
    expect(screen.queryByTitle('Drag to change length')).toBeNull();
  });

  it('re-renders when the store changes', () => {
    render(<PlanView pane={MAIN} />);
    act(() => usePlanStore.getState().moveItemTo('seed-bed', 82, 62.5));
    const L = seedLayout();
    expect(px(itemEl('seed-bed'), 'left')).toBeCloseTo(L.ox + 50 * SCALE, 3);
  });
});

describe('PlanView in room mode', () => {
  const BED_NAME = 'Low platform bed, queen';

  function cornerHandles(): HTMLElement[] {
    return screen.queryAllByRole('button', { name: /^Corner \d+$/ });
  }

  it('renders the room edit layer only in room mode', () => {
    const { unmount } = render(<PlanView pane={MAIN} />);
    expect(cornerHandles()).toHaveLength(0);
    expect(document.querySelectorAll('.room-wall-hit')).toHaveLength(0);
    unmount();
    useUiStore.getState().setMode('room');
    render(<PlanView pane={MAIN} />);
    expect(cornerHandles()).toHaveLength(4);
    expect(document.querySelectorAll('.room-wall-hit')).toHaveLength(4);
  });

  it('switching back to furnish mode removes the layer', () => {
    useUiStore.getState().setMode('room');
    render(<PlanView pane={MAIN} />);
    expect(cornerHandles()).toHaveLength(4);
    act(() => useUiStore.getState().setMode('furnish'));
    expect(cornerHandles()).toHaveLength(0);
  });

  it('furniture is inert, hidden from assistive technology and out of the tab order', () => {
    useUiStore.getState().setMode('room');
    render(<PlanView pane={MAIN} />);
    for (const el of document.querySelectorAll('[data-item-id]')) {
      expect(el).toHaveAttribute('inert');
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el).toHaveAttribute('tabindex', '-1');
    }
    expect(screen.queryByRole('button', { name: BED_NAME })).toBeNull();
  });

  it('furniture in furnish mode is not inert', () => {
    render(<PlanView pane={MAIN} />);
    for (const el of document.querySelectorAll('[data-item-id]')) {
      expect(el).not.toHaveAttribute('inert');
      expect(el).not.toHaveAttribute('aria-hidden');
    }
  });

  it('pointer and key events on furniture do nothing', () => {
    useUiStore.getState().setMode('room');
    render(<PlanView pane={MAIN} />);
    const before = usePlanStore.getState().items;
    const bed = itemEl('seed-bed');
    fireEvent.pointerDown(bed, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 160, clientY: 160 });
    fireEvent.pointerUp(window);
    fireEvent.click(bed);
    fireEvent.keyDown(bed, { key: 'Enter' });
    expect(useUiStore.getState().selectedId).toBeNull();
    expect(usePlanStore.getState().items).toBe(before);
  });

  it('draws no clearance lines, even with an item selected', () => {
    useUiStore.getState().setMode('room');
    useUiStore.getState().select('seed-bed');
    render(<PlanView pane={MAIN} />);
    expect(document.querySelectorAll('.plan-clearance')).toHaveLength(0);
  });

  it('pointer down on the empty plan clears the corner selection', () => {
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectCorner('c2');
    const { container } = render(<PlanView pane={MAIN} />);
    const root = container.firstElementChild;
    if (!root) throw new Error('no root');
    fireEvent.pointerDown(root);
    expect(useUiStore.getState().selectedCornerId).toBeNull();
  });

  it('keeps the layout frozen while a corner is dragged and re-fits the room on pointer up', () => {
    useUiStore.getState().setMode('room');
    render(<PlanView pane={MAIN} />);
    const before = seedLayout();
    const corner2 = (): HTMLElement => screen.getByRole('button', { name: 'Corner 2' });
    // Drag c2 from (144, 0) to (200, 0), without angle snapping: the bounding box grows to 200 in.
    fireEvent.pointerDown(corner2(), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 100 + 56 * SCALE, clientY: 100, altKey: true });
    const moved = usePlanStore.getState().room.outline;
    expect(moved[1]).toEqual({ id: 'c2', x: 200, y: 0 });
    const refit = computePlanLayout(roomBounds(usePlanStore.getState().room), MAIN);
    expect(refit.scale).not.toBeCloseTo(before.scale, 3);
    // Mid-drag the handle, the walls and the furniture still use the layout from pointer down.
    expect(px(corner2(), 'left')).toBeCloseTo(toPane({ x: 200, y: 0 }, before).x, 3);
    expectPointsClose(wallPoints(), moved.map((p) => toPane(p, before)));
    expect(px(itemEl('seed-bed'), 'left')).toBeCloseTo(before.ox + 40 * before.scale, 3);
    fireEvent.pointerUp(window);
    expect(px(corner2(), 'left')).toBeCloseTo(toPane({ x: 200, y: 0 }, refit).x, 3);
    expectPointsClose(wallPoints(), moved.map((p) => toPane(p, refit)));
  });

  it('a corner drag still under way when room mode ends edits nothing more and releases the layout', () => {
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
    try {
      useUiStore.getState().setMode('room');
      render(<PlanView pane={MAIN} />);
      const before = seedLayout();
      const corner2 = (): HTMLElement => screen.getByRole('button', { name: 'Corner 2' });
      // Drag c2 from (144, 0) to (200, 0), without angle snapping, then leave room mode mid-drag.
      fireEvent.pointerDown(corner2(), { clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 100 + 56 * SCALE, clientY: 100, altKey: true });
      const moved = usePlanStore.getState().room;
      expect(moved.outline[1]).toEqual({ id: 'c2', x: 200, y: 0 });
      act(() => useUiStore.getState().setMode('furnish'));
      // The Alt listener (the capture-phase pointermove listener) is gone before the pointer is released.
      const alt = added.find(([type, , opts]) => type === 'pointermove' && opts === true);
      if (!alt) throw new Error('no Alt listener was added');
      expect(removed).toContainEqual([alt[0], alt[1]]);
      // The layout is no longer frozen: the furniture is placed by the re-fitted layout.
      const refit = computePlanLayout(roomBounds(moved), MAIN);
      expect(refit.scale).not.toBeCloseTo(before.scale, 3);
      expect(px(itemEl('seed-bed'), 'left')).toBeCloseTo(refit.ox + 40 * refit.scale, 3);
      // A valid target and a refused one (walls would cross): neither edits the outline or sets a problem.
      fireEvent.pointerMove(window, { clientX: 100 + 16 * SCALE, clientY: 100 - 10 * SCALE, altKey: true });
      expect(usePlanStore.getState().room).toBe(moved);
      fireEvent.pointerMove(window, { clientX: 100 - 194 * SCALE, clientY: 100 + 84 * SCALE, altKey: true });
      expect(usePlanStore.getState().room).toBe(moved);
      expect(useUiStore.getState().roomProblem).toBeNull();
      expect(() => fireEvent.pointerUp(window)).not.toThrow();
      expect(usePlanStore.getState().room).toBe(moved);
      // Back in room mode the handles use the re-fitted layout, and a new drag works.
      act(() => useUiStore.getState().setMode('room'));
      expect(px(corner2(), 'left')).toBeCloseTo(toPane({ x: 200, y: 0 }, refit).x, 3);
      fireEvent.pointerDown(corner2(), { clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 100 + 10 * refit.scale, clientY: 100, altKey: true });
      expect(usePlanStore.getState().room.outline[1]).toEqual({ id: 'c2', x: 210, y: 0 });
      fireEvent.pointerUp(window);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('PlanView doors, windows and obstacles', () => {
  /** Door D1 of the brief: on the top wall c1, 20 in from (0, 0), 32 in wide; the seed bed is in its swing. */
  const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
  /** On the right wall beside the seed desk; its 24 in sill is below the desk's 30 in top. */
  const W1: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 24, height: 48 };
  const BOX: Obstacle = { id: 'o1', shape: 'box', label: 'Radiator', x: 30, y: 140, rotation: 0, width: 30, depth: 8, height: 30, elevation: 0 };
  const COLUMN: Obstacle = { id: 'o2', shape: 'cylinder', label: 'Column', x: 100, y: 100, rotation: 0, width: 12, depth: 12, height: 96, elevation: 0 };

  function withFeatures(openings: Opening[], obstacles: Obstacle[] = [BOX, COLUMN]): PlanDocument {
    return { ...createInitialDocument(), openings, obstacles };
  }

  function before(a: Element | null, b: Element | null): boolean {
    if (!a || !b) throw new Error('missing element');
    return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }

  it.each(['furnish', 'room'] as const)('draws the openings and obstacles in %s mode', (mode) => {
    usePlanStore.getState().reset(withFeatures([D1, W1]));
    useUiStore.getState().setMode(mode);
    render(<PlanView pane={MAIN} />);
    const L = seedLayout();
    const svg = document.querySelector('svg.plan-features');
    expect(svg?.querySelectorAll('[data-opening-id="d1"]')).toHaveLength(3);
    expect(svg?.querySelectorAll('line.plan-window[data-opening-id="w1"]')).toHaveLength(2);
    const arc = svg?.querySelector('path.plan-door-arc');
    expect(arc?.getAttribute('d')).toBe(doorDrawing(D1, usePlanStore.getState().room.outline, L)?.arc);
    expect(document.querySelectorAll('div.plan-obstacle')).toHaveLength(2);
    // None is focusable or exposed; the sidebar lists them.
    for (const el of document.querySelectorAll('svg.plan-features, [data-opening-id], [data-obstacle-id]')) {
      expect(el).not.toHaveAttribute('tabindex');
    }
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    // The furniture count is unaffected: the drawings use other data attributes.
    expect(document.querySelectorAll('[data-item-id]')).toHaveLength(2);
  });

  it('stacks room, walls, openings, obstacles, furniture and clearance lines in that order', () => {
    usePlanStore.getState().reset(withFeatures([D1, W1]));
    useUiStore.getState().select('seed-desk');
    render(<PlanView pane={MAIN} />);
    const room = document.querySelector('.plan-room');
    const walls = document.querySelector('svg.plan-outline');
    const openings = document.querySelector('svg.plan-features');
    const obstacle = document.querySelector('.plan-obstacle');
    const furniture = document.querySelector('[data-item-id]');
    const clearance = document.querySelector('.plan-clearance');
    expect(before(room, walls)).toBe(true);
    expect(before(walls, openings)).toBe(true);
    expect(before(openings, obstacle)).toBe(true);
    expect(before(obstacle, furniture)).toBe(true);
    expect(before(furniture, clearance)).toBe(true);
    // No inline z-index: they paint in document order below the furniture (z-index 1 to 4).
    for (const el of [openings, ...document.querySelectorAll('.plan-obstacle')]) {
      expect((el as HTMLElement | SVGElement | null)?.style.zIndex).toBe('');
    }
  });

  it('puts the room edit layer above the drawings in room mode', () => {
    usePlanStore.getState().reset(withFeatures([D1, W1]));
    useUiStore.getState().setMode('room');
    render(<PlanView pane={MAIN} />);
    const items = document.querySelectorAll('[data-item-id]');
    expect(before(document.querySelector('.plan-obstacle'), items[items.length - 1] ?? null)).toBe(true);
    expect(before(items[items.length - 1] ?? null, document.querySelector('.room-wall-hit'))).toBe(true);
  });

  it('marks an item with a warning and no conflict is-warning, and a conflicting item is-conflict only', () => {
    usePlanStore.getState().reset(withFeatures([D1, W1], []));
    render(<PlanView pane={MAIN} />);
    // The desk covers W1 (sill 24 < its 30 in top); the bed is in D1's swing.
    expect(itemEl('seed-desk')).toHaveClass('is-warning');
    expect(itemEl('seed-desk')).not.toHaveClass('is-conflict');
    expect(itemEl('seed-bed')).toHaveClass('is-conflict');
    expect(itemEl('seed-bed')).not.toHaveClass('is-warning');
  });

  it('an item with both a warning and a conflict has is-conflict only', () => {
    // On the right wall: a window over the desk's upper half and a door swinging into its lower half.
    const win: WindowOpening = { ...W1, offset: 104, width: 24 };
    const door: Door = { ...D1, id: 'd2', wallId: 'c2', offset: 130, width: 28 };
    const doc = withFeatures([win, door], []);
    usePlanStore.getState().reset(doc);
    const issues = findPlanIssues(doc.items, doc.room, doc.openings, doc.obstacles);
    expect(issues.warnings['seed-desk']).toBe(COVERS_A_WINDOW);
    expect(issues.conflicts['seed-desk']).toBe(BLOCKS_A_DOOR);
    render(<PlanView pane={MAIN} />);
    expect(itemEl('seed-desk')).toHaveClass('is-conflict');
    expect(itemEl('seed-desk')).not.toHaveClass('is-warning');
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
