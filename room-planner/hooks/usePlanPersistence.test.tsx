import { act, render, renderHook } from '@testing-library/react';
import { Activity, StrictMode, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import type { Door, Obstacle, PlanDocument } from '../domain/types';
import { createBrowserPlanStore } from '../services/browserPlanStore';
import type { PlanStore } from '../services/planStorage';
import { clearHistory, undo, useHistoryStore } from '../state/historyStore';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { createFakePlanStore, type FakePlanStore } from '../test/fakePlanStore';
import { placedItem, planDoc, rectRoom } from '../test/fixtures';
import { STORAGE_NOTICE, usePlanPersistence } from './usePlanPersistence';

const INVALID_TEXT = 'Your saved plan could not be read, so the planner started fresh.';
const STORAGE_TEXT = 'This browser is blocking storage, so changes will not be saved.';
const NEWER_TEXT =
  'Your saved plan was made with a newer version of the planner. It has been left untouched, and changes in this session will not be saved.';

const SAVED: PlanDocument = planDoc(rectRoom(120, 150, 96), [
  placedItem({ id: 'saved-box', w: 20, d: 20, h: 20, cx: 60, cy: 60 }),
]);

/** The six document fields of the plan store, as a plain object. */
function currentDoc(): PlanDocument {
  const s = usePlanStore.getState();
  return { schemaVersion: s.schemaVersion, units: s.units, room: s.room, items: s.items, openings: s.openings, obstacles: s.obstacles };
}

const DOOR: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
const BOX: Obstacle = { id: 'b1', shape: 'box', label: 'Box', x: 40, y: 120, rotation: 0, width: 24, depth: 24, height: 36, elevation: 0 };

/** Lets pending promise callbacks (and the React updates they cause) run. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

/** Advances the fake clock inside act. */
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Moves the seeded bed one inch to the right: a document change. */
function nudgeBed(): void {
  act(() => usePlanStore.getState().moveItemBy('seed-bed', 1, 0));
}

/** Mounts the hook against `store` and waits for its load to be applied. */
async function mountReady(store: PlanStore) {
  const view = renderHook(() => usePlanPersistence(store));
  await settle();
  expect(view.result.current.ready).toBe(true);
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  // A plan that differs from the seeded one, so a test can tell the seed was applied.
  usePlanStore.getState().removeItem('seed-desk');
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('usePlanPersistence: loading', () => {
  it('puts a loaded document in the plan store before the workspace first renders, then reports ready', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'loaded', doc: SAVED } } });
    const seenItems: string[][] = [];
    function Workspace(): JSX.Element {
      const items = usePlanStore((s) => s.items);
      seenItems.push(items.map((i) => i.id));
      return <div />;
    }
    function Probe(): JSX.Element | null {
      const { ready } = usePlanPersistence(store);
      return ready ? <Workspace /> : null;
    }
    render(<Probe />);
    expect(seenItems).toEqual([]);
    await settle();
    expect(seenItems[0]).toEqual(['saved-box']);
    expect(currentDoc()).toEqual(SAVED);
    expect(useUiStore.getState().notice).toBeNull();
  });

  it('is not ready and saves nothing while load has not resolved', async () => {
    const store = createFakePlanStore({ load: { type: 'pending' } });
    const { result } = renderHook(() => usePlanPersistence(store));
    await settle();
    expect(result.current.ready).toBe(false);
    nudgeBed();
    advance(1000);
    expect(store.saveCalls).toHaveLength(0);
  });

  it('uses the seeded document and shows no notice when nothing is saved', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'empty' } } });
    await mountReady(store);
    expect(currentDoc()).toEqual(createInitialDocument());
    expect(useUiStore.getState().notice).toBeNull();
  });

  it('uses the seeded document and shows the invalid-plan notice when the saved plan is invalid', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'invalid' } } });
    await mountReady(store);
    expect(currentDoc()).toEqual(createInitialDocument());
    expect(useUiStore.getState().notice).toBe(INVALID_TEXT);
  });

  it('uses the seeded document and shows the storage notice when storage is unavailable', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'unavailable' } } });
    await mountReady(store);
    expect(currentDoc()).toEqual(createInitialDocument());
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
  });

  it('treats a rejected load like unavailable storage, without an unhandled rejection', async () => {
    const store = createFakePlanStore({ load: { type: 'reject', error: new Error('offline') } });
    await mountReady(store);
    expect(currentDoc()).toEqual(createInitialDocument());
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
  });

  it('applies a loaded document with a door, and saves nothing for it', async () => {
    const withDoor = planDoc(rectRoom(120, 150, 96), [], 'ft', [DOOR], [BOX]);
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'loaded', doc: withDoor } } });
    await mountReady(store);
    expect(usePlanStore.getState().openings).toEqual([DOOR]);
    expect(usePlanStore.getState().obstacles).toEqual([BOX]);
    expect(currentDoc()).toEqual(withDoor);
    advance(CONFIG.saveDebounceMs * 3);
    await settle();
    expect(store.saveCalls).toHaveLength(0);
  });

  it('does not save the document it applied from load', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'loaded', doc: SAVED } } });
    await mountReady(store);
    advance(CONFIG.saveDebounceMs * 3);
    await settle();
    expect(store.saveCalls).toHaveLength(0);
  });

  it('writes nothing and subscribes to nothing when load resolves after unmount', async () => {
    const store = createFakePlanStore({ load: { type: 'pending' } });
    const { result, unmount } = renderHook(() => usePlanPersistence(store));
    const before = currentDoc();
    unmount();
    store.pendingLoads[0].resolve({ status: 'newer' });
    await settle();
    expect(result.current.ready).toBe(false);
    expect(currentDoc()).toEqual(before);
    expect(useUiStore.getState().notice).toBeNull();
    expect(useUiStore.getState().saveBlocked).toBe(false);
    nudgeBed();
    advance(1000);
    expect(store.saveCalls).toHaveLength(0);
  });

  it('shows no notice when load rejects after unmount', async () => {
    const store = createFakePlanStore({ load: { type: 'pending' } });
    const { unmount } = renderHook(() => usePlanPersistence(store));
    unmount();
    store.pendingLoads[0].reject(new Error('late'));
    await settle();
    expect(useUiStore.getState().notice).toBeNull();
  });
});

