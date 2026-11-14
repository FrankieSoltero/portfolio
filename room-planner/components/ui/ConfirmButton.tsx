import { type JSX, type KeyboardEvent, useEffect, useRef, useState } from 'react';

/**
 * A button that asks before it acts, inline (no browser dialog). Idle it shows one `label` button;
 * a click arms it, replacing that button with a `confirmLabel` button and a `Cancel` button, and
 * moves focus to `Cancel` (the safe choice). Confirming calls `onConfirm` once and returns to idle;
 * `Cancel`, or Escape while armed, returns to idle without calling it. Whenever it returns to idle,
 * focus goes back to the `label` button so keyboard users are not left on a removed element.
 *
 * While armed, Escape is handled here and stopped from propagating, so it does not also reach the
 * planner's global shortcuts (which would clear the selection). While idle, Escape passes through.
 * `onConfirm` may return a promise; it is not awaited, and a second click before the component has
 * re-rendered is ignored, so a double click never calls it twice.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
}): JSX.Element {
  const [armed, setArmed] = useState(false);
  // Mirrors `armed` synchronously, so two clicks handled before a re-render confirm only once.
  const armedRef = useRef(false);
  // Set by a user action; the effect below moves focus once the new buttons are in the DOM.
  const focusAfterRender = useRef(false);
  const labelRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!focusAfterRender.current) return;
    focusAfterRender.current = false;
    (armed ? cancelRef : labelRef).current?.focus();
  }, [armed]);

  function setArmedAndFocus(next: boolean): void {
    armedRef.current = next;
    focusAfterRender.current = true;
    setArmed(next);
  }

  function confirm(): void {
    if (!armedRef.current) return;
    setArmedAndFocus(false);
    onConfirm();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (!armedRef.current || e.key !== 'Escape') return;
    e.stopPropagation();
    setArmedAndFocus(false);
  }

  return (
    <div className={className ? `confirm-button ${className}` : 'confirm-button'} onKeyDown={onKeyDown}>
      {armed ? (
        <>
          <button type="button" className="btn btn-primary confirm-button-confirm" onClick={confirm}>
            {confirmLabel}
          </button>
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary confirm-button-cancel"
            onClick={() => setArmedAndFocus(false)}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          ref={labelRef}
          type="button"
          className="btn btn-secondary confirm-button-label"
          onClick={() => setArmedAndFocus(true)}
        >
          {label}
        </button>
      )}
    </div>
  );
}
