/**
 * The floor-plan picture: a still, print-style drawing of the whole plan for download. Pure: it
 * draws only through the context it is given and touches no globals except Path2D, which turns a
 * door's SVG arc into a canvas path. Nothing is selected in the picture.
 */
import { fillsFootprint, planParts, type PlanPart } from '../domain/furniture/planParts';
import { obstacleFootprint, obstaclePolygon } from '../domain/obstacles';
import { boundsOf, pointInPolygon } from '../domain/polygon';
import { footprintCorners, itemFootprint, planPartOutline, type Footprint } from '../domain/shape';
import type { Conflicts, Corner, Item, Obstacle, Opening, Point, Units } from '../domain/types';
import { fmtLen } from '../domain/units';
import { doorDrawing, windowDrawing } from './planFeatures';
import { labelBox, toPane, type PlanLayout } from './planLayout';

/** Everything the picture shows; lengths in inches, the outline with its corner ids for the openings. */
export interface PlanPictureInput {
  outline: readonly Corner[]; items: readonly Item[]; openings: readonly Opening[];
  obstacles: readonly Obstacle[]; conflicts: Conflicts; units: Units;
}

export const PLAN_PICTURE_CREDIT = 'Room Planner · frankiesoltero.com/room-planner';

/** Space around the plan on every side, in pixels. */
const MARGIN = 160;
/** Points in a round part's outline in the picture: 48 keeps an ellipse smooth at 2000 px (the plan and blueprint keep 16). */
const ROUND_PICTURE_POINTS = 48;
/** The plan's longer side is drawn this many pixels long. */
const LONG_SIDE_PX = 2000 - 2 * MARGIN;

const PAGE = '#ffffff';
const FLOOR = '#f7f5f0';
const FURNITURE_FILL = '#e4e8ee';
const OBSTACLE_FILL = '#c5cad3';
const SHAPE_STROKE = '#3d4a63';
const CONFLICT_FILL = '#fbdada';
const CONFLICT_INK = '#b3261e';
const INK = '#1a1c2c';
const GAP = '#ffffff';
const WINDOW_LINE = '#2f6fb0';
const CREDIT_INK = '#6b7280';

const WALL_WIDTH = 10;
const SHAPE_WIDTH = 3;
const GAP_WIDTH = 10;
const WINDOW_WIDTH = 4;
const LEAF_WIDTH = 3;
const ARC_WIDTH = 2;
/** Opacity of the part lines drawn inside each piece of furniture. */
const PART_ALPHA = 0.4;

const NAME_FONT = '500 26px Barlow, sans-serif';
const LENGTH_FONT = '600 28px Barlow, sans-serif';
const CREDIT_FONT = '400 22px Barlow, sans-serif';
/** A name must be this many pixels narrower than its label box. */
const NAME_INSET = 16;
const ELLIPSIS = '…';
/** A wall length's text box stays this many pixels from the wall line: half the wall's stroke plus a 14 px gap. */
const LENGTH_CLEARANCE = 19;
/** Half the wall-length font's size: the text box's half height. */
const LENGTH_HALF_HEIGHT = 14;
/** How far from a wall's midpoint, in inches, the inside of the room is probed. */
const SIDE_PROBE = 1;
/** The credit is written this many pixels above the bottom edge. */
const CREDIT_BOTTOM = 36;

/** The picture's pixel size and the layout that maps plan inches onto it. */
export function planPictureSize(outline: readonly Point[]): { width: number; height: number; layout: PlanLayout } {
  const b = boundsOf(outline);
  const scale = LONG_SIDE_PX / Math.max(b.w, b.l);
  return {
    width: Math.round(b.w * scale) + 2 * MARGIN,
    height: Math.round(b.l * scale) + 2 * MARGIN,
    layout: { scale, ox: MARGIN - b.minX * scale, oy: MARGIN - b.minY * scale },
  };
}

/** Starts a new closed path through the plan points, in pane pixels. */
function trace(g: CanvasRenderingContext2D, pts: readonly Point[], layout: PlanLayout): void {
  g.beginPath();
  pts.forEach((p, i) => {
    const q = toPane(p, layout);
    if (i) g.lineTo(q.x, q.y);
    else g.moveTo(q.x, q.y);
  });
  g.closePath();
}

/** Fills and strokes a closed plan shape, in the conflict colours when `conflict` is set. */
function shape(g: CanvasRenderingContext2D, pts: readonly Point[], layout: PlanLayout, fill: string,
  conflict: boolean): void {
  trace(g, pts, layout);
  g.fillStyle = conflict ? CONFLICT_FILL : fill;
  g.fill();
  g.strokeStyle = conflict ? CONFLICT_INK : SHAPE_STROKE;
  g.lineWidth = SHAPE_WIDTH;
  g.stroke();
}

/**
 * Draws a piece of furniture from above: its footprint filled and stroked, as the ellipse of its
 * round part that fills the footprint when it has one (a round rug, a round table top), then each
 * of its other plan parts' outlines stroked in the same colour at PART_ALPHA opacity, between a
 * save and a restore so the opacity does not reach anything drawn after.
 */
function furniture(g: CanvasRenderingContext2D, item: Item, layout: PlanLayout, conflict: boolean): void {
  const fp = itemFootprint(item);
  const parts = planParts(item);
  const roundWhole = (p: PlanPart): boolean => p.round && fillsFootprint(p);
  const ellipse = parts.find(roundWhole);
  shape(g, ellipse ? planPartOutline(fp, ellipse, ROUND_PICTURE_POINTS) : footprintCorners(fp), layout, FURNITURE_FILL, conflict);
  g.save();
  g.globalAlpha = PART_ALPHA;
  for (const part of ellipse ? parts.filter((p) => !roundWhole(p)) : parts) {
    trace(g, planPartOutline(fp, part, ROUND_PICTURE_POINTS), layout);
    g.strokeStyle = conflict ? CONFLICT_INK : SHAPE_STROKE;
    g.lineWidth = SHAPE_WIDTH;
    g.stroke();
  }
  g.restore();
}

