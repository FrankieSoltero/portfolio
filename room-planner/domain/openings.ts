import { CONFIG } from '../config';
import { inLimits, LIMIT_SLACK, sameDirection, wallsOf, type Wall } from './outline';
import { projectOntoSegment, round2 } from './polygon';
import type { Corner, Door, Opening, Point, WindowOpening } from './types';

/**
 * Pure operations on the doors and windows ("openings") of a room. An opening sits on the wall
 * `wallId` (the id of the wall's start corner), `offset` inches from that corner to its near end,
 * and is `width` long along the wall. Every edit returns a new list or refuses with the first
 * problem it would cause; inputs are never mutated.
 */

export type OpeningProblem =
  | 'opening-off-wall'
  | 'opening-overlap'
  | 'opening-size'
  | 'too-many-openings'
  | 'corner-in-opening'
  | 'corner-has-openings'
  | 'shape-has-openings';

export const OPENING_PROBLEM_TEXT: Readonly<Record<OpeningProblem, string>> = {
  'opening-off-wall': 'That would leave a door or window without room on its wall.',
  'opening-overlap': 'Doors and windows cannot overlap.',
  'opening-size': 'That size is not allowed.',
  'too-many-openings': `A room can have at most ${CONFIG.maxOpenings} doors and windows.`,
  'corner-in-opening': 'A corner cannot go inside a door or window.',
  'corner-has-openings': 'Remove the doors and windows on these walls first.',
  'shape-has-openings': 'Remove the doors and windows before starting from a shape.',
};

export type OpeningsResult = { ok: true; openings: Opening[] } | { ok: false; problem: OpeningProblem };

export const DOOR_DEFAULTS: Readonly<{ width: 32; height: 80; hinge: 'start'; swing: 'in' }> = {
  width: 32,
  height: 80,
  hinge: 'start',
  swing: 'in',
};

export const WINDOW_DEFAULTS: Readonly<{ width: 36; sill: 36; height: 48 }> = { width: 36, sill: 36, height: 48 };

/**
 * Where an opening is on the plan: `a` and `b` are its two ends on its wall (`a` nearer the wall's
 * start), `u` the wall's unit direction, `n` its inward unit normal and `wallIndex` the wall's index.
 */
export interface OpeningSpan { a: Point; b: Point; u: Point; n: Point; wallIndex: number }

type DoorPatch = Partial<Pick<Door, 'width' | 'height' | 'hinge' | 'swing'>>;
type WindowPatch = Partial<Pick<WindowOpening, 'width' | 'height' | 'sill'>>;

/** The fields updateOpening may change, by kind. */
const PATCHABLE: Readonly<Record<Opening['kind'], readonly string[]>> = {
  door: ['width', 'height', 'hinge', 'swing'],
  window: ['width', 'height', 'sill'],
};

function unchanged(openings: readonly Opening[]): OpeningsResult {
  return { ok: true, openings: openings.slice() };
}

function refuse(problem: OpeningProblem): OpeningsResult {
  return { ok: false, problem };
}

/** Accepts the candidate list on `outline` or refuses with its first problem. */
function settle(outline: readonly Corner[], candidate: Opening[]): OpeningsResult {
  const problem = validateOpenings(outline, candidate);
  return problem === null ? { ok: true, openings: candidate } : refuse(problem);
}

function wallById(outline: readonly Corner[], id: string): Wall | undefined {
  return wallsOf(outline).find((w) => w.id === id);
}

/** Turns −0 into 0, so a span's coordinates compare equal to the plain numbers. */
function clean(v: number): number {
  return v === 0 ? 0 : v;
}

/**
 * Tolerance for rounding a length down to 0.01: half of LIMIT_SLACK, so a computed length a hair
 * under a hundredth (a 12 in diagonal wall computes as 11.999999999999996) keeps that hundredth,
 * and whatever is rounded down still fits its wall in validateOpenings.
 */
const FLOOR_SLACK = LIMIT_SLACK / 2;

/** v rounded down to a multiple of 0.01 (up to FLOOR_SLACK), so a stored value never runs past the wall end. */
function floor2(v: number): number {
  return Math.floor((v + FLOOR_SLACK) * 100) / 100;
}

/** Clamps an offset into [0, wall length − width], the upper bound rounded down to 0.01. */
function clampOffset(offset: number, length: number, width: number): number {
  return Math.max(0, Math.min(offset, floor2(length - width)));
}

/** How far a re-homed offset may fall outside its wall and still count as rounding noise. */
const REHOME_NOISE = 0.01;

