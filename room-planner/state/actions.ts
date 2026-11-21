import { CONFIG } from '../config';
import { defaultStyle, KIND_ORDER } from '../domain/furniture/recipe';
import { addObstacle, newObstacle, updateObstacle } from '../domain/obstacles';
import { addOpening, openingSpan, slideOpening, updateOpening } from '../domain/openings';
import {
  insertCorner,
  LIMIT_SLACK,
  moveCorner,
  type OutlineResult,
  removeCorner,
  setWallLength,
  slideWall,
  snapCornerTarget,
  snapSlideDistance,
  wallFrame,
  wallSlideStops,
  wallsOf,
} from '../domain/outline';
import { interiorPoint } from '../domain/polygon';
import type { Corner, Kind, Obstacle, Point, ProductPreview } from '../domain/types';
import { LookupError, parseProductUrl, type ParsedProductUrl, type ProductLookup } from '../services/productLookup';
import { remoteProductLookup } from '../services/remoteProductLookup';
import { ROOM_PROBLEM_TEXT, type RoomProblem, usePlanStore } from './planStore';
import { useUiStore } from './uiStore';

/** Cross-store actions: operations on the plan driven by the UI selection, mode and notices. */

/** Turns the selected item `deg` degrees clockwise (a quarter turn by default); no-op when nothing is selected. */
export function rotateSelected(deg = 90): void {
  const id = useUiStore.getState().selectedId;
  if (id === null) return;
  usePlanStore.getState().rotateItemBy(id, deg);
}

/** Removes the selected item and clears the selection; no-op when nothing is selected. */
export function removeSelected(): void {
  const id = useUiStore.getState().selectedId;
  if (id === null) return;
  usePlanStore.getState().removeItem(id);
  useUiStore.getState().select(null);
}

/** The notice shown when a piece cannot be added because the plan already has CONFIG.maxItems. */
const PLAN_FULL_NOTICE = 'This plan is full. Remove a piece to add another.';

/**
 * Adds a piece of `kind`, selects it and returns its id; null when the plan is full, in which case
 * the notice 'This plan is full. Remove a piece to add another.' is shown. When a failed lookup left
 * a pending link, the piece gets that link and host, the pending link is cleared and the lookup is
 * set idle; a full plan keeps the pending link for the next try.
 */
export function addFurnitureOfKind(kind: Kind): string | null {
  const { pendingLink } = useUiStore.getState();
  const plan = usePlanStore.getState();
  const id =
    pendingLink === null
      ? plan.addFurniture(kind)
      : plan.addFurnitureFrom({ kind, sourceUrl: pendingLink.url, host: pendingLink.host });
  if (id === null) {
    useUiStore.getState().setNotice(PLAN_FULL_NOTICE);
    return null;
  }
  if (pendingLink !== null) {
    useUiStore.getState().setPendingLink(null);
    useUiStore.getState().setLookup({ status: 'idle' });
  }
  useUiStore.getState().select(id);
  return id;
}

/**
 * The controller of the lookup now running, or null when none is. Starting a lookup or dismissing
 * it aborts this one; a call whose controller is no longer this one writes nothing.
 */
let activeLookup: AbortController | null = null;

/**
 * True when `err` is the error a fetch or signal raises on an abort. Checked by name, because a
 * DOMException is not an Error everywhere (it is not under jsdom).
 */
function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError';
}

/**
 * Looks up the product behind the pasted link `raw` with `lookup` (the site's lookup route by
 * default), aborting any lookup still running. The lookup goes loading, then preview (clearing the
 * pending link) or error. A link that does not parse is `invalid_url` and makes no request; any other
 * failure keeps the parsed link as the pending link, so the next piece added by type carries it. An
 * error that is not a LookupError counts as `unavailable`. A superseded or dismissed call changes
 * nothing, an abort is swallowed, and the returned promise never rejects. The link is never logged.
 */
