import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import { boundsOf } from '../domain/polygon';
import { roomHeight, roomOutline } from '../domain/shape';
import type { CameraState, Conflicts, Item, Point, Units } from '../domain/types';
import type { Tokens } from '../styles/tokens';
import { computeCameraPose } from './camera';
import type { Vec3 } from './camera';
import { makeProjector } from './blueprintScene';
import { drawBlueprint } from './blueprintDraw';
import type { BlueprintInput } from './blueprintDraw';
import type { PaneRect } from './panes';

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
          alpha: state.globalAlpha, lineWidth: state.lineWidth, dash, coords: [...coords] });
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
  const found = createInitialDocument().items.find((i) => i.id === id);
  if (!found) throw new Error(`missing seed item ${id}`);
  return found;
}

const RUG: Item = { ...seed('seed-bed'), id: 'rug-1', kind: 'rug', name: 'Wool rug', w: 60, d: 40, h: 1, x: 10, y: 10, rot: 0 };
const CRATE: Item = { ...seed('seed-bed'), id: 'crate-1', kind: 'box', name: 'Crate', w: 44, d: 30, h: 20, x: 50, y: 60, rot: 0 };

function input(over: Partial<{ items: readonly Item[]; selectedId: string | null; conflicts: Conflicts;
  units: Units; camera: CameraState; outline: readonly Point[]; height: number }> = {}): BlueprintInput {
  const doc = createInitialDocument();
  const camera = over.camera ?? { ...CONFIG.camera };
  const outline = over.outline ?? roomOutline(doc.room);
  const height = over.height ?? roomHeight(doc.room);
  return {
    outline,
    height,
    items: over.items ?? doc.items,
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
const L_ROOM: readonly Point[] = [
  { x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 96 }, { x: 72, y: 96 }, { x: 72, y: 168 }, { x: 0, y: 168 },
];
/** A room off the origin with its top-right corner cut: bounds 20..160 × 10..180. */
const CUT_ROOM: readonly Point[] = [
  { x: 20, y: 10 }, { x: 120, y: 10 }, { x: 160, y: 50 }, { x: 160, y: 180 }, { x: 20, y: 180 },
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
    const { paints, rects, texts } = draw(input({ items: [...createInitialDocument().items, RUG] }));
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

  it('colours prism sides by edge: back and front a200, right and left n200, for any quarter turn', () => {
    const P = (inp: BlueprintInput, pts: readonly Vec3[]) => projectAll(inp, pts);
    // Unturned crate, x 50–94, y 60–90: its left (x = 50) and front (y = 90) face the camera.
    const flat = input({ items: [CRATE] });
    const flatFaces = faceFills(draw(flat).paints);
    expect(flatFaces.map((f) => f.style)).toEqual([T.n200, T.a200, T.bg]);
    expectSamePoints(at(flatFaces, 0).coords, P(flat, [[50, 60, 0], [50, 90, 0], [50, 90, 20], [50, 60, 20]]));
    expectSamePoints(at(flatFaces, 1).coords, P(flat, [[50, 90, 0], [94, 90, 0], [94, 90, 20], [50, 90, 20]]));
    // A quarter turn, x 50–80, y 60–104: plan side y = 104 is now the crate's right (n200)
    // and plan side x = 50 its front (a200).
    const turned = input({ items: [{ ...CRATE, rot: 1 }] });
    const turnedFaces = faceFills(draw(turned).paints);
    expect(turnedFaces.map((f) => f.style)).toEqual([T.n200, T.a200, T.bg]);
    expectSamePoints(at(turnedFaces, 0).coords, P(turned, [[50, 104, 0], [80, 104, 0], [80, 104, 20], [50, 104, 20]]));
    expectSamePoints(at(turnedFaces, 1).coords, P(turned, [[50, 60, 0], [50, 104, 0], [50, 104, 20], [50, 60, 20]]));
    expectSamePoints(at(turnedFaces, 2).coords, P(turned, [[50, 60, 20], [80, 60, 20], [80, 104, 20], [50, 104, 20]]));
  });

  it('colours a selected prism\'s sides a400 on back and front and a300 on right and left', () => {
    const faces = faceFills(draw(input({ items: [{ ...CRATE, rot: 1 }], selectedId: 'crate-1' })).paints);
    expect(faces.map((f) => f.style)).toEqual([T.a300, T.a400, T.a200]);
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
