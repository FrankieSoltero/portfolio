import type { StyleValues } from '../../types';
import { box, clamp, cylinder, fourLegs, type Part, type PartSlot, type PartsBuilder, type PieceSize } from './types';

/**
 * Storage: shelf, dresser, nightstand and TV stand. The plan's formulas are used as given; each is
 * also cut to a share of the piece so that every part stays inside it with a positive size at any
 * size (the extra caps only bite on pieces far smaller than real furniture). Drawer fronts and
 * doors stand proud of the body so that no two colours share a face.
 */

/** Gap between neighbouring drawer fronts. */
const FRONT_GAP = 0.3;
/** How far drawer fronts and doors stand out of the body. */
const FRONT_PROUD = 0.4;
/** How far a knob or bar handle stands out of its front. */
const HANDLE_PROUD = 0.5;
/** Smallest drawer front: height and width. */
const MIN_FRONT_HEIGHT = 3;
const MIN_FRONT_WIDTH = 5;
/** Smallest shelf opening height, and smallest TV stand bay width. */
const MIN_OPENING = 5;
const MIN_BAY = 8;
/** Book generator: the Park–Miller recurrence the old bookshelf used, and the book budget. */
const LCG_MODULUS = 2147483647;
const LCG_MULTIPLIER = 16807;
const MAX_BOOKS = 150;
const BOOK_SLOTS: readonly PartSlot[] = ['book0', 'book1', 'book2', 'book3', 'book4'];

type Base = 'legs' | 'plinth';
type Handle = 'knob' | 'bar' | 'none';

/** An upright rectangle on the front plane: [x0, x1] × [z0, z1]. */
interface Rect { x0: number; x1: number; z0: number; z1: number }

/** `value` when it is one of `allowed`, else `fallback`. */
function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/** Panel thickness clamp(0.03 min(w, h), 0.5, 1), cut to 15% of min(w, h). */
function panelThickness({ w, h }: PieceSize): number {
  const short = Math.min(w, h);
  return Math.min(clamp(0.03 * short, 0.5, 1), 0.15 * short);
}

/** Back panel thickness min(0.4, d / 4). */
function backThickness(d: number): number {
  return Math.min(0.4, d / 4);
}

/** How far fronts stand out of the body: 0.4, cut to 10% of the depth. */
function frontProud(d: number): number {
  return Math.min(FRONT_PROUD, 0.1 * d);
}

/** How far handles stand out of their front: 0.5, cut to 10% of the depth. */
function handleProud(d: number): number {
  return Math.min(HANDLE_PROUD, 0.1 * d);
}

/**
 * The base under a cabinet whose front is at `front`: four tapered legs clamp(0.14 h, 1.5, 6) high,
 * or a plinth clamp(0.08 h, 1, 3) high recessed 1 behind the cabinet front; both slot accent and
 * cut to 30% of h. Returns the base parts and the height the cabinet starts at.
 */
function base(size: PieceSize, type: Base, front: number): { bottom: number; parts: Part[] } {
  const { w, d, h } = size;
  if (type === 'legs') {
    const legTop = Math.min(clamp(0.14 * h, 1.5, 6), 0.3 * h);
    const depth = front + d / 2;
    const shift = (front - d / 2) / 2;
    const legs = fourLegs({ w, d: depth, h }, 'tapered', legTop, clamp(0.03 * Math.min(w, depth), 0.25, 1));
    return { bottom: legTop, parts: legs.map((leg) => ({ ...leg, cy: leg.cy + shift })) };
  }
  const plinthTop = Math.min(clamp(0.08 * h, 1, 3), 0.3 * h);
  const inset = Math.min(1, 0.25 * d);
  return { bottom: plinthTop, parts: [box('accent', -w / 2, w / 2, -d / 2, front - inset, 0, plinthTop)] };
}

/**
 * A grid of `columns` × `rows` fronts over `area` with FRONT_GAP between them, listed row by row
 * from the bottom. Rows, then columns, are reduced until every front is at least 3 high and 5 wide
 * (minimum 1 × 1).
 */
