import type React from 'react';
import { type JSX, useLayoutEffect, useRef, useState } from 'react';
import { CONFIG } from '../../config';
import { type LengthAnchor, type Wall, wallFrame, wallsOf } from '../../domain/outline';
import type { Units } from '../../domain/types';
import { fmtLen, parseLengthInput, roomInputStep, roomInputStr, roomUnitLabel } from '../../domain/units';
import { setWallLengthTo } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { type PlanLayout, toPane } from '../../view/planLayout';

/** A typed length within this many inches of the stored one counts as unchanged. */
const UNCHANGED_TOLERANCE_IN = 0.01;

/** The which-end choices in the order their radios appear, and the arrow each one shows. */
const ANCHORS: readonly LengthAnchor[] = ['start', 'both', 'end'];
const ANCHOR_ARROW: Readonly<Record<LengthAnchor, string>> = { start: '←', both: '↔', end: '→' };

/** Arrow keys on the which-end radios: back (−1) or on (+1) through ANCHORS, wrapping round. */
const ANCHOR_KEY_STEP: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/** Keeps a press on a label or the editor off the plan background, which would clear the room selection. */
function stopPress(e: React.PointerEvent): void {
  e.stopPropagation();
}

/**
 * Keeps keyboard focus where it is when a which-end radio is pressed with the pointer, so the press
 * never counts as leaving the length input (Safari does not focus a pressed button at all).
 */
function keepFocus(e: React.MouseEvent): void {
  e.preventDefault();
}

interface WallLengthEditorProps {
  wall: Wall;
  /** The number of corners in the outline, so the last wall's end corner wraps round to Corner 1. */
  cornerCount: number;
  units: Units;
  /** Pane px of the label this editor replaces. */
  left: number;
  top: number;
  /** Closes the editor; `focusLabel` returns focus to the wall's label. */
  onClose(focusLabel: boolean): void;
}

/**
 * The editor that takes a wall label's place: a group named `Wall <n> length` holding a number input
 * in the room units (focused, its text selected, on opening) and three which-end radios. Nothing is
 * applied while typing. Enter, or focus leaving the group, applies the typed length with
 * setWallLengthTo: an accepted, unchanged or unreadable length closes the editor (Enter then returns
 * focus to the label); a refused one keeps it open with the typed text. Escape closes it without
 * applying and goes no further. Arrow keys on the radios move the choice and go no further, so they
 * never slide the wall. User text is only ever parsed to a number.
 */