export async function lookupProduct(raw: string, lookup: ProductLookup = remoteProductLookup): Promise<void> {
  activeLookup?.abort();
  activeLookup = null;
  const ui = useUiStore.getState();
  let link: ParsedProductUrl;
  try {
    link = parseProductUrl(raw);
  } catch {
    ui.setPendingLink(null);
    ui.setLookup({ status: 'error', code: 'invalid_url' });
    return;
  }

  const controller = new AbortController();
  activeLookup = controller;
  ui.setPendingLink(null);
  ui.setLookup({ status: 'loading' });
  try {
    const preview = await lookup.lookup(link.url, { signal: controller.signal });
    if (activeLookup !== controller) return;
    activeLookup = null;
    useUiStore.getState().setPendingLink(null);
    useUiStore.getState().setLookup({ status: 'preview', preview });
  } catch (err) {
    if (activeLookup !== controller) return;
    activeLookup = null;
    if (isAbortError(err)) return;
    const code = err instanceof LookupError ? err.code : 'unavailable';
    useUiStore.getState().setPendingLink(code === 'invalid_url' ? null : { url: link.url, host: link.host });
    useUiStore.getState().setLookup({ status: 'error', code });
  }
}

/** True when `value` is a size a piece may have: finite and within [CONFIG.itemDimMin, CONFIG.itemDimMax]. */
function isPieceSize(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= CONFIG.itemDimMin && value <= CONFIG.itemDimMax;
}

/**
 * Changes the shown preview before it is placed. Each size is used only when finite and within
 * [CONFIG.itemDimMin, CONFIG.itemDimMax] (`sizesFound` is left as it was); a kind other than the
 * preview's takes that kind's default style, keeps the colours, name and sizes, and marks the kind as
 * found. Invalid fields are ignored one by one. No-op when no preview is shown.
 */
export function updatePreview(patch: { kind?: Kind; w?: number; d?: number; h?: number }): void {
  const current = useUiStore.getState().lookup;
  if (current.status !== 'preview') return;
  const next: ProductPreview = { ...current.preview };
  for (const key of ['w', 'd', 'h'] as const) {
    const value = patch[key];
    if (isPieceSize(value)) next[key] = value;
  }
  const { kind } = patch;
  if (kind !== undefined && kind !== next.kind && KIND_ORDER.includes(kind)) {
    next.kind = kind;
    next.style = defaultStyle(kind);
    next.kindFound = true;
  }
  useUiStore.getState().setLookup({ status: 'preview', preview: next });
}

/**
 * Adds the shown preview to the room as a piece with its kind, name, host, link, price, sizes, style
 * and colours (never its photo address), selects it, sets the lookup idle and returns its id. When
 * the plan is full it shows the plan-full notice, keeps the preview and returns null; with no preview
 * shown it returns null and changes nothing.
 */
export function addPreviewToRoom(): string | null {
  const current = useUiStore.getState().lookup;
  if (current.status !== 'preview') return null;
  const { kind, name, host, sourceUrl, price, w, d, h, style, colours } = current.preview;
  const id = usePlanStore.getState().addFurnitureFrom({ kind, name, host, sourceUrl, price, w, d, h, style, colours });
  if (id === null) {
    useUiStore.getState().setNotice(PLAN_FULL_NOTICE);
    return null;
  }
  useUiStore.getState().setLookup({ status: 'idle' });
  useUiStore.getState().select(id);
  return id;
}

/** Aborts any running lookup, sets the lookup idle and clears the pending link. */
export function dismissLookup(): void {
  activeLookup?.abort();
  activeLookup = null;
  useUiStore.getState().setPendingLink(null);
  useUiStore.getState().setLookup({ status: 'idle' });
}

/** Clears the pending link, leaving the lookup as it is. */
export function clearPendingLink(): void {
  useUiStore.getState().setPendingLink(null);
}

/**
 * Moves the selected item by (dx, dy) inches, with no grid snapping, through moveItemBy: a piece
 * wholly inside the room moves the part of the step that fits and stops flush at the wall; no-op
 * when nothing is selected.
 */
export function nudgeSelected(dx: number, dy: number): void {
  const id = useUiStore.getState().selectedId;
  if (id === null) return;
  usePlanStore.getState().moveItemBy(id, dx, dy);
}

/**
 * Stores an outline edit through applyOutline and records the outcome for the room editor: a
 * refusal (by the outline rules, or because a door or window cannot follow) sets the room problem
 * to its text, an accepted edit clears it. Returns true when accepted.
 */
function applyRoomEdit(result: OutlineResult): boolean {
  return recordRoomOutcome(usePlanStore.getState().applyOutline(result));
}

/**
 * Records the outcome of a room edit for the room editor: a refusal sets the room problem to its
 * text, an accepted edit (null) clears it. Returns true when accepted.
 */
