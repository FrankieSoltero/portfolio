import { type ChangeEvent, type JSX, useId, useState } from 'react';
import { CONFIG } from '../../config';
import { OUTLINE_PROBLEM_TEXT, type OutlineResult, setWallLength, type Wall, wallsOf } from '../../domain/outline';
import type { Units } from '../../domain/types';
import { roomInputStep, roomInputStr, roomUnitLabel } from '../../domain/units';
import { addCornerOnWall } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import './sidebar.css';

/** A draft within this many inches of the stored length still counts as showing it. */
const DRAFT_TOLERANCE_IN = 0.01;

/** Absorbs unit-conversion noise at the upper limit (18.288 m is exactly 720 in). */
const LIMIT_SLACK_IN = 1e-9;

const M_PER_INCH = 0.0254;
const INCH_PER_FT = 12;

/**
 * Parses a wall length typed in the room units (feet or metres) to inches, or null when the text
 * is not a number. Unlike parseRoomInput it applies no range: the caller refuses lengths outside
 * [CONFIG.wallMin, CONFIG.roomMax] with a reason.
 */
function parseWallInput(raw: string, units: Units): number | null {
  const n = parseFloat(raw);
  const inches = units === 'm' ? n / M_PER_INCH : n * INCH_PER_FT;
  return Number.isFinite(inches) ? inches : null;
}

/**
 * Sets wall `wallId` of the current outline to `inches` and records the outcome: an accepted
 * length clears the room problem, a refused one (including one outside the wall limits) leaves the
 * outline unchanged and sets the problem to its reason.
 */
function applyWallLength(wallId: string, inches: number): void {
  const result: OutlineResult =
    inches > CONFIG.roomMax + LIMIT_SLACK_IN
      ? { ok: false, problem: 'too-large' }
      : setWallLength(usePlanStore.getState().room.outline, wallId, inches);
  usePlanStore.getState().applyOutline(result);
  useUiStore.getState().setRoomProblem(result.ok ? null : OUTLINE_PROBLEM_TEXT[result.problem]);
}

/**
 * One wall's row: its length input and, in room mode, a button that adds a corner at the wall's
 * midpoint. The input shows exactly what the user typed; the draft is re-seeded when units change,
 * or when the stored length changes, unless the input has focus and its text already parses to it.
 */
function WallRow({ wall, roomMode }: { wall: Wall; roomMode: boolean }) {
  const id = useId();
  const units = usePlanStore((s) => s.units);
  const stored = wall.length;
  const label = `Wall ${wall.index + 1}`;
  const [draft, setDraft] = useState(() => roomInputStr(stored, units));
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState({ units, stored });

  // Adjust state during render (not in an effect) so the input never shows a stale draft.
  if (seen.units !== units || seen.stored !== stored) {
    const parsed = parseWallInput(draft, units);
    const draftShowsStored = parsed !== null && Math.abs(parsed - stored) <= DRAFT_TOLERANCE_IN;
    if (seen.units !== units || !(focused && draftShowsStored)) setDraft(roomInputStr(stored, units));
    setSeen({ units, stored });
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDraft(raw);
    const inches = parseWallInput(raw, units);
    if (inches !== null) applyWallLength(wall.id, inches);
  }

  function addCorner() {
    addCornerOnWall(wall.id, { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 });
  }

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
      {roomMode && (
        <button
          type="button"
          className="btn btn-secondary btn-icon wall-row-add"
          aria-label={`Add a corner to wall ${wall.index + 1}`}
          title="Add a corner at the middle of this wall"
          onClick={addCorner}
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
  return (
    <div className="wall-list" role="group" aria-label="Wall lengths">
      {wallsOf(outline).map((wall) => (
        <WallRow key={wall.id} wall={wall} roomMode={roomMode} />
      ))}
    </div>
  );
}
