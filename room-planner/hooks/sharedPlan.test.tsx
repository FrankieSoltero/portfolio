import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Activity, StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanSection } from '../components/Sidebar/PlanSection';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import type { PlanDocument } from '../domain/types';
import type { LoadResult, PlanStore } from '../services/planStorage';
import { decodePlan, type ShareDecodeResult } from '../services/shareLink';
import { clearShareFragment, readShareData, reloadPage } from '../services/shareLocation';
import { clearHistory, redo, undo, useHistoryStore } from '../state/historyStore';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { createFakePlanStore, type FakeOutcome, type FakePlanStore } from '../test/fakePlanStore';
import { furnishedDocument, placedItem, planDoc, rectRoom } from '../test/fixtures';
import {
  currentDocument,
  keepSharedPlan,
  leaveSharedPlan,
  SHARED_INVALID_NOTICE,
  SHARED_NEWER_NOTICE,
  SHARED_OPENED_NOTICE,
  usePlanPersistence,
} from './usePlanPersistence';

vi.mock('../services/shareLocation', () => ({
  readShareData: vi.fn(),
  clearShareFragment: vi.fn(),
  shareUrl: vi.fn(),
  reloadPage: vi.fn(),
}));
vi.mock('../services/shareLink', () => ({
  decodePlan: vi.fn(),
  encodePlan: vi.fn(),
}));

const readData = vi.mocked(readShareData);
const clearFragment = vi.mocked(clearShareFragment);
const reload = vi.mocked(reloadPage);
const decode = vi.mocked(decodePlan);

const INVALID_TEXT = 'Your saved plan could not be read, so the planner started fresh.';
const STORAGE_TEXT = 'This browser is blocking storage, so changes will not be saved.';
const NEWER_TEXT =
  'Your saved plan was made with a newer version of the planner. It has been left untouched, and changes in this session will not be saved.';

const OWN: PlanDocument = planDoc(rectRoom(120, 150, 96), [
  placedItem({ id: 'own-box', w: 20, d: 20, h: 20, cx: 60, cy: 60 }),
]);
const SHARED: PlanDocument = planDoc(rectRoom(130, 160, 96), [
  placedItem({ id: 'shared-box', w: 24, d: 24, h: 20, cx: 50, cy: 70 }),
]);
const DATA = '1.sharedData';

/** The six document fields of the plan store, as a plain object. */
function currentDoc(): PlanDocument {
  const s = usePlanStore.getState();
  return { schemaVersion: s.schemaVersion, units: s.units, room: s.room, items: s.items, openings: s.openings, obstacles: s.obstacles };
}

/** Lets pending promise callbacks (and the React updates they cause) run. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Moves the shared box one inch to the right: a document change that can be undone. */
function nudgeShared(): void {
  act(() => usePlanStore.getState().moveItemBy('shared-box', 1, 0));
}

function sharedX(): number | undefined {
  return usePlanStore.getState().items.find((i) => i.id === 'shared-box')?.x;
}

/** Makes one undoable change, so a test can tell the history was cleared afterwards. */
function makeUndoableChange(): void {
  act(() => usePlanStore.getState().moveItemBy('seed-bed', 1, 0));
  expect(useHistoryStore.getState().canUndo).toBe(true);
}

/** Sets the address's share data and what decoding it gives. */
function shareLink(decoded: ShareDecodeResult | 'reject' | 'pending'): void {
  readData.mockReturnValue(DATA);
  if (decoded === 'reject') decode.mockRejectedValue(new Error('must not happen'));
  else if (decoded === 'pending') decode.mockReturnValue(new Promise(() => {}));
  else decode.mockResolvedValue(decoded);
}

function ownStore(load: FakeOutcome<LoadResult>, save?: FakeOutcome<boolean>): FakePlanStore {
  return createFakePlanStore({ load, save });
}

const loaded = (doc: PlanDocument = OWN): FakeOutcome<LoadResult> => ({ type: 'resolve', value: { status: 'loaded', doc } });
const status = (s: 'empty' | 'invalid' | 'newer' | 'unavailable'): FakeOutcome<LoadResult> => ({
  type: 'resolve',
  value: { status: s },
});

