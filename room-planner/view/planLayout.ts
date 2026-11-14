/**
 * Plan-view fitting and clearance-line maths, in pane pixels.
 * Ported from prototype lines 356–361 and 691–699.
 */
import { CONFIG } from '../config';
import { footprint } from '../domain/geometry';
import type { Item, Room, Units } from '../domain/types';
import { fmtLen } from '../domain/units';
import type { PaneRect } from './panes';

/** Pixels per inch and the pane-pixel origin of the room's top-left corner. */
export interface PlanLayout { scale: number; ox: number; oy: number }

/** A dashed wall-gap line from a selected item to one wall, in pane pixels. */
export interface ClearanceLine { left: number; top: number; length: number;
  orientation: 'h' | 'v'; label: string; showLabel: boolean }

/** Gaps at or below this many inches get no clearance line. */
const MIN_CLEARANCE_GAP = 0.5;
/** Labels are shown only on lines longer than this many pixels. */
const MIN_LABEL_PX = 34;

/** Fit the room centred inside the pane's safe width, keeping the plan margin. */
export function computePlanLayout(room: Room, pane: PaneRect): PlanLayout {
  const sw = pane.safeW;
  const sh = pane.h;
  const m = pane.inset ? CONFIG.planMarginInset : CONFIG.planMargin;
  const scale = Math.max(CONFIG.minPlanScale, Math.min((sw - 2 * m) / room.w, (sh - 2 * m) / room.l));
  return { scale, ox: (sw - room.w * scale) / 2, oy: (sh - room.l * scale) / 2 };
}

/**
 * Lines from the item's footprint to each of the four walls through its centre.
 * Gaps of 0.5 in or less are skipped; labels are hidden on lines of 34 px or less.
 */
export function computeClearances(item: Item, room: Room, layout: PlanLayout,
  units: Units): ClearanceLine[] {
  const { scale: sc, ox, oy } = layout;
  const [fw, fd] = footprint(item);
  const mx = ox + (item.x + fw / 2) * sc;
  const my = oy + (item.y + fd / 2) * sc;
  const lines: ClearanceLine[] = [];
  const add = (gap: number, left: number, top: number, orientation: 'h' | 'v'): void => {
    if (gap > MIN_CLEARANCE_GAP) {
      lines.push({ left, top, length: gap * sc, orientation, label: fmtLen(gap, units), showLabel: gap * sc > MIN_LABEL_PX });
    }
  };
  add(item.x, ox, my, 'h');
  add(room.w - item.x - fw, ox + (item.x + fw) * sc, my, 'h');
  add(item.y, mx, oy, 'v');
  add(room.l - item.y - fd, mx, oy + (item.y + fd) * sc, 'v');
  return lines;
}
