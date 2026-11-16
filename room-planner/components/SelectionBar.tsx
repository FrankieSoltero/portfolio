import { RotateCw, Trash2 } from 'lucide-react';
import { type ChangeEvent, type JSX, useId, useState } from 'react';
import { fmtFurnDims } from '../domain/units';
import { removeSelected, rotateSelected } from '../state/actions';
import { usePlanStore } from '../state/planStore';
import { useConflicts, useSelectedItem } from '../state/selectors';
import { useUiStore } from '../state/uiStore';
import '../styles/app.css';

// The 2D hint adds the owner-approved arrow-key sentence to the handoff copy.
const HINT_2D =
  'Drag a piece on the plan to move it, or nudge it with the arrow keys. Select one to see its clearance to each wall. R turns it 90°, Shift+R turns it 15°, Delete removes. Drag the 3D view to orbit.';
const HINT_3D = 'Drag to orbit, scroll to zoom. Pick a piece from the list to highlight it.';
const HINT_ROOM =
  'Drag a wall to move it, or a corner to change an angle. Double-click a wall to add a corner, or pick a door or window to place. Select something and press Delete to remove it.';

/** Angles are stored to 0.01°, so a draft within half of that still shows the stored angle. */
const ANGLE_DRAFT_TOLERANCE_DEG = 0.005;

/**
 * The typed angle in degrees when it is a number in [0, 360); null for anything else. Shared with
 * the obstacle Angle field in the sidebar, so both accept the same angles.
 */
export function parseAngle(raw: string): number | null {
  if (raw.trim() === '') return null;
  const deg = Number(raw);
  return Number.isFinite(deg) && deg >= 0 && deg < 360 ? deg : null;
}

/**
 * The selected item's angle. The input shows exactly what the user typed; the store is written
 * only when the text is an angle in [0, 360). The draft is re-seeded when the selected item
 * changes, or when the stored angle changes to something the draft does not show.
 */
function AngleField({ itemId, angle }: { itemId: string; angle: number }): JSX.Element {
  const id = useId();
  const setItemAngle = usePlanStore((s) => s.setItemAngle);
  const [draft, setDraft] = useState(() => String(angle));
  const [seen, setSeen] = useState({ itemId, angle });

  // Adjust state during render (not in an effect) so the input never shows a stale draft.
  if (seen.itemId !== itemId || seen.angle !== angle) {
    const parsed = parseAngle(draft);
    const draftShowsStored = parsed !== null && Math.abs(parsed - angle) <= ANGLE_DRAFT_TOLERANCE_DEG;
    if (seen.itemId !== itemId || !draftShowsStored) setDraft(String(angle));
    setSeen({ itemId, angle });
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDraft(raw);
    const deg = parseAngle(raw);
    if (deg !== null) setItemAngle(itemId, deg);
  }

  return (
    <div className="angle-field">
      <label htmlFor={id} className="angle-field-label">
        Angle
      </label>
      <div className="angle-field-control">
        <input
          id={id}
          className="input angle-field-input"
          type="number"
          min={0}
          max={359}
          step={1}
          value={draft}
          onChange={onChange}
        />
        <span className="angle-field-suffix" aria-hidden="true">
          °
        </span>
      </div>
    </div>
  );
}

/**
 * The bar below the stage: the selected item's name, size, conflict reason, angle and actions, or
 * a hint for whichever view is showing when nothing is selected. In room mode it shows only the
 * room-mode hint (the 3D hint while the plan is hidden). Prototype lines 198–216.
 */
export function SelectionBar(): JSX.Element {
  const selectedItem = useSelectedItem();
  const units = usePlanStore((s) => s.units);
  const conflicts = useConflicts();
  const layout = useUiStore((s) => s.layout);
  const tab = useUiStore((s) => s.tab);
  const roomMode = useUiStore((s) => s.mode === 'room');
  const planVisible = layout !== 'tabs' || tab === '2d';
  // Room mode has no item controls, even if an item id is somehow still selected.
  const selected = roomMode ? undefined : selectedItem;
  const note = selected ? conflicts[selected.id] : undefined;
  const hint = !planVisible ? HINT_3D : roomMode ? HINT_ROOM : HINT_2D;

  return (
    <div className="selection-bar">
      {selected ? (
        <>
          <div className="selection-info">
            <span className="selection-name">{selected.name}</span>
            <span className="text-muted selection-dims">{fmtFurnDims(selected, units)}</span>
            {note !== undefined && <span className="selection-note">{note}</span>}
          </div>
          <div className="selection-actions">
            <AngleField itemId={selected.id} angle={selected.angle} />
            <button type="button" className="btn btn-secondary" onClick={() => rotateSelected()}>
              <RotateCw size={16} strokeWidth={1.5} aria-hidden />
              Rotate 90°
            </button>
            <button type="button" className="btn btn-ghost" onClick={removeSelected}>
              <Trash2 size={16} strokeWidth={1.5} aria-hidden />
              Remove
            </button>
          </div>
        </>
      ) : (
        <span className="text-muted selection-hint">{hint}</span>
      )}
    </div>
  );
}
