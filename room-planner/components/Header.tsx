import type { Units } from '../domain/types';
import { redo, undo, useHistoryStore } from '../state/historyStore';
import { usePlanStore } from '../state/planStore';
import { SharePanel } from './SharePanel';
import { Segmented, type SegmentedOption } from './ui/Segmented';
import './Sidebar/sidebar.css';

/** U+00A0, added to every other announcement so a repeated word still changes the text. */
const NBSP = '\u00a0';

const UNIT_OPTIONS: readonly SegmentedOption<Units>[] = [
  { value: 'ft', label: 'ft / in' },
  { value: 'm', label: 'm / cm' },
];

/**
 * Top navigation bar: the brand, the Undo and Redo buttons, the Share button with its panel
 * (SharePanel), and the units toggle. Changing units never changes stored lengths. A button with nothing to undo or redo is greyed out with
 * aria-disabled rather than disabled, so it keeps keyboard focus, and clicking it does nothing.
 * A hidden status element announces "Undone" or "Redone" to screen readers. It is in the header from
 * the first render and never re-created, since screen readers often skip a live region inserted
 * together with its text; when announceCount is odd the text ends in a non-breaking space, so the
 * same word twice in a row is still a change of text and is announced both times.
 */
export function Header() {
  const units = usePlanStore((s) => s.units);
  const setUnits = usePlanStore((s) => s.setUnits);
  const canUndo = useHistoryStore((s) => s.canUndo);
  const canRedo = useHistoryStore((s) => s.canRedo);
  const lastAnnouncement = useHistoryStore((s) => s.lastAnnouncement);
  const announceCount = useHistoryStore((s) => s.announceCount);
  return (
    <header className="nav app-header">
      <span className="nav-brand">Room planner</span>
      <div className="header-history">
        <button
          type="button"
          className="btn"
          aria-disabled={canUndo ? undefined : 'true'}
          aria-keyshortcuts="Control+Z Meta+Z"
          onClick={() => {
            undo();
          }}
        >
          Undo
        </button>
        <button
          type="button"
          className="btn"
          aria-disabled={canRedo ? undefined : 'true'}
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
          onClick={() => {
            redo();
          }}
        >
          Redo
        </button>
      </div>
      <div className="header-share">
        <SharePanel />
      </div>
      <span className="note">Units</span>
      <Segmented<Units> name="units" aria-label="Units" value={units} options={UNIT_OPTIONS} onChange={setUnits} />
      <span role="status" className="visually-hidden">
        {lastAnnouncement === null ? '' : lastAnnouncement + (announceCount % 2 === 1 ? NBSP : '')}
      </span>
    </header>
  );
}
