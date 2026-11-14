import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import { findConflicts } from '../domain/conflicts';
import { setRectangleSize, startingShape } from '../domain/outline';
import { boundsOf, pointInPolygon } from '../domain/polygon';
import { footprintCorners, itemFootprint } from '../domain/shape';
import type { Corner, Item, PlanDocument, ProductPreview } from '../domain/types';
import { nudgeSelected, placePreview, removeSelected, rotateSelected } from './actions';
import { usePlanStore } from './planStore';
import { totalPrice, useConflicts, useSelectedItem } from './selectors';
import { type UiState, useUiStore } from './uiStore';

// Captured before any test (or reset) runs, so the "fresh store" rows check real initial state.
const freshPlan = usePlanStore.getState();
const freshUi = useUiStore.getState();

const SOFA: ProductPreview = {
  kind: 'sofa',
  name: 'Alder 3-seat sofa',
  host: 'shop.example',
  sourceUrl: 'https://shop.example/living/alder-3-seat-sofa',
  price: 1299,
  w: 84,
  d: 36,
  h: 33,
  known: true,
  model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
};

function docOf(state: PlanDocument): PlanDocument {
  return { schemaVersion: state.schemaVersion, units: state.units, room: state.room, items: state.items };
}

function req<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`expected ${what}`);
  return value;
}

/** The seed room as an L-shape: the top-right 72 × 84 in is cut away. */
function lShape(): Corner[] {
  let n = 0;
  return startingShape('l-shape', 144, 168, () => `l${++n}`);
}

function itemById(id: string): Item {
  const item = usePlanStore.getState().items.find((i) => i.id === id);
  if (!item) throw new Error(`expected item ${id}`);
  return item;
}

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

