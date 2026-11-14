import type React from 'react';
import { useState, type JSX } from 'react';
import { CONFIG } from '../../config';
import { PARTS } from '../../domain/catalog';
import { OUTSIDE_THE_ROOM } from '../../domain/conflicts';
import { rectangleSize } from '../../domain/outline';
import { itemFootprint, roomBounds, roomOutline } from '../../domain/shape';
import type { Item } from '../../domain/types';
import { fmtFurnDims, fmtLen, gridStepInches } from '../../domain/units';
import { startDrag } from '../../hooks/startDrag';
import { usePlanStore } from '../../state/planStore';
import { useConflicts } from '../../state/selectors';
import { useUiStore } from '../../state/uiStore';
import type { PaneRect } from '../../view/panes';
import {
  computeClearances,
  computePlanLayout,
  labelBox,
  planItemBox,
  type PlanLayout,
  toPane,
} from '../../view/planLayout';
import { BlueprintCorners } from '../ui/BlueprintCorners';
import { FreezePlanLayoutContext, RoomEditLayer } from './RoomEditLayer';
import './stage.css';

/** Item labels show the name and dimensions only when their box is larger than this, in px. */
const LABEL_MIN_W = 84;
const LABEL_MIN_H = 38;
const Z_SELECTED = 4;
const Z_RUG = 1;
const Z_ITEM = 2;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * The interactive 2D plan: dimension lines, the room outline, furniture boxes, clearance lines
 * for the selected item, and in room mode the room editor over dimmed, inert furniture. Fills its
 * parent; every position is computed from `pane` and the shape accessors (outline, bounds,
 * footprints), so it does not measure the DOM. Ported from prototype lines 136–173 and 679–699.
 */
