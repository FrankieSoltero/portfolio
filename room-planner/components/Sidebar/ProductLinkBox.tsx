import { type ChangeEvent, type FormEvent, type JSX, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { LOOKUP_MESSAGES } from '../../services/productLookup';
import { clearPendingLink, lookupProduct } from '../../state/actions';
import { type LookupState, useUiStore } from '../../state/uiStore';
import './sidebar.css';
import './addFurniture.css';

/** The longest link the box accepts, in characters (the lookup's own limit). */
const LINK_MAX_LENGTH = 2048;
const LOADING_TEXT = 'Reading the page…';

/** What the box last saw of the store, to spot the transitions that clear the input. */
interface Seen {
  status: LookupState['status'];
  selectedId: string | null;
  pendingLink: { url: string; host: string } | null;
  /** The input's text when the current pending link was set. */
  linkAtPending: string;
}

/**
 * True when focus has nowhere useful to be: on the page itself, on the Look up button (which
 * disables itself while loading), or inside the preview card (which has just closed).
 */
function focusIsLost(lookUpButton: HTMLButtonElement | null): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body) return true;
  return active === lookUpButton || active.closest('.product-card') !== null;
}

/**
 * The product link box at the top of sidebar section 02: paste an IKEA, Amazon or Wayfair link and
 * look it up (Enter or the button). While the lookup runs the button is disabled and the wait is
 * announced; Enter in the input still starts a new lookup with the current text, replacing the
 * running one. A failed lookup shows its message as an alert, marks the input invalid and keeps the
 * link typed in. When a failed lookup left a pending link, a line says the next piece added by type
 * keeps it; emptying the input drops it, and adding a piece by type that uses it clears the input.
 * The input also clears once the looked-up piece is added to the room. When the preview card closes,
 * or a lookup starts, focus that would otherwise be lost moves to the input. In room-edit mode the
 * input and button are disabled, like the type buttons.
 */
export function ProductLinkBox(): JSX.Element {
  const inputId = useId();
  const noteId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const roomMode = useUiStore((s) => s.mode === 'room');
  const lookup = useUiStore((s) => s.lookup);
  const selectedId = useUiStore((s) => s.selectedId);
  const pendingLink = useUiStore((s) => s.pendingLink);
  const [link, setLink] = useState('');
  const [seen, setSeen] = useState<Seen>({ status: lookup.status, selectedId, pendingLink, linkAtPending: '' });
  const loading = lookup.status === 'loading';
  const error = lookup.status === 'error';
  // The status the focus effect last ran for; it starts at the first status, so mounting moves no focus.
  const lastStatus = useRef(lookup.status);

  // Adjust state during render (not in an effect). Add to room closes the preview and selects the
  // new piece in one step; Cancel selects nothing. Adding a piece by type uses up a pending link and
  // sets the lookup idle; the input is cleared then only if it still holds the text it had when the
  // link was kept.
  if (seen.status !== lookup.status || seen.selectedId !== selectedId || seen.pendingLink !== pendingLink) {
    const placedPreview = seen.status === 'preview' && lookup.status === 'idle' && selectedId !== seen.selectedId;
    const usedPendingLink =
      seen.pendingLink !== null && pendingLink === null && lookup.status === 'idle' && link === seen.linkAtPending;
    if ((placedPreview || usedPendingLink) && link !== '') setLink('');
    const linkAtPending = pendingLink !== null && pendingLink !== seen.pendingLink ? link : seen.linkAtPending;
    setSeen({ status: lookup.status, selectedId, pendingLink, linkAtPending });
  }

  // Closing the preview card removes the focused button with it, and Look up disables itself while
  // loading; either way the browser drops focus to the page, so it is brought back to the input.
  // Focus the user has moved somewhere else is left alone.
  useEffect(() => {
    const was = lastStatus.current;
    lastStatus.current = lookup.status;
    const closedCard = was === 'preview' && lookup.status !== 'preview';
    const startedLoading = was !== 'loading' && lookup.status === 'loading';
    if ((closedCard || startedLoading) && focusIsLost(buttonRef.current)) inputRef.current?.focus();
  }, [lookup.status]);

  function startLookup() {
    if (roomMode || link.trim() === '') return;
    void lookupProduct(link);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setLink(next);
    if (next === '' && useUiStore.getState().pendingLink !== null) clearPendingLink();
  }

  // The disabled button blocks the form's own Enter submission while loading, so Enter is handled here.
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !loading || e.nativeEvent.isComposing) return;
    e.preventDefault();
    startLookup();
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    startLookup();
  }

  return (
    // noValidate: the planner's own link check decides, not the browser's URL field check, which
    // would block `not a link` (hiding the planner's message) and links pasted without https://.
    <form className="product-link" noValidate onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor={inputId}>Paste a product link</label>
        <div className="product-link-row">
          <input
            ref={inputRef}
            id={inputId}
            className="input"
            type="url"
            maxLength={LINK_MAX_LENGTH}
            autoComplete="off"
            aria-describedby={error ? `${noteId} ${errorId}` : noteId}
            aria-invalid={error ? true : undefined}
            disabled={roomMode}
            value={link}
            onChange={onChange}
            onKeyDown={onKeyDown}
          />
          <button ref={buttonRef} type="submit" className="btn" disabled={roomMode || loading}>
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
        <p id={errorId} className="note" role="alert">
          {LOOKUP_MESSAGES[lookup.code]}
        </p>
      )}
      {pendingLink !== null && <p className="note product-link-kept">The next piece you add will keep this link.</p>}
    </form>
  );
}
