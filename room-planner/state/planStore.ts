import { create } from 'zustand';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import {
  completeStyle,
  defaultColours,
  defaultStyle,
  KIND_LABELS,
  KIND_ORDER,
  normaliseColour,
  TYPICAL_SIZE,
} from '../domain/furniture/recipe';
import { moveItem, placeItem, rotateItemBy, setItemAngle, shiftItem, storedAngle } from '../domain/geometry';
import {
  moveObstacle,
  OBSTACLE_PROBLEM_TEXT,
  type ObstacleProblem,
  type ObstaclesResult,
  shiftObstacle,
  validateObstacles,
} from '../domain/obstacles';
import {
  OPENING_PROBLEM_TEXT,
  type OpeningProblem,
  type OpeningsResult,
  rehomeOpenings,
  removeOpening as withoutOpening,
  validateOpenings,
} from '../domain/openings';
import { OUTLINE_PROBLEM_TEXT, type OutlineProblem, type OutlineResult } from '../domain/outline';
import { isWebUrl, PRICE_MAX, PRODUCT_TEXT_LIMITS } from '../domain/planSchema';
import { interiorPoint, round2 } from '../domain/polygon';
import { roomBounds, roomOutline } from '../domain/shape';
import type { Corner, Item, ItemColours, ItemModel, Kind, Obstacle, PlanDocument, StyleValues, Units } from '../domain/types';

/** Why a room edit (its outline, doors and windows, or obstacles) was refused. */
export type RoomProblem = OutlineProblem | OpeningProblem | ObstacleProblem;

/** The sentence shown for each RoomProblem: the outline, opening and obstacle texts merged. */
export const ROOM_PROBLEM_TEXT: Readonly<Record<RoomProblem, string>> = {
  ...OUTLINE_PROBLEM_TEXT,
  ...OPENING_PROBLEM_TEXT,
  ...OBSTACLE_PROBLEM_TEXT,
};

/** What an item edit may change. */
export interface ItemPatch {
  name?: string;
  kind?: Kind;
  w?: number;
  d?: number;
  h?: number;
  style?: Readonly<Record<string, string>>;
  colours?: Partial<ItemColours>;
}

/**
 * A piece to add: its kind, and optionally what a looked-up product says about it. Every field
 * other than `kind` is untrusted (it may come from a shop page) and is checked by addFurnitureFrom.
 */
export interface NewItemSpec {
  kind: Kind;
  name?: string;
  host?: string;
  sourceUrl?: string | null;
  price?: number | null;
  w?: number;
  d?: number;
  h?: number;
  style?: Readonly<Record<string, string>>;
  colours?: Partial<ItemColours>;
}

/**
 * The plan document plus the only operations allowed to change it. All lengths are inches; an
 * item's `x`, `y` are its footprint centre. Operations taking a number ignore one that is not
 * finite, so no NaN or Infinity is ever stored.
 */
