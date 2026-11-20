import type { StyleValues } from '../../types';
import { box, clamp, cylinder, type Part, type PartSlot, type PartsBuilder } from './types';

/** `value` when it is one of `allowed`, else `fallback`. */
function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/** A rug layer `w` × `d` centred on the origin from `bottom` to `top`: a box, or an elliptic cylinder when round. */
function layer(slot: PartSlot, round: boolean, w: number, d: number, bottom: number, top: number): Part {
  return round ? { ...cylinder(slot, 0, 0, bottom, top, w), sy: d } : box(slot, -w / 2, w / 2, -d / 2, d / 2, bottom, top);
}

/**
 * Rug: `h` is its thickness. Without a border, one main layer filling the size; with one, a main
 * layer 0.8 h thick and a soft inner layer inset clamp(0.07 min(w, d), 1, 5) (cut to a quarter of
 * min(w, d)) raised to the full h. The inner layer starts at 0.4 h, inside the outer one, so the two
 * colours never share their bottom face.
 */
export const rugParts: PartsBuilder = ({ w, d, h }, style: StyleValues) => {
  const round = pick(style.shape, ['rectangle', 'round'] as const, 'rectangle') === 'round';
  const border = pick(style.border, ['yes', 'no'] as const, 'yes') === 'yes';
  if (!border) return [layer('main', round, w, d, 0, h)];
  const short = Math.min(w, d);
  const inset = Math.min(clamp(0.07 * short, 1, 5), 0.25 * short);
  return [layer('main', round, w, d, 0, 0.8 * h), layer('soft', round, w - 2 * inset, d - 2 * inset, 0.4 * h, h)];
};

/** Box: one main box filling the size. */
export const boxParts: PartsBuilder = ({ w, d, h }) => [box('main', -w / 2, w / 2, -d / 2, d / 2, 0, h)];
