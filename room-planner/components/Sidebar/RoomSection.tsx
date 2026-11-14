import { type ChangeEvent, useId, useState } from 'react';
import { rectangleSize, setRectangleSize } from '../../domain/outline';
import { fmtArea, parseRoomInput, roomInputStep, roomInputStr, roomUnitLabel } from '../../domain/units';
import { polygonArea } from '../../domain/polygon';
import { roomOutline } from '../../domain/shape';
import { usePlanStore } from '../../state/planStore';
import './sidebar.css';

/** A draft within this many inches of the stored value still counts as showing it. */
const DRAFT_TOLERANCE_IN = 0.01;

/**
 * One room length input. The input shows exactly what the user typed; `onLength` is called only
 * when the text parses to an in-range length. The draft is re-seeded when units change, or when
 * the stored value changes to something the draft does not show.
 */
function RoomDimInput({ label, stored, onLength }: { label: string; stored: number; onLength: (inches: number) => void }) {
  const id = useId();
  const units = usePlanStore((s) => s.units);
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
    if (inches !== null) onLength(inches);
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

/**
 * Sidebar section 01: the room's width and length while it is a rectangle, its ceiling height,
 * and the floor area of its outline.
 */
export function RoomSection() {
  const units = usePlanStore((s) => s.units);
  const room = usePlanStore((s) => s.room);
  const applyOutline = usePlanStore((s) => s.applyOutline);
  const setRoomHeight = usePlanStore((s) => s.setRoomHeight);
  const size = rectangleSize(room.outline);

  // Read the outline at write time, so two edits in one render both apply to the latest room.
  function setSize(change: { w: number } | { l: number }) {
    applyOutline(setRectangleSize(usePlanStore.getState().room.outline, change));
  }

  return (
    <section className="sidebar-section">
      <h6 className="sidebar-heading">
        <span className="sidebar-heading-num">01</span>
        <span>Room</span>
      </h6>
      <div className="field-grid-3">
        {size !== null && (
          <>
            <RoomDimInput label="Width" stored={size.w} onLength={(w) => setSize({ w })} />
            <RoomDimInput label="Length" stored={size.l} onLength={(l) => setSize({ l })} />
          </>
        )}
        <RoomDimInput label="Ceiling" stored={room.height} onLength={setRoomHeight} />
      </div>
      <div className="note">
        Floor area {fmtArea(polygonArea(roomOutline(room)), units)}.
      </div>
    </section>
  );
}
