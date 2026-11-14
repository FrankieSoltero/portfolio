import { create } from 'zustand';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import { moveItem, rotateItemBy, setItemAngle, shiftItem, storedAngle } from '../domain/geometry';
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
import { interiorPoint, round2 } from '../domain/polygon';
import { roomBounds } from '../domain/shape';
import type { Corner, Item, Obstacle, PlanDocument, ProductPreview, Units } from '../domain/types';
import { capProductText } from '../services/productLookup';

/** Why a room edit (its outline, doors and windows, or obstacles) was refused. */
export type RoomProblem = OutlineProblem | OpeningProblem | ObstacleProblem;

/** The sentence shown for each RoomProblem: the outline, opening and obstacle texts merged. */
export const ROOM_PROBLEM_TEXT: Readonly<Record<RoomProblem, string>> = {
  ...OUTLINE_PROBLEM_TEXT,
  ...OPENING_PROBLEM_TEXT,
  ...OBSTACLE_PROBLEM_TEXT,
};

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
   * Stores `result.outline` with the doors and windows carried onto their walls (rehomeOpenings),
   * both in one update, and returns null. A refused `result`, or an outline the openings cannot
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
   * (obstacle-size). Moves go through moveObstacleTo and moveObstacleBy, which keep it in the room.
   * Caller's duty: a new obstacle id is fresh (crypto.randomUUID()); parsePlan refuses a repeated id.
   */
  applyObstacles(result: ObstaclesResult): RoomProblem | null;
  /**
   * Moves an obstacle's centre to (x, y), its bounding-box min corner on the furniture grid, kept
   * inside the room bounds. Unknown ids are ignored.
   */
  moveObstacleTo(id: string, x: number, y: number): void;
  /** Moves an obstacle's centre by exactly (dx, dy), kept inside the room bounds. Unknown ids are ignored. */
  moveObstacleBy(id: string, dx: number, dy: number): void;
  /** Removes a door or window. Unknown ids are ignored. */
  removeOpening(id: string): void;
  /** Removes an obstacle. Unknown ids are ignored. */
  removeObstacle(id: string): void;
  /**
   * Appends the preview as a new unrotated item centred near the room's interior point, placed by
   * the same grid rule as a move, its text capped by capProductText; returns its new id. When the
   * plan already has CONFIG.maxItems items, changes nothing and returns null.
   */
  addItem(preview: ProductPreview): string | null;
  /**
   * Moves an item's centre to (x, y), placed so its footprint's bounding-box min corner is on the
   * furniture grid, and kept inside the room bounds. Unknown ids are ignored.
   */
  moveItemTo(id: string, x: number, y: number): void;
  /**
   * Moves an item's centre by exactly (dx, dy), with no grid snapping, kept inside the room bounds.
   * Unknown ids are ignored.
   */
  moveItemBy(id: string, dx: number, dy: number): void;
  /** Turns an item `deg` degrees clockwise about its centre. Unknown ids are ignored. */
  rotateItemBy(id: string, deg: number): void;
  /** Turns an item to `deg` degrees clockwise about its centre. Unknown ids are ignored. */
  setItemAngle(id: string, deg: number): void;
  /** Removes an item. Unknown ids are ignored. */
  removeItem(id: string): void;
  /** Replaces the document with `doc`, or with the seeded initial document. */
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
    const carried = rehomeOpenings(room.outline, result.outline, openings);
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
        ? changeObstacle(s, id, (o) => moveObstacle(o, x, y, roomBounds(s.room), CONFIG.furnitureSnap))
        : s,
    ),

  moveObstacleBy: (id, dx, dy) =>
    set((s) =>
      Number.isFinite(dx) && Number.isFinite(dy) ? changeObstacle(s, id, (o) => shiftObstacle(o, dx, dy, roomBounds(s.room))) : s,
    ),

  removeOpening: (id) =>
    set((s) => (s.openings.some((o) => o.id === id) ? { openings: withoutOpening(s.openings, id) } : s)),

  removeObstacle: (id) =>
    set((s) => (s.obstacles.some((o) => o.id === id) ? { obstacles: s.obstacles.filter((o) => o.id !== id) } : s)),

  addItem: (preview) => {
    const { room, items } = get();
    if (items.length >= CONFIG.maxItems) return null;
    const id = crypto.randomUUID();
    const centre = interiorPoint(room.outline);
    const { name, host, sourceUrl } = capProductText(preview);
    const unplaced: Item = {
      id,
      kind: preview.kind,
      name,
      host,
      sourceUrl,
      price: preview.price,
      w: preview.w,
      d: preview.d,
      h: preview.h,
      x: 0,
      y: 0,
      angle: 0,
      model: { ...preview.model },
    };
    const item = moveItem(unplaced, centre.x, centre.y, roomBounds(room), CONFIG.furnitureSnap);
    set((s) => ({ items: [...s.items, item] }));
    return id;
  },

  // Pointer moves call this every frame; a move that lands on the same spot changes nothing.
  moveItemTo: (id, x, y) =>
    set((s) =>
      Number.isFinite(x) && Number.isFinite(y)
        ? changeItem(s, id, (item) => moveItem(item, x, y, roomBounds(s.room), CONFIG.furnitureSnap))
        : s,
    ),

  moveItemBy: (id, dx, dy) =>
    set((s) =>
      Number.isFinite(dx) && Number.isFinite(dy)
        ? changeItem(s, id, (item) => shiftItem(item, dx, dy, roomBounds(s.room)))
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
