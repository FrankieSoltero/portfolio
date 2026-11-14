import { type ChangeEvent, type JSX, useId, useState } from 'react';
import { CONFIG } from '../../config';
import { wallsOf } from '../../domain/outline';
import type { Door, Obstacle, Opening, Units, WindowOpening } from '../../domain/types';
import { furnInputStr, furnUnitLabel, parseLengthInput } from '../../domain/units';
import {
  addObstacleAtCentre,
  removeSelectedRoomThing,
  updateSelectedObstacle,
  updateSelectedOpening,
} from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useConflicts } from '../../state/selectors';
import { useUiStore } from '../../state/uiStore';
import { parseAngle } from '../SelectionBar';
import { Segmented, type SegmentedOption } from '../ui/Segmented';
import './sidebar.css';

/** A size draft within this many inches of the stored value still counts as showing it. */
const SIZE_DRAFT_TOLERANCE_IN = 0.01;
/** Angles are stored to 0.01°, so a draft within half of that still shows the stored angle. */
const ANGLE_DRAFT_TOLERANCE_DEG = 0.005;

/** Furniture units (inches or centimetres) per room unit (feet or metres). */
const FURN_UNITS_PER_ROOM_UNIT: Readonly<Record<Units, number>> = { ft: 12, m: 100 };

/**
 * A size typed in the furniture units (inches or centimetres) as inches; null unless it is a finite
 * number. No range check: the store refuses a size outside its limits and says why, so every limit
 * (an elevation of 0, a height up to 720 in) is enforced in one place.
 */
function parseSizeInput(raw: string, units: Units): number | null {
  const roomUnits = parseLengthInput(raw, units);
  return roomUnits === null ? null : roomUnits / FURN_UNITS_PER_ROOM_UNIT[units];
}

interface DraftNumberInputProps {
  label: string;
  stored: number;
  /** Re-seeds the draft whenever it changes (the units, for a size field). */
  seedKey: string;
  format: (v: number) => string;
  parse: (raw: string) => number | null;
  tolerance: number;
  suffix: string;
  onValue: (v: number) => void;
}

/**
 * One numeric field. The input shows exactly what the user typed; `onValue` is called only when the
 * text parses, so a refused value keeps the typed text. The draft is re-seeded when `seedKey`
 * changes, or when the stored value changes to something the draft does not show.
 */
function DraftNumberInput({ label, stored, seedKey, format, parse, tolerance, suffix, onValue }: DraftNumberInputProps) {
  const id = useId();
  const [draft, setDraft] = useState(() => format(stored));
  const [seen, setSeen] = useState({ seedKey, stored });

  // Adjust state during render (not in an effect) so the input never shows a stale draft.
  if (seen.seedKey !== seedKey || seen.stored !== stored) {
    const parsed = parse(draft);
    const draftShowsStored = parsed !== null && Math.abs(parsed - stored) <= tolerance;
    if (seen.seedKey !== seedKey || !draftShowsStored) setDraft(format(stored));
    setSeen({ seedKey, stored });
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDraft(raw);
    const v = parse(raw);
    if (v !== null) onValue(v);
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-suffix-wrap">
        <input id={id} className="input" type="number" step={1} value={draft} onChange={onChange} />
        <span className="input-suffix" aria-hidden="true">
          {suffix}
        </span>
      </div>
    </div>
  );
}

/** A length in the furniture units (inches or centimetres, as the furniture size fields). */
function SizeField({ label, stored, onValue }: { label: string; stored: number; onValue: (inches: number) => void }) {
  const units = usePlanStore((s) => s.units);
  return (
    <DraftNumberInput
      label={label}
      stored={stored}
      seedKey={units}
      format={(v) => furnInputStr(v, units)}
      parse={(raw) => parseSizeInput(raw, units)}
      tolerance={SIZE_DRAFT_TOLERANCE_IN}
      suffix={furnUnitLabel(units)}
      onValue={onValue}
    />
  );
}

/** A box's angle in degrees, accepted in [0, 360) by the same rule as the furniture Angle field. */
function AngleField({ stored, onValue }: { stored: number; onValue: (deg: number) => void }) {
  return (
    <DraftNumberInput
      label="Angle"
      stored={stored}
      seedKey=""
      format={String}
      parse={parseAngle}
      tolerance={ANGLE_DRAFT_TOLERANCE_DEG}
      suffix="°"
      onValue={onValue}
    />
  );
}

