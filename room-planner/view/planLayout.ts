/**
 * Plan-view fitting, item-box and clearance-line maths, in pane pixels.
 * Ported from prototype lines 356–361 and 691–699, generalised to an outline and turned footprints.
 */
import { CONFIG } from '../config';
import { rayToPolygon } from '../domain/polygon';
import { footprintCorners, normaliseAngle, type Footprint } from '../domain/shape';
import type { Bounds, Point, Units } from '../domain/types';
import { fmtLen } from '../domain/units';
import type { PaneRect } from './panes';

/** Pixels per inch and the pane-pixel position of plan point (0, 0). */
export interface PlanLayout { scale: number; ox: number; oy: number }

/** A dashed wall-gap line from a side of the selected item to the wall it faces, in pane pixels. */
export interface ClearanceLine { x1: number; y1: number; x2: number; y2: number; label: string; showLabel: boolean }

/** Gaps at or below this many inches get no clearance line. */
const MIN_CLEARANCE_GAP = 0.5;
/** Labels are shown only on lines longer than this many pixels. */
const MIN_LABEL_PX = 34;
const QUARTER_TURN_DEG = 90;

/** Fit the outline's bounding box centred inside the pane's safe width, keeping the plan margin. */
export function computePlanLayout(bounds: Bounds, pane: PaneRect): PlanLayout {
  const sw = pane.safeW;
  const sh = pane.h;
  const m = pane.inset ? CONFIG.planMarginInset : CONFIG.planMargin;
  const scale = Math.max(CONFIG.minPlanScale, Math.min((sw - 2 * m) / bounds.w, (sh - 2 * m) / bounds.l));
  return {
    scale,
    ox: (sw - bounds.w * scale) / 2 - bounds.minX * scale,
    oy: (sh - bounds.l * scale) / 2 - bounds.minY * scale,
  };
}

/** The pane-pixel position of a plan point. */
export function toPane(p: Point, layout: PlanLayout): Point {
  return { x: layout.ox + p.x * layout.scale, y: layout.oy + p.y * layout.scale };
}

/** The plan point at a pane-pixel position: the inverse of toPane. */
export function toPlan(p: Point, layout: PlanLayout): Point {
  return { x: (p.x - layout.ox) / layout.scale, y: (p.y - layout.oy) / layout.scale };
}

/**
 * One line per side of the footprint, from the side's midpoint along its outward normal to the
 * nearest wall of the outline. Gaps of 0.5 in or less (or no wall hit) are skipped; labels are
 * hidden on lines of 34 px or less.
 */
export function computeClearances(fp: Footprint, outline: readonly Point[], layout: PlanLayout,
  units: Units): ClearanceLine[] {
  const corners = footprintCorners(fp);
  const lines: ClearanceLine[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    // Corners run clockwise on screen (the outline convention), so the outward normal of a→b
    // is the inward-normal formula negated.
    const normal = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const gap = rayToPolygon(mid, normal, outline);
    if (gap === null || gap <= MIN_CLEARANCE_GAP) continue;
    const from = toPane(mid, layout);
    const to = toPane({ x: mid.x + normal.x * gap, y: mid.y + normal.y * gap }, layout);
    lines.push({
      x1: from.x, y1: from.y, x2: to.x, y2: to.y,
      label: fmtLen(gap, units),
      showLabel: gap * layout.scale > MIN_LABEL_PX,
    });
  }
  return lines;
}

/** The item's unrotated box centred on its footprint centre, and the CSS rotation that turns it. */
export function planItemBox(fp: Footprint, layout: PlanLayout):
  { left: number; top: number; width: number; height: number; rotateDeg: number } {
  const width = fp.w * layout.scale;
  const height = fp.d * layout.scale;
  const c = toPane({ x: fp.cx, y: fp.cy }, layout);
  return { left: c.x - width / 2, top: c.y - height / 2, width, height, rotateDeg: fp.angle };
}

/**
 * The item label's box as it appears on screen and its net on-screen rotation: sized to the
 * footprint at the nearest quarter turn q (width and height swapped for 90° and 270°) and tilted
 * by θ − q, so it is upright at quarter turns and never tilted more than 45°.
 */
export function labelBox(fp: Footprint, layout: PlanLayout): { width: number; height: number; rotateDeg: number } {
  const angle = normaliseAngle(fp.angle);
  const quarters = Math.round(angle / QUARTER_TURN_DEG);
  const swapped = quarters % 2 === 1;
  const w = fp.w * layout.scale;
  const d = fp.d * layout.scale;
  return {
    width: swapped ? d : w,
    height: swapped ? w : d,
    rotateDeg: angle - quarters * QUARTER_TURN_DEG,
  };
}
