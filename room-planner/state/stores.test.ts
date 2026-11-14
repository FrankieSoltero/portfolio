import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import { centrePosition } from '../domain/geometry';
import type { Item, PlanDocument, ProductPreview } from '../domain/types';
import { nudgeSelected, placePreview, removeSelected, rotateSelected } from './actions';
import { usePlanStore } from './planStore';
import { totalPrice, useConflicts, useSelectedItem } from './selectors';
import { useUiStore } from './uiStore';

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

  it('setRoomDim sets the axis without re-clamping items', () => {
    const itemsBefore = usePlanStore.getState().items;
    usePlanStore.getState().setRoomDim('w', 120);
    const after = usePlanStore.getState();
    expect(after.room).toEqual({ w: 120, l: 168, h: 96 });
    expect(after.items).toEqual(itemsBefore);
  });

  it('setRoomDim to the current value keeps the same room and notifies no one', () => {
    const before = usePlanStore.getState().room;
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    usePlanStore.getState().setRoomDim('w', before.w);
    unsubscribe();
    expect(usePlanStore.getState().room).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    usePlanStore.getState().setRoomDim('w', before.w + 12);
    expect(usePlanStore.getState().room).not.toBe(before);
  });

  it('addItem appends the preview centred, unrotated, with a new id and copied source and model', () => {
    const id = usePlanStore.getState().addItem(SOFA);
    const { items, room } = usePlanStore.getState();
    expect(items).toHaveLength(3);
    const added = req(items[2], 'added item');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(added.id).toBe(id);
    expect(['seed-bed', 'seed-desk']).not.toContain(id);
    expect(added).toMatchObject({
      kind: 'sofa', name: SOFA.name, host: SOFA.host, price: 1299, w: 84, d: 36, h: 33, rot: 0,
      sourceUrl: SOFA.sourceUrl, model: SOFA.model,
      ...centrePosition(SOFA, room, CONFIG.furnitureSnap),
    });
    expect(added).toMatchObject({ x: 30, y: 66 });
  });

  it('addItem gives each added item a different id', () => {
    const a = usePlanStore.getState().addItem(SOFA);
    const b = usePlanStore.getState().addItem(SOFA);
    expect(a).not.toBe(b);
  });

  it('moveItemTo snaps and clamps the item inside the room', () => {
    usePlanStore.getState().moveItemTo('seed-bed', 200, -3);
    expect(itemById('seed-bed')).toMatchObject({ x: 80, y: 0 });
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

  it('rotateItem turns the item a quarter turn about its centre', () => {
    usePlanStore.getState().rotateItem('seed-desk');
    expect(itemById('seed-desk')).toMatchObject({ rot: 2, x: 89, y: 119 });
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
});

describe('actions', () => {
  it('rotateSelected and removeSelected do nothing when nothing is selected', () => {
    const before = usePlanStore.getState();
    rotateSelected();
    removeSelected();
    expect(usePlanStore.getState().items).toBe(before.items);
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('rotateSelected rotates the selected item', () => {
    useUiStore.getState().select('seed-desk');
    rotateSelected();
    expect(itemById('seed-desk')).toMatchObject({ rot: 2, x: 89, y: 119 });
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

  it('nudgeSelected moves the selected item by exactly dx, dy inches', () => {
    useUiStore.getState().select('seed-bed');
    nudgeSelected(1, 0);
    expect(itemById('seed-bed')).toMatchObject({ x: 41, y: 0 });
    nudgeSelected(0, 12);
    expect(itemById('seed-bed')).toMatchObject({ x: 41, y: 12 });
  });

  it('nudgeSelected clamps the item to the room', () => {
    useUiStore.getState().select('seed-bed');
    nudgeSelected(0, -5);
    expect(itemById('seed-bed').y).toBe(0);
    nudgeSelected(500, 0);
    expect(itemById('seed-bed').x).toBe(80);
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
    act(() => usePlanStore.getState().setRoomDim('w', 60));
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