async function mountReady(store: PlanStore) {
  const view = renderHook(() => usePlanPersistence(store));
  await settle();
  expect(view.result.current.ready).toBe(true);
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  readData.mockReturnValue(null);
  decode.mockReset();
  // The furnished plan, not the empty starting plan, so a test can tell the starting plan was applied.
  usePlanStore.getState().reset(furnishedDocument());
  useUiStore.getState().reset();
  clearHistory();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shared plan notices', () => {
  it('exports the exact notice texts', () => {
    expect(SHARED_OPENED_NOTICE).toBe('Opened a shared plan.');
    expect(SHARED_INVALID_NOTICE).toBe('This shared link could not be read.');
    expect(SHARED_NEWER_NOTICE).toBe('This shared link was made with a newer version of the planner.');
  });
});

describe('currentDocument', () => {
  it('is the plan store’s six document fields', () => {
    usePlanStore.getState().reset(SHARED);
    expect(currentDocument()).toEqual(SHARED);
    expect(Object.keys(currentDocument()).sort()).toEqual(['items', 'obstacles', 'openings', 'room', 'schemaVersion', 'units']);
  });
});

describe('opening a link: no share data', () => {
  it.each([loaded(), status('empty'), status('invalid'), status('newer'), status('unavailable')])(
    'loads the own plan as today and never decodes (%o)',
    async (load) => {
      const store = ownStore(load);
      await mountReady(store);
      expect(readData).toHaveBeenCalledTimes(1);
      expect(decode).not.toHaveBeenCalled();
      expect(clearFragment).not.toHaveBeenCalled();
      expect(useUiStore.getState().sharedPreview).toBeNull();
    },
  );
});

describe('opening a link: decodes ok', () => {
  it('waits for the own load before applying anything', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore({ type: 'pending' });
    const { result } = renderHook(() => usePlanPersistence(store));
    await settle();
    expect(decode).toHaveBeenCalledWith(DATA);
    expect(result.current.ready).toBe(false);
    expect(currentDoc()).toEqual(furnishedDocument());
    expect(useUiStore.getState().sharedPreview).toBeNull();
    store.pendingLoads[0].resolve({ status: 'loaded', doc: OWN });
    await settle();
    expect(result.current.ready).toBe(true);
    expect(currentDoc()).toEqual(SHARED);
  });

  it('waits for the decode before applying anything', async () => {
    shareLink('pending');
    const store = ownStore(loaded());
    const { result } = renderHook(() => usePlanPersistence(store));
    await settle();
    expect(result.current.ready).toBe(false);
    expect(currentDoc()).toEqual(furnishedDocument());
    expect(useUiStore.getState().notice).toBeNull();
  });

  it('own loaded: shows the shared plan as a preview that can be kept, saving nothing and leaving the fragment', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    makeUndoableChange();
    const store = ownStore(loaded());
    await mountReady(store);
    expect(currentDoc()).toEqual(SHARED);
    expect(useHistoryStore.getState().canUndo).toBe(false);
    expect(useUiStore.getState().sharedPreview).toEqual({ canKeep: true });
    expect(useUiStore.getState().notice).toBeNull();
    expect(useUiStore.getState().saveBlocked).toBe(false);
    advance(CONFIG.saveDebounceMs * 5);
    await settle();
    expect(store.saveCalls).toHaveLength(0);
    expect(clearFragment).not.toHaveBeenCalled();
  });

  it.each(['empty', 'invalid'] as const)(
    'own %s: opens the shared plan as the visitor’s own, saves it once and clears the fragment',
    async (own) => {
      shareLink({ status: 'ok', doc: SHARED });
      makeUndoableChange();
      const store = ownStore(status(own));
      await mountReady(store);
      expect(currentDoc()).toEqual(SHARED);
      expect(useHistoryStore.getState().canUndo).toBe(false);
      expect(store.saveCalls).toEqual([SHARED]);
      expect(useUiStore.getState().notice).toBe(SHARED_OPENED_NOTICE);
      expect(clearFragment).toHaveBeenCalledTimes(1);
      expect(useUiStore.getState().sharedPreview).toBeNull();
      expect(useUiStore.getState().saveBlocked).toBe(false);
      advance(CONFIG.saveDebounceMs * 5);
      await settle();
      expect(store.saveCalls).toHaveLength(1);
    },
  );

  it.each([
    ['resolves false', { type: 'resolve', value: false }],
    ['rejects', { type: 'reject', error: new Error('quota') }],
  ] as const)('own empty, and the save %s: shows the storage notice instead', async (_, save) => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(status('empty'), save);
    await mountReady(store);
    expect(store.saveCalls).toEqual([SHARED]);
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
    expect(clearFragment).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().sharedPreview).toBeNull();
  });

  it('own invalid and the save fails: the invalid-plan notice is not shown', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(status('invalid'), { type: 'resolve', value: false });
    await mountReady(store);
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
  });

  it('own newer: shows a preview that cannot be kept, without blocking saves yet or clearing the fragment', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    makeUndoableChange();
    const store = ownStore(status('newer'));
    await mountReady(store);
    expect(currentDoc()).toEqual(SHARED);
    expect(useHistoryStore.getState().canUndo).toBe(false);
    expect(useUiStore.getState().sharedPreview).toEqual({ canKeep: false });
    expect(useUiStore.getState().saveBlocked).toBe(false);
    expect(useUiStore.getState().notice).toBeNull();
    expect(clearFragment).not.toHaveBeenCalled();
    advance(CONFIG.saveDebounceMs * 5);
    await settle();
    expect(store.saveCalls).toHaveLength(0);
  });

  it.each([
    ['unavailable', status('unavailable')],
    ['rejected', { type: 'reject', error: new Error('offline') } as FakeOutcome<LoadResult>],
  ])('own %s: shows a preview that cannot be kept, and the storage notice', async (_, load) => {
    shareLink({ status: 'ok', doc: SHARED });
    makeUndoableChange();
    const store = ownStore(load);
    await mountReady(store);
    expect(currentDoc()).toEqual(SHARED);
    expect(useHistoryStore.getState().canUndo).toBe(false);
    expect(useUiStore.getState().sharedPreview).toEqual({ canKeep: false });
    expect(useUiStore.getState().saveBlocked).toBe(false);
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
    expect(clearFragment).not.toHaveBeenCalled();
    expect(store.saveCalls).toHaveLength(0);
  });
});