export interface PlanState extends PlanDocument {
  setUnits(units: Units): void;
  /** Sets the ceiling height. Items are deliberately not re-checked here; conflicts report them. */
  setRoomHeight(inches: number): void;
  /**
   * Stores `result.outline` with the doors and windows carried onto their walls (rehomeOpenings,
   * keeping them in place in the room when `result.keepOpeningsInPlace` is true), both in one
   * update, and returns null. A refused `result`, or an outline the openings cannot
   * follow, changes nothing and returns its problem. Corners equal to the stored ones (same ids,
   * coordinates and order) are accepted without a write. Items and obstacles are not moved;
   * conflicts report any left outside.
   */
  applyOutline(result: OutlineResult): RoomProblem | null;
  /**
   * Stores the accepted doors and windows and returns null; a refused `result`, or a list that does
   * not fit the stored outline, changes nothing and returns its problem.
   * Caller's duty: a new opening id is fresh (crypto.randomUUID()); parsePlan refuses a repeated id.
   */
  applyOpenings(result: OpeningsResult): RoomProblem | null;
  /**
   * Stores the accepted obstacles and returns null; a refused `result` changes nothing and returns
   * its problem. Each centre is only clamped to ±CONFIG.coordMax (the bound parsePlan enforces), never
   * into the room: an obstacle an outline edit left outside the room stays where it is when another
   * is edited. Every number is stored to 0.01. A centre that is not finite is refused
   * (obstacle-size). Moves go through moveObstacleTo and moveObstacleBy, which stop it at the walls.
   * Caller's duty: a new obstacle id is fresh (crypto.randomUUID()); parsePlan refuses a repeated id.
   */
  applyObstacles(result: ObstaclesResult): RoomProblem | null;
  /**
   * Moves an obstacle towards (x, y), its bounding-box min corner on the furniture grid, through
   * moveObstacle: one wholly inside the room stops flush at a wall it would cross. Unknown ids are
   * ignored.
   */
  moveObstacleTo(id: string, x: number, y: number): void;
  /**
   * Moves an obstacle by (dx, dy) through shiftObstacle: one wholly inside the room moves the part of
   * the step that fits and stops flush at the wall. Unknown ids are ignored.
   */
  moveObstacleBy(id: string, dx: number, dy: number): void;
  /** Removes a door or window. Unknown ids are ignored. */
  removeOpening(id: string): void;
  /** Removes an obstacle. Unknown ids are ignored. */
  removeObstacle(id: string): void;
  /**
   * Adds a piece of `kind` at its typical size, default style and colours, named by its kind's
   * label, unrotated, centred on `interiorPoint(room.outline)` and placed there by
   * `placeItem(item, x, y, roomBounds(room), CONFIG.furnitureSnap)` (the grid rule of a move,
   * without the stop at the walls). Returns the new id, or null (changing nothing) when
   * the plan already has CONFIG.maxItems items.
   */
  addFurniture(kind: Kind): string | null;
  /**
   * Adds the piece `spec` describes in one write (so one undo step), placed like addFurniture, with
   * the planner's own model. Each value is kept only in a form a saved plan accepts: the name is
   * trimmed and cut to 200 characters (the kind's label when empty); the host is cut to 255; the
   * link is kept only when it is an http: or https: URL of at most 2048 characters, else null; the
   * price only when finite and within [0, 10,000,000], else null; each size is clamped to
   * [CONFIG.itemDimMin, CONFIG.itemDimMax], or is the kind's typical size when missing or not
   * finite; `style` is merged over the kind's default style (the default when any key or value is
   * unknown); each colour goes through normaliseColour (its default when refused). Returns the new
   * id, or null (changing nothing) when the plan already has CONFIG.maxItems items or `kind` is unknown.
   */
  addFurnitureFrom(spec: NewItemSpec): string | null;
  /**
   * Applies a valid patch to the item; returns false and changes nothing when the item is missing or
   * any given field is invalid. A name is trimmed and must then have 1 to 200 characters; a `w`, `d`
   * or `h` that differs from the stored one must be finite and within [CONFIG.itemDimMin,
   * CONFIG.itemDimMax] (a stored size outside them, from a loaded plan, is kept); `kind` must be in
   * KIND_ORDER; `style` is merged over the current style and must pass completeStyle for the
   * (possibly new) kind; each colour goes through normaliseColour. A kind change sets the new kind's
   * default style (with any given `style` merged over it) and keeps size, colours and name, except
   * that a name still equal to the old kind's label becomes the new kind's label. The centre and
   * angle never change. A patch that changes nothing returns true without a write.
   */
  updateItem(id: string, patch: ItemPatch): boolean;
  /**
   * Moves an item towards (x, y), its footprint's bounding-box min corner on the furniture grid,
   * through moveItem: a piece wholly inside the room stops flush at a wall it would cross. Unknown
   * ids are ignored.
   */
  moveItemTo(id: string, x: number, y: number): void;
  /**
   * Moves an item by (dx, dy), with no grid snapping, through shiftItem: a piece wholly inside the
   * room moves the part of the step that fits and stops flush at the wall. Unknown ids are ignored.
   */
  moveItemBy(id: string, dx: number, dy: number): void;
  /** Turns an item `deg` degrees clockwise about its centre. Unknown ids are ignored. */
  rotateItemBy(id: string, deg: number): void;
  /** Turns an item to `deg` degrees clockwise about its centre. Unknown ids are ignored. */
  setItemAngle(id: string, deg: number): void;
  /** Removes an item. Unknown ids are ignored. */
  removeItem(id: string): void;
  /** Replaces the document with `doc`, or with the starting document (the room with no furniture). */
  reset(doc?: PlanDocument): void;
}

/**
 * The state change that replaces the item with `id` by `update(item)`. Returns the existing state
 * (no write, no notification) when the id is unknown or the item lands where it already is.
 */
