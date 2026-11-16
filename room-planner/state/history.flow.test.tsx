import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { roomBounds } from '../domain/shape';
import type { PlanDocument } from '../domain/types';
import { RoomFeatures } from '../components/Sidebar/RoomFeatures';
import { RoomSection } from '../components/Sidebar/RoomSection';
import { WallList } from '../components/Sidebar/WallList';
import { PlanView } from '../components/Stage/PlanView';
import { RoomEditLayer } from '../components/Stage/RoomEditLayer';
import { WallLengthLabels } from '../components/Stage/WallLengthLabels';
import { useHistoryFieldGroups } from '../hooks/useHistoryFieldGroups';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { createMockProductLookup, SAMPLE_LINKS } from '../services/mockProductLookup';
import type { PaneRect } from '../view/panes';
import { computePlanLayout, type PlanLayout, toPane } from '../view/planLayout';
import { addCornerOnWall, placePreview, removeSelected, removeSelectedCorner, rotateSelected } from './actions';
import { clearHistory, redo, undo, useHistoryStore } from './historyStore';
import { usePlanStore } from './planStore';
import { useUiStore } from './uiStore';

/**
 * Whole-flow tests for undo and redo: one test per row of the plan's Task 6 table (the spec's
 * "What one step is"). Each starts from the seeded plan, a reset UI store and an empty history,
 * makes the edit through the code path the UI uses, then checks that undo gives back the plan
 * from before the edit and redo the plan from after it, and how many steps the edit made.
 */

const MAIN: PaneRect = { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 608 };

/** The four fields a step covers. */
type Doc = Pick<PlanDocument, 'room' | 'items' | 'openings' | 'obstacles'>;

/** A deep copy of the plan's four document fields, so later changes cannot reach it. */
function doc(): Doc {
  const { room, items, openings, obstacles } = usePlanStore.getState();
  return structuredClone({ room, items, openings, obstacles });
}

/** Undoes until nothing is left, returning how many steps were taken back. */
function undoAll(): number {
  let n = 0;
  while (undo()) n += 1;
  return n;
}

/**
 * Undoes `n` steps and expects `before`; redoes the same `n` and expects `after`, with nothing
 * further to redo.
 */
function expectUndoRedo(before: Doc, after: Doc, n = 1): void {
  for (let i = 0; i < n; i += 1) expect(undo()).toBe(true);
  expect(doc()).toEqual(before);
  for (let i = 0; i < n; i += 1) expect(redo()).toBe(true);
  expect(redo()).toBe(false);
  expect(doc()).toEqual(after);
}

/** Counts plan-store writes until the returned function is called; it returns the count. */
function countChanges(): () => number {
  let n = 0;
  const stop = usePlanStore.subscribe(() => {
    n += 1;
  });
  return () => {
    stop();
    return n;
  };
}

/** Mounts the text-field groups the app mounts in App.tsx. */
function FieldGroups(): null {
  useHistoryFieldGroups();
  return null;
}

/** Mounts the keyboard shortcuts the app mounts in App.tsx. */
function Shortcuts(): null {
  useKeyboardShortcuts();
  return null;
}

function seedLayout(): PlanLayout {
  return computePlanLayout(roomBounds(usePlanStore.getState().room), MAIN);
}

function wallHit(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.room-wall-hit[data-wall-id="${id}"]`);
  if (!el) throw new Error(`no hit target for wall ${id}`);
  return el;
}

function itemEl(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-item-id="${id}"]`);
  if (!el) throw new Error(`no item ${id}`);
  return el;
}

/** The sidebar list of doors, windows and obstacles. */
function featureList(): HTMLElement {
  return screen.getByRole('group', { name: 'Doors, windows and obstacles' });
}

/** The fields group of the thing selected in RoomFeatures. */
function featureFields(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  clearHistory();
});

afterEach(() => {
  // End any drag a failing test left open, so its group cannot reach the next test.
  fireEvent.pointerUp(window);
});