describe('usePlanPersistence: newer plan', () => {
  it('uses the seeded document, shows the newer-version notice and blocks saving', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'newer' } } });
    const { unmount } = await mountReady(store);
    expect(currentDoc()).toEqual(createInitialDocument());
    expect(useUiStore.getState().notice).toBe(NEWER_TEXT);
    expect(useUiStore.getState().saveBlocked).toBe(true);
    nudgeBed();
    advance(1000);
    nudgeBed();
    act(() => usePlanStore.getState().removeItem('seed-desk'));
    advance(100);
    unmount();
    advance(1000);
    await settle();
    expect(store.saveCalls).toHaveLength(0);
  });

  it('resumes saving once saveBlocked is cleared by a UI reset', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'newer' } } });
    await mountReady(store);
    act(() => useUiStore.getState().reset());
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(1);
  });
});

describe('usePlanPersistence: autosave', () => {
  it('saves once, after 300 ms of quiet, the document as it is after the last of three changes', async () => {
    const store = createFakePlanStore();
    await mountReady(store);
    nudgeBed();
    advance(100);
    nudgeBed();
    advance(100);
    nudgeBed();
    advance(CONFIG.saveDebounceMs - 1);
    expect(store.saveCalls).toHaveLength(0);
    advance(1);
    expect(store.saveCalls).toHaveLength(1);
    expect(store.saveCalls[0]).toEqual(currentDoc());
    expect(store.saveCalls[0].items.find((i) => i.id === 'seed-bed')?.x).toBe(75);
    advance(1000);
    expect(store.saveCalls).toHaveLength(1);
  });

  it('passes save an object with exactly the six document keys', async () => {
    const store = createFakePlanStore();
    await mountReady(store);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    expect(Object.keys(store.saveCalls[0]).sort()).toEqual(['items', 'obstacles', 'openings', 'room', 'schemaVersion', 'units']);
  });

  it('saves once when the openings list is replaced, with all six fields', async () => {
    const store = createFakePlanStore();
    await mountReady(store);
    act(() => usePlanStore.setState({ openings: [DOOR] }));
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(1);
    expect(store.saveCalls[0]).toEqual(currentDoc());
    expect(store.saveCalls[0].openings).toEqual([DOOR]);
    advance(1000);
    expect(store.saveCalls).toHaveLength(1);
  });

  it('saves once when the obstacles list is replaced, with all six fields', async () => {
    const store = createFakePlanStore();
    await mountReady(store);
    act(() => usePlanStore.setState({ obstacles: [BOX] }));
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(1);
    expect(store.saveCalls[0]).toEqual(currentDoc());
    expect(store.saveCalls[0].obstacles).toEqual([BOX]);
  });

  it('does not save for UI state changes or plan updates that change no document field', async () => {
    const store = createFakePlanStore();
    await mountReady(store);
    act(() => {
      useUiStore.getState().select('seed-bed');
      useUiStore.getState().setLayout('split');
      useUiStore.getState().setCamera({ yaw: 1, pitch: 0.5, zoom: 1.5 });
      useUiStore.getState().setMode('room');
      const s = usePlanStore.getState();
      usePlanStore.setState({
        schemaVersion: s.schemaVersion, units: s.units, room: s.room, items: s.items, openings: s.openings, obstacles: s.obstacles,
      });
    });
    advance(1000);
    await settle();
    expect(store.saveCalls).toHaveLength(0);
  });

  it('shows the storage notice when save resolves false, and leaves it untouched on a second failure', async () => {
    const store = createFakePlanStore({ save: { type: 'resolve', value: false } });
    await mountReady(store);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);

    let uiWrites = 0;
    const stop = useUiStore.subscribe(() => uiWrites++);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    stop();
    expect(store.saveCalls).toHaveLength(2);
    expect(uiWrites).toBe(0);
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
  });

  it('shows the storage notice when save rejects, without an unhandled rejection', async () => {
    const store = createFakePlanStore({ save: { type: 'reject', error: new Error('quota') } });
    await mountReady(store);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);

    let uiWrites = 0;
    const stop = useUiStore.subscribe(() => uiWrites++);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    stop();
    expect(store.saveCalls).toHaveLength(2);
    expect(uiWrites).toBe(0);
  });
});

