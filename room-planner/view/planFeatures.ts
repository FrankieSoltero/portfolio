/**
 * Plan drawings of doors and windows, in pane pixels. Pure: no React, no DOM. Each opening is
 * placed by openingSpan on its wall; an opening whose wall is not in the outline is not drawn.
 */
import { openingSpan } from '../domain/openings';
import type { Corner, Door, Point, WindowOpening } from '../domain/types';
import { toPane, type PlanLayout } from './planLayout';

/**
 * A door on the plan: `gap` is the opening's two ends on the wall, `leaf` runs from the hinge to
 * the open leaf's end, and `arc` is an SVG path from the closed leaf's end to the open leaf's end
 * whose radius is the door's width.
 */
export interface DoorDrawing { id: string; gap: [Point, Point]; leaf: [Point, Point]; arc: string }

/** A window on the plan: its ends `a` and `b` on the wall line, and `inner`, the same segment moved
 * WINDOW_INNER_PX along the wall's inward normal. */
export interface WindowDrawing { id: string; a: Point; b: Point; inner: [Point, Point] }

/** How far inside the wall line a window's second line is drawn, in pane pixels. */
const WINDOW_INNER_PX = 3;

/** Turns −0 into 0, so a coordinate never prints as "-0" in a path. */
function clean(v: number): number {
  return v === 0 ? 0 : v;
}

function fmt(v: number): string {
  return String(clean(v));
}

/** The door's drawing, or null when its wall is not in the outline. */
export function doorDrawing(door: Door, outline: readonly Corner[], layout: PlanLayout): DoorDrawing | null {
  const span = openingSpan(outline, door);
  if (span === null) return null;
  const hinge = door.hinge === 'start' ? span.a : span.b;
  const closedEnd = door.hinge === 'start' ? span.b : span.a;
  // The leaf opens to the room's side of the wall for 'in', to the outside for 'out'.
  const side = door.swing === 'in' ? 1 : -1;
  const openEnd = { x: hinge.x + span.n.x * door.width * side, y: hinge.y + span.n.y * door.width * side };

  const h = toPane(hinge, layout);
  const c = toPane(closedEnd, layout);
  const o = toPane(openEnd, layout);
  const r = door.width * layout.scale;
  // With y down, a positive cross product of (closed − hinge) × (open − hinge) is a clockwise turn
  // on screen, which is SVG's sweep flag 1.
  const cross = (c.x - h.x) * (o.y - h.y) - (c.y - h.y) * (o.x - h.x);
  const sweep = cross > 0 ? 1 : 0;
  return {
    id: door.id,
    gap: [toPane(span.a, layout), toPane(span.b, layout)],
    leaf: [h, o],
    arc: `M ${fmt(c.x)} ${fmt(c.y)} A ${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(o.x)} ${fmt(o.y)}`,
  };
}

/** The window's drawing, or null when its wall is not in the outline. */
export function windowDrawing(win: WindowOpening, outline: readonly Corner[], layout: PlanLayout): WindowDrawing | null {
  const span = openingSpan(outline, win);
  if (span === null) return null;
  const a = toPane(span.a, layout);
  const b = toPane(span.b, layout);
  const dx = span.n.x * WINDOW_INNER_PX;
  const dy = span.n.y * WINDOW_INNER_PX;
  return {
    id: win.id,
    a,
    b,
    inner: [{ x: a.x + dx, y: a.y + dy }, { x: b.x + dx, y: b.y + dy }],
  };
}
