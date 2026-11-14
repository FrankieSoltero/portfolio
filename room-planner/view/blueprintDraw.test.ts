import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import type { CameraState, Conflicts, Item, Units } from '../domain/types';
import type { Tokens } from '../styles/tokens';
import { computeCameraPose } from './camera';
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
}

interface Text { index: number; text: string; x: number; y: number; fillStyle: unknown; font: unknown;
  align: unknown; baseline: unknown }

interface Rect { index: number; args: unknown[]; fillStyle: unknown }

/** Replays the log, tracking context state, into paints, texts and filled rects. */
function replay(log: readonly Rec[]): { paints: Paint[]; texts: Text[]; rects: Rect[] } {
  const state: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1 };
  let dash: unknown = [];
  let path = -1;
  let points = 0;
  const paints: Paint[] = [];
  const texts: Text[] = [];
  const rects: Rect[] = [];
  log.forEach((r, index) => {
    if (r.type === 'set') { state[r.name] = r.value; return; }
    switch (r.name) {
      case 'beginPath': path++; points = 0; break;
      case 'moveTo': case 'lineTo': points++; break;
      case 'setLineDash': dash = r.args[0]; break;
      case 'fill': case 'stroke':
        paints.push({ op: r.name, index, path, points,
          style: r.name === 'fill' ? state.fillStyle : state.strokeStyle,
          alpha: state.globalAlpha, lineWidth: state.lineWidth, dash });
        break;
      case 'fillText':
        texts.push({ index, text: String(r.args[0]), x: Number(r.args[1]), y: Number(r.args[2]),
          fillStyle: state.fillStyle, font: state.font, align: state.textAlign, baseline: state.textBaseline });
        break;
      case 'fillRect': rects.push({ index, args: r.args, fillStyle: state.fillStyle }); break;
    }
  });
  return { paints, texts, rects };
}

function seed(id: string): Item {
  const found = createInitialDocument().items.find((i) => i.id === id);
  if (!found) throw new Error(`missing seed item ${id}`);
  return found;
}

const RUG: Item = { ...seed('seed-bed'), id: 'rug-1', kind: 'rug', name: 'Wool rug', w: 60, d: 40, h: 1, x: 10, y: 10, rot: 0 };
const CRATE: Item = { ...seed('seed-bed'), id: 'crate-1', kind: 'box', name: 'Crate', w: 44, d: 30, h: 20, x: 50, y: 60, rot: 0 };

function input(over: Partial<{ items: readonly Item[]; selectedId: string | null; conflicts: Conflicts;
  units: Units; camera: CameraState }> = {}): BlueprintInput {
  const doc = createInitialDocument();
  const camera = over.camera ?? { ...CONFIG.camera };
  return {
    room: doc.room,
    items: over.items ?? doc.items,
    selectedId: over.selectedId ?? null,
    conflicts: over.conflicts ?? {},
    units: over.units ?? 'ft',
    pose: computeCameraPose(doc.room, camera, PANE),
    width: PANE.w,
    safeW: PANE.safeW,
    height: PANE.h,
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
});