describe('usePlanPersistence: storage notice once per mount', () => {
  it('exports the storage notice text', () => {
    expect(STORAGE_NOTICE).toBe(STORAGE_TEXT);
  });

  it('a failed save after the notice was dismissed does not show it again', async () => {
    const store = createFakePlanStore({ save: { type: 'resolve', value: false } });
    await mountReady(store);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);

    act(() => useUiStore.getState().setNotice(null));
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    expect(store.saveCalls).toHaveLength(2);
    expect(useUiStore.getState().notice).toBeNull();
  });

  it('a failed save after an unavailable load whose notice was dismissed does not show it again', async () => {
    const store = createFakePlanStore({
      load: { type: 'resolve', value: { status: 'unavailable' } },
      save: { type: 'reject', error: new Error('blocked') },
    });
    await mountReady(store);
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);

    act(() => useUiStore.getState().setNotice(null));
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    expect(store.saveCalls).toHaveLength(1);
    expect(useUiStore.getState().notice).toBeNull();
  });

  it('a UI reset does not re-arm it within the same mount', async () => {
    const store = createFakePlanStore({ save: { type: 'resolve', value: false } });
    await mountReady(store);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);

    act(() => useUiStore.getState().reset());
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    expect(store.saveCalls).toHaveLength(2);
    expect(useUiStore.getState().notice).toBeNull();
  });

  it('leaves the invalid-plan notice to show as before', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'invalid' } } });
    await mountReady(store);
    expect(useUiStore.getState().notice).toBe(INVALID_TEXT);
  });

  it('shows the notice again in a new mount', async () => {
    const store = createFakePlanStore({ save: { type: 'resolve', value: false } });
    const first = await mountReady(store);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    first.unmount();
    act(() => useUiStore.getState().setNotice(null));

    const second = createFakePlanStore({ save: { type: 'resolve', value: false } });
    await mountReady(second);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    await settle();
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
  });
});

describe('usePlanPersistence: unmount', () => {
  it('flushes a pending save immediately on unmount, exactly once', async () => {
    const store = createFakePlanStore();
    const { unmount } = await mountReady(store);
    nudgeBed();
    advance(100);
    expect(store.saveCalls).toHaveLength(0);
    const expected = currentDoc();
    unmount();
    expect(store.saveCalls).toHaveLength(1);
    expect(store.saveCalls[0]).toEqual(expected);
    advance(1000);
    expect(store.saveCalls).toHaveLength(1);
  });

  it('saves nothing on unmount when nothing is pending, and stops listening', async () => {
    const store = createFakePlanStore();
    const { unmount } = await mountReady(store);
    unmount();
    expect(store.saveCalls).toHaveLength(0);
    nudgeBed();
    advance(1000);
    expect(store.saveCalls).toHaveLength(0);
  });
});

