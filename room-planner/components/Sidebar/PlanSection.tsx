import { type JSX, useRef } from 'react';
import { STORAGE_NOTICE } from '../../hooks/usePlanPersistence';
import type { PlanStore } from '../../services/planStorage';
import { clearShareFragment } from '../../services/shareLocation';
import { dismissLookup } from '../../state/actions';
import { clearHistory } from '../../state/historyStore';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { ConfirmButton } from '../ui/ConfirmButton';
import './sidebar.css';

/**
 * Starts over: erases the saved plan, then restores the starting plan (the empty room) and the initial UI state.
 *
 * Order matters. The saved key is cleared first and awaited. Any shared-plan preview is then ended
 * and the `#plan=` fragment removed, so the reset below is saved like any other. The plan store is
 * reset next; that
 * changes the document, so the autosave writes the starting plan back after its debounce; the undo
 * history is cleared right after it, so the reset cannot be undone. Any product lookup still
 * running is dismissed before the UI store is reset, so it cannot post its preview afterwards.
 * The UI store is reset last,
 * which clears any notice and lifts `saveBlocked` (so a session that found a plan from a newer
 * planner saves again: the visitor has confirmed erasing it). If clearing failed, the storage
 * notice is set after the UI reset so the reset does not wipe it. What the browser can do is kept:
 * if WebGL was found unavailable, it is marked unavailable again after the UI reset, so the 3D view
 * does not try WebGL again. Never rejects.
 */
async function resetPlan(planStore: PlanStore): Promise<void> {
  let cleared = true;
  try {
    await planStore.clear();
  } catch {
    cleared = false;
  }
  // A shared-plan preview ends first, so the autosave saves the starting plan as after any reset,
  // and the share fragment goes, so a reload does not open the shared plan again.
  useUiStore.getState().setSharedPreview(null);
  clearShareFragment();
  usePlanStore.getState().reset();
  clearHistory();
  const webglAvailable = useUiStore.getState().webglAvailable;
  dismissLookup();
  useUiStore.getState().reset();
  if (!webglAvailable) useUiStore.getState().markWebglUnavailable();
  if (!cleared) useUiStore.getState().setNotice(STORAGE_NOTICE);
}

/** Sidebar section 04: where the plan is kept, and a confirmed way to start over. */
export function PlanSection({ planStore }: { planStore: PlanStore }): JSX.Element {
  // True while a reset's clear() has not settled: confirming again then does nothing.
  const resetting = useRef(false);

  function onConfirmReset(): void {
    if (resetting.current) return;
    resetting.current = true;
    void resetPlan(planStore).finally(() => {
      resetting.current = false;
    });
  }

  return (
    <section className="sidebar-section plan-section">
      <h6 className="sidebar-heading">
        <span className="sidebar-heading-num">04</span>
        <span>Plan</span>
      </h6>
      <p className="note plan-section-note">
        Saved in this browser only. A share link contains the whole plan. A pasted product link is sent to this site to
        read the page, and the product photo loads from the shop.
      </p>
      <ConfirmButton
        className="plan-section-reset"
        label="Reset plan"
        confirmLabel="Erase everything and start over"
        onConfirm={onConfirmReset}
      />
    </section>
  );
}
