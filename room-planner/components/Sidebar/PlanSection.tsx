import { type JSX, useRef } from 'react';
import { STORAGE_NOTICE } from '../../hooks/usePlanPersistence';
import type { PlanStore } from '../../services/planStorage';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { ConfirmButton } from '../ui/ConfirmButton';
import './sidebar.css';

/**
 * Starts over: erases the saved plan, then restores the seeded plan and the initial UI state.
 *
 * Order matters. The saved key is cleared first and awaited. The plan store is reset next; that
 * changes the document, so the autosave writes the seeded plan back after its debounce. The UI
 * store is reset last, which clears any notice and lifts `saveBlocked` (so a session that found a
 * plan from a newer planner saves again: the visitor has confirmed erasing it). If clearing
 * failed, the storage notice is set after the UI reset so the reset does not wipe it. What the
 * browser can do is kept: if WebGL was found unavailable, it is marked unavailable again after the
 * UI reset, so the 3D view does not try WebGL again. Never rejects.
 */
async function resetPlan(planStore: PlanStore): Promise<void> {
  let cleared = true;
  try {
    await planStore.clear();
  } catch {
    cleared = false;
  }
  usePlanStore.getState().reset();
  const webglAvailable = useUiStore.getState().webglAvailable;
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
      <p className="note plan-section-note">Saved in this browser only. Nothing is sent anywhere.</p>
      <ConfirmButton
        className="plan-section-reset"
        label="Reset plan"
        confirmLabel="Erase everything and start over"
        onConfirm={onConfirmReset}
      />
    </section>
  );
}