function recordRoomOutcome(problem: RoomProblem | null): boolean {
  useUiStore.getState().setRoomProblem(problem === null ? null : ROOM_PROBLEM_TEXT[problem]);
  return problem === null;
}

function hasCorner(id: string): boolean {
  return usePlanStore.getState().room.outline.some((c) => c.id === id);
}

/**
 * Moves corner `id` towards `target` (inches), snapped by snapCornerTarget (angle snapping when
 * `opts.angleSnap`, else the corner grid). An unknown corner changes nothing, the room problem included.
 */
export function dragCornerTo(id: string, target: Point, opts: { angleSnap: boolean; toleranceIn: number }): void {
  if (!hasCorner(id)) return;
  const { outline } = usePlanStore.getState().room;
  applyRoomEdit(moveCorner(outline, id, snapCornerTarget(outline, id, target, opts)));
}

/**
 * Splits wall `wallId` with a new corner near `at` (inches) and selects it; an unknown wall
 * changes nothing. A refused split leaves the selection as it was.
 */
export function addCornerOnWall(wallId: string, at: Point): void {
  if (!hasCorner(wallId)) return;
  const id = crypto.randomUUID();
  if (applyRoomEdit(insertCorner(usePlanStore.getState().room.outline, wallId, at, id))) {
    useUiStore.getState().selectCorner(id);
  }
}

/** Removes the selected corner and clears the corner selection; no-op when no corner is selected. */
export function removeSelectedCorner(): void {
  const id = useUiStore.getState().selectedCornerId;
  if (id === null || !hasCorner(id)) return;
  if (applyRoomEdit(removeCorner(usePlanStore.getState().room.outline, id))) {
    useUiStore.getState().selectCorner(null);
  }
}

/**
 * Moves the selected corner by exactly (dx, dy) inches, with no angle or grid snapping; no-op when
 * no known corner is selected.
 */
export function nudgeSelectedCorner(dx: number, dy: number): void {
  const id = useUiStore.getState().selectedCornerId;
  const { outline } = usePlanStore.getState().room;
  const corner = outline.find((c) => c.id === id);
  if (corner === undefined) return;
  applyRoomEdit(moveCorner(outline, corner.id, { x: corner.x + dx, y: corner.y + dy }));
}

/**
 * One wall slide in progress (a drag): the outline as it was when the slide started, the ids any new
 * step corners take, the distances at which a neighbour wall is used up, and the wall's inward normal.
 * Every move of the slide is computed from this snapshot, so a step made and undone keeps its ids.
 */
export interface WallSlide { wallId: string; outline: readonly Corner[]; ids: { start: string; end: string }; stops: readonly number[]; normal: Point }

/**
 * Starts sliding wall `wallId`: snapshots the stored outline, takes two fresh ids for step corners,
 * and works out the wall's stops and inward normal. Returns null for an unknown wall.
 */
export function startWallSlide(wallId: string): WallSlide | null {
  const { outline } = usePlanStore.getState().room;
  const wall = wallsOf(outline).find((w) => w.id === wallId);
  if (wall === undefined) return null;
  return {
    wallId,
    outline,
    ids: { start: crypto.randomUUID(), end: crypto.randomUUID() },
    stops: wallSlideStops(outline, wallId),
    normal: wallFrame(wall).n,
  };
}

/**
 * Moves the wall of `slide` to `rawDistance` inches from where it started, along its inward normal
 * (negative is outward), snapped to a stop within half a grid step or else to the corner grid. A
 * refusal keeps the last accepted position and shows its reason; an accepted move clears it.
 */
export function slideWallTo(slide: WallSlide, rawDistance: number): void {
  applyRoomEdit(slideWall(slide.outline, slide.wallId, snapSlideDistance(rawDistance, slide.stops), slide.ids));
}

/** Below this |direction · n| a direction runs along the wall and does not slide it. */
const ALONG_THE_WALL = 1e-9;

/**
 * Slides the selected wall `step` inches the way `direction` (a plan-space vector, y down, such as an
 * arrow key's) points across it: by sign(direction · n) × step, where n is the wall's inward normal,
 * stopping short at the nearest stop on the way (where a neighbour wall is used up). No grid snapping.
 * A direction along the wall (|direction · n| < 1e-9), no selected wall, or a selected wall not in the
 * outline changes nothing, the room problem included.
 */
