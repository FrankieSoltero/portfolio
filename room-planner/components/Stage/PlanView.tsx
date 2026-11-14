import { useState } from 'react';
import type React from 'react';
import type { JSX } from 'react';
import { CONFIG } from '../../config';
import { PARTS } from '../../domain/catalog';
import { OUTSIDE_THE_ROOM } from '../../domain/conflicts';
import { footprint, mapPart, snapRoomDim } from '../../domain/geometry';
import type { Item } from '../../domain/types';
import { fmtFurnDims, fmtLen, gridStepInches } from '../../domain/units';
import { startDrag } from '../../hooks/startDrag';
import { usePlanStore } from '../../state/planStore';
import { useConflicts } from '../../state/selectors';
import { useUiStore } from '../../state/uiStore';
import type { PaneRect } from '../../view/panes';
import { computeClearances, computePlanLayout, type PlanLayout } from '../../view/planLayout';
import { BlueprintCorners } from '../ui/BlueprintCorners';
import './stage.css';

/** Item boxes show their name and dimensions only when larger than this, in px. */
const LABEL_MIN_W = 84;
const LABEL_MIN_H = 38;
/** Half the long side and half the short side of a room handle (32×12 px). */
const HANDLE_HALF_LONG = 16;
const HANDLE_HALF_SHORT = 6;
const Z_SELECTED = 4;
const Z_RUG = 1;
const Z_ITEM = 2;

/**
 * The interactive 2D plan: dimension lines, the room, furniture boxes, clearance lines
 * for the selected item and the two room-resize handles. Fills its parent; every position
 * is computed from `pane`, so it does not measure the DOM. Ported from prototype lines
 * 136–173 and 679–699.
 */
export function PlanView({ pane }: { pane: PaneRect }): JSX.Element {
  const room = usePlanStore((s) => s.room);
  const items = usePlanStore((s) => s.items);
  const units = usePlanStore((s) => s.units);
  const moveItemTo = usePlanStore((s) => s.moveItemTo);
  const setRoomDim = usePlanStore((s) => s.setRoomDim);
  const selectedId = useUiStore((s) => s.selectedId);
  const select = useUiStore((s) => s.select);
  const conflicts = useConflicts();
  // While a room handle is dragged the layout stays as it was at pointer-down, so the
  // room grows under the pointer instead of being re-fitted on every move.
  const [frozen, setFrozen] = useState<PlanLayout | null>(null);

  const layout = frozen ?? computePlanLayout(room, pane);
  const { scale, ox, oy } = layout;
  const roomW = room.w * scale;
  const roomH = room.l * scale;
  const dimOffset = pane.inset ? CONFIG.dimOffsetInset : CONFIG.dimOffset;
  const grid = gridStepInches(units) * scale;

  const selected = items.find((i) => i.id === selectedId);
  const clearances =
    selected && CONFIG.showClearances && conflicts[selected.id] !== OUTSIDE_THE_ROOM
      ? computeClearances(selected, room, layout, units)
      : [];

  const onItemDown = (item: Item, e: React.PointerEvent): void => {
    const { x: x0, y: y0 } = item;
    select(item.id);
    startDrag(e, (dx, dy) => moveItemTo(item.id, x0 + dx / scale, y0 + dy / scale));
  };

  // Only Enter and Space are handled here. Every other key (arrows, R, Delete, Escape) must
  // reach the window-level shortcuts, which act on the selected item, so nothing is stopped.
  const onItemKey = (item: Item, e: React.KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    select(item.id);
  };

  const onHandleDown = (axis: 'w' | 'l', e: React.PointerEvent): void => {
    const start = layout;
    const v0 = room[axis];
    setFrozen(start);
    startDrag(
      e,
      (dx, dy) => setRoomDim(axis, snapRoomDim(v0 + (axis === 'w' ? dx : dy) / start.scale)),
      () => setFrozen(null),
    );
  };

  return (
    <div className="plan-view" onPointerDown={() => select(null)}>
      <div className="plan-dim plan-dim-w" style={{ left: ox, top: oy - dimOffset, width: roomW }}>
        <i className="plan-dim-tick" />
        <i className="plan-dim-tick" />
        <span className="plan-dim-label">{fmtLen(room.w, units)}</span>
      </div>
      <div className="plan-dim plan-dim-l" style={{ left: ox - dimOffset, top: oy, height: roomH }}>
        <i className="plan-dim-tick" />
        <i className="plan-dim-tick" />
        <span className="plan-dim-label">{fmtLen(room.l, units)}</span>
      </div>
      <div
        className="blueprint plan-room"
        style={{ left: ox, top: oy, width: roomW, height: roomH, backgroundSize: `${grid}px ${grid}px` }}
      >
        <BlueprintCorners />
      </div>
      {items.map((item) => {
        const [fw, fd] = footprint(item);
        const pw = fw * scale;
        const ph = fd * scale;
        const isSelected = item.id === selectedId;
        const parts = PARTS[item.kind];
        const className = [
          'plan-item',
          item.kind === 'rug' && 'is-rug',
          conflicts[item.id] !== undefined && 'is-conflict',
          isSelected && 'is-selected',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={item.id}
            data-item-id={item.id}
            role="button"
            aria-label={item.name}
            aria-pressed={isSelected}
            className={className}
            style={{
              left: ox + item.x * scale,
              top: oy + item.y * scale,
              width: pw,
              height: ph,
              zIndex: isSelected ? Z_SELECTED : item.kind === 'rug' ? Z_RUG : Z_ITEM,
            }}
            tabIndex={0}
            onPointerDown={(e) => onItemDown(item, e)}
            // Assistive technology activates a button with a synthetic click; selecting is idempotent.
            onClick={() => select(item.id)}
            onKeyDown={(e) => onItemKey(item, e)}
          >
            {parts.length > 1 &&
              parts.map((part, i) => {
                const [u0, u1, v0, v1] = mapPart(part, item.rot);
                return (
                  <i
                    key={i}
                    className="plan-part"
                    style={{
                      left: `${u0 * 100}%`,
                      top: `${v0 * 100}%`,
                      width: `${(u1 - u0) * 100}%`,
                      height: `${(v1 - v0) * 100}%`,
                    }}
                  />
                );
              })}
            {pw > LABEL_MIN_W && ph > LABEL_MIN_H && (
              <div className="plan-item-label">
                <div className="plan-item-name">{item.name}</div>
                <div className="plan-item-dims">{fmtFurnDims(item, units)}</div>
              </div>
            )}
          </div>
        );
      })}
      {clearances.map((c, i) => (
        <div
          key={i}
          className={`plan-clearance is-${c.orientation}`}
          style={
            c.orientation === 'h'
              ? { left: c.left, top: c.top, width: c.length }
              : { left: c.left, top: c.top, height: c.length }
          }
        >
          {c.showLabel && <span className="plan-clearance-chip">{c.label}</span>}
        </div>
      ))}
      <div
        className="plan-handle is-w"
        title="Drag to change width"
        style={{ left: ox + roomW - HANDLE_HALF_SHORT, top: oy + roomH / 2 - HANDLE_HALF_LONG }}
        onPointerDown={(e) => onHandleDown('w', e)}
      />
      <div
        className="plan-handle is-l"
        title="Drag to change length"
        style={{ left: ox + roomW / 2 - HANDLE_HALF_LONG, top: oy + roomH - HANDLE_HALF_SHORT }}
        onPointerDown={(e) => onHandleDown('l', e)}
      />
    </div>
  );
}
