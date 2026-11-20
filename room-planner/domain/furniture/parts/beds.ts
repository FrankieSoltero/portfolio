import type { StyleValues } from '../../types';
import { box, clamp, fourLegs, rounded, type Part, type PartsBuilder, type PieceSize } from './types';

/**
 * Beds. `h` is the headboard top when there is a headboard, else the top of the pillows. The
 * plan's formulas are used as given; each is also cut to a share of the piece so that every part
 * stays inside it with a positive size at any size (the extra caps only bite on beds far smaller
 * than real ones).
 */

type Base = 'platform' | 'legs' | 'storage';

/** What a bed is built from: the bed options, already read and checked. */
interface BedSpec {
  headboard: 'none' | 'low' | 'tall';
  upholstered: boolean;
  footboard: boolean;
  base: Base;
}

/** The frame's footprint in the local frame. */
interface Footprint { x0: number; x1: number; y0: number; y1: number }

/** Bottom and top of the frame under the mattress, and what stands under the frame. */
interface Support { frameBottom: number; frameTop: number; under: Part[] }

/** `value` when it is one of `allowed`, else `fallback`. */
function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/** Reads the bed options from a complete bed style. */
function bedSpec(style: StyleValues): BedSpec {
  return {
    headboard: pick(style.headboard, ['none', 'low', 'tall'] as const, 'low'),
    upholstered: pick(style.finish, ['panel', 'upholstered'] as const, 'panel') === 'upholstered',
    footboard: pick(style.footboard, ['yes', 'no'] as const, 'no') === 'yes',
    base: pick(style.base, ['platform', 'legs', 'storage'] as const, 'platform'),
  };
}

/**
 * The frame heights for `base` and what stands under the frame: four block legs for 'legs'; for
 * 'platform' the frame starts at the floor gap and a recessed plinth fills the gap; for 'storage'
 * the frame reaches the floor. The mattress sits on the frame top.
 */
function support(size: PieceSize, base: Base, mattressTop: number, f: Footprint): Support {
  const { w, d, h } = size;
  if (base === 'legs') {
    const legTop = Math.min(clamp(0.2 * h, 2, 9), 0.4 * mattressTop);
    const frameThick = Math.min(clamp(0.08 * h, 1, 4), 0.2 * mattressTop);
    const under: PieceSize = { w: f.x1 - f.x0, d: f.y1 - f.y0, h };
    const shift = (f.y0 + f.y1) / 2;
    const legs = fourLegs(under, 'block', legTop, clamp(0.03 * Math.min(w, d), 0.25, 2));
    return { frameBottom: legTop, frameTop: legTop + frameThick, under: legs.map((leg) => ({ ...leg, cy: leg.cy + shift })) };
  }
  const mattressThick = Math.min(clamp(0.25 * h, 2, 12), 0.6 * mattressTop);
  const frameTop = mattressTop - mattressThick;
  if (base === 'storage') return { frameBottom: 0, frameTop, under: [] };
  const gap = Math.min(clamp(0.06 * h, 0.5, 3), 0.3 * frameTop);
  const recess = Math.min(clamp(0.05 * Math.min(w, d), 0.5, 3), 0.25 * Math.min(f.x1 - f.x0, f.y1 - f.y0));
  const plinth = box('accent', f.x0 + recess, f.x1 - recess, f.y0 + recess, f.y1 - recess, 0, gap);
  return { frameBottom: gap, frameTop, under: [plinth] };
}

/**
 * Two drawer fronts (detail, accent) side by side along one long side of a storage frame: from the
 * frame face at `xFace` out by `thick`, with a small reveal between and around them.
 */
function drawerFronts(xFace: number, outward: 1 | -1, thick: number, y0: number, y1: number, frameTop: number): Part[] {
  const reveal = Math.min(0.5, 0.02 * (y1 - y0), 0.05 * frameTop);
  const z0 = Math.min(1, 0.15 * frameTop);
  const each = (y1 - y0 - 3 * reveal) / 2;
  const [x0, x1] = outward === 1 ? [xFace, xFace + thick] : [xFace - thick, xFace];
  return [0, 1].map((i) => {
    const start = y0 + reveal + i * (each + reveal);
    return { ...box('accent', x0, x1, start, start + each, z0, frameTop - reveal), detail: true as const };
  });
}