export function slideSelectedWallToward(direction: Point, step: number): void {
  const id = useUiStore.getState().selectedWallId;
  const { outline } = usePlanStore.getState().room;
  const wall = wallsOf(outline).find((w) => w.id === id);
  if (wall === undefined) return;
  const { n } = wallFrame(wall);
  const along = direction.x * n.x + direction.y * n.y;
  if (Math.abs(along) < ALONG_THE_WALL) return;
  let d = Math.sign(along) * step;
  for (const s of wallSlideStops(outline, wall.id)) {
    if (Math.sign(s) === Math.sign(d) && s !== 0 && Math.abs(s) < Math.abs(d)) d = s;
  }
  applyRoomEdit(slideWall(outline, wall.id, d, { start: crypto.randomUUID(), end: crypto.randomUUID() }));
}

/**
 * Sets wall `wallId` to `inches` long, keeping every wall's direction; the end that moves is the
 * length anchor in the UI store. A length above CONFIG.roomMax is refused as too-large, and any other
 * refusal shows its reason. Returns true when accepted. An unknown wall returns false and changes
 * nothing, the room problem included.
 */
export function setWallLengthTo(wallId: string, inches: number): boolean {
  if (!hasCorner(wallId)) return false;
  if (inches > CONFIG.roomMax + LIMIT_SLACK) return recordRoomOutcome('too-large');
  const { outline } = usePlanStore.getState().room;
  return applyRoomEdit(setWallLength(outline, wallId, inches, useUiStore.getState().lengthAnchor));
}

/** The fields updateSelectedOpening may change: those of updateOpening. */
type OpeningPatch = Parameters<typeof updateOpening>[3];
/** The fields updateSelectedObstacle may change: those of updateObstacle. */
type ObstaclePatch = Parameters<typeof updateObstacle>[2];

function hasOpening(id: string): boolean {
  return usePlanStore.getState().openings.some((o) => o.id === id);
}

function findObstacle(id: string | null): Obstacle | undefined {
  return usePlanStore.getState().obstacles.find((o) => o.id === id);
}

/**
 * Places a door or window (the armed room tool) on wall `wallId`, centred on `at` (inches) projected
 * onto the wall and moved along it to fit. On success selects it and sets the tool back to 'corner';
 * a refusal shows its reason and keeps the tool armed. Does nothing while the tool is 'corner' or
 * for an unknown wall.
 */
export function placeOpeningOnWall(wallId: string, at: Point): void {
  const ui = useUiStore.getState();
  const kind = ui.roomTool;
  if (kind === 'corner' || !hasCorner(wallId)) return;
  const id = crypto.randomUUID();
  const plan = usePlanStore.getState();
  if (recordRoomOutcome(plan.applyOpenings(addOpening(plan.room.outline, plan.openings, kind, wallId, at, id)))) {
    useUiStore.getState().selectOpening(id);
    useUiStore.getState().setRoomTool('corner');
  }
}

/**
 * Slides door or window `id` along its wall to `offset` inches (rounded to 1 in and kept on the
 * wall; at a wall end it stays, which is not a refusal). An overlap is refused with its reason. An
 * unknown id changes nothing, the room problem included.
 */
export function slideOpeningTo(id: string, offset: number): void {
  if (!hasOpening(id)) return;
  const plan = usePlanStore.getState();
  recordRoomOutcome(plan.applyOpenings(slideOpening(plan.room.outline, plan.openings, id, offset)));
}

/** Slides the selected door or window `delta` inches along its wall; no-op when none is selected. */
export function slideSelectedOpening(delta: number): void {
  const id = useUiStore.getState().selectedOpeningId;
  const opening = usePlanStore.getState().openings.find((o) => o.id === id);
  if (opening === undefined) return;
  slideOpeningTo(opening.id, opening.offset + delta);
}

/** Below this |direction · u| a direction is across the wall and does not slide an opening. */
const ACROSS_THE_WALL = 1e-9;

/**
 * Slides the selected door or window `step` inches along its wall the way `direction` (a plan-space
 * vector, y down, such as an arrow key's) points: the offset changes by sign(direction · u) × step,
 * where u is the wall's direction, so on a wall running right to left a step to the right lowers the
 * offset. A direction across the wall (|direction · u| < 1e-9), no selection, or an opening whose wall
 * is not in the outline changes nothing, the room problem included.
 */