describe('opening a link: decodes invalid or newer', () => {
  const cases = [
    ['invalid', { status: 'invalid' }, SHARED_INVALID_NOTICE],
    ['newer', { status: 'newer' }, SHARED_NEWER_NOTICE],
    ['a rejection', 'reject', SHARED_INVALID_NOTICE],
  ] as const;

  describe.each(cases)('decoding gives %s', (_, decoded, notice) => {
    it('own loaded: applies the own plan, then the shared notice, and clears the fragment', async () => {
      shareLink(decoded);
      const store = ownStore(loaded());
      await mountReady(store);
      expect(currentDoc()).toEqual(OWN);
      expect(useUiStore.getState().notice).toBe(notice);
      expect(useUiStore.getState().sharedPreview).toBeNull();
      expect(clearFragment).toHaveBeenCalledTimes(1);
      expect(useHistoryStore.getState().canUndo).toBe(false);
      advance(CONFIG.saveDebounceMs * 5);
      await settle();
      expect(store.saveCalls).toHaveLength(0);
    });

    it.each(['empty', 'invalid'] as const)('own %s: the empty starting plan, and the shared notice', async (own) => {
      shareLink(decoded);
      const store = ownStore(status(own));
      await mountReady(store);
      expect(currentDoc()).toEqual(createInitialDocument());
      expect(useUiStore.getState().notice).toBe(notice);
      expect(useUiStore.getState().saveBlocked).toBe(false);
      expect(useUiStore.getState().sharedPreview).toBeNull();
      expect(clearFragment).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['unavailable', status('unavailable')],
      ['rejected', { type: 'reject', error: new Error('offline') } as FakeOutcome<LoadResult>],
    ])('own %s: the empty starting plan, and the storage notice stays instead of the shared notice', async (_, load) => {
      shareLink(decoded);
      const store = ownStore(load);
      await mountReady(store);
      expect(currentDoc()).toEqual(createInitialDocument());
      expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
      expect(useUiStore.getState().saveBlocked).toBe(false);
      expect(useUiStore.getState().sharedPreview).toBeNull();
      expect(clearFragment).toHaveBeenCalledTimes(1);
    });

    it('own newer: the empty starting plan with saving blocked, and the newer-plan notice stays instead of the shared notice', async () => {
      shareLink(decoded);
      const store = ownStore(status('newer'));
      await mountReady(store);
      expect(currentDoc()).toEqual(createInitialDocument());
      expect(useUiStore.getState().saveBlocked).toBe(true);
      expect(useUiStore.getState().notice).toBe(NEWER_TEXT);
      expect(useUiStore.getState().sharedPreview).toBeNull();
      expect(clearFragment).toHaveBeenCalledTimes(1);
    });
  });
});