/** Strokes the straight line p–q, already in pane pixels. */
function segment(g: CanvasRenderingContext2D, p: Point, q: Point, colour: string, width: number): void {
  g.beginPath();
  g.moveTo(p.x, p.y);
  g.lineTo(q.x, q.y);
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.stroke();
}

/**
 * The text cut to fit `max` pixels in the current font: whole when it fits, else its longest
 * start that fits with … after it, or null when not even one character and … fit.
 */
function fitText(g: CanvasRenderingContext2D, text: string, max: number): string | null {
  if (g.measureText(text).width <= max) return text;
  const chars = Array.from(text);
  for (let n = chars.length - 1; n >= 1; n--) {
    const cut = chars.slice(0, n).join('') + ELLIPSIS;
    if (g.measureText(cut).width <= max) return cut;
  }
  return null;
}

/** Writes a name centred on the footprint and turned with its label box, fitted to the box's width. */
function name(g: CanvasRenderingContext2D, text: string, fp: Footprint, layout: PlanLayout, conflict: boolean): void {
  const box = labelBox(fp, layout);
  g.font = NAME_FONT;
  const fitted = fitText(g, text, box.width - NAME_INSET);
  if (fitted === null) return;
  const c = toPane({ x: fp.cx, y: fp.cy }, layout);
  g.save();
  g.translate(c.x, c.y);
  g.rotate((box.rotateDeg * Math.PI) / 180);
  g.fillStyle = conflict ? CONFLICT_INK : INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(fitted, 0, 0);
  g.restore();
}

/**
 * Writes each wall's length level, outside the room, centred on the wall's outward normal `n` (unit
 * length) at `LENGTH_CLEARANCE + |n.x| × textWidth / 2 + |n.y| × LENGTH_HALF_HEIGHT` pixels from its
 * midpoint, so the nearest edge of the level text box is always LENGTH_CLEARANCE pixels from the wall
 * line: 33 px for a level wall, 19 px plus half the text's width for an upright one. The outside is
 * the normal whose point SIDE_PROBE in from the midpoint is not in the room, so it does not depend on
 * which way the corners run.
 */
function wallLengths(g: CanvasRenderingContext2D, outline: readonly Point[], units: Units, layout: PlanLayout): void {
  g.font = LENGTH_FONT;
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length];
    if (!b) return;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) return;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    const probe = { x: mid.x + n.x * SIDE_PROBE, y: mid.y + n.y * SIDE_PROBE };
    const out = pointInPolygon(probe, outline, 0) ? -1 : 1;
    const m = toPane(mid, layout);
    const label = fmtLen(len, units);
    const offset = LENGTH_CLEARANCE + (Math.abs(n.x) * g.measureText(label).width) / 2
      + Math.abs(n.y) * LENGTH_HALF_HEIGHT;
    g.fillText(label, m.x + n.x * out * offset, m.y + n.y * out * offset);
  });
}

/** Draws the whole picture; the canvas must already have planPictureSize's width and height. */
export function drawPlanPicture(g: CanvasRenderingContext2D, input: PlanPictureInput): void {
  const { outline, items, openings, obstacles, conflicts, units } = input;
  const { width, height, layout } = planPictureSize(outline);
  const conflicting = (id: string): boolean => conflicts[id] !== undefined;

  g.fillStyle = PAGE;
  g.fillRect(0, 0, width, height);

  trace(g, outline, layout);
  g.fillStyle = FLOOR;
  g.fill();

  const rugsFirst = [...items.filter((i) => i.kind === 'rug'), ...items.filter((i) => i.kind !== 'rug')];
  for (const item of rugsFirst) furniture(g, item, layout, conflicting(item.id));
  for (const o of obstacles) shape(g, obstaclePolygon(o), layout, OBSTACLE_FILL, conflicting(o.id));

  trace(g, outline, layout);
  g.strokeStyle = INK;
  g.lineWidth = WALL_WIDTH;
  g.lineJoin = 'miter';
  g.stroke();

  for (const opening of openings) {
    if (opening.kind !== 'window') continue;
    const w = windowDrawing(opening, outline, layout);
    if (!w) continue;
    segment(g, w.a, w.b, GAP, GAP_WIDTH);
    segment(g, w.a, w.b, WINDOW_LINE, WINDOW_WIDTH);
  }
  for (const opening of openings) {
    if (opening.kind !== 'door') continue;
    const d = doorDrawing(opening, outline, layout);
    if (!d) continue;
    segment(g, d.gap[0], d.gap[1], GAP, GAP_WIDTH);
    segment(g, d.leaf[0], d.leaf[1], INK, LEAF_WIDTH);
    g.strokeStyle = INK;
    g.lineWidth = ARC_WIDTH;
    g.stroke(new Path2D(d.arc));
  }

  for (const item of items) name(g, item.name, itemFootprint(item), layout, conflicting(item.id));
  for (const o of obstacles) {
    if (o.label !== '') name(g, o.label, obstacleFootprint(o), layout, conflicting(o.id));
  }

  wallLengths(g, outline, units, layout);

  g.font = CREDIT_FONT;
  g.fillStyle = CREDIT_INK;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(PLAN_PICTURE_CREDIT, MARGIN, height - CREDIT_BOTTOM);
}