function changeItem(s: PlanState, id: string, update: (item: Item) => Item): PlanState | Pick<PlanState, 'items'> {
  const item = s.items.find((i) => i.id === id);
  if (!item) return s;
  const next = update(item);
  if (next.x === item.x && next.y === item.y && next.angle === item.angle) return s;
  return { items: s.items.map((i) => (i.id === id ? next : i)) };
}

/**
 * The state change that replaces the obstacle with `id` by `update(obstacle)`. Returns the existing
 * state when the id is unknown or the obstacle lands where it already is.
 */
function changeObstacle(
  s: PlanState,
  id: string,
  update: (o: Obstacle) => Obstacle,
): PlanState | Pick<PlanState, 'obstacles'> {
  const obstacle = s.obstacles.find((o) => o.id === id);
  if (!obstacle) return s;
  const next = update(obstacle);
  if (next.x === obstacle.x && next.y === obstacle.y) return s;
  return { obstacles: s.obstacles.map((o) => (o.id === id ? next : o)) };
}

/** True when both lists hold entries with the same keys and values, in the same order. */
function sameEntries<T extends object>(a: readonly T[], b: readonly T[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => {
      const q = b[i] as Record<string, unknown>;
      const keys = Object.keys(p);
      return keys.length === Object.keys(q).length && keys.every((k) => (p as Record<string, unknown>)[k] === q[k]);
    })
  );
}

/**
 * A stored centre coordinate: clamped to ±CONFIG.coordMax (the bound parsePlan enforces) and rounded
 * to 0.01. A value that is not finite is returned as it is, so validateObstacles refuses it.
 */
function storedCoord(v: number): number {
  return Number.isFinite(v) ? round2(Math.min(Math.max(v, -CONFIG.coordMax), CONFIG.coordMax)) : v;
}

/**
 * The obstacle as stored: its centre through storedCoord (never moved into the room), every other
 * number to 0.01, the rotation through storedAngle.
 */
function storedObstacle(o: Obstacle): Obstacle {
  return {
    ...o,
    x: storedCoord(o.x),
    y: storedCoord(o.y),
    rotation: storedAngle(o.rotation),
    width: round2(o.width),
    depth: round2(o.depth),
    height: round2(o.height),
    elevation: round2(o.elevation),
  };
}

/** True when both outlines have the same corners (ids and coordinates) in the same order. */
function sameOutline(a: readonly Corner[], b: readonly Corner[]): boolean {
  return a.length === b.length && a.every((c, i) => c.id === b[i].id && c.x === b[i].x && c.y === b[i].y);
}

/** The model of every piece added by type: built from its recipe by the planner. */
const PLANNER_MODEL: ItemModel = { tier: 'parametric', label: 'Built by the planner', assetUrl: null };

/** True when `v` is a length a piece may have: finite and within [CONFIG.itemDimMin, CONFIG.itemDimMax]. */
function isItemDim(v: number): boolean {
  return Number.isFinite(v) && v >= CONFIG.itemDimMin && v <= CONFIG.itemDimMax;
}

/**
 * `v` when it is a link a saved plan accepts (parsePlan's rule, `isWebUrl`): at most
 * PRODUCT_TEXT_LIMITS.urlMax characters, an absolute http: or https: URL, with nothing the URL
 * parser would strip at either end. Anything else is null.
 */
function storedLink(v: unknown): string | null {
  return typeof v === 'string' && v.length <= PRODUCT_TEXT_LIMITS.urlMax && isWebUrl(v) ? v : null;
}

/** `v` when it is a finite price within [0, PRICE_MAX] (a saved plan's price limit); anything else is null. */
function storedPrice(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= PRICE_MAX ? v : null;
}

/** `v` clamped to [CONFIG.itemDimMin, CONFIG.itemDimMax], or `typical` when `v` is not a finite number. */
function storedSize(v: unknown, typical: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, CONFIG.itemDimMin), CONFIG.itemDimMax) : typical;
}

/** `given` merged over the kind's default style, or the default style when any key or value is unknown. */
function storedStyle(kind: Kind, given: unknown): StyleValues {
  if (typeof given !== 'object' || given === null) return defaultStyle(kind);
  return completeStyle(kind, { ...defaultStyle(kind), ...(given as Readonly<Record<string, string>>) }) ?? defaultStyle(kind);
}