function frontGrid(area: Rect, columns: number, rows: number): Rect[] {
  const each = (span: number, count: number) => (span - (count - 1) * FRONT_GAP) / count;
  let r = rows;
  while (r > 1 && each(area.z1 - area.z0, r) < MIN_FRONT_HEIGHT) r--;
  let c = columns;
  while (c > 1 && each(area.x1 - area.x0, c) < MIN_FRONT_WIDTH) c--;
  const fh = each(area.z1 - area.z0, r);
  const fw = each(area.x1 - area.x0, c);
  const out: Rect[] = [];
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const x0 = area.x0 + j * (fw + FRONT_GAP);
      const z0 = area.z0 + i * (fh + FRONT_GAP);
      out.push({ x0, x1: x0 + fw, z0, z1: z0 + fh });
    }
  }
  return out;
}

/**
 * A front (drawer or door, slot soft) over `r`, from the body front at `front` out by its proud
 * distance, and its handle (slot accent, detail): a knob clamp(0.06 w, 0.5, 1.25) across centred on
 * the front and standing out of it by the handle proud distance (cut to 80% of the front and half
 * the depth), or a bar 40% of the front wide.
 */
function frontWithHandle(size: PieceSize, r: Rect, front: number, handle: Handle): Part[] {
  const { w, d } = size;
  const face = front + frontProud(d);
  const parts: Part[] = [box('soft', r.x0, r.x1, front, face, r.z0, r.z1)];
  const out = handleProud(d);
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  if (handle === 'knob') {
    const dia = Math.min(clamp(0.06 * w, 0.5, 1.25), 0.8 * (r.x1 - r.x0), 0.8 * (r.z1 - r.z0), 0.5 * d);
    parts.push({ ...cylinder('accent', cx, face + out - dia / 2, cz - dia / 2, cz + dia / 2, dia), detail: true });
  } else if (handle === 'bar') {
    const half = 0.2 * (r.x1 - r.x0);
    const tall = Math.min(0.5, 0.25 * (r.z1 - r.z0));
    parts.push({ ...box('accent', cx - half, cx + half, face, face + out, cz - tall / 2, cz + tall / 2), detail: true });
  }
  return parts;
}

/** Where the body's front is: in from the front edge by the front and handle proud distances when there are fronts. */
function bodyFront(d: number, fronts: boolean, handle: Handle): number {
  if (!fronts) return d / 2;
  return d / 2 - frontProud(d) - (handle === 'none' ? 0 : handleProud(d));
}

/**
 * An open cabinet from `bottom` to h with its front edges at `front`, slot main: two full-depth
 * sides, a top and a bottom between them, and a back panel between those.
 */
function openCarcass(size: PieceSize, t: number, bottom: number, front: number): Part[] {
  const { w, d, h } = size;
  return [
    box('main', -w / 2, -w / 2 + t, -d / 2, front, bottom, h),
    box('main', w / 2 - t, w / 2, -d / 2, front, bottom, h),
    box('main', -w / 2 + t, w / 2 - t, -d / 2, front, h - t, h),
    box('main', -w / 2 + t, w / 2 - t, -d / 2, front, bottom, bottom + t),
    box('main', -w / 2 + t, w / 2 - t, -d / 2, -d / 2 + backThickness(d), bottom + t, h - t),
  ];
}

/**
 * A Park–Miller generator from `seed` (seed = seed × 16807 mod 2147483647), giving numbers in
 * (0, 1). A seed that is not a positive whole number below the modulus is folded into one.
 */
function generator(seed: number): () => number {
  let s = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % LCG_MODULUS : 0;
  if (s === 0) s = 1;
  return () => {
    s = (s * LCG_MULTIPLIER) % LCG_MODULUS;
    return s / LCG_MODULUS;
  };
}