/** A two-way choice: a visible caption over a segmented radio group named the same. */
function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <div className="room-features-choice">
      <span className="room-features-caption" aria-hidden="true">
        {label}
      </span>
      <Segmented<T> name={name} aria-label={label} value={value} options={options} onChange={onChange} />
    </div>
  );
}

const HINGE_OPTIONS: readonly SegmentedOption<Door['hinge']>[] = [
  { value: 'start', label: 'Start of wall' },
  { value: 'end', label: 'End of wall' },
];

const SWING_OPTIONS: readonly SegmentedOption<Door['swing']>[] = [
  { value: 'in', label: 'Into the room' },
  { value: 'out', label: 'Out of the room' },
];

const ARMED_HELP: Readonly<Record<'door' | 'window', string>> = {
  door: 'Click a wall to place the door.',
  window: 'Click a wall to place the window.',
};

/** `Door on wall <n>` / `Window on wall <n>`, n counted from 1 in outline order. */
function openingName(opening: Opening, wallIds: readonly string[]): string {
  const kind = opening.kind === 'door' ? 'Door' : 'Window';
  return `${kind} on wall ${wallIds.indexOf(opening.wallId) + 1}`;
}

/** The obstacle's label, or `Box` / `Column` when it has none. */
function obstacleName(obstacle: Obstacle): string {
  if (obstacle.label !== '') return obstacle.label;
  return obstacle.shape === 'box' ? 'Box' : 'Column';
}

function DoorFields({ door }: { door: Door }) {
  return (
    <>
      <div className="room-features-grid">
        <SizeField label="Width" stored={door.width} onValue={(width) => updateSelectedOpening({ width })} />
        <SizeField label="Height" stored={door.height} onValue={(height) => updateSelectedOpening({ height })} />
      </div>
      <ChoiceField label="Hinge" value={door.hinge} options={HINGE_OPTIONS} onChange={(hinge) => updateSelectedOpening({ hinge })} />
      <ChoiceField label="Swing" value={door.swing} options={SWING_OPTIONS} onChange={(swing) => updateSelectedOpening({ swing })} />
    </>
  );
}

function WindowFields({ win }: { win: WindowOpening }) {
  return (
    <div className="room-features-grid">
      <SizeField label="Width" stored={win.width} onValue={(width) => updateSelectedOpening({ width })} />
      <SizeField label="Sill" stored={win.sill} onValue={(sill) => updateSelectedOpening({ sill })} />
      <SizeField label="Height" stored={win.height} onValue={(height) => updateSelectedOpening({ height })} />
    </div>
  );
}

function ObstacleFields({ obstacle }: { obstacle: Obstacle }) {
  const labelId = useId();
  const box = obstacle.shape === 'box';
  return (
    <>
      <div className="field">
        <label htmlFor={labelId}>Label</label>
        {/* Written on every change; React renders the stored label back as a value, never as markup. */}
        <input
          id={labelId}
          className="input"
          type="text"
          maxLength={CONFIG.obstacleLabelMax}
          value={obstacle.label}
          onChange={(e) => updateSelectedObstacle({ label: e.target.value })}
        />
      </div>
      <div className="room-features-grid">
        <SizeField label="Width" stored={obstacle.width} onValue={(width) => updateSelectedObstacle({ width })} />
        {box && <SizeField label="Depth" stored={obstacle.depth} onValue={(depth) => updateSelectedObstacle({ depth })} />}
        <SizeField label="Height" stored={obstacle.height} onValue={(height) => updateSelectedObstacle({ height })} />
        <SizeField label="Off the floor" stored={obstacle.elevation} onValue={(elevation) => updateSelectedObstacle({ elevation })} />
        {box && <AngleField stored={obstacle.rotation} onValue={(rotation) => updateSelectedObstacle({ rotation })} />}
      </div>
    </>
  );
}

interface ListRow {
  id: string;
  name: string;
  selected: boolean;
  select: () => void;
}

