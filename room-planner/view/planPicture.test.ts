import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { planParts } from '../domain/furniture/planParts';
import { defaultStyle } from '../domain/furniture/recipe';
import { obstacleFootprint, obstaclePolygon } from '../domain/obstacles';
import { footprintCorners, itemFootprint, planPartOutline } from '../domain/shape';
import type { Conflicts, Corner, Door, Item, Obstacle, Opening, Point, Units, WindowOpening } from '../domain/types';
import { placedItem } from '../test/fixtures';
import { doorDrawing, windowDrawing } from './planFeatures';
import { labelBox, toPane } from './planLayout';
import { drawPlanPicture, PLAN_PICTURE_CREDIT, planPictureSize } from './planPicture';
import type { PlanPictureInput } from './planPicture';

/** Width of every character in the recording context's measureText, in pixels. */
const CHAR_W = 10;

/** A stand-in for Path2D, which jsdom does not have: it keeps the SVG path it was made from. */
class FakePath2D {
  constructor(readonly d?: string) {}
}

beforeAll(() => { vi.stubGlobal('Path2D', FakePath2D); });
afterAll(() => { vi.unstubAllGlobals(); });


type Rec =
  | { type: 'call'; name: string; args: unknown[] }
  | { type: 'set'; name: string; value: unknown };

