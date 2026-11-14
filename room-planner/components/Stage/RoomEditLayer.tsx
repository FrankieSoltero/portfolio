import type React from 'react';
import { createContext, useContext, useEffect, useRef, type JSX } from 'react';
import { CONFIG } from '../../config';
import { openingName, openingSpan } from '../../domain/openings';
import { wallsOf, type Wall } from '../../domain/outline';
import type { Corner, Opening, Point } from '../../domain/types';
import { startDrag } from '../../hooks/startDrag';
import { addCornerOnWall, dragCornerTo, placeOpeningOnWall, slideOpeningTo } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { type PlanLayout, toPane, toPlan } from '../../view/planLayout';

/** Thickness of a wall's pointer hit band, in px, centred on the wall. */
const WALL_HIT_PX = 16;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Lets the room editor hold the plan's layout still: called with the layout at the start of a
 * drag and with null at its end, so the room does not re-fit under the pointer mid-drag.
 * PlanView provides it; without a provider it does nothing.
 */
export const FreezePlanLayoutContext = createContext<(layout: PlanLayout | null) => void>(() => {});

/** Starts a room-mode drag; see useRoomModeDrag. */
export type BeginRoomDrag = (
  e: React.PointerEvent,
  onMove: (dx: number, dy: number) => void,
  opts: { freeze: PlanLayout; onEnd?: () => void },
) => void;

/**
 * Room-mode drags of corners, doors, windows and obstacles. The returned function freezes the plan
 * layout at `opts.freeze` and starts a drag that reports the pointer movement to `onMove`; only a
 * primary-button press starts one (callers check `isPrimaryPress` before selecting anything). For any
 * other button it freezes nothing and starts nothing, but calls `opts.onEnd` once, straight away. The drag
 * ends (calling `opts.onEnd`, then releasing the layout) on pointer up or cancel, when the calling
 * component unmounts, or at the first move after the mode has left 'room'; once ended it edits
 * nothing more, even back in room mode. Only the most recent drag is ended on unmount: one pointer
 * drags one thing at a time.
 */
export function useRoomModeDrag(): BeginRoomDrag {
  const freezeLayout = useContext(FreezePlanLayoutContext);
  // startDrag's window listeners outlive the component when room mode ends mid-drag, so unmounting
  // ends the drag here: its clean-up runs, the layout is released, and its later moves are ignored.
  const endDragRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endDragRef.current?.(), []);

  return (e, onMove, { freeze, onEnd }) => {
    // A non-primary press starts nothing; onEnd still runs once, so a caller's setup is undone.
    if (e.button !== 0) {
      onEnd?.();
      return;
    }
    freezeLayout(freeze);
    let ended = false;
    const endDrag = (): void => {
      if (ended) return;
      ended = true;
      onEnd?.();
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
        onMove(dx, dy);
      },
      endDrag,
    );
  };
}

/**
 * Whether a pointer down on a room-mode handle or obstacle should act: only the primary button
 * selects and drags. Any press stops here, so a secondary press neither reaches the plan
 * background (which would clear the selection) nor starts anything.
 */
export function isPrimaryPress(e: React.PointerEvent): boolean {
  e.stopPropagation();
  return e.button === 0;
}

/**
 * Moves keyboard focus to the pressed handle or obstacle. The drag's pointer down prevents the
 * default, which would otherwise focus it, so without this the arrow keys and Delete would still go
 * to whatever control had focus before (a sidebar radio group, say) instead of the selection.
 */
export function focusPressed(e: React.PointerEvent<HTMLElement>): void {
  e.currentTarget.focus({ preventScroll: true });
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The on-plan room editor shown in room mode, bottom to top: a transparent backdrop over the whole
 * plan (pointer down clears the room selection), a hit band along every wall (pointer down adds a
 * corner there, or places the armed door or window), a handle on every door and window (pointer
 * down selects and focuses it and slides it along its wall) and a handle on every corner (pointer
 * down selects and focuses it and drags it). Enter or Space on a handle selects it. The layer fills
 * the plan view; positions are pane pixels from `layout`, and the wall-click position is measured
 * from the plan view's box.
 * Obstacles are made editable by PlanFeatures and stack between the backdrop and the wall bands.
 */
export function RoomEditLayer({ layout }: { layout: PlanLayout }): JSX.Element {
  const outline = usePlanStore((s) => s.room.outline);
  const openings = usePlanStore((s) => s.openings);
  const selectedCornerId = useUiStore((s) => s.selectedCornerId);
  const selectedOpeningId = useUiStore((s) => s.selectedOpeningId);
  const roomTool = useUiStore((s) => s.roomTool);
  const selectCorner = useUiStore((s) => s.selectCorner);
  const selectOpening = useUiStore((s) => s.selectOpening);
  const beginDrag = useRoomModeDrag();
  const layerRef = useRef<HTMLDivElement>(null);

  const onCornerDown = (corner: Corner, e: React.PointerEvent<HTMLElement>): void => {
    if (!isPrimaryPress(e)) return;
    focusPressed(e);
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
    beginDrag(
      e,
      (dx, dy) => dragCornerTo(corner.id, { x: start.x + dx / scale, y: start.y + dy / scale }, { ...opts }),
      { freeze: layout, onEnd: () => window.removeEventListener('pointermove', trackAlt, true) },
    );
  };

  // The opening slides by the pointer movement's component along its wall (unit direction u).
  const onOpeningDown = (opening: Opening, u: Point, e: React.PointerEvent<HTMLElement>): void => {
    if (!isPrimaryPress(e)) return;
    focusPressed(e);
    selectOpening(opening.id);
    const { scale } = layout;
    const start = opening.offset;
    beginDrag(e, (dx, dy) => slideOpeningTo(opening.id, start + (dx * u.x + dy * u.y) / scale), { freeze: layout });
  };

  const onWallDown = (wall: Wall, e: React.PointerEvent<HTMLElement>): void => {
    // Only the primary button edits; any other press on a wall does nothing at all.
    e.stopPropagation();
    if (e.button !== 0) return;
    e.preventDefault();
    const frame = layerRef.current?.parentElement?.getBoundingClientRect();
    const at = toPlan({ x: e.clientX - (frame?.left ?? 0), y: e.clientY - (frame?.top ?? 0) }, layout);
    if (roomTool === 'corner') addCornerOnWall(wall.id, at);
    else placeOpeningOnWall(wall.id, at);
  };

  const clearRoomSelection = (): void => {
    const ui = useUiStore.getState();
    ui.selectCorner(null);
    ui.selectOpening(null);
    ui.selectObstacle(null);
  };

  return (
    <div ref={layerRef} className={roomTool === 'corner' ? 'room-edit-layer' : 'room-edit-layer is-placing'}>
      <div className="room-edit-backdrop" aria-hidden="true" onPointerDown={clearRoomSelection} />
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
      {openings.map((opening) => {
        const span = openingSpan(outline, opening);
        if (span === null) return null;
        const p = toPane(midpoint(span.a, span.b), layout);
        return (
          <button
            key={opening.id}
            type="button"
            className="room-opening"
            aria-label={openingName(outline, openings, opening)}
            aria-pressed={opening.id === selectedOpeningId}
            style={{ left: p.x, top: p.y }}
            onPointerDown={(e) => onOpeningDown(opening, span.u, e)}
            onClick={() => selectOpening(opening.id)}
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
    </div>
  );
}
