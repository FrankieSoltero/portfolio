import type { JSX } from 'react';
import { obstacleFootprint } from '../../domain/obstacles';
import type { Door, WindowOpening } from '../../domain/types';
import { usePlanStore } from '../../state/planStore';
import { useConflicts } from '../../state/selectors';
import { doorDrawing, windowDrawing } from '../../view/planFeatures';
import { planItemBox, type PlanLayout } from '../../view/planLayout';

/** An obstacle's label is shown only when its box is wider than this on screen, in px. */
const OBSTACLE_LABEL_MIN_W = 48;

function lineClass(base: string, conflict: boolean): string {
  return conflict ? `${base} is-conflict` : base;
}

/**
 * The plan's doors, windows and fixed obstacles, drawn over the walls and under the furniture.
 * Drawing only: nothing here takes pointer or key input or focus, and it is hidden from assistive
 * technology (the sidebar lists these things). Obstacle labels are React text, never markup.
 */
export function PlanFeatures({ layout }: { layout: PlanLayout }): JSX.Element {
  const outline = usePlanStore((s) => s.room.outline);
  const openings = usePlanStore((s) => s.openings);
  const obstacles = usePlanStore((s) => s.obstacles);
  const conflicts = useConflicts();

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
          return (
            <g key={w.id}>
              <line className={className} data-opening-id={w.id} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} />
              <line
                className={className}
                data-opening-id={w.id}
                x1={w.inner[0].x}
                y1={w.inner[0].y}
                x2={w.inner[1].x}
                y2={w.inner[1].y}
              />
            </g>
          );
        })}
      </svg>
      {obstacles.map((o) => {
        const box = planItemBox(obstacleFootprint(o), layout);
        const className = [
          'plan-obstacle',
          o.shape === 'cylinder' && 'is-round',
          conflicts[o.id] !== undefined && 'is-conflict',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={o.id}
            data-obstacle-id={o.id}
            aria-hidden="true"
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
