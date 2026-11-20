import type { StyleValues } from '../../types';
import { box, clamp, cylinder, fourLegs, rounded, type Part, type PartsBuilder, type PieceSize } from './types';

/**
 * Sofas and chairs. Formulas from the plan are used as given; each is also cut to a share of the
 * piece so that every part stays inside it and keeps a positive size at any size (the extra caps
 * only bite on pieces far smaller than real furniture).
 */

type LegType = 'block' | 'tapered' | 'metal' | 'pedestal' | 'none';
type ArmType = 'track' | 'rounded' | 'slim' | 'none';
type Side = 'none' | 'left' | 'right';

/** What a sofa-like piece is built from: the sofa options, already read and checked. */
interface SofaSpec {
  seats: 'auto' | number;
  arms: ArmType;
  back: 'low' | 'standard' | 'high';
  cushions: 'loose' | 'tight';
  legs: LegType;
  chaise: Side;
}

/** Narrowest seat cushion an explicit seat count may give, in inches. */
const MIN_CUSHION_WIDTH = 14;

/** Back-frame top as a share of the height, per back option. */
const BACK_TOP = { low: 0.75, standard: 0.9, high: 1 } as const;

/** `value` when it is one of `allowed`, else `fallback`. */
function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/**
 * A central column on a round base, slot accent, from the floor to `top`: base 0.7 × the shorter
 * side across and clamp(0.06 h, 0.75, 2) tall (at most half of `top`); column
 * clamp(0.14 × the shorter side, 1.5, 5) across (at most half the base).
 */
function pedestal(size: PieceSize, top: number): Part[] {
  const short = Math.min(size.w, size.d);
  const baseDiameter = 0.7 * short;
  const baseTop = Math.min(clamp(0.06 * size.h, 0.75, 2), 0.5 * top);
  const columnDiameter = Math.min(clamp(0.14 * short, 1.5, 5), 0.5 * baseDiameter);
  return [cylinder('accent', 0, 0, 0, baseTop, baseDiameter), cylinder('accent', 0, 0, baseTop, top, columnDiameter)];
}

/** Legs of `type` from the floor to `top`, or none for 'none' or a zero height. */
function legsOf(size: PieceSize, type: LegType, top: number, inset: number): Part[] {
  if (type === 'none' || top <= 0) return [];
  if (type === 'pedestal') return pedestal(size, top);
  return fourLegs(size, type, top, inset);
}

/** Gap between neighbouring seat cushions across a `span` split into `n` seats. */
function cushionGap(span: number, n: number): number {
  return Math.min(0.5, (0.1 * span) / n);
}

/** Width of each of `n` seat cushions across `span`. */
function cushionWidth(span: number, n: number): number {
  return (span - (n - 1) * cushionGap(span, n)) / n;
}

