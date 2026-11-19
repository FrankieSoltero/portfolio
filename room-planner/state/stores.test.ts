import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import { findConflicts, findPlanIssues } from '../domain/conflicts';
import { addObstacle, newObstacle, OBSTACLE_PROBLEM_TEXT } from '../domain/obstacles';
import { addOpening, OPENING_PROBLEM_TEXT } from '../domain/openings';
import {
  insertCorner,
  moveCorner,
  OUTLINE_PROBLEM_TEXT,
  removeCorner,
  setRectangleSize,
  setWallLength,
  startingShape,
} from '../domain/outline';
import { parsePlan } from '../domain/planSchema';
import { boundsOf, pointInPolygon } from '../domain/polygon';
import { footprintCorners, itemFootprint } from '../domain/shape';
import type { Corner, Door, Item, Obstacle, PlanDocument, ProductPreview, WindowOpening } from '../domain/types';
import {
  addCornerOnWall,
  addObstacleAtCentre,
  dragCornerTo,
  dragObstacleTo,
  nudgeSelected,
  nudgeSelectedCorner,
  nudgeSelectedObstacle,
  placeOpeningOnWall,
  placePreview,
  removeSelected,
  removeSelectedCorner,
  removeSelectedRoomThing,
  rotateSelected,
  rotateSelectedObstacle,
  setWallLengthTo,
  slideOpeningTo,
  slideSelectedOpening,
  slideSelectedWallToward,
  slideWallTo,
  startWallSlide,
  updateSelectedObstacle,
  updateSelectedOpening,
} from './actions';
import { ROOM_PROBLEM_TEXT, usePlanStore } from './planStore';
import { totalPrice, useConflicts, useSelectedItem, useWarnings } from './selectors';
import { furnishedDocument } from '../test/fixtures';
import { type UiState, useUiStore } from './uiStore';

// Wraps findPlanIssues in a spy (calling the real one), so the selectors' shared memo can be counted.
vi.mock('../domain/conflicts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/conflicts')>();
  return { ...actual, findPlanIssues: vi.fn(actual.findPlanIssues) };
});

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
  return {
    schemaVersion: state.schemaVersion,
    units: state.units,
    room: state.room,
    items: state.items,
    openings: state.openings,
    obstacles: state.obstacles,
  };
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

/** Resets to the furnished plan with the seed bed centred on (x, y), there partly outside the room, so the walls do not stop it. */
function withBedOutsideAt(x: number, y: number): void {
  const doc = furnishedDocument();
  usePlanStore.getState().reset({ ...doc, items: doc.items.map((i) => (i.id === 'seed-bed' ? { ...i, x, y } : i)) });
}

// Most rows move, turn or price the bed and desk, so each starts from the furnished plan.
beforeEach(() => {
  usePlanStore.getState().reset(furnishedDocument());
  useUiStore.getState().reset();
});

