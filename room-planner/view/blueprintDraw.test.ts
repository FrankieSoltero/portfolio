import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { obstaclePolygon } from '../domain/obstacles';
import { boundsOf } from '../domain/polygon';
import { footprintCorners, itemFootprint, roomHeight } from '../domain/shape';
import type { Footprint } from '../domain/shape';
import type { CameraState, Conflicts, Corner, Door, Item, Obstacle, Opening, Point, Units,
  WindowOpening } from '../domain/types';
import type { Tokens } from '../styles/tokens';
import { computeCameraPose } from './camera';
import type { CameraPose, Vec3 } from './camera';
import { furnishedDocument, placedItem } from '../test/fixtures';
import { buildPrisms, makeProjector } from './blueprintScene';
import { drawBlueprint } from './blueprintDraw';
import type { BlueprintInput } from './blueprintDraw';
import type { PaneRect } from './panes';

// Passthrough, so a test can give an item a footprint angle that is not a quarter turn.
vi.mock('../domain/shape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/shape')>();
  return { ...actual, itemFootprint: vi.fn(actual.itemFootprint) };
});

/** Distinct, readable stand-ins so every assertion names the token it expects. */
const T: Tokens = {
  bg: 'T-bg', text: 'T-text', n100: 'T-n100', n200: 'T-n200',
  a100: 'T-a100', a200: 'T-a200', a300: 'T-a300', a400: 'T-a400', a700: 'T-a700',
};

const PANE: PaneRect = { left: 0, top: 0, w: 900, h: 500, z: 1, inset: false, divider: false, safeW: 800 };
const CHAR_W = 7;

type Rec =
  | { type: 'call'; name: string; args: unknown[] }
  | { type: 'set'; name: string; value: unknown };

/** A 2D context stand-in that records every method call and property set, in order. */
function recordingContext(): { g: CanvasRenderingContext2D; log: Rec[] } {
  const log: Rec[] = [];
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(_t, name) {
      if (typeof name !== 'string') return undefined;
      return (...args: unknown[]) => {
        log.push({ type: 'call', name, args });
        if (name === 'measureText') return { width: String(args[0]).length * CHAR_W };
        return undefined;
      };
    },
    set(_t, name, value) {
      if (typeof name === 'string') log.push({ type: 'set', name, value });
      return true;
    },
  });
  return { g: proxy as unknown as CanvasRenderingContext2D, log };
}

/** One painted path (fill or stroke) with the context state at the moment it was painted. */
interface Paint {
  op: 'fill' | 'stroke';
  index: number;
  path: number;
  points: number;
  style: unknown;
  alpha: unknown;
  lineWidth: unknown;
  dash: unknown;
  /** The arguments of the fill or stroke call, such as the fill rule. */
  args: unknown[];
  /** The path's moveTo / lineTo points, in pane pixels. */
  coords: [number, number][];
}

interface Text { index: number; text: string; x: number; y: number; fillStyle: unknown; font: unknown;
  align: unknown; baseline: unknown }

interface Rect { index: number; args: unknown[]; fillStyle: unknown }

/** A context call that is neither a path nor a paint, such as save, clip or restore. */
interface Mark { index: number; name: string; path: number; coords: [number, number][] }

/** Replays the log, tracking context state, into paints, texts, filled rects and state marks. */
function replay(log: readonly Rec[]): { paints: Paint[]; texts: Text[]; rects: Rect[]; marks: Mark[] } {
  const state: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1 };
  let dash: unknown = [];
  let path = -1;
  let points = 0;
  let coords: [number, number][] = [];
  const paints: Paint[] = [];
  const marks: Mark[] = [];
  const texts: Text[] = [];
  const rects: Rect[] = [];
  log.forEach((r, index) => {
    if (r.type === 'set') { state[r.name] = r.value; return; }
    switch (r.name) {
      case 'beginPath': path++; points = 0; coords = []; break;
      case 'moveTo': case 'lineTo': points++; coords.push([Number(r.args[0]), Number(r.args[1])]); break;
      case 'save': case 'clip': case 'restore': marks.push({ index, name: r.name, path, coords: [...coords] }); break;
      case 'setLineDash': dash = r.args[0]; break;
      case 'fill': case 'stroke':
        paints.push({ op: r.name, index, path, points,
          style: r.name === 'fill' ? state.fillStyle : state.strokeStyle,
          alpha: state.globalAlpha, lineWidth: state.lineWidth, dash, args: r.args, coords: [...coords] });
        break;
      case 'fillText':
        texts.push({ index, text: String(r.args[0]), x: Number(r.args[1]), y: Number(r.args[2]),
          fillStyle: state.fillStyle, font: state.font, align: state.textAlign, baseline: state.textBaseline });
        break;
      case 'fillRect': rects.push({ index, args: r.args, fillStyle: state.fillStyle }); break;
    }
  });
  return { paints, texts, rects, marks };
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`no element at ${i}`);
  return v;
}

function seed(id: string): Item {
  const found = furnishedDocument().items.find((i) => i.id === id);
  if (!found) throw new Error(`missing seed item ${id}`);
  return found;
}

