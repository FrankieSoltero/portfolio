import type { JSX } from 'react';
import { useUiStore } from '../state/uiStore';
import '../styles/app.css';

/**
 * The notice bar: the UI store's current notice (for example, that saving is not working) with a
 * button that dismisses it. Renders nothing while there is no notice.
 */
export function Notice(): JSX.Element | null {
  const notice = useUiStore((s) => s.notice);
  const setNotice = useUiStore((s) => s.setNotice);
  if (notice === null) return null;
  return (
    <div className="notice" role="status">
      <p className="notice-text">{notice}</p>
      <button type="button" className="btn btn-ghost notice-dismiss" onClick={() => setNotice(null)}>
        Dismiss
      </button>
    </div>
  );
}
