import { type ChangeEvent, type FormEvent, type JSX, useEffect, useId, useState } from 'react';
import { LOOKUP_MESSAGES } from '../../services/productLookup';
import { clearPendingLink, lookupProduct } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import './sidebar.css';
import './addFurniture.css';

/** The longest link the box accepts, in characters (the lookup's own limit). */
const LINK_MAX_LENGTH = 2048;
const LOADING_TEXT = 'Reading the page…';

/**
 * The product link box at the top of sidebar section 02: paste an IKEA, Amazon or Wayfair link and
 * look it up (Enter or the button). While the lookup runs the button is disabled and the wait is
 * announced; a failed lookup shows its message as an alert and keeps the link typed in. When a failed
 * lookup left a pending link, a line says the next piece added by type keeps it, and emptying the
 * input drops it. The input clears once the looked-up piece is added to the room. In room-edit mode
 * the input and button are disabled, like the type buttons.
 */
export function ProductLinkBox(): JSX.Element {
  const inputId = useId();
  const noteId = useId();
  const roomMode = useUiStore((s) => s.mode === 'room');
  const lookup = useUiStore((s) => s.lookup);
  const hasPendingLink = useUiStore((s) => s.pendingLink !== null);
  const [link, setLink] = useState('');
  const loading = lookup.status === 'loading';

  // Clear the input when the shown preview is placed: a new piece joins the plan carrying the
  // preview's link while the preview is still shown (a piece added by type meanwhile has no link).
  useEffect(
    () =>
      usePlanStore.subscribe((plan, prev) => {
        const current = useUiStore.getState().lookup;
        if (current.status !== 'preview' || plan.items === prev.items) return;
        const { sourceUrl } = current.preview;
        const placed = plan.items.some((item) => item.sourceUrl === sourceUrl && !prev.items.some((p) => p.id === item.id));
        if (placed) setLink('');
      }),
    [],
  );

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setLink(next);
    if (next === '' && useUiStore.getState().pendingLink !== null) clearPendingLink();
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (roomMode || loading || link.trim() === '') return;
    void lookupProduct(link);
  }

  return (
    <form className="product-link" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor={inputId}>Paste a product link</label>
        <div className="product-link-row">
          <input
            id={inputId}
            className="input"
            type="url"
            maxLength={LINK_MAX_LENGTH}
            autoComplete="off"
            aria-describedby={noteId}
            disabled={roomMode}
            value={link}
            onChange={onChange}
          />
          <button type="submit" className="btn" disabled={roomMode || loading}>
            {loading ? LOADING_TEXT : 'Look up'}
          </button>
        </div>
      </div>
      <p id={noteId} className="note">
        Works with IKEA, Amazon and Wayfair.
      </p>
      {/* Stays mounted so screen readers announce the text when it appears. */}
      <p className="visually-hidden" aria-live="polite">
        {loading ? LOADING_TEXT : ''}
      </p>
      {lookup.status === 'error' && (
        <p className="note" role="alert">
          {LOOKUP_MESSAGES[lookup.code]}
        </p>
      )}
      {hasPendingLink && <p className="note product-link-kept">The next piece you add will keep this link.</p>}
    </form>
  );
}
