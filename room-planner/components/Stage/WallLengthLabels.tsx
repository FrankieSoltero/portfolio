import type React from 'react';
import type { JSX } from 'react';
import { CONFIG } from '../../config';
import { wallFrame, wallsOf } from '../../domain/outline';
import { fmtLen } from '../../domain/units';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { type PlanLayout, toPane } from '../../view/planLayout';

/** Keeps a press on a label off the plan background, which would clear the room selection. */
function stopPress(e: React.PointerEvent): void {
  e.stopPropagation();
}

/**
 * A button on the plan for every wall in room mode, showing the wall's length in the current
 * units and named `Wall <n>, <length>`. Each is centred on its wall's midpoint (pane px from
 * `layout`) moved `CONFIG.wallLabelOffsetPx` outside the room, against the wall's inward normal.
 * The selected wall's label is pressed. A label that receives focus (by Tab, a click, or a press
 * on its wall's band) selects its wall; a pointer down on it does not reach the plan background.
 * Each carries `data-wall-label-id` so a wall press can focus it.
 */
export function WallLengthLabels({ layout }: { layout: PlanLayout }): JSX.Element {
  const outline = usePlanStore((s) => s.room.outline);
  const units = usePlanStore((s) => s.units);
  const selectedWallId = useUiStore((s) => s.selectedWallId);
  const selectWall = useUiStore((s) => s.selectWall);

  return (
    <>
      {wallsOf(outline).map((wall) => {
        const { n } = wallFrame(wall);
        const mid = toPane({ x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }, layout);
        const text = fmtLen(wall.length, units);
        return (
          <button
            key={wall.id}
            type="button"
            className="room-wall-label"
            data-wall-label-id={wall.id}
            aria-label={`Wall ${wall.index + 1}, ${text}`}
            aria-pressed={wall.id === selectedWallId}
            style={{ left: mid.x - CONFIG.wallLabelOffsetPx * n.x, top: mid.y - CONFIG.wallLabelOffsetPx * n.y }}
            onPointerDown={stopPress}
            onFocus={() => selectWall(wall.id)}
          >
            {text}
          </button>
        );
      })}
    </>
  );
}