describe('planStore', () => {
  it('starts as the initial document: the room with no furniture', () => {
    expect(docOf(freshPlan)).toEqual(createInitialDocument());
    expect(freshPlan.items).toEqual([]);
  });

  it('reset restores the initial document, or the given one', () => {
    usePlanStore.getState().removeItem('seed-bed');
    usePlanStore.getState().reset();
    expect(docOf(usePlanStore.getState())).toEqual(createInitialDocument());
    expect(usePlanStore.getState().items).toEqual([]);

    const custom: PlanDocument = { ...createInitialDocument(), units: 'm', items: [] };
    usePlanStore.getState().reset(custom);
    expect(docOf(usePlanStore.getState())).toEqual(custom);
  });

  it('starts with no openings and no obstacles', () => {
    expect(freshPlan.schemaVersion).toBe(3);
    expect(freshPlan.openings).toEqual([]);
    expect(freshPlan.obstacles).toEqual([]);
  });

  it('reset carries all six document fields: a given door and box, then the starting plan again', () => {
    const door: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
    const box: Obstacle = { id: 'b1', shape: 'box', label: 'Box', x: 40, y: 120, rotation: 0, width: 24, depth: 24, height: 36, elevation: 0 };
    const custom: PlanDocument = { ...createInitialDocument(), openings: [door], obstacles: [box] };
    usePlanStore.getState().reset(custom);
    const s = usePlanStore.getState();
    expect(docOf(s)).toEqual(custom);
    expect(s.openings).toBe(custom.openings);
    expect(s.obstacles).toBe(custom.obstacles);
    usePlanStore.getState().reset();
    expect(docOf(usePlanStore.getState())).toEqual(createInitialDocument());
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

  it('applyOutline stores an accepted outline without moving items and returns null', () => {
    const before = usePlanStore.getState();
    const outline = lShape();
    expect(usePlanStore.getState().applyOutline({ ok: true, outline })).toBeNull();
    const after = usePlanStore.getState();
    expect(after.room).toEqual({ outline, height: 96 });
    expect(after.items).toBe(before.items);
  });

  it('applyOutline writes through setRectangleSize', () => {
    const { room } = usePlanStore.getState();
    expect(usePlanStore.getState().applyOutline(setRectangleSize(room.outline, { w: 120 }))).toBeNull();
    expect(usePlanStore.getState().room.outline).toEqual([
      { id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 120, y: 0 }, { id: 'c3', x: 120, y: 168 }, { id: 'c4', x: 0, y: 168 },
    ]);
  });

  it('applyOutline with the stored corners returns null, keeps the same state and notifies no one', () => {
    const before = usePlanStore.getState();
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    const applied = usePlanStore.getState().applyOutline({ ok: true, outline: structuredClone(before.room.outline) });
    unsubscribe();
    expect(applied).toBeNull();
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

  it('applyOutline refused changes nothing, notifies no one and returns the problem', () => {
    const before = usePlanStore.getState();
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    const applied = usePlanStore.getState().applyOutline({ ok: false, problem: 'crossing' });
    unsubscribe();
    expect(applied).toBe('crossing');
    expect(usePlanStore.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('addItem appends the preview centred, unrotated, with a new id and copied source and model', () => {
    const id = req(usePlanStore.getState().addItem(SOFA) ?? undefined, 'added id');
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
    const id = req(usePlanStore.getState().addItem({ ...SOFA, w: 55, d: 27 }) ?? undefined, 'added id');
    const added = itemById(id);
    expect(added).toMatchObject({ x: 72.5, y: 84.5, angle: 0 });
    expect(added.x - added.w / 2).toBe(45);
    expect(added.y - added.d / 2).toBe(71);
  });

  it('addItem in an L-shaped room centres the item inside the outline', () => {
    const outline = lShape();
    usePlanStore.getState().applyOutline({ ok: true, outline });
    const id = req(usePlanStore.getState().addItem(SOFA) ?? undefined, 'added id');
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
    withBedOutsideAt(140, 42.5);
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
    withBedOutsideAt(72, 20);
    usePlanStore.getState().moveItemBy('seed-bed', 71.6, 0);
    expect(itemById('seed-bed').x).toBe(143.6);
    usePlanStore.getState().moveItemBy('seed-bed', 1, 0);
    expect(itemById('seed-bed').x).toBe(144);
  });

  it('moveItemBy that changes nothing, or with an unknown id, keeps the same state and notifies no one', () => {
    usePlanStore.getState().moveItemBy('seed-bed', 100, 0); // stopped flush with the right wall, centre x 112
    const before = usePlanStore.getState();
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    usePlanStore.getState().moveItemBy('seed-bed', 0, 0);
    usePlanStore.getState().moveItemBy('seed-bed', 5, 0); // already flush with the right wall
    usePlanStore.getState().moveItemBy('nope', 5, 5);
    unsubscribe();
    expect(usePlanStore.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('moveItemBy into the wall a piece is flush against keeps the same items array', () => {
    // The seed bed is flush with the back wall (y = 0).
    const before = usePlanStore.getState().items;
    usePlanStore.getState().moveItemBy('seed-bed', 0, -1);
    expect(usePlanStore.getState().items).toBe(before);
  });

  it('moveItemTo far outside the room stops a piece that starts inside at the walls, not outside', () => {
    usePlanStore.getState().removeItem('seed-desk');
    usePlanStore.getState().moveItemTo('seed-bed', 400, 400);
    expect(itemById('seed-bed')).toMatchObject({ x: 112, y: 125.5 });
    const { items, room } = usePlanStore.getState();
    expect(findConflicts(items, room)['seed-bed']).toBeUndefined();
  });

  it('rotateItemBy on a piece flush in a corner keeps its position', () => {
    usePlanStore.getState().moveItemTo('seed-bed', -400, -400);
    expect(itemById('seed-bed')).toMatchObject({ x: 32, y: 42.5 });
    usePlanStore.getState().rotateItemBy('seed-bed', 30);
    expect(itemById('seed-bed')).toMatchObject({ x: 32, y: 42.5, angle: 30 });
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
      // A room selection clears the other two (here the selected corner); null clears only its own.
      [() => useUiStore.getState().selectOpening('d1'), { selectedOpeningId: 'd1', selectedCornerId: null }],
      [() => useUiStore.getState().selectObstacle('b1'), { selectedObstacleId: 'b1', selectedCornerId: null }],
      [() => useUiStore.getState().selectOpening(null), { selectedOpeningId: null }],
      [() => useUiStore.getState().selectObstacle(null), { selectedObstacleId: null }],
      // Arming a door or window tool clears the room selections; the corner tool changes only the tool.
      [() => useUiStore.getState().setRoomTool('door'), { roomTool: 'door', selectedCornerId: null }],
      [() => useUiStore.getState().setRoomTool('window'), { roomTool: 'window', selectedCornerId: null }],
      [() => useUiStore.getState().setRoomTool('corner'), { roomTool: 'corner' }],
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

describe('uiStore: shared preview', () => {
  it('starts with no shared preview', () => {
    expect(freshUi.sharedPreview).toBeNull();
  });

  it('setSharedPreview sets only its field, and null clears it', () => {
    const ui = useUiStore.getState();
    ui.select('seed-bed');
    ui.setNotice('n');
    const before = useUiStore.getState();
    useUiStore.getState().setSharedPreview({ canKeep: true });
    expect(useUiStore.getState()).toEqual({ ...before, sharedPreview: { canKeep: true } });
    useUiStore.getState().setSharedPreview({ canKeep: false });
    expect(useUiStore.getState()).toEqual({ ...before, sharedPreview: { canKeep: false } });
    useUiStore.getState().setSharedPreview(null);
    expect(useUiStore.getState()).toEqual({ ...before, sharedPreview: null });
  });

  it('reset ends a shared preview', () => {
    useUiStore.getState().setSharedPreview({ canKeep: true });
    useUiStore.getState().reset();
    expect(useUiStore.getState().sharedPreview).toBeNull();
  });
});

describe('uiStore: doors, windows and obstacles', () => {
  it('starts with the corner tool and no opening or obstacle selected', () => {
    expect(freshUi).toMatchObject({ roomTool: 'corner', selectedOpeningId: null, selectedObstacleId: null });
  });

  it.each([
    ['selectCorner', 'selectOpening', 'selectedCornerId', 'selectedOpeningId'],
    ['selectCorner', 'selectObstacle', 'selectedCornerId', 'selectedObstacleId'],
    ['selectOpening', 'selectCorner', 'selectedOpeningId', 'selectedCornerId'],
    ['selectOpening', 'selectObstacle', 'selectedOpeningId', 'selectedObstacleId'],
    ['selectObstacle', 'selectCorner', 'selectedObstacleId', 'selectedCornerId'],
    ['selectObstacle', 'selectOpening', 'selectedObstacleId', 'selectedOpeningId'],
  ] as const)('%s then %s leaves only the second selected', (first, second, firstField, secondField) => {
    useUiStore.getState()[first]('x1');
    expect(useUiStore.getState()[firstField]).toBe('x1');
    useUiStore.getState()[second]('x2');
    const s = useUiStore.getState();
    expect(s[firstField]).toBeNull();
    expect(s[secondField]).toBe('x2');
    expect([s.selectedCornerId, s.selectedOpeningId, s.selectedObstacleId].filter((v) => v !== null)).toEqual(['x2']);
  });

  it('a null selection clears only its own field', () => {
    useUiStore.getState().selectObstacle('b1');
    useUiStore.getState().selectOpening(null);
    useUiStore.getState().selectCorner(null);
    expect(useUiStore.getState().selectedObstacleId).toBe('b1');
    useUiStore.getState().selectObstacle(null);
    expect(useUiStore.getState().selectedObstacleId).toBeNull();
  });

  it('arming a door or window tool clears every room selection', () => {
    useUiStore.getState().selectOpening('d1');
    useUiStore.getState().setRoomTool('window');
    expect(useUiStore.getState()).toMatchObject({ roomTool: 'window', selectedOpeningId: null });
    useUiStore.getState().selectObstacle('b1');
    useUiStore.getState().setRoomTool('door');
    expect(useUiStore.getState()).toMatchObject({ roomTool: 'door', selectedObstacleId: null });
  });

  it('setMode furnish with a tool armed and an obstacle selected resets the tool and both selections', () => {
    const ui = useUiStore.getState();
    ui.setMode('room');
    ui.setRoomTool('door');
    ui.selectObstacle('b1');
    useUiStore.getState().setMode('furnish');
    expect(useUiStore.getState()).toMatchObject({
      mode: 'furnish', roomTool: 'corner', selectedOpeningId: null, selectedObstacleId: null,
    });
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectOpening('d1');
    useUiStore.getState().setMode('furnish');
    expect(useUiStore.getState().selectedOpeningId).toBeNull();
  });

  it('setMode room keeps the tool and the selections', () => {
    useUiStore.getState().setMode('room');
    useUiStore.getState().setRoomTool('window');
    useUiStore.getState().setMode('room');
    expect(useUiStore.getState().roomTool).toBe('window');
    useUiStore.getState().selectObstacle('b1');
    useUiStore.getState().setMode('room');
    expect(useUiStore.getState().selectedObstacleId).toBe('b1');
  });

  it('reset restores the tool and clears both selections', () => {
    useUiStore.getState().setRoomTool('door');
    useUiStore.getState().reset();
    useUiStore.getState().selectOpening('d1');
    useUiStore.getState().setRoomTool('window');
    useUiStore.getState().selectObstacle('b1');
    useUiStore.getState().reset();
    expect(useUiStore.getState()).toMatchObject({ roomTool: 'corner', selectedOpeningId: null, selectedObstacleId: null });
  });
});

describe('uiStore: the selected wall and which end a length moves', () => {
  it('starts with no wall selected and the end anchor', () => {
    expect(freshUi).toMatchObject({ selectedWallId: null, lengthAnchor: 'end' });
  });

  it.each([
    ['selectCorner', 'selectedCornerId'],
    ['selectOpening', 'selectedOpeningId'],
    ['selectObstacle', 'selectedObstacleId'],
  ] as const)('selectWall after %s leaves only the wall selected', (first, firstField) => {
    useUiStore.getState()[first]('x1');
    expect(useUiStore.getState()[firstField]).toBe('x1');
    useUiStore.getState().selectWall('c1');
    expect(useUiStore.getState()).toMatchObject({
      selectedWallId: 'c1', selectedCornerId: null, selectedOpeningId: null, selectedObstacleId: null,
    });
  });

  it('selectWall null clears only the wall', () => {
    useUiStore.getState().selectWall('c1');
    const before = useUiStore.getState();
    useUiStore.getState().selectWall(null);
    expect(useUiStore.getState()).toEqual({ ...before, selectedWallId: null });
  });

  it.each([
    ['selectCorner', 'c2', 'selectedCornerId'],
    ['selectOpening', 'd', 'selectedOpeningId'],
    ['selectObstacle', 'o', 'selectedObstacleId'],
  ] as const)('%s clears the selected wall', (select, id, field) => {
    useUiStore.getState().selectWall('c1');
    useUiStore.getState()[select](id);
    expect(useUiStore.getState()).toMatchObject({ selectedWallId: null, [field]: id });
  });

  it.each(['selectCorner', 'selectOpening', 'selectObstacle'] as const)(
    '%s null keeps the wall selected',
    (select) => {
      useUiStore.getState().selectWall('c1');
      useUiStore.getState()[select](null);
      expect(useUiStore.getState().selectedWallId).toBe('c1');
    },
  );

  it.each(['door', 'window'] as const)('arming the %s tool clears the selected wall', (tool) => {
    useUiStore.getState().selectWall('c1');
    useUiStore.getState().setRoomTool(tool);
    expect(useUiStore.getState()).toMatchObject({ roomTool: tool, selectedWallId: null });
  });

  it('setMode furnish clears the selected wall and keeps the anchor', () => {
    const ui = useUiStore.getState();
    ui.setMode('room');
    ui.selectWall('c1');
    ui.setLengthAnchor('start');
    useUiStore.getState().setMode('furnish');
    expect(useUiStore.getState()).toMatchObject({ mode: 'furnish', selectedWallId: null, lengthAnchor: 'start' });
  });

  it('setLengthAnchor sets the anchor and nothing else', () => {
    const before = useUiStore.getState();
    useUiStore.getState().setLengthAnchor('both');
    expect(useUiStore.getState()).toEqual({ ...before, lengthAnchor: 'both' });
  });

  it('reset clears the selected wall and restores the end anchor', () => {
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectWall('c1');
    useUiStore.getState().setLengthAnchor('both');
    useUiStore.getState().reset();
    expect(useUiStore.getState()).toMatchObject({ selectedWallId: null, lengthAnchor: 'end' });
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
    withBedOutsideAt(72, 20);
    useUiStore.getState().select('seed-bed');
    nudgeSelected(71.6, 0);
    expect(itemById('seed-bed').x).toBe(143.6);
    nudgeSelected(1, 0);
    expect(itemById('seed-bed').x).toBe(144);
  });

  it('nudgeSelected keeps the centre inside the room bounds', () => {
    withBedOutsideAt(72, 20);
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

describe('room edit actions', () => {
  const NEW_ID = '00000000-0000-4000-8000-000000000001';
  const NO_SNAP = { angleSnap: false, toleranceIn: 2 };

  function outline(): Corner[] {
    return usePlanStore.getState().room.outline;
  }

  function corner(id: string): Corner | undefined {
    return outline().find((c) => c.id === id);
  }

  /** The seed room with corner c2 removed: the triangle c1 (0, 0), c3 (144, 168), c4 (0, 168). */
  function triangle(): void {
    usePlanStore.getState().applyOutline({ ok: true, outline: outline().filter((c) => c.id !== 'c2') });
  }

  beforeEach(() => {
    useUiStore.getState().setMode('room');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dragCornerTo moves the corner to the grid-snapped target and clears the room problem', () => {
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    dragCornerTo('c2', { x: 150.4, y: 0.5 }, NO_SNAP);
    expect(corner('c2')).toEqual({ id: 'c2', x: 150, y: 1 });
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('dragCornerTo with angle snapping puts a wall near a 15° direction on it', () => {
    // The wall from c1 (0, 0) is 0.5 in off horizontal at the target: inside the 2 in tolerance.
    dragCornerTo('c2', { x: 150.4, y: 0.5 }, { angleSnap: true, toleranceIn: 2 });
    expect(corner('c2')).toEqual({ id: 'c2', x: 150.4, y: 0 });
  });

  it('dragCornerTo refused keeps the outline and reports the problem; a valid target clears it', () => {
    const before = usePlanStore.getState().room;
    dragCornerTo('c2', { x: -50, y: 84 }, NO_SNAP);
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().roomProblem).toBe('Walls cannot cross.');
    dragCornerTo('c2', { x: 160, y: -10 }, NO_SNAP);
    expect(corner('c2')).toEqual({ id: 'c2', x: 160, y: -10 });
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('dragCornerTo with an unknown corner changes nothing, the room problem included', () => {
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    const before = usePlanStore.getState().room;
    dragCornerTo('nope', { x: 10, y: 10 }, NO_SNAP);
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().roomProblem).toBe('Walls cannot cross.');
  });

  it('addCornerOnWall splits the wall at the snapped point and selects the new corner', () => {
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(NEW_ID);
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    addCornerOnWall('c1', { x: 72.3, y: 4 });
    expect(uuid).toHaveBeenCalledTimes(1);
    expect(outline().map((c) => c.id)).toEqual(['c1', NEW_ID, 'c2', 'c3', 'c4']);
    expect(corner(NEW_ID)).toEqual({ id: NEW_ID, x: 72, y: 0 });
    expect(useUiStore.getState().selectedCornerId).toBe(NEW_ID);
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('addCornerOnWall within 6 in of a wall end is refused with the reason', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(NEW_ID);
    useUiStore.getState().selectCorner('c3');
    const before = usePlanStore.getState().room;
    addCornerOnWall('c1', { x: 3, y: 0 });
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().selectedCornerId).toBe('c3');
    expect(useUiStore.getState().roomProblem).toBe('That wall would be too short.');
  });

  it('addCornerOnWall on an unknown wall changes nothing', () => {
    useUiStore.getState().selectCorner('c3');
    const before = usePlanStore.getState().room;
    addCornerOnWall('nope', { x: 72, y: 0 });
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().selectedCornerId).toBe('c3');
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('removeSelectedCorner removes the selected corner and clears the selection', () => {
    useUiStore.getState().selectCorner('c2');
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    removeSelectedCorner();
    expect(outline().map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
    expect(useUiStore.getState().selectedCornerId).toBeNull();
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('removeSelectedCorner on a triangle is refused and keeps the selection', () => {
    triangle();
    useUiStore.getState().selectCorner('c3');
    const before = usePlanStore.getState().room;
    removeSelectedCorner();
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().selectedCornerId).toBe('c3');
    expect(useUiStore.getState().roomProblem).toBe('A room needs at least 3 corners.');
  });

  it('removeSelectedCorner does nothing when no corner is selected', () => {
    const before = usePlanStore.getState().room;
    removeSelectedCorner();
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('nudgeSelectedCorner moves the selected corner by exactly the step, with no snapping', () => {
    // Off the 1 in corner grid, so a grid or angle snap would show.
    usePlanStore.getState().applyOutline({
      ok: true,
      outline: outline().map((c) => (c.id === 'c2' ? { ...c, x: 144.5, y: 0.25 } : c)),
    });
    useUiStore.getState().selectCorner('c2');
    nudgeSelectedCorner(1, 0);
    expect(corner('c2')).toEqual({ id: 'c2', x: 145.5, y: 0.25 });
    nudgeSelectedCorner(0, -12);
    expect(corner('c2')).toEqual({ id: 'c2', x: 145.5, y: -11.75 });
    expect(useUiStore.getState().selectedCornerId).toBe('c2');
  });

  it('nudgeSelectedCorner refused keeps the outline and reports the problem', () => {
    triangle();
    useUiStore.getState().selectCorner('c3');
    const before = usePlanStore.getState().room;
    // c3 (144, 168) moved 141 in left to (3, 168) leaves the c3–c4 wall 3 in long.
    nudgeSelectedCorner(-141, 0);
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().roomProblem).toBe('That wall would be too short.');
  });

  it('nudgeSelectedCorner does nothing when no corner or an unknown corner is selected', () => {
    const before = usePlanStore.getState().room;
    nudgeSelectedCorner(1, 0);
    useUiStore.getState().selectCorner('nope');
    nudgeSelectedCorner(1, 0);
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().roomProblem).toBeNull();
  });
});

describe('selectors', () => {
  it('totalPrice sums seed item prices', () => {
    expect(totalPrice(furnishedDocument().items)).toBe(1310);
  });

  it('totalPrice counts a null price as 0', () => {
    const [bed, desk] = furnishedDocument().items;
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

describe('saved-plan limits on edits', () => {
  const NO_SNAP = { angleSnap: false, toleranceIn: 2 };

  /** Replaces the plan's items with `n` small boxes. */
  function fillItems(n: number): void {
    const items = Array.from({ length: n }, (_, i) => ({ ...itemById('seed-bed'), id: `box-${i}`, w: 10, d: 10 }));
    usePlanStore.getState().reset({ ...docOf(usePlanStore.getState()), items });
  }

  /**
   * Walks the seed rectangle by dragging its corners one at a time, (dx, dy) each, leading corners
   * first, for at most `rounds` rounds. Stops at the first refused edit and returns true, or
   * returns false when every edit was accepted.
   */
  function walkRoom(dx: number, dy: number, rounds: number): boolean {
    const leading = dx > 0 ? ['c2', 'c3'] : dx < 0 ? ['c1', 'c4'] : dy > 0 ? ['c3', 'c4'] : ['c1', 'c2'];
    const order = [...leading, ...['c1', 'c2', 'c3', 'c4'].filter((id) => !leading.includes(id))];
    for (let round = 0; round < rounds; round++) {
      for (const id of order) {
        const c = req(usePlanStore.getState().room.outline.find((k) => k.id === id), id);
        dragCornerTo(id, { x: c.x + dx, y: c.y + dy }, NO_SNAP);
        if (useUiStore.getState().roomProblem !== null) return true;
      }
    }
    return false;
  }

  it('addItem cuts a preview name to 200 characters, its host to 255, and stores a link over 2048 as null', () => {
    const id = usePlanStore.getState().addItem({
      ...SOFA,
      name: 'n'.repeat(500),
      host: 'h'.repeat(300),
      sourceUrl: `https://shop.example/${'a'.repeat(3000)}`,
    });
    const added = itemById(req(id ?? undefined, 'added id'));
    expect(added.name).toBe('n'.repeat(200));
    expect(added.host).toBe('h'.repeat(255));
    expect(added.sourceUrl).toBeNull();
  });

  it('addItem adds the 200th item and returns null, changing nothing, once the plan has 200', () => {
    expect(CONFIG.maxItems).toBe(200);
    fillItems(199);
    expect(typeof usePlanStore.getState().addItem(SOFA)).toBe('string');
    expect(usePlanStore.getState().items).toHaveLength(200);

    const before = usePlanStore.getState();
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    const id = usePlanStore.getState().addItem(SOFA);
    unsubscribe();
    expect(id).toBeNull();
    expect(usePlanStore.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('placePreview on a full plan adds nothing, selects nothing, keeps the preview and returns null', () => {
    fillItems(200);
    useUiStore.getState().setLookup({ status: 'preview', product: SOFA });
    const before = usePlanStore.getState().items;
    expect(placePreview()).toBeNull();
    expect(usePlanStore.getState().items).toBe(before);
    expect(useUiStore.getState().selectedId).toBeNull();
    expect(useUiStore.getState().lookup).toEqual({ status: 'preview', product: SOFA });
  });

  it('placePreview returns the id of the item it placed', () => {
    useUiStore.getState().setLookup({ status: 'preview', product: SOFA });
    const id = placePreview();
    expect(id).toBe(req(usePlanStore.getState().items[2], 'placed item').id);
  });

  it.each([
    [500, 0], [-500, 0], [0, 500], [0, -500],
  ])('corners walked by (%s, %s) per step stop at ±1440, so an item cannot be moved or nudged past it', (dx, dy) => {
    useUiStore.getState().setMode('room');
    expect(walkRoom(dx, dy, 20)).toBe(true);
    expect(useUiStore.getState().roomProblem).toBe('That would make the room too large.');
    for (const c of usePlanStore.getState().room.outline) {
      expect(Math.abs(c.x)).toBeLessThanOrEqual(1440);
      expect(Math.abs(c.y)).toBeLessThanOrEqual(1440);
    }
    useUiStore.getState().setMode('furnish');
    useUiStore.getState().select('seed-bed');
    const far = 1e6;
    usePlanStore.getState().moveItemTo('seed-bed', Math.sign(dx) * far, Math.sign(dy) * far);
    let bed = itemById('seed-bed');
    expect(Math.abs(bed.x)).toBeLessThanOrEqual(1440);
    expect(Math.abs(bed.y)).toBeLessThanOrEqual(1440);
    nudgeSelected(Math.sign(dx) * far, Math.sign(dy) * far);
    bed = itemById('seed-bed');
    expect(Math.abs(bed.x)).toBeLessThanOrEqual(1440);
    expect(Math.abs(bed.y)).toBeLessThanOrEqual(1440);
  });
});

describe('selection in room mode', () => {
  it('select(id) does nothing in room mode', () => {
    useUiStore.getState().setMode('room');
    const before = useUiStore.getState();
    useUiStore.getState().select('seed-bed');
    expect(useUiStore.getState()).toBe(before);
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('select(null) clears the selection in room mode too', () => {
    useUiStore.getState().setMode('room');
    useUiStore.setState({ selectedId: 'seed-bed' });
    useUiStore.getState().select(null);
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('select(id) selects in furnish mode, and placePreview there selects the placed item', () => {
    useUiStore.getState().select('seed-bed');
    expect(useUiStore.getState().selectedId).toBe('seed-bed');
    useUiStore.getState().setLookup({ status: 'preview', product: SOFA });
    const id = placePreview();
    expect(useUiStore.getState().selectedId).toBe(id);
  });
});

describe('plan store: doors, windows and obstacles', () => {
  /** A 32 in door 20 in along the top wall (c1, from (0, 0) to (144, 0)): it spans x 20–52. */
  const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
  const BOX: Obstacle = { id: 'b1', shape: 'box', label: 'Box', x: 40, y: 120, rotation: 0, width: 24, depth: 24, height: 36, elevation: 0 };

  function outline(): Corner[] {
    return usePlanStore.getState().room.outline;
  }

  function withPlan(fields: Partial<PlanDocument>): void {
    usePlanStore.getState().reset({ ...furnishedDocument(), ...fields });
  }

  function obstacleById(id: string): Obstacle {
    return req(usePlanStore.getState().obstacles.find((o) => o.id === id), `obstacle ${id}`);
  }

  /** Runs `edit` and asserts it left the very same state object and notified no one. */
  function expectNoChange(edit: () => void): void {
    const before = usePlanStore.getState();
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    edit();
    unsubscribe();
    expect(usePlanStore.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  }

  it('ROOM_PROBLEM_TEXT is the outline, opening and obstacle texts merged', () => {
    expect(ROOM_PROBLEM_TEXT).toEqual({ ...OUTLINE_PROBLEM_TEXT, ...OPENING_PROBLEM_TEXT, ...OBSTACLE_PROBLEM_TEXT });
    expect(Object.keys(ROOM_PROBLEM_TEXT)).toHaveLength(
      Object.keys(OUTLINE_PROBLEM_TEXT).length + Object.keys(OPENING_PROBLEM_TEXT).length + Object.keys(OBSTACLE_PROBLEM_TEXT).length,
    );
    expect(ROOM_PROBLEM_TEXT['opening-off-wall']).toBe('That would leave a door or window without room on its wall.');
  });

  it('applyOutline accepts a corner move in a room with no openings and stores it', () => {
    const result = moveCorner(outline(), 'c3', { x: 160, y: 180 });
    if (!result.ok) throw new Error('expected the move to be valid');
    expect(usePlanStore.getState().applyOutline(result)).toBeNull();
    expect(outline()).toEqual(result.outline);
    expect(usePlanStore.getState().openings).toEqual([]);
  });

  it('applyOutline refused by the outline rules returns the problem and changes nothing', () => {
    withPlan({ openings: [D1] });
    const result = moveCorner(outline(), 'c2', { x: -50, y: 84 });
    expect(result).toEqual({ ok: false, problem: 'crossing' });
    let problem: unknown;
    expectNoChange(() => {
      problem = usePlanStore.getState().applyOutline(result);
    });
    expect(problem).toBe('crossing');
  });

  it('a corner move that keeps the door returns null and keeps the openings array', () => {
    withPlan({ openings: [D1] });
    const before = usePlanStore.getState().openings;
    expect(usePlanStore.getState().applyOutline(moveCorner(outline(), 'c2', { x: 100, y: 0 }))).toBeNull();
    expect(outline()[1]).toEqual({ id: 'c2', x: 100, y: 0 });
    expect(usePlanStore.getState().openings).toBe(before);
    expect(usePlanStore.getState().openings).toEqual([D1]);
  });

  it.each([
    ['a corner move', () => moveCorner(outline(), 'c2', { x: 50, y: 0 }), 'opening-off-wall'],
    ['a wall length', () => setWallLength(outline(), 'c1', 40), 'opening-off-wall'],
    ['a rectangle width', () => setRectangleSize(outline(), { w: 48 }), 'opening-off-wall'],
    ['a corner inside the door', () => insertCorner(outline(), 'c1', { x: 40, y: 0 }, 'n1'), 'corner-in-opening'],
    ['removing a corner beside the door', () => removeCorner(outline(), 'c2'), 'corner-has-openings'],
    [
      'a starting shape (all-new ids)',
      () => ({ ok: true as const, outline: startingShape('rectangle', 144, 168, () => crypto.randomUUID()) }),
      'shape-has-openings',
    ],
  ] as const)('%s that the door cannot follow is refused with its problem; the state is the same object', (_case, edit, expected) => {
    withPlan({ openings: [D1] });
    const result = edit();
    expect(result.ok).toBe(true);
    let problem: unknown;
    expectNoChange(() => {
      problem = usePlanStore.getState().applyOutline(result);
    });
    expect(problem).toBe(expected);
  });

  it('a starting shape with no doors or windows is accepted', () => {
    const shape = startingShape('l-shape', 144, 168, () => crypto.randomUUID());
    expect(usePlanStore.getState().applyOutline({ ok: true, outline: shape })).toBeNull();
    expect(outline()).toBe(shape);
  });

  it('a corner added on the door wall before it moves the door onto the new wall, in one update', () => {
    withPlan({ openings: [D1] });
    const listener = vi.fn();
    const unsubscribe = usePlanStore.subscribe(listener);
    const problem = usePlanStore.getState().applyOutline(insertCorner(outline(), 'c1', { x: 10, y: 0 }, 'n1'));
    unsubscribe();
    expect(problem).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    const after = usePlanStore.getState();
    expect(after.room.outline.map((c) => c.id)).toEqual(['c1', 'n1', 'c2', 'c3', 'c4']);
    expect(after.openings).toEqual([{ ...D1, wallId: 'n1', offset: 10 }]);
  });

  it('applyOpenings stores an accepted list and returns null', () => {
    const problem = usePlanStore.getState().applyOpenings(addOpening(outline(), [], 'door', 'c1', { x: 72, y: 5 }, 'door-1'));
    expect(problem).toBeNull();
    expect(usePlanStore.getState().openings).toEqual([
      { id: 'door-1', kind: 'door', wallId: 'c1', offset: 56, width: 32, height: 80, hinge: 'start', swing: 'in' },
    ]);
  });

  it('applyOpenings refused returns the problem and changes nothing', () => {
    withPlan({ openings: [D1] });
    let problem: unknown;
    expectNoChange(() => {
      problem = usePlanStore.getState().applyOpenings({ ok: false, problem: 'opening-overlap' });
    });
    expect(problem).toBe('opening-overlap');
  });

  it('applyOpenings refuses a list that does not fit the stored outline, changing nothing', () => {
    // Accepted on a wider room, but the stored top wall is 144 in long.
    const wide = setRectangleSize(outline(), { w: 600 });
    if (!wide.ok) throw new Error('expected a valid wide room');
    const result = addOpening(wide.outline, [], 'door', 'c1', { x: 500, y: 0 }, 'door-1');
    expect(result.ok).toBe(true);
    let problem: unknown;
    expectNoChange(() => {
      problem = usePlanStore.getState().applyOpenings(result);
    });
    expect(problem).toBe('opening-off-wall');
  });

  it('applyOpenings with a list equal to the stored one keeps the same state', () => {
    withPlan({ openings: [D1] });
    let problem: unknown = 'unset';
    expectNoChange(() => {
      problem = usePlanStore.getState().applyOpenings({ ok: true, openings: [structuredClone(D1)] });
    });
    expect(problem).toBeNull();
  });

  it('applyObstacles stores an accepted list and returns null', () => {
    const problem = usePlanStore.getState().applyObstacles(addObstacle([], newObstacle('box', { x: 40, y: 120 }, 96, 'b1')));
    expect(problem).toBeNull();
    expect(usePlanStore.getState().obstacles).toEqual([BOX]);
  });

  it('applyObstacles keeps every centre within ±CONFIG.coordMax, so parsePlan reads it back; an in-room position is stored unchanged', () => {
    const far = addObstacle([], newObstacle('box', { x: 1e6, y: -1e6 }, 96, 'far'));
    const result = addObstacle(far.ok ? far.obstacles : [], newObstacle('box', { x: 40, y: 120 }, 96, 'b1'));
    expect(result.ok).toBe(true);
    expect(usePlanStore.getState().applyObstacles(result)).toBeNull();
    expect(obstacleById('far')).toMatchObject({ x: CONFIG.coordMax, y: -CONFIG.coordMax });
    expect(obstacleById('b1')).toEqual(BOX);
    expect(parsePlan(JSON.parse(JSON.stringify(docOf(usePlanStore.getState())))).ok).toBe(true);
  });

  it('applyObstacles clamps a centre just past ±CONFIG.coordMax to it and rounds it to 0.01', () => {
    expect(CONFIG.coordMax).toBe(1440);
    const result = { ok: true as const, obstacles: [{ ...BOX, x: -1440.004, y: 1440.5 }, { ...BOX, id: 'b2', x: 12.3456, y: 1439.996 }] };
    expect(usePlanStore.getState().applyObstacles(result)).toBeNull();
    expect(obstacleById('b1')).toMatchObject({ x: -1440, y: 1440 });
    expect(obstacleById('b2')).toMatchObject({ x: 12.35, y: 1440 });
    expect(parsePlan(JSON.parse(JSON.stringify(docOf(usePlanStore.getState())))).ok).toBe(true);
  });

  it.each([
    ['x', Number.POSITIVE_INFINITY],
    ['x', Number.NEGATIVE_INFINITY],
    ['x', Number.NaN],
    ['y', Number.POSITIVE_INFINITY],
    ['y', Number.NEGATIVE_INFINITY],
    ['y', Number.NaN],
  ] as const)('applyObstacles refuses a centre %s of %s as obstacle-size and stores nothing', (key, value) => {
    withPlan({ obstacles: [BOX] });
    let problem: unknown;
    expectNoChange(() => {
      problem = usePlanStore.getState().applyObstacles({ ok: true, obstacles: [BOX, { ...BOX, id: 'bad', [key]: value }] });
    });
    expect(problem).toBe('obstacle-size');
  });

  it('applyObstacles refused returns the problem and changes nothing', () => {
    withPlan({ obstacles: [BOX] });
    let problem: unknown;
    expectNoChange(() => {
      problem = usePlanStore.getState().applyObstacles({ ok: false, problem: 'too-many-obstacles' });
    });
    expect(problem).toBe('too-many-obstacles');
  });

  it('applyObstacles stores numbers to 0.01: a column as tall as a 2.45 m ceiling', () => {
    usePlanStore.getState().setRoomHeight(2.45 / 0.0254); // 96.4566… in
    const { room } = usePlanStore.getState();
    expect(room.height).not.toBe(96.46);
    expect(usePlanStore.getState().applyObstacles(addObstacle([], newObstacle('cylinder', { x: 72, y: 84 }, room.height, 'col')))).toBeNull();
    expect(obstacleById('col').height).toBe(96.46);
  });

  it('moveObstacleTo snaps the box to the grid; moveObstacleBy moves it by exactly the step', () => {
    withPlan({ obstacles: [BOX] });
    usePlanStore.getState().moveObstacleTo('b1', 30.4, 50.6);
    expect(obstacleById('b1')).toMatchObject({ x: 30, y: 51 });
    usePlanStore.getState().moveObstacleBy('b1', 1, 0);
    expect(obstacleById('b1').x).toBe(31);
    expect(obstacleById('b1').y).toBe(51);
  });

  it('moveObstacleTo and moveObstacleBy keep the centre inside the room bounds', () => {
    // Partly outside the room (x 138–162), so the walls do not stop it.
    withPlan({ obstacles: [{ ...BOX, x: 150 }] });
    usePlanStore.getState().moveObstacleTo('b1', -50, 900);
    expect(obstacleById('b1')).toMatchObject({ x: 0, y: 168 });
    usePlanStore.getState().moveObstacleBy('b1', 500, -500);
    expect(obstacleById('b1')).toMatchObject({ x: 144, y: 0 });
  });

  it('moveObstacleTo far outside the room stops an obstacle that starts inside at the wall, not outside', () => {
    withPlan({ obstacles: [BOX] });
    usePlanStore.getState().moveObstacleTo('b1', -400, 120);
    expect(obstacleById('b1')).toMatchObject({ x: 12, y: 120 });
    const { items, room, openings, obstacles } = usePlanStore.getState();
    expect(findPlanIssues(items, room, openings, obstacles).conflicts.b1).toBeUndefined();
  });

  it('obstacle moves that change nothing, unknown ids and numbers that are not finite keep the same state', () => {
    withPlan({ obstacles: [BOX] });
    expectNoChange(() => {
      const s = usePlanStore.getState();
      s.moveObstacleTo('b1', 40, 120);
      s.moveObstacleTo('b1', 40.2, 119.8);
      s.moveObstacleBy('b1', 0, 0);
      s.moveObstacleTo('nope', 10, 10);
      s.moveObstacleBy('nope', 1, 1);
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        s.moveObstacleTo('b1', bad, 10);
        s.moveObstacleTo('b1', 10, bad);
        s.moveObstacleBy('b1', bad, 1);
        s.moveObstacleBy('b1', 1, bad);
      }
    });
  });

  it('removeOpening and removeObstacle remove the entry; an unknown id keeps the same state', () => {
    withPlan({ openings: [D1], obstacles: [BOX] });
    expectNoChange(() => {
      usePlanStore.getState().removeOpening('nope');
      usePlanStore.getState().removeObstacle('nope');
    });
    usePlanStore.getState().removeOpening('d1');
    expect(usePlanStore.getState().openings).toEqual([]);
    expect(usePlanStore.getState().obstacles).toEqual([BOX]);
    usePlanStore.getState().removeObstacle('b1');
    expect(usePlanStore.getState().obstacles).toEqual([]);
  });
});

describe('room edit actions with a door', () => {
  const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
  const NO_SNAP = { angleSnap: false, toleranceIn: 2 };

  beforeEach(() => {
    usePlanStore.getState().reset({ ...furnishedDocument(), openings: [D1] });
    useUiStore.getState().setMode('room');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dragCornerTo that squeezes the door keeps the room and shows the opening text', () => {
    const before = usePlanStore.getState().room;
    dragCornerTo('c2', { x: 50, y: 0 }, NO_SNAP);
    expect(usePlanStore.getState().room).toBe(before);
    expect(useUiStore.getState().roomProblem).toBe(OPENING_PROBLEM_TEXT['opening-off-wall']);
  });

  it('nudgeSelectedCorner that squeezes the door shows the opening text', () => {
    useUiStore.getState().selectCorner('c2');
    nudgeSelectedCorner(-94, 0);
    expect(usePlanStore.getState().room.outline[1]).toEqual({ id: 'c2', x: 144, y: 0 });
    expect(useUiStore.getState().roomProblem).toBe(OPENING_PROBLEM_TEXT['opening-off-wall']);
  });

  it('addCornerOnWall inside the door is refused with its text and keeps the selection', () => {
    useUiStore.getState().selectCorner('c3');
    addCornerOnWall('c1', { x: 40, y: 0 });
    expect(usePlanStore.getState().room.outline).toHaveLength(4);
    expect(useUiStore.getState().selectedCornerId).toBe('c3');
    expect(useUiStore.getState().roomProblem).toBe(OPENING_PROBLEM_TEXT['corner-in-opening']);
  });

  it('addCornerOnWall before the door moves it onto the new wall, selects the corner and clears the problem', () => {
    const id = '00000000-0000-4000-8000-000000000002';
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(id);
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    addCornerOnWall('c1', { x: 10, y: 0 });
    expect(usePlanStore.getState().openings).toEqual([{ ...D1, wallId: id, offset: 10 }]);
    expect(useUiStore.getState().selectedCornerId).toBe(id);
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('removeSelectedCorner beside the door is refused with its text and keeps the selection', () => {
    useUiStore.getState().selectCorner('c2');
    removeSelectedCorner();
    expect(usePlanStore.getState().room.outline).toHaveLength(4);
    expect(useUiStore.getState().selectedCornerId).toBe('c2');
    expect(useUiStore.getState().roomProblem).toBe(OPENING_PROBLEM_TEXT['corner-has-openings']);
  });
});

describe('issue selectors', () => {
  const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
  const W1: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 24, height: 48 };

  beforeEach(() => {
    vi.mocked(findPlanIssues).mockClear();
  });

  it('with the seed plus a door: the bed blocks it and there are no warnings', () => {
    usePlanStore.getState().reset({ ...furnishedDocument(), openings: [D1] });
    const { result } = renderHook(() => ({ conflicts: useConflicts(), warnings: useWarnings() }));
    expect(result.current.conflicts).toEqual({ 'seed-bed': 'Blocks a door' });
    expect(result.current.warnings).toEqual({});
  });

  it('with the seed plus a window on c2: the desk covers it', () => {
    usePlanStore.getState().reset({ ...furnishedDocument(), openings: [W1] });
    const { result } = renderHook(() => useWarnings());
    expect(result.current).toEqual({ 'seed-desk': 'Covers a window' });
  });

  it('both return the same objects while the plan is unchanged, from one computation per change', () => {
    usePlanStore.getState().reset({ ...furnishedDocument(), openings: [W1] });
    const a = renderHook(() => ({ conflicts: useConflicts(), warnings: useWarnings() }));
    const b = renderHook(() => useWarnings());
    const first = a.result.current;
    a.rerender();
    b.rerender();
    expect(a.result.current.conflicts).toBe(first.conflicts);
    expect(a.result.current.warnings).toBe(first.warnings);
    expect(b.result.current).toBe(first.warnings);
    expect(findPlanIssues).toHaveBeenCalledTimes(1);

    act(() => usePlanStore.getState().removeOpening('w1'));
    a.rerender();
    b.rerender();
    expect(a.result.current.warnings).toEqual({});
    expect(b.result.current).toBe(a.result.current.warnings);
    expect(findPlanIssues).toHaveBeenCalledTimes(2);
  });

  it('recompute when openings or obstacles change', () => {
    const { result } = renderHook(() => useConflicts());
    expect(result.current).toEqual({});
    act(() => usePlanStore.getState().reset({ ...furnishedDocument(), openings: [D1] }));
    expect(result.current).toEqual({ 'seed-bed': 'Blocks a door' });
    act(() => usePlanStore.getState().removeOpening('d1'));
    expect(result.current).toEqual({});
  });
});

describe('door, window and obstacle actions', () => {
  const NEW_ID = '00000000-0000-4000-8000-000000000003';
  /** A 32 in door 20 in along the top wall (c1, from (0, 0) to (144, 0)): it spans x 20–52. */
  const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
  /** A window on the right wall (c2, from (144, 0) to (144, 168)). */
  const W1: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 24, height: 48 };
  const BOX: Obstacle = { id: 'b1', shape: 'box', label: 'Box', x: 40, y: 120, rotation: 0, width: 24, depth: 24, height: 36, elevation: 0 };
  const COLUMN: Obstacle = { id: 'col', shape: 'cylinder', label: 'Column', x: 100, y: 60, rotation: 0, width: 12, depth: 12, height: 96, elevation: 0 };

  function withPlan(fields: Partial<PlanDocument>): void {
    usePlanStore.getState().reset({ ...furnishedDocument(), ...fields });
  }

  function openingById(id: string): Door | WindowOpening {
    return req(usePlanStore.getState().openings.find((o) => o.id === id), `opening ${id}`);
  }

  function obstacleById(id: string): Obstacle {
    return req(usePlanStore.getState().obstacles.find((o) => o.id === id), `obstacle ${id}`);
  }

  /** Runs `edit` and asserts both stores are the very same state objects afterwards. */
  function expectNothingChanges(edit: () => void): void {
    const plan = usePlanStore.getState();
    const ui = useUiStore.getState();
    edit();
    expect(usePlanStore.getState()).toBe(plan);
    expect(useUiStore.getState()).toBe(ui);
  }

  beforeEach(() => {
    useUiStore.getState().setMode('room');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('placeOpeningOnWall with the door tool places a door centred on the click, selects it and disarms', () => {
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(NEW_ID);
    useUiStore.getState().setRoomTool('door');
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    placeOpeningOnWall('c1', { x: 72, y: 5 });
    expect(uuid).toHaveBeenCalledTimes(1);
    expect(usePlanStore.getState().openings).toEqual([
      { id: NEW_ID, kind: 'door', wallId: 'c1', offset: 56, width: 32, height: 80, hinge: 'start', swing: 'in' },
    ]);
    expect(useUiStore.getState()).toMatchObject({ selectedOpeningId: NEW_ID, roomTool: 'corner', roomProblem: null });
  });

  it('placeOpeningOnWall with the window tool places a window', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(NEW_ID);
    useUiStore.getState().setRoomTool('window');
    placeOpeningOnWall('c2', { x: 140, y: 84 });
    expect(usePlanStore.getState().openings).toEqual([
      { id: NEW_ID, kind: 'window', wallId: 'c2', offset: 66, width: 36, sill: 36, height: 48 },
    ]);
    expect(useUiStore.getState()).toMatchObject({ selectedOpeningId: NEW_ID, roomTool: 'corner' });
  });

  it('placeOpeningOnWall on a wall 10 in long is refused: no opening, the tool stays armed, the reason is shown', () => {
    // A corner at (10, 0) leaves the wall from c1 10 in long.
    usePlanStore.getState().applyOutline(insertCorner(usePlanStore.getState().room.outline, 'c1', { x: 10, y: 0 }, 'n1'));
    useUiStore.getState().setRoomTool('door');
    placeOpeningOnWall('c1', { x: 5, y: 0 });
    expect(usePlanStore.getState().openings).toEqual([]);
    expect(useUiStore.getState()).toMatchObject({ roomTool: 'door', selectedOpeningId: null });
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['opening-off-wall']);
  });

  it('placeOpeningOnWall with the corner tool, or on an unknown wall, changes nothing', () => {
    const uuid = vi.spyOn(crypto, 'randomUUID');
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    expectNothingChanges(() => placeOpeningOnWall('c1', { x: 72, y: 5 }));
    useUiStore.getState().setRoomTool('door');
    expectNothingChanges(() => placeOpeningOnWall('nope', { x: 72, y: 5 }));
    expect(uuid).not.toHaveBeenCalled();
  });

  it('slideSelectedOpening slides by the step; at the wall end the offset stays and no problem is set', () => {
    withPlan({ openings: [D1] });
    useUiStore.getState().selectOpening('d1');
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    slideSelectedOpening(1);
    expect(openingById('d1').offset).toBe(21);
    expect(useUiStore.getState().roomProblem).toBeNull();
    slideSelectedOpening(500);
    expect(openingById('d1').offset).toBe(112);
    slideSelectedOpening(1);
    expect(openingById('d1').offset).toBe(112);
    expect(useUiStore.getState().roomProblem).toBeNull();
    slideSelectedOpening(-500);
    expect(openingById('d1').offset).toBe(0);
  });

  it('slideOpeningTo moves the opening to the rounded offset; an overlap is refused with its text', () => {
    withPlan({ openings: [D1, { ...W1, wallId: 'c1', offset: 80 }] });
    slideOpeningTo('d1', 30.4);
    expect(openingById('d1').offset).toBe(30);
    expect(useUiStore.getState().roomProblem).toBeNull();
    slideOpeningTo('d1', 70);
    expect(openingById('d1').offset).toBe(30);
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['opening-overlap']);
  });

  it('opening actions with nothing selected, or an unknown id, change nothing, the room problem included', () => {
    withPlan({ openings: [D1] });
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    expectNothingChanges(() => {
      slideSelectedOpening(1);
      updateSelectedOpening({ swing: 'out' });
      slideOpeningTo('nope', 30);
    });
    useUiStore.getState().selectOpening('nope');
    expectNothingChanges(() => {
      slideSelectedOpening(1);
      updateSelectedOpening({ swing: 'out' });
    });
  });

  it('updateSelectedOpening changes the selected door; a size that is not allowed is refused with its text', () => {
    withPlan({ openings: [D1] });
    useUiStore.getState().selectOpening('d1');
    updateSelectedOpening({ swing: 'out' });
    expect(openingById('d1')).toEqual({ ...D1, swing: 'out' });
    expect(useUiStore.getState().roomProblem).toBeNull();
    updateSelectedOpening({ width: 5 });
    expect(openingById('d1').width).toBe(32);
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['opening-size']);
    updateSelectedOpening({ hinge: 'end' });
    expect(openingById('d1')).toEqual({ ...D1, swing: 'out', hinge: 'end' });
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('addObstacleAtCentre adds a box at the seed room centre and selects it', () => {
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(NEW_ID);
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    addObstacleAtCentre('box');
    expect(uuid).toHaveBeenCalledTimes(1);
    expect(usePlanStore.getState().obstacles).toEqual([
      { id: NEW_ID, shape: 'box', label: 'Box', x: 72, y: 84, rotation: 0, width: 24, depth: 24, height: 36, elevation: 0 },
    ]);
    expect(useUiStore.getState()).toMatchObject({ selectedObstacleId: NEW_ID, roomProblem: null });
  });

  it('addObstacleAtCentre adds a column as tall as the room', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(NEW_ID);
    addObstacleAtCentre('cylinder');
    expect(obstacleById(NEW_ID)).toMatchObject({ shape: 'cylinder', label: 'Column', x: 72, y: 84, width: 12, depth: 12, height: 96 });
    expect(useUiStore.getState().selectedObstacleId).toBe(NEW_ID);
  });

  it('addObstacleAtCentre with 64 obstacles is refused with its text and selects nothing', () => {
    expect(CONFIG.maxObstacles).toBe(64);
    withPlan({ obstacles: Array.from({ length: 64 }, (_, i) => ({ ...BOX, id: `b${i}` })) });
    const before = usePlanStore.getState().obstacles;
    useUiStore.getState().selectObstacle('b3');
    addObstacleAtCentre('box');
    expect(usePlanStore.getState().obstacles).toBe(before);
    expect(useUiStore.getState().selectedObstacleId).toBe('b3');
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['too-many-obstacles']);
  });

  it('nudge, rotate and update the selected obstacle', () => {
    withPlan({ obstacles: [BOX] });
    useUiStore.getState().selectObstacle('b1');
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    nudgeSelectedObstacle(1, 0);
    expect(obstacleById('b1')).toMatchObject({ x: 41, y: 120 });
    expect(useUiStore.getState().roomProblem).toBeNull();
    rotateSelectedObstacle(15);
    expect(obstacleById('b1').rotation).toBe(15);
    rotateSelectedObstacle(350);
    expect(obstacleById('b1').rotation).toBe(5);
    updateSelectedObstacle({ elevation: 40 });
    expect(obstacleById('b1')).toEqual({ ...BOX, x: 41, rotation: 5, elevation: 40 });
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('updateSelectedObstacle with a size that is not allowed is refused with its text', () => {
    withPlan({ obstacles: [BOX] });
    useUiStore.getState().selectObstacle('b1');
    updateSelectedObstacle({ width: 0 });
    expect(obstacleById('b1')).toEqual(BOX);
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['obstacle-size']);
  });

  it('rotating a column is allowed', () => {
    withPlan({ obstacles: [COLUMN] });
    useUiStore.getState().selectObstacle('col');
    rotateSelectedObstacle(15);
    expect(obstacleById('col')).toEqual({ ...COLUMN, rotation: 15 });
  });

  it('editing one obstacle never moves another left outside the room by an outline edit', () => {
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    addObstacleAtCentre('box');
    const boxId = req(usePlanStore.getState().obstacles[0], 'the box').id;
    expect(obstacleById(boxId)).toMatchObject({ x: 72, y: 84 });
    for (let i = 0; i < 4; i++) nudgeSelectedObstacle(12, 0);
    expect(obstacleById(boxId)).toMatchObject({ x: 120, y: 84 });
    expect(usePlanStore.getState().applyOutline(setRectangleSize(usePlanStore.getState().room.outline, { w: 108 }))).toBeNull();

    const expectBoxLeftOutside = (step: string): void => {
      expect(obstacleById(boxId), step).toMatchObject({ x: 120, y: 84 });
      const { items, room, openings, obstacles } = usePlanStore.getState();
      expect(findPlanIssues(items, room, openings, obstacles).conflicts[boxId], step).toBe('Outside the room');
    };
    expectBoxLeftOutside('after the outline edit');
    addObstacleAtCentre('cylinder');
    const columnId = req(useUiStore.getState().selectedObstacleId ?? undefined, 'the column');
    expect(columnId).not.toBe(boxId);
    expectBoxLeftOutside('after adding a column');
    updateSelectedObstacle({ label: 'Pillar' });
    expectBoxLeftOutside('after relabelling the column');
    updateSelectedObstacle({ width: 20 });
    expectBoxLeftOutside('after resizing the column');
    rotateSelectedObstacle(15);
    expectBoxLeftOutside('after rotating the column');
    expect(obstacleById(columnId)).toMatchObject({ label: 'Pillar', width: 20, depth: 20, rotation: 15 });
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('dragObstacleTo moves the obstacle onto the grid and clears the room problem', () => {
    withPlan({ obstacles: [BOX] });
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    dragObstacleTo('b1', 30.4, 50.6);
    expect(obstacleById('b1')).toMatchObject({ x: 30, y: 51 });
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('obstacle actions with nothing selected, or an unknown id, change nothing, the room problem included', () => {
    withPlan({ obstacles: [BOX] });
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    const run = (): void => {
      nudgeSelectedObstacle(1, 0);
      rotateSelectedObstacle(15);
      updateSelectedObstacle({ elevation: 40 });
      dragObstacleTo('nope', 30, 50);
    };
    expectNothingChanges(run);
    useUiStore.getState().selectObstacle('nope');
    expectNothingChanges(run);
  });

  it('removeSelectedRoomThing removes the selected opening and clears its selection', () => {
    withPlan({ openings: [D1, W1] });
    useUiStore.getState().selectOpening('d1');
    removeSelectedRoomThing();
    expect(usePlanStore.getState().openings).toEqual([W1]);
    expect(useUiStore.getState().selectedOpeningId).toBeNull();
  });

  it('removeSelectedRoomThing removes the selected obstacle and clears its selection', () => {
    withPlan({ obstacles: [BOX, COLUMN] });
    useUiStore.getState().selectObstacle('b1');
    removeSelectedRoomThing();
    expect(usePlanStore.getState().obstacles).toEqual([COLUMN]);
    expect(useUiStore.getState().selectedObstacleId).toBeNull();
  });

  it('removeSelectedRoomThing removes the selected corner and clears its selection', () => {
    useUiStore.getState().selectCorner('c2');
    removeSelectedRoomThing();
    expect(usePlanStore.getState().room.outline.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
    expect(useUiStore.getState().selectedCornerId).toBeNull();
  });

  it('removeSelectedRoomThing with nothing selected, or an unknown id selected, changes nothing', () => {
    withPlan({ openings: [D1], obstacles: [BOX] });
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    expectNothingChanges(removeSelectedRoomThing);
    useUiStore.getState().selectOpening('nope');
    expectNothingChanges(removeSelectedRoomThing);
    useUiStore.getState().selectObstacle('nope');
    expectNothingChanges(removeSelectedRoomThing);
  });

  it('removeSelectedRoomThing on a corner beside a door is refused with its text and keeps the selection', () => {
    withPlan({ openings: [D1] });
    useUiStore.getState().selectCorner('c2');
    removeSelectedRoomThing();
    expect(usePlanStore.getState().room.outline).toHaveLength(4);
    expect(useUiStore.getState().selectedCornerId).toBe('c2');
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['corner-has-openings']);
  });
});

describe('wall slide and length actions', () => {
  const c = (id: string, x: number, y: number): Corner => ({ id, x, y });
  const R: Corner[] = [c('c1', 0, 0), c('c2', 144, 0), c('c3', 144, 168), c('c4', 0, 168)];
  const T: Corner[] = [c('c1', 0, 0), c('m1', 48, 0), c('m2', 96, 0), c('c2', 144, 0), c('c3', 144, 168), c('c4', 0, 168)];
  /** U with the step 6.4 in deep instead of 24 in. */
  const U_SHALLOW: Corner[] = [
    c('c1', 0, 0), c('x1', 48, 0), c('m1', 48, 6.4), c('x2', 96, 6.4), c('m2', 96, 0), c('c2', 144, 0), c('c3', 144, 168), c('c4', 0, 168),
  ];
  const Q: Corner[] = [c('q1', 0, 0), c('q2', 100, 0), c('q3', 150, 50), c('q4', 150, 150), c('q5', 0, 150)];

  function withRoom(outline: Corner[], fields: Partial<PlanDocument> = {}): void {
    const doc = furnishedDocument();
    usePlanStore.getState().reset({ ...doc, room: { ...doc.room, outline }, ...fields });
  }

  function outline(): Corner[] {
    return usePlanStore.getState().room.outline;
  }

  function corner(id: string): Corner | undefined {
    return outline().find((k) => k.id === id);
  }

  /** Runs `edit` and asserts both stores are the very same state objects afterwards. */
  function expectNothingChanges(edit: () => void): void {
    const plan = usePlanStore.getState();
    const ui = useUiStore.getState();
    edit();
    expect(usePlanStore.getState()).toBe(plan);
    expect(useUiStore.getState()).toBe(ui);
  }

  beforeEach(() => {
    useUiStore.getState().setMode('room');
  });

  it('a slide follows the snapshot, snapped to the grid, and returns to the start', () => {
    withRoom(R);
    const s = req(startWallSlide('c1') ?? undefined, 'a slide');
    expect(s.wallId).toBe('c1');
    expect(s.outline).toEqual(R);
    expect(s.stops).toEqual([168]);
    // The normal is (−u.y, u.x), so its x is −0 here; `+ 0` turns it into 0, which toEqual tells apart from −0.
    expect({ x: s.normal.x + 0, y: s.normal.y }).toEqual({ x: 0, y: 1 });
    expect(s.ids.start).not.toBe(s.ids.end);
    slideWallTo(s, 11.6);
    expect(corner('c1')).toEqual(c('c1', 0, 12));
    expect(corner('c2')).toEqual(c('c2', 144, 12));
    slideWallTo(s, 3.2);
    expect(corner('c1')).toEqual(c('c1', 0, 3));
    expect(corner('c2')).toEqual(c('c2', 144, 3));
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    slideWallTo(s, 0.2);
    expect(outline()).toEqual(R);
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('a step made and removed within one slide keeps the slide ids', () => {
    withRoom(T);
    const s = req(startWallSlide('m1') ?? undefined, 'a slide');
    slideWallTo(s, 24);
    const stepped = outline();
    expect(stepped).toHaveLength(8);
    expect(stepped.map((k) => k.id)).toEqual(expect.arrayContaining([s.ids.start, s.ids.end]));
    slideWallTo(s, 0);
    expect(outline()).toEqual(T);
    slideWallTo(s, 24);
    expect(outline()).toEqual(stepped);
  });

  it('a refused step keeps the last result and shows the reason; a following slide clears it', () => {
    withRoom(R);
    const s = req(startWallSlide('c1') ?? undefined, 'a slide');
    slideWallTo(s, 12);
    const at12 = usePlanStore.getState().room;
    expect(at12.outline).toEqual([c('c1', 0, 12), c('c2', 144, 12), c('c3', 144, 168), c('c4', 0, 168)]);
    slideWallTo(s, 165);
    expect(usePlanStore.getState().room).toBe(at12);
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['short-wall']);
    slideWallTo(s, 20);
    expect(corner('c1')).toEqual(c('c1', 0, 20));
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('a stop is magnetic', () => {
    withRoom(Q);
    const s = req(startWallSlide('q1') ?? undefined, 'a slide');
    slideWallTo(s, 49.7);
    expect(outline()).toHaveLength(4);
    expect(corner('q1')).toEqual(c('q1', 0, 50));
  });

  it('doors and windows follow a slide that makes a step', () => {
    const door: Door = { id: 'd1', kind: 'door', wallId: 'm1', offset: 8, width: 32, height: 80, hinge: 'start', swing: 'in' };
    const win: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c1', offset: 4, width: 36, sill: 24, height: 48 };
    withRoom(T, { openings: [door, win] });
    slideWallTo(req(startWallSlide('m1') ?? undefined, 'a slide'), 24);
    expect(outline()).toHaveLength(8);
    expect(useUiStore.getState().roomProblem).toBeNull();
    expect(usePlanStore.getState().openings).toEqual([door, win]);
  });

  it('a door on the neighbouring wall keeps its place in the room when the slide moves that wall\'s start', () => {
    const door: Door = { id: 'd1', kind: 'door', wallId: 'c2', offset: 100, width: 32, height: 80, hinge: 'start', swing: 'in' };
    withRoom(R, { openings: [door] });
    slideWallTo(req(startWallSlide('c1') ?? undefined, 'a slide'), 60);
    expect(outline()).toEqual([c('c1', 0, 60), c('c2', 144, 60), c('c3', 144, 168), c('c4', 0, 168)]);
    expect(usePlanStore.getState().openings).toEqual([{ ...door, offset: 40 }]);
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('a slide that would push a door on the neighbouring wall past its start is refused', () => {
    const door: Door = { id: 'd1', kind: 'door', wallId: 'c2', offset: 100, width: 32, height: 80, hinge: 'start', swing: 'in' };
    withRoom(R, { openings: [door] });
    const before = usePlanStore.getState().room;
    slideWallTo(req(startWallSlide('c1') ?? undefined, 'a slide'), 110);
    expect(usePlanStore.getState().room).toBe(before);
    expect(outline()).toEqual(R);
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['opening-off-wall']);
    expect(usePlanStore.getState().openings).toEqual([door]);
  });

  it('a slide does not move furniture; an item left outside is reported', () => {
    const chair: Item = {
      id: 'chair', kind: 'chair', name: 'Chair', host: 'shop.example', sourceUrl: null, price: null,
      w: 20, d: 16, h: 30, x: 72, y: 10, angle: 0, model: { tier: 'box', label: 'Box', assetUrl: null },
    };
    withRoom(R, { items: [chair] });
    expect(findConflicts(usePlanStore.getState().items, usePlanStore.getState().room).chair).toBeUndefined();
    slideWallTo(req(startWallSlide('c1') ?? undefined, 'a slide'), 40);
    expect(corner('c1')).toEqual(c('c1', 0, 40));
    expect(itemById('chair')).toEqual(chair);
    expect(findConflicts(usePlanStore.getState().items, usePlanStore.getState().room).chair).toBe('Outside the room');
  });

  it('startWallSlide on an unknown wall gives null', () => {
    withRoom(R);
    expect(startWallSlide('zz')).toBeNull();
  });

  it('slideSelectedWallToward slides the selected wall by the step, either way', () => {
    withRoom(R);
    useUiStore.getState().selectWall('c1');
    slideSelectedWallToward({ x: 0, y: 1 }, 1);
    expect(corner('c1')).toEqual(c('c1', 0, 1));
    expect(corner('c2')).toEqual(c('c2', 144, 1));
    slideSelectedWallToward({ x: 0, y: -1 }, 12);
    expect(corner('c1')).toEqual(c('c1', 0, -11));
    expect(corner('c2')).toEqual(c('c2', 144, -11));
    expect(useUiStore.getState().selectedWallId).toBe('c1');
  });

  it('slideSelectedWallToward along the wall changes nothing, the room problem included', () => {
    withRoom(R);
    useUiStore.getState().selectWall('c1');
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    expectNothingChanges(() => slideSelectedWallToward({ x: 1, y: 0 }, 1));
  });

  it('slideSelectedWallToward stops at a stop nearer than the step', () => {
    withRoom(U_SHALLOW);
    useUiStore.getState().selectWall('m1');
    slideSelectedWallToward({ x: 0, y: -1 }, 12);
    expect(outline()).toEqual(T);
  });

  it('slideSelectedWallToward with no wall, or an unknown wall, selected changes nothing', () => {
    withRoom(R);
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    expectNothingChanges(() => slideSelectedWallToward({ x: 0, y: 1 }, 1));
    useUiStore.getState().selectWall('zz');
    expectNothingChanges(() => slideSelectedWallToward({ x: 0, y: 1 }, 1));
  });

  it('setWallLengthTo moves the end the length anchor names', () => {
    withRoom(R);
    useUiStore.getState().setLengthAnchor('start');
    expect(setWallLengthTo('c1', 120)).toBe(true);
    expect(outline()).toEqual([c('c1', 24, 0), c('c2', 144, 0), c('c3', 144, 168), c('c4', 24, 168)]);
    expect(useUiStore.getState().roomProblem).toBeNull();
  });

  it('setWallLengthTo refuses a length too short or too large with its reason', () => {
    withRoom(R);
    const before = usePlanStore.getState().room;
    expect(setWallLengthTo('c1', 5)).toBe(false);
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['short-wall']);
    expect(setWallLengthTo('c1', 721)).toBe(false);
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['too-large']);
    expect(usePlanStore.getState().room).toBe(before);
  });

  it('setWallLengthTo refuses a length above the room limit even where the room would fit', () => {
    // a1 → a2 is a diagonal 565.69 in long; at 721 in its end lands at (509.83, 509.83), inside 600 × 600.
    withRoom([c('a1', 0, 0), c('a2', 400, 400), c('a3', 600, 600), c('a4', 0, 600)]);
    const before = usePlanStore.getState().room;
    expect(setWallLengthTo('a1', 721)).toBe(false);
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['too-large']);
    expect(usePlanStore.getState().room).toBe(before);
  });

  it('setWallLengthTo on an unknown wall changes nothing, the room problem included', () => {
    withRoom(R);
    useUiStore.getState().setRoomProblem('Walls cannot cross.');
    expectNothingChanges(() => expect(setWallLengthTo('zz', 100)).toBe(false));
  });

  describe('which edits keep a door in its place in the room', () => {
    const door = (wallId: string, offset: number): Door => ({ id: 'd1', kind: 'door', wallId, offset, width: 32, height: 80, hinge: 'start', swing: 'in' });
    const NO_SNAP = { angleSnap: false, toleranceIn: 2 };

    it('a wall slide keeps a door on the neighbouring wall in place', () => {
      withRoom(R, { openings: [door('c1', 56)] });
      slideWallTo(req(startWallSlide('c4') ?? undefined, 'a slide'), 24);
      expect(corner('c1')).toEqual(c('c1', 24, 0));
      expect(corner('c4')).toEqual(c('c4', 24, 168));
      expect(usePlanStore.getState().openings).toEqual([door('c1', 32)]);
    });

    it('a typed length keeps it in place', () => {
      withRoom(R, { openings: [door('c1', 56)] });
      useUiStore.getState().setLengthAnchor('start');
      expect(setWallLengthTo('c1', 120)).toBe(true);
      expect(usePlanStore.getState().openings).toEqual([door('c1', 32)]);
    });

    it('the rectangle width field keeps it in place', () => {
      withRoom(R, { openings: [door('c3', 60)] });
      expect(usePlanStore.getState().applyOutline(setRectangleSize(outline(), { w: 120 }))).toBeNull();
      expect(usePlanStore.getState().openings).toEqual([door('c3', 36)]);
    });

    it('a corner move keeps the door\'s offset from its wall\'s start', () => {
      withRoom(R, { openings: [door('c1', 56)] });
      expect(usePlanStore.getState().applyOutline(moveCorner(outline(), 'c1', { x: 10, y: 0 }))).toBeNull();
      expect(corner('c1')).toEqual(c('c1', 10, 0));
      expect(usePlanStore.getState().openings).toEqual([door('c1', 56)]);
    });

    it('a corner dragged away and back leaves the door where it was', () => {
      withRoom(R, { openings: [door('c1', 56)] });
      dragCornerTo('c1', { x: 10, y: 0 }, NO_SNAP);
      dragCornerTo('c1', { x: 10, y: 20 }, NO_SNAP);
      dragCornerTo('c1', { x: 0, y: 0 }, NO_SNAP);
      expect(outline()).toEqual(R);
      expect(usePlanStore.getState().openings).toEqual([door('c1', 56)]);
    });
  });
});