describe('opening a link: once per store', () => {
  it('under StrictMode reads, decodes and applies the share data once', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(status('empty'));
    const { result } = renderHook(() => usePlanPersistence(store), { wrapper: StrictMode });
    await settle();
    expect(result.current.ready).toBe(true);
    expect(readData).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(store.loadCalls).toBe(1);
    expect(store.saveCalls).toEqual([SHARED]);
    expect(clearFragment).toHaveBeenCalledTimes(1);
  });

  it('a later re-run of the effect with the same store does not read or apply the share data again', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(loaded());
    function Probe(): null {
      usePlanPersistence(store);
      return null;
    }
    const view = render(
      <Activity mode="visible">
        <Probe />
      </Activity>,
    );
    await settle();
    expect(currentDoc()).toEqual(SHARED);
    nudgeShared();
    const edited = currentDoc();
    let planWrites = 0;
    const stop = usePlanStore.subscribe(() => planWrites++);
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
    stop();
    expect(readData).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(planWrites).toBe(0);
    expect(currentDoc()).toEqual(edited);
    expect(useUiStore.getState().sharedPreview).toEqual({ canKeep: true });
  });
});

describe('while previewing a shared plan', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves no document change: not after a wait, on pagehide, on a hidden page or on unmount', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(loaded());
    const { unmount } = await mountReady(store);
    nudgeShared();
    advance(CONFIG.saveDebounceMs * 10);
    nudgeShared();
    advance(100);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    nudgeShared();
    unmount();
    advance(CONFIG.saveDebounceMs * 10);
    await settle();
    expect(store.saveCalls).toHaveLength(0);
  });

  it('undo and redo work as usual', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    await mountReady(ownStore(loaded()));
    const start = sharedX();
    nudgeShared();
    expect(sharedX()).toBe((start ?? 0) + 1);
    act(() => {
      expect(undo()).toBe(true);
    });
    expect(currentDoc()).toEqual(SHARED);
    act(() => {
      expect(redo()).toBe(true);
    });
    expect(sharedX()).toBe((start ?? 0) + 1);
  });
});

describe('Reset plan during a preview', () => {
  it('ends the preview, resets the plan, and the autosave saves the empty starting plan after the debounce', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(loaded());
    const hook = await mountReady(store);
    expect(useUiStore.getState().sharedPreview).toEqual({ canKeep: true });
    const section = render(<PlanSection planStore={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Erase everything and start over' }));
    await settle();
    expect(store.clearCalls).toBe(1);
    expect(clearFragment).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().sharedPreview).toBeNull();
    expect(currentDoc()).toEqual(createInitialDocument());
    expect(store.saveCalls).toHaveLength(0);
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toEqual([createInitialDocument()]);
    section.unmount();
    hook.unmount();
  });
});

