import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoomSection } from '../components/Sidebar/RoomSection';
import { CONFIG } from '../config';
import { createMockProductLookup } from '../services/mockProductLookup';
import {
  addCornerOnWall,
  dragCornerTo,
  nudgeSelected,
  placePreview,
  removeSelectedCorner,
  rotateSelected,
  setWallLengthTo,
  slideWallTo,
  startWallSlide,
} from '../state/actions';
import { ROOM_PROBLEM_TEXT, type RoomProblem, usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { addObstacle, newObstacle, updateObstacle } from './obstacles';
import { addOpening, slideOpening, updateOpening } from './openings';
import { setRectangleSize, setWallLength, wallsOf } from './outline';
import { parsePlan } from './planSchema';
import { interiorPoint } from './polygon';
import { roomBounds } from './shape';
import type { PlanDocument, Point, ProductPreview } from './types';

/**
 * Every kind of edit the planner offers, made through the real stores and actions from the seeded
 * plan, must leave a document that `parsePlan` reads back after a JSON round trip, as the browser
 * store would on the next visit. A refusal there discards the visitor's whole plan.
 */

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

const NO_SNAP = { angleSnap: false, toleranceIn: 2 };
const LONG_LINK = `https://market.example/${'p'.repeat(3000 - 23)}`;

const BOX: ProductPreview = {
  kind: 'box',
  name: 'n'.repeat(500),
  host: 'market.example',
  sourceUrl: LONG_LINK,
  price: null,
  w: 36,
  d: 24,
  h: 30,
  known: false,
  model: { tier: 'box', label: 'No model, shown as a sized box', assetUrl: null },
};

function currentDocument(): PlanDocument {
  const s = usePlanStore.getState();
  return { schemaVersion: s.schemaVersion, units: s.units, room: s.room, items: s.items, openings: s.openings, obstacles: s.obstacles };
}

/** Asserts that the current document survives a JSON round trip through parsePlan. */
function expectReadable(step: string): void {
  const result = parsePlan(JSON.parse(JSON.stringify(currentDocument())));
  expect(result.ok, `${step}: ${result.ok ? '' : result.reason}`).toBe(true);
}

/**
 * expectReadable, and also: the doors, windows and obstacles read back exactly as stored (so every
 * stored number was already rounded to 0.01), and every obstacle centre is within ±CONFIG.coordMax.
 */
function expectExact(step: string): void {
  expectReadable(step);
  const doc = currentDocument();
  const result = parsePlan(JSON.parse(JSON.stringify(doc)));
  if (!result.ok) return;
  expect(result.doc.openings, step).toEqual(doc.openings);
  expect(result.doc.obstacles, step).toEqual(doc.obstacles);
  for (const o of doc.obstacles) {
    const inRange = Math.abs(o.x) <= CONFIG.coordMax && Math.abs(o.y) <= CONFIG.coordMax;
    expect(inRange, `${step}: centre of ${o.id} within ±${CONFIG.coordMax}`).toBe(true);
  }
}

/** Asserts that obstacle `id`'s centre is inside the room's bounding box, as a drag or nudge keeps it. */
function expectInRoomBounds(id: string, step: string): void {
  const { room, obstacles } = usePlanStore.getState();
  const o = obstacles.find((k) => k.id === id);
  if (o === undefined) throw new Error(`expected obstacle ${id}`);
  const b = roomBounds(room);
  const inside = o.x >= b.minX && o.x <= b.maxX && o.y >= b.minY && o.y <= b.maxY;
  expect(inside, `${step}: centre of ${id} inside the room bounds`).toBe(true);
}

/** Adds a door or window through the store, as the planner will. */
function placeOpening(kind: 'door' | 'window', wallId: string, at: Point, id: string): RoomProblem | null {
  const { room, openings, applyOpenings } = usePlanStore.getState();
  return applyOpenings(addOpening(room.outline, openings, kind, wallId, at, id));
}

/** Adds a box or column through the store, as the planner will. */
function placeObstacle(shape: 'box' | 'cylinder', at: Point, id: string): RoomProblem | null {
  const { room, obstacles, applyObstacles } = usePlanStore.getState();
  return applyObstacles(addObstacle(obstacles, newObstacle(shape, at, room.height, id)));
}

function slide(id: string, offset: number): RoomProblem | null {
  const { room, openings, applyOpenings } = usePlanStore.getState();
  return applyOpenings(slideOpening(room.outline, openings, id, offset));
}

function changeOpening(id: string, patch: Parameters<typeof updateOpening>[3]): RoomProblem | null {
  const { room, openings, applyOpenings } = usePlanStore.getState();
  return applyOpenings(updateOpening(room.outline, openings, id, patch));
}

function changeObstacle(id: string, patch: Parameters<typeof updateObstacle>[2]): RoomProblem | null {
  const { obstacles, applyObstacles } = usePlanStore.getState();
  return applyObstacles(updateObstacle(obstacles, id, patch));
}

/** The middle of each wall of the current outline, by wall id. */
function wallMiddles(): [string, Point][] {
  return wallsOf(usePlanStore.getState().room.outline).map((w) => [w.id, { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }]);
}

function corner(id: string): { x: number; y: number } {
  const c = usePlanStore.getState().room.outline.find((k) => k.id === id);
  if (c === undefined) throw new Error(`expected corner ${id}`);
  return c;
}

/** Places `preview` through the lookup flow: preview state, then Place in room. */
function place(preview: ProductPreview): void {
  useUiStore.getState().setLookup({ status: 'preview', product: preview });
  placePreview();
}

describe('every edit leaves a plan that parsePlan reads back', () => {
  it('starts readable', () => {
    expect(LONG_LINK).toHaveLength(3000);
    expectReadable('seeded plan');
  });

  it('item edits: move, nudge, rotate and set angle', () => {
    useUiStore.getState().select('seed-bed');
    usePlanStore.getState().moveItemTo('seed-bed', 1e6, -1e6);
    expectReadable('move far');
    nudgeSelected(-1e6, 1e6);
    expectReadable('nudge far');
    rotateSelected();
    expectReadable('rotate');
    rotateSelected(1e307);
    expectReadable('rotate by a huge angle');
    usePlanStore.getState().setItemAngle('seed-bed', 123.456);
    expectReadable('set angle');
    usePlanStore.getState().setItemAngle('seed-bed', -1e307);
    expectReadable('set a huge negative angle');
  });

  it('adding an item from a preview with a 3000-character link and a 500-character name', async () => {
    place(BOX);
    expectReadable('place a hand-made preview');
    const looked = await createMockProductLookup({ delayMs: 0 }).lookup(`${LONG_LINK.slice(0, -500)}/${'n'.repeat(499)}`);
    place(looked);
    expectReadable('place a looked-up preview');
    expect(usePlanStore.getState().items).toHaveLength(4);
  });

  it('adding items up to and past the cap', () => {
    while (usePlanStore.getState().items.length < CONFIG.maxItems) {
      place({ ...BOX, name: 'Box', sourceUrl: 'https://market.example/box' });
      expectReadable(`add item ${usePlanStore.getState().items.length}`);
    }
    place({ ...BOX, name: 'One too many', sourceUrl: 'https://market.example/box' });
    expectReadable('add past the cap');
    usePlanStore.getState().addItem({ ...BOX, name: 'Box', sourceUrl: null as unknown as string });
    expectReadable('addItem past the cap');
    expect(usePlanStore.getState().items).toHaveLength(CONFIG.maxItems);
  });

  it.each([
    ['right', 1, 0], ['left', -1, 0], ['down', 0, 1], ['up', 0, -1],
  ] as const)('dragging corners %s repeatedly until refused, then moving an item that way', (_dir, sx, sy) => {
    useUiStore.getState().setMode('room');
    const leading = sx > 0 ? ['c2', 'c3'] : sx < 0 ? ['c1', 'c4'] : sy > 0 ? ['c3', 'c4'] : ['c1', 'c2'];
    const order = [...leading, ...['c1', 'c2', 'c3', 'c4'].filter((id) => !leading.includes(id))];
    let refused = false;
    for (let round = 0; round < 20 && !refused; round++) {
      for (const id of order) {
        const c = corner(id);
        dragCornerTo(id, { x: c.x + sx * 400, y: c.y + sy * 400 }, NO_SNAP);
        expectReadable(`drag ${id} round ${round}`);
        if (useUiStore.getState().roomProblem !== null) {
          refused = true;
          break;
        }
      }
    }
    expect(refused).toBe(true);
    useUiStore.getState().setMode('furnish');
    usePlanStore.getState().moveItemTo('seed-bed', sx * 1e6, sy * 1e6);
    expectReadable('move an item after the walk');
    useUiStore.getState().select('seed-desk');
    nudgeSelected(sx * 1e6, sy * 1e6);
    expectReadable('nudge an item after the walk');
  });

  it('inserting and removing a corner', () => {
    useUiStore.getState().setMode('room');
    addCornerOnWall('c1', { x: 72, y: 0 });
    expectReadable('insert a corner');
    expect(usePlanStore.getState().room.outline).toHaveLength(5);
    removeSelectedCorner();
    expectReadable('remove a corner');
    expect(usePlanStore.getState().room.outline).toHaveLength(4);
  });

  it('setting a wall length, including one that would take the room past the limits', () => {
    const { applyOutline } = usePlanStore.getState();
    const first = wallsOf(usePlanStore.getState().room.outline)[0];
    applyOutline(setWallLength(usePlanStore.getState().room.outline, first.id, 300));
    expectReadable('set a wall length');
    applyOutline(setWallLength(usePlanStore.getState().room.outline, first.id, 5000));
    expectReadable('set a wall length past the room limit');
  });

  it('each starting shape, after the room was moved', () => {
    useUiStore.getState().setMode('room');
    for (const id of ['c2', 'c3', 'c1', 'c4']) {
      const c = corner(id);
      dragCornerTo(id, { x: c.x + 500, y: c.y }, NO_SNAP);
    }
    expectReadable('move the room');
    render(createElement(RoomSection));
    for (const name of ['L-shape', 'Notched', 'Rectangle']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expectReadable(`starting shape ${name}`);
    }
  });

  it('a door, a window, a box and a column survive a JSON round trip unchanged', () => {
    const { room } = usePlanStore.getState();
    const door = addOpening(room.outline, [], 'door', 'c1', { x: 36, y: 0 }, 'door-1');
    if (!door.ok) throw new Error(`door refused: ${door.problem}`);
    const both = addOpening(room.outline, door.openings, 'window', 'c2', { x: 144, y: 118 }, 'window-1');
    if (!both.ok) throw new Error(`window refused: ${both.problem}`);
    const box = addObstacle([], newObstacle('box', { x: 40.004, y: 120 }, room.height, 'box-1'));
    if (!box.ok) throw new Error(`box refused: ${box.problem}`);
    const all = addObstacle(box.obstacles, newObstacle('cylinder', { x: 100, y: 100 }, room.height, 'column-1'));
    if (!all.ok) throw new Error(`column refused: ${all.problem}`);
    usePlanStore.setState({ openings: both.openings, obstacles: all.obstacles });
    expect(currentDocument().openings.map((o) => o.kind)).toEqual(['door', 'window']);
    expect(currentDocument().obstacles.map((o) => o.shape)).toEqual(['box', 'cylinder']);
    expectReadable('a door, a window, a box and a column');
    expect(parsePlan(JSON.parse(JSON.stringify(currentDocument())))).toEqual({ ok: true, doc: currentDocument() });
  });

  it('units and ceiling height', () => {
    usePlanStore.getState().setUnits('m');
    expectReadable('units m');
    usePlanStore.getState().setUnits('ft');
    expectReadable('units ft');
    usePlanStore.getState().setRoomHeight(CONFIG.roomMin);
    expectReadable('lowest ceiling');
    usePlanStore.getState().setRoomHeight(CONFIG.roomMax);
    expectReadable('highest ceiling');
  });

  it('doors and windows: add, slide, update and remove', () => {
    expect(placeOpening('door', 'c1', { x: 36, y: 0 }, 'door-1')).toBeNull();
    expectExact('add a door');
    expect(placeOpening('window', 'c2', { x: 144, y: 118 }, 'window-1')).toBeNull();
    expectExact('add a window');
    expect(slide('door-1', 1e6)).toBeNull();
    expectExact('slide a door to the wall end');
    expect(slide('door-1', -1e6)).toBeNull();
    expectExact('slide a door to the wall start');
    expect(slide('window-1', 0.4)).toBeNull();
    expectExact('slide a window by a fraction');
    expect(slide('door-1', Number.NaN)).toBe('opening-size');
    expectExact('slide to a number that is not finite');
    expect(changeOpening('door-1', { width: 40.005, height: 239.999, hinge: 'end', swing: 'out' })).toBeNull();
    expectExact('update a door');
    expect(changeOpening('window-1', { width: 12.004, sill: 100.123, height: 50.555 })).toBeNull();
    expectExact('update a window');
    expect(changeOpening('door-1', { width: 1e6 })).toBe('opening-size');
    expectExact('a door too wide');
    usePlanStore.getState().removeOpening('door-1');
    expectExact('remove a door');
    usePlanStore.getState().removeOpening('window-1');
    expectExact('remove a window');
    expect(usePlanStore.getState().openings).toEqual([]);
  });

  it('obstacles: add, move, nudge, update and remove a box and a column', () => {
    const centre = interiorPoint(usePlanStore.getState().room.outline);
    expect(placeObstacle('box', centre, 'box-1')).toBeNull();
    expectExact('add a box');
    expect(placeObstacle('cylinder', centre, 'column-1')).toBeNull();
    expectExact('add a column');
    const s = usePlanStore.getState();
    s.moveObstacleTo('box-1', 1e6, -1e6);
    expectExact('move a box far');
    expectInRoomBounds('box-1', 'move a box far');
    s.moveObstacleBy('box-1', -1e6, 1e6);
    expectExact('nudge a box far');
    expectInRoomBounds('box-1', 'nudge a box far');
    s.moveObstacleTo('column-1', 30.4, 50.6);
    expectExact('move a column');
    s.moveObstacleBy('column-1', 0.004, -0.006);
    expectExact('nudge a column by less than a hundredth');
    expect(changeObstacle('box-1', { label: 'L'.repeat(40), rotation: 123.456, width: 240, depth: 33.333, height: 720, elevation: 719.999 })).toBeNull();
    expectExact('update a box');
    s.moveObstacleTo('box-1', 1e6, 1e6);
    expectExact('move a turned box far');
    expectInRoomBounds('box-1', 'move a turned box far');
    s.moveObstacleBy('box-1', -0.333, -0.333);
    expectExact('nudge a turned box');
    expect(changeObstacle('box-1', { rotation: 1e307 })).toBeNull();
    expectExact('turn a box by a huge angle');
    expect(changeObstacle('box-1', { label: 'L'.repeat(41) })).toBe('obstacle-size');
    expectExact('a label too long');
    expect(changeObstacle('column-1', { width: 33.335, depth: 2 })).toBeNull();
    expectExact('update a column');
    expect(placeObstacle('box', { x: 1e6, y: -1e6 }, 'box-far')).toBeNull();
    expectExact('add a box far outside the room');
    expect(usePlanStore.getState().obstacles.find((o) => o.id === 'box-far')).toMatchObject({ x: 1440, y: -1440 });
    expect(placeObstacle('cylinder', { x: -1e6, y: 1e6 }, 'column-far')).toBeNull();
    expectExact('add a column far outside the room');
    expect(placeObstacle('box', { x: Number.POSITIVE_INFINITY, y: 0 }, 'box-infinite')).toBe('obstacle-size');
    expectExact('add a box at an infinite x');
    expect(placeObstacle('box', { x: 0, y: Number.NaN }, 'box-nan')).toBe('obstacle-size');
    expectExact('add a box at a y that is not a number');
    s.setRoomHeight(2.45 / 0.0254);
    expect(placeObstacle('cylinder', centre, 'column-2')).toBeNull();
    expectExact('add a column under a 2.45 m ceiling');
    for (const id of ['box-1', 'column-1', 'box-far', 'column-far', 'column-2']) {
      usePlanStore.getState().removeObstacle(id);
      expectExact(`remove ${id}`);
    }
    expect(usePlanStore.getState().obstacles).toEqual([]);
  });

  it('an obstacle left outside the room by an outline edit stays where it is while another is edited', () => {
    const centre = interiorPoint(usePlanStore.getState().room.outline);
    expect(placeObstacle('box', centre, 'box-1')).toBeNull();
    usePlanStore.getState().moveObstacleBy('box-1', 48, 0);
    expect(usePlanStore.getState().applyOutline(setRectangleSize(usePlanStore.getState().room.outline, { w: 108 }))).toBeNull();
    expectExact('a box left outside the room');
    const before = usePlanStore.getState().obstacles.find((o) => o.id === 'box-1');
    expect(before).toMatchObject({ x: 120, y: 84 });
    expect(placeObstacle('cylinder', interiorPoint(usePlanStore.getState().room.outline), 'column-1')).toBeNull();
    expectExact('add a column beside it');
    expect(changeObstacle('column-1', { label: 'Pillar', width: 20, rotation: 15 })).toBeNull();
    expectExact('edit the column beside it');
    expect(usePlanStore.getState().obstacles.find((o) => o.id === 'box-1')).toEqual(before);
  });

  it.each([
    ['right', 1, 0], ['left', -1, 0], ['down', 0, 1], ['up', 0, -1],
  ] as const)('with a door on every wall, dragging corners %s repeatedly until refused', (_dir, sx, sy) => {
    for (const [wallId, at] of wallMiddles()) expect(placeOpening('door', wallId, at, `door-${wallId}`)).toBeNull();
    expectExact('a door on every wall');
    useUiStore.getState().setMode('room');
    const leading = sx > 0 ? ['c2', 'c3'] : sx < 0 ? ['c1', 'c4'] : sy > 0 ? ['c3', 'c4'] : ['c1', 'c2'];
    const order = [...leading, ...['c1', 'c2', 'c3', 'c4'].filter((id) => !leading.includes(id))];
    let refused = false;
    for (let round = 0; round < 20 && !refused; round++) {
      for (const id of order) {
        const c = corner(id);
        dragCornerTo(id, { x: c.x + sx * 400, y: c.y + sy * 400 }, NO_SNAP);
        expectExact(`drag ${id} round ${round}`);
        if (useUiStore.getState().roomProblem !== null) {
          refused = true;
          break;
        }
      }
    }
    expect(refused).toBe(true);
    expect(usePlanStore.getState().openings).toHaveLength(4);
  });

  it('with doors on the wall, inserting and removing a corner', () => {
    useUiStore.getState().setMode('room');
    expect(placeOpening('door', 'c1', { x: 26, y: 0 }, 'door-left')).toBeNull();
    expect(placeOpening('door', 'c1', { x: 110, y: 0 }, 'door-right')).toBeNull();
    expectExact('two doors on the top wall');
    addCornerOnWall('c1', { x: 72, y: 0 });
    expect(useUiStore.getState().roomProblem).toBeNull();
    expectExact('insert a corner between the doors');
    const added = usePlanStore.getState().room.outline[1].id;
    expect(usePlanStore.getState().openings.map((o) => [o.id, o.wallId, o.offset])).toEqual([
      ['door-left', 'c1', 10], ['door-right', added, 22],
    ]);
    addCornerOnWall('c1', { x: 26, y: 0 });
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['corner-in-opening']);
    expectExact('insert a corner inside a door');
    useUiStore.getState().selectCorner(added);
    removeSelectedCorner();
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['corner-has-openings']);
    expectExact('remove a corner beside a door');
    usePlanStore.getState().removeOpening('door-left');
    usePlanStore.getState().removeOpening('door-right');
    removeSelectedCorner();
    expect(useUiStore.getState().roomProblem).toBeNull();
    expectExact('remove the corner once the doors are gone');
    expect(usePlanStore.getState().room.outline).toHaveLength(4);
  });

  it('with a door on the wall, setting its length, including past the room limit and below the door', () => {
    expect(placeOpening('door', 'c1', { x: 72, y: 0 }, 'door-1')).toBeNull();
    const length = (inches: number) =>
      usePlanStore.getState().applyOutline(setWallLength(usePlanStore.getState().room.outline, 'c1', inches));
    expect(length(300)).toBeNull();
    expectExact('set a wall length');
    expect(length(5000)).toBe('too-large');
    expectExact('set a wall length past the room limit');
    expect(length(80)).toBe('opening-off-wall');
    expectExact('set a wall length shorter than the door needs');
    expect(usePlanStore.getState().openings).toHaveLength(1);
  });

  it('with a door, each starting shape after the room was moved is refused; without one, accepted', () => {
    expect(placeOpening('door', 'c1', { x: 72, y: 0 }, 'door-1')).toBeNull();
    useUiStore.getState().setMode('room');
    for (const id of ['c2', 'c3', 'c1', 'c4']) {
      const c = corner(id);
      dragCornerTo(id, { x: c.x + 500, y: c.y }, NO_SNAP);
    }
    expect(useUiStore.getState().roomProblem).toBeNull();
    expectExact('move the room with a door');
    render(createElement(RoomSection));
    for (const name of ['L-shape', 'Notched', 'Rectangle']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['shape-has-openings']);
      expectExact(`starting shape ${name} with a door`);
    }
    act(() => usePlanStore.getState().removeOpening('door-1'));
    for (const name of ['L-shape', 'Notched', 'Rectangle']) {
      fireEvent.click(screen.getByRole('button', { name }));
      expect(useUiStore.getState().roomProblem).toBeNull();
      expectExact(`starting shape ${name} without a door`);
    }
  });

  it('adding doors, windows and obstacles up to and past their caps', () => {
    const { applyOutline } = usePlanStore.getState();
    expect(applyOutline(setRectangleSize(usePlanStore.getState().room.outline, { w: 720, l: 720 }))).toBeNull();
    let n = 0;
    for (const wall of wallsOf(usePlanStore.getState().room.outline)) {
      const u = { x: (wall.b.x - wall.a.x) / wall.length, y: (wall.b.y - wall.a.y) / wall.length };
      for (let t = 20; t + 18 <= wall.length && n < CONFIG.maxOpenings; t += 40) {
        const kind = n % 2 === 0 ? 'window' : 'door';
        expect(placeOpening(kind, wall.id, { x: wall.a.x + u.x * t, y: wall.a.y + u.y * t }, `opening-${n}`)).toBeNull();
        n++;
        expectExact(`add opening ${n}`);
      }
    }
    expect(usePlanStore.getState().openings).toHaveLength(CONFIG.maxOpenings);
    expect(placeOpening('window', 'c4', { x: 0, y: 20 }, 'one-too-many')).toBe('too-many-openings');
    expectExact('add an opening past the cap');
    const centre = interiorPoint(usePlanStore.getState().room.outline);
    for (let i = 0; i < CONFIG.maxObstacles; i++) {
      expect(placeObstacle(i % 2 === 0 ? 'box' : 'cylinder', centre, `obstacle-${i}`)).toBeNull();
      expectExact(`add obstacle ${i + 1}`);
    }
    expect(placeObstacle('box', centre, 'one-too-many')).toBe('too-many-obstacles');
    expectExact('add an obstacle past the cap');
    expect(usePlanStore.getState().obstacles).toHaveLength(CONFIG.maxObstacles);
  });
});