const RUG: Item = placedItem({ id: 'rug-1', kind: 'rug', name: 'Wool rug', w: 60, d: 40, h: 1, cx: 40, cy: 30 });
const CRATE: Item = placedItem({ id: 'crate-1', kind: 'box', name: 'Crate', w: 44, d: 30, h: 20, cx: 72, cy: 75 });

function input(over: Partial<{ items: readonly Item[]; selectedId: string | null; conflicts: Conflicts;
  units: Units; camera: CameraState; outline: readonly Corner[]; height: number; openings: readonly Opening[];
  obstacles: readonly Obstacle[] }> = {}): BlueprintInput {
  const doc = furnishedDocument();
  const camera = over.camera ?? { ...CONFIG.camera };
  const outline = over.outline ?? doc.room.outline;
  const height = over.height ?? roomHeight(doc.room);
  return {
    outline,
    height,
    items: over.items ?? doc.items,
    openings: over.openings ?? [],
    obstacles: over.obstacles ?? [],
    selectedId: over.selectedId ?? null,
    conflicts: over.conflicts ?? {},
    units: over.units ?? 'ft',
    pose: computeCameraPose(boundsOf(outline), height, camera, PANE),
    viewWidth: PANE.w,
    safeW: PANE.safeW,
    viewHeight: PANE.h,
    tokens: T,
  };
}

function draw(inp: BlueprintInput) {
  const { g, log } = recordingContext();
  drawBlueprint(g, inp);
  return { log, ...replay(log) };
}

/** Filled box faces: every fill at full opacity except the floor (path 0). */
function faceFills(paints: readonly Paint[]): Paint[] {
  return paints.filter((p) => p.op === 'fill' && p.path > 0 && p.alpha === 1);
}

/** Projects plan-space points through the frame's camera. */
function projectAll(inp: BlueprintInput, pts: readonly Vec3[]): [number, number][] {
  const P = makeProjector(inp.pose, inp.safeW, inp.viewHeight);
  return pts.map((p) => P(p));
}

/** The same pane points in any order, to 6 decimal places. */
function expectSamePoints(actual: readonly [number, number][], expected: readonly [number, number][]): void {
  const key = (q: readonly [number, number]) => `${q[0].toFixed(6)},${q[1].toFixed(6)}`;
  expect(actual.map(key).sort()).toEqual(expected.map(key).sort());
}

function pointKeys(pts: readonly [number, number][]): string[] {
  return pts.map((q) => `${q[0].toFixed(6)},${q[1].toFixed(6)}`).sort();
}

function sameKeys(a: readonly [number, number][], b: readonly [number, number][]): boolean {
  return JSON.stringify(pointKeys(a)) === JSON.stringify(pointKeys(b));
}

/** The fill colour of the one painted face whose corners are `quad` (in any order). */
function styleOfFace(faces: readonly Paint[], quad: readonly [number, number][]): unknown {
  const match = faces.filter((f) => sameKeys(f.coords, quad));
  expect(match).toHaveLength(1);
  return match[0]?.style;
}

/** The same pane points in the same order, to 6 decimal places. */
function expectPoints(actual: readonly [number, number][], expected: readonly [number, number][]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((q, i) => {
    expect(q[0]).toBeCloseTo(expected[i]?.[0] ?? NaN, 6);
    expect(q[1]).toBeCloseTo(expected[i]?.[1] ?? NaN, 6);
  });
}

/** A wall's quad: both ends on the floor and at the ceiling. */
function wallQuad(a: Point, b: Point, h: number): Vec3[] {
  return [[a.x, a.y, 0], [b.x, b.y, 0], [b.x, b.y, h], [a.x, a.y, h]];
}

/** An L-shaped room in the 144 × 168 bounding box; the notch is at the bottom right. */
const L_ROOM: readonly Corner[] = [
  { id: 'l1', x: 0, y: 0 }, { id: 'l2', x: 144, y: 0 }, { id: 'l3', x: 144, y: 96 }, { id: 'l4', x: 72, y: 96 },
  { id: 'l5', x: 72, y: 168 }, { id: 'l6', x: 0, y: 168 },
];
/** A room off the origin with its top-right corner cut: bounds 20..160 × 10..180. */
const CUT_ROOM: readonly Corner[] = [
  { id: 'k1', x: 20, y: 10 }, { id: 'k2', x: 120, y: 10 }, { id: 'k3', x: 160, y: 50 }, { id: 'k4', x: 160, y: 180 },
  { id: 'k5', x: 20, y: 180 },
];

function strokeOfPath(paints: readonly Paint[], path: number): Paint | undefined {
  return paints.find((p) => p.op === 'stroke' && p.path === path);
}

/** Two-point stroked paths at the grid opacity. */
function gridLines(paints: readonly Paint[]): Paint[] {
  return paints.filter((p) => p.op === 'stroke' && p.points === 2 && p.alpha === 0.09);
}