/**
 * A re-homed opening's new offset from its raw (unrounded) value on a wall of `length`: rounded to
 * 0.01, and clamped onto the wall only when the raw value is within REHOME_NOISE of
 * [0, length − width]. An opening that genuinely no longer fits (or a wall shorter than its width)
 * keeps the rounded raw value, so validation refuses it rather than sliding it along the wall.
 */
function rehomedOffset(raw: number, length: number, width: number): number {
  const room = length - width;
  const nearWall = room >= 0 && raw >= -REHOME_NOISE && raw <= room + REHOME_NOISE;
  return nearWall ? clampOffset(round2(raw), length, width) : round2(raw);
}

function hasAllowedSize(o: Opening): boolean {
  return (
    Number.isFinite(o.offset) &&
    inLimits(o.width, CONFIG.openingWidthMin, CONFIG.openingWidthMax) &&
    inLimits(o.height, CONFIG.openingHeightMin, CONFIG.openingHeightMax) &&
    (o.kind !== 'window' || inLimits(o.sill, 0, CONFIG.sillMax))
  );
}

/** An opening fits a wall of `length` when it starts at or after 0 and ends at or before `length`. */
function fits(o: Opening, length: number): boolean {
  return o.offset >= -LIMIT_SLACK && o.offset + o.width <= length + LIMIT_SLACK;
}

/** Two openings on one wall overlap when their intervals share more than conflictEpsilon. */
function overlaps(p: Opening, q: Opening): boolean {
  const shared = Math.min(p.offset + p.width, q.offset + q.width) - Math.max(p.offset, q.offset);
  return shared > CONFIG.conflictEpsilon;
}

/** Where `opening` is on the plan, or null when its wall id is not in the outline. */
export function openingSpan(outline: readonly Corner[], opening: Opening): OpeningSpan | null {
  const wall = wallById(outline, opening.wallId);
  if (wall === undefined) return null;
  const { a, b, length } = wall;
  // validateOutline never accepts a zero-length wall; give it no direction rather than NaN.
  const k = length === 0 ? 0 : 1 / length;
  const u = { x: clean((b.x - a.x) * k), y: clean((b.y - a.y) * k) };
  const at = (d: number): Point => ({ x: clean(a.x + u.x * d), y: clean(a.y + u.y * d) });
  return {
    a: at(opening.offset),
    b: at(opening.offset + opening.width),
    u,
    n: { x: clean(-u.y), y: clean(u.x) },
    wallIndex: wall.index,
  };
}

/**
 * The name the plan handle and the sidebar row both give `opening`: `Door on wall <n>` or
 * `Window on wall <n>`, n counted from 1 in outline order, and when its wall has more than one door
 * or window (both kinds counted together), its ordinal among them by offset, as in
 * `Door on wall 1 (2 of 3)`. An opening whose wall is not in the outline is named for wall 0.
 */
export function openingName(outline: readonly Corner[], openings: readonly Opening[], opening: Opening): string {
  const wallIndex = wallById(outline, opening.wallId)?.index ?? -1;
  const name = `${opening.kind === 'door' ? 'Door' : 'Window'} on wall ${wallIndex + 1}`;
  const onWall = openings.filter((o) => o.wallId === opening.wallId).sort((a, b) => a.offset - b.offset);
  return onWall.length > 1 ? `${name} (${onWall.findIndex((o) => o.id === opening.id) + 1} of ${onWall.length})` : name;
}

/**
 * The first problem with the openings on `outline`, checked in the order: too-many-openings (more
 * than CONFIG.maxOpenings), opening-size (a width, height or sill outside its limits, or an offset
 * or size that is not a finite number), opening-off-wall (an unknown wall, or not fitting its wall),
 * opening-overlap; null when every opening is valid.
 */
export function validateOpenings(outline: readonly Corner[], openings: readonly Opening[]): OpeningProblem | null {
  if (openings.length > CONFIG.maxOpenings) return 'too-many-openings';
  if (!openings.every(hasAllowedSize)) return 'opening-size';
  const lengths = new Map(wallsOf(outline).map((w) => [w.id, w.length]));
  const offWall = openings.some((o) => {
    const length = lengths.get(o.wallId);
    return length === undefined || !fits(o, length);
  });
  if (offWall) return 'opening-off-wall';
  for (let i = 0; i < openings.length; i++) {
    for (let j = i + 1; j < openings.length; j++) {
      if (openings[i].wallId === openings[j].wallId && overlaps(openings[i], openings[j])) return 'opening-overlap';
    }
  }
  return null;
}

