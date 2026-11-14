import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config';
import type { PlanDocument } from '../domain/types';
import type { LoadResult, PlanStore } from '../services/planStorage';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';

const INVALID_NOTICE = 'Your saved plan could not be read, so the planner started fresh.';
const STORAGE_NOTICE = 'This browser is blocking storage, so changes will not be saved.';
const NEWER_NOTICE =
  'Your saved plan was made with a newer version of the planner. It has been left untouched, and changes in this session will not be saved.';

/** The plan store's four document fields as a plain object: what is saved, and nothing else. */
function currentDocument(): PlanDocument {
  const s = usePlanStore.getState();
  return { schemaVersion: s.schemaVersion, units: s.units, room: s.room, items: s.items };
}

/** True when any document field changed (by reference); UI state and no-op updates do not count. */
function documentChanged(a: PlanDocument, b: PlanDocument): boolean {
  return a.schemaVersion !== b.schemaVersion || a.units !== b.units || a.room !== b.room || a.items !== b.items;
}

/** Shows the storage notice, unless it is already showing. */
function reportStorageProblem(): void {
  const ui = useUiStore.getState();
  if (ui.notice !== STORAGE_NOTICE) ui.setNotice(STORAGE_NOTICE);
}

/** Puts the result of a load into the stores: the saved document, or the seeded one and a notice. */
function applyLoad(result: LoadResult): void {
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
 * - A failed or rejected save, and a rejected load, show the storage notice.
 * - On unmount a pending save is made at once, the timer is cleared and the subscription removed.
 * - The load promise is kept for the component's lifetime, so StrictMode's second effect run reuses
 *   it instead of loading again (a store may discard an unreadable plan on the first load, and a
 *   second load would then report it as empty). A load that settles after cleanup is ignored.
 */
export function usePlanPersistence(store: PlanStore): { ready: boolean } {
  const [ready, setReady] = useState(false);
  const loading = useRef<{ store: PlanStore; result: Promise<LoadResult> } | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

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

    if (loading.current?.store !== store) loading.current = { store, result: store.load() };
    loading.current.result
      .catch((): LoadResult => ({ status: 'unavailable' }))
      .then((result) => {
        if (!active) return;
        applyLoad(result);
        unsubscribe = usePlanStore.subscribe((next, prev) => {
          if (!documentChanged(next, prev)) return;
          if (timer !== null) clearTimeout(timer);
          timer = setTimeout(save, CONFIG.saveDebounceMs);
        });
        setReady(true);
      });

    return () => {
      active = false;
      unsubscribe?.();
      if (timer !== null) {
        clearTimeout(timer);
        save();
      }
    };
  }, [store]);

  return { ready };
}