describe('undo and redo, whole flows', () => {
  it('F1: adding furniture (placePreview of the mock sofa) is one step', async () => {
    const product = await createMockProductLookup({ delayMs: 0 }).lookup(SAMPLE_LINKS.sofa);
    const before = doc();
    useUiStore.getState().setLookup({ status: 'preview', product });
    const id = placePreview();
    expect(id).not.toBeNull();
    const after = doc();
    expect(after.items).toHaveLength(before.items.length + 1);
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F2: removing the selected item (removeSelected) is one step', () => {
    useUiStore.getState().select('seed-bed');
    const before = doc();
    removeSelected();
    const after = doc();
    expect(after.items.some((i) => i.id === 'seed-bed')).toBe(false);
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F3: rotating the selected item (rotateSelected) is one step', () => {
    useUiStore.getState().select('seed-bed');
    const before = doc();
    rotateSelected();
    const after = doc();
    expect(after.items).not.toEqual(before.items);
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F4: dragging an item in PlanView (down, three moves, up) is one step', () => {
    render(<PlanView pane={MAIN} />);
    const before = doc();
    const changes = countChanges();
    fireEvent.pointerDown(itemEl('seed-bed'), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 110, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 120, clientY: 110 });
    fireEvent.pointerMove(window, { clientX: 130, clientY: 120 });
    fireEvent.pointerUp(window);
    // Each move changed the plan, so the drag really joined three changes.
    expect(changes()).toBe(3);
    const after = doc();
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F5: dragging a wall in room mode (RoomEditLayer) is one step', () => {
    useUiStore.getState().setMode('room');
    const layout = seedLayout();
    render(<RoomEditLayer layout={layout} />);
    const s = layout.scale;
    const before = doc();
    const changes = countChanges();
    fireEvent.pointerDown(wallHit('c1'), { clientX: 100, clientY: 100, button: 0 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 100 + 12 * s });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 100 + 24 * s });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 100 + 36 * s });
    fireEvent.pointerUp(window);
    expect(changes()).toBe(3);
    const after = doc();
    expect(after.room.outline.map((c) => [c.x, c.y])).toEqual([[0, 36], [144, 36], [144, 168], [0, 168]]);
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F6: dragging a corner in room mode is one step', () => {
    useUiStore.getState().setMode('room');
    const layout = seedLayout();
    render(<RoomEditLayer layout={layout} />);
    const s = layout.scale;
    const before = doc();
    const changes = countChanges();
    const handle = screen.getByRole('button', { name: 'Corner 2' });
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 100 + 6 * s, clientY: 100, altKey: true });
    fireEvent.pointerMove(window, { clientX: 100 + 10 * s, clientY: 100 - 4 * s, altKey: true });
    fireEvent.pointerMove(window, { clientX: 100 + 16 * s, clientY: 100 - 10 * s, altKey: true });
    fireEvent.pointerUp(window);
    expect(changes()).toBe(3);
    const after = doc();
    expect(after.room.outline.find((c) => c.id === 'c2')).toEqual({ id: 'c2', x: 160, y: -10 });
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F7: double-clicking a wall to add a corner is one step', () => {
    useUiStore.getState().setMode('room');
    const layout = seedLayout();
    render(<RoomEditLayer layout={layout} />);
    const before = doc();
    const p = toPane({ x: 60, y: 0 }, layout);
    // A browser's double-click: two presses and releases, then dblclick.
    for (let i = 0; i < 2; i += 1) {
      fireEvent.pointerDown(wallHit('c1'), { clientX: p.x, clientY: p.y, button: 0 });
      fireEvent.pointerUp(window);
    }
    fireEvent.doubleClick(wallHit('c1'), { clientX: p.x, clientY: p.y });
    const after = doc();
    expect(after.room.outline).toHaveLength(5);
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F8: removing the selected corner (removeSelectedCorner) is one step', () => {
    useUiStore.getState().setMode('room');
    // A corner of our own to remove: adding it is the first step.
    addCornerOnWall('c1', { x: 60, y: 0 });
    const added = useUiStore.getState().selectedCornerId;
    expect(added).not.toBeNull();
    const before = doc();
    removeSelectedCorner();
    const after = doc();
    expect(after.room.outline).toHaveLength(4);
    expectUndoRedo(before, after);
    // The add and the remove.
    expect(undoAll()).toBe(2);
  });

  it('F9: typing a wall length in WallList, two keystrokes, is one step', async () => {
    const user = userEvent.setup();
    render(
      <>
        <FieldGroups />
        <WallList />
        <button type="button">Outside</button>
      </>,
    );
    const field = screen.getByLabelText('Wall 1') as HTMLInputElement;
    await user.click(field);
    await user.clear(field);
    const before = doc();
    const changes = countChanges();
    await user.keyboard('1');
    await user.keyboard('0');
    // 1 ft, then 10 ft: both keystrokes changed the plan.
    expect(changes()).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    const after = doc();
    expect(after.room.outline.find((c) => c.id === 'c2')).toEqual({ id: 'c2', x: 120, y: 0 });
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F10: typing a length in the on-plan editor and pressing Enter is one step', async () => {
    useUiStore.getState().setMode('room');
    const user = userEvent.setup();
    render(
      <>
        <FieldGroups />
        <WallLengthLabels layout={seedLayout()} />
      </>,
    );
    const label = document.querySelector<HTMLElement>('button.room-wall-label[data-wall-label-id="c1"]');
    if (!label) throw new Error('no label for wall c1');
    await user.click(label);
    const before = doc();
    await user.keyboard('13{Enter}');
    const after = doc();
    expect(after.room.outline.find((c) => c.id === 'c2')).toEqual({ id: 'c2', x: 156, y: 0 });
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F11: placing a door, then a window, is two steps; two undos leave no openings', () => {
    useUiStore.getState().setMode('room');
    const layout = seedLayout();
    render(<RoomEditLayer layout={layout} />);
    const before = doc();
    expect(before.openings).toEqual([]);
    act(() => useUiStore.getState().setRoomTool('door'));
    const atDoor = toPane({ x: 72, y: 5 }, layout);
    fireEvent.pointerDown(wallHit('c1'), { clientX: atDoor.x, clientY: atDoor.y, button: 0 });
    fireEvent.pointerUp(window);
    const withDoor = doc();
    expect(withDoor.openings).toHaveLength(1);
    act(() => useUiStore.getState().setRoomTool('window'));
    const atWindow = toPane({ x: 144, y: 84 }, layout);
    fireEvent.pointerDown(wallHit('c2'), { clientX: atWindow.x, clientY: atWindow.y, button: 0 });
    fireEvent.pointerUp(window);
    const after = doc();
    expect(after.openings.map((o) => o.kind)).toEqual(['door', 'window']);
    // One undo takes back the window alone.
    expect(undo()).toBe(true);
    expect(doc()).toEqual(withDoor);
    expect(redo()).toBe(true);
    expectUndoRedo(before, after, 2);
    expect(undoAll()).toBe(2);
    expect(doc().openings).toEqual([]);
  });

  it('F12: adding an obstacle, then typing its width in the sidebar, is two steps', async () => {
    useUiStore.getState().setMode('room');
    const user = userEvent.setup();
    render(
      <>
        <FieldGroups />
        <RoomFeatures />
        <button type="button">Outside</button>
      </>,
    );
    const before = doc();
    await user.click(screen.getByRole('button', { name: 'Add box' }));
    const withBox = doc();
    expect(withBox.obstacles).toHaveLength(1);
    const width = within(featureFields('Box')).getByLabelText('Width') as HTMLInputElement;
    expect(width.value).toBe('24');
    await user.click(width);
    const changes = countChanges();
    // Replaces 24 with 3, then 30.
    await user.type(width, '30', { initialSelectionStart: 0, initialSelectionEnd: width.value.length });
    expect(changes()).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    const after = doc();
    expect(after.obstacles[0]?.width).toBe(30);
    // One undo takes back the whole typed width.
    expectUndoRedo(withBox, after);
    expectUndoRedo(before, after, 2);
    expect(undoAll()).toBe(2);
  });

  it('F18: a door width typed in two keystrokes is one step; an obstacle name typed in three is one step', async () => {
    useUiStore.getState().setMode('room');
    const layout = seedLayout();
    const user = userEvent.setup();
    render(
      <>
        <FieldGroups />
        <RoomEditLayer layout={layout} />
        <RoomFeatures />
        <button type="button">Outside</button>
      </>,
    );
    const seeded = doc();
    // Place a door near the start of the top wall: it is moved along the wall to offset 0.
    await user.click(screen.getByRole('button', { name: 'Add door' }));
    const at = toPane({ x: 16, y: 5 }, layout);
    fireEvent.pointerDown(wallHit('c1'), { clientX: at.x, clientY: at.y, button: 0 });
    fireEvent.pointerUp(window);
    const withDoor = doc();
    expect(withDoor.openings).toMatchObject([{ kind: 'door', wallId: 'c1', offset: 0, width: 32 }]);
    // Select it from its row in the sidebar list.
    await user.click(within(featureList()).getByRole('button', { name: 'Door on wall 1' }));
    const width = within(featureFields('Door on wall 1')).getByLabelText('Width') as HTMLInputElement;
    expect(width.value).toBe('32');
    await user.click(width);
    const doorChanges = countChanges();
    // Two keystrokes, each a change: 1 before 32 makes 132, then Delete takes the 3 out: 12.
    await user.type(width, '1', { initialSelectionStart: 0, initialSelectionEnd: 0 });
    await user.keyboard('{Delete}');
    expect(doorChanges()).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    const doorWidth = doc();
    expect(doorWidth.openings[0]?.width).toBe(12);

    await user.click(screen.getByRole('button', { name: 'Add box' }));
    const withBox = doc();
    expect(withBox.obstacles).toHaveLength(1);
    const name = within(featureFields('Box')).getByLabelText('Label') as HTMLInputElement;
    await user.click(name);
    const nameChanges = countChanges();
    // Three letters replace "Box": A, Ab, Abc.
    await user.type(name, 'Abc', { initialSelectionStart: 0, initialSelectionEnd: name.value.length });
    expect(nameChanges()).toBe(3);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    const after = doc();
    expect(after.obstacles[0]?.label).toBe('Abc');

    // Each undo takes back one of: the name, the box, the door width, the door.
    expectUndoRedo(withBox, after, 1);
    expectUndoRedo(doorWidth, after, 2);
    expectUndoRedo(withDoor, after, 3);
    expectUndoRedo(seeded, after, 4);
    expect(undoAll()).toBe(4);
  });

  it('F13: choosing the starting shape L-shape is one step', async () => {
    const user = userEvent.setup();
    render(<RoomSection />);
    const before = doc();
    await user.click(screen.getByRole('button', { name: 'L-shape' }));
    const after = doc();
    expect(after.room.outline).toHaveLength(6);
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F14: typing the ceiling height in the sidebar is one step', async () => {
    const user = userEvent.setup();
    render(
      <>
        <FieldGroups />
        <RoomSection />
        <button type="button">Outside</button>
      </>,
    );
    const ceiling = screen.getByLabelText('Ceiling') as HTMLInputElement;
    await user.click(ceiling);
    await user.clear(ceiling);
    const before = doc();
    const changes = countChanges();
    // 3 ft, then 36 ft: both within the room limits, so both change the plan.
    await user.keyboard('36');
    expect(changes()).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    const after = doc();
    expect(after.room.height).toBe(432);
    expectUndoRedo(before, after);
    expect(undoAll()).toBe(1);
  });

  it('F15: a wall drag that moves a door\'s stored offset is one step: outline and door return together', () => {
    useUiStore.getState().setMode('room');
    const layout = seedLayout();
    render(<RoomEditLayer layout={layout} />);
    const s = layout.scale;
    // A door centred at x 72 on the top wall: offset 56 from Corner 1.
    act(() => useUiStore.getState().setRoomTool('door'));
    const at = toPane({ x: 72, y: 5 }, layout);
    fireEvent.pointerDown(wallHit('c1'), { clientX: at.x, clientY: at.y, button: 0 });
    fireEvent.pointerUp(window);
    const before = doc();
    expect(before.openings).toMatchObject([{ wallId: 'c1', offset: 56 }]);
    // Slide the left wall (c4 to c1) 36 in to the right: Corner 1 moves, the door stays in the room.
    const changes = countChanges();
    fireEvent.pointerDown(wallHit('c4'), { clientX: 100, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 100 + 12 * s, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 100 + 24 * s, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 100 + 36 * s, clientY: 300 });
    fireEvent.pointerUp(window);
    expect(changes()).toBe(3);
    const after = doc();
    expect(after.room.outline.find((c) => c.id === 'c1')).toEqual({ id: 'c1', x: 36, y: 0 });
    expect(after.openings).toMatchObject([{ wallId: 'c1', offset: 20 }]);
    // One undo gives back both the outline and the door's offset.
    expectUndoRedo(before, after);
    // The door placement and the drag.
    expect(undoAll()).toBe(2);
  });

  it('F16: a room edit undone in furnish mode is taken back and the mode stays furnish', () => {
    useUiStore.getState().setMode('room');
    const before = doc();
    addCornerOnWall('c1', { x: 60, y: 0 });
    const after = doc();
    expect(after.room.outline).toHaveLength(5);
    useUiStore.getState().setMode('furnish');
    expect(undo()).toBe(true);
    expect(doc()).toEqual(before);
    expect(useUiStore.getState().mode).toBe('furnish');
    expect(redo()).toBe(true);
    expect(doc()).toEqual(after);
    expect(useUiStore.getState().mode).toBe('furnish');
    expect(undoAll()).toBe(1);
  });

  it('F17: undo clears a selection that points at something it removed, and restores no selection', async () => {
    // Select an item, remove it, undo: the item is back and nothing is selected.
    useUiStore.getState().select('seed-bed');
    const before = doc();
    removeSelected();
    const removed = doc();
    expect(undo()).toBe(true);
    expect(doc()).toEqual(before);
    expect(useUiStore.getState().selectedId).toBeNull();
    expect(redo()).toBe(true);
    expect(doc()).toEqual(removed);
    expect(useUiStore.getState().selectedId).toBeNull();
    expect(undoAll()).toBe(1);

    // Add an item, select it, undo: the item is gone and selectedId is null.
    usePlanStore.getState().reset();
    useUiStore.getState().reset();
    clearHistory();
    const product = await createMockProductLookup({ delayMs: 0 }).lookup(SAMPLE_LINKS.sofa);
    const seeded = doc();
    useUiStore.getState().setLookup({ status: 'preview', product });
    const id = placePreview();
    expect(id).not.toBeNull();
    const added = doc();
    useUiStore.getState().select(id);
    expect(useUiStore.getState().selectedId).toBe(id);
    expect(undo()).toBe(true);
    expect(doc()).toEqual(seeded);
    expect(useUiStore.getState().selectedId).toBeNull();
    expect(redo()).toBe(true);
    expect(doc()).toEqual(added);
    expect(undoAll()).toBe(1);
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it('F19: a length typed in the on-plan editor, then an arrow slide of the wall, is two steps', async () => {
    useUiStore.getState().setMode('room');
    const user = userEvent.setup();
    render(
      <>
        <FieldGroups />
        <Shortcuts />
        <WallLengthLabels layout={seedLayout()} />
      </>,
    );
    const label = (id: string): HTMLElement => {
      const el = document.querySelector<HTMLElement>(`button.room-wall-label[data-wall-label-id="${id}"]`);
      if (!el) throw new Error(`no label for wall ${id}`);
      return el;
    };
    const wallLength = (): number => {
      const { outline } = usePlanStore.getState().room;
      const a = outline.find((c) => c.id === 'c1');
      const b = outline.find((c) => c.id === 'c2');
      if (!a || !b) throw new Error('no top wall');
      return Math.hypot(b.x - a.x, b.y - a.y);
    };

    // Enter: the editor is removed while its input has focus, and focus returns to the label.
    const before = doc();
    await user.click(label('c1'));
    await user.keyboard('13{Enter}');
    const typed = doc();
    expect(wallLength()).toBe(156);
    expect(useUiStore.getState().selectedWallId).toBe('c1');
    await user.keyboard('{ArrowDown}');
    const slid = doc();
    expect(slid).not.toEqual(typed);
    expect(wallLength()).toBe(156);
    // One undo takes back only the slide; the typed length stays.
    expect(undo()).toBe(true);
    expect(doc()).toEqual(typed);
    expect(wallLength()).toBe(156);
    expect(undo()).toBe(true);
    expect(doc()).toEqual(before);
    expect(undo()).toBe(false);

    // Escape: nothing typed is applied; the slide after it, and a slide of another wall, are a step each.
    act(() => {
      usePlanStore.getState().reset();
      useUiStore.getState().reset();
      useUiStore.getState().setMode('room');
    });
    clearHistory();
    const seeded = doc();
    await user.click(label('c1'));
    await user.keyboard('13{Escape}');
    expect(doc()).toEqual(seeded);
    expect(useUiStore.getState().selectedWallId).toBe('c1');
    await user.keyboard('{ArrowDown}');
    const slidTop = doc();
    expect(slidTop).not.toEqual(seeded);
    act(() => useUiStore.getState().selectWall('c2'));
    await user.keyboard('{ArrowLeft}');
    expect(doc()).not.toEqual(slidTop);
    expect(undo()).toBe(true);
    expect(doc()).toEqual(slidTop);
    expect(undo()).toBe(true);
    expect(doc()).toEqual(seeded);
    expect(undo()).toBe(false);
  });
});
