import type { Units } from '../domain/types';
import { redo, undo, useHistoryStore } from '../state/historyStore';
import { usePlanStore } from '../state/planStore';
import { Segmented, type SegmentedOption } from './ui/Segmented';
import './Sidebar/sidebar.css';

const UNIT_OPTIONS: readonly SegmentedOption<Units>[] = [
  { value: 'ft', label: 'ft / in' },
  { value: 'm', label: 'm / cm' },
];

/**
 * Top navigation bar: the brand, the Undo and Redo buttons, and the units toggle. Changing units
 * never changes stored lengths. A button with nothing to undo or redo is greyed out with
 * aria-disabled rather than disabled, so it keeps keyboard focus, and clicking it does nothing.
 * A hidden status element announces "Undone" or "Redone" to screen readers; it is a new element
 * after every undo or redo, so the same word said twice in a row is announced both times.
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
            if (canUndo) undo();
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
            if (canRedo) redo();
          }}
        >
          Redo
        </button>
      </div>
      <span className="note">Units</span>
      <Segmented<Units> name="units" aria-label="Units" value={units} options={UNIT_OPTIONS} onChange={setUnits} />
      <span role="status" className="visually-hidden" key={announceCount}>
        {lastAnnouncement ?? ''}
      </span>
    </header>
  );
}
