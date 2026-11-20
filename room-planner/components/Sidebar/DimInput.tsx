import { type ChangeEvent, type JSX, useId, useState } from 'react';
import { furnInputStr, furnUnitLabel, parseFurnInput } from '../../domain/units';
import { usePlanStore } from '../../state/planStore';

/** A draft within this many inches of the stored value still counts as showing it. */
const DRAFT_TOLERANCE_IN = 0.01;

/**
 * One furniture length input, labelled `label` and the plan's furniture unit. The input shows
 * exactly what the user typed; `onValue` is called, in inches, only when the text parses to a length
 * within [`min`, `max`]. The draft is re-seeded from `stored` when the units change, or when
 * `stored` changes to something the draft does not show.
 */
export function DimInput({
  label,
  stored,
  min,
  max,
  onValue,
}: {
  label: string;
  stored: number;
  min: number;
  max: number;
  onValue(inches: number): void;
}): JSX.Element {
  const id = useId();
  const units = usePlanStore((s) => s.units);
  const [draft, setDraft] = useState(() => furnInputStr(stored, units));
  const [seen, setSeen] = useState({ units, stored });

  // Adjust state during render (not in an effect) so the input never shows a stale draft.
  if (seen.units !== units || seen.stored !== stored) {
    const parsed = parseFurnInput(draft, units);
    const draftShowsStored = parsed !== null && Math.abs(parsed - stored) <= DRAFT_TOLERANCE_IN;
    if (seen.units !== units || !draftShowsStored) setDraft(furnInputStr(stored, units));
    setSeen({ units, stored });
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDraft(raw);
    const inches = parseFurnInput(raw, units);
    if (inches !== null && inches >= min && inches <= max) onValue(inches);
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        {label} ({furnUnitLabel(units)})
      </label>
      <input id={id} className="input" type="number" value={draft} onChange={onChange} />
    </div>
  );
}
