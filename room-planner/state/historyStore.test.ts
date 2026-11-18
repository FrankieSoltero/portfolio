import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corner, Door, Obstacle, ProductPreview } from '../domain/types';
import {
  clearHistory,
  closeGroup,
  openGroup,
  redo,
  renewFieldGroup,
  runKeyed,
  undo,
  useHistoryStore,
} from './historyStore';
import { furnishedDocument } from '../test/fixtures';
import { usePlanStore } from './planStore';
import { useUiStore } from './uiStore';

const CHAIR: ProductPreview = {
  kind: 'chair',
  name: 'Test chair',
  host: 'shop.example',
  sourceUrl: 'https://shop.example/test-chair',
  price: 100,
  w: 20,
  d: 20,
  h: 30,
  known: true,
  model: { tier: 'box', label: 'Box', assetUrl: null },
};

const DOOR: Door = { id: 'door-1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };

const OBSTACLE: Obstacle = {
  id: 'obs-1',
  shape: 'box',
  label: 'Column',
  x: 60,
  y: 60,
  rotation: 0,
  width: 10,
  depth: 10,
  height: 96,
  elevation: 0,
};

/** One change: the ceiling goes up by an inch, giving `room` a new reference. */
function change(): void {
  const s = usePlanStore.getState();
  s.setRoomHeight(s.room.height + 1);
}

function height(): number {
  return usePlanStore.getState().room.height;
}

/** Undoes until nothing is left, returning how many steps were taken back. */
function undoAll(): number {
  let n = 0;
  while (undo()) n += 1;
  return n;
}

/** The four plan fields a step covers, by reference. */
function planRefs() {
  const { room, items, openings, obstacles } = usePlanStore.getState();
  return { room, items, openings, obstacles };
}

beforeEach(() => {
  usePlanStore.getState().reset(furnishedDocument());
  useUiStore.getState().reset();
  clearHistory();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('recording steps', () => {
  it('First change: records one step holding the plan before the change', () => {
    const before = planRefs();
    change();
    expect(useHistoryStore.getState().canUndo).toBe(true);
    expect(useHistoryStore.getState().canRedo).toBe(false);
    expect(undo()).toBe(true);
    expect(planRefs()).toEqual(before);
    expect(usePlanStore.getState().room).toBe(before.room);
    expect(undo()).toBe(false);
  });

  it('Units only: setUnits adds no step', () => {
    usePlanStore.getState().setUnits('m');
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it('Same references: an update that changes none of the four fields adds no step', () => {
    const s = usePlanStore.getState();
    usePlanStore.setState({ room: s.room, items: s.items, openings: s.openings, obstacles: s.obstacles });
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it('No group, no key: two changes make two steps', () => {
    change();
    change();
    expect(undoAll()).toBe(2);
  });
});

describe('groups', () => {
  it('Drag group: five changes in one drag are one step, undone to before the first', () => {
    const start = height();
    openGroup('drag');
    for (let i = 0; i < 5; i += 1) change();
    closeGroup('drag');
    expect(undo()).toBe(true);
    expect(height()).toBe(start);
    expect(undo()).toBe(false);
  });

  it('Two drags: two separate drags make two steps', () => {
    openGroup('drag');
    change();
    closeGroup('drag');
    openGroup('drag');
    change();
    closeGroup('drag');
    expect(undoAll()).toBe(2);
  });

  it('Empty drag: a drag with no change adds no step', () => {
    openGroup('drag');
    closeGroup('drag');
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it('Field group: three changes while a field group is open are one step', () => {
    openGroup('field');
    change();
    change();
    change();
    expect(undoAll()).toBe(1);
  });

  it('Field renewed: renewFieldGroup starts a new step for the next change', () => {
    openGroup('field');
    change();
    renewFieldGroup();
    change();
    expect(undoAll()).toBe(2);
  });

  it('Renew with none open: renewFieldGroup creates no group', () => {
    renewFieldGroup();
    change();
    change();
    expect(undoAll()).toBe(2);
  });

  it('Drag inside a field: field, drag, then a new step for the change after the drag', () => {
    openGroup('field');
    change();
    openGroup('drag');
    change();
    closeGroup('drag');
    change();
    closeGroup('field');
    expect(undoAll()).toBe(3);
  });
});

describe('keyed runs', () => {
  it('Keyed run: three keyed changes within 1000 ms are one step', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    runKeyed('k', change);
    vi.setSystemTime(10_400);
    runKeyed('k', change);
    vi.setSystemTime(11_000);
    runKeyed('k', change);
    expect(undoAll()).toBe(1);
  });

  it('Keyed run, slow: two keyed changes 1001 ms apart are two steps', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    runKeyed('k', change);
    vi.setSystemTime(11_001);
    runKeyed('k', change);
    expect(undoAll()).toBe(2);
  });

  it('Keyed run timing: the window restarts at each change (800 ms apart, 1600 ms overall)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    runKeyed('k', change);
    vi.setSystemTime(10_800);
    runKeyed('k', change);
    vi.setSystemTime(11_600);
    runKeyed('k', change);
    expect(undoAll()).toBe(1);
  });

  it('Keyed run, edge: a keyed change exactly 1000 ms after the previous one joins the step', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    runKeyed('k', change);
    vi.setSystemTime(11_000);
    runKeyed('k', change);
    expect(undoAll()).toBe(1);
  });

  it('Keyed run after undo: the same key within 1000 ms starts a new step, not joined to an older one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const start = height();
    runKeyed('k', change);
    vi.setSystemTime(10_100);
    expect(undo()).toBe(true);
    vi.setSystemTime(10_200);
    runKeyed('k', change);
    expect(useHistoryStore.getState().canUndo).toBe(true);
    expect(undoAll()).toBe(1);
    expect(height()).toBe(start);
  });

  it('Different keys: two keys at once are two steps', () => {
    runKeyed('a', change);
    runKeyed('b', change);
    expect(undoAll()).toBe(2);
  });

  it('Key then plain: a plain change between two keyed changes splits them', () => {
    runKeyed('k', change);
    change();
    runKeyed('k', change);
    expect(undoAll()).toBe(3);
  });

  it('Key inside a group: the group wins and its step has no key', () => {
    openGroup('drag');
    runKeyed('k', change);
    runKeyed('k', change);
    closeGroup('drag');
    runKeyed('k', change);
    expect(undoAll()).toBe(2);
  });

  it('runKeyed return and throw: returns the result, rethrows and restores the previous key', () => {
    expect(runKeyed('k', () => 7)).toBe(7);
    const boom = new Error('boom');
    expect(() =>
      runKeyed('outer', () => {
        expect(() =>
          runKeyed('inner', () => {
            throw boom;
          }),
        ).toThrow(boom);
        // Back under 'outer': this change and the next 'outer' change are one step.
        change();
      }),
    ).not.toThrow();
    runKeyed('outer', change);
    expect(undoAll()).toBe(1);
  });
});

describe('undo and redo', () => {
  it('Undo: takes back the latest step and announces it', () => {
    change();
    const beforeB = planRefs();
    change();
    const count = useHistoryStore.getState().announceCount;
    expect(undo()).toBe(true);
    expect(planRefs()).toEqual(beforeB);
    expect(usePlanStore.getState().room).toBe(beforeB.room);
    const h = useHistoryStore.getState();
    expect(h.canRedo).toBe(true);
    expect(h.lastAnnouncement).toBe('Undone');
    expect(h.announceCount).toBe(count + 1);
  });

  it('Undo empties: two undos reach the start, a third does nothing', () => {
    const beforeA = planRefs();
    change();
    change();
    expect(undo()).toBe(true);
    expect(undo()).toBe(true);
    expect(usePlanStore.getState().room).toBe(beforeA.room);
    expect(useHistoryStore.getState().canUndo).toBe(false);
    const count = useHistoryStore.getState().announceCount;
    const room = usePlanStore.getState().room;
    expect(undo()).toBe(false);
    expect(usePlanStore.getState().room).toBe(room);
    expect(useHistoryStore.getState().announceCount).toBe(count);
  });

  it('Redo: puts back the step that was undone and announces it', () => {
    change();
    change();
    const afterB = planRefs();
    undo();
    const count = useHistoryStore.getState().announceCount;
    expect(redo()).toBe(true);
    expect(usePlanStore.getState().room).toBe(afterB.room);
    expect(planRefs()).toEqual(afterB);
    const h = useHistoryStore.getState();
    expect(h.lastAnnouncement).toBe('Redone');
    expect(h.announceCount).toBe(count + 1);
    expect(h.canRedo).toBe(false);
    expect(h.canUndo).toBe(true);
  });

  it('Redo with nothing: redo on a fresh history returns false', () => {
    expect(redo()).toBe(false);
    expect(useHistoryStore.getState().lastAnnouncement).toBeNull();
  });

  it('New change clears redo: a change after an undo discards the redo list', () => {
    change();
    undo();
    expect(useHistoryStore.getState().canRedo).toBe(true);
    change();
    expect(useHistoryStore.getState().canRedo).toBe(false);
    expect(redo()).toBe(false);
  });

  it('No merge across undo: the changes after an undo make one new step', () => {
    openGroup('field');
    change();
    const afterFirst = height();
    undo();
    change();
    change();
    expect(undo()).toBe(true);
    expect(height()).toBe(afterFirst - 1);
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it('Units kept: undo restores the plan but keeps the current units', () => {
    const start = height();
    change();
    usePlanStore.getState().setUnits('m');
    undo();
    expect(height()).toBe(start);
    expect(usePlanStore.getState().units).toBe('m');
    expect(usePlanStore.getState().schemaVersion).toBe(3);
  });

  it('References restored: undo puts back the very same items list', () => {
    const items = usePlanStore.getState().items;
    usePlanStore.getState().addItem(CHAIR);
    expect(usePlanStore.getState().items).not.toBe(items);
    undo();
    expect(usePlanStore.getState().items).toBe(items);
  });

  it('Undo is not recorded: the store update from undo adds no step', () => {
    change();
    undo();
    expect(useHistoryStore.getState().canUndo).toBe(false);
    redo();
    expect(useHistoryStore.getState().canRedo).toBe(false);
    expect(undoAll()).toBe(1);
  });

  it('Blocked in a drag: undo and redo do nothing while a drag is open', () => {
    change();
    change();
    undo();
    openGroup('drag');
    change();
    const room = usePlanStore.getState().room;
    const count = useHistoryStore.getState().announceCount;
    expect(undo()).toBe(false);
    expect(redo()).toBe(false);
    expect(usePlanStore.getState().room).toBe(room);
    expect(useHistoryStore.getState().announceCount).toBe(count);
    closeGroup('drag');
    expect(undo()).toBe(true);
    expect(usePlanStore.getState().room).not.toBe(room);
    expect(redo()).toBe(true);
    expect(usePlanStore.getState().room).toBe(room);
  });

  it('Change after redo: a change after a redo starts a new step', () => {
    openGroup('field');
    change();
    undo();
    redo();
    change();
    closeGroup('field');
    expect(undoAll()).toBe(2);
  });

  it('Blocked in a drag: undo returns false in an open drag before any change was made', () => {
    change();
    const room = usePlanStore.getState().room;
    openGroup('drag');
    expect(undo()).toBe(false);
    expect(usePlanStore.getState().room).toBe(room);
    closeGroup('drag');
    expect(undo()).toBe(true);
  });

  it('Blocked in a drag: redo waits for the drag to close', () => {
    change();
    undo();
    openGroup('drag');
    expect(redo()).toBe(false);
    closeGroup('drag');
    expect(redo()).toBe(true);
  });

  it('Cap: 101 changes keep the latest 100 steps', () => {
    const start = height();
    for (let i = 0; i < 101; i += 1) change();
    expect(undoAll()).toBe(100);
    expect(height()).toBe(start + 1);
  });

  it('Clear: empties both lists, clears the announcement and forgets an open group', () => {
    change();
    change();
    undo();
    openGroup('drag');
    clearHistory();
    const h = useHistoryStore.getState();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.lastAnnouncement).toBeNull();
    // The drag group is gone: changes are separate steps and undo is not blocked.
    change();
    change();
    expect(undoAll()).toBe(2);
  });

  it('Clear: forgets the current key and the latest step', () => {
    runKeyed('outer', () => {
      change();
      clearHistory();
      change();
    });
    runKeyed('outer', change);
    // The key was forgotten inside the run, so the second change is a plain step; the third
    // cannot join it.
    expect(undoAll()).toBe(2);
  });

  it('Clear: a keyed change after clearHistory starts a new step', () => {
    runKeyed('k', change);
    clearHistory();
    runKeyed('k', change);
    expect(undoAll()).toBe(1);
  });

  it('Change during a restore: a change another subscriber makes on seeing the restored plan is its own step', () => {
    const restoredRoom = usePlanStore.getState().room;
    const restoredItems = usePlanStore.getState().items;
    change();
    let reacted = false;
    const unsubscribe = usePlanStore.subscribe((s) => {
      if (!reacted && s.room === restoredRoom) {
        reacted = true;
        s.addItem(CHAIR);
      }
    });
    try {
      expect(undo()).toBe(true);
    } finally {
      unsubscribe();
    }
    expect(reacted).toBe(true);
    // The reaction cleared the redo list, so no redo can wipe it.
    expect(useHistoryStore.getState().canRedo).toBe(false);
    expect(redo()).toBe(false);
    expect(useHistoryStore.getState().canUndo).toBe(true);
    // One undo takes back the reaction alone, back to the restored plan.
    expect(undo()).toBe(true);
    expect(usePlanStore.getState().room).toBe(restoredRoom);
    expect(usePlanStore.getState().items).toBe(restoredItems);
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });
});

describe('stale selections', () => {
  it('Stale selection: item: an undo that removes the selected item clears it', () => {
    const id = usePlanStore.getState().addItem(CHAIR);
    useUiStore.getState().select(id);
    undo();
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('Stale selection: item: a redo that removes the selected item clears it', () => {
    usePlanStore.getState().removeItem('seed-bed');
    undo();
    useUiStore.getState().select('seed-bed');
    redo();
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('Stale selection: room things: a missing corner is cleared after undo', () => {
    const { room } = usePlanStore.getState();
    const added: Corner = { id: 'c-new', x: 72, y: 200 };
    usePlanStore.setState({ room: { ...room, outline: [...room.outline, added] } });
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectCorner('c-new');
    undo();
    expect(useUiStore.getState().selectedCornerId).toBeNull();
  });

  it('Stale selection: room things: a wall whose corner is gone is cleared after undo', () => {
    const { room } = usePlanStore.getState();
    usePlanStore.setState({ room: { ...room, outline: [...room.outline, { id: 'c-new', x: 72, y: 200 }] } });
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectWall('c-new');
    undo();
    expect(useUiStore.getState().selectedWallId).toBeNull();
  });

  it('Stale selection: room things: a missing opening is cleared after undo', () => {
    usePlanStore.setState({ openings: [DOOR] });
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectOpening(DOOR.id);
    undo();
    expect(useUiStore.getState().selectedOpeningId).toBeNull();
  });

  it('Stale selection: room things: a missing obstacle is cleared after redo', () => {
    usePlanStore.setState({ obstacles: [OBSTACLE] });
    usePlanStore.setState({ obstacles: [] });
    undo();
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectObstacle(OBSTACLE.id);
    redo();
    expect(useUiStore.getState().selectedObstacleId).toBeNull();
  });

  it('Kept selection: a selection that still exists after undo is unchanged', () => {
    useUiStore.getState().select('seed-desk');
    change();
    undo();
    expect(useUiStore.getState().selectedId).toBe('seed-desk');

    useUiStore.getState().setMode('room');
    useUiStore.getState().selectWall('c2');
    change();
    undo();
    expect(useUiStore.getState().selectedWallId).toBe('c2');

    usePlanStore.setState({ obstacles: [OBSTACLE] });
    useUiStore.getState().selectObstacle(OBSTACLE.id);
    change();
    undo();
    expect(useUiStore.getState().selectedObstacleId).toBe(OBSTACLE.id);
  });

  it('Kept selection: a selected corner and a selected opening that still exist after undo stay selected', () => {
    usePlanStore.setState({ openings: [DOOR] });
    useUiStore.getState().setMode('room');
    useUiStore.getState().selectCorner('c1');
    change();
    undo();
    expect(useUiStore.getState().selectedCornerId).toBe('c1');

    useUiStore.getState().selectOpening(DOOR.id);
    change();
    undo();
    expect(useUiStore.getState().selectedOpeningId).toBe(DOOR.id);
  });
});