describe('hashchange', () => {
  it('reloads the page once when the new address has share data, outside a preview too', async () => {
    const { unmount } = await mountReady(ownStore(loaded()));
    expect(useUiStore.getState().sharedPreview).toBeNull();
    readData.mockReturnValue('1.pasted');
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('reloads during a preview too', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const { unmount } = await mountReady(ownStore(loaded()));
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does nothing when the new address has no share data', async () => {
    const { unmount } = await mountReady(ownStore(loaded()));
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(reload).not.toHaveBeenCalled();
    unmount();
  });

  it('under StrictMode one hashchange reloads once', async () => {
    const store = ownStore(loaded());
    const { unmount } = renderHook(() => usePlanPersistence(store), { wrapper: StrictMode });
    await settle();
    readData.mockReturnValue('1.pasted');
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('stops listening on unmount', async () => {
    const { unmount } = await mountReady(ownStore(loaded()));
    unmount();
    readData.mockReturnValue('1.pasted');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('keepSharedPlan', () => {
  it('does nothing without a preview', async () => {
    const store = ownStore(loaded());
    await mountReady(store);
    await act(() => keepSharedPlan(store));
    expect(store.saveCalls).toHaveLength(0);
    expect(clearFragment).not.toHaveBeenCalled();
  });

  it('does nothing when the preview cannot be kept', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(status('newer'));
    await mountReady(store);
    await act(() => keepSharedPlan(store));
    expect(store.saveCalls).toHaveLength(0);
    expect(useUiStore.getState().sharedPreview).toEqual({ canKeep: false });
    expect(clearFragment).not.toHaveBeenCalled();
  });

  it('saves the plan as it is now, then ends the preview, clears the fragment and the history; autosave resumes', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(loaded());
    await mountReady(store);
    nudgeShared();
    const edited = currentDoc();
    expect(edited).not.toEqual(SHARED);
    expect(useHistoryStore.getState().canUndo).toBe(true);
    await act(() => keepSharedPlan(store));
    expect(store.saveCalls).toEqual([edited]);
    expect(useUiStore.getState().sharedPreview).toBeNull();
    expect(clearFragment).toHaveBeenCalledTimes(1);
    expect(useHistoryStore.getState().canUndo).toBe(false);
    nudgeShared();
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(2);
    expect(store.saveCalls[1]).toEqual(currentDoc());
  });

  it.each([
    ['resolves false', { type: 'resolve', value: false }],
    ['rejects', { type: 'reject', error: new Error('quota') }],
  ] as const)('when the save %s: shows the storage notice and keeps the preview and the fragment', async (_, save) => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(loaded());
    await mountReady(store);
    store.saveOutcome = save;
    await act(() => keepSharedPlan(store));
    expect(store.saveCalls).toHaveLength(1);
    expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
    expect(useUiStore.getState().sharedPreview).toEqual({ canKeep: true });
    expect(clearFragment).not.toHaveBeenCalled();
  });

  it('called twice before the first settles: one save', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(loaded(), { type: 'pending' });
    await mountReady(store);
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = keepSharedPlan(store);
      second = keepSharedPlan(store);
    });
    await settle();
    expect(store.saveCalls).toHaveLength(1);
    await act(async () => {
      store.pendingSaves[0].resolve(true);
      await Promise.all([first, second]);
    });
    expect(store.saveCalls).toHaveLength(1);
    expect(useUiStore.getState().sharedPreview).toBeNull();
  });
});

describe('leaveSharedPlan', () => {
  it('does nothing without a preview', async () => {
    const store = ownStore(loaded());
    await mountReady(store);
    await act(() => leaveSharedPlan(store));
    expect(store.loadCalls).toBe(1);
    expect(clearFragment).not.toHaveBeenCalled();
  });

  const results: [string, FakeOutcome<LoadResult>, () => void][] = [
    ['loaded', loaded(), () => {
      expect(currentDoc()).toEqual(OWN);
      expect(useUiStore.getState().notice).toBeNull();
    }],
    ['empty', status('empty'), () => {
      expect(currentDoc()).toEqual(createInitialDocument());
      expect(useUiStore.getState().notice).toBeNull();
    }],
    ['invalid', status('invalid'), () => {
      expect(currentDoc()).toEqual(createInitialDocument());
      expect(useUiStore.getState().notice).toBe(INVALID_TEXT);
    }],
    ['newer', status('newer'), () => {
      expect(currentDoc()).toEqual(createInitialDocument());
      expect(useUiStore.getState().saveBlocked).toBe(true);
      expect(useUiStore.getState().notice).toBe(NEWER_TEXT);
    }],
    ['unavailable', status('unavailable'), () => {
      expect(currentDoc()).toEqual(createInitialDocument());
      expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
    }],
    ['a rejection', { type: 'reject', error: new Error('offline') }, () => {
      expect(currentDoc()).toEqual(createInitialDocument());
      expect(useUiStore.getState().notice).toBe(STORAGE_TEXT);
    }],
  ];

  it.each(results)(
    'own load gives %s: ends the preview and applies it as a normal load, clearing history and the fragment',
    async (_, outcome, check) => {
      shareLink({ status: 'ok', doc: SHARED });
      const store = ownStore(loaded());
      await mountReady(store);
      nudgeShared();
      expect(useHistoryStore.getState().canUndo).toBe(true);
      store.loadOutcome = outcome;
      await act(() => leaveSharedPlan(store));
      expect(store.loadCalls).toBe(2);
      expect(useUiStore.getState().sharedPreview).toBeNull();
      check();
      expect(useHistoryStore.getState().canUndo).toBe(false);
      expect(clearFragment).toHaveBeenCalledTimes(1);
      // As a normal load: the applied plan is not saved back.
      advance(CONFIG.saveDebounceMs * 5);
      await settle();
      expect(store.saveCalls).toHaveLength(0);
    },
  );

  describe('selections', () => {
    /** A shared plan whose corners, item, window and obstacle all have ids the own plan does not. */
    const SHARED_FULL: PlanDocument = planDoc(
      {
        outline: [{ id: 's1', x: 0, y: 0 }, { id: 's2', x: 130, y: 0 }, { id: 's3', x: 130, y: 160 }, { id: 's4', x: 0, y: 160 }],
        height: 96,
      },
      [placedItem({ id: 'shared-box', w: 24, d: 24, h: 20, cx: 50, cy: 70 })],
      'ft',
      [{ id: 'shared-window', kind: 'window', wallId: 's1', offset: 20, width: 30, sill: 30, height: 40 }],
      [{ id: 'shared-post', shape: 'box', label: '', x: 100, y: 120, rotation: 0, width: 10, depth: 10, height: 96, elevation: 0 }],
    );

    it.each([
      ['item', () => useUiStore.getState().select('shared-box'), () => useUiStore.getState().selectedId],
      ['corner', () => useUiStore.getState().selectCorner('s2'), () => useUiStore.getState().selectedCornerId],
      ['wall', () => useUiStore.getState().selectWall('s3'), () => useUiStore.getState().selectedWallId],
      ['opening', () => useUiStore.getState().selectOpening('shared-window'), () => useUiStore.getState().selectedOpeningId],
      ['obstacle', () => useUiStore.getState().selectObstacle('shared-post'), () => useUiStore.getState().selectedObstacleId],
    ])('clears a selected %s that is not in the own plan', async (_, choose, selected) => {
      shareLink({ status: 'ok', doc: SHARED_FULL });
      const store = ownStore(loaded());
      await mountReady(store);
      act(choose);
      expect(selected()).not.toBeNull();
      await act(() => leaveSharedPlan(store));
      expect(currentDoc()).toEqual(OWN);
      expect(selected()).toBeNull();
    });

    it('keeps a selected item and corner that are in the own plan', async () => {
      shareLink({ status: 'ok', doc: SHARED });
      const store = ownStore(loaded());
      await mountReady(store);
      act(() => {
        useUiStore.getState().select('own-box');
        useUiStore.getState().selectCorner('c2');
      });
      await act(() => leaveSharedPlan(store));
      expect(useUiStore.getState().selectedId).toBe('own-box');
      expect(useUiStore.getState().selectedCornerId).toBe('c2');
    });
  });

  it('autosave resumes after leaving', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(loaded());
    await mountReady(store);
    await act(() => leaveSharedPlan(store));
    act(() => usePlanStore.getState().moveItemBy('own-box', 1, 0));
    advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toEqual([currentDoc()]);
  });

  it('called twice before the first settles: one load', async () => {
    shareLink({ status: 'ok', doc: SHARED });
    const store = ownStore(loaded());
    await mountReady(store);
    store.loadOutcome = { type: 'pending' };
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = leaveSharedPlan(store);
      second = leaveSharedPlan(store);
    });
    await settle();
    expect(store.loadCalls).toBe(2);
    await act(async () => {
      store.pendingLoads[0].resolve({ status: 'loaded', doc: OWN });
      await Promise.all([first, second]);
    });
    expect(store.loadCalls).toBe(2);
    expect(currentDoc()).toEqual(OWN);
    expect(useUiStore.getState().sharedPreview).toBeNull();
  });
});