/** A bed: headboard, optional footboard, frame on its base, mattress, duvet and pillows. */
function bedBody(size: PieceSize, spec: BedSpec): Part[] {
  const { w, d, h } = size;

  // Heights.
  const pillowThick = Math.min(clamp(0.1 * h, 0.05, 5), h / 3);
  const mattressTop =
    spec.headboard === 'none' ? h - pillowThick : Math.min(clamp(0.55 * h, 4, 26), h - pillowThick);
  const headTop = spec.headboard === 'tall' ? h : Math.min(h, mattressTop + clamp(0.3 * h, 4, 14));
  const footTop = Math.min(h, mattressTop + clamp(0.08 * h, 1, 6));

  // Boards at the back and front edges; the frame between them, narrowed on a storage base so
  // that the drawer fronts stand proud of it and still end at the sides of the piece.
  const board = Math.min(clamp(0.03 * d, 1, 3), 0.1 * d);
  const fronts = spec.base === 'storage' ? Math.min(0.75, 0.04 * w) : 0;
  const frame: Footprint = {
    x0: -w / 2 + fronts,
    x1: w / 2 - fronts,
    y0: spec.headboard === 'none' ? -d / 2 : -d / 2 + board,
    y1: spec.footboard ? d / 2 - board : d / 2,
  };

  const parts: Part[] = [];
  const boardPart = (y0: number, y1: number, z1: number) =>
    spec.upholstered
      ? rounded('main', -w / 2, w / 2, y0, y1, 0, z1, 0.4 * board)
      : box('accent', -w / 2, w / 2, y0, y1, 0, z1);
  if (spec.headboard !== 'none') parts.push(boardPart(-d / 2, -d / 2 + board, headTop));
  if (spec.footboard) parts.push(boardPart(d / 2 - board, d / 2, footTop));

  // Frame on its base.
  const { frameBottom, frameTop, under } = support(size, spec.base, mattressTop, frame);
  parts.push(...under, box('accent', frame.x0, frame.x1, frame.y0, frame.y1, frameBottom, frameTop));
  if (spec.base === 'storage') {
    parts.push(...drawerFronts(frame.x0, -1, fronts, frame.y0, frame.y1, frameTop));
    parts.push(...drawerFronts(frame.x1, 1, fronts, frame.y0, frame.y1, frameTop));
  }

  // Mattress, slightly inset from the frame edges.
  const inset = Math.min(1, 0.04 * Math.min(w, d));
  const mx0 = frame.x0 + inset;
  const mx1 = frame.x1 - inset;
  const my0 = frame.y0 + inset;
  const my1 = frame.y1 - inset;
  const mattressThick = mattressTop - frameTop;
  parts.push(rounded('linen', mx0, mx1, my0, my1, frameTop, mattressTop, Math.min(2, 0.2 * mattressThick)));

  // Duvet over the front 68% of the mattress, a little past its sides and front edge.
  const over = inset / 2;
  const duvetThick = Math.min(clamp(0.03 * h, 0.25, 1.5), 0.5 * pillowThick);
  const duvetBack = my1 - 0.68 * (my1 - my0);
  const duvetBottom = mattressTop - 0.6 * mattressThick;
  parts.push(rounded('main', mx0 - over, mx1 + over, duvetBack, my1 + over, duvetBottom, mattressTop + duvetThick, duvetThick));

  // Pillows at the head: one on a narrow bed, two side by side on a wider one.
  const mw = mx1 - mx0;
  const pillowY0 = my0 + Math.min(1, 0.02 * (my1 - my0));
  const pillowY1 = pillowY0 + 0.24 * (my1 - my0);
  const pillow = (x0: number, x1: number) =>
    rounded('linen', x0, x1, pillowY0, pillowY1, mattressTop, mattressTop + pillowThick, 0.4 * pillowThick);
  if (w < 48) {
    parts.push(pillow(-0.35 * mw, 0.35 * mw));
  } else {
    const gap = Math.min(2, 0.05 * mw);
    const pw = (mw - 3 * gap) / 2;
    parts.push(pillow(mx0 + gap, mx0 + gap + pw), pillow(mx1 - gap - pw, mx1 - gap));
  }
  return parts;
}

/** Bed: headboard, footboard, base, mattress, duvet and pillows from the bed options. */
export const bedParts: PartsBuilder = (size, style) => bedBody(size, bedSpec(style));