/**
 * One row of books (detail, slots book0–book4) standing on `z0` in an opening `height` high,
 * between x0 and x1 and from the back y0 to the front edge y1. The row spans a random 55–95% of the
 * width; it has at most `budget` books, each at least max(1, width ÷ budget) wide before the row is
 * scaled to its span, so a wide shelf gets wider books rather than more of them.
 */
function bookRow(
  rnd: () => number, x0: number, x1: number, y0: number, y1: number, z0: number, height: number, budget: number,
): Part[] {
  const width = x1 - x0;
  const unit = Math.max(1, width / budget);
  const gap = 0.08 * unit;
  const target = (0.55 + 0.4 * rnd()) * width;
  const depth = y1 - y0;
  const inset = Math.min(1, 0.2 * depth);
  const recess = Math.min(2, 0.4 * depth);
  const specs: { wide: number; tall: number; slot: PartSlot; short: number }[] = [];
  let span = -gap;
  while (span < target && specs.length < budget) {
    const wide = unit * (1 + 1.6 * rnd());
    const tall = 0.6 + 0.35 * rnd();
    const slot = BOOK_SLOTS[Math.floor(rnd() * BOOK_SLOTS.length)];
    specs.push({ wide, tall, slot, short: rnd() });
    span += wide + gap;
  }
  const scale = target / span;
  let x = x0 + Math.min(0.5, 0.05 * width);
  return specs.map((b) => {
    const bw = b.wide * scale;
    const part: Part = { ...box(b.slot, x, x + bw, y0 + inset, y1 - inset - b.short * recess, z0, z0 + b.tall * height), detail: true };
    x += bw + gap * scale;
    return part;
  });
}

/**
 * Shelf: two sides, a board under every opening and one on top, and an optional back panel, slot
 * main, with an optional row of books on every board but the top.
 */
export const shelfParts: PartsBuilder = (size, style: StyleValues, seed) => {
  const { w, d, h } = size;
  const choice = pick(style.shelves, ['auto', '2', '3', '4', '5', '6', '7', '8'] as const, 'auto');
  const back = pick(style.back, ['yes', 'no'] as const, 'yes') === 'yes' ? backThickness(d) : 0;
  const withBooks = pick(style.books, ['yes', 'no'] as const, 'yes') === 'yes';

  const t = panelThickness(size);
  const openings =
    choice === 'auto'
      ? clamp(Math.round(h / 14), 2, 8)
      : Math.max(1, Math.min(Number(choice), Math.floor((h - t) / (MIN_OPENING + t))));
  const opening = (h - (openings + 1) * t) / openings;
  const yBack = -d / 2 + back;

  const parts: Part[] = [box('main', -w / 2, -w / 2 + t, -d / 2, d / 2, 0, h), box('main', w / 2 - t, w / 2, -d / 2, d / 2, 0, h)];
  if (back > 0) parts.push(box('main', -w / 2 + t, w / 2 - t, -d / 2, yBack, 0, h));
  for (let i = 0; i <= openings; i++) {
    const z = i * (opening + t);
    parts.push(box('main', -w / 2 + t, w / 2 - t, yBack, d / 2, z, z + t));
  }
  if (withBooks) {
    const rnd = generator(seed);
    const budget = Math.floor(MAX_BOOKS / openings);
    for (let i = 0; i < openings; i++) {
      parts.push(...bookRow(rnd, -w / 2 + t, w / 2 - t, yBack, d / 2, i * (opening + t) + t, opening, budget));
    }
  }
  return parts;
};

/** Dresser: a body on its base with a grid of drawer fronts, each with its handle. */
export const dresserParts: PartsBuilder = (size, style: StyleValues) => {
  const { w, d, h } = size;
  const columns = Number(pick(style.columns, ['1', '2', '3'] as const, '2'));
  const rows = Number(pick(style.rows, ['2', '3', '4', '5', '6'] as const, '3'));
  const baseType = pick(style.base, ['legs', 'plinth'] as const, 'legs');
  const handle = pick(style.handles, ['knob', 'bar', 'none'] as const, 'knob');

  const t = panelThickness(size);
  const front = bodyFront(d, true, handle);
  const { bottom, parts: under } = base(size, baseType, front);
  const area: Rect = { x0: -w / 2 + t, x1: w / 2 - t, z0: bottom + t, z1: h - t };
  return [
    box('main', -w / 2, w / 2, -d / 2, front, bottom, h),
    ...under,
    ...frontGrid(area, columns, rows).flatMap((r) => frontWithHandle(size, r, front, handle)),
  ];
};

