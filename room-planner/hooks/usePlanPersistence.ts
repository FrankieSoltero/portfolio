import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config';
import type { PlanDocument } from '../domain/types';
import type { LoadResult, PlanStore } from '../services/planStorage';
import { decodePlan, type ShareDecodeResult } from '../services/shareLink';
import { clearShareFragment, readShareData, reloadPage } from '../services/shareLocation';
import { clearHistory } from '../state/historyStore';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';

const INVALID_NOTICE = 'Your saved plan could not be read, so the planner started fresh.';
/** The notice shown when the browser's storage cannot be used. */
export const STORAGE_NOTICE = 'This browser is blocking storage, so changes will not be saved.';
const NEWER_NOTICE =
  'Your saved plan was made with a newer version of the planner. It has been left untouched, and changes in this session will not be saved.';
/** Shown when a shared plan was opened as the visitor's own plan. */
export const SHARED_OPENED_NOTICE = 'Opened a shared plan.';
/** Shown when the address held share data that could not be read. */
export const SHARED_INVALID_NOTICE = 'This shared link could not be read.';
/** Shown when the address held share data from a newer planner. */
export const SHARED_NEWER_NOTICE = 'This shared link was made with a newer version of the planner.';

/** What the load at mount found: the visitor's own saved plan, and the decoded share data if any. */
interface Opening {
  own: LoadResult;
  /** Null when the address held no share data. */
  shared: ShareDecodeResult | null;
}

/** The plan store's six document fields as a plain object: what is saved, and nothing else. */
export function currentDocument(): PlanDocument {
  const s = usePlanStore.getState();
  return {
    schemaVersion: s.schemaVersion,
    units: s.units,
    room: s.room,
    items: s.items,
    openings: s.openings,
    obstacles: s.obstacles,
  };
}

/** True when any document field changed (by reference); UI state and no-op updates do not count. */
function documentChanged(a: PlanDocument, b: PlanDocument): boolean {
  return (
    a.schemaVersion !== b.schemaVersion ||
    a.units !== b.units ||
    a.room !== b.room ||
    a.items !== b.items ||
    a.openings !== b.openings ||
    a.obstacles !== b.obstacles
  );
}

/**
 * Puts the result of a load into the stores: the saved document, or the seeded one and a notice.
 * Unavailable storage is reported through `reportStorageProblem`. The undo history is cleared after
 * the reset, so the first step is never taking back the load.
 */
function applyLoad(result: LoadResult, reportStorageProblem: () => void): void {
  const ui = useUiStore.getState();
  switch (result.status) {
    case 'loaded':
      usePlanStore.getState().reset(result.doc);
      clearHistory();
      return;
    case 'empty':
      usePlanStore.getState().reset();
      clearHistory();
      return;
    case 'invalid':
      usePlanStore.getState().reset();
      clearHistory();
      ui.setNotice(INVALID_NOTICE);
      return;
    case 'newer':
      usePlanStore.getState().reset();
      clearHistory();
      ui.setSaveBlocked(true);
      ui.setNotice(NEWER_NOTICE);
      return;
    case 'unavailable':
      usePlanStore.getState().reset();
      clearHistory();
      reportStorageProblem();
      return;
  }
}

/**
 * Starts the load at mount: reads the address's share data once, then loads the saved plan and,
 * when there is share data, decodes it, waiting for both. Never rejects: a rejected load counts as
 * `unavailable`, and a rejected decode as `invalid`.
 */
function startOpening(store: PlanStore): Promise<Opening> {
  const data = readShareData();
  const own = store.load();
  if (data === null) {
    return own.then(
      (result): Opening => ({ own: result, shared: null }),
      (): Opening => ({ own: { status: 'unavailable' }, shared: null }),
    );
  }
  return Promise.all([
    own.catch((): LoadResult => ({ status: 'unavailable' })),
    decodePlan(data).catch((): ShareDecodeResult => ({ status: 'invalid' })),
  ]).then(([result, shared]): Opening => ({ own: result, shared }));
}

