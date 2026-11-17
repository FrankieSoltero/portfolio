import { type JSX, useRef } from 'react';
import { keepSharedPlan, leaveSharedPlan } from '../hooks/usePlanPersistence';
import type { PlanStore } from '../services/planStorage';
import { useUiStore } from '../state/uiStore';
import { ConfirmButton } from './ui/ConfirmButton';
import '../styles/app.css';

const KEEPABLE_TEXT = 'Viewing a shared plan. Your own plan is untouched, and changes here are not saved.';
const VIEW_ONLY_TEXT = 'Viewing a shared plan. Changes here are not saved.';

/**
 * The bar shown while a shared plan is previewed (the UI store's `sharedPreview`): what is going on,
 * `Keep this plan` (asks first, then saves the shared plan as the visitor's own) when the preview can
 * be kept, and `Back to my plan`. Renders nothing while there is no preview.
 *
 * One in-flight guard covers both buttons: while either `keepSharedPlan` or `leaveSharedPlan` is
 * pending, a click on either does nothing, so a leave and a keep never run at the same time and
 * leave the screen and the saved plan out of step.
 */
export function SharedBanner({ planStore }: { planStore: PlanStore }): JSX.Element | null {
  const sharedPreview = useUiStore((s) => s.sharedPreview);
  const busy = useRef(false);
  if (sharedPreview === null) return null;

  function run(action: (store: PlanStore) => Promise<void>): void {
    if (busy.current) return;
    busy.current = true;
    const release = (): void => {
      busy.current = false;
    };
    // Both actions never reject; a rejection would still release the guard.
    void action(planStore).then(release, release);
  }

  return (
    <div className="shared-banner" role="status">
      <p className="shared-banner-text">{sharedPreview.canKeep ? KEEPABLE_TEXT : VIEW_ONLY_TEXT}</p>
      {sharedPreview.canKeep && (
        <ConfirmButton label="Keep this plan" confirmLabel="Replace my plan" onConfirm={() => run(keepSharedPlan)} />
      )}
      <button type="button" className="btn btn-secondary" onClick={() => run(leaveSharedPlan)}>
        Back to my plan
      </button>
    </div>
  );
}