/** The kind's default colours with each given `#rrggbb` colour (lower-cased) in place of its default. */
function storedColours(kind: Kind, given: unknown): ItemColours {
  const colours = defaultColours(kind);
  if (typeof given !== 'object' || given === null) return colours;
  for (const key of ['main', 'accent'] as const) {
    const value: unknown = (given as Partial<ItemColours>)[key];
    const colour = typeof value === 'string' ? normaliseColour(value) : null;
    if (colour !== null) colours[key] = colour;
  }
  return colours;
}

/**
 * The unplaced piece `spec` describes, at (0, 0), unrotated, every value checked by the rules of
 * addFurnitureFrom. Only the fields named here are read, so any other key the caller passes (an id,
 * a position, a model or a photo address) is never stored.
 */
function itemFromSpec(spec: NewItemSpec, id: string): Item {
  const { kind } = spec;
  const typical = TYPICAL_SIZE[kind];
  const name = typeof spec.name === 'string' ? spec.name.trim().slice(0, PRODUCT_TEXT_LIMITS.nameMax) : '';
  return {
    id,
    kind,
    name: name === '' ? KIND_LABELS[kind] : name,
    host: typeof spec.host === 'string' ? spec.host.slice(0, PRODUCT_TEXT_LIMITS.hostMax) : '',
    sourceUrl: storedLink(spec.sourceUrl),
    price: storedPrice(spec.price),
    w: storedSize(spec.w, typical.w),
    d: storedSize(spec.d, typical.d),
    h: storedSize(spec.h, typical.h),
    x: 0,
    y: 0,
    angle: 0,
    model: { ...PLANNER_MODEL },
    style: storedStyle(kind, spec.style),
    colours: storedColours(kind, spec.colours),
  };
}

/** `item` with `patch` applied by the rules of updateItem, or null when any given field is invalid. */
function patchedItem(item: Item, patch: ItemPatch): Item | null {
  const kind = patch.kind ?? item.kind;
  if (!KIND_ORDER.includes(kind)) return null;
  const kindChanged = kind !== item.kind;

  let name = item.name;
  if (patch.name !== undefined) {
    name = patch.name.trim();
    if (name.length < 1 || name.length > PRODUCT_TEXT_LIMITS.nameMax) return null;
  } else if (kindChanged && item.name === KIND_LABELS[item.kind]) {
    name = KIND_LABELS[kind];
  }

  // Only the sizes the patch changes are checked: a loaded plan may hold a size outside the edit
  // limits (parsePlan accepts up to 720 in), and that must not block edits to other fields.
  const { w = item.w, d = item.d, h = item.h } = patch;
  const sizesOk = ([[w, item.w], [d, item.d], [h, item.h]] as const).every(([next, stored]) => next === stored || isItemDim(next));
  if (!sizesOk) return null;

  const baseStyle = kindChanged ? defaultStyle(kind) : item.style;
  const style = patch.style === undefined ? baseStyle : completeStyle(kind, { ...baseStyle, ...patch.style });
  if (style === null) return null;

  const colours = { ...item.colours };
  for (const key of ['main', 'accent'] as const) {
    const given = patch.colours?.[key];
    if (given === undefined) continue;
    const colour = normaliseColour(given);
    if (colour === null) return null;
    colours[key] = colour;
  }

  return { ...item, kind, name, w, d, h, style, colours };
}

function documentFields(doc: PlanDocument): PlanDocument {
  return {
    schemaVersion: doc.schemaVersion,
    units: doc.units,
    room: doc.room,
    items: doc.items,
    openings: doc.openings,
    obstacles: doc.obstacles,
  };
}