/** Stores `corners` as the room's outline, with no doors, windows or obstacles. */
function seedOutline(corners: [string, number, number][]): void {
  const { room } = usePlanStore.getState();
  usePlanStore.setState({ room: { ...room, outline: corners.map(([id, x, y]) => ({ id, x, y })) }, openings: [], obstacles: [] });
}

function slideWall(wallId: string, distance: number): void {
  const slide = startWallSlide(wallId);
  if (slide === null) throw new Error(`expected wall ${wallId}`);
  slideWallTo(slide, distance);
}

/** Asserts the stored plan parses and its outline, doors, windows and obstacles read back equal. */
function expectParsedEqualsStore(step: string): void {
  expectExact(step);
  const doc = currentDocument();
  const result = parsePlan(JSON.parse(JSON.stringify(doc)));
  if (!result.ok) throw new Error(`${step}: ${result.reason}`);
  expect(result.doc.room.outline, step).toEqual(doc.room.outline);
  expect(result.doc.openings, step).toEqual(doc.openings);
  expect(result.doc.obstacles, step).toEqual(doc.obstacles);
}

const T_CORNERS: [string, number, number][] = [['c1', 0, 0], ['m1', 48, 0], ['m2', 96, 0], ['c2', 144, 0], ['c3', 144, 168], ['c4', 0, 168]];
const Q_CORNERS: [string, number, number][] = [['q1', 0, 0], ['q2', 100, 0], ['q3', 150, 50], ['q4', 150, 150], ['q5', 0, 150]];

