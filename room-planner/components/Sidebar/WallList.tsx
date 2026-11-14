import { type ChangeEvent, type JSX, useId, useState } from 'react';
import { CONFIG } from '../../config';
import { LIMIT_SLACK, type OutlineResult, setWallLength, type Wall, wallsOf } from '../../domain/outline';
import type { RoomTool } from '../../domain/types';
import { parseLengthInput, roomInputStep, roomInputStr, roomUnitLabel } from '../../domain/units';
import { addCornerOnWall, placeOpeningOnWall } from '../../state/actions';
import { ROOM_PROBLEM_TEXT, usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import './sidebar.css';

/** A draft within this many inches of the stored length still counts as showing it. */
const DRAFT_TOLERANCE_IN = 0.01;

/**
 * Sets wall `wallId` of the current outline to `inches` and records the outcome: an accepted
 * length clears the room problem, a refused one (including one outside the wall limits, or one a
 * door or window cannot follow) leaves the outline unchanged and sets the problem to its reason.
 */
function applyWallLength(wallId: string, inches: number): void {
  const result: OutlineResult =
    // LIMIT_SLACK absorbs unit-conversion noise at the upper limit (18.288 m is exactly 720 in).
    inches > CONFIG.roomMax + LIMIT_SLACK
      ? { ok: false, problem: 'too-large' }
      : setWallLength(usePlanStore.getState().room.outline, wallId, inches);
  const problem = usePlanStore.getState().applyOutline(result);
  useUiStore.getState().setRoomProblem(problem === null ? null : ROOM_PROBLEM_TEXT[problem]);
}

/**
 * One wall's row: its length input and, in room mode, a button at the wall's midpoint that adds a
 * corner there, or, while a door or window tool is armed, places that opening there (the keyboard
 * path for placing). The input shows exactly what the user typed; the draft is re-seeded when units
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
    if (inches !== null) applyWallLength(wall.id, inches);
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
          onFocus={() => setFocused(true)}
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

/** Every wall of the room in order, each with an editable length in the room units. */
export function WallList(): JSX.Element {
  const outline = usePlanStore((s) => s.room.outline);
  const roomMode = useUiStore((s) => s.mode === 'room');
  const roomTool = useUiStore((s) => s.roomTool);
  return (
    <div className="wall-list" role="group" aria-label="Wall lengths">
      {wallsOf(outline).map((wall) => (
        <WallRow key={wall.id} wall={wall} roomMode={roomMode} roomTool={roomTool} />
      ))}
    </div>
  );
}
