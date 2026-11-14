import { RotateCw, Trash2 } from 'lucide-react';
import type { JSX } from 'react';
import { fmtFurnDims } from '../domain/units';
import { removeSelected, rotateSelected } from '../state/actions';
import { usePlanStore } from '../state/planStore';
import { useConflicts, useSelectedItem } from '../state/selectors';
import { useUiStore } from '../state/uiStore';
import '../styles/app.css';

// The 2D hint adds the owner-approved arrow-key sentence to the handoff copy.
const HINT_2D =
  'Drag a piece on the plan to move it, or nudge it with the arrow keys. Select one to see its clearance to each wall. R rotates, Delete removes. Drag the 3D view to orbit.';
const HINT_3D = 'Drag to orbit, scroll to zoom. Pick a piece from the list to highlight it.';

/**
 * The bar below the stage: the selected item's name, size, conflict reason and actions, or a
 * hint for whichever view is showing when nothing is selected. Prototype lines 198–216.
 */
export function SelectionBar(): JSX.Element {
  const selected = useSelectedItem();
  const units = usePlanStore((s) => s.units);
  const conflicts = useConflicts();
  const layout = useUiStore((s) => s.layout);
  const tab = useUiStore((s) => s.tab);
  const planVisible = layout !== 'tabs' || tab === '2d';
  const note = selected ? conflicts[selected.id] : undefined;

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
            <button type="button" className="btn btn-secondary" onClick={rotateSelected}>
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
        <span className="text-muted selection-hint">{planVisible ? HINT_2D : HINT_3D}</span>
      )}
    </div>
  );
}
