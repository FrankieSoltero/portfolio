import { CONFIG } from '../config';
import { footprint } from './geometry';
import type { Conflicts, Item, Room } from './types';

/** The conflict reason for an item that is not wholly inside the room. */
export const OUTSIDE_THE_ROOM = 'Outside the room';

/**
 * Finds the placement problem, if any, for each item; ported from prototype `conflicts()`.
 * Checks run in order (outside the room, taller than the ceiling, overlap) and the first
 * failing check is the item's only reason. Rugs may sit under furniture, so they never
 * take part in overlap checks, but they are still checked against the walls and ceiling.
 * Overlap reasons name the first other non-rug item in array order. Edges that touch
 * exactly, within `CONFIG.conflictEpsilon`, do not count as overlapping.
 */
export function findConflicts(items: readonly Item[], room: Room): Conflicts {
  const e = CONFIG.conflictEpsilon;
  const out: Record<string, string> = {};
  for (const a of items) {
    const [aw, ad] = footprint(a);
    if (a.x < -e || a.y < -e || a.x + aw > room.w + e || a.y + ad > room.l + e) {
      out[a.id] = OUTSIDE_THE_ROOM;
      continue;
    }
    if (a.h > room.h + e) {
      out[a.id] = 'Taller than the ceiling';
      continue;
    }
    if (a.kind === 'rug') continue;
    const hit = items.find((b) => {
      if (b.id === a.id || b.kind === 'rug') return false;
      const [bw, bd] = footprint(b);
      return a.x < b.x + bw - e && b.x < a.x + aw - e && a.y < b.y + bd - e && b.y < a.y + ad - e;
    });
    if (hit) out[a.id] = `Overlaps ${hit.name}`;
  }
  return out;
}