/** A sofa, or an armchair as a one-seat sofa. */
function sofaBody(size: PieceSize, spec: SofaSpec): Part[] {
  const { w, d, h } = size;
  const chaise: Side = w >= 60 ? spec.chaise : 'none';

  // Heights.
  const seatTop = Math.min(clamp(0.5 * h, 6, 20), 0.6 * h);
  const legTop = spec.legs === 'none' ? 0 : Math.min(clamp(0.15 * h, 1, 7), 0.4 * seatTop);
  const backTop = BACK_TOP[spec.back] * h;
  const cushionThick = Math.min(clamp(0.15 * h, 2, 6), 0.45 * (seatTop - legTop));
  const deck = seatTop - cushionThick;
  const armTop = Math.min(seatTop + clamp(0.25 * h, 2, 9), seatTop + 0.8 * (backTop - seatTop));
  const backCushionTop = seatTop + 0.9 * (backTop - seatTop);

  // Widths and depths.
  const track = Math.min(clamp(0.1 * w, 3, 9), w / 4);
  const armWidth = { track, rounded: track, slim: track / 2, none: 0 }[spec.arms];
  const backDepth = Math.min(clamp(0.24 * d, 3, 10), 0.4 * d);
  const backCushionDepth = Math.min(clamp(0.18 * d, 2, 7), 0.2 * d);
  const yFrame = -d / 2 + backDepth;
  const ySeat = yFrame + backCushionDepth;
  const seatRoom = d - backDepth - backCushionDepth;
  const yShort =
    chaise === 'none' ? d / 2 : -d / 2 + Math.max(clamp(0.62 * d, 12, d - 4), d - 0.75 * seatRoom);

  // Seats between the arms; a chaise end has no arm, so its seat runs to the side edge.
  const xLeft = chaise === 'left' ? -w / 2 : -w / 2 + armWidth;
  const xRight = chaise === 'right' ? w / 2 : w / 2 - armWidth;
  const span = xRight - xLeft;
  let seats = spec.seats === 'auto' ? clamp(Math.round((w - 2 * armWidth) / 26), 1, 5) : spec.seats;
  while (seats > 1 && cushionWidth(span, seats) < MIN_CUSHION_WIDTH) seats -= 1;
  const gap = cushionGap(span, seats);
  const cw = cushionWidth(span, seats);
  const chaiseSeat = chaise === 'left' ? 0 : chaise === 'right' ? seats - 1 : -1;
  const slots = Array.from({ length: seats }, (_, i) => {
    const x0 = xLeft + i * (cw + gap);
    return { x0, x1: x0 + cw, front: i === chaiseSeat ? d / 2 : yShort };
  });

  const parts: Part[] = [];

  // Frame: the back across the seats, the deck under the cushions (split at the chaise).
  parts.push(box('main', xLeft, xRight, -d / 2, yFrame, legTop, backTop));
  if (chaise === 'none') {
    parts.push(box('main', xLeft, xRight, yFrame, d / 2, legTop, deck));
  } else {
    const split = chaise === 'left' ? slots[0].x1 + gap / 2 : slots[seats - 1].x0 - gap / 2;
    const [chaiseX0, chaiseX1] = chaise === 'left' ? [xLeft, split] : [split, xRight];
    parts.push(box('main', chaiseX0, chaiseX1, yFrame, d / 2, legTop, deck));
    if (seats > 1) {
      const [restX0, restX1] = chaise === 'left' ? [split, xRight] : [xLeft, split];
      parts.push(box('main', restX0, restX1, yFrame, yShort, legTop, deck));
    }
  }

  // Arms, full depth, or as deep as the short seats beside a chaise.
  if (armWidth > 0) {
    const armFront = chaise === 'none' ? d / 2 : yShort;
    const arm = (x0: number, x1: number) =>
      spec.arms === 'rounded'
        ? rounded('main', x0, x1, -d / 2, armFront, legTop, armTop, 0.45 * armWidth)
        : box('main', x0, x1, -d / 2, armFront, legTop, armTop);
    if (chaise !== 'left') parts.push(arm(-w / 2, -w / 2 + armWidth));
    if (chaise !== 'right') parts.push(arm(w / 2 - armWidth, w / 2));
  }

  // Cushions: seat cushions on the deck, back cushions against the back frame.
  for (const s of slots) {
    parts.push(rounded('soft', s.x0, s.x1, ySeat, s.front, deck, seatTop, 0.3 * cushionThick));
  }
  const backCushion = (x0: number, x1: number) =>
    rounded('soft', x0, x1, yFrame, ySeat, deck, backCushionTop, 0.3 * backCushionDepth);
  if (spec.cushions === 'loose') {
    for (const s of slots) parts.push(backCushion(s.x0, s.x1));
  } else {
    parts.push(backCushion(xLeft, xRight));
  }

  // Legs at the corners; beside a chaise the short side's front leg moves back under the body.
  const legs = legsOf(size, spec.legs, legTop, clamp(0.04 * Math.min(w, d), 0.25, 2));
  const shortSide = chaise === 'left' ? 1 : -1;
  for (const leg of legs) {
    const moveBack = chaise !== 'none' && leg.cy > 0 && Math.sign(leg.cx) === shortSide;
    parts.push(moveBack ? { ...leg, cy: leg.cy - (d / 2 - yShort) } : leg);
  }
  return parts;
}

