import { type ChangeEvent, useId, useState } from 'react';
import {
  rectangleSize,
  setRectangleSize,
  type StartingShape,
  startingShape,
  validateOutline,
} from '../../domain/outline';
import { fmtArea, parseRoomInput, roomInputStep, roomInputStr, roomUnitLabel } from '../../domain/units';
import { boundsOf, polygonArea } from '../../domain/polygon';
import { roomOutline } from '../../domain/shape';
import { ROOM_PROBLEM_TEXT, usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { RoomFeatures } from './RoomFeatures';
import { WallList } from './WallList';
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

const SHAPES: readonly { shape: StartingShape; label: string }[] = [
  { shape: 'rectangle', label: 'Rectangle' },
  { shape: 'l-shape', label: 'L-shape' },
  { shape: 'notched', label: 'Notched' },
];

const ROOM_MODE_HELP =
  'Drag a wall to move it. Drag a corner to change an angle. Double-click a wall to add a corner. Click a length to type it. Hold Alt to turn off angle snapping.';

/**
 * Replaces the outline with a starting shape sized and placed from the current outline's bounding
 * box (so the room stays under the furniture), with fresh corner ids, and clears the corner
 * selection. A shape that would not be a valid room (a bounding box too small for its walls), or
 * any shape while the room has a door or window, is refused with its reason instead of being stored.
 */
function applyStartingShape(shape: StartingShape): void {
  const { minX, minY, w, l } = boundsOf(usePlanStore.getState().room.outline);
  const outline = startingShape(shape, w, l, () => crypto.randomUUID()).map((c) => ({
    id: c.id,
    x: c.x + minX,
    y: c.y + minY,
  }));
  const invalid = validateOutline(outline);
  const problem = usePlanStore.getState().applyOutline(invalid === null ? { ok: true, outline } : { ok: false, problem: invalid });
  const ui = useUiStore.getState();
  ui.setRoomProblem(problem === null ? null : ROOM_PROBLEM_TEXT[problem]);
  if (problem === null) ui.selectCorner(null);
}

/**
 * Sidebar section 01: the Edit room / Done switch, the room's width and length while it is a
 * rectangle, its ceiling height, every wall's length, in room mode the doors, windows and obstacles
 * (RoomFeatures), why the last room edit was refused, the starting shapes, and the floor area of
 * its outline.
 */
export function RoomSection() {
  const units = usePlanStore((s) => s.units);
  const room = usePlanStore((s) => s.room);
  const applyOutline = usePlanStore((s) => s.applyOutline);
  const setRoomHeight = usePlanStore((s) => s.setRoomHeight);
  const roomMode = useUiStore((s) => s.mode === 'room');
  const setMode = useUiStore((s) => s.setMode);
  const setRoomProblem = useUiStore((s) => s.setRoomProblem);
  const roomProblem = useUiStore((s) => s.roomProblem);
  const shapesLabelId = useId();
  const size = rectangleSize(room.outline);

  // Read the outline at write time, so two edits in one render both apply to the latest room.
  // A size a door or window cannot follow is refused with its reason; an accepted one clears it.
  function setSize(change: { w: number } | { l: number }) {
    const problem = applyOutline(setRectangleSize(usePlanStore.getState().room.outline, change));
    setRoomProblem(problem === null ? null : ROOM_PROBLEM_TEXT[problem]);
  }

  return (
    <section className="sidebar-section">
      <h6 className="sidebar-heading">
        <span className="sidebar-heading-num">01</span>
        <span>Room</span>
      </h6>
      <button
        type="button"
        className={roomMode ? 'btn btn-primary' : 'btn btn-secondary'}
        onClick={() => setMode(roomMode ? 'furnish' : 'room')}
      >
        {roomMode ? 'Done' : 'Edit room'}
      </button>
      <div className="field-grid-3">
        {size !== null && (
          <>
            <RoomDimInput label="Width" stored={size.w} onLength={(w) => setSize({ w })} />
            <RoomDimInput label="Length" stored={size.l} onLength={(l) => setSize({ l })} />
          </>
        )}
        <RoomDimInput label="Ceiling" stored={room.height} onLength={setRoomHeight} />
      </div>
      <WallList />
      <RoomFeatures />
      {/* Always mounted so screen readers announce text that appears in it. */}
      <div className="room-problem" role="status">
        {roomProblem}
      </div>
      <div className="shape-buttons" role="group" aria-labelledby={shapesLabelId}>
        <span id={shapesLabelId} className="shape-buttons-label">
          Start from a shape
        </span>
        <div className="shape-buttons-row">
          {SHAPES.map(({ shape, label }) => (
            <button key={shape} type="button" className="btn btn-secondary" onClick={() => applyStartingShape(shape)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="note">
        Floor area {fmtArea(polygonArea(roomOutline(room)), units)}.{roomMode && ` ${ROOM_MODE_HELP}`}
      </div>
    </section>
  );
}
