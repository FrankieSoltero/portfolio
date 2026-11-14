import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
} from '../state/actions';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { addObstacle, newObstacle } from './obstacles';
import { addOpening } from './openings';
import { setWallLength, wallsOf } from './outline';
import { parsePlan } from './planSchema';
import type { PlanDocument, ProductPreview } from './types';

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
});