/**
 * Puts what the load at mount found into the stores.
 *
 * - No share data: the saved plan is applied as `applyLoad` does.
 * - Share data that could not be used: the saved plan is applied, then the shared-link notice
 *   replaces any notice it set, and the fragment is removed.
 * - A shared plan: it replaces the plan in the store and the history is cleared. With a saved plan
 *   it is a preview that can be kept, and the fragment stays. With nothing usable saved it becomes
 *   the visitor's own plan: it is saved once and the fragment removed. When the saved plan is from a
 *   newer planner or storage is unavailable it is a preview that cannot be kept (storage problems
 *   are reported).
 *
 * A shared plan reaches the stores only as the `doc` of a decode `ok` result.
 */
function applyOpening({ own, shared }: Opening, store: PlanStore, reportStorageProblem: () => void): void {
  if (shared === null) {
    applyLoad(own, reportStorageProblem);
    return;
  }
  const ui = useUiStore.getState();
  if (shared.status !== 'ok') {
    applyLoad(own, reportStorageProblem);
    ui.setNotice(shared.status === 'newer' ? SHARED_NEWER_NOTICE : SHARED_INVALID_NOTICE);
    clearShareFragment();
    return;
  }
  usePlanStore.getState().reset(shared.doc);
  clearHistory();
  switch (own.status) {
    case 'loaded':
      ui.setSharedPreview({ canKeep: true });
      return;
    case 'empty':
    case 'invalid':
      clearShareFragment();
      store.save(shared.doc).then(
        (ok) => {
          if (ok) ui.setNotice(SHARED_OPENED_NOTICE);
          else reportStorageProblem();
        },
        () => reportStorageProblem(),
      );
      return;
    case 'newer':
      ui.setSharedPreview({ canKeep: false });
      return;
    case 'unavailable':
      ui.setSharedPreview({ canKeep: false });
      reportStorageProblem();
      return;
  }
}

/** True while a `keepSharedPlan` save has not settled. */
let keeping = false;
/** True while a `leaveSharedPlan` load has not settled. */
let leaving = false;

/**
 * Keeps the previewed shared plan as the visitor's own: saves the plan as it is now (edits made
 * while previewing included), then ends the preview, removes the fragment and clears the undo
 * history, so autosave resumes. Does nothing without a preview that can be kept, or while an
 * earlier call has not settled. If the save fails, the storage notice is shown and the preview and
 * fragment stay. Never rejects.
 */
export async function keepSharedPlan(store: PlanStore): Promise<void> {
  const preview = useUiStore.getState().sharedPreview;
  if (preview === null || !preview.canKeep || keeping) return;
  keeping = true;
  try {
    let saved: boolean;
    try {
      saved = await store.save(currentDocument());
    } catch {
      saved = false;
    }
    if (!saved) {
      useUiStore.getState().setNotice(STORAGE_NOTICE);
      return;
    }
    useUiStore.getState().setSharedPreview(null);
    clearShareFragment();
    clearHistory();
  } finally {
    keeping = false;
  }
}

/**
 * Leaves the previewed shared plan for the visitor's own: loads the saved plan (a rejection counts
 * as `unavailable`) and applies it exactly as a load at mount does (so it is not saved back), ends
 * the preview and removes the fragment. Does nothing without a preview, or while an earlier call
 * has not settled. Never rejects.
 */
export async function leaveSharedPlan(store: PlanStore): Promise<void> {
  if (useUiStore.getState().sharedPreview === null || leaving) return;
  leaving = true;
  try {
    let result: LoadResult;
    try {
      result = await store.load();
    } catch {
      result = { status: 'unavailable' };
    }
    // Applied while the preview is still set, so the autosave does not schedule a save of it.
    applyLoad(result, () => useUiStore.getState().setNotice(STORAGE_NOTICE));
    useUiStore.getState().setSharedPreview(null);
    clearShareFragment();
  } finally {
    leaving = false;
  }
}