export function slideSelectedOpeningToward(direction: Point, step: number): void {
  const id = useUiStore.getState().selectedOpeningId;
  const { room, openings } = usePlanStore.getState();
  const opening = openings.find((o) => o.id === id);
  if (opening === undefined) return;
  const span = openingSpan(room.outline, opening);
  if (span === null) return;
  const along = direction.x * span.u.x + direction.y * span.u.y;
  if (Math.abs(along) < ACROSS_THE_WALL) return;
  slideSelectedOpening(Math.sign(along) * step);
}

/**
 * Changes fields of the selected door or window (those updateOpening allows for its kind); a value
 * that is not allowed is refused with its reason. No-op when none is selected.
 */
export function updateSelectedOpening(patch: OpeningPatch): void {
  const id = useUiStore.getState().selectedOpeningId;
  if (id === null || !hasOpening(id)) return;
  const plan = usePlanStore.getState();
  recordRoomOutcome(plan.applyOpenings(updateOpening(plan.room.outline, plan.openings, id, patch)));
}

/**
 * Adds a box, or a column as tall as the room, at the room's interior point and selects it; a
 * refusal (the room already has the most obstacles allowed) shows its reason and selects nothing.
 */
export function addObstacleAtCentre(shape: 'box' | 'cylinder'): void {
  const plan = usePlanStore.getState();
  const id = crypto.randomUUID();
  const obstacle = newObstacle(shape, interiorPoint(plan.room.outline), plan.room.height, id);
  if (recordRoomOutcome(plan.applyObstacles(addObstacle(plan.obstacles, obstacle)))) {
    useUiStore.getState().selectObstacle(id);
  }
}

/**
 * Moves obstacle `id` towards (x, y) inches, its bounding box on the furniture grid, through
 * moveObstacleTo (one wholly inside the room stops flush at a wall it would cross), and clears the
 * room problem. An unknown id changes nothing, the room problem included.
 */
export function dragObstacleTo(id: string, x: number, y: number): void {
  if (findObstacle(id) === undefined) return;
  usePlanStore.getState().moveObstacleTo(id, x, y);
  recordRoomOutcome(null);
}

/**
 * Moves the selected obstacle by (dx, dy) inches through moveObstacleBy (one wholly inside the room
 * moves the part of the step that fits and stops flush at the wall), and clears the room problem;
 * no-op when no known obstacle is selected.
 */
export function nudgeSelectedObstacle(dx: number, dy: number): void {
  const obstacle = findObstacle(useUiStore.getState().selectedObstacleId);
  if (obstacle === undefined) return;
  usePlanStore.getState().moveObstacleBy(obstacle.id, dx, dy);
  recordRoomOutcome(null);
}

/** Turns the selected obstacle `deg` degrees clockwise; no-op when no known obstacle is selected. */
export function rotateSelectedObstacle(deg: number): void {
  const obstacle = findObstacle(useUiStore.getState().selectedObstacleId);
  if (obstacle === undefined) return;
  const plan = usePlanStore.getState();
  recordRoomOutcome(plan.applyObstacles(updateObstacle(plan.obstacles, obstacle.id, { rotation: obstacle.rotation + deg })));
}

/**
 * Changes fields of the selected obstacle (those updateObstacle allows); a value that is not allowed
 * is refused with its reason. No-op when no known obstacle is selected.
 */
export function updateSelectedObstacle(patch: ObstaclePatch): void {
  const obstacle = findObstacle(useUiStore.getState().selectedObstacleId);
  if (obstacle === undefined) return;
  const plan = usePlanStore.getState();
  recordRoomOutcome(plan.applyObstacles(updateObstacle(plan.obstacles, obstacle.id, patch)));
}

/**
 * Removes whichever of the selected corner (as removeSelectedCorner), door or window, or obstacle is
 * selected, and clears that selection on success. No-op when nothing known is selected.
 */
export function removeSelectedRoomThing(): void {
  const { selectedCornerId, selectedOpeningId, selectedObstacleId } = useUiStore.getState();
  if (selectedCornerId !== null) {
    removeSelectedCorner();
    return;
  }
  if (selectedOpeningId !== null && hasOpening(selectedOpeningId)) {
    usePlanStore.getState().removeOpening(selectedOpeningId);
    recordRoomOutcome(null);
    useUiStore.getState().selectOpening(null);
    return;
  }
  const obstacle = findObstacle(selectedObstacleId);
  if (obstacle === undefined) return;
  usePlanStore.getState().removeObstacle(obstacle.id);
  recordRoomOutcome(null);
  useUiStore.getState().selectObstacle(null);
}

