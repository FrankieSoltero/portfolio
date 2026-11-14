import { act, render, renderHook } from '@testing-library/react';
import { StrictMode, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import type { PlanDocument } from '../domain/types';
import { createBrowserPlanStore } from '../services/browserPlanStore';
import type { PlanStore } from '../services/planStorage';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { createFakePlanStore, type FakePlanStore } from '../test/fakePlanStore';
import { placedItem, planDoc, rectRoom } from '../test/fixtures';
import { usePlanPersistence } from './usePlanPersistence';

const INVALID_TEXT = 'Your saved plan could not be read, so the planner started fresh.';
const STORAGE_TEXT = 'This browser is blocking storage, so changes will not be saved.';
const NEWER_TEXT =
  'Your saved plan was made with a newer version of the planner. It has been left untouched, and changes in this session will not be saved.';

const SAVED: PlanDocument = planDoc(rectRoom(120, 150, 96), [
  placedItem({ id: 'saved-box', w: 20, d: 20, h: 20, cx: 60, cy: 60 }),
]);

/** The four document fields of the plan store, as a plain object. */
function currentDoc(): PlanDocument {
  const s = usePlanStore.getState();
  return { schemaVersion: s.schemaVersion, units: s.units, room: s.room, items: s.items };
}

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

  it('passes save an object with exactly the four document keys', async () => {
    const store = createFakePlanStore();
    await mountReady(store);
    nudgeBed();
    advance(CONFIG.saveDebounceMs);
    expect(Object.keys(store.saveCalls[0]).sort()).toEqual(['items', 'room', 'schemaVersion', 'units']);
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
      usePlanStore.setState({ schemaVersion: s.schemaVersion, units: s.units, room: s.room, items: s.items });
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

  it('loads once, so a browser plan discarded as unreadable on load still shows the invalid notice', async () => {
    window.localStorage.setItem(CONFIG.planStorageKey, '{"schemaVersion":2,"items":"x"}');
    const store = createBrowserPlanStore();
    const { result } = renderHook(() => usePlanPersistence(store), { wrapper: StrictMode });
    await settle();
    expect(result.current.ready).toBe(true);
    expect(useUiStore.getState().notice).toBe(INVALID_TEXT);
  });
});
