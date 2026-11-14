/**
 * Blueprint (2D canvas) line drawing of the room in perspective. Pure: it draws only
 * through the context it is given and touches no globals.
 * The room comes in as an outline and a height, furniture and obstacles as prisms, and doors
 * and windows as holes in the walls, so nothing here depends on how the plan stores them.
 * Ported from prototype lines 578–666 (floor, grid, walls, boxes, labels).
 */
import { boundsOf } from '../domain/polygon';
import { itemFootprint } from '../domain/shape';
import type { Conflicts, Corner, Item, Obstacle, Opening, Point, Units } from '../domain/types';
import { fmtLen, gridStepInches } from '../domain/units';
import type { Tokens } from '../styles/tokens';
import { buildPrisms, makeProjector, obstaclePrisms, sortPrisms } from './blueprintScene';
import type { Prism } from './blueprintScene';
import type { CameraPose, Vec3 } from './camera';
import { wallHoles } from './wallHoles';
import type { WallHole } from './wallHoles';

/**
 * Everything one blueprint frame needs. `outline` is the room's corners (positive signed
 * area; their ids match openings to walls) and `height` its ceiling, in inches;
 * `viewWidth`/`viewHeight` are the pane in CSS pixels.
 */
export interface BlueprintInput { outline: readonly Corner[]; height: number; items: readonly Item[];
  openings: readonly Opening[]; obstacles: readonly Obstacle[];
  selectedId: string | null; conflicts: Conflicts; units: Units; pose: CameraPose;
  viewWidth: number; safeW: number; viewHeight: number; tokens: Tokens }

const FLOOR_LINE_WIDTH = 1.5;
const GRID_ALPHA = 0.09;
/** Stop a grid line this close to the far wall so it does not double the wall edge. */
const GRID_END_GAP = 0.5;
const FAR_WALL_ALPHA = 0.6;
const NEAR_WALL_ALPHA = 0.35;
const NEAR_WALL_DASH: readonly number[] = [4, 5];
const CONFLICT_DASH: readonly number[] = [5, 4];
const SELECTED_LINE_WIDTH = 1.6;
const LABEL_FONT = '600 13px "Barlow Condensed", system-ui, sans-serif';
const LABEL_PAD_X = 12;
const LABEL_H = 20;
/** Room labels sit this far outside the near walls, in inches. */
const LABEL_OUTSET = 10;
/** The selected-item label floats this far above the item, in inches. */
const SELECTED_LABEL_LIFT = 8;
/**
 * Order the prism sides are drawn in, by edge index (0 back, 1 right, 2 front, 3 left):
 * left, right, back, front, which is x0, x1, y0, y1 for an unturned item.
 */
const SIDE_ORDER: readonly number[] = [3, 1, 0, 2];
/** Text baseline nudge so it sits optically centred in the chip. */
const LABEL_TEXT_DY = 1;

type Project = (p: Vec3) => [number, number];

interface PolyStyle { fill?: string; stroke?: string; lineWidth?: number;
  dash?: readonly number[]; alpha?: number }