describe('planStore', () => {
  it('starts as the seeded initial document', () => {
    expect(docOf(freshPlan)).toEqual(createInitialDocument());
  });

  it('reset restores the initial document, or the given one', () => {
    usePlanStore.getState().removeItem('seed-bed');
    usePlanStore.getState().reset();
    expect(docOf(usePlanStore.getState())).toEqual(createInitialDocument());

    const custom: PlanDocument = { ...createInitialDocument(), units: 'm', items: [] };
    usePlanStore.getState().reset(custom);
    expect(docOf(usePlanStore.getState())).toEqual(custom);
  });

  it('setUnits changes units only, leaving room and items untouched', () => {
    const before = usePlanStore.getState();
    before.setUnits('m');
    const after = usePlanStore.getState();
    expect(after.units).toBe('m');
    expect(after.room).toEqual(before.room);
    expect(after.items).toEqual(before.items);
  });

  it('setRoomHeight sets the ceiling height and keeps the outline and items', () => {
    const before = usePlanStore.getState();
    usePlanStore.getState().setRoomHeight(108);
    const after = usePlanStore.getState();
    expect(after.room.height).toBe(108);
    expect(after.room.outline).toBe(before.room.outline);
    expect(after.items).toBe(before.items);
  });

  it('setRoomHeight to the current value keeps the same room and notifies no one', () => {
    const before = usePlanStore.getState().room;
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    usePlanStore.getState().setRoomHeight(before.height);
    unsubscribe();
    expect(usePlanStore.getState().room).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    usePlanStore.getState().setRoomHeight(before.height + 12);
    expect(usePlanStore.getState().room).not.toBe(before);
  });

  it('applyOutline stores an accepted outline without moving items and returns true', () => {
    const before = usePlanStore.getState();
    const outline = lShape();
    expect(usePlanStore.getState().applyOutline({ ok: true, outline })).toBe(true);
    const after = usePlanStore.getState();
    expect(after.room).toEqual({ outline, height: 96 });
    expect(after.items).toBe(before.items);
  });

  it('applyOutline writes through setRectangleSize', () => {
    const { room } = usePlanStore.getState();
    expect(usePlanStore.getState().applyOutline(setRectangleSize(room.outline, { w: 120 }))).toBe(true);
    expect(usePlanStore.getState().room.outline).toEqual([
      { id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 120, y: 0 }, { id: 'c3', x: 120, y: 168 }, { id: 'c4', x: 0, y: 168 },
    ]);
  });

  it('applyOutline with the stored corners returns true, keeps the same state and notifies no one', () => {
    const before = usePlanStore.getState();
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    const applied = usePlanStore.getState().applyOutline({ ok: true, outline: structuredClone(before.room.outline) });
    unsubscribe();
    expect(applied).toBe(true);
    expect(usePlanStore.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('applyOutline stores corners that differ only in an id or in order', () => {
    const renamed = usePlanStore.getState().room.outline.map((c, i) => (i === 0 ? { ...c, id: 'c9' } : c));
    usePlanStore.getState().applyOutline({ ok: true, outline: renamed });
    expect(usePlanStore.getState().room.outline).toBe(renamed);
    const [first, ...rest] = renamed;
    const rotated = [...rest, first];
    usePlanStore.getState().applyOutline({ ok: true, outline: rotated });
    expect(usePlanStore.getState().room.outline).toBe(rotated);
  });

  it('applyOutline refused changes nothing, notifies no one and returns false', () => {
    const before = usePlanStore.getState();
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    const applied = usePlanStore.getState().applyOutline({ ok: false, problem: 'crossing' });
    unsubscribe();
    expect(applied).toBe(false);
    expect(usePlanStore.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('addItem appends the preview centred, unrotated, with a new id and copied source and model', () => {
    const id = usePlanStore.getState().addItem(SOFA);
    const { items } = usePlanStore.getState();
    expect(items).toHaveLength(3);
    const added = req(items[2], 'added item');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(added.id).toBe(id);
    expect(['seed-bed', 'seed-desk']).not.toContain(id);
    expect(added).toMatchObject({
      kind: 'sofa', name: SOFA.name, host: SOFA.host, price: 1299, w: 84, d: 36, h: 33, angle: 0,
      sourceUrl: SOFA.sourceUrl, model: SOFA.model,
    });
    // Centred on interiorPoint(outline), the seed room's centre; 84 × 36 keeps it on the grid.
    expect(added).toMatchObject({ x: 72, y: 84 });
    expect(added.model).not.toBe(SOFA.model);
  });

  it('addItem with an odd width and depth puts the footprint min corner on the 1 in grid', () => {
    const id = usePlanStore.getState().addItem({ ...SOFA, w: 55, d: 27 });
    const added = itemById(id);
    expect(added).toMatchObject({ x: 72.5, y: 84.5, angle: 0 });
    expect(added.x - added.w / 2).toBe(45);
    expect(added.y - added.d / 2).toBe(71);
  });

  it('addItem in an L-shaped room centres the item inside the outline', () => {
    const outline = lShape();
    usePlanStore.getState().applyOutline({ ok: true, outline });
    const id = usePlanStore.getState().addItem(SOFA);
    const added = itemById(id);
    expect(added.angle).toBe(0);
    expect(Number.isInteger(added.x - added.w / 2) && Number.isInteger(added.y - added.d / 2)).toBe(true);
    expect(pointInPolygon({ x: added.x, y: added.y }, outline, 0)).toBe(true);
  });

  it('addItem gives each added item a different id', () => {
    const a = usePlanStore.getState().addItem(SOFA);
    const b = usePlanStore.getState().addItem(SOFA);
    expect(a).not.toBe(b);
  });

  it('moveItemTo moves the centre, with the footprint bounding box min corner snapped to 1 in', () => {
    usePlanStore.getState().moveItemTo('seed-bed', 80.4, 50.6);
    expect(itemById('seed-bed')).toMatchObject({ x: 80, y: 50.5, angle: 0 });
  });

  it('moveItemTo along the back wall keeps the seed bed flush with it and conflict-free', () => {
    usePlanStore.getState().moveItemTo('seed-bed', 60.4, 42.8);
    const bed = itemById('seed-bed');
    expect(bed).toMatchObject({ x: 60, y: 42.5 });
    expect(boundsOf(footprintCorners(itemFootprint(bed))).minY).toBeCloseTo(0, 10);
    const { items, room } = usePlanStore.getState();
    expect(findConflicts(items, room)).toEqual({});
  });

  it('moveItemTo keeps the centre inside the room bounds', () => {
    usePlanStore.getState().moveItemTo('seed-bed', -50, 900);
    expect(itemById('seed-bed')).toMatchObject({ x: 0, y: 168 });
  });

  it('moveItemTo to where the item already lands keeps the same items and notifies no one', () => {
    const before = usePlanStore.getState().items;
    const bed = itemById('seed-bed');
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    usePlanStore.getState().moveItemTo('seed-bed', bed.x, bed.y);
    // Snaps back to the same spot: less than half a snap step away.
    usePlanStore.getState().moveItemTo('seed-bed', bed.x + 0.2, bed.y - 0.2);
    unsubscribe();
    expect(usePlanStore.getState().items).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    usePlanStore.getState().moveItemTo('seed-bed', 200, -3);
    expect(usePlanStore.getState().items).not.toBe(before);
  });

  it('moveItemTo with an unknown id leaves state unchanged and does not throw', () => {
    const before = usePlanStore.getState();
    expect(() => before.moveItemTo('nope', 10, 10)).not.toThrow();
    const after = usePlanStore.getState();
    expect(after.items).toBe(before.items);
    expect(docOf(after)).toEqual(docOf(before));
  });

  it('rotateItemBy turns the item about its centre', () => {
    usePlanStore.getState().rotateItemBy('seed-desk', 90);
    expect(itemById('seed-desk')).toMatchObject({ angle: 180, x: 131, y: 131.5 });
  });

  it('rotateItemBy wraps the angle into [0, 360)', () => {
    usePlanStore.getState().setItemAngle('seed-desk', 350);
    usePlanStore.getState().rotateItemBy('seed-desk', 15);
    expect(itemById('seed-desk').angle).toBe(5);
  });

  it('setItemAngle stores the normalised angle and keeps the position', () => {
    usePlanStore.getState().setItemAngle('seed-desk', -30);
    expect(itemById('seed-desk')).toMatchObject({ angle: 330, x: 131, y: 131.5 });
  });

  it('setItemAngle to the current angle keeps the same items and notifies no one', () => {
    const before = usePlanStore.getState().items;
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    usePlanStore.getState().setItemAngle('seed-desk', 90);
    usePlanStore.getState().setItemAngle('seed-desk', 450);
    usePlanStore.getState().rotateItemBy('seed-desk', 0);
    unsubscribe();
    expect(usePlanStore.getState().items).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('rotateItemBy and setItemAngle with an unknown id leave state unchanged', () => {
    const before = usePlanStore.getState();
    usePlanStore.getState().rotateItemBy('nope', 90);
    usePlanStore.getState().setItemAngle('nope', 45);
    expect(usePlanStore.getState()).toBe(before);
  });

  it('moveItemBy moves the centre by exactly (dx, dy), without snapping to the grid', () => {
    usePlanStore.getState().rotateItemBy('seed-desk', 90); // angle 180: bounding box min corner off the grid
    usePlanStore.getState().moveItemBy('seed-desk', 1, 0);
    expect(itemById('seed-desk')).toMatchObject({ x: 132, y: 131.5, angle: 180 });
    usePlanStore.getState().moveItemBy('seed-desk', -1, 0);
    expect(itemById('seed-desk')).toMatchObject({ x: 131, y: 131.5 });
    usePlanStore.getState().moveItemBy('seed-desk', 0, 12);
    expect(itemById('seed-desk')).toMatchObject({ x: 131, y: 143.5 });
  });

  it('moveItemBy keeps the centre inside the room bounds', () => {
    usePlanStore.getState().moveItemBy('seed-bed', 71.6, 0);
    expect(itemById('seed-bed').x).toBe(143.6);
    usePlanStore.getState().moveItemBy('seed-bed', 1, 0);
    expect(itemById('seed-bed').x).toBe(144);
  });

  it('moveItemBy that changes nothing, or with an unknown id, keeps the same state and notifies no one', () => {
    usePlanStore.getState().moveItemBy('seed-bed', 100, 0); // centre clamped to x 144
    const before = usePlanStore.getState();
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    usePlanStore.getState().moveItemBy('seed-bed', 0, 0);
    usePlanStore.getState().moveItemBy('seed-bed', 5, 0); // already at the bounding box edge
    usePlanStore.getState().moveItemBy('nope', 5, 5);
    unsubscribe();
    expect(usePlanStore.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores a number that is not finite, so no NaN is ever stored', () => {
    const before = usePlanStore.getState();
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      usePlanStore.getState().setItemAngle('seed-desk', bad);
      usePlanStore.getState().rotateItemBy('seed-desk', bad);
      usePlanStore.getState().moveItemTo('seed-bed', bad, 10);
      usePlanStore.getState().moveItemTo('seed-bed', 10, bad);
      usePlanStore.getState().moveItemBy('seed-bed', bad, 1);
      usePlanStore.getState().moveItemBy('seed-bed', 1, bad);
      usePlanStore.getState().setRoomHeight(bad);
    }
    unsubscribe();
    expect(usePlanStore.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('removeItem drops the item', () => {
    usePlanStore.getState().removeItem('seed-bed');
    const { items } = usePlanStore.getState();
    expect(items).toHaveLength(1);
    expect(items.map((i) => i.id)).toEqual(['seed-desk']);
  });
});

describe('uiStore', () => {
  it('starts with the documented defaults', () => {
    expect(freshUi).toMatchObject({
      selectedId: null,
      layout: 'inset',
      insetSwapped: false,
      tab: '2d',
      renderStyle: 'realistic',
      camera: CONFIG.camera,
      webglAvailable: true,
      lookup: { status: 'idle' },
    });
  });

  it('updatePreviewDim changes the preview dimension while in preview', () => {
    useUiStore.getState().setLookup({ status: 'preview', product: SOFA });
    useUiStore.getState().updatePreviewDim('w', 90);
    const { lookup } = useUiStore.getState();
    expect(lookup).toEqual({ status: 'preview', product: { ...SOFA, w: 90 } });
    expect(SOFA.w).toBe(84);
  });

  it('updatePreviewDim is a no-op when not in preview', () => {
    useUiStore.getState().setLookup({ status: 'loading', host: 'shop.example' });
    const before = useUiStore.getState().lookup;
    useUiStore.getState().updatePreviewDim('w', 90);
    expect(useUiStore.getState().lookup).toBe(before);
  });

  it('markWebglUnavailable disables WebGL and falls back to blueprint', () => {
    useUiStore.getState().markWebglUnavailable();
    expect(useUiStore.getState()).toMatchObject({ webglAvailable: false, renderStyle: 'blueprint' });
  });

  it('setRenderStyle cannot choose realistic while WebGL is unavailable', () => {
    useUiStore.getState().markWebglUnavailable();
    useUiStore.getState().setRenderStyle('realistic');
    expect(useUiStore.getState().renderStyle).toBe('blueprint');
  });

  it('setRenderStyle switches style while WebGL is available', () => {
    useUiStore.getState().setRenderStyle('blueprint');
    expect(useUiStore.getState().renderStyle).toBe('blueprint');
    useUiStore.getState().setRenderStyle('realistic');
    expect(useUiStore.getState().renderStyle).toBe('realistic');
  });

  it('simple setters update their field', () => {
    const ui = useUiStore.getState();
    ui.select('seed-bed');
    ui.setLayout('split');
    ui.toggleInsetSwap();
    ui.setTab('3d');
    ui.setCamera({ yaw: 1, pitch: 0.5, zoom: 2 });
    expect(useUiStore.getState()).toMatchObject({
      selectedId: 'seed-bed', layout: 'split', insetSwapped: true, tab: '3d',
      camera: { yaw: 1, pitch: 0.5, zoom: 2 },
    });
    useUiStore.getState().toggleInsetSwap();
    expect(useUiStore.getState().insetSwapped).toBe(false);
  });

  it('starts in furnish mode with no corner, problem, notice or save block', () => {
    expect(freshUi).toMatchObject({
      mode: 'furnish',
      selectedCornerId: null,
      roomProblem: null,
      notice: null,
      saveBlocked: false,
    });
  });

  it('setMode room enters room mode and clears the item selection', () => {
    useUiStore.getState().select('seed-bed');
    useUiStore.getState().setMode('room');
    expect(useUiStore.getState()).toMatchObject({ mode: 'room', selectedId: null });
  });

  it('setMode room clears the item selection even when already in room mode', () => {
    useUiStore.getState().setMode('room');
    useUiStore.getState().select('seed-bed');
    useUiStore.getState().setMode('room');
    expect(useUiStore.getState()).toMatchObject({ mode: 'room', selectedId: null });
  });

  it('setMode furnish clears the selected corner and the room problem', () => {
    const ui = useUiStore.getState();
    ui.setMode('room');
    ui.selectCorner('c2');
    ui.setRoomProblem('Walls cross');
    useUiStore.getState().setMode('furnish');
    expect(useUiStore.getState()).toMatchObject({
      mode: 'furnish', selectedCornerId: null, roomProblem: null,
    });
  });

  it('setMode furnish clears the corner and problem even when already in furnish mode', () => {
    const ui = useUiStore.getState();
    ui.selectCorner('c2');
    ui.setRoomProblem('Walls cross');
    useUiStore.getState().setMode('furnish');
    expect(useUiStore.getState()).toMatchObject({
      mode: 'furnish', selectedCornerId: null, roomProblem: null,
    });
  });

  it('room-editing setters each set their field and nothing else', () => {
    const cases: [() => void, Partial<UiState>][] = [
      [() => useUiStore.getState().selectCorner('c2'), { selectedCornerId: 'c2' }],
      [() => useUiStore.getState().setRoomProblem('x'), { roomProblem: 'x' }],
      [() => useUiStore.getState().setNotice('y'), { notice: 'y' }],
      [() => useUiStore.getState().setSaveBlocked(true), { saveBlocked: true }],
      [() => useUiStore.getState().selectCorner(null), { selectedCornerId: null }],
    ];
    for (const [apply, change] of cases) {
      // Start from non-default values so a setter that clears another field is caught.
      const ui = useUiStore.getState();
      ui.reset();
      ui.select('seed-bed');
      ui.selectCorner('c1');
      ui.setRoomProblem('p');
      ui.setNotice('n');
      const before = useUiStore.getState();
      apply();
      expect(useUiStore.getState()).toEqual({ ...before, ...change });
    }
  });

  it('reset restores furnish mode and clears the room-editing fields', () => {
    const ui = useUiStore.getState();
    ui.setMode('room');
    ui.selectCorner('c2');
    ui.setRoomProblem('x');
    ui.setNotice('y');
    ui.setSaveBlocked(true);
    useUiStore.getState().reset();
    expect(useUiStore.getState()).toMatchObject({
      mode: 'furnish',
      selectedCornerId: null,
      roomProblem: null,
      notice: null,
      saveBlocked: false,
    });
  });
});

describe('actions', () => {
  it('rotateSelected and removeSelected do nothing when nothing is selected', () => {
    const before = usePlanStore.getState();
    rotateSelected();
    removeSelected();
    expect(usePlanStore.getState().items).toBe(before.items);
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('rotateSelected turns the selected item 90 degrees, or by the given degrees', () => {
    useUiStore.getState().select('seed-desk');
    rotateSelected();
    expect(itemById('seed-desk')).toMatchObject({ angle: 180, x: 131, y: 131.5 });
    rotateSelected(15);
    expect(itemById('seed-desk')).toMatchObject({ angle: 195, x: 131, y: 131.5 });
  });

  it('removeSelected removes the selected item and clears the selection', () => {
    useUiStore.getState().select('seed-desk');
    removeSelected();
    expect(usePlanStore.getState().items.map((i) => i.id)).toEqual(['seed-bed']);
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('placePreview adds the preview, selects it and returns lookup to idle', () => {
    useUiStore.getState().setLookup({ status: 'preview', product: SOFA });
    placePreview();
    const { items } = usePlanStore.getState();
    expect(items).toHaveLength(3);
    const added = req(items[2], 'placed item');
    expect(added).toMatchObject({ kind: 'sofa', name: SOFA.name, sourceUrl: SOFA.sourceUrl });
    expect(useUiStore.getState().selectedId).toBe(added.id);
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });
  });

  it('placePreview does nothing when not in preview', () => {
    const before = usePlanStore.getState();
    placePreview();
    expect(usePlanStore.getState().items).toBe(before.items);
    expect(useUiStore.getState().selectedId).toBeNull();
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });
  });

  it('nudgeSelected moves the centre of the selected item by exactly dx, dy inches', () => {
    useUiStore.getState().select('seed-bed');
    nudgeSelected(1, 0);
    expect(itemById('seed-bed')).toMatchObject({ x: 73, y: 42.5 });
    nudgeSelected(0, 12);
    expect(itemById('seed-bed')).toMatchObject({ x: 73, y: 54.5 });
  });

  it('nudgeSelected moves a turned item by exactly the step, without re-snapping', () => {
    useUiStore.getState().select('seed-desk');
    rotateSelected(); // angle 180: half-extents 27.5, 13
    nudgeSelected(1, 0);
    expect(itemById('seed-desk')).toMatchObject({ x: 132, y: 131.5, angle: 180 });
    nudgeSelected(-1, 0);
    expect(itemById('seed-desk')).toMatchObject({ x: 131, y: 131.5 });
    nudgeSelected(0, 12);
    expect(itemById('seed-desk')).toMatchObject({ x: 131, y: 143.5 });
  });

  it('nudgeSelected sideways keeps the seed bed flush with the back wall', () => {
    useUiStore.getState().select('seed-bed');
    nudgeSelected(-1, 0);
    nudgeSelected(-12, 0);
    expect(itemById('seed-bed')).toMatchObject({ x: 59, y: 42.5 });
  });

  it('nudgeSelected at the bounding box edge clamps the centre', () => {
    useUiStore.getState().select('seed-bed');
    nudgeSelected(71.6, 0);
    expect(itemById('seed-bed').x).toBe(143.6);
    nudgeSelected(1, 0);
    expect(itemById('seed-bed').x).toBe(144);
  });

  it('nudgeSelected keeps the centre inside the room bounds', () => {
    useUiStore.getState().select('seed-bed');
    nudgeSelected(0, -500);
    expect(itemById('seed-bed').y).toBe(0);
    nudgeSelected(500, 0);
    expect(itemById('seed-bed').x).toBe(144);
  });

  it('nudgeSelected does nothing when nothing is selected', () => {
    const before = usePlanStore.getState();
    nudgeSelected(5, 5);
    expect(usePlanStore.getState().items).toBe(before.items);
  });
});

describe('selectors', () => {
  it('totalPrice sums seed item prices', () => {
    expect(totalPrice(createInitialDocument().items)).toBe(1310);
  });

  it('totalPrice counts a null price as 0', () => {
    const [bed, desk] = createInitialDocument().items;
    expect(totalPrice([req(bed, 'bed'), { ...req(desk, 'desk'), price: null }])).toBe(890);
  });

  it('useConflicts returns the same object while items and room are unchanged', () => {
    const { result, rerender } = renderHook(() => useConflicts());
    const first = result.current;
    expect(first).toEqual({});
    rerender();
    expect(result.current).toBe(first);
  });

  it('useConflicts recomputes when items change', () => {
    const { result, rerender } = renderHook(() => useConflicts());
    const first = result.current;
    act(() => {
      const { applyOutline, room } = usePlanStore.getState();
      applyOutline(setRectangleSize(room.outline, { w: 60 }));
    });
    rerender();
    expect(result.current).not.toBe(first);
    expect(Object.keys(result.current)).toEqual(['seed-bed', 'seed-desk']);
  });

  it('useSelectedItem returns the selected item, or null', () => {
    const { result, rerender } = renderHook(() => useSelectedItem());
    expect(result.current).toBeNull();
    act(() => useUiStore.getState().select('seed-desk'));
    rerender();
    expect(result.current).toBe(itemById('seed-desk'));
  });
});