export function PlanView({ pane }: { pane: PaneRect }): JSX.Element {
  const room = usePlanStore((s) => s.room);
  const items = usePlanStore((s) => s.items);
  const units = usePlanStore((s) => s.units);
  const moveItemTo = usePlanStore((s) => s.moveItemTo);
  const selectedId = useUiStore((s) => s.selectedId);
  const select = useUiStore((s) => s.select);
  const roomMode = useUiStore((s) => s.mode === 'room');
  const selectCorner = useUiStore((s) => s.selectCorner);
  const conflicts = useConflicts();
  // Set by the room editor for the length of a corner drag, so the room does not re-fit mid-drag.
  const [frozenLayout, setFrozenLayout] = useState<PlanLayout | null>(null);

  const outline = roomOutline(room);
  const bounds = roomBounds(room);
  const layout = frozenLayout ?? computePlanLayout(bounds, pane);
  const { scale, ox, oy } = layout;
  const boundsTopLeft = toPane({ x: bounds.minX, y: bounds.minY }, layout);
  const boundsW = bounds.w * scale;
  const boundsH = bounds.l * scale;
  const dimOffset = pane.inset ? CONFIG.dimOffsetInset : CONFIG.dimOffset;
  const grid = gridStepInches(units) * scale;
  const panePoints = outline.map((p) => toPane(p, layout));
  const clipPath = `polygon(${panePoints.map((p) => `${p.x}px ${p.y}px`).join(', ')})`;
  const wallPoints = panePoints.map((p) => `${p.x},${p.y}`).join(' ');

  const selected = items.find((i) => i.id === selectedId);
  const clearances =
    selected && !roomMode && CONFIG.showClearances && conflicts[selected.id] !== OUTSIDE_THE_ROOM
      ? computeClearances(itemFootprint(selected), outline, layout, units)
      : [];

  // In room mode furniture is inert: its handlers do nothing, and a pointer down passes on to the
  // plan background as it does in a browser, where inert elements take no pointer input.
  const onItemDown = (item: Item, e: React.PointerEvent): void => {
    if (roomMode) return;
    const { x: x0, y: y0 } = item;
    select(item.id);
    startDrag(e, (dx, dy) => moveItemTo(item.id, x0 + dx / scale, y0 + dy / scale));
  };

  // Only Enter and Space are handled here. Every other key (arrows, R, Delete, Escape) must
  // reach the window-level shortcuts, which act on the selected item, so nothing is stopped.
  const onItemKey = (item: Item, e: React.KeyboardEvent): void => {
    if (roomMode || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    select(item.id);
  };

  return (
    <div className="plan-view" onPointerDown={() => (roomMode ? selectCorner(null) : select(null))}>
      <div
        className="plan-dim plan-dim-w"
        style={{ left: boundsTopLeft.x, top: boundsTopLeft.y - dimOffset, width: boundsW }}
      >
        <i className="plan-dim-tick" />
        <i className="plan-dim-tick" />
        <span className="plan-dim-label">{fmtLen(bounds.w, units)}</span>
      </div>
      <div
        className="plan-dim plan-dim-l"
        style={{ left: boundsTopLeft.x - dimOffset, top: boundsTopLeft.y, height: boundsH }}
      >
        <i className="plan-dim-tick" />
        <i className="plan-dim-tick" />
        <span className="plan-dim-label">{fmtLen(bounds.l, units)}</span>
      </div>
      <div
        className="plan-room"
        style={{ clipPath, backgroundSize: `${grid}px ${grid}px`, backgroundPosition: `${ox}px ${oy}px` }}
      />
      <svg className="plan-outline" aria-hidden="true">
        <polygon className="plan-outline-wall" points={wallPoints} />
      </svg>
      {rectangleSize(outline) !== null && (
        <div
          className="blueprint plan-outline-frame"
          style={{ left: boundsTopLeft.x, top: boundsTopLeft.y, width: boundsW, height: boundsH }}
        >
          <BlueprintCorners />
        </div>
      )}
      {items.map((item) => {
        const fp = itemFootprint(item);
        const box = planItemBox(fp, layout);
        const label = labelBox(fp, layout);
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
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              transform: `rotate(${box.rotateDeg}deg)`,
              zIndex: isSelected ? Z_SELECTED : item.kind === 'rug' ? Z_RUG : Z_ITEM,
            }}
            tabIndex={roomMode ? -1 : 0}
            // Room mode dims the furniture and takes it out of the tab order and the accessibility tree.
            inert={roomMode}
            aria-hidden={roomMode || undefined}
            onPointerDown={(e) => onItemDown(item, e)}
            // Assistive technology activates a button with a synthetic click; selecting is idempotent.
            onClick={() => {
              if (!roomMode) select(item.id);
            }}
            onKeyDown={(e) => onItemKey(item, e)}
          >
            {parts.length > 1 &&
              parts.map(([u0, u1, v0, v1], i) => (
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
              ))}
            {label.width > LABEL_MIN_W && label.height > LABEL_MIN_H && (
              // Inside the turned item, so it turns back by the item's angle to reach its net tilt.
              <div
                className="plan-outline-label"
                style={{
                  width: label.width,
                  height: label.height,
                  transform: `translate(-50%, -50%) rotate(${label.rotateDeg - box.rotateDeg}deg)`,
                }}
              >
                <div className="plan-item-label">
                  <div className="plan-item-name">{item.name}</div>
                  <div className="plan-item-dims">{fmtFurnDims(item, units)}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {clearances.map((c, i) => {
        const deg = Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * RAD_TO_DEG;
        return (
          <div
            key={i}
            className="plan-clearance"
            style={{
              left: c.x1,
              top: c.y1,
              width: Math.hypot(c.x2 - c.x1, c.y2 - c.y1),
              transform: `rotate(${deg}deg)`,
            }}
          >
            {c.showLabel && (
              <span className="plan-clearance-chip" style={{ transform: `rotate(${-deg}deg)` }}>
                {c.label}
              </span>
            )}
          </div>
        );
      })}
      {roomMode && (
        <FreezePlanLayoutContext value={setFrozenLayout}>
          <RoomEditLayer layout={layout} />
        </FreezePlanLayoutContext>
      )}
    </div>
  );
}
