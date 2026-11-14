/**
 * Where the doors and windows cut each wall, in the wall's own frame. Pure and free of three.js,
 * so both the Styled (three.js) view and the Blueprint (2D canvas) view can use it without the
 * Blueprint view pulling three.js into the main bundle.
 */
import { openingSpan } from '../domain/openings';
import { wallsOf } from '../domain/outline';
import type { Corner, Opening } from '../domain/types';

/** Narrowest hole kept after clamping into its wall, in inches. */
const MIN_HOLE_WIDTH = 0.01;

/**
 * A door or window hole in one wall, in the wall's own frame: `x` is the distance along the wall
 * from its start corner, `z` the height above the floor (inches). `glass` marks a window.
 */
export interface WallHole { x0: number; x1: number; z0: number; z1: number; glass: boolean }

/**
 * The holes the openings cut in each wall: one list per wall, in wall order, each sorted by `x0`.
 * A door runs from the floor to its height, a window from its sill to sill + height; both are
 * clamped to the ceiling and into the wall's length, and a hole left empty (`z1 ≤ z0`) or narrower
 * than 0.01 is dropped. Openings whose wall is not in the outline are ignored.
 */
export function wallHoles(outline: readonly Corner[], openings: readonly Opening[],
  height: number): WallHole[][] {
  const walls = wallsOf(outline);
  const holes: WallHole[][] = walls.map(() => []);
  for (const o of openings) {
    const span = openingSpan(outline, o);
    if (span === null) continue;
    const wall = walls[span.wallIndex];
    const list = holes[span.wallIndex];
    if (wall === undefined || list === undefined) continue;
    const bottom = o.kind === 'window' ? o.sill : 0;
    const z0 = Math.max(0, bottom);
    const z1 = Math.min(bottom + o.height, height);
    const x0 = Math.max(0, o.offset);
    const x1 = Math.min(wall.length, o.offset + o.width);
    if (z1 <= z0 || x1 - x0 < MIN_HOLE_WIDTH) continue;
    list.push({ x0, x1, z0, z1, glass: o.kind === 'window' });
  }
  for (const list of holes) list.sort((p, q) => p.x0 - q.x0);
  return holes;
}