/**
 * Nightstand: 0 drawers is an open box with a shelf at half the cabinet height; 1 drawer covers the
 * top half, above a board at half height with an open bay below; 2 drawers are two equal fronts on
 * a closed body. Every front has a knob.
 */
export const nightstandParts: PartsBuilder = (size, style: StyleValues) => {
  const { w, d, h } = size;
  const drawers = pick(style.drawers, ['0', '1', '2'] as const, '1');
  const baseType = pick(style.base, ['legs', 'plinth'] as const, 'legs');

  const t = panelThickness(size);
  const front = bodyFront(d, drawers !== '0', 'knob');
  const { bottom, parts: under } = base(size, baseType, front);
  const area: Rect = { x0: -w / 2 + t, x1: w / 2 - t, z0: bottom + t, z1: h - t };
  if (drawers === '2') {
    return [
      box('main', -w / 2, w / 2, -d / 2, front, bottom, h),
      ...under,
      ...frontGrid(area, 1, 2).flatMap((r) => frontWithHandle(size, r, front, 'knob')),
    ];
  }
  const half = bottom + (h - bottom) / 2;
  const parts: Part[] = [
    ...openCarcass(size, t, bottom, front),
    ...under,
    box('main', -w / 2 + t, w / 2 - t, -d / 2 + backThickness(d), front, half - t / 2, half + t / 2),
  ];
  if (drawers === '1') parts.push(...frontWithHandle(size, { ...area, z0: half + t / 2 }, front, 'knob'));
  return parts;
};

/**
 * TV stand: an open cabinet split into equal bays by dividers (reduced until every bay is at least
 * 8 wide). Open bays get a shelf at half the cabinet height when h ≥ 14; otherwise each bay has a
 * door with a knob or a drawer front with a bar.
 */
export const tvstandParts: PartsBuilder = (size, style: StyleValues) => {
  const { w, d, h } = size;
  const chosen = Number(pick(style.bays, ['2', '3', '4'] as const, '3'));
  const fronts = pick(style.fronts, ['open', 'doors', 'drawers'] as const, 'doors');
  const baseType = pick(style.base, ['legs', 'plinth'] as const, 'legs');

  const t = panelThickness(size);
  const bayWidth = (count: number) => (w - 2 * t - (count - 1) * t) / count;
  let bays = chosen;
  while (bays > 1 && bayWidth(bays) < MIN_BAY) bays--;
  const bw = bayWidth(bays);

  const handle: Handle = fronts === 'doors' ? 'knob' : 'bar';
  const front = bodyFront(d, fronts !== 'open', handle);
  const { bottom, parts: under } = base(size, baseType, front);
  const yBack = -d / 2 + backThickness(d);
  const mid = bottom + (h - bottom) / 2;

  const parts: Part[] = [...openCarcass(size, t, bottom, front), ...under];
  for (let k = 1; k < bays; k++) {
    const x0 = -w / 2 + t + k * bw + (k - 1) * t;
    parts.push(box('main', x0, x0 + t, yBack, front, bottom + t, h - t));
  }
  for (let k = 0; k < bays; k++) {
    const x0 = -w / 2 + t + k * (bw + t);
    if (fronts === 'open') {
      if (h >= 14) parts.push(box('main', x0, x0 + bw, yBack, front, mid - t / 2, mid + t / 2));
    } else {
      parts.push(...frontWithHandle(size, { x0, x1: x0 + bw, z0: bottom + t, z1: h - t }, front, handle));
    }
  }
  return parts;
};