/** The room-mode controls; mounted only in room mode, so its store subscriptions run only there. */
function RoomFeaturesPanel(): JSX.Element {
  const openings = usePlanStore((s) => s.openings);
  const obstacles = usePlanStore((s) => s.obstacles);
  const outline = usePlanStore((s) => s.room.outline);
  const roomTool = useUiStore((s) => s.roomTool);
  const setRoomTool = useUiStore((s) => s.setRoomTool);
  const selectedOpeningId = useUiStore((s) => s.selectedOpeningId);
  const selectedObstacleId = useUiStore((s) => s.selectedObstacleId);
  const selectOpening = useUiStore((s) => s.selectOpening);
  const selectObstacle = useUiStore((s) => s.selectObstacle);
  const conflicts = useConflicts();
  const wallIds = wallsOf(outline).map((w) => w.id);
  const selectedOpening = openings.find((o) => o.id === selectedOpeningId);
  const selectedObstacle = obstacles.find((o) => o.id === selectedObstacleId);
  const selected = selectedOpening ?? selectedObstacle;
  const selectedName =
    selectedOpening !== undefined
      ? openingName(selectedOpening, wallIds)
      : selectedObstacle !== undefined
        ? obstacleName(selectedObstacle)
        : '';

  // Openings first, then obstacles, each in stored order.
  const rows: ListRow[] = [
    ...openings.map((o) => ({
      id: o.id,
      name: openingName(o, wallIds),
      selected: o.id === selectedOpeningId,
      select: () => selectOpening(o.id),
    })),
    ...obstacles.map((o) => ({
      id: o.id,
      name: obstacleName(o),
      selected: o.id === selectedObstacleId,
      select: () => selectObstacle(o.id),
    })),
  ];

  // Its name changes with the tool, so the button has no aria-pressed.
  function armButton(kind: 'door' | 'window') {
    const armed = roomTool === kind;
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setRoomTool(armed ? 'corner' : kind)}>
        {armed ? `Cancel ${kind}` : `Add ${kind}`}
      </button>
    );
  }

  return (
    <div className="room-features">
      <div className="room-features-add" role="group" aria-label="Add to the room">
        {armButton('door')}
        {armButton('window')}
        <button type="button" className="btn btn-secondary" onClick={() => addObstacleAtCentre('box')}>
          Add box
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => addObstacleAtCentre('cylinder')}>
          Add column
        </button>
      </div>
      {/* Always mounted in room mode so screen readers announce text that appears in it. */}
      <div className="room-features-status" role="status">
        {roomTool === 'corner' ? null : ARMED_HELP[roomTool]}
      </div>
      <div className="room-features-list" role="group" aria-label="Doors, windows and obstacles">
        <span className="room-features-caption" aria-hidden="true">
          Doors, windows and obstacles
        </span>
        {rows.length === 0 && <div className="text-muted room-features-empty">None yet.</div>}
        {rows.map((row) => {
          const conflict = conflicts[row.id];
          return (
            <button
              key={row.id}
              type="button"
              className={row.selected ? 'room-features-row room-features-row-selected' : 'room-features-row'}
              aria-pressed={row.selected}
              onClick={row.select}
            >
              <span className="room-features-row-name">{row.name}</span>
              {conflict !== undefined && <span className="tag room-features-row-conflict">{conflict}</span>}
            </button>
          );
        })}
      </div>
      {selected !== undefined && (
        // Keyed by the selected thing, so its drafts start afresh when another is selected.
        <div key={selected.id} className="room-features-fields" role="group" aria-label={selectedName}>
          {selectedOpening?.kind === 'door' && <DoorFields door={selectedOpening} />}
          {selectedOpening?.kind === 'window' && <WindowFields win={selectedOpening} />}
          {selectedObstacle !== undefined && <ObstacleFields obstacle={selectedObstacle} />}
          <button type="button" className="btn btn-secondary room-features-remove" onClick={removeSelectedRoomThing}>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The Room section's controls for doors, windows and obstacles, in room mode only: the Add buttons
 * (a door or window arms a tool, placed by a wall click or a wall row's Place button; a box or column
 * is added at once), the armed tool's help, the list of what the room has (each row selects it and
 * shows its conflict), and the selected thing's exact-size fields with its Remove button. Refusals
 * show in the Room section's status element. Renders nothing in furnish mode.
 */
export function RoomFeatures(): JSX.Element | null {
  const roomMode = useUiStore((s) => s.mode === 'room');
  return roomMode ? <RoomFeaturesPanel /> : null;
}