function WallLengthEditor({ wall, cornerCount, units, left, top, onClose }: WallLengthEditorProps): JSX.Element {
  const lengthAnchor = useUiStore((s) => s.lengthAnchor);
  const setLengthAnchor = useUiStore((s) => s.setLengthAnchor);
  const [draft, setDraft] = useState(() => roomInputStr(wall.length, units));
  const inputRef = useRef<HTMLInputElement>(null);
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // False once unmounting starts, so a blur fired while the group is removed applies nothing.
  const mounted = useRef(true);

  useLayoutEffect(() => {
    mounted.current = true;
    inputRef.current?.focus();
    inputRef.current?.select();
    return () => {
      mounted.current = false;
    };
  }, []);

  const n = wall.index + 1;
  const name = `Wall ${n} length`;
  const radioName: Readonly<Record<LengthAnchor, string>> = {
    start: `Corner ${n} end`,
    both: 'Both ends',
    end: `Corner ${(n % cornerCount) + 1} end`,
  };
  const { u } = wallFrame(wall);
  const angle = (Math.atan2(u.y, u.x) * 180) / Math.PI;

  /** Applies the draft; closes unless the length was refused. */
  function apply(focusLabel: boolean): void {
    const inches = parseLengthInput(draft, units);
    if (inches === null || Math.abs(inches - wall.length) <= UNCHANGED_TOLERANCE_IN) onClose(focusLabel);
    else if (setWallLengthTo(wall.id, inches)) onClose(focusLabel);
  }

  function onGroupBlur(e: React.FocusEvent<HTMLDivElement>): void {
    if (!mounted.current) return;
    const to = e.relatedTarget;
    if (to instanceof Node && e.currentTarget.contains(to)) return;
    apply(false);
  }

  function onGroupKeyDown(e: React.KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    onClose(true);
  }

  function onInputKeyDown(e: React.KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    // Without this the key's keypress reaches the label that takes focus, which would reopen the editor.
    e.preventDefault();
    apply(true);
  }

  function onRadiosKeyDown(e: React.KeyboardEvent): void {
    const step = ANCHOR_KEY_STEP[e.key];
    if (step === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    const i = (ANCHORS.indexOf(lengthAnchor) + step + ANCHORS.length) % ANCHORS.length;
    setLengthAnchor(ANCHORS[i]);
    radioRefs.current[i]?.focus();
  }

  return (
    <div
      className="room-wall-editor"
      role="group"
      aria-label={name}
      style={{ left, top }}
      onPointerDown={stopPress}
      onBlur={onGroupBlur}
      onKeyDown={onGroupKeyDown}
    >
      <div className="input-suffix-wrap">
        <input
          ref={inputRef}
          className="input"
          type="number"
          aria-label={name}
          step={roomInputStep(units)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKeyDown}
        />
        <span className="input-suffix" aria-hidden="true">
          {roomUnitLabel(units)}
        </span>
      </div>
      <div className="room-wall-editor-ends" role="radiogroup" aria-label="Which end moves" onKeyDown={onRadiosKeyDown}>
        {ANCHORS.map((anchor, i) => (
          <button
            key={anchor}
            ref={(el) => {
              radioRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            className="room-wall-editor-end"
            aria-label={radioName[anchor]}
            aria-checked={anchor === lengthAnchor}
            tabIndex={anchor === lengthAnchor ? 0 : -1}
            onMouseDown={keepFocus}
            onClick={() => setLengthAnchor(anchor)}
          >
            <span className="room-wall-editor-arrow" aria-hidden="true" style={{ transform: `rotate(${angle}deg)` }}>
              {ANCHOR_ARROW[anchor]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A button on the plan for every wall in room mode, showing the wall's length in the current
 * units and named `Wall <n>, <length>`. Each is centred on its wall's midpoint (pane px from
 * `layout`) moved `CONFIG.wallLabelOffsetPx` outside the room, against the wall's inward normal.
 * The selected wall's label is pressed. A label that receives focus (by Tab, a click, or a press
 * on its wall's band) selects its wall; a pointer down on it does not reach the plan background.
 * Each carries `data-wall-label-id` so a wall press can focus it. A click (or Enter) on a label
 * replaces it with the wall's length editor (WallLengthEditor); one editor is open at a time, and
 * opening another closes the first without applying it.
 */
export function WallLengthLabels({ layout }: { layout: PlanLayout }): JSX.Element {
  const outline = usePlanStore((s) => s.room.outline);
  const units = usePlanStore((s) => s.units);
  const selectedWallId = useUiStore((s) => s.selectedWallId);
  const selectWall = useUiStore((s) => s.selectWall);
  const [editingId, setEditingId] = useState<string | null>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  // The wall whose label takes focus once the editor has closed.
  const focusAfterClose = useRef<string | null>(null);

  // Adjust state during render (not in an effect): an editor whose wall has gone stays closed.
  if (editingId !== null && !outline.some((c) => c.id === editingId)) setEditingId(null);

  useLayoutEffect(() => {
    const id = focusAfterClose.current;
    if (editingId !== null || id === null) return;
    focusAfterClose.current = null;
    labelRefs.current.get(id)?.focus();
  }, [editingId]);

  return (
    <>
      {wallsOf(outline).map((wall) => {
        const { n } = wallFrame(wall);
        const mid = toPane({ x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }, layout);
        const left = mid.x - CONFIG.wallLabelOffsetPx * n.x;
        const top = mid.y - CONFIG.wallLabelOffsetPx * n.y;
        if (wall.id === editingId) {
          return (
            <WallLengthEditor
              key={wall.id}
              wall={wall}
              cornerCount={outline.length}
              units={units}
              left={left}
              top={top}
              onClose={(focusLabel) => {
                focusAfterClose.current = focusLabel ? wall.id : null;
                setEditingId(null);
              }}
            />
          );
        }
        const text = fmtLen(wall.length, units);
        return (
          <button
            key={wall.id}
            ref={(el) => {
              if (el) labelRefs.current.set(wall.id, el);
              else labelRefs.current.delete(wall.id);
            }}
            type="button"
            className="room-wall-label"
            data-wall-label-id={wall.id}
            aria-label={`Wall ${wall.index + 1}, ${text}`}
            aria-pressed={wall.id === selectedWallId}
            style={{ left, top }}
            onPointerDown={stopPress}
            onFocus={() => selectWall(wall.id)}
            onClick={() => setEditingId(wall.id)}
          >
            {text}
          </button>
        );
      })}
    </>
  );
}