describe('drawBlueprint', () => {
  it('clears the whole pane before drawing anything', () => {
    const { log } = draw(input());
    expect(log[0]).toEqual({ type: 'call', name: 'clearRect', args: [0, 0, PANE.w, PANE.h] });
  });

  it('fills the floor with n100 first and outlines it in text at line width 1.5', () => {
    const { paints } = draw(input());
    const firstFill = paints.find((p) => p.op === 'fill');
    expect(firstFill).toMatchObject({ style: T.n100, points: 4, alpha: 1 });
    expect(strokeOfPath(paints, firstFill?.path ?? -1)).toMatchObject({ style: T.text, lineWidth: 1.5 });
  });

  it('strokes 11 + 13 one-foot grid lines at alpha 0.09 for a 144 × 168 room in ft', () => {
    const lines = gridLines(draw(input()).paints);
    expect(lines).toHaveLength(24);
    for (const l of lines) expect(l).toMatchObject({ style: T.text, lineWidth: 1 });
  });

  it('strokes 7 + 8 fifty-centimetre grid lines in metric', () => {
    expect(gridLines(draw(input({ units: 'm' })).paints)).toHaveLength(15);
  });

  it('fills the two far walls a100 at alpha 0.6, each then outlined in text', () => {
    const { paints } = draw(input());
    const wallFills = paints.filter((p) => p.op === 'fill' && p.alpha === 0.6);
    expect(wallFills).toHaveLength(2);
    for (const w of wallFills) {
      expect(w).toMatchObject({ style: T.a100, points: 4 });
      const outline = paints.find((p) => p.op === 'stroke' && p.path === w.path + 1);
      expect(outline).toMatchObject({ style: T.text, alpha: 1, lineWidth: 1, points: 4 });
    }
  });

  it('strokes the two near walls dashed [4, 5] at alpha 0.35, unfilled, after every box', () => {
    const { paints } = draw(input());
    const near = paints.filter((p) => p.op === 'stroke' && JSON.stringify(p.dash) === '[4,5]');
    expect(near).toHaveLength(2);
    const lastFill = Math.max(...paints.filter((p) => p.op === 'fill').map((p) => p.index));
    for (const w of near) {
      expect(w).toMatchObject({ style: T.text, alpha: 0.35, points: 4 });
      expect(paints.some((p) => p.op === 'fill' && p.path === w.path)).toBe(false);
      expect(w.index).toBeGreaterThan(lastFill);
    }
  });

  it('draws rug faces before any other box face and the labels last', () => {
    const { paints, rects, texts } = draw(input({ items: [...furnishedDocument().items, RUG] }));
    const faces = faceFills(paints);
    // The rug, seen from the default camera: its x0 side, its y1 side, then its top.
    expect(faces.slice(0, 3).map((f) => f.style)).toEqual([T.n200, T.a200, T.a100]);
    expect(faces.slice(3).some((f) => f.style === T.a100)).toBe(false);
    expect(faces.slice(3).some((f) => f.style === T.bg)).toBe(true);
    const lastPaint = Math.max(...paints.map((p) => p.index));
    expect(Math.min(...rects.map((r) => r.index), ...texts.map((t) => t.index))).toBeGreaterThan(lastPaint);
  });

  it('draws the top and only the camera-facing sides of each box', () => {
    // Default camera is at x < 0 and y > L, above the room: x0 side, y1 side, top.
    const corner = faceFills(draw(input({ items: [CRATE] })).paints);
    expect(corner.map((f) => f.style)).toEqual([T.n200, T.a200, T.bg]);
    // yaw 0 puts the camera at x = W / 2, inside the crate's x span: y1 side and top only.
    const front = faceFills(draw(input({ items: [CRATE], camera: { ...CONFIG.camera, yaw: 0 } })).paints);
    expect(front.map((f) => f.style)).toEqual([T.a200, T.bg]);
  });

  it('paints an unselected box with bg top, n200 / a200 sides, stroked text at width 1', () => {
    const { paints } = draw(input({ items: [CRATE] }));
    const faces = faceFills(paints);
    expect(faces).toHaveLength(3);
    for (const f of faces) {
      expect(f.points).toBe(4);
      expect(strokeOfPath(paints, f.path)).toMatchObject({ style: T.text, lineWidth: 1, dash: [] });
    }
  });

  it('gives a rug an a100 top', () => {
    const faces = faceFills(draw(input({ items: [RUG] })).paints);
    expect(faces.at(-1)?.style).toBe(T.a100);
  });

  it('paints the selected desk a200 / a300 / a400, stroked a700 at width 1.6', () => {
    const { paints } = draw(input({ items: [seed('seed-desk')], selectedId: 'seed-desk' }));
    const faces = faceFills(paints);
    expect(faces.length).toBeGreaterThan(0);
    const styles = new Set(faces.map((f) => f.style));
    expect([...styles].every((s) => s === T.a200 || s === T.a300 || s === T.a400)).toBe(true);
    expect(styles.has(T.a200)).toBe(true);
    for (const f of faces) expect(strokeOfPath(paints, f.path)).toMatchObject({ style: T.a700, lineWidth: 1.6 });
  });

  it('strokes the faces of a conflicting desk dashed [5, 4]', () => {
    const { paints } = draw(input({ items: [seed('seed-desk')], conflicts: { 'seed-desk': 'Overlaps' } }));
    const faces = faceFills(paints);
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) {
      expect(f.dash).toEqual([5, 4]);
      expect(strokeOfPath(paints, f.path)?.dash).toEqual([5, 4]);
    }
  });

  it('labels the room width, length and height on bg chips at the near edges', () => {
    const inp = input();
    const { texts, rects } = draw(inp);
    expect(texts.map((t) => t.text)).toEqual(['12′ 0″', '14′ 0″', '8′ 0″']);
    const P = makeProjector(inp.pose, PANE.safeW, PANE.h);
    // Default camera: nearY (cam y > L / 2), not nearX (cam x < W / 2).
    const expected = [P([72, 178, 0]), P([-10, 84, 0]), P([144, 0, 48])];
    texts.forEach((t, i) => {
      const q = expected[i] ?? [NaN, NaN];
      expect(t.x).toBeCloseTo(q[0], 9);
      expect(t.y).toBeCloseTo(q[1] + 1, 9);
      expect(t).toMatchObject({ fillStyle: T.text, font: '600 13px "Barlow Condensed", system-ui, sans-serif',
        align: 'center', baseline: 'middle' });
      const w = t.text.length * CHAR_W + 12;
      expect(rects[i]).toMatchObject({ fillStyle: T.bg });
      const args = rects[i]?.args ?? [];
      expect(args[0]).toBeCloseTo(q[0] - w / 2, 9);
      expect(args[1]).toBeCloseTo(q[1] - 10, 9);
      expect(args.slice(2)).toEqual([w, 20]);
    });
  });

  it('labels the selected item with its name and height on an a700 chip', () => {
    const inp = input({ selectedId: 'seed-desk' });
    const { texts, rects } = draw(inp);
    const label = texts.at(-1);
    expect(label).toMatchObject({ text: 'Tack writing desk · 2′ 6″ tall', fillStyle: T.bg });
    expect(texts).toHaveLength(4);
    expect(rects.at(-1)?.fillStyle).toBe(T.a700);
    // The desk is rotated a quarter turn: footprint 26 × 55, label 8 in above its top.
    const q = makeProjector(inp.pose, PANE.safeW, PANE.h)([118 + 13, 104 + 27.5, 38]);
    expect(label?.x).toBeCloseTo(q[0], 9);
    expect(label?.y).toBeCloseTo(q[1] + 1, 9);
  });

  it('fills and strokes the floor along the outline', () => {
    const inp = input({ outline: CUT_ROOM, items: [] });
    const { paints } = draw(inp);
    const floor = paints.find((p) => p.op === 'fill');
    expect(floor).toMatchObject({ style: T.n100, path: 0, points: 5 });
    const expected = projectAll(inp, CUT_ROOM.map((c): Vec3 => [c.x, c.y, 0]));
    expectPoints(floor?.coords ?? [], expected);
    expect(strokeOfPath(paints, 0)).toMatchObject({ style: T.text, lineWidth: 1.5 });
  });

  it('spans the grid over the bounding box and clips it to the floor polygon', () => {
    const inp = input({ outline: CUT_ROOM, items: [] });
    const { paints, marks } = draw(inp);
    const lines = gridLines(paints);
    // x = 32 … 152 (11 lines) and y = 22 … 178 (14 lines), one foot apart from the bounds' corner.
    expect(lines).toHaveLength(25);
    expectPoints(at(lines, 0).coords, projectAll(inp, [[32, 10, 0], [32, 180, 0]]));
    expectPoints(at(lines, 10).coords, projectAll(inp, [[152, 10, 0], [152, 180, 0]]));
    expectPoints(at(lines, 11).coords, projectAll(inp, [[20, 22, 0], [160, 22, 0]]));
    expectPoints(at(lines, 24).coords, projectAll(inp, [[20, 178, 0], [160, 178, 0]]));
    expect(marks.map((m) => m.name)).toEqual(['save', 'clip', 'restore']);
    const [save, clip, restore] = [at(marks, 0), at(marks, 1), at(marks, 2)];
    expectPoints(clip.coords, projectAll(inp, CUT_ROOM.map((c): Vec3 => [c.x, c.y, 0])));
    const firstLine = Math.min(...lines.map((l) => l.index));
    const lastLine = Math.max(...lines.map((l) => l.index));
    expect(save.index).toBeLessThan(clip.index);
    expect(clip.index).toBeLessThan(firstLine);
    expect(restore.index).toBeGreaterThan(lastLine);
    expect(paints.filter((p) => p.index > save.index && p.index < restore.index).every((p) => lines.includes(p)))
      .toBe(true);
  });

  it('fills the far walls far to near before the furniture and dashes the near walls after it', () => {
    const inp = input({ outline: L_ROOM, items: [CRATE] });
    const { paints } = draw(inp);
    const corner = (i: number) => at(L_ROOM, i);
    const quad = (i: number) => projectAll(inp, wallQuad(corner(i), corner((i + 1) % L_ROOM.length), 96));
    // Camera ≈ (−121, 338): walls 0, 1 and 3 have it on their inward side. Midpoint
    // distances: wall 1 (144, 48) is farthest, then wall 0 (72, 0), then wall 3 (72, 132).
    const far = paints.filter((p) => p.op === 'fill' && p.alpha === 0.6);
    expect(far).toHaveLength(3);
    [1, 0, 3].forEach((wall, k) => {
      const f = at(far, k);
      expect(f).toMatchObject({ style: T.a100, points: 4 });
      expectSamePoints(f.coords, quad(wall));
      expect(paints.find((p) => p.op === 'stroke' && p.path === f.path + 1)).toMatchObject({ style: T.text, alpha: 1 });
    });
    const faces = faceFills(paints);
    const firstFace = Math.min(...faces.map((f) => f.index));
    const lastFace = Math.max(...faces.map((f) => f.index));
    for (const f of far) expect(f.index).toBeLessThan(firstFace);
    const near = paints.filter((p) => p.op === 'stroke' && JSON.stringify(p.dash) === '[4,5]');
    expect(near).toHaveLength(3);
    [2, 4, 5].forEach((wall, k) => {
      const n = at(near, k);
      expect(n).toMatchObject({ style: T.text, alpha: 0.35, points: 4 });
      expect(n.index).toBeGreaterThan(lastFace);
      expectSamePoints(n.coords, quad(wall));
    });
  });

  it('colours sides facing plan x n200 and sides facing plan y a200, unturned and at a quarter turn', () => {
    const P = (inp: BlueprintInput, pts: readonly Vec3[]) => projectAll(inp, pts);
    // Unturned crate, x 50–94, y 60–90: its left (x = 50) and front (y = 90) face the camera.
    const flat = input({ items: [CRATE] });
    const flatFaces = faceFills(draw(flat).paints);
    expect(flatFaces.map((f) => f.style)).toEqual([T.n200, T.a200, T.bg]);
    expectSamePoints(at(flatFaces, 0).coords, P(flat, [[50, 60, 0], [50, 90, 0], [50, 90, 20], [50, 60, 20]]));
    expectSamePoints(at(flatFaces, 1).coords, P(flat, [[50, 90, 0], [94, 90, 0], [94, 90, 20], [50, 90, 20]]));
    // A quarter turn, x 50–80, y 60–104: as in slice A, plan side x = 50 is n200 and
    // plan side y = 104 is a200, although they are now the crate's front and right.
    const turned = input({ items: [{ ...CRATE, x: 65, y: 82, angle: 90 }] });
    const turnedFaces = faceFills(draw(turned).paints);
    expect(turnedFaces).toHaveLength(3);
    expect(styleOfFace(turnedFaces, P(turned, [[50, 60, 0], [50, 104, 0], [50, 104, 20], [50, 60, 20]]))).toBe(T.n200);
    expect(styleOfFace(turnedFaces, P(turned, [[50, 104, 0], [80, 104, 0], [80, 104, 20], [50, 104, 20]]))).toBe(T.a200);
    expect(styleOfFace(turnedFaces, P(turned, [[50, 60, 20], [80, 60, 20], [80, 104, 20], [50, 104, 20]]))).toBe(T.bg);
  });

  it('colours a selected quarter-turned prism a300 on its plan-x side and a400 on its plan-y side', () => {
    const inp = input({ items: [{ ...CRATE, x: 65, y: 82, angle: 90 }], selectedId: 'crate-1' });
    const faces = faceFills(draw(inp).paints);
    expect(faces).toHaveLength(3);
    expect(styleOfFace(faces, projectAll(inp, [[50, 60, 0], [50, 104, 0], [50, 104, 20], [50, 60, 20]]))).toBe(T.a300);
    expect(styleOfFace(faces, projectAll(inp, [[50, 104, 0], [80, 104, 0], [80, 104, 20], [50, 104, 20]])))
      .toBe(T.a400);
    expect(styleOfFace(faces, projectAll(inp, [[50, 60, 20], [80, 60, 20], [80, 104, 20], [50, 104, 20]])))
      .toBe(T.a200);
  });

  // Edge i runs from corner i to corner i + 1 (0 back, 1 right, 2 front, 3 left). Turned
  // clockwise by θ, the outward normals are back (sin θ, −cos θ), right (cos θ, sin θ),
  // front (−sin θ, cos θ), left (−cos θ, −sin θ).
  // 30°: back (0.5, −0.87) and front face mostly plan y → a200; right (0.87, 0.5) and left → n200.
  // 60°: back (0.87, −0.5) and front face mostly plan x → n200; right (0.5, 0.87) and left → a200.
  it.each([
    { angle: 30, colours: [T.a200, T.n200, T.a200, T.n200] },
    { angle: 60, colours: [T.n200, T.a200, T.n200, T.a200] },
  ])('colours each side of a prism at $angle° by the plan axis its normal is closer to', async ({ angle, colours }) => {
    const actual = await vi.importActual<typeof import('../domain/shape')>('../domain/shape');
    const fp: Footprint = { ...actual.itemFootprint(CRATE), angle };
    vi.mocked(itemFootprint).mockImplementation(() => fp);
    try {
      const corners = footprintCorners(fp);
      const seen = new Set<number>();
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, CONFIG.camera.yaw]) {
        const inp = input({ items: [CRATE], camera: { ...CONFIG.camera, yaw } });
        const sides = faceFills(draw(inp).paints).filter((f) => f.style !== T.bg);
        expect(sides.length).toBeGreaterThan(0);
        for (const f of sides) {
          const edge = corners.findIndex((a, i) => {
            const c = at(corners, (i + 1) % 4);
            return sameKeys(f.coords, projectAll(inp, [[a.x, a.y, 0], [c.x, c.y, 0], [c.x, c.y, 20], [a.x, a.y, 20]]));
          });
          expect(edge).toBeGreaterThanOrEqual(0);
          expect(f.style).toBe(colours[edge]);
          seen.add(edge);
        }
      }
      expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    } finally {
      vi.mocked(itemFootprint).mockImplementation(actual.itemFootprint);
    }
  });

  it('leaves out the top of a prism that reaches above the camera', () => {
    const faces = faceFills(draw(input({ items: [{ ...CRATE, h: 400 }] })).paints);
    expect(faces.map((f) => f.style)).toEqual([T.n200, T.a200]);
  });

  it('labels the bounding-box size at its near sides and the height at the farthest corner', () => {
    const inp = input({ outline: CUT_ROOM });
    const { texts } = draw(inp);
    // Bounds 140 × 170 centred on (90, 95); camera ≈ (−102, 348): near sides are y = 180 and x = 20.
    // The farthest outline corner from the camera is (120, 10).
    expect(texts.map((t) => t.text)).toEqual(['11′ 8″', '14′ 2″', '8′ 0″']);
    const expected = projectAll(inp, [[90, 190, 0], [10, 95, 0], [120, 10, 48]]);
    texts.forEach((t, i) => {
      expect(t.x).toBeCloseTo(expected[i]?.[0] ?? NaN, 9);
      expect(t.y).toBeCloseTo((expected[i]?.[1] ?? NaN) + 1, 9);
    });
  });
});

