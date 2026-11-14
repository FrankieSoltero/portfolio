import type React from 'react';
import { createContext, useContext, useEffect, useRef, type JSX } from 'react';
import { CONFIG } from '../../config';
import { wallsOf, type Wall } from '../../domain/outline';
import type { Corner } from '../../domain/types';
import { startDrag } from '../../hooks/startDrag';
import { addCornerOnWall, dragCornerTo } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { type PlanLayout, toPane } from '../../view/planLayout';

/** Thickness of a wall's pointer hit band, in px, centred on the wall. */
const WALL_HIT_PX = 16;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Lets the room editor hold the plan's layout still: called with the layout at the start of a
 * corner drag and with null at its end, so the room does not re-fit under the pointer mid-drag.
 * PlanView provides it; without a provider it does nothing.
 */
export const FreezePlanLayoutContext = createContext<(layout: PlanLayout | null) => void>(() => {});

/**
 * The on-plan room editor shown in room mode: a hit band along every wall (pointer down adds a
 * corner there) under a handle button on every corner (pointer down selects it and drags it;
 * Enter or Space selects it). Positions are pane pixels from `layout`; the elements are
 * positioned in the plan view, whose box the wall-click position is measured from.
 */
export function RoomEditLayer({ layout }: { layout: PlanLayout }): JSX.Element {
  const outline = usePlanStore((s) => s.room.outline);
  const selectedCornerId = useUiStore((s) => s.selectedCornerId);
  const selectCorner = useUiStore((s) => s.selectCorner);
  const freezeLayout = useContext(FreezePlanLayoutContext);
  // Ends the corner drag under way, if any. startDrag's window listeners outlive this layer when
  // room mode ends mid-drag, so unmounting ends the drag here: the Alt listener goes and the
  // layout is released, and the drag's later moves are ignored.
  const endDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endDragRef.current?.(), []);

  const onCornerDown = (corner: Corner, e: React.PointerEvent): void => {
    selectCorner(corner.id);
    const { scale } = layout;
    const start = { x: corner.x, y: corner.y };
    const opts = { angleSnap: !e.altKey, toleranceIn: CONFIG.angleSnapTolerancePx / scale };
    // startDrag reports only the movement, so the Alt state comes from each pointer move. This
    // capture listener is added before startDrag's own, so it runs first on every move.
    const trackAlt = (ev: PointerEvent): void => {
      opts.angleSnap = !ev.altKey;
    };
    window.addEventListener('pointermove', trackAlt, true);
    freezeLayout(layout);
    let ended = false;
    const endDrag = (): void => {
      if (ended) return;
      ended = true;
      window.removeEventListener('pointermove', trackAlt, true);
      freezeLayout(null);
      if (endDragRef.current === endDrag) endDragRef.current = null;
    };
    endDragRef.current = endDrag;
    startDrag(
      e,
      (dx, dy) => {
        // Once room mode has ended, the rest of the gesture edits nothing, even back in room mode.
        if (!ended && useUiStore.getState().mode !== 'room') endDrag();
        if (ended) return;
        dragCornerTo(corner.id, { x: start.x + dx / scale, y: start.y + dy / scale }, { ...opts });
      },
      endDrag,
    );
  };

  const onWallDown = (wall: Wall, e: React.PointerEvent<HTMLElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    const frame = e.currentTarget.parentElement?.getBoundingClientRect();
    const x = e.clientX - (frame?.left ?? 0);
    const y = e.clientY - (frame?.top ?? 0);
    addCornerOnWall(wall.id, { x: (x - layout.ox) / layout.scale, y: (y - layout.oy) / layout.scale });
  };

  return (
    <>
      {wallsOf(outline).map((wall) => {
        const a = toPane(wall.a, layout);
        const deg = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x) * RAD_TO_DEG;
        return (
          <div
            key={wall.id}
            className="room-wall-hit"
            data-wall-id={wall.id}
            aria-hidden="true"
            style={{
              left: a.x,
              top: a.y - WALL_HIT_PX / 2,
              width: wall.length * layout.scale,
              height: WALL_HIT_PX,
              transform: `rotate(${deg}deg)`,
            }}
            onPointerDown={(e) => onWallDown(wall, e)}
          />
        );
      })}
      {outline.map((corner, i) => {
        const p = toPane(corner, layout);
        return (
          <button
            key={corner.id}
            type="button"
            className="room-corner"
            aria-label={`Corner ${i + 1}`}
            aria-pressed={corner.id === selectedCornerId}
            style={{ left: p.x, top: p.y }}
            onPointerDown={(e) => onCornerDown(corner, e)}
            onClick={() => selectCorner(corner.id)}
          />
        );
      })}
    </>
  );
}