/**
 * A dining or office chair: a thin seat (rounded for office), a slim back from the seat to the
 * top at the back edge, thin arm rails on posts when `arms`, and legs or a pedestal.
 */
function uprightChair(size: PieceSize, office: boolean, arms: boolean, legs: LegType): Part[] {
  const { w, d, h } = size;
  const seatTop = Math.min(clamp(0.5 * h, 6, 19), 0.6 * h);
  const seatThick = Math.min(clamp((office ? 0.08 : 0.05) * h, 0.75, office ? 3 : 2), 0.5 * seatTop);
  const seatBottom = seatTop - seatThick;
  const backDepth = Math.min(clamp(0.07 * d, 0.75, 2.5), 0.25 * d);
  /** The seat or back: a rounded slab for office, a plain board for dining. */
  const slab = (y0: number, y1: number, z0: number, z1: number, radius: number) =>
    office ? rounded('main', -w / 2, w / 2, y0, y1, z0, z1, radius) : box('main', -w / 2, w / 2, y0, y1, z0, z1);

  const parts: Part[] = [
    slab(-d / 2, d / 2, seatBottom, seatTop, 0.4 * seatThick),
    slab(-d / 2, -d / 2 + backDepth, seatTop, h, 0.4 * backDepth),
  ];

  if (arms) {
    const armTop = seatTop + 0.6 * (h - seatTop);
    const railWidth = Math.min(clamp(0.05 * w, 0.75, 1.5), 0.15 * w);
    const railThick = Math.min(1, 0.3 * (armTop - seatTop));
    const front = d / 2 - Math.min(1, 0.05 * d);
    const postDepth = Math.min(railWidth, 0.1 * d);
    for (const [x0, x1] of [[-w / 2, -w / 2 + railWidth], [w / 2 - railWidth, w / 2]] as const) {
      parts.push(box('main', x0, x1, -d / 2 + backDepth, front, armTop - railThick, armTop));
      parts.push(box('main', x0, x1, front - postDepth, front, seatTop, armTop - railThick));
    }
  }

  parts.push(...legsOf(size, legs, seatBottom, clamp(0.03 * Math.min(w, d), 0.25, 1)));
  return parts;
}

/** Reads the sofa options from a complete sofa style. */
function sofaSpec(style: StyleValues): SofaSpec {
  const seats = pick(style.seats, ['auto', '1', '2', '3', '4', '5'] as const, 'auto');
  return {
    seats: seats === 'auto' ? 'auto' : Number(seats),
    arms: pick(style.arms, ['track', 'rounded', 'slim', 'none'] as const, 'track'),
    back: pick(style.back, ['low', 'standard', 'high'] as const, 'standard'),
    cushions: pick(style.cushions, ['loose', 'tight'] as const, 'loose'),
    legs: pick(style.legs, ['block', 'tapered', 'metal', 'none'] as const, 'block'),
    chaise: pick(style.chaise, ['none', 'left', 'right'] as const, 'none'),
  };
}

/** Sofa: frame, arms, seat and back cushions, legs, and an optional chaise. */
export const sofaParts: PartsBuilder = (size, style) => sofaBody(size, sofaSpec(style));

/** Chair: an armchair (a one-seat sofa), a dining chair or an office chair on a pedestal. */
export const chairParts: PartsBuilder = (size, style) => {
  const type = pick(style.type, ['armchair', 'dining', 'office'] as const, 'armchair');
  const arms = pick(style.arms, ['yes', 'no'] as const, 'yes') === 'yes';
  const legs = pick(style.legs, ['block', 'tapered', 'metal', 'pedestal'] as const, 'block');
  if (type === 'armchair') {
    return sofaBody(size, { seats: 1, arms: arms ? 'track' : 'none', back: 'standard', cushions: 'loose', legs, chaise: 'none' });
  }
  return uprightChair(size, type === 'office', arms, type === 'office' ? 'pedestal' : legs);
};