/**
 * Loads the saved plan from `store` on mount, then saves every document change, debounced by
 * `CONFIG.saveDebounceMs`. `ready` is false until the load has been applied, so the seeded plan is
 * never shown before a saved one.
 *
 * - The document applied from the load is not saved back: the subscription starts after it.
 * - Nothing is saved while the UI store's `saveBlocked` is true (read at save time).
 * - A failed or rejected save, and an unavailable or rejected load, show the storage notice, at most
 *   once per mount: once dismissed (or cleared by a UI reset) it is not shown again, so a browser
 *   that blocks storage does not re-show it on every edit. The other notices are unaffected.
 * - On unmount a pending save is made at once, the timer is cleared and the subscription removed.
 * - Closing or reloading the tab does not unmount React, so while subscribed a pending save is also
 *   made at once on `pagehide` and when the page becomes hidden (`visibilitychange`).
 * - The load promise is kept for the component's lifetime, so StrictMode's second effect run reuses
 *   it instead of loading again (a store may discard an unreadable plan on the first load, and a
 *   second load would then report it as empty). A load that settles after cleanup is ignored.
 * - A load result is applied at most once per store: a later re-run of the effect with the same
 *   store (Fast Refresh, an Activity shown again) only subscribes and reports ready, so the live
 *   document is not replaced by the one loaded at mount.
 * - The address's share data is read once with the load, and kept and applied with it (see
 *   `applyOpening`). While the UI store's `sharedPreview` is set, document changes schedule no save.
 * - While mounted, a `hashchange` to an address with share data reloads the page.
 */
export function usePlanPersistence(store: PlanStore): { ready: boolean } {
  const [ready, setReady] = useState(false);
  const loading = useRef<{ store: PlanStore; opening: Promise<Opening>; applied: boolean } | null>(null);
  const storageNoticeShown = useRef(false);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    /** Shows the storage notice the first time storage fails in this mount; later failures stay quiet. */
    function reportStorageProblem(): void {
      if (storageNoticeShown.current) return;
      storageNoticeShown.current = true;
      useUiStore.getState().setNotice(STORAGE_NOTICE);
    }

    function save(): void {
      timer = null;
      if (useUiStore.getState().saveBlocked) return;
      store.save(currentDocument()).then(
        (ok) => {
          if (!ok) reportStorageProblem();
        },
        () => reportStorageProblem(),
      );
    }

    /** Makes a pending save now, if there is one. */
    function flush(): void {
      if (timer === null) return;
      clearTimeout(timer);
      save();
    }

    function onVisibilityChange(): void {
      if (document.visibilityState === 'hidden') flush();
    }

    /** A pasted share link changes only the fragment; reloading opens it as a fresh load. */
    function onHashChange(): void {
      if (readShareData() !== null) reloadPage();
    }

    window.addEventListener('hashchange', onHashChange);

    if (loading.current?.store !== store) loading.current = { store, opening: startOpening(store), applied: false };
    const load = loading.current;
    load.opening.then((opening) => {
      if (!active) return;
      if (!load.applied) {
        load.applied = true;
        applyOpening(opening, store, reportStorageProblem);
      }
      const stopDocument = usePlanStore.subscribe((next, prev) => {
        if (!documentChanged(next, prev)) return;
        // A previewed shared plan is not saved; keeping it saves it explicitly.
        if (useUiStore.getState().sharedPreview !== null) return;
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(save, CONFIG.saveDebounceMs);
      });
      window.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', onVisibilityChange);
      unsubscribe = () => {
        stopDocument();
        window.removeEventListener('pagehide', flush);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
      setReady(true);
    });

    return () => {
      active = false;
      window.removeEventListener('hashchange', onHashChange);
      unsubscribe?.();
      flush();
    };
  }, [store]);

  return { ready };
}