/** Adds a closed sub-path through the projected points to the current path. */
function subPath(g: CanvasRenderingContext2D, P: Project, pts: readonly Vec3[]): void {
  pts.forEach((p, i) => {
    const [x, y] = P(p);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
}

/** Starts a new closed path through the projected points. */
function trace(g: CanvasRenderingContext2D, P: Project, pts: readonly Vec3[]): void {
  g.beginPath();
  subPath(g, P, pts);
}

function poly(g: CanvasRenderingContext2D, P: Project, pts: readonly Vec3[], s: PolyStyle): void {
  trace(g, P, pts);
  g.globalAlpha = s.alpha ?? 1;
  g.setLineDash(s.dash ? [...s.dash] : []);
  if (s.fill) { g.fillStyle = s.fill; g.fill(); }
  if (s.stroke) { g.strokeStyle = s.stroke; g.lineWidth = s.lineWidth ?? 1; g.lineJoin = 'round'; g.stroke(); }
  g.globalAlpha = 1;
  g.setLineDash([]);
}

function line(g: CanvasRenderingContext2D, P: Project, a: Vec3, b: Vec3, alpha: number, colour: string): void {
  const p = P(a);
  const q = P(b);
  g.beginPath();
  g.moveTo(p[0], p[1]);
  g.lineTo(q[0], q[1]);
  g.globalAlpha = alpha;
  g.strokeStyle = colour;
  g.lineWidth = 1;
  g.stroke();
  g.globalAlpha = 1;
}

/** Face colours of a prism: its top (and underside), and its sides facing plan x and plan y. */
interface PrismFills { top: string; sideX: string; sideY: string }

function prismFills(b: Prism, sel: boolean, T: Tokens): PrismFills {
  // Obstacles are fixed parts of the room, never selected as furniture: neutral, no accent.
  if (b.obstacle) return { top: T.n100, sideX: T.n200, sideY: T.bg };
  return {
    top: sel ? T.a200 : (b.kind === 'rug' ? T.a100 : T.bg),
    sideX: sel ? T.a300 : T.n200,
    sideY: sel ? T.a400 : T.a200,
  };
}

/**
 * Sides of `b` whose outward normal points toward `cam`, then its top when the camera is
 * above it, or its underside when it is raised off the floor and the camera is below it.
 * A four-sided prism's sides go in `SIDE_ORDER`, any other prism's in index order. A side whose
 * outward normal (nx, ny) has |nx| > |ny| faces plan x and takes the `sideX` colour; every
 * other side takes the `sideY` colour.
 */
function drawPrism(g: CanvasRenderingContext2D, P: Project, b: Prism, cam: Vec3, input: BlueprintInput): void {
  const T = input.tokens;
  const sel = b.itemId === input.selectedId;
  const style: PolyStyle = {
    stroke: sel ? T.a700 : T.text,
    lineWidth: sel ? SELECTED_LINE_WIDTH : 1,
    dash: input.conflicts[b.itemId] !== undefined ? CONFLICT_DASH : undefined,
  };
  const { top, sideX, sideY } = prismFills(b, sel, T);
  const { pts, z0, z1 } = b;
  const order = pts.length === SIDE_ORDER.length ? SIDE_ORDER : pts.map((_p, i) => i);
  for (const i of order) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    if (!a || !c) continue;
    // Outward normal of edge a → c is (c.y − a.y, −(c.x − a.x)) for positive-area corners,
    // so |nx| > |ny| is |c.y − a.y| > |c.x − a.x|.
    const facing = (cam[0] - a.x) * (c.y - a.y) - (cam[1] - a.y) * (c.x - a.x) > 0;
    if (facing) {
      poly(g, P, [[a.x, a.y, z0], [c.x, c.y, z0], [c.x, c.y, z1], [a.x, a.y, z1]],
        { ...style, fill: Math.abs(c.y - a.y) > Math.abs(c.x - a.x) ? sideX : sideY });
    }
  }
  if (cam[2] > z1) poly(g, P, pts.map((p): Vec3 => [p.x, p.y, z1]), { ...style, fill: top });
  else if (z0 > 0 && cam[2] < z0) poly(g, P, pts.map((p): Vec3 => [p.x, p.y, z0]), { ...style, fill: top });
}

/** A door or window hole in a wall: its rectangle and, for a window, the line across it at mid-height. */
interface Hole { pts: Vec3[]; mid: [Vec3, Vec3] | null }

/** One wall of the outline as a floor-to-ceiling quad, with its plan midpoint and its holes. */
interface Wall { pts: Vec3[]; mid: Point; far: boolean; holes: Hole[] }

/** A hole's rectangle in plan space, on the wall from `a` along the unit direction `u`. */
function holeOf(a: Point, u: Point, h: WallHole): Hole {
  const at = (x: number, z: number): Vec3 => [a.x + u.x * x, a.y + u.y * x, z];
  const zm = (h.z0 + h.z1) / 2;
  return {
    pts: [at(h.x0, h.z0), at(h.x1, h.z0), at(h.x1, h.z1), at(h.x0, h.z1)],
    mid: h.glass ? [at(h.x0, zm), at(h.x1, zm)] : null,
  };
}

/**
 * The outline's walls. A wall is "far" when the camera is on its inward side, where the
 * inward normal of a wall from a to b is (−(b.y − a.y), b.x − a.x). `holes` is one list per
 * wall, in wall order (from `wallHoles`).
 */
function wallsOf(outline: readonly Point[], height: number, cam: Vec3, holes: readonly (readonly WallHole[])[]): Wall[] {
  const walls: Wall[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    if (!b) return;
    const far = -(b.y - a.y) * (cam[0] - a.x) + (b.x - a.x) * (cam[1] - a.y) > 0;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const u = len === 0 ? { x: 0, y: 0 } : { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    walls.push({
      pts: [[a.x, a.y, 0], [b.x, b.y, 0], [b.x, b.y, height], [a.x, a.y, height]],
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      far,
      holes: (holes[i] ?? []).map((h) => holeOf(a, u, h)),
    });
  });
  return walls;
}

/**
 * A far wall: its translucent fill, then its outline. With holes the fill is one path of the
 * wall and each hole, filled with the even-odd rule so the holes stay empty, and each hole's
 * edges (and a window's mid-height line) are stroked after the outline.
 */
function drawFarWall(g: CanvasRenderingContext2D, P: Project, w: Wall, T: Tokens): void {
  if (w.holes.length === 0) {
    poly(g, P, w.pts, { fill: T.a100, alpha: FAR_WALL_ALPHA });
  } else {
    trace(g, P, w.pts);
    for (const h of w.holes) subPath(g, P, h.pts);
    g.globalAlpha = FAR_WALL_ALPHA;
    g.fillStyle = T.a100;
    g.fill('evenodd');
    g.globalAlpha = 1;
  }
  poly(g, P, w.pts, { stroke: T.text });
  drawHoleEdges(g, P, w.holes, { stroke: T.text }, T.text, 1);
}

/** Each hole's rectangle stroked in `style`, then a window's mid-height line in the same colour and alpha. */
function drawHoleEdges(g: CanvasRenderingContext2D, P: Project, holes: readonly Hole[], style: PolyStyle,
  colour: string, alpha: number): void {
  for (const h of holes) {
    poly(g, P, h.pts, style);
    if (h.mid) {
      g.setLineDash(style.dash ? [...style.dash] : []);
      line(g, P, h.mid[0], h.mid[1], alpha, colour);
      g.setLineDash([]);
    }
  }
}

function planDistSq(p: Point, cam: Vec3): number {
  return (p.x - cam[0]) ** 2 + (p.y - cam[1]) ** 2;
}

function label(g: CanvasRenderingContext2D, P: Project, T: Tokens, p: Vec3, txt: string, accent: boolean): void {
  const [x, y] = P(p);
  g.font = LABEL_FONT;
  const w = g.measureText(txt).width + LABEL_PAD_X;
  g.fillStyle = accent ? T.a700 : T.bg;
  g.fillRect(x - w / 2, y - LABEL_H / 2, w, LABEL_H);
  g.fillStyle = accent ? T.bg : T.text;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(txt, x, y + LABEL_TEXT_DY);
}

/**
 * Draws one blueprint frame: floor, grid clipped to the floor, far walls far to near,
 * rugs then the painter-sorted furniture and obstacle prisms, near walls dashed (every wall
 * with its door and window holes), and the dimension labels on top.
 * The caller sets the device-pixel transform; everything here is in CSS pixels.
 */
export function drawBlueprint(g: CanvasRenderingContext2D, input: BlueprintInput): void {
  const { outline, height: H, items, units, pose, tokens: T } = input;
  g.clearRect(0, 0, input.viewWidth, input.viewHeight);
  const bounds = boundsOf(outline);
  const { minX, minY, maxX, maxY } = bounds;
  const cam = pose.position;
  const P = makeProjector(pose, input.safeW, input.viewHeight);
  const floor = outline.map((p): Vec3 => [p.x, p.y, 0]);

  poly(g, P, floor, { fill: T.n100, stroke: T.text, lineWidth: FLOOR_LINE_WIDTH });
  // Grid lines span the bounding box and are clipped to the floor polygon.
  g.save();
  trace(g, P, floor);
  g.clip();
  const gu = gridStepInches(units);
  for (let x = minX + gu; x < maxX - GRID_END_GAP; x += gu) line(g, P, [x, minY, 0], [x, maxY, 0], GRID_ALPHA, T.text);
  for (let y = minY + gu; y < maxY - GRID_END_GAP; y += gu) line(g, P, [minX, y, 0], [maxX, y, 0], GRID_ALPHA, T.text);
  g.restore();

  const walls = wallsOf(outline, H, cam, wallHoles(outline, input.openings, H));
  const far = walls.filter((w) => w.far).sort((a, b) => planDistSq(b.mid, cam) - planDistSq(a.mid, cam));
  for (const w of far) drawFarWall(g, P, w, T);

  const { prisms, rugs } = buildPrisms(items);
  const solids = [...prisms, ...obstaclePrisms(input.obstacles)];
  for (const b of [...rugs, ...sortPrisms(solids, cam)]) drawPrism(g, P, b, cam, input);

  for (const w of walls.filter((wall) => !wall.far)) {
    const near: PolyStyle = { stroke: T.text, dash: NEAR_WALL_DASH, alpha: NEAR_WALL_ALPHA };
    poly(g, P, w.pts, near);
    drawHoleEdges(g, P, w.holes, near, T.text, NEAR_WALL_ALPHA);
  }

  const cx = minX + bounds.w / 2;
  const cy = minY + bounds.l / 2;
  const nearY = cam[1] > cy;
  const nearX = cam[0] > cx;
  label(g, P, T, [cx, nearY ? maxY + LABEL_OUTSET : minY - LABEL_OUTSET, 0], fmtLen(bounds.w, units), false);
  label(g, P, T, [nearX ? maxX + LABEL_OUTSET : minX - LABEL_OUTSET, cy, 0], fmtLen(bounds.l, units), false);
  const farthest = outline.reduce<Point | undefined>(
    (best, p) => (best === undefined || planDistSq(p, cam) > planDistSq(best, cam) ? p : best), undefined);
  if (farthest) label(g, P, T, [farthest.x, farthest.y, H / 2], fmtLen(H, units), false);
  const si = items.find((i) => i.id === input.selectedId);
  if (si) {
    const fp = itemFootprint(si);
    label(g, P, T, [fp.cx, fp.cy, si.h + SELECTED_LABEL_LIFT],
      `${si.name} · ${fmtLen(si.h, units)} tall`, true);
  }
}
