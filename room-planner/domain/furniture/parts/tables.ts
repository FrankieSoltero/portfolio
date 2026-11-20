import type { StyleValues } from '../../types';
import { pedestal } from './seating';
import { box, clamp, cylinder, fourLegs, rounded, type Part, type PartsBuilder, type PieceSize } from './types';

/**
 * Desks and tables. The plan's formulas are used as given; each is also cut to a share of the
 * piece so that every part stays inside it with a positive size at any size (the extra caps only
 * bite on pieces far smaller than real furniture).
 */

type Drawers = 'none' | 'left' | 'right' | 'both';

/** `value` when it is one of `allowed`, else `fallback`. */
function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/**
 * Two trestles, slot accent, inset clamp(0.08 w, 1, 6) from the sides: each a foot bar on the floor
 * (t = clamp(0.03 w, 0.75, 2) across, 80% of the depth long, t high) and a t × t post centred in
 * depth from the foot bar up to `under`, the underside of the top. Feet first, then posts.
 */
function trestles(size: PieceSize, under: number): Part[] {
  const { w, d } = size;
  const t = Math.min(clamp(0.03 * w, 0.75, 2), 0.15 * w);
  const inset = Math.min(clamp(0.08 * w, 1, 6), 0.2 * w);
  const footTop = Math.min(t, 0.3 * under);
  const postDepth = Math.min(t, 0.8 * d);
  const spans = [[-w / 2 + inset, -w / 2 + inset + t], [w / 2 - inset - t, w / 2 - inset]] as const;
  return [
    ...spans.map(([x0, x1]) => box('accent', x0, x1, -0.4 * d, 0.4 * d, 0, footTop)),
    ...spans.map(([x0, x1]) => box('accent', x0, x1, -postDepth / 2, postDepth / 2, footTop, under)),
  ];
}

/**
 * A drawer box hanging under the desk top on one side, from `edge` in from that side and at most
 * 90% of `room` wide, with a small accent handle (detail) standing out from its front, which sits
 * `recess` behind the top's edge.
 */
function drawer(size: PieceSize, side: -1 | 1, edge: number, room: number, under: number): Part[] {
  const { w, d, h } = size;
  const width = Math.min(clamp(0.3 * w, 8, 20), 0.9 * room);
  const height = Math.min(clamp(0.2 * h, 3, 8), 0.5 * under);
  const recess = Math.min(1, 0.05 * d);
  const inner = w / 2 - edge;
  const [x0, x1] = side === -1 ? [-inner, -inner + width] : [inner - width, inner];
  const handleWidth = Math.min(5, 0.4 * width);
  const handleHeight = Math.min(0.75, 0.25 * height);
  const cx = (x0 + x1) / 2;
  const cz = under - height / 2;
  const handle = box(
    'accent', cx - handleWidth / 2, cx + handleWidth / 2, d / 2 - recess, d / 2 - recess / 2,
    cz - handleHeight / 2, cz + handleHeight / 2,
  );
  return [box('main', x0, x1, -d / 2 + recess, d / 2 - recess, under - height, under), { ...handle, detail: true }];
}

/** How far in from its side the inside face of the support on that side is (supports are symmetric). */
function supportEdge(size: PieceSize, supports: readonly Part[]): number {
  const left = supports.filter((p) => p.cx < 0).map((p) => p.cx + p.sx / 2);
  return left.length > 0 ? Math.max(...left) + size.w / 2 : 0;
}

/** Desk: a top on legs, trestles or side panels, with drawer boxes under the top on the chosen side(s). */
export const deskParts: PartsBuilder = (size, style: StyleValues) => {
  const { w, d, h } = size;
  const supportType = pick(style.supports, ['legs', 'trestle', 'panels'] as const, 'legs');
  let drawers: Drawers = pick(style.drawers, ['none', 'left', 'right', 'both'] as const, 'right');
  if (w < 20) drawers = 'none';
  else if (w < 30 && drawers === 'both') drawers = 'right';

  const thick = Math.min(clamp(0.05 * h, 0.75, 2), 0.2 * h);
  const under = h - thick;
  let supports: Part[];
  if (supportType === 'legs') {
    supports = fourLegs(size, 'metal', under, clamp(0.03 * Math.min(w, d), 0.25, 1));
  } else if (supportType === 'trestle') {
    supports = trestles(size, under);
  } else {
    const panel = Math.min(clamp(0.025 * w, 0.75, 1.5), 0.15 * w);
    supports = [box('main', -w / 2, -w / 2 + panel, -d / 2, d / 2, 0, under), box('main', w / 2 - panel, w / 2, -d / 2, d / 2, 0, under)];
  }

  const edge = supportEdge(size, supports);
  // Room for the drawers between the supports: half of it each for two, all of it for one.
  const room = drawers === 'both' ? w / 2 - edge : w - 2 * edge;
  const parts: Part[] = [box('main', -w / 2, w / 2, -d / 2, d / 2, under, h), ...supports];
  if (drawers === 'left' || drawers === 'both') parts.push(...drawer(size, -1, edge, room, under));
  if (drawers === 'right' || drawers === 'both') parts.push(...drawer(size, 1, edge, room, under));
  return parts;
};

/** Table: a rectangle or round (elliptic) top on legs, a pedestal or trestles, with an optional lower shelf. */
export const tableParts: PartsBuilder = (size, style: StyleValues) => {
  const { w, d, h } = size;
  const round = pick(style.top, ['rectangle', 'round'] as const, 'rectangle') === 'round';
  const base = pick(style.base, ['legs', 'pedestal', 'trestle'] as const, 'legs');
  const shelf = pick(style.shelf, ['yes', 'no'] as const, 'yes') === 'yes' && h >= 12 && base !== 'pedestal';

  const thick = Math.min(clamp(0.06 * h, 0.75, 2.5), 0.2 * h);
  const under = h - thick;
  const top = round
    ? { ...cylinder('main', 0, 0, under, h, w), sy: d }
    : rounded('main', -w / 2, w / 2, -d / 2, d / 2, under, h, Math.min(0.5, thick / 2));

  let supports: Part[];
  if (base === 'legs') {
    // Under a round top the legs stand inside the middle 66% of each side, so their corners stay under the ellipse.
    supports = round
      ? fourLegs({ w: 0.66 * w, d: 0.66 * d, h }, 'tapered', under, 0)
      : fourLegs(size, 'tapered', under, clamp(0.05 * Math.min(w, d), 0.5, 2));
  } else if (base === 'pedestal') {
    supports = pedestal(size, under);
  } else {
    supports = trestles(size, under);
  }

  const parts: Part[] = [top, ...supports];
  if (shelf) {
    const z0 = 0.3 * h;
    const z1 = z0 + 0.75 * thick;
    if (base === 'legs') {
      // To the leg centres: a rectangle, or under a round top an ellipse through them.
      const lx = Math.abs(supports[0].cx);
      const ly = Math.abs(supports[0].cy);
      parts.push(round ? { ...cylinder('main', 0, 0, z0, z1, 2 * Math.SQRT2 * lx), sy: 2 * Math.SQRT2 * ly } : box('main', -lx, lx, -ly, ly, z0, z1));
    } else {
      // Between the trestle post centres.
      const px = Math.abs(supports[supports.length - 1].cx);
      parts.push(box('main', -px, px, -0.35 * d, 0.35 * d, z0, z1));
    }
  }
  return parts;
};
