import { CONFIG } from '../config';
import { convexInsidePolygon, convexOverlap } from './polygon';
import { footprintCorners, itemFootprint, roomHeight, roomOutline, type Footprint } from './shape';
import type { Conflicts, Item, Kind, Point, Room } from './types';

/** The conflict reason for an item that is not wholly inside the room. */
export const OUTSIDE_THE_ROOM = 'Outside the room';

/** The conflict reason for an item taller than the room's ceiling. */
const TALLER_THAN_THE_CEILING = 'Taller than the ceiling';

/** What the conflict check needs to know about one item: its identity, kind, height and footprint. */
export interface ConflictEntry { id: string; name: string; kind: Kind; h: number; fp: Footprint }

/**
 * Finds the placement problem, if any, for each entry against an outline and a ceiling height.
 * Checks run in order (outside the outline, taller than the ceiling, overlap) and the first
 * failing check is the entry's only reason. Rugs may sit under furniture, so they never take
 * part in overlap checks, but they are still checked against the walls and ceiling. Overlap
 * reasons name the first other overlapping non-rug entry in array order. Footprints that touch
 * the walls or each other, within `CONFIG.conflictEpsilon`, are neither outside nor overlapping.
 */
export function conflictsAmong(entries: readonly ConflictEntry[], outline: readonly Point[], height: number): Conflicts {
  const e = CONFIG.conflictEpsilon;
  const corners = entries.map((entry) => footprintCorners(entry.fp));
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
    if (hit !== -1) out[a.id] = `Overlaps ${entries[hit].name}`;
  });
  return out;
}

/**
 * Finds the placement problem, if any, for each item in the room; ported from prototype
 * `conflicts()`. Reads the room and items only through the shape accessors and applies the
 * rules of `conflictsAmong`.
 */
export function findConflicts(items: readonly Item[], room: Room): Conflicts {
  const entries = items.map((item): ConflictEntry => ({
    id: item.id, name: item.name, kind: item.kind, h: item.h, fp: itemFootprint(item),
  }));
  return conflictsAmong(entries, roomOutline(room), roomHeight(room));
}