/**
 * Adds a door or window `newId` with its kind's defaults on wall `wallId`, centred on `at` projected
 * onto the wall, rounded to 1 in and clamped onto the wall. On a wall shorter than the default width
 * (but at least CONFIG.openingWidthMin) it takes the wall's length, to 0.01 in. An unknown wall leaves
 * the list unchanged.
 */
export function addOpening(
  outline: readonly Corner[],
  openings: readonly Opening[],
  kind: 'door' | 'window',
  wallId: string,
  at: Point,
  newId: string,
): OpeningsResult {
  const wall = wallById(outline, wallId);
  if (wall === undefined) return unchanged(openings);
  const defaults = kind === 'door' ? DOOR_DEFAULTS : WINDOW_DEFAULTS;
  const narrow = wall.length < defaults.width && wall.length >= CONFIG.openingWidthMin - LIMIT_SLACK;
  const width = narrow ? floor2(wall.length) : defaults.width;
  // A non-finite `at` gives a NaN offset, which validation refuses as opening-size.
  const t = projectOntoSegment(at, wall.a, wall.b).t * wall.length;
  const offset = clampOffset(Math.round(t - width / 2), wall.length, width);
  const opening: Opening =
    kind === 'door'
      ? { id: newId, kind, wallId, offset, width, height: DOOR_DEFAULTS.height, hinge: DOOR_DEFAULTS.hinge, swing: DOOR_DEFAULTS.swing }
      : { id: newId, kind, wallId, offset, width, sill: WINDOW_DEFAULTS.sill, height: WINDOW_DEFAULTS.height };
  return settle(outline, [...openings, opening]);
}

/**
 * Slides opening `id` to `offset`, rounded to 1 in and clamped into [0, wall length − width]; refused
 * when it would overlap another opening. An unknown id leaves the list unchanged.
 */
export function slideOpening(outline: readonly Corner[], openings: readonly Opening[], id: string, offset: number): OpeningsResult {
  const index = openings.findIndex((o) => o.id === id);
  if (index < 0) return unchanged(openings);
  const opening = openings[index];
  const wall = wallById(outline, opening.wallId);
  const rounded = Math.round(offset);
  const next = wall === undefined ? rounded : clampOffset(rounded, wall.length, opening.width);
  return settle(
    outline,
    openings.map((o, i) => (i === index ? { ...o, offset: next } : o)),
  );
}

/**
 * Changes the given fields of opening `id` (a door's width, height, hinge and swing; a window's
 * width, height and sill; numbers rounded to 0.01); fields that do not apply to its kind are ignored.
 * An unknown id leaves the list unchanged.
 */
export function updateOpening(
  outline: readonly Corner[],
  openings: readonly Opening[],
  id: string,
  patch: DoorPatch | WindowPatch,
): OpeningsResult {
  const index = openings.findIndex((o) => o.id === id);
  if (index < 0) return unchanged(openings);
  const opening = openings[index];
  const allowed = PATCHABLE[opening.kind];
  const fields = Object.fromEntries(
    Object.entries(patch)
      .filter(([key, value]) => value !== undefined && allowed.includes(key))
      .map(([key, value]) => [key, typeof value === 'number' ? round2(value) : value]),
  );
  const next = { ...opening, ...fields } as Opening;
  return settle(
    outline,
    openings.map((o, i) => (i === index ? next : o)),
  );
}

/** The list without opening `id`; an unknown id returns an equal list. */
export function removeOpening(openings: readonly Opening[], id: string): Opening[] {
  return openings.filter((o) => o.id !== id);
}

function sameIds(p: readonly string[], q: readonly string[]): boolean {
  return p.length === q.length && p.every((id, i) => id === q[i]);
}

/**
 * Each opening moves to the same physical wall in the reversed outline, measured from its new start;
 * the new offset is set by rehomedOffset, so rounding never pushes it past the wall end and an
 * opening that no longer fits is refused rather than slid.
 */
function rehomeReversed(before: readonly Corner[], after: readonly Corner[], openings: readonly Opening[]): OpeningsResult {
  const wallsBefore = wallsOf(before);
  const lengthsAfter = new Map(wallsOf(after).map((w) => [w.id, w.length]));
  const moved = openings.map((o): Opening => {
    const wall = wallsBefore.find((w) => w.id === o.wallId);
    const length = wall === undefined ? undefined : lengthsAfter.get(wall.b.id);
    // An opening on an unknown wall stays as it is and is refused by validation.
    if (wall === undefined || length === undefined) return o;
    const wallId = wall.b.id;
    const offset = rehomedOffset(length - o.offset - o.width, length, o.width);
    return o.kind === 'door'
      ? { ...o, wallId, offset, hinge: o.hinge === 'start' ? 'end' : 'start' }
      : { ...o, wallId, offset };
  });
  return settle(after, moved);
}