describe('plans with slid walls survive save and load', () => {
  it('a step slid on a wall with a door and a window beside it', () => {
    seedOutline(T_CORNERS);
    expect(placeOpening('door', 'm1', { x: 72, y: 0 }, 'door-1')).toBeNull();
    expect(placeOpening('window', 'c1', { x: 22, y: 0 }, 'window-1')).toBeNull();
    expect(usePlanStore.getState().openings.map((o) => [o.id, o.wallId, o.offset, o.width])).toEqual([
      ['door-1', 'm1', 8, 32], ['window-1', 'c1', 4, 36],
    ]);
    slideWall('m1', 24);
    expect(useUiStore.getState().roomProblem).toBeNull();
    expect(usePlanStore.getState().room.outline).toHaveLength(8);
    expectParsedEqualsStore('slide a wall with openings');
  });

  it('a diagonal slide, then a typed length', () => {
    seedOutline(Q_CORNERS);
    slideWall('q1', 10);
    expectParsedEqualsStore('diagonal slide');
    useUiStore.getState().setLengthAnchor('both');
    expect(setWallLengthTo('q2', 60)).toBe(true);
    expectParsedEqualsStore('typed length after the slide');
  });

  it('a slide that uses up a neighbouring wall', () => {
    seedOutline(Q_CORNERS);
    slideWall('q1', 49.7);
    expectParsedEqualsStore('use up the neighbour');
    expect(usePlanStore.getState().room.outline).toHaveLength(4);
  });

  it('a slide far from the origin that would pass the limit is refused and the stored plan still parses', () => {
    // The brief's x 1300 to 1444 is itself past coordMax (1440), so the room is x 1290 to 1434.
    seedOutline([['c1', 1290, 0], ['c2', 1434, 0], ['c3', 1434, 168], ['c4', 1290, 168]]);
    expectParsedEqualsStore('the room before the slide');
    slideWall('c2', -10);
    expect(useUiStore.getState().roomProblem).toBe(ROOM_PROBLEM_TEXT['too-large']);
    expect(usePlanStore.getState().room.outline.map((c) => c.x)).toEqual([1290, 1434, 1434, 1290]);
    expectParsedEqualsStore('after the refused slide');
  });
});