/** A 2D context stand-in that records every method call and property set, in order. */
function recordingContext(): { g: CanvasRenderingContext2D; log: Rec[] } {
  const log: Rec[] = [];
  const proxy = new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string') return undefined;
      return (...args: unknown[]) => {
        log.push({ type: 'call', name, args });
        if (name === 'measureText') return { width: Array.from(String(args[0])).length * CHAR_W };
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

/** One painted path with the context state at the moment it was painted. */
interface Paint {
  op: 'fill' | 'stroke'; index: number; style: unknown; lineWidth: unknown; lineJoin: unknown;
  /** The context's globalAlpha when painted; 1 until it is set. */
  alpha: unknown;
  closed: boolean; coords: [number, number][]; args: unknown[];
}

interface Text {
  index: number; text: string; x: number; y: number; fillStyle: unknown; font: unknown;
  align: unknown; baseline: unknown; depth: number; translate: [number, number] | null; rotate: number | null;
}

interface Rect { index: number; args: unknown[]; fillStyle: unknown }

/** Replays the log, tracking context state, into paints, texts and filled rects. */
function replay(log: readonly Rec[]): { paints: Paint[]; texts: Text[]; rects: Rect[] } {
  const state: Record<string, unknown> = {};
  let coords: [number, number][] = [];
  let closed = false;
  let depth = 0;
  let translate: [number, number] | null = null;
  let rotate: number | null = null;
  const paints: Paint[] = [];
  const texts: Text[] = [];
  const rects: Rect[] = [];
  log.forEach((r, index) => {
    if (r.type === 'set') { state[r.name] = r.value; return; }
    switch (r.name) {
      case 'beginPath': coords = []; closed = false; break;
      case 'moveTo': case 'lineTo': coords.push([Number(r.args[0]), Number(r.args[1])]); break;
      case 'closePath': closed = true; break;
      case 'save': depth++; break;
      case 'restore': depth--; if (depth === 0) { translate = null; rotate = null; } break;
      case 'translate': translate = [Number(r.args[0]), Number(r.args[1])]; break;
      case 'rotate': rotate = Number(r.args[0]); break;
      case 'fill': case 'stroke':
        paints.push({ op: r.name, index, style: r.name === 'fill' ? state.fillStyle : state.strokeStyle,
          lineWidth: state.lineWidth, lineJoin: state.lineJoin, alpha: state.globalAlpha ?? 1, closed, coords: [...coords], args: r.args });
        break;
      case 'fillText':
        texts.push({ index, text: String(r.args[0]), x: Number(r.args[1]), y: Number(r.args[2]),
          fillStyle: state.fillStyle, font: state.font, align: state.textAlign, baseline: state.textBaseline,
          depth, translate, rotate });
        break;
      case 'fillRect': rects.push({ index, args: r.args, fillStyle: state.fillStyle }); break;
    }
  });
  return { paints, texts, rects };
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`no element at ${i}`);
  return v;
}

/** The 144 × 168 in room of the golden size values. */
const RECT: readonly Corner[] = [
  { id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 144, y: 0 }, { id: 'c3', x: 144, y: 168 }, { id: 'c4', x: 0, y: 168 },
];
/** The same room with its corners in the opposite order. */
const RECT_REVERSED: readonly Corner[] = [...RECT].reverse();
/** An L-shaped room in the same bounding box; the notch is at the bottom right. */
const L_ROOM: readonly Corner[] = [
  { id: 'l1', x: 0, y: 0 }, { id: 'l2', x: 144, y: 0 }, { id: 'l3', x: 144, y: 96 }, { id: 'l4', x: 72, y: 96 },
  { id: 'l5', x: 72, y: 168 }, { id: 'l6', x: 0, y: 168 },
];
/** The golden layout: scale 10, origin at (160, 160). */
const LAYOUT = { scale: 10, ox: 160, oy: 160 };

const SOFA = placedItem({ id: 'sofa-1', kind: 'sofa', name: 'Sofa', w: 80, d: 36, h: 30, cx: 60, cy: 40 });
const RUG = placedItem({ id: 'rug-1', kind: 'rug', name: 'Rug', w: 60, d: 40, h: 1, cx: 72, cy: 90 });
const DESK = placedItem({ id: 'desk-1', kind: 'desk', name: 'Desk', w: 48, d: 24, h: 30, cx: 100, cy: 140, angle: 30 });
const BOX: Obstacle = { id: 'ob-1', shape: 'box', label: 'Radiator', x: 20, y: 120, rotation: 0, width: 24,
  depth: 10, height: 30, elevation: 0 };
const COLUMN: Obstacle = { id: 'ob-2', shape: 'cylinder', label: '', x: 120, y: 60, rotation: 0, width: 12,
  depth: 12, height: 96, elevation: 0 };
const DOOR: Door = { id: 'd-1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
const WINDOW: WindowOpening = { id: 'w-1', kind: 'window', wallId: 'c2', offset: 40, width: 36, sill: 36, height: 48 };

function input(over: Partial<{ outline: readonly Corner[]; items: readonly Item[]; openings: readonly Opening[];
  obstacles: readonly Obstacle[]; conflicts: Conflicts; units: Units }> = {}): PlanPictureInput {
  return {
    outline: over.outline ?? RECT,
    items: over.items ?? [],
    openings: over.openings ?? [],
    obstacles: over.obstacles ?? [],
    conflicts: over.conflicts ?? {},
    units: over.units ?? 'ft',
  };
}

function draw(inp: PlanPictureInput) {
  const { g, log } = recordingContext();
  drawPlanPicture(g, inp);
  return { log, ...replay(log) };
}

function pane(pts: readonly Point[]): [number, number][] {
  return pts.map((p) => {
    const q = toPane(p, LAYOUT);
    return [q.x, q.y];
  });
}

/** The same pane points in the same order, to 6 decimal places. */
function expectPoints(actual: readonly [number, number][], expected: readonly [number, number][]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((q, i) => {
    expect(q[0]).toBeCloseTo(expected[i]?.[0] ?? NaN, 6);
    expect(q[1]).toBeCloseTo(expected[i]?.[1] ?? NaN, 6);
  });
}

function itemPane(item: Item): [number, number][] {
  return pane(footprintCorners(itemFootprint(item)));
}

/** Each plan part's outline of the item, in pane pixels, lowest top first. */
function partPanes(item: Item): [number, number][][] {
  return planParts(item).map((part) => pane(planPartOutline(itemFootprint(item), part)));
}

/** The paints whose path runs through exactly these points. */
function paintsAt(paints: readonly Paint[], coords: readonly [number, number][]): Paint[] {
  const key = (c: readonly [number, number][]) => c.map((q) => `${q[0].toFixed(6)},${q[1].toFixed(6)}`).join(' ');
  return paints.filter((p) => key(p.coords) === key(coords));
}

describe('planPictureSize', () => {
  it('gives scale 10, 1760 × 2000 and origin (160, 160) for the 144 × 168 room', () => {
    expect(planPictureSize(RECT)).toEqual({ width: 1760, height: 2000, layout: { scale: 10, ox: 160, oy: 160 } });
  });

  it('fits the longer side into 1680 px and moves the bounds\' min corner to (160, 160)', () => {
    const outline = [{ x: -20, y: 10 }, { x: 220, y: 10 }, { x: 220, y: 130 }, { x: -20, y: 130 }];
    expect(planPictureSize(outline)).toEqual({ width: 2000, height: 1160, layout: { scale: 7, ox: 300, oy: 90 } });
  });

  it('rounds the scaled sides to whole pixels', () => {
    const outline = [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 169 }, { x: 0, y: 169 }];
    const s = planPictureSize(outline);
    expect(s.layout.scale).toBeCloseTo(1680 / 169, 12);
    expect(s.width).toBe(Math.round(144 * (1680 / 169)) + 320);
    expect(s.width).toBe(1751);
    expect(s.height).toBe(2000);
  });
});

describe('drawPlanPicture', () => {
  it('exports the credit line exactly', () => {
    expect(PLAN_PICTURE_CREDIT).toBe('Room Planner · frankiesoltero.com/room-planner');
  });

  it('1. fills the whole canvas white before anything else', () => {
    const { rects, paints, texts } = draw(input());
    expect(rects).toHaveLength(1);
    const page = at(rects, 0);
    expect(page.args).toEqual([0, 0, 1760, 2000]);
    expect(page.fillStyle).toBe('#ffffff');
    expect(page.index).toBeLessThan(Math.min(...paints.map((p) => p.index), ...texts.map((t) => t.index)));
  });

  it('2. fills the closed outline with the floor colour', () => {
    const { paints } = draw(input());
    const floor = at(paints, 0);
    expect(floor.op).toBe('fill');
    expect(floor.style).toBe('#f7f5f0');
    expect(floor.closed).toBe(true);
    expectPoints(floor.coords, [[160, 160], [1600, 160], [1600, 1840], [160, 1840]]);
  });

  it('3. fills and strokes every turned footprint, then strokes its parts, rugs first, each group in stored order', () => {
    const { paints } = draw(input({ items: [SOFA, RUG, DESK] }));
    let k = 1;
    for (const item of [RUG, SOFA, DESK]) {
      const [fill, stroke] = [at(paints, k), at(paints, k + 1)];
      expect([fill.op, stroke.op]).toEqual(['fill', 'stroke']);
      expectPoints(fill.coords, itemPane(item));
      expect(fill.closed).toBe(true);
      expect(fill.style).toBe('#e4e8ee');
      expect(stroke.coords).toEqual(fill.coords);
      expect([stroke.style, stroke.lineWidth, stroke.alpha]).toEqual(['#3d4a63', 3, 1]);
      const parts = partPanes(item);
      expect(parts.length).toBeGreaterThanOrEqual(1);
      parts.forEach((coords, j) => {
        const part = at(paints, k + 2 + j);
        expect([part.op, part.style, part.lineWidth, part.alpha, part.closed]).toEqual(['stroke', '#3d4a63', 3, 0.4, true]);
        expectPoints(part.coords, coords);
      });
      k += 2 + parts.length;
    }
    expect(at(paints, k)).toMatchObject({ op: 'stroke', style: '#1a1c2c', lineWidth: 10, alpha: 1 });
  });

  it('3. strokes one path per plan part of a sofa at 40% opacity after its footprint, then restores the opacity', () => {
    const { paints, log } = draw(input({ items: [SOFA] }));
    const parts = partPanes(SOFA);
    expect(parts.length).toBeGreaterThan(1);
    const strokes = paints.slice(3, 3 + parts.length);
    expect(strokes.map((p) => [p.op, p.alpha])).toEqual(parts.map(() => ['stroke', 0.4]));
    strokes.forEach((p, j) => expectPoints(p.coords, at(parts, j)));
    // The footprint is filled and stroked as before, at full opacity.
    expectPoints(at(paints, 1).coords, itemPane(SOFA));
    expect([at(paints, 1).op, at(paints, 1).alpha, at(paints, 2).op, at(paints, 2).alpha]).toEqual(['fill', 1, 'stroke', 1]);
    // globalAlpha is back to 1 before anything else is painted.
    const lastPart = at(strokes, strokes.length - 1).index;
    const alphaSets = log.filter((r, i) => i > lastPart && r.type === 'set' && r.name === 'globalAlpha');
    expect(alphaSets[0]).toEqual({ type: 'set', name: 'globalAlpha', value: 1 });
    expect(paints.slice(3 + parts.length).every((p) => p.alpha === 1)).toBe(true);
  });

  it('3. fills and strokes a round rug with a border as its ellipse, then strokes only its inner part', () => {
    const round: Item = { ...RUG, style: { ...defaultStyle('rug'), shape: 'round' } };
    const [outer, inner, ...rest] = planParts(round);
    if (!outer || !inner) throw new Error('a bordered round rug has two parts');
    expect(rest).toEqual([]);
    const fp = itemFootprint(round);
    const ellipse = pane(planPartOutline(fp, outer));
    const { paints } = draw(input({ items: [round] }));
    const [fill, stroke, part, walls] = [at(paints, 1), at(paints, 2), at(paints, 3), at(paints, 4)];
    expect(fill.coords).toHaveLength(16);
    expectPoints(fill.coords, ellipse);
    expect([fill.op, fill.style, fill.closed]).toEqual(['fill', '#e4e8ee', true]);
    expect([stroke.op, stroke.style, stroke.alpha]).toEqual(['stroke', '#3d4a63', 1]);
    expectPoints(stroke.coords, ellipse);
    expect([part.op, part.alpha]).toEqual(['stroke', 0.4]);
    expectPoints(part.coords, pane(planPartOutline(fp, inner)));
    expect([walls.op, walls.lineWidth]).toEqual(['stroke', 10]);
    expect(paintsAt(paints, itemPane(round))).toEqual([]);
  });

  it('3. fills a round table on legs as its top\'s ellipse and strokes its other parts on it', () => {
    const table: Item = { ...placedItem({ id: 'table-1', kind: 'table', name: 'Table', w: 44, d: 24, h: 16, cx: 72, cy: 84 }),
      style: { ...defaultStyle('table'), top: 'round' } };
    const fp = itemFootprint(table);
    const parts = planParts(table);
    const top = parts.find((p) => p.round && p.rect.join() === '0,1,0,1');
    if (!top) throw new Error('no round top');
    const others = parts.filter((p) => p !== top);
    expect(others.length).toBeGreaterThan(1);
    const { paints } = draw(input({ items: [table] }));
    expectPoints(at(paints, 1).coords, pane(planPartOutline(fp, top)));
    expect(at(paints, 1).op).toBe('fill');
    others.forEach((p, j) => {
      const stroke = at(paints, 3 + j);
      expect([stroke.op, stroke.alpha]).toEqual(['stroke', 0.4]);
      expectPoints(stroke.coords, pane(planPartOutline(fp, p)));
    });
    expect(at(paints, 3 + others.length).lineWidth).toBe(10);
  });

  it('3. fills a rectangle rug with a border as its rectangle and strokes both its parts', () => {
    const { paints } = draw(input({ items: [RUG] }));
    expectPoints(at(paints, 1).coords, itemPane(RUG));
    const parts = partPanes(RUG);
    expect(parts).toHaveLength(2);
    parts.forEach((coords, j) => {
      expect(at(paints, 3 + j).alpha).toBe(0.4);
      expectPoints(at(paints, 3 + j).coords, coords);
    });
  });

  it('3. paints a conflicting item in the conflict colours', () => {
    const { paints } = draw(input({ items: [SOFA, DESK], conflicts: { 'desk-1': 'Overlaps the sofa.' } }));
    const [fill, stroke] = paintsAt(paints, itemPane(DESK));
    expect(fill?.style).toBe('#fbdada');
    expect(stroke?.style).toBe('#b3261e');
    expect(stroke?.lineWidth).toBe(3);
    const [sofaFill, sofaStroke] = paintsAt(paints, itemPane(SOFA));
    expect(sofaFill?.style).toBe('#e4e8ee');
    expect(sofaStroke?.style).toBe('#3d4a63');
    // A conflicting item's parts are stroked in its outline's conflict colour, at 40% opacity.
    for (const coords of partPanes(DESK)) {
      const strokes = paintsAt(paints, coords).filter((p) => p.alpha === 0.4);
      expect(strokes.map((p) => [p.op, p.style])).toEqual([['stroke', '#b3261e']]);
    }
  });

  it('4. fills and strokes every obstacle polygon after the furniture', () => {
    const { paints } = draw(input({ items: [SOFA], obstacles: [BOX, COLUMN] }));
    const first = 3 + partPanes(SOFA).length;
    const obstacles = paints.slice(first, first + 4);
    [BOX, COLUMN].forEach((o, k) => {
      const [fill, stroke] = [at(obstacles, 2 * k), at(obstacles, 2 * k + 1)];
      expectPoints(fill.coords, pane(obstaclePolygon(o)));
      expect(fill.closed).toBe(true);
      expect([fill.op, fill.style]).toEqual(['fill', '#c5cad3']);
      expect([stroke.op, stroke.style, stroke.lineWidth]).toEqual(['stroke', '#3d4a63', 3]);
      expect(stroke.coords).toEqual(fill.coords);
    });
    expect(at(obstacles, 2).coords).toHaveLength(16);
  });

  it('4. paints a conflicting obstacle in the conflict colours', () => {
    const { paints } = draw(input({ obstacles: [BOX, COLUMN], conflicts: { 'ob-2': 'Blocks the door.' } }));
    const [fill, stroke] = paintsAt(paints, pane(obstaclePolygon(COLUMN)));
    expect(fill?.style).toBe('#fbdada');
    expect(stroke?.style).toBe('#b3261e');
    const [boxFill, boxStroke] = paintsAt(paints, pane(obstaclePolygon(BOX)));
    expect(boxFill?.style).toBe('#c5cad3');
    expect(boxStroke?.style).toBe('#3d4a63');
  });

  it('5. strokes the closed outline as walls, width 10 with mitred joins, after the obstacles', () => {
    const { paints } = draw(input({ items: [SOFA], obstacles: [BOX] }));
    const walls = at(paints, 5 + partPanes(SOFA).length);
    expect(paints).toHaveLength(6 + partPanes(SOFA).length);
    expect([walls.op, walls.style, walls.lineWidth, walls.lineJoin, walls.closed])
      .toEqual(['stroke', '#1a1c2c', 10, 'miter', true]);
    expectPoints(walls.coords, [[160, 160], [1600, 160], [1600, 1840], [160, 1840]]);
  });

  it('6. draws each window\'s segment as a white gap, then as the window line', () => {
    const wd = windowDrawing(WINDOW, RECT, LAYOUT);
    if (!wd) throw new Error('window not on its wall');
    const { paints } = draw(input({ openings: [WINDOW] }));
    expect(paints).toHaveLength(4);
    const [gap, line] = [at(paints, 2), at(paints, 3)];
    expect([gap.op, gap.style, gap.lineWidth]).toEqual(['stroke', '#ffffff', 10]);
    expect([line.op, line.style, line.lineWidth]).toEqual(['stroke', '#2f6fb0', 4]);
    expectPoints(gap.coords, [[wd.a.x, wd.a.y], [wd.b.x, wd.b.y]]);
    expectPoints(line.coords, [[wd.a.x, wd.a.y], [wd.b.x, wd.b.y]]);
  });

  it('7. draws each door\'s gap, its leaf, then its arc through Path2D, after the windows', () => {
    const dd = doorDrawing(DOOR, RECT, LAYOUT);
    if (!dd) throw new Error('door not on its wall');
    const { paints } = draw(input({ openings: [DOOR, WINDOW] }));
    expect(paints).toHaveLength(7);
    const [gap, leaf, arc] = [at(paints, 4), at(paints, 5), at(paints, 6)];
    expect([gap.op, gap.style, gap.lineWidth]).toEqual(['stroke', '#ffffff', 10]);
    expectPoints(gap.coords, dd.gap.map((p): [number, number] => [p.x, p.y]));
    expect([leaf.op, leaf.style, leaf.lineWidth]).toEqual(['stroke', '#1a1c2c', 3]);
    expectPoints(leaf.coords, dd.leaf.map((p): [number, number] => [p.x, p.y]));
    expect([arc.op, arc.style, arc.lineWidth]).toEqual(['stroke', '#1a1c2c', 2]);
    const path = arc.args[0];
    expect(path).toBeInstanceOf(FakePath2D);
    expect((path as FakePath2D).d).toBe(dd.arc);
  });

  it('skips an opening whose wall is missing', () => {
    const lost: Opening[] = [{ ...DOOR, wallId: 'gone' }, { ...WINDOW, wallId: 'gone' }];
    const bare = draw(input()).log;
    expect(draw(input({ openings: [DOOR] })).log).not.toEqual(bare);
    expect(draw(input({ openings: [WINDOW] })).log).not.toEqual(bare);
    expect(draw(input({ openings: lost })).log).toEqual(bare);
  });

  it('8. writes each item\'s name centred on its footprint, turned by labelBox, after the doors', () => {
    const { paints, texts } = draw(input({ items: [SOFA, DESK], openings: [DOOR] }));
    const lastPaint = Math.max(...paints.map((p) => p.index));
    const names = texts.slice(0, 2);
    [SOFA, DESK].forEach((item, k) => {
      const t = at(names, k);
      const fp = itemFootprint(item);
      const c = toPane({ x: fp.cx, y: fp.cy }, LAYOUT);
      expect(t.text).toBe(item.name);
      expect([t.x, t.y]).toEqual([0, 0]);
      expect(t.translate?.[0]).toBeCloseTo(c.x, 6);
      expect(t.translate?.[1]).toBeCloseTo(c.y, 6);
      expect(t.rotate).toBeCloseTo((labelBox(fp, LAYOUT).rotateDeg * Math.PI) / 180, 12);
      expect([t.font, t.align, t.baseline, t.fillStyle])
        .toEqual(['500 26px Barlow, sans-serif', 'center', 'middle', '#1a1c2c']);
      expect(t.index).toBeGreaterThan(lastPaint);
    });
    expect(at(names, 1).rotate).toBeCloseTo((30 * Math.PI) / 180, 12);
  });

  it('8. turns a name by the label box\'s tilt, not the item\'s whole angle', () => {
    const turned = placedItem({ id: 't', name: 'Bench', w: 40, d: 20, h: 18, cx: 72, cy: 84, angle: 100 });
    const t = at(draw(input({ items: [turned] })).texts, 0);
    expect(t.rotate).toBeCloseTo((10 * Math.PI) / 180, 12);
  });

  it('8. writes a non-empty obstacle label after the item names, and none for an empty label', () => {
    const { texts } = draw(input({ items: [SOFA], obstacles: [BOX, COLUMN] }));
    const names = texts.filter((t) => t.font === '500 26px Barlow, sans-serif');
    expect(names.map((t) => t.text)).toEqual(['Sofa', 'Radiator']);
    const box = at(names, 1);
    const c = toPane({ x: BOX.x, y: BOX.y }, LAYOUT);
    expect(box.translate?.[0]).toBeCloseTo(c.x, 6);
    expect(box.translate?.[1]).toBeCloseTo(c.y, 6);
    expect(box.rotate).toBeCloseTo((labelBox(obstacleFootprint(BOX), LAYOUT).rotateDeg * Math.PI) / 180, 12);
    expect([box.align, box.baseline, box.fillStyle]).toEqual(['center', 'middle', '#1a1c2c']);
  });

  it('8. writes a conflicting item\'s or obstacle\'s name in the conflict colour', () => {
    const { texts } = draw(input({ items: [SOFA, DESK], obstacles: [BOX],
      conflicts: { 'desk-1': 'Overlaps.', 'ob-1': 'Overlaps.' } }));
    const colour = (text: string) => texts.find((t) => t.text === text)?.fillStyle;
    expect(colour('Sofa')).toBe('#1a1c2c');
    expect(colour('Desk')).toBe('#b3261e');
    expect(colour('Radiator')).toBe('#b3261e');
  });

  describe('8. fitting a name to the label box width less 16 px', () => {
    // A 30 in wide item at scale 10 has a 300 px label box: names up to 284 px (28 characters) fit.
    const named = (name: string, w = 30, d = 10, angle = 0) =>
      placedItem({ id: 'n', name, w, d, h: 10, cx: 72, cy: 84, angle });
    const nameOf = (item: Item) => draw(input({ items: [item] })).texts.filter((t) => t.font === '500 26px Barlow, sans-serif');

    it('keeps a name that just fits', () => {
      const name = 'A'.repeat(28);
      expect(nameOf(named(name)).map((t) => t.text)).toEqual([name]);
    });

    it('cuts a name that is too wide and ends it with …', () => {
      const name = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD';
      expect(nameOf(named(name)).map((t) => t.text)).toEqual([`${name.slice(0, 27)}…`]);
    });

    it('uses the label box width, which swaps to the depth at a quarter turn', () => {
      // At 90° the box is 10 in × 10 = 100 px wide: 84 px fits 8 characters, so 7 plus the ….
      expect(nameOf(named('Bookshelf unit', 30, 10, 90)).map((t) => t.text)).toEqual(['Bookshe…']);
    });

    it('draws nothing when not even one character and … fit', () => {
      // 3 in at scale 10 is 30 px, less 16 leaves 14 px: one character fits, two do not.
      expect(nameOf(named('A', 3)).map((t) => t.text)).toEqual(['A']);
      expect(nameOf(named('AB', 3))).toEqual([]);
    });

    it('cuts an obstacle label the same way', () => {
      const shelf: Obstacle = { ...BOX, label: 'Built-in shelving', width: 10 };
      const { texts } = draw(input({ obstacles: [shelf] }));
      // 100 px less 16 leaves 84 px: 7 characters and the ….
      expect(texts.filter((t) => t.font === '500 26px Barlow, sans-serif').map((t) => t.text)).toEqual(['Built-i…']);
    });
  });

  it('9. writes every wall\'s length level, clear of the wall outside its midpoint, after the names', () => {
    const { texts } = draw(input({ items: [SOFA] }));
    const name = at(texts, 0);
    const lengths = texts.filter((t) => t.font === '600 28px Barlow, sans-serif');
    // Level walls: 33 px out. Upright walls: 19 px plus half the 60 px text, so 49 px out.
    expect(lengths.map((t) => [t.text, t.x, t.y])).toEqual([
      ['12′ 0″', 880, 127], ['14′ 0″', 1649, 1000], ['12′ 0″', 880, 1873], ['14′ 0″', 111, 1000],
    ]);
    for (const t of lengths) {
      expect([t.align, t.baseline, t.fillStyle, t.depth, t.rotate]).toEqual(['center', 'middle', '#1a1c2c', 0, null]);
      expect(t.index).toBeGreaterThan(name.index);
    }
  });

  it('9. finds the outside of each wall from the room, not from the corner order', () => {
    const lengths = draw(input({ outline: RECT_REVERSED })).texts.filter((t) => t.font === '600 28px Barlow, sans-serif');
    expect(lengths.map((t) => [t.x, t.y]).sort()).toEqual([[111, 1000], [1649, 1000], [880, 127], [880, 1873]].sort());
  });

  it('9. puts the lengths of an L-shaped room\'s notch walls in the notch', () => {
    const lengths = draw(input({ outline: L_ROOM, units: 'm' })).texts
      .filter((t) => t.font === '600 28px Barlow, sans-serif');
    expect(lengths.map((t) => [t.text, t.x, t.y])).toEqual([
      ['3.66 m', 880, 127], ['2.44 m', 1649, 640], ['1.83 m', 1240, 1153], ['1.83 m', 929, 1480],
      ['1.83 m', 520, 1873], ['4.27 m', 111, 1000],
    ]);
  });

  describe('9. a wall length\'s distance from its wall', () => {
    /** A right triangle whose long wall runs at 45°, with the room below and to its left. */
    const TRIANGLE: readonly Corner[] = [{ id: 't1', x: 0, y: 0 }, { id: 't2', x: 144, y: 0 }, { id: 't3', x: 0, y: 144 }];
    /** A five-sided room with no level or upright wall. */
    const PENTAGON: readonly Corner[] = [
      { id: 'p1', x: 0, y: 0 }, { id: 'p2', x: 150, y: 20 }, { id: 'p3', x: 170, y: 120 }, { id: 'p4', x: 60, y: 160 },
      { id: 'p5', x: -10, y: 90 },
    ];

    /** Each wall's length text with the wall's two ends and midpoint in pane pixels, in outline order. */
    function labelled(outline: readonly Corner[]) {
      const { texts, log } = draw(input({ outline }));
      const { layout } = planPictureSize(outline);
      const lengths = texts.filter((t) => t.font === '600 28px Barlow, sans-serif');
      expect(lengths).toHaveLength(outline.length);
      return {
        log,
        walls: lengths.map((t, i) => {
          const a = toPane(at(outline, i), layout);
          const b = toPane(at(outline, (i + 1) % outline.length), layout);
          return { t, a, b, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, width: Array.from(t.text).length * CHAR_W };
        }),
      };
    }

    /** Signed distance of `p` from the line through a and b, in pane pixels. */
    function side(a: Point, b: Point, p: Point): number {
      return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
    }

    it('puts a level wall\'s length 33 px outside its midpoint', () => {
      const top = at(labelled(RECT).walls, 0);
      expect([top.t.x, top.t.y]).toEqual([top.mid.x, top.mid.y - 33]);
      const bottom = at(labelled(RECT).walls, 2);
      expect([bottom.t.x, bottom.t.y]).toEqual([bottom.mid.x, bottom.mid.y + 33]);
    });

    it('puts an upright wall\'s length 19 px plus half its measured width outside its midpoint', () => {
      const { walls, log } = labelled(L_ROOM);
      // 8′ 0″ and 6′ 0″ are 50 px wide in the recording context, 14′ 0″ is 60 px.
      const right = at(walls, 1);
      expect([right.t.text, right.width]).toEqual(['8′ 0″', 50]);
      expect([right.t.x, right.t.y]).toEqual([right.mid.x + 19 + 25, right.mid.y]);
      const notch = at(walls, 3);
      expect([notch.t.x, notch.t.y]).toEqual([notch.mid.x + 19 + 25, notch.mid.y]);
      const left = at(walls, 5);
      expect([left.t.text, left.width]).toEqual(['14′ 0″', 60]);
      expect([left.t.x, left.t.y]).toEqual([left.mid.x - 19 - 30, left.mid.y]);
      // The width is measured in the wall-length font.
      const measured = log.findIndex((r) => r.type === 'call' && r.name === 'measureText' && r.args[0] === right.t.text);
      expect(measured).toBeGreaterThan(-1);
      const fontAt = log.slice(0, measured).filter((r) => r.type === 'set' && r.name === 'font').pop();
      expect(fontAt?.type === 'set' ? fontAt.value : null).toBe('600 28px Barlow, sans-serif');
    });

    it('puts a 45° wall\'s length 19 + (half its width + 14) × √½ px outside its midpoint', () => {
      const slope = at(labelled(TRIANGLE).walls, 1);
      const offset = 19 + Math.SQRT1_2 * (slope.width / 2) + Math.SQRT1_2 * 14;
      expect(slope.t.x).toBeCloseTo(slope.mid.x + Math.SQRT1_2 * offset, 6);
      expect(slope.t.y).toBeCloseTo(slope.mid.y + Math.SQRT1_2 * offset, 6);
    });

    it.each([
      ['the rectangle', RECT], ['the reversed rectangle', RECT_REVERSED], ['the L-shaped room', L_ROOM],
      ['the triangle', TRIANGLE], ['the pentagon', PENTAGON],
    ] as const)('in %s, no edge of a length\'s text box is closer than 19 px to its wall line', (_, outline) => {
      for (const { t, a, b, width } of labelled(outline).walls) {
        const centre = side(a, b, t);
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx = 0, sy = 0]) =>
          side(a, b, { x: t.x + (sx * width) / 2, y: t.y + sy * 14 }) * Math.sign(centre));
        // Every corner is on the centre's side of the line, and the nearest is exactly 19 px from it.
        expect(Math.min(...corners)).toBeGreaterThanOrEqual(19 - 1e-9);
        expect(Math.min(...corners)).toBeCloseTo(19, 6);
      }
    });
  });

  it('10. writes the credit last, left-aligned at (160, height − 36)', () => {
    const { texts, log } = draw(input({ items: [SOFA], obstacles: [BOX], openings: [DOOR, WINDOW] }));
    const credit = at(texts, texts.length - 1);
    expect([credit.text, credit.x, credit.y, credit.align, credit.font, credit.fillStyle])
      .toEqual([PLAN_PICTURE_CREDIT, 160, 1964, 'left', '400 22px Barlow, sans-serif', '#6b7280']);
    const lastDraw = log.reduce((m, r, i) => (r.type === 'call' && ['fill', 'stroke', 'fillText', 'fillRect'].includes(r.name) ? i : m), -1);
    expect(credit.index).toBe(lastDraw);
  });

  it('10. sets the credit\'s own baseline, middle, after the wall lengths', () => {
    const { texts, log } = draw(input());
    const credit = at(texts, texts.length - 1);
    expect(credit.baseline).toBe('middle');
    const lastLength = Math.max(...texts.filter((t) => t.font === '600 28px Barlow, sans-serif').map((t) => t.index));
    const baselineSet = log.findLastIndex((r, i) => i < credit.index && r.type === 'set' && r.name === 'textBaseline');
    expect(baselineSet).toBeGreaterThan(lastLength);
  });

  it('draws the steps in order: page, floor, furniture, obstacles, walls, windows, doors, names, lengths, credit', () => {
    const { rects, paints, texts } = draw(input({ items: [SOFA, RUG], obstacles: [BOX], openings: [DOOR, WINDOW] }));
    const step = [
      at(rects, 0).index,
      at(paints, 0).index,
      paintsAt(paints, itemPane(RUG))[0]?.index,
      paintsAt(paints, itemPane(SOFA))[0]?.index,
      paintsAt(paints, pane(obstaclePolygon(BOX)))[0]?.index,
      paints.find((p) => p.lineWidth === 10 && p.style === '#1a1c2c')?.index,
      paints.find((p) => p.style === '#2f6fb0')?.index,
      paints.find((p) => p.lineWidth === 3 && p.style === '#1a1c2c')?.index,
      texts.find((t) => t.text === 'Rug')?.index,
      texts.find((t) => t.text === 'Radiator')?.index,
      texts.find((t) => t.font === '600 28px Barlow, sans-serif')?.index,
      texts.find((t) => t.text === PLAN_PICTURE_CREDIT)?.index,
    ];
    step.forEach((s) => expect(s).toBeTypeOf('number'));
    expect([...step].sort((a, b) => Number(a) - Number(b))).toEqual(step);
  });

  it('uses no selection colour: every colour is one of the picture\'s own', () => {
    const { log } = draw(input({ items: [SOFA, RUG, DESK], obstacles: [BOX, COLUMN], openings: [DOOR, WINDOW],
      conflicts: { 'desk-1': 'x', 'ob-2': 'y' } }));
    const palette = ['#ffffff', '#f7f5f0', '#e4e8ee', '#3d4a63', '#c5cad3', '#fbdada', '#b3261e', '#1a1c2c',
      '#2f6fb0', '#6b7280'];
    const colours = log.filter((r) => r.type === 'set' && (r.name === 'fillStyle' || r.name === 'strokeStyle'))
      .map((r) => (r.type === 'set' ? r.value : null));
    expect(colours.length).toBeGreaterThan(0);
    expect(colours.every((c) => palette.includes(String(c)))).toBe(true);
  });

  it('restores every save and leaves no transform on the context', () => {
    const { log } = draw(input({ items: [SOFA, RUG, DESK], obstacles: [BOX, COLUMN], openings: [DOOR, WINDOW] }));
    let depth = 0;
    let saves = 0;
    for (const r of log) {
      if (r.type !== 'call') continue;
      if (r.name === 'save') { depth++; saves++; }
      if (r.name === 'restore') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
      if (['translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform'].includes(r.name)) {
        expect(depth).toBeGreaterThan(0);
      }
    }
    expect(saves).toBeGreaterThan(0);
    expect(depth).toBe(0);
  });
});
