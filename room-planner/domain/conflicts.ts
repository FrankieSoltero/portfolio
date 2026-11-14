import { CONFIG } from '../config';
import { obstaclePolygon } from './obstacles';
import { openingSpan } from './openings';
import { convexInsidePolygon, convexOverlap } from './polygon';
import { footprintCorners, itemFootprint, roomHeight, roomOutline, type Footprint } from './shape';
import type {
  Conflicts, Corner, Door, Item, Kind, Obstacle, Opening, PlanIssues, Point, Room, WindowOpening,
} from './types';

/** The conflict reason for an item that is not wholly inside the room. */
export const OUTSIDE_THE_ROOM = 'Outside the room';

/** The conflict reason for an item, obstacle or opening taller than the room's ceiling. */
const TALLER_THAN_THE_CEILING = 'Taller than the ceiling';

/** The conflict reason for furniture or an obstacle inside a door's reserved area. */
export const BLOCKS_A_DOOR = 'Blocks a door';

/** The warning for furniture in front of a window and taller than its sill. */
export const COVERS_A_WINDOW = 'Covers a window';

/** The overlap reason for an obstacle with an empty label. */
const OVERLAPS_AN_OBSTACLE = 'Overlaps an obstacle';

/** What the conflict check needs to know about one item: its identity, kind, height and footprint. */
export interface ConflictEntry { id: string; name: string; kind: Kind; h: number; fp: Footprint }

/** An obstacle as the furniture check sees it: its label, where it starts above the floor and its outline. */
interface ObstacleShape { label: string; elevation: number; polygon: readonly Point[] }

/** A door's reserved area on the plan, with the door's height. */
interface DoorArea { height: number; polygon: readonly Point[] }

/** A window's zone on the plan, with the window's sill height. */
interface WindowArea { sill: number; polygon: readonly Point[] }

/** The point `k` inches from `p` along the unit vector `v`. */
function along(p: Point, v: Point, k: number): Point {
  return { x: p.x + v.x * k, y: p.y + v.y * k };
}

/**
 * The floor area a door needs clear, as a convex polygon with positive signed area, or null when
 * its wall is not in the outline. A door swinging in reserves its swing: the hinge point and
 * CONFIG.arcSegments + 1 points on the quarter circle of radius `width` from the closed position
 * (along the wall) to fully open (along the inward normal). A door swinging out reserves a
 * CONFIG.doorClearDepth deep strip along the inside of its wall.
 */
export function doorReservedArea(door: Door, outline: readonly Corner[]): Point[] | null {
  const span = openingSpan(outline, door);
  if (span === null) return null;
  const { a, b, u, n } = span;
  if (door.swing === 'out') {
    return [a, b, along(b, n, CONFIG.doorClearDepth), along(a, n, CONFIG.doorClearDepth)];
  }
  const fromStart = door.hinge === 'start';
  const hinge = fromStart ? a : b;
  // Closed, the leaf points from the hinge towards the door's other end.
  const closed = fromStart ? u : { x: -u.x, y: -u.y };
  const steps = CONFIG.arcSegments;
  const arc = Array.from({ length: steps + 1 }, (_, i): Point => {
    const theta = (Math.PI / 2) * (i / steps);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return along(hinge, { x: c * closed.x + s * n.x, y: c * closed.y + s * n.y }, door.width);
  });
  const polygon = [hinge, ...arc];
  // Swinging from the end, the points run the other way round; reverse them to keep the area positive.
  return fromStart ? polygon : polygon.reverse();
}

/**
 * The strip in front of a window, CONFIG.windowZoneDepth deep along the inside of its wall, with
 * positive signed area; null when its wall is not in the outline.
 */
export function windowZone(win: WindowOpening, outline: readonly Corner[]): Point[] | null {
  const span = openingSpan(outline, win);
  if (span === null) return null;
  const { a, b, n } = span;
  return [a, b, along(b, n, CONFIG.windowZoneDepth), along(a, n, CONFIG.windowZoneDepth)];
}

/**
 * The furniture rules, in one place. Checks run in order (outside the outline, taller than the
 * ceiling, overlaps another non-rug entry, overlaps an obstacle it does not fit under, inside a
 * door's reserved area) and the first failing check is the entry's only reason. Rugs skip the
 * last three. Overlap reasons name the first overlapping entry, then the first overlapping
 * obstacle, in array order.
 */