describe('usePlanPersistence: page hide', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Makes document.visibilityState read `state` and dispatches visibilitychange. */
  function visibility(state: DocumentVisibilityState): void {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }

  function pageHide(): void {
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
  }

  it('pagehide flushes a pending save at once with the current document, and the timer does not save again', async () => {
    const store = createFakePlanStore();
    await mountReady(store);
    nudgeBed();
    advance(100);
    expect(store.saveCalls).toHaveLength(0);
    pageHide();
    expect(store.saveCalls).toHaveLength(1);
    expect(store.saveCalls[0]).toEqual(currentDoc());
    advance(1000);
    await settle();
    expect(store.saveCalls).toHaveLength(1);
  });

  it('visibilitychange to hidden flushes a pending save at once, and the timer does not save again', async () => {
    const store = createFakePlanStore();
    await mountReady(store);
    nudgeBed();
    advance(100);
    visibility('hidden');
    expect(store.saveCalls).toHaveLength(1);
    expect(store.saveCalls[0]).toEqual(currentDoc());
    advance(1000);
    await settle();
    expect(store.saveCalls).toHaveLength(1);
  });

  it('visibilitychange to visible does not save; the pending save still happens on its timer', async () => {
    const store = createFakePlanStore();
    await mountReady(store);
    nudgeBed();
    advance(100);
    visibility('visible');
    expect(store.saveCalls).toHaveLength(0);
    advance(CONFIG.saveDebounceMs - 100);
    expect(store.saveCalls).toHaveLength(1);
  });

  it('saves nothing when nothing is pending', async () => {
    const store = createFakePlanStore();
    await mountReady(store);
    pageHide();
    visibility('hidden');
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(1);
    pageHide();
    visibility('hidden');
    expect(store.saveCalls).toHaveLength(1);
  });

  it('saves nothing while saving is blocked', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'newer' } } });
    await mountReady(store);
    nudgeBed();
    advance(100);
    pageHide();
    visibility('hidden');
    advance(1000);
    await settle();
    expect(store.saveCalls).toHaveLength(0);
  });

  it('under StrictMode one pagehide makes exactly one save', async () => {
    const store = createFakePlanStore();
    const { result } = renderHook(() => usePlanPersistence(store), { wrapper: StrictMode });
    await settle();
    expect(result.current.ready).toBe(true);
    nudgeBed();
    advance(100);
    pageHide();
    expect(store.saveCalls).toHaveLength(1);
  });

  it('removes its listeners on unmount; later events save nothing', async () => {
    const added: [EventTarget, string, EventListenerOrEventListenerObject | null][] = [];
    const removed: [EventTarget, string, EventListenerOrEventListenerObject | null][] = [];
    for (const target of [window, document] as EventTarget[]) {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      vi.spyOn(target, 'addEventListener').mockImplementation((type, fn, opts) => {
        if (type === 'pagehide' || type === 'visibilitychange') added.push([target, type, fn]);
        add(type, fn, opts);
      });
      vi.spyOn(target, 'removeEventListener').mockImplementation((type, fn, opts) => {
        removed.push([target, type, fn]);
        remove(type, fn, opts);
      });
    }
    const store = createFakePlanStore();
    const { unmount } = await mountReady(store);
    expect(added.map(([, type]) => type).sort()).toEqual(['pagehide', 'visibilitychange']);
    nudgeBed();
    advance(100);
    unmount();
    expect(store.saveCalls).toHaveLength(1);
    for (const entry of added) expect(removed).toContainEqual(entry);
    nudgeBed();
    pageHide();
    visibility('hidden');
    advance(1000);
    await settle();
    expect(store.saveCalls).toHaveLength(1);
  });
});

