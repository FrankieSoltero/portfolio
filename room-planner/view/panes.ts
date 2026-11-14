/**
 * Stage pane rectangles for the three layout modes (inset, split, tabs).
 * Pure maths, in stage pixels. Ported from prototype lines 345–354.
 */
import { CONFIG } from '../config';
import type { LayoutMode, StageTab } from '../domain/types';

/** One pane on the stage. `safeW` is the usable width for fitting content. */
export interface PaneRect { left: number; top: number; w: number; h: number; z: number;
  inset: boolean; divider: boolean; safeW: number }
/** Which panes are visible; a hidden pane is `null`. */
export interface Panes { plan: PaneRect | null; three: PaneRect | null }

const INSET_W_MIN = 220;
const INSET_W_MAX = 380;
const INSET_W_FRACTION = 0.36;
const INSET_H_MIN = 200;
const INSET_H_MAX = 320;
const INSET_H_FRACTION = 0.44;
const Z_MAIN = 1;
const Z_INSET = 8;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function rect(left: number, top: number, w: number, h: number, extra: Partial<PaneRect> = {}): PaneRect {
  return { left, top, w, h, z: Z_MAIN, inset: false, divider: false, safeW: w, ...extra };
}

/**
 * Compute the plan and 3D pane rectangles for a stage of `sw`×`sh` pixels.
 * In inset layout the plan is the inset unless `insetSwapped` is true.
 */
export function computePanes(sw: number, sh: number, layout: LayoutMode,
  tab: StageTab, insetSwapped: boolean): Panes {
  if (layout === 'tabs') {
    const full = rect(0, 0, sw, sh);
    return { plan: tab === '2d' ? full : null, three: tab === '3d' ? full : null };
  }
  if (layout === 'split') {
    const hw = Math.floor(sw / 2);
    return { plan: rect(0, 0, hw, sh), three: rect(hw, 0, sw - hw, sh, { divider: true }) };
  }
  const iw = clamp(sw * INSET_W_FRACTION, INSET_W_MIN, INSET_W_MAX);
  const ih = clamp(sh * INSET_H_FRACTION, INSET_H_MIN, INSET_H_MAX);
  const inset = rect(sw - iw - CONFIG.insetGap, sh - ih - CONFIG.insetGap, iw, ih, { z: Z_INSET, inset: true });
  const main = rect(0, 0, sw, sh, { safeW: Math.max(CONFIG.minSafeWidth, sw - iw - 2 * CONFIG.insetGap) });
  return insetSwapped ? { plan: main, three: inset } : { plan: inset, three: main };
}
