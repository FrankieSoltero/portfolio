/**
 * Blueprint (2D canvas) line drawing of the room in perspective. Pure: it draws only
 * through the context it is given and touches no globals.
 * Ported from prototype lines 578–666 (floor, grid, walls, boxes, labels).
 */
import { footprint } from '../domain/geometry';
import type { Conflicts, Item, Room, Units } from '../domain/types';
import { fmtLen, gridStepInches } from '../domain/units';
import type { Tokens } from '../styles/tokens';
import { buildBoxes, makeProjector, sortBoxes } from './blueprintScene';
import type { Box } from './blueprintScene';
import type { CameraPose, Vec3 } from './camera';

/** Everything one blueprint frame needs. `width`/`height` are the pane in CSS pixels. */
export interface BlueprintInput { room: Room; items: readonly Item[]; selectedId: string | null;
  conflicts: Conflicts; units: Units; pose: CameraPose; width: number; safeW: number;
  height: number; tokens: Tokens }

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
/** Text baseline nudge so it sits optically centred in the chip. */
const LABEL_TEXT_DY = 1;

type Project = (p: Vec3) => [number, number];

interface PolyStyle { fill?: string; stroke?: string; lineWidth?: number;
  dash?: readonly number[]; alpha?: number }

function poly(g: CanvasRenderingContext2D, P: Project, pts: readonly Vec3[], s: PolyStyle): void {
  g.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = P(p);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
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

/** Faces of `b` that point toward `cam`: x sides, y sides, then the top. */
function drawBox(g: CanvasRenderingContext2D, P: Project, b: Box, cam: Vec3, input: BlueprintInput): void {
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
  const { x0, x1, y0, y1, z0, z1 } = b;
  if (cam[0] < x0) poly(g, P, [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], { ...style, fill: sideX });
  if (cam[0] > x1) poly(g, P, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], { ...style, fill: sideX });
  if (cam[1] < y0) poly(g, P, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], { ...style, fill: sideY });
  if (cam[1] > y1) poly(g, P, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], { ...style, fill: sideY });
  if (cam[2] > z1) poly(g, P, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], { ...style, fill: top });
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
 * Draws one blueprint frame: floor, grid, far walls, rugs then painter-sorted boxes,
 * near walls dashed, and the dimension labels on top. The caller sets the device-pixel
 * transform; everything here is in CSS pixels.
 */
export function drawBlueprint(g: CanvasRenderingContext2D, input: BlueprintInput): void {
  const { room, items, units, pose, tokens: T } = input;
  g.clearRect(0, 0, input.width, input.height);
  const W = room.w;
  const L = room.l;
  const H = room.h;
  const cam = pose.position;
  const P = makeProjector(pose, input.safeW, input.height);

  poly(g, P, [[0, 0, 0], [W, 0, 0], [W, L, 0], [0, L, 0]], { fill: T.n100, stroke: T.text, lineWidth: FLOOR_LINE_WIDTH });
  const gu = gridStepInches(units);
  for (let x = gu; x < W - GRID_END_GAP; x += gu) line(g, P, [x, 0, 0], [x, L, 0], GRID_ALPHA, T.text);
  for (let y = gu; y < L - GRID_END_GAP; y += gu) line(g, P, [0, y, 0], [W, y, 0], GRID_ALPHA, T.text);

  const walls: { vis: boolean; pts: Vec3[] }[] = [
    { vis: cam[1] > 0, pts: [[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]] },
    { vis: cam[1] < L, pts: [[0, L, 0], [W, L, 0], [W, L, H], [0, L, H]] },
    { vis: cam[0] > 0, pts: [[0, 0, 0], [0, L, 0], [0, L, H], [0, 0, H]] },
    { vis: cam[0] < W, pts: [[W, 0, 0], [W, L, 0], [W, L, H], [W, 0, H]] },
  ];
  for (const w of walls.filter((wall) => wall.vis)) {
    poly(g, P, w.pts, { fill: T.a100, alpha: FAR_WALL_ALPHA });
    poly(g, P, w.pts, { stroke: T.text });
  }

  const { boxes, rugs } = buildBoxes(items);
  for (const b of [...rugs, ...sortBoxes(boxes, cam)]) drawBox(g, P, b, cam, input);

  for (const w of walls.filter((wall) => !wall.vis)) {
    poly(g, P, w.pts, { stroke: T.text, dash: NEAR_WALL_DASH, alpha: NEAR_WALL_ALPHA });
  }

  const nearY = cam[1] > L / 2;
  const nearX = cam[0] > W / 2;
  label(g, P, T, [W / 2, nearY ? L + LABEL_OUTSET : -LABEL_OUTSET, 0], fmtLen(W, units), false);
  label(g, P, T, [nearX ? W + LABEL_OUTSET : -LABEL_OUTSET, L / 2, 0], fmtLen(L, units), false);
  label(g, P, T, [nearX ? 0 : W, nearY ? 0 : L, H / 2], fmtLen(H, units), false);
  const si = items.find((i) => i.id === input.selectedId);
  if (si) {
    const [fw, fd] = footprint(si);
    label(g, P, T, [si.x + fw / 2, si.y + fd / 2, si.h + SELECTED_LABEL_LIFT],
      `${si.name} · ${fmtLen(si.h, units)} tall`, true);
  }
}