/** The seed room's corners: 144 × 168 × 96; walls c1 (top) and c2 (right) are far from the default camera. */
const ROOM = furnishedDocument().room.outline;
const corner = (id: string): Corner => {
  const c = ROOM.find((k) => k.id === id);
  if (!c) throw new Error(`missing corner ${id}`);
  return c;
};
const nextCorner = (id: string): Corner => at(ROOM, (ROOM.findIndex((k) => k.id === id) + 1) % ROOM.length);

const DOOR: Door = { id: 'door-1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
const WINDOW: WindowOpening = { id: 'win-1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 36, height: 48 };

/** A hole's rectangle on the wall starting at corner `wallId`: x along the wall, z up. */
function holeQuad(wallId: string, x0: number, x1: number, z0: number, z1: number): Vec3[] {
  const a = corner(wallId);
  const b = nextCorner(wallId);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const p = (x: number, z: number): Vec3 => [a.x + u.x * x, a.y + u.y * x, z];
  return [p(x0, z0), p(x1, z0), p(x1, z1), p(x0, z1)];
}

/** The mid-height line across a hole on the wall starting at corner `wallId`. */
function midLine(wallId: string, x0: number, x1: number, z0: number, z1: number): Vec3[] {
  const q = holeQuad(wallId, x0, x1, z0, z1);
  const z = (z0 + z1) / 2;
  return [[at(q, 0)[0], at(q, 0)[1], z], [at(q, 1)[0], at(q, 1)[1], z]];
}

/** Non-grid two-point strokes: the mid lines of window holes. */
function midLines(paints: readonly Paint[]): Paint[] {
  return paints.filter((p) => p.op === 'stroke' && p.points === 2 && p.alpha !== 0.09);
}

function nearStrokes(paints: readonly Paint[]): Paint[] {
  return paints.filter((p) => p.op === 'stroke' && JSON.stringify(p.dash) === '[4,5]');
}

describe('drawBlueprint wall holes', () => {
  it('fills a far wall with a door as one evenodd path with the hole inside, then strokes wall and hole', () => {
    const inp = input({ items: [], openings: [DOOR] });
    const { paints } = draw(inp);
    const far = paints.filter((p) => p.op === 'fill' && p.alpha === 0.6);
    expect(far).toHaveLength(2);
    const holed = far.filter((p) => p.points === 8);
    expect(holed).toHaveLength(1);
    const wall = at(holed, 0);
    expect(wall).toMatchObject({ style: T.a100, args: ['evenodd'] });
    expectPoints(wall.coords.slice(0, 4), projectAll(inp, wallQuad(corner('c1'), corner('c2'), 96)));
    const hole = projectAll(inp, holeQuad('c1', 20, 52, 0, 80));
    expectSamePoints(wall.coords.slice(4), hole);
    // The other far wall keeps its plain fill.
    const plain = at(far.filter((p) => p !== wall), 0);
    expect(plain).toMatchObject({ points: 4, args: [] });
    // The wall's outline, then the hole's edges, stroked like the wall outline and not filled.
    expect(strokeOfPath(paints, wall.path + 1)).toMatchObject({ style: T.text, alpha: 1, lineWidth: 1, points: 4 });
    expectPoints(strokeOfPath(paints, wall.path + 1)?.coords ?? [],
      projectAll(inp, wallQuad(corner('c1'), corner('c2'), 96)));
    const edge = strokeOfPath(paints, wall.path + 2);
    expect(edge).toMatchObject({ style: T.text, alpha: 1, lineWidth: 1, points: 4, dash: [] });
    expectSamePoints(edge?.coords ?? [], hole);
    expect(paints.some((p) => p.op === 'fill' && p.path === wall.path + 2)).toBe(false);
    expect(midLines(paints)).toHaveLength(0);
  });

  it('cuts every hole of a wall into its fill and strokes each one', () => {
    const second: Opening = { ...WINDOW, id: 'win-2', wallId: 'c1', offset: 80 };
    const inp = input({ items: [], openings: [DOOR, second] });
    const { paints } = draw(inp);
    const wall = at(paints.filter((p) => p.op === 'fill' && p.alpha === 0.6 && p.points === 12), 0);
    expect(wall.args).toEqual(['evenodd']);
    expectSamePoints(wall.coords.slice(4, 8), projectAll(inp, holeQuad('c1', 20, 52, 0, 80)));
    expectSamePoints(wall.coords.slice(8), projectAll(inp, holeQuad('c1', 80, 116, 36, 84)));
    expectSamePoints(strokeOfPath(paints, wall.path + 2)?.coords ?? [], projectAll(inp, holeQuad('c1', 20, 52, 0, 80)));
    expectSamePoints(strokeOfPath(paints, wall.path + 3)?.coords ?? [],
      projectAll(inp, holeQuad('c1', 80, 116, 36, 84)));
  });

  it('strokes a hole in a near wall with the near walls\' dashed style', () => {
    const inp = input({ items: [], openings: [{ ...DOOR, wallId: 'c3' }] });
    const { paints } = draw(inp);
    const near = nearStrokes(paints);
    expect(near).toHaveLength(3);
    const wall = at(near.filter((p) => sameKeys(p.coords, projectAll(inp, wallQuad(corner('c3'), corner('c4'), 96)))), 0);
    const hole = strokeOfPath(paints, wall.path + 1);
    expect(hole).toMatchObject({ style: T.text, alpha: 0.35, lineWidth: 1, points: 4, dash: [4, 5] });
    expectSamePoints(hole?.coords ?? [], projectAll(inp, holeQuad('c3', 20, 52, 0, 80)));
    expect(paints.some((p) => p.op === 'fill' && p.path === hole?.path)).toBe(false);
    // The far walls are untouched.
    expect(paints.filter((p) => p.op === 'fill' && p.alpha === 0.6).map((p) => p.points)).toEqual([4, 4]);
  });

  it('draws a line across a far window at mid-height, after its edges', () => {
    const inp = input({ items: [], openings: [WINDOW] });
    const { paints } = draw(inp);
    const wall = at(paints.filter((p) => p.op === 'fill' && p.points === 8), 0);
    const lines = midLines(paints);
    expect(lines).toHaveLength(1);
    const mid = at(lines, 0);
    expect(mid).toMatchObject({ style: T.text, alpha: 1, lineWidth: 1, dash: [] });
    expect(mid.path).toBe(wall.path + 3);
    expectPoints(mid.coords, projectAll(inp, midLine('c2', 100, 136, 36, 84)));
  });

  it('draws a dashed mid-height line across a near window', () => {
    const inp = input({ items: [], openings: [{ ...WINDOW, wallId: 'c4', offset: 20 }] });
    const { paints } = draw(inp);
    const lines = midLines(paints);
    expect(lines).toHaveLength(1);
    expect(at(lines, 0)).toMatchObject({ style: T.text, alpha: 0.35, dash: [4, 5] });
    expectPoints(at(lines, 0).coords, projectAll(inp, midLine('c4', 20, 56, 36, 84)));
  });

  it('makes the same canvas calls as with no openings when an opening\'s wall is not in the outline', () => {
    const plain = draw(input()).log;
    expect(draw(input({ openings: [{ ...DOOR, wallId: 'gone' }] })).log).toEqual(plain);
  });
});

/** A fixed obstacle with the given shape and size, centred at (x, y). */
function obstacle(id: string, shape: Obstacle['shape'], x: number, y: number, width: number, depth: number,
  height: number, elevation = 0): Obstacle {
  return { id, shape, label: '', x, y, rotation: 0, width, depth, height, elevation };
}

/** The frame's input with the camera moved to `position`, looking at the same target. */
function withCamera(inp: BlueprintInput, position: Vec3): BlueprintInput {
  const pose: CameraPose = { ...inp.pose, position };
  return { ...inp, pose };
}

describe('drawBlueprint obstacles', () => {
  // Unturned crate, x 50–94, y 60–90, 20 tall.
  it('paints an obstacle box in neutral fills: n200 plan-x side, bg plan-y side, n100 top', () => {
    const { paints } = draw(input({ items: [], obstacles: [obstacle('ob-1', 'box', 72, 84, 20, 10, 30)] }));
    const faces = faceFills(paints);
    expect(faces.map((f) => f.style)).toEqual([T.n200, T.bg, T.n100]);
    for (const f of faces) {
      expect(f.points).toBe(4);
      expect(strokeOfPath(paints, f.path)).toMatchObject({ style: T.text, lineWidth: 1, dash: [] });
    }
  });

  it('sorts obstacles with the furniture: drawn after a crate it stands in front of, before one it hides behind', () => {
    const front = obstacle('ob-1', 'box', 70, 115, 20, 10, 30);
    const behind = obstacle('ob-1', 'box', 70, 25, 20, 10, 30);
    const crate = [T.n200, T.a200, T.bg];
    const ob = [T.n200, T.bg, T.n100];
    expect(faceFills(draw(input({ items: [CRATE], obstacles: [front] })).paints).map((f) => f.style))
      .toEqual([...crate, ...ob]);
    expect(faceFills(draw(input({ items: [CRATE], obstacles: [behind] })).paints).map((f) => f.style))
      .toEqual([...ob, ...crate]);
  });

  it('draws a column\'s camera-facing sides in index order, coloured by the plan axis each faces, then its top', () => {
    const column = obstacle('col-1', 'cylinder', 72, 84, 20, 20, 30);
    const inp = input({ items: [], obstacles: [column] });
    const faces = faceFills(draw(inp).paints);
    const cam = inp.pose.position;
    const pts = obstaclePolygon(column);
    const expected = pts.flatMap((a, i) => {
      const c = at(pts, (i + 1) % pts.length);
      const facing = (cam[0] - a.x) * (c.y - a.y) - (cam[1] - a.y) * (c.x - a.x) > 0;
      if (!facing) return [];
      return [{ style: Math.abs(c.y - a.y) > Math.abs(c.x - a.x) ? T.n200 : T.bg,
        coords: projectAll(inp, [[a.x, a.y, 0], [c.x, c.y, 0], [c.x, c.y, 30], [a.x, a.y, 30]]) }];
    });
    expect(expected.length).toBeGreaterThan(4);
    expect(new Set(expected.map((e) => e.style))).toEqual(new Set([T.n200, T.bg]));
    expect(faces).toHaveLength(expected.length + 1);
    expected.forEach((e, k) => {
      expect(at(faces, k).style).toBe(e.style);
      expectPoints(at(faces, k).coords, e.coords);
    });
    const top = at(faces, expected.length);
    expect(top).toMatchObject({ style: T.n100, points: 16 });
    expectPoints(top.coords, projectAll(inp, pts.map((p): Vec3 => [p.x, p.y, 30])));
  });

  it('draws a raised obstacle\'s underside only when the camera is below it, and its top only from above', () => {
    const raised = obstacle('ob-1', 'box', 72, 84, 20, 10, 30, 40);
    const base = input({ items: [], obstacles: [raised] });
    const [cx, cy] = base.pose.position;
    const pts = obstaclePolygon(raised);
    const flat = (inp: BlueprintInput, z: number) => projectAll(inp, pts.map((p): Vec3 => [p.x, p.y, z]));

    const below = withCamera(base, [cx, cy, 20]);
    const fromBelow = faceFills(draw(below).paints);
    const under = at(fromBelow, fromBelow.length - 1);
    expect(under).toMatchObject({ style: T.n100, points: 4 });
    expectPoints(under.coords, flat(below, 40));
    expect(fromBelow.some((f) => sameKeys(f.coords, flat(below, 70)))).toBe(false);

    const above = withCamera(base, [cx, cy, 200]);
    const fromAbove = faceFills(draw(above).paints);
    expectPoints(at(fromAbove, fromAbove.length - 1).coords, flat(above, 70));
    expect(fromAbove.some((f) => sameKeys(f.coords, flat(above, 40)))).toBe(false);

    const level = withCamera(base, [cx, cy, 55]);
    const fromLevel = faceFills(draw(level).paints);
    expect(fromLevel.some((f) => sameKeys(f.coords, flat(level, 40)) || sameKeys(f.coords, flat(level, 70)))).toBe(false);
    expect(fromLevel.length).toBeGreaterThan(0);
  });

  it('never draws the underside of an obstacle standing on the floor', () => {
    const grounded = obstacle('ob-1', 'box', 72, 84, 20, 10, 30);
    const base = input({ items: [], obstacles: [grounded] });
    const inp = withCamera(base, [base.pose.position[0], base.pose.position[1], -10]);
    const pts = obstaclePolygon(grounded);
    const faces = faceFills(draw(inp).paints);
    expect(faces.some((f) => sameKeys(f.coords, projectAll(inp, pts.map((p): Vec3 => [p.x, p.y, 0]))))).toBe(false);
  });

  it('never draws the underside of raised furniture, even with the camera below it', () => {
    // The desk's top part runs from 0.93 × 30 = 27.9 in to 30 in.
    const desk = placedItem({ id: 'desk-1', kind: 'desk', name: 'Desk', w: 48, d: 24, h: 30, cx: 72, cy: 84 });
    const raised = buildPrisms([desk]).prisms.filter((p) => p.z0 > 0);
    expect(raised).toHaveLength(1);
    const top = at(raised, 0);
    expect(top.z0).toBeCloseTo(27.9, 9);
    const base = input({ items: [desk] });
    const inp = withCamera(base, [base.pose.position[0], base.pose.position[1], 10]);
    const underside = projectAll(inp, top.pts.map((p): Vec3 => [p.x, p.y, top.z0]));
    const faces = faceFills(draw(inp).paints);
    expect(faces.length).toBeGreaterThan(0);
    expect(faces.some((f) => sameKeys(f.coords, underside))).toBe(false);
    // Only the camera-facing sides of the desk's three parts are painted: no top, no underside.
    expect(faces.every((f) => f.points === 4 && f.style !== T.bg)).toBe(true);
  });

  it('strokes a conflicted obstacle dashed [5, 4]', () => {
    const { paints } = draw(input({ items: [], obstacles: [obstacle('ob-1', 'box', 72, 84, 20, 10, 30)],
      conflicts: { 'ob-1': 'Blocks a door' } }));
    const faces = faceFills(paints);
    expect(faces).toHaveLength(3);
    for (const f of faces) {
      expect(f.dash).toEqual([5, 4]);
      expect(strokeOfPath(paints, f.path)?.dash).toEqual([5, 4]);
    }
  });
});