describe('usePlanPersistence: StrictMode', () => {
  it('becomes ready with exactly one active subscription: one change, one save', async () => {
    const store: FakePlanStore = createFakePlanStore();
    const { result } = renderHook(() => usePlanPersistence(store), { wrapper: StrictMode });
    await settle();
    expect(result.current.ready).toBe(true);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(1);
    advance(1000);
    expect(store.saveCalls).toHaveLength(1);
  });

  it('a later re-run of the effect with the same store does not apply the load result again', async () => {
    // Activity hidden → visible runs the effect's cleanup and then the effect again while keeping
    // the component's state and refs, as Fast Refresh does: the same store, the same cached load.
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'loaded', doc: SAVED } } });
    const seen: { ready: boolean }[] = [];
    function Probe(): null {
      seen.push(usePlanPersistence(store));
      return null;
    }
    const view = render(
      <Activity mode="visible">
        <Probe />
      </Activity>,
    );
    await settle();
    expect(seen.at(-1)?.ready).toBe(true);
    expect(currentDoc()).toEqual(SAVED);
    // Edit the document on screen, and set UI state a second apply would overwrite or reset.
    act(() => usePlanStore.getState().moveItemBy('saved-box', 5, 0));
    const edited = currentDoc();
    expect(edited).not.toEqual(SAVED);
    act(() => useUiStore.getState().setNotice('Kept'));
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(1);

    let planWrites = 0;
    let uiWrites = 0;
    const stopPlan = usePlanStore.subscribe(() => planWrites++);
    const stopUi = useUiStore.subscribe(() => uiWrites++);
    view.rerender(
      <Activity mode="hidden">
        <Probe />
      </Activity>,
    );
    await settle();
    view.rerender(
      <Activity mode="visible">
        <Probe />
      </Activity>,
    );
    await settle();
    stopPlan();
    stopUi();
    expect(store.loadCalls).toBe(1);
    expect(planWrites).toBe(0);
    expect(uiWrites).toBe(0);
    expect(currentDoc()).toEqual(edited);
    expect(useUiStore.getState().notice).toBe('Kept');
    expect(seen.at(-1)?.ready).toBe(true);
    advance(1000);
    await settle();
    expect(store.saveCalls).toHaveLength(1);
    // Still subscribed for autosave, exactly once: one change, one save of the edited document.
    act(() => usePlanStore.getState().moveItemBy('saved-box', 1, 0));
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(2);
    expect(store.saveCalls[1]).toEqual(currentDoc());
    advance(1000);
    expect(store.saveCalls).toHaveLength(2);
  });

  it('loads once, so a browser plan discarded as unreadable on load still shows the invalid notice', async () => {
    window.localStorage.setItem(CONFIG.planStorageKey, '{"schemaVersion":2,"items":"x"}');
    const store = createBrowserPlanStore();
    const { result } = renderHook(() => usePlanPersistence(store), { wrapper: StrictMode });
    await settle();
    expect(result.current.ready).toBe(true);
    expect(useUiStore.getState().notice).toBe(INVALID_TEXT);
  });
});

describe('usePlanPersistence: undo history', () => {
  beforeEach(() => {
    clearHistory();
  });

  it('leaves nothing to undo once a saved plan is loaded', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'loaded', doc: SAVED } } });
    await mountReady(store);
    expect(useHistoryStore.getState().canUndo).toBe(false);
  });

  it.each(['empty', 'invalid', 'newer', 'unavailable'] as const)(
    'leaves nothing to undo once a %s load result is applied',
    async (status) => {
      const store = createFakePlanStore({ load: { type: 'resolve', value: { status } } });
      await mountReady(store);
      expect(useHistoryStore.getState().canUndo).toBe(false);
    },
  );

  it('makes one change after a load one step, which undoes to the loaded plan', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'loaded', doc: SAVED } } });
    await mountReady(store);
    act(() => usePlanStore.getState().moveItemBy('saved-box', 5, 0));
    const undone: boolean[] = [];
    act(() => {
      undone.push(undo());
    });
    expect(currentDoc()).toEqual(SAVED);
    act(() => {
      undone.push(undo());
    });
    expect(undone).toEqual([true, false]);
  });

  it('saves the plan an undo puts back', async () => {
    const store = createFakePlanStore({ load: { type: 'resolve', value: { status: 'loaded', doc: SAVED } } });
    await mountReady(store);
    act(() => usePlanStore.getState().moveItemBy('saved-box', 5, 0));
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(1);
    act(() => {
      undo();
    });
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(2);
    expect(store.saveCalls[1]).toEqual(SAVED);
  });
});