// Every geometry call passes CONFIG.furnitureSnap, so the snap step is never taken from a caller.
// Returning the existing state from `set` skips the write and the subscriber notification.
export const usePlanStore = create<PlanState>()((set, get) => ({
  ...createInitialDocument(),

  setUnits: (units) => set({ units }),

  setRoomHeight: (inches) =>
    set((s) => (!Number.isFinite(inches) || s.room.height === inches ? s : { room: { ...s.room, height: inches } })),

  applyOutline: (result) => {
    if (!result.ok) return result.problem;
    const { room, openings } = get();
    if (sameOutline(room.outline, result.outline)) return null;
    const carried = rehomeOpenings(room.outline, result.outline, openings, result.keepOpeningsInPlace === true);
    if (!carried.ok) return carried.problem;
    // One write, so subscribers never see the new walls with the old openings. A value-equal list
    // keeps its reference, so reference comparisons (autosave, memoised views) see no change.
    set({
      room: { ...room, outline: result.outline },
      openings: sameEntries(openings, carried.openings) ? openings : carried.openings,
    });
    return null;
  },

  applyOpenings: (result) => {
    if (!result.ok) return result.problem;
    const { room, openings } = get();
    // The list may have been built on another outline; only one that fits the stored walls is kept.
    const problem = validateOpenings(room.outline, result.openings);
    if (problem !== null) return problem;
    if (!sameEntries(openings, result.openings)) set({ openings: result.openings });
    return null;
  },

  applyObstacles: (result) => {
    if (!result.ok) return result.problem;
    const { obstacles } = get();
    const next = result.obstacles.map(storedObstacle);
    const problem = validateObstacles(next);
    if (problem !== null) return problem;
    if (!sameEntries(obstacles, next)) set({ obstacles: next });
    return null;
  },

  moveObstacleTo: (id, x, y) =>
    set((s) =>
      Number.isFinite(x) && Number.isFinite(y)
        ? changeObstacle(s, id, (o) => moveObstacle(o, x, y, roomOutline(s.room), CONFIG.furnitureSnap))
        : s,
    ),

  moveObstacleBy: (id, dx, dy) =>
    set((s) =>
      Number.isFinite(dx) && Number.isFinite(dy) ? changeObstacle(s, id, (o) => shiftObstacle(o, dx, dy, roomOutline(s.room))) : s,
    ),

  removeOpening: (id) =>
    set((s) => (s.openings.some((o) => o.id === id) ? { openings: withoutOpening(s.openings, id) } : s)),

  removeObstacle: (id) =>
    set((s) => (s.obstacles.some((o) => o.id === id) ? { obstacles: s.obstacles.filter((o) => o.id !== id) } : s)),

  addFurniture: (kind) => get().addFurnitureFrom({ kind }),

  addFurnitureFrom: (spec) => {
    const { room, items } = get();
    if (items.length >= CONFIG.maxItems || !KIND_ORDER.includes(spec.kind)) return null;
    const id = crypto.randomUUID();
    const centre = interiorPoint(room.outline);
    const item = placeItem(itemFromSpec(spec, id), centre.x, centre.y, roomBounds(room), CONFIG.furnitureSnap);
    // One write, so the history records the whole piece as one undo step.
    set((s) => ({ items: [...s.items, item] }));
    return id;
  },

  updateItem: (id, patch) => {
    const item = get().items.find((i) => i.id === id);
    if (item === undefined) return false;
    const next = patchedItem(item, patch);
    if (next === null) return false;
    const unchanged =
      next.kind === item.kind &&
      next.name === item.name &&
      next.w === item.w &&
      next.d === item.d &&
      next.h === item.h &&
      sameEntries([next.style, next.colours], [item.style, item.colours]);
    // No write for a patch that changes nothing, so the undo history records no step.
    if (!unchanged) set((s) => ({ items: s.items.map((i) => (i.id === id ? next : i)) }));
    return true;
  },

  // Pointer moves call this every frame; a move that lands on the same spot changes nothing.
  moveItemTo: (id, x, y) =>
    set((s) =>
      Number.isFinite(x) && Number.isFinite(y)
        ? changeItem(s, id, (item) => moveItem(item, x, y, roomOutline(s.room), CONFIG.furnitureSnap))
        : s,
    ),

  moveItemBy: (id, dx, dy) =>
    set((s) =>
      Number.isFinite(dx) && Number.isFinite(dy)
        ? changeItem(s, id, (item) => shiftItem(item, dx, dy, roomOutline(s.room)))
        : s,
    ),

  rotateItemBy: (id, deg) =>
    set((s) => (Number.isFinite(deg) ? changeItem(s, id, (item) => rotateItemBy(item, deg)) : s)),

  setItemAngle: (id, deg) =>
    set((s) => (Number.isFinite(deg) ? changeItem(s, id, (item) => setItemAngle(item, deg)) : s)),

  removeItem: (id) =>
    set((s) => (s.items.some((i) => i.id === id) ? { items: s.items.filter((i) => i.id !== id) } : s)),

  reset: (doc) => set(documentFields(doc ?? createInitialDocument())),
}));