/** The unit vector from `a` to `b`, or (0, 0) when they coincide. */
function unitBetween(a: Point, b: Point): Point {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return length === 0 ? { x: 0, y: 0 } : { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

/**
 * Where opening `o` on wall `w` goes when the outline changes from `before` to `after` and both
 * share the corner ids in `common` in the same order: the opening itself, moved, or the problem it
 * causes. `w` must be in `after`. In `after`, the "chain" runs from `w` to the first corner after it
 * that is in `common`; the corners strictly inside it were added on the wall.
 * - When corners after `w` were removed, the opening stays only if its wall keeps its direction.
 * - When corners were added in a straight line, the opening moves onto the new wall it lies on, its
 *   offset set by rehomedOffset; one across an added corner is refused (corner-in-opening). Only the
 *   added corners bound a segment here: an opening that already runs past either end of the chain
 *   goes to the first or last segment, and settle refuses it (opening-off-wall), as for one corner.
 * - Otherwise (nothing added, or a chain that turns, such as a step) it stays as it is.
 */
function rehomeOne(before: readonly Corner[], after: readonly Corner[], common: ReadonlySet<string>, o: Opening): Opening | OpeningProblem {
  const at = after.findIndex((c) => c.id === o.wallId);
  const from = before.findIndex((c) => c.id === o.wallId);
  const chain: Corner[] = [after[at]];
  for (let k = 1; k <= after.length; k++) {
    const corner = after[(at + k) % after.length];
    chain.push(corner);
    if (common.has(corner.id)) break;
  }
  const end = chain[chain.length - 1];
  const next = before[(from + 1) % before.length];
  if (end.id !== next.id) {
    const was = unitBetween(before[from], next);
    if (!sameDirection(was, unitBetween(chain[0], end))) return 'corner-has-openings';
  }
  if (chain.length === 2) return o;
  const first = unitBetween(chain[0], chain[1]);
  const straight = chain.slice(1).every((c, j) => sameDirection(first, unitBetween(chain[j], c)));
  if (!straight) return o;
  const last = chain.length - 2;
  let t = 0;
  for (let j = 0; j <= last; j++) {
    const length = Math.hypot(chain[j + 1].x - chain[j].x, chain[j + 1].y - chain[j].y);
    const startsHere = j === 0 || o.offset >= t - LIMIT_SLACK;
    const endsHere = j === last || o.offset + o.width <= t + length + LIMIT_SLACK;
    if (startsHere && endsHere) {
      return j === 0 ? o : { ...o, wallId: chain[j].id, offset: rehomedOffset(o.offset - t, length, o.width) };
    }
    t += length;
  }
  return 'corner-in-opening';
}

/**
 * Keeps every opening on its physical wall when the outline changes from `before` to `after`,
 * deciding the case by the corner ids: the same ids in the same order keep every opening; the same
 * ids reversed move each opening to the wall's other end and flip a door's hinge. Otherwise the ids
 * in both outlines must keep their order (else shape-has-openings), and each opening is carried by
 * rehomeOne: one on a wall that is gone, or on a wall that loses corners and turns, is refused
 * (corner-has-openings); one on a straight wall that gains corners moves onto the new wall it lies on,
 * and a corner inside one is refused (corner-in-opening). The first refusal in opening order wins, and
 * the result is validated on `after`.
 */
export function rehomeOpenings(before: readonly Corner[], after: readonly Corner[], openings: readonly Opening[]): OpeningsResult {
  if (openings.length === 0) return { ok: true, openings: [] };
  const was = before.map((c) => c.id);
  const now = after.map((c) => c.id);
  if (sameIds(was, now)) return settle(after, openings.slice());
  if (sameIds(was, now.slice().reverse())) return rehomeReversed(before, after, openings);
  const common = new Set(was.filter((id) => now.includes(id)));
  if (common.size === 0 || !sameIds(was.filter((id) => common.has(id)), now.filter((id) => common.has(id)))) {
    return refuse('shape-has-openings');
  }
  const moved: Opening[] = [];
  for (const o of openings) {
    const next = now.includes(o.wallId) ? rehomeOne(before, after, common, o) : 'corner-has-openings';
    if (typeof next === 'string') return refuse(next);
    moved.push(next);
  }
  return settle(after, moved);
}
