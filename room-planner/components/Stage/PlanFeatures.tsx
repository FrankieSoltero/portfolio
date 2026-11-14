import type React from 'react';
import type { JSX } from 'react';
import { obstacleFootprint, obstacleName } from '../../domain/obstacles';
import type { Door, Obstacle, Point, WindowOpening } from '../../domain/types';
import { dragObstacleTo } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useConflicts } from '../../state/selectors';
import { useUiStore } from '../../state/uiStore';
import { doorDrawing, windowDrawing } from '../../view/planFeatures';
import { planItemBox, type PlanLayout } from '../../view/planLayout';
import { isPrimaryPress, useRoomModeDrag } from './RoomEditLayer';

/** An obstacle's label is shown only when its box is wider than this on screen, in px. */
const OBSTACLE_LABEL_MIN_W = 48;

function lineClass(base: string, conflict: boolean): string {
  return conflict ? `${base} is-conflict` : base;
}

/**
 * The plan's doors, windows and fixed obstacles, drawn over the walls and under the furniture.
 * The doors and windows are a drawing only, hidden from assistive technology (the room editor puts
 * a handle on each). In furnish mode the obstacles are a drawing too; in room mode each is a
 * button (named by its label, `aria-pressed` when selected) that pointer down selects and drags,
 * and Enter or Space selects. Obstacle labels are React text, never markup.
 */
export function PlanFeatures({ layout }: { layout: PlanLayout }): JSX.Element {
  const outline = usePlanStore((s) => s.room.outline);
  const openings = usePlanStore((s) => s.openings);
  const obstacles = usePlanStore((s) => s.obstacles);
  const roomMode = useUiStore((s) => s.mode === 'room');
  const selectedObstacleId = useUiStore((s) => s.selectedObstacleId);
  const selectObstacle = useUiStore((s) => s.selectObstacle);
  const beginDrag = useRoomModeDrag();
  const conflicts = useConflicts();

  // Moves the obstacle's centre from where it was at pointer down by the movement over the scale.
  const onObstacleDown = (obstacle: Obstacle, e: React.PointerEvent): void => {
    if (!isPrimaryPress(e)) return;
    selectObstacle(obstacle.id);
    const { scale } = layout;
    const { id, x: x0, y: y0 } = obstacle;
    beginDrag(e, (dx, dy) => dragObstacleTo(id, x0 + dx / scale, y0 + dy / scale), { freeze: layout });
  };

  // Only Enter and Space are handled here; every other key reaches the window-level shortcuts.
  const onObstacleKey = (obstacle: Obstacle, e: React.KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    selectObstacle(obstacle.id);
  };

  const doors = openings
    .filter((o): o is Door => o.kind === 'door')
    .map((o) => doorDrawing(o, outline, layout))
    .filter((d) => d !== null);
  const windows = openings
    .filter((o): o is WindowOpening => o.kind === 'window')
    .map((o) => windowDrawing(o, outline, layout))
    .filter((w) => w !== null);

  return (
    <>
      <svg className="plan-features" aria-hidden="true">
        {doors.map((d) => {
          const conflict = conflicts[d.id] !== undefined;
          return (
            <g key={d.id}>
              <line
                className={lineClass('plan-door-gap', conflict)}
                data-opening-id={d.id}
                x1={d.gap[0].x}
                y1={d.gap[0].y}
                x2={d.gap[1].x}
                y2={d.gap[1].y}
              />
              <line
                className={lineClass('plan-door-leaf', conflict)}
                data-opening-id={d.id}
                x1={d.leaf[0].x}
                y1={d.leaf[0].y}
                x2={d.leaf[1].x}
                y2={d.leaf[1].y}
              />
              <path className={lineClass('plan-door-arc', conflict)} data-opening-id={d.id} d={d.arc} />
            </g>
          );
        })}
        {windows.map((w) => {
          const className = lineClass('plan-window', conflicts[w.id] !== undefined);
          // The band clears the wall line; the outside edge, the centre and the inside edge are drawn on it.
          const lines: [Point, Point][] = [w.outside, [w.a, w.b], w.inside];
          return (
            <g key={w.id}>
              <line className="plan-window-band" data-opening-id={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} />
              {lines.map(([p, q], i) => (
                <line key={i} className={className} data-opening-id={w.id} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
              ))}
            </g>
          );
        })}
      </svg>
      {obstacles.map((o) => {
        const box = planItemBox(obstacleFootprint(o), layout);
        const isSelected = roomMode && o.id === selectedObstacleId;
        const className = [
          'plan-obstacle',
          o.shape === 'cylinder' && 'is-round',
          conflicts[o.id] !== undefined && 'is-conflict',
          roomMode && 'is-editable',
          isSelected && 'is-selected',
        ]
          .filter(Boolean)
          .join(' ');
        const editing = roomMode
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': obstacleName(o),
              'aria-pressed': isSelected,
              onPointerDown: (e: React.PointerEvent) => onObstacleDown(o, e),
              // Assistive technology activates a button with a synthetic click; selecting is idempotent.
              onClick: () => selectObstacle(o.id),
              onKeyDown: (e: React.KeyboardEvent) => onObstacleKey(o, e),
            }
          : { 'aria-hidden': true };
        return (
          <div
            key={o.id}
            data-obstacle-id={o.id}
            {...editing}
            className={className}
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              transform: `rotate(${box.rotateDeg}deg)`,
            }}
          >
            {box.width > OBSTACLE_LABEL_MIN_W && o.label !== '' && (
              <span className="plan-obstacle-label">{o.label}</span>
            )}
          </div>
        );
      })}
    </>
  );
}
