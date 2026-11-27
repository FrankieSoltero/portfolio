import type { StyleValues } from '../../types';

/**
 * The parts kit: a piece of furniture is a list of simple solids (boxes, rounded boxes and
 * cylinders) in its local frame, which the 3D view, the plan and the blueprint all draw from.
 * Local frame: origin at the footprint centre on the floor, x across the width, y across the
 * depth with the back edge at y = -d/2, z up. All lengths are inches.
 */

export type PartShape = 'box' | 'rounded' | 'cylinder';
/** Which colour a part takes: main, soft (main lightened), accent, linen (bedding white), or a book colour by index. */
export type PartSlot = 'main' | 'soft' | 'accent' | 'linen' | 'book0' | 'book1' | 'book2' | 'book3' | 'book4';
export interface Part {
  shape: PartShape;
  /** Centre of the part in x and y, and its bottom in z (local frame, inches). */
  cx: number; cy: number; z0: number;
  /** Full extents in x, y and z. A cylinder stands on the z axis; sx and sy are its diameters. */
  sx: number; sy: number; sz: number;
  slot: PartSlot;
  /** 'rounded' only: edge radius, at most half the smallest extent. */
  radius?: number;
  /** 'cylinder' only: bottom diameter ÷ top diameter in (0, 1]; absent means 1. */
  taper?: number;
  /** True for small decoration (books, handles) that plan views and the blueprint leave out. */
  detail?: true;
}
export interface PieceSize { w: number; d: number; h: number }
export type PartsBuilder = (size: PieceSize, style: StyleValues, seed: number) => Part[];

/** `value` limited to [min, max]; when min > max the result is max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A box spanning [x0, x1] × [y0, y1] × [z0, z1]. */
export function box(slot: PartSlot, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Part {
  return { shape: 'box', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z0, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0, slot };
}

/** A rounded box spanning [x0, x1] × [y0, y1] × [z0, z1]; `radius` is cut to [0, half the smallest extent]. */
export function rounded(
  slot: PartSlot, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, radius: number,
): Part {
  const part = box(slot, x0, x1, y0, y1, z0, z1);
  return { ...part, shape: 'rounded', radius: clamp(radius, 0, Math.min(part.sx, part.sy, part.sz) / 2) };
}

/** An upright cylinder centred on (cx, cy) from z0 to z1; `taper` (bottom ÷ top diameter) is kept only below 1. */
export function cylinder(
  slot: PartSlot, cx: number, cy: number, z0: number, z1: number, diameter: number, taper?: number,
): Part {
  const part: Part = { shape: 'cylinder', cx, cy, z0, sx: diameter, sy: diameter, sz: z1 - z0, slot };
  return taper !== undefined && taper > 0 && taper < 1 ? { ...part, taper } : part;
}

/**
 * Four legs inset from the footprint corners, from the floor to `top`, slot accent: square boxes
 * for 'block', tapered cylinders for 'tapered', thin cylinders for 'metal'. The leg thickness and
 * the inset are cut so that the legs always fit inside the footprint.
 */
export function fourLegs(size: PieceSize, type: 'block' | 'tapered' | 'metal', top: number, inset: number): Part[] {
  const short = Math.min(size.w, size.d);
  const thick = Math.min(clamp(0.07 * short, 0.75, 2.5), 0.25 * short);
  const margin = clamp(inset, 0, 0.25 * short);
  const xs = [-1, 1].map((s) => s * (size.w / 2 - margin - thick / 2));
  const ys = [-1, 1].map((s) => s * (size.d / 2 - margin - thick / 2));
  return ys.flatMap((y) => xs.map((x) => legAt(type, x, y, top, thick)));
}

/** One leg of `type` centred on (x, y), `thick` across, from the floor to `top`. */
function legAt(type: 'block' | 'tapered' | 'metal', x: number, y: number, top: number, thick: number): Part {
  if (type === 'block') return box('accent', x - thick / 2, x + thick / 2, y - thick / 2, y + thick / 2, 0, top);
  if (type === 'tapered') return cylinder('accent', x, y, 0, top, thick, 0.55);
  return cylinder('accent', x, y, 0, top, 0.5 * thick);
}
