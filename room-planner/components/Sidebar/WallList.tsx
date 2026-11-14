import { type ChangeEvent, type JSX, useId, useState } from 'react';
import { type LengthAnchor, type Wall, wallsOf } from '../../domain/outline';
import type { RoomTool } from '../../domain/types';
import { parseLengthInput, roomInputStep, roomInputStr, roomUnitLabel } from '../../domain/units';
import { addCornerOnWall, placeOpeningOnWall, setWallLengthTo } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { Segmented, type SegmentedOption } from '../ui/Segmented';
import './sidebar.css';

/** A draft within this many inches of the stored length still counts as showing it. */
const DRAFT_TOLERANCE_IN = 0.01;

/** The choices for which end of a wall a typed length moves. */
const LENGTH_ANCHOR_OPTIONS: readonly SegmentedOption<LengthAnchor>[] = [
  { value: 'start', label: 'Start' },
  { value: 'both', label: 'Both' },
  { value: 'end', label: 'End' },
];

/**
 * One wall's row: its length input and, in room mode, a button at the wall's midpoint that adds a
 * corner there, or, while a door or window tool is armed, places that opening there (the keyboard
 * path for placing). A typed length is applied by setWallLengthTo, so it moves the end chosen in the
 * which-end control. In room mode the input selects its wall when it takes focus, so the plan marks
 * the end that will move. The input shows exactly what the user typed; the draft is re-seeded when units
 * change, or when the stored length changes, unless the input has focus and its text already parses to it.
 */
function WallRow({ wall, roomMode, roomTool }: { wall: Wall; roomMode: boolean; roomTool: RoomTool }) {
  const id = useId();
  const units = usePlanStore((s) => s.units);
  const stored = wall.length;
  const label = `Wall ${wall.index + 1}`;
  const [draft, setDraft] = useState(() => roomInputStr(stored, units));
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState({ units, stored });

  // Adjust state during render (not in an effect) so the input never shows a stale draft.
  if (seen.units !== units || seen.stored !== stored) {
    const parsed = parseLengthInput(draft, units);
    const draftShowsStored = parsed !== null && Math.abs(parsed - stored) <= DRAFT_TOLERANCE_IN;
    if (seen.units !== units || !(focused && draftShowsStored)) setDraft(roomInputStr(stored, units));
    setSeen({ units, stored });
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDraft(raw);
    const inches = parseLengthInput(raw, units);
    if (inches !== null) setWallLengthTo(wall.id, inches);
  }

  function onFocus() {
    setFocused(true);
    if (roomMode) useUiStore.getState().selectWall(wall.id);
  }

  const midpoint = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
  const n = wall.index + 1;
  const placing = roomTool !== 'corner';

  return (
    <div className="wall-row">
      <label className="wall-row-label" htmlFor={id}>
        {label}
      </label>
      <div className="input-suffix-wrap">
        <input
          id={id}
          className="input"
          type="number"
          step={roomInputStep(units)}
          value={draft}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={() => setFocused(false)}
        />
        <span className="input-suffix" aria-hidden="true">
          {roomUnitLabel(units)}
        </span>
      </div>
      {/* One button whose name and action follow the tool, so it keeps focus when placing disarms it. */}
      {roomMode && (
        <button
          type="button"
          className={`btn ${placing ? 'btn-primary' : 'btn-secondary'} btn-icon wall-row-add`}
          aria-label={placing ? `Place the ${roomTool} on wall ${n}` : `Add a corner to wall ${n}`}
          title={placing ? `Place the ${roomTool} at the middle of this wall` : 'Add a corner at the middle of this wall'}
          onClick={() => (placing ? placeOpeningOnWall(wall.id, midpoint) : addCornerOnWall(wall.id, midpoint))}
        >
          <span aria-hidden="true">+</span>
        </button>
      )}
    </div>
  );
}

/**
 * Every wall of the room in order, each with an editable length in the room units, under a control
 * that chooses which end of a wall a typed length moves and a note saying how walls are numbered.
 */
export function WallList(): JSX.Element {
  const outline = usePlanStore((s) => s.room.outline);
  const roomMode = useUiStore((s) => s.mode === 'room');
  const roomTool = useUiStore((s) => s.roomTool);
  const lengthAnchor = useUiStore((s) => s.lengthAnchor);
  const setLengthAnchor = useUiStore((s) => s.setLengthAnchor);
  return (
    <div className="wall-list" role="group" aria-label="Wall lengths">
      {/* Visible caption in the Room section's small-label style; the control keeps its own aria-label. */}
      <span className="shape-buttons-label">A typed length moves</span>
      <Segmented
        name="length-anchor"
        aria-label="A typed length moves"
        options={LENGTH_ANCHOR_OPTIONS}
        value={lengthAnchor}
        onChange={setLengthAnchor}
      />
      <p className="note wall-list-note">Wall N starts at corner N. In Edit room, the plan marks the end that moves.</p>
      {wallsOf(outline).map((wall) => (
        <WallRow key={wall.id} wall={wall} roomMode={roomMode} roomTool={roomTool} />
      ))}
    </div>
  );
}
