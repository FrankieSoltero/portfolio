import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config';
import type { PlanDocument } from '../domain/types';
import type { LoadResult, PlanStore } from '../services/planStorage';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';

const INVALID_NOTICE = 'Your saved plan could not be read, so the planner started fresh.';
/** The notice shown when the browser's storage cannot be used. */
export const STORAGE_NOTICE = 'This browser is blocking storage, so changes will not be saved.';
const NEWER_NOTICE =
  'Your saved plan was made with a newer version of the planner. It has been left untouched, and changes in this session will not be saved.';

/** The plan store's six document fields as a plain object: what is saved, and nothing else. */
function currentDocument(): PlanDocument {
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
 * Unavailable storage is reported through `reportStorageProblem`.
 */
function applyLoad(result: LoadResult, reportStorageProblem: () => void): void {
  const ui = useUiStore.getState();
  switch (result.status) {
    case 'loaded':
      usePlanStore.getState().reset(result.doc);
      return;
    case 'empty':
      usePlanStore.getState().reset();
      return;
    case 'invalid':
      usePlanStore.getState().reset();
      ui.setNotice(INVALID_NOTICE);
      return;
    case 'newer':
      usePlanStore.getState().reset();
      ui.setSaveBlocked(true);
      ui.setNotice(NEWER_NOTICE);
      return;
    case 'unavailable':
      usePlanStore.getState().reset();
      reportStorageProblem();
      return;
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
 */
export function usePlanPersistence(store: PlanStore): { ready: boolean } {
  const [ready, setReady] = useState(false);
  const loading = useRef<{ store: PlanStore; result: Promise<LoadResult>; applied: boolean } | null>(null);
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

    if (loading.current?.store !== store) loading.current = { store, result: store.load(), applied: false };
    const load = loading.current;
    load.result
      .catch((): LoadResult => ({ status: 'unavailable' }))
      .then((result) => {
        if (!active) return;
        if (!load.applied) {
          load.applied = true;
          applyLoad(result, reportStorageProblem);
        }
        const stopDocument = usePlanStore.subscribe((next, prev) => {
          if (!documentChanged(next, prev)) return;
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
      unsubscribe?.();
      flush();
    };
  }, [store]);

  return { ready };
}
