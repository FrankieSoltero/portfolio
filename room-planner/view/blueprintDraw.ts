/**
 * Blueprint (2D canvas) line drawing of the room in perspective. Pure: it draws only
 * through the context it is given and touches no globals.
 * The room comes in as an outline and a height, and furniture as rotated prisms, so
 * nothing here depends on how the plan stores them.
 * Ported from prototype lines 578–666 (floor, grid, walls, boxes, labels).
 */
import { boundsOf } from '../domain/polygon';
import { itemFootprint } from '../domain/shape';
import type { Conflicts, Item, Point, Units } from '../domain/types';
import { fmtLen, gridStepInches } from '../domain/units';
import type { Tokens } from '../styles/tokens';
import { buildPrisms, makeProjector, sortPrisms } from './blueprintScene';
import type { Prism } from './blueprintScene';
import type { CameraPose, Vec3 } from './camera';

/**
 * Everything one blueprint frame needs. `outline` is the room's corners (positive signed
 * area) and `height` its ceiling, in inches; `viewWidth`/`viewHeight` are the pane in CSS pixels.
 */
export interface BlueprintInput { outline: readonly Point[]; height: number; items: readonly Item[];
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

/** Starts a new closed path through the projected points. */
function trace(g: CanvasRenderingContext2D, P: Project, pts: readonly Vec3[]): void {
  g.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = P(p);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
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

/**
 * Sides of `b` whose outward normal points toward `cam`, then its top when the camera is
 * above it. Back and front sides (even edges) take the `sideY` colour, right and left
 * (odd edges) the `sideX` colour.
 */
function drawPrism(g: CanvasRenderingContext2D, P: Project, b: Prism, cam: Vec3, input: BlueprintInput): void {
  const T = input.tokens;
  const sel = b.itemId === input.selectedId;
  const style: PolyStyle = {
    stroke: sel ? T.a700 : T.text,
    lineWidth: sel ? SELECTED_LINE_WIDTH : 1,
    dash: input.conflicts[b.itemId] !== undefined ? CONFLICT_DASH : undefined,
  };
  const top = sel ? T.a200 : (b.kind === 'rug' ? T.a100 : T.bg);
  const sideX = sel ? T.a300 : T.n200;
  const sideY = sel ? T.a400 : T.a200;
  const { pts, z0, z1 } = b;
  for (const i of SIDE_ORDER) {
    const a = pts[i];
    const c = pts[(i + 1) % pts.length];
    if (!a || !c) continue;
    // Outward normal of edge a → c is (c.y − a.y, −(c.x − a.x)) for positive-area corners.
    const facing = (cam[0] - a.x) * (c.y - a.y) - (cam[1] - a.y) * (c.x - a.x) > 0;
    if (facing) {
      poly(g, P, [[a.x, a.y, z0], [c.x, c.y, z0], [c.x, c.y, z1], [a.x, a.y, z1]],
        { ...style, fill: i % 2 === 0 ? sideY : sideX });
    }
  }
  if (cam[2] > z1) poly(g, P, pts.map((p): Vec3 => [p.x, p.y, z1]), { ...style, fill: top });
}

/** One wall of the outline as a floor-to-ceiling quad, with its plan midpoint. */
interface Wall { pts: Vec3[]; mid: Point; far: boolean }

/**
 * The outline's walls. A wall is "far" when the camera is on its inward side, where the
 * inward normal of a wall from a to b is (−(b.y − a.y), b.x − a.x).
 */
function wallsOf(outline: readonly Point[], height: number, cam: Vec3): Wall[] {
  const walls: Wall[] = [];
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    if (!b) return;
    const far = -(b.y - a.y) * (cam[0] - a.x) + (b.x - a.x) * (cam[1] - a.y) > 0;
    walls.push({
      pts: [[a.x, a.y, 0], [b.x, b.y, 0], [b.x, b.y, height], [a.x, a.y, height]],
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      far,
    });
  });
  return walls;
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
 * rugs then painter-sorted prisms, near walls dashed, and the dimension labels on top.
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

  const walls = wallsOf(outline, H, cam);
  const far = walls.filter((w) => w.far).sort((a, b) => planDistSq(b.mid, cam) - planDistSq(a.mid, cam));
  for (const w of far) {
    poly(g, P, w.pts, { fill: T.a100, alpha: FAR_WALL_ALPHA });
    poly(g, P, w.pts, { stroke: T.text });
  }

  const { prisms, rugs } = buildPrisms(items);
  for (const b of [...rugs, ...sortPrisms(prisms, cam)]) drawPrism(g, P, b, cam, input);

  for (const w of walls.filter((wall) => !wall.far)) {
    poly(g, P, w.pts, { stroke: T.text, dash: NEAR_WALL_DASH, alpha: NEAR_WALL_ALPHA });
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
