import type { Item } from '../types';
import { buildParts } from './parts';
import type { Part } from './parts/types';

/**
 * Furniture seen from above: the plan, the blueprint and the downloadable picture draw a piece
 * from its parts (the same parts the 3D view builds), less the small decoration.
 */

/** A part seen from above: its rectangle as fractions of the footprint ([u0,u1,v0,v1], v = 0 at the back), whether it is round, and its height range in inches. */
export interface PlanPart { rect: readonly [number, number, number, number]; round: boolean; z0: number; z1: number }

/** At most this many plan parts per piece; past it the smaller ones are left out. */
const PLAN_PART_LIMIT = 40;

/** How close to an edge of the footprint, as a fraction, a part's side must be to reach it. */
const EDGE_TOLERANCE = 1e-9;

/** `value` limited to [0, 1]. */
function unit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** Top-view area of a part, in square inches: a rectangle, or the ellipse inscribed in it for a cylinder. */
function topArea(part: Part): number {
  return part.shape === 'cylinder' ? (Math.PI / 4) * part.sx * part.sy : part.sx * part.sy;
}

/** The part from above, as fractions of a w × d footprint. */
function toPlanPart(part: Part, w: number, d: number): PlanPart {
  return {
    rect: [
      unit((part.cx - part.sx / 2) / w + 0.5),
      unit((part.cx + part.sx / 2) / w + 0.5),
      unit((part.cy - part.sy / 2) / d + 0.5),
      unit((part.cy + part.sy / 2) / d + 0.5),
    ],
    round: part.shape === 'cylinder',
    z0: part.z0,
    z1: part.z0 + part.sz,
  };
}

/** The piece's non-detail parts from above, lowest top first. A piece whose only part fills the footprint returns that one part. */
export function planParts(item: Pick<Item, 'id' | 'kind' | 'w' | 'd' | 'h' | 'style'>): PlanPart[] {
  // Only detail parts depend on the seed, and they are left out, so the default seed is used.
  const solid = buildParts(item.kind, { w: item.w, d: item.d, h: item.h }, item.style).filter((p) => !p.detail);
  // Lowest top first; Array.prototype.sort is stable, so equal tops keep the builder's order.
  const sorted = solid
    .map((part) => ({ part, plan: toPlanPart(part, item.w, item.d) }))
    .sort((a, b) => a.plan.z1 - b.plan.z1);
  if (sorted.length <= PLAN_PART_LIMIT) return sorted.map((s) => s.plan);
  const kept = new Set(
    sorted
      .map((s, i) => ({ i, area: topArea(s.part) }))
      .sort((a, b) => b.area - a.area)
      .slice(0, PLAN_PART_LIMIT)
      .map((s) => s.i),
  );
  return sorted.filter((_s, i) => kept.has(i)).map((s) => s.plan);
}

/** Whether the plan part covers the whole footprint: its rectangle is [0, 1, 0, 1], to within EDGE_TOLERANCE. */
export function fillsFootprint(part: PlanPart): boolean {
  const [u0, u1, v0, v1] = part.rect;
  return u0 <= EDGE_TOLERANCE && v0 <= EDGE_TOLERANCE && u1 >= 1 - EDGE_TOLERANCE && v1 >= 1 - EDGE_TOLERANCE;
}

/** Whether the piece is round from above: any of its plan parts is round and fills the footprint (a round rug, a round table top). */
export function isRoundPiece(parts: readonly PlanPart[]): boolean {
  return parts.some((p) => p.round && fillsFootprint(p));
}