function furnitureConflicts(
  entries: readonly ConflictEntry[],
  corners: readonly (readonly Point[])[],
  outline: readonly Point[],
  height: number,
  obstacles: readonly ObstacleShape[],
  doors: readonly DoorArea[],
): Record<string, string> {
  const e = CONFIG.conflictEpsilon;
  const out: Record<string, string> = {};
  entries.forEach((a, i) => {
    if (!convexInsidePolygon(corners[i], outline, e)) {
      out[a.id] = OUTSIDE_THE_ROOM;
      return;
    }
    if (a.h > height + e) {
      out[a.id] = TALLER_THAN_THE_CEILING;
      return;
    }
    if (a.kind === 'rug') return;
    const hit = entries.findIndex(
      (b, j) => b.id !== a.id && b.kind !== 'rug' && convexOverlap(corners[i], corners[j], e),
    );
    if (hit !== -1) {
      out[a.id] = `Overlaps ${entries[hit].name}`;
      return;
    }
    // Furniture stands on the floor, so it clears an obstacle raised above its top.
    const obstacle = obstacles.find((o) => a.h > o.elevation + e && convexOverlap(corners[i], o.polygon, e));
    if (obstacle !== undefined) {
      out[a.id] = obstacle.label === '' ? OVERLAPS_AN_OBSTACLE : `Overlaps ${obstacle.label}`;
      return;
    }
    if (doors.some((d) => convexOverlap(corners[i], d.polygon, e))) out[a.id] = BLOCKS_A_DOOR;
  });
  return out;
}

/**
 * Finds the placement problem, if any, for each entry against an outline and a ceiling height.
 * Checks run in order (outside the outline, taller than the ceiling, overlap) and the first
 * failing check is the entry's only reason. Rugs may sit under furniture, so they never take
 * part in overlap checks, but they are still checked against the walls and ceiling. Overlap
 * reasons name the first other overlapping non-rug entry in array order. Footprints that touch
 * the walls or each other, within `CONFIG.conflictEpsilon`, are neither outside nor overlapping.
 */
export function conflictsAmong(entries: readonly ConflictEntry[], outline: readonly Point[], height: number): Conflicts {
  const corners = entries.map((entry) => footprintCorners(entry.fp));
  return furnitureConflicts(entries, corners, outline, height, [], []);
}

/**
 * Finds every problem with the plan. `conflicts` holds, keyed by id in one map:
 * - each item's first failing furniture rule (see furnitureConflicts);
 * - each obstacle's first failing check: outside the room, its top (elevation + height) above the
 *   ceiling, or inside a door's reserved area while starting below the door's top (obstacles do
 *   not conflict with each other);
 * - each door, or window by sill + height, taller than the ceiling.
 * `warnings` holds `Covers a window` for each item (rugs included) whose footprint overlaps a
 * window's zone and which is taller than the sill, independently of its conflicts. Openings on a
 * wall not in the outline, and obstacle polygons of fewer than 3 points, are skipped. Touching is
 * not overlapping, and heights compare within `CONFIG.conflictEpsilon`.
 */
export function findPlanIssues(
  items: readonly Item[],
  room: Room,
  openings: readonly Opening[],
  obstacles: readonly Obstacle[],
): PlanIssues {
  const e = CONFIG.conflictEpsilon;
  const outline = roomOutline(room);
  const height = roomHeight(room);

  const doors: DoorArea[] = [];
  const windows: WindowArea[] = [];
  const conflicts: Record<string, string> = {};
  for (const opening of openings) {
    // An opening on an unknown wall has no place on the plan and takes part in no check.
    if (openingSpan(room.outline, opening) === null) continue;
    if (opening.kind === 'door') {
      const polygon = doorReservedArea(opening, room.outline);
      if (polygon !== null) doors.push({ height: opening.height, polygon });
    } else {
      const polygon = windowZone(opening, room.outline);
      if (polygon !== null) windows.push({ sill: opening.sill, polygon });
    }
    const top = opening.kind === 'door' ? opening.height : opening.sill + opening.height;
    if (top > height + e) conflicts[opening.id] = TALLER_THAN_THE_CEILING;
  }

  const shapes = obstacles
    .map((o) => ({ o, polygon: obstaclePolygon(o) }))
    .filter(({ polygon }) => polygon.length >= 3);
  for (const { o, polygon } of shapes) {
    if (!convexInsidePolygon(polygon, outline, e)) conflicts[o.id] = OUTSIDE_THE_ROOM;
    else if (o.elevation + o.height > height + e) conflicts[o.id] = TALLER_THAN_THE_CEILING;
    else if (doors.some((d) => o.elevation < d.height - e && convexOverlap(polygon, d.polygon, e))) {
      conflicts[o.id] = BLOCKS_A_DOOR;
    }
  }

  const entries = items.map((item): ConflictEntry => ({
    id: item.id, name: item.name, kind: item.kind, h: item.h, fp: itemFootprint(item),
  }));
  const corners = entries.map((entry) => footprintCorners(entry.fp));
  const blockers = shapes.map(({ o, polygon }): ObstacleShape => ({ label: o.label, elevation: o.elevation, polygon }));
  Object.assign(conflicts, furnitureConflicts(entries, corners, outline, height, blockers, doors));

  const warnings: Record<string, string> = {};
  entries.forEach((entry, i) => {
    if (windows.some((w) => entry.h > w.sill + e && convexOverlap(corners[i], w.polygon, e))) {
      warnings[entry.id] = COVERS_A_WINDOW;
    }
  });
  return { conflicts, warnings };
}

/**
 * Finds the placement problem, if any, for each item in the room; ported from prototype
 * `conflicts()`. The furniture conflicts of findPlanIssues for a room with no openings or obstacles.
 */
export function findConflicts(items: readonly Item[], room: Room): Conflicts {
  return findPlanIssues(items, room, [], []).conflicts;
}
