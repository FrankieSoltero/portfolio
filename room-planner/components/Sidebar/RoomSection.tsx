import { type ChangeEvent, useId, useState } from 'react';
import { fmtArea, parseRoomInput, roomInputStep, roomInputStr, roomUnitLabel } from '../../domain/units';
import type { RoomAxis } from '../../domain/types';
import { usePlanStore } from '../../state/planStore';
import './sidebar.css';

/** A draft within this many inches of the stored value still counts as showing it. */
const DRAFT_TOLERANCE_IN = 0.01;

const FIELDS: readonly { axis: RoomAxis; label: string }[] = [
  { axis: 'w', label: 'Width' },
  { axis: 'l', label: 'Length' },
  { axis: 'h', label: 'Ceiling' },
];

/**
 * One room dimension input. The input shows exactly what the user typed; the store is
 * written only when the text parses to an in-range length. The draft is re-seeded when
 * units change, or when the stored value changes to something the draft does not show.
 */
function RoomDimInput({ axis, label }: { axis: RoomAxis; label: string }) {
  const id = useId();
  const units = usePlanStore((s) => s.units);
  const stored = usePlanStore((s) => s.room[axis]);
  const setRoomDim = usePlanStore((s) => s.setRoomDim);
  const [draft, setDraft] = useState(() => roomInputStr(stored, units));
  const [seen, setSeen] = useState({ units, stored });

  // Adjust state during render (not in an effect) so the input never shows a stale draft.
  if (seen.units !== units || seen.stored !== stored) {
    const parsed = parseRoomInput(draft, units);
    const draftShowsStored = parsed !== null && Math.abs(parsed - stored) <= DRAFT_TOLERANCE_IN;
    if (seen.units !== units || !draftShowsStored) setDraft(roomInputStr(stored, units));
    setSeen({ units, stored });
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDraft(raw);
    const inches = parseRoomInput(raw, units);
    if (inches !== null) setRoomDim(axis, inches);
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-suffix-wrap">
        <input
          id={id}
          className="input"
          type="number"
          step={roomInputStep(units)}
          value={draft}
          onChange={onChange}
        />
        <span className="input-suffix" aria-hidden="true">
          {roomUnitLabel(units)}
        </span>
      </div>
    </div>
  );
}

/** Sidebar section 01: room width, length and ceiling height, plus the floor area. */
export function RoomSection() {
  const units = usePlanStore((s) => s.units);
  const room = usePlanStore((s) => s.room);
  return (
    <section className="sidebar-section">
      <h6 className="sidebar-heading">
        <span className="sidebar-heading-num">01</span>
        <span>Room</span>
      </h6>
      <div className="field-grid-3">
        {FIELDS.map((f) => (
          <RoomDimInput key={f.axis} axis={f.axis} label={f.label} />
        ))}
      </div>
      <div className="note">
        Floor area {fmtArea(room, units)}. You can also drag the room&apos;s edge handles on the plan.
      </div>
    </section>
  );
}
